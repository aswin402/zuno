use crate::config::ZunoPaths;
use crate::error::{Result, ZunoError};
use notify::{Event, RecommendedWatcher, RecursiveMode, Watcher};
use std::sync::mpsc;

/// Watches `zuno/songs/` and `zuno/playlists/` using OS-native events (~0% idle CPU).
pub struct ZunoWatcher {
    _watcher: RecommendedWatcher,
}

impl ZunoWatcher {
    pub fn start<F>(paths: &ZunoPaths, on_change: F) -> Result<Self>
    where
        F: Fn() + Send + 'static,
    {
        paths.ensure_dirs()?;
        let (tx, rx) = mpsc::channel::<notify::Result<Event>>();

        let mut watcher = notify::recommended_watcher(move |res| {
            let _ = tx.send(res);
        })
        .map_err(|e| ZunoError::Io(std::io::Error::other(e.to_string())))?;

        watcher
            .watch(&paths.songs_dir(), RecursiveMode::Recursive)
            .map_err(|e| ZunoError::Io(std::io::Error::other(e.to_string())))?;
        watcher
            .watch(&paths.playlists_dir(), RecursiveMode::NonRecursive)
            .map_err(|e| ZunoError::Io(std::io::Error::other(e.to_string())))?;

        // Debounce bursts of filesystem events on a lightweight background thread.
        std::thread::spawn(move || {
            use std::time::Duration;
            while let Ok(evt) = rx.recv() {
                if let Ok(e) = evt {
                    // Ignore our own atomic `.tmp` writes.
                    let all_tmp = !e.paths.is_empty()
                        && e.paths
                            .iter()
                            .all(|p| p.extension().and_then(|x| x.to_str()) == Some("tmp"));
                    if all_tmp {
                        continue;
                    }
                }
                // Drain rapid follow-up events within 250 ms before triggering a single rescan.
                while rx.recv_timeout(Duration::from_millis(250)).is_ok() {}
                on_change();
            }
        });

        Ok(Self { _watcher: watcher })
    }
}
