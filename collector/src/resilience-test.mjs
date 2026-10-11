import fs from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import assert from "node:assert/strict";

/**
 * Checks how the collector rides out SoDEX maintenance, against a fake SoDEX
 * on localhost and a throwaway database:
 *   1. maintenance pages and dead hosts count as outages; proper errors don't;
 *   2. five outages in a row pause the service and record it for the site;
 *      the first good answer resumes it;
 *   3. trade IDs that restart or jump are followed, replays stay duplicates.
 *
 *   node collector/src/resilience-test.mjs
 */

const tmp = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "resilience-")), "test.db");
process.env.COLLECTOR_DB = tmp;

const { guardedJson, Outage, anyDown, ok } = await import("./health.mjs");
const { db } = await import("./db.mjs");
const { onTrade, tradeStats } = await import("./trades.mjs");

let mode = "maintenance";
const server = http.createServer((req, res) => {
  if (mode === "maintenance") {
    res.writeHead(503, { "Content-Type": "text/html" });
    res.end("<html><body>SoDEX is under maintenance</body></html>");
  } else if (mode === "html200") {
    res.writeHead(200, { "Content-Type": "text/html" });
    res.end("<html>maintenance</html>");
  } else if (mode === "refusal") {
    res.writeHead(400, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ code: 400, message: "invalid param" }));
  } else {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ code: 0, data: { ok: true } }));
  }
});
await new Promise((r) => server.listen(0, "127.0.0.1", r));
const url = `http://127.0.0.1:${server.address().port}/api/v1/thing`;
const host = new URL(url).host;
const kv = () => db.prepare("SELECT value FROM kv WHERE key = ?").get(`upstream:${host}`);

let passed = 0;
const pass = (label) => {
  passed++;
  console.log(`  ✓ ${label}`);
};

console.log("1. Telling outages from refusals");
await assert.rejects(guardedJson(url), (e) => e instanceof Outage && /503/.test(e.message));
mode = "html200";
await assert.rejects(guardedJson(url), (e) => e instanceof Outage && /not JSON/.test(e.message));
mode = "refusal";
const { res } = await guardedJson(url);
assert.equal(res.status, 400);
await assert.rejects(guardedJson("http://127.0.0.1:1/nothing-here"), (e) => e instanceof Outage);
pass("503 page, HTML with 200, and a dead host are outages; a 400 with JSON is a normal answer");

console.log("2. Pausing and resuming");
mode = "maintenance";
assert.equal(anyDown(), false);
// The refusal above was a real answer, so the count restarts; five outages in a row now.
for (let i = 0; i < 5; i++) await guardedJson(url).catch(() => {});
assert.equal(anyDown(), true, "paused after five outages in a row");
const stored = JSON.parse(kv().value);
assert.ok(stored.since > 0 && stored.retryAt > Date.now(), "pause recorded for the site");
ok(host); // what the first good answer does
assert.equal(anyDown(), false);
assert.equal(kv(), undefined, "record cleared on recovery");
pass("five outages pause calls and record it; the first good answer resumes and clears it");

console.log("3. Trade IDs across maintenance");
const trade = (id) => onTrade("perps", { s: "BTC-USD", t: id, p: "80000", q: "0.01", T: Date.now(), S: "BUY", bi: 1, si: 2 });
const counts = () => ({ trades: tradeStats.trades, dup: tradeStats.duplicates, gaps: tradeStats.gaps });
for (let id = 100_000; id <= 100_010; id++) trade(id);
let c = counts();
trade(100_005); // a replay after a reconnect
assert.equal(counts().dup, c.dup + 1, "replay counted as duplicate");
c = counts();
trade(12); // SoDEX restarted numbering
trade(13);
trade(14);
assert.equal(counts().trades, c.trades + 3, "restarted IDs are recorded");
assert.equal(counts().gaps, c.gaps, "and no gap is invented");
c = counts();
trade(50_000_000); // renumbered far ahead
trade(50_000_001);
assert.equal(counts().trades, c.trades + 2, "jumped IDs are recorded");
assert.equal(counts().gaps, c.gaps, "and not treated as fifty million missed trades");
c = counts();
trade(50_000_004); // a real small gap still counts
assert.equal(counts().gaps, c.gaps + 1, "real gaps are still detected");
pass("replays stay duplicates; restarted and jumped numbering are followed; real gaps still caught");

server.close();
db.close();
fs.rmSync(path.dirname(tmp), { recursive: true, force: true });
console.log(`\nAll ${passed} checks passed.`);
process.exit(0);
