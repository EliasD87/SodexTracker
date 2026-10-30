/**
 * SoDEX's stats feed (mainnet-data …/dashboard/*) began keying markets by
 * number in late October 2026 ("ID_1" instead of "BTC-USD"). The numbers are
 * the perps markets' IDs (checked against each market's 24h volume; spot uses
 * its own, overlapping numbering), so they're put back to names here. Keys
 * that are already names pass through, should SoDEX switch back.
 */

const GW = "https://mainnet-gw.sodex.dev/api/v1";
const ID = /^ID_(\d+)$/;

/** "ID_1" → "BTC-USD", for every perps market. Empty if the market list can't be read. */
export async function marketNamesById(): Promise<Record<string, string>> {
  try {
    const res = await fetch(`${GW}/perps/markets/symbols`, { headers: { Accept: "application/json" }, next: { revalidate: 3600 } });
    if (!res.ok) return {};
    const rows: { id?: number; name?: string }[] = (await res.json())?.data ?? [];
    return Object.fromEntries(rows.filter((r) => r.id != null && r.name).map((r) => [`ID_${r.id}`, r.name!]));
  } catch {
    return {};
  }
}

/** A market's name: the perps name for an "ID_n" key, or the key itself. */
export const nameOf = (key: string, names: Record<string, string>) => (ID.test(key) ? (names[key] ?? key) : key);

/** The same record with its "ID_n" keys renamed. */
export function renameMarkets<V>(markets: Record<string, V> | undefined, names: Record<string, string>): Record<string, V> | undefined {
  if (!markets || !Object.keys(markets).some((k) => ID.test(k))) return markets;
  return Object.fromEntries(Object.entries(markets).map(([k, v]) => [nameOf(k, names), v]));
}
