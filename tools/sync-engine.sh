#!/bin/sh
# Copy the engine in from the Soup Engine tree.
#
# These eleven files are not forked here. They are the camera's, and the
# entire value of this editor is that they are the same ones -- a
# preview that merely resembled the camera would be worse than no
# preview, because people would tune against it for an evening and then
# be surprised by the card.
#
# Run it after changing the engine, commit what moves, and let CI
# rebuild. Pass --check to compare without writing, which is what you
# want if you are wondering whether this copy has fallen behind.
set -eu
cd "$(dirname "$0")/.."
SRC=${SOUP_ENGINE:-../soup-dev}

[ -d "$SRC/engine" ] || {
  echo "no engine at $SRC/engine" >&2
  echo "point SOUP_ENGINE at your Soup Engine checkout" >&2
  exit 1
}

FILES="look.c look.h stock.c stock.h grade.c grade.h lut.c lut.h se.c se.h se_libc.h wb.c wb.h"

if [ "${1:-}" = "--check" ]; then
  n=0
  for f in $FILES; do
    if ! cmp -s "$SRC/engine/$f" "engine/$f"; then
      echo "  differs: $f"
      n=$((n + 1))
    fi
  done
  [ "$n" -eq 0 ] && { echo "engine matches $SRC"; exit 0; }
  echo "$n file(s) behind $SRC -- run $0 to update" >&2
  exit 1
fi

for f in $FILES; do cp "$SRC/engine/$f" "engine/$f"; done
echo "copied $(echo $FILES | wc -w | tr -d ' ') files from $SRC/engine"
git -C . status --short engine || true
