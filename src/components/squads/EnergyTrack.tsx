"use client";

import { useState } from "react";
import { Search, X } from "lucide-react";
import { count } from "@/lib/analyticsFormat";
import { useCompact } from "@/components/analytics/hooks";
import { CARD_STYLE } from "@/components/analytics/kit";
import { useWidth } from "@/components/deep/shared";
import { shortAddr } from "@/components/wallet/ui";
import type { Squad, SquadsOverview, SquadTier } from "@/lib/squadStore";
import { TierPill } from "./Tag";
import { BASE, boostColor, layoutDots, members, nodeX, plus, shortEnergy, stepOf, tierColor, trackX, zoneFill, zoneMid, type Lookup } from "./track";

/**
 * The page's hero: every squad on one Energy track, from no boost to the top
 * tier, with the wallet search built in. A lookup pins the wallet's two
 * squads onto the track. Each tier has its colour; the searched wallet is amber.
 */

export interface TrackProps {
  data: SquadsOverview;
  tiers: SquadTier[];
  cap: number;
  /** The board's exact Energy by captain; lookups carry rounded figures. */
  energyOf: (q: Squad) => number;
  roughly: (q: Squad) => boolean;
  found: Lookup | null;
  loading: boolean;
  query: string | null;
  input: string;
  setInput: (s: string) => void;
  bad: boolean;
  go: (raw: string, as?: "wallet" | "squad") => void;
}

export function EnergyTrack(p: TrackProps) {
  const top = p.data.top;

  return (
    <section id="track" aria-labelledby="sq-track-title" className="relative overflow-hidden min-w-0 px-4 sm:px-6 pt-5 sm:pt-6 pb-4 sm:pb-5" style={CARD_STYLE}>
      <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_440px] gap-4 lg:gap-10 lg:items-center">
        <div className="min-w-0">
          <h2 id="sq-track-title" className="text-[20px] sm:text-[24px] font-semibold leading-tight" style={{ color: "var(--text)", letterSpacing: "-0.025em" }}>
            Top {count(top.length)} squads
          </h2>
        </div>
        <div className="min-w-0">
          <SearchBox {...p} />
        </div>
      </div>

      <TrackMap {...p} />
    </section>
  );
}

function SearchBox({ input, setInput, bad, go, loading }: TrackProps) {
  const compact = useCompact();
  return (
    <div>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          go(input);
        }}
        className={`flex items-center gap-2 h-12 pl-3.5 pr-1.5 rounded-[14px] border transition-shadow focus-within:shadow-[0_0_0_4px_var(--accent-dim)] ${
          bad ? "border-[var(--red)]" : "border-[var(--border)] focus-within:border-[var(--text-muted)]"
        }`}
        style={{ background: "var(--bg)" }}
      >
        <Search size={16} style={{ color: "var(--text-faint)" }} aria-hidden className="shrink-0" />
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onPaste={(e) => {
            const t = e.clipboardData.getData("text").trim();
            if (/^0x[0-9a-fA-F]{40}$/.test(t)) {
              e.preventDefault();
              go(t);
            }
          }}
          placeholder={compact ? "Paste a wallet (0x…)" : "Paste a wallet address (0x…)"}
          spellCheck={false}
          autoComplete="off"
          aria-label="Wallet address"
          aria-invalid={bad}
          className="flex-1 min-w-0 bg-transparent outline-none mono text-[13.5px]"
          style={{ color: "var(--text)", border: "none", borderRadius: 0 }}
        />
        {input && (
          <button
            type="button"
            onClick={(e) => {
              setInput("");
              (e.currentTarget.parentElement?.querySelector("input") as HTMLInputElement | null)?.focus();
            }}
            className="w-7 h-7 grid place-items-center shrink-0 cursor-pointer"
            style={{ borderRadius: 8, color: "var(--text-faint)" }}
            aria-label="Clear"
          >
            <X size={14} />
          </button>
        )}
        <button
          type="submit"
          aria-busy={loading}
          className="h-9 px-3.5 inline-flex items-center gap-1.5 text-[13px] font-semibold shrink-0 cursor-pointer"
          style={{ borderRadius: 10, background: "var(--sq-you)", color: "var(--sq-on)" }}
        >
          {loading ? (
            <span className="dot-wave inline-flex gap-[3px]" style={{ color: "var(--sq-on)" }}>
              <span />
              <span />
              <span />
            </span>
          ) : (
            <>
              {compact ? "Find" : "Find squads"}
            </>
          )}
        </button>
      </form>
      {bad && (
        <p role="alert" className="mt-2 text-[12px]" style={{ color: "var(--red)" }}>
          Not a wallet: 0x + 40 characters
        </p>
      )}
    </div>
  );
}

/* ── The track ──────────────────────────────────────────────────────────── */

const ROWS = 8;

function TrackMap({ data, tiers, cap, found, loading, query, go, energyOf, roughly }: TrackProps) {
  const compact = useCompact();
  const [ref, W] = useWidth<HTMLDivElement>();
  const [focus, setFocus] = useState<{ q: Squad; cx: number; cy: number } | null>(null);
  const top = data.top;
  const byTier = data.totals.byTier;
  const reached = tiers.map((_, i) => byTier.slice(i + 1).reduce((a, n) => a + n, 0) > 0);
  const frontier = reached.findIndex((r) => !r);

  const d = compact ? 5 : 7;
  const step = d + 1.5;
  const dotArea = ROWS * step;

  // Pins: the looked-up wallet's squads.
  const pins = found
    ? (
        [
          ["Joined", found.joined],
          ["Built", found.built],
        ] as const
      )
        .filter((e): e is readonly ["Joined" | "Built", Squad] => !!e[1])
        .map(([label, q]) => ({ label, q, x: trackX(energyOf(q), tiers, cap) }))
    : [];
  const collide = pins.length === 2 && Math.abs(pins[0].x - pins[1].x) * W < 96;
  const band = collide ? 50 : 26;
  const upper = band + dotArea + 6;
  const pinned = new Set(pins.map((x) => x.q.captain));

  const xs = top.map((q) => trackX(q.energy, tiers, cap) * W);
  const dots = W ? layoutDots(xs, step, ROWS, W, d / 2 + 0.75) : [];

  const summary =
    `${count(byTier[0] ?? 0)} squads below ${shortEnergy(tiers[0].energy)} Energy` +
    tiers.map((t, i) => (byTier[i + 1] ? `, ${count(byTier[i + 1])} at ${plus(t.boost)}` : "")).join("") +
    (found ? `. Pinned: joined squad ${found.joined ? `${shortEnergy(energyOf(found.joined))} Energy` : "none"}, built squad ${found.built ? `${shortEnergy(energyOf(found.built))} Energy` : "none"}.` : ".");

  return (
    <div id="track-map" className="mt-5 sm:mt-6 scroll-mt-[72px]">
      <div ref={ref} className="relative" role="img" aria-label={summary}>
        {/* Pins band and dots */}
        <div className="relative" style={{ height: upper }}>
          {!query && (
            <span className="absolute left-0 top-0 text-[11.5px]" style={{ color: "var(--text-faint)" }}>
              Search a wallet to pin it here
            </span>
          )}
          {query && loading && <span className="absolute left-0 top-0 chart-shimmer" style={{ width: 84, height: 20, borderRadius: 6 }} />}
          {found && !pins.length && (
            <span
              className="absolute left-0 top-0 sq-pin px-1.5 py-[3px] text-[11px] font-semibold mono whitespace-nowrap leading-none"
              style={{ borderRadius: 6, border: "1px dashed var(--sq-you)", color: "var(--sq-you)" }}
            >
              No squad yet
            </span>
          )}
          {W > 0 &&
            pins.map((pin, i) => {
              const x = pin.x * W;
              const chipTop = collide && i === 1 ? 24 : 0;
              const anchor = pin.x < 0.12 ? { left: Math.max(0, x - 6) } : pin.x > 0.88 ? { left: x + 6, transform: "translateX(-100%)" } : { left: x, transform: "translateX(-50%)" };
              const off = pin.q.members === 0;
              const solid = pin.label === "Joined" && !off;
              return (
                <span key={pin.label} aria-hidden>
                  <span className="absolute z-[2]" style={{ top: chipTop, ...anchor }}>
                    <span
                      className="sq-pin block px-1.5 py-[3px] text-[11px] font-semibold mono whitespace-nowrap leading-none"
                      style={{
                        borderRadius: 6,
                        background: solid ? "var(--sq-you)" : "var(--bg-surface)",
                        color: solid ? "var(--sq-on)" : "var(--sq-you)",
                        border: `1px ${off ? "dashed" : "solid"} var(--sq-you)`,
                      }}
                    >
                      {pin.label} {roughly(pin.q) ? "≈" : ""}
                      {shortEnergy(energyOf(pin.q))}
                      {off ? " · inactive" : ""}
                    </span>
                  </span>
                  <span className="absolute z-[2] w-[1.5px]" style={{ left: x - 0.75, top: chipTop + 19, height: upper - chipTop - 19, background: "var(--sq-you)" }} />
                </span>
              );
            })}

          {/* Dots: the biggest squads, in their tier's colour, leaders nearest the bar */}
          {W > 0 && top.length > 0 && (
            <svg className="absolute left-0" style={{ bottom: 6, pointerEvents: compact ? "none" : "auto" }} width={W} height={dotArea} aria-hidden>
              {dots.map((p, i) => {
                const q = top[i];
                const r = d / 2 + (i < 3 ? 0.75 : 0);
                const ring = pinned.has(q.captain);
                return (
                  <circle
                    key={q.captain}
                    className="lb-dot"
                    cx={p.cx}
                    cy={p.cy}
                    r={ring ? r + 1 : r}
                    fill={ring ? "none" : boostColor(q.boost, tiers)}
                    stroke={ring ? "var(--sq-you)" : undefined}
                    strokeWidth={ring ? 2 : undefined}
                    style={{ animationDelay: `${Math.min(i, 60) * 8}ms`, cursor: compact ? undefined : "pointer" }}
                    onMouseEnter={() => setFocus({ q, cx: p.cx, cy: p.cy })}
                    onMouseLeave={() => setFocus(null)}
                    onClick={() => go(q.captain, "squad")}
                  />
                );
              })}
            </svg>
          )}
          {!top.length && (
            <span className="absolute inset-x-0 text-center text-[12.5px]" style={{ bottom: 6 + dotArea / 2 - 8, color: "var(--text-muted)" }}>
              No active squads yet
            </span>
          )}
          {focus && !compact && (
            <span
              className="absolute pointer-events-none z-10 rounded-[10px] px-2.5 py-1.5 text-[11.5px] border border-[var(--border)] whitespace-nowrap"
              style={{
                left: Math.max(0, Math.min(W - 200, focus.cx - 100)),
                bottom: 6 + dotArea - focus.cy + 10,
                background: "var(--bg-surface)",
                boxShadow: "var(--card-shadow)",
              }}
            >
              <span className="flex items-center gap-1.5 text-[12px] font-semibold" style={{ color: "var(--text)" }}>
                {focus.q.name || shortAddr(focus.q.captain)}
                {focus.q.boost > 0 && <TierPill boost={focus.q.boost} tiers={tiers} />}
              </span>
              <span className="block mono" style={{ color: "var(--text-muted)" }}>
                {shortEnergy(focus.q.energy)} Energy · {members(focus.q.members)}
              </span>
            </span>
          )}
        </div>

        {/* Zones and tier lines */}
        <div className="relative">
          <div className="flex gap-[2px]" style={{ height: compact ? 8 : 10 }} aria-hidden>
            {[BASE, ...tiers.map(() => stepOf(tiers))].map((w, k) => (
              <span key={k} className="first:rounded-l-full last:rounded-r-full" style={{ width: `${w * 100}%`, background: zoneFill(k) }} />
            ))}
          </div>
          {tiers.map((t, i) => (
            <span
              key={t.energy}
              className="absolute top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full"
              style={{
                left: `${nodeX(i, tiers) * 100}%`,
                width: compact ? 11 : 14,
                height: compact ? 11 : 14,
                background: reached[i] ? tierColor(i) : "var(--bg-surface)",
                boxShadow: reached[i] ? "0 0 0 2px var(--bg-surface)" : `inset 0 0 0 1.5px ${tierColor(i)}, 0 0 0 2px var(--bg-surface)`,
                ["--c" as string]: tierColor(i),
              }}
              aria-hidden
            >
              {i === frontier && <span className="sq-ping" />}
            </span>
          ))}
        </div>

        {/* Labels */}
        <div className="relative mt-2 h-[30px]" aria-hidden>
          <span className="hidden sm:block absolute -translate-x-1/2 text-[11px]" style={{ left: `${(BASE / 2) * 100}%`, color: "var(--text-muted)" }}>
            No boost
          </span>
          {tiers.map((t, i) => (
            <span key={t.energy} className="absolute -translate-x-1/2 text-center leading-tight whitespace-nowrap" style={{ left: `${nodeX(i, tiers) * 100}%` }}>
              <span className="block mono font-bold text-[11px] sm:text-[12.5px]" style={{ color: tierColor(i) }}>
                {plus(t.boost)}
              </span>
              <span className="block mono text-[10px] sm:text-[10.5px]" style={{ color: "var(--text-muted)" }}>
                {shortEnergy(t.energy)}
              </span>
            </span>
          ))}
        </div>

        {/* Squads in each zone */}
        <div className="relative mt-1 h-[22px]" aria-hidden>
          {byTier.map((n, k) => (
            <span
              key={k}
              className="absolute -translate-x-1/2 whitespace-nowrap mono font-semibold text-[11.5px] sm:text-[13px]"
              style={{ left: `${zoneMid(k, tiers) * 100}%`, color: k === 0 ? "var(--text)" : n > 0 ? tierColor(k - 1) : "var(--text-faint)" }}
            >
              {count(n)}
              {k === 0 && (
                <span className="font-sans font-normal text-[11px]" style={{ color: "var(--text-muted)" }}>
                  {" "}
                  squads
                </span>
              )}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}
