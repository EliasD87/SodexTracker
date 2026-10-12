/**
 * How much money sits in each SoDEX Wealth product. The escrow vaults report
 * their own assets under management; the rest (USDC Earn and the tokenized
 * funds) don't, so their size is the share token's total supply on ValueChain
 * times the fund's price, which is what those shares are worth.
 *
 * The funds' prices come from Wealth's /markets, which can take several
 * seconds to answer when its own cache is cold. When it doesn't answer in
 * time, each fund is priced from its SoDEX spot market instead (vQQQ_vUSDC and
 * so on, the middle of the book), so a slow quote never drops products out.
 */

const WEALTH = "https://wealth.sodex.dev/api/v1/wealth";
const VC_RPC = "https://mainnet.valuechain.xyz/";
const GW = "https://mainnet-gw.sodex.dev/api/v1";

export type WealthKind = "vault" | "earn" | "fund";

export interface WealthProduct {
  fundId: string;
  name: string;
  kind: WealthKind;
  /** Total value in USD, or null when neither the size nor the price is known. */
  tvl: number | null;
  /** Where the figure comes from: SoDEX's own number, or shares × price. */
  source: "reported" | "onchain";
  price: number | null;
  shares: number | null;
  /** Price change over the last day, as a ratio (0.005 is +0.5%). */
  change24h: number | null;
  /** Yield, as a ratio a year: the 7-day APY for Earn, the dividend yield for a fund. */
  yield: number | null;
  /** Price return over a month, a year and the year so far, as ratios. */
  roi1M: number | null;
  roi1Y: number | null;
  roiYtd: number | null;
  /** When the price was last set, ms; and whether the fund's home market is open. */
  priceAt: number | null;
  marketOpen: boolean | null;
}

export interface WealthTvl {
  total: number;
  products: WealthProduct[];
  asOf: number;
}

type Fund = {
  fundId: string;
  name: string;
  fundType: string;
  nav?: string;
  aum?: string;
  share?: { coin: string; address: string; decimals: number };
  /** The fund's own spot market on SoDEX, for the tokenized funds. */
  spot?: { symbol: string };
};
type SpotTicker = { symbol: string; lastPx?: string; bidPx?: string; askPx?: string };
type Quote = {
  fundId: string;
  price?: string;
  changePct?: string;
  apy7d?: string;
  dividendYield?: string;
  roi1M?: string;
  roi1Y?: string;
  roiYtd?: string;
  asOf?: string;
  marketStatus?: string;
};

const num = (v: string | undefined) => {
  const x = parseFloat(v ?? "");
  return Number.isFinite(x) ? x : null;
};

async function wealth<T>(path: string, timeout = 10_000): Promise<T | null> {
  try {
    const res = await fetch(`${WEALTH}${path}`, { signal: AbortSignal.timeout(timeout), next: { revalidate: 300 } });
    if (!res.ok) return null;
    const json = (await res.json()) as { code: number; data: T };
    return json.code === 0 ? json.data : null;
  } catch {
    return null;
  }
}

/** An ERC-20's total supply on ValueChain, in whole tokens. */
async function totalSupply(token: string, decimals: number): Promise<number | null> {
  try {
    const res = await fetch(VC_RPC, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "eth_call", params: [{ to: token, data: "0x18160ddd" }, "latest"] }),
      signal: AbortSignal.timeout(10_000),
      next: { revalidate: 300 },
    });
    const json = (await res.json()) as { result?: string };
    return json.result ? Number(BigInt(json.result)) / 10 ** decimals : null;
  } catch {
    return null;
  }
}

/** Each SoDEX spot market's price: the middle of the book, or the last trade when one side is empty. */
async function spotPrices(): Promise<Map<string, number>> {
  try {
    const res = await fetch(`${GW}/spot/markets/tickers`, { signal: AbortSignal.timeout(8_000), next: { revalidate: 60 } });
    const json = (await res.json()) as { data?: SpotTicker[] };
    const out = new Map<string, number>();
    for (const t of json.data ?? []) {
      const bid = num(t.bidPx);
      const ask = num(t.askPx);
      const px = bid && ask ? (bid + ask) / 2 : num(t.lastPx);
      if (px) out.set(t.symbol, px);
    }
    return out;
  } catch {
    return new Map();
  }
}

const KIND: Record<string, WealthKind> = { escrow_vault: "vault", bridged_vault: "earn", clob: "fund" };

export async function wealthTvl(): Promise<WealthTvl | null> {
  const [funds, markets, spot] = await Promise.all([wealth<Fund[]>("/funds"), wealth<{ quotes: Quote[] }>("/markets", 20_000), spotPrices()]);
  if (!funds) return null;
  const quotes = new Map((markets?.quotes ?? []).map((q) => [q.fundId, q]));
  const products = await Promise.all(
    funds.map(async (f): Promise<WealthProduct> => {
      const q = quotes.get(f.fundId);
      const kind = KIND[f.fundType] ?? "fund";
      const price = num(f.nav) ?? num(q?.price) ?? (f.spot?.symbol ? (spot.get(f.spot.symbol) ?? null) : null);
      const aum = num(f.aum);
      const shares = aum == null && f.share?.address ? await totalSupply(f.share.address, f.share.decimals) : null;
      const pct = (v: string | undefined) => (num(v) == null ? null : num(v)! / 100);
      return {
        fundId: f.fundId,
        name: f.name,
        kind,
        tvl: aum ?? (shares != null && price != null ? shares * price : null),
        source: aum != null ? "reported" : "onchain",
        price,
        shares,
        change24h: pct(q?.changePct),
        yield: kind === "earn" ? pct(q?.apy7d) : kind === "fund" ? pct(q?.dividendYield) : null,
        roi1M: pct(q?.roi1M),
        roi1Y: pct(q?.roi1Y),
        roiYtd: pct(q?.roiYtd),
        priceAt: q?.asOf ? Date.parse(q.asOf) || null : null,
        marketOpen: q?.marketStatus ? q.marketStatus === "OPEN" : null,
      };
    }),
  );
  products.sort((a, b) => (b.tvl ?? -1) - (a.tvl ?? -1));
  return { total: products.reduce((a, p) => a + (p.tvl ?? 0), 0), products, asOf: Date.now() };
}
