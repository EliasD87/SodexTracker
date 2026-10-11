"use client";

import { useState } from "react";
import { usd } from "@/lib/analyticsFormat";
import type { LiveFlow } from "@/lib/liveStore";
import { heat, Legend } from "@/components/deep/shared";

/**
 * The last 24 hours as a clock. Each ring is a market, busiest outside; each
 * slice is an hour (UTC, midnight at the top). Green slices are hours when
 * aggressive buyers beat aggressive sellers, red the reverse, deeper the more
 * one-sided. Faint slices traded little.
 */

const SIZE = 460;
const C = SIZE / 2;
const INNER = 70;
const OUTER = 212;

function arc(r0: number, r1: number, a0: number, a1: number) {
  const p = (r: number, a: number) => `${(C + r * Math.sin(a)).toFixed(2)} ${(C - r * Math.cos(a)).toFixed(2)}`;
  const large = a1 - a0 > Math.PI ? 1 : 0;
  return `M ${p(r1, a0)} A ${r1} ${r1} 0 ${large} 1 ${p(r1, a1)} L ${p(r0, a1)} A ${r0} ${r0} 0 ${large} 0 ${p(r0, a0)} Z`;
}

export function PressureClock({ flow }: { flow: LiveFlow }) {
  const [hover, setHover] = useState<{ market: string; hour: number; net: number; volume: number } | null>(null);
  const hm = flow.heatmap;
  if (!hm || !hm.markets.length) return null;

  // Busiest market on the outside ring, where it gets the most room.
  const markets = hm.markets.slice(0, 6).reverse();
  const ring = (OUTER - INNER) / markets.length;
  const byKey = new Map(hm.cells.map((c) => [`${c.market}|${c.hour}`, c]));
  const maxVol = new Map(markets.map((m) => [m, Math.max(1, ...hm.cells.filter((c) => c.market === m).map((c) => c.volume))]));
  const step = (2 * Math.PI) / 24;
  const gap = 0.012;

  const buys = hm.cells.reduce((a, c) => a + Math.max(0, c.takerNet), 0);
  const sells = hm.cells.reduce((a, c) => a + Math.max(0, -c.takerNet), 0);
  const net = buys - sells;
  const nowHour = new Date().getUTCHours();

  return (
    <div>
      <svg viewBox={`0 0 ${SIZE} ${SIZE}`} className="w-full max-w-[460px] mx-auto block" role="img" aria-label="Buying and selling pressure by hour for the busiest markets">
        {markets.map((m, ri) => {
          const r0 = INNER + ri * ring + 1.5;
          const r1 = r0 + ring - 3;
          return hm.hours.map((hour) => {
            const cell = byKey.get(`${m}|${hour}`);
            const h = new Date(hour).getUTCHours();
            const a0 = h * step + gap;
            const a1 = (h + 1) * step - gap;
            const vol = cell?.volume ?? 0;
            const ratio = cell && vol > 0 ? cell.takerNet / vol : 0;
            const weight = Math.sqrt(vol / maxVol.get(m)!);
            const fill = vol > 0 ? heat(ratio, Math.min(1, Math.abs(ratio) * 3) * (0.35 + 0.65 * weight)) : "var(--bg-elevated)";
            const active = hover && hover.market === m && hover.hour === hour;
            return (
              <path
                key={`${m}-${hour}`}
                d={arc(r0, r1, a0, a1)}
                fill={fill}
                stroke={active ? "var(--text)" : "none"}
                strokeWidth={1.5}
                opacity={hover && !active ? 0.55 : 1}
                onMouseEnter={() => setHover({ market: m, hour, net: cell?.takerNet ?? 0, volume: vol })}
                onMouseLeave={() => setHover(null)}
              >
                <title>{`${m} · ${String(h).padStart(2, "0")}:00 UTC · ${usd(vol)} traded · aggressive net ${(cell?.takerNet ?? 0) >= 0 ? "+" : "−"}${usd(Math.abs(cell?.takerNet ?? 0))}`}</title>
              </path>
            );
          });
        })}
        {/* Hour marks, and where now is. */}
        {[0, 6, 12, 18].map((h) => {
          const a = h * step;
          return (
            <text key={h} x={C + (OUTER + 14) * Math.sin(a)} y={C - (OUTER + 14) * Math.cos(a)} textAnchor="middle" dominantBaseline="middle" fontSize={11} fill="var(--text-faint)" className="mono">
              {String(h).padStart(2, "0")}
            </text>
          );
        })}
        <line
          x1={C + (INNER - 6) * Math.sin(nowHour * step + step / 2)}
          y1={C - (INNER - 6) * Math.cos(nowHour * step + step / 2)}
          x2={C + (OUTER + 4) * Math.sin(nowHour * step + step / 2)}
          y2={C - (OUTER + 4) * Math.cos(nowHour * step + step / 2)}
          stroke="var(--text)"
          strokeWidth={1}
          strokeDasharray="2 3"
          opacity={0.5}
        />
        {/* Centre: the hovered slice, or the day's balance. */}
        <text x={C} y={C - 14} textAnchor="middle" fontSize={11} fill="var(--text-muted)">
          {hover ? `${hover.market.replace(/-USD$/, "")} · ${String(new Date(hover.hour).getUTCHours()).padStart(2, "0")}:00` : "Last 24 hours"}
        </text>
        <text x={C} y={C + 8} textAnchor="middle" fontSize={20} fontWeight={600} fill={(hover ? hover.net : net) >= 0 ? "var(--green)" : "var(--red)"} className="mono">
          {(hover ? hover.net : net) >= 0 ? "+" : "−"}
          {usd(Math.abs(hover ? hover.net : net))}
        </text>
        <text x={C} y={C + 26} textAnchor="middle" fontSize={10.5} fill="var(--text-faint)">
          {hover ? `${usd(hover.volume)} traded` : "aggressive net buying"}
        </text>
      </svg>
      <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
        <Legend
          items={[
            { label: "Buyers pushing", color: heat(1, 0.8) },
            { label: "Sellers pushing", color: heat(-1, 0.8) },
          ]}
        />
        <span className="text-[11.5px]" style={{ color: "var(--text-faint)" }}>
          Rings, outside in: {[...markets].reverse().map((m) => m.replace(/-USD$/, "")).join(", ")}
        </span>
      </div>
    </div>
  );
}
