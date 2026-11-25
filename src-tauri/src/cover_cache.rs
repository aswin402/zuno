use std::collections::HashMap;
use std::fs;
use std::path::PathBuf;
use std::sync::{Arc, Mutex, mpsc};
use zuno_audio::ZunoService;
use zuno_core::{CoverArt, atomic_write};

const MAX_MEM_ENTRIES: usize = 256;
const SIZE_BUCKETS: &[u32] = &[64, 96, 160, 256];

struct CoverTask {
    track_id: String,
    thumb_size: Option<u32>,
    responder: tauri::UriSchemeResponder,
}

type CoverResult = Option<Arc<CoverArt>>;

/// Deterministic LRU cache bounded by entry count (replaces random HashMap half-eviction).
struct LruCoverCache {
    entries: HashMap<String, (u64, CoverResult)>,
    clock: u64,
    capacity: usize,
}

impl LruCoverCache {
    fn new(capacity: usize) -> Self {
        Self {
            entries: HashMap::with_capacity(capacity),
            clock: 0,
            capacity: capacity.max(1),
        }
    }

    fn get(&mut self, key: &str) -> Option<CoverResult> {
        let entry = self.entries.get_mut(key)?;
        self.clock += 1;
        entry.0 = self.clock;
        Some(entry.1.clone())
    }

    fn insert(&mut self, key: String, val: CoverResult) {
        self.clock += 1;
        if !self.entries.contains_key(&key) && self.entries.len() >= self.capacity {
            if let Some(oldest_key) = self
                .entries
                .iter()
                .min_by_key(|(_, (ts, _))| *ts)
                .map(|(k, _)| k.clone())
            {
                self.entries.remove(&oldest_key);
            }
        }
        self.entries.insert(key, (self.clock, val));
    }
}

/// Singleflight coordinator: collapses simultaneous misses for the same cover key into one build.
type InFlightMap = Mutex<HashMap<String, Vec<mpsc::Sender<CoverResult>>>>;

fn snap_bucket_size(raw: u32) -> u32 {
    for &b in SIZE_BUCKETS {
        if raw <= b {
            return b;
        }
    }
    *SIZE_BUCKETS.last().unwrap()
}

/// Detect true image MIME type from file header magic bytes (prevents serving PNG/WebP as JPEG).
fn sniff_image_mime(bytes: &[u8]) -> &'static str {
    if bytes.starts_with(&[0x89, b'P', b'N', b'G', 0x0D, 0x0A, 0x1A, 0x0A]) {
        "image/png"
    } else if bytes.len() >= 12 && &bytes[0..4] == b"RIFF" && &bytes[8..12] == b"WEBP" {
        "image/webp"
    } else if bytes.starts_with(b"GIF8") {
        "image/gif"
    } else {
        "image/jpeg"
    }
}

/// Bounded 2-thread asynchronous cover art server with:
/// - True LRU in-memory cache (256 entries max)
/// - Singleflight deduplication so parallel requests for the same cover decode once
/// - Discrete size bucketing (`64`, `96`, `160`, `256` px) + magic-byte MIME sniffing
/// - Atomic PID-unique disk thumbnail writes (`~/zuno/.zuno/thumbs/<id>_<size>.thumb`)
pub struct CoverServer {
    tx: mpsc::Sender<CoverTask>,
}

impl CoverServer {
    pub fn start(service: Arc<ZunoService>) -> Self {
        let (tx, rx) = mpsc::channel::<CoverTask>();
        let rx = Arc::new(Mutex::new(rx));
        let mem_cache = Arc::new(Mutex::new(LruCoverCache::new(MAX_MEM_ENTRIES)));
        let in_flight: Arc<InFlightMap> = Arc::new(Mutex::new(HashMap::new()));
        let thumbs_dir = service.paths().cache_dir().join("thumbs");
        let _ = fs::create_dir_all(&thumbs_dir);

        // 2 lightweight worker threads keep I/O parallel without flooding CPU or file descriptors.
        for idx in 0..2 {
            let rx = Arc::clone(&rx);
            let svc = Arc::clone(&service);
            let cache = Arc::clone(&mem_cache);
            let flight = Arc::clone(&in_flight);
            let dir = thumbs_dir.clone();
            let _ = std::thread::Builder::new()
                .name(format!("zuno-cover-{idx}"))
                .spawn(move || {
                    loop {
                        let task = {
                            let guard = rx.lock().unwrap();
                            guard.recv()
                        };
                        let Ok(task) = task else { break };
                        let art = load_or_build_cover(
                            &svc,
                            &cache,
                            &flight,
                            &dir,
                            &task.track_id,
                            task.thumb_size,
                        );
                        let response = match art {
                            Some(art) => tauri::http::Response::builder()
                                .status(200)
                                .header("Content-Type", art.mime_type.as_str())
                                .header("Cache-Control", "public, max-age=31536000, immutable")
                                .body(art.bytes.clone())
                                .unwrap(),
                            None => tauri::http::Response::builder()
                                .status(404)
                                .header("Content-Type", "text/plain")
                                .header("Cache-Control", "public, max-age=3600")
                                .body(Vec::new())
                                .unwrap(),
                        };
                        task.responder.respond(response);
                    }
                });
        }

        Self { tx }
    }

    pub fn enqueue(
        &self,
        track_id: String,
        thumb_size: Option<u32>,
        responder: tauri::UriSchemeResponder,
    ) {
        if let Err(mpsc::SendError(task)) = self.tx.send(CoverTask {
            track_id,
            thumb_size,
            responder,
        }) {
            let _ = task.responder.respond(
                tauri::http::Response::builder()
                    .status(503)
                    .body(Vec::new())
                    .unwrap(),
            );
        }
    }
}

fn load_or_build_cover(
    service: &ZunoService,
    mem_cache: &Mutex<LruCoverCache>,
    in_flight: &InFlightMap,
    thumbs_dir: &PathBuf,
    track_id: &str,
    thumb_size: Option<u32>,
) -> CoverResult {
    let bucket_size = thumb_size.map(snap_bucket_size);
    let cache_key = match bucket_size {
        Some(s) => format!("{track_id}@{s}"),
        None => track_id.to_string(),
    };

    // 1. O(1) LRU in-memory cache hit
    if let Ok(mut guard) = mem_cache.lock() {
        if let Some(cached) = guard.get(&cache_key) {
            return cached;
        }
    }

    // 2. Singleflight: if another worker is already building this key, wait for its result.
    let waiter_rx = {
        let mut guard = in_flight.lock().unwrap();
        if let Some(waiters) = guard.get_mut(&cache_key) {
            let (tx, rx) = mpsc::channel();
            waiters.push(tx);
            Some(rx)
        } else {
            guard.insert(cache_key.clone(), Vec::new());
            None
        }
    };
    if let Some(rx) = waiter_rx {
        return rx.recv().ok().flatten();
    }

    let result = compute_cover_uncached(service, mem_cache, thumbs_dir, track_id, bucket_size, &cache_key);

    // Notify any waiters that arrived while we were extracting/resizing.
    let waiters = in_flight.lock().unwrap().remove(&cache_key).unwrap_or_default();
    for tx in waiters {
        let _ = tx.send(result.clone());
    }
    result
}

fn compute_cover_uncached(
    service: &ZunoService,
    mem_cache: &Mutex<LruCoverCache>,
    thumbs_dir: &PathBuf,
    track_id: &str,
    bucket_size: Option<u32>,
    cache_key: &str,
) -> CoverResult {
    // 1. Persistent disk thumbnail hit (skips opening MP3/FLAC completely!)
    let safe_id: String = track_id
        .chars()
        .map(|c| {
            if c.is_ascii_alphanumeric() || c == '-' || c == '_' {
                c
            } else {
                '_'
            }
        })
        .collect();
    let disk_path = bucket_size.map(|s| thumbs_dir.join(format!("{safe_id}_{s}.jpg")));
    if let Some(ref p) = disk_path {
        if let Ok(bytes) = fs::read(p) {
            if !bytes.is_empty() {
                let mime_type = sniff_image_mime(&bytes).to_string();
                let art = Arc::new(CoverArt { mime_type, bytes });
                if let Ok(mut guard) = mem_cache.lock() {
                    guard.insert(cache_key.to_string(), Some(Arc::clone(&art)));
                }
                return Some(art);
            }
        }
    }

    // 2. Extract embedded art lock-free from the audio file
    let raw = match service.extract_cover(track_id) {
        Some(art) => art,
        None => {
            if let Ok(mut guard) = mem_cache.lock() {
                guard.insert(cache_key.to_string(), None);
            }
            return None;
        }
    };

    // 3. Resize down to crisp small JPEG thumbnail when requested (cuts WebKitGTK RAM by ~100-300x!)
    let final_art = if let Some(size) = bucket_size {
        let resized = resize_to_jpeg(&raw.bytes, size).unwrap_or(raw);
        if let Some(ref p) = disk_path {
            let _ = atomic_write(p, &resized.bytes);
        }
        Arc::new(resized)
    } else {
        Arc::new(raw)
    };

    if bucket_size.is_some() {
        if let Ok(mut guard) = mem_cache.lock() {
            guard.insert(cache_key.to_string(), Some(Arc::clone(&final_art)));
        }
    }
    Some(final_art)
}

#[cfg(target_os = "linux")]
fn resize_to_jpeg(bytes: &[u8], target: u32) -> Option<CoverArt> {
    use gdk_pixbuf::{InterpType, Pixbuf};
    // `gdk_pixbuf::Pixbuf::from_read` requires `Read + 'static`.
    let cursor = std::io::Cursor::new(bytes.to_vec());
    let pix = Pixbuf::from_read(cursor).ok()?;
    let w = pix.width().max(1) as u32;
    let h = pix.height().max(1) as u32;
    let (nw, nh) = if w <= target && h <= target {
        (w as i32, h as i32)
    } else if w >= h {
        let scale = target as f32 / w as f32;
        (target as i32, ((h as f32 * scale).round() as i32).max(1))
    } else {
        let scale = target as f32 / h as f32;
        (((w as f32 * scale).round() as i32).max(1), target as i32)
    };
    let scaled = pix.scale_simple(nw, nh, InterpType::Bilinear)?;
    let out = scaled.save_to_bufferv("jpeg", &[("quality", "82")]).ok()?;
    Some(CoverArt {
        mime_type: "image/jpeg".to_string(),
        bytes: out,
    })
}

#[cfg(not(target_os = "linux"))]
fn resize_to_jpeg(_bytes: &[u8], _target: u32) -> Option<CoverArt> {
    None
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn lru_evicts_least_recently_used_entry() {
        let mut cache = LruCoverCache::new(2);
        cache.insert("a".into(), None);
        cache.insert("b".into(), None);
        // Touch "a" so "b" becomes least recently used
        assert!(cache.get("a").is_some());
        cache.insert("c".into(), None);
        assert!(cache.get("a").is_some());
        assert!(cache.get("c").is_some());
        assert!(cache.get("b").is_none());
    }

    #[test]
    fn snaps_buckets_and_sniffs_image_mimes() {
        assert_eq!(snap_bucket_size(48), 64);
        assert_eq!(snap_bucket_size(96), 96);
        assert_eq!(snap_bucket_size(120), 160);
        assert_eq!(snap_bucket_size(512), 256);

        assert_eq!(
            sniff_image_mime(&[0x89, b'P', b'N', b'G', 0x0D, 0x0A, 0x1A, 0x0A, 0]),
            "image/png"
        );
        assert_eq!(sniff_image_mime(b"RIFF\x00\x00\x00\x00WEBP"), "image/webp");
        assert_eq!(sniff_image_mime(&[0xFF, 0xD8, 0xFF, 0xE0]), "image/jpeg");
    }
}
