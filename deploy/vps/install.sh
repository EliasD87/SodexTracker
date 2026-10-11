#!/usr/bin/env bash
# SoDEX collector: one-time setup (and safe to re-run after an update).
# Run as the `collector` user from ~/sodex:   bash install.sh
#
# Installs Node into this user's home only (no root, no system packages), so
# nothing the trading bots use is touched. Installs the two services but does
# not start them; README.md says when to.
set -euo pipefail

NODE_VERSION="24.18.0"
APP="$(cd "$(dirname "$0")" && pwd)"
cd "$APP"

if [ "$(id -u)" -eq 0 ]; then
  echo "Run this as the collector user, not root (see README.md, step 3)." >&2
  exit 1
fi

# ── Node, checksum-verified, into ~/.local ─────────────────────────────────
case "$(uname -m)" in
  x86_64) NODE_ARCH="x64" ;;
  aarch64 | arm64) NODE_ARCH="arm64" ;;
  *) echo "Unsupported CPU: $(uname -m)" >&2; exit 1 ;;
esac
NODE_DIR="$HOME/.local/node-v$NODE_VERSION"
if [ ! -x "$NODE_DIR/bin/node" ]; then
  echo "Downloading Node $NODE_VERSION ($NODE_ARCH)..."
  TMP="$(mktemp -d)"
  FILE="node-v$NODE_VERSION-linux-$NODE_ARCH.tar.xz"
  curl -fsSL "https://nodejs.org/dist/v$NODE_VERSION/$FILE" -o "$TMP/$FILE"
  curl -fsSL "https://nodejs.org/dist/v$NODE_VERSION/SHASUMS256.txt" -o "$TMP/SHASUMS256.txt"
  (cd "$TMP" && grep " $FILE\$" SHASUMS256.txt | sha256sum -c -)
  mkdir -p "$NODE_DIR"
  tar -xJf "$TMP/$FILE" -C "$NODE_DIR" --strip-components=1
  rm -rf "$TMP"
fi
mkdir -p "$HOME/.local"
ln -sfn "$NODE_DIR" "$HOME/.local/node"
echo "Node: $("$HOME/.local/node/bin/node" --version)"

# ── Folders and settings ──────────────────────────────────────────────────
mkdir -p "$APP/collector/data" "$APP/logs"
if [ ! -f "$APP/.env" ]; then
  cp "$APP/env.example" "$APP/.env"
  chmod 600 "$APP/.env"
  # The database path, for this user's home.
  sed -i "s#^COLLECTOR_DB=.*#COLLECTOR_DB=$APP/collector/data/collector.db#" "$APP/.env"
  echo "Created .env (only you can read it)."
fi
# A private nickname scramble, set once and never changed.
if grep -q '^NICKNAME_MUL=$' "$APP/.env"; then
  MUL=$(( ($(od -An -N4 -tu4 /dev/urandom) % 262144) | 1 ))
  ADD=$(( $(od -An -N4 -tu4 /dev/urandom) % 262144 ))
  sed -i "s/^NICKNAME_MUL=$/NICKNAME_MUL=$MUL/; s/^NICKNAME_ADD=$/NICKNAME_ADD=$ADD/" "$APP/.env"
  echo "Set a private nickname scramble."
fi

# ── Services (installed, not started) ─────────────────────────────────────
mkdir -p "$HOME/.config/systemd/user"
cp "$APP/systemd/"*.service "$APP/systemd/"*.timer "$HOME/.config/systemd/user/"
export XDG_RUNTIME_DIR="${XDG_RUNTIME_DIR:-/run/user/$(id -u)}"
if systemctl --user daemon-reload 2>/dev/null; then
  echo "Services installed: sodex-collector, sodex-publisher (not started yet)."
  # Logs only ever grow; this keeps each to its last 10 MB, daily.
  systemctl --user enable --now sodex-logtrim.timer >/dev/null && echo "Daily log trim on (keeps the last 10 MB of each log)."
else
  echo "Could not reach your systemd user manager. As root, run: loginctl enable-linger $(whoami)" >&2
  echo "then log in again as $(whoami) and re-run: bash install.sh" >&2
  exit 1
fi

echo
echo "Done. Next: README.md step 5 (fill in .env), then step 6 (start the collector)."
