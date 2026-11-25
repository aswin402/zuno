use crate::engine::{AudioEngine, CROSSFADE_MAX_SECS, CROSSFADE_MIN_ACTIVE_SECS, RodioEngine};
use crate::eq::{EQ_BANDS, EQ_MAX_DB, EQ_MIN_DB, EqConfig};
use crate::spectrum::{AudioLevels, SharedSpectrum};
use std::io::Read;
use std::path::PathBuf;
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::{Arc, Mutex, mpsc};
use std::time::{Duration, Instant};
use zuno_core::ipc::{IpcData, IpcRequest, IpcResponse};
use zuno_core::{
    CoverArt, Library, PersistedState, PlayState, PlaybackStatus, Playlist, QueueManager,
    ROOT_FOLDER_LABEL, Result, Track, ZunoError, ZunoPaths,
};

const TICK_IDLE_MS: u64 = 200;
const TICK_FADING_MS: u64 = 25;
const MAX_AUTO_ADVANCE_SKIPS: usize = 5;

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
}

/// Thread-safe unified Zuno music engine shared by Tauri GUI, CLI, Daemon, and MCP server.
pub struct ZunoService {
    inner: Arc<Mutex<InnerState>>,
    audio_tx: mpsc::Sender<AudioCmd>,
    position_bits: Arc<AtomicU64>,
    spectrum: Option<Arc<SharedSpectrum>>,
}

impl ZunoService {
    /// Start Zuno using the real Rodio/Symphonia desktop audio backend.
    pub fn open_rodio(paths: ZunoPaths) -> Result<Arc<Self>> {
        Self::open_with_engine(paths, RodioEngine::new())
    }

    /// Start Zuno with a custom `AudioEngine` (e.g. `MockAudioEngine` in tests).
    pub fn open_with_engine<E: AudioEngine>(paths: ZunoPaths, mut engine: E) -> Result<Arc<Self>> {
        let library = Library::open(paths)?;
        let persisted = library.load_state();

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
        }));

        let (tx, rx) = mpsc::channel::<AudioCmd>();
        let position_bits = Arc::new(AtomicU64::new(0.0f64.to_bits()));
        let spectrum = engine.spectrum();
        let service = Arc::new(Self {
            inner: Arc::clone(&inner),
            audio_tx: tx.clone(),
            position_bits: Arc::clone(&position_bits),
            spectrum,
        });

        let weak_service = Arc::downgrade(&service);
        let thread_inner = Arc::clone(&inner);
        let thread_pos = Arc::clone(&position_bits);

        // Single dedicated audio thread: owns OutputStream/Sink safely.
        // Blocks with zero CPU wakeups while idle/paused, ticks at 25ms during active crossfades,
        // and uses an absolute `next_tick` deadline (200ms) while playing so frequent status
        // queries never block or starve auto-advance or crossfade envelopes.
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
                            path,
                            volume,
                            reply,
                        }) => {
                            let res = engine.load_and_play(&path, volume);
                            mode = if res.is_ok() {
                                PlaybackLoopMode::PlayingFile
                            } else {
                                PlaybackLoopMode::Idle
                            };
                            publish_pos(0.0);
                            fading = engine.tick_transition();
                            next_tick = Instant::now()
                                + Duration::from_millis(if fading { TICK_FADING_MS } else { TICK_IDLE_MS });
                            let _ = reply.send(res);
                        }
                        Ok(AudioCmd::LoadPcmStream {
                            reader,
                            sample_rate,
                            channels,
                            volume,
                            reply,
                        }) => {
                            let res = engine.load_pcm_stream(reader, sample_rate, channels, volume);
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
                            publish_pos(engine.position_secs());
                            engine.pause();
                            if mode == PlaybackLoopMode::PlayingFile {
                                mode = PlaybackLoopMode::Idle;
                            }
                            fading = false;
                        }
                        Ok(AudioCmd::Resume) => {
                            engine.resume();
                            if mode != PlaybackLoopMode::LivePcm {
                                mode = PlaybackLoopMode::PlayingFile;
                            }
                            next_tick = Instant::now() + Duration::from_millis(TICK_IDLE_MS);
                        }
                        Ok(AudioCmd::Stop) => {
                            engine.stop();
                            mode = PlaybackLoopMode::Idle;
                            publish_pos(0.0);
                            fading = false;
                        }
                        Ok(AudioCmd::Seek { pos, reply }) => {
                            let res = engine.seek(pos);
                            if res.is_ok() {
                                publish_pos(pos.as_secs_f64());
                            }
                            let _ = reply.send(res);
                        }
                        Ok(AudioCmd::SetVolume(v)) => engine.set_volume(v),
                        Ok(AudioCmd::SetEq(eq)) => engine.set_eq(eq),
                        Ok(AudioCmd::SetTransition(secs)) => {
                            crossfade_secs = secs.clamp(0.0, CROSSFADE_MAX_SECS);
                            engine.set_crossfade(crossfade_secs);
                        }
                        Ok(AudioCmd::Shutdown) | Err(mpsc::RecvTimeoutError::Disconnected) => {
                            engine.stop();
                            break;
                        }
                        Err(mpsc::RecvTimeoutError::Timeout) => {
                            timed_out = true;
                        }
                    }

                    let active = mode == PlaybackLoopMode::PlayingFile;
                    if (active || fading) && (timed_out || Instant::now() >= next_tick) {
                        fading = engine.tick_transition();
                        let pos = engine.position_secs();
                        if active {
                            publish_pos(pos);
                        }

                        // Check if current track is approaching end for early overlapping crossfade,
                        // or has finished playing normally.
                        let early_crossfade = if crossfade_secs > CROSSFADE_MIN_ACTIVE_SECS && !fading && active {
                            let cur_dur = thread_inner
                                .lock()
                                .ok()
                                .and_then(|s| {
                                    if s.play_state != PlayState::Playing {
                                        return None;
                                    }
                                    let tid = s.queue.current_track_id()?;
                                    Some(s.library.track_by_id(tid)?.duration_secs as f64)
                                })
                                .unwrap_or(0.0);
                            cur_dur > (crossfade_secs as f64) + 1.5
                                && pos >= cur_dur - (crossfade_secs as f64)
                        } else {
                            false
                        };

                        if active && (early_crossfade || engine.is_finished()) {
                            let should_advance = thread_inner
                                .lock()
                                .map(|s| s.play_state == PlayState::Playing)
                                .unwrap_or(false);
                            if should_advance {
                                if let Some(svc) = weak_service.upgrade() {
                                    let mut advanced = false;
                                    let mut hit_end = false;
                                    for _ in 0..MAX_AUTO_ADVANCE_SKIPS {
                                        match svc.advance_internal(true) {
                                            Some((path, vol)) => {
                                                if engine.load_and_play(&path, vol).is_ok() {
                                                    publish_pos(0.0);
                                                    fading = engine.tick_transition();
                                                    advanced = true;
                                                    if let Ok(st) = thread_inner.lock() {
                                                        Self::persist_locked(&st, 0.0);
                                                    }
                                                    break;
                                                }
                                            }
                                            None => {
                                                hit_end = true;
                                                break;
                                            }
                                        }
                                    }
                                    if !advanced && (!hit_end || engine.is_finished()) {
                                        // If early crossfade fired on the last track with repeat off,
                                        // let the final track finish cleanly instead of cutting it off early!
                                        engine.stop();
                                        mode = PlaybackLoopMode::Idle;
                                        publish_pos(0.0);
                                        fading = false;
                                        if let Ok(mut st) = thread_inner.lock() {
                                            st.play_state = PlayState::Stopped;
                                            Self::persist_locked(&st, 0.0);
                                        }
                                    }
                                }
                            } else if engine.is_finished() {
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

        Ok(service)
    }

    pub fn paths(&self) -> ZunoPaths {
        self.inner.lock().unwrap().library.paths().clone()
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
            let st = self.inner.lock().unwrap();
            let track = st.library.track_by_id(track_id)?;
            st.library.resolve_track_path(track).ok()?
        };
        zuno_core::scanner::extract_cover_art(&abs)
    }

    pub fn resolve_track_file(&self, track_id: &str) -> Option<(PathBuf, String)> {
        let st = self.inner.lock().unwrap();
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
            let mut st = self.inner.lock().unwrap();
            if st.play_state == PlayState::Playing {
                st.play_state = PlayState::Paused;
            }
            st.volume
        };
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
        let _ = self.audio_tx.send(AudioCmd::Stop);
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

    fn dispatch(&self, req: IpcRequest) -> Result<IpcData> {
        match req {
            IpcRequest::Ping => Ok(IpcData::Pong {
                version: env!("CARGO_PKG_VERSION").to_string(),
            }),

            IpcRequest::Rescan => {
                let mut st = self.inner.lock().unwrap();
                st.library.rescan()?;
                Self::prune_queue_locked(&mut st);
                let count = st.library.tracks().len();
                let pl_count = st.library.playlists().len();
                Ok(IpcData::Message(format!(
                    "Indexed {count} tracks and {pl_count} playlists"
                )))
            }

            IpcRequest::GetStatus => Ok(IpcData::Status(self.status())),

            IpcRequest::ListSongs {
                folder,
                limit,
                offset,
            } => {
                let st = self.inner.lock().unwrap();
                let refs: Vec<&Track> = match folder.as_deref().map(str::trim) {
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
                let st = self.inner.lock().unwrap();
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
                let st = self.inner.lock().unwrap();
                Ok(IpcData::Folders(st.library.folders()))
            }

            IpcRequest::ListSources => {
                let st = self.inner.lock().unwrap();
                Ok(IpcData::Sources(st.library.sources()))
            }

            IpcRequest::AddSource { path } => {
                let mut st = self.inner.lock().unwrap();
                let sources = st.library.add_source(&path)?;
                Ok(IpcData::Sources(sources))
            }

            IpcRequest::RemoveSource { path } => {
                let mut st = self.inner.lock().unwrap();
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
                Ok(IpcData::Sources(sources))
            }

            IpcRequest::ListPlaylists => {
                let st = self.inner.lock().unwrap();
                Ok(IpcData::Playlists(st.library.playlists().to_vec()))
            }

            IpcRequest::GetPlaylist { name } => {
                let st = self.inner.lock().unwrap();
                let (playlist, tracks) = st.library.playlist_tracks(&name)?;
                Ok(IpcData::PlaylistDetail { playlist, tracks })
            }

            IpcRequest::CreatePlaylist { name, track_ids } => {
                let mut st = self.inner.lock().unwrap();
                let playlist = st.library.create_playlist(&name, &track_ids)?;
                Ok(Self::playlist_detail_locked(&st, playlist))
            }

            IpcRequest::DeletePlaylist { name } => {
                let mut st = self.inner.lock().unwrap();
                let slug = st.library.delete_playlist(&name)?;
                Ok(IpcData::Message(format!("Deleted playlist '{slug}'")))
            }

            IpcRequest::AddToPlaylist { name, track_ids } => {
                let mut st = self.inner.lock().unwrap();
                let playlist = st.library.add_to_playlist(&name, &track_ids)?;
                Ok(Self::playlist_detail_locked(&st, playlist))
            }

            IpcRequest::RemoveFromPlaylist { name, track_id } => {
                let mut st = self.inner.lock().unwrap();
                let playlist = st.library.remove_from_playlist(&name, &track_id)?;
                Ok(Self::playlist_detail_locked(&st, playlist))
            }

            IpcRequest::DeleteSong { track_id } => {
                let mut st = self.inner.lock().unwrap();
                let was_current = st.queue.current_track_id() == Some(track_id.as_str());
                let title = st.library.delete_song(&track_id)?;
                Self::prune_queue_locked(&mut st);
                if was_current {
                    st.play_state = PlayState::Stopped;
                    let _ = self.audio_tx.send(AudioCmd::Stop);
                }
                Ok(IpcData::Message(format!("Deleted {title}")))
            }

            IpcRequest::Play {
                track_id,
                query,
                folder,
                playlist,
            } => {
                let target = PlayTarget::from_opts(track_id, query, folder, playlist);
                let (abs_path, volume) = self.prepare_play(target)?;
                self.start_loaded_track(abs_path, volume)?;
                Ok(IpcData::Status(self.status()))
            }

            IpcRequest::Pause => {
                let _ = self.audio_tx.send(AudioCmd::Pause);
                let pos = self.audio_position();
                {
                    let mut st = self.inner.lock().unwrap();
                    if st.play_state == PlayState::Playing {
                        st.play_state = PlayState::Paused;
                        Self::persist_locked(&st, pos);
                    }
                }
                Ok(IpcData::Status(self.status()))
            }

            IpcRequest::Resume => {
                let needs_load = {
                    let st = self.inner.lock().unwrap();
                    st.play_state == PlayState::Stopped
                };
                if needs_load {
                    let (abs_path, volume) = self.prepare_current_or_first()?;
                    self.load_audio(abs_path, volume)?;
                } else {
                    let _ = self.audio_tx.send(AudioCmd::Resume);
                }
                {
                    let mut st = self.inner.lock().unwrap();
                    if st.queue.current_track_id().is_some() {
                        st.play_state = PlayState::Playing;
                    }
                }
                Ok(IpcData::Status(self.status()))
            }

            IpcRequest::TogglePause => {
                let state = self.inner.lock().unwrap().play_state;
                match state {
                    PlayState::Playing => self.dispatch(IpcRequest::Pause),
                    PlayState::Paused | PlayState::Stopped => self.dispatch(IpcRequest::Resume),
                }
            }

            IpcRequest::Stop => {
                let _ = self.audio_tx.send(AudioCmd::Stop);
                {
                    let mut st = self.inner.lock().unwrap();
                    st.play_state = PlayState::Stopped;
                    Self::persist_locked(&st, 0.0);
                }
                Ok(IpcData::Status(self.status()))
            }

            IpcRequest::Next => {
                if let Some((path, vol)) = self.advance_internal(false) {
                    self.start_loaded_track(path, vol)?;
                } else {
                    let _ = self.audio_tx.send(AudioCmd::Stop);
                    let mut st = self.inner.lock().unwrap();
                    st.play_state = PlayState::Stopped;
                }
                Ok(IpcData::Status(self.status()))
            }

            IpcRequest::Previous => {
                let next_pair = {
                    let mut st = self.inner.lock().unwrap();
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
                    let mut st = self.inner.lock().unwrap();
                    st.volume = v;
                    Self::persist_locked(&st, pos);
                }
                Ok(IpcData::Status(self.status()))
            }

            IpcRequest::SetEq {
                enabled,
                preamp,
                limiter,
                bands,
            } => {
                let mut arr = [0.0f32; EQ_BANDS];
                for (i, v) in bands.into_iter().take(EQ_BANDS).enumerate() {
                    arr[i] = v.clamp(EQ_MIN_DB, EQ_MAX_DB);
                }
                let _ = self.audio_tx.send(AudioCmd::SetEq(EqConfig {
                    enabled,
                    preamp_db: preamp.clamp(EQ_MIN_DB, EQ_MAX_DB),
                    limiter,
                    bands_db: arr,
                }));
                Ok(IpcData::Message("EQ updated".into()))
            }

            IpcRequest::SetTransition { crossfade_secs } => {
                let clamped = crossfade_secs.clamp(0.0, CROSSFADE_MAX_SECS);
                let _ = self.audio_tx.send(AudioCmd::SetTransition(clamped));
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
                let target = {
                    let mut st = self.inner.lock().unwrap();
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
                Ok(IpcData::Status(self.status()))
            }

            IpcRequest::JumpQueue { index } => {
                let target = {
                    let mut st = self.inner.lock().unwrap();
                    st.queue.jump_to(index).and_then(|id| {
                        let track = st.library.track_by_id(&id)?;
                        let abs = st.library.resolve_track_path(track).ok()?;
                        Some((abs, st.volume))
                    })
                };
                if let Some((path, vol)) = target {
                    self.start_loaded_track(path, vol)?;
                }
                Ok(IpcData::Status(self.status()))
            }

            IpcRequest::SetMode { shuffle, repeat } => {
                let pos = self.audio_position();
                {
                    let mut st = self.inner.lock().unwrap();
                    if let Some(s) = shuffle {
                        st.queue.set_shuffle(s);
                    }
                    if let Some(r) = repeat {
                        st.queue.set_repeat(r);
                    }
                    Self::persist_locked(&st, pos);
                }
                Ok(IpcData::Status(self.status()))
            }

            IpcRequest::QueueGet => {
                let st = self.inner.lock().unwrap();
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
                let mut st = self.inner.lock().unwrap();
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
                let _ = self.audio_tx.send(AudioCmd::Stop);
                let mut st = self.inner.lock().unwrap();
                st.queue.clear();
                st.play_state = PlayState::Stopped;
                Self::persist_locked(&st, 0.0);
                Ok(IpcData::Status(PlaybackStatus {
                    volume: st.volume,
                    shuffle: st.queue.shuffle(),
                    repeat: st.queue.repeat(),
                    ..PlaybackStatus::default()
                }))
            }
        }
    }

    pub fn status(&self) -> PlaybackStatus {
        let pos = self.audio_position();
        let st = self.inner.lock().unwrap();
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
        let mut st = self.inner.lock().unwrap();
        st.play_state = PlayState::Playing;
        Self::persist_locked(&st, 0.0);
        Ok(())
    }

    fn prepare_play(&self, target: PlayTarget) -> Result<(PathBuf, f32)> {
        let mut st = self.inner.lock().unwrap();

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
        let mut st = self.inner.lock().unwrap();
        let tid = st.queue.next(auto_advance)?;
        let track = st.library.track_by_id(&tid)?;
        let abs = st.library.resolve_track_path(track).ok()?;
        Some((abs, st.volume))
    }

    fn load_audio(&self, path: PathBuf, volume: f32) -> Result<()> {
        let (reply_tx, reply_rx) = mpsc::channel();
        self.audio_tx
            .send(AudioCmd::LoadAndPlay {
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
}
