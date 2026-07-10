#!/usr/bin/env python3
"""
RANGE BREAKER - Donchian breakout bot with ATR stops for SoDEX perps.  [PAPER MODE]

Strategy (turtle-style volatility breakout):
  * LONG when a candle CLOSES above the highest high of the last N bars;
    SHORT on a close below the lowest low.
  * Initial stop at 2x ATR(14) from entry, trailed in the trade's favour.
  * Exits only via the ATR stop - winners are left to run.
  Breakout systems lose small and often, then occasionally catch a monster
  trend. Expect a sub-50% win rate; the edge lives in the tail.

This bot runs LOCALLY and trades a SIMULATED balance against LIVE SoDEX
market data. It never asks for keys and cannot place real orders - server
-side deployment with real execution is planned for a later release.

Run:      python range-breaker.py [SYMBOL]      e.g. python range-breaker.py HYPE-USD
Needs:    Python 3.10+, no third-party packages.
Output:   console log + trades appended to range-breaker-trades.csv
"""

import csv
import json
import sys
import time
import urllib.request
from datetime import datetime, timezone

# ------------------------- config -------------------------
GW            = "https://mainnet-gw.sodex.dev/api/v1"
SYMBOL        = sys.argv[1].upper() if len(sys.argv) > 1 else "HYPE-USD"
INTERVAL      = "30m"
DONCHIAN_N    = 20
ATR_N         = 14
ATR_MULT      = 2.0
POLL_SEC      = 25
START_BALANCE = 10_000.0
RISK_PCT      = 0.02
LEVERAGE      = 4
TAKER_FEE     = 0.0006
CSV_FILE      = "range-breaker-trades.csv"

# ---------------------- SoDEX client ----------------------
def api(path: str):
    req = urllib.request.Request(GW + path, headers={"User-Agent": "sodex-bot/1.0"})
    with urllib.request.urlopen(req, timeout=10) as r:
        j = json.load(r)
    if j.get("code") != 0:
        raise RuntimeError(f"SoDEX API error: {j.get('message')}")
    return j["data"]

def bars(symbol: str, interval: str, limit: int = 120):
    data = api(f"/perps/markets/{symbol}/klines?interval={interval}&limit={limit}")
    out = [{"t": k["t"], "h": float(k["h"]), "l": float(k["l"]), "c": float(k["c"])} for k in data]
    return out, data[-1]["t"]

# ----------------------- indicators -----------------------
def atr(b, n=ATR_N) -> float:
    trs = []
    for i in range(1, len(b)):
        trs.append(max(
            b[i]["h"] - b[i]["l"],
            abs(b[i]["h"] - b[i - 1]["c"]),
            abs(b[i]["l"] - b[i - 1]["c"]),
        ))
    a = sum(trs[:n]) / n
    for tr in trs[n:]:
        a = (a * (n - 1) + tr) / n
    return a

# ---------------------- paper broker ----------------------
class PaperBroker:
    def __init__(self, balance: float):
        self.balance = balance
        self.side = None
        self.qty = 0.0
        self.entry = 0.0
        self.stop = 0.0

    def _log(self, row: list):
        new = False
        try:
            open(CSV_FILE).close()
        except FileNotFoundError:
            new = True
        with open(CSV_FILE, "a", newline="") as f:
            w = csv.writer(f)
            if new:
                w.writerow(["ts_utc", "symbol", "action", "side", "qty", "price", "stop", "pnl", "balance"])
            w.writerow(row)

    def open(self, side: str, price: float, stop: float):
        margin = self.balance * RISK_PCT
        self.qty = margin * LEVERAGE / price
        self.entry, self.side, self.stop = price, side, stop
        self.balance -= self.qty * price * TAKER_FEE
        ts = datetime.now(timezone.utc).isoformat(timespec="seconds")
        print(f"[{ts}] OPEN {side} {self.qty:.6f} {SYMBOL} @ {price:.4f}  stop {stop:.4f}")
        self._log([ts, SYMBOL, "OPEN", side, f"{self.qty:.6f}", f"{price:.4f}", f"{stop:.4f}", "", f"{self.balance:.2f}"])

    def close(self, price: float, reason: str):
        if not self.side:
            return
        direction = 1 if self.side == "LONG" else -1
        pnl = (price - self.entry) * direction * self.qty
        self.balance += pnl - self.qty * price * TAKER_FEE
        ts = datetime.now(timezone.utc).isoformat(timespec="seconds")
        print(f"[{ts}] CLOSE {self.side} @ {price:.4f} ({reason})  pnl {pnl:+.2f}  balance {self.balance:.2f}")
        self._log([ts, SYMBOL, "CLOSE", self.side, f"{self.qty:.6f}", f"{price:.4f}", "", f"{pnl:.2f}", f"{self.balance:.2f}"])
        self.side = None

# ------------------------- main ---------------------------
def main():
    print(f"RANGE BREAKER | {SYMBOL} {INTERVAL} | Donchian {DONCHIAN_N} | {ATR_MULT}x ATR{ATR_N} trail | paper ${START_BALANCE:,.0f}")
    print("Paper mode: simulated fills on live SoDEX data. No keys, no real orders.\n")
    broker = PaperBroker(START_BALANCE)
    last_bar = None

    while True:
        try:
            b, bar_t = bars(SYMBOL, INTERVAL)
            if last_bar is None:
                last_bar = bar_t
            elif bar_t != last_bar:
                last_bar = bar_t
                closed = b[:-1]
                price = closed[-1]["c"]
                a = atr(closed)
                hi = max(x["h"] for x in closed[-DONCHIAN_N - 1:-1])
                lo = min(x["l"] for x in closed[-DONCHIAN_N - 1:-1])

                if broker.side == "LONG":
                    broker.stop = max(broker.stop, price - ATR_MULT * a)   # trail up
                    if price <= broker.stop:
                        broker.close(price, "ATR stop")
                elif broker.side == "SHORT":
                    broker.stop = min(broker.stop, price + ATR_MULT * a)   # trail down
                    if price >= broker.stop:
                        broker.close(price, "ATR stop")

                if broker.side is None:
                    if price > hi:
                        broker.open("LONG", price, price - ATR_MULT * a)
                    elif price < lo:
                        broker.open("SHORT", price, price + ATR_MULT * a)

                stop_txt = f"{broker.stop:.4f}" if broker.side else "-"
                print(f"bar {price:.4f}  channel [{lo:.4f} … {hi:.4f}]  atr {a:.4f}  pos {broker.side or 'FLAT'}  stop {stop_txt}")
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
