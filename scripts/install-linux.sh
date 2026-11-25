#!/usr/bin/env bash
set -euo pipefail

# Zuno Linux Native Desktop + CLI Installer (zero sudo required)
# Installs:
#   ~/.local/bin/zuno                                    — standalone native Tauri v2 single binary (WebKitGTK + Rust Rodio + 10-band Rust EQ + Tray)
#   ~/.local/bin/zuno-mcp                                — ~4.7 MB single-binary CLI, daemon, HTTP UI & MCP server
#   ~/.local/share/icons/hicolor/{scalable,256x256,512x512}/apps/zuno.{svg,png}
#   ~/.local/share/applications/zuno.desktop             — Application Menu shortcut

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"

BIN_DIR="${XDG_BIN_HOME:-$HOME/.local/bin}"
DATA_DIR="${XDG_DATA_HOME:-$HOME/.local/share}"
APP_DIR="$DATA_DIR/applications"
ICON_BASE="$DATA_DIR/icons/hicolor"

TARGET_DIR="${CARGO_TARGET_DIR:-target}"

cd "$ROOT_DIR"

echo "==> Checking build artifacts..."
if [ ! -f "dist/index.html" ]; then
  echo "==> Building production Web UI (dist/)..."
  npm run build
fi

if [ ! -f "$TARGET_DIR/release/zuno" ] || [ ! -f "$TARGET_DIR/release/zuno-mcp" ]; then
  echo "==> Building native Tauri v2 desktop & CLI/MCP binaries..."
  cargo build --release -p zuno -p zuno-mcp
fi

echo "==> Installing native Zuno into $BIN_DIR and $DATA_DIR..."
mkdir -p "$BIN_DIR" "$APP_DIR" \
  "$ICON_BASE/scalable/apps" \
  "$ICON_BASE/192x192/apps" \
  "$ICON_BASE/512x512/apps" \
  "${ZUNO_DIR:-$HOME/zuno}/songs" \
  "${ZUNO_DIR:-$HOME/zuno}/playlists"

install -m 755 "$TARGET_DIR/release/zuno" "$BIN_DIR/zuno"
install -m 755 "$TARGET_DIR/release/zuno-mcp" "$BIN_DIR/zuno-mcp"

# Clean up any legacy external web/ folder (frontend is now compiled straight into the binaries)
rm -rf "$DATA_DIR/zuno/web"

install -m 644 "public/zuno-logo.svg" "$ICON_BASE/scalable/apps/zuno.svg"
if [ -f "public/icon-512.png" ]; then
  install -m 644 "public/icon-512.png" "$ICON_BASE/512x512/apps/zuno.png"
fi
if [ -f "public/icon-192.png" ]; then
  install -m 644 "public/icon-192.png" "$ICON_BASE/192x192/apps/zuno.png"
fi

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

if command -v update-desktop-database >/dev/null 2>&1; then
  update-desktop-database "$APP_DIR" >/dev/null 2>&1 || true
fi
if command -v gtk-update-icon-cache >/dev/null 2>&1; then
  gtk-update-icon-cache -f -t "$ICON_BASE" >/dev/null 2>&1 || true
fi

echo ""
echo "Zuno native desktop app installed successfully!"
echo "  Native App    : $BIN_DIR/zuno ($(du -h "$BIN_DIR/zuno" | cut -f1))"
echo "  CLI / MCP     : $BIN_DIR/zuno-mcp ($(du -h "$BIN_DIR/zuno-mcp" | cut -f1))"
echo "  Desktop Entry : $APP_DIR/zuno.desktop"
echo "  Music Folder  : $HOME/zuno/songs"
echo ""
echo "Launch 'Zuno' from your application menu or run 'zuno' in your terminal."
