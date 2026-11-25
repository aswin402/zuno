# Changelog

All notable changes to **Zuno** will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.0.21] — 2026-11-26

Full-stack codebase audit, algorithmic upgrades, bug/safety fixes, and structural cleanup across all Rust crates, Tauri backend, build scripts, and React frontend (zero new dependencies).

### Fixed
- **Backup & Persistence Bugs (`src/App.tsx`, `crates/zuno-core/src/library.rs`, `crates/zuno-core/src/playlist.rs`, `crates/zuno-core/src/config.rs`)**: Fixed UI backup key mismatch (`'zuno:eq'` → `EQ_STORAGE_KEY` + `APPEARANCE_STORAGE_KEY` + `CUSTOM_FONT_STORAGE_KEY`), persisted modified playlists before `rescan()` on song deletion, preserved `.m3u` vs `.m3u8` extensions, fixed UTF-8 BOM/trim ordering, added PID+sequence-unique `atomic_write`, and blocked Windows drive-letter path traversal on Unix.
- **Polling, Race Conditions & Audio Fixes (`src/App.tsx`, `src/pages/RadioPage.tsx`, `src/pages/EqualizerPage.tsx`, `src/components/UpdateDialog.tsx`, `src/components/WindowTitlebar.tsx`)**: Added cancellation/sequence guards on native status polling, song search, Radio Browser discovery, and update progress polling; restored browser fade-out volume after seeking back; enabled live FFT spectrum polling in native Tauri desktop mode on the Equalizer page; synced titlebar maximize state on double-click; and fixed `#000` color parsing in `src/lib/color.ts`.
- **Radio, Updater, Cover Cache & Build Script Fixes (`src-tauri/src/radio.rs`, `src-tauri/src/updater.rs`, `src-tauri/src/cover_cache.rs`, `scripts/zuno-build.sh`)**: Fixed `.m3u` URLs with `?key=value` query parameters, final-redirect-only ICY header parsing, `localhost`/IPv6 URL validation, Windows PowerShell single-quote escaping, SemVer 2.0 prerelease ordering, RAII temp-dir cleanup, magic-byte cover MIME sniffing, and `zuno-build.sh` sweep/test coverage (`cargo test --workspace`).

### Improved
- **Algorithmic & DSP Upgrades (`crates/zuno-core`, `crates/zuno-audio`, `src-tauri/src/cover_cache.rs`, `src-tauri/src/radio.rs`)**:
  - Upgraded search to Gotoh / Smith-Waterman O(M·N) affine-gap DP fuzzy subsequence scoring with bounded Damerau-Levenshtein typo tolerance (`search.rs`).
  - Upgraded EQ & FFT spectrum DSP with sample-rate-normalized ramps/smoothing, unity-band bitmask bypass, 50% overlap Hann STFT, precomputed FFT twiddle/bit-reversal tables, monotonic clock, and lock-free `AtomicU64` playback position (`eq.rs`, `spectrum.rs`, `service.rs`).
  - Replaced random cache eviction & linear scans with deterministic LRU + singleflight dedup + discrete size buckets (`cover_cache.rs`), unbiased rejection-sampled Fisher-Yates & `Vec::splice` (`queue.rs`), O(1) indexed playlist self-healing (`playlist.rs`), and concurrent Radio Browser mirror racing (`radio.rs`).
- **Frontend Performance & Shared Architecture (`src/lib/color.ts`, `src/lib/format.ts`, `src/lib/radioUrl.ts`, `src/components/NowPlayingVisualizer.tsx`, `src/App.tsx`, `src/pages/CustomizePage.tsx`)**:
  - Eliminated fragile regexes & duplicated helpers via WCAG 2.1 color math (`color.ts`), WHATWG `URL` radio stream parsing (`radioUrl.ts`), `Intl.Collator` sorting (`sortTracks.ts`), Vite `__ZUNO_VERSION__` injection, and shared `format.ts` utilities.
  - Optimized Now Playing visualizer (`dt`-scaled peak fall, 2 shared vertical gradients instead of 128/frame, LUTs), eliminated 3–4×/sec global `keydown` listener churn via `positionRef`, moved `PulseBarsLoader` keyframes into static `index.css`, replaced duplicated UI blocks with shared `<FontSlotPanel>` and `<DisplayZoomControls>`, and switched hot membership/frequency checks to `Map`/`Set`.

## [0.0.20] — 2026-11-25

Chrome-style Display Zoom (50% – 200%) in Customize Studio with native Tauri v2 full-page WebView scaling and keyboard/wheel shortcuts.

### Added
- **Native Full-Page Display Zoom (`src-tauri/src/main.rs`, `src/lib/zunoApi.ts`, `src/lib/appearance.ts`)**: Added `window_set_zoom` calling Tauri v2 `WebviewWindow::set_zoom(factor)` across Linux (WebKitGTK), macOS (WKWebView), and Windows (WebView2) with automatic CSS `zoom` fallback in web mode, persisted cleanly as `uiZoom` (`50% – 200%`, default `100%`).
- **Customize Studio Zoom Controls & Live Shortcuts (`src/pages/CustomizePage.tsx`, `src/App.tsx`)**: Added a dedicated **Display Zoom** page under **Window, Chrome & Nav** plus an inline zoom control inside **Layout & Geometry** featuring `−` / `+` (`10%` steps), smooth `50%–200%` slider, Chrome-style presets (`75%`, `80%`, `90%`, `100%`, `110%`, `125%`, `150%`, `175%`, `200%`), **Reset 100%**, and live `Ctrl +` / `Ctrl −` / `Ctrl 0` / `Ctrl + Scroll` shortcuts.

## [0.0.19] — 2026-11-25

FM Radio playing animation contrast fix, Connect/Reconnect/Disconnect live controls, and unified mobile + desktop Now Playing layout.

### Fixed
- **FM Playing Animation Contrast (`src/pages/RadioPage.tsx`)**: Fixed invisible white-on-white pulse bars inside active FM station circles by rendering `Loader2` and `.zuno-eq-bar` with high-contrast `currentColor` alongside the active pulse ring (`animate-btn-pulse`) and live bars in the FM header pill and player dock.

### Improved
- **FM Connect / Reconnect & Disconnect Controls (`src/pages/RadioPage.tsx`, `src/components/DesktopPlayerBar.tsx`, `src/components/MobileDock.tsx`, `src/components/NowPlayingPanel.tsx`, `src/App.tsx`)**: Replaced Play/Pause controls on live FM radio playback with dedicated **Connect / Reconnect** (cleanly re-buffering online streams or re-tuning offline FM) and **Disconnect** controls across station rows, header status pill, desktop player bar, mobile dock, and full-screen Now Playing.
- **Unified Mobile & Desktop Now Playing Stage (`src/components/NowPlayingPanel.tsx`)**: Moved the scrubber & split timestamp into the bottom dock above transport controls on mobile screens as well, lowered the track title & artist, expanded the Now Playing visualizer across the full mobile stage, and replaced the mobile `"Swipe up for queue & playlists"` text label with a clean icon-only up arrow.

## [0.0.18] — 2026-11-25

Offline FM (hardware signal) and Online FM (curated stable streams, custom link pasting, global station discovery, and unified signal/link bookmarking).

### Added
- **Online FM Player & 127 Curated Stable Stations (`src/lib/radioStations.ts`, `src/pages/RadioPage.tsx`, `src/App.tsx`)**:
  - Built-in directory of **127** permanent public/community stations across 10 categories (SomaFM, Radio France / FIP, Radio Paradise, SRG Swiss Radio, KEXP, KCRW, WFMU, Jazz24, WBGO, WQXR, NPR, NTS, Nightride FM, Rainwave, UK/EU FM, 1.FM, and Indian AIR/Desi streams) with instant search and category filters.
  - **Paste Link** workflow supporting `.mp3`, `.aac`, `.ogg`, `.m3u8` (HLS), and `.m3u`/`.pls` playlist URLs with automatic stream extraction, ICY metadata probing (`icy-name`, `icy-genre`, `icy-br`), Test Play, and permanent saving.
- **Global Station Discovery (`src-tauri/src/radio.rs`, `src/lib/radioStore.ts`)**:
  - Live search across **45,000+** free public radio stations via Radio Browser's open directory (multi-mirror failover, zero API key, zero extra Rust crates) with quick regional/language/genre presets (India FM, Malayalam, Tamil, Hindi, Lo-Fi, Jazz, Synthwave, Classical, Indie, News, UK, USA, Japan) and 1-click **Save & Mark**.
- **Offline FM Signal Tuner & Hardware Audio Pipeline (`src-tauri/src/radio.rs`, `crates/zuno-audio/src/engine.rs`, `crates/zuno-audio/src/service.rs`)**:
  - Tactile analog FM frequency dial (`Global 87.5–108.0`, `Americas 87.9–107.9`, `Japan 76.0–95.0 MHz`) with drag/keyboard tuning, precision `±0.1 / ±1.0 MHz` steps, and marked signal pins along the scale.
  - Auto-detects real offline FM receiver hardware (**RTL-SDR USB** via `rtl_fm` streamed live into Zuno's Rodio output + 10-band Rust EQ + 1024-pt FFT visualizer, and Linux **V4L2 `/dev/radio*`** tuners), with honest setup guidance and full offline frequency logging/bookmarking even without hardware attached.
- **Unified Marked Stations & Backup Support (`crates/zuno-core/src/config.rs`, `src-tauri/src/updater.rs`, `DesktopSidebar.tsx`, `FloatingNavigation.tsx`, `MobileDock.tsx`, `MobileNavbar.tsx`, `DesktopPlayerBar.tsx`, `NowPlayingPanel.tsx`, `ZunoIcon.tsx`)**:
  - Dedicated **Marked** tab unifying marked **Offline Signals (`SIGNAL · MHz`)** and **Online Links (`ONLINE LINK`)**, persisted atomically to `~/zuno/.zuno/radio.json` and automatically backed up during self-updates.
  - Integrated FM Radio across all desktop/mobile nav styles, live dock & full-screen Now Playing indicators, prev/next station stepping, heart-to-mark syncing, and automatic mutual exclusion with local songs.

## [0.0.17] — 2026-11-25

Desktop Now Playing stage refresh with bottom-dock scrubber & split timestamp above transport controls, anchored lower track title, and large responsive desktop visualizers.

### Improved
- **Desktop Now Playing Bottom Dock (`src/components/NowPlayingPanel.tsx`, `src/components/Scrubber.tsx`)**: Moved the playback scrubber and centered split timestamp (`elapsed | total`) into the contrasting bottom dock directly above the Previous / Play-Pause / Next controls on desktop (`>= 768px`), with a new `tone` contrast mode (`surface` / `inverted`) keeping all 7 scrubber styles crisp across dark and light themes while preserving the mobile stage layout.
- **Lowered Track Title & Large Responsive Visualizer (`src/components/NowPlayingPanel.tsx`, `src/components/NowPlayingVisualizer.tsx`)**: Anchored the song title and artist at the bottom of the upper curved stage on desktop so the visualizer expands responsively across the full main stage (`flex-1`, up to `1160×600` with resize-loop protection), and upgraded canvas detail for large viewports (up to 64 wave bars, 96-point Fourier orb shells, 160-step harmonic ribbons, 64 radial bass rays, and wider ambient halo clouds).

## [0.0.16] — 2026-11-25

Fixed automatic next-track playback (both ordered and shuffled) and true random starting track selection in shuffle mode.

### Fixed
- **Auto-Advance Timeout Starvation (`crates/zuno-audio/src/service.rs`)**: Replaced relative `rx.recv_timeout(250ms)` (which was continually reset by concurrent 350ms UI + 350ms MPRIS `GetPosition` status polls, starving `engine.is_finished()` and crossfade ticks) with an absolute wall-clock `next_tick` deadline (`200ms` playing / `25ms` fading). Persists `state.json` on automatic advances, skips unreadable tracks cleanly, and adds a 20ms-polling regression test for both ordered and shuffled auto-advance.
- **Shuffle Queue Start & Cycle Re-Shuffle (`crates/zuno-core/src/queue.rs`, `src/App.tsx`)**: Clicking **Shuffle** or **Play all** with Shuffle enabled now starts on a random track (`start_id: null`) instead of pinning song #1 first, and re-shuffles without repeating the last track when `Repeat: All` wraps around.

## [0.0.15] — 2026-11-25

Automated cross-platform GitHub Releases (Linux, macOS, Windows), Zuno-themed animated single-binary CLI installers (`install.sh` + `install.ps1`), and an in-app self-updater with notification dialog and automatic zero-copy data backup.

### Added
- **Automated Cross-Platform GitHub Releases (`.github/workflows/release.yml`, `crates/zuno-audio/src/ipc_unix.rs`, `src-tauri/src/main.rs`)**:
  - Builds and publishes single-binary archives for **Linux (`x86_64`)**, **macOS (`aarch64` & `x86_64`)**, and **Windows (`x86_64`)** on every `v*` tag (plus manual `workflow_dispatch`), alongside `SHA256SUMS.txt` and a machine-readable `latest.json` update manifest.
  - Added cross-platform non-Unix IPC stubs (`ipc_unix.rs`) and native macOS (`osascript`) & Windows (`FolderBrowserDialog`) folder pickers.
- **Zuno-Themed Cross-Platform CLI Installers (`install.sh`, `install.ps1`)**:
  - One-line single-binary install for Linux & macOS (`curl -fsSL .../install.sh | bash`) and Windows PowerShell (`irm .../install.ps1 | iex`).
  - Minimalist B&W Zuno terminal theme with animated equalizer-bar spinner, live progress bar, SHA-256 verification, automatic zero-copy backup of existing playlists/settings before upgrading, OS launcher integration (`.desktop`, `~/Applications/Zuno.app`, Windows Start Menu shortcut + `PATH`), `NO_COLOR`/non-TTY fallback, and `--version` / `--uninstall` flags.
- **In-App Self-Updater & Automatic Data Backup (`src-tauri/src/updater.rs`, `src/components/UpdateDialog.tsx`, `src/lib/zunoApi.ts`, `src/App.tsx`, `DesktopSidebar.tsx`, `FloatingNavigation.tsx`, `MobileNavbar.tsx`)**:
  - Zero-bloat Rust updater using native OS `curl` + pure-Rust FIPS 180-4 SHA-256 verification (keeps binary at ~9.8 MB) and silent background startup checks (zero lag/errors when offline, toggleable for strict air-gapped use).
  - Automatic zero-copy backup snapshot (`~/zuno/.zuno/backups/v<version>-<timestamp>/`) preserving `.m3u8` playlists, linked library sources, playback state, index, and theme/EQ settings (retaining the last 5 backups, never duplicating audio files in `songs/`), plus atomic binary replacement with rollback protection and 1-click **Restart Zuno Now**.
  - Added unit tests for semver comparison, FIPS SHA-256 test vectors, and zero-copy data backups.

## [0.0.14] — 2026-11-25

Fixed Linux MPRIS2 D-Bus notification banner state sync so GNOME/KDE media notifications accurately reflect Playing/Paused status and track metadata in real time.

### Fixed
- **MPRIS2 `PropertiesChanged` GVariant Signature (`src-tauri/src/mpris.rs`)**: Replaced tuple `.to_variant()` (which double-boxed `changed.end()` into `v`, emitting `(svas)` instead of `(sa{sv}as)` and causing GNOME Shell to drop all updates) with `glib::Variant::tuple_from_iter(...)`, explicit `insert_value("Metadata", ...)`, RFC-3986 `glib::filename_to_uri` cover URLs, and a unit test asserting exact D-Bus GVariant signatures.
- **Instant GUI & Tray Notification Sync (`src-tauri/src/main.rs`, `src-tauri/src/mpris.rs`)**: Added `MprisHandle` (`notify_change` / `notify_seeked`) triggered immediately on playback-mutating `zuno_ipc` and system tray commands instead of waiting for the 350ms fallback poll.

## [0.0.13] — 2026-11-25

Smooth zero-dependency UI motion system built on `transitions.dev` tokens, asymmetric open/close polish rules, and community component patterns across all player, studio, dialog, and navigation surfaces (with full `prefers-reduced-motion` support).

### Added
- **Pure-CSS `transitions.dev` Motion System (`src/styles/transitions.css`, `src/index.css`)**: Added the full shared motion token scale (`--duration-*`, `--ease-*`, `--distance-*`, `--scale-*`, `--blur-*`), semantic component variables, GPU-friendly `t-*` recipes, tactile `.t-press` feedback, and mandatory `@media (prefers-reduced-motion: reduce)` guards.
- **Reusable Motion Primitives (`src/components/ui/motion.tsx`)**: Added zero-dependency `TextSwap`, `IconSwap`, `SlidingTabs` (measured sliding active pill with `ResizeObserver` snap-on-mount and multi-row wrap support), `MotionSwitch` (double-bounce overshoot thumb gated on user interaction), `AccordionPanel` / `AccordionChevron` (`grid-template-rows: 0fr ↔ 1fr` + `scaleY(-1)` chevron flip), and `MotionToast`.

### Improved
- **Now Playing & Docks (`src/components/NowPlayingPanel.tsx`, `src/components/DesktopPlayerBar.tsx`, `src/components/MobileDock.tsx`)**: Added blurred vertical `TextSwap` on song title/artist changes (inspired by `Music Player Likes`), `IconSwap` on classic Play/Pause morphing, `SlidingTabs` on the Queue/Playlists sheet switcher, and `.t-page-enter` transitions between sheet tabs.
- **Dialogs, Search, Dropdowns & Tooltips (`src/components/ui/dialog.tsx`, `src/components/SearchOverlay.tsx`, `src/components/ui/dropdown-menu.tsx`, `src/components/ui/tooltip.tsx`)**: Applied asymmetric open/close clocks (`250ms` open / `150ms` close on modals, search overlay, and dropdowns; `150ms` with `80ms` intent delay in / instant `50ms` out on tooltips).
- **Customize Studio, Equalizer & Page Transitions (`src/pages/CustomizePage.tsx`, `src/pages/EqualizerPage.tsx`, `src/App.tsx`, `src/components/AutoNextBanner.tsx`)**: Upgraded all Customize Studio tree branches and Equalizer save drawer to `AccordionPanel`, all segmented controls and EQ category filters to `SlidingTabs`, all toggle rows and EQ master power to `MotionSwitch`, and main page switches & floating toasts to `.t-page-enter` and `MotionToast`.

## [0.0.12] — 2026-11-25

Real-time bass- and frequency-reactive Now Playing Visualizers powered by a pure-Rust lock-free FFT engine (desktop) and Web Audio `AnalyserNode` (web/mobile), with serene paused idle states, fluid responsive scaling, and full Customize Studio controls.

### Added
- **Lock-Free Pure-Rust 1024-pt FFT Spectrum Telemetry (`crates/zuno-audio/src/spectrum.rs`, `eq.rs`, `engine.rs`, `service.rs`, `src-tauri/src/main.rs`, `src/lib/zunoApi.ts`)**: Stack-resident radix-2 Cooley-Tukey FFT publishing 24 log-spaced frequency bands (`35 Hz–15 kHz`) plus `bass`, `mid`, `treble`, and `energy` via `AtomicU32`s and `zuno_audio_levels`, with automatic 650ms idle TTL for 0% CPU overhead when Now Playing is closed or paused.
- **Multi-Mode Audio-Reactive Now Playing Visualizer (`src/components/NowPlayingVisualizer.tsx`, `src/components/NowPlayingPanel.tsx`, `src/App.tsx`)**:
  - 5 unclipped floating styles (**Sound Orb** with expanding bass shockwaves, **Spectrum Wave Bars** with reflections & peak-hold dots, **Harmonic Waves**, **Radial Bass Ring**, and **Ambient Bass Halo**) plus **Minimal (Off)**, with a live quick-cycle item inside the Now Playing `···` menu.
  - Smoothly decays into a clearly visible, serene resting **idle state** when paused (0% idle CPU after settling, with instant redraw on window resize, visibility restore, or theme change) and scales responsively across all screen dimensions via viewport `clamp()` sizing.
- **Customize Studio Visualizer Controls (`src/pages/CustomizePage.tsx`, `src/components/StudioPreviews.tsx`, `src/lib/appearance.ts`)**: Added **Customize → Music Components → Now Playing Visualizer** featuring an interactive live preview with **Play/Pause** and **Pulse Bass** kick trigger, style selector, **Color Mode** (`Theme Matched`, `Harmonic Color`, `Pure Mono`), and **Bass & Sound Reactivity** (`Subtle`, `Balanced`, `Dynamic`).

## [0.0.11] — 2026-11-25

Bottom-only progressive `GradualBlur` edge effect (`@react-bits/GradualBlur-TS-TW`) behind the floating bottom docks.

### Added
- **Zero-Bloat `GradualBlur` Component (`src/components/GradualBlur.tsx`)**: Implemented React Bits' overlapping 4-stop trapezoidal `mask-image` slices with an exponential `bezier` `backdrop-filter: blur(...)` ramp and `contain: strict` GPU compositing without adding external runtime dependencies.
- **Bottom-Only Floating Dock Integration (`src/App.tsx`, `src/lib/appearance.ts`, `src/components/StudioPreviews.tsx`, `src/pages/CustomizePage.tsx`)**: Applied `GradualBlur` strictly at `position="bottom"` behind the floating mobile dock and floating desktop player bar (top edge untouched), with an enabled-by-default `Bottom dock gradual blur` toggle and live preview under **Customize → Music Components → Player Bar & Rows**.

## [0.0.10] — 2026-11-25

Sticky floating mobile bottom dock with background bar removed.

### Changed
- **Sticky Floating Mobile Bottom Dock (`src/components/MobileDock.tsx`, `src/App.tsx`)**: Converted the mobile bottom navigation + mini-player dock into a true floating sticky overlay (`pointer-events-none absolute inset-x-0 bottom-0 z-20`) with the outer gradient background removed so tracks scroll cleanly behind the dock pill, paired with adaptive mobile bottom scroll clearance (`pb-36` / `pb-20`) in `CompactScrollArea`.

## [0.0.9] — 2026-11-25

Desktop Now Playing Queue trigger & smooth bidirectional drawer transition fix.

### Fixed & Improved
- **Desktop Borderless Up-Arrow Queue Button (`src/components/NowPlayingPanel.tsx`)**: Replaced the faint mobile horizontal swipe-handle line on desktop (`md+`) with a clean, borderless `ChevronUp` icon button (with hover lift and themed `Open queue` tooltip) while preserving the swipe-up pill handle on mobile.
- **Smooth Bidirectional Queue Drawer Transitions (`src/index.css`, `src/components/NowPlayingPanel.tsx`)**: Added GPU-composited `animate-drawer-up` / `animate-drawer-down` and backdrop fade animations so opening and closing the Queue & Playlists sheet glide smoothly in both directions.
- **Now Playing Full-Height Viewport Fit (`src/components/NowPlayingPanel.tsx`)**: Fixed `h-[100dvh]` overflow under the custom desktop titlebar by switching the player root to `h-full` and the drawer backdrop to `absolute inset-0`.

## [0.0.8] — 2026-11-24

Reorganized Appearance Studio into a collapsible hierarchical component tree separating all 19 customizable UI & audio components into focused pages with dedicated interactive Live Preview Stages.

### Added & Changed
- **Hierarchical Customize Studio Navigation (`src/pages/CustomizePage.tsx`)**: Replaced crowded multi-section studio pages with 4 collapsible parent branches (*Color Themes & Fonts*, *Window, Chrome & Nav*, *Surfaces, Scroll & Motion*, *Music Components*) containing 19 separated child component pages, complete with tree guide rails, child count badges, collapsed active-branch indicators, `/` component search with auto-expand, 3-level breadcrumbs, Prev/Next stepping, and a 2-level mobile hierarchy strip.
- **Dedicated Interactive Live Previews (`src/components/StudioPreviews.tsx`)**: Built real interactive preview stages for every separated component — including a live scrollable mini song list for **Skiper 89 / 94 / 95** scroll progress, a **Replay Entrance** stage for **Great UI Blur Scroll Reveal**, an interactive miniature workspace for **Desktop Navigation** (clickable tabs, expandable Studio dock submenu, expandable Capsule overlay), a **Test Maximize** frameless corner preview, live 60/30/10 palette ratio bar, typography & timestamp preview, surface material & canvas pattern swatches, live View Transition origin trigger, clickable Play button & active/idle track row previews, Floating vs Docked player bar preview, and equal-power crossfade overlap curve preview.

## [0.0.7] — 2026-11-24

Rounded curved frameless desktop window corners, zero-rerender Skiper 89/94/95 scroll progress indicators, Great UI Blur Scroll Reveal & View Transition animations, SmoothUI Kinetic theme toggle, and SmoothUI/Great UI floating desktop navigation themes.

### Added
- **Rounded Curved Frameless Desktop Window (`src-tauri/tauri.conf.json`, `src-tauri/src/main.rs`, `src/index.css`, `src/lib/appearance.ts`, `src/components/WindowTitlebar.tsx`, `src/App.tsx`)**: Enabled native GTK3/WebKitGTK window transparency and configurable **App Window Corner Curve** options (*Sharp `0px`*, *Soft `10px`*, *Curved `16px`* default, *Pill `22px`*) that automatically flatten when maximized.
- **Scroll Progress Indicators & Scroll Row Reveal (`src/components/ScrollProgressOverlay.tsx`, `src/components/CompactScrollArea.tsx`, `src/components/VirtualTrackList.tsx`, `src/pages/HomePage.tsx`, `src/pages/PlaylistPage.tsx`)**:
  - **Skiper 89 / 94 / 95 Scroll Progress**: Zero-rerender `requestAnimationFrame` DOM-ref scroll indicators — *Skiper 89* draggable circular progress ring with `%` readout, *Skiper 94* vertical right-edge rail gauge with clipped `%` pill badge, and *Skiper 95* (default) top `2px` precision hairline with tick scale badge.
  - **Great UI Blur Scroll Reveal & Smooth Cascade**: Optional GPU-friendly row reveal effects on virtualized track lists (`Off`, `Smooth Cascade`, `Great UI Blur Scroll Reveal`).
- **Floating Desktop Navigation Themes (`src/components/FloatingNavigation.tsx`, `src/App.tsx`)**: Switchable desktop navigation layouts alongside **Classic Sidebar** — *SmoothUI Floating Navbar* (detached top pill with active indicator dot and zero-rerender auto-hide on scroll), *Great UI Floating Dock Menu* (morphing pill dock with expandable Studio & Playlists submenu), and *Great UI Floating Capsule Menu* (minimal corner pill expanding into a staggered full-canvas menu overlay).
- **Great UI Theme Transitions & SmoothUI Kinetic Toggle (`src/components/EaseThemeToggle.tsx`, `src/index.css`, `src/lib/appearance.ts`)**: Added *Great UI Circular Wipe*, *Great UI Blur Fade*, and *Great UI Directional Swipe* View Transition effects plus the *SmoothUI Kinetic* dual-layer spring sun/moon toggle variant.
- **Customize Studio Controls (`src/pages/CustomizePage.tsx`)**: Added **App Window Corner Curve**, **Desktop Navigation Theme**, **Scroll Progress Indicator** (with live miniature previews), **Scroll Row Reveal Effect**, and recommended badges across Customize Studio.

## [0.0.6] — 2026-11-24

Major large-library performance overhaul (windowed list virtualization, async SIMD Rust thumbnail cache, zero-rerender scrolling, and WebKitGTK compositor optimization) plus cleaner borderless Now Playing controls.

### Added
- **Asynchronous Rust Cover Thumbnail Server & Persistent Cache (`src-tauri/src/cover_cache.rs`, `src-tauri/src/main.rs`)**: Replaced synchronous main-thread `zuno://` cover art reads with `register_asynchronous_uri_scheme_protocol` backed by a bounded 2-worker thread pool, lock-free file lookup (`crates/zuno-audio/src/service.rs`), SIMD `gdk-pixbuf` resizing down to `96×96` JPEGs (`~4 KB` instead of `1–2 MB`), a 256-entry RAM cache, and a persistent disk thumbnail cache (`~/zuno/.zuno/thumbs/`).
- **Zero-Dependency Windowed Virtual List (`src/components/VirtualTrackList.tsx`)**: Virtualizes large track lists across `HomePage`, `PlaylistPage`, and the Now Playing `Queue` sheet so only ~25–30 visible rows exist in the DOM even with 10,000+ songs; raised `zunoApi.listSongs()` limit from `500` to `25,000`.

### Fixed & Optimized
- **Zero-Rerender `CompactScrollArea` (`src/components/CompactScrollArea.tsx`, `src/index.css`)**: Replaced per-scroll React `setState` and `subtree: true` `MutationObserver` with direct `requestAnimationFrame` + GPU `translate3d(...)` DOM ref updates and CSS `contain: layout style` on virtualized rows.
- **Eliminated WebKitGTK Scroll Blur Stutter (`DesktopPlayerBar.tsx`, `WindowTitlebar.tsx`, `MobileNavbar.tsx`)**: Replaced `backdrop-blur-md` on persistent chrome bars overlapping scrolling lists with crisp opaque surfaces to stop per-frame software Gaussian re-blurring on Linux WebKitGTK.
- **Fixed Memoization & Lazy Row Rendering (`TrackRow.tsx`, `ArtworkTile.tsx`, `HomePage.tsx`, `PlaylistPage.tsx`, `LastPlayedPage.tsx`, `App.tsx`)**: Removed per-row inline closures and global `isPlaying` fan-out so toggling Play/Pause re-renders only the active row and playback ticks trigger 0 `HomePage` re-renders; deferred `<DropdownMenuContent>` mounting until opened; added `loading="lazy" decoding="async"`, `?s=96` thumbnail URLs, and a pure-CSS fallback in `ArtworkTile`.
- **Borderless Now Playing `···` Menu Trigger (`src/components/NowPlayingPanel.tsx`)**: Removed the circular `ring-1` border around the `···` button in the full-screen Now Playing header to match the bare `←` and `♡` controls.

## [0.0.5] — 2026-11-24

Native Linux MPRIS2 media banner & system shortcuts, custom theme-matched frameless desktop titlebar, zero-copy multi-directory music library, pure-Rust equal-power audio crossfade transitions, and Skiper UI component theme options.

### Added
- **Native Linux MPRIS2 D-Bus Media Integration (`src-tauri/src/mpris.rs`)**: Exports `org.mpris.MediaPlayer2.zuno` on the Session D-Bus using GTK/GLib's existing `gio` bindings (zero new C libraries), powering the Ubuntu/GNOME/KDE notification media banner, lock-screen controls, auto-refreshed album cover art, global OS media keys (`Play/Pause`, `Next`, `Previous`, `Stop`, `Seek`), Bluetooth headset buttons, and `playerctl`, plus browser `navigator.mediaSession` support for web mode.
- **Custom Theme-Matched Frameless Desktop Titlebar (`src/components/WindowTitlebar.tsx`, `src-tauri/tauri.conf.json`, `src-tauri/src/main.rs`)**: Replaced the native OS window frame with a custom draggable/resizable top bar matching Zuno's active 60/30/10 theme, customizable under **Customize → Top Titlebar & Window** with 5 control styles (*Minimal Mono*, *Traffic Lights*, *Monochrome Dots*, *Floating Pill*, *Sharp Studio*), Left/Right alignment, centered live track pill, and compact `30px` mode.
- **Zero-Copy Multi-Directory Music Library (`crates/zuno-core`, `crates/zuno-audio`, `src/components/MusicFoldersModal.tsx`)**: Link any existing system music directories (e.g., `~/Music` or external drives) via native Linux folder picker (`zenity` / `kdialog`), 1-click suggestions, or manual path input without duplicating audio files; includes live per-folder track counts, safe non-destructive **Unlink**, filesystem watching, and `.m3u8` self-healing support.
- **Pure-Rust Equal-Power Audio Crossfade & Fade-In Transitions (`crates/zuno-audio/src/engine.rs`, `crates/zuno-audio/src/service.rs`, `CustomizePage.tsx`)**: Overlapping dual-sink cosine/sine equal-power crossfade (`0s–10s`) with smooth fade-in from silence in both native Rust Rodio and browser `<audio>` modes, configured with a live SVG crossfade curve preview under **Customize → Player & Transitions**.
- **Skiper UI Component Theme Options (Zero-Bloat CSS/SVG)**:
  - **Skiper 4** (*Theme Toggle Button Styles*): 6 animated Dark/Light toggle icons (*Eclipse Mask*, *Split Disc*, *Horizon Sun*, *Expand Dot*, *Orbital Ring*, *Switch Pill*) in `EaseThemeToggle.tsx`.
  - **Skiper 26** (*View Transition Reveals & Origin*): Added *Diagonal Polygon* and *Bottom-Up Curtain* reveals alongside Circle Blur / Circle / Sweep / Blinds plus configurable reveal origin (`From Button`, `Center`, corners) and live preview.
  - **Skiper 25** (*Spinning Vinyl & Waveform Play Buttons*): Added *Spinning Vinyl* disc toggle alongside *Waveform Toggle* and *Classic Icon* across desktop bar, mobile dock, and full-screen player.
  - **Skiper 99** (*Animated Icons 002*): Added *Skiper 99 Animated* icon pack with kinetic hover sound waves, gliding arrows, and morphing playlist/menu bars.
- **Full-Screen Appearance Studio & Queue Live Toggle (`CustomizePage.tsx`, `NowPlayingPanel.tsx`, `ThemeSelector.tsx`)**: Made Customize Studio full-screen with a dedicated `← Back` button (`Esc` to exit), simplified Themes into a unified 8-theme grid (each including both Dark & Light modes without per-card toggle clutter), and enabled live Play/Pause animations & in-place toggle inside the Now Playing Queue sheet.

### Fixed
- **System & Media Keyboard Shortcuts (`src/App.tsx`, `src-tauri/src/main.rs`)**: Fixed `Space` key handler hijacking `Alt+Space`, `Super+Space`, and `Ctrl+Space` system shortcuts; guarded all OS modifier shortcuts while adding native support for hardware media keys (`MediaPlayPause`, `MediaTrackNext`, `MediaTrackPrevious`, `MediaStop`), `←/→` seek (`±5s`), `Shift+←/→` skip, `M` mute, `S` shuffle, `R` repeat, `F11` fullscreen, and `Ctrl+Q` quit.
- **External Playback Queue Sync (`src/App.tsx`)**: Automatically resyncs the React queue when tracks are started or skipped externally via MPRIS2 media keys, GNOME notification banner, system tray, or CLI.

## [0.0.4] — 2026-11-24

Standalone native Linux desktop app (Tauri v2), pure-Rust 10-band Equalizer DSP, single-binary embedded UI, and major RAM/CPU/audio smoothness optimizations.

### Added
- **Standalone Native Tauri v2 Desktop App (`src-tauri/`)**: Single ~9.8 MB stripped native Linux binary (`zuno`) with embedded frontend assets (`custom-protocol`), direct in-process Tauri IPC (`zuno_ipc` / `zuno_info`), zero-TCP custom `zuno://localhost/cover/<id>` artwork scheme, live Unix Domain Socket IPC (`~/zuno/.zuno/zuno.sock`) shared with `zuno-mcp`, and a minimalist B&W **System Tray** with **Destroy-WebView-on-Close** background playback mode.
- **Pure-Rust 10-Band ISO Equalizer + Soft Limiter (`crates/zuno-audio/src/eq.rs`)**: Zero-allocation Direct Form II Transposed biquad DSP (`32 Hz–16 kHz`) with atomic lock-free updates, click-free dry/wet crossfade, automatic headroom compensation, and transparent soft limiting inside `RodioEngine`, plus `SetEq`, `SetQueue`, and `JumpQueue` IPC commands.
- **Compile-Time Embedded Web UI in `zuno-mcp` (`crates/zuno-mcp/build.rs`)**: Compiles `dist/` directly into `zuno-mcp` (`~4.7 MB` self-contained single binary, `~4.7–5.6 MB` RSS) so neither binary requires external web folders or Node.js at runtime.

### Fixed & Optimized
- **Eliminated Audio Stuttering & Per-Chunk Disk Rescans**: Cached in-memory `ZunoService` track lookups for `/api/audio/:id` & `/api/cover/:id` (cutting 128 KiB range latency to `~1.9 ms/chunk`), enabled `TCP_NODELAY`, enlarged HTTP & Rodio read buffers to `128 KiB`, added immutable/long-lived HTTP `Cache-Control` headers, fixed RFC 7233 suffix ranges, and enabled `<audio preload="auto">`.
- **Eliminated Browser Web Audio Crackling & Clipping Noise**: Switched Web Audio `AudioContext` to `{ latencyHint: 'playback' }`, replaced live `disconnect()`/`connect()` node swaps with click-free parallel dry/wet crossfading, added auto-headroom trim, and suspended `AudioContext` while paused (`0%` idle Web Audio CPU).
- **Zero-Wakeup Idle Audio Thread & Lean UI Rendering**: Switched `zuno-audio` thread to blocking `rx.recv()` while idle (`0` wakeups/sec), replaced 60 FPS React `setState` in `EqualizerPage` spectrum with a 30 FPS direct SVG ref mutation, quantized playback ticks, memoized `HomePage` & `TrackRow`, removed external Google Fonts requests from `index.html`, and paused all CSS animations when the window is hidden (`.zuno-hidden`).

## [0.0.3] — 2026-11-24

Minimalist monochrome branding, unified full-screen Now Playing for desktop & mobile, EaseUI dropdown menus, mobile navigation overhaul, and one-command Linux desktop installation.

### Added
- **Minimalist Black & White Zuno Logo & Icons** (`public/zuno-logo.svg`, `public/icon-192.png`, `public/icon-512.png`, `public/manifest.webmanifest`, `src/components/ZunoLogo.tsx`): Precision obsidian squircle emblem with four stepped pure-white acoustic bars forming a minimalist Play silhouette, wired as browser favicon, PWA/touch icons, sidebar & mobile navbar brand mark, and Linux desktop icon.
- **Mobile Top Navbar & Slide-Over Menu** (`src/components/MobileNavbar.tsx`): Dedicated mobile top bar with the animated **Theme Toggle** placed outside beside the Menu button and a slide-over drawer containing **Equalizer** (with active preset badge), **Theme & Customize**, **Search songs**, **Rescan library**, and **Playlists**.
- **Dedicated Playlists Hub** (`src/pages/PlaylistsPage.tsx`): Dedicated Playlists overview pinning **Favorites** first followed by all zero-copy `.m3u8` playlists with artwork/icon tiles, song counts, total durations, 1-tap play buttons, and **+ New** playlist creation.
- **Full-Screen Now Playing for Desktop & Mobile** (`src/components/NowPlayingPanel.tsx`, `src/components/DesktopPlayerBar.tsx`): Minimal two-zone curved player accessible by clicking the desktop bottom dock or tapping the mobile mini-player, featuring centered typography, customizable `<Scrubber>` progress bar, split `elapsed | total` timestamps, contrasting **Previous / Play-Pause / Next** bottom tray, and a swipe-up/clickable **Queue & Playlists** bottom sheet.
- **EaseUI Dropdown Menus** (`src/components/ui/dropdown-menu.tsx`): Adopted `@easeui/dropdown-menu` physics (`cubic-bezier(0.23, 1, 0.32, 1)`, `150ms` open / `100ms` close, automatic upward flipping, keyboard navigation, destructive item styling) across `TrackRow`, `SortControl`, `NowPlayingPanel`, and `DesktopPlayerBar`.
- **Self-Contained Static UI Hosting & Linux Installer** (`crates/zuno-mcp/src/http.rs`, `scripts/install-linux.sh`): `zuno-mcp` now serves the built production frontend directly via `--web-dir` (or automatically from `~/.local/share/zuno/web`), paired with a zero-sudo Linux installer setting up `zuno`, `zuno-mcp`, hicolor icons, and `zuno.desktop`.

### Changed
- Replaced **Favorites** in the 4-tab mobile bottom dock (`MobileDock.tsx`) with **Playlists** (`Songs`, `Search`, `Recent`, `Playlists`).
- Replaced the clipped hairline progress seam on the mobile mini-player dock with compact animated playing bars (`Loader2`) inline beside the active track title.
- Added `--destructive` CSS variables (light & dark) in `src/index.css` and `disabled` tooltip suppression in `src/components/ui/tooltip.tsx` so hover hints never overlap open upward-flipped menus.

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
