use crate::eq::{EqConfig, EqSource, SharedEq};
use crate::spectrum::SharedSpectrum;
use rodio::{Decoder, OutputStream, OutputStreamHandle, Sink, Source};
use std::f32::consts::FRAC_PI_2;
use std::fs::File;
use std::io::{BufReader, Read};
use std::path::Path;
use std::sync::Arc;
use std::time::{Duration, Instant};
use zuno_core::{Result, ZunoError};

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
        Err(ZunoError::Audio("live PCM stream unsupported on this backend".into()))
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
    /// Advances any active fade-out / fade-in envelopes. Returns true while a transition is active.
    fn tick_transition(&mut self) -> bool {
        false
    }
    fn position_secs(&self) -> f64;
    fn is_finished(&self) -> bool;
}

/// Real desktop audio backend using Rodio + Symphonia (pure-Rust decoders + 10-band Rust EQ +
/// equal-power overlapping crossfade & fade-in transitions).
/// Lazily acquires the OS audio device on first playback so startup uses ~0 audio resources.
pub struct RodioEngine {
    stream: Option<(OutputStream, OutputStreamHandle)>,
    sink: Option<Sink>,
    fading_out: Option<(Sink, Instant, Duration, f32)>,
    fading_in: Option<(Instant, Duration)>,
    base_volume: f32,
    crossfade_secs: f32,
    eq: Arc<SharedEq>,
    spectrum: Arc<SharedSpectrum>,
    loaded: bool,
}

impl RodioEngine {
    pub fn new() -> Self {
        Self {
            stream: None,
            sink: None,
            fading_out: None,
            fading_in: None,
            base_volume: 0.8,
            crossfade_secs: 0.0,
            eq: Arc::new(SharedEq::default()),
            spectrum: Arc::new(SharedSpectrum::new()),
            loaded: false,
        }
    }

    fn ensure_stream(&mut self) -> Result<&OutputStreamHandle> {
        if self.stream.is_none() {
            let pair = OutputStream::try_default()
                .map_err(|e| ZunoError::Audio(format!("failed to open audio output: {e}")))?;
            self.stream = Some(pair);
        }
        Ok(&self.stream.as_ref().unwrap().1)
    }
}

impl Default for RodioEngine {
    fn default() -> Self {
        Self::new()
    }
}

// SAFETY: `RodioEngine` is exclusively created on and owned by the single dedicated audio thread.
// We never share `OutputStream` across threads; `Send` is only used to transfer an uninitialized
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
            sample_rate: sample_rate.max(8_000),
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

        let handle = self.ensure_stream()?;
        let sink = Sink::try_new(handle)
            .map_err(|e| ZunoError::Audio(format!("failed to create FM audio sink: {e}")))?;

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
        Ok(())
    }

    fn load_and_play(&mut self, path: &Path, volume: f32) -> Result<()> {
        let vol = volume.clamp(0.0, 1.0);
        self.base_volume = vol;

        // Clean up any older fading-out sink before starting a new transition
        if let Some((old_fade, ..)) = self.fading_out.take() {
            old_fade.stop();
        }
        self.fading_in = None;

        let mut had_active_outgoing = false;
        if let Some(old) = self.sink.take() {
            if self.crossfade_secs > 0.05 && !old.empty() && !old.is_paused() {
                let start_vol = old.volume().clamp(0.0, 1.0);
                let dur = Duration::from_secs_f32(self.crossfade_secs);
                self.fading_out = Some((old, Instant::now(), dur, start_vol));
                had_active_outgoing = true;
            } else {
                old.stop();
            }
        }

        let handle = self.ensure_stream()?;
        let sink = Sink::try_new(handle)
            .map_err(|e| ZunoError::Audio(format!("failed to create audio sink: {e}")))?;

        let file = File::open(path)?;
        let decoded = Decoder::new(BufReader::with_capacity(128 * 1024, file))
            .map_err(|e| ZunoError::Audio(format!("failed to decode {}: {e}", path.display())))?;
        let source = EqSource::with_spectrum(
            decoded.convert_samples::<f32>(),
            Arc::clone(&self.eq),
            Some(Arc::clone(&self.spectrum)),
        );

        if self.crossfade_secs > 0.05 {
            // Smooth fade-in on incoming track (full crossfade when overlapping, gentle swell from silence)
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
        Ok(())
    }

    fn pause(&mut self) {
        if let Some((old_fade, ..)) = self.fading_out.take() {
            old_fade.stop();
        }
        self.fading_in = None;
        self.spectrum.clear();
        if let Some(ref sink) = self.sink {
            sink.set_volume(self.base_volume);
            sink.pause();
        }
    }

    fn resume(&mut self) {
        if let Some(ref sink) = self.sink {
            sink.play();
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
    }

    fn seek(&mut self, pos: Duration) -> Result<()> {
        let Some(ref sink) = self.sink else {
            return Ok(());
        };
        sink.try_seek(pos)
            .map_err(|e| ZunoError::Audio(format!("seek unsupported or failed: {e:?}")))
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
        self.crossfade_secs = secs.clamp(0.0, 10.0);
    }

    fn spectrum(&self) -> Option<Arc<SharedSpectrum>> {
        Some(Arc::clone(&self.spectrum))
    }

    fn tick_transition(&mut self) -> bool {
        let now = Instant::now();

        if let Some((ref out_sink, started, dur, start_vol)) = self.fading_out {
            let t = (now.saturating_duration_since(started).as_secs_f32()
                / dur.as_secs_f32().max(0.05))
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
                / dur.as_secs_f32().max(0.05))
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
        self.sink
            .as_ref()
            .map(|s| s.get_pos().as_secs_f64())
            .unwrap_or(0.0)
    }

    fn is_finished(&self) -> bool {
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
            volume: 0.8,
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
