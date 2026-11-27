#![cfg(any(target_os = "android", test))]

use serde_json::json;
use std::io::{BufRead, BufReader, Write};
use std::net::{TcpListener, TcpStream};
use std::sync::Arc;
use std::time::{Duration, SystemTime, UNIX_EPOCH};
use zuno_audio::ZunoService;
use zuno_core::ipc::IpcRequest;
use zuno_core::{PlayState, UNKNOWN_ARTIST};

/// Ephemeral loopback bridge allowing Android's native `ZunoMediaService` and
/// `ZunoAppWidgetProvider` to read playback state, fetch embedded cover art, and execute
/// Play / Pause / Next / Previous / Seek directly against Rust `ZunoService` even when the
/// phone screen is locked and the Android WebView is frozen.
#[derive(Debug, Clone)]
pub struct AndroidBridgeHandle {
    pub port: u16,
    pub token: String,
}

fn generate_token() -> String {
    let nanos = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_nanos())
        .unwrap_or(0);
    let pid = std::process::id() as u128;
    let mixed = nanos ^ (pid << 48) ^ 0x5a75_6e6f_416e_6472_6f69_6431u128;
    format!("{mixed:032x}")
}

pub fn start_android_bridge(service: Arc<ZunoService>) -> Result<AndroidBridgeHandle, String> {
    let listener = TcpListener::bind("127.0.0.1:0")
        .map_err(|e| format!("failed to bind Android media bridge: {e}"))?;
    let port = listener
        .local_addr()
        .map_err(|e| format!("failed to read bridge port: {e}"))?
        .port();
    let token = generate_token();

    // Persist bridge coordinates in app-private cache so background services/widgets
    // can reconnect even before the WebView calls `configureRustBridge`.
    let meta_path = service.paths().cache_dir().join("android-bridge.json");
    let meta_json = json!({ "port": port, "token": &token }).to_string();
    let _ = zuno_core::atomic_write(&meta_path, meta_json.as_bytes());

    let expected_token = token.clone();
    std::thread::Builder::new()
        .name("zuno-android-bridge".into())
        .spawn(move || {
            for stream in listener.incoming().flatten() {
                let svc = Arc::clone(&service);
                let tok = expected_token.clone();
                let _ = std::thread::Builder::new()
                    .name("zuno-bridge-req".into())
                    .spawn(move || handle_client(stream, &svc, &tok));
            }
        })
        .map_err(|e| format!("failed to spawn Android bridge thread: {e}"))?;

    Ok(AndroidBridgeHandle { port, token })
}

fn status_json(service: &ZunoService) -> String {
    let st = service.status();
    let state_str = match st.state {
        PlayState::Playing => "playing",
        PlayState::Paused => "paused",
        PlayState::Stopped => "stopped",
    };
    let (track_id, title, artist, album, has_cover, track_dur) = match st.current_track.as_ref() {
        Some(t) => {
            let artist_str = if !t.artist.is_empty() && t.artist != UNKNOWN_ARTIST {
                t.artist.as_str()
            } else if !t.folder.is_empty() {
                t.folder.as_str()
            } else {
                UNKNOWN_ARTIST
            };
            let album_str = if !t.album.is_empty() {
                t.album.as_str()
            } else if !t.folder.is_empty() {
                t.folder.as_str()
            } else {
                "Zuno"
            };
            (
                t.id.as_str(),
                t.title.as_str(),
                artist_str,
                album_str,
                t.has_cover,
                t.duration_secs as f64,
            )
        }
        None => ("", "", "", "", false, 0.0),
    };
    let duration_secs = if st.duration_secs > 0.0 {
        st.duration_secs
    } else {
        track_dur
    };
    json!({
        "state": state_str,
        "is_playing": st.state == PlayState::Playing,
        "track_id": track_id,
        "title": title,
        "artist": artist,
        "album": album,
        "has_cover": has_cover,
        "position_ms": (st.position_secs.max(0.0) * 1000.0).round() as u64,
        "duration_ms": (duration_secs.max(0.0) * 1000.0).round() as u64,
        "queue_len": st.queue_len,
    })
    .to_string()
}

fn write_http(stream: &mut TcpStream, status: &str, content_type: &str, body: &[u8]) {
    let header = format!(
        "HTTP/1.1 {status}\r\nContent-Type: {content_type}\r\nContent-Length: {}\r\nConnection: close\r\n\r\n",
        body.len()
    );
    let _ = stream.write_all(header.as_bytes());
    let _ = stream.write_all(body);
    let _ = stream.flush();
}

fn decode_url_segment(input: &str) -> String {
    let bytes = input.as_bytes();
    let mut out = Vec::with_capacity(bytes.len());
    let mut i = 0;
    while i < bytes.len() {
        if bytes[i] == b'%' && i + 2 < bytes.len() {
            if let (Some(h), Some(l)) = (
                (bytes[i + 1] as char).to_digit(16),
                (bytes[i + 2] as char).to_digit(16),
            ) {
                out.push(((h << 4) | l) as u8);
                i += 3;
                continue;
            }
        }
        out.push(bytes[i]);
        i += 1;
    }
    String::from_utf8(out).unwrap_or_else(|_| input.to_string())
}

fn handle_client(mut stream: TcpStream, service: &ZunoService, expected_token: &str) {
    let _ = stream.set_read_timeout(Some(Duration::from_secs(3)));
    let _ = stream.set_write_timeout(Some(Duration::from_secs(3)));

    let mut reader = match stream.try_clone() {
        Ok(cloned) => BufReader::new(cloned),
        Err(_) => return,
    };

    let mut req_line = String::new();
    if reader.read_line(&mut req_line).unwrap_or(0) == 0 {
        return;
    }

    let mut parts = req_line.split_whitespace();
    let method = parts.next().unwrap_or("");
    let raw_target = parts.next().unwrap_or("");
    let path = raw_target.split('?').next().unwrap_or(raw_target);

    let mut provided_token = String::new();
    loop {
        let mut line = String::new();
        let n = reader.read_line(&mut line).unwrap_or(0);
        if n == 0 || line == "\r\n" || line == "\n" {
            break;
        }
        if let Some((k, v)) = line.split_once(':') {
            if k.trim().eq_ignore_ascii_case("x-zuno-token") {
                provided_token = v.trim().to_string();
            }
        }
    }

    if provided_token != expected_token {
        write_http(&mut stream, "403 Forbidden", "text/plain", b"forbidden");
        return;
    }

    match (method, path) {
        ("GET", "/status") => {
            let body = status_json(service);
            write_http(&mut stream, "200 OK", "application/json", body.as_bytes());
        }
        ("GET", p) if p.starts_with("/cover/") => {
            let raw_id = p.trim_start_matches("/cover/").trim_end_matches('/');
            let track_id = decode_url_segment(raw_id);
            if let Some(art) = service.extract_cover(&track_id) {
                write_http(&mut stream, "200 OK", &art.mime_type, &art.bytes);
            } else {
                write_http(&mut stream, "404 Not Found", "text/plain", b"no cover");
            }
        }
        ("POST", p) if p.starts_with("/control/") => {
            let op = p.trim_start_matches("/control/");
            let req = match op {
                "play" => {
                    let st = service.status();
                    if st.current_track.is_some() && st.state == PlayState::Paused {
                        Some(IpcRequest::Resume)
                    } else if st.state == PlayState::Playing {
                        None
                    } else {
                        Some(IpcRequest::Play {
                            track_id: None,
                            query: None,
                            folder: None,
                            playlist: None,
                        })
                    }
                }
                "pause" => Some(IpcRequest::Pause),
                "toggle" => {
                    let st = service.status();
                    if st.current_track.is_none() && st.state == PlayState::Stopped {
                        Some(IpcRequest::Play {
                            track_id: None,
                            query: None,
                            folder: None,
                            playlist: None,
                        })
                    } else {
                        Some(IpcRequest::TogglePause)
                    }
                }
                "next" => Some(IpcRequest::Next),
                "previous" => Some(IpcRequest::Previous),
                "stop" => Some(IpcRequest::Stop),
                _ => None,
            };
            if let Some(ipc_req) = req {
                let _ = service.handle_request(ipc_req);
            }
            let body = status_json(service);
            write_http(&mut stream, "200 OK", "application/json", body.as_bytes());
        }
        ("POST", p) if p.starts_with("/seek/") => {
            let ms_str = p.trim_start_matches("/seek/");
            if let Ok(ms) = ms_str.parse::<u64>() {
                let _ = service.handle_request(IpcRequest::Seek {
                    position_secs: (ms as f64) / 1000.0,
                });
            }
            let body = status_json(service);
            write_http(&mut stream, "200 OK", "application/json", body.as_bytes());
        }
        _ => {
            write_http(&mut stream, "404 Not Found", "text/plain", b"not found");
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::io::Read;
    use zuno_audio::MockAudioEngine;
    use zuno_core::ZunoPaths;

    struct TestDir(std::path::PathBuf);
    impl Drop for TestDir {
        fn drop(&mut self) {
            let _ = std::fs::remove_dir_all(&self.0);
        }
    }

    fn http_call(port: u16, method: &str, path: &str, token: &str) -> (u16, String) {
        let mut s = TcpStream::connect(("127.0.0.1", port)).unwrap();
        let req = format!(
            "{method} {path} HTTP/1.1\r\nHost: 127.0.0.1\r\nX-Zuno-Token: {token}\r\nConnection: close\r\n\r\n"
        );
        s.write_all(req.as_bytes()).unwrap();
        let mut buf = String::new();
        s.read_to_string(&mut buf).unwrap();
        let code = buf
            .lines()
            .next()
            .and_then(|l| l.split_whitespace().nth(1))
            .and_then(|c| c.parse::<u16>().ok())
            .unwrap_or(0);
        let body = buf.split("\r\n\r\n").nth(1).unwrap_or("").to_string();
        (code, body)
    }

    #[test]
    fn android_bridge_enforces_token_and_serves_status_and_controls() {
        let dir = std::env::temp_dir().join(format!(
            "zuno-bridge-test-{}-{}",
            std::process::id(),
            generate_token()
        ));
        std::fs::create_dir_all(&dir).unwrap();
        let _guard = TestDir(dir.clone());
        let paths = ZunoPaths::new(&dir);
        paths.ensure_dirs().unwrap();
        let svc = ZunoService::open_with_engine(paths, MockAudioEngine::new()).unwrap();
        let handle = start_android_bridge(svc).unwrap();

        let (forbidden, _) = http_call(handle.port, "GET", "/status", "wrong-token");
        assert_eq!(forbidden, 403);

        let (ok, body) = http_call(handle.port, "GET", "/status", &handle.token);
        assert_eq!(ok, 200);
        let v: serde_json::Value = serde_json::from_str(&body).unwrap();
        assert_eq!(v["state"], "stopped");

        let (ok2, body2) = http_call(handle.port, "POST", "/control/pause", &handle.token);
        assert_eq!(ok2, 200);
        let v2: serde_json::Value = serde_json::from_str(&body2).unwrap();
        assert_eq!(v2["is_playing"], false);
    }
}
