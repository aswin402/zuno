use crate::ZunoClient;
use serde_json::{Value, json};
use std::io::{self, BufRead, Write};
use std::sync::Arc;
use zuno_core::RepeatMode;
use zuno_core::ipc::{IpcRequest, IpcResponse};

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
                    "instructions": "Zuno offline music player. Songs live in zuno/songs/ and zero-copy .m3u8 playlists live in zuno/playlists/. Use tools to browse, search, curate playlists, and control playback."
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
    let req = match name {
        "get_status" => Ok(IpcRequest::GetStatus),
        "rescan_library" => Ok(IpcRequest::Rescan),
        "list_songs" => Ok(IpcRequest::ListSongs {
            folder: args.get("folder").and_then(Value::as_str).map(str::to_string),
            limit: args.get("limit").and_then(Value::as_u64).map(|v| v as usize),
            offset: args
                .get("offset")
                .and_then(Value::as_u64)
                .map(|v| v as usize),
        }),
        "search_songs" => match args.get("query").and_then(Value::as_str) {
            Some(q) => Ok(IpcRequest::SearchSongs {
                query: q.to_string(),
                limit: args.get("limit").and_then(Value::as_u64).map(|v| v as usize),
            }),
            None => Err("missing required argument 'query'".to_string()),
        },
        "list_folders" => Ok(IpcRequest::ListFolders),
        "list_playlists" => Ok(IpcRequest::ListPlaylists),
        "get_playlist" => match args.get("name").and_then(Value::as_str) {
            Some(n) => Ok(IpcRequest::GetPlaylist {
                name: n.to_string(),
            }),
            None => Err("missing required argument 'name'".to_string()),
        },
        "create_playlist" => match args.get("name").and_then(Value::as_str) {
            Some(n) => Ok(IpcRequest::CreatePlaylist {
                name: n.to_string(),
                track_ids: string_array(args.get("track_ids")),
            }),
            None => Err("missing required argument 'name'".to_string()),
        },
        "delete_playlist" => match args.get("name").and_then(Value::as_str) {
            Some(n) => Ok(IpcRequest::DeletePlaylist {
                name: n.to_string(),
            }),
            None => Err("missing required argument 'name'".to_string()),
        },
        "add_to_playlist" => match args.get("name").and_then(Value::as_str) {
            Some(n) => Ok(IpcRequest::AddToPlaylist {
                name: n.to_string(),
                track_ids: string_array(args.get("track_ids")),
            }),
            None => Err("missing required argument 'name'".to_string()),
        },
        "remove_from_playlist" => {
            let n = args.get("name").and_then(Value::as_str);
            let tid = args.get("track_id").and_then(Value::as_str);
            match (n, tid) {
                (Some(n), Some(tid)) => Ok(IpcRequest::RemoveFromPlaylist {
                    name: n.to_string(),
                    track_id: tid.to_string(),
                }),
                _ => Err("missing required arguments 'name' and 'track_id'".to_string()),
            }
        }
        "play" => Ok(IpcRequest::Play {
            track_id: args
                .get("track_id")
                .and_then(Value::as_str)
                .map(str::to_string),
            query: args.get("query").and_then(Value::as_str).map(str::to_string),
            folder: args.get("folder").and_then(Value::as_str).map(str::to_string),
            playlist: args
                .get("playlist")
                .and_then(Value::as_str)
                .map(str::to_string),
        }),
        "pause" => Ok(IpcRequest::Pause),
        "resume" => Ok(IpcRequest::Resume),
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
        "queue_get" => Ok(IpcRequest::QueueGet),
        "queue_add" => Ok(IpcRequest::QueueAdd {
            track_ids: string_array(args.get("track_ids")),
            play_next: args
                .get("play_next")
                .and_then(Value::as_bool)
                .unwrap_or(false),
        }),
        "queue_clear" => Ok(IpcRequest::QueueClear),
        _ => Err(format!("unknown tool '{name}'")),
    };

    let req = match req {
        Ok(r) => r,
        Err(msg) => return tool_err(&msg),
    };

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

fn read_resource(uri: &str, client: &ZunoClient) -> Result<String, String> {
    let req = match uri {
        "zuno://now-playing" => IpcRequest::GetStatus,
        "zuno://queue" => IpcRequest::QueueGet,
        "zuno://library" => IpcRequest::ListSongs {
            folder: None,
            limit: Some(500),
            offset: Some(0),
        },
        "zuno://playlists" => IpcRequest::ListPlaylists,
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
            "description": "Live Zuno playback status, current track, position, volume, and mode",
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
            "description": "Compact metadata index of offline audio tracks inside zuno/songs/",
            "mimeType": "application/json"
        },
        {
            "uri": "zuno://playlists",
            "name": "Playlists",
            "description": "Zero-copy relative .m3u8 playlists inside zuno/playlists/",
            "mimeType": "application/json"
        }
    ])
}

fn tool_definitions() -> Value {
    json!([
        {
            "name": "get_status",
            "description": "Get live playback status (state, current track, position, volume, shuffle, repeat, queue size).",
            "inputSchema": { "type": "object", "properties": {} }
        },
        {
            "name": "rescan_library",
            "description": "Rescan zuno/songs/ for new/moved files and auto-heal relative .m3u8 playlists.",
            "inputSchema": { "type": "object", "properties": {} }
        },
        {
            "name": "list_songs",
            "description": "List offline songs in zuno/songs/, optionally filtered by subfolder.",
            "inputSchema": {
                "type": "object",
                "properties": {
                    "folder": { "type": "string", "description": "Optional subfolder inside zuno/songs/" },
                    "limit": { "type": "integer", "default": 200 },
                    "offset": { "type": "integer", "default": 0 }
                }
            }
        },
        {
            "name": "search_songs",
            "description": "Fuzzy-search offline songs by title, artist, album, genre, folder, or filename.",
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
            "name": "list_folders",
            "description": "List subfolders inside zuno/songs/ with track counts and total durations.",
            "inputSchema": { "type": "object", "properties": {} }
        },
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
        },
        {
            "name": "play",
            "description": "Play a track by ID, fuzzy query, subfolder, or .m3u8 playlist name.",
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
            "description": "Pause current playback.",
            "inputSchema": { "type": "object", "properties": {} }
        },
        {
            "name": "resume",
            "description": "Resume paused or stopped playback.",
            "inputSchema": { "type": "object", "properties": {} }
        },
        {
            "name": "stop",
            "description": "Stop playback.",
            "inputSchema": { "type": "object", "properties": {} }
        },
        {
            "name": "next",
            "description": "Skip to the next track in the queue.",
            "inputSchema": { "type": "object", "properties": {} }
        },
        {
            "name": "previous",
            "description": "Go back to the previous track in the queue.",
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
            "name": "queue_get",
            "description": "Return the active playback queue and current index.",
            "inputSchema": { "type": "object", "properties": {} }
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
    ])
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

        // 2. tools/list
        let tools = handle_jsonrpc_message(
            r#"{"jsonrpc":"2.0","id":2,"method":"tools/list"}"#,
            &client,
        )
        .unwrap();
        assert!(tools["result"]["tools"].as_array().unwrap().len() >= 18);

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

        // 4. create_playlist via MCP
        let create_req = json!({
            "jsonrpc": "2.0",
            "id": 4,
            "method": "tools/call",
            "params": {
                "name": "create_playlist",
                "arguments": { "name": "Favorites", "track_ids": [track_id] }
            }
        });
        let created = handle_jsonrpc_message(&create_req.to_string(), &client).unwrap();
        assert_eq!(created["result"]["isError"], false);

        // 5. resources/read zuno://playlists
        let res = handle_jsonrpc_message(
            r#"{"jsonrpc":"2.0","id":5,"method":"resources/read","params":{"uri":"zuno://playlists"}}"#,
            &client,
        )
        .unwrap();
        assert!(
            res["result"]["contents"][0]["text"]
                .as_str()
                .unwrap()
                .contains("favorites.m3u8")
        );
    }
}
