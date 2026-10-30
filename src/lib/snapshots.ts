/**
 * How live data reaches the site from the VPS.
 *
 * The collector's database stays on the VPS. A publisher there computes each
 * page's data and upserts it into one small Supabase table, live_snapshots,
 * one row per view, and only when it changed. The site keeps each view in
 * memory for its TTL and the CDN caches responses, so Supabase is hit about
 * once per view per TTL, however many people are reading.
 *
 * LIVE_SOURCE=snapshots switches the site to this. Without it (local
 * development), routes compute straight from the local collector database.
 */

export const SNAPSHOTS = process.env.LIVE_SOURCE === "snapshots";

/** Every published view. The publisher and the routes share these names. */
export const snapshotKey = {
  health: "health",
  positions: "positions",
  positionsMarkets: "positions:markets",
  rankings: (days: number) => `rankings:${days}`,
  risk: "risk",
  money: (days: number) => `money:${days}`,
  traders: "traders",
  insights: "insights",
  marketFlow: (market: string) => `flow:24:${market}`,
  /** Every market together, with the hour-by-market grid. */
  flowAll: "flow:24:all",
  market: (market: string) => `market:${market}`,
  trader: (name: string) => `trader:${name.toLowerCase()}`,
  /** Season, totals and the biggest squads. */
  squads: "squads",
  /** Every squad whose captain's address starts with these two hex digits, members included. */
  squadShard: (prefix: string) => `squads:${prefix}`,
  /** Who invited each wallet starting with these two hex digits, and whether it counts. */
  squadWho: (prefix: string) => `squads:who:${prefix}`,
};

/** How long the site reuses a view before asking Supabase again, in seconds. */
export const SNAPSHOT_TTL = {
  health: 30,
  positions: 60,
  rankings: 60,
  risk: 60,
  money: 300,
  traders: 300,
  insights: 600,
  marketFlow: 60,
  market: 120,
  trader: 60,
  // Published hourly.
  squads: 600,
  squadShard: 600,
  squadWho: 600,
};

type Unavailable = { available: false; reason: string };

/**
 * Views read recently, per server instance. The routes run as dynamic, which
 * makes Next skip its own fetch cache, so this is the cache: each view is
 * fetched from Supabase at most once per TTL per instance, and concurrent
 * requests share one fetch. The CDN caches the route responses on top.
 */
const memo = new Map<string, { at: number; ttl: number; value: Promise<unknown> }>();

async function readSnapshot<T>(key: string, ttlSeconds: number): Promise<T | null> {
  const hit = memo.get(key);
  if (hit && Date.now() - hit.at < hit.ttl * 1000) return hit.value as Promise<T | null>;
  // The analytics can live in a Supabase project of their own, apart from
  // user accounts; without these set, they share the site's project.
  const url = process.env.SNAPSHOTS_SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.SNAPSHOTS_SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anon) throw new Error("Supabase isn't configured");
  const value = (async () => {
    const res = await fetch(`${url}/rest/v1/live_snapshots?key=eq.${encodeURIComponent(key)}&select=data`, {
      headers: { apikey: anon, Authorization: `Bearer ${anon}`, Accept: "application/vnd.pgrst.object+json" },
      cache: "no-store",
      signal: AbortSignal.timeout(8_000),
    });
    // PostgREST answers 406 when a single-object request matches no row.
    if (res.status === 406) return null;
    if (!res.ok) throw new Error(`Supabase answered ${res.status}`);
    return ((await res.json()) as { data: T }).data;
  })();
  memo.set(key, { at: Date.now(), ttl: ttlSeconds, value });
  // A failed read isn't cached: the next request tries again.
  value.catch(() => memo.delete(key));
  if (memo.size > 5_000) memo.delete(memo.keys().next().value!);
  return value;
}

/**
 * Views still computed from the local collector database while everything
 * else reads Supabase: for trying a new view against the live site before the
 * VPS publishes it. LIVE_LOCAL=squads (key prefixes, comma-separated) in
 * .env.local; never set on the live site.
 */
const LOCAL_KEYS = (process.env.LIVE_LOCAL ?? "")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);
const computedHere = (key: string) => LOCAL_KEYS.some((p) => key === p || key.startsWith(`${p}:`));

/**
 * A live view: from Supabase in production, computed locally otherwise. A
 * view not published yet reads as unavailable, with a plain reason.
 */
export async function liveView<T>(key: string, revalidate: number, compute: () => T | Promise<T>): Promise<T | Unavailable> {
  if (!SNAPSHOTS || computedHere(key)) return await compute();
  return (await readSnapshot<T>(key, revalidate)) ?? { available: false, reason: "Not published yet; live data refreshes every few minutes." };
}
