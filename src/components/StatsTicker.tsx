"use client";

import { useMemo, useRef, useState } from "react";
import { TokenIcon } from "@/components/TokenIcon";
import { useLandingData } from "@/components/LandingDataProvider";

interface Market {
  symbol: string;
  openInterest: string;
  markPrice: string;
  indexPrice: string;
  fundingRate: string;
  nextFundingTime: number;
  volume24h: number;
}

function fmtPrice(s: string): string {
  const p = parseFloat(s);
  if (!p) return "—";
  if (p >= 10_000) return "$" + p.toLocaleString("en-US", { maximumFractionDigits: 0 });
  if (p >= 100) return "$" + p.toFixed(2);
  if (p >= 1) return "$" + p.toFixed(4);
  if (p >= 0.01) return "$" + p.toFixed(5);
  return "$" + p.toFixed(6);
}

function fmtFR(s: string): { label: string; positive: boolean } {
  const n = parseFloat(s) * 100;
  return { label: (n >= 0 ? "+" : "") + n.toFixed(5) + "%", positive: n >= 0 };
}

function fmtCountdown(ms: number): string {
  const diff = ms - Date.now();
  if (diff <= 0) return "now";
  const h = Math.floor(diff / 3_600_000);
  const m = Math.floor((diff % 3_600_000) / 60_000);
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

function fmtUsd(n: number): string {
  if (n >= 1_000_000) return "$" + (n / 1_000_000).toFixed(2) + "M";
  if (n >= 1_000) return "$" + (n / 1_000).toFixed(1) + "K";
  return "$" + n.toFixed(2);
}

function fmtOI(oi: string, price: string): string {
  return fmtUsd(parseFloat(oi) * parseFloat(price));
}

export function StatsTicker() {
  const { markPricesRaw, vol24hRaw, loadingCards } = useLandingData();
  const [hovered, setHovered] = useState<Market | null>(null);
  const [tooltipX, setTooltipX] = useState(0);
  const outerRef = useRef<HTMLDivElement>(null);

  const markets = useMemo(() => {
    if (loadingCards && !markPricesRaw) return [] as Market[];
    const volMap: Record<string, number> = {};
    const dayMarkets = vol24hRaw?.data?.data?.[0]?.markets ?? {};
    for (const [sym, v] of Object.entries(dayMarkets)) {
      volMap[sym] = parseFloat(v as string);
    }
    const raw: Market[] = (markPricesRaw?.data ?? [])
      .filter((m: Market) => parseFloat(m.markPrice) > 0)
      .map((m: Market) => ({ ...m, volume24h: volMap[m.symbol] ?? 0 }));
    raw.sort(
      (a, b) =>
        parseFloat(b.openInterest) * parseFloat(b.markPrice) -
        parseFloat(a.openInterest) * parseFloat(a.markPrice)
    );
    return raw;
  }, [markPricesRaw, vol24hRaw, loadingCards]);

  const handleItemEnter = (m: Market, e: React.MouseEvent) => {
    const outerRect = outerRef.current?.getBoundingClientRect();
    const itemRect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    if (outerRect) {
      const cx = itemRect.left - outerRect.left + itemRect.width / 2;
      setTooltipX(Math.max(124, Math.min(cx, outerRect.width - 124)));
    }
    setHovered(m);
  };

  const doubled = [...markets, ...markets];
  const fr = hovered ? fmtFR(hovered.fundingRate) : null;

  return (
    <section className="py-5 sm:py-8">
      <div
        ref={outerRef}
        className="relative max-w-[1200px] mx-auto px-5"
      >
      {/* Hover tooltip — lives outside overflow-hidden so it can float above */}
      {hovered && fr && (
        <div
          className="absolute z-20 pointer-events-none"
          style={{
            bottom: "calc(100% + 8px)",
            left: tooltipX,
            transform: "translateX(-50%)",
            width: 248,
          }}
        >
          <div
            style={{
              background: "var(--panel-bg)",
              backdropFilter: "blur(20px)",
              WebkitBackdropFilter: "blur(20px)",
              border: "1px solid var(--panel-border)",
              borderRadius: "var(--r-card)",
              boxShadow: "0 12px 40px rgba(0,0,0,0.45)",
            }}
          >
            <div className="p-3.5">
              <div
                className="flex items-center gap-2 text-[13px] font-bold mono mb-3"
                style={{ color: "var(--text)", letterSpacing: "0.04em" }}
              >
                <TokenIcon symbol={hovered.symbol} size={18} />
                {hovered.symbol}
              </div>
              <div className="flex flex-col gap-[7px]">
                {(
                  [
                    ["Mark Price", fmtPrice(hovered.markPrice), "var(--text)"],
                    ["Index Price", fmtPrice(hovered.indexPrice), "var(--text-muted)"],
                    ["Open Interest", fmtOI(hovered.openInterest, hovered.markPrice), "var(--text)"],
                    ["24H Volume", hovered.volume24h ? fmtUsd(hovered.volume24h) : "—", "var(--text)"],
                    [
                      "Funding Rate",
                      fr.label,
                      fr.positive ? "var(--color-up)" : "var(--color-down)",
                    ],
                    ["Next Funding", `in ${fmtCountdown(hovered.nextFundingTime)}`, "var(--text-muted)"],
                  ] as [string, string, string][]
                ).map(([label, val, color]) => (
                  <div key={label} className="flex items-center justify-between gap-4">
                    <span
                      className="text-[9px] mono tracking-widest uppercase shrink-0"
                      style={{ color: "var(--text-faint)" }}
                    >
                      {label}
                    </span>
                    <span className="text-[11px] mono font-medium" style={{ color }}>
                      {val}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>
          {/* Arrow pointer */}
          <div
            style={{
              position: "absolute",
              bottom: -5,
              left: "50%",
              transform: "translateX(-50%) rotate(45deg)",
              width: 8,
              height: 8,
              background: "var(--panel-bg)",
              border: "1px solid var(--panel-border)",
              borderTop: "none",
              borderLeft: "none",
            }}
          />
        </div>
      )}

      {/* Scrolling strip */}
      <div className="overflow-hidden">
        {markets.length === 0 ? (
          <div
            className="h-9 flex items-center px-4 text-[10px] mono animate-pulse"
            style={{ color: "var(--text-faint)" }}
          >
            Loading markets…
          </div>
        ) : (
          <div
            className="ticker-track flex items-center h-9 select-none"
            style={{
              width: "max-content",
              animationDuration: `${Math.max(markets.length * 3, 60)}s`,
            }}
          >
            {doubled.map((m, i) => {
              const { label: frLabel, positive } = fmtFR(m.fundingRate);
              return (
                <div
                  key={`${m.symbol}-${i}`}
                  onMouseEnter={(e) => handleItemEnter(m, e)}
                  onMouseLeave={() => setHovered(null)}
                  className="flex items-center gap-2 px-3 sm:px-5 h-full cursor-default shrink-0"
                  style={{ borderRight: "1px solid var(--border)" }}
                >
                  <TokenIcon symbol={m.symbol} size={16} />
                  <span
                    className="text-[11px] mono font-semibold"
                    style={{ color: "var(--text)", letterSpacing: "0.03em" }}
                  >
                    {m.symbol}
                  </span>
                  <span className="text-[11px] mono" style={{ color: "var(--text-muted)" }}>
                    {fmtPrice(m.markPrice)}
                  </span>
                  <span
                    className="text-[10px] mono"
                    style={{ color: positive ? "var(--color-up)" : "var(--color-down)" }}
                  >
                    {frLabel}
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
    </section>
  );
}
