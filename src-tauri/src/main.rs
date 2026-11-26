#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod cover_cache;
#[cfg(target_os = "linux")]
mod mpris;
mod updater;

use serde_json::json;
use std::sync::atomic::{AtomicBool, Ordering};
#[cfg(target_os = "linux")]
use std::sync::OnceLock;
use std::sync::{Arc, Mutex, mpsc};
use std::time::Duration;
use tauri::image::Image;
use tauri::menu::{Menu, MenuItem, PredefinedMenuItem};
use tauri::tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent};
use tauri::{
    AppHandle, Emitter, Manager, RunEvent, WebviewUrl, WebviewWindow, WebviewWindowBuilder,
    WindowEvent,
};
use zuno_audio::{AudioLevels, ZunoService, ipc_unix, radio};
use zuno_core::ZunoPaths;
use zuno_core::ipc::{IpcData, IpcRequest, IpcResponse};
use zuno_core::settings::{clamp_ui_zoom, extract_ui_zoom};

const ZOOM_MIN_FACTOR: f64 = 0.5;
const ZOOM_MAX_FACTOR: f64 = 2.0;
const FOLDER_PICKER_TITLE: &str = "Select Music Folder for Zuno";

/// Suppress console window flashing when spawning child tools (`curl`, `rtl_fm`, `powershell`) on Windows.
pub(crate) fn configure_hidden_command(_cmd: &mut std::process::Command) {
    #[cfg(target_os = "windows")]
    {
        use std::os::windows::process::CommandExt;
        const CREATE_NO_WINDOW: u32 = 0x08000000;
        _cmd.creation_flags(CREATE_NO_WINDOW);
    }
}

#[derive(Clone, Copy, PartialEq, Eq)]
enum TrayAction {
    Show,
    Toggle,
    Next,
    Prev,
    Quit,
}

impl TrayAction {
    const fn id(self) -> &'static str {
        match self {
            Self::Show => "show",
            Self::Toggle => "toggle",
            Self::Next => "next",
            Self::Prev => "prev",
            Self::Quit => "quit",
        }
    }

    fn from_id(id: &str) -> Option<Self> {
        match id {
            "show" => Some(Self::Show),
            "toggle" => Some(Self::Toggle),
            "next" => Some(Self::Next),
            "prev" => Some(Self::Prev),
            "quit" => Some(Self::Quit),
            _ => None,
        }
    }
}

fn shutdown_app(app: &AppHandle, state: &AppState) {
    state.quitting.store(true, Ordering::SeqCst);
    state.radio.clear(Some(&state.service), &state.fm_tuner);
    let _ = state.service.handle_request(IpcRequest::Stop);
    state.notify_mpris();
    app.exit(0);
}

fn percent_decode_segment(input: &str) -> String {
    let bytes = input.as_bytes();
    let mut out = Vec::with_capacity(bytes.len());
    let mut i = 0;
    while i < bytes.len() {
        if bytes[i] == b'%' && i + 2 < bytes.len() {
            if let (Some(h), Some(l)) = (
                (bytes[i + 1] as char).to_digit(16),
                (bytes[i + 2] as char).to_digit(16),
            ) {
                out.push(((h << 4) | l) as u8);
                i += 3;
                continue;
            }
        }
        out.push(bytes[i]);
        i += 1;
    }
    String::from_utf8(out).unwrap_or_else(|_| input.to_string())
}

#[derive(Debug, Clone, serde::Serialize)]
struct UiCommand {
    #[serde(skip_serializing_if = "Option::is_none")]
    page: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    playlist_slug: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    overlay: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    search_query: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    customize_section: Option<String>,
}

#[derive(Debug, Clone, serde::Serialize)]
struct SyncPollResponse {
    settings_rev: u64,
    library_rev: u64,
    radio_store_rev: u64,
    ui_commands: Vec<UiCommand>,
}

struct AppState {
    service: Arc<ZunoService>,
    fm_tuner: Arc<radio::FmTunerManager>,
    radio: Arc<radio::RadioPlaybackManager>,
    ui_commands: Mutex<Vec<UiCommand>>,
    quitting: AtomicBool,
    update_progress: Arc<Mutex<updater::UpdateProgressEvent>>,
    #[cfg(target_os = "linux")]
    mpris: OnceLock<mpris::MprisHandle>,
}

impl AppState {
    fn notify_mpris(&self) {
        #[cfg(target_os = "linux")]
        if let Some(handle) = self.mpris.get() {
            handle.notify_change();
        }
    }

    fn mpris_notify_cb(&self) -> Arc<dyn Fn() + Send + Sync> {
        #[cfg(target_os = "linux")]
        if let Some(handle) = self.mpris.get().cloned() {
            return Arc::new(move || handle.notify_change());
        }
        Arc::new(|| {})
    }

    fn notify_mpris_seeked(&self, position_secs: f64) {
        #[cfg(target_os = "linux")]
        if let Some(handle) = self.mpris.get() {
            handle.notify_seeked(position_secs);
        }
        #[cfg(not(target_os = "linux"))]
        let _ = position_secs;
    }
}

fn apply_zoom_to_live_window(app: &AppHandle, zoom_percent: f64) {
    let factor = clamp_ui_zoom(zoom_percent) / 100.0;
    let app_clone = app.clone();
    let _ = app.run_on_main_thread(move || {
        if let Some(win) = app_clone.get_webview_window("main") {
            let _ = win.set_zoom(factor);
        }
    });
}

fn dispatch_live_ipc(app: &AppHandle, req: IpcRequest) -> IpcResponse {
    let state = app.state::<AppState>();
    match req {
        IpcRequest::Navigate {
            page,
            playlist_slug,
            overlay,
            search_query,
            customize_section,
        } => {
            let app_clone = app.clone();
            let _ = app.run_on_main_thread(move || {
                show_or_create_main_window(&app_clone);
            });
            let cmd = UiCommand {
                page,
                playlist_slug,
                overlay,
                search_query,
                customize_section,
            };
            if let Ok(mut q) = state.ui_commands.lock() {
                q.push(cmd.clone());
            }
            let _ = app.emit("zuno:sync", ());
            IpcResponse::Ok {
                data: IpcData::Json(json!({ "ok": true, "command": cmd })),
            }
        }

        IpcRequest::WindowControl {
            action,
            zoom_percent,
        } => {
            let act = action.trim().to_ascii_lowercase();
            match act.as_str() {
                "show" => {
                    let app_clone = app.clone();
                    let _ = app.run_on_main_thread(move || show_or_create_main_window(&app_clone));
                    IpcResponse::Ok {
                        data: IpcData::Json(json!({ "action": "show", "ok": true })),
                    }
                }
                "minimize" => {
                    let app_clone = app.clone();
                    let _ = app.run_on_main_thread(move || {
                        if let Some(w) = app_clone.get_webview_window("main") {
                            let _ = w.minimize();
                        }
                    });
                    IpcResponse::Ok {
                        data: IpcData::Json(json!({ "action": "minimize", "ok": true })),
                    }
                }
                "maximize" | "unmaximize" | "toggle_maximize" => {
                    let (tx, rx) = mpsc::channel();
                    let app_clone = app.clone();
                    let mode = act.clone();
                    let _ = app.run_on_main_thread(move || {
                        let maximized = if let Some(w) = app_clone.get_webview_window("main") {
                            let cur = w.is_maximized().unwrap_or(false);
                            let target = match mode.as_str() {
                                "maximize" => true,
                                "unmaximize" => false,
                                _ => !cur,
                            };
                            if target {
                                let _ = w.maximize();
                            } else {
                                let _ = w.unmaximize();
                            }
                            target
                        } else {
                            false
                        };
                        let _ = tx.send(maximized);
                    });
                    let maximized = rx.recv_timeout(Duration::from_secs(2)).unwrap_or(false);
                    IpcResponse::Ok {
                        data: IpcData::Json(json!({ "action": act, "maximized": maximized })),
                    }
                }
                "fullscreen" | "unfullscreen" | "toggle_fullscreen" => {
                    let (tx, rx) = mpsc::channel();
                    let app_clone = app.clone();
                    let mode = act.clone();
                    let _ = app.run_on_main_thread(move || {
                        let fullscreen = if let Some(w) = app_clone.get_webview_window("main") {
                            let cur = w.is_fullscreen().unwrap_or(false);
                            let target = match mode.as_str() {
                                "fullscreen" => true,
                                "unfullscreen" => false,
                                _ => !cur,
                            };
                            let _ = w.set_fullscreen(target);
                            target
                        } else {
                            false
                        };
                        let _ = tx.send(fullscreen);
                    });
                    let fullscreen = rx.recv_timeout(Duration::from_secs(2)).unwrap_or(false);
                    IpcResponse::Ok {
                        data: IpcData::Json(json!({ "action": act, "fullscreen": fullscreen })),
                    }
                }
                "close_to_tray" | "close" => {
                    let app_clone = app.clone();
                    let _ = app.run_on_main_thread(move || {
                        if let Some(w) = app_clone.get_webview_window("main") {
                            let _ = w.close();
                        }
                    });
                    IpcResponse::Ok {
                        data: IpcData::Json(json!({ "action": "close_to_tray", "ok": true })),
                    }
                }
                "quit" => {
                    let app_exit = app.clone();
                    std::thread::spawn(move || {
                        std::thread::sleep(Duration::from_millis(80));
                        let st = app_exit.state::<AppState>();
                        shutdown_app(&app_exit, &st);
                    });
                    IpcResponse::Ok {
                        data: IpcData::Json(json!({ "action": "quit", "ok": true })),
                    }
                }
                "set_zoom" => {
                    let Some(pct) = zoom_percent else {
                        return IpcResponse::Err {
                            message: "missing 'zoom_percent' (50..=200)".into(),
                        };
                    };
                    let clamped = clamp_ui_zoom(pct) as i64;
                    let resp = state.service.handle_request(IpcRequest::UpdateSettings {
                        patch: json!({ "uiZoom": clamped }),
                    });
                    if matches!(resp, IpcResponse::Ok { .. }) {
                        apply_zoom_to_live_window(app, clamped as f64);
                        let _ = app.emit("zuno:sync", ());
                        IpcResponse::Ok {
                            data: IpcData::Json(json!({
                                "action": "set_zoom",
                                "zoom_percent": clamped,
                                "live_window": true,
                            })),
                        }
                    } else {
                        resp
                    }
                }
                "status" => {
                    let (tx, rx) = mpsc::channel();
                    let app_clone = app.clone();
                    let zoom = extract_ui_zoom(&state.service.settings_snapshot());
                    let _ = app.run_on_main_thread(move || {
                        let info = if let Some(w) = app_clone.get_webview_window("main") {
                            json!({
                                "window_open": true,
                                "visible": w.is_visible().unwrap_or(true),
                                "minimized": w.is_minimized().unwrap_or(false),
                                "maximized": w.is_maximized().unwrap_or(false),
                                "fullscreen": w.is_fullscreen().unwrap_or(false),
                                "zoom_percent": zoom as i64,
                            })
                        } else {
                            json!({
                                "window_open": false,
                                "visible": false,
                                "minimized": false,
                                "maximized": false,
                                "fullscreen": false,
                                "zoom_percent": zoom as i64,
                            })
                        };
                        let _ = tx.send(info);
                    });
                    let info = rx
                        .recv_timeout(Duration::from_secs(2))
                        .unwrap_or_else(|_| json!({ "window_open": false, "zoom_percent": zoom as i64 }));
                    IpcResponse::Ok {
                        data: IpcData::Json(info),
                    }
                }
                other => IpcResponse::Err {
                    message: format!(
                        "unknown window action '{other}' (expected show, minimize, maximize, unmaximize, toggle_maximize, fullscreen, unfullscreen, toggle_fullscreen, close_to_tray, quit, set_zoom, status)"
                    ),
                },
            }
        }

        IpcRequest::CheckUpdate => match updater::check_for_update() {
            Ok(info) => match serde_json::to_value(&info) {
                Ok(v) => IpcResponse::Ok {
                    data: IpcData::Json(v),
                },
                Err(e) => IpcResponse::Err {
                    message: e.to_string(),
                },
            },
            Err(message) => IpcResponse::Err { message },
        },

        other => {
            let seek_pos = match &other {
                IpcRequest::Seek { position_secs } => Some(*position_secs),
                _ => None,
            };
            let is_get_info = matches!(other, IpcRequest::GetInfo);
            let updates_zoom = matches!(
                other,
                IpcRequest::UpdateSettings { .. } | IpcRequest::ResetSettings { .. }
            );
            let should_emit_sync = !matches!(
                other,
                IpcRequest::Ping
                    | IpcRequest::GetInfo
                    | IpcRequest::GetStatus
                    | IpcRequest::GetAudioLevels
                    | IpcRequest::ListSongs { .. }
                    | IpcRequest::SearchSongs { .. }
                    | IpcRequest::ListFolders
                    | IpcRequest::ListSources
                    | IpcRequest::ListPlaylists
                    | IpcRequest::GetPlaylist { .. }
                    | IpcRequest::QueueGet
                    | IpcRequest::GetEq
                    | IpcRequest::GetTransition
                    | IpcRequest::GetSettings
                    | IpcRequest::GetLastPlayed
                    | IpcRequest::RadioStatus
                    | IpcRequest::RadioGetStore
                    | IpcRequest::RadioDiscover { .. }
                    | IpcRequest::RadioResolveUrl { .. }
                    | IpcRequest::FmHardwareStatus
            );

            let mut resp = state.service.handle_request(other);
            if matches!(resp, IpcResponse::Ok { .. }) {
                if let Some(pos) = seek_pos {
                    state.notify_mpris_seeked(pos);
                }
                if updates_zoom {
                    let zoom = extract_ui_zoom(&state.service.settings_snapshot());
                    apply_zoom_to_live_window(app, zoom);
                }
                if is_get_info {
                    if let IpcResponse::Ok {
                        data: IpcData::Json(ref mut val),
                    } = resp
                    {
                        if let Some(obj) = val.as_object_mut() {
                            obj.insert("live_gui".into(), json!(true));
                            obj.insert(
                                "window_open".into(),
                                json!(app.get_webview_window("main").is_some()),
                            );
                        }
                    }
                }
                if should_emit_sync {
                    let _ = app.emit("zuno:sync", ());
                }
            }
            resp
        }
    }
}

#[tauri::command]
fn zuno_sync_poll(state: tauri::State<'_, AppState>) -> SyncPollResponse {
    let (settings_rev, library_rev, radio_store_rev) = state.service.revisions();
    let ui_commands = state
        .ui_commands
        .lock()
        .map(|mut q| std::mem::take(&mut *q))
        .unwrap_or_default();
    SyncPollResponse {
        settings_rev,
        library_rev,
        radio_store_rev,
        ui_commands,
    }
}

#[tauri::command]
fn zuno_ipc(req: IpcRequest, state: tauri::State<'_, AppState>) -> IpcResponse {
    let seek_pos = match &req {
        IpcRequest::Seek { position_secs } => Some(*position_secs),
        _ => None,
    };
    let resp = state.service.handle_request(req);
    if matches!(resp, IpcResponse::Ok { .. }) {
        if let Some(pos) = seek_pos {
            state.notify_mpris_seeked(pos);
        }
    }
    resp
}

#[tauri::command]
fn zuno_audio_levels(state: tauri::State<'_, AppState>) -> AudioLevels {
    state.service.audio_levels()
}

#[tauri::command]
fn zuno_info(state: tauri::State<'_, AppState>) -> serde_json::Value {
    let paths = state.service.paths();
    let home_dir = std::env::var("HOME")
        .or_else(|_| std::env::var("USERPROFILE"))
        .ok()
        .filter(|s| !s.trim().is_empty());
    serde_json::json!({
        "root_dir": paths.root().display().to_string(),
        "songs_dir": paths.songs_dir().display().to_string(),
        "playlists_dir": paths.playlists_dir().display().to_string(),
        "home_dir": home_dir,
        "suggested_dirs": paths.suggested_music_dirs(),
        "mcp_http_url": "",
        "version": env!("CARGO_PKG_VERSION"),
        "native_audio": true,
    })
}

#[tauri::command]
fn window_minimize(window: WebviewWindow) {
    let _ = window.minimize();
}

#[tauri::command]
fn window_toggle_maximize(window: WebviewWindow) -> bool {
    let is_max = window.is_maximized().unwrap_or(false);
    if is_max {
        let _ = window.unmaximize();
        false
    } else {
        let _ = window.maximize();
        true
    }
}

#[tauri::command]
fn window_is_maximized(window: WebviewWindow) -> bool {
    window.is_maximized().unwrap_or(false)
}

#[tauri::command]
fn window_close(window: WebviewWindow) {
    let _ = window.close();
}

#[tauri::command]
fn window_toggle_fullscreen(window: WebviewWindow) -> bool {
    let is_fs = window.is_fullscreen().unwrap_or(false);
    let _ = window.set_fullscreen(!is_fs);
    !is_fs
}

#[tauri::command]
fn window_set_zoom(window: WebviewWindow, factor: f64) -> Result<f64, String> {
    let clamped = if factor.is_finite() {
        factor.clamp(ZOOM_MIN_FACTOR, ZOOM_MAX_FACTOR)
    } else {
        1.0
    };
    window
        .set_zoom(clamped)
        .map_err(|e| format!("failed to set window zoom: {e}"))?;
    Ok(clamped)
}

#[tauri::command]
fn app_quit(app: AppHandle, state: tauri::State<'_, AppState>) {
    shutdown_app(&app, &state);
}

#[tauri::command]
fn window_start_dragging(window: WebviewWindow) {
    let _ = window.start_dragging();
}

#[tauri::command]
async fn zuno_check_update() -> Result<updater::UpdateInfo, String> {
    tauri::async_runtime::spawn_blocking(updater::check_for_update)
        .await
        .map_err(|e| format!("update check task failed: {e}"))?
}

#[tauri::command]
async fn zuno_backup_data(
    ui_settings_json: Option<String>,
    state: tauri::State<'_, AppState>,
) -> Result<updater::BackupReport, String> {
    let paths = state.service.paths();
    tauri::async_runtime::spawn_blocking(move || {
        updater::backup_user_data(
            &paths,
            env!("CARGO_PKG_VERSION"),
            ui_settings_json.as_deref(),
        )
    })
    .await
    .map_err(|e| format!("backup task failed: {e}"))?
}

#[tauri::command]
fn zuno_update_progress(state: tauri::State<'_, AppState>) -> updater::UpdateProgressEvent {
    state
        .update_progress
        .lock()
        .map(|g| g.clone())
        .unwrap_or_default()
}

#[tauri::command]
async fn zuno_install_update(
    download_url: String,
    sha256: Option<String>,
    size_bytes: Option<u64>,
    target_version: String,
    create_backup: bool,
    ui_settings_json: Option<String>,
    state: tauri::State<'_, AppState>,
) -> Result<updater::UpdateInstallResult, String> {
    let paths = state.service.paths();
    let progress = Arc::clone(&state.update_progress);
    tauri::async_runtime::spawn_blocking(move || {
        updater::install_update(
            &progress,
            &paths,
            &download_url,
            sha256.as_deref(),
            size_bytes,
            &target_version,
            create_backup,
            ui_settings_json.as_deref(),
        )
    })
    .await
    .map_err(|e| format!("update install task failed: {e}"))?
}

#[tauri::command]
fn zuno_relaunch_app(app: AppHandle, state: tauri::State<'_, AppState>) -> Result<(), String> {
    updater::spawn_relaunched_app()?;
    shutdown_app(&app, &state);
    Ok(())
}

#[tauri::command]
fn zuno_radio_load_store(state: tauri::State<'_, AppState>) -> radio::RadioStoreData {
    radio::load_radio_store(&state.service.paths())
}

#[tauri::command]
fn zuno_radio_save_store(
    store: radio::RadioStoreData,
    state: tauri::State<'_, AppState>,
) -> Result<(), String> {
    radio::save_radio_store(&state.service.paths(), &store)
}

#[tauri::command]
async fn zuno_radio_discover(
    query: Option<String>,
    tag: Option<String>,
    country: Option<String>,
    language: Option<String>,
    limit: Option<usize>,
) -> Result<Vec<radio::DiscoveredStation>, String> {
    tauri::async_runtime::spawn_blocking(move || {
        radio::discover_online_stations(
            query.as_deref(),
            tag.as_deref(),
            country.as_deref(),
            language.as_deref(),
            limit.unwrap_or(radio::RADIO_DISCOVER_DEFAULT_LIMIT),
        )
    })
    .await
    .map_err(|e| format!("radio discovery task failed: {e}"))?
}

#[tauri::command]
async fn zuno_radio_resolve_url(url: String) -> Result<radio::ResolvedStreamInfo, String> {
    tauri::async_runtime::spawn_blocking(move || radio::resolve_stream_url(&url))
        .await
        .map_err(|e| format!("radio link resolver failed: {e}"))?
}

#[tauri::command]
async fn zuno_radio_play_online(
    id: String,
    name: String,
    subtitle: String,
    url: String,
    state: tauri::State<'_, AppState>,
) -> Result<radio::ActiveRadioInfo, String> {
    let radio_mgr = Arc::clone(&state.radio);
    let svc = Arc::clone(&state.service);
    let fm = Arc::clone(&state.fm_tuner);
    let on_change = state.mpris_notify_cb();
    tauri::async_runtime::spawn_blocking(move || {
        radio_mgr.play_online(id, name, subtitle, url, &svc, &fm, on_change)
    })
    .await
    .map_err(|e| format!("online radio task failed: {e}"))?
}

#[tauri::command]
fn zuno_radio_disconnect(state: tauri::State<'_, AppState>) -> Option<radio::ActiveRadioInfo> {
    let next = state.radio.disconnect(&state.service, &state.fm_tuner);
    state.notify_mpris();
    next
}

#[tauri::command]
fn zuno_radio_stop(state: tauri::State<'_, AppState>) {
    state.radio.clear(Some(&state.service), &state.fm_tuner);
    state.notify_mpris();
}

#[tauri::command]
fn zuno_radio_poll(state: tauri::State<'_, AppState>) -> radio::RadioPollStatus {
    state.radio.poll_status()
}

#[tauri::command]
fn zuno_fm_hardware_status(state: tauri::State<'_, AppState>) -> radio::FmHardwareStatus {
    state.fm_tuner.hardware_status()
}

#[tauri::command]
async fn zuno_fm_tune(
    freq_mhz: f64,
    name: Option<String>,
    signal_id: Option<String>,
    state: tauri::State<'_, AppState>,
) -> Result<radio::FmHardwareStatus, String> {
    let tuner = Arc::clone(&state.fm_tuner);
    let radio_mgr = Arc::clone(&state.radio);
    let svc = Arc::clone(&state.service);
    let on_change = state.mpris_notify_cb();
    tauri::async_runtime::spawn_blocking(move || {
        radio_mgr.clear(None, &tuner);
        let hw = tuner.tune(freq_mhz, &svc)?;
        let rounded = (freq_mhz * 10.0).round() / 10.0;
        let id = signal_id.unwrap_or_else(|| format!("freq-{rounded:.1}"));
        let display_name = name
            .filter(|n| !n.trim().is_empty())
            .unwrap_or_else(|| format!("{rounded:.1} MHz"));
        let subtitle = format!("{rounded:.1} MHz · Offline FM Signal");
        radio_mgr.set_offline_active(id, display_name, subtitle, rounded);
        on_change();
        Ok(hw)
    })
    .await
    .map_err(|e| format!("FM tune task failed: {e}"))?
}

#[tauri::command]
fn zuno_fm_stop(state: tauri::State<'_, AppState>) -> radio::FmHardwareStatus {
    state.radio.disconnect(&state.service, &state.fm_tuner);
    state.notify_mpris();
    state.fm_tuner.hardware_status()
}

fn run_picker_cmd(cmd: &mut std::process::Command) -> std::io::Result<Option<String>> {
    configure_hidden_command(cmd);
    let out = cmd.output()?;
    if !out.status.success() {
        return Ok(None);
    }
    let s = String::from_utf8_lossy(&out.stdout).trim().to_string();
    Ok((!s.is_empty()).then_some(s))
}

#[tauri::command]
async fn pick_music_folder() -> Option<String> {
    tauri::async_runtime::spawn_blocking(|| {
        #[cfg(target_os = "macos")]
        {
            let mut cmd = std::process::Command::new("osascript");
            cmd.args([
                "-e",
                &format!(r#"POSIX path of (choose folder with prompt "{FOLDER_PICKER_TITLE}")"#),
            ]);
            return run_picker_cmd(&mut cmd).ok().flatten();
        }

        #[cfg(target_os = "windows")]
        {
            let script = format!(
                "Add-Type -AssemblyName System.Windows.Forms; \
                 $d = New-Object System.Windows.Forms.FolderBrowserDialog; \
                 $d.Description = '{FOLDER_PICKER_TITLE}'; \
                 if ($d.ShowDialog() -eq [System.Windows.Forms.DialogResult]::OK) {{ Write-Output $d.SelectedPath }}"
            );
            let mut cmd = std::process::Command::new("powershell");
            cmd.args(["-NoProfile", "-STA", "-Command", &script]);
            return run_picker_cmd(&mut cmd).ok().flatten();
        }

        #[cfg(not(any(target_os = "macos", target_os = "windows")))]
        {
            let default_dir = ZunoPaths::resolve_default()
                .suggested_music_dirs()
                .into_iter()
                .next()
                .or_else(|| std::env::var("HOME").ok())
                .map(|d| format!("{}/", d.trim_end_matches('/')))
                .unwrap_or_else(|| "./".to_string());

            let zenity_title = format!("--title={FOLDER_PICKER_TITLE}");
            let zenity_file = format!("--filename={default_dir}");
            let mut zenity = std::process::Command::new("zenity");
            zenity.args(["--file-selection", "--directory", &zenity_title, &zenity_file]);
            if let Ok(result) = run_picker_cmd(&mut zenity) {
                return result;
            }

            let mut kdialog = std::process::Command::new("kdialog");
            kdialog.args(["--getexistingdirectory", &default_dir, "--title", FOLDER_PICKER_TITLE]);
            run_picker_cmd(&mut kdialog).ok().flatten()
        }
    })
    .await
    .ok()
    .flatten()
}

fn show_or_create_main_window(app: &AppHandle) {
    if let Some(win) = app.get_webview_window("main") {
        let _ = win.unminimize();
        let _ = win.show();
        let _ = win.set_focus();
        return;
    }

    let _ = WebviewWindowBuilder::new(app, "main", WebviewUrl::App("index.html".into()))
        .title("Zuno")
        .inner_size(1120.0, 740.0)
        .min_inner_size(360.0, 540.0)
        .resizable(true)
        .decorations(false)
        .transparent(true)
        .build();
}

fn main() {
    updater::cleanup_old_binaries();

    let paths = ZunoPaths::resolve_default();
    if let Err(e) = paths.ensure_dirs() {
        eprintln!("zuno: failed to prepare {}: {e}", paths.root().display());
        std::process::exit(1);
    }

    let service = match ZunoService::open_rodio(paths.clone()) {
        Ok(svc) => svc,
        Err(e) => {
            eprintln!("zuno: failed to start audio engine: {e}");
            std::process::exit(1);
        }
    };

    let sock_path = paths.socket_path();
    let cover_server = Arc::new(cover_cache::CoverServer::start(Arc::clone(&service)));

    let fm_tuner = Arc::clone(service.fm_tuner());
    let radio_mgr = Arc::clone(service.radio());

    let app = tauri::Builder::default()
        .manage(AppState {
            service,
            fm_tuner,
            radio: radio_mgr,
            ui_commands: Mutex::new(Vec::new()),
            quitting: AtomicBool::new(false),
            update_progress: Arc::new(Mutex::new(updater::UpdateProgressEvent::default())),
            #[cfg(target_os = "linux")]
            mpris: OnceLock::new(),
        })
        // Async zero-TCP custom URI scheme for cached embedded album cover art:
        // `zuno://localhost/cover/<id>` or `zuno://localhost/cover/<id>?s=96` (thumbnail)
        .register_asynchronous_uri_scheme_protocol("zuno", move |_ctx, request, responder| {
            let uri = request.uri();
            let path = uri.path();
            if let Some(raw_track_id) = path.strip_prefix("/cover/") {
                let track_id = percent_decode_segment(raw_track_id.trim_end_matches('/'));
                let thumb_size = uri.query().and_then(|q| {
                    q.split('&').find_map(|pair| {
                        let (k, v) = pair.split_once('=')?;
                        (k == "s").then(|| v.parse::<u32>().ok()).flatten()
                    })
                });
                cover_server.enqueue(track_id, thumb_size, responder);
                return;
            }
            responder.respond(
                tauri::http::Response::builder()
                    .status(404)
                    .header("Content-Type", "text/plain")
                    .body(Vec::new())
                    .unwrap(),
            );
        })
        .invoke_handler(tauri::generate_handler![
            zuno_ipc,
            zuno_sync_poll,
            zuno_audio_levels,
            zuno_info,
            zuno_check_update,
            zuno_backup_data,
            zuno_update_progress,
            zuno_install_update,
            zuno_relaunch_app,
            zuno_radio_load_store,
            zuno_radio_save_store,
            zuno_radio_discover,
            zuno_radio_resolve_url,
            zuno_radio_play_online,
            zuno_radio_disconnect,
            zuno_radio_stop,
            zuno_radio_poll,
            zuno_fm_hardware_status,
            zuno_fm_tune,
            zuno_fm_stop,
            window_minimize,
            window_toggle_maximize,
            window_is_maximized,
            window_toggle_fullscreen,
            window_set_zoom,
            window_close,
            window_start_dragging,
            app_quit,
            pick_music_folder
        ])
        .setup(move |app| {
            // Native Linux MPRIS2 D-Bus media integration (GNOME/KDE notification banner,
            // lock screen controls, hardware media keys, Bluetooth buttons & playerctl).
            #[cfg(target_os = "linux")]
            {
                let st = app.state::<AppState>();
                let mpris_svc = Arc::clone(&st.service);
                let mpris_radio = Arc::clone(&st.radio);
                let mpris_fm = Arc::clone(&st.fm_tuner);
                let handle = mpris::start_mpris(
                    mpris_svc,
                    mpris_radio,
                    mpris_fm,
                    app.handle().clone(),
                    |handle| show_or_create_main_window(handle),
                    |handle| {
                        let st = handle.state::<AppState>();
                        shutdown_app(handle, &st);
                    },
                );
                let _ = st.mpris.set(handle);
                st.service.set_change_callback(st.mpris_notify_cb());
            }

            // Expose live Unix Domain Socket IPC wired directly into the live Tauri AppHandle
            // so `zuno-mcp` & AI agents have full real-time control over audio, EQ, FM radio,
            // appearance settings, display zoom, navigation, window controls, and backups.
            let ipc_app = app.handle().clone();
            let _ = ipc_unix::spawn_unix_ipc_server_with_handler(
                move |req| dispatch_live_ipc(&ipc_app, req),
                sock_path,
            );

            // Minimalist B&W Zuno system tray icon with Play/Pause/Next/Prev & Destroy-WebView support
            let show_i = MenuItem::with_id(app, TrayAction::Show.id(), "Show Zuno", true, None::<&str>)?;
            let toggle_i = MenuItem::with_id(app, TrayAction::Toggle.id(), "Play / Pause", true, None::<&str>)?;
            let next_i = MenuItem::with_id(app, TrayAction::Next.id(), "Next Track", true, None::<&str>)?;
            let prev_i = MenuItem::with_id(app, TrayAction::Prev.id(), "Previous Track", true, None::<&str>)?;
            let sep = PredefinedMenuItem::separator(app)?;
            let quit_i = MenuItem::with_id(app, TrayAction::Quit.id(), "Quit Zuno", true, None::<&str>)?;

            let menu = Menu::with_items(
                app,
                &[&show_i, &sep, &toggle_i, &next_i, &prev_i, &sep, &quit_i],
            )?;

            let tray_icon = Image::from_bytes(include_bytes!("../icons/icon.png"))?;
            let _tray = TrayIconBuilder::with_id("zuno-tray")
                .icon(tray_icon)
                .tooltip("Zuno")
                .menu(&menu)
                .show_menu_on_left_click(false)
                .on_menu_event(|app, event| {
                    let state = app.state::<AppState>();
                    match TrayAction::from_id(event.id.as_ref()) {
                        Some(TrayAction::Show) => show_or_create_main_window(app),
                        Some(TrayAction::Toggle) => {
                            if let Some(active) = state.radio.active() {
                                if matches!(
                                    active.state,
                                    radio::RadioPlayState::Playing
                                        | radio::RadioPlayState::Connecting
                                ) {
                                    state.radio.disconnect(&state.service, &state.fm_tuner);
                                    state.notify_mpris();
                                } else {
                                    state.radio.reconnect(
                                        &state.service,
                                        &state.fm_tuner,
                                        state.mpris_notify_cb(),
                                    );
                                }
                            } else {
                                let _ = state.service.handle_request(IpcRequest::TogglePause);
                                state.notify_mpris();
                            }
                        }
                        Some(TrayAction::Next) => {
                            if state.radio.is_active() {
                                state.radio.queue_step(1);
                            } else {
                                let _ = state.service.handle_request(IpcRequest::Next);
                                state.notify_mpris();
                            }
                        }
                        Some(TrayAction::Prev) => {
                            if state.radio.is_active() {
                                state.radio.queue_step(-1);
                            } else {
                                let _ = state.service.handle_request(IpcRequest::Previous);
                                state.notify_mpris();
                            }
                        }
                        Some(TrayAction::Quit) => shutdown_app(app, &state),
                        None => {}
                    }
                })
                .on_tray_icon_event(|tray, event| {
                    if let TrayIconEvent::Click {
                        button: MouseButton::Left,
                        button_state: MouseButtonState::Up,
                        ..
                    } = event
                    {
                        show_or_create_main_window(tray.app_handle());
                    }
                })
                .build(app)?;

            Ok(())
        })
        .on_window_event(|window, event| {
            // Destroy-WebView-on-Close when playing: releases ~35-50 MB of WebKitGTK RAM
            // down to ~8-12 MB RSS while Rust Rodio + 10-band EQ keep playing in the background!
            if let WindowEvent::CloseRequested { .. } = event {
                let state = window.state::<AppState>();
                if !state.service.is_playing()
                    && !state.fm_tuner.is_active()
                    && !state.radio.is_playing()
                {
                    state.quitting.store(true, Ordering::SeqCst);
                }
            }
        })
        .build(tauri::generate_context!())
        .expect("error while building Zuno native app");

    app.run(|app_handle, event| {
        if let RunEvent::ExitRequested { api, .. } = event {
            let state = app_handle.state::<AppState>();
            if !state.quitting.load(Ordering::SeqCst)
                && (state.service.is_playing()
                    || state.fm_tuner.is_active()
                    || state.radio.is_playing())
            {
                api.prevent_exit();
            }
        }
    });
}
