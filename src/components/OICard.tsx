"use client";

import { useMemo } from "react";
import { Layers } from "lucide-react";
import { StatCardShell } from "@/components/StatCardShell";
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

  const maxVal = topPairs[0]?.value ?? 1;

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
      bars={topPairs.map((p) => p.value)}
      deltaLabel={delta?.label}
      deltaTone={delta ? (delta.up ? "up" : "down") : "neutral"}
      expandLabel="Top 5 by OI"
      expandContent={
        <div className="flex flex-col gap-2.5">
          {topPairs.map(({ pair, value }) => (
            <div key={pair}>
              <div className="flex items-center justify-between mb-1">
                <span className="text-[10px] mono font-medium" style={{ color: "var(--text)" }}>{pair}</span>
                <span className="text-[10px] mono" style={{ color: "var(--text-muted)" }}>{fmt(value)}</span>
              </div>
              <div className="h-[3px] w-full rounded-full" style={{ background: "var(--border)" }}>
                <div
                  className="h-full rounded-full"
                  style={{ width: `${(value / maxVal) * 100}%`, background: "var(--accent)" }}
                />
              </div>
            </div>
          ))}
        </div>
      }
    />
  );
}
