"use client";

import { useState } from "react";
import { ChevronDown } from "lucide-react";
import type { LiqBucket } from "@/lib/positionStore";
import { usd } from "@/lib/analyticsFormat";
import { useCompact } from "@/components/analytics/hooks";

/**
 * Where liquidations sit around the price: shorts above (liquidated if price
 * rises), longs below (liquidated if it falls), one bar per 0.5% step.
 * A phone starts with the steps nearest the price on each side.
 */

// Coloured by the move, the way charts read: price rising into shorts is
// green, price falling into longs is red.
const UP = "var(--green)";
const DOWN = "var(--red)";
const price = (p: number) => (p >= 1000 ? p.toLocaleString("en-US", { maximumFractionDigits: 0 }) : p >= 1 ? p.toFixed(2) : p.toPrecision(4));
/** Steps shown each side of the price on a phone before "Show full range". */
const PHONE_STEPS = 8;
// Narrower price and amount columns on a phone, so the bars keep their room.
const COLS = "grid-cols-[64px_1fr_56px] sm:grid-cols-[88px_1fr_72px] gap-2 sm:gap-3";

function Row({ p, v, max, color }: { p: number; v: number; max: number; color: string }) {
  return (
    <div className={`grid ${COLS} items-center h-[18px]`}>
      <span className="mono text-[11px] text-right" style={{ color: "var(--text-muted)" }}>{price(p)}</span>
      <span className="h-[10px] rounded-full" style={{ width: `${Math.max(1.5, (v / max) * 100)}%`, background: color, opacity: 0.85 }} />
      <span className="mono text-[11px]" style={{ color: "var(--text-muted)" }}>{usd(v)}</span>
    </div>
  );
}

export function LiqLadder({ mark, buckets }: { mark: number; buckets: LiqBucket[] }) {
  const max = Math.max(1, ...buckets.map((b) => Math.max(b.longUsd, b.shortUsd)));
  const above = buckets.filter((b) => b.price > mark && b.shortUsd > 0);
  const below = buckets.filter((b) => b.price <= mark && b.longUsd > 0);
  const shortsAbove = above.reduce((a, b) => a + b.shortUsd, 0);
  const longsBelow = below.reduce((a, b) => a + b.longUsd, 0);
  const compact = useCompact();
  const [full, setFull] = useState(false);
  const cut = compact && !full && (above.length > PHONE_STEPS || below.length > PHONE_STEPS);
  // Buckets run high to low, so the steps nearest the price are the last above and the first below.
  const aboveShown = cut ? above.slice(-PHONE_STEPS) : above;
  const belowShown = cut ? below.slice(0, PHONE_STEPS) : below;
  return (
    <div>
      <div className="grid grid-cols-2 gap-3 mb-4">
        <div className="rounded-[12px] px-3 py-2.5" style={{ background: "var(--bg-elevated)" }}>
          <div className="text-[11.5px]" style={{ color: "var(--text-muted)" }}>Shorts liquidated if price rises</div>
          <div className="mono text-[16px] sm:text-[18px] font-semibold mt-0.5" style={{ color: UP }}>{shortsAbove ? usd(shortsAbove) : "None"}</div>
        </div>
        <div className="rounded-[12px] px-3 py-2.5" style={{ background: "var(--bg-elevated)" }}>
          <div className="text-[11.5px]" style={{ color: "var(--text-muted)" }}>Longs liquidated if price falls</div>
          <div className="mono text-[16px] sm:text-[18px] font-semibold mt-0.5" style={{ color: DOWN }}>{longsBelow ? usd(longsBelow) : "None"}</div>
        </div>
      </div>
      <div className="flex flex-col gap-[3px]">
        {aboveShown.map((b) => (
          <Row key={b.price} p={b.price} v={b.shortUsd} max={max} color={UP} />
        ))}
        <div className={`grid ${COLS} items-center my-1`}>
          <span className="mono text-[11px] font-semibold text-right" style={{ color: "var(--text)" }}>{price(mark)}</span>
          <span className="h-px" style={{ background: "var(--text)" }} />
          <span className="tag" style={{ color: "var(--text)" }}>MARK</span>
        </div>
        {belowShown.map((b) => (
          <Row key={b.price} p={b.price} v={b.longUsd} max={max} color={DOWN} />
        ))}
      </div>
      {compact && (cut || full) && (
        <button
          onClick={() => setFull((f) => !f)}
          aria-expanded={full}
          className="mt-2 w-full flex items-center justify-center gap-1.5 py-2 text-[12px] font-medium"
          style={{ color: "var(--text-muted)" }}
        >
          {full ? "Show nearest steps" : "Show full range"}
          <ChevronDown size={13} style={{ transform: full ? "rotate(180deg)" : undefined, transition: "transform 0.15s" }} aria-hidden />
        </button>
      )}
    </div>
  );
}
