/**
 * Server-side SoSoValue OpenAPI client.
 *
 * IMPORTANT: This module is server-only. It reads SOSOVALUE_API_KEY and sends it
 * in the `x-soso-api-key` header, so it must never be imported into a Client
 * Component. Surface its data through the `/api/sosovalue/*` route handlers.
 *
 * Base host note: the current GitBook docs advertise `openapi.sosovalue.com`,
 * but that host does not recognise legacy keys — the live, key-compatible host
 * is `api.sosovalue.xyz`. Overridable via SOSOVALUE_API_BASE if they ever
 * consolidate onto the `.com` host.
 */

import { getTokenIcon } from "@/lib/tokenIcons";
import { getCached } from "@/lib/serverCache";

const BASE = process.env.SOSOVALUE_API_BASE || "https://api.sosovalue.xyz/openapi/v1";
const API_KEY = process.env.SOSOVALUE_API_KEY;

/** SoSoValue envelope — identical shape to SoDEX's (`code === 0` on success). */
interface SosoEnvelope<T> {
  code: number;
  message: string;
  data: T;
}

class SosoError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = "SosoError";
  }
}

/** Raw network call to SoSoValue — unwraps `data`, throws on error. */
async function networkFetch<T>(path: string, revalidate: number): Promise<T> {
  if (!API_KEY) {
    throw new SosoError("SOSOVALUE_API_KEY is not set", 500);
  }

  const res = await fetch(`${BASE}${path}`, {
    headers: { "x-soso-api-key": API_KEY },
    // Second-layer cache for serverless prod, where the disk cache can't persist.
    next: { revalidate },
  });

  if (res.status === 401) {
    throw new SosoError("SoSoValue rejected the API key (401)", 502);
  }
  if (!res.ok) {
    throw new SosoError(`SoSoValue upstream error (${res.status})`, 502);
  }

  const json = (await res.json()) as SosoEnvelope<T>;
  if (json.code !== 0) {
    throw new SosoError(json.message || `SoSoValue error code ${json.code}`, 502);
  }
  return json.data;
}

/**
 * Fetch a SoSoValue endpoint and unwrap `data`, served through the persistent
 * memory→disk cache so the same request never hits the API more than once per
 * TTL (survives dev restarts). The API caps at 20 req/min and 100k req/month,
 * so every read must be cached.
 */
function sosoFetch<T>(path: string, ttlSeconds: number): Promise<T> {
  return getCached<T>(`soso:${path}`, ttlSeconds, () => networkFetch<T>(path, ttlSeconds));
}

/* ────────────────────────────── Cache windows ─────────────────────────────
 * DECISION: SoSoValue is refreshed on a ~12h cadence (2 pulls/day) — the same
 * cadence the future Supabase job will run. Every UI surface must therefore
 * tolerate 12h-stale SoSoValue data; anything that can't (live price
 * comparisons, intraday market status) has been removed by design. The disk
 * cache persists across dev restarts, so the API is hit at most once per
 * window per endpoint.                                                       */
const TTL = {
  currencies: 24 * 60 * 60, // reference data — 24h
  constituents: 12 * 60 * 60, // index rebalances are slow — 12h
  snapshot: 12 * 60 * 60, // levels/ROI/valuation — 12h cadence
  daily: 12 * 60 * 60, // ETF flows / macro calendar / klines — 12h cadence
} as const;

/* ───────────────────────────── Index mapping ──────────────────────────────
 * SoDEX tokenises a handful of SoSoValue sector indices as spot products.
 * SoDEX names them `MAG7.ssi` / `DEFI.ssi` / `MEME.ssi` (base coin, lowercased
 * by `baseSymbol()` → `mag7` / `defi` / `meme`); SoSoValue's tickers are
 * PascalCased. USSI (the flagship US Spot Index) is a SoDEX product but is NOT
 * exposed by SoSoValue's `/indices` endpoint, so it has no mapping here.        */
export const SODEX_INDEX_TICKERS = ["ssiMAG7", "ssiDeFi", "ssiMeme"] as const;

const SODEX_BASE_TO_SOSO: Record<string, string> = {
  mag7: "ssiMAG7",
  defi: "ssiDeFi",
  meme: "ssiMeme",
};

/** Map a SoDEX base symbol (e.g. "mag7") to a SoSoValue index ticker, or null. */
export function sodexBaseToIndexTicker(base: string): string | null {
  return SODEX_BASE_TO_SOSO[base.toLowerCase()] ?? null;
}

/* ──────────────────────────────── Types ───────────────────────────────── */
export interface IndexSnapshot {
  price: number;
  change_pct_24h: number;
  roi_7d: number;
  roi_1m: number;
  roi_3m: number;
  roi_1y: number;
  ytd: number;
}

interface RawConstituent {
  currency_id: string;
  symbol: string;
  weight: number;
}

export interface Constituent {
  currencyId: string;
  ticker: string; // clean uppercase ticker, e.g. "BTC"
  name: string; // display name, e.g. "Bitcoin"
  weight: number; // 0..1
  icon: string | null;
  price: number | null; // live USD price
  change24h: number | null; // fraction, e.g. -0.0062
  contribution: number | null; // weight * change24h — approx share of the index's 24h move
}

interface CurrencySnapshotRaw {
  price: number;
  change_pct_24h: number;
  marketcap: number;
  marketcap_rank: number;
}

interface RawCurrency {
  currency_id: string;
  symbol: string;
  name: string;
}

/* ─────────────────────────────── Requests ─────────────────────────────── */

/** List of SoSoValue index tickers (bare array of strings). */
export function getIndexList(): Promise<string[]> {
  return sosoFetch<string[]>("/indices", TTL.snapshot);
}

export function getIndexSnapshot(ticker: string): Promise<IndexSnapshot> {
  return sosoFetch<IndexSnapshot>(
    `/indices/${encodeURIComponent(ticker)}/market-snapshot`,
    TTL.snapshot,
  );
}

export interface IndexOverviewItem {
  ticker: string;
  tradeableOnSodex: boolean;
  snapshot: IndexSnapshot | null;
}

/**
 * Every SoSoValue index with its snapshot, flagged for whether SoDEX tokenises
 * it. A failed snapshot degrades to `null` rather than sinking the whole list.
 */
export async function getIndexOverview(): Promise<IndexOverviewItem[]> {
  const tickers = await getIndexList();
  const tradeable = new Set<string>(SODEX_INDEX_TICKERS);
  return Promise.all(
    tickers.map(async (ticker) => {
      let snapshot: IndexSnapshot | null = null;
      try {
        snapshot = await getIndexSnapshot(ticker);
      } catch {
        /* keep the index in the list even if its snapshot is unavailable */
      }
      return { ticker, tradeableOnSodex: tradeable.has(ticker), snapshot };
    }),
  );
}

/** currency_id → { symbol, name }. Cached 1h; used to resolve constituents. */
async function getCurrencyMap(): Promise<Map<string, RawCurrency>> {
  const list = await sosoFetch<RawCurrency[]>("/currencies", TTL.currencies);
  const map = new Map<string, RawCurrency>();
  for (const c of list) map.set(c.currency_id, c);
  return map;
}

/** Live price + 24h change for one currency, or null on failure. */
async function getCurrencySnapshot(
  currencyId: string,
): Promise<{ price: number; change24h: number } | null> {
  try {
    const s = await sosoFetch<CurrencySnapshotRaw>(
      `/currencies/${encodeURIComponent(currencyId)}/market-snapshot`,
      TTL.snapshot,
    );
    return { price: s.price, change24h: s.change_pct_24h };
  } catch {
    return null;
  }
}

/**
 * Constituents enriched with clean ticker/name/icon AND live price + 24h move +
 * approximate contribution (weight × 24h move) to the index's day. Joins on
 * `currency_id` (authoritative) rather than the raw `symbol` slug, which can
 * collide. Sorted heaviest weight first. Per-constituent snapshots are fetched
 * in parallel and each is independently cached.
 */
export async function getIndexConstituents(ticker: string): Promise<Constituent[]> {
  const [raw, currencyMap] = await Promise.all([
    sosoFetch<RawConstituent[]>(
      `/indices/${encodeURIComponent(ticker)}/constituents`,
      TTL.constituents,
    ),
    getCurrencyMap(),
  ]);

  const base = raw
    .map((c) => {
      const cur = currencyMap.get(c.currency_id);
      return {
        currencyId: c.currency_id,
        ticker: (cur?.symbol ?? c.symbol).toUpperCase(),
        name: cur?.name ?? c.symbol,
        weight: c.weight,
        icon: getTokenIcon(cur?.symbol ?? c.symbol),
      };
    })
    .sort((a, b) => b.weight - a.weight);

  return Promise.all(
    base.map(async (c): Promise<Constituent> => {
      const snap = await getCurrencySnapshot(c.currencyId);
      return {
        ...c,
        price: snap?.price ?? null,
        change24h: snap?.change24h ?? null,
        contribution: snap ? c.weight * snap.change24h : null,
      };
    }),
  );
}

/* ────────────────────── Stock (crypto-stocks) fundamentals ────────────────────
 * SoDEX tokenises ~20 real-world equities as perps (NVDA, MSTR, TSLA, AAPL...).
 * SoSoValue's crypto-stocks module covers nearly all of them 1:1 by ticker.  */

interface RawStockInfo {
  ticker: string;
  name: string;
  exchange: string;
  sector: string | null;
}

export interface StockSnapshot {
  mkt_price: number;
  mkt_status: string; // "open" | "close"
  pe_ttm: number | null;
  pb: number | null;
  circulating_marketcap: number;
  total_marketcap: number;
  total_shares: string;
  circulating_shares: string;
}

export interface BtcTreasury {
  date: string;
  btcHolding: number;
}

/** Full crypto-stocks list, cached 24h — reference data (name/exchange/sector). */
async function getStockList(): Promise<Map<string, RawStockInfo>> {
  const list = await sosoFetch<RawStockInfo[]>("/crypto-stocks", TTL.currencies);
  const map = new Map<string, RawStockInfo>();
  for (const s of list) map.set(s.ticker, s);
  return map;
}

/** Tickers covered by the BTC-treasuries module, cached 24h. */
async function getBtcTreasuryTickers(): Promise<Set<string>> {
  const list = await sosoFetch<{ ticker: string }[]>("/btc-treasuries", TTL.currencies);
  return new Set(list.map((t) => t.ticker));
}

export function getStockSnapshot(ticker: string): Promise<StockSnapshot> {
  return sosoFetch<StockSnapshot>(
    `/crypto-stocks/${encodeURIComponent(ticker)}/market-snapshot`,
    TTL.snapshot,
  );
}

export interface StockXray {
  ticker: string;
  name: string;
  exchange: string;
  sector: string | null;
  snapshot: StockSnapshot;
  btcTreasury: BtcTreasury | null;
}

/**
 * Full stock fundamentals bundle: company info + live snapshot, plus the most
 * recent BTC-treasury holding when this ticker is a corporate BTC holder
 * (checked against the treasury module's own company list, not a guess).
 */
export async function getStockXray(ticker: string): Promise<StockXray> {
  const [stockList, snapshot, treasuryTickers] = await Promise.all([
    getStockList(),
    getStockSnapshot(ticker),
    getBtcTreasuryTickers(),
  ]);
  const info = stockList.get(ticker);

  let btcTreasury: BtcTreasury | null = null;
  if (treasuryTickers.has(ticker)) {
    try {
      const rows = await sosoFetch<{ date: string; btc_holding: string }[]>(
        `/btc-treasuries/${encodeURIComponent(ticker)}/purchase-history?limit=1`,
        TTL.constituents,
      );
      if (rows[0]) btcTreasury = { date: rows[0].date, btcHolding: parseFloat(rows[0].btc_holding) };
    } catch {
      /* not fatal — treasury data is a bonus, not core */
    }
  }

  return {
    ticker,
    name: info?.name ?? ticker,
    exchange: info?.exchange ?? "",
    sector: info?.sector ?? null,
    snapshot,
    btcTreasury,
  };
}

/* ───────────────────────────── ETF flows ──────────────────────────────────
 * Real institutional spot-ETF flow data, contrasted against SoDEX's own
 * retail perp funding/OI in the UI layer (not here — this module stays a
 * thin, honest proxy for the upstream data).                               */

interface RawEtfFlowDay {
  date: string;
  total_net_inflow: number;
  total_net_assets: number;
  cum_net_inflow: number;
}

export interface EtfFlowDay {
  date: string;
  netInflow: number;
  netAssets: number;
  cumNetInflow: number;
}

/** Symbols SoSoValue's ETF module covers that SoDEX also lists as perps. */
export const ETF_FLOW_SYMBOLS = ["BTC", "ETH", "SOL"] as const;

/**
 * Recent daily ETF net-flow history for one symbol, deduped by date (the
 * upstream API can return multiple intraday snapshots per date — we keep the
 * first/most-recent one per date, sorted reverse-chronological already).
 */
export async function getEtfFlowHistory(symbol: string): Promise<EtfFlowDay[]> {
  const raw = await sosoFetch<RawEtfFlowDay[]>(
    `/etfs/summary-history?symbol=${encodeURIComponent(symbol)}&country_code=US&limit=15`,
    TTL.daily,
  );
  const seen = new Set<string>();
  const days: EtfFlowDay[] = [];
  for (const r of raw) {
    if (seen.has(r.date)) continue;
    seen.add(r.date);
    days.push({ date: r.date, netInflow: r.total_net_inflow, netAssets: r.total_net_assets, cumNetInflow: r.cum_net_inflow });
  }
  return days;
}

/* ───────────────────────────── Macro calendar ──────────────────────────── */

export interface MacroEventDay {
  date: string;
  events: string[];
}

/** Full macro calendar as published by SoSoValue — window filtering happens in the route (time-sensitive, must not be baked into the cached payload). */
export function getMacroEvents(): Promise<MacroEventDay[]> {
  return sosoFetch<MacroEventDay[]>("/macro/events", TTL.daily);
}

/* ─────────────────────────── Pair intelligence ────────────────────────────
 * Cross-read for one SoDEX pair: the asset's GLOBAL market context (price,
 * cycle position, valuation, 35d daily klines) to set against SoDEX's own
 * venue data (mark, funding, OI, volume) client-side.                       */

/** SoDEX base coins whose global asset trades at a different unit scale. */
const PAIR_ALIASES: Record<string, { symbol: string; factor: number }> = {
  "1000pepe": { symbol: "pepe", factor: 1000 },
  "1000shib": { symbol: "shib", factor: 1000 },
  "1000bonk": { symbol: "bonk", factor: 1000 },
  wsoso: { symbol: "soso", factor: 1 },
};

export interface GlobalSnapshot {
  price: number;
  change_pct_24h: number;
  turnover_24h: number;
  turnover_rate: number;
  marketcap: number;
  fdv: number;
  circulating_supply: string;
  total_supply: string;
  ath: number;
  ath_date: string;
  down_from_ath: number;
  cycle_low: number;
  cycle_low_date: string;
  up_from_cycle_low: number;
  marketcap_rank: number;
}

interface RawKline {
  timestamp: string;
  open: number;
  high: number;
  low: number;
  close: number;
}

export interface PairKline {
  t: number;
  h: number;
  l: number;
  c: number;
}

export interface PairIntel {
  base: string;
  name: string;
  ticker: string;
  factor: number; // multiply global price by this to compare with SoDEX (1000PEPE etc.)
  snapshot: GlobalSnapshot;
  klines: PairKline[]; // chronological daily bars, ~35d
}

/**
 * Global context for a SoDEX base coin, or null when SoSoValue has no matching
 * currency (tokenized stocks, commodities, indices). Symbol match is exact and
 * verified collision-free for SoDEX's listings. The kline window is snapped to
 * UTC day boundaries so its cache key only rotates once per day.
 *
 * `includeKlines: false` (the board's "lite" mode) skips the kline fetch — one
 * upstream call per pair instead of two, which keeps a cold multi-pair board
 * inside SoSoValue's 20 req/min ceiling.
 */
export async function getPairIntel(base: string, includeKlines = true): Promise<PairIntel | null> {
  const norm = base.toLowerCase().trim();
  const alias = PAIR_ALIASES[norm] ?? { symbol: norm, factor: 1 };
  const list = await sosoFetch<RawCurrency[]>("/currencies", TTL.currencies);
  const cur = list.find((c) => c.symbol.toLowerCase() === alias.symbol);
  if (!cur) return null;

  const DAY = 86_400_000;
  const end = Math.floor(Date.now() / DAY) * DAY;
  const start = end - 35 * DAY;

  const [snapshot, rawKlines] = await Promise.all([
    sosoFetch<GlobalSnapshot>(`/currencies/${cur.currency_id}/market-snapshot`, TTL.snapshot),
    includeKlines
      ? sosoFetch<RawKline[]>(
          `/currencies/${cur.currency_id}/klines?interval=1d&start_time=${start}&end_time=${end}&limit=40`,
          TTL.daily,
        ).catch(() => [] as RawKline[])
      : Promise.resolve([] as RawKline[]),
  ]);

  return {
    base: base.toUpperCase(),
    name: cur.name,
    ticker: cur.symbol.toUpperCase(),
    factor: alias.factor,
    snapshot,
    klines: rawKlines
      .map((k) => ({ t: +k.timestamp, h: k.high, l: k.low, c: k.close }))
      .sort((a, b) => a.t - b.t),
  };
}

export { SosoError };
