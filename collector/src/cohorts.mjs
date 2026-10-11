import { config } from "./config.mjs";
import { db, sql, tx } from "./db.mjs";
import { dataApi } from "./gateway.mjs";
import { log } from "./log.mjs";

/**
 * Which group each account belongs to, by behaviour:
 *   mm     — trades constantly, mostly passively, on both sides, ends near flat
 *   smart  — top 100 by 30-day PnL on SoDEX's leaderboard
 *   whale  — large average fill
 *   retail — everyone else
 * Priority runs in that order, so a top-PnL market maker counts as a market
 * maker. Groups are recomputed as data accumulates; anything not yet
 * classified is retail.
 */

export const COHORTS = ["mm", "smart", "whale", "retail", "unattributed"];

let current = new Map();
let smart = new Set();

for (const row of db.prepare("SELECT account_id, cohort FROM cohorts").all()) {
  current.set(row.account_id, row.cohort);
  if (row.cohort === "smart") smart.add(row.account_id);
}

export const cohortOf = (accountId) => current.get(accountId) ?? "retail";

export async function refreshSmartMoney() {
  const pages = Math.ceil(config.cohorts.smartMoneyCount / 20);
  const next = new Set();
  for (let page = 1; page <= pages; page++) {
    try {
      const data = await dataApi(`/leaderboard?window_type=30D&sort_by=pnl&page=${page}&page_size=20`);
      for (const row of data?.items ?? []) next.add(row.account_id);
    } catch (err) {
      log.warn("cohorts", `leaderboard page ${page} failed: ${err.message}; keeping the previous list`);
      return;
    }
  }
  smart = next;
  log.info("cohorts", `smart money: top ${smart.size} by 30-day PnL`);
  recompute();
}

const statsQuery = db.prepare(`
  SELECT account_id,
         SUM(fills) AS fills,
         SUM(maker_usd) AS maker,
         SUM(taker_usd) AS taker,
         SUM(bought_usd) AS bought,
         SUM(sold_usd) AS sold,
         COUNT(DISTINCT market) AS markets
  FROM account_day
  WHERE day >= ?
  GROUP BY account_id`);

/** Reclassify every account seen in the last two UTC days. */
export function recompute() {
  const since = new Date(Date.now() - 86_400_000).toISOString().slice(0, 10);
  const { mm, whale } = config.cohorts;
  const next = new Map();
  const reasons = new Map();

  for (const r of statsQuery.all(since)) {
    const gross = r.maker + r.taker;
    if (!(gross > 0)) continue;
    const makerShare = r.maker / gross;
    const netRatio = Math.abs(r.bought - r.sold) / gross;
    const avgFill = gross / r.fills;
    if (r.fills >= mm.minFills && makerShare >= mm.minMakerShare && r.markets >= mm.minMarkets && netRatio <= mm.maxNetRatio) {
      next.set(r.account_id, "mm");
      reasons.set(r.account_id, `${r.fills} fills, ${(makerShare * 100).toFixed(0)}% maker, ${r.markets} markets, net ${(netRatio * 100).toFixed(1)}%`);
    } else if (!smart.has(r.account_id) && r.fills >= whale.minFills && avgFill >= whale.minAvgFillUsd) {
      next.set(r.account_id, "whale");
      reasons.set(r.account_id, `avg fill $${Math.round(avgFill).toLocaleString("en-US")} over ${r.fills} fills`);
    }
  }
  for (const id of smart) {
    if (!next.has(id)) {
      next.set(id, "smart");
      reasons.set(id, "top 100 by 30-day PnL");
    }
  }

  const now = Date.now();
  let changed = 0;
  tx(() => {
    for (const [id, cohort] of next) {
      if (current.get(id) !== cohort) {
        sql.cohort.run(id, cohort, reasons.get(id) ?? null, now);
        changed++;
      }
    }
    // Accounts that no longer qualify fall back to retail.
    for (const [id, cohort] of current) {
      if (!next.has(id) && cohort !== "retail") {
        sql.cohort.run(id, "retail", "no longer qualifies", now);
        changed++;
      }
    }
  });
  current = next;

  const counts = { mm: 0, smart: 0, whale: 0 };
  for (const c of next.values()) counts[c]++;
  log.info("cohorts", `classified: ${counts.mm} market makers, ${counts.smart} smart money, ${counts.whale} whales (${changed} changed)`);
}
