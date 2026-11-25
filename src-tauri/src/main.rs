#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod cover_cache;
#[cfg(target_os = "linux")]
mod mpris;
mod radio;
mod updater;

use std::sync::atomic::{AtomicBool, Ordering};
#[cfg(target_os = "linux")]
use std::sync::OnceLock;
use std::sync::{Arc, Mutex};
use tauri::image::Image;
use tauri::menu::{Menu, MenuItem, PredefinedMenuItem};
use tauri::tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent};
use tauri::{
    AppHandle, Manager, RunEvent, WebviewUrl, WebviewWindow, WebviewWindowBuilder, WindowEvent,
};
use zuno_audio::{AudioLevels, ZunoService, ipc_unix};
use zuno_core::ZunoPaths;
use zuno_core::ipc::{IpcRequest, IpcResponse};

struct AppState {
    service: Arc<ZunoService>,
    fm_tuner: Arc<radio::FmTunerManager>,
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

    fn notify_mpris_seeked(&self, position_secs: f64) {
        #[cfg(target_os = "linux")]
        if let Some(handle) = self.mpris.get() {
            handle.notify_seeked(position_secs);
        }
    }
}

#[tauri::command]
fn zuno_ipc(req: IpcRequest, state: tauri::State<'_, AppState>) -> IpcResponse {
    let seek_pos = match &req {
        IpcRequest::Seek { position_secs } => Some(*position_secs),
        _ => None,
    };
    let affects_mpris = matches!(
        req,
        IpcRequest::Play { .. }
            | IpcRequest::Pause
            | IpcRequest::Resume
            | IpcRequest::TogglePause
            | IpcRequest::Stop
            | IpcRequest::Next
            | IpcRequest::Previous
            | IpcRequest::SetVolume { .. }
            | IpcRequest::SetQueue { .. }
            | IpcRequest::JumpQueue { .. }
            | IpcRequest::SetMode { .. }
            | IpcRequest::QueueClear
            | IpcRequest::RemoveSource { .. }
            | IpcRequest::DeleteSong { .. }
    );
    let stops_fm = matches!(
        req,
        IpcRequest::Play { .. }
            | IpcRequest::Resume
            | IpcRequest::Stop
            | IpcRequest::SetQueue { .. }
            | IpcRequest::JumpQueue { .. }
    );
    if stops_fm {
        state.fm_tuner.stop(None);
    }
    let resp = state.service.handle_request(req);
    if matches!(resp, IpcResponse::Ok { .. }) {
        if affects_mpris {
            state.notify_mpris();
        } else if let Some(pos) = seek_pos {
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
    serde_json::json!({
        "root_dir": paths.root().display().to_string(),
        "songs_dir": paths.songs_dir().display().to_string(),
        "playlists_dir": paths.playlists_dir().display().to_string(),
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
fn app_quit(app: AppHandle, state: tauri::State<'_, AppState>) {
    state.quitting.store(true, Ordering::SeqCst);
    state.fm_tuner.stop(Some(&state.service));
    let _ = state.service.handle_request(IpcRequest::Stop);
    app.exit(0);
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
    state.quitting.store(true, Ordering::SeqCst);
    state.fm_tuner.stop(Some(&state.service));
    let _ = state.service.handle_request(IpcRequest::Stop);
    state.notify_mpris();
    updater::spawn_relaunched_app()?;
    app.exit(0);
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
            limit.unwrap_or(40),
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
fn zuno_fm_hardware_status(state: tauri::State<'_, AppState>) -> radio::FmHardwareStatus {
    state.fm_tuner.hardware_status()
}

#[tauri::command]
async fn zuno_fm_tune(
    freq_mhz: f64,
    state: tauri::State<'_, AppState>,
) -> Result<radio::FmHardwareStatus, String> {
    let tuner = Arc::clone(&state.fm_tuner);
    let svc = Arc::clone(&state.service);
    tauri::async_runtime::spawn_blocking(move || tuner.tune(freq_mhz, &svc))
        .await
        .map_err(|e| format!("FM tune task failed: {e}"))?
}

#[tauri::command]
fn zuno_fm_stop(state: tauri::State<'_, AppState>) -> radio::FmHardwareStatus {
    state.fm_tuner.stop(Some(&state.service));
    state.fm_tuner.hardware_status()
}

#[tauri::command]
async fn pick_music_folder() -> Option<String> {
    tauri::async_runtime::spawn_blocking(|| {
        #[cfg(target_os = "macos")]
        {
            if let Ok(out) = std::process::Command::new("osascript")
                .args([
                    "-e",
                    r#"POSIX path of (choose folder with prompt "Select Music Folder for Zuno")"#,
                ])
                .output()
            {
                if out.status.success() {
                    let s = String::from_utf8_lossy(&out.stdout).trim().to_string();
                    if !s.is_empty() {
                        return Some(s);
                    }
                }
            }
            return None;
        }

        #[cfg(target_os = "windows")]
        {
            use std::os::windows::process::CommandExt;
            let script = concat!(
                "Add-Type -AssemblyName System.Windows.Forms; ",
                "$d = New-Object System.Windows.Forms.FolderBrowserDialog; ",
                "$d.Description = 'Select Music Folder for Zuno'; ",
                "if ($d.ShowDialog() -eq [System.Windows.Forms.DialogResult]::OK) { Write-Output $d.SelectedPath }"
            );
            let mut cmd = std::process::Command::new("powershell");
            cmd.args(["-NoProfile", "-STA", "-Command", script]);
            cmd.creation_flags(0x08000000);
            if let Ok(out) = cmd.output() {
                if out.status.success() {
                    let s = String::from_utf8_lossy(&out.stdout).trim().to_string();
                    if !s.is_empty() {
                        return Some(s);
                    }
                }
            }
            return None;
        }

        #[cfg(not(any(target_os = "macos", target_os = "windows")))]
        {
            let home = std::env::var("HOME").unwrap_or_else(|_| ".".to_string());
            let default_dir = {
                let m = std::path::PathBuf::from(&home).join("Music");
                if m.is_dir() {
                    format!("{}/", m.display())
                } else {
                    format!("{home}/")
                }
            };

            if let Ok(out) = std::process::Command::new("zenity")
                .args([
                    "--file-selection",
                    "--directory",
                    "--title=Select Music Folder for Zuno",
                    &format!("--filename={default_dir}"),
                ])
                .output()
            {
                if out.status.success() {
                    let s = String::from_utf8_lossy(&out.stdout).trim().to_string();
                    if !s.is_empty() {
                        return Some(s);
                    }
                }
                return None;
            }

            if let Ok(out) = std::process::Command::new("kdialog")
                .args([
                    "--getexistingdirectory",
                    &default_dir,
                    "--title",
                    "Select Music Folder for Zuno",
                ])
                .output()
            {
                if out.status.success() {
                    let s = String::from_utf8_lossy(&out.stdout).trim().to_string();
                    if !s.is_empty() {
                        return Some(s);
                    }
                }
            }
            None
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

    // Expose live Unix Domain Socket IPC so `zuno-mcp` CLI & AI agents share live state
    // with the running native desktop app at ~0 extra overhead.
    let sock_path = paths.socket_path();
    let ipc_service = Arc::clone(&service);
    let _ = ipc_unix::spawn_unix_ipc_server(ipc_service, sock_path);

    let cover_server = Arc::new(cover_cache::CoverServer::start(Arc::clone(&service)));

    let fm_tuner = Arc::new(radio::FmTunerManager::new());

    let app = tauri::Builder::default()
        .manage(AppState {
            service,
            fm_tuner,
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
            if let Some(track_id) = path.strip_prefix("/cover/") {
                let thumb_size = uri.query().and_then(|q| {
                    q.split('&').find_map(|pair| {
                        let (k, v) = pair.split_once('=')?;
                        (k == "s").then(|| v.parse::<u32>().ok()).flatten()
                    })
                });
                cover_server.enqueue(track_id.to_string(), thumb_size, responder);
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
            zuno_fm_hardware_status,
            zuno_fm_tune,
            zuno_fm_stop,
            window_minimize,
            window_toggle_maximize,
            window_is_maximized,
            window_toggle_fullscreen,
            window_close,
            window_start_dragging,
            app_quit,
            pick_music_folder
        ])
        .setup(|app| {
            // Native Linux MPRIS2 D-Bus media integration (GNOME/KDE notification banner,
            // lock screen controls, hardware media keys, Bluetooth buttons & playerctl).
            #[cfg(target_os = "linux")]
            {
                let st = app.state::<AppState>();
                let mpris_svc = Arc::clone(&st.service);
                let handle = mpris::start_mpris(
                    mpris_svc,
                    app.handle().clone(),
                    |handle| show_or_create_main_window(handle),
                    |handle| {
                        let st = handle.state::<AppState>();
                        st.quitting.store(true, Ordering::SeqCst);
                        st.fm_tuner.stop(Some(&st.service));
                        let _ = st.service.handle_request(IpcRequest::Stop);
                        st.notify_mpris();
                        handle.exit(0);
                    },
                );
                let _ = st.mpris.set(handle);
            }

            // Minimalist B&W Zuno system tray icon with Play/Pause/Next/Prev & Destroy-WebView support
            let show_i = MenuItem::with_id(app, "show", "Show Zuno", true, None::<&str>)?;
            let toggle_i = MenuItem::with_id(app, "toggle", "Play / Pause", true, None::<&str>)?;
            let next_i = MenuItem::with_id(app, "next", "Next Track", true, None::<&str>)?;
            let prev_i = MenuItem::with_id(app, "prev", "Previous Track", true, None::<&str>)?;
            let sep = PredefinedMenuItem::separator(app)?;
            let quit_i = MenuItem::with_id(app, "quit", "Quit Zuno", true, None::<&str>)?;

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
                    match event.id.as_ref() {
                        "show" => show_or_create_main_window(app),
                        "toggle" => {
                            let _ = state.service.handle_request(IpcRequest::TogglePause);
                            state.notify_mpris();
                        }
                        "next" => {
                            let _ = state.service.handle_request(IpcRequest::Next);
                            state.notify_mpris();
                        }
                        "prev" => {
                            let _ = state.service.handle_request(IpcRequest::Previous);
                            state.notify_mpris();
                        }
                        "quit" => {
                            state.quitting.store(true, Ordering::SeqCst);
                            state.fm_tuner.stop(Some(&state.service));
                            let _ = state.service.handle_request(IpcRequest::Stop);
                            state.notify_mpris();
                            app.exit(0);
                        }
                        _ => {}
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
                if !state.service.is_playing() && !state.fm_tuner.is_active() {
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
                && (state.service.is_playing() || state.fm_tuner.is_active())
            {
                api.prevent_exit();
            }
        }
    });
}
