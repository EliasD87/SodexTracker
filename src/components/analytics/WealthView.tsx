"use client";

import { pct, signedPct, usd } from "@/lib/analyticsFormat";
import type { WealthProduct, WealthTvl } from "@/lib/wealthTvl";
import { useApi, useCompact } from "@/components/analytics/hooks";
import { CARD_STYLE, DeltaPill, Panel } from "@/components/analytics/kit";
import { NoData, TileSkeleton } from "@/components/analytics/ui";
import { GROUP, GROUPS, GroupTag, groupOf, metaOf, ProductMark, productName, type WealthGroup } from "@/components/analytics/wealthMeta";
import { squarify } from "@/components/deep/MarketHeatmap";
import { useWidth } from "@/components/deep/shared";
import { useTheme } from "@/components/ThemeProvider";

/**
 * SoDEX Wealth: how much money sits in each product, where the bulk of it
 * is, and how each has done, named and grouped as SoDEX's Wealth page does
 * (Specialty, Curated ETF, Stable Earn). Sizes come from the Wealth API for
 * the vaults, else the share token's supply on ValueChain times its price.
 */

const price = (v: number | null) => (v == null ? "—" : v >= 100 ? `$${v.toFixed(2)}` : `$${v.toFixed(v >= 1 ? 3 : 4)}`);
const shares = (v: number | null) =>
  v == null ? "—" : v >= 1000 ? v.toLocaleString("en-US", { maximumFractionDigits: 0 }) : v.toLocaleString("en-US", { maximumFractionDigits: 2 });
const ret = (v: number | null) =>
  v == null ? (
    <span style={{ color: "var(--text-faint)" }}>—</span>
  ) : (
    <span style={{ color: v >= 0 ? "var(--green)" : "var(--red)" }}>{signedPct(v, Math.abs(v) >= 0.1 ? 0 : 1).replace("-", "−")}</span>
  );

/**
 * Where a tile's object goes, as the larger of two spots that keep it off the
 * type: beside the figures on the right, or in the band between the name and
 * the figures. Sizes are estimated from the text (mono digits run ~0.6em wide).
 */
function placeObject(w: number, h: number, name: string, figures: [string, string] | null, fs: number[]) {
  const pad = 12;
  const nameLines = name.length * fs[0] * 0.56 > w - pad * 2 ? 2 : 1;
  const top = pad + nameLines * fs[0] * 1.25 + 6;
  const bottom = figures ? pad + fs[1] + 4 + fs[2] * 1.3 + 6 : pad;
  const textW = figures ? pad + Math.max(figures[0].length * fs[1], figures[1].length * fs[2]) * 0.6 + 8 : 0;
  // Beside the figures: as tall as the tile allows below the name, as wide as the room right of the figures.
  const beside = Math.min(h - top - pad, h * 0.74, w * 0.7, w - pad - textW);
  // Between the name and the figures: as tall as that band, up to 80% of the width.
  const between = Math.min(h - top - bottom, w * 0.8);
  const side = Math.max(beside, between);
  if (side < 28) return null;
  const band = side === beside ? [top, h - pad] : [top, h - bottom];
  return { width: side, height: side, right: pad * 0.75, top: band[0] + (band[1] - band[0] - side) / 2 };
}

/**
 * Every product as a tile, sized by the money in it. Each carries a cut-out
 * object for what it holds, on the right of a tile in the page's own tone, so
 * one set of pictures serves both themes and the type never sits on the art.
 */
function Mosaic({ products, total }: { products: WealthProduct[]; total: number }) {
  const compact = useCompact();
  const light = useTheme().theme === "light";
  const [ref, width] = useWidth<HTMLDivElement>();
  const H = compact ? 440 : 380;
  const sized = products.filter((p) => (p.tvl ?? 0) > 0);
  // Area grows with the square root of the money: USDC Earn still leads, but the
  // small products get tiles big enough to read. Every tile prints its share.
  const rects = width
    ? squarify(
        sized.map((p) => Math.sqrt(p.tvl!)),
        0,
        0,
        width,
        H,
      )
    : [];
  return (
    <div ref={ref} className="relative w-full" style={{ height: H }}>
      {rects.map((r, i) => {
        const p = sized[i];
        const m = metaOf(p);
        const color = GROUP[m.group].color;
        const big = r.w > 200 && r.h > 140;
        const mid = !big && r.w > 110 && r.h > 90;
        // A narrow tile names the product by its ticker, so the name never cuts off.
        const name = r.w < 90 ? (m.ticker ?? m.name.replace(/ Vault$/, "")) : m.name;
        const share = (p.tvl ?? 0) / (total || 1);
        const value = usd(p.tvl ?? 0);
        const note = big ? `${pct(share, 0)} of Wealth${m.ticker ? ` · ${m.ticker}` : ""}` : pct(share, share < 0.1 ? 1 : 0);
        const fs = big ? [14, 20, 11] : mid ? [12.5, 15, 10.5] : [11.5, 12, 10.5];
        const ink = "var(--text)";
        const soft = "var(--text-muted)";
        const halo = light ? "0 1px 8px rgba(255,255,255,0.9)" : "0 1px 8px rgba(0,0,0,0.7)";
        const obj = m.image ? placeObject(r.w - 4, r.h - 4, name, r.h > 46 ? [value, note] : null, fs) : null;
        return (
          <div
            key={p.fundId}
            className="group absolute p-[2px]"
            style={{ left: r.x, top: r.y, width: r.w, height: r.h }}
            title={`${m.name} · ${GROUP[m.group].label}: ${usd(p.tvl ?? 0)} (${pct(share, 1)})`}
          >
            <div
              className="lb-rise relative h-full w-full rounded-[12px] p-2.5 sm:p-3 flex flex-col justify-between overflow-hidden"
              style={{
                animationDelay: `${i * 40}ms`,
                // A soft spotlight behind the object, in the page's own tone.
                background: m.image
                  ? light
                    ? "radial-gradient(110% 95% at 76% 58%, #FFFFFF 0%, #F3F3F1 55%, #EAEAE7 100%)"
                    : "radial-gradient(110% 95% at 76% 58%, #232323 0%, #161616 55%, #0F0F0F 100%)"
                  : light
                    ? `linear-gradient(150deg, color-mix(in srgb, ${color} 14%, #F4F4F2), #F4F4F2)`
                    : `linear-gradient(150deg, color-mix(in srgb, ${color} 28%, #121212), #121212)`,
                boxShadow: light ? "inset 0 0 0 1px rgba(0,0,0,0.07)" : "inset 0 0 0 1px rgba(255,255,255,0.08)",
              }}
            >
              {obj && (
                <div
                  aria-hidden
                  className="absolute transition-transform duration-500 ease-out group-hover:scale-[1.04]"
                  style={{
                    ...obj,
                    background: `url(${m.image}) center / contain no-repeat`,
                    filter: light ? "drop-shadow(0 14px 16px rgba(0,0,0,0.18))" : "drop-shadow(0 16px 20px rgba(0,0,0,0.65))",
                  }}
                />
              )}
              <div className="relative flex items-center gap-1.5 min-w-0">
                {big && m.logo && <ProductMark p={p} size={18} />}
                <span className="font-semibold leading-tight line-clamp-2" style={{ fontSize: fs[0], color: ink, textShadow: halo }}>
                  {name}
                </span>
              </div>
              {r.h > 46 && (
                <div className="relative min-w-0" style={{ textShadow: halo }}>
                  <div className="mono font-semibold leading-none truncate" style={{ fontSize: fs[1], color: ink }}>
                    {value}
                  </div>
                  <div className="mt-1 mono truncate" style={{ fontSize: fs[2], color: soft }}>
                    {note}
                  </div>
                </div>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

export function WealthView() {
  const { data, error } = useApi<WealthTvl>("/api/wealth?view=tvl", 300_000, 300_000);
  if (!data) {
    return error ? (
      <div className="mt-6">
        <NoData title="Wealth" reason="SoDEX Wealth didn't answer. Try again in a moment." />
      </div>
    ) : (
      <TileSkeleton count={4} />
    );
  }
  const inGroup = (g: WealthGroup) => data.products.filter((p) => groupOf(p) === g);
  const sum = (g: WealthGroup) => inGroup(g).reduce((a, p) => a + (p.tvl ?? 0), 0);
  const share = (g: WealthGroup) => pct(sum(g) / (data.total || 1), 0);
  const usdcEarn = data.products.find((p) => p.fundId === "Morpho-Earn");
  const top = data.products[0];
  const stats: { label: string; value: string; sub: string; dot?: string }[] = [
    {
      label: "Total value locked",
      value: usd(data.total),
      sub: `Across ${data.products.length} products${top ? ` · ${productName(top)} is the biggest` : ""}`,
    },
    {
      label: "Specialty",
      value: usd(sum("specialty")),
      sub: `${inGroup("specialty").length} products · ${share("specialty")} of Wealth`,
      dot: GROUP.specialty.color,
    },
    { label: "Curated ETF", value: usd(sum("etf")), sub: `${inGroup("etf").length} products · ${share("etf")} of Wealth`, dot: GROUP.etf.color },
    {
      label: "Stable Earn",
      value: usd(sum("stable")),
      sub:
        usdcEarn?.yield != null
          ? `USDC Earn at ${pct(usdcEarn.yield, 2)} APY over 7 days`
          : `${inGroup("stable").length} products · ${share("stable")} of Wealth`,
      dot: GROUP.stable.color,
    },
  ];

  return (
    <div>
      {/* One card: the total and each group side by side, and how the total splits along the bottom. */}
      <section className="mt-4 sm:mt-6 overflow-hidden" style={CARD_STYLE} aria-label="Wealth totals">
        <div className="grid grid-cols-2 lg:grid-cols-4">
          {stats.map((x, i) => (
            <div
              key={x.label}
              // Dividers: between columns in the 2×2 on a phone, between all four in one row on a desktop.
              className={`px-4 sm:px-5 py-4 sm:py-5 min-w-0 border-[var(--border)] ${i % 2 === 1 ? "border-l" : i === 2 ? "lg:border-l" : ""} ${i >= 2 ? "border-t lg:border-t-0" : ""}`}
            >
              <div className="flex items-center gap-2 text-[12.5px] font-medium" style={{ color: "var(--text-muted)" }}>
                {x.dot && <span className="w-2 h-2 rounded-[2px]" style={{ background: x.dot }} aria-hidden />}
                {x.label}
              </div>
              <div
                className={`mt-2 font-semibold leading-none tabular-nums ${i === 0 ? "text-[26px] sm:text-[30px]" : "text-[22px] sm:text-[24px]"}`}
                style={{ color: "var(--text)", letterSpacing: "-0.025em" }}
              >
                {x.value}
              </div>
              <div className="mt-2 text-[11.5px] truncate" style={{ color: "var(--text-faint)" }}>
                {x.sub}
              </div>
            </div>
          ))}
        </div>
        {/* The split, edge to edge. */}
        <div className="flex h-[5px] gap-[2px]" aria-hidden>
          {GROUPS.map((g) =>
            sum(g.key) > 0 ? <span key={g.key} style={{ width: `${(sum(g.key) / (data.total || 1)) * 100}%`, background: g.color }} /> : null,
          )}
        </div>
      </section>

      <div className="mt-4 grid grid-cols-1 gap-4">
        <Panel title="Where the money sits">
          <Mosaic products={data.products} total={data.total} />
          <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-[11.5px]" style={{ color: "var(--text-muted)" }}>
            {GROUPS.map((g) => (
              <span key={g.key} className="inline-flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-[3px]" style={{ background: g.color }} />
                {g.label}
              </span>
            ))}
          </div>
        </Panel>

        <Panel
          title="Every product"
          pad={false}
        >
          <div className="overflow-x-auto">
            <table className="w-full text-[12.5px]">
              <thead>
                <tr className="text-[10.5px] font-semibold uppercase tracking-[0.06em]" style={{ color: "var(--text-faint)" }}>
                  <th className="text-left font-semibold px-4 sm:px-5 py-2">Product</th>
                  <th className="text-left font-semibold px-2 py-2 hidden lg:table-cell">Group</th>
                  <th className="text-right font-semibold px-2 py-2 hidden md:table-cell">Price</th>
                  <th className="text-right font-semibold px-2 py-2 hidden xl:table-cell">Shares</th>
                  <th className="text-right font-semibold px-2 py-2">TVL</th>
                  <th className="text-right font-semibold px-2 py-2 hidden sm:table-cell">Share</th>
                  <th className="text-right font-semibold px-2 py-2">24h</th>
                  <th className="text-right font-semibold px-2 py-2 hidden md:table-cell">1M</th>
                  <th className="text-right font-semibold px-2 py-2 hidden md:table-cell">1Y</th>
                  <th className="text-right font-semibold px-4 sm:px-5 py-2 hidden sm:table-cell">Yield</th>
                </tr>
              </thead>
              <tbody className="mono tabular-nums">
                {data.products.map((p) => {
                  const m = metaOf(p);
                  return (
                    <tr key={p.fundId} style={{ borderTop: "1px solid var(--border-subtle)" }}>
                      <td className="px-4 sm:px-5 py-2.5 font-sans">
                        <span className="flex items-center gap-2.5 min-w-0">
                          <ProductMark p={p} size={22} />
                          <span className="min-w-0">
                            <span className="block font-medium truncate" style={{ color: "var(--text)" }}>
                              {m.name}
                            </span>
                            {m.ticker && (
                              <span className="block text-[10.5px] mono" style={{ color: "var(--text-faint)" }}>
                                {m.ticker}
                              </span>
                            )}
                          </span>
                        </span>
                      </td>
                      <td className="px-2 py-2.5 font-sans hidden lg:table-cell">
                        <GroupTag p={p} />
                      </td>
                      <td className="px-2 py-2.5 text-right hidden md:table-cell" style={{ color: "var(--text-muted)" }}>
                        {price(p.price)}
                      </td>
                      <td
                        className="px-2 py-2.5 text-right hidden xl:table-cell"
                        style={{ color: "var(--text-muted)" }}
                        title={p.source === "reported" ? "Size reported by SoDEX" : "Share tokens on ValueChain"}
                      >
                        {p.source === "reported" ? <span style={{ color: "var(--text-faint)" }}>reported</span> : shares(p.shares)}
                      </td>
                      <td className="px-2 py-2.5 text-right font-semibold" style={{ color: "var(--text)" }}>
                        {p.tvl == null ? "—" : usd(p.tvl)}
                      </td>
                      <td className="px-2 py-2.5 text-right hidden sm:table-cell" style={{ color: "var(--text-muted)" }}>
                        {p.tvl == null ? "—" : pct(p.tvl / (data.total || 1), 1)}
                      </td>
                      <td className="px-2 py-2.5 text-right">
                        <DeltaPill value={p.change24h} />
                      </td>
                      <td className="px-2 py-2.5 text-right hidden md:table-cell">{ret(p.roi1M)}</td>
                      <td className="px-2 py-2.5 text-right hidden md:table-cell">{ret(p.roi1Y)}</td>
                      <td className="px-4 sm:px-5 py-2.5 text-right hidden sm:table-cell" style={{ color: "var(--text-muted)" }}>
                        {p.yield == null ? "—" : `${pct(p.yield, 1)}${p.fundId === "Morpho-Earn" ? " APY" : ""}`}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <p className="px-4 sm:px-5 py-3 text-[11.5px] leading-relaxed" style={{ color: "var(--text-faint)" }}>
            Vaults report their own size. The rest are their share tokens on ValueChain times the price: an ETF&apos;s price follows the fund it holds, and
            moves only while that market is open. Refreshed every five minutes.
          </p>
        </Panel>
      </div>
    </div>
  );
}
