use crate::error::{Result, ZunoError};
use serde::{Deserialize, Serialize};
use std::collections::HashSet;
use std::fs;
use std::path::{Component, Path, PathBuf};
use std::sync::atomic::{AtomicU64, Ordering};

static ATOMIC_TMP_SEQ: AtomicU64 = AtomicU64::new(0);

/// Atomically write `bytes` to `dest` using a PID + sequence-unique temporary sibling file
/// so concurrent writers never collide on a shared `.tmp` path.
pub fn atomic_write(dest: &Path, bytes: &[u8]) -> std::io::Result<()> {
    let parent = dest.parent().unwrap_or_else(|| Path::new("."));
    let stem = dest
        .file_name()
        .and_then(|n| n.to_str())
        .unwrap_or("zuno");
    let seq = ATOMIC_TMP_SEQ.fetch_add(1, Ordering::Relaxed);
    let tmp = parent.join(format!(".{stem}.{}.{seq}.tmp", std::process::id()));
    fs::write(&tmp, bytes)?;
    if let Err(err) = fs::rename(&tmp, dest) {
        let _ = fs::remove_file(&tmp);
        return Err(err);
    }
    Ok(())
}

pub fn user_home_dir() -> Option<PathBuf> {
    dirs::home_dir()
}

pub fn user_data_local_dir() -> Option<PathBuf> {
    dirs::data_local_dir()
}

#[derive(Debug, Default, Serialize, Deserialize)]
struct SourcesConfig {
    #[serde(default)]
    extra_dirs: Vec<String>,
}

/// Manages the portable `zuno/` directory layout across Linux and Android.
///
/// Layout:
/// ```text
/// <root>/
/// ├── songs/          # Default music folder (user can also link external dirs zero-copy)
/// ├── playlists/      # Relative UTF-8 .m3u8 pointer playlists
/// └── .zuno/          # Local cache (index, sources, playback state)
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

    pub fn sources_path(&self) -> PathBuf {
        self.cache_dir().join("sources.json")
    }

    pub fn radio_path(&self) -> PathBuf {
        self.cache_dir().join("radio.json")
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
        let user_tag = std::env::var("USER")
            .or_else(|_| std::env::var("USERNAME"))
            .ok()
            .map(|u| {
                u.chars()
                    .filter(|c| c.is_ascii_alphanumeric() || *c == '_' || *c == '-')
                    .collect::<String>()
            })
            .filter(|u| !u.is_empty())
            .unwrap_or_else(|| std::process::id().to_string());
        std::env::temp_dir().join(format!("zuno-{user_tag}.sock"))
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

    /// Load user-linked external music directories from `.zuno/sources.json`.
    pub fn load_extra_dirs(&self) -> Vec<PathBuf> {
        let Ok(raw) = fs::read_to_string(self.sources_path()) else {
            return Vec::new();
        };
        let Ok(cfg) = serde_json::from_str::<SourcesConfig>(&raw) else {
            return Vec::new();
        };
        let default_canon = fs::canonicalize(self.songs_dir()).unwrap_or_else(|_| self.songs_dir());
        let mut seen: HashSet<PathBuf> = HashSet::new();
        seen.insert(default_canon);
        let mut out: Vec<PathBuf> = Vec::new();
        for item in cfg.extra_dirs {
            let trimmed = item.trim();
            if trimmed.is_empty() {
                continue;
            }
            let p = expand_user_dir(trimmed);
            let canon = fs::canonicalize(&p).unwrap_or_else(|_| p.clone());
            if seen.insert(canon) {
                out.push(p);
            }
        }
        out
    }

    /// Persist linked external music directories atomically.
    pub fn save_extra_dirs(&self, dirs: &[PathBuf]) -> Result<()> {
        self.ensure_dirs()?;
        let cfg = SourcesConfig {
            extra_dirs: dirs
                .iter()
                .map(|p| p.to_string_lossy().into_owned())
                .collect(),
        };
        atomic_write(&self.sources_path(), &serde_json::to_vec_pretty(&cfg)?)?;
        Ok(())
    }

    /// Link an external music directory (zero-copy — Zuno scans & plays files in place).
    pub fn add_extra_dir(&self, raw: &str) -> Result<PathBuf> {
        let trimmed = raw.trim();
        if trimmed.is_empty() {
            return Err(ZunoError::InvalidPath("folder path cannot be empty".into()));
        }
        let expanded = expand_user_dir(trimmed);
        if !expanded.exists() || !expanded.is_dir() {
            return Err(ZunoError::InvalidPath(format!(
                "folder not found: {}",
                expanded.display()
            )));
        }
        let canon = fs::canonicalize(&expanded).unwrap_or(expanded);
        let default_canon = fs::canonicalize(self.songs_dir()).unwrap_or_else(|_| self.songs_dir());
        if canon == default_canon {
            return Ok(self.songs_dir());
        }

        let mut dirs = self.load_extra_dirs();
        let already = dirs
            .iter()
            .any(|d| fs::canonicalize(d).unwrap_or_else(|_| d.clone()) == canon);
        if !already {
            dirs.push(canon.clone());
            self.save_extra_dirs(&dirs)?;
        }
        Ok(canon)
    }

    /// Unlink an external music directory without touching any audio files on disk.
    pub fn remove_extra_dir(&self, raw: &str) -> Result<bool> {
        let trimmed = raw.trim();
        let expanded = expand_user_dir(trimmed);
        let target_canon = fs::canonicalize(&expanded).unwrap_or(expanded.clone());

        let mut dirs = self.load_extra_dirs();
        let before = dirs.len();
        dirs.retain(|d| {
            let d_canon = fs::canonicalize(d).unwrap_or_else(|_| d.clone());
            d != &expanded && d_canon != target_canon && d.to_string_lossy() != trimmed
        });
        let removed = dirs.len() != before;
        if removed {
            self.save_extra_dirs(&dirs)?;
        }
        Ok(removed)
    }

    /// Resolve a track's safe absolute path inside either `zuno/songs/` or a linked external directory.
    pub fn resolve_track_path(&self, rel_path: &str, source_dir: Option<&str>) -> Result<PathBuf> {
        let clean = normalize_rel_path(rel_path)?;
        let Some(root_str) = source_dir else {
            return Ok(self.songs_dir().join(&clean));
        };
        let root_path = PathBuf::from(root_str);
        let root_canon = fs::canonicalize(&root_path).unwrap_or_else(|_| root_path.clone());
        let allowed = self.load_extra_dirs().into_iter().any(|d| {
            let d_canon = fs::canonicalize(&d).unwrap_or(d);
            d_canon == root_canon
        });
        if !allowed {
            return Err(ZunoError::InvalidPath(format!(
                "source directory is not linked: {root_str}"
            )));
        }
        Ok(root_path.join(&clean))
    }

    /// Suggest common OS music folders (e.g. `~/Music`) that exist on disk.
    pub fn suggested_music_dirs(&self) -> Vec<String> {
        let mut out = Vec::new();
        let mut candidates: Vec<PathBuf> = Vec::new();
        if let Some(audio) = dirs::audio_dir() {
            candidates.push(audio);
        }
        if let Some(downloads) = dirs::download_dir() {
            candidates.push(downloads);
        }
        if let Some(home) = dirs::home_dir() {
            candidates.push(home.join("Music"));
            candidates.push(home.join("Downloads"));
        }
        let default_canon = fs::canonicalize(self.songs_dir()).unwrap_or_else(|_| self.songs_dir());
        for cand in candidates {
            if !cand.is_dir() {
                continue;
            }
            let canon = fs::canonicalize(&cand).unwrap_or(cand);
            if canon == default_canon {
                continue;
            }
            let s = canon.to_string_lossy().into_owned();
            if !out.contains(&s) {
                out.push(s);
            }
        }
        out
    }
}

/// Expand leading `~` or `~/` to the user's home directory.
pub fn expand_user_dir(raw: &str) -> PathBuf {
    let trimmed = raw.trim();
    if trimmed == "~" {
        if let Some(home) = dirs::home_dir() {
            return home;
        }
    } else if let Some(rest) = trimmed.strip_prefix("~/").or_else(|| trimmed.strip_prefix("~\\")) {
        if let Some(home) = dirs::home_dir() {
            return home.join(rest);
        }
    }
    PathBuf::from(trimmed)
}

/// Normalize a relative path using `/` separators and reject path traversal (`..` or root).
pub fn normalize_rel_path(input: &str) -> Result<String> {
    let unified = input.replace('\\', "/");
    let path = Path::new(&unified);
    let mut parts: Vec<String> = Vec::new();

    for comp in path.components() {
        match comp {
            Component::Normal(seg) => {
                let s = seg.to_string_lossy();
                // Reject Windows drive-letter prefixes (e.g. `C:\foo`) even on Unix hosts.
                if parts.is_empty()
                    && s.len() == 2
                    && s.as_bytes()[0].is_ascii_alphabetic()
                    && s.as_bytes()[1] == b':'
                {
                    return Err(ZunoError::InvalidPath(input.to_string()));
                }
                parts.push(s.into_owned());
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
        assert!(normalize_rel_path("C:\\Windows\\track.mp3").is_err());
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
