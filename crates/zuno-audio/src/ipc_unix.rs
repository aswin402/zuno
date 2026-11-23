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

    let listener = UnixListener::bind(&socket_path)?;
    std::thread::Builder::new()
        .name("zuno-ipc".into())
        .spawn(move || {
            for incoming in listener.incoming() {
                let Ok(stream) = incoming else {
                    continue;
                };
                let svc = Arc::clone(&service);
                std::thread::spawn(move || {
                    handle_client(stream, svc);
                });
            }
        })
        .map_err(|e| ZunoError::Ipc(format!("failed to spawn IPC thread: {e}")))?;

    Ok(())
}

#[cfg(unix)]
fn handle_client(stream: UnixStream, service: Arc<ZunoService>) {
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
            Ok(req) => service.handle_request(req),
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
/// Returns `None` if no live instance is currently listening.
#[cfg(unix)]
pub fn try_send_unix_ipc(socket_path: &Path, req: &IpcRequest) -> Option<IpcResponse> {
    let mut stream = UnixStream::connect(socket_path).ok()?;
    let _ = stream.set_read_timeout(Some(Duration::from_secs(5)));
    let _ = stream.set_write_timeout(Some(Duration::from_secs(5)));

    let encoded = serde_json::to_string(req).ok()?;
    writeln!(stream, "{encoded}").ok()?;
    stream.flush().ok()?;

    let mut reader = BufReader::new(stream);
    let mut reply = String::new();
    reader.read_line(&mut reply).ok()?;
    serde_json::from_str::<IpcResponse>(reply.trim()).ok()
}

/// Check if a live Zuno GUI/daemon is accepting IPC commands on `socket_path`.
#[cfg(unix)]
pub fn is_live_instance(socket_path: &Path) -> bool {
    matches!(
        try_send_unix_ipc(socket_path, &IpcRequest::Ping),
        Some(IpcResponse::Ok { .. })
    )
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
