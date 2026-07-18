#!/usr/bin/env python3
"""RUBBER BAND — RSI-14 mean-reversion for SoDEX perps.  [PAPER MODE]

LONG when Wilder RSI(RSI_N) < OVERSOLD on a closed candle, exit at the
EXIT_MID line; SHORT above OVERBOUGHT, same exit. One position at a time,
gated by the shared risk manager. Mean reversion monetises chop — a strong
trend will stretch the band until it snaps YOU, which is exactly what the
loss-streak cooldown is for.

Run:    python bot.py [SYMBOL]          e.g. python bot.py SOL-USD
Config: .env (copy .env.example).
Needs:  Python 3.10+, no third-party packages. Paper only — no keys, ever.
"""
from pathlib import Path

from core.config import g_dec, g_int
from core.indicators import rsi_last
from core.runner import Runner


class Strategy:
    def __init__(self):
        self.n = g_int("RSI_N", 14, lo=2)
        self.oversold = float(g_dec("OVERSOLD", "30", lo="1", hi="49"))
        self.overbought = float(g_dec("OVERBOUGHT", "70", lo="51", hi="99"))
        self.exit_mid = float(g_dec("EXIT_MID", "50", lo="20", hi="80"))

    def warmup_bars(self) -> int:
        return self.n + 30

    def on_bar(self, candles, ctx) -> None:
        closes = [float(c.c) for c in candles]
        r = rsi_last(closes, self.n)
        if ctx.broker.side == "LONG" and r >= self.exit_mid:
            ctx.exit(f"RSI {r:.0f} back to midline")
        elif ctx.broker.side == "SHORT" and r <= self.exit_mid:
            ctx.exit(f"RSI {r:.0f} back to midline")
        if ctx.broker.side is None:
            if r < self.oversold:
                ctx.enter("LONG", f"RSI {r:.0f} oversold")
            elif r > self.overbought:
                ctx.enter("SHORT", f"RSI {r:.0f} overbought")
            else:
                ctx.log.info("rsi %.1f — inside bands", r)

    def snapshot(self) -> dict:
        return {}

    def restore(self, _s: dict) -> None:
        pass


if __name__ == "__main__":
    Runner(name="rubber-band", strategy=Strategy(), default_symbol="SOL-USD",
           default_interval="5m", bot_dir=Path(__file__).resolve().parent,
           default_leverage=3, default_risk_pct="0.02", default_poll=15).run()
