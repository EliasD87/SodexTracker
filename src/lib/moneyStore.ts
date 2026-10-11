import { db, type Cohort } from "@/lib/liveStore";

/**
 * Money in and out of SoDEX: deposits and withdrawals from the collector's
 * ledger reads. Totals only. Accounts, addresses and transactions never leave
 * this module.
 */

const HOUR = 3_600_000;
const DAY = 86_400_000;

export interface MoneyTotals {
  in: number;
  out: number;
  net: number;
  deposits: number;
  withdrawals: number;
  depositors: number;
  withdrawers: number;
}

export interface MoneyBreakdown {
  key: string;
  in: number;
  out: number;
  net: number;
  /** Movements either way. */
  count: number;
}

export interface MoneyMove {
  /**
   * Rounded down to the hour, with the amount to two significant figures:
   * exact values could be matched on a block explorer to the address behind
   * them.
   */
  hour: number;
  direction: "in" | "out";
  usd: number;
  coin: string;
  chain: string;
  group: Cohort;
}

export interface MoneySize {
  key: string;
  deposits: number;
  depositUsd: number;
  withdrawals: number;
  withdrawUsd: number;
}

export interface MoneyFlow {
  available: true;
  days: number;
  /** Complete UTC days covered, as YYYY-MM-DD. */
  from: string;
  to: string;
  coverage: {
    /** Accounts known, and how many of their ledgers have been read at least once. */
    accounts: number;
    read: number;
    /** Most recent ledger read, ms. */
    lastRead: number | null;
    /** Movements in the window with no USD value yet (a coin SoDEX doesn't list). */
    unpriced: number;
  };
  totals: MoneyTotals;
  prev: MoneyTotals;
  /** Today so far (UTC), outside the window's figures. */
  today: { in: number; out: number };
  firstTimeDepositors: number;
  medianDeposit: number | null;
  series: { date: string; in: number; out: number; net: number }[];
  byChain: MoneyBreakdown[];
  byCoin: MoneyBreakdown[];
  byGroup: (MoneyBreakdown & { accounts: number })[];
  bySize: MoneySize[];
  largest: MoneyMove[];
}

export type MoneyResult = MoneyFlow | { available: false; reason: string };

const SIZE_BUCKETS: [string, number][] = [
  ["Under $1K", 1_000],
  ["$1K–10K", 10_000],
  ["$10K–100K", 100_000],
  ["$100K–1M", 1_000_000],
  ["$1M and up", Infinity],
];

/** SoDEX's chain codes (ARBITRUM_ETH: the chain, then its gas token) as names. */
const CHAIN: Record<string, string> = {
  ARBITRUM: "Arbitrum",
  ETH: "Ethereum",
  BASE: "Base",
  BSC: "BNB Chain",
  SOL: "Solana",
  BTC: "Bitcoin",
  ADA: "Cardano",
  TON: "TON",
  MATIC: "Polygon",
  POLYGON: "Polygon",
  OP: "Optimism",
  OPTIMISM: "Optimism",
  AVAX: "Avalanche",
  TRX: "Tron",
  SUI: "Sui",
  HYPEREVM: "HyperEVM",
  ROBINHOOD: "Robinhood Chain",
  VALUECHAIN: "ValueChain",
};
export function chainName(code: string): string {
  const head = code.split("_")[0].toUpperCase();
  if (CHAIN[head]) return CHAIN[head];
  // Rows read before chains were stored as codes already carry a name.
  if (/[a-z]/.test(code)) return code;
  return head.charAt(0) + head.slice(1).toLowerCase();
}

const twoSig = (n: number) => {
  if (!(n > 0)) return 0;
  const mag = 10 ** (Math.floor(Math.log10(n)) - 1);
  return Math.round(n / mag) * mag;
};

type Dir = "in" | "out";

/** Deposits and withdrawals over the last `days` complete UTC days. */
export function moneyFlow(days: number): MoneyResult {
  const d = db();
  if (!d) return { available: false, reason: "The collector isn't running here yet." };
  const hasTable = d.prepare("SELECT 1 FROM sqlite_schema WHERE type = 'table' AND name = 'fund_flows'").get();
  if (!hasTable) return { available: false, reason: "The collector hasn't started reading deposits and withdrawals yet." };
  const acc = d.prepare("SELECT COUNT(*) n, COUNT(checked_at) r, MAX(checked_at) last FROM fund_accounts").get() as {
    n: number;
    r: number;
    last: number | null;
  };
  if (!acc.r) return { available: false, reason: "No account ledgers have been read yet." };

  const today = Math.floor(Date.now() / DAY) * DAY;
  const from = today - days * DAY;
  const prevFrom = from - days * DAY;

  const totalsQ = d.prepare(`
    SELECT direction, COALESCE(SUM(usd), 0) usd, COUNT(*) n, COUNT(DISTINCT account_id) accounts
    FROM fund_flows WHERE ts >= ? AND ts < ? GROUP BY direction`);
  const totals = (a: number, b: number): MoneyTotals => {
    const rows = totalsQ.all(a, b) as { direction: Dir; usd: number; n: number; accounts: number }[];
    const i = rows.find((r) => r.direction === "in");
    const o = rows.find((r) => r.direction === "out");
    return {
      in: i?.usd ?? 0,
      out: o?.usd ?? 0,
      net: (i?.usd ?? 0) - (o?.usd ?? 0),
      deposits: i?.n ?? 0,
      withdrawals: o?.n ?? 0,
      depositors: i?.accounts ?? 0,
      withdrawers: o?.accounts ?? 0,
    };
  };
  const todayT = totals(today, today + DAY);

  const daily = d
    .prepare(`SELECT (ts / ${DAY}) * ${DAY} AS day, direction, SUM(usd) usd FROM fund_flows WHERE ts >= ? AND ts < ? GROUP BY day, direction`)
    .all(from, today) as { day: number; direction: Dir; usd: number | null }[];
  const byDay = new Map<number, { in: number; out: number }>();
  for (const r of daily) {
    const e = byDay.get(r.day) ?? { in: 0, out: 0 };
    e[r.direction] += r.usd ?? 0;
    byDay.set(r.day, e);
  }
  const series = Array.from({ length: days }, (_, i) => {
    const day = from + i * DAY;
    const e = byDay.get(day) ?? { in: 0, out: 0 };
    return { date: new Date(day).toISOString().slice(0, 10), in: e.in, out: e.out, net: e.in - e.out };
  });

  const breakdown = (col: "chain" | "coin"): MoneyBreakdown[] => {
    const rows = d
      .prepare(`SELECT ${col} k, direction, COALESCE(SUM(usd), 0) usd, COUNT(*) n FROM fund_flows WHERE ts >= ? AND ts < ? GROUP BY k, direction`)
      .all(from, today) as { k: string; direction: Dir; usd: number; n: number }[];
    const m = new Map<string, MoneyBreakdown>();
    for (const r of rows) {
      const key = col === "chain" ? chainName(r.k) : r.k;
      const e = m.get(key) ?? { key, in: 0, out: 0, net: 0, count: 0 };
      e[r.direction] += r.usd;
      e.count += r.n;
      e.net = e.in - e.out;
      m.set(key, e);
    }
    return [...m.values()].sort((a, b) => b.in + b.out - (a.in + a.out));
  };

  // Groups are today's labels, applied to the whole window.
  const groupRows = d
    .prepare(`
      SELECT COALESCE(c.cohort, 'retail') k, f.direction, COALESCE(SUM(f.usd), 0) usd, COUNT(*) n
      FROM fund_flows f LEFT JOIN cohorts c ON c.account_id = f.account_id
      WHERE f.ts >= ? AND f.ts < ? GROUP BY k, f.direction`)
    .all(from, today) as { k: Cohort; direction: Dir; usd: number; n: number }[];
  const groupAccounts = new Map(
    (
      d
        .prepare(`
          SELECT COALESCE(c.cohort, 'retail') k, COUNT(DISTINCT f.account_id) n
          FROM fund_flows f LEFT JOIN cohorts c ON c.account_id = f.account_id
          WHERE f.ts >= ? AND f.ts < ? GROUP BY k`)
        .all(from, today) as { k: string; n: number }[]
    ).map((r) => [r.k, r.n]),
  );
  const groups = new Map<string, MoneyBreakdown & { accounts: number }>();
  for (const r of groupRows) {
    const e = groups.get(r.k) ?? { key: r.k, in: 0, out: 0, net: 0, count: 0, accounts: groupAccounts.get(r.k) ?? 0 };
    e[r.direction] += r.usd;
    e.count += r.n;
    e.net = e.in - e.out;
    groups.set(r.k, e);
  }

  const sizeRows = d
    .prepare("SELECT direction, usd FROM fund_flows WHERE ts >= ? AND ts < ? AND usd IS NOT NULL")
    .all(from, today) as { direction: Dir; usd: number }[];
  const bySize: MoneySize[] = SIZE_BUCKETS.map(([key]) => ({ key, deposits: 0, depositUsd: 0, withdrawals: 0, withdrawUsd: 0 }));
  const ins: number[] = [];
  for (const r of sizeRows) {
    const b = bySize[SIZE_BUCKETS.findIndex(([, max]) => r.usd < max)];
    if (r.direction === "in") {
      b.deposits++;
      b.depositUsd += r.usd;
      ins.push(r.usd);
    } else {
      b.withdrawals++;
      b.withdrawUsd += r.usd;
    }
  }
  ins.sort((a, b) => a - b);
  const mid = ins.length >> 1;
  const medianDeposit = ins.length ? (ins.length % 2 ? ins[mid] : (ins[mid - 1] + ins[mid]) / 2) : null;

  const firstTime = d
    .prepare(`
      SELECT COUNT(*) n FROM (
        SELECT MIN(ts) first FROM fund_flows WHERE direction = 'in' GROUP BY account_id
      ) WHERE first >= ? AND first < ?`)
    .get(from, today) as { n: number };

  const largest = (
    d
      .prepare(`
        SELECT f.ts, f.direction, f.usd, f.coin, f.chain, COALESCE(c.cohort, 'retail') grp
        FROM fund_flows f LEFT JOIN cohorts c ON c.account_id = f.account_id
        WHERE f.ts >= ? AND f.ts < ? AND f.usd IS NOT NULL ORDER BY f.usd DESC LIMIT 20`)
      .all(from, today) as { ts: number; direction: Dir; usd: number; coin: string; chain: string; grp: Cohort }[]
  ).map((r) => ({
    hour: Math.floor(r.ts / HOUR) * HOUR,
    direction: r.direction,
    usd: twoSig(r.usd),
    coin: r.coin,
    chain: chainName(r.chain),
    group: r.grp,
  }));

  const unpriced = d.prepare("SELECT COUNT(*) n FROM fund_flows WHERE ts >= ? AND ts < ? AND usd IS NULL").get(from, today) as { n: number };

  return {
    available: true,
    days,
    from: new Date(from).toISOString().slice(0, 10),
    to: new Date(today - DAY).toISOString().slice(0, 10),
    coverage: { accounts: acc.n, read: acc.r, lastRead: acc.last, unpriced: unpriced.n },
    totals: totals(from, today),
    prev: totals(prevFrom, from),
    today: { in: todayT.in, out: todayT.out },
    firstTimeDepositors: firstTime.n,
    medianDeposit,
    series,
    byChain: breakdown("chain"),
    byCoin: breakdown("coin"),
    byGroup: [...groups.values()].sort((a, b) => b.in + b.out - (a.in + a.out)),
    bySize,
    largest,
  };
}
