# Zuno — Storage-Friendly Build & Dev Commands (`just --list`)

set shell := ["bash", "-euo", "pipefail", "-c"]

# Default: list all available commands
default:
    @just --list --unsorted

# Show storage breakdown of target/, node_modules/, ~/.cargo, and free disk space
size:
    @./scripts/zuno-build.sh size

# Run Vite frontend dev server
dev:
    npm run dev

# Typecheck frontend + run Rust unit tests (low-disk mode, no incremental bloat)
test:
    ./scripts/zuno-build.sh test

# Offline typecheck + Rust unit tests
test-offline:
    ZUNO_OFFLINE=1 ./scripts/zuno-build.sh test

# Build production Web UI + native release binaries & auto-sweep stale Cargo deps
build:
    ./scripts/zuno-build.sh build

# Fast local build without LTO bitcode bloat (quick iteration)
build-fast:
    ./scripts/zuno-build.sh build-fast

# Build + install native app (~/.local/bin/zuno & zuno-mcp) + prune debug/stale deps
install:
    ./scripts/zuno-build.sh install

# Zero-bloat install: build + install native app, then wipe target/ (~1.5-2 GB saved!)
install-lean:
    ./scripts/zuno-build.sh install-lean

# Build & install using /tmp/zuno-target so workspace target/ stays at 0 bytes
install-tmp:
    CARGO_TARGET_DIR=/tmp/zuno-target ./scripts/zuno-build.sh install-lean
    rm -rf /tmp/zuno-target

# Prune stale Cargo build artifacts & incremental caches while keeping latest cache
sweep:
    ./scripts/zuno-build.sh sweep

# Reclaim all target/ and dist/ space (installed ~/.local/bin/zuno keeps working)
clean:
    ./scripts/zuno-build.sh clean

# Maximum cleanup: remove target/, dist/, and node_modules/
clean-all:
    ./scripts/zuno-build.sh clean
    rm -rf node_modules
    @echo "==> Removed node_modules/ (run 'npm install' before next frontend build)."
