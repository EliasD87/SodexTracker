import type { DatabaseSync } from "node:sqlite";
import fs from "node:fs";
import { span, timeAgo } from "@/lib/analyticsFormat";
import path from "node:path";
import { nickname } from "@/lib/nickname";

/**
 * Read side of the collector. Locally it reads the collector's SQLite file
 * directly; once the collector moves to the VPS, the same functions read
 * Supabase instead and the pages don't change.
 *
 * Privacy: account IDs never leave this module. Everything returned is an
 * aggregate or a group label.
 */

const DB_PATH = process.env.COLLECTOR_DB ?? path.join(process.cwd(), "collector", "data", "collector.db");
const HOUR = 3_600_000;

let handle: DatabaseSync | null = null;
/** The collector database, read-only, or null where there is none. */
export function db(): DatabaseSync | null {
  if (handle) return handle;
  if (!fs.existsSync(DB_PATH)) return null;
  // Loaded lazily: on a runtime without built-in SQLite this returns
  // undefined, and the pages fall back to their "coming" panels instead of the
  // whole route failing at import.
  const sqlite = process.getBuiltinModule?.("node:sqlite") as typeof import("node:sqlite") | undefined;
  if (!sqlite) return null;
  // Read-only, alongside the collector writing in WAL mode.
  handle = new sqlite.DatabaseSync(DB_PATH, { readOnly: true });
  return handle;
}

export type Cohort = "mm" | "smart" | "whale" | "retail" | "unattributed";
export const COHORT_LABEL: Record<Cohort, string> = {
  mm: "Market makers",
  smart: "Smart money",
  whale: "Big traders",
  retail: "Retail",
  unattributed: "Unattributed",
};

export interface LiveHealth {
  /** First and last minute with data, ms. */
  since: number;
  updatedAt: number;
  /** Share of SoDEX's own recent trades we captured live. */
  coverage: number | null;
  coverageSamples: number;
  gaps: number;
  tradesMissed: number;
  tradesRecovered: number;
}

export interface CohortFlow {
  cohort: Cohort;
  /** Volume with this group on one side, counting each side once. */
  volume: number;
  /** Share of all trading this group accounts for, both sides counted. */
  share: number;
  /** Bought minus sold: which way the group moved its exposure. */
  net: number;
  /** Aggressive buying minus aggressive selling: conviction. */
  takerNet: number;
}

export interface FlowPoint {
  t: number;
  /** Taker net flow per group in this bucket. */
  net: Partial<Record<Cohort, number>>;
}

export interface LargeTrade {
  market: string;
  ts: number;
  side: "BUY" | "SELL";
  usd: number;
  price: number;
  /** Group of whoever crossed the spread. No account, ever. */
  taker: Cohort;
  maker: Cohort;
}

export interface HeatCell {
  market: string;
  hour: number;
  takerNet: number;
  volume: number;
}

export interface LiveFlow {
  available: true;
  hours: number;
  /**
   * Where the data actually starts. Later than the window's start while the
   * collector has been running for less than the window, so the page can say
   * "since 14:42" instead of implying a full 24 hours.
   */
  from: number;
  market: string | null;
  health: LiveHealth;
  totalVolume: number;
  cohorts: CohortFlow[];
  series: FlowPoint[];
  bucketMinutes: number;
  large: LargeTrade[];
  heatmap: { markets: string[]; hours: number[]; cells: HeatCell[] } | null;
}

export type LiveResult = LiveFlow | { available: false; reason: string };

/**
 * Flow from both tables: minute detail for the last 48 hours plus the hourly
 * roll-up of everything older. The collector moves rows between them in one
 * transaction, so a period is in exactly one. An hourly row carries its hour's
 * start as its "minute".
 */
let flowsSql: string | null = null;
function flows(d: DatabaseSync): string {
  if (flowsSql) return flowsSql;
  const hasHourly = d.prepare("SELECT 1 FROM sqlite_schema WHERE type = 'table' AND name = 'flow_hour'").get();
  // Not remembered until the table exists: an older collector creates it on
  // its next start, and the site must pick it up without a restart of its own.
  if (!hasHourly) return "flow_minute";
  const cols = "cohort, bought_usd, sold_usd, taker_bought_usd, taker_sold_usd, fills";
  flowsSql = `(SELECT market, minute, ${cols} FROM flow_minute UNION ALL SELECT market, hour AS minute, ${cols} FROM flow_hour)`;
  return flowsSql;
}

function health(d: DatabaseSync): LiveHealth | null {
  const span = d.prepare(`SELECT MIN(minute) a, MAX(minute) b FROM ${flows(d)} f`).get() as { a: number | null; b: number | null };
  if (span.a == null || span.b == null) return null;
  const cov = d.prepare("SELECT SUM(checked) c, SUM(found) f, COUNT(*) n FROM coverage").get() as { c: number | null; f: number | null; n: number };
  const gaps = d.prepare("SELECT COUNT(*) n, COALESCE(SUM(missing), 0) m, COALESCE(SUM(backfilled), 0) b FROM gaps").get() as {
    n: number;
    m: number;
    b: number;
  };
  return {
    since: span.a,
    updatedAt: span.b,
    coverage: cov.c ? (cov.f ?? 0) / cov.c : null,
    coverageSamples: cov.n,
    gaps: gaps.n,
    tradesMissed: gaps.m,
    tradesRecovered: gaps.b,
  };
}

/** Flow over the last `hours`, optionally for one market. */
export function liveFlow(hours: number, market: string | null): LiveResult {
  const d = db();
  if (!d) return { available: false, reason: "The live collector isn't running here yet." };
  const h = health(d);
  if (!h) return { available: false, reason: "The live collector hasn't recorded any trades yet." };

  const from = h.updatedAt - hours * HOUR;
  const where = market ? "minute >= ? AND market = ?" : "minute >= ?";
  const args = market ? [from, market] : [from];

  const rows = d
    .prepare(
      `SELECT cohort, SUM(bought_usd) b, SUM(sold_usd) s, SUM(taker_bought_usd) tb, SUM(taker_sold_usd) ts
       FROM ${flows(d)} f WHERE ${where} GROUP BY cohort`,
    )
    .all(...args) as { cohort: Cohort; b: number; s: number; tb: number; ts: number }[];
  const totalVolume = rows.reduce((a, r) => a + r.b, 0);
  const cohorts = rows
    .map((r) => ({
      cohort: r.cohort,
      volume: (r.b + r.s) / 2,
      share: totalVolume ? (r.b + r.s) / (2 * totalVolume) : 0,
      net: r.b - r.s,
      takerNet: r.tb - r.ts,
    }))
    .sort((a, b) => b.volume - a.volume);

  // Buckets sized so any window draws ~48 points.
  const bucketMinutes = Math.max(1, Math.round((hours * 60) / 48));
  const bucketMs = bucketMinutes * 60_000;
  const seriesRows = d
    .prepare(
      `SELECT (minute / ${bucketMs}) * ${bucketMs} AS t, cohort, SUM(taker_bought_usd - taker_sold_usd) net
       FROM ${flows(d)} f WHERE ${where} GROUP BY t, cohort ORDER BY t`,
    )
    .all(...args) as { t: number; cohort: Cohort; net: number }[];
  const byT = new Map<number, FlowPoint>();
  for (const r of seriesRows) {
    const p = byT.get(r.t) ?? { t: r.t, net: {} };
    p.net[r.cohort] = r.net;
    byT.set(r.t, p);
  }

  const large = d
    .prepare(
      `SELECT market, ts, side, usd, price, taker_cohort taker, maker_cohort maker
       FROM large_trades WHERE ts >= ? ${market ? "AND market = ?" : ""} ORDER BY ts DESC LIMIT 40`,
    )
    .all(...args) as unknown as LargeTrade[];

  let heatmap: LiveFlow["heatmap"] = null;
  if (!market) {
    const top = (
      d
        .prepare(`SELECT market FROM ${flows(d)} f WHERE minute >= ? GROUP BY market ORDER BY SUM(bought_usd) DESC LIMIT 12`)
        .all(from) as { market: string }[]
    ).map((r) => r.market);
    if (top.length) {
      const cells = d
        .prepare(
          `SELECT market, (minute / ${HOUR}) * ${HOUR} AS hour,
                  SUM(taker_bought_usd - taker_sold_usd) takerNet, SUM(bought_usd) volume
           FROM ${flows(d)} f WHERE minute >= ? AND market IN (${top.map(() => "?").join(",")})
           GROUP BY market, hour`,
        )
        .all(from, ...top) as unknown as HeatCell[];
      const hoursList = [...new Set(cells.map((c) => c.hour))].sort((a, b) => a - b);
      heatmap = { markets: top, hours: hoursList, cells };
    }
  }

  return {
    available: true,
    hours,
    from: Math.max(from, h.since),
    market,
    health: h,
    totalVolume,
    cohorts,
    series: [...byT.values()],
    bucketMinutes,
    large,
    heatmap,
  };
}

export interface LiveTraders {
  available: true;
  health: LiveHealth;
  days: { day: string; traders: number; byCohort: Partial<Record<Cohort, number>> }[];
}

/** Traders per UTC day, each counted once across every market. */
export function liveTraders(): LiveTraders | { available: false; reason: string } {
  const d = db();
  if (!d) return { available: false, reason: "The live collector isn't running here yet." };
  const h = health(d);
  if (!h) return { available: false, reason: "The live collector hasn't recorded any trades yet." };
  const totals = d.prepare("SELECT day, COUNT(DISTINCT account_id) n FROM account_day GROUP BY day ORDER BY day").all() as {
    day: string;
    n: number;
  }[];
  const split = d
    .prepare(
      // Grouped by the expression, not the alias: SQLite resolves "cohort" to
      // the table's column, which splits unclassified accounts off on their own.
      `SELECT a.day, COALESCE(c.cohort, 'retail') cohort, COUNT(DISTINCT a.account_id) n
       FROM account_day a LEFT JOIN cohorts c ON c.account_id = a.account_id
       GROUP BY a.day, COALESCE(c.cohort, 'retail')`,
    )
    .all() as { day: string; cohort: Cohort; n: number }[];
  return {
    available: true,
    health: h,
    days: totals.map((t) => ({
      day: t.day,
      traders: t.n,
      byCohort: Object.fromEntries(split.filter((s) => s.day === t.day).map((s) => [s.cohort, s.n])),
    })),
  };
}

export interface Concentration {
  available: true;
  market: string;
  /** Days of live data the figures cover (up to 30). */
  days: number;
  accounts: number;
  top5Share: number;
  top10Share: number;
  top: { name: string; share: number; makerShare: number | null }[];
}

/**
 * How concentrated a market's trading is: the share of its volume from its
 * busiest accounts over the last 30 days, each side of a trade counted for
 * its own account. Nicknames only.
 */
export function volumeConcentration(market: string): Concentration | { available: false; reason: string } {
  const d = db();
  if (!d) return { available: false, reason: "The collector isn't running here yet." };
  const since = new Date(Date.now() - 30 * 86_400_000).toISOString().slice(0, 10);
  const rows = d
    .prepare(`
      SELECT account_id id, SUM(bought_usd + sold_usd) v, SUM(maker_usd) m, SUM(taker_usd) t
      FROM account_day WHERE market = ? AND day >= ? GROUP BY account_id ORDER BY v DESC`)
    .all(market, since) as { id: number; v: number; m: number; t: number }[];
  if (!rows.length) return { available: false, reason: `No ${market} trades recorded by the live collector in the last 30 days.` };
  const days = (d.prepare("SELECT COUNT(DISTINCT day) n FROM account_day WHERE market = ? AND day >= ?").get(market, since) as { n: number }).n;
  const total = rows.reduce((a, r) => a + r.v, 0) || 1;
  const share = (n: number) => rows.slice(0, n).reduce((a, r) => a + r.v, 0) / total;
  return {
    available: true,
    market,
    days,
    accounts: rows.length,
    top5Share: share(5),
    top10Share: share(10),
    top: rows.slice(0, 5).map((r) => ({ name: nickname(r.id), share: r.v / total, makerShare: r.m + r.t > 0 ? r.m / (r.m + r.t) : null })),
  };
}

export interface TraderInsights {
  available: true;
  /** Days of live trading data the collector holds. */
  daysOfData: number;
  firstDay: string;
  lastDay: string;
  /**
   * Weekly cohorts of new traders (first seen that week, in our data) and the
   * share who traded again at least 7 and 30 days after their first trade.
   * Null where not enough time has passed to know.
   */
  retention: { week: string; traders: number; after7: number | null; after30: number | null }[];
  /** Each trader group's share of volume over the last 7 days, both sides counted. */
  groups: { cohort: Cohort; label: string; share: number; accounts: number }[];
  /** Busiest accounts over the last 7 days, by nickname. */
  mostActive: { name: string; volume: number; markets: number; makerShare: number | null }[];
}

export function traderInsights(): TraderInsights | { available: false; reason: string } {
  const d = db();
  if (!d) return { available: false, reason: "The collector isn't running here yet." };
  const span = d.prepare("SELECT MIN(day) a, MAX(day) b, COUNT(DISTINCT day) n FROM account_day").get() as { a: string | null; b: string | null; n: number };
  if (!span.a || !span.b) return { available: false, reason: "The live collector hasn't recorded any trades yet." };
  const DAYMS = 86_400_000;
  const dayNum = (s: string) => Math.floor(Date.parse(`${s}T00:00:00Z`) / DAYMS);
  const last = dayNum(span.b);

  // Retention: each account's first day, then whether it traded again 7+ and 30+ days later.
  const firsts = d
    .prepare(`
      SELECT a.account_id id, a.first,
             MAX(CASE WHEN julianday(x.day) - julianday(a.first) >= 7 THEN 1 ELSE 0 END) r7,
             MAX(CASE WHEN julianday(x.day) - julianday(a.first) >= 30 THEN 1 ELSE 0 END) r30
      FROM (SELECT account_id, MIN(day) first FROM account_day GROUP BY account_id) a
      JOIN account_day x ON x.account_id = a.account_id
      GROUP BY a.account_id`)
    .all() as { id: number; first: string; r7: number; r30: number }[];
  const weeks = new Map<number, { n: number; r7: number; r30: number; start: number }>();
  for (const f of firsts) {
    const n = dayNum(f.first);
    const wk = Math.floor((n + 3) / 7); // weeks starting Monday
    const e = weeks.get(wk) ?? { n: 0, r7: 0, r30: 0, start: wk * 7 - 3 };
    e.n++;
    e.r7 += f.r7;
    e.r30 += f.r30;
    weeks.set(wk, e);
  }
  const retention = [...weeks.entries()]
    .sort((a, b) => a[0] - b[0])
    .slice(-12)
    .map(([, e]) => ({
      week: new Date(e.start * DAYMS).toISOString().slice(0, 10),
      traders: e.n,
      // Only once every account in the week has had the full gap to come back.
      after7: last - (e.start + 6) >= 7 ? e.r7 / e.n : null,
      after30: last - (e.start + 6) >= 30 ? e.r30 / e.n : null,
    }));

  // Groups over the last 7 days.
  const since = new Date(Date.now() - 7 * DAYMS).toISOString().slice(0, 10);
  const gRows = d
    .prepare(`
      SELECT COALESCE(c.cohort, 'retail') cohort, SUM(a.bought_usd + a.sold_usd) v, COUNT(DISTINCT a.account_id) n
      FROM account_day a LEFT JOIN cohorts c ON c.account_id = a.account_id
      WHERE a.day >= ? GROUP BY COALESCE(c.cohort, 'retail') ORDER BY v DESC`)
    .all(since) as { cohort: Cohort; v: number; n: number }[];
  const gTotal = gRows.reduce((s, r) => s + r.v, 0) || 1;

  const active = d
    .prepare(`
      SELECT account_id id, SUM(bought_usd + sold_usd) v, COUNT(DISTINCT market) m, SUM(maker_usd) mk, SUM(taker_usd) tk
      FROM account_day WHERE day >= ? GROUP BY account_id ORDER BY v DESC LIMIT 8`)
    .all(since) as { id: number; v: number; m: number; mk: number; tk: number }[];

  return {
    available: true,
    daysOfData: span.n,
    firstDay: span.a,
    lastDay: span.b,
    retention,
    groups: gRows.map((r) => ({ cohort: r.cohort, label: COHORT_LABEL[r.cohort] ?? r.cohort, share: r.v / gTotal, accounts: r.n })),
    // An account's volume is everything it bought plus everything it sold, as SoDEX counts it.
    mostActive: active.map((r) => ({ name: nickname(r.id), volume: r.v, markets: r.m, makerShare: r.mk + r.tk > 0 ? r.mk / (r.mk + r.tk) : null })),
  };
}

export interface CollectorHealth {
  available: true;
  /** The collector's last once-a-minute stats line. */
  heartbeat: number | null;
  lastTrade: number | null;
  lastSnapshot: number | null;
  lastLedgerRead: number | null;
  /** SoDEX services the collector has paused calls to (see collector/src/health.mjs). */
  upstream: { host: string; since: number; retryAt: number; error: string }[];
}

export interface HealthStatus {
  state: "ok" | "degraded" | "paused" | "offline";
  /** When the trouble started, if any. */
  since: number | null;
  message: string | null;
}

const has = (d: DatabaseSync, t: string) => !!d.prepare("SELECT 1 FROM sqlite_schema WHERE type = 'table' AND name = ?").get(t);
const maxOf = (d: DatabaseSync, t: string, col: string) =>
  has(d, t) ? ((d.prepare(`SELECT MAX(${col}) v FROM ${t}`).get() as { v: number | null }).v ?? null) : null;

/** How alive the collector and its SoDEX connections are. */
export function collectorHealth(): CollectorHealth | { available: false; reason: string } {
  const d = db();
  if (!d) return { available: false, reason: "The collector isn't running here yet." };
  const upstream = has(d, "kv")
    ? (d.prepare("SELECT key, value FROM kv WHERE key LIKE 'upstream:%'").all() as { key: string; value: string }[]).map((r) => ({
        host: r.key.slice("upstream:".length),
        ...(JSON.parse(r.value) as { since: number; retryAt: number; error: string }),
      }))
    : [];
  return {
    available: true,
    heartbeat: maxOf(d, "runtime", "ts"),
    lastTrade: maxOf(d, "market_seq", "last_ts"),
    lastSnapshot: maxOf(d, "pos_accounts", "snapshot_at"),
    lastLedgerRead: maxOf(d, "fund_accounts", "checked_at"),
    upstream,
  };
}

const SERVICE: Record<string, string> = {
  "mainnet-gw.sodex.dev": "trading API",
  "mainnet-data.sodex.dev": "data service",
  "alpha-biz.sodex.dev": "transfer history",
  "sodex.dev": "account lookup",
};

/** Whether the live figures are current, and a plain sentence when they aren't. */
export function healthStatus(h: CollectorHealth, now = Date.now()): HealthStatus {
  const MIN = 60_000;
  // Plain words and how long, not clock times.
  // Ten minutes of silence, not less: the heartbeat lands once a minute and is
  // published every 30 seconds, so anything shorter can flag a pause that isn't.
  if (!h.heartbeat || now - h.heartbeat > 10 * MIN) {
    return {
      state: "offline",
      since: h.heartbeat,
      message: h.heartbeat
        ? `Live data is paused: our collector hasn't reported for ${span(now - h.heartbeat)}. Live figures below are from ${timeAgo(h.heartbeat, now)}.`
        : "Live data is paused: our collector isn't reporting.",
    };
  }
  if (!h.lastTrade || now - h.lastTrade > 5 * MIN) {
    return {
      state: "paused",
      since: h.lastTrade,
      message: `No trades from SoDEX${h.lastTrade ? ` for ${span(now - h.lastTrade)}` : ""}, most likely maintenance. Live figures resume on their own.`,
    };
  }
  // A SoDEX service has to be failing for ten minutes before it's worth a notice; short blips pass unseen.
  const down = h.upstream.filter((u) => u.retryAt > now - 15 * MIN && now - u.since >= 10 * MIN);
  if (down.length) {
    const names = [...new Set(down.map((u) => SERVICE[u.host] ?? u.host))].join(" and ");
    const since = Math.min(...down.map((u) => u.since));
    return { state: "degraded", since, message: `SoDEX's ${names} hasn't answered for ${span(now - since)}. Some live figures may be a little behind.` };
  }
  return { state: "ok", since: null, message: null };
}
