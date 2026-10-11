import { DatabaseSync } from "node:sqlite";
import { config } from "./config.mjs";

/**
 * Independent check of the numbers, not just the trade count: compare our
 * per-minute volume and trade count with SoDEX's own 1-minute candles, which
 * carry quote volume (q) and trade count (n).
 *
 * Read-only on the database. Costs 20 REST weight per market checked.
 * `node collector/src/reconcile.mjs [markets…]`
 */

const MINUTE = 60_000;
const db = new DatabaseSync(config.dbPath, { readOnly: true });

const span = db.prepare("SELECT MIN(minute) a, MAX(minute) b FROM flow_minute").get();
if (span.a == null) {
  console.log("No data yet.");
  process.exit(0);
}
// Skip the first minute (we joined part-way through) and the last two (still
// filling, or not yet flushed).
const fromMinute = span.a + MINUTE;
const toMinute = span.b - 2 * MINUTE;

const requested = process.argv.slice(2);
const markets = requested.length
  ? requested
  : [
      ...db
        .prepare("SELECT market FROM flow_minute WHERE minute BETWEEN ? AND ? GROUP BY market ORDER BY SUM(bought_usd) DESC LIMIT 5")
        .all(fromMinute, toMinute)
        .map((r) => r.market),
      ...db
        .prepare(
          "SELECT market FROM flow_minute WHERE minute BETWEEN ? AND ? GROUP BY market ORDER BY SUM(bought_usd) ASC LIMIT 2",
        )
        .all(fromMinute, toMinute)
        .map((r) => r.market),
    ];

// One symbol list per engine, fetched once (2 weight each).
const symbols = new Map();
for (const engine of ["perps", "spot"]) {
  const res = await fetch(`${config.gateway}/${engine}/markets/symbols`);
  for (const r of (await res.json()).data ?? []) {
    symbols.set(engine === "spot" ? (r.displayName ?? r.name) : r.name, { engine, api: r.name });
  }
}
const apiNameOf = async (symbol) => symbols.get(symbol) ?? null;

const ours = db.prepare(
  "SELECT minute, SUM(bought_usd) usd, SUM(fills) / 2 trades FROM flow_minute WHERE market = ? AND minute BETWEEN ? AND ? GROUP BY minute",
);

let totalMinutes = 0;
let exactMinutes = 0;
let ourUsd = 0;
let theirUsd = 0;
let ourTrades = 0;
let theirTrades = 0;

console.log(`Comparing ${new Date(fromMinute).toISOString().slice(11, 16)}–${new Date(toMinute).toISOString().slice(11, 16)} UTC against SoDEX 1-minute candles\n`);
console.log("market            minutes  trades ours/theirs     volume ours/theirs        diff   exact minutes");

for (const symbol of markets) {
  const m = await apiNameOf(symbol);
  if (!m) continue;
  const limit = Math.min(500, Math.ceil((toMinute - fromMinute) / MINUTE) + 3);
  const res = await fetch(`${config.gateway}/${m.engine}/markets/${encodeURIComponent(m.api)}/klines?interval=1m&limit=${limit}`);
  const candles = ((await res.json()).data ?? []).filter((c) => c.t >= fromMinute && c.t <= toMinute);
  const mine = new Map(ours.all(symbol, fromMinute, toMinute).map((r) => [r.minute, r]));

  let mins = 0;
  let exact = 0;
  let oU = 0;
  let tU = 0;
  let oT = 0;
  let tT = 0;
  for (const c of candles) {
    const o = mine.get(c.t) ?? { usd: 0, trades: 0 };
    const q = parseFloat(c.q);
    mins++;
    oU += o.usd;
    tU += q;
    oT += o.trades;
    tT += c.n;
    if (o.trades === c.n && Math.abs(o.usd - q) <= Math.max(0.01, q * 1e-9)) exact++;
  }
  totalMinutes += mins;
  exactMinutes += exact;
  ourUsd += oU;
  theirUsd += tU;
  ourTrades += oT;
  theirTrades += tT;
  const diff = tU ? ((oU - tU) / tU) * 100 : 0;
  console.log(
    `${symbol.padEnd(16)} ${String(mins).padStart(8)}  ${`${oT}/${tT}`.padStart(19)}  ${`$${oU.toFixed(0)}/$${tU.toFixed(0)}`.padStart(24)}  ${`${diff >= 0 ? "+" : ""}${diff.toFixed(4)}%`.padStart(10)}  ${exact}/${mins}`,
  );
}

const diff = theirUsd ? ((ourUsd - theirUsd) / theirUsd) * 100 : 0;
console.log(
  `\nTOTAL: ${exactMinutes}/${totalMinutes} market-minutes match exactly · trades ${ourTrades}/${theirTrades} · volume diff ${diff >= 0 ? "+" : ""}${diff.toFixed(4)}%`,
);
