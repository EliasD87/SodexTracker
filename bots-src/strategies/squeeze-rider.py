#!/usr/bin/env python3
"""SQUEEZE RIDER — Bollinger-squeeze breakout for SoDEX perps.  [PAPER MODE]

Watches Bollinger (BB_N, BB_K) band width. When width drops into the tightest
SQUEEZE_PCTL of the last SQUEEZE_LOOKBACK bars the market is "squeezed"; the
first closed candle breaking out of the bands takes the trade. Exit on a close
back across the mid-band. Entries are gated by the shared risk manager.

Run:    python bot.py [SYMBOL]          e.g. python bot.py ETH-USD
Config: .env (copy .env.example).
Needs:  Python 3.10+, no third-party packages. Paper only — no keys, ever.
"""
from pathlib import Path

from core.config import g_dec, g_int
from core.indicators import band_width, bollinger
from core.runner import Runner


class Strategy:
    def __init__(self):
        self.n = g_int("BB_N", 20, lo=5)
        self.k = float(g_dec("BB_K", "2.0", lo="0.5", hi="4"))
        self.lookback = g_int("SQUEEZE_LOOKBACK", 60, lo=20)
        self.pctl = float(g_dec("SQUEEZE_PCTL", "0.25", lo="0.05", hi="0.9"))
        self.squeezed = False

    def warmup_bars(self) -> int:
        return self.n + self.lookback + 5

    def on_bar(self, candles, ctx) -> None:
        closes = [float(c.c) for c in candles]
        price = closes[-1]
        lower, mid, upper = bollinger(closes, self.n, self.k)

        widths = sorted(
            band_width(closes[: i + 1], self.n, self.k)
            for i in range(len(closes) - self.lookback, len(closes))
        )
        threshold = widths[int(len(widths) * self.pctl)]
        if band_width(closes, self.n, self.k) <= threshold:
            self.squeezed = True

        if ctx.broker.side == "LONG" and price < mid:
            ctx.exit("close under mid-band")
        elif ctx.broker.side == "SHORT" and price > mid:
            ctx.exit("close over mid-band")

        if ctx.broker.side is None and self.squeezed:
            if price > upper:
                if ctx.enter("LONG", "squeeze break above upper band"):
                    self.squeezed = False
            elif price < lower:
                if ctx.enter("SHORT", "squeeze break below lower band"):
                    self.squeezed = False
        else:
            ctx.log.info("band [%.4f … %.4f]  squeeze=%s", lower, upper, self.squeezed)

    def snapshot(self) -> dict:
        return {"squeezed": self.squeezed}

    def restore(self, s: dict) -> None:
        self.squeezed = bool(s.get("squeezed", False))


if __name__ == "__main__":
    Runner(name="squeeze-rider", strategy=Strategy(), default_symbol="ETH-USD",
           default_interval="1h", bot_dir=Path(__file__).resolve().parent,
           default_leverage=4, default_risk_pct="0.03", default_poll=30).run()
