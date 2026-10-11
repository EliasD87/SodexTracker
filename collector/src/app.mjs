import { config } from "./config.mjs";
import { db, dbSizeMb, sql, walSizeMb } from "./db.mjs";
import { runRetention } from "./retention.mjs";
import { log } from "./log.mjs";
import { restStats } from "./gateway.mjs";
import { EngineStream, streamStats } from "./stream.mjs";
import { apiNames, refreshMarkets } from "./markets.mjs";
import { flush, gapsQueued, onTrade, processNextGap, takeGapSummary, tradeStats } from "./trades.mjs";
import { recompute, refreshSmartMoney } from "./cohorts.mjs";
import { snapshotTickers } from "./tickers.mjs";
import { checkCoverage, coverageStats } from "./verify.mjs";
import { fundsSummary, processNextAccount, refreshAddresses, repriceMissing } from "./funds.mjs";
import { markDirty, positionsSummary, refreshTrackRecords, runSnapshots, seedFromAddressBook, sweepOnce } from "./positions.mjs";
import { fillListeners } from "./trades.mjs";
import { startTelegram } from "./telegram.mjs";

/**
 * The collector itself. Loaded by index.mjs only once the database lock is
 * held, because several modules touch the database as soon as they load.
 */

const timers = [];
const every = (ms, fn) => timers.push(setInterval(() => Promise.resolve(fn()).catch((e) => log.error("timer", e.stack ?? e.message)), ms));

let lastCpu = process.cpuUsage();
let lastTick = performance.now();
const lastCounts = { messages: 0, bytes: 0, trades: 0, weight: 0 };

function recordStats() {
  const now = performance.now();
  const cpu = process.cpuUsage(lastCpu);
  const cpuPct = ((cpu.user + cpu.system) / 1000 / (now - lastTick)) * 100;
  lastCpu = process.cpuUsage();
  lastTick = now;

  const mem = process.memoryUsage();
  const d = {
    messages: streamStats.messages - lastCounts.messages,
    bytes: streamStats.bytes - lastCounts.bytes,
    trades: tradeStats.trades - lastCounts.trades,
    weight: restStats.weight - lastCounts.weight,
  };
  Object.assign(lastCounts, { messages: streamStats.messages, bytes: streamStats.bytes, trades: tradeStats.trades, weight: restStats.weight });

  const size = dbSizeMb();
  sql.runtime.run(Date.now(), mem.rss / 1e6, mem.heapUsed / 1e6, cpuPct, d.messages, d.bytes, d.trades, d.weight, size);
  const coverage = coverageStats.checked ? `${((coverageStats.found / coverageStats.checked) * 100).toFixed(2)}%` : "n/a";
  log.info(
    "stats",
    `${d.trades} trades/min · ${(d.bytes / 1024).toFixed(0)} KB/min · rss ${(mem.rss / 1e6).toFixed(0)} MB · cpu ${cpuPct.toFixed(1)}% · ` +
      `rest ${d.weight} wt/min · data ${size.toFixed(2)} MB (+${walSizeMb().toFixed(1)} MB log) · coverage ${coverage} · gaps ${tradeStats.gaps} ` +
      `(recovered ${tradeStats.recovered}, lost ${tradeStats.lost}, queued ${gapsQueued()})`,
  );
}

/**
 * Deposits and withdrawals: its own lane, paced against SoDEX's website API
 * rather than the trading API's weight budget.
 */
function startFunds(isStopped) {
  const f = config.funds;
  (async () => {
    await refreshAddresses();
    while (!isStopped()) {
      try {
        if (!(await processNextAccount())) await new Promise((r) => setTimeout(r, 30_000));
      } catch (err) {
        log.error("funds", err.stack ?? err.message);
        await new Promise((r) => setTimeout(r, 5_000));
      }
    }
  })();
  every(f.newAccountsMs, () => refreshAddresses());
  every(60 * 60_000, repriceMissing);
  every(10 * 60_000, () => log.info("funds", fundsSummary()));
}

/**
 * Open positions: fills mark accounts for a re-read, a capped lane takes the
 * snapshots, and a slow sweep on the data host finds holders who haven't
 * traded since we started.
 */
function startPositions(isStopped) {
  const p = config.positions;
  fillListeners.add((buyer, seller) => {
    markDirty(buyer);
    markDirty(seller);
  });
  runSnapshots(isStopped);
  (async () => {
    await refreshAddresses();
    await refreshTrackRecords();
    seedFromAddressBook();
    while (!isStopped()) {
      try {
        if (!(await sweepOnce({ limit: 500 }))) await new Promise((r) => setTimeout(r, 10 * 60_000));
      } catch (err) {
        log.error("positions", err.stack ?? err.message);
        await new Promise((r) => setTimeout(r, 30_000));
      }
    }
  })();
  every(p.leaderboardEveryMs, () => refreshTrackRecords());
  // New accounts join the address book every 30 minutes; put them on the sweep list too.
  every(config.funds.newAccountsMs, () => refreshAddresses().then(seedFromAddressBook));
  every(10 * 60_000, () => log.info("positions", positionsSummary()));
}

export async function main(releaseLock) {
  log.info("start", `database ${config.dbPath}`);
  const n = await refreshMarkets();
  if (!n) throw new Error("could not load the market list");
  await refreshSmartMoney();
  recompute();

  const streams = ["perps", "spot"].map((engine) => new EngineStream(engine, () => apiNames(engine), onTrade));
  streams.forEach((s) => s.start());

  every(config.intervals.flushMs, () => {
    const summary = takeGapSummary();
    if (summary) log.warn("gap", summary);
    const f = flush();
    if (f.ms > 250) log.warn("flush", `slow flush: ${f.flow} flow rows, ${f.accounts} account rows in ${f.ms} ms`);
  });

  // Backfill runs in its own lane: it waits on the REST budget, and that wait
  // must never hold up a flush.
  let stopped = false;
  (async () => {
    while (!stopped) {
      try {
        if (!(await processNextGap())) await new Promise((r) => setTimeout(r, 2_000));
      } catch (err) {
        log.error("gap", err.stack ?? err.message);
        await new Promise((r) => setTimeout(r, 5_000));
      }
    }
  })();
  if (config.funds.enabled) startFunds(() => stopped);
  if (config.positions.enabled) startPositions(() => stopped);
  if (config.alerts.enabled) startTelegram(() => stopped);
  every(config.intervals.tickersMs, snapshotTickers);
  every(config.intervals.verifyMs, checkCoverage);
  every(config.intervals.statsMs, recordStats);
  every(config.intervals.cohortsMs, recompute);
  every(config.intervals.retentionMs, runRetention);
  every(config.intervals.smartMoneyMs, refreshSmartMoney);
  every(config.intervals.symbolsMs, async () => {
    await refreshMarkets();
    streams.forEach((s) => s.subscribeNew());
  });

  if (config.chaosEveryMs > 0) {
    let turn = 0;
    log.warn("chaos", `test mode: cutting a connection every ${config.chaosEveryMs / 1000}s`);
    every(config.chaosEveryMs, () => streams[turn++ % streams.length].drop());
  }

  let stopping = false;
  const shutdown = async (signal) => {
    if (stopping) return;
    stopping = true;
    log.info("stop", `${signal}: flushing and closing`);
    stopped = true;
    timers.forEach(clearInterval);
    streams.forEach((s) => s.stop());
    try {
      flush();
    } finally {
      db.close();
      releaseLock();
      process.exit(0);
    }
  };
  process.on("SIGINT", () => shutdown("SIGINT"));
  process.on("SIGTERM", () => shutdown("SIGTERM"));
}


