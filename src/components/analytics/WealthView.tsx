"use client";

import { pct, signedPct, usd } from "@/lib/analyticsFormat";
import type { WealthProduct, WealthTvl } from "@/lib/wealthTvl";
import { useApi, useCompact } from "@/components/analytics/hooks";
import { CARD_STYLE, DeltaPill, Panel } from "@/components/analytics/kit";
import { NoData, TileSkeleton } from "@/components/analytics/ui";
import { GROUP, GROUPS, GroupTag, groupOf, metaOf, ProductMark, productName, type WealthGroup } from "@/components/analytics/wealthMeta";
import { squarify } from "@/components/deep/MarketHeatmap";
import { useWidth } from "@/components/deep/shared";

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
 * Every product as a tile, sized by the money in it. Each carries a picture
 * of what it holds, darkened from the top left so its name and size read
 * cleanly, and a thin border in its group's colour.
 */
function Mosaic({ products, total }: { products: WealthProduct[]; total: number }) {
  const compact = useCompact();
  const [ref, width] = useWidth<HTMLDivElement>();
  const H = compact ? 300 : 380;
  const sized = products.filter((p) => (p.tvl ?? 0) > 0);
  const rects = width
    ? squarify(
        sized.map((p) => p.tvl!),
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
        const big = r.w > 130 && r.h > 80;
        const share = (p.tvl ?? 0) / (total || 1);
        // The pictures are dark, whatever the theme, so the type on them is always light.
        const ink = "#F4F4F2";
        const soft = "rgba(244,244,242,0.68)";
        return (
          <div
            key={p.fundId}
            className="absolute p-[2px]"
            style={{ left: r.x, top: r.y, width: r.w, height: r.h }}
            title={`${m.name} · ${GROUP[m.group].label}: ${usd(p.tvl ?? 0)} (${pct(share, 1)})`}
          >
            <div
              className="lb-rise relative h-full w-full rounded-[12px] p-2.5 sm:p-3 flex flex-col justify-between overflow-hidden"
              style={{
                animationDelay: `${i * 40}ms`,
                backgroundColor: "#0E0E0E",
                backgroundImage: m.image
                  ? // A dim over the whole picture, deeper behind the name (top left) and the figures (bottom).
                    [
                      "linear-gradient(to top, rgba(6,6,6,0.78) 0%, rgba(6,6,6,0) 48%)",
                      "linear-gradient(135deg, rgba(6,6,6,0.85) 0%, rgba(6,6,6,0.45) 50%, rgba(6,6,6,0.25) 100%)",
                      `url(${m.image})`,
                    ].join(", ")
                  : `linear-gradient(150deg, color-mix(in srgb, ${color} 28%, #121212), #121212)`,
                backgroundSize: "cover",
                // Subjects sit low and to the right; tall, narrow tiles still keep them in frame.
                backgroundPosition: r.w / r.h < 0.8 ? "68% 70%" : "85% 75%",
                boxShadow: "inset 0 0 0 1px rgba(255,255,255,0.08)",
              }}
            >
              <div className="relative flex items-center gap-1.5 min-w-0">
                {big && m.logo && <ProductMark p={p} size={18} />}
                <span
                  className={`font-semibold truncate ${big ? "text-[14px]" : "text-[11px]"}`}
                  style={{ color: ink, textShadow: "0 1px 6px rgba(0,0,0,0.6)" }}
                >
                  {m.name}
                </span>
              </div>
              {r.h > 46 && (
                <div className="relative min-w-0" style={{ textShadow: "0 1px 6px rgba(0,0,0,0.6)" }}>
                  <div className={`mono font-semibold leading-none truncate ${big ? "text-[20px]" : "text-[11.5px]"}`} style={{ color: ink }}>
                    {usd(p.tvl ?? 0)}
                  </div>
                  {big && (
                    <div className="mt-1 text-[11px] mono" style={{ color: soft }}>
                      {pct(share, 0)} of Wealth{m.ticker ? ` · ${m.ticker}` : ""}
                    </div>
                  )}
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
