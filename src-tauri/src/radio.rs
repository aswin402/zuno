use serde::{Deserialize, Serialize};
use std::collections::HashSet;
use std::fs;
use std::path::Path;
use std::process::{Child, Command, Stdio};
use std::sync::Mutex;
use zuno_audio::ZunoService;
use zuno_core::ZunoPaths;

const RADIO_BROWSER_MIRRORS: &[&str] = &[
    "https://de1.api.radio-browser.info",
    "https://de2.api.radio-browser.info",
    "https://fi1.api.radio-browser.info",
    "https://all.api.radio-browser.info",
];

fn default_band() -> String {
    "global".to_string()
}

fn default_freq() -> f64 {
    98.3
}

fn default_true() -> bool {
    true
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct OnlineStationRecord {
    pub id: String,
    pub name: String,
    pub url: String,
    #[serde(default)]
    pub category: String,
    #[serde(default)]
    pub country: String,
    #[serde(default)]
    pub language: String,
    #[serde(default)]
    pub tags: Vec<String>,
    #[serde(default)]
    pub bitrate: u32,
    #[serde(default)]
    pub codec: String,
    #[serde(default)]
    pub homepage: String,
    #[serde(default)]
    pub added_at: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct OfflineSignalRecord {
    pub id: String,
    pub freq_mhz: f64,
    pub name: String,
    #[serde(default)]
    pub region: String,
    #[serde(default)]
    pub genre: String,
    #[serde(default)]
    pub notes: String,
    #[serde(default = "default_band")]
    pub band: String,
    #[serde(default = "default_true")]
    pub marked: bool,
    #[serde(default)]
    pub created_at: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct RadioStoreData {
    #[serde(default)]
    pub marked_online_ids: Vec<String>,
    #[serde(default)]
    pub custom_online: Vec<OnlineStationRecord>,
    #[serde(default)]
    pub offline_signals: Vec<OfflineSignalRecord>,
    #[serde(default = "default_freq")]
    pub last_freq_mhz: f64,
    #[serde(default = "default_band")]
    pub band: String,
}

impl Default for RadioStoreData {
    fn default() -> Self {
        Self {
            marked_online_ids: Vec::new(),
            custom_online: Vec::new(),
            offline_signals: Vec::new(),
            last_freq_mhz: default_freq(),
            band: default_band(),
        }
    }
}

#[derive(Debug, Clone, Serialize)]
pub struct DiscoveredStation {
    pub id: String,
    pub name: String,
    pub url: String,
    pub country: String,
    pub language: String,
    pub tags: Vec<String>,
    pub bitrate: u32,
    pub codec: String,
    pub homepage: String,
    pub votes: u64,
}

#[derive(Debug, Clone, Serialize)]
pub struct ResolvedStreamInfo {
    pub original_url: String,
    pub resolved_url: String,
    pub name: Option<String>,
    pub genre: Option<String>,
    pub bitrate: Option<u32>,
    pub content_type: Option<String>,
    pub is_hls: bool,
}

#[derive(Debug, Clone, Serialize)]
pub struct FmHardwareStatus {
    pub available: bool,
    pub backend: String,
    pub devices: Vec<String>,
    pub rtl_fm_installed: bool,
    pub usb_sdr_detected: bool,
    pub v4l2_devices: Vec<String>,
    pub active_freq_mhz: Option<f64>,
    pub message: String,
}

#[derive(Debug, Deserialize)]
struct RadioBrowserStation {
    #[serde(default)]
    stationuuid: String,
    #[serde(default)]
    name: String,
    #[serde(default)]
    url: String,
    #[serde(default)]
    url_resolved: String,
    #[serde(default)]
    country: String,
    #[serde(default)]
    language: String,
    #[serde(default)]
    tags: String,
    #[serde(default)]
    bitrate: u32,
    #[serde(default)]
    codec: String,
    #[serde(default)]
    homepage: String,
    #[serde(default)]
    votes: u64,
    #[serde(default)]
    lastcheckok: u8,
}

/// Manages any active hardware offline FM receiver subprocess (`rtl_fm` or V4L2).
pub struct FmTunerManager {
    inner: Mutex<FmActiveState>,
}

#[derive(Default)]
struct FmActiveState {
    child: Option<Child>,
    active_freq_mhz: Option<f64>,
    active_backend: Option<String>,
}

impl Default for FmTunerManager {
    fn default() -> Self {
        Self::new()
    }
}

impl FmTunerManager {
    pub fn new() -> Self {
        Self {
            inner: Mutex::new(FmActiveState::default()),
        }
    }

    pub fn active_freq(&self) -> Option<f64> {
        self.inner.lock().ok().and_then(|s| s.active_freq_mhz)
    }

    pub fn is_active(&self) -> bool {
        self.active_freq().is_some()
    }

    /// Stop any running hardware FM tuner subprocess cleanly.
    pub fn stop(&self, service: Option<&ZunoService>) {
        if let Ok(mut st) = self.inner.lock() {
            if let Some(mut child) = st.child.take() {
                let _ = child.kill();
                let _ = child.wait();
            }
            let was_active = st.active_freq_mhz.take().is_some();
            st.active_backend = None;
            drop(st);
            if was_active {
                if let Some(svc) = service {
                    svc.stop_pcm_stream();
                }
            }
        }
    }

    /// Detect available real offline FM hardware (RTL-SDR USB dongles / Linux V4L2 `/dev/radio*`).
    pub fn hardware_status(&self) -> FmHardwareStatus {
        let rtl_fm_installed = find_in_path("rtl_fm");
        let usb_sdr_detected = detect_usb_rtl_sdr();
        let v4l2_devices = detect_v4l2_radio_devices();
        let active_freq_mhz = self.active_freq();

        let mut devices = Vec::new();
        if usb_sdr_detected {
            devices.push("RTL-SDR USB Receiver".to_string());
        }
        for dev in &v4l2_devices {
            devices.push(format!("V4L2 FM Tuner ({dev})"));
        }

        let (available, backend, message) = if rtl_fm_installed && usb_sdr_detected {
            (
                true,
                "rtl_fm".to_string(),
                "RTL-SDR USB receiver ready for live offline FM radio (87.5–108.0 MHz)."
                    .to_string(),
            )
        } else if !v4l2_devices.is_empty() {
            (
                true,
                "v4l2".to_string(),
                format!(
                    "Hardware FM tuner ready on {}.",
                    v4l2_devices.first().cloned().unwrap_or_default()
                ),
            )
        } else if usb_sdr_detected && !rtl_fm_installed {
            (
                false,
                "none".to_string(),
                "RTL-SDR USB dongle detected — install `rtl-sdr` (`rtl_fm`) to play live offline FM audio."
                    .to_string(),
            )
        } else if rtl_fm_installed && !cfg!(target_os = "linux") {
            // On macOS/Windows we don't have Linux sysfs USB inspection, so allow trying `rtl_fm` directly.
            (
                true,
                "rtl_fm".to_string(),
                "`rtl_fm` installed — connect an RTL-SDR USB receiver to tune offline FM."
                    .to_string(),
            )
        } else {
            (
                false,
                "none".to_string(),
                "No FM receiver hardware detected. Connect an RTL-SDR USB dongle (`rtl-sdr`) or USB FM tuner (`/dev/radio0`) for live off-air reception — you can still dial & mark local FM frequencies below."
                    .to_string(),
            )
        };

        FmHardwareStatus {
            available,
            backend,
            devices,
            rtl_fm_installed,
            usb_sdr_detected,
            v4l2_devices,
            active_freq_mhz,
            message,
        }
    }

    /// Tune real offline FM hardware to `freq_mhz` and stream audio into Zuno's Rodio/EQ/FFT engine.
    pub fn tune(&self, freq_mhz: f64, service: &ZunoService) -> Result<FmHardwareStatus, String> {
        validate_fm_frequency(freq_mhz)?;
        self.stop(Some(service));

        let status = self.hardware_status();
        if !status.available {
            return Err(status.message);
        }

        if status.backend == "rtl_fm" {
            let freq_hz = (freq_mhz * 1_000_000.0).round() as u64;
            let mut cmd = Command::new("rtl_fm");
            cmd.args([
                "-f",
                &freq_hz.to_string(),
                "-M",
                "wbfm",
                "-s",
                "200000",
                "-r",
                "48000",
                "-l",
                "0",
                "-E",
                "deemp",
            ])
            .stdin(Stdio::null())
            .stdout(Stdio::piped())
            .stderr(Stdio::null());

            #[cfg(target_os = "windows")]
            {
                use std::os::windows::process::CommandExt;
                cmd.creation_flags(0x08000000);
            }

            let mut child = cmd
                .spawn()
                .map_err(|e| format!("failed to launch rtl_fm: {e}"))?;
            let stdout = child
                .stdout
                .take()
                .ok_or_else(|| "failed to capture rtl_fm audio stream".to_string())?;

            if let Err(e) = service.play_pcm_stream(Box::new(stdout), 48_000, 1) {
                let _ = child.kill();
                let _ = child.wait();
                return Err(format!("failed to start offline FM audio output: {e}"));
            }

            if let Ok(mut st) = self.inner.lock() {
                st.child = Some(child);
                st.active_freq_mhz = Some((freq_mhz * 10.0).round() / 10.0);
                st.active_backend = Some("rtl_fm".to_string());
            }
            return Ok(self.hardware_status());
        }

        if status.backend == "v4l2" {
            let dev = status
                .v4l2_devices
                .first()
                .cloned()
                .unwrap_or_else(|| "/dev/radio0".to_string());
            let out = Command::new("v4l2-ctl")
                .args([
                    "--device",
                    &dev,
                    "--set-freq",
                    &format!("{freq_mhz:.1}"),
                ])
                .output()
                .map_err(|e| {
                    format!(
                        "failed to run v4l2-ctl for {dev}: {e} (install `v4l-utils` to control V4L2 tuners)"
                    )
                })?;
            if !out.status.success() {
                let stderr = String::from_utf8_lossy(&out.stderr).trim().to_string();
                return Err(if stderr.is_empty() {
                    format!("failed to tune {dev} to {freq_mhz:.1} MHz")
                } else {
                    stderr
                });
            }
            if let Ok(mut st) = self.inner.lock() {
                st.active_freq_mhz = Some((freq_mhz * 10.0).round() / 10.0);
                st.active_backend = Some("v4l2".to_string());
            }
            return Ok(self.hardware_status());
        }

        Err("No compatible offline FM hardware available.".to_string())
    }
}

pub fn validate_fm_frequency(freq_mhz: f64) -> Result<(), String> {
    if !freq_mhz.is_finite() || !(64.0..=108.0).contains(&freq_mhz) {
        return Err(format!(
            "FM frequency {freq_mhz} MHz is out of supported range (64.0–108.0 MHz)"
        ));
    }
    Ok(())
}

/// Load persisted radio bookmarks/stations from `~/zuno/.zuno/radio.json`.
pub fn load_radio_store(paths: &ZunoPaths) -> RadioStoreData {
    let Ok(raw) = fs::read_to_string(paths.radio_path()) else {
        return RadioStoreData::default();
    };
    serde_json::from_str::<RadioStoreData>(&raw).unwrap_or_default()
}

/// Atomically save radio bookmarks/stations to `~/zuno/.zuno/radio.json`.
pub fn save_radio_store(paths: &ZunoPaths, store: &RadioStoreData) -> Result<(), String> {
    paths
        .ensure_dirs()
        .map_err(|e| format!("failed to prepare zuno directory: {e}"))?;
    let bytes = serde_json::to_vec_pretty(store)
        .map_err(|e| format!("failed to serialize radio data: {e}"))?;
    let tmp = paths.cache_dir().join("radio.json.tmp");
    fs::write(&tmp, bytes).map_err(|e| format!("failed to write radio data: {e}"))?;
    fs::rename(&tmp, paths.radio_path())
        .map_err(|e| format!("failed to persist radio.json: {e}"))?;
    Ok(())
}

/// Search free public internet radio stations via Radio Browser's open directory (45,000+ stations).
pub fn discover_online_stations(
    query: Option<&str>,
    tag: Option<&str>,
    country: Option<&str>,
    language: Option<&str>,
    limit: usize,
) -> Result<Vec<DiscoveredStation>, String> {
    let lim = limit.clamp(1, 60);
    let mut params = vec![
        "hidebroken=true".to_string(),
        "order=votes".to_string(),
        "reverse=true".to_string(),
        format!("limit={lim}"),
    ];
    if let Some(q) = query.map(str::trim).filter(|s| !s.is_empty()) {
        params.push(format!("name={}", percent_encode(q)));
    }
    if let Some(t) = tag.map(str::trim).filter(|s| !s.is_empty()) {
        params.push(format!("tag={}", percent_encode(t)));
    }
    if let Some(c) = country.map(str::trim).filter(|s| !s.is_empty()) {
        params.push(format!("country={}", percent_encode(c)));
    }
    if let Some(l) = language.map(str::trim).filter(|s| !s.is_empty()) {
        params.push(format!("language={}", percent_encode(l)));
    }

    let qs = params.join("&");
    let mut last_err = String::from("Unable to reach Radio Browser directory");

    for mirror in RADIO_BROWSER_MIRRORS {
        let url = format!("{mirror}/json/stations/search?{qs}");
        match curl_get_text(&url, 8) {
            Ok(body) => {
                if let Ok(raw_list) = serde_json::from_str::<Vec<RadioBrowserStation>>(&body) {
                    let mut seen = HashSet::new();
                    let mut out = Vec::with_capacity(raw_list.len());
                    for st in raw_list {
                        let resolved = if !st.url_resolved.trim().is_empty() {
                            st.url_resolved.trim().to_string()
                        } else {
                            st.url.trim().to_string()
                        };
                        if !is_valid_http_url(&resolved) || st.lastcheckok == 0 {
                            continue;
                        }
                        if !seen.insert(resolved.clone()) {
                            continue;
                        }
                        let name = st.name.trim().to_string();
                        if name.is_empty() {
                            continue;
                        }
                        let tags: Vec<String> = st
                            .tags
                            .split(',')
                            .map(|t| t.trim().to_string())
                            .filter(|t| !t.is_empty())
                            .take(5)
                            .collect();
                        out.push(DiscoveredStation {
                            id: if st.stationuuid.trim().is_empty() {
                                format!("rb-{}", out.len())
                            } else {
                                format!("rb-{}", st.stationuuid.trim())
                            },
                            name,
                            url: resolved,
                            country: st.country.trim().to_string(),
                            language: st.language.trim().to_string(),
                            tags,
                            bitrate: st.bitrate,
                            codec: st.codec.trim().to_uppercase(),
                            homepage: st.homepage.trim().to_string(),
                            votes: st.votes,
                        });
                    }
                    return Ok(out);
                }
            }
            Err(e) => {
                last_err = e;
            }
        }
    }

    Err(last_err)
}

/// Validate a user-pasted radio link, resolve `.pls`/`.m3u` playlist URLs to direct streams,
/// and extract ICY station metadata (`icy-name`, `icy-genre`, `icy-br`) when available.
pub fn resolve_stream_url(raw_url: &str) -> Result<ResolvedStreamInfo, String> {
    let trimmed = raw_url.trim();
    if !is_valid_http_url(trimmed) {
        return Err("Please enter a valid http:// or https:// radio stream link.".to_string());
    }

    let lower = trimmed.to_ascii_lowercase();
    let looks_pls = lower.ends_with(".pls") || lower.contains(".pls?");
    let looks_m3u = lower.ends_with(".m3u") || lower.contains(".m3u?");
    let looks_m3u8 = lower.ends_with(".m3u8") || lower.contains(".m3u8?");

    let mut resolved = trimmed.to_string();
    let mut name: Option<String> = None;
    let mut genre: Option<String> = None;
    let mut bitrate: Option<u32> = None;
    let mut content_type: Option<String> = None;
    let mut is_hls = looks_m3u8;

    // 1. If the link is a `.pls` or `.m3u` playlist, fetch & extract the direct stream URL.
    if looks_pls || looks_m3u {
        if let Ok(body) = curl_get_text(trimmed, 6) {
            if let Some((extracted, title)) = parse_playlist_text(&body) {
                if is_valid_http_url(&extracted) {
                    resolved = extracted;
                    is_hls = resolved.to_ascii_lowercase().contains(".m3u8");
                }
                if name.is_none() {
                    name = title;
                }
            }
        }
    }

    // 2. Probe headers (and check if an extensionless URL actually returned a playlist file).
    if let Ok(headers) = curl_probe_headers(&resolved, 5) {
        let parsed = parse_icy_headers(&headers);
        if name.is_none() {
            name = parsed.name;
        }
        genre = parsed.genre;
        bitrate = parsed.bitrate;
        content_type = parsed.content_type.clone();

        if let Some(ct) = parsed.content_type.as_deref() {
            let ct_low = ct.to_ascii_lowercase();
            if ct_low.contains("mpegurl") && !is_hls {
                // Could be M3U or HLS — fetch body to inspect.
                if let Ok(body) = curl_get_text(&resolved, 6) {
                    if is_hls_manifest(&body) {
                        is_hls = true;
                    } else if let Some((extracted, title)) = parse_playlist_text(&body) {
                        if is_valid_http_url(&extracted) {
                            resolved = extracted;
                        }
                        if name.is_none() {
                            name = title;
                        }
                    }
                }
            } else if ct_low.contains("scpls") {
                if let Ok(body) = curl_get_text(&resolved, 6) {
                    if let Some((extracted, title)) = parse_playlist_text(&body) {
                        if is_valid_http_url(&extracted) {
                            resolved = extracted;
                        }
                        if name.is_none() {
                            name = title;
                        }
                    }
                }
            }
        }
    }

    Ok(ResolvedStreamInfo {
        original_url: trimmed.to_string(),
        resolved_url: resolved,
        name,
        genre,
        bitrate,
        content_type,
        is_hls,
    })
}

pub fn is_valid_http_url(raw: &str) -> bool {
    let trimmed = raw.trim();
    if trimmed.len() < 10 || trimmed.len() > 2048 {
        return false;
    }
    if trimmed.chars().any(|c| c.is_whitespace() || c.is_control()) {
        return false;
    }
    let lower = trimmed.to_ascii_lowercase();
    (lower.starts_with("http://") || lower.starts_with("https://"))
        && trimmed[trimmed.find("://").unwrap_or(0) + 3..].contains('.')
}

pub fn is_hls_manifest(body: &str) -> bool {
    body.lines().any(|l| {
        let t = l.trim();
        t.starts_with("#EXT-X-STREAM-INF")
            || t.starts_with("#EXT-X-TARGETDURATION")
            || t.starts_with("#EXT-X-MEDIA-SEQUENCE")
    })
}

/// Extract the first playable HTTP(S) stream URL (and optional title) from `.pls` or `.m3u` text.
pub fn parse_playlist_text(body: &str) -> Option<(String, Option<String>)> {
    if is_hls_manifest(body) {
        return None;
    }

    let mut pls_url: Option<String> = None;
    let mut pls_title: Option<String> = None;
    let mut m3u_title: Option<String> = None;

    for raw_line in body.lines().take(128) {
        let line = raw_line.trim();
        if line.is_empty() {
            continue;
        }
        // PLS format: File1=https://..., Title1=Station Name
        if let Some((k, v)) = line.split_once('=') {
            let key_low = k.trim().to_ascii_lowercase();
            let val = v.trim();
            if key_low.starts_with("file") && pls_url.is_none() && is_valid_http_url(val) {
                pls_url = Some(val.to_string());
            } else if key_low.starts_with("title") && pls_title.is_none() && !val.is_empty() {
                pls_title = Some(val.to_string());
            }
            continue;
        }
        // M3U metadata line: #EXTINF:-1,Station Name
        if let Some(rest) = line.strip_prefix("#EXTINF:") {
            if let Some((_, title)) = rest.split_once(',') {
                let t = title.trim();
                if !t.is_empty() {
                    m3u_title = Some(t.to_string());
                }
            }
            continue;
        }
        if line.starts_with('#') {
            continue;
        }
        if is_valid_http_url(line) {
            return Some((line.to_string(), m3u_title));
        }
    }

    pls_url.map(|u| (u, pls_title))
}

#[derive(Default)]
struct IcyMeta {
    name: Option<String>,
    genre: Option<String>,
    bitrate: Option<u32>,
    content_type: Option<String>,
}

fn parse_icy_headers(raw_headers: &str) -> IcyMeta {
    let mut meta = IcyMeta::default();
    for line in raw_headers.lines() {
        let Some((k, v)) = line.split_once(':') else {
            continue;
        };
        let key = k.trim().to_ascii_lowercase();
        let val = v.trim();
        if val.is_empty() {
            continue;
        }
        match key.as_str() {
            "icy-name" => meta.name = Some(val.to_string()),
            "icy-genre" => meta.genre = Some(val.to_string()),
            "icy-br" => {
                if let Ok(br) = val.parse::<u32>() {
                    meta.bitrate = Some(br);
                }
            }
            "content-type" => meta.content_type = Some(val.to_string()),
            _ => {}
        }
    }
    meta
}

fn percent_encode(input: &str) -> String {
    let mut out = String::with_capacity(input.len() * 2);
    for b in input.bytes() {
        match b {
            b'A'..=b'Z' | b'a'..=b'z' | b'0'..=b'9' | b'-' | b'_' | b'.' | b'~' => {
                out.push(b as char);
            }
            b' ' => out.push_str("%20"),
            _ => out.push_str(&format!("%{b:02X}")),
        }
    }
    out
}

fn curl_get_text(url: &str, timeout_secs: u64) -> Result<String, String> {
    let mut cmd = Command::new("curl");
    cmd.args([
        "-fsSL",
        "--connect-timeout",
        &timeout_secs.to_string(),
        "--max-time",
        &(timeout_secs + 4).to_string(),
        "--max-filesize",
        "2097152",
        "-H",
        &format!("User-Agent: Zuno/{}", env!("CARGO_PKG_VERSION")),
        url,
    ]);
    #[cfg(target_os = "windows")]
    {
        use std::os::windows::process::CommandExt;
        cmd.creation_flags(0x08000000);
    }

    let out = cmd
        .output()
        .map_err(|e| format!("failed to run curl: {e}"))?;
    if !out.status.success() {
        let stderr = String::from_utf8_lossy(&out.stderr).trim().to_string();
        return Err(if stderr.is_empty() {
            format!("HTTP request failed (exit {:?})", out.status.code())
        } else {
            stderr
        });
    }
    Ok(String::from_utf8_lossy(&out.stdout).into_owned())
}

fn curl_probe_headers(url: &str, timeout_secs: u64) -> Result<String, String> {
    let mut cmd = Command::new("curl");
    cmd.args([
        "-sSL",
        "-I",
        "--connect-timeout",
        &timeout_secs.to_string(),
        "--max-time",
        &(timeout_secs + 2).to_string(),
        "-H",
        "Icy-MetaData: 1",
        "-H",
        &format!("User-Agent: Zuno/{}", env!("CARGO_PKG_VERSION")),
        url,
    ]);
    #[cfg(target_os = "windows")]
    {
        use std::os::windows::process::CommandExt;
        cmd.creation_flags(0x08000000);
    }

    let out = cmd
        .output()
        .map_err(|e| format!("failed to probe stream headers: {e}"))?;
    let text = String::from_utf8_lossy(&out.stdout).into_owned();
    if text.trim().is_empty() {
        return Err("no HTTP headers returned".to_string());
    }
    Ok(text)
}

fn find_in_path(bin: &str) -> bool {
    let Some(path_var) = std::env::var_os("PATH") else {
        return false;
    };
    for dir in std::env::split_paths(&path_var) {
        let candidate = dir.join(bin);
        if candidate.is_file() {
            return true;
        }
        #[cfg(target_os = "windows")]
        {
            let exe = dir.join(format!("{bin}.exe"));
            if exe.is_file() {
                return true;
            }
        }
    }
    false
}

fn detect_v4l2_radio_devices() -> Vec<String> {
    #[cfg(target_os = "linux")]
    {
        let mut found = Vec::new();
        for idx in 0..8 {
            let p = format!("/dev/radio{idx}");
            if Path::new(&p).exists() {
                found.push(p);
            }
        }
        found
    }
    #[cfg(not(target_os = "linux"))]
    {
        Vec::new()
    }
}

fn detect_usb_rtl_sdr() -> bool {
    #[cfg(target_os = "linux")]
    {
        const KNOWN_RTL_SDR: &[(&str, &str)] = &[
            ("0bda", "2832"),
            ("0bda", "2838"),
            ("1f4d", "b803"),
            ("1f4d", "c803"),
            ("1f4d", "d286"),
            ("1f4d", "d803"),
            ("1d19", "1101"),
            ("1d19", "1102"),
            ("1d19", "1103"),
            ("0ccd", "00a9"),
            ("0ccd", "00b3"),
            ("0ccd", "00d7"),
            ("1b80", "d3a4"),
            ("185b", "0620"),
            ("15f4", "0131"),
            ("0413", "6680"),
        ];

        let Ok(entries) = fs::read_dir("/sys/bus/usb/devices") else {
            return false;
        };
        for entry in entries.flatten() {
            let base = entry.path();
            let Ok(vid) = fs::read_to_string(base.join("idVendor")) else {
                continue;
            };
            let Ok(pid) = fs::read_to_string(base.join("idProduct")) else {
                continue;
            };
            let v = vid.trim().to_ascii_lowercase();
            let p = pid.trim().to_ascii_lowercase();
            if KNOWN_RTL_SDR
                .iter()
                .any(|(kv, kp)| *kv == v.as_str() && *kp == p.as_str())
            {
                return true;
            }
        }
        false
    }
    #[cfg(not(target_os = "linux"))]
    {
        false
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_pls_and_m3u_playlists_and_detects_hls() {
        let pls = "[playlist]\nNumberOfEntries=1\nFile1=https://ice1.somafm.com/groovesalad-128-mp3\nTitle1=SomaFM Groove Salad\n";
        let (url, title) = parse_playlist_text(pls).expect("should parse pls");
        assert_eq!(url, "https://ice1.somafm.com/groovesalad-128-mp3");
        assert_eq!(title.as_deref(), Some("SomaFM Groove Salad"));

        let m3u = "#EXTM3U\n#EXTINF:-1,KEXP 90.3 FM\nhttps://kexp-mp3-128.streamguys1.com/kexp128.mp3\n";
        let (url2, title2) = parse_playlist_text(m3u).expect("should parse m3u");
        assert_eq!(url2, "https://kexp-mp3-128.streamguys1.com/kexp128.mp3");
        assert_eq!(title2.as_deref(), Some("KEXP 90.3 FM"));

        let hls = "#EXTM3U\n#EXT-X-VERSION:3\n#EXT-X-STREAM-INF:BANDWIDTH=128000\nchunklist.m3u8\n";
        assert!(is_hls_manifest(hls));
        assert!(parse_playlist_text(hls).is_none());
    }

    #[test]
    fn validates_urls_and_fm_frequencies() {
        assert!(is_valid_http_url("https://ice1.somafm.com/lush-128-mp3"));
        assert!(is_valid_http_url("http://stream.radioparadise.com/mp3-128"));
        assert!(!is_valid_http_url("file:///etc/passwd"));
        assert!(!is_valid_http_url("javascript:alert(1)"));
        assert!(!is_valid_http_url("https://example.com/bad url"));

        assert!(validate_fm_frequency(87.5).is_ok());
        assert!(validate_fm_frequency(98.3).is_ok());
        assert!(validate_fm_frequency(108.0).is_ok());
        assert!(validate_fm_frequency(50.0).is_err());
        assert!(validate_fm_frequency(200.0).is_err());
        assert!(validate_fm_frequency(f64::NAN).is_err());
    }

    #[test]
    fn radio_store_round_trips_atomically() {
        let dir = std::env::temp_dir().join(format!(
            "zuno-radio-store-test-{}",
            std::process::id()
        ));
        let _ = fs::remove_dir_all(&dir);
        let paths = ZunoPaths::new(&dir);
        let data = RadioStoreData {
            marked_online_ids: vec!["somafm-groovesalad".into()],
            custom_online: vec![OnlineStationRecord {
                id: "custom-1".into(),
                name: "My Station".into(),
                url: "https://example.com/live.mp3".into(),
                category: "Custom".into(),
                country: "India".into(),
                language: "English".into(),
                tags: vec!["chill".into()],
                bitrate: 128,
                codec: "MP3".into(),
                homepage: String::new(),
                added_at: 1700000000,
            }],
            offline_signals: vec![OfflineSignalRecord {
                id: "sig-1".into(),
                freq_mhz: 98.3,
                name: "Radio Mirchi".into(),
                region: "Kochi".into(),
                genre: "Hits".into(),
                notes: "Strong indoor signal".into(),
                band: "global".into(),
                marked: true,
                created_at: 1700000000,
            }],
            last_freq_mhz: 98.3,
            band: "global".into(),
        };

        save_radio_store(&paths, &data).expect("save store");
        let loaded = load_radio_store(&paths);
        assert_eq!(loaded, data);
        let _ = fs::remove_dir_all(&dir);
    }
}
