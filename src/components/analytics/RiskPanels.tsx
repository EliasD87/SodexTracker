"use client";

import { useState } from "react";
import Link from "next/link";
import type { RiskData, RiskResult } from "@/lib/riskStore";
import { count, pct, usd } from "@/lib/analyticsFormat";
import { MiniChart } from "@/components/analytics/MiniChart";
import { useApi, useCompact } from "@/components/analytics/hooks";
import { Panel, PillTabs, SegmentMeter, SplitBar } from "@/components/analytics/kit";
import { TokenIcon } from "@/components/TokenIcon";
import { useRowLimit } from "@/components/analytics/ui";

/** Likely liquidations and mark-vs-index stretch, from the live collector. */

const LONG = "var(--green)";
const SHORT = "var(--red)";
const bp = (x: number) => `${x >= 0 ? "+" : "−"}${Math.abs(x * 10_000).toFixed(Math.abs(x) < 0.001 ? 1 : 0)} bp`;
const when = (ms: number) =>
  new Date(ms).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: "UTC",
  });
const hourLabel = (iso: string) =>
  new Date(iso).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    hour12: false,
    timeZone: "UTC",
  });

function Totals({ label, t }: { label: string; t: RiskData["liquidations"]["day"] }) {
  return (
    <div className="rounded-[12px] p-3" style={{ background: "var(--bg-elevated)" }}>
      <div className="text-[11.5px]" style={{ color: "var(--text-muted)" }}>
        {label}
      </div>
      <div className="mono text-[20px] font-semibold mt-0.5" style={{ color: "var(--text)" }}>
        {t.usd ? usd(t.usd) : "$0"}
      </div>
      <div className="text-[11px] mt-0.5" style={{ color: "var(--text-faint)" }}>
        {count(t.count)} position{t.count === 1 ? "" : "s"}
      </div>
      {t.usd > 0 && (
        <div className="mt-2">
          <SplitBar
            legend={false}
            height={6}
            parts={[
              { label: "Longs", value: t.longUsd, color: LONG },
              { label: "Shorts", value: t.shortUsd, color: SHORT },
            ]}
          />
        </div>
      )}
    </div>
  );
}

function Liquidations({ d }: { d: RiskData["liquidations"] }) {
  const { shown, toggle } = useRowLimit(d.recent, 8, 5);
  return (
    <Panel
      title="Likely liquidations"
      right={
        <span className="tag" style={{ color: "var(--text-faint)" }}>
          ESTIMATED
        </span>
      }
    >
      <div className="grid grid-cols-2 gap-3">
        <Totals label="Last 24 hours" t={d.day} />
        <Totals label="Last 7 days" t={d.week} />
      </div>
      {d.recent.length ? (
        <>
          <ul className="mt-4">
            {shown.map((l, i) => (
              <li key={`${l.name}-${l.ts}-${i}`} className="flex items-center gap-3 py-2 text-[12.5px]" style={{ borderTop: "1px solid var(--border-subtle)" }}>
                <span className="mono text-[11px] w-[84px] sm:w-[92px] shrink-0" style={{ color: "var(--text-faint)" }}>
                  {when(l.ts)}
                </span>
                <span className="min-w-0 flex-1">
                  <Link href={`/analytics/trader/${l.name}`} className="block truncate hover:underline underline-offset-2" style={{ color: "var(--text)" }}>
                    {l.name}
                  </Link>
                  <span className="inline-flex items-center gap-1.5 text-[11px]" style={{ color: "var(--text-muted)" }}>
                    <TokenIcon symbol={l.market} size={12} />
                    {l.market.replace("-USD", "")}
                    <span className="font-semibold" style={{ color: l.side === "LONG" ? LONG : SHORT }}>
                      {l.side}
                    </span>
                    {!l.full && <span style={{ color: "var(--text-faint)" }}>· partial</span>}
                  </span>
                </span>
                <span className="mono font-semibold shrink-0" style={{ color: "var(--text)" }}>
                  {usd(l.usd)}
                </span>
              </li>
            ))}
          </ul>
          <div className="-mx-4 sm:-mx-5">{toggle}</div>
        </>
      ) : (
        <p className="mt-4 text-[12.5px]" style={{ color: "var(--text-faint)" }}>
          {d.tracked ? "None detected yet." : "Appears once the collector tracks positions."}
        </p>
      )}
      <p className="mt-3 text-[11px]" style={{ color: "var(--text-faint)" }}>
        SoDEX liquidates through the order book, so trades carry no liquidation flag. A position counts here when it closed or shrank with the price at (within
        1% of) its liquidation price.
      </p>
    </Panel>
  );
}

function Basis({ d }: { d: RiskData["basis"] }) {
  const markets = Object.keys(d.series);
  const [market, setMarket] = useState(markets[0] ?? "");
  // Every perp on a wider screen; the first six on a phone.
  const { shown, toggle } = useRowLimit(d.rows, d.rows.length, 6);
  const points = (d.series[market] ?? []).map((p) => ({
    date: new Date(p.t).toISOString(),
    value: p.basis,
  }));
  return (
    <Panel
      title="Mark vs index"
      right={
        markets.length > 1 ? (
          <PillTabs
            label="Market"
            value={market}
            onChange={setMarket}
            options={markets.map((m) => ({
              value: m,
              label: m.replace("-USD", ""),
            }))}
          />
        ) : undefined
      }
    >
      {!d.rows.length ? (
        <p className="text-[12.5px]" style={{ color: "var(--text-faint)" }}>
          Appears once the collector has recorded market snapshots.
        </p>
      ) : (
        <>
          {points.length >= 2 ? (
            <>
              <div className="flex flex-wrap items-baseline justify-between gap-x-3 mb-1">
                <span className="text-[12.5px] font-semibold" style={{ color: "var(--text)" }}>
                  {market}, hourly average
                </span>
                <span className="mono text-[12px]" style={{ color: "var(--text-muted)" }}>
                  above zero: mark over index
                </span>
              </div>
              <MiniChart
                key={market}
                label={`${market} mark minus index`}
                kind="bar"
                signed
                points={points}
                color="var(--div-pos)"
                negativeColor="var(--div-neg)"
                format={bp}
                formatTime={hourLabel}
                phoneHeight={110}
              />
            </>
          ) : (
            <p className="text-[12px] mb-2" style={{ color: "var(--text-faint)" }}>
              The chart needs a couple of hours of snapshots.
            </p>
          )}
          <table className="w-full mt-4 text-[12.5px]">
            <thead>
              <tr style={{ color: "var(--text-faint)" }}>
                <th className="text-left font-normal py-1.5">Market</th>
                <th className="text-right font-normal py-1.5">Now</th>
                <th className="text-right font-normal py-1.5 hidden sm:table-cell">Typical</th>
                <th className="text-right font-normal py-1.5">Widest</th>
                <th className="text-left font-normal py-1.5 pl-3 w-[120px] hidden md:table-cell" title="Share of snapshots more than 0.1% (10 bp) from index">
                  Stretched
                </th>
              </tr>
            </thead>
            <tbody className="mono" style={{ fontVariantNumeric: "tabular-nums" }}>
              {shown.map((r) => (
                <tr key={r.market} style={{ borderTop: "1px solid var(--border-subtle)" }}>
                  <td className="py-2 font-sans">
                    <span className="inline-flex items-center gap-2 font-semibold" style={{ color: "var(--text)" }}>
                      <TokenIcon symbol={r.market} size={16} />
                      {r.market.replace("-USD", "")}
                    </span>
                  </td>
                  <td className="py-2 text-right" style={{ color: "var(--text)" }}>
                    {r.now == null ? "—" : bp(r.now)}
                  </td>
                  <td className="py-2 text-right hidden sm:table-cell" style={{ color: "var(--text-muted)" }}>
                    {r.avgAbs == null ? "—" : `±${(r.avgAbs * 10_000).toFixed(1)} bp`}
                  </td>
                  <td className="py-2 text-right" style={{ color: "var(--text-muted)" }}>
                    {r.max == null ? "—" : bp(r.max)}
                  </td>
                  <td className="py-2 pl-3 hidden md:table-cell">
                    <span className="flex items-center gap-2">
                      <span className="flex-1">
                        <SegmentMeter share={r.stretched ?? 0} segments={10} color="var(--tier-niche)" />
                      </span>
                      <span className="text-[11px] w-9 text-right" style={{ color: "var(--text-muted)" }}>
                        {pct(r.stretched ?? 0, 0)}
                      </span>
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="-mx-4 sm:-mx-5">{toggle}</div>
          <p className="mt-3 text-[11px]" style={{ color: "var(--text-faint)" }}>
            The 12 perps with the most open interest. Mark is the price SoDEX uses for PnL and liquidations; index is the underlying across other venues. 1 bp =
            0.01%. {d.from ? `Snapshots from ${when(d.from)} to ${when(d.to!)} UTC.` : ""}
          </p>
        </>
      )}
    </Panel>
  );
}

export function RiskPanels() {
  const { data } = useApi<RiskResult>("/api/analytics/risk", 30_000, 60_000);
  const compact = useCompact();
  const [pane, setPane] = useState<"liq" | "basis">("liq");
  if (!data) return <div className="h-64 rounded-[16px] animate-pulse" style={{ background: "var(--bg-elevated)" }} />;
  if (!data.available)
    return (
      <p className="text-[12.5px]" style={{ color: "var(--text-faint)" }}>
        {data.reason}
      </p>
    );
  // Side by side they run a phone screen long twice over: one at a time there.
  if (compact)
    return (
      <div className="flex flex-col gap-3">
        <div>
          <PillTabs
            label="Panel"
            value={pane}
            onChange={setPane}
            options={[
              { value: "liq", label: "Likely liquidations" },
              { value: "basis", label: "Mark vs index" },
            ]}
          />
        </div>
        {pane === "liq" ? <Liquidations d={data.liquidations} /> : <Basis d={data.basis} />}
      </div>
    );
  return (
    <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
      <Liquidations d={data.liquidations} />
      <Basis d={data.basis} />
    </div>
  );
}
