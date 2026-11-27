#![cfg_attr(target_os = "android", allow(dead_code, unused_imports))]
use serde::{Deserialize, Serialize};
use std::fs::{self, File};
use std::io::{self, Read};
use std::path::{Path, PathBuf};
use std::process::{Command, Stdio};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};
use std::time::{Duration, SystemTime, UNIX_EPOCH};
use zuno_core::ZunoPaths;

const DEFAULT_REPO: &str = "aswin402/zuno";
const MAX_BACKUPS_KEPT: usize = 5;

#[derive(Debug, Clone, Serialize)]
pub struct UpdateInfo {
    pub current_version: String,
    pub latest_version: String,
    pub update_available: bool,
    pub tag: String,
    pub release_url: String,
    pub published_at: String,
    pub notes: String,
    pub target: String,
    pub download_url: Option<String>,
    pub sha256: Option<String>,
    pub size_bytes: Option<u64>,
    pub can_auto_install: bool,
    pub install_path: String,
}

#[derive(Debug, Clone, Serialize)]
pub struct BackupReport {
    pub backup_path: String,
    pub files_count: usize,
    pub playlist_count: usize,
    pub created_at_unix: u64,
}

#[derive(Debug, Clone, Serialize)]
pub struct UpdateProgressEvent {
    pub stage: String,
    pub message: String,
    pub percent: u8,
}

impl Default for UpdateProgressEvent {
    fn default() -> Self {
        Self {
            stage: "idle".to_string(),
            message: String::new(),
            percent: 0,
        }
    }
}

#[derive(Debug, Clone, Serialize)]
pub struct UpdateInstallResult {
    pub installed_version: String,
    pub installed_path: String,
    pub backup_path: Option<String>,
    pub backup_files: usize,
}

#[derive(Debug, Deserialize)]
struct ReleaseManifest {
    version: String,
    tag: String,
    #[serde(default)]
    published_at: String,
    #[serde(default)]
    release_url: String,
    #[serde(default)]
    notes: String,
    #[serde(default)]
    targets: std::collections::HashMap<String, ManifestTarget>,
}

#[derive(Debug, Deserialize)]
struct ManifestTarget {
    url: String,
    #[serde(default)]
    sha256: Option<String>,
    #[serde(default)]
    size: Option<u64>,
}

#[derive(Debug, Deserialize)]
struct GitHubApiRelease {
    tag_name: String,
    #[serde(default)]
    html_url: String,
    #[serde(default)]
    published_at: String,
    #[serde(default)]
    body: String,
    #[serde(default)]
    assets: Vec<GitHubApiAsset>,
}

#[derive(Debug, Deserialize)]
struct GitHubApiAsset {
    name: String,
    browser_download_url: String,
    #[serde(default)]
    size: u64,
}

pub fn current_target() -> &'static str {
    match (std::env::consts::OS, std::env::consts::ARCH) {
        ("linux", "x86_64") => "linux-x86_64",
        ("linux", "aarch64") => "linux-aarch64",
        ("macos", "aarch64") => "macos-aarch64",
        ("macos", "x86_64") => "macos-x86_64",
        ("windows", "x86_64") => "windows-x86_64",
        ("windows", "aarch64") => "windows-aarch64",
        ("android", "aarch64") => "android-arm64",
        ("android", "arm") => "android-armv7",
        ("android", "x86_64") => "android-x86_64",
        _ => "unknown",
    }
}

fn repo_slug() -> String {
    std::env::var("ZUNO_REPO")
        .ok()
        .filter(|s| !s.trim().is_empty())
        .unwrap_or_else(|| DEFAULT_REPO.to_string())
}

#[derive(Debug, Clone, PartialEq, Eq)]
struct SemVer {
    major: u64,
    minor: u64,
    patch: u64,
    pre: Vec<String>,
}

impl Ord for SemVer {
    fn cmp(&self, other: &Self) -> std::cmp::Ordering {
        use std::cmp::Ordering;
        let core = (self.major, self.minor, self.patch).cmp(&(other.major, other.minor, other.patch));
        if core != Ordering::Equal {
            return core;
        }
        // SemVer 2.0: a release without prerelease has higher precedence than a prerelease.
        match (self.pre.is_empty(), other.pre.is_empty()) {
            (true, true) => Ordering::Equal,
            (true, false) => Ordering::Greater,
            (false, true) => Ordering::Less,
            (false, false) => {
                for (a, b) in self.pre.iter().zip(other.pre.iter()) {
                    let ord = match (a.parse::<u64>(), b.parse::<u64>()) {
                        (Ok(na), Ok(nb)) => na.cmp(&nb),
                        (Ok(_), Err(_)) => Ordering::Less,
                        (Err(_), Ok(_)) => Ordering::Greater,
                        (Err(_), Err(_)) => a.cmp(b),
                    };
                    if ord != Ordering::Equal {
                        return ord;
                    }
                }
                self.pre.len().cmp(&other.pre.len())
            }
        }
    }
}

impl PartialOrd for SemVer {
    fn partial_cmp(&self, other: &Self) -> Option<std::cmp::Ordering> {
        Some(self.cmp(other))
    }
}

fn strip_v_prefix(raw: &str) -> &str {
    let trimmed = raw.trim();
    trimmed
        .strip_prefix('v')
        .or_else(|| trimmed.strip_prefix('V'))
        .unwrap_or(trimmed)
}

fn parse_semver(raw: &str) -> Option<SemVer> {
    let trimmed = strip_v_prefix(raw);
    let no_build = trimmed.split('+').next()?;
    let (core, pre_str) = match no_build.split_once('-') {
        Some((c, p)) => (c, Some(p)),
        None => (no_build, None),
    };
    let mut parts = core.split('.');
    let major = parts.next()?.parse::<u64>().ok()?;
    let minor = parts.next().unwrap_or("0").parse::<u64>().ok()?;
    let patch = parts.next().unwrap_or("0").parse::<u64>().ok()?;
    if parts.next().is_some() {
        return None;
    }
    let pre = pre_str
        .map(|s| s.split('.').map(str::to_string).collect())
        .unwrap_or_default();
    Some(SemVer {
        major,
        minor,
        patch,
        pre,
    })
}

pub fn is_newer_version(current: &str, latest: &str) -> bool {
    match (parse_semver(current), parse_semver(latest)) {
        (Some(c), Some(l)) => l > c,
        _ => false,
    }
}

/// Safely wrap a literal string for PowerShell single-quoted context (`'` -> `''`).
#[cfg(target_os = "windows")]
fn ps_single_quote(s: &str) -> String {
    format!("'{}'", s.replace('\'', "''"))
}

struct TempDirGuard(PathBuf);

impl Drop for TempDirGuard {
    fn drop(&mut self) {
        let _ = fs::remove_dir_all(&self.0);
    }
}

/// Strip OS suffixes that appear after an in-place binary swap:
/// - Linux `/proc/self/exe` appends `" (deleted)"` once the old binary is unlinked.
/// - `atomic_swap_binary` moves the running executable aside as `"<name>.old"`.
pub fn sanitize_exe_path(raw: &Path) -> PathBuf {
    let s = raw.to_string_lossy();
    let trimmed = s.strip_suffix(" (deleted)").unwrap_or(&s);
    let cleaned = trimmed.strip_suffix(".old").unwrap_or(trimmed);
    PathBuf::from(cleaned)
}

/// Resolve the true on-disk path of the Zuno executable even after an in-place swap.
pub fn resolve_current_exe_path() -> Result<PathBuf, String> {
    let raw = std::env::current_exe()
        .map_err(|e| format!("cannot locate running Zuno binary: {e}"))?;
    let cleaned = sanitize_exe_path(&raw);
    if cleaned.is_file() {
        return Ok(cleaned);
    }
    if raw.is_file() {
        return Ok(raw);
    }
    Ok(cleaned)
}

/// Pause briefly when relaunched right after an in-place update so the exiting instance
/// finishes releasing D-Bus MPRIS, system tray, audio output, and Windows `.old` file locks.
pub fn wait_if_relaunched() {
    if let Ok(raw) = std::env::var("ZUNO_RELAUNCH_WAIT_MS") {
        if let Ok(ms) = raw.trim().parse::<u64>() {
            let clamped = ms.min(2_000);
            if clamped > 0 {
                std::thread::sleep(Duration::from_millis(clamped));
            }
        }
    }
}

/// Remove any `.old` rollback binaries left over from a previous self-update.
pub fn cleanup_old_binaries() {
    let Ok(exe) = resolve_current_exe_path() else {
        return;
    };
    let Some(dir) = exe.parent() else {
        return;
    };
    for name in [
        "zuno.old",
        "zuno-mcp.old",
        "zuno.exe.old",
        "zuno-mcp.exe.old",
    ] {
        let p = dir.join(name);
        if p.exists() {
            let _ = fs::remove_file(p);
        }
    }
}

fn can_write_install_dir(exe_path: &Path) -> bool {
    let Some(parent) = exe_path.parent() else {
        return false;
    };
    let probe = parent.join(format!(".zuno-write-probe-{}", std::process::id()));
    match fs::write(&probe, b"ok") {
        Ok(()) => {
            let _ = fs::remove_file(&probe);
            true
        }
        Err(_) => false,
    }
}

/// Zero-copy backup of all user playlists (`.m3u8`), library sources, playback state,
/// index cache, and frontend UI/theme/EQ settings JSON. Audio files in `songs/` are never copied.
pub fn backup_user_data(
    paths: &ZunoPaths,
    current_version: &str,
    ui_settings_json: Option<&str>,
) -> Result<BackupReport, String> {
    let now_unix = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_secs())
        .unwrap_or(0);
    let safe_ver = current_version.trim_start_matches('v');
    let backups_root = paths.cache_dir().join("backups");
    let backup_dir = backups_root.join(format!("v{safe_ver}-{now_unix}"));
    let backup_playlists = backup_dir.join("playlists");

    fs::create_dir_all(&backup_playlists)
        .map_err(|e| format!("failed to create backup directory: {e}"))?;

    let mut files_count = 0usize;
    let mut playlist_count = 0usize;

    // 1. Copy all `.m3u8` playlists
    if let Ok(entries) = fs::read_dir(paths.playlists_dir()) {
        for entry in entries.flatten() {
            let path = entry.path();
            if path.is_file()
                && path
                    .extension()
                    .and_then(|e| e.to_str())
                    .map(|e| e.eq_ignore_ascii_case("m3u8"))
                    .unwrap_or(false)
            {
                if let Some(name) = path.file_name() {
                    if fs::copy(&path, backup_playlists.join(name)).is_ok() {
                        playlist_count += 1;
                        files_count += 1;
                    }
                }
            }
        }
    }

    // 2. Copy core Zuno JSON metadata files using their canonical filenames from `ZunoPaths`
    for src in [
        paths.sources_path(),
        paths.state_path(),
        paths.index_path(),
        paths.radio_path(),
        paths.settings_path(),
    ] {
        if let Some(name) = src.file_name() {
            if src.is_file() && fs::copy(&src, backup_dir.join(name)).is_ok() {
                files_count += 1;
            }
        }
    }

    // 3. Persist frontend appearance/theme/EQ/last-played snapshot if provided
    if let Some(json_str) = ui_settings_json {
        if !json_str.trim().is_empty()
            && fs::write(backup_dir.join("ui-settings.json"), json_str.as_bytes()).is_ok()
        {
            files_count += 1;
        }
    }

    // 4. Write backup manifest
    let manifest = serde_json::json!({
        "version": safe_ver,
        "created_at_unix": now_unix,
        "files_backed_up": files_count,
        "playlist_count": playlist_count,
        "songs_dir": paths.songs_dir().display().to_string(),
        "note": "Audio files in songs/ are never modified or duplicated by Zuno updates.",
    });
    let _ = fs::write(
        backup_dir.join("manifest.json"),
        serde_json::to_string_pretty(&manifest).unwrap_or_default(),
    );

    // 5. Retain only the 5 most recent backups to keep disk usage tiny
    prune_old_backups(&backups_root, MAX_BACKUPS_KEPT);

    Ok(BackupReport {
        backup_path: backup_dir.display().to_string(),
        files_count,
        playlist_count,
        created_at_unix: now_unix,
    })
}

fn prune_old_backups(backups_root: &Path, keep: usize) {
    let Ok(entries) = fs::read_dir(backups_root) else {
        return;
    };
    let mut dirs: Vec<(SystemTime, PathBuf)> = entries
        .flatten()
        .filter_map(|e| {
            let p = e.path();
            if !p.is_dir() {
                return None;
            }
            let modified = e.metadata().ok()?.modified().ok().unwrap_or(UNIX_EPOCH);
            Some((modified, p))
        })
        .collect();
    if dirs.len() <= keep {
        return;
    }
    dirs.sort_by(|a, b| b.0.cmp(&a.0));
    for (_, stale) in dirs.into_iter().skip(keep) {
        let _ = fs::remove_dir_all(stale);
    }
}

fn http_get_text(url: &str, timeout_secs: u64) -> Result<String, String> {
    let mut cmd = Command::new("curl");
    cmd.args([
        "-fsSL",
        "--connect-timeout",
        &timeout_secs.to_string(),
        "--max-time",
        &(timeout_secs + 4).to_string(),
        "-H",
        "Accept: application/vnd.github+json",
        "-H",
        &format!("User-Agent: Zuno/{}", env!("CARGO_PKG_VERSION")),
        url,
    ]);
    crate::configure_hidden_command(&mut cmd);

    match cmd.output() {
        Ok(out) if out.status.success() => {
            String::from_utf8(out.stdout).map_err(|e| format!("invalid UTF-8 response: {e}"))
        }
        Ok(out) => {
            let stderr = String::from_utf8_lossy(&out.stderr).trim().to_string();
            Err(if stderr.is_empty() {
                format!("HTTP request failed (exit {:?})", out.status.code())
            } else {
                stderr
            })
        }
        Err(e) => {
            #[cfg(target_os = "windows")]
            {
                let safe_url = ps_single_quote(url);
                let ps_script = format!(
                    "[Net.ServicePointManager]::SecurityProtocol=[Net.SecurityProtocolType]::Tls12; (Invoke-WebRequest -UseBasicParsing -TimeoutSec {timeout_secs} -Uri {safe_url}).Content"
                );
                let mut ps = Command::new("powershell");
                ps.args(["-NoProfile", "-Command", &ps_script]);
                crate::configure_hidden_command(&mut ps);
                if let Ok(out) = ps.output() {
                    if out.status.success() {
                        return String::from_utf8(out.stdout)
                            .map_err(|e| format!("invalid UTF-8 response: {e}"));
                    }
                }
            }
            Err(format!("failed to invoke curl: {e}"))
        }
    }
}

fn http_download_file(url: &str, dest: &Path) -> Result<(), String> {
    let dest_str = dest.to_string_lossy().to_string();
    let mut cmd = Command::new("curl");
    cmd.args([
        "-fsSL",
        "--retry",
        "2",
        "--connect-timeout",
        "15",
        "--max-time",
        "300",
        "-H",
        &format!("User-Agent: Zuno/{}", env!("CARGO_PKG_VERSION")),
        "-o",
        &dest_str,
        url,
    ]);
    crate::configure_hidden_command(&mut cmd);

    match cmd.output() {
        Ok(out) if out.status.success() => Ok(()),
        Ok(out) => {
            let stderr = String::from_utf8_lossy(&out.stderr).trim().to_string();
            Err(if stderr.is_empty() {
                format!("download failed (exit {:?})", out.status.code())
            } else {
                stderr
            })
        }
        Err(e) => {
            #[cfg(target_os = "windows")]
            {
                let safe_url = ps_single_quote(url);
                let safe_dest = ps_single_quote(&dest_str);
                let ps_script = format!(
                    "[Net.ServicePointManager]::SecurityProtocol=[Net.SecurityProtocolType]::Tls12; Invoke-WebRequest -UseBasicParsing -Uri {safe_url} -OutFile {safe_dest}"
                );
                let mut ps = Command::new("powershell");
                ps.args(["-NoProfile", "-Command", &ps_script]);
                crate::configure_hidden_command(&mut ps);
                if let Ok(out) = ps.output() {
                    if out.status.success() {
                        return Ok(());
                    }
                }
            }
            Err(format!("failed to download archive: {e}"))
        }
    }
}

/// Check GitHub Releases for a newer Zuno version.
/// Reads `latest.json` first (fast, includes SHA-256 + sizes), falling back to GitHub Releases API.
pub fn check_for_update() -> Result<UpdateInfo, String> {
    let current_version = env!("CARGO_PKG_VERSION").to_string();
    let target = current_target().to_string();
    let repo = repo_slug();
    let exe_path = resolve_current_exe_path().unwrap_or_else(|_| PathBuf::from("zuno"));
    let writable = !cfg!(target_os = "android") && can_write_install_dir(&exe_path);

    // 1. Try Zuno's lightweight `latest.json` release manifest first
    let manifest_url = format!("https://github.com/{repo}/releases/latest/download/latest.json");
    if let Ok(body) = http_get_text(&manifest_url, 6) {
        if let Ok(manifest) = serde_json::from_str::<ReleaseManifest>(&body) {
            let target_info = manifest.targets.get(&target);
            let download_url = target_info.map(|t| t.url.clone());
            let sha256 = target_info.and_then(|t| t.sha256.clone());
            let size_bytes = target_info.and_then(|t| t.size);
            let latest_version = manifest.version.trim_start_matches('v').to_string();
            let update_available = is_newer_version(&current_version, &latest_version);
            let can_auto_install = writable && download_url.is_some();

            return Ok(UpdateInfo {
                current_version,
                latest_version,
                update_available,
                tag: manifest.tag,
                release_url: if manifest.release_url.is_empty() {
                    format!("https://github.com/{repo}/releases/latest")
                } else {
                    manifest.release_url
                },
                published_at: manifest.published_at,
                notes: manifest.notes,
                target,
                download_url,
                sha256,
                size_bytes,
                can_auto_install,
                install_path: exe_path.display().to_string(),
            });
        }
    }

    // 2. Fallback to GitHub Releases REST API
    let api_url = format!("https://api.github.com/repos/{repo}/releases/latest");
    let raw = http_get_text(&api_url, 6)?;
    let release: GitHubApiRelease =
        serde_json::from_str(&raw).map_err(|e| format!("failed to parse GitHub release: {e}"))?;

    let expected_archive = if cfg!(target_os = "android") {
        format!("zuno-{target}.apk")
    } else if cfg!(target_os = "windows") {
        format!("zuno-{target}.zip")
    } else {
        format!("zuno-{target}.tar.gz")
    };
    let asset = release
        .assets
        .iter()
        .find(|a| a.name == expected_archive);

    let latest_version = release.tag_name.trim_start_matches('v').to_string();
    let update_available = is_newer_version(&current_version, &latest_version);
    let download_url = asset.map(|a| a.browser_download_url.clone());
    let size_bytes = asset.map(|a| a.size);
    let can_auto_install = writable && download_url.is_some();

    Ok(UpdateInfo {
        current_version,
        latest_version,
        update_available,
        tag: release.tag_name,
        release_url: release.html_url,
        published_at: release.published_at,
        notes: release.body,
        target,
        download_url,
        sha256: None,
        size_bytes,
        can_auto_install,
        install_path: exe_path.display().to_string(),
    })
}

fn set_progress(
    progress: &Arc<Mutex<UpdateProgressEvent>>,
    stage: &str,
    message: impl Into<String>,
    percent: u8,
) {
    if let Ok(mut guard) = progress.lock() {
        *guard = UpdateProgressEvent {
            stage: stage.to_string(),
            message: message.into(),
            percent,
        };
    }
}

fn extract_archive(archive: &Path, dest_dir: &Path) -> Result<(), String> {
    fs::create_dir_all(dest_dir).map_err(|e| format!("failed to create extract dir: {e}"))?;

    #[cfg(target_os = "windows")]
    {
        let safe_archive = ps_single_quote(&archive.to_string_lossy());
        let safe_dest = ps_single_quote(&dest_dir.to_string_lossy());
        let ps_script = format!(
            "Expand-Archive -LiteralPath {safe_archive} -DestinationPath {safe_dest} -Force"
        );
        let mut cmd = Command::new("powershell");
        cmd.args(["-NoProfile", "-Command", &ps_script]);
        crate::configure_hidden_command(&mut cmd);
        let out = cmd
            .output()
            .map_err(|e| format!("failed to unpack zip archive: {e}"))?;
        if !out.status.success() {
            return Err(format!(
                "Expand-Archive failed: {}",
                String::from_utf8_lossy(&out.stderr).trim()
            ));
        }
        Ok(())
    }

    #[cfg(not(target_os = "windows"))]
    {
        let out = Command::new("tar")
            .args([
                "-xzf",
                &archive.to_string_lossy(),
                "-C",
                &dest_dir.to_string_lossy(),
            ])
            .output()
            .map_err(|e| format!("failed to run tar: {e}"))?;
        if !out.status.success() {
            return Err(format!(
                "tar extraction failed: {}",
                String::from_utf8_lossy(&out.stderr).trim()
            ));
        }
        Ok(())
    }
}

fn atomic_swap_binary(new_bin: &Path, target_bin: &Path) -> Result<(), String> {
    if !new_bin.is_file() {
        return Err(format!("extracted binary not found: {}", new_bin.display()));
    }

    let parent = target_bin
        .parent()
        .ok_or_else(|| "cannot resolve install directory".to_string())?;
    let file_name = target_bin
        .file_name()
        .and_then(|n| n.to_str())
        .unwrap_or("zuno");
    let staged = parent.join(format!("{file_name}.new"));
    let rollback = parent.join(format!("{file_name}.old"));

    fs::copy(new_bin, &staged)
        .map_err(|e| format!("failed to stage new binary in {}: {e}", parent.display()))?;

    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        let _ = fs::set_permissions(&staged, fs::Permissions::from_mode(0o755));
    }

    #[cfg(target_os = "macos")]
    {
        let _ = Command::new("xattr")
            .args(["-dr", "com.apple.quarantine", &staged.to_string_lossy()])
            .output();
    }

    if rollback.exists() {
        let _ = fs::remove_file(&rollback);
    }

    let had_existing = target_bin.exists();
    if had_existing {
        fs::rename(target_bin, &rollback)
            .map_err(|e| format!("failed to move current binary aside: {e}"))?;
    }

    if let Err(err) = fs::rename(&staged, target_bin) {
        // Automatic rollback if swapping fails
        if had_existing {
            let _ = fs::rename(&rollback, target_bin);
        }
        let _ = fs::remove_file(&staged);
        return Err(format!("failed to install updated binary: {err}"));
    }

    // On Unix we can unlink the old binary immediately while the current process runs.
    // On Windows it stays as `.old` and is automatically cleaned up on the next launch.
    #[cfg(unix)]
    {
        let _ = fs::remove_file(&rollback);
    }

    Ok(())
}

/// Download, verify SHA-256, back up user data, and atomically install the new Zuno release.
#[allow(clippy::too_many_arguments)]
pub fn install_update(
    progress: &Arc<Mutex<UpdateProgressEvent>>,
    paths: &ZunoPaths,
    download_url: &str,
    expected_sha256: Option<&str>,
    expected_size: Option<u64>,
    target_version: &str,
    create_backup: bool,
    ui_settings_json: Option<&str>,
) -> Result<UpdateInstallResult, String> {
    #[cfg(target_os = "android")]
    {
        let _ = (
            progress,
            paths,
            download_url,
            expected_sha256,
            expected_size,
            target_version,
            create_backup,
            ui_settings_json,
        );
        return Err(
            "Self-update is not supported in-place on Android. Download the latest APK from GitHub Releases."
                .to_string(),
        );
    }

    #[cfg(not(target_os = "android"))]
    {
    let exe_path = resolve_current_exe_path()?;
    if !can_write_install_dir(&exe_path) {
        return Err(format!(
            "No write permission in {}. Reinstall via the CLI installer script instead.",
            exe_path
                .parent()
                .map(|p| p.display().to_string())
                .unwrap_or_default()
        ));
    }

    // 1. Automatic Zero-Copy Data Backup
    let mut backup_path = None;
    let mut backup_files = 0usize;
    if create_backup {
        set_progress(
            progress,
            "backup",
            "Backing up playlists, folders, EQ & settings…",
            12,
        );
        let report = backup_user_data(paths, env!("CARGO_PKG_VERSION"), ui_settings_json)?;
        backup_path = Some(report.backup_path);
        backup_files = report.files_count;
    }

    // 2. Download Release Archive with Live Byte Progress
    let now_unix = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_secs())
        .unwrap_or(0);
    let tmp_dir = paths.cache_dir().join(format!("tmp-update-{now_unix}"));
    fs::create_dir_all(&tmp_dir)
        .map_err(|e| format!("failed to prepare temp update directory: {e}"))?;
    // RAII guard ensures `tmp_dir` is cleaned up on EVERY exit path (including SHA-256 errors).
    let _tmp_guard = TempDirGuard(tmp_dir.clone());

    let archive_name = if cfg!(target_os = "windows") {
        "zuno-update.zip"
    } else {
        "zuno-update.tar.gz"
    };
    let archive_path = tmp_dir.join(archive_name);

    let clean_ver = strip_v_prefix(target_version).to_string();
    set_progress(
        progress,
        "downloading",
        format!("Downloading Zuno v{clean_ver}…"),
        22,
    );

    let done_flag = Arc::new(AtomicBool::new(false));
    let monitor_handle = {
        let done = Arc::clone(&done_flag);
        let prog = Arc::clone(progress);
        let watch_path = archive_path.clone();
        let ver_label = clean_ver.clone();
        std::thread::spawn(move || {
            while !done.load(Ordering::Relaxed) {
                if let Ok(meta) = fs::metadata(&watch_path) {
                    let cur = meta.len();
                    let mb = (cur as f64) / 1_048_576.0;
                    if let Some(total) = expected_size.filter(|&s| s > 0) {
                        let ratio = (cur as f64 / total as f64).clamp(0.0, 1.0);
                        let pct = (22.0 + ratio * 52.0).round() as u8;
                        let tot_mb = (total as f64) / 1_048_576.0;
                        set_progress(
                            &prog,
                            "downloading",
                            format!("Downloading v{ver_label} ({mb:.1} / {tot_mb:.1} MB)…"),
                            pct.min(74),
                        );
                    } else {
                        set_progress(
                            &prog,
                            "downloading",
                            format!("Downloading v{ver_label} ({mb:.1} MB)…"),
                            48,
                        );
                    }
                }
                std::thread::sleep(Duration::from_millis(140));
            }
        })
    };

    let dl_res = http_download_file(download_url, &archive_path);
    done_flag.store(true, Ordering::Relaxed);
    let _ = monitor_handle.join();

    if let Err(err) = dl_res {
        set_progress(progress, "error", &err, 0);
        return Err(err);
    }

    // 3. SHA-256 Verification
    if let Some(expected) = expected_sha256.filter(|s| !s.trim().is_empty()) {
        set_progress(progress, "verifying", "Verifying SHA-256 integrity…", 78);
        let actual = sha256_file(&archive_path).map_err(|e| {
            let msg = format!("failed to hash downloaded archive: {e}");
            set_progress(progress, "error", &msg, 0);
            msg
        })?;
        if !actual.eq_ignore_ascii_case(expected.trim()) {
            let exp_prefix: String = expected.trim().chars().take(12).collect();
            let act_prefix: String = actual.chars().take(12).collect();
            let msg = format!(
                "SHA-256 mismatch — aborted safely (expected {exp_prefix}, got {act_prefix})"
            );
            set_progress(progress, "error", &msg, 0);
            return Err(msg);
        }
    }

    // 4. Extract Release Archive
    set_progress(progress, "extracting", "Extracting release binaries…", 86);
    let extract_dir = tmp_dir.join("extract");
    if let Err(err) = extract_archive(&archive_path, &extract_dir) {
        set_progress(progress, "error", &err, 0);
        return Err(err);
    }

    // 5. Atomic Binary Replacement
    set_progress(progress, "installing", "Installing updated Zuno binary…", 94);
    let (app_bin_name, cli_bin_name) = if cfg!(target_os = "windows") {
        ("zuno.exe", "zuno-mcp.exe")
    } else {
        ("zuno", "zuno-mcp")
    };

    if let Err(err) = atomic_swap_binary(&extract_dir.join(app_bin_name), &exe_path) {
        set_progress(progress, "error", &err, 0);
        return Err(err);
    }

    // Also update sibling CLI binary if installed alongside Zuno
    if let Some(bin_dir) = exe_path.parent() {
        let cli_src = extract_dir.join(cli_bin_name);
        let cli_dst = bin_dir.join(cli_bin_name);
        if cli_src.is_file() && cli_dst.exists() {
            let _ = atomic_swap_binary(&cli_src, &cli_dst);
        }
    }

    set_progress(
        progress,
        "done",
        format!("Zuno v{clean_ver} installed — ready to restart"),
        100,
    );

    Ok(UpdateInstallResult {
        installed_version: clean_ver,
        installed_path: exe_path.display().to_string(),
        backup_path,
        backup_files,
    })
    }
}

/// Spawn the newly installed Zuno binary in the background so the old instance can exit cleanly.
/// Prefers the exact `installed_path` returned by `install_update`, falling back to a sanitized
/// `current_exe()` so Linux's `/proc/self/exe` `" (deleted)"` and `".old"` suffixes never break restart.
pub fn spawn_relaunched_app(preferred_exe: Option<&Path>) -> Result<(), String> {
    let exe = match preferred_exe {
        Some(p) if p.is_file() => p.to_path_buf(),
        Some(p) => {
            let cleaned = sanitize_exe_path(p);
            if cleaned.is_file() {
                cleaned
            } else {
                resolve_current_exe_path()?
            }
        }
        None => resolve_current_exe_path()?,
    };

    if !exe.is_file() {
        return Err(format!(
            "updated Zuno binary not found at {}",
            exe.display()
        ));
    }

    let mut cmd = Command::new(&exe);
    cmd.env("ZUNO_RELAUNCH_WAIT_MS", "350")
        .stdin(Stdio::null())
        .stdout(Stdio::null())
        .stderr(Stdio::null());
    cmd.spawn().map_err(|e| {
        format!(
            "failed to launch updated Zuno ({}): {e}",
            exe.display()
        )
    })?;
    Ok(())
}

// ── Zero-Dependency Pure-Rust FIPS 180-4 SHA-256 ──

const SHA256_K: [u32; 64] = [
    0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
    0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
    0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
    0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
    0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
    0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
    0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
    0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
];

struct Sha256 {
    h: [u32; 8],
    buf: [u8; 64],
    buf_len: usize,
    total_bits: u64,
}

impl Sha256 {
    fn new() -> Self {
        Self {
            h: [
                0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab,
                0x5be0cd19,
            ],
            buf: [0u8; 64],
            buf_len: 0,
            total_bits: 0,
        }
    }

    fn compress(&mut self, block: &[u8; 64]) {
        let mut w = [0u32; 64];
        for i in 0..16 {
            w[i] = u32::from_be_bytes([
                block[i * 4],
                block[i * 4 + 1],
                block[i * 4 + 2],
                block[i * 4 + 3],
            ]);
        }
        for i in 16..64 {
            let s0 = w[i - 15].rotate_right(7) ^ w[i - 15].rotate_right(18) ^ (w[i - 15] >> 3);
            let s1 = w[i - 2].rotate_right(17) ^ w[i - 2].rotate_right(19) ^ (w[i - 2] >> 10);
            w[i] = w[i - 16]
                .wrapping_add(s0)
                .wrapping_add(w[i - 7])
                .wrapping_add(s1);
        }

        let [mut a, mut b, mut c, mut d, mut e, mut f, mut g, mut h] = self.h;
        for i in 0..64 {
            let s1 = e.rotate_right(6) ^ e.rotate_right(11) ^ e.rotate_right(25);
            let ch = (e & f) ^ ((!e) & g);
            let t1 = h
                .wrapping_add(s1)
                .wrapping_add(ch)
                .wrapping_add(SHA256_K[i])
                .wrapping_add(w[i]);
            let s0 = a.rotate_right(2) ^ a.rotate_right(13) ^ a.rotate_right(22);
            let maj = (a & b) ^ (a & c) ^ (b & c);
            let t2 = s0.wrapping_add(maj);

            h = g;
            g = f;
            f = e;
            e = d.wrapping_add(t1);
            d = c;
            c = b;
            b = a;
            a = t1.wrapping_add(t2);
        }

        self.h[0] = self.h[0].wrapping_add(a);
        self.h[1] = self.h[1].wrapping_add(b);
        self.h[2] = self.h[2].wrapping_add(c);
        self.h[3] = self.h[3].wrapping_add(d);
        self.h[4] = self.h[4].wrapping_add(e);
        self.h[5] = self.h[5].wrapping_add(f);
        self.h[6] = self.h[6].wrapping_add(g);
        self.h[7] = self.h[7].wrapping_add(h);
    }

    fn update(&mut self, mut data: &[u8]) {
        self.total_bits = self.total_bits.wrapping_add((data.len() as u64) * 8);
        if self.buf_len > 0 {
            let take = (64 - self.buf_len).min(data.len());
            self.buf[self.buf_len..self.buf_len + take].copy_from_slice(&data[..take]);
            self.buf_len += take;
            data = &data[take..];
            if self.buf_len == 64 {
                let block = self.buf;
                self.compress(&block);
                self.buf_len = 0;
            }
        }
        while data.len() >= 64 {
            let mut block = [0u8; 64];
            block.copy_from_slice(&data[..64]);
            self.compress(&block);
            data = &data[64..];
        }
        if !data.is_empty() {
            self.buf[..data.len()].copy_from_slice(data);
            self.buf_len = data.len();
        }
    }

    fn finalize_hex(mut self) -> String {
        let total_bits = self.total_bits;
        self.buf[self.buf_len] = 0x80;
        self.buf_len += 1;
        if self.buf_len > 56 {
            self.buf[self.buf_len..64].fill(0);
            let block = self.buf;
            self.compress(&block);
            self.buf_len = 0;
        }
        self.buf[self.buf_len..56].fill(0);
        self.buf[56..64].copy_from_slice(&total_bits.to_be_bytes());
        let block = self.buf;
        self.compress(&block);

        let mut out = String::with_capacity(64);
        for word in self.h {
            use std::fmt::Write;
            let _ = write!(&mut out, "{word:08x}");
        }
        out
    }
}

fn sha256_file(path: &Path) -> io::Result<String> {
    let mut file = File::open(path)?;
    let mut hasher = Sha256::new();
    let mut chunk = [0u8; 32 * 1024];
    loop {
        let n = file.read(&mut chunk)?;
        if n == 0 {
            break;
        }
        hasher.update(&chunk[..n]);
    }
    Ok(hasher.finalize_hex())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn semver_comparison_handles_v_prefix_prerelease_and_ordering() {
        assert!(is_newer_version("0.0.14", "v0.0.15"));
        assert!(is_newer_version("v0.0.14", "0.1.0"));
        assert!(is_newer_version("0.9.9", "1.0.0"));
        assert!(is_newer_version("1.0.0-alpha.1", "1.0.0"));
        assert!(is_newer_version("1.0.0-alpha.2", "1.0.0-alpha.10"));
        assert!(is_newer_version("1.0.0-alpha.1", "1.0.0-beta.1"));
        assert!(!is_newer_version("1.0.0", "1.0.0-rc.1"));
        assert!(!is_newer_version("0.0.15", "v0.0.15"));
        assert!(!is_newer_version("0.0.15", "v0.0.14"));
        assert!(!is_newer_version("1.0.0", "0.9.9"));
    }

    #[test]
    fn sha256_matches_standard_fips_test_vectors() {
        let mut h_empty = Sha256::new();
        h_empty.update(b"");
        assert_eq!(
            h_empty.finalize_hex(),
            "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855"
        );

        let mut h_abc = Sha256::new();
        h_abc.update(b"abc");
        assert_eq!(
            h_abc.finalize_hex(),
            "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad"
        );
    }

    #[test]
    fn backup_user_data_copies_playlists_config_and_skips_songs() {
        let base = std::env::temp_dir().join(format!("zuno-backup-test-{}", std::process::id()));
        let _ = fs::remove_dir_all(&base);
        let paths = ZunoPaths::new(&base);
        paths.ensure_dirs().unwrap();

        fs::write(paths.songs_dir().join("huge.mp3"), b"audio-bytes").unwrap();
        fs::write(paths.playlists_dir().join("favorites.m3u8"), "#EXTM3U\n../songs/huge.mp3\n")
            .unwrap();
        fs::write(paths.sources_path(), "[]").unwrap();
        fs::write(paths.state_path(), "{}").unwrap();

        let report = backup_user_data(&paths, "0.0.14", Some(r#"{"theme":"zinc"}"#)).unwrap();
        let backup_dir = PathBuf::from(&report.backup_path);

        assert_eq!(report.playlist_count, 1);
        assert_eq!(report.files_count, 4);
        assert!(backup_dir.join("playlists/favorites.m3u8").is_file());
        assert!(backup_dir.join("sources.json").is_file());
        assert!(backup_dir.join("state.json").is_file());
        assert!(backup_dir.join("ui-settings.json").is_file());
        assert!(backup_dir.join("manifest.json").is_file());
        // Verify zero-copy: songs/ was NOT duplicated into the backup!
        assert!(!backup_dir.join("songs").exists());

        let _ = fs::remove_dir_all(&base);
    }

    #[test]
    fn sanitize_exe_path_strips_linux_deleted_and_old_suffixes() {
        assert_eq!(
            sanitize_exe_path(Path::new("/home/user/.local/bin/zuno.old (deleted)")),
            PathBuf::from("/home/user/.local/bin/zuno")
        );
        assert_eq!(
            sanitize_exe_path(Path::new("/home/user/.local/bin/zuno (deleted)")),
            PathBuf::from("/home/user/.local/bin/zuno")
        );
        assert_eq!(
            sanitize_exe_path(Path::new("/home/user/.local/bin/zuno.old")),
            PathBuf::from("/home/user/.local/bin/zuno")
        );
        assert_eq!(
            sanitize_exe_path(Path::new("C:\\Users\\zuno\\bin\\zuno.exe.old")),
            PathBuf::from("C:\\Users\\zuno\\bin\\zuno.exe")
        );
        assert_eq!(
            sanitize_exe_path(Path::new("/home/user/.local/bin/zuno")),
            PathBuf::from("/home/user/.local/bin/zuno")
        );
    }

    #[cfg(unix)]
    #[test]
    fn atomic_swap_and_relaunch_runs_newly_installed_binary() {
        use std::os::unix::fs::PermissionsExt;

        let base = std::env::temp_dir().join(format!("zuno-relaunch-test-{}", std::process::id()));
        let _ = fs::remove_dir_all(&base);
        fs::create_dir_all(&base).unwrap();

        let target = base.join("zuno");
        let new_bin = base.join("zuno-v2");
        let marker = base.join("ran-v2.txt");

        fs::write(&target, "#!/bin/sh\necho v1\n").unwrap();
        fs::set_permissions(&target, fs::Permissions::from_mode(0o755)).unwrap();

        fs::write(
            &new_bin,
            format!("#!/bin/sh\necho \"$ZUNO_RELAUNCH_WAIT_MS\" > \"{}\"\n", marker.display()),
        )
        .unwrap();
        fs::set_permissions(&new_bin, fs::Permissions::from_mode(0o755)).unwrap();

        atomic_swap_binary(&new_bin, &target).unwrap();

        // Simulate Linux `/proc/self/exe` after `atomic_swap_binary` unlinked `zuno.old`
        let deleted_path = PathBuf::from(format!("{}.old (deleted)", target.display()));
        spawn_relaunched_app(Some(&deleted_path)).unwrap();

        // Wait up to 2s for the spawned script to write the marker
        for _ in 0..40 {
            if marker.is_file() {
                break;
            }
            std::thread::sleep(Duration::from_millis(50));
        }
        let content = fs::read_to_string(&marker).expect("relaunched binary should have run");
        assert_eq!(content.trim(), "350");

        let _ = fs::remove_dir_all(&base);
    }
}
