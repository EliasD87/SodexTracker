"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { growth, marketSlug, pct, usd } from "@/lib/analyticsFormat";
import type { MarketRow, WindowKey } from "@/lib/exchangeAnalytics";
import { TokenIcon } from "@/components/TokenIcon";
import { heat, Legend, useWidth } from "@/components/deep/shared";

/**
 * Every market as a tile: bigger means more volume, colour is how its
 * volume moved against the prior window. The small ones fold into "Others".
 */

interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** Squarified treemap: rows of tiles kept as close to square as the space allows. */
function squarify(values: number[], x: number, y: number, w: number, h: number): Rect[] {
  const total = values.reduce((a, v) => a + v, 0);
  if (!total || w <= 0 || h <= 0) return [];
  const areas = values.map((v) => (v / total) * w * h);
  const out: Rect[] = [];
  const worst = (row: number[], side: number) => {
    const s = row.reduce((a, v) => a + v, 0);
    const mx = Math.max(...row);
    const mn = Math.min(...row);
    return Math.max((side * side * mx) / (s * s), (s * s) / (side * side * mn));
  };
  let i = 0;
  while (i < areas.length) {
    const side = Math.min(w, h);
    const row = [areas[i]];
    let j = i + 1;
    while (j < areas.length && worst([...row, areas[j]], side) <= worst(row, side)) row.push(areas[j++]);
    const s = row.reduce((a, v) => a + v, 0);
    if (w >= h) {
      const rw = s / h;
      let yy = y;
      for (const a of row) {
        out.push({ x, y: yy, w: rw, h: a / rw });
        yy += a / rw;
      }
      x += rw;
      w -= rw;
    } else {
      const rh = s / w;
      let xx = x;
      for (const a of row) {
        out.push({ x: xx, y, w: a / rh, h: rh });
        xx += a / rh;
      }
      y += rh;
      h -= rh;
    }
    i = j;
  }
  return out;
}

const TILES = 36;

export function MarketHeatmap({ markets, win }: { markets: MarketRow[]; win: WindowKey }) {
  const [ref, width] = useWidth<HTMLDivElement>();
  const [hover, setHover] = useState<string | null>(null);
  const height = width < 640 ? 420 : 520;

  const tiles = useMemo(() => {
    const sorted = [...markets].filter((m) => m.volume > 0).sort((a, b) => b.volume - a.volume);
    const top = sorted.slice(0, TILES);
    const rest = sorted.slice(TILES);
    const items: { key: string; market: MarketRow | null; volume: number; change: number | null; count?: number }[] = top.map((m) => ({
      key: m.symbol,
      market: m,
      volume: m.volume,
      change: m.volumeChange,
    }));
    if (rest.length) items.push({ key: "Others", market: null, volume: rest.reduce((a, m) => a + m.volume, 0), change: null, count: rest.length });
    // Area grows with the square root of volume: BTC and ETH still lead, but
    // the long tail gets tiles big enough to read.
    const shown = items.map((t) => Math.sqrt(t.volume));
    const rects = squarify(shown, 0, 0, width, height);
    return items.map((t, i) => ({ ...t, rect: rects[i] }));
  }, [markets, width, height]);

  const total = markets.reduce((a, m) => a + m.volume, 0) || 1;
  const focus = tiles.find((t) => t.key === hover);

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3 mb-3 min-h-[22px]">
        <Legend
          items={[
            { label: "Volume up", color: heat(1, 0.8) },
            { label: "Flat", color: "var(--bg-elevated)" },
            { label: "Volume down", color: heat(-1, 0.8) },
          ]}
        />
        <span className="text-[12px] mono" style={{ color: "var(--text-muted)" }}>
          {focus
            ? `${focus.market ? focus.market.symbol : `${focus.count} smaller markets`} · ${usd(focus.volume)} · ${pct(focus.volume / total, 1)} of volume${focus.change != null ? ` · ${growth(focus.change)} vs prior ${win}` : ""}`
            : "Bigger tile, more volume (square-root scale). Hover for figures."}
        </span>
      </div>
      <div ref={ref} className="relative w-full" style={{ height }}>
        {width > 0 &&
          tiles.map((t) => {
            if (!t.rect) return null;
            const { x, y, w, h } = t.rect;
            const c = t.change;
            // Log scale, so +30% and +300% both read, and the colour tops out at 4×.
            const strength = c == null ? 0 : 0.8 * Math.min(1, Math.log1p(Math.abs(c)) / Math.log(4));
            const bg = c == null ? "var(--bg-elevated)" : heat(c, strength);
            const big = w > 92 && h > 64;
            const fits = w > 46 && h > 30;
            const body = (
              <div
                className="absolute inset-[2px] rounded-[10px] overflow-hidden flex flex-col justify-between p-2.5 transition-[filter] duration-150"
                style={{ background: bg, filter: hover && hover !== t.key ? "saturate(0.6) opacity(0.75)" : undefined }}
              >
                {fits && (
                  <span className="flex items-center gap-1.5 min-w-0">
                    {big && t.market && <TokenIcon symbol={t.market.symbol} size={18} />}
                    <span className="truncate font-semibold" style={{ color: "var(--text)", fontSize: big ? 14 : 11 }}>
                      {t.market ? t.market.symbol.replace(/-USD$/, "") : "Others"}
                    </span>
                  </span>
                )}
                {big && (
                  <span className="flex items-end justify-between gap-2">
                    <span className="mono text-[11.5px]" style={{ color: "var(--text)", opacity: 0.7 }}>
                      {usd(t.volume)}
                    </span>
                    {c != null && (
                      <span className="mono text-[12px] font-semibold" style={{ color: "var(--text)" }}>
                        {growth(c)}
                      </span>
                    )}
                  </span>
                )}
              </div>
            );
            const style = { left: x, top: y, width: w, height: h } as const;
            return t.market ? (
              <Link
                key={t.key}
                href={`/analytics/markets/${marketSlug(t.market.symbol)}?w=${win}`}
                className="absolute"
                style={style}
                onMouseEnter={() => setHover(t.key)}
                onMouseLeave={() => setHover(null)}
                aria-label={`${t.market.symbol}: ${usd(t.volume)}${c != null ? `, ${growth(c)} vs prior ${win}` : ""}`}
              >
                {body}
              </Link>
            ) : (
              <div key={t.key} className="absolute" style={style} onMouseEnter={() => setHover(t.key)} onMouseLeave={() => setHover(null)}>
                {body}
              </div>
            );
          })}
      </div>
    </div>
  );
}
