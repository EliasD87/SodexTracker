import { config } from "./config.mjs";
import { db, tx } from "./db.mjs";
import { log } from "./log.mjs";
import { fail, guard, hostOf, ok, Outage } from "./health.mjs";

/**
 * SoPoints squads. On SoDEX every account can be in two squads: the one it
 * joined (its inviter, the captain, plus everyone else that captain invited)
 * and the one it built (itself plus everyone it invited). SoDEX only shows a
 * squad's members to its own logged-in members, but who invited an account is
 * public, one account at a time. So this asks, for every account that has
 * traded or deposited, who invited it; the squads follow from that.
 *
 *   1. accounts that traded in the last 4 weeks (what squad Energy counts),
 *      busiest first;
 *   2. lookups SoDEX refused, a day later;
 *   3. accounts with no inviter that are still trading, weekly (a code can be
 *      bound later);
 *   4. every other account that ever traded or deposited, newest first;
 *   5. accounts with no inviter, monthly, as a safety net.
 *
 * Every fourth call reads a captain's squad name instead, biggest squads
 * first. The season's week and boost tiers are read hourly. A second, faster
 * lane on SoDEX's data host reads each squad member's 30-day volume while our
 * trade records are shorter than the Energy window. Addresses stay in this
 * database; the publisher shows them shortened.
 */

const DAY = 86_400_000;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const HEADERS = { Accept: "application/json", Origin: "https://sodex.com", Referer: "https://sodex.com/" };

export const squadStats = { reads: 0, failures: 0, limited: 0, linked: 0, names: 0 };

let next = 0;
let pausedUntil = 0;
/**
 * The lane's own outage breaker (see health.mjs): the ledger lane reads the
 * same host, and trouble with the referral lookups must never pause it.
 */
const host = `${hostOf(config.squads.base)}#squads`;
/** A request still refused for the rate limit after this many minutes gives up (it's retried another day). */
const MAX_LIMITED = 5;

/**
 * One call at a time at the configured pace. SoDEX's referral lookups allow
 * 20 calls a minute per IP and, over that, answer in plain text (HTTP 400 or
 * 429). That holds the lane for a minute and tries again.
 */
async function get(path) {
  for (let limited = 0; ; limited++) {
    const now = Date.now();
    const at = Math.max(now, next, pausedUntil);
    next = at + 60_000 / config.squads.requestsPerMinute;
    if (at > now) await sleep(at - now);
    await guard(host);
    squadStats.reads++;
    let res;
    let text;
    try {
      res = await fetch(`${config.squads.base}${path}`, { headers: HEADERS, signal: AbortSignal.timeout(config.limits.requestTimeoutMs) });
      // The body is part of the answer: a stall or reset while reading it is the service, not a refusal.
      text = await res.text();
    } catch (err) {
      const e = new Outage(err.name === "TimeoutError" ? "timed out" : `no answer (${err.cause?.code ?? err.message})`);
      fail(host, e);
      throw e;
    }
    // Only a failed answer can be the rate limit: a squad name may well say "rate limit".
    if (res.status === 429 || (!res.ok && /rate limit/i.test(text.slice(0, 200)))) {
      squadStats.limited++;
      pausedUntil = Date.now() + 60_000;
      if (limited + 1 >= MAX_LIMITED) throw new Error(`still rate-limited after ${MAX_LIMITED} minutes`);
      continue;
    }
    if (res.status >= 500) {
      const e = new Outage(`HTTP ${res.status}`);
      fail(host, e);
      throw e;
    }
    let json;
    try {
      json = JSON.parse(text);
    } catch {
      // A plain-text 4xx refuses this one request; anything else (a maintenance page) is the service.
      if (res.status >= 400) throw new Error(`HTTP ${res.status}: ${text.slice(0, 80)}`);
      const e = new Outage(`HTTP ${res.status}, not JSON`);
      fail(host, e);
      throw e;
    }
    ok(host);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    if (json?.code !== 0 && json?.code !== "0") throw new Error(json?.msg || json?.message || "lookup error");
    return json.data;
  }
}

/* ── Who invited whom ───────────────────────────────────────────────────── */

/** The code saved for a lookup SoDEX refused: not an answer, so the publisher treats it as not asked yet. */
export const REFUSED = "!refused";

const accountOf = db.prepare("SELECT account_id FROM fund_accounts WHERE address = ?");
const saveLink = db.prepare(`
  INSERT INTO squad_links (account_id, inviter_address, inviter_id, code, checked_at) VALUES (?, ?, ?, ?, ?)
  ON CONFLICT (account_id) DO UPDATE SET
    inviter_address = excluded.inviter_address, inviter_id = excluded.inviter_id, code = excluded.code, checked_at = excluded.checked_at`);

async function readLink({ account_id: id, address }) {
  const data = await get(`/referral/referrer?wallet_address=${address}`);
  const by = data?.referredBy;
  const inviter = typeof by?.referrer === "string" && /^0x[0-9a-fA-F]{40}$/.test(by.referrer) ? by.referrer.toLowerCase() : null;
  // Nobody invites themselves; treat it as no inviter rather than a squad of one.
  const own = inviter === address ? null : inviter;
  saveLink.run(id, own, own ? (accountOf.get(own)?.account_id ?? null) : null, own ? String(by.code ?? "") : null, Date.now());
  if (own) squadStats.linked++;
}

/* ── Squad names ────────────────────────────────────────────────────────── */

const saveName = db.prepare(`
  INSERT INTO squad_names (account_id, name, checked_at) VALUES (?, ?, ?)
  ON CONFLICT (account_id) DO UPDATE SET name = excluded.name, checked_at = excluded.checked_at`);

async function readName({ account_id: id, address }) {
  const data = await get(`/referral/team/name?walletAddress=${address}`);
  // Free text chosen by the captain; trimmed and capped, shown as plain text.
  const name = String(data?.teamName ?? "").trim().slice(0, 60);
  saveName.run(id, name, Date.now());
  squadStats.names++;
}

/* ── Who to ask next ────────────────────────────────────────────────────── */

const due = {
  // Last 4 weeks' traders not yet asked, busiest first.
  window: db.prepare(`
    SELECT a.account_id, f.address FROM (
      SELECT account_id, SUM(bought_usd + sold_usd) v FROM account_day WHERE day >= ? GROUP BY account_id
    ) a
    JOIN fund_accounts f ON f.account_id = a.account_id
    WHERE NOT EXISTS (SELECT 1 FROM squad_links s WHERE s.account_id = a.account_id)
    ORDER BY a.v DESC LIMIT 200`),
  // Lookups SoDEX refused (saved with the REFUSED code), tried again a day later.
  refused: db.prepare(`
    SELECT s.account_id, f.address FROM squad_links s JOIN fund_accounts f ON f.account_id = s.account_id
    WHERE s.code = '${REFUSED}' AND s.checked_at < ? ORDER BY s.checked_at LIMIT 200`),
  unboundActive: db.prepare(`
    SELECT s.account_id, f.address FROM squad_links s JOIN fund_accounts f ON f.account_id = s.account_id
    WHERE s.inviter_address IS NULL AND s.code IS NULL AND s.checked_at < ?
      AND s.account_id IN (SELECT account_id FROM account_day WHERE day >= ?)
    ORDER BY s.checked_at LIMIT 200`),
  // Everyone else who ever traded (all-time leaderboard) or moved money (ledger).
  catchUp: db.prepare(`
    SELECT f.account_id, f.address FROM fund_accounts f
    WHERE NOT EXISTS (SELECT 1 FROM squad_links s WHERE s.account_id = f.account_id)
      AND (f.newest_ts IS NOT NULL OR f.account_id IN (SELECT account_id FROM pos_accounts WHERE alltime_volume > 0))
    ORDER BY f.account_id DESC LIMIT 200`),
  unbound: db.prepare(`
    SELECT s.account_id, f.address FROM squad_links s JOIN fund_accounts f ON f.account_id = s.account_id
    WHERE s.inviter_address IS NULL AND s.code IS NULL AND s.checked_at < ? ORDER BY s.checked_at LIMIT 200`),
  // Captains whose squad has no name on file, or had none a while ago; biggest squads first.
  names: db.prepare(`
    SELECT c.inviter_id account_id, f.address FROM (
      SELECT inviter_id, COUNT(*) n FROM squad_links WHERE inviter_id IS NOT NULL GROUP BY inviter_id
    ) c
    JOIN fund_accounts f ON f.account_id = c.inviter_id
    LEFT JOIN squad_names n ON n.account_id = c.inviter_id
    WHERE n.account_id IS NULL OR (n.name = '' AND n.checked_at < ?)
    ORDER BY c.n DESC LIMIT 100`),
};

let links = [];
let linkKind = "";
let linksEmptyUntil = 0;
let names = [];
let namesEmptyUntil = 0;
let turn = 0;
/**
 * Accounts whose lookup failed as an outage (unsaved, so they'd come straight
 * back): account_id → { fails, until }. Each failure waits longer, 5 minutes
 * doubling to a day, so one bad account can't hold the front of the queue.
 */
const backoff = new Map();
const waiting = (id, now) => (backoff.get(id)?.until ?? 0) > now;

/** The next captain whose squad name is due; the list is re-read when used up, at most every 10 minutes when empty. */
function nextName() {
  const now = Date.now();
  if (!names.length && now >= namesEmptyUntil) {
    names = due.names.all(now - config.squads.nameRecheckMs).filter((r) => !waiting(r.account_id, now));
    if (!names.length) namesEmptyUntil = now + 10 * 60_000;
  }
  return names.length ? { kind: "name", acct: names.shift() } : null;
}

/** The next batch of accounts to ask about, by priority. When nothing is due, the queries rest for 5 minutes. */
function refillLinks() {
  const now = Date.now();
  if (now < linksEmptyUntil) return false;
  const s = config.squads;
  const day = (ms) => new Date(now - ms).toISOString().slice(0, 10);
  for (const [kind, rows] of [
    ["window", () => due.window.all(day(27 * DAY))],
    ["refused", () => due.refused.all(now - DAY)],
    ["unbound active", () => due.unboundActive.all(now - s.unboundActiveRecheckMs, day(DAY))],
    ["catch-up", () => due.catchUp.all()],
    ["unbound", () => due.unbound.all(now - s.unboundRecheckMs)],
  ]) {
    links = rows().filter((r) => !waiting(r.account_id, now));
    if (links.length) {
      linkKind = kind;
      return true;
    }
  }
  linksEmptyUntil = now + 5 * 60_000;
  return false;
}

/** Ask about the next account (or, every fourth call, the next captain's name). False when nothing is due. */
export async function processNextSquad() {
  let task = turn++ % 4 === 3 ? nextName() : null;
  if (!task && (links.length || refillLinks())) task = { kind: linkKind, acct: links.shift() };
  // Nothing else due: names have the lane to themselves.
  task ??= nextName();
  if (!task) return false;
  const id = task.acct.account_id;
  try {
    await (task.kind === "name" ? readName(task.acct) : readLink(task.acct));
    backoff.delete(id);
  } catch (err) {
    squadStats.failures++;
    log.warn("squads", `${task.kind} lookup failed: ${err.message}`);
    if (err instanceof Outage) {
      // Left unsaved, so it's asked again once SoDEX answers, after a growing wait.
      const fails = (backoff.get(id)?.fails ?? 0) + 1;
      backoff.set(id, { fails, until: Date.now() + Math.min(DAY, 5 * 60_000 * 2 ** (fails - 1)) });
      if (backoff.size > 10_000) backoff.delete(backoff.keys().next().value);
    } else if (task.kind === "name") {
      // Asked again on the unnamed schedule.
      saveName.run(id, "", Date.now());
    } else {
      // A refusal isn't an answer: marked as such (never as "no inviter") and asked again in a day.
      saveLink.run(id, null, null, REFUSED, Date.now());
    }
    await sleep(2_000);
  }
  return true;
}

/* ── Volume from before our records ─────────────────────────────────────── */

/**
 * Energy counts 4 weeks of volume, but our trade records start later than
 * that for the first 4 weeks after the collector starts. SoDEX's leaderboard
 * gives any wallet's 30-day volume (spot and perps, counted the way we count
 * it); less what we recorded, that's what it traded before our records. Read
 * for everyone in a squad, again every few days, until the window is ours.
 */

export const volumeStats = { reads: 0, failures: 0, traded: 0, tradeFailures: 0 };

const seasonQ = db.prepare("SELECT value FROM kv WHERE key = 'squads:season'");
/**
 * Where the Energy window starts: SoDEX counts the current week and the 3
 * before it, from the Tuesday 12:00 UTC that began them (matched to the
 * dollar against SoDEX's own figures, 2026-10-25). Weeks come from the season.
 */
export function windowStart(now = Date.now()) {
  try {
    const { week, rules } = JSON.parse(seasonQ.get()?.value ?? "{}");
    let next = Number(week?.nextWeekStartTime) * 1000;
    if (next > 0) {
      while (next <= now) next += 7 * DAY;
      return next - (Number(rules?.windowRounds) || 4) * 7 * DAY;
    }
  } catch {}
  return now - 28 * DAY;
}

/** When our trade records start, to the hour: minute rows roll up into hours after 48 hours. */
const recordsStartQ = db.prepare("SELECT MIN(t) t FROM (SELECT MIN(hour) t FROM flow_hour UNION ALL SELECT MIN(minute) FROM flow_minute)");
let recordsStart = null;
const saveVolume = db.prepare(`
  INSERT INTO squad_volume (account_id, volume, pre, pre_from, pre_to, checked_at) VALUES (?, ?, ?, ?, ?, ?)
  ON CONFLICT (account_id) DO UPDATE SET
    volume = excluded.volume, pre = excluded.pre, pre_from = excluded.pre_from, pre_to = excluded.pre_to, checked_at = excluded.checked_at`);
// Captains and everyone who joined through a code, never read or read a while ago.
const dueVolumes = db.prepare(`
  SELECT p.id account_id, f.address FROM (
    SELECT account_id id FROM squad_links WHERE inviter_address IS NOT NULL
    UNION SELECT inviter_id FROM squad_links WHERE inviter_id IS NOT NULL
  ) p
  JOIN fund_accounts f ON f.account_id = p.id
  LEFT JOIN squad_volume v ON v.account_id = p.id
  WHERE v.account_id IS NULL OR v.checked_at < ?
  ORDER BY v.checked_at IS NOT NULL, v.checked_at LIMIT 200`);

// A failed read is tried again in an hour, behind everyone else, keeping any earlier reading.
const retryVolume = db.prepare(`
  INSERT INTO squad_volume (account_id, volume, pre, pre_from, pre_to, checked_at) VALUES (?, 0, 0, 0, 0, ?)
  ON CONFLICT (account_id) DO UPDATE SET checked_at = excluded.checked_at`);

let volumes = [];
let volumesAt = 0;
let volumesEmptyUntil = 0;
let volumeNext = 0;
let volumePausedUntil = 0;
/** Its own outage breaker: trouble here never pauses the positions lane on the same host, or shows on the site. */
const volumeHost = `${hostOf(config.dataApi)}#volume`;

/** One read on the data host, at the lane's pace, outside the gateway's shared rate-limit pause. */
async function dataGet(path) {
  const now = Date.now();
  const at = Math.max(now, volumeNext, volumePausedUntil);
  volumeNext = at + 1000 / config.squads.volumePerSecond;
  if (at > now) await sleep(at - now);
  await guard(volumeHost);
  let res;
  let json;
  try {
    res = await fetch(`${config.dataApi}${path}`, { headers: { Accept: "application/json" }, signal: AbortSignal.timeout(config.limits.requestTimeoutMs) });
    json = res.status === 429 ? null : await res.json();
  } catch (err) {
    const e = new Outage(err.name === "TimeoutError" ? "timed out" : err instanceof SyntaxError ? `HTTP ${res?.status}, not JSON` : `no answer (${err.cause?.code ?? err.message})`);
    fail(volumeHost, e);
    throw e;
  }
  if (res.status === 429) {
    volumePausedUntil = Date.now() + 60_000;
    throw new Error("rate limited");
  }
  if (res.status >= 500) {
    const e = new Outage(`HTTP ${res.status}`);
    fail(volumeHost, e);
    throw e;
  }
  ok(volumeHost);
  if (!res.ok || (json?.code !== 0 && json?.code !== "0")) throw new Error(json?.message || `HTTP ${res.status}`);
  return json.data;
}

function refillVolumes(now) {
  recordsStart ??= recordsStartQ.get().t ?? null;
  // Once the whole window is inside our records, there's nothing left to fill.
  if (recordsStart == null || windowStart(now) >= recordsStart) return [];
  const rows = dueVolumes.all(now - config.squads.volumeRecheckMs);
  if (!rows.length) return [];
  // What we recorded for each, all in one pass (account_day is keyed by day first).
  const ours = new Map(
    db
      .prepare(`SELECT account_id id, SUM(bought_usd + sold_usd) v FROM account_day WHERE account_id IN (${rows.map((r) => Number(r.account_id)).join(",")}) GROUP BY account_id`)
      .all()
      .map((r) => [r.id, r.v]),
  );
  return rows.map((r) => ({ ...r, ours: ours.get(r.account_id) ?? 0 }));
}

async function readVolume({ account_id: id, address, ours }) {
  const data = await dataGet(`/leaderboard/rank?window_type=30D&sort_by=volume&wallet_address=${address}`);
  const volume = data?.found ? Number(data.item?.volume_usd) : 0;
  const snapshot = Number(data?.snapshot_ts);
  // An answer we can't read, or a snapshot from more than a few hours ago, would understate what came before.
  if (!Number.isFinite(volume) || !(snapshot > Date.now() - 3 * 3_600_000)) throw new Error("unexpected or stale answer");
  volumeStats.reads++;
  saveVolume.run(id, volume, Math.max(0, volume - ours), snapshot - 30 * DAY, recordsStart, Date.now());
}

/** Read the next person's SoDEX volume. False when nobody is due. */
export async function processNextVolume() {
  const now = Date.now();
  // What we recorded is taken per batch; a batch held up for a while is read afresh.
  if (volumes.length && now - volumesAt > 15 * 60_000) volumes = [];
  if (!volumes.length) {
    if (now < volumesEmptyUntil) return false;
    volumes = refillVolumes(now);
    volumesAt = now;
    if (!volumes.length) {
      volumesEmptyUntil = now + 10 * 60_000;
      return false;
    }
  }
  const acct = volumes.shift();
  try {
    await readVolume(acct);
  } catch (err) {
    volumeStats.failures++;
    log.warn("squads", `volume lookup failed: ${err.message}`);
    retryVolume.run(acct.account_id, Date.now() - config.squads.volumeRecheckMs + 60 * 60_000);
    await sleep(2_000);
  }
  return true;
}

/* ── The exact part: trade history before our records ───────────────────── */

/**
 * The 30-day figure only says how much someone traded before our records,
 * not when. For everyone it shows trading then, biggest first, this reads
 * their actual trades from the window start to our records' start (one or two
 * calls for most) and keeps them in half-day buckets. Slow and polite: the
 * trade history refuses bursts, so any rate limit rests the lane 15 minutes.
 */

const HALF = 12 * 3_600_000;
const PAGE = 1000;
/** More pages than this per market type (a market maker) and the 30-day estimate stays in use. */
const MAX_PAGES = 60;
/** Below this much volume before our records, the estimate's error is too small to be worth the trade history's rate limit. */
const MIN_PRE = 1000;
const dueTrades = db.prepare(`
  SELECT v.account_id, v.pre FROM squad_volume v
  LEFT JOIN squad_pre_read r ON r.account_id = v.account_id
  WHERE v.pre >= ${MIN_PRE} AND v.pre_to > 0 AND (r.account_id IS NULL OR (r.from_ts > 0 AND r.from_ts > ?))
  ORDER BY v.pre DESC LIMIT 100`);
const clearPre = db.prepare("DELETE FROM squad_pre WHERE account_id = ?");
const savePre = db.prepare("INSERT INTO squad_pre (account_id, half, usd) VALUES (?, ?, ?)");
const markPre = db.prepare(`
  INSERT INTO squad_pre_read (account_id, from_ts, to_ts, read_at) VALUES (?, ?, ?, ?)
  ON CONFLICT (account_id) DO UPDATE SET from_ts = excluded.from_ts, to_ts = excluded.to_ts, read_at = excluded.read_at`);

let tradeQueue = [];
let tradesEmptyUntil = 0;
let tradeNext = 0;
let tradePausedUntil = 0;
const tradeHost = `${hostOf(config.dataApi)}#trades`;

async function tradeGet(path) {
  const now = Date.now();
  const at = Math.max(now, tradeNext, tradePausedUntil);
  tradeNext = at + 1000 / config.squads.tradesPerSecond;
  if (at > now) await sleep(at - now);
  await guard(tradeHost);
  let res;
  let json;
  try {
    res = await fetch(`${config.dataApi}${path}`, { headers: { Accept: "application/json" }, signal: AbortSignal.timeout(config.limits.requestTimeoutMs) });
    json = res.status === 429 ? null : await res.json();
  } catch (err) {
    const e = new Outage(err.name === "TimeoutError" ? "timed out" : err instanceof SyntaxError ? `HTTP ${res?.status}, not JSON` : `no answer (${err.cause?.code ?? err.message})`);
    fail(tradeHost, e);
    throw e;
  }
  if (res.status === 429) {
    tradePausedUntil = Date.now() + 15 * 60_000;
    log.warn("squads", "trade history rate-limited; resting the lane 15 minutes");
    throw new Error("rate limited");
  }
  if (res.status >= 500) {
    const e = new Outage(`HTTP ${res.status}`);
    fail(tradeHost, e);
    throw e;
  }
  ok(tradeHost);
  if (!res.ok || (json?.code !== 0 && json?.code !== "0")) throw new Error(json?.message || `HTTP ${res.status}`);
  return json;
}

/** One person's trades from `from` to `to`, perps and spot, summed by half-day. Null when there are too many. */
async function readTrades(id, from, to) {
  const halves = new Map();
  for (const kind of ["perps", "spot"]) {
    let cursor = null;
    for (let page = 0; ; page++) {
      if (page >= MAX_PAGES) return null;
      const j = await tradeGet(`/${kind}/trades?account_id=${id}&limit=${PAGE}&start_ts=${from}&end_ts=${to}${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ""}`);
      const rows = Array.isArray(j.data) ? j.data : [];
      for (const t of rows) {
        const usd = Number(t.price) * Number(t.quantity);
        if (!(usd > 0) || !(t.ts_ms >= from && t.ts_ms < to)) continue;
        const h = Math.floor(t.ts_ms / HALF);
        halves.set(h, (halves.get(h) ?? 0) + usd);
      }
      const last = rows[rows.length - 1];
      if (rows.length < PAGE || !last) break;
      cursor = j.meta?.next_cursor ?? Buffer.from(`${last.ts_ms},${last.trade_id},${last.symbol_id}`).toString("base64");
    }
  }
  return halves;
}

/** Read the next person's trades from before our records. False when nobody is due. */
export async function processNextPreTrades() {
  const now = Date.now();
  recordsStart ??= recordsStartQ.get().t ?? null;
  const from = windowStart(now);
  if (recordsStart == null || from >= recordsStart) return false;
  if (!tradeQueue.length) {
    if (now < tradesEmptyUntil) return false;
    // Read again only if the window now starts earlier than what we read (it only moves later).
    tradeQueue = dueTrades.all(from);
    if (!tradeQueue.length) {
      tradesEmptyUntil = now + 10 * 60_000;
      return false;
    }
  }
  const { account_id: id } = tradeQueue.shift();
  try {
    const halves = await readTrades(id, from, recordsStart);
    tx(() => {
      clearPre.run(id);
      if (halves) for (const [h, usd] of halves) savePre.run(id, h, usd);
      // from_ts 0: too many trades to read, so the 30-day estimate stays in use.
      markPre.run(id, halves ? from : 0, recordsStart, Date.now());
    });
    volumeStats.traded++;
  } catch (err) {
    volumeStats.tradeFailures++;
    log.warn("squads", `trade history failed: ${err.message}`);
    // An outage or the rate limit passes; any other refusal leaves this person on the estimate.
    if (!(err instanceof Outage) && err.message !== "rate limited") markPre.run(id, 0, recordsStart, Date.now());
    await sleep(5_000);
  }
  return true;
}

/* ── Upkeep ─────────────────────────────────────────────────────────────── */

const resolveInviters = db.prepare(`
  UPDATE squad_links SET inviter_id = (SELECT f.account_id FROM fund_accounts f WHERE f.address = squad_links.inviter_address)
  WHERE inviter_id IS NULL AND inviter_address IS NOT NULL
    AND EXISTS (SELECT 1 FROM fund_accounts f WHERE f.address = squad_links.inviter_address)`);
const kvSet = db.prepare("INSERT INTO kv (key, value) VALUES (?, ?) ON CONFLICT (key) DO UPDATE SET value = excluded.value");

/**
 * The season's current week and the squad boost rules, for the site; and
 * inviters that joined the address book since they were first seen.
 */
export async function refreshSeason() {
  const fixed = resolveInviters.run().changes;
  if (fixed) log.info("squads", `matched ${fixed} inviter(s) to accounts`);
  try {
    const week = await get("/sopoints/v2/week/info");
    const rules = await get("/sopoints/v2/team/boost/config");
    kvSet.run("squads:season", JSON.stringify({ week, rules, at: Date.now() }));
  } catch (err) {
    log.warn("squads", `season info failed: ${err.message}`);
  }
}

export function squadsSummary() {
  const a = db
    .prepare(`SELECT SUM(code IS NOT '${REFUSED}') n, COUNT(inviter_address) linked, COUNT(DISTINCT inviter_address) captains FROM squad_links`)
    .get();
  const n = db.prepare("SELECT COUNT(*) n, SUM(name != '') named FROM squad_names").get();
  return (
    `asked ${a.n} account(s) · ${a.linked} joined through a code · ${a.captains} captain(s) · ${n.named ?? 0}/${n.n} named · ` +
    `${squadStats.failures} failure(s)${squadStats.limited ? ` · rate-limited ${squadStats.limited} time(s)` : ""}` +
    (volumeStats.reads || volumeStats.failures ? ` · ${volumeStats.reads} SoDEX volume(s) read, ${volumeStats.failures} failed` : "") +
    (volumeStats.traded || volumeStats.tradeFailures ? ` · ${volumeStats.traded} trade histories read, ${volumeStats.tradeFailures} failed` : "")
  );
}
