"""Indicator math — float-domain, shared by the strategies.

Indicators run in float for speed and clarity; all MONEY stays Decimal inside
the broker. Each function is the textbook definition and mirrors both the
in-browser demo engine and the original single-file bots, so backtest, demo
and live-paper all agree bar-for-bar.
"""
from __future__ import annotations

import math


def ema(values: list[float], n: int) -> list[float]:
    k = 2 / (n + 1)
    out = [values[0]]
    for v in values[1:]:
        out.append(v * k + out[-1] * (1 - k))
    return out


def rsi_last(values: list[float], n: int = 14) -> float:
    """Wilder-smoothed RSI of the final value."""
    if len(values) < n + 1:
        return 50.0
    gains = losses = 0.0
    for i in range(1, n + 1):
        d = values[i] - values[i - 1]
        gains += max(d, 0.0)
        losses += max(-d, 0.0)
    ag, al = gains / n, losses / n
    for i in range(n + 1, len(values)):
        d = values[i] - values[i - 1]
        ag = (ag * (n - 1) + max(d, 0.0)) / n
        al = (al * (n - 1) + max(-d, 0.0)) / n
    if al == 0:
        return 100.0
    return 100.0 - 100.0 / (1.0 + ag / al)


def sma(values: list[float], n: int) -> float:
    return sum(values[-n:]) / n


def stdev(values: list[float], n: int) -> float:
    m = sma(values, n)
    return math.sqrt(sum((v - m) ** 2 for v in values[-n:]) / n)


def bollinger(values: list[float], n: int = 20, k: float = 2.0) -> tuple[float, float, float]:
    """(lower, mid, upper)"""
    m = sma(values, n)
    s = stdev(values, n)
    return m - k * s, m, m + k * s


def band_width(values: list[float], n: int = 20, k: float = 2.0) -> float:
    m = sma(values, n)
    s = stdev(values, n)
    return (2 * k * s) / m if m else 0.0


def atr(highs: list[float], lows: list[float], closes: list[float], n: int = 14) -> float:
    """Wilder ATR of the last bar."""
    trs = []
    for i in range(1, len(closes)):
        trs.append(max(highs[i] - lows[i],
                       abs(highs[i] - closes[i - 1]),
                       abs(lows[i] - closes[i - 1])))
    if not trs:
        return 0.0
    if len(trs) <= n:
        return sum(trs) / len(trs)
    a = sum(trs[:n]) / n
    for tr in trs[n:]:
        a = (a * (n - 1) + tr) / n
    return a
