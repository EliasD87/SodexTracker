"use client";

import { useRouter } from "next/navigation";
import { WatchlistView } from "@/components/watchlist/WatchlistView";

/** /watchlist: wallets you keep an eye on, in groups, each one click from its full profile. */
export function WatchlistPage() {
  const router = useRouter();
  return (
    <main className="max-w-[880px] mx-auto px-4 sm:px-6 pt-[84px] sm:pt-[96px] pb-20">
      <h1 className="text-[26px] sm:text-[32px] font-semibold leading-none" style={{ color: "var(--text)", letterSpacing: "-0.03em" }}>
        Watchlist
      </h1>
      <p className="mt-2 mb-5 sm:mb-6 text-[13px]" style={{ color: "var(--text-muted)" }}>
        Wallets you keep an eye on. Click one to see it in full.
      </p>
      <WatchlistView onTrack={(a) => router.push(`/tracker?address=${a}`)} />
    </main>
  );
}
