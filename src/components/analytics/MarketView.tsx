"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import type { MarketHistory } from "@/lib/exchangeAnalytics";
import type { LiveMarket } from "@/lib/marketLive";
import type { LiveResult } from "@/lib/liveStore";
import { GroupTable, Tape } from "@/components/analytics/LiveTrades";
import { bps, count, growth, pct, signedPct, smallSignedPct, usd } from "@/lib/analyticsFormat";
import { MiniChart } from "@/components/analytics/MiniChart";
import { useAnalyticsWindow, useApi, useCompact } from "@/components/analytics/hooks";
import { Card, ChartCard, KindBadge, Section, Tile, TierBadge, TileSkeleton } from "@/components/analytics/ui";
import { PillTabs, StatStrip } from "@/components/analytics/kit";
import { TokenIcon } from "@/components/TokenIcon";
import { MarketPositioning } from "@/components/analytics/MarketPositioning";

const HISTORY_TTL = 10 * 60 * 1000;
const LIVE_MS = 15 * 1000;
/** Plot height on a phone. */
const PHONE_CHART = 110;

type TrendChart = "volume" | "traders" | "oi" | "funding";

function price(n: number | null): string {
  if (n == null) return "—";
  const digits = n >= 1000 ? 0 : n >= 1 ? 2 : n >= 0.01 ? 4 : 6;
  return `$${n.toLocaleString("en-US", { minimumFractionDigits: digits, maximumFractionDigits: digits })}`;
}

function LiveStrip({ live }: { live: LiveMarket }) {
  const perp = live.kind === "perp";
  const minsToFunding = live.nextFundingTime ? Math.max(0, Math.round((live.nextFundingTime - live.asOf) / 60000)) : null;
  const items: { label: string; value: string; sub?: string }[] = [
    {
      label: "Price",
      value: price(live.price),
      sub: live.change24h == null ? undefined : `${signedPct(live.change24h, 2)} in 24h`,
    },
    { label: "Volume, 24h", value: live.volume24h == null ? "—" : usd(live.volume24h) },
  ];
  if (perp) {
    items.push(
      {
        label: "Mark vs index",
        value: live.basis == null ? "—" : signedPct(live.basis, 3),
        sub: `${price(live.markPrice)} vs ${price(live.indexPrice)}`,
      },
      { label: "Open interest", value: live.openInterestUsd == null ? "—" : usd(live.openInterestUsd) },
      {
        label: "Funding now",
        value: live.fundingAnnual == null ? "—" : `${smallSignedPct(live.fundingAnnual)} APR`,
        sub: minsToFunding == null ? undefined : `Next payment in ${minsToFunding} min`,
      },
    );
  }

  return (
    <Card className="mt-6 p-4">
      <div className="flex items-center gap-2 mb-3">
        <span className="w-1.5 h-1.5 rounded-full" style={{ background: "var(--green)" }} />
        <span className="tag" style={{ color: "var(--text-muted)" }}>
          LIVE · REFRESHES EVERY 15 SECONDS
        </span>
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
        {items.map((it) => (
          <div key={it.label} className="flex flex-col gap-1 min-w-0">
            <span className="text-[11.5px]" style={{ color: "var(--text-muted)" }}>{it.label}</span>
            <span className="text-[17px] font-semibold tracking-tight truncate" style={{ color: "var(--text)" }}>{it.value}</span>
            {it.sub && <span className="text-[11px] mono truncate" style={{ color: "var(--text-faint)" }}>{it.sub}</span>}
          </div>
        ))}
      </div>
    </Card>
  );
}

function Liquidity({ live }: { live: LiveMarket }) {
  const cost = (v: number | null) => (v == null ? "Can't fill" : bps(v));
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
      <Card className="p-4">
        <div className="flex items-baseline justify-between mb-3">
          <span className="text-[13px] font-semibold" style={{ color: "var(--text)" }}>Cost to trade now</span>
          <span className="mono text-[12px]" style={{ color: "var(--text-muted)" }}>
            spread {live.spread == null ? "—" : bps(live.spread)}
          </span>
        </div>
        <table className="w-full text-[12.5px]">
          <thead>
            <tr style={{ color: "var(--text-faint)" }}>
              <th className="text-left font-normal py-1">Order size</th>
              <th className="text-right font-normal py-1">Market buy</th>
              <th className="text-right font-normal py-1">Market sell</th>
            </tr>
          </thead>
          <tbody className="mono" style={{ fontVariantNumeric: "tabular-nums" }}>
            {live.slippage.map((s) => (
              <tr key={s.size} style={{ borderTop: "1px solid var(--border-subtle)" }}>
                <td className="py-2" style={{ color: "var(--text)" }}>{usd(s.size, 0)}</td>
                <td className="py-2 text-right" style={{ color: "var(--text-muted)" }}>{cost(s.buy)}</td>
                <td className="py-2 text-right" style={{ color: "var(--text-muted)" }}>{cost(s.sell)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="text-[11px] mt-3" style={{ color: "var(--text-faint)" }}>
          Average fill against the mid price, walking the live order book. &ldquo;Can&apos;t fill&rdquo; means the 500 price levels
          shown run out first. Fees come on top.
        </p>
      </Card>

      <Card className="p-4">
        <span className="text-[13px] font-semibold" style={{ color: "var(--text)" }}>Depth near the price</span>
        <table className="w-full text-[12.5px] mt-3">
          <thead>
            <tr style={{ color: "var(--text-faint)" }}>
              <th className="text-left font-normal py-1">Within</th>
              <th className="text-right font-normal py-1">Bids</th>
              <th className="text-right font-normal py-1">Asks</th>
            </tr>
          </thead>
          <tbody className="mono" style={{ fontVariantNumeric: "tabular-nums" }}>
            {live.depth.map((d) => (
              <tr key={d.within} style={{ borderTop: "1px solid var(--border-subtle)" }}>
                <td className="py-2" style={{ color: "var(--text)" }}>±{pct(d.within, 1)}</td>
                <td className="py-2 text-right" style={{ color: "var(--text-muted)" }}>{usd(d.bidUsd)}</td>
                <td className="py-2 text-right" style={{ color: "var(--text-muted)" }}>{usd(d.askUsd)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="text-[11px] mt-3" style={{ color: "var(--text-faint)" }}>
          Dollars resting on each side within that distance of the mid price.
          {live.makerFee != null && live.takerFee != null && ` Fees here: ${pct(live.makerFee, 3)} maker, ${pct(live.takerFee, 3)} taker.`}
          {live.maxLeverage ? ` Up to ${live.maxLeverage}× leverage.` : ""}
        </p>
      </Card>
    </div>
  );
}

export function MarketView({ slug }: { slug: string }) {
  const [win] = useAnalyticsWindow();
  const history = useApi<MarketHistory>(`/api/analytics/market/${slug}?window=${win}`, HISTORY_TTL);
  const live = useApi<LiveMarket>(`/api/analytics/market/${slug}/live`, LIVE_MS, LIVE_MS);
  // Who is trading this market, from the live collector (24 hours).
  const flow = useApi<LiveResult>(`/api/analytics/live?view=flow&hours=24&market=${slug.replace("_", "%2F")}`, 30_000, 30_000);
  const compact = useCompact();
  const [trend, setTrend] = useState<TrendChart>("volume");

  const back = (
    <Link
      href={`/analytics/markets?w=${win}`}
      className="mt-6 inline-flex items-center gap-1.5 text-[12.5px]"
      style={{ color: "var(--text-muted)" }}
    >
      <ArrowLeft size={14} /> All markets
    </Link>
  );

  if (history.error && !history.data) {
    return (
      <>
        {back}
        <p className="mt-6 text-[13px]" style={{ color: "var(--red)" }}>{history.error}</p>
      </>
    );
  }
  if (!history.data) return <>{back}<TileSkeleton count={8} /></>;

  const d = history.data;
  const r = d.row;
  const perp = r.kind === "perp";

  const trendCharts: { key: TrendChart; tab: string; card: React.ReactNode }[] = [
    {
      key: "volume",
      tab: "Volume",
      card: (
        <ChartCard key="volume" title="Daily volume" figure={`avg ${usd(r.volume / d.days)}/day`}>
          <MiniChart
            label={`${r.symbol} daily volume`}
            kind="bar"
            phoneHeight={PHONE_CHART}
            points={d.series.map((s) => ({ date: s.date, value: s.volume }))}
            format={(v) => usd(v, 0)}
          />
        </ChartCard>
      ),
    },
    {
      key: "traders",
      tab: "Traders",
      card: (
        <ChartCard key="traders" title="Traders per day" figure={`avg ${r.tradersPerDay.toFixed(r.tradersPerDay >= 10 ? 0 : 1)}`}>
          <MiniChart
            label={`${r.symbol} distinct traders per day`}
            kind="bar"
            phoneHeight={PHONE_CHART}
            points={d.series.map((s) => ({ date: s.date, value: s.traders }))}
            format={(v) => count(v)}
          />
        </ChartCard>
      ),
    },
  ];
  if (perp) {
    trendCharts.push(
      {
        key: "oi",
        tab: "Open interest",
        card: (
          <ChartCard key="oi" title="Open interest" figure={r.oiNow == null ? "—" : `now ${usd(r.oiNow)}`}>
            <MiniChart
              label={`${r.symbol} open interest`}
              kind="line"
              phoneHeight={PHONE_CHART}
              points={d.series.map((s) => ({ date: s.date, value: s.oi }))}
              format={(v) => usd(v, 0)}
            />
          </ChartCard>
        ),
      },
      {
        key: "funding",
        tab: "Funding",
        card: (
          <ChartCard key="funding" title="Funding, annualised" figure={r.fundingAnnual == null ? "—" : `avg ${signedPct(r.fundingAnnual, 1)}`}>
            <MiniChart
              label={`${r.symbol} funding, annualised`}
              kind="line"
              signed
              phoneHeight={PHONE_CHART}
              points={d.series.map((s) => ({ date: s.date, value: s.fundingAnnual }))}
              format={(v) => signedPct(v, 0)}
            />
          </ChartCard>
        ),
      },
    );
  }
  // A spot market has no open interest or funding to switch to.
  const trendShown = trendCharts.find((c) => c.key === trend) ?? trendCharts[0];

  return (
    <div style={{ opacity: history.loading ? 0.55 : 1, transition: "opacity 0.2s" }} aria-busy={history.loading}>
      {back}

      <div className="mt-4 flex flex-wrap items-center gap-x-3 gap-y-2">
        <TokenIcon symbol={r.symbol} size={34} />
        <h2 className="text-[26px] sm:text-[32px] font-bold tracking-tight leading-none" style={{ color: "var(--text)", letterSpacing: "-0.02em" }}>
          {r.symbol}
        </h2>
        <KindBadge kind={r.kind} />
        <TierBadge tier={r.tier} />
        <span className="text-[12.5px]" style={{ color: "var(--text-muted)" }}>
          #{d.rank} of {d.ofMarkets} by volume
        </span>
      </div>

      {live.data && <LiveStrip live={live.data} />}

      <StatStrip className="mt-6 grid-cols-2 lg:grid-cols-4">
        <Tile
          label={`Volume · ${win}`}
          value={usd(r.volume)}
          sub={r.volumeChange == null ? `${pct(r.share, r.share < 0.01 ? 2 : 1)} of SoDEX` : `${growth(r.volumeChange)} vs prior ${win} · ${pct(r.share, r.share < 0.01 ? 2 : 1)} of SoDEX`}
        />
        <Tile label="Traders per day" value={r.tradersPerDay >= 10 ? Math.round(r.tradersPerDay).toLocaleString("en-US") : r.tradersPerDay.toFixed(1)} sub={`${count(r.trades)} trades in ${win}`} />
        <Tile
          label="Trades per trader"
          value={r.tradesPerTrader == null ? "—" : Math.round(r.tradesPerTrader).toLocaleString("en-US")}
          sub={`Per day · average trade ${r.avgTrade == null ? "—" : usd(r.avgTrade, 1)}`}
        />
        <Tile label={`Est. fees · ${win}`} value={r.fees == null ? "—" : usd(r.fees)} sub="At standard rates, so an upper bound" />
        {perp && (
          <>
            <Tile
              label="Open interest"
              value={r.oiNow == null ? "—" : usd(r.oiNow)}
              sub={r.oiChange == null ? undefined : `${growth(r.oiChange)} over ${win}`}
            />
            <Tile label="Daily turnover" value={r.turnover == null ? "—" : `${r.turnover.toFixed(r.turnover >= 10 ? 0 : 2)}×`} sub="Volume per day ÷ average open interest" />
            <Tile label={`Funding · ${win} avg`} value={r.fundingAnnual == null ? "—" : `${signedPct(r.fundingAnnual, 1)} APR`} sub={r.fundingAnnual == null ? undefined : r.fundingAnnual >= 0 ? "Longs paying shorts" : "Shorts paying longs"} />
            <Tile label="Days longs paid" value={r.fundingPositiveDays == null ? "—" : pct(r.fundingPositiveDays, 0)} sub={`Share of days in ${win} with positive funding`} />
          </>
        )}
      </StatStrip>

      {r.tier === "thin" && (
        <p className="mt-4 text-[12.5px] px-3 py-2 rounded-lg" style={{ background: "var(--bg-elevated)", color: "var(--text-muted)" }}>
          A thin market: about {r.tradersPerDay.toFixed(1)} traders a day
          {r.tradesPerTrader != null && `, making ${Math.round(r.tradesPerTrader).toLocaleString("en-US")} trades each`}.
        </p>
      )}

      <Section title="Trend">
        {compact ? (
          // One chart at a time on a phone.
          <div className="flex flex-col gap-3">
            <div>
              <PillTabs label="Chart" value={trendShown.key} onChange={setTrend} options={trendCharts.map((c) => ({ value: c.key, label: c.tab }))} />
            </div>
            {trendShown.card}
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">{trendCharts.map((c) => c.card)}</div>
        )}
      </Section>

      <Section title="Liquidity" kicker="What it costs to trade here right now, from the live order book.">
        {live.data ? (
          <Liquidity live={live.data} />
        ) : live.error ? (
          <p className="text-[13px]" style={{ color: "var(--text-faint)" }}>The live order book is unavailable right now.</p>
        ) : (
          <div className="h-[180px] rounded-[14px] animate-pulse" style={{ background: "var(--bg-elevated)" }} />
        )}
      </Section>

      {flow.data?.available && flow.data.totalVolume > 0 && (
        <>
          <Section title={`Who is trading ${r.symbol}`} kicker="Last 24 hours from the live collector, or since it started.">
            <GroupTable data={flow.data} />
          </Section>
          <Section title="Large trades" kicker={`Every ${r.symbol} trade of $50,000 or more.`}>
            <Tape data={flow.data} />
          </Section>
        </>
      )}

      <Section title="Positions and concentration" kicker="From our own collector: everyone holding this market, and how much of its trading comes from its busiest accounts.">
        <MarketPositioning symbol={r.symbol} />
      </Section>
    </div>
  );
}
