#!/usr/bin/env bash
# Keeps each log to its last 10 MB, once a day (sodex-logtrim.timer).
# Trimmed in place, so the running services keep appending to the same file.
set -euo pipefail
for f in "$HOME/sodex/logs/"*.log; do
  [ -f "$f" ] || continue
  if [ "$(stat -c %s "$f")" -gt 10485760 ]; then
    tail -c 10485760 "$f" > "$f.tmp" && cat "$f.tmp" > "$f" && rm -f "$f.tmp"
  fi
done
