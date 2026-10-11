"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { ArrowRight, Search, X } from "lucide-react";
import { isAddress } from "@/lib/watchlistAddress";
import { WalletView } from "@/components/wallet/WalletView";
import { Identicon, shortAddr } from "@/components/wallet/ui";
import { WatchlistView } from "@/components/watchlist/WatchlistView";

const RECENT_KEY = "sodex-tracker-recent";

/** Wallets this browser looked at lately: a convenience, so storage failing is fine. */
function readRecent(): string[] {
  try {
    const v = JSON.parse(localStorage.getItem(RECENT_KEY) ?? "[]");
    return Array.isArray(v) ? v.filter((x) => typeof x === "string" && isAddress(x)).slice(0, 6) : [];
  } catch {
    return [];
  }
}
function remember(address: string) {
  try {
    const next = [address, ...readRecent().filter((a) => a.toLowerCase() !== address.toLowerCase())].slice(0, 6);
    localStorage.setItem(RECENT_KEY, JSON.stringify(next));
  } catch {
    /* private mode: nothing to remember */
  }
}

function SearchBox({ initial = "", big = false, onSubmit }: { initial?: string; big?: boolean; onSubmit: (a: string) => void }) {
  const [q, setQ] = useState(initial);
  const [bad, setBad] = useState(false);
  return (
    <form
      role="search"
      onSubmit={(e) => {
        e.preventDefault();
        const a = q.trim();
        if (!isAddress(a)) return setBad(true);
        setBad(false);
        onSubmit(a);
      }}
      className="w-full"
    >
      <div
        className={`flex items-center gap-2 rounded-[14px] transition-shadow focus-within:shadow-[0_0_0_3px_var(--accent-dim)] ${big ? "h-12 sm:h-14 pl-3.5 sm:pl-4 pr-1.5 sm:pr-2" : "h-10 pl-3 pr-1.5"}`}
        style={{ background: "var(--bg-surface)", border: `1px solid ${bad ? "var(--red)" : "var(--border)"}`, boxShadow: "var(--card-shadow)" }}
      >
        <Search size={big ? 18 : 14} style={{ color: "var(--text-faint)" }} aria-hidden />
        <input
          value={q}
          onChange={(e) => {
            setQ(e.target.value);
            setBad(false);
          }}
          placeholder="Paste a wallet address (0x…)"
          aria-label="Wallet address"
          aria-invalid={bad}
          spellCheck={false}
          autoComplete="off"
          className={`flex-1 min-w-0 bg-transparent outline-none mono ${big ? "text-[14px] sm:text-[15px]" : "text-[13px]"}`}
          style={{ color: "var(--text)" }}
        />
        {q && (
          <button type="button" aria-label="Clear" onClick={() => setQ("")} className="w-7 h-7 inline-flex items-center justify-center rounded-[8px]" style={{ color: "var(--text-faint)" }}>
            <X size={14} />
          </button>
        )}
        <button
          type="submit"
          className={`shrink-0 inline-flex items-center gap-1.5 rounded-[10px] font-semibold ${big ? "h-9 sm:h-10 px-3.5 sm:px-4 text-[13px] sm:text-[13.5px]" : "h-8 sm:h-7 px-3 text-[12px]"}`}
          style={{ background: "var(--text)", color: "var(--bg)" }}
        >
          Track <ArrowRight size={big ? 15 : 13} />
        </button>
      </div>
      {bad && (
        <p role="alert" className="mt-2 text-[12px]" style={{ color: "var(--red)" }}>
          That isn&apos;t a wallet address. It should start with 0x and have 40 characters after it.
        </p>
      )}
    </form>
  );
}

/** /tracker: anyone's wallet, by address. The address lives in the URL, so every view is a link. */
export function TrackerView() {
  const params = useSearchParams();
  const router = useRouter();
  const raw = params.get("address")?.trim() ?? "";
  const address = isAddress(raw) ? raw : null;
  const [recent, setRecent] = useState<string[]>([]);

  useEffect(() => {
    if (address) remember(address);
  }, [address]);
  // Read after mount: storage isn't there during the server render.
  useEffect(() => {
    const id = setTimeout(() => setRecent(readRecent()), 0);
    return () => clearTimeout(id);
  }, [address]);

  const go = (a: string) => router.push(`/tracker?address=${a}`);

  return (
    <main className="max-w-[1240px] mx-auto px-4 sm:px-6 pt-[84px] sm:pt-[96px] pb-20">
      {address ? (
        <>
          <div className="flex justify-end">
            <div className="w-full sm:w-[440px]">
              <SearchBox key={address} onSubmit={go} />
            </div>
          </div>
          <WalletView key={address} address={address} />
        </>
      ) : (
        <>
          <section className="pt-6 sm:pt-12 pb-8 sm:pb-10 max-w-[720px] mx-auto text-center">
            <h1 className="text-[32px] sm:text-[44px] font-semibold leading-[1.05]" style={{ color: "var(--text)", letterSpacing: "-0.035em" }}>
              Look inside any SoDEX wallet
            </h1>
            <p className="mt-3 text-[14px]" style={{ color: "var(--text-muted)" }}>
              Net worth, open positions and liquidation levels, trading record, Wealth and staking, money in and out.
            </p>
            <div className="mt-7 text-left">
              <SearchBox big onSubmit={go} />
              {raw && !address && (
                <p role="alert" className="mt-2 text-[12px]" style={{ color: "var(--red)" }}>
                  The link had an address that isn&apos;t valid.
                </p>
              )}
            </div>
            {recent.length > 0 && (
              <div className="mt-5 flex flex-wrap items-center justify-center gap-2">
                <span className="text-[12px]" style={{ color: "var(--text-faint)" }}>
                  Recently tracked
                </span>
                {recent.map((a) => (
                  <button
                    key={a}
                    type="button"
                    onClick={() => go(a)}
                    className="inline-flex items-center gap-2 h-8 pl-1 pr-2.5 rounded-full text-[12px] mono transition-colors hover:bg-[var(--bg-elevated)]"
                    style={{ border: "1px solid var(--border)", color: "var(--text)" }}
                  >
                    <Identicon address={a} size={22} />
                    {shortAddr(a)}
                  </button>
                ))}
              </div>
            )}
          </section>
          <div className="max-w-[880px] mx-auto">
            <WatchlistView compact onTrack={go} />
          </div>
        </>
      )}
    </main>
  );
}
