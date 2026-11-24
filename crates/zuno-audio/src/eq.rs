use rodio::Source;
use rodio::source::SeekError;
use serde::{Deserialize, Serialize};
use std::f32::consts::PI;
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::{Arc, RwLock};
use std::time::Duration;

/// ISO 10-band center frequencies matching the Zuno frontend EqualizerPage.
pub const EQ_FREQS: [f32; 10] = [
    32.0, 64.0, 125.0, 250.0, 500.0, 1000.0, 2000.0, 4000.0, 8000.0, 16000.0,
];

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct EqConfig {
    pub enabled: bool,
    pub preamp_db: f32,
    pub limiter: bool,
    pub bands_db: [f32; 10],
}

impl Default for EqConfig {
    fn default() -> Self {
        Self {
            enabled: false,
            preamp_db: 0.0,
            limiter: true,
            bands_db: [0.0; 10],
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
        cfg.preamp_db = cfg.preamp_db.clamp(-12.0, 12.0);
        for b in &mut cfg.bands_db {
            *b = b.clamp(-12.0, 12.0);
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

/// Robert Bristow-Johnson Audio EQ Cookbook coefficients (matching Web Audio BiquadFilterNode).
fn design_low_shelf(fs: f32, f0: f32, gain_db: f32) -> BiquadCoeffs {
    if gain_db.abs() < 0.01 || f0 >= fs * 0.48 {
        return BiquadCoeffs::default();
    }
    let a = 10f32.powf(gain_db / 40.0);
    let w0 = 2.0 * PI * f0 / fs;
    let cos_w0 = w0.cos();
    let sin_w0 = w0.sin();
    let alpha = sin_w0 / 2.0 * std::f32::consts::SQRT_2;
    let two_sqrt_a_alpha = 2.0 * a.sqrt() * alpha;

    let b0 = a * ((a + 1.0) - (a - 1.0) * cos_w0 + two_sqrt_a_alpha);
    let b1 = 2.0 * a * ((a - 1.0) - (a + 1.0) * cos_w0);
    let b2 = a * ((a + 1.0) - (a - 1.0) * cos_w0 - two_sqrt_a_alpha);
    let a0 = (a + 1.0) + (a - 1.0) * cos_w0 + two_sqrt_a_alpha;
    let a1 = -2.0 * ((a - 1.0) + (a + 1.0) * cos_w0);
    let a2 = (a + 1.0) + (a - 1.0) * cos_w0 - two_sqrt_a_alpha;

    BiquadCoeffs {
        b0: b0 / a0,
        b1: b1 / a0,
        b2: b2 / a0,
        a1: a1 / a0,
        a2: a2 / a0,
    }
}

fn design_high_shelf(fs: f32, f0: f32, gain_db: f32) -> BiquadCoeffs {
    if gain_db.abs() < 0.01 || f0 >= fs * 0.48 {
        return BiquadCoeffs::default();
    }
    let a = 10f32.powf(gain_db / 40.0);
    let w0 = 2.0 * PI * f0 / fs;
    let cos_w0 = w0.cos();
    let sin_w0 = w0.sin();
    let alpha = sin_w0 / 2.0 * std::f32::consts::SQRT_2;
    let two_sqrt_a_alpha = 2.0 * a.sqrt() * alpha;

    let b0 = a * ((a + 1.0) + (a - 1.0) * cos_w0 + two_sqrt_a_alpha);
    let b1 = -2.0 * a * ((a - 1.0) + (a + 1.0) * cos_w0);
    let b2 = a * ((a + 1.0) + (a - 1.0) * cos_w0 - two_sqrt_a_alpha);
    let a0 = (a + 1.0) - (a - 1.0) * cos_w0 + two_sqrt_a_alpha;
    let a1 = 2.0 * ((a - 1.0) - (a + 1.0) * cos_w0);
    let a2 = (a + 1.0) - (a - 1.0) * cos_w0 - two_sqrt_a_alpha;

    BiquadCoeffs {
        b0: b0 / a0,
        b1: b1 / a0,
        b2: b2 / a0,
        a1: a1 / a0,
        a2: a2 / a0,
    }
}

fn design_peaking(fs: f32, f0: f32, q: f32, gain_db: f32) -> BiquadCoeffs {
    if gain_db.abs() < 0.01 || f0 >= fs * 0.48 {
        return BiquadCoeffs::default();
    }
    let a = 10f32.powf(gain_db / 40.0);
    let w0 = 2.0 * PI * f0 / fs;
    let cos_w0 = w0.cos();
    let alpha = w0.sin() / (2.0 * q);

    let b0 = 1.0 + alpha * a;
    let b1 = -2.0 * cos_w0;
    let b2 = 1.0 - alpha * a;
    let a0 = 1.0 + alpha / a;
    let a1 = -2.0 * cos_w0;
    let a2 = 1.0 - alpha / a;

    BiquadCoeffs {
        b0: b0 / a0,
        b1: b1 / a0,
        b2: b2 / a0,
        a1: a1 / a0,
        a2: a2 / a0,
    }
}

const MAX_CH: usize = 8;

/// Zero-allocation real-time 10-band ISO Equalizer + transparent soft limiter `rodio::Source`.
pub struct EqSource<S> {
    inner: S,
    shared: Arc<SharedEq>,
    last_gen: u64,
    channels: usize,
    sample_rate: f32,
    ch_cursor: usize,
    enabled: bool,
    limiter: bool,
    target_preamp: f32,
    current_preamp: f32,
    target_wet: f32,
    current_wet: f32,
    coeffs: [BiquadCoeffs; 10],
    // Direct Form II Transposed delay states per band & channel
    z1: [[f32; MAX_CH]; 10],
    z2: [[f32; MAX_CH]; 10],
}

impl<S> EqSource<S>
where
    S: Source<Item = f32>,
{
    pub fn new(inner: S, shared: Arc<SharedEq>) -> Self {
        let channels = (inner.channels() as usize).clamp(1, MAX_CH);
        let sample_rate = inner.sample_rate().max(8000) as f32;
        let mut src = Self {
            inner,
            shared,
            last_gen: 0,
            channels,
            sample_rate,
            ch_cursor: 0,
            enabled: false,
            limiter: true,
            target_preamp: 1.0,
            current_preamp: 1.0,
            target_wet: 0.0,
            current_wet: 0.0,
            coeffs: [BiquadCoeffs::default(); 10],
            z1: [[0.0; MAX_CH]; 10],
            z2: [[0.0; MAX_CH]; 10],
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
        let peak_boost = cfg
            .bands_db
            .iter()
            .copied()
            .fold(0.0f32, f32::max);
        let total_boost = (cfg.preamp_db + peak_boost).max(0.0);
        let auto_trim = if cfg.enabled && cfg.limiter && total_boost > 2.5 {
            -(total_boost - 2.5) * 0.45
        } else {
            0.0
        };
        let eff_preamp = if cfg.enabled {
            cfg.preamp_db + auto_trim
        } else {
            0.0
        };
        self.target_preamp = 10f32.powf(eff_preamp / 20.0);

        for (i, &freq) in EQ_FREQS.iter().enumerate() {
            let db = if cfg.enabled { cfg.bands_db[i] } else { 0.0 };
            self.coeffs[i] = match i {
                0 => design_low_shelf(self.sample_rate, freq, db),
                9 => design_high_shelf(self.sample_rate, freq, db),
                _ => design_peaking(self.sample_rate, freq, 1.4, db),
            };
        }
    }

    fn reset_states(&mut self) {
        self.z1 = [[0.0; MAX_CH]; 10];
        self.z2 = [[0.0; MAX_CH]; 10];
        self.ch_cursor = 0;
    }

    #[inline]
    fn soft_limit(x: f32) -> f32 {
        // Transparent unity below 0.88; smooth asymptotic soft ceiling below 0.99
        let ax = x.abs();
        if ax <= 0.88 {
            x
        } else {
            let excess = ax - 0.88;
            let shaped = 0.88 + 0.11 * (excess / (0.11 + excess));
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
        self.ch_cursor = (ch + 1) % self.channels;

        // Check atomic generation once per audio frame (zero lock in steady state)
        if ch == 0 && self.shared.generation() != self.last_gen {
            self.sync_config();
        }

        // Smooth clickless crossfade & preamp ramp (~12ms)
        if ch == 0 {
            self.current_wet += (self.target_wet - self.current_wet) * 0.002;
            self.current_preamp += (self.target_preamp - self.current_preamp) * 0.002;
        }

        // Fast bit-exact bypass when EQ is fully off (0 DSP FLOPs!)
        if !self.enabled && self.current_wet < 0.0005 {
            self.current_wet = 0.0;
            return Some(dry);
        }

        let mut x = dry * self.current_preamp;
        for band in 0..10 {
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
        Some(dry * (1.0 - w) + x * w)
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
