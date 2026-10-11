import { db } from "@/lib/liveStore";
import { nickname } from "@/lib/nickname";

/**
 * Open positions across SoDEX, from the collector's snapshots, valued at live
 * mark prices: unrealised PnL, bias and distance to liquidation are worked
 * out here on every request, so price moves never need a re-read.
 *
 * Privacy: no address or account ID leaves this module. Individual positions
 * are shown under a nickname derived from the account ID.
 */

const GW = "https://mainnet-gw.sodex.dev/api/v1";

/* ── Groups ─────────────────────────────────────────────────────────────── */

export type SizeGroup = "shrimp" | "fish" | "dolphin" | "shark" | "whale" | "leviathan";
export type RecordGroup = "heavy-loss" | "losing" | "even" | "profitable" | "very-profitable" | "top-earner";

/** By equity: what the account holds. */
export const SIZE_GROUPS: { key: SizeGroup; label: string; rule: string; min: number }[] = [
  { key: "leviathan", label: "Leviathan", rule: "$1M+ equity", min: 1_000_000 },
  { key: "whale", label: "Whale", rule: "$250K–1M", min: 250_000 },
  { key: "shark", label: "Shark", rule: "$50K–250K", min: 50_000 },
  { key: "dolphin", label: "Dolphin", rule: "$10K–50K", min: 10_000 },
  { key: "fish", label: "Fish", rule: "$1K–10K", min: 1_000 },
  { key: "shrimp", label: "Shrimp", rule: "Under $1K", min: -Infinity },
];

/** By all-time PnL: how the account has done. */
export const RECORD_GROUPS: { key: RecordGroup; label: string; rule: string; min: number }[] = [
  { key: "top-earner", label: "Top earners", rule: "+$1M or more all time", min: 1_000_000 },
  { key: "very-profitable", label: "Very profitable", rule: "+$100K to +$1M", min: 100_000 },
  { key: "profitable", label: "Profitable", rule: "+$1K to +$100K", min: 1_000 },
  { key: "even", label: "About even", rule: "Within $1K", min: -1_000 },
  { key: "losing", label: "Losing", rule: "−$1K to −$100K", min: -100_000 },
  { key: "heavy-loss", label: "Heavy losses", rule: "−$100K or worse", min: -Infinity },
];

export const sizeOf = (equity: number | null): SizeGroup => SIZE_GROUPS.find((g) => (equity ?? 0) >= g.min)!.key;
export const recordOf = (pnl: number | null): RecordGroup | null => (pnl == null ? null : RECORD_GROUPS.find((g) => pnl >= g.min)!.key);

/* ── Live marks ─────────────────────────────────────────────────────────── */

interface Ticker {
  symbol: string;
  markPrice: string;
  openInterest: string;
}
let marksCache: { at: number; marks: Map<string, number>; oiUsd: number; oiByMarket: Map<string, number> } | null = null;

export async function liveMarks(): Promise<{ marks: Map<string, number>; oiUsd: number; oiByMarket: Map<string, number> }> {
  if (marksCache && Date.now() - marksCache.at < 30_000) return marksCache;

  // The collector records every perp's mark and open interest each minute.
  // When that's fresh, use it: no request to SoDEX at all.
  const d = db();
  const hasTickers = d ? !!d.prepare("SELECT 1 FROM sqlite_schema WHERE type = 'table' AND name = 'ticker_minute'").get() : false;
  if (d && hasTickers) {
    const latest = d.prepare("SELECT MAX(minute) m FROM ticker_minute").get() as { m: number | null } | undefined;
    if (latest?.m && Date.now() - latest.m < 3 * 60_000) {
      const rows = d.prepare("SELECT market, mark, oi FROM ticker_minute WHERE minute = ?").all(latest.m) as { market: string; mark: number | null; oi: number | null }[];
      const marks = new Map<string, number>();
      const oiByMarket = new Map<string, number>();
      let oiUsd = 0;
      for (const r of rows) {
        if (!(r.mark && r.mark > 0)) continue;
        marks.set(r.market, r.mark);
        oiByMarket.set(r.market, r.oi ?? 0);
        oiUsd += r.oi ?? 0;
      }
      if (marks.size) {
        marksCache = { at: Date.now(), marks, oiUsd, oiByMarket };
        return marksCache;
      }
    }
  }

  let json: { data?: Ticker[] };
  try {
    const res = await fetch(`${GW}/perps/markets/tickers`, { cache: "no-store", signal: AbortSignal.timeout(8_000) });
    json = (await res.json()) as { data?: Ticker[] };
    if (!Array.isArray(json.data)) throw new Error("no tickers");
  } catch (err) {
    // SoDEX unreachable (maintenance): keep valuing at the last prices we have
    // rather than failing every view that needs a price.
    if (marksCache) return marksCache;
    const stale = d && hasTickers ? (d.prepare("SELECT market, mark, oi FROM ticker_minute WHERE minute = (SELECT MAX(minute) FROM ticker_minute)").all() as { market: string; mark: number | null; oi: number | null }[]) : [];
    if (!stale.length) throw err;
    const marks = new Map<string, number>();
    const oiByMarket = new Map<string, number>();
    let oiUsd = 0;
    for (const r of stale) {
      if (!(r.mark && r.mark > 0)) continue;
      marks.set(r.market, r.mark);
      oiByMarket.set(r.market, r.oi ?? 0);
      oiUsd += r.oi ?? 0;
    }
    return { marks, oiUsd, oiByMarket };
  }
  const marks = new Map<string, number>();
  const oiByMarket = new Map<string, number>();
  let oiUsd = 0;
  for (const t of json.data ?? []) {
    const m = Number(t.markPrice);
    if (m > 0) {
      marks.set(t.symbol, m);
      const oi = (Number(t.openInterest) || 0) * m;
      oiByMarket.set(t.symbol, oi);
      oiUsd += oi;
    }
  }
  marksCache = { at: Date.now(), marks, oiUsd, oiByMarket };
  return marksCache;
}

/* ── Shapes ─────────────────────────────────────────────────────────────── */

export interface GroupStat {
  key: string;
  label: string;
  rule: string;
  /** Accounts in the group that hold a position. */
  holders: number;
  /** Accounts known in the group, holding or not. */
  known: number;
  longUsd: number;
  shortUsd: number;
  /** (long − short) ÷ (long + short), −1 to 1. */
  bias: number | null;
  /** Notional-weighted leverage. */
  leverage: number | null;
  /** Share of the group's positions in profit right now. */
  inProfit: number | null;
  upnl: number;
}

export interface HeatCell {
  market: string;
  group: SizeGroup;
  longUsd: number;
  shortUsd: number;
  bias: number | null;
}

export interface RiskRow {
  name: string;
  group: SizeGroup;
  market: string;
  side: "LONG" | "SHORT";
  notional: number;
  entry: number;
  mark: number;
  liq: number;
  leverage: number | null;
  /** How far price must move against the position to reach liquidation, as a fraction. */
  distance: number;
  upnl: number;
}

export interface LiqBucket {
  /** Bucket centre price. */
  price: number;
  /** Long positions liquidated if price falls here. */
  longUsd: number;
  /** Short positions liquidated if price rises here. */
  shortUsd: number;
}

/** Accounts with this much equity or more count as whales here (the Whale and Leviathan groups). */
export const WHALE_MIN_EQUITY = 250_000;

export interface MarketPositioning {
  market: string;
  longUsd: number;
  shortUsd: number;
  whaleLongUsd: number;
  whaleShortUsd: number;
  holders: number;
}

export interface PositionsOverview {
  available: true;
  asOf: number;
  coverage: {
    holders: number;
    positions: number;
    /** Accounts whose overview has been checked for open positions, of all traders known. */
    swept: number;
    traders: number;
    lastSnapshot: number | null;
    /** Tracked notional ÷ SoDEX's open interest (both sides counted once). */
    oiShare: number | null;
  };
  totals: {
    longUsd: number;
    shortUsd: number;
    bias: number | null;
    inProfit: number | null;
    upnl: number;
    /** Notional ÷ equity across holders. */
    exposure: number | null;
    leverage: number | null;
  };
  bySize: GroupStat[];
  byRecord: GroupStat[];
  /**
   * `markets` ranks by trading volume (the default view); `byOpen` by
   * open-position size. Cells and buckets cover both lists, so a page can
   * switch between them without another request.
   */
  heatmap: { markets: string[]; byOpen?: string[]; cells: HeatCell[] };
  liquidation: { markets: string[]; byOpen?: string[]; byMarket: Record<string, { mark: number; buckets: LiqBucket[] }> };
  atRisk: RiskRow[];
  markets: MarketPositioning[];
}

export type PositionsResult = PositionsOverview | { available: false; reason: string };

/* ── Build ──────────────────────────────────────────────────────────────── */

interface Row {
  account_id: number;
  market: string;
  size: number;
  entry: number;
  leverage: number | null;
  liq_price: number | null;
  equity: number | null;
  alltime_pnl: number | null;
}

/** Liquidation prices within ±12.5% of the mark, summed in 0.5% steps, highest price first. */
function bucketsAround(rows: { size: number; liq_price: number | null }[], mark: number): LiqBucket[] {
  const step = mark * 0.005;
  const buckets = new Map<number, LiqBucket>();
  for (const r of rows) {
    if (!r.liq_price || Math.abs(r.liq_price - mark) / mark > 0.125) continue;
    const k = Math.round((r.liq_price - mark) / step);
    const b = buckets.get(k) ?? { price: mark + k * step, longUsd: 0, shortUsd: 0 };
    const notional = Math.abs(r.size) * mark;
    if (r.size > 0) b.longUsd += notional;
    else b.shortUsd += notional;
    buckets.set(k, b);
  }
  return [...buckets.values()].sort((a, b) => b.price - a.price);
}

const biasOf = (l: number, s: number) => (l + s > 0 ? (l - s) / (l + s) : null);

export async function positionsOverview(): Promise<PositionsResult> {
  const d = db();
  if (!d) return { available: false, reason: "The collector isn't running here yet." };
  const has = d.prepare("SELECT 1 FROM sqlite_schema WHERE type = 'table' AND name = 'open_positions'").get();
  if (!has) return { available: false, reason: "The collector hasn't started reading positions yet." };

  const rows = d
    .prepare(`
      SELECT p.account_id, p.market, p.size, p.entry, p.leverage, p.liq_price, a.equity, a.alltime_pnl
      FROM open_positions p JOIN pos_accounts a ON a.account_id = p.account_id`)
    .all() as unknown as Row[];
  if (!rows.length) return { available: false, reason: "No open positions have been read yet." };

  const meta = d
    .prepare("SELECT COUNT(*) traders, COUNT(swept_at) swept, SUM(holds) holders, MAX(snapshot_at) last FROM pos_accounts")
    .get() as { traders: number; swept: number; holders: number | null; last: number | null };
  const knownBySize = new Map<string, number>();
  for (const r of d.prepare("SELECT equity FROM pos_accounts WHERE equity IS NOT NULL").all() as { equity: number }[]) {
    const g = sizeOf(r.equity);
    knownBySize.set(g, (knownBySize.get(g) ?? 0) + 1);
  }
  const knownByRecord = new Map<string, number>();
  for (const r of d.prepare("SELECT alltime_pnl p FROM pos_accounts WHERE alltime_pnl IS NOT NULL").all() as { p: number }[]) {
    const g = recordOf(r.p)!;
    knownByRecord.set(g, (knownByRecord.get(g) ?? 0) + 1);
  }

  const { marks, oiUsd } = await liveMarks();

  type Acc = { holders: Set<number>; long: number; short: number; levW: number; n: number; profit: number; upnl: number };
  const blank = (): Acc => ({ holders: new Set(), long: 0, short: 0, levW: 0, n: 0, profit: 0, upnl: 0 });
  const size = new Map<string, Acc>();
  const record = new Map<string, Acc>();
  const total = blank();
  const heat = new Map<string, { long: number; short: number }>();
  const marketNotional = new Map<string, number>();
  const risk: RiskRow[] = [];
  const equityOfHolders = new Map<number, number>();
  const perMarket = new Map<string, MarketPositioning & { ids: Set<number> }>();

  for (const r of rows) {
    const mark = marks.get(r.market) ?? r.entry;
    const notional = Math.abs(r.size) * mark;
    if (!(notional > 0)) continue;
    const long = r.size > 0;
    const upnl = r.size * (mark - r.entry);
    const sg = sizeOf(r.equity);
    const rg = recordOf(r.alltime_pnl);
    equityOfHolders.set(r.account_id, r.equity ?? 0);

    for (const acc of [total, ensure(size, sg), rg ? ensure(record, rg) : null]) {
      if (!acc) continue;
      acc.holders.add(r.account_id);
      if (long) acc.long += notional;
      else acc.short += notional;
      if (r.leverage) acc.levW += r.leverage * notional;
      acc.n++;
      if (upnl > 0) acc.profit++;
      acc.upnl += upnl;
    }
    const hk = `${r.market}|${sg}`;
    const h = heat.get(hk) ?? { long: 0, short: 0 };
    if (long) h.long += notional;
    else h.short += notional;
    heat.set(hk, h);
    marketNotional.set(r.market, (marketNotional.get(r.market) ?? 0) + notional);
    const pm = perMarket.get(r.market) ?? { market: r.market, longUsd: 0, shortUsd: 0, whaleLongUsd: 0, whaleShortUsd: 0, holders: 0, ids: new Set<number>() };
    const whale = (r.equity ?? 0) >= WHALE_MIN_EQUITY;
    if (long) {
      pm.longUsd += notional;
      if (whale) pm.whaleLongUsd += notional;
    } else {
      pm.shortUsd += notional;
      if (whale) pm.whaleShortUsd += notional;
    }
    pm.ids.add(r.account_id);
    perMarket.set(r.market, pm);

    if (r.liq_price && r.liq_price > 0) {
      const distance = long ? (mark - r.liq_price) / mark : (r.liq_price - mark) / mark;
      if (distance >= 0 && distance <= 0.1 && notional >= 10_000) {
        risk.push({
          name: nickname(r.account_id),
          group: sg,
          market: r.market,
          side: long ? "LONG" : "SHORT",
          notional,
          entry: r.entry,
          mark,
          liq: r.liq_price,
          leverage: r.leverage,
          distance,
          upnl,
        });
      }
    }
  }

  function ensure(m: Map<string, Acc>, k: string) {
    let a = m.get(k);
    if (!a) m.set(k, (a = blank()));
    return a;
  }
  const stat = (acc: Acc | undefined, g: { key: string; label: string; rule: string }, known: number): GroupStat => ({
    key: g.key,
    label: g.label,
    rule: g.rule,
    holders: acc?.holders.size ?? 0,
    known,
    longUsd: acc?.long ?? 0,
    shortUsd: acc?.short ?? 0,
    bias: acc ? biasOf(acc.long, acc.short) : null,
    leverage: acc && acc.long + acc.short > 0 ? acc.levW / (acc.long + acc.short) : null,
    inProfit: acc && acc.n ? acc.profit / acc.n : null,
    upnl: acc?.upnl ?? 0,
  });

  const topMarkets = [...marketNotional.entries()].sort((a, b) => b[1] - a[1]).map(([m]) => m);
  // Markets in the order people watch them: the most-traded of the last day
  // that anyone holds positions in, topped up by open-position size.
  let traded: string[] = [];
  try {
    traded = (
      d.prepare("SELECT market FROM flow_minute WHERE minute >= ? GROUP BY market ORDER BY SUM(bought_usd) DESC").all(Date.now() - 24 * 3_600_000) as {
        market: string;
      }[]
    ).map((r) => r.market);
  } catch {
    /* no trade history yet: open-position size alone */
  }
  const held = new Set(topMarkets);
  const byVolume = traded.filter((m) => held.has(m));
  const ranked = [...byVolume, ...topMarkets.filter((m) => !byVolume.includes(m))];
  const heatMarkets = ranked.slice(0, 10);
  const heatByOpen = topMarkets.slice(0, 10);
  const cells: HeatCell[] = [];
  for (const m of new Set([...heatMarkets, ...heatByOpen])) {
    for (const g of SIZE_GROUPS) {
      const h = heat.get(`${m}|${g.key}`);
      if (h) cells.push({ market: m, group: g.key, longUsd: h.long, shortUsd: h.short, bias: biasOf(h.long, h.short) });
    }
  }

  // Liquidation clusters within ±12.5% of price, in 0.5% steps.
  const liqMarkets = ranked.slice(0, 6);
  const liqByOpen = topMarkets.slice(0, 6);
  const byMarket: PositionsOverview["liquidation"]["byMarket"] = {};
  for (const m of new Set([...liqMarkets, ...liqByOpen])) {
    const mark = marks.get(m);
    if (!mark) continue;
    byMarket[m] = { mark, buckets: bucketsAround(rows.filter((r) => r.market === m), mark) };
  }

  const equity = [...equityOfHolders.values()].reduce((a, b) => a + Math.max(0, b), 0);
  const tracked = total.long + total.short;

  return {
    available: true,
    asOf: Date.now(),
    coverage: {
      holders: total.holders.size,
      positions: total.n,
      swept: meta.swept,
      traders: meta.traders,
      lastSnapshot: meta.last,
      // Each position is one side of the market; SoDEX's open interest counts one side.
      oiShare: oiUsd > 0 ? tracked / 2 / oiUsd : null,
    },
    totals: {
      longUsd: total.long,
      shortUsd: total.short,
      bias: biasOf(total.long, total.short),
      inProfit: total.n ? total.profit / total.n : null,
      upnl: total.upnl,
      exposure: equity > 0 ? tracked / equity : null,
      leverage: tracked > 0 ? total.levW / tracked : null,
    },
    bySize: SIZE_GROUPS.map((g) => stat(size.get(g.key), g, knownBySize.get(g.key) ?? 0)),
    byRecord: RECORD_GROUPS.map((g) => stat(record.get(g.key), g, knownByRecord.get(g.key) ?? 0)),
    heatmap: { markets: heatMarkets, byOpen: heatByOpen, cells },
    liquidation: { markets: liqMarkets.filter((m) => byMarket[m]), byOpen: liqByOpen.filter((m) => byMarket[m]), byMarket },
    atRisk: risk.sort((a, b) => a.distance - b.distance || b.notional - a.notional).slice(0, 25),
    markets: [...perMarket.values()].map(({ ids, ...m }) => ({ ...m, holders: ids.size })),
  };
}

/* ── One market ─────────────────────────────────────────────────────────── */

export interface MarketPositions {
  available: true;
  market: string;
  mark: number | null;
  holders: number;
  longUsd: number;
  shortUsd: number;
  bias: number | null;
  leverage: number | null;
  inProfit: number | null;
  bySize: { key: string; label: string; longUsd: number; shortUsd: number; holders: number; bias: number | null }[];
  byRecord: { key: string; label: string; longUsd: number; shortUsd: number; holders: number; bias: number | null }[];
  liquidation: LiqBucket[];
  largest: { name: string; group: string; side: "LONG" | "SHORT"; notional: number; leverage: number | null; upnl: number }[];
  /** This market's tracked positions as a share of its open interest (one side). */
  oiShare: number | null;
}

/** Everyone positioned in one market, valued at the live mark. */
export async function marketPositions(market: string): Promise<MarketPositions | { available: false; reason: string }> {
  const d = db();
  if (!d) return { available: false, reason: "The collector isn't running here yet." };
  const hasTable = d.prepare("SELECT 1 FROM sqlite_schema WHERE type = 'table' AND name = 'open_positions'").get();
  if (!hasTable) return { available: false, reason: "The collector hasn't started reading positions yet." };
  const rows = d
    .prepare(`
      SELECT p.account_id, p.market, p.size, p.entry, p.leverage, p.liq_price, a.equity, a.alltime_pnl
      FROM open_positions p JOIN pos_accounts a ON a.account_id = p.account_id WHERE p.market = ?`)
    .all(market) as unknown as Row[];
  if (!rows.length) return { available: false, reason: `No open ${market} positions tracked yet.` };

  const { marks, oiByMarket } = await liveMarks();
  const mark = marks.get(market) ?? null;
  const oiUsd = oiByMarket.get(market) ?? null;

  type G = { long: number; short: number; ids: Set<number> };
  const size = new Map<string, G>();
  const record = new Map<string, G>();
  let long = 0;
  let short = 0;
  let levW = 0;
  let profit = 0;
  const largest: MarketPositions["largest"] = [];
  for (const r of rows) {
    const m = mark ?? r.entry;
    const notional = Math.abs(r.size) * m;
    const upnl = r.size * (m - r.entry);
    const isLong = r.size > 0;
    if (isLong) long += notional;
    else short += notional;
    if (r.leverage) levW += r.leverage * notional;
    if (upnl > 0) profit++;
    for (const [map, key] of [
      [size, sizeOf(r.equity)],
      [record, recordOf(r.alltime_pnl)],
    ] as const) {
      if (!key) continue;
      const g = map.get(key) ?? { long: 0, short: 0, ids: new Set<number>() };
      if (isLong) g.long += notional;
      else g.short += notional;
      g.ids.add(r.account_id);
      map.set(key, g);
    }
    largest.push({
      name: nickname(r.account_id),
      group: r.equity == null ? "Size not read yet" : SIZE_GROUPS.find((x) => x.key === sizeOf(r.equity))!.label,
      side: isLong ? "LONG" : "SHORT",
      notional,
      leverage: r.leverage,
      upnl,
    });
  }
  const groups = (defs: { key: string; label: string }[], map: Map<string, G>) =>
    defs
      .map((g) => {
        const x = map.get(g.key);
        return { key: g.key, label: g.label, longUsd: x?.long ?? 0, shortUsd: x?.short ?? 0, holders: x?.ids.size ?? 0, bias: x ? biasOf(x.long, x.short) : null };
      })
      .filter((g) => g.holders > 0);

  return {
    available: true,
    market,
    mark,
    holders: new Set(rows.map((r) => r.account_id)).size,
    longUsd: long,
    shortUsd: short,
    bias: biasOf(long, short),
    leverage: long + short > 0 ? levW / (long + short) : null,
    inProfit: rows.length ? profit / rows.length : null,
    bySize: groups(SIZE_GROUPS, size),
    byRecord: groups(RECORD_GROUPS, record),
    liquidation: mark ? bucketsAround(rows, mark) : [],
    largest: largest.sort((a, b) => b.notional - a.notional).slice(0, 5),
    oiShare: oiUsd ? (long + short) / 2 / oiUsd : null,
  };
}
