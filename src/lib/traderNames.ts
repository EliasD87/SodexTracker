import { NICK_ADJ, NICK_NOUN, NICK_TAIL } from "./nicknameWords";
import { NAME_ADJECTIVES, NAME_NOUNS } from "./traderWords";

/**
 * How traders are shown: two words, unique to each trader ("Amber Falcon").
 *
 * A nickname (tidy-thistle-crest, kept in the data, alerts and old links) is
 * three words from 64-word lists, which spell an 18-bit number. The shown
 * name spells the same number with two words from 512-word lists, so each
 * nickname has exactly one name and back again, and a name tells no more than
 * the nickname did. Accounts past 262,144 keep their number: "Amber Falcon 2".
 */

const index = (list: readonly string[]) => new Map(list.map((w, i) => [w, i]));
const nickAdj = index(NICK_ADJ);
const nickNoun = index(NICK_NOUN);
const nickTail = index(NICK_TAIL);
const nameAdj = index(NAME_ADJECTIVES);
const nameNoun = index(NAME_NOUNS);
const cap = (w: string) => w[0].toUpperCase() + w.slice(1);
const SUFFIX = /^[2-9]\d*$|^[1-9]\d+$/;

/** The number a nickname spells, and its suffix if any; null if it isn't a nickname. */
function parseNickname(nick: string): { x: number; suffix: string } | null {
  const p = nick.toLowerCase().split("-");
  if (p.length !== 3 && p.length !== 4) return null;
  const a = nickAdj.get(p[0]);
  const b = nickNoun.get(p[1]);
  const c = nickTail.get(p[2]);
  if (a == null || b == null || c == null) return null;
  if (p.length === 4 && !SUFFIX.test(p[3])) return null;
  return { x: (a << 12) | (b << 6) | c, suffix: p[3] ?? "" };
}

/** A trader as shown: "Amber Falcon". Anything that isn't a nickname comes back as it was. */
export function traderName(nickname: string): string {
  const n = parseNickname(nickname);
  if (!n) return nickname;
  const name = `${cap(NAME_ADJECTIVES[n.x >> 9])} ${cap(NAME_NOUNS[n.x & 511])}`;
  return n.suffix ? `${name} ${n.suffix}` : name;
}

/** A trader's page, under their shown name: /analytics/trader/amber-falcon. */
export function traderHref(nickname: string): string {
  return `/analytics/trader/${encodeURIComponent(traderName(nickname).toLowerCase().replace(/\s+/g, "-"))}`;
}

/**
 * The nickname behind a shown name ("Amber Falcon", "amber-falcon-2") or a
 * nickname itself (old links); null if it's neither.
 */
export function nicknameOf(input: string): string | null {
  const w = input.trim().toLowerCase().split(/[\s-]+/).filter(Boolean);
  if (parseNickname(w.join("-"))) return w.join("-");
  const suffix = w.length === 2 ? "" : w.length === 3 && SUFFIX.test(w[2]) ? w[2] : null;
  if (suffix == null) return null;
  const a = nameAdj.get(w[0]);
  const b = nameNoun.get(w[1]);
  if (a == null || b == null) return null;
  const x = (a << 9) | b;
  const nickname = `${NICK_ADJ[x >> 12]}-${NICK_NOUN[(x >> 6) & 63]}-${NICK_TAIL[x & 63]}`;
  return suffix ? `${nickname}-${suffix}` : nickname;
}
