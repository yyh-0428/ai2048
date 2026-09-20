#!/bin/sh
set -eu
# Requires clang/wasm-ld with wasm32 support.
DIR="$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)"
clang --target=wasm32 -O3 -fno-builtin -nostdlib -Wl,--no-entry -Wl,--export-memory \
  -Wl,--initial-memory=4194304 -Wl,--max-memory=4194304 \
  -o "$DIR/survival_v9_1.wasm" "$DIR/survival_v9_1.c"
echo "Built: $DIR/survival_v9_1.wasm"
