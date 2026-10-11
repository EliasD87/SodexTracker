"use client";

import { useState } from "react";
import type { MoneyBreakdown, MoneyFlow, MoneyResult, MoneySize } from "@/lib/moneyStore";
import type { Cohort } from "@/lib/liveStore";
import { count, growth, usd } from "@/lib/analyticsFormat";
import { MiniChart } from "@/components/analytics/MiniChart";
import { useAnalyticsWindow, useApi, useCompact, useExchangeAnalytics } from "@/components/analytics/hooks";
import { Card, ChartCard, NoData, Section, Tile, TileSkeleton, useRowLimit } from "@/components/analytics/ui";
import { GroupKey, PillTabs, TRADER_GROUP_RULES } from "@/components/analytics/kit";
import { TokenIcon } from "@/components/TokenIcon";

/**
 * Money in and out of SoDEX: every deposit and withdrawal, read from each
 * account's ledger by the collector. Totals only; no address, account or
 * transaction is ever shown.
 */

const GROUP_LABEL: Record<Cohort, string> = {
  mm: "Market makers",
  smart: "Smart money",
  whale: "Big traders",
  retail: "Retail",
  unattributed: "Unattributed",
};

const TTL = 2 * 60_000;
const REFRESH = 5 * 60_000;
/** Plot height on a phone, where full-height charts run the page long. */
const PHONE_CHART = 110;

type DayChart = "in" | "out" | "net" | "tvl";

/** Plain amount, with a dash for nothing at all. */
const amt = (n: number) => (n ? usd(n) : "—");
const signedUsd = (n: number) => `${n > 0 ? "+" : n < 0 ? "−" : ""}${usd(Math.abs(n))}`;
const tone = (n: number) => (n > 0 ? "var(--green)" : n < 0 ? "var(--red)" : "var(--text-muted)");
const vsPrior = (now: number, prev: number, win: string) => (prev > 0 ? `${growth(now / prev - 1)} vs prior ${win}` : `Prior ${win}: none`);
const clock = (ms: number) =>
  new Date(ms).toLocaleString("en-US", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit", hour12: false, timeZone: "UTC" });

function Coverage({ data, totalUsers }: { data: MoneyFlow; totalUsers: number | null }) {
  const c = data.coverage;
  // Measured against every SoDEX account when known, not just the ones mapped so far.
  const of = Math.max(c.accounts, totalUsers ?? 0);
  const complete = c.read >= of * 0.99;
  return (
    <div className="mt-6 flex flex-col gap-2">
      <p className="text-[12px] flex items-center gap-2 flex-wrap" style={{ color: "var(--text-muted)" }}>
        <span className="w-1.5 h-1.5 rounded-full" style={{ background: complete ? "var(--green)" : "var(--tier-niche)" }} aria-hidden />
        Ledgers read for {count(c.read)} of {count(of)} accounts
        {c.lastRead ? ` · last read ${clock(c.lastRead)} UTC` : ""}
      </p>
      {!complete && (
        <p className="text-[12.5px] px-3 py-2 rounded-lg" style={{ background: "var(--bg-elevated)", color: "var(--text-muted)" }}>
          Partial: only {((c.read / of) * 100).toFixed(c.read / of < 0.01 ? 2 : 1)}% of accounts have been read so far, so every figure
          below covers those accounts only. The first full read takes a day or two once the collector runs on the server.
        </p>
      )}
    </div>
  );
}

function BreakdownTable({ rows, label, icon }: { rows: MoneyBreakdown[]; label: string; icon?: boolean }) {
  const totalIn = rows.reduce((a, r) => a + r.in, 0);
  // Every row on a wider screen; the biggest few on a phone.
  const { shown, toggle } = useRowLimit(rows, rows.length, 6);
  return (
    <Card className="overflow-hidden">
      <table className="w-full text-[12.5px]">
        <thead>
          <tr style={{ color: "var(--text-faint)" }}>
            <th className="text-left font-normal px-3 sm:px-4 py-2.5">{label}</th>
            <th className="text-right font-normal px-2 py-2.5">In</th>
            <th className="text-right font-normal px-2 py-2.5">Out</th>
            <th className="text-right font-normal pl-2 pr-3 sm:px-2 py-2.5">Net</th>
            <th className="text-right font-normal px-4 py-2.5 hidden sm:table-cell" title="Share of all money deposited">
              Share in
            </th>
          </tr>
        </thead>
        <tbody className="mono" style={{ fontVariantNumeric: "tabular-nums" }}>
          {shown.map((r) => (
            <tr key={r.key} style={{ borderTop: "1px solid var(--border-subtle)" }}>
              <td className="px-3 sm:px-4 py-2 font-sans font-semibold" style={{ color: "var(--text)" }}>
                <span className="inline-flex items-center gap-2">
                  {icon && <TokenIcon symbol={r.key} size={18} />}
                  {r.key}
                </span>
              </td>
              <td className="px-2 py-2 text-right" style={{ color: "var(--text-muted)" }}>{amt(r.in)}</td>
              <td className="px-2 py-2 text-right" style={{ color: "var(--text-muted)" }}>{amt(r.out)}</td>
              <td className="pl-2 pr-3 sm:px-2 py-2 text-right" style={{ color: tone(r.net) }}>{r.net ? signedUsd(r.net) : "—"}</td>
              <td className="px-4 py-2 text-right hidden sm:table-cell" style={{ color: "var(--text-muted)" }}>
                {totalIn > 0 ? `${((r.in / totalIn) * 100).toFixed(1)}%` : "—"}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {toggle}
    </Card>
  );
}

function SizeTable({ rows }: { rows: MoneySize[] }) {
  return (
    <Card className="overflow-hidden">
      <table className="w-full text-[12.5px]">
        <thead>
          <tr style={{ color: "var(--text-faint)" }}>
            <th className="text-left font-normal px-3 sm:px-4 py-2.5">Size</th>
            <th className="text-right font-normal px-2 py-2.5 hidden sm:table-cell">Deposits</th>
            <th className="text-right font-normal px-2 py-2.5">Deposited</th>
            <th className="text-right font-normal px-2 py-2.5 hidden sm:table-cell">Withdrawals</th>
            <th className="text-right font-normal px-3 sm:px-4 py-2.5">Withdrawn</th>
          </tr>
        </thead>
        <tbody className="mono" style={{ fontVariantNumeric: "tabular-nums" }}>
          {rows.map((r) => (
            <tr key={r.key} style={{ borderTop: "1px solid var(--border-subtle)" }}>
              <td className="px-3 sm:px-4 py-2 font-sans" style={{ color: "var(--text)" }}>{r.key}</td>
              <td className="px-2 py-2 text-right hidden sm:table-cell" style={{ color: "var(--text-muted)" }}>{count(r.deposits)}</td>
              <td className="px-2 py-2 text-right" style={{ color: "var(--text-muted)" }}>{amt(r.depositUsd)}</td>
              <td className="px-2 py-2 text-right hidden sm:table-cell" style={{ color: "var(--text-muted)" }}>{count(r.withdrawals)}</td>
              <td className="px-3 sm:px-4 py-2 text-right" style={{ color: "var(--text-muted)" }}>{amt(r.withdrawUsd)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </Card>
  );
}

function GroupTable({ rows }: { rows: MoneyFlow["byGroup"] }) {
  return (
    <Card className="overflow-hidden">
      <table className="w-full text-[12.5px]">
        <thead>
          <tr style={{ color: "var(--text-faint)" }}>
            <th className="text-left font-normal px-3 sm:px-4 py-2.5">Group</th>
            <th className="text-right font-normal px-2 py-2.5 hidden sm:table-cell" title="Accounts that moved money either way">Accounts</th>
            <th className="text-right font-normal px-2 py-2.5">In</th>
            <th className="text-right font-normal px-2 py-2.5">Out</th>
            <th className="text-right font-normal px-3 sm:px-4 py-2.5">Net</th>
          </tr>
        </thead>
        <tbody className="mono" style={{ fontVariantNumeric: "tabular-nums" }}>
          {rows.map((r) => (
            <tr key={r.key} style={{ borderTop: "1px solid var(--border-subtle)" }}>
              <td className="px-3 sm:px-4 py-2 font-sans" style={{ color: "var(--text)" }}>{GROUP_LABEL[r.key as Cohort] ?? r.key}</td>
              <td className="px-2 py-2 text-right hidden sm:table-cell" style={{ color: "var(--text-muted)" }}>{count(r.accounts)}</td>
              <td className="px-2 py-2 text-right" style={{ color: "var(--text-muted)" }}>{amt(r.in)}</td>
              <td className="px-2 py-2 text-right" style={{ color: "var(--text-muted)" }}>{amt(r.out)}</td>
              <td className="px-3 sm:px-4 py-2 text-right" style={{ color: tone(r.net) }}>{r.net ? signedUsd(r.net) : "—"}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="px-3 sm:px-4 pb-4">
        <GroupKey rules={TRADER_GROUP_RULES} keys={rows.map((r) => r.key)} />
      </div>
    </Card>
  );
}

function Largest({ rows }: { rows: MoneyFlow["largest"] }) {
  const { shown, toggle } = useRowLimit(rows, 10, 6);
  if (!rows.length) return <p className="text-[13px]" style={{ color: "var(--text-faint)" }}>No deposits or withdrawals in this window yet.</p>;
  return (
    <Card className="overflow-hidden">
      <table className="w-full text-[12.5px]">
        <thead>
          <tr style={{ color: "var(--text-faint)" }}>
            <th className="text-left font-normal px-3 sm:px-4 py-2.5">Hour (UTC)</th>
            <th className="text-left font-normal px-2 py-2.5">Direction</th>
            <th className="text-right font-normal pl-2 pr-3 sm:px-2 py-2.5">About</th>
            <th className="text-left font-normal px-2 py-2.5 hidden sm:table-cell">Asset</th>
            <th className="text-left font-normal px-2 py-2.5 hidden md:table-cell">Chain</th>
            <th className="text-left font-normal px-4 py-2.5 hidden md:table-cell">Group</th>
          </tr>
        </thead>
        <tbody className="mono" style={{ fontVariantNumeric: "tabular-nums" }}>
          {shown.map((r, i) => (
            <tr key={`${r.hour}-${i}`} style={{ borderTop: "1px solid var(--border-subtle)" }}>
              <td className="px-3 sm:px-4 py-2" style={{ color: "var(--text-muted)" }}>{clock(r.hour)}</td>
              <td className="px-2 py-2 font-sans" style={{ color: r.direction === "in" ? "var(--green)" : "var(--red)" }}>
                {r.direction === "in" ? "Deposit" : "Withdrawal"}
              </td>
              <td className="pl-2 pr-3 sm:px-2 py-2 text-right" style={{ color: "var(--text)" }}>{usd(r.usd)}</td>
              <td className="px-2 py-2 font-sans hidden sm:table-cell" style={{ color: "var(--text-muted)" }}>
                <span className="inline-flex items-center gap-2">
                  <TokenIcon symbol={r.coin} size={16} />
                  {r.coin}
                </span>
              </td>
              <td className="px-2 py-2 font-sans hidden md:table-cell" style={{ color: "var(--text-muted)" }}>{r.chain}</td>
              <td className="px-4 py-2 font-sans hidden md:table-cell" style={{ color: "var(--text-muted)" }}>{GROUP_LABEL[r.group]}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {toggle}
    </Card>
  );
}

export function MoneyFlowView() {
  const [win] = useAnalyticsWindow();
  const { data, loading, error } = useApi<MoneyResult>(`/api/analytics/money?window=${win}`, TTL, REFRESH);
  const exchange = useExchangeAnalytics(win).data;
  const compact = useCompact();
  const [dayChart, setDayChart] = useState<DayChart>("in");

  if (error && !data) return <p className="mt-10 text-[13px]" style={{ color: "var(--red)" }}>{error}</p>;
  if (!data) return <TileSkeleton count={8} />;

  if (!data.available) {
    return (
      <Section title="Money in and out" kicker="Every deposit and withdrawal on SoDEX, by day, chain, asset, size and trader group.">
        <NoData title="Deposits and withdrawals" reason={data.reason} />
      </Section>
    );
  }

  const t = data.totals;
  const p = data.prev;
  const series = (key: "in" | "out") => data.series.map((s) => ({ date: s.date, value: s[key] }));
  // Deposits and withdrawals share one scale, so their bars compare honestly.
  const top = Math.max(1, ...data.series.map((s) => Math.max(s.in, s.out)));

  // TVL moves with net deposits plus everything else: trading results, funding,
  // fees and the price of non-dollar holdings. Shown only when the ledger read
  // is complete, since a partial net flow would misattribute the difference.
  const tvl = exchange?.series.filter((s) => s.tvl != null) ?? [];
  const tvlNow = exchange?.headline.tvlNow ?? null;
  const tvlStart = tvl.length ? tvl[0].tvl : null;
  const tvlChange = tvlNow != null && tvlStart != null ? tvlNow - tvlStart : null;
  const totalUsers = exchange?.headline.totalUsers ?? null;
  const complete = data.coverage.read >= Math.max(data.coverage.accounts, totalUsers ?? 0) * 0.99;

  const dayCharts: { key: DayChart; tab: string; card: React.ReactNode }[] = [
    {
      key: "in",
      tab: "Deposits",
      card: (
        <ChartCard key="in" title="Deposits" figure={usd(t.in)}>
          <MiniChart label="Deposits per day" kind="bar" phoneHeight={PHONE_CHART} points={series("in")} domain={[0, top]} color="var(--green)" format={(v) => usd(v)} />
        </ChartCard>
      ),
    },
    {
      key: "out",
      tab: "Withdrawals",
      card: (
        <ChartCard key="out" title="Withdrawals" figure={usd(t.out)}>
          <MiniChart label="Withdrawals per day" kind="bar" phoneHeight={PHONE_CHART} points={series("out")} domain={[0, top]} color="var(--red)" format={(v) => usd(v)} />
        </ChartCard>
      ),
    },
    {
      key: "net",
      tab: "Net flow",
      card: (
        <ChartCard key="net" title="Net flow" figure={signedUsd(t.net)}>
          <MiniChart
            label="Net flow per day"
            kind="bar"
            signed
            phoneHeight={PHONE_CHART}
            points={data.series.map((s) => ({ date: s.date, value: s.net }))}
            color="var(--green)"
            negativeColor="var(--red)"
            format={signedUsd}
          />
        </ChartCard>
      ),
    },
    {
      key: "tvl",
      tab: "TVL",
      card: (
        <ChartCard key="tvl" title="TVL" figure={tvlNow == null ? "—" : usd(tvlNow)} note="Everything deposited on SoDEX, daily">
          <MiniChart
            label="Total value locked"
            kind="line"
            fitDomain
            phoneHeight={PHONE_CHART}
            points={tvl.map((s) => ({ date: s.date, value: s.tvl }))}
            format={(v) => usd(v)}
          />
        </ChartCard>
      ),
    },
  ];

  return (
    <div style={{ opacity: loading ? 0.55 : 1, transition: "opacity 0.2s" }} aria-busy={loading}>
      <Coverage data={data} totalUsers={totalUsers} />

      <div className="mt-6 grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Tile label={`Money in · ${win}`} value={usd(t.in)} sub={vsPrior(t.in, p.in, win)} />
        <Tile label={`Money out · ${win}`} value={usd(t.out)} sub={vsPrior(t.out, p.out, win)} />
        <Tile label="Net flow" value={signedUsd(t.net)} valueColor={tone(t.net)} sub={`Prior ${win}: ${signedUsd(p.net)}`} />
        <Tile
          label="TVL now"
          value={tvlNow == null ? "—" : usd(tvlNow)}
          sub={
            tvlChange == null
              ? "Total value locked"
              : complete
                ? `${signedUsd(tvlChange)} over ${win}: ${signedUsd(t.net)} net deposits, ${signedUsd(tvlChange - t.net)} trading and prices`
                : `${signedUsd(tvlChange)} over ${win}`
          }
        />
        <Tile label="Depositors" value={count(t.depositors)} sub={`${count(t.deposits)} deposits`} />
        <Tile label="Withdrawers" value={count(t.withdrawers)} sub={`${count(t.withdrawals)} withdrawals`} />
        <Tile label="First-time depositors" value={count(data.firstTimeDepositors)} sub="First deposit ever, in this window" />
        <Tile label="Median deposit" value={data.medianDeposit == null ? "—" : usd(data.medianDeposit)} sub="Half of deposits are smaller" />
      </div>
      {(data.today.in > 0 || data.today.out > 0) && (
        <p className="mt-3 text-[12px]" style={{ color: "var(--text-faint)" }}>
          Today so far (UTC, not in the figures above): {usd(data.today.in)} in, {usd(data.today.out)} out.
        </p>
      )}

      <Section title="Day by day" kicker="Deposits and withdrawals share one scale. Net flow is green on days more came in than went out.">
        {compact ? (
          // One chart at a time on a phone, picked from a sideways row.
          <div className="flex flex-col gap-3">
            <div>
              <PillTabs label="Chart" value={dayChart} onChange={setDayChart} options={dayCharts.map((c) => ({ value: c.key, label: c.tab }))} />
            </div>
            {dayCharts.find((c) => c.key === dayChart)?.card}
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">{dayCharts.map((c) => c.card)}</div>
        )}
      </Section>

      <Section title="Where it comes from" kicker="The chain money arrived on or left to, and the asset it moved in.">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
          <BreakdownTable rows={data.byChain} label="Chain" />
          <BreakdownTable rows={data.byCoin} label="Asset" icon />
        </div>
        {data.coverage.unpriced > 0 && (
          <p className="text-[11px] mt-2" style={{ color: "var(--text-faint)" }}>
            {count(data.coverage.unpriced)} movement{data.coverage.unpriced === 1 ? "" : "s"} in an asset SoDEX has no market for, so not valued in dollars.
          </p>
        )}
      </Section>

      <Section title="Who moves it" kicker="By size of movement, and by trader group. Groups are today's labels.">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
          <SizeTable rows={data.bySize} />
          <GroupTable rows={data.byGroup} />
        </div>
      </Section>

      <Section title="Largest movements" kicker="The twenty biggest in the window, rounded to the hour and to two figures.">
        <Largest rows={data.largest} />
      </Section>

    </div>
  );
}
