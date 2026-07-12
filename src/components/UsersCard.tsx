"use client";

import { useMemo } from "react";
import { Users } from "lucide-react";
import { StatCardShell } from "@/components/StatCardShell";
import { useLandingData } from "@/components/LandingDataProvider";

type DayEntry = { day_date: string; newUsers: number; cumulativeUsers: number };

function fmtCount(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return n.toLocaleString();
}

interface Props {
  isExpanded: boolean;
  onMouseEnter: () => void;
  onMouseLeave: () => void;
}

export function UsersCard({ isExpanded, onMouseEnter, onMouseLeave }: Props) {
  const { usersRaw, loadingCards } = useLandingData();

  const { total, todayNew, recentDays, loading, error } = useMemo(() => {
    if (loadingCards && !usersRaw) return { total: null, todayNew: null, recentDays: [] as DayEntry[], loading: true, error: false };
    const data: DayEntry[] = usersRaw?.data?.data ?? [];
    if (!data.length) return { total: null, todayNew: null, recentDays: [] as DayEntry[], loading: false, error: true };
    const last = data[data.length - 1];
    return { total: last.cumulativeUsers, todayNew: last.newUsers, recentDays: data.slice(-5), loading: false, error: false };
  }, [usersRaw, loadingCards]);

  const maxNew = Math.max(...recentDays.map((d) => d.newUsers), 1);

  return (
    <StatCardShell
      label="Total Users"
      icon={Users}
      index={3}
      isExpanded={isExpanded}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
      loading={loading}
      error={error}
      value={fmtCount(total ?? 0)}
      rawValue={total ?? 0}
      format={fmtCount}
      bars={recentDays.map((d) => d.newUsers)}
      deltaLabel={todayNew !== null ? `${todayNew.toLocaleString()}` : undefined}
      deltaTone={todayNew !== null && todayNew > 0 ? "up" : "neutral"}
      expandLabel="New users — last 5 days"
      expandContent={
        <div className="flex flex-col gap-2.5">
          {recentDays.map((d) => (
            <div key={d.day_date}>
              <div className="flex items-center justify-between mb-1">
                <span className="text-[10px] mono" style={{ color: "var(--text-muted)" }}>
                  {d.day_date.slice(5)}
                </span>
                <span className="text-[10px] mono font-medium" style={{ color: "var(--color-up)" }}>
                  +{d.newUsers.toLocaleString()}
                </span>
              </div>
              <div className="h-[3px] w-full rounded-full" style={{ background: "var(--border)" }}>
                <div
                  className="h-full rounded-full"
                  style={{ width: `${(d.newUsers / maxNew) * 100}%`, background: "var(--accent)" }}
                />
              </div>
            </div>
          ))}
        </div>
      }
    />
  );
}
