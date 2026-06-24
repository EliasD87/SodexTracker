"use client";

import { useState, useRef, useCallback, useEffect, useMemo } from "react";
import { CornerMarks } from "@/components/CornerMarks";
import { TokenIcon } from "@/components/TokenIcon";
import {
  Search, X, Copy, Check, RefreshCw, ExternalLink,
  ChevronLeft, ChevronRight, TrendingUp, History, Wallet, Download,
  Pause, Play, AlertCircle, Loader2,
} from "lucide-react";
import { exportManager, estimateTime, downloadCSV, type ExportState } from "@/components/ExportManager";

/* Types */
interface AccountStateData { user: string; aid: number; uid: number; }

interface PositionRaw {
  account_id: number; position_id: number; user_id: number; symbol_id: number;
  margin_mode: number; position_side: number; size: string; initial_margin: string;
  avg_entry_price: string; cum_open_cost: string; cum_trading_fee: string;
  cum_closed_size: string; avg_close_price: string; max_size: string;
  realized_pnl: string; frozen_size: string; leverage: number;
  take_over_price: string; created_at: number; updated_at: number; funding_fee: string;
}

interface PositionEnriched extends PositionRaw {
  symbolName: string; realizedPnlValue: number; pnlPercent: number;
  closedSize: number; entryPrice: number; closePrice: number;
  tradingFee: number; fundingFee: number; date: number;
}

interface SpotTradeRaw {
  account_id: number; symbol_id: number; trade_id: number; side: number;
  user_id: number; order_id: number; price: string; quantity: string;
  fee: string; ts_ms: number; is_maker: boolean;
}

interface SpotTradeEnriched extends SpotTradeRaw {
  symbolName: string; priceValue: number; qtyValue: number;
  feeValue: number; value: number; sideLabel: string; date: number;
}

interface PositionsResponse { code: number; data: PositionRaw[]; meta?: { next_cursor?: string }; }

/* Constants */
const GW_BASE = "https://mainnet-gw.sodex.dev/api/v1";
const DATA_BASE = "https://mainnet-data.sodex.dev/api/v1";

/* Helpers */
function fmt(n: number, dp = 2): string {
  const abs = Math.abs(n); const sign = n < 0 ? "-" : "";
  if (abs >= 1_000_000) return `${sign}$${(abs / 1_000_000).toFixed(dp)}M`;
  if (abs >= 1_000) return `${sign}$${(abs / 1_000).toFixed(dp)}K`;
  return `${sign}$${abs.toFixed(dp)}`;
}
function fmtDate(ts: number): string {
  return new Date(ts).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });
}
function shortAddr(a: string): string { return a.slice(0, 8) + "…" + a.slice(-6); }
function sideLabel(s: number): string { return s === 1 ? "LONG" : "SHORT"; }
function marginLabel(m: number): string { return m === 1 ? "ISOLATED" : "CROSS"; }
function tradeSide(s: number): string { return s === 1 ? "BUY" : "SELL"; }

function useCopy() {
  const [copied, setCopied] = useState<string | null>(null);
  const copy = useCallback((text: string) => {
    navigator.clipboard?.writeText(text).then(() => { setCopied(text); setTimeout(() => setCopied(null), 1500); });
  }, []);
  return { copied, copy };
}

/* API */
async function apiFetch<T>(url: string, retries = 2): Promise<T> {
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const res = await fetch(url);
      if (res.status === 429) { if (attempt < retries) { await new Promise(r => setTimeout(r, 500 * (attempt + 1))); continue; } }
      const json = await res.json();
      if (json.code !== 0) throw new Error(json.message || "API error");
      return json.data as T;
    } catch (err) {
      if (attempt < retries) { await new Promise(r => setTimeout(r, 300 * (attempt + 1))); continue; }
      throw err;
    }
  }
  throw new Error("API error: max retries exceeded");
}

function fetchPerpsAccountState(addr: string) { return apiFetch<AccountStateData>(`${GW_BASE}/perps/accounts/${addr}/state`); }
function fetchSpotAccountState(addr: string) { return apiFetch<AccountStateData>(`${GW_BASE}/spot/accounts/${addr}/state`); }

async function fetchPerpsSymbols() {
  const data = await apiFetch<Array<{ id: number; name: string; displayName: string }>>(`${GW_BASE}/perps/markets/symbols`);
  const m = new Map<number, string>(); for (const s of data) m.set(s.id, s.displayName || s.name); return m;
}
async function fetchSpotSymbols() {
  const data = await apiFetch<Array<{ id: number; name: string; displayName: string }>>(`${GW_BASE}/spot/markets/symbols`);
  const m = new Map<number, string>(); for (const s of data) m.set(s.id, s.displayName || s.name); return m;
}

interface SpotTradesResponse { code: number; data: SpotTradeRaw[]; meta?: { next_cursor?: string }; }

async function fetchPositionsPage(accountId: number, cursor?: string, limit = 1000): Promise<PositionsResponse> {
  const params = new URLSearchParams({ account_id: String(accountId), limit: String(limit) });
  if (cursor) params.set("cursor", cursor);
  const res = await fetch(`/api/perps/positions?${params.toString()}`);
  return res.json();
}

async function fetchSpotTradesPage(accountId: number, cursor?: string, limit = 1000): Promise<SpotTradesResponse> {
  const params = new URLSearchParams({ account_id: String(accountId), limit: String(limit) });
  if (cursor) params.set("cursor", cursor);
  const res = await fetch(`/api/spot/trades?${params.toString()}`);
  return res.json();
}

/* Enrichment */
function enrichPositions(positions: PositionRaw[], symbolMap: Map<number, string>): PositionEnriched[] {
  return positions.filter(p => {
    const cs = parseFloat(p.cum_closed_size || "0"); const cp = parseFloat(p.avg_close_price || "0");
    return cs > 0 && cp > 0;
  }).map(p => {
    const realizedPnlValue = parseFloat(p.realized_pnl || "0");
    const entryPrice = parseFloat(p.avg_entry_price || "0");
    const closedSize = parseFloat(p.cum_closed_size || "0");
    const closePrice = parseFloat(p.avg_close_price || "0");
    const tradingFee = parseFloat(p.cum_trading_fee || "0");
    const fundingFee = parseFloat(p.funding_fee || "0");
    const pnlPercent = entryPrice > 0 && closedSize > 0 ? (realizedPnlValue / (entryPrice * closedSize)) * 100 : 0;
    return { ...p, symbolName: symbolMap.get(p.symbol_id) || `Sym-${p.symbol_id}`, realizedPnlValue, pnlPercent, closedSize, entryPrice, closePrice, tradingFee, fundingFee, date: p.updated_at || p.created_at };
  });
}

function enrichSpotTrades(trades: SpotTradeRaw[], symbolMap: Map<number, string>): SpotTradeEnriched[] {
  return trades.map(t => {
    const priceValue = parseFloat(t.price || "0");
    const qtyValue = parseFloat(t.quantity || "0");
    const feeValue = parseFloat(t.fee || "0");
    return { ...t, symbolName: symbolMap.get(t.symbol_id) || `Sym-${t.symbol_id}`, priceValue, qtyValue, feeValue, value: priceValue * qtyValue, sideLabel: tradeSide(t.side), date: t.ts_ms };
  });
}

/* CSV Export */
function exportPerpsCSV(positions: PositionEnriched[], addr: string) {
  const headers = ["Position ID", "Symbol", "Side", "Margin Mode", "Entry Price", "Close Price", "Closed Size", "Leverage", "Trading Fee", "Funding Fee", "Realized PnL", "PnL %", "Date"];
  const rows = positions.map(p => [
    p.position_id, p.symbolName, sideLabel(p.position_side), marginLabel(p.margin_mode),
    p.entryPrice, p.closePrice, p.closedSize, `${p.leverage}x`,
    p.tradingFee.toFixed(4), p.fundingFee.toFixed(4),
    p.realizedPnlValue.toFixed(4), p.pnlPercent.toFixed(2),
    fmtDate(p.date),
  ]);
  const csv = [headers.join(","), ...rows.map(r => r.join(","))].join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a"); a.href = url; a.download = `sodex-perps-${shortAddr(addr)}.csv`;
  document.body.appendChild(a); a.click(); document.body.removeChild(a); URL.revokeObjectURL(url);
}

function exportSpotCSV(trades: SpotTradeEnriched[], addr: string) {
  const headers = ["Trade ID", "Symbol", "Side", "Price", "Quantity", "Value (USD)", "Fee", "Maker", "Date"];
  const rows = trades.map(t => [
    t.trade_id, t.symbolName, t.sideLabel, t.priceValue, t.qtyValue,
    t.value.toFixed(4), t.feeValue.toFixed(4), t.is_maker ? "YES" : "NO",
    fmtDate(t.date),
  ]);
  const csv = [headers.join(","), ...rows.map(r => r.join(","))].join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a"); a.href = url; a.download = `sodex-spot-${shortAddr(addr)}.csv`;
  document.body.appendChild(a); a.click(); document.body.removeChild(a); URL.revokeObjectURL(url);
}

/* Export Panel */
function ExportPanel({ exportState, onStart, onResume, onPause, onDownload, onReset }: {
  exportState: ExportState;
  onStart: () => void;
  onResume: () => void;
  onPause: () => void;
  onDownload: () => void;
  onReset: () => void;
}) {
  const { status, mode, fetchedCount, error, startedAt, finishedAt } = exportState;
  const [showNotice, setShowNotice] = useState(false);

  if (status === "idle") {
    return (
      <div className="mb-6">
        <button
          onClick={() => setShowNotice(true)}
          className="flex items-center gap-1.5 px-3 py-1.5 tag transition-colors"
          style={{ border: "1px solid var(--border)", color: "var(--text-muted)" }}
          onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.borderColor = "var(--accent)"; (e.currentTarget as HTMLElement).style.color = "var(--accent)"; }}
          onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.borderColor = "var(--border)"; (e.currentTarget as HTMLElement).style.color = "var(--text-muted)"; }}
        >
          <Download size={11} /> EXPORT ALL ({mode === "futures" ? "FUTURES" : "SPOT"})
        </button>
        {showNotice && (
          <div className="mt-3 p-4" style={{ border: "1px solid var(--accent)", background: "var(--accent-dim)" }}>
            <div className="flex items-start justify-between gap-3 mb-3">
              <div className="flex items-center gap-2">
                <AlertCircle size={14} style={{ color: "var(--accent)" }} />
                <span className="tag font-bold" style={{ color: "var(--accent)" }}>RATE LIMIT NOTICE</span>
              </div>
              <button onClick={() => setShowNotice(false)} style={{ color: "var(--text-faint)" }}><X size={14} /></button>
            </div>
            <p className="text-xs mb-3" style={{ color: "var(--text-muted)" }}>
              SoDEX API has strict rate limits. We fetch 1,000 records per page with a 3-second delay
              between requests. For accounts with hundreds of thousands of trades, this can take several
              minutes. Please do not close this tab once the export starts. You can browse other dashboard
              sections while the export continues in the background.
            </p>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-4">
              {[
                { n: "1,000", t: "~3 seconds" },
                { n: "10,000", t: "~30 seconds" },
                { n: "100,000", t: "~5 minutes" },
                { n: "1,000,000", t: "~50 minutes" },
              ].map((e) => (
                <div key={e.n} className="p-2" style={{ border: "1px solid var(--border)", background: "var(--bg-surface)" }}>
                  <div className="tag" style={{ color: "var(--text-faint)" }}>{e.n} trades</div>
                  <div className="mono text-xs" style={{ color: "var(--text-muted)" }}>{e.t}</div>
                </div>
              ))}
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => { setShowNotice(false); onStart(); }}
                className="flex items-center gap-1.5 px-4 py-2 tag font-bold"
                style={{ background: "var(--accent)", color: "var(--accent-fg)" }}
              >
                <Download size={12} /> START EXPORT
              </button>
              <button
                onClick={() => setShowNotice(false)}
                className="flex items-center gap-1.5 px-3 py-2 tag transition-colors"
                style={{ border: "1px solid var(--border)", color: "var(--text-muted)" }}
              >
                CANCEL
              </button>
            </div>
          </div>
        )}
      </div>
    );
  }

  const elapsed = startedAt ? Math.floor(((finishedAt ?? Date.now()) - startedAt) / 1000) : 0;
  const elapsedStr = elapsed >= 3600
    ? `${Math.floor(elapsed / 3600)}h ${Math.floor((elapsed % 3600) / 60)}m`
    : elapsed >= 60
    ? `${Math.floor(elapsed / 60)}m ${elapsed % 60}s`
    : `${elapsed}s`;

  const statusColor =
    status === "done" ? "var(--cal-green)" :
    status === "error" ? "var(--cal-red)" :
    status === "paused" ? "var(--text-faint)" :
    "var(--accent)";

  const statusLabel =
    status === "running" ? "FETCHING…" :
    status === "paused" ? "PAUSED" :
    status === "done" ? "COMPLETE" :
    status === "error" ? "ERROR" : "IDLE";

  return (
    <div className="mb-6 p-4" style={{ border: `1px solid ${statusColor}`, background: "var(--bg-surface)" }}>
      <CornerMarks size={8} inset={-1} thickness={1} opacity={0.5} />
      <div className="flex items-center justify-between flex-wrap gap-3 mb-3">
        <div className="flex items-center gap-2">
          {status === "running" && <Loader2 size={14} className="animate-spin" style={{ color: statusColor }} />}
          {status === "paused" && <Pause size={14} style={{ color: statusColor }} />}
          {status === "done" && <Check size={14} style={{ color: statusColor }} />}
          {status === "error" && <AlertCircle size={14} style={{ color: statusColor }} />}
          <span className="tag font-bold" style={{ color: statusColor }}>{statusLabel}</span>
          <span className="tag" style={{ color: "var(--text-faint)" }}>·</span>
          <span className="tag" style={{ color: "var(--text-faint)" }}>{mode === "futures" ? "FUTURES" : "SPOT"}</span>
        </div>
        <div className="flex items-center gap-2">
          {status === "running" && (
            <button onClick={onPause} className="flex items-center gap-1.5 px-2.5 py-1 tag transition-colors" style={{ border: "1px solid var(--border)", color: "var(--text-muted)" }}>
              <Pause size={11} /> PAUSE
            </button>
          )}
          {(status === "paused" || status === "error") && (
            <button onClick={onResume} className="flex items-center gap-1.5 px-2.5 py-1 tag transition-colors" style={{ border: "1px solid var(--border)", color: "var(--text-muted)" }}
              onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.borderColor = "var(--cal-green)"; (e.currentTarget as HTMLElement).style.color = "var(--cal-green)"; }}
              onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.borderColor = "var(--border)"; (e.currentTarget as HTMLElement).style.color = "var(--text-muted)"; }}>
              <Play size={11} /> RESUME
            </button>
          )}
          {status === "done" && (
            <button onClick={onDownload} className="flex items-center gap-1.5 px-2.5 py-1 tag font-bold" style={{ background: "var(--cal-green)", color: "var(--bg)" }}>
              <Download size={11} /> DOWNLOAD CSV
            </button>
          )}
          <button onClick={onReset} className="flex items-center justify-center w-7 h-7 transition-colors" style={{ border: "1px solid var(--border)", color: "var(--text-faint)" }}
            onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.borderColor = "var(--cal-red)"; (e.currentTarget as HTMLElement).style.color = "var(--cal-red)"; }}
            onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.borderColor = "var(--border)"; (e.currentTarget as HTMLElement).style.color = "var(--text-faint)"; }}
            title="Dismiss">
            <X size={12} />
          </button>
        </div>
      </div>

      {/* Progress bar */}
      <div className="relative mb-2" style={{ height: 4, background: "var(--border)", overflow: "hidden" }}>
        <div style={{
          position: "absolute", top: 0, left: 0, bottom: 0,
          width: status === "done" ? "100%" : `${Math.min((fetchedCount % 1000) / 1000 * 100, 100)}%`,
          background: statusColor,
          transition: "width 0.3s",
        }} />
      </div>

      <div className="flex items-center justify-between flex-wrap gap-2">
        <span className="mono text-xs" style={{ color: "var(--text-muted)" }}>
          {fetchedCount.toLocaleString()} {mode === "futures" ? "positions" : "trades"} fetched
          {status === "running" && " · next request in 3s"}
        </span>
        <span className="mono text-xs" style={{ color: "var(--text-faint)" }}>
          Elapsed: {elapsedStr}
          {status === "done" && ` · ${fetchedCount.toLocaleString()} total`}
        </span>
      </div>

      {error && (
        <div className="mt-2 flex items-center gap-2 px-3 py-2" style={{ border: "1px solid var(--cal-red)", background: "rgba(204,46,46,0.06)" }}>
          <AlertCircle size={12} style={{ color: "var(--cal-red)" }} />
          <span className="mono text-xs font-bold" style={{ color: "var(--cal-red)" }}>{error}</span>
        </div>
      )}
    </div>
  );
}

/* PnL Chart */
function PnlChart({ points, mode }: { points: { date: number; pnl: number }[]; mode: "futures" | "spot" }) {
  if (points.length < 2) {
    return (
      <div className="relative" style={{ border: "1px solid var(--border)", background: "var(--bg-surface)" }}>
        <CornerMarks size={8} inset={-1} thickness={1} opacity={0.5} />
        <div style={{ height: 2, background: "var(--accent)" }} />
        <div className="p-5 flex items-center justify-center" style={{ height: 200 }}>
          <span className="mono text-sm" style={{ color: "var(--text-faint)" }}>NOT ENOUGH DATA FOR CHART</span>
        </div>
      </div>
    );
  }

  const W = 1000, H = 240, padL = 50, padR = 20, padT = 20, padB = 30;
  const plotW = W - padL - padR, plotH = H - padT - padB;
  const pnls = points.map(p => p.pnl);
  const minPnl = Math.min(...pnls, 0), maxPnl = Math.max(...pnls, 0);
  const range = maxPnl - minPnl || 1;
  const xStep = plotW / (points.length - 1);
  const yOf = (pnl: number) => padT + plotH - ((pnl - minPnl) / range) * plotH;
  const pts = points.map((p, i) => ({ x: padL + i * xStep, y: yOf(p.pnl), pnl: p.pnl, date: p.date }));
  const zeroY = yOf(0);
  const finalPnl = pnls[pnls.length - 1];
  const isPositive = finalPnl >= 0;
  const lineColor = isPositive ? "var(--cal-green)" : "var(--cal-red)";
  const fillColor = isPositive ? "var(--cal-green-tint)" : "var(--cal-red-tint)";
  const pathD = pts.map((p, i) => `${i === 0 ? "M" : "L"} ${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(" ");
  const areaD = `${pathD} L ${pts[pts.length - 1].x.toFixed(1)} ${padT + plotH} L ${padL} ${padT + plotH} Z`;
  const yTicks = 4; const tickVals: number[] = [];
  for (let i = 0; i <= yTicks; i++) tickVals.push(minPnl + (range * i) / yTicks);
  const xLabelCount = Math.min(points.length, 6);
  const xLabelIdxs = Array.from({ length: xLabelCount }, (_, i) => Math.round((i * (points.length - 1)) / (xLabelCount - 1)));

  return (
    <div className="relative mb-6" style={{ border: "1px solid var(--border)", background: "var(--bg-surface)" }}>
      <CornerMarks size={8} inset={-1} thickness={1} opacity={0.5} />
      <div style={{ height: 2, background: "var(--accent)" }} />
      <div className="p-5">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <TrendingUp size={14} style={{ color: "var(--accent)" }} />
            <span className="tag" style={{ color: "var(--accent)" }}>CUMULATIVE PNL · {mode === "futures" ? "FUTURES" : "SPOT"}</span>
          </div>
          <span className="mono text-xs font-bold" style={{ color: lineColor }}>
            {isPositive ? "+" : ""}{fmt(finalPnl)}
          </span>
        </div>
        <svg viewBox={`0 0 ${W} ${H}`} className="w-full" style={{ display: "block" }} preserveAspectRatio="none">
          <defs>
            <clipPath id="pnl-clip"><rect x={padL} y={padT - 2} width={plotW} height={plotH + 4} /></clipPath>
          </defs>
          {tickVals.map((v, i) => {
            const y = yOf(v);
            return (
              <g key={i}>
                <line x1={padL} y1={y} x2={W - padR} y2={y} stroke="var(--border-subtle)" strokeWidth={0.5} />
                <text x={padL - 6} y={y + 3} textAnchor="end" fontSize={9} fill="var(--text-faint)" className="mono">{fmt(v, 0)}</text>
              </g>
            );
          })}
          {zeroY > padT && zeroY < padT + plotH && (
            <line x1={padL} y1={zeroY} x2={W - padR} y2={zeroY} stroke="var(--text-faint)" strokeWidth={0.5} strokeDasharray="4 4" />
          )}
          <g clipPath="url(#pnl-clip)">
            <path d={areaD} fill={fillColor} />
            <path d={pathD} fill="none" stroke={lineColor} strokeWidth={1.5} />
          </g>
          {xLabelIdxs.map(idx => {
            const p = pts[idx];
            return <text key={idx} x={p.x} y={H - 8} textAnchor="middle" fontSize={9} fill="var(--text-faint)" className="mono">{fmtDate(p.date)}</text>;
          })}
        </svg>
      </div>
    </div>
  );
}

/* Search Hero */
function SearchHero({ searchInput, setSearchInput, onSearch, searchPending, searchFocused, setSearchFocused, searchRef, error }: {
  searchInput: string; setSearchInput: (v: string) => void; onSearch: () => void;
  searchPending: boolean; searchFocused: boolean; setSearchFocused: (v: boolean) => void;
  searchRef: React.RefObject<HTMLInputElement | null>; error: string | null;
}) {
  return (
    <div className="flex flex-col items-center justify-center text-center py-20 px-5">
      <div className="relative flex items-center justify-center mb-8 fade-up" style={{ width: 72, height: 72 }}>
        <div className="absolute inset-0 rounded-full" style={{ background: "var(--accent-dim)", filter: "blur(20px)" }} />
        <div className="relative flex items-center justify-center rounded-sm" style={{ width: 56, height: 56, background: "var(--bg-surface)", border: "1px solid var(--accent)" }}>
          <CornerMarks size={8} inset={-1} thickness={1.5} />
          <History size={24} style={{ color: "var(--accent)" }} />
        </div>
      </div>
      <div className="fade-up fade-up-1 mb-3">
        <div className="flex items-center gap-2 mb-3 justify-center">
          <span className="w-5 h-px" style={{ background: "var(--accent)" }} />
          <span className="tag" style={{ color: "var(--accent)" }}>TRADE HISTORY</span>
          <span className="w-5 h-px" style={{ background: "var(--accent)" }} />
        </div>
        <h1 className="text-[34px] sm:text-[48px] font-bold leading-none tracking-tight" style={{ color: "var(--text)", letterSpacing: "-0.02em" }}>
          Trade History
        </h1>
      </div>
      <p className="text-sm sm:text-base mb-10 max-w-md fade-up fade-up-2" style={{ color: "var(--text-muted)" }}>
        Enter a wallet address to view its complete trading history — spot and futures trades with PnL, fees, charts, and CSV export.
      </p>
      <div className="w-full max-w-[560px] fade-up fade-up-3">
        <div className="relative flex items-center" style={{
          border: `1px solid ${searchFocused ? "var(--accent)" : "var(--border)"}`,
          background: "var(--bg-surface)",
          boxShadow: searchFocused ? "0 0 0 1px var(--accent), 0 0 32px var(--accent-dim)" : "none",
          transition: "border-color 0.15s, box-shadow 0.15s",
        }}>
          {searchFocused && <CornerMarks size={8} inset={-1} thickness={1.5} />}
          <Search size={16} className="absolute left-4 pointer-events-none" style={{ color: "var(--text-faint)" }} />
          <input ref={searchRef} type="text" value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            onFocus={() => setSearchFocused(true)} onBlur={() => setSearchFocused(false)}
            onKeyDown={(e) => e.key === "Enter" && onSearch()}
            placeholder="Paste a wallet address  e.g. 0x0879A87D…"
            className="w-full bg-transparent outline-none mono text-sm py-4 pl-11 pr-28"
            style={{ color: "var(--text)", caretColor: "var(--accent)" }}
            spellCheck={false} autoComplete="off" />
          {searchInput && (
            <button onClick={() => setSearchInput("")} className="absolute right-[92px] opacity-50 hover:opacity-100 transition-opacity" style={{ color: "var(--text-faint)" }}>
              <X size={14} />
            </button>
          )}
          <button onClick={onSearch} disabled={searchPending || !searchInput.trim()}
            className="absolute right-2 sheen-host px-4 py-2 tag font-bold transition-opacity disabled:opacity-40"
            style={{ background: "var(--accent)", color: "var(--accent-fg)" }}>
            {searchPending ? "…" : "SEARCH"}
          </button>
        </div>
        {error && (
          <div className="mt-4 flex items-center gap-2 px-4 py-3" style={{ border: "1px solid var(--red)", background: "rgba(204,46,46,0.06)" }}>
            <X size={14} style={{ color: "var(--red)" }} />
            <span className="mono text-xs font-bold" style={{ color: "var(--red)" }}>{error}</span>
          </div>
        )}
      </div>
    </div>
  );
}

/* Futures Table */
const FUT_COLS = "minmax(90px,1fr) 60px 70px 80px 80px 70px 60px 80px 90px 90px";

function FuturesTable({ positions, hasMore, loadingMore, onLoadMore }: {
  positions: PositionEnriched[]; hasMore: boolean; loadingMore: boolean; onLoadMore: () => void;
}) {
  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useState(20);
  const totalPages = Math.ceil(positions.length / pageSize);
  const pageItems = positions.slice(page * pageSize, (page + 1) * pageSize);
  useEffect(() => { setPage(0); }, [pageSize]);

  return (
    <div className="relative" style={{ border: "1px solid var(--border)", background: "var(--bg-surface)" }}>
      <CornerMarks size={8} inset={-1} thickness={1} opacity={0.5} />
      <div className="overflow-x-auto">
        <div style={{ minWidth: 720 }}>
          <div className="grid items-center px-4 py-3" style={{ gridTemplateColumns: FUT_COLS, gap: 12, borderBottom: "1px solid var(--border)" }}>
            <span className="tag" style={{ color: "var(--text-faint)" }}>PAIR</span>
            <span className="tag" style={{ color: "var(--text-faint)" }}>SIDE</span>
            <span className="tag" style={{ color: "var(--text-faint)" }}>MARGIN</span>
            <span className="tag text-right" style={{ color: "var(--text-faint)" }}>ENTRY</span>
            <span className="tag text-right" style={{ color: "var(--text-faint)" }}>CLOSE</span>
            <span className="tag text-right" style={{ color: "var(--text-faint)" }}>SIZE</span>
            <span className="tag text-right" style={{ color: "var(--text-faint)" }}>LEV</span>
            <span className="tag text-right" style={{ color: "var(--text-faint)" }}>FEE</span>
            <span className="tag text-right" style={{ color: "var(--text-faint)" }}>PNL</span>
            <span className="tag text-right" style={{ color: "var(--text-faint)" }}>PNL %</span>
          </div>
          {pageItems.map((p, i) => {
            const positive = p.realizedPnlValue >= 0;
            return (
              <div key={p.position_id} className="lb-row grid items-center px-4 group"
                style={{ gridTemplateColumns: FUT_COLS, gap: 12, height: 52,
                  borderBottom: i < pageItems.length - 1 ? "1px solid var(--border-subtle)" : "none",
                  animationDelay: `${Math.min(i * 30, 500)}ms`, transition: "background 0.15s" }}
                onMouseEnter={(e) => ((e.currentTarget as HTMLElement).style.background = "var(--bg-elevated)")}
                onMouseLeave={(e) => ((e.currentTarget as HTMLElement).style.background = "transparent")}>
                <div className="flex items-center gap-2 min-w-0">
                  <TokenIcon symbol={p.symbolName} size={20} />
                  <span className="mono text-xs font-bold truncate" style={{ color: "var(--text)" }}>{p.symbolName}</span>
                </div>
                <span className="mono text-xs font-bold" style={{ color: p.position_side === 1 ? "var(--green)" : "var(--red)" }}>{sideLabel(p.position_side)}</span>
                <span className="mono text-xs" style={{ color: "var(--text-muted)" }}>{marginLabel(p.margin_mode)}</span>
                <span className="mono text-xs text-right tabular-nums" style={{ color: "var(--text-muted)" }}>{p.entryPrice > 0 ? `$${p.entryPrice.toLocaleString()}` : "—"}</span>
                <span className="mono text-xs text-right tabular-nums" style={{ color: "var(--text-muted)" }}>{p.closePrice > 0 ? `$${p.closePrice.toLocaleString()}` : "—"}</span>
                <span className="mono text-xs text-right tabular-nums" style={{ color: "var(--text)" }}>{p.closedSize}</span>
                <span className="mono text-xs text-right tabular-nums" style={{ color: "var(--text-muted)" }}>{p.leverage}x</span>
                <span className="mono text-xs text-right tabular-nums" style={{ color: "var(--text-faint)" }}>{fmt(p.tradingFee + p.fundingFee)}</span>
                <span className="mono text-xs text-right font-bold tabular-nums" style={{ color: positive ? "var(--green)" : "var(--red)" }}>{positive ? "+" : ""}{fmt(p.realizedPnlValue)}</span>
                <span className="mono text-xs text-right font-bold tabular-nums" style={{ color: positive ? "var(--green)" : "var(--red)" }}>{positive ? "+" : ""}{p.pnlPercent.toFixed(2)}%</span>
              </div>
            );
          })}
          {positions.length === 0 && !loadingMore && (
            <div className="px-4 py-12 text-center"><span className="mono text-sm" style={{ color: "var(--text-faint)" }}>NO CLOSED POSITIONS FOUND</span></div>
          )}
        </div>
      </div>
      <div className="px-4 py-2.5 flex items-center justify-between flex-wrap gap-2" style={{ borderTop: "1px solid var(--border-subtle)" }}>
        <div className="flex items-center gap-3">
          <span className="tag" style={{ color: "var(--text-faint)" }}>{positions.length > 0 ? `${page * pageSize + 1}–${Math.min((page + 1) * pageSize, positions.length)} of ${positions.length}` : "NO POSITIONS"}</span>
          <div className="flex items-center gap-1">
            {[5, 10, 20, 50].map(sz => (
              <button key={sz} onClick={() => setPageSize(sz)} className="tag px-2 py-0.5 transition-colors"
                style={{ border: `1px solid ${pageSize === sz ? "var(--accent)" : "var(--border)"}`, color: pageSize === sz ? "var(--accent)" : "var(--text-faint)" }}>{sz}</button>
            ))}
          </div>
        </div>
        <div className="flex items-center gap-2">
          {totalPages > 1 && (
            <div className="flex items-center gap-1">
              <button onClick={() => setPage(p => Math.max(0, p - 1))} disabled={page === 0} className="flex items-center justify-center w-7 h-7 transition-colors disabled:opacity-30" style={{ border: "1px solid var(--border)", color: "var(--text-muted)" }}><ChevronLeft size={14} /></button>
              <span className="tag px-2" style={{ color: "var(--text-faint)" }}>{page + 1}/{totalPages}</span>
              <button onClick={() => setPage(p => Math.min(totalPages - 1, p + 1))} disabled={page === totalPages - 1} className="flex items-center justify-center w-7 h-7 transition-colors disabled:opacity-30" style={{ border: "1px solid var(--border)", color: "var(--text-muted)" }}><ChevronRight size={14} /></button>
            </div>
          )}
          {hasMore && (
            <button onClick={onLoadMore} disabled={loadingMore} className="flex items-center gap-1.5 px-3 py-1.5 tag transition-colors" style={{ border: "1px solid var(--border)", color: "var(--text-muted)" }}
              onMouseEnter={e => { (e.currentTarget as HTMLElement).style.borderColor = "var(--accent)"; (e.currentTarget as HTMLElement).style.color = "var(--accent)"; }}
              onMouseLeave={e => { (e.currentTarget as HTMLElement).style.borderColor = "var(--border)"; (e.currentTarget as HTMLElement).style.color = "var(--text-muted)"; }}>
              {loadingMore ? <RefreshCw size={11} className="animate-spin" /> : <TrendingUp size={11} />}
              {loadingMore ? "LOADING…" : "LOAD MORE"}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

/* Spot Table */
const SPOT_COLS = "minmax(90px,1fr) 60px 90px 80px 90px 80px 90px";

function SpotTable({ trades, hasMore, loadingMore, onLoadMore }: {
  trades: SpotTradeEnriched[]; hasMore: boolean; loadingMore: boolean; onLoadMore: () => void;
}) {
  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useState(20);
  const totalPages = Math.ceil(trades.length / pageSize);
  const pageItems = trades.slice(page * pageSize, (page + 1) * pageSize);
  useEffect(() => { setPage(0); }, [pageSize]);

  return (
    <div className="relative" style={{ border: "1px solid var(--border)", background: "var(--bg-surface)" }}>
      <CornerMarks size={8} inset={-1} thickness={1} opacity={0.5} />
      <div className="overflow-x-auto">
        <div style={{ minWidth: 600 }}>
          <div className="grid items-center px-4 py-3" style={{ gridTemplateColumns: SPOT_COLS, gap: 12, borderBottom: "1px solid var(--border)" }}>
            <span className="tag" style={{ color: "var(--text-faint)" }}>PAIR</span>
            <span className="tag" style={{ color: "var(--text-faint)" }}>SIDE</span>
            <span className="tag text-right" style={{ color: "var(--text-faint)" }}>PRICE</span>
            <span className="tag text-right" style={{ color: "var(--text-faint)" }}>QTY</span>
            <span className="tag text-right" style={{ color: "var(--text-faint)" }}>VALUE</span>
            <span className="tag text-right" style={{ color: "var(--text-faint)" }}>FEE</span>
            <span className="tag text-right" style={{ color: "var(--text-faint)" }}>DATE</span>
          </div>
          {pageItems.map((t, i) => (
            <div key={t.trade_id} className="lb-row grid items-center px-4 group"
              style={{ gridTemplateColumns: SPOT_COLS, gap: 12, height: 52,
                borderBottom: i < pageItems.length - 1 ? "1px solid var(--border-subtle)" : "none",
                animationDelay: `${Math.min(i * 30, 500)}ms`, transition: "background 0.15s" }}
              onMouseEnter={(e) => ((e.currentTarget as HTMLElement).style.background = "var(--bg-elevated)")}
              onMouseLeave={(e) => ((e.currentTarget as HTMLElement).style.background = "transparent")}>
              <div className="flex items-center gap-2 min-w-0">
                <TokenIcon symbol={t.symbolName} size={20} />
                <span className="mono text-xs font-bold truncate" style={{ color: "var(--text)" }}>{t.symbolName}</span>
              </div>
              <span className="mono text-xs font-bold" style={{ color: t.side === 1 ? "var(--green)" : "var(--red)" }}>{t.sideLabel}</span>
              <span className="mono text-xs text-right tabular-nums" style={{ color: "var(--text-muted)" }}>${t.priceValue.toLocaleString()}</span>
              <span className="mono text-xs text-right tabular-nums" style={{ color: "var(--text)" }}>{t.qtyValue}</span>
              <span className="mono text-xs text-right tabular-nums" style={{ color: "var(--text)" }}>{fmt(t.value)}</span>
              <span className="mono text-xs text-right tabular-nums" style={{ color: "var(--text-faint)" }}>{fmt(t.feeValue)}</span>
              <span className="mono text-xs text-right tabular-nums" style={{ color: "var(--text-faint)" }}>{fmtDate(t.date)}</span>
            </div>
          ))}
          {trades.length === 0 && !loadingMore && (
            <div className="px-4 py-12 text-center"><span className="mono text-sm" style={{ color: "var(--text-faint)" }}>NO SPOT TRADES FOUND</span></div>
          )}
        </div>
      </div>
      <div className="px-4 py-2.5 flex items-center justify-between flex-wrap gap-2" style={{ borderTop: "1px solid var(--border-subtle)" }}>
        <div className="flex items-center gap-3">
          <span className="tag" style={{ color: "var(--text-faint)" }}>{trades.length > 0 ? `${page * pageSize + 1}–${Math.min((page + 1) * pageSize, trades.length)} of ${trades.length}` : "NO TRADES"}</span>
          <div className="flex items-center gap-1">
            {[5, 10, 20, 50].map(sz => (
              <button key={sz} onClick={() => setPageSize(sz)} className="tag px-2 py-0.5 transition-colors"
                style={{ border: `1px solid ${pageSize === sz ? "var(--accent)" : "var(--border)"}`, color: pageSize === sz ? "var(--accent)" : "var(--text-faint)" }}>{sz}</button>
            ))}
          </div>
        </div>
        {totalPages > 1 && (
          <div className="flex items-center gap-1">
            <button onClick={() => setPage(p => Math.max(0, p - 1))} disabled={page === 0} className="flex items-center justify-center w-7 h-7 transition-colors disabled:opacity-30" style={{ border: "1px solid var(--border)", color: "var(--text-muted)" }}><ChevronLeft size={14} /></button>
            <span className="tag px-2" style={{ color: "var(--text-faint)" }}>{page + 1}/{totalPages}</span>
            <button onClick={() => setPage(p => Math.min(totalPages - 1, p + 1))} disabled={page === totalPages - 1} className="flex items-center justify-center w-7 h-7 transition-colors disabled:opacity-30" style={{ border: "1px solid var(--border)", color: "var(--text-muted)" }}><ChevronRight size={14} /></button>
          </div>
        )}
          {hasMore && (
            <button onClick={onLoadMore} disabled={loadingMore} className="flex items-center gap-1.5 px-3 py-1.5 tag transition-colors" style={{ border: "1px solid var(--border)", color: "var(--text-muted)" }}
              onMouseEnter={e => { (e.currentTarget as HTMLElement).style.borderColor = "var(--accent)"; (e.currentTarget as HTMLElement).style.color = "var(--accent)"; }}
              onMouseLeave={e => { (e.currentTarget as HTMLElement).style.borderColor = "var(--border)"; (e.currentTarget as HTMLElement).style.color = "var(--text-muted)"; }}>
              {loadingMore ? <RefreshCw size={11} className="animate-spin" /> : <TrendingUp size={11} />}
              {loadingMore ? "LOADING…" : "LOAD MORE"}
            </button>
          )}
      </div>
    </div>
  );
}

/* Profile Header */
function ProfileHeader({ walletAddress, accountId, itemCount, mode, onReset, onRefresh, refreshing, onExport, copyState }: {
  walletAddress: string; accountId: number; itemCount: number; mode: "futures" | "spot";
  onReset: () => void; onRefresh: () => void; refreshing: boolean; onExport: () => void;
  copyState: ReturnType<typeof useCopy>;
}) {
  const { copied, copy } = copyState;
  const isCopied = copied === walletAddress;
  return (
    <div className="mb-7 pt-6 fade-up">
      <div className="flex items-start justify-between flex-wrap gap-4">
        <div className="flex items-center gap-4">
          <div className="relative flex items-center justify-center shrink-0" style={{ width: 56, height: 56, background: "var(--bg-surface)", border: "1px solid var(--accent)" }}>
            <CornerMarks size={7} inset={-1} thickness={1.5} />
            <Wallet size={22} style={{ color: "var(--accent)" }} />
          </div>
          <div>
            <div className="flex items-center gap-2 mb-1.5">
              <span className="w-4 h-px" style={{ background: "var(--accent)" }} />
              <span className="tag" style={{ color: "var(--accent)" }}>TRADE HISTORY</span>
            </div>
            <button onClick={() => copy(walletAddress)} className="group flex items-center gap-2 mb-1" title="Copy address">
              <span className="mono text-base sm:text-lg font-bold" style={{ color: "var(--text)" }}>{shortAddr(walletAddress)}</span>
              {isCopied ? <Check size={14} style={{ color: "var(--accent)" }} /> : <Copy size={14} className="opacity-40 group-hover:opacity-80 transition-opacity" style={{ color: "var(--text-faint)" }} />}
            </button>
            <span className="tag" style={{ color: "var(--text-faint)" }}>{itemCount} {mode === "futures" ? "positions" : "trades"} loaded</span>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={onExport} disabled={itemCount === 0}
            className="flex items-center gap-1.5 px-3 py-1.5 tag transition-colors disabled:opacity-30"
            style={{ border: "1px solid var(--border)", color: "var(--text-muted)" }}
            onMouseEnter={e => { if (itemCount > 0) { (e.currentTarget as HTMLElement).style.borderColor = "var(--accent)"; (e.currentTarget as HTMLElement).style.color = "var(--accent)"; } }}
            onMouseLeave={e => { (e.currentTarget as HTMLElement).style.borderColor = "var(--border)"; (e.currentTarget as HTMLElement).style.color = "var(--text-muted)"; }}
            title="Export CSV">
            <Download size={11} /> CSV
          </button>
          <button onClick={onRefresh} className="flex items-center gap-1.5 px-3 py-1.5 tag transition-colors" style={{ border: "1px solid var(--border)", color: "var(--text-muted)" }}
            onMouseEnter={e => { (e.currentTarget as HTMLElement).style.borderColor = "var(--accent)"; (e.currentTarget as HTMLElement).style.color = "var(--accent)"; }}
            onMouseLeave={e => { (e.currentTarget as HTMLElement).style.borderColor = "var(--border)"; (e.currentTarget as HTMLElement).style.color = "var(--text-muted)"; }}>
            <RefreshCw size={11} className={refreshing ? "animate-spin" : ""} /> REFRESH
          </button>
          <a href={`https://explorer.sodex.dev/address/${walletAddress}`} target="_blank" rel="noopener noreferrer"
            className="flex items-center gap-1.5 px-3 py-1.5 tag transition-colors" style={{ border: "1px solid var(--border)", color: "var(--text-muted)" }}
            onMouseEnter={e => { (e.currentTarget as HTMLElement).style.borderColor = "var(--accent)"; (e.currentTarget as HTMLElement).style.color = "var(--accent)"; }}
            onMouseLeave={e => { (e.currentTarget as HTMLElement).style.borderColor = "var(--border)"; (e.currentTarget as HTMLElement).style.color = "var(--text-muted)"; }}>
            <ExternalLink size={11} /> EXPLORER
          </a>
          <button onClick={onReset} className="flex items-center justify-center w-8 h-8 transition-colors" style={{ border: "1px solid var(--border)", color: "var(--text-faint)" }}
            onMouseEnter={e => { (e.currentTarget as HTMLElement).style.borderColor = "var(--red)"; (e.currentTarget as HTMLElement).style.color = "var(--red)"; }}
            onMouseLeave={e => { (e.currentTarget as HTMLElement).style.borderColor = "var(--border)"; (e.currentTarget as HTMLElement).style.color = "var(--text-faint)"; }}
            title="New search">
            <X size={14} />
          </button>
        </div>
      </div>
    </div>
  );
}

/* Main Component */
export function TradeHistoryPage() {
  const [searchInput, setSearchInput] = useState("");
  const [searchPending, setSearchPending] = useState(false);
  const [searchFocused, setSearchFocused] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [walletAddress, setWalletAddress] = useState<string | null>(null);
  const [accountId, setAccountId] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [mode, setMode] = useState<"futures" | "spot">("futures");

  // Futures state
  const [positions, setPositions] = useState<PositionEnriched[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const [perpsSymbolMap, setPerpsSymbolMap] = useState<Map<number, string>>(new Map());

  // Spot state
  const [spotTrades, setSpotTrades] = useState<SpotTradeEnriched[]>([]);
  const [spotNextCursor, setSpotNextCursor] = useState<string | null>(null);
  const [spotLoadingMore, setSpotLoadingMore] = useState(false);
  const [spotSymbolMap, setSpotSymbolMap] = useState<Map<number, string>>(new Map());

  const searchRef = useRef<HTMLInputElement>(null);
  const copyState = useCopy();

  // Export manager subscription
  const [exportState, setExportState] = useState<ExportState>(exportManager.getState());
  useEffect(() => {
    const unsub = exportManager.subscribe(setExportState);
    return unsub;
  }, []);

  const handleStartExport = useCallback(() => {
    if (!walletAddress || !accountId) return;
    exportManager.start(mode, walletAddress, accountId, perpsSymbolMap, spotSymbolMap);
  }, [walletAddress, accountId, mode, perpsSymbolMap, spotSymbolMap]);

  const handleDownloadExport = useCallback(() => {
    const st = exportManager.getState();
    if (st.data.length === 0) return;
    if (st.mode === "futures") {
      const enriched = enrichPositions(st.data as PositionRaw[], st.perpsSymbolMap);
      const headers = ["Position ID", "Symbol", "Side", "Margin Mode", "Entry Price", "Close Price", "Closed Size", "Leverage", "Trading Fee", "Funding Fee", "Realized PnL", "PnL %", "Date"];
      const rows = enriched.map(p => [
        p.position_id, p.symbolName, sideLabel(p.position_side), marginLabel(p.margin_mode),
        p.entryPrice, p.closePrice, p.closedSize, `${p.leverage}x`,
        p.tradingFee.toFixed(4), p.fundingFee.toFixed(4),
        p.realizedPnlValue.toFixed(4), p.pnlPercent.toFixed(2), fmtDate(p.date),
      ]);
      downloadCSV(headers, rows, `sodex-perps-all-${shortAddr(st.walletAddress)}.csv`);
    } else {
      const enriched = enrichSpotTrades(st.data as SpotTradeRaw[], st.spotSymbolMap);
      const headers = ["Trade ID", "Symbol", "Side", "Price", "Quantity", "Value (USD)", "Fee", "Maker", "Date"];
      const rows = enriched.map(t => [
        t.trade_id, t.symbolName, t.sideLabel, t.priceValue, t.qtyValue,
        t.value.toFixed(4), t.feeValue.toFixed(4), t.is_maker ? "YES" : "NO", fmtDate(t.date),
      ]);
      downloadCSV(headers, rows, `sodex-spot-all-${shortAddr(st.walletAddress)}.csv`);
    }
  }, []);

  const loadPositions = useCallback(async (acctId: number, symMap: Map<number, string>, cursor?: string) => {
    const data = await fetchPositionsPage(acctId, cursor, 1000);
    if (data.code !== 0) throw new Error(data.meta?.next_cursor ? "Pagination error" : "Failed to fetch positions");
    const nc = data.meta?.next_cursor ?? null;
    console.log("[futures] fetched", data.data?.length, "items, next_cursor:", nc);
    return { enriched: enrichPositions(data.data || [], symMap), nextCursor: nc };
  }, []);

  const loadSpotTrades = useCallback(async (acctId: number, symMap: Map<number, string>, cursor?: string) => {
    const data = await fetchSpotTradesPage(acctId, cursor, 1000);
    if (data.code !== 0) throw new Error(data.meta?.next_cursor ? "Pagination error" : "Failed to fetch spot trades");
    const nc = data.meta?.next_cursor ?? null;
    console.log("[spot] fetched", data.data?.length, "items, next_cursor:", nc);
    return { enriched: enrichSpotTrades(data.data || [], symMap), nextCursor: nc };
  }, []);

  const handleSearch = async () => {
    const addr = searchInput.trim();
    if (!addr) return;
    setSearchPending(true); setError(null); setLoading(true);
    try {
      const [perpsState, spotState] = await Promise.all([
        fetchPerpsAccountState(addr).catch(() => null),
        fetchSpotAccountState(addr).catch(() => null),
      ]);
      if (!perpsState && !spotState) throw new Error("Address not found on SoDEX");
      const acctId = (perpsState?.aid ?? spotState?.aid)!;
      setWalletAddress(addr); setAccountId(acctId);

      const [pSymMap, sSymMap] = await Promise.all([
        fetchPerpsSymbols().catch(() => new Map<number, string>()),
        fetchSpotSymbols().catch(() => new Map<number, string>()),
      ]);
      setPerpsSymbolMap(pSymMap); setSpotSymbolMap(sSymMap);

      const [posResult, spotResult] = await Promise.all([
        loadPositions(acctId, pSymMap),
        loadSpotTrades(acctId, sSymMap),
      ]);
      setPositions(posResult.enriched); setNextCursor(posResult.nextCursor);
      setSpotTrades(spotResult.enriched); setSpotNextCursor(spotResult.nextCursor);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load trade history.");
    } finally {
      setSearchPending(false); setLoading(false);
    }
  };

  const handleLoadMore = async () => {
    if (mode === "futures") {
      if (!accountId || !nextCursor) return;
      setLoadingMore(true);
      try {
        const { enriched, nextCursor: nc } = await loadPositions(accountId, perpsSymbolMap, nextCursor);
        setPositions(prev => [...prev, ...enriched]); setNextCursor(nc);
      } catch (e) { console.error("[futures] load more failed:", e); } finally { setLoadingMore(false); }
    } else {
      if (!accountId || !spotNextCursor) return;
      setSpotLoadingMore(true);
      try {
        const { enriched, nextCursor: nc } = await loadSpotTrades(accountId, spotSymbolMap, spotNextCursor);
        setSpotTrades(prev => [...prev, ...enriched]); setSpotNextCursor(nc);
      } catch (e) { console.error("[spot] load more failed:", e); } finally { setSpotLoadingMore(false); }
    }
  };

  const handleReset = () => {
    setWalletAddress(null); setAccountId(null); setPositions([]); setSpotTrades([]);
    setNextCursor(null); setSpotNextCursor(null); setSearchInput(""); setError(null);
    setTimeout(() => searchRef.current?.focus(), 100);
  };

  const handleRefresh = async () => {
    if (!accountId) return;
    setRefreshing(true);
    try {
      const [posResult, spotResult] = await Promise.all([
        loadPositions(accountId, perpsSymbolMap),
        loadSpotTrades(accountId, spotSymbolMap),
      ]);
      setPositions(posResult.enriched); setNextCursor(posResult.nextCursor);
      setSpotTrades(spotResult.enriched); setSpotNextCursor(spotResult.nextCursor);
    } catch {} finally { setRefreshing(false); }
  };

  const handleExport = () => {
    if (!walletAddress) return;
    if (mode === "futures") exportPerpsCSV(positions, walletAddress);
    else exportSpotCSV(spotTrades, walletAddress);
  };

  useEffect(() => { if (!walletAddress) searchRef.current?.focus(); }, [walletAddress]);

  // Chart data
  const chartPoints = useMemo(() => {
    if (mode === "futures") {
      const sorted = [...positions].sort((a, b) => a.date - b.date);
      let cum = 0;
      return sorted.map(p => { cum += p.realizedPnlValue; return { date: p.date, pnl: cum }; });
    } else {
      const sorted = [...spotTrades].sort((a, b) => a.date - b.date);
      let cum = 0;
      return sorted.map(t => { cum += t.side === 1 ? -t.value : t.value; return { date: t.date, pnl: cum }; });
    }
  }, [mode, positions, spotTrades]);

  // Stats
  const stats = useMemo(() => {
    if (mode === "futures") {
      const totalPnl = positions.reduce((s, p) => s + p.realizedPnlValue, 0);
      const totalFees = positions.reduce((s, p) => s + p.tradingFee + p.fundingFee, 0);
      const wins = positions.filter(p => p.realizedPnlValue >= 0).length;
      return [
        { label: "TOTAL POSITIONS", value: String(positions.length) },
        { label: "TOTAL PNL", value: fmt(totalPnl), tone: totalPnl >= 0 ? "up" as const : "down" as const },
        { label: "WIN RATE", value: positions.length > 0 ? `${((wins / positions.length) * 100).toFixed(1)}%` : "—" },
        { label: "TOTAL FEES", value: fmt(totalFees) },
      ];
    } else {
      const totalValue = spotTrades.reduce((s, t) => s + t.value, 0);
      const totalFees = spotTrades.reduce((s, t) => s + t.feeValue, 0);
      const buys = spotTrades.filter(t => t.side === 1).length;
      return [
        { label: "TOTAL TRADES", value: String(spotTrades.length) },
        { label: "TOTAL VOLUME", value: fmt(totalValue) },
        { label: "BUY / SELL", value: spotTrades.length > 0 ? `${buys} / ${spotTrades.length - buys}` : "—" },
        { label: "TOTAL FEES", value: fmt(totalFees) },
      ];
    }
  }, [mode, positions, spotTrades]);

  const itemCount = mode === "futures" ? positions.length : spotTrades.length;

  if (!walletAddress && !loading) {
    return (
      <div className="min-h-screen pt-[72px] pb-20" style={{ background: "var(--bg)" }}>
        <div className="max-w-[1100px] mx-auto">
          <SearchHero searchInput={searchInput} setSearchInput={setSearchInput} onSearch={handleSearch}
            searchPending={searchPending} searchFocused={searchFocused} setSearchFocused={setSearchFocused}
            searchRef={searchRef} error={error} />
        </div>
      </div>
    );
  }

  if (loading && !walletAddress) {
    return (
      <div className="min-h-screen pt-[72px] pb-20 flex items-center justify-center" style={{ background: "var(--bg)" }}>
        <div className="flex flex-col items-center gap-4">
          <div className="flex items-center justify-center rounded-sm" style={{ width: 56, height: 56, background: "var(--bg-surface)", border: "1px solid var(--accent)" }}>
            <RefreshCw size={22} className="animate-spin" style={{ color: "var(--accent)" }} />
          </div>
          <span className="mono text-sm" style={{ color: "var(--text-faint)" }}>LOADING TRADE HISTORY…</span>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen pt-[72px] pb-20" style={{ background: "var(--bg)" }}>
      <div className="max-w-[1100px] mx-auto px-5">
        <ProfileHeader walletAddress={walletAddress!} accountId={accountId!} itemCount={itemCount} mode={mode}
          onReset={handleReset} onRefresh={handleRefresh} refreshing={refreshing} onExport={handleExport} copyState={copyState} />

        {/* Mode toggle */}
        <div className="flex items-center gap-2 mb-6">
          {(["futures", "spot"] as const).map(m => (
            <button key={m} onClick={() => setMode(m)}
              className="px-4 py-2 tag font-bold transition-colors"
              style={{
                border: `1px solid ${mode === m ? "var(--accent)" : "var(--border)"}`,
                color: mode === m ? "var(--accent)" : "var(--text-muted)",
                background: mode === m ? "var(--accent-dim)" : "transparent",
              }}>
              {m === "futures" ? "FUTURES" : "SPOT"}
            </button>
          ))}
        </div>

        {/* Fetch status banner */}
        <div className="mb-4 flex items-center gap-3 px-4 py-2.5" style={{ border: "1px solid var(--border)", background: "var(--bg-surface)" }}>
          <span className="tag" style={{ color: "var(--text-faint)" }}>FETCH STATUS</span>
          <span className="mono text-xs" style={{ color: "var(--text-muted)" }}>
            {mode === "futures"
              ? `${positions.length.toLocaleString()} positions loaded`
              : `${spotTrades.length.toLocaleString()} trades loaded`}
          </span>
          {(mode === "futures" ? nextCursor : spotNextCursor) ? (
            <span className="flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full" style={{ background: "var(--cal-green)" }} />
              <span className="tag" style={{ color: "var(--cal-green)" }}>MORE AVAILABLE</span>
            </span>
          ) : (
            <span className="flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full" style={{ background: "var(--text-faint)" }} />
              <span className="tag" style={{ color: "var(--text-faint)" }}>ALL LOADED</span>
            </span>
          )}
          {(mode === "futures" ? loadingMore : spotLoadingMore) && (
            <span className="flex items-center gap-1.5">
              <RefreshCw size={11} className="animate-spin" style={{ color: "var(--accent)" }} />
              <span className="tag" style={{ color: "var(--accent)" }}>FETCHING…</span>
            </span>
          )}
        </div>

        {/* Export panel */}
        <ExportPanel
          exportState={exportState}
          onStart={handleStartExport}
          onResume={() => exportManager.resume()}
          onPause={() => exportManager.pause()}
          onDownload={handleDownloadExport}
          onReset={() => exportManager.reset()}
        />

        {/* Stats */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
          {stats.map(s => (
            <div key={s.label} className="p-4" style={{ border: "1px solid var(--border)", background: "var(--bg-surface)" }}>
              <div className="tag mb-1.5" style={{ color: "var(--text-faint)" }}>{s.label}</div>
              <div className="mono text-lg font-bold tabular-nums"
                style={{ color: s.tone === "up" ? "var(--green)" : s.tone === "down" ? "var(--red)" : "var(--text)" }}>
                {s.value}
              </div>
            </div>
          ))}
        </div>

        {/* Chart */}
        <PnlChart points={chartPoints} mode={mode} />

        {/* Table */}
        {mode === "futures" ? (
          <FuturesTable positions={positions} hasMore={!!nextCursor} loadingMore={loadingMore} onLoadMore={handleLoadMore} />
        ) : (
          <SpotTable trades={spotTrades} hasMore={!!spotNextCursor} loadingMore={spotLoadingMore} onLoadMore={handleLoadMore} />
        )}
      </div>
    </div>
  );
}
