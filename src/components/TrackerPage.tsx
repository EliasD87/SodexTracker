"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { useSearchParams } from "next/navigation";
import type { User } from "@supabase/supabase-js";
import { CornerMarks } from "@/components/CornerMarks";
import { CountUp } from "@/components/CountUp";
import { TokenIcon } from "@/components/TokenIcon";
import { tickerLabel } from "@/lib/tokenIcons";
import { cachedApiFetch, clearFetchCachePrefix } from "@/lib/fetchCache";
import { FundFlowCard } from "@/components/FundFlowCard";
import { PositionShareCard } from "@/components/PositionShareCard";
import type { ShareablePosition } from "@/components/PositionShareCard";
import { supabase } from "@/lib/supabase";
import {
  Search,
  X,
  Copy,
  Check,
  TrendingUp,
  Wallet,
  ArrowUpRight,
  ArrowDownRight,
  ExternalLink,
  RefreshCw,
  Calendar,
  ChevronLeft,
  ChevronRight,
  Bookmark,
  Link2,
  Unlink,
  Lock,
  Plus,
  Folder,
  UserRound,
  Share2,
} from "lucide-react";
import Link from "next/link";

/* ════════════════════════════════════════════════════════════════
   Types
   ════════════════════════════════════════════════════════════════ */

type PortfolioWindow = "7D" | "30D" | "90D" | "1Y";

interface AccountStateData {
  user: string;
  aid: number;
  uid: number;
  av?: string;
  am?: string;
  B?: Array<{ i: number; a: string; wb?: string; t?: string; l?: string }>;
  P?: unknown;
  O?: unknown[];
  S?: Array<{ s: string; l: number; m: string }>;
}

interface SpotAccountStateData {
  user: string;
  aid: number;
  uid: number;
  B?: Array<{ i: number; a: string; t: string; l: string }>;
  O?: unknown[];
}

export interface PortfolioOverviewData {
  account_id: number;
  ts_ms: number;
  window: string;
  total_pnl_usd: string;
  roi: string;
  account_value_usd: string;
  net_deposit_usd: string;
  spot_pnl_usd: string;
  perps_unrealized_pnl_usd: string;
  perps_closed_pnl_usd: string;
  vault_pnl_usd: string;
  volume_usd: string;
  cumulative_quote_volume: string;
  first_trade_ts_ms: number;
}

export interface ChartPoint {
  ts_ms: number;
  account_value_usd: string;
  pnl_usd: string;
  spot_pnl_usd: string;
  perps_pnl_usd: string;
  vault_pnl_usd: string;
  roi: string;
}

interface PortfolioChartData {
  account_id: number;
  window: string;
  total_pnl_usd: string;
  roi: string;
  chart: ChartPoint[];
}

interface LeaderboardRankItem {
  window_type: string;
  wallet_address: string;
  account_id: number;
  pnl_usd: string;
  volume_usd: string;
  rank: number;
}

interface LeaderboardRankData {
  found: boolean;
  snapshot_ts?: number;
  item?: LeaderboardRankItem;
}

interface SpotBalanceItem {
  id: number;
  coin: string;
  total: string;
  locked: string;
}

interface SpotBalancesData {
  blockTime: number;
  blockHeight: number;
  balances: SpotBalanceItem[];
}

interface SpotCoinInfo {
  id: number;
  name: string;
  precision: number;
}

interface SpotTrade {
  account_id: number;
  symbol_id: number;
  trade_id: number;
  side: number;
  user_id: number;
  order_id: number;
  price: string;
  quantity: string;
  fee: string;
  ts_ms: number;
  is_maker: boolean;
}

interface PerpsTrade {
  account_id: number;
  symbol_id: number;
  trade_id: number;
  side: number;
  user_id: number;
  order_id: number;
  price: string;
  quantity: string;
  fee: string;
  ts_ms: number;
  is_maker: boolean;
}

interface PositionHistoryItem {
  account_id: number;
  position_id: number;
  user_id: number;
  symbol_id: number;
  margin_mode: number;
  position_side: number;
  size: string;
  initial_margin: string;
  avg_entry_price: string;
  cum_open_cost: string;
  cum_trading_fee: string;
  cum_closed_size: string;
  avg_close_price: string;
  max_size: string;
  realized_pnl: string;
  frozen_size: string;
  leverage: number;
  take_over_price: string;
  created_at: number;
  updated_at: number;
  funding_fee: string;
}

interface OpenPosition {
  id: number;
  symbol: string;
  marginMode: number;
  side: number;
  size: string;
  initialMargin: string;
  avgEntryPrice: string;
  cumOpenCost: string;
  cumTradingFee: string;
  cumClosedSize: string;
  avgClosePrice: string;
  maxSize: string;
  realizedPnL: string;
  leverage: number;
  active: boolean;
  isTakenOver: boolean;
  takeOverPrice: string;
  createdAt: number;
  updatedAt: number;
}

interface OpenPositionsData {
  blockTime: number;
  blockHeight: number;
  positions: OpenPosition[];
}

interface MergedTrade {
  id: string;
  market: string;
  symbol_id: number;
  side: "buy" | "sell";
  type: "spot" | "perps";
  size: number;
  price: number;
  value: number;
  fee: number;
  timestamp: number;
  is_maker: boolean;
}

export interface TrackerData {
  wallet_address: string;
  account_id: number;
  user_id: number;
  perpsState: AccountStateData;
  spotState: SpotAccountStateData;
  overview: PortfolioOverviewData;
  chart: ChartPoint[];
  allTimePnlRank: LeaderboardRankData | null;
  allTimeVolumeRank: LeaderboardRankData | null;
  mergedTrades: MergedTrade[];
  positionHistory: PositionHistoryItem[];
  openPositions: OpenPosition[];
  perpsSymbolMap: Map<number, string>;
  spotSymbolMap: Map<number, string>;
  spotBalances: SpotBalanceItem[];
  spotCoins: Map<string, number>;
}

/* ════════════════════════════════════════════════════════════════
   Constants & helpers
   ════════════════════════════════════════════════════════════════ */

const GW_BASE = "https://mainnet-gw.sodex.dev/api/v1";
const DATA_BASE = "https://mainnet-data.sodex.dev/api/v1";

const PORTFOLIO_WINDOWS: { label: string; value: PortfolioWindow; short: string }[] = [
  { label: "7D", value: "7D", short: "7D" },
  { label: "30D", value: "30D", short: "30D" },
  { label: "90D", value: "90D", short: "90D" },
  { label: "1Y", value: "1Y", short: "1Y" },
];

function fmt(n: number, dp = 2): string {
  const abs = Math.abs(n);
  const sign = n < 0 ? "-" : "";
  if (abs >= 1_000_000) return `${sign}$${(abs / 1_000_000).toFixed(dp)}M`;
  if (abs >= 1_000) return `${sign}$${(abs / 1_000).toFixed(dp)}K`;
  return `${sign}$${abs.toFixed(dp)}`;
}

function fmtNum(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return n.toLocaleString();
}

function fmtSnap(ts: number): string {
  return (
    new Date(ts).toLocaleString("en-US", {
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
      timeZone: "UTC",
    }) + " UTC"
  );
}

function fmtDate(ts: number): string {
  return new Date(ts).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  });
}

function fmtTime(ts: number): string {
  return new Date(ts).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: "UTC",
  });
}

function shortAddr(addr: string): string {
  return addr.slice(0, 8) + "…" + addr.slice(-6);
}

function timeAgo(ts: number): string {
  const diff = Date.now() - ts;
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

interface WatchlistEntry {
  id: string;
  name: string;
  address: string;
  color: string;
  groupId: string;
}

interface WatchlistGroup {
  id: string;
  name: string;
}

interface WatchlistGroupRow {
  id: string;
  name: string;
  user_id: string;
}

interface WatchlistAddressRow {
  id: string;
  name: string;
  address: string;
  color: string;
  group_id: string;
  user_id: string;
}

const WATCHLIST_STORAGE_KEY = "sodex-watchlist-v1";
const WATCHLIST_GROUPS_STORAGE_KEY = "sodex-watchlist-groups-v1";
const WATCHLIST_COLORS = ["#35C77F", "#60A5FA", "#F59E0B", "#F0616D", "#A78BFA", "#EDEDED"];

const DEFAULT_WATCHLIST_GROUPS: WatchlistGroup[] = [
  { id: "main", name: "Main" },
  { id: "whales", name: "Whales" },
];

function readStoredWatchlistGroups(): WatchlistGroup[] {
  if (typeof window === "undefined") return DEFAULT_WATCHLIST_GROUPS;
  try {
    const saved = window.localStorage.getItem(WATCHLIST_GROUPS_STORAGE_KEY);
    if (!saved) return DEFAULT_WATCHLIST_GROUPS;
    const parsed = JSON.parse(saved) as WatchlistGroup[];
    return parsed.length > 0 ? parsed : DEFAULT_WATCHLIST_GROUPS;
  } catch {
    return DEFAULT_WATCHLIST_GROUPS;
  }
}

function readStoredWatchlist(): WatchlistEntry[] {
  if (typeof window === "undefined") return [];
  try {
    const saved = window.localStorage.getItem(WATCHLIST_STORAGE_KEY);
    return saved ? (JSON.parse(saved) as WatchlistEntry[]) : [];
  } catch {
    return [];
  }
}

/* ════════════════════════════════════════════════════════════════
   API functions
   ════════════════════════════════════════════════════════════════ */

async function apiFetch<T>(url: string, retries = 2): Promise<T> {
  return cachedApiFetch<T>(url, retries);
}

async function fetchPerpsAccountState(addr: string) {
  return apiFetch<AccountStateData>(`${GW_BASE}/perps/accounts/${addr}/state`);
}

async function fetchSpotAccountState(addr: string) {
  return apiFetch<SpotAccountStateData>(`${GW_BASE}/spot/accounts/${addr}/state`);
}

async function fetchPortfolioOverview(accountId: number, window: string) {
  return apiFetch<PortfolioOverviewData>(
    `${DATA_BASE}/wallet/portfolio/overview?account_id=${accountId}&window=${window}`
  );
}

async function fetchPortfolioChart(accountId: number, window: string) {
  const data = await apiFetch<PortfolioChartData>(
    `${DATA_BASE}/wallet/portfolio/chart?account_id=${accountId}&window=${window}`
  );
  return data.chart;
}

async function fetchLeaderboardRank(addr: string, window: string, sortBy: string = "pnl") {
  return apiFetch<LeaderboardRankData>(
    `${DATA_BASE}/leaderboard/rank?window_type=${window}&sort_by=${sortBy}&wallet_address=${addr}`
  );
}

async function fetchSpotBalances(addr: string) {
  return apiFetch<SpotBalancesData>(`${GW_BASE}/spot/accounts/${addr}/balances`);
}

async function fetchSpotCoins() {
  const data = await apiFetch<SpotCoinInfo[]>(`${GW_BASE}/spot/markets/coins`);
  const map = new Map<string, number>();
  for (const c of data) map.set(c.name, c.precision);
  return map;
}

async function fetchSpotTrades(accountId: number, limit: number) {
  return apiFetch<SpotTrade[]>(`${DATA_BASE}/spot/trades?account_id=${accountId}&limit=${limit}`);
}

async function fetchPerpsTrades(accountId: number, limit: number) {
  return apiFetch<PerpsTrade[]>(`${DATA_BASE}/perps/trades?account_id=${accountId}&limit=${limit}`);
}

async function fetchPositionHistory(accountId: number, limit: number) {
  return apiFetch<PositionHistoryItem[]>(`${DATA_BASE}/perps/positions?account_id=${accountId}&limit=${limit}`);
}

async function fetchOpenPositions(addr: string) {
  return apiFetch<OpenPositionsData>(`${GW_BASE}/perps/accounts/${addr}/positions`);
}

async function fetchPerpsSymbols() {
  const data = await apiFetch<Array<{ id: number; name: string; displayName: string }>>(
    `${GW_BASE}/perps/markets/symbols`
  );
  const map = new Map<number, string>();
  for (const s of data) map.set(s.id, s.displayName || s.name);
  return map;
}

async function fetchSpotSymbols() {
  const data = await apiFetch<Array<{ id: number; name: string; displayName: string }>>(
    `${GW_BASE}/spot/markets/symbols`
  );
  const map = new Map<number, string>();
  for (const s of data) map.set(s.id, s.displayName || s.name);
  return map;
}

/* ════════════════════════════════════════════════════════════════
   Data processing utilities
   ════════════════════════════════════════════════════════════════ */

function mergeTrades(
  spot: SpotTrade[],
  perps: PerpsTrade[],
  spotMap: Map<number, string>,
  perpsMap: Map<number, string>,
): MergedTrade[] {
  const merged: MergedTrade[] = [];
  for (const t of spot) {
    merged.push({
      id: `spot-${t.trade_id}`,
      market: spotMap.get(t.symbol_id) || `Sym-${t.symbol_id}`,
      symbol_id: t.symbol_id,
      side: t.side === 1 ? "buy" : "sell",
      type: "spot",
      size: parseFloat(t.quantity),
      price: parseFloat(t.price),
      value: parseFloat(t.quantity) * parseFloat(t.price),
      fee: parseFloat(t.fee),
      timestamp: t.ts_ms,
      is_maker: t.is_maker,
    });
  }
  for (const t of perps) {
    merged.push({
      id: `perps-${t.trade_id}`,
      market: perpsMap.get(t.symbol_id) || `Sym-${t.symbol_id}`,
      symbol_id: t.symbol_id,
      side: t.side === 1 ? "buy" : "sell",
      type: "perps",
      size: parseFloat(t.quantity),
      price: parseFloat(t.price),
      value: parseFloat(t.quantity) * parseFloat(t.price),
      fee: parseFloat(t.fee),
      timestamp: t.ts_ms,
      is_maker: t.is_maker,
    });
  }
  return merged.sort((a, b) => b.timestamp - a.timestamp);
}


function sideLabel(side: number): string {
  return side === 2 ? "LONG" : side === 3 ? "SHORT" : side === 1 ? "BOTH" : "SHORT";
}

function isPositionLong(side: number, size: string): boolean {
  return side === 2 || (side === 1 && parseFloat(size) > 0);
}

function marginModeLabel(mode: number): string {
  return mode === 1 ? "ISOLATED" : "CROSS";
}

/* ════════════════════════════════════════════════════════════════
   Shared hooks
   ════════════════════════════════════════════════════════════════ */

function useCopy() {
  const [copied, setCopied] = useState<string | null>(null);
  const copy = useCallback((text: string) => {
    navigator.clipboard?.writeText(text).then(() => {
      setCopied(text);
      setTimeout(() => setCopied((c) => (c === text ? null : c)), 1200);
    });
  }, []);
  return { copied, copy };
}

/* ════════════════════════════════════════════════════════════════
   PnL value component
   ════════════════════════════════════════════════════════════════ */

function PnlValue({ value, big = false }: { value: number; big?: boolean }) {
  const positive = value >= 0;
  return (
    <span
      className={`mono font-bold tabular-nums ${big ? "text-2xl" : "text-sm"}`}
      style={{ color: positive ? "var(--green)" : "var(--red)" }}
    >
      <CountUp value={value} format={(n) => `${n >= 0 ? "+" : ""}${fmt(n)}`} />
    </span>
  );
}

/* ════════════════════════════════════════════════════════════════
   Portfolio bind hero (portfolio mode, no address bound yet)
   ════════════════════════════════════════════════════════════════ */

const PORTFOLIO_GHOST_CARDS = [
  { label: "NET VALUE",    value: "$45,230",  sub: "+12.4% all time" },
  { label: "MARGIN USED",  value: "$2,261",   sub: "5.0% of equity"  },
  { label: "RANK",         value: "#47",      sub: "top 0.3%"        },
  { label: "VOL 7D",       value: "$280K",    sub: "↑ from $210K"    },
  { label: "UNREALIZED",   value: "+$1,842",  sub: "8 open positions" },
  { label: "FUNDING",      value: "+$127",    sub: "earned this week" },
  { label: "WIN RATE",     value: "63.2%",    sub: "321 / 507 trades" },
  { label: "POSITIONS",    value: "8",        sub: "4 long · 4 short" },
];

function PortfolioBindHero({
  searchInput,
  setSearchInput,
  onSearch,
  searchPending,
  searchFocused,
  setSearchFocused,
  searchRef,
  error,
}: {
  searchInput: string;
  setSearchInput: (v: string) => void;
  onSearch: () => void;
  searchPending: boolean;
  searchFocused: boolean;
  setSearchFocused: (v: boolean) => void;
  searchRef: React.RefObject<HTMLInputElement | null>;
  error: string | null;
}) {
  return (
    <div className="relative flex flex-col items-center justify-center text-center overflow-hidden" style={{ minHeight: 520 }}>

      {/* Ghost stat cards — decorative background */}
      <div
        className="absolute inset-0 pointer-events-none select-none"
        style={{
          maskImage: "radial-gradient(ellipse 85% 75% at 50% 50%, transparent 28%, black 68%)",
          WebkitMaskImage: "radial-gradient(ellipse 85% 75% at 50% 50%, transparent 28%, black 68%)",
        }}
      >
        <div
          className="grid grid-cols-4 gap-3 px-8 py-16"
          style={{ opacity: 0.12, maxWidth: 900, margin: "0 auto" }}
        >
          {PORTFOLIO_GHOST_CARDS.map((c, i) => (
            <div
              key={i}
              className="p-4"
              style={{ border: "1px solid var(--border)", background: "var(--bg-surface)" }}
            >
              <div className="tag text-[9px] mb-2" style={{ color: "var(--text-faint)" }}>{c.label}</div>
              <div className="mono text-xl font-bold" style={{ color: "var(--text)" }}>{c.value}</div>
              <div className="mono text-[10px] mt-1" style={{ color: "var(--text-faint)" }}>{c.sub}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Foreground */}
      <div className="relative z-10 flex flex-col items-center w-full max-w-[560px] px-5 py-16">
        <div className="flex flex-wrap items-center justify-center gap-2 mb-8">
          {[
            { label: "TRADES",  color: "var(--green)"      },
            { label: "P&L",     color: "var(--accent)"     },
            { label: "VOLUME",  color: "var(--accent)"     },
            { label: "RANK",    color: "var(--accent)"     },
            { label: "BALANCE", color: "var(--text-faint)" },
          ].map(f => (
            <span key={f.label} className="tag text-[10px] px-2.5 py-1 font-bold"
              style={{ border: `1px solid ${f.color}`, color: f.color, opacity: f.color === "var(--text-faint)" ? 0.5 : 1 }}>
              {f.label}
            </span>
          ))}
        </div>

        <h1 className="text-[32px] sm:text-[48px] font-bold leading-none tracking-tight mb-4"
          style={{ color: "var(--text)", letterSpacing: "-0.02em" }}>
          Bind Your Wallet
        </h1>
        <p className="text-sm mb-8 max-w-sm" style={{ color: "var(--text-muted)" }}>
          Link your wallet address to track your SoDEX portfolio. Saved on this device — no sign-in needed.
        </p>

        <div className="w-full">
          <div className="relative flex items-center" style={{
            border: `1px solid ${searchFocused ? "var(--accent)" : "var(--border)"}`,
            background: "var(--bg-surface)",
            boxShadow: searchFocused ? "0 0 0 1px var(--accent), 0 0 40px var(--accent-dim)" : "none",
            transition: "border-color 0.15s, box-shadow 0.15s",
          }}>
            {searchFocused && <CornerMarks size={8} inset={-1} thickness={1.5} />}
            <Link2 size={16} className="absolute left-4 pointer-events-none" style={{ color: "var(--text-faint)" }} />
            <input
              ref={searchRef}
              type="text"
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              onFocus={() => setSearchFocused(true)}
              onBlur={() => setSearchFocused(false)}
              onKeyDown={(e) => e.key === "Enter" && onSearch()}
              placeholder="Enter your wallet address to bind…"
              className="w-full bg-transparent outline-none mono text-sm py-4 pl-11 pr-24"
              style={{ color: "var(--text)", caretColor: "var(--accent)" }}
              spellCheck={false}
              autoComplete="off"
            />
            {searchInput && (
              <button onClick={() => setSearchInput("")}
                className="absolute right-[88px] opacity-50 hover:opacity-100 transition-opacity"
                style={{ color: "var(--text-faint)" }}>
                <X size={14} />
              </button>
            )}
            <button
              onClick={onSearch}
              disabled={searchPending || !searchInput.trim()}
              className="absolute right-2 sheen-host px-4 py-2 tag font-bold transition-opacity disabled:opacity-40"
              style={{ background: "var(--accent)", color: "var(--accent-fg)" }}
            >
              {searchPending ? "…" : "BIND"}
            </button>
          </div>
          {error && (
            <div className="mt-4 flex items-center gap-2 px-4 py-3"
              style={{ border: "1px solid var(--red)", background: "rgba(204,46,46,0.06)" }}>
              <X size={14} style={{ color: "var(--red)" }} />
              <span className="mono text-xs font-bold" style={{ color: "var(--red)" }}>{error}</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/* ════════════════════════════════════════════════════════════════
   Search hero (no address loaded)
   ════════════════════════════════════════════════════════════════ */

function SearchHero({
  searchInput,
  setSearchInput,
  onSearch,
  searchPending,
  searchFocused,
  setSearchFocused,
  searchRef,
  error,
  onTrackAddress,
}: {
  searchInput: string;
  setSearchInput: (v: string) => void;
  onSearch: () => void;
  onTrackAddress: (addr: string) => void;
  searchPending: boolean;
  searchFocused: boolean;
  setSearchFocused: (v: boolean) => void;
  searchRef: React.RefObject<HTMLInputElement | null>;
  error: string | null;
}) {
  const [watchlist, setWatchlist] = useState<WatchlistEntry[]>([]);
  const [groups, setGroups] = useState<WatchlistGroup[]>(DEFAULT_WATCHLIST_GROUPS);
  const [activeGroupId, setActiveGroupId] = useState(DEFAULT_WATCHLIST_GROUPS[0].id);
  const [entryName, setEntryName] = useState("");
  const [entryAddress, setEntryAddress] = useState("");
  const [entryColor, setEntryColor] = useState(WATCHLIST_COLORS[0]);
  const [newGroupName, setNewGroupName] = useState("");
  const [watchlistError, setWatchlistError] = useState<string | null>(null);
  const [watchlistLoading, setWatchlistLoading] = useState(false);
  const [user, setUser] = useState<User | null>(null);

  const loadRemoteWatchlist = useCallback(async (currentUser: User) => {
    if (!supabase) return;
    setWatchlistLoading(true);
    setWatchlistError(null);

    try {
      let { data: groupRows, error: groupsError } = await supabase
        .from("watchlist_groups")
        .select("id,name,user_id")
        .order("created_at", { ascending: true });

      if (groupsError) throw groupsError;

      if (!groupRows || groupRows.length === 0) {
        const { data: createdGroups, error: createGroupsError } = await supabase
          .from("watchlist_groups")
          .insert(DEFAULT_WATCHLIST_GROUPS.map((group) => ({ name: group.name, user_id: currentUser.id })))
          .select("id,name,user_id");

        if (createGroupsError) throw createGroupsError;
        groupRows = createdGroups;
      }

      const remoteGroups = ((groupRows ?? []) as WatchlistGroupRow[]).map((group) => ({
        id: group.id,
        name: group.name,
      }));

      const { data: addressRows, error: addressesError } = await supabase
        .from("watchlist_addresses")
        .select("id,name,address,color,group_id,user_id")
        .order("created_at", { ascending: false });

      if (addressesError) throw addressesError;

      setGroups(remoteGroups.length > 0 ? remoteGroups : DEFAULT_WATCHLIST_GROUPS);
      setActiveGroupId((current) => (
        remoteGroups.some((group) => group.id === current) ? current : remoteGroups[0]?.id ?? DEFAULT_WATCHLIST_GROUPS[0].id
      ));
      setWatchlist(((addressRows ?? []) as WatchlistAddressRow[]).map((entry) => ({
        id: entry.id,
        name: entry.name,
        address: entry.address,
        color: entry.color,
        groupId: entry.group_id,
      })));
    } catch (error) {
      setWatchlistError(
        error instanceof Error
          ? `Could not load Supabase watchlist: ${error.message}`
          : "Could not load Supabase watchlist. Check the SQL tables and RLS policies."
      );
    } finally {
      setWatchlistLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!supabase) return;

    supabase.auth.getUser().then(({ data }) => {
      setUser(data.user);
      if (data.user) void loadRemoteWatchlist(data.user);
      if (!data.user) {
        const storedGroups = readStoredWatchlistGroups();
        setGroups(storedGroups);
        setActiveGroupId(storedGroups[0].id);
        setWatchlist(readStoredWatchlist());
      }
    });

    const { data: subscription } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
      if (session?.user) {
        void loadRemoteWatchlist(session.user);
      } else {
        setGroups(readStoredWatchlistGroups());
        setActiveGroupId(readStoredWatchlistGroups()[0].id);
        setWatchlist(readStoredWatchlist());
      }
    });

    return () => subscription.subscription.unsubscribe();
  }, [loadRemoteWatchlist]);

  useEffect(() => {
    if (supabase) return;
    const storedGroups = readStoredWatchlistGroups();
    setGroups(storedGroups);
    setActiveGroupId(storedGroups[0].id);
    setWatchlist(readStoredWatchlist());
  }, []);

  useEffect(() => {
    window.localStorage.setItem(WATCHLIST_GROUPS_STORAGE_KEY, JSON.stringify(groups));
  }, [groups]);

  useEffect(() => {
    window.localStorage.setItem(WATCHLIST_STORAGE_KEY, JSON.stringify(watchlist));
  }, [watchlist]);

  const activeEntries = watchlist.filter((entry) => entry.groupId === activeGroupId);

  const addGroup = async () => {
    const name = newGroupName.trim();
    if (!name) return;

    if (user && supabase) {
      const { data: group, error: groupError } = await supabase
        .from("watchlist_groups")
        .insert({ name, user_id: user.id })
        .select("id,name,user_id")
        .single();

      if (groupError || !group) {
        setWatchlistError("Could not save group to Supabase.");
        return;
      }

      setGroups((items) => [...items, { id: group.id, name: group.name }]);
      setActiveGroupId(group.id);
      setNewGroupName("");
      return;
    }

    const group: WatchlistGroup = {
      id: `${Date.now()}-${name.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`,
      name,
    };
    setGroups((items) => [...items, group]);
    setActiveGroupId(group.id);
    setNewGroupName("");
  };

  const deleteGroup = async (groupId: string) => {
    if (groups.length <= 1) {
      setWatchlistError("Cannot delete the last group.");
      return;
    }

    if (user && supabase) {
      const { error: addrError } = await supabase
        .from("watchlist_addresses")
        .delete()
        .eq("group_id", groupId);
      if (addrError) {
        setWatchlistError("Could not remove addresses from Supabase.");
        return;
      }
      const { error: groupError } = await supabase
        .from("watchlist_groups")
        .delete()
        .eq("id", groupId);
      if (groupError) {
        setWatchlistError("Could not delete group from Supabase.");
        return;
      }
    }

    const remaining = groups.filter((g) => g.id !== groupId);
    setGroups(remaining);
    setWatchlist((items) => items.filter((e) => e.groupId !== groupId));
    if (activeGroupId === groupId) setActiveGroupId(remaining[0].id);
  };

  const addWatchlistEntry = async () => {
    const name = entryName.trim();
    const address = entryAddress.trim() || searchInput.trim();
    if (!name || !address) {
      setWatchlistError("Add a name and address.");
      return;
    }
    if (watchlist.some((entry) => entry.address.toLowerCase() === address.toLowerCase())) {
      setWatchlistError("This address is already saved.");
      return;
    }

    if (user && supabase) {
      const { data: entry, error: entryError } = await supabase
        .from("watchlist_addresses")
        .insert({
          name,
          address,
          color: entryColor,
          group_id: activeGroupId,
          user_id: user.id,
        })
        .select("id,name,address,color,group_id,user_id")
        .single();

      if (entryError || !entry) {
        setWatchlistError("Could not save address to Supabase.");
        return;
      }

      setWatchlist((items) => [
        {
          id: entry.id,
          name: entry.name,
          address: entry.address,
          color: entry.color,
          groupId: entry.group_id,
        },
        ...items,
      ]);
      setEntryName("");
      setEntryAddress("");
      setWatchlistError(null);
      return;
    }

    setWatchlist((items) => [
      {
        id: `${Date.now()}-${address.slice(0, 8)}`,
        name,
        address,
        color: entryColor,
        groupId: activeGroupId,
      },
      ...items,
    ]);
    setEntryName("");
    setEntryAddress("");
    setWatchlistError(null);
  };

  const removeWatchlistEntry = async (id: string) => {
    if (user && supabase) {
      const { error: deleteError } = await supabase
        .from("watchlist_addresses")
        .delete()
        .eq("id", id);

      if (deleteError) {
        setWatchlistError("Could not remove address from Supabase.");
        return;
      }
    }

    setWatchlist((items) => items.filter((entry) => entry.id !== id));
  };

  const TRACKER_GHOST_COLS = "minmax(80px,1.2fr) 52px 70px 88px 88px 80px 80px";
  const TRACKER_GHOST_ROWS = [
    { sym: "BTC/USD",  side: "LONG",  size: "0.142", entry: "$62,100", mark: "$64,203", pnl: "+$297", liq: "$48,200" },
    { sym: "ETH/USD",  side: "SHORT", size: "1.500", entry: "$3,550",  mark: "$3,412",  pnl: "+$207", liq: "$4,260"  },
    { sym: "SOL/USD",  side: "LONG",  size: "12.00", entry: "$145.20", mark: "$148.20", pnl: "+$36",  liq: "$108.90" },
    { sym: "XRP/USD",  side: "SHORT", size: "500.0", entry: "$0.630",  mark: "$0.614",  pnl: "+$8",   liq: "$0.756"  },
    { sym: "LINK/USD", side: "LONG",  size: "30.00", entry: "$14.80",  mark: "$15.24",  pnl: "+$13",  liq: "$11.10"  },
    { sym: "BNB/USD",  side: "SHORT", size: "3.000", entry: "$335.00", mark: "$321.00", pnl: "+$42",  liq: "$402.00" },
    { sym: "ARB/USD",  side: "LONG",  size: "200.0", entry: "$1.10",   mark: "$1.23",   pnl: "+$26",  liq: "$0.825"  },
    { sym: "AVAX/USD", side: "SHORT", size: "8.000", entry: "$30.20",  mark: "$28.50",  pnl: "+$13",  liq: "$36.24"  },
  ];

  return (
    <div className="flex flex-col items-center text-center">
      {/* ── Ghost positions hero ── */}
      <div className="relative w-full flex flex-col items-center justify-center overflow-hidden" style={{ minHeight: 520 }}>

        {/* Ghost positions table — decorative background */}
        <div
          className="absolute inset-0 pointer-events-none select-none overflow-hidden"
          style={{
            maskImage: "radial-gradient(ellipse 85% 75% at 50% 50%, transparent 28%, black 68%)",
            WebkitMaskImage: "radial-gradient(ellipse 85% 75% at 50% 50%, transparent 28%, black 68%)",
          }}
        >
          <div style={{ opacity: 0.12, minWidth: 700, margin: "0 auto", paddingTop: 28 }}>
            <div className="grid items-center px-6 py-2.5"
              style={{ gridTemplateColumns: TRACKER_GHOST_COLS, gap: 10, borderBottom: "1px solid var(--border)" }}>
              {["MARKET","SIDE","SIZE","ENTRY","MARK","P&L","LIQ"].map(h => (
                <span key={h} className="tag text-[9px]" style={{ color: "var(--text-faint)" }}>{h}</span>
              ))}
            </div>
            {TRACKER_GHOST_ROWS.map((r, i) => (
              <div key={i} className="grid items-center px-6"
                style={{ gridTemplateColumns: TRACKER_GHOST_COLS, gap: 10, height: 44, borderBottom: "1px solid var(--border-subtle)" }}>
                <span className="mono text-xs font-bold" style={{ color: "var(--text)" }}>{r.sym}</span>
                <span className="mono text-xs font-bold" style={{ color: r.side === "LONG" ? "var(--green)" : "var(--red)" }}>{r.side}</span>
                <span className="mono text-xs tabular-nums" style={{ color: "var(--text)" }}>{r.size}</span>
                <span className="mono text-xs text-right tabular-nums" style={{ color: "var(--text-muted)" }}>{r.entry}</span>
                <span className="mono text-xs text-right tabular-nums" style={{ color: "var(--text-muted)" }}>{r.mark}</span>
                <span className="mono text-xs text-right font-bold tabular-nums" style={{ color: "var(--green)" }}>{r.pnl}</span>
                <span className="mono text-xs text-right tabular-nums" style={{ color: "var(--text-faint)" }}>{r.liq}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Foreground */}
        <div className="relative z-10 flex flex-col items-center w-full max-w-[560px] px-5 py-16">
          <div className="flex flex-wrap items-center justify-center gap-2 mb-8">
            {[
              { label: "TRADES",  color: "var(--green)"      },
              { label: "P&L",     color: "var(--accent)"     },
              { label: "VOLUME",  color: "var(--accent)"     },
              { label: "RANK",    color: "var(--accent)"     },
              { label: "BALANCE", color: "var(--text-faint)" },
            ].map(f => (
              <span key={f.label} className="tag text-[10px] px-2.5 py-1 font-bold"
                style={{ border: `1px solid ${f.color}`, color: f.color, opacity: f.color === "var(--text-faint)" ? 0.5 : 1 }}>
                {f.label}
              </span>
            ))}
          </div>

          <h1 className="text-[32px] sm:text-[48px] font-bold leading-none tracking-tight mb-4"
            style={{ color: "var(--text)", letterSpacing: "-0.02em" }}>
            Track Any Address
          </h1>
          <p className="text-sm mb-8 max-w-sm" style={{ color: "var(--text-muted)" }}>
            Enter any wallet address to see its full SoDEX trading portfolio — open positions, P&L, volume, and rank.
          </p>

          <div className="w-full">
            <div className="relative flex items-center" style={{
              border: `1px solid ${searchFocused ? "var(--accent)" : "var(--border)"}`,
              background: "var(--bg-surface)",
              boxShadow: searchFocused ? "0 0 0 1px var(--accent), 0 0 40px var(--accent-dim)" : "none",
              transition: "border-color 0.15s, box-shadow 0.15s",
            }}>
              {searchFocused && <CornerMarks size={8} inset={-1} thickness={1.5} />}
              <Search size={16} className="absolute left-4 pointer-events-none" style={{ color: "var(--text-faint)" }} />
              <input
                ref={searchRef}
                type="text"
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
                onFocus={() => setSearchFocused(true)}
                onBlur={() => setSearchFocused(false)}
                onKeyDown={(e) => e.key === "Enter" && onSearch()}
                placeholder="Paste a wallet address  e.g. 0x0879A87D…"
                className="w-full bg-transparent outline-none mono text-sm py-4 pl-11 pr-28"
                style={{ color: "var(--text)", caretColor: "var(--accent)" }}
                spellCheck={false}
                autoComplete="off"
              />
              {searchInput && (
                <button onClick={() => setSearchInput("")}
                  className="absolute right-[92px] opacity-50 hover:opacity-100 transition-opacity"
                  style={{ color: "var(--text-faint)" }}>
                  <X size={14} />
                </button>
              )}
              <button
                onClick={onSearch}
                disabled={searchPending || !searchInput.trim()}
                className="absolute right-2 sheen-host px-4 py-2 tag font-bold transition-opacity disabled:opacity-40"
                style={{ background: "var(--accent)", color: "var(--accent-fg)" }}
              >
                {searchPending ? "…" : "TRACK"}
              </button>
            </div>
            {error && (
              <div className="mt-4 flex items-center gap-2 px-4 py-3"
                style={{ border: "1px solid var(--red)", background: "rgba(204,46,46,0.06)" }}>
                <X size={14} style={{ color: "var(--red)" }} />
                <span className="mono text-xs font-bold" style={{ color: "var(--red)" }}>{error}</span>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Watchlist workspace */}
      <div
        className="w-full max-w-[820px] mt-4 fade-up fade-up-4 text-left"
        style={{
          border: "1px solid var(--border)",
          background: "var(--bg-surface)",
          borderRadius: "var(--r-card)",
          boxShadow: "0 2px 12px rgba(0,0,0,0.04)",
        }}
      >
        {/* Header */}
        <div className="p-4 sm:p-6" style={{ borderBottom: "1px solid var(--border-subtle)" }}>
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2.5 sm:gap-3">
              <div
                className="flex items-center justify-center shrink-0"
                style={{
                  width: 30, height: 30, borderRadius: "var(--r-sm)",
                  background: "var(--accent-dim)",
                }}
              >
                <Bookmark size={14} style={{ color: "var(--accent)" }} />
              </div>
              <div>
                <h2 className="text-base sm:text-xl font-bold leading-tight" style={{ color: "var(--text)" }}>
                  Watchlist
                </h2>
                <p className="text-[11px] sm:text-sm" style={{ color: "var(--text-muted)" }}>
                  {watchlist.length} saved · {groups.length} groups
                </p>
              </div>
            </div>
            <Link
              href="/account"
              className="flex items-center gap-1.5 px-2.5 py-1.5 sm:px-3 sm:py-2 tag font-bold transition-colors"
              style={{
                border: "1px solid var(--border)",
                color: "var(--text-muted)",
                borderRadius: "var(--r-sm)",
                background: "var(--bg)",
              }}
              onMouseEnter={(e) => { e.currentTarget.style.borderColor = "var(--accent)"; e.currentTarget.style.color = "var(--accent)"; }}
              onMouseLeave={(e) => { e.currentTarget.style.borderColor = "var(--border)"; e.currentTarget.style.color = "var(--text-muted)"; }}
            >
              {user ? <UserRound size={12} /> : <Lock size={12} />}
              <span className="hidden sm:inline">{user ? "ACCOUNT" : "SIGN IN"}</span>
            </Link>
          </div>

          {/* Sync status */}
          <div className="flex items-center gap-2 mt-2.5 sm:mt-3">
            <span
              className="w-1.5 h-1.5 rounded-full shrink-0"
              style={{ background: user ? "var(--green)" : "var(--text-faint)" }}
            />
            <p className="text-[11px] sm:text-xs truncate" style={{ color: watchlistError ? "var(--red)" : "var(--text-faint)" }}>
              {watchlistLoading
                ? "Loading saved watchlist..."
                : watchlistError
                ? watchlistError
                : user
                ? `Synced as ${user.email}`
                : "Local only — sign in to sync across devices"}
            </p>
          </div>
        </div>

        {/* Nested tree: groups with addresses indented below */}
        <div className="p-4 sm:p-6">
          {groups.map((group) => {
            const entries = watchlist.filter((entry) => entry.groupId === group.id);
            const isActive = group.id === activeGroupId;
            return (
              <div key={group.id} className="mb-3 sm:mb-4 last:mb-0">
                {/* Group header row */}
                <div
                  className="flex items-center gap-2 px-2.5 sm:px-3 py-2 sm:py-2.5 transition-colors cursor-pointer"
                  style={{
                    borderRadius: "var(--r-sm)",
                    background: isActive ? "var(--accent-dim)" : "var(--bg)",
                    border: "1px solid var(--border-subtle)",
                  }}
                  onClick={() => setActiveGroupId(group.id)}
                >
                  <span
                    className="flex items-center justify-center shrink-0"
                    style={{ width: 18, height: 18 }}
                  >
                    <Folder size={12} style={{ color: isActive ? "var(--accent)" : "var(--text-faint)" }} />
                  </span>
                  <span className="tag font-bold text-xs sm:text-sm" style={{ color: "var(--text)" }}>
                    {group.name}
                  </span>
                  <span
                    className="mono text-[9px] sm:text-[10px] font-bold px-1.5 py-0.5"
                    style={{
                      color: "var(--text-faint)",
                      border: "1px solid var(--border-subtle)",
                      borderRadius: "var(--r-sm)",
                    }}
                  >
                    {entries.length}
                  </span>
                  <div className="flex-1" />
                  {groups.length > 1 && (
                    <button
                      onClick={(e) => { e.stopPropagation(); void deleteGroup(group.id); }}
                      className="flex items-center justify-center w-5 h-5 transition-colors"
                      style={{ color: "var(--text-faint)", borderRadius: "50%" }}
                      onMouseEnter={(e) => { e.currentTarget.style.color = "var(--red)"; e.currentTarget.style.background = "rgba(204,46,46,0.08)"; }}
                      onMouseLeave={(e) => { e.currentTarget.style.color = "var(--text-faint)"; e.currentTarget.style.background = "transparent"; }}
                      title={`Delete ${group.name}`}
                    >
                      <X size={11} />
                    </button>
                  )}
                </div>

                {/* Addresses indented under group */}
                {entries.length > 0 && (
                  <div className="ml-3 sm:ml-4 mt-1 sm:mt-1.5 border-l" style={{ borderColor: "var(--border-subtle)" }}>
                    {entries.map((entry) => (
                      <div
                        key={entry.id}
                        className="flex items-center gap-2 sm:gap-3 pl-3 sm:pl-4 pr-2 py-1.5 sm:py-2 transition-colors"
                        onMouseEnter={(e) => { e.currentTarget.style.background = "var(--bg)"; }}
                        onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; }}
                      >
                        <span
                          className="w-1.5 h-1.5 rounded-full shrink-0"
                          style={{ background: entry.color }}
                        />
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-1.5">
                            <span className="font-bold text-xs sm:text-sm truncate" style={{ color: "var(--text)" }}>{entry.name}</span>
                            {entry.address === searchInput.trim() && <Check size={10} style={{ color: "var(--green)" }} />}
                          </div>
                          <span className="mono text-[9px] sm:text-[10px] break-all" style={{ color: "var(--text-faint)" }}>
                            {entry.address.slice(0, 10)}…{entry.address.slice(-6)}
                          </span>
                        </div>
                        <div className="flex items-center gap-1 sm:gap-1.5 shrink-0">
                          <button
                            onClick={() => onTrackAddress(entry.address)}
                            className="px-2 sm:px-2.5 py-1 tag font-bold text-[9px] sm:text-[10px] transition-colors"
                            style={{
                              border: "1px solid var(--border)",
                              color: "var(--text-muted)",
                              borderRadius: "var(--r-sm)",
                            }}
                            onMouseEnter={(e) => { e.currentTarget.style.background = "var(--accent)"; e.currentTarget.style.color = "var(--accent-fg)"; e.currentTarget.style.borderColor = "var(--accent)"; }}
                            onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; e.currentTarget.style.color = "var(--text-muted)"; e.currentTarget.style.borderColor = "var(--border)"; }}
                          >
                            TRACK
                          </button>
                          <button
                            onClick={() => removeWatchlistEntry(entry.id)}
                            className="flex items-center justify-center w-5 h-5 sm:w-6 sm:h-6 transition-colors"
                            style={{ color: "var(--text-faint)", borderRadius: "var(--r-sm)" }}
                            onMouseEnter={(e) => { e.currentTarget.style.color = "var(--red)"; e.currentTarget.style.background = "rgba(204,46,46,0.08)"; }}
                            onMouseLeave={(e) => { e.currentTarget.style.color = "var(--text-faint)"; e.currentTarget.style.background = "transparent"; }}
                            title="Remove"
                          >
                            <X size={11} />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {entries.length === 0 && (
                  <div className="ml-3 sm:ml-4 mt-1 sm:mt-1.5 pl-3 sm:pl-4 py-1.5 sm:py-2 border-l" style={{ borderColor: "var(--border-subtle)" }}>
                    <span className="text-[11px] sm:text-xs" style={{ color: "var(--text-faint)" }}>No addresses yet</span>
                  </div>
                )}
              </div>
            );
          })}

          {/* Add group inline */}
          <div className="flex items-center gap-2 mt-2.5 sm:mt-3 pt-2.5 sm:pt-3" style={{ borderTop: "1px solid var(--border-subtle)" }}>
            <input
              value={newGroupName}
              onChange={(e) => setNewGroupName(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") void addGroup(); }}
              placeholder="New group name…"
              className="flex-1 bg-transparent outline-none text-xs sm:text-sm px-3 py-2"
              style={{
                border: "1px solid var(--border)",
                color: "var(--text)",
                borderRadius: "var(--r-sm)",
                background: "var(--bg)",
              }}
            />
            <button
              onClick={() => void addGroup()}
              className="flex items-center justify-center gap-1.5 px-3 py-2 tag font-bold transition-colors"
              style={{
                border: "1px solid var(--border)",
                color: "var(--text-muted)",
                borderRadius: "var(--r-sm)",
                background: "var(--bg)",
              }}
              onMouseEnter={(e) => { e.currentTarget.style.borderColor = "var(--accent)"; e.currentTarget.style.color = "var(--accent)"; }}
              onMouseLeave={(e) => { e.currentTarget.style.borderColor = "var(--border)"; e.currentTarget.style.color = "var(--text-muted)"; }}
            >
              <Plus size={12} />
              GROUP
            </button>
          </div>

          {/* Add address form — adds to active group */}
          <div className="mt-2.5 sm:mt-3 pt-2.5 sm:pt-3" style={{ borderTop: "1px solid var(--border-subtle)" }}>
            <div className="flex items-center gap-2 mb-2">
              <span className="tag text-[10px] sm:text-xs" style={{ color: "var(--text-faint)" }}>
                ADD TO: <span style={{ color: "var(--accent)" }}>{groups.find((g) => g.id === activeGroupId)?.name ?? "—"}</span>
              </span>
            </div>
            <div className="flex flex-col sm:flex-row gap-2">
              <input
                value={entryName}
                onChange={(e) => setEntryName(e.target.value)}
                placeholder="Name (e.g. My Whale)"
                className="flex-1 bg-transparent outline-none text-xs sm:text-sm px-3 py-2 sm:py-2.5"
                style={{
                  border: "1px solid var(--border)",
                  color: "var(--text)",
                  borderRadius: "var(--r-sm)",
                  background: "var(--bg)",
                }}
              />
              <input
                value={entryAddress}
                onChange={(e) => setEntryAddress(e.target.value)}
                placeholder={searchInput.trim() ? "Use typed address or paste another" : "0x… wallet address"}
                className="flex-1 bg-transparent outline-none mono text-xs sm:text-sm px-3 py-2 sm:py-2.5"
                style={{
                  border: "1px solid var(--border)",
                  color: "var(--text)",
                  borderRadius: "var(--r-sm)",
                  background: "var(--bg)",
                }}
              />
              <div className="flex items-center gap-1.5 px-2 py-2 sm:py-2.5" style={{ border: "1px solid var(--border)", borderRadius: "var(--r-sm)", background: "var(--bg)" }}>
                {WATCHLIST_COLORS.map((color) => (
                  <button
                    key={color}
                    onClick={() => setEntryColor(color)}
                    aria-label={`Pick ${color}`}
                    className="w-4 h-4 transition-transform"
                    style={{
                      background: color,
                      borderRadius: "50%",
                      border: entryColor === color ? "2px solid var(--text)" : "2px solid transparent",
                      transform: entryColor === color ? "scale(1.15)" : "scale(1)",
                      boxShadow: entryColor === color ? `0 0 0 1px ${color}` : "none",
                    }}
                  />
                ))}
              </div>
              <button
                onClick={addWatchlistEntry}
                className="flex items-center justify-center gap-2 px-4 py-2 sm:py-2.5 tag font-bold transition-transform"
                style={{
                  background: "var(--accent)",
                  color: "var(--accent-fg)",
                  borderRadius: "var(--r-sm)",
                }}
              >
                <Plus size={14} />
                ADD
              </button>
            </div>
            {watchlistError && (
              <span className="mono text-[11px] sm:text-xs mt-2 block" style={{ color: "var(--red)" }}>{watchlistError}</span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

/* ════════════════════════════════════════════════════════════════
   PnL Calendar — daily PNL calendar heatmap
   ════════════════════════════════════════════════════════════════ */

interface DayBreakdown {
  total: number;
  spot: number;
  perps: number;
  vault: number;
}

function PnlCalendar({ chart, windowShort }: { chart: ChartPoint[]; windowShort: string }) {
  const [calMonth, setCalMonth] = useState(() => {
    if (chart.length > 0) {
      const last = new Date(chart[chart.length - 1].ts_ms);
      return new Date(Date.UTC(last.getUTCFullYear(), last.getUTCMonth(), 1));
    }
    return new Date(Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth(), 1));
  });
  const [hoveredCell, setHoveredCell] = useState<string | null>(null);

  const pnlByDay = new Map<string, DayBreakdown>();
  const sorted = [...chart].sort((a, b) => a.ts_ms - b.ts_ms);
  for (let i = 0; i < sorted.length; i++) {
    const d = new Date(sorted[i].ts_ms);
    const key = `${d.getUTCFullYear()}-${d.getUTCMonth()}-${d.getUTCDate()}`;
    const prev = i > 0 ? sorted[i - 1] : null;
    const dailyTotal = parseFloat(sorted[i].pnl_usd) - (prev ? parseFloat(prev.pnl_usd) : 0);
    const dailySpot = parseFloat(sorted[i].spot_pnl_usd) - (prev ? parseFloat(prev.spot_pnl_usd) : 0);
    const dailyPerps = parseFloat(sorted[i].perps_pnl_usd) - (prev ? parseFloat(prev.perps_pnl_usd) : 0);
    const dailyVault = parseFloat(sorted[i].vault_pnl_usd) - (prev ? parseFloat(prev.vault_pnl_usd) : 0);
    const existing = pnlByDay.get(key);
    pnlByDay.set(key, {
      total: (existing?.total ?? 0) + dailyTotal,
      spot: (existing?.spot ?? 0) + dailySpot,
      perps: (existing?.perps ?? 0) + dailyPerps,
      vault: (existing?.vault ?? 0) + dailyVault,
    });
  }

  const year = calMonth.getUTCFullYear();
  const month = calMonth.getUTCMonth();
  const monthName = new Date(Date.UTC(year, month, 1)).toLocaleDateString("en-US", { month: "long", year: "numeric", timeZone: "UTC" });

  const firstDay = new Date(Date.UTC(year, month, 1));
  const firstDayOfWeek = firstDay.getUTCDay();
  const daysInMonth = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();

  const cells: { day: number; month: number; year: number; current: boolean }[] = [];
  for (let i = 0; i < 42; i++) {
    const offset = i - firstDayOfWeek;
    if (offset < 0) {
      const d = new Date(Date.UTC(year, month, offset + 1));
      cells.push({ day: d.getUTCDate(), month: d.getUTCMonth(), year: d.getUTCFullYear(), current: false });
    } else if (offset >= daysInMonth) {
      const d = new Date(Date.UTC(year, month, offset + 1));
      cells.push({ day: d.getUTCDate(), month: d.getUTCMonth(), year: d.getUTCFullYear(), current: false });
    } else {
      cells.push({ day: offset + 1, month, year, current: true });
    }
  }

  const monthPnls: number[] = [];
  let activeDays = 0;
  for (let d = 1; d <= daysInMonth; d++) {
    const key = `${year}-${month}-${d}`;
    const bd = pnlByDay.get(key);
    if (bd !== undefined) {
      monthPnls.push(bd.total);
      activeDays++;
    }
  }
  const netPnl = monthPnls.reduce((a, b) => a + b, 0);
  const winDays = monthPnls.filter((p) => p > 0).length;
  const winRate = monthPnls.length > 0 ? (winDays / monthPnls.length) * 100 : 0;
  const best = monthPnls.length > 0 ? Math.max(...monthPnls) : 0;
  const worst = monthPnls.length > 0 ? Math.min(...monthPnls) : 0;

  const today = new Date();
  const todayKey = `${today.getUTCFullYear()}-${today.getUTCMonth()}-${today.getUTCDate()}`;

  const weekdays = ["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"];

  function goPrev() {
    setCalMonth(new Date(Date.UTC(year, month - 1, 1)));
  }
  function goNext() {
    setCalMonth(new Date(Date.UTC(year, month + 1, 1)));
  }

  const stats = [
    { label: "NET", value: netPnl, prefix: netPnl >= 0 ? "+" : "", color: netPnl >= 0 ? "var(--cal-green)" : "var(--cal-red)" },
    { label: "WIN RATE", value: `${winRate.toFixed(0)}%`, color: "var(--text)" },
    { label: "ACTIVE", value: `${activeDays}d`, color: "var(--text)" },
    { label: "BEST", value: best, prefix: "+", color: "var(--cal-green)" },
    { label: "WORST", value: worst, prefix: "", color: "var(--cal-red)" },
  ];

  return (
    <div className="relative" style={{ border: "1px solid var(--border)", background: "var(--bg-surface)" }}>
      <CornerMarks size={8} inset={-1} thickness={1} opacity={0.5} />
      <div className="flex flex-col sm:flex-row sm:min-h-[340px]">
        {/* LEFT SUMMARY PANEL */}
        <div
          className="shrink-0 flex flex-col gap-3 sm:gap-4 p-3 sm:p-4 cal-left-panel"
        >
          <div>
            <div className="tag mb-1" style={{ color: "var(--text-faint)", letterSpacing: "0.1em" }}>DAILY PNL</div>
            <div className="mono text-xl font-bold" style={{ color: "var(--text)" }}>{monthName}</div>
          </div>

          {/* Month navigation */}
          <div className="flex items-center gap-1">
            <button
              onClick={goPrev}
              className="flex items-center justify-center w-7 h-7 transition-colors"
              style={{ border: "1px solid var(--border)", color: "var(--text-muted)" }}
              onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.borderColor = "var(--accent)"; (e.currentTarget as HTMLElement).style.color = "var(--accent)"; }}
              onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.borderColor = "var(--border)"; (e.currentTarget as HTMLElement).style.color = "var(--text-muted)"; }}
            >
              <ChevronLeft size={14} />
            </button>
            <button
              onClick={goNext}
              className="flex items-center justify-center w-7 h-7 transition-colors"
              style={{ border: "1px solid var(--border)", color: "var(--text-muted)" }}
              onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.borderColor = "var(--accent)"; (e.currentTarget as HTMLElement).style.color = "var(--accent)"; }}
              onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.borderColor = "var(--border)"; (e.currentTarget as HTMLElement).style.color = "var(--text-muted)"; }}
            >
              <ChevronRight size={14} />
            </button>
            <span className="tag ml-1" style={{ color: "var(--text-faint)" }}>· {windowShort}</span>
          </div>

          {/* Stat cards 2-col grid */}
          <div className="grid grid-cols-3 sm:grid-cols-2 gap-2">
            {stats.map((s) => (
              <div
                key={s.label}
                className="flex flex-col gap-1 px-2.5 py-2"
                style={{ border: "1px solid var(--border-subtle)", borderRadius: 3, background: "var(--bg)" }}
              >
                <span className="tag" style={{ color: "var(--text-faint)", fontSize: 8, letterSpacing: "0.08em" }}>{s.label}</span>
                <span className="mono text-sm font-bold tabular-nums" style={{ color: s.color }}>
                  {typeof s.value === "number" ? `${s.prefix ?? ""}${fmt(s.value, 2)}` : s.value}
                </span>
              </div>
            ))}
          </div>

          {/* Legend */}
          <div className="hidden sm:flex items-center gap-2 mt-auto">
            <span className="tag" style={{ color: "var(--text-faint)" }}>LEGEND:</span>
            <div className="flex items-center gap-1">
              <div style={{ width: 7, height: 7, borderRadius: "50%", background: "var(--cal-green)" }} />
              <span className="tag" style={{ color: "var(--text-faint)" }}>PROFIT</span>
            </div>
            <div className="flex items-center gap-1">
              <div style={{ width: 7, height: 7, borderRadius: "50%", background: "var(--cal-red)" }} />
              <span className="tag" style={{ color: "var(--text-faint)" }}>LOSS</span>
            </div>
          </div>
        </div>

        {/* RIGHT CALENDAR PANEL */}
        <div className="flex-1 p-3 sm:p-4">
          {/* Weekday header */}
          <div className="grid grid-cols-7 gap-[3px] mb-[3px]">
            {weekdays.map((wd) => (
              <div key={wd} className="text-center">
                <span className="tag" style={{ color: "var(--text-faint)", fontSize: 8, letterSpacing: "0.08em" }}>{wd}</span>
              </div>
            ))}
          </div>

          {/* Calendar grid */}
          <div className="grid grid-cols-7 gap-[3px]">
            {cells.map((cell, i) => {
              const key = `${cell.year}-${cell.month}-${cell.day}`;
              const breakdown = cell.current ? pnlByDay.get(key) : undefined;
              const pnl = breakdown?.total;
              const hasData = pnl !== undefined;
              const isPositive = hasData && pnl > 0;
              const isNegative = hasData && pnl < 0;
              const isToday = key === todayKey;
              const isHovered = hoveredCell === key;

              let bg = "transparent";
              let borderColor = "var(--border-subtle)";
              let textColor = "var(--text)";

              if (!cell.current) {
                bg = "transparent";
                borderColor = "transparent";
                textColor = "var(--text-faint)";
              } else if (hasData) {
                if (isPositive) {
                  bg = "var(--cal-green-tint)";
                  borderColor = "var(--cal-green-edge)";
                } else if (isNegative) {
                  bg = "var(--cal-red-tint)";
                  borderColor = "var(--cal-red-edge)";
                }
              } else if (isToday) {
                bg = "var(--bg-elevated)";
                borderColor = "var(--border)";
              }

              return (
                <div
                  key={i}
                  className="heat-cell relative flex flex-col"
                  style={{
                    aspectRatio: "1",
                    background: bg,
                    border: `1px solid ${borderColor}`,
                    borderRadius: 3,
                    animationDelay: `${i * 6}ms`,
                    opacity: cell.current ? 1 : 0.35,
                    cursor: hasData ? "pointer" : "default",
                    zIndex: isHovered ? 10 : 1,
                  }}
                  onMouseEnter={() => hasData && setHoveredCell(key)}
                  onMouseLeave={() => setHoveredCell(null)}
                >
                  {/* Day number top-left */}
                  <span
                    className="mono text-[10px] font-medium leading-none px-1 pt-1"
                    style={{ color: textColor, opacity: cell.current ? 0.7 : 0.4 }}
                  >
                    {cell.day}
                  </span>

                  {/* Dot top-right */}
                  {hasData && cell.current && (
                    <div
                      style={{
                        position: "absolute",
                        top: 5,
                        right: 5,
                        width: 5,
                        height: 5,
                        borderRadius: "50%",
                        background: isPositive ? "var(--cal-green)" : isNegative ? "var(--cal-red)" : "var(--text-faint)",
                      }}
                    />
                  )}

                  {/* PNL value bottom */}
                  {hasData && cell.current && (
                    <span
                      className="mono text-[10px] font-bold tabular-nums leading-none mt-auto px-1 pb-1 text-right heat-cell-value"
                      style={{
                        color: isPositive ? "var(--cal-green)" : isNegative ? "var(--cal-red)" : "var(--text-muted)",
                      }}
                    >
                      {isPositive ? "+" : ""}{fmt(pnl, 0)}
                    </span>
                  )}

                  {/* Breakdown tooltip on hover */}
                  {isHovered && hasData && breakdown && (
                    <div
                      className="absolute"
                      style={{
                        bottom: "100%",
                        left: "50%",
                        transform: "translateX(-50%)",
                        marginBottom: 6,
                        padding: "8px 10px",
                        background: "var(--bg)",
                        border: "1px solid var(--border)",
                        borderRadius: 4,
                        boxShadow: "0 4px 16px rgba(0,0,0,0.4)",
                        whiteSpace: "nowrap",
                        zIndex: 20,
                        pointerEvents: "none",
                      }}
                    >
                      <div className="tag mb-1.5" style={{ color: "var(--text-faint)", fontSize: 8 }}>
                        {new Date(Date.UTC(cell.year, cell.month, cell.day)).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" })}
                      </div>
                      {[
                        { label: "SPOT", value: breakdown.spot },
                        { label: "PERPS", value: breakdown.perps },
                        { label: "VAULT", value: breakdown.vault },
                        { label: "TOTAL", value: breakdown.total },
                      ].map((row) => {
                        const v = row.value;
                        const isTotal = row.label === "TOTAL";
                        return (
                          <div key={row.label} className="flex items-center justify-between gap-3" style={{ marginBottom: isTotal ? 0 : 2 }}>
                            <span className="tag" style={{ color: isTotal ? "var(--text)" : "var(--text-faint)", fontSize: 8 }}>
                              {isTotal && "─ "}{row.label}
                            </span>
                            <span
                              className="mono text-[10px] font-bold tabular-nums"
                              style={{
                                color: v > 0 ? "var(--cal-green)" : v < 0 ? "var(--cal-red)" : "var(--text-muted)",
                                borderTop: isTotal ? "1px solid var(--border-subtle)" : "none",
                                paddingTop: isTotal ? 4 : 0,
                                marginTop: isTotal ? 2 : 0,
                              }}
                            >
                              {v >= 0 ? "+" : ""}{fmt(v, 2)}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}

/* ════════════════════════════════════════════════════════════════
   Recent trades table
   ════════════════════════════════════════════════════════════════ */

const TRADE_COLS = "minmax(110px,1fr) 60px 60px 90px 90px 90px";

function RecentTradesTable({ trades }: { trades: MergedTrade[] }) {
  const [page, setPage] = useState(0);
  const pageSize = 7;
  const totalPages = Math.ceil(trades.length / pageSize);
  const pageTrades = trades.slice(page * pageSize, (page + 1) * pageSize);

  return (
    <div className="relative" style={{ border: "1px solid var(--border)", background: "var(--bg-surface)" }}>
      <CornerMarks size={8} inset={-1} thickness={1} opacity={0.5} />

      {/* Desktop: table */}
      <div className="hidden sm:block overflow-x-auto">
        <div style={{ minWidth: 600 }}>
          {/* Header */}
          <div
            className="grid items-center px-4 py-3"
            style={{ gridTemplateColumns: TRADE_COLS, gap: 12, borderBottom: "1px solid var(--border)" }}
          >
            <span className="tag" style={{ color: "var(--text-faint)" }}>MARKET</span>
            <span className="tag" style={{ color: "var(--text-faint)" }}>SIDE</span>
            <span className="tag" style={{ color: "var(--text-faint)" }}>TYPE</span>
            <span className="tag text-right" style={{ color: "var(--text-faint)" }}>SIZE</span>
            <span className="tag text-right" style={{ color: "var(--text-faint)" }}>PRICE</span>
            <span className="tag text-right" style={{ color: "var(--text-faint)" }}>VALUE</span>
          </div>

          {/* Rows */}
          {pageTrades.map((t, i) => {
            const isBuy = t.side === "buy";
            return (
              <div
                key={t.id}
                className="lb-row grid items-center px-4 group"
                style={{
                  gridTemplateColumns: TRADE_COLS,
                  gap: 12,
                  height: 52,
                  borderBottom: i < pageTrades.length - 1 ? "1px solid var(--border-subtle)" : "none",
                  animationDelay: `${Math.min(i * 30, 500)}ms`,
                  transition: "background 0.15s",
                }}
                onMouseEnter={(e) => ((e.currentTarget as HTMLElement).style.background = "var(--bg-elevated)")}
                onMouseLeave={(e) => ((e.currentTarget as HTMLElement).style.background = "transparent")}
              >
                {/* Market */}
                <div className="flex items-center gap-2 min-w-0">
                  <TokenIcon symbol={t.market} size={20} />
                  <span className="mono text-xs font-bold truncate" style={{ color: "var(--text)" }}>{t.market}</span>
                </div>

                {/* Side */}
                <div className="flex items-center gap-1">
                  {isBuy ? (
                    <ArrowUpRight size={12} style={{ color: "var(--green)" }} />
                  ) : (
                    <ArrowDownRight size={12} style={{ color: "var(--red)" }} />
                  )}
                  <span
                    className="mono text-xs font-bold"
                    style={{ color: isBuy ? "var(--green)" : "var(--red)" }}
                  >
                    {t.side.toUpperCase()}
                  </span>
                </div>

                {/* Type */}
                <span className="mono text-xs" style={{ color: t.type === "perps" ? "var(--accent)" : "var(--text-muted)" }}>
                  {t.type.toUpperCase()}
                </span>

                {/* Size */}
                <span className="mono text-xs text-right tabular-nums" style={{ color: "var(--text)" }}>
                  {t.size}
                </span>

                {/* Price */}
                <span className="mono text-xs text-right tabular-nums" style={{ color: "var(--text-muted)" }}>
                  ${t.price.toLocaleString()}
                </span>

                {/* Value */}
                <span className="mono text-xs text-right font-bold tabular-nums" style={{ color: "var(--text)" }}>
                  {fmt(t.value)}
                </span>
              </div>
            );
          })}
        </div>
      </div>

      {/* Mobile: compact cards */}
      <div className="sm:hidden flex flex-col gap-2 p-3">
        {pageTrades.map((t) => {
          const isBuy = t.side === "buy";
          return (
            <div
              key={t.id}
              className="flex items-center gap-2.5 px-3 py-2"
              style={{ border: "1px solid var(--border-subtle)", borderRadius: 4, background: "var(--bg)" }}
            >
              <TokenIcon symbol={t.market} size={20} />
              <div className="min-w-0 flex-1">
                <div className="flex items-center justify-between">
                  <span className="mono text-xs font-bold" style={{ color: "var(--text)" }}>{t.market}</span>
                  <span className="mono text-xs font-bold tabular-nums" style={{ color: "var(--text)" }}>
                    {fmt(t.value)}
                  </span>
                </div>
                <div className="flex items-center gap-1.5 mt-0.5">
                  <span
                    className="mono text-[10px] font-bold"
                    style={{ color: isBuy ? "var(--green)" : "var(--red)" }}
                  >
                    {isBuy ? "BUY" : "SELL"}
                  </span>
                  <span style={{ width: 2, height: 2, borderRadius: "50%", background: "var(--text-faint)" }} />
                  <span className="mono text-[10px]" style={{ color: t.type === "perps" ? "var(--accent)" : "var(--text-muted)" }}>
                    {t.type.toUpperCase()}
                  </span>
                  <span style={{ width: 2, height: 2, borderRadius: "50%", background: "var(--text-faint)" }} />
                  <span className="mono text-[10px]" style={{ color: "var(--text-faint)" }}>
                    {t.size} @ ${t.price.toLocaleString()}
                  </span>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Footer with pagination */}
      <div className="px-4 py-2.5 flex items-center justify-between" style={{ borderTop: "1px solid var(--border-subtle)" }}>
        <span className="tag text-[9px] sm:text-xs" style={{ color: "var(--text-faint)" }}>
          {trades.length > 0 ? `${page * pageSize + 1}–${Math.min((page + 1) * pageSize, trades.length)}` : "NO TRADES"}
        </span>
        {totalPages > 1 && (
          <div className="flex items-center gap-1">
            <button
              onClick={() => setPage((p) => Math.max(0, p - 1))}
              disabled={page === 0}
              className="flex items-center justify-center w-6 h-6 sm:w-7 sm:h-7 transition-colors disabled:opacity-30"
              style={{ border: "1px solid var(--border)", color: "var(--text-muted)" }}
            >
              <ChevronLeft size={14} />
            </button>
            <span className="tag px-2 text-[9px] sm:text-xs" style={{ color: "var(--text-faint)" }}>
              {page + 1}/{totalPages}
            </span>
            <button
              onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
              disabled={page === totalPages - 1}
              className="flex items-center justify-center w-6 h-6 sm:w-7 sm:h-7 transition-colors disabled:opacity-30"
              style={{ border: "1px solid var(--border)", color: "var(--text-muted)" }}
            >
              <ChevronRight size={14} />
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

/* ════════════════════════════════════════════════════════════════
   PnL Chart (SVG)
   ════════════════════════════════════════════════════════════════ */

function PnlChart({ chart, windowShort }: { chart: ChartPoint[]; windowShort: string }) {
  const [hoverIdx, setHoverIdx] = useState<number | null>(null);
  const svgRef = useRef<SVGSVGElement>(null);

  if (chart.length < 2) {
    return (
      <div className="relative" style={{ border: "1px solid var(--border)", background: "var(--bg-surface)" }}>
        <CornerMarks size={8} inset={-1} thickness={1} opacity={0.5} />
          <div className="p-5 flex items-center justify-center" style={{ height: 200 }}>
          <span className="mono text-sm" style={{ color: "var(--text-faint)" }}>NO CHART DATA FOR {windowShort}</span>
        </div>
      </div>
    );
  }

  const W = 1000;
  const H = 240;
  const padL = 50;
  const padR = 20;
  const padT = 20;
  const padB = 30;
  const plotW = W - padL - padR;
  const plotH = H - padT - padB;

  const pnls = chart.map((p) => parseFloat(p.pnl_usd));
  const minPnl = Math.min(...pnls, 0);
  const maxPnl = Math.max(...pnls, 0);
  const range = maxPnl - minPnl || 1;

  const xStep = plotW / (chart.length - 1);
  const yOf = (pnl: number) => padT + plotH - ((pnl - minPnl) / range) * plotH;
  const points = chart.map((p, i) => {
    const x = padL + i * xStep;
    const y = yOf(parseFloat(p.pnl_usd));
    return { x, y, pnl: parseFloat(p.pnl_usd), ts: p.ts_ms };
  });

  const zeroY = yOf(0);
  const finalPnl = pnls[pnls.length - 1];
  const isPositive = finalPnl >= 0;
  const lineColor = isPositive ? "var(--cal-green)" : "var(--cal-red)";
  const fillColor = isPositive ? "var(--cal-green-tint)" : "var(--cal-red-tint)";

  /* Build smooth path using cardinal spline (Catmull-Rom → Bezier) */
  function buildSmoothPath(pts: { x: number; y: number }[]): string {
    if (pts.length < 2) return "";
    const tension = 0.3;
    let d = `M ${pts[0].x.toFixed(1)} ${pts[0].y.toFixed(1)}`;
    for (let i = 0; i < pts.length - 1; i++) {
      const p0 = pts[i - 1] || pts[i];
      const p1 = pts[i];
      const p2 = pts[i + 1];
      const p3 = pts[i + 2] || p2;
      const cp1x = p1.x + (p2.x - p0.x) * tension;
      const cp1y = p1.y + (p2.y - p0.y) * tension;
      const cp2x = p2.x - (p3.x - p1.x) * tension;
      const cp2y = p2.y - (p3.y - p1.y) * tension;
      d += ` C ${cp1x.toFixed(1)} ${cp1y.toFixed(1)}, ${cp2x.toFixed(1)} ${cp2y.toFixed(1)}, ${p2.x.toFixed(1)} ${p2.y.toFixed(1)}`;
    }
    return d;
  }

  function buildSmoothSegments(pts: { x: number; y: number; pnl: number }[]): { d: string; color: string }[] {
    const segs: { d: string; color: string }[] = [];
    let current: { x: number; y: number; pnl: number }[] = [pts[0]];
    for (let i = 1; i < pts.length; i++) {
      const prev = pts[i - 1];
      const curr = pts[i];
      const prevSign = Math.sign(prev.pnl);
      const currSign = Math.sign(curr.pnl);
      if (prevSign === currSign || prevSign === 0 || currSign === 0) {
        current.push(curr);
      } else {
        const t = Math.abs(prev.pnl) / (Math.abs(prev.pnl) + Math.abs(curr.pnl));
        const crossX = prev.x + (curr.x - prev.x) * t;
        const crossY = zeroY;
        current.push({ x: crossX, y: crossY, pnl: 0 });
        const segColor = prev.pnl > 0 ? "var(--cal-green)" : "var(--cal-red)";
        segs.push({ d: buildSmoothPath(current), color: segColor });
        current = [{ x: crossX, y: crossY, pnl: 0 }, curr];
      }
    }
    if (current.length > 1) {
      const segColor = current[current.length - 1].pnl > 0 ? "var(--cal-green)" : "var(--cal-red)";
      segs.push({ d: buildSmoothPath(current), color: segColor });
    }
    return segs;
  }

  const segments = buildSmoothSegments(points);
  const smoothPathD = buildSmoothPath(points);
  const areaD = `${smoothPathD} L ${points[points.length - 1].x.toFixed(1)} ${padT + plotH} L ${padL} ${padT + plotH} Z`;

  const yTicks = 4;
  const tickVals: number[] = [];
  for (let i = 0; i <= yTicks; i++) tickVals.push(minPnl + (range * i) / yTicks);

  const xLabelCount = Math.min(chart.length, 6);
  const xLabelIdxs = Array.from({ length: xLabelCount }, (_, i) =>
    Math.round((i * (chart.length - 1)) / (xLabelCount - 1))
  );

  function fmtXLabel(ts: number): string {
    const d = new Date(ts);
    if (windowShort === "1Y") {
      return d.toLocaleDateString("en-US", { month: "short", year: "2-digit", timeZone: "UTC" });
    }
    return d.toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
  }

  function handleMouseMove(e: React.MouseEvent<SVGSVGElement>) {
    const svg = svgRef.current;
    if (!svg) return;
    const rect = svg.getBoundingClientRect();
    const xRatio = (e.clientX - rect.left) / rect.width;
    const svgX = xRatio * W;
    const idx = Math.round((svgX - padL) / xStep);
    setHoverIdx(Math.max(0, Math.min(idx, points.length - 1)));
  }

  const hovered = hoverIdx !== null ? points[hoverIdx] : null;

  return (
    <div className="relative" style={{ border: "1px solid var(--border)", background: "var(--bg-surface)" }}>
      <CornerMarks size={8} inset={-1} thickness={1} opacity={0.5} />
      <div className="p-3 sm:p-5">
        <div className="flex items-center justify-between mb-2 sm:mb-3">
          <div className="flex items-center gap-2">
            <TrendingUp size={14} style={{ color: "var(--accent)" }} />
            <span className="tag" style={{ color: "var(--accent)" }}>PNL CHART · {windowShort}</span>
          </div>
          <span className="mono text-xs font-bold" style={{ color: hovered ? (hovered.pnl >= 0 ? "var(--cal-green)" : "var(--cal-red)") : lineColor }}>
            {hovered ? `${hovered.pnl >= 0 ? "+" : ""}${fmt(hovered.pnl)}` : `${isPositive ? "+" : ""}${fmt(finalPnl)}`}
          </span>
        </div>
        <div className="relative">
          <svg
            ref={svgRef}
            viewBox={`0 0 ${W} ${H}`}
            className="w-full pnl-chart-svg"
            style={{ display: "block", cursor: "crosshair" }}
            preserveAspectRatio="none"
            onMouseMove={handleMouseMove}
            onMouseLeave={() => setHoverIdx(null)}
          >
            {/* Y-axis grid + labels */}
            {tickVals.map((v, i) => {
              const y = yOf(v);
              return (
                <g key={i}>
                  <line x1={padL} y1={y} x2={W - padR} y2={y} stroke="var(--border-subtle)" strokeWidth={0.5} />
                  <text x={padL - 6} y={y + 3} textAnchor="end" fontSize={9} fill="var(--text-faint)" className="mono">
                    {fmt(v, 0)}
                  </text>
                </g>
              );
            })}
            {/* Zero line */}
            {zeroY > padT && zeroY < padT + plotH && (
              <line x1={padL} y1={zeroY} x2={W - padR} y2={zeroY} stroke="var(--text-faint)" strokeWidth={0.5} strokeDasharray="4 4" />
            )}
            {/* Area fill */}
            <path d={areaD} fill={fillColor} />
            {/* Smooth line — split into green/red segments */}
            {segments.map((seg, i) => (
              <path key={i} d={seg.d} fill="none" stroke={seg.color} strokeWidth={1.5} />
            ))}
            {/* X-axis labels */}
            {xLabelIdxs.map((idx) => {
              const p = points[idx];
              return (
                <text key={idx} x={p.x} y={H - 8} textAnchor="middle" fontSize={9} fill="var(--text-faint)" className="mono">
                  {fmtXLabel(p.ts)}
                </text>
              );
            })}
            {/* Hover crosshair + dot */}
            {hovered && (
              <g pointerEvents="none">
                <line x1={hovered.x} x2={hovered.x} y1={padT} y2={padT + plotH} stroke="var(--accent)" strokeWidth={0.8} opacity={0.5} strokeDasharray="3 3" />
                <circle cx={hovered.x} cy={hovered.y} r={4} fill="var(--bg-surface)" stroke={hovered.pnl >= 0 ? "var(--cal-green)" : "var(--cal-red)"} strokeWidth={2} />
              </g>
            )}
          </svg>
          {/* Hover tooltip */}
          {hovered && (
            <div
              className="absolute pointer-events-none z-10"
              style={{
                left: `${(hovered.x / W) * 100}%`,
                top: 0,
                transform: "translateX(-50%)",
                marginTop: 4,
              }}
            >
              <div
                className="px-2.5 py-1.5 whitespace-nowrap"
                style={{
                  background: "var(--bg-elevated)",
                  border: "1px solid var(--border)",
                }}
              >
                <div className="tag mb-0.5" style={{ color: "var(--text-faint)" }}>
                  {new Date(hovered.ts).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" })}
                </div>
                <div className="mono text-xs font-bold" style={{ color: hovered.pnl >= 0 ? "var(--cal-green)" : "var(--cal-red)" }}>
                  {hovered.pnl >= 0 ? "+" : ""}{fmt(hovered.pnl)}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/* ════════════════════════════════════════════════════════════════
   Position history table
   ════════════════════════════════════════════════════════════════ */

const POS_COLS = "minmax(90px,1fr) 60px 70px 80px 80px 90px 90px 36px";

function PositionHistoryTable({ positions, perpsMap }: { positions: PositionHistoryItem[]; perpsMap: Map<number, string> }) {
  const [page, setPage] = useState(0);
  const [sharePos, setSharePos] = useState<ShareablePosition | null>(null);
  const pageSize = 7;
  const totalPages = Math.ceil(positions.length / pageSize);
  const pagePositions = positions.slice(page * pageSize, (page + 1) * pageSize);

  return (
    <>
    {sharePos && <PositionShareCard position={sharePos} onClose={() => setSharePos(null)} />}
    <div className="relative" style={{ border: "1px solid var(--border)", background: "var(--bg-surface)" }}>
      <CornerMarks size={8} inset={-1} thickness={1} opacity={0.5} />

      {/* Desktop: table */}
      <div className="hidden sm:block overflow-x-auto">
        <div style={{ minWidth: 600 }}>
          {/* Header */}
          <div
            className="grid items-center px-4 py-3"
            style={{ gridTemplateColumns: POS_COLS, gap: 12, borderBottom: "1px solid var(--border)" }}
          >
            <span className="tag" style={{ color: "var(--text-faint)" }}>MARKET</span>
            <span className="tag" style={{ color: "var(--text-faint)" }}>SIDE</span>
            <span className="tag" style={{ color: "var(--text-faint)" }}>MARGIN</span>
            <span className="tag text-right" style={{ color: "var(--text-faint)" }}>SIZE</span>
            <span className="tag text-right" style={{ color: "var(--text-faint)" }}>ENTRY</span>
            <span className="tag text-right" style={{ color: "var(--text-faint)" }}>EXIT</span>
            <span className="tag text-right" style={{ color: "var(--text-faint)" }}>REALIZED PNL</span>
            <span />
          </div>

          {/* Rows */}
          {pagePositions.map((p, i) => {
            const name = perpsMap.get(p.symbol_id) || `Sym-${p.symbol_id}`;
            const realizedPnl = parseFloat(p.realized_pnl);
            const positive = realizedPnl >= 0;
            const size = parseFloat(p.size);
            const entry = parseFloat(p.avg_entry_price);
            const exit = parseFloat(p.avg_close_price);
            return (
              <div
                key={p.position_id}
                className="lb-row grid items-center px-4 group"
                style={{
                  gridTemplateColumns: POS_COLS,
                  gap: 12,
                  height: 52,
                  borderBottom: i < pagePositions.length - 1 ? "1px solid var(--border-subtle)" : "none",
                  animationDelay: `${Math.min(i * 30, 500)}ms`,
                  transition: "background 0.15s",
                }}
                onMouseEnter={(e) => ((e.currentTarget as HTMLElement).style.background = "var(--bg-elevated)")}
                onMouseLeave={(e) => ((e.currentTarget as HTMLElement).style.background = "transparent")}
              >

                {/* Market */}
                <div className="flex items-center gap-2 min-w-0">
                  <TokenIcon symbol={name} size={20} />
                  <span className="mono text-xs font-bold truncate" style={{ color: "var(--text)" }}>{name}</span>
                </div>

                {/* Side */}
                <span className="mono text-xs font-bold" style={{ color: isPositionLong(p.position_side, p.size) ? "var(--green)" : "var(--red)" }}>
                  {sideLabel(p.position_side === 1 ? (parseFloat(p.size) > 0 ? 2 : 3) : p.position_side)}
                </span>

                {/* Margin mode */}
                <span className="mono text-xs" style={{ color: "var(--text-muted)" }}>
                  {marginModeLabel(p.margin_mode)}
                </span>

                {/* Size */}
                <span className="mono text-xs text-right tabular-nums" style={{ color: "var(--text)" }}>
                  {size}
                </span>

                {/* Entry */}
                <span className="mono text-xs text-right tabular-nums" style={{ color: "var(--text-muted)" }}>
                  {entry > 0 ? `$${entry.toLocaleString()}` : "—"}
                </span>

                {/* Exit */}
                <span className="mono text-xs text-right tabular-nums" style={{ color: "var(--text-muted)" }}>
                  {exit > 0 ? `$${exit.toLocaleString()}` : "—"}
                </span>

                {/* Realized PnL */}
                <span
                  className="mono text-xs text-right font-bold tabular-nums"
                  style={{ color: positive ? "var(--green)" : "var(--red)" }}
                >
                  {positive ? "+" : ""}{fmt(realizedPnl)}
                </span>

                {/* Share */}
                <button
                  onClick={() => setSharePos({
                    symbol: name,
                    side: isPositionLong(p.position_side, p.size) ? "LONG" : "SHORT",
                    leverage: p.leverage,
                    entryPrice: entry,
                    exitPrice: exit > 0 ? exit : null,
                    markPrice: null,
                    pnl: realizedPnl,
                    roiPct: entry > 0 && parseFloat(p.initial_margin) > 0 ? (realizedPnl / parseFloat(p.initial_margin)) * 100 : realizedPnl,
                    createdAt: p.created_at,
                    updatedAt: p.updated_at,
                  })}
                  className="flex items-center justify-center w-7 h-7 transition-colors opacity-0 group-hover:opacity-100"
                  style={{ borderRadius: 6, color: "var(--text-faint)" }}
                  onMouseEnter={(e) => { e.currentTarget.style.color = "var(--accent)"; e.currentTarget.style.background = "var(--accent-dim)"; }}
                  onMouseLeave={(e) => { e.currentTarget.style.color = "var(--text-faint)"; e.currentTarget.style.background = "transparent"; }}
                  title="Share"
                >
                  <Share2 size={13} />
                </button>
              </div>
            );
          })}
        </div>
      </div>

      {/* Mobile: compact cards */}
      <div className="sm:hidden flex flex-col gap-2 p-3">
        {pagePositions.map((p) => {
          const name = perpsMap.get(p.symbol_id) || `Sym-${p.symbol_id}`;
          const realizedPnl = parseFloat(p.realized_pnl);
          const positive = realizedPnl >= 0;
          const size = parseFloat(p.size);
          const entry = parseFloat(p.avg_entry_price);
          const exit = parseFloat(p.avg_close_price);
          return (
            <div
              key={p.position_id}
              className="flex items-center gap-2.5 px-3 py-2"
              style={{ border: "1px solid var(--border-subtle)", borderRadius: 4, background: "var(--bg)" }}
            >
              <TokenIcon symbol={name} size={20} />
              <div className="min-w-0 flex-1">
                <div className="flex items-center justify-between">
                  <span className="mono text-xs font-bold" style={{ color: "var(--text)" }}>{name}</span>
                  <span
                    className="mono text-xs font-bold tabular-nums"
                    style={{ color: positive ? "var(--green)" : "var(--red)" }}
                  >
                    {positive ? "+" : ""}{fmt(realizedPnl)}
                  </span>
                </div>
                <div className="flex items-center gap-1.5 mt-0.5">
                  <span className="mono text-[10px] font-bold" style={{ color: isPositionLong(p.position_side, p.size) ? "var(--green)" : "var(--red)" }}>
                    {sideLabel(p.position_side === 1 ? (parseFloat(p.size) > 0 ? 2 : 3) : p.position_side)}
                  </span>
                  <span style={{ width: 2, height: 2, borderRadius: "50%", background: "var(--text-faint)" }} />
                  <span className="mono text-[10px]" style={{ color: "var(--text-muted)" }}>
                    {marginModeLabel(p.margin_mode)}
                  </span>
                  <span style={{ width: 2, height: 2, borderRadius: "50%", background: "var(--text-faint)" }} />
                  <span className="mono text-[10px]" style={{ color: "var(--text-faint)" }}>
                    {size} @ {entry > 0 ? `$${entry.toLocaleString()}` : "—"}
                  </span>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Footer with pagination */}
      <div className="px-4 py-2.5 flex items-center justify-between" style={{ borderTop: "1px solid var(--border-subtle)" }}>
        <span className="tag text-[9px] sm:text-xs" style={{ color: "var(--text-faint)" }}>
          {positions.length > 0 ? `${page * pageSize + 1}–${Math.min((page + 1) * pageSize, positions.length)}` : "NO POSITIONS"}
        </span>
        {totalPages > 1 && (
          <div className="flex items-center gap-1">
            <button
              onClick={() => setPage((p) => Math.max(0, p - 1))}
              disabled={page === 0}
              className="flex items-center justify-center w-6 h-6 sm:w-7 sm:h-7 transition-colors disabled:opacity-30"
              style={{ border: "1px solid var(--border)", color: "var(--text-muted)" }}
            >
              <ChevronLeft size={14} />
            </button>
            <span className="tag px-2 text-[9px] sm:text-xs" style={{ color: "var(--text-faint)" }}>
              {page + 1}/{totalPages}
            </span>
            <button
              onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
              disabled={page === totalPages - 1}
              className="flex items-center justify-center w-6 h-6 sm:w-7 sm:h-7 transition-colors disabled:opacity-30"
              style={{ border: "1px solid var(--border)", color: "var(--text-muted)" }}
            >
              <ChevronRight size={14} />
            </button>
          </div>
        )}
      </div>
    </div>
    </>
  );
}

/* ════════════════════════════════════════════════════════════════
   Open Positions — active perps positions from GW
   ════════════════════════════════════════════════════════════════ */

function OpenPositionsCard({ positions }: { positions: OpenPosition[] }) {
  const [markPrices, setMarkPrices] = useState<Map<string, number>>(new Map());
  const [loadingPrices, setLoadingPrices] = useState(true);
  const [sharePos, setSharePos] = useState<ShareablePosition | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch(`${GW_BASE}/perps/markets/mark-prices`)
      .then((r) => r.json())
      .then((json) => {
        if (cancelled) return;
        const m = new Map<string, number>();
        for (const item of json?.data ?? []) {
          m.set(item.symbol, parseFloat(item.markPrice));
        }
        setMarkPrices(m);
      })
      .catch(() => {})
      .finally(() => { if (!cancelled) setLoadingPrices(false); });
    return () => { cancelled = true; };
  }, []);

  const rows = positions
    .filter((p) => p.active && parseFloat(p.size) !== 0)
    .map((p) => {
      const size = parseFloat(p.size);
      const isLong = size > 0;
      const absSize = Math.abs(size);
      const entryPrice = parseFloat(p.avgEntryPrice);
      const markPrice = markPrices.get(p.symbol) ?? 0;
      const unrealizedPnl = markPrice > 0 && entryPrice > 0
        ? (isLong ? (markPrice - entryPrice) : (entryPrice - markPrice)) * absSize
        : 0;
      const margin = parseFloat(p.initialMargin);
      const roiPct = margin > 0 ? (unrealizedPnl / margin) * 100 : 0;
      return {
        ...p,
        isLong,
        absSize,
        entryPrice,
        markPrice,
        unrealizedPnl,
        margin,
        roiPct,
      };
    })
    .sort((a, b) => Math.abs(b.unrealizedPnl) - Math.abs(a.unrealizedPnl));

  const totalMargin = rows.reduce((sum, r) => sum + r.margin, 0);
  const totalPnl = rows.reduce((sum, r) => sum + r.unrealizedPnl, 0);

  return (
    <>
    {sharePos && <PositionShareCard position={sharePos} onClose={() => setSharePos(null)} />}
    <div className="relative" style={{ border: "1px solid var(--border)", background: "var(--bg-surface)" }}>
      <CornerMarks size={8} inset={-1} thickness={1} opacity={0.5} />

      {/* Header */}
      <div className="flex items-center justify-between px-4 sm:px-5 py-2.5 sm:py-3" style={{ borderBottom: "1px solid var(--border-subtle)" }}>
        <div className="flex items-center gap-2">
          <TrendingUp size={14} style={{ color: "var(--accent)" }} />
          <span className="tag" style={{ color: "var(--accent)" }}>OPEN POSITIONS</span>
          {loadingPrices && <RefreshCw size={11} className="animate-spin" style={{ color: "var(--text-faint)" }} />}
        </div>
        {rows.length > 0 && (
          <span className="mono text-xs font-bold" style={{ color: totalPnl >= 0 ? "var(--green)" : "var(--red)" }}>
            {totalPnl >= 0 ? "+" : ""}{fmt(totalPnl)}
          </span>
        )}
      </div>

      {rows.length === 0 ? (
        <div className="flex items-center justify-center py-10">
          <span className="mono text-sm" style={{ color: "var(--text-faint)" }}>No open positions</span>
        </div>
      ) : (
        <>
          {/* Desktop: table */}
          <div className="hidden sm:block overflow-x-auto">
            <div style={{ minWidth: 620 }}>
              {/* Header */}
              <div
                className="grid items-center px-4 py-3"
                style={{ gridTemplateColumns: "minmax(90px,1fr) 60px 80px 90px 90px 90px 90px 36px", gap: 12, borderBottom: "1px solid var(--border)" }}
              >
                <span className="tag" style={{ color: "var(--text-faint)" }}>MARKET</span>
                <span className="tag text-center" style={{ color: "var(--text-faint)" }}>SIDE</span>
                <span className="tag text-right" style={{ color: "var(--text-faint)" }}>SIZE</span>
                <span className="tag text-right" style={{ color: "var(--text-faint)" }}>ENTRY</span>
                <span className="tag text-right" style={{ color: "var(--text-faint)" }}>MARK</span>
                <span className="tag text-right" style={{ color: "var(--text-faint)" }}>MARGIN</span>
                <span className="tag text-right" style={{ color: "var(--text-faint)" }}>U-PNL</span>
                <span />
              </div>

              {/* Rows */}
              {rows.map((r, i) => (
                <div
                  key={r.id}
                  className="lb-row grid items-center px-4 group"
                  style={{
                    gridTemplateColumns: "minmax(90px,1fr) 60px 80px 90px 90px 90px 90px 36px",
                    gap: 12,
                    height: 48,
                    borderBottom: i < rows.length - 1 ? "1px solid var(--border-subtle)" : "none",
                    animationDelay: `${i * 30}ms`,
                    transition: "background 0.15s",
                  }}
                  onMouseEnter={(e) => ((e.currentTarget as HTMLElement).style.background = "var(--bg-elevated)")}
                  onMouseLeave={(e) => ((e.currentTarget as HTMLElement).style.background = "transparent")}
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <TokenIcon symbol={r.symbol} size={20} />
                    <div className="min-w-0">
                      <span className="mono text-xs font-bold truncate block" style={{ color: "var(--text)" }}>{tickerLabel(r.symbol)}</span>
                      <span className="mono text-[9px]" style={{ color: "var(--text-faint)" }}>{r.leverage}x</span>
                    </div>
                  </div>
                  <div className="flex justify-center">
                    <span
                      className="tag px-1.5 py-0.5"
                      style={{
                        color: r.isLong ? "var(--green)" : "var(--red)",
                        border: `1px solid ${r.isLong ? "var(--green)" : "var(--red)"}`,
                        borderRadius: 3,
                        fontSize: 9,
                      }}
                    >
                      {r.isLong ? "LONG" : "SHORT"}
                    </span>
                  </div>
                  <span className="mono text-xs text-right tabular-nums" style={{ color: "var(--text)" }}>
                    {r.absSize.toLocaleString("en-US", { maximumFractionDigits: 4 })}
                  </span>
                  <span className="mono text-xs text-right tabular-nums" style={{ color: "var(--text-muted)" }}>
                    ${r.entryPrice.toLocaleString("en-US", { maximumFractionDigits: 4 })}
                  </span>
                  <span className="mono text-xs text-right tabular-nums" style={{ color: "var(--text-muted)" }}>
                    {r.markPrice > 0 ? `$${r.markPrice.toLocaleString("en-US", { maximumFractionDigits: 4 })}` : loadingPrices ? "…" : "—"}
                  </span>
                  <span className="mono text-xs text-right tabular-nums" style={{ color: "var(--text)" }}>
                    {fmt(r.margin)}
                  </span>
                  <span className="mono text-xs text-right font-bold tabular-nums" style={{ color: r.unrealizedPnl >= 0 ? "var(--green)" : "var(--red)" }}>
                    {r.unrealizedPnl >= 0 ? "+" : ""}{fmt(r.unrealizedPnl)}
                    <span className="text-[9px] font-normal" style={{ opacity: 0.7 }}> {r.roiPct >= 0 ? "+" : ""}{r.roiPct.toFixed(1)}%</span>
                  </span>
                  <button
                    onClick={() => setSharePos({
                      symbol: tickerLabel(r.symbol),
                      side: r.isLong ? "LONG" : "SHORT",
                      leverage: r.leverage,
                      entryPrice: r.entryPrice,
                      markPrice: r.markPrice > 0 ? r.markPrice : null,
                      exitPrice: null,
                      pnl: r.unrealizedPnl,
                      roiPct: r.roiPct,
                      createdAt: r.createdAt,
                      updatedAt: r.updatedAt,
                    })}
                    className="flex items-center justify-center w-7 h-7 transition-colors opacity-0 group-hover:opacity-100"
                    style={{ borderRadius: 6, color: "var(--text-faint)" }}
                    onMouseEnter={(e) => { e.currentTarget.style.color = "var(--accent)"; e.currentTarget.style.background = "var(--accent-dim)"; }}
                    onMouseLeave={(e) => { e.currentTarget.style.color = "var(--text-faint)"; e.currentTarget.style.background = "transparent"; }}
                    title="Share"
                  >
                    <Share2 size={13} />
                  </button>
                </div>
              ))}
            </div>
          </div>

          {/* Mobile: compact cards */}
          <div className="sm:hidden flex flex-col gap-2 p-3">
            {rows.map((r) => (
              <div
                key={r.id}
                className="px-3 py-2.5"
                style={{ border: "1px solid var(--border-subtle)", borderRadius: 4, background: "var(--bg)" }}
              >
                {/* Row 1: icon + symbol + side + pnl */}
                <div className="flex items-center gap-2 mb-1.5">
                  <TokenIcon symbol={r.symbol} size={18} />
                  <span className="mono text-xs font-bold" style={{ color: "var(--text)" }}>{tickerLabel(r.symbol)}</span>
                  <span className="mono text-[9px]" style={{ color: "var(--text-faint)" }}>{r.leverage}x</span>
                  <span
                    className="tag ml-auto px-1.5 py-0.5"
                    style={{
                      color: r.isLong ? "var(--green)" : "var(--red)",
                      border: `1px solid ${r.isLong ? "var(--green)" : "var(--red)"}`,
                      borderRadius: 3,
                      fontSize: 8,
                    }}
                  >
                    {r.isLong ? "LONG" : "SHORT"}
                  </span>
                </div>
                {/* Row 2: size + entry + mark */}
                <div className="flex items-center justify-between">
                  <span className="mono text-[10px]" style={{ color: "var(--text-faint)" }}>
                    {r.absSize.toLocaleString("en-US", { maximumFractionDigits: 4 })} @ ${r.entryPrice.toLocaleString("en-US", { maximumFractionDigits: 4 })}
                  </span>
                  <span className="mono text-[10px]" style={{ color: "var(--text-muted)" }}>
                    {r.markPrice > 0 ? `$${r.markPrice.toLocaleString("en-US", { maximumFractionDigits: 4 })}` : "…"}
                  </span>
                </div>
                {/* Row 3: margin + pnl */}
                <div className="flex items-center justify-between mt-1">
                  <span className="mono text-[10px]" style={{ color: "var(--text-faint)" }}>
                    Margin: {fmt(r.margin)}
                  </span>
                  <span className="mono text-xs font-bold tabular-nums" style={{ color: r.unrealizedPnl >= 0 ? "var(--green)" : "var(--red)" }}>
                    {r.unrealizedPnl >= 0 ? "+" : ""}{fmt(r.unrealizedPnl)}
                    <span className="text-[9px] font-normal" style={{ opacity: 0.7 }}> {r.roiPct >= 0 ? "+" : ""}{r.roiPct.toFixed(1)}%</span>
                  </span>
                </div>
              </div>
            ))}
          </div>

          {/* Footer summary */}
          <div className="flex items-center justify-between px-4 py-2.5" style={{ borderTop: "1px solid var(--border-subtle)" }}>
            <span className="tag text-[9px] sm:text-xs" style={{ color: "var(--text-faint)" }}>
              {rows.length} {rows.length === 1 ? "POSITION" : "POSITIONS"} · MARGIN {fmt(totalMargin)}
            </span>
            <span className="mono text-xs font-bold" style={{ color: totalPnl >= 0 ? "var(--green)" : "var(--red)" }}>
              TOTAL: {totalPnl >= 0 ? "+" : ""}{fmt(totalPnl)}
            </span>
          </div>
        </>
      )}
    </div>
    </>
  );
}

/* ════════════════════════════════════════════════════════════════
   Spot Holdings — balances with USD equivalent
   ════════════════════════════════════════════════════════════════ */

interface SpotTickerInfo {
  symbol: string;
  lastPx: string;
}

async function fetchSpotTickers(): Promise<Map<string, number>> {
  const data = await apiFetch<SpotTickerInfo[]>(`${GW_BASE}/spot/markets/tickers`);
  const map = new Map<string, number>();
  for (const t of data) {
    // symbol format: "vBTC_vUSDC" — base_quote
    const parts = t.symbol.split("_");
    if (parts.length === 2) {
      const base = parts[0];
      const price = parseFloat(t.lastPx);
      // Only overwrite if we don't have a price yet (prefer vUSDC pairs)
      if (!isNaN(price) && price > 0 && !map.has(base)) {
        map.set(base, price);
      }
    }
  }
  return map;
}

function isStablecoin(coin: string): boolean {
  const u = coin.toUpperCase();
  return u.includes("USDC") || u.includes("USDT") || u.includes("BUSD") || u === "VUSD" || u.endsWith("USD");
}

function SpotHoldingsCard({
  balances,
  spotCoins,
}: {
  balances: SpotBalanceItem[];
  spotCoins: Map<string, number>;
}) {
  const [prices, setPrices] = useState<Map<string, number>>(new Map());
  const [pricesLoading, setPricesLoading] = useState(true);
  const [page, setPage] = useState(0);
  const pageSize = 5;

  useEffect(() => {
    let cancelled = false;
    setPricesLoading(true);
    fetchSpotTickers()
      .then((p) => { if (!cancelled) setPrices(p); })
      .catch(() => {})
      .finally(() => { if (!cancelled) setPricesLoading(false); });
    return () => { cancelled = true; };
  }, []);

  // DecimalString is already a decimal number (e.g. "1.5" = 1.5 tokens)
  // Do NOT divide by precision — that was wrong.
  function parseAmount(raw: string): number {
    return parseFloat(raw) || 0;
  }

  function getUnitPrice(coin: string): number {
    if (isStablecoin(coin)) return 1;
    return prices.get(coin) ?? 0;
  }

  const rows = balances.map((b) => {
    const amount = parseAmount(b.total);
    const locked = parseAmount(b.locked);
    const price = getUnitPrice(b.coin);
    const usdValue = amount * price;
    return { coin: b.coin, amount, locked, price, usdValue };
  }).sort((a, b) => b.usdValue - a.usdValue);

  const totalPages = Math.ceil(rows.length / pageSize);
  const pageRows = rows.slice(page * pageSize, (page + 1) * pageSize);
  const totalUsd = rows.reduce((sum, r) => sum + r.usdValue, 0);

  return (
    <div className="relative" style={{ border: "1px solid var(--border)", background: "var(--bg-surface)" }}>
      <CornerMarks size={8} inset={-1} thickness={1} opacity={0.5} />

      {/* Header */}
      <div className="flex items-center justify-between px-4 sm:px-5 py-2.5 sm:py-3" style={{ borderBottom: "1px solid var(--border-subtle)" }}>
        <div className="flex items-center gap-2">
          <Wallet size={14} style={{ color: "var(--accent)" }} />
          <span className="tag" style={{ color: "var(--accent)" }}>SPOT HOLDINGS</span>
          {pricesLoading && <RefreshCw size={11} className="animate-spin" style={{ color: "var(--text-faint)" }} />}
        </div>
        {!pricesLoading && rows.length > 0 && totalUsd > 0 && (
          <span className="mono text-xs font-bold" style={{ color: "var(--text)" }}>
            TOTAL: {fmt(totalUsd)}
          </span>
        )}
      </div>

      {rows.length === 0 ? (
        <div className="flex items-center justify-center py-12">
          <span className="mono text-sm" style={{ color: "var(--text-faint)" }}>No spot balances</span>
        </div>
      ) : (
        <>
          {/* Desktop: table */}
          <div className="hidden sm:block overflow-x-auto">
            <div style={{ minWidth: 560 }}>
              {/* Header */}
              <div
                className="grid items-center px-4 py-3"
                style={{ gridTemplateColumns: "minmax(90px,1fr) 110px 90px 90px 100px", gap: 12, borderBottom: "1px solid var(--border)" }}
              >
                <span className="tag" style={{ color: "var(--text-faint)" }}>ASSET</span>
                <span className="tag text-right" style={{ color: "var(--text-faint)" }}>BALANCE</span>
                <span className="tag text-right" style={{ color: "var(--text-faint)" }}>LOCKED</span>
                <span className="tag text-right" style={{ color: "var(--text-faint)" }}>PRICE</span>
                <span className="tag text-right" style={{ color: "var(--text-faint)" }}>USD VALUE</span>
              </div>

              {/* Rows */}
              {pageRows.map((r, i) => (
                <div
                  key={r.coin}
                  className="lb-row grid items-center px-4 group"
                  style={{
                    gridTemplateColumns: "minmax(90px,1fr) 110px 90px 90px 100px",
                    gap: 12,
                    height: 48,
                    borderBottom: i < pageRows.length - 1 ? "1px solid var(--border-subtle)" : "none",
                    animationDelay: `${i * 30}ms`,
                    transition: "background 0.15s",
                  }}
                  onMouseEnter={(e) => ((e.currentTarget as HTMLElement).style.background = "var(--bg-elevated)")}
                  onMouseLeave={(e) => ((e.currentTarget as HTMLElement).style.background = "transparent")}
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <TokenIcon symbol={r.coin} size={20} />
                    <span className="mono text-xs font-bold truncate" style={{ color: "var(--text)" }}>{tickerLabel(r.coin)}</span>
                  </div>
                  <span className="mono text-xs text-right tabular-nums" style={{ color: "var(--text)" }}>
                    {r.amount.toLocaleString("en-US", { maximumFractionDigits: 6 })}
                  </span>
                  <span className="mono text-xs text-right tabular-nums" style={{ color: "var(--text-faint)" }}>
                    {r.locked > 0 ? r.locked.toLocaleString("en-US", { maximumFractionDigits: 6 }) : "—"}
                  </span>
                  <span className="mono text-xs text-right tabular-nums" style={{ color: "var(--text-muted)" }}>
                    {isStablecoin(r.coin) ? "$1.00" : r.price > 0 ? `$${r.price.toLocaleString("en-US", { maximumFractionDigits: 4 })}` : pricesLoading ? "…" : "—"}
                  </span>
                  <span className="mono text-xs text-right font-bold tabular-nums" style={{ color: "var(--text)" }}>
                    {r.usdValue > 0 ? fmt(r.usdValue) : "—"}
                  </span>
                </div>
              ))}
            </div>
          </div>

          {/* Mobile: compact cards */}
          <div className="sm:hidden flex flex-col gap-2 p-3">
            {pageRows.map((r) => (
              <div
                key={r.coin}
                className="flex items-center gap-2.5 px-3 py-2"
                style={{ border: "1px solid var(--border-subtle)", borderRadius: 4, background: "var(--bg)" }}
              >
                <TokenIcon symbol={r.coin} size={20} />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between">
                    <span className="mono text-xs font-bold" style={{ color: "var(--text)" }}>{tickerLabel(r.coin)}</span>
                    <span className="mono text-xs font-bold tabular-nums" style={{ color: "var(--text)" }}>
                      {r.usdValue > 0 ? fmt(r.usdValue) : "—"}
                    </span>
                  </div>
                  <div className="flex items-center justify-between mt-0.5">
                    <span className="mono text-[10px]" style={{ color: "var(--text-faint)" }}>
                      {r.amount.toLocaleString("en-US", { maximumFractionDigits: 4 })}
                      {r.locked > 0 && <span className="inline-flex items-center gap-0.5" style={{ color: "var(--text-muted)" }}>&nbsp;·&nbsp;{r.locked.toLocaleString("en-US", { maximumFractionDigits: 4 })} <Lock size={8} /></span>}
                    </span>
                    <span className="mono text-[10px]" style={{ color: "var(--text-muted)" }}>
                      {isStablecoin(r.coin) ? "$1.00" : r.price > 0 ? `$${r.price.toLocaleString("en-US", { maximumFractionDigits: 4 })}` : pricesLoading ? "…" : "—"}
                    </span>
                  </div>
                </div>
              </div>
            ))}
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between px-4 py-2.5" style={{ borderTop: "1px solid var(--border-subtle)" }}>
              <span className="tag text-[9px] sm:text-xs" style={{ color: "var(--text-faint)" }}>
                {page * pageSize + 1}–{Math.min((page + 1) * pageSize, rows.length)} of {rows.length}
              </span>
              <div className="flex items-center gap-1">
                <button
                  onClick={() => setPage((p) => Math.max(0, p - 1))}
                  disabled={page === 0}
                  className="flex items-center justify-center w-6 h-6 sm:w-7 sm:h-7 transition-colors disabled:opacity-30"
                  style={{ border: "1px solid var(--border)", color: "var(--text-muted)" }}
                >
                  <ChevronLeft size={14} />
                </button>
                <span className="tag px-2 text-[9px] sm:text-xs" style={{ color: "var(--text-faint)" }}>
                  {page + 1}/{totalPages}
                </span>
                <button
                  onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
                  disabled={page === totalPages - 1}
                  className="flex items-center justify-center w-6 h-6 sm:w-7 sm:h-7 transition-colors disabled:opacity-30"
                  style={{ border: "1px solid var(--border)", color: "var(--text-muted)" }}
                >
                  <ChevronRight size={14} />
                </button>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}

/* ════════════════════════════════════════════════════════════════
   Section label — gives the long page a clear, repeating rhythm
   ════════════════════════════════════════════════════════════════ */

function SectionLabel({ children, hint }: { children: React.ReactNode; hint?: string }) {
  return (
    <div className="flex items-center gap-3 mb-3 mt-9 first:mt-0">
      <span className="tag whitespace-nowrap" style={{ color: "var(--accent)" }}>◇ {children}</span>
      <span className="flex-1 h-px" style={{ background: "var(--border-subtle)" }} />
      {hint && <span className="tag whitespace-nowrap" style={{ color: "var(--text-faint)" }}>{hint}</span>}
    </div>
  );
}

/* ════════════════════════════════════════════════════════════════
   Activity — Trades / Positions in one tabbed panel (saves height)
   ════════════════════════════════════════════════════════════════ */

function ActivityTabs({
  trades,
  positions,
  perpsMap,
}: {
  trades: MergedTrade[];
  positions: PositionHistoryItem[];
  perpsMap: Map<number, string>;
}) {
  const [tab, setTab] = useState<"trades" | "positions">("trades");
  const TABS: { id: "trades" | "positions"; label: string }[] = [
    { id: "trades", label: "RECENT TRADES" },
    { id: "positions", label: "POSITIONS" },
  ];
  return (
    <div>
      <div className="flex items-center gap-1.5 sm:gap-2 mb-3">
        {TABS.map((t) => {
          const active = tab === t.id;
          return (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className="tag flex items-center gap-1.5 px-2 sm:px-3 py-1 sm:py-1.5 text-[9px] sm:text-xs transition-colors"
              style={{
                background: active ? "var(--accent)" : "transparent",
                color: active ? "var(--accent-fg)" : "var(--text-muted)",
                border: `1px solid ${active ? "var(--accent)" : "var(--border)"}`,
              }}
            >
              {t.label}
            </button>
          );
        })}
      </div>
      {tab === "trades" ? (
        <RecentTradesTable trades={trades} />
      ) : (
        <PositionHistoryTable positions={positions} perpsMap={perpsMap} />
      )}
    </div>
  );
}

/* ════════════════════════════════════════════════════════════════
   Portfolio header (bound wallet, portfolio mode)
   ════════════════════════════════════════════════════════════════ */

function PortfolioHeader({
  data,
  copyState,
  onRefresh,
  refreshing,
  onUnbind,
}: {
  data: TrackerData;
  copyState: ReturnType<typeof useCopy>;
  onRefresh: () => void;
  refreshing: boolean;
  onUnbind: () => void;
}) {
  const { copied, copy } = copyState;
  const isCopied = copied === data.wallet_address;
  const pnl = parseFloat(data.overview.total_pnl_usd);
  const isProfitable = pnl >= 0;
  const firstTradeTs = data.overview.first_trade_ts_ms;
  const lastTradeTs = data.mergedTrades[0]?.timestamp ?? Date.now();

  return (
    <div className="mb-7 pt-6 fade-up">
      <div
        className="relative p-4 mb-4 flex items-center gap-3"
        style={{
          border: "1px solid var(--accent)",
          background: "var(--accent-dim)",
        }}
      >
        <CornerMarks size={8} inset={-1} thickness={1.5} />
        <Bookmark size={16} style={{ color: "var(--accent)" }} />
        <span className="tag" style={{ color: "var(--accent)" }}>BOUND WALLET</span>
        <span className="tag" style={{ color: "var(--text-faint)" }}>·</span>
        <span className="mono text-xs" style={{ color: "var(--text-muted)" }}>
          Saved locally — auto-loads on every visit
        </span>
        <button
          onClick={onUnbind}
          className="ml-auto flex items-center gap-1.5 px-2.5 py-1 tag transition-colors"
          style={{ border: "1px solid var(--border)", color: "var(--text-muted)" }}
          onMouseEnter={(e) => {
            (e.currentTarget as HTMLElement).style.borderColor = "var(--red)";
            (e.currentTarget as HTMLElement).style.color = "var(--red)";
          }}
          onMouseLeave={(e) => {
            (e.currentTarget as HTMLElement).style.borderColor = "var(--border)";
            (e.currentTarget as HTMLElement).style.color = "var(--text-muted)";
          }}
          title="Unbind wallet"
        >
          <Unlink size={11} />
          UNBIND
        </button>
      </div>

      <div className="flex items-start justify-between flex-wrap gap-4">
        <div className="flex items-center gap-4">
          {/* Avatar */}
          <div
            className="relative flex items-center justify-center shrink-0"
            style={{
              width: 56,
              height: 56,
              background: isProfitable ? "var(--green-tint)" : "var(--cal-red-tint)",
              border: `1px solid ${isProfitable ? "var(--green)" : "var(--red)"}`,
            }}
          >
            <CornerMarks size={7} inset={-1} thickness={1.5} />
            <Wallet size={22} style={{ color: isProfitable ? "var(--green)" : "var(--red)" }} />
          </div>

          <div>
            <div className="flex items-center gap-2 mb-1.5">
              <span className="w-4 h-px" style={{ background: "var(--accent)" }} />
              <span className="tag" style={{ color: "var(--accent)" }}>MY PORTFOLIO</span>
            </div>

            {/* Address (copyable) */}
            <button
              onClick={() => copy(data.wallet_address)}
              className="group flex items-center gap-2 mb-1"
              title="Copy address"
            >
              <span className="mono text-base sm:text-lg font-bold" style={{ color: "var(--text)" }}>
                {shortAddr(data.wallet_address)}
              </span>
              {isCopied ? (
                <Check size={14} style={{ color: "var(--accent)" }} />
              ) : (
                <Copy size={14} className="opacity-40 group-hover:opacity-80 transition-opacity" style={{ color: "var(--text-faint)" }} />
              )}
            </button>

            <div className="flex items-center gap-3">
              <span className="tag" style={{ color: "var(--text-faint)" }}>
                FIRST TRADE {fmtDate(firstTradeTs)}
              </span>
              <span className="tag" style={{ color: "var(--text-faint)" }}>·</span>
              <span className="tag" style={{ color: "var(--text-faint)" }}>
                LAST ACTIVE {timeAgo(lastTradeTs)}
              </span>
            </div>
          </div>
        </div>

        {/* Actions */}
        <div className="flex items-center gap-2">
          <button
            onClick={onRefresh}
            className="flex items-center gap-1.5 px-3 py-1.5 tag transition-colors"
            style={{ border: "1px solid var(--border)", color: "var(--text-muted)" }}
            onMouseEnter={(e) => {
              (e.currentTarget as HTMLElement).style.borderColor = "var(--accent)";
              (e.currentTarget as HTMLElement).style.color = "var(--accent)";
            }}
            onMouseLeave={(e) => {
              (e.currentTarget as HTMLElement).style.borderColor = "var(--border)";
              (e.currentTarget as HTMLElement).style.color = "var(--text-muted)";
            }}
          >
            <RefreshCw size={11} className={refreshing ? "animate-spin" : ""} />
            REFRESH
          </button>
        </div>
      </div>
    </div>
  );
}

/* ════════════════════════════════════════════════════════════════
   Profile header
   ════════════════════════════════════════════════════════════════ */

function ProfileHeader({
  data,
  copyState,
  onReset,
  onRefresh,
  refreshing,
}: {
  data: TrackerData;
  copyState: ReturnType<typeof useCopy>;
  onReset: () => void;
  onRefresh: () => void;
  refreshing: boolean;
}) {
  const { copied, copy } = copyState;
  const isCopied = copied === data.wallet_address;
  const pnl = parseFloat(data.overview.total_pnl_usd);
  const isProfitable = pnl >= 0;
  const firstTradeTs = data.overview.first_trade_ts_ms;
  const lastTradeTs = data.mergedTrades[0]?.timestamp ?? Date.now();

  return (
    <div className="mb-7 pt-6 fade-up">
      <div className="flex items-start justify-between flex-wrap gap-4">
        <div className="flex items-center gap-4">
          {/* Avatar */}
          <div
            className="relative flex items-center justify-center shrink-0"
            style={{
              width: 56,
              height: 56,
              background: isProfitable ? "var(--green-tint)" : "var(--cal-red-tint)",
              border: `1px solid ${isProfitable ? "var(--green)" : "var(--red)"}`,
            }}
          >
            <CornerMarks size={7} inset={-1} thickness={1.5} />
            <Wallet size={22} style={{ color: isProfitable ? "var(--green)" : "var(--red)" }} />
          </div>

          <div>
            <div className="flex items-center gap-2 mb-1.5">
              <span className="w-4 h-px" style={{ background: "var(--accent)" }} />
              <span className="tag" style={{ color: "var(--accent)" }}>WALLET PROFILE</span>
            </div>

            {/* Address (copyable) */}
            <button
              onClick={() => copy(data.wallet_address)}
              className="group flex items-center gap-2 mb-1"
              title="Copy address"
            >
              <span className="mono text-base sm:text-lg font-bold" style={{ color: "var(--text)" }}>
                {shortAddr(data.wallet_address)}
              </span>
              {isCopied ? (
                <Check size={14} style={{ color: "var(--accent)" }} />
              ) : (
                <Copy size={14} className="opacity-40 group-hover:opacity-80 transition-opacity" style={{ color: "var(--text-faint)" }} />
              )}
            </button>

            <div className="flex items-center gap-3">
              <span className="tag" style={{ color: "var(--text-faint)" }}>
                FIRST TRADE {fmtDate(firstTradeTs)}
              </span>
              <span className="tag" style={{ color: "var(--text-faint)" }}>·</span>
              <span className="tag" style={{ color: "var(--text-faint)" }}>
                LAST ACTIVE {timeAgo(lastTradeTs)}
              </span>
            </div>
          </div>
        </div>

        {/* Actions */}
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1.5 mr-2">
            <span className="live-dot w-1.5 h-1.5 rounded-full" style={{ background: "var(--accent)" }} />
            <span className="tag" style={{ color: "var(--accent)" }}>LIVE</span>
          </div>
          <button
            onClick={onRefresh}
            className="flex items-center gap-1.5 px-3 py-1.5 tag transition-colors"
            style={{ border: "1px solid var(--border)", color: "var(--text-muted)" }}
            onMouseEnter={(e) => {
              (e.currentTarget as HTMLElement).style.borderColor = "var(--accent)";
              (e.currentTarget as HTMLElement).style.color = "var(--accent)";
            }}
            onMouseLeave={(e) => {
              (e.currentTarget as HTMLElement).style.borderColor = "var(--border)";
              (e.currentTarget as HTMLElement).style.color = "var(--text-muted)";
            }}
          >
            <RefreshCw size={11} className={refreshing ? "animate-spin" : ""} />
            REFRESH
          </button>
          <button
            onClick={onReset}
            className="flex items-center justify-center w-8 h-8 transition-colors"
            style={{ border: "1px solid var(--border)", color: "var(--text-faint)" }}
            onMouseEnter={(e) => {
              (e.currentTarget as HTMLElement).style.borderColor = "var(--red)";
              (e.currentTarget as HTMLElement).style.color = "var(--red)";
            }}
            onMouseLeave={(e) => {
              (e.currentTarget as HTMLElement).style.borderColor = "var(--border)";
              (e.currentTarget as HTMLElement).style.color = "var(--text-faint)";
            }}
            title="New search"
          >
            <X size={14} />
          </button>
        </div>
      </div>
    </div>
  );
}

/* ════════════════════════════════════════════════════════════════
   Main component
   ════════════════════════════════════════════════════════════════ */

export function TrackerPage({
  initialAddress: initialAddressProp,
  onAddressSearched,
  portfolioMode,
  onUnbind,
  cachedData,
  cachedOverview,
  cachedChart,
  onCacheUpdate,
}: {
  initialAddress?: string;
  onAddressSearched?: (addr: string) => void;
  portfolioMode?: boolean;
  onUnbind?: () => void;
  cachedData?: TrackerData | null;
  cachedOverview?: PortfolioOverviewData | null;
  cachedChart?: ChartPoint[] | null;
  onCacheUpdate?: (data: TrackerData, overview: PortfolioOverviewData, chart: ChartPoint[]) => void;
}) {
  const searchParams = useSearchParams();
  const initialAddress = initialAddressProp ?? searchParams.get("address") ?? undefined;
  const [searchInput, setSearchInput] = useState("");
  const [searchPending, setSearchPending] = useState(false);
  const [searchFocused, setSearchFocused] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<TrackerData | null>(cachedData ?? null);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [selectedWindow, setSelectedWindow] = useState<PortfolioWindow>("1Y");
  const [overview, setOverview] = useState<PortfolioOverviewData | null>(cachedOverview ?? null);
  const [chart, setChart] = useState<ChartPoint[]>(cachedChart ?? []);
  const [windowLoading, setWindowLoading] = useState(false);
  const searchRef = useRef<HTMLInputElement>(null);
  const lastAddrRef = useRef<string>(cachedData?.wallet_address ?? initialAddress ?? "");

  const copyState = useCopy();

  const fetchAllData = useCallback(async (addr: string) => {
    const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

    // 1. Fetch account states (perps + spot) to get account_id
    const [perpsState, spotState] = await Promise.all([
      fetchPerpsAccountState(addr).catch(() => null),
      fetchSpotAccountState(addr).catch(() => null),
    ]);

    if (!perpsState && !spotState) {
      throw new Error("Address not found on SoDEX");
    }

    const accountId = (perpsState?.aid ?? spotState?.aid)!;
    const userId = (perpsState?.uid ?? spotState?.uid)!;

    // 2. Staggered fetching — batch requests to avoid rate-limiting
    // Batch 1: symbol maps (2 requests)
    const [perpsSymbolMap, spotSymbolMap] = await Promise.all([
      fetchPerpsSymbols().catch(() => new Map<number, string>()),
      fetchSpotSymbols().catch(() => new Map<number, string>()),
    ]);
    await sleep(150);

    // Batch 2: portfolio overview + chart (1Y for all-time default) (2 requests)
    const [overviewData, chartData] = await Promise.all([
      fetchPortfolioOverview(accountId, "1Y").catch(() => null),
      fetchPortfolioChart(accountId, "1Y").catch(() => [] as ChartPoint[]),
    ]);
    await sleep(150);

    // Batch 3: trades + positions (3 requests)
    const [spotTrades, perpsTrades, positions] = await Promise.all([
      fetchSpotTrades(accountId, 100).catch(() => [] as SpotTrade[]),
      fetchPerpsTrades(accountId, 100).catch(() => [] as PerpsTrade[]),
      fetchPositionHistory(accountId, 200).catch(() => [] as PositionHistoryItem[]),
    ]);
    await sleep(150);

    // Batch 4: ALL_TIME leaderboard ranks (pnl + volume) + spot balances + coins + open positions
    const [allTimePnlRank, allTimeVolumeRank, spotBalancesData, spotCoinsMap, openPositionsData] = await Promise.all([
      fetchLeaderboardRank(addr, "ALL_TIME", "pnl").catch(() => null),
      fetchLeaderboardRank(addr, "ALL_TIME", "volume").catch(() => null),
      fetchSpotBalances(addr).catch(() => null),
      fetchSpotCoins().catch(() => new Map<string, number>()),
      fetchOpenPositions(addr).catch(() => null),
    ]);

    if (!overviewData) {
      throw new Error("Failed to load portfolio overview");
    }

    const mergedTrades = mergeTrades(spotTrades, perpsTrades, spotSymbolMap, perpsSymbolMap);

    const trackerData: TrackerData = {
      wallet_address: addr,
      account_id: accountId,
      user_id: userId,
      perpsState: perpsState ?? ({} as AccountStateData),
      spotState: spotState ?? ({} as SpotAccountStateData),
      overview: overviewData,
      chart: [],
      allTimePnlRank,
      allTimeVolumeRank,
      mergedTrades,
      positionHistory: positions,
      openPositions: openPositionsData?.positions ?? [],
      perpsSymbolMap,
      spotSymbolMap,
      spotBalances: spotBalancesData?.balances ?? [],
      spotCoins: spotCoinsMap,
    };

    return { trackerData, chartData };
  }, []);

  const performSearch = async (rawAddress: string) => {
    const addr = rawAddress.trim();
    if (!addr) return;
    setSearchInput(addr);
    setSearchPending(true);
    setError(null);
    setLoading(true);
    try {
      const { trackerData, chartData } = await fetchAllData(addr);
      setData(trackerData);
      setOverview(trackerData.overview);
      setChart(chartData);
      setSelectedWindow("1Y");
      lastAddrRef.current = addr;
      onAddressSearched?.(addr);
      onCacheUpdate?.(trackerData, trackerData.overview, chartData);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load profile. Please check the address and try again.");
    } finally {
      setSearchPending(false);
      setLoading(false);
    }
  };

  const handleSearch = async () => {
    await performSearch(searchInput);
  };

  const handleReset = () => {
    setData(null);
    setOverview(null);
    setChart([]);
    setSearchInput("");
    setError(null);
    lastAddrRef.current = "";
    setTimeout(() => searchRef.current?.focus(), 100);
  };

  const handleRefresh = async () => {
    if (!lastAddrRef.current) return;
    setRefreshing(true);
    clearFetchCachePrefix(lastAddrRef.current);
    try {
      const { trackerData, chartData } = await fetchAllData(lastAddrRef.current);
      setData(trackerData);
      setOverview(trackerData.overview);
      setChart(chartData);
      onCacheUpdate?.(trackerData, trackerData.overview, chartData);
    } catch {
      // silent refresh fail
    } finally {
      setRefreshing(false);
    }
  };

  // Auto-search when initialAddress is provided (portfolio mode)
  // Skip if we already have cached data for this address
  useEffect(() => {
    if (!initialAddress) return;
    if (cachedData && cachedData.wallet_address === initialAddress) return;
    setSearchInput(initialAddress);
    (async () => {
      setSearchPending(true);
      setError(null);
      setLoading(true);
      try {
        const { trackerData, chartData } = await fetchAllData(initialAddress);
        setData(trackerData);
        setOverview(trackerData.overview);
        setChart(chartData);
        setSelectedWindow("1Y");
        lastAddrRef.current = initialAddress;
        onAddressSearched?.(initialAddress);
        onCacheUpdate?.(trackerData, trackerData.overview, chartData);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Failed to load profile.");
      } finally {
        setSearchPending(false);
        setLoading(false);
      }
    })();
  }, [initialAddress, fetchAllData]);

  // Fetch overview + chart when window changes
  useEffect(() => {
    if (!data) return;
    let cancelled = false;
    setWindowLoading(true);
    (async () => {
      try {
        const [ov, ch] = await Promise.all([
          fetchPortfolioOverview(data.account_id, selectedWindow),
          fetchPortfolioChart(data.account_id, selectedWindow).catch(() => [] as ChartPoint[]),
        ]);
        if (!cancelled) {
          setOverview(ov);
          setChart(ch);
        }
      } catch {
        // keep existing data on error
      } finally {
        if (!cancelled) setWindowLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [data?.account_id, selectedWindow]);

  // Auto-focus search on mount (desktop only — mobile opens keyboard)
  useEffect(() => {
    if (!data && window.matchMedia("(min-width: 768px)").matches) searchRef.current?.focus();
  }, [data]);

  /* ── Search state ── */
  if (!data && !loading) {
    return (
      <div className="min-h-screen pt-[72px] pb-20" style={{ background: "var(--bg)" }}>
        <div className="max-w-[1100px] mx-auto">
          {portfolioMode ? (
            <PortfolioBindHero
              searchInput={searchInput}
              setSearchInput={setSearchInput}
              onSearch={handleSearch}
              searchPending={searchPending}
              searchFocused={searchFocused}
              setSearchFocused={setSearchFocused}
              searchRef={searchRef}
              error={error}
            />
          ) : (
            <SearchHero
              searchInput={searchInput}
              setSearchInput={setSearchInput}
              onSearch={handleSearch}
              onTrackAddress={performSearch}
              searchPending={searchPending}
              searchFocused={searchFocused}
              setSearchFocused={setSearchFocused}
              searchRef={searchRef}
              error={error}
            />
          )}
        </div>
      </div>
    );
  }

  /* ── Loading state ── */
  if (loading && !data) {
    return (
      <div className="min-h-screen pt-[72px] pb-20 flex items-center justify-center" style={{ background: "var(--bg)" }}>
        <div className="flex flex-col items-center gap-4">
          <div
            className="flex items-center justify-center rounded-sm"
            style={{
              width: 56,
              height: 56,
              background: "var(--bg-surface)",
              border: "1px solid var(--accent)",
            }}
          >
            <RefreshCw size={22} className="animate-spin" style={{ color: "var(--accent)" }} />
          </div>
          <span className="mono text-sm" style={{ color: "var(--text-faint)" }}>
            LOADING PROFILE…
          </span>
        </div>
      </div>
    );
  }

  /* ── Profile state ── */
  const ov = overview ?? data!.overview;
  const pnl = parseFloat(ov.total_pnl_usd);
  const volume = parseFloat(ov.volume_usd);
  const roi = parseFloat(ov.roi);
  const accountValue = parseFloat(ov.account_value_usd);
  const spotPnl = parseFloat(ov.spot_pnl_usd);
  const perpsUnrealized = parseFloat(ov.perps_unrealized_pnl_usd);
  const perpsClosed = parseFloat(ov.perps_closed_pnl_usd);
  const vaultPnl = parseFloat(ov.vault_pnl_usd);
  const windowShort = PORTFOLIO_WINDOWS.find((w) => w.value === selectedWindow)!.short;
  const pnlRank = data!.allTimePnlRank?.found && data!.allTimePnlRank.item ? data!.allTimePnlRank.item.rank : null;
  const volumeRank = data!.allTimeVolumeRank?.found && data!.allTimeVolumeRank.item ? data!.allTimeVolumeRank.item.rank : null;

  const isProfitable = pnl >= 0;

  // Unified stat strip beside the verdict
  const heroStats: { label: string; value: string; tone?: "up" | "down" | "accent" }[] = [
    { label: `${windowShort} VOLUME`, value: fmt(volume) },
    { label: "ACCOUNT VALUE", value: fmt(accountValue) },
    { label: "PNL RANK", value: pnlRank ? `#${pnlRank.toLocaleString()}` : "—", tone: pnlRank ? "accent" : undefined },
    { label: "VOLUME RANK", value: volumeRank ? `#${volumeRank.toLocaleString()}` : "—", tone: volumeRank ? "accent" : undefined },
    { label: "SPOT PNL", value: `${spotPnl >= 0 ? "+" : ""}${fmt(spotPnl)}`, tone: spotPnl >= 0 ? "up" : "down" },
    { label: "PERPS UNREAL.", value: `${perpsUnrealized >= 0 ? "+" : ""}${fmt(perpsUnrealized)}`, tone: perpsUnrealized >= 0 ? "up" : "down" },
    { label: "PERPS CLOSED", value: `${perpsClosed >= 0 ? "+" : ""}${fmt(perpsClosed)}`, tone: perpsClosed >= 0 ? "up" : "down" },
    { label: "VAULT PNL", value: `${vaultPnl >= 0 ? "+" : ""}${fmt(vaultPnl)}`, tone: vaultPnl >= 0 ? "up" : "down" },
  ];

  return (
    <div className="min-h-screen pt-[72px] pb-20" style={{ background: "var(--bg)" }}>
      <div className="max-w-[1100px] mx-auto px-5">
        {/* Header */}
        {portfolioMode ? (
          <PortfolioHeader
            data={data!}
            copyState={copyState}
            onRefresh={handleRefresh}
            refreshing={refreshing}
            onUnbind={() => onUnbind?.()}
          />
        ) : (
          <ProfileHeader
            data={data!}
            copyState={copyState}
            onReset={handleReset}
            onRefresh={handleRefresh}
            refreshing={refreshing}
          />
        )}

        {/* ── Verdict scoreboard ── */}
        <div
          className="podium-card relative grid lg:grid-cols-[1.05fr_1.4fr] mb-8"
          style={{ border: "1px solid var(--border)", background: "var(--bg-surface)" }}
        >
          <CornerMarks size={9} inset={-1} thickness={1.5} />

          {/* Left — the verdict */}
          <div
            className="p-6 flex flex-col justify-center gap-3 lg:border-r"
            style={{ borderColor: "var(--border-subtle)" }}
          >
            <div className="flex items-center gap-2">
              <TrendingUp size={13} style={{ color: "var(--accent)" }} />
              <span className="tag" style={{ color: "var(--text-faint)" }}>{windowShort} NET P&L</span>
            </div>
            <div className="flex items-end gap-3 flex-wrap">
              <span
                className="mono font-bold tabular-nums leading-none"
                style={{ fontSize: "clamp(2.2rem, 5vw, 3.25rem)", color: isProfitable ? "var(--green)" : "var(--red)" }}
              >
                <CountUp value={pnl} format={(n) => `${n >= 0 ? "+" : ""}${fmt(n)}`} />
              </span>
              <span
                className="mono text-sm font-bold px-2.5 py-1.5 mb-1"
                style={{
                  border: `1px solid ${roi >= 0 ? "var(--green-edge)" : "var(--cal-red-edge)"}`,
                  color: roi >= 0 ? "var(--green)" : "var(--red)",
                  background: roi >= 0 ? "var(--green-tint)" : "var(--cal-red-tint)",
                }}
              >
                {roi >= 0 ? "+" : ""}{roi.toFixed(2)}% ROI
              </span>
            </div>
            <div className="flex items-center gap-2">
              <span
                className="tag px-2 py-1"
                style={{
                  border: `1px solid ${isProfitable ? "var(--green)" : "var(--red)"}`,
                  color: isProfitable ? "var(--green)" : "var(--red)",
                }}
              >
                {isProfitable ? "▲ NET PROFITABLE" : "▼ NET NEGATIVE"}
              </span>
            </div>
          </div>

          {/* Right — unified stat grid (4 cols × 2 rows) */}
          <div className="grid grid-cols-2 sm:grid-cols-4">
            {heroStats.map((s, i) => (
              <div
                key={s.label}
                className="p-4 flex flex-col gap-1.5"
                style={{
                  borderLeft: i % 4 !== 0 ? "1px solid var(--border-subtle)" : "none",
                  borderTop: i >= 4 ? "1px solid var(--border-subtle)" : "none",
                }}
              >
                <span className="tag" style={{ color: "var(--text-faint)" }}>{s.label}</span>
                <span
                  className="mono text-sm font-bold tabular-nums"
                  style={{ color: s.tone === "accent" ? "var(--accent)" : s.tone === "up" ? "var(--green)" : s.tone === "down" ? "var(--red)" : "var(--text)" }}
                >
                  {s.value}
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* Window selector */}
        <div className="flex items-center gap-3 mb-5">
          <span className="tag" style={{ color: "var(--text-faint)" }}>TIME WINDOW:</span>
          <div className="flex items-center" style={{ border: "1px solid var(--border)", padding: 2, gap: 2 }}>
            {PORTFOLIO_WINDOWS.map((w) => (
              <button
                key={w.value}
                onClick={() => setSelectedWindow(w.value)}
                className="tag px-3 py-1.5 transition-colors"
                style={{
                  background: selectedWindow === w.value ? "var(--accent)" : "transparent",
                  color: selectedWindow === w.value ? "var(--accent-fg)" : "var(--text-muted)",
                  cursor: "pointer",
                }}
              >
                {w.label}
              </button>
            ))}
          </div>
          {windowLoading && (
            <RefreshCw size={12} className="animate-spin" style={{ color: "var(--accent)" }} />
          )}
        </div>

        {/* PnL Chart */}
        <SectionLabel hint={`${windowShort} WINDOW`}>PNL HISTORY</SectionLabel>
        <div className="mb-3" key={`chart-${selectedWindow}`}>
          <PnlChart chart={chart} windowShort={windowShort} />
        </div>

        {/* PnL Calendar */}
        <SectionLabel>DAILY PNL</SectionLabel>
        <div className="mb-3">
          <PnlCalendar chart={chart} windowShort={windowShort} />
        </div>

        {/* Open Positions */}
        <SectionLabel hint="PERPS">OPEN POSITIONS</SectionLabel>
        <div className="mb-3">
          <OpenPositionsCard positions={data!.openPositions} />
        </div>

        {/* Spot Holdings */}
        <SectionLabel hint="SPOT BALANCES">HOLDINGS</SectionLabel>
        <div className="mb-3">
          <SpotHoldingsCard
            balances={data!.spotBalances}
            spotCoins={data!.spotCoins}
          />
        </div>

        {/* Activity — trades / positions (tabbed) */}
        <SectionLabel>ACTIVITY</SectionLabel>
        <ActivityTabs
          trades={data!.mergedTrades}
          positions={data!.positionHistory}
          perpsMap={data!.perpsSymbolMap}
        />

        {/* Fund Flow — deposits & withdrawals */}
        <SectionLabel hint="DEPOSITS & WITHDRAWALS">FUND FLOW</SectionLabel>
        <div className="mb-3">
          <FundFlowCard walletAddress={data!.wallet_address} />
        </div>
      </div>
    </div>
  );
}
