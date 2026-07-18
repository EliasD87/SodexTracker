"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  Bot,
  Download,
  FileCode2,
  Terminal,
  TrendingUp,
  Magnet,
  Waves,
  Grid3x3,
  Coins,
  Mountain,
  X,
  Server,
  Copy,
  Check,
  AlertTriangle,
  Search,
  Play,
  Square,
  Radio,
  ArrowUpRight,
  ArrowDownRight,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { Navbar } from "@/components/Navbar";
import {
  runBot,
  fetchClosedCandles,
  fetchFundingScan,
  fetchLiveWindow,
  getOrCreateSession,
  dropSession,
  intervalMs,
  windowLabel,
  type LiveSession,
  type LiveFill,
  type Candle,
  type FundingScan,
} from "@/lib/botEngine";

/**
 * Trading Bots — six single-file Python strategy bots plus an in-browser demo
 * that REPLAYS every simulated order placement bar by bar, then keeps trading
 * live on SoDEX data.
 *
 * No fabricated numbers anywhere on this page: every performance figure is the
 * output of a real backtest run in the browser at page-load over recent live
 * candles (labelled with its actual window), and the funding card reads real
 * current funding rates. Everything remains paper — simulated fills, simulated
 * balance, no keys, nothing can spend real funds.
 */

type Category = "TREND" | "MEAN REVERSION" | "BREAKOUT" | "GRID" | "CARRY";

interface BotDef {
  slug: string;
  name: string;
  icon: LucideIcon;
  tag: Category;
  desc: string;
  defaultSymbol: string;
  defaultInterval: string;
  params: string[];
}

const BOTS: BotDef[] = [
  {
    slug: "momo-cross",
    name: "Momo Cross",
    icon: TrendingUp,
    tag: "TREND",
    desc: "Classic 9/21 EMA crossover, stop-and-reverse. Rides momentum; bleeds in chop, feasts in trends.",
    defaultSymbol: "BTC-USD",
    defaultInterval: "15m",
    params: ["EMA 9/21", "5x lev", "2% risk"],
  },
  {
    slug: "rubber-band",
    name: "Rubber Band",
    icon: Magnet,
    tag: "MEAN REVERSION",
    desc: "Wilder RSI-14 snap-back: buys fear under 30, sells greed over 70, exits at the midline.",
    defaultSymbol: "SOL-USD",
    defaultInterval: "5m",
    params: ["RSI 14", "30/70 bands", "3x lev"],
  },
  {
    slug: "squeeze-rider",
    name: "Squeeze Rider",
    icon: Waves,
    tag: "BREAKOUT",
    desc: "Waits for Bollinger band-width to compress into its tightest quartile, then trades the expansion.",
    defaultSymbol: "ETH-USD",
    defaultInterval: "1h",
    params: ["BB 20/2.0", "25pctl squeeze", "4x lev"],
  },
  {
    slug: "grid-weaver",
    name: "Grid Weaver",
    icon: Grid3x3,
    tag: "GRID",
    desc: "Symmetric grid, 0.4% rungs. Monetises chop tick by tick; accumulates inventory in trends.",
    defaultSymbol: "XRP-USD",
    defaultInterval: "5m",
    params: ["6 rungs", "0.4% step", "2.5% lots"],
  },
  {
    slug: "funding-farmer",
    name: "Funding Farmer",
    icon: Coins,
    tag: "CARRY",
    desc: "Scans every SoDEX perp for extreme funding and farms the payment against the crowded side.",
    defaultSymbol: "BTC-USD",
    defaultInterval: "1h",
    params: ["|rate| ≥ 0.03%", "3m hold", "$1k/farm"],
  },
  {
    slug: "range-breaker",
    name: "Range Breaker",
    icon: Mountain,
    tag: "BREAKOUT",
    desc: "Turtle-style Donchian-20 breakout with a trailing 2×ATR stop. Loses small, lets winners run.",
    defaultSymbol: "HYPE-USD",
    defaultInterval: "30m",
    params: ["Donchian 20", "2×ATR trail", "4x lev"],
  },
];

const CATEGORIES: (Category | "ALL")[] = ["ALL", "TREND", "MEAN REVERSION", "BREAKOUT", "GRID", "CARRY"];
type SortKey = "ret" | "wr" | "trades";
const SORTS: { key: SortKey; label: string }[] = [
  { key: "ret", label: "Return" },
  { key: "wr", label: "Win rate" },
  { key: "trades", label: "Activity" },
];

const SYMBOLS = ["BTC-USD", "ETH-USD", "SOL-USD", "XRP-USD", "HYPE-USD", "BNB-USD", "DOGE-USD"];
const INTERVALS = ["1m", "5m", "15m", "30m", "1h", "4h"];

const tone = (n: number) => (n > 0 ? "var(--green)" : n < 0 ? "var(--red)" : "var(--text-muted)");
const fmt$ = (n: number) => (n >= 0 ? "+" : "−") + "$" + Math.abs(n).toLocaleString("en-US", { maximumFractionDigits: 2 });
const fmtPrice = (p: number) => (p >= 1000 ? p.toLocaleString("en-US", { maximumFractionDigits: 2 }) : p >= 1 ? p.toFixed(4) : p.toFixed(6));
const fmtClock = (t: number) => new Date(t).toLocaleTimeString("en-US", { hour12: false, hour: "2-digit", minute: "2-digit" });

/* ─────────────── real card backtests (run once per page load) ─────────────── */

interface CardStats {
  retPct: number;
  wr: number; // 0-100, NaN when no trades
  trades: number;
  maxDD: number;
  curve: number[];
  window: string;
  symbol: string;
  interval: string;
}

const backtestCache: { stats?: Record<string, CardStats>; funding?: FundingScan } = {};

function useCardBacktests() {
  const [stats, setStats] = useState<Record<string, CardStats> | null>(backtestCache.stats ?? null);
  const [funding, setFunding] = useState<FundingScan | null>(backtestCache.funding ?? null);

  useEffect(() => {
    if (backtestCache.stats && backtestCache.funding) return;
    let alive = true;
    (async () => {
      const priceBots = BOTS.filter((b) => b.slug !== "funding-farmer");
      const [results, scan] = await Promise.all([
        Promise.all(
          priceBots.map(async (b) => {
            try {
              const candles = await fetchClosedCandles(b.defaultSymbol, b.defaultInterval, 300);
              const r = runBot(b.slug, candles);
              return [b.slug, {
                retPct: ((r.equity - r.startBalance) / r.startBalance) * 100,
                wr: r.trades > 0 ? (r.wins / r.trades) * 100 : NaN,
                trades: r.trades,
                maxDD: r.maxDD,
                curve: r.curve.map((p) => p.v),
                window: windowLabel(candles),
                symbol: b.defaultSymbol,
                interval: b.defaultInterval,
              }] as const;
            } catch {
              return [b.slug, null] as const;
            }
          })
        ),
        fetchFundingScan().catch(() => null),
      ]);
      if (!alive) return;
      const map: Record<string, CardStats> = {};
      for (const [slug, s] of results) if (s) map[slug] = s;
      backtestCache.stats = map;
      if (scan) backtestCache.funding = scan;
      setStats(map);
      setFunding(scan);
    })();
    return () => { alive = false; };
  }, []);

  return { stats, funding };
}

/* ─────────────────────────── charts ─────────────────────────── */

function Spark({ curve, up, h = 40 }: { curve: number[]; up: boolean; h?: number }) {
  const W = 260;
  if (curve.length < 2) return <svg viewBox={`0 0 ${W} ${h}`} className="w-full" style={{ height: h }} />;
  const min = Math.min(...curve);
  const max = Math.max(...curve);
  const span = max - min || 1;
  const pts = curve.map((v, i) => `${(i / (curve.length - 1)) * W},${h - 3 - ((v - min) / span) * (h - 6)}`);
  const col = up ? "var(--green)" : "var(--red)";
  return (
    <svg viewBox={`0 0 ${W} ${h}`} className="w-full" style={{ height: h }} preserveAspectRatio="none" aria-hidden>
      <polygon points={`0,${h} ${pts.join(" ")} ${W},${h}`} fill={col} opacity={0.08} />
      <polyline points={pts.join(" ")} fill="none" stroke={col} strokeWidth={1.4} strokeLinejoin="round" opacity={0.9} />
    </svg>
  );
}

/** Price line over recent closed candles with live-session order markers. */
function PriceChart({ candles, fills, startBarT }: { candles: Candle[]; fills: LiveFill[]; startBarT: number }) {
  const W = 640, H = 190, PAD = 6;
  if (candles.length < 2) return <svg viewBox={`0 0 ${W} ${H}`} className="w-full" style={{ height: H }} />;
  const closes = candles.map((c) => c.c);
  const min = Math.min(...closes), max = Math.max(...closes);
  const span = max - min || 1;
  const x = (i: number) => PAD + (i / (candles.length - 1)) * (W - PAD * 2);
  const y = (v: number) => H - PAD - ((v - min) / span) * (H - PAD * 2);
  const idxOf = (barT: number) => {
    let best = candles.length - 1;
    for (let i = candles.length - 1; i >= 0; i--) { if (candles[i].t <= barT) { best = i; break; } }
    return best;
  };
  const startIdx = candles.findIndex((c) => c.t >= startBarT);
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full" style={{ height: H }} preserveAspectRatio="none" aria-hidden>
      <polyline points={closes.map((v, i) => `${x(i)},${y(v)}`).join(" ")} fill="none" stroke="var(--text-faint)" strokeWidth={1.1} opacity={0.8} />
      {startIdx >= 0 && (
        <line x1={x(startIdx)} y1={PAD} x2={x(startIdx)} y2={H - PAD} stroke="var(--accent)" strokeWidth={0.9} opacity={0.55} strokeDasharray="4 3" />
      )}
      {fills.map((f, idx) => {
        const i = idxOf(f.barT);
        const cx = x(i), cy = y(f.price);
        if (f.action === "CLOSE") {
          const col = (f.pnl ?? 0) >= 0 ? "var(--green)" : "var(--red)";
          return (
            <g key={idx}>
              <line x1={cx - 3.4} y1={cy - 3.4} x2={cx + 3.4} y2={cy + 3.4} stroke={col} strokeWidth={1.6} />
              <line x1={cx - 3.4} y1={cy + 3.4} x2={cx + 3.4} y2={cy - 3.4} stroke={col} strokeWidth={1.6} />
            </g>
          );
        }
        const up = f.side === "LONG";
        const col = up ? "var(--green)" : "var(--red)";
        const path = up
          ? `M ${cx} ${cy - 4.6} L ${cx - 4} ${cy + 3} L ${cx + 4} ${cy + 3} Z`
          : `M ${cx} ${cy + 4.6} L ${cx - 4} ${cy - 3} L ${cx + 4} ${cy - 3} Z`;
        return <path key={idx} d={path} fill={col} />;
      })}
    </svg>
  );
}

/* ─────────────────────────── order feed ─────────────────────────── */

function OrderTicket({ f, symbol, fresh }: { f: LiveFill; symbol: string; fresh: boolean }) {
  const isOpen = f.action === "OPEN";
  const buy = isOpen ? f.side === "LONG" : f.side === "SHORT"; // closing a short = buy back
  const base = symbol.split("-")[0];
  return (
    <div
      className="px-3 py-2"
      style={{
        borderBottom: "1px solid var(--border-subtle)",
        animation: fresh ? "botFillIn 0.45s ease-out" : undefined,
        background: fresh ? "var(--green-tint)" : undefined,
        transition: "background 1.2s ease",
      }}
    >
      <div className="flex items-center gap-2">
        <span
          className="mono px-1.5 py-0.5 rounded font-bold"
          style={{ fontSize: 9, background: buy ? "var(--green-tint)" : "rgba(244,63,94,0.12)", color: buy ? "var(--green)" : "var(--red)" }}
        >
          MKT {buy ? "BUY" : "SELL"}
        </span>
        <span className="mono text-[11px] font-semibold" style={{ color: "var(--text)" }}>
          {f.qty.toFixed(f.qty >= 100 ? 2 : 4)} {base}
        </span>
        <span className="mono text-[11px]" style={{ color: "var(--text-muted)" }}>@ {fmtPrice(f.price)}</span>
        <span className="mono ml-auto" style={{ fontSize: 9, color: "var(--text-faint)" }}>{fmtClock(f.t)}</span>
      </div>
      <div className="flex items-center gap-2 mt-1">
        <span className="tag" style={{ fontSize: 8, color: "var(--text-faint)" }}>
          {isOpen ? `OPEN ${f.side}` : `CLOSE ${f.side}`} · FILLED · fee ${f.fee.toFixed(2)}
        </span>
        {f.note && <span className="mono truncate" style={{ fontSize: 9.5, color: "var(--text-faint)" }}>{f.note}</span>}
        {typeof f.pnl === "number" && (
          <span className="mono ml-auto font-bold text-[11px]" style={{ color: tone(f.pnl) }}>{fmt$(f.pnl)}</span>
        )}
      </div>
    </div>
  );
}

function Stat({ label, value, valueTone, sub, subTone }: { label: string; value: string; valueTone?: string; sub?: string; subTone?: string }) {
  return (
    <div className="rounded-xl p-2.5" style={{ background: "var(--bg-surface)", border: "1px solid var(--border)" }}>
      <div className="tag mb-1" style={{ color: "var(--text-faint)", fontSize: 8.5 }}>{label}</div>
      <div className="mono text-[15px] font-bold leading-none" style={{ color: valueTone ?? "var(--text)" }}>{value}</div>
      {sub && <div className="mono text-[10px] mt-1" style={{ color: subTone ?? "var(--text-faint)" }}>{sub}</div>}
    </div>
  );
}

function Row({ k, v, vTone }: { k: string; v: string; vTone?: string }) {
  return (
    <div className="flex items-center justify-between py-0.5">
      <span className="text-[11px]" style={{ color: "var(--text-faint)" }}>{k}</span>
      <span className="mono text-[11.5px] font-semibold" style={{ color: vTone ?? "var(--text)" }}>{v}</span>
    </div>
  );
}

/* ═══════════════════ live demo modal (price bots) ═══════════════════ */

type DemoPhase = "idle" | "loading" | "live" | "error";

function fmtDur(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60);
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m ${s % 60}s`;
  return `${s}s`;
}

/**
 * Forward-only live paper session. Pressing Run starts FLAT with $10k at that
 * moment; the strategy sees candle history for its indicators but only trades
 * on candles that close AFTER the session started. Balance, sizing, holding
 * and fees behave exactly like the downloadable bots. Sessions survive closing
 * the modal — reopen and press Run to keep watching the same account.
 */
function LiveDemoModal({ bot, onClose }: { bot: BotDef; onClose: () => void }) {
  const [symbol, setSymbol] = useState(bot.defaultSymbol);
  const [interval, setIv] = useState(bot.defaultInterval);
  const [phase, setPhase] = useState<DemoPhase>("idle");
  const [session, setSession] = useState<LiveSession | null>(null);
  const [candles, setCandles] = useState<Candle[]>([]);
  const [freshCount, setFreshCount] = useState(0);
  const [, setTick] = useState(0); // rerender pulse for countdown + live marks
  const aliveRef = useRef(true);
  const phaseRef = useRef<DemoPhase>("idle");
  const pollTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const clockTimer = useRef<ReturnType<typeof setInterval> | null>(null);
  const formingT = useRef(0);
  const setPhaseBoth = (p: DemoPhase) => { phaseRef.current = p; setPhase(p); };

  useEffect(() => {
    aliveRef.current = true;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    clockTimer.current = setInterval(() => setTick((x) => x + 1), 1000);
    return () => {
      aliveRef.current = false;
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
      if (pollTimer.current) clearTimeout(pollTimer.current);
      if (clockTimer.current) clearInterval(clockTimer.current);
    };
  }, [onClose]);

  const pollMs = interval === "1m" ? 8000 : interval === "5m" ? 10000 : 15000;

  async function pollOnce(s: LiveSession) {
    if (!aliveRef.current || phaseRef.current !== "live") return;
    try {
      const { closed, livePrice, formingT: fT } = await fetchLiveWindow(symbol, interval, 160);
      if (!aliveRef.current || phaseRef.current !== "live") return;
      formingT.current = fT;
      const newFills = s.handle(closed, livePrice);
      setCandles(closed.slice(-110));
      if (newFills > 0) setFreshCount(newFills);
      setTick((x) => x + 1);
    } catch { /* transient — keep polling */ }
    if (aliveRef.current && phaseRef.current === "live") {
      pollTimer.current = setTimeout(() => pollOnce(s), pollMs);
    }
  }

  function start(reset = false) {
    if (pollTimer.current) clearTimeout(pollTimer.current);
    if (reset) dropSession(bot.slug, symbol, interval);
    const s = getOrCreateSession(bot.slug, symbol, interval, reset);
    setSession(s);
    setFreshCount(0);
    setPhaseBoth("loading");
    (async () => {
      try {
        const { closed, livePrice, formingT: fT } = await fetchLiveWindow(symbol, interval, 160);
        if (!aliveRef.current) return;
        if (closed.length < 90) { setPhaseBoth("error"); return; }
        formingT.current = fT;
        setPhaseBoth("live");
        s.handle(closed, livePrice);
        setCandles(closed.slice(-110));
        setTick((x) => x + 1);
        pollTimer.current = setTimeout(() => pollOnce(s), pollMs);
      } catch {
        if (aliveRef.current) setPhaseBoth("error");
      }
    })();
  }

  function stop() {
    if (pollTimer.current) clearTimeout(pollTimer.current);
    setPhaseBoth("idle"); // session object stays in the store — Run resumes it
  }

  // switching market/interval targets a different session key
  useEffect(() => {
    if (phaseRef.current === "live" || phaseRef.current === "loading") start();
    else setSession(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [symbol, interval]);

  const Icon = bot.icon;
  const running = phase === "live" || phase === "loading";
  const s = session;
  const price = s?.lastPrice ?? 0;
  const equity = s ? s.equity(price) : 0;
  const pnl = s ? equity - s.cfg.startBalance : 0;
  const pnlPct = s ? (pnl / s.cfg.startBalance) * 100 : 0;
  const unreal = s ? s.unrealized(price) : 0;
  const nextBarMs = formingT.current > 0 ? formingT.current + intervalMs(interval) - Date.now() : 0;
  const isGrid = bot.slug === "grid-weaver";
  const lastOpen = s ? [...s.fills].reverse().find((f) => f.action === "OPEN") : undefined;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4" style={{ background: "rgba(0,0,0,0.6)", backdropFilter: "blur(6px)" }} onClick={onClose}>
      <style>{`@keyframes botFillIn { from { opacity: 0; transform: translateY(-6px); } to { opacity: 1; transform: none; } }`}</style>
      <div
        className="relative w-full max-w-[960px] max-h-[92vh] flex flex-col rounded-2xl overflow-hidden"
        style={{ background: "var(--bg-surface)", border: "1px solid var(--border)", boxShadow: "0 24px 64px rgba(0,0,0,0.4)" }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* header */}
        <div className="flex items-center gap-3 px-5 py-3.5 shrink-0" style={{ borderBottom: "1px solid var(--border-subtle)" }}>
          <span className="flex items-center justify-center rounded-lg shrink-0" style={{ width: 34, height: 34, background: "var(--bg-elevated)" }}>
            <Icon size={17} style={{ color: "var(--text)" }} />
          </span>
          <div className="min-w-0">
            <div className="text-[14px] font-semibold leading-tight flex items-center gap-2" style={{ color: "var(--text)" }}>
              {bot.name}
              <span className="tag px-1.5 py-0.5 rounded" style={{ background: "var(--green-tint)", color: "var(--green)" }}>LIVE PAPER</span>
            </div>
            <div className="tag" style={{ color: "var(--text-faint)" }}>
              Forward-only session · trades happen as live candles close · $10,000 start
            </div>
          </div>
          <div className="ml-auto flex items-center gap-2">
            {phase === "live" && (
              <span className="flex items-center gap-1.5 px-2 py-1 rounded-md text-[11px] font-semibold" style={{ background: "var(--green-tint)", color: "var(--green)" }}>
                <Radio size={11} /> LIVE
              </span>
            )}
            <button onClick={onClose} className="w-7 h-7 flex items-center justify-center rounded-full" style={{ background: "var(--bg-elevated)", color: "var(--text-muted)" }} aria-label="Close">
              <X size={14} />
            </button>
          </div>
        </div>

        {/* controls */}
        <div className="flex flex-wrap items-center gap-2 px-5 py-3 shrink-0" style={{ borderBottom: "1px solid var(--border-subtle)" }}>
          <select
            value={symbol}
            onChange={(e) => setSymbol(e.target.value)}
            className="mono text-[12px] font-semibold px-2.5 py-1.5 rounded-lg outline-none cursor-pointer"
            style={{ background: "var(--bg-elevated)", color: "var(--text)", border: "1px solid var(--border)" }}
          >
            {[...new Set([bot.defaultSymbol, ...SYMBOLS])].map((sy) => (
              <option key={sy} value={sy}>{sy}</option>
            ))}
          </select>
          <div className="flex items-center gap-0.5 p-0.5 rounded-lg" style={{ background: "var(--bg-elevated)" }}>
            {INTERVALS.map((iv) => (
              <button
                key={iv}
                onClick={() => setIv(iv)}
                className="mono text-[11px] font-semibold px-2 py-1 rounded-md transition-colors"
                style={{ background: interval === iv ? "var(--bg-surface)" : "transparent", color: interval === iv ? "var(--text)" : "var(--text-faint)" }}
              >
                {iv}
              </button>
            ))}
          </div>
          <div className="ml-auto flex items-center gap-2">
            {s && (s.fills.length > 0 || s.barsSeen > 0) && (
              <button onClick={() => start(true)} className="px-2.5 py-1.5 rounded-lg text-[11px] font-semibold" style={{ background: "var(--bg-elevated)", color: "var(--text-muted)" }}>
                Reset $10k
              </button>
            )}
            {running ? (
              <button onClick={stop} className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-[12px] font-semibold" style={{ background: "var(--bg-elevated)", color: "var(--text)", border: "1px solid var(--border)" }}>
                <Square size={12} /> Pause
              </button>
            ) : (
              <button onClick={() => start(false)} className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-[12px] font-semibold" style={{ background: "var(--accent)", color: "var(--accent-fg)" }}>
                <Play size={12} /> {s ? "Resume session" : "Start live session"}
              </button>
            )}
          </div>
        </div>

        {/* body */}
        <div className="overflow-auto p-5" style={{ background: "var(--bg)" }}>
          {phase === "idle" && !s && (
            <div className="flex flex-col items-center justify-center text-center py-14">
              <Play size={28} style={{ color: "var(--text-faint)" }} />
              <p className="text-[13px] mt-3 max-w-[500px]" style={{ color: "var(--text-muted)" }}>
                Start a <b style={{ color: "var(--text)" }}>live paper session</b>: {bot.name} begins FLAT with $10,000 right now and
                trades <b>{symbol}</b> forward as real {interval} candles close — sizing from its current balance, holding through
                bars, paying fees, exactly like the downloadable bot. Nothing is backtested into the results.
                {isGrid
                  ? " The grid ticks on every live price update, so expect action within minutes."
                  : ` A ${interval} strategy decides once per candle close — give it time to find a signal.`}
              </p>
            </div>
          )}
          {phase === "loading" && (
            <div className="flex flex-col items-center justify-center text-center py-14">
              <div className="w-8 h-8 rounded-full animate-spin" style={{ border: "2px solid var(--border)", borderTopColor: "var(--accent)" }} />
              <p className="text-[12px] mt-3" style={{ color: "var(--text-muted)" }}>Connecting to live {symbol} candles…</p>
            </div>
          )}
          {phase === "error" && (
            <div className="flex flex-col items-center justify-center text-center py-14">
              <AlertTriangle size={26} style={{ color: "var(--red)" }} />
              <p className="text-[13px] mt-3" style={{ color: "var(--text-muted)" }}>Couldn&apos;t load candles for {symbol} {interval}. Try another market or interval.</p>
            </div>
          )}

          {s && phase !== "loading" && phase !== "error" && (
            <>
              {/* session strip */}
              <div className="flex items-center gap-3 flex-wrap mb-3.5">
                <span className="mono text-[11px]" style={{ color: "var(--text-muted)" }}>
                  session {fmtDur(Date.now() - s.startedAt)} · {s.barsSeen} candle{s.barsSeen === 1 ? "" : "s"} closed · px {fmtPrice(price)}
                </span>
                {phase === "live" && !isGrid && nextBarMs > 0 && (
                  <span className="mono text-[11px] px-2 py-0.5 rounded" style={{ background: "var(--bg-elevated)", color: "var(--text-muted)" }}>
                    next decision in {fmtDur(nextBarMs)}
                  </span>
                )}
                {phase === "live" && isGrid && (
                  <span className="mono text-[11px] px-2 py-0.5 rounded" style={{ background: "var(--bg-elevated)", color: "var(--text-muted)" }}>
                    grid ticking every {Math.round(pollMs / 1000)}s
                  </span>
                )}
                {phase === "idle" && (
                  <span className="mono text-[11px] px-2 py-0.5 rounded" style={{ background: "var(--bg-elevated)", color: "var(--text-faint)" }}>
                    PAUSED — position and balance kept
                  </span>
                )}
              </div>

              {/* stat row */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 mb-3.5">
                <Stat label="EQUITY" value={"$" + equity.toLocaleString("en-US", { maximumFractionDigits: 2 })} sub={`${pnl >= 0 ? "+" : ""}${pnlPct.toFixed(3)}%`} subTone={tone(pnl)} />
                <Stat label="SESSION P&L" value={fmt$(pnl)} valueTone={tone(pnl)} />
                <Stat label="CLOSED TRADES" value={String(s.trades)} sub={s.trades > 0 ? `${s.wins}W / ${s.losses}L` : "none yet"} />
                <Stat label="MAX DD" value={`${s.maxDD.toFixed(2)}%`} valueTone="var(--red)" />
              </div>

              {/* price chart */}
              <div className="rounded-xl p-3 mb-3.5" style={{ background: "var(--bg-surface)", border: "1px solid var(--border)" }}>
                <div className="flex items-center justify-between mb-1.5">
                  <span className="tag" style={{ color: "var(--text-faint)" }}>
                    {symbol} · {interval} · dashed line = session start · ▲ open long ▼ open short ✕ close
                  </span>
                  <span className="mono text-[11px]" style={{ color: "var(--text-muted)" }}>live {fmtPrice(price)}</span>
                </div>
                <PriceChart candles={candles} fills={s.fills} startBarT={s.startBarT} />
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-3.5">
                <div>
                  {/* equity */}
                  <div className="rounded-xl p-3 mb-3.5" style={{ background: "var(--bg-surface)", border: "1px solid var(--border)" }}>
                    <div className="tag mb-1" style={{ color: "var(--text-faint)" }}>SESSION EQUITY · marked to live price every poll</div>
                    <Spark curve={s.curve.map((pt) => pt.v)} up={pnl >= 0} h={72} />
                  </div>
                  {/* position */}
                  <div className="rounded-xl p-3" style={{ background: "var(--bg-surface)", border: "1px solid var(--border)" }}>
                    <div className="tag mb-2" style={{ color: "var(--text-faint)" }}>POSITION · LIVE</div>
                    {s.side ? (
                      <>
                        <div className="flex items-center gap-1.5 mb-1.5">
                          {s.side === "LONG" ? <ArrowUpRight size={15} style={{ color: "var(--green)" }} /> : <ArrowDownRight size={15} style={{ color: "var(--red)" }} />}
                          <span className="text-[14px] font-bold" style={{ color: s.side === "LONG" ? "var(--green)" : "var(--red)" }}>{s.side}</span>
                          {lastOpen && (
                            <span className="mono text-[10px] ml-1" style={{ color: "var(--text-faint)" }}>
                              held {fmtDur(Date.now() - lastOpen.t)}
                            </span>
                          )}
                        </div>
                        <Row k="Entry (avg)" v={fmtPrice(s.entry)} />
                        <Row k="Qty" v={s.qty.toFixed(4)} />
                        <Row k="Notional" v={"$" + (s.qty * price).toLocaleString("en-US", { maximumFractionDigits: 0 })} />
                        <Row k="Unrealized" v={fmt$(unreal)} vTone={tone(unreal)} />
                      </>
                    ) : (
                      <div className="text-[13px] font-semibold" style={{ color: "var(--text-muted)" }}>FLAT — waiting for a signal</div>
                    )}
                    <div className="mt-2 pt-2" style={{ borderTop: "1px solid var(--border-subtle)" }}>
                      <Row k="Cash balance" v={"$" + s.balance.toLocaleString("en-US", { maximumFractionDigits: 2 })} />
                      <Row k="Next entry size" v={"$" + (s.balance * s.cfg.riskPct * s.cfg.leverage).toLocaleString("en-US", { maximumFractionDigits: 0 }) + ` margin ${(s.cfg.riskPct * 100).toFixed(1)}% × ${s.cfg.leverage}x`} />
                    </div>
                  </div>
                </div>

                {/* order feed */}
                <div className="rounded-xl overflow-hidden flex flex-col" style={{ background: "var(--bg-surface)", border: "1px solid var(--border)" }}>
                  <div className="tag px-3 py-2 shrink-0 flex items-center justify-between" style={{ color: "var(--text-faint)", borderBottom: "1px solid var(--border-subtle)" }}>
                    <span>SESSION ORDERS</span>
                    <span className="mono" style={{ fontSize: 9 }}>{s.fills.length} fills</span>
                  </div>
                  <div className="overflow-auto" style={{ maxHeight: 360 }}>
                    {s.fills.length === 0 ? (
                      <div className="text-[12px] px-3 py-4" style={{ color: "var(--text-muted)" }}>
                        No orders yet — the session only trades on candles that close from now on.
                      </div>
                    ) : (
                      [...s.fills].reverse().map((f, idx) => (
                        <OrderTicket key={`${f.t}-${f.action}-${idx}`} f={f} symbol={symbol} fresh={idx < freshCount} />
                      ))
                    )}
                  </div>
                </div>
              </div>

              <p className="mono text-[10px] mt-3" style={{ color: "var(--text-faint)" }}>
                Started {new Date(s.startedAt).toLocaleTimeString("en-US", { hour12: false })} with ${s.cfg.startBalance.toLocaleString()} ·
                forward-only, nothing backtested · fills at candle close (grid: live price) · taker fee {(s.cfg.takerFee * 100).toFixed(2)}% ·
                no slippage · paper only. Pause keeps the account; Reset abandons it.
              </p>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

/* ═══════════════════ funding demo modal (real rates) ═══════════════════ */

function FundingDemoModal({ bot, onClose }: { bot: BotDef; onClose: () => void }) {
  const [scan, setScan] = useState<FundingScan | null>(null);
  const [err, setErr] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  const aliveRef = useRef(true);

  useEffect(() => {
    aliveRef.current = true;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    const load = () => fetchFundingScan().then((s) => aliveRef.current && setScan(s)).catch(() => aliveRef.current && setErr(true));
    load();
    const poll = setInterval(load, 15000);
    const clock = setInterval(() => setNow(Date.now()), 1000);
    return () => {
      aliveRef.current = false;
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
      clearInterval(poll);
      clearInterval(clock);
    };
  }, [onClose]);

  const Icon = bot.icon;
  const fmtCountdown = (t: number) => {
    const s = Math.max(0, Math.floor((t - now) / 1000));
    return `${Math.floor(s / 60)}m ${String(s % 60).padStart(2, "0")}s`;
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4" style={{ background: "rgba(0,0,0,0.6)", backdropFilter: "blur(6px)" }} onClick={onClose}>
      <div className="relative w-full max-w-[760px] max-h-[90vh] flex flex-col rounded-2xl overflow-hidden" style={{ background: "var(--bg-surface)", border: "1px solid var(--border)", boxShadow: "0 24px 64px rgba(0,0,0,0.4)" }} onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center gap-3 px-5 py-3.5 shrink-0" style={{ borderBottom: "1px solid var(--border-subtle)" }}>
          <span className="flex items-center justify-center rounded-lg shrink-0" style={{ width: 34, height: 34, background: "var(--bg-elevated)" }}>
            <Icon size={17} style={{ color: "var(--text)" }} />
          </span>
          <div>
            <div className="text-[14px] font-semibold leading-tight flex items-center gap-2" style={{ color: "var(--text)" }}>
              {bot.name}
              <span className="tag px-1.5 py-0.5 rounded" style={{ background: "var(--green-tint)", color: "var(--green)" }}>LIVE SCAN</span>
            </div>
            <div className="tag" style={{ color: "var(--text-faint)" }}>Real funding rates across every SoDEX perp · refreshes every 15s</div>
          </div>
          <button onClick={onClose} className="ml-auto w-7 h-7 flex items-center justify-center rounded-full" style={{ background: "var(--bg-elevated)", color: "var(--text-muted)" }} aria-label="Close">
            <X size={14} />
          </button>
        </div>

        <div className="overflow-auto p-5" style={{ background: "var(--bg)" }}>
          {err && !scan && (
            <div className="text-center py-12 text-[13px]" style={{ color: "var(--text-muted)" }}>Couldn&apos;t load funding rates. Close and retry.</div>
          )}
          {!scan && !err && (
            <div className="flex justify-center py-12">
              <div className="w-8 h-8 rounded-full animate-spin" style={{ border: "2px solid var(--border)", borderTopColor: "var(--accent)" }} />
            </div>
          )}
          {scan && (
            <>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5 mb-4">
                <Stat label="BEST |RATE| NOW" value={scan.best ? `${(Math.abs(scan.best.rate) * 100).toFixed(4)}%` : "—"} sub={scan.best?.symbol} />
                <Stat label="QUALIFYING PAIRS" value={String(scan.qualifying.length)} sub={`|rate| ≥ ${(scan.threshold * 100).toFixed(2)}%`} />
                <Stat label="EST. DAILY YIELD" value={`${scan.estDailyPct >= 0 ? "+" : ""}${scan.estDailyPct.toFixed(3)}%`} valueTone={tone(scan.estDailyPct)} sub="at current rates, $1k/farm" />
              </div>

              <div className="rounded-xl overflow-hidden mb-3" style={{ background: "var(--bg-surface)", border: "1px solid var(--border)" }}>
                <div className="grid grid-cols-[1fr_90px_100px_90px] gap-2 px-3 py-2 tag" style={{ color: "var(--text-faint)", borderBottom: "1px solid var(--border-subtle)" }}>
                  <span>PAIR</span><span className="text-right">RATE</span><span className="text-right">FARM SIDE</span><span className="text-right">NEXT TICK</span>
                </div>
                {scan.all.slice(0, 14).map((t) => {
                  const qualifies = Math.abs(t.rate) >= scan.threshold;
                  return (
                    <div key={t.symbol} className="grid grid-cols-[1fr_90px_100px_90px] gap-2 px-3 py-1.5 items-center" style={{ borderBottom: "1px solid var(--border-subtle)", background: qualifies ? "var(--green-tint)" : undefined }}>
                      <span className="mono text-[11.5px] font-semibold" style={{ color: "var(--text)" }}>
                        {t.symbol}
                        {qualifies && <span className="tag ml-2 px-1 py-0.5 rounded" style={{ background: "var(--bg-surface)", color: "var(--green)", fontSize: 7.5 }}>FARMABLE</span>}
                      </span>
                      <span className="mono text-[11px] text-right font-semibold" style={{ color: t.rate > 0 ? "var(--green)" : t.rate < 0 ? "var(--red)" : "var(--text-muted)" }}>
                        {(t.rate * 100).toFixed(4)}%
                      </span>
                      <span className="mono text-[10.5px] text-right" style={{ color: "var(--text-muted)" }}>
                        {t.rate > 0 ? "SHORT (get paid)" : t.rate < 0 ? "LONG (get paid)" : "—"}
                      </span>
                      <span className="mono text-[10.5px] text-right" style={{ color: "var(--text-faint)" }}>{fmtCountdown(t.nextFundingTime)}</span>
                    </div>
                  );
                })}
              </div>

              <p className="mono text-[10px]" style={{ color: "var(--text-faint)" }}>
                These are the REAL rates the downloadable bot trades on. It opens ~2min before a qualifying tick, against the paying
                side, collects the payment, and closes 3min after. SoDEX has no public funding-history endpoint, so the daily-yield figure
                assumes current rates persist — it is an estimate, not a backtest. Paper only.
              </p>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

/* ═══════════════════ code viewer modal ═══════════════════ */
function highlightPy(line: string, keys: Set<string>): { t: string; c: string }[] {
  const out: { t: string; c: string }[] = [];
  if (/^\s*("""|''')/.test(line)) return [{ t: line, c: "var(--green)" }];
  const hash = line.indexOf("#");
  let rest = line;
  let comment = "";
  if (hash >= 0 && !/["'].*#.*["']/.test(line)) {
    comment = rest.slice(hash);
    rest = rest.slice(0, hash);
  }
  const tokens = rest.split(/(\s+|[(){}[\],:.=+\-*/<>!]|"[^"]*"|'[^']*')/g);
  for (const tk of tokens) {
    if (!tk) continue;
    if (/^["'].*["']$/.test(tk)) out.push({ t: tk, c: "var(--green)" });
    else if (keys.has(tk)) out.push({ t: tk, c: "var(--accent)" });
    else if (/^-?\d[\d_.]*$/.test(tk)) out.push({ t: tk, c: "var(--red)" });
    else out.push({ t: tk, c: "var(--text-muted)" });
  }
  if (comment) out.push({ t: comment, c: "var(--text-faint)" });
  return out;
}
const PY_KEYS = new Set(["def", "class", "return", "if", "elif", "else", "for", "while", "in", "not", "and", "or", "import", "from", "as", "with", "try", "except", "raise", "None", "True", "False", "self", "print", "lambda", "break", "continue", "is", "pass", "global"]);

function CodeModal({ bot, onClose, onRunDemo }: { bot: BotDef; onClose: () => void; onRunDemo: () => void }) {
  const [code, setCode] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    let alive = true;
    fetch(`/bots/src/${bot.slug}.py`)
      .then((r) => r.text())
      .then((t) => alive && setCode(t))
      .catch(() => alive && setCode("# failed to load"));
    return () => { alive = false; };
  }, [bot.slug]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [onClose]);

  const lines = code ? code.replace(/\n$/, "").split("\n") : [];

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4" style={{ background: "rgba(0,0,0,0.6)", backdropFilter: "blur(6px)" }} onClick={onClose}>
      <div className="relative w-full max-w-[820px] max-h-[88vh] flex flex-col rounded-2xl overflow-hidden" style={{ background: "var(--bg-surface)", border: "1px solid var(--border)", boxShadow: "0 24px 64px rgba(0,0,0,0.4)" }} onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center gap-2.5 px-5 py-3.5 shrink-0" style={{ borderBottom: "1px solid var(--border-subtle)" }}>
          <FileCode2 size={16} style={{ color: "var(--text-muted)" }} />
          <span className="mono text-[13px] font-semibold" style={{ color: "var(--text)" }}>{bot.slug}/bot.py</span>
          <span className="tag hidden sm:inline" style={{ color: "var(--text-faint)" }}>STRATEGY FILE · FULL PACKAGE IN THE ZIP · PAPER MODE</span>
          <div className="ml-auto flex items-center gap-1.5">
            <button onClick={onRunDemo} className="flex items-center gap-1 px-2 py-1 rounded-md text-[11px] font-semibold" style={{ background: "var(--green-tint)", color: "var(--green)" }}>
              <Play size={12} /> demo
            </button>
            <button
              onClick={() => {
                if (code) navigator.clipboard?.writeText(code).catch(() => {});
                setCopied(true);
                setTimeout(() => setCopied(false), 1500);
              }}
              className="flex items-center gap-1 px-2 py-1 rounded-md text-[11px] font-semibold"
              style={{ background: "var(--bg-elevated)", color: "var(--text)" }}
            >
              {copied ? <Check size={12} style={{ color: "var(--green)" }} /> : <Copy size={12} />}
              {copied ? "copied" : "copy"}
            </button>
            <a href={`/bots/${bot.slug}.zip`} download className="flex items-center gap-1 px-2 py-1 rounded-md text-[11px] font-semibold" style={{ background: "var(--accent)", color: "var(--accent-fg)" }}>
              <Download size={12} /> download .zip
            </a>
            <button onClick={onClose} className="w-7 h-7 flex items-center justify-center rounded-full" style={{ background: "var(--bg-elevated)", color: "var(--text-muted)" }} aria-label="Close">
              <X size={14} />
            </button>
          </div>
        </div>
        <div className="overflow-auto" style={{ background: "var(--bg)" }}>
          {code === null ? (
            <div className="h-40 m-4 rounded-lg animate-pulse" style={{ background: "var(--bg-elevated)" }} />
          ) : (
            <div className="mono text-[11px] leading-[1.55] py-3">
              {lines.map((ln, i) => (
                <div key={i} className="flex px-4 hover:bg-[var(--bg-surface)]">
                  <span className="select-none text-right pr-4 shrink-0" style={{ color: "var(--text-faint)", width: 40, opacity: 0.5 }}>{i + 1}</span>
                  <span className="whitespace-pre">
                    {highlightPy(ln, PY_KEYS).map((s, j) => (
                      <span key={j} style={{ color: s.c }}>{s.t}</span>
                    ))}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/* ═══════════════════════════════ page ═══════════════════════════════ */
export function TradingBotsPage() {
  const [viewing, setViewing] = useState<BotDef | null>(null);
  const [demo, setDemo] = useState<BotDef | null>(null);
  const [cat, setCat] = useState<Category | "ALL">("ALL");
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<SortKey>("ret");
  const { stats, funding } = useCardBacktests();

  const bots = useMemo(() => {
    let list = BOTS.filter((b) => cat === "ALL" || b.tag === cat);
    if (query.trim()) {
      const q = query.toLowerCase();
      list = list.filter((b) => (b.name + " " + b.desc + " " + b.tag + " " + b.defaultSymbol).toLowerCase().includes(q));
    }
    if (stats) {
      const key = (b: BotDef): number => {
        const s = stats[b.slug];
        if (!s) return -Infinity;
        if (sort === "ret") return s.retPct;
        if (sort === "wr") return Number.isNaN(s.wr) ? -1 : s.wr;
        return s.trades;
      };
      list = [...list].sort((a, b) => key(b) - key(a));
    }
    return list;
  }, [cat, query, sort, stats]);

  return (
    <main>
      <Navbar />

      <div className="max-w-[1200px] mx-auto px-5 sm:px-8 pt-24 pb-24">
        {/* header */}
        <div className="mb-5">
          <div className="flex items-center gap-2 mb-2">
            <span className="tag px-1.5 py-0.5 rounded" style={{ background: "var(--green-tint)", color: "var(--green)", letterSpacing: "0.05em" }}>BETA</span>
            <span className="text-[11px] font-medium" style={{ color: "var(--text-faint)" }}>Six strategies, one zip each — strategy, hardened core, risk manager, .env config.</span>
          </div>
          <h1 className="text-[28px] sm:text-[34px] font-semibold tracking-tight" style={{ color: "var(--text)" }}>Trading Bots</h1>
          <p className="text-[14px] mt-1.5 max-w-[680px]" style={{ color: "var(--text-muted)" }}>
            Downloadable Python bots that paper-trade live SoDEX data. Every number below is a{" "}
            <b style={{ color: "var(--text)" }}>real backtest run in your browser right now</b> — and the demo replays every single
            order so you can watch each strategy actually trade.
          </p>
        </div>

        {/* local-first notice */}
        <div className="flex items-start gap-3 rounded-[14px] px-4 py-3.5 mb-5" style={{ background: "var(--bg-surface)", border: "1px solid var(--border)" }}>
          <Server size={16} style={{ color: "var(--text-muted)", marginTop: 2, flexShrink: 0 }} />
          <div className="text-[12px] leading-relaxed" style={{ color: "var(--text-muted)" }}>
            <b style={{ color: "var(--text)" }}>Local-first & paper by design.</b> The bots run on <b>your machine</b> in{" "}
            <b>paper mode</b> — simulated fills, simulated balance, live SoDEX prices. SoDEX signs every real order with an API key
            only you hold, so <b>live execution will only ever run locally with your own key</b> — these servers never touch it.
          </div>
        </div>

        {/* filter / search / sort */}
        <div className="flex flex-col sm:flex-row sm:items-center gap-2.5 mb-5">
          <div className="flex items-center gap-1 flex-wrap">
            {CATEGORIES.map((c) => (
              <button
                key={c}
                onClick={() => setCat(c)}
                className="text-[11.5px] font-semibold px-2.5 py-1.5 rounded-lg transition-colors"
                style={{
                  background: cat === c ? "var(--accent)" : "var(--bg-surface)",
                  color: cat === c ? "var(--accent-fg)" : "var(--text-muted)",
                  border: "1px solid " + (cat === c ? "var(--accent)" : "var(--border)"),
                }}
              >
                {c === "ALL" ? "All" : c.charAt(0) + c.slice(1).toLowerCase()}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-2 sm:ml-auto">
            <div className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg" style={{ background: "var(--bg-surface)", border: "1px solid var(--border)" }}>
              <Search size={13} style={{ color: "var(--text-faint)" }} />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search strategies…"
                className="bg-transparent outline-none text-[12px] w-[140px]"
                style={{ color: "var(--text)" }}
              />
            </div>
            <div className="flex items-center gap-0.5 p-0.5 rounded-lg" style={{ background: "var(--bg-surface)", border: "1px solid var(--border)" }}>
              {SORTS.map((s) => (
                <button
                  key={s.key}
                  onClick={() => setSort(s.key)}
                  className="text-[11px] font-semibold px-2 py-1 rounded-md transition-colors"
                  style={{ background: sort === s.key ? "var(--bg-elevated)" : "transparent", color: sort === s.key ? "var(--text)" : "var(--text-faint)" }}
                >
                  {s.label}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* bot grid */}
        {bots.length === 0 ? (
          <div className="text-center py-16 text-[13px]" style={{ color: "var(--text-muted)" }}>No strategies match that filter.</div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 mb-8">
            {bots.map((b) => {
              const Icon = b.icon;
              const s = stats?.[b.slug];
              const isFunding = b.slug === "funding-farmer";
              return (
                <div key={b.slug} className="rounded-[14px] p-4 flex flex-col transition-transform hover:-translate-y-0.5" style={{ background: "var(--bg-surface)", border: "1px solid var(--border)" }}>
                  <div className="flex items-start gap-2.5 mb-2.5">
                    <span className="flex items-center justify-center rounded-lg shrink-0" style={{ width: 34, height: 34, background: "var(--bg-elevated)" }}>
                      <Icon size={16} style={{ color: "var(--text)" }} />
                    </span>
                    <div className="min-w-0">
                      <div className="text-[14.5px] font-semibold leading-tight" style={{ color: "var(--text)" }}>{b.name}</div>
                      <div className="tag mt-0.5" style={{ color: "var(--text-faint)" }}>{b.tag} · {isFunding ? "ALL PERPS" : `${b.defaultSymbol} · ${b.defaultInterval}`}</div>
                    </div>
                  </div>

                  <p className="text-[11.5px] leading-snug mb-3" style={{ color: "var(--text-muted)" }}>{b.desc}</p>

                  <div className="flex items-center gap-1.5 flex-wrap mb-3">
                    {b.params.map((p) => (
                      <span key={p} className="mono text-[9px] px-1.5 py-0.5 rounded" style={{ background: "var(--bg-elevated)", color: "var(--text-muted)" }}>{p}</span>
                    ))}
                  </div>

                  {/* REAL performance — live backtest / live scan */}
                  <div className="rounded-lg p-2.5 mb-3" style={{ background: "var(--bg-elevated)" }}>
                    {isFunding ? (
                      funding ? (
                        <>
                          <div className="flex items-center justify-between mb-1">
                            <span className="tag" style={{ color: "var(--text-faint)", fontSize: 8 }}>LIVE SCAN · REAL CURRENT RATES</span>
                            <span className="mono text-[12px] font-bold" style={{ color: tone(funding.estDailyPct) }}>
                              {funding.estDailyPct >= 0 ? "+" : ""}{funding.estDailyPct.toFixed(3)}%/d
                            </span>
                          </div>
                          <div className="grid grid-cols-3 gap-1 mt-1.5">
                            {[
                              ["BEST RATE", funding.best ? `${(Math.abs(funding.best.rate) * 100).toFixed(3)}%` : "—"],
                              ["BEST PAIR", funding.best?.symbol.replace("-USD", "") ?? "—"],
                              ["FARMABLE", String(funding.qualifying.length)],
                            ].map(([l, v]) => (
                              <div key={l} className="text-center">
                                <div className="tag" style={{ color: "var(--text-faint)", fontSize: 7.5 }}>{l}</div>
                                <div className="mono text-[10.5px] font-semibold" style={{ color: "var(--text)" }}>{v}</div>
                              </div>
                            ))}
                          </div>
                          <div className="tag mt-1.5 text-center" style={{ color: "var(--text-faint)", fontSize: 7 }}>YIELD EST. ASSUMES CURRENT RATES PERSIST</div>
                        </>
                      ) : (
                        <div className="h-[76px] rounded animate-pulse" style={{ background: "var(--bg-surface)" }} />
                      )
                    ) : s ? (
                      <>
                        <div className="flex items-center justify-between mb-1">
                          <span className="tag" style={{ color: "var(--text-faint)", fontSize: 8 }}>LIVE BACKTEST · LAST {s.window.toUpperCase()}</span>
                          <span className="mono text-[12px] font-bold" style={{ color: tone(s.retPct) }}>{s.retPct >= 0 ? "+" : ""}{s.retPct.toFixed(2)}%</span>
                        </div>
                        <Spark curve={s.curve} up={s.retPct >= 0} />
                        <div className="grid grid-cols-3 gap-1 mt-1.5">
                          {[
                            ["WIN", Number.isNaN(s.wr) ? "—" : `${s.wr.toFixed(0)}%`],
                            ["MAX DD", `${s.maxDD.toFixed(1)}%`],
                            ["TRADES", String(s.trades)],
                          ].map(([l, v]) => (
                            <div key={l} className="text-center">
                              <div className="tag" style={{ color: "var(--text-faint)", fontSize: 7.5 }}>{l}</div>
                              <div className="mono text-[10.5px] font-semibold" style={{ color: l === "MAX DD" ? "var(--red)" : "var(--text)" }}>{v}</div>
                            </div>
                          ))}
                        </div>
                      </>
                    ) : (
                      <div className="h-[104px] rounded animate-pulse flex items-center justify-center" style={{ background: "var(--bg-surface)" }}>
                        <span className="tag" style={{ color: "var(--text-faint)", fontSize: 8 }}>RUNNING LIVE BACKTEST…</span>
                      </div>
                    )}
                  </div>

                  <div className="mt-auto flex flex-col gap-2">
                    <button
                      onClick={() => setDemo(b)}
                      className="w-full flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-[12px] font-semibold"
                      style={{ background: "var(--accent)", color: "var(--accent-fg)" }}
                    >
                      <Play size={13} /> {isFunding ? "Open live scanner" : "Run live demo"}
                    </button>
                    <div className="flex items-center gap-2">
                      <a
                        href={`/bots/${b.slug}.zip`}
                        download
                        className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-[12px] font-semibold"
                        style={{ background: "var(--bg-elevated)", color: "var(--text)" }}
                      >
                        <Download size={13} /> .zip
                      </a>
                      <button
                        onClick={() => setViewing(b)}
                        className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-[12px] font-semibold"
                        style={{ background: "var(--bg-elevated)", color: "var(--text)" }}
                      >
                        <FileCode2 size={13} /> Code
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* how to run */}
        <div className="rounded-[14px] p-4 sm:p-5 mb-6" style={{ background: "var(--bg-surface)", border: "1px solid var(--border)" }}>
          <div className="flex items-center gap-2 mb-3">
            <Terminal size={15} style={{ color: "var(--text-muted)" }} />
            <span className="text-[13px] font-semibold" style={{ color: "var(--text)" }}>Run one locally in 60 seconds</span>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            {[
              ["1", "Have Python 3.10+", "python --version — that's the only requirement. No pip installs, ever."],
              ["2", "Download & unzip", "bot.py (the strategy) + core/ (API client, broker, risk manager) + .env.example + README. Copy .env.example to .env to tune anything."],
              ["3", "Run it", "python bot.py ETH-USD — resumable state, trades CSV and equity log land in data/. Ctrl-C to stop; rerun to resume."],
            ].map(([n, t, d]) => (
              <div key={n} className="rounded-lg p-3" style={{ background: "var(--bg-elevated)" }}>
                <div className="flex items-center gap-2 mb-1">
                  <span className="mono flex items-center justify-center w-5 h-5 rounded-full text-[10px] font-bold" style={{ background: "var(--accent)", color: "var(--accent-fg)" }}>{n}</span>
                  <span className="text-[12px] font-semibold" style={{ color: "var(--text)" }}>{t}</span>
                </div>
                <p className="mono text-[10.5px] leading-relaxed" style={{ color: "var(--text-muted)" }}>{d}</p>
              </div>
            ))}
          </div>
        </div>

        {/* roadmap */}
        <div className="flex items-center gap-2 flex-wrap mb-6">
          {[
            ["NOW", "In-browser live demo + local paper", true],
            ["PLANNED", "Hosted 24/7 deployment", false],
            ["PLANNED", "Live execution, local key-gated per order", false],
          ].map(([tag, label, now]) => (
            <span key={label as string} className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-full text-[10.5px]" style={{ background: now ? "var(--green-tint)" : "var(--bg-elevated)", color: now ? "var(--green)" : "var(--text-faint)" }}>
              <Bot size={11} /> <b>{tag}</b> {label}
            </span>
          ))}
        </div>

        {/* disclaimer */}
        <div className="flex items-start gap-2.5 rounded-[14px] px-4 py-3.5" style={{ background: "var(--bg-elevated)" }}>
          <AlertTriangle size={14} style={{ color: "var(--text-faint)", marginTop: 1.5, flexShrink: 0 }} />
          <p className="text-[10.5px] leading-relaxed" style={{ color: "var(--text-faint)" }}>
            Card figures are <b>real backtests computed in your browser at page load</b> over each strategy&apos;s recent candle window
            (shown on the card) — taker fees applied, no slippage or queue modelling, fills at candle close. They change every time the
            market does, and a short recent window is noisy: it describes each strategy&apos;s current form, not expected returns.
            The funding card reads real current rates and estimates yield only if those rates persist. Past performance ≠ future
            performance. Everything is paper-only; nothing on this page can spend real funds.
          </p>
        </div>
      </div>

      {viewing && <CodeModal bot={viewing} onClose={() => setViewing(null)} onRunDemo={() => { const b = viewing; setViewing(null); setDemo(b); }} />}
      {demo && (demo.slug === "funding-farmer"
        ? <FundingDemoModal bot={demo} onClose={() => setDemo(null)} />
        : <LiveDemoModal bot={demo} onClose={() => setDemo(null)} />)}
    </main>
  );
}
