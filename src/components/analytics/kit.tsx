"use client";

/**
 * The dashboard kit: the building blocks for the deeper tools.
 *
 *   Panel        a card with a title, an optional control slot and a live dot
 *   Kpi          label, big figure with a change pill, optional mini bars
 *   DetailsLink  the outlined button in a card's corner
 *   DeltaPill    a change as a tinted pill
 *   PillTabs     a segmented switch
 *   SegmentMeter a row of ticks filled to a share
 *   SplitBar     one bar split into parts, with a legend
 *   BiasTag      a long/short lean as a word and an arrow
 *
 * Colour stays quiet: neutral surfaces, with green and red only where
 * something is up/long or down/short.
 */

import Link from "next/link";
import { ArrowDownRight, ArrowRight, ArrowUpRight } from "lucide-react";

/** The one card surface every view shares. */
export const CARD_STYLE = {
  background: "var(--bg-surface)",
  border: "1px solid var(--border)",
  borderRadius: "var(--card-radius)",
  boxShadow: "var(--card-shadow)",
} as const;

/** A quiet outlined button in a card's corner, leading to the full view. */
export function DetailsLink({ href, children = "Details" }: { href: string; children?: React.ReactNode }) {
  return (
    <Link
      href={href}
      scroll={false}
      className="inline-flex items-center gap-1 h-7 px-3 rounded-[9px] text-[12px] font-medium whitespace-nowrap transition-colors hover:bg-[var(--bg-elevated)]"
      style={{ border: "1px solid var(--border)", color: "var(--text)" }}
    >
      {children}
    </Link>
  );
}

/** A change as a small tinted pill: +2.1%, or ×3 for big jumps. */
export function DeltaPill({ value, good = "up", title }: { value: number | null | undefined; good?: "up" | "down"; title?: string }) {
  if (value == null || !Number.isFinite(value)) return null;
  const color = (value >= 0) === (good === "up") ? "var(--green)" : "var(--red)";
  const text =
    value >= 9 ? `${Math.round(1 + value)}×` : `${value >= 0 ? "+" : "−"}${Math.abs(value * 100).toFixed(Math.abs(value) >= 1 ? 0 : 1)}%`;
  return (
    <span
      title={title}
      className="inline-flex items-center px-1.5 py-[2px] rounded-[6px] text-[11px] font-semibold mono leading-none whitespace-nowrap"
      style={{ color, background: `color-mix(in srgb, ${color} 13%, transparent)` }}
    >
      {text}
    </span>
  );
}

/** A small green dot that marks a figure as live from our own collector. */
export function LiveDot({ on = true }: { on?: boolean }) {
  const c = on ? "var(--green)" : "var(--text-faint)";
  return (
    <span
      className="inline-block w-1.5 h-1.5 rounded-full shrink-0"
      style={{ background: c, boxShadow: `0 0 0 3px color-mix(in srgb, ${c} 22%, transparent)` }}
      aria-label={on ? "live" : "paused"}
    />
  );
}

/** A card's headline number. */
export function Figure({ children, color = "var(--text)", size = "lg" }: { children: React.ReactNode; color?: string; size?: "lg" | "md" }) {
  return (
    <span
      className={`font-semibold leading-none tabular-nums ${size === "lg" ? "text-[28px] sm:text-[30px]" : "text-[22px]"}`}
      style={{ color, letterSpacing: "-0.025em" }}
    >
      {children}
    </span>
  );
}

export function Panel({
  title,
  right,
  children,
  className = "",
  pad = true,
  live = false,
  sub,
}: {
  title: string;
  right?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
  pad?: boolean;
  /** Marks the card as fed live by our collector. */
  live?: boolean;
  /** One quiet line under the title. */
  sub?: React.ReactNode;
}) {
  return (
    <section className={`flex flex-col overflow-hidden min-w-0 ${className}`} style={CARD_STYLE}>
      <header className="flex flex-wrap items-start justify-between gap-x-3 gap-y-2.5 px-4 sm:px-5 pt-4 sm:pt-[18px] pb-3">
        <div className="min-w-0">
          <h3 className="flex items-center gap-2 text-[14px] font-medium" style={{ color: "var(--text)" }}>
            {title}
            {live && <LiveDot />}
          </h3>
          {sub && (
            <p className="text-[12px] mt-0.5" style={{ color: "var(--text-faint)" }}>
              {sub}
            </p>
          )}
        </div>
        {right && <div className="max-w-full min-w-0">{right}</div>}
      </header>
      <div className={`flex-1 min-w-0 ${pad ? "px-4 sm:px-5 pb-4 sm:pb-5" : ""}`}>{children}</div>
    </section>
  );
}

export function Kpi({
  label,
  value,
  caption,
  delta,
  bars,
  href,
  children,
}: {
  label: string;
  value: string;
  caption?: React.ReactNode;
  delta?: { value: number | null; good?: "up" | "down" };
  /** A few recent values, drawn as thin bars beside the figure. */
  bars?: number[];
  /** Where "Details" leads. */
  href?: string;
  children?: React.ReactNode;
}) {
  const max = bars?.length ? Math.max(...bars, 1e-9) : 1;
  return (
    <div className="flex flex-col h-full min-w-0 px-4 sm:px-5 pt-4 sm:pt-[18px] pb-4" style={CARD_STYLE}>
      <div className="flex items-start justify-between gap-3">
        <span className="text-[13px] font-medium" style={{ color: "var(--text-muted)" }}>
          {label}
        </span>
        {href && <DetailsLink href={href} />}
      </div>
      <div className="mt-3 flex items-end justify-between gap-3">
        <span className="flex items-center gap-2 min-w-0 flex-wrap">
          <Figure>{value}</Figure>
          {delta && <DeltaPill value={delta.value} good={delta.good} />}
        </span>
        {bars && bars.length > 1 && (
          <span className="flex items-end gap-[3px] h-9 shrink-0" aria-hidden>
            {bars.map((v, i) => (
              <span
                key={i}
                className="w-[3px] rounded-full"
                style={{ height: `${Math.max(12, (v / max) * 100)}%`, background: i === bars.length - 1 ? "var(--text)" : "var(--border)" }}
              />
            ))}
          </span>
        )}
      </div>
      {children && <div className="pt-3 flex-1">{children}</div>}
      {caption && (
        <div className="mt-3 text-[12px] truncate" style={{ color: "var(--text-faint)" }}>
          {caption}
        </div>
      )}
    </div>
  );
}

export function PillTabs<T extends string>({
  options,
  value,
  onChange,
  label,
}: {
  options: { value: T; label: string }[];
  value: T;
  onChange: (v: T) => void;
  label: string;
}) {
  return (
    <div className="scroll-row inline-flex flex-nowrap max-w-full p-[3px] rounded-[10px]" role="group" aria-label={label} style={{ background: "var(--bg-elevated)" }}>
      {options.map((o) => (
        <button
          key={o.value}
          aria-pressed={value === o.value}
          onClick={() => onChange(o.value)}
          className="shrink-0 px-2.5 py-1 rounded-[7px] text-[12px] font-medium whitespace-nowrap transition-colors"
          style={{
            background: value === o.value ? "var(--bg-surface)" : "transparent",
            color: value === o.value ? "var(--text)" : "var(--text-muted)",
            boxShadow: value === o.value ? "0 1px 2px rgba(0,0,0,0.08)" : "none",
          }}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

/** A row of ticks, the first `share` of them filled. */
export function SegmentMeter({ share, segments = 32, color = "var(--text)" }: { share: number; segments?: number; color?: string }) {
  const filled = Math.round(Math.max(0, Math.min(1, share)) * segments);
  return (
    <span className="flex gap-[3px] h-6" aria-hidden>
      {Array.from({ length: segments }, (_, i) => (
        <span key={i} className="flex-1 rounded-[2px]" style={{ background: i < filled ? color : "var(--border)" }} />
      ))}
    </span>
  );
}

export function SplitBar({
  parts,
  legend = true,
  height = 8,
}: {
  parts: { label: string; value: number; color: string; note?: string }[];
  legend?: boolean;
  height?: number;
}) {
  const total = parts.reduce((a, p) => a + Math.max(0, p.value), 0) || 1;
  return (
    <div>
      <span className="flex gap-[3px] w-full" style={{ height }} aria-hidden>
        {parts.map((p) =>
          p.value > 0 ? <span key={p.label} className="rounded-full" style={{ width: `${(p.value / total) * 100}%`, background: p.color }} /> : null,
        )}
      </span>
      {legend && (
        <span className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[11.5px]" style={{ color: "var(--text-muted)" }}>
          {parts.map((p) => (
            <span key={p.label} className="inline-flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full" style={{ background: p.color }} />
              {p.label}
              {p.note && <span className="mono" style={{ color: "var(--text-faint)" }}>{p.note}</span>}
            </span>
          ))}
        </span>
      )}
    </div>
  );
}

export const BIAS_LEVELS: [number, string][] = [
  [0.5, "Very bullish"],
  [0.2, "Bullish"],
  [0.05, "Slightly bullish"],
  [-0.05, "Neutral"],
  [-0.2, "Slightly bearish"],
  [-0.5, "Bearish"],
  [-Infinity, "Very bearish"],
];
export const biasLabel = (b: number) => BIAS_LEVELS.find(([min]) => b >= min)![1];

export function BiasTag({ bias }: { bias: number | null }) {
  if (bias == null) return <span className="text-[11.5px]" style={{ color: "var(--text-faint)" }}>No positions</span>;
  const label = biasLabel(bias);
  const color = bias >= 0.05 ? "var(--green)" : bias <= -0.05 ? "var(--red)" : "var(--text-muted)";
  const Icon = bias >= 0.05 ? ArrowUpRight : bias <= -0.05 ? ArrowDownRight : ArrowRight;
  return (
    <span
      className="inline-flex items-center gap-1 px-2 py-[3px] rounded-full text-[11px] font-semibold whitespace-nowrap"
      style={{ color, background: `color-mix(in srgb, ${color} 10%, transparent)` }}
      title={`Bias ${bias >= 0 ? "+" : ""}${bias.toFixed(2)}: long minus short, over both`}
    >
      <Icon size={12} aria-hidden />
      {label}
    </span>
  );
}
