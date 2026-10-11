import fs from "node:fs";
import path from "node:path";
import { config } from "./config.mjs";
import { log } from "./log.mjs";

/**
 * One writer per database: two would both record every trade and double
 * every figure. Taken before anything opens the database, because several
 * modules start reading and writing it the moment they load. A lock left by a
 * crashed run (its process gone) is taken over. Returns the release function.
 */
export function acquireLock() {
  const lockPath = `${config.dbPath}.lock`;
  fs.mkdirSync(path.dirname(lockPath), { recursive: true });

  try {
    const pid = Number(fs.readFileSync(lockPath, "utf8"));
    if (pid && pid !== process.pid) {
      let alive = true;
      try {
        process.kill(pid, 0);
      } catch {
        alive = false;
      }
      if (alive) {
        log.error("start", `another collector (pid ${pid}) is already using ${config.dbPath}; stop it first`);
        process.exit(1);
      }
      log.warn("start", `taking over a lock left by pid ${pid}, which is no longer running`);
    }
  } catch {
    /* no lock yet */
  }
  fs.writeFileSync(lockPath, String(process.pid));

  return () => {
    try {
      if (Number(fs.readFileSync(lockPath, "utf8")) === process.pid) fs.unlinkSync(lockPath);
    } catch {
      /* already gone */
    }
  };
}
