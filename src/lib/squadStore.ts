import { db } from "@/lib/liveStore";
import { DEFAULT_TIERS, tierOf } from "@/lib/squadTiers";

/**
 * SoPoints squads, estimated from public data.
 *
 * On SoDEX every account can be in two squads: the one it joined (its
 * inviter, the captain, plus the captain's other invitees) and the one it
 * built (itself plus the people it invited). Both are the same kind of thing:
 * a captain and their direct invitees. So a squad here is one captain and
 * everyone who joined through their code.
 *
 * A squad's Energy is its members' trading volume over the last 4 weeks, $1
 * = 1 Energy, captain included; each tier of Energy adds a SoPoints boost. A
 * member who has a squad of its own adds its volume there instead.
 * An invitee only counts once they've deposited at least $5 and traded.
 * SoDEX shows the official figures only to a squad's own members, so these
 * are estimates from the collector's own trade and deposit records:
 * who invited whom comes from SoDEX's public referral lookup
 * (collector/src/squads.mjs), volume from every trade we recorded, plus
 * SoDEX's own 30-day volume for the days before our records start.
 *
 * Unlike the rest of the analytics, squads are shown by (shortened) address,
 * not nickname: they're looked up by wallet.
 */

const DAY = 86_400_000;
/** SoDEX's trade history before our records is kept in half-day buckets (collector/src/squads.mjs). */
const HALF = DAY / 2;
/** The site shows only this many members per squad, busiest first. */
const MEMBERS_SHOWN = 50;
export const SQUADS_TOP = 100;

export interface SquadTier {
  /** Energy needed, in dollars of volume. */
  energy: number;
  /** SoPoints boost, as a fraction (0.05 = +5%). */
  boost: number;
}

export interface SquadSeason {
  week: number | null;
  weekName: string | null;
  /** SoPoints shared out this week. */
  pool: number | null;
  /** When the next week starts (the snapshot), ms. */
  nextWeekAt: number | null;
  /** When this week's points are paid out, ms. */
  distributionAt: number | null;
  tiers: SquadTier[];
  /** Squad boosts (joined + built) never add up past this, as a fraction. */
  maxBoost: number;
  /** Weeks of volume that count towards Energy. */
  windowWeeks: number;
}

export interface SquadMember {
  address: string;
  /** Trading volume in the Energy window. */
  volume: number;
  /** Deposited at least $5 and traded: counts towards the squad. */
  active: boolean;
  captain?: true;
  /** Has a squad of its own: its volume counts there, not in this one. */
  own?: true;
}

export interface Squad {
  captain: string;
  /** The name the captain gave it on sodex.com; empty if none (or not read yet). */
  name: string;
  /** Invitees who count (deposited and traded), captain not included. */
  members: number;
  /** Invitees who joined but haven't deposited and traded yet. */
  pending: number;
  /** Estimated Energy: the captain's and counting members' volume in the window. */
  energy: number;
  /** Boost this squad's tier gives, as a fraction. */
  boost: number;
  /** The next tier up, if any. */
  next: SquadTier | null;
  /** Captain first, then members by volume; only in the per-wallet views. */
  people?: SquadMember[];
  /** Members not listed. */
  more?: number;
}

export interface SquadsOverview {
  available: true;
  asOf: number;
  season: SquadSeason | null;
  /**
   * The Energy window, as UTC days; `dataFrom` is later than `from` while our records are shorter than the window.
   * `fromMs`: the exact start (a Tuesday 12:00 UTC). `filled`: people whose days before `dataFrom` come from
   * SoDEX (0 once the window is ours); `exact`: of those, how many from their actual trades.
   */
  window: { from: string; fromMs?: number; dataFrom: string; to: string; filled?: number; exact?: number };
  /** How far the collector's who-invited-whom pass has got through the window's traders. */
  coverage: { asked: number; traders: number };
  totals: {
    /** Squads with at least one member who counts. */
    squads: number;
    members: number;
    pending: number;
    /** Squads at each tier: index 0 is below the first tier. */
    byTier: number[];
  };
  top: Squad[];
}

export interface SquadShard {
  available: true;
  asOf: number;
  maxBoost: number;
  /** Squads by captain address. */
  squads: Record<string, Squad>;
}

/**
 * Every wallet we've asked about, by address: who invited it ("" for nobody)
 * and whether it counts (1: deposited $5 and traded). Changes rarely, so it's
 * kept apart from the squads, whose Energy moves every hour.
 */
export interface SquadWho {
  available: true;
  asOf: number;
  wallets: Record<string, [inviter: string, counts: 0 | 1]>;
}

type Unavailable = { available: false; reason: string };

/** Which per-wallet view holds a wallet or a captain's squad: the first two hex digits of the address. */
export const shardOf = (address: string) => address.toLowerCase().slice(2, 4);

/** What the collector saves for a lookup SoDEX refused (collector/src/squads.mjs): not an answer. */
const REFUSED = "!refused";


const has = (t: string) => !!db()?.prepare("SELECT 1 FROM sqlite_schema WHERE type = 'table' AND name = ?").get(t);

function season(): SquadSeason | null {
  const row = db()?.prepare("SELECT value FROM kv WHERE key = 'squads:season'").get() as { value: string } | undefined;
  if (!row) return null;
  try {
    const { week, rules } = JSON.parse(row.value) as {
      week?: { weekNo?: number; weekName?: string; weekPoolPoints?: number; nextWeekStartTime?: number; distributionTime?: number };
      rules?: { windowRounds?: number; maxTotalBonusPct?: number; tiers?: { threshold: string | number; bonusPct: number }[] };
    };
    const tiers = (rules?.tiers ?? [])
      .map((t) => ({ energy: Number(t.threshold), boost: Number(t.bonusPct) / 100 }))
      .filter((t) => t.energy > 0 && t.boost > 0)
      .sort((a, b) => a.energy - b.energy);
    return {
      week: week?.weekNo ?? null,
      weekName: week?.weekName ?? null,
      pool: week?.weekPoolPoints ?? null,
      nextWeekAt: week?.nextWeekStartTime ? week.nextWeekStartTime * 1000 : null,
      distributionAt: week?.distributionTime ? week.distributionTime * 1000 : null,
      tiers: tiers.length ? tiers : DEFAULT_TIERS,
      maxBoost: (rules?.maxTotalBonusPct ?? 50) / 100,
      windowWeeks: rules?.windowRounds ?? 4,
    };
  } catch {
    return null;
  }
}

interface Built {
  overview: SquadsOverview;
  shards: Map<string, Squad[]>;
  who: Map<string, SquadWho["wallets"]>;
  maxBoost: number;
}

interface Status {
  id: number;
  address: string;
  unread: number;
  dep: number;
  traded: number;
}

/**
 * Whether an account counts in a squad: it traded (ever, on the all-time
 * leaderboard, or in our records) and deposited $5 or more (ledger). An
 * account whose ledger we haven't read yet gets the benefit of the doubt if
 * it trades: it needed money from somewhere.
 */
const counts = (r: Status, volume: number) => (r.traded > 0 || volume > 0) && (r.dep >= 5 || !!r.unread);

const STATUS = `
  f.account_id id, f.address, f.checked_at IS NULL unread,
  (SELECT COALESCE(SUM(COALESCE(x.usd, 0)), 0) FROM fund_flows x WHERE x.account_id = f.account_id AND x.direction = 'in') dep,
  COALESCE((SELECT p.alltime_volume FROM pos_accounts p WHERE p.account_id = f.account_id), 0) traded`;

let cache: { at: number; value: Built | Unavailable } | null = null;

/** Every squad, worked out once and reused for a minute (the routes ask per view). */
export function buildSquads(): Built | Unavailable {
  if (cache && Date.now() - cache.at < 60_000) return cache.value;
  const value = compute();
  cache = { at: Date.now(), value };
  return value;
}

function compute(): Built | Unavailable {
  const d = db();
  if (!d) return { available: false, reason: "The collector isn't running here yet." };
  // The lane writes the season the moment it starts; without it, it's switched off.
  if (!has("squad_links") || !d.prepare("SELECT 1 FROM kv WHERE key = 'squads:season'").get()) {
    return { available: false, reason: "Squads aren't being collected yet." };
  }
  const asked = (d.prepare(`SELECT COUNT(*) n FROM squad_links WHERE code IS NOT '${REFUSED}'`).get() as { n: number }).n;
  if (!asked) return { available: false, reason: "We're still finding out who invited whom. Squads show up within the hour." };

  const now = Date.now();
  const s = season();
  const tiers = s?.tiers ?? DEFAULT_TIERS;
  const weeks = s?.windowWeeks ?? 4;
  // The window: the current week and the ones before it, from the Tuesday 12:00 UTC that began them
  // (SoDEX's own figures match this to the dollar). Without the season, the last 4 weeks.
  let next = s?.nextWeekAt ?? 0;
  while (next && next <= now) next += 7 * DAY;
  const fromMs = next ? next - weeks * 7 * DAY : now - weeks * 7 * DAY;
  const from = new Date(fromMs).toISOString().slice(0, 10);
  const to = new Date(now).toISOString().slice(0, 10);
  const first = (d.prepare("SELECT MIN(day) a FROM account_day").get() as { a: string | null }).a ?? to;

  // Each account's volume in the window: everything it bought plus everything it sold, as SoDEX counts it.
  // The day the window starts counts from its start (half of it, from 12:00), as if traded evenly.
  const startShare = 1 - (fromMs - Date.parse(`${from}T00:00:00Z`)) / DAY;
  const volume = new Map<number, number>();
  for (const r of d
    .prepare("SELECT account_id id, SUM(CASE WHEN day > ? THEN bought_usd + sold_usd ELSE (bought_usd + sold_usd) * ? END) v FROM account_day WHERE day >= ? GROUP BY account_id")
    .all(from, startShare, from) as { id: number; v: number }[])
    volume.set(r.id, r.v);

  // While the window starts before our records, the days before them come from SoDEX (collector/src/squads.mjs):
  // each person's actual trades where we've read them, otherwise the window's share of what SoDEX's 30-day
  // volume says they traded before our records, spread evenly.
  const before = new Map<number, number>();
  let exact = 0;
  if (has("squad_volume"))
    for (const r of d.prepare("SELECT account_id id, pre, pre_from f, pre_to t FROM squad_volume WHERE pre > 0 AND pre_to > ?").all(fromMs) as {
      id: number;
      pre: number;
      f: number;
      t: number;
    }[]) {
      const share = r.t > r.f ? (r.t - Math.max(fromMs, r.f)) / (r.t - r.f) : 0;
      if (share > 0) before.set(r.id, r.pre * Math.min(1, share));
    }
  if (has("squad_pre_read"))
    for (const r of d
      .prepare(`
        SELECT r.account_id id, COALESCE((SELECT SUM(p.usd) FROM squad_pre p WHERE p.account_id = r.account_id AND p.half >= ? AND p.half * ? < r.to_ts), 0) v
        FROM squad_pre_read r WHERE r.from_ts > 0 AND r.from_ts <= ? AND r.to_ts > ?`)
      .all(Math.ceil(fromMs / HALF), HALF, fromMs, fromMs) as { id: number; v: number }[]) {
      before.set(r.id, r.v);
      exact++;
    }
  const energyVolume = (id: number) => (volume.get(id) ?? 0) + (before.get(id) ?? 0);

  // Every wallet we have an answer for (refusals aren't answers), with what decides whether it counts.
  const rows = d
    .prepare(`
      SELECT ${STATUS}, s.inviter_address cap, s.inviter_id capId
      FROM squad_links s JOIN fund_accounts f ON f.account_id = s.account_id
      WHERE s.code IS NOT '${REFUSED}'`)
    .all() as (Status & { cap: string | null; capId: number | null })[];
  // And every captain, asked about or not.
  const captainStatus = new Map<number, Status>();
  for (const r of d
    .prepare(`SELECT ${STATUS} FROM fund_accounts f WHERE f.account_id IN (SELECT inviter_id FROM squad_links WHERE inviter_id IS NOT NULL)`)
    .all() as unknown as Status[])
    captainStatus.set(r.id, r);

  const names = new Map<number, string>();
  if (has("squad_names")) for (const r of d.prepare("SELECT account_id id, name FROM squad_names").all() as { id: number; name: string }[]) names.set(r.id, r.name);

  // One squad per captain; and every wallet's own answer, filed by its address.
  const byCaptain = new Map<string, { capId: number | null; people: SquadMember[] }>();
  const who = new Map<string, SquadWho["wallets"]>();
  for (const r of rows) {
    const v = energyVolume(r.id);
    const active = counts(r, v);
    const k = shardOf(r.address);
    const idx = who.get(k) ?? {};
    idx[r.address] = [r.cap ?? "", active ? 1 : 0];
    who.set(k, idx);
    if (!r.cap) continue;
    const sq = byCaptain.get(r.cap) ?? { capId: r.capId, people: [] };
    sq.capId ??= r.capId;
    sq.people.push({ address: r.address, volume: v, active });
    byCaptain.set(r.cap, sq);
  }

  // A wallet's volume counts in one squad only: the one it built, once anyone has joined it, otherwise the
  // one it joined (SoDEX's own figures for a member's two squads show this).
  for (const sq of byCaptain.values()) for (const p of sq.people) if (byCaptain.has(p.address)) p.own = true;

  const squads: Squad[] = [];
  for (const [cap, sq] of byCaptain) {
    const capVolume = sq.capId != null ? energyVolume(sq.capId) : 0;
    const capStatus = sq.capId != null ? captainStatus.get(sq.capId) : undefined;
    const members = sq.people.filter((p) => p.active);
    const energy = capVolume + members.reduce((a, p) => a + (p.own ? 0 : p.volume), 0);
    const t = tierOf(energy, tiers);
    const people = [...sq.people].sort((a, b) => Number(b.active) - Number(a.active) || b.volume - a.volume);
    squads.push({
      captain: cap,
      name: sq.capId != null ? (names.get(sq.capId) ?? "") : "",
      members: members.length,
      pending: sq.people.length - members.length,
      energy,
      // A squad needs at least one member who counts before it boosts anyone.
      boost: members.length ? t.boost : 0,
      next: members.length ? t.next : (tiers[0] ?? null),
      people: [{ address: cap, volume: capVolume, active: capStatus ? counts(capStatus, capVolume) : false, captain: true }, ...people.slice(0, MEMBERS_SHOWN)],
      more: Math.max(0, people.length - MEMBERS_SHOWN),
    });
  }
  squads.sort((a, b) => b.energy - a.energy);

  const counting = squads.filter((q) => q.members > 0);
  const byTier = Array.from({ length: tiers.length + 1 }, () => 0);
  for (const q of counting) byTier[tierOf(q.energy, tiers).index + 1]++;
  const windowTraders = [...volume.keys()];
  const askedSet = new Set(rows.map((r) => r.id));

  const shards = new Map<string, Squad[]>();
  for (const q of squads) {
    const k = shardOf(q.captain);
    const list = shards.get(k) ?? [];
    list.push(q);
    shards.set(k, list);
  }

  return {
    overview: {
      available: true,
      asOf: now,
      season: s,
      window: { from, fromMs, dataFrom: first > from ? first : from, to, filled: before.size, exact },
      coverage: { asked: windowTraders.filter((id) => askedSet.has(id)).length, traders: windowTraders.length },
      totals: {
        squads: counting.length,
        members: counting.reduce((a, q) => a + q.members, 0),
        pending: squads.reduce((a, q) => a + q.pending, 0),
        byTier,
      },
      // Without member lists: those go in the per-wallet views.
      top: counting.slice(0, SQUADS_TOP).map((q) => ({
        captain: q.captain,
        name: q.name,
        members: q.members,
        pending: q.pending,
        energy: q.energy,
        boost: q.boost,
        next: q.next,
      })),
    },
    shards,
    who,
    maxBoost: s?.maxBoost ?? 0.5,
  };
}

export function squadsOverview(): SquadsOverview | Unavailable {
  const b = buildSquads();
  return "overview" in b ? b.overview : b;
}

/** Two significant digits ($74,811 → $75,000): enough to read, and steady enough that a view only changes when a figure visibly does. */
const rough = (n: number) => (n ? Number(n.toPrecision(2)) : 0);

/**
 * Every squad whose captain's address starts with these two hex digits.
 * Figures are rounded (tiers are worked out on the exact ones), so the
 * publisher rewrites a view only when something in it visibly moved.
 */
export function squadShard(prefix: string): SquadShard | Unavailable {
  const b = buildSquads();
  if (!("overview" in b)) return b;
  return {
    available: true,
    asOf: b.overview.asOf,
    maxBoost: b.maxBoost,
    squads: Object.fromEntries(
      (b.shards.get(prefix) ?? []).map((q) => [
        q.captain,
        { ...q, energy: rough(q.energy), people: q.people?.map((m) => ({ ...m, volume: rough(m.volume) })) },
      ]),
    ),
  };
}

/** Who invited each wallet starting with these two hex digits, and whether it counts. */
export function squadWho(prefix: string): SquadWho | Unavailable {
  const b = buildSquads();
  if (!("overview" in b)) return b;
  return { available: true, asOf: b.overview.asOf, wallets: b.who.get(prefix) ?? {} };
}

/** All 256 shard prefixes, 00 to ff. */
export const SHARD_PREFIXES = Array.from({ length: 256 }, (_, i) => i.toString(16).padStart(2, "0"));
