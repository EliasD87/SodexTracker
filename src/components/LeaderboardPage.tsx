"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { CornerMarks } from "@/components/CornerMarks";
import { CountUp } from "@/components/CountUp";
import { Search, ChevronLeft, ChevronRight, X, Copy, Check, Trophy } from "lucide-react";

type WindowType = "24H" | "7D" | "30D" | "ALL_TIME";
type SortBy = "pnl" | "volume";

interface LeaderboardItem {
  rank: number;
  wallet_address: string;
  account_id: number;
  pnl_usd: string;
  volume_usd: string;
  window_type: string;
}

interface LeaderboardData {
  total: number;
  page: number;
  page_size: number;
  snapshot_ts: number;
  items: LeaderboardItem[];
}

interface RankResult {
  found: boolean;
  item?: LeaderboardItem;
  snapshot_ts?: number;
}

const PAGE_SIZE = 20;
const WINDOWS: { label: string; value: WindowType; short: string }[] = [
  { label: "24H", value: "24H", short: "24H" },
  { label: "7D", value: "7D", short: "7D" },
  { label: "30D", value: "30D", short: "30D" },
  { label: "ALL TIME", value: "ALL_TIME", short: "ALL" },
];
const MEDALS: Record<number, string> = { 1: "#F5C518", 2: "#B8BCC4", 3: "#CD7F45" };

function fmt(n: number, dp = 2): string {
  const abs = Math.abs(n);
  const sign = n < 0 ? "-" : "";
  if (abs >= 1_000_000) return `${sign}$${(abs / 1_000_000).toFixed(dp)}M`;
  if (abs >= 1_000) return `${sign}$${(abs / 1_000).toFixed(dp)}K`;
  return `${sign}$${abs.toFixed(dp)}`;
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

function shortAddr(addr: string): string {
  return addr.slice(0, 8) + "…" + addr.slice(-6);
}

/* ── Click-to-copy address ── */
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

function PnlValue({ value, big = false }: { value: number; big?: boolean }) {
  const positive = value >= 0;
  return (
    <span
      className={`mono font-bold tabular-nums ${big ? "text-xl" : "text-xs"}`}
      style={{ color: positive ? "var(--green)" : "var(--red)" }}
    >
      <CountUp value={value} format={(n) => `${n >= 0 ? "+" : ""}${fmt(n)}`} />
    </span>
  );
}

/* ── Top-3 podium ── */
function PodiumCard({
  item,
  sortBy,
  windowShort,
  copyState,
  delay,
}: {
  item: LeaderboardItem;
  sortBy: SortBy;
  windowShort: string;
  copyState: ReturnType<typeof useCopy>;
  delay: number;
}) {
  const pnl = parseFloat(item.pnl_usd);
  const vol = parseFloat(item.volume_usd);
  const isChamp = item.rank === 1;
  const medal = MEDALS[item.rank];
  const { copied, copy } = copyState;
  const isCopied = copied === item.wallet_address;

  return (
    <div
      className={`podium-card relative flex flex-col ${isChamp ? "champ-glow" : ""}`}
      style={{
        background: isChamp ? "var(--accent-dim)" : "var(--bg-surface)",
        border: `1px solid ${isChamp ? "var(--accent)" : "var(--border)"}`,
        animationDelay: `${delay}ms`,
      }}
    >
      {isChamp && <CornerMarks size={9} inset={-1} thickness={1.5} />}
      <span className="scanline" />

      {/* medal + rank */}
      <div className="flex items-center justify-between mb-2 sm:mb-3">
        <div className="flex items-center gap-1.5 sm:gap-2">
          <div
            className="flex items-center justify-center rounded-full mono font-bold"
            style={{
              width: isChamp ? 34 : 28,
              height: isChamp ? 34 : 28,
              background: medal,
              color: "#0C0C0A",
              fontSize: isChamp ? 14 : 12,
              boxShadow: `0 0 14px ${medal}55`,
            }}
          >
            {item.rank}
          </div>
          {isChamp && <Trophy size={15} style={{ color: "var(--accent)" }} />}
        </div>
      </div>

      {/* address (copyable) */}
      <button
        onClick={() => copy(item.wallet_address)}
        className="group flex items-center gap-1.5 mb-2 sm:mb-3 w-fit min-w-0"
        title="Copy address"
      >
        <span className="mono text-[10px] sm:text-xs truncate" style={{ color: "var(--text)" }}>
          {shortAddr(item.wallet_address)}
        </span>
        {isCopied ? (
          <Check size={11} className="shrink-0" style={{ color: "var(--accent)" }} />
        ) : (
          <Copy
            size={11}
            className="opacity-0 group-hover:opacity-60 transition-opacity shrink-0"
            style={{ color: "var(--text-faint)" }}
          />
        )}
      </button>

      {/* primary metric */}
      <div className="mt-auto">
        <div className="tag mb-1 text-[8px] sm:text-xs" style={{ color: "var(--text-faint)" }}>
          {windowShort} {sortBy === "pnl" ? "PNL" : "VOLUME"}
        </div>
        {sortBy === "pnl" ? (
          <PnlValue value={pnl} big />
        ) : (
          <span className="mono text-sm sm:text-xl font-bold tabular-nums" style={{ color: "var(--accent)" }}>
            <CountUp value={vol} format={(n) => fmt(n)} />
          </span>
        )}
        {/* secondary metric */}
        <div className="tag mt-2 text-[8px] sm:text-xs" style={{ color: "var(--text-faint)" }}>
          {sortBy === "pnl" ? `VOL ${fmt(vol)}` : (
            <>PNL <span style={{ color: pnl >= 0 ? "var(--green)" : "var(--red)" }}>{pnl >= 0 ? "+" : ""}{fmt(pnl)}</span></>
          )}
        </div>
      </div>
    </div>
  );
}

function Podium({
  items,
  sortBy,
  windowShort,
  copyState,
}: {
  items: LeaderboardItem[];
  sortBy: SortBy;
  windowShort: string;
  copyState: ReturnType<typeof useCopy>;
}) {
  if (items.length < 3) return null;
  const [first, second, third] = items;
  // visual order: 2 · 1 · 3
  return (
    <div className="grid grid-cols-3 gap-1.5 sm:gap-3 mb-6 sm:mb-8 items-end">
      <div className="order-2 sm:order-1">
        <PodiumCard item={second} sortBy={sortBy} windowShort={windowShort} copyState={copyState} delay={90} />
      </div>
      <div className="order-1 sm:order-2">
        <PodiumCard item={first} sortBy={sortBy} windowShort={windowShort} copyState={copyState} delay={0} />
      </div>
      <div className="order-3">
        <PodiumCard item={third} sortBy={sortBy} windowShort={windowShort} copyState={copyState} delay={180} />
      </div>
    </div>
  );
}

/* Bar appearance for the magnitude fill */
function barStyle(sortBy: SortBy, pnl: number): { fill: string; edge: string; glow: string } {
  if (sortBy === "volume") {
    return { fill: "var(--accent-dim)", edge: "var(--accent)", glow: "var(--accent-glow)" };
  }
  return pnl >= 0
    ? { fill: "var(--green-tint-strong)", edge: "var(--green)", glow: "var(--green-edge)" }
    : { fill: "rgba(240,80,80,0.14)", edge: "var(--red)", glow: "rgba(240,80,80,0.28)" };
}

function LedgerSkeleton() {
  return (
    <div
      className="lb-row lb-grid grid items-center px-4"
      style={{ gap: 16, height: 58, borderBottom: "1px solid var(--border-subtle)" }}
    >
      <div className="h-3.5 w-5 rounded-sm animate-pulse" style={{ background: "var(--border)" }} />
      <div className="h-3.5 w-40 rounded-sm animate-pulse" style={{ background: "var(--border)" }} />
      <div className="h-3.5 w-14 rounded-sm animate-pulse ml-auto lb-col-primary" style={{ background: "var(--border)" }} />
      <div className="h-3.5 w-14 rounded-sm animate-pulse ml-auto lb-col-secondary" style={{ background: "var(--border)" }} />
    </div>
  );
}

function LedgerRow({
  item,
  i,
  sortBy,
  pageMax,
  copyState,
}: {
  item: LeaderboardItem;
  i: number;
  sortBy: SortBy;
  pageMax: number;
  copyState: ReturnType<typeof useCopy>;
}) {
  const pnl = parseFloat(item.pnl_usd);
  const vol = parseFloat(item.volume_usd);
  const metric = sortBy === "pnl" ? Math.abs(pnl) : vol;
  const pct = Math.max((metric / pageMax) * 100, 1.5);
  const { fill, edge, glow } = barStyle(sortBy, pnl);
  const isCopied = copyState.copied === item.wallet_address;
  const medal = MEDALS[item.rank];

  // primary = sorted metric (lives at the bar); secondary = the other column
  const primaryNode =
    sortBy === "pnl" ? (
      <PnlValueStatic value={pnl} />
    ) : (
      <span className="mono text-xs font-bold tabular-nums" style={{ color: "var(--accent)" }}>{fmt(vol)}</span>
    );
  const secondaryNode =
    sortBy === "pnl" ? (
      <span className="mono text-xs tabular-nums" style={{ color: "var(--text-muted)" }}>{fmt(vol)}</span>
    ) : (
      <PnlValueStatic value={pnl} />
    );

  return (
    <div
      className="lb-row lb-grid grid items-center px-4 group"
      style={{
        gap: 16,
        borderBottom: "1px solid var(--border-subtle)",
        animationDelay: `${Math.min(i * 26, 560)}ms`,
        transition: "background 0.15s",
      }}
      onMouseEnter={(e) => ((e.currentTarget as HTMLElement).style.background = "var(--bg-elevated)")}
      onMouseLeave={(e) => ((e.currentTarget as HTMLElement).style.background = "transparent")}
    >
      {/* rank */}
      <div className="flex items-center gap-2">
        {medal ? (
          <span
            className="w-2 h-2 rounded-full shrink-0"
            style={{ background: medal, boxShadow: `0 0 8px ${medal}99` }}
          />
        ) : (
          <span className="w-2 h-2 shrink-0" />
        )}
        <span
          className="mono text-xs tabular-nums font-bold"
          style={{ color: medal ? "var(--text)" : "var(--text-faint)" }}
        >
          {item.rank}
        </span>
      </div>

      {/* trader */}
      <div className="min-w-0">
        <button onClick={() => copyState.copy(item.wallet_address)} className="group/addr flex items-center gap-1.5" title="Copy address">
          <span className="mono text-xs truncate" style={{ color: "var(--text)", letterSpacing: "0.02em" }}>
            <span className="hidden md:inline">{item.wallet_address}</span>
            <span className="md:hidden">{shortAddr(item.wallet_address)}</span>
          </span>
          {isCopied ? (
            <Check size={11} style={{ color: "var(--accent)" }} />
          ) : (
            <Copy size={11} className="opacity-0 group-hover/addr:opacity-50 transition-opacity shrink-0" style={{ color: "var(--text-faint)" }} />
          )}
        </button>
      </div>

      {/* primary value */}
      <div className="text-right lb-col-primary" data-label={sortBy === "pnl" ? "PNL" : "VOL"}>{primaryNode}</div>

      {/* secondary value */}
      <div className="text-right lb-col-secondary" data-label={sortBy === "pnl" ? "VOL" : "PNL"}>{secondaryNode}</div>
    </div>
  );
}

function SearchResultCard({
  result,
  sortBy,
  windowShort,
  copyState,
  onClear,
}: {
  result: RankResult;
  sortBy: SortBy;
  windowShort: string;
  copyState: ReturnType<typeof useCopy>;
  onClear: () => void;
}) {
  if (!result.found || !result.item) {
    return (
      <div
        className="podium-card flex items-center gap-3 px-4 py-3.5 mb-6 relative flex-wrap"
        style={{ border: "1px solid var(--red)", background: "rgba(204,46,46,0.06)" }}
      >
        <span className="mono text-xs font-bold" style={{ color: "var(--red)" }}>
          ✕ ADDRESS NOT FOUND
        </span>
        <span className="tag" style={{ color: "var(--text-faint)" }}>
          No ranking for this window · sort combination
        </span>
        <button onClick={onClear} className="ml-auto opacity-60 hover:opacity-100" style={{ color: "var(--text-faint)" }}>
          <X size={14} />
        </button>
      </div>
    );
  }

  const item = result.item;
  const pnl = parseFloat(item.pnl_usd);
  const vol = parseFloat(item.volume_usd);
  const { copied, copy } = copyState;
  const isCopied = copied === item.wallet_address;

  return (
    <div
      className="podium-card relative mb-6"
      style={{ border: "1px solid var(--accent)", background: "var(--accent-dim)", backdropFilter: "blur(6px)" }}
    >
      <CornerMarks size={9} inset={-1} thickness={1.5} />
      <div className="px-4 sm:px-5 py-3 sm:py-4 flex flex-col gap-3 sm:gap-4 md:flex-row md:items-center md:gap-8">
        <div className="flex items-center gap-3 sm:gap-4 min-w-0">
          <div className="flex flex-col items-center justify-center shrink-0">
            <span className="tag" style={{ color: "var(--text-faint)" }}>RANK</span>
            <span className="mono text-2xl sm:text-3xl font-bold leading-none" style={{ color: "var(--accent)" }}>
              #{item.rank.toLocaleString()}
            </span>
          </div>
          <div className="h-10 w-px shrink-0" style={{ background: "var(--border)" }} />
          <div className="min-w-0">
            <div className="tag mb-1" style={{ color: "var(--text-faint)" }}>YOUR SEARCH</div>
            <button onClick={() => copy(item.wallet_address)} className="group flex items-center gap-1.5 min-w-0" title="Copy address">
              <span className="mono text-xs truncate" style={{ color: "var(--text)" }}>
                <span className="hidden sm:inline">{item.wallet_address}</span>
                <span className="sm:hidden">{shortAddr(item.wallet_address)}</span>
              </span>
              {isCopied ? (
                <Check size={11} className="shrink-0" style={{ color: "var(--accent)" }} />
              ) : (
                <Copy size={11} className="opacity-40 group-hover:opacity-80 transition-opacity shrink-0" style={{ color: "var(--text-faint)" }} />
              )}
            </button>
          </div>
        </div>
        <div className="flex items-center gap-4 sm:gap-8 md:ml-auto">
          <div>
            <div className="tag mb-1" style={{ color: "var(--text-faint)" }}>{windowShort} PNL</div>
            <PnlValue value={pnl} />
          </div>
          <div>
            <div className="tag mb-1" style={{ color: "var(--text-faint)" }}>{windowShort} VOLUME</div>
            <span className="mono text-xs font-bold tabular-nums" style={{ color: "var(--text)" }}>{fmt(vol)}</span>
          </div>
        </div>
        <button
          onClick={onClear}
          className="absolute top-3 right-3 opacity-50 hover:opacity-100 transition-opacity"
          style={{ color: "var(--text-faint)" }}
        >
          <X size={14} />
        </button>
      </div>
    </div>
  );
}

export function LeaderboardPage() {
  const [window, setWindow] = useState<WindowType>("24H");
  const [sortBy, setSortBy] = useState<SortBy>("pnl");
  const [page, setPage] = useState(1);
  const [data, setData] = useState<LeaderboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  const [searchInput, setSearchInput] = useState("");
  const [searchedAddr, setSearchedAddr] = useState("");
  const [searchPending, setSearchPending] = useState(false);
  const [searchResult, setSearchResult] = useState<RankResult | null>(null);
  const [searchFocused, setSearchFocused] = useState(false);
  const searchRef = useRef<HTMLInputElement>(null);

  const copyState = useCopy();
  const windowShort = WINDOWS.find((w) => w.value === window)!.short;

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(false);
    try {
      const res = await fetch(
        `https://mainnet-data.sodex.dev/api/v1/leaderboard?window_type=${window}&sort_by=${sortBy}&page=${page}&page_size=${PAGE_SIZE}`
      );
      const json = await res.json();
      if (json.code !== 0) throw new Error(json.message);
      setData(json.data);
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }, [window, sortBy, page]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  useEffect(() => {
    setPage(1);
  }, [window, sortBy]);

  const fetchRank = useCallback(async (addr: string) => {
    if (!addr) return;
    setSearchPending(true);
    try {
      const res = await fetch(
        `https://mainnet-data.sodex.dev/api/v1/leaderboard/rank?window_type=${window}&sort_by=${sortBy}&wallet_address=${addr}`
      );
      const json = await res.json();
      if (json.code !== 0) throw new Error();
      setSearchResult({ found: json.data.found, item: json.data.item, snapshot_ts: json.data.snapshot_ts });
    } catch {
      setSearchResult({ found: false });
    } finally {
      setSearchPending(false);
    }
  }, [window, sortBy]);

  const handleSearch = async () => {
    const addr = searchInput.trim();
    if (!addr) return;
    setSearchResult(null);
    setSearchedAddr(addr);
    await fetchRank(addr);
  };

  // Re-fetch rank automatically when filters change if an address is already searched
  useEffect(() => {
    if (searchedAddr) fetchRank(searchedAddr);
  }, [window, sortBy]); // eslint-disable-line react-hooks/exhaustive-deps

  const clearSearch = () => {
    setSearchResult(null);
    setSearchInput("");
    setSearchedAddr("");
    searchRef.current?.focus();
  };

  const totalPages = data ? Math.ceil(data.total / PAGE_SIZE) : 1;
  const items = data?.items ?? [];

  // Podium only on page 1 with no active search; table then starts at rank 4.
  const showPodium = page === 1 && !searchResult && items.length >= 3;
  const tableItems = showPodium ? items.slice(3) : items;

  // Max magnitude on the current page for the relative fill bars.
  const pageMax = Math.max(
    ...items.map((it) =>
      sortBy === "pnl" ? Math.abs(parseFloat(it.pnl_usd)) : parseFloat(it.volume_usd)
    ),
    1
  );

  const animKey = `${window}-${sortBy}-${page}`;

  return (
    <div className="min-h-screen pt-[72px] pb-20" style={{ background: "var(--bg)" }}>
      <div className="max-w-[1100px] mx-auto px-5">

        {/* ── Header ── */}
        <div className="mb-7 pt-6">
          <div className="flex items-end justify-between flex-wrap gap-3">
            <div>
              <div className="flex items-center gap-2 mb-2">
                <span className="w-5 h-px" style={{ background: "var(--accent)" }} />
                <span className="tag" style={{ color: "var(--accent)" }}>LEADERBOARD</span>
                <span className="tag" style={{ color: "var(--text-faint)" }}>·</span>
                <span className="tag" style={{ color: "var(--text-faint)" }}>
                  {data?.total.toLocaleString() ?? "—"} TRADERS
                </span>
              </div>
              <h1 className="text-[26px] sm:text-[44px] font-bold leading-none tracking-tight" style={{ color: "var(--text)", letterSpacing: "-0.02em" }}>
                Top Traders
              </h1>
            </div>
            <div className="flex flex-col items-start sm:items-end gap-1.5">
              <div className="flex items-center gap-1.5">
                <span className="live-dot w-1.5 h-1.5 rounded-full" style={{ background: "var(--accent)" }} />
                <span className="tag" style={{ color: "var(--accent)" }}>LIVE</span>
              </div>
              {data?.snapshot_ts && (
                <span className="tag" style={{ color: "var(--text-faint)" }}>SNAPSHOT · {fmtSnap(data.snapshot_ts)}</span>
              )}
            </div>
          </div>
        </div>

        {/* ── Controls ── */}
        <div className="flex flex-col gap-3 sm:gap-4 mb-5 sm:mb-7">
          <div className="flex flex-wrap items-center gap-2 sm:gap-3">
            {/* Window */}
            <div className="flex items-center" style={{ border: "1px solid var(--border)", padding: 2, gap: 2 }}>
              {WINDOWS.map((w) => (
                <button
                  key={w.value}
                  onClick={() => setWindow(w.value)}
                  className="tag px-2 sm:px-3 py-1 sm:py-1.5 text-[9px] sm:text-xs transition-colors"
                  style={{
                    background: window === w.value ? "var(--accent)" : "transparent",
                    color: window === w.value ? "var(--accent-fg)" : "var(--text-muted)",
                    cursor: "pointer",
                  }}
                >
                  {w.short}
                </button>
              ))}
            </div>

            <div style={{ width: 1, height: 20, background: "var(--border)" }} />

            {/* Sort */}
            <div className="flex items-center" style={{ border: "1px solid var(--border)", padding: 2, gap: 2 }}>
              {(["pnl", "volume"] as SortBy[]).map((s) => (
                <button
                  key={s}
                  onClick={() => setSortBy(s)}
                  className="tag px-2 sm:px-3 py-1 sm:py-1.5 text-[9px] sm:text-xs transition-colors"
                  style={{
                    background: sortBy === s ? "var(--accent)" : "transparent",
                    color: sortBy === s ? "var(--accent-fg)" : "var(--text-muted)",
                    cursor: "pointer",
                  }}
                >
                  {s === "pnl" ? "PNL" : "VOL"}
                </button>
              ))}
            </div>
          </div>

          {/* Search */}
          <div className="relative">
            <div
              className="relative flex items-center"
              style={{
                border: `1px solid ${searchFocused ? "var(--accent)" : "var(--border)"}`,
                background: "var(--bg-surface)",
                boxShadow: searchFocused ? "0 0 0 1px var(--accent), 0 0 24px var(--accent-dim)" : "none",
                transition: "border-color 0.15s, box-shadow 0.15s",
              }}
            >
              {searchFocused && <CornerMarks size={8} inset={-1} thickness={1.5} />}
              <Search size={14} className="absolute left-4 pointer-events-none" style={{ color: "var(--text-faint)" }} />
              <input
                ref={searchRef}
                type="text"
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
                onFocus={() => setSearchFocused(true)}
                onBlur={() => setSearchFocused(false)}
                onKeyDown={(e) => e.key === "Enter" && handleSearch()}
                placeholder="Find rank — paste wallet address…"
                className="w-full bg-transparent outline-none mono text-xs sm:text-sm py-2.5 sm:py-3 pl-9 sm:pl-10 pr-20 sm:pr-28"
                style={{ color: "var(--text)", caretColor: "var(--accent)" }}
              />
              {searchInput && (
                <button onClick={clearSearch} className="absolute right-[68px] sm:right-[92px] opacity-50 hover:opacity-100 transition-opacity" style={{ color: "var(--text-faint)" }}>
                  <X size={13} />
                </button>
              )}
              <button
                onClick={handleSearch}
                disabled={searchPending || !searchInput.trim()}
                className="absolute right-1.5 sm:right-2 sheen-host px-2.5 sm:px-3 py-1 sm:py-1.5 tag text-[9px] sm:text-xs font-bold transition-opacity disabled:opacity-40"
                style={{ background: "var(--accent)", color: "var(--accent-fg)" }}
              >
                {searchPending ? "…" : "SEARCH"}
              </button>
            </div>
          </div>
        </div>

        {/* ── Search result ── */}
        {searchResult && (
          <SearchResultCard
            result={searchResult}
            sortBy={sortBy}
            windowShort={windowShort}
            copyState={copyState}
            onClear={clearSearch}
          />
        )}

        {/* ── Podium ── */}
        {!loading && !error && showPodium && (
          <div key={`podium-${animKey}`}>
            <Podium items={items} sortBy={sortBy} windowShort={windowShort} copyState={copyState} />
          </div>
        )}

        {/* ── Ledger (horizontal bar-chart ranking) ── */}
        <div className="relative" style={{ border: "1px solid var(--border)", background: "var(--bg-surface)" }}>
          <CornerMarks size={8} inset={-1} thickness={1} opacity={0.5} />
    
          {error ? (
            <div className="flex flex-col items-center justify-center py-20 gap-3">
              <span className="mono text-sm" style={{ color: "var(--text-faint)" }}>Failed to load leaderboard</span>
              <button onClick={fetchData} className="tag px-4 py-2" style={{ border: "1px solid var(--accent)", color: "var(--accent)" }}>
                RETRY
              </button>
            </div>
          ) : (
            <div className="overflow-x-auto sm:overflow-x-auto">
              <div className="lb-grid-container">
                {/* column header */}
                <div
                  className="lb-grid grid items-center px-4 py-3"
                  style={{ gap: 16, borderBottom: "1px solid var(--border)" }}
                >
                  <span className="tag" style={{ color: "var(--text-faint)" }}>RANK</span>
                  <span className="tag" style={{ color: "var(--text-faint)" }}>TRADER</span>
                  <span className="tag lb-col-primary flex items-center justify-end gap-1" style={{ color: "var(--accent)" }}>
                    {windowShort} {sortBy === "pnl" ? "PNL" : "VOLUME"} <span>▼</span>
                  </span>
                  <span className="tag text-right lb-col-secondary" style={{ color: "var(--text-faint)" }}>
                    {sortBy === "pnl" ? "VOLUME" : "PNL"}
                  </span>
                </div>

                {/* rows */}
                <div key={animKey}>
                  {loading
                    ? Array.from({ length: PAGE_SIZE }).map((_, i) => <LedgerSkeleton key={i} />)
                    : tableItems.map((item, i) => (
                        <LedgerRow
                          key={item.wallet_address + item.rank}
                          item={item}
                          i={i}
                          sortBy={sortBy}
                          pageMax={pageMax}
                          copyState={copyState}
                        />
                      ))}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* ── Pagination ── */}
        {!error && (
          <div className="flex items-center justify-between mt-5 flex-wrap gap-3">
            <span className="tag" style={{ color: "var(--text-faint)" }}>
              {loading
                ? "LOADING…"
                : `SHOWING ${(page - 1) * PAGE_SIZE + 1}–${Math.min(page * PAGE_SIZE, data?.total ?? 0)} OF ${data?.total.toLocaleString() ?? "—"}`}
            </span>
            <div className="flex items-center gap-2">
              <PgBtn dir="prev" disabled={page === 1 || loading} onClick={() => setPage((p) => Math.max(1, p - 1))} />
              <div className="flex items-center gap-1">
                {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                  let p: number;
                  if (totalPages <= 5) p = i + 1;
                  else if (page <= 3) p = i + 1;
                  else if (page >= totalPages - 2) p = totalPages - 4 + i;
                  else p = page - 2 + i;
                  return (
                    <button
                      key={p}
                      onClick={() => setPage(p)}
                      className="tag w-8 h-7 flex items-center justify-center transition-colors"
                      style={{
                        border: `1px solid ${p === page ? "var(--accent)" : "var(--border)"}`,
                        background: p === page ? "var(--accent)" : "transparent",
                        color: p === page ? "var(--accent-fg)" : "var(--text-faint)",
                        cursor: "pointer",
                      }}
                    >
                      {p}
                    </button>
                  );
                })}
              </div>
              <PgBtn dir="next" disabled={page === totalPages || loading} onClick={() => setPage((p) => Math.min(totalPages, p + 1))} />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

/* Non-animated PnL (for dense table rows — count-up everywhere would be janky) */
function PnlValueStatic({ value, dim }: { value: number; dim?: boolean }) {
  const positive = value >= 0;
  return (
    <span
      className="mono text-xs font-bold tabular-nums"
      style={{ color: positive ? "var(--green)" : "var(--red)", opacity: dim ? 0.85 : 1 }}
    >
      {positive ? "+" : ""}{fmt(value)}
    </span>
  );
}

function PgBtn({ dir, disabled, onClick }: { dir: "prev" | "next"; disabled: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className="flex items-center gap-1 px-3 py-1.5 tag transition-colors disabled:opacity-30"
      style={{ border: "1px solid var(--border)", color: "var(--text-muted)", cursor: disabled ? "default" : "pointer" }}
      onMouseEnter={(e) => {
        if (!disabled) {
          (e.currentTarget as HTMLElement).style.borderColor = "var(--accent)";
          (e.currentTarget as HTMLElement).style.color = "var(--accent)";
        }
      }}
      onMouseLeave={(e) => {
        (e.currentTarget as HTMLElement).style.borderColor = "var(--border)";
        (e.currentTarget as HTMLElement).style.color = "var(--text-muted)";
      }}
    >
      {dir === "prev" ? <><ChevronLeft size={12} /> PREV</> : <>NEXT <ChevronRight size={12} /></>}
    </button>
  );
}
