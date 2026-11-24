#!/usr/bin/env bash
set -euo pipefail

# Zuno Linux user-space installer (zero sudo required)
# Installs:
#   ~/.local/bin/zuno-mcp                                — ~3.5 MB Rust engine + static UI + MCP server
#   ~/.local/bin/zuno                                    — desktop & CLI launcher
#   ~/.local/share/zuno/web/                             — built production frontend
#   ~/.local/share/icons/hicolor/{scalable,256x256,512x512}/apps/zuno.{svg,png}
#   ~/.local/share/applications/zuno.desktop             — Application Menu shortcut

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"

BIN_DIR="${XDG_BIN_HOME:-$HOME/.local/bin}"
DATA_DIR="${XDG_DATA_HOME:-$HOME/.local/share}"
STATE_DIR="${XDG_STATE_HOME:-$HOME/.local/state}/zuno"
WEB_DIR="$DATA_DIR/zuno/web"
APP_DIR="$DATA_DIR/applications"
ICON_BASE="$DATA_DIR/icons/hicolor"

cd "$ROOT_DIR"

echo "==> Checking build artifacts..."
if [ ! -f "target/release/zuno-mcp" ]; then
  echo "==> Building Rust release binary (zuno-mcp)..."
  cargo build --release -p zuno-mcp
fi

if [ ! -f "dist/index.html" ]; then
  echo "==> Building production Web UI (dist/)..."
  npm run build
fi

echo "==> Installing into $BIN_DIR and $DATA_DIR..."
mkdir -p "$BIN_DIR" "$WEB_DIR" "$APP_DIR" "$STATE_DIR" \
  "$ICON_BASE/scalable/apps" \
  "$ICON_BASE/256x256/apps" \
  "$ICON_BASE/512x512/apps" \
  "$HOME/zuno/songs" \
  "$HOME/zuno/playlists"

install -m 755 "target/release/zuno-mcp" "$BIN_DIR/zuno-mcp"

rm -rf "$WEB_DIR"
mkdir -p "$WEB_DIR"
cp -a dist/. "$WEB_DIR/"

install -m 644 "public/zuno-logo.svg" "$ICON_BASE/scalable/apps/zuno.svg"
if [ -f "public/icon-512.png" ]; then
  install -m 644 "public/icon-512.png" "$ICON_BASE/512x512/apps/zuno.png"
fi
if [ -f "public/icon-192.png" ]; then
  install -m 644 "public/icon-192.png" "$ICON_BASE/256x256/apps/zuno.png"
fi

cat > "$BIN_DIR/zuno" <<'EOF'
#!/usr/bin/env bash
set -euo pipefail

PORT="${ZUNO_PORT:-47620}"
HOST="${ZUNO_HOST:-127.0.0.1}"
URL="http://${HOST}:${PORT}"
DATA_DIR="${XDG_DATA_HOME:-$HOME/.local/share}"
STATE_DIR="${XDG_STATE_HOME:-$HOME/.local/state}/zuno"
WEB_DIR="$DATA_DIR/zuno/web"
PID_FILE="$STATE_DIR/server.pid"
LOG_FILE="$STATE_DIR/zuno.log"
BIN="$HOME/.local/bin/zuno-mcp"

mkdir -p "$STATE_DIR"

# Subcommands: `zuno stop` or CLI passthrough (`zuno doctor`, `zuno play`, etc.)
if [ "${1:-}" = "stop" ]; then
  if [ -f "$PID_FILE" ]; then
    PID="$(cat "$PID_FILE" 2>/dev/null || true)"
    if [ -n "$PID" ] && kill -0 "$PID" 2>/dev/null; then
      kill "$PID"
      rm -f "$PID_FILE"
      echo "Zuno server stopped (PID $PID)."
      exit 0
    fi
    rm -f "$PID_FILE"
  fi
  echo "Zuno server is not running."
  exit 0
elif [ $# -gt 0 ]; then
  exec "$BIN" "$@"
fi

# Start single-binary Zuno HTTP + Web UI + MCP server if not already listening
if ! curl -sf "$URL/health" >/dev/null 2>&1; then
  nohup "$BIN" mcp --http "${HOST}:${PORT}" --web-dir "$WEB_DIR" \
    >"$LOG_FILE" 2>&1 </dev/null &
  echo $! > "$PID_FILE"

  for _ in $(seq 1 30); do
    if curl -sf "$URL/health" >/dev/null 2>&1; then
      break
    fi
    sleep 0.1
  done
fi

# Launch in standalone app window if a Chromium-family browser is present, else default browser
for browser in google-chrome chromium chromium-browser brave-browser vivaldi-stable microsoft-edge; do
  if command -v "$browser" >/dev/null 2>&1; then
    nohup "$browser" --app="$URL" --class=zuno >/dev/null 2>&1 </dev/null &
    exit 0
  fi
done

if command -v xdg-open >/dev/null 2>&1; then
  nohup xdg-open "$URL" >/dev/null 2>&1 </dev/null &
else
  echo "Zuno is running at $URL"
fi
EOF
chmod 755 "$BIN_DIR/zuno"

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

if command -v update-desktop-database >/dev/null 2>&1; then
  update-desktop-database "$APP_DIR" >/dev/null 2>&1 || true
fi
if command -v gtk-update-icon-cache >/dev/null 2>&1; then
  gtk-update-icon-cache -f -t "$ICON_BASE" >/dev/null 2>&1 || true
fi

echo ""
echo "Zuno installed successfully!"
echo "  Launcher : $BIN_DIR/zuno"
echo "  Backend  : $BIN_DIR/zuno-mcp"
echo "  Web UI   : $WEB_DIR"
echo "  Desktop  : $APP_DIR/zuno.desktop"
echo "  Library  : $HOME/zuno/songs"
echo ""
echo "Run 'zuno' from your terminal or open 'Zuno' from your application menu."
