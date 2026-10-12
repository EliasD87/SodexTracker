"use client";

import { useMemo, useState } from "react";
import { ChevronLeft, ChevronRight, ExternalLink } from "lucide-react";
import { pct } from "@/lib/analyticsFormat";
import { chainRows, dailyPnl, holdingRows, pnlByMarket, tradingRecord, walletWealth, type HoldingRow } from "@/lib/wallet/derive";
import type { ChartPoint } from "@/lib/wallet/api";
import { Figure, Panel, PillTabs, SegmentMeter, SplitBar } from "@/components/analytics/kit";
import { useRowLimit } from "@/components/analytics/ui";
import { TokenIcon } from "@/components/TokenIcon";
import { tickerLabel } from "@/lib/tokenIcons";
import type { WalletData } from "@/components/wallet/useWallet";
import { ago, duration, Empty, Failed, fmtAmount, fmtPrice, fmtUsd, LoadingDots, SidePill, signedUsd, Skeleton, Stat, tone } from "@/components/wallet/ui";

/* ── Trading record ─────────────────────────────────────────────────────── */

/** "the last 200 closed positions, since Sep 28": these cards only see recent history. */
function recentSpan(closed: { closedAt: number }[] | undefined): string {
  if (!closed?.length) return "recent closed positions";
  const since = Math.min(...closed.map((p) => p.closedAt));
  const date = new Date(since).toLocaleDateString("en-US", { month: "short", day: "numeric", year: since < Date.now() - 300 * 86_400_000 ? "numeric" : undefined });
  return `the last ${closed.length} closed positions, since ${date}`;
}

export function RecordCard({ w }: { w: WalletData }) {
  const closed = w.activity.data?.closed;
  const r = useMemo(() => (closed ? tradingRecord(closed) : null), [closed]);
  return (
    <Panel title="Recent trading record" sub={`From ${recentSpan(closed)}`} className="lg:col-span-7">
      {!w.activity.data ? (
        w.activity.error ? <Failed message={w.activity.error} /> : <Skeleton height={260} />
      ) : !r ? (
        <Empty>No closed positions yet.</Empty>
      ) : (
        <>
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <div className="text-[12px]" style={{ color: "var(--text-muted)" }}>
                Win rate
              </div>
              <Figure>{pct(r.winRate, 0)}</Figure>
            </div>
            <div className="flex-1 min-w-[180px] max-w-[320px]">
              <SegmentMeter share={r.winRate} segments={20} color="var(--green)" />
            </div>
          </div>
          <div className="mt-4 sm:mt-5 grid grid-cols-2 sm:grid-cols-3 gap-x-3 sm:gap-x-4 gap-y-3 sm:gap-y-4">
            <Stat label="Average win" value={signedUsd(r.avgWin)} color="var(--green)" />
            <Stat label="Average loss" value={signedUsd(r.avgLoss)} color="var(--red)" />
            <Stat label="Profit factor" value={r.profitFactor == null ? "No losses" : `${r.profitFactor.toFixed(2)}×`} sub="Wins ÷ losses, in dollars" />
            <Stat label="Best trade" value={signedUsd(r.best.pnl)} color={tone(r.best.pnl)} sub={r.best.market.replace(/-USD$/, "")} />
            <Stat label="Worst trade" value={signedUsd(r.worst.pnl)} color={tone(r.worst.pnl)} sub={r.worst.market.replace(/-USD$/, "")} />
            <Stat label="Typical hold" value={duration(r.medianHold)} sub={`${r.avgLeverage.toFixed(0)}× average leverage`} />
          </div>
          <div className="mt-4 sm:mt-5 pt-4" style={{ borderTop: "1px solid var(--border-subtle)" }}>
            <div className="flex flex-wrap items-center justify-between gap-x-3 text-[12px] mb-2" style={{ color: "var(--text-muted)" }}>
              <span>Longs vs shorts</span>
              <span>
                Streaks: {r.streak.wins} wins · {r.streak.losses} losses
              </span>
            </div>
            <SplitBar
              parts={[
                { label: `Long · ${pct(r.long.winRate, 0)} won`, value: r.long.count, color: "var(--green)", note: signedUsd(r.long.pnl) },
                { label: `Short · ${pct(r.short.winRate, 0)} won`, value: r.short.count, color: "var(--red)", note: signedUsd(r.short.pnl) },
              ]}
            />
          </div>
          <p className="mt-3 text-[11.5px]" style={{ color: "var(--text-faint)" }}>
            PnL is after trading fees ({fmtUsd(r.fees)} paid across these positions).
          </p>
        </>
      )}
    </Panel>
  );
}

/* ── PnL by market ──────────────────────────────────────────────────────── */

export function MarketPnlCard({ w }: { w: WalletData }) {
  const closed = w.activity.data?.closed;
  const rows = useMemo(() => (closed ? pnlByMarket(closed).slice(0, 8) : []), [closed]);
  const max = Math.max(1, ...rows.map((r) => Math.abs(r.pnl)));
  const { shown, toggle } = useRowLimit(rows, 8, 5);
  return (
    <Panel title="Recent wins and losses by market" sub={`Realised PnL from ${recentSpan(closed)}`} className="lg:col-span-5">
      {!w.activity.data ? (
        <Skeleton height={260} />
      ) : !rows.length ? (
        <Empty>No closed positions yet.</Empty>
      ) : (
        <>
          <ul className="flex flex-col gap-2.5">
            {shown.map((r) => (
              <li key={r.market} className="grid grid-cols-[92px_1fr_1fr_72px] items-center gap-2 text-[12.5px]">
                <span className="flex items-center gap-1.5 min-w-0 font-medium" style={{ color: "var(--text)" }}>
                  <TokenIcon symbol={r.market} size={16} />
                  <span className="truncate">{r.market.replace(/-USD$/, "")}</span>
                </span>
                {/* Losses grow left from the middle, gains right. */}
                <span className="flex justify-end">
                  {r.pnl < 0 && <span className="h-3 rounded-l-[3px]" style={{ width: `${(Math.abs(r.pnl) / max) * 100}%`, background: "var(--red)" }} />}
                </span>
                <span className="flex" style={{ borderLeft: "1px solid var(--border)" }}>
                  {r.pnl > 0 && <span className="h-3 rounded-r-[3px]" style={{ width: `${(r.pnl / max) * 100}%`, background: "var(--green)" }} />}
                </span>
                <span className="text-right mono tabular-nums" style={{ color: tone(r.pnl) }}>
                  {signedUsd(r.pnl)}
                </span>
              </li>
            ))}
          </ul>
          {/* Only a phone cuts this list short; the toggle runs edge to edge under it. */}
          {toggle && <div className="mt-3 -mx-4 -mb-4">{toggle}</div>}
        </>
      )}
    </Panel>
  );
}

/* ── Day by day ─────────────────────────────────────────────────────────── */

const MONTH = (d: Date) => d.toLocaleDateString("en-US", { month: "long", year: "numeric", timeZone: "UTC" });

export function CalendarCard({ chart }: { chart: ChartPoint[] | null }) {
  const days = useMemo(() => (chart ? dailyPnl(chart) : []), [chart]);
  const byDay = useMemo(() => new Map(days.map((d) => [d.day, d.pnl])), [days]);
  const months = useMemo(() => [...new Set(days.map((d) => d.day.slice(0, 7)))], [days]);
  const [pick, setPick] = useState<string | null>(null);
  const month = pick && months.includes(pick) ? pick : months[months.length - 1];
  const [hover, setHover] = useState<string | null>(null);

  if (!chart) return <Panel title="Day by day" className="lg:col-span-7"><Skeleton height={300} /></Panel>;
  if (!month) return <Panel title="Day by day" className="lg:col-span-7"><Empty>No daily history yet.</Empty></Panel>;

  const first = new Date(`${month}-01T00:00:00Z`);
  const lead = (first.getUTCDay() + 6) % 7; // Monday first
  const inMonth = new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth() + 1, 0)).getUTCDate();
  const monthDays = days.filter((d) => d.day.startsWith(month));
  const max = Math.max(1, ...monthDays.map((d) => Math.abs(d.pnl)));
  const net = monthDays.reduce((a, d) => a + d.pnl, 0);
  const active = monthDays.filter((d) => Math.abs(d.pnl) > 0.005);
  const won = active.filter((d) => d.pnl > 0).length;
  const best = monthDays.reduce<number | null>((a, d) => (a == null || d.pnl > a ? d.pnl : a), null);
  const worst = monthDays.reduce<number | null>((a, d) => (a == null || d.pnl < a ? d.pnl : a), null);
  const idx = months.indexOf(month);
  const shown = hover ?? null;

  return (
    <Panel
      title="Day by day"
      sub="Daily change in PnL, last 12 months"
      right={
        <span className="inline-flex items-center gap-1">
          <button type="button" aria-label="Previous month" disabled={idx <= 0} onClick={() => setPick(months[idx - 1])} className="w-7 h-7 inline-flex items-center justify-center rounded-[8px] disabled:opacity-30 hover:bg-[var(--bg-elevated)]" style={{ color: "var(--text)" }}>
            <ChevronLeft size={15} />
          </button>
          <span className="text-[12.5px] font-medium min-w-[118px] text-center" style={{ color: "var(--text)" }}>
            {MONTH(first)}
          </span>
          <button type="button" aria-label="Next month" disabled={idx >= months.length - 1} onClick={() => setPick(months[idx + 1])} className="w-7 h-7 inline-flex items-center justify-center rounded-[8px] disabled:opacity-30 hover:bg-[var(--bg-elevated)]" style={{ color: "var(--text)" }}>
            <ChevronRight size={15} />
          </button>
        </span>
      }
      className="lg:col-span-7"
    >
      <div className="grid sm:grid-cols-[1fr_168px] gap-4 sm:gap-5">
        <div>
          <div className="grid grid-cols-7 gap-1 text-[10.5px] mb-1 text-center mono" style={{ color: "var(--text-faint)" }}>
            {["M", "T", "W", "T", "F", "S", "S"].map((d, i) => (
              <span key={i}>{d}</span>
            ))}
          </div>
          <div className="grid grid-cols-7 gap-1">
            {Array.from({ length: lead }, (_, i) => (
              <span key={`l${i}`} />
            ))}
            {Array.from({ length: inMonth }, (_, i) => {
              const day = `${month}-${String(i + 1).padStart(2, "0")}`;
              const v = byDay.get(day);
              const s = v == null ? 0 : Math.sqrt(Math.abs(v) / max);
              const bg = v == null || Math.abs(v) < 0.005 ? "var(--bg-elevated)" : `color-mix(in srgb, ${v > 0 ? "var(--green)" : "var(--red)"} ${Math.round(18 + s * 70)}%, var(--bg-elevated))`;
              return (
                <span
                  key={day}
                  className="h-9 sm:h-10 rounded-[6px] flex flex-col items-center justify-center text-[10px] leading-tight cursor-default"
                  style={{ background: bg, color: "var(--text)", outline: hover === day ? "1px solid var(--text)" : undefined }}
                  onMouseEnter={() => setHover(day)}
                  onMouseLeave={() => setHover(null)}
                  title={v == null ? `${day}: no data` : `${day}: ${signedUsd(v)}`}
                >
                  <span style={{ opacity: 0.6 }}>{i + 1}</span>
                </span>
              );
            })}
          </div>
          <p className="mt-2 h-4 text-[11.5px] mono" style={{ color: "var(--text-muted)" }}>
            {shown ? `${new Date(`${shown}T00:00:00Z`).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" })}: ${byDay.has(shown) ? signedUsd(byDay.get(shown)!) : "no data"}` : ""}
          </p>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-1 gap-3 content-start">
          <Stat label="Month net" value={signedUsd(net)} color={tone(net)} />
          <Stat label="Winning days" value={active.length ? `${won} of ${active.length}` : "—"} />
          <Stat label="Best day" value={best == null ? "—" : signedUsd(best)} color={best == null ? undefined : tone(best)} />
          <Stat label="Worst day" value={worst == null ? "—" : signedUsd(worst)} color={worst == null ? undefined : tone(worst)} />
        </div>
      </div>
    </Panel>
  );
}

/* ── Holdings ───────────────────────────────────────────────────────────── */

function HoldingList({ rows, total }: { rows: HoldingRow[]; total: number }) {
  const { shown, toggle } = useRowLimit(rows, 5, 3);
  return (
    <>
      <ul>
        {shown.map((r) => (
          <li key={r.coin} className="flex items-center gap-3 px-4 sm:px-5 py-2.5 text-[13px]" style={{ borderTop: "1px solid var(--border-subtle)" }}>
            <TokenIcon symbol={r.staked ? "SOSO" : r.coin} size={24} />
            <span className="min-w-0 flex-1">
              <span className="block font-medium truncate" style={{ color: "var(--text)" }}>
                {r.staked ? "SOSO" : tickerLabel(r.coin)}
              </span>
              <span className="block text-[11.5px] mono truncate" style={{ color: "var(--text-faint)" }}>
                {fmtAmount(r.amount)}
                {r.locked > 0 ? ` · ${fmtAmount(r.locked)} in orders` : ""}
                {r.price != null ? ` · ${fmtPrice(r.price)}` : ""}
              </span>
            </span>
            <span className="text-right">
              <span className="block mono tabular-nums" style={{ color: r.value == null ? "var(--text-faint)" : "var(--text)" }}>
                {r.value == null ? "no price" : fmtUsd(r.value)}
              </span>
              {r.value != null && total > 0 && (
                <span className="block text-[11px] mono" style={{ color: "var(--text-faint)" }}>
                  {pct(r.value / total, 0)}
                </span>
              )}
            </span>
          </li>
        ))}
      </ul>
      {toggle}
    </>
  );
}

/**
 * Coins held in three places, each a line in the net worth card: the spot
 * account, staked SOSO, and the wallet on ValueChain itself.
 */
export function HoldingsCard({ w }: { w: WalletData }) {
  const m = w.markets.data;
  const spot = useMemo(() => (w.balances.data && m ? holdingRows(w.balances.data, 0, m) : null), [w.balances.data, m]);
  const staked = useMemo(() => (w.staked.data != null && m ? holdingRows([], w.staked.data, m) : null), [w.staked.data, m]);
  const chain = useMemo(() => (w.chain.data && m ? chainRows(w.chain.data, m) : null), [w.chain.data, m]);
  const sum = (rows: HoldingRow[] | null) => (rows ?? []).reduce((a, r) => a + (r.value ?? 0), 0);
  const groups: { key: string; title: string; note?: string; rows: HoldingRow[] | null; failed: boolean; partial?: string }[] = [
    { key: "spot", title: "Spot account", note: "Wealth fund shares are under Wealth", rows: spot, failed: !!w.balances.error },
    { key: "staked", title: "Staked SOSO", rows: staked, failed: false },
    {
      key: "chain",
      title: "ValueChain wallet",
      note: "Native SOSO and tokens held on ValueChain itself",
      rows: chain,
      failed: !!w.chain.error,
      partial: w.chain.data && !w.chain.data.tokensRead ? "ValueChain's explorer didn't answer, so tokens aren't listed: native SOSO only. Refresh to try again." : undefined,
    },
  ];
  const total = sum(spot) + sum(staked) + sum(chain);
  return (
    <Panel title="Holdings" sub="Coins, wherever on SoDEX they sit" right={spot ? <span className="text-[13px] mono font-semibold" style={{ color: "var(--text)" }}>{fmtUsd(total)}</span> : undefined} className="lg:col-span-5" pad={false}>
      {groups.map((g) =>
        g.rows && !g.rows.length && g.key !== "spot" && !g.partial ? null : (
          <div key={g.key} className="mt-1">
            <div className="flex items-baseline justify-between gap-3 px-4 sm:px-5 pt-2 pb-1.5">
              <span>
                <span className="text-[12px] font-semibold" style={{ color: "var(--text-muted)" }}>
                  {g.title}
                </span>
                {g.note && (
                  <span className="hidden sm:inline text-[11px] ml-2" style={{ color: "var(--text-faint)" }}>
                    {g.note}
                  </span>
                )}
              </span>
              <span className="text-[12px] mono" style={{ color: "var(--text-muted)" }}>
                {g.rows ? fmtUsd(sum(g.rows)) : g.failed ? "n/a" : <LoadingDots />}
              </span>
            </div>
            {!g.rows ? (
              g.failed ? (
                <p className="px-4 sm:px-5 pb-3 text-[12px]" style={{ color: "var(--text-faint)" }}>
                  Couldn&apos;t load this part.
                </p>
              ) : null
            ) : !g.rows.length && !g.partial ? (
              <p className="px-4 sm:px-5 pb-3 text-[12px]" style={{ color: "var(--text-faint)" }}>
                Nothing here.
              </p>
            ) : (
              <>
                {g.rows.length > 0 && <HoldingList rows={g.rows} total={total} />}
                {g.partial && (
                  <p className="px-4 sm:px-5 pb-3 pt-1 text-[11.5px]" style={{ color: "var(--text-faint)" }}>
                    {g.partial}
                  </p>
                )}
              </>
            )}
          </div>
        ),
      )}
      <div className="h-4" />
    </Panel>
  );
}

/* ── Wealth ─────────────────────────────────────────────────────────────── */

export function WealthCard({ w }: { w: WalletData }) {
  const d = w.wealth.data;
  const wh = walletWealth(d, !!w.wealth.error, w.balances.data, w.markets.data);
  return (
    <Panel
      title="Wealth"
      sub="SoDEX's funds, vaults and Earn"
      right={
        <a href="https://sodex.com/wealth" target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-[12px] font-medium" style={{ color: "var(--text-muted)" }}>
          SoDEX Wealth <ExternalLink size={12} />
        </a>
      }
      className="lg:col-span-6"
    >
      {!wh ? (
        <Skeleton height={200} />
      ) : !wh.holdings.length && (d?.inFlight ?? 0) <= 0 ? (
        <Empty>{d && d.pnl !== 0 ? `No Wealth products held now. Lifetime Wealth PnL: ${signedUsd(d.pnl)}.` : "No Wealth products held."}</Empty>
      ) : (
        <>
          <div className="grid grid-cols-3 gap-3 sm:gap-4">
            <Stat label="Value" value={fmtUsd(wh.total)} sub={d && d.inFlight > 0 ? `${fmtUsd(d.inFlight)} in progress` : undefined} />
            {d ? (
              <>
                <Stat label="Total PnL" value={signedUsd(d.pnl)} color={tone(d.pnl)} sub={`${signedUsd(d.realized)} realised`} />
                <Stat label="Last 24h" value={signedUsd(d.pnl24h)} color={tone(d.pnl24h)} />
              </>
            ) : (
              <div className="col-span-2 text-[12px] self-center" style={{ color: "var(--text-faint)" }}>
                SoDEX Wealth didn&apos;t answer, so PnL is missing. Holdings in the spot account are still counted.
              </div>
            )}
          </div>
          <ul className="mt-4">
            {wh.holdings.map((h) => (
              <li key={h.fundId} className="flex items-center gap-3 py-2.5 text-[13px]" style={{ borderTop: "1px solid var(--border-subtle)" }}>
                <TokenIcon symbol={h.fundId} size={22} />
                <span className="min-w-0 flex-1">
                  <span className="block font-medium truncate" style={{ color: "var(--text)" }}>
                    {h.name}
                  </span>
                  <span className="block text-[11.5px]" style={{ color: "var(--text-faint)" }}>
                    {h.inSpot > 0.005 ? "Shares held in the spot account" : h.inPerps > 0.005 ? "Shares held in the perps account" : "Held in Wealth"}
                  </span>
                </span>
                <span className="text-right">
                  <span className="block mono tabular-nums" style={{ color: "var(--text)" }}>
                    {fmtUsd(h.value)}
                  </span>
                  <span className="block text-[11px] mono" style={{ color: h.pnl24h == null ? "var(--text-faint)" : tone(h.pnl24h) }}>
                    {h.pnl24h == null ? `${fmtAmount(h.shares)} shares` : `${signedUsd(h.pnl24h)} 24h`}
                  </span>
                </span>
              </li>
            ))}
          </ul>
          {d && d.pendingOrders > 0 && (
            <p className="mt-2 text-[11.5px]" style={{ color: "var(--text-faint)" }}>
              {d.pendingOrders} subscription or redemption still processing.
            </p>
          )}
        </>
      )}
    </Panel>
  );
}

/* ── Money in and out ───────────────────────────────────────────────────── */

export function TransfersCard({ w }: { w: WalletData }) {
  const [dir, setDir] = useState<"all" | "in" | "out">("all");
  const all = w.transfers.data;
  const list = (all ?? []).filter((t) => dir === "all" || (dir === "in") === t.deposit);
  const { shown, toggle } = useRowLimit(list, 6, 4);
  const sum = (dep: boolean) => (all ?? []).filter((t) => t.deposit === dep).reduce((a, t) => a + (t.usd ?? 0), 0);
  const inUsd = sum(true);
  const outUsd = sum(false);
  return (
    <Panel
      title="Money in and out"
      sub="Deposits and withdrawals, stablecoins in dollars"
      right={
        <PillTabs
          label="Direction"
          value={dir}
          onChange={setDir}
          options={[
            { value: "all", label: "All" },
            { value: "in", label: "In" },
            { value: "out", label: "Out" },
          ]}
        />
      }
      className="lg:col-span-6"
      pad={false}
    >
      <div className="px-4 sm:px-5">
        {!all ? (
          w.transfers.error ? <Failed message={w.transfers.error} /> : <Skeleton height={200} />
        ) : (
          <div className="grid grid-cols-3 gap-3 sm:gap-4 pb-3">
            <Stat label="Deposited" value={fmtUsd(inUsd)} color="var(--green)" />
            <Stat label="Withdrawn" value={fmtUsd(outUsd)} color="var(--red)" />
            <Stat label="Net" value={signedUsd(inUsd - outUsd)} color={tone(inUsd - outUsd)} />
          </div>
        )}
      </div>
      {all && !list.length && (
        <div className="px-4 sm:px-5 pb-4 sm:pb-5">
          <Empty>Nothing here yet.</Empty>
        </div>
      )}
      {list.length > 0 && (
        <>
          <ul>
            {shown.map((t, i) => (
              <li key={`${t.txHash}-${i}`} className="flex items-center gap-3 px-4 sm:px-5 py-2.5 text-[13px]" style={{ borderTop: "1px solid var(--border-subtle)" }}>
                <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: t.deposit ? "var(--green)" : "var(--red)" }} />
                <span className="min-w-0 flex-1">
                  <span className="block" style={{ color: "var(--text)" }}>
                    {t.deposit ? "Deposit" : "Withdrawal"} · {tickerLabel(t.coin)}
                  </span>
                  <span className="block text-[11.5px]" style={{ color: "var(--text-faint)" }}>
                    {t.chain.split("_")[0].toLowerCase().replace(/^\w/, (c) => c.toUpperCase())} · {ago(t.t)}
                  </span>
                </span>
                <span className="mono tabular-nums" style={{ color: t.deposit ? "var(--green)" : "var(--red)" }}>
                  {t.deposit ? "+" : "−"}
                  {t.usd != null ? fmtUsd(t.usd) : `${fmtAmount(t.amount)} ${tickerLabel(t.coin)}`}
                </span>
              </li>
            ))}
          </ul>
          {toggle}
        </>
      )}
      <div className="h-3" />
    </Panel>
  );
}

/* ── Activity ───────────────────────────────────────────────────────────── */

export function ActivityCard({ w }: { w: WalletData }) {
  const [tab, setTab] = useState<"trades" | "closed">("closed");
  const a = w.activity.data;
  const trades = useRowLimit(a?.trades ?? [], 10, 6);
  const closed = useRowLimit(a?.closed ?? [], 10, 6);
  return (
    <Panel
      title="Activity"
      sub={a ? `Latest ${a.trades.length} trades and ${a.closed.length} closed positions` : undefined}
      right={
        <PillTabs
          label="Activity"
          value={tab}
          onChange={setTab}
          options={[
            { value: "closed", label: "Closed positions" },
            { value: "trades", label: "Trades" },
          ]}
        />
      }
      className="lg:col-span-12"
      pad={false}
    >
      {!a ? (
        <div className="px-4 sm:px-5 pb-4 sm:pb-5">{w.activity.error ? <Failed message={w.activity.error} /> : <Skeleton height={260} />}</div>
      ) : tab === "closed" ? (
        !a.closed.length ? (
          <div className="px-4 sm:px-5 pb-4 sm:pb-5"><Empty>No closed positions yet.</Empty></div>
        ) : (
          <>
            <div className="hidden md:grid grid-cols-[1.3fr_1fr_1fr_1fr_1fr_1fr] gap-3 px-4 sm:px-5 pb-2 text-[11.5px]" style={{ color: "var(--text-faint)" }}>
              <span>Market</span>
              <span className="text-right">Size</span>
              <span className="text-right">Entry → Exit</span>
              <span className="text-right">Held</span>
              <span className="text-right">Closed</span>
              <span className="text-right">Realised</span>
            </div>
            {closed.shown.map((p) => (
              <div key={p.id} className="grid grid-cols-2 md:grid-cols-[1.3fr_1fr_1fr_1fr_1fr_1fr] items-center gap-x-3 gap-y-1 px-4 sm:px-5 py-2.5 text-[13px]" style={{ borderTop: "1px solid var(--border-subtle)" }}>
                <span className="flex items-center gap-2 min-w-0">
                  <TokenIcon symbol={p.market} size={20} />
                  <span className="font-medium truncate" style={{ color: "var(--text)" }}>{p.market.replace(/-USD$/, "")}</span>
                  <SidePill long={p.long} leverage={p.leverage} />
                </span>
                <span className="hidden md:block text-right mono tabular-nums" style={{ color: "var(--text-muted)" }}>{fmtUsd(p.size * p.entry)}</span>
                <span className="hidden md:block text-right mono tabular-nums" style={{ color: "var(--text-muted)" }}>
                  {fmtPrice(p.entry)} → {fmtPrice(p.exit)}
                </span>
                <span className="hidden md:block text-right mono" style={{ color: "var(--text-muted)" }}>{duration(p.closedAt - p.openedAt)}</span>
                <span className="hidden md:block text-right" style={{ color: "var(--text-faint)" }}>{ago(p.closedAt)}</span>
                <span className="text-right mono tabular-nums font-semibold" style={{ color: tone(p.pnl) }}>
                  {signedUsd(p.pnl)}
                  <span className="md:hidden block text-[11px] font-normal" style={{ color: "var(--text-faint)" }}>{ago(p.closedAt)}</span>
                </span>
              </div>
            ))}
            {closed.toggle}
          </>
        )
      ) : !a.trades.length ? (
        <div className="px-4 sm:px-5 pb-4 sm:pb-5"><Empty>No trades yet.</Empty></div>
      ) : (
        <>
          <div className="hidden md:grid grid-cols-[1.3fr_0.8fr_1fr_1fr_1fr_1fr] gap-3 px-4 sm:px-5 pb-2 text-[11.5px]" style={{ color: "var(--text-faint)" }}>
            <span>Market</span>
            <span>Side</span>
            <span className="text-right">Price</span>
            <span className="text-right">Value</span>
            <span className="text-right">Size</span>
            <span className="text-right">When</span>
          </div>
          {trades.shown.map((t) => (
            <div key={t.id} className="grid grid-cols-2 md:grid-cols-[1.3fr_0.8fr_1fr_1fr_1fr_1fr] items-center gap-x-3 gap-y-1 px-4 sm:px-5 py-2.5 text-[13px]" style={{ borderTop: "1px solid var(--border-subtle)" }}>
              <span className="flex items-center gap-2 min-w-0">
                <TokenIcon symbol={t.market} size={20} />
                <span className="font-medium truncate" style={{ color: "var(--text)" }}>{t.market}</span>
                <span className="text-[10px] px-1 rounded-[4px]" style={{ border: "1px solid var(--border)", color: "var(--text-faint)" }}>{t.kind === "perp" ? "PERP" : "SPOT"}</span>
              </span>
              <span className="text-[12px] font-medium md:text-left text-right" style={{ color: t.buy ? "var(--green)" : "var(--red)" }}>
                {t.buy ? "Buy" : "Sell"}
                <span className="ml-1.5" style={{ color: "var(--text-faint)" }}>{t.maker ? "maker" : "taker"}</span>
              </span>
              <span className="hidden md:block text-right mono tabular-nums" style={{ color: "var(--text-muted)" }}>{fmtPrice(t.price)}</span>
              <span className="text-left md:text-right mono tabular-nums md:order-none" style={{ color: "var(--text)" }}>{fmtUsd(t.value)}</span>
              <span className="hidden md:block text-right mono tabular-nums" style={{ color: "var(--text-faint)" }}>{fmtAmount(t.size)}</span>
              <span className="text-right text-[12px]" style={{ color: "var(--text-faint)" }}>{ago(t.t)}</span>
            </div>
          ))}
          {trades.toggle}
        </>
      )}
      <div className="h-3" />
    </Panel>
  );
}
