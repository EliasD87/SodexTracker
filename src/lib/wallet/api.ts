/**
 * Everything the wallet pages read about one address, straight from SoDEX in
 * the browser (the Wealth API goes through /api/wealth, which SoDEX only
 * opens to sodex.com). Every call goes through the shared fetch cache, so
 * switching tabs or windows doesn't refetch; `forgetWallet` clears exactly
 * one wallet's entries for a real refresh.
 */

import { cachedApiFetch, cachedFetchJson, clearFetchCachePrefix } from "@/lib/fetchCache";
import { fetchStakedSoso } from "@/lib/valuechain";

export const GW = "https://mainnet-gw.sodex.dev/api/v1";
export const DATA = "https://mainnet-data.sodex.dev/api/v1";
const FLOW_API = "https://alpha-biz.sodex.dev/biz/mirror/account_flow";

export type WalletWindow = "24H" | "7D" | "30D" | "90D" | "1Y";
export const WALLET_WINDOWS: WalletWindow[] = ["24H", "7D", "30D", "90D", "1Y"];
/**
 * SoDEX keeps a year of wallet history, and mainnet started on Oct 10, 2025,
 * so its longest window is, near enough, the wallet's whole life on SoDEX.
 */
export const windowLabel = (w: WalletWindow) => (w === "1Y" ? "All" : w);
export const windowPhrase = (w: WalletWindow) => (w === "1Y" ? "all time" : w);

const n = (v: string | number | null | undefined) => {
  const x = typeof v === "number" ? v : parseFloat(v ?? "");
  return Number.isFinite(x) ? x : 0;
};

/* ── Account ────────────────────────────────────────────────────────────── */

/** One open perp position, from the account state (which, unlike /positions, carries the liquidation price). */
export interface OpenPosition {
  id: number;
  market: string;
  long: boolean;
  size: number;
  entry: number;
  leverage: number;
  liq: number | null;
  /** Initial margin: cost over leverage. */
  margin: number;
  /** SoDEX's own unrealised PnL. */
  upnl: number;
  cross: boolean;
  openedAt: number;
}

export interface Account {
  address: string;
  accountId: number;
  /** Perps account equity. */
  perpsEquity: number;
  openPositions: OpenPosition[];
}

interface RawState {
  aid: number;
  av?: string;
  P?: { i: number; s: string; m: string; sz: string; ep: string; co: string; ur: string; l: number; lp: string; ct: number }[];
}

export async function fetchAccount(address: string): Promise<Account> {
  const [perps, spot] = await Promise.allSettled([
    cachedApiFetch<RawState>(`${GW}/perps/accounts/${address}/state`),
    cachedApiFetch<{ aid: number }>(`${GW}/spot/accounts/${address}/state`),
  ]);
  const p = perps.status === "fulfilled" ? perps.value : null;
  const aid = p?.aid ?? (spot.status === "fulfilled" ? spot.value.aid : undefined);
  if (aid == null) throw new Error("This address hasn't used SoDEX yet.");
  return {
    address,
    accountId: aid,
    perpsEquity: n(p?.av),
    openPositions: (p?.P ?? [])
      .filter((x) => n(x.sz) !== 0)
      .map((x) => ({
        id: x.i,
        market: x.s,
        long: n(x.sz) > 0,
        size: Math.abs(n(x.sz)),
        entry: n(x.ep),
        leverage: x.l || 1,
        liq: n(x.lp) > 0 ? n(x.lp) : null,
        margin: n(x.co) / (x.l || 1),
        upnl: n(x.ur),
        cross: x.m === "CROSS",
        openedAt: x.ct,
      })),
  };
}

/* ── Performance ────────────────────────────────────────────────────────── */

export interface Overview {
  pnl: number;
  /** A ratio: 0.41 is +41%. */
  roi: number;
  accountValue: number;
  volume: number;
  spotPnl: number;
  perpsUnrealized: number;
  perpsClosed: number;
  vaultPnl: number;
}

export async function fetchOverview(accountId: number, win: WalletWindow): Promise<Overview> {
  const d = await cachedApiFetch<Record<string, string>>(`${DATA}/wallet/portfolio/overview?account_id=${accountId}&window=${win}`);
  return {
    pnl: n(d.total_pnl_usd),
    roi: n(d.roi),
    accountValue: n(d.account_value_usd),
    volume: n(d.volume_usd),
    spotPnl: n(d.spot_pnl_usd),
    perpsUnrealized: n(d.perps_unrealized_pnl_usd),
    perpsClosed: n(d.perps_closed_pnl_usd),
    vaultPnl: n(d.vault_pnl_usd),
  };
}

export interface ChartPoint {
  t: number;
  pnl: number;
  accountValue: number;
  spot: number;
  perps: number;
  vault: number;
}

export async function fetchChart(accountId: number, win: WalletWindow): Promise<ChartPoint[]> {
  const d = await cachedApiFetch<{ chart: Record<string, string | number>[] }>(
    `${DATA}/wallet/portfolio/chart?account_id=${accountId}&window=${win}`,
  );
  return (d.chart ?? []).map((p) => ({
    t: Number(p.ts_ms),
    pnl: n(p.pnl_usd as string),
    accountValue: n(p.account_value_usd as string),
    spot: n(p.spot_pnl_usd as string),
    perps: n(p.perps_pnl_usd as string),
    vault: n(p.vault_pnl_usd as string),
  }));
}

export interface Ranks {
  pnl: number | null;
  volume: number | null;
}

export async function fetchRanks(address: string): Promise<Ranks> {
  const rank = (by: string) =>
    cachedApiFetch<{ found: boolean; item?: { rank: number } }>(`${DATA}/leaderboard/rank?window_type=ALL_TIME&sort_by=${by}&wallet_address=${address}`)
      .then((r) => (r.found && r.item ? r.item.rank : null))
      .catch(() => null);
  const [pnl, volume] = await Promise.all([rank("pnl"), rank("volume")]);
  return { pnl, volume };
}

/* ── Markets (shared by every wallet) ───────────────────────────────────── */

export interface Markets {
  perps: Map<number, string>;
  spot: Map<number, string>;
  /** Perp mark prices by market. */
  marks: Map<string, number>;
  /** Spot prices by base coin, in USDC. */
  spotPrices: Map<string, number>;
  /** Every Wealth product, by the coin its shares trade or sit as (vQQQ, aCXMT, vsoUSDC). */
  funds: Map<string, Fund>;
}

export interface Fund {
  fundId: string;
  name: string;
  coin: string;
  type: string;
  /** Price per share: the fund's NAV, else SoDEX's quote. Null when it has neither. */
  price: number | null;
}

async function fetchFunds(): Promise<Map<string, Fund>> {
  const d = await cachedApiFetch<{
    funds: { fundId: string; name: string; fundType: string; nav?: string; share?: { coin: string } }[];
    quotes: { fundId: string; price?: string }[];
  }>("/api/wealth?view=funds", 1, 5 * 60_000).catch(() => null);
  const quote = new Map((d?.quotes ?? []).map((q) => [q.fundId, n(q.price)]));
  const out = new Map<string, Fund>();
  for (const f of d?.funds ?? []) {
    const coin = f.share?.coin || f.fundId;
    // NAV first: it's what SoDEX values Wealth holdings at. Exchange-traded funds have none and use the quote.
    const px = n(f.nav) || quote.get(f.fundId) || 0;
    out.set(coin, { fundId: f.fundId, name: f.name, coin, type: f.fundType, price: px > 0 ? px : null });
  }
  return out;
}

export async function fetchMarkets(): Promise<Markets> {
  const symbols = (path: string) =>
    cachedApiFetch<{ id: number; name: string; displayName?: string }[]>(`${GW}/${path}/markets/symbols`, 2, 30 * 60_000)
      .then((rows) => new Map(rows.map((s) => [s.id, s.displayName || s.name])))
      .catch(() => new Map<number, string>());
  const [perps, spot, marks, tickers, funds] = await Promise.all([
    symbols("perps"),
    symbols("spot"),
    cachedApiFetch<{ symbol: string; markPrice: string }[]>(`${GW}/perps/markets/mark-prices`, 2, 30_000).catch(() => []),
    cachedApiFetch<{ symbol: string; lastPx: string }[]>(`${GW}/spot/markets/tickers`, 2, 30_000).catch(() => []),
    fetchFunds(),
  ]);
  const spotPrices = new Map<string, number>();
  // Prefer USDC pairs: the first price seen for a base wins, and vUSDC pairs come first.
  for (const t of [...tickers].sort((a, b) => Number(!a.symbol.endsWith("_vUSDC")) - Number(!b.symbol.endsWith("_vUSDC")))) {
    const [base] = t.symbol.split("_");
    const px = n(t.lastPx);
    if (px > 0 && !spotPrices.has(base)) spotPrices.set(base, px);
  }
  return { perps, spot, marks: new Map(marks.map((m) => [m.symbol, n(m.markPrice)])), spotPrices, funds };
}

/** A coin's USD price: stablecoins at 1, then its spot price, then (for Wealth shares) the fund's price. */
export function coinPrice(coin: string, m: Markets): number | null {
  const bare = coin.replace(/^v/, "").toUpperCase();
  if (["USDC", "USDT", "USD", "DAI"].includes(bare)) return 1;
  return m.spotPrices.get(coin) ?? m.spotPrices.get(`v${bare}`) ?? m.funds.get(coin)?.price ?? null;
}

/* ── Holdings ───────────────────────────────────────────────────────────── */

export interface SpotBalance {
  coin: string;
  total: number;
  locked: number;
}

export async function fetchSpotBalances(address: string): Promise<SpotBalance[]> {
  const d = await cachedApiFetch<{ balances: { coin: string; total: string; locked: string }[] }>(`${GW}/spot/accounts/${address}/balances`);
  return (d.balances ?? []).map((b) => ({ coin: b.coin, total: n(b.total), locked: n(b.locked) })).filter((b) => b.total > 0);
}

export async function fetchStaked(address: string): Promise<number> {
  return (await fetchStakedSoso(address)) ?? 0;
}

/* ── Activity ───────────────────────────────────────────────────────────── */

export interface Trade {
  id: string;
  market: string;
  kind: "spot" | "perp";
  buy: boolean;
  size: number;
  price: number;
  value: number;
  fee: number;
  maker: boolean;
  t: number;
}

export interface ClosedPosition {
  id: number;
  market: string;
  long: boolean;
  size: number;
  entry: number;
  exit: number;
  leverage: number;
  /** Realised, after trading fees. */
  pnl: number;
  fees: number;
  funding: number;
  openedAt: number;
  closedAt: number;
}

type RawTrade = { trade_id: number; symbol_id: number; side: number; price: string; quantity: string; fee: string; ts_ms: number; is_maker: boolean };
type RawClosed = {
  position_id: number;
  symbol_id: number;
  position_side: number;
  avg_entry_price: string;
  avg_close_price: string;
  max_size: string;
  cum_closed_size: string;
  realized_pnl: string;
  cum_trading_fee: string;
  funding_fee: string;
  leverage: number;
  created_at: number;
  updated_at: number;
};

export async function fetchActivity(accountId: number, m: Markets): Promise<{ trades: Trade[]; closed: ClosedPosition[] }> {
  const [spot, perps, closed] = await Promise.all([
    cachedApiFetch<RawTrade[]>(`${DATA}/spot/trades?account_id=${accountId}&limit=100`).catch(() => []),
    cachedApiFetch<RawTrade[]>(`${DATA}/perps/trades?account_id=${accountId}&limit=100`).catch(() => []),
    cachedApiFetch<RawClosed[]>(`${DATA}/perps/positions?account_id=${accountId}&limit=200`).catch(() => []),
  ]);
  const trade = (kind: "spot" | "perp") => (t: RawTrade): Trade => ({
    id: `${kind}-${t.trade_id}`,
    market: (kind === "spot" ? m.spot : m.perps).get(t.symbol_id) ?? `#${t.symbol_id}`,
    kind,
    buy: t.side === 1,
    size: n(t.quantity),
    price: n(t.price),
    value: n(t.quantity) * n(t.price),
    fee: n(t.fee),
    maker: t.is_maker,
    t: t.ts_ms,
  });
  return {
    trades: [...spot.map(trade("spot")), ...perps.map(trade("perp"))].sort((a, b) => b.t - a.t),
    closed: closed.map((p) => {
      const entry = n(p.avg_entry_price);
      const exit = n(p.avg_close_price);
      const pnl = n(p.realized_pnl);
      const fees = n(p.cum_trading_fee);
      // Hedge mode says the side outright (2 long, 3 short). One-way positions
      // (1) are flat by now, so the side comes from which way price moved
      // against the gross result.
      const gross = pnl + fees;
      const long = p.position_side === 2 ? true : p.position_side === 3 ? false : (exit - entry) * gross >= 0;
      return {
        id: p.position_id,
        market: m.perps.get(p.symbol_id) ?? `#${p.symbol_id}`,
        long,
        size: n(p.max_size) || n(p.cum_closed_size),
        entry,
        exit,
        leverage: p.leverage || 1,
        pnl,
        fees,
        funding: n(p.funding_fee),
        openedAt: p.created_at,
        closedAt: p.updated_at,
      };
    }),
  };
}

/* ── Money in and out ───────────────────────────────────────────────────── */

export interface Transfer {
  deposit: boolean;
  coin: string;
  amount: number;
  /** USD value for stablecoins; other coins are left unpriced. */
  usd: number | null;
  chain: string;
  t: number;
  txHash: string;
}

export async function fetchTransfers(address: string): Promise<Transfer[]> {
  const json = await cachedFetchJson<{ code: string; data?: { accountFlows?: Record<string, string | number>[] } }>(FLOW_API, {
    method: "POST",
    headers: { "Content-Type": "application/json;charset=UTF-8" },
    body: JSON.stringify({ account: address, start: 0, limit: 200 }),
  });
  if (String(json.code) !== "0") throw new Error("SoDEX didn't return the transfer history.");
  return (json.data?.accountFlows ?? []).map((f) => {
    const coin = String(f.coin);
    const amount = n(f.amount as string) / 10 ** Number(f.decimals ?? 0);
    const stable = /USD/i.test(coin);
    return {
      deposit: String(f.type).includes("Deposit"),
      coin,
      amount,
      usd: stable ? amount : null,
      chain: String(f.chain ?? ""),
      t: Number(f.statusTime) * 1000,
      txHash: String(f.txHash ?? ""),
    };
  });
}

/* ── Wealth ─────────────────────────────────────────────────────────────── */

/** One fund's shares for this wallet, wherever they sit, as SoDEX's ledger reports them. */
export interface WealthShares {
  fundId: string;
  name: string;
  coin: string;
  ledger: number;
  spot: number;
  perp: number;
  evm: number;
}

export interface Wealth {
  shares: WealthShares[];
  /** SoDEX's own per-fund figures, where it has them (USDC Earn is reported separately and may be missing). */
  pnlByFund: Map<string, { pnl: number; pnl24h: number }>;
  /** Subscriptions and redemptions still being processed, in dollars. */
  inFlight: number;
  realized: number;
  pnl: number;
  pnl24h: number;
  pendingOrders: number;
}

type WealthRaw = {
  pnl: {
    inFlightValue?: string;
    totalPnl?: string;
    totalRealizedPnl?: string;
    totalPnl24h?: string;
    positions?: { fundId: string; unrealizedPnl: string; pnl24h: string }[];
  } | null;
  positions: {
    positions?: { fundId: string; name?: string; coin?: string; share?: { coin: string }; ledgerShares: string; spotShares: string; perpShares: string; evmShares: string }[];
  } | null;
  orders: { orders?: { status: string }[] } | null;
};

export async function fetchWealth(address: string): Promise<Wealth> {
  const d = await cachedApiFetch<WealthRaw>(`/api/wealth?address=${address}`, 1, 60_000);
  return {
    shares: (d.positions?.positions ?? []).map((p) => ({
      fundId: p.fundId,
      name: p.name || p.fundId,
      coin: p.share?.coin || p.coin || p.fundId,
      ledger: n(p.ledgerShares),
      spot: n(p.spotShares),
      perp: n(p.perpShares),
      evm: n(p.evmShares),
    })),
    pnlByFund: new Map((d.pnl?.positions ?? []).map((p) => [p.fundId, { pnl: n(p.unrealizedPnl), pnl24h: n(p.pnl24h) }])),
    inFlight: n(d.pnl?.inFlightValue),
    realized: n(d.pnl?.totalRealizedPnl),
    pnl: n(d.pnl?.totalPnl),
    pnl24h: n(d.pnl?.totalPnl24h),
    pendingOrders: (d.orders?.orders ?? []).filter((o) => !/claimed|cancel|fail|done|complete/i.test(o.status)).length,
  };
}

/* ── ValueChain wallet ───────────────────────────────────────────────────── */

const VC_RPC = "https://mainnet.valuechain.xyz/";
const VC_SCAN = "https://main-scan.valuechain.xyz/api/v2";

export interface ChainWallet {
  /** Native SOSO on ValueChain. */
  native: number;
  /** ERC-20 tokens on ValueChain (NFTs left out). */
  tokens: { symbol: string; name: string; contract: string; amount: number }[];
  /** False when the explorer that lists tokens didn't answer: native SOSO only. */
  tokensRead: boolean;
}

/**
 * What the address holds on ValueChain itself, outside SoDEX's spot and perps
 * ledgers: native SOSO plus every ERC-20, from the chain's own explorer. Some
 * of these are already counted elsewhere (Wealth fund shares, staked SOSO);
 * derive.ts sorts that out. The explorer sits behind Cloudflare and is
 * sometimes blocked; then native SOSO, from the chain's own RPC, still counts.
 */
export async function fetchChainWallet(address: string): Promise<ChainWallet> {
  const [nativeRes, tokensRes] = await Promise.allSettled([
    cachedFetchJson<{ result?: string }>(
      VC_RPC,
      { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "eth_getBalance", params: [address, "latest"] }) },
      60_000,
    ),
    cachedFetchJson<{ token: { symbol: string; name: string; address_hash: string; decimals: string; type: string }; value: string }[]>(
      `${VC_SCAN}/addresses/${address}/token-balances`,
      undefined,
      60_000,
    ),
  ]);
  if (nativeRes.status === "rejected") throw nativeRes.reason;
  const native = nativeRes.value;
  const tokens = tokensRes.status === "fulfilled" ? tokensRes.value : null;
  const wei = (hex: string | undefined) => (hex ? Number(BigInt(hex)) / 1e18 : 0);
  return {
    native: wei(native?.result),
    tokensRead: tokens != null,
    tokens: (Array.isArray(tokens) ? tokens : [])
      .filter((t) => t.token?.type === "ERC-20")
      .map((t) => ({
        symbol: t.token.symbol,
        name: t.token.name,
        contract: t.token.address_hash,
        amount: Number(t.value) / 10 ** Number(t.token.decimals || 18),
      }))
      .filter((t) => t.amount > 0),
  };
}

/* ── Refresh ────────────────────────────────────────────────────────────── */

/** Drop one wallet's cached answers (and the live prices), so the next reads go to SoDEX. */
export function forgetWallet(address: string, accountId: number | null) {
  const a = address.toLowerCase();
  clearFetchCachePrefix(address);
  clearFetchCachePrefix(a);
  clearFetchCachePrefix(a.slice(2)); // the staking read carries the address without 0x
  if (accountId != null) clearFetchCachePrefix(`account_id=${accountId}&`);
  clearFetchCachePrefix("mark-prices");
  clearFetchCachePrefix("tickers");
}
