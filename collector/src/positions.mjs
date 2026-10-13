import { config } from "./config.mjs";
import { db, tx } from "./db.mjs";
import { dataApi, gw } from "./gateway.mjs";
import { log } from "./log.mjs";
import { refreshAddresses } from "./funds.mjs";
import { diffPositions } from "./events.mjs";
import { Outage } from "./health.mjs";
import { sql } from "./db.mjs";

/**
 * Open positions for every account that holds any. Built to fetch as little
 * as possible:
 *
 *   - A position can only change through a fill, and the trade stream already
 *     carries both accounts on every fill. So a fill marks its two accounts,
 *     and only those are re-read. Nothing is polled to notice changes.
 *   - Unrealised PnL, bias and distance to liquidation move with price, not
 *     with the position. The site works those out from the mark prices the
 *     collector records every minute, so price moves cost no fetching at all.
 *   - Liquidation prices drift under cross margin as other positions win or
 *     lose, so positions are still re-read on a schedule, by size: the biggest
 *     every 10 minutes, the smallest every 6 hours.
 *   - Holders who haven't traded since we started are found once by sweeping
 *     every trader's overview on SoDEX's data host (no trading-API weight);
 *     any account with unrealised PnL holds something.
 *   - Track records (all-time PnL) for every trader come from the leaderboard,
 *     50 accounts a page, also on the data host.
 *
 * Only the snapshot itself (5 REST weight) touches the trading API, on its
 * own capped lane. Addresses are needed to request a snapshot and never
 * leave this database.
 */

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const num = (v) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

export const positionStats = { snapshots: 0, failures: 0, holders: 0, swept: 0, dirtyQueued: 0 };

function pacer(perSecond) {
  let next = 0;
  return async () => {
    const now = Date.now();
    const at = Math.max(now, next);
    next = at + 1000 / perSecond;
    if (at > now) await sleep(at - now);
  };
}
const snapPace = pacer(config.positions.weightPerMinute / 5 / 60);
const dataPace = pacer(config.positions.dataPerSecond);

const q = {
  address: db.prepare("SELECT address FROM fund_accounts WHERE account_id = ?"),
  ensure: db.prepare("INSERT OR IGNORE INTO pos_accounts (account_id) VALUES (?)"),
  // Overdue refreshes, biggest positions first: when the lane falls behind,
  // the accounts that move the figures most are read first, and the small
  // ones catch up with what's left. Oldest first let a backlog of small
  // accounts hold $136M positions unread for most of a day.
  due: db.prepare(`
    SELECT a.account_id FROM pos_accounts a
    LEFT JOIN (SELECT account_id, SUM(ABS(size) * entry) n FROM open_positions GROUP BY account_id) p ON p.account_id = a.account_id
    WHERE a.next_at IS NOT NULL AND a.next_at <= ?
    ORDER BY COALESCE(p.n, 0) DESC, a.next_at LIMIT 1`),
  snapshotAt: db.prepare("SELECT snapshot_at FROM pos_accounts WHERE account_id = ?"),
  previous: db.prepare("SELECT market, pos_side, size, entry, leverage, liq_price FROM open_positions WHERE account_id = ?"),
  clear: db.prepare("DELETE FROM open_positions WHERE account_id = ?"),
  insert: db.prepare(`
    INSERT OR REPLACE INTO open_positions (account_id, market, pos_side, size, entry, leverage, liq_price, margin_mode, opened_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`),
  account: db.prepare("UPDATE pos_accounts SET equity = ?, holds = ?, snapshot_at = ?, next_at = ? WHERE account_id = ?"),
  lastMark: db.prepare("SELECT mark FROM ticker_minute WHERE market = ? ORDER BY minute DESC LIMIT 1"),
  sweptOnly: db.prepare("UPDATE pos_accounts SET swept_at = ? WHERE account_id = ?"),
  retryLater: db.prepare("UPDATE pos_accounts SET next_at = ? WHERE account_id = ? AND next_at IS NOT NULL"),
  // Busiest traders first, then accounts known to hold deposited money, then the rest.
  sweepNext: db.prepare(`
    SELECT p.account_id FROM pos_accounts p LEFT JOIN fund_accounts f ON f.account_id = p.account_id
    WHERE p.swept_at IS NULL OR p.swept_at < ?
    ORDER BY COALESCE(p.alltime_volume, 0) DESC, COALESCE(f.net_usd, 0) DESC LIMIT 200`),
  // Every account SoDEX has: the leaderboard only lists the top 1,000.
  seedAll: db.prepare("INSERT OR IGNORE INTO pos_accounts (account_id) SELECT account_id FROM fund_accounts"),
  // The overview's account value only stands in until the account's first
  // snapshot: SoDEX reports $0 there for some of its biggest accounts, and it
  // once turned two $10M accounts into "Shrimp" by overwriting their snapshot.
  swept: db.prepare("UPDATE pos_accounts SET equity = CASE WHEN snapshot_at IS NULL THEN ? ELSE equity END, swept_at = ? WHERE account_id = ?"),
  leader: db.prepare(`
    INSERT INTO pos_accounts (account_id, alltime_pnl, alltime_volume) VALUES (?, ?, ?)
    ON CONFLICT (account_id) DO UPDATE SET alltime_pnl = excluded.alltime_pnl, alltime_volume = excluded.alltime_volume`),
};

/* ── Which accounts need a snapshot ─────────────────────────────────────── */

/** account_id → when it first became dirty since its last snapshot. */
const dirty = new Map();

export function markDirty(accountId) {
  if (accountId == null || dirty.has(accountId)) return;
  dirty.set(accountId, Date.now());
  positionStats.dirtyQueued++;
}

let lastWasFill = false;

/**
 * The next account to snapshot. Settled fills and scheduled refreshes take
 * turns, the most overdue refresh first. Fills alone never run out (hundreds
 * of accounts trade every minute), so serving them first starved the
 * schedule: accounts holding big positions without trading went unread for
 * most of a day. Exported for the tests.
 */
export function nextAccount() {
  const now = Date.now();
  if (lastWasFill) {
    const due = q.due.get(now)?.account_id;
    if (due != null) {
      lastWasFill = false;
      return due;
    }
  }
  for (const [id, since] of dirty) {
    if (now - since < config.positions.settleMs) continue;
    const last = q.snapshotAt.get(id)?.snapshot_at ?? 0;
    if (now - last < config.positions.minGapMs) continue;
    dirty.delete(id);
    lastWasFill = true;
    return id;
  }
  lastWasFill = false;
  return q.due.get(now)?.account_id ?? null;
}

let lastAddressRefresh = 0;

/** Read one account's state and replace its stored positions. */
async function snapshot(accountId) {
  const addr = q.address.get(accountId)?.address;
  if (!addr) {
    // A brand-new account: pick up the newest addresses, at most every 5 minutes.
    if (Date.now() - lastAddressRefresh > 5 * 60_000) {
      lastAddressRefresh = Date.now();
      await refreshAddresses();
      return snapshot(accountId);
    }
    markDirty(accountId);
    return;
  }
  await snapPace();
  const state = await gw(`/perps/accounts/${addr}/state`, 5);
  // Only a proper account state may replace what we hold. Anything else (a
  // half-empty reply during maintenance, say) would read as every position
  // closed and fire false alerts.
  const valid =
    state &&
    typeof state === "object" &&
    Number.isFinite(Number(state.av)) &&
    (state.P == null || Array.isArray(state.P)) &&
    (state.aid == null || Number(state.aid) === accountId);
  if (!valid) throw new Error("unexpected account state; keeping the last good snapshot");
  positionStats.snapshots++;

  const now = Date.now();
  const rows = [];
  let largest = 0;
  for (const p of state?.P ?? []) {
    const size = num(p.sz);
    if (!size) continue;
    const market = p.s;
    const entry = num(p.ep) ?? 0;
    const mark = q.lastMark.get(market)?.mark ?? entry;
    largest = Math.max(largest, Math.abs(size) * mark);
    rows.push([accountId, market, p.ps ?? "BOTH", size, entry, num(p.l), num(p.lp), p.m ?? null, num(p.ct), num(p.ut) ?? now]);
  }
  const tier = config.positions.refresh.find((t) => largest >= t.minUsd);
  const nextAt = rows.length ? now + tier.everyMs : null;

  // What changed since the last read. Skipped on an account's first read:
  // positions found for the first time weren't opened just now.
  const seenBefore = q.snapshotAt.get(accountId)?.snapshot_at != null;
  const events = seenBefore
    ? diffPositions(
        q.previous.all(accountId).map((p) => ({ market: p.market, posSide: p.pos_side, size: p.size, entry: p.entry, liq: p.liq_price, leverage: p.leverage })),
        rows.map((r) => ({ market: r[1], posSide: r[2], size: r[3], entry: r[4], liq: r[6], leverage: r[5] })),
        (m) => q.lastMark.get(m)?.mark ?? null,
      )
    : [];

  tx(() => {
    for (const e of events) {
      sql.event.run(accountId, now, e.kind, e.market, e.side, e.sizeBefore, e.sizeAfter, e.usd, e.price, e.leverage, e.liquidated ? 1 : 0, null);
    }
    q.ensure.run(accountId);
    q.clear.run(accountId);
    for (const r of rows) q.insert.run(...r);
    q.account.run(num(state?.av), rows.length ? 1 : 0, now, nextAt, accountId);
  });
}

/** The snapshot lane: runs until stopped, one account at a time. */
export async function runSnapshots(isStopped) {
  while (!isStopped()) {
    const id = nextAccount();
    if (id == null) {
      await sleep(2_000);
      continue;
    }
    try {
      await snapshot(id);
    } catch (err) {
      positionStats.failures++;
      log.warn("positions", `snapshot of account ${id} failed: ${err.message}`);
      // Try this account again in 5 minutes, not straight away.
      q.retryLater.run(Date.now() + 5 * 60_000, id);
      dirty.set(id, Date.now() + 5 * 60_000);
      await sleep(3_000);
    }
  }
}

/* ── Finding holders and track records (data host, no REST weight) ─────── */

/**
 * Put every account in the address book on the sweep list. SoDEX's
 * leaderboard only serves its top 1,000, so seeding from it alone left the
 * other ~230,000 accounts (and most open interest) unchecked.
 */
export function seedFromAddressBook() {
  const added = q.seedAll.run().changes;
  if (added) log.info("positions", `sweep list: ${added.toLocaleString("en-US")} account(s) added from the address book`);
  return added;
}

/**
 * Every top trader's all-time PnL and volume from the leaderboard (its top
 * 1,000), for track-record groups and to sweep them first.
 */
export async function refreshTrackRecords({ maxPages = Infinity } = {}) {
  let pages = 0;
  for (let page = 1; page <= maxPages; page++) {
    await dataPace();
    let data;
    try {
      data = await dataApi(`/leaderboard?window_type=ALL_TIME&sort_by=volume&sort_order=desc&page=${page}&page_size=50`);
    } catch (err) {
      log.warn("positions", `leaderboard page ${page} failed: ${err.message}`);
      break;
    }
    const items = data?.items ?? [];
    tx(() => {
      for (const it of items) q.leader.run(it.account_id, num(it.pnl_usd), num(it.volume_usd));
    });
    pages++;
    if (items.length < 50 || page * 50 >= (data?.total ?? 0)) break;
  }
  log.info("positions", `track records: ${pages} leaderboard page(s) read`);
}

/**
 * Sweep trader overviews, busiest first. Any account with unrealised PnL
 * holds a position and is queued for a snapshot; the overview's account value
 * stands in for equity until that first snapshot replaces it.
 */
export async function sweepOnce({ limit = Infinity } = {}) {
  let done = 0;
  while (done < limit) {
    const batch = q.sweepNext.all(Date.now() - config.positions.sweepEveryMs);
    if (!batch.length) break;
    for (const { account_id: id } of batch) {
      if (done >= limit) break;
      await dataPace();
      try {
        const ov = await dataApi(`/wallet/portfolio/overview?account_id=${id}&window=1Y`);
        q.swept.run(num(ov?.account_value_usd), Date.now(), id);
        if (Math.abs(num(ov?.perps_unrealized_pnl_usd) ?? 0) > 0.0001) {
          markDirty(id);
          positionStats.holders++;
        }
      } catch (err) {
        log.warn("positions", `overview of account ${id} failed: ${err.message}`);
        // An outage leaves it unswept for next time; a proper refusal moves
        // on, so one odd account can't hold up the sweep.
        if (!(err instanceof Outage)) q.sweptOnly.run(Date.now(), id);
        await sleep(2_000);
      }
      done++;
      positionStats.swept++;
    }
  }
  return done;
}

/** Snapshot every queued account now, ignoring the settle delay. For the sample run. */
export async function drain() {
  for (const id of [...dirty.keys()]) {
    dirty.delete(id);
    try {
      await snapshot(id);
    } catch (err) {
      positionStats.failures++;
      log.warn("positions", `snapshot of account ${id} failed: ${err.message}`);
    }
  }
}

export function positionsSummary() {
  const a = db.prepare("SELECT COUNT(*) n, SUM(holds) h, COUNT(snapshot_at) s, COUNT(swept_at) w FROM pos_accounts").get();
  const p = db.prepare("SELECT COUNT(*) n FROM open_positions").get();
  return `${p.n} open positions across ${a.h ?? 0} holders · ${a.s} snapshotted · ${a.w}/${a.n} swept · ${dirty.size} waiting · ${positionStats.failures} failure(s)`;
}
