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
const compact = (n: number) => (n >= 1e6 ? `$${(n / 1e6).toFixed(1)}M` : n >= 1e3 ? `$${(n / 1e3).toFixed(1)}K` : `$${n.toFixed(0)}`);

type Boards = Pick<Rankings, "biggestPositions" | "richList" | "upnlWinners" | "upnlLosers" | "highestExposure" | "topEarners" | "topLosers">;

interface Shared {
  holders: number;
  traders: number;
  boards: Boards;
  /** An account's equity, looked up once and remembered for this build. */
  equityOf: (id: number) => number | null | undefined;
}

/**
 * Everything but deposits and withdrawals is the same whatever the window,
 * so it's built once and shared by the 24H, 7D and 30D rankings asked for
 * together. Only the top ten of each list is read from the database, and
 * equity only for the accounts that appear, never all of them.
 */
const SHARE_MS = 20_000;
let shared: { at: number; build: Promise<Shared> } | null = null;

async function buildShared(): Promise<Shared> {
  const d = db()!;
  const { marks } = await liveMarks();

  const equityStmt = d.prepare("SELECT equity FROM pos_accounts WHERE account_id = ?");
  const seen = new Map<number, number | null | undefined>();
  const equityOf = (id: number) => {
    if (!seen.has(id)) seen.set(id, (equityStmt.get(id) as { equity: number | null } | undefined)?.equity);
    return seen.get(id);
  };
  const entry = (id: number, value: number, detail?: string): RankEntry => ({ name: nickname(id), group: groupOf(equityOf(id)), value, detail });
  const top = <T>(xs: T[], by: (x: T) => number, n = 10) => [...xs].sort((a, b) => by(b) - by(a)).slice(0, n);

  const traders = (d.prepare("SELECT COUNT(*) n FROM pos_accounts").get() as { n: number }).n;
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
      group: groupOf(equityOf(p.id)),
      value: notional,
      side: p.size > 0 ? "LONG" : "SHORT",
      market: p.market,
      detail: `${p.leverage ? `${p.leverage}× · ` : ""}${upnl >= 0 ? "+" : "−"}${compact(Math.abs(upnl))}`,
    });
  }

  const held = [...perAccount.entries()];
  const exposure = held
    .map(([id, a]) => ({ id, a, eq: equityOf(id) ?? 0 }))
    .filter((x) => x.eq >= 10_000)
    .map((x) => ({ ...x, ratio: x.a.notional / x.eq }));
  const rich = d.prepare("SELECT account_id id, equity FROM pos_accounts WHERE equity > 0 ORDER BY equity DESC LIMIT 10").all() as {
    id: number;
    equity: number;
  }[];
  const earners = d.prepare("SELECT account_id id, alltime_pnl pnl FROM pos_accounts WHERE alltime_pnl > 0 ORDER BY alltime_pnl DESC LIMIT 10").all() as {
    id: number;
    pnl: number;
  }[];
  const losers = d.prepare("SELECT account_id id, alltime_pnl pnl FROM pos_accounts WHERE alltime_pnl < 0 ORDER BY alltime_pnl ASC LIMIT 10").all() as {
    id: number;
    pnl: number;
  }[];

  return {
    holders: perAccount.size,
    traders,
    equityOf,
    boards: {
      biggestPositions: top(pos, (p) => p.value),
      richList: rich.map((a) => entry(a.id, a.equity, perAccount.has(a.id) ? `${compact(perAccount.get(a.id)!.notional)} in positions` : "No open positions")),
      upnlWinners: top(
        held.filter(([, a]) => a.upnl > 0),
        ([, a]) => a.upnl,
      ).map(([id, a]) => entry(id, a.upnl, `on ${compact(a.notional)}`)),
      upnlLosers: top(
        held.filter(([, a]) => a.upnl < 0),
        ([, a]) => -a.upnl,
      ).map(([id, a]) => entry(id, a.upnl, `on ${compact(a.notional)}`)),
      highestExposure: top(exposure, (x) => x.ratio).map((x) => entry(x.id, x.ratio, `${compact(x.a.notional)} on ${compact(x.eq)}`)),
      topEarners: earners.map((a) => entry(a.id, a.pnl)),
      topLosers: losers.map((a) => entry(a.id, a.pnl)),
    },
  };
}

export async function rankings(days: number): Promise<RankingsResult> {
  const d = db();
  if (!d) return { available: false, reason: "The collector isn't running here yet." };
  const has = d.prepare("SELECT 1 FROM sqlite_schema WHERE type = 'table' AND name = 'pos_accounts'").get();
  if (!has) return { available: false, reason: "The collector hasn't started tracking traders yet." };

  if (!shared || Date.now() - shared.at > SHARE_MS) {
    const build = buildShared();
    shared = { at: Date.now(), build };
    build.catch(() => (shared = null));
  }
  const base = await shared.build;
  const entry = (id: number, value: number, detail?: string): RankEntry => ({ name: nickname(id), group: groupOf(base.equityOf(id)), value, detail });
  const top = <T>(xs: T[], by: (x: T) => number, n = 10) => [...xs].sort((a, b) => by(b) - by(a)).slice(0, n);

  // Deposits and withdrawals per account over the window, if the ledger job has run.
  let depositors: RankEntry[] = [];
  let withdrawers: RankEntry[] = [];
  let ledgers = 0;
  const hasFunds = d.prepare("SELECT 1 FROM sqlite_schema WHERE type = 'table' AND name = 'fund_flows'").get();
  if (hasFunds) {
    ledgers = (d.prepare("SELECT COUNT(checked_at) n FROM fund_accounts").get() as { n: number }).n;
    const since = Date.now() - days * DAY;
    const flows = d
      .prepare(
        `
        SELECT account_id id, SUM(CASE direction WHEN 'in' THEN usd ELSE 0 END) i, SUM(CASE direction WHEN 'out' THEN usd ELSE 0 END) o
        FROM fund_flows WHERE ts >= ? AND usd IS NOT NULL GROUP BY account_id`,
      )
      .all(since) as { id: number; i: number; o: number }[];
    depositors = top(
      flows.filter((f) => f.i > 0),
      (f) => f.i,
    ).map((f) => entry(f.id, twoSig(f.i), f.o > 0 ? `${compact(twoSig(f.o))} out` : undefined));
    withdrawers = top(
      flows.filter((f) => f.o > 0),
      (f) => f.o,
    ).map((f) => entry(f.id, twoSig(f.o), f.i > 0 ? `${compact(twoSig(f.i))} in` : undefined));
  }

  return {
    available: true,
    asOf: Date.now(),
    window: days,
    coverage: { holders: base.holders, traders: base.traders, ledgers },
    ...base.boards,
    depositors,
    withdrawers,
  };
}
