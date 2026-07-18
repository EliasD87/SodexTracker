#!/usr/bin/env python3
"""FUNDING FARMER — funding-rate harvester across ALL SoDEX perps.  [PAPER MODE]

Perps pay funding between longs and shorts every hour. When a pair's rate is
extreme, the crowded side is paying the other side. This bot scans every SoDEX
perp, and shortly before a funding tick opens NOTIONAL_USD against the crowded
side on the pair with the largest |rate| ≥ THRESHOLD, credits the (simulated)
payment at the tick, then closes HOLD_MIN minutes later. It earns the rate,
not the move — but it IS price-exposed during the hold, so position PnL is
marked honestly and the shared risk manager gates every farm.

This bot runs its own loop (it isn't single-symbol kline-driven), but reuses
the same hardened core: retrying API client, Decimal broker with per-symbol
exchange minimums, risk manager, atomic state, CSV/JSONL ledgers.

Run:    python bot.py
Config: .env (copy .env.example).
Needs:  Python 3.10+, no third-party packages. Paper only — no keys, ever.
"""
from __future__ import annotations

import signal
import time
from decimal import Decimal
from pathlib import Path

from core.broker import OrderRejected, PaperBroker
from core.config import g_dec, g_int, g_str, load_env
from core.risk import RiskManager
from core.runner import make_logger
from core.sodex_api import SodexAPI, SodexAPIError
from core.state import StateStore

BOT_DIR = Path(__file__).resolve().parent
load_env(BOT_DIR)

THRESHOLD      = g_dec("THRESHOLD", "0.0003", lo="0", hi="0.05")     # per-interval rate
ENTER_BEFORE_S = g_int("ENTER_BEFORE_S", 120, lo=10, hi=1800)
HOLD_MIN       = g_int("HOLD_MIN", 3, lo=1, hi=55)
NOTIONAL_USD   = g_dec("NOTIONAL_USD", "1000", lo="20")
POLL_SEC       = g_int("POLL_SEC", 20, lo=5, hi=300)
START_BALANCE  = g_dec("START_BALANCE", "10000", lo="100")
TAKER_FEE      = g_dec("TAKER_FEE", "0.0006", lo="0", hi="0.01")


def main() -> None:
    data_dir = BOT_DIR / g_str("DATA_DIR", "data")
    log = make_logger("funding-farmer", data_dir)
    api = SodexAPI(g_str("SODEX_GW_URL", "https://mainnet-gw.sodex.dev/api/v1/perps"), log=log)
    store = StateStore(data_dir, "funding-farmer")

    # one broker, meta swapped per farmed symbol (leverage 1 = fully margined)
    broker = PaperBroker(START_BALANCE, 1, TAKER_FEE, api.meta("BTC-USD"))
    risk = RiskManager(
        start_equity=START_BALANCE,
        max_drawdown_pct=g_dec("MAX_DRAWDOWN_PCT", "10", lo="1", hi="95"),
        daily_loss_limit_pct=g_dec("DAILY_LOSS_LIMIT_PCT", "3", lo="0.5", hi="95"),
        max_consec_losses=g_int("MAX_CONSEC_LOSSES", 4, lo=1),
        cooldown_min=g_int("COOLDOWN_MIN", 120, lo=1),
        max_position_notional=g_dec("MAX_POSITION_NOTIONAL_USD", "2000", lo="10"),
        equity_floor=g_dec("EQUITY_FLOOR_USD", "8000", lo="0"),
        log=log,
    )
    farm: dict | None = None  # symbol, rate, close_at_ms, credited

    saved = store.load()
    if saved:
        try:
            broker.restore(saved["broker"])
            risk.restore(saved["risk"])
            farm = saved.get("farm")
            log.info("resumed: balance %s, farm %s", broker.balance, farm["symbol"] if farm else "none")
        except (KeyError, ValueError) as e:
            log.warning("state.json unreadable (%s) — starting fresh", e)

    def persist() -> None:
        store.save({"broker": broker.snapshot(), "risk": risk.snapshot(), "farm": farm})

    stop = {"v": False}
    def on_sig(_s, _f):
        stop["v"] = True
        log.info("shutdown requested — persisting state…")
    signal.signal(signal.SIGINT, on_sig)
    signal.signal(signal.SIGTERM, on_sig)

    log.info("FUNDING FARMER | all SoDEX perps | |rate| >= %s%% | $%s/farm | PAPER MODE",
             THRESHOLD * 100, NOTIONAL_USD)

    while not stop["v"]:
        try:
            now_ms = int(time.time() * 1000)
            tickers = api.tickers()
            by_symbol = {t["symbol"]: t for t in tickers}

            if farm is None:
                best = None
                for t in tickers:
                    try:
                        rate = Decimal(str(t["fundingRate"]))
                        until = int(t["nextFundingTime"]) - now_ms
                    except (KeyError, ValueError):
                        continue
                    if abs(rate) >= THRESHOLD and 0 < until <= ENTER_BEFORE_S * 1000:
                        if best is None or abs(rate) > abs(Decimal(str(best["fundingRate"]))):
                            best = t
                if best is not None:
                    rate = Decimal(str(best["fundingRate"]))
                    px = Decimal(str(best["markPrice"]))
                    side = "SHORT" if rate > 0 else "LONG"  # against the paying crowd
                    equity = broker.equity(px)
                    ok, why = risk.allow_entry(equity, NOTIONAL_USD)
                    if not ok:
                        log.info("farm blocked — %s", why)
                    else:
                        try:
                            broker.meta = api.meta(best["symbol"])
                            fill = broker.open(side, px, NOTIONAL_USD,
                                               f"farm rate {rate * 100:+.4f}%")
                            store.log_trade(best["symbol"], fill)
                            farm = {"symbol": best["symbol"], "rate": str(rate),
                                    "close_at": int(best["nextFundingTime"]) + HOLD_MIN * 60_000,
                                    "credited": False}
                            persist()
                            log.info("FARM %s %s %s @ %s  rate %+.4f%%",
                                     best["symbol"], side, fill["qty"], px, rate * 100)
                        except (OrderRejected, SodexAPIError) as e:
                            log.warning("farm rejected: %s", e)
                else:
                    nxt = min((int(t.get("nextFundingTime", 0)) - now_ms for t in tickers
                               if t.get("nextFundingTime")), default=0) // 1000
                    log.info("scanning… no qualifying rate; next tick in ~%ds  equity %.2f",
                             max(nxt, 0), broker.balance)
            else:
                t = by_symbol.get(farm["symbol"])
                px = Decimal(str(t["markPrice"])) if t else broker.entry
                risk.on_mark(broker.equity(px))

                # credit funding once the tick has passed (we positioned to receive)
                if not farm["credited"] and t and int(t["nextFundingTime"]) > farm["close_at"] - HOLD_MIN * 60_000:
                    credit = abs(Decimal(farm["rate"])) * broker.qty * broker.entry
                    broker.balance += credit
                    farm["credited"] = True
                    persist()
                    log.info("funding credited %+.4f", credit)

                if broker.liquidated(px):
                    log.error("LIQUIDATED at %s", px)
                    fill = broker.close(px, "liquidation")
                    if fill:
                        store.log_trade(farm["symbol"], fill)
                        risk.on_close(Decimal(fill["pnl"]))
                    farm = None
                    persist()
                elif now_ms >= farm["close_at"]:
                    fill = broker.close(px, "hold window over")
                    if fill:
                        store.log_trade(farm["symbol"], fill)
                        risk.on_close(Decimal(fill["pnl"]))
                        log.info("CLOSE %s @ %s  pnl %s  balance %s",
                                 farm["symbol"], px, fill["pnl"], fill["balance"])
                    farm = None
                    persist()
                else:
                    log.info("holding %s until tick+%dm  px %s  uPnL %.4f",
                             farm["symbol"], HOLD_MIN, px, broker.unrealized(px))
            store.log_equity(broker.entry if farm else Decimal("0"), broker.balance)
        except SodexAPIError as e:
            log.warning("API: %s", e)
        except Exception as e:  # noqa: BLE001
            log.exception("unexpected error: %s", e)
        for _ in range(POLL_SEC):
            if stop["v"]:
                break
            time.sleep(1)
    persist()
    log.info("stopped cleanly. balance %s. state saved — rerun to resume.", broker.balance)


if __name__ == "__main__":
    main()
