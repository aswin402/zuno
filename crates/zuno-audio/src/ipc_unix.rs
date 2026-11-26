#[cfg(unix)]
use crate::service::ZunoService;
#[cfg(unix)]
use std::fs;
#[cfg(unix)]
use std::io::{BufRead, BufReader, Write};
#[cfg(unix)]
use std::os::unix::net::{UnixListener, UnixStream};
#[cfg(unix)]
use std::path::{Path, PathBuf};
#[cfg(unix)]
use std::sync::Arc;
#[cfg(unix)]
use std::time::Duration;
#[cfg(unix)]
use zuno_core::ipc::{IpcRequest, IpcResponse};
#[cfg(unix)]
use zuno_core::{Result, ZunoError};

/// Start a lightweight Unix Domain Socket IPC server so `zuno-mcp` and CLI commands
/// drive the live running Zuno GUI or background daemon in real time.
#[cfg(unix)]
pub fn spawn_unix_ipc_server(service: Arc<ZunoService>, socket_path: PathBuf) -> Result<()> {
    spawn_unix_ipc_server_with_handler(move |req| service.handle_request(req), socket_path)
}

/// Start a Unix Domain Socket IPC server with a custom request handler (used by the Tauri GUI
/// to intercept live window/navigation/MPRIS/sync actions while delegating core operations to `ZunoService`).
#[cfg(unix)]
pub fn spawn_unix_ipc_server_with_handler<F>(handler: F, socket_path: PathBuf) -> Result<()>
where
    F: Fn(IpcRequest) -> IpcResponse + Send + Sync + 'static,
{
    if socket_path.exists() {
        // Remove stale socket if no listener answers.
        if UnixStream::connect(&socket_path).is_ok() {
            return Err(ZunoError::Ipc(format!(
                "another Zuno instance is already listening on {}",
                socket_path.display()
            )));
        }
        let _ = fs::remove_file(&socket_path);
    }
    if let Some(parent) = socket_path.parent() {
        fs::create_dir_all(parent)?;
    }

    let handler = Arc::new(handler);
    let listener = UnixListener::bind(&socket_path)?;
    std::thread::Builder::new()
        .name("zuno-ipc".into())
        .spawn(move || {
            for incoming in listener.incoming() {
                let Ok(stream) = incoming else {
                    continue;
                };
                let h = Arc::clone(&handler);
                std::thread::spawn(move || {
                    handle_client(stream, h);
                });
            }
        })
        .map_err(|e| ZunoError::Ipc(format!("failed to spawn IPC thread: {e}")))?;

    Ok(())
}

#[cfg(unix)]
fn handle_client<F>(stream: UnixStream, handler: Arc<F>)
where
    F: Fn(IpcRequest) -> IpcResponse + Send + Sync + 'static,
{
    let Ok(mut writer) = stream.try_clone() else {
        return;
    };
    let reader = BufReader::new(stream);
    for line in reader.lines() {
        let Ok(line) = line else {
            break;
        };
        let trimmed = line.trim();
        if trimmed.is_empty() {
            continue;
        }
        let resp = match serde_json::from_str::<IpcRequest>(trimmed) {
            Ok(req) => handler(req),
            Err(e) => IpcResponse::Err {
                message: format!("invalid IPC request JSON: {e}"),
            },
        };
        if let Ok(encoded) = serde_json::to_string(&resp) {
            if writeln!(writer, "{encoded}").is_err() || writer.flush().is_err() {
                break;
            }
        }
    }
}

/// Send one IPC request to an already-running Zuno GUI/daemon over its Unix socket.
/// Returns `None` ONLY if no live instance is currently listening on `socket_path`.
/// Once connected, any I/O or timeout failure returns `Some(IpcResponse::Err { .. })` so callers
/// never silently spawn a duplicate headless player alongside a live GUI.
#[cfg(unix)]
pub fn try_send_unix_ipc(socket_path: &Path, req: &IpcRequest) -> Option<IpcResponse> {
    let mut stream = UnixStream::connect(socket_path).ok()?;
    let _ = stream.set_read_timeout(Some(Duration::from_secs(20)));
    let _ = stream.set_write_timeout(Some(Duration::from_secs(10)));

    let encoded = match serde_json::to_string(req) {
        Ok(s) => s,
        Err(e) => {
            return Some(IpcResponse::Err {
                message: format!("failed to serialize IPC request: {e}"),
            });
        }
    };
    if let Err(e) = writeln!(stream, "{encoded}").and_then(|_| stream.flush()) {
        return Some(IpcResponse::Err {
            message: format!("failed writing to live Zuno IPC socket: {e}"),
        });
    }

    let mut reader = BufReader::new(stream);
    let mut reply = String::new();
    match reader.read_line(&mut reply) {
        Ok(0) => Some(IpcResponse::Err {
            message: "live Zuno instance closed IPC connection".into(),
        }),
        Ok(_) => match serde_json::from_str::<IpcResponse>(reply.trim()) {
            Ok(resp) => Some(resp),
            Err(e) => Some(IpcResponse::Err {
                message: format!("invalid IPC reply from live Zuno instance: {e}"),
            }),
        },
        Err(e) => Some(IpcResponse::Err {
            message: format!("live Zuno IPC read failed: {e}"),
        }),
    }
}

/// Check if a live Zuno GUI/daemon is accepting IPC commands on `socket_path`.
#[cfg(unix)]
pub fn is_live_instance(socket_path: &Path) -> bool {
    matches!(
        try_send_unix_ipc(socket_path, &IpcRequest::Ping),
        Some(IpcResponse::Ok { .. })
    )
}

#[cfg(not(unix))]
pub fn spawn_unix_ipc_server(
    _service: std::sync::Arc<crate::service::ZunoService>,
    _socket_path: std::path::PathBuf,
) -> zuno_core::Result<()> {
    Ok(())
}

#[cfg(not(unix))]
pub fn spawn_unix_ipc_server_with_handler<F>(
    _handler: F,
    _socket_path: std::path::PathBuf,
) -> zuno_core::Result<()>
where
    F: Fn(zuno_core::ipc::IpcRequest) -> zuno_core::ipc::IpcResponse + Send + Sync + 'static,
{
    Ok(())
}

#[cfg(not(unix))]
pub fn try_send_unix_ipc(
    _socket_path: &std::path::Path,
    _req: &zuno_core::ipc::IpcRequest,
) -> Option<zuno_core::ipc::IpcResponse> {
    None
}

#[cfg(not(unix))]
pub fn is_live_instance(_socket_path: &std::path::Path) -> bool {
    false
}

#[cfg(all(test, unix))]
mod tests {
    use super::*;
    use crate::engine::MockAudioEngine;
    use std::fs;
    use tempfile::tempdir;
    use zuno_core::ZunoPaths;
    use zuno_core::ipc::IpcData;

    #[test]
    fn unix_ipc_roundtrip_controls_live_service() {
        let tmp = tempdir().unwrap();
        let paths = ZunoPaths::new(tmp.path());
        paths.ensure_dirs().unwrap();
        fs::write(paths.songs_dir().join("demo.wav"), b"fake-wav-bytes-for-ipc").unwrap();

        let sock = tmp.path().join("zuno-test.sock");
        let svc = ZunoService::open_with_engine(paths, MockAudioEngine::new()).unwrap();
        spawn_unix_ipc_server(svc, sock.clone()).unwrap();

        assert!(is_live_instance(&sock));

        let resp = try_send_unix_ipc(
            &sock,
            &IpcRequest::Play {
                track_id: None,
                query: Some("demo".into()),
                folder: None,
                playlist: None,
            },
        )
        .unwrap();

        match resp {
            IpcResponse::Ok {
                data: IpcData::Status(st),
            } => {
                assert_eq!(st.state, zuno_core::PlayState::Playing);
                assert_eq!(st.current_track.unwrap().rel_path, "demo.wav");
            }
            other => panic!("unexpected IPC response: {other:?}"),
        }
    }
}
