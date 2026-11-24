use crate::ZunoClient;
use crate::mcp::handle_jsonrpc_message;
use std::fs::{self, File};
use std::io::{self, BufRead, BufReader, Read, Seek, SeekFrom, Write};
use std::net::{TcpListener, TcpStream};
use std::path::{Path, PathBuf};
use std::sync::Arc;
use zuno_core::ipc::{IpcRequest, IpcResponse};

mod embedded_web {
    include!(concat!(env!("OUT_DIR"), "/embedded_web.rs"));
}

pub fn has_embedded_web() -> bool {
    embedded_web::HAS_EMBEDDED_WEB
}

/// Ultra-lightweight zero-dependency HTTP server providing:
/// - `POST /mcp`              — Streamable HTTP MCP JSON-RPC 2.0 endpoint (for AI agents)
/// - `POST /api`              — Typed `IpcRequest` -> `IpcResponse` bridge (for Web/Tauri preview)
/// - `GET  /api/cover/<id>`   — On-demand embedded album cover art bytes (HTTP cached)
/// - `GET  /api/audio/<id>`   — High-throughput byte-range audio streaming (`TCP_NODELAY`, 128 KiB chunks)
/// - `GET  /api/info`         — Root paths & live MCP endpoint metadata
/// - `GET  /health`           — Health check
/// - `GET  /*`                — Embedded single-binary Web UI (or `--web-dir` override)
pub fn run_http_mcp(
    addr: &str,
    token: Option<String>,
    web_dir: Option<PathBuf>,
    client: Arc<ZunoClient>,
) -> io::Result<()> {
    let listener = TcpListener::bind(addr)?;
    let web_dir = web_dir.and_then(|d| fs::canonicalize(d).ok());
    if let Some(ref dir) = web_dir {
        eprintln!(
            "Zuno HTTP + UI + MCP listening on http://{addr} (web-dir: {})",
            dir.display()
        );
    } else if embedded_web::HAS_EMBEDDED_WEB {
        eprintln!("Zuno single-binary server listening on http://{addr} (embedded UI + API + MCP)");
    } else {
        eprintln!("Zuno HTTP + MCP listening on http://{addr} (POST /mcp, POST /api)");
    }

    let token = Arc::new(token);
    let addr_str = Arc::new(addr.to_string());
    let web_dir = Arc::new(web_dir);
    for stream in listener.incoming() {
        let Ok(stream) = stream else {
            continue;
        };
        let _ = stream.set_nodelay(true);
        let client = Arc::clone(&client);
        let token = Arc::clone(&token);
        let addr_str = Arc::clone(&addr_str);
        let web_dir = Arc::clone(&web_dir);
        std::thread::spawn(move || {
            let _ = handle_http_connection(
                stream,
                token.as_deref(),
                &addr_str,
                web_dir.as_deref(),
                &client,
            );
        });
    }
    Ok(())
}

fn handle_http_connection(
    mut stream: TcpStream,
    expected_token: Option<&str>,
    listen_addr: &str,
    web_dir: Option<&Path>,
    client: &ZunoClient,
) -> io::Result<()> {
    let mut reader = BufReader::new(stream.try_clone()?);
    let mut request_line = String::new();
    if reader.read_line(&mut request_line)? == 0 {
        return Ok(());
    }
    let parts: Vec<&str> = request_line.split_whitespace().collect();
    if parts.len() < 2 {
        return write_http(&mut stream, 400, "application/json", b"{\"error\":\"bad request\"}");
    }
    let method = parts[0];
    let path = parts[1].split('?').next().unwrap_or(parts[1]);

    let mut content_length: usize = 0;
    let mut auth_header: Option<String> = None;
    let mut range_header: Option<String> = None;

    loop {
        let mut line = String::new();
        reader.read_line(&mut line)?;
        let trimmed = line.trim();
        if trimmed.is_empty() {
            break;
        }
        if let Some((k, v)) = trimmed.split_once(':') {
            let key = k.trim().to_ascii_lowercase();
            let val = v.trim();
            if key == "content-length" {
                content_length = val.parse().unwrap_or(0);
            } else if key == "authorization" {
                auth_header = Some(val.to_string());
            } else if key == "range" {
                range_header = Some(val.to_string());
            }
        }
    }

    if method == "OPTIONS" {
        return write_http(&mut stream, 204, "text/plain", b"");
    }

    if method == "GET" && path == "/health" {
        return write_http(
            &mut stream,
            200,
            "application/json",
            b"{\"status\":\"ok\",\"server\":\"zuno-mcp\"}",
        );
    }

    if let Some(secret) = expected_token {
        let expected = format!("Bearer {secret}");
        if auth_header.as_deref() != Some(expected.as_str()) {
            return write_http(
                &mut stream,
                401,
                "application/json",
                b"{\"error\":\"unauthorized\"}",
            );
        }
    }

    if method == "GET" && path == "/api/info" {
        let paths = client.paths();
        let body = serde_json::json!({
            "root_dir": paths.root().display().to_string(),
            "songs_dir": paths.songs_dir().display().to_string(),
            "playlists_dir": paths.playlists_dir().display().to_string(),
            "mcp_http_url": format!("http://{listen_addr}/mcp"),
            "version": env!("CARGO_PKG_VERSION"),
        });
        let bytes = serde_json::to_vec(&body).unwrap_or_default();
        return write_http(&mut stream, 200, "application/json", &bytes);
    }

    if method == "GET" || method == "HEAD" {
        let head_only = method == "HEAD";
        if let Some(track_id) = path.strip_prefix("/api/cover/") {
            if let Some(art) = client.extract_cover(track_id) {
                return write_cached_bytes(
                    &mut stream,
                    &art.mime_type,
                    &art.bytes,
                    "public, max-age=86400",
                    head_only,
                );
            }
            return write_http_with_body(
                &mut stream,
                404,
                "application/json",
                b"{\"error\":\"no cover\"}",
                !head_only,
            );
        }
        if let Some(track_id) = path.strip_prefix("/api/audio/") {
            return stream_audio_file(
                &mut stream,
                client,
                track_id,
                range_header.as_deref(),
                head_only,
            );
        }
    }

    if method == "POST" && path == "/api" {
        if content_length > 2 * 1024 * 1024 {
            return write_http(&mut stream, 413, "application/json", b"{\"error\":\"payload too large\"}");
        }
        let mut body = vec![0u8; content_length];
        reader.read_exact(&mut body)?;
        let resp = match serde_json::from_slice::<IpcRequest>(&body) {
            Ok(req) => client.execute(req),
            Err(e) => IpcResponse::Err {
                message: format!("invalid API request: {e}"),
            },
        };
        let encoded = serde_json::to_vec(&resp).unwrap_or_default();
        return write_http(&mut stream, 200, "application/json", &encoded);
    }

    if method == "POST" && path == "/mcp" {
        if content_length > 2 * 1024 * 1024 {
            return write_http(&mut stream, 413, "application/json", b"{\"error\":\"payload too large\"}");
        }
        let mut body = vec![0u8; content_length];
        reader.read_exact(&mut body)?;
        let body_str = String::from_utf8_lossy(&body);

        return match handle_jsonrpc_message(&body_str, client) {
            Some(reply) => {
                let encoded = serde_json::to_vec(&reply).unwrap_or_default();
                write_http(&mut stream, 200, "application/json", &encoded)
            }
            None => write_http(&mut stream, 202, "application/json", b""),
        };
    }

    if (method == "GET" || method == "HEAD") && !path.starts_with("/api") && path != "/mcp" {
        if let Some(root) = web_dir {
            return serve_static_file(&mut stream, root, path, method == "HEAD");
        }
        if embedded_web::HAS_EMBEDDED_WEB {
            return serve_embedded_asset(&mut stream, path, method == "HEAD");
        }
    }

    write_http(
        &mut stream,
        404,
        "application/json",
        b"{\"error\":\"not found; use POST /mcp or POST /api\"}",
    )
}

fn serve_embedded_asset(stream: &mut TcpStream, req_path: &str, head_only: bool) -> io::Result<()> {
    let clean = req_path.trim_start_matches('/');
    let rel = if clean.is_empty() { "index.html" } else { clean };
    if rel.contains("..") {
        return write_http_with_body(stream, 400, "text/plain", b"bad path", !head_only);
    }

    let (resolved_key, bytes) = match embedded_web::get_embedded_asset(rel) {
        Some(b) => (rel, b),
        None if !rel.contains('.') => match embedded_web::get_embedded_asset("index.html") {
            Some(b) => ("index.html", b),
            None => {
                return write_http_with_body(stream, 404, "text/plain", b"not found", !head_only);
            }
        },
        None => {
            return write_http_with_body(stream, 404, "text/plain", b"not found", !head_only);
        }
    };

    let mime = static_mime(Path::new(resolved_key));
    let cache = if resolved_key.starts_with("assets/") || resolved_key.starts_with("fonts/") {
        "public, max-age=31536000, immutable"
    } else {
        "no-cache"
    };
    write_cached_bytes(stream, mime, bytes, cache, head_only)
}

fn write_cached_bytes(
    stream: &mut TcpStream,
    mime: &str,
    bytes: &[u8],
    cache_control: &str,
    head_only: bool,
) -> io::Result<()> {
    write!(
        stream,
        "HTTP/1.1 200 OK\r\nContent-Type: {mime}\r\nContent-Length: {}\r\nCache-Control: {cache_control}\r\nAccess-Control-Allow-Origin: *\r\nConnection: close\r\n\r\n",
        bytes.len()
    )?;
    if !head_only {
        stream.write_all(bytes)?;
    }
    stream.flush()
}

fn serve_static_file(
    stream: &mut TcpStream,
    web_root: &Path,
    req_path: &str,
    head_only: bool,
) -> io::Result<()> {
    let clean = req_path.trim_start_matches('/');
    let rel = if clean.is_empty() { "index.html" } else { clean };
    if rel.contains("..") {
        return write_http_with_body(stream, 400, "text/plain", b"bad path", !head_only);
    }

    let candidate = web_root.join(rel);
    let target = match fs::canonicalize(&candidate) {
        Ok(p) if p.starts_with(web_root) && p.is_file() => p,
        _ => {
            // SPA fallback for client routes without a file extension
            if !rel.contains('.') {
                web_root.join("index.html")
            } else {
                return write_http_with_body(stream, 404, "text/plain", b"not found", !head_only);
            }
        }
    };

    let bytes = match fs::read(&target) {
        Ok(b) => b,
        Err(_) => {
            return write_http_with_body(stream, 404, "text/plain", b"not found", !head_only);
        }
    };
    let mime = static_mime(&target);
    let cache = if rel.starts_with("assets/") || rel.starts_with("fonts/") {
        "public, max-age=31536000, immutable"
    } else {
        "no-cache"
    };
    write!(
        stream,
        "HTTP/1.1 200 OK\r\nContent-Type: {mime}\r\nContent-Length: {}\r\nCache-Control: {cache}\r\nConnection: close\r\n\r\n",
        bytes.len()
    )?;
    if !head_only {
        stream.write_all(&bytes)?;
    }
    stream.flush()
}

fn static_mime(path: &Path) -> &'static str {
    let ext = path
        .extension()
        .and_then(|s| s.to_str())
        .unwrap_or("")
        .to_ascii_lowercase();
    match ext.as_str() {
        "html" => "text/html; charset=utf-8",
        "js" | "mjs" => "application/javascript; charset=utf-8",
        "css" => "text/css; charset=utf-8",
        "svg" => "image/svg+xml",
        "png" => "image/png",
        "jpg" | "jpeg" => "image/jpeg",
        "ico" => "image/x-icon",
        "woff2" => "font/woff2",
        "woff" => "font/woff",
        "ttf" => "font/ttf",
        "json" => "application/json; charset=utf-8",
        "webmanifest" => "application/manifest+json; charset=utf-8",
        _ => "application/octet-stream",
    }
}

fn stream_audio_file(
    stream: &mut TcpStream,
    client: &ZunoClient,
    track_id: &str,
    range_header: Option<&str>,
    head_only: bool,
) -> io::Result<()> {
    let Some((abs_path, rel_path)) = client.resolve_track_file(track_id) else {
        return write_http_with_body(
            stream,
            404,
            "application/json",
            b"{\"error\":\"track not found\"}",
            !head_only,
        );
    };
    let mut file = match File::open(&abs_path) {
        Ok(f) => f,
        Err(_) => {
            return write_http_with_body(
                stream,
                404,
                "application/json",
                b"{\"error\":\"file unavailable\"}",
                !head_only,
            );
        }
    };
    let total_len = file.metadata()?.len();
    let mime = audio_mime(&rel_path);

    let (start, end, partial) = match range_header.and_then(|r| parse_byte_range(r, total_len)) {
        Some((s, e)) => (s, e, true),
        None => (0, total_len.saturating_sub(1), false),
    };

    let chunk_len = if total_len == 0 { 0 } else { end - start + 1 };
    file.seek(SeekFrom::Start(start))?;

    if partial {
        write!(
            stream,
            "HTTP/1.1 206 Partial Content\r\nContent-Type: {mime}\r\nAccept-Ranges: bytes\r\nContent-Range: bytes {start}-{end}/{total_len}\r\nContent-Length: {chunk_len}\r\nCache-Control: public, max-age=3600\r\nAccess-Control-Allow-Origin: *\r\nConnection: close\r\n\r\n"
        )?;
    } else {
        write!(
            stream,
            "HTTP/1.1 200 OK\r\nContent-Type: {mime}\r\nAccept-Ranges: bytes\r\nContent-Length: {chunk_len}\r\nCache-Control: public, max-age=3600\r\nAccess-Control-Allow-Origin: *\r\nConnection: close\r\n\r\n"
        )?;
    }

    if head_only {
        return stream.flush();
    }

    let mut remaining = chunk_len;
    let mut buf = vec![0u8; 128 * 1024];
    while remaining > 0 {
        let to_read = (remaining as usize).min(buf.len());
        let n = file.read(&mut buf[..to_read])?;
        if n == 0 {
            break;
        }
        if let Err(e) = stream.write_all(&buf[..n]) {
            if matches!(
                e.kind(),
                io::ErrorKind::BrokenPipe | io::ErrorKind::ConnectionReset
            ) {
                return Ok(());
            }
            return Err(e);
        }
        remaining -= n as u64;
    }
    stream.flush()
}

fn parse_byte_range(header: &str, total_len: u64) -> Option<(u64, u64)> {
    if total_len == 0 {
        return None;
    }
    let rest = header.strip_prefix("bytes=")?;
    let first = rest.split(',').next()?.trim();
    let (start_s, end_s) = first.split_once('-')?;
    if start_s.is_empty() {
        // Suffix range: bytes=-N (last N bytes)
        let suffix: u64 = end_s.trim().parse().ok()?;
        if suffix == 0 {
            return None;
        }
        let start = total_len.saturating_sub(suffix);
        return Some((start, total_len - 1));
    }
    let start: u64 = start_s.trim().parse().ok()?;
    if start >= total_len {
        return None;
    }
    let end: u64 = if end_s.is_empty() {
        total_len - 1
    } else {
        end_s.trim().parse::<u64>().ok()?.min(total_len - 1)
    };
    (start <= end).then_some((start, end))
}

fn audio_mime(rel_path: &str) -> &'static str {
    let ext = rel_path.rsplit('.').next().unwrap_or("").to_ascii_lowercase();
    match ext.as_str() {
        "mp3" => "audio/mpeg",
        "flac" => "audio/flac",
        "wav" => "audio/wav",
        "ogg" | "opus" => "audio/ogg",
        "m4a" | "aac" | "alac" => "audio/mp4",
        "webm" => "audio/webm",
        _ => "application/octet-stream",
    }
}

fn write_http(stream: &mut TcpStream, status: u16, content_type: &str, body: &[u8]) -> io::Result<()> {
    write_http_with_body(stream, status, content_type, body, true)
}

fn write_http_with_body(
    stream: &mut TcpStream,
    status: u16,
    content_type: &str,
    body: &[u8],
    send_body: bool,
) -> io::Result<()> {
    let reason = match status {
        200 => "OK",
        202 => "Accepted",
        204 => "No Content",
        400 => "Bad Request",
        401 => "Unauthorized",
        404 => "Not Found",
        413 => "Payload Too Large",
        _ => "Internal Server Error",
    };
    write!(
        stream,
        "HTTP/1.1 {status} {reason}\r\nContent-Type: {content_type}\r\nContent-Length: {}\r\nAccess-Control-Allow-Origin: *\r\nAccess-Control-Allow-Headers: Content-Type, Authorization\r\nAccess-Control-Allow-Methods: POST, GET, HEAD, OPTIONS\r\nConnection: close\r\n\r\n",
        body.len()
    )?;
    if send_body {
        stream.write_all(body)?;
    }
    stream.flush()
}
