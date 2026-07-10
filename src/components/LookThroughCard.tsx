"use client";

import { useEffect, useState } from "react";
import { ScanSearch } from "lucide-react";
import { cachedApiFetch } from "@/lib/fetchCache";
import { tickerLabel } from "@/lib/tokenIcons";
import { sodexCoinToIndexTicker, prettyIndexName } from "@/lib/indexMeta";
import {
  LookThroughGraph,
  type LookThroughData,
  type GraphSource,
  type GraphTarget,
  type GraphLink,
} from "@/components/LookThroughGraph";

/**
 * Portfolio look-through: decompose the wallet's tokenised index holdings
 * (vMAG7.ssi / vDEFI.ssi / vMEME.ssi) into ONE unified Sankey — indices (and
 * direct wallet holdings of the same coins) flow into a single merged row of
 * underlying assets. Renders nothing if the wallet holds no index token.
 */

const SODEX_SPOT_TICKERS = "https://mainnet-gw.sodex.dev/api/v1/spot/markets/tickers";
const VIOLET = "#7C6BF0";
const MAX_TARGETS = 8; // beyond this, coins aggregate into an OTHERS node

interface BalanceLike {
  coin: string;
  total: string;
}
interface SpotTicker {
  symbol: string;
  lastPx: string;
}
interface Constituent {
  ticker: string;
  weight: number;
}
interface XrayResp {
  constituents: Constituent[];
}

interface Summary {
  indexUsd: number;
  indexCount: number;
  underlyingCount: number;
  overlaps: number;
  topTicker: string;
  topTotal: number;
  grandTotal: number;
}

function isStable(coin: string): boolean {
  const u = coin.toUpperCase();
  return u.includes("USDC") || u.includes("USDT") || u.includes("BUSD") || u === "VUSD" || u.endsWith("USD");
}

const fmtUsd = (n: number) =>
  n >= 1000 ? "$" + (n / 1000).toFixed(1) + "K" : "$" + n.toFixed(2);

export function LookThroughCard({ balances }: { balances: BalanceLike[] }) {
  const [graph, setGraph] = useState<LookThroughData | null | "empty">(null);
  const [summary, setSummary] = useState<Summary | null>(null);

  useEffect(() => {
    let alive = true;

    (async () => {
      const indexHoldings = balances
        .map((b) => ({ b, ticker: sodexCoinToIndexTicker(b.coin) }))
        .filter((x): x is { b: BalanceLike; ticker: string } => x.ticker !== null);

      if (!indexHoldings.length) {
        if (alive) setGraph("empty");
        return;
      }

      // SoDEX spot prices (base coin → price) to value holdings.
      const priceMap = new Map<string, number>();
      try {
        const tickers = await cachedApiFetch<SpotTicker[]>(SODEX_SPOT_TICKERS);
        for (const t of tickers) {
          const [base, quote] = t.symbol.split("_");
          const p = parseFloat(t.lastPx);
          if (quote && p > 0 && !priceMap.has(base)) priceMap.set(base, p);
        }
      } catch {
        /* prices may be unavailable */
      }
      const priceFor = (coin: string): number => {
        if (isStable(coin)) return 1;
        return priceMap.get(coin) ?? priceMap.get(coin.replace(/\./g, "")) ?? 0;
      };
      const usdOf = (b: BalanceLike) => (parseFloat(b.total) || 0) * priceFor(b.coin);

      // Direct (non-index, non-stable) holdings → USD per ticker (for overlap).
      const directUsd = new Map<string, number>();
      for (const b of balances) {
        if (sodexCoinToIndexTicker(b.coin) || isStable(b.coin)) continue;
        const usd = usdOf(b);
        if (usd > 0) directUsd.set(tickerLabel(b.coin), (directUsd.get(tickerLabel(b.coin)) ?? 0) + usd);
      }

      // Decompose every index into per-coin exposure; merge across indices.
      const sources: GraphSource[] = [];
      const perCoin = new Map<string, { via: Map<string, number>; direct: number }>();
      let indexUsd = 0;

      for (const { b, ticker } of indexHoldings) {
        const holdingUsd = usdOf(b);
        if (holdingUsd <= 0) continue;
        let constituents: Constituent[] = [];
        try {
          const r = await cachedApiFetch<XrayResp>(`/api/sosovalue/indices/${ticker}`);
          constituents = r.constituents;
        } catch {
          continue;
        }
        indexUsd += holdingUsd;
        sources.push({ id: ticker, label: prettyIndexName(ticker), usd: holdingUsd, kind: "index" });
        for (const c of constituents) {
          const e = perCoin.get(c.ticker) ?? { via: new Map<string, number>(), direct: 0 };
          e.via.set(ticker, (e.via.get(ticker) ?? 0) + holdingUsd * c.weight);
          perCoin.set(c.ticker, e);
        }
      }

      if (!sources.length) {
        if (alive) setGraph("empty");
        return;
      }

      // Fold overlapping direct holdings in as their own source.
      let overlaps = 0;
      let directTotal = 0;
      for (const [tk, e] of perCoin) {
        const d = directUsd.get(tk);
        if (d) {
          e.direct = d;
          directTotal += d;
          overlaps += 1;
        }
      }
      if (directTotal > 0) {
        sources.push({ id: "direct", label: "Direct", usd: directTotal, kind: "direct" });
      }

      // Merge into ranked targets; aggregate the tail into OTHERS.
      const ranked = [...perCoin.entries()]
        .map(([tk, e]) => ({
          ticker: tk,
          total: e.direct + [...e.via.values()].reduce((s, x) => s + x, 0),
          direct: e.direct,
          via: e.via,
        }))
        .filter((r) => r.total > 0)
        .sort((a, b) => b.total - a.total);

      // Fold dust into OTHERS: rows under 1% of the total are noise that crowds
      // the diagram ($0.00 rows), and cap the visible list at MAX_TARGETS.
      const rankedTotal = ranked.reduce((s, r) => s + r.total, 0);
      const dustCut = rankedTotal * 0.01;
      const headCount = Math.max(1, ranked.filter((r) => r.total >= dustCut).length);
      const head = ranked.slice(0, Math.min(MAX_TARGETS, headCount));
      const tail = ranked.slice(head.length);

      const targets: GraphTarget[] = head.map((r) => ({
        ticker: r.ticker,
        label: r.ticker,
        total: r.total,
        direct: r.direct,
      }));
      const links: GraphLink[] = [];
      for (const r of head) {
        for (const [src, usd] of r.via) links.push({ source: src, target: r.ticker, usd });
        if (r.direct > 0) links.push({ source: "direct", target: r.ticker, usd: r.direct });
      }
      if (tail.length) {
        const otherTotal = tail.reduce((s, r) => s + r.total, 0);
        const otherDirect = tail.reduce((s, r) => s + r.direct, 0);
        targets.push({ ticker: "OTHERS", label: "Others", total: otherTotal, direct: otherDirect, count: tail.length });
        const bySrc = new Map<string, number>();
        for (const r of tail) {
          for (const [src, usd] of r.via) bySrc.set(src, (bySrc.get(src) ?? 0) + usd);
          if (r.direct > 0) bySrc.set("direct", (bySrc.get("direct") ?? 0) + r.direct);
        }
        for (const [src, usd] of bySrc) links.push({ source: src, target: "OTHERS", usd });
      }

      const grandTotal = ranked.reduce((s, r) => s + r.total, 0);
      const top = ranked[0];

      if (alive) {
        setGraph({ totalUsd: grandTotal, sources, targets, links });
        setSummary({
          indexUsd,
          indexCount: sources.filter((s) => s.kind === "index").length,
          underlyingCount: ranked.length,
          overlaps,
          topTicker: top?.ticker ?? "",
          topTotal: top?.total ?? 0,
          grandTotal,
        });
      }
    })();

    return () => {
      alive = false;
    };
  }, [balances]);

  if (graph === "empty") return null;

  return (
    <div className="relative rounded-[14px]" style={{ border: "1px solid var(--border)", background: "var(--bg-surface)" }}>
      <div className="p-4 sm:p-5">
        {/* header */}
        <div className="flex items-center gap-2.5 mb-4">
          <span className="flex items-center justify-center rounded-lg shrink-0" style={{ width: 32, height: 32, background: "rgba(124,107,240,0.12)" }}>
            <ScanSearch size={16} style={{ color: VIOLET }} />
          </span>
          <div>
            <div className="text-[14px] font-semibold" style={{ color: "var(--text)" }}>
              Look-Through Exposure
            </div>
            <div className="tag" style={{ color: VIOLET }}>
              What your index tokens really hold
            </div>
          </div>
        </div>

        {graph === null ? (
          <div className="h-[320px] rounded-lg animate-pulse" style={{ background: "var(--bg-elevated)" }} />
        ) : (
          <>
            {summary && summary.topTicker && (
              <div className="rounded-xl p-3 mb-4" style={{ background: "var(--bg-elevated)" }}>
                <p className="text-[12px] leading-snug" style={{ color: "var(--text-muted)" }}>
                  <b style={{ color: "var(--text)" }}>{fmtUsd(summary.indexUsd)}</b> across {summary.indexCount} index
                  {summary.indexCount > 1 ? " tokens" : " token"} decomposes into{" "}
                  <b style={{ color: "var(--text)" }}>{summary.underlyingCount}</b> underlying assets
                  {summary.overlaps > 0 ? `, ${summary.overlaps} overlapping coins you already hold` : ""}. Biggest true
                  exposure: <b style={{ color: VIOLET }}>{summary.topTicker}</b> at{" "}
                  <b style={{ color: "var(--text)" }}>{fmtUsd(summary.topTotal)}</b>
                  {summary.grandTotal > 0 ? ` (${((summary.topTotal / summary.grandTotal) * 100).toFixed(0)}%)` : ""}.
                </p>
              </div>
            )}

            <LookThroughGraph data={graph} />

            <p className="text-[10px] mt-3 leading-tight" style={{ color: "var(--text-faint)" }}>
              Index composition via SoSoValue. Ribbon width = estimated dollars (index value × constituent weight).
              Green = coins you also hold directly. Hover or tap a node to isolate its flows.
            </p>
          </>
        )}
      </div>
    </div>
  );
}
