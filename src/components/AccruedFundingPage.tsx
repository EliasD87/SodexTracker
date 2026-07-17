"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Search, X, RefreshCw, ArrowUpRight, ArrowDownRight, Minus } from "lucide-react";
import { CornerMarks } from "@/components/CornerMarks";
import { usePortfolio } from "@/components/PortfolioProvider";

const GW_BASE = "https://mainnet-gw.sodex.dev/api/v1";

/* ─── Types ─────────────────────────────────────────────────────────────────── */

interface RawPosition {
  i: number;
  s: string;
  sz: string;
  ep: string;
  cf: string;
  ur: string;
  l: number;
  lp: string;
  m: string;
}

interface RawTicker {
  symbol: string;
  markPrice: string;
  fundingRate: string;
  nextFundingTime: number;
}

interface EnrichedPosition {
  id: number;
  symbol: string;
  side: "LONG" | "SHORT";
  size: number;
  entryPrice: number;
  markPrice: number;
  leverage: number;
  liqPrice: number;
  marginMode: string;
  fundingRate: number;
  nextFundingTime: number;
  notional: number;
  estimatedPayment: number;
  cumulativeFunding: number;
  unrealizedPnl: number;
}

/* ─── Ghost hero data ───────────────────────────────────────────────────────── */

const GHOST_COLS = "minmax(80px,1.1fr) 52px 72px 88px 72px 92px 96px 72px";

const GHOST_ROWS = [
  { sym: "BTC-USD",  side: "LONG",  size: "1.200", mark: "$64,203", rate: "+0.00125%", est: "-$9.63",  cum: "-$42.18", next: "2h 14m" },
  { sym: "ETH-USD",  side: "SHORT", size: "45.00", mark: "$3,412",  rate: "+0.00125%", est: "+$96.21", cum: "+$128.4", next: "2h 14m" },
  { sym: "SOL-USD",  side: "LONG",  size: "50.00", mark: "$148.20", rate: "+0.00125%", est: "-$4.55",  cum: "-$12.60", next: "2h 14m" },
  { sym: "AVAX-USD", side: "SHORT", size: "100.0", mark: "$28.50",  rate: "-0.00238%", est: "-$6.79",  cum: "+$5.20",  next: "2h 14m" },
  { sym: "ARB-USD",  side: "LONG",  size: "500.0", mark: "$1.230",  rate: "+0.00125%", est: "-$3.84",  cum: "-$8.40",  next: "2h 14m" },
  { sym: "LINK-USD", side: "SHORT", size: "30.00", mark: "$15.24",  rate: "+0.00125%", est: "+$2.85",  cum: "+$11.20", next: "2h 14m" },
  { sym: "XRP-USD",  side: "LONG",  size: "500.0", mark: "$1.047",  rate: "+0.00092%", est: "-$3.82",  cum: "-$6.90",  next: "2h 14m" },
  { sym: "BNB-USD",  side: "SHORT", size: "3.000", mark: "$321.0",  rate: "+0.00125%", est: "+$6.02",  cum: "+$18.30", next: "2h 14m" },
];

/* ─── Helpers ───────────────────────────────────────────────────────────────── */

function fmt$(n: number, dp = 2): string {
  const abs = Math.abs(n);
  const sign = n < 0 ? "-" : n > 0 ? "+" : "";
  if (abs >= 1_000_000) return `${sign}$${(abs / 1_000_000).toFixed(dp)}M`;
  if (abs >= 1_000)     return `${sign}$${(abs / 1_000).toFixed(dp)}K`;
  return `${sign}$${abs.toFixed(dp)}`;
}

function fmtUSD(n: number, dp = 2): string {
  const abs = Math.abs(n);
  const sign = n < 0 ? "-" : "";
  return `${sign}$${abs.toLocaleString("en-US", { minimumFractionDigits: dp, maximumFractionDigits: dp })}`;
}

function fmtRate(r: number): string {
  const pct = (r * 100).toFixed(5);
  return (r >= 0 ? "+" : "") + pct + "%";
}

function fmtCountdown(nextFundingTime: number): string {
  const diff = nextFundingTime - Date.now();
  if (diff <= 0) return "now";
  const h = Math.floor(diff / 3_600_000);
  const m = Math.floor((diff % 3_600_000) / 60_000);
  const s = Math.floor((diff % 60_000) / 1_000);
  if (h > 0) return `${h}h ${m.toString().padStart(2, "0")}m`;
  if (m > 0) return `${m}m ${s.toString().padStart(2, "0")}s`;
  return `${s}s`;
}

function shortAddr(addr: string): string {
  return addr.length > 16 ? addr.slice(0, 8) + "…" + addr.slice(-6) : addr;
}

/* ─── API ───────────────────────────────────────────────────────────────────── */

async function fetchState(wallet: string): Promise<{ positions: RawPosition[] }> {
  const res = await fetch(`${GW_BASE}/perps/accounts/${wallet}/state`);
  if (!res.ok) throw new Error(`State fetch failed: ${res.status}`);
  const json = await res.json() as { code: number; message: string; data: { P?: RawPosition[] } };
  if (json.code !== 0) throw new Error(json.message || "API error");
  return { positions: json.data.P ?? [] };
}

async function fetchTickers(): Promise<Map<string, RawTicker>> {
  const res = await fetch(`${GW_BASE}/perps/markets/tickers`);
  if (!res.ok) throw new Error("Tickers fetch failed");
  const json = await res.json() as { code: number; data: RawTicker[] };
  if (json.code !== 0) throw new Error("Tickers API error");
  const map = new Map<string, RawTicker>();
  for (const t of json.data) map.set(t.symbol, t);
  return map;
}

function enrich(positions: RawPosition[], tickers: Map<string, RawTicker>): EnrichedPosition[] {
  const out: EnrichedPosition[] = [];
  for (const p of positions) {
    const sz = parseFloat(p.sz);
    if (sz === 0) continue;
    const ticker = tickers.get(p.s);
    const markPrice  = ticker ? parseFloat(ticker.markPrice)   : 0;
    const fundingRate = ticker ? parseFloat(ticker.fundingRate) : 0;
    const nextFundingTime = ticker?.nextFundingTime ?? 0;
    const notional = Math.abs(sz) * markPrice;
    // longs pay when rate > 0 → payment = -sz * markPrice * fundingRate
    const estimatedPayment = -(sz * markPrice * fundingRate);
    out.push({
      id:               p.i,
      symbol:           p.s,
      side:             sz > 0 ? "LONG" : "SHORT",
      size:             Math.abs(sz),
      entryPrice:       parseFloat(p.ep),
      markPrice,
      leverage:         p.l,
      liqPrice:         parseFloat(p.lp),
      marginMode:       p.m,
      fundingRate,
      nextFundingTime,
      notional,
      estimatedPayment,
      cumulativeFunding: parseFloat(p.cf),
      unrealizedPnl:    parseFloat(p.ur),
    });
  }
  return out.sort((a, b) => Math.abs(b.estimatedPayment) - Math.abs(a.estimatedPayment));
}

/* ─── SubComponents ─────────────────────────────────────────────────────────── */

function StatCard({ label, value, sub, color }: { label: string; value: string; sub?: string; color?: string }) {
  return (
    <div className="flex flex-col gap-1 p-4 sm:p-5" style={{ borderRight: "1px solid var(--border-subtle)" }}>
      <span className="tag text-[9px] sm:text-[10px]" style={{ color: "var(--text-faint)" }}>{label}</span>
      <span className="mono text-lg sm:text-2xl font-bold tabular-nums" style={{ color: color ?? "var(--text)" }}>{value}</span>
      {sub && <span className="mono text-[10px]" style={{ color: "var(--text-faint)" }}>{sub}</span>}
    </div>
  );
}

function PaySign({ v }: { v: number }) {
  if (v > 0) return <ArrowUpRight size={11} style={{ color: "var(--green)" }} />;
  if (v < 0) return <ArrowDownRight size={11} style={{ color: "var(--red)" }} />;
  return <Minus size={11} style={{ color: "var(--text-faint)" }} />;
}

/* ─── SearchHero ────────────────────────────────────────────────────────────── */

function useSavedWallet(): string | null {
  const { savedAddress } = usePortfolio();
  return savedAddress;
}

function SearchHero({
  input, setInput, onSearch, pending, focused, setFocused, inputRef, error,
}: {
  input: string; setInput: (v: string) => void; onSearch: () => void; pending: boolean;
  focused: boolean; setFocused: (v: boolean) => void;
  inputRef: React.RefObject<HTMLInputElement | null>; error: string | null;
}) {
  const savedWallet = useSavedWallet();

  return (
    <div className="relative flex flex-col items-center justify-center text-center px-5 overflow-hidden"
      style={{ minHeight: 520 }}>

      {/* Ghost funding table */}
      <div className="absolute inset-0 pointer-events-none select-none overflow-hidden"
        style={{
          maskImage: "radial-gradient(ellipse 85% 75% at 50% 50%, transparent 28%, black 68%)",
          WebkitMaskImage: "radial-gradient(ellipse 85% 75% at 50% 50%, transparent 28%, black 68%)",
        }}>
        <div style={{ opacity: 0.12, minWidth: 720, margin: "0 auto", paddingTop: 28 }}>
          <div className="grid items-center px-6 py-2.5"
            style={{ gridTemplateColumns: GHOST_COLS, gap: 10, borderBottom: "1px solid var(--border)" }}>
            {["SYMBOL","SIDE","SIZE","MARK","RATE","EST. NEXT","CUMULATIVE","NEXT SETTLE"].map(h => (
              <span key={h} className="tag text-[9px]" style={{ color: "var(--text-faint)" }}>{h}</span>
            ))}
          </div>
          {GHOST_ROWS.map((r, i) => (
            <div key={i} className="grid items-center px-6"
              style={{ gridTemplateColumns: GHOST_COLS, gap: 10, height: 44, borderBottom: "1px solid var(--border-subtle)" }}>
              <span className="mono text-xs font-bold" style={{ color: "var(--text)" }}>{r.sym}</span>
              <span className="mono text-xs font-bold" style={{ color: r.side === "LONG" ? "var(--green)" : "var(--red)" }}>{r.side}</span>
              <span className="mono text-xs tabular-nums" style={{ color: "var(--text-muted)" }}>{r.size}</span>
              <span className="mono text-xs text-right tabular-nums" style={{ color: "var(--text-muted)" }}>{r.mark}</span>
              <span className="mono text-xs text-right tabular-nums" style={{ color: r.rate.startsWith("+") ? "var(--green)" : "var(--red)" }}>{r.rate}</span>
              <span className="mono text-xs text-right font-bold tabular-nums" style={{ color: r.est.startsWith("+") ? "var(--green)" : "var(--red)" }}>{r.est}</span>
              <span className="mono text-xs text-right tabular-nums" style={{ color: r.cum.startsWith("+") ? "var(--green)" : "var(--red)" }}>{r.cum}</span>
              <span className="mono text-xs text-right" style={{ color: "var(--text-faint)" }}>{r.next}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Foreground */}
      <div className="relative z-10 flex flex-col items-center w-full max-w-[560px]">
        <h1 className="text-[32px] sm:text-[48px] font-bold leading-none tracking-tight mb-4"
          style={{ color: "var(--text)", letterSpacing: "-0.02em" }}>
          Accrued Funding
        </h1>
        <p className="text-sm mb-8 max-w-sm" style={{ color: "var(--text-muted)" }}>
          Enter a wallet address to see estimated funding payments on its current open perpetual positions.
        </p>

        <div className="w-full">
          <div className="relative flex items-center" style={{
            border: `1px solid ${focused ? "var(--accent)" : "var(--border)"}`,
            background: "var(--bg-surface)",
            boxShadow: focused ? "0 0 0 1px var(--accent), 0 0 40px var(--accent-dim)" : "none",
            transition: "border-color 0.15s, box-shadow 0.15s",
          }}>
            {focused && <CornerMarks size={8} inset={-1} thickness={1.5} />}
            <Search size={16} className="absolute left-4 pointer-events-none" style={{ color: "var(--text-faint)" }} />
            <input
              ref={inputRef}
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onFocus={() => setFocused(true)}
              onBlur={() => setFocused(false)}
              onKeyDown={(e) => e.key === "Enter" && onSearch()}
              placeholder="Paste a wallet address  e.g. 0x0879A87D…"
              className="w-full bg-transparent outline-none mono text-sm py-4 pl-11 pr-28"
              style={{ color: "var(--text)", caretColor: "var(--accent)" }}
              spellCheck={false}
              autoComplete="off"
            />
            {input && (
              <button onClick={() => setInput("")}
                className="absolute right-[92px] opacity-50 hover:opacity-100 transition-opacity"
                style={{ color: "var(--text-faint)" }}>
                <X size={14} />
              </button>
            )}
            <button
              onClick={onSearch}
              disabled={pending || !input.trim()}
              className="absolute right-2 sheen-host px-4 py-2 tag font-bold transition-opacity disabled:opacity-40"
              style={{ background: "var(--accent)", color: "var(--accent-fg)" }}
            >
              {pending ? "…" : "CHECK"}
            </button>
          </div>

          {/* Portfolio suggestion */}
          {savedWallet && !input && (
            <div className="mt-3 flex items-center gap-2">
              <span className="mono text-[11px]" style={{ color: "var(--text-faint)" }}>Your wallet:</span>
              <button
                onClick={() => setInput(savedWallet)}
                className="mono text-[11px] underline underline-offset-2 transition-opacity hover:opacity-80"
                style={{ color: "var(--accent)" }}
              >
                {shortAddr(savedWallet)}
              </button>
            </div>
          )}

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

/* ─── Results ───────────────────────────────────────────────────────────────── */

function Results({ wallet, positions, refreshedAt, onRefresh, refreshing }: {
  wallet: string;
  positions: EnrichedPosition[];
  refreshedAt: number;
  onRefresh: () => void;
  refreshing: boolean;
}) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  const nextFundingTime = positions[0]?.nextFundingTime ?? 0;
  const totalEst  = positions.reduce((s, p) => s + p.estimatedPayment, 0);
  const totalCum  = positions.reduce((s, p) => s + p.cumulativeFunding, 0);

  const payColor = (v: number) =>
    v > 0 ? "var(--green)" : v < 0 ? "var(--red)" : "var(--text-faint)";

  const timeAgo = (ts: number) => {
    const s = Math.floor((Date.now() - ts) / 1000);
    if (s < 60) return `${s}s ago`;
    return `${Math.floor(s / 60)}m ago`;
  };

  if (positions.length === 0) {
    return (
      <div className="w-full max-w-[960px] mx-auto px-4 pb-16">
        <div className="flex items-center justify-between mb-4">
          <span className="mono text-xs" style={{ color: "var(--text-faint)" }}>
            {shortAddr(wallet)}
          </span>
          <button onClick={onRefresh} disabled={refreshing}
            className="flex items-center gap-1.5 tag text-[10px] px-3 py-1.5 transition-opacity disabled:opacity-40"
            style={{ border: "1px solid var(--border)", color: "var(--text-faint)" }}>
            <RefreshCw size={11} className={refreshing ? "animate-spin" : ""} />
            REFRESH
          </button>
        </div>
        <div className="flex flex-col items-center justify-center py-20 text-center"
          style={{ border: "1px solid var(--border)", background: "var(--bg-surface)" }}>
          <span className="mono text-sm" style={{ color: "var(--text-faint)" }}>
            No open perps positions found for this wallet.
          </span>
        </div>
      </div>
    );
  }

  return (
    <div className="w-full max-w-[1040px] mx-auto px-4 pb-16">

      {/* Header row */}
      <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
        <div className="flex items-center gap-3">
          <span className="mono text-xs" style={{ color: "var(--text-faint)" }}>{shortAddr(wallet)}</span>
          <span className="tag text-[9px] px-2 py-0.5" style={{ border: "1px solid var(--border)", color: "var(--text-faint)" }}>
            {positions.length} OPEN
          </span>
        </div>
        <div className="flex items-center gap-3">
          <span className="mono text-[10px]" style={{ color: "var(--text-faint)" }}>
            Updated {timeAgo(refreshedAt)}
          </span>
          <button onClick={onRefresh} disabled={refreshing}
            className="flex items-center gap-1.5 tag text-[10px] px-3 py-1.5 transition-opacity disabled:opacity-40"
            style={{ border: "1px solid var(--border)", color: "var(--text-faint)" }}>
            <RefreshCw size={11} className={refreshing ? "animate-spin" : ""} />
            REFRESH
          </button>
        </div>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 mb-6"
        style={{ border: "1px solid var(--border)", background: "var(--bg-surface)" }}>
        <StatCard
          label="NEXT SETTLEMENT"
          value={nextFundingTime ? fmtCountdown(nextFundingTime) : "—"}
          sub={nextFundingTime ? new Date(nextFundingTime).toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", hour12: false, timeZone: "UTC" }) + " UTC" : undefined}
        />
        <StatCard
          label="EST. NEXT PAYMENT"
          value={fmt$(totalEst)}
          sub={totalEst >= 0 ? "you receive" : "you pay"}
          color={payColor(totalEst)}
        />
        <StatCard
          label="CUMULATIVE FUNDING"
          value={fmt$(totalCum)}
          sub="all-time paid/received"
          color={payColor(totalCum)}
        />
        <StatCard
          label="OPEN POSITIONS"
          value={String(positions.length)}
          sub="perps only"
        />
      </div>

      {/* Per-position table */}
      <div style={{ border: "1px solid var(--border)", background: "var(--bg-surface)", overflowX: "auto" }}>
        {/* Table header */}
        <div className="grid items-center px-4 py-3 min-w-[720px]"
          style={{
            gridTemplateColumns: "minmax(90px,1.1fr) 56px 88px 96px 96px 100px 100px 72px",
            gap: 8,
            borderBottom: "1px solid var(--border)",
          }}>
          {["SYMBOL","SIDE","NOTIONAL","MARK","RATE","EST. NEXT","CUMULATIVE","NEXT SETTLE"].map(h => (
            <span key={h} className="tag text-[9px]" style={{ color: "var(--text-faint)" }}>{h}</span>
          ))}
        </div>

        {positions.map((p, i) => {
          const isLast = i === positions.length - 1;
          return (
            <div key={p.id} className="grid items-center px-4 min-w-[720px]"
              style={{
                gridTemplateColumns: "minmax(90px,1.1fr) 56px 88px 96px 96px 100px 100px 72px",
                gap: 8,
                height: 52,
                borderBottom: isLast ? "none" : "1px solid var(--border-subtle)",
              }}>

              {/* Symbol + leverage */}
              <div className="flex items-center gap-2 min-w-0">
                <span className="mono text-xs font-bold truncate" style={{ color: "var(--text)" }}>{p.symbol}</span>
                <span className="tag text-[9px] px-1.5 py-0.5 shrink-0" style={{ border: "1px solid var(--border-subtle)", color: "var(--text-faint)" }}>
                  {p.leverage}×
                </span>
              </div>

              {/* Side */}
              <span className="mono text-xs font-bold" style={{ color: p.side === "LONG" ? "var(--green)" : "var(--red)" }}>
                {p.side}
              </span>

              {/* Notional */}
              <span className="mono text-xs text-right tabular-nums" style={{ color: "var(--text-muted)" }}>
                {fmtUSD(p.notional)}
              </span>

              {/* Mark price */}
              <span className="mono text-xs text-right tabular-nums" style={{ color: "var(--text-muted)" }}>
                ${p.markPrice.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: p.markPrice < 1 ? 5 : 2 })}
              </span>

              {/* Funding rate */}
              <div className="flex items-center justify-end gap-1">
                <span className="mono text-xs tabular-nums font-bold"
                  style={{ color: p.fundingRate >= 0 ? "var(--text-muted)" : "var(--accent)" }}>
                  {fmtRate(p.fundingRate)}
                </span>
              </div>

              {/* Est. next payment */}
              <div className="flex items-center justify-end gap-1">
                <PaySign v={p.estimatedPayment} />
                <span className="mono text-xs font-bold tabular-nums"
                  style={{ color: payColor(p.estimatedPayment) }}>
                  {fmtUSD(Math.abs(p.estimatedPayment))}
                </span>
              </div>

              {/* Cumulative */}
              <div className="flex items-center justify-end gap-1">
                <PaySign v={p.cumulativeFunding} />
                <span className="mono text-xs tabular-nums"
                  style={{ color: payColor(p.cumulativeFunding) }}>
                  {fmtUSD(Math.abs(p.cumulativeFunding))}
                </span>
              </div>

              {/* Countdown */}
              <span className="mono text-xs text-right tabular-nums" style={{ color: "var(--text-faint)" }}>
                {p.nextFundingTime ? fmtCountdown(p.nextFundingTime) : "—"}
              </span>
            </div>
          );
        })}
      </div>

      {/* Legend */}
      <div className="flex flex-wrap items-center gap-4 mt-4 px-1">
        <div className="flex items-center gap-1.5">
          <ArrowUpRight size={12} style={{ color: "var(--green)" }} />
          <span className="mono text-[10px]" style={{ color: "var(--text-faint)" }}>you receive</span>
        </div>
        <div className="flex items-center gap-1.5">
          <ArrowDownRight size={12} style={{ color: "var(--red)" }} />
          <span className="mono text-[10px]" style={{ color: "var(--text-faint)" }}>you pay</span>
        </div>
        <span className="mono text-[10px]" style={{ color: "var(--text-faint)" }}>
          Rate sign: positive = longs pay shorts · negative = shorts pay longs
        </span>
      </div>
    </div>
  );
}

/* ─── Main Page ─────────────────────────────────────────────────────────────── */

export function AccruedFundingPage() {
  const [input, setInput]       = useState("");
  const [focused, setFocused]   = useState(false);
  const [pending, setPending]   = useState(false);
  const [error, setError]       = useState<string | null>(null);
  const [wallet, setWallet]     = useState<string | null>(null);
  const [positions, setPositions] = useState<EnrichedPosition[] | null>(null);
  const [refreshedAt, setRefreshedAt] = useState(0);
  const inputRef = useRef<HTMLInputElement | null>(null);

  const load = useCallback(async (addr: string) => {
    setPending(true);
    setError(null);
    try {
      const [{ positions: raw }, tickers] = await Promise.all([
        fetchState(addr),
        fetchTickers(),
      ]);
      const enriched = enrich(raw, tickers);
      setWallet(addr);
      setPositions(enriched);
      setRefreshedAt(Date.now());
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load. Check the wallet address and try again.");
    } finally {
      setPending(false);
    }
  }, []);

  const onSearch = useCallback(() => {
    const addr = input.trim();
    if (!addr) return;
    void load(addr);
  }, [input, load]);

  const onRefresh = useCallback(() => {
    if (wallet) void load(wallet);
  }, [wallet, load]);

  return (
    <div className="min-h-screen" style={{ background: "var(--bg)" }}>
      <SearchHero
        input={input}
        setInput={setInput}
        onSearch={onSearch}
        pending={pending}
        focused={focused}
        setFocused={setFocused}
        inputRef={inputRef}
        error={wallet ? null : error}
      />

      {wallet && positions !== null && (
        <div className="w-full flex flex-col items-center pt-2">
          {error && (
            <div className="w-full max-w-[1040px] mx-auto px-4 mb-4">
              <div className="flex items-center gap-2 px-4 py-3"
                style={{ border: "1px solid var(--red)", background: "rgba(204,46,46,0.06)" }}>
                <X size={14} style={{ color: "var(--red)" }} />
                <span className="mono text-xs font-bold" style={{ color: "var(--red)" }}>{error}</span>
              </div>
            </div>
          )}
          <Results
            wallet={wallet}
            positions={positions}
            refreshedAt={refreshedAt}
            onRefresh={onRefresh}
            refreshing={pending}
          />
        </div>
      )}
    </div>
  );
}
