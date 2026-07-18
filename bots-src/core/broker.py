"""Paper broker — Decimal-exact simulated execution against live SoDEX prices.

Accounting model (isolated-margin perp, one net position):
  * OPEN reserves margin = notional / leverage and charges taker fee on the
    full notional. Quantity is quantized to the exchange step size and the
    order is rejected below the exchange minimums — a fill that the real venue
    would reject is a lie.
  * CLOSE realizes (exit-entry)·dir·qty minus the exit taker fee.
  * equity = balance + unrealized. A simulated LIQUIDATION triggers when the
    loss on the open position consumes its reserved margin (maintenance-margin
    simplification, conservative).

Every fill is returned as a dict so the caller can persist/log it. The broker
itself is pure state — no I/O — which is what makes it restorable from disk.
"""
from __future__ import annotations

import time
from decimal import Decimal

from .sodex_api import SymbolMeta

D0 = Decimal("0")


class OrderRejected(Exception):
    pass


class PaperBroker:
    def __init__(self, balance: Decimal, leverage: int, taker_fee: Decimal, meta: SymbolMeta):
        if leverage < 1 or leverage > meta.max_leverage:
            raise OrderRejected(f"leverage {leverage} outside 1..{meta.max_leverage} for {meta.symbol}")
        self.balance = balance
        self.start_balance = balance
        self.leverage = leverage
        self.taker_fee = taker_fee
        self.meta = meta
        self.side: str | None = None       # "LONG" | "SHORT"
        self.qty = D0
        self.entry = D0
        self.margin = D0
        self.trades = 0
        self.wins = 0
        self.losses = 0
        self.fees_paid = D0

    # ---------------------------------------------------------- queries --
    def unrealized(self, price: Decimal) -> Decimal:
        if not self.side:
            return D0
        d = 1 if self.side == "LONG" else -1
        return (price - self.entry) * d * self.qty

    def equity(self, price: Decimal) -> Decimal:
        return self.balance + self.unrealized(price)

    def liquidated(self, price: Decimal) -> bool:
        """Loss ate the reserved margin → the venue would have force-closed."""
        return bool(self.side) and self.unrealized(price) <= -self.margin

    # ---------------------------------------------------------- actions --
    def open(self, side: str, price: Decimal, margin_usd: Decimal, note: str = "") -> dict:
        if self.side:
            raise OrderRejected("position already open")
        if side not in ("LONG", "SHORT"):
            raise OrderRejected(f"bad side {side}")
        if margin_usd <= 0 or margin_usd > self.balance:
            raise OrderRejected(f"margin {margin_usd} exceeds balance {self.balance}")
        notional = margin_usd * self.leverage
        qty = self.meta.quantize_qty(notional / price)
        if qty < self.meta.min_qty or qty <= 0:
            raise OrderRejected(f"qty {qty} below exchange minimum {self.meta.min_qty}")
        if qty * price < self.meta.min_notional:
            raise OrderRejected(f"notional {qty * price:.2f} below exchange minimum {self.meta.min_notional}")
        fee = qty * price * self.taker_fee
        self.balance -= fee
        self.fees_paid += fee
        self.side, self.qty, self.entry, self.margin = side, qty, price, margin_usd
        return self._fill("OPEN", side, price, qty, fee, None, note)

    def add(self, price: Decimal, margin_usd: Decimal, note: str = "") -> dict:
        """Increase the open position (same side), averaging the entry. Grid bots."""
        if not self.side:
            raise OrderRejected("no position to add to — use open()")
        if margin_usd <= 0 or margin_usd > self.balance:
            raise OrderRejected(f"margin {margin_usd} exceeds balance {self.balance}")
        notional = margin_usd * self.leverage
        qty = self.meta.quantize_qty(notional / price)
        if qty < self.meta.min_qty or qty <= 0:
            raise OrderRejected(f"add qty {qty} below exchange minimum {self.meta.min_qty}")
        fee = qty * price * self.taker_fee
        self.balance -= fee
        self.fees_paid += fee
        total = self.qty + qty
        self.entry = (self.entry * self.qty + price * qty) / total
        self.qty = total
        self.margin += margin_usd
        return self._fill("OPEN", self.side, price, qty, fee, None, note)

    def partial_close(self, qty: Decimal, price: Decimal, note: str = "") -> dict | None:
        """Close part of the position. Realizes proportional PnL; frees margin."""
        if not self.side or qty <= 0:
            return None
        qty = min(qty, self.qty)
        d = 1 if self.side == "LONG" else -1
        pnl = (price - self.entry) * d * qty
        fee = qty * price * self.taker_fee
        net = pnl - fee
        self.balance += net
        self.fees_paid += fee
        self.trades += 1
        if net >= 0:
            self.wins += 1
        else:
            self.losses += 1
        frac = qty / self.qty if self.qty > 0 else Decimal("1")
        self.margin -= self.margin * frac
        self.qty -= qty
        fill = self._fill("CLOSE", self.side, price, qty, fee, net, note)
        if self.qty <= 0 or self.qty < self.meta.min_qty:
            self.side, self.qty, self.entry, self.margin = None, D0, D0, D0
        return fill

    def close(self, price: Decimal, note: str = "") -> dict | None:
        if not self.side:
            return None
        d = 1 if self.side == "LONG" else -1
        pnl = (price - self.entry) * d * self.qty
        fee = self.qty * price * self.taker_fee
        net = pnl - fee
        self.balance += net
        self.fees_paid += fee
        self.trades += 1
        if net >= 0:
            self.wins += 1
        else:
            self.losses += 1
        fill = self._fill("CLOSE", self.side, price, self.qty, fee, net, note)
        self.side, self.qty, self.entry, self.margin = None, D0, D0, D0
        return fill

    # ------------------------------------------------------ persistence --
    def snapshot(self) -> dict:
        return {
            "balance": str(self.balance), "start_balance": str(self.start_balance),
            "side": self.side, "qty": str(self.qty), "entry": str(self.entry),
            "margin": str(self.margin), "trades": self.trades, "wins": self.wins,
            "losses": self.losses, "fees_paid": str(self.fees_paid),
        }

    def restore(self, s: dict) -> None:
        self.balance = Decimal(s["balance"])
        self.start_balance = Decimal(s.get("start_balance", s["balance"]))
        self.side = s.get("side")
        self.qty = Decimal(s.get("qty", "0"))
        self.entry = Decimal(s.get("entry", "0"))
        self.margin = Decimal(s.get("margin", "0"))
        self.trades = int(s.get("trades", 0))
        self.wins = int(s.get("wins", 0))
        self.losses = int(s.get("losses", 0))
        self.fees_paid = Decimal(s.get("fees_paid", "0"))

    def _fill(self, action, side, price, qty, fee, pnl, note) -> dict:
        return {
            "ts": int(time.time() * 1000), "action": action, "side": side,
            "price": str(price), "qty": str(qty), "fee": str(fee),
            "pnl": str(pnl) if pnl is not None else "",
            "balance": str(self.balance), "note": note,
        }
