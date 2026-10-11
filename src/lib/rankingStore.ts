import { db } from "@/lib/liveStore";
import { nickname } from "@/lib/nickname";
import { liveMarks, sizeOf, SIZE_GROUPS, type SizeGroup } from "@/lib/positionStore";

/**
 * Rankings built from the collector's own data: open positions, equity, track
 * records and deposits. Traders appear under their nickname, which links to
 * their page; no address or account ID is sent.
 *
 * Deposit and withdrawal totals are rounded to two significant figures, so
 * they can't be matched to a transaction on a block explorer.
 */

const DAY = 86_400_000;
const SIZE_LABEL = new Map(SIZE_GROUPS.map((g) => [g.key, g.label]));

export interface RankEntry {
  name: string;
  group: string;
  value: number;
  /** A second figure shown beside the value (meaning depends on the board). */
  detail?: string;
  side?: "LONG" | "SHORT";
  market?: string;
}

export interface Rankings {
  available: true;
  asOf: number;
  window: number;
  coverage: { holders: number; traders: number; ledgers: number };
  biggestPositions: RankEntry[];
  richList: RankEntry[];
  upnlWinners: RankEntry[];
  upnlLosers: RankEntry[];
  highestExposure: RankEntry[];
  topEarners: RankEntry[];
  topLosers: RankEntry[];
  depositors: RankEntry[];
  withdrawers: RankEntry[];
}

export type RankingsResult = Rankings | { available: false; reason: string };

const twoSig = (n: number) => {
  if (!(Math.abs(n) > 0)) return 0;
  const mag = 10 ** (Math.floor(Math.log10(Math.abs(n))) - 1);
  return Math.round(n / mag) * mag;
};
const label = (g: SizeGroup) => SIZE_LABEL.get(g) ?? "";
/** Size group, or a plain note when the account's equity hasn't been read yet. */
const groupOf = (equity: number | null | undefined) => (equity == null ? "Size not read yet" : label(sizeOf(equity)));
const compact = (n: number) =>
  n >= 1e6 ? `$${(n / 1e6).toFixed(1)}M` : n >= 1e3 ? `$${(n / 1e3).toFixed(1)}K` : `$${n.toFixed(0)}`;

export async function rankings(days: number): Promise<RankingsResult> {
  const d = db();
  if (!d) return { available: false, reason: "The collector isn't running here yet." };
  const has = d.prepare("SELECT 1 FROM sqlite_schema WHERE type = 'table' AND name = 'pos_accounts'").get();
  if (!has) return { available: false, reason: "The collector hasn't started tracking traders yet." };

  const { marks } = await liveMarks();
  const accounts = d.prepare("SELECT account_id id, equity, alltime_pnl pnl FROM pos_accounts").all() as { id: number; equity: number | null; pnl: number | null }[];
  const acc = new Map(accounts.map((a) => [a.id, a]));
  const positions = d.prepare("SELECT account_id id, market, size, entry, leverage FROM open_positions").all() as {
    id: number;
    market: string;
    size: number;
    entry: number;
    leverage: number | null;
  }[];

  const perAccount = new Map<number, { notional: number; upnl: number }>();
  const pos: RankEntry[] = [];
  for (const p of positions) {
    const mark = marks.get(p.market) ?? p.entry;
    const notional = Math.abs(p.size) * mark;
    const upnl = p.size * (mark - p.entry);
    const a = perAccount.get(p.id) ?? { notional: 0, upnl: 0 };
    a.notional += notional;
    a.upnl += upnl;
    perAccount.set(p.id, a);
    pos.push({
      name: nickname(p.id),
      group: groupOf(acc.get(p.id)?.equity),
      value: notional,
      side: p.size > 0 ? "LONG" : "SHORT",
      market: p.market,
      detail: `${p.leverage ? `${p.leverage}× · ` : ""}${upnl >= 0 ? "+" : "−"}${compact(Math.abs(upnl))}`,
    });
  }

  const entry = (id: number, value: number, detail?: string): RankEntry => ({
    name: nickname(id),
    group: groupOf(acc.get(id)?.equity),
    value,
    detail,
  });
  const top = <T,>(xs: T[], by: (x: T) => number, n = 10) => [...xs].sort((a, b) => by(b) - by(a)).slice(0, n);

  const held = [...perAccount.entries()];
  const withEquity = accounts.filter((a) => a.equity != null && a.equity > 0);
  const exposure = held
    .map(([id, a]) => ({ id, a, eq: acc.get(id)?.equity ?? 0 }))
    .filter((x) => x.eq >= 10_000)
    .map((x) => ({ ...x, ratio: x.a.notional / x.eq }));

  // Deposits and withdrawals per account over the window, if the ledger job has run.
  let depositors: RankEntry[] = [];
  let withdrawers: RankEntry[] = [];
  let ledgers = 0;
  const hasFunds = d.prepare("SELECT 1 FROM sqlite_schema WHERE type = 'table' AND name = 'fund_flows'").get();
  if (hasFunds) {
    ledgers = (d.prepare("SELECT COUNT(checked_at) n FROM fund_accounts").get() as { n: number }).n;
    const since = Date.now() - days * DAY;
    const flows = d
      .prepare(`
        SELECT account_id id, SUM(CASE direction WHEN 'in' THEN usd ELSE 0 END) i, SUM(CASE direction WHEN 'out' THEN usd ELSE 0 END) o
        FROM fund_flows WHERE ts >= ? AND usd IS NOT NULL GROUP BY account_id`)
      .all(since) as { id: number; i: number; o: number }[];
    depositors = top(flows.filter((f) => f.i > 0), (f) => f.i).map((f) => entry(f.id, twoSig(f.i), f.o > 0 ? `${compact(twoSig(f.o))} out` : undefined));
    withdrawers = top(flows.filter((f) => f.o > 0), (f) => f.o).map((f) => entry(f.id, twoSig(f.o), f.i > 0 ? `${compact(twoSig(f.i))} in` : undefined));
  }

  return {
    available: true,
    asOf: Date.now(),
    window: days,
    coverage: { holders: perAccount.size, traders: accounts.length, ledgers },
    biggestPositions: top(pos, (p) => p.value),
    richList: top(withEquity, (a) => a.equity!).map((a) =>
      entry(a.id, a.equity!, perAccount.has(a.id) ? `${compact(perAccount.get(a.id)!.notional)} in positions` : "No open positions"),
    ),
    upnlWinners: top(held.filter(([, a]) => a.upnl > 0), ([, a]) => a.upnl).map(([id, a]) => entry(id, a.upnl, `on ${compact(a.notional)}`)),
    upnlLosers: top(held.filter(([, a]) => a.upnl < 0), ([, a]) => -a.upnl).map(([id, a]) => entry(id, a.upnl, `on ${compact(a.notional)}`)),
    highestExposure: top(exposure, (x) => x.ratio).map((x) => entry(x.id, x.ratio, `${compact(x.a.notional)} on ${compact(x.eq)}`)),
    topEarners: top(accounts.filter((a) => (a.pnl ?? 0) > 0), (a) => a.pnl!).map((a) => entry(a.id, a.pnl!)),
    topLosers: top(accounts.filter((a) => (a.pnl ?? 0) < 0), (a) => -a.pnl!).map((a) => entry(a.id, a.pnl!)),
    depositors,
    withdrawers,
  };
}
