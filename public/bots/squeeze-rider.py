#!/usr/bin/env python3
"""
SQUEEZE RIDER - Bollinger-squeeze breakout bot for SoDEX perps.  [PAPER MODE]

Strategy (volatility contraction -> expansion):
  * Watch Bollinger Bands (20, 2.0). When band width falls into the tightest
    25% of its recent range, the market is "squeezed".
  * LONG on a closed candle breaking above the upper band during/after a
    squeeze; SHORT on a break below the lower band.
  * Exit on a close back across the middle band (SMA-20).

This bot runs LOCALLY and trades a SIMULATED balance against LIVE SoDEX
market data. It never asks for keys and cannot place real orders - server
-side deployment with real execution is planned for a later release.

Run:      python squeeze-rider.py [SYMBOL]      e.g. python squeeze-rider.py ETH-USD
Needs:    Python 3.10+, no third-party packages.
Output:   console log + trades appended to squeeze-rider-trades.csv
"""

import csv
import json
import math
import sys
import time
import urllib.request
from datetime import datetime, timezone

# ------------------------- config -------------------------
GW            = "https://mainnet-gw.sodex.dev/api/v1"
SYMBOL        = sys.argv[1].upper() if len(sys.argv) > 1 else "ETH-USD"
INTERVAL      = "1h"
BB_N          = 20
BB_K          = 2.0
SQUEEZE_LOOKBACK = 60          # bars used to judge "tightest 25%"
SQUEEZE_PCTL  = 0.25
POLL_SEC      = 30
START_BALANCE = 10_000.0
RISK_PCT      = 0.03
LEVERAGE      = 4
TAKER_FEE     = 0.0006
CSV_FILE      = "squeeze-rider-trades.csv"

# ---------------------- SoDEX client ----------------------
def api(path: str):
    req = urllib.request.Request(GW + path, headers={"User-Agent": "sodex-bot/1.0"})
    with urllib.request.urlopen(req, timeout=10) as r:
        j = json.load(r)
    if j.get("code") != 0:
        raise RuntimeError(f"SoDEX API error: {j.get('message')}")
    return j["data"]

def closes(symbol: str, interval: str, limit: int = 160):
    data = api(f"/perps/markets/{symbol}/klines?interval={interval}&limit={limit}")
    return [float(k["c"]) for k in data], data[-1]["t"]

# ----------------------- indicators -----------------------
def sma(vals, n):
    return sum(vals[-n:]) / n

def stdev(vals, n):
    m = sma(vals, n)
    return math.sqrt(sum((v - m) ** 2 for v in vals[-n:]) / n)

def band_width(vals, n=BB_N, k=BB_K):
    m = sma(vals, n)
    s = stdev(vals, n)
    return (2 * k * s) / m if m else 0.0

# ---------------------- paper broker ----------------------
class PaperBroker:
    def __init__(self, balance: float):
        self.balance = balance
        self.side = None
        self.qty = 0.0
        self.entry = 0.0

    def _log(self, row: list):
        new = False
        try:
            open(CSV_FILE).close()
        except FileNotFoundError:
            new = True
        with open(CSV_FILE, "a", newline="") as f:
            w = csv.writer(f)
            if new:
                w.writerow(["ts_utc", "symbol", "action", "side", "qty", "price", "pnl", "balance"])
            w.writerow(row)

    def open(self, side: str, price: float):
        margin = self.balance * RISK_PCT
        self.qty = margin * LEVERAGE / price
        self.entry, self.side = price, side
        self.balance -= self.qty * price * TAKER_FEE
        ts = datetime.now(timezone.utc).isoformat(timespec="seconds")
        print(f"[{ts}] OPEN {side} {self.qty:.6f} {SYMBOL} @ {price:.4f}")
        self._log([ts, SYMBOL, "OPEN", side, f"{self.qty:.6f}", f"{price:.4f}", "", f"{self.balance:.2f}"])

    def close(self, price: float):
        if not self.side:
            return
        direction = 1 if self.side == "LONG" else -1
        pnl = (price - self.entry) * direction * self.qty
        self.balance += pnl - self.qty * price * TAKER_FEE
        ts = datetime.now(timezone.utc).isoformat(timespec="seconds")
        print(f"[{ts}] CLOSE {self.side} @ {price:.4f}  pnl {pnl:+.2f}  balance {self.balance:.2f}")
        self._log([ts, SYMBOL, "CLOSE", self.side, f"{self.qty:.6f}", f"{price:.4f}", f"{pnl:.2f}", f"{self.balance:.2f}"])
        self.side = None

# ------------------------- main ---------------------------
def main():
    print(f"SQUEEZE RIDER | {SYMBOL} {INTERVAL} | BB({BB_N},{BB_K}) squeeze<{int(SQUEEZE_PCTL*100)}pctl | paper ${START_BALANCE:,.0f}")
    print("Paper mode: simulated fills on live SoDEX data. No keys, no real orders.\n")
    broker = PaperBroker(START_BALANCE)
    last_bar = None
    squeezed = False

    while True:
        try:
            series, bar_t = closes(SYMBOL, INTERVAL)
            if last_bar is None:
                last_bar = bar_t
            elif bar_t != last_bar:
                last_bar = bar_t
                closed = series[:-1]
                price = closed[-1]
                mid = sma(closed, BB_N)
                sd = stdev(closed, BB_N)
                upper, lower = mid + BB_K * sd, mid - BB_K * sd

                widths = sorted(
                    band_width(closed[: i + 1])
                    for i in range(len(closed) - SQUEEZE_LOOKBACK, len(closed))
                )
                threshold = widths[int(len(widths) * SQUEEZE_PCTL)]
                if band_width(closed) <= threshold:
                    squeezed = True

                # exits: close back through the mid-band
                if broker.side == "LONG" and price < mid:
                    broker.close(price)
                elif broker.side == "SHORT" and price > mid:
                    broker.close(price)

                # entries: breakout out of a squeeze
                if broker.side is None and squeezed:
                    if price > upper:
                        broker.open("LONG", price)
                        squeezed = False
                    elif price < lower:
                        broker.open("SHORT", price)
                        squeezed = False

                print(f"bar {price:.4f}  band [{lower:.4f} … {upper:.4f}]  squeeze={squeezed}  pos {broker.side or 'FLAT'}")
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
