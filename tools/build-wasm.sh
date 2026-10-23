#!/bin/sh
# Compile the engine to WebAssembly.
#
# The exported surface is deliberately tiny -- load a stock, apply it to
# a buffer, say which format version this build speaks. Everything that
# decides what a pixel becomes stays in C, in the same look.c the camera
# runs, because a preview that merely resembled the camera would be
# worse than no preview at all.
#
# Needs emscripten. CI installs it; locally, see the README.
set -eu

cd "$(dirname "$0")/.."
OUT=${1:-web}

emcc \
  -O3 \
  -std=c99 \
  -DSE_HOSTED \
  -Iengine \
  wasm/api.c \
  engine/look.c engine/stock.c engine/grade.c engine/lut.c \
  engine/se.c engine/wb.c \
  -o "$OUT/soup.js" \
  -s MODULARIZE=1 \
  -s EXPORT_ES6=1 \
  -s EXPORT_NAME=loadSoupEngine \
  -s ENVIRONMENT=web \
  -s ALLOW_MEMORY_GROWTH=1 \
  -s INITIAL_MEMORY=33554432 \
  -s FILESYSTEM=0 \
  -s EXPORTED_FUNCTIONS='["_se_api_load","_se_api_apply","_se_api_version","_se_api_stock_version","_se_api_eff_radius","_malloc","_free"]' \
  -s EXPORTED_RUNTIME_METHODS='["cwrap","HEAPU8","lengthBytesUTF8","stringToUTF8"]'

echo "built $OUT/soup.js and $OUT/soup.wasm"
ls -l "$OUT/soup.js" "$OUT/soup.wasm" | awk '{printf "  %-26s %8d bytes\n", $9, $5}'
