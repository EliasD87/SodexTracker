"use client";

import { usePathname } from "next/navigation";
import { usd } from "@/lib/analyticsFormat";
import { useApi } from "@/components/analytics/hooks";
import { SODEXTRA_BOT_CSS, SODEXTRA_BOTS, SodextraBot } from "@/components/sodextra/SodextraBot";

const VOLT = "#c8ff5a";

/**
 * Sodextra, our trading bots for SoDEX, in a slim strip under the navbar on every page.
 * It sits in the page's flow: its top margin clears the fixed navbar and its negative
 * bottom margin hands that space back, so each page keeps its own spacing and simply
 * starts lower by the strip's height. Left out of the trading screen, which fills the
 * window. Hovering the strip makes the bots jump, one after another.
 */
export function SodextraStrip() {
  const pathname = usePathname();
  // What the bots have traded so far, live from sodextra.xyz; left out if it can't be read.
  const traded = useApi<{ volume: number }>("/api/sodextra", 5 * 60_000, 5 * 60_000).data?.volume;
  if (pathname.startsWith("/trade") && !pathname.startsWith("/trade-history")) return null;

  return (
    <div className="relative z-10 mt-14 -mb-14">
      <style>{SODEXTRA_BOT_CSS}</style>
      <a
        href="https://sodextra.xyz"
        target="_blank"
        rel="noopener"
        className="sxb-wave group block overflow-hidden"
        style={{
          background: `linear-gradient(90deg, color-mix(in srgb, ${VOLT} 9%, var(--bg-surface)) 0%, var(--bg-surface) 55%, color-mix(in srgb, ${VOLT} 5%, var(--bg-surface)) 100%)`,
          borderBottom: "1px solid var(--border)",
        }}
      >
        <div className="max-w-[1200px] mx-auto px-4 sm:px-8 h-[52px] flex items-center gap-3 sm:gap-4">
          <span className="flex items-center gap-1.5 shrink-0">
            {SODEXTRA_BOTS.map((k, i) => (
              <span key={k} className={i >= 3 ? "hidden sm:inline-flex" : "inline-flex"}>
                <SodextraBot kind={k} size={30} delay={i * 1.3} jumpDelay={i * 80} />
              </span>
            ))}
          </span>

          <span className="min-w-0 flex-1 truncate text-[12.5px] sm:text-[13px]" style={{ color: "var(--text-muted)" }}>
            <span className="font-semibold" style={{ color: "var(--text)" }}>
              Sodextra
            </span>
            <span className="hidden sm:inline"> · Free trading bots for SoDEX</span>
            {traded != null && (
              <>
                {" · "}
                <span className="font-semibold tabular-nums" style={{ color: "var(--text)" }}>
                  {usd(traded)}
                </span>{" "}
                traded<span className="hidden sm:inline"> so far</span>
              </>
            )}
          </span>

          <span
            className="shrink-0 h-8 px-3.5 inline-flex items-center rounded-full text-[12.5px] font-semibold transition-transform group-hover:scale-[1.04]"
            style={{ background: VOLT, color: "#090b10", boxShadow: `0 4px 14px color-mix(in srgb, ${VOLT} 35%, transparent)` }}
          >
            <span className="hidden sm:inline">Try the bots</span>
            <span className="sm:hidden">Try</span>
          </span>
        </div>
      </a>
    </div>
  );
}
