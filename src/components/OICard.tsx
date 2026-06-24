"use client";

import { useMemo } from "react";
import { Layers } from "lucide-react";
import { StatCardShell } from "@/components/StatCardShell";
import { TokenIcon } from "@/components/TokenIcon";
import { useLandingData } from "@/components/LandingDataProvider";

type PairOI = { pair: string; value: number };

function fmt(n: number): string {
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 1_000) return `$${(n / 1_000).toFixed(1)}K`;
  return `$${n.toFixed(2)}`;
}

interface Props {
  isExpanded: boolean;
  onMouseEnter: () => void;
  onMouseLeave: () => void;
}

export function OICard({ isExpanded, onMouseEnter, onMouseLeave }: Props) {
  const { oiRaw, loadingCards } = useLandingData();

  const { total, delta, topPairs, loading, error } = useMemo(() => {
    if (loadingCards && !oiRaw) return { total: null, delta: null, topPairs: [] as PairOI[], loading: true, error: false };
    const day = oiRaw?.data?.data?.[0];
    if (!day) return { total: null, delta: null, topPairs: [] as PairOI[], loading: false, error: true };
    const current = parseFloat(day.total ?? "0");
    const prev = parseFloat(day.last_total ?? "0");
    let d: { label: string; up: boolean } | null = null;
    if (prev) {
      const pct = ((current - prev) / prev) * 100;
      d = { label: `${Math.abs(pct).toFixed(2)}%`, up: pct >= 0 };
    }
    const sorted: PairOI[] = Object.entries(day.markets as Record<string, string>)
      .map(([pair, val]) => ({ pair, value: parseFloat(val) }))
      .filter((p) => p.value > 0)
      .sort((a, b) => b.value - a.value)
      .slice(0, 5);
    return { total: current, delta: d, topPairs: sorted, loading: false, error: false };
  }, [oiRaw, loadingCards]);

  return (
    <StatCardShell
      label="Open Interest"
      icon={Layers}
      index={2}
      isExpanded={isExpanded}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
      loading={loading}
      error={error}
      value={fmt(total ?? 0)}
      rawValue={total ?? 0}
      format={fmt}
      deltaLabel={delta?.label}
      deltaTone={delta ? (delta.up ? "up" : "down") : "neutral"}
      expandLabel="Top 5 by OI"
      expandContent={
        <div className="flex flex-col gap-1.5">
          {topPairs.map(({ pair, value }, i) => (
            <div key={pair} className="flex items-center gap-2">
              <span className="mono text-[9px] w-3" style={{ color: "var(--text-faint)" }}>{i + 1}</span>
              <TokenIcon symbol={pair} size={14} />
              <span className="mono text-[10px] font-medium" style={{ color: "var(--text-muted)", minWidth: 48 }}>{pair}</span>
              <span className="mono text-[10px] font-bold tabular-nums ml-auto" style={{ color: "var(--text-faint)" }}>{fmt(value)}</span>
            </div>
          ))}
        </div>
      }
    />
  );
}
