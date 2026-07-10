#!/usr/bin/env python3
"""
FUNDING FARMER - funding-rate harvester for SoDEX perps.  [PAPER MODE]

Strategy (SoDEX-native carry):
  * Perps pay funding between longs and shorts every interval. When a pair's
    funding rate is EXTREME, the crowded side is paying the other side to
    take the trade.
  * This bot scans ALL SoDEX perps, and shortly before each funding tick
    opens a small position AGAINST the crowded side on the pair with the
    largest |rate| above THRESHOLD, collects the (simulated) funding
    payment, then closes shortly after.
  * Low-octane by design: it earns the rate, not the move - but it is fully
    exposed to price during the holding window. HOLD_MIN keeps that short.

This bot runs LOCALLY and trades a SIMULATED balance against LIVE SoDEX
market data. It never asks for keys and cannot place real orders - server
-side deployment with real execution is planned for a later release.

Run:      python funding-farmer.py
Needs:    Python 3.10+, no third-party packages.
Output:   console log + trades appended to funding-farmer-trades.csv
"""

import csv
import json
import time
import urllib.request
from datetime import datetime, timezone

# ------------------------- config -------------------------
GW            = "https://mainnet-gw.sodex.dev/api/v1"
THRESHOLD     = 0.0003         # only farm |funding| >= 0.03% per interval
ENTER_BEFORE_S = 120           # open this many seconds before the funding tick
HOLD_MIN      = 3              # minutes to hold after the tick before closing
NOTIONAL_USD  = 1_000.0        # position size per farm
POLL_SEC      = 20
START_BALANCE = 10_000.0
TAKER_FEE     = 0.0006
CSV_FILE      = "funding-farmer-trades.csv"

# ---------------------- SoDEX client ----------------------
def api(path: str):
    req = urllib.request.Request(GW + path, headers={"User-Agent": "sodex-bot/1.0"})
    with urllib.request.urlopen(req, timeout=10) as r:
        j = json.load(r)
    if j.get("code") != 0:
        raise RuntimeError(f"SoDEX API error: {j.get('message')}")
    return j["data"]

def tickers():
    return api("/perps/markets/tickers")

# ------------------------- main ---------------------------
def log_row(row):
    new = False
    try:
        open(CSV_FILE).close()
    except FileNotFoundError:
        new = True
    with open(CSV_FILE, "a", newline="") as f:
        w = csv.writer(f)
        if new:
            w.writerow(["ts_utc", "symbol", "action", "side", "qty", "price",
                        "funding", "pnl", "balance"])
        w.writerow(row)

def main():
    balance = START_BALANCE
    pos = None   # dict(symbol, side, qty, entry, rate, close_at)

    print(f"FUNDING FARMER | all SoDEX perps | trigger |rate| >= {THRESHOLD*100:.3f}% | ${NOTIONAL_USD:.0f}/farm")
    print("Paper mode: simulated fills + simulated funding credit on live SoDEX data.\n")

    while True:
        try:
            now_ms = int(time.time() * 1000)
            ts = datetime.now(timezone.utc).isoformat(timespec="seconds")
            data = tickers()

            if pos is None:
                # rank candidates: extreme funding, tick close enough to enter
                best = None
                for t in data:
                    rate = float(t["fundingRate"])
                    until = t["nextFundingTime"] - now_ms
                    if abs(rate) >= THRESHOLD and 0 < until <= ENTER_BEFORE_S * 1000:
                        if best is None or abs(rate) > abs(float(best["fundingRate"])):
                            best = t
                if best is not None:
                    rate = float(best["fundingRate"])
                    px = float(best["markPrice"])
                    side = "SHORT" if rate > 0 else "LONG"   # against the paying crowd
                    qty = NOTIONAL_USD / px
                    balance -= NOTIONAL_USD * TAKER_FEE
                    pos = {
                        "symbol": best["symbol"], "side": side, "qty": qty,
                        "entry": px, "rate": rate,
                        "close_at": best["nextFundingTime"] + HOLD_MIN * 60_000,
                        "credited": False,
                    }
                    print(f"[{ts}] FARM {best['symbol']} {side} {qty:.6f} @ {px:.4f}  rate {rate*100:+.4f}%")
                    log_row([ts, best["symbol"], "OPEN", side, f"{qty:.6f}", f"{px:.4f}",
                             f"{rate*100:.4f}%", "", f"{balance:.2f}"])
                else:
                    nxt = min((t["nextFundingTime"] - now_ms for t in data), default=0) // 1000
                    print(f"[{ts}] scanning… no qualifying rate; next tick in ~{max(nxt,0)}s")
            else:
                t = next((x for x in data if x["symbol"] == pos["symbol"]), None)
                px = float(t["markPrice"]) if t else pos["entry"]

                # credit funding once the tick has passed (receiver side)
                if not pos["credited"] and t and t["nextFundingTime"] > pos["close_at"] - HOLD_MIN * 60_000:
                    credit = abs(pos["rate"]) * pos["qty"] * pos["entry"]
                    balance += credit
                    pos["credited"] = True
                    print(f"[{ts}] funding credited {credit:+.4f}")
                    log_row([ts, pos["symbol"], "FUNDING", pos["side"], "", "",
                             f"{pos['rate']*100:.4f}%", f"{credit:.4f}", f"{balance:.2f}"])

                if now_ms >= pos["close_at"]:
                    direction = 1 if pos["side"] == "LONG" else -1
                    pnl = (px - pos["entry"]) * direction * pos["qty"]
                    balance += pnl - pos["qty"] * px * TAKER_FEE
                    print(f"[{ts}] CLOSE {pos['symbol']} @ {px:.4f}  price pnl {pnl:+.2f}  balance {balance:,.2f}")
                    log_row([ts, pos["symbol"], "CLOSE", pos["side"], f"{pos['qty']:.6f}",
                             f"{px:.4f}", "", f"{pnl:.2f}", f"{balance:.2f}"])
                    pos = None
                else:
                    print(f"[{ts}] holding {pos['symbol']} until tick+{HOLD_MIN}m  px {px:.4f}")
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
