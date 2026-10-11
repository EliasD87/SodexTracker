import { DatabaseSync } from "node:sqlite";
import { config } from "./config.mjs";

/**
 * Verification report for a run: completeness, continuity, resource use and
 * a sanity check of the data itself. Read-only; safe while the collector runs.
 * `node collector/src/report.mjs`
 */

const db = new DatabaseSync(config.dbPath, { readOnly: true });
const one = (q, ...a) => db.prepare(q).get(...a);
const all = (q, ...a) => db.prepare(q).all(...a);
const fmt = (n, d = 0) => (n == null ? "—" : Number(n).toLocaleString("en-US", { maximumFractionDigits: d, minimumFractionDigits: d }));
const usd = (n) => (n == null ? "—" : n >= 1e6 ? `$${(n / 1e6).toFixed(2)}M` : n >= 1e3 ? `$${(n / 1e3).toFixed(1)}K` : `$${n.toFixed(0)}`);
const time = (ms) => new Date(ms).toISOString().replace("T", " ").slice(0, 19);
const h = (t) => console.log(`\n== ${t} ${"=".repeat(Math.max(0, 60 - t.length))}`);

const span = one("SELECT MIN(ts) a, MAX(ts) b, COUNT(*) n FROM runtime");
const hours = span.n ? (span.b - span.a) / 3_600_000 + 1 / 60 : 0;

h("Run");
console.log(`window      ${span.a ? `${time(span.a)} → ${time(span.b)} UTC` : "no runtime samples yet"}`);
console.log(`duration    ${fmt(hours * 60, 0)} min`);

h("Completeness (vs SoDEX's own recent trades)");
const cov = one("SELECT SUM(checked) c, SUM(found) f, COUNT(*) n FROM coverage");
console.log(`checked     ${fmt(cov.c)} trades in ${fmt(cov.n)} samples`);
console.log(`captured    ${cov.c ? `${((cov.f / cov.c) * 100).toFixed(3)}%` : "—"}`);
for (const r of all("SELECT market, SUM(checked) c, SUM(found) f FROM coverage GROUP BY market HAVING f < c ORDER BY c - f DESC LIMIT 5")) {
  console.log(`  missed    ${r.market}: ${r.c - r.f} of ${r.c}`);
}

h("Continuity");
const gaps = one("SELECT COUNT(*) n, SUM(missing) m, SUM(backfilled) b FROM gaps");
console.log(`gaps        ${fmt(gaps.n)} (${fmt(gaps.m)} trades missed, ${fmt(gaps.b)} recovered from REST)`);
for (const r of all("SELECT status, COUNT(*) n FROM gaps GROUP BY status")) console.log(`  ${r.status.padEnd(9)} ${r.n}`);
const conns = all("SELECT engine, event, COUNT(*) n FROM connections GROUP BY engine, event ORDER BY engine, event");
console.log(`connection events: ${conns.map((c) => `${c.engine}/${c.event} ×${c.n}`).join(", ") || "none"}`);
const seqs = one("SELECT COUNT(*) markets, SUM(trades) trades FROM market_seq");
console.log(`markets     ${fmt(seqs.markets)} seen, ${fmt(seqs.trades)} trades sequenced`);

h("Resources");
const res = one(`SELECT AVG(rss_mb) rss, MAX(rss_mb) rssMax, AVG(cpu_pct) cpu, MAX(cpu_pct) cpuMax,
  SUM(ws_bytes) bytes, SUM(trades) trades, SUM(rest_weight) wt, MAX(rest_weight) wtMax, MIN(db_mb) db0, MAX(db_mb) db1 FROM runtime`);
const perDay = (x) => (hours > 0 ? (x / hours) * 24 : null);
console.log(`memory      avg ${fmt(res.rss)} MB, peak ${fmt(res.rssMax)} MB`);
console.log(`cpu         avg ${fmt(res.cpu, 1)}%, peak ${fmt(res.cpuMax, 1)}% of one core`);
console.log(`download    ${fmt(res.bytes / 1e6, 1)} MB so far → ~${fmt(perDay(res.bytes / 1e6))} MB/day`);
console.log(`rest        ${fmt(res.wt)} weight used, peak ${fmt(res.wtMax)}/min (our cap ${config.limits.restWeightPerMinute}, SoDEX's 1200)`);
const page = (q) => db.prepare(q).get();
const dataMb = ((page("PRAGMA page_count").page_count - page("PRAGMA freelist_count").freelist_count) * page("PRAGMA page_size").page_size) / 1e6;
console.log(`database    ${fmt(dataMb, 2)} MB of data (excludes the temporary write-ahead log)`);
console.log(`  growth    ~${fmt(perDay(res.db1 - res.db0), 1)} MB/day while minute detail builds up; levels off after 48 h as it rolls into hourly rows`);
for (const t of ["flow_minute", "flow_hour", "account_day", "large_trades", "ticker_minute", "ticker_hour"]) {
  console.log(`  ${t.padEnd(14)} ${fmt(one(`SELECT COUNT(*) n FROM ${t}`).n)} rows`);
}

h("Data sanity");
const vol = one("SELECT SUM(bought_usd) v, SUM(fills) / 2 t FROM flow_minute");
console.log(`volume      ${usd(vol.v)} over ${fmt(vol.t)} trades`);
console.log("by group (share of volume, either side):");
const groups = all(`SELECT cohort, SUM(bought_usd + sold_usd) / 2 v, SUM(taker_bought_usd - taker_sold_usd) net FROM flow_minute GROUP BY cohort ORDER BY v DESC`);
for (const g of groups) console.log(`  ${g.cohort.padEnd(13)} ${usd(g.v).padStart(9)}  ${((g.v / vol.v) * 100).toFixed(1).padStart(5)}%   taker net ${g.net >= 0 ? "+" : ""}${usd(g.net)}`);
const accts = one("SELECT COUNT(DISTINCT account_id) n FROM account_day WHERE day = ?", new Date().toISOString().slice(0, 10));
console.log(`traders today (each counted once): ${fmt(accts.n)}`);
const cohorts = all("SELECT cohort, COUNT(*) n FROM cohorts WHERE cohort != 'retail' GROUP BY cohort");
console.log(`classified accounts: ${cohorts.map((c) => `${c.cohort} ${c.n}`).join(", ") || "none yet"}`);
console.log("top markets:");
for (const m of all("SELECT market, SUM(bought_usd) v, SUM(fills) / 2 t FROM flow_minute GROUP BY market ORDER BY v DESC LIMIT 5")) {
  console.log(`  ${m.market.padEnd(14)} ${usd(m.v).padStart(9)} ${fmt(m.t).padStart(8)} trades`);
}
const big = one("SELECT COUNT(*) n, MAX(usd) m FROM large_trades");
console.log(`large trades ${fmt(big.n)} (biggest ${usd(big.m)})`);

h("Deposits and withdrawals");
const hasFunds = one("SELECT 1 x FROM sqlite_schema WHERE type = 'table' AND name = 'fund_flows'");
if (!hasFunds) console.log("not started (COLLECTOR_FUNDS=1 turns it on)");
else {
  const fa = one("SELECT COUNT(*) n, COUNT(checked_at) r, MAX(checked_at) last FROM fund_accounts");
  const ff = one("SELECT COUNT(*) n, SUM(usd IS NULL) np, SUM(CASE direction WHEN 'in' THEN usd END) i, SUM(CASE direction WHEN 'out' THEN usd END) o FROM fund_flows");
  console.log(`accounts    ${fmt(fa.n)} known, ${fmt(fa.r)} ledgers read (${fa.n ? ((fa.r / fa.n) * 100).toFixed(1) : 0}%)${fa.last ? `, last ${time(fa.last)} UTC` : ""}`);
  console.log(`movements   ${fmt(ff.n)} (${fmt(ff.np)} without a price) · in ${usd(ff.i)} · out ${usd(ff.o)}`);
}

h("Open positions");
const hasPos = one("SELECT 1 x FROM sqlite_schema WHERE type = 'table' AND name = 'open_positions'");
if (!hasPos) console.log("not started (COLLECTOR_POSITIONS=1 turns it on)");
else {
  const pa = one("SELECT COUNT(*) n, COUNT(swept_at) w, SUM(holds) h, MAX(snapshot_at) last FROM pos_accounts");
  const pp = one("SELECT COUNT(*) n, COUNT(DISTINCT market) m FROM open_positions");
  console.log(`traders     ${fmt(pa.n)} known, ${fmt(pa.w)} checked for positions`);
  console.log(`holders     ${fmt(pa.h)} holding ${fmt(pp.n)} positions in ${fmt(pp.m)} markets${pa.last ? `, last read ${time(pa.last)} UTC` : ""}`);
}
