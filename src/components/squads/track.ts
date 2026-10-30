import { usd } from "@/lib/analyticsFormat";
import type { Squad, SquadTier } from "@/lib/squadStore";

/**
 * One scale for every Energy on the Squads page: the hero track, the mini
 * tracks on the squad cards and the race bars on the standings board.
 *
 * Piecewise log: the no-boost zone takes 40% of the width (almost every
 * squad lives there), each boost step an equal share of the rest, and Energy
 * is log-scaled inside each zone. Pure log would squeeze the top tiers
 * together on a phone.
 */

export type Unavailable = { available: false; reason: string };

/** A wallet's two squads, as the lookup route returns them. */
export interface Lookup {
  available: true;
  address: string;
  /** Our scan has reached this wallet. */
  scanned: boolean;
  inviter: string | null;
  inviterKnown: boolean;
  joined: Squad | null;
  built: Squad | null;
  /** Whether the wallet counts (deposited $5 and traded) and its volume; null where we can't tell. */
  self: { counts: boolean | null; volume: number | null };
  boost: { squads: number; invited: number; max: number };
  asOf: number;
}

export const ADDRESS = /^0x[0-9a-fA-F]{40}$/;
/** Layer 1 Season length, per SoDEX; week/info doesn't carry it. */
export const SEASON_WEEKS = 20;
export const FLOOR = 100;
export const BASE = 0.4;

export const stepOf = (tiers: SquadTier[]) => (1 - BASE) / tiers.length;
/** Where tier i's line sits on the track, 0..1. */
export const nodeX = (i: number, tiers: SquadTier[]) => BASE + i * stepOf(tiers);
/** The middle of zone k (0: no boost, 1..n: each tier). */
export const zoneMid = (k: number, tiers: SquadTier[]) => (k === 0 ? BASE / 2 : BASE + (k - 0.5) * stepOf(tiers));

/** The track's right end: twice the top tier, or past the biggest squad. */
export const capOf = (tiers: SquadTier[], top: Squad[]) => Math.max(2 * tiers[tiers.length - 1].energy, (top[0]?.energy ?? 0) * 1.15);

/** Where an Energy sits on the track, 0..1. */
export function trackX(e: number, tiers: SquadTier[], cap: number): number {
  const stops = [FLOOR, ...tiers.map((t) => t.energy), cap];
  const step = stepOf(tiers);
  const at = (i: number) => (i === 0 ? 0 : BASE + (i - 1) * step);
  if (e <= FLOOR) return 0;
  if (e >= cap) return 1;
  let i = 0;
  while (e >= stops[i + 1]) i++;
  return at(i) + (Math.log(e / stops[i]) / Math.log(stops[i + 1] / stops[i])) * (at(i + 1) - at(i));
}

/**
 * One colour per boost tier, the same everywhere on the page: cyan-blue for
 * +5% through to plum for +25%, stronger against the card as the tier rises
 * so the order still reads in grey. Grey is no boost. Amber (--sq-you) only
 * ever means the wallet that was searched and its two squads.
 */
export const tierColor = (i: number) => (i < 0 ? "var(--sq-t0)" : `var(--sq-t${Math.min(i, 4) + 1})`);
/** A boost's tier: how many tiers it has reached, less one (tolerant of float noise). */
export const levelOf = (boost: number, tiers: SquadTier[]) => tiers.filter((t) => t.boost <= boost + 1e-9).length - 1;
export const boostColor = (boost: number, tiers: SquadTier[]) => tierColor(boost > 0 ? levelOf(boost, tiers) : -1);
/** Zone k of the track: 0 is below the first tier, 1..n each tier. */
export const zoneFill = (k: number) => (k === 0 ? "var(--sq-band0)" : tierColor(k - 1));
/** The old grey ramp, for empty cards that show the track without data. */
export const ghostFill = (k: number) => `color-mix(in srgb, var(--text) ${8 + k * 15}%, var(--bg-elevated))`;

/** "1 member", "5 members". */
export const members = (n: number) => `${n.toLocaleString("en-US")} member${n === 1 ? "" : "s"}`;

export const plus = (f: number) => `+${Math.round(f * 100)}%`;
/** Energy as a figure: $1 = 1 Energy, so dollars without the sign, and no trailing zeros (100K, 1.5M, 75.6K). */
export const shortEnergy = (n: number) =>
  n < 1000
    ? String(Math.round(n))
    : usd(n, n >= 1e6 ? 2 : 1)
    .replace("$", "")
    .replace(/(\.\d*?)0+(?=[KMB])/, "$1")
    .replace(/\.(?=[KMB])/, "");

/** The Energy of the tier a squad has reached (0 below the first). */
export const prevEnergy = (q: Squad, tiers: SquadTier[]) => [...tiers].reverse().find((t) => t.energy <= q.energy)?.energy ?? 0;
export const gapOf = (q: Squad) => (q.next ? q.next.energy - q.energy : null);
/** How far between its tier and the next a squad is, 0..1 (linear, for progress bars only). */
export const stepShare = (q: Squad, tiers: SquadTier[]) => {
  if (!q.next) return 1;
  const prev = prevEnergy(q, tiers);
  return Math.max(0, Math.min(1, (q.energy - prev) / (q.next.energy - prev)));
};

export const utc = (ms: number) =>
  new Date(ms).toLocaleString("en-GB", { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "UTC" }) + " UTC";

/** "2d 4h", then "4h 12m", then "12m". */
export const clock = (ms: number) => {
  const m = Math.floor(ms / 60_000);
  const d = Math.floor(m / 1440);
  const h = Math.floor((m % 1440) / 60);
  return d ? `${d}d ${h}h` : h ? `${h}h ${m % 60}m` : `${m}m`;
};

/**
 * Dots as a swarm: in the order given (biggest squads first), each takes the
 * lowest free slot in its column `step` px wide, or the nearest column with
 * room, so a crowded Energy range spreads sideways instead of piling into one
 * bar (the top 100's last few always crowd just under a tier line).
 * Coordinates are inside the dot area (y down from its top).
 */
export function layoutDots(xs: number[], step: number, rows: number, W: number, r: number) {
  const maxCol = Math.max(0, Math.floor(W / step));
  const filled = new Map<number, number>();
  return xs.map((x) => {
    const c0 = Math.round(x / step);
    let spot = { c: c0, k: rows - 1 };
    search: for (let d = 0; d <= maxCol; d++) {
      for (const c of d ? [c0 - d, c0 + d] : [c0]) {
        const n = filled.get(c) ?? 0;
        if (c >= 0 && c <= maxCol && n < rows) {
          filled.set(c, n + 1);
          spot = { c, k: n };
          break search;
        }
      }
    }
    return { cx: Math.min(W - r, Math.max(r, spot.c * step)), cy: rows * step - (spot.k + 0.5) * step };
  });
}

/**
 * The cheapest next tier that actually raises this wallet's boost (a tier
 * past the cap doesn't), from either of its squads.
 */
export function nextStep(r: Lookup) {
  return (
    (["joined", "built"] as const)
      .flatMap((k) => {
        const q = r[k];
        if (!q?.next || !q.members) return [];
        const other = (k === "joined" ? r.built : r.joined)?.boost ?? 0;
        return [{ k, q, gap: q.next.energy - q.energy, after: Math.min(r.boost.max, q.next.boost + other) }];
      })
      .filter((o) => o.after > r.boost.squads)
      .sort((a, b) => a.gap - b.gap)[0] ?? null
  );
}

/**
 * The page's own colours and animations, kept here rather than in the global
 * stylesheet. Every tier colour reaches 4.5:1 as text on the card in both
 * themes (--sq-on is the text on a tier or amber fill).
 */
export const SQUAD_CSS = `
.sq {
  --sq-t0: #8C8C88; --sq-t1: #0073A1; --sq-t2: #2252B1; --sq-t3: #4E29AA; --sq-t4: #600A80; --sq-t5: #45084A;
  --sq-on: #FFFFFF; --sq-you: #9F5700;
  --sq-you-tint: color-mix(in srgb, var(--sq-you) 10%, var(--bg-surface));
  --sq-band0: color-mix(in srgb, var(--text) 12%, var(--bg-elevated));
}
.dark .sq {
  --sq-t0: #6B6B6B; --sq-t1: #2698C8; --sq-t2: #6B9CF8; --sq-t3: #AFA3FF; --sq-t4: #DAB4FF; --sq-t5: #F4CDFA;
  --sq-on: #0E0E0E; --sq-you: #E8A317;
}
@keyframes sq-ping { 0% { transform: scale(1); opacity: .5; } 80%, 100% { transform: scale(2.4); opacity: 0; } }
.sq-ping { position: absolute; inset: 0; border-radius: 9999px; border: 1.5px solid var(--c, var(--text)); animation: sq-ping 2.4s ease-out infinite; pointer-events: none; }
@keyframes sq-pin { from { opacity: 0; translate: 0 -8px; } to { opacity: 1; translate: 0 0; } }
.sq-pin { animation: sq-pin .42s cubic-bezier(.2,.9,.3,1.2) both; }
.sq-hatch { background: repeating-linear-gradient(135deg, var(--h, var(--text)) 0 1.5px, color-mix(in srgb, var(--h, var(--text)) 14%, var(--bg-surface)) 1.5px 5px); }
.sq-note summary { list-style: none; cursor: pointer; }
.sq-note summary::-webkit-details-marker { display: none; }
.sq-note[open] .sq-chev { transform: rotate(180deg); }
@media (prefers-reduced-motion: reduce) { .sq-ping { display: none; } .sq-pin { animation: none; } }
`;
