"use client";

import { useRouter } from "next/navigation";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { usd } from "@/lib/analyticsFormat";
import { Identicon } from "@/components/wallet/ui";
import type { Watchlist } from "@/components/watchlist/useWatchlist";
import { edgeOf, type LbSort, type LbWindow, type Row } from "@/components/leaderboard/data";
import { Badges, edgeText, CopyAddr, MEDAL, short, signed, toneOf, TrackLink, trackHref, WatchStar } from "@/components/leaderboard/parts";

/**
 * The ranked list. Each row's bar is the sorted figure against the biggest
 * on the page; edge is PnL per dollar traded. A row opens the wallet in
 * Tracker; the star saves it to the watchlist.
 */

export function BoardRow({
  r,
  sort,
  win,
  max,
  wl,
  where,
  highlight = false,
  delay = 0,
}: {
  r: Row;
  sort: LbSort;
  win: LbWindow;
  max: number;
  wl: Watchlist;
  where: LbWindow[] | undefined;
  highlight?: boolean;
  /** Entrance stagger, ms. */
  delay?: number;
}) {
  const router = useRouter();
  const lead = sort === "pnl" ? r.pnl : r.volume;
  const share = Math.min(1, Math.abs(lead) / (max || 1));
  const barColor = sort === "pnl" ? toneOf(r.pnl) : "var(--text)";
  const medal = MEDAL[r.rank];
  const edge = edgeOf(r);
  return (
    <li
      onClick={() => router.push(trackHref(r.address))}
      className="lb-row group grid items-center gap-x-3 px-3 sm:px-4 py-2.5 cursor-pointer transition-colors hover:bg-[var(--bg-elevated)] grid-cols-[34px_1fr_auto] sm:grid-cols-[44px_minmax(0,1.5fr)_minmax(0,1.3fr)_100px_90px_72px]"
      style={{
        borderTop: "1px solid var(--border-subtle)",
        background: highlight ? "color-mix(in srgb, #E8B931 9%, transparent)" : undefined,
        boxShadow: highlight ? "inset 3px 0 0 #E8B931" : undefined,
        animationDelay: `${delay}ms`,
      }}
    >
      <span className="mono font-bold text-[13px] tabular-nums" style={{ color: medal ?? "var(--text-muted)" }}>
        {r.rank.toLocaleString("en-US")}
      </span>

      <span className="flex items-center gap-2.5 min-w-0">
        <Identicon address={r.address} size={28} />
        <span className="min-w-0">
          <span className="flex items-center gap-1">
            <span className="mono text-[12.5px] font-semibold truncate" style={{ color: "var(--text)" }}>
              {short(r.address)}
            </span>
            <span className="opacity-0 group-hover:opacity-100 transition-opacity hidden sm:inline-flex">
              <CopyAddr address={r.address} />
            </span>
          </span>
          <span className="block mt-0.5">
            <Badges where={where} win={win} />
          </span>
          {/* On a phone the other figures sit under the address. */}
          <span className="sm:hidden block mt-1 text-[11px] mono" style={{ color: "var(--text-faint)" }}>
            {sort === "pnl" ? `${usd(r.volume)} vol` : <span style={{ color: toneOf(r.pnl) }}>{signed(r.pnl)}</span>} · {edgeText(edge)}
          </span>
        </span>
      </span>

      {/* The sorted figure, with its bar */}
      <span className="hidden sm:flex items-center gap-3 min-w-0">
        <span className="flex-1 h-[6px] rounded-full overflow-hidden" style={{ background: "var(--bg-elevated)" }} aria-hidden>
          <span
            className="lb-bar block h-full rounded-full"
            style={{ width: `${Math.max(2, share * 100)}%`, background: barColor, opacity: medal ? 1 : 0.8 }}
          />
        </span>
        <span className="mono text-[13px] font-semibold tabular-nums w-[86px] text-right" style={{ color: sort === "pnl" ? toneOf(r.pnl) : "var(--text)" }}>
          {sort === "pnl" ? signed(r.pnl) : usd(r.volume)}
        </span>
      </span>
      <span className="sm:hidden text-right mono text-[13px] font-semibold tabular-nums" style={{ color: sort === "pnl" ? toneOf(r.pnl) : "var(--text)" }}>
        {sort === "pnl" ? signed(r.pnl) : usd(r.volume)}
      </span>

      <span className="hidden sm:block mono text-[12.5px] text-right tabular-nums" style={{ color: sort === "pnl" ? "var(--text-muted)" : toneOf(r.pnl) }}>
        {sort === "pnl" ? usd(r.volume) : signed(r.pnl)}
      </span>
      <span
        className="hidden sm:block mono text-[12px] text-right tabular-nums"
        style={{ color: edge == null ? "var(--text-faint)" : toneOf(edge) }}
        title="PnL as a share of volume traded"
      >
        {edgeText(edge)}
      </span>
      <span className="hidden sm:flex justify-end items-center">
        <WatchStar wl={wl} address={r.address} />
        <TrackLink address={r.address} />
      </span>
    </li>
  );
}

export function BoardHead({ sort }: { sort: LbSort }) {
  return (
    <div
      className="hidden sm:grid items-center gap-x-3 px-4 pb-2 text-[10.5px] font-semibold uppercase tracking-[0.08em] grid-cols-[44px_minmax(0,1.5fr)_minmax(0,1.3fr)_100px_90px_72px]"
      style={{ color: "var(--text-faint)" }}
    >
      <span>#</span>
      <span>Trader</span>
      <span className="text-right pr-1">{sort === "pnl" ? "PnL" : "Volume"}</span>
      <span className="text-right">{sort === "pnl" ? "Volume" : "PnL"}</span>
      <span className="text-right" title="PnL as a share of volume traded">
        Edge
      </span>
      <span />
    </div>
  );
}

export function Pager({ page, pages, onPage }: { page: number; pages: number; onPage: (p: number) => void }) {
  const btn =
    "w-9 h-9 inline-flex items-center justify-center rounded-[10px] transition-colors hover:bg-[var(--bg-elevated)] disabled:opacity-30 disabled:hover:bg-transparent";
  return (
    <div className="flex items-center justify-between gap-3 px-3 sm:px-4 py-3" style={{ borderTop: "1px solid var(--border-subtle)" }}>
      <button type="button" className={btn} disabled={page <= 1} onClick={() => onPage(page - 1)} aria-label="Previous page" style={{ color: "var(--text)" }}>
        <ChevronLeft size={16} />
      </button>
      <form
        className="flex items-center gap-2 text-[12px]"
        style={{ color: "var(--text-muted)" }}
        onSubmit={(e) => {
          e.preventDefault();
          const v = Number(new FormData(e.currentTarget).get("p"));
          if (Number.isFinite(v)) onPage(Math.min(pages, Math.max(1, Math.round(v))));
        }}
      >
        Page
        <input
          key={page}
          name="p"
          defaultValue={page}
          inputMode="numeric"
          aria-label="Go to page"
          className="w-14 h-8 px-2 text-center rounded-[8px] bg-transparent outline-none mono text-[16px] sm:text-[12.5px]"
          style={{ border: "1px solid var(--border)", color: "var(--text)" }}
        />
        of {pages.toLocaleString("en-US")}
      </form>
      <button type="button" className={btn} disabled={page >= pages} onClick={() => onPage(page + 1)} aria-label="Next page" style={{ color: "var(--text)" }}>
        <ChevronRight size={16} />
      </button>
    </div>
  );
}
