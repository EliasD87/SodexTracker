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
import { members, shortEnergy, type Lookup } from "./track";

/** The biggest squads: Energy, members and the boost each one gives. */

type Sort = "energy" | "members";

interface Props {
  data: SquadsOverview;
  tiers: SquadTier[];
  rankBy: Map<string, number>;
  found: Lookup | null;
  go: (raw: string, as?: "wallet" | "squad") => void;
}

const COLS = "grid-cols-[40px_minmax(0,1fr)_110px_96px_76px]";

export function Standings({ data, tiers, rankBy, found, go }: Props) {
  const [sort, setSort] = useState<Sort>("energy");
  const top = data.top;
  const sorted = sort === "energy" ? top : [...top].sort((a, b) => b.members - a.members || b.energy - a.energy);
  const { shown, toggle } = useRowLimit(sorted, 25, 10);
  const mark = (q: Squad) => (found?.joined?.captain === q.captain ? "joined" : found?.built?.captain === q.captain ? "built" : null);

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
            className={`hidden md:grid ${COLS} gap-x-3 items-center px-5 py-2 text-[10.5px] font-semibold uppercase tracking-[0.06em]`}
            style={{ color: "var(--text-faint)" }}
          >
            <span>#</span>
            <span>Squad</span>
            <span className="text-right">Energy</span>
            <span className="text-right">Members</span>
            <span className="text-right">Boost</span>
          </div>
          <ol>
            {shown.map((q, i) => {
              const rank = rankBy.get(q.captain) ?? i + 1;
              const m = mark(q);
              return (
                <li key={q.captain}>
                  <button
                    type="button"
                    title="Show this squad"
                    onClick={() => go(q.captain, "squad")}
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
                    <span className={`hidden md:grid ${COLS} gap-x-3 items-center px-5 py-2.5`}>
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
                    <span className="md:hidden grid grid-cols-[26px_minmax(0,1fr)_auto] gap-x-2.5 items-center px-4 py-3">
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
                    </span>
                  </button>
                </li>
              );
            })}
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
