"use client";

import type { ReactNode } from "react";

/**
 * Interactive part-to-whole donut for index constituents.
 *
 * Color job = magnitude (weight), so slices use a single-hue SEQUENTIAL ramp
 * ordered heaviest→lightest, never a categorical rainbow. Identity is carried
 * by the legend's icons + labels, not by slice hue. A 2px surface ring
 * separates adjacent slices (dataviz mark spec).
 *
 * Hover is controlled by the parent (`hovered` / `onHover`) so the donut and the
 * legend can highlight in sync. The hovered slice pops and thickens while the
 * rest recede; `center` (a parent-supplied node) shows the hovered detail.
 */

export interface DonutSlice {
  key: string;
  weight: number; // 0..1
}

// Dedicated "SoSoValue intelligence" hue, ramped by weight rank.
const VIOLET = "124, 107, 240"; // #7C6BF0

export function sliceColor(rank: number, total: number): string {
  const t = total <= 1 ? 1 : 1 - rank / total;
  const opacity = 0.4 + 0.6 * t;
  return `rgba(${VIOLET}, ${opacity.toFixed(3)})`;
}

export function IndexDonut({
  slices,
  size = 172,
  thickness = 22,
  hovered = null,
  onHover,
  center,
}: {
  slices: DonutSlice[];
  size?: number;
  thickness?: number;
  hovered?: number | null;
  onHover?: (i: number | null) => void;
  center?: ReactNode;
}) {
  const r = (size - thickness - 6) / 2; // leave room for the hovered slice to bulge
  const c = 2 * Math.PI * r;
  const cx = size / 2;
  const cy = size / 2;

  let acc = 0;
  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} role="img" aria-label="Index constituents by weight">
        {/* track */}
        <circle cx={cx} cy={cy} r={r} fill="none" stroke="var(--bg-elevated)" strokeWidth={thickness} />
        {slices.map((s, i) => {
          const dash = Math.max(s.weight * c, 0);
          const offset = -acc * c;
          acc += s.weight;
          const isHovered = hovered === i;
          const dimmed = hovered !== null && !isHovered;
          return (
            <circle
              key={s.key}
              cx={cx}
              cy={cy}
              r={r}
              fill="none"
              stroke={sliceColor(i, slices.length)}
              strokeWidth={isHovered ? thickness + 6 : thickness}
              strokeDasharray={`${dash} ${c - dash}`}
              strokeDashoffset={offset}
              transform={`rotate(-90 ${cx} ${cy})`}
              onMouseEnter={() => onHover?.(i)}
              onMouseLeave={() => onHover?.(null)}
              style={{
                cursor: "pointer",
                opacity: dimmed ? 0.22 : 1,
                transition: "opacity 0.18s ease, stroke-width 0.18s ease",
              }}
            />
          );
        })}
        {/* thin surface separators at each boundary */}
        {slices.length > 1 &&
          slices.map((s, i, arr) => {
            const start = arr.slice(0, i).reduce((sum, x) => sum + x.weight, 0);
            const angle = start * 2 * Math.PI - Math.PI / 2;
            const x1 = cx + (r - thickness / 2 - 3) * Math.cos(angle);
            const y1 = cy + (r - thickness / 2 - 3) * Math.sin(angle);
            const x2 = cx + (r + thickness / 2 + 3) * Math.cos(angle);
            const y2 = cy + (r + thickness / 2 + 3) * Math.sin(angle);
            return <line key={`sep-${s.key}`} x1={x1} y1={y1} x2={x2} y2={y2} stroke="var(--bg-surface)" strokeWidth={2} pointerEvents="none" />;
          })}
      </svg>
      {center && (
        <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none px-6 text-center">
          {center}
        </div>
      )}
    </div>
  );
}
