/**
 * Persistent server-side cache: memory → disk JSON → Supabase → network.
 *
 * Purpose: never call an upstream (SoSoValue) more than once per TTL, even
 * across dev-server restarts. Next's fetch cache lives in-process and is wiped
 * on every restart, so during development a restart would otherwise re-hit the
 * API and eat into the monthly quota. A JSON file on disk survives restarts.
 *
 * Stored under node_modules/.cache — NOT the project source tree — so writing
 * cache files never trips Turbopack's file watcher (which would cause an HMR
 * reload loop, per next.config.ts). On a read-only filesystem (e.g. serverless
 * prod) the disk write silently no-ops and the upstream's own `revalidate`
 * cache takes over.
 */

import { promises as fs } from "fs";
import path from "path";

const CACHE_DIR = path.join(process.cwd(), "node_modules", ".cache", "sosovalue");

interface DiskEntry<T> {
  fetchedAt: number; // epoch ms
  ttl: number; // seconds
  data: T;
}

// Fast path so we don't touch disk on every request within a TTL window.
const mem = new Map<string, { expires: number; data: unknown }>();
// Collapse concurrent misses for the same key into a single upstream call.
const inflight = new Map<string, Promise<unknown>>();

function fileFor(key: string): string {
  const safe = key.replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 180);
  return path.join(CACHE_DIR, `${safe}.json`);
}

async function readDisk<T>(key: string): Promise<DiskEntry<T> | null> {
  try {
    return JSON.parse(await fs.readFile(fileFor(key), "utf8")) as DiskEntry<T>;
  } catch {
    return null;
  }
}

async function writeDisk<T>(key: string, entry: DiskEntry<T>): Promise<void> {
  try {
    await fs.mkdir(CACHE_DIR, { recursive: true });
    await fs.writeFile(fileFor(key), JSON.stringify(entry), "utf8");
  } catch {
    /* read-only FS — rely on the upstream fetch's own cache */
  }
}

/* ── Supabase layer ─────────────────────────────────────────────────────────
 * public.sosovalue_cache is pre-warmed every 12h by the `sosovalue-refresh`
 * edge function (the ONLY writer — service role). The app reads it with the
 * anon key via a read-only RLS policy. Rows are treated as authoritative for
 * up to 36h (12h cadence + generous slack for a delayed cron), after which we
 * fall through to a direct fetch.                                            */

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const SUPABASE_MAX_AGE_MS = 36 * 60 * 60 * 1000;

let _sb: SupabaseClient | null | undefined;
function sb(): SupabaseClient | null {
  if (_sb !== undefined) return _sb;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  _sb = url && key ? createClient(url, key, { auth: { persistSession: false } }) : null;
  return _sb;
}

async function readSupabase<T>(key: string, allowStale = false): Promise<T | null> {
  const client = sb();
  if (!client) return null;
  try {
    const { data, error } = await client
      .from("sosovalue_cache")
      .select("data, fetched_at")
      .eq("key", key)
      .maybeSingle();
    if (error || !data) return null;
    // Normally reject rows older than the refresh cadence + slack, so a delayed
    // cron triggers a fresh fetch. But when `allowStale`, return whatever we have
    // — used as a last resort when the upstream fetch is unavailable (e.g. no API
    // key in the serverless env), where stale data beats a hard failure.
    if (!allowStale && Date.now() - new Date(data.fetched_at).getTime() > SUPABASE_MAX_AGE_MS) return null;
    return data.data as T;
  } catch {
    return null;
  }
}

/**
 * Return cached `data` for `key`: memory → disk (dev) → Supabase (pre-warmed
 * by the 12h edge function) → direct fetch as last resort. On upstream failure
 * with a stale disk entry available, the stale entry is served over throwing.
 */
export async function getCached<T>(
  key: string,
  ttlSeconds: number,
  fetcher: () => Promise<T>,
): Promise<T> {
  const now = Date.now();

  const m = mem.get(key);
  if (m && m.expires > now) return m.data as T;

  const disk = await readDisk<T>(key);
  if (disk && now - disk.fetchedAt < disk.ttl * 1000) {
    mem.set(key, { expires: disk.fetchedAt + disk.ttl * 1000, data: disk.data });
    return disk.data;
  }

  const pending = inflight.get(key);
  if (pending) return pending as Promise<T>;

  const p = (async () => {
    try {
      const remote = await readSupabase<T>(key);
      if (remote !== null) {
        mem.set(key, { expires: now + ttlSeconds * 1000, data: remote });
        await writeDisk(key, { fetchedAt: now, ttl: ttlSeconds, data: remote });
        return remote;
      }
      const data = await fetcher();
      mem.set(key, { expires: now + ttlSeconds * 1000, data });
      await writeDisk(key, { fetchedAt: now, ttl: ttlSeconds, data });
      return data;
    } catch (err) {
      if (disk) return disk.data; // serve stale disk rather than fail (dev)
      // Last resort (e.g. serverless with no API key): serve a stale Supabase
      // row if one exists rather than surfacing a 500 to the page.
      const stale = await readSupabase<T>(key, true);
      if (stale !== null) {
        mem.set(key, { expires: now + ttlSeconds * 1000, data: stale });
        return stale;
      }
      throw err;
    } finally {
      inflight.delete(key);
    }
  })();

  inflight.set(key, p);
  return p as Promise<T>;
}
