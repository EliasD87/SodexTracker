import { config } from "./config.mjs";
import { db, sql, tx } from "./db.mjs";
import { gw } from "./gateway.mjs";
import { log } from "./log.mjs";
import { cohortOf } from "./cohorts.mjs";
import { byDisplay, displayOf } from "./markets.mjs";

/**
 * Every trade passes through here once:
 *   1. Continuity: trade IDs run consecutively per market, so a jump is a
 *      gap. Gaps are queued and refilled from REST, which returns trades
 *      without account IDs, so refilled volume is counted as "unattributed"
 *      rather than guessed into a group.
 *   2. Aggregation into memory: per-minute flow by group, per-account daily
 *      totals, and full rows for large trades. Flushed in one transaction.
 */

const MINUTE = 60_000;

const flow = new Map();
const accounts = new Map();
const large = [];
const seq = new Map();
const recent = new Map();
const gapQueue = [];

export const tradeStats = { trades: 0, duplicates: 0, gaps: 0, missing: 0, recovered: 0, lost: 0, usd: 0 };

/**
 * Trades per minute per market, smoothed. Backfill uses it to work out which
 * gap is about to become unrecoverable: REST only returns a market's last 500
 * trades, which on BTC is about three minutes and on a quiet market is hours.
 */
const rate = new Map();
const sinceFlush = new Map();

/** Gaps found since the last summary. A restart opens one per market, so they're reported together. */
let newGaps = { gaps: 0, missing: 0, markets: new Set(), largest: null };
/** Gaps worth a line of their own. Anything smaller is only summarised. */
const LOUD_GAP = 100;

// Resume each market's sequence where the last run stopped, so downtime shows
// up as a gap instead of passing silently.
for (const r of db.prepare("SELECT market, engine, first_id, last_id, last_ts FROM market_seq").all()) {
  seq.set(r.market, { engine: r.engine, first: r.first_id, last: r.last_id, lastTs: r.last_ts, fresh: 0, persisted: true });
}

// Backfill still owed from the last run. The queue itself lives in memory, so
// without this a restart would leave those gaps open for good.
//
// Only gaps that end at or before the market's saved position are re-queued.
// Anything past it falls inside the gap this run detects on its first trade
// (which starts right after the saved position), so queueing both would
// count those trades twice.
{
  let requeued = 0;
  let superseded = 0;
  const supersede = db.prepare("UPDATE gaps SET status = 'superseded' WHERE id = ?");
  for (const g of db.prepare("SELECT id, market, from_id, to_id FROM gaps WHERE status = 'open' ORDER BY id").all()) {
    const saved = seq.get(g.market);
    if (saved && g.to_id > saved.last) {
      supersede.run(g.id);
      superseded++;
      continue;
    }
    gapQueue.push({ gapId: g.id, market: g.market, from: g.from_id, to: g.to_id });
    requeued++;
  }
  if (requeued || superseded) log.info("gap", `from the last run: ${requeued} open gap(s) re-queued, ${superseded} folded into this run's restart gaps`);
}

/**
 * Backfill results waiting to be saved. A gap's status is written in the
 * same transaction as the trades that filled it, so a crash can't leave a gap
 * marked filled while its trades were never stored.
 */
const gapResults = [];

function bucket(market, minute, cohort) {
  const key = `${market}|${minute}|${cohort}`;
  let b = flow.get(key);
  if (!b) {
    b = { market, minute, cohort, bought: 0, sold: 0, takerBought: 0, takerSold: 0, fills: 0 };
    flow.set(key, b);
  }
  return b;
}

function account(day, id, market) {
  const key = `${day}|${id}|${market}`;
  let a = accounts.get(key);
  if (!a) {
    a = { day, id, market, bought: 0, sold: 0, boughtQty: 0, soldQty: 0, taker: 0, maker: 0, fills: 0 };
    accounts.set(key, a);
  }
  return a;
}

function remember(market, id) {
  let r = recent.get(market);
  if (!r) {
    r = { ids: new Set(), order: [] };
    recent.set(market, r);
  }
  r.ids.add(id);
  r.order.push(id);
  if (r.order.length > config.recentIdsPerMarket) r.ids.delete(r.order.shift());
}

/** Trade IDs captured live for a market, for completeness checks. */
export function capturedIds(market) {
  const r = recent.get(market);
  const s = seq.get(market);
  if (!r || !s || !r.order.length) return null;
  return { ids: r.ids, min: r.order[0], max: s.last };
}

/**
 * Called for every perps fill with the buyer's and seller's account IDs: a
 * position can only change through a fill, so this is how the position engine
 * knows whose positions to re-read.
 */
export const fillListeners = new Set();

/** A never-seen ID this far below the last one means the sequence restarted. */
const SEQUENCE_RESET = 5_000;
/** A forward jump this large is a new numbering (no market trades this much between two messages). */
const SEQUENCE_JUMP = 1_000_000;

export function onTrade(engine, t) {
  const market = displayOf(t.s);
  const id = t.t;
  const s = seq.get(market);

  if (s) {
    if (id <= s.last) {
      // A replay after a reconnect is recent and already seen. Anything far
      // behind and never seen means SoDEX restarted this market's trade IDs
      // (it can, around maintenance): follow the new sequence, or every new
      // trade would be dropped as a duplicate.
      const seen = recent.get(market)?.ids.has(id);
      if (seen || s.last - id < SEQUENCE_RESET) {
        tradeStats.duplicates++;
        return;
      }
      log.warn("trades", `${market}: trade IDs restarted (${s.last} → ${id}); following the new sequence`);
      s.last = id - 1;
    }
    if (id > s.last + 1 + SEQUENCE_JUMP) {
      // A jump this large is a new numbering, not missed trades.
      log.warn("trades", `${market}: trade IDs jumped ${s.last} → ${id}; treating it as a new numbering, not a gap`);
      s.last = id - 1;
    }
    if (id > s.last + 1) {
      const missing = id - s.last - 1;
      tradeStats.gaps++;
      tradeStats.missing += missing;
      const info = sql.gap.run(market, s.last + 1, id - 1, missing, Date.now());
      gapQueue.push({ gapId: Number(info.lastInsertRowid), market, api: t.s, engine, from: s.last + 1, to: id - 1 });
      newGaps.gaps++;
      newGaps.missing += missing;
      newGaps.markets.add(market);
      if (!newGaps.largest || missing > newGaps.largest.missing) newGaps.largest = { market, missing };
      if (missing >= LOUD_GAP) log.warn("gap", `${market}: ${missing} trades missed (${s.last + 1}–${id - 1})`);
    }
    s.last = id;
    s.lastTs = t.T;
    s.fresh++;
  } else {
    seq.set(market, { engine, first: id, last: id, lastTs: t.T, fresh: 1, persisted: false });
  }

  remember(market, id);
  sinceFlush.set(market, (sinceFlush.get(market) ?? 0) + 1);
  record(market, t, cohortOf(t.bi), cohortOf(t.si));
  if (engine === "perps") for (const fn of fillListeners) fn(t.bi, t.si);
}

/** Add one trade to the in-memory aggregates. */
function record(market, t, buyerCohort, sellerCohort) {
  const price = parseFloat(t.p);
  const qty = parseFloat(t.q);
  const usd = price * qty;
  if (!(usd > 0)) return;
  const minute = Math.floor(t.T / MINUTE) * MINUTE;
  const takerIsBuyer = t.S === "BUY";

  tradeStats.trades++;
  tradeStats.usd += usd;

  const b = bucket(market, minute, buyerCohort);
  b.bought += usd;
  b.fills++;
  const s = bucket(market, minute, sellerCohort);
  s.sold += usd;
  s.fills++;
  if (takerIsBuyer) b.takerBought += usd;
  else s.takerSold += usd;

  // Refilled trades carry no accounts; they only reach the flow table.
  if (t.bi == null || t.si == null) return;

  const day = new Date(t.T).toISOString().slice(0, 10);
  const buyer = account(day, t.bi, market);
  buyer.bought += usd;
  buyer.boughtQty += qty;
  buyer.fills++;
  const seller = account(day, t.si, market);
  seller.sold += usd;
  seller.soldQty += qty;
  seller.fills++;
  (takerIsBuyer ? buyer : seller).taker += usd;
  (takerIsBuyer ? seller : buyer).maker += usd;

  if (usd >= config.largeTradeUsd) {
    large.push([market, t.t, t.T, t.S, price, qty, usd, t.bi, t.si, takerIsBuyer ? buyerCohort : sellerCohort, takerIsBuyer ? sellerCohort : buyerCohort]);
  }
}

/** Write everything accumulated since the last flush, in one transaction. */
let lastRateAt = Date.now();

/** Fold the trades seen since the last call into each market's rate. */
function updateRates() {
  const now = Date.now();
  const minutes = (now - lastRateAt) / 60_000;
  lastRateAt = now;
  if (minutes <= 0) return;
  for (const market of new Set([...rate.keys(), ...sinceFlush.keys()])) {
    const current = (sinceFlush.get(market) ?? 0) / minutes;
    const prev = rate.get(market);
    rate.set(market, prev == null ? current : prev * 0.8 + current * 0.2);
  }
  sinceFlush.clear();
}

export function flush() {
  updateRates();
  const started = performance.now();
  const counts = { flow: flow.size, accounts: accounts.size, large: large.length };
  tx(() => {
    for (const b of flow.values()) sql.flow.run(b.market, b.minute, b.cohort, b.bought, b.sold, b.takerBought, b.takerSold, b.fills);
    for (const a of accounts.values()) sql.accountDay.run(a.day, a.id, a.market, a.bought, a.sold, a.boughtQty, a.soldQty, a.taker, a.maker, a.fills);
    for (const row of large) sql.largeTrade.run(...row);
    for (const [backfilled, status, gapId] of gapResults) sql.gapDone.run(backfilled, status, gapId);
    for (const [market, s] of seq) {
      if (!s.fresh && s.persisted) continue;
      sql.seq.run(market, s.engine, s.first, s.last, s.lastTs, s.fresh);
      s.fresh = 0;
      s.persisted = true;
    }
  });
  flow.clear();
  accounts.clear();
  large.length = 0;
  gapResults.length = 0;
  return { ...counts, ms: Math.round(performance.now() - started) };
}

/** Gaps found since the last call, as one line; null if there were none. */
export function takeGapSummary() {
  if (!newGaps.gaps) return null;
  const g = newGaps;
  newGaps = { gaps: 0, missing: 0, markets: new Set(), largest: null };
  return `${g.gaps} gap(s) across ${g.markets.size} market(s), ${g.missing} trades missed (largest ${g.largest.market}: ${g.largest.missing}); queued for backfill`;
}

export const gapsQueued = () => gapQueue.length;

/**
 * Refill the oldest queued gap from REST. Returns false when there's nothing
 * to do. REST returns at most the last 500 trades per market, so a long
 * outage on a busy market can only be partly recovered; whatever falls
 * outside that is recorded as lost. Runs in its own loop, so waiting on the
 * REST budget never holds up a flush.
 */
export async function processNextGap() {
  if (!gapQueue.length) return false;
  // Most urgent first: the market whose missing trades will scroll out of
  // REST's 500-trade window soonest, i.e. the busiest. Gaps cooling off after
  // a failed call wait their turn.
  const now = Date.now();
  let pick = -1;
  for (let i = 0; i < gapQueue.length; i++) {
    if ((gapQueue[i].retryAt ?? 0) > now) continue;
    if (pick < 0 || (rate.get(gapQueue[i].market) ?? 0) > (rate.get(gapQueue[pick].market) ?? 0)) pick = i;
  }
  if (pick < 0) return false;
  const [g] = gapQueue.splice(pick, 1);
  // Every other queued gap on the same market is answered by the same call:
  // a restart often leaves an old gap and a new one side by side.
  const siblings = [];
  for (let i = gapQueue.length - 1; i >= 0; i--) {
    if (gapQueue[i].market === g.market) siblings.push(...gapQueue.splice(i, 1));
  }
  const batch = [g, ...siblings];
  const meta = byDisplay(g.market);
  if (!meta) {
    // The market list may not have loaded yet; try again shortly.
    gapQueue.push(...batch);
    return false;
  }
  let rows;
  try {
    rows = await gw(`/${meta.engine}/markets/${encodeURIComponent(meta.api)}/trades?limit=500`, 20);
  } catch (err) {
    log.warn("gap", `${g.market}: backfill failed (${err.message}); retrying in 30s`);
    for (const gap of batch) gap.retryAt = Date.now() + 30_000;
    gapQueue.push(...batch);
    return true;
  }
  for (const gap of batch) {
    const wanted = gap.to - gap.from + 1;
    const found = (rows ?? []).filter((r) => r.t >= gap.from && r.t <= gap.to);
    for (const r of found) record(gap.market, { ...r, bi: null, si: null }, "unattributed", "unattributed");
    const status = found.length === wanted ? "filled" : found.length ? "partial" : "lost";
    gapResults.push([found.length, status, gap.gapId]);
    tradeStats.recovered += found.length;
    tradeStats.lost += wanted - found.length;
    if (status !== "filled") log.warn("gap", `${gap.market}: recovered only ${found.length} of ${wanted} (${status})`);
  }
  return true;
}
