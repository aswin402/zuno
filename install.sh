#!/usr/bin/env bash
# =============================================================================
#  Zuno Universal Single-Binary Installer (Linux & macOS)
#  Usage:
#    curl -fsSL https://raw.githubusercontent.com/aswin402/zuno/main/install.sh | bash
#    curl -fsSL https://raw.githubusercontent.com/aswin402/zuno/main/install.sh | bash -s -- --version v0.0.24
#    curl -fsSL https://raw.githubusercontent.com/aswin402/zuno/main/install.sh | bash -s -- --uninstall
# =============================================================================

# POSIX-safe guard in case someone runs `sh install.sh` or `curl ... | sh`
if [ -z "${BASH_VERSION:-}" ]; then
  if [ -n "${0:-}" ] && [ -f "$0" ] && command -v bash >/dev/null 2>&1; then
    exec bash "$0" "$@"
  fi
  printf 'Zuno installer requires bash. Run:\n  curl -fsSL https://raw.githubusercontent.com/aswin402/zuno/main/install.sh | bash\n' >&2
  exit 1
fi

set -euo pipefail
export LC_NUMERIC=C

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
      [ -n "$VERSION" ] || { printf 'Missing value for %s\n' "$1" >&2; exit 1; }
      shift 2
      ;;
    --dir|-d)
      BIN_DIR="${2:-}"
      [ -n "$BIN_DIR" ] || { printf 'Missing value for %s\n' "$1" >&2; exit 1; }
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
  -v, --version <tag>   Install a specific release tag (e.g. v0.0.24)
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

# ── Terminal, Theme, Color & UTF-8 Capability Detection ──
IS_TTY=0
if [ -t 1 ] && [ "${TERM:-}" != "dumb" ] && [ "$QUIET" -eq 0 ]; then
  IS_TTY=1
fi

USE_COLOR=0
if [ "$IS_TTY" -eq 1 ] && [ -z "${NO_COLOR:-}" ]; then
  USE_COLOR=1
fi

USE_UTF8=0
_loc="${LC_ALL:-${LC_CTYPE:-${LANG:-}}}"
case "$_loc" in
  *UTF-8*|*utf-8*|*UTF8*|*utf8*) USE_UTF8=1 ;;
  *)
    if command -v locale >/dev/null 2>&1 && [ "$(locale charmap 2>/dev/null || true)" = "UTF-8" ]; then
      USE_UTF8=1
    fi
    ;;
esac

# Terminal-adaptive monochrome ANSI codes (readable on both dark & light terminals)
if [ "$USE_COLOR" -eq 1 ]; then
  C_RESET='\033[0m'
  C_BOLD='\033[1m'
  C_DIM='\033[2m'
  C_INV='\033[7;1m'
  C_ERR='\033[1;31m'
else
  C_RESET=''
  C_BOLD=''
  C_DIM=''
  C_INV=''
  C_ERR=''
fi

if [ "$USE_UTF8" -eq 1 ]; then
  EQ_FRAMES=("▁▃▅▇" "▃▅▇█" "▅▇█▆" "▇█▆▄" "█▆▄▂" "▆▄▂▁" "▄▂▁▃" "▂▁▃▅")
  BANNER_FRAMES=(
    "▁ ▂ ▃ ▁" "▂ ▄ ▆ ▃" "▄ ▆ █ ▅" "▆ █ ▆ ▇" "█ ▅ ▄ █"
    "▅ ▃ ▆ ▆" "▃ ▅ █ ▄" "▂ ▆ ▅ ▃" "▃ ▅ ▇ ▄" "▂ ▅ █ ▄"
  )
  BAR_FILL_CH='█'
  BAR_EMPTY_CH='░'
  SYM_OK='✓'
  SYM_ERR='✕'
  SYM_DOT='·'
  SYM_ELLIP='…'
else
  EQ_FRAMES=("[=   ]" "[==  ]" "[=== ]" "[ ===]" "[  ==]" "[   =]" "[  ==]" "[ == ]")
  BANNER_FRAMES=(". o O ." "o O # o" "O # O o" "# O o ." "o O # O" ". o # o")
  BAR_FILL_CH='#'
  BAR_EMPTY_CH='-'
  SYM_OK='+'
  SYM_ERR='x'
  SYM_DOT='-'
  SYM_ELLIP='...'
fi

# Detect portable fractional sleep backend once at startup (handles GNU, BSD, BusyBox)
SLEEP_MODE="sleep"
if ! sleep 0.01 2>/dev/null; then
  if command -v perl >/dev/null 2>&1; then
    SLEEP_MODE="perl"
  elif command -v python3 >/dev/null 2>&1; then
    SLEEP_MODE="python3"
  else
    SLEEP_MODE="read"
  fi
fi

sleep_tick() {
  local sec="${1:-0.075}"
  case "$SLEEP_MODE" in
    sleep)   sleep "$sec" 2>/dev/null || true ;;
    perl)    perl -e "select(undef,undef,undef,$sec)" 2>/dev/null || true ;;
    python3) python3 -c "import time; time.sleep($sec)" 2>/dev/null || true ;;
    *)       read -r -t "$sec" <> <(:) 2>/dev/null || sleep 1 ;;
  esac
}

# Pure-bash UTF-8-safe character repetition (avoids GNU `tr` single-byte corruption)
repeat_char() {
  local ch="$1" n="$2" out="" i=0
  while [ "$i" -lt "$n" ]; do
    out="${out}${ch}"
    i=$((i + 1))
  done
  printf '%s' "$out"
}

# O(1) file size in bytes (never reads growing archives through `wc -c` each tick)
file_size_bytes() {
  local p="$1"
  [ -f "$p" ] || { printf '0'; return; }
  stat -c%s "$p" 2>/dev/null \
    || stat -f%z "$p" 2>/dev/null \
    || wc -c < "$p" 2>/dev/null | tr -d '[:space:]' \
    || printf '0'
}

# Pure-bash integer MB formatter (e.g. "12.4") — zero subprocess forks per frame
format_mb() {
  local b="${1:-0}"
  case "$b" in
    ''|*[!0-9]*) b=0 ;;
  esac
  local tenths=$(( (b * 10 + 524288) / 1048576 ))
  printf '%d.%d' "$((tenths / 10))" "$((tenths % 10))"
}

# Portable file installer with `cp + chmod` fallback for minimal distros
install_file() {
  local mode="$1" src="$2" dst="$3"
  if command -v install >/dev/null 2>&1; then
    install -m "$mode" "$src" "$dst"
  else
    cp "$src" "$dst"
    chmod "$mode" "$dst"
  fi
}

TMP_DIR=""
ACTIVE_PID=""
CURSOR_HIDDEN=0

hide_cursor() {
  if [ "$IS_TTY" -eq 1 ] && [ "$CURSOR_HIDDEN" -eq 0 ]; then
    printf '\033[?25l'
    CURSOR_HIDDEN=1
  fi
}

show_cursor() {
  if [ "$CURSOR_HIDDEN" -eq 1 ]; then
    printf '\033[?25h'
    CURSOR_HIDDEN=0
  fi
}

cleanup() {
  if [ -n "$ACTIVE_PID" ]; then
    kill "$ACTIVE_PID" >/dev/null 2>&1 || true
    wait "$ACTIVE_PID" 2>/dev/null || true
    ACTIVE_PID=""
  fi
  show_cursor
  if [ -n "$TMP_DIR" ] && [ -d "$TMP_DIR" ]; then
    rm -rf "$TMP_DIR"
  fi
}
trap cleanup EXIT INT TERM

print_banner() {
  [ "$QUIET" -eq 1 ] && return 0
  printf '\n'
  if [ "$IS_TTY" -eq 1 ]; then
    hide_cursor
    local f
    for f in "${BANNER_FRAMES[@]}"; do
      printf '\r  %b%s%b   %bZ U N O%b   %b%s  offline-first music player%b\033[K' \
        "$C_BOLD" "$f" "$C_RESET" "$C_BOLD" "$C_RESET" "$C_DIM" "$SYM_DOT" "$C_RESET"
      sleep_tick 0.065
    done
    printf '\r\033[2K'
    show_cursor
    if [ "$USE_UTF8" -eq 1 ]; then
      printf '  %b╭──────────────────────────────────────────────────────╮%b\n' "$C_DIM" "$C_RESET"
      printf '  %b│%b  %b▂ ▅ █ ▄%b   %bZ U N O%b                                   %b│%b\n' \
        "$C_DIM" "$C_RESET" "$C_BOLD" "$C_RESET" "$C_BOLD" "$C_RESET" "$C_DIM" "$C_RESET"
      printf '  %b│%b            %bultra-lightweight offline music player%b    %b│%b\n' \
        "$C_DIM" "$C_RESET" "$C_DIM" "$C_RESET" "$C_DIM" "$C_RESET"
      printf '  %b╰──────────────────────────────────────────────────────╯%b\n\n' "$C_DIM" "$C_RESET"
    else
      printf '  %b+------------------------------------------------------+%b\n' "$C_DIM" "$C_RESET"
      printf '  %b|%b  %b===%b   %bZ U N O%b                                       %b|%b\n' \
        "$C_DIM" "$C_RESET" "$C_BOLD" "$C_RESET" "$C_BOLD" "$C_RESET" "$C_DIM" "$C_RESET"
      printf '  %b|%b        %bultra-lightweight offline music player%b        %b|%b\n' \
        "$C_DIM" "$C_RESET" "$C_DIM" "$C_RESET" "$C_DIM" "$C_RESET"
      printf '  %b+------------------------------------------------------+%b\n\n' "$C_DIM" "$C_RESET"
    fi
  else
    printf '  ZUNO -- ultra-lightweight offline music player\n\n'
  fi
}

step_ok() {
  [ "$QUIET" -eq 1 ] && return 0
  printf '  %b%s%b  %s' "$C_BOLD" "$SYM_OK" "$C_RESET" "$1"
  if [ -n "${2:-}" ]; then
    printf '  %b%s%b' "$C_DIM" "$2" "$C_RESET"
  fi
  printf '\n'
}

step_note() {
  [ "$QUIET" -eq 1 ] && return 0
  printf '  %b%s  %s%b\n' "$C_DIM" "$SYM_DOT" "$1" "$C_RESET"
}

step_fail() {
  show_cursor
  printf '\n  %b%s  %s%b\n' "$C_ERR" "$SYM_ERR" "$1" "$C_RESET" >&2
  if [ -n "${2:-}" ]; then
    printf '     %b%s%b\n' "$C_DIM" "$2" "$C_RESET" >&2
  fi
  if [ -n "${3:-}" ]; then
    printf '     %b%s%b\n' "$C_DIM" "$3" "$C_RESET" >&2
  fi
  printf '\n' >&2
  exit 1
}

# Foreground-driven equalizer spinner (zero subshells, zero `[1]+ Terminated` spam)
run_spin_rc() {
  local label="$1"
  shift
  local err_log="$TMP_DIR/step.err"
  : > "$err_log"

  if [ "$IS_TTY" -eq 0 ]; then
    local rc=0
    "$@" >/dev/null 2>"$err_log" || rc=$?
    return "$rc"
  fi

  hide_cursor
  "$@" >"$TMP_DIR/step.out" 2>"$err_log" &
  ACTIVE_PID=$!

  local nframes=${#EQ_FRAMES[@]}
  local i=0
  while kill -0 "$ACTIVE_PID" 2>/dev/null; do
    printf '\r  %b%s%b  %s\033[K' "$C_BOLD" "${EQ_FRAMES[$i]}" "$C_RESET" "$label"
    i=$(( (i + 1) % nframes ))
    sleep_tick 0.075
  done

  local rc=0
  wait "$ACTIVE_PID" || rc=$?
  ACTIVE_PID=""
  printf '\r\033[2K'
  show_cursor
  return "$rc"
}

run_spin() {
  local label="$1"
  shift
  if ! run_spin_rc "$label" "$@"; then
    local detail
    detail="$(head -n 3 "$TMP_DIR/step.err" 2>/dev/null | tr '\n' ' ' | sed 's/[[:space:]]*$//' || true)"
    step_fail "$label failed" "$detail"
  fi
}

# Download archive with smooth live monochrome progress bar (zero `tr` / `awk` / `wc` bugs)
download_with_bar() {
  local url="$1"
  local dest="$2"
  local label="$3"
  local expected_size="${4:-0}"

  if [ "$IS_TTY" -eq 0 ]; then
    if ! curl -fsSL --retry 2 --connect-timeout 15 -H "User-Agent: Zuno-Installer" -o "$dest" "$url"; then
      step_fail "Download failed" "$url"
    fi
    return 0
  fi

  local err_log="$TMP_DIR/dl.err"
  : > "$err_log"
  hide_cursor
  curl -fsSL --retry 2 --connect-timeout 15 -H "User-Agent: Zuno-Installer" -o "$dest" "$url" 2>"$err_log" &
  ACTIVE_PID=$!

  local width=22
  local nframes=${#EQ_FRAMES[@]}
  local i=0
  local bounce=0
  local bdir=1
  local tot_mb=""
  if [ "$expected_size" -gt 0 ] 2>/dev/null; then
    tot_mb="$(format_mb "$expected_size")"
  fi

  while kill -0 "$ACTIVE_PID" 2>/dev/null; do
    local cur_bytes
    cur_bytes="$(file_size_bytes "$dest")"
    case "$cur_bytes" in
      ''|*[!0-9]*) cur_bytes=0 ;;
    esac
    local cur_mb
    cur_mb="$(format_mb "$cur_bytes")"

    if [ "$expected_size" -gt 0 ] 2>/dev/null; then
      local pct=$(( cur_bytes * 100 / expected_size ))
      [ "$pct" -gt 100 ] && pct=100
      local filled=$(( pct * width / 100 ))
      local empty=$(( width - filled ))
      local bar_fill bar_empty
      bar_fill="$(repeat_char "$BAR_FILL_CH" "$filled")"
      bar_empty="$(repeat_char "$BAR_EMPTY_CH" "$empty")"
      printf '\r  %b%s%b  %s  %b%s%b%b%s%b %b%3d%%%b %b(%s / %s MB)%b\033[K' \
        "$C_BOLD" "${EQ_FRAMES[$i]}" "$C_RESET" \
        "$label" \
        "$C_BOLD" "$bar_fill" "$C_RESET" \
        "$C_DIM" "$bar_empty" "$C_RESET" \
        "$C_BOLD" "$pct" "$C_RESET" \
        "$C_DIM" "$cur_mb" "$tot_mb" "$C_RESET"
    else
      # Indeterminate bouncing monochrome bar when archive size is unknown
      local seg=5
      local left="$bounce"
      local right=$(( width - seg - left ))
      local bar_l bar_m bar_r
      bar_l="$(repeat_char "$BAR_EMPTY_CH" "$left")"
      bar_m="$(repeat_char "$BAR_FILL_CH" "$seg")"
      bar_r="$(repeat_char "$BAR_EMPTY_CH" "$right")"
      printf '\r  %b%s%b  %s  %b%s%b%b%s%b%b%s%b %b%s MB%b\033[K' \
        "$C_BOLD" "${EQ_FRAMES[$i]}" "$C_RESET" \
        "$label" \
        "$C_DIM" "$bar_l" "$C_RESET" \
        "$C_BOLD" "$bar_m" "$C_RESET" \
        "$C_DIM" "$bar_r" "$C_RESET" \
        "$C_DIM" "$cur_mb" "$C_RESET"
      bounce=$((bounce + bdir))
      if [ "$bounce" -ge $((width - seg)) ]; then
        bounce=$((width - seg))
        bdir=-1
      elif [ "$bounce" -le 0 ]; then
        bounce=0
        bdir=1
      fi
    fi

    i=$(( (i + 1) % nframes ))
    sleep_tick 0.075
  done

  local rc=0
  wait "$ACTIVE_PID" || rc=$?
  ACTIVE_PID=""
  printf '\r\033[2K'
  show_cursor

  if [ "$rc" -ne 0 ]; then
    local detail
    detail="$(head -n 3 "$err_log" 2>/dev/null | tr '\n' ' ' | sed 's/[[:space:]]*$//' || true)"
    step_fail "Download failed" "${detail:-$url}"
  fi
}

# Fetch latest.json first, falling back to GitHub Releases REST API
fetch_release_metadata() {
  local manifest_file="$1"
  local api_file="$2"
  local status_file="$3"
  local manifest_url api_url http_code

  if [ "$VERSION" = "latest" ]; then
    manifest_url="https://github.com/$REPO/releases/latest/download/latest.json"
    api_url="https://api.github.com/repos/$REPO/releases/latest"
  else
    local tag="$VERSION"
    case "$tag" in
      v*) ;;
      *)  tag="v$tag" ;;
    esac
    manifest_url="https://github.com/$REPO/releases/download/$tag/latest.json"
    api_url="https://api.github.com/repos/$REPO/releases/tags/$tag"
  fi

  # 1. Try Zuno's lightweight latest.json manifest (fast, includes SHA-256 + byte sizes)
  http_code="$(curl -sSL --retry 2 --connect-timeout 10 --max-time 20 \
    -H "User-Agent: Zuno-Installer" \
    -w '%{http_code}' -o "$manifest_file" "$manifest_url" 2>/dev/null || printf '000')"
  if [ "$http_code" = "200" ] && [ -s "$manifest_file" ]; then
    printf 'manifest:200\n' > "$status_file"
    return 0
  fi
  rm -f "$manifest_file"

  # 2. Fallback to GitHub Releases REST API
  http_code="$(curl -sSL --retry 2 --connect-timeout 10 --max-time 20 \
    -H "Accept: application/vnd.github+json" \
    -H "User-Agent: Zuno-Installer" \
    -w '%{http_code}' -o "$api_file" "$api_url" 2>/dev/null || printf '000')"
  if [ "$http_code" = "200" ] && [ -s "$api_file" ]; then
    printf 'api:200\n' > "$status_file"
    return 0
  fi
  rm -f "$api_file"
  printf 'error:%s\n' "$http_code" > "$status_file"
  return 1
}

parse_manifest_json() {
  local file="$1" target="$2"
  if command -v python3 >/dev/null 2>&1; then
    python3 - "$file" "$target" <<'PY'
import json, shlex, sys
with open(sys.argv[1], 'r', encoding='utf-8') as f:
    data = json.load(f)
targets = data.get('targets') or {}
t = targets.get(sys.argv[2]) or {}
print('RESOLVED_TAG=' + shlex.quote(str(data.get('tag', ''))))
print('DOWNLOAD_URL=' + shlex.quote(str(t.get('url', ''))))
print('EXPECTED_SHA=' + shlex.quote(str(t.get('sha256', ''))))
print('EXPECTED_SIZE=' + shlex.quote(str(int(t.get('size', 0) or 0))))
print('AVAILABLE_TARGETS=' + shlex.quote(', '.join(sorted(targets.keys()))))
PY
  elif command -v node >/dev/null 2>&1; then
    node - "$file" "$target" <<'JS'
const fs = require('fs');
const d = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
const targets = d.targets || {};
const t = targets[process.argv[3]] || {};
const q = (s) => "'" + String(s ?? '').replace(/'/g, "'\\''") + "'";
console.log('RESOLVED_TAG=' + q(d.tag || ''));
console.log('DOWNLOAD_URL=' + q(t.url || ''));
console.log('EXPECTED_SHA=' + q(t.sha256 || ''));
console.log('EXPECTED_SIZE=' + q(Number(t.size || 0)));
console.log('AVAILABLE_TARGETS=' + q(Object.keys(targets).sort().join(', ')));
JS
  elif command -v jq >/dev/null 2>&1; then
    printf 'RESOLVED_TAG=%q\n' "$(jq -r '.tag // ""' "$file")"
    printf 'DOWNLOAD_URL=%q\n' "$(jq -r --arg t "$target" '.targets[$t].url // ""' "$file")"
    printf 'EXPECTED_SHA=%q\n' "$(jq -r --arg t "$target" '.targets[$t].sha256 // ""' "$file")"
    printf 'EXPECTED_SIZE=%q\n' "$(jq -r --arg t "$target" '.targets[$t].size // 0' "$file")"
    printf 'AVAILABLE_TARGETS=%q\n' "$(jq -r '(.targets // {} | keys | sort | join(", "))' "$file")"
  else
    local tag url
    tag="$(grep -o '"tag"[[:space:]]*:[[:space:]]*"[^"]*"' "$file" | head -n1 | cut -d'"' -f4 || true)"
    url="$(grep -o "\"https://[^\"]*zuno-${target}\\.tar\\.gz\"" "$file" | head -n1 | tr -d '"' || true)"
    printf 'RESOLVED_TAG=%q\n' "$tag"
    printf 'DOWNLOAD_URL=%q\n' "$url"
    printf 'EXPECTED_SHA=\n'
    printf 'EXPECTED_SIZE=0\n'
    printf 'AVAILABLE_TARGETS=\n'
  fi
}

parse_github_api_json() {
  local file="$1" archive="$2"
  if command -v python3 >/dev/null 2>&1; then
    python3 - "$file" "$archive" <<'PY'
import json, shlex, sys
with open(sys.argv[1], 'r', encoding='utf-8') as f:
    data = json.load(f)
assets = data.get('assets') or []
match = next((a for a in assets if a.get('name') == sys.argv[2]), None)
avail = [
    a['name'][len('zuno-'):].replace('.tar.gz', '').replace('.zip', '')
    for a in assets
    if isinstance(a.get('name'), str) and a['name'].startswith('zuno-') and (a['name'].endswith('.tar.gz') or a['name'].endswith('.zip'))
]
print('RESOLVED_TAG=' + shlex.quote(str(data.get('tag_name', ''))))
print('DOWNLOAD_URL=' + shlex.quote(str(match.get('browser_download_url', '') if match else '')))
print('EXPECTED_SHA=\'\'')
print('EXPECTED_SIZE=' + shlex.quote(str(int(match.get('size', 0) or 0) if match else 0)))
print('AVAILABLE_TARGETS=' + shlex.quote(', '.join(sorted(avail))))
PY
  elif command -v node >/dev/null 2>&1; then
    node - "$file" "$archive" <<'JS'
const fs = require('fs');
const d = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
const assets = d.assets || [];
const match = assets.find((a) => a.name === process.argv[3]);
const avail = assets
  .map((a) => a.name || '')
  .filter((n) => n.startsWith('zuno-') && (n.endsWith('.tar.gz') || n.endsWith('.zip')))
  .map((n) => n.slice(5).replace(/\.tar\.gz$|\.zip$/, ''))
  .sort();
const q = (s) => "'" + String(s ?? '').replace(/'/g, "'\\''") + "'";
console.log('RESOLVED_TAG=' + q(d.tag_name || ''));
console.log('DOWNLOAD_URL=' + q(match ? match.browser_download_url : ''));
console.log("EXPECTED_SHA=''");
console.log('EXPECTED_SIZE=' + q(match ? Number(match.size || 0) : 0));
console.log('AVAILABLE_TARGETS=' + q(avail.join(', ')));
JS
  elif command -v jq >/dev/null 2>&1; then
    printf 'RESOLVED_TAG=%q\n' "$(jq -r '.tag_name // ""' "$file")"
    printf 'DOWNLOAD_URL=%q\n' "$(jq -r --arg a "$archive" '(.assets[]? | select(.name == $a) | .browser_download_url) // ""' "$file")"
    printf 'EXPECTED_SHA=\n'
    printf 'EXPECTED_SIZE=%q\n' "$(jq -r --arg a "$archive" '(.assets[]? | select(.name == $a) | .size) // 0' "$file")"
    printf 'AVAILABLE_TARGETS=%q\n' "$(jq -r '[.assets[]?.name | select(startswith("zuno-") and (endswith(".tar.gz") or endswith(".zip"))) | sub("^zuno-";"") | sub("\\.(tar\\.gz|zip)$";"")] | sort | join(", ")' "$file")"
  else
    local tag url
    tag="$(grep -o '"tag_name"[[:space:]]*:[[:space:]]*"[^"]*"' "$file" | head -n1 | cut -d'"' -f4 || true)"
    url="$(grep -o "\"https://[^\"]*/${archive}\"" "$file" | head -n1 | tr -d '"' || true)"
    printf 'RESOLVED_TAG=%q\n' "$tag"
    printf 'DOWNLOAD_URL=%q\n' "$url"
    printf 'EXPECTED_SHA=\n'
    printf 'EXPECTED_SIZE=0\n'
    printf 'AVAILABLE_TARGETS=\n'
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
  for f in sources.json state.json index.json radio.json settings.json; do
    if [ -f "$ZUNO_HOME/.zuno/$f" ]; then
      has_data=1
    fi
  done

  [ "$has_data" -eq 0 ] && return 0

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
  for f in sources.json state.json index.json radio.json settings.json; do
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

# 3. Resolve release metadata & checksum (latest.json -> GitHub Releases API fallback)
MANIFEST_FILE="$TMP_DIR/latest.json"
API_FILE="$TMP_DIR/release-api.json"
STATUS_FILE="$TMP_DIR/release.status"
DOWNLOAD_URL=""
EXPECTED_SHA=""
EXPECTED_SIZE=0
RESOLVED_TAG=""
AVAILABLE_TARGETS=""

SPIN_LABEL="Checking latest GitHub release"
if [ "$VERSION" != "latest" ]; then
  case "$VERSION" in
    v*) SPIN_LABEL="Checking GitHub release $VERSION" ;;
    *)  SPIN_LABEL="Checking GitHub release v$VERSION" ;;
  esac
fi

if ! run_spin_rc "$SPIN_LABEL" fetch_release_metadata "$MANIFEST_FILE" "$API_FILE" "$STATUS_FILE"; then
  status_val="$(cat "$STATUS_FILE" 2>/dev/null || echo 'error:000')"
  http_code="${status_val#error:}"
  case "$http_code" in
    404)
      step_fail "Could not fetch new version (no published GitHub release found)" \
        "Check https://github.com/$REPO/releases or wait for the release workflow to finish."
      ;;
    403|429)
      step_fail "Could not fetch new version (GitHub rate limit reached, HTTP $http_code)" \
        "Wait a minute and retry, or pass --version <tag> explicitly."
      ;;
    000)
      step_fail "Could not fetch new version (unable to reach github.com)" \
        "Check your internet connection / DNS and try again."
      ;;
    *)
      step_fail "Could not fetch new version (HTTP $http_code)" \
        "Check https://github.com/$REPO/releases and retry."
      ;;
  esac
fi

status_val="$(cat "$STATUS_FILE" 2>/dev/null || echo '')"
case "$status_val" in
  manifest:200)
    eval "$(parse_manifest_json "$MANIFEST_FILE" "$TARGET")"
    ;;
  api:200)
    eval "$(parse_github_api_json "$API_FILE" "$ARCHIVE")"
    ;;
esac

if [ -z "$DOWNLOAD_URL" ]; then
  if [ -n "$AVAILABLE_TARGETS" ]; then
    step_fail "Release ${RESOLVED_TAG:-$VERSION} has no prebuilt binary for $TARGET" \
      "Available targets: $AVAILABLE_TARGETS" \
      "You can build locally from source: git clone https://github.com/$REPO && cd zuno && ./scripts/install-linux.sh"
  else
    step_fail "Could not locate download archive ($ARCHIVE) in release ${RESOLVED_TAG:-$VERSION}" \
      "Check https://github.com/$REPO/releases for available downloads."
  fi
fi

step_ok "Resolved release" "${RESOLVED_TAG:-$VERSION} ($ARCHIVE)"

# 4. Back up existing playlists & settings (zero-copy; songs untouched)
backup_existing_data

# 5. Download release archive with animated monochrome progress bar
ARCHIVE_PATH="$TMP_DIR/$ARCHIVE"
download_with_bar "$DOWNLOAD_URL" "$ARCHIVE_PATH" "Downloading Zuno" "$EXPECTED_SIZE"
DL_SIZE="$(format_mb "$(file_size_bytes "$ARCHIVE_PATH")") MB"
step_ok "Downloaded archive" "$DL_SIZE"

# 6. Verify SHA-256 checksum
if [ -z "$EXPECTED_SHA" ]; then
  SHA_URL="${DOWNLOAD_URL%/*}/SHA256SUMS.txt"
  if curl -fsSL --connect-timeout 10 -H "User-Agent: Zuno-Installer" -o "$TMP_DIR/SHA256SUMS.txt" "$SHA_URL" 2>/dev/null; then
    EXPECTED_SHA="$(awk -v f="$ARCHIVE" '$2 == f || $2 == "*"f {print $1}' "$TMP_DIR/SHA256SUMS.txt" | head -n1)"
  fi
fi

if [ -n "$EXPECTED_SHA" ]; then
  ACTUAL_SHA="$(compute_sha256 "$ARCHIVE_PATH")"
  if [ -n "$ACTUAL_SHA" ]; then
    if [ "$ACTUAL_SHA" != "$EXPECTED_SHA" ]; then
      step_fail "SHA-256 verification failed" "Expected $EXPECTED_SHA, got $ACTUAL_SHA"
    fi
    step_ok "Verified SHA-256 checksum" "${ACTUAL_SHA:0:12}${SYM_ELLIP}"
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
  install_file 755 "$src" "${dst}.new"
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
  [ -f "$EXTRACT_DIR/icons/zuno-192.png" ] && install_file 644 "$EXTRACT_DIR/icons/zuno-192.png" "$ICON_BASE/192x192/apps/zuno.png"
  [ -f "$EXTRACT_DIR/icons/zuno-512.png" ] && install_file 644 "$EXTRACT_DIR/icons/zuno-512.png" "$ICON_BASE/512x512/apps/zuno.png"

  cat > "$APP_DIR/zuno.desktop" <<EOF
[Desktop Entry]
Type=Application
Version=1.0
Name=Zuno
GenericName=Music Player
Comment=Ultra-lightweight, offline-first music player
Exec="$BIN_DIR/zuno"
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
  xattr -dr com.apple.quarantine "$BIN_DIR/zuno" "$BIN_DIR/zuno-mcp" >/dev/null 2>&1 || true
  APP_BUNDLE="$HOME/Applications/Zuno.app"
  mkdir -p "$APP_BUNDLE/Contents/MacOS" "$APP_BUNDLE/Contents/Resources"
  ICON_PLIST=""
  if [ -f "$EXTRACT_DIR/icons/zuno.icns" ]; then
    install_file 644 "$EXTRACT_DIR/icons/zuno.icns" "$APP_BUNDLE/Contents/Resources/AppIcon.icns"
    ICON_PLIST="  <key>CFBundleIconFile</key><string>AppIcon</string>"
  fi
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
${ICON_PLIST}
</dict>
</plist>
EOF
  step_ok "Created macOS app launcher" "~/Applications/Zuno.app"
fi

# 9. Summary Card
if [ "$QUIET" -eq 0 ]; then
  printf '\n'
  if [ "$USE_UTF8" -eq 1 ]; then
    printf '  %b────────────────────────────────────────────────────────%b\n' "$C_DIM" "$C_RESET"
  else
    printf '  %b--------------------------------------------------------%b\n' "$C_DIM" "$C_RESET"
  fi
  printf '  %b ZUNO READY %b  %b%s%b\n\n' "$C_INV" "$C_RESET" "$C_BOLD" "${RESOLVED_TAG:-installed}" "$C_RESET"
  printf '  %bApp binary%b     %s\n' "$C_DIM" "$C_RESET" "${BIN_DIR/#$HOME/~}/zuno"
  printf '  %bCLI binary%b     %s\n' "$C_DIM" "$C_RESET" "${BIN_DIR/#$HOME/~}/zuno-mcp"
  printf '  %bMusic folder%b   %s\n' "$C_DIM" "$C_RESET" "${ZUNO_HOME/#$HOME/~}/songs"

  case ":$PATH:" in
    *":$BIN_DIR:"*) ;;
    *)
      printf '\n  %bTip:%b Add %b%s%b to your PATH:\n' "$C_BOLD" "$C_RESET" "$C_BOLD" "${BIN_DIR/#$HOME/~}" "$C_RESET"
      printf '       %bexport PATH="%s:$PATH"%b\n' "$C_DIM" "$BIN_DIR" "$C_RESET"
      ;;
  esac

  printf '\n  %bRun%b %bzuno%b %bto launch, or open Zuno from your Applications menu.%b\n\n' \
    "$C_DIM" "$C_RESET" "$C_BOLD" "$C_RESET" "$C_DIM" "$C_RESET"
fi
