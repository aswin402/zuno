# Changelog

All notable changes to **Zuno** will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.0.1] — 2026-11-23

Initial public release of **Zuno** — an ultra-lightweight, offline-first music player built for both humans and AI agents (MCP), targeting Linux and Android.

### Added

#### Core Engine (`crates/zuno-core`)
- Portable `zuno/` directory model (`zuno/songs/`, `zuno/playlists/`, `zuno/.zuno/`) defaulting to `~/zuno` with `ZUNO_DIR` override and path-traversal protection.
- Incremental audio library scanner powered by `lofty` supporting MP3, FLAC, OGG, Opus, WAV, M4A, AAC, AIFF, ALAC, and WebM, with on-demand embedded cover art extraction to keep RAM minimal.
- Fast 64 KiB partial BLAKE3 track fingerprinting (`#EXTZUNO-ID`) for instant track identity.
- Zero-copy relative UTF-8 `.m3u8` playlist system (`../songs/...`) compatible across Linux and Android (no symlinks required) with automatic self-healing when tracks are renamed or moved.
- Zero-dependency fuzzy & multi-token search across title, artist, album, folder, genre, and path.
- Pure-logic queue manager supporting shuffle (order-preserving unshuffle), repeat (`off` / `one` / `all`), Up Next, and persisted playback state.
- Live filesystem watcher (`notify`) for automatic updates when songs or playlists change.

#### Audio & IPC (`crates/zuno-audio`)
- Dedicated background audio thread built on `rodio` + `symphonia` (pure-Rust decoding, lazy device initialization, automatic track advancement).
- Unified `ZunoService` controller and local Unix Domain Socket IPC bridge (`zuno.sock`) so GUI, CLI, and MCP clients share live playback state.

#### CLI, Daemon & MCP Server (`crates/zuno-mcp`)
- Single ~3.5 MB stripped release binary providing:
  - Model Context Protocol (MCP) JSON-RPC 2.0 server over `stdio` and zero-dependency Streamable HTTP (`--http`, optional Bearer `--token`), exposing 22 tools and 4 resources (`zuno://now-playing`, `zuno://queue`, `zuno://library`, `zuno://playlists`).
  - Automatic live IPC proxying to running GUI/daemon with seamless headless fallback.
  - Background daemon (`zuno-mcp daemon`), diagnostics & ready-to-paste client config (`zuno-mcp doctor`), and human CLI controls (`status`, `list`, `search`, `play`, `pause`, `resume`, `next`, `prev`, `volume`, `playlists`, `playlist-create`).
  - Built-in local HTTP API (`/api`, `/api/audio/:id` with byte-range `206` & `HEAD` support, `/api/cover/:id`).

#### Frontend UI (`src/`)
- Minimal, responsive **React 19 + TypeScript + Vite + Tailwind CSS v4 + shadcn/ui** interface (<100 KB gzipped) built on a strict 60 / 30 / 10 dark theme:
  - **Songs** home screen with persistent **Last Played** and **Available Songs**.
  - **Sort by** with explicit **Ascending / Descending** controls across **Name, Artist, Album, Time, Size, and Duration** (persisted across reloads).
  - **Playlists** & **Favorites** powered directly by zero-copy `.m3u8` pointers.
  - **Search** screen with fuzzy matching and Folder/Playlist filters.
  - **Desktop** layout with slim left sidebar and minimal single-row horizontal bottom player bar.
  - **Mobile** layout with compact floating mini-player capsule, floating bottom pill navigation, and full-screen inverted-arch Now Playing sheet.
  - **Customize** screen with live real-time customization for **Themes** (60/30 presets + 10% accents), **Styles** (radius, density, borders), **Fonts** (6 font families + text size), **Icons** (stroke weight + leading track icon style), and **Components** (player bar style, scrubber knob, and element visibility toggles).
