import { config } from "./config.mjs";
import { db, sql, tx } from "./db.mjs";
import { gw } from "./gateway.mjs";
import { log } from "./log.mjs";
import { allMarkets } from "./markets.mjs";
import { guardedJson, Outage } from "./health.mjs";

/**
 * Money in and out of SoDEX, from each account's ledger: every deposit and
 * withdrawal with its time, amount, coin and chain. Balances would mix these
 * up with profit, losses, funding and price moves; the ledger doesn't.
 *
 * SoDEX publishes no exchange-wide figure, so every account's ledger is read:
 *   1. once, for everything since launch (the first run, a day or two);
 *   2. then kept current by re-reading, in priority order, accounts that
 *      traded today (every 2 hours), accounts still holding money (daily, to
 *      catch withdrawals by people who stopped trading) and everyone else
 *      (weekly, as a safety net).
 * Ledgers are looked up by address; SoDEX's own lookup maps account IDs to
 * addresses, for every account, including ones that never traded. Addresses and account IDs stay in this database: the site only
 * ever gets totals.
 */

const DAY = 86_400_000;
const PAGE = 100; // the ledger's own page cap
const STABLE = new Set(["USDC", "USDT", "USDE", "DAI", "FDUSD", "PYUSD", "USD1", "VUSDC", "VUSDT"]);

export const fundStats = { reads: 0, failures: 0, flows: 0, skipped: 0, unknownTypes: new Set() };

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** Spaces calls evenly at `perSecond`, shared by everything using the same pacer. */
function pacer(perSecond) {
  let next = 0;
  return async () => {
    const now = Date.now();
    const at = Math.max(now, next);
    next = at + 1000 / perSecond;
    if (at > now) await sleep(at - now);
  };
}
const ledgerPace = pacer(config.funds.requestsPerSecond);
const addressPace = pacer(config.funds.addressPagesPerSecond);
let pausedUntil = 0;

async function ledgerPage(address, start) {
  await ledgerPace();
  if (Date.now() < pausedUntil) await sleep(pausedUntil - Date.now());
  fundStats.reads++;
  // Outages (maintenance, 5xx, no answer) pause the whole lane via health.mjs.
  const { res, json } = await guardedJson(
    config.funds.ledgerUrl,
    {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json", Origin: "https://sodex.com", Referer: "https://sodex.com/" },
      body: JSON.stringify({ account: address, start, limit: PAGE }),
    },
    config.limits.requestTimeoutMs,
  );
  if (res.status === 429) {
    // SoDEX asking us to slow down: back off the whole lane for a minute.
    pausedUntil = Date.now() + 60_000;
    throw new Error("HTTP 429");
  }
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  if (json?.code !== "0" && json?.code !== 0) throw new Error(json?.message || "ledger error");
  return { rows: json.data?.accountFlows ?? [], total: json.data?.total ?? 0 };
}

/* ── Prices ─────────────────────────────────────────────────────────────── */

const priceCache = new Map();
const priceRow = db.prepare("SELECT usd FROM fund_prices WHERE coin = ? AND day = ?");
const priceSave = db.prepare("INSERT OR REPLACE INTO fund_prices (coin, day, usd) VALUES (?, ?, ?)");

/** The market that prices a coin directly: its spot pair, else its perp. */
function directMarket(coin) {
  const bare = coin.replace(/\./g, "");
  const markets = allMarkets();
  const spot = markets.find((m) => m.engine === "spot" && (m.api === `v${bare}_vUSDC` || m.api === `W${bare}_vUSDC`));
  if (spot) return spot;
  return markets.find((m) => m.engine === "perps" && (m.api === `${coin}-USD` || m.api === `1000${coin}-USD`)) ?? null;
}

/**
 * The market whose price values a coin. Wrappers with no market of their own
 * are valued as what they wrap: staked tokens (sMAG7.ssi, sSOSO) as the
 * token, tokenised stocks (TSLAx) as the stock.
 */
function marketFor(coin) {
  return (
    directMarket(coin) ??
    (/^s[A-Z0-9]/.test(coin) ? directMarket(coin.slice(1)) : null) ??
    (/^[A-Z0-9]+x$/.test(coin) ? directMarket(coin.slice(0, -1)) : null)
  );
}

/** The coin's USD price on the day of `ts` (that day's close; today's latest). Null if SoDEX has no market for it. */
async function priceOf(coin, ts) {
  const c = coin.toUpperCase();
  if (STABLE.has(c)) return 1;
  const day = new Date(ts).toISOString().slice(0, 10);
  const key = `${coin}|${day}`;
  if (priceCache.has(key)) return priceCache.get(key);
  const stored = priceRow.get(coin, day);
  if (stored) {
    priceCache.set(key, stored.usd);
    return stored.usd;
  }
  const m = marketFor(coin);
  let usd = null;
  if (m) {
    try {
      const candles = await gw(`/${m.engine}/markets/${encodeURIComponent(m.api)}/klines?interval=1d&limit=1&endTime=${ts}`, 2);
      const close = Number(candles?.[0]?.c);
      // 1000PEPE-style perps quote a thousand coins.
      if (Number.isFinite(close) && close > 0) usd = m.api.startsWith("1000") ? close / 1000 : close;
    } catch (err) {
      log.warn("funds", `no price for ${coin} on ${day}: ${err.message}`);
      return null; // not cached: try again next time
    }
  }
  // Only finished days are final; today's price is refreshed on later reads.
  if (day !== new Date().toISOString().slice(0, 10)) priceSave.run(coin, day, usd);
  priceCache.set(key, usd);
  return usd;
}

/* ── Ledger entries ─────────────────────────────────────────────────────── */

/** One ledger entry as a row, or null for anything that isn't a completed deposit or withdrawal. */
async function toFlow(e, accountId) {
  if (e.status !== "Success") {
    fundStats.skipped++;
    return null;
  }
  const direction = /Deposit/.test(e.type) ? "in" : /Withdraw/.test(e.type) ? "out" : null;
  if (!direction) {
    fundStats.unknownTypes.add(e.type);
    return null;
  }
  const amount = Number(e.amount) / 10 ** Number(e.decimals ?? 0);
  if (!(amount > 0)) return null;
  const ts = Number(e.statusTime || e.stmp) * 1000;
  const coin = e.coin || e.displaySymbol || "?";
  const price = await priceOf(coin, ts);
  return [
    [e.type, e.txHash || e.originTxHash, String(e.account).toLowerCase(), e.n ?? "", e.amount].join(":"),
    accountId,
    ts,
    direction,
    /^Bridge/.test(e.type) ? "bridge" : "custody",
    e.chain || "?", // SoDEX's own code, e.g. ARBITRUM_ETH; the site names it
    coin,
    amount,
    price == null ? null : amount * price,
  ];
}

/**
 * Read one account's ledger, newest first, until we reach what we already
 * have (with two days of overlap, for entries that completed late).
 */
export async function readAccount({ account_id: accountId, address, newest_ts: newestTs }) {
  const stopBefore = newestTs ? newestTs - 2 * DAY : 0;
  const rows = [];
  let newest = 0;
  for (let start = 0; ; start += PAGE) {
    const { rows: page, total } = await ledgerPage(address, start);
    for (const e of page) {
      const flow = await toFlow(e, accountId);
      if (flow) {
        rows.push(flow);
        newest = Math.max(newest, flow[2]);
      }
    }
    const oldest = page.length ? Number(page.at(-1).stmp) * 1000 : 0;
    if (page.length < PAGE || start + PAGE >= total || oldest < stopBefore) break;
  }
  let added = 0;
  // New movements become events, but only on re-reads and only recent ones:
  // the first read of a ledger is history, not news.
  const recentFrom = Date.now() - DAY;
  tx(() => {
    for (const r of rows) {
      const inserted = sql.fundFlow.run(...r).changes;
      added += inserted;
      if (inserted && newestTs && r[2] >= recentFrom) {
        const chain = String(r[5]).split("_")[0].toLowerCase().replace(/^\w/, (c) => c.toUpperCase());
        sql.event.run(accountId, r[2], r[3] === "in" ? "deposit" : "withdraw", null, null, null, null, r[8], null, null, 0, `in ${r[6]} via ${chain}`);
      }
    }
    sql.fundChecked.run(Date.now(), newest || null, accountId, accountId);
  });
  fundStats.flows += added;
  return added;
}

/* ── Who to read next ───────────────────────────────────────────────────── */

const due = {
  active: db.prepare(`
    SELECT f.account_id, f.address, f.newest_ts FROM fund_accounts f
    WHERE f.checked_at < ? AND f.account_id IN (SELECT account_id FROM account_day WHERE day >= ?)
    ORDER BY f.checked_at LIMIT 200`),
  // Never read: today's traders first, then newest accounts first.
  unread: db.prepare(`
    SELECT account_id, address, newest_ts FROM fund_accounts WHERE checked_at IS NULL
    ORDER BY account_id IN (SELECT account_id FROM account_day WHERE day >= ?) DESC, account_id DESC LIMIT 200`),
  holding: db.prepare(`
    SELECT account_id, address, newest_ts FROM fund_accounts
    WHERE checked_at < ? AND net_usd > ? ORDER BY checked_at LIMIT 200`),
  idle: db.prepare(`SELECT account_id, address, newest_ts FROM fund_accounts WHERE checked_at < ? ORDER BY checked_at LIMIT 200`),
};

const markSkipped = db.prepare("UPDATE fund_accounts SET checked_at = ? WHERE account_id = ?");

let queue = [];
let queueKind = "";

function refill() {
  const now = Date.now();
  const today = new Date(now).toISOString().slice(0, 10);
  const f = config.funds;
  for (const [kind, rows] of [
    ["active", () => due.active.all(now - f.activeRecheckMs, today)],
    ["catch-up", () => due.unread.all(today)],
    ["holding", () => due.holding.all(now - f.holdingRecheckMs, f.holdingMinUsd)],
    ["idle", () => due.idle.all(now - f.idleRecheckMs)],
  ]) {
    queue = rows();
    if (queue.length) {
      queueKind = kind;
      return true;
    }
  }
  return false;
}

/** Read the next account's ledger. False when nothing is due. */
export async function processNextAccount() {
  if (!queue.length && !refill()) return false;
  const acct = queue.shift();
  try {
    await readAccount(acct);
  } catch (err) {
    fundStats.failures++;
    log.warn("funds", `${queueKind} ledger read failed: ${err.message}`);
    // An outage leaves the account unread, so it comes round again once SoDEX
    // answers. A proper refusal skips it until its next scheduled read, so one
    // odd account can't block the queue.
    if (!(err instanceof Outage)) markSkipped.run(Date.now(), acct.account_id);
    await sleep(2_000);
  }
  return true;
}

/* ── Address book ───────────────────────────────────────────────────────── */

const maxKnown = db.prepare("SELECT COALESCE(MAX(account_id), 0) n FROM fund_accounts");

/**
 * Map account IDs to addresses with SoDEX's own lookup, a thousand at a time.
 * IDs are handed out in order, so this walks upward from `from` (default:
 * just past the highest ID known) until three batches in a row past the last
 * account found come back empty. The whole exchange takes a couple of
 * minutes; after that each run only picks up new accounts.
 */
export async function refreshAddresses({ from } = {}) {
  const BATCH = 1000;
  let start = from ?? maxKnown.get().n + 1;
  let highest = maxKnown.get().n;
  let added = 0;
  let empty = 0;
  // Stop three empty batches past the highest account; the ceiling only
  // guards against a lookup that never answers with anything.
  while ((empty < 3 || start <= highest || highest === 0) && start < 5_000_000) {
    await addressPace();
    const ids = Array.from({ length: BATCH }, (_, i) => start + i);
    let rows;
    try {
      const { res, json } = await guardedJson(
        config.funds.addressUrl,
        { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ userIds: ids }) },
        config.limits.requestTimeoutMs,
      );
      if (json?.code !== 0) throw new Error(json?.message ?? `HTTP ${res.status}`);
      rows = json.data ?? [];
    } catch (err) {
      log.warn("funds", `address lookup from ${start} failed: ${err.message}; will retry next run`);
      break;
    }
    const now = Date.now();
    tx(() => {
      for (const r of rows) {
        const id = Number(r.userId);
        if (r.address && id > 0) {
          added += sql.fundAccount.run(id, r.address.toLowerCase(), now).changes;
          highest = Math.max(highest, id);
        }
      }
    });
    empty = rows.length ? 0 : empty + 1;
    start += BATCH;
  }
  if (added) log.info("funds", `address book: ${added} account(s) added, highest ID ${highest}`);
  return added;
}

/* ── Upkeep ─────────────────────────────────────────────────────────────── */

const unpriced = db.prepare("SELECT id, coin, ts, amount FROM fund_flows WHERE usd IS NULL LIMIT 500");
const setUsd = db.prepare("UPDATE fund_flows SET usd = ? WHERE id = ?");

/** Value movements whose price wasn't available when they were read. */
export async function repriceMissing() {
  let fixed = 0;
  for (const r of unpriced.all()) {
    const p = await priceOf(r.coin, r.ts);
    if (p != null) {
      setUsd.run(r.amount * p, r.id);
      fixed++;
    }
  }
  if (fixed) log.info("funds", `valued ${fixed} movement(s) that had no price`);
}

export function fundsSummary() {
  const a = db.prepare("SELECT COUNT(*) n, COUNT(checked_at) read FROM fund_accounts").get();
  const unknown = fundStats.unknownTypes.size ? ` · unknown types: ${[...fundStats.unknownTypes].join(", ")}` : "";
  return `ledgers read ${a.read}/${a.n} · ${fundStats.flows} new movement(s) · ${fundStats.failures} failure(s)${unknown}`;
}
