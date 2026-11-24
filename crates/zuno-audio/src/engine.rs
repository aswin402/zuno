use crate::eq::{EqConfig, EqSource, SharedEq};
use rodio::{Decoder, OutputStream, OutputStreamHandle, Sink, Source};
use std::fs::File;
use std::io::BufReader;
use std::path::Path;
use std::sync::Arc;
use std::time::{Duration, Instant};
use zuno_core::{Result, ZunoError};

/// Platform audio backend abstraction (allows hardware-free unit/integration tests).
pub trait AudioEngine: Send + 'static {
    fn load_and_play(&mut self, path: &Path, volume: f32) -> Result<()>;
    fn pause(&mut self);
    fn resume(&mut self);
    fn stop(&mut self);
    fn seek(&mut self, pos: Duration) -> Result<()>;
    fn set_volume(&mut self, volume: f32);
    fn set_eq(&mut self, _eq: EqConfig) {}
    fn position_secs(&self) -> f64;
    fn is_finished(&self) -> bool;
}

/// Real desktop audio backend using Rodio + Symphonia (pure-Rust decoders + 10-band Rust EQ).
/// Lazily acquires the OS audio device on first playback so startup uses ~0 audio resources.
pub struct RodioEngine {
    stream: Option<(OutputStream, OutputStreamHandle)>,
    sink: Option<Sink>,
    eq: Arc<SharedEq>,
    loaded: bool,
}

impl RodioEngine {
    pub fn new() -> Self {
        Self {
            stream: None,
            sink: None,
            eq: Arc::new(SharedEq::default()),
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

impl AudioEngine for RodioEngine {
    fn load_and_play(&mut self, path: &Path, volume: f32) -> Result<()> {
        if let Some(old) = self.sink.take() {
            old.stop();
        }
        let handle = self.ensure_stream()?;
        let sink = Sink::try_new(handle)
            .map_err(|e| ZunoError::Audio(format!("failed to create audio sink: {e}")))?;

        let file = File::open(path)?;
        let decoded = Decoder::new(BufReader::with_capacity(128 * 1024, file))
            .map_err(|e| ZunoError::Audio(format!("failed to decode {}: {e}", path.display())))?;
        let source = EqSource::new(decoded.convert_samples::<f32>(), Arc::clone(&self.eq));

        sink.set_volume(volume.clamp(0.0, 1.0));
        sink.append(source);
        sink.play();

        self.sink = Some(sink);
        self.loaded = true;
        Ok(())
    }

    fn pause(&mut self) {
        if let Some(ref sink) = self.sink {
            sink.pause();
        }
    }

    fn resume(&mut self) {
        if let Some(ref sink) = self.sink {
            sink.play();
        }
    }

    fn stop(&mut self) {
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
        if let Some(ref sink) = self.sink {
            sink.set_volume(volume.clamp(0.0, 1.0));
        }
    }

    fn set_eq(&mut self, eq: EqConfig) {
        self.eq.update(eq);
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
