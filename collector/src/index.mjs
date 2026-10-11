import { acquireLock } from "./lock.mjs";
import { log } from "./log.mjs";

/**
 * SoDEX collector entry point: listens to every trade on every market and keeps
 * the figures the analytics pages need. `node collector/src/index.mjs`; stop
 * with Ctrl+C, which flushes before exiting.
 *
 * The lock is taken before app.mjs is imported: its modules open the database
 * as they load.
 */

const releaseLock = acquireLock();

try {
  const { main } = await import("./app.mjs");
  await main(releaseLock);
} catch (err) {
  log.error("start", err.stack ?? err.message);
  releaseLock();
  process.exit(1);
}
