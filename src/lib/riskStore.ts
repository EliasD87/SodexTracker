import { db } from "@/lib/liveStore";
import { nickname } from "@/lib/nickname";

/**
 * Risk views from the collector:
 *   - likely liquidations, from position snapshots that closed or shrank at
 *     the old liquidation price (SoDEX liquidates through the order book, so
 *     trades carry no flag; these are estimates and say so);
 *   - mark vs index, from the minute-by-minute market snapshots: how far each
 *     perp trades from its underlying and how often it stretches.
 * Traders appear under nicknames only.
 */

const HOUR = 3_600_000;
const DAY = 24 * HOUR;

export interface Liquidation {
  name: string;
  ts: number;
  market: string;
  side: "LONG" | "SHORT";
  usd: number;
  price: number | null;
  /** The whole position (close) or part of it (reduce). */
  full: boolean;
}

export interface LiqTotals {
  count: number;
  usd: number;
  longUsd: number;
  shortUsd: number;
}

export interface BasisRow {
  market: string;
  oi: number | null;
  /** (mark − index) ÷ index, latest. */
  now: number | null;
  /** Average of |basis| over the window. */
  avgAbs: number | null;
  /** Largest |basis| seen, with its sign. */
  max: number | null;
  /** Share of snapshots more than 0.1% from index. */
  stretched: number | null;
  samples: number;
}

export interface RiskData {
  available: true;
  liquidations: { tracked: boolean; day: LiqTotals; week: LiqTotals; recent: Liquidation[] };
  basis: {
    from: number | null;
    to: number | null;
    hours: number;
    rows: BasisRow[];
    /** Hourly average basis for the busiest markets, oldest first. */
    series: Record<string, { t: number; basis: number }[]>;
  };
}

export type RiskResult = RiskData | { available: false; reason: string };

const has = (d: NonNullable<ReturnType<typeof db>>, t: string) => !!d.prepare("SELECT 1 FROM sqlite_schema WHERE type = 'table' AND name = ?").get(t);

export function riskData(hours = 48): RiskResult {
  const d = db();
  if (!d) return { available: false, reason: "The collector isn't running here yet." };
  const now = Date.now();

  // Likely liquidations.
  const tracked = has(d, "account_events");
  const totals = (since: number): LiqTotals => {
    if (!tracked) return { count: 0, usd: 0, longUsd: 0, shortUsd: 0 };
    const r = d
      .prepare(`
        SELECT COUNT(*) n, COALESCE(SUM(usd), 0) usd,
               COALESCE(SUM(CASE side WHEN 'LONG' THEN usd END), 0) l, COALESCE(SUM(CASE side WHEN 'SHORT' THEN usd END), 0) s
        FROM account_events WHERE liquidated = 1 AND ts >= ?`)
      .get(since) as { n: number; usd: number; l: number; s: number };
    return { count: r.n, usd: r.usd, longUsd: r.l, shortUsd: r.s };
  };
  const recent: Liquidation[] = tracked
    ? (
        d
          .prepare("SELECT account_id, ts, market, side, usd, price, kind FROM account_events WHERE liquidated = 1 ORDER BY ts DESC LIMIT 25")
          .all() as { account_id: number; ts: number; market: string; side: "LONG" | "SHORT"; usd: number | null; price: number | null; kind: string }[]
      ).map((e) => ({ name: nickname(e.account_id), ts: e.ts, market: e.market, side: e.side, usd: e.usd ?? 0, price: e.price, full: e.kind === "close" }))
    : [];

  // Mark vs index: minute snapshots, with older hours from the roll-up.
  const from = now - hours * HOUR;
  const rows = has(d, "ticker_minute")
    ? (d
        .prepare(`
          SELECT market, minute t, mark, idx, oi FROM ticker_minute WHERE minute >= ? AND mark > 0 AND idx > 0
          UNION ALL
          SELECT market, hour t, mark, idx, oi FROM ticker_hour WHERE hour >= ? AND mark > 0 AND idx > 0
          ORDER BY t`)
        .all(from, from) as { market: string; t: number; mark: number; idx: number; oi: number | null }[])
    : [];

  const by = new Map<string, { t: number; b: number; oi: number | null }[]>();
  for (const r of rows) {
    const list = by.get(r.market) ?? [];
    list.push({ t: r.t, b: (r.mark - r.idx) / r.idx, oi: r.oi });
    by.set(r.market, list);
  }
  const basisRows: BasisRow[] = [...by.entries()].map(([market, list]) => {
    const abs = list.map((x) => Math.abs(x.b));
    const maxIdx = abs.indexOf(Math.max(...abs));
    const last = list[list.length - 1];
    return {
      market,
      oi: last.oi,
      now: last.b,
      avgAbs: abs.reduce((a, b) => a + b, 0) / abs.length,
      max: list[maxIdx].b,
      stretched: abs.filter((x) => x > 0.001).length / abs.length,
      samples: list.length,
    };
  });
  basisRows.sort((a, b) => (b.oi ?? 0) - (a.oi ?? 0));

  const series: RiskData["basis"]["series"] = {};
  for (const r of basisRows.slice(0, 6)) {
    const buckets = new Map<number, { s: number; n: number }>();
    for (const x of by.get(r.market)!) {
      const h = Math.floor(x.t / HOUR) * HOUR;
      const e = buckets.get(h) ?? { s: 0, n: 0 };
      e.s += x.b;
      e.n++;
      buckets.set(h, e);
    }
    series[r.market] = [...buckets.entries()].sort((a, b) => a[0] - b[0]).map(([t, e]) => ({ t, basis: e.s / e.n }));
  }

  return {
    available: true,
    liquidations: { tracked, day: totals(now - DAY), week: totals(now - 7 * DAY), recent },
    basis: {
      from: rows.length ? rows[0].t : null,
      to: rows.length ? rows[rows.length - 1].t : null,
      hours,
      rows: basisRows.slice(0, 12),
      series,
    },
  };
}
