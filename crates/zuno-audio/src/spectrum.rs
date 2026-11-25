use crate::engine::MIN_SAMPLE_RATE;
use serde::Serialize;
use std::f32::consts::PI;
use std::sync::OnceLock;
use std::sync::atomic::{AtomicU32, AtomicU64, Ordering};
use std::time::Instant;

pub const SPECTRUM_BANDS: usize = 24;
const FFT_N: usize = 1024;
const FFT_HOP: usize = FFT_N / 2; // 50% overlap Hann STFT for crisp transient response
/// Active window after the last UI poll; past this duration the audio thread skips all FFT work (0% idle CPU).
const ACTIVE_TTL_MS: u64 = 650;
const ATTACK_TAU_SECS: f32 = 0.024;
const RELEASE_TAU_SECS: f32 = 0.092;

#[derive(Debug, Clone, Serialize)]
pub struct AudioLevels {
    pub bands: [f32; SPECTRUM_BANDS],
    pub bass: f32,
    pub mid: f32,
    pub treble: f32,
    pub energy: f32,
}

impl Default for AudioLevels {
    fn default() -> Self {
        Self {
            bands: [0.0; SPECTRUM_BANDS],
            bass: 0.0,
            mid: 0.0,
            treble: 0.0,
            energy: 0.0,
        }
    }
}

/// Monotonic millisecond clock (1-based so `0` unambiguously means "never polled").
#[inline]
fn monotonic_ms() -> u64 {
    static EPOCH: OnceLock<Instant> = OnceLock::new();
    let start = EPOCH.get_or_init(Instant::now);
    start.elapsed().as_millis() as u64 + 1
}

/// Lock-free, zero-allocation shared real-time audio spectrum telemetry.
/// Written on the audio callback thread ONLY while the UI visualizer is actively polling;
/// stays 0% CPU when Now Playing is closed, minimized, or paused.
#[derive(Debug)]
pub struct SharedSpectrum {
    bands: [AtomicU32; SPECTRUM_BANDS],
    bass: AtomicU32,
    mid: AtomicU32,
    treble: AtomicU32,
    energy: AtomicU32,
    last_poll_ms: AtomicU64,
}

impl Default for SharedSpectrum {
    fn default() -> Self {
        Self::new()
    }
}

impl SharedSpectrum {
    pub fn new() -> Self {
        Self {
            bands: std::array::from_fn(|_| AtomicU32::new(0)),
            bass: AtomicU32::new(0),
            mid: AtomicU32::new(0),
            treble: AtomicU32::new(0),
            energy: AtomicU32::new(0),
            last_poll_ms: AtomicU64::new(0),
        }
    }

    #[inline]
    pub fn is_active(&self) -> bool {
        let last = self.last_poll_ms.load(Ordering::Relaxed);
        if last == 0 {
            return false;
        }
        monotonic_ms().saturating_sub(last) <= ACTIVE_TTL_MS
    }

    pub fn publish(&self, levels: &AudioLevels) {
        for (dst, &val) in self.bands.iter().zip(levels.bands.iter()) {
            dst.store(val.clamp(0.0, 1.0).to_bits(), Ordering::Relaxed);
        }
        self.bass.store(levels.bass.clamp(0.0, 1.0).to_bits(), Ordering::Relaxed);
        self.mid.store(levels.mid.clamp(0.0, 1.0).to_bits(), Ordering::Relaxed);
        self.treble.store(levels.treble.clamp(0.0, 1.0).to_bits(), Ordering::Relaxed);
        self.energy.store(levels.energy.clamp(0.0, 1.0).to_bits(), Ordering::Release);
    }

    pub fn clear(&self) {
        for dst in &self.bands {
            dst.store(0, Ordering::Relaxed);
        }
        self.bass.store(0, Ordering::Relaxed);
        self.mid.store(0, Ordering::Relaxed);
        self.treble.store(0, Ordering::Relaxed);
        self.energy.store(0, Ordering::Release);
    }

    /// Reads the latest levels and refreshes the active TTL so the audio thread feeds the visualizer.
    pub fn snapshot(&self) -> AudioLevels {
        self.last_poll_ms.store(monotonic_ms(), Ordering::Relaxed);
        let energy = f32::from_bits(self.energy.load(Ordering::Acquire));
        let mut bands = [0.0f32; SPECTRUM_BANDS];
        for (dst, src) in bands.iter_mut().zip(self.bands.iter()) {
            *dst = f32::from_bits(src.load(Ordering::Relaxed));
        }
        AudioLevels {
            bands,
            bass: f32::from_bits(self.bass.load(Ordering::Relaxed)),
            mid: f32::from_bits(self.mid.load(Ordering::Relaxed)),
            treble: f32::from_bits(self.treble.load(Ordering::Relaxed)),
            energy,
        }
    }
}

/// Zero-allocation stack-resident 1024-point radix-2 STFT analyzer (50% Hann overlap,
/// precomputed bit-reversal & twiddle tables, sample-rate-normalized attack/release smoothing).
pub struct SpectrumAnalyzer {
    ring: [f32; FFT_N],
    ring_pos: usize,
    hop_count: usize,
    re: [f32; FFT_N],
    im: [f32; FFT_N],
    hann: [f32; FFT_N],
    bit_rev: [usize; FFT_N],
    tw_re: [f32; FFT_N / 2],
    tw_im: [f32; FFT_N / 2],
    band_edges: [usize; SPECTRUM_BANDS + 1],
    attack_alpha: f32,
    release_alpha: f32,
    idle_skip_interval: u32,
    smoothed: AudioLevels,
    idle_skip_counter: u32,
    cached_active: bool,
}

impl SpectrumAnalyzer {
    pub fn new(sample_rate: f32) -> Self {
        let fs = sample_rate.max(MIN_SAMPLE_RATE as f32);
        let mut hann = [0.0f32; FFT_N];
        for (i, slot) in hann.iter_mut().enumerate() {
            *slot = 0.5 * (1.0 - (2.0 * PI * i as f32 / (FFT_N - 1) as f32).cos());
        }

        // Precompute bit-reversal indices once (0 bit-twiddling work per FFT frame).
        let bits = FFT_N.trailing_zeros();
        let mut bit_rev = [0usize; FFT_N];
        for (i, slot) in bit_rev.iter_mut().enumerate() {
            *slot = i.reverse_bits() >> (usize::BITS - bits);
        }

        // Precompute exact twiddle factors `exp(-2pi*i*k/N)` once (eliminates trig & drift).
        let mut tw_re = [0.0f32; FFT_N / 2];
        let mut tw_im = [0.0f32; FFT_N / 2];
        for k in 0..(FFT_N / 2) {
            let ang = -2.0 * PI * k as f32 / FFT_N as f32;
            tw_re[k] = ang.cos();
            tw_im[k] = ang.sin();
        }

        // Logarithmically spaced frequency bands from 35 Hz to min(15 kHz, Nyquist * 0.92).
        let f_min = 35.0f32;
        let f_max = (fs * 0.46).min(15_000.0).max(2000.0);
        let bin_hz = fs / FFT_N as f32;
        let mut band_edges = [1usize; SPECTRUM_BANDS + 1];
        for b in 0..=SPECTRUM_BANDS {
            let frac = b as f32 / SPECTRUM_BANDS as f32;
            let freq = f_min * (f_max / f_min).powf(frac);
            let mut bin = (freq / bin_hz).round() as usize;
            bin = bin.clamp(1, FFT_N / 2 - 1);
            if b > 0 && bin <= band_edges[b - 1] {
                bin = (band_edges[b - 1] + 1).min(FFT_N / 2 - 1);
            }
            band_edges[b] = bin;
        }

        let hop_secs = FFT_HOP as f32 / fs;
        let attack_alpha = (1.0 - (-hop_secs / ATTACK_TAU_SECS).exp()).clamp(0.1, 0.95);
        let release_alpha = (1.0 - (-hop_secs / RELEASE_TAU_SECS).exp()).clamp(0.04, 0.85);
        let idle_skip_interval = ((fs * 0.005).round() as u32).clamp(64, 1024);

        Self {
            ring: [0.0; FFT_N],
            ring_pos: 0,
            hop_count: 0,
            re: [0.0; FFT_N],
            im: [0.0; FFT_N],
            hann,
            bit_rev,
            tw_re,
            tw_im,
            band_edges,
            attack_alpha,
            release_alpha,
            idle_skip_interval,
            smoothed: AudioLevels::default(),
            idle_skip_counter: 0,
            cached_active: false,
        }
    }

    pub fn reset(&mut self) {
        self.ring.fill(0.0);
        self.ring_pos = 0;
        self.hop_count = 0;
        self.smoothed = AudioLevels::default();
    }

    /// Feed one mono audio frame. Checks active TTL once every ~5ms so idle cost is ~0.
    #[inline]
    pub fn push_mono(&mut self, sample: f32, target: &SharedSpectrum) {
        if self.idle_skip_counter == 0 {
            self.cached_active = target.is_active();
            self.idle_skip_counter = self.idle_skip_interval;
            if !self.cached_active {
                self.hop_count = 0;
            }
        }
        self.idle_skip_counter -= 1;
        if !self.cached_active {
            return;
        }

        self.ring[self.ring_pos] = sample;
        self.ring_pos = (self.ring_pos + 1) & (FFT_N - 1);
        self.hop_count += 1;
        if self.hop_count >= FFT_HOP {
            self.hop_count = 0;
            self.compute_and_publish(target);
        }
    }

    fn compute_and_publish(&mut self, target: &SharedSpectrum) {
        let mut sum_sq = 0.0f32;
        for i in 0..FFT_N {
            let s = self.ring[(self.ring_pos + i) & (FFT_N - 1)];
            sum_sq += s * s;
            let dst = self.bit_rev[i];
            self.re[dst] = s * self.hann[i];
            self.im[dst] = 0.0;
        }
        let rms = (sum_sq / FFT_N as f32).sqrt();
        let raw_energy = (rms * 3.8).tanh().clamp(0.0, 1.0);

        fft_radix2_precomputed(&mut self.re, &mut self.im, &self.tw_re, &self.tw_im);

        let inv_n = 2.0 / FFT_N as f32;
        let mut raw_bands = [0.0f32; SPECTRUM_BANDS];

        for b in 0..SPECTRUM_BANDS {
            let start = self.band_edges[b];
            let end = self.band_edges[b + 1].max(start + 1).min(FFT_N / 2);
            let mut peak = 0.0f32;
            let mut sum = 0.0f32;
            let count = (end - start) as f32;
            for k in start..end {
                let mag = (self.re[k] * self.re[k] + self.im[k] * self.im[k]).sqrt() * inv_n;
                if mag > peak {
                    peak = mag;
                }
                sum += mag;
            }
            let avg = sum / count.max(1.0);
            let blended = peak * 0.65 + avg * 0.35;
            // Gentle perceptual pink-noise tilt compensation so mids & highs feel lively beside bass
            let tilt = 1.0 + (b as f32 / SPECTRUM_BANDS as f32) * 2.2;
            let val = ((blended * 14.0 * tilt).ln_1p() / 2.65).clamp(0.0, 1.0);
            raw_bands[b] = val;
        }

        let avg_range = |lo: usize, hi: usize| -> f32 {
            let mut s = 0.0f32;
            let mut peak = 0.0f32;
            for &v in &raw_bands[lo..hi] {
                s += v;
                if v > peak {
                    peak = v;
                }
            }
            let mean = s / (hi - lo).max(1) as f32;
            (mean * 0.55 + peak * 0.45).clamp(0.0, 1.0)
        };

        let bass_end = (SPECTRUM_BANDS * 5 / 24).clamp(1, SPECTRUM_BANDS);
        let mid_end = (SPECTRUM_BANDS * 15 / 24).clamp(bass_end + 1, SPECTRUM_BANDS);
        let raw_bass = avg_range(0, bass_end);
        let raw_mid = avg_range(bass_end, mid_end);
        let raw_treble = avg_range(mid_end, SPECTRUM_BANDS);

        // Sample-rate-normalized attack/release envelope smoothing
        let atk = self.attack_alpha;
        let rel = self.release_alpha;
        let smooth = |cur: f32, next: f32| -> f32 {
            let alpha = if next > cur { atk } else { rel };
            cur + (next - cur) * alpha
        };

        for b in 0..SPECTRUM_BANDS {
            self.smoothed.bands[b] = smooth(self.smoothed.bands[b], raw_bands[b]);
        }
        self.smoothed.bass = smooth(self.smoothed.bass, raw_bass);
        self.smoothed.mid = smooth(self.smoothed.mid, raw_mid);
        self.smoothed.treble = smooth(self.smoothed.treble, raw_treble);
        self.smoothed.energy = smooth(self.smoothed.energy, raw_energy);

        target.publish(&self.smoothed);
    }
}

/// Pure-Rust zero-allocation iterative Cooley-Tukey radix-2 FFT using precomputed twiddle tables.
/// Expects input already placed in bit-reversed order.
fn fft_radix2_precomputed(
    re: &mut [f32; FFT_N],
    im: &mut [f32; FFT_N],
    tw_re: &[f32; FFT_N / 2],
    tw_im: &[f32; FFT_N / 2],
) {
    let mut len = 2usize;
    while len <= FFT_N {
        let half = len >> 1;
        let step = FFT_N / len;

        let mut i = 0;
        while i < FFT_N {
            for k in 0..half {
                let tw_idx = k * step;
                let w_re = tw_re[tw_idx];
                let w_im = tw_im[tw_idx];

                let u_re = re[i + k];
                let u_im = im[i + k];
                let v_re = re[i + k + half] * w_re - im[i + k + half] * w_im;
                let v_im = re[i + k + half] * w_im + im[i + k + half] * w_re;

                re[i + k] = u_re + v_re;
                im[i + k] = u_im + v_im;
                re[i + k + half] = u_re - v_re;
                im[i + k + half] = u_im - v_im;
            }
            i += len;
        }
        len <<= 1;
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn fft_distinguishes_bass_and_treble_and_stays_idle_until_polled() {
        let shared = SharedSpectrum::new();
        let mut analyzer = SpectrumAnalyzer::new(44_100.0);

        // Inactive before any UI poll
        assert!(!shared.is_active());
        for i in 0..2048 {
            analyzer.push_mono((2.0 * PI * 90.0 * i as f32 / 44_100.0).sin() * 0.8, &shared);
        }
        let idle = shared.snapshot();
        assert_eq!(idle.bass, 0.0);

        // Now active after snapshot() refreshed TTL: feed 90 Hz bass tone
        assert!(shared.is_active());
        for i in 0..4096 {
            analyzer.push_mono((2.0 * PI * 90.0 * i as f32 / 44_100.0).sin() * 0.8, &shared);
        }
        let bass_levels = shared.snapshot();
        assert!(
            bass_levels.bass > bass_levels.treble * 2.0 && bass_levels.bass > 0.25,
            "expected strong bass dominance, got bass={} treble={}",
            bass_levels.bass,
            bass_levels.treble
        );

        // Reset and feed 6 kHz treble tone
        analyzer.reset();
        shared.clear();
        for i in 0..4096 {
            analyzer.push_mono((2.0 * PI * 6_000.0 * i as f32 / 44_100.0).sin() * 0.8, &shared);
        }
        let treble_levels = shared.snapshot();
        assert!(
            treble_levels.treble > treble_levels.bass * 2.0 && treble_levels.treble > 0.25,
            "expected strong treble dominance, got bass={} treble={}",
            treble_levels.bass,
            treble_levels.treble
        );
    }
}
