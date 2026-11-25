# =============================================================================
#  Zuno Universal Single-Binary Installer (Windows PowerShell)
#  Usage:
#    irm https://raw.githubusercontent.com/aswin402/zuno/main/install.ps1 | iex
#    & ([scriptblock]::Create((irm https://raw.githubusercontent.com/aswin402/zuno/main/install.ps1))) -Version v0.0.15
#    & ([scriptblock]::Create((irm https://raw.githubusercontent.com/aswin402/zuno/main/install.ps1))) -Uninstall
# =============================================================================
param(
    [string]$Version = "latest",
    [string]$InstallDir = (Join-Path $env:LOCALAPPDATA "Zuno\bin"),
    [switch]$NoBackup,
    [switch]$Uninstall
)

$ErrorActionPreference = "Stop"
$ProgressPreference = "SilentlyContinue"
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12

$Repo = if ($env:ZUNO_REPO) { $env:ZUNO_REPO } else { "aswin402/zuno" }
$ZunoHome = if ($env:ZUNO_DIR) { $env:ZUNO_DIR } else { Join-Path $env:USERPROFILE "zuno" }
$Target = "windows-x86_64"
$Archive = "zuno-$Target.zip"
$StartMenuShortcut = Join-Path $env:APPDATA "Microsoft\Windows\Start Menu\Programs\Zuno.lnk"

# Enable UTF-8 output for clean equalizer glyphs
try { [Console]::OutputEncoding = [System.Text.Encoding]::UTF8 } catch {}

function Write-Banner {
    Write-Host ""
    $frames = @("▁ ▃ ▅ ▂", "▃ ▆ █ ▅", "▆ █ ▅ ▃", "▂ ▅ █ ▄")
    foreach ($f in $frames) {
        Write-Host -NoNewline "`r  $f   Z U N O   ·  offline-first music player" -ForegroundColor White
        Start-Sleep -Milliseconds 55
    }
    Write-Host "`r                                                                "
    Write-Host "  ╭──────────────────────────────────────────────────────╮" -ForegroundColor DarkGray
    Write-Host -NoNewline "  │  " -ForegroundColor DarkGray
    Write-Host -NoNewline "▂ ▅ █ ▄   Z U N O" -ForegroundColor White
    Write-Host "                                   │" -ForegroundColor DarkGray
    Write-Host -NoNewline "  │            " -ForegroundColor DarkGray
    Write-Host -NoNewline "ultra-lightweight offline music player" -ForegroundColor Gray
    Write-Host "    │" -ForegroundColor DarkGray
    Write-Host "  ╰──────────────────────────────────────────────────────╯" -ForegroundColor DarkGray
    Write-Host ""
}

function Write-StepOk([string]$Label, [string]$Detail = "") {
    Write-Host -NoNewline "  ✓  " -ForegroundColor White
    Write-Host -NoNewline $Label -ForegroundColor Gray
    if ($Detail) {
        Write-Host "  $Detail" -ForegroundColor DarkGray
    } else {
        Write-Host ""
    }
}

function Write-StepFail([string]$Label, [string]$Detail = "") {
    Write-Host ""
    Write-Host "  ✕  $Label" -ForegroundColor Red
    if ($Detail) { Write-Host "     $Detail" -ForegroundColor DarkGray }
    Write-Host ""
    exit 1
}

function Backup-ZunoData {
    if ($NoBackup) { return }
    $playlistsDir = Join-Path $ZunoHome "playlists"
    $metaDir = Join-Path $ZunoHome ".zuno"
    $hasData = $false

    if ((Test-Path $playlistsDir) -and (Get-ChildItem -Path $playlistsDir -Filter "*.m3u8" -ErrorAction SilentlyContinue)) {
        $hasData = $true
    }
    foreach ($f in @("sources.json", "state.json", "index.json")) {
        if (Test-Path (Join-Path $metaDir $f)) { $hasData = $true }
    }
    if (-not $hasData) { return }

    $ts = Get-Date -Format "yyyyMMdd-HHmmss"
    $backupDir = Join-Path $metaDir "backups\cli-$ts"
    $backupPl = Join-Path $backupDir "playlists"
    New-Item -ItemType Directory -Force -Path $backupPl | Out-Null

    $count = 0
    if (Test-Path $playlistsDir) {
        Get-ChildItem -Path $playlistsDir -Filter "*.m3u8" -ErrorAction SilentlyContinue | ForEach-Object {
            Copy-Item $_.FullName -Destination $backupPl -Force
            $count++
        }
    }
    foreach ($f in @("sources.json", "state.json", "index.json")) {
        $src = Join-Path $metaDir $f
        if (Test-Path $src) {
            Copy-Item $src -Destination (Join-Path $backupDir $f) -Force
            $count++
        }
    }

    # Retain only the 5 most recent backups
    $backupsRoot = Join-Path $metaDir "backups"
    if (Test-Path $backupsRoot) {
        Get-ChildItem -Path $backupsRoot -Directory | Sort-Object LastWriteTime -Descending | Select-Object -Skip 5 | Remove-Item -Recurse -Force -ErrorAction SilentlyContinue
    }

    Write-StepOk "Backed up playlists & settings ($count files)" $backupDir
}

function Invoke-ZunoDownload([string]$Url, [string]$Dest, [long]$ExpectedSize = 0) {
    $frames = @("▁▃▅▇", "▃▅▇█", "▅▇█▆", "▇█▆▄", "█▆▄▂", "▆▄▂▁", "▄▂▁▃", "▂▁▃▅")
    $job = Start-Job -ScriptBlock {
        param($u, $d)
        $ProgressPreference = "SilentlyContinue"
        [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
        Invoke-WebRequest -Uri $u -OutFile $d -UseBasicParsing
    } -ArgumentList $Url, $Dest

    $i = 0
    while ($job.State -eq "Running") {
        $cur = if (Test-Path $Dest) { (Get-Item $Dest).Length } else { 0 }
        $curMb = "{0:N1}" -f ($cur / 1MB)
        if ($ExpectedSize -gt 0) {
            $pct = [Math]::Min(100, [int](($cur * 100) / $ExpectedSize))
            $filled = [int](($pct * 22) / 100)
            $bar = ("█" * $filled) + ("░" * (22 - $filled))
            $totMb = "{0:N1}" -f ($ExpectedSize / 1MB)
            Write-Host -NoNewline ("`r  {0}  Downloading Zuno  {1} {2,3}% ({3} / {4} MB)   " -f $frames[$i], $bar, $pct, $curMb, $totMb) -ForegroundColor White
        } else {
            Write-Host -NoNewline ("`r  {0}  Downloading Zuno  ({1} MB)   " -f $frames[$i], $curMb) -ForegroundColor White
        }
        $i = ($i + 1) % $frames.Length
        Start-Sleep -Milliseconds 85
    }

    Write-Host -NoNewline "`r                                                                              `r"
    try {
        Receive-Job $job -ErrorAction Stop | Out-Null
    } catch {
        Remove-Job $job -Force -ErrorAction SilentlyContinue
        Write-StepFail "Download failed" $_.Exception.Message
    }
    Remove-Job $job -Force -ErrorAction SilentlyContinue
}

Write-Banner

if ($Uninstall) {
    Remove-Item -Force -ErrorAction SilentlyContinue (Join-Path $InstallDir "zuno.exe"), (Join-Path $InstallDir "zuno-mcp.exe"), (Join-Path $InstallDir "zuno.exe.old"), (Join-Path $InstallDir "zuno-mcp.exe.old"), $StartMenuShortcut
    Write-StepOk "Removed Zuno binaries and Start Menu shortcut"
    Write-Host "  ·  Your music library & playlists in $ZunoHome were left untouched." -ForegroundColor DarkGray
    Write-Host ""
    exit 0
}

Write-StepOk "Detected platform" $Target

$TempDir = Join-Path ([System.IO.Path]::GetTempPath()) ("zuno-install-" + [Guid]::NewGuid().ToString("N").Substring(0, 8))
New-Item -ItemType Directory -Force -Path $TempDir | Out-Null

try {
    $ResolvedTag = $Version
    $DownloadUrl = ""
    $ExpectedSha = ""
    $ExpectedSize = 0

    $ManifestUrl = if ($Version -eq "latest") {
        "https://github.com/$Repo/releases/latest/download/latest.json"
    } else {
        $ResolvedTag = if ($Version.StartsWith("v")) { $Version } else { "v$Version" }
        "https://github.com/$Repo/releases/download/$ResolvedTag/latest.json"
    }

    try {
        $manifest = Invoke-RestMethod -Uri $ManifestUrl -TimeoutSec 12
        if ($manifest.tag) { $ResolvedTag = [string]$manifest.tag }
        $targetInfo = $manifest.targets.$Target
        if ($targetInfo) {
            $DownloadUrl = [string]$targetInfo.url
            $ExpectedSha = [string]$targetInfo.sha256
            if ($targetInfo.size) { $ExpectedSize = [long]$targetInfo.size }
        }
    } catch {
        if ($Version -eq "latest") {
            Write-StepFail "Could not fetch release manifest from GitHub" $_.Exception.Message
        }
    }

    if (-not $DownloadUrl) {
        $DownloadUrl = "https://github.com/$Repo/releases/download/$ResolvedTag/$Archive"
    }

    Write-StepOk "Resolved release" "$ResolvedTag ($Archive)"

    Backup-ZunoData

    $ArchivePath = Join-Path $TempDir $Archive
    Invoke-ZunoDownload -Url $DownloadUrl -Dest $ArchivePath -ExpectedSize $ExpectedSize
    $dlSizeMb = "{0:N1} MB" -f ((Get-Item $ArchivePath).Length / 1MB)
    Write-StepOk "Downloaded archive" $dlSizeMb

    if ($ExpectedSha) {
        $actualSha = (Get-FileHash -Path $ArchivePath -Algorithm SHA256).Hash.ToLower()
        if ($actualSha -ne $ExpectedSha.ToLower()) {
            Write-StepFail "SHA-256 verification failed" "Expected $ExpectedSha, got $actualSha"
        }
        Write-StepOk "Verified SHA-256 checksum" ($actualSha.Substring(0, 12) + "…")
    }

    $ExtractDir = Join-Path $TempDir "extract"
    Expand-Archive -Path $ArchivePath -DestinationPath $ExtractDir -Force

    New-Item -ItemType Directory -Force -Path $InstallDir, (Join-Path $ZunoHome "songs"), (Join-Path $ZunoHome "playlists") | Out-Null

    foreach ($bin in @("zuno.exe", "zuno-mcp.exe")) {
        $src = Join-Path $ExtractDir $bin
        if (Test-Path $src) {
            $dst = Join-Path $InstallDir $bin
            $old = Join-Path $InstallDir "$bin.old"
            if (Test-Path $dst) {
                Remove-Item $old -Force -ErrorAction SilentlyContinue
                Move-Item $dst $old -Force
            }
            Copy-Item $src $dst -Force
            Remove-Item $old -Force -ErrorAction SilentlyContinue
        }
    }
    Write-StepOk "Installed binaries" "$InstallDir\{zuno.exe,zuno-mcp.exe}"

    # Add InstallDir to User PATH cleanly if missing
    $userPath = [Environment]::GetEnvironmentVariable("Path", "User")
    $segments = @()
    if ($userPath) { $segments = $userPath -split ";" | Where-Object { $_ -ne "" } }
    if ($segments -notcontains $InstallDir) {
        $nextPath = (($segments + $InstallDir) -join ";")
        [Environment]::SetEnvironmentVariable("Path", $nextPath, "User")
        $env:Path = "$InstallDir;$env:Path"
        Write-StepOk "Added to user PATH" $InstallDir
    }

    # Create Start Menu shortcut
    try {
        $wsh = New-Object -ComObject WScript.Shell
        $sc = $wsh.CreateShortcut($StartMenuShortcut)
        $sc.TargetPath = Join-Path $InstallDir "zuno.exe"
        $sc.WorkingDirectory = $ZunoHome
        $sc.Description = "Zuno — Ultra-lightweight offline music player"
        $sc.Save()
        Write-StepOk "Created Start Menu shortcut" "Zuno"
    } catch {}

    Write-Host ""
    Write-Host "  ────────────────────────────────────────────────────────" -ForegroundColor DarkGray
    Write-Host -NoNewline "  [ ZUNO READY ]  " -ForegroundColor White
    Write-Host $ResolvedTag -ForegroundColor Gray
    Write-Host ""
    Write-Host -NoNewline "  App binary     " -ForegroundColor DarkGray
    Write-Host (Join-Path $InstallDir "zuno.exe") -ForegroundColor Gray
    Write-Host -NoNewline "  CLI binary     " -ForegroundColor DarkGray
    Write-Host (Join-Path $InstallDir "zuno-mcp.exe") -ForegroundColor Gray
    Write-Host -NoNewline "  Music folder   " -ForegroundColor DarkGray
    Write-Host (Join-Path $ZunoHome "songs") -ForegroundColor Gray
    Write-Host ""
    Write-Host "  Run 'zuno' in a new terminal or launch Zuno from the Start Menu." -ForegroundColor DarkGray
    Write-Host ""
} finally {
    Remove-Item -Recurse -Force -ErrorAction SilentlyContinue $TempDir
}
