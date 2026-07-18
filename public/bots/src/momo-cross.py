#!/usr/bin/env python3
"""MOMO CROSS — 9/21 EMA trend-follower for SoDEX perps.  [PAPER MODE]

LONG when EMA(FAST) crosses above EMA(SLOW) on a CLOSED candle; SHORT on the
opposite cross. Stop-and-reverse: always in the market once warmed up, sized
by RISK_PCT of balance × LEVERAGE, gated by the shared risk manager (drawdown
kill switch, daily loss limit, loss-streak cooldown, notional cap).

Run:    python bot.py [SYMBOL]          e.g. python bot.py ETH-USD
Config: .env (copy .env.example) — every parameter is overridable.
Needs:  Python 3.10+, no third-party packages. Paper only — no keys, ever.
"""
from pathlib import Path

from core.config import g_int
from core.indicators import ema
from core.runner import Runner


class Strategy:
    def __init__(self):
        self.fast = g_int("EMA_FAST", 9, lo=2)
        self.slow = g_int("EMA_SLOW", 21, lo=3)
        if self.fast >= self.slow:
            raise SystemExit(f"EMA_FAST ({self.fast}) must be < EMA_SLOW ({self.slow})")

    def warmup_bars(self) -> int:
        return self.slow + 5

    def on_bar(self, candles, ctx) -> None:
        closes = [float(c.c) for c in candles]
        f, s = ema(closes, self.fast), ema(closes, self.slow)
        above, above_prev = f[-1] > s[-1], f[-2] > s[-2]
        if above and not above_prev and ctx.broker.side != "LONG":
            ctx.exit("reverse")
            ctx.enter("LONG", f"EMA{self.fast} crossed above EMA{self.slow}")
        elif not above and above_prev and ctx.broker.side != "SHORT":
            ctx.exit("reverse")
            ctx.enter("SHORT", f"EMA{self.fast} crossed below EMA{self.slow}")
        else:
            ctx.log.info("ema%d %.4f  ema%d %.4f  no cross", self.fast, f[-1], self.slow, s[-1])

    def snapshot(self) -> dict:
        return {}

    def restore(self, _s: dict) -> None:
        pass


if __name__ == "__main__":
    Runner(name="momo-cross", strategy=Strategy(), default_symbol="BTC-USD",
           default_interval="15m", bot_dir=Path(__file__).resolve().parent,
           default_leverage=5, default_risk_pct="0.02", default_poll=20).run()
