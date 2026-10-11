"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { ArrowDown, ArrowUp, Search } from "lucide-react";
import type { MarketRow, Tier, WindowKey } from "@/lib/exchangeAnalytics";
import { growth, marketSlug, pct, signedPct, usd } from "@/lib/analyticsFormat";
import { KindBadge, TIER_COLOR, TIER_LABEL, TierBadge, useRowLimit } from "@/components/analytics/ui";
import { biasLabel, CARD_STYLE } from "@/components/analytics/kit";
import { TokenIcon } from "@/components/TokenIcon";

export type SortKey =
  | "volume"
  | "share"
  | "volumeChange"
  | "tradersPerDay"
  | "tradesPerTrader"
  | "avgTrade"
  | "oiNow"
  | "oiChange"
  | "turnover"
  | "fundingAnnual"
  | "fundingPositiveDays"
  | "fees"
  | "longShare"
  | "whaleShare"
  | "whaleBias";

type Column = {
  key: SortKey;
  label: string;
  title: string;
  render: (m: MarketRow) => string;
  /** For signed figures: the value whose sign colours the cell green or red. */
  sign?: (m: MarketRow) => number | null;
  /**
   * Narrowest screen the column appears on. The table fits its card at every
   * width instead of scrolling sideways: secondary figures step out as the
   * screen narrows, and every one of them is on the market's own page.
   */
  from?: Breakpoint;
};

type Breakpoint = "sm" | "md" | "lg" | "xl";
// Spelled out in full so Tailwind sees each class.
const SHOW_FROM: Record<Breakpoint, string> = {
  sm: "hidden sm:table-cell",
  md: "hidden md:table-cell",
  lg: "hidden lg:table-cell",
  xl: "hidden xl:table-cell",
};
// A column picked for phones: shown below `sm`, then as it would be above.
const PHONE_AND_FROM: Record<Breakpoint, string> = {
  sm: "",
  md: "sm:hidden md:table-cell",
  lg: "sm:hidden lg:table-cell",
  xl: "sm:hidden xl:table-cell",
};

const COLUMNS: Record<SortKey, Column> = {
  volume: { key: "volume", label: "Volume", title: "Total volume over the window", render: (m) => usd(m.volume) },
  share: { key: "share", from: "sm", label: "Share", title: "Share of all SoDEX volume", render: (m) => pct(m.share, m.share < 0.001 ? 3 : 1) },
  volumeChange: {
    key: "volumeChange",
    label: "Δ vol",
    title: "Volume vs the previous window of equal length",
    render: (m) => (m.volumeChange == null ? "—" : growth(m.volumeChange)),
    sign: (m) => m.volumeChange,
  },
  tradersPerDay: {
    key: "tradersPerDay",
    from: "sm",
    label: "Traders/d",
    title: "Average distinct traders per day",
    render: (m) => (m.tradersPerDay >= 10 ? Math.round(m.tradersPerDay).toLocaleString("en-US") : m.tradersPerDay.toFixed(1)),
  },
  tradesPerTrader: {
    key: "tradesPerTrader",
    from: "xl",
    label: "Trades/trader",
    title: "Average trades per trader per day",
    render: (m) => (m.tradesPerTrader == null ? "—" : Math.round(m.tradesPerTrader).toLocaleString("en-US")),
  },
  avgTrade: { key: "avgTrade", from: "lg", label: "Avg trade", title: "Volume ÷ trades", render: (m) => (m.avgTrade == null ? "—" : usd(m.avgTrade, 1)) },
  oiNow: { key: "oiNow", from: "md", label: "OI", title: "Open interest at the end of the window", render: (m) => (m.oiNow == null ? "—" : usd(m.oiNow)) },
  oiChange: {
    key: "oiChange",
    from: "lg",
    label: "Δ OI",
    title: "Open interest, last day vs first day of the window",
    render: (m) => (m.oiChange == null ? "—" : growth(m.oiChange)),
    sign: (m) => m.oiChange,
  },
  turnover: {
    key: "turnover",
    from: "xl",
    label: "Turnover",
    title: "Average daily volume ÷ average open interest",
    render: (m) => (m.turnover == null ? "—" : `${m.turnover.toFixed(m.turnover >= 10 ? 0 : 2)}×`),
  },
  fundingAnnual: {
    key: "fundingAnnual",
    from: "md",
    label: "Funding APR",
    title: "Annualised average funding. Positive: longs pay.",
    render: (m) => (m.fundingAnnual == null ? "—" : signedPct(m.fundingAnnual, 1)),
    sign: (m) => m.fundingAnnual,
  },
  fundingPositiveDays: {
    key: "fundingPositiveDays",
    from: "md",
    label: "Days longs paid",
    title: "Share of days in the window with positive funding",
    render: (m) => (m.fundingPositiveDays == null ? "—" : pct(m.fundingPositiveDays, 0)),
  },
  fees: {
    key: "fees",
    from: "lg",
    label: "Est. fees",
    title: "Volume × standard maker + taker rate. An upper bound: VIP discounts only lower it.",
    render: (m) => (m.fees == null ? "—" : usd(m.fees)),
  },
  longShare: {
    key: "longShare",
    from: "sm",
    label: "% long",
    title: "Share of tracked open positions that are long",
    render: (m) => (m.longShare == null ? "—" : pct(m.longShare, 0)),
    sign: (m) => (m.longShare == null ? null : m.longShare - 0.5),
  },
  whaleShare: {
    key: "whaleShare",
    from: "sm",
    label: "Whale share",
    title: "Share of tracked open positions held by accounts with $250K+ equity",
    render: (m) => (m.whaleShare == null ? "—" : pct(m.whaleShare, 0)),
  },
  whaleBias: {
    key: "whaleBias",
    label: "Whale lean",
    title: "Whales' long minus short over both: +1 all long, −1 all short",
    render: (m) => (m.whaleBias == null ? "—" : biasLabel(m.whaleBias)),
    sign: (m) => (m.whaleBias == null || Math.abs(m.whaleBias) < 0.05 ? null : m.whaleBias),
  },
};

const DEFAULT_COLUMNS: SortKey[] = [
  "volume",
  "share",
  "volumeChange",
  "tradersPerDay",
  "tradesPerTrader",
  "avgTrade",
  "oiNow",
  "oiChange",
  "turnover",
  "fundingAnnual",
  "fees",
];

export function MarketTable({
  markets,
  win,
  columns = DEFAULT_COLUMNS,
  initialSort = "volume",
  lockKind,
  phoneColumns,
}: {
  markets: MarketRow[];
  win: WindowKey;
  columns?: SortKey[];
  initialSort?: SortKey;
  /** Show only perps or spot, without the kind filter. */
  lockKind?: "perp" | "spot";
  /**
   * The only figures a phone shows, when the default steps would leave the
   * wrong ones (a funding table must keep its funding). Wider screens are
   * unaffected.
   */
  phoneColumns?: SortKey[];
}) {
  const [sort, setSort] = useState<{ key: SortKey; dir: 1 | -1 }>({ key: initialSort, dir: -1 });
  const [kind, setKind] = useState<"all" | "perp" | "spot">(lockKind ?? "all");
  const [tier, setTier] = useState<Tier | "all">("all");
  const [q, setQ] = useState("");
  const cols = columns.map((k) => COLUMNS[k]);
  const shownFrom = (c: Column) =>
    !phoneColumns
      ? c.from
        ? SHOW_FROM[c.from]
        : ""
      : phoneColumns.includes(c.key)
        ? c.from
          ? PHONE_AND_FROM[c.from]
          : ""
        : SHOW_FROM[c.from ?? "sm"];

  const rows = useMemo(() => {
    const query = q.trim().toUpperCase();
    return markets
      .filter(
        (m) =>
          (kind === "all" || m.kind === kind) &&
          (tier === "all" || m.tier === tier) &&
          (!query || m.symbol.toUpperCase().includes(query)),
      )
      .sort((a, b) => {
        const av = a[sort.key];
        const bv = b[sort.key];
        // Missing values always sink, whichever way the column sorts.
        if (av == null && bv == null) return 0;
        if (av == null) return 1;
        if (bv == null) return -1;
        return (av - bv) * sort.dir;
      });
  }, [markets, sort, kind, tier, q]);

  // A search or filter shows every match; the full list opens on request.
  // A phone starts with the top dozen.
  const { shown, toggle } = useRowLimit(rows, q || tier !== "all" ? rows.length : 25, q || tier !== "all" ? undefined : 12);

  const swatch = (color: string) => <span className="w-1.5 h-1.5 rounded-full" style={{ background: color }} aria-hidden />;
  const chip = (active: boolean) => ({
    border: `1px solid ${active ? "var(--text)" : "var(--border)"}`,
    color: active ? "var(--text)" : "var(--text-muted)",
    background: active ? "var(--bg-elevated)" : "transparent",
  });

  return (
    <div className="overflow-hidden" style={CARD_STYLE}>
      {/* On a phone: the chips in one sideways row, the search under them at full width. */}
      <div className="flex flex-col sm:flex-row sm:flex-wrap sm:items-center gap-2 p-3" style={{ borderBottom: "1px solid var(--border)" }}>
        <div className="scroll-row flex flex-nowrap items-center gap-2 sm:contents">
          {!lockKind && (
            <>
              {(["all", "perp", "spot"] as const).map((k) => (
                <button key={k} onClick={() => setKind(k)} className="shrink-0 px-2.5 py-1.5 sm:py-1 rounded-md text-[12px] font-medium" style={chip(kind === k)}>
                  {k === "all" ? "All" : k === "perp" ? "Perps" : "Spot"}
                </button>
              ))}
              <span className="shrink-0 w-px h-5 mx-1" style={{ background: "var(--border)" }} />
            </>
          )}
          {(["all", "active", "niche", "thin"] as const).map((t) => (
            <button
              key={t}
              onClick={() => setTier(t)}
              className="shrink-0 inline-flex items-center gap-1.5 px-2.5 py-1.5 sm:py-1 rounded-md text-[12px] font-medium whitespace-nowrap"
              style={chip(tier === t)}
            >
              {t !== "all" && swatch(TIER_COLOR[t])}
              {t === "all" ? "Any tier" : TIER_LABEL[t]}
            </button>
          ))}
        </div>
        <label className="sm:ml-auto flex items-center gap-2 px-2.5 py-1.5 sm:py-1 rounded-md" style={{ border: "1px solid var(--border)" }}>
          <Search size={13} style={{ color: "var(--text-faint)" }} />
          {/* 16px on a phone, so focusing the field doesn't zoom the page. */}
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Find a market"
            aria-label="Find a market"
            className="bg-transparent outline-none text-[16px] sm:text-[12px] w-full sm:w-[110px]"
            style={{ color: "var(--text)" }}
          />
        </label>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-[12px]">
          <thead>
            <tr style={{ color: "var(--text-faint)" }}>
              <th className="text-left font-normal pl-3 pr-1.5 sm:px-3 py-2.5 sticky left-0" style={{ background: "var(--bg-surface)" }}>
                Market
              </th>
              <th className="text-left font-normal px-2 py-2.5 hidden sm:table-cell">Tier</th>
              {cols.map((c) => {
                const active = sort.key === c.key;
                return (
                  <th
                    key={c.key}
                    className={`text-right font-normal px-1.5 sm:px-2 py-2.5 ${shownFrom(c)}`}
                    aria-sort={active ? (sort.dir === 1 ? "ascending" : "descending") : "none"}
                  >
                    <button
                      title={c.title}
                      onClick={() => setSort((s) => ({ key: c.key, dir: s.key === c.key ? ((s.dir * -1) as 1 | -1) : -1 }))}
                      className="inline-flex items-center gap-1 whitespace-nowrap"
                      style={{ color: active ? "var(--text)" : "var(--text-faint)" }}
                    >
                      {c.label}
                      {active && (sort.dir === -1 ? <ArrowDown size={11} /> : <ArrowUp size={11} />)}
                    </button>
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody className="mono" style={{ fontVariantNumeric: "tabular-nums" }}>
            {shown.map((m) => (
              <tr key={m.symbol} className="analytics-row" style={{ borderTop: "1px solid var(--border-subtle)" }}>
                <td className="pl-3 pr-1.5 sm:px-3 py-2 sticky left-0 font-semibold" style={{ background: "var(--bg-surface)" }}>
                  <Link
                    href={`/analytics/markets/${marketSlug(m.symbol)}?w=${win}`}
                    className="group inline-flex items-center gap-2"
                    style={{ color: "var(--text)" }}
                  >
                    <TokenIcon symbol={m.symbol} size={20} />
                    <span className="group-hover:underline underline-offset-2 whitespace-nowrap">{m.symbol}</span>
                    {/* The kind steps out on a phone, where the width goes to figures. */}
                    <span className="hidden sm:inline-flex">
                      <KindBadge kind={m.kind} />
                    </span>
                  </Link>
                </td>
                <td className="px-2 py-2 hidden sm:table-cell">
                  <TierBadge tier={m.tier} />
                </td>
                {cols.map((c) => {
                  const v = c.sign?.(m);
                  const color = v == null || v === 0 ? "var(--text-muted)" : v > 0 ? "var(--green)" : "var(--red)";
                  return (
                    <td key={c.key} className={`px-1.5 sm:px-2 py-2 text-right whitespace-nowrap ${shownFrom(c)}`} style={{ color }}>
                      {c.render(m)}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
        {rows.length === 0 && (
          <p className="p-6 text-center text-[13px]" style={{ color: "var(--text-faint)" }}>
            No markets match.
          </p>
        )}
      </div>
      {toggle}
    </div>
  );
}
