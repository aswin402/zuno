# Changelog

All notable changes to **Zuno** will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.0.2] — 2026-11-23

Major UI, audio DSP, and customization upgrade — zero extra npm runtime dependencies added.

### Added

#### 10-Band Studio Equalizer (`src/lib/equalizer.ts`, `src/pages/EqualizerPage.tsx`)
- Real-time Web Audio API 10-band ISO DSP engine (`32 Hz` low-shelf through `16 kHz` high-shelf) with click-free gain ramping, **Preamp** (`±12 dB`), and toggleable **Soft Limiter** anti-clip protection.
- Interactive draggable spline frequency-response curve with a subtle monochrome live spectrum backdrop while playing, plus 10 pointer-capture vertical faders (drag, scroll wheel, keyboard arrows, double-click reset) and quick **Bass / Mid / Treble** `±1 dB` trim buttons.
- 16 curated built-in presets across 4 categories (*Reference*, *Bass & Energy*, *Vocals & Clarity*, *Genres*) with mini sparkline curve previews, plus unlimited user-saved **Custom** presets persisted locally.
- Quick Equalizer access in the desktop sidebar, floating desktop player bar, mobile dock, and mobile full-screen Now Playing sheet.

#### Zenko-Grade Appearance Studio (`src/pages/CustomizePage.tsx`)
- Hierarchical studio layout with live `/` search, Prev/Next navigation, mobile section pills, and live interactive preview stages.
- **8 Dual-Mode (Dark & Light) Theme Families** (*Obsidian Mono*, *Pure OLED*, *Zenko Vermilion*, *Warm Terracotta*, *Amber Forge*, *Crimson Noir*, *Emerald Term*, *Midnight Slate*) with 4:3 miniature Zuno workspace previews and inline Moon/Sun switchers (`ThemeSelector.tsx`).
- **Custom 60/30/10 Palette Studio** featuring an interactive HSV `ColorPicker` (2D saturation/brightness area with floating loupe, rainbow Hue slider, Hex input, RGB readout, EyeDropper, and preset swatches) for all 7 color slots.
- **Custom Font Studio** (`CustomFontStudio.tsx`, `src/lib/fonts.ts`) bundling 16 lazy-loaded SIL OFL variable `.woff2` fonts (`public/fonts/`), 18 UI font presets, 6 Monospace/Timestamp presets, OS local font picker, and `.woff2`/`.ttf`/`.otf` custom file uploads.
- **4 Dark/Light View Transition Reveals** (*Circle Blur*, *Crisp Circle*, *Top Sweep*, *Venetian Blinds*) powered by animated `EaseThemeToggle`.
- **Surface Materials** (*Framed Bordered*, *Flat Matte*, *Minimal Hairline*, *Borderless Fill*, *Frosted Glass*, *Elevated Soft*) and **Canvas Patterns** (*Clean*, *Dot Grid*, *Fine Grid*, *Top Glow*, *Vignette*).
- **8 Icon Packs** (*Lucide*, *Tabler*, *Iconsax*, *Hugeicons Animated*, *ItsHover*, *PulsoIcon*, *Humbleicons*, *Majesticons*) with distinct semantic icons for **Equalizer** (vertical sliders) and **Customize** (color palette).
- **4 Active Playing Song Styles** (*Pulse Ring*, *Equalizer Bars*, *Pulse Bars* [`Loader2`], *Minimal*), **Waveform Play Button** option, and **7 Progress Scrubber Styles** (*Hollow Ring*, *Solid Dot*, *Minimal Line*, *Vertical Pill*, *Capsule Bar*, *Waveform Bars*, *Segmented Ticks*).

#### Search Overlay, Last Played & Playback UX
- **Bencho `Search` Floating Overlay** (`Search.tsx`, `SearchOverlay.tsx`) replacing the dedicated Search page on both desktop and mobile (`Ctrl/Cmd + K`) with spring circle-to-pill morphing and an instant clickable results card directly underneath.
- **Dedicated Last Played Page** (`LastPlayedPage.tsx`) separated from the Songs home view with *Play all*, *Clear history*, and up to 30 recent tracks.
- **Redesigned Nested Two-Tier Mobile Dock** (`MobileDock.tsx`) integrating circular artwork, animated `PulseHeart` favorites, circular Play/Pause, hairline progress seam, and a contrasting curved nav tray with morphing active-tab labels.
- **Auto-Next Burning-Fuse Banner** (`AutoNextBanner.tsx`) triggering automatically when playback advances to the next track with 1-click **Undo**.
- **Three-Dots (`···`) Song Menu** (`TrackRow.tsx`) with *Add to playlist* and *Delete*, backed by a new safe `delete_song` IPC/HTTP operation (`crates/zuno-core`, `crates/zuno-audio`, `src/lib/zunoApi.ts`).
- **Compact Overlay Scrollbars** (`CompactScrollArea.tsx`) for short, rounded, theme-tinted pill scroll thumbs across desktop and mobile.

### Fixed
- Eliminated the bottom gap below the desktop left sidebar by placing the floating sticky player bar inside the right content column.
- Removed duplicate inline track progress bars and duplicate hover play buttons in Equalizer/Pulse Bars modes so each row shows one clean play/equalizer control on the right.
- Fixed tooltips and status toasts showing inline or sticking on mobile taps — hints now float cleanly above controls on hover/keyboard focus only, and status toasts float top-center.
- Adapted fallback `ArtworkTile` gradients and rings to CSS variables for crisp Light and Dark mode contrast.

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
