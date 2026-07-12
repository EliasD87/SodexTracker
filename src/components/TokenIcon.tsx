"use client";

import { useState } from "react";
import { getTokenIcon, tickerLabel } from "@/lib/tokenIcons";

/**
 * Round token icon for any SoDEX symbol / pair / balance asset.
 * Falls back to a monochrome ticker badge when there is no mapping
 * (or the remote image fails to load).
 */
export function TokenIcon({
  symbol,
  size = 24,
  className = "",
}: {
  symbol: string;
  size?: number;
  className?: string;
}) {
  const url = getTokenIcon(symbol);
  const ticker = tickerLabel(symbol);
  const [failed, setFailed] = useState(false);

  const showImg = url && !failed;

  // First 3 chars keep the badge legible at small sizes.
  const badge = ticker.slice(0, 3) || "?";

  return (
    <span
      className={`relative inline-flex items-center justify-center shrink-0 overflow-hidden ${className}`}
      style={{
        width: size,
        height: size,
        borderRadius: "50%",
        background: "var(--bg-elevated)",
        border: "1px solid var(--border)",
      }}
      title={ticker}
      aria-label={ticker}
    >
      {showImg ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={url}
          alt={ticker}
          width={size}
          height={size}
          loading="eager"
          onError={() => setFailed(true)}
          style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }}
        />
      ) : (
        <span
          className="mono font-bold leading-none"
          style={{ fontSize: Math.max(7, size * 0.32), color: "var(--text-muted)", letterSpacing: "-0.02em" }}
        >
          {badge}
        </span>
      )}
    </span>
  );
}
