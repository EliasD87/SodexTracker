"use client";

import { Banknote, Bot, Building2, CircleDollarSign, Coins, Cpu, HandCoins, Laptop, MemoryStick, Monitor, TrendingUp, type LucideIcon } from "lucide-react";
import type { WealthProduct } from "@/lib/wealthTvl";
import { TokenIcon } from "@/components/TokenIcon";

/**
 * SoDEX Wealth as SoDEX itself presents it: each product's own name and the
 * group it sits in on the Wealth page, plus a picture of what it holds and,
 * where SoDEX has one, its logo.
 */

export type WealthGroup = "specialty" | "etf" | "stable";

// Shades of the text colour, not hues: the groups read apart without colouring the page.
export const GROUPS: { key: WealthGroup; label: string; color: string }[] = [
  { key: "specialty", label: "Specialty", color: "var(--text)" },
  { key: "etf", label: "Curated ETF", color: "var(--text-muted)" },
  { key: "stable", label: "Stable Earn", color: "var(--text-faint)" },
];
export const GROUP = Object.fromEntries(GROUPS.map((g) => [g.key, g])) as Record<WealthGroup, (typeof GROUPS)[number]>;

/** `image` is a background picture in public/wealth: dark, its subject low and to the right. */
type Meta = { name: string; group: WealthGroup; ticker?: string; Icon: LucideIcon; logo?: string; image?: string };

/** By fund id, as SoDEX's Wealth page names and groups them. */
const META: Record<string, Meta> = {
  CXMT: { image: "/wealth/cxmt.webp", name: "CXMT Vault", group: "specialty", Icon: MemoryStick, logo: "CXMT" },
  UNITREE: { image: "/wealth/unitree.webp", name: "Unitree Vault", group: "specialty", Icon: Bot },
  vSMH: { image: "/wealth/us-semis-25.webp", name: "US Semis 25", group: "specialty", ticker: "SMH", Icon: Cpu },
  vSTRC: {
    image: "/wealth/strategy-preferred-yield.webp",
    name: "Strategy Preferred Yield",
    group: "specialty",
    ticker: "STRC",
    Icon: Building2,
    logo: "MSTR",
  },
  vQQQ: { image: "/wealth/us-tech-100.webp", name: "US Tech 100", group: "etf", ticker: "QQQ", Icon: Laptop, logo: "USTECH100" },
  vVOO: { image: "/wealth/us-500.webp", name: "US 500", group: "etf", ticker: "VOO", Icon: TrendingUp, logo: "US500" },
  vSCHD: { image: "/wealth/us-selected-dividend.webp", name: "US Selected Dividend", group: "etf", ticker: "SCHD", Icon: HandCoins },
  vVYM: { image: "/wealth/us-broad-dividend.webp", name: "US Broad Dividend", group: "etf", ticker: "VYM", Icon: Coins },
  vVGT: { image: "/wealth/us-broad-tech.webp", name: "US Broad Tech", group: "etf", ticker: "VGT", Icon: Monitor },
  vBOXX: { image: "/wealth/us-cash-yield.webp", name: "US Cash Yield", group: "stable", ticker: "BOXX", Icon: Banknote },
  "Morpho-Earn": { image: "/wealth/usdc-earn.webp", name: "USDC Earn", group: "stable", Icon: CircleDollarSign, logo: "USDC" },
};

/** A product SoDEX adds later still shows: its API name, grouped by its kind. */
function fallback(p: WealthProduct): Meta {
  const name = p.name.replace(/\s+fund$/i, "").replace(/^v(?=[A-Z]{2})/, "");
  return p.kind === "earn"
    ? { name, group: "stable", Icon: CircleDollarSign }
    : p.kind === "vault"
      ? { name, group: "specialty", Icon: Building2 }
      : { name, group: "etf", Icon: TrendingUp };
}

export const metaOf = (p: WealthProduct): Meta => META[p.fundId] ?? fallback(p);
export const productName = (p: WealthProduct) => metaOf(p).name;
export const groupOf = (p: WealthProduct) => metaOf(p).group;

/** The group, as a small plain outlined tag. */
export function GroupTag({ p }: { p: WealthProduct }) {
  const g = GROUP[groupOf(p)];
  return (
    <span
      className="shrink-0 px-1.5 py-[2px] text-[10px] font-semibold leading-none whitespace-nowrap"
      style={{ color: "var(--text-muted)", border: "1px solid var(--border)", borderRadius: 4 }}
    >
      {g.label}
    </span>
  );
}

/** The product's logo where SoDEX has one (in greyscale, to keep the page neutral), else its picture in a small square. */
export function ProductMark({ p, size = 18 }: { p: WealthProduct; size?: number }) {
  const m = metaOf(p);
  if (m.logo) {
    return (
      <span className="shrink-0 inline-flex" style={{ filter: "grayscale(1)", opacity: 0.9 }}>
        <TokenIcon symbol={m.logo} size={size} />
      </span>
    );
  }
  return (
    <span
      className="shrink-0 inline-flex items-center justify-center"
      style={{ width: size, height: size, borderRadius: size * 0.3, background: "var(--bg-elevated)", border: "1px solid var(--border)", color: "var(--text-muted)" }}
      aria-hidden
    >
      <m.Icon size={Math.round(size * 0.62)} strokeWidth={2.2} />
    </span>
  );
}
