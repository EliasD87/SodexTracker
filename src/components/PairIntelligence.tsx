"use client";

import { useEffect, useMemo, useState } from "react";
import { Search, Crosshair, Globe, Activity, Mountain, Scale, Lightbulb } from "lucide-react";
import { cachedApiFetch } from "@/lib/fetchCache";
import { TokenIcon } from "@/components/TokenIcon";
import { tickerLabel } from "@/lib/tokenIcons";
import { sodexBaseToStockTicker, PREWARMED_PAIR_BASES } from "@/lib/indexMeta";

/**
 * Pair Intelligence — a per-pair cross-read of SoDEX's own venue data
 * (mark, funding, OI, volume, spot availability) against the asset's GLOBAL
 * market context from SoSoValue (global price, cycle position vs ATH/low,
 * valuation/dilution, 35d realized range & momentum). Every number is real;
 * the intelligence is the comparison. Reads are sign-based observations,
 * never advice.
 */

const GW = "https://mainnet-gw.sodex.dev/api/v1";
const VIOLET = "#7C6BF0";

/* ── SoDEX shapes ── */
interface PerpSym {
  name: string;
  baseCoin: string;
}
interface PerpTick {
  symbol: string;
  lastPx: string;
  highPx: string;
  lowPx: string;
  quoteVolume: string;
  changePct: number;
  markPrice: string;
  indexPrice: string;
  fundingRate: string;
  openInterest: string;
}
interface SpotTick {
  symbol: string;
  quoteVolume: string;
}

/* ── SoSoValue payload (mirrors /api/sosovalue/pair-intel) ── */
interface GlobalSnapshot {
  price: number;
  change_pct_24h: number;
  turnover_24h: number;
  marketcap: number;
  fdv: number;
  circulating_supply: string;
  total_supply: string;
  ath: number;
  down_from_ath: number;
  cycle_low: number;
  up_from_cycle_low: number;
  marketcap_rank: number;
}
interface PairKline {
  t: number;
  h: number;
  l: number;
  c: number;
}
interface PairIntel {
  base: string;
  name: string;
  ticker: string;
  factor: number;
  snapshot: GlobalSnapshot;
  klines: PairKline[];
}

/* ── formatting ── */
const $big = (n: number) =>
  "$" + (n >= 1e12 ? (n / 1e12).toFixed(2) + "T" : n >= 1e9 ? (n / 1e9).toFixed(2) + "B" : n >= 1e6 ? (n / 1e6).toFixed(2) + "M" : n >= 1e3 ? (n / 1e3).toFixed(1) + "K" : n.toFixed(0));
const $px = (n: number) =>
  "$" + (n >= 10_000 ? n.toLocaleString("en-US", { maximumFractionDigits: 0 }) : n >= 100 ? n.toFixed(2) : n >= 1 ? n.toFixed(4) : n.toFixed(6));
const pct = (n: number, dp = 2) => (n >= 0 ? "+" : "") + (n * 100).toFixed(dp) + "%";
const tone = (n: number) => (n > 0 ? "var(--green)" : n < 0 ? "var(--red)" : "var(--text-muted)");

/* ── tiny line sparkline (single series — title names it, no legend needed) ── */
function Sparkline({ closes }: { closes: number[] }) {
  if (closes.length < 2) return null;
  const W = 320;
  const H = 48;
  const min = Math.min(...closes);
  const max = Math.max(...closes);
  const span = max - min || 1;
  const pts = closes.map((c, i) => `${(i / (closes.length - 1)) * W},${H - 4 - ((c - min) / span) * (H - 8)}`);
  const [lx, ly] = pts[pts.length - 1].split(",").map(Number);
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full" style={{ height: H }} role="img" aria-label="35-day global price">
      <polyline points={pts.join(" ")} fill="none" stroke={VIOLET} strokeWidth={1.6} strokeLinejoin="round" strokeLinecap="round" />
      <circle cx={lx} cy={ly} r={2.6} fill={VIOLET} />
    </svg>
  );
}

/* ── cycle meter: low ↔ ATH with current price positioned ── */
function CycleMeter({ s }: { s: GlobalSnapshot }) {
  const span = s.ath - s.cycle_low;
  const pos = span > 0 ? Math.min(1, Math.max(0, (s.price - s.cycle_low) / span)) : 0;
  return (
    <div>
      <div className="relative h-1.5 rounded-full" style={{ background: "var(--bg-elevated)" }}>
        <div className="absolute inset-y-0 left-0 rounded-full" style={{ width: `${pos * 100}%`, background: `rgba(124,107,240,0.45)` }} />
        <div
          className="absolute w-2.5 h-2.5 rounded-full"
          style={{ left: `${pos * 100}%`, top: "50%", transform: "translate(-50%, -50%)", background: VIOLET, boxShadow: "0 0 0 2px var(--bg-surface)" }}
        />
      </div>
      <div className="flex items-center justify-between mt-1.5">
        <span className="mono text-[9.5px]" style={{ color: "var(--text-faint)" }}>
          LOW {$px(s.cycle_low)} <b style={{ color: "var(--green)" }}>{pct(s.up_from_cycle_low, 0)}</b>
        </span>
        <span className="mono text-[9.5px]" style={{ color: "var(--text-faint)" }}>
          <b style={{ color: "var(--red)" }}>−{(s.down_from_ath * 100).toFixed(0)}%</b> ATH {$px(s.ath)}
        </span>
      </div>
    </div>
  );
}

function StatBlock({ label, value, sub, color }: { label: string; value: string; sub?: React.ReactNode; color?: string }) {
  return (
    <div className="rounded-lg p-2.5" style={{ background: "var(--bg-elevated)" }}>
      <div className="tag mb-1" style={{ color: "var(--text-faint)", fontSize: 8.5 }}>{label}</div>
      <div className="mono text-[13px] font-semibold" style={{ color: color ?? "var(--text)" }}>{value}</div>
      {sub && <div className="mono text-[9.5px] mt-0.5" style={{ color: "var(--text-faint)" }}>{sub}</div>}
    </div>
  );
}

interface BoardRow {
  base: string;
  downAth: number;
  rank: number;
}

/* ─────────────────────────────── main ─────────────────────────────── */
export function PairIntelligence() {
  const [pairs, setPairs] = useState<PerpSym[]>([]);
  const [ticks, setTicks] = useState<Map<string, PerpTick>>(new Map());
  const [spotVol, setSpotVol] = useState<Map<string, number>>(new Map());
  const [base, setBase] = useState("BTC");
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [intel, setIntel] = useState<PairIntel | null>(null);
  const [state, setState] = useState<"loading" | "ready" | "unmapped" | "error">("loading");
  const [board, setBoard] = useState<BoardRow[] | null>(null);

  /* SoDEX venue data (one shot, cached client-side) */
  useEffect(() => {
    let alive = true;
    Promise.all([
      cachedApiFetch<PerpSym[]>(`${GW}/perps/markets/symbols`).catch(() => [] as PerpSym[]),
      cachedApiFetch<PerpTick[]>(`${GW}/perps/markets/tickers`).catch(() => [] as PerpTick[]),
      cachedApiFetch<SpotTick[]>(`${GW}/spot/markets/tickers`).catch(() => [] as SpotTick[]),
    ]).then(([syms, tks, spot]) => {
      if (!alive) return;
      setPairs(syms);
      setTicks(new Map(tks.map((t) => [t.symbol, t])));
      const sv = new Map<string, number>();
      for (const s of spot) {
        const lbl = tickerLabel(s.symbol);
        sv.set(lbl, (sv.get(lbl) ?? 0) + (parseFloat(s.quoteVolume) || 0));
      }
      setSpotVol(sv);
    });
    return () => {
      alive = false;
    };
  }, []);

  /* SoSoValue global context per selected base */
  useEffect(() => {
    let alive = true;
    setState("loading");
    setIntel(null);
    cachedApiFetch<PairIntel>(`/api/sosovalue/pair-intel/${base}`)
      .then((d) => {
        if (!alive) return;
        setIntel(d);
        setState("ready");
      })
      .catch((e: Error) => {
        if (!alive) return;
        setState(e.message?.includes("No global") ? "unmapped" : "error");
      });
    return () => {
      alive = false;
    };
  }, [base]);

  /* multi-pair board: lite global context (snapshot only — one upstream call
   * per pair) for the top crypto pairs by venue volume */
  useEffect(() => {
    if (!pairs.length || !ticks.size || board !== null) return;
    let alive = true;
    const vol = (b: string) => parseFloat(ticks.get(`${b}-USD`)?.quoteVolume ?? "0") || 0;
    // Board requests ONLY pre-warmed bases — guaranteed Supabase hits, never a
    // live SoSoValue call (volume-rotating pairs otherwise leak direct fetches).
    const candidates = [...new Set(pairs.map((p) => p.baseCoin))]
      .filter((b) => PREWARMED_PAIR_BASES.has(b.toUpperCase()))
      .sort((a, b) => vol(b) - vol(a))
      .slice(0, 14);
    Promise.all(
      candidates.map((b) =>
        cachedApiFetch<PairIntel>(`/api/sosovalue/pair-intel/${b}?lite=1`)
          .then((d): BoardRow => ({ base: b, downAth: d.snapshot.down_from_ath, rank: d.snapshot.marketcap_rank }))
          .catch(() => null),
      ),
    ).then((rows) => {
      if (alive) setBoard(rows.filter((r): r is BoardRow => r !== null).slice(0, 10));
    });
    return () => {
      alive = false;
    };
  }, [pairs, ticks, board]);

  const options = useMemo(() => {
    const q = query.toLowerCase();
    return pairs
      // Only pairs we actually have SoSoValue data for (pre-warmed in Supabase).
      // Anything else would open into an error/unmapped state — a live fetch that
      // has no API key on the server. Keeps the picker consistent with the board.
      .filter((p) => PREWARMED_PAIR_BASES.has(p.baseCoin.toUpperCase()))
      .filter((p) => p.baseCoin.toLowerCase().includes(q))
      .sort((a, b) => (parseFloat(ticks.get(`${b.baseCoin}-USD`)?.quoteVolume ?? "0") || 0) - (parseFloat(ticks.get(`${a.baseCoin}-USD`)?.quoteVolume ?? "0") || 0));
  }, [pairs, ticks, query]);

  const tick = ticks.get(`${base}-USD`);
  const hasSpot = spotVol.has(base);
  const sVol = spotVol.get(base) ?? 0;

  /* ── derived cross-read (all real, all sign-based) ── */
  const d = useMemo(() => {
    if (!intel || !tick) return null;
    const s = intel.snapshot;
    const mark = parseFloat(tick.markPrice);
    // Venue premium = mark vs SoDEX's LIVE index oracle (global composite).
    // Never vs the SoSoValue snapshot — it can be ≤15m stale, which fabricates
    // huge phantom premiums whenever the market moves (verified live).
    const idx = parseFloat(tick.indexPrice) || 0;
    const premiumBps = idx > 0 ? ((mark - idx) / idx) * 1e4 : 0;
    const pVol = parseFloat(tick.quoteVolume) || 0;
    const oiUsd = (parseFloat(tick.openInterest) || 0) * mark;
    const funding = parseFloat(tick.fundingRate) || 0;
    const volShareBps = s.turnover_24h > 0 ? ((pVol + sVol) / s.turnover_24h) * 1e4 : 0;
    const closes = intel.klines.map((k) => k.c);
    const mom7 = closes.length > 7 ? closes[closes.length - 1] / closes[closes.length - 8] - 1 : null;
    const avgRange = intel.klines.length > 5 ? intel.klines.reduce((sum, k) => sum + (k.h - k.l) / k.c, 0) / intel.klines.length : null;
    const last = parseFloat(tick.lastPx) || mark;
    const todayRange = last > 0 ? (parseFloat(tick.highPx) - parseFloat(tick.lowPx)) / last : 0;
    const rangeRatio = avgRange && avgRange > 0 ? todayRange / avgRange : null;
    const dilution = s.marketcap > 0 ? s.fdv / s.marketcap - 1 : 0;
    const circPct = parseFloat(s.total_supply) > 0 ? parseFloat(s.circulating_supply) / parseFloat(s.total_supply) : 1;

    const reads: { icon: typeof Lightbulb; text: string; tone: string }[] = [];
    // Funding below ~0.0001% is noise — its sign carries no positioning signal.
    if (mom7 != null && Math.abs(funding) >= 1e-6) {
      const aligned = Math.sign(funding) === Math.sign(mom7);
      reads.push({
        icon: Activity,
        text: aligned
          ? `SoDEX funding (${pct(funding, 4)}) is aligned with the 7d global trend (${pct(mom7)}) — the crowd is paying to ride the move.`
          : `SoDEX funding (${pct(funding, 4)}) leans against the 7d global trend (${pct(mom7)}) — the crowd is positioned counter-trend.`,
        tone: aligned ? "var(--text-muted)" : VIOLET,
      });
    }
    if (rangeRatio != null && (rangeRatio > 1.5 || rangeRatio < 0.6)) {
      reads.push({
        icon: Activity,
        text: rangeRatio > 1.5
          ? `Today's SoDEX range is ${rangeRatio.toFixed(1)}× the 35d average daily range — volatility expansion.`
          : `Today's SoDEX range is only ${rangeRatio.toFixed(1)}× the 35d average — volatility compression.`,
        tone: rangeRatio > 1.5 ? "var(--red)" : "var(--text-muted)",
      });
    }
    if (s.down_from_ath >= 0.5 && funding >= 1e-6) {
      reads.push({
        icon: Mountain,
        text: `${intel.ticker} sits ${(s.down_from_ath * 100).toFixed(0)}% below its ATH, yet SoDEX funding is positive — longs are paying in a deep drawdown.`,
        tone: VIOLET,
      });
    }
    if (dilution > 0.3) {
      reads.push({
        icon: Scale,
        text: `FDV runs ${(dilution * 100).toFixed(0)}% above market cap (${(circPct * 100).toFixed(0)}% of supply circulating) — meaningful future-unlock overhang.`,
        tone: "var(--text-muted)",
      });
    }
    if (Math.abs(premiumBps) > 20) {
      reads.push({
        icon: Crosshair,
        text: `SoDEX marks ${Math.abs(premiumBps).toFixed(1)} bps ${premiumBps > 0 ? "above" : "below"} its live global index oracle — a real venue dislocation.`,
        tone: tone(premiumBps),
      });
    }

    return { s, mark, premiumBps, pVol, oiUsd, funding, volShareBps, mom7, rangeRatio, dilution, circPct, closes, reads: reads.slice(0, 3) };
  }, [intel, tick, sVol]);

  const stockHint = sodexBaseToStockTicker(base);

  return (
    <div className="mb-10">
      {/* section header */}
      <div className="flex items-center gap-2 mb-2">
        <span className="text-[10px] font-bold px-1.5 py-0.5 rounded" style={{ background: "rgba(124,107,240,0.14)", color: VIOLET, letterSpacing: "0.05em" }}>
          SOSOVALUE × SODEX
        </span>
        <span className="text-[11px] font-medium" style={{ color: "var(--text-faint)" }}>
          One pair, two lenses — venue vs global
        </span>
      </div>
      <h2 className="text-[20px] font-semibold tracking-tight mb-3" style={{ color: "var(--text)" }}>
        Pair Intelligence
      </h2>

      {/* picker */}
      <div className="relative mb-3" style={{ maxWidth: 360 }}>
        <div className="flex items-center gap-2 px-3 rounded-lg" style={{ background: "var(--bg-surface)", border: "1px solid var(--border)", height: 40 }}>
          <TokenIcon symbol={base} size={18} />
          <input
            value={open ? query : base}
            onChange={(e) => {
              setQuery(e.target.value);
              setOpen(true);
            }}
            onFocus={() => {
              setQuery("");
              setOpen(true);
            }}
            onBlur={() => setTimeout(() => setOpen(false), 150)}
            placeholder="Search a pair…"
            className="mono flex-1 min-w-0 bg-transparent outline-none text-[13px] font-semibold"
            style={{ color: "var(--text)" }}
          />
          <Search size={14} style={{ color: "var(--text-faint)" }} />
        </div>
        {open && options.length > 0 && (
          <div className="absolute left-0 right-0 mt-1 rounded-lg overflow-y-auto z-20" style={{ background: "var(--bg-surface)", border: "1px solid var(--border)", boxShadow: "0 12px 32px rgba(0,0,0,0.3)", maxHeight: 320 }}>
            {options.map((p) => (
              <button
                key={p.baseCoin}
                onMouseDown={() => {
                  setBase(p.baseCoin);
                  setOpen(false);
                }}
                className="w-full flex items-center gap-2.5 px-3 py-2 text-left"
                style={{ background: "transparent" }}
                onMouseEnter={(e) => (e.currentTarget.style.background = "var(--bg-elevated)")}
                onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
              >
                <TokenIcon symbol={p.baseCoin} size={18} />
                <span className="mono text-[12px] font-semibold" style={{ color: "var(--text)" }}>{p.baseCoin}</span>
                <span className="mono text-[10px] ml-auto" style={{ color: "var(--text-faint)" }}>
                  {$big(parseFloat(ticks.get(`${p.baseCoin}-USD`)?.quoteVolume ?? "0") || 0)} vol
                </span>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* panel */}
      <div className="rounded-[14px] p-4 sm:p-5" style={{ background: "var(--bg-surface)", border: "1px solid var(--border)" }}>
        {state === "loading" && <div className="h-[280px] rounded-lg animate-pulse" style={{ background: "var(--bg-elevated)" }} />}

        {state === "unmapped" && (
          <div className="py-14 text-center text-[13px] max-w-[420px] mx-auto" style={{ color: "var(--text-faint)" }}>
            No global crypto-market data for <b style={{ color: "var(--text)" }}>{base}</b>.
            {stockHint
              ? " This is a tokenized stock, not a crypto asset."
              : " Likely a commodity or index product."}
          </div>
        )}
        {state === "error" && (
          <div className="py-14 text-center text-[13px]" style={{ color: "var(--text-faint)" }}>
            Couldn't load global context right now.
          </div>
        )}

        {state === "ready" && intel && d && (
          <>
            {/* header */}
            <div className="flex items-center gap-2.5 mb-4 flex-wrap">
              <TokenIcon symbol={base} size={26} />
              <span className="text-[16px] font-semibold" style={{ color: "var(--text)" }}>{intel.name}</span>
              <span className="mono text-[11px]" style={{ color: "var(--text-faint)" }}>{base}-USD</span>
              <span className="tag px-1.5 py-0.5 rounded" style={{ background: "var(--bg-elevated)", color: "var(--text-muted)", fontSize: 8.5 }}>
                #{d.s.marketcap_rank} MCAP
              </span>
              <span className="tag px-1.5 py-0.5 rounded" style={{ background: "rgba(124,107,240,0.12)", color: VIOLET, fontSize: 8.5 }}>PERP</span>
              {hasSpot && (
                <span className="tag px-1.5 py-0.5 rounded" style={{ background: "var(--green-tint)", color: "var(--green)", fontSize: 8.5 }}>SPOT</span>
              )}
              {intel.factor !== 1 && (
                <span className="mono text-[9px]" style={{ color: "var(--text-faint)" }}>({intel.factor}× {intel.ticker})</span>
              )}
            </div>

            {/* venue vs global stat grid — no cached-price vs live-price
                juxtapositions: SoSoValue refreshes ~12h, so any cross-source
                price spread would be fabricated by the time gap */}
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2 mb-4">
              <StatBlock label="SODEX MARK" value={$px(d.mark)} sub={<span style={{ color: tone(tick!.changePct) }}>{(tick!.changePct >= 0 ? "+" : "") + tick!.changePct.toFixed(2)}% 24h</span>} />
              <StatBlock label="VENUE PREMIUM" value={`${d.premiumBps >= 0 ? "+" : ""}${d.premiumBps.toFixed(1)} bps`} color={Math.abs(d.premiumBps) > 10 ? tone(d.premiumBps) : "var(--text)"} sub="mark vs live index oracle" />
              <StatBlock label="FUNDING" value={pct(d.funding, 4)} color={tone(d.funding)} sub={`OI ${$big(d.oiUsd)}`} />
              <StatBlock label="SODEX 24H VOL" value={$big(d.pVol + sVol)} sub={`${d.volShareBps.toFixed(1)} bps of global`} />
              <StatBlock label="7D GLOBAL" value={d.mom7 != null ? pct(d.mom7) : "—"} color={d.mom7 != null ? tone(d.mom7) : undefined} sub={d.rangeRatio != null ? `range ${d.rangeRatio.toFixed(1)}× 35d avg` : undefined} />
            </div>

            {/* cycle + sparkline */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
              <div className="rounded-lg p-3" style={{ background: "var(--bg-elevated)" }}>
                <div className="flex items-center gap-1.5 mb-2.5">
                  <Mountain size={11} style={{ color: "var(--text-faint)" }} />
                  <span className="tag" style={{ color: "var(--text-faint)", fontSize: 8.5 }}>CYCLE POSITION · GLOBAL</span>
                </div>
                <CycleMeter s={d.s} />
              </div>
              <div className="rounded-lg p-3" style={{ background: "var(--bg-elevated)" }}>
                <div className="flex items-center justify-between mb-1.5">
                  <div className="flex items-center gap-1.5">
                    <Globe size={11} style={{ color: "var(--text-faint)" }} />
                    <span className="tag" style={{ color: "var(--text-faint)", fontSize: 8.5 }}>35D GLOBAL PRICE</span>
                  </div>
                  {d.closes.length > 1 && (
                    <span className="mono text-[10px] font-semibold" style={{ color: tone(d.closes[d.closes.length - 1] / d.closes[0] - 1) }}>
                      {pct(d.closes[d.closes.length - 1] / d.closes[0] - 1)}
                    </span>
                  )}
                </div>
                {d.closes.length > 1 ? <Sparkline closes={d.closes} /> : <div className="mono text-[10px] py-4" style={{ color: "var(--text-faint)" }}>No kline history available</div>}
              </div>
            </div>

            {/* valuation strip */}
            <div className="flex items-center gap-4 flex-wrap mono text-[10.5px] mb-4" style={{ color: "var(--text-faint)" }}>
              <span>MCAP <b style={{ color: "var(--text-muted)" }}>{$big(d.s.marketcap)}</b></span>
              <span>FDV <b style={{ color: "var(--text-muted)" }}>{$big(d.s.fdv)}</b>{d.dilution > 0.005 && <b style={{ color: "var(--red)" }}> +{(d.dilution * 100).toFixed(0)}%</b>}</span>
              <span>CIRC <b style={{ color: "var(--text-muted)" }}>{(d.circPct * 100).toFixed(0)}%</b></span>
              <span>GLOBAL 24H TURNOVER <b style={{ color: "var(--text-muted)" }}>{$big(d.s.turnover_24h)}</b></span>
            </div>

            {/* reads */}
            {d.reads.length > 0 && (
              <div className="flex flex-col gap-1.5">
                {d.reads.map((r, i) => {
                  const Icon = r.icon;
                  return (
                    <div key={i} className="flex items-start gap-2 rounded-lg px-3 py-2" style={{ background: "var(--bg-elevated)" }}>
                      <Icon size={12} style={{ color: r.tone, marginTop: 1.5, flexShrink: 0 }} />
                      <span className="text-[11px] leading-snug" style={{ color: "var(--text-muted)" }}>{r.text}</span>
                    </div>
                  );
                })}
              </div>
            )}

            <p className="text-[9.5px] mt-3 leading-tight" style={{ color: "var(--text-faint)" }}>
              Venue data live from SoDEX; global context via SoSoValue, refreshed ~every 12h. Reads are computed observations, not advice.
            </p>
          </>
        )}
      </div>

      {/* multi-pair board — tap a row to open its full cross-read above */}
      <div className="mt-3 rounded-[14px] overflow-hidden" style={{ background: "var(--bg-surface)", border: "1px solid var(--border)" }}>
        <div className="flex items-center justify-between px-4 py-2.5" style={{ borderBottom: "1px solid var(--border-subtle)" }}>
          <span className="tag" style={{ color: "var(--text-muted)" }}>TOP PAIRS · VENUE × GLOBAL</span>
          <span className="tag" style={{ color: "var(--text-faint)", fontSize: 8.5 }}>TAP A ROW FOR THE FULL CROSS-READ</span>
        </div>
        <div className="overflow-x-auto">
          <div style={{ minWidth: 640 }}>
            {/* head */}
            <div className="grid items-center px-4 py-2" style={{ gridTemplateColumns: "minmax(96px,1.2fr) 1fr 0.8fr 0.9fr 0.9fr 0.8fr 0.6fr", gap: 10, borderBottom: "1px solid var(--border-subtle)" }}>
              {["PAIR", "MARK", "24H", "PREMIUM", "FUNDING", "FROM ATH", "MCAP"].map((h, i) => (
                <span key={h} className={`tag ${i > 0 ? "text-right" : ""}`} style={{ color: "var(--text-faint)", fontSize: 8.5 }}>{h}</span>
              ))}
            </div>
            {board === null
              ? Array.from({ length: 6 }).map((_, i) => (
                  <div key={i} className="grid items-center px-4" style={{ gridTemplateColumns: "minmax(96px,1.2fr) 1fr 0.8fr 0.9fr 0.9fr 0.8fr 0.6fr", gap: 10, height: 40, borderBottom: "1px solid var(--border-subtle)" }}>
                    {Array.from({ length: 7 }).map((_, j) => (
                      <div key={j} className="h-3 rounded-sm animate-pulse" style={{ background: "var(--bg-elevated)" }} />
                    ))}
                  </div>
                ))
              : board.map((r, i) => {
                  const t = ticks.get(`${r.base}-USD`);
                  if (!t) return null;
                  const mark = parseFloat(t.markPrice);
                  // mark vs live index oracle — never the ≤15m SoSoValue quote
                  const idx = parseFloat(t.indexPrice) || 0;
                  const prem = idx > 0 ? ((mark - idx) / idx) * 1e4 : 0;
                  const f = parseFloat(t.fundingRate) || 0;
                  const active = r.base === base;
                  return (
                    <div
                      key={r.base}
                      className="grid items-center px-4 cursor-pointer"
                      style={{
                        gridTemplateColumns: "minmax(96px,1.2fr) 1fr 0.8fr 0.9fr 0.9fr 0.8fr 0.6fr",
                        gap: 10,
                        height: 40,
                        borderBottom: i < board.length - 1 ? "1px solid var(--border-subtle)" : "none",
                        background: active ? "var(--bg-elevated)" : "transparent",
                        boxShadow: active ? `inset 2px 0 0 0 ${VIOLET}` : "none",
                        transition: "background 0.12s ease",
                      }}
                      onClick={() => setBase(r.base)}
                      onMouseEnter={(e) => { if (!active) (e.currentTarget as HTMLElement).style.background = "var(--bg-elevated)"; }}
                      onMouseLeave={(e) => { if (!active) (e.currentTarget as HTMLElement).style.background = "transparent"; }}
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        <TokenIcon symbol={r.base} size={18} />
                        <span className="mono text-[12px] font-semibold truncate" style={{ color: "var(--text)" }}>{r.base}</span>
                      </div>
                      <span className="mono text-[11.5px] text-right tabular-nums" style={{ color: "var(--text)" }}>{$px(mark)}</span>
                      <span className="mono text-[11.5px] text-right tabular-nums" style={{ color: tone(t.changePct) }}>
                        {(t.changePct >= 0 ? "+" : "") + t.changePct.toFixed(2)}%
                      </span>
                      <span className="mono text-[11.5px] text-right tabular-nums" style={{ color: Math.abs(prem) > 10 ? tone(prem) : "var(--text-muted)" }}>
                        {(prem >= 0 ? "+" : "") + prem.toFixed(1)} bps
                      </span>
                      <span className="mono text-[11.5px] text-right tabular-nums" style={{ color: Math.abs(f) >= 1e-6 ? tone(f) : "var(--text-faint)" }}>
                        {pct(f, 4)}
                      </span>
                      <span className="mono text-[11.5px] text-right tabular-nums" style={{ color: "var(--red)" }}>
                        −{(r.downAth * 100).toFixed(0)}%
                      </span>
                      <span className="mono text-[11.5px] text-right tabular-nums" style={{ color: "var(--text-faint)" }}>#{r.rank}</span>
                    </div>
                  );
                })}
          </div>
        </div>
      </div>
    </div>
  );
}
