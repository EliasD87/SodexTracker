"use client";

import { useState } from "react";
import { count, timeAgo } from "@/lib/analyticsFormat";
import { PillTabs, CARD_STYLE } from "@/components/analytics/kit";
import { LoadingDots } from "@/components/wallet/ui";
import { useWatchlist } from "@/components/watchlist/useWatchlist";
import { LB_WINDOWS, PAGE_SIZE, useBoardPage, type LbSort, type LbWindow } from "@/components/leaderboard/data";
import { RankSearch } from "@/components/leaderboard/RankSearch";
import { BoardHead, BoardRow, Pager } from "@/components/leaderboard/Board";

/**
 * The leaderboard: SoDEX's own ranking, kept plain. One table, page by
 * page, with a way to find any wallet's place. One request
 * per page: everything shown comes from the page being read.
 */

export function LeaderboardView() {
  const [win, setWin] = useState<LbWindow>("7D");
  const [sort, setSort] = useState<LbSort>("pnl");
  const [page, setPage] = useState(1);
  const wl = useWatchlist();

  const board = useBoardPage(win, sort, page);
  const total = board.data?.total ?? 0;
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const rows = board.data?.rows ?? [];
  const reset = () => setPage(1);

  return (
    <main className="max-w-[1080px] mx-auto px-4 sm:px-6 pt-[76px] sm:pt-[96px] pb-20">
      <h1 className="text-[26px] sm:text-[34px] font-semibold leading-none" style={{ color: "var(--text)", letterSpacing: "-0.03em" }}>
        Leaderboard
      </h1>
      <p className="mt-2.5 text-[12.5px]" style={{ color: "var(--text-faint)" }}>
        {board.data ? `${count(total)} traders · updated ${timeAgo(board.data.snapshot)}` : <LoadingDots />}
      </p>

      {/* Controls, kept in reach while scrolling */}
      <div
        className="sticky top-14 z-30 -mx-4 sm:-mx-6 px-4 sm:px-6 py-2.5 mt-4 flex flex-wrap items-center gap-2"
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
          <RankSearch win={win} sort={sort} total={total} wl={wl} where={null} onFocus={() => {}} />
        </div>
      </div>

      <section id="lb-rankings" className="mt-2 overflow-hidden scroll-mt-32" style={CARD_STYLE} aria-label="Rankings">
        <BoardHead sort={sort} />
        {board.error ? (
          <p className="px-5 py-10 text-center text-[13px]" style={{ color: "var(--text-muted)" }}>
            SoDEX&apos;s leaderboard didn&apos;t answer. Try again in a moment.
          </p>
        ) : !board.data ? (
          <ul>
            {Array.from({ length: 8 }, (_, i) => (
              <li key={i} className="h-[49px] animate-pulse" style={{ borderTop: "1px solid var(--border-subtle)" }} />
            ))}
          </ul>
        ) : (
          <ul key={`${win}|${sort}|${page}`} style={{ opacity: board.loading ? 0.5 : 1 }}>
            {rows.map((r) => (
              <BoardRow key={r.address} r={r} sort={sort} wl={wl} />
            ))}
          </ul>
        )}
        <Pager page={page} pages={pages} onPage={(p) => (setPage(p), document.getElementById("lb-rankings")?.scrollIntoView({ behavior: "smooth" }))} />
      </section>
      <p className="mt-3 text-[11.5px]" style={{ color: "var(--text-faint)" }}>
        Edge is PnL as a share of volume traded. Tap a trader to open them in Tracker.
      </p>
    </main>
  );
}
