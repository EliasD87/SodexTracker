"""Persistence — atomic state.json + trades.csv + equity.jsonl.

* state.json  broker + risk + strategy state, written atomically (tmp+rename)
              after every fill and periodically, so a crash or Ctrl-C never
              loses or corrupts the account. The bot resumes exactly where it
              stopped, open position included.
* trades.csv  append-only human-auditable fill ledger.
* equity.jsonl one line per poll: timestamp, price, equity — chartable later.
"""
from __future__ import annotations

import csv
import json
import os
import tempfile
import time
from pathlib import Path

TRADE_COLUMNS = ["ts_utc", "symbol", "action", "side", "qty", "price", "fee", "pnl", "balance", "note"]


class StateStore:
    def __init__(self, directory: Path, name: str):
        self.dir = directory
        self.dir.mkdir(parents=True, exist_ok=True)
        self.state_path = self.dir / f"{name}-state.json"
        self.trades_path = self.dir / f"{name}-trades.csv"
        self.equity_path = self.dir / f"{name}-equity.jsonl"

    # ------------------------------------------------------- state.json --
    def load(self) -> dict | None:
        try:
            return json.loads(self.state_path.read_text(encoding="utf-8"))
        except (FileNotFoundError, json.JSONDecodeError):
            return None

    def save(self, state: dict) -> None:
        state = dict(state, saved_at=int(time.time() * 1000))
        fd, tmp = tempfile.mkstemp(dir=str(self.dir), suffix=".tmp")
        try:
            with os.fdopen(fd, "w", encoding="utf-8") as f:
                json.dump(state, f, indent=1)
            os.replace(tmp, self.state_path)  # atomic on POSIX and Windows
        except BaseException:
            try:
                os.unlink(tmp)
            except OSError:
                pass
            raise

    # ------------------------------------------------------- trades.csv --
    def log_trade(self, symbol: str, fill: dict) -> None:
        new = not self.trades_path.exists()
        with self.trades_path.open("a", newline="", encoding="utf-8") as f:
            w = csv.writer(f)
            if new:
                w.writerow(TRADE_COLUMNS)
            ts = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime(fill["ts"] / 1000))
            w.writerow([ts, symbol, fill["action"], fill["side"], fill["qty"],
                        fill["price"], fill["fee"], fill["pnl"], fill["balance"], fill.get("note", "")])

    # ----------------------------------------------------- equity.jsonl --
    def log_equity(self, price, equity) -> None:
        with self.equity_path.open("a", encoding="utf-8") as f:
            f.write(json.dumps({"ts": int(time.time() * 1000), "price": str(price), "equity": str(equity)}) + "\n")
