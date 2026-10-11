import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import assert from "node:assert/strict";

/**
 * Checks the alert pipeline without SoDEX or Telegram, on a throwaway
 * database:
 *   1. the collector's nicknames match the site's, both ways;
 *   2. snapshot diffs produce the right events, likely liquidations included;
 *   3. bot commands follow, list, filter and unfollow correctly;
 *   4. events reach exactly the chats following that trader, above their minimum.
 *
 *   node collector/src/alerts-test.mjs
 */

const tmp = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "alerts-")), "test.db");
process.env.COLLECTOR_DB = tmp;
process.env.SITE_URL = "https://example.test";

const collectorNames = await import("./nickname.mjs");
const siteNames = await import("../../src/lib/nickname.ts");
const { diffPositions, describe } = await import("./events.mjs");
const { db, sql } = await import("./db.mjs");
const { handleCommand, pendingAlerts } = await import("./telegram.mjs");

let passed = 0;
const ok = (label) => {
  passed++;
  console.log(`  ✓ ${label}`);
};

console.log("1. Nicknames");
for (let id = 0; id < 300_000; id += 7) {
  const name = collectorNames.nickname(id);
  assert.equal(name, siteNames.nickname(id), `name differs for ${id}`);
  assert.equal(siteNames.accountOf(name), id);
}
assert.equal(collectorNames.accountOf("not-a-trader"), null);
ok("collector and site agree on 42,858 names and decode them back");

console.log("2. Position events");
const mark = { "BTC-USD": 80_000, "ETH-USD": 2_500 };
const markOf = (m) => mark[m] ?? null;
const P = (market, size, extra = {}) => ({ market, posSide: "BOTH", size, entry: 79_000, liq: null, leverage: 10, ...extra });
const kinds = (prev, next) => diffPositions(prev, next, markOf).map((e) => e.kind + (e.liquidated ? "!" : ""));
assert.deepEqual(kinds([], [P("BTC-USD", 0.5)]), ["open"]);
assert.deepEqual(kinds([P("BTC-USD", 0.5)], [P("BTC-USD", 0.8)]), ["add"]);
assert.deepEqual(kinds([P("BTC-USD", 0.8)], [P("BTC-USD", 0.3)]), ["reduce"]);
assert.deepEqual(kinds([P("BTC-USD", 0.3)], []), ["close"]);
assert.deepEqual(kinds([P("BTC-USD", 0.3)], [P("BTC-USD", -0.2)]), ["flip"]);
assert.deepEqual(kinds([P("BTC-USD", 0.3)], [P("BTC-USD", 0.3)]), []);
// Long liquidated: mark (80,000) at/below the old liquidation price.
assert.deepEqual(kinds([P("BTC-USD", 0.3, { liq: 80_400 })], []), ["close!"]);
assert.deepEqual(kinds([P("BTC-USD", 0.3, { liq: 60_000 })], []), ["close"]);
// Short liquidated: mark at/above the old liquidation price.
assert.deepEqual(kinds([P("ETH-USD", -4, { liq: 2_490 })], [P("ETH-USD", -1, { liq: 2_490 })]), ["reduce!"]);
const open = diffPositions([], [P("BTC-USD", 0.5)], markOf)[0];
assert.equal(open.usd, 40_000);
ok("open, add, reduce, close, flip, unchanged, and likely liquidations (long and short)");
console.log("     " + describe("quiet-falcon-bloom", open));
console.log("     " + describe("quiet-falcon-bloom", diffPositions([P("BTC-USD", 0.3, { liq: 80_400 })], [], markOf)[0]));

console.log("3. Bot commands");
const A = 230_914;
const B = 8_785;
const nameA = collectorNames.nickname(A);
const nameB = collectorNames.nickname(B);
assert.match(handleCommand(1, `/start ${nameA}`), /Following/);
assert.match(handleCommand(1, `/follow ${nameB}`), /Following/);
assert.match(handleCommand(2, `/follow ${nameA}`), /Following/);
assert.match(handleCommand(1, "/follow not-a-trader"), /isn't a trader name/);
const list = handleCommand(1, "/list");
assert.ok(list.includes(nameA) && list.includes(nameB), "both follows listed");
assert.match(handleCommand(2, "/min 10k"), /\$10,000/);
assert.match(handleCommand(3, "/start"), /Follow SoDEX traders/);
ok("follow via /start and /follow, bad names rejected, /list, /min 10k");

console.log("4. Delivery");
const ev = (account, kind, usd) => sql.event.run(account, Date.now(), kind, "BTC-USD", "LONG", 0, 0.5, usd, 80_000, 10, 0, null);
const cursor = 0;
ev(A, "open", 40_000); // chat 1 and chat 2 (≥ $10K)
ev(A, "add", 5_000); // chat 1 only (below chat 2's minimum)
ev(B, "close", 20_000); // chat 1 only
ev(999_999, "open", 1e6); // nobody follows
let { alerts, cursor: next } = pendingAlerts(cursor);
const to = (chat) => alerts.filter((a) => a.chatId === chat).length;
assert.equal(to(1), 3);
assert.equal(to(2), 1);
assert.equal(alerts.length, 4);
assert.ok(alerts.every((a) => a.text.includes("https://example.test/analytics/trader/")));
assert.ok(alerts.every((a) => !/0x[0-9a-f]{6}/i.test(a.text)), "no address in any alert");
({ alerts } = pendingAlerts(next));
assert.equal(alerts.length, 0);
assert.match(handleCommand(1, `/unfollow ${nameB}`), /Unfollowed/);
ev(B, "open", 20_000);
({ alerts } = pendingAlerts(next));
assert.equal(alerts.length, 0);
ok("right chats, minimums respected, nothing sent twice, unfollow works, no addresses");

db.close();
fs.rmSync(path.dirname(tmp), { recursive: true, force: true });
console.log(`\nAll ${passed} checks passed.`);
