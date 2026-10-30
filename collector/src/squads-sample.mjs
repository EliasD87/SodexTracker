import { acquireLock } from "./lock.mjs";
import { log } from "./log.mjs";

/**
 * Ask who invited a sample of accounts, in the same order the collector
 * would (recent traders first, then captains' squad names), to check the
 * squads views locally without the full first pass. Safe to repeat.
 *
 *   node collector/src/squads-sample.mjs [lookups=600]
 */

const release = acquireLock();
const target = Number(process.argv[2] ?? 600);

try {
  const { processNextSquad, refreshSeason, squadsSummary } = await import("./squads.mjs");
  const { db } = await import("./db.mjs");
  await refreshSeason();
  const t0 = Date.now();
  for (let i = 0; i < target; i++) {
    if (!(await processNextSquad())) break;
    if ((i + 1) % 100 === 0) log.info("sample", `${i + 1}/${target} · ${((Date.now() - t0) / 1000).toFixed(0)}s · ${squadsSummary()}`);
  }
  log.info("sample", `done in ${((Date.now() - t0) / 1000).toFixed(0)}s · ${squadsSummary()}`);
  db.close();
} finally {
  release();
}
