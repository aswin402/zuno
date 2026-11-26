use crate::ZunoClient;
use serde_json::{Value, json};
use std::io::{self, BufRead, Write};
use std::sync::Arc;
use zuno_core::RepeatMode;
use zuno_core::ipc::{IpcData, IpcRequest, IpcResponse};
use zuno_core::settings::clamp_ui_zoom;

const PROTOCOL_VERSION: &str = "2025-03-26";

/// Run the Model Context Protocol (MCP) JSON-RPC 2.0 server over `stdio`.
/// Note: stdout is strictly reserved for JSON-RPC frames; never print logs to stdout.
pub fn run_stdio_mcp(client: Arc<ZunoClient>) -> io::Result<()> {
    let stdin = io::stdin();
    let stdout = io::stdout();
    let mut out = stdout.lock();

    for line in stdin.lock().lines() {
        let line = line?;
        let trimmed = line.trim();
        if trimmed.is_empty() {
            continue;
        }
        if let Some(reply) = handle_jsonrpc_message(trimmed, &client) {
            let encoded = serde_json::to_string(&reply)?;
            writeln!(out, "{encoded}")?;
            out.flush()?;
        }
    }
    Ok(())
}

/// Process a single MCP JSON-RPC 2.0 request string. Returns `None` for notifications.
pub fn handle_jsonrpc_message(raw: &str, client: &ZunoClient) -> Option<Value> {
    let msg: Value = match serde_json::from_str(raw) {
        Ok(v) => v,
        Err(e) => {
            return Some(jsonrpc_error(Value::Null, -32700, &format!("Parse error: {e}")));
        }
    };

    let id = msg.get("id").cloned();
    let method = msg.get("method").and_then(Value::as_str).unwrap_or("");
    let params = msg.get("params").cloned().unwrap_or_else(|| json!({}));

    // JSON-RPC notifications have no `id` and must not receive a response.
    if id.is_none() || method.starts_with("notifications/") {
        return None;
    }
    let id = id.unwrap();

    let response = match method {
        "initialize" => {
            let requested = params
                .get("protocolVersion")
                .and_then(Value::as_str)
                .unwrap_or(PROTOCOL_VERSION);
            jsonrpc_ok(
                id,
                json!({
                    "protocolVersion": requested,
                    "capabilities": {
                        "tools": { "listChanged": false },
                        "resources": { "subscribe": false, "listChanged": false }
                    },
                    "serverInfo": {
                        "name": "zuno-mcp",
                        "version": env!("CARGO_PKG_VERSION")
                    },
                    "instructions": "Zuno offline-first music & FM radio player. Connected agents have full control over playback, queue, library, external zero-copy folders, .m3u8 playlists, favorites, last played history, 10-band studio equalizer & custom presets, crossfade, Online & Offline FM radio, all Customize Studio appearance settings, Chrome-style Display Zoom (50%-200%), live GUI navigation/overlays, desktop window controls, update checks, and zero-copy backups. Call `get_settings` to inspect current appearance values and valid enums, or `get_equalizer` for preset IDs."
                }),
            )
        }
        "ping" => jsonrpc_ok(id, json!({})),
        "tools/list" => jsonrpc_ok(id, json!({ "tools": tool_definitions() })),
        "tools/call" => {
            let tool_name = params.get("name").and_then(Value::as_str).unwrap_or("");
            let args = params
                .get("arguments")
                .cloned()
                .unwrap_or_else(|| json!({}));
            jsonrpc_ok(id, call_tool(tool_name, &args, client))
        }
        "resources/list" => jsonrpc_ok(id, json!({ "resources": resource_definitions() })),
        "resources/read" => {
            let uri = params.get("uri").and_then(Value::as_str).unwrap_or("");
            match read_resource(uri, client) {
                Ok(content) => jsonrpc_ok(
                    id,
                    json!({
                        "contents": [{
                            "uri": uri,
                            "mimeType": "application/json",
                            "text": content
                        }]
                    }),
                ),
                Err(msg) => jsonrpc_error(id, -32602, &msg),
            }
        }
        _ => jsonrpc_error(id, -32601, &format!("Method not found: {method}")),
    };

    Some(response)
}

fn call_tool(name: &str, args: &Value, client: &ZunoClient) -> Value {
    // Special composite or multi-step tools for best AI ergonomics
    match name {
        "get_status" => {
            let playback = match client.execute(IpcRequest::GetStatus) {
                IpcResponse::Ok { data } => serde_json::to_value(&data).unwrap_or(Value::Null),
                IpcResponse::Err { message } => return tool_err(&message),
            };
            let radio = match client.execute(IpcRequest::RadioStatus) {
                IpcResponse::Ok {
                    data: IpcData::Json(v),
                } => v,
                _ => Value::Null,
            };
            return tool_ok_json(&json!({
                "playback": playback,
                "radio": radio,
            }));
        }

        "set_equalizer" => {
            // If `preset_id` is supplied without explicit band overrides, apply preset cleanly.
            if let Some(pid) = args.get("preset_id").and_then(Value::as_str) {
                if args.get("bands").is_none() {
                    return exec_ipc(
                        IpcRequest::ApplyEqPreset {
                            preset_id: pid.to_string(),
                        },
                        client,
                    );
                }
            }
            // Support partial EQ updates (e.g. only `{ enabled: true }` or `{ preamp: 2.0 }`)
            let cur_eq = match client.execute(IpcRequest::GetEq) {
                IpcResponse::Ok {
                    data: IpcData::Json(v),
                } => v.get("eq").cloned().unwrap_or_else(|| json!({})),
                _ => json!({}),
            };
            let enabled = args
                .get("enabled")
                .and_then(Value::as_bool)
                .unwrap_or_else(|| cur_eq.get("enabled").and_then(Value::as_bool).unwrap_or(true));
            let preamp = args
                .get("preamp")
                .and_then(Value::as_f64)
                .map(|v| v as f32)
                .unwrap_or_else(|| {
                    cur_eq
                        .get("preamp")
                        .and_then(Value::as_f64)
                        .unwrap_or(0.0) as f32
                });
            let limiter = args
                .get("limiter")
                .and_then(Value::as_bool)
                .unwrap_or_else(|| cur_eq.get("limiter").and_then(Value::as_bool).unwrap_or(true));
            let bands: Vec<f32> = if let Some(arr) = args.get("bands").and_then(Value::as_array) {
                arr.iter()
                    .filter_map(Value::as_f64)
                    .map(|v| v as f32)
                    .collect()
            } else if let Some(arr) = cur_eq.get("bands").and_then(Value::as_array) {
                arr.iter()
                    .filter_map(Value::as_f64)
                    .map(|v| v as f32)
                    .collect()
            } else {
                vec![0.0; 10]
            };
            let res = client.execute(IpcRequest::SetEq {
                enabled,
                preamp,
                limiter,
                bands,
            });
            return match res {
                IpcResponse::Ok { .. } => exec_ipc(IpcRequest::GetEq, client),
                IpcResponse::Err { message } => tool_err(&message),
            };
        }

        "set_zoom" => {
            let current_zoom = match client.execute(IpcRequest::GetSettings) {
                IpcResponse::Ok {
                    data: IpcData::Json(v),
                } => v
                    .pointer("/settings/appearance/uiZoom")
                    .and_then(Value::as_f64)
                    .unwrap_or(100.0),
                _ => 100.0,
            };
            let target = if let Some(pct) = args.get("percent").and_then(Value::as_f64) {
                clamp_ui_zoom(pct)
            } else if let Some(act) = args.get("action").and_then(Value::as_str) {
                match act.trim().to_ascii_lowercase().as_str() {
                    "in" | "zoom_in" => clamp_ui_zoom(current_zoom + 10.0),
                    "out" | "zoom_out" => clamp_ui_zoom(current_zoom - 10.0),
                    "reset" => 100.0,
                    other => {
                        return tool_err(&format!(
                            "invalid zoom action '{other}' (expected 'in', 'out', or 'reset')"
                        ));
                    }
                }
            } else {
                return tool_err("provide either 'percent' (50..=200) or 'action' ('in'|'out'|'reset')");
            };
            return exec_ipc(
                IpcRequest::WindowControl {
                    action: "set_zoom".into(),
                    zoom_percent: Some(target),
                },
                client,
            );
        }

        "delete_song" => {
            let Some(tid) = args.get("track_id").and_then(Value::as_str) else {
                return tool_err("missing required argument 'track_id'");
            };
            let confirmed = args.get("confirm").and_then(Value::as_bool).unwrap_or(false);
            if !confirmed {
                return tool_err(
                    "destructive action blocked: pass `confirm: true` to permanently delete this audio file from disk",
                );
            }
            return exec_ipc(
                IpcRequest::DeleteSong {
                    track_id: tid.to_string(),
                },
                client,
            );
        }

        _ => {}
    }

    let req = match name {
        "get_app_info" => Ok(IpcRequest::GetInfo),
        "rescan_library" => Ok(IpcRequest::Rescan),
        "get_audio_levels" => Ok(IpcRequest::GetAudioLevels),
        "list_songs" => Ok(IpcRequest::ListSongs {
            folder: opt_str(args, "folder"),
            limit: args.get("limit").and_then(Value::as_u64).map(|v| v as usize),
            offset: args
                .get("offset")
                .and_then(Value::as_u64)
                .map(|v| v as usize),
            sort_by: opt_str(args, "sort_by"),
            sort_dir: opt_str(args, "sort_dir"),
        }),
        "search_songs" => match opt_str(args, "query") {
            Some(q) => Ok(IpcRequest::SearchSongs {
                query: q,
                limit: args.get("limit").and_then(Value::as_u64).map(|v| v as usize),
            }),
            None => Err("missing required argument 'query'".to_string()),
        },
        "list_folders" => Ok(IpcRequest::ListFolders),
        "list_sources" => Ok(IpcRequest::ListSources),
        "add_source" => match opt_str(args, "path") {
            Some(path) => Ok(IpcRequest::AddSource { path }),
            None => Err("missing required argument 'path'".to_string()),
        },
        "remove_source" => match opt_str(args, "path") {
            Some(path) => Ok(IpcRequest::RemoveSource { path }),
            None => Err("missing required argument 'path'".to_string()),
        },
        "list_playlists" => Ok(IpcRequest::ListPlaylists),
        "get_playlist" => match opt_str(args, "name") {
            Some(name) => Ok(IpcRequest::GetPlaylist { name }),
            None => Err("missing required argument 'name'".to_string()),
        },
        "create_playlist" => match opt_str(args, "name") {
            Some(name) => Ok(IpcRequest::CreatePlaylist {
                name,
                track_ids: string_array(args.get("track_ids")),
            }),
            None => Err("missing required argument 'name'".to_string()),
        },
        "delete_playlist" => match opt_str(args, "name") {
            Some(name) => Ok(IpcRequest::DeletePlaylist { name }),
            None => Err("missing required argument 'name'".to_string()),
        },
        "add_to_playlist" => match opt_str(args, "name") {
            Some(name) => Ok(IpcRequest::AddToPlaylist {
                name,
                track_ids: string_array(args.get("track_ids")),
            }),
            None => Err("missing required argument 'name'".to_string()),
        },
        "remove_from_playlist" => match (opt_str(args, "name"), opt_str(args, "track_id")) {
            (Some(name), Some(track_id)) => Ok(IpcRequest::RemoveFromPlaylist { name, track_id }),
            _ => Err("missing required arguments 'name' and 'track_id'".to_string()),
        },
        "toggle_favorite" => Ok(IpcRequest::ToggleFavorite {
            track_id: opt_str(args, "track_id"),
        }),
        "get_last_played" => Ok(IpcRequest::GetLastPlayed),
        "clear_last_played" => Ok(IpcRequest::ClearLastPlayed),
        "play" => Ok(IpcRequest::Play {
            track_id: opt_str(args, "track_id"),
            query: opt_str(args, "query"),
            folder: opt_str(args, "folder"),
            playlist: opt_str(args, "playlist"),
        }),
        "pause" => Ok(IpcRequest::Pause),
        "resume" => Ok(IpcRequest::Resume),
        "toggle_pause" => Ok(IpcRequest::TogglePause),
        "stop" => Ok(IpcRequest::Stop),
        "next" => Ok(IpcRequest::Next),
        "previous" => Ok(IpcRequest::Previous),
        "seek" => match args.get("position_secs").and_then(Value::as_f64) {
            Some(pos) => Ok(IpcRequest::Seek { position_secs: pos }),
            None => Err("missing required argument 'position_secs'".to_string()),
        },
        "set_volume" => match args.get("volume").and_then(Value::as_f64) {
            Some(v) => {
                // Accept either 0..=1 or 0..=100 gracefully for AI ergonomics.
                let normalized = if v > 1.0 { (v / 100.0) as f32 } else { v as f32 };
                Ok(IpcRequest::SetVolume {
                    volume: normalized.clamp(0.0, 1.0),
                })
            }
            None => Err("missing required argument 'volume'".to_string()),
        },
        "set_mode" => {
            let shuffle = args.get("shuffle").and_then(Value::as_bool);
            let repeat = match args.get("repeat") {
                Some(v) if !v.is_null() => match serde_json::from_value::<RepeatMode>(v.clone()) {
                    Ok(mode) => Some(mode),
                    Err(_) => {
                        return tool_err(
                            "invalid repeat mode (expected 'off', 'one', or 'all')",
                        );
                    }
                },
                _ => None,
            };
            Ok(IpcRequest::SetMode { shuffle, repeat })
        }
        "get_crossfade" => Ok(IpcRequest::GetTransition),
        "set_crossfade" => match args.get("crossfade_secs").and_then(Value::as_f64) {
            Some(secs) => Ok(IpcRequest::SetTransition {
                crossfade_secs: secs as f32,
            }),
            None => Err("missing required argument 'crossfade_secs'".to_string()),
        },
        "queue_get" => Ok(IpcRequest::QueueGet),
        "queue_set" => Ok(IpcRequest::SetQueue {
            track_ids: string_array(args.get("track_ids")),
            start_id: opt_str(args, "start_id"),
            label: opt_str(args, "label"),
            shuffle: args.get("shuffle").and_then(Value::as_bool),
        }),
        "queue_jump" => match args.get("index").and_then(Value::as_u64) {
            Some(index) => Ok(IpcRequest::JumpQueue {
                index: index as usize,
            }),
            None => Err("missing required argument 'index'".to_string()),
        },
        "queue_add" => Ok(IpcRequest::QueueAdd {
            track_ids: string_array(args.get("track_ids")),
            play_next: args
                .get("play_next")
                .and_then(Value::as_bool)
                .unwrap_or(false),
        }),
        "queue_clear" => Ok(IpcRequest::QueueClear),
        "get_equalizer" => Ok(IpcRequest::GetEq),
        "apply_eq_preset" => match opt_str(args, "preset_id") {
            Some(preset_id) => Ok(IpcRequest::ApplyEqPreset { preset_id }),
            None => Err("missing required argument 'preset_id'".to_string()),
        },
        "save_eq_preset" => match opt_str(args, "name") {
            Some(name) => Ok(IpcRequest::SaveEqPreset {
                name,
                bands: args.get("bands").and_then(Value::as_array).map(|arr| {
                    arr.iter()
                        .filter_map(Value::as_f64)
                        .map(|v| v as f32)
                        .collect()
                }),
                preamp: args
                    .get("preamp")
                    .and_then(Value::as_f64)
                    .map(|v| v as f32),
            }),
            None => Err("missing required argument 'name'".to_string()),
        },
        "delete_eq_preset" => match opt_str(args, "id") {
            Some(id) => Ok(IpcRequest::DeleteEqPreset { id }),
            None => Err("missing required argument 'id'".to_string()),
        },
        "reset_equalizer" => Ok(IpcRequest::ResetEq),
        "get_settings" => Ok(IpcRequest::GetSettings),
        "update_settings" => {
            let patch = args.get("patch").cloned().unwrap_or_else(|| args.clone());
            Ok(IpcRequest::UpdateSettings { patch })
        }
        "reset_settings" => Ok(IpcRequest::ResetSettings {
            scope: opt_str(args, "scope"),
        }),
        "radio_status" => Ok(IpcRequest::RadioStatus),
        "radio_get_store" => Ok(IpcRequest::RadioGetStore),
        "radio_manage_bookmarks" => match opt_str(args, "action") {
            Some(action) => {
                let payload = args.get("payload").cloned().unwrap_or_else(|| args.clone());
                Ok(IpcRequest::RadioManageBookmark { action, payload })
            }
            None => Err("missing required argument 'action'".to_string()),
        },
        "radio_discover" => Ok(IpcRequest::RadioDiscover {
            query: opt_str(args, "query"),
            tag: opt_str(args, "tag"),
            country: opt_str(args, "country"),
            language: opt_str(args, "language"),
            limit: args.get("limit").and_then(Value::as_u64).map(|v| v as usize),
        }),
        "radio_resolve_url" => match opt_str(args, "url") {
            Some(url) => Ok(IpcRequest::RadioResolveUrl { url }),
            None => Err("missing required argument 'url'".to_string()),
        },
        "radio_play_online" => match opt_str(args, "url") {
            Some(url) => Ok(IpcRequest::RadioPlayOnline {
                id: opt_str(args, "id"),
                name: opt_str(args, "name"),
                subtitle: opt_str(args, "subtitle"),
                url,
            }),
            None => Err("missing required argument 'url'".to_string()),
        },
        "radio_disconnect" => Ok(IpcRequest::RadioDisconnect),
        "radio_reconnect" => Ok(IpcRequest::RadioReconnect),
        "radio_stop" => Ok(IpcRequest::RadioStop),
        "fm_hardware_status" => Ok(IpcRequest::FmHardwareStatus),
        "fm_tune" => match args.get("freq_mhz").and_then(Value::as_f64) {
            Some(freq_mhz) => Ok(IpcRequest::FmTune {
                freq_mhz,
                name: opt_str(args, "name"),
                signal_id: opt_str(args, "signal_id"),
            }),
            None => Err("missing required argument 'freq_mhz'".to_string()),
        },
        "fm_stop" => Ok(IpcRequest::FmStop),
        "navigate" => Ok(IpcRequest::Navigate {
            page: opt_str(args, "page"),
            playlist_slug: opt_str(args, "playlist_slug"),
            overlay: opt_str(args, "overlay"),
            search_query: opt_str(args, "search_query"),
            customize_section: opt_str(args, "customize_section"),
        }),
        "window_control" => match opt_str(args, "action") {
            Some(action) => Ok(IpcRequest::WindowControl {
                action,
                zoom_percent: args.get("zoom_percent").and_then(Value::as_f64),
            }),
            None => Err("missing required argument 'action'".to_string()),
        },
        "check_update" => Ok(IpcRequest::CheckUpdate),
        "backup_data" => Ok(IpcRequest::BackupData),
        _ => Err(format!("unknown tool '{name}'")),
    };

    let req = match req {
        Ok(r) => r,
        Err(msg) => return tool_err(&msg),
    };

    exec_ipc(req, client)
}

fn exec_ipc(req: IpcRequest, client: &ZunoClient) -> Value {
    match client.execute(req) {
        IpcResponse::Ok { data } => {
            let text = serde_json::to_string_pretty(&data).unwrap_or_else(|_| "{}".into());
            json!({
                "content": [{ "type": "text", "text": text }],
                "isError": false
            })
        }
        IpcResponse::Err { message } => tool_err(&message),
    }
}

fn tool_ok_json(v: &Value) -> Value {
    let text = serde_json::to_string_pretty(v).unwrap_or_else(|_| "{}".into());
    json!({
        "content": [{ "type": "text", "text": text }],
        "isError": false
    })
}

fn read_resource(uri: &str, client: &ZunoClient) -> Result<String, String> {
    if uri == "zuno://now-playing" {
        let playback = match client.execute(IpcRequest::GetStatus) {
            IpcResponse::Ok { data } => serde_json::to_value(&data).unwrap_or(Value::Null),
            IpcResponse::Err { message } => return Err(message),
        };
        let radio = match client.execute(IpcRequest::RadioStatus) {
            IpcResponse::Ok {
                data: IpcData::Json(v),
            } => v,
            _ => Value::Null,
        };
        return Ok(
            serde_json::to_string_pretty(&json!({ "playback": playback, "radio": radio }))
                .unwrap_or_else(|_| "{}".into()),
        );
    }

    if uri == "zuno://radio" {
        let status = match client.execute(IpcRequest::RadioStatus) {
            IpcResponse::Ok {
                data: IpcData::Json(v),
            } => v,
            _ => Value::Null,
        };
        let store = match client.execute(IpcRequest::RadioGetStore) {
            IpcResponse::Ok {
                data: IpcData::Json(v),
            } => v,
            _ => Value::Null,
        };
        return Ok(
            serde_json::to_string_pretty(&json!({ "status": status, "store": store }))
                .unwrap_or_else(|_| "{}".into()),
        );
    }

    let req = match uri {
        "zuno://queue" => IpcRequest::QueueGet,
        "zuno://library" => IpcRequest::ListSongs {
            folder: None,
            limit: Some(500),
            offset: Some(0),
            sort_by: None,
            sort_dir: None,
        },
        "zuno://playlists" => IpcRequest::ListPlaylists,
        "zuno://settings" => IpcRequest::GetSettings,
        "zuno://equalizer" => IpcRequest::GetEq,
        "zuno://sources" => IpcRequest::ListSources,
        "zuno://last-played" => IpcRequest::GetLastPlayed,
        _ => return Err(format!("unknown resource URI: {uri}")),
    };
    match client.execute(req) {
        IpcResponse::Ok { data } => {
            Ok(serde_json::to_string_pretty(&data).unwrap_or_else(|_| "{}".into()))
        }
        IpcResponse::Err { message } => Err(message),
    }
}

fn resource_definitions() -> Value {
    json!([
        {
            "uri": "zuno://now-playing",
            "name": "Now Playing",
            "description": "Live Zuno playback status (songs + active Online/Offline FM), position, volume, and mode",
            "mimeType": "application/json"
        },
        {
            "uri": "zuno://queue",
            "name": "Active Queue",
            "description": "Ordered tracks currently queued for playback",
            "mimeType": "application/json"
        },
        {
            "uri": "zuno://library",
            "name": "Song Library",
            "description": "Compact metadata index of offline audio tracks inside zuno/songs/ and linked music folders",
            "mimeType": "application/json"
        },
        {
            "uri": "zuno://playlists",
            "name": "Playlists",
            "description": "Zero-copy relative .m3u8 playlists inside zuno/playlists/",
            "mimeType": "application/json"
        },
        {
            "uri": "zuno://settings",
            "name": "App Settings & Customize Studio",
            "description": "All persisted appearance, theme, custom colors, fonts, Display Zoom, visualizer, scrubber, icon pack, sort, and update settings plus valid enum catalog",
            "mimeType": "application/json"
        },
        {
            "uri": "zuno://equalizer",
            "name": "10-Band Studio Equalizer",
            "description": "Active 10-band EQ curve, preamp, limiter, all 16 built-in presets, and user custom presets",
            "mimeType": "application/json"
        },
        {
            "uri": "zuno://radio",
            "name": "Online & Offline FM Radio",
            "description": "Live FM radio playback status, RTL-SDR/V4L2 hardware status, saved custom stations, marked stations, and offline FM frequency bookmarks",
            "mimeType": "application/json"
        },
        {
            "uri": "zuno://sources",
            "name": "Music Folder Sources",
            "description": "Default ~/zuno/songs folder and all zero-copy linked external music directories",
            "mimeType": "application/json"
        },
        {
            "uri": "zuno://last-played",
            "name": "Last Played History",
            "description": "Recently played songs in reverse chronological order",
            "mimeType": "application/json"
        }
    ])
}

fn tool_definitions() -> Value {
    let mut tools: Vec<Value> = Vec::with_capacity(64);
    let mut add = |arr: Value| {
        if let Value::Array(items) = arr {
            tools.extend(items);
        }
    };

    // ── Playback & Audio Engine ──
    add(json!([
        {
            "name": "get_status",
            "description": "Get live playback status (state, current track, position, duration, volume, shuffle, repeat, queue size) AND active Online/Offline FM radio state.",
            "inputSchema": { "type": "object", "properties": {} }
        },
        {
            "name": "play",
            "description": "Play a track by ID, fuzzy query, subfolder, or .m3u8 playlist name (automatically stops active FM radio).",
            "inputSchema": {
                "type": "object",
                "properties": {
                    "track_id": { "type": "string" },
                    "query": { "type": "string" },
                    "folder": { "type": "string" },
                    "playlist": { "type": "string" }
                }
            }
        },
        {
            "name": "pause",
            "description": "Pause current song playback (or disconnect active FM radio stream).",
            "inputSchema": { "type": "object", "properties": {} }
        },
        {
            "name": "resume",
            "description": "Resume paused/stopped song playback (or reconnect disconnected FM radio).",
            "inputSchema": { "type": "object", "properties": {} }
        },
        {
            "name": "toggle_pause",
            "description": "Toggle play/pause on the currently active song or FM radio stream.",
            "inputSchema": { "type": "object", "properties": {} }
        },
        {
            "name": "stop",
            "description": "Stop all playback (both local songs and FM radio).",
            "inputSchema": { "type": "object", "properties": {} }
        },
        {
            "name": "next",
            "description": "Skip to the next track in the queue (or step to the next FM station when FM is active).",
            "inputSchema": { "type": "object", "properties": {} }
        },
        {
            "name": "previous",
            "description": "Go back to the previous track in the queue (or previous FM station when FM is active).",
            "inputSchema": { "type": "object", "properties": {} }
        },
        {
            "name": "seek",
            "description": "Seek to a position in seconds within the current track.",
            "inputSchema": {
                "type": "object",
                "properties": { "position_secs": { "type": "number" } },
                "required": ["position_secs"]
            }
        },
        {
            "name": "set_volume",
            "description": "Set playback volume (0.0 to 1.0, or 0 to 100).",
            "inputSchema": {
                "type": "object",
                "properties": { "volume": { "type": "number" } },
                "required": ["volume"]
            }
        },
        {
            "name": "set_mode",
            "description": "Set shuffle (true/false) and/or repeat mode ('off', 'one', 'all').",
            "inputSchema": {
                "type": "object",
                "properties": {
                    "shuffle": { "type": "boolean" },
                    "repeat": { "type": "string", "enum": ["off", "one", "all"] }
                }
            }
        },
        {
            "name": "get_crossfade",
            "description": "Get the current audio transition / crossfade duration in seconds.",
            "inputSchema": { "type": "object", "properties": {} }
        },
        {
            "name": "set_crossfade",
            "description": "Set audio crossfade / transition duration in seconds (0 = off, up to 10.0s). Syncs live with both audio engine and Customize Studio.",
            "inputSchema": {
                "type": "object",
                "properties": { "crossfade_secs": { "type": "number", "minimum": 0, "maximum": 10 } },
                "required": ["crossfade_secs"]
            }
        },
        {
            "name": "get_audio_levels",
            "description": "Read live 24-band FFT audio spectrum levels plus bass, mid, treble, energy, and peak meters.",
            "inputSchema": { "type": "object", "properties": {} }
        }
    ]));

    // ── Queue Management ──
    add(json!([
        {
            "name": "queue_get",
            "description": "Return the active playback queue and current index.",
            "inputSchema": { "type": "object", "properties": {} }
        },
        {
            "name": "queue_set",
            "description": "Replace the active playback queue with an ordered list of track IDs and start playback.",
            "inputSchema": {
                "type": "object",
                "properties": {
                    "track_ids": { "type": "array", "items": { "type": "string" } },
                    "start_id": { "type": "string", "description": "Optional track ID to start playing first" },
                    "label": { "type": "string", "description": "Optional display label (e.g. 'Focus Mix')" },
                    "shuffle": { "type": "boolean" }
                },
                "required": ["track_ids"]
            }
        },
        {
            "name": "queue_jump",
            "description": "Jump directly to a 0-based index in the active playback queue and start playing it.",
            "inputSchema": {
                "type": "object",
                "properties": { "index": { "type": "integer", "minimum": 0 } },
                "required": ["index"]
            }
        },
        {
            "name": "queue_add",
            "description": "Add track IDs to the playback queue (at the end, or immediately up next).",
            "inputSchema": {
                "type": "object",
                "properties": {
                    "track_ids": { "type": "array", "items": { "type": "string" } },
                    "play_next": { "type": "boolean", "default": false }
                },
                "required": ["track_ids"]
            }
        },
        {
            "name": "queue_clear",
            "description": "Clear the active playback queue and stop playback.",
            "inputSchema": { "type": "object", "properties": {} }
        }
    ]));

    // ── Library, Folders, External Sources, Favorites & History ──
    add(json!([
        {
            "name": "rescan_library",
            "description": "Rescan zuno/songs/ and all linked external music folders for new/moved files and auto-heal .m3u8 playlists.",
            "inputSchema": { "type": "object", "properties": {} }
        },
        {
            "name": "list_songs",
            "description": "List offline songs, optionally filtered by subfolder and sorted by name, artist, album, time, size, or duration.",
            "inputSchema": {
                "type": "object",
                "properties": {
                    "folder": { "type": "string", "description": "Optional subfolder label" },
                    "sort_by": { "type": "string", "enum": ["name", "artist", "album", "time", "size", "duration"] },
                    "sort_dir": { "type": "string", "enum": ["asc", "desc"] },
                    "limit": { "type": "integer", "default": 200 },
                    "offset": { "type": "integer", "default": 0 }
                }
            }
        },
        {
            "name": "search_songs",
            "description": "Fuzzy & typo-tolerant search across offline songs by title, artist, album, genre, folder, or filename.",
            "inputSchema": {
                "type": "object",
                "properties": {
                    "query": { "type": "string" },
                    "limit": { "type": "integer", "default": 50 }
                },
                "required": ["query"]
            }
        },
        {
            "name": "delete_song",
            "description": "Permanently delete a song file from disk and remove it from playlists. Requires `confirm: true`.",
            "inputSchema": {
                "type": "object",
                "properties": {
                    "track_id": { "type": "string" },
                    "confirm": { "type": "boolean", "description": "Must be true to confirm permanent file deletion" }
                },
                "required": ["track_id", "confirm"]
            }
        },
        {
            "name": "list_folders",
            "description": "List subfolders across the library with track counts and total durations.",
            "inputSchema": { "type": "object", "properties": {} }
        },
        {
            "name": "list_sources",
            "description": "List all configured music folders (default ~/zuno/songs plus zero-copy linked external directories).",
            "inputSchema": { "type": "object", "properties": {} }
        },
        {
            "name": "add_source",
            "description": "Link an external music directory zero-copy (supports ~/ paths; never duplicates audio files).",
            "inputSchema": {
                "type": "object",
                "properties": { "path": { "type": "string", "description": "Directory path (e.g. '~/Music')" } },
                "required": ["path"]
            }
        },
        {
            "name": "remove_source",
            "description": "Unlink a previously linked external music directory (audio files on disk are never deleted).",
            "inputSchema": {
                "type": "object",
                "properties": { "path": { "type": "string" } },
                "required": ["path"]
            }
        },
        {
            "name": "toggle_favorite",
            "description": "Add or remove a track from the Favorites playlist (defaults to currently playing track if track_id is omitted).",
            "inputSchema": {
                "type": "object",
                "properties": { "track_id": { "type": "string" } }
            }
        },
        {
            "name": "get_last_played",
            "description": "Return the Last Played song history (most recent first).",
            "inputSchema": { "type": "object", "properties": {} }
        },
        {
            "name": "clear_last_played",
            "description": "Clear the Last Played song history.",
            "inputSchema": { "type": "object", "properties": {} }
        }
    ]));

    // ── Playlists ──
    add(json!([
        {
            "name": "list_playlists",
            "description": "List all relative .m3u8 playlists in zuno/playlists/.",
            "inputSchema": { "type": "object", "properties": {} }
        },
        {
            "name": "get_playlist",
            "description": "Get playlist details and resolved tracks for a .m3u8 playlist by name or slug.",
            "inputSchema": {
                "type": "object",
                "properties": { "name": { "type": "string" } },
                "required": ["name"]
            }
        },
        {
            "name": "create_playlist",
            "description": "Create a new zero-copy .m3u8 playlist in zuno/playlists/ pointing to track IDs.",
            "inputSchema": {
                "type": "object",
                "properties": {
                    "name": { "type": "string", "description": "Playlist name (e.g. 'Favorites' or 'Focus')" },
                    "track_ids": { "type": "array", "items": { "type": "string" } }
                },
                "required": ["name"]
            }
        },
        {
            "name": "delete_playlist",
            "description": "Delete a .m3u8 playlist file (never deletes audio files in zuno/songs/).",
            "inputSchema": {
                "type": "object",
                "properties": { "name": { "type": "string" } },
                "required": ["name"]
            }
        },
        {
            "name": "add_to_playlist",
            "description": "Add track pointers (by track ID) to an existing .m3u8 playlist without copying files.",
            "inputSchema": {
                "type": "object",
                "properties": {
                    "name": { "type": "string" },
                    "track_ids": { "type": "array", "items": { "type": "string" } }
                },
                "required": ["name", "track_ids"]
            }
        },
        {
            "name": "remove_from_playlist",
            "description": "Remove a track pointer from a .m3u8 playlist (audio file remains untouched).",
            "inputSchema": {
                "type": "object",
                "properties": {
                    "name": { "type": "string" },
                    "track_id": { "type": "string" }
                },
                "required": ["name", "track_id"]
            }
        }
    ]));

    // ── 10-Band Studio Equalizer & Presets ──
    add(json!([
        {
            "name": "get_equalizer",
            "description": "Get active 10-band EQ state (enabled, preamp, limiter, bands for 32Hz..16kHz), all 16 built-in presets, and saved custom presets.",
            "inputSchema": { "type": "object", "properties": {} }
        },
        {
            "name": "set_equalizer",
            "description": "Update 10-band studio EQ live (enable/disable, preamp dB -12..12, soft limiter, 10 band gains in dB, or apply a preset_id). Supports partial updates.",
            "inputSchema": {
                "type": "object",
                "properties": {
                    "enabled": { "type": "boolean" },
                    "preamp": { "type": "number", "minimum": -12, "maximum": 12 },
                    "limiter": { "type": "boolean" },
                    "bands": {
                        "type": "array",
                        "items": { "type": "number", "minimum": -12, "maximum": 12 },
                        "minItems": 10,
                        "maxItems": 10,
                        "description": "10 ISO gains in dB for [32, 64, 125, 250, 500, 1k, 2k, 4k, 8k, 16k] Hz"
                    },
                    "preset_id": { "type": "string", "description": "Optional built-in or custom preset ID/name" }
                }
            }
        },
        {
            "name": "apply_eq_preset",
            "description": "Apply a built-in EQ preset (flat, studio, late-night, headphones, bass-boost, deep-sub, electronic, hip-hop, vocal-boost, podcast, treble-air, acoustic, rock, jazz, classical, lofi) or saved custom preset by ID or name.",
            "inputSchema": {
                "type": "object",
                "properties": { "preset_id": { "type": "string" } },
                "required": ["preset_id"]
            }
        },
        {
            "name": "save_eq_preset",
            "description": "Save the current (or custom) 10-band EQ curve as a named custom preset.",
            "inputSchema": {
                "type": "object",
                "properties": {
                    "name": { "type": "string" },
                    "bands": { "type": "array", "items": { "type": "number" }, "minItems": 10, "maxItems": 10 },
                    "preamp": { "type": "number", "minimum": -12, "maximum": 12 }
                },
                "required": ["name"]
            }
        },
        {
            "name": "delete_eq_preset",
            "description": "Delete a saved custom EQ preset by ID.",
            "inputSchema": {
                "type": "object",
                "properties": { "id": { "type": "string" } },
                "required": ["id"]
            }
        },
        {
            "name": "reset_equalizer",
            "description": "Reset all 10 EQ bands and preamp to Flat (0 dB).",
            "inputSchema": { "type": "object", "properties": {} }
        }
    ]));

    // ── Online & Offline FM Radio ──
    add(json!([
        {
            "name": "radio_status",
            "description": "Get live Online/Offline FM radio playback state and RTL-SDR/V4L2 FM hardware status.",
            "inputSchema": { "type": "object", "properties": {} }
        },
        {
            "name": "radio_discover",
            "description": "Search 45,000+ live Online FM radio stations worldwide by query, genre tag, country, or language.",
            "inputSchema": {
                "type": "object",
                "properties": {
                    "query": { "type": "string" },
                    "tag": { "type": "string" },
                    "country": { "type": "string" },
                    "language": { "type": "string" },
                    "limit": { "type": "integer", "default": 40, "maximum": 60 }
                }
            }
        },
        {
            "name": "radio_resolve_url",
            "description": "Validate a radio stream link, resolve .pls/.m3u playlists, detect HLS, and probe ICY station metadata.",
            "inputSchema": {
                "type": "object",
                "properties": { "url": { "type": "string" } },
                "required": ["url"]
            }
        },
        {
            "name": "radio_play_online",
            "description": "Stream an Online FM station URL natively through Zuno's Rust engine (with 10-band EQ, FFT visualizer, and unified OS media card).",
            "inputSchema": {
                "type": "object",
                "properties": {
                    "url": { "type": "string", "description": "Direct audio stream, .m3u8 HLS, .pls, or .m3u URL" },
                    "name": { "type": "string", "description": "Station display name" },
                    "subtitle": { "type": "string", "description": "Optional subtitle (genre, country, bitrate)" },
                    "id": { "type": "string", "description": "Optional station ID" }
                },
                "required": ["url"]
            }
        },
        {
            "name": "radio_disconnect",
            "description": "Disconnect the active Online or Offline FM stream (retains the station ready for reconnect).",
            "inputSchema": { "type": "object", "properties": {} }
        },
        {
            "name": "radio_reconnect",
            "description": "Reconnect the last active Online or Offline FM station.",
            "inputSchema": { "type": "object", "properties": {} }
        },
        {
            "name": "radio_stop",
            "description": "Stop and clear FM radio playback completely.",
            "inputSchema": { "type": "object", "properties": {} }
        },
        {
            "name": "fm_hardware_status",
            "description": "Check Offline FM hardware receiver availability (RTL-SDR USB dongle / V4L2 FM tuner).",
            "inputSchema": { "type": "object", "properties": {} }
        },
        {
            "name": "fm_tune",
            "description": "Tune the Offline FM hardware receiver (RTL-SDR/V4L2) to an FM frequency in MHz (64.0..108.0).",
            "inputSchema": {
                "type": "object",
                "properties": {
                    "freq_mhz": { "type": "number", "minimum": 64.0, "maximum": 108.0 },
                    "name": { "type": "string" },
                    "signal_id": { "type": "string" }
                },
                "required": ["freq_mhz"]
            }
        },
        {
            "name": "fm_stop",
            "description": "Stop the Offline FM hardware tuner stream.",
            "inputSchema": { "type": "object", "properties": {} }
        },
        {
            "name": "radio_get_store",
            "description": "Get persisted FM Radio bookmarks: marked online station IDs, saved custom online links, offline FM frequency signals, last dialed frequency, and FM band.",
            "inputSchema": { "type": "object", "properties": {} }
        },
        {
            "name": "radio_manage_bookmarks",
            "description": "Manage FM Radio bookmarks & tuner store: add/delete custom online links, mark/unmark stations, save/edit/delete offline FM frequency signals, set FM band, or set dial frequency.",
            "inputSchema": {
                "type": "object",
                "properties": {
                    "action": {
                        "type": "string",
                        "enum": [
                            "add_custom_online",
                            "delete_custom_online",
                            "toggle_mark_online",
                            "upsert_offline_signal",
                            "delete_offline_signal",
                            "set_band",
                            "set_dial_freq"
                        ]
                    },
                    "payload": {
                        "type": "object",
                        "description": "Action parameters (e.g. {name,url,category,country,mark} for add_custom_online; {id} for delete/toggle; {freq_mhz,name,region,genre,notes,band,marked} for upsert_offline_signal; {band} for set_band; {freq_mhz} for set_dial_freq)"
                    }
                },
                "required": ["action"]
            }
        }
    ]));

    // ── Customize Studio, Display Zoom, Navigation, Window Control & Maintenance ──
    add(json!([
        {
            "name": "get_settings",
            "description": "Get ALL Zuno settings (appearance, themes, customColors, fonts, Display Zoom, visualizer, scrubber, icon pack, navigation, titlebar, window radius, crossfade, EQ, library sort preference, auto-update preference) PLUS the complete catalog of valid option values.",
            "inputSchema": { "type": "object", "properties": {} }
        },
        {
            "name": "update_settings",
            "description": "Update ANY Zuno setting live (updates both ~/zuno/.zuno/settings.json and the live running GUI immediately). Accepts nested `{ appearance: {...}, eq: {...}, sort_pref: { field, dir }, auto_check_updates }` OR flat appearance keys directly (e.g. `{ theme: 'oled', mode: 'dark', uiZoom: 110, visualizerStyle: 'wave-bars', iconPack: 'skiper99', crossfadeSecs: 3 }`).",
            "inputSchema": {
                "type": "object",
                "properties": {
                    "patch": {
                        "type": "object",
                        "description": "Partial settings object (nested or flat appearance fields)"
                    }
                }
            }
        },
        {
            "name": "reset_settings",
            "description": "Reset Customize Studio appearance settings (or 'all' settings including EQ/sort) back to defaults.",
            "inputSchema": {
                "type": "object",
                "properties": {
                    "scope": { "type": "string", "enum": ["appearance", "all"], "default": "appearance" }
                }
            }
        },
        {
            "name": "set_zoom",
            "description": "Set Chrome-style Display Zoom (50% to 200%) or zoom in/out/reset by 10% steps. Live-scales the desktop window and persists to settings.",
            "inputSchema": {
                "type": "object",
                "properties": {
                    "percent": { "type": "number", "minimum": 50, "maximum": 200 },
                    "action": { "type": "string", "enum": ["in", "out", "reset"] }
                }
            }
        },
        {
            "name": "navigate",
            "description": "Navigate the live Zuno GUI to any page, playlist, Customize Studio section, or open/close overlays (search, music folders, update dialog).",
            "inputSchema": {
                "type": "object",
                "properties": {
                    "page": {
                        "type": "string",
                        "enum": ["home", "recent", "playlists", "playlist", "radio", "equalizer", "customize", "playing"]
                    },
                    "playlist_slug": { "type": "string", "description": "Required when page='playlist'" },
                    "customize_section": { "type": "string", "description": "Optional Customize Studio section ID (e.g. 'themes', 'colors', 'fonts', 'zoom', 'visualizer', 'scrubber', 'icon_packs', 'layout', 'window_radius', 'titlebar', 'navigation')" },
                    "overlay": { "type": "string", "enum": ["search", "folders", "update_dialog", "close"] },
                    "search_query": { "type": "string", "description": "Optional query to prefill when overlay='search'" }
                }
            }
        },
        {
            "name": "window_control",
            "description": "Control the live Zuno desktop window: show/focus from tray, minimize, maximize/unmaximize, fullscreen, close to tray, quit app, set zoom, or inspect window status.",
            "inputSchema": {
                "type": "object",
                "properties": {
                    "action": {
                        "type": "string",
                        "enum": [
                            "status",
                            "show",
                            "minimize",
                            "maximize",
                            "unmaximize",
                            "toggle_maximize",
                            "fullscreen",
                            "unfullscreen",
                            "toggle_fullscreen",
                            "close_to_tray",
                            "set_zoom",
                            "quit"
                        ]
                    },
                    "zoom_percent": { "type": "number", "minimum": 50, "maximum": 200 }
                },
                "required": ["action"]
            }
        },
        {
            "name": "get_app_info",
            "description": "Get Zuno version, paths (root/songs/playlists/settings/radio/socket), library counts, live GUI status, radio/FM status, and suggested music folders.",
            "inputSchema": { "type": "object", "properties": {} }
        },
        {
            "name": "check_update",
            "description": "Check GitHub Releases for a newer Zuno version (returns version, release notes, and download info without installing).",
            "inputSchema": { "type": "object", "properties": {} }
        },
        {
            "name": "backup_data",
            "description": "Create a zero-copy backup of playlists, folder links, playback state, radio bookmarks, and settings into ~/zuno/.zuno/backups/ (never duplicates songs).",
            "inputSchema": { "type": "object", "properties": {} }
        }
    ]));

    Value::Array(tools)
}

fn opt_str(args: &Value, key: &str) -> Option<String> {
    args.get(key).and_then(Value::as_str).map(str::to_string)
}

fn string_array(v: Option<&Value>) -> Vec<String> {
    v.and_then(Value::as_array)
        .map(|arr| {
            arr.iter()
                .filter_map(Value::as_str)
                .map(str::to_string)
                .collect()
        })
        .unwrap_or_default()
}

fn jsonrpc_ok(id: Value, result: Value) -> Value {
    json!({
        "jsonrpc": "2.0",
        "id": id,
        "result": result
    })
}

fn jsonrpc_error(id: Value, code: i32, message: &str) -> Value {
    json!({
        "jsonrpc": "2.0",
        "id": id,
        "error": { "code": code, "message": message }
    })
}

fn tool_err(message: &str) -> Value {
    json!({
        "content": [{ "type": "text", "text": format!("error: {message}") }],
        "isError": true
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;
    use tempfile::tempdir;
    use zuno_core::ZunoPaths;

    #[test]
    fn mcp_initialize_tools_and_playlist_flow() {
        let tmp = tempdir().unwrap();
        let paths = ZunoPaths::new(tmp.path());
        paths.ensure_dirs().unwrap();
        fs::write(paths.songs_dir().join("zen.mp3"), b"fake-zen-track-bytes").unwrap();

        let client = ZunoClient::new(paths);

        // 1. initialize
        let init = handle_jsonrpc_message(
            r#"{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-03-26"}}"#,
            &client,
        )
        .unwrap();
        assert_eq!(init["result"]["serverInfo"]["name"], "zuno-mcp");

        // 2. tools/list — verify full-control catalog
        let tools = handle_jsonrpc_message(
            r#"{"jsonrpc":"2.0","id":2,"method":"tools/list"}"#,
            &client,
        )
        .unwrap();
        assert!(tools["result"]["tools"].as_array().unwrap().len() >= 55);

        // 3. list_songs tool call
        let list = handle_jsonrpc_message(
            r#"{"jsonrpc":"2.0","id":3,"method":"tools/call","params":{"name":"list_songs","arguments":{}}}"#,
            &client,
        )
        .unwrap();
        assert_eq!(list["result"]["isError"], false);
        let payload_text = list["result"]["content"][0]["text"].as_str().unwrap();
        let parsed: Value = serde_json::from_str(payload_text).unwrap();
        let track_id = parsed["value"]["tracks"][0]["id"].as_str().unwrap().to_string();

        // 4. create_playlist & toggle_favorite via MCP
        let create_req = json!({
            "jsonrpc": "2.0",
            "id": 4,
            "method": "tools/call",
            "params": {
                "name": "create_playlist",
                "arguments": { "name": "Focus", "track_ids": [&track_id] }
            }
        });
        let created = handle_jsonrpc_message(&create_req.to_string(), &client).unwrap();
        assert_eq!(created["result"]["isError"], false);

        let fav_req = json!({
            "jsonrpc": "2.0",
            "id": 5,
            "method": "tools/call",
            "params": {
                "name": "toggle_favorite",
                "arguments": { "track_id": &track_id }
            }
        });
        let fav = handle_jsonrpc_message(&fav_req.to_string(), &client).unwrap();
        assert_eq!(fav["result"]["isError"], false);
        assert!(fav["result"]["content"][0]["text"].as_str().unwrap().contains("\"favorited\": true"));

        // 5. Full settings, Display Zoom, EQ presets & Radio bookmarks via MCP
        let upd_settings = json!({
            "jsonrpc": "2.0",
            "id": 6,
            "method": "tools/call",
            "params": {
                "name": "update_settings",
                "arguments": {
                    "patch": {
                        "theme": "oled",
                        "mode": "dark",
                        "visualizerStyle": "wave-bars",
                        "uiZoom": 120
                    }
                }
            }
        });
        let upd = handle_jsonrpc_message(&upd_settings.to_string(), &client).unwrap();
        assert_eq!(upd["result"]["isError"], false);
        assert!(upd["result"]["content"][0]["text"].as_str().unwrap().contains("\"oled\""));

        let eq_preset = json!({
            "jsonrpc": "2.0",
            "id": 7,
            "method": "tools/call",
            "params": {
                "name": "apply_eq_preset",
                "arguments": { "preset_id": "studio" }
            }
        });
        let eq_res = handle_jsonrpc_message(&eq_preset.to_string(), &client).unwrap();
        assert_eq!(eq_res["result"]["isError"], false);

        let bm_req = json!({
            "jsonrpc": "2.0",
            "id": 8,
            "method": "tools/call",
            "params": {
                "name": "radio_manage_bookmarks",
                "arguments": {
                    "action": "upsert_offline_signal",
                    "payload": { "freq_mhz": 98.3, "name": "Mirchi", "region": "Chennai" }
                }
            }
        });
        let bm_res = handle_jsonrpc_message(&bm_req.to_string(), &client).unwrap();
        assert_eq!(bm_res["result"]["isError"], false);
        assert!(bm_res["result"]["content"][0]["text"].as_str().unwrap().contains("Mirchi"));

        // 6. delete_song safety guard blocks without confirm: true
        let del_guard = json!({
            "jsonrpc": "2.0",
            "id": 9,
            "method": "tools/call",
            "params": {
                "name": "delete_song",
                "arguments": { "track_id": &track_id }
            }
        });
        let del_res = handle_jsonrpc_message(&del_guard.to_string(), &client).unwrap();
        assert_eq!(del_res["result"]["isError"], true);

        // 7. resources/list & resources/read
        let resources = handle_jsonrpc_message(
            r#"{"jsonrpc":"2.0","id":10,"method":"resources/list"}"#,
            &client,
        )
        .unwrap();
        assert_eq!(resources["result"]["resources"].as_array().unwrap().len(), 9);

        let res = handle_jsonrpc_message(
            r#"{"jsonrpc":"2.0","id":11,"method":"resources/read","params":{"uri":"zuno://settings"}}"#,
            &client,
        )
        .unwrap();
        let text = res["result"]["contents"][0]["text"].as_str().unwrap();
        assert!(text.contains("\"oled\""));
        assert!(text.contains("\"uiZoom\": 120"));
    }
}
