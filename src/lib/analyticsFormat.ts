/** Number formatting shared by every analytics view. */

export function usd(n: number, digits = 1): string {
  const a = Math.abs(n);
  const s = n < 0 ? "-" : "";
  if (a >= 1e9) return `${s}$${(a / 1e9).toFixed(2)}B`;
  if (a >= 1e6) return `${s}$${(a / 1e6).toFixed(digits)}M`;
  if (a >= 1e3) return `${s}$${(a / 1e3).toFixed(digits)}K`;
  return `${s}$${a.toFixed(a >= 100 ? 0 : 2)}`;
}

export function count(n: number): string {
  const a = Math.abs(n);
  if (a >= 1e6) return `${(n / 1e6).toFixed(2)}M`;
  if (a >= 1e4) return `${(n / 1e3).toFixed(1)}K`;
  return Math.round(n).toLocaleString("en-US");
}

export const pct = (n: number, digits = 1) => `${(n * 100).toFixed(digits)}%`;
export const signedPct = (n: number, digits = 1) => `${n >= 0 ? "+" : ""}${(n * 100).toFixed(digits)}%`;

/**
 * A change from a tiny base reads as noise in percent (+116521%), so anything
 * past tenfold is shown as a multiple instead.
 */
export const growth = (n: number) => (n >= 9 ? `${Math.round(1 + n).toLocaleString("en-US")}×` : signedPct(n, 0));

/** Basis points, for slippage and spreads. */
export const bps = (n: number) => {
  const v = n * 10_000;
  // Deep books cost fractions of a basis point; keep the digits that differ.
  return `${v.toFixed(v >= 10 ? 0 : v >= 1 ? 1 : 2)} bps`;
};

/** Signed percent that keeps a small value from rounding to "-0.0%". */
export const smallSignedPct = (n: number) => signedPct(n, Math.abs(n) < 0.01 ? 2 : 1);

/** Market symbol <-> URL segment. Spot pairs carry a slash, which a path can't. */
export const marketSlug = (symbol: string) => symbol.replace("/", "_");
// No case folding: some symbols are mixed case (MAG7ssi/USDC).
export const marketFromSlug = (slug: string) => decodeURIComponent(slug).replace("_", "/");
