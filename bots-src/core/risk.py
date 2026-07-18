"""Risk manager — the layer that keeps a strategy from destroying its account.

Checks run BEFORE every entry (`allow_entry`) and AFTER every closed trade /
equity mark (`on_close`, `on_mark`). All limits come from .env; each has a sane
default. When a hard limit trips the bot goes into KILLED state and refuses to
trade until the operator restarts it deliberately (state.json keeps the flag,
so a crash-loop supervisor cannot resurrect a blown account by accident).

Limits:
  MAX_DRAWDOWN_PCT        kill switch on peak-to-trough equity drawdown
  DAILY_LOSS_LIMIT_PCT    stop trading for the UTC day after losing this much
  MAX_CONSEC_LOSSES       cooldown after N losing trades in a row
  COOLDOWN_MIN            minutes to stand down after the losing streak
  MAX_POSITION_NOTIONAL   hard cap on any single position's notional
  EQUITY_FLOOR_USD        absolute equity level below which the bot kills itself
"""
from __future__ import annotations

import time
from decimal import Decimal


class RiskManager:
    def __init__(self, *, start_equity: Decimal,
                 max_drawdown_pct: Decimal, daily_loss_limit_pct: Decimal,
                 max_consec_losses: int, cooldown_min: int,
                 max_position_notional: Decimal, equity_floor: Decimal, log=None):
        self.peak = start_equity
        self.max_dd = max_drawdown_pct
        self.daily_limit = daily_loss_limit_pct
        self.max_consec = max_consec_losses
        self.cooldown_s = cooldown_min * 60
        self.max_notional = max_position_notional
        self.floor = equity_floor
        self.log = log

        self.killed = False
        self.kill_reason = ""
        self.consec_losses = 0
        self.cooldown_until = 0.0
        self.day_key = self._day()
        self.day_start_equity = start_equity

    @staticmethod
    def _day() -> str:
        return time.strftime("%Y-%m-%d", time.gmtime())

    # ---------------------------------------------------------- events --
    def on_mark(self, equity: Decimal) -> None:
        """Call on every equity mark (each poll)."""
        if self.killed:
            return
        if self._day() != self.day_key:
            self.day_key = self._day()
            self.day_start_equity = equity
        self.peak = max(self.peak, equity)
        if self.peak > 0:
            dd = (self.peak - equity) / self.peak * 100
            if dd >= self.max_dd:
                self._kill(f"max drawdown {dd:.2f}% >= {self.max_dd}%")
        if equity <= self.floor:
            self._kill(f"equity {equity:.2f} at/below floor {self.floor}")

    def on_close(self, net_pnl: Decimal) -> None:
        if net_pnl < 0:
            self.consec_losses += 1
            if self.consec_losses >= self.max_consec:
                self.cooldown_until = time.time() + self.cooldown_s
                self.consec_losses = 0
                if self.log:
                    self.log.warning("RISK: %d consecutive losses — cooling down %d min",
                                     self.max_consec, self.cooldown_s // 60)
        else:
            self.consec_losses = 0

    # ---------------------------------------------------------- checks --
    def allow_entry(self, equity: Decimal, notional: Decimal) -> tuple[bool, str]:
        if self.killed:
            return False, f"KILLED: {self.kill_reason}"
        if time.time() < self.cooldown_until:
            left = int(self.cooldown_until - time.time())
            return False, f"cooldown {left}s after losing streak"
        if self.day_start_equity > 0:
            day_loss = (self.day_start_equity - equity) / self.day_start_equity * 100
            if day_loss >= self.daily_limit:
                return False, f"daily loss {day_loss:.2f}% >= {self.daily_limit}% — done for the day"
        if notional > self.max_notional:
            return False, f"notional {notional:.0f} > cap {self.max_notional:.0f}"
        return True, ""

    def _kill(self, reason: str) -> None:
        self.killed = True
        self.kill_reason = reason
        if self.log:
            self.log.error("RISK KILL SWITCH: %s — no further entries. Restart deliberately.", reason)

    # ------------------------------------------------------ persistence --
    def snapshot(self) -> dict:
        return {
            "peak": str(self.peak), "killed": self.killed, "kill_reason": self.kill_reason,
            "consec_losses": self.consec_losses, "cooldown_until": self.cooldown_until,
            "day_key": self.day_key, "day_start_equity": str(self.day_start_equity),
        }

    def restore(self, s: dict) -> None:
        self.peak = Decimal(s.get("peak", str(self.peak)))
        self.killed = bool(s.get("killed", False))
        self.kill_reason = s.get("kill_reason", "")
        self.consec_losses = int(s.get("consec_losses", 0))
        self.cooldown_until = float(s.get("cooldown_until", 0))
        self.day_key = s.get("day_key", self.day_key)
        self.day_start_equity = Decimal(s.get("day_start_equity", str(self.day_start_equity)))
