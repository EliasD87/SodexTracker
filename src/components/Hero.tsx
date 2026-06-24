"use client";

import { Search, ArrowRight, BarChart3, Layers, Users, Landmark } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useRef, useState, useMemo } from "react";
import { VolumeCard } from "@/components/VolumeCard";
import { OICard } from "@/components/OICard";
import { UsersCard } from "@/components/UsersCard";
import { TVLCard } from "@/components/TVLCard";
import { FlipWords } from "@/components/FlipWords";
import { useLandingData } from "@/components/LandingDataProvider";

type CardId = "volume" | "oi" | "users" | "tvl" | null;

type StatKey = "volume" | "oi" | "users" | "tvl";

function fmtVol(n: number): string {
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 1_000) return `$${(n / 1_000).toFixed(1)}K`;
  return `$${n.toFixed(2)}`;
}

function fmtCount(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return n.toLocaleString();
}

function MobileStatsGrid() {
  const { vol24hRaw, oiRaw, usersRaw, tvlRaw, loadingCards } = useLandingData();
  const [expanded, setExpanded] = useState<StatKey | null>(null);

  const data = useMemo(() => {
    const volDay = vol24hRaw?.data?.data?.[0];
    const vol = volDay ? parseFloat(volDay.total ?? "0") : null;
    const volPairs: { pair: string; volume: number }[] = volDay
      ? Object.entries(volDay.markets as Record<string, string>)
          .map(([pair, v]) => ({ pair, volume: parseFloat(v) }))
          .sort((a, b) => b.volume - a.volume)
          .slice(0, 5)
      : [];

    const oiDay = oiRaw?.data?.data?.[0];
    const oi = oiDay ? parseFloat(oiDay.total ?? "0") : null;
    const oiPairs: { pair: string; value: number }[] = oiDay
      ? Object.entries(oiDay.markets as Record<string, string>)
          .map(([pair, v]) => ({ pair, value: parseFloat(v) }))
          .filter((p) => p.value > 0)
          .sort((a, b) => b.value - a.value)
          .slice(0, 5)
      : [];

    const usersData = usersRaw?.data?.data ?? [];
    const users = usersData.length ? usersData[usersData.length - 1].cumulativeUsers : null;
    const usersRecent = usersData.slice(-5);

    const tvlData = tvlRaw?.data ?? [];
    const tvl = tvlData.length ? tvlData[tvlData.length - 1].tvl : null;
    const tvlRecent = tvlData.slice(-5);

    return { vol, volPairs, oi, oiPairs, users, usersRecent, tvl, tvlRecent };
  }, [vol24hRaw, oiRaw, usersRaw, tvlRaw]);

  const stats: { key: StatKey; label: string; icon: typeof BarChart3; value: string | null }[] = [
    { key: "volume", label: "24H VOL", icon: BarChart3, value: data.vol != null ? fmtVol(data.vol) : null },
    { key: "oi", label: "OPEN INT", icon: Layers, value: data.oi != null ? fmtVol(data.oi) : null },
    { key: "users", label: "USERS", icon: Users, value: data.users != null ? fmtCount(data.users) : null },
    { key: "tvl", label: "TVL", icon: Landmark, value: data.tvl != null ? fmtVol(data.tvl) : null },
  ];

  function renderExpansion() {
    if (!expanded) return null;

    if (expanded === "volume") {
      const max = data.volPairs[0]?.volume ?? 1;
      return (
        <div className="flex flex-col gap-2.5">
          <div className="tag text-[9px] mb-1" style={{ color: "var(--text-faint)" }}>TOP 5 PAIRS</div>
          {data.volPairs.map(({ pair, volume }) => (
            <div key={pair}>
              <div className="flex items-center justify-between mb-1">
                <span className="text-[10px] mono font-medium" style={{ color: "var(--text)" }}>{pair}</span>
                <span className="text-[10px] mono" style={{ color: "var(--text-muted)" }}>{fmtVol(volume)}</span>
              </div>
              <div className="h-[3px] w-full rounded-full" style={{ background: "var(--border)" }}>
                <div className="h-full rounded-full" style={{ width: `${(volume / max) * 100}%`, background: "var(--accent)" }} />
              </div>
            </div>
          ))}
        </div>
      );
    }

    if (expanded === "oi") {
      const max = data.oiPairs[0]?.value ?? 1;
      return (
        <div className="flex flex-col gap-2.5">
          <div className="tag text-[9px] mb-1" style={{ color: "var(--text-faint)" }}>TOP 5 BY OI</div>
          {data.oiPairs.map(({ pair, value }) => (
            <div key={pair}>
              <div className="flex items-center justify-between mb-1">
                <span className="text-[10px] mono font-medium" style={{ color: "var(--text)" }}>{pair}</span>
                <span className="text-[10px] mono" style={{ color: "var(--text-muted)" }}>{fmtVol(value)}</span>
              </div>
              <div className="h-[3px] w-full rounded-full" style={{ background: "var(--border)" }}>
                <div className="h-full rounded-full" style={{ width: `${(value / max) * 100}%`, background: "var(--accent)" }} />
              </div>
            </div>
          ))}
        </div>
      );
    }

    if (expanded === "users") {
      const maxNew = Math.max(...data.usersRecent.map((d: { newUsers: number }) => d.newUsers), 1);
      return (
        <div className="flex flex-col gap-2.5">
          <div className="tag text-[9px] mb-1" style={{ color: "var(--text-faint)" }}>NEW USERS — LAST 5 DAYS</div>
          {data.usersRecent.map((d: { day_date: string; newUsers: number }) => (
            <div key={d.day_date}>
              <div className="flex items-center justify-between mb-1">
                <span className="text-[10px] mono" style={{ color: "var(--text-muted)" }}>{d.day_date.slice(5)}</span>
                <span className="text-[10px] mono font-medium" style={{ color: "var(--color-up)" }}>+{d.newUsers.toLocaleString()}</span>
              </div>
              <div className="h-[3px] w-full rounded-full" style={{ background: "var(--border)" }}>
                <div className="h-full rounded-full" style={{ width: `${(d.newUsers / maxNew) * 100}%`, background: "var(--accent)" }} />
              </div>
            </div>
          ))}
        </div>
      );
    }

    if (expanded === "tvl") {
      const maxTvl = Math.max(...data.tvlRecent.map((d: { tvl: number }) => d.tvl), 1);
      return (
        <div className="flex flex-col gap-2.5">
          <div className="tag text-[9px] mb-1" style={{ color: "var(--text-faint)" }}>TVL — LAST 5 DAYS</div>
          {data.tvlRecent.map((d: { date: number; tvl: number }, i: number) => {
            const isUp = i === 0 || d.tvl >= data.tvlRecent[i - 1].tvl;
            return (
              <div key={d.date}>
                <div className="flex items-center justify-between mb-1">
                  <span className="text-[10px] mono" style={{ color: "var(--text-muted)" }}>
                    {String(new Date(d.date * 1000).getUTCMonth() + 1).padStart(2, "0")}-{String(new Date(d.date * 1000).getUTCDate()).padStart(2, "0")}
                  </span>
                  <span className="text-[10px] mono font-medium" style={{ color: isUp ? "var(--color-up)" : "var(--color-down)" }}>{fmtVol(d.tvl)}</span>
                </div>
                <div className="h-[3px] w-full rounded-full" style={{ background: "var(--border)" }}>
                  <div className="h-full rounded-full" style={{ width: `${(d.tvl / maxTvl) * 100}%`, background: isUp ? "var(--color-up)" : "var(--color-down)" }} />
                </div>
              </div>
            );
          })}
        </div>
      );
    }

    return null;
  }

  return (
    <div className="mt-5 lg:hidden">
      <div className="grid grid-cols-2 gap-2">
        {stats.map((s) => {
          const isActive = expanded === s.key;
          return (
            <button
              key={s.key}
              onClick={() => setExpanded(isActive ? null : s.key)}
              className="flex items-center gap-2.5 px-3 py-2.5 transition-colors text-left"
              style={{
                border: `1px solid ${isActive ? "var(--accent)" : "var(--border)"}`,
                background: isActive ? "var(--accent-dim)" : "var(--bg-surface)",
              }}
            >
              <span
                className="flex items-center justify-center shrink-0"
                style={{
                  width: 26, height: 26, borderRadius: 6,
                  background: isActive ? "var(--accent-dim)" : "var(--bg-elevated)",
                  color: isActive ? "var(--accent)" : "var(--text-muted)",
                }}
              >
                <s.icon size={13} strokeWidth={2} />
              </span>
              <div className="min-w-0">
                <div className="tag text-[8px]" style={{ color: "var(--text-faint)", letterSpacing: "0.08em" }}>{s.label}</div>
                <div className="mono text-sm font-bold tabular-nums" style={{ color: "var(--text)" }}>
                  {loadingCards && s.value === null ? "—" : s.value ?? "—"}
                </div>
              </div>
            </button>
          );
        })}
      </div>

      {/* Expansion panel */}
      {expanded && (
        <div
          className="mt-2 p-3.5"
          style={{ border: "1px solid var(--border)", background: "var(--bg-surface)" }}
        >
          {renderExpansion()}
        </div>
      )}
    </div>
  );
}

export function Hero() {
  const [query, setQuery] = useState("");
  const [focused, setFocused] = useState(false);
  const [hoveredCard, setHoveredCard] = useState<CardId>(null);
  const sectionRef = useRef<HTMLElement>(null);
  const router = useRouter();

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (!query.trim()) return;
    router.push(`/tracker?address=${encodeURIComponent(query.trim())}`);
  };

  return (
    <section
      ref={sectionRef}
      className="relative min-h-[80vh] sm:min-h-screen flex flex-col justify-center pt-20 sm:pt-[112px] pb-12 sm:pb-20"
    >
      <div className="relative max-w-[1200px] mx-auto px-5 sm:px-8 w-full">
        <div className="grid lg:grid-cols-[1fr_280px] gap-8 lg:gap-20 items-center">
          {/* left column */}
          <div className="min-w-0">
            {/* Headline */}
            <h1
              className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[2rem] sm:text-5xl lg:text-[3.4rem] font-semibold leading-[1.1] mb-4 sm:mb-5 fade-up fade-up-1"
              style={{ color: "var(--text)", letterSpacing: "-0.03em" }}
            >
              <span className="sm:hidden w-full">Track</span>
              <span className="hidden sm:inline">Track</span>
              <FlipWords /> <span style={{ color: "var(--text-muted)" }}>in real time.</span>
            </h1>

            <p
              className="text-[13.5px] sm:text-base leading-relaxed mb-6 sm:mb-8 max-w-[460px] fade-up fade-up-2"
              style={{ color: "var(--text-muted)" }}
            >
              Live analytics for address performance, trading volume, top pairs,
              leaderboards, and tournament progress — every block.
            </p>

            {/* search */}
            <form onSubmit={handleSearch} className="fade-up fade-up-3 max-w-[520px]">
              <div
                className="relative flex items-center mb-5"
                style={{
                  border: `1px solid ${focused ? "var(--accent)" : "var(--border)"}`,
                  background: "var(--bg-surface)",
                  borderRadius: "var(--r-md)",
                  boxShadow: focused ? "0 0 0 3px var(--accent-dim)" : "none",
                  transition: "border-color 0.15s, box-shadow 0.15s",
                }}
              >
                <Search size={16} className="ml-4 shrink-0" style={{ color: focused ? "var(--accent)" : "var(--text-faint)" }} />
                <input
                  type="text"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  onFocus={() => setFocused(true)}
                  onBlur={() => setFocused(false)}
                  placeholder="Enter wallet address…"
                  className="flex-1 bg-transparent px-3 py-3.5 text-sm outline-none mono placeholder:font-sans placeholder:text-sm min-w-0"
                  style={{ color: "var(--text)", caretColor: "var(--accent)" }}
                />
                <button
                  type="submit"
                  className="hidden sm:flex items-center gap-2 px-4 py-2 mr-1.5 text-sm font-semibold transition-opacity hover:opacity-90 shrink-0"
                  style={{ background: "var(--accent)", color: "var(--accent-fg)", borderRadius: "var(--r-sm)" }}
                >
                  Search <ArrowRight size={13} />
                </button>
              </div>

              {/* primary actions */}
              <div className="flex flex-wrap items-center gap-3">
                <Link
                  href="/tracker"
                  className="inline-flex items-center gap-2 px-4 sm:px-5 py-2.5 sm:py-3 text-sm font-semibold transition-opacity hover:opacity-90"
                  style={{ background: "var(--accent)", color: "var(--accent-fg)", borderRadius: "var(--r-md)" }}
                >
                  Get started <ArrowRight size={15} />
                </Link>
                <Link
                  href="/leaderboard"
                  className="inline-flex items-center gap-2 px-4 sm:px-5 py-2.5 sm:py-3 text-sm font-semibold transition-colors"
                  style={{ color: "var(--text)", border: "1px solid var(--border)", borderRadius: "var(--r-md)" }}
                  onMouseEnter={(e) => (e.currentTarget.style.borderColor = "var(--text-faint)")}
                  onMouseLeave={(e) => (e.currentTarget.style.borderColor = "var(--border)")}
                >
                  View leaderboard
                </Link>
              </div>
            </form>

            <MobileStatsGrid />
          </div>

          {/* right column — live stat panel */}
          <div className="hidden lg:flex flex-col gap-5 fade-up fade-up-4">
            <span className="text-[11px] font-medium mb-1 px-0.5" style={{ color: "var(--text-faint)" }}>
              Network · 24H
            </span>
            <VolumeCard
              isExpanded={hoveredCard === "volume"}
              onMouseEnter={() => setHoveredCard("volume")}
              onMouseLeave={() => setHoveredCard(null)}
            />
            <OICard
              isExpanded={hoveredCard === "oi"}
              onMouseEnter={() => setHoveredCard("oi")}
              onMouseLeave={() => setHoveredCard(null)}
            />
            <UsersCard
              isExpanded={hoveredCard === "users"}
              onMouseEnter={() => setHoveredCard("users")}
              onMouseLeave={() => setHoveredCard(null)}
            />
            <TVLCard
              isExpanded={hoveredCard === "tvl"}
              onMouseEnter={() => setHoveredCard("tvl")}
              onMouseLeave={() => setHoveredCard(null)}
            />
          </div>
        </div>
      </div>
    </section>
  );
}
