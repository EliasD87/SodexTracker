/**
 * Readable names for accounts, so individual traders can be shown and linked
 * without ever showing an address or account ID.
 *
 * The mapping is one-to-one: three words from lists of 64 give 262,144 names,
 * one per account ID (above that a number is added). IDs are scrambled before
 * naming, so neighbouring accounts get unrelated names, and the scramble lives
 * only on the server: the page can link a name to its trader page, but nobody
 * can turn a name back into an account from the outside.
 */

import { NICK_ADJ as ADJ, NICK_NOUN as NOUN, NICK_TAIL as TAIL } from "./nicknameWords";

const BITS = 18; // 64 × 64 × 64
const SPACE = 1 << BITS;
const MASK = SPACE - 1;
// Odd multiplier and offset: a bijection on 0..SPACE-1.
const MUL = Number(process.env.NICKNAME_MUL ?? 0x2f5a3) | 1;
const ADD = Number(process.env.NICKNAME_ADD ?? 0x1b7e9) & MASK;

function inverse(a: number): number {
  // Newton's iteration for the inverse of an odd number modulo 2^BITS.
  let x = a;
  for (let i = 0; i < 5; i++) x = (x * (2 - ((a * x) % SPACE) + SPACE)) % SPACE;
  return ((x % SPACE) + SPACE) % SPACE;
}
const INV = inverse(MUL % SPACE);

const mulMod = (a: number, b: number) => Number((BigInt(a) * BigInt(b)) % BigInt(SPACE));

export function nickname(accountId: number): string {
  const low = accountId & MASK;
  const high = Math.floor(accountId / SPACE);
  const x = (mulMod(low, MUL) + ADD) & MASK;
  const name = `${ADJ[x >> 12]}-${NOUN[(x >> 6) & 63]}-${TAIL[x & 63]}`;
  return high ? `${name}-${high + 1}` : name;
}

/** The account behind a name, or null if it isn't one. */
export function accountOf(name: string): number | null {
  const parts = name.toLowerCase().split("-");
  if (parts.length !== 3 && parts.length !== 4) return null;
  const a = ADJ.indexOf(parts[0]);
  const b = NOUN.indexOf(parts[1]);
  const c = TAIL.indexOf(parts[2]);
  if (a < 0 || b < 0 || c < 0) return null;
  const high = parts.length === 4 ? Number(parts[3]) - 1 : 0;
  if (!Number.isInteger(high) || high < 0 || (parts.length === 4 && high === 0)) return null;
  const x = (a << 12) | (b << 6) | c;
  const low = mulMod((x - ADD + SPACE) & MASK, INV);
  return high * SPACE + low;
}
