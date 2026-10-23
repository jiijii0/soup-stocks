#!/bin/sh
# Check the editor without a wasm toolchain.
#
# Two things, both of which have been broken before and neither of which
# shows up anywhere but the card:
#
#   1. the bridge, in C -- that a look applied in place comes out right.
#      It does because the look emits row k only once row k+radius has
#      arrived, so output always lags input and a written row is never
#      read again.
#
#   2. the file, in JS -- that opening a stock and saving it does not
#      quietly rewrite the parts the editor has no control for.
set -eu
cd "$(dirname "$0")/.."
CC=${CC:-cc}

# Honour SDKROOT if it is set. Some macOS installs ship a default SDK
# whose .tbd stubs clang cannot link against; pointing at a known-good
# one is the fix, and on Linux none of this applies.
SDK=""
[ -n "${SDKROOT:-}" ] && SDK="-isysroot $SDKROOT"

# shellcheck disable=SC2086
$CC $SDK -std=c99 -O2 -Wall -Wextra -DSE_HOSTED -Iengine \
    -o /tmp/soup-apitest tools/apitest.c wasm/api.c \
    engine/look.c engine/stock.c engine/grade.c engine/lut.c \
    engine/se.c engine/wb.c -lm
/tmp/soup-apitest

if command -v node >/dev/null 2>&1; then
    node tools/roundtrip.mjs
else
    echo "  (node not found -- skipping the .fs round-trip check)"
fi
