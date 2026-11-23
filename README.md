<div align="center">

# Zuno

**Ultra-lightweight, offline-first music player for humans and AI.**

Built for **Linux & Android** with minimal RAM, CPU, and storage footprint — zero cloud lock-in, zero duplicate audio files, and native **Model Context Protocol (MCP)** support.

[![Version](https://img.shields.io/badge/version-0.0.2-fafafa?style=flat-square&labelColor=18181b)](./CHANGELOG.md)
[![Rust](https://img.shields.io/badge/Rust-2024-fafafa?style=flat-square&labelColor=18181b)](https://www.rust-lang.org/)
[![React](https://img.shields.io/badge/React-19-fafafa?style=flat-square&labelColor=18181b)](https://react.dev/)
[![Tailwind CSS](https://img.shields.io/badge/Tailwind-v4-fafafa?style=flat-square&labelColor=18181b)](https://tailwindcss.com/)
[![License: MIT](https://img.shields.io/badge/license-MIT-fafafa?style=flat-square&labelColor=18181b)](./LICENSE)

</div>

---

## Why Zuno?

Most modern cross-platform music players bundle a full Chromium runtime (150–300 MB RAM) or lock playlists inside proprietary databases that break between desktop and phone.

**Zuno** is designed around four strict principles:
1. **Tiny Footprint** — A pure-Rust core & audio engine (**~3.5 MB** stripped release binary) paired with a minimal React + Tailwind UI (**<100 KB** gzipped).
2. **100% Offline & Portable** — Drop songs into `zuno/songs/` and sync the folder between Linux and Android via USB or Syncthing.
3. **Zero-Copy Self-Healing Playlists** — Playlists are plain-text UTF-8 `.m3u8` pointers (`../songs/...`) with fast 64 KiB BLAKE3 fingerprints (`#EXTZUNO-ID`) that auto-repair if you rename or move files — no symlinks (which break on Android FUSE) and zero duplicated audio bytes.
4. **Human + AI Ready** — Built-in MCP server (`stdio` and Streamable HTTP) lets AI assistants search your library, control playback, and curate offline `.m3u8` playlists using your local metadata.

---

## Features

- **Minimal Cross-Platform UI** — Strict 60 / 30 / 10 shadcn/ui Dark & Light design with a full-height desktop rail, floating sticky horizontal player bar, compact overlay scrollbars, and a nested two-tier mobile dock.
- **Songs & Dedicated Last Played** — Focused **Songs** library with live **Sort by** (`Name`, `Artist`, `Album`, `Time`, `Size`, `Duration`) in **Ascending / Descending** order, three-dots (`···`) row menus (*Add to playlist* & *Delete*), and a dedicated **Last Played** history screen.
- **Bencho Spring Search Overlay (`Ctrl/Cmd + K`)** — Zero-page morphing circle-to-pill search overlay with instant matching results underneath for both desktop and mobile.
- **10-Band Studio Equalizer** — Live Web Audio DSP (`32 Hz–16 kHz`) with draggable spline curve, subtle monochrome spectrum backdrop, 10 precision vertical faders, Preamp, Soft Limiter, Bass/Mid/Treble quick trims, 16 built-in presets across 4 categories, and unlimited saved custom presets.
- **Full Appearance Studio** — Hierarchical live-preview **Customize** studio with 8 dual-mode Dark/Light theme families, interactive HSV 60/30/10 Custom Palette Studio, Custom Font Studio (18 self-hosted variable fonts + OS fonts + `.woff2/.ttf/.otf` uploads), 8 icon packs, 4 View Transitions, 6 surface materials, 5 canvas patterns, 4 active-song styles, and 7 progress scrubber styles.
- **Zero-Copy `.m3u8` Playlists** — Create, manage, and play playlists stored in `zuno/playlists/` without ever copying song files.
- **Pure-Rust Audio Engine** — Decodes MP3, FLAC, OGG, Opus, WAV, M4A, AAC, AIFF, ALAC, and WebM via `symphonia` + `rodio` with incremental `lofty` tag scanning and on-demand cover art loading.
- **Built-in CLI, Daemon & MCP Server** — Control Zuno from the UI, terminal, or any MCP-compatible AI client (`Claude`, `Cursor`, `Antigravity`, etc.) sharing one live state over local IPC.

---

## Folder Layout (`~/zuno`)

All user files live in `~/zuno` by default (override anytime with `ZUNO_DIR=/path/to/zuno`):

```text
zuno/
├── songs/                      # Drop audio files or subfolders here
│   ├── ambient/
│   │   └── midnight_chords.wav
│   └── focus/
│       └── warm_pulse.flac
├── playlists/                  # Zero-copy relative .m3u8 playlists (~1 KB each)
│   └── favorites.m3u8
└── .zuno/                      # Auto-generated local cache (safe to delete)
    ├── index.json
    └── state.json
```

Example `zuno/playlists/favorites.m3u8`:

```m3u8
#EXTM3U
#PLAYLIST:Favorites
#EXTINF:182,Artist - Track Title
#EXTZUNO-ID:4d91e77c12a091bc
../songs/focus/warm_pulse.flac
```

If a file is renamed or moved inside `zuno/songs/`, Zuno resolves it via `#EXTZUNO-ID` → `#EXTINF` fallback → filename match and rewrites the `.m3u8` pointer atomically.

---

## Architecture

```text
zuno/
├── crates/
│   ├── zuno-core/      # Pure Rust: scanner, lofty tags, BLAKE3 IDs, .m3u8 self-healer, queue, search, watcher
│   ├── zuno-audio/     # Desktop audio thread (rodio + symphonia), unified ZunoService, Unix socket IPC
│   └── zuno-mcp/       # Single ~3.5 MB binary: CLI, daemon, HTTP API, stdio & Streamable HTTP MCP server
└── src/                # React 19 + TypeScript + Vite + Tailwind CSS v4 + shadcn/ui frontend
    ├── pages/          # Songs (Home), Search, Playlist, Customize
    ├── components/     # DesktopSidebar, DesktopPlayerBar, MobileDock, NowPlayingPanel, TrackRow, SortControl
    └── lib/            # zunoApi, sortTracks, appearance engine
```

---

## Quick Start

### Prerequisites
- **Rust** (1.85+ / Edition 2024) + ALSA dev headers on Linux (`libasound2-dev`)
- **Node.js** 20+ (or **Bun**)

### 1. Build & Test the Rust Engine

```bash
cargo test --workspace
cargo build --release -p zuno-mcp
```

### 2. Run the Web UI + Backend Locally

```bash
# Terminal 1 — Start the Rust audio, library & MCP server (pointing at ~/zuno)
./target/release/zuno-mcp mcp --http 127.0.0.1:47620

# Terminal 2 — Start the frontend dev server
npm install
npm run dev
```

Open **http://127.0.0.1:5173** and drop songs into `~/zuno/songs/`.

### 3. CLI & Diagnostics

```bash
# Check library health, playlist healing status, and print ready-to-paste MCP config
./target/release/zuno-mcp doctor

# Control playback from the terminal
./target/release/zuno-mcp list
./target/release/zuno-mcp search "ambient"
./target/release/zuno-mcp play --playlist favorites
```

### 4. Connect an AI Agent (MCP)

Run `./target/release/zuno-mcp doctor` or add to your MCP client configuration (Claude Desktop, Cursor, Antigravity, etc.):

```json
{
  "mcpServers": {
    "zuno": {
      "command": "/path/to/zuno/target/release/zuno-mcp",
      "args": ["mcp"],
      "env": {
        "ZUNO_DIR": "/home/youruser/zuno"
      }
    }
  }
}
```

For remote / Android / LAN agents, run Streamable HTTP mode with Bearer auth:

```bash
./target/release/zuno-mcp mcp --http 127.0.0.1:47620 --token your-secret-token
```

---

## Roadmap

- [x] **v0.0.1** — `zuno-core`, `zuno-audio`, `zuno-mcp` (CLI + daemon + stdio/HTTP MCP), zero-copy self-healing `.m3u8` playlists, responsive Web UI (Songs, Search, Playlists, Favorites, Sorting, Customize).
- [ ] **v0.1.0** — Tauri v2 Linux desktop packaging + native OS media keys (MPRIS).
- [ ] **v0.2.0** — Tauri v2 Android APK with native Media3 ExoPlayer background playback, lock-screen controls, and Scoped Storage `zuno/` picker.
- [ ] **v0.3.0** — Artist view & offline synced `.lrc` lyrics page.

---

## License

Released under the [MIT License](./LICENSE).
