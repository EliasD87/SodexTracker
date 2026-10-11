"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Search } from "lucide-react";
import type { TraderInsights as Insights } from "@/lib/liveStore";
import { count, pct, usd } from "@/lib/analyticsFormat";
import { useApi } from "@/components/analytics/hooks";
import { GroupKey, Panel, SegmentMeter, SplitBar, TRADER_GROUP_RULES } from "@/components/analytics/kit";
import { useRowLimit } from "@/components/analytics/ui";

/** Who trades on SoDEX, whether they come back, and a way into any trader's page. */

type Result = Insights | { available: false; reason: string };

const GROUP_COLOR: Record<string, string> = {
  mm: "var(--text)",
  smart: "var(--green)",
  whale: "var(--tier-active)",
  retail: "var(--tier-niche)",
  unattributed: "var(--text-faint)",
};
const weekLabel = (iso: string) => new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });

function Groups({ d }: { d: Insights }) {
  return (
    <Panel title="Who trades on SoDEX · 7D">
      <SplitBar height={10} legend={false} parts={d.groups.map((g) => ({ label: g.label, value: g.share, color: GROUP_COLOR[g.cohort] ?? "var(--text-faint)" }))} />
      <ul className="mt-4">
        {d.groups.map((g) => (
          <li key={g.cohort} className="flex items-center justify-between gap-3 py-2 text-[12.5px]" style={{ borderTop: "1px solid var(--border-subtle)" }}>
            <span className="inline-flex items-center gap-2" style={{ color: "var(--text)" }}>
              <span className="w-2 h-2 rounded-full" style={{ background: GROUP_COLOR[g.cohort] ?? "var(--text-faint)" }} />
              {g.label}
            </span>
            <span className="mono" style={{ color: "var(--text-muted)" }}>
              {count(g.accounts)} account{g.accounts === 1 ? "" : "s"} · <span style={{ color: "var(--text)" }}>{pct(g.share, 0)}</span>
            </span>
          </li>
        ))}
      </ul>
      <p className="mt-2 text-[11px]" style={{ color: "var(--text-faint)" }}>
        Share of volume, each side of a trade counted for its own account.
      </p>
      <GroupKey rules={TRADER_GROUP_RULES} keys={d.groups.map((g) => g.cohort)} />
    </Panel>
  );
}

function FindTrader({ d }: { d: Insights }) {
  const router = useRouter();
  const [q, setQ] = useState("");
  // The whole list on a wider screen; the top five on a phone.
  const { shown, toggle } = useRowLimit(d.mostActive, d.mostActive.length, 5);
  const go = (e: React.FormEvent) => {
    e.preventDefault();
    const name = q.trim().toLowerCase().replace(/\s+/g, "-");
    if (name) router.push(`/analytics/trader/${encodeURIComponent(name)}`);
  };
  return (
    <Panel title="Find a trader">
      <form onSubmit={go} className="flex items-center gap-2 px-3 py-2 rounded-[12px]" style={{ background: "var(--bg-elevated)", border: "1px solid var(--border-subtle)" }}>
        <Search size={14} className="shrink-0" style={{ color: "var(--text-faint)" }} />
        {/* 16px on a phone, so focusing the field doesn't zoom the page. */}
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Nickname, e.g. quiet-falcon-bloom"
          aria-label="Trader nickname"
          className="flex-1 min-w-0 bg-transparent outline-none text-[16px] sm:text-[13px]"
          style={{ color: "var(--text)" }}
        />
        <button type="submit" className="shrink-0 text-[12px] font-semibold px-3 py-1.5 sm:py-1 rounded-[8px]" style={{ background: "var(--text)", color: "var(--bg)" }}>
          Open
        </button>
      </form>
      <div className="mono text-[11px] tracking-[0.14em] uppercase mt-5 mb-1" style={{ color: "var(--text-muted)" }}>Most active · 7D</div>
      <ol>
        {shown.map((t, i) => (
          <li key={t.name} className="flex items-center gap-3 py-1.5 text-[12.5px]" style={{ borderTop: i ? "1px solid var(--border-subtle)" : undefined }}>
            <span className="mono text-[11px] w-4 text-right" style={{ color: "var(--text-faint)" }}>{i + 1}</span>
            <Link href={`/analytics/trader/${t.name}`} className="flex-1 truncate hover:underline underline-offset-2" style={{ color: "var(--text)" }}>{t.name}</Link>
            <span className="text-[11px] hidden sm:inline" style={{ color: "var(--text-faint)" }}>
              {t.markets} market{t.markets === 1 ? "" : "s"}
              {t.makerShare != null ? ` · ${pct(t.makerShare, 0)} maker` : ""}
            </span>
            <span className="mono w-16 text-right" style={{ color: "var(--text)" }}>{usd(t.volume)}</span>
          </li>
        ))}
      </ol>
      <div className="-mx-4 sm:-mx-5">{toggle}</div>
      <p className="mt-3 text-[11px]" style={{ color: "var(--text-faint)" }}>
        More on the{" "}
        <Link href="/analytics/rankings" className="underline underline-offset-2">Rankings</Link> tab.
      </p>
    </Panel>
  );
}

function Retention({ d }: { d: Insights }) {
  const pending = d.retention.every((r) => r.after7 == null);
  // Every week on a wider screen; on a phone the six oldest, the ones far enough back to have figures.
  const { shown, toggle } = useRowLimit(d.retention, d.retention.length, 6);
  return (
    <Panel title="Retention">
      <table className="w-full text-[12.5px]">
        <thead>
          <tr style={{ color: "var(--text-faint)" }}>
            <th className="text-left font-normal py-1.5">
              <span className="sm:hidden">Week of</span>
              <span className="hidden sm:inline">First traded, week of</span>
            </th>
            <th className="text-right font-normal py-1.5">New traders</th>
            <th className="text-right sm:text-left font-normal py-1.5 pl-3 sm:pl-4">Back 7+ days later</th>
            <th className="text-left font-normal py-1.5 pl-4 hidden sm:table-cell">Back 30+ days later</th>
          </tr>
        </thead>
        <tbody className="mono" style={{ fontVariantNumeric: "tabular-nums" }}>
          {shown.map((r) => (
            <tr key={r.week} style={{ borderTop: "1px solid var(--border-subtle)" }}>
              <td className="py-2 font-sans" style={{ color: "var(--text)" }}>{weekLabel(r.week)}</td>
              <td className="py-2 text-right" style={{ color: "var(--text-muted)" }}>{count(r.traders)}</td>
              {[r.after7, r.after30].map((v, i) => (
                <td key={i} className={`py-2 pl-3 sm:pl-4 text-right sm:text-left ${i ? "hidden sm:table-cell" : ""}`}>
                  {v == null ? (
                    <span className="font-sans text-[11.5px]" style={{ color: "var(--text-faint)" }}>Too early</span>
                  ) : (
                    <span className="flex items-center justify-end sm:justify-start gap-2">
                      {/* The meter steps out on a phone; the figure stays. */}
                      <span className="w-28 hidden sm:block">
                        <SegmentMeter share={v} segments={14} color="var(--green)" />
                      </span>
                      <span style={{ color: "var(--text)" }}>{pct(v, 0)}</span>
                    </span>
                  )}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      <div className="-mx-4 sm:-mx-5">{toggle}</div>
      <p className="mt-3 text-[11px]" style={{ color: "var(--text-faint)" }}>
        Traders grouped by the week we first saw them trade, and the share who traded again at least 7 and 30 days after their first trade. Built from{" "}
        {d.daysOfData} day{d.daysOfData === 1 ? "" : "s"} of live data ({weekLabel(d.firstDay)} to {weekLabel(d.lastDay)})
        {pending ? "; the first figures appear once a week's traders have had seven days to return." : "."}
      </p>
    </Panel>
  );
}

export function TraderInsights() {
  const { data } = useApi<Result>("/api/analytics/live?view=insights", 60_000, 120_000);
  if (!data) return <div className="h-64 rounded-[16px] animate-pulse" style={{ background: "var(--bg-elevated)" }} />;
  if (!data.available) {
    return (
      <Panel title="Live trader data">
        <p className="text-[12.5px]" style={{ color: "var(--text-faint)" }}>{data.reason}</p>
      </Panel>
    );
  }
  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Groups d={data} />
        <FindTrader d={data} />
      </div>
      <Retention d={data} />
    </div>
  );
}
