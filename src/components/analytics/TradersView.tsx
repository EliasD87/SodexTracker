"use client";

import { useState } from "react";
import { count } from "@/lib/analyticsFormat";
import type { Delta } from "@/lib/exchangeAnalytics";
import { MiniChart } from "@/components/analytics/MiniChart";
import type { LiveTraders } from "@/lib/liveStore";
import { TraderInsights } from "@/components/analytics/TraderInsights";
import { useAnalyticsWindow, useApi, useCompact, useExchangeAnalytics } from "@/components/analytics/hooks";
import { Card, ChartCard, DeltaLine, Section, Tile, TileSkeleton } from "@/components/analytics/ui";
import { PillTabs, StatStrip } from "@/components/analytics/kit";

type LiveTradersResult = LiveTraders | { available: false; reason: string };
type GrowthChart = "new" | "total" | "markets";

/** Plot height on a phone. */
const PHONE_CHART = 110;

const GROUP_LABEL: Record<string, string> = {
  mm: "Market makers",
  smart: "Smart money",
  whale: "Big traders",
  retail: "Retail",
};

/** Head counts from the live collector: every account counted once per day, across all markets. */
function LiveActive({ live }: { live: LiveTraders }) {
  const today = live.days[live.days.length - 1];
  if (!today) return null;
  const since = new Date(live.health.since);
  const partial = today.day === since.toISOString().slice(0, 10);
  return (
    <Card className="p-4 sm:p-5">
      <div className="flex items-center gap-2 mb-4">
        <span className="w-1.5 h-1.5 rounded-full" style={{ background: "var(--green)" }} />
        <span className="tag" style={{ color: "var(--text-muted)" }}>LIVE · EACH ACCOUNT COUNTED ONCE</span>
      </div>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-5">
        <div className="flex flex-col gap-1">
          <span className="text-[12px]" style={{ color: "var(--text-muted)" }}>Active traders today</span>
          <span className="text-[24px] font-semibold tracking-tight leading-none" style={{ color: "var(--text)" }}>
            {today.traders.toLocaleString("en-US")}
          </span>
          <span className="text-[11.5px]" style={{ color: "var(--text-faint)" }}>
            {partial
              ? `Since ${since.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", hour12: false })}, so far`
              : "UTC day so far"}
          </span>
        </div>
        {(["smart", "whale", "mm"] as const).map((g) => (
          <div key={g} className="flex flex-col gap-1">
            <span className="text-[12px]" style={{ color: "var(--text-muted)" }}>{GROUP_LABEL[g]}</span>
            <span className="text-[24px] font-semibold tracking-tight leading-none" style={{ color: "var(--text)" }}>
              {(today.byCohort[g] ?? 0).toLocaleString("en-US")}
            </span>
            <span className="text-[11.5px]" style={{ color: "var(--text-faint)" }}>active today</span>
          </div>
        ))}
      </div>
    </Card>
  );
}

const change = (d: Delta | null) => (d && d.prev ? d.value / d.prev - 1 : null);

export function TradersView() {
  const [win] = useAnalyticsWindow();
  const { data, loading, error } = useExchangeAnalytics(win);
  const live = useApi<LiveTradersResult>("/api/analytics/live?view=traders", 60_000, 60_000);
  const compact = useCompact();
  const [growthChart, setGrowthChart] = useState<GrowthChart>("new");

  if (error && !data) return <p className="mt-10 text-[13px]" style={{ color: "var(--red)" }}>{error}</p>;
  if (!data) return <TileSkeleton count={4} />;

  const h = data.headline;
  // Work the running total backwards from today's figure.
  const cumulative: { date: string; value: number | null }[] = new Array(data.series.length);
  for (let i = data.series.length - 1, running = h.totalUsers ?? 0; i >= 0; i--) {
    cumulative[i] = { date: data.series[i].date, value: h.totalUsers == null ? null : running };
    running -= data.series[i].newUsers ?? 0;
  }

  const growthCharts: { key: GrowthChart; tab: string; card: React.ReactNode }[] = [
    {
      key: "new",
      tab: "New users",
      card: (
        <ChartCard key="new" title="New users" figure={`${count(h.newUsers.value)} in ${win}`}>
          <MiniChart
            label="New users per day"
            kind="bar"
            phoneHeight={PHONE_CHART}
            points={data.series.map((s) => ({ date: s.date, value: s.newUsers }))}
            format={(v) => count(v)}
          />
        </ChartCard>
      ),
    },
    {
      key: "total",
      tab: "Users in total",
      card: (
        <ChartCard key="total" title="Users in total" figure={h.totalUsers != null ? count(h.totalUsers) : "—"}>
          <MiniChart label="Cumulative users" kind="line" fitDomain phoneHeight={PHONE_CHART} points={cumulative} format={(v) => count(v)} />
        </ChartCard>
      ),
    },
    {
      key: "markets",
      tab: "Trader-markets",
      card: (
        <ChartCard
          key="markets"
          title="Trader-markets per day"
          figure={`avg ${count(h.traderMarketsPerDay)}`}
          note="Traders per market, added together across markets."
        >
          <MiniChart
            label="Per-market traders summed per day"
            kind="bar"
            phoneHeight={PHONE_CHART}
            points={data.series.map((s) => ({ date: s.date, value: s.traderMarkets }))}
            format={(v) => count(v)}
          />
        </ChartCard>
      ),
    },
  ];

  return (
    <div style={{ opacity: loading ? 0.55 : 1, transition: "opacity 0.2s" }} aria-busy={loading}>
      <StatStrip className="mt-6 sm:mt-8 grid-cols-2 lg:grid-cols-4">
        <Tile label="Users in total" value={h.totalUsers != null ? h.totalUsers.toLocaleString("en-US") : "—"} sub="Accounts ever created on SoDEX" />
        <Tile
          label={`New users · ${win}`}
          value={count(h.newUsers.value)}
          delta={<DeltaLine value={change(h.newUsers)} label={`vs prior ${win}`} />}
        />
        <Tile label="New users per day" value={count(h.newUsers.value / data.days)} sub={`Averaged over ${win}`} />
        <Tile
          label="Trader-markets per day"
          value={count(h.traderMarketsPerDay)}
          sub="Traders per market, added together"
        />
      </StatStrip>

      <Section title="Growth">
        {compact ? (
          // One chart at a time on a phone.
          <div className="flex flex-col gap-3">
            <div>
              <PillTabs label="Chart" value={growthChart} onChange={setGrowthChart} options={growthCharts.map((c) => ({ value: c.key, label: c.tab }))} />
            </div>
            {growthCharts.find((c) => c.key === growthChart)?.card}
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">{growthCharts.map((c) => c.card)}</div>
        )}
      </Section>

      {live.data?.available && (
        <Section title="Active traders">
          <LiveActive live={live.data} />
        </Section>
      )}

      <Section title="Who trades, and who stays" kicker="From our own collector: every trade with its accounts, grouped by behaviour.">
        <TraderInsights />
      </Section>
    </div>
  );
}
