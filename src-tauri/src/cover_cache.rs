use std::collections::HashMap;
use std::fs;
use std::path::PathBuf;
use std::sync::{Arc, Mutex, mpsc};
use zuno_audio::ZunoService;
use zuno_core::CoverArt;

const MAX_MEM_ENTRIES: usize = 256;

struct CoverTask {
    track_id: String,
    thumb_size: Option<u32>,
    responder: tauri::UriSchemeResponder,
}

/// Bounded 2-thread asynchronous cover art server with:
/// - In-memory cache (capped at 256 small thumbnails, ~1-2 MB RAM max)
/// - Persistent disk thumbnail cache (`~/zuno/.zuno/thumbs/<id>_<size>.jpg`)
/// - Fast SIMD `gdk-pixbuf` resizing on Linux (turns 1.5 MB covers into ~5 KB crisp thumbnails)
/// - Zero main-thread blocking & lock-free disk I/O
pub struct CoverServer {
    tx: mpsc::Sender<CoverTask>,
}

impl CoverServer {
    pub fn start(service: Arc<ZunoService>) -> Self {
        let (tx, rx) = mpsc::channel::<CoverTask>();
        let rx = Arc::new(Mutex::new(rx));
        let mem_cache: Arc<Mutex<HashMap<String, Option<Arc<CoverArt>>>>> =
            Arc::new(Mutex::new(HashMap::new()));
        let thumbs_dir = service.paths().cache_dir().join("thumbs");
        let _ = fs::create_dir_all(&thumbs_dir);

        // 2 lightweight worker threads keep I/O parallel without flooding CPU or file descriptors.
        for idx in 0..2 {
            let rx = Arc::clone(&rx);
            let svc = Arc::clone(&service);
            let cache = Arc::clone(&mem_cache);
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
                        let art = load_or_build_cover(&svc, &cache, &dir, &task.track_id, task.thumb_size);
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

    pub fn enqueue(&self, track_id: String, thumb_size: Option<u32>, responder: tauri::UriSchemeResponder) {
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
    mem_cache: &Mutex<HashMap<String, Option<Arc<CoverArt>>>>,
    thumbs_dir: &PathBuf,
    track_id: &str,
    thumb_size: Option<u32>,
) -> Option<Arc<CoverArt>> {
    let bucket_size = thumb_size.map(|s| s.clamp(48, 256));
    let cache_key = match bucket_size {
        Some(s) => format!("{track_id}@{s}"),
        None => track_id.to_string(),
    };

    // 1. O(1) in-memory cache hit
    if let Ok(guard) = mem_cache.lock() {
        if let Some(cached) = guard.get(&cache_key) {
            return cached.clone();
        }
    }

    // 2. Fast persistent disk thumbnail hit (skips opening MP3/FLAC completely!)
    let safe_id: String = track_id
        .chars()
        .map(|c| if c.is_ascii_alphanumeric() || c == '-' || c == '_' { c } else { '_' })
        .collect();
    let disk_path = bucket_size.map(|s| thumbs_dir.join(format!("{safe_id}_{s}.jpg")));
    if let Some(ref p) = disk_path {
        if let Ok(bytes) = fs::read(p) {
            if !bytes.is_empty() {
                let art = Arc::new(CoverArt {
                    mime_type: "image/jpeg".to_string(),
                    bytes,
                });
                insert_mem_cache(mem_cache, cache_key, Some(Arc::clone(&art)));
                return Some(art);
            }
        }
    }

    // 3. Extract embedded art lock-free from the audio file
    let raw = match service.extract_cover(track_id) {
        Some(art) => art,
        None => {
            insert_mem_cache(mem_cache, cache_key, None);
            return None;
        }
    };

    // 4. Resize down to crisp small JPEG thumbnail when requested (cuts WebKitGTK RAM by ~100-300x!)
    let final_art = if let Some(size) = bucket_size {
        let resized = resize_to_jpeg(&raw.bytes, size).unwrap_or(raw);
        if let Some(ref p) = disk_path {
            let tmp = p.with_extension("jpg.tmp");
            if fs::write(&tmp, &resized.bytes).is_ok() {
                let _ = fs::rename(&tmp, p);
            }
        }
        Arc::new(resized)
    } else {
        Arc::new(raw)
    };

    // Only keep small thumbnails in RAM cache (full-res covers are rare & large)
    if bucket_size.is_some() {
        insert_mem_cache(mem_cache, cache_key, Some(Arc::clone(&final_art)));
    }
    Some(final_art)
}

fn insert_mem_cache(
    mem_cache: &Mutex<HashMap<String, Option<Arc<CoverArt>>>>,
    key: String,
    val: Option<Arc<CoverArt>>,
) {
    if let Ok(mut guard) = mem_cache.lock() {
        if guard.len() >= MAX_MEM_ENTRIES {
            // Simple fast eviction of ~half the cache when full
            let to_drop: Vec<String> = guard.keys().take(MAX_MEM_ENTRIES / 2).cloned().collect();
            for k in to_drop {
                guard.remove(&k);
            }
        }
        guard.insert(key, val);
    }
}

#[cfg(target_os = "linux")]
fn resize_to_jpeg(bytes: &[u8], target: u32) -> Option<CoverArt> {
    use gdk_pixbuf::{InterpType, Pixbuf};
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
