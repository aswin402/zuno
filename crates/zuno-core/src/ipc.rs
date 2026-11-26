use crate::models::{FolderSummary, MusicSource, PlaybackStatus, Playlist, RepeatMode, Track};
use serde::{Deserialize, Serialize};
use serde_json::Value;

/// Shared IPC request protocol between Tauri GUI, `zuno-mcp`, and CLI.
/// Serialized as single-line NDJSON over Unix Domain Sockets (Linux) or HTTP.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "op", rename_all = "snake_case")]
pub enum IpcRequest {
    Ping,
    GetInfo,
    Rescan,
    GetStatus,
    GetAudioLevels,
    ListSongs {
        folder: Option<String>,
        limit: Option<usize>,
        offset: Option<usize>,
        #[serde(default)]
        sort_by: Option<String>,
        #[serde(default)]
        sort_dir: Option<String>,
    },
    SearchSongs {
        query: String,
        limit: Option<usize>,
    },
    ListFolders,
    ListSources,
    AddSource {
        path: String,
    },
    RemoveSource {
        path: String,
    },
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
    ToggleFavorite {
        #[serde(default)]
        track_id: Option<String>,
    },
    DeleteSong {
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
    GetEq,
    SetEq {
        enabled: bool,
        preamp: f32,
        limiter: bool,
        bands: Vec<f32>,
    },
    ApplyEqPreset {
        preset_id: String,
    },
    SaveEqPreset {
        name: String,
        #[serde(default)]
        bands: Option<Vec<f32>>,
        #[serde(default)]
        preamp: Option<f32>,
    },
    DeleteEqPreset {
        id: String,
    },
    ResetEq,
    GetTransition,
    SetTransition {
        crossfade_secs: f32,
    },
    SetQueue {
        track_ids: Vec<String>,
        start_id: Option<String>,
        label: Option<String>,
        shuffle: Option<bool>,
    },
    JumpQueue {
        index: usize,
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
    GetSettings,
    UpdateSettings {
        patch: Value,
    },
    ResetSettings {
        #[serde(default)]
        scope: Option<String>,
    },
    GetLastPlayed,
    ClearLastPlayed,
    RadioStatus,
    RadioGetStore,
    RadioSaveStore {
        store: Value,
    },
    RadioManageBookmark {
        action: String,
        #[serde(default)]
        payload: Value,
    },
    RadioDiscover {
        #[serde(default)]
        query: Option<String>,
        #[serde(default)]
        tag: Option<String>,
        #[serde(default)]
        country: Option<String>,
        #[serde(default)]
        language: Option<String>,
        #[serde(default)]
        limit: Option<usize>,
    },
    RadioResolveUrl {
        url: String,
    },
    RadioPlayOnline {
        #[serde(default)]
        id: Option<String>,
        #[serde(default)]
        name: Option<String>,
        #[serde(default)]
        subtitle: Option<String>,
        url: String,
    },
    RadioDisconnect,
    RadioReconnect,
    RadioStop,
    FmHardwareStatus,
    FmTune {
        freq_mhz: f64,
        #[serde(default)]
        name: Option<String>,
        #[serde(default)]
        signal_id: Option<String>,
    },
    FmStop,
    Navigate {
        #[serde(default)]
        page: Option<String>,
        #[serde(default)]
        playlist_slug: Option<String>,
        #[serde(default)]
        overlay: Option<String>,
        #[serde(default)]
        search_query: Option<String>,
        #[serde(default)]
        customize_section: Option<String>,
    },
    WindowControl {
        action: String,
        #[serde(default)]
        zoom_percent: Option<f64>,
    },
    CheckUpdate,
    BackupData,
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
    Sources(Vec<MusicSource>),
    Playlists(Vec<Playlist>),
    PlaylistDetail {
        playlist: Playlist,
        tracks: Vec<Track>,
    },
    Queue {
        current_index: Option<usize>,
        tracks: Vec<Track>,
    },
    Json(Value),
    Message(String),
}
