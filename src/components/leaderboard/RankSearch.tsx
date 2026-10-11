"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { ArrowUpRight, Search, Star, X } from "lucide-react";
import { count, pct, usd } from "@/lib/analyticsFormat";
import { PillTabs } from "@/components/analytics/kit";
import { Identicon, LoadingDots } from "@/components/wallet/ui";
import type { Watchlist } from "@/components/watchlist/useWatchlist";
import { edgeOf, fetchPage, fetchRank, LB_WINDOWS, type LbSort, type LbWindow, type Row } from "@/components/leaderboard/data";
import { Badges, CopyAddr, edgeText, MEDAL, short, signed, toneOf, trackHref } from "@/components/leaderboard/parts";

/**
 * Find any wallet's place. Searching opens a card over the page with its
 * rank, how far up that is, its figures, and its rank the other way (by
 * volume when ranked by PnL, and back). The card has its own window and
 * order switches, starting from the board's; each answer is cached.
 */

type Found = { row: Row | null; other: Row | null; total: number };
type Answer = { key: string; found: Found | null; failed: boolean };

/** Where a rank sits: "Top 0.04%" near the top, "Bottom 2%" near the end. */
function standing(rank: number, total: number) {
  const f = rank / Math.max(1, total);
  const d = (x: number) => (x < 0.01 ? 2 : x < 0.1 ? 1 : 0);
  if (f <= 0.5) return `Top ${pct(Math.max(f, 0.0001), d(f))}`;
  const b = Math.max(1 - f, 0.0001);
  return `Bottom ${pct(b, d(b))}`;
}

function Card({
  address,
  win0,
  sort0,
  total,
  wl,
  where,
  onRanked,
}: {
  address: string;
  win0: LbWindow;
  sort0: LbSort;
  total: number;
  wl: Watchlist;
  where: LbWindow[] | undefined;
  onRanked: (ranked: boolean) => void;
}) {
  const [win, setWin] = useState(win0);
  const [sort, setSort] = useState(sort0);
  const [ans, setAns] = useState<Answer | null>(null);
  const key = `${address}|${win}|${sort}`;
  useEffect(() => {
    let live = true;
    Promise.all([
      fetchRank(win, sort, address),
      fetchRank(win, sort === "pnl" ? "volume" : "pnl", address).catch(() => null),
      fetchPage(win, sort, 1)
        .then((p) => p.total)
        .catch(() => total),
    ])
      .then(([row, other, n]) => {
        if (!live) return;
        setAns({ key, found: { row, other, total: n }, failed: false });
        if (win === win0 && sort === sort0) onRanked(!!row);
      })
      .catch(() => live && setAns({ key, found: null, failed: true }));
    return () => {
      live = false;
    };
    // `key` covers address, window and order; the rest are fixed for this card.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  const now = ans?.key === key ? ans : null;
  const r = now?.found?.row ?? null;
  const entry = wl.entries.find((e) => e.address.toLowerCase() === address);
  const winLabel = LB_WINDOWS.find((w) => w.value === win)!.label;
  return (
    <>
      <div className="flex items-center gap-3 pr-8">
        <Identicon address={address} size={40} />
        <div className="min-w-0">
          <div className="flex items-center gap-1">
            <span className="mono text-[14px] font-semibold" style={{ color: "var(--text)" }}>
              {short(address)}
            </span>
            <CopyAddr address={address} />
          </div>
          <div className="mt-0.5">
            <Badges where={where} win={win} />
          </div>
        </div>
      </div>

      {/* Its own switches: any window, either order. */}
      <div className="mt-4 flex flex-wrap items-center gap-2">
        <PillTabs label="Window" value={win} onChange={setWin} options={LB_WINDOWS} />
        <PillTabs
          label="Rank by"
          value={sort}
          onChange={setSort}
          options={[
            { value: "pnl", label: "PnL" },
            { value: "volume", label: "Volume" },
          ]}
        />
      </div>

      {!now ? (
        <div className="h-[236px] flex items-center justify-center text-[13px]" style={{ color: "var(--text-muted)" }}>
          <LoadingDots label="Looking it up" />
        </div>
      ) : now.failed ? (
        <p className="mt-5 text-[13px]" style={{ color: "var(--text-muted)" }}>
          SoDEX didn&apos;t answer. Try again in a moment.
        </p>
      ) : r ? (
        <>
          <div className="mt-5 flex items-end justify-between gap-3">
            <div>
              <div className="text-[10.5px] font-semibold uppercase tracking-[0.08em]" style={{ color: "var(--text-faint)" }}>
                Rank · {winLabel} by {sort === "pnl" ? "PnL" : "volume"}
              </div>
              <div
                className="mt-1 text-[48px] font-black leading-none tabular-nums"
                style={{ color: MEDAL[r.rank] ?? "var(--text)", letterSpacing: "-0.045em" }}
              >
                #{r.rank.toLocaleString("en-US")}
              </div>
            </div>
            <div className="text-right pb-1">
              <div className="text-[15px] font-bold" style={{ color: "var(--text)" }}>
                {standing(r.rank, now.found!.total)}
              </div>
              <div className="text-[11.5px]" style={{ color: "var(--text-faint)" }}>
                of {count(now.found!.total)} traders
              </div>
            </div>
          </div>
          {/* How far up: a bar with the wallet's place marked on it. */}
          <div className="mt-3 relative h-2 rounded-full" style={{ background: "var(--bg-elevated)" }} aria-hidden>
            <span
              className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 w-3.5 h-3.5 rounded-full"
              style={{
                left: `${Math.max(2, 100 - (r.rank / Math.max(1, now.found!.total)) * 100)}%`,
                background: MEDAL[r.rank] ?? "var(--text)",
                boxShadow: "0 0 0 3px var(--bg-surface)",
              }}
            />
          </div>
          <dl className="mt-5 grid grid-cols-3 gap-2">
            {[
              { k: "PnL", v: signed(r.pnl), c: toneOf(r.pnl) },
              { k: "Volume", v: usd(r.volume), c: "var(--text)" },
              { k: "Edge", v: edgeText(edgeOf(r)), c: edgeOf(r) == null ? "var(--text-faint)" : toneOf(edgeOf(r)!) },
            ].map((x) => (
              <div key={x.k} className="px-3 py-2.5 rounded-[10px]" style={{ background: "var(--bg-elevated)" }}>
                <dt className="text-[10.5px]" style={{ color: "var(--text-faint)" }}>
                  {x.k}
                </dt>
                <dd className="mt-1 mono text-[14px] font-semibold truncate" style={{ color: x.c }}>
                  {x.v}
                </dd>
              </div>
            ))}
          </dl>
          <p className="mt-3 text-[12px]" style={{ color: "var(--text-muted)" }}>
            By {sort === "pnl" ? "volume" : "PnL"}:{" "}
            <span className="mono font-semibold" style={{ color: "var(--text)" }}>
              {now.found?.other ? `#${now.found.other.rank.toLocaleString("en-US")}` : "not ranked"}
            </span>{" "}
            in {winLabel}
          </p>
        </>
      ) : (
        <p className="mt-5 text-[13px] leading-relaxed" style={{ color: "var(--text-muted)" }}>
          Not ranked in {winLabel} by {sort === "pnl" ? "PnL" : "volume"}: SoDEX only ranks wallets that traded or held a position in the window. Try another
          window above.
        </p>
      )}

      <div className="mt-5 grid grid-cols-2 gap-2">
        <Link
          href={trackHref(address)}
          className="h-10 inline-flex items-center justify-center gap-1.5 rounded-[10px] text-[13px] font-semibold"
          style={{ background: "var(--text)", color: "var(--bg)" }}
        >
          Open in Tracker <ArrowUpRight size={14} />
        </Link>
        <button
          type="button"
          disabled={!wl.ready}
          onClick={() => (entry ? void wl.remove(entry.id) : wl.groups[0] && void wl.add([address], { groupId: wl.groups[0].id }))}
          className="h-10 inline-flex items-center justify-center gap-1.5 rounded-[10px] text-[13px] font-semibold disabled:opacity-40"
          style={{ border: "1px solid var(--border)", color: "var(--text)" }}
        >
          <Star size={14} fill={entry ? "#E8B931" : "none"} style={{ color: entry ? "#E8B931" : undefined }} />
          {entry ? "In watchlist" : "Add to watchlist"}
        </button>
      </div>
    </>
  );
}

export function RankSearch({
  win,
  sort,
  total,
  wl,
  where,
  onFocus,
}: {
  win: LbWindow;
  sort: LbSort;
  total: number;
  wl: Watchlist;
  where: Map<string, LbWindow[]> | null;
  /** The wallet being looked at, so the field can ring it. */
  onFocus: (address: string | null) => void;
}) {
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const [found, setFound] = useState<string | "bad" | null>(null);

  const close = () => {
    setOpen(false);
    onFocus(null);
  };
  useEffect(() => {
    if (!open) return;
    const esc = (e: KeyboardEvent) => e.key === "Escape" && close();
    document.addEventListener("keydown", esc);
    return () => document.removeEventListener("keydown", esc);
    // `close` only changes with its setters, which are stable.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const search = () => {
    const a = q.trim().toLowerCase();
    setOpen(true);
    setFound(/^0x[0-9a-f]{40}$/.test(a) ? a : "bad");
  };

  return (
    <>
      <form
        role="search"
        className="flex items-center gap-2 h-9 pl-3 pr-1 rounded-[10px] w-full sm:w-[300px] focus-within:shadow-[0_0_0_3px_var(--accent-dim)] transition-shadow"
        style={{ background: "var(--bg-surface)", border: "1px solid var(--border)" }}
        onSubmit={(e) => {
          e.preventDefault();
          search();
        }}
      >
        <Search size={14} style={{ color: "var(--text-faint)" }} aria-hidden />
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Find a wallet's rank (0x…)"
          aria-label="Wallet address"
          spellCheck={false}
          autoComplete="off"
          enterKeyHint="search"
          className="flex-1 min-w-0 bg-transparent outline-none text-[16px] sm:text-[12.5px] mono"
          style={{ color: "var(--text)" }}
        />
        <button
          type="submit"
          disabled={!q.trim()}
          className="h-7 px-2.5 rounded-[8px] text-[12px] font-semibold disabled:opacity-40"
          style={{ background: "var(--text)", color: "var(--bg)" }}
        >
          Find
        </button>
      </form>

      {open &&
        createPortal(
          <div className="fixed inset-0 z-[90] flex items-end sm:items-center justify-center sm:p-6" role="dialog" aria-modal="true" aria-label="Wallet rank">
            <div
              className="absolute inset-0"
              style={{ background: "rgba(0,0,0,0.55)", backdropFilter: "blur(4px)", WebkitBackdropFilter: "blur(4px)" }}
              onClick={close}
            />
            <div
              className="lb-rise relative w-full sm:max-w-[440px] p-5 pb-[max(20px,env(safe-area-inset-bottom))] sm:pb-5 rounded-t-[22px] sm:rounded-[20px]"
              style={{ background: "var(--bg-surface)", border: "1px solid var(--border)", boxShadow: "0 30px 80px rgba(0,0,0,0.45)" }}
            >
              <button
                type="button"
                onClick={close}
                aria-label="Close"
                className="absolute top-3 right-3 w-8 h-8 inline-flex items-center justify-center rounded-[9px] hover:bg-[var(--bg-elevated)]"
                style={{ color: "var(--text-muted)" }}
              >
                <X size={16} />
              </button>
              {found === "bad" || found === null ? (
                <div className="py-4 pr-8">
                  <div className="text-[15px] font-semibold" style={{ color: "var(--text)" }}>
                    That isn&apos;t a wallet address
                  </div>
                  <p className="mt-2 text-[13px]" style={{ color: "var(--text-muted)" }}>
                    Paste a full address: 0x followed by 40 letters and numbers.
                  </p>
                </div>
              ) : (
                <Card
                  key={found}
                  address={found}
                  win0={win}
                  sort0={sort}
                  total={total}
                  wl={wl}
                  where={where?.get(found)}
                  onRanked={(ranked) => onFocus(ranked ? found : null)}
                />
              )}
            </div>
          </div>,
          document.body,
        )}
    </>
  );
}
