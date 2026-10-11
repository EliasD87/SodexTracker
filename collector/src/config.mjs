import { fileURLToPath } from "node:url";
import path from "node:path";

/**
 * Everything tunable in one place. Each SoDEX limit gets our own cap at a
 * fifth of SoDEX's per-IP allowance, so the collector can share an IP with a
 * trading bot without crowding it out.
 */

const here = path.dirname(fileURLToPath(import.meta.url));
const MIN = 60_000;

export const config = {
  dbPath: process.env.COLLECTOR_DB ?? path.join(here, "..", "data", "collector.db"),

  gateway: "https://mainnet-gw.sodex.dev/api/v1",
  dataApi: "https://mainnet-data.sodex.dev/api/v1",
  ws: {
    perps: "wss://mainnet-gw.sodex.dev/ws/perps",
    spot: "wss://mainnet-gw.sodex.dev/ws/spot",
  },

  limits: {
    /**
     * REST weight per minute. SoDEX allows 1200 per IP. A fifth by default,
     * for sharing an IP with a trading bot; raise it with COLLECTOR_REST_WEIGHT
     * when the collector has an IP (e.g. its own IPv6) to itself. Backfill
     * after a restart drains at roughly this ÷ 20 gaps a minute.
     */
    restWeightPerMinute: Math.min(1000, Number(process.env.COLLECTOR_REST_WEIGHT ?? 240)),
    /** New WebSocket connections per minute. SoDEX allows 30 per IP. */
    newConnectionsPerMinute: 6,
    requestTimeoutMs: 10_000,
  },

  stream: {
    /**
     * One market's miniTicker serves as the heartbeat: it arrives at least
     * every few seconds at ~6 KB a minute. allTicker did the same job but
     * re-sent every market each second, ~680 KB a minute per engine.
     */
    heartbeat: { perps: "BTC-USD", spot: "WSOSO_vUSDC" },
    /** This long without any message means the socket is dead. */
    idleTimeoutMs: 30_000,
    backoffMinMs: 2_000,
    backoffMaxMs: 5 * MIN,
  },

  retention: {
    /** Minute-level flow and tickers are kept this long, then rolled up hourly. */
    minuteDetailMs: 2 * 24 * 60 * MIN,
    /** The collector's own diagnostics (stats, checks, connection log). */
    diagnosticsMs: 14 * 24 * 60 * MIN,
  },

  /** Trades at or above this are kept in full. Everything else is summarised. */
  largeTradeUsd: 50_000,

  intervals: {
    /** How much attributed data a crash can cost: what's still in memory. */
    flushMs: 15_000,
    tickersMs: 1 * MIN,
    verifyMs: 2 * MIN,
    statsMs: 1 * MIN,
    cohortsMs: 15 * MIN,
    retentionMs: 30 * MIN,
    smartMoneyMs: 6 * 60 * MIN,
    symbolsMs: 30 * MIN,
  },

  verify: {
    /** Markets sampled per completeness check; each costs 20 REST weight. */
    marketsPerRound: 4,
    sampleSize: 100,
  },

  /**
   * Test switch, off by default: cut one live connection this often, to prove
   * reconnects and backfill keep the numbers exact. COLLECTOR_CHAOS_MS=180000
   */
  chaosEveryMs: Number(process.env.COLLECTOR_CHAOS_MS ?? 0),

  /**
   * Deposits and withdrawals, read from each account's ledger on SoDEX's own
   * website API (the one behind sodex.com's transfer history). Off unless
   * COLLECTOR_FUNDS=1: the first run reads every account once, which takes a
   * day or two, so it belongs on the server rather than a laptop.
   */
  funds: {
    enabled: process.env.COLLECTOR_FUNDS === "1",
    ledgerUrl: "https://alpha-biz.sodex.dev/biz/mirror/account_flow",
    /** Ledger reads per second. A separate host from the trading API, so this never touches the REST weight. */
    requestsPerSecond: Number(process.env.COLLECTOR_FUNDS_RPS ?? 2),
    /** SoDEX's account-ID-to-address lookup, a thousand IDs per call. */
    addressUrl: "https://sodex.dev/mainnet/chain/users/addresses",
    addressPagesPerSecond: 2,
    /** Accounts that traded today are re-read this often. */
    activeRecheckMs: 2 * 60 * MIN,
    /** Accounts still holding money are re-read this often, to catch withdrawals by people who stopped trading. */
    holdingRecheckMs: 24 * 60 * MIN,
    /** Everyone else, as a safety net. */
    idleRecheckMs: 7 * 24 * 60 * MIN,
    /** New accounts are added to the address book this often. */
    newAccountsMs: 30 * MIN,
    /** Treat an account as still holding money above this many dollars of net deposits. */
    holdingMinUsd: 1,
  },

  /**
   * Open positions for every account that holds any, so the site can show
   * group positioning, liquidation clusters and positions at risk. Off unless
   * COLLECTOR_POSITIONS=1. Finding the holders the first time sweeps every
   * trader's overview (half a day), so this belongs on the server too.
   */
  positions: {
    enabled: process.env.COLLECTOR_POSITIONS === "1",
    /** REST weight per minute for state snapshots (5 each), inside the overall cap above. */
    weightPerMinute: Number(process.env.COLLECTOR_POSITIONS_WEIGHT ?? 120),
    /** Overview and leaderboard reads per second, on the data host (no REST weight). */
    dataPerSecond: 3,
    /** After a fill, wait this long for the account to finish trading before re-reading it. */
    settleMs: 20_000,
    /** Never re-read one account more often than this. */
    minGapMs: 60_000,
    /** Re-read positions by size: bigger moves matter sooner. */
    refresh: [
      { minUsd: 1_000_000, everyMs: 10 * MIN },
      { minUsd: 100_000, everyMs: 60 * MIN },
      { minUsd: 0, everyMs: 6 * 60 * MIN },
    ],
    /** Overview sweep (finds holders who haven't traded since we started) repeats this often per account. */
    sweepEveryMs: 7 * 24 * 60 * MIN,
    /** Leaderboard (all-time PnL for every trader) is re-read this often. */
    leaderboardEveryMs: 24 * 60 * MIN,
  },

  /**
   * Telegram alerts for followed traders. Off unless TELEGRAM_BOT_TOKEN is set
   * (from @BotFather). Events come from the position engine and the deposits
   * job, so those should run too.
   */
  alerts: {
    enabled: !!process.env.TELEGRAM_BOT_TOKEN,
    token: process.env.TELEGRAM_BOT_TOKEN ?? "",
    /** The site's address, for links to trader pages in alerts. */
    siteUrl: (process.env.SITE_URL ?? "").replace(/\/$/, ""),
    maxFollows: 20,
  },

  /**
   * Trade IDs remembered per market for completeness checks. Checks compare
   * SoDEX's latest 100 trades, so 1,000 covers them with room to spare; 5,000
   * cost ~5× the memory for nothing.
   */
  recentIdsPerMarket: 1_000,

  cohorts: {
    smartMoneyCount: 100,
    // A market maker trades constantly, mostly passively, on both sides of
    // several markets, and ends up close to flat.
    mm: { minFills: 500, minMakerShare: 0.6, minMarkets: 3, maxNetRatio: 0.15 },
    // A whale trades big: a large average fill over a handful of fills.
    whale: { minAvgFillUsd: 10_000, minFills: 3 },
  },
};
