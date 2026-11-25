use crate::models::Track;

const SCORE_EXACT_TITLE: i32 = 500;
const SCORE_PREFIX_TITLE: i32 = 300;
const SCORE_SUBSTR_TITLE: i32 = 200;
const SCORE_SUBSTR_ARTIST: i32 = 160;
const SCORE_SUBSTR_FOLDER: i32 = 110;
const SCORE_SUBSTR_ALBUM: i32 = 100;
const SCORE_SUBSTR_GENRE: i32 = 90;
const SCORE_SUBSTR_PATH: i32 = 80;

const TOKEN_TITLE: i32 = 80;
const TOKEN_ARTIST: i32 = 70;
const TOKEN_FOLDER: i32 = 50;
const TOKEN_ALBUM: i32 = 40;
const TOKEN_GENRE: i32 = 40;
const TOKEN_PATH: i32 = 30;

const FUZZY_CHAR_BASE: i32 = 10;
const FUZZY_CONSECUTIVE_BONUS: i32 = 12;
const FUZZY_BOUNDARY_BONUS: i32 = 10;
const FUZZY_GAP_START_PENALTY: i32 = 5;
const FUZZY_GAP_EXT_PENALTY: i32 = 1;
const FUZZY_TITLE_OFFSET: i32 = 30;
const FUZZY_ARTIST_OFFSET: i32 = 20;
const TYPO_EDIT_1_SCORE: i32 = 55;
const TYPO_EDIT_2_SCORE: i32 = 28;

/// Zero-dependency multi-signal search with exact/prefix/multi-word ranking,
/// DP-optimal fuzzy subsequence scoring, and Damerau-Levenshtein typo tolerance.
pub fn search_tracks<'a>(tracks: &'a [Track], query: &str, limit: usize) -> Vec<&'a Track> {
    let q = query.trim().to_lowercase();
    if q.is_empty() {
        return tracks.iter().take(limit).collect();
    }

    let tokens: Vec<&str> = q.split_whitespace().collect();
    let mut scored: Vec<(i32, String, &'a Track)> = tracks
        .iter()
        .filter_map(|track| {
            let title_low = track.title.to_lowercase();
            let score = score_track(track, &title_low, &q, &tokens);
            (score > 0).then_some((score, title_low, track))
        })
        .collect();

    scored.sort_by(|a, b| b.0.cmp(&a.0).then_with(|| a.1.cmp(&b.1)));

    scored.into_iter().take(limit).map(|(_, _, t)| t).collect()
}

fn score_track(track: &Track, title: &str, full_query: &str, tokens: &[&str]) -> i32 {
    let artist = track.artist.to_lowercase();
    let album = track.album.to_lowercase();
    let folder = track.folder.to_lowercase();
    let path = track.rel_path.to_lowercase();
    let genre = track.genre.as_deref().unwrap_or("").to_lowercase();

    let mut total = 0;

    if title == full_query {
        total += SCORE_EXACT_TITLE;
    } else if title.starts_with(full_query) {
        total += SCORE_PREFIX_TITLE;
    } else if title.contains(full_query) {
        total += SCORE_SUBSTR_TITLE;
    }

    let field_weights: [(&str, i32, i32); 5] = [
        (&artist, SCORE_SUBSTR_ARTIST, TOKEN_ARTIST),
        (&folder, SCORE_SUBSTR_FOLDER, TOKEN_FOLDER),
        (&album, SCORE_SUBSTR_ALBUM, TOKEN_ALBUM),
        (&genre, SCORE_SUBSTR_GENRE, TOKEN_GENRE),
        (&path, SCORE_SUBSTR_PATH, TOKEN_PATH),
    ];

    for &(field, substr_w, _) in &field_weights {
        if field.contains(full_query) {
            total += substr_w;
        }
    }

    // Multi-word token matching (every word must match at least one field).
    if tokens.len() > 1 {
        let mut all_matched = true;
        let mut token_score = 0;
        for &tok in tokens {
            let mut s = if title.contains(tok) { TOKEN_TITLE } else { 0 };
            for &(field, _, tok_w) in &field_weights {
                if field.contains(tok) {
                    s += tok_w;
                }
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

    // Optimal DP fuzzy subsequence fallback (takes best score across title/artist/path).
    if total == 0 {
        let mut best_fuzzy = 0;
        if let Some(f) = fuzzy_subsequence_dp(title, full_query) {
            best_fuzzy = best_fuzzy.max(f + FUZZY_TITLE_OFFSET);
        }
        if let Some(f) = fuzzy_subsequence_dp(&artist, full_query) {
            best_fuzzy = best_fuzzy.max(f + FUZZY_ARTIST_OFFSET);
        }
        if let Some(f) = fuzzy_subsequence_dp(&path, full_query) {
            best_fuzzy = best_fuzzy.max(f);
        }
        total += best_fuzzy;
    }

    // Bounded Damerau-Levenshtein typo tolerance on words (handles transpositions like "midngiht").
    if total == 0 {
        total += typo_word_score(title, tokens, 10)
            .max(typo_word_score(&artist, tokens, 0));
    }

    total
}

fn is_word_boundary(chars: &[char], idx: usize) -> bool {
    idx == 0 || !chars[idx - 1].is_alphanumeric()
}

/// Optimal dynamic-programming fuzzy subsequence matcher (Smith-Waterman / FZF style).
/// Unlike greedy first-match, chooses the alignment maximizing consecutive runs and word-boundary hits.
fn fuzzy_subsequence_dp(haystack: &str, needle: &str) -> Option<i32> {
    let n_chars: Vec<char> = needle.chars().filter(|c| !c.is_whitespace()).collect();
    if n_chars.is_empty() {
        return None;
    }
    let h_chars: Vec<char> = haystack.chars().collect();
    let m = n_chars.len();
    let n = h_chars.len();
    if m > n {
        return None;
    }

    // Fast subsequence feasibility check before DP allocation.
    let mut check = 0;
    for &hc in &h_chars {
        if hc == n_chars[check] {
            check += 1;
            if check == m {
                break;
            }
        }
    }
    if check < m {
        return None;
    }

    const NEG_INF: i32 = i32::MIN / 4;
    // Textbook Gotoh / Smith-Waterman O(m*n) affine-gap DP:
    // prev_match[j] = best score matching n_chars[0..=i] ending right at h_chars[j]
    // prev_gap[j]   = best score matching n_chars[0..=i] ending at some k <= j,
    //                 already charged GAP_START + (j - k) * GAP_EXT for a gap extending to j + 1.
    let mut prev_match = vec![NEG_INF; n];
    let mut prev_gap = vec![NEG_INF; n];
    let mut cur_match = vec![NEG_INF; n];
    let mut cur_gap = vec![NEG_INF; n];

    for (j, &hc) in h_chars.iter().enumerate() {
        if hc == n_chars[0] {
            let bonus = if is_word_boundary(&h_chars, j) {
                FUZZY_BOUNDARY_BONUS
            } else {
                0
            };
            prev_match[j] = FUZZY_CHAR_BASE + bonus;
        }
        let open_gap = prev_match[j] - FUZZY_GAP_START_PENALTY;
        prev_gap[j] = if j == 0 {
            open_gap
        } else {
            open_gap.max(prev_gap[j - 1] - FUZZY_GAP_EXT_PENALTY)
        };
    }

    for &nc in &n_chars[1..] {
        cur_match.fill(NEG_INF);
        cur_gap[0] = NEG_INF;
        for j in 1..n {
            if h_chars[j] == nc {
                let boundary = if is_word_boundary(&h_chars, j) {
                    FUZZY_BOUNDARY_BONUS
                } else {
                    0
                };
                let from_consec = prev_match[j - 1] + FUZZY_CHAR_BASE + FUZZY_CONSECUTIVE_BONUS;
                let from_gap = if j >= 2 {
                    prev_gap[j - 2] + FUZZY_CHAR_BASE + boundary
                } else {
                    NEG_INF
                };
                cur_match[j] = from_consec.max(from_gap);
            }
            let open_gap = cur_match[j] - FUZZY_GAP_START_PENALTY;
            cur_gap[j] = open_gap.max(cur_gap[j - 1] - FUZZY_GAP_EXT_PENALTY);
        }
        std::mem::swap(&mut prev_match, &mut cur_match);
        std::mem::swap(&mut prev_gap, &mut cur_gap);
    }

    let best = prev_match.into_iter().max().unwrap_or(NEG_INF);
    (best > NEG_INF / 2).then_some(best.max(1))
}

fn typo_word_score(field: &str, tokens: &[&str], field_bonus: i32) -> i32 {
    let words: Vec<&str> = field
        .split(|c: char| !c.is_alphanumeric())
        .filter(|w| w.len() >= 3)
        .collect();
    if words.is_empty() {
        return 0;
    }

    let mut total = 0;
    for &tok in tokens {
        let tok_len = tok.chars().count();
        if tok_len < 4 {
            return 0;
        }
        let max_dist = if tok_len >= 7 { 2 } else { 1 };
        let mut best_for_tok = 0;
        for &w in &words {
            if let Some(d) = damerau_levenshtein_bounded(tok, w, max_dist) {
                let s = match d {
                    0 | 1 => TYPO_EDIT_1_SCORE + field_bonus,
                    _ => TYPO_EDIT_2_SCORE + field_bonus,
                };
                best_for_tok = best_for_tok.max(s);
            }
        }
        if best_for_tok == 0 {
            return 0;
        }
        total += best_for_tok;
    }
    total
}

/// Optimal String Alignment (restricted Damerau-Levenshtein) distance with early exit above `max_dist`.
fn damerau_levenshtein_bounded(a: &str, b: &str, max_dist: usize) -> Option<usize> {
    let ac: Vec<char> = a.chars().collect();
    let bc: Vec<char> = b.chars().collect();
    let la = ac.len();
    let lb = bc.len();
    if la.abs_diff(lb) > max_dist {
        return None;
    }

    let cols = lb + 1;
    let mut dp = vec![0usize; (la + 1) * cols];
    for i in 0..=la {
        dp[i * cols] = i;
    }
    for j in 0..=lb {
        dp[j] = j;
    }

    for i in 1..=la {
        let mut row_min = usize::MAX;
        for j in 1..=lb {
            let cost = usize::from(ac[i - 1] != bc[j - 1]);
            let mut val = (dp[(i - 1) * cols + j] + 1)
                .min(dp[i * cols + (j - 1)] + 1)
                .min(dp[(i - 1) * cols + (j - 1)] + cost);
            if i > 1 && j > 1 && ac[i - 1] == bc[j - 2] && ac[i - 2] == bc[j - 1] {
                val = val.min(dp[(i - 2) * cols + (j - 2)] + 1);
            }
            dp[i * cols + j] = val;
            row_min = row_min.min(val);
        }
        if row_min > max_dist {
            return None;
        }
    }

    let dist = dp[la * cols + lb];
    (dist <= max_dist).then_some(dist)
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
    fn ranks_exact_prefix_multiword_fuzzy_and_typos() {
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

        // Transposition typo: "midngiht" -> "Midnight Rain"
        let r4 = search_tracks(&tracks, "midngiht", 10);
        assert_eq!(r4.len(), 1);
        assert_eq!(r4[0].id, "1");
    }

    #[test]
    fn dp_fuzzy_prefers_contiguous_word_over_greedy_scattered_match() {
        let s_contiguous = fuzzy_subsequence_dp("around rain", "rain").unwrap();
        let s_scattered = fuzzy_subsequence_dp("r_a_i_n", "rain").unwrap();
        assert!(s_contiguous > s_scattered);
    }
}
