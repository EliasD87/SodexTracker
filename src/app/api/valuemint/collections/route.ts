import { NextResponse } from "next/server";

/**
 * GET /api/valuemint/collections
 *
 * Live mint state for the ValueMint collections, read straight off ValueChain
 * — the same L1 SoDEX settles on, which this app already talks to for sSOSO.
 *
 * ValueMint has no listing API (only per-token metadata), so the collections
 * are registered here by address. Its factory can't stand in for that: only
 * three of the five were deployed through it, so enumerating factory events
 * would silently miss the other two.
 *
 * Mints are priced in SOSO, and the SoDEX spot book prices SOSO, so the USD
 * equivalent is folded in here — something valuemint.store itself doesn't show.
 */

const RPC_URL = "https://mainnet.valuechain.xyz/";
const GW_BASE = "https://mainnet-gw.sodex.dev/api/v1";
const SITE = "https://www.valuemint.store";

/** Mint state moves; 60s keeps the supply counters honest without hammering. */
const REVALIDATE = 60;

/** SOSO has 18 decimals, and mint prices are quoted in it. */
const SOSO_DECIMALS = 18;
/** Spot coin the SOSO price comes from. */
const SOSO_TICKER = "WSOSO_vUSDC";

/* Standard selectors — every ValueMint collection answers all three. */
const TOTAL_SUPPLY = "0x18160ddd";
const MAX_SUPPLY = "0xd5abeb01";
const MINT_PRICE = "0x6817c76c";

interface Registered {
  slug: string;
  name: string;
  symbol: string;
  address: string;
}

const COLLECTIONS: Registered[] = [
  { slug: "genesis", name: "ValueChain Genesis", symbol: "VCG", address: "0x5Fadc59297e86aceA20Bff519aea0f9651Cdc90B" },
  { slug: "larpers", name: "SoDex Larpers", symbol: "SLRP", address: "0x0273DF41B56E3480886Fe8f0451349bEc0f8edf6" },
  { slug: "buddies", name: "Trade Buddies", symbol: "BUDDY", address: "0xe1C322BC972f78E78cfac98f71aA986C65D9C3bD" },
  { slug: "trenches", name: "The Trenches", symbol: "TRENCH", address: "0xaAb0dC8f2835Ed903b35d2f52FF17c4bc92Bec19" },
  { slug: "hypno", name: "Hypno Plush", symbol: "HYPNO", address: "0x01c28095bfffc9973Da4c4e8A34E9d5b6649C988" },
];

export interface MintCollection {
  slug: string;
  name: string;
  symbol: string;
  address: string;
  /** Cover art, served by ValueMint itself. */
  hero: string;
  url: string;
  /** Mint price in whole SOSO. */
  priceSoso: number;
  minted: number;
  supply: number;
  remaining: number;
  soldOut: boolean;
}

export interface ValueMintOverview {
  collections: MintCollection[];
  /** USD per SOSO from the SoDEX spot book, or null when unavailable. */
  sosoUsd: number | null;
  siteUrl: string;
}

interface RpcResult {
  id: number;
  result?: string;
  error?: unknown;
}

/**
 * One batched eth_call round trip for every field of every collection —
 * fifteen reads, one request.
 */
async function readChain(): Promise<Map<number, bigint>> {
  const batch = COLLECTIONS.flatMap((c, i) =>
    [TOTAL_SUPPLY, MAX_SUPPLY, MINT_PRICE].map((data, j) => ({
      jsonrpc: "2.0",
      id: i * 3 + j,
      method: "eth_call",
      params: [{ to: c.address, data }, "latest"],
    })),
  );

  const res = await fetch(RPC_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(batch),
    next: { revalidate: REVALIDATE },
  });
  if (!res.ok) throw new Error(`ValueChain RPC ${res.status}`);

  const json: RpcResult[] = await res.json();
  const out = new Map<number, bigint>();
  for (const r of json) {
    if (r.error || !r.result || r.result === "0x") continue;
    try {
      out.set(r.id, BigInt(r.result));
    } catch {
      /* unreadable word — that field just goes missing */
    }
  }
  return out;
}

/** USD per SOSO, or null if the spot book can't be reached. */
async function sosoUsd(): Promise<number | null> {
  try {
    const res = await fetch(`${GW_BASE}/spot/markets/tickers`, {
      headers: { Accept: "application/json" },
      next: { revalidate: REVALIDATE },
    });
    if (!res.ok) return null;
    const json = await res.json();
    const row = (json?.data as Array<{ symbol: string; lastPx: string }> | undefined)
      ?.find((t) => t.symbol === SOSO_TICKER);
    const px = row ? parseFloat(row.lastPx) : NaN;
    return Number.isFinite(px) && px > 0 ? px : null;
  } catch {
    return null;
  }
}

// BigInt literals aren't available at this tsconfig target — use BigInt().
const toWhole = (raw: bigint, decimals: number) => {
  const scale = BigInt(10) ** BigInt(decimals);
  return Number(raw / scale) + Number(raw % scale) / Number(scale);
};

export async function GET() {
  try {
    const [chain, usd] = await Promise.all([readChain(), sosoUsd()]);

    const collections: MintCollection[] = COLLECTIONS.flatMap((c, i) => {
      const minted = Number(chain.get(i * 3) ?? BigInt(0));
      const supply = Number(chain.get(i * 3 + 1) ?? BigInt(0));
      const price = chain.get(i * 3 + 2);
      // No readable mintPrice means the collection has no public mint (The
      // Trenches reverts on every price selector). Listing it beside real mints
      // would read as a free one, so it stays out until a mint opens.
      if (price === undefined || supply === 0) return [];
      const remaining = Math.max(supply - minted, 0);
      return {
        slug: c.slug,
        name: c.name,
        symbol: c.symbol,
        address: c.address,
        hero: `${SITE}/hero/${c.slug}.webp`,
        url: `${SITE}/collection/${c.address}`,
        priceSoso: toWhole(price, SOSO_DECIMALS),
        minted,
        supply,
        remaining,
        soldOut: remaining === 0,
      };
    })
      // Anything still open leads; sold-out drops to the end.
      .sort((a, b) => Number(a.soldOut) - Number(b.soldOut) || b.remaining - a.remaining);

    const data: ValueMintOverview = { collections, sosoUsd: usd, siteUrl: SITE };
    return NextResponse.json({ code: 0, message: "success", data });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to read ValueMint";
    return NextResponse.json({ code: 1, message }, { status: 502 });
  }
}
