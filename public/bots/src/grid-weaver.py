#!/usr/bin/env python3
"""GRID WEAVER — symmetric grid for SoDEX perps.  [PAPER MODE]

Anchors GRID_LEVELS buy rungs GRID_STEP_PCT apart below the price at start.
Each mark-price cross DOWN through an empty rung buys one LOT_USD lot; a cross
back UP through the rung one step above sells that lot, banking the step. The
position is one net LONG whose lots are tracked per-rung; sells are partial
closes. Grids monetise chop and accumulate inventory in one-way trends — the
risk manager's drawdown kill switch is the backstop for that failure mode.

Tick-driven: decisions use the live mark price polled every POLL_SEC (falling
back to the latest closed 1m price if the mark feed hiccups). The grid re-anchors only when you delete data/…-state.json.

Run:    python bot.py [SYMBOL]          e.g. python bot.py XRP-USD
Config: .env (copy .env.example).
Needs:  Python 3.10+, no third-party packages. Paper only — no keys, ever.
"""
from decimal import Decimal
from pathlib import Path

from core.broker import OrderRejected
from core.config import g_dec, g_int
from core.runner import Runner


class Strategy:
    def __init__(self):
        self.levels = g_int("GRID_LEVELS", 6, lo=1, hi=30)
        self.step = g_dec("GRID_STEP_PCT", "0.004", lo="0.0005", hi="0.05")
        self.lot_usd = g_dec("LOT_USD", "250", lo="10")
        self.anchor: Decimal | None = None
        self.held: dict[int, str] = {}   # rung index -> qty (str for JSON)
        self.prev: Decimal | None = None

    def warmup_bars(self) -> int:
        return 2

    def on_bar(self, candles, ctx) -> None:
        pass  # grid trades on ticks, not bar closes

    def on_tick(self, ctx) -> None:
        try:
            px = ctx.api.mark_price(ctx.symbol)
        except Exception:
            px = ctx.price  # fall back to the latest closed 1m price
        if self.anchor is None:
            self.anchor = px
            ctx.log.info("grid anchored at %s — %d rungs of %s%% below",
                         px, self.levels, self.step * 100)
        if self.prev is None:
            self.prev = px
            return

        for k in range(1, self.levels + 1):
            rung = ctx.meta.quantize_price(self.anchor * (1 - self.step * k))
            target = ctx.meta.quantize_price(self.anchor * (1 - self.step * (k - 1)))

            # buy: crossed down through an empty rung
            if str(k) not in self.held and self.prev > rung >= px:
                ok, why = ctx.risk.allow_entry(ctx.broker.equity(px), self.lot_usd)
                if not ok:
                    ctx.log.info("grid buy blocked — %s", why)
                    continue
                try:
                    if ctx.broker.side is None:
                        fill = ctx.broker.open("LONG", rung, self.lot_usd, f"grid buy rung {k}")
                    else:
                        fill = ctx.broker.add(rung, self.lot_usd, f"grid buy rung {k}")
                except OrderRejected as e:
                    ctx.log.warning("grid buy rejected: %s", e)
                    continue
                self.held[str(k)] = fill["qty"]
                ctx.record(fill)
                ctx.log.info("BUY  rung %d @ %s  qty %s  inventory %d",
                             k, rung, fill["qty"], len(self.held))

            # sell: crossed up through the rung one step above a filled lot
            elif str(k) in self.held and self.prev < target <= px:
                qty = Decimal(self.held[str(k)])
                fill = ctx.broker.partial_close(qty, target, f"grid sell rung {k}")
                if fill:
                    del self.held[str(k)]
                    ctx.record(fill)
                    ctx.risk.on_close(Decimal(fill["pnl"]))
                    ctx.log.info("SELL rung %d @ %s  pnl %s  inventory %d",
                                 k, target, fill["pnl"], len(self.held))

        self.prev = px

    def snapshot(self) -> dict:
        return {
            "anchor": str(self.anchor) if self.anchor is not None else None,
            "held": self.held,
            "prev": str(self.prev) if self.prev is not None else None,
        }

    def restore(self, s: dict) -> None:
        self.anchor = Decimal(s["anchor"]) if s.get("anchor") else None
        self.held = dict(s.get("held", {}))
        self.prev = Decimal(s["prev"]) if s.get("prev") else None


if __name__ == "__main__":
    Runner(name="grid-weaver", strategy=Strategy(), default_symbol="XRP-USD",
           default_interval="1m", bot_dir=Path(__file__).resolve().parent,
           default_leverage=1, default_risk_pct="0.025", default_poll=10).run()
