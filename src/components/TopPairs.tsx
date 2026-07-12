"use client";

import { useMemo, useState } from "react";
import { CornerMarks } from "@/components/CornerMarks";
import { PairAnalysisModal } from "@/components/PairAnalysisModal";
import { TokenIcon } from "@/components/TokenIcon";
import { RowActionButton } from "@/components/RowActionButton";
import { BarChart3 } from "lucide-react";
import { useLandingData } from "@/components/LandingDataProvider";

interface Pair {
  rank: number;
  symbol: string;
  markPrice: number;
  fundingRate: number;
  volume24h: number;
  oi: number;
  volumePct: number;
}

function fmtUsd(n: number): string {
  if (n >= 1_000_000_000) return "$" + (n / 1_000_000_000).toFixed(2) + "B";
  if (n >= 1_000_000) return "$" + (n / 1_000_000).toFixed(2) + "M";
  if (n >= 1_000) return "$" + (n / 1_000).toFixed(1) + "K";
  return "$" + n.toFixed(2);
}

function fmtPrice(p: number): string {
  if (!p) return "—";
  if (p >= 10_000) return "$" + p.toLocaleString("en-US", { maximumFractionDigits: 0 });
  if (p >= 100) return "$" + p.toFixed(2);
  if (p >= 1) return "$" + p.toFixed(4);
  return "$" + p.toFixed(6);
}

function fmtFR(fr: number): string {
  const n = fr * 100;
  return (n >= 0 ? "+" : "") + n.toFixed(5) + "%";
}

function MiniBar({ pct }: { pct: number }) {
  return (
    <div className="w-16 h-[3px] rounded-full overflow-hidden" style={{ background: "var(--border)" }}>
      <div className="h-full rounded-full" style={{ width: `${pct}%`, background: "var(--accent)" }} />
    </div>
  );
}

/** Kept for backwards-compat; delegates to the shared SoDEX TokenIcon. */
export function PairIcon({ symbol, size = 24 }: { symbol: string; size?: number }) {
  return <TokenIcon symbol={symbol} size={size} />;
}

export function TopPairs() {
  const { vol24hRaw, markPricesRaw, loadingCards } = useLandingData();
  const [analysisSymbol, setAnalysisSymbol] = useState<string | null>(null);

  const { pairs, loading } = useMemo(() => {
    if (loadingCards && !vol24hRaw) return { pairs: [] as Pair[], loading: true };
    const volMap: Record<string, number> = {};
    for (const [sym, v] of Object.entries(vol24hRaw?.data?.data?.[0]?.markets ?? {})) {
      volMap[sym] = parseFloat(v as string);
    }

    const priceMap: Record<string, number> = {};
    const frMap: Record<string, number> = {};
    const oiMap: Record<string, number> = {};
    for (const m of markPricesRaw?.data ?? []) {
      const price = parseFloat(m.markPrice);
      priceMap[m.symbol] = price;
      frMap[m.symbol] = parseFloat(m.fundingRate);
      oiMap[m.symbol] = parseFloat(m.openInterest) * price;
    }

    const rows = Object.keys(volMap)
      .map((sym) => ({
        symbol: sym,
        markPrice: priceMap[sym] ?? 0,
        fundingRate: frMap[sym] ?? 0,
        volume24h: volMap[sym] ?? 0,
        oi: oiMap[sym] ?? 0,
      }))
      .filter((r) => r.volume24h > 0 && r.markPrice > 0)
      .sort((a, b) => b.volume24h - a.volume24h)
      .slice(0, 10);

    const maxVol = rows[0]?.volume24h ?? 1;
    const ranked = rows.map((r, i) => ({
      ...r,
      rank: i + 1,
      volumePct: (r.volume24h / maxVol) * 100,
    }));

    return { pairs: ranked, loading: false };
  }, [vol24hRaw, markPricesRaw, loadingCards]);

  return (
    <section className="py-10 sm:py-16 border-b" style={{ borderColor: "var(--border-subtle)" }}>
      <div className="max-w-[1200px] mx-auto px-5">
        <div className="flex items-end justify-between mb-5 sm:mb-8">
          <div>
            <div className="tag mb-2 flex items-center gap-2" style={{ color: "var(--accent)" }}>
              <span className="w-5 h-px" style={{ background: "var(--accent)" }} />
              LIVE DATA · RANKED BY VOLUME
            </div>
            <h2 className="text-xl sm:text-[28px] font-bold tracking-tight leading-none" style={{ color: "var(--text)", letterSpacing: "-0.02em" }}>
              Top Pairs <span style={{ color: "var(--text-faint)" }}>— 24H</span>
            </h2>
          </div>
          <div className="flex items-center gap-1.5 tag" style={{ color: "var(--text-faint)" }}>
            <span className="live-dot w-1.5 h-1.5 rounded-full" style={{ background: "var(--accent)" }} />
            UPDATED LIVE
          </div>
        </div>

        <div className="relative overflow-hidden">
          <CornerMarks size={11} inset={-1} thickness={1.5} />
          {/* Head */}
          <div
            className="top-pairs-grid grid gap-4 px-4 sm:px-5 py-3 text-[10px] mono tracking-[0.08em]"
            style={{
              gridTemplateColumns: "28px 34px 1fr 130px 120px 120px",
              borderBottom: "1px solid var(--border-subtle)",
              color: "var(--text-faint)",
            }}
          >
            <span>#</span>
            <span className="top-pairs-col-action" />
            <span>PAIR</span>
            <span className="top-pairs-col-price text-right">PRICE</span>
            <span className="text-right">24H VOL</span>
            <span className="top-pairs-col-oi text-right">OI</span>
          </div>

          {/* Skeleton */}
          {loading &&
            Array.from({ length: 8 }).map((_, i) => (
              <div
                key={i}
                className="top-pairs-grid grid gap-4 px-4 sm:px-5 py-3.5 items-center"
                style={{
                  gridTemplateColumns: "28px 34px 1fr 130px 120px 120px",
                  borderTop: i > 0 ? "1px solid var(--border-subtle)" : undefined,
                }}
              >
                <div className="h-4 rounded-sm animate-pulse" style={{ background: "var(--border)" }} />
                <div className="top-pairs-col-action h-4 rounded-sm animate-pulse" style={{ background: "var(--border)" }} />
                <div className="h-4 rounded-sm animate-pulse" style={{ background: "var(--border)" }} />
                <div className="top-pairs-col-price h-4 rounded-sm animate-pulse" style={{ background: "var(--border)" }} />
                <div className="h-4 rounded-sm animate-pulse" style={{ background: "var(--border)" }} />
                <div className="top-pairs-col-oi h-4 rounded-sm animate-pulse" style={{ background: "var(--border)" }} />
              </div>
            ))}

          {/* Rows */}
          {!loading &&
            pairs.map((p, i) => (
              <div
                key={p.symbol}
                className="top-pairs-grid group grid gap-4 px-4 sm:px-5 py-3 sm:py-3.5 items-center cursor-pointer"
                style={{
                  gridTemplateColumns: "28px 34px 1fr 130px 120px 120px",
                  borderTop: i > 0 ? "1px solid var(--border-subtle)" : undefined,
                  boxShadow: "inset 0 0 0 0 var(--accent)",
                  transition: "background 0.12s ease, box-shadow 0.12s ease",
                }}
                onClick={() => setAnalysisSymbol(p.symbol)}
                onMouseEnter={(e) => {
                  (e.currentTarget as HTMLElement).style.background = "var(--bg-surface)";
                  (e.currentTarget as HTMLElement).style.boxShadow = "inset 2px 0 0 0 var(--accent)";
                }}
                onMouseLeave={(e) => {
                  (e.currentTarget as HTMLElement).style.background = "";
                  (e.currentTarget as HTMLElement).style.boxShadow = "inset 0 0 0 0 var(--accent)";
                }}
              >
                {/* Rank */}
                <span className="text-xs mono" style={{ color: "var(--text-faint)" }}>
                  {p.rank}
                </span>

                {/* Analysis icon (2nd column) */}
                <span className="top-pairs-col-action">
                  <RowActionButton onClick={(e) => { e.stopPropagation(); setAnalysisSymbol(p.symbol); }} title="View analysis">
                    <BarChart3 size={13} />
                  </RowActionButton>
                </span>

                {/* Pair */}
                <div className="flex items-center gap-2.5">
                  <PairIcon symbol={p.symbol} />
                  <span className="text-sm font-semibold mono" style={{ color: "var(--text)" }}>
                    {p.symbol}
                  </span>
                </div>

                {/* Price */}
                <span className="top-pairs-col-price text-sm mono text-right" style={{ color: "var(--text)" }}>
                  {fmtPrice(p.markPrice)}
                </span>

                {/* 24H Volume */}
                <span className="text-sm mono text-right" style={{ color: "var(--text)" }}>
                  {fmtUsd(p.volume24h)}
                </span>

                {/* OI */}
                <span className="top-pairs-col-oi text-sm mono text-right" style={{ color: "var(--text-muted)" }}>
                  {fmtUsd(p.oi)}
                </span>
              </div>
            ))}
        </div>

        <div className="mt-4 flex justify-end">
          <button
            className="text-xs mono transition-colors"
            style={{ color: "var(--text-faint)" }}
            onMouseEnter={(e) => ((e.currentTarget as HTMLElement).style.color = "var(--accent)")}
            onMouseLeave={(e) => ((e.currentTarget as HTMLElement).style.color = "var(--text-faint)")}
          >
            View all pairs →
          </button>
        </div>
      </div>

      {analysisSymbol && (
        <PairAnalysisModal symbol={analysisSymbol} onClose={() => setAnalysisSymbol(null)} />
      )}
    </section>
  );
}
