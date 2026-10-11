import { db, COHORT_LABEL, type Cohort } from "@/lib/liveStore";
import { accountOf, nickname } from "@/lib/nickname";
import { liveMarks, recordOf, sizeOf, RECORD_GROUPS, SIZE_GROUPS } from "@/lib/positionStore";
import { chainName } from "@/lib/moneyStore";

/**
 * One trader's page, by nickname: everything the collector knows about the
 * account, with no address or account ID ever sent. Positions are valued at
 * live prices; money movements are rounded (hour, two figures) so none can be
 * matched to a transaction on a block explorer.
 */

const DAY = 86_400_000;
const HOUR = 3_600_000;

export interface TraderPosition {
  market: string;
  side: "LONG" | "SHORT";
  size: number;
  notional: number;
  entry: number;
  mark: number;
  liq: number | null;
  /** Fraction price must move against the position to reach liquidation. */
  distance: number | null;
  leverage: number | null;
  marginMode: string | null;
  upnl: number;
  openedAt: number | null;
}

export interface TraderProfile {
  available: true;
  name: string;
  groups: { size: string | null; record: string | null; live: string | null };
  equity: number | null;
  alltimePnl: number | null;
  alltimeVolume: number | null;
  /** When the positions below were read from SoDEX. */
  positionsAt: number | null;
  positions: TraderPosition[];
  totals: { notional: number; upnl: number; longUsd: number; shortUsd: number; exposure: number | null };
  money: {
    read: boolean;
    in: number;
    out: number;
    chains: string[];
    recent: { hour: number; direction: "in" | "out"; usd: number | null; coin: string; chain: string }[];
  } | null;
  activity: { days: { date: string; volume: number }[]; markets: { market: string; volume: number }[]; makerShare: number | null; fills: number } | null;
}

export type TraderResult = TraderProfile | { available: false; reason: string };

const twoSig = (n: number) => {
  if (!(Math.abs(n) > 0)) return 0;
  const mag = 10 ** (Math.floor(Math.log10(Math.abs(n))) - 1);
  return Math.round(n / mag) * mag;
};
const has = (d: NonNullable<ReturnType<typeof db>>, table: string) =>
  !!d.prepare("SELECT 1 FROM sqlite_schema WHERE type = 'table' AND name = ?").get(table);

export async function traderProfile(name: string): Promise<TraderResult> {
  const id = accountOf(name);
  if (id == null) return { available: false, reason: "There's no trader by that name." };
  const d = db();
  if (!d) return { available: false, reason: "The collector isn't running here yet." };

  const acct = has(d, "pos_accounts")
    ? (d.prepare("SELECT equity, alltime_pnl, alltime_volume, snapshot_at FROM pos_accounts WHERE account_id = ?").get(id) as
        | { equity: number | null; alltime_pnl: number | null; alltime_volume: number | null; snapshot_at: number | null }
        | undefined)
    : undefined;
  const known = acct || (has(d, "fund_accounts") && d.prepare("SELECT 1 FROM fund_accounts WHERE account_id = ?").get(id));
  if (!known) return { available: false, reason: "This trader isn't tracked yet." };

  // Positions, valued now.
  const { marks } = await liveMarks();
  const rows = has(d, "open_positions")
    ? (d.prepare("SELECT market, size, entry, leverage, liq_price, margin_mode, opened_at FROM open_positions WHERE account_id = ?").all(id) as {
        market: string;
        size: number;
        entry: number;
        leverage: number | null;
        liq_price: number | null;
        margin_mode: string | null;
        opened_at: number | null;
      }[])
    : [];
  const positions: TraderPosition[] = rows
    .map((r) => {
      const mark = marks.get(r.market) ?? r.entry;
      const long = r.size > 0;
      return {
        market: r.market,
        side: long ? ("LONG" as const) : ("SHORT" as const),
        size: Math.abs(r.size),
        notional: Math.abs(r.size) * mark,
        entry: r.entry,
        mark,
        liq: r.liq_price && r.liq_price > 0 ? r.liq_price : null,
        distance: r.liq_price && r.liq_price > 0 ? (long ? (mark - r.liq_price) / mark : (r.liq_price - mark) / mark) : null,
        leverage: r.leverage,
        marginMode: r.margin_mode,
        upnl: r.size * (mark - r.entry),
        openedAt: r.opened_at,
      };
    })
    .sort((a, b) => b.notional - a.notional);
  const notional = positions.reduce((a, p) => a + p.notional, 0);
  const equity = acct?.equity ?? null;

  // Money in and out, if the ledger has been read.
  let money: TraderProfile["money"] = null;
  if (has(d, "fund_flows")) {
    const read = !!(d.prepare("SELECT checked_at FROM fund_accounts WHERE account_id = ?").get(id) as { checked_at: number | null } | undefined)?.checked_at;
    const flows = d
      .prepare("SELECT ts, direction, usd, coin, chain FROM fund_flows WHERE account_id = ? ORDER BY ts DESC")
      .all(id) as { ts: number; direction: "in" | "out"; usd: number | null; coin: string; chain: string }[];
    money = {
      read,
      in: twoSig(flows.filter((f) => f.direction === "in").reduce((a, f) => a + (f.usd ?? 0), 0)),
      out: twoSig(flows.filter((f) => f.direction === "out").reduce((a, f) => a + (f.usd ?? 0), 0)),
      chains: [...new Set(flows.map((f) => chainName(f.chain)))],
      recent: flows.slice(0, 10).map((f) => ({
        hour: Math.floor(f.ts / HOUR) * HOUR,
        direction: f.direction,
        usd: f.usd == null ? null : twoSig(f.usd),
        coin: f.coin,
        chain: chainName(f.chain),
      })),
    };
  }

  // Trading activity from the live trade stream, last 30 days.
  let activity: TraderProfile["activity"] = null;
  if (has(d, "account_day")) {
    const since = new Date(Date.now() - 30 * DAY).toISOString().slice(0, 10);
    const days = d
      .prepare("SELECT day, SUM(bought_usd + sold_usd) v, SUM(maker_usd) m, SUM(taker_usd) t, SUM(fills) f FROM account_day WHERE account_id = ? AND day >= ? GROUP BY day ORDER BY day")
      .all(id, since) as { day: string; v: number; m: number; t: number; f: number }[];
    if (days.length) {
      const markets = d
        .prepare("SELECT market, SUM(bought_usd + sold_usd) v FROM account_day WHERE account_id = ? AND day >= ? GROUP BY market ORDER BY v DESC LIMIT 6")
        .all(id, since) as { market: string; v: number }[];
      const maker = days.reduce((a, x) => a + x.m, 0);
      const taker = days.reduce((a, x) => a + x.t, 0);
      // Always 30 day slots, oldest first, so quiet days show as gaps.
      const byDay = new Map(days.map((x) => [x.day, x.v]));
      activity = {
        days: Array.from({ length: 30 }, (_, i) => {
          const date = new Date(Date.now() - (29 - i) * DAY).toISOString().slice(0, 10);
          return { date, volume: byDay.get(date) ?? 0 };
        }),
        markets: markets.map((m) => ({ market: m.market, volume: m.v })),
        makerShare: maker + taker > 0 ? maker / (maker + taker) : null,
        fills: days.reduce((a, x) => a + x.f, 0),
      };
    }
  }

  const live = has(d, "cohorts") ? (d.prepare("SELECT cohort FROM cohorts WHERE account_id = ?").get(id) as { cohort: Cohort } | undefined)?.cohort : undefined;
  const rg = recordOf(acct?.alltime_pnl ?? null);

  return {
    available: true,
    name: nickname(id),
    groups: {
      size: equity == null ? null : SIZE_GROUPS.find((g) => g.key === sizeOf(equity))!.label,
      record: rg ? RECORD_GROUPS.find((g) => g.key === rg)!.label : null,
      live: live && live !== "retail" && live !== "unattributed" ? COHORT_LABEL[live] : null,
    },
    equity,
    alltimePnl: acct?.alltime_pnl ?? null,
    alltimeVolume: acct?.alltime_volume ?? null,
    positionsAt: acct?.snapshot_at ?? null,
    positions,
    totals: {
      notional,
      upnl: positions.reduce((a, p) => a + p.upnl, 0),
      longUsd: positions.filter((p) => p.side === "LONG").reduce((a, p) => a + p.notional, 0),
      shortUsd: positions.filter((p) => p.side === "SHORT").reduce((a, p) => a + p.notional, 0),
      exposure: equity && equity > 0 ? notional / equity : null,
    },
    money,
    activity,
  };
}
