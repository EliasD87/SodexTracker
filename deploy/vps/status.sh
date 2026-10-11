#!/usr/bin/env bash
# Quick health check: services, recent log lines, and the collector's own report.
# Run as the collector user from anywhere:   bash ~/sodex/status.sh
APP="$(cd "$(dirname "$0")" && pwd)"
export XDG_RUNTIME_DIR="${XDG_RUNTIME_DIR:-/run/user/$(id -u)}"
echo "── Services ──"
systemctl --user --no-pager --lines=0 status sodex-collector sodex-publisher 2>/dev/null | grep -E "●|Active:|Memory:|CPU:" || echo "(not installed or not running)"
for f in collector publisher; do
  echo; echo "── Last lines of logs/$f.log ──"
  tail -n 5 "$APP/logs/$f.log" 2>/dev/null || echo "(no log yet)"
done
echo; echo "── Collector report ──"
cd "$APP" && set -a && . ./.env && set +a && "$HOME/.local/node/bin/node" collector/src/report.mjs 2>/dev/null | grep -v ExperimentalWarning
echo; echo "── Disk ──"
du -sh "$APP/collector/data" "$APP/logs" 2>/dev/null
