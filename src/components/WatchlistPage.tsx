"use client";

import { useRouter } from "next/navigation";
import { Bookmark } from "lucide-react";
import { WatchlistPanel } from "@/components/WatchlistPanel";

/**
 * The /watchlist route. The panel itself is shared with the tracker's search
 * screen, which used to carry its own duplicate copy of all of this.
 */
export function WatchlistPage() {
  const router = useRouter();

  return (
    <div className="min-h-screen pt-[72px] pb-20" style={{ background: "var(--bg)" }}>
      <div className="max-w-[820px] mx-auto px-5 sm:px-8">
        <div className="flex flex-col items-center text-center mb-8 pt-8">
          <div
            className="flex items-center justify-center mb-4"
            style={{ width: 48, height: 48, borderRadius: 12, background: "var(--accent-dim)" }}
          >
            <Bookmark size={22} style={{ color: "var(--accent)" }} />
          </div>
          <h1
            className="text-[28px] sm:text-[36px] font-bold leading-none tracking-tight mb-3"
            style={{ color: "var(--text)", letterSpacing: "-0.02em" }}
          >
            Watchlist
          </h1>
          <p className="text-sm max-w-md" style={{ color: "var(--text-muted)" }}>
            Paste one address or a whole list. Sort them into groups, and jump to any wallet&apos;s
            full portfolio in a click.
          </p>
        </div>

        <WatchlistPanel onTrack={(addr) => router.push(`/tracker?address=${encodeURIComponent(addr)}`)} />
      </div>
    </div>
  );
}
