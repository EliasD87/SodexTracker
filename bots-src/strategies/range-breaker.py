#!/usr/bin/env python3
"""RANGE BREAKER — Donchian breakout with ATR trailing stop.  [PAPER MODE]

Turtle-style: LONG when a candle CLOSES above the highest high of the last
DONCHIAN_N bars (excluding itself); SHORT below the lowest low. The only exit
is a trailing ATR_MULT × ATR(ATR_N) stop, ratcheted in the trade's favour.
Expect a sub-50% win rate — the edge lives in the occasional monster trend,
which is why the risk manager's loss-streak cooldown matters here.

Run:    python bot.py [SYMBOL]          e.g. python bot.py HYPE-USD
Config: .env (copy .env.example).
Needs:  Python 3.10+, no third-party packages. Paper only — no keys, ever.
"""
from pathlib import Path

from core.config import g_dec, g_int
from core.indicators import atr
from core.runner import Runner


class Strategy:
    def __init__(self):
        self.n = g_int("DONCHIAN_N", 20, lo=5)
        self.atr_n = g_int("ATR_N", 14, lo=2)
        self.atr_mult = float(g_dec("ATR_MULT", "2.0", lo="0.5", hi="10"))
        self.stop = 0.0

    def warmup_bars(self) -> int:
        return max(self.n, self.atr_n) + 10

    def on_bar(self, candles, ctx) -> None:
        highs = [float(c.h) for c in candles]
        lows = [float(c.l) for c in candles]
        closes = [float(c.c) for c in candles]
        price = closes[-1]
        a = atr(highs, lows, closes, self.atr_n)
        hi = max(highs[-self.n - 1:-1])
        lo = min(lows[-self.n - 1:-1])

        if ctx.broker.side == "LONG":
            self.stop = max(self.stop, price - self.atr_mult * a)
            if price <= self.stop:
                ctx.exit(f"ATR trail stop {self.stop:.4f}")
        elif ctx.broker.side == "SHORT":
            self.stop = min(self.stop, price + self.atr_mult * a)
            if price >= self.stop:
                ctx.exit(f"ATR trail stop {self.stop:.4f}")

        if ctx.broker.side is None:
            if price > hi:
                if ctx.enter("LONG", f"Donchian-{self.n} break above {hi:.4f}"):
                    self.stop = price - self.atr_mult * a
            elif price < lo:
                if ctx.enter("SHORT", f"Donchian-{self.n} break below {lo:.4f}"):
                    self.stop = price + self.atr_mult * a
            else:
                ctx.log.info("channel [%.4f … %.4f]  atr %.4f", lo, hi, a)

    def snapshot(self) -> dict:
        return {"stop": self.stop}

    def restore(self, s: dict) -> None:
        self.stop = float(s.get("stop", 0.0))


if __name__ == "__main__":
    Runner(name="range-breaker", strategy=Strategy(), default_symbol="HYPE-USD",
           default_interval="30m", bot_dir=Path(__file__).resolve().parent,
           default_leverage=4, default_risk_pct="0.02", default_poll=25).run()
