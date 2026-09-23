import { NextResponse } from "next/server";

/**
 * GET /api/valuemint/collections
 *
 * Live state for the four ValueMint collections the band advertises, read off
 * ValueChain — the same L1 SoDEX settles on, which this app already talks to
 * for sSOSO.
 *
 * Two of the four have no public mint. Cybereator and SoDEXTreasureBox are
 * traded rather than minted and revert on every mint selector, so the band
 * leads with marketplace state — floor, listings, volume — which all four have,
 * and folds mint progress in only where a mint actually exists.
 *
 * ValueMint publishes no stats API, only a raw Seaport order and event index,
 * so those figures are derived here. See collectListings() for the arithmetic
 * and how it was checked against ValueMint's own numbers.
 */

const RPC_URL = "https://mainnet.valuechain.xyz/";
const GW_BASE = "https://mainnet-gw.sodex.dev/api/v1";
const SITE = "https://www.valuemint.store";

/** Floor and supply both move, so don't let the route go statically stale. */
export const revalidate = 60;
const REVALIDATE = 60;

/** SOSO has 18 decimals, and both mints and listings are priced in it. */
const SOSO_DECIMALS = 18;
/** Spot coin the SOSO price comes from. */
const SOSO_TICKER = "WSOSO_vUSDC";

/* Standard selectors. The mint pair reverts on the two traded collections. */
const TOTAL_SUPPLY = "0x18160ddd";
const MAX_SUPPLY = "0xd5abeb01";
const MINT_PRICE = "0x6817c76c";
const OWNER_OF = "0x6352211e";

/* Seaport item types. */
const NATIVE = 0;
const ERC20 = 1;
const ERC721 = 2;

interface Registered {
  name: string;
  symbol: string;
  address: string;
  /**
   * Cover art, served by ValueMint. Most sit under /covers keyed by the first
   * four bytes of the address, but Cybereator is a box rather than a numbered
   * collection and has its own path, so the URL is recorded rather than built.
   */
  art: string;
}

const COLLECTIONS: Registered[] = [
  {
    name: "Cybereator",
    symbol: "CYBR",
    address: "0xCD30D4bCaa99E556B70A2C4bDFC4050D26E48D30",
    art: "/boxes/cybereator.webp",
  },
  {
    name: "SoDEXTreasureBox",
    symbol: "SOBOX",
    address: "0x371c4F7F68bE3e558b89cC1f0fB113851C76E750",
    art: "/covers/371c4f7f-1.webp",
  },
  {
    name: "ValueChain Genesis",
    symbol: "VCG",
    address: "0x5Fadc59297e86aceA20Bff519aea0f9651Cdc90B",
    art: "/covers/5fadc592-1.webp",
  },
  {
    name: "Hypno Plush",
    symbol: "HYPNO",
    address: "0x01c28095bfffc9973Da4c4e8A34E9d5b6649C988",
    art: "/covers/01c28095-1.webp",
  },
];

/** Mint state, present only on the collections that actually run a mint. */
export interface MintState {
  /** Mint price in whole SOSO. */
  priceSoso: number;
  minted: number;
  supply: number;
  remaining: number;
  soldOut: boolean;
}

export interface MintCollection {
  name: string;
  symbol: string;
  address: string;
  hero: string;
  url: string;
  /** Cheapest live listing in whole SOSO, or null when nothing is for sale. */
  floorSoso: number | null;
  /** Live listings a buyer could actually fill right now. */
  listed: number | null;
  /** All-time secondary volume in whole SOSO. */
  volumeSoso: number | null;
  mint: MintState | null;
}

export interface ValueMintOverview {
  collections: MintCollection[];
  /** USD per SOSO from the SoDEX spot book, or null when unavailable. */
  sosoUsd: number | null;
  siteUrl: string;
}

/* ------------------------------------------------------------------ chain */

interface RpcResult {
  id: number;
  result?: string;
  error?: unknown;
}

const ethCall = (id: number, to: string, data: string) => ({
  jsonrpc: "2.0",
  id,
  method: "eth_call",
  params: [{ to, data }, "latest"],
});

/** One round trip for a whole batch of reads. Failed calls just go missing. */
async function rpc(batch: object[]): Promise<Map<number, string>> {
  const out = new Map<number, string>();
  if (batch.length === 0) return out;

  const res = await fetch(RPC_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(batch),
    next: { revalidate: REVALIDATE },
  });
  if (!res.ok) throw new Error(`ValueChain RPC ${res.status}`);

  // A batch that the node rejects outright comes back as a single error object
  // rather than an array, so don't assume this is iterable.
  const rows: RpcResult[] = await res.json();
  if (!Array.isArray(rows)) return out;
  for (const r of rows) {
    if (r.error || !r.result || r.result === "0x") continue;
    out.set(r.id, r.result);
  }
  return out;
}

// BigInt literals aren't available at this tsconfig target — use BigInt().
const ZERO = BigInt(0);

const asBig = (hex: string | undefined): bigint | undefined => {
  if (!hex) return undefined;
  try {
    return BigInt(hex);
  } catch {
    return undefined;
  }
};

const toWhole = (raw: bigint, decimals: number) => {
  const scale = BigInt(10) ** BigInt(decimals);
  return Number(raw / scale) + Number(raw % scale) / Number(scale);
};

/* --------------------------------------------------------------- indexes */

interface SeaportItem {
  itemType: number;
  token: string;
  identifierOrCriteria: string;
  startAmount: string;
}

interface SeaportOrder {
  hash: string;
  params: {
    offerer: string;
    startTime: string;
    endTime: string;
    offer: SeaportItem[];
    consideration: SeaportItem[];
  };
}

interface FillLeg {
  itemType: number;
  amount: string;
}

interface ActivityEvent {
  kind: string;
  args: {
    orderHash?: string;
    offer?: FillLeg[];
    consideration?: FillLeg[];
  };
}

interface ActivityFeed {
  events: ActivityEvent[];
}

/** A GET that resolves to null instead of throwing — the band survives it. */
async function readJson<T>(url: string): Promise<T | null> {
  try {
    const res = await fetch(url, {
      headers: { Accept: "application/json" },
      next: { revalidate: REVALIDATE },
    });
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch {
    return null;
  }
}

/** USD per SOSO, or null if the spot book cannot be reached. */
async function sosoUsd(): Promise<number | null> {
  const json = await readJson<{ data?: Array<{ symbol: string; lastPx: string }> }>(
    `${GW_BASE}/spot/markets/tickers`,
  );
  const row = json?.data?.find((t) => t.symbol === SOSO_TICKER);
  const px = row ? parseFloat(row.lastPx) : NaN;
  return Number.isFinite(px) && px > 0 ? px : null;
}

interface Listing {
  address: string;
  tokenId: bigint;
  offerer: string;
  priceWei: bigint;
}

interface Market {
  floorSoso: number | null;
  listed: number | null;
  volumeSoso: number | null;
}

/**
 * Every live listing across the registered collections.
 *
 * Three filters have to be applied, and each one was needed to reach the
 * figures ValueMint itself publishes:
 *
 *   1. Drop orders the event feed has seen cancelled or filled — the order
 *      endpoint still serves them.
 *   2. Drop orders outside their own start/end window.
 *   3. Drop orders whose token has since changed hands. Seaport reverts on
 *      these, but they stay in the index, and on SoDEXTreasureBox they were
 *      half the listings and set a floor nobody could buy at. That check is
 *      the caller's, since it needs a chain round trip.
 *
 * With all three applied, every figure reproduces ValueMint's own collection
 * pages exactly — floor/listed/volume of 199/9/5066, 10/7/256, 200/28/2505.0001
 * and 10/10/0 respectively.
 */
function collectListings(orders: SeaportOrder[], dead: Set<string>, now: number): Listing[] {
  const wanted = new Map(COLLECTIONS.map((c) => [c.address.toLowerCase(), c.address]));
  const out: Listing[] = [];

  for (const o of orders) {
    const nft = o.params.offer.find((i) => i.itemType === ERC721);
    if (!nft) continue; // offering money rather than a token — that is a bid
    const address = wanted.get(nft.token.toLowerCase());
    if (!address || dead.has(o.hash)) continue;

    const start = Number(o.params.startTime);
    const end = Number(o.params.endTime);
    if (!Number.isFinite(start) || !Number.isFinite(end)) continue;
    if (!(start <= now && (end === 0 || end > now))) continue;

    let tokenId: bigint;
    let priceWei = ZERO;
    try {
      tokenId = BigInt(nft.identifierOrCriteria);
      for (const i of o.params.consideration) {
        if (i.itemType === NATIVE || i.itemType === ERC20) priceWei += BigInt(i.startAmount);
      }
    } catch {
      continue; // an amount the index wrote in a shape we cannot read
    }

    out.push({ address, tokenId, offerer: o.params.offerer.toLowerCase(), priceWei });
  }
  return out;
}

/**
 * All-time secondary volume per collection, summed over filled orders.
 *
 * Every money leg counts, on both sides of the fill, because which side holds
 * the money depends on which side opened the trade. A filled listing puts the
 * token in `offer` and the payment in `consideration`; an accepted bid inverts
 * it, paying out of `offer` while `consideration` carries the token. Summing
 * consideration alone credits an accepted bid with only the marketplace fee —
 * and a third of the open book on SoDEXTreasureBox is bids right now, so that
 * is a live case rather than a hypothetical. Token legs are skipped either way,
 * so this leaves the all-listing history untouched.
 */
function volumeByAddress(feeds: Array<ActivityFeed | null>): Map<string, number> {
  const out = new Map<string, number>();
  feeds.forEach((feed, i) => {
    if (!feed?.events) return;
    let total = ZERO;
    for (const e of feed.events) {
      if (e.kind !== "fulfilled") continue;
      for (const item of [...(e.args.offer ?? []), ...(e.args.consideration ?? [])]) {
        if (item.itemType !== NATIVE && item.itemType !== ERC20) continue;
        try {
          total += BigInt(item.amount);
        } catch {
          /* skip the leg, keep the rest of the fill */
        }
      }
    }
    out.set(COLLECTIONS[i].address, toWhole(total, SOSO_DECIMALS));
  });
  return out;
}

/** Order hashes the event feed has retired, across every collection. */
function deadOrders(feeds: Array<ActivityFeed | null>): Set<string> {
  const dead = new Set<string>();
  for (const feed of feeds) {
    for (const e of feed?.events ?? []) {
      if ((e.kind === "cancelled" || e.kind === "fulfilled") && e.args.orderHash) {
        dead.add(e.args.orderHash);
      }
    }
  }
  return dead;
}

async function buildMarket(): Promise<Map<string, Market>> {
  const now = Math.floor(Date.now() / 1000);

  const [index, feeds] = await Promise.all([
    readJson<{ orders: SeaportOrder[] }>(`${SITE}/api/index/orders`),
    Promise.all(
      COLLECTIONS.map((c) =>
        readJson<ActivityFeed>(`${SITE}/api/index/activity?collection=${c.address.toLowerCase()}`),
      ),
    ),
  ]);

  const volume = volumeByAddress(feeds);
  const out = new Map<string, Market>();
  for (const c of COLLECTIONS) {
    out.set(c.address, { floorSoso: null, listed: null, volumeSoso: volume.get(c.address) ?? null });
  }
  if (!index?.orders) return out;

  const candidates = collectListings(index.orders, deadOrders(feeds), now);

  // One batch confirms every listing's token is still where the order says it
  // is. If that read fails the listings go unshown rather than shown wrong.
  let owners: Map<number, string>;
  try {
    owners = await rpc(
      candidates.map((l, i) =>
        ethCall(i, l.address, OWNER_OF + l.tokenId.toString(16).padStart(64, "0")),
      ),
    );
  } catch {
    return out;
  }

  const live = candidates.filter((l, i) => {
    const word = owners.get(i);
    return !!word && `0x${word.slice(-40)}`.toLowerCase() === l.offerer;
  });

  for (const c of COLLECTIONS) {
    const prices = live.filter((l) => l.address === c.address).map((l) => l.priceWei);
    const floor = prices.length ? prices.reduce((a, b) => (b < a ? b : a)) : null;
    out.set(c.address, {
      floorSoso: floor === null ? null : toWhole(floor, SOSO_DECIMALS),
      listed: prices.length,
      volumeSoso: volume.get(c.address) ?? null,
    });
  }
  return out;
}

/* ------------------------------------------------------------------ route */

export async function GET() {
  try {
    const chainCalls = COLLECTIONS.flatMap((c, i) =>
      [TOTAL_SUPPLY, MAX_SUPPLY, MINT_PRICE].map((data, j) => ethCall(i * 3 + j, c.address, data)),
    );

    // The mint counters are the least important thing on the card and only two
    // of the four have them, so a sulking RPC costs the progress bars rather
    // than the whole band — every other figure here comes from ValueMint.
    const [chain, usd, market] = await Promise.all([
      rpc(chainCalls).catch(() => new Map<number, string>()),
      sosoUsd(),
      buildMarket(),
    ]);

    const collections: MintCollection[] = COLLECTIONS.map((c, i) => {
      const minted = asBig(chain.get(i * 3));
      const supply = asBig(chain.get(i * 3 + 1));
      const price = asBig(chain.get(i * 3 + 2));

      // Both mint selectors revert on the traded collections, so a mint block
      // is only built when the contract answers all of them.
      let mint: MintState | null = null;
      if (price !== undefined && supply !== undefined && supply > ZERO) {
        const mintedN = Number(minted ?? ZERO);
        const supplyN = Number(supply);
        const remaining = Math.max(supplyN - mintedN, 0);
        mint = {
          priceSoso: toWhole(price, SOSO_DECIMALS),
          minted: mintedN,
          supply: supplyN,
          remaining,
          soldOut: remaining === 0,
        };
      }

      const m = market.get(c.address);
      return {
        name: c.name,
        symbol: c.symbol,
        address: c.address,
        hero: `${SITE}${c.art}`,
        url: `${SITE}/collection/${c.address}`,
        floorSoso: m?.floorSoso ?? null,
        listed: m?.listed ?? null,
        volumeSoso: m?.volumeSoso ?? null,
        mint,
      };
    });

    const data: ValueMintOverview = { collections, sosoUsd: usd, siteUrl: SITE };
    return NextResponse.json({ code: 0, message: "success", data });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to read ValueMint";
    return NextResponse.json({ code: 1, message }, { status: 502 });
  }
}
