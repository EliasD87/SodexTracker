"use client";

import { useMemo } from "react";
import { BarChart3 } from "lucide-react";
import { StatCardShell } from "@/components/StatCardShell";
import { useLandingData } from "@/components/LandingDataProvider";

type PairVolume = { pair: string; volume: number };

function fmtVol(n: number): string {
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 1_000) return `$${(n / 1_000).toFixed(1)}K`;
  return `$${n.toFixed(2)}`;
}

interface Props {
  isExpanded: boolean;
  onMouseEnter: () => void;
  onMouseLeave: () => void;
}

export function VolumeCard({ isExpanded, onMouseEnter, onMouseLeave }: Props) {
  const { vol24hRaw, loadingCards } = useLandingData();

  const { total, topPairs, loading, error } = useMemo(() => {
    if (loadingCards && !vol24hRaw) return { total: null, topPairs: [] as PairVolume[], loading: true, error: false };
    const day = vol24hRaw?.data?.data?.[0];
    if (!day) return { total: null, topPairs: [] as PairVolume[], loading: false, error: true };
    const t = parseFloat(day.total ?? "0");
    const sorted: PairVolume[] = Object.entries(day.markets as Record<string, string>)
      .map(([pair, vol]) => ({ pair, volume: parseFloat(vol) }))
      .sort((a, b) => b.volume - a.volume)
      .slice(0, 5);
    return { total: t, topPairs: sorted, loading: false, error: false };
  }, [vol24hRaw, loadingCards]);

  const maxVol = topPairs[0]?.volume ?? 1;

  return (
    <StatCardShell
      label="24H Volume"
      icon={BarChart3}
      index={1}
      isExpanded={isExpanded}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
      loading={loading}
      error={error}
      value={fmtVol(total ?? 0)}
      rawValue={total ?? 0}
      format={fmtVol}
      bars={topPairs.map((p) => p.volume)}
      expandLabel="Top 5 pairs"
      expandContent={
        <div className="flex flex-col gap-2.5">
          {topPairs.map(({ pair, volume }) => (
            <div key={pair}>
              <div className="flex items-center justify-between mb-1">
                <span className="text-[10px] mono font-medium" style={{ color: "var(--text)" }}>{pair}</span>
                <span className="text-[10px] mono" style={{ color: "var(--text-muted)" }}>{fmtVol(volume)}</span>
              </div>
              <div className="h-[3px] w-full rounded-full" style={{ background: "var(--border)" }}>
                <div
                  className="h-full rounded-full"
                  style={{ width: `${(volume / maxVol) * 100}%`, background: "var(--accent)" }}
                />
              </div>
            </div>
          ))}
        </div>
      }
    />
  );
}
