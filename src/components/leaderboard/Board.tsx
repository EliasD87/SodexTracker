"use client";

import { useRouter } from "next/navigation";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { usd } from "@/lib/analyticsFormat";
import { Identicon } from "@/components/wallet/ui";
import type { Watchlist } from "@/components/watchlist/useWatchlist";
import { edgeOf, type LbSort, type Row } from "@/components/leaderboard/data";
import { edgeText, MEDAL, short, signed, toneOf, trackHref, WatchStar } from "@/components/leaderboard/parts";

/**
 * The ranked list, plain: rank, wallet, the two figures and edge (PnL per
 * dollar traded). A row opens the wallet in Tracker; the star saves it.
 */

const GRID = "grid items-center gap-x-3 px-3 sm:px-4 grid-cols-[34px_1fr_auto] sm:grid-cols-[44px_minmax(0,1fr)_120px_110px_80px_28px]";

export function BoardRow({ r, sort, wl }: { r: Row; sort: LbSort; wl: Watchlist }) {
  const router = useRouter();
  const lead = sort === "pnl" ? r.pnl : r.volume;
  const edge = edgeOf(r);
  const pnlCell = (
    <span className="mono tabular-nums" style={{ color: toneOf(r.pnl) }}>
      {signed(r.pnl)}
    </span>
  );
  const volCell = <span className="mono tabular-nums" style={{ color: "var(--text-muted)" }}>{usd(r.volume)}</span>;
  return (
    <li
      onClick={() => router.push(trackHref(r.address))}
      className={`${GRID} py-2.5 cursor-pointer transition-colors hover:bg-[var(--bg-elevated)]`}
      style={{ borderTop: "1px solid var(--border-subtle)" }}
    >
      <span className="mono text-[12.5px] tabular-nums" style={{ color: MEDAL[r.rank] ?? "var(--text-faint)" }}>
        {r.rank.toLocaleString("en-US")}
      </span>

      <span className="flex items-center gap-2.5 min-w-0">
        <Identicon address={r.address} size={24} />
        <span className="mono text-[12.5px] truncate" style={{ color: "var(--text)" }}>
          {short(r.address)}
        </span>
      </span>

      {/* A phone keeps the ranked figure; the rest are on the wallet's page. */}
      <span className="sm:hidden text-right text-[13px] font-semibold">{sort === "pnl" ? pnlCell : <span className="mono tabular-nums">{usd(lead)}</span>}</span>
      <span className="hidden sm:block text-right text-[13px] font-semibold">{pnlCell}</span>
      <span className="hidden sm:block text-right text-[12.5px]">{volCell}</span>
      <span className="hidden sm:block mono text-[12px] text-right tabular-nums" style={{ color: edge == null ? "var(--text-faint)" : toneOf(edge) }}>
        {edgeText(edge)}
      </span>
      <span className="hidden sm:flex justify-end">
        <WatchStar wl={wl} address={r.address} />
      </span>
    </li>
  );
}

export function BoardHead({ sort }: { sort: LbSort }) {
  const on = (k: LbSort) => ({ color: sort === k ? "var(--text)" : "var(--text-faint)" });
  return (
    <div className={`${GRID} hidden sm:grid py-2.5 text-[11.5px]`} style={{ color: "var(--text-faint)" }}>
      <span>#</span>
      <span>Trader</span>
      <span className="text-right" style={on("pnl")}>PnL</span>
      <span className="text-right" style={on("volume")}>Volume</span>
      <span className="text-right" title="PnL as a share of volume traded">Edge</span>
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
