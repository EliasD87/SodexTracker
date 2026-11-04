"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowUpRight, Check, Crown, Zap } from "lucide-react";
import { count, pct, usd } from "@/lib/analyticsFormat";
import { CARD_STYLE } from "@/components/analytics/kit";
import { CopyButton, shortAddr } from "@/components/wallet/ui";
import type { Squad, SquadsOverview, SquadTier } from "@/lib/squadStore";
import { Avatar, AvatarStack } from "./Avatar";
import { SquadTag, TierPill } from "./Tag";
import { BASE, boostColor, gapOf, ghostFill, nodeX, plus, shortEnergy, stepOf, stepShare, tierColor, trackX, zoneFill, type Lookup } from "./track";

/**
 * A looked-up wallet: its estimated SoPoints boost and where it comes from,
 * then the squad it joined and the squad it built. Amber marks this wallet
 * and its squads, as on the track and the standings.
 */

interface Props {
  r: Lookup;
  data: SquadsOverview;
  tiers: SquadTier[];
  cap: number;
  energyOf: (q: Squad) => number;
  roughly: (q: Squad) => boolean;
  rankBy: Map<string, number>;
  go: (raw: string, as?: "wallet" | "squad") => void;
  retry: () => void;
}

/** How a squad card is shown: as the wallet's joined or built squad, or on its own. */
type Kind = "joined" | "built" | "squad";

/** One squad on its own, for a squad picked from the board or the track (looked up by its captain). */
export function SquadOnly(p: Props) {
  const q = p.r.built;
  return (
    <section id="result" aria-label="Squad" className="grid">
      {q ? <SquadCard kind="squad" q={q} delay={0} {...p} /> : <EmptyCard kind="built" title="No squad found" tiers={p.tiers} />}
    </section>
  );
}

export function WalletResult(p: Props) {
  const { r } = p;
  const total = r.boost.squads + r.boost.invited;
  return (
    <section id="result" aria-label="This wallet's squads" className="grid gap-3 sm:gap-4 scroll-mt-[72px]">
      <span className="sr-only" aria-live="polite">
        Squads for {shortAddr(r.address)}: estimated boost {plus(total)}
      </span>
      <Readout {...p} />
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 sm:gap-4">
        {r.joined ? (
          <SquadCard key={`j${r.joined.captain}`} kind="joined" q={r.joined} delay={0} {...p} />
        ) : !r.inviterKnown ? (
          <EmptyCard kind="joined" title="Couldn't check" tiers={p.tiers}>
            SoDEX didn&apos;t answer.
            <OutlineButton onClick={p.retry}>Try again</OutlineButton>
          </EmptyCard>
        ) : r.inviter ? (
          <EmptyCard kind="joined" title={`Invited by ${shortAddr(r.inviter)}`} tiers={p.tiers}>
            Not in our data yet.
            <OutlineButton onClick={() => p.go(r.inviter!, "squad")}>See {shortAddr(r.inviter)}&apos;s squad</OutlineButton>
          </EmptyCard>
        ) : (
          <EmptyCard kind="joined" title="No joined squad" tiers={p.tiers} />
        )}
        {r.built ? (
          <SquadCard key={`b${r.built.captain}`} kind="built" q={r.built} delay={60} {...p} />
        ) : (
          <EmptyCard kind="built" title="No squad built yet" tiers={p.tiers}>
            <span className="inline-flex items-center gap-1.5">
              Invite traders: <TierPill boost={p.tiers[0].boost} tiers={p.tiers} /> at {shortEnergy(p.tiers[0].energy)}
            </span>
          </EmptyCard>
        )}
      </div>
    </section>
  );
}

/* ── Boost readout ──────────────────────────────────────────────────────── */

function Readout({ r, tiers }: Props) {
  const total = r.boost.squads + r.boost.invited;
  const counts = r.self.counts;
  const jb = r.joined?.boost ?? 0;
  const bb = r.built?.boost ?? 0;
  const asOf = new Date(r.asOf).toISOString().slice(11, 16);

  return (
    <div className="dash-in relative overflow-hidden grid grid-cols-1 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.3fr)]" style={CARD_STYLE}>
      <span aria-hidden className="absolute left-0 inset-y-0 w-[3px]" style={{ background: "var(--sq-you)" }} />
      <div className="p-4 sm:p-6 min-w-0">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
          <Avatar address={r.address} size={36} />
          <span className="mono text-[15px] font-semibold" style={{ color: "var(--text)" }} title={r.address}>
            {shortAddr(r.address)}
          </span>
          <CopyButton text={r.address} label="Copy address" />
          <Link
            href={`/tracker?address=${r.address}`}
            className="ml-auto h-7 px-2.5 inline-flex items-center gap-1 text-[12px] font-medium border border-[var(--border)] rounded-[9px] hover:bg-[var(--bg-elevated)]"
            style={{ color: "var(--text)" }}
          >
            Tracker <ArrowUpRight size={12} />
          </Link>
        </div>
        <div className="mt-2.5 flex flex-wrap gap-1.5">
          <Chip>
            {counts === true ? (
              <>
                <Check size={12} style={{ color: "var(--text)" }} />
                <span style={{ color: "var(--text)" }}>Active</span>
              </>
            ) : counts === false ? (
              <span style={{ color: "var(--text-faint)" }}>Not active yet</span>
            ) : (
              <span>Activity unknown</span>
            )}
          </Chip>
          {r.self.volume != null && <Chip>≈{usd(r.self.volume)} volume</Chip>}
          {!r.scanned && (
            <Chip dashed title="Its squad may be missing members">
              Not scanned yet
            </Chip>
          )}
        </div>
        <div className="mt-5">
          <div className={overline} style={{ color: "var(--text-faint)" }}>
            SoPoints boost
          </div>
          <div className="mt-1.5 flex items-baseline gap-1.5">
            <span
              className="text-[44px] sm:text-[52px] font-semibold leading-none tabular-nums"
              style={{ color: counts === false ? "var(--text-faint)" : "var(--text)", letterSpacing: "-0.035em" }}
            >
              {counts === null ? "≈" : ""}
              {counts === false ? "+0%" : plus(total)}
            </span>
            <span className="text-[12px] cursor-help" style={{ color: "var(--text-faint)" }} title={`Estimated from public data · as of ${asOf} UTC`}>
              {counts === false ? "for now" : "est."}
            </span>
          </div>
          {/* The sum, so the big number adds up at a glance. */}
          <div className="mt-2 text-[12.5px] mono" style={{ color: "var(--text-muted)" }}>
            {!jb && !bb
              ? "No boost yet"
              : [jb ? `${pc(jb)} joined` : "", bb ? `${pc(bb)} built` : ""].filter(Boolean).join(" + ")}
            {jb + bb > r.boost.max ? ` (squads capped at ${plus(r.boost.max)})` : ""}
          </div>
        </div>
      </div>

      <div className="p-4 sm:p-6 flex flex-col justify-center min-w-0 border-t lg:border-t-0 lg:border-l border-[var(--border-subtle)]">
        <BoostMeter
          jb={jb}
          bb={bb}
          jc={boostColor(jb, tiers)}
          bc={boostColor(bb, tiers)}
          max={r.boost.max}
          ghost={counts === false}
        />
        <div className="mt-2.5 flex flex-wrap gap-x-4 gap-y-1 text-[11.5px]" style={{ color: "var(--text-muted)" }}>
          <Swatch color={jb ? boostColor(jb, tiers) : "var(--border)"}>Joined {plus(jb)}</Swatch>
          <Swatch color={bb ? boostColor(bb, tiers) : "var(--border)"}>Built {plus(bb)}</Swatch>
          {jb + bb > r.boost.max && <span>Capped at {plus(r.boost.max)}</span>}
        </div>
      </div>
    </div>
  );
}

/** Cells of 5% up to the cap: joined, then built, each in its squad's tier colour. */
function BoostMeter({ jb, bb, jc, bc, max, ghost }: { jb: number; bb: number; jc: string; bc: string; max: number; ghost: boolean }) {
  const cells = Math.round(max / 0.05);
  const j = Math.round(Math.min(jb, max) / 0.05);
  const b = Math.round(Math.max(0, Math.min(bb, max - jb)) / 0.05);
  return (
    <div>
      <span className="flex items-center" role="img" aria-label={`Joined ${plus(jb)}, built ${plus(bb)}, of a ${plus(max)} cap`}>
        <span className="flex flex-1 gap-[3px] h-3 sm:h-[14px]">
          {Array.from({ length: cells }, (_, i) => {
            const on = i < j + b;
            const c = i < j ? jc : bc;
            return (
              <span
                key={i}
                className={`flex-1 ${ghost && on ? "sq-hatch" : ""}`}
                style={{
                  borderRadius: 3,
                  marginLeft: i === j && j > 0 && b > 0 ? 3 : undefined,
                  opacity: ghost && on ? 0.5 : 1,
                  background: ghost && on ? undefined : on ? c : "var(--border)",
                  ["--h" as string]: c,
                }}
              />
            );
          })}
        </span>
      </span>
      <div className="mt-1.5 flex justify-between mono text-[10px]" style={{ color: "var(--text-faint)" }}>
        <span>0</span>
        <span>{plus(max)} cap</span>
      </div>
    </div>
  );
}

/* ── Squad card ─────────────────────────────────────────────────────────── */

const overline = "text-[10.5px] font-semibold uppercase tracking-[0.08em]";
/** A boost without its sign, for sums: "10%". */
const pc = (f: number) => `${Math.round(f * 100)}%`;

function SquadCard({ kind, q, delay, r, tiers, cap, energyOf, roughly, rankBy, go }: Props & { kind: Kind; q: Squad; delay: number }) {
  const rank = rankBy.get(q.captain);
  const e = energyOf(q);
  const gap = gapOf(q);
  const nc = q.next ? boostColor(q.next.boost, tiers) : "var(--text)";
  return (
    <article className="lb-rise p-4 sm:p-5 min-w-0" style={{ ...CARD_STYLE, animationDelay: `${delay}ms` }}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            {kind !== "squad" && <SquadTag kind={kind} />}
            {rank ? (
              <span className="mono text-[11.5px] font-semibold" style={{ color: "var(--text-muted)" }}>
                #{rank}
              </span>
            ) : null}
          </div>
          <h3 className="mt-1.5 text-[17px] sm:text-[19px] font-semibold leading-tight truncate" style={{ color: q.name ? "var(--text)" : "var(--text-faint)", letterSpacing: "-0.02em" }} title={q.name}>
            {q.name || "Unnamed squad"}
          </h3>
          <div className="mt-1 flex items-center gap-1.5 text-[12px]" style={{ color: "var(--text-faint)" }}>
            <Crown size={11} />
            {kind === "built" ? (
              <span>Captain: this wallet</span>
            ) : (
              <>
                Captain <AddrButton a={q.captain} go={go} />
              </>
            )}
          </div>
        </div>
        <LevelBadge boost={q.boost} tiers={tiers} />
      </div>

      <div className="mt-4 grid grid-cols-2 gap-3">
        <div>
          <div className="flex items-center gap-1 text-[11px]" style={{ color: "var(--text-faint)" }}>
            <Zap size={11} /> Energy
          </div>
          <div className="mt-1 text-[22px] font-semibold mono tabular-nums" style={{ color: "var(--text)" }}>
            {roughly(q) && <span className="text-[15px]" style={{ color: "var(--text-faint)" }}>≈</span>}
            {shortEnergy(e)}
          </div>
        </div>
        <div>
          <div className="text-[11px]" style={{ color: "var(--text-faint)" }}>
            Active members
          </div>
          <div className="mt-1 text-[22px] font-semibold mono tabular-nums" style={{ color: "var(--text)" }}>
            {count(q.members)}
            {q.pending > 0 && (
              <span className="ml-1.5 text-[11.5px] font-normal font-sans" style={{ color: "var(--text-faint)" }}>
                +{count(q.pending)} waiting
              </span>
            )}
          </div>
        </div>
      </div>

      <MiniTrack q={q} e={e} tiers={tiers} cap={cap} />

      <div className="mt-3 px-3 py-2.5" style={{ borderRadius: 12, background: "var(--bg-elevated)" }}>
        {q.members === 0 ? (
          <div className="text-[12.5px]" style={{ color: "var(--text-muted)" }}>
            Needs 1 active member
          </div>
        ) : !q.next || gap == null ? (
          <div className="text-[12.5px]" style={{ color: "var(--text-muted)" }}>
            Top tier reached
          </div>
        ) : (
          <>
            <div className="flex items-baseline justify-between gap-2 text-[12.5px]" style={{ color: "var(--text-muted)" }}>
              <span className="flex items-center gap-1.5 min-w-0">
                Next <TierPill boost={q.next.boost} tiers={tiers} /> at {shortEnergy(q.next.energy)}
              </span>
              <span className="mono font-semibold shrink-0" style={{ color: "var(--text)" }}>
                {shortEnergy(gap)} to go
              </span>
            </div>
            <div
              className="mt-2 h-[6px] rounded-full overflow-hidden"
              style={{ background: "var(--border)" }}
              title={`≈${shortEnergy(gap / (q.members + 1))} each for its ${q.members + 1} traders`}
            >
              <div className="lb-bar h-full rounded-full" style={{ width: `${stepShare(q, tiers) * 100}%`, background: nc }} />
            </div>
          </>
        )}
      </div>

      <Roster q={q} e={e} r={r} kind={kind} go={go} />
    </article>
  );
}

function LevelBadge({ boost, tiers }: { boost: number; tiers: SquadTier[] }) {
  return boost > 0 ? (
    <div className="w-12 h-12 shrink-0 flex flex-col items-center justify-center" style={{ borderRadius: 12, background: boostColor(boost, tiers), color: "var(--sq-on)" }}>
      <span className="mono text-[15px] font-bold leading-none">{plus(boost)}</span>
      <span className="mt-1 text-[8.5px] uppercase tracking-[0.08em]">boost</span>
    </div>
  ) : (
    <div className="w-12 h-12 shrink-0 flex flex-col items-center justify-center" style={{ borderRadius: 12, border: "1px dashed var(--border)", color: "var(--text-faint)" }}>
      <span className="mono text-[15px] font-bold leading-none">—</span>
      <span className="mt-1 text-[8.5px] uppercase tracking-[0.08em]">no boost</span>
    </div>
  );
}

/** The squad on the page's Energy track, small, with its own spot in amber. */
function MiniTrack({ q, e, tiers, cap }: { q: Squad; e: number; tiers: SquadTier[]; cap: number }) {
  const x = trackX(e, tiers, cap);
  const reachedIdx = q.members > 0 ? tiers.reduce((h, t, i) => (e >= t.energy ? i : h), -1) : -1;
  const nextIdx = q.members > 0 && q.next ? tiers.findIndex((t) => t.energy === q.next!.energy) : -1;
  return (
    <div className="mt-4" aria-hidden>
      <div className="relative">
        <div className="flex gap-[2px] h-[6px]">
          {[BASE, ...tiers.map(() => stepOf(tiers))].map((w, k) => (
            <span key={k} className="first:rounded-l-full last:rounded-r-full" style={{ width: `${w * 100}%`, background: zoneFill(k), opacity: k === 0 || k - 1 <= reachedIdx ? 1 : 0.35 }} />
          ))}
        </div>
        {tiers.map((t, i) => (
          <span
            key={t.energy}
            className="absolute top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full w-[9px] h-[9px]"
            style={{
              left: `${nodeX(i, tiers) * 100}%`,
              background: i <= reachedIdx ? tierColor(i) : "var(--bg-surface)",
              boxShadow: i <= reachedIdx ? "0 0 0 2px var(--bg-surface)" : `inset 0 0 0 1.5px ${tierColor(i)}`,
              ["--c" as string]: tierColor(i),
            }}
          >
            {i === nextIdx && <span className="sq-ping" />}
          </span>
        ))}
        <span
          className="absolute top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full w-3 h-3"
          style={{
            left: `${x * 100}%`,
            background: q.members > 0 ? "var(--sq-you)" : "var(--bg-surface)",
            boxShadow: q.members > 0 ? "0 0 0 3px var(--bg-surface)" : "0 0 0 3px var(--bg-surface), inset 0 0 0 1.5px var(--sq-you)",
          }}
        />
      </div>
      <div className="relative mt-1.5 h-3">
        {tiers.map((t, i) => (
          <span
            key={t.energy}
            className="absolute -translate-x-1/2 mono text-[10px] leading-none font-semibold"
            style={{ left: `${nodeX(i, tiers) * 100}%`, color: i <= reachedIdx ? tierColor(i) : "var(--text-faint)" }}
          >
            {plus(t.boost)}
          </span>
        ))}
      </div>
    </div>
  );
}

const SHOWN = 8;

function Roster({ q, e, r, kind, go }: { q: Squad; e: number; r: Lookup; kind: Kind; go: Props["go"] }) {
  const [all, setAll] = useState(false);
  const people = q.people ?? [];
  // The searched wallet right after the captain when it would otherwise be folded away.
  const meAt = people.findIndex((m) => m.address === r.address);
  const ordered = meAt >= SHOWN ? [people[0], people[meAt], ...people.slice(1).filter((_, i) => i + 1 !== meAt)] : people;
  const shown = all ? ordered : ordered.slice(0, SHOWN);
  return (
    <div className="mt-4">
      <div className="flex items-center justify-between gap-2">
        <span className="flex items-center gap-2 min-w-0">
          <AvatarStack people={people} total={1 + q.members + q.pending} />
          <span className="text-[11.5px] truncate" style={{ color: "var(--text-muted)" }}>
            {count(q.members)} active · {count(q.pending)} waiting
            {kind === "built" && !r.scanned ? " · may be incomplete" : ""}
          </span>
        </span>
        <span className="text-[11px] shrink-0" style={{ color: "var(--text-faint)" }}>
          Volume
        </span>
      </div>
      <ul className="mt-2">
        {shown.map((m) => {
          const me = kind !== "squad" && m.address === r.address;
          const share = e > 0 && (m.captain || m.active) ? Math.min(1, m.volume / e) : 0;
          return (
            <li
              key={m.address}
              className="grid grid-cols-[20px_minmax(0,1fr)_auto] sm:grid-cols-[20px_minmax(0,1fr)_88px_72px] gap-x-2.5 items-center h-9 text-[12px] px-1"
              style={{ borderTop: "1px solid var(--border-subtle)", background: me ? "var(--sq-you-tint)" : undefined, borderRadius: me ? 8 : undefined }}
            >
              <Avatar address={m.address} size={20} captain={m.captain} you={me && !m.captain} dim={!m.active && !m.captain} />
              <span className="flex items-center gap-1.5 min-w-0">
                <AddrButton a={m.address} go={go} />
                {m.captain ? (
                  <span className="text-[10px] px-1 border border-[var(--border)] shrink-0" style={{ borderRadius: 4, color: "var(--text-muted)" }}>
                    Captain
                  </span>
                ) : me ? (
                  <span className="text-[10px] font-semibold px-1 shrink-0" style={{ borderRadius: 4, background: "var(--sq-you)", color: "var(--sq-on)" }}>
                    This wallet
                  </span>
                ) : !m.active ? (
                  <span className="text-[10px] shrink-0" style={{ color: "var(--text-faint)" }}>
                    Waiting
                  </span>
                ) : null}
              </span>
              <span className="hidden sm:block h-[4px] rounded-full overflow-hidden" style={{ background: "var(--bg-elevated)" }} title={share ? `${pct(share, 0)} of this squad's Energy` : undefined}>
                <span
                  className="block h-full rounded-full"
                  style={{ width: `${share * 100}%`, background: me ? "var(--sq-you)" : m.captain ? "var(--text)" : "color-mix(in srgb, var(--text) 55%, var(--bg-elevated))" }}
                />
              </span>
              <span className="mono text-right" style={{ color: m.active || m.captain ? "var(--text)" : "var(--text-faint)" }}>
                {m.volume > 0 ? usd(m.volume) : "—"}
              </span>
            </li>
          );
        })}
      </ul>
      {(ordered.length > shown.length || (all && (q.more ?? 0) > 0)) && (
        <div className="mt-2 flex items-center justify-between text-[11.5px]" style={{ color: "var(--text-faint)" }}>
          {ordered.length > shown.length ? (
            <button type="button" onClick={() => setAll(true)} className="underline cursor-pointer" style={{ borderRadius: 0 }}>
              Show all {ordered.length}
            </button>
          ) : (
            <span />
          )}
          {all && (q.more ?? 0) > 0 && <span>+{count(q.more!)} more</span>}
        </div>
      )}
    </div>
  );
}

/* ── Small parts ────────────────────────────────────────────────────────── */

function AddrButton({ a, go }: { a: string; go: Props["go"] }) {
  return (
    <button type="button" onClick={() => go(a)} className="mono truncate hover:underline cursor-pointer" style={{ color: "var(--text)", borderRadius: 0 }} title="See this wallet's squads">
      {shortAddr(a)}
    </button>
  );
}

function Chip({ children, dashed, title }: { children: React.ReactNode; dashed?: boolean; title?: string }) {
  return (
    <span
      className="inline-flex items-center gap-1.5 text-[11px] px-2 py-[3px]"
      style={{ borderRadius: 9999, border: `1px ${dashed ? "dashed" : "solid"} var(--border)`, color: "var(--text-muted)" }}
      title={title}
    >
      {children}
    </span>
  );
}

function Swatch({ color, hatch, children }: { color?: string; hatch?: boolean; children: React.ReactNode }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className={`w-2 h-2 ${hatch ? "sq-hatch" : ""}`} style={{ borderRadius: 2, background: hatch ? undefined : color }} />
      {children}
    </span>
  );
}

function OutlineButton({ onClick, children }: { onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="mt-3 h-8 px-3 flex items-center text-[12px] font-medium border border-[var(--border)] hover:bg-[var(--bg-elevated)] cursor-pointer"
      style={{ borderRadius: 9, color: "var(--text)" }}
    >
      {children}
    </button>
  );
}

function EmptyCard({ kind, title, tiers, children }: { kind: "joined" | "built"; title: string; tiers: SquadTier[]; children?: React.ReactNode }) {
  return (
    <article className="p-4 sm:p-5 min-w-0" style={{ border: "1px dashed var(--border)", borderRadius: "var(--card-radius)" }}>
      <SquadTag kind={kind} dashed />
      <div className="mt-3 flex gap-[2px] h-[6px] opacity-45" aria-hidden>
        {[BASE, ...tiers.map(() => stepOf(tiers))].map((w, k) => (
          <span key={k} className="first:rounded-l-full last:rounded-r-full" style={{ width: `${w * 100}%`, background: ghostFill(k) }} />
        ))}
      </div>
      <h3 className="mt-3 text-[14px] font-semibold" style={{ color: "var(--text)" }}>
        {title}
      </h3>
      {children && (
        <div className="mt-1 text-[12.5px] leading-relaxed" style={{ color: "var(--text-muted)" }}>
          {children}
        </div>
      )}
    </article>
  );
}
