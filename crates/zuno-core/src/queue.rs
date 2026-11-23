use crate::models::RepeatMode;

/// Pure-logic queue manager supporting shuffle (order-preserving unshuffle), repeat, and Up Next.
#[derive(Debug, Clone, Default)]
pub struct QueueManager {
    /// Original unshuffled order of track IDs.
    original_order: Vec<String>,
    /// Active playback order (equals `original_order` unless shuffled).
    order: Vec<String>,
    current_index: Option<usize>,
    shuffle: bool,
    repeat: RepeatMode,
    active_playlist: Option<String>,
    rng_state: u64,
}

impl QueueManager {
    pub fn new() -> Self {
        let seed = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .map(|d| d.as_nanos() as u64)
            .unwrap_or(0x9E37_79B9_7F4A_7C15);
        Self {
            rng_state: seed.max(1),
            ..Self::default()
        }
    }

    pub fn set_queue(
        &mut self,
        track_ids: Vec<String>,
        start_track_id: Option<&str>,
        playlist_slug: Option<String>,
    ) -> Option<String> {
        self.original_order = track_ids;
        self.active_playlist = playlist_slug;

        if self.original_order.is_empty() {
            self.order.clear();
            self.current_index = None;
            return None;
        }

        self.order = self.original_order.clone();
        let target_idx = start_track_id
            .and_then(|id| self.order.iter().position(|t| t == id))
            .unwrap_or(0);

        if self.shuffle {
            let current = self.order.remove(target_idx);
            self.fisher_yates_shuffle();
            self.order.insert(0, current);
            self.current_index = Some(0);
        } else {
            self.current_index = Some(target_idx);
        }

        self.current_track_id().map(str::to_string)
    }

    pub fn current_track_id(&self) -> Option<&str> {
        let idx = self.current_index?;
        self.order.get(idx).map(String::as_str)
    }

    pub fn current_index(&self) -> Option<usize> {
        self.current_index
    }

    pub fn queue_ids(&self) -> &[String] {
        &self.order
    }

    pub fn len(&self) -> usize {
        self.order.len()
    }

    pub fn is_empty(&self) -> bool {
        self.order.is_empty()
    }

    pub fn shuffle(&self) -> bool {
        self.shuffle
    }

    pub fn repeat(&self) -> RepeatMode {
        self.repeat
    }

    pub fn active_playlist(&self) -> Option<&str> {
        self.active_playlist.as_deref()
    }

    pub fn set_repeat(&mut self, repeat: RepeatMode) {
        self.repeat = repeat;
    }

    pub fn set_shuffle(&mut self, enabled: bool) {
        if self.shuffle == enabled {
            return;
        }
        self.shuffle = enabled;
        let current = self.current_track_id().map(str::to_string);

        if enabled {
            self.order = self.original_order.clone();
            if let Some(ref cur) = current {
                if let Some(pos) = self.order.iter().position(|id| id == cur) {
                    let item = self.order.remove(pos);
                    self.fisher_yates_shuffle();
                    self.order.insert(0, item);
                    self.current_index = Some(0);
                    return;
                }
            }
            self.fisher_yates_shuffle();
            self.current_index = if self.order.is_empty() { None } else { Some(0) };
        } else {
            self.order = self.original_order.clone();
            self.current_index = current
                .as_deref()
                .and_then(|cur| self.order.iter().position(|id| id == cur))
                .or_else(|| if self.order.is_empty() { None } else { Some(0) });
        }
    }

    /// Append tracks to the end of the queue, or insert immediately after the current track (`play_next`).
    pub fn add_tracks(&mut self, ids: Vec<String>, play_next: bool) {
        if ids.is_empty() {
            return;
        }
        if self.order.is_empty() {
            self.original_order = ids.clone();
            self.order = ids;
            self.current_index = Some(0);
            return;
        }

        if play_next {
            let insert_at = self
                .current_index
                .map(|i| (i + 1).min(self.order.len()))
                .unwrap_or(0);
            for (offset, id) in ids.iter().enumerate() {
                self.order.insert(insert_at + offset, id.clone());
                self.original_order.push(id.clone());
            }
        } else {
            self.order.extend(ids.iter().cloned());
            self.original_order.extend(ids);
        }
    }

    pub fn clear(&mut self) {
        self.order.clear();
        self.original_order.clear();
        self.current_index = None;
        self.active_playlist = None;
    }

    /// Advance to the next track respecting repeat mode.
    /// `auto_advance` is true when a track naturally finishes (`RepeatMode::One` repeats it).
    pub fn next(&mut self, auto_advance: bool) -> Option<String> {
        if self.order.is_empty() {
            return None;
        }
        let idx = self.current_index.unwrap_or(0);

        if auto_advance && self.repeat == RepeatMode::One {
            return self.order.get(idx).cloned();
        }

        if idx + 1 < self.order.len() {
            self.current_index = Some(idx + 1);
            return self.order.get(idx + 1).cloned();
        }

        match self.repeat {
            RepeatMode::All => {
                self.current_index = Some(0);
                self.order.first().cloned()
            }
            RepeatMode::One if !auto_advance => {
                self.current_index = Some(0);
                self.order.first().cloned()
            }
            _ => None,
        }
    }

    pub fn previous(&mut self) -> Option<String> {
        if self.order.is_empty() {
            return None;
        }
        let idx = self.current_index.unwrap_or(0);
        if idx > 0 {
            self.current_index = Some(idx - 1);
            self.order.get(idx - 1).cloned()
        } else if self.repeat == RepeatMode::All {
            let last = self.order.len() - 1;
            self.current_index = Some(last);
            self.order.get(last).cloned()
        } else {
            self.order.first().cloned()
        }
    }

    /// Remove any track IDs that no longer exist after a rescan.
    pub fn retain_existing<F>(&mut self, mut exists: F)
    where
        F: FnMut(&str) -> bool,
    {
        let current = self.current_track_id().map(str::to_string);
        self.original_order.retain(|id| exists(id));
        self.order.retain(|id| exists(id));
        self.current_index = current
            .as_deref()
            .and_then(|c| self.order.iter().position(|id| id == c))
            .or_else(|| if self.order.is_empty() { None } else { Some(0) });
    }

    fn fisher_yates_shuffle(&mut self) {
        let len = self.order.len();
        if len <= 1 {
            return;
        }
        for i in (1..len).rev() {
            let j = (self.next_u64() as usize) % (i + 1);
            self.order.swap(i, j);
        }
    }

    fn next_u64(&mut self) -> u64 {
        // xorshift64* (zero external RNG crate needed)
        let mut x = self.rng_state;
        x ^= x >> 12;
        x ^= x << 25;
        x ^= x >> 27;
        self.rng_state = x.max(1);
        x.wrapping_mul(0x2545_F491_4F6C_DD1D)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn queue_next_prev_repeat_and_shuffle() {
        let mut q = QueueManager::new();
        let ids = vec!["a".into(), "b".into(), "c".into()];
        assert_eq!(q.set_queue(ids, Some("b"), None).as_deref(), Some("b"));
        assert_eq!(q.next(false).as_deref(), Some("c"));
        assert_eq!(q.next(false), None); // RepeatMode::Off stops at end

        q.set_repeat(RepeatMode::All);
        assert_eq!(q.next(false).as_deref(), Some("a"));
        assert_eq!(q.previous().as_deref(), Some("c"));

        q.set_repeat(RepeatMode::One);
        assert_eq!(q.next(true).as_deref(), Some("c")); // Auto-advance repeats same track

        q.set_shuffle(true);
        assert_eq!(q.current_track_id(), Some("c")); // Current stays active at index 0
        assert_eq!(q.current_index(), Some(0));

        q.set_shuffle(false);
        assert_eq!(q.queue_ids(), &["a", "b", "c"]);
        assert_eq!(q.current_track_id(), Some("c"));
    }
}
