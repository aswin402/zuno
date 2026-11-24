use crate::config::{ZunoPaths, normalize_rel_path};
use crate::error::Result;
use crate::models::{CoverArt, Track};
use lofty::file::{AudioFile, TaggedFileExt};
use lofty::probe::Probe;
use lofty::tag::Accessor;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::fs::{self, File};
use std::io::Read;
use std::path::Path;
use std::time::UNIX_EPOCH;
use walkdir::WalkDir;

const HASH_SAMPLE_BYTES: usize = 64 * 1024;
const INDEX_VERSION: u32 = 2;

/// Audio file extensions supported natively by Zuno (Symphonia + Rodio / Android Media3).
pub const SUPPORTED_EXTENSIONS: &[&str] = &[
    "mp3", "flac", "ogg", "opus", "wav", "m4a", "aac", "aiff", "aif", "alac", "webm",
];

#[derive(Debug, Serialize, Deserialize)]
struct CachedIndex {
    version: u32,
    tracks: Vec<Track>,
}

pub fn is_supported_audio(path: &Path) -> bool {
    path.extension()
        .and_then(|e| e.to_str())
        .map(|ext| {
            let lower = ext.to_ascii_lowercase();
            SUPPORTED_EXTENSIONS.contains(&lower.as_str())
        })
        .unwrap_or(false)
}

/// Fast partial content hash: BLAKE3(file_size_le || first_64KiB), truncated to 16 hex chars.
/// Takes <0.1 ms per file and stays identical if the user renames or moves the song.
pub fn compute_zuno_id(path: &Path, file_size: u64) -> std::io::Result<String> {
    let mut file = File::open(path)?;
    let mut buf = vec![0u8; HASH_SAMPLE_BYTES.min(file_size as usize).max(1)];
    let n = file.read(&mut buf)?;

    let mut hasher = blake3::Hasher::new();
    hasher.update(&file_size.to_le_bytes());
    hasher.update(&buf[..n]);
    let hex = hasher.finalize().to_hex();
    Ok(hex[..16].to_string())
}

/// Scan `zuno/songs/` plus any user-linked external music directories incrementally
/// using `.zuno/index.json` cache to skip unchanged files (zero-copy — audio stays in place).
pub fn scan_songs(paths: &ZunoPaths) -> Result<Vec<Track>> {
    paths.ensure_dirs()?;

    // Load prior index cache keyed by `(source_dir, rel_path)` for O(1) incremental skips.
    let cached_by_key: HashMap<(Option<String>, String), Track> = load_cached_index(paths)
        .into_iter()
        .map(|t| ((t.source_dir.clone(), t.rel_path.clone()), t))
        .collect();

    let mut roots: Vec<(std::path::PathBuf, Option<String>, String)> = Vec::new();
    roots.push((paths.songs_dir(), None, String::new()));

    for ext_dir in paths.load_extra_dirs() {
        if !ext_dir.is_dir() {
            continue;
        }
        let dir_str = ext_dir.to_string_lossy().into_owned();
        let root_label = ext_dir
            .file_name()
            .map(|n| n.to_string_lossy().into_owned())
            .filter(|s| !s.is_empty())
            .unwrap_or_else(|| "External".to_string());
        roots.push((ext_dir, Some(dir_str), root_label));
    }

    let mut tracks: Vec<Track> = Vec::new();
    let mut seen_ids: HashMap<String, usize> = HashMap::new();

    for (root_path, source_dir, root_label) in roots {
        for entry in WalkDir::new(&root_path)
            .follow_links(false)
            .into_iter()
            .filter_map(|e| e.ok())
        {
            if !entry.file_type().is_file() {
                continue;
            }
            let abs_path = entry.path();
            if !is_supported_audio(abs_path) {
                continue;
            }

            let Ok(rel_raw) = abs_path.strip_prefix(&root_path) else {
                continue;
            };
            let Ok(rel_path) = normalize_rel_path(&rel_raw.to_string_lossy()) else {
                continue;
            };

            let Ok(meta) = entry.metadata() else {
                continue;
            };
            let file_size = meta.len();
            let modified_secs = meta
                .modified()
                .ok()
                .and_then(|t| t.duration_since(UNIX_EPOCH).ok())
                .map(|d| d.as_secs())
                .unwrap_or(0);

            let key = (source_dir.clone(), rel_path.clone());
            let mut track = if let Some(cached) = cached_by_key.get(&key) {
                if cached.file_size == file_size && cached.modified_secs == modified_secs {
                    cached.clone()
                } else {
                    scan_single_file(
                        abs_path,
                        &rel_path,
                        source_dir.clone(),
                        &root_label,
                        file_size,
                        modified_secs,
                    )?
                }
            } else {
                scan_single_file(
                    abs_path,
                    &rel_path,
                    source_dir.clone(),
                    &root_label,
                    file_size,
                    modified_secs,
                )?
            };

            // Ensure unique Track::id even if the user places byte-identical copies in two folders.
            let base_id = track.id.clone();
            let count = seen_ids.entry(base_id.clone()).or_insert(0);
            *count += 1;
            if *count > 1 {
                track.id = format!("{}-{}", base_id, *count);
            }

            tracks.push(track);
        }
    }

    tracks.sort_by(|a, b| {
        a.folder
            .to_lowercase()
            .cmp(&b.folder.to_lowercase())
            .then_with(|| a.title.to_lowercase().cmp(&b.title.to_lowercase()))
            .then_with(|| a.rel_path.cmp(&b.rel_path))
    });

    let _ = save_cached_index(paths, &tracks);
    Ok(tracks)
}

fn scan_single_file(
    abs_path: &Path,
    rel_path: &str,
    source_dir: Option<String>,
    root_label: &str,
    file_size: u64,
    modified_secs: u64,
) -> Result<Track> {
    let id = compute_zuno_id(abs_path, file_size)?;

    let fallback_title = abs_path
        .file_stem()
        .map(|s| s.to_string_lossy().into_owned())
        .unwrap_or_else(|| rel_path.to_string());

    let sub_folder = Path::new(rel_path)
        .parent()
        .map(|p| p.to_string_lossy().replace('\\', "/"))
        .unwrap_or_default();

    let folder = if root_label.is_empty() {
        sub_folder
    } else if sub_folder.is_empty() {
        root_label.to_string()
    } else {
        format!("{root_label}/{sub_folder}")
    };

    let mut title = fallback_title;
    let mut artist = String::from("Unknown Artist");
    let mut album = String::new();
    let mut genre = None;
    let mut duration_secs = 0u64;
    let mut has_cover = false;

    if let Ok(probe) = Probe::open(abs_path) {
        if let Ok(probed) = probe.guess_file_type() {
            if let Ok(tagged_file) = probed.read() {
                duration_secs = tagged_file.properties().duration().as_secs();
                if let Some(tag) = tagged_file
                    .primary_tag()
                    .or_else(|| tagged_file.first_tag())
                {
                    if let Some(t) = tag.title() {
                        let s = t.trim();
                        if !s.is_empty() {
                            title = s.to_string();
                        }
                    }
                    if let Some(a) = tag.artist() {
                        let s = a.trim();
                        if !s.is_empty() {
                            artist = s.to_string();
                        }
                    }
                    if let Some(al) = tag.album() {
                        let s = al.trim();
                        if !s.is_empty() {
                            album = s.to_string();
                        }
                    }
                    if let Some(g) = tag.genre() {
                        let s = g.trim();
                        if !s.is_empty() {
                            genre = Some(s.to_string());
                        }
                    }
                    has_cover = !tag.pictures().is_empty();
                }
            }
        }
    }

    Ok(Track {
        id,
        rel_path: rel_path.to_string(),
        title,
        artist,
        album,
        genre,
        duration_secs,
        file_size,
        modified_secs,
        folder,
        source_dir,
        has_cover,
    })
}

/// Extract embedded cover art bytes on demand (only for the currently playing track).
pub fn extract_cover_art(abs_path: &Path) -> Option<CoverArt> {
    let tagged_file = Probe::open(abs_path).ok()?.guess_file_type().ok()?.read().ok()?;
    let tag = tagged_file
        .primary_tag()
        .or_else(|| tagged_file.first_tag())?;
    let pic = tag.pictures().first()?;
    let mime_type = pic
        .mime_type()
        .map(|m| m.as_str().to_string())
        .unwrap_or_else(|| "image/jpeg".to_string());
    Some(CoverArt {
        mime_type,
        bytes: pic.data().to_vec(),
    })
}

fn load_cached_index(paths: &ZunoPaths) -> Vec<Track> {
    let Ok(raw) = fs::read_to_string(paths.index_path()) else {
        return Vec::new();
    };
    match serde_json::from_str::<CachedIndex>(&raw) {
        Ok(idx) if idx.version == INDEX_VERSION => idx.tracks,
        _ => Vec::new(),
    }
}

fn save_cached_index(paths: &ZunoPaths, tracks: &[Track]) -> Result<()> {
    let payload = CachedIndex {
        version: INDEX_VERSION,
        tracks: tracks.to_vec(),
    };
    let tmp = paths.cache_dir().join("index.json.tmp");
    let data = serde_json::to_vec(&payload)?;
    fs::write(&tmp, data)?;
    fs::rename(&tmp, paths.index_path())?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::tempdir;

    #[test]
    fn scans_songs_and_caches_stably() {
        let tmp = tempdir().unwrap();
        let paths = ZunoPaths::new(tmp.path());
        paths.ensure_dirs().unwrap();

        fs::write(paths.songs_dir().join("alpha.mp3"), b"fake-mp3-bytes-12345").unwrap();
        fs::create_dir_all(paths.songs_dir().join("lofi")).unwrap();
        fs::write(
            paths.songs_dir().join("lofi/rain.flac"),
            b"fake-flac-bytes-99999",
        )
        .unwrap();
        // Unsupported file must be ignored.
        fs::write(paths.songs_dir().join("notes.txt"), b"ignore me").unwrap();

        let first = scan_songs(&paths).unwrap();
        assert_eq!(first.len(), 2);
        assert!(first.iter().any(|t| t.rel_path == "alpha.mp3" && t.folder.is_empty()));
        assert!(first.iter().any(|t| t.rel_path == "lofi/rain.flac" && t.folder == "lofi"));

        // Second scan hits cache and preserves exact IDs.
        let second = scan_songs(&paths).unwrap();
        assert_eq!(first, second);
    }

    #[test]
    fn scans_external_music_directories_zero_copy() {
        let root = tempdir().unwrap();
        let ext = tempdir().unwrap();
        let paths = ZunoPaths::new(root.path());
        paths.ensure_dirs().unwrap();

        fs::write(paths.songs_dir().join("local.mp3"), b"local-audio-bytes").unwrap();
        fs::create_dir_all(ext.path().join("favs")).unwrap();
        fs::write(ext.path().join("favs/external.flac"), b"external-flac-bytes").unwrap();

        paths.add_extra_dir(&ext.path().to_string_lossy()).unwrap();
        let tracks = scan_songs(&paths).unwrap();
        assert_eq!(tracks.len(), 2);

        let ext_track = tracks
            .iter()
            .find(|t| t.rel_path == "favs/external.flac")
            .expect("external track indexed");
        assert!(ext_track.source_dir.is_some());
        let resolved = paths
            .resolve_track_path(&ext_track.rel_path, ext_track.source_dir.as_deref())
            .unwrap();
        assert!(resolved.exists());

        // Removing the linked directory must NOT delete files on disk!
        paths.remove_extra_dir(&ext.path().to_string_lossy()).unwrap();
        assert!(ext.path().join("favs/external.flac").exists());
        let after = scan_songs(&paths).unwrap();
        assert_eq!(after.len(), 1);
    }
}
