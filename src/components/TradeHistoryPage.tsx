"use client";

import { useState, useRef, useCallback, useEffect, useMemo, type RefObject } from "react";
import { CornerMarks } from "@/components/CornerMarks";
import { TokenIcon } from "@/components/TokenIcon";
import {
  Search, X, Copy, Check, ExternalLink,
  ChevronLeft, ChevronRight, History, Wallet, Download,
  Pause, Play, AlertCircle, Loader2, TrendingDown,
} from "lucide-react";
import { downloadCSV } from "@/components/ExportManager";

/* ─── Shared types ───────────────────────────────────────────────────────────── */

type TradeMode = "perps" | "spot";
type LoadStatus = "idle" | "loading" | "paused" | "done" | "error";

interface TradeRaw {
  account_id: number;
  symbol_id: number;
  trade_id: number;
  side: number;        // 1 = buy, 2 = sell
  user_id: number;
  order_id: number;
  cl_ord_id?: string;
  price: string;
  quantity: string;
  fee: string;
  ts_ms: number;
  is_maker: boolean;
}

interface TradeEnriched extends TradeRaw {
  symbolName: string;
  priceValue: number;
  qtyValue: number;
  feeValue: number;
  feeToken: string;
  feeUSD: number;
  tradeValue: number;
}

interface LoaderState {
  status: LoadStatus;
  accountId: number | null;
  trades: TradeRaw[];
  fetchedCount: number;
  nextCursor: string | null;
  error: string | null;
  startedAt: number | null;
  finishedAt: number | null;
  symbolMap: Map<number, string>;
}

/* ════════════════════════════════════════════════════════════════════════════
   Module-level loaders — survive page navigation.
   Two independent instances, one per mode.
   ════════════════════════════════════════════════════════════════════════════ */

const RATE_MS = 3_000;
const PAGE_SIZE = 200;

function emptyState(): LoaderState {
  return {
    status: "idle",
    accountId: null,
    trades: [],
    fetchedCount: 0,
    nextCursor: null,
    error: null,
    startedAt: null,
    finishedAt: null,
    symbolMap: new Map(),
  };
}

const _state: Record<TradeMode, LoaderState> = {
  perps: emptyState(),
  spot: emptyState(),
};
const _listeners: Record<TradeMode, Set<(s: LoaderState) => void>> = {
  perps: new Set(),
  spot: new Set(),
};
const _timers: Record<TradeMode, ReturnType<typeof setTimeout> | null> = { perps: null, spot: null };
const _aborts: Record<TradeMode, AbortController | null> = { perps: null, spot: null };

function notify(mode: TradeMode) {
  _listeners[mode].forEach(fn => fn(_state[mode]));
}

function patch(mode: TradeMode, partial: Partial<LoaderState>) {
  _state[mode] = { ..._state[mode], ...partial };
  notify(mode);
}

async function loaderTick(mode: TradeMode) {
  const st = _state[mode];
  const abort = _aborts[mode];
  if (st.status !== "loading" || !abort || abort.signal.aborted) return;

  try {
    const params = new URLSearchParams({
      account_id: String(st.accountId!),
      limit: String(PAGE_SIZE),
    });
    if (st.nextCursor) params.set("cursor", st.nextCursor);

    const url = mode === "perps"
      ? `/api/perps/trades?${params}`
      : `/api/spot/trades?${params}`;

    const res = await fetch(url, { signal: abort.signal });
    if (abort.signal.aborted) return;

    const json = await res.json();
    if (abort.signal.aborted) return;

    if (res.status === 429) {
      // Back off an extra 5 seconds on rate limit
      _timers[mode] = setTimeout(() => loaderTick(mode), 5_000);
      return;
    }
    if (json.code !== 0) throw new Error(json.message || `API error (${res.status})`);

    const items: TradeRaw[] = json.data || [];
    const newCursor: string | null = json.meta?.next_cursor ?? null;
    const isDone = !newCursor || items.length < PAGE_SIZE;

    patch(mode, {
      trades: [..._state[mode].trades, ...items],
      fetchedCount: _state[mode].fetchedCount + items.length,
      nextCursor: newCursor,
      status: isDone ? "done" : "loading",
      finishedAt: isDone ? Date.now() : null,
    });

    if (!isDone) {
      _timers[mode] = setTimeout(() => loaderTick(mode), RATE_MS);
    }
  } catch (err) {
    if (_aborts[mode]?.signal.aborted) return;
    patch(mode, {
      status: "error",
      error: err instanceof Error ? err.message : "Unknown error",
    });
  }
}

function loaderCleanup(mode: TradeMode) {
  if (_timers[mode]) { clearTimeout(_timers[mode]!); _timers[mode] = null; }
  if (_aborts[mode]) { _aborts[mode]!.abort(); _aborts[mode] = null; }
}

export function loaderSubscribe(mode: TradeMode, fn: (s: LoaderState) => void) {
  _listeners[mode].add(fn);
  fn(_state[mode]);
  return () => { _listeners[mode].delete(fn); };
}

export function loaderStart(mode: TradeMode, accountId: number, symbolMap: Map<number, string>) {
  loaderCleanup(mode);
  _aborts[mode] = new AbortController();
  _state[mode] = {
    ...emptyState(),
    status: "loading",
    accountId,
    symbolMap,
    startedAt: Date.now(),
  };
  notify(mode);
  loaderTick(mode);
}

export function loaderPause(mode: TradeMode) {
  if (_state[mode].status !== "loading") return;
  loaderCleanup(mode);
  patch(mode, { status: "paused" });
}

export function loaderResume(mode: TradeMode) {
  if (_state[mode].status !== "paused" && _state[mode].status !== "error") return;
  _aborts[mode] = new AbortController();
  patch(mode, { status: "loading", error: null });
  loaderTick(mode);
}

export function loaderReset(mode: TradeMode) {
  loaderCleanup(mode);
  _state[mode] = emptyState();
  notify(mode);
}

/* ─── Helpers ────────────────────────────────────────────────────────────────── */

const GW_BASE = "https://mainnet-gw.sodex.dev/api/v1";

function fmt(n: number, dp = 2): string {
  const abs = Math.abs(n); const sign = n < 0 ? "-" : "";
  if (abs >= 1_000_000) return `${sign}$${(abs / 1_000_000).toFixed(dp)}M`;
  if (abs >= 1_000) return `${sign}$${(abs / 1_000).toFixed(dp)}K`;
  return `${sign}$${abs.toFixed(dp)}`;
}
function fmtDate(ts: number) {
  return new Date(ts).toLocaleDateString("en-US", {
    month: "short", day: "numeric", year: "numeric", timeZone: "UTC",
  });
}
function fmtDateTime(ts: number) {
  return new Date(ts).toLocaleString("en-US", {
    month: "short", day: "numeric", hour: "2-digit", minute: "2-digit", timeZone: "UTC",
  });
}
function fmtPrice(n: number) {
  if (n >= 1000) return n.toLocaleString(undefined, { maximumFractionDigits: 2 });
  if (n >= 1) return n.toFixed(4);
  return n.toPrecision(4);
}
function fmtElapsed(startedAt: number | null, finishedAt: number | null) {
  if (!startedAt) return "—";
  const s = Math.floor(((finishedAt ?? Date.now()) - startedAt) / 1000);
  if (s >= 3600) return `${Math.floor(s / 3600)}h ${Math.floor((s % 3600) / 60)}m`;
  if (s >= 60) return `${Math.floor(s / 60)}m ${s % 60}s`;
  return `${s}s`;
}
function shortAddr(a: string) { return `${a.slice(0, 8)}…${a.slice(-6)}`; }

function useCopy() {
  const [copied, setCopied] = useState<string | null>(null);
  const copy = useCallback((text: string) => {
    navigator.clipboard?.writeText(text).then(() => {
      setCopied(text);
      setTimeout(() => setCopied(null), 1500);
    });
  }, []);
  return { copied, copy };
}

async function apiFetch<T>(url: string): Promise<T> {
  for (let i = 0; i <= 2; i++) {
    const res = await fetch(url);
    if (res.status === 429 && i < 2) { await new Promise(r => setTimeout(r, 800 * (i + 1))); continue; }
    const json = await res.json();
    if (json.code !== 0) throw new Error(json.message || "API error");
    return json.data as T;
  }
  throw new Error("Max retries");
}

async function resolveAccountId(addr: string): Promise<number | null> {
  try { return (await apiFetch<{ aid: number }>(`${GW_BASE}/perps/accounts/${addr}/state`)).aid; }
  catch {
    try { return (await apiFetch<{ aid: number }>(`${GW_BASE}/spot/accounts/${addr}/state`)).aid; }
    catch { return null; }
  }
}

async function fetchSymbolMap(mode: TradeMode): Promise<Map<number, string>> {
  try {
    const data = await apiFetch<Array<{ id: number; name: string; displayName?: string }>>(
      `${GW_BASE}/${mode}/markets/symbols`
    );
    return new Map(data.map(s => [s.id, s.displayName || s.name]));
  } catch { return new Map(); }
}

// Build a token → USD price map from both perps and spot mark prices.
async function fetchTokenPrices(): Promise<Map<string, number>> {
  const prices = new Map<string, number>([
    ["USD", 1], ["USDC", 1], ["USDT", 1], ["DAI", 1], ["BUSD", 1],
  ]);
  try {
    const perps = await apiFetch<Array<{ symbol: string; markPrice: string }>>(
      `${GW_BASE}/perps/markets/tickers`
    );
    for (const t of perps) {
      const dash = t.symbol.lastIndexOf("-");
      if (dash !== -1) {
        const base = t.symbol.slice(0, dash);
        const p = parseFloat(t.markPrice || "0");
        if (p > 0) prices.set(base, p);
      }
    }
  } catch { /* continue with what we have */ }
  try {
    const spot = await apiFetch<Array<{ symbol: string; lastPx: string }>>(
      `${GW_BASE}/spot/markets/tickers`
    );
    for (const t of spot) {
      const { base, quote } = parsePair(t.symbol);
      const quoteUSD = prices.get(quote) ?? 1;
      const p = parseFloat(t.lastPx || "0") * quoteUSD;
      // Only set if perps didn't already give a more reliable mark price
      if (p > 0 && !prices.has(base)) prices.set(base, p);
    }
  } catch { /* continue */ }
  return prices;
}

// Split "LINK/USDC" or "vLINK_vUSDC" → { base: "LINK", quote: "USDC" }
function parsePair(symbolName: string): { base: string; quote: string } {
  const slash = symbolName.indexOf("/");
  if (slash !== -1) return { base: symbolName.slice(0, slash), quote: symbolName.slice(slash + 1) };
  const under = symbolName.indexOf("_");
  if (under !== -1) {
    return {
      base: symbolName.slice(0, under).replace(/^v/, ""),
      quote: symbolName.slice(under + 1).replace(/^v/, ""),
    };
  }
  return { base: symbolName, quote: "USD" };
}

function enrich(
  raw: TradeRaw[],
  symbolMap: Map<number, string>,
  mode: TradeMode,
  tokenPrices: Map<string, number>,
): TradeEnriched[] {
  return raw.map(t => {
    const priceValue = parseFloat(t.price || "0");
    const qtyValue = parseFloat(t.quantity || "0");
    const feeValue = parseFloat(t.fee || "0");
    const symbolName = symbolMap.get(t.symbol_id) || `#${t.symbol_id}`;
    // Spot: fee paid in the token you receive.
    // BUY  (side=1) → you receive base  → fee in base token
    // SELL (side=2) → you receive quote → fee in quote token
    // Perps: fee settled in USD margin
    let feeToken = "USD";
    if (mode === "spot") {
      const { base, quote } = parsePair(symbolName);
      feeToken = t.side === 1 ? base : quote;
    }
    const feeUSD = feeValue * (tokenPrices.get(feeToken) ?? 0);
    return {
      ...t,
      symbolName,
      priceValue,
      qtyValue,
      feeValue,
      feeToken,
      feeUSD,
      tradeValue: priceValue * qtyValue,
    };
  });
}

/* ─── LoaderPanel — controls for a single mode ───────────────────────────────── */

function LoaderPanel({
  mode, state, onStart, accountId, symbolMap,
}: {
  mode: TradeMode;
  state: LoaderState;
  onStart: () => void;
  accountId: number;
  symbolMap: Map<number, string>;
}) {
  const { status, fetchedCount, error, startedAt, finishedAt } = state;
  const label = mode === "perps" ? "PERPS" : "SPOT";

  const statusColor =
    status === "done"    ? "var(--green)"      :
    status === "error"   ? "var(--red)"        :
    status === "paused"  ? "var(--text-faint)" :
    status === "loading" ? "var(--accent)"     : "var(--border)";

  if (status === "idle") {
    return (
      <button
        onClick={onStart}
        className="flex-1 flex flex-col items-center gap-2 py-4 px-3 transition-all"
        style={{
          border: "1px solid var(--border)",
          background: "var(--bg-surface)",
        }}
        onMouseEnter={e => { const el = e.currentTarget as HTMLElement; el.style.borderColor = "var(--accent)"; }}
        onMouseLeave={e => { const el = e.currentTarget as HTMLElement; el.style.borderColor = "var(--border)"; }}
      >
        <Download size={16} style={{ color: "var(--accent)" }} />
        <span className="tag font-bold text-[11px]" style={{ color: "var(--text)" }}>LOAD ALL {label} TRADES</span>
        <span className="tag text-[9px]" style={{ color: "var(--text-faint)" }}>1,000 per page · 3s delay</span>
      </button>
    );
  }

  const pct = status === "done" ? 100 : (fetchedCount % PAGE_SIZE) / PAGE_SIZE * 100;

  return (
    <div className="flex-1 p-3" style={{ border: `1px solid ${statusColor}`, background: "var(--bg-surface)" }}>
      <div className="flex items-center justify-between mb-2 gap-2">
        <div className="flex items-center gap-1.5">
          {status === "loading" && <Loader2 size={11} className="animate-spin" style={{ color: statusColor }} />}
          {status === "paused"  && <Pause size={11} style={{ color: statusColor }} />}
          {status === "done"    && <Check size={11} style={{ color: statusColor }} />}
          {status === "error"   && <AlertCircle size={11} style={{ color: statusColor }} />}
          <span className="tag font-bold text-[10px]" style={{ color: statusColor }}>
            {status === "loading" ? `FETCHING ${label}…` :
             status === "paused"  ? `${label} PAUSED`    :
             status === "done"    ? `${label} DONE`       :
             status === "error"   ? `${label} ERROR`      : label}
          </span>
        </div>
        <div className="flex items-center gap-1">
          {status === "loading" && (
            <button onClick={() => loaderPause(mode)}
              className="tag text-[9px] px-1.5 py-0.5"
              style={{ border: "1px solid var(--border)", color: "var(--text-faint)" }}>
              <Pause size={9} />
            </button>
          )}
          {(status === "paused" || status === "error") && (
            <button onClick={() => loaderResume(mode)}
              className="tag text-[9px] px-1.5 py-0.5"
              style={{ border: "1px solid var(--green)", color: "var(--green)" }}>
              <Play size={9} />
            </button>
          )}
          <button onClick={() => loaderReset(mode)}
            className="tag text-[9px] px-1.5 py-0.5"
            style={{ border: "1px solid var(--border)", color: "var(--text-faint)" }}
            title="Reset">
            <X size={9} />
          </button>
        </div>
      </div>

      <div className="h-1 mb-1.5 overflow-hidden" style={{ background: "var(--border)" }}>
        <div style={{ height: "100%", width: `${pct}%`, background: statusColor, transition: "width 0.4s" }} />
      </div>

      <div className="flex items-center justify-between">
        <span className="mono text-[10px]" style={{ color: "var(--text-muted)" }}>
          {fetchedCount.toLocaleString()} trades
          {status === "loading" ? " · next page in ~3s" : ""}
        </span>
        <span className="mono text-[10px]" style={{ color: "var(--text-faint)" }}>
          {fmtElapsed(startedAt, finishedAt)}
        </span>
      </div>

      {error && (
        <div className="mt-1.5 px-2 py-1 mono text-[9px]"
          style={{ border: "1px solid var(--red)", color: "var(--red)", background: "rgba(204,46,46,0.06)" }}>
          {error}
        </div>
      )}
    </div>
  );
}

/* ─── FeesChart ──────────────────────────────────────────────────────────────── */

function FeesChart({ trades }: { trades: TradeEnriched[] }) {
  const sorted = useMemo(() => [...trades].sort((a, b) => a.ts_ms - b.ts_ms), [trades]);

  if (sorted.length < 2) {
    return (
      <div className="relative mb-6" style={{ border: "1px solid var(--border)", background: "var(--bg-surface)" }}>
        <CornerMarks size={8} inset={-1} thickness={1} opacity={0.5} />
        <div style={{ height: 2, background: "var(--accent)" }} />
        <div className="flex items-center justify-center" style={{ height: 140 }}>
          <span className="mono text-sm" style={{ color: "var(--text-faint)" }}>
            {trades.length === 0 ? "LOAD TRADES TO SEE CHART" : "NOT ENOUGH DATA"}
          </span>
        </div>
      </div>
    );
  }

  const W = 1000, H = 200;
  const pL = 56, pR = 16, pT = 18, pB = 26;
  const plotW = W - pL - pR, plotH = H - pT - pB;

  let cum = 0;
  const pts = sorted.map((t, i) => { cum += t.feeUSD; return { i, cum, ts: t.ts_ms }; });
  const maxFee = pts[pts.length - 1].cum || 1;

  const xOf = (i: number) => pL + (i / (pts.length - 1)) * plotW;
  const yOf = (v: number) => pT + plotH - (v / maxFee) * plotH;
  const line = pts.map(p => ({ x: xOf(p.i), y: yOf(p.cum), cum: p.cum, ts: p.ts }));
  const pathD = line.map((p, i) => `${i === 0 ? "M" : "L"} ${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(" ");
  const areaD = `${pathD} L ${line[line.length - 1].x.toFixed(1)} ${pT + plotH} L ${pL} ${pT + plotH} Z`;
  const yTicks = [0, 0.25, 0.5, 0.75, 1].map(f => maxFee * f);
  const xCnt = Math.min(pts.length, 6);
  const xIdxs = Array.from({ length: xCnt }, (_, i) => Math.round((i / (xCnt - 1)) * (pts.length - 1)));

  return (
    <div className="relative mb-6" style={{ border: "1px solid var(--border)", background: "var(--bg-surface)" }}>
      <CornerMarks size={8} inset={-1} thickness={1} opacity={0.5} />
      <div style={{ height: 2, background: "var(--accent)" }} />
      <div className="p-4 sm:p-5">
        <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
          <div className="flex items-center gap-2">
            <TrendingDown size={14} style={{ color: "var(--accent)" }} />
            <span className="tag" style={{ color: "var(--accent)" }}>CUMULATIVE FEES (USD)</span>
          </div>
          <span className="mono text-xs font-bold" style={{ color: "var(--text)" }}>
            {fmt(maxFee)} total
          </span>
        </div>
        <svg viewBox={`0 0 ${W} ${H}`} className="w-full" style={{ display: "block" }} preserveAspectRatio="none">
          <defs>
            <clipPath id="fc"><rect x={pL} y={pT - 2} width={plotW} height={plotH + 4} /></clipPath>
            <linearGradient id="fg" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="var(--accent)" stopOpacity="0.18" />
              <stop offset="100%" stopColor="var(--accent)" stopOpacity="0" />
            </linearGradient>
          </defs>
          {yTicks.map((v, i) => (
            <g key={i}>
              <line x1={pL} y1={yOf(v)} x2={W - pR} y2={yOf(v)} stroke="var(--border-subtle)" strokeWidth={0.5} />
              <text x={pL - 5} y={yOf(v) + 3} textAnchor="end" fontSize={9} fill="var(--text-faint)" className="mono">
                ${v >= 1000 ? `${(v / 1000).toFixed(1)}k` : v.toFixed(2)}
              </text>
            </g>
          ))}
          <g clipPath="url(#fc)">
            <path d={areaD} fill="url(#fg)" />
            <path d={pathD} fill="none" stroke="var(--accent)" strokeWidth={1.5} />
          </g>
          {xIdxs.map(idx => {
            const p = line[idx];
            return (
              <text key={idx} x={p.x} y={H - 5}
                textAnchor={idx === 0 ? "start" : idx === pts.length - 1 ? "end" : "middle"}
                fontSize={9} fill="var(--text-faint)" className="mono">
                {fmtDate(p.ts)}
              </text>
            );
          })}
        </svg>
      </div>
    </div>
  );
}

/* ─── TradeTable ─────────────────────────────────────────────────────────────── */

const COLS = "minmax(100px,1.3fr) 50px 100px 80px 90px 80px 52px 96px";

function TradeTable({
  trades, mode,
}: {
  trades: TradeEnriched[];
  mode: TradeMode;
}) {
  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useState(25);
  const totalPages = Math.ceil(trades.length / pageSize);
  const pageItems = trades.slice(page * pageSize, (page + 1) * pageSize);
  useEffect(() => { setPage(0); }, [pageSize]);

  if (trades.length === 0) {
    return (
      <div className="relative" style={{ border: "1px solid var(--border)", background: "var(--bg-surface)" }}>
        <CornerMarks size={8} inset={-1} thickness={1} opacity={0.5} />
        <div className="px-4 py-16 text-center">
          <span className="mono text-sm" style={{ color: "var(--text-faint)" }}>
            NO {mode.toUpperCase()} TRADES LOADED YET
          </span>
        </div>
      </div>
    );
  }

  return (
    <div className="relative" style={{ border: "1px solid var(--border)", background: "var(--bg-surface)" }}>
      <CornerMarks size={8} inset={-1} thickness={1} opacity={0.5} />
      <div className="overflow-x-auto">
        <div style={{ minWidth: 680 }}>
          <div className="grid items-center px-4 py-3"
            style={{ gridTemplateColumns: COLS, gap: 10, borderBottom: "1px solid var(--border)" }}>
            {["PAIR", "SIDE", "PRICE", "QTY", "VALUE", "FEE", "TYPE", "DATE"].map((h, i) => (
              <span key={h} className={`tag${i > 1 && i < 7 ? " text-right" : ""}`}
                style={{ color: "var(--text-faint)" }}>{h}</span>
            ))}
          </div>

          {pageItems.map((t, i) => (
            <div key={`${t.trade_id}-${t.ts_ms}`} className="grid items-center px-4"
              style={{
                gridTemplateColumns: COLS, gap: 10, height: 50,
                borderBottom: i < pageItems.length - 1 ? "1px solid var(--border-subtle)" : "none",
                transition: "background 0.1s",
              }}
              onMouseEnter={e => (e.currentTarget as HTMLElement).style.background = "var(--bg-elevated)"}
              onMouseLeave={e => (e.currentTarget as HTMLElement).style.background = "transparent"}>
              <div className="flex items-center gap-2 min-w-0">
                <TokenIcon symbol={t.symbolName} size={17} />
                <span className="mono text-xs font-bold truncate" style={{ color: "var(--text)" }}>{t.symbolName}</span>
              </div>
              <span className="mono text-xs font-bold"
                style={{ color: t.side === 1 ? "var(--green)" : "var(--red)" }}>
                {t.side === 1 ? "BUY" : "SELL"}
              </span>
              <span className="mono text-xs text-right tabular-nums" style={{ color: "var(--text-muted)" }}>
                ${fmtPrice(t.priceValue)}
              </span>
              <span className="mono text-xs text-right tabular-nums" style={{ color: "var(--text)" }}>
                {t.qtyValue}
              </span>
              <span className="mono text-xs text-right tabular-nums" style={{ color: "var(--text)" }}>
                {fmt(t.tradeValue)}
              </span>
              <div className="text-right leading-tight">
                <span className="mono text-xs tabular-nums block" style={{ color: "var(--text-muted)" }}>
                  {t.feeUSD > 0 ? `$${t.feeUSD < 0.01 ? t.feeUSD.toFixed(5) : t.feeUSD.toFixed(3)}` : "—"}
                </span>
                <span className="mono text-[9px] tabular-nums block" style={{ color: "var(--text-faint)", opacity: 0.7 }}>
                  {t.feeValue.toFixed(4)} {t.feeToken}
                </span>
              </div>
              <span className="mono text-[10px] font-bold"
                style={{ color: t.is_maker ? "var(--accent)" : "var(--text-faint)" }}>
                {t.is_maker ? "MAKER" : "TAKER"}
              </span>
              <span className="mono text-xs text-right tabular-nums" style={{ color: "var(--text-faint)" }}>
                {fmtDateTime(t.ts_ms)}
              </span>
            </div>
          ))}
        </div>
      </div>

      <div className="px-4 py-2.5 flex items-center justify-between flex-wrap gap-2"
        style={{ borderTop: "1px solid var(--border-subtle)" }}>
        <div className="flex items-center gap-3">
          <span className="tag" style={{ color: "var(--text-faint)" }}>
            {(page * pageSize + 1).toLocaleString()}–{Math.min((page + 1) * pageSize, trades.length).toLocaleString()} of {trades.length.toLocaleString()}
          </span>
          <div className="flex items-center gap-1">
            {[10, 25, 50, 100].map(sz => (
              <button key={sz} onClick={() => setPageSize(sz)} className="tag px-2 py-0.5 transition-colors"
                style={{
                  border: `1px solid ${pageSize === sz ? "var(--accent)" : "var(--border)"}`,
                  color: pageSize === sz ? "var(--accent)" : "var(--text-faint)",
                }}>{sz}</button>
            ))}
          </div>
        </div>
        {totalPages > 1 && (
          <div className="flex items-center gap-1">
            <button onClick={() => setPage(p => Math.max(0, p - 1))} disabled={page === 0}
              className="flex items-center justify-center w-7 h-7 disabled:opacity-30"
              style={{ border: "1px solid var(--border)", color: "var(--text-muted)" }}>
              <ChevronLeft size={14} />
            </button>
            <span className="tag px-2" style={{ color: "var(--text-faint)" }}>{page + 1}/{totalPages}</span>
            <button onClick={() => setPage(p => Math.min(totalPages - 1, p + 1))} disabled={page === totalPages - 1}
              className="flex items-center justify-center w-7 h-7 disabled:opacity-30"
              style={{ border: "1px solid var(--border)", color: "var(--text-muted)" }}>
              <ChevronRight size={14} />
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

/* ─── SearchHero ─────────────────────────────────────────────────────────────── */

const GHOST_COLS = "minmax(90px,1.3fr) 48px 96px 72px 84px 72px 52px 88px";

const GHOST_ROWS = [
  { side: 1, sym: "BTC/USD",  px: "$64,203", qty: "0.142", val: "$9,117", fee: "$0.91", type: "MAKER", date: "Jun 15" },
  { side: 2, sym: "ETH/USD",  px: "$3,412",  qty: "1.500", val: "$5,118", fee: "$0.52", type: "TAKER", date: "Jun 15" },
  { side: 1, sym: "SOL/USD",  px: "$148.20", qty: "12.00", val: "$1,778", fee: "$0.18", type: "MAKER", date: "Jun 14" },
  { side: 2, sym: "XRP/USD",  px: "$0.614",  qty: "500.0", val: "$307",   fee: "$0.03", type: "TAKER", date: "Jun 14" },
  { side: 1, sym: "LINK/USD", px: "$15.24",  qty: "30.00", val: "$457",   fee: "$0.05", type: "MAKER", date: "Jun 13" },
  { side: 2, sym: "OP/USD",   px: "$2.410",  qty: "85.00", val: "$205",   fee: "$0.02", type: "TAKER", date: "Jun 13" },
  { side: 1, sym: "ARB/USD",  px: "$1.230",  qty: "200.0", val: "$246",   fee: "$0.02", type: "MAKER", date: "Jun 12" },
  { side: 2, sym: "DOGE/USD", px: "$0.123",  qty: "1,000", val: "$123",   fee: "$0.01", type: "TAKER", date: "Jun 12" },
  { side: 1, sym: "AVAX/USD", px: "$28.50",  qty: "8.000", val: "$228",   fee: "$0.02", type: "MAKER", date: "Jun 11" },
  { side: 2, sym: "BNB/USD",  px: "$321.0",  qty: "3.000", val: "$963",   fee: "$0.10", type: "TAKER", date: "Jun 11" },
];

function SearchHero({ input, setInput, onSearch, pending, focused, setFocused, inputRef, error }: {
  input: string; setInput: (v: string) => void; onSearch: () => void; pending: boolean;
  focused: boolean; setFocused: (v: boolean) => void;
  inputRef: RefObject<HTMLInputElement | null>; error: string | null;
}) {
  return (
    <div className="relative flex flex-col items-center justify-center text-center px-5 overflow-hidden"
      style={{ minHeight: 520 }}>

      {/* Ghost trade table — decorative background */}
      <div className="absolute inset-0 pointer-events-none select-none overflow-hidden"
        style={{
          maskImage: "radial-gradient(ellipse 85% 75% at 50% 50%, transparent 28%, black 68%)",
          WebkitMaskImage: "radial-gradient(ellipse 85% 75% at 50% 50%, transparent 28%, black 68%)",
        }}>
        <div style={{ opacity: 0.13, minWidth: 680, margin: "0 auto", paddingTop: 24 }}>
          {/* Header */}
          <div className="grid items-center px-6 py-2.5"
            style={{ gridTemplateColumns: GHOST_COLS, gap: 10, borderBottom: "1px solid var(--border)" }}>
            {["PAIR","SIDE","PRICE","QTY","VALUE","FEE","TYPE","DATE"].map(h => (
              <span key={h} className="tag text-[9px]" style={{ color: "var(--text-faint)" }}>{h}</span>
            ))}
          </div>
          {/* Rows */}
          {GHOST_ROWS.map((r, i) => (
            <div key={i} className="grid items-center px-6"
              style={{
                gridTemplateColumns: GHOST_COLS, gap: 10, height: 44,
                borderBottom: "1px solid var(--border-subtle)",
              }}>
              <span className="mono text-xs font-bold" style={{ color: "var(--text)" }}>{r.sym}</span>
              <span className="mono text-xs font-bold"
                style={{ color: r.side === 1 ? "var(--green)" : "var(--red)" }}>
                {r.side === 1 ? "BUY" : "SELL"}
              </span>
              <span className="mono text-xs text-right tabular-nums" style={{ color: "var(--text-muted)" }}>{r.px}</span>
              <span className="mono text-xs text-right tabular-nums" style={{ color: "var(--text)" }}>{r.qty}</span>
              <span className="mono text-xs text-right tabular-nums" style={{ color: "var(--text)" }}>{r.val}</span>
              <span className="mono text-xs text-right tabular-nums" style={{ color: "var(--text-faint)" }}>{r.fee}</span>
              <span className="mono text-[10px] font-bold"
                style={{ color: r.type === "MAKER" ? "var(--accent)" : "var(--text-faint)" }}>{r.type}</span>
              <span className="mono text-xs text-right" style={{ color: "var(--text-faint)" }}>{r.date}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Foreground content */}
      <div className="relative z-10 flex flex-col items-center w-full max-w-[560px] py-16">
        {/* Feature pills */}
        <div className="flex flex-wrap items-center justify-center gap-2 mb-8">
          {[
            { label: "PERPS",      color: "var(--accent)"     },
            { label: "SPOT",       color: "var(--accent)"     },
            { label: "FEES",       color: "var(--green)"      },
            { label: "CSV EXPORT", color: "var(--text-faint)" },
          ].map(f => (
            <span key={f.label} className="tag text-[10px] px-2.5 py-1 font-bold"
              style={{ border: `1px solid ${f.color}`, color: f.color, opacity: f.color === "var(--text-faint)" ? 0.5 : 1 }}>
              {f.label}
            </span>
          ))}
        </div>

        <h1 className="text-[36px] sm:text-[52px] font-bold leading-none tracking-tight mb-4"
          style={{ color: "var(--text)", letterSpacing: "-0.025em" }}>
          Trade History
        </h1>
        <p className="text-sm mb-8 max-w-sm" style={{ color: "var(--text-muted)" }}>
          Enter a wallet address to load its full fill history — perps and spot — with fees in USD
          and CSV export.
        </p>

        {/* Search bar */}
        <div className="w-full">
          <div className="relative flex items-center" style={{
            border: `1px solid ${focused ? "var(--accent)" : "var(--border)"}`,
            background: "var(--bg-surface)",
            boxShadow: focused ? "0 0 0 1px var(--accent), 0 0 40px var(--accent-dim)" : "none",
            transition: "border-color 0.15s, box-shadow 0.15s",
          }}>
            {focused && <CornerMarks size={8} inset={-1} thickness={1.5} />}
            <Search size={16} className="absolute left-4 pointer-events-none" style={{ color: "var(--text-faint)" }} />
            <input ref={inputRef} type="text" value={input} onChange={e => setInput(e.target.value)}
              onFocus={() => setFocused(true)} onBlur={() => setFocused(false)}
              onKeyDown={e => e.key === "Enter" && onSearch()}
              placeholder="Wallet address  e.g. 0x0879A87D…"
              className="w-full bg-transparent outline-none mono text-sm py-4 pl-11 pr-28"
              style={{ color: "var(--text)", caretColor: "var(--accent)" }}
              spellCheck={false} autoComplete="off" />
            {input && (
              <button onClick={() => setInput("")}
                className="absolute right-[92px] opacity-50 hover:opacity-100 transition-opacity"
                style={{ color: "var(--text-faint)" }}>
                <X size={14} />
              </button>
            )}
            <button onClick={onSearch} disabled={pending || !input.trim()}
              className="absolute right-2 px-4 py-2 tag font-bold transition-opacity disabled:opacity-40"
              style={{ background: "var(--accent)", color: "var(--accent-fg)" }}>
              {pending ? "…" : "SEARCH"}
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

/* ─── Main Component ─────────────────────────────────────────────────────────── */

export function TradeHistoryPage() {
  const [searchInput, setSearchInput] = useState("");
  const [searchPending, setSearchPending] = useState(false);
  const [searchFocused, setSearchFocused] = useState(false);
  const [initError, setInitError] = useState<string | null>(null);
  const [walletAddress, setWalletAddress] = useState<string | null>(null);
  const [accountId, setAccountId] = useState<number | null>(null);
  const [symbolMaps, setSymbolMaps] = useState<Record<TradeMode, Map<number, string>>>({
    perps: new Map(), spot: new Map(),
  });
  const [tokenPrices, setTokenPrices] = useState<Map<string, number>>(new Map([
    ["USD", 1], ["USDC", 1], ["USDT", 1],
  ]));
  const [mode, setMode] = useState<TradeMode>("perps");

  // Sync module-level loader state into React
  const [perpsState, setPerpsState] = useState<LoaderState>(() => ({ ..._state.perps }));
  const [spotState, setSpotState] = useState<LoaderState>(() => ({ ..._state.spot }));

  const searchRef = useRef<HTMLInputElement>(null);
  const copyState = useCopy();

  useEffect(() => {
    const u1 = loaderSubscribe("perps", s => setPerpsState({ ...s }));
    const u2 = loaderSubscribe("spot", s => setSpotState({ ...s }));
    return () => { u1(); u2(); };
  }, []);

  const activeState = mode === "perps" ? perpsState : spotState;

  // Enrich raw trades at render time
  const perpsEnriched = useMemo(
    () => enrich(perpsState.trades, symbolMaps.perps, "perps", tokenPrices),
    [perpsState.trades, symbolMaps.perps, tokenPrices],
  );
  const spotEnriched = useMemo(
    () => enrich(spotState.trades, symbolMaps.spot, "spot", tokenPrices),
    [spotState.trades, symbolMaps.spot, tokenPrices],
  );
  const trades = mode === "perps" ? perpsEnriched : spotEnriched;

  const handleSearch = async () => {
    const addr = searchInput.trim();
    if (!addr) return;
    setSearchPending(true);
    setInitError(null);
    try {
      const acctId = await resolveAccountId(addr);
      if (!acctId) throw new Error("Address not found on SoDEX");

      // Reset any running loaders for a different account
      loaderReset("perps");
      loaderReset("spot");

      const [pMap, sMap, prices] = await Promise.all([
        fetchSymbolMap("perps"), fetchSymbolMap("spot"), fetchTokenPrices(),
      ]);
      setSymbolMaps({ perps: pMap, spot: sMap });
      setTokenPrices(prices);
      setWalletAddress(addr);
      setAccountId(acctId);
    } catch (e) {
      setInitError(e instanceof Error ? e.message : "Failed to look up address.");
    } finally {
      setSearchPending(false);
    }
  };

  const handleReset = () => {
    loaderReset("perps");
    loaderReset("spot");
    setWalletAddress(null);
    setAccountId(null);
    setSearchInput("");
    setInitError(null);
    setTimeout(() => searchRef.current?.focus(), 80);
  };

  const handleCSV = () => {
    if (!walletAddress || !trades.length) return;
    const headers = ["Trade ID", "Symbol", "Side", "Price", "Quantity", "Value (USD)", "Fee", "Fee Token", "Fee (USD)", "Maker", "Date"];
    const rows = trades.map(t => [
      t.trade_id, t.symbolName, t.side === 1 ? "BUY" : "SELL",
      t.priceValue, t.qtyValue, t.tradeValue.toFixed(4),
      t.feeValue.toFixed(6), t.feeToken, t.feeUSD.toFixed(6),
      t.is_maker ? "YES" : "NO", fmtDate(t.ts_ms),
    ]);
    downloadCSV(headers, rows, `sodex-${mode}-${shortAddr(walletAddress)}.csv`);
  };

  // Stats for current mode
  const stats = useMemo(() => {
    if (!trades.length) return null;
    const totalVol = trades.reduce((s, t) => s + t.tradeValue, 0);
    const totalFeesUSD = trades.reduce((s, t) => s + t.feeUSD, 0);
    const buys = trades.filter(t => t.side === 1).length;
    const makers = trades.filter(t => t.is_maker).length;
    const partial = activeState.status !== "done";
    const p = partial ? " (SO FAR)" : "";
    return { partial, items: [
      { label: "TRADES" + p,       value: trades.length.toLocaleString() },
      { label: "VOLUME" + p,       value: fmt(totalVol) },
      { label: "FEES (USD)" + p,   value: fmt(totalFeesUSD) },
      { label: "MAKER RATE",       value: `${((makers / trades.length) * 100).toFixed(1)}%` },
      { label: "BUY / SELL",       value: `${buys} / ${trades.length - buys}` },
    ]};
  }, [trades, activeState.status]);

  useEffect(() => {
    if (!walletAddress) searchRef.current?.focus();
  }, [walletAddress]);

  /* ── Search view ── */
  if (!walletAddress) {
    return (
      <div className="min-h-screen pt-[72px] pb-20" style={{ background: "var(--bg)" }}>
        <div className="max-w-[1100px] mx-auto">
          <SearchHero
            input={searchInput} setInput={setSearchInput} onSearch={handleSearch}
            pending={searchPending} focused={searchFocused} setFocused={setSearchFocused}
            inputRef={searchRef} error={initError}
          />
        </div>
      </div>
    );
  }

  /* ── Results view ── */
  return (
    <div className="min-h-screen pt-[72px] pb-20" style={{ background: "var(--bg)" }}>
      <div className="max-w-[1100px] mx-auto px-4 sm:px-5">

        {/* Profile header */}
        <div className="mb-6 pt-6">
          <div className="flex items-start justify-between flex-wrap gap-4">
            <div className="flex items-center gap-4">
              <div className="relative flex items-center justify-center shrink-0"
                style={{ width: 50, height: 50, background: "var(--bg-surface)", border: "1px solid var(--accent)" }}>
                <CornerMarks size={7} inset={-1} thickness={1.5} />
                <Wallet size={19} style={{ color: "var(--accent)" }} />
              </div>
              <div>
                <div className="flex items-center gap-2 mb-1">
                  <span className="w-4 h-px" style={{ background: "var(--accent)" }} />
                  <span className="tag" style={{ color: "var(--accent)" }}>TRADE HISTORY</span>
                </div>
                <button onClick={() => copyState.copy(walletAddress!)} className="group flex items-center gap-2 mb-0.5">
                  <span className="mono text-sm sm:text-base font-bold" style={{ color: "var(--text)" }}>
                    {shortAddr(walletAddress!)}
                  </span>
                  {copyState.copied === walletAddress
                    ? <Check size={13} style={{ color: "var(--accent)" }} />
                    : <Copy size={13} className="opacity-40 group-hover:opacity-80 transition-opacity" style={{ color: "var(--text-faint)" }} />}
                </button>
                <span className="tag" style={{ color: "var(--text-faint)" }}>
                  Account #{accountId}
                </span>
              </div>
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              {trades.length > 0 && (
                <button onClick={handleCSV}
                  className="flex items-center gap-1.5 px-3 py-1.5 tag transition-colors"
                  style={{ border: "1px solid var(--border)", color: "var(--text-muted)" }}
                  onMouseEnter={e => { const el = e.currentTarget as HTMLElement; el.style.borderColor = "var(--accent)"; el.style.color = "var(--accent)"; }}
                  onMouseLeave={e => { const el = e.currentTarget as HTMLElement; el.style.borderColor = "var(--border)"; el.style.color = "var(--text-muted)"; }}>
                  <Download size={11} />
                  EXPORT CSV ({trades.length.toLocaleString()})
                  {activeState.status !== "done" && " ·partial"}
                </button>
              )}
              <a href={`https://explorer.sodex.dev/address/${walletAddress}`}
                target="_blank" rel="noopener noreferrer"
                className="flex items-center gap-1.5 px-3 py-1.5 tag transition-colors"
                style={{ border: "1px solid var(--border)", color: "var(--text-muted)" }}
                onMouseEnter={e => { const el = e.currentTarget as HTMLElement; el.style.borderColor = "var(--accent)"; el.style.color = "var(--accent)"; }}
                onMouseLeave={e => { const el = e.currentTarget as HTMLElement; el.style.borderColor = "var(--border)"; el.style.color = "var(--text-muted)"; }}>
                <ExternalLink size={11} /> EXPLORER
              </a>
              <button onClick={handleReset}
                className="flex items-center justify-center w-8 h-8 transition-colors"
                style={{ border: "1px solid var(--border)", color: "var(--text-faint)" }}
                onMouseEnter={e => { const el = e.currentTarget as HTMLElement; el.style.borderColor = "var(--red)"; el.style.color = "var(--red)"; }}
                onMouseLeave={e => { const el = e.currentTarget as HTMLElement; el.style.borderColor = "var(--border)"; el.style.color = "var(--text-faint)"; }}
                title="New search">
                <X size={14} />
              </button>
            </div>
          </div>
        </div>

        {/* Loader panels — one per mode, side by side */}
        <div className="flex gap-3 mb-6">
          <LoaderPanel
            mode="perps" state={perpsState}
            accountId={accountId!} symbolMap={symbolMaps.perps}
            onStart={() => loaderStart("perps", accountId!, symbolMaps.perps)}
          />
          <LoaderPanel
            mode="spot" state={spotState}
            accountId={accountId!} symbolMap={symbolMaps.spot}
            onStart={() => loaderStart("spot", accountId!, symbolMaps.spot)}
          />
        </div>

        {/* Rate limit notice (shown while any loader is running) */}
        {(perpsState.status === "loading" || spotState.status === "loading") && (
          <div className="mb-4 flex items-center gap-2 px-3 py-2"
            style={{ border: "1px solid var(--border)", background: "var(--bg-surface)" }}>
            <AlertCircle size={12} style={{ color: "var(--accent)" }} />
            <span className="mono text-xs" style={{ color: "var(--text-muted)" }}>
              Fetching trades — 3-second delay between pages to respect API rate limits.
            </span>
          </div>
        )}

        {/* Mode toggle */}
        <div className="flex items-center gap-2 mb-5">
          {(["perps", "spot"] as TradeMode[]).map(m => {
            const s = m === "perps" ? perpsState : spotState;
            const cnt = s.trades.length;
            return (
              <button key={m} onClick={() => setMode(m)}
                className="flex items-center gap-2 px-4 py-2 tag font-bold transition-colors"
                style={{
                  border: `1px solid ${mode === m ? "var(--accent)" : "var(--border)"}`,
                  color: mode === m ? "var(--accent)" : "var(--text-muted)",
                  background: mode === m ? "var(--accent-dim)" : "transparent",
                }}>
                {m.toUpperCase()}
                {cnt > 0 && (
                  <span className="mono text-[10px] font-bold px-1.5 py-0.5"
                    style={{
                      background: mode === m ? "var(--accent)" : "var(--bg-elevated)",
                      color: mode === m ? "var(--accent-fg)" : "var(--text-faint)",
                    }}>
                    {cnt.toLocaleString()}
                    {s.status !== "done" && s.status !== "idle" ? "…" : ""}
                  </span>
                )}
              </button>
            );
          })}
        </div>

        {/* Incomplete data warning */}
        {stats?.partial && (
          <div className="mb-4 flex items-center gap-2 px-3 py-2"
            style={{ border: "1px solid var(--accent)", background: "var(--accent-dim)" }}>
            <Loader2 size={12} className="animate-spin" style={{ color: "var(--accent)" }} />
            <span className="mono text-xs" style={{ color: "var(--accent)" }}>
              Stats and fees are partial — loading is still in progress.
            </span>
          </div>
        )}

        {/* Stats */}
        {stats && (
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 sm:gap-3 mb-6">
            {stats.items.map(s => (
              <div key={s.label} className="p-3 sm:p-4"
                style={{ border: "1px solid var(--border)", background: "var(--bg-surface)" }}>
                <div className="tag mb-1.5 text-[9px] sm:text-[10px]" style={{ color: "var(--text-faint)" }}>{s.label}</div>
                <div className="mono text-sm sm:text-base font-bold tabular-nums" style={{ color: "var(--text)" }}>{s.value}</div>
              </div>
            ))}
          </div>
        )}

        {/* Fees chart */}
        <FeesChart trades={trades} />

        {/* Table */}
        <TradeTable trades={trades} mode={mode} />

      </div>
    </div>
  );
}
