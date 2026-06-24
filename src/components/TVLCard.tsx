"use client";

import { useMemo } from "react";
import { Landmark } from "lucide-react";
import { StatCardShell } from "@/components/StatCardShell";
import { useLandingData } from "@/components/LandingDataProvider";

type TVLEntry = { date: number; tvl: number };

function fmt(n: number): string {
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 1_000) return `$${(n / 1_000).toFixed(1)}K`;
  return `$${n.toFixed(2)}`;
}

function fmtDate(unix: number): string {
  const d = new Date(unix * 1000);
  return `${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`;
}

interface Props {
  isExpanded: boolean;
  onMouseEnter: () => void;
  onMouseLeave: () => void;
}

export function TVLCard({ isExpanded, onMouseEnter, onMouseLeave }: Props) {
  const { tvlRaw, loadingCards } = useLandingData();

  const { current, delta, recentDays, loading, error } = useMemo(() => {
    if (loadingCards && !tvlRaw) return { current: null, delta: null, recentDays: [] as TVLEntry[], loading: true, error: false };
    const data: TVLEntry[] = tvlRaw?.data ?? [];
    if (!data.length) return { current: null, delta: null, recentDays: [] as TVLEntry[], loading: false, error: true };
    const last = data[data.length - 1];
    const prev = data[data.length - 2];
    let d: { label: string; up: boolean } | null = null;
    if (prev) {
      const pct = ((last.tvl - prev.tvl) / prev.tvl) * 100;
      d = { label: `${Math.abs(pct).toFixed(2)}%`, up: pct >= 0 };
    }
    return { current: last.tvl, delta: d, recentDays: data.slice(-5), loading: false, error: false };
  }, [tvlRaw, loadingCards]);

  const maxTvl = Math.max(...recentDays.map((d) => d.tvl), 1);
  const minTvl = Math.min(...recentDays.map((d) => d.tvl), 0);
  const range = maxTvl - minTvl || 1;

  return (
    <StatCardShell
      label="TVL"
      icon={Landmark}
      index={4}
      isExpanded={isExpanded}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
      loading={loading}
      error={error}
      value={fmt(current ?? 0)}
      rawValue={current ?? 0}
      format={fmt}
      bars={recentDays.map((d) => d.tvl)}
      deltaLabel={delta?.label}
      deltaTone={delta ? (delta.up ? "up" : "down") : "neutral"}
      expandLabel="TVL — last 5 days"
      expandContent={
        <div className="flex flex-col gap-2.5">
          {recentDays.map((d, i) => {
            const isUp = i === 0 || d.tvl >= recentDays[i - 1].tvl;
            const barWidth = Math.max(((d.tvl - minTvl) / range) * 100, 6);
            return (
              <div key={d.date}>
                <div className="flex items-center justify-between mb-1">
                  <span className="text-[10px] mono" style={{ color: "var(--text-muted)" }}>{fmtDate(d.date)}</span>
                  <span
                    className="text-[10px] mono font-medium"
                    style={{ color: isUp ? "var(--color-up)" : "var(--color-down)" }}
                  >
                    {fmt(d.tvl)}
                  </span>
                </div>
                <div className="h-[3px] w-full rounded-full" style={{ background: "var(--border)" }}>
                  <div
                    className="h-full rounded-full"
                    style={{ width: `${barWidth}%`, background: isUp ? "var(--color-up)" : "var(--color-down)" }}
                  />
                </div>
              </div>
            );
          })}
        </div>
      }
    />
  );
}
