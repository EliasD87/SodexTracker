"use client";

import { useId, useState } from "react";
import { ArrowDownRight, ArrowUpRight, Building2, CircleHelp, Fish, Sparkles, Users } from "lucide-react";
import { pct, usd } from "@/lib/analyticsFormat";
import type { MoneyFlow } from "@/lib/moneyStore";
import { PillTabs } from "@/components/analytics/kit";
import { useCompact } from "@/components/analytics/hooks";
import { TokenIcon } from "@/components/TokenIcon";
import { Legend, useWidth } from "@/components/deep/shared";

/**
 * Money as a river: one column per chain (or trader group), biggest first,
 * each with its card on top and the river below stepping down to its share.
 * Behind it, faintly, the other direction for the same column, so deposits
 * and withdrawals can be compared at a glance.
 */

const GROUP_LABEL: Record<string, string> = {
  mm: "Market makers",
  smart: "Smart money",
  whale: "Big traders",
  retail: "Retail",
  unattributed: "Unattributed",
};
const GROUP_ICON: Record<string, typeof Users> = { mm: Building2, smart: Sparkles, whale: Fish, retail: Users, unattributed: CircleHelp };
// A chain's gas token, for its icon.
const CHAIN_TOKEN: Record<string, string> = {
  Arbitrum: "ARB",
  Ethereum: "ETH",
  "BNB Chain": "BNB",
  Solana: "SOL",
  Bitcoin: "BTC",
  Cardano: "ADA",
  TON: "TON",
  Polygon: "POL",
  Optimism: "OP",
  Avalanche: "AVAX",
  Tron: "TRX",
  Sui: "SUI",
  HyperEVM: "HYPE",
  ValueChain: "SOSO",
};

type Col = { key: string; label: string; value: number; other: number; net: number; note: string };

/** The biggest few in the chosen direction, and the rest as one. */
function columns(
  rows: { key: string; in: number; out: number; net: number; note: string }[],
  dir: "in" | "out",
  n: number,
  label: (k: string) => string,
): Col[] {
  const back = dir === "in" ? "out" : "in";
  const sorted = rows.filter((r) => r[dir] > 0).sort((a, b) => b[dir] - a[dir]);
  const cols: Col[] = sorted.slice(0, n).map((r) => ({ key: r.key, label: label(r.key), value: r[dir], other: r[back], net: r.net, note: r.note }));
  const rest = sorted.slice(n);
  if (rest.length) {
    cols.push({
      key: "__other",
      label: `${rest.length} more`,
      value: rest.reduce((a, r) => a + r[dir], 0),
      other: rest.reduce((a, r) => a + r[back], 0),
      net: rest.reduce((a, r) => a + r.net, 0),
      note: "Smaller ones",
    });
  }
  return cols;
}

// One violet, light for the biggest column and deepening across.
const HUE = "#8170EE";
const shade = (i: number, n: number) => `color-mix(in srgb, ${HUE} ${Math.round(28 + (72 * i) / Math.max(1, n - 1))}%, var(--bg-surface))`;
const GHOST = `color-mix(in srgb, ${HUE} 14%, transparent)`;

/** The river's outline: flat across each column, easing down (or up) between them. */
function riverPath(heights: number[], w: number, H: number) {
  const ease = Math.min(28, w * 0.2);
  let d = `M 0 ${H} L 0 ${H - heights[0]}`;
  heights.forEach((h, i) => {
    const y = H - h;
    const end = (i + 1) * w;
    if (i < heights.length - 1) {
      const y2 = H - heights[i + 1];
      d += ` L ${end - ease} ${y} C ${end} ${y}, ${end} ${y2}, ${end + ease} ${y2}`;
    } else {
      d += ` L ${end} ${y}`;
    }
  });
  return `${d} L ${heights.length * w} ${H} Z`;
}

/** The same river turned on its side, for a phone: rows from the top down, each band as wide as its share. */
function riverPathDown(widths: number[], h: number) {
  const ease = Math.min(22, h * 0.3);
  let d = `M 0 0 L ${widths[0]} 0`;
  widths.forEach((x, i) => {
    const end = (i + 1) * h;
    if (i < widths.length - 1) d += ` L ${x} ${end - ease} C ${x} ${end}, ${widths[i + 1]} ${end}, ${widths[i + 1]} ${end + ease}`;
    else d += ` L ${x} ${end}`;
  });
  return `${d} L 0 ${widths.length * h} Z`;
}

/** Deposits minus withdrawals, as a small green or red pill. */
function NetPill({ net }: { net: number }) {
  const up = net >= 0;
  return (
    <span
      className="inline-flex items-center gap-0.5 h-5 px-1.5 rounded-[6px] text-[10.5px] font-semibold mono whitespace-nowrap"
      style={{ color: up ? "var(--green)" : "var(--red)", background: `color-mix(in srgb, ${up ? "var(--green)" : "var(--red)"} 14%, transparent)` }}
      title={`Deposits minus withdrawals: ${up ? "+" : "−"}${usd(Math.abs(net))}`}
    >
      {up ? <ArrowUpRight size={11} /> : <ArrowDownRight size={11} />}
      {usd(Math.abs(net))} net
    </span>
  );
}

/** The phone layout: one row per column, the river running down beside them. */
function RiverRows({ cols, total, icon, word, other }: { cols: Col[]; total: number; icon: (c: Col) => React.ReactNode; word: string; other: string }) {
  const [hover, setHover] = useState<number | null>(null);
  const [ref, width] = useWidth<HTMLDivElement>();
  const uid = useId().replace(/:/g, "");
  const ROW = 64;
  const n = cols.length;
  const max = Math.max(1, ...cols.map((c) => Math.max(c.value, c.other)));
  const wOf = (v: number) => (v > 0 ? Math.max(3, ((width - 4) * v) / max) : 0);
  return (
    <div className="flex" onMouseLeave={() => setHover(null)}>
      <ul className="flex-1 min-w-0">
        {cols.map((c, i) => (
          <li
            key={c.key}
            onClick={() => setHover(i)}
            className="flex items-center gap-2.5 pr-3 pl-2 -ml-2 rounded-l-[10px]"
            style={{
              height: ROW,
              borderBottom: i < n - 1 ? "1px solid var(--border-subtle)" : undefined,
              background: hover === i ? `color-mix(in srgb, ${HUE} 12%, transparent)` : undefined,
            }}
          >
            <span
              className="w-7 h-7 shrink-0 inline-flex items-center justify-center rounded-[8px]"
              style={{ background: "var(--bg-elevated)", border: "1px solid var(--border)" }}
            >
              {icon(c)}
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-[12.5px] font-semibold truncate" style={{ color: "var(--text)" }}>
                {c.label}
              </span>
              <span className="block text-[10.5px] truncate" style={{ color: "var(--text-faint)" }}>
                {pct(total ? c.value / total : 0, 0)} · {c.note}
              </span>
            </span>
            <span className="flex flex-col items-end gap-1 shrink-0">
              <span className="text-[14px] font-semibold mono leading-none" style={{ color: "var(--text)" }}>
                {usd(c.value)}
              </span>
              <NetPill net={c.net} />
            </span>
          </li>
        ))}
      </ul>
      <div ref={ref} className="w-[30%] shrink-0">
        {width > 0 && (
          <svg width={width} height={ROW * n} role="img" aria-label={`Money ${word}, row by row`} className="block">
            <path
              d={riverPathDown(
                cols.map((c) => wOf(c.other)),
                ROW,
              )}
              fill={GHOST}
            />
            {cols.map((c, i) => (
              <g key={c.key} opacity={hover == null || hover === i ? 1 : 0.55}>
                <clipPath id={`${uid}-r${i}`}>
                  <rect x={0} y={i * ROW} width={width} height={ROW} />
                </clipPath>
                <path
                  d={riverPathDown(
                    cols.map((x) => wOf(x.value)),
                    ROW,
                  )}
                  clipPath={`url(#${uid}-r${i})`}
                  fill={shade(i, n)}
                >
                  <title>{`${c.label}: ${usd(c.value)} ${word}, ${usd(c.other)} ${other}`}</title>
                </path>
              </g>
            ))}
          </svg>
        )}
      </div>
    </div>
  );
}

const fmtDay = (d: string) => new Date(`${d}T00:00:00Z`).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });

export function MoneyRiver({ data }: { data: MoneyFlow }) {
  const [dir, setDir] = useState<"in" | "out">("in");
  const [by, setBy] = useState<"chain" | "group">("chain");
  const [hover, setHover] = useState<number | null>(null);
  const [ref, width] = useWidth<HTMLDivElement>();
  const uid = useId().replace(/:/g, "");
  const compact = useCompact();

  const cols =
    by === "chain"
      ? columns(
          data.byChain.map((c) => ({ ...c, note: `${c.count.toLocaleString()} moves` })),
          dir,
          5,
          (k) => k,
        )
      : columns(
          data.byGroup.map((g) => ({ ...g, note: `${g.accounts.toLocaleString()} accounts` })),
          dir,
          5,
          (k) => GROUP_LABEL[k] ?? k,
        );
  const total = cols.reduce((a, c) => a + c.value, 0);
  const n = cols.length;
  const active = hover ?? 0;

  // Both directions share one scale, so the faint river behind is comparable.
  const H = 190;
  const top = 14;
  const max = Math.max(1, ...cols.map((c) => Math.max(c.value, c.other)));
  const hOf = (v: number) => (v > 0 ? Math.max(4, ((H - top) * v) / max) : 0);
  const w = n ? width / n : 0;
  const word = dir === "in" ? "deposited" : "withdrawn";

  const icon = (c: Col) => {
    if (c.key === "__other")
      return (
        <span className="text-[11px] font-semibold" style={{ color: "var(--text-muted)" }}>
          +
        </span>
      );
    if (by === "chain") return <TokenIcon symbol={CHAIN_TOKEN[c.label] ?? c.label} size={16} />;
    const I = GROUP_ICON[c.key] ?? Users;
    return <I size={14} style={{ color: HUE }} />;
  };

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
        <div className="flex flex-wrap items-center gap-2">
          <PillTabs
            label="Direction"
            value={dir}
            onChange={setDir}
            options={[
              { value: "in", label: "Deposits" },
              { value: "out", label: "Withdrawals" },
            ]}
          />
          <PillTabs
            label="Split by"
            value={by}
            onChange={(v) => (setBy(v), setHover(null))}
            options={[
              { value: "chain", label: "By chain" },
              { value: "group", label: "By trader group" },
            ]}
          />
        </div>
        <span className="text-[12px] mono" style={{ color: "var(--text-muted)" }}>
          {usd(total)} {word}, {fmtDay(data.from)} – {fmtDay(data.to)}
        </span>
      </div>

      {n === 0 ? (
        <p className="py-16 text-center text-[12.5px]" style={{ color: "var(--text-muted)" }}>
          Nothing {word} in this window yet.
        </p>
      ) : compact ? (
        <RiverRows cols={cols} total={total} icon={icon} word={word} other={dir === "in" ? "withdrawn" : "deposited"} />
      ) : (
        <div className="overflow-x-auto">
          <div className="min-w-[720px]" onMouseLeave={() => setHover(null)}>
            {/* Cards */}
            <div className="grid" style={{ gridTemplateColumns: `repeat(${n}, minmax(0, 1fr))` }}>
              {cols.map((c, i) => {
                const on = i === active;
                return (
                  <div
                    key={c.key}
                    onMouseEnter={() => setHover(i)}
                    className="relative px-3.5 pt-3 pb-3.5 transition-colors"
                    style={{
                      borderRight: i < n - 1 ? "1px solid var(--border)" : undefined,
                      background: on ? `color-mix(in srgb, ${HUE} 13%, transparent)` : undefined,
                      borderRadius: on ? "12px 12px 0 0" : undefined,
                    }}
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <span
                        className="w-7 h-7 shrink-0 inline-flex items-center justify-center rounded-[8px]"
                        style={{ background: on ? "var(--bg-surface)" : "var(--bg-elevated)", border: "1px solid var(--border)" }}
                      >
                        {icon(c)}
                      </span>
                      <div className="min-w-0">
                        <div className="text-[12.5px] font-semibold truncate" style={{ color: "var(--text)" }}>
                          {c.label}
                        </div>
                        <div className="text-[10.5px] truncate" style={{ color: "var(--text-faint)" }}>
                          {c.note}
                        </div>
                      </div>
                    </div>
                    <div className="mt-3 text-[19px] font-semibold mono leading-none" style={{ color: "var(--text)", letterSpacing: "-0.02em" }}>
                      {usd(c.value)}
                    </div>
                    <div className="mt-2 flex flex-wrap items-center gap-1.5">
                      <NetPill net={c.net} />
                      <span className="text-[10.5px] mono" style={{ color: "var(--text-faint)" }}>
                        {pct(total ? c.value / total : 0, 0)}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* River */}
            <div ref={ref} className="w-full">
              {width > 0 && (
                <svg
                  width={width}
                  height={H}
                  role="img"
                  aria-label={`${dir === "in" ? "Deposits" : "Withdrawals"} ${by === "chain" ? "by chain" : "by trader group"}`}
                  className="block"
                >
                  <defs>
                    {cols.map((c, i) => (
                      <clipPath key={c.key} id={`${uid}-c${i}`}>
                        <rect x={i * w} y={0} width={w} height={H} />
                      </clipPath>
                    ))}
                  </defs>
                  {cols.map((c, i) => (
                    <rect
                      key={`bg-${c.key}`}
                      x={i * w}
                      y={0}
                      width={w}
                      height={H}
                      fill={i === active ? `color-mix(in srgb, ${HUE} 6%, transparent)` : "transparent"}
                    />
                  ))}
                  <path
                    d={riverPath(
                      cols.map((c) => hOf(c.other)),
                      w,
                      H,
                    )}
                    fill={GHOST}
                  />
                  {cols.map((c, i) => (
                    <path
                      key={`r-${c.key}`}
                      d={riverPath(
                        cols.map((x) => hOf(x.value)),
                        w,
                        H,
                      )}
                      clipPath={`url(#${uid}-c${i})`}
                      fill={shade(i, n)}
                      opacity={hover == null || hover === i ? 1 : 0.55}
                      style={{ transition: "opacity 150ms" }}
                    />
                  ))}
                  {cols.slice(0, -1).map((c, i) => (
                    <line key={`sep-${c.key}`} x1={(i + 1) * w} x2={(i + 1) * w} y1={0} y2={H} stroke="var(--border)" strokeOpacity={0.6} />
                  ))}
                  {cols.map((c, i) => (
                    <rect key={`hit-${c.key}`} x={i * w} y={0} width={w} height={H} fill="transparent" onMouseEnter={() => setHover(i)}>
                      <title>{`${c.label}: ${usd(c.value)} ${word}, ${usd(c.other)} ${dir === "in" ? "withdrawn" : "deposited"}`}</title>
                    </rect>
                  ))}
                </svg>
              )}
            </div>
          </div>
        </div>
      )}

      <div className="mt-3">
        <Legend
          items={[
            { label: dir === "in" ? "Deposits" : "Withdrawals", color: shade(2, 3) },
            { label: dir === "in" ? "Withdrawals, same scale" : "Deposits, same scale", color: GHOST },
          ]}
        />
      </div>
    </div>
  );
}
