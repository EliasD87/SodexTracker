"""Bot runner — the shared main loop every strategy plugs into.

Owns everything that is NOT strategy: env/config, API client, paper broker,
risk manager, persistence, resume-on-restart, liquidation checks, graceful
Ctrl-C shutdown, and the status line. A strategy only implements:

    warmup_bars() -> int            minimum closed bars before trading
    on_bar(candles, ctx)            called once per NEW closed candle
    (optional) on_tick(ctx)         called every poll for tick-driven bots

`ctx` exposes: broker, risk, meta, log, and helpers `enter(side, note)` /
`exit(note)` that route through the risk manager and persist every fill.
All arithmetic is Decimal end-to-end.
"""
from __future__ import annotations

import logging
import signal
import sys
import time
from decimal import Decimal
from pathlib import Path

from .broker import OrderRejected, PaperBroker
from .config import g_dec, g_int, g_str, load_env
from .risk import RiskManager
from .sodex_api import SodexAPI, SodexAPIError
from .state import StateStore


def make_logger(name: str, directory: Path) -> logging.Logger:
    try:  # Windows consoles often default to a legacy codepage
        sys.stdout.reconfigure(encoding="utf-8")
        sys.stderr.reconfigure(encoding="utf-8")
    except (AttributeError, OSError):
        pass
    log = logging.getLogger(name)
    if log.handlers:
        return log
    log.setLevel(logging.INFO)
    fmt = logging.Formatter("%(asctime)s %(levelname)-7s %(message)s", "%H:%M:%S")
    sh = logging.StreamHandler(sys.stdout)
    sh.setFormatter(fmt)
    log.addHandler(sh)
    try:
        directory.mkdir(parents=True, exist_ok=True)
        fh = logging.FileHandler(directory / f"{name}.log", encoding="utf-8")
        fh.setFormatter(logging.Formatter("%(asctime)s %(levelname)-7s %(message)s"))
        log.addHandler(fh)
    except OSError:
        pass
    return log


class Ctx:
    """What a strategy sees. enter()/exit() are the ONLY way it trades."""

    def __init__(self, runner: "Runner"):
        self._r = runner
        self.broker = runner.broker
        self.risk = runner.risk
        self.meta = runner.meta
        self.api = runner.api
        self.log = runner.log
        self.symbol = runner.symbol
        self.price = Decimal("0")  # latest close, set by the loop

    def record(self, fill: dict) -> None:
        """Persist a fill made directly through the broker (grid-style bots)."""
        self._r.record(fill)

    def enter(self, side: str, note: str = "") -> bool:
        r = self._r
        margin = r.broker.balance * r.risk_pct
        notional = margin * Decimal(r.broker.leverage)
        ok, why = r.risk.allow_entry(r.broker.equity(self.price), notional)
        if not ok:
            r.log.info("entry blocked — %s", why)
            return False
        try:
            fill = r.broker.open(side, self.price, margin, note)
        except OrderRejected as e:
            r.log.warning("order rejected: %s", e)
            return False
        r.record(fill)
        r.log.info("OPEN %s %s %s @ %s  (%s)", side, fill["qty"], r.symbol, fill["price"], note)
        return True

    def exit(self, note: str = "") -> bool:
        r = self._r
        fill = r.broker.close(self.price, note)
        if fill is None:
            return False
        r.record(fill)
        r.risk.on_close(Decimal(fill["pnl"]))
        r.log.info("CLOSE %s @ %s  pnl %s  balance %s  (%s)",
                   fill["side"], fill["price"], fill["pnl"], fill["balance"], note)
        return True


class Runner:
    def __init__(self, *, name: str, strategy, default_symbol: str, default_interval: str,
                 bot_dir: Path, default_leverage: int = 3, default_risk_pct: str = "0.02",
                 default_poll: int = 20):
        load_env(bot_dir)
        self.name = name
        self.strategy = strategy
        self.symbol = (sys.argv[1].upper() if len(sys.argv) > 1 else g_str("SYMBOL", default_symbol))
        self.interval = g_str("INTERVAL", default_interval)
        self.poll_sec = g_int("POLL_SEC", default_poll, lo=5, hi=600)
        self.risk_pct = g_dec("RISK_PCT", default_risk_pct, lo="0.001", hi="0.5")
        data_dir = bot_dir / g_str("DATA_DIR", "data")

        self.log = make_logger(name, data_dir)
        self.api = SodexAPI(g_str("SODEX_GW_URL", "https://mainnet-gw.sodex.dev/api/v1/perps"),
                            log=self.log)
        self.meta = self.api.meta(self.symbol)

        start_balance = g_dec("START_BALANCE", "10000", lo="100")
        leverage = g_int("LEVERAGE", default_leverage, lo=1, hi=self.meta.max_leverage)
        taker_fee = g_dec("TAKER_FEE", "0.0006", lo="0", hi="0.01")
        self.broker = PaperBroker(start_balance, leverage, taker_fee, self.meta)
        self.risk = RiskManager(
            start_equity=start_balance,
            max_drawdown_pct=g_dec("MAX_DRAWDOWN_PCT", "20", lo="1", hi="95"),
            daily_loss_limit_pct=g_dec("DAILY_LOSS_LIMIT_PCT", "6", lo="0.5", hi="95"),
            max_consec_losses=g_int("MAX_CONSEC_LOSSES", 5, lo=1),
            cooldown_min=g_int("COOLDOWN_MIN", 60, lo=1),
            max_position_notional=g_dec("MAX_POSITION_NOTIONAL_USD", "5000", lo="10"),
            equity_floor=g_dec("EQUITY_FLOOR_USD", "5000", lo="0"),
            log=self.log,
        )
        self.store = StateStore(data_dir, f"{name}-{self.symbol}")
        self._stop = False
        self._last_bar: int | None = None
        self._resume()

    # ------------------------------------------------------ persistence --
    def _resume(self) -> None:
        s = self.store.load()
        if not s:
            return
        try:
            self.broker.restore(s["broker"])
            self.risk.restore(s["risk"])
            self.strategy.restore(s.get("strategy", {}))
            self._last_bar = s.get("last_bar")
            self.log.info("resumed: balance %s, position %s, %d trades",
                          self.broker.balance, self.broker.side or "FLAT", self.broker.trades)
        except (KeyError, ValueError) as e:
            self.log.warning("state.json unreadable (%s) — starting fresh", e)

    def persist(self) -> None:
        self.store.save({
            "broker": self.broker.snapshot(),
            "risk": self.risk.snapshot(),
            "strategy": self.strategy.snapshot(),
            "last_bar": self._last_bar,
        })

    def record(self, fill: dict) -> None:
        self.store.log_trade(self.symbol, fill)
        self.persist()

    # ------------------------------------------------------------- run --
    def run(self) -> None:
        s = self.strategy
        self.log.info("%s | %s %s | lev %dx | risk %s%%/trade | paper %s | PAPER MODE — no keys, no real orders",
                      self.name.upper(), self.symbol, self.interval, self.broker.leverage,
                      self.risk_pct * 100, self.broker.start_balance)

        def on_sig(_sig, _frm):
            self._stop = True
            self.log.info("shutdown requested — persisting state…")
        signal.signal(signal.SIGINT, on_sig)
        signal.signal(signal.SIGTERM, on_sig)

        ctx = Ctx(self)
        while not self._stop:
            try:
                candles = self.api.klines(self.symbol, self.interval, limit=max(300, s.warmup_bars() + 50))
                if len(candles) < s.warmup_bars():
                    self.log.warning("only %d closed bars, need %d — waiting", len(candles), s.warmup_bars())
                    time.sleep(self.poll_sec)
                    continue
                ctx.price = candles[-1].c
                equity = self.broker.equity(ctx.price)
                self.risk.on_mark(equity)
                self.store.log_equity(ctx.price, equity)

                # simulated liquidation guard — checked on every poll, not just bar close
                if self.broker.liquidated(ctx.price):
                    self.log.error("LIQUIDATED at %s — margin exhausted", ctx.price)
                    ctx.exit("liquidation")
                elif self._last_bar != candles[-1].t:
                    self._last_bar = candles[-1].t
                    s.on_bar(candles, ctx)
                    self.persist()
                if hasattr(s, "on_tick"):
                    s.on_tick(ctx)
                pos = self.broker.side or "FLAT"
                self.log.info("px %s  equity %.2f  pos %s  trades %d (%dW/%dL)%s",
                              ctx.price, equity, pos, self.broker.trades, self.broker.wins,
                              self.broker.losses, "  [KILLED]" if self.risk.killed else "")
            except SodexAPIError as e:
                self.log.warning("API: %s", e)
            except Exception as e:  # noqa: BLE001 — a strategy bug must not lose state
                self.log.exception("unexpected error: %s", e)
            for _ in range(self.poll_sec):
                if self._stop:
                    break
                time.sleep(1)
        self.persist()
        self.log.info("stopped cleanly. balance %s, %d trades. state saved — rerun to resume.",
                      self.broker.balance, self.broker.trades)
