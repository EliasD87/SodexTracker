"use client";

import { useState } from "react";
import Link from "next/link";
import type { GroupStat, PositionsOverview, PositionsResult } from "@/lib/positionStore";
import { count, pct, timeAgo, usd } from "@/lib/analyticsFormat";
import { traderHref, traderName } from "@/lib/traderNames";
import { useApi, useCompact } from "@/components/analytics/hooks";
import { NoData, Section, TileSkeleton, useRowLimit } from "@/components/analytics/ui";
import { BiasTag, Kpi, Panel, PillTabs, SegmentMeter, SizeScale, SplitBar, StatStrip } from "@/components/analytics/kit";
import { TokenIcon } from "@/components/TokenIcon";
import { LiqLadder } from "@/components/analytics/LiqLadder";

/**
 * Open positions across SoDEX: who is long, who is short, how leveraged, and
 * where liquidations sit. Groups and nicknames only; no address is ever sent.
 */

const TTL = 30_000;
const REFRESH = 60_000;
const LONG = "var(--green)";
const SHORT = "var(--red)";

const signedUsd = (n: number) => `${n > 0 ? "+" : n < 0 ? "−" : ""}${usd(Math.abs(n))}`;
const price = (p: number) => (p >= 1000 ? p.toLocaleString("en-US", { maximumFractionDigits: 0 }) : p >= 1 ? p.toFixed(2) : p.toPrecision(4));

function Coverage({ d }: { d: PositionsOverview }) {
  const c = d.coverage;
  const complete = c.traders > 0 && c.swept >= c.traders * 0.99;
  return (
    <div className="mt-6 flex flex-col gap-2">
      <p className="text-[12px] flex items-center gap-2 flex-wrap" style={{ color: "var(--text-muted)" }}>
        <span className="w-1.5 h-1.5 rounded-full" style={{ background: complete ? "var(--green)" : "var(--tier-niche)" }} aria-hidden />
        {count(c.holders)} accounts holding {count(c.positions)} positions
        {c.oiShare != null && ` · ${pct(Math.min(1, c.oiShare), c.oiShare < 0.1 ? 1 : 0)} of SoDEX open interest`}
        {c.lastSnapshot && ` · last read ${timeAgo(c.lastSnapshot)}`}
        {` · valued at live prices`}
      </p>
      {!complete && (
        <p className="text-[12.5px] px-3 py-2 rounded-lg" style={{ background: "var(--bg-elevated)", color: "var(--text-muted)" }}>
          Partial: {count(c.swept)} of {count(c.traders)} traders checked for open positions so far, busiest first. The first full check takes about half a day
          once the collector runs on the server.
        </p>
      )}
    </div>
  );
}

function GroupCard({ g, className = "" }: { g: GroupStat; className?: string }) {
  const share = g.known ? g.holders / g.known : null;
  return (
    <div className={`flex flex-col rounded-[14px] p-4 ${className}`} style={{ background: "var(--bg-elevated)", border: "1px solid var(--border-subtle)" }}>
      <div className="flex items-start justify-between gap-2">
        <div>
          <div className="text-[14px] font-semibold" style={{ color: "var(--text)" }}>
            {g.label}
          </div>
          <div className="text-[11.5px] mt-0.5" style={{ color: "var(--text-faint)" }}>
            {g.rule}
          </div>
        </div>
        <BiasTag bias={g.bias} />
      </div>
      <div className="mt-4">
        <SplitBar
          legend={false}
          parts={[
            { label: "Long", value: g.longUsd, color: LONG },
            { label: "Short", value: g.shortUsd, color: SHORT },
          ]}
        />
        <div className="mt-1.5 flex justify-between mono text-[11.5px]" style={{ color: "var(--text-muted)" }}>
          <span>{g.longUsd ? `${usd(g.longUsd)} long` : "No longs"}</span>
          <span>{g.shortUsd ? `${usd(g.shortUsd)} short` : "No shorts"}</span>
        </div>
      </div>
      <dl className="mt-4 grid grid-cols-3 gap-2 text-[11px]" style={{ color: "var(--text-faint)" }}>
        <div>
          <dt>In position</dt>
          <dd className="mono text-[13px] mt-0.5" style={{ color: "var(--text)" }}>
            {count(g.holders)}
            {share != null && <span style={{ color: "var(--text-faint)" }}> · {pct(share, 0)}</span>}
          </dd>
        </div>
        <div>
          <dt>Leverage</dt>
          <dd className="mono text-[13px] mt-0.5" style={{ color: "var(--text)" }}>
            {g.leverage == null ? "—" : `${g.leverage.toFixed(1)}×`}
          </dd>
        </div>
        <div>
          <dt>In profit</dt>
          <dd className="mono text-[13px] mt-0.5" style={{ color: "var(--text)" }}>
            {g.inProfit == null ? "—" : pct(g.inProfit, 0)}
          </dd>
        </div>
      </dl>
    </div>
  );
}

function Heatmap({ d }: { d: PositionsOverview }) {
  const groups = d.bySize;
  // Every market on a wider screen; the first eight on a phone.
  const { shown, toggle } = useRowLimit(d.heatmap.markets, d.heatmap.markets.length, 8);
  const cell = new Map(d.heatmap.cells.map((c) => [`${c.market}|${c.group}`, c]));
  return (
    <div>
      <table className="w-full text-[12px] table-fixed" style={{ borderCollapse: "separate", borderSpacing: 3 }}>
        <thead>
          <tr style={{ color: "var(--text-faint)" }}>
            <th className="text-left font-normal px-1 pb-1 w-[72px] sm:w-[110px]">Market</th>
            {groups.map((g) => (
              <th key={g.key} className="font-normal pb-1 text-center text-[10.5px] sm:text-[12px] truncate">
                {g.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {shown.map((m) => (
            <tr key={m}>
              <td className="pr-2 py-0.5">
                <span className="inline-flex items-center gap-2 font-semibold truncate" style={{ color: "var(--text)" }}>
                  <TokenIcon symbol={m} size={16} />
                  {m.replace("-USD", "")}
                </span>
              </td>
              {groups.map((g) => {
                const c = cell.get(`${m}|${g.key}`);
                const b = c?.bias ?? 0;
                const color = b >= 0 ? LONG : SHORT;
                return (
                  <td
                    key={g.key}
                    className="text-center rounded-[6px] h-7 sm:h-9 mono text-[11px]"
                    title={c ? `${m} · ${g.label}: ${usd(c.longUsd)} long, ${usd(c.shortUsd)} short` : `${m} · ${g.label}: no positions`}
                    style={{
                      background: c ? `color-mix(in srgb, ${color} ${Math.round(8 + Math.abs(b) * 52)}%, var(--bg-surface))` : "var(--bg-elevated)",
                      color: c ? "var(--text)" : "var(--text-faint)",
                    }}
                  >
                    <span className="hidden sm:inline">{c ? usd(c.longUsd + c.shortUsd) : "·"}</span>
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
      <div className="-mx-4 sm:-mx-5">{toggle}</div>
      <p className="text-[11px] mt-2" style={{ color: "var(--text-faint)" }}>
        Each cell is the group&apos;s open positions in that market. Greener leans long, redder leans short; the stronger the colour, the more one-sided.
      </p>
    </div>
  );
}

function LiquidationMap({ d }: { d: PositionsOverview }) {
  const [market, setMarket] = useState(d.liquidation.markets[0] ?? "");
  const m = d.liquidation.byMarket[market];
  if (!m)
    return (
      <p className="text-[13px]" style={{ color: "var(--text-faint)" }}>
        No liquidation levels within range yet.
      </p>
    );
  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
        <PillTabs label="Market" value={market} onChange={setMarket} options={d.liquidation.markets.map((x) => ({ value: x, label: x.replace("-USD", "") }))} />
        <span className="text-[11.5px]" style={{ color: "var(--text-faint)" }}>
          Within ±12.5% of price, in 0.5% steps
        </span>
      </div>
      <LiqLadder mark={m.mark} buckets={m.buckets} />
    </div>
  );
}

function AtRisk({ d }: { d: PositionsOverview }) {
  const { shown, toggle } = useRowLimit(d.atRisk, 10, 5);
  if (!d.atRisk.length)
    return (
      <p className="text-[13px]" style={{ color: "var(--text-faint)" }}>
        No position of $10K or more is within 10% of liquidation right now.
      </p>
    );
  const label = new Map(d.bySize.map((g) => [g.key, g.label]));
  return (
    <div className="overflow-hidden">
      <table className="w-full text-[12.5px]">
        <thead>
          <tr style={{ color: "var(--text-faint)" }}>
            <th className="text-left font-normal py-2">Trader</th>
            <th className="text-left font-normal py-2 px-2">Position</th>
            <th className="text-right font-normal py-2 px-2">Size</th>
            <th className="text-right font-normal py-2 px-2 hidden md:table-cell">Leverage</th>
            <th className="text-right font-normal py-2 px-2 hidden lg:table-cell">Entry</th>
            <th className="text-right font-normal py-2 px-2 hidden sm:table-cell">Liquidation</th>
            <th className="text-right sm:text-left font-normal py-2 pl-2 sm:px-2 sm:w-[150px]">Distance</th>
            <th className="text-right font-normal py-2 hidden md:table-cell">Unrealised</th>
          </tr>
        </thead>
        <tbody className="mono" style={{ fontVariantNumeric: "tabular-nums" }}>
          {shown.map((r, i) => (
            <tr key={`${r.name}-${r.market}-${i}`} style={{ borderTop: "1px solid var(--border-subtle)" }}>
              <td className="py-2">
                <Link
                  href={traderHref(r.name)}
                  className="font-sans text-[12.5px] break-all sm:break-normal hover:underline underline-offset-2"
                  style={{ color: "var(--text)" }}
                >
                  {traderName(r.name)}
                </Link>
                <div className="font-sans text-[11px]" style={{ color: "var(--text-faint)" }}>
                  {label.get(r.group)}
                </div>
              </td>
              <td className="py-2 px-2 font-sans">
                {/* On a phone the side goes under the market, so the row stays narrow. */}
                <span className="inline-flex flex-col items-start sm:flex-row sm:items-center gap-0.5 sm:gap-2" style={{ color: "var(--text)" }}>
                  <span className="inline-flex items-center gap-1.5 sm:contents">
                    <TokenIcon symbol={r.market} size={16} />
                    {r.market.replace("-USD", "")}
                  </span>
                  <span className="text-[10.5px] font-semibold" style={{ color: r.side === "LONG" ? LONG : SHORT }}>
                    {r.side}
                  </span>
                </span>
              </td>
              <td className="py-2 px-2 text-right" style={{ color: "var(--text)" }}>
                {usd(r.notional)}
              </td>
              <td className="py-2 px-2 text-right hidden md:table-cell" style={{ color: "var(--text-muted)" }}>
                {r.leverage ? `${r.leverage}×` : "—"}
              </td>
              <td className="py-2 px-2 text-right hidden lg:table-cell" style={{ color: "var(--text-muted)" }}>
                {price(r.entry)}
              </td>
              <td className="py-2 px-2 text-right hidden sm:table-cell" style={{ color: "var(--text-muted)" }}>
                {price(r.liq)}
              </td>
              <td className="py-2 pl-2 sm:px-2">
                <div className="flex items-center justify-end sm:justify-start gap-2">
                  {/* The meter is for scanning a long table; a phone keeps the figure. */}
                  <span className="flex-1 hidden sm:block">
                    <SegmentMeter share={1 - r.distance / 0.1} segments={12} color={r.distance < 0.02 ? SHORT : "var(--tier-niche)"} />
                  </span>
                  <span className="text-[11.5px] w-11 text-right" style={{ color: "var(--text)" }}>
                    {pct(r.distance, 1)}
                  </span>
                </div>
              </td>
              <td className="py-2 text-right hidden md:table-cell" style={{ color: r.upnl >= 0 ? "var(--green)" : "var(--red)" }}>
                {signedUsd(r.upnl)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="-mx-4 sm:-mx-5">{toggle}</div>
      <p className="text-[11px] mt-3" style={{ color: "var(--text-faint)" }}>
        Positions of $10K or more within 10% of their liquidation price, closest first. The fuller the bar, the closer to liquidation.
      </p>
    </div>
  );
}

export function PositionsView() {
  const { data, loading, error } = useApi<PositionsResult>("/api/analytics/positions", TTL, REFRESH);
  const [by, setBy] = useState<"size" | "record">("size");
  const compact = useCompact();

  if (error && !data)
    return (
      <p className="mt-10 text-[13px]" style={{ color: "var(--red)" }}>
        {error}
      </p>
    );
  if (!data) return <TileSkeleton count={4} />;

  if (!data.available) {
    return (
      <Section title="Positions">
        <NoData title="Open positions" reason={data.reason} />
      </Section>
    );
  }

  const t = data.totals;
  const tracked = t.longUsd + t.shortUsd;
  const groups = by === "size" ? data.bySize : data.byRecord;

  return (
    <div style={{ opacity: loading ? 0.55 : 1, transition: "opacity 0.2s" }} aria-busy={loading}>
      <Coverage d={data} />

      <StatStrip className="mt-6 grid-cols-2 lg:grid-cols-4">
        <Kpi label="Open positions" value={count(data.coverage.positions)} caption={`${count(data.coverage.holders)} accounts · ${usd(tracked)} notional`} />
        <Kpi label="Long vs short" value={tracked ? `${pct(t.longUsd / tracked, 0)} long` : "—"} caption={t.bias == null ? "" : <BiasTag bias={t.bias} />}>
          <SplitBar
            legend={false}
            parts={[
              { label: "Long", value: t.longUsd, color: LONG },
              { label: "Short", value: t.shortUsd, color: SHORT },
            ]}
          />
        </Kpi>
        <Kpi label="In profit" value={t.inProfit == null ? "—" : pct(t.inProfit, 0)} caption={`Unrealised ${signedUsd(t.upnl)}`}>
          <SegmentMeter share={t.inProfit ?? 0} segments={24} color="var(--green)" />
        </Kpi>
        <Kpi
          label="Exposure"
          value={t.exposure == null ? "—" : `${t.exposure.toFixed(1)}×`}
          caption={t.leverage == null ? "Positions ÷ equity of holders" : `Positions ÷ equity · avg leverage ${t.leverage.toFixed(1)}×`}
        />
      </StatStrip>

      <div className="mt-6 sm:mt-8">
        <Panel
          title="Groups"
          right={
            <PillTabs
              label="Group by"
              value={by}
              onChange={setBy}
              options={[
                { value: "size", label: "By size" },
                { value: "record", label: "By track record" },
              ]}
            />
          }
        >
          {compact ? (
            // On a phone the groups sit side by side and swipe, instead of stacking a screen long.
            <div className="scroll-row -mx-4 px-4 scroll-px-4 flex gap-3 snap-x snap-mandatory">
              {groups.map((g) => (
                <GroupCard key={g.key} g={g} className="w-[82%] shrink-0 snap-start" />
              ))}
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {groups.map((g) => (
                <GroupCard key={g.key} g={g} />
              ))}
            </div>
          )}
        </Panel>
      </div>

      <div className="mt-4 grid grid-cols-1 gap-4">
        <Panel title="Positioning heatmap">
          <Heatmap d={data} />
          <SizeScale />
        </Panel>
        <Panel title="Liquidation map">
          <LiquidationMap d={data} />
        </Panel>
      </div>

      <div className="mt-4">
        <Panel title="Positions at risk">
          <AtRisk d={data} />
        </Panel>
      </div>

    </div>
  );
}
