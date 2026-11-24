pub mod config;
pub mod error;
pub mod ipc;
pub mod library;
pub mod models;
pub mod playlist;
pub mod queue;
pub mod scanner;
pub mod search;

#[cfg(feature = "watch")]
pub mod watcher;

pub use config::ZunoPaths;
pub use error::{Result, ZunoError};
pub use library::Library;
pub use models::{
    CoverArt, FolderSummary, MusicSource, PersistedState, PlayState, PlaybackStatus, Playlist,
    RepeatMode, Track,
};
pub use queue::QueueManager;
