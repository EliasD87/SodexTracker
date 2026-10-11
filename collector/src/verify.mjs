import { config } from "./config.mjs";
import { db, sql } from "./db.mjs";
import { gw } from "./gateway.mjs";
import { log } from "./log.mjs";
import { allMarkets } from "./markets.mjs";
import { capturedIds, gapsQueued } from "./trades.mjs";

/**
 * Completeness, checked against SoDEX itself: fetch a market's latest trades
 * over REST and confirm every one inside the range we've been capturing
 * arrived over the stream. The busiest markets are always checked, the rest
 * in rotation.
 */

let rotation = 0;
export const coverageStats = { checked: 0, found: 0 };

const busiest = db.prepare(`
  SELECT market FROM flow_minute WHERE minute >= ? GROUP BY market ORDER BY SUM(fills) DESC LIMIT 2`);

/** Above this backlog, spot checks give their REST budget to backfill. */
const BACKLOG = 20;

export async function checkCoverage() {
  if (gapsQueued() > BACKLOG) return;
  const markets = allMarkets();
  if (!markets.length) return;
  const top = busiest.all(Date.now() - 60 * 60_000).map((r) => r.market);
  const picks = new Set(top);
  while (picks.size < config.verify.marketsPerRound && picks.size < markets.length) {
    picks.add(markets[rotation++ % markets.length].symbol);
  }

  for (const symbol of picks) {
    const m = markets.find((x) => x.symbol === symbol);
    const captured = capturedIds(symbol);
    if (!m || !captured) continue;
    let rows;
    try {
      rows = await gw(`/${m.engine}/markets/${encodeURIComponent(m.api)}/trades?limit=${config.verify.sampleSize}`, 20);
    } catch (err) {
      log.warn("verify", `${symbol}: ${err.message}`);
      continue;
    }
    // Only judge trades inside the window we were listening for: older ones
    // predate this run, newer ones may still be in flight.
    const inRange = (rows ?? []).filter((r) => r.t >= captured.min && r.t <= captured.max);
    if (!inRange.length) continue;
    const missing = inRange.filter((r) => !captured.ids.has(r.t)).map((r) => r.t);
    const found = inRange.length - missing.length;
    coverageStats.checked += inRange.length;
    coverageStats.found += found;
    sql.coverage.run(Date.now(), symbol, inRange.length, found, missing.length ? missing.slice(0, 20).join(",") : null);
    if (missing.length) log.warn("verify", `${symbol}: ${missing.length} of ${inRange.length} recent trades not captured`);
  }
}
