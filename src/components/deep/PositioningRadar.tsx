"use client";

import { useRef, useState } from "react";
import { pct, usd } from "@/lib/analyticsFormat";
import type { PositionsOverview, SizeGroup } from "@/lib/positionStore";
import { TokenIcon } from "@/components/TokenIcon";
import { Legend } from "@/components/deep/shared";

/**
 * Whales against everyone smaller, market by market. Each spoke is a market;
 * the further out a shape reaches, the more of that group's money there is
 * long. The dashed ring is even: inside it, the group leans short.
 */

const SIZE = 440;
const C = SIZE / 2;
const R = 160;

const SIDES: { key: string; label: string; color: string; groups: SizeGroup[] }[] = [
  { key: "whales", label: "Whales ($250K+ accounts)", color: "var(--tier-niche)", groups: ["whale", "leviathan"] },
  { key: "small", label: "Everyone smaller", color: "var(--tier-active)", groups: ["shrimp", "fish", "dolphin", "shark"] },
];

export function PositioningRadar({ data, by = "volume", extra = [] }: { data: PositionsOverview; by?: "volume" | "open"; extra?: string[] }) {
  const [focus, setFocus] = useState<number | null>(null);
  const [tip, setTip] = useState<{ x: number; y: number; w: number } | null>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const base = (by === "open" && data.heatmap.byOpen?.length ? data.heatmap.byOpen : data.heatmap.markets).slice(0, 8);
  // Picked pairs become extra spokes once their data is in.
  const have = new Set(data.heatmap.cells.map((c) => c.market));
  const markets = [...base, ...extra.filter((m) => !base.includes(m) && have.has(m))];
  if (markets.length < 3) return null;

  const share = (market: string, groups: SizeGroup[]) => {
    const cells = data.heatmap.cells.filter((c) => c.market === market && groups.includes(c.group));
    const long = cells.reduce((a, c) => a + c.longUsd, 0);
    const short = cells.reduce((a, c) => a + c.shortUsd, 0);
    return { long, short, share: long + short > 0 ? long / (long + short) : null };
  };
  const rows = markets.map((m) => ({ market: m, sides: SIDES.map((s) => share(m, s.groups)) }));
  const angle = (i: number) => (i / markets.length) * 2 * Math.PI;
  const at = (i: number, v: number) => [C + R * v * Math.sin(angle(i)), C - R * v * Math.cos(angle(i))] as const;
  // Each market owns the slice of the chart around its spoke, so hovering
  // anywhere near it picks it, not just the thin line or the label.
  const half = Math.PI / markets.length;
  const slice = (i: number) => {
    const r = R * 1.3;
    const p = (a: number) => `${C + r * Math.sin(a)} ${C - r * Math.cos(a)}`;
    return `M ${C} ${C} L ${p(angle(i) - half)} A ${r} ${r} 0 0 1 ${p(angle(i) + half)} Z`;
  };
  const lean = (v: number | null) => (v == null ? "no positions" : v >= 0.6 ? "leans long" : v <= 0.4 ? "leans short" : "about even");

  return (
    <div ref={wrapRef} className="relative" onMouseLeave={() => (setFocus(null), setTip(null))}>
      <svg viewBox={`0 0 ${SIZE} ${SIZE}`} className="w-full max-w-[440px] mx-auto block" role="img" aria-label="Share of positions held long, whales against smaller traders, per market">
        {[0.25, 0.5, 0.75, 1].map((v) => (
          <polygon
            key={v}
            points={markets.map((_, i) => at(i, v).join(",")).join(" ")}
            fill="none"
            stroke={v === 0.5 ? "var(--text-faint)" : "var(--border)"}
            strokeDasharray={v === 0.5 ? "4 4" : undefined}
            strokeWidth={1}
          />
        ))}
        {markets.map((m, i) => {
          const [x, y] = at(i, 1);
          const [lx, ly] = at(i, 1.16);
          return (
            <g key={m}>
              {focus === i && <path d={slice(i)} fill="var(--text)" fillOpacity={0.04} />}
              <line x1={C} y1={C} x2={x} y2={y} stroke={focus === i ? "var(--text-muted)" : "var(--border)"} strokeWidth={1} />
              <text x={lx} y={ly} textAnchor="middle" dominantBaseline="middle" fontSize={12} fontWeight={focus === i ? 700 : 500} fill={focus === i ? "var(--text)" : "var(--text-muted)"}>
                {m.replace(/-USD$/, "")}
              </text>
            </g>
          );
        })}
        <text x={C + 4} y={C - R * 0.5 - 4} fontSize={9.5} fill="var(--text-faint)">
          even
        </text>
        {SIDES.map((s, si) => {
          const pts = rows.map((r, i) => at(i, r.sides[si].share ?? 0.5));
          return (
            <g key={s.key}>
              <polygon points={pts.map((p) => p.join(",")).join(" ")} fill={s.color} fillOpacity={0.14} stroke={s.color} strokeWidth={2} strokeLinejoin="round" />
              {pts.map(([x, y], i) => (
                <circle key={i} cx={x} cy={y} r={focus === i ? 5 : 3.5} fill={s.color} opacity={rows[i].sides[si].share == null ? 0.3 : 1} />
              ))}
            </g>
          );
        })}
        {markets.map((m, i) => (
          <path
            key={`hit-${m}`}
            d={slice(i)}
            fill="transparent"
            onMouseMove={(e) => {
              const box = wrapRef.current?.getBoundingClientRect();
              if (!box) return;
              setFocus(i);
              setTip({ x: e.clientX - box.left, y: e.clientY - box.top, w: box.width });
            }}
          />
        ))}
      </svg>
      {focus != null && tip && (
        <div
          role="tooltip"
          className="pointer-events-none absolute z-20 w-[230px] px-3 py-2.5 text-[12px]"
          style={{
            left: Math.max(0, Math.min(tip.x + 14, tip.w - 238)),
            top: tip.y + 14,
            background: "var(--bg-surface)",
            border: "1px solid var(--border)",
            borderRadius: 12,
            boxShadow: "0 12px 32px rgba(0,0,0,0.3)",
          }}
        >
          <div className="flex items-center gap-1.5 font-semibold" style={{ color: "var(--text)" }}>
            <TokenIcon symbol={markets[focus]} size={14} />
            {markets[focus].replace(/-USD$/, "")}
          </div>
          {SIDES.map((sd, si) => {
            const v = rows[focus].sides[si];
            return (
              <div key={sd.key} className="mt-2">
                <div className="flex items-center justify-between gap-2">
                  <span className="inline-flex items-center gap-1.5" style={{ color: "var(--text-muted)" }}>
                    <span className="w-2 h-2 rounded-full" style={{ background: sd.color }} />
                    {sd.label.split(" (")[0]}
                  </span>
                  <span className="mono" style={{ color: "var(--text)" }}>
                    {v.share == null ? "—" : `${pct(v.share, 0)} long`}
                  </span>
                </div>
                {v.share != null && (
                  <>
                    <div className="mt-1 flex h-1.5 gap-[2px]" aria-hidden>
                      <span className="rounded-full" style={{ width: `${v.share * 100}%`, background: "var(--green)" }} />
                      <span className="rounded-full" style={{ width: `${(1 - v.share) * 100}%`, background: "var(--red)" }} />
                    </div>
                    <div className="mt-1 flex justify-between text-[11px] mono" style={{ color: "var(--text-faint)" }}>
                      <span>{usd(v.long)} long</span>
                      <span>{lean(v.share)}</span>
                      <span>{usd(v.short)} short</span>
                    </div>
                  </>
                )}
              </div>
            );
          })}
        </div>
      )}
      <p className="mt-2 text-center text-[12px]" style={{ color: "var(--text-faint)" }}>
        Hover the chart for each market&apos;s split.
      </p>
      <div className="mt-2 flex justify-center">
        <Legend items={SIDES.map((s) => ({ label: s.label, color: s.color, round: true }))} />
      </div>
    </div>
  );
}
