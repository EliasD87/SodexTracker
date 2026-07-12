"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { cachedApiFetch } from "@/lib/fetchCache";
import { prettyIndexName, sectorIcon } from "@/lib/indexMeta";

interface IndexSnapshot {
  price: number;
  change_pct_24h: number;
  roi_7d: number;
}
interface OverviewItem {
  ticker: string;
  tradeableOnSodex: boolean;
  snapshot: IndexSnapshot | null;
}

const prettyName = prettyIndexName;
/* Index values are levels (points), not the USD price of the SoDEX token. */
const fmtLevel = (n: number) => n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fmtPct = (n: number) => (n >= 0 ? "+" : "") + (n * 100).toFixed(2) + "%";
const tone = (n: number) => (n > 0 ? "var(--green)" : n < 0 ? "var(--red)" : "var(--text-muted)");

export function IndexStrip() {
  const [items, setItems] = useState<OverviewItem[] | null>(null);

  useEffect(() => {
    cachedApiFetch<OverviewItem[]>("/api/sosovalue/indices")
      .then(setItems)
      .catch(() => setItems([]));
  }, []);

  // tradeable first, then biggest movers; cap the strip
  const ordered = (items ?? [])
    .filter((i) => i.snapshot)
    .sort((a, b) => {
      if (a.tradeableOnSodex !== b.tradeableOnSodex) return a.tradeableOnSodex ? -1 : 1;
      return (b.snapshot?.change_pct_24h ?? 0) - (a.snapshot?.change_pct_24h ?? 0);
    })
    .slice(0, 8);

  return (
    <section className="py-10 sm:py-16 border-b" style={{ borderColor: "var(--border-subtle)" }}>
      <div className="max-w-[1200px] mx-auto px-5">
        <div className="flex items-end justify-between mb-5 sm:mb-8">
          <div>
            <div className="tag mb-2 flex items-center gap-2" style={{ color: "#7C6BF0" }}>
              <span className="w-5 h-px" style={{ background: "#7C6BF0" }} />
              SOSOVALUE · SECTOR INDICES
            </div>
            <h2 className="text-xl sm:text-[28px] font-bold tracking-tight leading-none" style={{ color: "var(--text)", letterSpacing: "-0.02em" }}>
              Index Intelligence <span style={{ color: "var(--text-faint)" }}>— what’s inside</span>
            </h2>
          </div>
          <Link
            href="/intelligence"
            prefetch
            className="hidden sm:flex items-center gap-1.5 text-xs mono transition-colors"
            style={{ color: "var(--text-faint)" }}
            onMouseEnter={(e) => ((e.currentTarget as HTMLElement).style.color = "#7C6BF0")}
            onMouseLeave={(e) => ((e.currentTarget as HTMLElement).style.color = "var(--text-faint)")}
          >
            EXPLORE ALL <ArrowRight size={13} />
          </Link>
        </div>

        {!items ? (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="rounded-[14px] h-[104px] animate-pulse" style={{ background: "var(--bg-elevated)" }} />
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {ordered.slice(0, 4).map((item) => {
              const s = item.snapshot!;
              const Icon = sectorIcon(item.ticker);
              return (
                <Link
                  key={item.ticker}
                  href="/intelligence"
                  prefetch
                  className="rounded-[14px] p-3.5 transition-all"
                  style={{ background: "var(--bg-surface)", border: "1px solid var(--border)" }}
                  onMouseEnter={(e) => { e.currentTarget.style.background = "var(--bg-elevated)"; e.currentTarget.style.transform = "translateY(-2px)"; }}
                  onMouseLeave={(e) => { e.currentTarget.style.background = "var(--bg-surface)"; e.currentTarget.style.transform = "translateY(0)"; }}
                >
                  <div className="flex items-center justify-between mb-2.5">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="flex items-center justify-center rounded-lg shrink-0" style={{ width: 26, height: 26, background: "rgba(124,107,240,0.12)" }}>
                        <Icon size={13} style={{ color: "#7C6BF0" }} />
                      </span>
                      <span className="text-[13px] font-semibold truncate" style={{ color: "var(--text)" }}>{prettyName(item.ticker)}</span>
                    </div>
                    {item.tradeableOnSodex && (
                      <span className="text-[8px] font-bold px-1 py-0.5 rounded leading-none shrink-0" style={{ background: "var(--green-tint)", color: "var(--green)" }}>
                        SODEX
                      </span>
                    )}
                  </div>
                  <div className="flex items-baseline justify-between">
                    <span className="text-[17px] font-semibold tracking-tight tabular-nums" style={{ color: "var(--text)" }}>
                      {fmtLevel(s.price)}
                      <span className="text-[9px] font-medium ml-1" style={{ color: "var(--text-faint)" }}>pts</span>
                    </span>
                    <span className="text-[11.5px] font-semibold tabular-nums" style={{ color: tone(s.change_pct_24h) }}>{fmtPct(s.change_pct_24h)}</span>
                  </div>
                </Link>
              );
            })}
          </div>
        )}
      </div>
    </section>
  );
}
