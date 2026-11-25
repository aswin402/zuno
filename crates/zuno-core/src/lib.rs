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

pub use config::{ZunoPaths, atomic_write, user_data_local_dir, user_home_dir};
pub use error::{Result, ZunoError};
pub use library::Library;
pub use models::{
    CoverArt, DEFAULT_VOLUME, FolderSummary, MusicSource, PersistedState, PlayState,
    PlaybackStatus, Playlist, ROOT_FOLDER_LABEL, RepeatMode, Track, UNKNOWN_ARTIST,
};
pub use queue::QueueManager;
