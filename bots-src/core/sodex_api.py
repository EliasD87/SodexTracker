"""SoDEX public REST client — stdlib only (urllib), read-only market data.

Bulletproofing:
  * every call retries with exponential backoff + jitter on network errors,
    HTTP 429/5xx and malformed JSON;
  * hard timeout per request; a typed SodexAPIError after retries exhaust;
  * klines are ALWAYS returned oldest→newest with the still-forming candle
    dropped — the exchange sends them newest-first, strategies must never see
    a partial bar;
  * symbol metadata (tick size, qty step, min notional, max leverage) is
    fetched once and cached so sizing can be quantized like a real venue fill.

This client cannot place orders. There is no signing code here at all.
"""
from __future__ import annotations

import json
import random
import time
import urllib.error
import urllib.request
from decimal import Decimal, ROUND_DOWN

DEFAULT_GW = "https://mainnet-gw.sodex.dev/api/v1/perps"
USER_AGENT = "sodex-paper-bot/2.0"


class SodexAPIError(RuntimeError):
    pass


class Candle:
    __slots__ = ("t", "o", "h", "l", "c", "v")

    def __init__(self, k: dict):
        self.t = int(k["t"])
        self.o = Decimal(str(k["o"]))
        self.h = Decimal(str(k["h"]))
        self.l = Decimal(str(k["l"]))
        self.c = Decimal(str(k["c"]))
        self.v = Decimal(str(k.get("v", "0")))

    def __repr__(self) -> str:  # pragma: no cover
        return f"Candle(t={self.t}, c={self.c})"


class SymbolMeta:
    """Exchange precision rules for one symbol, used to quantize paper fills."""

    def __init__(self, d: dict):
        self.symbol = d["name"]
        self.tick_size = Decimal(str(d.get("tickSize", "0.0001")))
        self.step_size = Decimal(str(d.get("stepSize", "0.0001")))
        self.min_qty = Decimal(str(d.get("minQuantity", "0")))
        self.min_notional = Decimal(str(d.get("minNotional", "0")))
        self.max_leverage = int(d.get("maxLeverage", 20))

    def quantize_qty(self, qty: Decimal) -> Decimal:
        if self.step_size <= 0:
            return qty
        return (qty / self.step_size).to_integral_value(rounding=ROUND_DOWN) * self.step_size

    def quantize_price(self, price: Decimal) -> Decimal:
        if self.tick_size <= 0:
            return price
        return (price / self.tick_size).to_integral_value(rounding=ROUND_DOWN) * self.tick_size


class SodexAPI:
    def __init__(self, gw_url: str = DEFAULT_GW, timeout: float = 10.0,
                 max_retries: int = 4, log=None):
        self.gw = gw_url.rstrip("/")
        self.timeout = timeout
        self.max_retries = max_retries
        self.log = log
        self._meta_cache: dict[str, SymbolMeta] = {}

    # ------------------------------------------------------------- http --
    def _get(self, path: str) -> dict | list:
        url = f"{self.gw}{path}"
        last_err: Exception | None = None
        for attempt in range(self.max_retries + 1):
            try:
                req = urllib.request.Request(url, headers={"User-Agent": USER_AGENT})
                with urllib.request.urlopen(req, timeout=self.timeout) as r:
                    body = r.read()
                j = json.loads(body)
                if j.get("code") != 0:
                    raise SodexAPIError(f"API error on {path}: {j.get('message')}")
                return j["data"]
            except SodexAPIError:
                raise  # application-level error: retrying won't help
            except (urllib.error.URLError, urllib.error.HTTPError, TimeoutError,
                    json.JSONDecodeError, ConnectionError, OSError) as e:
                last_err = e
                if attempt < self.max_retries:
                    delay = min(30.0, (2 ** attempt) * 0.8 + random.uniform(0, 0.4))
                    if self.log:
                        self.log.warning("transient API error (%s), retry %d/%d in %.1fs",
                                         e, attempt + 1, self.max_retries, delay)
                    time.sleep(delay)
        raise SodexAPIError(f"GET {path} failed after {self.max_retries + 1} attempts: {last_err}")

    # ------------------------------------------------------------- data --
    def klines(self, symbol: str, interval: str, limit: int = 300) -> list[Candle]:
        """Closed candles, oldest→newest. The forming candle is dropped."""
        data = self._get(f"/markets/{symbol}/klines?interval={interval}&limit={limit}")
        candles = sorted((Candle(k) for k in data), key=lambda c: c.t)
        if len(candles) < 2:
            raise SodexAPIError(f"not enough kline data for {symbol} {interval}")
        return candles[:-1]

    def newest_bar_time(self, symbol: str, interval: str) -> int:
        """Open-time of the currently forming candle (cheap new-bar detector)."""
        data = self._get(f"/markets/{symbol}/klines?interval={interval}&limit=2")
        return max(int(k["t"]) for k in data)

    def tickers(self) -> list[dict]:
        return self._get("/markets/tickers")

    def mark_price(self, symbol: str) -> Decimal:
        for row in self._get("/markets/mark-prices"):
            if row["symbol"] == symbol:
                return Decimal(str(row["markPrice"]))
        raise SodexAPIError(f"{symbol} not found in mark prices")

    def meta(self, symbol: str) -> SymbolMeta:
        if symbol not in self._meta_cache:
            data = self._get(f"/markets/symbols?symbol={symbol}")
            match = next((d for d in data if d.get("name") == symbol), None)
            if match is None:
                raise SodexAPIError(f"unknown symbol {symbol}")
            self._meta_cache[symbol] = SymbolMeta(match)
        return self._meta_cache[symbol]
