use crate::error::{Result, ZunoError};
use std::fs;
use std::path::{Component, Path, PathBuf};

/// Manages the portable `zuno/` directory layout across Linux and Android.
///
/// Layout:
/// ```text
/// <root>/
/// ├── songs/          # User drops audio files or subfolders here
/// ├── playlists/      # Relative UTF-8 .m3u8 pointer playlists
/// └── .zuno/          # Local cache (index + playback state, safe to delete)
/// ```
#[derive(Debug, Clone)]
pub struct ZunoPaths {
    root: PathBuf,
}

impl ZunoPaths {
    /// Resolve the root directory using `ZUNO_DIR` env var, falling back to `~/zuno`.
    pub fn resolve_default() -> Self {
        if let Ok(env_dir) = std::env::var("ZUNO_DIR") {
            let trimmed = env_dir.trim();
            if !trimmed.is_empty() {
                return Self::new(PathBuf::from(trimmed));
            }
        }
        let home = dirs::home_dir().unwrap_or_else(|| PathBuf::from("."));
        Self::new(home.join("zuno"))
    }

    pub fn new(root: impl Into<PathBuf>) -> Self {
        Self { root: root.into() }
    }

    pub fn root(&self) -> &Path {
        &self.root
    }

    pub fn songs_dir(&self) -> PathBuf {
        self.root.join("songs")
    }

    pub fn playlists_dir(&self) -> PathBuf {
        self.root.join("playlists")
    }

    pub fn cache_dir(&self) -> PathBuf {
        self.root.join(".zuno")
    }

    pub fn index_path(&self) -> PathBuf {
        self.cache_dir().join("index.json")
    }

    pub fn state_path(&self) -> PathBuf {
        self.cache_dir().join("state.json")
    }

    /// Local Unix socket path used on Linux for live GUI <-> MCP IPC.
    pub fn socket_path(&self) -> PathBuf {
        if let Ok(custom) = std::env::var("ZUNO_SOCKET") {
            let trimmed = custom.trim();
            if !trimmed.is_empty() {
                return PathBuf::from(trimmed);
            }
        }
        if let Ok(runtime_dir) = std::env::var("XDG_RUNTIME_DIR") {
            if !runtime_dir.trim().is_empty() {
                return PathBuf::from(runtime_dir).join("zuno.sock");
            }
        }
        std::env::temp_dir().join("zuno.sock")
    }

    /// Ensure `songs/`, `playlists/`, and `.zuno/` exist on disk.
    pub fn ensure_dirs(&self) -> Result<()> {
        fs::create_dir_all(self.songs_dir())?;
        fs::create_dir_all(self.playlists_dir())?;
        fs::create_dir_all(self.cache_dir())?;
        Ok(())
    }

    /// Resolve a normalized POSIX relative path (e.g. `lofi/rain.mp3`) strictly inside `songs/`.
    pub fn resolve_song_path(&self, rel_path: &str) -> Result<PathBuf> {
        let clean = normalize_rel_path(rel_path)?;
        Ok(self.songs_dir().join(&clean))
    }
}

/// Normalize a relative path using `/` separators and reject path traversal (`..` or root).
pub fn normalize_rel_path(input: &str) -> Result<String> {
    let unified = input.replace('\\', "/");
    let path = Path::new(&unified);
    let mut parts: Vec<String> = Vec::new();

    for comp in path.components() {
        match comp {
            Component::Normal(seg) => {
                parts.push(seg.to_string_lossy().into_owned());
            }
            Component::CurDir => {}
            Component::ParentDir | Component::RootDir | Component::Prefix(_) => {
                return Err(ZunoError::InvalidPath(input.to_string()));
            }
        }
    }

    if parts.is_empty() {
        return Err(ZunoError::InvalidPath(input.to_string()));
    }

    Ok(parts.join("/"))
}

/// Convert a playlist name into a safe `.m3u8` filename stem (e.g. `"My Favs!"` -> `"my-favs"`).
pub fn slugify_playlist_name(name: &str) -> Result<String> {
    let trimmed = name.trim();
    if trimmed.is_empty() {
        return Err(ZunoError::InvalidPlaylistName(name.to_string()));
    }

    let mut slug = String::with_capacity(trimmed.len());
    let mut last_was_sep = false;

    for ch in trimmed.chars() {
        if ch.is_alphanumeric() {
            for lower in ch.to_lowercase() {
                slug.push(lower);
            }
            last_was_sep = false;
        } else if (ch == ' ' || ch == '-' || ch == '_') && !last_was_sep && !slug.is_empty() {
            slug.push('-');
            last_was_sep = true;
        }
    }

    let slug = slug.trim_matches('-').to_string();
    if slug.is_empty() || slug == "." || slug == ".." {
        return Err(ZunoError::InvalidPlaylistName(name.to_string()));
    }

    Ok(slug)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn normalizes_and_blocks_traversal() {
        assert_eq!(normalize_rel_path("lofi\\rain.mp3").unwrap(), "lofi/rain.mp3");
        assert_eq!(normalize_rel_path("./track.flac").unwrap(), "track.flac");
        assert!(normalize_rel_path("../secret.mp3").is_err());
        assert!(normalize_rel_path("/etc/passwd").is_err());
        assert!(normalize_rel_path("").is_err());
    }

    #[test]
    fn slugifies_playlist_names_safely() {
        assert_eq!(slugify_playlist_name("Favorites").unwrap(), "favorites");
        assert_eq!(slugify_playlist_name("Late Night Lo-Fi!").unwrap(), "late-night-lo-fi");
        assert!(slugify_playlist_name("   ").is_err());
        assert!(slugify_playlist_name("../evil").unwrap() == "evil");
    }
}
