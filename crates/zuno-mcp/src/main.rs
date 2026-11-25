mod http;
mod mcp;

use clap::{Parser, Subcommand};
use std::path::PathBuf;
use std::sync::{Arc, OnceLock};
use zuno_audio::ZunoService;
use zuno_audio::ipc_unix;
use zuno_core::ipc::{IpcData, IpcRequest, IpcResponse};
use zuno_core::{Library, ZunoPaths};

#[derive(Parser, Debug)]
#[command(
    name = "zuno-mcp",
    version,
    about = "Zuno offline music player CLI, background daemon, and MCP server"
)]
struct Cli {
    /// Override the zuno root directory (defaults to $ZUNO_DIR or ~/zuno)
    #[arg(long, global = true)]
    dir: Option<PathBuf>,

    #[command(subcommand)]
    command: Option<Commands>,
}

#[derive(Subcommand, Debug)]
enum Commands {
    /// Run Model Context Protocol (MCP) server (stdio by default, or Streamable HTTP with --http)
    Mcp {
        /// Optional bind address for Streamable HTTP MCP (e.g. 127.0.0.1:47620)
        #[arg(long)]
        http: Option<String>,
        /// Optional Bearer auth token when running HTTP MCP
        #[arg(long)]
        token: Option<String>,
        /// Optional built Web UI directory (defaults to ~/.local/share/zuno/web if present)
        #[arg(long)]
        web_dir: Option<PathBuf>,
    },
    /// Run a lightweight headless background audio daemon listening on the local Unix socket
    Daemon,
    /// Inspect zuno/songs, zuno/playlists, live IPC status, and print ready-to-paste MCP client config
    Doctor,
    /// Show current playback status
    Status,
    /// Rescan zuno/songs/ and self-heal .m3u8 playlists
    Rescan,
    /// List songs in zuno/songs/
    List {
        #[arg(long)]
        folder: Option<String>,
        #[arg(long, default_value_t = 100)]
        limit: usize,
    },
    /// Fuzzy-search songs
    Search {
        query: String,
        #[arg(long, default_value_t = 25)]
        limit: usize,
    },
    /// Play a song by query, --id, --folder, or --playlist
    Play {
        query: Option<String>,
        #[arg(long)]
        id: Option<String>,
        #[arg(long)]
        folder: Option<String>,
        #[arg(long)]
        playlist: Option<String>,
    },
    /// Pause playback
    Pause,
    /// Resume playback
    Resume,
    /// Stop playback
    Stop,
    /// Next track
    Next,
    /// Previous track
    Prev,
    /// Set volume (0..100)
    Volume { percent: u8 },
    /// List .m3u8 playlists
    Playlists,
    /// Create a zero-copy .m3u8 playlist from track IDs
    PlaylistCreate {
        name: String,
        track_ids: Vec<String>,
    },
}

/// Dispatcher that automatically forwards commands to a live Zuno GUI/daemon over IPC
/// when available, or spins up an ultra-lightweight headless `ZunoService` on demand.
pub struct ZunoClient {
    paths: ZunoPaths,
    headless: OnceLock<Arc<ZunoService>>,
}

impl ZunoClient {
    pub fn new(paths: ZunoPaths) -> Self {
        Self {
            paths,
            headless: OnceLock::new(),
        }
    }

    pub fn paths(&self) -> &ZunoPaths {
        &self.paths
    }

    pub fn execute(&self, req: IpcRequest) -> IpcResponse {
        // 1. Prefer an already-running GUI or daemon so human & AI share live playback state.
        let sock = self.paths.socket_path();
        if let Some(resp) = ipc_unix::try_send_unix_ipc(&sock, &req) {
            return resp;
        }

        // 2. Fall back to in-process headless ZunoService (~10 MB RAM).
        let svc = match self.get_or_init_headless() {
            Ok(s) => s,
            Err(e) => {
                return IpcResponse::Err {
                    message: format!("failed to initialize headless engine: {e}"),
                };
            }
        };
        svc.handle_request(req)
    }

    pub fn extract_cover(&self, track_id: &str) -> Option<zuno_core::CoverArt> {
        let svc = self.get_or_init_headless().ok()?;
        svc.extract_cover(track_id)
    }

    pub fn resolve_track_file(&self, track_id: &str) -> Option<(PathBuf, String)> {
        let svc = self.get_or_init_headless().ok()?;
        svc.resolve_track_file(track_id)
    }

    fn get_or_init_headless(&self) -> zuno_core::Result<Arc<ZunoService>> {
        if let Some(svc) = self.headless.get() {
            return Ok(Arc::clone(svc));
        }
        let svc = ZunoService::open_rodio(self.paths.clone())?;
        let _ = self.headless.set(Arc::clone(&svc));
        Ok(svc)
    }
}

fn default_web_dir() -> Option<PathBuf> {
    if http::has_embedded_web() {
        return None;
    }
    let dir = zuno_core::user_data_local_dir()?.join("zuno").join("web");
    dir.join("index.html").is_file().then_some(dir)
}

fn command_to_ipc(cmd: Commands) -> Option<IpcRequest> {
    Some(match cmd {
        Commands::Status => IpcRequest::GetStatus,
        Commands::Rescan => IpcRequest::Rescan,
        Commands::List { folder, limit } => IpcRequest::ListSongs {
            folder,
            limit: Some(limit),
            offset: Some(0),
        },
        Commands::Search { query, limit } => IpcRequest::SearchSongs {
            query,
            limit: Some(limit),
        },
        Commands::Pause => IpcRequest::Pause,
        Commands::Resume => IpcRequest::Resume,
        Commands::Stop => IpcRequest::Stop,
        Commands::Next => IpcRequest::Next,
        Commands::Prev => IpcRequest::Previous,
        Commands::Volume { percent } => IpcRequest::SetVolume {
            volume: (percent.min(100) as f32) / 100.0,
        },
        Commands::Playlists => IpcRequest::ListPlaylists,
        Commands::PlaylistCreate { name, track_ids } => {
            IpcRequest::CreatePlaylist { name, track_ids }
        }
        _ => return None,
    })
}

fn main() {
    let cli = Cli::parse();
    let paths = match cli.dir {
        Some(dir) => ZunoPaths::new(dir),
        None => ZunoPaths::resolve_default(),
    };

    if let Err(e) = paths.ensure_dirs() {
        eprintln!("zuno-mcp: failed to prepare {}: {e}", paths.root().display());
        std::process::exit(1);
    }

    let command = cli.command.unwrap_or(Commands::Mcp {
        http: None,
        token: None,
        web_dir: None,
    });

    match command {
        Commands::Mcp {
            http: Some(addr),
            token,
            web_dir,
        } => {
            let resolved_web_dir = web_dir.or_else(default_web_dir);
            let client = Arc::new(ZunoClient::new(paths));
            if let Err(e) = http::run_http_mcp(&addr, token, resolved_web_dir, client) {
                eprintln!("zuno-mcp HTTP error: {e}");
                std::process::exit(1);
            }
        }
        Commands::Mcp { http: None, .. } => {
            let client = Arc::new(ZunoClient::new(paths));
            if let Err(e) = mcp::run_stdio_mcp(client) {
                eprintln!("zuno-mcp stdio error: {e}");
                std::process::exit(1);
            }
        }
        Commands::Daemon => run_daemon(paths),
        Commands::Doctor => run_doctor(&paths),
        Commands::Play {
            query,
            id,
            folder,
            playlist,
        } => {
            let client = ZunoClient::new(paths);
            let live = ipc_unix::is_live_instance(&client.paths().socket_path());
            let resp = client.execute(IpcRequest::Play {
                track_id: id,
                query,
                folder,
                playlist,
            });
            print_response(resp);
            if !live {
                eprintln!("note: started in one-shot CLI mode; run `zuno-mcp daemon` (or open Zuno GUI) for persistent playback.");
            }
        }
        other => {
            if let Some(req) = command_to_ipc(other) {
                print_response(ZunoClient::new(paths).execute(req));
            }
        }
    }
}

fn run_daemon(paths: ZunoPaths) {
    let sock = paths.socket_path();
    let svc = match ZunoService::open_rodio(paths.clone()) {
        Ok(s) => s,
        Err(e) => {
            eprintln!("failed to start Zuno engine: {e}");
            std::process::exit(1);
        }
    };

    // Start live filesystem watcher so newly dropped songs & playlists appear automatically.
    let watcher_svc = Arc::clone(&svc);
    let _watcher = zuno_core::watcher::ZunoWatcher::start(&paths, move || {
        let _ = watcher_svc.handle_request(IpcRequest::Rescan);
    });

    if let Err(e) = ipc_unix::spawn_unix_ipc_server(Arc::clone(&svc), sock.clone()) {
        eprintln!("failed to bind IPC socket {}: {e}", sock.display());
        std::process::exit(1);
    }

    eprintln!(
        "Zuno daemon running (root: {}, socket: {})",
        paths.root().display(),
        sock.display()
    );
    loop {
        std::thread::sleep(std::time::Duration::from_secs(60));
    }
}

fn run_doctor(paths: &ZunoPaths) {
    println!("Zuno Doctor");
    println!("===========");
    println!("Root dir:      {}", paths.root().display());
    println!("Songs dir:     {}", paths.songs_dir().display());
    println!("Playlists dir: {}", paths.playlists_dir().display());
    println!("IPC socket:    {}", paths.socket_path().display());

    match Library::open(paths.clone()) {
        Ok(lib) => {
            let healed: usize = lib.playlists().iter().map(|p| p.healed_count).sum();
            println!("Tracks found:  {}", lib.tracks().len());
            println!("Folders found: {}", lib.folders().len());
            println!("Playlists:     {} (auto-healed entries: {})", lib.playlists().len(), healed);
        }
        Err(e) => {
            println!("Library error: {e}");
        }
    }

    let live = ipc_unix::is_live_instance(&paths.socket_path());
    println!(
        "Live player:   {}",
        if live {
            "CONNECTED (GUI or daemon active)"
        } else {
            "none (MCP will run headless automatically)"
        }
    );

    let exe = std::env::current_exe()
        .map(|p| p.display().to_string())
        .unwrap_or_else(|_| "zuno-mcp".to_string());

    println!("\nMCP Client Config (Claude / Cursor / Antigravity):");
    println!(
        "{}",
        serde_json::to_string_pretty(&serde_json::json!({
            "mcpServers": {
                "zuno": {
                    "command": exe,
                    "args": ["mcp"],
                    "env": {
                        "ZUNO_DIR": paths.root().display().to_string()
                    }
                }
            }
        }))
        .unwrap()
    );
}

fn print_response(resp: IpcResponse) {
    match resp {
        IpcResponse::Ok { data } => {
            if let IpcData::Message(msg) = &data {
                println!("{msg}");
            } else {
                println!("{}", serde_json::to_string_pretty(&data).unwrap());
            }
        }
        IpcResponse::Err { message } => {
            eprintln!("error: {message}");
            std::process::exit(1);
        }
    }
}
