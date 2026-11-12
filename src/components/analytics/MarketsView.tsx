"use client";

import { useMemo, useState } from "react";
import type { MarketPositioning, PositionsOverview } from "@/lib/positionStore";
import type { MarketRow } from "@/lib/exchangeAnalytics";
import type { Market24h } from "@/lib/marketLive";
import { count, pct } from "@/lib/analyticsFormat";
import { MarketTable, type SortKey } from "@/components/analytics/MarketTable";
import { useAnalyticsWindow, useApi, useExchangeAnalytics } from "@/components/analytics/hooks";
import { Section, TileSkeleton } from "@/components/analytics/ui";
import { PillTabs } from "@/components/analytics/kit";

type View = "activity" | "positioning";

/** Positioning columns: perps only, live where the window doesn't apply. */
const POSITIONING: SortKey[] = ["volume", "oiNow", "oiChange", "fundingAnnual", "longShare", "whaleShare", "whaleBias"];
/** The 24H view: what SoDEX's live tickers give for every market. */
const DAY_COLUMNS: SortKey[] = ["volume", "share", "change24h", "oiNow", "fundingAnnual", "fees"];
const DAY_PHONE: SortKey[] = ["volume", "change24h"];

/**
 * The last 24 hours as table rows. Each market keeps its tier from the 30-day
 * view: a single day is too short to call a market active or thin.
 */
function dayRows(live: Market24h[], base: MarketRow[]): MarketRow[] {
  const tiers = new Map(base.map((m) => [m.symbol, m.tier]));
  const total = live.reduce((a, m) => a + m.volume, 0);
  return live.map((m) => ({
    symbol: m.symbol,
    kind: m.kind,
    volume: m.volume,
    share: total > 0 ? m.volume / total : 0,
    volumeChange: null,
    trades: 0,
    tradersPerDay: 0,
    tradesPerTrader: null,
    avgTrade: null,
    oiAvg: null,
    oiNow: m.openInterestUsd,
    oiChange: null,
    turnover: null,
    funding8h: null,
    fundingAnnual: m.fundingAnnual,
    fundingPositiveDays: null,
    tier: tiers.get(m.symbol) ?? "thin",
    fees: m.fees,
    change24h: m.change24h,
  }));
}

/** What a phone keeps of them: the sort column and the whales' lean. */
const POSITIONING_PHONE: SortKey[] = ["oiNow", "whaleBias"];

type MarketsPositioning = { available: true; coverage: PositionsOverview["coverage"]; markets: MarketPositioning[] } | { available: false; reason: string };

function merge(rows: MarketRow[], pos: MarketPositioning[] | null): MarketRow[] {
  if (!pos) return rows;
  const by = new Map(pos.map((p) => [p.market, p]));
  return rows.map((m) => {
    const p = by.get(m.symbol);
    if (!p) return m;
    const all = p.longUsd + p.shortUsd;
    const whales = p.whaleLongUsd + p.whaleShortUsd;
    return {
      ...m,
      longShare: all > 0 ? p.longUsd / all : null,
      whaleShare: all > 0 ? whales / all : null,
      whaleBias: whales > 0 ? (p.whaleLongUsd - p.whaleShortUsd) / whales : null,
    };
  });
}

export function MarketsView() {
  const [win] = useAnalyticsWindow(true);
  const day = win === "24H";
  const [view, setView] = useState<View>("activity");
  // The 24H view still reads the 30-day figures, for each market's tier.
  const { data, loading: dailyLoading, error: dailyError } = useExchangeAnalytics(day ? "30D" : win);
  const live = useApi<{ asOf: number; markets: Market24h[] }>(day ? "/api/analytics/markets-24h" : null, 30_000, 60_000);
  const loading = dailyLoading || (day && live.loading);
  const error = dailyError ?? (day ? live.error : null);
  // Only fetched once the positioning view is opened.
  const pos = useApi<MarketsPositioning>(view === "positioning" ? "/api/analytics/positions?view=markets" : null, 30_000, 60_000);
  const positioning = pos.data?.available ? pos.data : null;
  const rows = useMemo(() => {
    const base = data?.markets ?? [];
    return merge(day && live.data ? dayRows(live.data.markets, base) : base, positioning?.markets ?? null);
  }, [data, day, live.data, positioning]);

  if (error && (!data || (day && !live.data))) return <p className="mt-10 text-[13px]" style={{ color: "var(--red)" }}>{error}</p>;
  if (!data || (day && !live.data)) return <TileSkeleton count={4} />;

  const c = positioning?.coverage;
  return (
    <div style={{ opacity: loading ? 0.55 : 1, transition: "opacity 0.2s" }} aria-busy={loading}>
      <Section
        title="Every market"
      >
        <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
          <PillTabs
            label="Columns"
            value={view}
            onChange={setView}
            options={[
              { value: "activity", label: "Activity" },
              { value: "positioning", label: "Positioning" },
            ]}
          />
          {view === "activity" && day && (
            <span className="text-[11.5px]" style={{ color: "var(--text-faint)" }}>
              The rolling last 24 hours, live from SoDEX. Traders and trades count whole days: pick 7D or longer.
            </span>
          )}
          {view === "positioning" && (
            <span className="text-[11.5px]" style={{ color: "var(--text-faint)" }}>
              {c
                ? `Live, from ${count(c.holders)} accounts' open positions${c.oiShare != null ? ` (${pct(Math.min(1, c.oiShare), c.oiShare < 0.1 ? 1 : 0)} of open interest so far)` : ""}. Whales: $250K+ equity.`
                : pos.data && !pos.data.available
                  ? pos.data.reason
                  : "Loading positions…"}
            </span>
          )}
        </div>
        {view === "activity" ? (
          <MarketTable key={day ? "activity-24h" : "activity"} markets={rows} win={win} {...(day && { columns: DAY_COLUMNS, phoneColumns: DAY_PHONE })} />
        ) : (
          <MarketTable key="positioning" markets={rows} win={win} columns={day ? POSITIONING.filter((k) => k !== "oiChange") : POSITIONING} phoneColumns={POSITIONING_PHONE} initialSort="oiNow" lockKind="perp" />
        )}
      </Section>
    </div>
  );
}
