"use client";

import { useMemo, useState } from "react";
import type { MarketPositioning, PositionsOverview } from "@/lib/positionStore";
import type { MarketRow } from "@/lib/exchangeAnalytics";
import { count, pct } from "@/lib/analyticsFormat";
import { MarketTable, type SortKey } from "@/components/analytics/MarketTable";
import { useAnalyticsWindow, useApi, useExchangeAnalytics } from "@/components/analytics/hooks";
import { Section, TileSkeleton } from "@/components/analytics/ui";
import { PillTabs } from "@/components/analytics/kit";

type View = "activity" | "positioning";

/** Positioning columns: perps only, live where the window doesn't apply. */
const POSITIONING: SortKey[] = ["volume", "oiNow", "oiChange", "fundingAnnual", "longShare", "whaleShare", "whaleBias"];
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
  const [win] = useAnalyticsWindow();
  const [view, setView] = useState<View>("activity");
  const { data, loading, error } = useExchangeAnalytics(win);
  // Only fetched once the positioning view is opened.
  const pos = useApi<MarketsPositioning>(view === "positioning" ? "/api/analytics/positions?view=markets" : null, 30_000, 60_000);
  const positioning = pos.data?.available ? pos.data : null;
  const rows = useMemo(() => merge(data?.markets ?? [], positioning?.markets ?? null), [data, positioning]);

  if (error && !data) return <p className="mt-10 text-[13px]" style={{ color: "var(--red)" }}>{error}</p>;
  if (!data) return <TileSkeleton count={4} />;

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
          <MarketTable key="activity" markets={rows} win={win} />
        ) : (
          <MarketTable key="positioning" markets={rows} win={win} columns={POSITIONING} phoneColumns={POSITIONING_PHONE} initialSort="oiNow" lockKind="perp" />
        )}
      </Section>
    </div>
  );
}
