#!/usr/bin/env python3
"""
RUBBER BAND - RSI mean-reversion bot for SoDEX perps.  [PAPER MODE]

Strategy (Wilder RSI-14 snap-back):
  * LONG  when RSI(14) < 30 on a closed candle, exit when RSI > 50
  * SHORT when RSI(14) > 70, exit when RSI < 50
  * One position at a time, sized by RISK_PCT of equity.
  Mean reversion works best on choppy, range-bound pairs - stretch it too
  far in a strong trend and the band snaps YOU.

This bot runs LOCALLY and trades a SIMULATED balance against LIVE SoDEX
market data. It never asks for keys and cannot place real orders - server
-side deployment with real execution is planned for a later release.

Run:      python rubber-band.py [SYMBOL]        e.g. python rubber-band.py SOL-USD
Needs:    Python 3.10+, no third-party packages.
Output:   console log + trades appended to rubber-band-trades.csv
"""

import csv
import json
import sys
import time
import urllib.request
from datetime import datetime, timezone

# ------------------------- config -------------------------
GW            = "https://mainnet-gw.sodex.dev/api/v1"
SYMBOL        = sys.argv[1].upper() if len(sys.argv) > 1 else "SOL-USD"
INTERVAL      = "5m"
RSI_N         = 14
OVERSOLD      = 30.0
OVERBOUGHT    = 70.0
EXIT_MID      = 50.0
POLL_SEC      = 15
START_BALANCE = 10_000.0
RISK_PCT      = 0.02
LEVERAGE      = 3
TAKER_FEE     = 0.0006
CSV_FILE      = "rubber-band-trades.csv"

# ---------------------- SoDEX client ----------------------
def api(path: str):
    req = urllib.request.Request(GW + path, headers={"User-Agent": "sodex-bot/1.0"})
    with urllib.request.urlopen(req, timeout=10) as r:
        j = json.load(r)
    if j.get("code") != 0:
        raise RuntimeError(f"SoDEX API error: {j.get('message')}")
    return j["data"]

def closes(symbol: str, interval: str, limit: int = 120):
    data = api(f"/perps/markets/{symbol}/klines?interval={interval}&limit={limit}")
    return [float(k["c"]) for k in data], data[-1]["t"]

# ----------------------- indicators -----------------------
def rsi(values: list[float], n: int = 14) -> float:
    """Wilder-smoothed RSI of the last value."""
    gains, losses = 0.0, 0.0
    for i in range(1, n + 1):
        d = values[i] - values[i - 1]
        gains += max(d, 0)
        losses += max(-d, 0)
    avg_g, avg_l = gains / n, losses / n
    for i in range(n + 1, len(values)):
        d = values[i] - values[i - 1]
        avg_g = (avg_g * (n - 1) + max(d, 0)) / n
        avg_l = (avg_l * (n - 1) + max(-d, 0)) / n
    if avg_l == 0:
        return 100.0
    rs = avg_g / avg_l
    return 100 - 100 / (1 + rs)

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
        fee = self.qty * price * TAKER_FEE
        self.balance -= fee
        ts = datetime.now(timezone.utc).isoformat(timespec="seconds")
        print(f"[{ts}] OPEN {side} {self.qty:.6f} {SYMBOL} @ {price:.4f}")
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
    print(f"RUBBER BAND | {SYMBOL} {INTERVAL} | RSI{RSI_N} {OVERSOLD:.0f}/{OVERBOUGHT:.0f} exit {EXIT_MID:.0f} | paper ${START_BALANCE:,.0f}")
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
                closed = series[:-1]
                r = rsi(closed, RSI_N)
                price = closed[-1]
                if broker.side == "LONG" and r >= EXIT_MID:
                    broker.close(price)
                elif broker.side == "SHORT" and r <= EXIT_MID:
                    broker.close(price)
                if broker.side is None:
                    if r < OVERSOLD:
                        broker.open("LONG", price)
                    elif r > OVERBOUGHT:
                        broker.open("SHORT", price)
                print(f"bar close {price:.4f}  rsi {r:5.1f}  pos {broker.side or 'FLAT'}")
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
