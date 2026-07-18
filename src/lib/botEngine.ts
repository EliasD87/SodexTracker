/**
 * botEngine — in-browser paper-trading engine for the Trading Bots page.
 *
 * Mirrors the strategy logic of the downloadable single-file Python bots in
 * /public/bots, running entirely in the browser against LIVE SoDEX data:
 *
 *  - the five price-driven bots (momo-cross, rubber-band, squeeze-rider,
 *    grid-weaver, range-breaker) backtest over recent closed klines and then
 *    keep trading live, bar by bar;
 *  - funding-farmer scans REAL current funding rates across every SoDEX perp
 *    (there is no public funding-history endpoint, so its stats are labelled
 *    "at current rates").
 *
 * Everything is SIMULATED: fills at candle closes, flat taker fee both ways,
 * no slippage. Nothing here can ever place a real order.
 *
 * Determinism: each poll re-runs the whole simulation from scratch over the
 * fetched candle window. Same candles in → same fills out, so a re-run only
 * ever APPENDS fills when new bars arrive — which is what lets the UI replay
 * and diff order flow reliably.
 */

export interface Candle {
  t: number; // open time (ms)
  o: number;
  h: number;
  l: number;
  c: number;
}

export interface Fill {
  t: number; // candle open time the decision bar closed at
  i: number; // index into the candle array (for replay)
  action: "OPEN" | "CLOSE";
  side: "LONG" | "SHORT";
  price: number;
  qty: number;
  fee: number;
  pnl?: number; // net of fee, CLOSE only
  balance: number;
  note?: string;
}

export interface SimResult {
  slug: string;
  balance: number;
  equity: number; // balance + unrealized
  startBalance: number;
  side: "LONG" | "SHORT" | null;
  qty: number;
  entry: number;
  unrealized: number;
  fills: Fill[];
  curve: { t: number; v: number }[]; // equity over time (per closed bar)
  trades: number; // closed round-trips
  wins: number;
  losses: number;
  maxDD: number; // pct, negative
  lastPrice: number;
  lastCandleT: number;
}

export interface BotConfig {
  slug: string;
  startBalance: number;
  riskPct: number; // fraction of equity used as margin per trade
  leverage: number;
  takerFee: number;
}

export const BOT_CONFIG: Record<string, BotConfig> = {
  "momo-cross": { slug: "momo-cross", startBalance: 10_000, riskPct: 0.02, leverage: 5, takerFee: 0.0006 },
  "rubber-band": { slug: "rubber-band", startBalance: 10_000, riskPct: 0.02, leverage: 3, takerFee: 0.0006 },
  "squeeze-rider": { slug: "squeeze-rider", startBalance: 10_000, riskPct: 0.03, leverage: 4, takerFee: 0.0006 },
  "grid-weaver": { slug: "grid-weaver", startBalance: 10_000, riskPct: 0.025, leverage: 1, takerFee: 0.0006 },
  "range-breaker": { slug: "range-breaker", startBalance: 10_000, riskPct: 0.02, leverage: 4, takerFee: 0.0006 },
  "funding-farmer": { slug: "funding-farmer", startBalance: 10_000, riskPct: 0.1, leverage: 1, takerFee: 0.0006 },
};

/* ─────────────────────────── indicators ─────────────────────────── */

function ema(values: number[], n: number): number[] {
  const k = 2 / (n + 1);
  const out: number[] = [values[0]];
  for (let i = 1; i < values.length; i++) out.push(values[i] * k + out[i - 1] * (1 - k));
  return out;
}

/** Wilder-smoothed RSI series (same math as rubber-band.py). */
function rsi(values: number[], n: number): number[] {
  const out: number[] = new Array(values.length).fill(50);
  if (values.length < n + 1) return out;
  let gain = 0, loss = 0;
  for (let i = 1; i <= n; i++) {
    const d = values[i] - values[i - 1];
    if (d >= 0) gain += d; else loss -= d;
  }
  let ag = gain / n, al = loss / n;
  out[n] = al === 0 ? 100 : 100 - 100 / (1 + ag / al);
  for (let i = n + 1; i < values.length; i++) {
    const d = values[i] - values[i - 1];
    ag = (ag * (n - 1) + Math.max(d, 0)) / n;
    al = (al * (n - 1) + Math.max(-d, 0)) / n;
    out[i] = al === 0 ? 100 : 100 - 100 / (1 + ag / al);
  }
  return out;
}

function sma(values: number[], n: number, i: number): number {
  if (i < n - 1) return values[i];
  let s = 0;
  for (let j = i - n + 1; j <= i; j++) s += values[j];
  return s / n;
}

function stddev(values: number[], n: number, i: number, mean: number): number {
  if (i < n - 1) return 0;
  let s = 0;
  for (let j = i - n + 1; j <= i; j++) s += (values[j] - mean) ** 2;
  return Math.sqrt(s / n);
}

/** Wilder ATR at index i (same math as range-breaker.py). */
function atrAt(c: Candle[], n: number, i: number): number {
  if (i < 1) return c[i].h - c[i].l;
  const trs: number[] = [];
  for (let j = 1; j <= i; j++) {
    trs.push(Math.max(c[j].h - c[j].l, Math.abs(c[j].h - c[j - 1].c), Math.abs(c[j].l - c[j - 1].c)));
  }
  if (trs.length <= n) return trs.reduce((a, b) => a + b, 0) / trs.length;
  let a = trs.slice(0, n).reduce((x, y) => x + y, 0) / n;
  for (let j = n; j < trs.length; j++) a = (a * (n - 1) + trs[j]) / n;
  return a;
}

/* ─────────────────────────── paper broker ─────────────────────────── */

class Broker {
  balance: number;
  side: "LONG" | "SHORT" | null = null;
  qty = 0;
  entry = 0;
  fills: Fill[] = [];
  trades = 0;
  wins = 0;
  losses = 0;

  constructor(private cfg: BotConfig) {
    this.balance = cfg.startBalance;
  }

  open(side: "LONG" | "SHORT", price: number, t: number, i: number, note?: string, marginUsd?: number) {
    const margin = marginUsd ?? this.balance * this.cfg.riskPct;
    const notional = margin * this.cfg.leverage;
    this.qty = notional / price;
    this.entry = price;
    this.side = side;
    const fee = notional * this.cfg.takerFee;
    this.balance -= fee;
    this.fills.push({ t, i, action: "OPEN", side, price, qty: this.qty, fee, balance: this.balance, note });
  }

  close(price: number, t: number, i: number, note?: string) {
    if (!this.side) return;
    const dir = this.side === "LONG" ? 1 : -1;
    const pnl = (price - this.entry) * dir * this.qty;
    const fee = this.qty * price * this.cfg.takerFee;
    this.balance += pnl - fee;
    this.trades++;
    if (pnl - fee >= 0) this.wins++; else this.losses++;
    this.fills.push({ t, i, action: "CLOSE", side: this.side, price, qty: this.qty, fee, pnl: pnl - fee, balance: this.balance, note });
    this.side = null;
    this.qty = 0;
  }

  unrealized(price: number): number {
    if (!this.side) return 0;
    const dir = this.side === "LONG" ? 1 : -1;
    return (price - this.entry) * dir * this.qty;
  }
}

/* ─────────────────────────── strategies ─────────────────────────── */
/* Each mirrors its .py counterpart bar-for-bar. `mark(i)` records equity. */

type StrategyFn = (candles: Candle[], b: Broker, mark: (i: number) => void) => void;

/** MOMO CROSS — 9/21 EMA crossover, stop-and-reverse, always in the market. */
const momoCross: StrategyFn = (c, b, mark) => {
  const closes = c.map((x) => x.c);
  const f = ema(closes, 9), s = ema(closes, 21);
  for (let i = 22; i < c.length; i++) {
    const price = c[i].c;
    const above = f[i] > s[i], abovePrev = f[i - 1] > s[i - 1];
    if (above && !abovePrev && b.side !== "LONG") {
      b.close(price, c[i].t, i, "reverse");
      b.open("LONG", price, c[i].t, i, "EMA 9 crossed above 21");
    } else if (!above && abovePrev && b.side !== "SHORT") {
      b.close(price, c[i].t, i, "reverse");
      b.open("SHORT", price, c[i].t, i, "EMA 9 crossed below 21");
    }
    mark(i);
  }
};

/** RUBBER BAND — RSI-14 mean reversion: buy <30, sell >70, exit at the 50 midline. */
const rubberBand: StrategyFn = (c, b, mark) => {
  const closes = c.map((x) => x.c);
  const r = rsi(closes, 14);
  for (let i = 15; i < c.length; i++) {
    const price = c[i].c, v = r[i];
    if (b.side === "LONG" && v >= 50) b.close(price, c[i].t, i, `RSI ${v.toFixed(0)} → midline`);
    else if (b.side === "SHORT" && v <= 50) b.close(price, c[i].t, i, `RSI ${v.toFixed(0)} → midline`);
    if (!b.side) {
      if (v < 30) b.open("LONG", price, c[i].t, i, `RSI ${v.toFixed(0)} oversold`);
      else if (v > 70) b.open("SHORT", price, c[i].t, i, `RSI ${v.toFixed(0)} overbought`);
    }
    mark(i);
  }
};

/** SQUEEZE RIDER — Bollinger band-width in its tightest quartile, then trade the break. */
const squeezeRider: StrategyFn = (c, b, mark) => {
  const closes = c.map((x) => x.c);
  const N = 20, K = 2.0, LOOKBACK = 60, PCTL = 0.25;
  const bw: number[] = [];
  for (let i = 0; i < c.length; i++) {
    const m = sma(closes, N, i);
    const sd = stddev(closes, N, i, m);
    bw.push(m ? (2 * K * sd) / m : 0);
  }
  let squeezed = false;
  for (let i = N + LOOKBACK; i < c.length; i++) {
    const m = sma(closes, N, i);
    const sd = stddev(closes, N, i, m);
    const upper = m + K * sd, lower = m - K * sd;
    const price = c[i].c;
    const win = bw.slice(i - LOOKBACK + 1, i + 1).slice().sort((a, z) => a - z);
    const threshold = win[Math.floor(win.length * PCTL)];
    if (bw[i] <= threshold) squeezed = true;
    if (b.side === "LONG" && price < m) b.close(price, c[i].t, i, "close under mid-band");
    else if (b.side === "SHORT" && price > m) b.close(price, c[i].t, i, "close over mid-band");
    if (!b.side && squeezed) {
      if (price > upper) { b.open("LONG", price, c[i].t, i, "squeeze break ↑ upper band"); squeezed = false; }
      else if (price < lower) { b.open("SHORT", price, c[i].t, i, "squeeze break ↓ lower band"); squeezed = false; }
    }
    mark(i);
  }
};

/** RANGE BREAKER — Donchian-20 close-breakout with a trailing 2×ATR stop. */
const rangeBreaker: StrategyFn = (c, b, mark) => {
  const N = 20, ATR_N = 14, ATR_MULT = 2;
  let stop = 0;
  for (let i = N + 1; i < c.length; i++) {
    let hi = -Infinity, lo = Infinity;
    for (let j = i - N; j < i; j++) { hi = Math.max(hi, c[j].h); lo = Math.min(lo, c[j].l); }
    const price = c[i].c;
    const a = atrAt(c, ATR_N, i);
    if (b.side === "LONG") {
      stop = Math.max(stop, price - ATR_MULT * a);
      if (price <= stop) b.close(price, c[i].t, i, "ATR trail stop");
    } else if (b.side === "SHORT") {
      stop = Math.min(stop, price + ATR_MULT * a);
      if (price >= stop) b.close(price, c[i].t, i, "ATR trail stop");
    }
    if (!b.side) {
      if (price > hi) { b.open("LONG", price, c[i].t, i, "Donchian-20 break ↑"); stop = price - ATR_MULT * a; }
      else if (price < lo) { b.open("SHORT", price, c[i].t, i, "Donchian-20 break ↓"); stop = price + ATR_MULT * a; }
    }
    mark(i);
  }
};

/** GRID WEAVER — symmetric grid below an anchor; buy a rung down, sell it one rung up. */
const gridWeaver: StrategyFn = (c, b, mark) => {
  const STEP = 0.004, RUNGS = 6;
  const lotUsd = b.balance * BOT_CONFIG["grid-weaver"].riskPct; // $250 on $10k
  const fee = BOT_CONFIG["grid-weaver"].takerFee;
  const anchorIdx = Math.min(20, c.length - 1);
  const anchor = c[anchorIdx].c;
  const held: Record<number, { qty: number; entry: number }> = {};
  let prev = anchor;
  for (let i = anchorIdx + 1; i < c.length; i++) {
    const px = c[i].c;
    for (let k = 1; k <= RUNGS; k++) {
      const rung = anchor * (1 - STEP * k);
      // buy: crossed down through an empty rung
      if (!held[k] && prev > rung && rung >= px) {
        const qty = lotUsd / rung;
        b.balance -= lotUsd * fee;
        held[k] = { qty, entry: rung };
        b.fills.push({ t: c[i].t, i, action: "OPEN", side: "LONG", price: rung, qty, fee: lotUsd * fee, balance: b.balance, note: `grid buy rung ${k} (−${(STEP * k * 100).toFixed(1)}%)` });
      }
      // sell: crossed up through the rung one step above a filled lot
      const target = anchor * (1 - STEP * (k - 1));
      if (held[k] && prev < target && target <= px) {
        const lot = held[k];
        const pnl = (target - lot.entry) * lot.qty;
        const f = lot.qty * target * fee;
        b.balance += pnl - f;
        b.trades++;
        if (pnl - f >= 0) b.wins++; else b.losses++;
        b.fills.push({ t: c[i].t, i, action: "CLOSE", side: "LONG", price: target, qty: lot.qty, fee: f, pnl: pnl - f, balance: b.balance, note: `grid sell rung ${k} (+${(STEP * 100).toFixed(1)}%)` });
        delete held[k];
      }
    }
    prev = px;
    // equity = balance + inventory marked to market vs entry
    const inv = Object.values(held).reduce((s, l) => s + (px - l.entry) * l.qty, 0);
    b.qty = Object.values(held).reduce((s, l) => s + l.qty, 0);
    if (b.qty > 0) { b.side = "LONG"; b.entry = Object.values(held).reduce((s, l) => s + l.entry * l.qty, 0) / b.qty; }
    else { b.side = null; b.entry = 0; }
    void inv;
    mark(i);
  }
};

const STRATEGIES: Record<string, StrategyFn> = {
  "momo-cross": momoCross,
  "rubber-band": rubberBand,
  "squeeze-rider": squeezeRider,
  "range-breaker": rangeBreaker,
  "grid-weaver": gridWeaver,
};

/* ─────────────────────────── runner ─────────────────────────── */

/**
 * Run a price-driven bot over a closed-candle window (oldest→newest).
 * Deterministic: same candles → same fills.
 */
export function runBot(slug: string, candles: Candle[]): SimResult {
  const cfg = BOT_CONFIG[slug] ?? BOT_CONFIG["momo-cross"];
  const b = new Broker(cfg);
  const curve: { t: number; v: number }[] = [];
  let peak = cfg.startBalance;
  let maxDD = 0;

  const mark = (i: number) => {
    const price = candles[i].c;
    const eq = b.balance + b.unrealized(price);
    curve.push({ t: candles[i].t, v: eq });
    peak = Math.max(peak, eq);
    const dd = ((eq - peak) / peak) * 100;
    if (dd < maxDD) maxDD = dd;
  };

  const strat = STRATEGIES[slug];
  if (strat && candles.length > 85) strat(candles, b, mark);

  const last = candles[candles.length - 1]?.c ?? 0;
  const unrealized = b.unrealized(last);
  return {
    slug,
    balance: b.balance,
    equity: b.balance + unrealized,
    startBalance: cfg.startBalance,
    side: b.side,
    qty: b.qty,
    entry: b.entry,
    unrealized,
    fills: b.fills,
    curve,
    trades: b.trades,
    wins: b.wins,
    losses: b.losses,
    maxDD,
    lastPrice: last,
    lastCandleT: candles[candles.length - 1]?.t ?? 0,
  };
}

/* ─────────────────────────── live forward session ───────────────────────────
 * True paper-trading session for the on-page demo: starts FLAT with the full
 * balance at the moment the user presses Run, then trades forward-only as new
 * candles close — indicators see history, but no historical trade is ever
 * simulated into the results. Position, margin and balance are managed exactly
 * like the downloadable bots: entries sized from CURRENT balance × risk% ×
 * leverage, taker fees both ways, equity marked to the live price every poll.
 */

export interface LiveFill {
  t: number; // wall-clock ms of the decision
  barT: number; // open time of the candle the decision keyed on (chart anchor)
  action: "OPEN" | "CLOSE";
  side: "LONG" | "SHORT";
  price: number;
  qty: number;
  fee: number;
  pnl?: number; // net of fee, CLOSE only
  balance: number;
  note?: string;
}

export function intervalMs(interval: string): number {
  const n = parseInt(interval, 10);
  if (interval.endsWith("m")) return n * 60_000;
  if (interval.endsWith("h")) return n * 3_600_000;
  return n * 86_400_000; // d
}

export class LiveSession {
  readonly slug: string;
  readonly symbol: string;
  readonly interval: string;
  readonly cfg: BotConfig;
  readonly startedAt: number;
  startBarT = 0; // first closed bar observed after start

  balance: number;
  side: "LONG" | "SHORT" | null = null;
  qty = 0;
  entry = 0;
  fills: LiveFill[] = [];
  trades = 0;
  wins = 0;
  losses = 0;
  peak: number;
  maxDD = 0; // pct, negative
  curve: { t: number; v: number }[] = [];
  lastPrice = 0;
  lastBarT: number | null = null;
  barsSeen = 0;

  // per-strategy state (mirrors the downloadable bots' state.json)
  private squeezed = false;
  private stop = 0;
  private anchor: number | null = null;
  private prevTick: number | null = null;
  private lots: Record<number, { qty: number; entry: number }> = {};

  constructor(slug: string, symbol: string, interval: string) {
    this.slug = slug;
    this.symbol = symbol;
    this.interval = interval;
    this.cfg = BOT_CONFIG[slug] ?? BOT_CONFIG["momo-cross"];
    this.balance = this.cfg.startBalance;
    this.peak = this.cfg.startBalance;
    this.startedAt = Date.now();
  }

  /* ── accounting ── */
  unrealized(price: number): number {
    if (!this.side) return 0;
    return (price - this.entry) * (this.side === "LONG" ? 1 : -1) * this.qty;
  }
  equity(price: number): number {
    return this.balance + this.unrealized(price);
  }

  private open(side: "LONG" | "SHORT", price: number, barT: number, note?: string, marginUsd?: number) {
    const margin = marginUsd ?? this.balance * this.cfg.riskPct;
    const notional = margin * this.cfg.leverage;
    const qty = notional / price;
    const fee = notional * this.cfg.takerFee;
    this.balance -= fee;
    if (this.side) {
      // grid adds to an existing long: average the entry
      const total = this.qty + qty;
      this.entry = (this.entry * this.qty + price * qty) / total;
      this.qty = total;
    } else {
      this.side = side;
      this.qty = qty;
      this.entry = price;
    }
    this.fills.push({ t: Date.now(), barT, action: "OPEN", side, price, qty, fee, balance: this.balance, note });
  }

  private closeAll(price: number, barT: number, note?: string) {
    if (!this.side) return;
    this.closePart(this.qty, price, barT, note);
  }

  private closePart(qty: number, price: number, barT: number, note?: string) {
    if (!this.side || qty <= 0) return;
    qty = Math.min(qty, this.qty);
    const pnl = (price - this.entry) * (this.side === "LONG" ? 1 : -1) * qty;
    const fee = qty * price * this.cfg.takerFee;
    const net = pnl - fee;
    this.balance += net;
    this.trades++;
    if (net >= 0) this.wins++; else this.losses++;
    this.fills.push({ t: Date.now(), barT, action: "CLOSE", side: this.side, price, qty, fee, pnl: net, balance: this.balance, note });
    this.qty -= qty;
    if (this.qty <= 1e-12) {
      this.side = null;
      this.qty = 0;
      this.entry = 0;
    }
  }

  /* ── the poll entrypoint ──
   * `closed` = closed candles oldest→newest (indicator history included),
   * `livePrice` = latest price from the still-forming candle.
   * Bar-driven strategies decide once per NEW closed bar; the grid ticks every
   * poll on the live price, like the real grid bot. */
  handle(closed: Candle[], livePrice: number): number {
    const newestClosed = closed[closed.length - 1];
    this.lastPrice = livePrice;
    if (this.startBarT === 0) this.startBarT = newestClosed.t;

    let newFills = 0;
    const before = this.fills.length;

    if (this.slug === "grid-weaver") {
      this.gridTick(livePrice, newestClosed.t);
    } else if (this.lastBarT === null) {
      this.lastBarT = newestClosed.t; // arm: no decision on the pre-existing bar
    } else if (newestClosed.t !== this.lastBarT) {
      this.lastBarT = newestClosed.t;
      this.barsSeen++;
      this.onBar(closed);
    }
    newFills = this.fills.length - before;

    // mark equity to the live price every poll
    const eq = this.equity(livePrice);
    this.curve.push({ t: Date.now(), v: eq });
    if (this.curve.length > 720) this.curve.splice(0, this.curve.length - 720);
    this.peak = Math.max(this.peak, eq);
    const dd = ((eq - this.peak) / this.peak) * 100;
    if (dd < this.maxDD) this.maxDD = dd;
    return newFills;
  }

  /* ── strategy decisions on the just-closed bar (mirrors the .py bots) ── */
  private onBar(c: Candle[]) {
    const closes = c.map((x) => x.c);
    const price = closes[closes.length - 1];
    const barT = c[c.length - 1].t;

    switch (this.slug) {
      case "momo-cross": {
        if (closes.length < 24) return;
        const f = ema(closes, 9), s = ema(closes, 21);
        const i = closes.length - 1;
        const above = f[i] > s[i], abovePrev = f[i - 1] > s[i - 1];
        if (above && !abovePrev && this.side !== "LONG") {
          this.closeAll(price, barT, "reverse");
          this.open("LONG", price, barT, "EMA 9 crossed above 21");
        } else if (!above && abovePrev && this.side !== "SHORT") {
          this.closeAll(price, barT, "reverse");
          this.open("SHORT", price, barT, "EMA 9 crossed below 21");
        }
        break;
      }
      case "rubber-band": {
        if (closes.length < 20) return;
        const r = rsi(closes, 14);
        const v = r[r.length - 1];
        if (this.side === "LONG" && v >= 50) this.closeAll(price, barT, `RSI ${v.toFixed(0)} → midline`);
        else if (this.side === "SHORT" && v <= 50) this.closeAll(price, barT, `RSI ${v.toFixed(0)} → midline`);
        if (!this.side) {
          if (v < 30) this.open("LONG", price, barT, `RSI ${v.toFixed(0)} oversold`);
          else if (v > 70) this.open("SHORT", price, barT, `RSI ${v.toFixed(0)} overbought`);
        }
        break;
      }
      case "squeeze-rider": {
        const N = 20, K = 2.0, LOOKBACK = 60, PCTL = 0.25;
        if (closes.length < N + LOOKBACK + 2) return;
        const i = closes.length - 1;
        const m = sma(closes, N, i);
        const sd = stddev(closes, N, i, m);
        const upper = m + K * sd, lower = m - K * sd;
        const widths: number[] = [];
        for (let j = i - LOOKBACK + 1; j <= i; j++) {
          const mj = sma(closes, N, j);
          const sj = stddev(closes, N, j, mj);
          widths.push(mj ? (2 * K * sj) / mj : 0);
        }
        const cur = widths[widths.length - 1];
        const sortedW = widths.slice().sort((a, b) => a - b);
        if (cur <= sortedW[Math.floor(sortedW.length * PCTL)]) this.squeezed = true;
        if (this.side === "LONG" && price < m) this.closeAll(price, barT, "close under mid-band");
        else if (this.side === "SHORT" && price > m) this.closeAll(price, barT, "close over mid-band");
        if (!this.side && this.squeezed) {
          if (price > upper) { this.open("LONG", price, barT, "squeeze break ↑ upper band"); this.squeezed = false; }
          else if (price < lower) { this.open("SHORT", price, barT, "squeeze break ↓ lower band"); this.squeezed = false; }
        }
        break;
      }
      case "range-breaker": {
        const N = 20, ATR_N = 14, MULT = 2;
        if (c.length < N + ATR_N + 2) return;
        const i = c.length - 1;
        let hi = -Infinity, lo = Infinity;
        for (let j = i - N; j < i; j++) { hi = Math.max(hi, c[j].h); lo = Math.min(lo, c[j].l); }
        const a = atrAt(c, ATR_N, i);
        if (this.side === "LONG") {
          this.stop = Math.max(this.stop, price - MULT * a);
          if (price <= this.stop) this.closeAll(price, barT, "ATR trail stop");
        } else if (this.side === "SHORT") {
          this.stop = Math.min(this.stop, price + MULT * a);
          if (price >= this.stop) this.closeAll(price, barT, "ATR trail stop");
        }
        if (!this.side) {
          if (price > hi) { this.open("LONG", price, barT, "Donchian-20 break ↑"); this.stop = price - MULT * a; }
          else if (price < lo) { this.open("SHORT", price, barT, "Donchian-20 break ↓"); this.stop = price + MULT * a; }
        }
        break;
      }
    }
  }

  /* grid: tick-driven on the live price, rungs anchored at session start */
  private gridTick(px: number, barT: number) {
    const STEP = 0.004, RUNGS = 6;
    const lotUsd = this.cfg.startBalance * this.cfg.riskPct;
    if (this.anchor === null) { this.anchor = px; this.prevTick = px; return; }
    const prev = this.prevTick ?? px;
    for (let k = 1; k <= RUNGS; k++) {
      const rung = this.anchor * (1 - STEP * k);
      const target = this.anchor * (1 - STEP * (k - 1));
      if (!this.lots[k] && prev > rung && rung >= px) {
        const qty = (lotUsd * this.cfg.leverage) / rung;
        this.open("LONG", rung, barT, `grid buy rung ${k} (−${(STEP * k * 100).toFixed(1)}%)`, lotUsd);
        this.lots[k] = { qty, entry: rung };
      } else if (this.lots[k] && prev < target && target <= px) {
        this.closePart(this.lots[k].qty, target, barT, `grid sell rung ${k} (+${(STEP * 100).toFixed(1)}%)`);
        delete this.lots[k];
      }
    }
    this.prevTick = px;
  }
}

/** Sessions survive closing/reopening the modal (keyed per bot+market). */
const sessionStore = new Map<string, LiveSession>();

export function getOrCreateSession(slug: string, symbol: string, interval: string, reset = false): LiveSession {
  const key = `${slug}|${symbol}|${interval}`;
  let s = sessionStore.get(key);
  if (!s || reset) {
    s = new LiveSession(slug, symbol, interval);
    sessionStore.set(key, s);
  }
  return s;
}

export function dropSession(slug: string, symbol: string, interval: string): void {
  sessionStore.delete(`${slug}|${symbol}|${interval}`);
}

/** Fetch klines and split into { closed (oldest→newest), livePrice, formingT }. */
export async function fetchLiveWindow(symbol: string, interval: string, limit = 160): Promise<{
  closed: Candle[]; livePrice: number; formingT: number;
}> {
  const r = await fetch(`${GW}/markets/${symbol}/klines?interval=${interval}&limit=${limit}`);
  const j = await r.json();
  const raw: RawKline[] = j?.data ?? [];
  const all = raw
    .map((k) => ({ t: k.t, o: +k.o, h: +k.h, l: +k.l, c: +k.c }))
    .sort((a, b) => a.t - b.t);
  if (all.length < 3) throw new Error("not enough kline data");
  const forming = all[all.length - 1];
  return { closed: all.slice(0, -1), livePrice: forming.c, formingT: forming.t };
}

/* ─────────────────────────── funding scan (real rates) ─────────────────────────── */

export interface FundingTicker {
  symbol: string;
  rate: number; // per funding interval
  nextFundingTime: number;
  markPrice: number;
}

export interface FundingScan {
  all: FundingTicker[]; // sorted by |rate| desc
  qualifying: FundingTicker[]; // |rate| >= threshold
  best: FundingTicker | null;
  threshold: number;
  /** est. daily return % on the bot's $10k balance farming the best rate each tick */
  estDailyPct: number;
  fetchedAt: number;
}

export const FUNDING_THRESHOLD = 0.0003; // 0.03% per interval — same as funding-farmer.py
const FUNDING_NOTIONAL = 1_000; // $ per farm — same as funding-farmer.py
const TICKS_PER_DAY = 24; // SoDEX funding is hourly

export async function fetchFundingScan(): Promise<FundingScan> {
  const r = await fetch(`${GW}/markets/tickers`);
  const j = await r.json();
  interface RawTicker { symbol: string; fundingRate: string; nextFundingTime: number; markPrice: string }
  const all: FundingTicker[] = ((j?.data ?? []) as RawTicker[])
    .map((t) => ({ symbol: t.symbol, rate: parseFloat(t.fundingRate), nextFundingTime: t.nextFundingTime, markPrice: parseFloat(t.markPrice) }))
    .filter((t) => Number.isFinite(t.rate) && t.markPrice > 0)
    .sort((a, b) => Math.abs(b.rate) - Math.abs(a.rate));
  const qualifying = all.filter((t) => Math.abs(t.rate) >= FUNDING_THRESHOLD);
  const best = all[0] ?? null;
  // farming the best rate once per tick, fees both ways on $1k notional
  const fee2 = 2 * BOT_CONFIG["funding-farmer"].takerFee;
  const perTick = best ? FUNDING_NOTIONAL * (Math.abs(best.rate) - fee2) : 0;
  const estDailyPct = (perTick * TICKS_PER_DAY) / BOT_CONFIG["funding-farmer"].startBalance * 100;
  return { all, qualifying, best, threshold: FUNDING_THRESHOLD, estDailyPct, fetchedAt: Date.now() };
}

/* ─────────────────────────── data fetch ─────────────────────────── */

const GW = "https://mainnet-gw.sodex.dev/api/v1/perps";

interface RawKline { t: number; o: string; h: string; l: string; c: string }

/** Fetch klines and return CLOSED candles oldest→newest (SoDEX sends newest-first). */
export async function fetchClosedCandles(symbol: string, interval: string, limit = 300): Promise<Candle[]> {
  const r = await fetch(`${GW}/markets/${symbol}/klines?interval=${interval}&limit=${limit}`);
  const j = await r.json();
  const raw: RawKline[] = j?.data ?? [];
  const candles = raw
    .map((k) => ({ t: k.t, o: +k.o, h: +k.h, l: +k.l, c: +k.c }))
    .sort((a, b) => a.t - b.t);
  // the newest bar (last after sorting) is still forming — drop it
  return candles.slice(0, -1);
}

/** Human label for the span a candle window covers, e.g. "3d 2h" or "25h". */
export function windowLabel(candles: Candle[]): string {
  if (candles.length < 2) return "—";
  const ms = candles[candles.length - 1].t - candles[0].t;
  const h = Math.round(ms / 3_600_000);
  if (h < 48) return `${h}h`;
  const d = Math.floor(h / 24);
  return `${d}d ${h - d * 24}h`;
}
