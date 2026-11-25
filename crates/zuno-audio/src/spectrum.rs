use serde::Serialize;
use std::f32::consts::PI;
use std::sync::atomic::{AtomicU32, AtomicU64, Ordering};
use std::time::{SystemTime, UNIX_EPOCH};

pub const SPECTRUM_BANDS: usize = 24;
const FFT_N: usize = 1024;
/// Active window after the last UI poll; past this duration the audio thread skips all FFT work (0% idle CPU).
const ACTIVE_TTL_MS: u64 = 650;

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

#[inline]
fn now_ms() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_millis() as u64)
        .unwrap_or(0)
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
        now_ms().saturating_sub(last) <= ACTIVE_TTL_MS
    }

    pub fn publish(&self, levels: &AudioLevels) {
        for (dst, &val) in self.bands.iter().zip(levels.bands.iter()) {
            dst.store(val.clamp(0.0, 1.0).to_bits(), Ordering::Relaxed);
        }
        self.bass.store(levels.bass.clamp(0.0, 1.0).to_bits(), Ordering::Relaxed);
        self.mid.store(levels.mid.clamp(0.0, 1.0).to_bits(), Ordering::Relaxed);
        self.treble.store(levels.treble.clamp(0.0, 1.0).to_bits(), Ordering::Relaxed);
        self.energy.store(levels.energy.clamp(0.0, 1.0).to_bits(), Ordering::Relaxed);
    }

    pub fn clear(&self) {
        for dst in &self.bands {
            dst.store(0, Ordering::Relaxed);
        }
        self.bass.store(0, Ordering::Relaxed);
        self.mid.store(0, Ordering::Relaxed);
        self.treble.store(0, Ordering::Relaxed);
        self.energy.store(0, Ordering::Relaxed);
    }

    /// Reads the latest levels and refreshes the active TTL so the audio thread feeds the visualizer.
    pub fn snapshot(&self) -> AudioLevels {
        self.last_poll_ms.store(now_ms(), Ordering::Relaxed);
        let mut bands = [0.0f32; SPECTRUM_BANDS];
        for (dst, src) in bands.iter_mut().zip(self.bands.iter()) {
            *dst = f32::from_bits(src.load(Ordering::Relaxed));
        }
        AudioLevels {
            bands,
            bass: f32::from_bits(self.bass.load(Ordering::Relaxed)),
            mid: f32::from_bits(self.mid.load(Ordering::Relaxed)),
            treble: f32::from_bits(self.treble.load(Ordering::Relaxed)),
            energy: f32::from_bits(self.energy.load(Ordering::Relaxed)),
        }
    }
}

/// Zero-allocation stack-resident 1024-point radix-2 FFT analyzer embedded in `EqSource`.
pub struct SpectrumAnalyzer {
    sample_rate: f32,
    buf: [f32; FFT_N],
    re: [f32; FFT_N],
    im: [f32; FFT_N],
    hann: [f32; FFT_N],
    band_edges: [usize; SPECTRUM_BANDS + 1],
    smoothed: AudioLevels,
    pos: usize,
    idle_skip_counter: u32,
    cached_active: bool,
}

impl SpectrumAnalyzer {
    pub fn new(sample_rate: f32) -> Self {
        let fs = sample_rate.max(8000.0);
        let mut hann = [0.0f32; FFT_N];
        for (i, slot) in hann.iter_mut().enumerate() {
            *slot = 0.5 * (1.0 - (2.0 * PI * i as f32 / (FFT_N - 1) as f32).cos());
        }

        // 24 logarithmically spaced frequency bands from 35 Hz to min(15 kHz, Nyquist * 0.92)
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

        Self {
            sample_rate: fs,
            buf: [0.0; FFT_N],
            re: [0.0; FFT_N],
            im: [0.0; FFT_N],
            hann,
            band_edges,
            smoothed: AudioLevels::default(),
            pos: 0,
            idle_skip_counter: 0,
            cached_active: false,
        }
    }

    pub fn reset(&mut self) {
        self.pos = 0;
        self.smoothed = AudioLevels::default();
    }

    /// Feed one mono audio frame. Checks active TTL once every 256 frames (~5ms) so idle cost is ~0.
    #[inline]
    pub fn push_mono(&mut self, sample: f32, target: &SharedSpectrum) {
        if self.idle_skip_counter == 0 {
            self.cached_active = target.is_active();
            self.idle_skip_counter = 256;
            if !self.cached_active {
                self.pos = 0;
            }
        }
        self.idle_skip_counter -= 1;
        if !self.cached_active {
            return;
        }

        self.buf[self.pos] = sample;
        self.pos += 1;
        if self.pos >= FFT_N {
            self.pos = 0;
            self.compute_and_publish(target);
        }
    }

    fn compute_and_publish(&mut self, target: &SharedSpectrum) {
        let mut sum_sq = 0.0f32;
        for i in 0..FFT_N {
            let s = self.buf[i];
            sum_sq += s * s;
            self.re[i] = s * self.hann[i];
            self.im[i] = 0.0;
        }
        let rms = (sum_sq / FFT_N as f32).sqrt();
        let raw_energy = (rms * 3.8).tanh().clamp(0.0, 1.0);

        fft_radix2_in_place(&mut self.re, &mut self.im);

        let inv_n = 2.0 / FFT_N as f32;
        let _ = self.sample_rate;
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

        let raw_bass = avg_range(0, 5);
        let raw_mid = avg_range(5, 15);
        let raw_treble = avg_range(15, SPECTRUM_BANDS);

        // Musical attack/release smoothing: fast punchy attack, organic release
        let smooth = |cur: f32, next: f32| -> f32 {
            let alpha = if next > cur { 0.62 } else { 0.22 };
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

/// Pure-Rust zero-allocation iterative Cooley-Tukey radix-2 FFT.
fn fft_radix2_in_place(re: &mut [f32; FFT_N], im: &mut [f32; FFT_N]) {
    let mut j = 0usize;
    for i in 1..FFT_N {
        let mut bit = FFT_N >> 1;
        while j & bit != 0 {
            j ^= bit;
            bit >>= 1;
        }
        j ^= bit;
        if i < j {
            re.swap(i, j);
            im.swap(i, j);
        }
    }

    let mut len = 2usize;
    while len <= FFT_N {
        let half = len >> 1;
        let ang = -2.0 * PI / len as f32;
        let wlen_re = ang.cos();
        let wlen_im = ang.sin();

        let mut i = 0;
        while i < FFT_N {
            let mut w_re = 1.0f32;
            let mut w_im = 0.0f32;
            for k in 0..half {
                let u_re = re[i + k];
                let u_im = im[i + k];
                let v_re = re[i + k + half] * w_re - im[i + k + half] * w_im;
                let v_im = re[i + k + half] * w_im + im[i + k + half] * w_re;

                re[i + k] = u_re + v_re;
                im[i + k] = u_im + v_im;
                re[i + k + half] = u_re - v_re;
                im[i + k + half] = u_im - v_im;

                let next_w_re = w_re * wlen_re - w_im * wlen_im;
                w_im = w_re * wlen_im + w_im * wlen_re;
                w_re = next_w_re;
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
