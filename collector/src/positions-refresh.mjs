import { acquireLock } from "./lock.mjs";
import { log } from "./log.mjs";

/**
 * Re-read every account the position engine already holds, now. For checking
 * locally that snapshot diffs produce the right events.
 *
 *   node collector/src/positions-refresh.mjs
 */

const release = acquireLock();
try {
  const { refreshMarkets } = await import("./markets.mjs");
  const { snapshotTickers } = await import("./tickers.mjs");
  const { markDirty, drain, positionsSummary } = await import("./positions.mjs");
  const { db } = await import("./db.mjs");
  await refreshMarkets();
  await snapshotTickers();
  const before = db.prepare("SELECT COALESCE(MAX(id), 0) id FROM account_events").get().id;
  const holders = db.prepare("SELECT account_id FROM pos_accounts WHERE holds = 1").all();
  for (const h of holders) markDirty(h.account_id);
  const t0 = Date.now();
  await drain();
  const events = db.prepare("SELECT kind, liquidated, COUNT(*) n, ROUND(SUM(usd)) usd FROM account_events WHERE id > ? GROUP BY kind, liquidated").all(before);
  log.info("refresh", `${holders.length} holders re-read in ${((Date.now() - t0) / 1000).toFixed(0)}s · ${positionsSummary()}`);
  for (const e of events) log.info("refresh", `${e.kind}${e.liquidated ? " (likely liquidated)" : ""}: ${e.n}, $${e.usd}`);
  db.close();
} finally {
  release();
}
