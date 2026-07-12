"use client";

import { useMemo } from "react";
import { BarChart3 } from "lucide-react";
import { StatCardShell } from "@/components/StatCardShell";
import { TokenIcon } from "@/components/TokenIcon";
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
        <div className="flex flex-col gap-1.5">
          {topPairs.map(({ pair, volume }, i) => (
            <div key={pair} className="flex items-center gap-2">
              <span className="mono text-[9px] w-3" style={{ color: "var(--text-faint)" }}>{i + 1}</span>
              <TokenIcon symbol={pair} size={14} />
              <span className="mono text-[10px] font-medium" style={{ color: "var(--text-muted)", minWidth: 48 }}>{pair}</span>
              <span className="mono text-[10px] font-bold tabular-nums ml-auto" style={{ color: "var(--text-faint)" }}>{fmtVol(volume)}</span>
            </div>
          ))}
        </div>
      }
    />
  );
}
