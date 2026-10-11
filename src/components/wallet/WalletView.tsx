"use client";

import { useEffect, useState } from "react";
import { Bookmark, BookmarkCheck, Plus, RefreshCw, Check, Copy, Link2 } from "lucide-react";
import { forgetWallet, type WalletWindow } from "@/lib/wallet/api";
import { useWallet } from "@/components/wallet/useWallet";
import { NetWorthCard, PerformanceCard, PositionsCard } from "@/components/wallet/SummaryCards";
import { ActivityCard, CalendarCard, HoldingsCard, MarketPnlCard, RecordCard, TransfersCard, WealthCard } from "@/components/wallet/DetailCards";
import { ago, CopyButton, Identicon, shortAddr } from "@/components/wallet/ui";
import { usePortfolio } from "@/components/PortfolioProvider";
import { useCompact } from "@/components/analytics/hooks";
import { useWatchlist } from "@/components/watchlist/useWatchlist";

/**
 * One wallet, in full. Used by the Tracker (anyone's wallet) and by Portfolio
 * (your own): the same cards, with `banner` and `actions` set by the page.
 */
export function WalletView({
  address,
  banner,
  actions,
  label,
}: {
  address: string;
  /** A line above the header, e.g. where a saved wallet is stored. */
  banner?: React.ReactNode;
  /** Extra buttons in the header. */
  actions?: React.ReactNode;
  /** A saved name, shown over the address. */
  label?: string | null;
}) {
  const [win, setWin] = useState<WalletWindow>("1Y");
  const [nonce, setNonce] = useState(0);
  const w = useWallet(address, win, nonce);
  const { addresses, addAddress } = usePortfolio();
  const saved = addresses.some((a) => a.address.toLowerCase() === address.toLowerCase());
  const wl = useWatchlist();
  const watched = wl.entries.some((e) => e.address.toLowerCase() === address.toLowerCase());
  const [, tick] = useState(0);
  const compact = useCompact();

  // "Updated 2m ago" stays true without a refetch.
  useEffect(() => {
    const id = setInterval(() => tick((x) => x + 1), 30_000);
    return () => clearInterval(id);
  }, []);
  const stamp = w.account.at;

  const refresh = () => {
    forgetWallet(address, w.accountId);
    setNonce((x) => x + 1);
  };
  const refreshing = w.account.loading && !!w.account.data;
  const lastTrade = w.activity.data?.trades[0]?.t ?? null;
  const ranks = w.ranks.data;

  if (w.account.error && !w.account.data) {
    return (
      <div className="mt-6 rounded-[20px] px-6 py-10 text-center" style={{ background: "var(--bg-surface)", border: "1px solid var(--border)" }}>
        <Identicon address={address} size={52} />
        <p className="mt-4 text-[15px] font-semibold" style={{ color: "var(--text)" }}>
          {shortAddr(address)}
        </p>
        <p className="mt-1 text-[13px]" style={{ color: "var(--text-muted)" }}>
          {w.account.error}
        </p>
        <button type="button" onClick={refresh} className="mt-4 h-9 px-4 rounded-[10px] text-[13px] font-medium" style={{ border: "1px solid var(--border)", color: "var(--text)" }}>
          Try again
        </button>
      </div>
    );
  }

  return (
    <div>
      {banner}
      {/* Identity */}
      <header className="mt-4 sm:mt-5 flex flex-wrap items-center justify-between gap-3 sm:gap-4">
        <div className="flex items-center gap-3 sm:gap-4 min-w-0">
          <Identicon address={address} size={compact ? 44 : 52} />
          <div className="min-w-0">
            {label && (
              <div className="text-[13px] font-medium truncate" style={{ color: "var(--text-muted)" }}>
                {label}
              </div>
            )}
            <h1 className="text-[22px] sm:text-[26px] font-semibold mono leading-tight" style={{ color: "var(--text)", letterSpacing: "-0.02em" }}>
              {shortAddr(address)}
            </h1>
            <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-[12px]" style={{ color: "var(--text-muted)" }}>
              {ranks?.pnl != null && <span>#{ranks.pnl.toLocaleString("en-US")} by PnL</span>}
              {ranks?.volume != null && <span>#{ranks.volume.toLocaleString("en-US")} by volume</span>}
              {lastTrade && <span>Last trade {ago(lastTrade)}</span>}
              {!ranks && !lastTrade && <span>&nbsp;</span>}
            </div>
          </div>
        </div>
        {/* On a phone: one row, the copy and watch buttons as icons, sliding sideways if it still doesn't fit. */}
        <div className={`flex items-center gap-2 ${compact ? "scroll-row flex-nowrap w-full" : "flex-wrap"}`}>
          <CopyButton text={address} label="Copy address">
            <span className="sr-only sm:not-sr-only">Address</span>
          </CopyButton>
          <CopyButton
            text={typeof window === "undefined" ? "" : `${window.location.origin}/tracker?address=${address}`}
            label="Copy a link to this wallet"
            icon={
              <>
                <Copy size={13} className="hidden sm:block" />
                <Link2 size={13} className="sm:hidden" />
              </>
            }
          >
            <span className="sr-only sm:not-sr-only">Link</span>
          </CopyButton>
          {wl.ready && (
            <button
              type="button"
              disabled={watched}
              onClick={() => void wl.add([address], { groupId: wl.groups[0]?.id ?? "main" })}
              className="shrink-0 inline-flex items-center gap-1.5 h-8 px-2.5 rounded-[9px] text-[12px] font-medium transition-colors hover:bg-[var(--bg-elevated)] disabled:hover:bg-transparent"
              style={{ border: "1px solid var(--border)", color: watched ? "var(--text-muted)" : "var(--text)" }}
              title={watched ? "In your watchlist" : "Save to your watchlist"}
            >
              {watched ? <BookmarkCheck size={13} style={{ color: "var(--green)" }} /> : <Bookmark size={13} />}
              <span className="sr-only sm:not-sr-only">{watched ? "Watching" : "Watchlist"}</span>
            </button>
          )}
          {!saved && (
            <button
              type="button"
              onClick={() => addAddress(address)}
              className="shrink-0 inline-flex items-center gap-1.5 h-8 px-2.5 rounded-[9px] text-[12px] font-medium whitespace-nowrap transition-colors hover:bg-[var(--bg-elevated)]"
              style={{ border: "1px solid var(--border)", color: "var(--text)" }}
              title="Save it in Portfolio, with your own wallets"
            >
              <Plus size={13} /> My wallets
            </button>
          )}
          {saved && actions == null && (
            <span className="shrink-0 inline-flex items-center gap-1.5 h-8 px-2.5 text-[12px] whitespace-nowrap" style={{ color: "var(--text-muted)" }}>
              <Check size={13} style={{ color: "var(--green)" }} /> In my wallets
            </span>
          )}
          {actions}
          <button
            type="button"
            onClick={refresh}
            disabled={refreshing}
            className="shrink-0 inline-flex items-center gap-1.5 h-8 px-2.5 rounded-[9px] text-[12px] font-medium whitespace-nowrap transition-colors hover:bg-[var(--bg-elevated)] disabled:opacity-60"
            style={{ border: "1px solid var(--border)", color: "var(--text)" }}
          >
            <RefreshCw size={13} className={refreshing ? "animate-spin" : ""} />
            {/* A phone keeps just the age: "2m ago". */}
            {stamp ? (compact ? ago(stamp) : `Updated ${ago(stamp)}`) : "Refresh"}
          </button>
        </div>
      </header>

      <div className="mt-5 sm:mt-6 grid grid-cols-1 lg:grid-cols-12 gap-3 sm:gap-4">
        <NetWorthCard w={w} />
        <PerformanceCard w={w} win={win} setWin={setWin} />
        <PositionsCard w={w} />
        <RecordCard w={w} />
        <MarketPnlCard w={w} />
        <CalendarCard chart={w.chartYear.data} />
        <HoldingsCard w={w} />
        <WealthCard w={w} />
        <TransfersCard w={w} />
        <ActivityCard w={w} />
      </div>
    </div>
  );
}
