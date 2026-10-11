/**
 * Exchange-wide analytics for SoDEX, computed server-side.
 *
 * Source: the daily per-market history behind sodex.com/stats
 * (mainnet-data.sodex.dev/api/v1/dashboard/*). Those endpoints are not in the
 * public API reference, so everything here degrades instead of throwing when
 * one of them changes shape or goes away.
 *
 * Each endpoint is fetched once for its full history and cached; every window
 * (7D, 30D, …) is then a slice of the same data, so switching windows costs no
 * extra upstream calls.
 */

const DATA = "https://mainnet-data.sodex.dev/api/v1";
const HISTORY_START = "2025-01-01";
/** Upstream data is daily; refreshing it more than every 15 minutes buys nothing. */
const UPSTREAM_REVALIDATE = 900;

export type WindowKey = "7D" | "30D" | "90D" | "1Y";
export const WINDOWS: Record<WindowKey, number> = { "7D": 7, "30D": 30, "90D": 90, "1Y": 365 };

/** Activity tiers, by average distinct traders per day on the market. */
export type Tier = "active" | "niche" | "thin";
export const TIER_RULES = { activeMin: 50, thinMax: 6 } as const;

/* ------------------------------------------------------------- upstream */

interface MarketDay<V> {
  day_date: string;
  markets: Record<string, V>;
  total?: V;
}
interface OiDay extends MarketDay<string> {
  last_markets?: Record<string, string>;
  last_total?: string;
}
interface UsersDay {
  day_date: string;
  newUsers: number;
  cumulativeUsers: number;
}
interface TvlPoint {
  date: number;
  tvl: number;
}

async function getDashboard<T>(path: string, params: Record<string, string>): Promise<T[]> {
  const today = new Date().toISOString().slice(0, 10);
  const qs = new URLSearchParams({ start_date: HISTORY_START, end_date: today, ...params });
  try {
    const res = await fetch(`${DATA}/dashboard/${path}?${qs}`, {
      headers: { Accept: "application/json" },
      next: { revalidate: UPSTREAM_REVALIDATE },
    });
    if (!res.ok) return [];
    const json = await res.json();
    const rows = json?.data?.data;
    return Array.isArray(rows) ? (rows as T[]) : [];
  } catch {
    return [];
  }
}

/* ------------------------------------------------------------- symbols */

const GW = "https://mainnet-gw.sodex.dev/api/v1";

export interface SymbolMeta {
  /** The name SoDEX's stats use: BTC-USD, SOSO/USDC. */
  symbol: string;
  /** The name the trading API uses: BTC-USD, WSOSO_vUSDC. */
  apiName: string;
  kind: "perp" | "spot";
  makerFee: number;
  takerFee: number;
  maxLeverage: number | null;
}

interface RawSymbol {
  name: string;
  displayName?: string;
  makerFee?: string;
  takerFee?: string;
  maxLeverage?: number;
}

/** Every market's API name and standard fee rates, keyed by its stats name. */
export async function getSymbolMeta(): Promise<Map<string, SymbolMeta>> {
  const out = new Map<string, SymbolMeta>();
  await Promise.all(
    (["perps", "spot"] as const).map(async (engine) => {
      try {
        const res = await fetch(`${GW}/${engine}/markets/symbols`, {
          headers: { Accept: "application/json" },
          next: { revalidate: 3600 },
        });
        if (!res.ok) return;
        const rows: RawSymbol[] = (await res.json())?.data ?? [];
        for (const r of rows) {
          const symbol = engine === "spot" ? (r.displayName ?? r.name) : r.name;
          out.set(symbol, {
            symbol,
            apiName: r.name,
            kind: engine === "spot" ? "spot" : "perp",
            makerFee: num(r.makerFee),
            takerFee: num(r.takerFee),
            maxLeverage: typeof r.maxLeverage === "number" ? r.maxLeverage : null,
          });
        }
      } catch {
        /* fees just go missing for that engine */
      }
    }),
  );
  return out;
}

async function getTvl(): Promise<TvlPoint[]> {
  try {
    const res = await fetch(`${DATA}/mirror/tvl/history`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({
        startTime: Math.floor(Date.parse(`${HISTORY_START}T00:00:00Z`) / 1000),
        endTime: Math.floor(Date.now() / 1000),
      }),
      next: { revalidate: UPSTREAM_REVALIDATE },
    });
    if (!res.ok) return [];
    const json = await res.json();
    return Array.isArray(json?.data) ? (json.data as TvlPoint[]) : [];
  } catch {
    return [];
  }
}

/* ------------------------------------------------------------- output */

export interface Delta {
  value: number;
  /** Same measure over the preceding window of equal length, when fully covered. */
  prev: number | null;
}

export interface SeriesPoint {
  date: string;
  volume: number;
  perpsVolume: number;
  spotVolume: number;
  trades: number;
  /** Daily average open interest, USD. */
  oi: number | null;
  newUsers: number | null;
  /** Open-interest-weighted funding across all perps, annualised (0.1 = 10%). */
  fundingAnnual: number | null;
  tvl: number | null;
  /** Estimated fees at standard rates. */
  fees: number;
  /** Per-market daily traders, summed. Not de-duplicated across markets. */
  traderMarkets: number;
}

export interface MarketRow {
  symbol: string;
  kind: "perp" | "spot";
  volume: number;
  share: number;
  volumeChange: number | null;
  trades: number;
  /** Average distinct traders per day. */
  tradersPerDay: number;
  /** Trades per trader-day: how many trades each daily trader made on average. */
  tradesPerTrader: number | null;
  avgTrade: number | null;
  oiAvg: number | null;
  oiNow: number | null;
  /** Change in daily OI from the window's first to its last day. */
  oiChange: number | null;
  /** Average daily volume ÷ average OI. */
  turnover: number | null;
  /** Mean 8-hour funding rate across the window. */
  funding8h: number | null;
  fundingAnnual: number | null;
  /** Share of days in the window with positive funding (longs paying). */
  fundingPositiveDays: number | null;
  tier: Tier;
  /** Estimated fees: volume × (maker + taker) at standard rates. */
  fees: number | null;
  /**
   * Live positioning, merged in on the page from the position engine (never
   * set here): share of tracked positions that are long, the whales' share of
   * them, and the whales' lean (−1 all short, +1 all long).
   */
  longShare?: number | null;
  whaleShare?: number | null;
  whaleBias?: number | null;
}

export interface TierSummary {
  tier: Tier;
  markets: number;
  volumeShare: number;
  tradeShare: number;
  traderShare: number;
}

export interface ExchangeAnalytics {
  window: WindowKey;
  days: number;
  from: string;
  to: string;
  headline: {
    volume: Delta;
    perpsVolume: number;
    spotVolume: number;
    trades: Delta;
    avgTrade: Delta;
    newUsers: Delta;
    totalUsers: number | null;
    oiAvg: Delta | null;
    oiNow: number | null;
    tvlNow: number | null;
    oiToTvl: number | null;
    turnover: number | null;
    /**
     * Fees at each market's standard maker + taker rates. Every trade has one
     * maker and one taker, so this is exact before VIP discounts and rebates,
     * which only lower it: read it as an upper bound.
     */
    fees: Delta | null;
    fundingAnnual: number | null;
    marketsTraded: number;
    top5Share: number;
    btcEthShare: number;
    /** Sum of per-market daily traders. Not de-duplicated across markets. */
    traderMarketsPerDay: number;
  };
  series: SeriesPoint[];
  markets: MarketRow[];
  tiers: TierSummary[];
  /** Which upstream sources answered — the page says so when one did not. */
  sources: Record<"volume" | "traders" | "trades" | "openInterest" | "funding" | "users" | "tvl", boolean>;
}

/* ------------------------------------------------------------- compute */

const num = (v: unknown): number => {
  const n = typeof v === "number" ? v : parseFloat(String(v));
  return Number.isFinite(n) ? n : 0;
};
const isSpot = (symbol: string) => symbol.includes("/");
const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);
const mean = (xs: number[]) => (xs.length ? sum(xs) / xs.length : null);

function index<T extends { day_date: string }>(rows: T[]): Map<string, T> {
  return new Map(rows.map((r) => [r.day_date, r]));
}

/** Annualise an 8-hour funding rate: three periods a day. */
const annualise = (rate8h: number) => rate8h * 3 * 365;

function tierOf(tradersPerDay: number): Tier {
  if (tradersPerDay >= TIER_RULES.activeMin) return "active";
  if (tradersPerDay <= TIER_RULES.thinMax) return "thin";
  return "niche";
}

function windowSums(dates: string[], rows: Map<string, MarketDay<string | number>>) {
  const byMarket = new Map<string, number>();
  let total = 0;
  for (const d of dates) {
    const day = rows.get(d);
    if (!day) continue;
    for (const [m, v] of Object.entries(day.markets ?? {})) {
      const n = num(v);
      byMarket.set(m, (byMarket.get(m) ?? 0) + n);
      total += n;
    }
  }
  return { byMarket, total };
}

export async function computeExchangeAnalytics(window: WindowKey): Promise<ExchangeAnalytics> {
  const [volume, traders, trades, oi, funding, users, tvl, meta] = await Promise.all([
    getDashboard<MarketDay<string>>("volume", { market_type: "all" }),
    getDashboard<MarketDay<number>>("unique-traders", { market_type: "all" }),
    getDashboard<MarketDay<number>>("trades-count", { market_type: "all" }),
    getDashboard<OiDay>("open-interest", {}),
    getDashboard<MarketDay<string>>("funding-rate", { basis: "8h" }),
    getDashboard<UsersDay>("users", {}),
    getTvl(),
    getSymbolMeta(),
  ]);
  // Maker + taker: each trade pays one of each. Null where the rate is unknown.
  const feeRate = (symbol: string) => {
    const m = meta.get(symbol);
    return m ? m.makerFee + m.takerFee : null;
  };

  const days = WINDOWS[window];
  // Volume is the spine: it has the longest history and every traded day.
  // Today (UTC) is still filling in, so a window ends on the last complete day;
  // otherwise its final point reads as a crash and every comparison is short.
  const todayUtc = new Date().toISOString().slice(0, 10);
  const allDates = volume.map((d) => d.day_date).filter((d) => d < todayUtc).sort();
  const dates = allDates.slice(-days);
  const prevDates = allDates.length >= days * 2 ? allDates.slice(-days * 2, -days) : [];

  const V = index(volume);
  const U = index(traders);
  const T = index(trades);
  const O = index(oi);
  const F = index(funding);
  const N = index(users);
  const tvlByDate = new Map(tvl.map((p) => [new Date(p.date * 1000).toISOString().slice(0, 10), p.tvl]));

  /* ---- per-market window aggregates */
  const vol = windowSums(dates, V);
  const volPrev = windowSums(prevDates, V);
  const trd = windowSums(dates, T);
  const trdPrev = windowSums(prevDates, T);
  const trdr = windowSums(dates, U);

  const oiDaysByMarket = new Map<string, number[]>();
  for (const d of dates) {
    for (const [m, v] of Object.entries(O.get(d)?.markets ?? {})) {
      const list = oiDaysByMarket.get(m) ?? [];
      list.push(num(v));
      oiDaysByMarket.set(m, list);
    }
  }
  const lastOiDay = [...dates].reverse().map((d) => O.get(d)).find(Boolean);

  const fundingByMarket = new Map<string, number[]>();
  for (const d of dates) {
    for (const [m, v] of Object.entries(F.get(d)?.markets ?? {})) {
      const list = fundingByMarket.get(m) ?? [];
      list.push(num(v));
      fundingByMarket.set(m, list);
    }
  }

  const symbols = new Set<string>([...vol.byMarket.keys(), ...oiDaysByMarket.keys()]);
  const markets: MarketRow[] = [];
  for (const symbol of symbols) {
    const v = vol.byMarket.get(symbol) ?? 0;
    const t = trd.byMarket.get(symbol) ?? 0;
    const traderDays = trdr.byMarket.get(symbol) ?? 0;
    const oiList = oiDaysByMarket.get(symbol) ?? [];
    const oiAvg = mean(oiList);
    const f = fundingByMarket.get(symbol) ?? [];
    const f8 = mean(f);
    const prevV = volPrev.byMarket.get(symbol) ?? 0;
    const tradersPerDay = traderDays / days;

    // A market with no volume and no open interest in the window isn't a market here.
    if (v === 0 && !oiAvg) continue;

    markets.push({
      symbol,
      kind: isSpot(symbol) ? "spot" : "perp",
      volume: v,
      share: vol.total ? v / vol.total : 0,
      volumeChange: prevDates.length && prevV > 0 ? v / prevV - 1 : null,
      trades: t,
      tradersPerDay,
      tradesPerTrader: traderDays > 0 ? t / traderDays : null,
      avgTrade: t > 0 ? v / t : null,
      oiAvg,
      oiNow: lastOiDay?.last_markets?.[symbol] != null ? num(lastOiDay.last_markets[symbol]) : null,
      oiChange: oiList.length >= 2 && oiList[0] > 0 ? oiList[oiList.length - 1] / oiList[0] - 1 : null,
      turnover: oiAvg && oiAvg > 0 ? v / days / oiAvg : null,
      funding8h: f8,
      fundingAnnual: f8 == null ? null : annualise(f8),
      fundingPositiveDays: f.length ? f.filter((x) => x > 0).length / f.length : null,
      tier: tierOf(tradersPerDay),
      fees: feeRate(symbol) == null ? null : v * feeRate(symbol)!,
    });
  }
  markets.sort((a, b) => b.volume - a.volume);

  /* ---- tiers */
  const totalTraderDays = sum([...trdr.byMarket.values()]);
  const tiers: TierSummary[] = (["active", "niche", "thin"] as Tier[]).map((tier) => {
    const rows = markets.filter((m) => m.tier === tier);
    return {
      tier,
      markets: rows.length,
      volumeShare: vol.total ? sum(rows.map((r) => r.volume)) / vol.total : 0,
      tradeShare: trd.total ? sum(rows.map((r) => r.trades)) / trd.total : 0,
      traderShare: totalTraderDays ? sum(rows.map((r) => r.tradersPerDay * days)) / totalTraderDays : 0,
    };
  });

  /* ---- daily series */
  const series: SeriesPoint[] = dates.map((date) => {
    const vd = V.get(date);
    let perps = 0;
    let spot = 0;
    let fees = 0;
    for (const [m, x] of Object.entries(vd?.markets ?? {})) {
      if (isSpot(m)) spot += num(x);
      else perps += num(x);
      fees += num(x) * (feeRate(m) ?? 0);
    }
    const od = O.get(date);
    const fd = F.get(date);
    // OI-weighted funding: what the average dollar of open interest paid that day.
    let fw = 0;
    let w = 0;
    if (od && fd) {
      for (const [m, rate] of Object.entries(fd.markets ?? {})) {
        const weight = num(od.markets?.[m]);
        if (weight > 0) {
          fw += num(rate) * weight;
          w += weight;
        }
      }
    }
    return {
      date,
      volume: perps + spot,
      perpsVolume: perps,
      spotVolume: spot,
      trades: num(T.get(date)?.total),
      oi: od ? num(od.total) : null,
      newUsers: N.get(date)?.newUsers ?? null,
      fundingAnnual: w > 0 ? annualise(fw / w) : null,
      tvl: tvlByDate.get(date) ?? null,
      fees,
      traderMarkets: num(U.get(date)?.total),
    };
  });

  /* ---- headline */
  const tradesTotal = trd.total;
  const tradesPrev = trdPrev.total;
  const newUsersNow = sum(dates.map((d) => N.get(d)?.newUsers ?? 0));
  const newUsersPrev = prevDates.length ? sum(prevDates.map((d) => N.get(d)?.newUsers ?? 0)) : null;
  const lastUsers = [...users].reverse()[0];

  const oiSeries = series.map((s) => s.oi).filter((x): x is number => x != null);
  const oiPrevSeries = prevDates.map((d) => O.get(d)).filter(Boolean).map((d) => num(d!.total));
  const oiAvgNow = mean(oiSeries);
  const oiNow = lastOiDay ? num(lastOiDay.last_total ?? lastOiDay.total) : null;
  const tvlNow = [...tvl].reverse()[0]?.tvl ?? null;
  const perpsVolume = sum(series.map((s) => s.perpsVolume));
  const fundingDays = series.map((s) => s.fundingAnnual).filter((x): x is number => x != null);

  const sharesSorted = markets.map((m) => m.share).sort((a, b) => b - a);
  const btcEth = markets.filter((m) => m.symbol === "BTC-USD" || m.symbol === "ETH-USD");

  return {
    window,
    days,
    from: dates[0] ?? "",
    to: dates[dates.length - 1] ?? "",
    headline: {
      volume: { value: vol.total, prev: prevDates.length ? volPrev.total : null },
      perpsVolume,
      spotVolume: vol.total - perpsVolume,
      trades: { value: tradesTotal, prev: prevDates.length ? tradesPrev : null },
      avgTrade: {
        value: tradesTotal ? vol.total / tradesTotal : 0,
        prev: prevDates.length && tradesPrev ? volPrev.total / tradesPrev : null,
      },
      newUsers: { value: newUsersNow, prev: newUsersPrev },
      totalUsers: lastUsers?.cumulativeUsers ?? null,
      oiAvg:
        oiAvgNow == null
          ? null
          : { value: oiAvgNow, prev: oiPrevSeries.length === days ? mean(oiPrevSeries) : null },
      oiNow,
      tvlNow,
      oiToTvl: oiNow != null && tvlNow ? oiNow / tvlNow : null,
      turnover: oiAvgNow ? perpsVolume / days / oiAvgNow : null,
      fees:
        meta.size === 0
          ? null
          : {
              value: sum(markets.map((m) => m.fees ?? 0)),
              prev: prevDates.length
                ? sum([...volPrev.byMarket.entries()].map(([m, v]) => v * (feeRate(m) ?? 0)))
                : null,
            },
      fundingAnnual: mean(fundingDays),
      marketsTraded: markets.filter((m) => m.volume > 0).length,
      top5Share: sum(sharesSorted.slice(0, 5)),
      btcEthShare: sum(btcEth.map((m) => m.share)),
      traderMarketsPerDay: totalTraderDays / days,
    },
    series,
    markets,
    tiers,
    sources: {
      volume: volume.length > 0,
      traders: traders.length > 0,
      trades: trades.length > 0,
      openInterest: oi.length > 0,
      funding: funding.length > 0,
      users: users.length > 0,
      tvl: tvl.length > 0,
    },
  };
}

/* ------------------------------------------------------------- one market */

export interface MarketHistoryPoint {
  date: string;
  volume: number;
  trades: number;
  traders: number;
  oi: number | null;
  fundingAnnual: number | null;
  fees: number | null;
}

export interface MarketHistory {
  window: WindowKey;
  days: number;
  from: string;
  to: string;
  row: MarketRow;
  /** Rank by volume among all markets in the window, 1-based. */
  rank: number;
  ofMarkets: number;
  meta: SymbolMeta | null;
  series: MarketHistoryPoint[];
}

/**
 * One market's daily history. The upstream calls are the same URLs the
 * exchange view fetches, so they come out of the same cache.
 */
export async function computeMarketHistory(symbol: string, window: WindowKey): Promise<MarketHistory | null> {
  const [overview, volume, traders, trades, oi, funding, meta] = await Promise.all([
    computeExchangeAnalytics(window),
    getDashboard<MarketDay<string>>("volume", { market_type: "all" }),
    getDashboard<MarketDay<number>>("unique-traders", { market_type: "all" }),
    getDashboard<MarketDay<number>>("trades-count", { market_type: "all" }),
    getDashboard<OiDay>("open-interest", {}),
    getDashboard<MarketDay<string>>("funding-rate", { basis: "8h" }),
    getSymbolMeta(),
  ]);

  const index = overview.markets.findIndex((m) => m.symbol === symbol);
  if (index < 0) return null;
  const row = overview.markets[index];
  const info = meta.get(symbol) ?? null;
  const rate = info ? info.makerFee + info.takerFee : null;

  const todayUtc = new Date().toISOString().slice(0, 10);
  const dates = volume.map((d) => d.day_date).filter((d) => d < todayUtc).sort().slice(-WINDOWS[window]);
  const V = new Map(volume.map((d) => [d.day_date, d]));
  const U = new Map(traders.map((d) => [d.day_date, d]));
  const T = new Map(trades.map((d) => [d.day_date, d]));
  const O = new Map(oi.map((d) => [d.day_date, d]));
  const F = new Map(funding.map((d) => [d.day_date, d]));

  const series = dates.map((date) => {
    const v = num(V.get(date)?.markets?.[symbol]);
    const o = O.get(date)?.markets?.[symbol];
    const f = F.get(date)?.markets?.[symbol];
    return {
      date,
      volume: v,
      trades: num(T.get(date)?.markets?.[symbol]),
      traders: num(U.get(date)?.markets?.[symbol]),
      oi: o == null ? null : num(o),
      fundingAnnual: f == null ? null : annualise(num(f)),
      fees: rate == null ? null : v * rate,
    };
  });

  return {
    window,
    days: overview.days,
    from: overview.from,
    to: overview.to,
    row,
    rank: index + 1,
    ofMarkets: overview.markets.length,
    meta: info,
    series,
  };
}
