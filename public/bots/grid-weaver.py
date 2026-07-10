#!/usr/bin/env python3
"""
GRID WEAVER - symmetric grid bot for SoDEX perps.  [PAPER MODE]

Strategy (classic ranging-market grid):
  * On start, anchor a grid of GRID_LEVELS buy rungs below and sell rungs
    above the current mark price, spaced GRID_STEP_PCT apart.
  * Each time price crosses DOWN through an unfilled buy rung -> paper-buy
    one lot; when price crosses back UP through the rung one step above a
    filled lot -> paper-sell it, banking the step.
  * Grids monetise chop. In a strong one-way trend the grid accumulates
    inventory on the losing side - watch the inventory line the bot prints.

This bot runs LOCALLY and trades a SIMULATED balance against LIVE SoDEX
market data. It never asks for keys and cannot place real orders - server
-side deployment with real execution is planned for a later release.

Run:      python grid-weaver.py [SYMBOL]        e.g. python grid-weaver.py XRP-USD
Needs:    Python 3.10+, no third-party packages.
Output:   console log + fills appended to grid-weaver-trades.csv
"""

import csv
import json
import sys
import time
import urllib.request
from datetime import datetime, timezone

# ------------------------- config -------------------------
GW            = "https://mainnet-gw.sodex.dev/api/v1"
SYMBOL        = sys.argv[1].upper() if len(sys.argv) > 1 else "XRP-USD"
GRID_LEVELS   = 6              # rungs on EACH side of the anchor
GRID_STEP_PCT = 0.004          # 0.4% between rungs
LOT_USD       = 250.0          # notional per rung
POLL_SEC      = 10
START_BALANCE = 10_000.0
TAKER_FEE     = 0.0006
CSV_FILE      = "grid-weaver-trades.csv"

# ---------------------- SoDEX client ----------------------
def api(path: str):
    req = urllib.request.Request(GW + path, headers={"User-Agent": "sodex-bot/1.0"})
    with urllib.request.urlopen(req, timeout=10) as r:
        j = json.load(r)
    if j.get("code") != 0:
        raise RuntimeError(f"SoDEX API error: {j.get('message')}")
    return j["data"]

def mark_price(symbol: str) -> float:
    for t in api("/perps/markets/mark-prices"):
        if t["symbol"] == symbol:
            return float(t["markPrice"])
    raise RuntimeError(f"{symbol} not found in mark prices")

# ------------------------- main ---------------------------
def main():
    anchor = mark_price(SYMBOL)
    rungs = [anchor * (1 - GRID_STEP_PCT * i) for i in range(1, GRID_LEVELS + 1)]
    inventory: dict[float, float] = {}      # rung price -> qty held
    balance = START_BALANCE
    banked = 0.0
    prev = anchor

    print(f"GRID WEAVER | {SYMBOL} | {GRID_LEVELS}x2 rungs, step {GRID_STEP_PCT*100:.2f}%, lot ${LOT_USD:.0f} | anchor {anchor:.4f}")
    print("Paper mode: simulated fills on live SoDEX data. No keys, no real orders.\n")

    def log(action, price, qty, pnl, bal):
        new = False
        try:
            open(CSV_FILE).close()
        except FileNotFoundError:
            new = True
        with open(CSV_FILE, "a", newline="") as f:
            w = csv.writer(f)
            if new:
                w.writerow(["ts_utc", "symbol", "action", "qty", "price", "pnl", "balance"])
            w.writerow([datetime.now(timezone.utc).isoformat(timespec="seconds"),
                        SYMBOL, action, f"{qty:.6f}", f"{price:.4f}",
                        f"{pnl:.2f}" if pnl else "", f"{bal:.2f}"])

    while True:
        try:
            px = mark_price(SYMBOL)

            # buy rungs: price crossed down through an empty rung
            for rung in rungs:
                if rung not in inventory and prev > rung >= px:
                    qty = LOT_USD / rung
                    fee = LOT_USD * TAKER_FEE
                    balance -= fee
                    inventory[rung] = qty
                    print(f"BUY  rung {rung:.4f}  qty {qty:.4f}  inventory {len(inventory)}")
                    log("BUY", rung, qty, 0.0, balance)

            # sell one step above each filled rung
            for rung, qty in list(inventory.items()):
                target = rung * (1 + GRID_STEP_PCT)
                if prev < target <= px:
                    pnl = (target - rung) * qty
                    fee = qty * target * TAKER_FEE
                    balance += pnl - fee
                    banked += pnl - fee
                    del inventory[rung]
                    print(f"SELL rung {rung:.4f} -> {target:.4f}  pnl {pnl:+.2f}  banked {banked:+.2f}")
                    log("SELL", target, qty, pnl, balance)

            held = sum(q * px for q in inventory.values())
            print(f"px {px:.4f}  inventory {len(inventory)} lots (${held:,.0f})  banked {banked:+.2f}  balance {balance:,.2f}")
            prev = px
        except Exception as e:  # noqa: BLE001
            print("warn:", e)
        time.sleep(POLL_SEC)

# ------------------ future live execution ------------------
class LiveBroker:
    """Real order placement ships with the hosted/server release."""

    def __init__(self, *_a, **_k):
        raise NotImplementedError(
            "Live execution is not part of the local beta. "
            "This bot is paper-only by design - it never holds your keys."
        )

if __name__ == "__main__":
    main()
