"use client";

import { useRef, useState } from "react";
import { usd } from "@/lib/analyticsFormat";
import type { PositionsOverview } from "@/lib/positionStore";
import { TokenIcon } from "@/components/TokenIcon";
import { Legend } from "@/components/deep/shared";

/**
 * Where the pain sits. Each column is a market, from 12.5% above its price at
 * the top to 12.5% below at the bottom, in half-percent steps. Coloured by
 * the move, as charts read: shorts get liquidated if price climbs into a green
 * cell, longs if it drops into a red one; the brighter, the more money there.
 */

const STEPS = 25; // half-percent steps either side of the price

const price = (n: number) => (n >= 1000 ? n.toLocaleString("en-US", { maximumFractionDigits: 0 }) : n >= 1 ? n.toFixed(2) : n.toPrecision(3));

export function LiquidationZones({ data, by = "volume", extra = [] }: { data: PositionsOverview; by?: "volume" | "open"; extra?: string[] }) {
  const [hover, setHover] = useState<{ market: string; k: number; usd: number; upTo: number; price: number; x: number; y: number; w: number } | null>(null);
  const boxRef = useRef<HTMLDivElement>(null);
  const list = by === "open" && data.liquidation.byOpen?.length ? data.liquidation.byOpen : data.liquidation.markets;
  // Picked pairs join on the right, once their data is in.
  const markets = [...list, ...extra.filter((m) => !list.includes(m))].filter((m) => data.liquidation.byMarket[m]);
  if (!markets.length) return null;

  // One scale across every column, so a bright cell means the same everywhere.
  const all = markets.flatMap((m) => data.liquidation.byMarket[m].buckets.flatMap((b) => [b.longUsd, b.shortUsd]));
  const max = Math.max(1, ...all);

  return (
    <div ref={boxRef} className="relative" onMouseLeave={() => setHover(null)}>
      {/* A phone swipes through the columns, three in view; wider screens fit them all. */}
      <div
        className="scroll-row flex snap-x snap-mandatory scroll-px-4 sm:scroll-px-0 gap-x-3 -mx-4 px-4 sm:mx-0 sm:px-0 sm:overflow-visible sm:grid sm:[grid-template-columns:repeat(var(--cols),minmax(0,1fr))]"
        style={{ ["--cols" as string]: Math.max(markets.length, 6) }}
        onScroll={() => setHover(null)}
      >
        {markets.map((m) => {
          const { mark, buckets } = data.liquidation.byMarket[m];
          const cells = new Map<number, { long: number; short: number; price: number }>();
          for (const b of buckets) {
            const k = Math.round((b.price - mark) / (mark * 0.005));
            if (Math.abs(k) <= STEPS) cells.set(k, { long: b.longUsd, short: b.shortUsd, price: b.price });
          }
          // Everything between the price and level k, inclusive: what a move that far would wipe out.
          const upTo = (k: number) =>
            [...cells.entries()].filter(([j]) => (k > 0 ? j > 0 && j <= k : j < 0 && j >= k)).reduce((a, [, c]) => a + (k > 0 ? c.short : c.long), 0);
          const near = (dir: 1 | -1) =>
            [...cells.entries()].filter(([k]) => k * dir > 0 && Math.abs(k) <= 10).reduce((a, [, c]) => a + (dir > 0 ? c.short : c.long), 0);
          return (
            <div key={m} className="min-w-0 shrink-0 basis-[29%] snap-start sm:basis-auto">
              <div className="flex flex-col gap-[2px]" role="img" aria-label={`${m} liquidation levels around ${price(mark)}`}>
                {Array.from({ length: STEPS * 2 + 1 }, (_, i) => STEPS - i).map((k) => {
                  if (k === 0) {
                    return (
                      <div key={k} className="relative h-[3px] my-[3px] rounded-full" style={{ background: "var(--text)" }}>
                        <span
                          className="absolute right-0 -top-[7px] text-[9.5px] mono px-1 rounded"
                          style={{ background: "var(--bg-surface)", color: "var(--text)" }}
                        >
                          {price(mark)}
                        </span>
                      </div>
                    );
                  }
                  const c = cells.get(k);
                  const v = c ? (k > 0 ? c.short : c.long) : 0;
                  const s = Math.sqrt(v / max);
                  const hue = k > 0 ? "var(--green)" : "var(--red)";
                  const active = hover && hover.market === m && hover.k === k;
                  return (
                    <div
                      key={k}
                      className="h-[5px] sm:h-[6px] rounded-[2px] transition-transform"
                      onMouseMove={(e) => {
                        const box = boxRef.current?.getBoundingClientRect();
                        if (!box) return;
                        setHover({
                          market: m,
                          k,
                          usd: v,
                          upTo: upTo(k),
                          price: c?.price ?? mark * (1 + k * 0.005),
                          x: e.clientX - box.left,
                          y: e.clientY - box.top,
                          w: box.width,
                        });
                      }}
                      style={{
                        background: v > 0 ? `color-mix(in srgb, ${hue} ${Math.round(18 + s * 82)}%, var(--bg-elevated))` : "var(--bg-elevated)",
                        boxShadow: s > 0.55 ? `0 0 ${Math.round(s * 10)}px color-mix(in srgb, ${hue} 55%, transparent)` : undefined,
                        transform: active ? "scaleX(1.06)" : undefined,
                        outline: active ? "1px solid var(--text)" : undefined,
                      }}
                    />
                  );
                })}
              </div>
              <div className="mt-3 flex items-center gap-1.5 text-[12.5px] font-semibold" style={{ color: "var(--text)" }}>
                <TokenIcon symbol={m} size={16} />
                {m.replace(/-USD$/, "")}
              </div>
              <div className="mt-1 text-[11px] mono leading-relaxed" style={{ color: "var(--text-faint)" }}>
                <span style={{ color: "var(--green)" }}>▲</span> {usd(near(1))} shorts
                <br />
                <span style={{ color: "var(--red)" }}>▼</span> {usd(near(-1))} longs
              </div>
            </div>
          );
        })}
      </div>
      {hover && (
        <div
          role="tooltip"
          className="pointer-events-none absolute z-20 w-[220px] px-3 py-2.5 text-[12px]"
          style={{
            // Beside the pointer, flipped inside the box near the right edge.
            left: Math.max(0, Math.min(hover.x + 14, hover.w - 228)),
            top: hover.y + 14,
            background: "var(--bg-surface)",
            border: "1px solid var(--border)",
            borderRadius: 12,
            boxShadow: "0 12px 32px rgba(0,0,0,0.3)",
          }}
        >
          <div className="flex items-center justify-between gap-2">
            <span className="flex items-center gap-1.5 font-semibold" style={{ color: "var(--text)" }}>
              <TokenIcon symbol={hover.market} size={14} />
              {hover.market.replace(/-USD$/, "")} at {price(hover.price)}
            </span>
            <span className="mono text-[11px]" style={{ color: hover.k > 0 ? "var(--green)" : "var(--red)" }}>
              {hover.k > 0 ? "+" : "−"}
              {(Math.abs(hover.k) * 0.5).toFixed(1)}%
            </span>
          </div>
          <div className="mt-2 flex items-center justify-between" style={{ color: "var(--text-muted)" }}>
            <span>{hover.k > 0 ? "Shorts" : "Longs"} liquidated here</span>
            <span className="mono" style={{ color: "var(--text)" }}>
              {usd(hover.usd)}
            </span>
          </div>
          <div className="mt-1 flex items-center justify-between" style={{ color: "var(--text-muted)" }}>
            <span>If price {hover.k > 0 ? "rises" : "falls"} this far</span>
            <span className="mono" style={{ color: "var(--text)" }}>
              {usd(hover.upTo)}
            </span>
          </div>
        </div>
      )}
      <div className="mt-5 flex flex-wrap items-center justify-between gap-3">
        <Legend
          items={[
            { label: "Shorts liquidated if price rises here", color: "var(--green)" },
            { label: "Longs liquidated if price falls here", color: "var(--red)" },
          ]}
        />
        <span className="text-[12px]" style={{ color: "var(--text-muted)" }}>
          Hover or tap a layer for its level. Totals under each column are within 5% of the price.
        </span>
      </div>
    </div>
  );
}
