use crate::engine::MIN_SAMPLE_RATE;
use crate::spectrum::{SharedSpectrum, SpectrumAnalyzer};
use rodio::Source;
use rodio::source::SeekError;
use serde::{Deserialize, Serialize};
use std::f32::consts::PI;
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::{Arc, RwLock};
use std::time::Duration;

pub const EQ_BANDS: usize = 10;
pub const EQ_MIN_DB: f32 = -12.0;
pub const EQ_MAX_DB: f32 = 12.0;
const EQ_PEAKING_Q: f32 = 1.4;
const EQ_UNITY_EPS_DB: f32 = 0.01;
const EQ_RAMP_TAU_SECS: f32 = 0.012;
const EQ_AUTO_TRIM_THRESHOLD_DB: f32 = 2.5;
const EQ_AUTO_TRIM_SLOPE: f32 = 0.45;
const LIMITER_KNEE: f32 = 0.88;
const LIMITER_HEADROOM: f32 = 0.11;

/// ISO 10-band center frequencies matching the Zuno frontend EqualizerPage.
pub const EQ_FREQS: [f32; EQ_BANDS] = [
    32.0, 64.0, 125.0, 250.0, 500.0, 1000.0, 2000.0, 4000.0, 8000.0, 16000.0,
];

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct EqConfig {
    pub enabled: bool,
    pub preamp_db: f32,
    pub limiter: bool,
    pub bands_db: [f32; EQ_BANDS],
}

impl Default for EqConfig {
    fn default() -> Self {
        Self {
            enabled: false,
            preamp_db: 0.0,
            limiter: true,
            bands_db: [0.0; EQ_BANDS],
        }
    }
}

/// Lock-free generation-tracked shared EQ state so the real-time audio thread
/// never locks in steady state and only recomputes biquads when settings change.
#[derive(Debug)]
pub struct SharedEq {
    generation: AtomicU64,
    config: RwLock<EqConfig>,
}

impl Default for SharedEq {
    fn default() -> Self {
        Self::new(EqConfig::default())
    }
}

impl SharedEq {
    pub fn new(cfg: EqConfig) -> Self {
        Self {
            generation: AtomicU64::new(1),
            config: RwLock::new(cfg),
        }
    }

    pub fn update(&self, mut cfg: EqConfig) {
        cfg.preamp_db = cfg.preamp_db.clamp(EQ_MIN_DB, EQ_MAX_DB);
        for b in &mut cfg.bands_db {
            *b = b.clamp(EQ_MIN_DB, EQ_MAX_DB);
        }
        if let Ok(mut guard) = self.config.write() {
            *guard = cfg;
        }
        self.generation.fetch_add(1, Ordering::Release);
    }

    pub fn snapshot(&self) -> (u64, EqConfig) {
        let rev = self.generation.load(Ordering::Acquire);
        let cfg = self
            .config
            .read()
            .map(|g| g.clone())
            .unwrap_or_default();
        (rev, cfg)
    }

    #[inline]
    pub fn generation(&self) -> u64 {
        self.generation.load(Ordering::Acquire)
    }
}

#[derive(Debug, Clone, Copy)]
struct BiquadCoeffs {
    b0: f32,
    b1: f32,
    b2: f32,
    a1: f32,
    a2: f32,
}

impl Default for BiquadCoeffs {
    fn default() -> Self {
        Self {
            b0: 1.0,
            b1: 0.0,
            b2: 0.0,
            a1: 0.0,
            a2: 0.0,
        }
    }
}

impl BiquadCoeffs {
    #[inline]
    fn normalized(b0: f32, b1: f32, b2: f32, a0: f32, a1: f32, a2: f32) -> Self {
        let inv = 1.0 / a0;
        Self {
            b0: b0 * inv,
            b1: b1 * inv,
            b2: b2 * inv,
            a1: a1 * inv,
            a2: a2 * inv,
        }
    }
}

#[derive(Clone, Copy)]
enum BandFilterKind {
    LowShelf,
    Peaking,
    HighShelf,
}

/// Robert Bristow-Johnson Audio EQ Cookbook coefficients (matching Web Audio BiquadFilterNode).
fn design_biquad(kind: BandFilterKind, fs: f32, f0: f32, gain_db: f32) -> BiquadCoeffs {
    if gain_db.abs() < EQ_UNITY_EPS_DB || f0 >= fs * 0.48 {
        return BiquadCoeffs::default();
    }
    let a = 10f32.powf(gain_db / 40.0);
    let w0 = 2.0 * PI * f0 / fs;
    let cos_w0 = w0.cos();
    let sin_w0 = w0.sin();

    match kind {
        BandFilterKind::LowShelf | BandFilterKind::HighShelf => {
            let sign = if matches!(kind, BandFilterKind::HighShelf) {
                1.0
            } else {
                -1.0
            };
            let alpha = sin_w0 * 0.5 * std::f32::consts::SQRT_2;
            let two_sqrt_a_alpha = 2.0 * a.sqrt() * alpha;
            let ap1 = a + 1.0;
            let am1 = a - 1.0;

            let b0 = a * (ap1 + sign * am1 * cos_w0 + two_sqrt_a_alpha);
            let b1 = -2.0 * sign * a * (am1 + sign * ap1 * cos_w0);
            let b2 = a * (ap1 + sign * am1 * cos_w0 - two_sqrt_a_alpha);
            let a0 = ap1 - sign * am1 * cos_w0 + two_sqrt_a_alpha;
            let a1 = 2.0 * sign * (am1 - sign * ap1 * cos_w0);
            let a2 = ap1 - sign * am1 * cos_w0 - two_sqrt_a_alpha;
            BiquadCoeffs::normalized(b0, b1, b2, a0, a1, a2)
        }
        BandFilterKind::Peaking => {
            let alpha = sin_w0 / (2.0 * EQ_PEAKING_Q);
            BiquadCoeffs::normalized(
                1.0 + alpha * a,
                -2.0 * cos_w0,
                1.0 - alpha * a,
                1.0 + alpha / a,
                -2.0 * cos_w0,
                1.0 - alpha / a,
            )
        }
    }
}

const MAX_CH: usize = 8;

/// Zero-allocation real-time 10-band ISO Equalizer + transparent soft limiter `rodio::Source`,
/// with an optional zero-idle-cost real-time FFT spectrum tap.
pub struct EqSource<S> {
    inner: S,
    shared: Arc<SharedEq>,
    spectrum: Option<Arc<SharedSpectrum>>,
    analyzer: Option<Box<SpectrumAnalyzer>>,
    mono_accum: f32,
    last_gen: u64,
    channels: usize,
    sample_rate: f32,
    ramp_alpha: f32,
    ch_cursor: usize,
    enabled: bool,
    limiter: bool,
    active_mask: u16,
    target_preamp: f32,
    current_preamp: f32,
    target_wet: f32,
    current_wet: f32,
    coeffs: [BiquadCoeffs; EQ_BANDS],
    // Direct Form II Transposed delay states per band & channel
    z1: [[f32; MAX_CH]; EQ_BANDS],
    z2: [[f32; MAX_CH]; EQ_BANDS],
}

impl<S> EqSource<S>
where
    S: Source<Item = f32>,
{
    pub fn new(inner: S, shared: Arc<SharedEq>) -> Self {
        Self::with_spectrum(inner, shared, None)
    }

    pub fn with_spectrum(
        inner: S,
        shared: Arc<SharedEq>,
        spectrum: Option<Arc<SharedSpectrum>>,
    ) -> Self {
        let channels = (inner.channels() as usize).clamp(1, MAX_CH);
        let sample_rate = inner.sample_rate().max(MIN_SAMPLE_RATE) as f32;
        // Sample-rate-independent exponential smoothing (~12ms time constant at any sample rate).
        let ramp_alpha = (1.0 - (-1.0 / (EQ_RAMP_TAU_SECS * sample_rate)).exp()).clamp(0.0002, 0.05);
        let analyzer = spectrum
            .as_ref()
            .map(|_| Box::new(SpectrumAnalyzer::new(sample_rate)));
        let mut src = Self {
            inner,
            shared,
            spectrum,
            analyzer,
            mono_accum: 0.0,
            last_gen: 0,
            channels,
            sample_rate,
            ramp_alpha,
            ch_cursor: 0,
            enabled: false,
            limiter: true,
            active_mask: 0,
            target_preamp: 1.0,
            current_preamp: 1.0,
            target_wet: 0.0,
            current_wet: 0.0,
            coeffs: [BiquadCoeffs::default(); EQ_BANDS],
            z1: [[0.0; MAX_CH]; EQ_BANDS],
            z2: [[0.0; MAX_CH]; EQ_BANDS],
        };
        src.sync_config();
        src.current_preamp = src.target_preamp;
        src.current_wet = src.target_wet;
        src
    }

    fn sync_config(&mut self) {
        let (rev, cfg) = self.shared.snapshot();
        self.last_gen = rev;
        self.enabled = cfg.enabled;
        self.limiter = cfg.limiter;
        self.target_wet = if cfg.enabled { 1.0 } else { 0.0 };

        // Gentle automatic headroom trim when boosting bands with limiter ON
        // to prevent digital clipping noise on mastered tracks.
        let peak_boost = cfg.bands_db.iter().copied().fold(0.0f32, f32::max);
        let total_boost = (cfg.preamp_db + peak_boost).max(0.0);
        let auto_trim = if cfg.enabled && cfg.limiter && total_boost > EQ_AUTO_TRIM_THRESHOLD_DB {
            -(total_boost - EQ_AUTO_TRIM_THRESHOLD_DB) * EQ_AUTO_TRIM_SLOPE
        } else {
            0.0
        };
        let eff_preamp = if cfg.enabled {
            cfg.preamp_db + auto_trim
        } else {
            0.0
        };
        self.target_preamp = 10f32.powf(eff_preamp / 20.0);

        let mut mask = 0u16;
        for (i, &freq) in EQ_FREQS.iter().enumerate() {
            let db = if cfg.enabled { cfg.bands_db[i] } else { 0.0 };
            let kind = match i {
                0 => BandFilterKind::LowShelf,
                last if last + 1 == EQ_BANDS => BandFilterKind::HighShelf,
                _ => BandFilterKind::Peaking,
            };
            self.coeffs[i] = design_biquad(kind, self.sample_rate, freq, db);
            if db.abs() >= EQ_UNITY_EPS_DB && freq < self.sample_rate * 0.48 {
                mask |= 1u16 << i;
            } else {
                // Zero delay state for unity bands so re-enabling later stays click-free.
                self.z1[i] = [0.0; MAX_CH];
                self.z2[i] = [0.0; MAX_CH];
            }
        }
        self.active_mask = mask;
    }

    fn reset_states(&mut self) {
        self.z1 = [[0.0; MAX_CH]; EQ_BANDS];
        self.z2 = [[0.0; MAX_CH]; EQ_BANDS];
        self.ch_cursor = 0;
        self.mono_accum = 0.0;
        if let Some(ref mut a) = self.analyzer {
            a.reset();
        }
    }

    #[inline]
    fn tap_spectrum(&mut self, ch: usize, out: f32) {
        if let (Some(spec), Some(analyzer)) = (&self.spectrum, &mut self.analyzer) {
            self.mono_accum += out;
            if ch + 1 == self.channels {
                let mono = self.mono_accum / self.channels as f32;
                self.mono_accum = 0.0;
                analyzer.push_mono(mono, spec);
            }
        }
    }

    #[inline]
    fn soft_limit(x: f32) -> f32 {
        // Transparent unity below knee; smooth asymptotic soft ceiling below 0.99.
        let ax = x.abs();
        if ax <= LIMITER_KNEE {
            x
        } else {
            let excess = ax - LIMITER_KNEE;
            let shaped = LIMITER_KNEE + LIMITER_HEADROOM * (excess / (LIMITER_HEADROOM + excess));
            shaped.copysign(x)
        }
    }
}

impl<S> Iterator for EqSource<S>
where
    S: Source<Item = f32>,
{
    type Item = f32;

    #[inline]
    fn next(&mut self) -> Option<Self::Item> {
        let dry = self.inner.next()?;
        let ch = self.ch_cursor;
        let next_ch = ch + 1;
        self.ch_cursor = if next_ch >= self.channels { 0 } else { next_ch };

        // Check atomic generation once per audio frame (zero lock in steady state)
        if ch == 0 && self.shared.generation() != self.last_gen {
            self.sync_config();
        }

        // Sample-rate-normalized clickless crossfade & preamp ramp
        if ch == 0 {
            self.current_wet += (self.target_wet - self.current_wet) * self.ramp_alpha;
            self.current_preamp += (self.target_preamp - self.current_preamp) * self.ramp_alpha;
        }

        // Fast bit-exact bypass when EQ is fully off (0 DSP FLOPs!)
        if !self.enabled && self.current_wet < 0.0005 {
            self.current_wet = 0.0;
            self.tap_spectrum(ch, dry);
            return Some(dry);
        }

        let mut x = dry * self.current_preamp;
        let mut mask = self.active_mask;
        while mask != 0 {
            let band = mask.trailing_zeros() as usize;
            mask &= mask - 1;
            let c = &self.coeffs[band];
            let y = c.b0 * x + self.z1[band][ch];
            self.z1[band][ch] = c.b1 * x - c.a1 * y + self.z2[band][ch];
            self.z2[band][ch] = c.b2 * x - c.a2 * y;
            x = y;
        }

        if self.limiter {
            x = Self::soft_limit(x);
        } else {
            x = x.clamp(-1.0, 1.0);
        }

        let w = self.current_wet;
        let out = dry * (1.0 - w) + x * w;
        self.tap_spectrum(ch, out);
        Some(out)
    }
}

impl<S> Source for EqSource<S>
where
    S: Source<Item = f32>,
{
    #[inline]
    fn current_frame_len(&self) -> Option<usize> {
        self.inner.current_frame_len()
    }

    #[inline]
    fn channels(&self) -> u16 {
        self.inner.channels()
    }

    #[inline]
    fn sample_rate(&self) -> u32 {
        self.inner.sample_rate()
    }

    #[inline]
    fn total_duration(&self) -> Option<Duration> {
        self.inner.total_duration()
    }

    fn try_seek(&mut self, pos: Duration) -> Result<(), SeekError> {
        let res = self.inner.try_seek(pos);
        if res.is_ok() {
            self.reset_states();
        }
        res
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use rodio::buffer::SamplesBuffer;

    #[test]
    fn eq_dry_bypass_and_soft_limiter_prevent_clipping() {
        let shared = Arc::new(SharedEq::default());
        let dry_samples = vec![0.25f32, -0.25, 0.5, -0.5];
        let src = EqSource::new(
            SamplesBuffer::new(2, 44100, dry_samples.clone()),
            Arc::clone(&shared),
        );
        let out: Vec<f32> = src.collect();
        assert_eq!(out, dry_samples);

        shared.update(EqConfig {
            enabled: true,
            preamp_db: 12.0,
            limiter: true,
            bands_db: [12.0, 9.0, 6.0, 0.0, 0.0, 0.0, 0.0, 0.0, 6.0, 9.0],
        });
        let hot: Vec<f32> = (0..4096)
            .map(|i| (i as f32 * 0.05).sin() * 0.95)
            .collect();
        let limited: Vec<f32> = EqSource::new(SamplesBuffer::new(2, 44100, hot), shared).collect();
        assert!(limited.iter().all(|s| s.is_finite() && s.abs() < 1.0));
    }
}
