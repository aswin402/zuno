#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use std::sync::Arc;
use std::sync::atomic::{AtomicBool, Ordering};
use tauri::image::Image;
use tauri::menu::{Menu, MenuItem, PredefinedMenuItem};
use tauri::tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent};
use tauri::{AppHandle, Manager, RunEvent, WebviewUrl, WebviewWindowBuilder, WindowEvent};
use zuno_audio::{ZunoService, ipc_unix};
use zuno_core::ZunoPaths;
use zuno_core::ipc::{IpcRequest, IpcResponse};

struct AppState {
    service: Arc<ZunoService>,
    quitting: AtomicBool,
}

#[tauri::command]
fn zuno_ipc(req: IpcRequest, state: tauri::State<'_, AppState>) -> IpcResponse {
    state.service.handle_request(req)
}

#[tauri::command]
fn zuno_info(state: tauri::State<'_, AppState>) -> serde_json::Value {
    let paths = state.service.paths();
    serde_json::json!({
        "root_dir": paths.root().display().to_string(),
        "songs_dir": paths.songs_dir().display().to_string(),
        "playlists_dir": paths.playlists_dir().display().to_string(),
        "mcp_http_url": "",
        "version": env!("CARGO_PKG_VERSION"),
        "native_audio": true,
    })
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
        .build();
}

fn main() {
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

    let cover_service = Arc::clone(&service);

    let app = tauri::Builder::default()
        .manage(AppState {
            service,
            quitting: AtomicBool::new(false),
        })
        // Zero-TCP custom URI scheme for embedded album cover art: `zuno://localhost/cover/<id>`
        .register_uri_scheme_protocol("zuno", move |_ctx, request| {
            let path = request.uri().path();
            if let Some(track_id) = path.strip_prefix("/cover/") {
                if let Some(art) = cover_service.extract_cover(track_id) {
                    return tauri::http::Response::builder()
                        .status(200)
                        .header("Content-Type", art.mime_type)
                        .header("Cache-Control", "public, max-age=86400")
                        .body(art.bytes)
                        .unwrap();
                }
            }
            tauri::http::Response::builder()
                .status(404)
                .header("Content-Type", "text/plain")
                .body(Vec::new())
                .unwrap()
        })
        .invoke_handler(tauri::generate_handler![zuno_ipc, zuno_info])
        .setup(|app| {
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
                        }
                        "next" => {
                            let _ = state.service.handle_request(IpcRequest::Next);
                        }
                        "prev" => {
                            let _ = state.service.handle_request(IpcRequest::Previous);
                        }
                        "quit" => {
                            state.quitting.store(true, Ordering::SeqCst);
                            let _ = state.service.handle_request(IpcRequest::Stop);
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
                if !state.service.is_playing() {
                    state.quitting.store(true, Ordering::SeqCst);
                }
            }
        })
        .build(tauri::generate_context!())
        .expect("error while building Zuno native app");

    app.run(|app_handle, event| {
        if let RunEvent::ExitRequested { api, .. } = event {
            let state = app_handle.state::<AppState>();
            if !state.quitting.load(Ordering::SeqCst) && state.service.is_playing() {
                api.prevent_exit();
            }
        }
    });
}
