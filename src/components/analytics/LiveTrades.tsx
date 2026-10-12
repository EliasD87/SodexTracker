"use client";

import type { Cohort, LiveFlow } from "@/lib/liveStore";
import { agoShort, pct, usd } from "@/lib/analyticsFormat";
import { Card, useRowLimit } from "@/components/analytics/ui";
import { GroupKey, TRADER_GROUP_RULES } from "@/components/analytics/kit";

/**
 * Trade-level tables from the live collector, used on each market's page:
 * who is trading it, by group, and its largest trades. The API sends groups,
 * never account IDs.
 */

const LABEL: Record<Cohort, string> = {
  mm: "Market makers",
  smart: "Smart money",
  whale: "Big traders",
  retail: "Retail",
  unattributed: "Unattributed",
};

const signedUsd = (n: number) => `${n >= 0 ? "+" : "−"}${usd(Math.abs(n))}`;

export function GroupTable({ data }: { data: LiveFlow }) {
  return (
    <Card className="px-4 sm:px-5 py-4">
      <table className="w-full text-[12.5px]">
        <thead>
          <tr style={{ color: "var(--text-faint)" }}>
            <th className="text-left font-normal py-1.5">Group</th>
            <th className="text-right font-normal py-1.5" title="Share of all trading, each side counted">Share</th>
            <th className="text-right font-normal py-1.5" title="Bought minus sold: which way the group moved its exposure">Net bought</th>
            <th className="text-right font-normal py-1.5 hidden sm:table-cell" title="Aggressive buying minus aggressive selling">Aggressive net</th>
          </tr>
        </thead>
        <tbody className="mono" style={{ fontVariantNumeric: "tabular-nums" }}>
          {data.cohorts.map((c) => (
            <tr key={c.cohort} style={{ borderTop: "1px solid var(--border-subtle)" }}>
              <td className="py-2 font-sans" style={{ color: "var(--text)" }}>{LABEL[c.cohort]}</td>
              <td className="py-2 text-right" style={{ color: "var(--text-muted)" }}>{pct(c.share)}</td>
              <td className="py-2 text-right" style={{ color: "var(--text-muted)" }}>{signedUsd(c.net)}</td>
              <td className="py-2 text-right hidden sm:table-cell" style={{ color: "var(--text-muted)" }}>{signedUsd(c.takerNet)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="text-[11px] mt-3" style={{ color: "var(--text-faint)" }}>
        Net bought adds up to zero across groups: every buyer has a seller. Aggressive net counts only the side that crossed the
        spread, which is where conviction shows.
      </p>
      <GroupKey rules={TRADER_GROUP_RULES} keys={data.cohorts.map((c) => c.cohort)} />
    </Card>
  );
}

export function Tape({ data }: { data: LiveFlow }) {
  const { shown, toggle } = useRowLimit(data.large, 12, 6);
  if (!data.large.length) {
    return <p className="text-[13px]" style={{ color: "var(--text-faint)" }}>No trades of $50K or more in this window yet.</p>;
  }
  return (
    <Card className="overflow-hidden">
      <table className="w-full text-[12.5px]">
        <thead>
          <tr style={{ color: "var(--text-faint)" }}>
            <th className="text-left font-normal px-3 sm:px-4 py-2.5">Time</th>
            <th className="text-left font-normal px-2 py-2.5 hidden md:table-cell">Market</th>
            <th className="text-left font-normal px-2 py-2.5">Side</th>
            <th className="text-right font-normal px-2 py-2.5">Size</th>
            <th className="text-right font-normal px-2 py-2.5 hidden sm:table-cell">Price</th>
            <th className="text-left font-normal pl-2 pr-3 sm:px-2 py-2.5">Taken by</th>
            <th className="text-left font-normal px-4 py-2.5 hidden sm:table-cell">Against</th>
          </tr>
        </thead>
        <tbody className="mono" style={{ fontVariantNumeric: "tabular-nums" }}>
          {shown.map((t, i) => (
            <tr key={`${t.market}-${t.ts}-${i}`} style={{ borderTop: "1px solid var(--border-subtle)" }}>
              <td className="px-3 sm:px-4 py-2" style={{ color: "var(--text-muted)" }}>{agoShort(t.ts)}</td>
              <td className="px-2 py-2 font-semibold hidden md:table-cell" style={{ color: "var(--text)" }}>{t.market}</td>
              <td className="px-2 py-2">
                <span className="inline-flex items-center gap-1.5 font-sans text-[11.5px]" style={{ color: "var(--text-muted)" }}>
                  <span className="w-2 h-2 rounded-[2px]" style={{ background: t.side === "BUY" ? "var(--div-pos)" : "var(--div-neg)" }} />
                  {t.side === "BUY" ? "Buy" : "Sell"}
                </span>
              </td>
              <td className="px-2 py-2 text-right" style={{ color: "var(--text)" }}>{usd(t.usd)}</td>
              <td className="px-2 py-2 text-right hidden sm:table-cell" style={{ color: "var(--text-muted)" }}>{t.price.toLocaleString("en-US", { maximumFractionDigits: 4 })}</td>
              <td className="pl-2 pr-3 sm:px-2 py-2 font-sans" style={{ color: "var(--text-muted)" }}>{LABEL[t.taker]}</td>
              <td className="px-4 py-2 font-sans hidden sm:table-cell" style={{ color: "var(--text-faint)" }}>{LABEL[t.maker]}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {toggle}
    </Card>
  );
}
