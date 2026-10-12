"use client";

import { useState } from "react";
import type { LiveResult } from "@/lib/liveStore";
import type { MoneyResult } from "@/lib/moneyStore";
import type { PositionsOverview, PositionsResult } from "@/lib/positionStore";
import type { WindowKey } from "@/lib/exchangeAnalytics";
import { useApi, useExchangeAnalytics } from "@/components/analytics/hooks";
import { LiveDot, Panel, PillTabs } from "@/components/analytics/kit";
import { MarketHeatmap } from "@/components/deep/MarketHeatmap";
import { PressureClock } from "@/components/deep/PressureClock";
import { PositioningRadar } from "@/components/deep/PositioningRadar";
import { LiquidationZones } from "@/components/deep/LiquidationZones";
import { MoneyRiver } from "@/components/deep/MoneyRiver";
import { PairPicker, useMarketPositions, withPicked } from "@/components/deep/pairs";
import { Waiting } from "@/components/deep/shared";

type Rank = "volume" | "open";
const RANKS = [
  { value: "volume" as const, label: "Most traded" },
  { value: "open" as const, label: "Most held" },
];
// Both rankings arrive in the same positions data, so switching costs no request.
const rankPills = (value: Rank, onChange: (r: Rank) => void, label: string) => <PillTabs label={label} value={value} onChange={onChange} options={RANKS} />;

/**
 * Deep analysis: an experimental page of visuals built from the same data as
 * the dashboard, each answering one question at a glance.
 */
export function DeepAnalysisView() {
  const [win, setWin] = useState<WindowKey>("30D");
  const [radarBy, setRadarBy] = useState<Rank>("volume");
  const [liqBy, setLiqBy] = useState<Rank>("volume");
  const exchange = useExchangeAnalytics(win).data;
  const flow = useApi<LiveResult>("/api/analytics/live?view=flow&hours=24", 60_000, 60_000).data;
  const positions = useApi<PositionsResult>("/api/analytics/positions", 60_000, 60_000).data;
  const money = useApi<MoneyResult>("/api/analytics/money?window=30D", 120_000, 300_000).data;

  // Extra pairs each card shows, beyond its default markets: loaded only when picked.
  const [radarPicks, setRadarPicks] = useState<string[]>([]);
  const [liqPicks, setLiqPicks] = useState<string[]>([]);
  const status = useMarketPositions([...new Set([...radarPicks, ...liqPicks])]);
  const pos: PositionsOverview | null = positions?.available ? withPicked(positions, status) : null;
  const perps = exchange?.markets ?? [];
  const radarShown = pos ? (radarBy === "open" && pos.heatmap.byOpen?.length ? pos.heatmap.byOpen : pos.heatmap.markets).slice(0, 8) : [];
  const liqShown = pos ? (liqBy === "open" && pos.liquidation.byOpen?.length ? pos.liquidation.byOpen : pos.liquidation.markets) : [];

  return (
    <main className="max-w-[1240px] mx-auto px-4 sm:px-6 pt-[76px] sm:pt-[96px] pb-20">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-[26px] sm:text-[34px] font-semibold leading-none" style={{ color: "var(--text)", letterSpacing: "-0.03em" }}>
              Deep analysis
            </h1>
            <span
              className="text-[10.5px] font-semibold uppercase tracking-wide px-1.5 py-[3px] rounded-[6px]"
              style={{ background: "var(--text)", color: "var(--bg)" }}
            >
              Test phase
            </span>
          </div>
        </div>
      </div>

      <div className="mt-5 sm:mt-6 grid grid-cols-1 lg:grid-cols-12 gap-3 sm:gap-4">
        <Panel
          title="Market heatmap"
          right={
            <PillTabs
              label="Window"
              value={win}
              onChange={setWin}
              options={(["7D", "30D", "90D"] as const).map((w) => ({ value: w, label: w }))}
            />
          }
          className="lg:col-span-12"
        >
          {exchange ? <MarketHeatmap markets={exchange.markets} win={win} /> : <Waiting height={520} />}
        </Panel>

        <Panel title="Pressure clock" live className="lg:col-span-6">
          {!flow ? <Waiting height={460} /> : flow.available && flow.heatmap ? <PressureClock flow={flow} /> : <Waiting height={460} reason={flow.available ? "Not enough trading yet." : flow.reason} />}
        </Panel>

        <Panel
          title="Whales vs everyone"
          live
          right={
            <span className="flex flex-wrap items-center justify-end gap-1.5">
              {rankPills(radarBy, setRadarBy, "Rank markets by")}
              <PairPicker markets={perps} shown={radarShown} picked={radarPicks} status={status} onChange={setRadarPicks} />
            </span>
          }
          className="lg:col-span-6"
        >
          {!positions ? (
            <Waiting height={460} />
          ) : pos && pos.heatmap.markets.length >= 3 ? (
            <PositioningRadar data={pos} by={radarBy} extra={radarPicks} />
          ) : (
            <Waiting height={460} reason={positions.available ? "Positions are still being read. Check back in a few hours." : positions.reason} />
          )}
        </Panel>

        <Panel
          title="Liquidation zones"
          live
          right={
            <span className="flex flex-wrap items-center justify-end gap-1.5">
              {rankPills(liqBy, setLiqBy, "Rank markets by")}
              <PairPicker markets={perps} shown={liqShown} picked={liqPicks} status={status} onChange={setLiqPicks} />
            </span>
          }
          className="lg:col-span-12"
        >
          {!positions ? (
            <Waiting height={420} />
          ) : pos && pos.liquidation.markets.length ? (
            <LiquidationZones data={pos} by={liqBy} extra={liqPicks} />
          ) : (
            <Waiting height={420} reason={positions.available ? "Positions are still being read. Check back in a few hours." : positions.reason} />
          )}
        </Panel>

        <Panel title="Money river" live className="lg:col-span-12">
          {!money ? (
            <Waiting height={380} />
          ) : money.available ? (
            <>
              {money.coverage.read < money.coverage.accounts * 0.99 && (
                <p className="mb-3 inline-flex items-center gap-2 text-[11.5px]" style={{ color: "var(--text-faint)" }}>
                  <LiveDot />
                  Still filling in: {Math.round((money.coverage.read / Math.max(1, money.coverage.accounts)) * 100)}% of account histories read so far
                </p>
              )}
              <MoneyRiver data={money} />
            </>
          ) : (
            <Waiting height={380} reason={money.reason} />
          )}
        </Panel>
      </div>
    </main>
  );
}
