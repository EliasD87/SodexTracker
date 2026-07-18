#!/usr/bin/env python3
"""Build downloadable bot packages.

For each strategy in bots-src/strategies/:
  public/bots/<slug>.zip      <slug>/bot.py + core/ + .env.example + README.md
  public/bots/src/<slug>.py   the strategy source, served to the code viewer

.env.example and README.md are generated here from BOT_META so the six
packages never drift apart. Run from the repo root:  python scripts/build_bots.py
"""
from __future__ import annotations

import zipfile
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / "bots-src"
OUT = ROOT / "public" / "bots"

SHARED_ENV = """\
# ── market ────────────────────────────────────────────────────────────────
# SYMBOL can also be passed on the command line: python bot.py ETH-USD
SYMBOL={symbol}
INTERVAL={interval}
POLL_SEC={poll}

# ── account (paper) ───────────────────────────────────────────────────────
START_BALANCE=10000
LEVERAGE={leverage}
RISK_PCT={risk_pct}
TAKER_FEE=0.0006

# ── risk manager ──────────────────────────────────────────────────────────
# Kill switch: stop trading permanently past this peak-to-trough drawdown %.
MAX_DRAWDOWN_PCT=20
# Stand down for the rest of the UTC day after losing this % of the day's
# starting equity.
DAILY_LOSS_LIMIT_PCT=6
# After this many losing trades in a row, pause entries for COOLDOWN_MIN.
MAX_CONSEC_LOSSES=5
COOLDOWN_MIN=60
# Hard cap on any single position's notional (USD).
MAX_POSITION_NOTIONAL_USD=5000
# Absolute equity level that triggers the kill switch outright.
EQUITY_FLOOR_USD=5000

# ── infrastructure ────────────────────────────────────────────────────────
SODEX_GW_URL=https://mainnet-gw.sodex.dev/api/v1/perps
DATA_DIR=data
"""

BOT_META: dict[str, dict] = {
    "momo-cross": {
        "title": "Momo Cross", "symbol": "BTC-USD", "interval": "15m", "poll": 20,
        "leverage": 5, "risk_pct": "0.02",
        "blurb": "9/21 EMA crossover trend-follower. Stop-and-reverse: always in the market once warmed up.",
        "extra_env": "# ── strategy ──────────────────────────────────────────────────────────────\nEMA_FAST=9\nEMA_SLOW=21\n",
        "run": "python bot.py            # BTC-USD 15m\npython bot.py ETH-USD    # any SoDEX perp",
    },
    "rubber-band": {
        "title": "Rubber Band", "symbol": "SOL-USD", "interval": "5m", "poll": 15,
        "leverage": 3, "risk_pct": "0.02",
        "blurb": "Wilder RSI-14 mean reversion: long under 30, short over 70, exit at the midline.",
        "extra_env": "# ── strategy ──────────────────────────────────────────────────────────────\nRSI_N=14\nOVERSOLD=30\nOVERBOUGHT=70\nEXIT_MID=50\n",
        "run": "python bot.py            # SOL-USD 5m\npython bot.py XRP-USD",
    },
    "squeeze-rider": {
        "title": "Squeeze Rider", "symbol": "ETH-USD", "interval": "1h", "poll": 30,
        "leverage": 4, "risk_pct": "0.03",
        "blurb": "Bollinger-squeeze breakout: waits for band-width compression, trades the expansion.",
        "extra_env": "# ── strategy ──────────────────────────────────────────────────────────────\nBB_N=20\nBB_K=2.0\nSQUEEZE_LOOKBACK=60\nSQUEEZE_PCTL=0.25\n",
        "run": "python bot.py            # ETH-USD 1h\npython bot.py BTC-USD",
    },
    "grid-weaver": {
        "title": "Grid Weaver", "symbol": "XRP-USD", "interval": "1m", "poll": 10,
        "leverage": 1, "risk_pct": "0.025",
        "blurb": "Symmetric grid on the live mark price: buys each 0.4% rung down, sells it one rung up.",
        "extra_env": "# ── strategy ──────────────────────────────────────────────────────────────\nGRID_LEVELS=6\nGRID_STEP_PCT=0.004\nLOT_USD=250\n",
        "run": "python bot.py            # XRP-USD grid\npython bot.py DOGE-USD",
    },
    "funding-farmer": {
        "title": "Funding Farmer", "symbol": "BTC-USD", "interval": "1h", "poll": 20,
        "leverage": 1, "risk_pct": "0.1",
        "blurb": "Scans every SoDEX perp for extreme funding and farms the payment against the crowded side.",
        "extra_env": "# ── strategy ──────────────────────────────────────────────────────────────\nTHRESHOLD=0.0003\nENTER_BEFORE_S=120\nHOLD_MIN=3\nNOTIONAL_USD=1000\n",
        "run": "python bot.py            # scans all perps — no symbol argument",
    },
    "range-breaker": {
        "title": "Range Breaker", "symbol": "HYPE-USD", "interval": "30m", "poll": 25,
        "leverage": 4, "risk_pct": "0.02",
        "blurb": "Turtle-style Donchian-20 breakout with a trailing 2×ATR stop. Loses small, lets winners run.",
        "extra_env": "# ── strategy ──────────────────────────────────────────────────────────────\nDONCHIAN_N=20\nATR_N=14\nATR_MULT=2.0\n",
        "run": "python bot.py            # HYPE-USD 30m\npython bot.py SOL-USD",
    },
}

README = """\
# {title} — SoDEX paper trading bot

{blurb}

**Paper mode.** Simulated fills and a simulated balance against LIVE SoDEX
market data. It never asks for keys and physically cannot place real orders —
there is no signing code in this package.

## Quick start

```
# 1. Python 3.10+ is the only requirement — no pip installs.
python --version

# 2. (optional) copy the config and tune it
cp .env.example .env

# 3. run
{run}
```

Stop with Ctrl-C — state is saved atomically and the bot resumes exactly where
it stopped (open position included) on the next run.

## What's in the box

| File | Purpose |
| --- | --- |
| `bot.py` | The strategy. Read it — it's short and it is the whole edge. |
| `core/sodex_api.py` | REST client: retries + backoff, hard timeouts, kline ordering guaranteed oldest→newest with the forming candle dropped. |
| `core/broker.py` | Decimal-exact paper broker: margin, taker fees, exchange min-qty/step/notional enforcement, simulated liquidation. |
| `core/risk.py` | Risk manager: max-drawdown kill switch, daily loss limit, loss-streak cooldown, notional cap, equity floor. |
| `core/runner.py` | Main loop: config, resume-on-restart, graceful shutdown, status line. |
| `core/state.py` | Atomic `state.json`, append-only `trades.csv`, `equity.jsonl`. |
| `.env.example` | Every tunable parameter, documented. |

## Outputs (in `data/`)

* `…-trades.csv` — every fill: time, side, qty, price, fee, PnL, balance.
* `…-equity.jsonl` — one equity mark per poll, chartable.
* `…-state.json` — the resumable account state. Delete it to start fresh.
* `….log` — full run log.

## Risk manager defaults

| Limit | Default | Meaning |
| --- | --- | --- |
| `MAX_DRAWDOWN_PCT` | 20 | Kill switch on peak-to-trough equity drawdown. |
| `DAILY_LOSS_LIMIT_PCT` | 6 | Done for the UTC day after losing this much. |
| `MAX_CONSEC_LOSSES` / `COOLDOWN_MIN` | 5 / 60 | Losing streak → timed stand-down. |
| `MAX_POSITION_NOTIONAL_USD` | 5000 | Hard per-position cap. |
| `EQUITY_FLOOR_USD` | 5000 | Absolute floor → kill switch. |

Once the kill switch trips, the bot refuses new entries even across restarts
(the flag persists in `state.json`) — restarting a blown account must be a
deliberate act: delete `data/…-state.json`.

## Disclaimer

Simulated performance is not real performance. Fills happen at candle closes
or the mark price with taker fees and no slippage or queue modelling. This
package is educational; nothing in it is financial advice.
"""


def build_one(slug: str, meta: dict) -> None:
    strat = SRC / "strategies" / f"{slug}.py"
    core_files = sorted((SRC / "core").glob("*.py"))
    env_text = SHARED_ENV.format(**meta) + "\n" + meta["extra_env"]
    readme_text = README.format(**meta)

    OUT.mkdir(parents=True, exist_ok=True)
    (OUT / "src").mkdir(exist_ok=True)
    (OUT / "src" / f"{slug}.py").write_text(strat.read_text(encoding="utf-8"), encoding="utf-8")

    zpath = OUT / f"{slug}.zip"
    with zipfile.ZipFile(zpath, "w", zipfile.ZIP_DEFLATED) as z:
        z.writestr(f"{slug}/bot.py", strat.read_text(encoding="utf-8"))
        z.writestr(f"{slug}/.env.example", env_text)
        z.writestr(f"{slug}/README.md", readme_text)
        for f in core_files:
            z.writestr(f"{slug}/core/{f.name}", f.read_text(encoding="utf-8"))
    print(f"built {zpath.name}  ({zpath.stat().st_size:,} bytes)")


if __name__ == "__main__":
    for slug, meta in BOT_META.items():
        build_one(slug, meta)
    print("done.")
