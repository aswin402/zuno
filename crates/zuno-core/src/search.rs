use crate::models::Track;

/// Ultra-lightweight zero-dependency fuzzy + substring search across track metadata.
pub fn search_tracks<'a>(tracks: &'a [Track], query: &str, limit: usize) -> Vec<&'a Track> {
    let q = query.trim().to_lowercase();
    if q.is_empty() {
        return tracks.iter().take(limit).collect();
    }

    let tokens: Vec<&str> = q.split_whitespace().collect();
    let mut scored: Vec<(i32, &'a Track)> = tracks
        .iter()
        .filter_map(|track| {
            let score = score_track(track, &q, &tokens);
            (score > 0).then_some((score, track))
        })
        .collect();

    scored.sort_by(|a, b| {
        b.0.cmp(&a.0)
            .then_with(|| a.1.title.to_lowercase().cmp(&b.1.title.to_lowercase()))
    });

    scored.into_iter().take(limit).map(|(_, t)| t).collect()
}

fn score_track(track: &Track, full_query: &str, tokens: &[&str]) -> i32 {
    let title = track.title.to_lowercase();
    let artist = track.artist.to_lowercase();
    let album = track.album.to_lowercase();
    let folder = track.folder.to_lowercase();
    let path = track.rel_path.to_lowercase();
    let genre = track
        .genre
        .as_deref()
        .unwrap_or("")
        .to_lowercase();

    let mut total = 0;

    if title == full_query {
        total += 500;
    } else if title.starts_with(full_query) {
        total += 300;
    } else if title.contains(full_query) {
        total += 200;
    }

    if artist.contains(full_query) {
        total += 160;
    }
    if album.contains(full_query) {
        total += 100;
    }
    if folder.contains(full_query) {
        total += 110;
    }
    if genre.contains(full_query) {
        total += 90;
    }
    if path.contains(full_query) {
        total += 80;
    }

    // Multi-word token matching (every word must match at least one field).
    if tokens.len() > 1 {
        let mut all_matched = true;
        let mut token_score = 0;
        for tok in tokens {
            let mut s = 0;
            if title.contains(tok) {
                s += 80;
            }
            if artist.contains(tok) {
                s += 70;
            }
            if album.contains(tok) {
                s += 40;
            }
            if folder.contains(tok) {
                s += 50;
            }
            if genre.contains(tok) {
                s += 40;
            }
            if path.contains(tok) {
                s += 30;
            }
            if s == 0 {
                all_matched = false;
                break;
            }
            token_score += s;
        }
        if all_matched {
            total += token_score;
        }
    }

    // Fuzzy subsequence fallback on title/artist/path if direct substring didn't hit.
    if total == 0 {
        if let Some(f) = fuzzy_subsequence(&title, full_query) {
            total += f + 30;
        } else if let Some(f) = fuzzy_subsequence(&artist, full_query) {
            total += f + 20;
        } else if let Some(f) = fuzzy_subsequence(&path, full_query) {
            total += f;
        }
    }

    total
}

fn fuzzy_subsequence(haystack: &str, needle: &str) -> Option<i32> {
    let mut h_chars = haystack.chars().enumerate();
    let mut score = 0i32;
    let mut prev_idx: Option<usize> = None;

    for nc in needle.chars().filter(|c| !c.is_whitespace()) {
        let mut found = None;
        for (idx, hc) in h_chars.by_ref() {
            if hc == nc {
                found = Some(idx);
                break;
            }
        }
        let idx = found?;
        score += 10;
        if prev_idx.map(|p| p + 1 == idx).unwrap_or(false) {
            score += 6; // Consecutive character bonus
        }
        prev_idx = Some(idx);
    }

    Some(score)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn mk_track(id: &str, title: &str, artist: &str, folder: &str) -> Track {
        Track {
            id: id.into(),
            rel_path: if folder.is_empty() {
                format!("{}.mp3", title)
            } else {
                format!("{}/{}.mp3", folder, title)
            },
            title: title.into(),
            artist: artist.into(),
            album: String::new(),
            genre: None,
            duration_secs: 180,
            file_size: 1000,
            modified_secs: 0,
            folder: folder.into(),
            source_dir: None,
            has_cover: false,
        }
    }

    #[test]
    fn ranks_exact_prefix_multiword_and_fuzzy() {
        let tracks = vec![
            mk_track("1", "Midnight Rain", "Lo-Fi Lab", "focus"),
            mk_track("2", "Rainy Morning", "Jazz Trio", "chill"),
            mk_track("3", "Sunset Drive", "Synthwave", "workout"),
        ];

        let r1 = search_tracks(&tracks, "midnight", 10);
        assert_eq!(r1[0].id, "1");

        let r2 = search_tracks(&tracks, "focus rain", 10);
        assert_eq!(r2[0].id, "1");

        // Fuzzy subsequence: "snsdrv" -> "Sunset Drive"
        let r3 = search_tracks(&tracks, "snsdrv", 10);
        assert_eq!(r3.len(), 1);
        assert_eq!(r3[0].id, "3");
    }
}
