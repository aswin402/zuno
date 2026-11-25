#!/usr/bin/env bash
set -euo pipefail

# Zuno Lean Build & Cargo Storage Optimizer
# Prevents Cargo's `target/` directory from snowballing across builds and version bumps.

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
cd "$ROOT_DIR"

TARGET_DIR="${CARGO_TARGET_DIR:-target}"
MAX_TARGET_SIZE="${ZUNO_TARGET_MAXSIZE:-600MB}"

# Disable incremental compilation caches during script-driven builds
# (saves 100-400 MB of `target/*/incremental` cache per profile).
export CARGO_INCREMENTAL="${CARGO_INCREMENTAL:-0}"

print_size() {
  echo "==> Zuno Storage Breakdown"
  du -sh "$TARGET_DIR" node_modules dist 2>/dev/null || true
  if [ -d "$TARGET_DIR" ]; then
    echo "  Inside $TARGET_DIR/:"
    du -sh "$TARGET_DIR"/* 2>/dev/null | sed 's/^/    /' || true
  fi
  echo ""
  echo "==> Installed Binaries"
  ls -lh "${XDG_BIN_HOME:-$HOME/.local/bin}/zuno" "${XDG_BIN_HOME:-$HOME/.local/bin}/zuno-mcp" 2>/dev/null || echo "  (not installed yet)"
  echo ""
  echo "==> Global Cargo Cache (~/.cargo)"
  du -sh "$HOME/.cargo/registry" "$HOME/.cargo/git" 2>/dev/null || true
  echo ""
  echo "==> Disk Free Space"
  df -h "$ROOT_DIR" | awk 'NR==1 || NR==2'
}

stamp_before_build() {
  if [ "$TARGET_DIR" = "target" ] && command -v cargo-sweep >/dev/null 2>&1; then
    cargo sweep --stamp >/dev/null 2>&1 || true
  fi
}

sweep_after_stamp() {
  if [ "$TARGET_DIR" = "target" ] && [ -f "sweep.timestamp" ] && command -v cargo-sweep >/dev/null 2>&1; then
    cargo sweep --file >/dev/null 2>&1 || true
    rm -f sweep.timestamp
  fi
}

sweep_stale() {
  if [ ! -d "$TARGET_DIR" ]; then
    echo "==> No $TARGET_DIR/ directory to sweep."
    return 0
  fi

  local before after
  before="$(du -sh "$TARGET_DIR" 2>/dev/null | cut -f1)"
  echo "==> Sweeping stale Cargo artifacts ($TARGET_DIR/ before: $before)..."

  # Always remove incremental compilation blobs (biggest hidden bloat)
  rm -rf "$TARGET_DIR/debug/incremental" \
         "$TARGET_DIR/release/incremental" \
         "$TARGET_DIR/release-fast/incremental"

  if [ "${PRUNE_DEBUG:-0}" = "1" ]; then
    rm -rf "$TARGET_DIR/debug"
  fi

  if [ "$TARGET_DIR" = "target" ] && command -v cargo-sweep >/dev/null 2>&1; then
    cargo sweep --installed >/dev/null 2>&1 || true
    cargo sweep --maxsize "$MAX_TARGET_SIZE" >/dev/null 2>&1 || true
  else
    find "$TARGET_DIR" -maxdepth 3 -type f \( -name 'libzuno_*' -o -name 'zuno-*' \) -mmin +15 -delete 2>/dev/null || true
  fi

  rm -f sweep.timestamp
  after="$(du -sh "$TARGET_DIR" 2>/dev/null | cut -f1)"
  echo "==> Sweep complete ($TARGET_DIR/ after: $after)."
}

clean_target() {
  if [ -d "$TARGET_DIR" ]; then
    local before
    before="$(du -sh "$TARGET_DIR" 2>/dev/null | cut -f1)"
    echo "==> Removing $TARGET_DIR/ ($before) and dist/..."
    rm -rf "$TARGET_DIR" dist sweep.timestamp
    echo "==> Reclaimed $before! Installed binaries in ~/.local/bin/ remain untouched."
  else
    rm -rf dist sweep.timestamp
    echo "==> Already clean (no $TARGET_DIR/ directory)."
  fi
}

build_frontend() {
  echo "==> Building production Web UI (dist/)..."
  npm run build
}

build_release() {
  local offline_flag=()
  if [ "${ZUNO_OFFLINE:-0}" = "1" ]; then
    offline_flag=(--offline)
  fi

  build_frontend
  stamp_before_build
  echo "==> Building native Zuno & zuno-mcp (release, lto=thin, CARGO_INCREMENTAL=0)..."
  cargo build --release "${offline_flag[@]}" -p zuno -p zuno-mcp
  sweep_after_stamp

  rm -rf "$TARGET_DIR/release/incremental"
  echo "==> Release binaries ready:"
  ls -lh "$TARGET_DIR/release/zuno" "$TARGET_DIR/release/zuno-mcp"
  echo "==> Target size: $(du -sh "$TARGET_DIR" 2>/dev/null | cut -f1)"
}

build_fast() {
  local offline_flag=()
  if [ "${ZUNO_OFFLINE:-0}" = "1" ]; then
    offline_flag=(--offline)
  fi

  build_frontend
  stamp_before_build
  echo "==> Building fast local binaries (profile: release-fast, no LTO bloat)..."
  cargo build --profile release-fast "${offline_flag[@]}" -p zuno -p zuno-mcp
  sweep_after_stamp

  rm -rf "$TARGET_DIR/release-fast/incremental"
  ls -lh "$TARGET_DIR/release-fast/zuno" "$TARGET_DIR/release-fast/zuno-mcp"
  echo "==> Target size: $(du -sh "$TARGET_DIR" 2>/dev/null | cut -f1)"
}

run_tests() {
  local offline_flag=()
  if [ "${ZUNO_OFFLINE:-0}" = "1" ]; then
    offline_flag=(--offline)
  fi

  echo "==> Typechecking frontend (tsc --noEmit)..."
  npx tsc --noEmit
  stamp_before_build
  echo "==> Running Rust test suite (CARGO_INCREMENTAL=0, deps debug=0)..."
  cargo test "${offline_flag[@]}" -p zuno-core -p zuno-audio -p zuno-mcp
  sweep_after_stamp
  rm -rf "$TARGET_DIR/debug/incremental"
}

install_app() {
  local lean="${1:-0}"
  build_release
  echo "==> Installing into ~/.local/bin..."
  "$SCRIPT_DIR/install-linux.sh"

  if [ "$lean" = "1" ]; then
    echo "==> Lean install enabled — reclaiming $TARGET_DIR/ storage..."
    clean_target
  else
    PRUNE_DEBUG=1 sweep_stale
  fi
}

usage() {
  cat <<'EOF'
Usage: scripts/zuno-build.sh <command>

Commands:
  build          Build Web UI + release binaries and auto-sweep stale Cargo deps
  build-fast     Fast local build (no LTO) for rapid testing
  test           Run tsc typecheck + Rust unit tests (low-disk mode)
  install        Build, install ~/.local/bin/zuno & zuno-mcp, and prune debug/stale deps
  install-lean   Build, install, and delete target/ afterwards (~0 MB Cargo bloat!)
  sweep          Prune stale Cargo artifacts & incremental caches (caps at 600MB)
  clean          Delete target/ and dist/ completely (keeps installed app)
  size           Show storage breakdown for Zuno & Cargo

Environment options:
  ZUNO_OFFLINE=1        Pass --offline to Cargo
  ZUNO_TARGET_MAXSIZE   Max target/ size for sweep (default: 600MB)
  CARGO_TARGET_DIR      Redirect build cache (e.g. /tmp/zuno-target)
EOF
}

case "${1:-help}" in
  build)        build_release ;;
  build-fast)   build_fast ;;
  test)         run_tests ;;
  install)      install_app 0 ;;
  install-lean) install_app 1 ;;
  sweep)        sweep_stale ;;
  clean)        clean_target ;;
  size)         print_size ;;
  *)            usage ;;
esac
