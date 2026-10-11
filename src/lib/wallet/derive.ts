/**
 * Figures worked out in the browser from what api.ts reads: the trading
 * record behind a wallet's closed positions, its PnL by market, day by day,
 * and its net worth across everything it holds on SoDEX.
 */

import type { ChainWallet, ChartPoint, ClosedPosition, Markets, OpenPosition, SpotBalance, Wealth } from "@/lib/wallet/api";
import { coinPrice } from "@/lib/wallet/api";

/* ── Trading record ─────────────────────────────────────────────────────── */

export interface TradingRecord {
  /** How many closed positions the figures cover (SoDEX returns the latest 200). */
  count: number;
  winRate: number;
  avgWin: number;
  avgLoss: number;
  /** Gross wins over gross losses. Null with no losses. */
  profitFactor: number | null;
  best: ClosedPosition;
  worst: ClosedPosition;
  /** Median time from open to close, ms. */
  medianHold: number;
  avgLeverage: number;
  long: { count: number; pnl: number; winRate: number };
  short: { count: number; pnl: number; winRate: number };
  fees: number;
  funding: number;
  /** Most wins or losses in a row, by close time. */
  streak: { wins: number; losses: number };
}

export function tradingRecord(closed: ClosedPosition[]): TradingRecord | null {
  if (!closed.length) return null;
  const wins = closed.filter((p) => p.pnl > 0);
  const losses = closed.filter((p) => p.pnl < 0);
  const sum = (xs: ClosedPosition[]) => xs.reduce((a, p) => a + p.pnl, 0);
  const side = (long: boolean) => {
    const xs = closed.filter((p) => p.long === long);
    return { count: xs.length, pnl: sum(xs), winRate: xs.length ? xs.filter((p) => p.pnl > 0).length / xs.length : 0 };
  };
  const holds = closed.map((p) => Math.max(0, p.closedAt - p.openedAt)).sort((a, b) => a - b);
  let w = 0;
  let l = 0;
  const streak = { wins: 0, losses: 0 };
  for (const p of [...closed].sort((a, b) => a.closedAt - b.closedAt)) {
    if (p.pnl > 0) {
      w++;
      l = 0;
    } else if (p.pnl < 0) {
      l++;
      w = 0;
    }
    streak.wins = Math.max(streak.wins, w);
    streak.losses = Math.max(streak.losses, l);
  }
  const lossTotal = Math.abs(sum(losses));
  return {
    count: closed.length,
    winRate: wins.length / closed.length,
    avgWin: wins.length ? sum(wins) / wins.length : 0,
    avgLoss: losses.length ? sum(losses) / losses.length : 0,
    profitFactor: lossTotal > 0 ? sum(wins) / lossTotal : null,
    best: closed.reduce((a, p) => (p.pnl > a.pnl ? p : a)),
    worst: closed.reduce((a, p) => (p.pnl < a.pnl ? p : a)),
    medianHold: holds[Math.floor(holds.length / 2)],
    avgLeverage: closed.reduce((a, p) => a + p.leverage, 0) / closed.length,
    long: side(true),
    short: side(false),
    fees: closed.reduce((a, p) => a + p.fees, 0),
    funding: closed.reduce((a, p) => a + p.funding, 0),
    streak,
  };
}

/** Realised PnL per market across the closed positions, biggest move first. */
export function pnlByMarket(closed: ClosedPosition[]): { market: string; pnl: number; count: number }[] {
  const m = new Map<string, { pnl: number; count: number }>();
  for (const p of closed) {
    const e = m.get(p.market) ?? { pnl: 0, count: 0 };
    e.pnl += p.pnl;
    e.count++;
    m.set(p.market, e);
  }
  return [...m.entries()].map(([market, e]) => ({ market, ...e })).sort((a, b) => Math.abs(b.pnl) - Math.abs(a.pnl));
}

/* ── Day by day ─────────────────────────────────────────────────────────── */

export interface DayPnl {
  day: string;
  pnl: number;
}

/**
 * The chart is cumulative, so each day is the change since the point before.
 * The first point has nothing before it and is left out rather than counting
 * the whole history as one day.
 */
export function dailyPnl(chart: ChartPoint[]): DayPnl[] {
  const out: DayPnl[] = [];
  for (let i = 1; i < chart.length; i++) {
    out.push({ day: new Date(chart[i].t).toISOString().slice(0, 10), pnl: chart[i].pnl - chart[i - 1].pnl });
  }
  return out;
}

/* ── Positions ──────────────────────────────────────────────────────────── */

/** How far price must move against a position to liquidate it, as a fraction. Null without a mark or liquidation price. */
export function liqDistance(p: OpenPosition, mark: number | undefined): number | null {
  if (!p.liq || !mark) return null;
  return p.long ? (mark - p.liq) / mark : (p.liq - mark) / mark;
}

/* ── Net worth ──────────────────────────────────────────────────────────── */

export interface HoldingRow {
  coin: string;
  amount: number;
  locked: number;
  price: number | null;
  value: number | null;
  staked?: boolean;
}

/** Spot balances worth showing, with staked SOSO. Wealth fund shares are left to the Wealth card, which values them. */
/**
 * What the wallet holds on ValueChain itself, priced off SoDEX's spot market.
 * Wealth fund shares (counted under Wealth) and sSOSO (under Staked) are left
 * out; a token with no SoDEX market shows without a value.
 */
export function chainRows(chain: ChainWallet, m: Markets): HoldingRow[] {
  const skip = (symbol: string) => m.funds.has(symbol) || symbol === "sSOSO";
  const price = (symbol: string) => coinPrice(symbol, m) ?? coinPrice(symbol.replace(/^vs/, "v"), m);
  const rows: HoldingRow[] = chain.tokens
    .filter((t) => !skip(t.symbol))
    .map((t) => {
      const p = price(t.symbol);
      return { coin: t.symbol, amount: t.amount, locked: 0, price: p, value: p == null ? null : p * t.amount };
    });
  if (chain.native > 0) {
    const p = coinPrice("WSOSO", m);
    rows.unshift({ coin: "SOSO", amount: chain.native, locked: 0, price: p, value: p == null ? null : p * chain.native });
  }
  return rows.filter((r) => (r.value ?? 1) >= 0.01).sort((a, b) => (b.value ?? -1) - (a.value ?? -1));
}

export function holdingRows(balances: SpotBalance[], staked: number, m: Markets): HoldingRow[] {
  const rows: HoldingRow[] = balances.filter((b) => !m.funds.has(b.coin)).map((b) => {
    const price = coinPrice(b.coin, m);
    return { coin: b.coin, amount: b.total, locked: b.locked, price, value: price == null ? null : price * b.total };
  });
  if (staked > 0) {
    // sSOSO tracks WSOSO one to one.
    const price = coinPrice("WSOSO", m);
    rows.push({ coin: "sSOSO", amount: staked, locked: 0, price, value: price == null ? null : price * staked, staked: true });
  }
  return rows.filter((r) => (r.value ?? 1) >= 0.01).sort((a, b) => (b.value ?? -1) - (a.value ?? -1));
}

export interface NetWorthPart {
  key: "perps" | "spot" | "staked" | "wealth" | "chain";
  label: string;
  /** Null while it's still loading. */
  value: number | null;
}

/** Everything the wallet holds on SoDEX, each dollar counted once. Null parts are still loading. */
export function netWorth(parts: { perps: number | null; spot: number | null; staked: number | null; wealth: number | null; chain: number | null }): {
  total: number;
  parts: NetWorthPart[];
  complete: boolean;
} {
  const list: NetWorthPart[] = [
    { key: "perps", label: "Perps account", value: parts.perps },
    { key: "spot", label: "Spot", value: parts.spot },
    { key: "staked", label: "Staked SOSO", value: parts.staked },
    { key: "wealth", label: "Wealth", value: parts.wealth },
    { key: "chain", label: "ValueChain wallet", value: parts.chain },
  ];
  return {
    total: list.reduce((a, p) => a + Math.max(0, p.value ?? 0), 0),
    parts: list,
    complete: list.every((p) => p.value != null),
  };
}

/* ── Wealth ─────────────────────────────────────────────────────────────── */

const NO_WEALTH: Wealth = { shares: [], pnlByFund: new Map(), inFlight: 0, realized: 0, pnl: 0, pnl24h: 0, pendingOrders: 0 };

/** The wallet's Wealth, once balances and fund prices are in. Without the Wealth API, shares in spot are still found. */
export function walletWealth(wealth: Wealth | null, wealthFailed: boolean, balances: SpotBalance[] | null, m: Markets | null) {
  if (!balances || !m || (!wealth && !wealthFailed)) return null;
  return wealthHoldings(wealth ?? NO_WEALTH, balances, m);
}

export interface WealthHolding {
  fundId: string;
  name: string;
  shares: number;
  price: number | null;
  value: number;
  /** Dollars of this fund held as shares in the spot account (the spot balance counts them too). */
  inSpot: number;
  inPerps: number;
  pnl: number | null;
  pnl24h: number | null;
}

/**
 * Every Wealth product this wallet holds, valued the way SoDEX's own Wealth
 * page does: shares (the ledger, or the spot balance if that's larger) times
 * the fund's price. That covers USDC Earn, whose shares (vsoUSDC) sit in the
 * spot account and which SoDEX's PnL figures leave out.
 */
export function wealthHoldings(w: Wealth, balances: SpotBalance[], m: Markets): { holdings: WealthHolding[]; total: number; inSpot: number; inPerps: number } {
  const spotOf = new Map(balances.map((b) => [b.coin, b.total]));
  const byFund = new Map(w.shares.map((s) => [s.fundId, s]));
  const holdings: WealthHolding[] = [];
  for (const f of m.funds.values()) {
    const s = byFund.get(f.fundId);
    const inSpotShares = Math.max(s?.spot ?? 0, spotOf.get(f.coin) ?? 0);
    const perp = s?.perp ?? 0;
    const shares = Math.max(s?.ledger ?? 0, inSpotShares + perp + (s?.evm ?? 0));
    if (shares <= 0) continue;
    // SoDEX's own fund price first, as its Wealth page values them; the order book only when it has none.
    const price = f.price ?? coinPrice(f.coin, m);
    const value = shares * (price ?? 0);
    const p = w.pnlByFund.get(f.fundId);
    holdings.push({
      fundId: f.fundId,
      name: s?.name || f.name,
      shares,
      price,
      value,
      inSpot: inSpotShares * (price ?? 0),
      inPerps: perp * (price ?? 0),
      pnl: p?.pnl ?? null,
      pnl24h: p?.pnl24h ?? null,
    });
  }
  holdings.sort((a, b) => b.value - a.value);
  const kept = holdings.filter((h) => h.value >= 0.01);
  return {
    holdings: kept,
    total: kept.reduce((a, h) => a + h.value, 0) + w.inFlight,
    inSpot: kept.reduce((a, h) => a + h.inSpot, 0),
    inPerps: kept.reduce((a, h) => a + h.inPerps, 0),
  };
}
