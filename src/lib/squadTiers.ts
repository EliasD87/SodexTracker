import type { SquadTier } from "@/lib/squadStore";

/**
 * SoDEX's squad boost tiers, shared by the server (squadStore) and the page.
 * No database here, so the browser can use it too.
 */

/** SoDEX's published tiers, for when the live ones haven't been read. */
export const DEFAULT_TIERS: SquadTier[] = [
  { energy: 100_000, boost: 0.05 },
  { energy: 400_000, boost: 0.1 },
  { energy: 1_500_000, boost: 0.15 },
  { energy: 5_000_000, boost: 0.2 },
  { energy: 10_000_000, boost: 0.25 },
];

/** The tier an Energy reaches (index -1: none yet), its boost, and the one after it. */
export function tierOf(energy: number, tiers: SquadTier[]) {
  let i = -1;
  while (i + 1 < tiers.length && energy >= tiers[i + 1].energy) i++;
  return { boost: i >= 0 ? tiers[i].boost : 0, next: tiers[i + 1] ?? null, index: i };
}
