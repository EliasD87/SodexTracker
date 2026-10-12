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
 *   StatStrip    a row of headline figures in one card, divided by hairlines
 *
 * Colour stays quiet: neutral surfaces, with green and red only where
 * something is up/long or down/short.
 */

import { createContext, useContext } from "react";
import Link from "next/link";
import { ArrowDownRight, ArrowRight, ArrowUpRight } from "lucide-react";

/** The one card surface every view shares. */
export const CARD_STYLE = {
  background: "var(--bg-surface)",
  border: "1px solid var(--border)",
  borderRadius: "var(--card-radius)",
  boxShadow: "var(--card-shadow)",
} as const;

/** Set inside a StatStrip: figures drop their own card and become its cells. */
export const StripContext = createContext(false);

/**
 * Headline figures in one card rather than a row of separate tiles. The
 * grid's 1px gaps show the card's border colour through, so every layout
 * (two to a row on a phone, four on a desktop, two rows of four) gets its
 * dividers without counting columns. `className` sets the columns.
 */
export function StatStrip({ children, className = "grid-cols-2 lg:grid-cols-4" }: { children: React.ReactNode; className?: string }) {
  return (
    <section className={`grid gap-px overflow-hidden ${className}`} style={{ ...CARD_STYLE, background: "var(--border)" }}>
      <StripContext.Provider value={true}>{children}</StripContext.Provider>
    </section>
  );
}

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
  const inStrip = useContext(StripContext);
  return (
    <div className="flex flex-col h-full min-w-0 px-4 sm:px-5 pt-4 sm:pt-[18px] pb-4" style={inStrip ? { background: "var(--bg-surface)" } : CARD_STYLE}>
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

/**
 * What puts an account in each trader group, as the collector decides it
 * (collector/src/cohorts.mjs and config.mjs). Recomputed every 15 minutes
 * from the last two UTC days of trading; the first rule that fits wins.
 */
export const TRADER_GROUP_RULES: { key: string; label: string; rule: string }[] = [
  { key: "mm", label: "Market makers", rule: "500+ fills in 2 days, 60%+ as maker, 3+ markets, buys and sells nearly even" },
  { key: "smart", label: "Smart money", rule: "Top 100 by 30-day PnL on the SoDEX leaderboard" },
  { key: "whale", label: "Big traders", rule: "Average fill of $10K or more, over 3+ fills" },
  { key: "retail", label: "Retail", rule: "Every other account" },
  { key: "unattributed", label: "Unattributed", rule: "Volume recovered after a reconnect, without accounts" },
];

/**
 * A table's key: one small tile per group, its name over the rule that puts
 * an account in it. A row of equal tiles where the card is wide enough, two
 * to a row otherwise (an odd last one spans both). `keys` limits it to the
 * groups the table shows, in the table's order.
 */
export function GroupKey({ rules, keys, title = "How groups are set" }: { rules: { key: string; label: string; rule: string }[]; keys?: string[]; title?: string }) {
  // In the table's own order, so the key reads alongside it.
  const shown = keys ? keys.flatMap((k) => rules.filter((r) => r.key === k)) : rules;
  if (!shown.length) return null;
  return (
    <div className="@container mt-4 pt-3" style={{ borderTop: "1px solid var(--border-subtle)" }}>
      <div className="text-[10.5px] font-semibold uppercase tracking-[0.08em]" style={{ color: "var(--text-faint)" }}>
        {title}
      </div>
      <dl className="mt-2.5 grid grid-cols-2 gap-2 @2xl:[grid-template-columns:repeat(var(--n),minmax(0,1fr))]" style={{ ["--n" as string]: shown.length }}>
        {shown.map((r) => (
          <div key={r.key} className="odd:last:col-span-2 @2xl:odd:last:col-span-1 px-3 py-2.5" style={{ background: "var(--bg-elevated)", borderRadius: 10 }}>
            <dt className="text-[12px] font-semibold leading-tight" style={{ color: "var(--text)" }}>
              {r.label}
            </dt>
            <dd className="mt-1 text-[11px] leading-snug" style={{ color: "var(--text-muted)" }}>
              {r.rule}
            </dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

/** Size groups smallest first (mirrors SIZE_GROUPS in lib/positionStore), each with the equity where the next one starts. */
const SIZE_SCALE: { label: string; upTo: string | null }[] = [
  { label: "Shrimp", upTo: "$1K" },
  { label: "Fish", upTo: "$10K" },
  { label: "Dolphin", upTo: "$50K" },
  { label: "Shark", upTo: "$250K" },
  { label: "Whale", upTo: "$1M" },
  { label: "Leviathan", upTo: null },
];

/**
 * The size groups as one scale: a bar stepping from the smallest to the
 * biggest, deepening as it goes, with each threshold marked once, where one
 * group ends and the next begins.
 */
export function SizeScale({ title = "Size groups, by account equity" }: { title?: string }) {
  const n = SIZE_SCALE.length;
  return (
    <div className="mt-4 pt-3" style={{ borderTop: "1px solid var(--border-subtle)" }}>
      <div className="text-[10.5px] font-semibold uppercase tracking-[0.08em]" style={{ color: "var(--text-faint)" }}>
        {title}
      </div>
      <div className="mt-3 relative" role="img" aria-label={SIZE_SCALE.map((g, i) => `${g.label}: ${i ? `from ${SIZE_SCALE[i - 1].upTo}` : "under $1K"}`).join(", ")}>
        {/* Thresholds, each sitting on the line between two groups. */}
        <div className="relative h-4 text-[10px] mono" style={{ color: "var(--text-muted)" }} aria-hidden>
          {SIZE_SCALE.slice(0, -1).map((g, i) => (
            <span key={g.label} className="absolute -translate-x-1/2 whitespace-nowrap" style={{ left: `${((i + 1) / n) * 100}%` }}>
              {g.upTo}
            </span>
          ))}
        </div>
        <div className="mt-1 flex gap-[2px]" aria-hidden>
          {SIZE_SCALE.map((g, i) => (
            <span
              key={g.label}
              className="flex-1 h-2 first:rounded-l-full last:rounded-r-full"
              style={{ background: `color-mix(in srgb, var(--text) ${Math.round(14 + (86 * i) / (n - 1))}%, var(--bg-elevated))` }}
            />
          ))}
        </div>
        <div className="mt-2 flex" aria-hidden>
          {SIZE_SCALE.map((g) => (
            <span key={g.label} className="flex-1 min-w-0 text-center text-[10.5px] sm:text-[11px] font-medium truncate" style={{ color: "var(--text)" }}>
              {g.label}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}

/** Track-record groups by all-time PnL (mirrors RECORD_GROUPS in lib/positionStore). */
const RECORD_RULES: Record<string, string> = {
  "Top earners": "+$1M or more all time",
  "Very profitable": "+$100K to +$1M all time",
  Profitable: "+$1K to +$100K all time",
  "About even": "Within $1K all time",
  Losing: "−$1K to −$100K all time",
  "Heavy losses": "−$100K or worse all time",
};

/** The rule behind any group label the site shows: size, track record or trading behaviour. */
export function groupRule(label: string): string | undefined {
  const i = SIZE_SCALE.findIndex((g) => g.label === label);
  if (i >= 0) {
    const from = i ? SIZE_SCALE[i - 1].upTo : null;
    const to = SIZE_SCALE[i].upTo;
    return `Account equity ${from && to ? `${from}–${to}` : from ? `${from} or more` : `under ${to}`}`;
  }
  return RECORD_RULES[label] ?? TRADER_GROUP_RULES.find((r) => r.label === label)?.rule;
}
