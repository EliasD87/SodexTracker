"use client";

import { useEffect, useRef, useState } from "react";
import { useCompact } from "@/components/analytics/hooks";

/**
 * One series, one axis. Small multiples of these carry the analytics page —
 * measures of different scale never share a plot.
 *
 * Marks follow the house chart spec: bars at most 24px with a 2px gap and a
 * 4px rounded data end, lines at 2px over a 10% wash, solid hairline grid.
 * Hover (or arrow keys once focused) moves a crosshair that snaps to the
 * nearest day. On a phone a tap does the same, and the reading stays until
 * the next tap elsewhere.
 */

export interface MiniPoint {
  date: string;
  value: number | null;
}

interface Props {
  label: string;
  points: MiniPoint[];
  kind: "bar" | "line";
  format: (v: number) => string;
  /** Plot height, excluding the axis band. */
  height?: number;
  /** Plot height on a phone, where a full-height chart pushes the page down. */
  phoneHeight?: number;
  color?: string;
  /** Allow the domain to go below zero (funding). */
  signed?: boolean;
  /**
   * Lines may start the axis at the data rather than at zero, so a running
   * total that moves 3% stays readable. Bars always grow from zero.
   */
  fitDomain?: boolean;
  /** Fixed y-domain, so small multiples can share one scale. */
  domain?: [number, number];
  /** Fill for bars below zero; defaults to `color`. */
  negativeColor?: string;
  /** Format the crosshair's time label; defaults to a date. */
  formatTime?: (iso: string) => string;
}

const M = { top: 10, right: 10, bottom: 24, left: 52 };

function niceTicks(min: number, max: number, count = 3): number[] {
  if (!Number.isFinite(min) || !Number.isFinite(max)) return [0];
  if (max === min) max = min === 0 ? 1 : min * 1.1;
  const step0 = (max - min) / count;
  const mag = 10 ** Math.floor(Math.log10(step0));
  const n = step0 / mag;
  const step = (n <= 1 ? 1 : n <= 2 ? 2 : n <= 2.5 ? 2.5 : n <= 5 ? 5 : 10) * mag;
  const lo = Math.floor(min / step) * step;
  const hi = Math.ceil(max / step) * step;
  const ticks: number[] = [];
  for (let v = lo; v <= hi + step / 2; v += step) ticks.push(Math.abs(v) < step / 1e6 ? 0 : v);
  return ticks;
}

const shortDate = (iso: string) =>
  new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });

/** A bar path with a rounded data end and a square base. */
function barPath(x: number, y: number, w: number, h: number, up: boolean): string {
  const r = Math.min(4, w / 2, Math.abs(h));
  if (h <= 0 || r <= 0.5) return `M${x},${y}h${w}v${h}h${-w}Z`;
  return up
    ? `M${x},${y + h}V${y + r}Q${x},${y} ${x + r},${y}H${x + w - r}Q${x + w},${y} ${x + w},${y + r}V${y + h}Z`
    : `M${x},${y}V${y + h - r}Q${x},${y + h} ${x + r},${y + h}H${x + w - r}Q${x + w},${y + h} ${x + w},${y + h - r}V${y}Z`;
}

export function MiniChart({
  label,
  points,
  kind,
  format,
  height: fullHeight = 140,
  phoneHeight,
  color = "var(--text)",
  signed,
  fitDomain,
  domain,
  negativeColor,
  formatTime = shortDate,
}: Props) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);
  const [hover, setHover] = useState<number | null>(null);
  const compact = useCompact();
  const height = compact && phoneHeight != null ? phoneHeight : fullHeight;

  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => setWidth(Math.round(entry.contentRect.width)));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const values = points.map((p) => p.value).filter((v): v is number => v != null);
  const rawMin = values.length ? Math.min(...values) : 0;
  const rawMax = values.length ? Math.max(...values) : 1;
  const fit = fitDomain && kind === "line";
  const ticks = domain
    ? niceTicks(domain[0], domain[1])
    : niceTicks(fit ? rawMin : signed ? Math.min(0, rawMin) : 0, fit ? rawMax : Math.max(0, rawMax));
  const yMin = ticks[0];
  const yMax = ticks[ticks.length - 1];

  const plotW = Math.max(0, width - M.left - M.right);
  const n = points.length || 1;
  const band = plotW / n;
  const y = (v: number) => M.top + height - ((v - yMin) / (yMax - yMin || 1)) * height;
  const cx = (i: number) => M.left + (i + 0.5) * band;
  // The wash and bars sit on zero, or on the axis floor when it starts above zero.
  const zeroY = y(Math.max(yMin, Math.min(0, yMax)));

  // Line + wash, broken across missing days rather than bridged.
  let line = "";
  let area = "";
  if (kind === "line") {
    let run: [number, number][] = [];
    const flush = () => {
      if (run.length) {
        line += `M${run.map(([a, b]) => `${a},${b}`).join("L")}`;
        area += `M${run[0][0]},${zeroY}L${run.map(([a, b]) => `${a},${b}`).join("L")}L${run[run.length - 1][0]},${zeroY}Z`;
      }
      run = [];
    };
    points.forEach((p, i) => (p.value == null ? flush() : run.push([cx(i), y(p.value)])));
    flush();
  }

  const xLabelIdx = n > 2 ? [0, Math.floor((n - 1) / 2), n - 1] : [0, n - 1];
  const hp = hover != null ? points[hover] : null;

  const locate = (clientX: number) => {
    const rect = wrapRef.current?.getBoundingClientRect();
    if (!rect || band <= 0) return;
    const i = Math.floor((clientX - rect.left - M.left) / band);
    setHover(Math.max(0, Math.min(n - 1, i)));
  };

  return (
    <div ref={wrapRef} className="relative w-full select-none">
      {width > 0 && (
        <svg
          width={width}
          height={height + M.top + M.bottom}
          role="img"
          aria-label={label}
          tabIndex={0}
          className="block outline-none"
          onPointerMove={(e) => locate(e.clientX)}
          onPointerDown={(e) => locate(e.clientX)}
          // A finger "leaves" as soon as it lifts; keep its reading until blur.
          onPointerLeave={(e) => e.pointerType !== "touch" && setHover(null)}
          onBlur={() => setHover(null)}
          onKeyDown={(e) => {
            if (e.key === "ArrowLeft") setHover((h) => Math.max(0, (h ?? n) - 1));
            if (e.key === "ArrowRight") setHover((h) => Math.min(n - 1, (h ?? -1) + 1));
          }}
        >
          {/* grid + y ticks */}
          {ticks.map((t) => (
            <g key={t}>
              <line x1={M.left} x2={width - M.right} y1={y(t)} y2={y(t)} stroke={t === 0 ? "var(--chart-axis)" : "var(--chart-grid)"} strokeWidth={1} />
              <text x={M.left - 8} y={y(t)} dy="0.32em" textAnchor="end" fontSize={10} className="mono" fill="var(--text-faint)" style={{ fontVariantNumeric: "tabular-nums" }}>
                {format(t)}
              </text>
            </g>
          ))}

          {kind === "bar" &&
            points.map((p, i) => {
              if (p.value == null) return null;
              const w = Math.max(1, Math.min(24, band - 2));
              const top = y(Math.max(0, p.value));
              const h = Math.abs(y(p.value) - zeroY);
              return (
                <path
                  key={p.date}
                  d={barPath(cx(i) - w / 2, p.value >= 0 ? top : zeroY, w, h, p.value >= 0)}
                  fill={p.value < 0 && negativeColor ? negativeColor : color}
                  opacity={hover == null || hover === i ? 1 : 0.45}
                />
              );
            })}

          {kind === "line" && (
            <>
              <path d={area} fill={color} opacity={0.1} />
              <path d={line} fill="none" stroke={color} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
            </>
          )}

          {/* x labels */}
          {xLabelIdx.map((i, k) =>
            points[i] ? (
              <text
                key={i}
                x={cx(i)}
                y={M.top + height + 16}
                fontSize={10}
                className="mono"
                fill="var(--text-faint)"
                textAnchor={k === 0 ? "start" : k === xLabelIdx.length - 1 ? "end" : "middle"}
              >
                {formatTime(points[i].date)}
              </text>
            ) : null,
          )}

          {/* crosshair */}
          {hp && hover != null && (
            <g pointerEvents="none">
              <line x1={cx(hover)} x2={cx(hover)} y1={M.top} y2={M.top + height} stroke="var(--text-faint)" strokeWidth={1} />
              {kind === "line" && hp.value != null && (
                <circle cx={cx(hover)} cy={y(hp.value)} r={4} fill={color} stroke="var(--bg-surface)" strokeWidth={2} />
              )}
            </g>
          )}
        </svg>
      )}

      {hp && hover != null && (
        <div
          className="pointer-events-none absolute top-0 z-10 px-2.5 py-1.5 rounded-md whitespace-nowrap"
          style={{
            left: Math.min(Math.max(cx(hover) - 60, 0), Math.max(0, width - 130)),
            background: "var(--bg-elevated)",
            border: "1px solid var(--border)",
            boxShadow: "0 6px 20px rgba(0,0,0,0.18)",
          }}
        >
          <div className="mono text-[12px] font-semibold" style={{ color: "var(--text)" }}>
            {hp.value == null ? "No data" : format(hp.value)}
          </div>
          <div className="mono text-[10px]" style={{ color: "var(--text-faint)" }}>
            {formatTime(hp.date)}
          </div>
        </div>
      )}
    </div>
  );
}
