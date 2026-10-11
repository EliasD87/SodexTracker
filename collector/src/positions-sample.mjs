import { acquireLock } from "./lock.mjs";
import { log } from "./log.mjs";

/**
 * Fill the local database with open positions for the busiest traders, to
 * check the numbers and give the Positions page something real to show,
 * without the full sweep (that belongs on the server).
 *
 *   node collector/src/positions-sample.mjs [accounts=1000]
 *
 * Reads the top traders by all-time volume, checks each one's overview for
 * open positions and snapshots the ones that hold any. Weighted towards large
 * traders, so group sizes are not SoDEX-wide.
 */

const release = acquireLock();
const target = Number(process.argv[2] ?? 1000);

try {
  const { refreshMarkets } = await import("./markets.mjs");
  const { refreshAddresses } = await import("./funds.mjs");
  const { refreshTrackRecords, sweepOnce, drain, positionsSummary, positionStats } = await import("./positions.mjs");
  const { db } = await import("./db.mjs");
  const { snapshotTickers } = await import("./tickers.mjs");

  const t0 = Date.now();
  await refreshMarkets();
  await snapshotTickers(); // current marks, for sizing the refresh tiers
  await refreshAddresses();
  await refreshTrackRecords({ maxPages: Math.ceil(target / 50) });
  log.info("sample", `track records in ${((Date.now() - t0) / 1000).toFixed(0)}s; sweeping ${target} overviews`);
  await sweepOnce({ limit: target });
  log.info("sample", `swept in ${((Date.now() - t0) / 1000).toFixed(0)}s: ${positionStats.holders} holders found; snapshotting`);
  await drain();
  log.info("sample", `done in ${((Date.now() - t0) / 1000).toFixed(0)}s · ${positionsSummary()} · ${positionStats.snapshots} snapshots`);
  db.close();
} finally {
  release();
}
