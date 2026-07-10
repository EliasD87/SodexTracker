"use client";

import { useEffect, useRef, useState } from "react";
import { Wallet } from "lucide-react";
import { TokenIcon } from "@/components/TokenIcon";
import { sectorIcon, prettyIndexName } from "@/lib/indexMeta";

/**
 * Unified look-through Sankey, horizontal: index tokens (plus a "Direct" node
 * for coins also held outright) stack on the LEFT; the merged underlying coins
 * stack on the RIGHT; ribbons flow across, thickness ∝ dollars. A coin fed by
 * two sources receives two ribbons into the same node — overlap made visible.
 *
 * Hand-rolled SVG (no chart lib), theme-aware, resize-observed.
 */

export interface GraphSource {
  id: string; // "ssiMAG7" | "direct"
  label: string; // "MAG7" | "Direct"
  usd: number;
  kind: "index" | "direct";
}
export interface GraphTarget {
  ticker: string; // "BTC" or "OTHERS"
  label: string;
  total: number;
  direct: number; // >0 → overlap
  count?: number; // for the aggregated OTHERS node
}
export interface GraphLink {
  source: string;
  target: string;
  usd: number;
}
export interface LookThroughData {
  totalUsd: number;
  sources: GraphSource[];
  targets: GraphTarget[];
  links: GraphLink[];
}

/* Fixed categorical order for index sources (identity), green for direct. */
const INDEX_COLORS = ["#7C6BF0", "#4E9FE8", "#E0709E"];
const sourceColor = (s: GraphSource, indexRank: number) =>
  s.kind === "direct" ? "var(--green)" : INDEX_COLORS[indexRank % INDEX_COLORS.length];

const fmtUsd = (n: number) =>
  n < 0.005 && n > 0
    ? "<$0.01"
    : n >= 1000
      ? "$" + (n / 1000).toFixed(1) + "K"
      : "$" + n.toFixed(2);
/* Narrow screens: drop cents to keep labels tight. */
const fmtUsdShort = (n: number) =>
  n < 0.005 && n > 0
    ? "<$0.01"
    : n >= 1000
      ? "$" + (n / 1000).toFixed(1) + "K"
      : n >= 100
        ? "$" + n.toFixed(0)
        : "$" + n.toFixed(2);

const BAR_W = 10;

/** Proportional vertical layout with a minimum size, gap-separated, fit-clamped. */
function layoutV(values: number[], h: number, gap: number, minH: number) {
  const n = values.length;
  const avail = h - gap * (n - 1);
  const total = values.reduce((s, x) => s + x, 0) || 1;
  let sizes = values.map((v) => Math.max(minH, (v / total) * avail));
  const sum = sizes.reduce((s, x) => s + x, 0);
  if (sum > avail) sizes = sizes.map((x) => (x / sum) * avail);
  const ys: { y0: number; y1: number }[] = [];
  let y = (h - (sizes.reduce((s, v) => s + v, 0) + gap * (n - 1))) / 2;
  for (const sz of sizes) {
    ys.push({ y0: y, y1: y + sz });
    y += sz + gap;
  }
  return ys;
}

export function LookThroughGraph({ data }: { data: LookThroughData }) {
  const ref = useRef<HTMLDivElement>(null);
  const [w, setW] = useState(0);
  const [hover, setHover] = useState<{ kind: "source" | "target"; id: string } | null>(null);
  // Touch devices get tap-to-isolate instead of hover.
  const [canHover] = useState(
    () => typeof window !== "undefined" && window.matchMedia("(hover: hover)").matches,
  );

  useEffect(() => {
    if (!ref.current) return;
    const ro = new ResizeObserver((e) => setW(e[0].contentRect.width));
    ro.observe(ref.current);
    return () => ro.disconnect();
  }, []);

  const enter = (kind: "source" | "target", id: string) => canHover && setHover({ kind, id });
  const leave = () => canHover && setHover(null);
  const tap = (kind: "source" | "target", id: string) =>
    !canHover && setHover((h) => (h && h.kind === kind && h.id === id ? null : { kind, id }));

  const { sources, targets, links } = data;
  const compact = w > 0 && w < 480;
  const SRC_LABEL_W = compact ? 76 : 116;
  const TGT_LABEL_W = compact ? 90 : 128;
  const fmt = compact ? fmtUsdShort : fmtUsd;
  const H = Math.max(compact ? 280 : 320, targets.length * (compact ? 36 : 38), sources.length * (compact ? 56 : 64));

  const srcYs = layoutV(sources.map((s) => s.usd), H, 18, 28);
  const tgtYs = layoutV(targets.map((t) => t.total), H, 12, 18);
  const srcIdx = new Map(sources.map((s, i) => [s.id, i]));
  const tgtIdx = new Map(targets.map((t, i) => [t.ticker, i]));
  let ir = 0;
  const indexRank = new Map<string, number>();
  for (const s of sources) if (s.kind === "index") indexRank.set(s.id, ir++);

  const srcBarX = SRC_LABEL_W;
  const tgtBarX = w - TGT_LABEL_W - BAR_W;

  /* Allocate ribbon segments along each source/target bar (classic Sankey). */
  const srcOff = sources.map(() => 0);
  const tgtOff = targets.map(() => 0);
  const ordered = [...links].sort((a, b) => {
    const sa = srcIdx.get(a.source)! - srcIdx.get(b.source)!;
    return sa !== 0 ? sa : tgtIdx.get(a.target)! - tgtIdx.get(b.target)!;
  });
  const ribbons = ordered
    .map((l) => {
      const si = srcIdx.get(l.source);
      const ti = tgtIdx.get(l.target);
      if (si == null || ti == null) return null;
      const s = sources[si];
      const t = targets[ti];
      const sH = srcYs[si].y1 - srcYs[si].y0;
      const tH = tgtYs[ti].y1 - tgtYs[ti].y0;
      const sh = (l.usd / (s.usd || 1)) * sH;
      const th = (l.usd / (t.total || 1)) * tH;
      const sy0 = srcYs[si].y0 + srcOff[si];
      const ty0 = tgtYs[ti].y0 + tgtOff[ti];
      srcOff[si] += sh;
      tgtOff[ti] += th;
      return { l, si, ti, sy0, sy1: sy0 + sh, ty0, ty1: ty0 + th, color: sourceColor(s, indexRank.get(s.id) ?? 0) };
    })
    .filter((r): r is NonNullable<typeof r> => r !== null);

  const related = (r: (typeof ribbons)[number]) =>
    !hover || (hover.kind === "source" ? r.l.source === hover.id : r.l.target === hover.id);

  const x0 = srcBarX + BAR_W;
  const x1 = tgtBarX;
  const mid = (x0 + x1) / 2;

  return (
    <div ref={ref} className="relative w-full select-none" style={{ height: H }}>
      {w > 0 && (
        <>
          <svg width={w} height={H} className="absolute inset-0">
            {/* ribbons */}
            {ribbons.map((r, i) => (
              <path
                key={i}
                d={`M ${x0} ${r.sy0} C ${mid} ${r.sy0}, ${mid} ${r.ty0}, ${x1} ${r.ty0} L ${x1} ${r.ty1} C ${mid} ${r.ty1}, ${mid} ${r.sy1}, ${x0} ${r.sy1} Z`}
                fill={r.color}
                opacity={related(r) ? (hover ? 0.72 : 0.4) : 0.07}
                style={{ transition: "opacity 0.18s ease" }}
              >
                <title>{`${sources[r.si].label} → ${targets[r.ti].label} · ${fmtUsd(r.l.usd)}`}</title>
              </path>
            ))}
            {/* source bars */}
            {sources.map((s, i) => (
              <rect
                key={s.id}
                x={srcBarX}
                y={srcYs[i].y0}
                width={BAR_W}
                height={srcYs[i].y1 - srcYs[i].y0}
                rx={3}
                fill={sourceColor(s, indexRank.get(s.id) ?? 0)}
                opacity={!hover || (hover.kind === "source" && hover.id === s.id) ? 1 : 0.3}
                style={{ cursor: "pointer", transition: "opacity 0.18s ease" }}
                onMouseEnter={() => enter("source", s.id)}
                onMouseLeave={leave}
                onClick={() => tap("source", s.id)}
              />
            ))}
            {/* target bars */}
            {targets.map((t, i) => (
              <rect
                key={t.ticker}
                x={tgtBarX}
                y={tgtYs[i].y0}
                width={BAR_W}
                height={tgtYs[i].y1 - tgtYs[i].y0}
                rx={3}
                fill={t.direct > 0 ? "var(--green)" : "var(--text-faint)"}
                opacity={!hover || (hover.kind === "target" && hover.id === t.ticker) ? 0.85 : 0.3}
                style={{ cursor: "pointer", transition: "opacity 0.18s ease" }}
                onMouseEnter={() => enter("target", t.ticker)}
                onMouseLeave={leave}
                onClick={() => tap("target", t.ticker)}
              />
            ))}
          </svg>

          {/* source labels — left of bars, right-aligned */}
          {sources.map((s, i) => {
            const cy = (srcYs[i].y0 + srcYs[i].y1) / 2;
            const Icon = s.kind === "direct" ? Wallet : sectorIcon(s.id);
            const color = sourceColor(s, indexRank.get(s.id) ?? 0);
            const active = hover?.kind === "source" && hover.id === s.id;
            return (
              <div
                key={s.id}
                className="absolute flex flex-col items-end whitespace-nowrap"
                style={{
                  right: w - srcBarX + 10,
                  top: cy,
                  transform: "translateY(-50%)",
                  cursor: "pointer",
                  opacity: !hover || active ? 1 : 0.4,
                  transition: "opacity 0.18s ease",
                }}
                onMouseEnter={() => enter("source", s.id)}
                onMouseLeave={leave}
                onClick={() => tap("source", s.id)}
              >
                <span className="flex items-center gap-1.5">
                  <Icon size={compact ? 11 : 12} style={{ color }} />
                  <span className={`${compact ? "text-[11px]" : "text-[12px]"} font-semibold`} style={{ color: "var(--text)" }}>{s.label}</span>
                </span>
                <span className={`mono ${compact ? "text-[9.5px]" : "text-[10.5px]"}`} style={{ color: "var(--text-muted)" }}>{fmt(s.usd)}</span>
              </div>
            );
          })}

          {/* target labels — right of bars, one row per coin */}
          {targets.map((t, i) => {
            const cy = (tgtYs[i].y0 + tgtYs[i].y1) / 2;
            const active = hover?.kind === "target" && hover.id === t.ticker;
            return (
              <div
                key={t.ticker}
                className="absolute flex items-center gap-1.5 whitespace-nowrap rounded-md px-1.5 py-0.5"
                style={{
                  left: tgtBarX + BAR_W + 6,
                  top: cy,
                  transform: "translateY(-50%)",
                  cursor: "pointer",
                  background: active ? "var(--bg-elevated)" : "transparent",
                  opacity: !hover || active ? 1 : 0.4,
                  transition: "opacity 0.18s ease, background 0.18s ease",
                }}
                onMouseEnter={() => enter("target", t.ticker)}
                onMouseLeave={leave}
                onClick={() => tap("target", t.ticker)}
              >
                <span
                  className="shrink-0"
                  style={{ borderRadius: "50%", boxShadow: t.direct > 0 ? "0 0 0 1.5px var(--green)" : undefined }}
                >
                  {t.ticker === "OTHERS" ? (
                    <span
                      className="flex items-center justify-center rounded-full mono font-bold"
                      style={{ width: 16, height: 16, fontSize: 7, background: "var(--bg-elevated)", border: "1px solid var(--border)", color: "var(--text-muted)" }}
                    >
                      +{t.count ?? 0}
                    </span>
                  ) : (
                    <TokenIcon symbol={t.ticker} size={16} />
                  )}
                </span>
                <span className={`${compact ? "text-[10px]" : "text-[11px]"} font-semibold`} style={{ color: "var(--text)" }}>{t.label}</span>
                <span className={`mono ${compact ? "text-[9px]" : "text-[10px]"}`} style={{ color: "var(--text-muted)" }}>{fmt(t.total)}</span>
              </div>
            );
          })}
        </>
      )}
    </div>
  );
}
