"use client";

import { useCallback, useMemo, useRef, useState, useEffect } from "react";
import { CornerMarks } from "@/components/CornerMarks";
import { TokenIcon } from "@/components/TokenIcon";
import { Flame, ChevronDown } from "lucide-react";
import { useLandingData } from "@/components/LandingDataProvider";
import { cachedFetchJson } from "@/lib/fetchCache";

type RangeKey = "7D" | "30D" | "90D" | "ALL";
type SeriesKey = "total" | "perps" | "spot";
type Mode = "daily" | "cumulative";

interface DayPoint {
  date: string;
  ts: number;
  spot: number;
  perps: number;
  total: number;
  cSpot: number;
  cPerps: number;
  cTotal: number;
  topSymbol?: string; // highest-volume market that day
}

interface DayPair {
  symbol: string;
  volume: number;
}

const RANGES: { key: RangeKey; days: number }[] = [
  { key: "7D", days: 7 },
  { key: "30D", days: 30 },
  { key: "90D", days: 90 },
  { key: "ALL", days: 0 },
];

const SERIES: { key: SeriesKey; label: string; color: string }[] = [
  { key: "total", label: "TOTAL", color: "#FFFFFF" },
  { key: "perps", label: "PERPS", color: "#888888" },
  { key: "spot", label: "SPOT", color: "#444444" },
];

const W = 1000;
const H = 340;
const PAD = { t: 24, r: 56, b: 36, l: 14 };
const PLOT_W = W - PAD.l - PAD.r;
const PLOT_H = H - PAD.t - PAD.b;

function MobileDropdown<T extends string>({
  value,
  options,
  onChange,
}: {
  value: T;
  options: { value: T; label: string }[];
  onChange: (v: T) => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const current = options.find((o) => o.value === value);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  return (
    <div ref={ref} className="relative sm:hidden">
      <button
        onClick={() => setOpen((o) => !o)}
        className="tag flex items-center gap-1 px-2 py-1 text-[10px]"
        style={{ border: "1px solid var(--border)", background: "var(--bg-surface)", color: "var(--text)", cursor: "pointer" }}
      >
        {current?.label}
        <ChevronDown size={10} style={{ color: "var(--text-faint)" }} />
      </button>
      {open && (
        <div
          className="absolute z-50 top-full left-0 mt-1"
          style={{ border: "1px solid var(--border)", background: "var(--bg-surface)", minWidth: 90 }}
        >
          {options.map((o) => (
            <button
              key={o.value}
              onClick={() => { onChange(o.value); setOpen(false); }}
              className="tag block w-full text-left px-3 py-2 text-[10px] transition-colors"
              style={{
                background: o.value === value ? "var(--accent)" : "transparent",
                color: o.value === value ? "var(--accent-fg)" : "var(--text-muted)",
                cursor: "pointer",
              }}
            >
              {o.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function fmtVol(n: number, dp = 1): string {
  const abs = Math.abs(n);
  if (abs >= 1_000_000_000) return `$${(n / 1_000_000_000).toFixed(dp)}B`;
  if (abs >= 1_000_000) return `$${(n / 1_000_000).toFixed(dp)}M`;
  if (abs >= 1_000) return `$${(n / 1_000).toFixed(dp)}K`;
  return `$${n.toFixed(0)}`;
}

function fmtDay(ts: number, withYear = false): string {
  return new Date(ts).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: withYear ? "2-digit" : undefined,
    timeZone: "UTC",
  });
}

const getVal = (p: DayPoint, key: SeriesKey, mode: Mode): number =>
  mode === "daily"
    ? p[key]
    : key === "total"
    ? p.cTotal
    : key === "perps"
    ? p.cPerps
    : p.cSpot;

export function VolumeChart() {
  const { volumeAllRaw, volumeSpotRaw, volumeFutRaw, loadingVolume, loadVolume } = useLandingData();
  const [range, setRange] = useState<RangeKey>("30D");
  const [mode, setMode] = useState<Mode>("daily");
  const [visible, setVisible] = useState<Record<SeriesKey, boolean>>({
    total: true,
    perps: true,
    spot: true,
  });
  const [hoverIdx, setHoverIdx] = useState<number | null>(null);
  const [selectedDay, setSelectedDay] = useState<DayPoint | null>(null);
  const [dayPairs, setDayPairs] = useState<DayPair[]>([]);
  const [dayPairsLoading, setDayPairsLoading] = useState(false);
  const lastTapRef = useRef<number>(0);
  const svgRef = useRef<SVGSVGElement>(null);

  useEffect(() => { loadVolume(); }, [loadVolume]);

  // Build full dataset from context (fetched once for ALL history)
  const { points, loading, error } = useMemo(() => {
    if (loadingVolume && !volumeAllRaw) return { points: [] as DayPoint[], loading: true, error: false };
    const allDays = volumeAllRaw?.data?.data ?? [];
    if (!allDays.length) return { points: [] as DayPoint[], loading: false, error: true };
    type Row = { day_date: string; total: string; cumulative: string };
    const idx = (rows: Row[]) =>
      new Map(rows.map((d) => [d.day_date, { t: parseFloat(d.total), c: parseFloat(d.cumulative) }]));
    const spotM = idx(volumeSpotRaw?.data?.data ?? []);
    const futM = idx(volumeFutRaw?.data?.data ?? []);
    const topOf = (markets?: Record<string, string>): string | undefined => {
      if (!markets) return undefined;
      let sym: string | undefined;
      let max = -Infinity;
      for (const [k, v] of Object.entries(markets)) {
        const val = parseFloat(v);
        if (val > max) { max = val; sym = k; }
      }
      return sym;
    };
    const merged: DayPoint[] = allDays.map(
      (d: { day_date: string; timestamp: number; total: string; cumulative: string; markets?: Record<string, string> }) => ({
        date: d.day_date,
        ts: d.timestamp,
        total: parseFloat(d.total),
        cTotal: parseFloat(d.cumulative),
        spot: spotM.get(d.day_date)?.t ?? 0,
        cSpot: spotM.get(d.day_date)?.c ?? 0,
        perps: futM.get(d.day_date)?.t ?? 0,
        cPerps: futM.get(d.day_date)?.c ?? 0,
        topSymbol: topOf(d.markets),
      })
    );
    // Client-side range filtering — slice the last N days
    const days = RANGES.find((r) => r.key === range)!.days;
    const sliced = days === 0 ? merged : merged.slice(-days);
    return { points: sliced, loading: false, error: false };
  }, [volumeAllRaw, volumeSpotRaw, volumeFutRaw, loadingVolume, range]);

  const n = points.length;

  // y-domain depends on mode: daily anchors at 0, cumulative zooms to the data band
  const { yMin, yMax } = useMemo(() => {
    let mn = Infinity;
    let mx = -Infinity;
    for (const p of points) {
      for (const s of SERIES) {
        if (!visible[s.key]) continue;
        const v = getVal(p, s.key, mode);
        mn = Math.min(mn, v);
        mx = Math.max(mx, v);
      }
    }
    if (!isFinite(mn)) return { yMin: 0, yMax: 1 };
    if (mode === "daily") return { yMin: 0, yMax: mx * 1.12 || 1 };
    const pad = (mx - mn) * 0.14 || mx * 0.05 || 1;
    return { yMin: Math.max(0, mn - pad), yMax: mx + pad };
  }, [points, visible, mode]);

  const x = useCallback((i: number) => PAD.l + (n <= 1 ? 0 : (i / (n - 1)) * PLOT_W), [n]);
  const y = useCallback(
    (v: number) => PAD.t + (1 - (v - yMin) / (yMax - yMin || 1)) * PLOT_H,
    [yMin, yMax]
  );

  const buildSmoothPath = useCallback(
    (key: SeriesKey, close: boolean) => {
      if (!n) return "";
      const pts = points.map((p, i) => ({ x: x(i), y: y(getVal(p, key, mode)) }));
      if (pts.length === 0) return "";
      if (pts.length === 1) return `M ${pts[0].x.toFixed(1)} ${pts[0].y.toFixed(1)}`;

      let d = `M ${pts[0].x.toFixed(1)} ${pts[0].y.toFixed(1)}`;
      for (let i = 0; i < pts.length - 1; i++) {
        const p0 = pts[i - 1] || pts[i];
        const p1 = pts[i];
        const p2 = pts[i + 1];
        const p3 = pts[i + 2] || p2;
        const cp1x = p1.x + (p2.x - p0.x) / 6;
        const cp1y = p1.y + (p2.y - p0.y) / 6;
        const cp2x = p2.x - (p3.x - p1.x) / 6;
        const cp2y = p2.y - (p3.y - p1.y) / 6;
        d += ` C ${cp1x.toFixed(1)} ${cp1y.toFixed(1)}, ${cp2x.toFixed(1)} ${cp2y.toFixed(1)}, ${p2.x.toFixed(1)} ${p2.y.toFixed(1)}`;
      }
      if (close) {
        const base = (PAD.t + PLOT_H).toFixed(1);
        d += ` L ${pts[pts.length - 1].x.toFixed(1)} ${base} L ${pts[0].x.toFixed(1)} ${base} Z`;
      }
      return d;
    },
    [points, n, x, y, mode]
  );

  const gridVals = useMemo(() => {
    const steps = 4;
    return Array.from({ length: steps + 1 }, (_, i) => yMin + ((yMax - yMin) / steps) * i);
  }, [yMin, yMax]);

  const xLabels = useMemo(() => {
    if (!n) return [] as { i: number; label: string }[];
    const count = Math.min(6, n);
    const out: { i: number; label: string }[] = [];
    for (let k = 0; k < count; k++) {
      const i = Math.round((k / (count - 1)) * (n - 1));
      out.push({ i, label: fmtDay(points[i].ts) });
    }
    return out;
  }, [points, n]);

  // Peak day of TOTAL (daily mode only — cumulative peak is trivially the last day)
  const peakIdx = useMemo(() => {
    if (mode !== "daily" || !n || !visible.total) return null;
    let bi = 0;
    for (let i = 1; i < n; i++) if (points[i].total > points[bi].total) bi = i;
    return bi;
  }, [points, n, mode, visible.total]);

  // Top-asset markers sit on the biggest-volume days: 1 peak on 7D, up to 5 on 30D.
  const topAssetPeaks = useMemo(() => {
    const want = range === "7D" ? 1 : range === "30D" ? 5 : 0;
    if (!want || !n) return [] as number[];
    const isLocalMax = (i: number) => {
      const v = points[i].total;
      const l = i > 0 ? points[i - 1].total : -Infinity;
      const r = i < n - 1 ? points[i + 1].total : -Infinity;
      return v >= l && v >= r;
    };
    let pool: number[] = [];
    for (let i = 0; i < n; i++) if (isLocalMax(i)) pool.push(i);
    if (pool.length < want) pool = Array.from({ length: n }, (_, i) => i);
    return pool
      .sort((a, b) => points[b].total - points[a].total)
      .slice(0, want)
      .sort((a, b) => a - b);
  }, [points, n, range]);

  // Header stats: range total + delta vs the prior equal-length window (daily sums)
  const { rangeTotal, deltaPct } = useMemo(() => {
    if (!n) return { rangeTotal: 0, deltaPct: null as number | null };
    const sum = points.reduce((a, p) => a + p.total, 0);
    const half = Math.floor(n / 2);
    if (half < 1) return { rangeTotal: sum, deltaPct: null };
    const recent = points.slice(n - half).reduce((a, p) => a + p.total, 0);
    const prior = points.slice(n - 2 * half, n - half).reduce((a, p) => a + p.total, 0);
    const d = prior > 0 ? ((recent - prior) / prior) * 100 : null;
    return { rangeTotal: sum, deltaPct: d };
  }, [points, n]);

  const onMove = useCallback(
    (e: React.MouseEvent) => {
      const svg = svgRef.current;
      if (!svg || !n) return;
      const rect = svg.getBoundingClientRect();
      const px = ((e.clientX - rect.left) / rect.width) * W;
      const rel = (px - PAD.l) / PLOT_W;
      const newIdx = Math.max(0, Math.min(n - 1, Math.round(rel * (n - 1))));
      setHoverIdx((prev) => {
        if (prev !== newIdx) {
          setSelectedDay(null);
          setDayPairs([]);
        }
        return newIdx;
      });
    },
    [n]
  );

  const hovered = hoverIdx != null ? points[hoverIdx] : null;
  const latest = points[n - 1];

  const fetchDayPairs = useCallback(async (date: string) => {
    setDayPairsLoading(true);
    try {
      const json = await cachedFetchJson<any>(
        `https://mainnet-data.sodex.dev/api/v1/dashboard/volume?start_date=${date}&end_date=${date}&market_type=all`
      );
      const markets = json?.data?.data?.[0]?.markets ?? {};
      const pairs: DayPair[] = Object.entries(markets)
        .map(([symbol, vol]) => ({ symbol, volume: parseFloat(vol as string) }))
        .filter((p) => p.volume > 0)
        .sort((a, b) => b.volume - a.volume)
        .slice(0, 10);
      setDayPairs(pairs);
    } catch {
      setDayPairs([]);
    } finally {
      setDayPairsLoading(false);
    }
  }, []);

  const onDoubleClick = useCallback(() => {
    if (hoverIdx == null || !points[hoverIdx]) return;
    const pt = points[hoverIdx];
    setSelectedDay(pt);
    fetchDayPairs(pt.date);
  }, [hoverIdx, points, fetchDayPairs]);

  const onTouchStart = useCallback(
    (e: React.TouchEvent) => {
      const svg = svgRef.current;
      if (!svg || !n) return;
      const touch = e.touches[0];
      if (!touch) return;
      const rect = svg.getBoundingClientRect();
      const px = ((touch.clientX - rect.left) / rect.width) * W;
      const rel = (px - PAD.l) / PLOT_W;
      const newIdx = Math.max(0, Math.min(n - 1, Math.round(rel * (n - 1))));
      setHoverIdx(newIdx);

      const now = Date.now();
      if (now - lastTapRef.current < 350) {
        if (points[newIdx]) {
          setSelectedDay(points[newIdx]);
          fetchDayPairs(points[newIdx].date);
        }
        lastTapRef.current = 0;
      } else {
        lastTapRef.current = now;
      }
    },
    [n, points, fetchDayPairs]
  );

  const onTouchMove = useCallback(
    (e: React.TouchEvent) => {
      const svg = svgRef.current;
      if (!svg || !n) return;
      const touch = e.touches[0];
      if (!touch) return;
      const rect = svg.getBoundingClientRect();
      const px = ((touch.clientX - rect.left) / rect.width) * W;
      const rel = (px - PAD.l) / PLOT_W;
      const newIdx = Math.max(0, Math.min(n - 1, Math.round(rel * (n - 1))));
      setHoverIdx((prev) => {
        if (prev !== newIdx) {
          setSelectedDay(null);
          setDayPairs([]);
        }
        return newIdx;
      });
    },
    [n]
  );

  const toggle = (k: SeriesKey) =>
    setVisible((v) => {
      const next = { ...v, [k]: !v[k] };
      if (!next.total && !next.perps && !next.spot) return v;
      return next;
    });

  return (
    <section className="relative py-8 sm:py-16 overflow-visible sm:overflow-hidden">

      <div className="relative max-w-[1200px] mx-auto px-5">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-2 sm:gap-3 mb-3 sm:mb-6">
          <div>
            <div className="hidden sm:flex tag mb-2 items-center gap-2" style={{ color: "var(--accent)" }}>
              <span className="w-5 h-px" style={{ background: "var(--accent)" }} />
              TRADING VOLUME · SPOT + PERPS
            </div>
            <h2
              className="text-base sm:text-[28px] font-bold tracking-tight leading-none"
              style={{ color: "var(--text)", letterSpacing: "-0.02em" }}
            >
              Volume Over Time
            </h2>
            {!loading && latest && (
              <div className="flex items-center gap-2 sm:gap-3 mt-1 sm:mt-2.5">
                <span className="mono text-xs sm:text-sm font-bold" style={{ color: "var(--text)" }}>
                  {fmtVol(rangeTotal, 2)}
                </span>
                <span className="tag text-[9px] sm:text-xs" style={{ color: "var(--text-faint)" }}>{range} TOTAL</span>
                {deltaPct != null && (
                  <span
                    className="hidden sm:inline mono text-xs font-bold px-1.5 py-0.5"
                    style={{
                      color: deltaPct >= 0 ? "var(--green)" : "var(--red)",
                      background: deltaPct >= 0 ? "var(--green-tint-med)" : "rgba(240,80,80,0.12)",
                    }}
                  >
                    {deltaPct >= 0 ? "▲" : "▼"} {Math.abs(deltaPct).toFixed(1)}%
                  </span>
                )}
              </div>
            )}
          </div>

          {/* Mode + range controls */}
          <div className="flex items-center gap-1.5 sm:gap-2 flex-wrap">
            {/* Mobile dropdowns */}
            <MobileDropdown
              value={mode}
              options={[{ value: "daily", label: "DAILY" }, { value: "cumulative", label: "CUMULATIVE" }]}
              onChange={(v) => setMode(v)}
            />
            <MobileDropdown
              value={range}
              options={RANGES.map((r) => ({ value: r.key, label: r.key }))}
              onChange={(v) => setRange(v)}
            />

            {/* Desktop buttons */}
            <div className="hidden sm:flex items-center" style={{ border: "1px solid var(--border)", padding: 2, gap: 2, borderRadius: "var(--r-md)" }}>
              {(["daily", "cumulative"] as Mode[]).map((m) => (
                <button
                  key={m}
                  onClick={() => setMode(m)}
                  className="tag px-3 py-1.5 transition-colors"
                  style={{
                    background: mode === m ? "var(--accent)" : "transparent",
                    color: mode === m ? "var(--accent-fg)" : "var(--text-muted)",
                    cursor: "pointer",
                    borderRadius: "var(--r-sm)",
                  }}
                >
                  {m === "daily" ? "DAILY" : "CUMULATIVE"}
                </button>
              ))}
            </div>
            <div className="hidden sm:flex items-center" style={{ border: "1px solid var(--border)", padding: 2, gap: 2, borderRadius: "var(--r-md)" }}>
              {RANGES.map((r) => (
                <button
                  key={r.key}
                  onClick={() => setRange(r.key)}
                  className="tag px-3 py-1.5 transition-colors"
                  style={{
                    background: range === r.key ? "var(--accent)" : "transparent",
                    color: range === r.key ? "var(--accent-fg)" : "var(--text-muted)",
                    cursor: "pointer",
                    borderRadius: "var(--r-sm)",
                  }}
                >
                  {r.key}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Legend */}
        <div className="flex items-center gap-2 sm:gap-4 mb-4 sm:mb-3 flex-wrap">
          {SERIES.map((s) => {
            const on = visible[s.key];
            const val = hovered ? getVal(hovered, s.key, mode) : latest ? getVal(latest, s.key, mode) : 0;
            return (
              <button
                key={s.key}
                onClick={() => toggle(s.key)}
                className="flex items-center gap-1.5 sm:gap-2 transition-opacity"
                style={{ opacity: on ? 1 : 0.36 }}
              >
                <span
                  className="w-2.5 h-2.5 sm:w-3 sm:h-3 rounded-[2px]"
                  style={{ background: s.color, boxShadow: on ? `0 0 8px ${s.color}66` : "none" }}
                />
                <span className="hidden sm:inline tag text-xs" style={{ color: "var(--text-muted)" }}>{s.label}</span>
                <span className="mono text-[10px] sm:text-xs font-bold tabular-nums" style={{ color: "var(--text)" }}>
                  {loading ? "—" : fmtVol(val, 1)}
                </span>
              </button>
            );
          })}
        </div>

        {/* Chart — fully transparent, no frame */}
        <div className="relative mt-6 sm:mt-0">
          <CornerMarks size={8} inset={-1} thickness={1} opacity={0.5} />

          {error ? (
            <div className="flex flex-col items-center justify-center gap-3" style={{ height: H }}>
              <span className="mono text-sm" style={{ color: "var(--text-faint)" }}>Failed to load volume data</span>
              <span className="tag px-4 py-2" style={{ border: "1px solid var(--accent)", color: "var(--accent)" }}>RETRY</span>
            </div>
          ) : n === 0 ? (
            <div className="flex items-center justify-center" style={{ height: H }}>
              <div className="flex items-end gap-1.5" style={{ height: 80 }}>
                {Array.from({ length: 24 }).map((_, i) => (
                  <div key={i} className="w-2 rounded-sm animate-pulse" style={{ height: `${30 + ((i * 37) % 70)}%`, background: "var(--border)", animationDelay: `${i * 40}ms` }} />
                ))}
              </div>
            </div>
          ) : (
            <div className="relative chart-fade" style={{ opacity: loading ? 0.45 : 1 }}>
              {/* Loading shimmer overlay */}
              {loading && (
                <div className="absolute inset-0 z-10 pointer-events-none overflow-hidden">
                  <div className="absolute inset-0 chart-shimmer" style={{ opacity: 0.5 }} />
                </div>
              )}
              {/* Top loading bar */}
              {loading && (
                <div className="absolute top-0 left-0 right-0 z-20 pointer-events-none" style={{ height: 2, overflow: "hidden" }}>
                  <div className="chart-loading-bar" style={{ height: "100%", width: "40%", background: "var(--accent)", opacity: 0.8 }} />
                </div>
              )}
              <svg
                ref={svgRef}
                viewBox={`0 0 ${W} ${H}`}
                width="100%"
                preserveAspectRatio="none"
                className="volume-chart-svg"
                style={{ display: "block", height: "auto", aspectRatio: `${W} / ${H}`, touchAction: "pan-y" }}
                onMouseMove={onMove}
                onMouseLeave={() => setHoverIdx(null)}
                onDoubleClick={onDoubleClick}
                onTouchStart={onTouchStart}
                onTouchMove={onTouchMove}
              >
                <defs>
                  {SERIES.map((s) => (
                    <linearGradient key={s.key} id={`grad-${s.key}`} x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor={s.color} stopOpacity={s.key === "total" ? 0.3 : 0.16} />
                      <stop offset="100%" stopColor={s.color} stopOpacity={0} />
                    </linearGradient>
                  ))}
                  <clipPath id="plot-clip">
                    <rect x={PAD.l} y={PAD.t - 2} width={PLOT_W} height={PLOT_H + 4} />
                  </clipPath>
                </defs>

                {/* Y gridlines + labels */}
                {gridVals.map((v, i) => (
                  <g key={i}>
                    <line
                      x1={PAD.l} x2={W - PAD.r} y1={y(v)} y2={y(v)}
                      stroke="var(--border-subtle)" strokeWidth={1}
                      strokeDasharray={i === 0 ? "0" : "3 4"} opacity={i === 0 ? 0.7 : 0.45}
                    />
                    <text x={W - 4} y={y(v) - 4} textAnchor="end" className="mono" fontSize={18} fill="var(--text-faint)">
                      {fmtVol(v, 0)}
                    </text>
                  </g>
                ))}

                {/* hover highlight band */}
                {hoverIdx != null && n > 1 && !loading && (
                  <rect
                    x={x(hoverIdx) - (PLOT_W / (n - 1)) / 2}
                    y={PAD.t}
                    width={PLOT_W / (n - 1)}
                    height={PLOT_H}
                    fill="var(--accent)"
                    opacity={0.05}
                    pointerEvents="none"
                  />
                )}

                {/* Areas + lines, back-to-front */}
                <g clipPath="url(#plot-clip)">
                {[...SERIES].reverse().map((s, ri) => {
                  if (!visible[s.key]) return null;
                  return (
                    <g key={s.key}>
                      <path className="chart-area" d={buildSmoothPath(s.key, true)} fill="none" stroke="none" />
                      <path
                        className="chart-line"
                        d={buildSmoothPath(s.key, false)}
                        fill="none"
                        stroke={s.color}
                        strokeWidth={s.key === "total" ? 2.4 : 1.8}
                        strokeLinejoin="round"
                        strokeLinecap="round"
                        style={{ animationDelay: `${ri * 0.12}s` }}
                      />
                    </g>
                  );
                })}
                </g>

                {/* Peak marker */}
                {peakIdx != null && visible.total && !loading && (
                  <g pointerEvents="none">
                    <circle cx={x(peakIdx)} cy={y(points[peakIdx].total)} r={4} fill="var(--accent)" stroke="var(--bg)" strokeWidth={1.5} />
                    <line x1={x(peakIdx)} x2={x(peakIdx)} y1={y(points[peakIdx].total) - 8} y2={PAD.t - 2} stroke="var(--accent)" strokeWidth={1} strokeDasharray="2 3" opacity={0.6} />
                    <text x={x(peakIdx)} y={PAD.t - 6} textAnchor={peakIdx > n / 2 ? "end" : "start"} className="mono" fontSize={16} fontWeight={700} fill="var(--accent)">
                      PEAK {fmtVol(points[peakIdx].total, 1)}
                    </text>
                  </g>
                )}

                {/* X labels */}
                {xLabels.map(({ i, label }) => (
                  <text key={i} x={x(i)} y={H - 8} textAnchor={i === 0 ? "start" : i === n - 1 ? "end" : "middle"} className="mono" fontSize={18} fill="var(--text-faint)">
                    {label}
                  </text>
                ))}

                {/* hover crosshair + dots */}
                {hovered && hoverIdx != null && !loading && (
                  <g pointerEvents="none">
                    <line x1={x(hoverIdx)} x2={x(hoverIdx)} y1={PAD.t} y2={PAD.t + PLOT_H} stroke="var(--accent)" strokeWidth={1} opacity={0.55} strokeDasharray="3 3" />
                    {SERIES.map((s) =>
                      visible[s.key] ? (
                        <circle key={s.key} cx={x(hoverIdx)} cy={y(getVal(hovered, s.key, mode))} r={3.5} fill="var(--bg)" stroke={s.color} strokeWidth={2} />
                      ) : null
                    )}
                  </g>
                )}
              </svg>

              {/* Peak-day top asset markers (1 on 7D, up to 5 on 30D) */}
              {visible.total && !loading && topAssetPeaks.length > 0 && (
                <div className="absolute inset-0 pointer-events-none" style={{ zIndex: 15 }}>
                  {topAssetPeaks.map((i) => {
                    const p = points[i];
                    if (!p.topSymbol) return null;
                    const val = getVal(p, "total", mode);
                    const leftPct = (x(i) / W) * 100;
                    const topPct = (y(val) / H) * 100;
                    const sz = range === "7D" ? 22 : 15;
                    const flameSz = range === "7D" ? 12 : 9;
                    return (
                      <div
                        key={p.date}
                        className="absolute"
                        style={{ left: `${leftPct}%`, top: `${topPct}%`, transform: "translate(-50%, -130%)" }}
                      >
                        <div className="relative">
                          <TokenIcon symbol={p.topSymbol} size={sz} />
                          <Flame
                            size={flameSz}
                            fill="#FF8A3D"
                            style={{
                              position: "absolute",
                              top: -flameSz * 0.5,
                              right: -flameSz * 0.42,
                              color: "#FF8A3D",
                              filter: "drop-shadow(0 0 4px rgba(255,138,61,0.65))",
                            }}
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}

              {/* Unified hover/expanded card */}
              {hovered && hoverIdx != null && !loading && (
                <div
                  className="absolute z-[60]"
                  style={{
                    top: 8,
                    left: `${(x(hoverIdx) / W) * 100}%`,
                    transform: hoverIdx > n / 2 ? "translateX(calc(-100% - 12px))" : "translateX(12px)",
                  }}
                >
                  <div
                    className="px-2 py-1 sm:px-3 sm:py-2.5"
                    style={{
                      background: "var(--panel-bg)",
                      backdropFilter: "blur(16px)",
                      WebkitBackdropFilter: "blur(16px)",
                      border: "1px solid var(--panel-border)",
                      boxShadow: "0 12px 32px rgba(0,0,0,0.4)",
                      minWidth: selectedDay ? 160 : 110,
                      maxWidth: 180,
                    }}
                  >
                    {/* Header — mobile: date only, desktop: date + mode */}
                    <div className="tag mb-0.5 sm:mb-2 flex items-center justify-between gap-2" style={{ color: "var(--text-faint)", fontSize: 8 }}>
                      <span>{fmtDay(hovered.ts, true)}</span>
                      <span className="hidden sm:inline" style={{ color: "var(--accent)" }}>{mode === "daily" ? "DAILY" : "CUMUL."}</span>
                    </div>

                    {/* Mobile: total only */}
                    <div className="sm:hidden flex items-center justify-between">
                      <span className="tag" style={{ color: "var(--text-muted)", fontSize: 8 }}>TOTAL</span>
                      <span className="mono text-[10px] font-bold tabular-nums" style={{ color: "var(--text)" }}>
                        {fmtVol(getVal(hovered, "total", mode), 2)}
                      </span>
                    </div>

                    {/* Desktop: all three series */}
                    <div className="hidden sm:flex flex-col gap-1.5">
                      {SERIES.map((s) => (
                        <div key={s.key} className="flex items-center justify-between gap-4">
                          <span className="flex items-center gap-1.5">
                            <span className="w-2 h-2 rounded-[1px]" style={{ background: s.color, opacity: visible[s.key] ? 1 : 0.35 }} />
                            <span className="tag" style={{ color: "var(--text-muted)" }}>{s.label}</span>
                          </span>
                          <span className="mono text-xs font-bold tabular-nums" style={{ color: "var(--text)" }}>
                            {fmtVol(getVal(hovered, s.key, mode), 2)}
                          </span>
                        </div>
                      ))}
                    </div>

                    {/* Expanded section: top pairs — 3 on mobile, 5 on desktop */}
                    {selectedDay ? (
                      <div className="mt-1 sm:mt-2 pt-1 sm:pt-2" style={{ borderTop: "1px solid var(--border-subtle)" }}>
                        <div className="flex items-center justify-between mb-1">
                          <span className="tag" style={{ color: "var(--accent)", fontSize: 8 }}>TOP PAIRS</span>
                          <button
                            onClick={() => { setSelectedDay(null); setDayPairs([]); }}
                            className="tag transition-colors"
                            style={{ color: "var(--text-faint)", cursor: "pointer", fontSize: 9 }}
                            onMouseEnter={(e) => (e.currentTarget.style.color = "var(--accent)")}
                            onMouseLeave={(e) => (e.currentTarget.style.color = "var(--text-faint)")}
                          >
                            ✕
                          </button>
                        </div>
                        {dayPairsLoading ? (
                          <div className="flex items-center gap-1.5 py-1">
                            <span className="mono text-[10px]" style={{ color: "var(--text-faint)" }}>Loading…</span>
                            <div className="flex gap-1">
                              {[0, 1, 2].map((i) => (
                                <div key={i} className="w-1.5 h-1.5 rounded-full animate-pulse" style={{ background: "var(--accent)", animationDelay: `${i * 100}ms` }} />
                              ))}
                            </div>
                          </div>
                        ) : dayPairs.length === 0 ? (
                          <div className="py-1">
                            <span className="mono text-[10px]" style={{ color: "var(--text-faint)" }}>No pair data.</span>
                          </div>
                        ) : (
                          <div className="flex flex-col gap-0.5 sm:gap-1">
                            {dayPairs.slice(0, 5).map((p, i) => (
                              <div key={p.symbol} className={`flex items-center gap-1.5 ${i >= 3 ? "hidden sm:flex" : "flex"}`}>
                                <span className="mono text-[9px] w-3" style={{ color: "var(--text-faint)" }}>{i + 1}</span>
                                <TokenIcon symbol={p.symbol} size={14} />
                                <span className="mono text-[10px] font-medium" style={{ color: "var(--text-muted)", minWidth: 48 }}>
                                  {p.symbol}
                                </span>
                                <span className="mono text-[10px] font-bold tabular-nums ml-auto" style={{ color: "var(--text-faint)" }}>
                                  {fmtVol(p.volume, 1)}
                                </span>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    ) : (
                      <div className="hidden sm:block mt-2 pt-2" style={{ borderTop: "1px solid var(--border-subtle)" }}>
                        <span className="tag" style={{ color: "var(--text-faint)", fontSize: 8 }}>DOUBLE-TAP FOR TOP PAIRS</span>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
