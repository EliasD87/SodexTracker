#!/usr/bin/env python3
"""
MOMO CROSS - EMA trend-following bot for SoDEX perps.  [PAPER MODE]

Strategy (classic 9/21 EMA crossover):
  * LONG  when EMA(9) crosses above EMA(21) on a CLOSED candle
  * SHORT when EMA(9) crosses below EMA(21)
  * Always in the market (stop-and-reverse), sized by RISK_PCT of equity.

This bot runs LOCALLY and trades a SIMULATED balance against LIVE SoDEX
market data. It never asks for keys and cannot place real orders - server
-side deployment with real execution is planned for a later release
(see the LiveBroker stub at the bottom).

Run:      python momo-cross.py [SYMBOL]        e.g. python momo-cross.py ETH-USD
Needs:    Python 3.10+, no third-party packages.
Output:   console log + trades appended to momo-cross-trades.csv
"""

import csv
import json
import sys
import time
import urllib.request
from datetime import datetime, timezone

# ------------------------- config -------------------------
GW            = "https://mainnet-gw.sodex.dev/api/v1"
SYMBOL        = sys.argv[1].upper() if len(sys.argv) > 1 else "BTC-USD"
INTERVAL      = "15m"          # 1m 5m 15m 30m 1h 4h 1D
FAST, SLOW    = 9, 21
POLL_SEC      = 20
START_BALANCE = 10_000.0
RISK_PCT      = 0.02           # fraction of equity used as margin per trade
LEVERAGE      = 5
TAKER_FEE     = 0.0006
CSV_FILE      = "momo-cross-trades.csv"

# ---------------------- SoDEX client ----------------------
def api(path: str):
    req = urllib.request.Request(GW + path, headers={"User-Agent": "sodex-bot/1.0"})
    with urllib.request.urlopen(req, timeout=10) as r:
        j = json.load(r)
    if j.get("code") != 0:
        raise RuntimeError(f"SoDEX API error: {j.get('message')}")
    return j["data"]

def closes(symbol: str, interval: str, limit: int = 120) -> list[float]:
    data = api(f"/perps/markets/{symbol}/klines?interval={interval}&limit={limit}")
    return [float(k["c"]) for k in data], data[-1]["t"]

# ----------------------- indicators -----------------------
def ema(values: list[float], n: int) -> list[float]:
    k = 2 / (n + 1)
    out = [values[0]]
    for v in values[1:]:
        out.append(v * k + out[-1] * (1 - k))
    return out

# ---------------------- paper broker ----------------------
class PaperBroker:
    """Simulated fills at the current close, taker fee applied both ways."""

    def __init__(self, balance: float):
        self.balance = balance
        self.side = None          # "LONG" | "SHORT" | None
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
        notional = margin * LEVERAGE
        self.qty = notional / price
        self.entry = price
        self.side = side
        fee = notional * TAKER_FEE
        self.balance -= fee
        ts = datetime.now(timezone.utc).isoformat(timespec="seconds")
        print(f"[{ts}] OPEN {side} {self.qty:.6f} {SYMBOL} @ {price:.4f}  (fee {fee:.2f})")
        self._log([ts, SYMBOL, "OPEN", side, f"{self.qty:.6f}", f"{price:.4f}", "", f"{self.balance:.2f}"])

    def close(self, price: float):
        if not self.side:
            return
        direction = 1 if self.side == "LONG" else -1
        pnl = (price - self.entry) * direction * self.qty
        fee = self.qty * price * TAKER_FEE
        self.balance += pnl - fee
        ts = datetime.now(timezone.utc).isoformat(timespec="seconds")
        print(f"[{ts}] CLOSE {self.side} @ {price:.4f}  pnl {pnl:+.2f}  balance {self.balance:.2f}")
        self._log([ts, SYMBOL, "CLOSE", self.side, f"{self.qty:.6f}", f"{price:.4f}", f"{pnl:.2f}", f"{self.balance:.2f}"])
        self.side = None

# ------------------------- main ---------------------------
def main():
    print(f"MOMO CROSS | {SYMBOL} {INTERVAL} | EMA {FAST}/{SLOW} | paper ${START_BALANCE:,.0f}")
    print("Paper mode: simulated fills on live SoDEX data. No keys, no real orders.\n")
    broker = PaperBroker(START_BALANCE)
    last_bar = None

    while True:
        try:
            series, bar_t = closes(SYMBOL, INTERVAL)
            if last_bar is None:
                last_bar = bar_t
            elif bar_t != last_bar:
                last_bar = bar_t
                closed = series[:-1]          # evaluate on the just-closed candle
                f, s = ema(closed, FAST), ema(closed, SLOW)
                above_now, above_prev = f[-1] > s[-1], f[-2] > s[-2]
                price = closed[-1]
                if above_now and not above_prev and broker.side != "LONG":
                    broker.close(price)
                    broker.open("LONG", price)
                elif not above_now and above_prev and broker.side != "SHORT":
                    broker.close(price)
                    broker.open("SHORT", price)
                else:
                    pos = broker.side or "FLAT"
                    print(f"bar close {price:.4f}  ema{FAST} {f[-1]:.4f}  ema{SLOW} {s[-1]:.4f}  pos {pos}")
        except Exception as e:  # noqa: BLE001 - keep the loop alive on transient errors
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
