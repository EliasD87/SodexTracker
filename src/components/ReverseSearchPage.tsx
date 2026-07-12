"use client";

import { useState, useCallback } from "react";
import {
  Search,
  Loader2,
  Copy,
  Check,
  ExternalLink,
  ChevronDown,
  ChevronUp,
  X,
  SlidersHorizontal,
  Plus,
} from "lucide-react";
import Link from "next/link";

type WindowType = "24H" | "7D" | "30D" | "ALL_TIME";
type SortBy = "pnl" | "volume";
type Operator = ">" | "<" | ">=" | "<=";

const ITEMS_PER_PAGE = 20;

const WINDOWS: { label: string; value: WindowType; short: string }[] = [
  { label: "24H", value: "24H", short: "24H" },
  { label: "7D", value: "7D", short: "7D" },
  { label: "30D", value: "30D", short: "30D" },
  { label: "ALL TIME", value: "ALL_TIME", short: "ALL" },
];

function fmt(n: number): string {
  const abs = Math.abs(n);
  const sign = n < 0 ? "-" : "";
  if (abs >= 1_000_000) return `${sign}$${(abs / 1_000_000).toFixed(2)}M`;
  if (abs >= 1_000) return `${sign}$${(abs / 1_000).toFixed(2)}K`;
  return `${sign}$${abs.toFixed(2)}`;
}

function shortAddr(addr: string): string {
  return addr.slice(0, 10) + "\u2026" + addr.slice(-8);
}

interface ResultItem {
  address: string;
  userId: string | number;
  pnl?: number;
  volume?: number;
  rank?: number;
  windowData?: Partial<Record<WindowType, { pnl: number; volume: number; rank?: number }>>;
}

/* ──────────────────────────────────────────────────────────────
   PnlValue — color-coded PnL display
   ────────────────────────────────────────────────────────────── */
function PnlValue({ value }: { value: number }) {
  const positive = value >= 0;
  return (
    <span
      className="mono text-xs font-bold tabular-nums"
      style={{ color: positive ? "var(--green)" : "var(--red)" }}
    >
      {positive ? "+" : ""}
      {fmt(value)}
    </span>
  );
}

/* ──────────────────────────────────────────────────────────────
   ResultsTable — shared between basic and advanced
   ────────────────────────────────────────────────────────────── */
function ResultsTable({
  fullResults,
  pageResults,
  currentPage,
  totalPages,
  isLoadingPage,
  windowShort,
  sortBy,
  copiedAddress,
  onCopy,
  onPrev,
  onNext,
  expandedRow,
  onToggleRow,
}: {
  fullResults: ResultItem[];
  pageResults: ResultItem[];
  currentPage: number;
  totalPages: number;
  isLoadingPage: boolean;
  windowShort: string;
  sortBy: SortBy;
  copiedAddress: string | null;
  onCopy: (addr: string) => void;
  onPrev: () => void;
  onNext: () => void;
  expandedRow: string | null;
  onToggleRow: (addr: string) => void;
}) {
  const formatMetric = (val: number | undefined) => {
    if (val === undefined || val === 0) return "\u2014";
    return fmt(val);
  };

  return (
    <div
      className="mt-6 overflow-hidden"
      style={{
        border: "1px solid var(--border)",
        background: "var(--bg-surface)",
        borderRadius: "var(--r-card)",
      }}
    >
      {/* Header */}
      <div
        className="px-4 sm:px-6 py-4 flex items-center justify-between gap-4 border-b"
        style={{ borderColor: "var(--border)" }}
      >
        <div>
          <h2
            className="text-sm font-bold tracking-tight"
            style={{ color: "var(--text)" }}
          >
            Results
          </h2>
          <p
            className="text-[10px] uppercase tracking-[0.15em] mt-0.5"
            style={{ color: "var(--text-faint)" }}
          >
            {fullResults.length.toLocaleString()} matching \u00b7 {windowShort}{" "}
            {sortBy === "pnl" ? "PNL" : "VOL"}
          </p>
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={onPrev}
            disabled={currentPage === 1 || isLoadingPage}
            className="h-8 w-8 flex items-center justify-center transition-all"
            style={{
              border: "1px solid var(--border)",
              color: "var(--text-muted)",
              borderRadius: "var(--r-sm)",
              opacity: currentPage === 1 || isLoadingPage ? 0.3 : 1,
            }}
          >
            <svg
              className="w-3.5 h-3.5"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M15 19l-7-7 7-7"
              />
            </svg>
          </button>
          <span
            className="px-3 text-[10px] font-bold uppercase tracking-[0.15em]"
            style={{ color: "var(--text-faint)" }}
          >
            {currentPage} / {totalPages || 1}
          </span>
          <button
            onClick={onNext}
            disabled={currentPage >= totalPages || isLoadingPage}
            className="h-8 w-8 flex items-center justify-center transition-all"
            style={{
              border: "1px solid var(--border)",
              color: "var(--text-muted)",
              borderRadius: "var(--r-sm)",
              opacity: currentPage >= totalPages || isLoadingPage ? 0.3 : 1,
            }}
          >
            <svg
              className="w-3.5 h-3.5"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M9 5l7 7-7 7"
              />
            </svg>
          </button>
        </div>
      </div>

      {/* Desktop table */}
      <div className="hidden sm:block overflow-x-auto">
        <table className="w-full text-left">
          <thead>
            <tr className="border-b" style={{ borderColor: "var(--border)" }}>
              <th
                className="px-6 py-3 text-[10px] font-bold uppercase tracking-[0.15em] w-12"
                style={{ color: "var(--text-faint)" }}
              >
                #
              </th>
              <th
                className="px-6 py-3 text-[10px] font-bold uppercase tracking-[0.15em]"
                style={{ color: "var(--text-faint)" }}
              >
                Address
              </th>
              <th
                className="px-6 py-3 text-[10px] font-bold uppercase tracking-[0.15em] text-right"
                style={{ color: "var(--text-faint)" }}
              >
                User ID
              </th>
              <th
                className="px-6 py-3 text-[10px] font-bold uppercase tracking-[0.15em] text-right"
                style={{ color: "var(--text-faint)" }}
              >
                {windowShort} PNL
              </th>
              <th
                className="px-6 py-3 text-[10px] font-bold uppercase tracking-[0.15em] text-right"
                style={{ color: "var(--text-faint)" }}
              >
                {windowShort} VOL
              </th>
              <th className="px-6 py-3 w-20"></th>
            </tr>
          </thead>
          <tbody>
            {pageResults.map((trader, i) => {
              const pnl = trader.pnl || 0;
              const vol = trader.volume || 0;
              return (
                <tr
                  key={i}
                  className="group transition-colors"
                  style={{ borderTop: "1px solid var(--border-subtle)" }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.background = "var(--bg-elevated)";
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.background = "transparent";
                  }}
                >
                  <td className="px-6 py-3">
                    <span
                      className="text-[10px] font-bold tabular-nums"
                      style={{ color: "var(--text-faint)" }}
                    >
                      {(currentPage - 1) * ITEMS_PER_PAGE + i + 1}
                    </span>
                  </td>
                  <td className="px-6 py-3">
                    <span
                      className="text-xs font-mono block whitespace-nowrap"
                      style={{ color: "var(--text-muted)" }}
                    >
                      {trader.address || "N/A"}
                    </span>
                  </td>
                  <td className="px-6 py-3 text-right">
                    <span
                      className="text-xs font-bold tabular-nums"
                      style={{ color: "var(--text-faint)" }}
                    >
                      {trader.userId}
                    </span>
                  </td>
                  <td className="px-6 py-3 text-right">
                    <PnlValue value={pnl} />
                  </td>
                  <td className="px-6 py-3 text-right">
                    <span
                      className="text-xs font-bold tabular-nums mono"
                      style={{ color: "var(--text)" }}
                    >
                      {formatMetric(vol)}
                    </span>
                  </td>
                  <td className="px-6 py-3">
                    <div className="flex items-center gap-1.5 justify-end">
                      <button
                        onClick={() => onCopy(trader.address)}
                        className="p-1.5 transition-all"
                        style={{
                          color: "var(--text-faint)",
                          borderRadius: "var(--r-sm)",
                        }}
                        title="Copy address"
                      >
                        {copiedAddress === trader.address ? (
                          <Check size={14} style={{ color: "var(--green)" }} />
                        ) : (
                          <Copy size={14} />
                        )}
                      </button>
                      <Link
                        href={`/tracker?address=${trader.address}`}
                        className="p-1.5 transition-all"
                        style={{
                          color: "var(--text-faint)",
                          borderRadius: "var(--r-sm)",
                        }}
                        title="View in tracker"
                      >
                        <ExternalLink size={14} />
                      </Link>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Mobile cards */}
      <div className="sm:hidden">
        {pageResults.map((trader, i) => {
          const isExpanded = expandedRow === trader.address;
          const pnl = trader.pnl || 0;
          const vol = trader.volume || 0;
          return (
            <div
              key={i}
              className="px-4 py-3"
              style={{ borderTop: "1px solid var(--border-subtle)" }}
            >
              <div
                onClick={() => onToggleRow(trader.address)}
                className="flex items-center justify-between gap-3 cursor-pointer"
              >
                <div className="flex-1 min-w-0">
                  <span
                    className="text-[10px] font-bold tabular-nums block mb-1"
                    style={{ color: "var(--text-faint)" }}
                  >
                    #{(currentPage - 1) * ITEMS_PER_PAGE + i + 1} \u00b7 ID:{" "}
                    {trader.userId}
                  </span>
                  <p
                    className="text-xs font-mono truncate"
                    style={{ color: "var(--text-muted)" }}
                  >
                    {shortAddr(trader.address)}
                  </p>
                </div>
                <ChevronDown
                  size={16}
                  className="flex-shrink-0 transition-transform"
                  style={{
                    color: "var(--text-faint)",
                    transform: isExpanded ? "rotate(180deg)" : "rotate(0deg)",
                  }}
                />
              </div>
              {isExpanded && (
                <div className="mt-3 space-y-3">
                  <div className="flex items-center gap-2">
                    <p
                      className="text-[10px] font-mono break-all flex-1 p-2.5"
                      style={{
                        color: "var(--text-muted)",
                        background: "var(--bg-elevated)",
                        border: "1px solid var(--border-subtle)",
                        borderRadius: "var(--r-sm)",
                      }}
                    >
                      {trader.address}
                    </p>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        onCopy(trader.address);
                      }}
                      className="p-2 flex-shrink-0"
                      style={{
                        border: "1px solid var(--border)",
                        color: "var(--text-muted)",
                        borderRadius: "var(--r-sm)",
                      }}
                    >
                      {copiedAddress === trader.address ? (
                        <Check size={16} style={{ color: "var(--green)" }} />
                      ) : (
                        <Copy size={16} />
                      )}
                    </button>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <p
                        className="text-[9px] font-bold uppercase tracking-[0.1em] mb-0.5"
                        style={{ color: "var(--text-faint)" }}
                      >
                        {windowShort} PNL
                      </p>
                      <PnlValue value={pnl} />
                    </div>
                    <div>
                      <p
                        className="text-[9px] font-bold uppercase tracking-[0.1em] mb-0.5"
                        style={{ color: "var(--text-faint)" }}
                      >
                        {windowShort} Volume
                      </p>
                      <p
                        className="text-sm font-bold tabular-nums mono"
                        style={{ color: "var(--accent)" }}
                      >
                        {formatMetric(vol)}
                      </p>
                    </div>
                  </div>
                  <Link
                    href={`/tracker?address=${trader.address}`}
                    onClick={(e) => e.stopPropagation()}
                    className="flex items-center justify-center gap-1.5 w-full px-3 py-2 text-[10px] font-bold uppercase tracking-[0.1em]"
                    style={{
                      border: "1px solid var(--border)",
                      color: "var(--text-muted)",
                      borderRadius: "var(--r-sm)",
                    }}
                  >
                    <ExternalLink size={12} />
                    Track
                  </Link>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ──────────────────────────────────────────────────────────────
   LoadingState / EmptyState
   ────────────────────────────────────────────────────────────── */
function LoadingState({ message }: { message: string }) {
  return (
    <div className="py-20 text-center">
      <Loader2
        size={24}
        className="animate-spin mx-auto mb-3"
        style={{ color: "var(--accent)" }}
      />
      <p
        className="text-[10px] uppercase tracking-[0.15em] animate-pulse"
        style={{ color: "var(--text-faint)" }}
      >
        {message}
      </p>
    </div>
  );
}

function EmptyState() {
  return (
    <div className="py-20 text-center">
      <Search
        size={32}
        className="mx-auto mb-3"
        style={{ color: "var(--text-faint)", opacity: 0.3 }}
      />
      <p
        className="text-sm font-bold"
        style={{ color: "var(--text-faint)" }}
      >
        No matching addresses found
      </p>
      <p
        className="text-[10px] uppercase tracking-[0.15em] mt-1"
        style={{ color: "var(--text-faint)", opacity: 0.5 }}
      >
        Try different characters
      </p>
    </div>
  );
}

/* ──────────────────────────────────────────────────────────────
   Main component
   ────────────────────────────────────────────────────────────── */
export function ReverseSearchPage() {
  const [mode, setMode] = useState<"basic" | "advanced">("basic");

  // Basic search state
  const [basicPrefix, setBasicPrefix] = useState("");
  const [basicSuffix, setBasicSuffix] = useState("");

  // Advanced search state
  const [advQuery, setAdvQuery] = useState("");
  const [advPrefix, setAdvPrefix] = useState("");
  const [advSuffix, setAdvSuffix] = useState("");
  const [windowType, setWindowType] = useState<WindowType>("ALL_TIME");
  const [sortBy, setSortBy] = useState<SortBy>("volume");

  // Multiple independent filters
  interface FilterEntry {
    id: number;
    windowType: WindowType;
    metric: SortBy;
    op: Operator;
    value: string;
  }
  const [filters, setFilters] = useState<FilterEntry[]>([
    { id: 1, windowType: "ALL_TIME", metric: "volume", op: ">", value: "" },
  ]);
  const [nextFilterId, setNextFilterId] = useState(2);

  const addFilter = () => {
    setFilters([...filters, { id: nextFilterId, windowType: "ALL_TIME", metric: "pnl", op: ">", value: "" }]);
    setNextFilterId(nextFilterId + 1);
  };
  const removeFilter = (id: number) => {
    setFilters(filters.filter((f) => f.id !== id));
  };
  const updateFilter = (id: number, patch: Partial<FilterEntry>) => {
    setFilters(filters.map((f) => (f.id === id ? { ...f, ...patch } : f)));
  };

  // Shared results state
  const [fullResults, setFullResults] = useState<ResultItem[]>([]);
  const [pageResults, setPageResults] = useState<ResultItem[]>([]);
  const [currentPage, setCurrentPage] = useState(1);
  const [isSearching, setIsSearching] = useState(false);
  const [isLoadingPage, setIsLoadingPage] = useState(false);
  const [expandedRow, setExpandedRow] = useState<string | null>(null);
  const [copiedAddress, setCopiedAddress] = useState<string | null>(null);
  const [hasSearched, setHasSearched] = useState(false);
  const [searchFocused, setSearchFocused] = useState(false);

  const totalPages = Math.ceil(fullResults.length / ITEMS_PER_PAGE);
  const windowShort = WINDOWS.find((w) => w.value === windowType)!.short;

  const handleCopy = (address: string) => {
    navigator.clipboard.writeText(address);
    setCopiedAddress(address);
    setTimeout(() => setCopiedAddress(null), 2000);
  };

  const toggleRow = (addr: string) => {
    setExpandedRow(expandedRow === addr ? null : addr);
  };

  const loadPage = (pageNum: number) => {
    setIsLoadingPage(true);
    setExpandedRow(null);
    const start = (pageNum - 1) * ITEMS_PER_PAGE;
    setPageResults(fullResults.slice(start, start + ITEMS_PER_PAGE));
    setCurrentPage(pageNum);
    setIsLoadingPage(false);
  };

  /* ── Basic search: prefix + suffix only, ALL_TIME volume ── */
  const handleBasicSearch = async () => {
    const p = basicPrefix.trim();
    const s = basicSuffix.trim();
    if (!p && !s) return;

    setIsSearching(true);
    setHasSearched(true);
    setExpandedRow(null);

    try {
      const params = new URLSearchParams();
      if (p) params.append("prefix", p.toLowerCase());
      if (s) params.append("suffix", s.toLowerCase());

      const res = await fetch(`/api/reverse-search?${params.toString()}`);
      if (!res.ok) throw new Error("Search failed");

      const { data } = await res.json();
      const matched: { address: string; userId: string | number }[] = data || [];

      if (matched.length === 0) {
        setFullResults([]);
        setPageResults([]);
        return;
      }

      // Fetch ALL_TIME volume for each
      const withData = await Promise.all(
        matched.map(async (item) => {
          try {
            const r = await fetch(
              `https://mainnet-data.sodex.dev/api/v1/leaderboard/rank?window_type=ALL_TIME&sort_by=volume&wallet_address=${item.address}`
            );
            if (r.ok) {
              const j = await r.json();
              const ri = j.data?.item;
              if (ri) {
                return {
                  ...item,
                  pnl: parseFloat(ri.pnl_usd || "0"),
                  volume: parseFloat(ri.volume_usd || "0"),
                  rank: ri.rank,
                };
              }
            }
          } catch {}
          return { ...item, pnl: 0, volume: 0 };
        })
      );

      withData.sort((a, b) => (b.volume || 0) - (a.volume || 0));
      setFullResults(withData);
      setPageResults(withData.slice(0, ITEMS_PER_PAGE));
      setCurrentPage(1);
    } catch (error) {
      console.error("[reverse-search] Basic error:", error);
      setFullResults([]);
      setPageResults([]);
    } finally {
      setIsSearching(false);
    }
  };

  /* ── Advanced search: any field optional + multiple filters ── */
  const matchesAllFilters = (item: ResultItem): boolean => {
    return filters.every((f) => {
      const wd = item.windowData?.[f.windowType];
      const val = wd ? (f.metric === "pnl" ? wd.pnl : wd.volume) : 0;
      const threshold = parseFloat(f.value);
      if (isNaN(threshold)) return true; // empty filter = no filter
      switch (f.op) {
        case ">": return val > threshold;
        case "<": return val < threshold;
        case ">=": return val >= threshold;
        case "<=": return val <= threshold;
        default: return true;
      }
    });
  };

  const handleAdvancedSearch = async () => {
    const q = advQuery.trim();
    const p = advPrefix.trim();
    const s = advSuffix.trim();
    if (!q && !p && !s) return;

    setIsSearching(true);
    setHasSearched(true);
    setExpandedRow(null);

    try {
      const params = new URLSearchParams();
      if (p) params.append("prefix", p.toLowerCase());
      if (s) params.append("suffix", s.toLowerCase());
      if (q) params.append("query", q.toLowerCase());

      const res = await fetch(`/api/reverse-search?${params.toString()}`);
      if (!res.ok) throw new Error("Search failed");

      const { data } = await res.json();
      const matched: { address: string; userId: string | number }[] = data || [];

      if (matched.length === 0) {
        setFullResults([]);
        setPageResults([]);
        return;
      }

      // Collect all unique window types needed (main display + all filter windows)
      const allWindows = new Set<WindowType>([windowType]);
      filters.forEach((f) => allWindows.add(f.windowType));

      // Fetch leaderboard data for all needed window types
      const withData: ResultItem[] = await Promise.all(
        matched.map(async (item) => {
          const windowData: ResultItem["windowData"] = {};
          for (const w of allWindows) {
            try {
              const r = await fetch(
                `https://mainnet-data.sodex.dev/api/v1/leaderboard/rank?window_type=${w}&sort_by=${sortBy}&wallet_address=${item.address}`
              );
              if (r.ok) {
                const j = await r.json();
                const ri = j.data?.item;
                if (ri) {
                  windowData[w] = {
                    pnl: parseFloat(ri.pnl_usd || "0"),
                    volume: parseFloat(ri.volume_usd || "0"),
                    rank: ri.rank,
                  };
                }
              }
            } catch {}
            if (!windowData[w]) {
              windowData[w] = { pnl: 0, volume: 0 };
            }
          }
          const main = windowData[windowType]!;
          return {
            ...item,
            pnl: main.pnl,
            volume: main.volume,
            rank: main.rank,
            windowData,
          };
        })
      );

      // Apply all active filters
      const hasAnyFilter = filters.some(
        (f) => f.value.trim() !== "" && !isNaN(parseFloat(f.value))
      );
      const filtered = hasAnyFilter ? withData.filter(matchesAllFilters) : withData;

      // Sort by selected metric
      filtered.sort((a, b) => {
        const aVal = sortBy === "pnl" ? a.pnl || 0 : a.volume || 0;
        const bVal = sortBy === "pnl" ? b.pnl || 0 : b.volume || 0;
        return bVal - aVal;
      });

      setFullResults(filtered);
      setPageResults(filtered.slice(0, ITEMS_PER_PAGE));
      setCurrentPage(1);
    } catch (error) {
      console.error("[reverse-search] Advanced error:", error);
      setFullResults([]);
      setPageResults([]);
    } finally {
      setIsSearching(false);
    }
  };

  const clearAll = () => {
    setBasicPrefix("");
    setBasicSuffix("");
    setAdvQuery("");
    setAdvPrefix("");
    setAdvSuffix("");
    setFilters([{ id: 1, windowType: "ALL_TIME", metric: "volume", op: ">", value: "" }]);
    setNextFilterId(2);
    setFullResults([]);
    setPageResults([]);
    setHasSearched(false);
  };

  /* ── Shared input style ── */
  const inputStyle: React.CSSProperties = {
    background: "var(--bg-elevated)",
    border: "1px solid var(--border)",
    color: "var(--text)",
    borderRadius: "var(--r-md)",
  };

  const focusBorder = (e: React.FocusEvent<HTMLInputElement | HTMLSelectElement>) => {
    e.currentTarget.style.borderColor = "var(--accent)";
  };
  const blurBorder = (e: React.FocusEvent<HTMLInputElement | HTMLSelectElement>) => {
    e.currentTarget.style.borderColor = "var(--border)";
  };

  /* ── Mode toggle button group ── */
  const ModeToggle = () => (
    <div
      className="flex items-center"
      style={{ border: "1px solid var(--border)", padding: 2, gap: 2 }}
    >
      <button
        onClick={() => {
          setMode("basic");
          setFullResults([]);
          setPageResults([]);
          setHasSearched(false);
        }}
        className="tag px-3 py-1.5 text-[10px] transition-colors"
        style={{
          background: mode === "basic" ? "var(--accent)" : "transparent",
          color: mode === "basic" ? "var(--accent-fg)" : "var(--text-muted)",
          cursor: "pointer",
        }}
      >
        BASIC
      </button>
      <button
        onClick={() => {
          setMode("advanced");
          setFullResults([]);
          setPageResults([]);
          setHasSearched(false);
        }}
        className="tag px-3 py-1.5 text-[10px] transition-colors"
        style={{
          background: mode === "advanced" ? "var(--accent)" : "transparent",
          color: mode === "advanced" ? "var(--accent-fg)" : "var(--text-muted)",
          cursor: "pointer",
        }}
      >
        ADVANCED
      </button>
    </div>
  );

  return (
    <div
      className="min-h-screen pt-[72px] pb-20"
      style={{ background: "var(--bg)" }}
    >
      <div className="max-w-[1100px] mx-auto px-5">
        {/* Header */}
        <div
          className="pt-6 pb-6 border-b"
          style={{ borderColor: "var(--border)" }}
        >
          <div className="flex items-center justify-between flex-wrap gap-3">
            <div>
              <div className="flex items-center gap-2 mb-2">
                <span
                  className="w-5 h-px"
                  style={{ background: "var(--accent)" }}
                />
                <span className="tag" style={{ color: "var(--accent)" }}>
                  BETA
                </span>
              </div>
              <div className="flex items-center gap-2.5">
                <Search size={22} style={{ color: "var(--accent)" }} />
                <h1
                  className="text-[26px] sm:text-[44px] font-bold leading-none tracking-tight"
                  style={{
                    color: "var(--text)",
                    letterSpacing: "-0.02em",
                  }}
                >
                  Reverse Search
                </h1>
              </div>
              <p
                className="mt-2 text-sm"
                style={{ color: "var(--text-faint)" }}
              >
                Find wallet addresses by their characters
              </p>
            </div>
            <ModeToggle />
          </div>
        </div>

        {/* ── BASIC MODE ── */}
        {mode === "basic" && (
          <div className="mt-6">
            <div
              className="p-5 sm:p-6 space-y-4"
              style={{
                border: "1px solid var(--border)",
                background: "var(--bg-surface)",
                borderRadius: "var(--r-card)",
              }}
            >
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <label
                    className="text-[10px] font-bold uppercase tracking-[0.15em]"
                    style={{ color: "var(--text-faint)" }}
                  >
                    Starts With
                  </label>
                  <input
                    placeholder="0x1a2b..."
                    value={basicPrefix}
                    onChange={(e) => setBasicPrefix(e.target.value)}
                    onKeyDown={(e) =>
                      e.key === "Enter" && handleBasicSearch()
                    }
                    className="w-full h-11 px-3.5 font-mono text-sm outline-none transition-all"
                    style={inputStyle}
                    onFocus={focusBorder}
                    onBlur={blurBorder}
                  />
                </div>
                <div className="space-y-2">
                  <label
                    className="text-[10px] font-bold uppercase tracking-[0.15em]"
                    style={{ color: "var(--text-faint)" }}
                  >
                    Ends With
                  </label>
                  <input
                    placeholder="...c4d5"
                    value={basicSuffix}
                    onChange={(e) => setBasicSuffix(e.target.value)}
                    onKeyDown={(e) =>
                      e.key === "Enter" && handleBasicSearch()
                    }
                    className="w-full h-11 px-3.5 font-mono text-sm outline-none transition-all"
                    style={inputStyle}
                    onFocus={focusBorder}
                    onBlur={blurBorder}
                  />
                </div>
              </div>

              <div className="flex items-center justify-between gap-3">
                <p
                  className="text-[11px]"
                  style={{ color: "var(--text-faint)" }}
                >
                  {isSearching
                    ? "Searching..."
                    : hasSearched
                    ? `${fullResults.length.toLocaleString()} matches`
                    : "Search by first and/or last characters"}
                </p>
                <div className="flex items-center gap-3">
                  {(basicPrefix || basicSuffix) && (
                    <button
                      onClick={() => {
                        setBasicPrefix("");
                        setBasicSuffix("");
                      }}
                      className="flex items-center gap-1 text-[10px] font-bold uppercase tracking-[0.1em] transition-colors"
                      style={{ color: "var(--text-faint)" }}
                    >
                      <X size={11} />
                      Clear
                    </button>
                  )}
                  <button
                    onClick={handleBasicSearch}
                    disabled={isSearching || (!basicPrefix && !basicSuffix)}
                    className="px-4 py-2 tag text-[10px] font-bold transition-opacity disabled:opacity-40"
                    style={{
                      background: "var(--accent)",
                      color: "var(--accent-fg)",
                      borderRadius: "var(--r-sm)",
                    }}
                  >
                    {isSearching ? "\u2026" : "SEARCH"}
                  </button>
                </div>
              </div>
            </div>

            <p
              className="mt-3 text-[10px]"
              style={{ color: "var(--text-faint)" }}
            >
              Basic search shows all-time volume. Use Advanced for more filters.
            </p>
          </div>
        )}

        {/* ── ADVANCED MODE ── */}
        {mode === "advanced" && (
          <div className="mt-6 space-y-4">
            {/* Address inputs */}
            <div
              className="p-5 sm:p-6 space-y-4"
              style={{
                border: "1px solid var(--border)",
                background: "var(--bg-surface)",
                borderRadius: "var(--r-card)",
              }}
            >
              {/* Address inputs — all optional, at least one required */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <label
                    className="text-[10px] font-bold uppercase tracking-[0.15em]"
                    style={{ color: "var(--text-faint)" }}
                  >
                    Starts With
                  </label>
                  <input
                    placeholder="0x1a..."
                    value={advPrefix}
                    onChange={(e) => setAdvPrefix(e.target.value)}
                    onKeyDown={(e) =>
                      e.key === "Enter" && handleAdvancedSearch()
                    }
                    className="w-full h-11 px-3.5 font-mono text-sm outline-none transition-all"
                    style={inputStyle}
                    onFocus={focusBorder}
                    onBlur={blurBorder}
                  />
                </div>
                <div className="space-y-2">
                  <label
                    className="text-[10px] font-bold uppercase tracking-[0.15em]"
                    style={{ color: "var(--text-faint)" }}
                  >
                    Ends With
                  </label>
                  <input
                    placeholder="...c4d5"
                    value={advSuffix}
                    onChange={(e) => setAdvSuffix(e.target.value)}
                    onKeyDown={(e) =>
                      e.key === "Enter" && handleAdvancedSearch()
                    }
                    className="w-full h-11 px-3.5 font-mono text-sm outline-none transition-all"
                    style={inputStyle}
                    onFocus={focusBorder}
                    onBlur={blurBorder}
                  />
                </div>
              </div>

              {/* Optional: contains (middle characters) */}
              <div className="space-y-2">
                <label
                  className="text-[10px] font-bold uppercase tracking-[0.15em] flex items-center gap-1.5"
                  style={{ color: "var(--text-faint)" }}
                >
                  <SlidersHorizontal size={11} />
                  Contains (optional — any consecutive characters)
                </label>
                <input
                  placeholder="e.g. a1b2 — matches anywhere in the address"
                  value={advQuery}
                  onChange={(e) => setAdvQuery(e.target.value)}
                  onKeyDown={(e) =>
                    e.key === "Enter" && handleAdvancedSearch()
                  }
                  className="w-full h-11 px-3.5 font-mono text-sm outline-none transition-all"
                  style={inputStyle}
                  onFocus={focusBorder}
                  onBlur={blurBorder}
                />
              </div>


              {/* Window + Metric */}
              <div className="flex flex-wrap items-center gap-3 pt-2">
                <div className="flex items-center gap-2">
                  <span
                    className="tag text-[9px]"
                    style={{ color: "var(--text-faint)" }}
                  >
                    WINDOW
                  </span>
                  <div
                    className="flex items-center"
                    style={{
                      border: "1px solid var(--border)",
                      padding: 2,
                      gap: 2,
                    }}
                  >
                    {WINDOWS.map((w) => (
                      <button
                        key={w.value}
                        onClick={() => setWindowType(w.value)}
                        className="tag px-2.5 py-1 text-[9px] transition-colors"
                        style={{
                          background:
                            windowType === w.value
                              ? "var(--accent)"
                              : "transparent",
                          color:
                            windowType === w.value
                              ? "var(--accent-fg)"
                              : "var(--text-muted)",
                          cursor: "pointer",
                        }}
                      >
                        {w.short}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <span
                    className="tag text-[9px]"
                    style={{ color: "var(--text-faint)" }}
                  >
                    METRIC
                  </span>
                  <div
                    className="flex items-center"
                    style={{
                      border: "1px solid var(--border)",
                      padding: 2,
                      gap: 2,
                    }}
                  >
                    {(["pnl", "volume"] as SortBy[]).map((s) => (
                      <button
                        key={s}
                        onClick={() => setSortBy(s)}
                        className="tag px-2.5 py-1 text-[9px] transition-colors"
                        style={{
                          background:
                            sortBy === s ? "var(--accent)" : "transparent",
                          color:
                            sortBy === s
                              ? "var(--accent-fg)"
                              : "var(--text-muted)",
                          cursor: "pointer",
                        }}
                      >
                        {s === "pnl" ? "PNL" : "VOL"}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              {/* Filters — each row is an independent VOL or PnL filter */}
              <div className="space-y-2 pt-1">
                <div className="flex items-center justify-between">
                  <span
                    className="tag text-[9px]"
                    style={{ color: "var(--text-faint)" }}
                  >
                    FILTERS
                  </span>
                  <button
                    onClick={addFilter}
                    className="flex items-center gap-1 text-[10px] font-bold uppercase tracking-[0.1em] transition-colors"
                    style={{ color: "var(--accent)" }}
                  >
                    <Plus size={12} />
                    Add Filter
                  </button>
                </div>

                {filters.map((f) => (
                  <div
                    key={f.id}
                    className="flex flex-wrap items-center gap-2"
                  >
                    {/* Window selector */}
                    <div
                      className="flex items-center"
                      style={{ border: "1px solid var(--border)", padding: 2, gap: 2 }}
                    >
                      {WINDOWS.map((w) => (
                        <button
                          key={w.value}
                          onClick={() => updateFilter(f.id, { windowType: w.value })}
                          className="tag px-2 py-1 text-[8px] transition-colors"
                          style={{
                            background: f.windowType === w.value ? "var(--accent)" : "transparent",
                            color: f.windowType === w.value ? "var(--accent-fg)" : "var(--text-muted)",
                            cursor: "pointer",
                          }}
                        >
                          {w.short}
                        </button>
                      ))}
                    </div>

                    {/* Metric toggle */}
                    <div
                      className="flex items-center"
                      style={{ border: "1px solid var(--border)", padding: 2, gap: 2 }}
                    >
                      {(["volume", "pnl"] as SortBy[]).map((m) => (
                        <button
                          key={m}
                          onClick={() => updateFilter(f.id, { metric: m })}
                          className="tag px-2.5 py-1 text-[9px] transition-colors"
                          style={{
                            background: f.metric === m ? "var(--accent)" : "transparent",
                            color: f.metric === m ? "var(--accent-fg)" : "var(--text-muted)",
                            cursor: "pointer",
                          }}
                        >
                          {m === "pnl" ? "PNL" : "VOL"}
                        </button>
                      ))}
                    </div>

                    {/* Operator toggle */}
                    <div
                      className="flex items-center"
                      style={{ border: "1px solid var(--border)", padding: 2, gap: 2 }}
                    >
                      {([">", "<", ">=", "<="] as Operator[]).map((op) => (
                        <button
                          key={op}
                          onClick={() => updateFilter(f.id, { op })}
                          className="tag px-2.5 py-1 text-[10px] font-bold mono transition-colors"
                          style={{
                            background: f.op === op ? "var(--accent)" : "transparent",
                            color: f.op === op ? "var(--accent-fg)" : "var(--text-muted)",
                            cursor: "pointer",
                            borderRadius: "var(--r-sm)",
                          }}
                        >
                          {op}
                        </button>
                      ))}
                    </div>

                    {/* Value input */}
                    <input
                      type="text"
                      inputMode="decimal"
                      placeholder="e.g. 10000"
                      value={f.value}
                      onChange={(e) => {
                        const v = e.target.value.replace(/[^0-9.\-]/g, "");
                        updateFilter(f.id, { value: v });
                      }}
                      onKeyDown={(e) =>
                        e.key === "Enter" && handleAdvancedSearch()
                      }
                      className="h-8 w-32 px-3 text-xs outline-none mono"
                      style={{
                        background: "var(--bg-elevated)",
                        border: "1px solid var(--border)",
                        color: "var(--text)",
                        borderRadius: "var(--r-sm)",
                      }}
                      onFocus={focusBorder}
                      onBlur={blurBorder}
                    />
                    <span
                      className="tag text-[9px]"
                      style={{ color: "var(--text-faint)" }}
                    >
                      USD
                    </span>

                    {/* Remove filter button (only if more than 1) */}
                    {filters.length > 1 && (
                      <button
                        onClick={() => removeFilter(f.id)}
                        className="p-1 transition-colors"
                        style={{ color: "var(--text-faint)" }}
                      >
                        <X size={14} />
                      </button>
                    )}
                  </div>
                ))}
              </div>

              {/* Action row */}
              <div className="flex items-center justify-between gap-3 pt-2">
                <p
                  className="text-[11px]"
                  style={{ color: "var(--text-faint)" }}
                >
                  {isSearching
                    ? "Searching..."
                    : hasSearched
                    ? `${fullResults.length.toLocaleString()} matches`
                    : "At least one address field is required."}
                </p>
                <div className="flex items-center gap-3">
                  {(advQuery || advPrefix || advSuffix || filters.some((f) => f.value)) && (
                    <button
                      onClick={() => {
                        setAdvQuery("");
                        setAdvPrefix("");
                        setAdvSuffix("");
                        setFilters([{ id: 1, windowType: "ALL_TIME", metric: "volume", op: ">", value: "" }]);
                        setNextFilterId(2);
                      }}
                      className="flex items-center gap-1 text-[10px] font-bold uppercase tracking-[0.1em] transition-colors"
                      style={{ color: "var(--text-faint)" }}
                    >
                      <X size={11} />
                      Clear
                    </button>
                  )}
                  <button
                    onClick={handleAdvancedSearch}
                    disabled={
                      isSearching ||
                      (!advQuery.trim() && !advPrefix.trim() && !advSuffix.trim())
                    }
                    className="px-4 py-2 tag text-[10px] font-bold transition-opacity disabled:opacity-40"
                    style={{
                      background: "var(--accent)",
                      color: "var(--accent-fg)",
                      borderRadius: "var(--r-sm)",
                    }}
                  >
                    {isSearching ? "\u2026" : "SEARCH"}
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Loading / Empty / Results */}
        {isSearching && (
          <LoadingState
            message={
              fullResults.length > 0
                ? "Fetching leaderboard data..."
                : "Searching addresses..."
            }
          />
        )}

        {!isSearching && hasSearched && fullResults.length === 0 && (
          <EmptyState />
        )}

        {!isSearching && fullResults.length > 0 && (
          <ResultsTable
            fullResults={fullResults}
            pageResults={pageResults}
            currentPage={currentPage}
            totalPages={totalPages}
            isLoadingPage={isLoadingPage}
            windowShort={mode === "basic" ? "ALL" : windowShort}
            sortBy={mode === "basic" ? "volume" : sortBy}
            copiedAddress={copiedAddress}
            onCopy={handleCopy}
            onPrev={() => loadPage(currentPage - 1)}
            onNext={() => loadPage(Math.min(totalPages, currentPage + 1))}
            expandedRow={expandedRow}
            onToggleRow={toggleRow}
          />
        )}
      </div>
    </div>
  );
}
