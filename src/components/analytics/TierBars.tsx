"use client";

import type { ExchangeAnalytics, TierSummary } from "@/lib/exchangeAnalytics";
import { pct } from "@/lib/analyticsFormat";
import { Card, TIER_COLOR, TIER_LABEL, TIER_RULE } from "@/components/analytics/ui";

/** Part-to-whole by activity tier: how markets, trades and volume split. */
export function TierBars({ data, bare = false }: { data: ExchangeAnalytics; /** Inside a panel: no card of its own. */ bare?: boolean }) {
  const totalMarkets = data.tiers.reduce((a, t) => a + t.markets, 0) || 1;
  const rows: { label: string; share: (t: TierSummary) => number }[] = [
    { label: "Markets", share: (t) => t.markets / totalMarkets },
    { label: "Trades", share: (t) => t.tradeShare },
    { label: "Volume", share: (t) => t.volumeShare },
  ];

  const body = (
    <>
      <div className="flex flex-wrap gap-x-5 gap-y-2 mb-5" role="list" aria-label="Legend">
        {data.tiers.map((t) => (
          <span key={t.tier} role="listitem" className="flex items-center gap-2 text-[12px]" style={{ color: "var(--text-muted)" }}>
            <span className="w-3 h-3 rounded-[3px]" style={{ background: TIER_COLOR[t.tier] }} />
            <span style={{ color: "var(--text)" }}>{TIER_LABEL[t.tier]}</span>
            {TIER_RULE[t.tier]}
          </span>
        ))}
      </div>

      <div className="flex flex-col gap-3.5">
        {rows.map((row) => (
          <div key={row.label} className="grid grid-cols-[64px_1fr] items-center gap-3">
            <span className="text-[12px]" style={{ color: "var(--text-muted)" }}>
              {row.label}
            </span>
            <div className="flex h-7 w-full gap-[2px]">
              {data.tiers.map((t) => {
                const s = row.share(t);
                if (s <= 0) return null;
                return (
                  <div
                    key={t.tier}
                    title={`${TIER_LABEL[t.tier]} · ${pct(s, s < 0.01 ? 2 : 1)} of ${row.label.toLowerCase()}`}
                    className="h-full flex items-center justify-center first:rounded-l-[4px] last:rounded-r-[4px]"
                    style={{ width: `${s * 100}%`, minWidth: 2, background: TIER_COLOR[t.tier] }}
                  >
                    {/* Only label a segment the text actually fits in. */}
                    {s >= 0.09 && (
                      <span className="mono text-[11px] font-semibold" style={{ color: t.tier === "thin" ? "var(--text)" : "var(--bg)" }}>
                        {pct(s, 0)}
                      </span>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>

      {/* The table twin: every value above, readable without hovering. */}
      <table className="w-full mt-5 text-[12px]">
        <thead>
          <tr style={{ color: "var(--text-faint)" }}>
            <th className="text-left font-normal py-1">Tier</th>
            <th className="text-right font-normal py-1">Markets</th>
            <th className="text-right font-normal py-1">Trades</th>
            <th className="text-right font-normal py-1">Volume</th>
          </tr>
        </thead>
        <tbody className="mono" style={{ fontVariantNumeric: "tabular-nums" }}>
          {data.tiers.map((t) => (
            <tr key={t.tier} style={{ borderTop: "1px solid var(--border-subtle)" }}>
              <td className="py-1.5" style={{ color: "var(--text)" }}>{TIER_LABEL[t.tier]}</td>
              <td className="py-1.5 text-right" style={{ color: "var(--text-muted)" }}>{t.markets}</td>
              <td className="py-1.5 text-right" style={{ color: "var(--text-muted)" }}>{pct(t.tradeShare)}</td>
              <td className="py-1.5 text-right" style={{ color: "var(--text-muted)" }}>{pct(t.volumeShare, t.volumeShare < 0.01 ? 2 : 1)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </>
  );
  return bare ? body : <Card className="p-4 sm:p-5">{body}</Card>;
}
