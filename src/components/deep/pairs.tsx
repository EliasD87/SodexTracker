"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Plus, Search, X } from "lucide-react";
import { marketSlug } from "@/lib/analyticsFormat";
import { cachedApiFetch } from "@/lib/fetchCache";
import type { MarketRow } from "@/lib/exchangeAnalytics";
import type { MarketPositions, PositionsOverview, SizeGroup } from "@/lib/positionStore";
import { CARD_STYLE } from "@/components/analytics/kit";
import { TokenIcon } from "@/components/TokenIcon";
import { LoadingDots } from "@/components/wallet/ui";

/**
 * Picking extra pairs for the positioning cards. The default six or eight
 * come in the shared positions data; a picked pair loads its own market view
 * (the one its market page uses, published every 5 minutes): one small
 * request, only when picked, cached after.
 */

export const MAX_PICKS = 4;

type Res<T> = T | { available: false; reason: string };

/** Each picked market's positions, by market. "none" when it has none or couldn't load. */
export function useMarketPositions(markets: string[]): Record<string, MarketPositions | "none"> {
  const [got, setGot] = useState<Record<string, MarketPositions | "none">>({});
  const key = markets.join("|");
  useEffect(() => {
    let live = true;
    for (const m of key ? key.split("|") : []) {
      cachedApiFetch<{ positions: Res<MarketPositions> }>(`/api/analytics/market/${marketSlug(m)}/positions`, 1, 2 * 60_000)
        .then((d) => live && setGot((g) => ({ ...g, [m]: d.positions.available ? d.positions : "none" })))
        .catch(() => live && setGot((g) => ({ ...g, [m]: "none" })));
    }
    return () => {
      live = false;
    };
  }, [key]);
  return got;
}

/** The shared positions data with the picked markets' cells and liquidation levels added in. */
export function withPicked(data: PositionsOverview, picked: Record<string, MarketPositions | "none">): PositionsOverview {
  const extraCells = Object.values(picked).flatMap((p) =>
    p === "none" ? [] : p.bySize.map((g) => ({ market: p.market, group: g.key as SizeGroup, longUsd: g.longUsd, shortUsd: g.shortUsd, bias: g.bias })),
  );
  const extraLiq = Object.fromEntries(
    Object.values(picked).flatMap((p) => (p === "none" || !p.mark ? [] : [[p.market, { mark: p.mark, buckets: p.liquidation }]])),
  );
  const pickedMarkets = new Set(extraCells.map((c) => c.market));
  return {
    ...data,
    heatmap: { ...data.heatmap, cells: [...data.heatmap.cells.filter((c) => !pickedMarkets.has(c.market)), ...extraCells] },
    liquidation: { ...data.liquidation, byMarket: { ...extraLiq, ...data.liquidation.byMarket } },
  };
}

/**
 * "+ Pair" and the pairs already picked. Lists perps by volume, minus those
 * already shown; picked ones show as chips with a remove button.
 */
export function PairPicker({
  markets,
  shown,
  picked,
  status,
  onChange,
}: {
  markets: MarketRow[];
  shown: string[];
  picked: string[];
  status: Record<string, MarketPositions | "none">;
  onChange: (next: string[]) => void;
}) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const ref = useRef<HTMLDivElement>(null);
  const options = useMemo(
    () =>
      markets
        .filter((m) => m.kind === "perp" && !shown.includes(m.symbol) && !picked.includes(m.symbol))
        .filter((m) => !q.trim() || m.symbol.toLowerCase().includes(q.trim().toLowerCase()))
        .sort((a, b) => b.volume - a.volume)
        .slice(0, 40),
    [markets, shown, picked, q],
  );

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => ref.current && !ref.current.contains(e.target as Node) && setOpen(false);
    const esc = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", esc);
    return () => {
      document.removeEventListener("mousedown", close);
      document.removeEventListener("keydown", esc);
    };
  }, [open]);

  return (
    <div ref={ref} className="relative flex flex-wrap items-center gap-1.5">
      {picked.map((m) => {
        const s = status[m];
        return (
          <span key={m} className="inline-flex items-center gap-1 h-7 pl-1.5 pr-1 rounded-full text-[12px] font-medium" style={{ border: "1px solid var(--border)", color: "var(--text)" }}>
            <TokenIcon symbol={m} size={14} />
            {m.replace(/-USD$/, "")}
            {!s ? <LoadingDots /> : s === "none" ? <span className="text-[10.5px]" style={{ color: "var(--text-faint)" }} title="No tracked positions in this market yet">empty</span> : null}
            <button type="button" aria-label={`Remove ${m}`} onClick={() => onChange(picked.filter((x) => x !== m))} className="w-5 h-5 inline-flex items-center justify-center rounded-full hover:bg-[var(--bg-elevated)]" style={{ color: "var(--text-muted)" }}>
              <X size={12} />
            </button>
          </span>
        );
      })}
      {picked.length < MAX_PICKS && (
        <button
          type="button"
          aria-expanded={open}
          onClick={() => setOpen((x) => !x)}
          className="inline-flex items-center gap-1 h-7 px-2.5 rounded-full text-[12px] font-medium"
          style={{ border: "1px dashed var(--border)", color: "var(--text-muted)" }}
        >
          <Plus size={12} /> Pair
        </button>
      )}
      {open && (
        <div className="absolute right-0 top-9 z-30 w-[240px] p-1.5" style={{ ...CARD_STYLE, borderRadius: 12, boxShadow: "0 12px 32px rgba(0,0,0,0.3)" }}>
          <label className="flex items-center gap-2 h-8 px-2 mb-1 rounded-[8px]" style={{ background: "var(--bg-elevated)" }}>
            <Search size={13} style={{ color: "var(--text-faint)" }} />
            <input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="Find a perp" aria-label="Find a perp market" className="flex-1 min-w-0 bg-transparent outline-none text-[12.5px]" style={{ color: "var(--text)" }} />
          </label>
          <ul className="max-h-[260px] overflow-y-auto">
            {options.map((m) => (
              <li key={m.symbol}>
                <button
                  type="button"
                  onClick={() => {
                    onChange([...picked, m.symbol]);
                    setOpen(false);
                    setQ("");
                  }}
                  className="w-full flex items-center gap-2 px-2 py-1.5 rounded-[8px] text-[12.5px] text-left hover:bg-[var(--bg-elevated)]"
                  style={{ color: "var(--text)" }}
                >
                  <TokenIcon symbol={m.symbol} size={16} />
                  {m.symbol.replace(/-USD$/, "")}
                </button>
              </li>
            ))}
            {!options.length && (
              <li className="px-2 py-2 text-[12px]" style={{ color: "var(--text-faint)" }}>
                No other perp matches.
              </li>
            )}
          </ul>
          <p className="px-2 pt-1.5 text-[10.5px]" style={{ color: "var(--text-faint)" }}>
            Picked pairs refresh every 5 minutes.
          </p>
        </div>
      )}
    </div>
  );
}
