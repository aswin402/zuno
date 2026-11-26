# =============================================================================
#  Zuno Universal Single-Binary Installer (Windows PowerShell)
#  Pure 7-bit ASCII source so `irm ... | iex` renders cleanly on both
#  Windows PowerShell 5.1 and PowerShell 7+ without UTF-8 BOM mojibake.
#  Usage:
#    irm https://raw.githubusercontent.com/aswin402/zuno/main/install.ps1 | iex
#    & ([scriptblock]::Create((irm https://raw.githubusercontent.com/aswin402/zuno/main/install.ps1))) -Version v0.0.24
#    & ([scriptblock]::Create((irm https://raw.githubusercontent.com/aswin402/zuno/main/install.ps1))) -Uninstall
# =============================================================================
param(
    [string]$Version = "latest",
    [string]$InstallDir = (Join-Path $env:LOCALAPPDATA "Zuno\bin"),
    [switch]$NoBackup,
    [switch]$Uninstall,
    [switch]$Quiet
)

$ErrorActionPreference = "Stop"
$ProgressPreference = "SilentlyContinue"
try {
    [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12 -bor [Net.SecurityProtocolType]::Tls13
} catch {
    [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
}

$Repo = if ($env:ZUNO_REPO) { $env:ZUNO_REPO } else { "aswin402/zuno" }
$ZunoHome = if ($env:ZUNO_DIR) { $env:ZUNO_DIR } else { Join-Path $env:USERPROFILE "zuno" }
$Target = "windows-x86_64"
$Archive = "zuno-$Target.zip"
$StartMenuShortcut = Join-Path $env:APPDATA "Microsoft\Windows\Start Menu\Programs\Zuno.lnk"

# Enable UTF-8 console output and detect interactive console + Unicode support
$IsInteractive = (-not $Quiet)
try {
    if ([Console]::IsOutputRedirected) { $IsInteractive = $false }
} catch {}

$UseUnicode = $false
try {
    [Console]::OutputEncoding = [System.Text.Encoding]::UTF8
    $UseUnicode = $true
} catch {}

if ($UseUnicode) {
    $B1 = [char]0x2581; $B2 = [char]0x2582; $B3 = [char]0x2583; $B4 = [char]0x2584
    $B5 = [char]0x2585; $B6 = [char]0x2586; $B7 = [char]0x2587; $B8 = [char]0x2588
    $BarFill = [string]$B8
    $BarEmpty = [string]([char]0x2591)
    $EqFrames = @(
        "$B1$B3$B5$B7", "$B3$B5$B7$B8", "$B5$B7$B8$B6", "$B7$B8$B6$B4",
        "$B8$B6$B4$B2", "$B6$B4$B2$B1", "$B4$B2$B1$B3", "$B2$B1$B3$B5"
    )
    $BannerFrames = @(
        "$B1 $B2 $B3 $B1", "$B2 $B4 $B6 $B3", "$B4 $B6 $B8 $B5", "$B6 $B8 $B6 $B7", "$B8 $B5 $B4 $B8",
        "$B5 $B3 $B6 $B6", "$B3 $B5 $B8 $B4", "$B2 $B6 $B5 $B3", "$B3 $B5 $B7 $B4", "$B2 $B5 $B8 $B4"
    )
    $BannerLogo = "$B2 $B5 $B8 $B4"
    $SymOk = [string]([char]0x2713)
    $SymErr = [string]([char]0x2715)
    $SymDot = [string]([char]0x00B7)
    $SymEllip = [string]([char]0x2026)
    $BoxTL = [string]([char]0x256D); $BoxTR = [string]([char]0x256E)
    $BoxBL = [string]([char]0x2570); $BoxBR = [string]([char]0x256F)
    $BoxH  = [string]([char]0x2500); $BoxV  = [string]([char]0x2502)
} else {
    $BarFill = "#"
    $BarEmpty = "-"
    $EqFrames = @("[=   ]", "[==  ]", "[=== ]", "[ ===]", "[  ==]", "[   =]", "[  ==]", "[ == ]")
    $BannerFrames = @(". o O .", "o O # o", "O # O o", "# O o .", "o O # O", ". o # o")
    $BannerLogo = "===    "
    $SymOk = "+"
    $SymErr = "x"
    $SymDot = "-"
    $SymEllip = "..."
    $BoxTL = "+"; $BoxTR = "+"; $BoxBL = "+"; $BoxBR = "+"
    $BoxH  = "-"; $BoxV  = "|"
}

$script:CursorWasVisible = $true
$script:CursorHidden = $false

function Hide-ZunoCursor {
    if (-not $IsInteractive -or $script:CursorHidden) { return }
    try {
        $script:CursorWasVisible = [Console]::CursorVisible
        [Console]::CursorVisible = $false
        $script:CursorHidden = $true
    } catch {}
}

function Show-ZunoCursor {
    if (-not $script:CursorHidden) { return }
    try {
        [Console]::CursorVisible = $script:CursorWasVisible
    } catch {}
    $script:CursorHidden = $false
}

function Clear-StatusLine {
    if (-not $IsInteractive) { return }
    Write-Host -NoNewline ("`r" + (" " * 78) + "`r")
}

function Write-Banner {
    if ($Quiet) { return }
    Write-Host ""
    if ($IsInteractive) {
        Hide-ZunoCursor
        foreach ($f in $BannerFrames) {
            Write-Host -NoNewline ("`r  {0}   Z U N O   {1}  offline-first music player   " -f $f, $SymDot) -ForegroundColor White
            Start-Sleep -Milliseconds 65
        }
        Clear-StatusLine
        Show-ZunoCursor
        $rule = $BoxH * 54
        Write-Host ("  {0}{1}{2}" -f $BoxTL, $rule, $BoxTR) -ForegroundColor DarkGray
        Write-Host -NoNewline ("  {0}  " -f $BoxV) -ForegroundColor DarkGray
        Write-Host -NoNewline ("{0}   Z U N O" -f $BannerLogo) -ForegroundColor White
        Write-Host ("                                   {0}" -f $BoxV) -ForegroundColor DarkGray
        Write-Host -NoNewline ("  {0}            " -f $BoxV) -ForegroundColor DarkGray
        Write-Host -NoNewline "ultra-lightweight offline music player" -ForegroundColor Gray
        Write-Host ("    {0}" -f $BoxV) -ForegroundColor DarkGray
        Write-Host ("  {0}{1}{2}" -f $BoxBL, $rule, $BoxBR) -ForegroundColor DarkGray
        Write-Host ""
    } else {
        Write-Host "  ZUNO -- ultra-lightweight offline music player"
        Write-Host ""
    }
}

function Write-StepOk([string]$Label, [string]$Detail = "") {
    if ($Quiet) { return }
    Write-Host -NoNewline ("  {0}  " -f $SymOk) -ForegroundColor White
    Write-Host -NoNewline $Label -ForegroundColor Gray
    if ($Detail) {
        Write-Host "  $Detail" -ForegroundColor DarkGray
    } else {
        Write-Host ""
    }
}

function Write-StepFail([string]$Label, [string]$Detail = "", [string]$Hint = "") {
    Clear-StatusLine
    Show-ZunoCursor
    Write-Host ""
    Write-Host ("  {0}  {1}" -f $SymErr, $Label) -ForegroundColor Red
    if ($Detail) { Write-Host "     $Detail" -ForegroundColor DarkGray }
    if ($Hint)   { Write-Host "     $Hint" -ForegroundColor DarkGray }
    Write-Host ""
    exit 1
}

function Invoke-HttpTextWithSpin([string]$Url, [string]$Label, [int]$TimeoutMs = 15000) {
    $req = [System.Net.HttpWebRequest]::Create($Url)
    $req.UserAgent = "Zuno-Installer"
    $req.Accept = "application/vnd.github+json, application/json, */*"
    $req.AllowAutoRedirect = $true
    $req.Timeout = $TimeoutMs
    $req.ReadWriteTimeout = $TimeoutMs

    $async = $req.BeginGetResponse($null, $null)
    $i = 0
    $sw = [System.Diagnostics.Stopwatch]::StartNew()
    Hide-ZunoCursor
    try {
        while (-not $async.IsCompleted) {
            if ($sw.ElapsedMilliseconds -gt $TimeoutMs) {
                try { $req.Abort() } catch {}
                return @{ Ok = $false; StatusCode = 0; Body = ""; Error = "Request timed out" }
            }
            if ($IsInteractive) {
                Write-Host -NoNewline ("`r  {0}  {1}   " -f $EqFrames[$i], $Label) -ForegroundColor White
                $i = ($i + 1) % $EqFrames.Length
            }
            Start-Sleep -Milliseconds 75
        }
        $resp = $req.EndGetResponse($async)
        try {
            $stream = $resp.GetResponseStream()
            $reader = New-Object System.IO.StreamReader($stream, [System.Text.Encoding]::UTF8)
            try {
                $body = $reader.ReadToEnd()
            } finally {
                $reader.Dispose()
            }
            return @{ Ok = $true; StatusCode = [int]$resp.StatusCode; Body = $body; Error = "" }
        } finally {
            $resp.Close()
        }
    } catch {
        $ex = $_.Exception
        if ($ex -isnot [System.Net.WebException] -and $ex.InnerException -is [System.Net.WebException]) {
            $ex = $ex.InnerException
        }
        $code = 0
        if (($ex -is [System.Net.WebException]) -and $ex.Response -and ($ex.Response -is [System.Net.HttpWebResponse])) {
            $code = [int]$ex.Response.StatusCode
        }
        return @{ Ok = $false; StatusCode = $code; Body = ""; Error = $ex.Message }
    } finally {
        Clear-StatusLine
        Show-ZunoCursor
    }
}

# In-process streaming download with real-time animated equalizer + monochrome progress bar
function Invoke-ZunoDownload([string]$Url, [string]$Dest, [long]$ExpectedSize = 0) {
    $req = [System.Net.HttpWebRequest]::Create($Url)
    $req.UserAgent = "Zuno-Installer"
    $req.AllowAutoRedirect = $true
    $req.Timeout = 20000
    $req.ReadWriteTimeout = 30000

    $resp = $null
    $i = 0
    $width = 22
    $bounce = 0
    $bdir = 1
    Hide-ZunoCursor
    try {
        $async = $req.BeginGetResponse($null, $null)
        while (-not $async.IsCompleted) {
            if ($IsInteractive) {
                Write-Host -NoNewline ("`r  {0}  Connecting to GitHub   " -f $EqFrames[$i]) -ForegroundColor White
                $i = ($i + 1) % $EqFrames.Length
            }
            Start-Sleep -Milliseconds 75
        }
        $resp = $req.EndGetResponse($async)
        $total = if ($ExpectedSize -gt 0) { $ExpectedSize } elseif ($resp.ContentLength -gt 0) { [long]$resp.ContentLength } else { 0L }

        $inStream = $resp.GetResponseStream()
        $outStream = [System.IO.File]::Create($Dest)
        try {
            $buffer = New-Object byte[] 32768
            $downloaded = 0L
            $lastDraw = [System.Diagnostics.Stopwatch]::StartNew()
            $firstDraw = $true

            while ($true) {
                $readAsync = $inStream.BeginRead($buffer, 0, $buffer.Length, $null, $null)
                while (-not $readAsync.IsCompleted) {
                    if ($IsInteractive -and ($firstDraw -or $lastDraw.ElapsedMilliseconds -ge 70)) {
                        $firstDraw = $false
                        $lastDraw.Restart()
                        $curMb = "{0:N1}" -f ($downloaded / 1MB)
                        if ($total -gt 0) {
                            $pct = [Math]::Min(100, [int](($downloaded * 100) / $total))
                            $filled = [int](($pct * $width) / 100)
                            $bar = ($BarFill * $filled) + ($BarEmpty * ($width - $filled))
                            $totMb = "{0:N1}" -f ($total / 1MB)
                            Write-Host -NoNewline ("`r  {0}  Downloading Zuno  {1} {2,3}% ({3} / {4} MB)   " -f $EqFrames[$i], $bar, $pct, $curMb, $totMb) -ForegroundColor White
                        } else {
                            $seg = 5
                            $bar = ($BarEmpty * $bounce) + ($BarFill * $seg) + ($BarEmpty * ($width - $seg - $bounce))
                            Write-Host -NoNewline ("`r  {0}  Downloading Zuno  {1} {2} MB   " -f $EqFrames[$i], $bar, $curMb) -ForegroundColor White
                            $bounce += $bdir
                            if ($bounce -ge ($width - $seg)) { $bounce = $width - $seg; $bdir = -1 }
                            elseif ($bounce -le 0) { $bounce = 0; $bdir = 1 }
                        }
                        $i = ($i + 1) % $EqFrames.Length
                    }
                    Start-Sleep -Milliseconds 20
                }
                $read = $inStream.EndRead($readAsync)
                if ($read -le 0) { break }
                $outStream.Write($buffer, 0, $read)
                $downloaded += $read

                if ($IsInteractive -and ($firstDraw -or $lastDraw.ElapsedMilliseconds -ge 70)) {
                    $firstDraw = $false
                    $lastDraw.Restart()
                    $curMb = "{0:N1}" -f ($downloaded / 1MB)
                    if ($total -gt 0) {
                        $pct = [Math]::Min(100, [int](($downloaded * 100) / $total))
                        $filled = [int](($pct * $width) / 100)
                        $bar = ($BarFill * $filled) + ($BarEmpty * ($width - $filled))
                        $totMb = "{0:N1}" -f ($total / 1MB)
                        Write-Host -NoNewline ("`r  {0}  Downloading Zuno  {1} {2,3}% ({3} / {4} MB)   " -f $EqFrames[$i], $bar, $pct, $curMb, $totMb) -ForegroundColor White
                    } else {
                        $seg = 5
                        $bar = ($BarEmpty * $bounce) + ($BarFill * $seg) + ($BarEmpty * ($width - $seg - $bounce))
                        Write-Host -NoNewline ("`r  {0}  Downloading Zuno  {1} {2} MB   " -f $EqFrames[$i], $bar, $curMb) -ForegroundColor White
                        $bounce += $bdir
                        if ($bounce -ge ($width - $seg)) { $bounce = $width - $seg; $bdir = -1 }
                        elseif ($bounce -le 0) { $bounce = 0; $bdir = 1 }
                    }
                    $i = ($i + 1) % $EqFrames.Length
                }
            }
        } finally {
            $outStream.Dispose()
            $inStream.Dispose()
        }
    } catch {
        Write-StepFail "Download failed" $_.Exception.Message $Url
    } finally {
        if ($resp) { try { $resp.Close() } catch {} }
        Clear-StatusLine
        Show-ZunoCursor
    }
}

function Backup-ZunoData {
    if ($NoBackup) { return }
    $playlistsDir = Join-Path $ZunoHome "playlists"
    $metaDir = Join-Path $ZunoHome ".zuno"
    $metaFiles = @("sources.json", "state.json", "index.json", "radio.json", "settings.json")
    $hasData = $false

    if ((Test-Path $playlistsDir) -and (Get-ChildItem -Path $playlistsDir -Filter "*.m3u8" -ErrorAction SilentlyContinue)) {
        $hasData = $true
    }
    foreach ($f in $metaFiles) {
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
    foreach ($f in $metaFiles) {
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

Write-Banner

if ($Uninstall) {
    Remove-Item -Force -ErrorAction SilentlyContinue `
        (Join-Path $InstallDir "zuno.exe"), `
        (Join-Path $InstallDir "zuno-mcp.exe"), `
        (Join-Path $InstallDir "zuno.exe.old"), `
        (Join-Path $InstallDir "zuno-mcp.exe.old"), `
        $StartMenuShortcut
    Write-StepOk "Removed Zuno binaries and Start Menu shortcut"
    if (-not $Quiet) {
        Write-Host ("  {0}  Your music library & playlists in {1} were left untouched." -f $SymDot, $ZunoHome) -ForegroundColor DarkGray
        Write-Host ""
    }
    exit 0
}

Write-StepOk "Detected platform" $Target

$TempDir = Join-Path ([System.IO.Path]::GetTempPath()) ("zuno-install-" + [Guid]::NewGuid().ToString("N").Substring(0, 8))
New-Item -ItemType Directory -Force -Path $TempDir | Out-Null

try {
    $ResolvedTag = ""
    $DownloadUrl = ""
    $ExpectedSha = ""
    $ExpectedSize = 0L
    $AvailableTargets = @()

    if ($Version -eq "latest") {
        $ManifestUrl = "https://github.com/$Repo/releases/latest/download/latest.json"
        $ApiUrl = "https://api.github.com/repos/$Repo/releases/latest"
        $SpinLabel = "Checking latest GitHub release"
    } else {
        $RequestedTag = if ($Version.StartsWith("v")) { $Version } else { "v$Version" }
        $ManifestUrl = "https://github.com/$Repo/releases/download/$RequestedTag/latest.json"
        $ApiUrl = "https://api.github.com/repos/$Repo/releases/tags/$RequestedTag"
        $SpinLabel = "Checking GitHub release $RequestedTag"
    }

    # 1. Try Zuno's lightweight latest.json manifest first
    $res = Invoke-HttpTextWithSpin -Url $ManifestUrl -Label $SpinLabel
    if ($res.Ok -and $res.Body) {
        try {
            $manifest = $res.Body | ConvertFrom-Json
            if ($manifest.tag) { $ResolvedTag = [string]$manifest.tag }
            if ($manifest.targets) {
                $AvailableTargets = @($manifest.targets.PSObject.Properties | ForEach-Object { $_.Name })
                $targetProp = $manifest.targets.PSObject.Properties[$Target]
                if ($targetProp -and $targetProp.Value) {
                    $DownloadUrl = [string]$targetProp.Value.url
                    $ExpectedSha = [string]$targetProp.Value.sha256
                    if ($targetProp.Value.size) { $ExpectedSize = [long]$targetProp.Value.size }
                }
            }
        } catch {}
    }

    # 2. Fallback to GitHub Releases REST API
    if (-not $DownloadUrl -and $AvailableTargets.Count -eq 0) {
        $apiRes = Invoke-HttpTextWithSpin -Url $ApiUrl -Label $SpinLabel
        if ($apiRes.Ok -and $apiRes.Body) {
            try {
                $rel = $apiRes.Body | ConvertFrom-Json
                if ($rel.tag_name) { $ResolvedTag = [string]$rel.tag_name }
                foreach ($asset in @($rel.assets)) {
                    $n = [string]$asset.name
                    if ($n -eq $Archive) {
                        $DownloadUrl = [string]$asset.browser_download_url
                        if ($asset.size) { $ExpectedSize = [long]$asset.size }
                    }
                    if ($n.StartsWith("zuno-") -and ($n.EndsWith(".zip") -or $n.EndsWith(".tar.gz"))) {
                        $AvailableTargets += ($n.Substring(5) -replace '\.(zip|tar\.gz)$', '')
                    }
                }
            } catch {}
        } else {
            $code = if ($apiRes.StatusCode -gt 0) { $apiRes.StatusCode } else { $res.StatusCode }
            if ($code -eq 404) {
                Write-StepFail "Could not fetch new version (no published GitHub release found)" `
                    "Check https://github.com/$Repo/releases or wait for the release workflow to finish."
            } elseif ($code -eq 403 -or $code -eq 429) {
                Write-StepFail "Could not fetch new version (GitHub rate limit reached, HTTP $code)" `
                    "Wait a minute and retry, or pass -Version <tag>."
            } else {
                $detail = if ($apiRes.Error) { $apiRes.Error } elseif ($res.Error) { $res.Error } else { "Unable to reach github.com" }
                Write-StepFail "Could not fetch new version" $detail "Check your internet connection and retry."
            }
        }
    }

    if (-not $DownloadUrl) {
        $availText = if ($AvailableTargets.Count -gt 0) { "Available targets: " + (($AvailableTargets | Sort-Object -Unique) -join ", ") } else { "Check https://github.com/$Repo/releases" }
        Write-StepFail "Release $ResolvedTag has no prebuilt archive for $Target" $availText
    }

    Write-StepOk "Resolved release" "$ResolvedTag ($Archive)"

    Backup-ZunoData

    $ArchivePath = Join-Path $TempDir $Archive
    Invoke-ZunoDownload -Url $DownloadUrl -Dest $ArchivePath -ExpectedSize $ExpectedSize
    $dlSizeMb = "{0:N1} MB" -f ((Get-Item $ArchivePath).Length / 1MB)
    Write-StepOk "Downloaded archive" $dlSizeMb

    if (-not $ExpectedSha) {
        $baseUrl = $DownloadUrl.Substring(0, $DownloadUrl.LastIndexOf("/"))
        $shaRes = Invoke-HttpTextWithSpin -Url "$baseUrl/SHA256SUMS.txt" -Label "Fetching checksums" -TimeoutMs 10000
        if ($shaRes.Ok -and $shaRes.Body) {
            foreach ($line in ($shaRes.Body -split "`r?`n")) {
                $parts = ($line.Trim() -split '\s+')
                if ($parts.Length -ge 2 -and ($parts[1] -eq $Archive -or $parts[1] -eq "*$Archive")) {
                    $ExpectedSha = $parts[0]
                    break
                }
            }
        }
    }

    if ($ExpectedSha) {
        $actualSha = (Get-FileHash -Path $ArchivePath -Algorithm SHA256).Hash.ToLower()
        if ($actualSha -ne $ExpectedSha.ToLower()) {
            Write-StepFail "SHA-256 verification failed" "Expected $ExpectedSha, got $actualSha"
        }
        Write-StepOk "Verified SHA-256 checksum" ($actualSha.Substring(0, 12) + $SymEllip)
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

    # Create Start Menu shortcut with embedded Zuno icon
    try {
        $wsh = New-Object -ComObject WScript.Shell
        $sc = $wsh.CreateShortcut($StartMenuShortcut)
        $exePath = Join-Path $InstallDir "zuno.exe"
        $sc.TargetPath = $exePath
        $sc.IconLocation = "$exePath,0"
        $sc.WorkingDirectory = $ZunoHome
        $sc.Description = "Zuno -- Ultra-lightweight offline music player"
        $sc.Save()
        Write-StepOk "Created Start Menu shortcut" "Zuno"
    } catch {}

    if (-not $Quiet) {
        Write-Host ""
        Write-Host ("  " + ($BoxH * 56)) -ForegroundColor DarkGray
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
    }
} finally {
    Show-ZunoCursor
    Remove-Item -Recurse -Force -ErrorAction SilentlyContinue $TempDir
}
