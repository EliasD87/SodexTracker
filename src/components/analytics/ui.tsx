"use client";

import { useState } from "react";
import { ArrowDown, ArrowUp, ChevronDown, Radio } from "lucide-react";
import type { Tier } from "@/lib/exchangeAnalytics";
import { signedPct } from "@/lib/analyticsFormat";
import { CARD_STYLE } from "@/components/analytics/kit";
import { useCompact } from "@/components/analytics/hooks";

/** Building blocks shared by every analytics tab. */

export const TIER_LABEL: Record<Tier, string> = { active: "Active", niche: "Niche", thin: "Thin" };
export const TIER_RULE: Record<Tier, string> = {
  active: "50+ traders a day",
  niche: "7–49 traders a day",
  thin: "6 or fewer a day",
};
export const TIER_COLOR: Record<Tier, string> = {
  active: "var(--tier-active)",
  niche: "var(--tier-niche)",
  thin: "var(--tier-thin)",
};

export function Card({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={`min-w-0 ${className}`} style={CARD_STYLE}>
      {children}
    </div>
  );
}

/** Signed change with an arrow; green up, red down, with words for screen readers. */
export function DeltaLine({ value, label }: { value: number | null; label: string }) {
  if (value == null || !Number.isFinite(value)) return <span style={{ color: "var(--text-faint)" }}>{label}</span>;
  const up = value >= 0;
  return (
    <span className="inline-flex items-center gap-1" style={{ color: up ? "var(--green)" : "var(--red)" }}>
      {up ? <ArrowUp size={11} aria-hidden /> : <ArrowDown size={11} aria-hidden />}
      <span className="sr-only">{up ? "up" : "down"}</span>
      {Math.abs(value) >= 9 ? `${Math.round(1 + value)}×` : signedPct(value, Math.abs(value) >= 10 ? 0 : 1)}
      <span style={{ color: "var(--text-faint)" }}>{label}</span>
    </span>
  );
}

export function Tile({
  label,
  value,
  sub,
  delta,
  valueColor = "var(--text)",
}: {
  label: string;
  value: string;
  sub?: React.ReactNode;
  delta?: React.ReactNode;
  /** For signed headline figures: green or red. */
  valueColor?: string;
}) {
  return (
    <Card className="px-4 sm:px-5 pt-4 sm:pt-[18px] pb-4 flex flex-col gap-2">
      <span className="text-[13px] font-medium" style={{ color: "var(--text-muted)" }}>
        {label}
      </span>
      <span className="text-[24px] sm:text-[26px] font-semibold leading-none tabular-nums" style={{ color: valueColor, letterSpacing: "-0.025em" }}>
        {value}
      </span>
      {delta && <span className="text-[11.5px] mono">{delta}</span>}
      {sub && (
        <span className="text-[11.5px] leading-snug" style={{ color: "var(--text-faint)" }}>
          {sub}
        </span>
      )}
    </Card>
  );
}

export function Section({ title, kicker, children }: { title: string; kicker?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="mt-9 sm:mt-12 first:mt-6 sm:first:mt-8">
      <h2 className="text-[19px] sm:text-[22px] font-bold tracking-tight" style={{ color: "var(--text)", letterSpacing: "-0.01em" }}>
        {title}
      </h2>
      {kicker && (
        <p className="text-[13px] mt-1.5 max-w-2xl" style={{ color: "var(--text-muted)" }}>
          {kicker}
        </p>
      )}
      <div className="mt-5">{children}</div>
    </section>
  );
}

export function ChartCard({
  title,
  figure,
  note,
  children,
}: {
  title: string;
  figure: string;
  note?: string;
  children: React.ReactNode;
}) {
  return (
    <Card className="px-4 sm:px-5 pt-4 sm:pt-[18px] pb-4">
      <div className="flex items-baseline justify-between gap-3 mb-3">
        <span className="text-[14px] font-medium" style={{ color: "var(--text)" }}>
          {title}
        </span>
        <span className="mono text-[12px]" style={{ color: "var(--text-muted)" }}>
          {figure}
        </span>
      </div>
      {children}
      {note && (
        <p className="text-[11px] mt-1" style={{ color: "var(--text-faint)" }}>
          {note}
        </p>
      )}
    </Card>
  );
}

/** What a view shows when its data isn't there yet: what it is, and why it's empty. */
export function NoData({ title, reason }: { title: string; reason: string }) {
  return (
    <Card className="p-4 sm:p-5">
      <div className="flex items-center gap-2">
        <Radio size={14} style={{ color: "var(--text-muted)" }} aria-hidden />
        <span className="text-[13.5px] font-semibold" style={{ color: "var(--text)" }}>
          {title}
        </span>
      </div>
      <p className="text-[12.5px] mt-2" style={{ color: "var(--text-muted)" }}>
        {reason}
      </p>
    </Card>
  );
}

/** Tier as a soft-coloured dot beside plain grey text. */
export function TierBadge({ tier }: { tier: Tier }) {
  return (
    <span title={TIER_RULE[tier]} className="inline-flex items-center gap-1.5 text-[11px] font-sans whitespace-nowrap" style={{ color: "var(--text-muted)" }}>
      <span className="w-1.5 h-1.5 rounded-full" style={{ background: TIER_COLOR[tier] }} aria-hidden />
      {TIER_LABEL[tier]}
    </span>
  );
}

/** Perp or spot, as a quiet outlined tag. */
export function KindBadge({ kind }: { kind: "perp" | "spot" }) {
  return (
    <span
      title={kind === "perp" ? "Perpetual future" : "Spot market"}
      className="inline-flex items-center px-1 py-[2px] rounded-[4px] text-[9.5px] font-medium leading-none tracking-wide font-sans"
      style={{ color: "var(--text-faint)", border: "1px solid var(--border)" }}
    >
      {kind === "perp" ? "PERP" : "SPOT"}
    </span>
  );
}

/** A page's loading frame: the shapes of what's coming, no flashing on refetch. */
export function TileSkeleton({ count = 8 }: { count?: number }) {
  return (
    <div className="mt-6 grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4" aria-busy="true">
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="h-[120px] animate-pulse" style={{ background: "var(--bg-elevated)", borderRadius: "var(--card-radius)" }} />
      ))}
    </div>
  );
}

/** The dashboard's loading frame: the grid's shape, so nothing jumps when it fills. */
export function GridSkeleton() {
  const block = (h: number, span = "") => (
    <div className={`animate-pulse ${span}`} style={{ height: h, background: "var(--bg-elevated)", borderRadius: "var(--card-radius)" }} />
  );
  return (
    <div className="mt-4 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-12 gap-3 sm:gap-4" aria-busy="true">
      {block(300, "lg:col-span-4")}
      {block(300, "lg:col-span-4")}
      {block(300, "md:col-span-2 lg:col-span-4")}
      {block(340, "md:col-span-2 lg:col-span-8")}
      {block(340, "md:col-span-2 lg:col-span-4")}
    </div>
  );
}

/**
 * A long list, shown short. The first `initial` rows (or `onPhone` on a
 * phone), then one quiet bar to open the rest, so a 130-row table never
 * pushes the page miles down.
 */
export function useRowLimit<T>(rows: T[], initial: number, onPhone?: number) {
  const [open, setOpen] = useState(false);
  const compact = useCompact();
  const limit = compact && onPhone != null ? Math.min(onPhone, initial) : initial;
  const shown = open ? rows : rows.slice(0, limit);
  const more = rows.length > limit;
  const toggle = more ? (
    <button
      onClick={() => setOpen((o) => !o)}
      aria-expanded={open}
      className="w-full flex items-center justify-center gap-1.5 py-2.5 text-[12px] font-medium transition-colors hover:bg-[var(--bg-elevated)]"
      style={{ borderTop: "1px solid var(--border-subtle)", color: "var(--text-muted)" }}
    >
      {open ? "Show less" : `Show all ${rows.length}`}
      <ChevronDown size={13} style={{ transform: open ? "rotate(180deg)" : undefined, transition: "transform 0.15s" }} aria-hidden />
    </button>
  ) : null;
  return { shown, toggle };
}
