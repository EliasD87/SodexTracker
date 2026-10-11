import { sql, tx } from "./db.mjs";
import { gw } from "./gateway.mjs";
import { log } from "./log.mjs";
import { displayOf } from "./markets.mjs";

/**
 * A snapshot of every perp once a minute: price, mark, index, open interest
 * and funding. One REST call, 2 weight — the stream's allTicker carries no
 * open interest or funding. Spot is skipped: it has neither, and its prices
 * alone cost a third of the table for nothing the pages use.
 */

const MINUTE = 60_000;
const num = (v) => {
  const n = parseFloat(v);
  return Number.isFinite(n) ? n : null;
};

export async function snapshotTickers() {
  const minute = Math.floor(Date.now() / MINUTE) * MINUTE;
  let rows = 0;
  for (const engine of ["perps"]) {
    let data;
    try {
      data = await gw(`/${engine}/markets/tickers`, 2);
    } catch (err) {
      log.warn("tickers", `${engine} snapshot failed: ${err.message}`);
      continue;
    }
    tx(() => {
      for (const t of data ?? []) {
        const mark = num(t.markPrice);
        const oiBase = num(t.openInterest);
        sql.ticker.run(
          displayOf(t.symbol),
          minute,
          num(t.lastPx),
          mark,
          num(t.indexPrice),
          // Open interest comes in contracts; store it in dollars at mark.
          oiBase != null && mark != null ? oiBase * mark : null,
          num(t.fundingRate),
          num(t.quoteVolume),
        );
        rows++;
      }
    });
  }
  return rows;
}
