use rodio::source::SeekError;
use rodio::Source;
use std::fmt;
use std::fs::File;
use std::io::{BufReader, Read, Seek, SeekFrom};
use std::path::Path;
use std::time::Duration;
use symphonia::core::audio::{AudioBufferRef, SampleBuffer, SignalSpec};
use symphonia::core::codecs::{CODEC_TYPE_NULL, Decoder, DecoderOptions};
use symphonia::core::errors::Error as SymphoniaError;
use symphonia::core::formats::{FormatOptions, FormatReader, SeekMode, SeekTo, SeekedTo};
use symphonia::core::io::{MediaSource, MediaSourceStream};
use symphonia::core::meta::MetadataOptions;
use symphonia::core::probe::Hint;
use symphonia::core::units::{self, Time};
use zuno_core::{Result, ZunoError};

/// Maximum consecutive malformed audio packets tolerated before aborting decode.
const MAX_DECODE_RETRIES: usize = 8;
const FILE_READ_BUF_BYTES: usize = 128 * 1024;

/// Seekable file-backed `MediaSource` that reports the real OS file length via `byte_len()`.
///
/// Rodio 0.20's built-in `ReadSeekSource` hardcodes `byte_len() -> None` while claiming
/// `is_seekable() -> true`, which causes Symphonia's ISO-MP4 (`.m4a`/`.mp4`) and FLAC demuxers to
/// return `Error::SeekError(Unseekable)` during format probing — triggering an `unreachable!()`
/// panic inside Rodio 0.20 (`rodio/src/decoder/symphonia.rs:45`). Reporting the true file length
/// fixes M4A/MP4/FLAC playback cleanly and avoids panics completely.
struct BufferedFileMediaSource {
    reader: BufReader<File>,
    byte_len: Option<u64>,
}

impl BufferedFileMediaSource {
    fn open(path: &Path) -> std::io::Result<Self> {
        let file = File::open(path)?;
        let byte_len = file.metadata().ok().map(|m| m.len());
        Ok(Self {
            reader: BufReader::with_capacity(FILE_READ_BUF_BYTES, file),
            byte_len,
        })
    }
}

impl MediaSource for BufferedFileMediaSource {
    fn is_seekable(&self) -> bool {
        self.byte_len.is_some()
    }

    fn byte_len(&self) -> Option<u64> {
        self.byte_len
    }
}

impl Read for BufferedFileMediaSource {
    fn read(&mut self, buf: &mut [u8]) -> std::io::Result<usize> {
        self.reader.read(buf)
    }
}

impl Seek for BufferedFileMediaSource {
    fn seek(&mut self, pos: SeekFrom) -> std::io::Result<u64> {
        self.reader.seek(pos)
    }
}

#[derive(Debug)]
struct SymphoniaSeekError(String);

impl fmt::Display for SymphoniaSeekError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        f.write_str(&self.0)
    }
}

impl std::error::Error for SymphoniaSeekError {}

/// Panic-free pure-Rust Symphonia audio source yielding interleaved `f32` samples for Rodio.
///
/// Replaces Rodio 0.20's `Decoder::new` wrapper with:
/// - True `byte_len()` reporting (fixes M4A/MP4/FLAC `SeekError` initialization panics)
/// - Extension probing hints from the file path
/// - Native `f32` sample output (no intermediate `i16` quantization)
/// - Safe `total_duration()` calculation and `saturating_sub` seek refinement
/// - Clean multi-track packet filtering and `ResetRequired` decoder recovery
pub struct SymphoniaFileSource {
    format: Box<dyn FormatReader>,
    decoder: Box<dyn Decoder>,
    track_id: u32,
    total_duration: Option<Time>,
    buffer: SampleBuffer<f32>,
    spec: SignalSpec,
    sample_offset: usize,
}

impl SymphoniaFileSource {
    pub fn open(path: &Path) -> Result<Self> {
        let source = BufferedFileMediaSource::open(path)?;
        let mss = MediaSourceStream::new(Box::new(source), Default::default());

        let mut hint = Hint::new();
        if let Some(ext) = path.extension().and_then(|e| e.to_str()) {
            hint.with_extension(ext);
        }

        let format_opts = FormatOptions {
            enable_gapless: true,
            ..Default::default()
        };
        let probed = symphonia::default::get_probe()
            .format(&hint, mss, &format_opts, &MetadataOptions::default())
            .map_err(|e| ZunoError::Audio(format!("failed to probe {}: {e}", path.display())))?;

        let mut format = probed.format;

        // Prefer the container's default track if it has a supported codec; otherwise first supported track.
        let selected_track = format
            .default_track()
            .filter(|t| t.codec_params.codec != CODEC_TYPE_NULL)
            .or_else(|| {
                format
                    .tracks()
                    .iter()
                    .find(|t| t.codec_params.codec != CODEC_TYPE_NULL)
            })
            .ok_or_else(|| {
                ZunoError::Audio(format!("no supported audio track in {}", path.display()))
            })?;

        let track_id = selected_track.id;
        let codec_params = selected_track.codec_params.clone();
        let total_duration = codec_params
            .time_base
            .zip(codec_params.n_frames)
            .map(|(base, frames)| base.calc_time(frames));

        let mut decoder = symphonia::default::get_codecs()
            .make(&codec_params, &DecoderOptions::default())
            .map_err(|e| {
                ZunoError::Audio(format!("unsupported codec in {}: {e}", path.display()))
            })?;

        let (spec, buffer) = decode_next_packet(format.as_mut(), decoder.as_mut(), track_id)
            .map_err(|e| ZunoError::Audio(format!("failed to decode {}: {e}", path.display())))?
            .ok_or_else(|| {
                ZunoError::Audio(format!("no decodable audio frames in {}", path.display()))
            })?;

        if spec.channels.count() == 0 || spec.rate == 0 {
            return Err(ZunoError::Audio(format!(
                "invalid audio stream parameters in {}",
                path.display()
            )));
        }

        Ok(Self {
            format,
            decoder,
            track_id,
            total_duration,
            buffer,
            spec,
            sample_offset: 0,
        })
    }

    fn copy_buffer(decoded: AudioBufferRef<'_>, spec: SignalSpec) -> SampleBuffer<f32> {
        let capacity = units::Duration::from(decoded.capacity().max(1) as u64);
        let mut buf = SampleBuffer::<f32>::new(capacity, spec);
        buf.copy_interleaved_ref(decoded);
        buf
    }

    fn refine_seek(&mut self, seek_res: SeekedTo) -> std::result::Result<(), SeekError> {
        let mut frames_to_skip = seek_res.required_ts.saturating_sub(seek_res.actual_ts);

        let packet = loop {
            let candidate = match self.format.next_packet() {
                Ok(pkt) => pkt,
                Err(e) => {
                    return Err(SeekError::Other(Box::new(SymphoniaSeekError(format!(
                        "seek refinement packet read failed: {e}"
                    )))));
                }
            };
            if candidate.track_id() != self.track_id {
                continue;
            }
            if candidate.dur() > frames_to_skip {
                break candidate;
            }
            frames_to_skip = frames_to_skip.saturating_sub(candidate.dur());
        };

        let mut decode_errors = 0usize;
        let mut cur_packet = packet;
        let decoded = loop {
            match self.decoder.decode(&cur_packet) {
                Ok(buf) => break buf,
                Err(SymphoniaError::ResetRequired) => {
                    self.decoder.reset();
                    decode_errors += 1;
                    if decode_errors > MAX_DECODE_RETRIES {
                        return Err(SeekError::Other(Box::new(SymphoniaSeekError(
                            "seek decode reset limit exceeded".into(),
                        ))));
                    }
                }
                Err(SymphoniaError::DecodeError(msg)) => {
                    decode_errors += 1;
                    if decode_errors > MAX_DECODE_RETRIES {
                        return Err(SeekError::Other(Box::new(SymphoniaSeekError(format!(
                            "seek decode failed: {msg}"
                        )))));
                    }
                    cur_packet = loop {
                        match self.format.next_packet() {
                            Ok(pkt) if pkt.track_id() == self.track_id => break pkt,
                            Ok(_) => continue,
                            Err(e) => {
                                return Err(SeekError::Other(Box::new(SymphoniaSeekError(
                                    format!("seek retry read failed: {e}"),
                                ))));
                            }
                        }
                    };
                }
                Err(e) => {
                    return Err(SeekError::Other(Box::new(SymphoniaSeekError(format!(
                        "seek decode error: {e}"
                    )))));
                }
            }
        };

        let spec = *decoded.spec();
        if spec.channels.count() > 0 && spec.rate > 0 {
            self.spec = spec;
        }
        self.buffer = Self::copy_buffer(decoded, self.spec);
        let channels = self.channels().max(1) as usize;
        let max_offset = self.buffer.samples().len();
        let raw_offset = (frames_to_skip as usize).saturating_mul(channels);
        self.sample_offset = raw_offset.min(max_offset);
        // Keep channel alignment intact
        self.sample_offset -= self.sample_offset % channels;
        Ok(())
    }
}

fn decode_next_packet(
    format: &mut dyn FormatReader,
    decoder: &mut dyn Decoder,
    track_id: u32,
) -> std::result::Result<Option<(SignalSpec, SampleBuffer<f32>)>, SymphoniaError> {
    let mut decode_errors = 0usize;
    loop {
        let packet = match format.next_packet() {
            Ok(pkt) => pkt,
            Err(SymphoniaError::IoError(err))
                if err.kind() == std::io::ErrorKind::UnexpectedEof =>
            {
                return Ok(None);
            }
            Err(SymphoniaError::IoError(_)) => return Ok(None),
            Err(SymphoniaError::ResetRequired) => {
                decoder.reset();
                decode_errors += 1;
                if decode_errors > MAX_DECODE_RETRIES {
                    return Err(SymphoniaError::ResetRequired);
                }
                continue;
            }
            Err(e) => return Err(e),
        };

        if packet.track_id() != track_id {
            continue;
        }

        match decoder.decode(&packet) {
            Ok(decoded) => {
                if decoded.frames() == 0 {
                    continue;
                }
                let spec = *decoded.spec();
                let buf = SymphoniaFileSource::copy_buffer(decoded, spec);
                if buf.samples().is_empty() {
                    continue;
                }
                return Ok(Some((spec, buf)));
            }
            Err(SymphoniaError::ResetRequired) => {
                decoder.reset();
                decode_errors += 1;
                if decode_errors > MAX_DECODE_RETRIES {
                    return Err(SymphoniaError::ResetRequired);
                }
            }
            Err(SymphoniaError::DecodeError(msg)) => {
                decode_errors += 1;
                if decode_errors > MAX_DECODE_RETRIES {
                    return Err(SymphoniaError::DecodeError(msg));
                }
            }
            Err(SymphoniaError::IoError(_)) => return Ok(None),
            Err(e) => return Err(e),
        }
    }
}

impl Iterator for SymphoniaFileSource {
    type Item = f32;

    #[inline]
    fn next(&mut self) -> Option<f32> {
        while self.sample_offset >= self.buffer.samples().len() {
            match decode_next_packet(self.format.as_mut(), self.decoder.as_mut(), self.track_id) {
                Ok(Some((spec, buf))) => {
                    if spec.channels.count() > 0 && spec.rate > 0 {
                        self.spec = spec;
                    }
                    self.buffer = buf;
                    self.sample_offset = 0;
                }
                Ok(None) | Err(_) => return None,
            }
        }
        let sample = *self.buffer.samples().get(self.sample_offset)?;
        self.sample_offset += 1;
        Some(sample)
    }
}

impl Source for SymphoniaFileSource {
    #[inline]
    fn current_frame_len(&self) -> Option<usize> {
        Some(self.buffer.samples().len().saturating_sub(self.sample_offset))
    }

    #[inline]
    fn channels(&self) -> u16 {
        (self.spec.channels.count() as u16).max(1)
    }

    #[inline]
    fn sample_rate(&self) -> u32 {
        self.spec.rate.max(1)
    }

    #[inline]
    fn total_duration(&self) -> Option<Duration> {
        self.total_duration.map(|Time { seconds, frac }| {
            let clamped_frac = if frac.is_finite() {
                frac.clamp(0.0, 0.999_999_999)
            } else {
                0.0
            };
            let nanos = (clamped_frac * 1_000_000_000.0).round() as u32;
            Duration::new(seconds, nanos.min(999_999_999))
        })
    }

    fn try_seek(&mut self, pos: Duration) -> std::result::Result<(), SeekError> {
        let seek_beyond_end = self
            .total_duration()
            .is_some_and(|dur| dur.saturating_sub(pos).as_millis() < 1);

        let time = if seek_beyond_end {
            let mut t = self.total_duration.unwrap_or(Time { seconds: 0, frac: 0.0 });
            t.frac -= 0.001;
            if t.frac < 0.0 {
                if t.seconds > 0 {
                    t.seconds -= 1;
                    t.frac = (1.0 + t.frac).clamp(0.0, 0.999);
                } else {
                    t.frac = 0.0;
                }
            }
            t
        } else {
            pos.as_secs_f64().into()
        };

        let seek_res = self
            .format
            .seek(
                SeekMode::Accurate,
                SeekTo::Time {
                    time,
                    track_id: Some(self.track_id),
                },
            )
            .map_err(|e| {
                SeekError::Other(Box::new(SymphoniaSeekError(format!(
                    "format seek failed: {e}"
                ))))
            })?;

        self.decoder.reset();
        self.refine_seek(seek_res)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;
    use tempfile::tempdir;

    fn write_test_wav(path: &Path, sample_rate: u32, num_frames: usize) {
        let channels: u16 = 2;
        let bits_per_sample: u16 = 16;
        let byte_rate = sample_rate * channels as u32 * (bits_per_sample as u32 / 8);
        let block_align = channels * (bits_per_sample / 8);
        let data_size = (num_frames * channels as usize * 2) as u32;
        let riff_size = 36 + data_size;

        let mut bytes = Vec::with_capacity(44 + data_size as usize);
        bytes.extend_from_slice(b"RIFF");
        bytes.extend_from_slice(&riff_size.to_le_bytes());
        bytes.extend_from_slice(b"WAVE");
        bytes.extend_from_slice(b"fmt ");
        bytes.extend_from_slice(&16u32.to_le_bytes());
        bytes.extend_from_slice(&1u16.to_le_bytes()); // PCM
        bytes.extend_from_slice(&channels.to_le_bytes());
        bytes.extend_from_slice(&sample_rate.to_le_bytes());
        bytes.extend_from_slice(&byte_rate.to_le_bytes());
        bytes.extend_from_slice(&block_align.to_le_bytes());
        bytes.extend_from_slice(&bits_per_sample.to_le_bytes());
        bytes.extend_from_slice(b"data");
        bytes.extend_from_slice(&data_size.to_le_bytes());
        for i in 0..(num_frames * channels as usize) {
            let sample = ((i as f32 * 0.05).sin() * 12000.0) as i16;
            bytes.extend_from_slice(&sample.to_le_bytes());
        }
        fs::write(path, bytes).unwrap();
    }

    #[test]
    fn decodes_and_seeks_valid_wav_with_accurate_duration() {
        let tmp = tempdir().unwrap();
        let wav = tmp.path().join("tone.wav");
        write_test_wav(&wav, 44_100, 44_100); // 1.0s stereo

        let mut src = SymphoniaFileSource::open(&wav).unwrap();
        assert_eq!(src.channels(), 2);
        assert_eq!(src.sample_rate(), 44_100);
        let dur = src.total_duration().expect("duration present");
        assert!((dur.as_secs_f64() - 1.0).abs() < 0.01);

        let first = src.next();
        assert!(first.is_some());
        src.try_seek(Duration::from_millis(500)).unwrap();
        assert!(src.next().is_some());
    }

    #[test]
    fn malformed_m4a_and_corrupt_files_return_clean_error_without_panicking() {
        let tmp = tempdir().unwrap();
        // Minimal MP4 ftyp header (previously triggered Rodio 0.20's `SeekError` unreachable! panic!)
        let bad_m4a = tmp.path().join("broken.m4a");
        fs::write(
            &bad_m4a,
            b"\x00\x00\x00\x18ftypM4A \x00\x00\x00\x00M4A isom\x00\x00\x00\x08free",
        )
        .unwrap();
        let res = SymphoniaFileSource::open(&bad_m4a);
        assert!(res.is_err(), "truncated M4A must return Err, never panic");

        let garbage = tmp.path().join("corrupt.mp3");
        fs::write(&garbage, b"not-a-valid-audio-file").unwrap();
        assert!(SymphoniaFileSource::open(&garbage).is_err());
    }
}
