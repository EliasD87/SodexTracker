"use client";

import { useState } from "react";
import Link from "next/link";
import type { MarketPositions } from "@/lib/positionStore";
import type { Concentration } from "@/lib/liveStore";
import { count, marketSlug, pct, usd } from "@/lib/analyticsFormat";
import { traderHref, traderName } from "@/lib/traderNames";
import { useApi, useCompact } from "@/components/analytics/hooks";
import { BiasTag, Panel, PillTabs, SegmentMeter, SizeScale, SplitBar } from "@/components/analytics/kit";
import { useRowLimit } from "@/components/analytics/ui";
import { LiqLadder } from "@/components/analytics/LiqLadder";

/** One market's open positions and how concentrated its trading is, from the live collector. */

type Res<T> = T | { available: false; reason: string };
const LONG = "var(--green)";
const SHORT = "var(--red)";
const signedUsd = (n: number) => `${n > 0 ? "+" : n < 0 ? "−" : ""}${usd(Math.abs(n))}`;

function Positioned({ p }: { p: MarketPositions }) {
  const [by, setBy] = useState<"size" | "record" | "liq">("size");
  const all = p.longUsd + p.shortUsd;
  const groups = by === "size" ? p.bySize : p.byRecord;
  // The whole list on a wider screen; the top five on a phone.
  const largest = useRowLimit(p.largest, p.largest.length, 5);
  return (
    <Panel
      title={`Who is positioned in ${p.market.replace("-USD", "")}`}
      right={
        <PillTabs
          label="View"
          value={by}
          onChange={setBy}
          options={[
            { value: "size", label: "By size" },
            { value: "record", label: "By record" },
            { value: "liq", label: "Liquidations" },
          ]}
        />
      }
    >
      <div className="flex items-end justify-between gap-3">
        <div>
          <div className="text-[12px]" style={{ color: "var(--text-muted)" }}>{count(p.holders)} accounts · {usd(all)} open</div>
          <div className="mono text-[22px] sm:text-[26px] font-semibold tracking-tight mt-1" style={{ color: "var(--text)" }}>{all ? `${pct(p.longUsd / all, 0)} long` : "—"}</div>
        </div>
        <BiasTag bias={p.bias} />
      </div>
      <div className="mt-3">
        <SplitBar
          parts={[
            { label: "Long", value: p.longUsd, color: LONG, note: usd(p.longUsd) },
            { label: "Short", value: p.shortUsd, color: SHORT, note: usd(p.shortUsd) },
          ]}
        />
      </div>

      <div className="mt-5">
        {by === "liq" ? (
          p.mark && p.liquidation.length ? (
            <LiqLadder mark={p.mark} buckets={p.liquidation} />
          ) : (
            <p className="text-[12.5px]" style={{ color: "var(--text-faint)" }}>No liquidation levels within 12.5% of the price.</p>
          )
        ) : (
          <ul className="flex flex-col gap-3">
            {groups.map((g) => (
              <li key={g.key}>
                <div className="flex items-center justify-between gap-2 text-[12.5px]">
                  <span style={{ color: "var(--text)" }}>
                    {g.label} <span style={{ color: "var(--text-faint)" }}>· {g.holders}</span>
                  </span>
                  <BiasTag bias={g.bias} />
                </div>
                <div className="mt-1.5">
                  <SplitBar
                    legend={false}
                    height={6}
                    parts={[
                      { label: "Long", value: g.longUsd, color: LONG },
                      { label: "Short", value: g.shortUsd, color: SHORT },
                    ]}
                  />
                </div>
              </li>
            ))}
          </ul>
        )}
        {by !== "liq" && <SizeScale />}
      </div>

      {p.largest.length > 0 && (
        <div className="mt-5 pt-3" style={{ borderTop: "1px solid var(--border-subtle)" }}>
          <div className="mono text-[11px] tracking-[0.14em] uppercase mb-2" style={{ color: "var(--text-muted)" }}>Largest positions</div>
          <ul>
            {largest.shown.map((x, i) => (
              <li key={`${x.name}-${i}`} className="flex items-center justify-between gap-3 py-1.5 text-[12.5px]">
                <span className="min-w-0 truncate sm:overflow-visible sm:whitespace-normal">
                  <Link href={traderHref(x.name)} className="truncate hover:underline underline-offset-2" style={{ color: "var(--text)" }}>{traderName(x.name)}</Link>
                  <span className="text-[11px]" style={{ color: "var(--text-faint)" }}> · {x.group}</span>
                </span>
                <span className="mono shrink-0 text-right">
                  <span className="text-[10.5px] font-semibold mr-2" style={{ color: x.side === "LONG" ? LONG : SHORT }}>{x.side}</span>
                  <span style={{ color: "var(--text)" }}>{usd(x.notional)}</span>
                  <span className="ml-2 text-[11px]" style={{ color: x.upnl >= 0 ? "var(--green)" : "var(--red)" }}>{signedUsd(x.upnl)}</span>
                </span>
              </li>
            ))}
          </ul>
          <div className="-mx-4 sm:-mx-5">{largest.toggle}</div>
        </div>
      )}
      <p className="mt-3 text-[11px]" style={{ color: "var(--text-faint)" }}>
        {p.leverage ? `Average leverage ${p.leverage.toFixed(1)}× · ` : ""}
        {p.inProfit != null ? `${pct(p.inProfit, 0)} of positions in profit · ` : ""}
        {p.oiShare != null ? `${pct(Math.min(1, p.oiShare), p.oiShare < 0.1 ? 1 : 0)} of this market's open interest tracked so far` : "Live prices"}
      </p>
    </Panel>
  );
}

function Concentrated({ c }: { c: Concentration }) {
  // The whole list on a wider screen; the top five on a phone.
  const { shown, toggle } = useRowLimit(c.top, c.top.length, 5);
  return (
    <Panel title="Who drives the volume">
      <div className="text-[12px]" style={{ color: "var(--text-muted)" }}>Top 5 accounts&apos; share of trading</div>
      <div className="mono text-[22px] sm:text-[26px] font-semibold tracking-tight mt-1" style={{ color: "var(--text)" }}>{pct(c.top5Share, 0)}</div>
      <div className="mt-3">
        <SegmentMeter share={c.top5Share} segments={32} color="var(--text)" />
      </div>
      <div className="mt-2 flex justify-between text-[11.5px]" style={{ color: "var(--text-faint)" }}>
        <span>Top 10: {pct(c.top10Share, 0)}</span>
        <span>{count(c.accounts)} accounts traded</span>
      </div>
      <ul className="mt-4 pt-3" style={{ borderTop: "1px solid var(--border-subtle)" }}>
        {shown.map((t, i) => (
          <li key={t.name} className="flex items-center gap-3 py-1.5 text-[12.5px]">
            <span className="mono text-[11px] w-4 text-right" style={{ color: "var(--text-faint)" }}>{i + 1}</span>
            <Link href={traderHref(t.name)} className="flex-1 truncate hover:underline underline-offset-2" style={{ color: "var(--text)" }}>{traderName(t.name)}</Link>
            {t.makerShare != null && <span className="text-[11px]" style={{ color: "var(--text-faint)" }}>{pct(t.makerShare, 0)} maker</span>}
            <span className="mono w-12 text-right" style={{ color: "var(--text)" }}>{pct(t.share, 1)}</span>
          </li>
        ))}
      </ul>
      <div className="-mx-4 sm:-mx-5">{toggle}</div>
      <p className="mt-3 text-[11px]" style={{ color: "var(--text-faint)" }}>
        Each side of a trade counts for its own account. From {c.days} day{c.days === 1 ? "" : "s"} of live data (up to 30). A high maker share usually means a
        market maker.
      </p>
    </Panel>
  );
}

function Unavailable({ title, reason }: { title: string; reason: string }) {
  return (
    <Panel title={title}>
      <p className="text-[12.5px]" style={{ color: "var(--text-faint)" }}>{reason}</p>
    </Panel>
  );
}

export function MarketPositioning({ symbol }: { symbol: string }) {
  const { data } = useApi<{ positions: Res<MarketPositions>; concentration: Res<Concentration> }>(
    `/api/analytics/market/${marketSlug(symbol)}/positions`,
    30_000,
    60_000,
  );
  const compact = useCompact();
  const [pane, setPane] = useState<"positions" | "volume">("positions");
  if (!data) return <div className="h-64 rounded-[16px] animate-pulse" style={{ background: "var(--bg-elevated)" }} />;
  const label = symbol.replace("-USD", "");
  const positioned = data.positions.available ? (
    <Positioned p={data.positions} />
  ) : (
    <Unavailable title={`Who is positioned in ${label}`} reason={data.positions.reason} />
  );
  const concentrated = data.concentration.available ? (
    <Concentrated c={data.concentration} />
  ) : (
    <Unavailable title="Who drives the volume" reason={data.concentration.reason} />
  );
  // Side by side they run a phone screen long twice over: one at a time there.
  if (compact) {
    return (
      <div className="flex flex-col gap-3">
        <div>
          <PillTabs
            label="Panel"
            value={pane}
            onChange={setPane}
            options={[
              { value: "positions", label: "Who is positioned" },
              { value: "volume", label: "Who drives the volume" },
            ]}
          />
        </div>
        {pane === "positions" ? positioned : concentrated}
      </div>
    );
  }
  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
      {positioned}
      {concentrated}
    </div>
  );
}
