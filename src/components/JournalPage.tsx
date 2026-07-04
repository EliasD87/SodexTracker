"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  X,
  ChevronLeft,
  ChevronRight,
  BookOpen,
  TrendingUp,
  TrendingDown,
  Tag,
  Smile,
  Meh,
  Frown,
  Angry,
  Laugh,
  Trash2,
  Save,
  Plus,
  PenLine,
  Search,
  Calendar,
  ArrowUpRight,
  ArrowDownRight,
  Edit3,
  PieChart,
  Activity,
  BarChart3,
  Target,
  Award,
  Flame,
  DollarSign,
  Percent,
  Layers,
  Download,
  Loader2,
  AlertCircle,
  ChevronDown,
  Wallet,
  Check,
} from "lucide-react";
import { TokenIcon } from "@/components/TokenIcon";
import { cachedApiFetch } from "@/lib/fetchCache";

/* ════════════════════════════════════════════════════════════════
   Position history types (for auto-fetch)
   ════════════════════════════════════════════════════════════════ */

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

type FetchStatus = "idle" | "resolving" | "loading" | "done" | "error";

interface AutoFetchState {
  status: FetchStatus;
  address: string;
  accountId: number | null;
  fetchedCount: number;
  totalPositions: number;
  nextCursor: string | null;
  error: string | null;
  startedAt: number | null;
  finishedAt: number | null;
}

/* ════════════════════════════════════════════════════════════════
   Constants
   ════════════════════════════════════════════════════════════════ */

const GW_BASE = "https://mainnet-gw.sodex.dev/api/v1";
const STORAGE_KEY = "sodex-journal-trades-v1";
const DEFAULT_TAKER_FEE = 0.0004;
const DEFAULT_MAKER_FEE = 0.00012;

/* ════════════════════════════════════════════════════════════════
   Types
   ════════════════════════════════════════════════════════════════ */

type Mood = 1 | 2 | 3 | 4 | 5;
type Direction = "long" | "short";
type TradeStatus = "open" | "closed";
type OrderType = "market" | "limit";

interface SymbolInfo {
  id: number;
  name: string;
  displayName: string;
  makerFee?: string;
  takerFee?: string;
  maxLeverage?: number;
}

interface Trade {
  id: string;
  pair: string;
  direction: Direction;
  status: TradeStatus;
  orderType: OrderType;
  leverage: number;
  margin: number;
  entryPrice: number;
  exitPrice: number | null;
  entryDate: string;
  exitDate: string | null;
  pnl: number | null;
  pnlManual: boolean;
  fees: number;
  notes: string;
  mood: Mood;
  tags: string[];
  createdAt: number;
  updatedAt: number;
}

/* ════════════════════════════════════════════════════════════════
   Mood config
   ════════════════════════════════════════════════════════════════ */

const MOODS: { value: Mood; label: string; icon: React.ElementType; color: string }[] = [
  { value: 1, label: "Terrible", icon: Angry, color: "var(--cal-red)" },
  { value: 2, label: "Bad", icon: Frown, color: "var(--cal-red)" },
  { value: 3, label: "Neutral", icon: Meh, color: "var(--text-muted)" },
  { value: 4, label: "Good", icon: Smile, color: "var(--cal-green)" },
  { value: 5, label: "Great", icon: Laugh, color: "var(--cal-green)" },
];

const AVAILABLE_TAGS = [
  "FOMO", "Patient", "Over-leveraged", "Good setup", "Revenge trade",
  "Scalp", "Swing", "Hedge", "News-driven", "Plan followed",
  "Early exit", "Late entry", "High conviction", "Low conviction",
];

const LEVERAGE_OPTIONS = [1, 2, 3, 5, 10, 15, 20, 25, 50, 75, 100];

/* ════════════════════════════════════════════════════════════════
   Helpers
   ════════════════════════════════════════════════════════════════ */

function uid(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

function fmt(n: number, dp = 2): string {
  const abs = Math.abs(n);
  const sign = n < 0 ? "-" : n > 0 ? "+" : "";
  if (abs >= 1_000_000) return `${sign}$${(abs / 1_000_000).toFixed(dp)}M`;
  if (abs >= 1_000) return `${sign}$${(abs / 1_000).toFixed(dp)}K`;
  return `${sign}$${abs.toFixed(dp)}`;
}

function fmtUSD(n: number, dp = 2): string {
  const abs = Math.abs(n);
  const sign = n < 0 ? "-" : "";
  return `${sign}$${abs.toLocaleString("en-US", { minimumFractionDigits: dp, maximumFractionDigits: dp })}`;
}

function todayKey(): string {
  const d = new Date();
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`;
}

function dateKeyFromParts(y: number, m: number, d: number): string {
  return `${y}-${String(m + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

function parseDateKey(key: string): Date {
  const [y, m, d] = key.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}

function getNotional(margin: number, leverage: number): number {
  return margin * leverage;
}

function getQty(margin: number, leverage: number, entryPrice: number): number {
  if (entryPrice <= 0) return 0;
  return getNotional(margin, leverage) / entryPrice;
}

function calcFees(margin: number, leverage: number, entryPrice: number, exitPrice: number | null, orderType: OrderType, takerFee: number, makerFee: number): number {
  const notional = getNotional(margin, leverage);
  const entryFeeRate = orderType === "market" ? takerFee : makerFee;
  const entryFee = notional * entryFeeRate;
  let exitFee = 0;
  if (exitPrice !== null && exitPrice > 0) {
    const qty = getQty(margin, leverage, entryPrice);
    exitFee = qty * exitPrice * takerFee;
  }
  return entryFee + exitFee;
}

function calcPnl(t: Trade): number | null {
  if (t.pnlManual && t.pnl !== null) return t.pnl;
  if (t.status !== "closed" || t.exitPrice === null) return null;
  const qty = getQty(t.margin, t.leverage, t.entryPrice);
  const rawPnl = t.direction === "long"
    ? (t.exitPrice - t.entryPrice) * qty
    : (t.entryPrice - t.exitPrice) * qty;
  return rawPnl - t.fees;
}

/* ════════════════════════════════════════════════════════════════
   localStorage
   ════════════════════════════════════════════════════════════════ */

function loadTrades(): Trade[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function saveTrades(trades: Trade[]) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(trades));
  } catch {}
}

/* ════════════════════════════════════════════════════════════════
   API — fetch perps symbols for pair selector
   ════════════════════════════════════════════════════════════════ */

async function fetchSymbols(): Promise<SymbolInfo[]> {
  const data = await cachedApiFetch<SymbolInfo[]>(`${GW_BASE}/perps/markets/symbols`, 2, 30 * 60 * 1000);
  return data;
}

/* ════════════════════════════════════════════════════════════════
   Pair Selector
   ════════════════════════════════════════════════════════════════ */

function PairSelector({
  symbols,
  value,
  onChange,
}: {
  symbols: SymbolInfo[];
  value: string;
  onChange: (pair: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  const filtered = useMemo(() => {
    const q = query.trim().toUpperCase();
    if (!q) return symbols;
    return symbols.filter((s) => s.name.toUpperCase().includes(q) || s.displayName.toUpperCase().includes(q));
  }, [symbols, query]);

  const selected = symbols.find((s) => s.name === value);

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="flex items-center gap-2 w-full px-3 py-2.5 transition-colors"
        style={{ background: "var(--bg)", border: "1px solid var(--border)", borderRadius: "var(--r-md)" }}
      >
        {selected ? (
          <>
            <TokenIcon symbol={selected.name} size={20} />
            <span className="mono text-sm font-bold" style={{ color: "var(--text)" }}>{selected.displayName}</span>
          </>
        ) : (
          <span className="text-sm" style={{ color: "var(--text-faint)" }}>Select pair…</span>
        )}
        <ChevronRight size={14} style={{ marginLeft: "auto", color: "var(--text-faint)", transform: open ? "rotate(90deg)" : "none", transition: "transform 0.2s" }} />
      </button>

      {open && (
        <div className="absolute top-full left-0 right-0 mt-1 z-50"
          style={{ background: "var(--bg-surface)", border: "1px solid var(--border)", borderRadius: "var(--r-md)", boxShadow: "0 8px 32px rgba(0,0,0,0.28)", maxHeight: 280, display: "flex", flexDirection: "column" }}>
          <div className="p-2" style={{ borderBottom: "1px solid var(--border-subtle)" }}>
            <div className="flex items-center gap-2 px-2 py-1.5" style={{ background: "var(--bg)", borderRadius: "var(--r-sm)" }}>
              <Search size={13} style={{ color: "var(--text-faint)" }} />
              <input autoFocus value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search…" className="flex-1 bg-transparent outline-none text-sm" style={{ color: "var(--text)" }} />
            </div>
          </div>
          <div className="overflow-y-auto flex-1" style={{ maxHeight: 220 }}>
            {filtered.length === 0 ? (
              <div className="px-3 py-4 text-center text-sm" style={{ color: "var(--text-faint)" }}>No pairs found</div>
            ) : (
              filtered.map((s) => (
                <button key={s.id} type="button"
                  onClick={() => { onChange(s.name); setOpen(false); setQuery(""); }}
                  className="flex items-center gap-2 w-full px-3 py-2 transition-colors text-left"
                  style={{ background: s.name === value ? "var(--accent-dim)" : "transparent" }}
                  onMouseEnter={(e) => { if (s.name !== value) (e.currentTarget as HTMLElement).style.background = "var(--bg-elevated)"; }}
                  onMouseLeave={(e) => { if (s.name !== value) (e.currentTarget as HTMLElement).style.background = "transparent"; }}
                >
                  <TokenIcon symbol={s.name} size={18} />
                  <span className="mono text-xs font-bold" style={{ color: "var(--text)" }}>{s.displayName}</span>
                  <span className="tag ml-auto" style={{ color: "var(--text-faint)", fontSize: 8 }}>{s.name}</span>
                </button>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}

/* ════════════════════════════════════════════════════════════════
   Trade Form
   ════════════════════════════════════════════════════════════════ */

function TradeForm({
  symbols,
  editingTrade,
  onSave,
  onCancel,
}: {
  symbols: SymbolInfo[];
  editingTrade: Trade | null;
  onSave: (t: Trade) => void;
  onCancel: () => void;
}) {
  const [pair, setPair] = useState(editingTrade?.pair ?? "");
  const [direction, setDirection] = useState<Direction>(editingTrade?.direction ?? "long");
  const [status, setStatus] = useState<TradeStatus>(editingTrade?.status ?? "open");
  const [orderType, setOrderType] = useState<OrderType>(editingTrade?.orderType ?? "market");
  const [leverage, setLeverage] = useState(editingTrade?.leverage ?? 10);
  const [margin, setMargin] = useState(editingTrade ? String(editingTrade.margin) : "");
  const [entryPrice, setEntryPrice] = useState(editingTrade ? String(editingTrade.entryPrice) : "");
  const [exitPrice, setExitPrice] = useState(editingTrade?.exitPrice ? String(editingTrade.exitPrice) : "");
  const [entryDate, setEntryDate] = useState(editingTrade?.entryDate ?? todayKey());
  const [exitDate, setExitDate] = useState(editingTrade?.exitDate ?? todayKey());
  const [notes, setNotes] = useState(editingTrade?.notes ?? "");
  const [mood, setMood] = useState<Mood>(editingTrade?.mood ?? 3);
  const [tags, setTags] = useState<string[]>(editingTrade?.tags ?? []);
  const [pnlManual, setPnlManual] = useState(editingTrade?.pnlManual ?? false);
  const [pnlOverride, setPnlOverride] = useState(editingTrade?.pnl != null ? String(editingTrade.pnl) : "");

  const symInfo = symbols.find((s) => s.name === pair);
  const takerFee = symInfo ? parseFloat(symInfo.takerFee ?? String(DEFAULT_TAKER_FEE)) : DEFAULT_TAKER_FEE;
  const makerFee = symInfo ? parseFloat(symInfo.makerFee ?? String(DEFAULT_MAKER_FEE)) : DEFAULT_MAKER_FEE;
  const maxLev = symInfo?.maxLeverage ?? 100;

  const marginNum = parseFloat(margin) || 0;
  const entryNum = parseFloat(entryPrice) || 0;
  const exitNum = parseFloat(exitPrice) || 0;

  const notional = getNotional(marginNum, leverage);
  const qty = getQty(marginNum, leverage, entryNum);
  const fees = calcFees(marginNum, leverage, entryNum, status === "closed" ? exitNum : null, orderType, takerFee, makerFee);

  const autoPnl = useMemo(() => {
    if (status !== "closed" || !exitNum || !entryNum) return null;
    const raw = direction === "long" ? (exitNum - entryNum) * qty : (entryNum - exitNum) * qty;
    return raw - fees;
  }, [status, exitNum, entryNum, direction, qty, fees]);

  const livePnl = pnlManual ? (parseFloat(pnlOverride) || 0) : autoPnl;

  const toggleTag = (t: string) => setTags((prev) => (prev.includes(t) ? prev.filter((x) => x !== t) : [...prev, t]));

  const canSave = pair && entryNum > 0 && marginNum > 0 && (status === "open" || (status === "closed" && exitNum > 0));

  const handleSave = () => {
    if (!canSave) return;
    const trade: Trade = {
      id: editingTrade?.id ?? uid(),
      pair,
      direction,
      status,
      orderType,
      leverage,
      margin: marginNum,
      entryPrice: entryNum,
      exitPrice: status === "closed" ? exitNum : null,
      entryDate,
      exitDate: status === "closed" ? exitDate : null,
      pnl: status === "closed" ? (pnlManual ? (parseFloat(pnlOverride) || 0) : autoPnl) : null,
      pnlManual: pnlManual && status === "closed",
      fees,
      notes,
      mood,
      tags,
      createdAt: editingTrade?.createdAt ?? Date.now(),
      updatedAt: Date.now(),
    };
    onSave(trade);
  };

  const inputStyle: React.CSSProperties = {
    background: "var(--bg)", border: "1px solid var(--border)", borderRadius: "var(--r-sm)",
    color: "var(--text)", outline: "none", padding: "8px 10px", fontSize: 13,
    fontFamily: "inherit", width: "100%",
  };

  return (
    <div className="flex flex-col gap-3" style={{ border: "1px solid var(--border)", borderRadius: "var(--r-card)", background: "var(--bg-surface)", padding: 16 }}>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          {editingTrade ? <Edit3 size={14} style={{ color: "var(--accent)" }} /> : <Plus size={14} style={{ color: "var(--accent)" }} />}
          <span className="text-sm font-bold" style={{ color: "var(--text)" }}>{editingTrade ? "Edit Trade" : "New Trade"}</span>
        </div>
        <button onClick={onCancel} className="flex items-center justify-center w-6 h-6" style={{ color: "var(--text-faint)" }}>
          <X size={14} />
        </button>
      </div>

      {/* Pair */}
      <div>
        <div className="tag mb-1" style={{ color: "var(--text-faint)" }}>PAIR</div>
        <PairSelector symbols={symbols} value={pair} onChange={setPair} />
      </div>

      {/* Direction + Status */}
      <div className="grid grid-cols-2 gap-2">
        <div>
          <div className="tag mb-1" style={{ color: "var(--text-faint)" }}>DIRECTION</div>
          <div className="flex gap-1">
            <button type="button" onClick={() => setDirection("long")} className="flex-1 flex items-center justify-center gap-1 py-2 transition-all"
              style={{ border: `1px solid ${direction === "long" ? "var(--cal-green)" : "var(--border)"}`, borderRadius: "var(--r-sm)", background: direction === "long" ? "var(--cal-green-tint)" : "var(--bg)" }}>
              <ArrowUpRight size={14} style={{ color: direction === "long" ? "var(--cal-green)" : "var(--text-faint)" }} />
              <span className="text-xs font-bold" style={{ color: direction === "long" ? "var(--cal-green)" : "var(--text-muted)" }}>LONG</span>
            </button>
            <button type="button" onClick={() => setDirection("short")} className="flex-1 flex items-center justify-center gap-1 py-2 transition-all"
              style={{ border: `1px solid ${direction === "short" ? "var(--cal-red)" : "var(--border)"}`, borderRadius: "var(--r-sm)", background: direction === "short" ? "var(--cal-red-tint)" : "var(--bg)" }}>
              <ArrowDownRight size={14} style={{ color: direction === "short" ? "var(--cal-red)" : "var(--text-faint)" }} />
              <span className="text-xs font-bold" style={{ color: direction === "short" ? "var(--cal-red)" : "var(--text-muted)" }}>SHORT</span>
            </button>
          </div>
        </div>
        <div>
          <div className="tag mb-1" style={{ color: "var(--text-faint)" }}>STATUS</div>
          <div className="flex gap-1">
            <button type="button" onClick={() => setStatus("open")} className="flex-1 py-2 transition-all"
              style={{ border: `1px solid ${status === "open" ? "var(--accent)" : "var(--border)"}`, borderRadius: "var(--r-sm)", background: status === "open" ? "var(--accent-dim)" : "var(--bg)" }}>
              <span className="text-xs font-bold" style={{ color: status === "open" ? "var(--text)" : "var(--text-muted)" }}>OPEN</span>
            </button>
            <button type="button" onClick={() => setStatus("closed")} className="flex-1 py-2 transition-all"
              style={{ border: `1px solid ${status === "closed" ? "var(--accent)" : "var(--border)"}`, borderRadius: "var(--r-sm)", background: status === "closed" ? "var(--accent-dim)" : "var(--bg)" }}>
              <span className="text-xs font-bold" style={{ color: status === "closed" ? "var(--text)" : "var(--text-muted)" }}>CLOSED</span>
            </button>
          </div>
        </div>
      </div>

      {/* Order type */}
      <div>
        <div className="tag mb-1" style={{ color: "var(--text-faint)" }}>ORDER TYPE</div>
        <div className="flex gap-1">
          <button type="button" onClick={() => setOrderType("market")} className="flex-1 py-1.5 transition-all"
            style={{ border: `1px solid ${orderType === "market" ? "var(--accent)" : "var(--border)"}`, borderRadius: "var(--r-sm)", background: orderType === "market" ? "var(--accent-dim)" : "var(--bg)" }}>
            <span className="text-[11px] font-bold" style={{ color: orderType === "market" ? "var(--text)" : "var(--text-muted)" }}>MARKET</span>
          </button>
          <button type="button" onClick={() => setOrderType("limit")} className="flex-1 py-1.5 transition-all"
            style={{ border: `1px solid ${orderType === "limit" ? "var(--accent)" : "var(--border)"}`, borderRadius: "var(--r-sm)", background: orderType === "limit" ? "var(--accent-dim)" : "var(--bg)" }}>
            <span className="text-[11px] font-bold" style={{ color: orderType === "limit" ? "var(--text)" : "var(--text-muted)" }}>LIMIT</span>
          </button>
        </div>
      </div>

      {/* Leverage */}
      <div>
        <div className="flex items-center justify-between mb-1">
          <span className="tag" style={{ color: "var(--text-faint)" }}>LEVERAGE</span>
          <span className="mono text-sm font-bold" style={{ color: "var(--accent)" }}>{leverage}×</span>
        </div>
        <div className="flex flex-wrap gap-1">
          {LEVERAGE_OPTIONS.filter((l) => l <= maxLev).map((lev) => (
            <button key={lev} type="button" onClick={() => setLeverage(lev)} className="px-2 py-1 transition-all"
              style={{ border: `1px solid ${leverage === lev ? "var(--accent)" : "var(--border-subtle)"}`, borderRadius: 3, background: leverage === lev ? "var(--accent-dim)" : "transparent" }}>
              <span className="mono text-[10px] font-bold" style={{ color: leverage === lev ? "var(--text)" : "var(--text-muted)" }}>{lev}×</span>
            </button>
          ))}
        </div>
      </div>

      {/* Margin + computed notional */}
      <div className="grid grid-cols-2 gap-2">
        <div>
          <div className="tag mb-1" style={{ color: "var(--text-faint)" }}>MARGIN (USD)</div>
          <input type="number" step="any" value={margin} onChange={(e) => setMargin(e.target.value)} placeholder="100" style={inputStyle} />
        </div>
        <div>
          <div className="tag mb-1" style={{ color: "var(--text-faint)" }}>POSITION SIZE</div>
          <div className="px-2.5 py-2 mono text-sm font-bold tabular-nums" style={{ background: "var(--bg)", border: "1px solid var(--border-subtle)", borderRadius: "var(--r-sm)", color: "var(--text-muted)" }}>
            {notional > 0 ? fmtUSD(notional, 0) : "—"}
          </div>
        </div>
      </div>

      {/* Entry / Exit prices */}
      <div className="grid grid-cols-2 gap-2">
        <div>
          <div className="tag mb-1" style={{ color: "var(--text-faint)" }}>ENTRY PRICE</div>
          <input type="number" step="any" value={entryPrice} onChange={(e) => setEntryPrice(e.target.value)} placeholder="0.00" style={inputStyle} />
        </div>
        {status === "closed" && (
          <div>
            <div className="tag mb-1" style={{ color: "var(--text-faint)" }}>EXIT PRICE</div>
            <input type="number" step="any" value={exitPrice} onChange={(e) => setExitPrice(e.target.value)} placeholder="0.00" style={inputStyle} />
          </div>
        )}
      </div>

      {/* Dates */}
      <div className="grid grid-cols-2 gap-2">
        <div>
          <div className="tag mb-1" style={{ color: "var(--text-faint)" }}>ENTRY DATE</div>
          <input type="date" value={entryDate} onChange={(e) => setEntryDate(e.target.value)} style={inputStyle} />
        </div>
        {status === "closed" && (
          <div>
            <div className="tag mb-1" style={{ color: "var(--text-faint)" }}>EXIT DATE</div>
            <input type="date" value={exitDate} onChange={(e) => setExitDate(e.target.value)} style={inputStyle} />
          </div>
        )}
      </div>

      {/* Fees display */}
      {fees > 0 && (
        <div className="flex items-center justify-between px-3 py-1.5" style={{ background: "var(--bg-elevated)", borderRadius: "var(--r-sm)" }}>
          <span className="tag" style={{ color: "var(--text-faint)" }}>EST. FEES ({orderType === "market" ? `${(takerFee * 100).toFixed(3)}% taker` : `${(makerFee * 100).toFixed(3)}% maker`})</span>
          <span className="mono text-xs font-bold tabular-nums" style={{ color: "var(--text-muted)" }}>-{fmtUSD(fees)}</span>
        </div>
      )}

      {/* PnL with manual override */}
      {status === "closed" && (
        <div className="flex flex-col gap-1.5">
          <div className="flex items-center justify-between">
            <span className="tag" style={{ color: "var(--text-faint)" }}>REALIZED PNL</span>
            <button type="button" onClick={() => { setPnlManual(!pnlManual); if (!pnlManual && autoPnl !== null) setPnlOverride(String(autoPnl.toFixed(2))); }}
              className="flex items-center gap-1 transition-colors" style={{ color: pnlManual ? "var(--accent)" : "var(--text-faint)" }}>
              <Edit3 size={11} />
              <span className="tag" style={{ fontSize: 8 }}>{pnlManual ? "AUTO" : "MANUAL"}</span>
            </button>
          </div>
          {pnlManual ? (
            <input type="number" step="any" value={pnlOverride} onChange={(e) => setPnlOverride(e.target.value)} placeholder="Enter PnL manually" style={inputStyle} />
          ) : null}
          {livePnl !== null && (
            <div className="flex items-center justify-between px-3 py-2"
              style={{ background: livePnl >= 0 ? "var(--cal-green-tint)" : "var(--cal-red-tint)", border: `1px solid ${livePnl >= 0 ? "var(--cal-green-edge)" : "var(--cal-red-edge)"}`, borderRadius: "var(--r-sm)" }}>
              <span className="tag" style={{ color: "var(--text-faint)" }}>{pnlManual ? "MANUAL PNL" : "AUTO PNL (after fees)"}</span>
              <span className="mono text-base font-bold tabular-nums" style={{ color: livePnl >= 0 ? "var(--cal-green)" : "var(--cal-red)" }}>
                {livePnl >= 0 ? "+" : ""}{fmtUSD(livePnl)}
              </span>
            </div>
          )}
        </div>
      )}

      {/* Mood */}
      <div>
        <div className="tag mb-1.5" style={{ color: "var(--text-faint)" }}>MOOD</div>
        <div className="flex items-center gap-1">
          {MOODS.map((m) => {
            const Icon = m.icon; const sel = mood === m.value;
            return (
              <button key={m.value} type="button" onClick={() => setMood(m.value)} className="flex flex-col items-center gap-0.5 px-1 py-1.5 transition-all"
                style={{ border: `1px solid ${sel ? m.color : "var(--border-subtle)"}`, borderRadius: "var(--r-sm)", background: sel ? "var(--bg-elevated)" : "transparent", opacity: sel ? 1 : 0.45, flex: 1 }}>
                <Icon size={14} style={{ color: sel ? m.color : "var(--text-muted)" }} />
                <span className="tag" style={{ fontSize: 6, color: sel ? m.color : "var(--text-faint)" }}>{m.label}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Tags */}
      <div>
        <div className="tag mb-1.5" style={{ color: "var(--text-faint)" }}>TAGS</div>
        <div className="flex flex-wrap gap-1">
          {AVAILABLE_TAGS.map((t) => {
            const sel = tags.includes(t);
            return (
              <button key={t} type="button" onClick={() => toggleTag(t)} className="flex items-center gap-1 px-1.5 py-0.5 transition-all"
                style={{ border: `1px solid ${sel ? "var(--accent)" : "var(--border-subtle)"}`, borderRadius: 3, background: sel ? "var(--accent-dim)" : "transparent" }}>
                <Tag size={8} style={{ color: sel ? "var(--accent)" : "var(--text-faint)" }} />
                <span className="text-[10px] font-medium" style={{ color: sel ? "var(--text)" : "var(--text-muted)" }}>{t}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Notes */}
      <div>
        <div className="tag mb-1" style={{ color: "var(--text-faint)" }}>NOTES</div>
        <textarea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Why did you take this trade? What's your plan?" rows={3}
          className="w-full resize-none" style={{ ...inputStyle, minHeight: 60 }}
          onFocus={(e) => { (e.target as HTMLTextAreaElement).style.borderColor = "var(--accent)"; }}
          onBlur={(e) => { (e.target as HTMLTextAreaElement).style.borderColor = "var(--border)"; }} />
      </div>

      {/* Actions */}
      <div className="flex gap-2">
        <button type="button" onClick={handleSave} disabled={!canSave}
          className="flex items-center justify-center gap-1.5 px-4 py-2 flex-1 transition-all"
          style={{ background: canSave ? "var(--accent)" : "var(--bg-elevated)", color: canSave ? "var(--accent-fg)" : "var(--text-faint)", borderRadius: "var(--r-md)", fontWeight: 600, fontSize: 13 }}>
          <Save size={14} />{editingTrade ? "Update" : "Add Trade"}
        </button>
        <button type="button" onClick={onCancel} className="px-3 py-2 transition-all"
          style={{ border: "1px solid var(--border)", borderRadius: "var(--r-md)", color: "var(--text-muted)" }}>Cancel</button>
      </div>
    </div>
  );
}

/* ════════════════════════════════════════════════════════════════
   Calendar
   ════════════════════════════════════════════════════════════════ */

function JournalCalendar({
  trades,
  selectedDate,
  onSelectDate,
}: {
  trades: Trade[];
  selectedDate: string | null;
  onSelectDate: (key: string) => void;
}) {
  const [calMonth, setCalMonth] = useState(() => new Date(Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth(), 1)));

  const pnlByDay = useMemo(() => {
    const map = new Map<string, number>();
    for (const t of trades) {
      if (t.status === "closed" && t.pnl !== null) {
        const key = t.exitDate ?? t.entryDate;
        map.set(key, (map.get(key) ?? 0) + t.pnl);
      }
    }
    return map;
  }, [trades]);

  const tradesByDay = useMemo(() => {
    const map = new Map<string, number>();
    for (const t of trades) {
      map.set(t.entryDate, (map.get(t.entryDate) ?? 0) + 1);
      if (t.status === "closed" && t.exitDate) map.set(t.exitDate, (map.get(t.exitDate) ?? 0) + 1);
    }
    return map;
  }, [trades]);

  const year = calMonth.getUTCFullYear();
  const month = calMonth.getUTCMonth();
  const monthName = new Date(Date.UTC(year, month, 1)).toLocaleDateString("en-US", { month: "long", year: "numeric", timeZone: "UTC" });

  const firstDayOfWeek = new Date(Date.UTC(year, month, 1)).getUTCDay();
  const daysInMonth = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();

  const cells: { day: number; month: number; year: number; current: boolean }[] = [];
  for (let i = 0; i < 42; i++) {
    const offset = i - firstDayOfWeek;
    if (offset < 0) { const d = new Date(Date.UTC(year, month, offset + 1)); cells.push({ day: d.getUTCDate(), month: d.getUTCMonth(), year: d.getUTCFullYear(), current: false }); }
    else if (offset >= daysInMonth) { const d = new Date(Date.UTC(year, month, offset + 1)); cells.push({ day: d.getUTCDate(), month: d.getUTCMonth(), year: d.getUTCFullYear(), current: false }); }
    else cells.push({ day: offset + 1, month, year, current: true });
  }

  const monthPnls: number[] = []; let activeDays = 0; let tradeDays = 0;
  for (let d = 1; d <= daysInMonth; d++) {
    const key = dateKeyFromParts(year, month, d);
    const pnl = pnlByDay.get(key);
    if (pnl !== undefined) { monthPnls.push(pnl); activeDays++; }
    if (tradesByDay.get(key)) tradeDays++;
  }
  const netPnl = monthPnls.reduce((a, b) => a + b, 0);
  const winDays = monthPnls.filter((p) => p > 0).length;
  const winRate = monthPnls.length > 0 ? (winDays / monthPnls.length) * 100 : 0;
  const best = monthPnls.length > 0 ? Math.max(...monthPnls) : 0;
  const worst = monthPnls.length > 0 ? Math.min(...monthPnls) : 0;

  const todayK = todayKey();
  const weekdays = ["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"];

  const stats = [
    { label: "NET", value: netPnl, prefix: netPnl >= 0 ? "+" : "", color: netPnl >= 0 ? "var(--cal-green)" : "var(--cal-red)" },
    { label: "WIN RATE", value: `${winRate.toFixed(0)}%`, color: "var(--text)" },
    { label: "PNL DAYS", value: `${activeDays}d`, color: "var(--text)" },
    { label: "TRADE DAYS", value: `${tradeDays}d`, color: "var(--accent)" },
    { label: "BEST", value: best, prefix: "+", color: "var(--cal-green)" },
    { label: "WORST", value: worst, prefix: "", color: "var(--cal-red)" },
  ];

  return (
    <div className="relative" style={{ border: "1px solid var(--border)", background: "var(--bg-surface)", borderRadius: "var(--r-card)" }}>
      <div className="flex flex-col sm:flex-row sm:min-h-[340px]">
        <div className="shrink-0 flex flex-col gap-2 sm:gap-3 p-3 sm:p-4 sm:cal-left-panel">
          <div className="flex items-center justify-between sm:block">
            <div>
              <div className="tag mb-1" style={{ color: "var(--text-faint)", letterSpacing: "0.1em" }}>DAILY PNL</div>
              <div className="mono text-base sm:text-xl font-bold" style={{ color: "var(--text)" }}>{monthName}</div>
            </div>
            <div className="flex items-center gap-1">
              <button onClick={() => setCalMonth(new Date(Date.UTC(year, month - 1, 1)))} className="flex items-center justify-center w-7 h-7 transition-colors"
                style={{ border: "1px solid var(--border)", color: "var(--text-muted)" }}
                onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.borderColor = "var(--accent)"; (e.currentTarget as HTMLElement).style.color = "var(--accent)"; }}
                onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.borderColor = "var(--border)"; (e.currentTarget as HTMLElement).style.color = "var(--text-muted)"; }}>
                <ChevronLeft size={14} />
              </button>
              <button onClick={() => setCalMonth(new Date(Date.UTC(year, month + 1, 1)))} className="flex items-center justify-center w-7 h-7 transition-colors"
                style={{ border: "1px solid var(--border)", color: "var(--text-muted)" }}
                onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.borderColor = "var(--accent)"; (e.currentTarget as HTMLElement).style.color = "var(--accent)"; }}
                onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.borderColor = "var(--border)"; (e.currentTarget as HTMLElement).style.color = "var(--text-muted)"; }}>
                <ChevronRight size={14} />
              </button>
            </div>
          </div>
          <div className="hidden sm:block">
            <div className="flex items-center gap-1">
              <button onClick={() => setCalMonth(new Date(Date.UTC(year, month - 1, 1)))} className="flex items-center justify-center w-7 h-7 transition-colors"
                style={{ border: "1px solid var(--border)", color: "var(--text-muted)" }}
                onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.borderColor = "var(--accent)"; (e.currentTarget as HTMLElement).style.color = "var(--accent)"; }}
                onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.borderColor = "var(--border)"; (e.currentTarget as HTMLElement).style.color = "var(--text-muted)"; }}>
                <ChevronLeft size={14} />
              </button>
              <button onClick={() => setCalMonth(new Date(Date.UTC(year, month + 1, 1)))} className="flex items-center justify-center w-7 h-7 transition-colors"
                style={{ border: "1px solid var(--border)", color: "var(--text-muted)" }}
                onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.borderColor = "var(--accent)"; (e.currentTarget as HTMLElement).style.color = "var(--accent)"; }}
                onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.borderColor = "var(--border)"; (e.currentTarget as HTMLElement).style.color = "var(--text-muted)"; }}>
                <ChevronRight size={14} />
              </button>
            </div>
          </div>
          <div className="grid grid-cols-3 sm:grid-cols-2 gap-1.5 sm:gap-2">
            {stats.map((s) => (
              <div key={s.label} className="flex flex-col gap-0.5 px-2 py-1.5 sm:px-2.5 sm:py-2" style={{ border: "1px solid var(--border-subtle)", borderRadius: 3, background: "var(--bg)" }}>
                <span className="tag" style={{ color: "var(--text-faint)", fontSize: 7, letterSpacing: "0.08em" }}>{s.label}</span>
                <span className="mono text-xs sm:text-sm font-bold tabular-nums" style={{ color: s.color }}>
                  {typeof s.value === "number" ? `${s.prefix ?? ""}${fmt(s.value, 2)}` : s.value}
                </span>
              </div>
            ))}
          </div>
          <div className="hidden sm:flex items-center gap-2 mt-auto flex-wrap">
            <span className="tag" style={{ color: "var(--text-faint)" }}>LEGEND:</span>
            <div className="flex items-center gap-1"><div style={{ width: 7, height: 7, borderRadius: "50%", background: "var(--cal-green)" }} /><span className="tag" style={{ color: "var(--text-faint)" }}>PROFIT</span></div>
            <div className="flex items-center gap-1"><div style={{ width: 7, height: 7, borderRadius: "50%", background: "var(--cal-red)" }} /><span className="tag" style={{ color: "var(--text-faint)" }}>LOSS</span></div>
            <div className="flex items-center gap-1"><PenLine size={10} style={{ color: "var(--accent)" }} /><span className="tag" style={{ color: "var(--text-faint)" }}>TRADE</span></div>
          </div>
        </div>
        <div className="flex-1 p-2 sm:p-4">
          <div className="grid grid-cols-7 gap-[3px] mb-[3px]">
            {weekdays.map((wd) => <div key={wd} className="text-center"><span className="tag" style={{ color: "var(--text-faint)", fontSize: 8, letterSpacing: "0.08em" }}>{wd}</span></div>)}
          </div>
          <div className="grid grid-cols-7 gap-[3px]">
            {cells.map((cell, i) => {
              const key = dateKeyFromParts(cell.year, cell.month, cell.day);
              const pnl = cell.current ? pnlByDay.get(key) : undefined;
              const hasData = pnl !== undefined;
              const isPositive = hasData && pnl > 0; const isNegative = hasData && pnl < 0;
              const isToday = key === todayK; const isSelected = key === selectedDate;
              const hasTrades = cell.current && (tradesByDay.get(key) ?? 0) > 0;
              let bg = "transparent"; let borderColor = "var(--border-subtle)"; let textColor = "var(--text)";
              if (!cell.current) { bg = "transparent"; borderColor = "transparent"; textColor = "var(--text-faint)"; }
              else if (hasData) { if (isPositive) { bg = "var(--cal-green-tint)"; borderColor = "var(--cal-green-edge)"; } else if (isNegative) { bg = "var(--cal-red-tint)"; borderColor = "var(--cal-red-edge)"; } }
              else if (isToday) { bg = "var(--bg-elevated)"; borderColor = "var(--border)"; }
              if (isSelected) { borderColor = "var(--accent)"; bg = "var(--accent-dim)"; }
              return (
                <button key={i} className="heat-cell relative flex flex-col"
                  style={{ aspectRatio: "1", background: bg, border: `1px solid ${borderColor}`, borderRadius: 3, animationDelay: `${i * 6}ms`, opacity: cell.current ? 1 : 0.35, cursor: "pointer", zIndex: isSelected ? 10 : 1, transition: "border-color 0.15s, background 0.15s" }}
                  onClick={() => cell.current && onSelectDate(key)}
                  onMouseEnter={(e) => { if (cell.current && !isSelected) (e.currentTarget as HTMLElement).style.borderColor = "var(--text-faint)"; }}
                  onMouseLeave={(e) => { if (cell.current && !isSelected) (e.currentTarget as HTMLElement).style.borderColor = borderColor; }}>
                  <span className="mono text-[9px] sm:text-[10px] font-medium leading-none px-1 pt-1" style={{ color: textColor, opacity: cell.current ? 0.7 : 0.4 }}>{cell.day}</span>
                  {hasData && cell.current && <span className="mono text-[9px] sm:text-[10px] font-bold tabular-nums leading-none mt-auto px-1 pb-1 text-right heat-cell-value" style={{ color: isPositive ? "var(--cal-green)" : isNegative ? "var(--cal-red)" : "var(--text-muted)" }}>{isPositive ? "+" : ""}{fmt(pnl, 0)}</span>}
                  {hasTrades && cell.current && !hasData && <span className="mono text-[9px] sm:text-[10px] font-bold leading-none mt-auto px-1 pb-1 text-right heat-cell-value" style={{ color: "var(--accent)" }}>●</span>}
                  {hasTrades && cell.current && <div style={{ position: "absolute", top: 3, right: 3 }}><PenLine size={7} style={{ color: "var(--accent)" }} /></div>}
                </button>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}

/* ════════════════════════════════════════════════════════════════
   Trade Log
   ════════════════════════════════════════════════════════════════ */

function TradeLog({
  trades, onEdit, onDelete, filterDate, onClearFilter,
}: {
  trades: Trade[]; onEdit: (t: Trade) => void; onDelete: (id: string) => void;
  filterDate: string | null; onClearFilter: () => void;
}) {
  const sorted = useMemo(() => [...trades].sort((a, b) => b.updatedAt - a.updatedAt), [trades]);
  const filtered = filterDate ? sorted.filter((t) => t.entryDate === filterDate || t.exitDate === filterDate) : sorted;

  if (trades.length === 0) {
    return (
      <div className="flex flex-col items-center gap-3 p-8 text-center" style={{ border: "1px solid var(--border)", borderRadius: "var(--r-card)", background: "var(--bg-surface)" }}>
        <BookOpen size={28} style={{ color: "var(--text-faint)" }} />
        <div>
          <span className="text-sm font-bold" style={{ color: "var(--text)" }}>No trades yet</span>
          <p className="text-xs mt-1" style={{ color: "var(--text-faint)" }}>Click "New Trade" to start journaling</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2" style={{ border: "1px solid var(--border)", borderRadius: "var(--r-card)", background: "var(--bg-surface)", padding: "10px 12px" }}>
      <div className="flex items-center justify-between mb-1">
        <span className="tag" style={{ color: "var(--text-faint)" }}>TRADE LOG ({filtered.length})</span>
        {filterDate && <button onClick={onClearFilter} className="flex items-center gap-1 tag" style={{ color: "var(--accent)" }}><X size={10} /> CLEAR FILTER</button>}
      </div>
      <div className="flex flex-col gap-1.5 max-h-[500px] overflow-y-auto">
        {filtered.length === 0 ? (
          <div className="px-3 py-4 text-center text-sm" style={{ color: "var(--text-faint)" }}>No trades for this day</div>
        ) : (
          filtered.map((t) => {
            const isLong = t.direction === "long"; const isClosed = t.status === "closed";
            const pnl = calcPnl(t); const mood = MOODS.find((m) => m.value === t.mood); const MoodIcon = mood?.icon ?? Meh;
            const notional = getNotional(t.margin, t.leverage);
            return (
              <div key={t.id} className="flex flex-col gap-1.5 px-2.5 py-2 transition-all" style={{ border: "1px solid var(--border-subtle)", borderRadius: "var(--r-sm)", background: "var(--bg)" }}>
                <div className="flex items-center gap-1.5 sm:gap-2">
                  <TokenIcon symbol={t.pair} size={18} />
                  <span className="mono text-xs font-bold truncate" style={{ color: "var(--text)" }}>{t.pair}</span>
                  <span className="mono text-[9px] font-bold px-1.5 py-0.5" style={{ color: isLong ? "var(--cal-green)" : "var(--cal-red)", background: isLong ? "var(--cal-green-tint)" : "var(--cal-red-tint)", borderRadius: 2 }}>{isLong ? "LONG" : "SHORT"}</span>
                  <span className="mono text-[9px] font-bold px-1.5 py-0.5" style={{ color: isClosed ? "var(--text)" : "var(--accent)", border: `1px solid ${isClosed ? "var(--border)" : "var(--accent)"}`, borderRadius: 2 }}>{isClosed ? "CLOSED" : "OPEN"}</span>
                  <span className="mono text-[9px] px-1 py-0.5" style={{ color: "var(--text-faint)", background: "var(--bg-elevated)", borderRadius: 2 }}>{t.leverage}×</span>
                  <span className="mono text-[9px] px-1 py-0.5 hidden sm:inline" style={{ color: "var(--text-faint)", background: "var(--bg-elevated)", borderRadius: 2 }}>{t.orderType}</span>
                  <div className="flex-1" />
                  <MoodIcon size={12} style={{ color: mood?.color ?? "var(--text-muted)" }} />
                  <button onClick={() => onEdit(t)} className="flex items-center justify-center w-6 h-6 transition-colors" style={{ color: "var(--text-faint)" }}><Edit3 size={11} /></button>
                  <button onClick={() => onDelete(t.id)} className="flex items-center justify-center w-6 h-6 transition-colors" style={{ color: "var(--text-faint)" }}
                    onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.color = "var(--cal-red)"; }}
                    onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.color = "var(--text-faint)"; }}><Trash2 size={11} /></button>
                </div>
                <div className="flex items-center gap-2 sm:gap-3 flex-wrap">
                  <div className="flex items-center gap-1"><span className="tag" style={{ color: "var(--text-faint)", fontSize: 7 }}>ENTRY</span><span className="mono text-[10px] tabular-nums" style={{ color: "var(--text-muted)" }}>{fmtUSD(t.entryPrice)}</span></div>
                  {t.exitPrice !== null && <div className="flex items-center gap-1"><span className="tag" style={{ color: "var(--text-faint)", fontSize: 7 }}>EXIT</span><span className="mono text-[10px] tabular-nums" style={{ color: "var(--text-muted)" }}>{fmtUSD(t.exitPrice)}</span></div>}
                  <div className="flex items-center gap-1"><span className="tag" style={{ color: "var(--text-faint)", fontSize: 7 }}>MARGIN</span><span className="mono text-[10px] tabular-nums" style={{ color: "var(--text-muted)" }}>{fmtUSD(t.margin, 0)}</span></div>
                  <div className="flex items-center gap-1"><span className="tag" style={{ color: "var(--text-faint)", fontSize: 7 }}>SIZE</span><span className="mono text-[10px] tabular-nums" style={{ color: "var(--text-muted)" }}>{fmtUSD(notional, 0)}</span></div>
                  {t.fees > 0 && <div className="flex items-center gap-1"><span className="tag" style={{ color: "var(--text-faint)", fontSize: 7 }}>FEES</span><span className="mono text-[10px] tabular-nums" style={{ color: "var(--text-faint)" }}>-{fmtUSD(t.fees)}</span></div>}
                  {pnl !== null && <div className="flex items-center gap-1"><span className="tag" style={{ color: "var(--text-faint)", fontSize: 7 }}>PNL</span>{t.pnlManual && <Edit3 size={8} style={{ color: "var(--text-faint)" }} />}<span className="mono text-[10px] font-bold tabular-nums" style={{ color: pnl >= 0 ? "var(--cal-green)" : "var(--cal-red)" }}>{pnl >= 0 ? "+" : ""}{fmtUSD(pnl)}</span></div>}
                  <div className="flex items-center gap-1"><Calendar size={9} style={{ color: "var(--text-faint)" }} /><span className="text-[10px]" style={{ color: "var(--text-faint)" }}>{t.entryDate}</span></div>
                </div>
                {t.notes && <p className="text-[11px] leading-relaxed" style={{ color: "var(--text-muted)" }}>{t.notes}</p>}
                {t.tags.length > 0 && <div className="flex flex-wrap gap-1">{t.tags.map((tag) => <span key={tag} className="flex items-center gap-0.5 tag" style={{ fontSize: 7, color: "var(--text-faint)", border: "1px solid var(--border-subtle)", borderRadius: 2, padding: "1px 4px" }}><Tag size={7} />{tag}</span>)}</div>}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}

/* ════════════════════════════════════════════════════════════════
   Equity Curve — cumulative PnL over time
   ════════════════════════════════════════════════════════════════ */

function EquityCurve({ trades }: { trades: Trade[] }) {
  const closed = trades.filter((t) => t.status === "closed" && t.pnl !== null).sort((a, b) => {
    const da = a.exitDate ?? a.entryDate;
    const db = b.exitDate ?? b.entryDate;
    return da.localeCompare(db);
  });

  if (closed.length === 0) return null;

  let cum = 0;
  const points = closed.map((t) => {
    cum += t.pnl ?? 0;
    return { date: t.exitDate ?? t.entryDate, cum, pair: t.pair, pnl: t.pnl ?? 0 };
  });

  const minVal = Math.min(0, ...points.map((p) => p.cum));
  const maxVal = Math.max(0, ...points.map((p) => p.cum));
  const range = maxVal - minVal || 1;

  const W = 100; const H = 40;
  const stepX = points.length > 1 ? W / (points.length - 1) : W;
  const pathD = points.map((p, i) => {
    const x = i * stepX;
    const y = H - ((p.cum - minVal) / range) * H;
    return `${i === 0 ? "M" : "L"}${x.toFixed(2)},${y.toFixed(2)}`;
  }).join(" ");

  const areaD = `${pathD} L${((points.length - 1) * stepX).toFixed(2)},${H} L0,${H} Z`;
  const zeroY = H - ((0 - minVal) / range) * H;
  const finalCum = points[points.length - 1].cum;
  const isPositive = finalCum >= 0;
  const strokeColor = isPositive ? "var(--cal-green)" : "var(--cal-red)";
  const fillColor = isPositive ? "var(--cal-green-tint)" : "var(--cal-red-tint)";

  return (
    <div className="flex flex-col gap-2" style={{ border: "1px solid var(--border)", borderRadius: "var(--r-card)", background: "var(--bg-surface)", padding: 12 }}>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Activity size={14} style={{ color: "var(--accent)" }} />
          <span className="text-sm font-bold" style={{ color: "var(--text)" }}>Equity Curve</span>
        </div>
        <span className="mono text-sm font-bold tabular-nums" style={{ color: isPositive ? "var(--cal-green)" : "var(--cal-red)" }}>
          {isPositive ? "+" : ""}{fmtUSD(finalCum)}
        </span>
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" style={{ width: "100%", height: 80 }}>
        <line x1="0" y1={zeroY} x2={W} y2={zeroY} stroke="var(--border)" strokeWidth="0.3" strokeDasharray="1,1" />
        <path d={areaD} fill={fillColor} opacity="0.5" />
        <path d={pathD} fill="none" stroke={strokeColor} strokeWidth="0.8" strokeLinejoin="round" strokeLinecap="round" />
      </svg>
      <div className="flex items-center justify-between">
        <span className="tag" style={{ color: "var(--text-faint)", fontSize: 8 }}>{points.length} CLOSED TRADES</span>
        <span className="tag" style={{ color: "var(--text-faint)", fontSize: 8 }}>{points[0].date} → {points[points.length - 1].date}</span>
      </div>
    </div>
  );
}

/* ════════════════════════════════════════════════════════════════
   Pair Distribution — pie/donut chart of trades by pair
   ════════════════════════════════════════════════════════════════ */

const PIE_COLORS = ["#35C77F", "#60A5FA", "#F59E0B", "#F0616D", "#A78BFA", "#EDEDED", "#34D399", "#FB923C", "#E879F9", "#94A3B8"];

function PairDistribution({ trades }: { trades: Trade[] }) {
  const byPair = useMemo(() => {
    const map = new Map<string, { count: number; pnl: number }>();
    for (const t of trades) {
      const ex = map.get(t.pair) ?? { count: 0, pnl: 0 };
      ex.count++;
      if (t.pnl !== null) ex.pnl += t.pnl;
      map.set(t.pair, ex);
    }
    return [...map.entries()].sort((a, b) => b[1].count - a[1].count).slice(0, 8);
  }, [trades]);

  if (byPair.length === 0) return null;

  const total = byPair.reduce((s, [, v]) => s + v.count, 0);
  const R = 42; const r = 24; const cx = 50; const cy = 50;
  let angle = -90;

  const slices = byPair.map(([pair, data], i) => {
    const pct = data.count / total;
    const startAngle = angle;
    const endAngle = angle + pct * 360;
    angle = endAngle;
    const startRad = (startAngle * Math.PI) / 180;
    const endRad = (endAngle * Math.PI) / 180;
    const x1 = cx + R * Math.cos(startRad);
    const y1 = cy + R * Math.sin(startRad);
    const x2 = cx + R * Math.cos(endRad);
    const y2 = cy + R * Math.sin(endRad);
    const x3 = cx + r * Math.cos(endRad);
    const y3 = cy + r * Math.sin(endRad);
    const x4 = cx + r * Math.cos(startRad);
    const y4 = cy + r * Math.sin(startRad);
    const largeArc = pct > 0.5 ? 1 : 0;
    const path = `M${x1},${y1} A${R},${R} 0 ${largeArc} 1 ${x2},${y2} L${x3},${y3} A${r},${r} 0 ${largeArc} 0 ${x4},${y4} Z`;
    return { pair, path, color: PIE_COLORS[i % PIE_COLORS.length], pct, count: data.count, pnl: data.pnl };
  });

  return (
    <div className="flex flex-col gap-2" style={{ border: "1px solid var(--border)", borderRadius: "var(--r-card)", background: "var(--bg-surface)", padding: 12 }}>
      <div className="flex items-center gap-2">
        <PieChart size={14} style={{ color: "var(--accent)" }} />
        <span className="text-sm font-bold" style={{ color: "var(--text)" }}>Pair Distribution</span>
      </div>
      <div className="flex items-center gap-3">
        <svg viewBox="0 0 100 100" style={{ width: 90, height: 90, flexShrink: 0 }}>
          {slices.map((s) => <path key={s.pair} d={s.path} fill={s.color} stroke="var(--bg-surface)" strokeWidth="0.5" />)}
          <text x="50" y="52" textAnchor="middle" className="mono" style={{ fontSize: 8, fill: "var(--text)", fontWeight: 700 }}>{total}</text>
          <text x="50" y="58" textAnchor="middle" style={{ fontSize: 3, fill: "var(--text-faint)" }}>TRADES</text>
        </svg>
        <div className="flex flex-col gap-1 flex-1 min-w-0">
          {slices.map((s) => (
            <div key={s.pair} className="flex items-center gap-1.5">
              <div style={{ width: 8, height: 8, borderRadius: 2, background: s.color, flexShrink: 0 }} />
              <TokenIcon symbol={s.pair} size={14} />
              <span className="text-[10px] font-bold truncate" style={{ color: "var(--text)" }}>{s.pair}</span>
              <span className="mono text-[9px] tabular-nums" style={{ color: "var(--text-faint)", marginLeft: "auto" }}>{s.count}</span>
              <span className="mono text-[9px] font-bold tabular-nums" style={{ color: s.pnl >= 0 ? "var(--cal-green)" : "var(--cal-red)" }}>{s.pnl >= 0 ? "+" : ""}{fmt(s.pnl, 0)}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

/* ════════════════════════════════════════════════════════════════
   Long vs Short bar
   ════════════════════════════════════════════════════════════════ */

function LongShortSplit({ trades }: { trades: Trade[] }) {
  const longs = trades.filter((t) => t.direction === "long");
  const shorts = trades.filter((t) => t.direction === "short");
  const total = longs.length + shorts.length;
  if (total === 0) return null;

  const longPct = (longs.length / total) * 100;
  const shortPct = (shorts.length / total) * 100;
  const longPnl = longs.reduce((s, t) => s + (t.pnl ?? 0), 0);
  const shortPnl = shorts.reduce((s, t) => s + (t.pnl ?? 0), 0);

  return (
    <div className="flex flex-col gap-2" style={{ border: "1px solid var(--border)", borderRadius: "var(--r-card)", background: "var(--bg-surface)", padding: 12 }}>
      <div className="flex items-center gap-2">
        <Layers size={14} style={{ color: "var(--accent)" }} />
        <span className="text-sm font-bold" style={{ color: "var(--text)" }}>Long vs Short</span>
      </div>
      <div className="flex h-6 overflow-hidden" style={{ borderRadius: "var(--r-sm)" }}>
        <div style={{ width: `${longPct}%`, background: "var(--cal-green-tint)", borderRight: "1px solid var(--border)" }} className="flex items-center justify-center">
          <span className="mono text-[10px] font-bold" style={{ color: "var(--cal-green)" }}>{longPct.toFixed(0)}%</span>
        </div>
        <div style={{ width: `${shortPct}%`, background: "var(--cal-red-tint)" }} className="flex items-center justify-center">
          <span className="mono text-[10px] font-bold" style={{ color: "var(--cal-red)" }}>{shortPct.toFixed(0)}%</span>
        </div>
      </div>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          <ArrowUpRight size={12} style={{ color: "var(--cal-green)" }} />
          <span className="text-[11px]" style={{ color: "var(--text-muted)" }}>{longs.length} Long</span>
          <span className="mono text-[10px] font-bold tabular-nums" style={{ color: longPnl >= 0 ? "var(--cal-green)" : "var(--cal-red)" }}>{longPnl >= 0 ? "+" : ""}{fmt(longPnl, 0)}</span>
        </div>
        <div className="flex items-center gap-1.5">
          <ArrowDownRight size={12} style={{ color: "var(--cal-red)" }} />
          <span className="text-[11px]" style={{ color: "var(--text-muted)" }}>{shorts.length} Short</span>
          <span className="mono text-[10px] font-bold tabular-nums" style={{ color: shortPnl >= 0 ? "var(--cal-green)" : "var(--cal-red)" }}>{shortPnl >= 0 ? "+" : ""}{fmt(shortPnl, 0)}</span>
        </div>
      </div>
    </div>
  );
}

/* ════════════════════════════════════════════════════════════════
   Win/Loss Bar Chart
   ════════════════════════════════════════════════════════════════ */

function WinLossChart({ trades }: { trades: Trade[] }) {
  const closed = trades.filter((t) => t.status === "closed" && t.pnl !== null);
  if (closed.length === 0) return null;

  const wins = closed.filter((t) => (t.pnl ?? 0) > 0);
  const losses = closed.filter((t) => (t.pnl ?? 0) < 0);
  const maxWin = Math.max(0, ...wins.map((t) => t.pnl ?? 0));
  const maxLoss = Math.min(0, ...losses.map((t) => t.pnl ?? 0));
  const maxAbs = Math.max(Math.abs(maxWin), Math.abs(maxLoss), 1);

  const W = 100; const H = 50;
  const barW = 8; const gap = 2;
  const totalBars = closed.length;
  const totalW = totalBars * (barW + gap) - gap;
  const startX = (W - totalW) / 2;
  const zeroY = H / 2;

  const sorted = [...closed].sort((a, b) => {
    const da = a.exitDate ?? a.entryDate;
    const db = b.exitDate ?? b.entryDate;
    return da.localeCompare(db);
  });

  return (
    <div className="flex flex-col gap-2" style={{ border: "1px solid var(--border)", borderRadius: "var(--r-card)", background: "var(--bg-surface)", padding: 12 }}>
      <div className="flex items-center gap-2">
        <BarChart3 size={14} style={{ color: "var(--accent)" }} />
        <span className="text-sm font-bold" style={{ color: "var(--text)" }}>PnL per Trade</span>
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" style={{ width: "100%", height: 60 }}>
        <line x1="0" y1={zeroY} x2={W} y2={zeroY} stroke="var(--border)" strokeWidth="0.3" />
        {sorted.map((t, i) => {
          const pnl = t.pnl ?? 0;
          const barH = (Math.abs(pnl) / maxAbs) * (H / 2 - 2);
          const x = startX + i * (barW + gap);
          const y = pnl >= 0 ? zeroY - barH : zeroY;
          return <rect key={t.id} x={x} y={y} width={barW} height={barH} fill={pnl >= 0 ? "var(--cal-green)" : "var(--cal-red)"} opacity={0.8} rx="0.5" />;
        })}
      </svg>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1"><div style={{ width: 7, height: 7, borderRadius: 1, background: "var(--cal-green)" }} /><span className="tag" style={{ color: "var(--text-faint)", fontSize: 8 }}>{wins.length} WINS</span></div>
        <div className="flex items-center gap-1"><div style={{ width: 7, height: 7, borderRadius: 1, background: "var(--cal-red)" }} /><span className="tag" style={{ color: "var(--text-faint)", fontSize: 8 }}>{losses.length} LOSSES</span></div>
      </div>
    </div>
  );
}

/* ════════════════════════════════════════════════════════════════
   Stats Panel
   ════════════════════════════════════════════════════════════════ */

function StatsPanel({ trades }: { trades: Trade[] }) {
  const closed = trades.filter((t) => t.status === "closed" && t.pnl !== null);
  const open = trades.filter((t) => t.status === "open");
  const totalPnl = closed.reduce((sum, t) => sum + (t.pnl ?? 0), 0);
  const wins = closed.filter((t) => (t.pnl ?? 0) > 0).length;
  const losses = closed.filter((t) => (t.pnl ?? 0) < 0).length;
  const winRate = closed.length > 0 ? (wins / closed.length) * 100 : 0;
  const avgWin = wins > 0 ? closed.filter((t) => (t.pnl ?? 0) > 0).reduce((s, t) => s + (t.pnl ?? 0), 0) / wins : 0;
  const avgLoss = losses > 0 ? Math.abs(closed.filter((t) => (t.pnl ?? 0) < 0).reduce((s, t) => s + (t.pnl ?? 0), 0) / losses) : 0;
  const profitFactor = avgLoss > 0 ? (avgWin * wins) / (avgLoss * losses) : wins > 0 ? Infinity : 0;
  const bestTrade = closed.length > 0 ? Math.max(...closed.map((t) => t.pnl ?? 0)) : 0;
  const worstTrade = closed.length > 0 ? Math.min(...closed.map((t) => t.pnl ?? 0)) : 0;
  const totalFees = trades.reduce((s, t) => s + (t.fees || 0), 0);
  const totalMargin = trades.reduce((s, t) => s + t.margin, 0);

  const moodCounts = new Map<number, number>();
  for (const t of trades) moodCounts.set(t.mood, (moodCounts.get(t.mood) ?? 0) + 1);
  const tagCounts = new Map<string, number>();
  for (const t of trades) for (const tag of t.tags) tagCounts.set(tag, (tagCounts.get(tag) ?? 0) + 1);
  const topTags = [...tagCounts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5);
  const pnlByMood = new Map<number, { sum: number; count: number }>();
  for (const t of closed) { const ex = pnlByMood.get(t.mood) ?? { sum: 0, count: 0 }; pnlByMood.set(t.mood, { sum: ex.sum + (t.pnl ?? 0), count: ex.count + 1 }); }

  if (trades.length === 0) return null;

  const summaryStats = [
    { label: "TOTAL PNL", value: totalPnl, prefix: totalPnl >= 0 ? "+" : "", color: totalPnl >= 0 ? "var(--cal-green)" : "var(--cal-red)", isNum: true },
    { label: "WIN RATE", value: `${winRate.toFixed(1)}%`, color: "var(--text)", isNum: false },
    { label: "WINS", value: wins, color: "var(--cal-green)", isNum: true },
    { label: "LOSSES", value: losses, color: "var(--cal-red)", isNum: true },
    { label: "PROFIT FACTOR", value: profitFactor === Infinity ? "∞" : profitFactor.toFixed(2), color: profitFactor >= 1 ? "var(--cal-green)" : "var(--cal-red)", isNum: false },
    { label: "AVG WIN", value: avgWin, prefix: "+", color: "var(--cal-green)", isNum: true },
    { label: "AVG LOSS", value: -avgLoss, prefix: "", color: "var(--cal-red)", isNum: true },
    { label: "BEST", value: bestTrade, prefix: "+", color: "var(--cal-green)", isNum: true },
    { label: "WORST", value: worstTrade, prefix: "", color: "var(--cal-red)", isNum: true },
    { label: "OPEN", value: open.length, color: "var(--accent)", isNum: true },
    { label: "FEES", value: -totalFees, prefix: "", color: "var(--text-muted)", isNum: true },
    { label: "MARGIN", value: totalMargin, prefix: "", color: "var(--text-muted)", isNum: true },
  ];

  return (
    <div className="flex flex-col gap-2.5" style={{ border: "1px solid var(--border)", borderRadius: "var(--r-card)", background: "var(--bg-surface)", padding: "10px 12px" }}>
      <div className="tag" style={{ color: "var(--text-faint)" }}>STATS</div>
      <div className="grid grid-cols-3 sm:grid-cols-2 gap-1.5">
        {summaryStats.map((s) => (
          <div key={s.label} className="flex flex-col gap-0.5 px-2.5 py-1.5" style={{ border: "1px solid var(--border-subtle)", borderRadius: 3, background: "var(--bg)" }}>
            <span className="tag" style={{ color: "var(--text-faint)", fontSize: 7 }}>{s.label}</span>
            <span className="mono text-xs font-bold tabular-nums" style={{ color: s.color }}>{s.isNum && typeof s.value === "number" ? `${s.prefix ?? ""}${fmt(s.value, 2)}` : s.value}</span>
          </div>
        ))}
      </div>
      {moodCounts.size > 0 && (
        <div className="flex flex-col gap-1.5">
          <span className="tag" style={{ color: "var(--text-faint)", fontSize: 8 }}>MOOD DISTRIBUTION</span>
          <div className="flex items-end gap-1" style={{ height: 40 }}>
            {MOODS.map((m) => {
              const count = moodCounts.get(m.value) ?? 0;
              const maxCount = Math.max(...[...moodCounts.values()], 1);
              const height = (count / maxCount) * 100;
              const Icon = m.icon;
              return (
                <div key={m.value} className="flex flex-col items-center gap-0.5 flex-1">
                  <span className="mono text-[8px] tabular-nums" style={{ color: "var(--text-faint)" }}>{count}</span>
                  <div style={{ width: "100%", height: `${Math.max(height, 2)}%`, background: m.color, borderRadius: 2, opacity: count > 0 ? 0.7 : 0.15, minHeight: 2 }} />
                  <Icon size={10} style={{ color: count > 0 ? m.color : "var(--text-faint)" }} />
                </div>
              );
            })}
          </div>
        </div>
      )}
      {topTags.length > 0 && (
        <div className="flex flex-col gap-1">
          <span className="tag" style={{ color: "var(--text-faint)", fontSize: 8 }}>TOP TAGS</span>
          {topTags.map(([tag, count]) => (
            <div key={tag} className="flex items-center justify-between">
              <div className="flex items-center gap-1"><Tag size={9} style={{ color: "var(--text-faint)" }} /><span className="text-[11px]" style={{ color: "var(--text)" }}>{tag}</span></div>
              <span className="mono text-[10px] font-bold tabular-nums" style={{ color: "var(--text-muted)" }}>{count}×</span>
            </div>
          ))}
        </div>
      )}
      {pnlByMood.size > 0 && (
        <div className="flex flex-col gap-1">
          <span className="tag" style={{ color: "var(--text-faint)", fontSize: 8 }}>AVG PNL BY MOOD</span>
          {MOODS.filter((m) => pnlByMood.has(m.value)).map((m) => {
            const data = pnlByMood.get(m.value)!; const avg = data.sum / data.count; const Icon = m.icon;
            return (
              <div key={m.value} className="flex items-center justify-between">
                <div className="flex items-center gap-1.5"><Icon size={11} style={{ color: m.color }} /><span className="text-[11px]" style={{ color: "var(--text-muted)" }}>{m.label}</span></div>
                <span className="mono text-[10px] font-bold tabular-nums" style={{ color: avg > 0 ? "var(--cal-green)" : avg < 0 ? "var(--cal-red)" : "var(--text-muted)" }}>{avg >= 0 ? "+" : ""}{fmt(avg, 2)}</span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

/* ════════════════════════════════════════════════════════════════
   Auto-fetch helpers — resolve address, paginate position history
   ════════════════════════════════════════════════════════════════ */

const FETCH_PAGE_SIZE = 1000;
const FETCH_RATE_MS = 2500;
const SAVED_ADDR_KEY = "sodex-journal-saved-addr";

function loadSavedAddresses(): string[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(SAVED_ADDR_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch { return []; }
}

function saveAddress(addr: string) {
  try {
    const list = loadSavedAddresses();
    if (!list.includes(addr)) {
      list.unshift(addr);
      localStorage.setItem(SAVED_ADDR_KEY, JSON.stringify(list.slice(0, 10)));
    }
  } catch {}
}

async function resolveAccountId(addr: string): Promise<number | null> {
  try {
    const data = await cachedApiFetch<{ aid: number }>(`${GW_BASE}/perps/accounts/${addr}/state`, 1, 60_000);
    if (data.aid) return data.aid;
  } catch {}
  try {
    const data = await cachedApiFetch<{ aid: number }>(`${GW_BASE}/spot/accounts/${addr}/state`, 1, 60_000);
    return data.aid ?? null;
  } catch { return null; }
}

function positionToTrade(p: PositionHistoryItem, pairName: string, takerFee: number, makerFee: number): Trade {
  const entryPrice = parseFloat(p.avg_entry_price) || 0;
  const exitPrice = p.avg_close_price ? parseFloat(p.avg_close_price) : null;
  const margin = parseFloat(p.initial_margin) || 0;
  const leverage = p.leverage || 1;
  const realizedPnl = parseFloat(p.realized_pnl) || 0;
  const cumFee = parseFloat(p.cum_trading_fee) || 0;
  const fundingFee = parseFloat(p.funding_fee) || 0;
  const sizeNum = parseFloat(p.size);
  const isLong = p.position_side === 2 || (p.position_side === 1 && sizeNum > 0);
  const isClosed = parseFloat(p.cum_closed_size) > 0 && exitPrice !== null && exitPrice > 0;
  const fees = cumFee + fundingFee;
  const entryDate = new Date(p.created_at);
  const exitDate = p.updated_at !== p.created_at ? new Date(p.updated_at) : null;

  return {
    id: `auto-${p.position_id}`,
    pair: pairName,
    direction: isLong ? "long" : "short",
    status: isClosed ? "closed" : "open",
    orderType: "market",
    leverage,
    margin,
    entryPrice,
    exitPrice: isClosed ? exitPrice : null,
    entryDate: `${entryDate.getUTCFullYear()}-${String(entryDate.getUTCMonth() + 1).padStart(2, "0")}-${String(entryDate.getUTCDate()).padStart(2, "0")}`,
    exitDate: exitDate ? `${exitDate.getUTCFullYear()}-${String(exitDate.getUTCMonth() + 1).padStart(2, "0")}-${String(exitDate.getUTCDate()).padStart(2, "0")}` : null,
    pnl: isClosed ? realizedPnl : null,
    pnlManual: false,
    fees,
    notes: "",
    mood: 3,
    tags: [],
    createdAt: p.created_at,
    updatedAt: p.updated_at,
  };
}

/* ════════════════════════════════════════════════════════════════
   AutoFetchButton — address input dropdown + paginated fetch
   ════════════════════════════════════════════════════════════════ */

function AutoFetchButton({
  symbols,
  onTradesImported,
  triggerOpen = 0,
}: {
  symbols: SymbolInfo[];
  onTradesImported: (trades: Trade[]) => void;
  triggerOpen?: number;
}) {
  const [open, setOpen] = useState(false);
  const [address, setAddress] = useState("");
  const [savedAddrs, setSavedAddrs] = useState<string[]>([]);
  const [fetchMonth, setFetchMonth] = useState(() => {
    const n = new Date();
    return new Date(Date.UTC(n.getUTCFullYear(), n.getUTCMonth(), 1));
  });
  const [fetchState, setFetchState] = useState<AutoFetchState>({
    status: "idle", address: "", accountId: null, fetchedCount: 0,
    totalPositions: 0, nextCursor: null, error: null, startedAt: null, finishedAt: null,
  });
  const [importedCount, setImportedCount] = useState<number | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setSavedAddrs(loadSavedAddresses());
  }, []);

  useEffect(() => {
    if (triggerOpen > 0) setOpen(true);
  }, [triggerOpen]);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        if (fetchState.status !== "loading" && fetchState.status !== "resolving") setOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open, fetchState.status]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
      if (abortRef.current) abortRef.current.abort();
    };
  }, []);

  const symbolMap = useMemo(() => {
    const m = new Map<number, SymbolInfo>();
    for (const s of symbols) m.set(s.id, s);
    return m;
  }, [symbols]);

  const doFetchPage = useCallback(async (accountId: number, cursor: string | null, addr: string, monthStart: number, monthEnd: number) => {
    if (abortRef.current?.signal.aborted) return;

    const params = new URLSearchParams({
      account_id: String(accountId),
      limit: String(FETCH_PAGE_SIZE),
    });
    if (cursor) params.set("cursor", cursor);

    try {
      const res = await fetch(`/api/perps/positions?${params.toString()}`, { signal: abortRef.current?.signal });
      if (abortRef.current?.signal.aborted) return;
      const json = await res.json();
      if (abortRef.current?.signal.aborted) return;

      if (res.status === 429) {
        timerRef.current = setTimeout(() => doFetchPage(accountId, cursor, addr, monthStart, monthEnd), 5000);
        return;
      }
      if (json.code !== 0) throw new Error(json.message || `API error (${res.status})`);

      const items: PositionHistoryItem[] = json.data || [];
      const newCursor: string | null = json.meta?.next_cursor ?? null;

      // Filter to the target month only
      const monthItems = items.filter((p) => p.created_at >= monthStart && p.created_at < monthEnd);

      // Check if we've gone past the target month — if the oldest item is before monthStart, stop
      const reachedPastMonth = items.length > 0 && items[items.length - 1].created_at < monthStart;

      // Stop if no cursor, partial page, or we've reached positions before the target month
      const isDone = !newCursor || items.length < FETCH_PAGE_SIZE || reachedPastMonth;

      // Convert this month's positions to trades
      const newTrades: Trade[] = [];
      for (const p of monthItems) {
        const sym = symbolMap.get(p.symbol_id);
        const pairName = sym?.name ?? `#${p.symbol_id}`;
        const taker = sym ? parseFloat(sym.takerFee ?? String(DEFAULT_TAKER_FEE)) : DEFAULT_TAKER_FEE;
        const maker = sym ? parseFloat(sym.makerFee ?? String(DEFAULT_MAKER_FEE)) : DEFAULT_MAKER_FEE;
        newTrades.push(positionToTrade(p, pairName, taker, maker));
      }

      setFetchState((prev) => ({
        ...prev,
        fetchedCount: prev.fetchedCount + items.length,
        totalPositions: prev.totalPositions + monthItems.length,
        nextCursor: newCursor,
        status: isDone ? "done" : "loading",
        finishedAt: isDone ? Date.now() : null,
      }));

      // Import progressively
      if (newTrades.length > 0) {
        onTradesImported(newTrades);
      }

      if (!isDone) {
        timerRef.current = setTimeout(() => doFetchPage(accountId, newCursor, addr, monthStart, monthEnd), FETCH_RATE_MS);
      } else {
        setImportedCount((prev) => (prev ?? 0) + monthItems.length);
      }
    } catch (err) {
      if (abortRef.current?.signal.aborted) return;
      setFetchState((prev) => ({
        ...prev,
        status: "error",
        error: err instanceof Error ? err.message : "Fetch failed",
      }));
    }
  }, [symbolMap, onTradesImported]);

  const handleStart = async () => {
    const trimmed = address.trim();
    if (!trimmed) return;

    // Reset
    if (timerRef.current) clearTimeout(timerRef.current);
    if (abortRef.current) abortRef.current.abort();
    abortRef.current = new AbortController();

    const monthStart = Date.UTC(fetchMonth.getUTCFullYear(), fetchMonth.getUTCMonth(), 1);
    const monthEnd = Date.UTC(fetchMonth.getUTCFullYear(), fetchMonth.getUTCMonth() + 1, 1);

    setImportedCount(null);
    setFetchState({
      status: "resolving", address: trimmed, accountId: null, fetchedCount: 0,
      totalPositions: 0, nextCursor: null, error: null, startedAt: Date.now(), finishedAt: null,
    });

    const aid = await resolveAccountId(trimmed);
    if (abortRef.current?.signal.aborted) return;

    if (aid === null) {
      setFetchState((prev) => ({ ...prev, status: "error", error: "Address not found on SoDEX" }));
      return;
    }

    saveAddress(trimmed);
    setSavedAddrs(loadSavedAddresses());

    setFetchState((prev) => ({ ...prev, status: "loading", accountId: aid }));
    doFetchPage(aid, null, trimmed, monthStart, monthEnd);
  };

  const handleCancel = () => {
    if (timerRef.current) clearTimeout(timerRef.current);
    if (abortRef.current) abortRef.current.abort();
    setFetchState((prev) => ({ ...prev, status: "idle", error: null }));
  };

  const handleReset = () => {
    setFetchState({
      status: "idle", address: "", accountId: null, fetchedCount: 0,
      totalPositions: 0, nextCursor: null, error: null, startedAt: null, finishedAt: null,
    });
    setImportedCount(null);
  };

  const isBusy = fetchState.status === "loading" || fetchState.status === "resolving";

  return (
    <div ref={dropdownRef} className="relative" style={{ zIndex: 20 }}>
      <button
        onClick={() => fetchState.status === "idle" || fetchState.status === "done" || fetchState.status === "error" ? setOpen(!open) : handleCancel()}
        className="flex items-center gap-1.5 px-3 py-2 transition-all"
        style={{
          border: `1px solid ${isBusy ? "var(--accent)" : "var(--border)"}`,
          borderRadius: "var(--r-md)",
          background: isBusy ? "var(--accent-dim)" : "var(--bg-surface)",
          color: isBusy ? "var(--accent)" : "var(--text-muted)",
          fontWeight: 600,
          fontSize: 13,
        }}
      >
        {isBusy ? <Loader2 size={14} className="animate-spin" /> : <Download size={14} />}
        <span>{isBusy ? `Fetching… ${fetchState.fetchedCount}` : "Auto-Fetch"}</span>
        {!isBusy && <ChevronDown size={12} style={{ transform: open ? "rotate(180deg)" : "none", transition: "transform 0.2s" }} />}
      </button>

      {open && !isBusy && (
        <div
          className="absolute top-full right-0 mt-1 w-[calc(100vw-24px)] sm:w-80 max-w-80"
          style={{
            background: "var(--bg-surface)",
            border: "1px solid var(--border)",
            borderRadius: "var(--r-card)",
            boxShadow: "0 8px 32px rgba(0,0,0,0.28)",
            padding: "12px 14px",
            zIndex: 20,
          }}
        >
          <div className="flex items-center gap-2 mb-2.5">
            <Wallet size={13} style={{ color: "var(--accent)" }} />
            <span className="text-xs sm:text-sm font-bold" style={{ color: "var(--text)" }}>Import from Address</span>
          </div>

          {/* Month picker */}
          <div className="flex items-center justify-between mb-2.5 px-0.5">
            <span className="tag" style={{ color: "var(--text-faint)", fontSize: 8 }}>FETCH MONTH</span>
            <div className="flex items-center gap-1">
              <button
                onClick={() => setFetchMonth((prev) => new Date(Date.UTC(prev.getUTCFullYear(), prev.getUTCMonth() - 1, 1)))}
                className="flex items-center justify-center w-6 h-6 transition-colors"
                style={{ border: "1px solid var(--border)", color: "var(--text-muted)", borderRadius: 3 }}
                onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.borderColor = "var(--accent)"; (e.currentTarget as HTMLElement).style.color = "var(--accent)"; }}
                onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.borderColor = "var(--border)"; (e.currentTarget as HTMLElement).style.color = "var(--text-muted)"; }}
              >
                <ChevronLeft size={12} />
              </button>
              <span className="mono text-[11px] sm:text-xs font-bold" style={{ color: "var(--text)", minWidth: 72, textAlign: "center" }}>
                {fetchMonth.toLocaleDateString("en-US", { month: "short", year: "numeric", timeZone: "UTC" })}
              </span>
              <button
                onClick={() => setFetchMonth((prev) => new Date(Date.UTC(prev.getUTCFullYear(), prev.getUTCMonth() + 1, 1)))}
                className="flex items-center justify-center w-6 h-6 transition-colors"
                style={{ border: "1px solid var(--border)", color: "var(--text-muted)", borderRadius: 3 }}
                onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.borderColor = "var(--accent)"; (e.currentTarget as HTMLElement).style.color = "var(--accent)"; }}
                onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.borderColor = "var(--border)"; (e.currentTarget as HTMLElement).style.color = "var(--text-muted)"; }}
              >
                <ChevronRight size={12} />
              </button>
            </div>
          </div>

          <p className="text-[10px] sm:text-[11px] leading-relaxed mb-2.5" style={{ color: "var(--text-faint)" }}>
            Fetches {fetchMonth.toLocaleDateString("en-US", { month: "long", year: "numeric", timeZone: "UTC" })}'s position history. Imported positions appear as trades.
          </p>

          <div className="flex flex-col gap-2 mb-1">
            <div className="flex flex-col sm:flex-row gap-1.5">
              <input
                type="text"
                value={address}
                onChange={(e) => setAddress(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleStart()}
                placeholder="0x… wallet address"
                className="flex-1 px-2.5 py-2 text-xs"
                style={{
                  background: "var(--bg)",
                  border: "1px solid var(--border)",
                  borderRadius: "var(--r-sm)",
                  color: "var(--text)",
                  outline: "none",
                  fontFamily: "monospace",
                }}
                onFocus={(e) => { (e.target as HTMLInputElement).style.borderColor = "var(--accent)"; }}
                onBlur={(e) => { (e.target as HTMLInputElement).style.borderColor = "var(--border)"; }}
                autoFocus
              />
              <button
                onClick={handleStart}
                disabled={!address.trim()}
                className="flex items-center justify-center gap-1 px-3 py-2 transition-all"
                style={{
                  background: address.trim() ? "var(--accent)" : "var(--bg-elevated)",
                  color: address.trim() ? "var(--accent-fg)" : "var(--text-faint)",
                  borderRadius: "var(--r-sm)",
                  fontWeight: 600,
                  fontSize: 12,
                }}
              >
                <Download size={12} /> Fetch
              </button>
            </div>

            {savedAddrs.length > 0 && (
              <div className="flex flex-col gap-1">
                <span className="tag" style={{ color: "var(--text-faint)", fontSize: 8 }}>RECENT</span>
                {savedAddrs.slice(0, 4).map((a) => (
                  <button
                    key={a}
                    onClick={() => setAddress(a)}
                    className="flex items-center gap-1.5 px-2 py-1.5 transition-colors text-left"
                    style={{ background: "var(--bg)", borderRadius: "var(--r-sm)" }}
                    onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = "var(--bg-elevated)"; }}
                    onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = "var(--bg)"; }}
                  >
                    <Wallet size={10} style={{ color: "var(--text-faint)" }} />
                    <span className="mono text-[10px]" style={{ color: "var(--text-muted)" }}>{a.slice(0, 8)}…{a.slice(-6)}</span>
                  </button>
                ))}
              </div>
            )}
          </div>

          {fetchState.status === "error" && (
            <div className="flex items-center gap-1.5 px-2.5 py-2 mb-1" style={{ background: "var(--cal-red-tint)", borderRadius: "var(--r-sm)" }}>
              <AlertCircle size={12} style={{ color: "var(--cal-red)" }} />
              <span className="text-[11px]" style={{ color: "var(--cal-red)" }}>{fetchState.error}</span>
            </div>
          )}

          {fetchState.status === "done" && (
            <div className="flex items-center gap-1.5 px-2.5 py-2 mb-1" style={{ background: "var(--cal-green-tint)", borderRadius: "var(--r-sm)" }}>
              <Check size={12} style={{ color: "var(--cal-green)" }} />
              <span className="text-[11px]" style={{ color: "var(--cal-green)" }}>
                Imported {fetchState.totalPositions} for {fetchMonth.toLocaleDateString("en-US", { month: "short", year: "numeric", timeZone: "UTC" })}
              </span>
              <button onClick={handleReset} className="tag ml-auto" style={{ color: "var(--text-faint)" }}>RESET</button>
            </div>
          )}
        </div>
      )}

      {/* Progress bar when loading */}
      {isBusy && (
        <div className="absolute top-full right-0 mt-1 w-[calc(100vw-24px)] sm:w-64 max-w-64" style={{ background: "var(--bg-surface)", border: "1px solid var(--border)", borderRadius: "var(--r-card)", padding: "10px 12px", zIndex: 20 }}>
          <div className="flex items-center gap-2 mb-1.5">
            <Loader2 size={13} className="animate-spin" style={{ color: "var(--accent)" }} />
            <span className="text-[11px] sm:text-xs font-bold" style={{ color: "var(--text)" }}>
              {fetchState.status === "resolving" ? "Resolving address…" : `Fetched ${fetchState.fetchedCount}`}
            </span>
          </div>
          <div style={{ height: 3, background: "var(--bg-elevated)", borderRadius: 2, overflow: "hidden" }}>
            <div style={{ height: "100%", background: "var(--accent)", borderRadius: 2, transition: "width 0.3s", width: `${Math.min(100, (fetchState.fetchedCount / Math.max(fetchState.fetchedCount, 1)) * 100)}%` }} />
          </div>
          <div className="flex items-center justify-between mt-1.5">
            <span className="tag" style={{ color: "var(--text-faint)", fontSize: 7 }}>
              {fetchState.status === "resolving" ? "LOOKING UP ACCOUNT" : `${fetchState.nextCursor ? "PAGINATING" : "FINISHING"}`}
            </span>
            <button onClick={handleCancel} className="tag" style={{ color: "var(--cal-red)", fontSize: 8 }}>CANCEL</button>
          </div>
        </div>
      )}
    </div>
  );
}

/* ════════════════════════════════════════════════════════════════
   Empty State Hero — shown when no trades
   ════════════════════════════════════════════════════════════════ */

function EmptyStateHero({ onNewTrade, onAutoFetch }: { onNewTrade: () => void; onAutoFetch: () => void }) {
  return (
    <div className="flex flex-col items-center gap-6 py-12 px-4 fade-up">
      <div className="flex flex-col items-center gap-3 text-center">
        <div className="flex items-center justify-center" style={{ width: 64, height: 64, background: "var(--bg-surface)", border: "1px solid var(--border)", borderRadius: "var(--r-card)" }}>
          <BookOpen size={28} style={{ color: "var(--accent)" }} />
        </div>
        <h1 className="text-2xl font-bold" style={{ color: "var(--text)" }}>Trading Journal</h1>
        <p className="text-sm max-w-md" style={{ color: "var(--text-muted)" }}>
          Log your trades manually, track PnL with fees, visualize performance, and build better trading habits.
        </p>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 max-w-2xl w-full">
        {[
          { icon: PenLine, label: "Log Trades", desc: "Manual entry with pair, leverage, fees" },
          { icon: Activity, label: "Equity Curve", desc: "Track cumulative PnL over time" },
          { icon: PieChart, label: "Pair Analysis", desc: "See which pairs perform best" },
          { icon: Target, label: "Win Rate", desc: "Monitor your trading discipline" },
        ].map((f, i) => {
          const Icon = f.icon;
          return (
            <div key={f.label} className={`flex flex-col gap-1.5 p-3 fade-up-${i + 1}`} style={{ border: "1px solid var(--border)", borderRadius: "var(--r-card)", background: "var(--bg-surface)" }}>
              <Icon size={18} style={{ color: "var(--accent)" }} />
              <span className="text-xs font-bold" style={{ color: "var(--text)" }}>{f.label}</span>
              <span className="text-[10px] leading-relaxed" style={{ color: "var(--text-faint)" }}>{f.desc}</span>
            </div>
          );
        })}
      </div>

      <div className="flex items-center gap-3 fade-up-5">
        <button onClick={onNewTrade} className="flex items-center gap-2 px-5 py-2.5 transition-all"
          style={{ background: "var(--accent)", color: "var(--accent-fg)", borderRadius: "var(--r-md)", fontWeight: 600, fontSize: 14 }}>
          <Plus size={16} /> Log Your First Trade
        </button>
        <button onClick={onAutoFetch} className="flex items-center gap-2 px-5 py-2.5 transition-all"
          style={{ border: "1px solid var(--border)", color: "var(--text-muted)", borderRadius: "var(--r-md)", fontWeight: 600, fontSize: 14, background: "var(--bg-surface)" }}>
          <Download size={16} /> Auto-Fetch from Address
        </button>
      </div>
    </div>
  );
}

/* ════════════════════════════════════════════════════════════════
   Main JournalPage
   ════════════════════════════════════════════════════════════════ */

export function JournalPage() {
  const [trades, setTrades] = useState<Trade[]>([]);
  const [symbols, setSymbols] = useState<SymbolInfo[]>([]);
  const [symbolsLoading, setSymbolsLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingTrade, setEditingTrade] = useState<Trade | null>(null);
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [filterDate, setFilterDate] = useState<string | null>(null);
  const [autoFetchTrigger, setAutoFetchTrigger] = useState(0);
  const [tradesLoaded, setTradesLoaded] = useState(false);

  useEffect(() => { setTrades(loadTrades()); setTradesLoaded(true); }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try { const data = await fetchSymbols(); if (!cancelled) setSymbols(data); }
      catch { /* silent */ }
      finally { if (!cancelled) setSymbolsLoading(false); }
    })();
    return () => { cancelled = true; };
  }, []);

  useEffect(() => { saveTrades(trades); }, [trades]);

  const handleSaveTrade = (t: Trade) => {
    setTrades((prev) => {
      const idx = prev.findIndex((x) => x.id === t.id);
      if (idx >= 0) { const next = [...prev]; next[idx] = t; return next; }
      return [t, ...prev];
    });
    setShowForm(false); setEditingTrade(null);
  };

  const handleDeleteTrade = (id: string) => setTrades((prev) => prev.filter((t) => t.id !== id));
  const handleEditTrade = (t: Trade) => { setEditingTrade(t); setShowForm(true); };
  const handleNewTrade = () => { setEditingTrade(null); setShowForm(true); };

  const handleImportTrades = useCallback((newTrades: Trade[]) => {
    setTrades((prev) => {
      const existingIds = new Set(prev.map((t) => t.id));
      const toAdd = newTrades.filter((t) => !existingIds.has(t.id));
      // Merge: put new auto-imported trades at the end, keep manual ones in front
      return [...prev, ...toAdd];
    });
  }, []);

  const handleCalendarSelect = (key: string) => {
    if (selectedDate === key) { setSelectedDate(null); setFilterDate(null); }
    else { setSelectedDate(key); setFilterDate(key); }
  };

  const hasTrades = trades.length > 0;

  return (
    <div className="min-h-screen pt-14 px-3 sm:px-6 pb-12">
      <div className="max-w-7xl mx-auto flex flex-col gap-3 sm:gap-4">
        {/* Header */}
        <div className="flex flex-row items-center justify-between gap-2 fade-up relative" style={{ zIndex: 10 }}>
          <div className="flex items-center gap-2 sm:gap-3 min-w-0">
            <div className="flex items-center justify-center shrink-0" style={{ width: 32, height: 32, background: "var(--bg-surface)", border: "1px solid var(--border)", borderRadius: "var(--r-md)" }}>
              <BookOpen size={14} style={{ color: "var(--accent)" }} />
            </div>
            <div className="min-w-0">
              <h1 className="text-base sm:text-lg font-bold truncate" style={{ color: "var(--text)" }}>Trading Journal</h1>
              <span className="text-[11px] sm:text-xs" style={{ color: "var(--text-muted)" }}>{trades.length} {trades.length === 1 ? "trade" : "trades"} logged</span>
            </div>
          </div>
          <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
            <AutoFetchButton symbols={symbols} onTradesImported={handleImportTrades} triggerOpen={autoFetchTrigger} />
            {hasTrades && (
              <button onClick={handleNewTrade} className="flex items-center gap-1 px-3 sm:px-4 py-2 transition-all"
                style={{ background: "var(--accent)", color: "var(--accent-fg)", borderRadius: "var(--r-md)", fontWeight: 600, fontSize: 12 }}>
                <Plus size={14} /> <span className="hidden sm:inline">New Trade</span><span className="sm:hidden">New</span>
              </button>
            )}
          </div>
        </div>

        {/* Empty state — auto show form */}
        {!hasTrades && tradesLoaded && !showForm && (
          <div className="grid grid-cols-1 lg:grid-cols-[420px_1fr] gap-3 sm:gap-4 fade-up-1">
            <TradeForm symbols={symbols} editingTrade={null} onSave={handleSaveTrade} onCancel={() => {}} />
            <div className="flex flex-col gap-3 sm:gap-4">
              <div className="flex flex-col items-center gap-3 p-6 sm:p-8 text-center" style={{ border: "1px solid var(--border)", borderRadius: "var(--r-card)", background: "var(--bg-surface)" }}>
                <BookOpen size={28} style={{ color: "var(--text-faint)" }} />
                <div>
                  <span className="text-sm font-bold" style={{ color: "var(--text)" }}>Your journal is empty</span>
                  <p className="text-xs mt-1" style={{ color: "var(--text-faint)" }}>Log a trade manually or use Auto-Fetch to import from an address</p>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Form view */}
        {showForm && (
          <div className="grid grid-cols-1 lg:grid-cols-[420px_1fr] gap-3 sm:gap-4 fade-up-1">
            <TradeForm symbols={symbols} editingTrade={editingTrade} onSave={handleSaveTrade} onCancel={() => { setShowForm(false); setEditingTrade(null); }} />
            <div className="flex flex-col gap-3 sm:gap-4">
              {hasTrades && <JournalCalendar trades={trades} selectedDate={selectedDate} onSelectDate={handleCalendarSelect} />}
              {hasTrades && <EquityCurve trades={trades} />}
              {hasTrades && <StatsPanel trades={trades} />}
            </div>
          </div>
        )}

        {/* Normal view with analytics */}
        {hasTrades && !showForm && (
          <>
            {/* Calendar — full width */}
            <div className="fade-up-1">
              <JournalCalendar trades={trades} selectedDate={selectedDate} onSelectDate={handleCalendarSelect} />
            </div>

            {/* Row: Equity + Long/Short (2-col on desktop, stack on mobile) */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4 fade-up-2">
              <EquityCurve trades={trades} />
              <LongShortSplit trades={trades} />
            </div>

            {/* Row: Pair Dist + Win/Loss + Stats (3-col desktop, 1-col mobile) */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4 fade-up-3">
              <PairDistribution trades={trades} />
              <WinLossChart trades={trades} />
              <StatsPanel trades={trades} />
            </div>

            {/* Trade log — full width */}
            <div className="fade-up-4">
              <TradeLog trades={trades} onEdit={handleEditTrade} onDelete={handleDeleteTrade} filterDate={filterDate} onClearFilter={() => { setFilterDate(null); setSelectedDate(null); }} />
            </div>
          </>
        )}
      </div>
    </div>
  );
}
