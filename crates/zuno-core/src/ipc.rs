use crate::models::{FolderSummary, PlaybackStatus, Playlist, RepeatMode, Track};
use serde::{Deserialize, Serialize};

/// Shared IPC request protocol between Tauri GUI, `zuno-mcp`, and CLI.
/// Serialized as single-line NDJSON over Unix Domain Sockets (Linux) or HTTP.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "op", rename_all = "snake_case")]
pub enum IpcRequest {
    Ping,
    Rescan,
    GetStatus,
    ListSongs {
        folder: Option<String>,
        limit: Option<usize>,
        offset: Option<usize>,
    },
    SearchSongs {
        query: String,
        limit: Option<usize>,
    },
    ListFolders,
    ListPlaylists,
    GetPlaylist {
        name: String,
    },
    CreatePlaylist {
        name: String,
        track_ids: Vec<String>,
    },
    DeletePlaylist {
        name: String,
    },
    AddToPlaylist {
        name: String,
        track_ids: Vec<String>,
    },
    RemoveFromPlaylist {
        name: String,
        track_id: String,
    },
    Play {
        track_id: Option<String>,
        query: Option<String>,
        folder: Option<String>,
        playlist: Option<String>,
    },
    Pause,
    Resume,
    TogglePause,
    Stop,
    Next,
    Previous,
    Seek {
        position_secs: f64,
    },
    SetVolume {
        volume: f32,
    },
    SetMode {
        shuffle: Option<bool>,
        repeat: Option<RepeatMode>,
    },
    QueueGet,
    QueueAdd {
        track_ids: Vec<String>,
        play_next: bool,
    },
    QueueClear,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "status", rename_all = "snake_case")]
pub enum IpcResponse {
    Ok { data: IpcData },
    Err { message: String },
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "type", content = "value", rename_all = "snake_case")]
pub enum IpcData {
    Pong {
        version: String,
    },
    Status(PlaybackStatus),
    Tracks {
        total: usize,
        tracks: Vec<Track>,
    },
    Folders(Vec<FolderSummary>),
    Playlists(Vec<Playlist>),
    PlaylistDetail {
        playlist: Playlist,
        tracks: Vec<Track>,
    },
    Queue {
        current_index: Option<usize>,
        tracks: Vec<Track>,
    },
    Message(String),
}
