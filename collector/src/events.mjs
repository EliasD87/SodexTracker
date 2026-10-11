/**
 * Turning two snapshots of one account into events. Pure functions, so they
 * can be tested without SoDEX.
 *
 * A position is keyed by market and position side (one-way accounts use
 * "BOTH"); size is signed, positive long.
 */

/** A close or reduction within this much of the old liquidation price counts as a likely liquidation. */
const LIQ_TOLERANCE = 0.01;

const sideOf = (size) => (size > 0 ? "LONG" : "SHORT");

function liquidatedAt(prev, mark) {
  if (!prev.liq || !mark) return false;
  return prev.size > 0 ? mark <= prev.liq * (1 + LIQ_TOLERANCE) : mark >= prev.liq * (1 - LIQ_TOLERANCE);
}

/**
 * @param prev  [{ market, posSide, size, entry, liq, leverage }] before
 * @param next  same shape, after
 * @param markOf (market) => current mark price, or null
 * @returns events: [{ kind, market, side, sizeBefore, sizeAfter, usd, price, leverage, liquidated }]
 */
export function diffPositions(prev, next, markOf) {
  const key = (p) => `${p.market}|${p.posSide}`;
  const before = new Map(prev.map((p) => [key(p), p]));
  const after = new Map(next.map((p) => [key(p), p]));
  const events = [];

  for (const k of new Set([...before.keys(), ...after.keys()])) {
    const p = before.get(k);
    const n = after.get(k);
    const a = p?.size ?? 0;
    const b = n?.size ?? 0;
    if (a === b) continue;
    const market = (n ?? p).market;
    const price = markOf(market) ?? n?.entry ?? p?.entry ?? null;
    const usd = (q) => (price ? Math.abs(q) * price : null);
    const base = { market, sizeBefore: a, sizeAfter: b, price, leverage: n?.leverage ?? p?.leverage ?? null, liquidated: false };

    if (a === 0) {
      events.push({ ...base, kind: "open", side: sideOf(b), usd: usd(b) });
    } else if (b === 0) {
      events.push({ ...base, kind: "close", side: sideOf(a), usd: usd(a), liquidated: liquidatedAt(p, price) });
    } else if (Math.sign(a) !== Math.sign(b)) {
      events.push({ ...base, kind: "flip", side: sideOf(b), usd: usd(Math.abs(a) + Math.abs(b)) });
    } else if (Math.abs(b) > Math.abs(a)) {
      events.push({ ...base, kind: "add", side: sideOf(b), usd: usd(b - a) });
    } else {
      events.push({ ...base, kind: "reduce", side: sideOf(b), usd: usd(a - b), liquidated: liquidatedAt(p, price) });
    }
  }
  return events;
}

const money = (n) => {
  const a = Math.abs(n);
  const s = a >= 1e6 ? `$${(a / 1e6).toFixed(2)}M` : a >= 1e3 ? `$${(a / 1e3).toFixed(1)}K` : `$${a.toFixed(0)}`;
  return s;
};
const px = (p) => (p == null ? "?" : p >= 1000 ? p.toLocaleString("en-US", { maximumFractionDigits: 0 }) : p >= 1 ? p.toFixed(2) : p.toPrecision(4));
const coin = (market) => market?.replace("-USD", "") ?? "";

/** One event as a short alert line. */
export function describe(name, e) {
  const side = e.side === "LONG" ? "long" : "short";
  const lev = e.leverage ? ` · ${e.leverage}×` : "";
  switch (e.kind) {
    case "open":
      return `🟢 ${name} opened a ${money(e.usd)} ${coin(e.market)} ${side} at ${px(e.price)}${lev}`;
    case "add":
      return `➕ ${name} added ${money(e.usd)} to a ${coin(e.market)} ${side} at ${px(e.price)}${lev}`;
    case "reduce":
      return e.liquidated
        ? `⚠️ ${name} was likely partly liquidated: ${money(e.usd)} of a ${coin(e.market)} ${side} at ${px(e.price)}`
        : `➖ ${name} cut a ${coin(e.market)} ${side} by ${money(e.usd)} at ${px(e.price)}`;
    case "close":
      return e.liquidated
        ? `💥 ${name} was likely liquidated: ${money(e.usd)} ${coin(e.market)} ${side} at ${px(e.price)}`
        : `⚪ ${name} closed a ${money(e.usd)} ${coin(e.market)} ${side} at ${px(e.price)}`;
    case "flip":
      return `🔄 ${name} flipped ${coin(e.market)} to ${side} at ${px(e.price)} (${money(Math.abs(e.sizeAfter) * (e.price ?? 0))} now)`;
    case "deposit":
      return `📥 ${name} deposited about ${money(e.usd)} ${e.detail ?? ""}`.trim();
    case "withdraw":
      return `📤 ${name} withdrew about ${money(e.usd)} ${e.detail ?? ""}`.trim();
    default:
      return `${name}: ${e.kind}`;
  }
}
