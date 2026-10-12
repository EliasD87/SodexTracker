"use client";

import { useState } from "react";
import { signedPct, usd } from "@/lib/analyticsFormat";
import { MiniChart } from "@/components/analytics/MiniChart";
import { FundingBars } from "@/components/analytics/FundingBars";
import { MarketTable } from "@/components/analytics/MarketTable";
import { useAnalyticsWindow, useCompact, useExchangeAnalytics } from "@/components/analytics/hooks";
import { ChartCard, Section, Tile, TileSkeleton } from "@/components/analytics/ui";
import { PillTabs, StatStrip } from "@/components/analytics/kit";
import { RiskPanels } from "@/components/analytics/RiskPanels";

/** Plot height on a phone. */
const PHONE_CHART = 110;

export function FundingView() {
  const [win] = useAnalyticsWindow();
  const { data, loading, error } = useExchangeAnalytics(win);
  const compact = useCompact();
  const [trend, setTrend] = useState<"funding" | "leverage">("funding");

  if (error && !data) return <p className="mt-10 text-[13px]" style={{ color: "var(--red)" }}>{error}</p>;
  if (!data) return <TileSkeleton count={4} />;

  const h = data.headline;
  const leverage = data.series.map((s) => ({ date: s.date, value: s.oi != null && s.tvl ? s.oi / s.tvl : null }));

  const fundingCard = (
    <ChartCard key="funding" title="Funding, annualised" figure={h.fundingAnnual != null ? `avg ${signedPct(h.fundingAnnual)}` : "—"} note="Weighted by each market's open interest that day.">
      <MiniChart
        label="Open-interest-weighted funding, annualised"
        kind="line"
        signed
        phoneHeight={PHONE_CHART}
        points={data.series.map((s) => ({ date: s.date, value: s.fundingAnnual }))}
        format={(v) => signedPct(v, 0)}
      />
    </ChartCard>
  );
  const leverageCard = (
    <ChartCard
      key="leverage"
      title="Open interest ÷ TVL"
      figure={h.oiToTvl != null ? `now ${h.oiToTvl.toFixed(2)}×` : "—"}
      note="How many dollars of positions sit on each dollar deposited."
    >
      <MiniChart label="Open interest divided by TVL" kind="line" phoneHeight={PHONE_CHART} points={leverage} format={(v) => `${v.toFixed(1)}×`} />
    </ChartCard>
  );

  return (
    <div style={{ opacity: loading ? 0.55 : 1, transition: "opacity 0.2s" }} aria-busy={loading}>
      <StatStrip className="mt-6 sm:mt-8 grid-cols-2 lg:grid-cols-4">
        <Tile
          label="Funding, annualised"
          value={h.fundingAnnual != null ? signedPct(h.fundingAnnual) : "—"}
          sub={h.fundingAnnual == null ? undefined : h.fundingAnnual >= 0 ? "Longs paying shorts, weighted by OI" : "Shorts paying longs, weighted by OI"}
        />
        <Tile
          label="Open interest ÷ TVL"
          value={h.oiToTvl != null ? `${h.oiToTvl.toFixed(2)}×` : "—"}
          sub={h.tvlNow != null && h.oiNow != null ? `${usd(h.oiNow)} of positions on ${usd(h.tvlNow)} deposited` : undefined}
        />
        <Tile label="Daily OI turnover" value={h.turnover != null ? `${h.turnover.toFixed(2)}×` : "—"} sub="Perps volume per day ÷ average open interest" />
        <Tile label="Open interest now" value={h.oiNow != null ? usd(h.oiNow) : "—"} sub={h.oiAvg ? `Averaged ${usd(h.oiAvg.value)} over ${win}` : undefined} />
      </StatStrip>

      <Section title="Trend">
        {compact ? (
          // One chart at a time on a phone.
          <div className="flex flex-col gap-3">
            <div>
              <PillTabs
                label="Chart"
                value={trend}
                onChange={setTrend}
                options={[
                  { value: "funding", label: "Funding" },
                  { value: "leverage", label: "OI ÷ TVL" },
                ]}
              />
            </div>
            {trend === "funding" ? fundingCard : leverageCard}
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {fundingCard}
            {leverageCard}
          </div>
        )}
      </Section>

      <Section
        title="Who is paying to hold"
        kicker="Where funding is persistently one-sided, the crowd is leaning that way and paying for it. Read +10.9% as neutral: it is SoDEX's fixed interest component (0.01% every 8 hours) with no pressure either way on top."
      >
        <FundingBars markets={data.markets} />
      </Section>

      <Section
        title="Every perp, by funding"
        kicker="The extremes are often thin markets with little open interest, where a single position moves the rate. The OI column shows how much is behind each rate."
      >
        <MarketTable
          markets={data.markets}
          win={win}
          lockKind="perp"
          initialSort="fundingAnnual"
          columns={["fundingAnnual", "fundingPositiveDays", "oiNow", "oiChange", "turnover", "volume"]}
          phoneColumns={["fundingAnnual", "oiNow"]}
        />
      </Section>

      <Section title="Live risk" kicker="From our own collector: positions that were likely liquidated, and how far each perp's mark price strays from its index.">
        <RiskPanels />
      </Section>
    </div>
  );
}
