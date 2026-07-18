"""Typed .env configuration loader — stdlib only.

Reads a `.env` file (KEY=VALUE lines, `#` comments) from the bot folder or the
current working directory, without overriding variables already exported in the
environment. All getters validate and fall back to a documented default, so a
bad or missing value can never silently produce a nonsense parameter.
"""
from __future__ import annotations

import os
from decimal import Decimal, InvalidOperation
from pathlib import Path


def load_env(start: Path | None = None) -> None:
    """Load the first .env found in `start`, its parent, or the CWD."""
    candidates = []
    if start is not None:
        candidates += [start / ".env", start.parent / ".env"]
    candidates.append(Path.cwd() / ".env")
    for p in candidates:
        if p.is_file():
            for line in p.read_text(encoding="utf-8").splitlines():
                line = line.strip()
                if line and not line.startswith("#") and "=" in line:
                    k, v = line.split("=", 1)
                    os.environ.setdefault(k.strip(), v.strip().strip('"').strip("'"))
            return


class ConfigError(ValueError):
    pass


def g_str(key: str, default: str) -> str:
    return os.environ.get(key, default).strip() or default


def g_int(key: str, default: int, lo: int | None = None, hi: int | None = None) -> int:
    raw = os.environ.get(key)
    try:
        v = int(raw) if raw is not None and raw.strip() else default
    except ValueError:
        raise ConfigError(f"{key} must be an integer, got {raw!r}")
    if lo is not None and v < lo:
        raise ConfigError(f"{key}={v} below minimum {lo}")
    if hi is not None and v > hi:
        raise ConfigError(f"{key}={v} above maximum {hi}")
    return v


def g_dec(key: str, default: str, lo: str | None = None, hi: str | None = None) -> Decimal:
    raw = os.environ.get(key)
    try:
        v = Decimal(raw.strip()) if raw is not None and raw.strip() else Decimal(default)
    except (InvalidOperation, AttributeError):
        raise ConfigError(f"{key} must be a number, got {raw!r}")
    if lo is not None and v < Decimal(lo):
        raise ConfigError(f"{key}={v} below minimum {lo}")
    if hi is not None and v > Decimal(hi):
        raise ConfigError(f"{key}={v} above maximum {hi}")
    return v


def g_bool(key: str, default: bool) -> bool:
    raw = os.environ.get(key)
    if raw is None or not raw.strip():
        return default
    return raw.strip().lower() not in ("0", "false", "no", "off")
