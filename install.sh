#!/usr/bin/env bash
# =============================================================================
#  Zuno Universal Single-Binary Installer (Linux & macOS)
#  Usage:
#    curl -fsSL https://raw.githubusercontent.com/aswin402/zuno/main/install.sh | bash
#    curl -fsSL https://raw.githubusercontent.com/aswin402/zuno/main/install.sh | bash -s -- --version v0.0.15
#    curl -fsSL https://raw.githubusercontent.com/aswin402/zuno/main/install.sh | bash -s -- --uninstall
# =============================================================================
set -euo pipefail

REPO="${ZUNO_REPO:-aswin402/zuno}"
VERSION="latest"
BIN_DIR="${ZUNO_BIN_DIR:-${XDG_BIN_HOME:-$HOME/.local/bin}}"
DATA_DIR="${XDG_DATA_HOME:-$HOME/.local/share}"
ZUNO_HOME="${ZUNO_DIR:-$HOME/zuno}"
DO_BACKUP=1
UNINSTALL=0
QUIET=0

# ── Parse CLI Arguments ──
while [ $# -gt 0 ]; do
  case "$1" in
    --version|-v)
      VERSION="${2:-}"
      shift 2
      ;;
    --dir|-d)
      BIN_DIR="${2:-}"
      shift 2
      ;;
    --no-backup)
      DO_BACKUP=0
      shift
      ;;
    --uninstall)
      UNINSTALL=1
      shift
      ;;
    --quiet|-q)
      QUIET=1
      shift
      ;;
    --help|-h)
      cat <<'HELP'
Zuno Universal Installer (Linux & macOS)

Usage:
  install.sh [options]

Options:
  -v, --version <tag>   Install a specific release tag (e.g. v0.0.15)
  -d, --dir <path>      Target binary directory (default: ~/.local/bin)
      --no-backup       Skip automatic backup of playlists & settings
      --uninstall       Remove installed Zuno binaries & shortcuts (keeps music)
  -q, --quiet           Minimal plain output without animations
  -h, --help            Show this help message
HELP
      exit 0
      ;;
    *)
      printf 'Unknown option: %s (use --help)\n' "$1" >&2
      exit 1
      ;;
  esac
done

# ── Zuno Monochrome Theme & Terminal Capabilities ──
IS_TTY=0
if [ -t 1 ] && [ "${TERM:-dumb}" != "dumb" ] && [ -z "${NO_COLOR:-}" ] && [ "$QUIET" -eq 0 ]; then
  IS_TTY=1
fi

if [ "$IS_TTY" -eq 1 ]; then
  C_RESET='\033[0m'
  C_WHITE='\033[1;97m'
  C_LIGHT='\033[38;5;252m'
  C_MUTED='\033[38;5;244m'
  C_LINE='\033[38;5;238m'
  C_INV='\033[1;30;107m'
  C_ERR='\033[1;31m'
  C_WARN='\033[38;5;250m'
else
  C_RESET=''
  C_WHITE=''
  C_LIGHT=''
  C_MUTED=''
  C_LINE=''
  C_INV=''
  C_ERR=''
  C_WARN=''
fi

TMP_DIR=""
SPINNER_PID=""

cleanup() {
  if [ -n "$SPINNER_PID" ]; then
    kill "$SPINNER_PID" >/dev/null 2>&1 || true
    wait "$SPINNER_PID" 2>/dev/null || true
    SPINNER_PID=""
  fi
  if [ "$IS_TTY" -eq 1 ]; then
    printf '\033[?25h'
  fi
  if [ -n "$TMP_DIR" ] && [ -d "$TMP_DIR" ]; then
    rm -rf "$TMP_DIR"
  fi
}
trap cleanup EXIT INT TERM

print_banner() {
  [ "$QUIET" -eq 1 ] && return 0
  printf '\n'
  if [ "$IS_TTY" -eq 1 ]; then
    # Brief signature equalizer-bar entrance animation (4 frames, ~0.22s total)
    local f
    for f in "▁ ▃ ▅ ▂" "▃ ▆ █ ▅" "▆ █ ▅ ▃" "▂ ▅ █ ▄"; do
      printf '\r  %b%s%b   %bZ U N O%b   %b·  offline-first music player%b' \
        "$C_WHITE" "$f" "$C_RESET" "$C_WHITE" "$C_RESET" "$C_MUTED" "$C_RESET"
      sleep 0.055
    done
    printf '\r\033[2K'
    printf '  %b╭──────────────────────────────────────────────────────╮%b\n' "$C_LINE" "$C_RESET"
    printf '  %b│%b  %b▂ ▅ █ ▄%b   %bZ U N O%b                                   %b│%b\n' \
      "$C_LINE" "$C_RESET" "$C_WHITE" "$C_RESET" "$C_WHITE" "$C_RESET" "$C_LINE" "$C_RESET"
    printf '  %b│%b            %bultra-lightweight offline music player%b    %b│%b\n' \
      "$C_LINE" "$C_RESET" "$C_MUTED" "$C_RESET" "$C_LINE" "$C_RESET"
    printf '  %b╰──────────────────────────────────────────────────────╯%b\n\n' "$C_LINE" "$C_RESET"
  else
    printf '  ZUNO — ultra-lightweight offline music player\n\n'
  fi
}

step_ok() {
  printf '  %b✓%b  %b%s%b' "$C_WHITE" "$C_RESET" "$C_LIGHT" "$1" "$C_RESET"
  if [ -n "${2:-}" ]; then
    printf '  %b%s%b' "$C_MUTED" "$2" "$C_RESET"
  fi
  printf '\n'
}

step_note() {
  printf '  %b·%b  %b%s%b\n' "$C_MUTED" "$C_RESET" "$C_MUTED" "$1" "$C_RESET"
}

step_fail() {
  printf '\n  %b✕  %s%b\n' "$C_ERR" "$1" "$C_RESET" >&2
  if [ -n "${2:-}" ]; then
    printf '     %b%s%b\n' "$C_MUTED" "$2" "$C_RESET" >&2
  fi
  printf '\n' >&2
  exit 1
}

# Run a command with Zuno animated equalizer-bar spinner
run_spin() {
  local label="$1"
  shift

  if [ "$IS_TTY" -eq 0 ]; then
    if ! "$@" >/dev/null 2>&1; then
      step_fail "$label failed"
    fi
    return 0
  fi

  local err_log="$TMP_DIR/step.err"
  : > "$err_log"

  printf '\033[?25l'
  "$@" >"$TMP_DIR/step.out" 2>"$err_log" &
  local cmd_pid=$!

  (
    local frames=("▁▃▅▇" "▃▅▇█" "▅▇█▆" "▇█▆▄" "█▆▄▂" "▆▄▂▁" "▄▂▁▃" "▂▁▃▅")
    local i=0
    while kill -0 "$cmd_pid" 2>/dev/null; do
      printf '\r  %b%s%b  %b%s%b' "$C_WHITE" "${frames[$i]}" "$C_RESET" "$C_LIGHT" "$label" "$C_RESET"
      i=$(( (i + 1) % ${#frames[@]} ))
      sleep 0.08
    done
  ) &
  SPINNER_PID=$!

  local rc=0
  wait "$cmd_pid" || rc=$?
  kill "$SPINNER_PID" >/dev/null 2>&1 || true
  wait "$SPINNER_PID" 2>/dev/null || true
  SPINNER_PID=""
  printf '\r\033[2K\033[?25h'

  if [ "$rc" -ne 0 ]; then
    local detail
    detail="$(head -n 3 "$err_log" 2>/dev/null | tr '\n' ' ' || true)"
    step_fail "$label failed" "$detail"
  fi
}

# Download file with monochrome Zuno live progress bar
download_with_bar() {
  local url="$1"
  local dest="$2"
  local label="$3"
  local expected_size="${4:-0}"

  if [ "$IS_TTY" -eq 0 ]; then
    if ! curl -fsSL --retry 2 --connect-timeout 15 -o "$dest" "$url"; then
      step_fail "Download failed" "$url"
    fi
    return 0
  fi

  local err_log="$TMP_DIR/dl.err"
  : > "$err_log"
  printf '\033[?25l'
  curl -fsSL --retry 2 --connect-timeout 15 -o "$dest" "$url" 2>"$err_log" &
  local dl_pid=$!

  local frames=("▁▃▅▇" "▃▅▇█" "▅▇█▆" "▇█▆▄" "█▆▄▂" "▆▄▂▁" "▄▂▁▃" "▂▁▃▅")
  local i=0
  while kill -0 "$dl_pid" 2>/dev/null; do
    local cur_bytes=0
    if [ -f "$dest" ]; then
      cur_bytes=$(wc -c < "$dest" 2>/dev/null | tr -d ' ' || echo 0)
    fi
    local cur_mb
    cur_mb=$(awk -v b="$cur_bytes" 'BEGIN { printf "%.1f", b / 1048576 }')

    if [ "$expected_size" -gt 0 ] 2>/dev/null; then
      local pct=$(( cur_bytes * 100 / expected_size ))
      [ "$pct" -gt 100 ] && pct=100
      local filled=$(( pct * 22 / 100 ))
      local empty=$(( 22 - filled ))
      local bar_fill=""
      local bar_empty=""
      [ "$filled" -gt 0 ] && bar_fill=$(printf '%*s' "$filled" '' | tr ' ' '█')
      [ "$empty" -gt 0 ] && bar_empty=$(printf '%*s' "$empty" '' | tr ' ' '░')
      local tot_mb
      tot_mb=$(awk -v b="$expected_size" 'BEGIN { printf "%.1f", b / 1048576 }')
      printf '\r  %b%s%b  %b%s%b  %b%s%b%b%s%b %b%3d%%%b %b(%s / %s MB)%b' \
        "$C_WHITE" "${frames[$i]}" "$C_RESET" \
        "$C_LIGHT" "$label" "$C_RESET" \
        "$C_WHITE" "$bar_fill" "$C_RESET" \
        "$C_LINE" "$bar_empty" "$C_RESET" \
        "$C_WHITE" "$pct" "$C_RESET" \
        "$C_MUTED" "$cur_mb" "$tot_mb" "$C_RESET"
    else
      printf '\r  %b%s%b  %b%s%b  %b%s MB%b' \
        "$C_WHITE" "${frames[$i]}" "$C_RESET" \
        "$C_LIGHT" "$label" "$C_RESET" \
        "$C_MUTED" "$cur_mb" "$C_RESET"
    fi

    i=$(( (i + 1) % ${#frames[@]} ))
    sleep 0.08
  done

  local rc=0
  wait "$dl_pid" || rc=$?
  printf '\r\033[2K\033[?25h'

  if [ "$rc" -ne 0 ]; then
    local detail
    detail="$(head -n 3 "$err_log" 2>/dev/null | tr '\n' ' ' || true)"
    step_fail "Download failed" "${detail:-$url}"
  fi
}

compute_sha256() {
  local file="$1"
  if command -v sha256sum >/dev/null 2>&1; then
    sha256sum "$file" | awk '{print $1}'
  elif command -v shasum >/dev/null 2>&1; then
    shasum -a 256 "$file" | awk '{print $1}'
  elif command -v openssl >/dev/null 2>&1; then
    openssl dgst -sha256 "$file" | awk '{print $NF}'
  else
    echo ""
  fi
}

backup_existing_data() {
  [ "$DO_BACKUP" -eq 0 ] && return 0

  local has_data=0
  if [ -d "$ZUNO_HOME/playlists" ] && [ -n "$(ls -A "$ZUNO_HOME/playlists" 2>/dev/null || true)" ]; then
    has_data=1
  fi
  for f in sources.json state.json index.json; do
    if [ -f "$ZUNO_HOME/.zuno/$f" ]; then
      has_data=1
    fi
  done

  if [ "$has_data" -eq 0 ]; then
    return 0
  fi

  local ts
  ts="$(date +%Y%m%d-%H%M%S)"
  local backup_dir="$ZUNO_HOME/.zuno/backups/cli-$ts"
  mkdir -p "$backup_dir/playlists"

  local count=0
  if [ -d "$ZUNO_HOME/playlists" ]; then
    for pl in "$ZUNO_HOME/playlists"/*.m3u8; do
      [ -f "$pl" ] || continue
      cp "$pl" "$backup_dir/playlists/"
      count=$((count + 1))
    done
  fi
  for f in sources.json state.json index.json; do
    if [ -f "$ZUNO_HOME/.zuno/$f" ]; then
      cp "$ZUNO_HOME/.zuno/$f" "$backup_dir/$f"
      count=$((count + 1))
    fi
  done

  # Keep only the 5 most recent backups to avoid disk buildup
  if [ -d "$ZUNO_HOME/.zuno/backups" ]; then
    ls -1dt "$ZUNO_HOME/.zuno/backups"/* 2>/dev/null | tail -n +6 | while IFS= read -r old; do
      [ -n "$old" ] && rm -rf "$old"
    done
  fi

  step_ok "Backed up playlists & settings ($count files)" "${backup_dir/#$HOME/~}"
}

do_uninstall() {
  print_banner
  rm -f "$BIN_DIR/zuno" "$BIN_DIR/zuno-mcp" "$BIN_DIR/zuno.old" "$BIN_DIR/zuno-mcp.old"
  rm -f "$DATA_DIR/applications/zuno.desktop"
  rm -f "$DATA_DIR/icons/hicolor/scalable/apps/zuno.svg" \
        "$DATA_DIR/icons/hicolor/192x192/apps/zuno.png" \
        "$DATA_DIR/icons/hicolor/256x256/apps/zuno.png" \
        "$DATA_DIR/icons/hicolor/512x512/apps/zuno.png"
  rm -rf "$HOME/Applications/Zuno.app"
  step_ok "Removed Zuno binaries and desktop launchers"
  step_note "Your music library & playlists in ${ZUNO_HOME/#$HOME/~} were left untouched."
  printf '\n'
  exit 0
}

# ── Entrypoint ──
if [ "$UNINSTALL" -eq 1 ]; then
  do_uninstall
fi

print_banner

# 1. Check prerequisites
command -v curl >/dev/null 2>&1 || step_fail "curl is required to install Zuno" "Install curl and retry."
command -v tar  >/dev/null 2>&1 || step_fail "tar is required to unpack Zuno" "Install tar and retry."

TMP_DIR="$(mktemp -d 2>/dev/null || mktemp -d -t zuno-install)"

# 2. Detect platform & architecture
OS_RAW="$(uname -s)"
ARCH_RAW="$(uname -m)"

case "$OS_RAW" in
  Linux*)  OS="linux" ;;
  Darwin*) OS="macos" ;;
  MINGW*|MSYS*|CYGWIN*)
    step_fail "Windows shell detected" "Run the PowerShell installer instead: irm https://raw.githubusercontent.com/$REPO/main/install.ps1 | iex"
    ;;
  *) step_fail "Unsupported operating system: $OS_RAW" ;;
esac

case "$ARCH_RAW" in
  x86_64|amd64)  ARCH="x86_64" ;;
  aarch64|arm64) ARCH="aarch64" ;;
  *) step_fail "Unsupported CPU architecture: $ARCH_RAW" ;;
esac

TARGET="${OS}-${ARCH}"
ARCHIVE="zuno-${TARGET}.tar.gz"
step_ok "Detected platform" "$TARGET"

# 3. Resolve release metadata & checksum
MANIFEST_FILE="$TMP_DIR/latest.json"
DOWNLOAD_URL=""
EXPECTED_SHA=""
EXPECTED_SIZE=0
RESOLVED_TAG="$VERSION"

if [ "$VERSION" = "latest" ]; then
  MANIFEST_URL="https://github.com/$REPO/releases/latest/download/latest.json"
  run_spin "Checking latest GitHub release" curl -fsSL --retry 2 --connect-timeout 10 -o "$MANIFEST_FILE" "$MANIFEST_URL"
else
  case "$VERSION" in
    v*) RESOLVED_TAG="$VERSION" ;;
    *)  RESOLVED_TAG="v$VERSION" ;;
  esac
  MANIFEST_URL="https://github.com/$REPO/releases/download/$RESOLVED_TAG/latest.json"
  if ! curl -fsSL --connect-timeout 10 -o "$MANIFEST_FILE" "$MANIFEST_URL" 2>/dev/null; then
    rm -f "$MANIFEST_FILE"
  fi
fi

if [ -f "$MANIFEST_FILE" ]; then
  # Parse latest.json cleanly (uses python3/node if present, pure awk fallback otherwise)
  if command -v python3 >/dev/null 2>&1; then
    eval "$(python3 - "$MANIFEST_FILE" "$TARGET" <<'PY'
import json, sys, shlex
with open(sys.argv[1], 'r', encoding='utf-8') as f:
    data = json.load(f)
t = data.get('targets', {}).get(sys.argv[2], {})
print('RESOLVED_TAG=' + shlex.quote(str(data.get('tag', ''))))
print('DOWNLOAD_URL=' + shlex.quote(str(t.get('url', ''))))
print('EXPECTED_SHA=' + shlex.quote(str(t.get('sha256', ''))))
print('EXPECTED_SIZE=' + shlex.quote(str(int(t.get('size', 0) or 0))))
PY
)"
  elif command -v node >/dev/null 2>&1; then
    eval "$(node - "$MANIFEST_FILE" "$TARGET" <<'JS'
const fs = require('fs');
const d = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
const t = (d.targets && d.targets[process.argv[3]]) || {};
const q = (s) => "'" + String(s ?? '').replace(/'/g, "'\\''") + "'";
console.log('RESOLVED_TAG=' + q(d.tag || ''));
console.log('DOWNLOAD_URL=' + q(t.url || ''));
console.log('EXPECTED_SHA=' + q(t.sha256 || ''));
console.log('EXPECTED_SIZE=' + q(t.size || 0));
JS
)"
  else
    RESOLVED_TAG="$(grep -o '"tag"[[:space:]]*:[[:space:]]*"[^"]*"' "$MANIFEST_FILE" | head -n1 | cut -d'"' -f4)"
  fi
fi

if [ -z "$DOWNLOAD_URL" ]; then
  if [ "$RESOLVED_TAG" = "latest" ] || [ -z "$RESOLVED_TAG" ]; then
    DOWNLOAD_URL="https://github.com/$REPO/releases/latest/download/$ARCHIVE"
  else
    DOWNLOAD_URL="https://github.com/$REPO/releases/download/$RESOLVED_TAG/$ARCHIVE"
  fi
fi

step_ok "Resolved release" "${RESOLVED_TAG:-latest} ($ARCHIVE)"

# 4. Back up existing playlists & settings (zero-copy; songs untouched)
backup_existing_data

# 5. Download release archive with animated monochrome progress bar
ARCHIVE_PATH="$TMP_DIR/$ARCHIVE"
download_with_bar "$DOWNLOAD_URL" "$ARCHIVE_PATH" "Downloading Zuno" "$EXPECTED_SIZE"
DL_SIZE="$(du -h "$ARCHIVE_PATH" | awk '{print $1}')"
step_ok "Downloaded archive" "$DL_SIZE"

# 6. Verify SHA-256 checksum
if [ -z "$EXPECTED_SHA" ]; then
  SHA_URL="${DOWNLOAD_URL%/*}/SHA256SUMS.txt"
  if curl -fsSL --connect-timeout 10 -o "$TMP_DIR/SHA256SUMS.txt" "$SHA_URL" 2>/dev/null; then
    EXPECTED_SHA="$(awk -v f="$ARCHIVE" '$2 == f || $2 == "*"f {print $1}' "$TMP_DIR/SHA256SUMS.txt" | head -n1)"
  fi
fi

if [ -n "$EXPECTED_SHA" ]; then
  ACTUAL_SHA="$(compute_sha256 "$ARCHIVE_PATH")"
  if [ -n "$ACTUAL_SHA" ]; then
    if [ "$ACTUAL_SHA" != "$EXPECTED_SHA" ]; then
      step_fail "SHA-256 verification failed" "Expected $EXPECTED_SHA, got $ACTUAL_SHA"
    fi
    step_ok "Verified SHA-256 checksum" "${ACTUAL_SHA:0:12}…"
  fi
fi

# 7. Extract and install binaries atomically
EXTRACT_DIR="$TMP_DIR/extract"
mkdir -p "$EXTRACT_DIR"
run_spin "Extracting binaries" tar -xzf "$ARCHIVE_PATH" -C "$EXTRACT_DIR"

mkdir -p "$BIN_DIR" "$ZUNO_HOME/songs" "$ZUNO_HOME/playlists"

install_binary() {
  local src="$1"
  local name="$2"
  local dst="$BIN_DIR/$name"
  [ -f "$src" ] || return 0
  if [ -f "$dst" ]; then
    cp "$dst" "${dst}.old" 2>/dev/null || true
  fi
  install -m 755 "$src" "${dst}.new"
  mv -f "${dst}.new" "$dst"
  rm -f "${dst}.old" 2>/dev/null || true
}

install_binary "$EXTRACT_DIR/zuno" "zuno"
install_binary "$EXTRACT_DIR/zuno-mcp" "zuno-mcp"
step_ok "Installed binaries" "${BIN_DIR/#$HOME/~}/{zuno,zuno-mcp}"

# 8. OS-specific desktop integration
if [ "$OS" = "linux" ]; then
  APP_DIR="$DATA_DIR/applications"
  ICON_BASE="$DATA_DIR/icons/hicolor"
  mkdir -p "$APP_DIR" "$ICON_BASE/192x192/apps" "$ICON_BASE/512x512/apps"
  rm -f "$ICON_BASE/scalable/apps/zuno.svg" "$ICON_BASE/256x256/apps/zuno.png"
  [ -f "$EXTRACT_DIR/icons/zuno-192.png" ] && install -m 644 "$EXTRACT_DIR/icons/zuno-192.png" "$ICON_BASE/192x192/apps/zuno.png"
  [ -f "$EXTRACT_DIR/icons/zuno-512.png" ] && install -m 644 "$EXTRACT_DIR/icons/zuno-512.png" "$ICON_BASE/512x512/apps/zuno.png"

  cat > "$APP_DIR/zuno.desktop" <<EOF
[Desktop Entry]
Type=Application
Version=1.0
Name=Zuno
GenericName=Music Player
Comment=Ultra-lightweight, offline-first music player
Exec=$BIN_DIR/zuno
Icon=zuno
Terminal=false
Categories=AudioVideo;Audio;Player;Music;
Keywords=music;audio;player;offline;equalizer;playlist;
StartupNotify=true
StartupWMClass=zuno
EOF
  chmod 644 "$APP_DIR/zuno.desktop"
  command -v update-desktop-database >/dev/null 2>&1 && update-desktop-database "$APP_DIR" >/dev/null 2>&1 || true
  command -v gtk-update-icon-cache  >/dev/null 2>&1 && gtk-update-icon-cache -f -t "$ICON_BASE" >/dev/null 2>&1 || true
  step_ok "Created desktop launcher" "${APP_DIR/#$HOME/~}/zuno.desktop"
elif [ "$OS" = "macos" ]; then
  # Clear Gatekeeper quarantine flag on self-downloaded unsigned release binaries if present
  xattr -dr com.apple.quarantine "$BIN_DIR/zuno" "$BIN_DIR/zuno-mcp" >/dev/null 2>&1 || true
  APP_BUNDLE="$HOME/Applications/Zuno.app"
  mkdir -p "$APP_BUNDLE/Contents/MacOS" "$APP_BUNDLE/Contents/Resources"
  cat > "$APP_BUNDLE/Contents/MacOS/Zuno" <<EOF
#!/usr/bin/env bash
exec "$BIN_DIR/zuno" "\$@"
EOF
  chmod 755 "$APP_BUNDLE/Contents/MacOS/Zuno"
  cat > "$APP_BUNDLE/Contents/Info.plist" <<EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>CFBundleName</key><string>Zuno</string>
  <key>CFBundleDisplayName</key><string>Zuno</string>
  <key>CFBundleIdentifier</key><string>dev.zuno.player</string>
  <key>CFBundleVersion</key><string>${RESOLVED_TAG#v}</string>
  <key>CFBundleExecutable</key><string>Zuno</string>
  <key>CFBundlePackageType</key><string>APPL</string>
</dict>
</plist>
EOF
  step_ok "Created macOS app launcher" "~/Applications/Zuno.app"
fi

# 9. Summary Card
printf '\n'
printf '  %b────────────────────────────────────────────────────────%b\n' "$C_LINE" "$C_RESET"
printf '  %b ZUNO READY %b  %b%s%b\n\n' "$C_INV" "$C_RESET" "$C_WHITE" "${RESOLVED_TAG:-installed}" "$C_RESET"
printf '  %bApp binary%b     %b%s%b\n' "$C_MUTED" "$C_RESET" "$C_LIGHT" "${BIN_DIR/#$HOME/~}/zuno" "$C_RESET"
printf '  %bCLI binary%b     %b%s%b\n' "$C_MUTED" "$C_RESET" "$C_LIGHT" "${BIN_DIR/#$HOME/~}/zuno-mcp" "$C_RESET"
printf '  %bMusic folder%b   %b%s%b\n' "$C_MUTED" "$C_RESET" "$C_LIGHT" "${ZUNO_HOME/#$HOME/~}/songs" "$C_RESET"

case ":$PATH:" in
  *":$BIN_DIR:"*) ;;
  *)
    printf '\n  %bTip:%b Add %b%s%b to your PATH:\n' "$C_WHITE" "$C_RESET" "$C_LIGHT" "${BIN_DIR/#$HOME/~}" "$C_RESET"
    printf '       %bexport PATH="%s:$PATH"%b\n' "$C_MUTED" "$BIN_DIR" "$C_RESET"
    ;;
esac

printf '\n  %bRun%b %bzuno%b %bto launch, or open Zuno from your Applications menu.%b\n\n' \
  "$C_MUTED" "$C_RESET" "$C_WHITE" "$C_RESET" "$C_MUTED" "$C_RESET"
