use crate::config::{ZunoPaths, atomic_write, slugify_playlist_name};
use crate::error::{Result, ZunoError};
use crate::models::{
    CoverArt, FolderSummary, MusicSource, PersistedState, Playlist, ROOT_FOLDER_LABEL, Track,
};
use crate::playlist;
use crate::scanner;
use crate::search;
use std::collections::{BTreeMap, HashMap, HashSet};
use std::fs;
use std::path::PathBuf;

/// High-level facade over `zuno/songs/` and `zuno/playlists/`.
#[derive(Debug, Clone)]
pub struct Library {
    paths: ZunoPaths,
    tracks: Vec<Track>,
    by_id: HashMap<String, usize>,
    playlists: Vec<Playlist>,
}

impl Library {
    pub fn open(paths: ZunoPaths) -> Result<Self> {
        paths.ensure_dirs()?;
        let mut lib = Self {
            paths,
            tracks: Vec::new(),
            by_id: HashMap::new(),
            playlists: Vec::new(),
        };
        lib.rescan()?;
        Ok(lib)
    }

    pub fn paths(&self) -> &ZunoPaths {
        &self.paths
    }

    /// Incrementally scan `zuno/songs/` and load + self-heal all `.m3u8` playlists.
    pub fn rescan(&mut self) -> Result<()> {
        let tracks = scanner::scan_songs(&self.paths)?;
        let by_id = tracks
            .iter()
            .enumerate()
            .map(|(i, t)| (t.id.clone(), i))
            .collect();
        let playlists = playlist::load_all_playlists(&self.paths, &tracks)?;
        self.tracks = tracks;
        self.by_id = by_id;
        self.playlists = playlists;
        Ok(())
    }

    pub fn tracks(&self) -> &[Track] {
        &self.tracks
    }

    pub fn track_by_id(&self, id: &str) -> Option<&Track> {
        self.by_id.get(id).and_then(|&i| self.tracks.get(i))
    }

    pub fn has_track(&self, id: &str) -> bool {
        self.by_id.contains_key(id)
    }

    pub fn tracks_in_folder(&self, folder: &str) -> Vec<&Track> {
        let normalized = folder.trim().replace('\\', "/");
        let clean = normalized.trim_matches('/');
        if clean.is_empty() {
            return self.tracks.iter().collect();
        }
        let prefix = format!("{clean}/");
        self.tracks
            .iter()
            .filter(|t| t.folder == clean || t.folder.starts_with(&prefix))
            .collect()
    }

    pub fn folders(&self) -> Vec<FolderSummary> {
        let mut map: BTreeMap<String, (usize, u64)> = BTreeMap::new();
        for t in &self.tracks {
            let key = if t.folder.is_empty() {
                ROOT_FOLDER_LABEL.to_string()
            } else {
                t.folder.clone()
            };
            let entry = map.entry(key).or_insert((0, 0));
            entry.0 += 1;
            entry.1 += t.duration_secs;
        }
        map.into_iter()
            .map(|(name, (track_count, total_duration_secs))| FolderSummary {
                name,
                track_count,
                total_duration_secs,
            })
            .collect()
    }

    pub fn search(&self, query: &str, limit: usize) -> Vec<&Track> {
        search::search_tracks(&self.tracks, query, limit)
    }

    pub fn resolve_track_path(&self, track: &Track) -> Result<PathBuf> {
        self.paths
            .resolve_track_path(&track.rel_path, track.source_dir.as_deref())
    }

    pub fn sources(&self) -> Vec<MusicSource> {
        let mut out = Vec::new();
        let default_dir = self.paths.songs_dir();
        let default_count = self
            .tracks
            .iter()
            .filter(|t| t.source_dir.is_none())
            .count();
        out.push(MusicSource {
            path: default_dir.to_string_lossy().into_owned(),
            label: "Zuno Songs (Default)".to_string(),
            is_default: true,
            exists: default_dir.is_dir(),
            track_count: default_count,
        });

        for ext in self.paths.load_extra_dirs() {
            let path_str = ext.to_string_lossy().into_owned();
            let label = ext
                .file_name()
                .map(|n| n.to_string_lossy().into_owned())
                .filter(|s| !s.is_empty())
                .unwrap_or_else(|| path_str.clone());
            let count = self
                .tracks
                .iter()
                .filter(|t| t.source_dir.as_deref() == Some(path_str.as_str()))
                .count();
            out.push(MusicSource {
                path: path_str,
                label,
                is_default: false,
                exists: ext.is_dir(),
                track_count: count,
            });
        }
        out
    }

    pub fn add_source(&mut self, dir: &str) -> Result<Vec<MusicSource>> {
        self.paths.add_extra_dir(dir)?;
        self.rescan()?;
        Ok(self.sources())
    }

    pub fn remove_source(&mut self, dir: &str) -> Result<Vec<MusicSource>> {
        self.paths.remove_extra_dir(dir)?;
        self.rescan()?;
        Ok(self.sources())
    }

    pub fn extract_cover(&self, track_id: &str) -> Option<CoverArt> {
        let track = self.track_by_id(track_id)?;
        let abs = self.resolve_track_path(track).ok()?;
        scanner::extract_cover_art(&abs)
    }

    pub fn playlists(&self) -> &[Playlist] {
        &self.playlists
    }

    pub fn find_playlist(&self, name_or_slug: &str) -> Option<&Playlist> {
        self.find_playlist_index(name_or_slug)
            .map(|idx| &self.playlists[idx])
    }

    pub fn playlist_tracks(&self, name_or_slug: &str) -> Result<(Playlist, Vec<Track>)> {
        let pl = self
            .find_playlist(name_or_slug)
            .ok_or_else(|| ZunoError::PlaylistNotFound(name_or_slug.to_string()))?
            .clone();
        let tracks = pl
            .track_ids
            .iter()
            .filter_map(|id| self.track_by_id(id).cloned())
            .collect();
        Ok((pl, tracks))
    }

    pub fn create_playlist(&mut self, name: &str, track_ids: &[String]) -> Result<Playlist> {
        let resolved = self.resolve_track_refs(track_ids)?;
        let pl = playlist::create_playlist(&self.paths, name, &resolved)?;
        self.playlists.push(pl.clone());
        self.playlists.sort_by_cached_key(|p| p.title.to_lowercase());
        Ok(pl)
    }

    pub fn delete_playlist(&mut self, name_or_slug: &str) -> Result<String> {
        let slug = self
            .find_playlist(name_or_slug)
            .map(|p| p.slug.clone())
            .ok_or_else(|| ZunoError::PlaylistNotFound(name_or_slug.to_string()))?;
        playlist::delete_playlist(&self.paths, &slug)?;
        self.playlists.retain(|p| p.slug != slug);
        Ok(slug)
    }

    pub fn add_to_playlist(&mut self, name_or_slug: &str, track_ids: &[String]) -> Result<Playlist> {
        let idx = self
            .find_playlist_index(name_or_slug)
            .ok_or_else(|| ZunoError::PlaylistNotFound(name_or_slug.to_string()))?;

        // Validate every requested track exists before mutating.
        for id in track_ids {
            if !self.by_id.contains_key(id) {
                return Err(ZunoError::TrackNotFound(id.clone()));
            }
        }

        let pl = &mut self.playlists[idx];
        let mut existing: HashSet<String> = pl.track_ids.iter().cloned().collect();
        for id in track_ids {
            if existing.insert(id.clone()) {
                pl.track_ids.push(id.clone());
            }
        }
        let updated = pl.clone();
        let resolved = self.resolve_track_refs(&updated.track_ids)?;
        playlist::save_playlist(&self.paths, &updated, &resolved)?;
        Ok(updated)
    }

    pub fn remove_from_playlist(
        &mut self,
        name_or_slug: &str,
        track_id: &str,
    ) -> Result<Playlist> {
        let idx = self
            .find_playlist_index(name_or_slug)
            .ok_or_else(|| ZunoError::PlaylistNotFound(name_or_slug.to_string()))?;

        let pl = &mut self.playlists[idx];
        pl.track_ids.retain(|id| id != track_id);
        let updated = pl.clone();
        let resolved = self.resolve_track_refs(&updated.track_ids)?;
        playlist::save_playlist(&self.paths, &updated, &resolved)?;
        Ok(updated)
    }

    pub fn delete_song(&mut self, track_id: &str) -> Result<String> {
        let track = self
            .track_by_id(track_id)
            .cloned()
            .ok_or_else(|| ZunoError::TrackNotFound(track_id.to_string()))?;
        let abs = self.resolve_track_path(&track)?;
        if abs.exists() {
            fs::remove_file(&abs)?;
        }
        // Clean references from any playlists holding this track and persist on disk before rescan.
        let mut dirty_playlists: Vec<Playlist> = Vec::new();
        for pl in &mut self.playlists {
            let before = pl.track_ids.len();
            pl.track_ids.retain(|id| id != &track.id);
            if pl.track_ids.len() != before {
                dirty_playlists.push(pl.clone());
            }
        }
        for pl in &dirty_playlists {
            let resolved: Vec<&Track> = pl
                .track_ids
                .iter()
                .filter_map(|id| self.track_by_id(id))
                .collect();
            let _ = playlist::save_playlist(&self.paths, pl, &resolved);
        }
        self.rescan()?;
        Ok(track.title)
    }

    pub fn load_state(&self) -> PersistedState {
        fs::read_to_string(self.paths.state_path())
            .ok()
            .and_then(|s| serde_json::from_str(&s).ok())
            .unwrap_or_default()
    }

    pub fn save_state(&self, state: &PersistedState) -> Result<()> {
        self.paths.ensure_dirs()?;
        atomic_write(&self.paths.state_path(), &serde_json::to_vec_pretty(state)?)?;
        Ok(())
    }

    fn find_playlist_index(&self, name_or_slug: &str) -> Option<usize> {
        let needle = name_or_slug.trim().to_lowercase();
        let slug = slugify_playlist_name(name_or_slug).ok();
        self.playlists.iter().position(|p| {
            p.slug.to_lowercase() == needle
                || p.title.to_lowercase() == needle
                || slug.as_deref() == Some(p.slug.as_str())
        })
    }

    fn resolve_track_refs(&self, track_ids: &[String]) -> Result<Vec<&Track>> {
        let mut out = Vec::with_capacity(track_ids.len());
        for id in track_ids {
            let t = self
                .track_by_id(id)
                .ok_or_else(|| ZunoError::TrackNotFound(id.clone()))?;
            out.push(t);
        }
        Ok(out)
    }
}
