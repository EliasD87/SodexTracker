/**
 * Display metadata for SoSoValue sector indices — the pretty name and a distinct
 * minimal lucide glyph per sector, so the cards don't all share one icon.
 * Shared by the Intelligence page, the X-ray modal, and the Markets strip.
 */

import {
  ArrowLeftRight,
  Users,
  Building2,
  Brain,
  RadioTower,
  Landmark,
  Box,
  Image as ImageIcon,
  Crown,
  Rocket,
  CreditCard,
  Gamepad2,
  Layers2,
  Layers,
  type LucideIcon,
} from "lucide-react";

const NAME_OVERRIDES: Record<string, string> = {
  ssiMAG7: "MAG7",
  ssiDeFi: "DeFi",
  ssiMeme: "Meme",
  ssiSocialFi: "SocialFi",
  ssiRWA: "RWA",
  ssiAI: "AI",
  ssiDePIN: "DePIN",
  ssiCeFi: "CeFi",
  ssiLayer1: "Layer 1",
  ssiNFT: "NFT",
  ssiPayFi: "PayFi",
  ssiGameFi: "GameFi",
  ssiLayer2: "Layer 2",
};

export const prettyIndexName = (ticker: string): string =>
  NAME_OVERRIDES[ticker] ?? ticker.replace(/^ssi/i, "");

const SECTOR_ICONS: Record<string, LucideIcon> = {
  ssiDeFi: ArrowLeftRight, // swaps / liquidity
  ssiSocialFi: Users,
  ssiRWA: Building2, // real-world assets
  ssiAI: Brain,
  ssiDePIN: RadioTower, // physical infrastructure
  ssiCeFi: Landmark, // centralized / banks
  ssiLayer1: Box, // base chain
  ssiNFT: ImageIcon,
  ssiMAG7: Crown, // the majors
  ssiMeme: Rocket,
  ssiPayFi: CreditCard,
  ssiGameFi: Gamepad2,
  ssiLayer2: Layers2, // scaling on top of L1
};

export const sectorIcon = (ticker: string): LucideIcon => SECTOR_ICONS[ticker] ?? Layers;

/**
 * Map a SoDEX balance/market coin to a SoSoValue index ticker, or null if it
 * isn't one of the tokenised indices. Client-safe (the server helper in
 * lib/sosovalue.ts can't be imported into a Client Component — it pulls in fs).
 * Handles every naming form SoDEX uses: `vMAG7.ssi`, `vMAG7ssi`, `MAG7ssi/USDC`.
 */
const SODEX_BASE_TO_INDEX: Record<string, string> = {
  mag7: "ssiMAG7",
  defi: "ssiDeFi",
  meme: "ssiMeme",
};

export function sodexCoinToIndexTicker(coin: string): string | null {
  let b = (coin || "").toLowerCase().trim();
  // drop any pair suffix
  b = b.split("/")[0].split("_")[0].split("-")[0];
  // strip the vault prefix and the .ssi / ssi index suffix
  if (b.startsWith("v")) b = b.slice(1);
  b = b.replace(/\.ssi$/, "").replace(/ssi$/, "");
  return SODEX_BASE_TO_INDEX[b] ?? null;
}

/**
 * SoDEX tokenises ~20 real-world equities as perps (base coin, e.g. "NVDA" from
 * symbol "NVDA-USD"). This whitelist is exactly the subset SoSoValue's
 * crypto-stocks module also covers 1:1 by ticker (verified live) — everything
 * else on SoDEX's stock-like list (commodities: CL, COPPER, SILVER, XAUt;
 * indices: US500, USTECH100; unmapped: SAMSUNG, SKHX) is intentionally excluded.
 */
const SODEX_STOCK_TICKERS = new Set([
  "AAPL", "AMD", "AMZN", "COIN", "CRCL", "EWY", "GOOGL", "HOOD", "INTC",
  "META", "MRVL", "MSFT", "MSTR", "MU", "NVDA", "ORCL", "PLTR", "SNDK",
  "SPCX", "TSLA", "TSM",
]);

/** Map a SoDEX perps base coin (e.g. "NVDA") to a SoSoValue stock ticker, or null. */
export function sodexBaseToStockTicker(base: string): string | null {
  const b = (base || "").toUpperCase().trim();
  return SODEX_STOCK_TICKERS.has(b) ? b : null;
}

/**
 * Bases pre-warmed into Supabase by the 12h `sosovalue-refresh` edge function.
 * MUST STAY IN SYNC with POPULAR_BASES in
 * supabase/functions/sosovalue-refresh/index.ts. The Pair Intelligence board
 * requests ONLY these, so it never falls through to a live SoSoValue fetch.
 */
export const PREWARMED_PAIR_BASES = new Set([
  "BTC", "ETH", "SOL", "SUI", "BNB", "XRP", "DOGE", "ADA",
  "HYPE", "LINK", "UNI", "LTC", "TON", "TRX",
]);
