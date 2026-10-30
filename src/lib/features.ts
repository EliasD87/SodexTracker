/**
 * Pages that are built but not public yet. NEXT_PUBLIC_ values are fixed at
 * build time, so turning one on is a Vercel env var plus a redeploy.
 */

/** The Squads page, its API and its nav links. Set NEXT_PUBLIC_SQUADS=1 to show them. */
export const SQUADS_LIVE = process.env.NEXT_PUBLIC_SQUADS === "1";
