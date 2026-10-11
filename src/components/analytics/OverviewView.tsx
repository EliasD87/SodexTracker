"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { count, growth, marketSlug, pct, signedPct, usd } from "@/lib/analyticsFormat";
import type { Delta, ExchangeAnalytics, MarketRow, SeriesPoint, WindowKey } from "@/lib/exchangeAnalytics";
import type { LiveTraders, TraderInsights } from "@/lib/liveStore";
import type { MoneyResult } from "@/lib/moneyStore";
import type { PositionsResult } from "@/lib/positionStore";
import { MiniChart } from "@/components/analytics/MiniChart";
import { TierBars } from "@/components/analytics/TierBars";
import { useAnalyticsWindow, useApi, useCompact, useExchangeAnalytics } from "@/components/analytics/hooks";
import { GridSkeleton } from "@/components/analytics/ui";
import { BiasTag, DeltaPill, DetailsLink, Figure, Panel, PillTabs, SegmentMeter, SplitBar } from "@/components/analytics/kit";
import { TokenIcon } from "@/components/TokenIcon";

/**
 * Overview: the whole exchange on one screen, as a grid of cards that each
 * open into a tab. Volume, trades, users, open interest and funding come from
 * SoDEX's daily statistics; traders, positioning and money flow come live from
 * our own collector.
 */

const change = (d: Delta | null | undefined) => (d && d.prev ? d.value / d.prev - 1 : null);
const signedUsd = (n: number) => `${n > 0 ? "+" : n < 0 ? "−" : ""}${usd(Math.abs(n))}`;
const weekday = (iso: string) => new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-US", { weekday: "short", timeZone: "UTC" });
const dayLabel = (iso: string) => new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
const LONG = "var(--green)";
const SHORT = "var(--red)";

type Live<T> = T | { available: false; reason: string };

/** A label and its figure on one line, with an optional note on the right. */
function StatRow({ label, value, note }: { label: React.ReactNode; value: React.ReactNode; note?: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3 py-2 text-[13px]" style={{ borderTop: "1px solid var(--border-subtle)" }}>
      <span className="min-w-0 truncate" style={{ color: "var(--text-muted)" }}>
        {label}
      </span>
      <span className="flex items-center gap-3 shrink-0">
        <span className="mono tabular-nums" style={{ color: "var(--text)" }}>
          {value}
        </span>
        {note !== undefined && <span className="w-[54px] flex justify-end">{note}</span>}
      </span>
    </div>
  );
}

/** What a live card says while the collector is still filling it. */
function Pending({ reason, height = 160 }: { reason?: string; height?: number }) {
  if (!reason) return <div className="animate-pulse rounded-[12px]" style={{ height, background: "var(--bg-elevated)" }} />;
  return (
    <div className="flex items-center justify-center text-center px-6 rounded-[12px]" style={{ height, background: "var(--bg-elevated)" }}>
      <p className="text-[12.5px] max-w-[260px]" style={{ color: "var(--text-muted)" }}>
        {reason}
      </p>
    </div>
  );
}

/**
 * Columns of dots, one per day, filled to that day's share of the busiest
 * day. The busiest one is solid and named.
 */
function DotColumns({ points, format }: { points: { date: string; value: number }[]; format: (v: number) => string }) {
  const ROWS = 7;
  const max = Math.max(...points.map((p) => p.value), 1e-9);
  const peak = points.reduce((best, p, i) => (p.value > points[best].value ? i : best), 0);
  return (
    <div className="relative pt-8" role="img" aria-label={`Busiest day ${dayLabel(points[peak].date)}: ${format(points[peak].value)}`}>
      <div className="flex items-end justify-between gap-[3px]">
        {points.map((p, i) => {
          const n = p.value > 0 ? Math.max(1, Math.round((p.value / max) * ROWS)) : 0;
          return (
            <div key={p.date} className="relative flex-1 flex flex-col-reverse items-center gap-[3px]" title={`${dayLabel(p.date)}: ${format(p.value)}`}>
              {Array.from({ length: ROWS }, (_, k) => (
                <span
                  key={k}
                  className="w-[7px] h-[7px] rounded-full"
                  style={{
                    background:
                      k < n ? (i === peak ? "var(--text)" : "color-mix(in srgb, var(--text) 30%, transparent)") : "var(--bg-elevated)",
                  }}
                />
              ))}
              {i === peak && (
                <span
                  className="absolute -top-7 left-1/2 -translate-x-1/2 text-[10.5px] font-medium px-1.5 py-[3px] rounded-[6px] whitespace-nowrap"
                  style={{ background: "var(--bg-elevated)", color: "var(--text)" }}
                >
                  Peak: {weekday(p.date)}
                </span>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

/** Volume a market needs, now and before, for its change to mean something. */
const moverFloor = (data: ExchangeAnalytics) => Math.max(1_000_000, data.headline.volume.value * 0.0005);

/**
 * Markets whose volume change is worth showing: big enough now, and already
 * trading in the prior window, so a listing that went from nothing to
 * something doesn't read as a 137× surge.
 */
function movers(data: ExchangeAnalytics) {
  const floor = moverFloor(data);
  return data.markets.filter(
    (m): m is MarketRow & { volumeChange: number } => m.volumeChange != null && m.volume >= floor && m.volume / (1 + m.volumeChange) >= floor / 4,
  );
}

/* ── Row 1: volume, traders, open interest ─────────────────────────────── */

function VolumeCard({ data, win }: { data: ExchangeAnalytics; win: WindowKey }) {
  const h = data.headline;
  const total = h.perpsVolume + h.spotVolume || 1;
  return (
    <Panel title="Volume" right={<DetailsLink href={`/analytics/markets?w=${win}`} />} className="lg:col-span-4">
      <div className="flex items-center gap-2 flex-wrap">
        <Figure>{usd(h.volume.value)}</Figure>
        <DeltaPill value={change(h.volume)} title={`vs the prior ${win}`} />
      </div>
      <p className="mt-1.5 text-[12px]" style={{ color: "var(--text-faint)" }}>
        {usd(h.volume.value / data.days)} a day over {win}
      </p>
      <div className="mt-3 -mx-1">
        <MiniChart label="Daily volume" kind="bar" height={96} points={data.series.map((p) => ({ date: p.date, value: p.volume }))} format={(v) => usd(v, 0)} />
      </div>
      <div className="mt-2">
        <StatRow label="Perps" value={usd(h.perpsVolume)} note={<span className="mono text-[12px]" style={{ color: "var(--text-faint)" }}>{pct(h.perpsVolume / total, 0)}</span>} />
        <StatRow label="Spot" value={usd(h.spotVolume)} note={<span className="mono text-[12px]" style={{ color: "var(--text-faint)" }}>{pct(h.spotVolume / total, 0)}</span>} />
        <StatRow label="Average trade" value={usd(h.avgTrade.value, 0)} note={<DeltaPill value={change(h.avgTrade)} />} />
      </div>
    </Panel>
  );
}

const GROUPS: { key: string; label: string; color: string; cohorts: string[] }[] = [
  { key: "retail", label: "Retail", color: "var(--tier-active)", cohorts: ["retail"] },
  { key: "mm", label: "Market makers", color: "var(--text-muted)", cohorts: ["mm"] },
  { key: "big", label: "Big & smart", color: "var(--tier-niche)", cohorts: ["whale", "smart"] },
];

function TradersCard({ data, win }: { data: ExchangeAnalytics; win: WindowKey }) {
  const live = useApi<Live<LiveTraders>>("/api/analytics/live?view=traders", 60_000, 60_000).data;
  const insights = useApi<Live<TraderInsights>>("/api/analytics/live?view=insights", 120_000, 300_000).data;
  const today = live?.available ? live.days[live.days.length - 1] : null;
  const yesterday = live?.available && live.days.length > 2 ? live.days[live.days.length - 2] : null;
  const groups = insights?.available
    ? GROUPS.map((g) => {
        const rows = insights.groups.filter((r) => g.cohorts.includes(r.cohort));
        return { ...g, share: rows.reduce((a, r) => a + r.share, 0), accounts: rows.reduce((a, r) => a + r.accounts, 0) };
      })
    : null;

  return (
    <Panel title="Traders" live right={<DetailsLink href={`/analytics/traders?w=${win}`} />} className="lg:col-span-4">
      {!today ? (
        <Pending reason={live && !live.available ? live.reason : undefined} height={236} />
      ) : (
        <>
          <div className="flex items-center gap-2 flex-wrap">
            <Figure>{count(today.traders)}</Figure>
            <span className="text-[12px]" style={{ color: "var(--text-muted)" }}>
              active today
            </span>
          </div>
          <p className="mt-1.5 text-[12px]" style={{ color: "var(--text-faint)" }}>
            {yesterday ? `${count(yesterday.traders)} yesterday · ` : ""}
            {data.headline.totalUsers ? `${count(data.headline.totalUsers)} accounts in total` : ""}
          </p>

          {groups && (
            <>
              <div className="mt-5 pt-4 grid grid-cols-3" style={{ borderTop: "1px solid var(--border-subtle)" }}>
                {groups.map((g, i) => (
                  <div key={g.key} className="flex flex-col min-w-0 px-3 first:pl-0 last:pr-0" style={{ borderLeft: i ? "1px solid var(--border-subtle)" : undefined }}>
                    <span className="text-[12px] truncate" style={{ color: "var(--text-muted)" }}>
                      {g.label}
                    </span>
                    <span className="mt-1.5 text-[20px] font-semibold leading-none tabular-nums" style={{ color: "var(--text)", letterSpacing: "-0.02em" }}>
                      {pct(g.share, 0)}
                    </span>
                    <span className="mt-auto pt-6 sm:pt-10 text-[11.5px] mono" style={{ color: "var(--text-faint)" }}>
                      {count(g.accounts)} acct{g.accounts === 1 ? "" : "s"}
                    </span>
                    <span className="mt-2 h-[5px] rounded-full" style={{ background: g.color }} />
                  </div>
                ))}
              </div>
              <p className="mt-3 text-[11.5px]" style={{ color: "var(--text-faint)" }}>
                Share of volume by trader group, last 7 days
              </p>
            </>
          )}
        </>
      )}
    </Panel>
  );
}

function OpenInterestCard({ data, win }: { data: ExchangeAnalytics; win: WindowKey }) {
  const h = data.headline;
  const funding = h.fundingAnnual;
  return (
    <Panel title="Open interest" right={<DetailsLink href={`/analytics/funding?w=${win}`} />} className="md:col-span-2 lg:col-span-4">
      <div className="flex items-center gap-2 flex-wrap">
        <Figure>{h.oiNow != null ? usd(h.oiNow) : "—"}</Figure>
        <DeltaPill value={change(h.oiAvg)} title={`Average open interest vs the prior ${win}`} />
      </div>
      <p className="mt-1.5 text-[12px]" style={{ color: "var(--text-faint)" }}>
        Open positions across every perp, now
      </p>
      <div className="mt-4">
        <StatRow label="Open interest per $1 deposited" value={h.oiToTvl != null ? `${h.oiToTvl.toFixed(2)}×` : "—"} />
        <StatRow
          label="Funding, a year"
          value={<span style={{ color: funding == null ? "var(--text-faint)" : funding >= 0 ? "var(--green)" : "var(--red)" }}>{funding != null ? signedPct(funding) : "—"}</span>}
        />
        <StatRow label="Total value locked" value={h.tvlNow != null ? usd(h.tvlNow) : "—"} />
      </div>
      <div className="mt-2 -mx-1">
        <MiniChart label="Open interest" kind="line" height={84} fitDomain points={data.series.map((p) => ({ date: p.date, value: p.oi }))} format={(v) => usd(v, 0)} />
      </div>
    </Panel>
  );
}

/* ── Row 2: trend and market share ─────────────────────────────────────── */

type Metric = "volume" | "oi" | "fees" | "users" | "tvl" | "funding";
const METRICS: { value: Metric; label: string }[] = [
  { value: "volume", label: "Volume" },
  { value: "oi", label: "Open interest" },
  { value: "fees", label: "Fees" },
  { value: "users", label: "New users" },
  { value: "tvl", label: "TVL" },
  { value: "funding", label: "Funding" },
];

function TrendCard({ data, win }: { data: ExchangeAnalytics; win: WindowKey }) {
  const [metric, setMetric] = useState<Metric>("volume");
  const compact = useCompact();
  const h = data.headline;
  const spec: Record<Metric, { kind: "bar" | "line"; pick: (p: SeriesPoint) => number | null; figure: string; format: (v: number) => string; signed?: boolean; fit?: boolean }> = {
    volume: { kind: "bar", pick: (p) => p.volume, figure: `avg ${usd(h.volume.value / data.days)} a day`, format: (v) => usd(v, 0) },
    oi: { kind: "line", pick: (p) => p.oi, figure: h.oiNow != null ? `now ${usd(h.oiNow)}` : "—", format: (v) => usd(v, 0), fit: true },
    fees: { kind: "bar", pick: (p) => p.fees, figure: h.fees ? `avg ${usd(h.fees.value / data.days)} a day` : "—", format: (v) => usd(v, 0) },
    users: { kind: "bar", pick: (p) => p.newUsers, figure: `${count(h.newUsers.value)} in ${win}`, format: (v) => count(v) },
    tvl: { kind: "line", pick: (p) => p.tvl, figure: h.tvlNow != null ? `now ${usd(h.tvlNow)}` : "—", format: (v) => usd(v, 0), fit: true },
    funding: { kind: "bar", pick: (p) => p.fundingAnnual, figure: h.fundingAnnual != null ? `${signedPct(h.fundingAnnual)} a year` : "—", format: (v) => signedPct(v), signed: true },
  };
  const m = spec[metric];
  const label = METRICS.find((x) => x.value === metric)!.label;
  return (
    <Panel title="Trend" sub={`${label} · ${m.figure}`} right={<PillTabs label="Measure" value={metric} onChange={setMetric} options={METRICS} />} className="md:col-span-2 lg:col-span-8">
      <MiniChart
        key={metric}
        label={label}
        kind={m.kind}
        height={compact ? 180 : 248}
        points={data.series.map((p) => ({ date: p.date, value: m.pick(p) }))}
        format={m.format}
        signed={m.signed}
        fitDomain={m.fit}
        color={m.signed ? "var(--div-pos)" : undefined}
        negativeColor={m.signed ? "var(--div-neg)" : undefined}
      />
    </Panel>
  );
}

const SHARE_COLORS = ["var(--text)", "var(--tier-active)", "var(--tier-niche)"];

function MarketShareCard({ data, win }: { data: ExchangeAnalytics; win: WindowKey }) {
  const top = [...data.markets].sort((a, b) => b.volume - a.volume).slice(0, 5);
  const lead = top[0];
  const rest = Math.max(0, 1 - top.slice(0, 3).reduce((a, m) => a + m.share, 0));
  if (!lead) return null;
  return (
    <Panel title="Market share" right={<DetailsLink href={`/analytics/markets?w=${win}`}>All markets</DetailsLink>} className="md:col-span-2 lg:col-span-4">
      <div className="flex items-center gap-2 flex-wrap">
        <Figure>{pct(lead.share, 0)}</Figure>
        <span className="inline-flex items-center gap-1.5 text-[12.5px] font-medium" style={{ color: "var(--text-muted)" }}>
          <TokenIcon symbol={lead.symbol} size={16} />
          {lead.symbol}
        </span>
      </div>
      <div className="mt-4">
        <SplitBar
          height={8}
          parts={[
            ...top.slice(0, 3).map((m, i) => ({ label: m.symbol.replace(/-USD$/, ""), value: m.share, color: SHARE_COLORS[i] })),
            { label: "Others", value: rest, color: "var(--border)" },
          ]}
        />
      </div>
      <table className="w-full mt-4 text-[12.5px]">
        <thead>
          <tr style={{ color: "var(--text-faint)" }}>
            <th className="text-left font-normal pb-1.5">Market</th>
            <th className="text-right font-normal pb-1.5">Share</th>
            <th className="text-right font-normal pb-1.5">Volume</th>
          </tr>
        </thead>
        <tbody className="mono tabular-nums">
          {top.map((m) => (
            <tr key={m.symbol} style={{ borderTop: "1px solid var(--border-subtle)" }}>
              <td className="py-2 font-sans">
                <Link href={`/analytics/markets/${marketSlug(m.symbol)}?w=${win}`} className="inline-flex items-center gap-2 font-medium hover:underline underline-offset-2" style={{ color: "var(--text)" }}>
                  <TokenIcon symbol={m.symbol} size={16} />
                  {m.symbol}
                </Link>
              </td>
              <td className="py-2 text-right" style={{ color: "var(--text-muted)" }}>{pct(m.share, 1)}</td>
              <td className="py-2 text-right" style={{ color: "var(--text)" }}>{usd(m.volume)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </Panel>
  );
}

/* ── Row 3: users, trades, and one highlight ───────────────────────────── */

function DotsCard({
  title,
  value,
  delta,
  win,
  points,
  format,
  href,
  foot,
}: {
  title: string;
  value: string;
  delta: number | null;
  win: WindowKey;
  points: { date: string; value: number }[];
  format: (v: number) => string;
  href: string;
  foot: React.ReactNode;
}) {
  return (
    <Panel title={title} right={<DetailsLink href={href} />} className="lg:col-span-4">
      <div className="flex items-center gap-2 flex-wrap">
        <Figure>{value}</Figure>
        <DeltaPill value={delta} title={`vs the prior ${win}`} />
      </div>
      <div className="mt-2">{points.length > 1 && <DotColumns points={points} format={format} />}</div>
      <p className="mt-4 text-[12px]" style={{ color: "var(--text-faint)" }}>
        {foot}
      </p>
    </Panel>
  );
}

/**
 * One figure worth knowing, picked from the data, on an inverted card. It
 * cycles through a few, and pauses while you read.
 */
function HighlightCard({ data, win }: { data: ExchangeAnalytics; win: WindowKey }) {
  const h = data.headline;
  const mover = movers(data).sort((a, b) => b.volumeChange - a.volumeChange)[0];
  const perps = data.markets.filter((m) => m.kind === "perp" && m.fundingPositiveDays != null);
  const longsPaid = perps.length ? perps.reduce((a, m) => a + (m.fundingPositiveDays ?? 0) * m.volume, 0) / (perps.reduce((a, m) => a + m.volume, 0) || 1) : null;

  const items = [
    mover && {
      kicker: "Fastest growing",
      figure: growth(mover.volumeChange),
      title: `${mover.symbol} volume against the prior ${win}`,
      body: `${usd(mover.volume)} traded, ${pct(mover.share, 1)} of SoDEX.`,
      href: `/analytics/markets/${marketSlug(mover.symbol)}?w=${win}`,
    },
    {
      kicker: "Concentration",
      figure: pct(h.top5Share, 0),
      title: "of all volume trades in the five biggest markets",
      body: `BTC and ETH alone are ${pct(h.btcEthShare, 0)}, across ${h.marketsTraded} markets traded.`,
      href: `/analytics/markets?w=${win}`,
    },
    longsPaid != null && {
      kicker: "Funding",
      figure: pct(longsPaid, 0),
      title: "of days longs paid shorts to hold",
      body: h.fundingAnnual != null ? `Funding averaged ${signedPct(h.fundingAnnual)} a year, weighted by open interest.` : "Weighted by each market's volume.",
      href: `/analytics/funding?w=${win}`,
    },
  ].filter(Boolean) as { kicker: string; figure: string; title: string; body: string; href: string }[];

  const [i, setI] = useState(0);
  const [paused, setPaused] = useState(false);
  useEffect(() => {
    if (paused || items.length < 2) return;
    const id = setInterval(() => setI((n) => (n + 1) % items.length), 7000);
    return () => clearInterval(id);
  }, [paused, items.length]);
  const it = items[i % items.length];

  return (
    <section
      className="lg:col-span-4 flex flex-col p-4 sm:p-5 min-h-[220px] sm:min-h-[260px]"
      style={{ background: "var(--text)", color: "var(--bg)", borderRadius: "var(--card-radius)" }}
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      aria-roledescription="carousel"
    >
      <span className="self-start text-[11.5px] font-medium px-2 py-1 rounded-[7px]" style={{ background: "color-mix(in srgb, var(--bg) 14%, transparent)" }}>
        {it.kicker}
      </span>
      <Link href={it.href} scroll={false} className="block mt-auto pt-6 sm:pt-8 group" aria-live="polite">
        <span className="block text-[38px] sm:text-[44px] font-semibold leading-none tabular-nums" style={{ letterSpacing: "-0.04em" }}>
          {it.figure}
        </span>
        <span className="block mt-3 text-[15px] font-medium leading-snug group-hover:underline underline-offset-2">{it.title}</span>
        <span className="block mt-2 text-[12.5px] leading-relaxed" style={{ opacity: 0.6 }}>
          {it.body}
        </span>
      </Link>
      {items.length > 1 && (
        <div className="mt-5 flex gap-1.5" role="tablist" aria-label="Highlights">
          {items.map((x, k) => (
            <button
              key={x.kicker}
              role="tab"
              aria-selected={k === i % items.length}
              aria-label={x.kicker}
              onClick={() => setI(k)}
              className="h-[3px] flex-1 rounded-full transition-opacity"
              style={{ background: "var(--bg)", opacity: k === i % items.length ? 0.9 : 0.25 }}
            />
          ))}
        </div>
      )}
    </section>
  );
}

/* ── Row 4: live positioning, money flow, volume calendar ──────────────── */

function PositioningCard() {
  const { data } = useApi<PositionsResult>("/api/analytics/positions", 30_000, 60_000);
  return (
    <Panel title="Positioning" live right={<DetailsLink href="/analytics/positions" />} className="lg:col-span-4">
      {!data || !data.available ? (
        <Pending reason={data && !data.available ? data.reason : undefined} height={220} />
      ) : (
        (() => {
          const t = data.totals;
          const all = t.longUsd + t.shortUsd;
          const leaning = [...data.bySize]
            .filter((g) => g.bias != null && g.holders > 0)
            .sort((a, b) => Math.abs(b.bias!) - Math.abs(a.bias!))
            .slice(0, 3);
          return (
            <>
              <div className="flex items-center justify-between gap-3 flex-wrap">
                <Figure>{all ? `${pct(t.longUsd / all, 0)} long` : "—"}</Figure>
                <BiasTag bias={t.bias} />
              </div>
              <div className="mt-4">
                <SplitBar
                  parts={[
                    { label: "Long", value: t.longUsd, color: LONG, note: usd(t.longUsd) },
                    { label: "Short", value: t.shortUsd, color: SHORT, note: usd(t.shortUsd) },
                  ]}
                />
              </div>
              <div className="mt-4 grid grid-cols-[1fr_auto] items-center gap-3">
                <SegmentMeter share={t.inProfit ?? 0} segments={24} color="var(--green)" />
                <span className="mono text-[12px]" style={{ color: "var(--text)" }}>
                  {t.inProfit == null ? "—" : `${pct(t.inProfit, 0)} in profit`}
                </span>
              </div>
              {leaning.length > 0 && (
                <div className="mt-3">
                  {leaning.map((g) => (
                    <StatRow key={g.key} label={g.label} value={<BiasTag bias={g.bias} />} />
                  ))}
                </div>
              )}
              <p className="mt-2 text-[11.5px]" style={{ color: "var(--text-faint)" }}>
                {count(data.coverage.holders)} accounts tracked
                {data.coverage.oiShare != null ? ` · ${pct(Math.min(1, data.coverage.oiShare), data.coverage.oiShare < 0.1 ? 1 : 0)} of open interest` : ""}
              </p>
            </>
          );
        })()
      )}
    </Panel>
  );
}

function MoneyFlowCard({ win }: { win: WindowKey }) {
  const { data } = useApi<MoneyResult>(`/api/analytics/money?window=${win}`, 120_000, 300_000);
  return (
    <Panel title="Money flow" live right={<DetailsLink href={`/analytics/flow?w=${win}`} />} className="lg:col-span-4">
      {!data || !data.available ? (
        <Pending reason={data && !data.available ? data.reason : undefined} height={220} />
      ) : (
        (() => {
          const t = data.totals;
          const max = Math.max(1, ...data.series.map((s) => Math.max(s.in, s.out)));
          const partial = data.coverage.read < data.coverage.accounts * 0.99;
          return (
            <>
              <div className="flex items-center gap-2 flex-wrap">
                <Figure color={t.net >= 0 ? "var(--green)" : "var(--red)"}>{signedUsd(t.net)}</Figure>
                <span className="text-[12px]" style={{ color: "var(--text-muted)" }}>
                  net · {win}
                </span>
              </div>
              {/* Daily in (up) and out (down) on one scale. */}
              <div className="mt-4 flex items-center gap-[2px] h-24" aria-label="Deposits and withdrawals per day">
                {data.series.map((s) => (
                  <div key={s.date} className="flex-1 h-full flex flex-col justify-center" title={`${s.date}: ${usd(s.in)} in, ${usd(s.out)} out`}>
                    <span className="flex-1 flex items-end">
                      <span className="w-full rounded-t-[2px]" style={{ height: `${(s.in / max) * 100}%`, background: LONG }} />
                    </span>
                    <span className="h-px" style={{ background: "var(--border)" }} />
                    <span className="flex-1 flex items-start">
                      <span className="w-full rounded-b-[2px]" style={{ height: `${(s.out / max) * 100}%`, background: SHORT }} />
                    </span>
                  </div>
                ))}
              </div>
              <div className="mt-3">
                <StatRow label="Deposited" value={usd(t.in)} note={<span className="text-[11.5px]" style={{ color: "var(--text-faint)" }}>{count(t.depositors)}</span>} />
                <StatRow label="Withdrawn" value={usd(t.out)} note={<span className="text-[11.5px]" style={{ color: "var(--text-faint)" }}>{count(t.withdrawers)}</span>} />
              </div>
              {partial && (
                <p className="mt-2 text-[11.5px]" style={{ color: "var(--text-faint)" }}>
                  Partial: {pct(data.coverage.read / Math.max(1, data.coverage.accounts), 0)} of ledgers read so far
                </p>
              )}
            </>
          );
        })()
      )}
    </Panel>
  );
}

/**
 * Daily volume as a calendar: one column a week, Monday on top, darker on
 * busier days. Always the last 90 days, whatever the window, so it has
 * enough weeks to show a rhythm.
 */
function CalendarCard() {
  const { data } = useExchangeAnalytics("90D");
  if (!data) return <Panel title="Volume by day" className="md:col-span-2 lg:col-span-4"><Pending height={200} /></Panel>;
  const days = data.series;
  const max = Math.max(...days.map((d) => d.volume), 1);
  const dow = (iso: string) => (new Date(`${iso}T00:00:00Z`).getUTCDay() + 6) % 7; // Monday 0
  const lead = days.length ? dow(days[0].date) : 0;
  const cells: (SeriesPoint | null)[] = [...Array.from({ length: lead }, () => null), ...days];
  const weeks: (SeriesPoint | null)[][] = [];
  for (let k = 0; k < cells.length; k += 7) weeks.push(cells.slice(k, k + 7));
  const best = days.reduce((a, d) => (d.volume > a.volume ? d : a), days[0]);
  return (
    <Panel title="Volume by day" sub="Last 90 days, one column a week" right={<DetailsLink href="/analytics/markets?w=90D" />} className="md:col-span-2 lg:col-span-4">
      <div className="flex gap-2">
        <div className="flex flex-col gap-[3px] text-[9.5px] mono pt-[1px]" style={{ color: "var(--text-faint)" }} aria-hidden>
          {["M", "", "W", "", "F", "", "S"].map((d, k) => (
            <span key={k} className="h-[14px] leading-[14px]">
              {d}
            </span>
          ))}
        </div>
        <div className="flex-1 flex gap-[3px] min-w-0" role="img" aria-label={`Daily volume for the last 90 days. Busiest: ${dayLabel(best.date)}, ${usd(best.volume)}.`}>
          {weeks.map((w, k) => (
            <div key={k} className="flex-1 flex flex-col gap-[3px] min-w-0">
              {Array.from({ length: 7 }, (_, r) => {
                const d = w[r];
                const s = d ? d.volume / max : 0;
                return (
                  <span
                    key={r}
                    className="h-[14px] rounded-[3px]"
                    title={d ? `${dayLabel(d.date)}: ${usd(d.volume)}` : undefined}
                    style={{
                      background: d ? `color-mix(in srgb, var(--tier-active) ${Math.round(12 + s * 88)}%, var(--bg-elevated))` : "transparent",
                    }}
                  />
                );
              })}
            </div>
          ))}
        </div>
      </div>
      <div className="mt-4 flex items-center justify-between gap-3 text-[11.5px]" style={{ color: "var(--text-faint)" }}>
        <span>
          Busiest: <span style={{ color: "var(--text)" }}>{dayLabel(best.date)}</span> · <span className="mono">{usd(best.volume)}</span>
        </span>
        <span className="flex items-center gap-1" aria-hidden>
          Less
          {[0.12, 0.4, 0.7, 1].map((v) => (
            <span key={v} className="w-[10px] h-[10px] rounded-[2px]" style={{ background: `color-mix(in srgb, var(--tier-active) ${Math.round(v * 100)}%, var(--bg-elevated))` }} />
          ))}
          More
        </span>
      </div>
    </Panel>
  );
}

/* ── Row 5: movers and tiers ───────────────────────────────────────────── */

function MoversCard({ data, win }: { data: ExchangeAnalytics; win: WindowKey }) {
  const [dir, setDir] = useState<"up" | "down">("up");
  const floor = moverFloor(data);
  const rows = movers(data)
    .sort((a, b) => (dir === "up" ? b.volumeChange - a.volumeChange : a.volumeChange - b.volumeChange))
    .slice(0, 6);
  return (
    <Panel
      title="Biggest movers"
      sub={`Volume vs the prior ${win}, markets over ${usd(floor)}`}
      right={
        <PillTabs
          label="Direction"
          value={dir}
          onChange={setDir}
          options={[
            { value: "up", label: "Up" },
            { value: "down", label: "Down" },
          ]}
        />
      }
      className="lg:col-span-6"
    >
      {rows.length === 0 && (
        <p className="py-6 text-[12.5px]" style={{ color: "var(--text-faint)" }}>
          No market moved enough to list.
        </p>
      )}
      {rows.map((m) => (
        <StatRow
          key={m.symbol}
          label={
            <Link href={`/analytics/markets/${marketSlug(m.symbol)}?w=${win}`} className="inline-flex items-center gap-2 font-medium hover:underline underline-offset-2" style={{ color: "var(--text)" }}>
              <TokenIcon symbol={m.symbol} size={16} />
              {m.symbol}
            </Link>
          }
          value={<span style={{ color: "var(--text-muted)" }}>{usd(m.volume)}</span>}
          note={<DeltaPill value={m.volumeChange} />}
        />
      ))}
    </Panel>
  );
}

/* ── Page ───────────────────────────────────────────────────────────────── */

export function OverviewView() {
  const [win] = useAnalyticsWindow();
  const { data, loading, error } = useExchangeAnalytics(win);

  if (error && !data) return <p className="mt-10 text-[13px]" style={{ color: "var(--red)" }}>{error}</p>;
  if (!data) return <GridSkeleton />;

  const h = data.headline;
  const recent = data.series.slice(-14);
  const missing = Object.entries(data.sources).filter(([, ok]) => !ok).map(([k]) => k);

  return (
    // A refetch holds the last render, dimmed, instead of flashing skeletons.
    <div style={{ opacity: loading ? 0.55 : 1, transition: "opacity 0.2s" }} aria-busy={loading}>
      {missing.length > 0 && (
        <p className="mt-6 text-[12px] px-3 py-2 rounded-lg" style={{ background: "var(--bg-elevated)", color: "var(--text-muted)" }}>
          Some SoDEX sources did not respond ({missing.join(", ")}). Figures that depend on them are left blank.
        </p>
      )}

      <div className="mt-3 sm:mt-4 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-12 gap-3 sm:gap-4">
        <VolumeCard data={data} win={win} />
        <TradersCard data={data} win={win} />
        <OpenInterestCard data={data} win={win} />

        <TrendCard data={data} win={win} />
        <MarketShareCard data={data} win={win} />

        <DotsCard
          title="New users"
          value={count(h.newUsers.value)}
          delta={change(h.newUsers)}
          win={win}
          href={`/analytics/traders?w=${win}`}
          points={recent.map((p) => ({ date: p.date, value: p.newUsers ?? 0 }))}
          format={(v) => `${count(v)} new users`}
          foot={h.totalUsers ? `${h.totalUsers.toLocaleString("en-US")} accounts in total · last 14 days shown` : "Last 14 days shown"}
        />
        <DotsCard
          title="Trades"
          value={count(h.trades.value)}
          delta={change(h.trades)}
          win={win}
          href={`/analytics/markets?w=${win}`}
          points={recent.map((p) => ({ date: p.date, value: p.trades }))}
          format={(v) => `${count(v)} trades`}
          foot={`Average trade ${usd(h.avgTrade.value, 0)} · last 14 days shown`}
        />
        <HighlightCard data={data} win={win} />

        <PositioningCard />
        <MoneyFlowCard win={win} />
        <CalendarCard />

        <MoversCard data={data} win={win} />
        <Panel title="Where the activity is" sub="Markets, trades and volume by how busy each market is" right={<DetailsLink href={`/analytics/markets?w=${win}`} />} className="lg:col-span-6">
          <TierBars data={data} bare />
        </Panel>
      </div>

      <details className="mt-8 sm:mt-10 text-[12.5px] leading-relaxed max-w-3xl" style={{ color: "var(--text-muted)" }}>
        <summary className="cursor-pointer font-semibold" style={{ color: "var(--text)" }}>
          How these figures are worked out
        </summary>
        <ul className="mt-3 flex flex-col gap-2 pl-4" style={{ listStyle: "disc" }}>
          <li>Volume, trades, fees, users, open interest, TVL and funding: SoDEX&apos;s own daily statistics. Days are UTC; today is left out until it is complete.</li>
          <li>Traders, positioning and money flow (marked with a green dot): our own collector, from every trade, every account&apos;s positions and deposit history.</li>
          <li>Tiers use average distinct traders per day: Active 50 or more, Niche 7 to 49, Thin 6 or fewer.</li>
          <li>Estimated fees are volume times each market&apos;s standard maker plus taker rate. VIP discounts and rebates bring the actual figure lower.</li>
          <li>Funding is annualised from the average rate, weighted by open interest. Positive means longs pay shorts.</li>
          <li>Comparisons are against the preceding window of the same length, shown only when that whole window is covered.</li>
        </ul>
      </details>
    </div>
  );
}
