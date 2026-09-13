/**
 * Address parsing for the watchlist.
 *
 * The watchlist previously accepted anything as an "address", so "hello" could
 * be saved and its Track button would land on a broken tracker page. These
 * helpers gate that, and let one paste carry many addresses at once.
 */

/** An EVM address: 0x followed by 40 hex characters. */
const ADDRESS_RE = /^0x[a-fA-F0-9]{40}$/;

export function isAddress(value: string): boolean {
  return ADDRESS_RE.test(value.trim());
}

export interface ParsedAddresses {
  /** Well-formed, de-duplicated, lower-cased for comparison but kept as typed. */
  valid: string[];
  /** Anything that looked like an entry but isn't a valid address. */
  invalid: string[];
}

/**
 * Pull every address out of a pasted blob. People paste one per line, or
 * comma-separated, or straight out of a spreadsheet — all of it should work.
 */
export function parseAddresses(raw: string): ParsedAddresses {
  const tokens = raw
    .split(/[\s,;]+/)
    .map((t) => t.trim())
    .filter(Boolean);

  const valid: string[] = [];
  const invalid: string[] = [];
  const seen = new Set<string>();

  for (const token of tokens) {
    if (isAddress(token)) {
      const key = token.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      valid.push(token);
    } else {
      invalid.push(token);
    }
  }
  return { valid, invalid };
}

/** "0xa8ec9e60…cb526cb4" — for display in tight rows. */
export function shortAddress(address: string): string {
  if (address.length <= 16) return address;
  return `${address.slice(0, 10)}…${address.slice(-6)}`;
}

/**
 * A sensible default label so a name is never required to save something.
 * Users rename in place afterwards if they care.
 */
export function defaultName(address: string): string {
  return `${address.slice(0, 6)}…${address.slice(-4)}`;
}
