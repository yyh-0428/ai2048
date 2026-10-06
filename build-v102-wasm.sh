#!/bin/sh
set -eu
DIR="$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)"
clang --target=wasm32 -O3 -fno-builtin -nostdlib \
  -Wl,--no-entry -Wl,--export-memory \
  -Wl,--initial-memory=8388608 -Wl,--max-memory=8388608 \
  -Wl,--export=v102_init -Wl,--export=v102_score_depth -Wl,--export=v102_score \
  -Wl,--export=v102_nodes -Wl,--export=v102_cache_hits \
  -o "$DIR/v102_ai.wasm" "$DIR/v102_ai.c"
echo "Built: $DIR/v102_ai.wasm"
