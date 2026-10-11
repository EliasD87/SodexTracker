import { acquireLock } from "./lock.mjs";
import { log } from "./log.mjs";

/**
 * Read a sample of ledgers into the local database, to check the numbers and
 * give the Money flow page something real to show, without the full first run
 * (that belongs on the server). Safe to repeat: movements are never counted
 * twice.
 *
 *   node collector/src/funds-sample.mjs [accounts=300]
 *
 * With 0 it reads nothing and only values movements still missing a price.
 *
 * Takes the busiest accounts by all-time volume, so it is weighted towards
 * large traders and its totals are a floor, not SoDEX's real figures.
 */

const release = acquireLock();
const target = Number(process.argv[2] ?? 300);

try {
  const { refreshMarkets } = await import("./markets.mjs");
  const { readAccount, refreshAddresses, repriceMissing, fundsSummary, fundStats } = await import("./funds.mjs");
  const { db } = await import("./db.mjs");
  const { dataApi } = await import("./gateway.mjs");

  await refreshMarkets();
  // The whole address book (a couple of minutes), then the busiest accounts
  // by all-time volume from the leaderboard.
  await refreshAddresses({ from: 1 });
  const busiest = [];
  for (let page = 1; busiest.length < target; page++) {
    const data = await dataApi(`/leaderboard?window_type=ALL_TIME&sort_by=volume&sort_order=desc&page=${page}&page_size=50`);
    const items = data?.items ?? [];
    busiest.push(...items.map((it) => it.account_id));
    if (items.length < 50) break;
  }
  const one = db.prepare("SELECT account_id, address, newest_ts FROM fund_accounts WHERE account_id = ?");
  const accounts = busiest.slice(0, target).map((id) => one.get(id)).filter(Boolean);
  const t0 = Date.now();
  for (const [i, a] of accounts.entries()) {
    try {
      await readAccount(a);
    } catch (err) {
      fundStats.failures++;
      log.warn("sample", `account ${i + 1}: ${err.message}`);
    }
    if ((i + 1) % 50 === 0) log.info("sample", `${i + 1}/${accounts.length} · ${((Date.now() - t0) / 1000).toFixed(0)}s · ${fundsSummary()}`);
  }
  await repriceMissing();
  log.info("sample", `done in ${((Date.now() - t0) / 1000).toFixed(0)}s · ${fundsSummary()} · ${fundStats.reads} requests`);
  db.close();
} finally {
  release();
}
