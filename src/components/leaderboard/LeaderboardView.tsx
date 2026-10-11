"use client";

import { useState } from "react";
import Link from "next/link";
import { count, pct, usd } from "@/lib/analyticsFormat";
import { LiveDot, Panel, PillTabs, CARD_STYLE } from "@/components/analytics/kit";
import { useCompact } from "@/components/analytics/hooks";
import { Identicon, LoadingDots } from "@/components/wallet/ui";
import { useWatchlist } from "@/components/watchlist/useWatchlist";
import {
  edgeOf,
  LB_WINDOWS,
  PAGE_SIZE,
  useBoardPage,
  usePodiumDetail,
  useTop100,
  useTopEverywhere,
  type LbSort,
  type LbWindow,
  type Row,
} from "@/components/leaderboard/data";
import { Podium } from "@/components/leaderboard/Podium";
import { RankSearch } from "@/components/leaderboard/RankSearch";
import { Field } from "@/components/leaderboard/Field";
import { BoardHead, BoardRow, Pager } from "@/components/leaderboard/Board";
import { edgeText, short, signed, trackHref } from "@/components/leaderboard/parts";

/**
 * The leaderboard: SoDEX's own ranking, staged. The podium up top, a few
 * figures about the top hundred, the field of the top hundred as dots, then
 * the full list, page by page, with a way to find any wallet's place.
 */

const snapshotTime = (ms: number) =>
  `${new Date(ms).toLocaleString("en-US", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit", hour12: false, timeZone: "UTC" })} UTC`;

function WalletChip({ r }: { r: Row }) {
  return (
    <Link
      href={trackHref(r.address)}
      className="inline-flex items-center gap-1.5 min-w-0 hover:underline underline-offset-2"
      style={{ color: "var(--text-muted)" }}
    >
      <Identicon address={r.address} size={16} />
      <span className="mono truncate">{short(r.address)}</span>
    </Link>
  );
}

type Fact = { label: string; value: React.ReactNode; sub?: React.ReactNode; color?: string };

/**
 * A few figures about the top hundred, worked out from the same lists: a
 * tile each. Not shown on a phone.
 */
function Insights({ top, sort, where }: { top: Row[]; sort: LbSort; where: Map<string, LbWindow[]> | null }) {
  if (!top.length) return null;
  const made = top.reduce((a, r) => a + r.pnl, 0);
  const traded = top.reduce((a, r) => a + r.volume, 0);
  const winners = top.filter((r) => r.pnl > 0).length;
  const idle = top.filter((r) => r.volume <= 0).length;
  const sharp = top.filter((r) => r.volume >= 50_000).sort((a, b) => (edgeOf(b) ?? -Infinity) - (edgeOf(a) ?? -Infinity))[0];
  const busiest = [...top].sort((a, b) => b.volume - a.volume)[0];
  const everywhere = where ? [...where.entries()].filter(([, w]) => w.length === 4).map(([a]) => a) : [];

  const facts: Fact[] = [
    sort === "pnl"
      ? { label: "Top 100 made", value: signed(made), color: made >= 0 ? "var(--green)" : "var(--red)", sub: `${usd(traded)} traded between them` }
      : { label: "Top 100 traded", value: usd(traded), sub: `${signed(made)} PnL between them` },
    sort === "pnl"
      ? { label: "Made it without trading", value: idle, sub: "PnL from positions already held" }
      : { label: "In profit", value: pct(winners / top.length, 0), sub: `${winners} of the top ${top.length}` },
    { label: "Sharpest", value: sharp ? edgeText(edgeOf(sharp)) : "—", sub: sharp ? <WalletChip r={sharp} /> : "Nobody over $50K traded" },
    { label: "Busiest", value: busiest ? usd(busiest.volume) : "—", sub: busiest ? <WalletChip r={busiest} /> : undefined },
    {
      label: "Top 20 everywhere",
      value: where ? everywhere.length : <LoadingDots />,
      sub: everywhere.length ? (
        <span className="flex -space-x-1.5">
          {everywhere.slice(0, 6).map((a) => (
            <Link key={a} href={trackHref(a)} title={short(a)} className="rounded-[6px] ring-2 ring-[var(--bg-surface)]">
              <Identicon address={a} size={18} />
            </Link>
          ))}
        </span>
      ) : (
        "In the top 20 of every window: nobody, this time"
      ),
    },
  ];

  return (
    <>
      {/* Two then three on a tablet, five in a row on a desktop. */}
      <div className="grid grid-cols-6 lg:grid-cols-5 gap-3">
        {facts.map((f, i) => (
          <div key={f.label} className={`flex flex-col min-w-0 px-4 py-3.5 ${i < 2 ? "col-span-3" : "col-span-2"} lg:col-span-1`} style={CARD_STYLE}>
            <span className="text-[10.5px] font-semibold uppercase tracking-[0.08em] truncate" style={{ color: "var(--text-faint)" }}>
              {f.label}
            </span>
            <span
              className="mt-2 text-[22px] font-bold leading-none tabular-nums truncate"
              style={{ color: f.color ?? "var(--text)", letterSpacing: "-0.03em" }}
            >
              {f.value}
            </span>
            {f.sub && (
              <span className="mt-2 text-[11.5px] truncate" style={{ color: "var(--text-muted)" }}>
                {f.sub}
              </span>
            )}
          </div>
        ))}
      </div>
    </>
  );
}

export function LeaderboardView() {
  const [win, setWin] = useState<LbWindow>("7D");
  const [sort, setSort] = useState<LbSort>("pnl");
  const [page, setPage] = useState(1);
  const [focus, setFocus] = useState<string | null>(null);
  const wl = useWatchlist();

  const board = useBoardPage(win, sort, page);
  // A phone shows only the podium from the top hundred, so it reads one page, not five.
  const phone = useCompact();
  const top = useTop100(win, sort, phone ? 1 : 5).data ?? [];
  const where = useTopEverywhere().data;
  const podiumRows = top.slice(0, 3);
  const detail = usePodiumDetail(podiumRows, win).data;

  const total = board.data?.total ?? 0;
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const rows = (board.data?.rows ?? []).filter((r) => r.rank > 3);
  const max = Math.max(1, ...(board.data?.rows ?? []).map((r) => Math.abs(sort === "pnl" ? r.pnl : r.volume)));
  const reset = () => setPage(1);

  return (
    <main className="relative max-w-[1240px] mx-auto px-4 sm:px-6 pt-[76px] sm:pt-[96px] pb-20">
      {/* Header */}
      <div className="relative flex flex-wrap items-end justify-between gap-4">
        <span
          className="pointer-events-none absolute -top-6 right-0 text-[140px] sm:text-[220px] font-black leading-none select-none hidden sm:block"
          aria-hidden
          style={{ color: "transparent", WebkitTextStroke: "1px color-mix(in srgb, #E8B931 30%, transparent)", letterSpacing: "-0.06em" }}
        >
          #1
        </span>
        <div className="relative">
          <div className="text-[11px] font-semibold uppercase tracking-[0.14em]" style={{ color: "#E8B931" }}>
            SoDEX traders, ranked
          </div>
          <h1 className="mt-2 text-[40px] sm:text-[64px] font-black leading-[0.95]" style={{ color: "var(--text)", letterSpacing: "-0.045em" }}>
            Leaderboard
          </h1>
          <p className="mt-3 inline-flex flex-wrap items-center gap-2 text-[12.5px]" style={{ color: "var(--text-muted)" }}>
            <LiveDot />
            {board.data ? (
              <>
                {count(total)} traders ranked · snapshot {snapshotTime(board.data.snapshot)}
              </>
            ) : (
              <LoadingDots />
            )}
          </p>
        </div>
      </div>

      {/* Controls, kept in reach while scrolling */}
      <div
        className="sticky top-14 z-30 -mx-4 sm:-mx-6 px-4 sm:px-6 py-2.5 mt-5 flex flex-wrap items-center gap-2"
        style={{ background: "color-mix(in srgb, var(--bg) 85%, transparent)", backdropFilter: "blur(12px)", WebkitBackdropFilter: "blur(12px)" }}
      >
        <PillTabs label="Window" value={win} onChange={(v) => (setWin(v), reset())} options={LB_WINDOWS} />
        <PillTabs
          label="Rank by"
          value={sort}
          onChange={(v) => (setSort(v), reset())}
          options={[
            { value: "pnl", label: "PnL" },
            { value: "volume", label: "Volume" },
          ]}
        />
        <div className="w-full sm:w-auto sm:ml-auto">
          <RankSearch win={win} sort={sort} total={total} wl={wl} where={where} onFocus={setFocus} />
        </div>
      </div>

      {/* Podium */}
      <section className="mt-6 sm:mt-8" aria-label="Top three">
        {podiumRows.length ? (
          <Podium key={`${win}|${sort}`} rows={podiumRows} sort={sort} win={win} detail={detail} wl={wl} where={where} />
        ) : (
          <div className="grid grid-cols-3 items-end gap-2 md:gap-4">
            {[0, 1, 2].map((i) => (
              <div
                key={i}
                className={`animate-pulse ${i === 1 ? "h-[190px]" : "h-[160px]"} md:h-[380px]`}
                style={{ background: "var(--bg-elevated)", borderRadius: "var(--card-radius)" }}
              />
            ))}
          </div>
        )}
      </section>

      {/* The top hundred, in figures */}
      {/* The figures and the field are for wider screens; a phone goes from the podium to the list. */}
      <section className="hidden sm:block mt-6" aria-label="The top hundred">
        <Insights top={top} sort={sort} where={where} />
      </section>

      {/* The field */}
      <section className="hidden sm:block mt-4">
        <Panel
          title="The field"
          sub={`The top ${top.length || 100} by ${sort === "pnl" ? "PnL" : "volume"}: volume across, PnL up and down. Bigger dots rank higher.`}
        >
          {top.length ? (
            <Field key={`${win}|${sort}`} rows={top} focus={focus} />
          ) : (
            <div className="animate-pulse rounded-[12px]" style={{ height: 320, background: "var(--bg-elevated)" }} />
          )}
        </Panel>
      </section>

      {/* The list */}
      <section id="lb-rankings" className="mt-4 overflow-hidden scroll-mt-32" style={CARD_STYLE} aria-label="Rankings">
        <div className="px-4 sm:px-5 pt-4 sm:pt-[18px] pb-3 flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="text-[14px] font-medium" style={{ color: "var(--text)" }}>
            Rankings
          </h2>
          <span className="text-[12px]" style={{ color: "var(--text-faint)" }}>
            Edge is PnL as a share of volume traded
          </span>
        </div>

        <BoardHead sort={sort} />
        {board.error ? (
          <p className="px-5 py-10 text-center text-[13px]" style={{ color: "var(--text-muted)" }}>
            SoDEX&apos;s leaderboard didn&apos;t answer. Try again in a moment.
          </p>
        ) : !board.data ? (
          <ul>
            {Array.from({ length: 8 }, (_, i) => (
              <li
                key={i}
                className="h-[52px] animate-pulse"
                style={{ borderTop: "1px solid var(--border-subtle)", background: i % 2 ? "transparent" : "var(--bg-elevated)" }}
              />
            ))}
          </ul>
        ) : (
          <ul key={`${win}|${sort}|${page}`} style={{ opacity: board.loading ? 0.5 : 1 }}>
            {rows.map((r, i) => (
              <BoardRow key={r.address} r={r} sort={sort} win={win} max={max} wl={wl} where={where?.get(r.address)} delay={i * 18} />
            ))}
          </ul>
        )}
        <Pager page={page} pages={pages} onPage={(p) => (setPage(p), document.getElementById("lb-rankings")?.scrollIntoView({ behavior: "smooth" }))} />
      </section>
    </main>
  );
}
