"use client";

import { useState } from "react";
import Link from "next/link";
import type { RankEntry, RankingsResult } from "@/lib/rankingStore";
import { count, usd } from "@/lib/analyticsFormat";
import { useApi, useCompact } from "@/components/analytics/hooks";
import { NoData, Section, TileSkeleton } from "@/components/analytics/ui";
import { Panel, PillTabs, SizeScale } from "@/components/analytics/kit";
import { TokenIcon } from "@/components/TokenIcon";

/**
 * Rankings from our own tracking: positions, equity, track records and money
 * moved. Traders appear under nicknames that open their page.
 */

const signedUsd = (n: number) => `${n > 0 ? "+" : n < 0 ? "−" : ""}${usd(Math.abs(n))}`;

type BoardKey = "positions" | "rich" | "upnl" | "exposure" | "record" | "money";

function Board({
  title,
  rows,
  format,
  tone,
  right,
  empty = "Nothing to rank yet.",
}: {
  title: string;
  rows: RankEntry[];
  format: (n: number) => string;
  tone?: (n: number) => string;
  right?: React.ReactNode;
  empty?: string;
}) {
  return (
    <Panel title={title} right={right} pad={false}>
      {rows.length === 0 ? (
        <p className="px-4 sm:px-5 pb-4 sm:pb-5 text-[12.5px]" style={{ color: "var(--text-faint)" }}>{empty}</p>
      ) : (
        <ol className="pb-2">
          {rows.map((r, i) => (
            <li key={`${r.name}-${r.market ?? ""}-${i}`} className="flex items-center gap-3 px-4 sm:px-5 py-2" style={{ borderTop: i ? "1px solid var(--border-subtle)" : undefined }}>
              <span className="mono text-[11px] w-4 text-right shrink-0" style={{ color: "var(--text-faint)" }}>{i + 1}</span>
              <div className="min-w-0 flex-1">
                <Link href={`/analytics/trader/${r.name}`} className="block text-[13px] font-medium truncate hover:underline underline-offset-2" style={{ color: "var(--text)" }}>
                  {r.name}
                </Link>
                <span className="flex items-center gap-1.5 text-[11px] truncate" style={{ color: "var(--text-faint)" }}>
                  {r.market && (
                    <>
                      <TokenIcon symbol={r.market} size={12} />
                      <span style={{ color: "var(--text-muted)" }}>{r.market.replace("-USD", "")}</span>
                      <span className="font-semibold" style={{ color: r.side === "LONG" ? "var(--green)" : "var(--red)" }}>{r.side}</span>
                      <span>·</span>
                    </>
                  )}
                  {r.group}
                </span>
              </div>
              <div className="text-right shrink-0">
                <div className="mono text-[13px] font-semibold" style={{ color: tone ? tone(r.value) : "var(--text)" }}>{format(r.value)}</div>
                {r.detail && <div className="mono text-[11px]" style={{ color: "var(--text-faint)" }}>{r.detail}</div>}
              </div>
            </li>
          ))}
        </ol>
      )}
    </Panel>
  );
}

const tone = (n: number) => (n > 0 ? "var(--green)" : n < 0 ? "var(--red)" : "var(--text-muted)");

export function RankingsView() {
  const [days, setDays] = useState<"1" | "7" | "30">("7");
  const [upnl, setUpnl] = useState<"win" | "lose">("win");
  const [record, setRecord] = useState<"win" | "lose">("win");
  const [money, setMoney] = useState<"in" | "out">("in");
  const compact = useCompact();
  const [board, setBoard] = useState<BoardKey>("positions");
  const { data, loading, error } = useApi<RankingsResult>(`/api/analytics/rankings?days=${days}`, 60_000, 120_000);

  if (error && !data) return <p className="mt-10 text-[13px]" style={{ color: "var(--red)" }}>{error}</p>;
  if (!data) return <TileSkeleton count={6} />;
  if (!data.available) {
    return (
      <Section title="Rankings">
        <NoData title="Rankings" reason={data.reason} />
      </Section>
    );
  }

  const toggle = <T extends string>(value: T, set: (v: T) => void, a: [T, string], b: [T, string]) => (
    <PillTabs label="Show" value={value} onChange={set} options={[{ value: a[0], label: a[1] }, { value: b[0], label: b[1] }]} />
  );

  const boards: { key: BoardKey; tab: string; node: React.ReactNode }[] = [
    { key: "positions", tab: "Positions", node: <Board key="positions" title="Biggest positions" rows={data.biggestPositions} format={(n) => usd(n)} /> },
    { key: "rich", tab: "Rich list", node: <Board key="rich" title="Rich list" rows={data.richList} format={(n) => usd(n)} /> },
    {
      key: "upnl",
      tab: "Unrealised PnL",
      node: (
        <Board
          key="upnl"
          title="Unrealised PnL"
          rows={upnl === "win" ? data.upnlWinners : data.upnlLosers}
          format={signedUsd}
          tone={tone}
          right={toggle(upnl, setUpnl, ["win", "Winning"], ["lose", "Losing"])}
        />
      ),
    },
    {
      key: "exposure",
      tab: "Exposure",
      node: (
        <Board
          key="exposure"
          title="Highest exposure"
          rows={data.highestExposure}
          format={(n) => `${n.toFixed(1)}×`}
          empty="No account with $10K+ equity holds positions yet."
        />
      ),
    },
    {
      key: "record",
      tab: "All-time PnL",
      node: (
        <Board
          key="record"
          title="All-time PnL"
          rows={record === "win" ? data.topEarners : data.topLosers}
          format={signedUsd}
          tone={tone}
          right={toggle(record, setRecord, ["win", "Top"], ["lose", "Bottom"])}
        />
      ),
    },
    {
      key: "money",
      tab: "Money moved",
      node: (
        <Board
          key="money"
          title={money === "in" ? "Biggest depositors" : "Biggest withdrawers"}
          rows={money === "in" ? data.depositors : data.withdrawers}
          format={(n) => `≈${usd(n)}`}
          empty={data.coverage.ledgers ? "No deposits or withdrawals in this window." : "Deposits and withdrawals arrive once the collector reads ledgers."}
          right={
            <span className="flex items-center gap-1.5">
              {toggle(money, setMoney, ["in", "In"], ["out", "Out"])}
              <PillTabs
                label="Window"
                value={days}
                onChange={setDays}
                options={[
                  { value: "1", label: "24H" },
                  { value: "7", label: "7D" },
                  { value: "30", label: "30D" },
                ]}
              />
            </span>
          }
        />
      ),
    },
  ];

  return (
    <div style={{ opacity: loading ? 0.55 : 1, transition: "opacity 0.2s" }} aria-busy={loading}>
      <p className="mt-4 sm:mt-6 text-[12px] leading-relaxed" style={{ color: "var(--text-muted)" }}>
        <span className="inline-block w-1.5 h-1.5 mr-2 mb-[1px] rounded-full" style={{ background: "var(--green)" }} aria-hidden />
        From {count(data.coverage.traders)} traders tracked, {count(data.coverage.holders)} with open positions · positions valued at live prices
      </p>

      {compact ? (
        // Six boards stacked run a phone screen long four times over: one at a time there.
        <div className="mt-5 flex flex-col gap-3">
          <div>
            <PillTabs label="Board" value={board} onChange={setBoard} options={boards.map((b) => ({ value: b.key, label: b.tab }))} />
          </div>
          {boards.find((b) => b.key === board)?.node}
        </div>
      ) : (
        <div className="mt-5 grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">{boards.map((b) => b.node)}</div>
      )}
      <SizeScale />
      <p className="mt-4 text-[11px] max-w-3xl" style={{ color: "var(--text-faint)" }}>
        Highest exposure is open positions over equity, for accounts with $10K or more. Deposit and withdrawal totals are rounded to two figures.
      </p>
    </div>
  );
}
