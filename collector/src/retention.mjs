import { config } from "./config.mjs";
import { db, tx } from "./db.mjs";
import { log } from "./log.mjs";

/**
 * Keeps the database small enough to live in Supabase:
 *   - minute detail is kept for 48 hours (intraday charts), then rolled up
 *     into hourly rows, about a sixtieth of the size, and kept for good;
 *   - the collector's own diagnostics are pruned after 14 days;
 *   - the write-ahead log is folded back into the database.
 * Each roll-up moves rows in one transaction, so no period is ever counted in
 * both the minute and the hour tables, or in neither.
 */

const HOUR = 3_600_000;

const rollFlow = db.prepare(`
  INSERT INTO flow_hour (market, hour, cohort, bought_usd, sold_usd, taker_bought_usd, taker_sold_usd, fills)
  SELECT market, (minute / ${HOUR}) * ${HOUR}, cohort,
         SUM(bought_usd), SUM(sold_usd), SUM(taker_bought_usd), SUM(taker_sold_usd), SUM(fills)
  FROM flow_minute WHERE minute < ?
  GROUP BY market, (minute / ${HOUR}) * ${HOUR}, cohort
  ON CONFLICT (market, hour, cohort) DO UPDATE SET
    bought_usd = bought_usd + excluded.bought_usd,
    sold_usd = sold_usd + excluded.sold_usd,
    taker_bought_usd = taker_bought_usd + excluded.taker_bought_usd,
    taker_sold_usd = taker_sold_usd + excluded.taker_sold_usd,
    fills = fills + excluded.fills`);
const dropFlow = db.prepare("DELETE FROM flow_minute WHERE minute < ?");

// Each hour keeps its last snapshot, with funding averaged over the hour.
const rollTicker = db.prepare(`
  INSERT OR REPLACE INTO ticker_hour (market, hour, last, mark, idx, oi, funding)
  SELECT t.market, g.hour, t.last, t.mark, t.idx, t.oi, g.funding
  FROM (
    SELECT market, (minute / ${HOUR}) * ${HOUR} AS hour, MAX(minute) AS lastMinute, AVG(funding) AS funding
    FROM ticker_minute WHERE minute < ?
    GROUP BY market, (minute / ${HOUR}) * ${HOUR}
  ) g
  JOIN ticker_minute t ON t.market = g.market AND t.minute = g.lastMinute`);
const dropTicker = db.prepare("DELETE FROM ticker_minute WHERE minute < ?");

const pruneRuntime = db.prepare("DELETE FROM runtime WHERE ts < ?");
const pruneCoverage = db.prepare("DELETE FROM coverage WHERE ts < ?");
const pruneConnections = db.prepare("DELETE FROM connections WHERE ts < ?");
const pruneGaps = db.prepare("DELETE FROM gaps WHERE detected_at < ? AND status != 'open'");

export function runRetention() {
  const now = Date.now();
  // Whole hours only, so a partly rolled hour never exists.
  const cutoff = Math.floor((now - config.retention.minuteDetailMs) / HOUR) * HOUR;
  const diagnosticsCutoff = now - config.retention.diagnosticsMs;

  const result = tx(() => {
    rollFlow.run(cutoff);
    const flow = dropFlow.run(cutoff).changes;
    rollTicker.run(cutoff);
    const ticker = dropTicker.run(cutoff).changes;
    pruneRuntime.run(diagnosticsCutoff);
    pruneCoverage.run(diagnosticsCutoff);
    pruneConnections.run(diagnosticsCutoff);
    pruneGaps.run(diagnosticsCutoff);
    return { flow, ticker };
  });

  // Fold the write-ahead log back in; TRUNCATE also shrinks the file.
  db.exec("PRAGMA wal_checkpoint(TRUNCATE)");
  if (result.flow || result.ticker) {
    log.info("retain", `rolled ${result.flow} flow and ${result.ticker} ticker minute rows into hourly rows`);
  }
}

