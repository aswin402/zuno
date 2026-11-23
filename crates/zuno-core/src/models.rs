use serde::{Deserialize, Serialize};

/// Lightweight metadata record for a single audio track in `zuno/songs/`.
/// Cover art bytes are intentionally excluded to keep memory footprint minimal.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct Track {
    /// Fast 64 KB partial BLAKE3 hash + file size (16 hex chars), stored as `#EXTZUNO-ID`.
    pub id: String,
    /// POSIX relative path inside `zuno/songs/` (e.g. `lofi/rain.mp3`).
    pub rel_path: String,
    pub title: String,
    pub artist: String,
    pub album: String,
    pub genre: Option<String>,
    /// Duration in whole seconds (0 if unknown).
    pub duration_secs: u64,
    pub file_size: u64,
    pub modified_secs: u64,
    /// Subfolder relative to `zuno/songs/` (`""` if placed directly in `songs/`).
    pub folder: String,
    pub has_cover: bool,
}

impl Track {
    /// Display string used in `#EXTINF` lines (`Artist - Title` or `Title`).
    pub fn extinf_display(&self) -> String {
        if self.artist.is_empty() || self.artist == "Unknown Artist" {
            self.title.clone()
        } else {
            format!("{} - {}", self.artist, self.title)
        }
    }
}

/// Extracted embedded album cover art loaded on-demand for the active track only.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CoverArt {
    pub mime_type: String,
    pub bytes: Vec<u8>,
}

/// Summary of a subfolder inside `zuno/songs/`.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct FolderSummary {
    pub name: String,
    pub track_count: usize,
    pub total_duration_secs: u64,
}

/// A parsed, resolved `.m3u8` playlist inside `zuno/playlists/`.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct Playlist {
    /// Safe slug / filename stem (e.g. `fav` for `fav.m3u8`).
    pub slug: String,
    /// Human-friendly display title from `#PLAYLIST:` (or derived from slug).
    pub title: String,
    /// File name inside `zuno/playlists/` (e.g. `fav.m3u8`).
    pub file_name: String,
    /// Ordered list of resolved `Track::id`s.
    pub track_ids: Vec<String>,
    /// Unresolved entries whose audio files are currently missing on disk.
    pub missing_entries: Vec<String>,
    /// Number of entries auto-healed via `#EXTZUNO-ID` or metadata during load.
    pub healed_count: usize,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq, Default)]
#[serde(rename_all = "lowercase")]
pub enum RepeatMode {
    #[default]
    Off,
    One,
    All,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq, Default)]
#[serde(rename_all = "lowercase")]
pub enum PlayState {
    #[default]
    Stopped,
    Playing,
    Paused,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct PlaybackStatus {
    pub state: PlayState,
    pub current_track: Option<Track>,
    pub position_secs: f64,
    pub duration_secs: f64,
    /// Linear volume in `0.0..=1.0`.
    pub volume: f32,
    pub shuffle: bool,
    pub repeat: RepeatMode,
    pub queue_len: usize,
    pub queue_index: Option<usize>,
    pub active_playlist: Option<String>,
}

impl Default for PlaybackStatus {
    fn default() -> Self {
        Self {
            state: PlayState::Stopped,
            current_track: None,
            position_secs: 0.0,
            duration_secs: 0.0,
            volume: 0.8,
            shuffle: false,
            repeat: RepeatMode::Off,
            queue_len: 0,
            queue_index: None,
            active_playlist: None,
        }
    }
}

/// Compact persisted state written to `.zuno/state.json`.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PersistedState {
    pub last_track_id: Option<String>,
    pub position_secs: f64,
    pub volume: f32,
    pub shuffle: bool,
    pub repeat: RepeatMode,
    pub queue_track_ids: Vec<String>,
    pub active_playlist: Option<String>,
}

impl Default for PersistedState {
    fn default() -> Self {
        Self {
            last_track_id: None,
            position_secs: 0.0,
            volume: 0.8,
            shuffle: false,
            repeat: RepeatMode::Off,
            queue_track_ids: Vec::new(),
            active_playlist: None,
        }
    }
}
