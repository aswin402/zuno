use crate::config::{ZunoPaths, normalize_rel_path, slugify_playlist_name};
use crate::error::{Result, ZunoError};
use crate::models::{Playlist, Track};
use std::collections::HashMap;
use std::fs;
use std::path::{Path, PathBuf};

const M3U8_HEADER: &str = "#EXTM3U";
const PLAYLIST_PREFIX: &str = "#PLAYLIST:";
const EXTINF_PREFIX: &str = "#EXTINF:";
const ZUNO_ID_PREFIX: &str = "#EXTZUNO-ID:";

#[derive(Debug, Clone)]
struct RawEntry {
    raw_path: String,
    zuno_id: Option<String>,
    extinf_duration: Option<i64>,
    extinf_display: Option<String>,
}

/// Load every `.m3u8` / `.m3u` playlist inside `zuno/playlists/`, resolving and
/// automatically self-healing moved or renamed songs via `#EXTZUNO-ID` and `#EXTINF`.
pub fn load_all_playlists(paths: &ZunoPaths, tracks: &[Track]) -> Result<Vec<Playlist>> {
    paths.ensure_dirs()?;
    let dir = paths.playlists_dir();

    let mut by_path: HashMap<&str, &Track> = HashMap::with_capacity(tracks.len());
    let mut by_id: HashMap<&str, &Track> = HashMap::with_capacity(tracks.len());
    let mut by_base_id: HashMap<&str, Vec<&Track>> = HashMap::new();

    for t in tracks {
        by_path.insert(t.rel_path.as_str(), t);
        by_id.insert(t.id.as_str(), t);
        let base = t.id.split('-').next().unwrap_or(t.id.as_str());
        by_base_id.entry(base).or_default().push(t);
    }

    let mut playlists = Vec::new();
    for entry in fs::read_dir(&dir)? {
        let entry = entry?;
        let path = entry.path();
        if !path.is_file() {
            continue;
        }
        let Some(ext) = path.extension().and_then(|e| e.to_str()) else {
            continue;
        };
        if !ext.eq_ignore_ascii_case("m3u8") && !ext.eq_ignore_ascii_case("m3u") {
            continue;
        }

        if let Ok(pl) = load_single_playlist(&path, tracks, &by_path, &by_id, &by_base_id) {
            playlists.push(pl);
        }
    }

    playlists.sort_by(|a, b| a.title.to_lowercase().cmp(&b.title.to_lowercase()));
    Ok(playlists)
}

fn load_single_playlist(
    file_path: &Path,
    all_tracks: &[Track],
    by_path: &HashMap<&str, &Track>,
    by_id: &HashMap<&str, &Track>,
    by_base_id: &HashMap<&str, Vec<&Track>>,
) -> Result<Playlist> {
    let raw = fs::read_to_string(file_path)?;
    let file_name = file_path
        .file_name()
        .map(|s| s.to_string_lossy().into_owned())
        .unwrap_or_default();
    let slug = file_path
        .file_stem()
        .map(|s| s.to_string_lossy().into_owned())
        .unwrap_or_else(|| "playlist".to_string());

    let mut title: Option<String> = None;
    let mut entries: Vec<RawEntry> = Vec::new();

    let mut pending_id: Option<String> = None;
    let mut pending_dur: Option<i64> = None;
    let mut pending_disp: Option<String> = None;

    for raw_line in raw.lines() {
        let line = raw_line.trim().trim_start_matches('\u{feff}');
        if line.is_empty() {
            continue;
        }
        if line.starts_with('#') {
            if let Some(rest) = line.strip_prefix(PLAYLIST_PREFIX) {
                let t = rest.trim();
                if !t.is_empty() {
                    title = Some(t.to_string());
                }
            } else if let Some(rest) = line.strip_prefix(ZUNO_ID_PREFIX) {
                let id = rest.trim();
                if !id.is_empty() {
                    pending_id = Some(id.to_string());
                }
            } else if let Some(rest) = line.strip_prefix(EXTINF_PREFIX) {
                if let Some((dur_part, disp_part)) = rest.split_once(',') {
                    pending_dur = dur_part.trim().parse::<i64>().ok();
                    let disp = disp_part.trim();
                    if !disp.is_empty() {
                        pending_disp = Some(disp.to_string());
                    }
                }
            }
            continue;
        }

        entries.push(RawEntry {
            raw_path: line.to_string(),
            zuno_id: pending_id.take(),
            extinf_duration: pending_dur.take(),
            extinf_display: pending_disp.take(),
        });
    }

    let display_title = title.unwrap_or_else(|| title_from_slug(&slug));
    let mut track_ids: Vec<String> = Vec::with_capacity(entries.len());
    let mut resolved_tracks: Vec<&Track> = Vec::with_capacity(entries.len());
    let mut missing_entries: Vec<String> = Vec::new();
    let mut healed_count = 0usize;
    let mut needs_rewrite = false;

    for entry in &entries {
        let canonical_rel = strip_songs_prefix(&entry.raw_path);

        // Tier 1: Direct relative path match inside zuno/songs/
        if let Some(ref rel) = canonical_rel {
            if let Some(track) = by_path.get(rel.as_str()) {
                track_ids.push(track.id.clone());
                resolved_tracks.push(*track);
                // If an imported .m3u8 lacks `#EXTZUNO-ID`, backfill it on next rewrite if needed.
                if entry.zuno_id.as_deref() != Some(track.id.as_str()) {
                    needs_rewrite = true;
                }
                continue;
            }
        }

        // Tier 2: Self-heal via `#EXTZUNO-ID` (exact content fingerprint match after rename/move)
        let mut healed: Option<&Track> = None;
        if let Some(ref z_id) = entry.zuno_id {
            if let Some(track) = by_id.get(z_id.as_str()) {
                healed = Some(*track);
            } else {
                let base = z_id.split('-').next().unwrap_or(z_id.as_str());
                if let Some(candidates) = by_base_id.get(base) {
                    healed = candidates.first().copied();
                }
            }
        }

        // Tier 3: Self-heal via `#EXTINF` (display string + optional duration within ±2s)
        if healed.is_none() {
            if let Some(ref disp) = entry.extinf_display {
                let needle = disp.to_lowercase();
                healed = all_tracks.iter().find(|t| {
                    let extinf_match = t.extinf_display().to_lowercase() == needle
                        || t.title.to_lowercase() == needle;
                    let dur_ok = match entry.extinf_duration {
                        Some(d) if d > 0 && t.duration_secs > 0 => {
                            (d - t.duration_secs as i64).abs() <= 2
                        }
                        _ => true,
                    };
                    extinf_match && dur_ok
                });
            }
        }

        // Tier 4: Unique filename fallback (if a file moved to another subfolder keeping its name)
        if healed.is_none() {
            if let Some(file_only) = Path::new(&entry.raw_path.replace('\\', "/"))
                .file_name()
                .and_then(|s| s.to_str())
            {
                let matches: Vec<&Track> = all_tracks
                    .iter()
                    .filter(|t| {
                        Path::new(&t.rel_path)
                            .file_name()
                            .and_then(|s| s.to_str())
                            .map(|n| n.eq_ignore_ascii_case(file_only))
                            .unwrap_or(false)
                    })
                    .collect();
                if matches.len() == 1 {
                    healed = Some(matches[0]);
                }
            }
        }

        if let Some(track) = healed {
            track_ids.push(track.id.clone());
            resolved_tracks.push(track);
            healed_count += 1;
            needs_rewrite = true;
        } else {
            missing_entries.push(entry.raw_path.clone());
        }
    }

    // Rewrite atomically when healed (preserving any still-missing raw lines at the bottom so user data isn't lost).
    if needs_rewrite && (healed_count > 0 || missing_entries.is_empty()) {
        let _ = write_m3u8_atomic(file_path, &display_title, &resolved_tracks, &missing_entries);
    }

    Ok(Playlist {
        slug,
        title: display_title,
        file_name,
        track_ids,
        missing_entries,
        healed_count,
    })
}

/// Create a new `.m3u8` playlist inside `zuno/playlists/` without copying any audio files.
pub fn create_playlist(
    paths: &ZunoPaths,
    name: &str,
    tracks: &[&Track],
) -> Result<Playlist> {
    paths.ensure_dirs()?;
    let slug = slugify_playlist_name(name)?;
    let file_path = playlist_file_path(paths, &slug);
    if file_path.exists() {
        return Err(ZunoError::PlaylistAlreadyExists(slug));
    }

    let title = name.trim().to_string();
    write_m3u8_atomic(&file_path, &title, tracks, &[])?;

    Ok(Playlist {
        slug: slug.clone(),
        title,
        file_name: format!("{}.m3u8", slug),
        track_ids: tracks.iter().map(|t| t.id.clone()).collect(),
        missing_entries: Vec::new(),
        healed_count: 0,
    })
}

/// Save/overwrite an existing playlist `.m3u8` file atomically.
pub fn save_playlist(
    paths: &ZunoPaths,
    playlist: &Playlist,
    resolved_tracks: &[&Track],
) -> Result<()> {
    paths.ensure_dirs()?;
    let file_path = playlist_file_path(paths, &playlist.slug);
    write_m3u8_atomic(
        &file_path,
        &playlist.title,
        resolved_tracks,
        &playlist.missing_entries,
    )
}

pub fn delete_playlist(paths: &ZunoPaths, name_or_slug: &str) -> Result<String> {
    let slug = slugify_playlist_name(name_or_slug)?;
    let file_path = playlist_file_path(paths, &slug);
    if !file_path.exists() {
        return Err(ZunoError::PlaylistNotFound(name_or_slug.to_string()));
    }
    fs::remove_file(file_path)?;
    Ok(slug)
}

pub fn playlist_file_path(paths: &ZunoPaths, slug: &str) -> PathBuf {
    paths.playlists_dir().join(format!("{}.m3u8", slug))
}

fn write_m3u8_atomic(
    file_path: &Path,
    title: &str,
    tracks: &[&Track],
    missing_entries: &[String],
) -> Result<()> {
    let mut out = String::with_capacity(tracks.len() * 96 + 64);
    out.push_str(M3U8_HEADER);
    out.push('\n');
    out.push_str(PLAYLIST_PREFIX);
    out.push_str(title);
    out.push('\n');

    for track in tracks {
        let dur = if track.duration_secs > 0 {
            track.duration_secs as i64
        } else {
            -1
        };
        out.push_str(&format!("{}{},{}\n", EXTINF_PREFIX, dur, track.extinf_display()));
        out.push_str(&format!("{}{}\n", ZUNO_ID_PREFIX, track.id));
        out.push_str(&format!("../songs/{}\n", track.rel_path));
    }

    for missing in missing_entries {
        out.push_str(missing);
        out.push('\n');
    }

    let tmp_path = file_path.with_extension("m3u8.tmp");
    fs::write(&tmp_path, out.as_bytes())?;
    fs::rename(&tmp_path, file_path)?;
    Ok(())
}

/// Convert `../songs/lofi/rain.mp3` or `songs/lofi/rain.mp3` -> `Some("lofi/rain.mp3")`.
fn strip_songs_prefix(raw: &str) -> Option<String> {
    let unified = raw.trim().replace('\\', "/");
    let stripped = unified
        .strip_prefix("../songs/")
        .or_else(|| unified.strip_prefix("./../songs/"))
        .or_else(|| unified.strip_prefix("songs/"))
        .or_else(|| unified.strip_prefix("./songs/"))
        .unwrap_or(&unified);
    normalize_rel_path(stripped).ok()
}

fn title_from_slug(slug: &str) -> String {
    slug.split(['-', '_'])
        .filter(|s| !s.is_empty())
        .map(|word| {
            let mut chars = word.chars();
            match chars.next() {
                Some(first) => first.to_uppercase().collect::<String>() + chars.as_str(),
                None => String::new(),
            }
        })
        .collect::<Vec<_>>()
        .join(" ")
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::scanner::scan_songs;
    use tempfile::tempdir;

    #[test]
    fn creates_relative_m3u8_and_self_heals_after_rename_and_move() {
        let tmp = tempdir().unwrap();
        let paths = ZunoPaths::new(tmp.path());
        paths.ensure_dirs().unwrap();

        let original = paths.songs_dir().join("rain.mp3");
        fs::write(&original, b"unique-rain-audio-payload-1234567890").unwrap();

        let tracks = scan_songs(&paths).unwrap();
        assert_eq!(tracks.len(), 1);
        let refs: Vec<&Track> = tracks.iter().collect();

        let created = create_playlist(&paths, "Fav Mix", &refs).unwrap();
        assert_eq!(created.slug, "fav-mix");
        assert_eq!(created.track_ids, vec![tracks[0].id.clone()]);

        let m3u8_text = fs::read_to_string(playlist_file_path(&paths, "fav-mix")).unwrap();
        assert!(m3u8_text.contains("../songs/rain.mp3"));
        assert!(m3u8_text.contains(&format!("#EXTZUNO-ID:{}", tracks[0].id)));

        // Move AND rename the audio file inside zuno/songs/!
        fs::create_dir_all(paths.songs_dir().join("chill")).unwrap();
        let moved = paths.songs_dir().join("chill/midnight_rain.mp3");
        fs::rename(&original, &moved).unwrap();

        // Rescan & reload playlists -> must self-heal automatically!
        let new_tracks = scan_songs(&paths).unwrap();
        let playlists = load_all_playlists(&paths, &new_tracks).unwrap();
        assert_eq!(playlists.len(), 1);
        assert_eq!(playlists[0].healed_count, 1);
        assert!(playlists[0].missing_entries.is_empty());
        assert_eq!(playlists[0].track_ids, vec![new_tracks[0].id.clone()]);

        // Verify .m3u8 on disk was rewritten with the healed relative path.
        let healed_text = fs::read_to_string(playlist_file_path(&paths, "fav-mix")).unwrap();
        assert!(healed_text.contains("../songs/chill/midnight_rain.mp3"));
        assert!(!healed_text.contains("../songs/rain.mp3"));
    }
}
