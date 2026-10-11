"use client";

import Link from "next/link";
import { CountUp } from "@/components/CountUp";
import { useCompact } from "@/components/analytics/hooks";
import { Identicon, LoadingDots } from "@/components/wallet/ui";
import { usd } from "@/lib/analyticsFormat";
import type { Watchlist } from "@/components/watchlist/useWatchlist";
import { edgeOf, type Closer, type LbSort, type LbWindow, type Row } from "@/components/leaderboard/data";
import { Badges, edgeText, CopyAddr, MEDAL, short, signed, Spark, toneOf, TrackLink, trackHref, WatchStar } from "@/components/leaderboard/parts";

/**
 * The top three on stepped plinths, second and third either side of the
 * champion, whose frame is lit by a slow gold sweep. Each card carries a
 * closer look: the account's PnL curve over the window and what it holds now.
 */

const PLINTH: Record<number, number> = { 1: 84, 2: 56, 3: 36 };

function Live({ c }: { c: Closer | undefined }) {
  if (!c) {
    return (
      <div className="h-[34px] flex items-center text-[11.5px]" style={{ color: "var(--text-faint)" }}>
        <LoadingDots label="Reading the account" />
      </div>
    );
  }
  const a = c.account;
  if (!a)
    return (
      <div className="h-[34px] text-[11.5px] flex items-center" style={{ color: "var(--text-faint)" }}>
        Account state unavailable
      </div>
    );
  const biggest = [...a.openPositions].sort((x, y) => y.size * y.entry - x.size * x.entry)[0];
  return (
    <dl className="grid grid-cols-3 gap-2 text-[10.5px]" style={{ color: "var(--text-faint)" }}>
      <div className="min-w-0">
        <dt>Equity</dt>
        <dd className="mono text-[12.5px] mt-0.5 truncate" style={{ color: "var(--text)" }}>
          {usd(a.perpsEquity)}
        </dd>
      </div>
      <div className="min-w-0">
        <dt>Open</dt>
        <dd className="mono text-[12.5px] mt-0.5" style={{ color: "var(--text)" }}>
          {a.openPositions.length}
        </dd>
      </div>
      <div className="min-w-0">
        <dt>Biggest</dt>
        <dd
          className="text-[12.5px] mt-0.5 truncate font-medium"
          style={{ color: biggest ? (biggest.long ? "var(--green)" : "var(--red)") : "var(--text-faint)" }}
        >
          {biggest ? `${biggest.market.replace(/-USD$/, "")} ${biggest.long ? "L" : "S"} ${biggest.leverage}×` : "Flat"}
        </dd>
      </div>
    </dl>
  );
}

function Card({
  r,
  sort,
  win,
  closer,
  wl,
  where,
}: {
  r: Row;
  sort: LbSort;
  win: LbWindow;
  closer: Closer | undefined;
  wl: Watchlist;
  where: LbWindow[] | undefined;
}) {
  const champ = r.rank === 1;
  const medal = MEDAL[r.rank];
  const head = sort === "pnl" ? r.pnl : r.volume;
  const curve = closer?.chart.map((p) => p.pnl) ?? [];
  const inner = (
    <div className="relative h-full flex flex-col p-4 sm:p-5" style={{ background: "var(--bg-surface)", borderRadius: "calc(var(--card-radius) - 1px)" }}>
      <div className="flex items-start gap-3">
        <span
          className="shrink-0 w-9 h-9 rounded-full inline-flex items-center justify-center text-[15px] font-black mono"
          style={{ background: `color-mix(in srgb, ${medal} 18%, transparent)`, color: medal, boxShadow: `inset 0 0 0 1.5px ${medal}` }}
          aria-label={`Rank ${r.rank}`}
        >
          {r.rank}
        </span>
        <span className={champ ? "inline-flex" : "hidden sm:inline-flex"}>
          <Identicon address={r.address} size={champ ? 40 : 36} />
        </span>
        <span className="ml-auto flex items-center -mr-1.5 -mt-1">
          <WatchStar wl={wl} address={r.address} />
          <TrackLink address={r.address} />
        </span>
      </div>
      <div className="mt-3 flex items-center gap-1.5 min-w-0">
        <span className="mono text-[13px] font-semibold truncate" style={{ color: "var(--text)" }}>
          {short(r.address)}
        </span>
        <CopyAddr address={r.address} />
      </div>
      <div className="mt-1.5 min-h-[20px]">
        <Badges where={where} win={win} />
      </div>
      <div className="mt-3 text-[10.5px] font-semibold uppercase tracking-[0.08em]" style={{ color: "var(--text-faint)" }}>
        {sort === "pnl" ? "PnL" : "Volume"}
      </div>
      <div
        className={`mt-1 font-bold tabular-nums leading-none ${champ ? "text-[34px] sm:text-[40px]" : "text-[26px] sm:text-[30px]"}`}
        style={{ color: sort === "pnl" ? toneOf(r.pnl) : "var(--text)", letterSpacing: "-0.035em" }}
      >
        <CountUp value={head} format={(v) => (sort === "pnl" ? signed(v) : usd(v))} />
      </div>
      <div className="mt-2 text-[11.5px] mono flex flex-wrap gap-x-3" style={{ color: "var(--text-muted)" }}>
        <span>{sort === "pnl" ? `${usd(r.volume)} traded` : <span style={{ color: toneOf(r.pnl) }}>{signed(r.pnl)} PnL</span>}</span>
        <span title="PnL as a share of volume traded">{edgeText(edgeOf(r))} edge</span>
      </div>
      <div className="mt-3 -mx-1">
        {closer ? (
          <Spark values={curve} height={champ ? 64 : 48} />
        ) : (
          <div className="animate-pulse rounded-[8px]" style={{ height: champ ? 64 : 48, background: "var(--bg-elevated)" }} />
        )}
      </div>
      <div className="mt-3 pt-3" style={{ borderTop: "1px solid var(--border-subtle)" }}>
        <Live c={closer} />
      </div>
    </div>
  );
  return champ ? (
    <div className="lb-champ-ring h-full p-[1.5px]" style={{ borderRadius: "var(--card-radius)" }}>
      {inner}
    </div>
  ) : (
    <div className="h-full p-px" style={{ borderRadius: "var(--card-radius)", background: `color-mix(in srgb, ${medal} 45%, var(--border))` }}>
      {inner}
    </div>
  );
}

/** The plinth under each card: taller for higher places, the rank cut into it. */
function Plinth({ rank }: { rank: number }) {
  const medal = MEDAL[rank];
  return (
    <div
      className="hidden md:flex items-start justify-center overflow-hidden"
      aria-hidden
      style={{
        height: PLINTH[rank],
        marginTop: 10,
        borderRadius: "14px 14px 4px 4px",
        background: `linear-gradient(180deg, color-mix(in srgb, ${medal} 22%, var(--bg-surface)), transparent)`,
        borderTop: `2px solid ${medal}`,
      }}
    >
      <span
        className="lb-numeral font-black leading-none select-none"
        style={{ fontSize: PLINTH[rank] + 18, WebkitTextStroke: `1.5px ${medal}`, color: "transparent", opacity: 0.55 }}
      >
        {rank}
      </span>
    </div>
  );
}

/**
 * The podium on a phone: all three in one row, second, first, third, on
 * short stepped plinths. Each keeps its medal, mark, figure and curve; a
 * tap opens the wallet in Tracker.
 */
const MINI_PLINTH: Record<number, number> = { 1: 34, 2: 24, 3: 16 };

function MiniPodium({ rows, sort, detail }: { rows: Row[]; sort: LbSort; detail: Map<string, Closer> | null }) {
  const [first, second, third] = rows;
  const col = (r: Row | undefined, delay: number) => {
    if (!r) return <div />;
    const champ = r.rank === 1;
    const medal = MEDAL[r.rank];
    const head = sort === "pnl" ? r.pnl : r.volume;
    const closer = detail?.get(r.address);
    const card = (
      <div className="flex flex-col items-center text-center px-2 pt-2.5 pb-2" style={{ background: "var(--bg-surface)", borderRadius: 13 }}>
        <span className="relative">
          <Identicon address={r.address} size={champ ? 36 : 30} />
          <span
            className="absolute -bottom-1.5 -right-1.5 w-[18px] h-[18px] rounded-full inline-flex items-center justify-center text-[10px] font-black mono"
            style={{ background: medal, color: "#1A1A19", boxShadow: "0 0 0 2px var(--bg-surface)" }}
          >
            {r.rank}
          </span>
        </span>
        <span className="mt-2 mono text-[10.5px] font-semibold max-w-full truncate" style={{ color: "var(--text-muted)" }}>
          {`${r.address.slice(0, 4)}…${r.address.slice(-4)}`}
        </span>
        <span
          className={`mt-1 font-bold tabular-nums leading-none max-w-full truncate ${champ ? "text-[17px]" : "text-[14.5px]"}`}
          style={{ color: sort === "pnl" ? toneOf(r.pnl) : "var(--text)", letterSpacing: "-0.03em" }}
        >
          {sort === "pnl" ? signed(head) : usd(head)}
        </span>
        <div className="mt-1.5 w-full">
          {closer ? (
            <Spark values={closer.chart.map((p) => p.pnl)} height={22} />
          ) : (
            <div className="animate-pulse rounded-[6px]" style={{ height: 22, background: "var(--bg-elevated)" }} />
          )}
        </div>
      </div>
    );
    return (
      <Link
        href={trackHref(r.address)}
        className="lb-rise flex flex-col"
        style={{ animationDelay: `${delay}ms` }}
        aria-label={`Rank ${r.rank}: ${short(r.address)}, open in Tracker`}
      >
        {champ ? (
          <div className="lb-champ-ring p-[1.5px]" style={{ borderRadius: 14 }}>
            {card}
          </div>
        ) : (
          <div className="p-px" style={{ borderRadius: 14, background: `color-mix(in srgb, ${medal} 45%, var(--border))` }}>
            {card}
          </div>
        )}
        <div
          className="mt-1.5 flex items-start justify-center overflow-hidden"
          aria-hidden
          style={{
            height: MINI_PLINTH[r.rank],
            borderRadius: "8px 8px 3px 3px",
            background: `linear-gradient(180deg, color-mix(in srgb, ${medal} 24%, var(--bg-surface)), transparent)`,
            borderTop: `2px solid ${medal}`,
          }}
        />
      </Link>
    );
  };
  return (
    <div className="relative">
      <div
        className="pointer-events-none absolute left-1/2 top-0 -translate-x-1/2 w-[60%] h-full blur-2xl opacity-60"
        aria-hidden
        style={{ background: `radial-gradient(closest-side, color-mix(in srgb, ${MEDAL[1]} 22%, transparent), transparent)` }}
      />
      <div className="relative grid grid-cols-[1fr_1.12fr_1fr] items-end gap-2">
        {col(second, 120)}
        {col(first, 0)}
        {col(third, 220)}
      </div>
    </div>
  );
}

export function Podium({
  rows,
  sort,
  win,
  detail,
  wl,
  where,
}: {
  rows: Row[];
  sort: LbSort;
  win: LbWindow;
  detail: Map<string, Closer> | null;
  wl: Watchlist;
  where: Map<string, LbWindow[]> | null;
}) {
  // Under 768px, the compact row; the full cards from there up.
  const compact = useCompact(767);
  const [first, second, third] = rows;
  if (!first) return null;
  if (compact) return <MiniPodium rows={rows} sort={sort} detail={detail} />;
  const place = (r: Row | undefined, cls: string, delay: number) =>
    r ? (
      <div className={`lb-rise flex flex-col ${cls}`} style={{ animationDelay: `${delay}ms` }}>
        <Card r={r} sort={sort} win={win} closer={detail?.get(r.address)} wl={wl} where={where?.get(r.address)} />
        <Plinth rank={r.rank} />
      </div>
    ) : (
      <div className={cls} />
    );
  return (
    <div className="relative">
      {/* A low gold light behind the champion. */}
      <div
        className="pointer-events-none absolute left-1/2 top-0 -translate-x-1/2 w-[70%] h-[70%] blur-3xl opacity-60"
        aria-hidden
        style={{ background: `radial-gradient(closest-side, color-mix(in srgb, ${MEDAL[1]} 22%, transparent), transparent)` }}
      />
      <div className="relative grid grid-cols-2 md:grid-cols-3 md:items-end gap-3 md:gap-4">
        {place(first, "col-span-2 md:col-span-1 md:order-2", 0)}
        {place(second, "md:order-1 md:mt-0", 120)}
        {place(third, "md:order-3", 220)}
      </div>
    </div>
  );
}
