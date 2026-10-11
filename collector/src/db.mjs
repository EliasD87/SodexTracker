import { DatabaseSync } from "node:sqlite";
import fs from "node:fs";
import path from "node:path";
import { config } from "./config.mjs";

/**
 * Local storage. The schema is plain SQL that maps one-to-one onto Postgres,
 * so the same tables move to Supabase once the data has been verified here.
 *
 * Counters are written as additive upserts, so a partly filled minute or day
 * can be flushed at any time and topped up later without double counting.
 */

fs.mkdirSync(path.dirname(config.dbPath), { recursive: true });
export const db = new DatabaseSync(config.dbPath);

db.exec(`
  PRAGMA journal_mode = WAL;
  PRAGMA synchronous = NORMAL;

  -- Net flow per market, minute and trader group. Each trade counts once for
  -- the buyer's group and once for the seller's; "taker" columns isolate the
  -- side that crossed the spread, which is where conviction shows.
  CREATE TABLE IF NOT EXISTS flow_minute (
    market TEXT NOT NULL,
    minute INTEGER NOT NULL,
    cohort TEXT NOT NULL,
    bought_usd REAL NOT NULL DEFAULT 0,
    sold_usd REAL NOT NULL DEFAULT 0,
    taker_bought_usd REAL NOT NULL DEFAULT 0,
    taker_sold_usd REAL NOT NULL DEFAULT 0,
    fills INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY (market, minute, cohort)
  ) WITHOUT ROWID;

  -- Per account, per market, per UTC day. The basis for true active-trader
  -- counts, group detection and trader profiles. Account IDs stay internal.
  CREATE TABLE IF NOT EXISTS account_day (
    day TEXT NOT NULL,
    account_id INTEGER NOT NULL,
    market TEXT NOT NULL,
    bought_usd REAL NOT NULL DEFAULT 0,
    sold_usd REAL NOT NULL DEFAULT 0,
    bought_qty REAL NOT NULL DEFAULT 0,
    sold_qty REAL NOT NULL DEFAULT 0,
    taker_usd REAL NOT NULL DEFAULT 0,
    maker_usd REAL NOT NULL DEFAULT 0,
    fills INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY (day, account_id, market)
  ) WITHOUT ROWID;

  CREATE TABLE IF NOT EXISTS large_trades (
    market TEXT NOT NULL,
    trade_id INTEGER NOT NULL,
    ts INTEGER NOT NULL,
    side TEXT NOT NULL,
    price REAL NOT NULL,
    qty REAL NOT NULL,
    usd REAL NOT NULL,
    buyer_id INTEGER NOT NULL,
    seller_id INTEGER NOT NULL,
    taker_cohort TEXT NOT NULL,
    maker_cohort TEXT NOT NULL,
    PRIMARY KEY (market, trade_id)
  ) WITHOUT ROWID;

  -- Where each market's trade-ID sequence stands, so a restart resumes and
  -- any trades missed while down are detected as a gap.
  CREATE TABLE IF NOT EXISTS market_seq (
    market TEXT PRIMARY KEY,
    engine TEXT NOT NULL,
    first_id INTEGER NOT NULL,
    last_id INTEGER NOT NULL,
    last_ts INTEGER NOT NULL,
    trades INTEGER NOT NULL DEFAULT 0
  );

  CREATE TABLE IF NOT EXISTS gaps (
    id INTEGER PRIMARY KEY,
    market TEXT NOT NULL,
    from_id INTEGER NOT NULL,
    to_id INTEGER NOT NULL,
    missing INTEGER NOT NULL,
    detected_at INTEGER NOT NULL,
    backfilled INTEGER NOT NULL DEFAULT 0,
    status TEXT NOT NULL DEFAULT 'open'
  );

  -- Minute detail older than 48 hours, rolled up by the hour. Rows move here
  -- in the same transaction that deletes them from flow_minute, so a period
  -- is only ever in one of the two tables.
  CREATE TABLE IF NOT EXISTS flow_hour (
    market TEXT NOT NULL,
    hour INTEGER NOT NULL,
    cohort TEXT NOT NULL,
    bought_usd REAL NOT NULL DEFAULT 0,
    sold_usd REAL NOT NULL DEFAULT 0,
    taker_bought_usd REAL NOT NULL DEFAULT 0,
    taker_sold_usd REAL NOT NULL DEFAULT 0,
    fills INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY (market, hour, cohort)
  ) WITHOUT ROWID;

  -- The last snapshot of each hour, plus that hour's average funding.
  CREATE TABLE IF NOT EXISTS ticker_hour (
    market TEXT NOT NULL,
    hour INTEGER NOT NULL,
    last REAL, mark REAL, idx REAL, oi REAL, funding REAL,
    PRIMARY KEY (market, hour)
  ) WITHOUT ROWID;

  CREATE TABLE IF NOT EXISTS ticker_minute (
    market TEXT NOT NULL,
    minute INTEGER NOT NULL,
    last REAL, mark REAL, idx REAL, oi REAL, funding REAL, volume_24h REAL,
    PRIMARY KEY (market, minute)
  ) WITHOUT ROWID;

  CREATE TABLE IF NOT EXISTS coverage (
    id INTEGER PRIMARY KEY,
    ts INTEGER NOT NULL,
    market TEXT NOT NULL,
    checked INTEGER NOT NULL,
    found INTEGER NOT NULL,
    missing_ids TEXT
  );

  CREATE TABLE IF NOT EXISTS connections (
    id INTEGER PRIMARY KEY,
    ts INTEGER NOT NULL,
    engine TEXT NOT NULL,
    event TEXT NOT NULL,
    detail TEXT
  );

  CREATE TABLE IF NOT EXISTS runtime (
    ts INTEGER PRIMARY KEY,
    rss_mb REAL, heap_mb REAL, cpu_pct REAL,
    ws_msgs INTEGER, ws_bytes INTEGER, trades INTEGER,
    rest_weight INTEGER, db_mb REAL
  );

  -- Deposits and withdrawals, one row per movement, from each account's
  -- ledger. Kept for good: about a million rows over SoDEX's whole history.
  -- The id is built from the ledger entry itself, so re-reading a ledger never
  -- counts a movement twice.
  CREATE TABLE IF NOT EXISTS fund_flows (
    id TEXT PRIMARY KEY,
    account_id INTEGER NOT NULL,
    ts INTEGER NOT NULL,
    direction TEXT NOT NULL,        -- in | out
    route TEXT NOT NULL,            -- custody | bridge
    chain TEXT NOT NULL,
    coin TEXT NOT NULL,
    amount REAL NOT NULL,
    usd REAL                        -- null until a price is found
  ) WITHOUT ROWID;
  CREATE INDEX IF NOT EXISTS fund_flows_ts ON fund_flows (ts);
  CREATE INDEX IF NOT EXISTS fund_flows_account ON fund_flows (account_id, ts);

  -- Every known account, its address (the ledger is looked up by address)
  -- and when its ledger was last read.
  CREATE TABLE IF NOT EXISTS fund_accounts (
    account_id INTEGER PRIMARY KEY,
    address TEXT NOT NULL,
    added_at INTEGER NOT NULL,
    checked_at INTEGER,
    newest_ts INTEGER,
    net_usd REAL NOT NULL DEFAULT 0
  );
  CREATE INDEX IF NOT EXISTS fund_accounts_checked ON fund_accounts (checked_at);

  -- Daily USD price per coin, for valuing non-stablecoin movements.
  CREATE TABLE IF NOT EXISTS fund_prices (
    coin TEXT NOT NULL,
    day TEXT NOT NULL,
    usd REAL,
    PRIMARY KEY (coin, day)
  ) WITHOUT ROWID;

  -- Every trader the position engine knows: size (equity) and track record
  -- (all-time PnL) for grouping, and when its positions were last read.
  CREATE TABLE IF NOT EXISTS pos_accounts (
    account_id INTEGER PRIMARY KEY,
    equity REAL,
    alltime_pnl REAL,
    alltime_volume REAL,
    holds INTEGER NOT NULL DEFAULT 0,
    snapshot_at INTEGER,
    next_at INTEGER,
    swept_at INTEGER
  );
  CREATE INDEX IF NOT EXISTS pos_accounts_next ON pos_accounts (next_at);

  -- Open perps positions as of each account's last snapshot. Replaced whole
  -- per account, so a closed position simply disappears.
  CREATE TABLE IF NOT EXISTS open_positions (
    account_id INTEGER NOT NULL,
    market TEXT NOT NULL,
    pos_side TEXT NOT NULL,
    size REAL NOT NULL,             -- signed: positive long, negative short
    entry REAL NOT NULL,
    leverage REAL,
    liq_price REAL,
    margin_mode TEXT,
    opened_at INTEGER,
    updated_at INTEGER,
    PRIMARY KEY (account_id, market, pos_side)
  ) WITHOUT ROWID;
  CREATE INDEX IF NOT EXISTS open_positions_market ON open_positions (market);

  -- What changed for an account: position opened/added/reduced/closed/
  -- flipped (from snapshot diffs) and deposits/withdrawals (from the ledger).
  -- Feeds Telegram alerts and, later, live feeds on the site.
  CREATE TABLE IF NOT EXISTS account_events (
    id INTEGER PRIMARY KEY,
    account_id INTEGER NOT NULL,
    ts INTEGER NOT NULL,
    kind TEXT NOT NULL,             -- open | add | reduce | close | flip | deposit | withdraw
    market TEXT,
    side TEXT,                      -- LONG | SHORT (after the change; before it for close)
    size_before REAL,
    size_after REAL,
    usd REAL,                       -- size of the change in dollars
    price REAL,
    leverage REAL,
    liquidated INTEGER NOT NULL DEFAULT 0,  -- 1 when a close/reduce happened at the old liquidation price
    detail TEXT
  );
  CREATE INDEX IF NOT EXISTS account_events_account ON account_events (account_id, ts);

  -- Telegram alert subscriptions: a chat follows an account above a size.
  CREATE TABLE IF NOT EXISTS alert_subs (
    chat_id INTEGER NOT NULL,
    account_id INTEGER NOT NULL,
    min_usd REAL NOT NULL DEFAULT 0,
    created_at INTEGER NOT NULL,
    PRIMARY KEY (chat_id, account_id)
  ) WITHOUT ROWID;
  CREATE INDEX IF NOT EXISTS alert_subs_account ON alert_subs (account_id);

  CREATE TABLE IF NOT EXISTS kv (key TEXT PRIMARY KEY, value TEXT);

  CREATE TABLE IF NOT EXISTS cohorts (
    account_id INTEGER PRIMARY KEY,
    cohort TEXT NOT NULL,
    reason TEXT,
    updated_at INTEGER NOT NULL
  );
`);

/** Run fn inside one transaction; SQLite is far faster batched. */
export function tx(fn) {
  db.exec("BEGIN");
  try {
    const out = fn();
    db.exec("COMMIT");
    return out;
  } catch (err) {
    db.exec("ROLLBACK");
    throw err;
  }
}

export const sql = {
  flow: db.prepare(`
    INSERT INTO flow_minute (market, minute, cohort, bought_usd, sold_usd, taker_bought_usd, taker_sold_usd, fills)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT (market, minute, cohort) DO UPDATE SET
      bought_usd = bought_usd + excluded.bought_usd,
      sold_usd = sold_usd + excluded.sold_usd,
      taker_bought_usd = taker_bought_usd + excluded.taker_bought_usd,
      taker_sold_usd = taker_sold_usd + excluded.taker_sold_usd,
      fills = fills + excluded.fills`),
  accountDay: db.prepare(`
    INSERT INTO account_day (day, account_id, market, bought_usd, sold_usd, bought_qty, sold_qty, taker_usd, maker_usd, fills)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT (day, account_id, market) DO UPDATE SET
      bought_usd = bought_usd + excluded.bought_usd,
      sold_usd = sold_usd + excluded.sold_usd,
      bought_qty = bought_qty + excluded.bought_qty,
      sold_qty = sold_qty + excluded.sold_qty,
      taker_usd = taker_usd + excluded.taker_usd,
      maker_usd = maker_usd + excluded.maker_usd,
      fills = fills + excluded.fills`),
  largeTrade: db.prepare(`
    INSERT OR IGNORE INTO large_trades (market, trade_id, ts, side, price, qty, usd, buyer_id, seller_id, taker_cohort, maker_cohort)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`),
  seq: db.prepare(`
    INSERT INTO market_seq (market, engine, first_id, last_id, last_ts, trades) VALUES (?, ?, ?, ?, ?, ?)
    ON CONFLICT (market) DO UPDATE SET last_id = excluded.last_id, last_ts = excluded.last_ts, trades = trades + excluded.trades`),
  gap: db.prepare(`INSERT INTO gaps (market, from_id, to_id, missing, detected_at) VALUES (?, ?, ?, ?, ?)`),
  gapDone: db.prepare(`UPDATE gaps SET backfilled = ?, status = ? WHERE id = ?`),
  ticker: db.prepare(`
    INSERT OR REPLACE INTO ticker_minute (market, minute, last, mark, idx, oi, funding, volume_24h)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)`),
  coverage: db.prepare(`INSERT INTO coverage (ts, market, checked, found, missing_ids) VALUES (?, ?, ?, ?, ?)`),
  connection: db.prepare(`INSERT INTO connections (ts, engine, event, detail) VALUES (?, ?, ?, ?)`),
  runtime: db.prepare(`
    INSERT OR REPLACE INTO runtime (ts, rss_mb, heap_mb, cpu_pct, ws_msgs, ws_bytes, trades, rest_weight, db_mb)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`),
  fundFlow: db.prepare(`
    INSERT OR IGNORE INTO fund_flows (id, account_id, ts, direction, route, chain, coin, amount, usd)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`),
  fundAccount: db.prepare(`
    INSERT INTO fund_accounts (account_id, address, added_at) VALUES (?, ?, ?)
    ON CONFLICT (account_id) DO UPDATE SET address = excluded.address`),
  fundChecked: db.prepare(`
    UPDATE fund_accounts SET checked_at = ?, newest_ts = MAX(COALESCE(newest_ts, 0), ?),
      net_usd = (SELECT COALESCE(SUM(CASE direction WHEN 'in' THEN usd ELSE -usd END), 0) FROM fund_flows WHERE account_id = ?)
    WHERE account_id = ?`),
  event: db.prepare(`
    INSERT INTO account_events (account_id, ts, kind, market, side, size_before, size_after, usd, price, leverage, liquidated, detail)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`),
  cohort: db.prepare(`
    INSERT INTO cohorts (account_id, cohort, reason, updated_at) VALUES (?, ?, ?, ?)
    ON CONFLICT (account_id) DO UPDATE SET cohort = excluded.cohort, reason = excluded.reason, updated_at = excluded.updated_at`),
};

/**
 * Size of the data itself, from the database's pages. The file size also
 * counts the write-ahead log, a temporary file that's folded back in and can
 * be several times larger than the data it holds.
 */
export function dbSizeMb() {
  const pages = db.prepare("PRAGMA page_count").get().page_count;
  const size = db.prepare("PRAGMA page_size").get().page_size;
  const free = db.prepare("PRAGMA freelist_count").get().freelist_count;
  return ((pages - free) * size) / 1e6;
}

export function walSizeMb() {
  try {
    return fs.statSync(config.dbPath + "-wal").size / 1e6;
  } catch {
    return 0;
  }
}
