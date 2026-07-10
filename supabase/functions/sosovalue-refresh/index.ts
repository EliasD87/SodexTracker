// SoSoValue 12h refresh — Supabase Edge Function (self-chaining).
//
// Pulls every SoSoValue endpoint the app reads and OVERWRITES rows in
// public.sosovalue_cache (key → data). The app reads this table.
//
// WHY SELF-CHAINING: the full refresh is ~135 API calls spaced 3.2s apart
// (SoSoValue caps at 20 req/min) ≈ 7 minutes — but the free-tier edge
// wall-clock limit (~150s) kills anything longer. So each invocation works
// for ~100s, writes a progress summary, then re-invokes itself. Segments
// skip rows already refreshed (< 6h old), so the chain converges in ~5
// invocations and a mid-kill loses nothing.
//
// Secrets: SOSOVALUE_API_KEY (required), CRON_SECRET (recommended).
// (SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY are injected automatically.)
//
// KEY FORMAT AND THE KLINE WINDOW MUST STAY IN SYNC with src/lib/sosovalue.ts
// (`soso:${path}`, day-snapped 35d kline window).

import { createClient } from "npm:@supabase/supabase-js@2";

const BASE = "https://api.sosovalue.xyz/openapi/v1";
const RATE_MS = 3200; // ~18 req/min, under SoSoValue's 20/min cap
const WORK_BUDGET_MS = 100_000; // stop starting new calls after this (150s kill)
const FRESH_MS = 6 * 60 * 60 * 1000; // rows younger than this are skipped
const MAX_CHAIN = 10;

// keep in sync with src/lib/sosovalue.ts / src/lib/indexMeta.ts
const SODEX_INDEX_TICKERS = ["ssiMAG7", "ssiDeFi", "ssiMeme"];
const PAIR_ALIASES: Record<string, string> = {
  "1000pepe": "pepe",
  "1000shib": "shib",
  "1000bonk": "bonk",
  wsoso: "soso",
};
// high-traffic bases pre-warmed for Pair Intelligence (others fall back to a
// direct fetch in the app — a handful of calls/day at most)
const POPULAR_BASES = [
  "BTC", "ETH", "SOL", "SUI", "BNB", "XRP", "DOGE", "ADA",
  "HYPE", "LINK", "UNI", "LTC", "TON", "TRX",
];

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function run(depth: number) {
  const apiKey = Deno.env.get("SOSOVALUE_API_KEY")!;
  const sb = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  const t0 = Date.now();
  const deadline = t0 + WORK_BUDGET_MS;
  let calls = 0;
  let rows = 0;
  let fresh = 0;
  let deferred = 0;
  const errors: string[] = [];

  // Preload what's already in the table so segments can skip fresh rows and
  // later chain segments can still read data fetched by earlier ones.
  const cached = new Map<string, { data: unknown; age: number }>();
  {
    const { data: preload, error } = await sb
      .from("sosovalue_cache")
      .select("key, data, fetched_at");
    if (error) errors.push(`preload: ${error.message}`);
    for (const r of preload ?? []) {
      cached.set(r.key, { data: r.data, age: t0 - new Date(r.fetched_at).getTime() });
    }
  }

  /** Return data for one SoSoValue path — from a fresh cached row when
   * possible, otherwise fetched + upserted. Past the time budget, defers. */
  // deno-lint-ignore no-explicit-any
  async function pull(path: string): Promise<any | null> {
    const key = `soso:${path}`;
    const hit = cached.get(key);
    if (hit && hit.age < FRESH_MS) {
      fresh++;
      return hit.data;
    }
    if (Date.now() > deadline) {
      deferred++;
      return hit ? hit.data : null; // stale beats nothing for driving loops
    }
    await sleep(RATE_MS);
    calls++;
    try {
      const res = await fetch(`${BASE}${path}`, { headers: { "x-soso-api-key": apiKey } });
      const json = await res.json();
      if (json.code !== 0) throw new Error(json.message ?? `code ${json.code}`);
      const { error } = await sb.from("sosovalue_cache").upsert({
        key,
        data: json.data,
        fetched_at: new Date().toISOString(),
      });
      if (error) throw new Error(error.message);
      rows++;
      cached.set(key, { data: json.data, age: 0 });
      return json.data;
    } catch (e) {
      errors.push(`${path}: ${e instanceof Error ? e.message : String(e)}`);
      return hit ? hit.data : null;
    }
  }

  // 1. reference data
  const currencies = (await pull("/currencies")) as
    | { currency_id: string; symbol: string }[]
    | null;
  const idBySymbol = new Map<string, string>();
  for (const c of currencies ?? []) {
    const s = c.symbol.toLowerCase();
    if (!idBySymbol.has(s)) idBySymbol.set(s, c.currency_id);
  }

  // 2. indices: list, snapshots, constituents — for ALL indices, so the
  // X-ray modal works from Supabase for every index, not just the SoDEX-
  // tokenised three (non-prewarmed constituents would leak live fetches)
  const indices = ((await pull("/indices")) as string[] | null) ?? [];
  for (const t of indices) await pull(`/indices/${t}/market-snapshot`);

  const constituentIds = new Set<string>();
  for (const t of indices.length ? indices : SODEX_INDEX_TICKERS) {
    const cons = (await pull(`/indices/${t}/constituents`)) as
      | { currency_id: string }[]
      | null;
    for (const c of cons ?? []) constituentIds.add(c.currency_id);
  }

  // 3. currency snapshots + klines (constituents ∪ popular pair-intel bases)
  const wantedIds = new Set<string>(constituentIds);
  const klineIds = new Set<string>();
  for (const base of POPULAR_BASES) {
    const norm = base.toLowerCase();
    const id = idBySymbol.get(PAIR_ALIASES[norm] ?? norm);
    if (id) {
      wantedIds.add(id);
      klineIds.add(id);
    }
  }
  for (const id of wantedIds) await pull(`/currencies/${id}/market-snapshot`);

  // day-snapped 35d window — identical formula to src/lib/sosovalue.ts so the
  // cache keys line up with what the app requests
  const DAY = 86_400_000;
  const end = Math.floor(Date.now() / DAY) * DAY;
  const start = end - 35 * DAY;
  for (const id of klineIds) {
    await pull(`/currencies/${id}/klines?interval=1d&start_time=${start}&end_time=${end}&limit=40`);
  }

  // 4. ETF flows + macro calendar
  for (const s of ["BTC", "ETH", "SOL"]) {
    await pull(`/etfs/summary-history?symbol=${s}&country_code=US&limit=15`);
  }
  await pull("/macro/events");

  // 5. progress summary — written every segment
  //    (inspect: select data from sosovalue_cache where key='meta:last_run')
  const done = deferred === 0;
  const summary = {
    finished_at: new Date().toISOString(),
    seconds: Math.round((Date.now() - t0) / 1000),
    chain_depth: depth,
    calls,
    rows_written: rows,
    skipped_fresh: fresh,
    deferred_to_next_segment: deferred,
    done,
    errors,
  };
  const { error: sumErr } = await sb.from("sosovalue_cache").upsert({
    key: "meta:last_run",
    data: summary,
    fetched_at: new Date().toISOString(),
  });
  if (sumErr) console.error("could not write meta:last_run:", sumErr.message);
  console.log("sosovalue-refresh segment done", JSON.stringify(summary));

  // 6. self-chain: re-invoke to finish the deferred work
  if (!done && depth < MAX_CHAIN) {
    try {
      const url = `${Deno.env.get("SUPABASE_URL")}/functions/v1/sosovalue-refresh`;
      const res = await fetch(url, {
        method: "POST",
        headers: {
          "x-cron-secret": Deno.env.get("CRON_SECRET") ?? "",
          "x-chain-depth": String(depth + 1),
        },
      });
      console.log(`chained segment ${depth + 1} → ${res.status}`);
    } catch (e) {
      console.error("self-chain failed:", e instanceof Error ? e.message : String(e));
    }
  }
}

Deno.serve(async (req: Request) => {
  const secret = Deno.env.get("CRON_SECRET");
  if (secret && req.headers.get("x-cron-secret") !== secret) {
    return new Response("unauthorized", { status: 401 });
  }
  if (!Deno.env.get("SOSOVALUE_API_KEY")) {
    return new Response("SOSOVALUE_API_KEY not set", { status: 500 });
  }

  const depth = Math.max(0, parseInt(req.headers.get("x-chain-depth") ?? "0", 10) || 0);
  console.log(`sosovalue-refresh: segment ${depth} starting`);
  const task = run(depth).catch((e) =>
    console.error("sosovalue-refresh FAILED:", e instanceof Error ? e.message : String(e)),
  );

  // Prefer background mode (respond now, keep working) when supported.
  // deno-lint-ignore no-explicit-any
  const er = (globalThis as any).EdgeRuntime;
  if (er && typeof er.waitUntil === "function") {
    er.waitUntil(task);
    return new Response(JSON.stringify({ started: true, segment: depth, mode: "background" }), {
      status: 202,
      headers: { "Content-Type": "application/json" },
    });
  }
  await task;
  return new Response(JSON.stringify({ started: true, segment: depth, mode: "inline-finished" }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
});
