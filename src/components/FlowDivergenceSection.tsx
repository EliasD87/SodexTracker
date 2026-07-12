"use client";

import { useEffect, useState } from "react";
import { Building2, Users, ArrowUpRight, ArrowDownRight } from "lucide-react";
import { cachedApiFetch } from "@/lib/fetchCache";
import { TokenIcon } from "@/components/TokenIcon";

/**
 * Institutional vs retail positioning, side by side, for the assets both
 * worlds actually trade: real spot-ETF net flows (SoSoValue — institutions)
 * contrasted against SoDEX's own live funding rate + open interest (retail
 * perp crowd). Neither number is fabricated; the "divergence" read is a
 * simple sign-comparison, stated as an observation, not advice.
 */

const SYMBOLS = ["BTC", "ETH", "SOL"] as const;
const VIOLET = "#7C6BF0";

interface EtfFlowDay {
  date: string;
  netInflow: number;
  netAssets: number;
  cumNetInflow: number;
}
interface SodexTicker {
  symbol: string;
  fundingRate: string;
  openInterest: string;
  markPrice: string;
}

const fmtUsdSigned = (n: number) => {
  const abs = Math.abs(n);
  const s = abs >= 1e9 ? (abs / 1e9).toFixed(2) + "B" : abs >= 1e6 ? (abs / 1e6).toFixed(2) + "M" : abs >= 1e3 ? (abs / 1e3).toFixed(1) + "K" : abs.toFixed(0);
  return (n >= 0 ? "+$" : "-$") + s;
};
const fmtUsd = (n: number) => {
  const abs = Math.abs(n);
  return "$" + (abs >= 1e9 ? (abs / 1e9).toFixed(2) + "B" : abs >= 1e6 ? (abs / 1e6).toFixed(2) + "M" : abs >= 1e3 ? (abs / 1e3).toFixed(1) + "K" : abs.toFixed(0));
};
const tone = (n: number) => (n > 0 ? "var(--green)" : n < 0 ? "var(--red)" : "var(--text-muted)");

interface CardData {
  symbol: string;
  etfLatest: EtfFlowDay | null;
  etf7dSum: number;
  fundingRate: number;
  oiUsd: number;
}

function DivergenceCard({ d }: { d: CardData }) {
  const etfBuying = d.etfLatest && d.etfLatest.netInflow > 0;
  const etfSelling = d.etfLatest && d.etfLatest.netInflow < 0;
  const crowdLong = d.fundingRate > 0; // positive funding: longs pay shorts → crowd net long
  const crowdShort = d.fundingRate < 0;

  let insight: { text: string; tone: "up" | "down" | "flat" } | null = null;
  if (etfBuying && crowdShort) {
    insight = { text: "Institutions buying spot while SoDEX's crowd leans short.", tone: "up" };
  } else if (etfSelling && crowdLong) {
    insight = { text: "Institutions selling spot while SoDEX's crowd leans long.", tone: "down" };
  } else if (d.etfLatest) {
    insight = { text: "Institutional flow and SoDEX positioning are pointing the same way.", tone: "flat" };
  }

  return (
    <div className="rounded-[14px] p-4" style={{ background: "var(--bg-surface)", border: "1px solid var(--border)" }}>
      <div className="flex items-center gap-2 mb-3.5">
        <TokenIcon symbol={d.symbol} size={22} />
        <span className="text-[14px] font-semibold" style={{ color: "var(--text)" }}>{d.symbol}</span>
      </div>

      <div className="grid grid-cols-2 gap-2 mb-3">
        <div className="rounded-lg p-2.5" style={{ background: "var(--bg-elevated)" }}>
          <div className="flex items-center gap-1 mb-1">
            <Building2 size={10} style={{ color: "var(--text-faint)" }} />
            <span className="tag" style={{ color: "var(--text-faint)", fontSize: 8.5 }}>ETF FLOW (1D)</span>
          </div>
          <div className="mono text-[13px] font-semibold" style={{ color: d.etfLatest ? tone(d.etfLatest.netInflow) : "var(--text-faint)" }}>
            {d.etfLatest ? fmtUsdSigned(d.etfLatest.netInflow) : "—"}
          </div>
        </div>
        <div className="rounded-lg p-2.5" style={{ background: "var(--bg-elevated)" }}>
          <div className="flex items-center gap-1 mb-1">
            <Users size={10} style={{ color: "var(--text-faint)" }} />
            <span className="tag" style={{ color: "var(--text-faint)", fontSize: 8.5 }}>SODEX FUNDING</span>
          </div>
          <div className="mono text-[13px] font-semibold" style={{ color: tone(d.fundingRate) }}>
            {(d.fundingRate * 100).toFixed(4)}%
          </div>
        </div>
      </div>

      <div className="flex items-center justify-between text-[10.5px] mb-3" style={{ color: "var(--text-faint)" }}>
        <span>7D ETF flow: <b style={{ color: tone(d.etf7dSum) }}>{fmtUsdSigned(d.etf7dSum)}</b></span>
        <span>SoDEX OI: <b style={{ color: "var(--text-muted)" }}>{fmtUsd(d.oiUsd)}</b></span>
      </div>

      {insight && (
        <div
          className="flex items-start gap-1.5 rounded-lg px-2.5 py-2"
          style={{ background: insight.tone === "flat" ? "var(--bg-elevated)" : insight.tone === "up" ? "var(--green-tint)" : "var(--cal-red-tint)" }}
        >
          {insight.tone === "up" && <ArrowUpRight size={12} style={{ color: "var(--green)", marginTop: 1, flexShrink: 0 }} />}
          {insight.tone === "down" && <ArrowDownRight size={12} style={{ color: "var(--red)", marginTop: 1, flexShrink: 0 }} />}
          <span className="text-[10.5px] leading-snug" style={{ color: "var(--text-muted)" }}>{insight.text}</span>
        </div>
      )}
    </div>
  );
}

export function FlowDivergenceSection() {
  const [cards, setCards] = useState<CardData[] | null>(null);

  useEffect(() => {
    let alive = true;

    (async () => {
      const [tickers, ...etfLists] = await Promise.all([
        cachedApiFetch<SodexTicker[]>("https://mainnet-gw.sodex.dev/api/v1/perps/markets/tickers").catch(() => []),
        ...SYMBOLS.map((s) => cachedApiFetch<EtfFlowDay[]>(`/api/sosovalue/etf-flows/${s}`).catch(() => [] as EtfFlowDay[])),
      ]);
      if (!alive) return;

      const tickerMap = new Map(tickers.map((t) => [t.symbol, t]));
      const built: CardData[] = SYMBOLS.map((symbol, i) => {
        const etfDays = etfLists[i];
        const etfLatest = etfDays[0] ?? null;
        const etf7dSum = etfDays.slice(0, 7).reduce((s, d) => s + d.netInflow, 0);
        const t = tickerMap.get(`${symbol}-USD`);
        const fundingRate = t ? parseFloat(t.fundingRate) : 0;
        const oiUsd = t ? parseFloat(t.openInterest) * parseFloat(t.markPrice) : 0;
        return { symbol, etfLatest, etf7dSum, fundingRate, oiUsd };
      });
      setCards(built);
    })();

    return () => {
      alive = false;
    };
  }, []);

  return (
    <div className="mb-10">
      <div className="flex items-center gap-2 mb-2">
        <span className="text-[10px] font-bold px-1.5 py-0.5 rounded" style={{ background: "rgba(124,107,240,0.14)", color: VIOLET, letterSpacing: "0.05em" }}>
          SOSOVALUE × SODEX
        </span>
        <span className="text-[11px] font-medium" style={{ color: "var(--text-faint)" }}>
          Real institutional flow vs SoDEX's own retail crowd
        </span>
      </div>
      <h2 className="text-[20px] font-semibold tracking-tight mb-3" style={{ color: "var(--text)" }}>
        Institutional vs Retail Positioning
      </h2>

      {!cards ? (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="rounded-[14px] h-[176px] animate-pulse" style={{ background: "var(--bg-elevated)" }} />
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          {cards.map((d) => (
            <DivergenceCard key={d.symbol} d={d} />
          ))}
        </div>
      )}
    </div>
  );
}
