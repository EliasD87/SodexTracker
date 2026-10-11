/**
 * The publisher: turns the collector's database into the site's live views
 * and pushes them to Supabase's live_snapshots table. Runs on the VPS next to
 * the collector; bundled to one file by `node collector/publisher/build.mjs`.
 *
 * Built to stay inside Supabase's free plan:
 *   - only finished views go up (tens of KB each), never raw tables;
 *   - a view is written only when its content changed (clock-only fields
 *     like asOf don't count, but every view is refreshed at least every 15
 *     minutes so those stay roughly current);
 *   - the busiest markets' trade views every minute, the rest every 5;
 *   - trader pages only for traders the site links to or who just traded;
 *   - stale trader pages are deleted after 7 days.
 *
 * Environment: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY (writes bypass row
 * security; keep it on the VPS only), COLLECTOR_DB, and the same
 * NICKNAME_MUL / NICKNAME_ADD as the collector. PUBLISH_DRY_RUN=<dir> writes
 * JSON files there instead of calling Supabase.
 */

import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { collectorHealth, db, liveFlow, liveTraders, traderInsights } from "@/lib/liveStore";
import { moneyFlow } from "@/lib/moneyStore";
import { positionsOverview } from "@/lib/positionStore";
import { rankings } from "@/lib/rankingStore";
import { riskData } from "@/lib/riskStore";
import { traderProfile } from "@/lib/traderStore";
import { nickname } from "@/lib/nickname";
import { marketView } from "@/lib/views";
import { snapshotKey } from "@/lib/snapshots";

const URL = (process.env.SUPABASE_URL ?? "").replace(/\/$/, "");
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";
const DRY = process.env.PUBLISH_DRY_RUN ?? "";
const ONCE = process.argv.includes("--once");

const MIN = 60_000;
const log = (msg: string) => console.log(`${new Date().toISOString().slice(11, 19)} publish  ${msg}`);
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

if (!DRY && (!URL || !KEY)) {
  console.error("Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY (or PUBLISH_DRY_RUN=<dir> to test).");
  process.exit(1);
}

/* ── Writing ────────────────────────────────────────────────────────────── */

const lastHash = new Map<string, string>();
const lastWrite = new Map<string, number>();
export const stats = { written: 0, skipped: 0, bytes: 0, failures: 0 };

/**
 * Fields that move with the clock, not the data: a build time, a window start
 * that slides every minute, the collector's heartbeat. Left out of the
 * fingerprint, or every view would look new every minute.
 */
const CLOCK_FIELDS = new Set(["asOf", "from", "health", "updatedAt"]);
/** However quiet a view is, it's rewritten this often, so those fields don't drift far. */
const MAX_AGE = 15 * MIN;

/** A view's fingerprint, ignoring fields that change on every build without meaning anything changed. */
function fingerprint(data: unknown): string {
  const json = JSON.stringify(data, (k, v) => (CLOCK_FIELDS.has(k) ? undefined : v));
  return createHash("sha1").update(json).digest("hex");
}

async function upsert(rows: { key: string; data: unknown }[]) {
  const now = Date.now();
  const changed = rows.filter((r) => {
    const h = fingerprint(r.data);
    if (lastHash.get(r.key) === h && now - (lastWrite.get(r.key) ?? 0) < MAX_AGE) {
      stats.skipped++;
      return false;
    }
    lastHash.set(r.key, h);
    lastWrite.set(r.key, now);
    return true;
  });
  if (!changed.length) return;

  for (let i = 0; i < changed.length; i += 25) {
    const batch = changed.slice(i, i + 25).map((r) => ({ key: r.key, data: r.data, hash: lastHash.get(r.key), updated_at: new Date().toISOString() }));
    const body = JSON.stringify(batch);
    try {
      if (DRY) {
        fs.mkdirSync(DRY, { recursive: true });
        for (const r of batch) fs.writeFileSync(path.join(DRY, `${r.key.replace(/[^\w.-]+/g, "_")}.json`), JSON.stringify(r.data));
      } else {
        const res = await fetch(`${URL}/rest/v1/live_snapshots?on_conflict=key`, {
          method: "POST",
          headers: {
            apikey: KEY,
            Authorization: `Bearer ${KEY}`,
            "Content-Type": "application/json",
            Prefer: "resolution=merge-duplicates,return=minimal",
          },
          body,
          signal: AbortSignal.timeout(20_000),
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}: ${(await res.text()).slice(0, 200)}`);
      }
      stats.written += batch.length;
      stats.bytes += body.length;
    } catch (err) {
      stats.failures++;
      // Forget the hashes so these views are retried next round.
      for (const r of batch) {
        lastHash.delete(r.key);
        lastWrite.delete(r.key);
      }
      log(`write failed: ${(err as Error).message}`);
    }
  }
}

async function deleteStaleTraders() {
  if (DRY) return;
  const cutoff = new Date(Date.now() - 7 * 24 * 60 * MIN).toISOString();
  const res = await fetch(`${URL}/rest/v1/live_snapshots?key=like.trader:*&updated_at=lt.${cutoff}`, {
    method: "DELETE",
    headers: { apikey: KEY, Authorization: `Bearer ${KEY}`, Prefer: "return=minimal" },
    signal: AbortSignal.timeout(20_000),
  }).catch((e: Error) => ({ ok: false, status: 0, text: async () => e.message }) as Response);
  if (!res.ok) log(`cleanup failed: ${res.status}`);
}

/* ── What to publish ────────────────────────────────────────────────────── */

/** Markets with any live data, busiest first: by the last day's volume, then any with positions held but no trades. */
function liveMarkets(): string[] {
  const d = db();
  if (!d) return [];
  const has = (t: string) => !!d.prepare("SELECT 1 FROM sqlite_schema WHERE type = 'table' AND name = ?").get(t);
  const out = new Set<string>();
  if (has("flow_minute")) {
    const rows = d
      .prepare("SELECT market FROM flow_minute WHERE minute >= ? GROUP BY market ORDER BY SUM(bought_usd) DESC")
      .all(Date.now() - 24 * 60 * MIN) as { market: string }[];
    for (const r of rows) out.add(r.market);
  }
  if (has("open_positions")) for (const r of d.prepare("SELECT DISTINCT market FROM open_positions").all() as { market: string }[]) out.add(r.market);
  return [...out];
}

/** Markets whose trade view refreshes every minute; the rest refresh every 5. */
const BUSY_MARKETS = 20;

/** Nicknames the site links to, plus anyone whose positions or money just moved. */
function featuredTraders(views: unknown[], sinceMs: number): string[] {
  const names = new Set<string>();
  const walk = (v: unknown) => {
    if (!v || typeof v !== "object") return;
    if (Array.isArray(v)) return v.forEach(walk);
    for (const [k, x] of Object.entries(v)) {
      if (k === "name" && typeof x === "string" && /^[a-z]+-[a-z]+-[a-z]+(-\d+)?$/.test(x)) names.add(x);
      else walk(x);
    }
  };
  views.forEach(walk);
  const d = db();
  if (d) {
    const has = (t: string) => !!d.prepare("SELECT 1 FROM sqlite_schema WHERE type = 'table' AND name = ?").get(t);
    if (has("account_events")) for (const r of d.prepare("SELECT DISTINCT account_id id FROM account_events WHERE ts >= ?").all(sinceMs) as { id: number }[]) names.add(nickname(r.id));
    if (has("alert_subs")) for (const r of d.prepare("SELECT DISTINCT account_id id FROM alert_subs").all() as { id: number }[]) names.add(nickname(r.id));
  }
  return [...names].slice(0, 4000);
}

/* ── Rounds ─────────────────────────────────────────────────────────────── */

let lastFast = 0;
let lastMedium = 0;
let lastSlow = 0;
let lastEventsCheck = Date.now() - 24 * 60 * MIN;

async function round() {
  const now = Date.now();
  const t0 = performance.now();
  const before = { ...stats };
  // Health first and on its own: it's what tells the site the data has paused.
  await upsert([{ key: snapshotKey.health, data: collectorHealth() }]).catch((e: Error) => log(`health failed: ${e.message}`));

  // Each group on its own, so one failing view (SoDEX down mid-build, say)
  // never holds back the others; the failed group is retried next round.
  const took: string[] = [];
  const step = async (name: string, fn: () => Promise<void>, onFail: () => void) => {
    const t = performance.now();
    try {
      await fn();
      took.push(`${name} ${((performance.now() - t) / 1000).toFixed(1)}s`);
    } catch (err) {
      onFail();
      log(`${name} views failed, retrying next round: ${(err as Error).message}`);
    }
  };

  if (now - lastFast >= MIN) await step("fast", fast, () => (lastFast = 0));
  if (now - lastMedium >= 5 * MIN) await step("medium", medium, () => (lastMedium = 0));
  if (now - lastSlow >= 15 * MIN) await step("slow", slow, () => (lastSlow = 0));

  const wrote = stats.written - before.written;
  if (wrote || ONCE) {
    log(
      `${wrote} view(s) written, ${stats.skipped - before.skipped} unchanged, ${((stats.bytes - before.bytes) / 1024).toFixed(0)} KB in ${((performance.now() - t0) / 1000).toFixed(1)}s` +
        `${took.length ? ` (${took.join(", ")})` : ""} · total ${stats.written} written, ${(stats.bytes / 1e6).toFixed(1)} MB, ${stats.failures} failure(s)`,
    );
  }
}

async function fast() {
  const now = Date.now();
  {
    lastFast = now;
    const positions = await positionsOverview();
    const ranks = await Promise.all([1, 7, 30].map((d) => rankings(d)));
    await upsert([
      { key: snapshotKey.positions, data: positions },
      { key: snapshotKey.positionsMarkets, data: positions.available ? { available: true, coverage: positions.coverage, markets: positions.markets } : positions },
      ...[1, 7, 30].map((d, i) => ({ key: snapshotKey.rankings(d), data: ranks[i] })),
      { key: snapshotKey.risk, data: riskData(48) },
      ...liveMarkets()
        .slice(0, BUSY_MARKETS)
        .map((m) => ({ key: snapshotKey.marketFlow(m), data: liveFlow(24, m) })),
      { key: snapshotKey.flowAll, data: liveFlow(24, null) },
    ]);
    // Traders whose positions or money moved since the last round.
    const moved = featuredTraders([], lastEventsCheck);
    lastEventsCheck = now;
    await upsert(await Promise.all(moved.map(async (n) => ({ key: snapshotKey.trader(n), data: await traderProfile(n) }))));
  }
}

async function medium() {
  const now = Date.now();
  {
    lastMedium = now;
    const markets = liveMarkets();
    await upsert([
      ...[7, 30, 90, 365].map((d) => ({ key: snapshotKey.money(d), data: moneyFlow(d) })),
      { key: snapshotKey.traders, data: liveTraders() },
      // The quieter markets' trade views; the busiest go every minute in fast().
      ...markets.slice(BUSY_MARKETS).map((m) => ({ key: snapshotKey.marketFlow(m), data: liveFlow(24, m) })),
      ...(await Promise.all(markets.map(async (m) => ({ key: snapshotKey.market(m), data: await marketView(m) })))),
    ]);
  }
}

async function slow() {
  const now = Date.now();
  {
    lastSlow = now;
    const insights = traderInsights();
    await upsert([{ key: snapshotKey.insights, data: insights }]);
    // Every trader the site links to, refreshed in full.
    const positions = await positionsOverview();
    const ranks = await Promise.all([1, 7, 30].map((d) => rankings(d)));
    const marketViews = await Promise.all(liveMarkets().map((m) => marketView(m)));
    const names = featuredTraders([positions, ...ranks, insights, ...marketViews], now - 24 * 60 * MIN);
    for (let i = 0; i < names.length; i += 200) {
      await upsert(await Promise.all(names.slice(i, i + 200).map(async (n) => ({ key: snapshotKey.trader(n), data: await traderProfile(n) }))));
    }
    await deleteStaleTraders();
  }
}

async function main() {
  log(DRY ? `dry run: writing JSON to ${DRY}` : `publishing to ${URL}`);
  if (ONCE) {
    await round();
    return;
  }
  for (;;) {
    try {
      await round();
    } catch (err) {
      log(`round failed: ${(err as Error).stack ?? (err as Error).message}`);
    }
    await sleep(15_000);
  }
}

process.on("SIGTERM", () => process.exit(0));
process.on("SIGINT", () => process.exit(0));
main();
