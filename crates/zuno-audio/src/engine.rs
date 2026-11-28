use crate::decoder::SymphoniaFileSource;
use crate::eq::{EqConfig, EqSource, SharedEq};
use crate::spectrum::SharedSpectrum;
use rodio::cpal::traits::{DeviceTrait, HostTrait, StreamTrait};
use rodio::cpal::{self, Sample as CpalSample, SampleFormat, SampleRate, SupportedStreamConfig};
use rodio::dynamic_mixer::{self, DynamicMixerController};
use rodio::{Sink, Source};
use std::f32::consts::FRAC_PI_2;
use std::io::{BufReader, Read};
use std::path::{Path, PathBuf};
use std::sync::Arc;
use std::sync::atomic::{AtomicBool, AtomicU64, Ordering};
use std::time::{Duration, Instant};
use zuno_core::{DEFAULT_VOLUME, Result, ZunoError};

pub const CROSSFADE_MAX_SECS: f32 = 10.0;
pub const CROSSFADE_MIN_ACTIVE_SECS: f32 = 0.05;
pub const MIN_SAMPLE_RATE: u32 = 8_000;

/// If an active, unpaused output stream stops invoking its hardware callback for this long,
/// treat the OS audio stream as silently disconnected (common on Android Oboe/AAudio after
/// Bluetooth route switches, phone calls, or Doze power-save) and transparently reopen it.
const STREAM_STALL_TIMEOUT: Duration = Duration::from_millis(1_200);
const MAX_STREAM_RECOVERY_ATTEMPTS: u8 = 3;

/// Platform audio backend abstraction (allows hardware-free unit/integration tests).
pub trait AudioEngine: Send + 'static {
    fn load_and_play(&mut self, path: &Path, volume: f32) -> Result<()>;
    /// Play a live raw signed 16-bit little-endian PCM stream (used for hardware RTL-SDR FM audio).
    fn load_pcm_stream(
        &mut self,
        _reader: Box<dyn Read + Send>,
        _sample_rate: u32,
        _channels: u16,
        _volume: f32,
    ) -> Result<()> {
        Err(ZunoError::Audio(
            "live PCM stream unsupported on this backend".into(),
        ))
    }
    fn pause(&mut self);
    fn resume(&mut self);
    fn stop(&mut self);
    fn seek(&mut self, pos: Duration) -> Result<()>;
    fn set_volume(&mut self, volume: f32);
    fn set_eq(&mut self, _eq: EqConfig) {}
    fn set_crossfade(&mut self, _secs: f32) {}
    fn spectrum(&self) -> Option<Arc<SharedSpectrum>> {
        None
    }
    /// Advances any active fade-out / fade-in envelopes and checks stream health.
    /// Returns true while a crossfade transition is active.
    fn tick_transition(&mut self) -> bool {
        false
    }
    /// Returns true when the engine holds a loaded file track ready to play/resume.
    fn is_loaded(&self) -> bool {
        false
    }
    /// Verifies audio output health and recreates a disconnected/stalled OS audio stream if needed.
    fn recover_output(&mut self, _force: bool) -> bool {
        false
    }
    fn position_secs(&self) -> f64;
    fn is_finished(&self) -> bool;
}

/// Managed `cpal::Stream` + `rodio::DynamicMixer` with live error detection and callback heartbeat.
///
/// Unlike `rodio::OutputStream::try_default()` — which logs Oboe/AAudio errors to stderr and leaves
/// a permanently dead stream cached forever (causing silent playback and permanent `try_seek`
/// deadlocks on Android!) — `ManagedOutputStream`:
/// 1. Selects native 48 kHz / 44.1 kHz stereo configs on Android instead of cpal-oboe's 192 kHz max.
/// 2. Records OS audio stream errors immediately via `broken: Arc<AtomicBool>`.
/// 3. Tracks hardware audio callback liveness via `callback_ticks: Arc<AtomicU64>`.
/// 4. Supports explicit hardware pause/resume on Android so idle paused streams aren't killed by Doze.
struct ManagedOutputStream {
    mixer: Arc<DynamicMixerController<f32>>,
    stream: cpal::Stream,
    broken: Arc<AtomicBool>,
    callback_ticks: Arc<AtomicU64>,
    hw_paused: bool,
}

impl ManagedOutputStream {
    fn open_default() -> Result<Self> {
        let host = cpal::default_host();
        let default_device = host
            .default_output_device()
            .ok_or_else(|| ZunoError::Audio("no audio output device available".into()))?;

        match Self::open_on_device(&default_device) {
            Ok(stream) => Ok(stream),
            Err(original_err) => {
                if let Ok(devices) = host.output_devices() {
                    for dev in devices {
                        if let Ok(stream) = Self::open_on_device(&dev) {
                            return Ok(stream);
                        }
                    }
                }
                Err(original_err)
            }
        }
    }

    fn open_on_device(device: &cpal::Device) -> Result<Self> {
        let candidates = candidate_configs(device);
        let mut last_err = String::from("no supported output configuration found");

        for config in candidates {
            match Self::build_stream(device, config) {
                Ok(managed) => return Ok(managed),
                Err(e) => {
                    last_err = e;
                }
            }
        }

        Err(ZunoError::Audio(format!(
            "failed to open audio output: {last_err}"
        )))
    }

    fn build_stream(
        device: &cpal::Device,
        format: SupportedStreamConfig,
    ) -> std::result::Result<Self, String> {
        let (mixer_tx, mut mixer_rx) =
            dynamic_mixer::mixer::<f32>(format.channels(), format.sample_rate().0);
        let broken = Arc::new(AtomicBool::new(false));
        let callback_ticks = Arc::new(AtomicU64::new(0));

        let err_flag = Arc::clone(&broken);
        let error_callback = move |err: cpal::StreamError| {
            err_flag.store(true, Ordering::Release);
            eprintln!("[zuno-audio] audio output stream error: {err}");
        };

        let ticks = Arc::clone(&callback_ticks);
        let cfg = format.config();
        let stream = match format.sample_format() {
            SampleFormat::F32 => device.build_output_stream::<f32, _, _>(
                &cfg,
                move |data, _| {
                    ticks.fetch_add(1, Ordering::Relaxed);
                    for d in data.iter_mut() {
                        *d = mixer_rx.next().unwrap_or(0.0);
                    }
                },
                error_callback,
                None,
            ),
            SampleFormat::I16 => device.build_output_stream::<i16, _, _>(
                &cfg,
                move |data, _| {
                    ticks.fetch_add(1, Ordering::Relaxed);
                    for d in data.iter_mut() {
                        *d = mixer_rx.next().map(CpalSample::from_sample).unwrap_or(0i16);
                    }
                },
                error_callback,
                None,
            ),
            SampleFormat::I32 => device.build_output_stream::<i32, _, _>(
                &cfg,
                move |data, _| {
                    ticks.fetch_add(1, Ordering::Relaxed);
                    for d in data.iter_mut() {
                        *d = mixer_rx.next().map(CpalSample::from_sample).unwrap_or(0i32);
                    }
                },
                error_callback,
                None,
            ),
            SampleFormat::F64 => device.build_output_stream::<f64, _, _>(
                &cfg,
                move |data, _| {
                    ticks.fetch_add(1, Ordering::Relaxed);
                    for d in data.iter_mut() {
                        *d = mixer_rx.next().map(CpalSample::from_sample).unwrap_or(0.0);
                    }
                },
                error_callback,
                None,
            ),
            SampleFormat::I8 => device.build_output_stream::<i8, _, _>(
                &cfg,
                move |data, _| {
                    ticks.fetch_add(1, Ordering::Relaxed);
                    for d in data.iter_mut() {
                        *d = mixer_rx.next().map(CpalSample::from_sample).unwrap_or(0i8);
                    }
                },
                error_callback,
                None,
            ),
            SampleFormat::I64 => device.build_output_stream::<i64, _, _>(
                &cfg,
                move |data, _| {
                    ticks.fetch_add(1, Ordering::Relaxed);
                    for d in data.iter_mut() {
                        *d = mixer_rx.next().map(CpalSample::from_sample).unwrap_or(0i64);
                    }
                },
                error_callback,
                None,
            ),
            SampleFormat::U8 => device.build_output_stream::<u8, _, _>(
                &cfg,
                move |data, _| {
                    ticks.fetch_add(1, Ordering::Relaxed);
                    for d in data.iter_mut() {
                        *d = mixer_rx
                            .next()
                            .map(CpalSample::from_sample)
                            .unwrap_or(u8::MAX / 2);
                    }
                },
                error_callback,
                None,
            ),
            SampleFormat::U16 => device.build_output_stream::<u16, _, _>(
                &cfg,
                move |data, _| {
                    ticks.fetch_add(1, Ordering::Relaxed);
                    for d in data.iter_mut() {
                        *d = mixer_rx
                            .next()
                            .map(CpalSample::from_sample)
                            .unwrap_or(u16::MAX / 2);
                    }
                },
                error_callback,
                None,
            ),
            SampleFormat::U32 => device.build_output_stream::<u32, _, _>(
                &cfg,
                move |data, _| {
                    ticks.fetch_add(1, Ordering::Relaxed);
                    for d in data.iter_mut() {
                        *d = mixer_rx
                            .next()
                            .map(CpalSample::from_sample)
                            .unwrap_or(u32::MAX / 2);
                    }
                },
                error_callback,
                None,
            ),
            SampleFormat::U64 => device.build_output_stream::<u64, _, _>(
                &cfg,
                move |data, _| {
                    ticks.fetch_add(1, Ordering::Relaxed);
                    for d in data.iter_mut() {
                        *d = mixer_rx
                            .next()
                            .map(CpalSample::from_sample)
                            .unwrap_or(u64::MAX / 2);
                    }
                },
                error_callback,
                None,
            ),
            _ => return Err("unsupported sample format".into()),
        }
        .map_err(|e| e.to_string())?;

        stream.play().map_err(|e| e.to_string())?;
        Ok(Self {
            mixer: mixer_tx,
            stream,
            broken,
            callback_ticks,
            hw_paused: false,
        })
    }

    fn is_broken(&self) -> bool {
        self.broken.load(Ordering::Acquire)
    }

    fn ticks(&self) -> u64 {
        self.callback_ticks.load(Ordering::Relaxed)
    }

    fn new_sink(&self) -> Sink {
        let (sink, queue_rx) = Sink::new_idle();
        self.mixer.add(queue_rx);
        sink
    }

    #[cfg(target_os = "android")]
    fn pause_hw(&mut self) {
        if self.hw_paused || self.is_broken() {
            return;
        }
        match self.stream.pause() {
            Ok(()) => self.hw_paused = true,
            Err(e) => {
                eprintln!("[zuno-audio] stream pause failed, marking broken: {e}");
                self.broken.store(true, Ordering::Release);
            }
        }
    }

    fn play_hw(&mut self) -> bool {
        if self.is_broken() {
            return false;
        }
        if !self.hw_paused {
            return true;
        }
        match self.stream.play() {
            Ok(()) => {
                self.hw_paused = false;
                true
            }
            Err(e) => {
                eprintln!("[zuno-audio] stream resume failed, marking broken: {e}");
                self.broken.store(true, Ordering::Release);
                false
            }
        }
    }
}

/// Build an ordered list of candidate audio stream configurations for the current platform.
///
/// On Android, `cpal 0.15`'s Oboe host returns `with_max_sample_rate()` (= 192 kHz!) from
/// `default_output_config()`, which fails or silently drops audio on many Bluetooth A2DP sinks and
/// phone DACs. Preferring native 48 kHz / 44.1 kHz stereo matches Android AudioFlinger cleanly.
fn candidate_configs(device: &cpal::Device) -> Vec<SupportedStreamConfig> {
    let mut configs = Vec::new();
    let hz_48k = SampleRate(48_000);
    let hz_44k = SampleRate(44_100);

    #[cfg(target_os = "android")]
    {
        if let Ok(supported) = device.supported_output_configs() {
            let ranges: Vec<_> = supported.collect();
            for &rate in &[hz_48k, hz_44k] {
                for &fmt in &[SampleFormat::F32, SampleFormat::I16] {
                    for r in &ranges {
                        if r.channels() == 2
                            && r.sample_format() == fmt
                            && rate >= r.min_sample_rate()
                            && rate <= r.max_sample_rate()
                        {
                            configs.push(r.with_sample_rate(rate));
                        }
                    }
                }
            }
            for r in &ranges {
                if r.channels() == 2 && hz_48k >= r.min_sample_rate() && hz_48k <= r.max_sample_rate()
                {
                    configs.push(r.with_sample_rate(hz_48k));
                }
            }
        }
    }

    if let Ok(default_cfg) = device.default_output_config() {
        configs.push(default_cfg);
    }

    if let Ok(supported) = device.supported_output_configs() {
        let mut ranges: Vec<_> = supported.collect();
        ranges.sort_by(|a, b| b.cmp_default_heuristics(a));
        for r in ranges {
            let min_r = r.min_sample_rate();
            let max_r = r.max_sample_rate();
            if hz_48k >= min_r && hz_48k <= max_r {
                configs.push(r.with_sample_rate(hz_48k));
            }
            if hz_44k >= min_r && hz_44k <= max_r {
                configs.push(r.with_sample_rate(hz_44k));
            }
            configs.push(r.with_max_sample_rate());
            configs.push(r.with_sample_rate(min_r));
        }
    }

    configs
}

/// Real audio backend using Rodio + Symphonia + managed cpal stream (pure-Rust decoders + 10-band
/// Rust EQ + equal-power overlapping crossfade + automatic Android Oboe/AAudio disconnect recovery).
/// Lazily acquires the OS audio device on first playback so startup uses ~0 audio resources.
pub struct RodioEngine {
    stream: Option<ManagedOutputStream>,
    sink: Option<Sink>,
    fading_out: Option<(Sink, Instant, Duration, f32)>,
    fading_in: Option<(Instant, Duration)>,
    base_volume: f32,
    crossfade_secs: f32,
    eq: Arc<SharedEq>,
    spectrum: Arc<SharedSpectrum>,
    loaded: bool,
    paused: bool,
    current_path: Option<PathBuf>,
    pos_offset: Duration,
    last_pos: Duration,
    pending_seek: Option<Duration>,
    last_cb_ticks: u64,
    last_cb_check: Instant,
    recovery_attempts: u8,
}

impl RodioEngine {
    pub fn new() -> Self {
        Self {
            stream: None,
            sink: None,
            fading_out: None,
            fading_in: None,
            base_volume: DEFAULT_VOLUME,
            crossfade_secs: 0.0,
            eq: Arc::new(SharedEq::default()),
            spectrum: Arc::new(SharedSpectrum::new()),
            loaded: false,
            paused: false,
            current_path: None,
            pos_offset: Duration::ZERO,
            last_pos: Duration::ZERO,
            pending_seek: None,
            last_cb_ticks: 0,
            last_cb_check: Instant::now(),
            recovery_attempts: 0,
        }
    }

    fn reset_stream(&mut self) {
        if let Some((old_fade, ..)) = self.fading_out.take() {
            old_fade.stop();
        }
        self.fading_in = None;
        if let Some(old_sink) = self.sink.take() {
            old_sink.stop();
        }
        self.stream = None;
        self.last_cb_ticks = 0;
        self.last_cb_check = Instant::now();
    }

    fn ensure_stream_playing(&mut self) -> Result<()> {
        let needs_reopen = match self.stream.as_mut() {
            None => true,
            Some(s) => s.is_broken() || !s.play_hw(),
        };
        if needs_reopen {
            if let Some((old_fade, ..)) = self.fading_out.take() {
                old_fade.stop();
            }
            self.fading_in = None;
            self.stream = None;
            let opened = ManagedOutputStream::open_default()?;
            self.last_cb_ticks = opened.ticks();
            self.last_cb_check = Instant::now();
            self.stream = Some(opened);
        }
        Ok(())
    }

    fn sync_callback_heartbeat(&mut self) {
        if let Some(ref stream) = self.stream {
            self.last_cb_ticks = stream.ticks();
            self.last_cb_check = Instant::now();
        }
    }

    /// Wait briefly to confirm the OS audio callback is actively running before invoking
    /// `Sink::try_seek()` (which blocks forever if the underlying Oboe/AAudio stream died).
    fn wait_for_live_callback(&self, timeout: Duration) -> bool {
        let Some(ref stream) = self.stream else {
            return false;
        };
        if stream.is_broken() || stream.hw_paused {
            return false;
        }
        let start_ticks = stream.ticks();
        let deadline = Instant::now() + timeout;
        while Instant::now() < deadline {
            if stream.is_broken() {
                return false;
            }
            if stream.ticks() != start_ticks {
                return true;
            }
            std::thread::sleep(Duration::from_millis(8));
        }
        !stream.is_broken() && stream.ticks() != start_ticks
    }

    fn load_and_play_at(
        &mut self,
        path: &Path,
        volume: f32,
        start_pos: Option<Duration>,
        allow_crossfade: bool,
    ) -> Result<()> {
        let vol = volume.clamp(0.0, 1.0);

        // Open and decode the incoming file FIRST before touching or stopping any currently
        // playing sink — if the requested file is missing or corrupt, playback stays intact.
        let mut decoded = SymphoniaFileSource::open(path)?;
        let effective_offset = match start_pos {
            Some(pos) if !pos.is_zero() => {
                if decoded.try_seek(pos).is_ok() {
                    pos
                } else {
                    Duration::ZERO
                }
            }
            _ => Duration::ZERO,
        };

        self.ensure_stream_playing()?;
        let sink = self
            .stream
            .as_ref()
            .ok_or_else(|| ZunoError::Audio("audio output stream unavailable".into()))?
            .new_sink();

        let source = EqSource::with_spectrum(
            decoded,
            Arc::clone(&self.eq),
            Some(Arc::clone(&self.spectrum)),
        );

        self.base_volume = vol;

        // Clean up any older fading-out sink before starting a new transition.
        if let Some((old_fade, ..)) = self.fading_out.take() {
            old_fade.stop();
        }
        self.fading_in = None;

        let mut had_active_outgoing = false;
        if let Some(old) = self.sink.take() {
            let start_vol = old.volume().clamp(0.0, 1.0);
            if allow_crossfade
                && self.crossfade_secs > CROSSFADE_MIN_ACTIVE_SECS
                && start_vol > 0.02
                && !old.empty()
                && !old.is_paused()
            {
                let dur = Duration::from_secs_f32(self.crossfade_secs);
                self.fading_out = Some((old, Instant::now(), dur, start_vol));
                had_active_outgoing = true;
            } else {
                old.stop();
            }
        }

        if allow_crossfade && self.crossfade_secs > CROSSFADE_MIN_ACTIVE_SECS {
            let fade_in_secs = if had_active_outgoing {
                self.crossfade_secs
            } else {
                self.crossfade_secs.min(1.5)
            };
            sink.set_volume(0.0);
            self.fading_in = Some((Instant::now(), Duration::from_secs_f32(fade_in_secs)));
        } else {
            sink.set_volume(vol);
        }

        sink.append(source);
        sink.play();

        self.sink = Some(sink);
        self.loaded = true;
        self.paused = false;
        self.current_path = Some(path.to_path_buf());
        self.pos_offset = effective_offset;
        self.last_pos = effective_offset;
        self.pending_seek = None;
        self.recovery_attempts = 0;
        self.sync_callback_heartbeat();
        Ok(())
    }
}

impl Default for RodioEngine {
    fn default() -> Self {
        Self::new()
    }
}

// SAFETY: `RodioEngine` is exclusively created on and owned by the single dedicated audio thread.
// We never share `cpal::Stream` across threads; `Send` is only used to transfer an uninitialized
// `RodioEngine::new()` (where `stream` is `None`) into the audio thread on startup.
unsafe impl Send for RodioEngine {}

/// Streaming signed 16-bit LE PCM source (e.g. from `rtl_fm`) yielding normalized `f32` samples.
struct PcmI16ReaderSource {
    reader: BufReader<Box<dyn Read + Send>>,
    sample_rate: u32,
    channels: u16,
    buf: Vec<u8>,
    pos: usize,
    filled: usize,
}

impl PcmI16ReaderSource {
    fn new(reader: Box<dyn Read + Send>, sample_rate: u32, channels: u16) -> Self {
        Self {
            reader: BufReader::with_capacity(16 * 1024, reader),
            sample_rate: sample_rate.max(MIN_SAMPLE_RATE),
            channels: channels.max(1),
            buf: vec![0u8; 4096],
            pos: 0,
            filled: 0,
        }
    }
}

impl Iterator for PcmI16ReaderSource {
    type Item = f32;

    fn next(&mut self) -> Option<Self::Item> {
        if self.pos + 2 > self.filled {
            let leftover = self.filled.saturating_sub(self.pos);
            if leftover == 1 {
                self.buf[0] = self.buf[self.pos];
            }
            self.pos = 0;
            self.filled = leftover;
            while self.filled < 2 {
                match self.reader.read(&mut self.buf[self.filled..]) {
                    Ok(0) => return None,
                    Ok(n) => self.filled += n,
                    Err(_) => return None,
                }
            }
        }
        let sample = i16::from_le_bytes([self.buf[self.pos], self.buf[self.pos + 1]]);
        self.pos += 2;
        Some(sample as f32 / 32768.0)
    }
}

impl Source for PcmI16ReaderSource {
    fn current_frame_len(&self) -> Option<usize> {
        None
    }

    fn channels(&self) -> u16 {
        self.channels
    }

    fn sample_rate(&self) -> u32 {
        self.sample_rate
    }

    fn total_duration(&self) -> Option<Duration> {
        None
    }
}

impl AudioEngine for RodioEngine {
    fn load_pcm_stream(
        &mut self,
        reader: Box<dyn Read + Send>,
        sample_rate: u32,
        channels: u16,
        volume: f32,
    ) -> Result<()> {
        let vol = volume.clamp(0.0, 1.0);
        self.base_volume = vol;

        if let Some((old_fade, ..)) = self.fading_out.take() {
            old_fade.stop();
        }
        self.fading_in = None;
        if let Some(old) = self.sink.take() {
            old.stop();
        }
        self.current_path = None;
        self.pending_seek = None;
        self.pos_offset = Duration::ZERO;
        self.last_pos = Duration::ZERO;

        self.ensure_stream_playing()?;
        let sink = self
            .stream
            .as_ref()
            .ok_or_else(|| ZunoError::Audio("audio output stream unavailable".into()))?
            .new_sink();

        let pcm = PcmI16ReaderSource::new(reader, sample_rate, channels);
        let source = EqSource::with_spectrum(
            pcm,
            Arc::clone(&self.eq),
            Some(Arc::clone(&self.spectrum)),
        );

        sink.set_volume(vol);
        sink.append(source);
        sink.play();

        self.sink = Some(sink);
        self.loaded = true;
        self.paused = false;
        self.sync_callback_heartbeat();
        Ok(())
    }

    fn load_and_play(&mut self, path: &Path, volume: f32) -> Result<()> {
        self.load_and_play_at(path, volume, None, true)
    }

    fn pause(&mut self) {
        self.last_pos = Duration::from_secs_f64(self.position_secs());
        if let Some((old_fade, ..)) = self.fading_out.take() {
            old_fade.stop();
        }
        self.fading_in = None;
        self.spectrum.clear();
        if let Some(ref sink) = self.sink {
            sink.set_volume(self.base_volume);
            sink.pause();
        }
        self.paused = true;
        #[cfg(target_os = "android")]
        if let Some(ref mut stream) = self.stream {
            stream.pause_hw();
        }
    }

    fn resume(&mut self) {
        self.paused = false;
        let stream_ok = self.stream.as_mut().map(|s| s.play_hw()).unwrap_or(false);
        let sink_alive = self.sink.as_ref().is_some_and(|s| !s.empty());

        if !stream_ok || !sink_alive {
            if let Some(path) = self.current_path.clone() {
                let target = self.pending_seek.take().or(Some(self.last_pos));
                self.reset_stream();
                if let Err(e) = self.load_and_play_at(&path, self.base_volume, target, false) {
                    eprintln!("[zuno-audio] failed to recover track on resume: {e}");
                }
            }
            return;
        }

        if let Some(ref sink) = self.sink {
            sink.set_volume(self.base_volume);
            sink.play();
        }
        self.sync_callback_heartbeat();

        if let Some(target) = self.pending_seek.take() {
            let _ = self.seek(target);
        }
    }

    fn stop(&mut self) {
        if let Some((old_fade, ..)) = self.fading_out.take() {
            old_fade.stop();
        }
        self.fading_in = None;
        self.spectrum.clear();
        if let Some(sink) = self.sink.take() {
            sink.stop();
        }
        self.loaded = false;
        self.paused = false;
        self.current_path = None;
        self.pos_offset = Duration::ZERO;
        self.last_pos = Duration::ZERO;
        self.pending_seek = None;
        self.recovery_attempts = 0;
        #[cfg(target_os = "android")]
        {
            self.stream = None;
        }
    }

    fn seek(&mut self, pos: Duration) -> Result<()> {
        self.last_pos = pos;
        if !self.loaded || self.sink.is_none() {
            return Ok(());
        }

        // On Android, paused streams pause the hardware Oboe callback to save battery/prevent Doze
        // disconnects — defer the seek cleanly until resume so `try_seek` can NEVER deadlock.
        if self.paused && self.stream.as_ref().is_some_and(|s| s.hw_paused) {
            self.pending_seek = Some(pos);
            return Ok(());
        }

        // Verify the hardware callback is actively pulling frames before invoking `Sink::try_seek`,
        // which calls `feedback.recv()` without a timeout.
        if self.wait_for_live_callback(Duration::from_millis(140)) {
            if let Some(ref sink) = self.sink {
                sink.try_seek(pos)
                    .map_err(|e| ZunoError::Audio(format!("seek unsupported or failed: {e:?}")))?;
                self.pos_offset = Duration::ZERO;
                self.pending_seek = None;
                self.last_pos = pos;
                return Ok(());
            }
        }

        // Stream died or stalled — transparently rebuild and seek synchronously on the decoder!
        if let Some(path) = self.current_path.clone() {
            let was_paused = self.paused;
            self.reset_stream();
            self.load_and_play_at(&path, self.base_volume, Some(pos), false)?;
            if was_paused {
                self.pause();
                self.last_pos = pos;
            }
            return Ok(());
        }

        Err(ZunoError::Audio("audio stream unavailable for seek".into()))
    }

    fn set_volume(&mut self, volume: f32) {
        let vol = volume.clamp(0.0, 1.0);
        self.base_volume = vol;
        if self.fading_in.is_none()
            && let Some(ref sink) = self.sink
        {
            sink.set_volume(vol);
        }
    }

    fn set_eq(&mut self, eq: EqConfig) {
        self.eq.update(eq);
    }

    fn set_crossfade(&mut self, secs: f32) {
        self.crossfade_secs = secs.clamp(0.0, CROSSFADE_MAX_SECS);
    }

    fn spectrum(&self) -> Option<Arc<SharedSpectrum>> {
        Some(Arc::clone(&self.spectrum))
    }

    fn is_loaded(&self) -> bool {
        self.loaded && (self.sink.as_ref().is_some_and(|s| !s.empty()) || self.current_path.is_some())
    }

    fn recover_output(&mut self, force: bool) -> bool {
        if !self.loaded {
            if self.stream.as_ref().is_some_and(|s| s.is_broken()) {
                self.reset_stream();
            }
            return false;
        }
        if self.paused {
            if self.stream.as_ref().is_some_and(|s| s.is_broken()) {
                self.stream = None;
            }
            return false;
        }
        let Some(path) = self.current_path.clone() else {
            return false;
        };

        let now = Instant::now();
        let (broken, stalled) = match self.stream.as_ref() {
            None => (true, false),
            Some(stream) => {
                let ticks = stream.ticks();
                if ticks != self.last_cb_ticks {
                    self.last_cb_ticks = ticks;
                    self.last_cb_check = now;
                    self.recovery_attempts = 0;
                    self.last_pos = Duration::from_secs_f64(self.position_secs());
                }
                let is_broken = stream.is_broken();
                let is_stalled = !stream.hw_paused
                    && now.saturating_duration_since(self.last_cb_check) >= STREAM_STALL_TIMEOUT;
                (is_broken, is_stalled)
            }
        };

        let should_recover = if force {
            broken || stalled || !self.wait_for_live_callback(Duration::from_millis(160))
        } else {
            (broken || stalled) && self.recovery_attempts < MAX_STREAM_RECOVERY_ATTEMPTS
        };

        if !should_recover {
            return false;
        }

        if !force {
            self.recovery_attempts = self.recovery_attempts.saturating_add(1);
        } else {
            self.recovery_attempts = 1;
        }
        let resume_pos = self.last_pos;
        eprintln!(
            "[zuno-audio] audio output {} (attempt {}), reopening stream at {:.1}s",
            if broken {
                "disconnected"
            } else if stalled {
                "stalled"
            } else {
                "route changed"
            },
            self.recovery_attempts,
            resume_pos.as_secs_f64()
        );
        self.reset_stream();
        match self.load_and_play_at(&path, self.base_volume, Some(resume_pos), false) {
            Ok(()) => true,
            Err(e) => {
                eprintln!("[zuno-audio] failed to recover audio output: {e}");
                false
            }
        }
    }

    fn tick_transition(&mut self) -> bool {
        if self.loaded && !self.paused {
            let _ = self.recover_output(false);
        }

        let now = Instant::now();

        if let Some((ref out_sink, started, dur, start_vol)) = self.fading_out {
            let t = (now.saturating_duration_since(started).as_secs_f32()
                / dur.as_secs_f32().max(CROSSFADE_MIN_ACTIVE_SECS))
            .clamp(0.0, 1.0);
            if t >= 1.0 || out_sink.empty() {
                if let Some((s, ..)) = self.fading_out.take() {
                    s.stop();
                }
            } else {
                // Equal-power cosine fade-out
                let gain = (t * FRAC_PI_2).cos();
                out_sink.set_volume(start_vol * gain);
            }
        }

        if let Some((started, dur)) = self.fading_in {
            let t = (now.saturating_duration_since(started).as_secs_f32()
                / dur.as_secs_f32().max(CROSSFADE_MIN_ACTIVE_SECS))
            .clamp(0.0, 1.0);
            if let Some(ref sink) = self.sink {
                if t >= 1.0 {
                    sink.set_volume(self.base_volume);
                    self.fading_in = None;
                } else {
                    // Equal-power sine fade-in
                    let gain = (t * FRAC_PI_2).sin();
                    sink.set_volume(self.base_volume * gain);
                }
            } else {
                self.fading_in = None;
            }
        }

        self.fading_out.is_some() || self.fading_in.is_some()
    }

    fn position_secs(&self) -> f64 {
        if let Some(pending) = self.pending_seek {
            return pending.as_secs_f64();
        }
        if self.paused {
            return self.last_pos.as_secs_f64();
        }
        self.sink
            .as_ref()
            .map(|s| (self.pos_offset + s.get_pos()).as_secs_f64())
            .unwrap_or_else(|| self.last_pos.as_secs_f64())
    }

    fn is_finished(&self) -> bool {
        if self.paused {
            return false;
        }
        if self.stream.as_ref().is_some_and(|s| s.is_broken()) {
            return false;
        }
        self.loaded && self.sink.as_ref().map(|s| s.empty()).unwrap_or(true)
    }
}

/// Lightweight virtual audio backend for headless testing without a sound card.
#[derive(Debug, Default)]
pub struct MockAudioEngine {
    playing: bool,
    elapsed_base: Duration,
    started_at: Option<Instant>,
    pub last_path: Option<String>,
    pub volume: f32,
}

impl MockAudioEngine {
    pub fn new() -> Self {
        Self {
            volume: DEFAULT_VOLUME,
            ..Self::default()
        }
    }
}

impl AudioEngine for MockAudioEngine {
    fn load_and_play(&mut self, path: &Path, volume: f32) -> Result<()> {
        if !path.exists() {
            return Err(ZunoError::TrackNotFound(path.display().to_string()));
        }
        self.last_path = Some(path.display().to_string());
        self.volume = volume.clamp(0.0, 1.0);
        self.elapsed_base = Duration::ZERO;
        self.started_at = Some(Instant::now());
        self.playing = true;
        Ok(())
    }

    fn pause(&mut self) {
        if self.playing {
            if let Some(start) = self.started_at.take() {
                self.elapsed_base += start.elapsed();
            }
            self.playing = false;
        }
    }

    fn resume(&mut self) {
        if !self.playing && self.last_path.is_some() {
            self.started_at = Some(Instant::now());
            self.playing = true;
        }
    }

    fn stop(&mut self) {
        self.playing = false;
        self.elapsed_base = Duration::ZERO;
        self.started_at = None;
        self.last_path = None;
    }

    fn seek(&mut self, pos: Duration) -> Result<()> {
        self.elapsed_base = pos;
        if self.playing {
            self.started_at = Some(Instant::now());
        }
        Ok(())
    }

    fn set_volume(&mut self, volume: f32) {
        self.volume = volume.clamp(0.0, 1.0);
    }

    fn is_loaded(&self) -> bool {
        self.last_path.is_some()
    }

    fn position_secs(&self) -> f64 {
        let extra = self
            .started_at
            .map(|s| s.elapsed())
            .unwrap_or(Duration::ZERO);
        (self.elapsed_base + extra).as_secs_f64()
    }

    fn is_finished(&self) -> bool {
        false
    }
}
