use crate::engine::{AudioEngine, CROSSFADE_MAX_SECS, CROSSFADE_MIN_ACTIVE_SECS, RodioEngine};
use crate::eq::{EQ_BANDS, EQ_MAX_DB, EQ_MIN_DB, EqConfig};
use crate::radio::{
    self, ActiveRadioInfo, FmTunerManager, RadioPlayState, RadioPlaybackManager,
    RADIO_DISCOVER_DEFAULT_LIMIT,
};
use crate::spectrum::{AudioLevels, SharedSpectrum};
use serde_json::{Value, json};
use std::io::Read;
use std::path::PathBuf;
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::{Arc, Mutex, MutexGuard, OnceLock, Weak, mpsc};
use std::time::{Duration, Instant};
use zuno_core::ipc::{IpcData, IpcRequest, IpcResponse};
use zuno_core::settings::{
    self, AppSettings, appearance_options_catalog, apply_eq_preset, apply_settings_patch,
    backup_user_data_core, builtin_eq_presets, delete_custom_eq_preset, extract_crossfade_secs,
    extract_eq_tuple, load_app_settings, record_last_played, reset_eq, save_app_settings,
    save_app_settings_quiet, save_custom_eq_preset,
};
use zuno_core::{
    CoverArt, Library, PersistedState, PlayState, PlaybackStatus, Playlist, QueueManager,
    ROOT_FOLDER_LABEL, Result, Track, ZunoError, ZunoPaths,
};

const TICK_IDLE_MS: u64 = 200;
const TICK_FADING_MS: u64 = 25;
const MAX_AUTO_ADVANCE_SKIPS: usize = 5;

fn lock_unpoisoned<T>(m: &Mutex<T>) -> MutexGuard<'_, T> {
    m.lock().unwrap_or_else(|e| e.into_inner())
}

fn panic_payload_message(payload: Box<dyn std::any::Any + Send>) -> String {
    if let Some(s) = payload.downcast_ref::<&str>() {
        (*s).to_string()
    } else if let Some(s) = payload.downcast_ref::<String>() {
        s.clone()
    } else {
        "unexpected audio backend panic".to_string()
    }
}

fn catch_audio_result<F>(op: &str, f: F) -> Result<()>
where
    F: FnOnce() -> Result<()>,
{
    match std::panic::catch_unwind(std::panic::AssertUnwindSafe(f)) {
        Ok(res) => res,
        Err(payload) => {
            let msg = panic_payload_message(payload);
            eprintln!("[zuno-audio] recovered from panic in {op}: {msg}");
            Err(ZunoError::Audio(format!("audio backend error during {op}: {msg}")))
        }
    }
}

fn catch_audio_op<T, F>(op: &str, fallback: T, f: F) -> T
where
    F: FnOnce() -> T,
{
    match std::panic::catch_unwind(std::panic::AssertUnwindSafe(f)) {
        Ok(val) => val,
        Err(payload) => {
            let msg = panic_payload_message(payload);
            eprintln!("[zuno-audio] recovered from panic in {op}: {msg}");
            fallback
        }
    }
}

#[derive(Clone, Copy, PartialEq, Eq)]
enum PlaybackLoopMode {
    Idle,
    PlayingFile,
    LivePcm,
}

enum PlayTarget {
    Playlist { name: String, start_id: Option<String> },
    Folder { name: String, start_id: Option<String> },
    TrackId(String),
    Query(String),
    CurrentOrAll,
}

impl PlayTarget {
    fn from_opts(
        track_id: Option<String>,
        query: Option<String>,
        folder: Option<String>,
        playlist: Option<String>,
    ) -> Self {
        if let Some(name) = playlist {
            Self::Playlist { name, start_id: track_id }
        } else if let Some(name) = folder {
            Self::Folder { name, start_id: track_id }
        } else if let Some(id) = track_id {
            Self::TrackId(id)
        } else if let Some(q) = query {
            Self::Query(q)
        } else {
            Self::CurrentOrAll
        }
    }
}

enum AudioCmd {
    LoadAndPlay {
        load_gen: u64,
        path: PathBuf,
        volume: f32,
        reply: mpsc::Sender<Result<()>>,
    },
    LoadPcmStream {
        reader: Box<dyn Read + Send>,
        sample_rate: u32,
        channels: u16,
        volume: f32,
        reply: mpsc::Sender<Result<()>>,
    },
    Pause,
    Resume,
    Stop,
    Seek {
        pos: Duration,
        reply: mpsc::Sender<Result<()>>,
    },
    SetVolume(f32),
    SetEq(EqConfig),
    SetTransition(f32),
    Shutdown,
}

struct InnerState {
    library: Library,
    queue: QueueManager,
    play_state: PlayState,
    volume: f32,
    settings: AppSettings,
}

/// Thread-safe unified Zuno music engine shared by Tauri GUI, CLI, Daemon, and MCP server.
pub struct ZunoService {
    inner: Arc<Mutex<InnerState>>,
    audio_tx: mpsc::Sender<AudioCmd>,
    load_gen: Arc<AtomicU64>,
    position_bits: Arc<AtomicU64>,
    spectrum: Option<Arc<SharedSpectrum>>,
    radio: Arc<RadioPlaybackManager>,
    fm_tuner: Arc<FmTunerManager>,
    self_weak: OnceLock<Weak<Self>>,
    library_rev: AtomicU64,
    radio_store_rev: AtomicU64,
    on_change: Mutex<Arc<dyn Fn() + Send + Sync>>,
}

impl ZunoService {
    /// Start Zuno using the real Rodio/Symphonia desktop audio backend.
    pub fn open_rodio(paths: ZunoPaths) -> Result<Arc<Self>> {
        Self::open_with_engine(paths, RodioEngine::new())
    }

    /// Start Zuno with a custom `AudioEngine` (e.g. `MockAudioEngine` in tests).
    pub fn open_with_engine<E: AudioEngine>(paths: ZunoPaths, mut engine: E) -> Result<Arc<Self>> {
        let library = Library::open(paths.clone())?;
        let persisted = library.load_state();
        let app_settings = load_app_settings(&paths);
        let initial_has_settings = app_settings.revision > 0;
        let initial_eq = extract_eq_tuple(&app_settings);
        let initial_crossfade = extract_crossfade_secs(&app_settings);

        let mut queue = QueueManager::new();
        queue.set_repeat(persisted.repeat);
        queue.set_shuffle(persisted.shuffle);

        let valid_queue: Vec<String> = persisted
            .queue_track_ids
            .into_iter()
            .filter(|id| library.track_by_id(id).is_some())
            .collect();
        if !valid_queue.is_empty() {
            queue.set_queue(
                valid_queue,
                persisted.last_track_id.as_deref(),
                persisted.active_playlist,
            );
        }

        let inner = Arc::new(Mutex::new(InnerState {
            library,
            queue,
            play_state: PlayState::Stopped,
            volume: persisted.volume.clamp(0.0, 1.0),
            settings: app_settings,
        }));

        let (tx, rx) = mpsc::channel::<AudioCmd>();
        let load_gen = Arc::new(AtomicU64::new(0));
        let position_bits = Arc::new(AtomicU64::new(0.0f64.to_bits()));
        let spectrum = engine.spectrum();
        let service = Arc::new(Self {
            inner: Arc::clone(&inner),
            audio_tx: tx.clone(),
            load_gen: Arc::clone(&load_gen),
            position_bits: Arc::clone(&position_bits),
            spectrum,
            radio: Arc::new(RadioPlaybackManager::new()),
            fm_tuner: Arc::new(FmTunerManager::new()),
            self_weak: OnceLock::new(),
            library_rev: AtomicU64::new(0),
            radio_store_rev: AtomicU64::new(0),
            on_change: Mutex::new(Arc::new(|| {})),
        });
        let _ = service.self_weak.set(Arc::downgrade(&service));

        let weak_service = Arc::downgrade(&service);
        let thread_inner = Arc::clone(&inner);
        let thread_pos = Arc::clone(&position_bits);
        let thread_load_gen = Arc::clone(&load_gen);

        // Single dedicated audio thread: owns OutputStream/Sink safely.
        // Blocks with zero CPU wakeups while idle/paused, ticks at 25ms during active crossfades,
        // and uses an absolute `next_tick` deadline (200ms) while playing so frequent status
        // queries never block or starve auto-advance or crossfade envelopes.
        // Every backend call is guarded by `catch_unwind` so a malformed file or third-party
        // decoder bug can never kill the audio thread or crash the application.
        std::thread::Builder::new()
            .name("zuno-audio".into())
            .spawn(move || {
                let mut mode = PlaybackLoopMode::Idle;
                let mut crossfade_secs: f32 = 0.0;
                let mut fading = false;
                let mut next_tick = Instant::now() + Duration::from_millis(TICK_IDLE_MS);
                let publish_pos = |pos: f64| {
                    thread_pos.store(pos.max(0.0).to_bits(), Ordering::Relaxed);
                };
                loop {
                    let active = mode == PlaybackLoopMode::PlayingFile;
                    let msg = if fading || active {
                        let wait = next_tick.saturating_duration_since(Instant::now());
                        rx.recv_timeout(wait)
                    } else {
                        rx.recv().map_err(|_| mpsc::RecvTimeoutError::Disconnected)
                    };
                    let mut timed_out = false;
                    match msg {
                        Ok(AudioCmd::LoadAndPlay {
                            load_gen: cmd_gen,
                            path,
                            volume,
                            reply,
                        }) => {
                            if cmd_gen < thread_load_gen.load(Ordering::Acquire) {
                                // A newer track load or stop is already queued — skip decoding stale track.
                                let _ = reply.send(Ok(()));
                            } else {
                                let res = catch_audio_result("load_and_play", || {
                                    engine.load_and_play(&path, volume)
                                });
                                if res.is_ok() {
                                    mode = PlaybackLoopMode::PlayingFile;
                                    publish_pos(0.0);
                                }
                                fading = catch_audio_op("tick_transition", false, || {
                                    engine.tick_transition()
                                });
                                next_tick = Instant::now()
                                    + Duration::from_millis(if fading {
                                        TICK_FADING_MS
                                    } else {
                                        TICK_IDLE_MS
                                    });
                                let _ = reply.send(res);
                            }
                        }
                        Ok(AudioCmd::LoadPcmStream {
                            reader,
                            sample_rate,
                            channels,
                            volume,
                            reply,
                        }) => {
                            let res = catch_audio_result("load_pcm_stream", || {
                                engine.load_pcm_stream(reader, sample_rate, channels, volume)
                            });
                            mode = if res.is_ok() {
                                PlaybackLoopMode::LivePcm
                            } else {
                                PlaybackLoopMode::Idle
                            };
                            publish_pos(0.0);
                            fading = false;
                            let _ = reply.send(res);
                        }
                        Ok(AudioCmd::Pause) => {
                            let pos = catch_audio_op("position_secs", 0.0, || engine.position_secs());
                            publish_pos(pos);
                            catch_audio_op("pause", (), || engine.pause());
                            if mode == PlaybackLoopMode::PlayingFile {
                                mode = PlaybackLoopMode::Idle;
                            }
                            fading = false;
                        }
                        Ok(AudioCmd::Resume) => {
                            catch_audio_op("resume", (), || engine.resume());
                            if mode != PlaybackLoopMode::LivePcm {
                                mode = PlaybackLoopMode::PlayingFile;
                            }
                            next_tick = Instant::now() + Duration::from_millis(TICK_IDLE_MS);
                        }
                        Ok(AudioCmd::Stop) => {
                            catch_audio_op("stop", (), || engine.stop());
                            mode = PlaybackLoopMode::Idle;
                            publish_pos(0.0);
                            fading = false;
                        }
                        Ok(AudioCmd::Seek { pos, reply }) => {
                            let res = catch_audio_result("seek", || engine.seek(pos));
                            if res.is_ok() {
                                publish_pos(pos.as_secs_f64());
                            }
                            let _ = reply.send(res);
                        }
                        Ok(AudioCmd::SetVolume(v)) => {
                            catch_audio_op("set_volume", (), || engine.set_volume(v));
                        }
                        Ok(AudioCmd::SetEq(eq)) => {
                            catch_audio_op("set_eq", (), || engine.set_eq(eq));
                        }
                        Ok(AudioCmd::SetTransition(secs)) => {
                            crossfade_secs = secs.clamp(0.0, CROSSFADE_MAX_SECS);
                            catch_audio_op("set_crossfade", (), || {
                                engine.set_crossfade(crossfade_secs)
                            });
                        }
                        Ok(AudioCmd::Shutdown) | Err(mpsc::RecvTimeoutError::Disconnected) => {
                            catch_audio_op("stop", (), || engine.stop());
                            break;
                        }
                        Err(mpsc::RecvTimeoutError::Timeout) => {
                            timed_out = true;
                        }
                    }

                    let active = mode == PlaybackLoopMode::PlayingFile;
                    if (active || fading) && (timed_out || Instant::now() >= next_tick) {
                        fading =
                            catch_audio_op("tick_transition", false, || engine.tick_transition());
                        let pos = catch_audio_op("position_secs", 0.0, || engine.position_secs());
                        if active {
                            publish_pos(pos);
                        }

                        // Check if current track is approaching end for early overlapping crossfade,
                        // or has finished playing normally.
                        let early_crossfade = if crossfade_secs > CROSSFADE_MIN_ACTIVE_SECS && !fading && active {
                            let cur_dur = {
                                let s = lock_unpoisoned(&thread_inner);
                                if s.play_state != PlayState::Playing {
                                    0.0
                                } else {
                                    s.queue
                                        .current_track_id()
                                        .and_then(|tid| s.library.track_by_id(tid))
                                        .map(|t| t.duration_secs as f64)
                                        .unwrap_or(0.0)
                                }
                            };
                            cur_dur > (crossfade_secs as f64) + 1.5
                                && pos >= cur_dur - (crossfade_secs as f64)
                        } else {
                            false
                        };

                        let finished =
                            catch_audio_op("is_finished", false, || engine.is_finished());
                        if active && (early_crossfade || finished) {
                            let should_advance =
                                lock_unpoisoned(&thread_inner).play_state == PlayState::Playing;
                            if should_advance {
                                if let Some(svc) = weak_service.upgrade() {
                                    let mut advanced = false;
                                    let mut hit_end = false;
                                    for _ in 0..MAX_AUTO_ADVANCE_SKIPS {
                                        match svc.advance_internal(true) {
                                            Some((path, vol)) => {
                                                let ok = catch_audio_result("auto_advance", || {
                                                    engine.load_and_play(&path, vol)
                                                })
                                                .is_ok();
                                                if ok {
                                                    publish_pos(0.0);
                                                    fading = catch_audio_op(
                                                        "tick_transition",
                                                        false,
                                                        || engine.tick_transition(),
                                                    );
                                                    advanced = true;
                                                    {
                                                        let st = lock_unpoisoned(&thread_inner);
                                                        Self::persist_locked(&st, 0.0);
                                                    }
                                                    svc.notify_change();
                                                    break;
                                                }
                                            }
                                            None => {
                                                hit_end = true;
                                                break;
                                            }
                                        }
                                    }
                                    let still_finished = catch_audio_op("is_finished", true, || {
                                        engine.is_finished()
                                    });
                                    if !advanced && (!hit_end || still_finished) {
                                        // If early crossfade fired on the last track with repeat off,
                                        // let the final track finish cleanly instead of cutting it off early!
                                        catch_audio_op("stop", (), || engine.stop());
                                        mode = PlaybackLoopMode::Idle;
                                        publish_pos(0.0);
                                        fading = false;
                                        {
                                            let mut st = lock_unpoisoned(&thread_inner);
                                            st.play_state = PlayState::Stopped;
                                            Self::persist_locked(&st, 0.0);
                                        }
                                        svc.notify_change();
                                    }
                                }
                            } else if finished {
                                mode = PlaybackLoopMode::Idle;
                                fading = false;
                            }
                        }

                        next_tick = Instant::now()
                            + Duration::from_millis(if fading { TICK_FADING_MS } else { TICK_IDLE_MS });
                    }
                }
            })
            .map_err(|e| ZunoError::Audio(format!("failed to spawn audio thread: {e}")))?;

        // Apply saved EQ & crossfade settings immediately on engine startup.
        if initial_has_settings {
            let (enabled, preamp_db, limiter, bands_db) = initial_eq;
            let _ = service.audio_tx.send(AudioCmd::SetEq(EqConfig {
                enabled,
                preamp_db,
                limiter,
                bands_db,
            }));
            if initial_crossfade > 0.0 {
                let _ = service
                    .audio_tx
                    .send(AudioCmd::SetTransition(initial_crossfade));
            }
        }

        Ok(service)
    }

    pub fn paths(&self) -> ZunoPaths {
        lock_unpoisoned(&self.inner).library.paths().clone()
    }

    pub fn radio(&self) -> &Arc<RadioPlaybackManager> {
        &self.radio
    }

    pub fn fm_tuner(&self) -> &Arc<FmTunerManager> {
        &self.fm_tuner
    }

    pub fn set_change_callback(&self, cb: Arc<dyn Fn() + Send + Sync>) {
        if let Ok(mut guard) = self.on_change.lock() {
            *guard = cb;
        }
    }

    fn change_callback(&self) -> Arc<dyn Fn() + Send + Sync> {
        self.on_change
            .lock()
            .map(|g| Arc::clone(&g))
            .unwrap_or_else(|_| Arc::new(|| {}))
    }

    fn notify_change(&self) {
        (self.change_callback())();
    }

    fn arc_self(&self) -> Result<Arc<Self>> {
        self.self_weak
            .get()
            .and_then(Weak::upgrade)
            .ok_or_else(|| ZunoError::Audio("service reference unavailable".into()))
    }

    /// Monotonic revision counters `(settings_rev, library_rev, radio_store_rev)` for O(1) live GUI sync.
    pub fn revisions(&self) -> (u64, u64, u64) {
        let settings_rev = self.inner.lock().map(|s| s.settings.revision).unwrap_or(0);
        (
            settings_rev,
            self.library_rev.load(Ordering::Relaxed),
            self.radio_store_rev.load(Ordering::Relaxed),
        )
    }

    pub fn bump_radio_store_rev(&self) {
        self.radio_store_rev.fetch_add(1, Ordering::Relaxed);
    }

    pub fn settings_snapshot(&self) -> AppSettings {
        lock_unpoisoned(&self.inner).settings.clone()
    }

    /// Lock-free real-time 24-band audio spectrum + bass/mid/treble/energy snapshot for visualizers.
    pub fn audio_levels(&self) -> AudioLevels {
        self.spectrum
            .as_ref()
            .map(|s| s.snapshot())
            .unwrap_or_default()
    }

    pub fn extract_cover(&self, track_id: &str) -> Option<CoverArt> {
        let abs = {
            let st = lock_unpoisoned(&self.inner);
            let track = st.library.track_by_id(track_id)?;
            st.library.resolve_track_path(track).ok()?
        };
        zuno_core::scanner::extract_cover_art(&abs)
    }

    pub fn resolve_track_file(&self, track_id: &str) -> Option<(PathBuf, String)> {
        let st = lock_unpoisoned(&self.inner);
        let track = st.library.track_by_id(track_id)?;
        let abs = st.library.resolve_track_path(track).ok()?;
        Some((abs, track.rel_path.clone()))
    }

    pub fn is_playing(&self) -> bool {
        self.inner
            .lock()
            .map(|s| s.play_state == PlayState::Playing)
            .unwrap_or(false)
    }

    /// Stream live raw signed 16-bit LE PCM audio (e.g., from an RTL-SDR hardware FM receiver)
    /// directly through Zuno's Rodio output, 10-band Rust EQ, and 1024-pt FFT visualizer.
    pub fn play_pcm_stream(
        &self,
        reader: Box<dyn Read + Send>,
        sample_rate: u32,
        channels: u16,
    ) -> Result<()> {
        let vol = {
            let mut st = lock_unpoisoned(&self.inner);
            if st.play_state == PlayState::Playing {
                st.play_state = PlayState::Paused;
            }
            st.volume
        };
        self.load_gen.fetch_add(1, Ordering::AcqRel);
        let (reply_tx, reply_rx) = mpsc::channel();
        self.audio_tx
            .send(AudioCmd::LoadPcmStream {
                reader,
                sample_rate,
                channels,
                volume: vol,
                reply: reply_tx,
            })
            .map_err(|_| ZunoError::Audio("audio thread unavailable".into()))?;
        reply_rx
            .recv()
            .map_err(|_| ZunoError::Audio("audio thread dropped reply".into()))?
    }

    /// Stop any live PCM hardware FM stream without clearing the user's song queue.
    pub fn stop_pcm_stream(&self) {
        self.load_gen.fetch_add(1, Ordering::AcqRel);
        let _ = self.audio_tx.send(AudioCmd::Stop);
    }

    /// Pause local file playback without touching active FM radio state (used when switching to FM).
    pub fn pause_local_playback(&self) {
        let _ = self.audio_tx.send(AudioCmd::Pause);
        let pos = self.audio_position();
        let mut st = lock_unpoisoned(&self.inner);
        if st.play_state == PlayState::Playing {
            st.play_state = PlayState::Paused;
            Self::persist_locked(&st, pos);
        }
    }

    /// Execute any `IpcRequest` and return a structured `IpcResponse`.
    pub fn handle_request(&self, req: IpcRequest) -> IpcResponse {
        match self.dispatch(req) {
            Ok(data) => IpcResponse::Ok { data },
            Err(err) => IpcResponse::Err {
                message: err.to_string(),
            },
        }
    }

    fn apply_eq_to_audio(&self, settings: &AppSettings) {
        let (enabled, preamp_db, limiter, bands_db) = extract_eq_tuple(settings);
        let _ = self.audio_tx.send(AudioCmd::SetEq(EqConfig {
            enabled,
            preamp_db,
            limiter,
            bands_db,
        }));
    }

    fn apply_crossfade_to_audio(&self, settings: &AppSettings) {
        let cf = extract_crossfade_secs(settings);
        let _ = self.audio_tx.send(AudioCmd::SetTransition(cf));
    }

    fn eq_payload(settings: &AppSettings) -> Value {
        json!({
            "eq": settings.eq,
            "revision": settings.revision,
            "builtin_presets": builtin_eq_presets(),
            "band_frequencies_hz": [32, 64, 125, 250, 500, 1000, 2000, 4000, 8000, 16000],
            "min_db": EQ_MIN_DB,
            "max_db": EQ_MAX_DB,
        })
    }

    fn is_favorites_slug(slug: &str) -> bool {
        matches!(
            slug.trim().to_ascii_lowercase().as_str(),
            "favorites" | "fav" | "favourites" | "liked" | "liked-songs"
        )
    }

    fn dispatch(&self, req: IpcRequest) -> Result<IpcData> {
        match req {
            IpcRequest::Ping => Ok(IpcData::Pong {
                version: env!("CARGO_PKG_VERSION").to_string(),
            }),

            IpcRequest::GetInfo => {
                let paths = self.paths();
                let st = lock_unpoisoned(&self.inner);
                Ok(IpcData::Json(json!({
                    "version": env!("CARGO_PKG_VERSION"),
                    "root_dir": paths.root().display().to_string(),
                    "songs_dir": paths.songs_dir().display().to_string(),
                    "playlists_dir": paths.playlists_dir().display().to_string(),
                    "settings_path": paths.settings_path().display().to_string(),
                    "radio_path": paths.radio_path().display().to_string(),
                    "socket_path": paths.socket_path().display().to_string(),
                    "home_dir": zuno_core::user_home_dir().map(|h| h.display().to_string()),
                    "suggested_dirs": paths.suggested_music_dirs(),
                    "track_count": st.library.tracks().len(),
                    "playlist_count": st.library.playlists().len(),
                    "source_count": st.library.sources().len(),
                    "radio_active": self.radio.active(),
                    "fm_hardware": self.fm_tuner.hardware_status(),
                    "revisions": {
                        "settings": st.settings.revision,
                        "library": self.library_rev.load(Ordering::Relaxed),
                        "radio_store": self.radio_store_rev.load(Ordering::Relaxed),
                    },
                })))
            }

            IpcRequest::Rescan => {
                let mut st = lock_unpoisoned(&self.inner);
                st.library.rescan()?;
                Self::prune_queue_locked(&mut st);
                let count = st.library.tracks().len();
                let pl_count = st.library.playlists().len();
                drop(st);
                self.library_rev.fetch_add(1, Ordering::Relaxed);
                Ok(IpcData::Message(format!(
                    "Indexed {count} tracks and {pl_count} playlists"
                )))
            }

            IpcRequest::GetStatus => Ok(IpcData::Status(self.status())),

            IpcRequest::GetAudioLevels => {
                let levels = self.audio_levels();
                Ok(IpcData::Json(serde_json::to_value(&levels)?))
            }

            IpcRequest::ListSongs {
                folder,
                limit,
                offset,
                sort_by,
                sort_dir,
            } => {
                let st = lock_unpoisoned(&self.inner);
                let mut refs: Vec<&Track> = match folder.as_deref().map(str::trim) {
                    Some(f) if !f.is_empty() && f != ROOT_FOLDER_LABEL => {
                        st.library.tracks_in_folder(f)
                    }
                    Some(f) if f == ROOT_FOLDER_LABEL => st
                        .library
                        .tracks()
                        .iter()
                        .filter(|t| t.folder.is_empty())
                        .collect(),
                    _ => st.library.tracks().iter().collect(),
                };
                if let Some(field) = sort_by.as_deref().map(str::trim).filter(|s| !s.is_empty()) {
                    let desc = sort_dir
                        .as_deref()
                        .map(|d| d.eq_ignore_ascii_case("desc"))
                        .unwrap_or(false);
                    refs.sort_by(|a, b| {
                        let ord = match field {
                            "artist" => a
                                .artist
                                .to_ascii_lowercase()
                                .cmp(&b.artist.to_ascii_lowercase())
                                .then_with(|| {
                                    a.title.to_ascii_lowercase().cmp(&b.title.to_ascii_lowercase())
                                }),
                            "album" => a
                                .album
                                .to_ascii_lowercase()
                                .cmp(&b.album.to_ascii_lowercase())
                                .then_with(|| {
                                    a.title.to_ascii_lowercase().cmp(&b.title.to_ascii_lowercase())
                                }),
                            "time" | "date" => a.modified_secs.cmp(&b.modified_secs),
                            "size" => a.file_size.cmp(&b.file_size),
                            "duration" => a.duration_secs.cmp(&b.duration_secs),
                            _ => a.title.to_ascii_lowercase().cmp(&b.title.to_ascii_lowercase()),
                        };
                        if desc { ord.reverse() } else { ord }
                    });
                }
                let total = refs.len();
                let start = offset.unwrap_or(0).min(total);
                let lim = limit.unwrap_or(200);
                let slice = refs.into_iter().skip(start).take(lim).cloned().collect();
                Ok(IpcData::Tracks {
                    total,
                    tracks: slice,
                })
            }

            IpcRequest::SearchSongs { query, limit } => {
                let st = lock_unpoisoned(&self.inner);
                let lim = limit.unwrap_or(50);
                let tracks: Vec<Track> = st
                    .library
                    .search(&query, lim)
                    .into_iter()
                    .cloned()
                    .collect();
                let total = tracks.len();
                Ok(IpcData::Tracks { total, tracks })
            }

            IpcRequest::ListFolders => {
                let st = lock_unpoisoned(&self.inner);
                Ok(IpcData::Folders(st.library.folders()))
            }

            IpcRequest::ListSources => {
                let st = lock_unpoisoned(&self.inner);
                Ok(IpcData::Sources(st.library.sources()))
            }

            IpcRequest::AddSource { path } => {
                let mut st = lock_unpoisoned(&self.inner);
                let sources = st.library.add_source(&path)?;
                drop(st);
                self.library_rev.fetch_add(1, Ordering::Relaxed);
                Ok(IpcData::Sources(sources))
            }

            IpcRequest::RemoveSource { path } => {
                let mut st = lock_unpoisoned(&self.inner);
                let sources = st.library.remove_source(&path)?;
                let current_gone = st
                    .queue
                    .current_track_id()
                    .map(|id| !st.library.has_track(id))
                    .unwrap_or(false);
                Self::prune_queue_locked(&mut st);
                if current_gone {
                    st.play_state = PlayState::Stopped;
                    let _ = self.audio_tx.send(AudioCmd::Stop);
                }
                drop(st);
                self.library_rev.fetch_add(1, Ordering::Relaxed);
                Ok(IpcData::Sources(sources))
            }

            IpcRequest::ListPlaylists => {
                let st = lock_unpoisoned(&self.inner);
                Ok(IpcData::Playlists(st.library.playlists().to_vec()))
            }

            IpcRequest::GetPlaylist { name } => {
                let st = lock_unpoisoned(&self.inner);
                let (playlist, tracks) = st.library.playlist_tracks(&name)?;
                Ok(IpcData::PlaylistDetail { playlist, tracks })
            }

            IpcRequest::CreatePlaylist { name, track_ids } => {
                let mut st = lock_unpoisoned(&self.inner);
                let playlist = st.library.create_playlist(&name, &track_ids)?;
                let detail = Self::playlist_detail_locked(&st, playlist);
                drop(st);
                self.library_rev.fetch_add(1, Ordering::Relaxed);
                Ok(detail)
            }

            IpcRequest::DeletePlaylist { name } => {
                let mut st = lock_unpoisoned(&self.inner);
                let slug = st.library.delete_playlist(&name)?;
                drop(st);
                self.library_rev.fetch_add(1, Ordering::Relaxed);
                Ok(IpcData::Message(format!("Deleted playlist '{slug}'")))
            }

            IpcRequest::AddToPlaylist { name, track_ids } => {
                let mut st = lock_unpoisoned(&self.inner);
                let playlist = st.library.add_to_playlist(&name, &track_ids)?;
                let detail = Self::playlist_detail_locked(&st, playlist);
                drop(st);
                self.library_rev.fetch_add(1, Ordering::Relaxed);
                Ok(detail)
            }

            IpcRequest::RemoveFromPlaylist { name, track_id } => {
                let mut st = lock_unpoisoned(&self.inner);
                let playlist = st.library.remove_from_playlist(&name, &track_id)?;
                let detail = Self::playlist_detail_locked(&st, playlist);
                drop(st);
                self.library_rev.fetch_add(1, Ordering::Relaxed);
                Ok(detail)
            }

            IpcRequest::ToggleFavorite { track_id } => {
                let mut st = lock_unpoisoned(&self.inner);
                let target_id = match track_id.filter(|s| !s.trim().is_empty()) {
                    Some(id) => id,
                    None => st
                        .queue
                        .current_track_id()
                        .map(str::to_string)
                        .ok_or_else(|| {
                            ZunoError::TrackNotFound(
                                "no track playing; pass 'track_id' explicitly".into(),
                            )
                        })?,
                };
                if !st.library.has_track(&target_id) {
                    return Err(ZunoError::TrackNotFound(target_id));
                }
                let fav = st
                    .library
                    .playlists()
                    .iter()
                    .find(|p| Self::is_favorites_slug(&p.slug))
                    .cloned();
                let (favorited, playlist) = match fav {
                    Some(existing) => {
                        if existing.track_ids.iter().any(|id| id == &target_id) {
                            let pl = st
                                .library
                                .remove_from_playlist(&existing.slug, &target_id)?;
                            (false, pl)
                        } else {
                            let pl = st
                                .library
                                .add_to_playlist(&existing.slug, std::slice::from_ref(&target_id))?;
                            (true, pl)
                        }
                    }
                    None => {
                        let pl = st
                            .library
                            .create_playlist("Favorites", std::slice::from_ref(&target_id))?;
                        (true, pl)
                    }
                };
                drop(st);
                self.library_rev.fetch_add(1, Ordering::Relaxed);
                Ok(IpcData::Json(json!({
                    "track_id": target_id,
                    "favorited": favorited,
                    "playlist": playlist,
                })))
            }

            IpcRequest::DeleteSong { track_id } => {
                let mut st = lock_unpoisoned(&self.inner);
                let was_current = st.queue.current_track_id() == Some(track_id.as_str());
                let title = st.library.delete_song(&track_id)?;
                Self::prune_queue_locked(&mut st);
                if was_current {
                    st.play_state = PlayState::Stopped;
                    let _ = self.audio_tx.send(AudioCmd::Stop);
                }
                drop(st);
                self.library_rev.fetch_add(1, Ordering::Relaxed);
                Ok(IpcData::Message(format!("Deleted {title}")))
            }

            IpcRequest::Play {
                track_id,
                query,
                folder,
                playlist,
            } => {
                self.radio.clear(None, &self.fm_tuner);
                let target = PlayTarget::from_opts(track_id, query, folder, playlist);
                let (abs_path, volume) = self.prepare_play(target)?;
                self.start_loaded_track(abs_path, volume)?;
                self.notify_change();
                Ok(IpcData::Status(self.status()))
            }

            IpcRequest::Pause => {
                if self.radio.is_active() {
                    let info = self.radio.disconnect(self, &self.fm_tuner);
                    self.notify_change();
                    return Ok(IpcData::Json(json!({
                        "radio": info,
                        "playback": self.status(),
                    })));
                }
                let _ = self.audio_tx.send(AudioCmd::Pause);
                let pos = self.audio_position();
                {
                    let mut st = lock_unpoisoned(&self.inner);
                    if st.play_state == PlayState::Playing {
                        st.play_state = PlayState::Paused;
                        Self::persist_locked(&st, pos);
                    }
                }
                self.notify_change();
                Ok(IpcData::Status(self.status()))
            }

            IpcRequest::Resume => {
                if let Some(active) = self.radio.active() {
                    if active.state == RadioPlayState::Disconnected {
                        let svc = self.arc_self()?;
                        self.radio
                            .reconnect(&svc, &self.fm_tuner, self.change_callback());
                    }
                    self.notify_change();
                    return Ok(IpcData::Json(json!({
                        "radio": self.radio.active(),
                        "playback": self.status(),
                    })));
                }
                let needs_load = {
                    let st = lock_unpoisoned(&self.inner);
                    st.play_state == PlayState::Stopped
                };
                if needs_load {
                    let (abs_path, volume) = self.prepare_current_or_first()?;
                    self.load_audio(abs_path, volume)?;
                } else {
                    let _ = self.audio_tx.send(AudioCmd::Resume);
                }
                {
                    let mut st = lock_unpoisoned(&self.inner);
                    if st.queue.current_track_id().is_some() {
                        st.play_state = PlayState::Playing;
                    }
                }
                self.notify_change();
                Ok(IpcData::Status(self.status()))
            }

            IpcRequest::TogglePause => {
                if let Some(active) = self.radio.active() {
                    if matches!(
                        active.state,
                        RadioPlayState::Playing | RadioPlayState::Connecting
                    ) {
                        self.radio.disconnect(self, &self.fm_tuner);
                    } else {
                        let svc = self.arc_self()?;
                        self.radio
                            .reconnect(&svc, &self.fm_tuner, self.change_callback());
                    }
                    self.notify_change();
                    return Ok(IpcData::Json(json!({
                        "radio": self.radio.active(),
                        "playback": self.status(),
                    })));
                }
                let state = lock_unpoisoned(&self.inner).play_state;
                match state {
                    PlayState::Playing => self.dispatch(IpcRequest::Pause),
                    PlayState::Paused | PlayState::Stopped => self.dispatch(IpcRequest::Resume),
                }
            }

            IpcRequest::Stop => {
                self.radio.clear(None, &self.fm_tuner);
                self.load_gen.fetch_add(1, Ordering::AcqRel);
                let _ = self.audio_tx.send(AudioCmd::Stop);
                {
                    let mut st = lock_unpoisoned(&self.inner);
                    st.play_state = PlayState::Stopped;
                    Self::persist_locked(&st, 0.0);
                }
                self.notify_change();
                Ok(IpcData::Status(self.status()))
            }

            IpcRequest::Next => {
                if self.radio.is_active() {
                    self.radio.queue_step(1);
                    self.notify_change();
                    return Ok(IpcData::Json(json!({
                        "radio": self.radio.active(),
                        "stepped": "next",
                    })));
                }
                if let Some((path, vol)) = self.advance_internal(false) {
                    self.start_loaded_track(path, vol)?;
                } else {
                    let _ = self.audio_tx.send(AudioCmd::Stop);
                    let mut st = lock_unpoisoned(&self.inner);
                    st.play_state = PlayState::Stopped;
                }
                self.notify_change();
                Ok(IpcData::Status(self.status()))
            }

            IpcRequest::Previous => {
                if self.radio.is_active() {
                    self.radio.queue_step(-1);
                    self.notify_change();
                    return Ok(IpcData::Json(json!({
                        "radio": self.radio.active(),
                        "stepped": "previous",
                    })));
                }
                let next_pair = {
                    let mut st = lock_unpoisoned(&self.inner);
                    let id = st.queue.previous();
                    id.and_then(|tid| {
                        let track = st.library.track_by_id(&tid)?;
                        let abs = st.library.resolve_track_path(track).ok()?;
                        Some((abs, st.volume))
                    })
                };
                if let Some((path, vol)) = next_pair {
                    self.start_loaded_track(path, vol)?;
                }
                self.notify_change();
                Ok(IpcData::Status(self.status()))
            }

            IpcRequest::Seek { position_secs } => {
                let clamped = position_secs.max(0.0);
                let (reply_tx, reply_rx) = mpsc::channel();
                let _ = self.audio_tx.send(AudioCmd::Seek {
                    pos: Duration::from_secs_f64(clamped),
                    reply: reply_tx,
                });
                reply_rx
                    .recv()
                    .map_err(|_| ZunoError::Audio("audio thread unavailable".into()))??;
                Ok(IpcData::Status(self.status()))
            }

            IpcRequest::SetVolume { volume } => {
                let v = volume.clamp(0.0, 1.0);
                let _ = self.audio_tx.send(AudioCmd::SetVolume(v));
                let pos = self.audio_position();
                {
                    let mut st = lock_unpoisoned(&self.inner);
                    st.volume = v;
                    Self::persist_locked(&st, pos);
                }
                self.notify_change();
                Ok(IpcData::Status(self.status()))
            }

            IpcRequest::GetEq => {
                let st = lock_unpoisoned(&self.inner);
                Ok(IpcData::Json(Self::eq_payload(&st.settings)))
            }

            IpcRequest::SetEq {
                enabled,
                preamp,
                limiter,
                bands,
            } => {
                let mut arr = [0.0f32; EQ_BANDS];
                for (i, v) in bands.into_iter().take(EQ_BANDS).enumerate() {
                    arr[i] = settings::clamp_db(v);
                }
                let clean_preamp = settings::clamp_db(preamp);
                let _ = self.audio_tx.send(AudioCmd::SetEq(EqConfig {
                    enabled,
                    preamp_db: clean_preamp,
                    limiter,
                    bands_db: arr,
                }));
                let mut st = lock_unpoisoned(&self.inner);
                let current = extract_eq_tuple(&st.settings);
                let changed = current.0 != enabled
                    || (current.1 - clean_preamp).abs() > 0.01
                    || current.2 != limiter
                    || current
                        .3
                        .iter()
                        .zip(arr.iter())
                        .any(|(a, b)| (a - b).abs() > 0.01);
                if changed {
                    if let Some(obj) = st.settings.eq.as_object_mut() {
                        obj.insert("enabled".into(), json!(enabled));
                        obj.insert("preamp".into(), json!(clean_preamp));
                        obj.insert("limiter".into(), json!(limiter));
                        obj.insert("bands".into(), json!(arr.to_vec()));
                        obj.insert("presetId".into(), Value::Null);
                    }
                    let paths = st.library.paths().clone();
                    let _ = save_app_settings(&paths, &mut st.settings);
                }
                Ok(IpcData::Message("EQ updated".into()))
            }

            IpcRequest::ApplyEqPreset { preset_id } => {
                let mut st = lock_unpoisoned(&self.inner);
                let preset = apply_eq_preset(&mut st.settings, &preset_id)?;
                let paths = st.library.paths().clone();
                save_app_settings(&paths, &mut st.settings)?;
                self.apply_eq_to_audio(&st.settings);
                Ok(IpcData::Json(json!({
                    "applied_preset": preset,
                    "eq": st.settings.eq,
                    "revision": st.settings.revision,
                })))
            }

            IpcRequest::SaveEqPreset {
                name,
                bands,
                preamp,
            } => {
                let mut st = lock_unpoisoned(&self.inner);
                let preset = save_custom_eq_preset(&mut st.settings, &name, bands, preamp)?;
                let paths = st.library.paths().clone();
                save_app_settings(&paths, &mut st.settings)?;
                self.apply_eq_to_audio(&st.settings);
                Ok(IpcData::Json(json!({
                    "saved_preset": preset,
                    "eq": st.settings.eq,
                    "revision": st.settings.revision,
                })))
            }

            IpcRequest::DeleteEqPreset { id } => {
                let mut st = lock_unpoisoned(&self.inner);
                let removed = delete_custom_eq_preset(&mut st.settings, &id);
                if !removed {
                    return Err(ZunoError::NotFound(format!("custom EQ preset '{id}' not found")));
                }
                let paths = st.library.paths().clone();
                save_app_settings(&paths, &mut st.settings)?;
                Ok(IpcData::Json(json!({
                    "deleted_id": id,
                    "eq": st.settings.eq,
                    "revision": st.settings.revision,
                })))
            }

            IpcRequest::ResetEq => {
                let mut st = lock_unpoisoned(&self.inner);
                reset_eq(&mut st.settings);
                let paths = st.library.paths().clone();
                save_app_settings(&paths, &mut st.settings)?;
                self.apply_eq_to_audio(&st.settings);
                Ok(IpcData::Json(Self::eq_payload(&st.settings)))
            }

            IpcRequest::GetTransition => {
                let st = lock_unpoisoned(&self.inner);
                Ok(IpcData::Json(json!({
                    "crossfade_secs": extract_crossfade_secs(&st.settings),
                    "max_secs": CROSSFADE_MAX_SECS,
                })))
            }

            IpcRequest::SetTransition { crossfade_secs } => {
                let clamped = settings::clamp_crossfade(crossfade_secs);
                let _ = self.audio_tx.send(AudioCmd::SetTransition(clamped));
                let mut st = lock_unpoisoned(&self.inner);
                if (extract_crossfade_secs(&st.settings) - clamped).abs() > 0.01 {
                    if let Some(obj) = st.settings.appearance.as_object_mut() {
                        obj.insert("crossfadeSecs".into(), json!(clamped));
                    }
                    let paths = st.library.paths().clone();
                    let _ = save_app_settings(&paths, &mut st.settings);
                }
                Ok(IpcData::Message(if clamped > CROSSFADE_MIN_ACTIVE_SECS {
                    format!("Audio crossfade set to {:.1}s", clamped)
                } else {
                    "Audio crossfade off".into()
                }))
            }

            IpcRequest::SetQueue {
                track_ids,
                start_id,
                label,
                shuffle,
            } => {
                self.radio.clear(None, &self.fm_tuner);
                let target = {
                    let mut st = lock_unpoisoned(&self.inner);
                    if let Some(s) = shuffle {
                        st.queue.set_shuffle(s);
                    }
                    let valid: Vec<String> = track_ids
                        .into_iter()
                        .filter(|id| st.library.has_track(id))
                        .collect();
                    let chosen = st.queue.set_queue(valid, start_id.as_deref(), label);
                    chosen.and_then(|id| {
                        let track = st.library.track_by_id(&id)?;
                        let abs = st.library.resolve_track_path(track).ok()?;
                        Some((abs, st.volume))
                    })
                };
                if let Some((path, vol)) = target {
                    self.start_loaded_track(path, vol)?;
                }
                self.notify_change();
                Ok(IpcData::Status(self.status()))
            }

            IpcRequest::JumpQueue { index } => {
                self.radio.clear(None, &self.fm_tuner);
                let target = {
                    let mut st = lock_unpoisoned(&self.inner);
                    st.queue.jump_to(index).and_then(|id| {
                        let track = st.library.track_by_id(&id)?;
                        let abs = st.library.resolve_track_path(track).ok()?;
                        Some((abs, st.volume))
                    })
                };
                if let Some((path, vol)) = target {
                    self.start_loaded_track(path, vol)?;
                }
                self.notify_change();
                Ok(IpcData::Status(self.status()))
            }

            IpcRequest::SetMode { shuffle, repeat } => {
                let pos = self.audio_position();
                {
                    let mut st = lock_unpoisoned(&self.inner);
                    if let Some(s) = shuffle {
                        st.queue.set_shuffle(s);
                    }
                    if let Some(r) = repeat {
                        st.queue.set_repeat(r);
                    }
                    Self::persist_locked(&st, pos);
                }
                self.notify_change();
                Ok(IpcData::Status(self.status()))
            }

            IpcRequest::QueueGet => {
                let st = lock_unpoisoned(&self.inner);
                let tracks: Vec<Track> = st
                    .queue
                    .queue_ids()
                    .iter()
                    .filter_map(|id| st.library.track_by_id(id).cloned())
                    .collect();
                Ok(IpcData::Queue {
                    current_index: st.queue.current_index(),
                    tracks,
                })
            }

            IpcRequest::QueueAdd {
                track_ids,
                play_next,
            } => {
                let mut st = lock_unpoisoned(&self.inner);
                for id in &track_ids {
                    if st.library.track_by_id(id).is_none() {
                        return Err(ZunoError::TrackNotFound(id.clone()));
                    }
                }
                st.queue.add_tracks(track_ids, play_next);
                let tracks: Vec<Track> = st
                    .queue
                    .queue_ids()
                    .iter()
                    .filter_map(|id| st.library.track_by_id(id).cloned())
                    .collect();
                Ok(IpcData::Queue {
                    current_index: st.queue.current_index(),
                    tracks,
                })
            }

            IpcRequest::QueueClear => {
                self.radio.clear(None, &self.fm_tuner);
                self.load_gen.fetch_add(1, Ordering::AcqRel);
                let _ = self.audio_tx.send(AudioCmd::Stop);
                let mut st = lock_unpoisoned(&self.inner);
                st.queue.clear();
                st.play_state = PlayState::Stopped;
                Self::persist_locked(&st, 0.0);
                let status = PlaybackStatus {
                    volume: st.volume,
                    shuffle: st.queue.shuffle(),
                    repeat: st.queue.repeat(),
                    ..PlaybackStatus::default()
                };
                drop(st);
                self.notify_change();
                Ok(IpcData::Status(status))
            }

            IpcRequest::GetSettings => {
                let st = lock_unpoisoned(&self.inner);
                Ok(IpcData::Json(json!({
                    "settings": st.settings,
                    "options": appearance_options_catalog(),
                })))
            }

            IpcRequest::UpdateSettings { patch } => {
                let mut st = lock_unpoisoned(&self.inner);
                apply_settings_patch(&mut st.settings, &patch);
                let paths = st.library.paths().clone();
                save_app_settings(&paths, &mut st.settings)?;
                self.apply_eq_to_audio(&st.settings);
                self.apply_crossfade_to_audio(&st.settings);
                let snap = st.settings.clone();
                drop(st);
                Ok(IpcData::Json(json!({
                    "settings": snap,
                })))
            }

            IpcRequest::ResetSettings { scope } => {
                let mut st = lock_unpoisoned(&self.inner);
                let reset_all = scope
                    .as_deref()
                    .map(|s| s.eq_ignore_ascii_case("all"))
                    .unwrap_or(false);
                if reset_all {
                    let rev = st.settings.revision;
                    st.settings = AppSettings {
                        revision: rev,
                        ..AppSettings::default()
                    };
                } else {
                    st.settings.appearance = settings::default_appearance_json();
                }
                let paths = st.library.paths().clone();
                save_app_settings(&paths, &mut st.settings)?;
                self.apply_eq_to_audio(&st.settings);
                self.apply_crossfade_to_audio(&st.settings);
                let snap = st.settings.clone();
                drop(st);
                Ok(IpcData::Json(json!({
                    "settings": snap,
                })))
            }

            IpcRequest::GetLastPlayed => {
                let st = lock_unpoisoned(&self.inner);
                let tracks: Vec<Track> = st
                    .settings
                    .last_played_ids
                    .iter()
                    .filter_map(|id| st.library.track_by_id(id).cloned())
                    .collect();
                Ok(IpcData::Json(json!({
                    "track_ids": st.settings.last_played_ids,
                    "tracks": tracks,
                })))
            }

            IpcRequest::ClearLastPlayed => {
                let mut st = lock_unpoisoned(&self.inner);
                st.settings.last_played_ids.clear();
                let paths = st.library.paths().clone();
                save_app_settings(&paths, &mut st.settings)?;
                Ok(IpcData::Message("Cleared last played history".into()))
            }

            IpcRequest::RadioStatus => Ok(IpcData::Json(json!({
                "active": self.radio.active(),
                "hardware": self.fm_tuner.hardware_status(),
            }))),

            IpcRequest::RadioGetStore => {
                let store = radio::load_radio_store(&self.paths());
                Ok(IpcData::Json(serde_json::to_value(&store)?))
            }

            IpcRequest::RadioSaveStore { store } => {
                let parsed: radio::RadioStoreData = serde_json::from_value(store)?;
                radio::save_radio_store(&self.paths(), &parsed)
                    .map_err(ZunoError::Ipc)?;
                self.radio_store_rev.fetch_add(1, Ordering::Relaxed);
                Ok(IpcData::Json(serde_json::to_value(&parsed)?))
            }

            IpcRequest::RadioManageBookmark { action, payload } => {
                let updated = radio::manage_radio_bookmark(&self.paths(), &action, &payload)
                    .map_err(ZunoError::Ipc)?;
                self.radio_store_rev.fetch_add(1, Ordering::Relaxed);
                Ok(IpcData::Json(serde_json::to_value(&updated)?))
            }

            IpcRequest::RadioDiscover {
                query,
                tag,
                country,
                language,
                limit,
            } => {
                let stations = radio::discover_online_stations(
                    query.as_deref(),
                    tag.as_deref(),
                    country.as_deref(),
                    language.as_deref(),
                    limit.unwrap_or(RADIO_DISCOVER_DEFAULT_LIMIT),
                )
                .map_err(ZunoError::Ipc)?;
                Ok(IpcData::Json(json!({
                    "total": stations.len(),
                    "stations": stations,
                })))
            }

            IpcRequest::RadioResolveUrl { url } => {
                let info = radio::resolve_stream_url(&url).map_err(ZunoError::Ipc)?;
                Ok(IpcData::Json(serde_json::to_value(&info)?))
            }

            IpcRequest::RadioPlayOnline {
                id,
                name,
                subtitle,
                url,
            } => {
                let svc = self.arc_self()?;
                let resolved_name = name
                    .as_deref()
                    .map(str::trim)
                    .filter(|s| !s.is_empty())
                    .map(str::to_string)
                    .unwrap_or_else(|| "Online FM".to_string());
                let resolved_sub = subtitle
                    .as_deref()
                    .map(str::trim)
                    .filter(|s| !s.is_empty())
                    .map(str::to_string)
                    .unwrap_or_else(|| "Online FM Stream".to_string());
                let resolved_id = id
                    .as_deref()
                    .map(str::trim)
                    .filter(|s| !s.is_empty())
                    .map(str::to_string)
                    .unwrap_or_else(|| {
                        format!(
                            "online-{}",
                            std::time::SystemTime::now()
                                .duration_since(std::time::UNIX_EPOCH)
                                .unwrap_or_default()
                                .as_millis()
                        )
                    });
                let active: ActiveRadioInfo = self
                    .radio
                    .play_online(
                        resolved_id,
                        resolved_name,
                        resolved_sub,
                        url,
                        &svc,
                        &self.fm_tuner,
                        self.change_callback(),
                    )
                    .map_err(ZunoError::Audio)?;
                Ok(IpcData::Json(serde_json::to_value(&active)?))
            }

            IpcRequest::RadioDisconnect => {
                let next = self.radio.disconnect(self, &self.fm_tuner);
                self.notify_change();
                Ok(IpcData::Json(json!({ "active": next })))
            }

            IpcRequest::RadioReconnect => {
                let svc = self.arc_self()?;
                let active = self.radio.active().ok_or_else(|| {
                    ZunoError::NotFound("no previous FM station to reconnect".into())
                })?;
                if matches!(
                    active.state,
                    RadioPlayState::Playing | RadioPlayState::Connecting
                ) {
                    self.radio.disconnect(self, &self.fm_tuner);
                }
                self.radio
                    .reconnect(&svc, &self.fm_tuner, self.change_callback());
                self.notify_change();
                Ok(IpcData::Json(json!({ "active": self.radio.active() })))
            }

            IpcRequest::RadioStop => {
                self.radio.clear(Some(self), &self.fm_tuner);
                self.notify_change();
                Ok(IpcData::Message("FM radio stopped".into()))
            }

            IpcRequest::FmHardwareStatus => {
                let hw = self.fm_tuner.hardware_status();
                Ok(IpcData::Json(serde_json::to_value(&hw)?))
            }

            IpcRequest::FmTune {
                freq_mhz,
                name,
                signal_id,
            } => {
                self.radio.clear(None, &self.fm_tuner);
                let hw = self
                    .fm_tuner
                    .tune(freq_mhz, self)
                    .map_err(ZunoError::Audio)?;
                let rounded = (freq_mhz * 10.0).round() / 10.0;
                let id = signal_id.unwrap_or_else(|| format!("freq-{rounded:.1}"));
                let display_name = name
                    .filter(|n| !n.trim().is_empty())
                    .unwrap_or_else(|| format!("{rounded:.1} MHz"));
                let subtitle = format!("{rounded:.1} MHz · Offline FM Signal");
                self.radio
                    .set_offline_active(id, display_name, subtitle, rounded);
                self.notify_change();
                Ok(IpcData::Json(json!({
                    "active": self.radio.active(),
                    "hardware": hw,
                })))
            }

            IpcRequest::FmStop => {
                self.radio.disconnect(self, &self.fm_tuner);
                self.notify_change();
                Ok(IpcData::Json(serde_json::to_value(
                    &self.fm_tuner.hardware_status(),
                )?))
            }

            IpcRequest::BackupData => {
                let report =
                    backup_user_data_core(&self.paths(), env!("CARGO_PKG_VERSION"), None)?;
                Ok(IpcData::Json(serde_json::to_value(&report)?))
            }

            IpcRequest::Navigate { .. } => Err(ZunoError::Ipc(
                "GUI navigation requires the Zuno desktop app to be running".into(),
            )),

            IpcRequest::WindowControl {
                action,
                zoom_percent,
            } => {
                // Allow persisting Display Zoom even when GUI is closed so it takes effect on next open.
                if action.eq_ignore_ascii_case("set_zoom") {
                    if let Some(pct) = zoom_percent {
                        let clamped = settings::clamp_ui_zoom(pct) as i64;
                        let mut st = lock_unpoisoned(&self.inner);
                        if let Some(obj) = st.settings.appearance.as_object_mut() {
                            obj.insert("uiZoom".into(), json!(clamped));
                        }
                        let paths = st.library.paths().clone();
                        save_app_settings(&paths, &mut st.settings)?;
                        return Ok(IpcData::Json(json!({
                            "zoom_percent": clamped,
                            "live_window": false,
                            "revision": st.settings.revision,
                        })));
                    }
                }
                Err(ZunoError::Ipc(
                    "window control requires the Zuno desktop app to be running".into(),
                ))
            }

            IpcRequest::CheckUpdate => Err(ZunoError::Ipc(
                "update check requires the Zuno desktop app to be running (or run `zuno-mcp doctor`)".into(),
            )),
        }
    }

    pub fn status(&self) -> PlaybackStatus {
        let pos = self.audio_position();
        let st = lock_unpoisoned(&self.inner);
        let current_track = st
            .queue
            .current_track_id()
            .and_then(|id| st.library.track_by_id(id).cloned());
        let duration_secs = current_track
            .as_ref()
            .map(|t| t.duration_secs as f64)
            .unwrap_or(0.0);
        PlaybackStatus {
            state: st.play_state,
            current_track,
            position_secs: if st.play_state == PlayState::Stopped {
                0.0
            } else {
                pos
            },
            duration_secs,
            volume: st.volume,
            shuffle: st.queue.shuffle(),
            repeat: st.queue.repeat(),
            queue_len: st.queue.len(),
            queue_index: st.queue.current_index(),
            active_playlist: st.queue.active_playlist().map(str::to_string),
        }
    }

    fn prune_queue_locked(st: &mut InnerState) {
        let lib = &st.library;
        st.queue.retain_existing(|id| lib.has_track(id));
    }

    fn playlist_detail_locked(st: &InnerState, playlist: Playlist) -> IpcData {
        let tracks = playlist
            .track_ids
            .iter()
            .filter_map(|id| st.library.track_by_id(id).cloned())
            .collect();
        IpcData::PlaylistDetail { playlist, tracks }
    }

    fn start_loaded_track(&self, path: PathBuf, volume: f32) -> Result<()> {
        self.load_audio(path, volume)?;
        let mut st = lock_unpoisoned(&self.inner);
        st.play_state = PlayState::Playing;
        if let Some(tid) = st.queue.current_track_id().map(str::to_string) {
            record_last_played(&mut st.settings, &tid);
            let paths = st.library.paths().clone();
            let _ = save_app_settings_quiet(&paths, &mut st.settings);
        }
        Self::persist_locked(&st, 0.0);
        Ok(())
    }

    fn prepare_play(&self, target: PlayTarget) -> Result<(PathBuf, f32)> {
        let mut st = lock_unpoisoned(&self.inner);

        let target_id = match target {
            PlayTarget::Playlist { name, start_id } => {
                let (pl, tracks) = st.library.playlist_tracks(&name)?;
                if tracks.is_empty() {
                    return Err(ZunoError::TrackNotFound(format!(
                        "playlist '{}' has no playable tracks",
                        pl.title
                    )));
                }
                let ids: Vec<String> = tracks.into_iter().map(|t| t.id).collect();
                st.queue.set_queue(ids, start_id.as_deref(), Some(pl.slug))
            }
            PlayTarget::Folder { name, start_id } => {
                let tracks = st.library.tracks_in_folder(&name);
                if tracks.is_empty() {
                    return Err(ZunoError::TrackNotFound(format!(
                        "no tracks in folder '{name}'"
                    )));
                }
                let ids: Vec<String> = tracks.into_iter().map(|t| t.id.clone()).collect();
                st.queue.set_queue(ids, start_id.as_deref(), None)
            }
            PlayTarget::TrackId(id) => {
                if !st.library.has_track(&id) {
                    return Err(ZunoError::TrackNotFound(id));
                }
                let all_ids: Vec<String> = st.library.tracks().iter().map(|t| t.id.clone()).collect();
                st.queue.set_queue(all_ids, Some(&id), None)
            }
            PlayTarget::Query(q) => {
                let matches: Vec<String> = st
                    .library
                    .search(&q, 50)
                    .into_iter()
                    .map(|t| t.id.clone())
                    .collect();
                let first = matches
                    .first()
                    .cloned()
                    .ok_or_else(|| ZunoError::TrackNotFound(format!("no track matching '{q}'")))?;
                st.queue.set_queue(matches, Some(&first), None)
            }
            PlayTarget::CurrentOrAll => {
                if let Some(cur) = st.queue.current_track_id().map(str::to_string) {
                    Some(cur)
                } else {
                    let all_ids: Vec<String> =
                        st.library.tracks().iter().map(|t| t.id.clone()).collect();
                    st.queue.set_queue(all_ids, None, None)
                }
            }
        };

        let tid = target_id.ok_or_else(|| {
            ZunoError::TrackNotFound(format!(
                "library is empty (add songs to {} or link a folder)",
                st.library.paths().songs_dir().display()
            ))
        })?;
        let track = st
            .library
            .track_by_id(&tid)
            .ok_or_else(|| ZunoError::TrackNotFound(tid))?;
        let abs = st.library.resolve_track_path(track)?;
        Ok((abs, st.volume))
    }

    fn prepare_current_or_first(&self) -> Result<(PathBuf, f32)> {
        self.prepare_play(PlayTarget::CurrentOrAll)
    }

    fn advance_internal(&self, auto_advance: bool) -> Option<(PathBuf, f32)> {
        let mut st = lock_unpoisoned(&self.inner);
        let tid = st.queue.next(auto_advance)?;
        let track = st.library.track_by_id(&tid)?;
        let abs = st.library.resolve_track_path(track).ok()?;
        Some((abs, st.volume))
    }

    fn load_audio(&self, path: PathBuf, volume: f32) -> Result<()> {
        let load_gen = self.load_gen.fetch_add(1, Ordering::AcqRel) + 1;
        let (reply_tx, reply_rx) = mpsc::channel();
        self.audio_tx
            .send(AudioCmd::LoadAndPlay {
                load_gen,
                path,
                volume,
                reply: reply_tx,
            })
            .map_err(|_| ZunoError::Audio("audio thread stopped".into()))?;
        reply_rx
            .recv()
            .map_err(|_| ZunoError::Audio("audio thread failed to respond".into()))?
    }

    /// Lock-free O(1) playback position read (no channel allocation or audio-thread round-trip).
    fn audio_position(&self) -> f64 {
        f64::from_bits(self.position_bits.load(Ordering::Relaxed))
    }

    fn persist_locked(st: &InnerState, position_secs: f64) {
        let persisted = PersistedState {
            last_track_id: st.queue.current_track_id().map(str::to_string),
            position_secs,
            volume: st.volume,
            shuffle: st.queue.shuffle(),
            repeat: st.queue.repeat(),
            queue_track_ids: st.queue.queue_ids().to_vec(),
            active_playlist: st.queue.active_playlist().map(str::to_string),
        };
        let _ = st.library.save_state(&persisted);
    }
}

impl Drop for ZunoService {
    fn drop(&mut self) {
        let _ = self.audio_tx.send(AudioCmd::Shutdown);
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::engine::MockAudioEngine;
    use std::fs;
    use tempfile::tempdir;

    #[test]
    fn end_to_end_playback_playlists_and_queue_flow() {
        let tmp = tempdir().unwrap();
        let paths = ZunoPaths::new(tmp.path());
        paths.ensure_dirs().unwrap();

        fs::write(paths.songs_dir().join("night.mp3"), b"audio-night-001").unwrap();
        fs::create_dir_all(paths.songs_dir().join("focus")).unwrap();
        fs::write(paths.songs_dir().join("focus/rain.flac"), b"audio-rain-002").unwrap();

        let svc = ZunoService::open_with_engine(paths, MockAudioEngine::new()).unwrap();

        // List songs
        let IpcResponse::Ok {
            data: IpcData::Tracks { total, tracks },
        } = svc.handle_request(IpcRequest::ListSongs {
            folder: None,
            limit: None,
            offset: None,
            sort_by: None,
            sort_dir: None,
        })
        else {
            panic!("expected tracks");
        };
        assert_eq!(total, 2);
        let ids: Vec<String> = tracks.iter().map(|t| t.id.clone()).collect();

        // Create playlist pointing to songs without copying audio
        let IpcResponse::Ok {
            data: IpcData::PlaylistDetail { playlist, tracks: pl_tracks },
        } = svc.handle_request(IpcRequest::CreatePlaylist {
            name: "Fav".into(),
            track_ids: ids.clone(),
        })
        else {
            panic!("expected playlist detail");
        };
        assert_eq!(playlist.slug, "fav");
        assert_eq!(pl_tracks.len(), 2);

        // Play playlist
        let IpcResponse::Ok {
            data: IpcData::Status(st),
        } = svc.handle_request(IpcRequest::Play {
            track_id: None,
            query: None,
            folder: None,
            playlist: Some("fav".into()),
        })
        else {
            panic!("expected playing status");
        };
        assert_eq!(st.state, PlayState::Playing);
        assert_eq!(st.active_playlist.as_deref(), Some("fav"));
        assert_eq!(st.queue_len, 2);

        // Next track & set volume
        let IpcResponse::Ok {
            data: IpcData::Status(st2),
        } = svc.handle_request(IpcRequest::Next)
        else {
            panic!("expected next status");
        };
        assert_eq!(st2.queue_index, Some(1));

        let IpcResponse::Ok {
            data: IpcData::Status(st3),
        } = svc.handle_request(IpcRequest::SetVolume { volume: 0.42 })
        else {
            panic!("expected volume status");
        };
        assert!((st3.volume - 0.42).abs() < 0.001);
    }

    /// Mock engine that finishes a track on demand to test real-time auto-advance under
    /// continuous `status()` / `GetPosition` polling (which previously starved `recv_timeout`).
    struct FinishingMockEngine {
        finished: Arc<std::sync::atomic::AtomicBool>,
        load_count: Arc<std::sync::atomic::AtomicUsize>,
    }

    impl AudioEngine for FinishingMockEngine {
        fn load_and_play(&mut self, _path: &std::path::Path, _volume: f32) -> Result<()> {
            self.finished.store(false, std::sync::atomic::Ordering::SeqCst);
            self.load_count.fetch_add(1, std::sync::atomic::Ordering::SeqCst);
            Ok(())
        }
        fn pause(&mut self) {}
        fn resume(&mut self) {}
        fn stop(&mut self) {}
        fn seek(&mut self, _pos: Duration) -> Result<()> {
            Ok(())
        }
        fn set_volume(&mut self, _volume: f32) {}
        fn position_secs(&self) -> f64 {
            0.0
        }
        fn is_finished(&self) -> bool {
            self.finished.load(std::sync::atomic::Ordering::SeqCst)
        }
    }

    #[test]
    fn auto_advances_in_order_and_shuffle_under_frequent_status_polling() {
        let tmp = tempdir().unwrap();
        let paths = ZunoPaths::new(tmp.path());
        paths.ensure_dirs().unwrap();
        fs::write(paths.songs_dir().join("01.mp3"), b"track-one").unwrap();
        fs::write(paths.songs_dir().join("02.mp3"), b"track-two").unwrap();
        fs::write(paths.songs_dir().join("03.mp3"), b"track-three").unwrap();

        let finished = Arc::new(std::sync::atomic::AtomicBool::new(false));
        let load_count = Arc::new(std::sync::atomic::AtomicUsize::new(0));
        let engine = FinishingMockEngine {
            finished: Arc::clone(&finished),
            load_count: Arc::clone(&load_count),
        };
        let svc = ZunoService::open_with_engine(paths, engine).unwrap();

        let IpcResponse::Ok {
            data: IpcData::Tracks { tracks, .. },
        } = svc.handle_request(IpcRequest::ListSongs {
            folder: None,
            limit: None,
            offset: None,
            sort_by: None,
            sort_dir: None,
        })
        else {
            panic!("expected tracks");
        };
        let ids: Vec<String> = tracks.iter().map(|t| t.id.clone()).collect();

        // 1. Start in ordered mode, simulate track finishing while polling status() every 20ms
        let _ = svc.handle_request(IpcRequest::SetQueue {
            track_ids: ids.clone(),
            start_id: Some(ids[0].clone()),
            label: Some("Songs".into()),
            shuffle: Some(false),
        });
        assert_eq!(svc.status().queue_index, Some(0));

        finished.store(true, std::sync::atomic::Ordering::SeqCst);
        let deadline = Instant::now() + Duration::from_secs(2);
        while Instant::now() < deadline {
            if svc.status().queue_index == Some(1) {
                break;
            }
            std::thread::sleep(Duration::from_millis(20));
        }
        assert_eq!(
            svc.status().queue_index,
            Some(1),
            "ordered auto-advance must not be starved by frequent status() polling"
        );
        assert_eq!(svc.status().state, PlayState::Playing);

        // 2. Enable shuffle, simulate track finishing while polling status() every 20ms
        let _ = svc.handle_request(IpcRequest::SetMode {
            shuffle: Some(true),
            repeat: None,
        });
        assert_eq!(svc.status().queue_index, Some(0));

        finished.store(true, std::sync::atomic::Ordering::SeqCst);
        let deadline = Instant::now() + Duration::from_secs(2);
        while Instant::now() < deadline {
            if svc.status().queue_index == Some(1) {
                break;
            }
            std::thread::sleep(Duration::from_millis(20));
        }
        assert_eq!(
            svc.status().queue_index,
            Some(1),
            "shuffled auto-advance must not be starved by frequent status() polling"
        );
        assert_eq!(svc.status().state, PlayState::Playing);
    }

    /// Simulates a decoder panic (such as Rodio 0.20's Symphonia `SeekError` unreachable! bug)
    /// and verifies `zuno-audio` catches the panic cleanly, stays alive, and plays subsequent tracks.
    struct PanickingMockEngine {
        panic_on_filename: String,
        loads: Arc<std::sync::atomic::AtomicUsize>,
    }

    impl AudioEngine for PanickingMockEngine {
        fn load_and_play(&mut self, path: &std::path::Path, _volume: f32) -> Result<()> {
            if path
                .file_name()
                .and_then(|n| n.to_str())
                .is_some_and(|n| n == self.panic_on_filename)
            {
                unreachable!("Seek errors should not occur during initialization");
            }
            self.loads.fetch_add(1, std::sync::atomic::Ordering::SeqCst);
            Ok(())
        }
        fn pause(&mut self) {}
        fn resume(&mut self) {}
        fn stop(&mut self) {}
        fn seek(&mut self, _pos: Duration) -> Result<()> {
            Ok(())
        }
        fn set_volume(&mut self, _volume: f32) {}
        fn position_secs(&self) -> f64 {
            0.0
        }
        fn is_finished(&self) -> bool {
            false
        }
    }

    #[test]
    fn audio_thread_survives_engine_panic_and_continues_playing_next_track() {
        let tmp = tempdir().unwrap();
        let paths = ZunoPaths::new(tmp.path());
        paths.ensure_dirs().unwrap();
        fs::write(paths.songs_dir().join("01-bad.m4a"), b"bad-m4a").unwrap();
        fs::write(paths.songs_dir().join("02-good.mp3"), b"good-mp3").unwrap();

        let loads = Arc::new(std::sync::atomic::AtomicUsize::new(0));
        let engine = PanickingMockEngine {
            panic_on_filename: "01-bad.m4a".into(),
            loads: Arc::clone(&loads),
        };
        let svc = ZunoService::open_with_engine(paths, engine).unwrap();

        let IpcResponse::Ok {
            data: IpcData::Tracks { tracks, .. },
        } = svc.handle_request(IpcRequest::ListSongs {
            folder: None,
            limit: None,
            offset: None,
            sort_by: None,
            sort_dir: None,
        })
        else {
            panic!("expected tracks");
        };
        let ids: Vec<String> = tracks.iter().map(|t| t.id.clone()).collect();

        // Attempting to play the panicking track must return IpcResponse::Err, NOT crash the process.
        let bad_resp = svc.handle_request(IpcRequest::SetQueue {
            track_ids: ids.clone(),
            start_id: Some(ids[0].clone()),
            label: Some("Songs".into()),
            shuffle: Some(false),
        });
        assert!(
            matches!(bad_resp, IpcResponse::Err { .. }),
            "expected recovered Err response, got {bad_resp:?}"
        );

        // Immediately skipping to the next valid track must succeed because `zuno-audio` stayed alive!
        let next_resp = svc.handle_request(IpcRequest::Next);
        assert!(
            matches!(
                next_resp,
                IpcResponse::Ok {
                    data: IpcData::Status(ref st)
                } if st.state == PlayState::Playing && st.queue_index == Some(1)
            ),
            "expected healthy Next playback after recovered panic, got {next_resp:?}"
        );
        assert_eq!(loads.load(std::sync::atomic::Ordering::SeqCst), 1);
    }

    #[test]
    fn rapid_concurrent_double_click_next_and_toggle_never_deadlocks_or_crashes() {
        let tmp = tempdir().unwrap();
        let paths = ZunoPaths::new(tmp.path());
        paths.ensure_dirs().unwrap();
        for i in 1..=8 {
            fs::write(
                paths.songs_dir().join(format!("{i:02}-track.mp3")),
                format!("audio-payload-{i}"),
            )
            .unwrap();
        }

        let svc = ZunoService::open_with_engine(paths, MockAudioEngine::new()).unwrap();
        let IpcResponse::Ok {
            data: IpcData::Tracks { tracks, .. },
        } = svc.handle_request(IpcRequest::ListSongs {
            folder: None,
            limit: None,
            offset: None,
            sort_by: None,
            sort_dir: None,
        })
        else {
            panic!("expected tracks");
        };
        let ids: Vec<String> = tracks.iter().map(|t| t.id.clone()).collect();

        // Start playback then hammer the service concurrently from 4 threads (double-clicks, rapid Next/Prev/Toggle/Seek)
        let _ = svc.handle_request(IpcRequest::SetQueue {
            track_ids: ids.clone(),
            start_id: Some(ids[0].clone()),
            label: Some("Songs".into()),
            shuffle: Some(false),
        });

        let mut handles = Vec::new();
        for worker in 0..4 {
            let s = Arc::clone(&svc);
            let worker_ids = ids.clone();
            handles.push(std::thread::spawn(move || {
                for step in 0..25 {
                    match (worker + step) % 6 {
                        0 => {
                            let _ = s.handle_request(IpcRequest::Next);
                        }
                        1 => {
                            let _ = s.handle_request(IpcRequest::TogglePause);
                        }
                        2 => {
                            let _ = s.handle_request(IpcRequest::Previous);
                        }
                        3 => {
                            let _ = s.handle_request(IpcRequest::SetQueue {
                                track_ids: worker_ids.clone(),
                                start_id: Some(worker_ids[step % worker_ids.len()].clone()),
                                label: Some("Songs".into()),
                                shuffle: None,
                            });
                        }
                        4 => {
                            let _ = s.handle_request(IpcRequest::Seek {
                                position_secs: (step as f64) * 0.5,
                            });
                        }
                        _ => {
                            let _ = s.handle_request(IpcRequest::GetStatus);
                        }
                    }
                }
            }));
        }
        for h in handles {
            h.join().expect("worker thread must never panic");
        }

        // Service must still answer cleanly and play track 0 without error after stress storm.
        let final_resp = svc.handle_request(IpcRequest::SetQueue {
            track_ids: ids.clone(),
            start_id: Some(ids[0].clone()),
            label: Some("Songs".into()),
            shuffle: Some(false),
        });
        assert!(matches!(
            final_resp,
            IpcResponse::Ok {
                data: IpcData::Status(ref st)
            } if st.state == PlayState::Playing
        ));
    }
}
