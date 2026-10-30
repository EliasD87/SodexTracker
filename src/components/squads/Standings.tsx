"use client";

import { useState } from "react";
import { count, timeAgo } from "@/lib/analyticsFormat";
import { Panel, PillTabs } from "@/components/analytics/kit";
import { useRowLimit } from "@/components/analytics/ui";
import { Waiting } from "@/components/deep/shared";
import { shortAddr } from "@/components/wallet/ui";
import type { Squad, SquadsOverview, SquadTier } from "@/lib/squadStore";
import { Avatar } from "./Avatar";
import { SquadTag, TierPill } from "./Tag";
import { boostColor, gapOf, members, plus, shortEnergy, tierColor, trackX, type Lookup } from "./track";

/**
 * The biggest squads, each with a race bar on the page's Energy scale in its
 * tier's colour, so the board steps down from plum to cyan-blue. Tier lines
 * run between rows where squads cross them.
 */

type Sort = "energy" | "next" | "members";

interface Props {
  data: SquadsOverview;
  tiers: SquadTier[];
  cap: number;
  rankBy: Map<string, number>;
  found: Lookup | null;
  go: (raw: string, from: "form" | "pick") => void;
}

export function Standings({ data, tiers, cap, rankBy, found, go }: Props) {
  const [sort, setSort] = useState<Sort>("energy");
  const top = data.top;
  const sorted =
    sort === "energy"
      ? top
      : sort === "next"
        ? [...top].sort((a, b) => (gapOf(a) ?? Infinity) - (gapOf(b) ?? Infinity))
        : [...top].sort((a, b) => b.members - a.members || b.energy - a.energy);
  const { shown, toggle } = useRowLimit(sorted, 25, 10);
  const full = shown.length === sorted.length;
  const mark = (q: Squad) => (found?.joined?.captain === q.captain ? "joined" : found?.built?.captain === q.captain ? "built" : null);

  // Tier lines (Energy order only): above the first row below each tier that anyone has crossed, plus the next one nobody has.
  const byTier = data.totals.byTier;
  const above = (i: number) => byTier.slice(i + 1).reduce((a, n) => a + n, 0);
  const frontier = tiers.findIndex((_, i) => above(i) === 0);
  const lines = new Map<number, number[]>();
  const after: number[] = [];
  if (sort === "energy") {
    tiers.forEach((t, i) => {
      if (above(i) === 0 && i !== frontier) return;
      const at = shown.findIndex((q) => q.energy < t.energy);
      if (at >= 0) lines.set(at, [...(lines.get(at) ?? []), i]);
      else if (full) after.push(i);
    });
  }
  const tierLine = (i: number) => {
    const t = tiers[i];
    const n = above(i);
    return (
      <li key={`tier${i}`} className="flex items-center gap-2 px-4 md:px-5 py-1.5 text-[11px]" style={{ borderTop: `1px dashed ${tierColor(i)}` }}>
        <TierPill boost={t.boost} tiers={tiers} />
        <span className="mono" style={{ color: "var(--text-muted)" }}>
          {shortEnergy(t.energy)}
        </span>
        <span className="ml-auto" style={{ color: "var(--text-faint)" }}>
          {n ? `${count(n)} above` : "None yet"}
        </span>
      </li>
    );
  };
  const nextLabel = (q: Squad) => {
    const gap = gapOf(q);
    return gap != null && q.next ? (
      <>
        {shortEnergy(gap)} to{" "}
        <span className="font-semibold" style={{ color: boostColor(q.next.boost, tiers) }}>
          {plus(q.next.boost)}
        </span>
      </>
    ) : (
      "Top tier"
    );
  };

  return (
    <Panel
      title="Top squads"
      pad={false}
      right={
        <PillTabs
          label="Sort squads"
          value={sort}
          onChange={setSort}
          options={[
            { value: "energy", label: "Energy" },
            { value: "next", label: "Next tier" },
            { value: "members", label: "Members" },
          ]}
        />
      }
    >
      {!top.length ? (
        <div className="px-4 sm:px-5 pb-2">
          <Waiting height={200} reason="No squads yet" />
        </div>
      ) : (
        <>
          <div
            className="hidden md:grid grid-cols-[40px_minmax(0,1.4fr)_minmax(0,1.6fr)_92px_76px_68px] gap-x-3 items-center px-5 py-2 text-[10.5px] font-semibold uppercase tracking-[0.06em]"
            style={{ color: "var(--text-faint)" }}
          >
            <span>#</span>
            <span>Squad</span>
            <span>Progress</span>
            <span className="text-right">Energy</span>
            <span className="text-right">Members</span>
            <span className="text-right">Boost</span>
          </div>
          <ol>
            {shown.flatMap((q, i) => {
              const rank = rankBy.get(q.captain) ?? i + 1;
              const m = mark(q);
              const x = trackX(q.energy, tiers, cap);
              const row = (
                <li key={q.captain}>
                  <button
                    type="button"
                    title="Show this squad"
                    onClick={() => go(q.captain, "pick")}
                    aria-current={m ? "true" : undefined}
                    className="lb-row w-full text-left transition-colors hover:bg-[var(--bg-elevated)] cursor-pointer focus-visible:outline-2 focus-visible:outline-[var(--text)] focus-visible:-outline-offset-2"
                    style={{
                      borderTop: "1px solid var(--border-subtle)",
                      borderRadius: 0,
                      animationDelay: `${Math.min(i, 20) * 18}ms`,
                      background: m ? "var(--sq-you-tint)" : undefined,
                      boxShadow: m ? "inset 3px 0 0 var(--sq-you)" : undefined,
                    }}
                  >
                    {/* Desktop: one line */}
                    <span className="hidden md:grid grid-cols-[40px_minmax(0,1.4fr)_minmax(0,1.6fr)_92px_76px_68px] gap-x-3 items-center px-5 py-2.5">
                      <Rank n={rank} />
                      <span className="flex items-center gap-2.5 min-w-0">
                        <Avatar address={q.captain} size={28} captain />
                        <span className="min-w-0">
                          <span className="flex items-center gap-1.5 min-w-0">
                            <span className="text-[13px] font-medium truncate" style={{ color: "var(--text)" }}>
                              {q.name || shortAddr(q.captain)}
                            </span>
                            {m && <SquadTag kind={m} />}
                          </span>
                          {q.name && (
                            <span className="block text-[11px] mono truncate" style={{ color: "var(--text-faint)" }}>
                              {shortAddr(q.captain)}
                            </span>
                          )}
                        </span>
                      </span>
                      <span className="min-w-0">
                        <RaceBar q={q} x={x} tiers={tiers} cap={cap} />
                        <span className="block mt-1 text-[10.5px]" style={{ color: "var(--text-faint)" }}>
                          {nextLabel(q)}
                        </span>
                      </span>
                      <span className="mono text-[13px] font-semibold text-right" style={{ color: "var(--text)" }}>
                        {shortEnergy(q.energy)}
                      </span>
                      <span className="mono text-[12.5px] text-right" style={{ color: "var(--text-muted)" }}>
                        {count(q.members)}
                        {q.pending > 0 && (
                          <span style={{ color: "var(--text-faint)" }} title={`${count(q.pending)} waiting`}>
                            {" "}
                            +{count(q.pending)}
                          </span>
                        )}
                      </span>
                      <span className="text-right">{q.boost > 0 ? <TierPill boost={q.boost} tiers={tiers} /> : <span style={{ color: "var(--text-faint)" }}>—</span>}</span>
                    </span>

                    {/* Phone: two lines */}
                    <span className="md:hidden grid grid-cols-[26px_minmax(0,1fr)_auto] gap-x-2.5 gap-y-1.5 px-4 py-3">
                      <Rank n={rank} small />
                      <span className="min-w-0">
                        <span className="flex items-center gap-1.5 min-w-0">
                          <span className="text-[13px] font-medium truncate" style={{ color: "var(--text)" }}>
                            {q.name || shortAddr(q.captain)}
                          </span>
                          {m && <SquadTag kind={m} />}
                        </span>
                        <span className="block text-[11px] mono truncate" style={{ color: "var(--text-faint)" }}>
                          {q.name ? `${shortAddr(q.captain)} · ` : ""}
                          {members(q.members)}
                        </span>
                      </span>
                      <span className="flex flex-col items-end gap-1">
                        <span className="mono text-[13px] font-semibold" style={{ color: "var(--text)" }}>
                          {shortEnergy(q.energy)}
                        </span>
                        {q.boost > 0 ? <TierPill boost={q.boost} tiers={tiers} /> : <span style={{ color: "var(--text-faint)" }}>—</span>}
                      </span>
                      <span className="col-start-2 col-span-2 flex items-center gap-2">
                        <span className="flex-1 min-w-0">
                          <RaceBar q={q} x={x} tiers={tiers} cap={cap} />
                        </span>
                        <span className="shrink-0 text-[10.5px]" style={{ color: "var(--text-faint)" }}>
                          {nextLabel(q)}
                        </span>
                      </span>
                    </span>
                  </button>
                </li>
              );
              return [...(lines.get(i) ?? []).map(tierLine), row];
            })}
            {after.map(tierLine)}
          </ol>
          {toggle}
        </>
      )}
      <p className="px-4 sm:px-5 pb-4 pt-2 text-[11px]" style={{ color: "var(--text-faint)" }}>
        Top {count(top.length)} · updated {timeAgo(data.asOf)}
      </p>
    </Panel>
  );
}

function Rank({ n, small }: { n: number; small?: boolean }) {
  return n <= 3 ? (
    <span
      className="mono font-bold inline-flex items-center justify-center"
      style={{ width: small ? 22 : 24, height: small ? 22 : 24, borderRadius: 7, background: "var(--text)", color: "var(--bg)", fontSize: 12 }}
    >
      {n}
    </span>
  ) : (
    <span className="mono font-bold text-[13px]" style={{ color: "var(--text-muted)" }}>
      {n}
    </span>
  );
}

/** One squad on the page's Energy scale, in its tier's colour: tier notches, a fill and a head. */
function RaceBar({ q, x, tiers, cap }: { q: Squad; x: number; tiers: SquadTier[]; cap: number }) {
  const c = boostColor(q.boost, tiers);
  return (
    <span className="relative block h-[6px] rounded-full" style={{ background: "var(--bg-elevated)" }} aria-hidden>
      <span className="lb-bar absolute inset-y-0 left-0 rounded-full" style={{ width: `${x * 100}%`, background: `color-mix(in srgb, ${c} 55%, transparent)` }} />
      {tiers.map((t, i) => {
        const nx = q.next?.energy === t.energy;
        return (
          <span
            key={t.energy}
            className="absolute -top-[2px] h-[10px]"
            style={{ left: `${trackX(t.energy, tiers, cap) * 100}%`, width: nx ? 2 : 1, background: nx ? tierColor(i) : "var(--text-faint)", opacity: nx ? 1 : 0.5 }}
          />
        );
      })}
      <span className="absolute top-1/2 -translate-x-1/2 -translate-y-1/2 w-[9px] h-[9px] rounded-full" style={{ left: `${x * 100}%`, background: c, boxShadow: "0 0 0 2px var(--bg-surface)" }} />
    </span>
  );
}
