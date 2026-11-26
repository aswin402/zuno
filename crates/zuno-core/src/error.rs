use thiserror::Error;

#[derive(Debug, Error)]
pub enum ZunoError {
    #[error("I/O error: {0}")]
    Io(#[from] std::io::Error),

    #[error("JSON error: {0}")]
    Json(#[from] serde_json::Error),

    #[error("invalid path (outside zuno root): {0}")]
    InvalidPath(String),

    #[error("invalid playlist name: {0}")]
    InvalidPlaylistName(String),

    #[error("playlist not found: {0}")]
    PlaylistNotFound(String),

    #[error("playlist already exists: {0}")]
    PlaylistAlreadyExists(String),

    #[error("track not found: {0}")]
    TrackNotFound(String),

    #[error("not found: {0}")]
    NotFound(String),

    #[error("audio error: {0}")]
    Audio(String),

    #[error("IPC error: {0}")]
    Ipc(String),
}

pub type Result<T> = std::result::Result<T, ZunoError>;
