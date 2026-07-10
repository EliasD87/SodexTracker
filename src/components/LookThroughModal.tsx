"use client";

import { useEffect, useState } from "react";
import { X, ScanSearch } from "lucide-react";
import { cachedApiFetch } from "@/lib/fetchCache";
import { sodexCoinToIndexTicker } from "@/lib/indexMeta";
import { LookThroughCard } from "@/components/LookThroughCard";

const GW_BASE = "https://mainnet-gw.sodex.dev/api/v1";

interface SpotBalanceItem {
  coin: string;
  total: string;
  locked: string;
}
interface SpotBalancesData {
  balances: SpotBalanceItem[];
}

type Status = "loading" | "no-index" | "error" | "ready";

/**
 * Standalone popup for the Intelligence page: given any wallet address, fetch
 * its SoDEX spot balances directly (public gateway data, no API key needed —
 * same endpoint TrackerPage uses) and render the Index Look-Through Sankey.
 */
export function LookThroughModal({ address, onClose }: { address: string; onClose: () => void }) {
  const [status, setStatus] = useState<Status>("loading");
  const [balances, setBalances] = useState<SpotBalanceItem[]>([]);

  useEffect(() => {
    let alive = true;
    setStatus("loading");
    cachedApiFetch<SpotBalancesData>(`${GW_BASE}/spot/accounts/${address}/balances`)
      .then((data) => {
        if (!alive) return;
        const hasIndex = data.balances.some((b) => sodexCoinToIndexTicker(b.coin));
        setBalances(data.balances);
        setStatus(hasIndex ? "ready" : "no-index");
      })
      .catch(() => alive && setStatus("error"));
    return () => {
      alive = false;
    };
  }, [address]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center p-4"
      style={{ background: "rgba(0,0,0,0.6)", backdropFilter: "blur(6px)" }}
      onClick={onClose}
    >
      <div
        className="relative w-full max-w-[640px] max-h-[88vh] overflow-y-auto rounded-2xl"
        style={{ background: "var(--bg-surface)", border: "1px solid var(--border)", boxShadow: "0 24px 64px rgba(0,0,0,0.4)" }}
        onClick={(e) => e.stopPropagation()}
      >
        <div
          className="sticky top-0 flex items-center justify-between px-5 py-4 z-10"
          style={{ background: "var(--bg-surface)", borderBottom: "1px solid var(--border-subtle)" }}
        >
          <div className="flex items-center gap-2.5 min-w-0">
            <span className="flex items-center justify-center rounded-lg shrink-0" style={{ width: 32, height: 32, background: "rgba(124,107,240,0.12)" }}>
              <ScanSearch size={16} style={{ color: "#7C6BF0" }} />
            </span>
            <div className="min-w-0">
              <div className="text-[15px] font-semibold" style={{ color: "var(--text)" }}>
                Index Look-Through
              </div>
              <div className="mono text-[10.5px] truncate" style={{ color: "var(--text-faint)" }}>
                {address}
              </div>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 flex items-center justify-center rounded-full shrink-0"
            style={{ background: "var(--bg-elevated)", color: "var(--text-muted)" }}
            aria-label="Close"
          >
            <X size={16} />
          </button>
        </div>

        <div className="p-5">
          {status === "loading" && (
            <div className="py-20 flex items-center justify-center">
              <div className="w-6 h-6 rounded-full animate-spin" style={{ border: "2px solid var(--border)", borderTopColor: "#7C6BF0" }} />
            </div>
          )}
          {status === "error" && (
            <div className="py-16 text-center text-[13px]" style={{ color: "var(--text-faint)" }}>
              Couldn’t look up that address. Double-check it and try again.
            </div>
          )}
          {status === "no-index" && (
            <div className="py-16 text-center text-[13px] max-w-[340px] mx-auto" style={{ color: "var(--text-faint)" }}>
              This wallet doesn’t hold any tokenized index products (MAG7, DeFi, or Meme) on SoDEX right now.
            </div>
          )}
          {status === "ready" && <LookThroughCard balances={balances} />}
        </div>
      </div>
    </div>
  );
}
