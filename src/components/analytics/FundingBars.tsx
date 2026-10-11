"use client";

import type { MarketRow } from "@/lib/exchangeAnalytics";
import { signedPct, usd } from "@/lib/analyticsFormat";
import { Card } from "@/components/analytics/ui";

/** Perps with at least this much average open interest — below it, funding is noise. */
export const FUNDING_MIN_OI = 100_000;

/** Diverging bars: the most one-sided funding in each direction. */
export function FundingBars({ markets }: { markets: MarketRow[] }) {
  const eligible = markets.filter((m) => m.kind === "perp" && m.fundingAnnual != null && (m.oiAvg ?? 0) >= FUNDING_MIN_OI);
  const sorted = [...eligible].sort((a, b) => b.fundingAnnual! - a.fundingAnnual!);
  const pos = sorted.filter((m) => m.fundingAnnual! > 0).slice(0, 6);
  const neg = sorted.filter((m) => m.fundingAnnual! < 0).slice(-6);
  const rows = [...pos, ...neg];
  const maxAbs = Math.max(...rows.map((m) => Math.abs(m.fundingAnnual!)), 0.0001);

  if (!rows.length) {
    return <p className="text-[13px]" style={{ color: "var(--text-faint)" }}>No funding data for this window.</p>;
  }

  return (
    <Card className="p-4 sm:p-5">
      <div className="flex flex-wrap gap-x-5 gap-y-2 mb-4 text-[12px]" style={{ color: "var(--text-muted)" }}>
        <span className="flex items-center gap-2">
          <span className="w-3 h-3 rounded-[3px]" style={{ background: "var(--div-pos)" }} />
          Longs pay shorts
        </span>
        <span className="flex items-center gap-2">
          <span className="w-3 h-3 rounded-[3px]" style={{ background: "var(--div-neg)" }} />
          Shorts pay longs
        </span>
      </div>
      <div className="flex flex-col gap-1.5">
        {rows.map((m) => {
          const v = m.fundingAnnual!;
          // The longest bar stops short of the edge so its value label still
          // fits outside it, instead of running into the market name.
          const w = (Math.abs(v) / maxAbs) * 34;
          return (
            <div key={m.symbol} className="grid grid-cols-[72px_1fr] sm:grid-cols-[110px_1fr] items-center gap-2 sm:gap-3">
              <span className="mono text-[12px] truncate" style={{ color: "var(--text)" }}>
                {m.symbol.replace("-USD", "")}
              </span>
              <div className="relative h-6">
                <div className="absolute top-0 bottom-0 left-1/2 w-px" style={{ background: "var(--chart-axis)" }} />
                <div
                  className="absolute top-1/2 -translate-y-1/2 h-[14px]"
                  style={{
                    width: `${w}%`,
                    left: v >= 0 ? "50%" : `${50 - w}%`,
                    background: v >= 0 ? "var(--div-pos)" : "var(--div-neg)",
                    borderRadius: v >= 0 ? "0 4px 4px 0" : "4px 0 0 4px",
                  }}
                />
                <span
                  className="absolute top-1/2 -translate-y-1/2 mono text-[11px] whitespace-nowrap"
                  style={{
                    color: "var(--text-muted)",
                    ...(v >= 0 ? { left: `calc(${50 + w}% + 6px)` } : { right: `calc(${50 + w}% + 6px)` }),
                  }}
                >
                  {signedPct(v, 1)}
                </span>
              </div>
            </div>
          );
        })}
      </div>
      <p className="text-[11px] mt-4" style={{ color: "var(--text-faint)" }}>
        Annualised from each market&apos;s average funding over the window. Perps with at least {usd(FUNDING_MIN_OI, 0)} average
        open interest.
      </p>
    </Card>
  );
}
