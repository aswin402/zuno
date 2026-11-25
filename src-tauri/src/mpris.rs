#![cfg(target_os = "linux")]

use gio::prelude::*;
use glib::variant::ObjectPath;
use std::fs;
use std::path::PathBuf;
use std::sync::{Arc, Mutex};
use std::time::Duration;
use tauri::AppHandle;
use zuno_audio::ZunoService;
use zuno_core::ipc::IpcRequest;
use zuno_core::{PlayState, PlaybackStatus, RepeatMode, Track};

const MPRIS_BUS_NAME: &str = "org.mpris.MediaPlayer2.zuno";
const MPRIS_OBJECT_PATH: &str = "/org/mpris/MediaPlayer2";
const ROOT_IFACE: &str = "org.mpris.MediaPlayer2";
const PLAYER_IFACE: &str = "org.mpris.MediaPlayer2.Player";
const PROPS_IFACE: &str = "org.freedesktop.DBus.Properties";

const MPRIS_INTROSPECTION_XML: &str = r#"
<node>
  <interface name="org.mpris.MediaPlayer2">
    <method name="Raise"/>
    <method name="Quit"/>
    <property name="CanQuit" type="b" access="read"/>
    <property name="CanRaise" type="b" access="read"/>
    <property name="HasTrackList" type="b" access="read"/>
    <property name="Identity" type="s" access="read"/>
    <property name="DesktopEntry" type="s" access="read"/>
    <property name="SupportedUriSchemes" type="as" access="read"/>
    <property name="SupportedMimeTypes" type="as" access="read"/>
  </interface>
  <interface name="org.mpris.MediaPlayer2.Player">
    <method name="Next"/>
    <method name="Previous"/>
    <method name="Pause"/>
    <method name="PlayPause"/>
    <method name="Stop"/>
    <method name="Play"/>
    <method name="Seek">
      <arg name="Offset" type="x" direction="in"/>
    </method>
    <method name="SetPosition">
      <arg name="TrackId" type="o" direction="in"/>
      <arg name="Position" type="x" direction="in"/>
    </method>
    <method name="OpenUri">
      <arg name="Uri" type="s" direction="in"/>
    </method>
    <signal name="Seeked">
      <arg name="Position" type="x"/>
    </signal>
    <property name="PlaybackStatus" type="s" access="read"/>
    <property name="LoopStatus" type="s" access="readwrite"/>
    <property name="Rate" type="d" access="readwrite"/>
    <property name="Shuffle" type="b" access="readwrite"/>
    <property name="Metadata" type="a{sv}" access="read"/>
    <property name="Volume" type="d" access="readwrite"/>
    <property name="Position" type="x" access="read"/>
    <property name="MinimumRate" type="d" access="read"/>
    <property name="MaximumRate" type="d" access="read"/>
    <property name="CanGoNext" type="b" access="read"/>
    <property name="CanGoPrevious" type="b" access="read"/>
    <property name="CanPlay" type="b" access="read"/>
    <property name="CanPause" type="b" access="read"/>
    <property name="CanSeek" type="b" access="read"/>
    <property name="CanControl" type="b" access="read"/>
  </interface>
</node>
"#;

#[derive(Default, Clone, PartialEq)]
struct MprisSnapshot {
    state: PlayState,
    track_id: Option<String>,
    duration_secs: u64,
    volume_pct: i32,
    shuffle: bool,
    repeat: RepeatMode,
}

struct CoverCache {
    track_id: Option<String>,
    art_url: Option<String>,
    last_file: Option<PathBuf>,
}

struct MprisShared {
    service: Arc<ZunoService>,
    connection: Mutex<Option<gio::DBusConnection>>,
    snapshot: Mutex<MprisSnapshot>,
    cover_cache: Mutex<CoverCache>,
}

impl MprisShared {
    fn art_url_for_track(&self, track: &Track) -> Option<String> {
        let mut cache = self.cover_cache.lock().unwrap();
        if cache.track_id.as_deref() == Some(track.id.as_str()) {
            return cache.art_url.clone();
        }

        // Remove previous per-track cover temp file so GNOME Shell refreshes album art cleanly.
        if let Some(old) = cache.last_file.take() {
            let _ = fs::remove_file(old);
        }

        let cache_dir = self.service.paths().cache_dir();
        let _ = fs::create_dir_all(&cache_dir);

        let art_path: Option<PathBuf> = if let Some(art) = self.service.extract_cover(&track.id) {
            let ext = match art.mime_type.as_str() {
                "image/png" => "png",
                "image/webp" => "webp",
                _ => "jpg",
            };
            let safe_id = sanitize_object_segment(&track.id);
            let target = cache_dir.join(format!("mpris-cover-{safe_id}.{ext}"));
            if fs::write(&target, &art.bytes).is_ok() {
                cache.last_file = Some(target.clone());
                Some(target)
            } else {
                None
            }
        } else {
            let fallback = cache_dir.join("mpris-default-icon.png");
            if !fallback.exists() {
                let _ = fs::write(&fallback, include_bytes!("../icons/icon.png"));
            }
            fallback.exists().then_some(fallback)
        };

        let url = art_path.map(|p| {
            glib::filename_to_uri(&p, None)
                .map(|u| u.to_string())
                .unwrap_or_else(|_| format!("file://{}", p.display()))
        });
        cache.track_id = Some(track.id.clone());
        cache.art_url = url.clone();
        url
    }

    fn metadata_variant(&self, status: &PlaybackStatus) -> glib::Variant {
        let art_url = status
            .current_track
            .as_ref()
            .and_then(|t| self.art_url_for_track(t));
        build_metadata_variant(status.current_track.as_ref(), art_url.as_deref())
    }

    fn emit_changes(&self) {
        let conn = {
            let guard = self.connection.lock().unwrap();
            match guard.as_ref() {
                Some(c) => c.clone(),
                None => return,
            }
        };

        let status = self.service.status();
        let next = MprisSnapshot {
            state: status.state,
            track_id: status.current_track.as_ref().map(|t| t.id.clone()),
            duration_secs: status
                .current_track
                .as_ref()
                .map(|t| t.duration_secs)
                .unwrap_or(0),
            volume_pct: (status.volume * 100.0).round() as i32,
            shuffle: status.shuffle,
            repeat: status.repeat,
        };

        let prev = {
            let mut guard = self.snapshot.lock().unwrap();
            if *guard == next {
                return;
            }
            let old = guard.clone();
            *guard = next.clone();
            old
        };

        let changed = glib::VariantDict::new(None);
        if prev.state != next.state {
            changed.insert("PlaybackStatus", playback_status_str(status.state));
        }
        if prev.track_id != next.track_id || prev.duration_secs != next.duration_secs {
            changed.insert_value("Metadata", &self.metadata_variant(&status));
        }
        if prev.volume_pct != next.volume_pct {
            changed.insert("Volume", status.volume as f64);
        }
        if prev.shuffle != next.shuffle {
            changed.insert("Shuffle", status.shuffle);
        }
        if prev.repeat != next.repeat {
            changed.insert("LoopStatus", loop_status_str(status.repeat));
        }

        // IMPORTANT: Use `Variant::tuple_from_iter` (NOT `(...).to_variant()`),
        // because `ToVariant for glib::Variant` boxes `changed.end()` into `v`,
        // which would emit `(svas)` instead of the D-Bus required `(sa{sv}as)`
        // and cause GNOME Shell / KDE / playerctl to silently drop every update!
        let payload = build_properties_changed_payload(PLAYER_IFACE, changed.end(), &[]);
        let _ = conn.emit_signal(
            None,
            MPRIS_OBJECT_PATH,
            PROPS_IFACE,
            "PropertiesChanged",
            Some(&payload),
        );
    }

    fn emit_seeked(&self, position_us: i64) {
        let conn = {
            let guard = self.connection.lock().unwrap();
            guard.clone()
        };
        if let Some(conn) = conn {
            let payload = (position_us,).to_variant();
            let _ = conn.emit_signal(
                None,
                MPRIS_OBJECT_PATH,
                PLAYER_IFACE,
                "Seeked",
                Some(&payload),
            );
        }
    }
}

/// Thread-safe handle allowing GUI / tray commands to flush MPRIS D-Bus updates immediately.
#[derive(Clone)]
pub struct MprisHandle {
    shared: Arc<MprisShared>,
}

impl MprisHandle {
    pub fn notify_change(&self) {
        let shared = Arc::clone(&self.shared);
        glib::MainContext::default().invoke(move || {
            shared.emit_changes();
        });
    }

    pub fn notify_seeked(&self, position_secs: f64) {
        let shared = Arc::clone(&self.shared);
        let pos_us = (position_secs.max(0.0) * 1_000_000.0).round() as i64;
        glib::MainContext::default().invoke(move || {
            shared.emit_seeked(pos_us);
        });
    }
}

fn build_metadata_variant(track: Option<&Track>, art_url: Option<&str>) -> glib::Variant {
    let dict = glib::VariantDict::new(None);
    if let Some(track) = track {
        let obj_path = format!("/org/zuno/track/{}", sanitize_object_segment(&track.id));
        if let Ok(path) = ObjectPath::try_from(obj_path) {
            dict.insert("mpris:trackid", path);
        }
        let length_us = (track.duration_secs as i64).saturating_mul(1_000_000);
        dict.insert("mpris:length", length_us);
        dict.insert("xesam:title", track.title.as_str());

        let artist = if track.artist.is_empty() || track.artist == "Unknown Artist" {
            if !track.folder.is_empty() {
                track.folder.clone()
            } else {
                "Unknown Artist".to_string()
            }
        } else {
            track.artist.clone()
        };
        dict.insert("xesam:artist", vec![artist]);

        if !track.album.is_empty() {
            dict.insert("xesam:album", track.album.as_str());
        } else if !track.folder.is_empty() {
            dict.insert("xesam:album", track.folder.as_str());
        }

        if let Some(url) = art_url {
            dict.insert("mpris:artUrl", url);
        }
    }
    dict.end()
}

fn build_properties_changed_payload(
    iface: &str,
    changed: glib::Variant,
    invalidated: &[&str],
) -> glib::Variant {
    glib::Variant::tuple_from_iter([
        iface.to_variant(),
        changed,
        invalidated.to_variant(),
    ])
}

/// Start native Linux MPRIS2 D-Bus media integration on the GTK/GLib main loop.
/// Enables Ubuntu/GNOME/KDE notification media banner (album art + Play/Pause/Next/Prev),
/// lock screen controls, hardware media keys, Bluetooth headphone buttons, and `playerctl`.
pub fn start_mpris<F, Q>(
    service: Arc<ZunoService>,
    app_handle: AppHandle,
    on_raise: F,
    on_quit: Q,
) -> MprisHandle
where
    F: Fn(&AppHandle) + Send + Sync + 'static,
    Q: Fn(&AppHandle) + Send + Sync + 'static,
{
    let shared = Arc::new(MprisShared {
        service,
        connection: Mutex::new(None),
        snapshot: Mutex::new(MprisSnapshot::default()),
        cover_cache: Mutex::new(CoverCache {
            track_id: None,
            art_url: None,
            last_file: None,
        }),
    });

    let on_raise = Arc::new(on_raise);
    let on_quit = Arc::new(on_quit);

    let shared_bus = Arc::clone(&shared);
    let app_bus = app_handle.clone();

    let owner_id = gio::bus_own_name(
        gio::BusType::Session,
        MPRIS_BUS_NAME,
        gio::BusNameOwnerFlags::NONE,
        move |conn, _name| {
            let Ok(node_info) = gio::DBusNodeInfo::for_xml(MPRIS_INTROSPECTION_XML) else {
                return;
            };
            let Some(root_info) = node_info.lookup_interface(ROOT_IFACE) else {
                return;
            };
            let Some(player_info) = node_info.lookup_interface(PLAYER_IFACE) else {
                return;
            };

            // 1. Register `org.mpris.MediaPlayer2` root interface
            let app_root = app_bus.clone();
            let raise_cb = Arc::clone(&on_raise);
            let quit_cb = Arc::clone(&on_quit);
            let root_reg = conn.register_object(
                MPRIS_OBJECT_PATH,
                &root_info,
                move |_conn, _sender, _path, _iface, method, _params, invocation| {
                    match method {
                        "Raise" => raise_cb(&app_root),
                        "Quit" => quit_cb(&app_root),
                        _ => {}
                    }
                    invocation.return_value(None);
                },
                move |_conn, _sender, _path, _iface, prop| match prop {
                    "CanQuit" | "CanRaise" => true.to_variant(),
                    "HasTrackList" => false.to_variant(),
                    "Identity" => "Zuno".to_variant(),
                    "DesktopEntry" => "zuno".to_variant(),
                    "SupportedUriSchemes" => vec!["file".to_string()].to_variant(),
                    "SupportedMimeTypes" => vec![
                        "audio/mpeg".to_string(),
                        "audio/flac".to_string(),
                        "audio/ogg".to_string(),
                        "audio/wav".to_string(),
                        "audio/mp4".to_string(),
                        "audio/aac".to_string(),
                        "audio/webm".to_string(),
                    ]
                    .to_variant(),
                    _ => "".to_variant(),
                },
                |_conn, _sender, _path, _iface, _prop, _val| false,
            );
            if let Ok(id) = root_reg {
                std::mem::forget(id);
            }

            // 2. Register `org.mpris.MediaPlayer2.Player` interface
            let shared_call = Arc::clone(&shared_bus);
            let shared_get = Arc::clone(&shared_bus);
            let shared_set = Arc::clone(&shared_bus);
            let player_reg = conn.register_object(
                MPRIS_OBJECT_PATH,
                &player_info,
                move |_conn, _sender, _path, _iface, method, params, invocation| {
                    match method {
                        "Play" => {
                            let _ = shared_call.service.handle_request(IpcRequest::Resume);
                            shared_call.emit_changes();
                        }
                        "Pause" => {
                            let _ = shared_call.service.handle_request(IpcRequest::Pause);
                            shared_call.emit_changes();
                        }
                        "PlayPause" => {
                            let _ = shared_call.service.handle_request(IpcRequest::TogglePause);
                            shared_call.emit_changes();
                        }
                        "Stop" => {
                            let _ = shared_call.service.handle_request(IpcRequest::Stop);
                            shared_call.emit_changes();
                        }
                        "Next" => {
                            let _ = shared_call.service.handle_request(IpcRequest::Next);
                            shared_call.emit_changes();
                        }
                        "Previous" => {
                            let _ = shared_call.service.handle_request(IpcRequest::Previous);
                            shared_call.emit_changes();
                        }
                        "Seek" => {
                            if let Some(offset_us) = params.child_value(0).get::<i64>() {
                                let cur = shared_call.service.status().position_secs;
                                let target = (cur + (offset_us as f64) / 1_000_000.0).max(0.0);
                                let _ = shared_call
                                    .service
                                    .handle_request(IpcRequest::Seek { position_secs: target });
                                shared_call.emit_seeked((target * 1_000_000.0) as i64);
                            }
                        }
                        "SetPosition" => {
                            if let Some(pos_us) = params.child_value(1).get::<i64>() {
                                let target = ((pos_us as f64) / 1_000_000.0).max(0.0);
                                let _ = shared_call
                                    .service
                                    .handle_request(IpcRequest::Seek { position_secs: target });
                                shared_call.emit_seeked(pos_us.max(0));
                            }
                        }
                        _ => {}
                    }
                    invocation.return_value(None);
                },
                move |_conn, _sender, _path, _iface, prop| {
                    let st = shared_get.service.status();
                    match prop {
                        "PlaybackStatus" => playback_status_str(st.state).to_variant(),
                        "LoopStatus" => loop_status_str(st.repeat).to_variant(),
                        "Rate" | "MinimumRate" | "MaximumRate" => 1.0_f64.to_variant(),
                        "Shuffle" => st.shuffle.to_variant(),
                        "Metadata" => shared_get.metadata_variant(&st),
                        "Volume" => (st.volume as f64).to_variant(),
                        "Position" => ((st.position_secs * 1_000_000.0).round() as i64).to_variant(),
                        "CanGoNext" | "CanGoPrevious" | "CanPlay" | "CanPause" | "CanSeek"
                        | "CanControl" => true.to_variant(),
                        _ => "".to_variant(),
                    }
                },
                move |_conn, _sender, _path, _iface, prop, value| match prop {
                    "Volume" => {
                        if let Some(v) = value.get::<f64>() {
                            let _ = shared_set.service.handle_request(IpcRequest::SetVolume {
                                volume: v.clamp(0.0, 1.0) as f32,
                            });
                            shared_set.emit_changes();
                            return true;
                        }
                        false
                    }
                    "Shuffle" => {
                        if let Some(s) = value.get::<bool>() {
                            let _ = shared_set.service.handle_request(IpcRequest::SetMode {
                                shuffle: Some(s),
                                repeat: None,
                            });
                            shared_set.emit_changes();
                            return true;
                        }
                        false
                    }
                    "LoopStatus" => {
                        if let Some(mode_str) = value.get::<String>() {
                            let repeat = match mode_str.as_str() {
                                "Track" => RepeatMode::One,
                                "Playlist" => RepeatMode::All,
                                _ => RepeatMode::Off,
                            };
                            let _ = shared_set.service.handle_request(IpcRequest::SetMode {
                                shuffle: None,
                                repeat: Some(repeat),
                            });
                            shared_set.emit_changes();
                            return true;
                        }
                        false
                    }
                    "Rate" => true,
                    _ => false,
                },
            );
            if let Ok(id) = player_reg {
                std::mem::forget(id);
            }

            if let Ok(mut guard) = shared_bus.connection.lock() {
                *guard = Some(conn);
            }
            shared_bus.emit_changes();
        },
        |_conn, _name| {},
        |_conn, _name| {},
    );
    // Keep bus name ownership active until the Zuno process exits.
    std::mem::forget(owner_id);

    // Lightweight 350ms change detector on GLib loop: emits D-Bus `PropertiesChanged`
    // strictly when track, play state, volume, shuffle, or repeat actually changes
    // (covers automatic track advance & external CLI/MCP Unix IPC changes).
    let shared_poll = Arc::clone(&shared);
    glib::timeout_add_local(Duration::from_millis(350), move || {
        shared_poll.emit_changes();
        glib::ControlFlow::Continue
    });

    MprisHandle { shared }
}

fn playback_status_str(state: PlayState) -> &'static str {
    match state {
        PlayState::Playing => "Playing",
        PlayState::Paused => "Paused",
        PlayState::Stopped => "Stopped",
    }
}

fn loop_status_str(repeat: RepeatMode) -> &'static str {
    match repeat {
        RepeatMode::Off => "None",
        RepeatMode::One => "Track",
        RepeatMode::All => "Playlist",
    }
}

fn sanitize_object_segment(raw: &str) -> String {
    let clean: String = raw
        .chars()
        .map(|c| if c.is_ascii_alphanumeric() { c } else { '_' })
        .collect();
    if clean.is_empty() {
        "track".to_string()
    } else {
        clean
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn properties_changed_payload_has_exact_dbus_signature_sa_sv_as() {
        let track = Track {
            id: "abc123".into(),
            rel_path: "songs/demo.mp3".into(),
            source_dir: None,
            folder: "Favorites".into(),
            title: "Natpe Thunai".into(),
            artist: "HipHop Tamizha".into(),
            album: "Natpe Thunai".into(),
            genre: None,
            duration_secs: 274,
            has_cover: false,
            file_size: 1024,
            modified_secs: 0,
        };

        let meta = build_metadata_variant(Some(&track), Some("file:///tmp/cover.png"));
        assert_eq!(meta.type_().as_str(), "a{sv}");

        let meta_dict = glib::VariantDict::new(Some(&meta));
        let track_id = meta_dict
            .lookup_value("mpris:trackid", None)
            .expect("mpris:trackid missing");
        assert_eq!(track_id.type_().as_str(), "o");
        assert_eq!(track_id.str(), Some("/org/zuno/track/abc123"));

        let title = meta_dict
            .lookup_value("xesam:title", None)
            .expect("xesam:title missing");
        assert_eq!(title.type_().as_str(), "s");
        assert_eq!(title.str(), Some("Natpe Thunai"));

        let artists = meta_dict
            .lookup_value("xesam:artist", None)
            .expect("xesam:artist missing");
        assert_eq!(artists.type_().as_str(), "as");

        let changed = glib::VariantDict::new(None);
        changed.insert("PlaybackStatus", playback_status_str(PlayState::Playing));
        changed.insert_value("Metadata", &meta);

        let payload = build_properties_changed_payload(PLAYER_IFACE, changed.end(), &[]);
        // Must be `(sa{sv}as)` — NOT `(svas)` — otherwise GNOME Shell silently drops the signal!
        assert_eq!(payload.type_().as_str(), "(sa{sv}as)");
        assert_eq!(payload.child_value(0).str(), Some(PLAYER_IFACE));

        let changed_variant = payload.child_value(1);
        assert_eq!(changed_variant.type_().as_str(), "a{sv}");
        let changed_dict = glib::VariantDict::new(Some(&changed_variant));
        let ps = changed_dict
            .lookup_value("PlaybackStatus", None)
            .expect("PlaybackStatus missing");
        assert_eq!(ps.type_().as_str(), "s");
        assert_eq!(ps.str(), Some("Playing"));

        let emitted_meta = changed_dict
            .lookup_value("Metadata", None)
            .expect("Metadata missing");
        assert_eq!(emitted_meta.type_().as_str(), "a{sv}");
    }
}
