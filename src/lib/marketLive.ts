import { getSymbolMeta } from "@/lib/exchangeAnalytics";

/**
 * A market as it stands right now: ticker plus a costing of the live order
 * book. Read from the public trading gateway on the website's own servers.
 *
 * Gateway cost per call: tickers 2 + order book 10 (depth 500) = 12 weight,
 * cached 15s, against SoDEX's 1200-per-minute allowance.
 */

const GW = "https://mainnet-gw.sodex.dev/api/v1";
const LIVE_REVALIDATE = 15;
const BOOK_DEPTH = 500;
export const SLIPPAGE_SIZES = [1_000, 10_000, 100_000] as const;
const DEPTH_BANDS = [0.005, 0.01, 0.02] as const;

export interface Slippage {
  size: number;
  /** Average fill vs mid, as a fraction. Null when the book shown can't fill it. */
  buy: number | null;
  sell: number | null;
}

export interface DepthBand {
  /** Distance from mid, as a fraction. */
  within: number;
  bidUsd: number;
  askUsd: number;
}

export interface LiveMarket {
  symbol: string;
  kind: "perp" | "spot";
  asOf: number;
  price: number | null;
  change24h: number | null;
  volume24h: number | null;
  markPrice: number | null;
  indexPrice: number | null;
  /** Mark ÷ index − 1: how far the perp trades from the underlying. */
  basis: number | null;
  openInterestUsd: number | null;
  /** The current hourly funding rate, annualised. */
  fundingAnnual: number | null;
  nextFundingTime: number | null;
  spread: number | null;
  slippage: Slippage[];
  depth: DepthBand[];
  maxLeverage: number | null;
  makerFee: number | null;
  takerFee: number | null;
}

const num = (v: unknown): number | null => {
  const n = typeof v === "number" ? v : parseFloat(String(v));
  return Number.isFinite(n) ? n : null;
};

async function gw<T>(path: string): Promise<T | null> {
  try {
    const res = await fetch(`${GW}${path}`, {
      headers: { Accept: "application/json" },
      next: { revalidate: LIVE_REVALIDATE },
    });
    if (!res.ok) return null;
    const json = await res.json();
    return json?.code === 0 ? (json.data as T) : null;
  } catch {
    return null;
  }
}

type Level = [string, string];

/** Walk one side of the book until `size` dollars are filled; average price. */
function fillPrice(levels: Level[], size: number): number | null {
  let notional = 0;
  let qty = 0;
  for (const [p, q] of levels) {
    const price = parseFloat(p);
    const avail = parseFloat(q);
    if (!(price > 0) || !(avail > 0)) continue;
    const take = Math.min(avail, (size - notional) / price);
    notional += take * price;
    qty += take;
    if (notional >= size - 1e-9) return notional / qty;
  }
  return null;
}

function bandUsd(levels: Level[], mid: number, within: number, side: "bid" | "ask"): number {
  let usd = 0;
  for (const [p, q] of levels) {
    const price = parseFloat(p);
    const inBand = side === "bid" ? price >= mid * (1 - within) : price <= mid * (1 + within);
    if (!inBand) break;
    usd += price * parseFloat(q);
  }
  return usd;
}

interface RawTicker {
  lastPx?: string;
  changePct?: number;
  quoteVolume?: string;
  markPrice?: string;
  indexPrice?: string;
  openInterest?: string;
  fundingRate?: string;
  nextFundingTime?: number;
}

export async function getLiveMarket(symbol: string): Promise<LiveMarket | null> {
  const meta = (await getSymbolMeta()).get(symbol);
  if (!meta) return null;
  const engine = meta.kind === "perp" ? "perps" : "spot";
  const api = encodeURIComponent(meta.apiName);

  const [tickers, book] = await Promise.all([
    gw<RawTicker[]>(`/${engine}/markets/tickers?symbol=${api}`),
    gw<{ bids: Level[]; asks: Level[] }>(`/${engine}/markets/${api}/orderbook?limit=${BOOK_DEPTH}`),
  ]);
  const t = tickers?.[0];

  const bids = book?.bids ?? [];
  const asks = book?.asks ?? [];
  const bestBid = bids.length ? parseFloat(bids[0][0]) : null;
  const bestAsk = asks.length ? parseFloat(asks[0][0]) : null;
  const mid = bestBid && bestAsk ? (bestBid + bestAsk) / 2 : null;

  const slippage: Slippage[] = SLIPPAGE_SIZES.map((size) => {
    if (!mid) return { size, buy: null, sell: null };
    const buy = fillPrice(asks, size);
    const sell = fillPrice(bids, size);
    return { size, buy: buy == null ? null : buy / mid - 1, sell: sell == null ? null : 1 - sell / mid };
  });

  const price = num(t?.lastPx);
  const mark = num(t?.markPrice);
  const index = num(t?.indexPrice);
  const oiBase = num(t?.openInterest);
  const hourly = num(t?.fundingRate);

  return {
    symbol,
    kind: meta.kind,
    asOf: Date.now(),
    price,
    change24h: t?.changePct == null ? null : t.changePct / 100,
    volume24h: num(t?.quoteVolume),
    markPrice: mark,
    indexPrice: index,
    basis: mark && index ? mark / index - 1 : null,
    // The ticker quotes open interest in contracts; price it at mark.
    openInterestUsd: oiBase != null && mark ? oiBase * mark : null,
    // SoDEX pays funding every hour, so the live rate is hourly.
    fundingAnnual: meta.kind === "perp" && hourly != null ? hourly * 24 * 365 : null,
    nextFundingTime: t?.nextFundingTime ?? null,
    spread: bestBid && bestAsk && mid ? (bestAsk - bestBid) / mid : null,
    slippage,
    depth: mid
      ? DEPTH_BANDS.map((within) => ({
          within,
          bidUsd: bandUsd(bids, mid, within, "bid"),
          askUsd: bandUsd(asks, mid, within, "ask"),
        }))
      : [],
    maxLeverage: meta.maxLeverage,
    makerFee: meta.makerFee,
    takerFee: meta.takerFee,
  };
}
