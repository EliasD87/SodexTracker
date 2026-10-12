"use client";

import { useState } from "react";
import { Share2 } from "lucide-react";
import { pct, signedPct } from "@/lib/analyticsFormat";
import { WALLET_WINDOWS, windowLabel, windowPhrase, type OpenPosition, type WalletWindow } from "@/lib/wallet/api";
import { chainRows, holdingRows, liqDistance, netWorth, walletWealth } from "@/lib/wallet/derive";
import { DeltaPill, Figure, Panel, PillTabs, SegmentMeter } from "@/components/analytics/kit";
import { MiniChart } from "@/components/analytics/MiniChart";
import { useCompact } from "@/components/analytics/hooks";
import { useRowLimit } from "@/components/analytics/ui";
import { TokenIcon } from "@/components/TokenIcon";
import { PositionShareCard, type ShareablePosition } from "@/components/PositionShareCard";
import type { WalletData } from "@/components/wallet/useWallet";
import { Empty, Failed, fmtPrice, fmtUsd, LoadingDots, SidePill, signedUsd, Skeleton, Stat, tone } from "@/components/wallet/ui";

const PART_COLOR: Record<string, string> = {
  perps: "var(--text)",
  spot: "var(--tier-active)",
  staked: "var(--green)",
  wealth: "var(--tier-niche)",
  chain: "var(--div-pos)",
};

/* ── Net worth ──────────────────────────────────────────────────────────── */

export function NetWorthCard({ w }: { w: WalletData }) {
  const m = w.markets.data;
  const spot = w.balances.data && m ? holdingRows(w.balances.data, 0, m).reduce((a, r) => a + (r.value ?? 0), 0) : null;
  const stakedPrice = m ? (m.spotPrices.get("WSOSO") ?? 0) : null;
  // Wealth fund shares held in spot or perps are shown under Wealth, so they
  // come out of those balances: each dollar once, in the place it belongs.
  const wh = walletWealth(w.wealth.data, !!w.wealth.error, w.balances.data ?? (w.balances.error ? [] : null), m);
  const chain = w.chain.data && m ? chainRows(w.chain.data, m).reduce((a, r) => a + (r.value ?? 0), 0) : null;
  const nw = netWorth({
    perps: w.account.data ? w.account.data.perpsEquity - (wh?.inPerps ?? 0) : null,
    // Holdings already leave fund shares out; Wealth counts them.
    // A part that failed shows "n/a" and counts as nothing, rather than loading forever.
    spot: spot ?? (w.balances.error ? 0 : null),
    staked: w.staked.data != null && stakedPrice != null ? w.staked.data * stakedPrice : w.staked.error ? 0 : null,
    wealth: wh ? wh.total : null,
    // If ValueChain's explorer is down, the rest still adds up.
    chain: chain ?? (w.chain.error ? 0 : null),
  });
  const collateral = (wh?.holdings ?? []).filter((h) => h.inPerps >= 0.01);
  const failed: Record<string, boolean> = {
    chain: !!w.chain.error && chain == null,
    spot: !!w.balances.error && spot == null,
    staked: !!w.staked.error && w.staked.data == null,
    perps: !!w.account.error && !w.account.data,
  };
  return (
    <Panel title="Net worth on SoDEX" sub="Everything this wallet holds on SoDEX and ValueChain, each dollar counted once" className="lg:col-span-5">
      {!w.account.data && !w.account.error ? (
        <Skeleton height={230} />
      ) : (
        <>
          <div className="flex items-center gap-2 flex-wrap">
            <Figure>{fmtUsd(nw.total)}</Figure>
            {!nw.complete && <LoadingDots label="Still adding up" />}
          </div>
          <div className="mt-4 flex h-2.5 w-full gap-[3px] rounded-full" style={{ background: nw.complete ? undefined : "var(--bg-elevated)" }} aria-hidden>
            {nw.parts
              .filter((p) => (p.value ?? 0) > 0)
              .map((p) => (
                <span key={p.key} className="h-full rounded-full transition-[width] duration-500" style={{ width: `${((p.value ?? 0) / (nw.total || 1)) * 100}%`, background: PART_COLOR[p.key] }} />
              ))}
          </div>
          <ul className="mt-4 flex flex-col">
            {nw.parts.map((p) => (
              <li key={p.key} className="flex items-center justify-between gap-3 py-2 text-[13px]" style={{ borderTop: "1px solid var(--border-subtle)" }}>
                <span className="min-w-0" style={{ color: "var(--text-muted)" }}>
                  <span className="inline-flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full" style={{ background: PART_COLOR[p.key] }} />
                    {p.label}
                  </span>
                  {/* Fund shares can back perps trades as collateral; their value sits under Wealth, not here. */}
                  {p.key === "perps" && collateral.length > 0 && (
                    <span className="block pl-4 mt-0.5 text-[11px] leading-snug" style={{ color: "var(--text-faint)" }}>
                      Plus {collateral.map((c) => `${fmtUsd(c.inPerps)} of ${c.name}`).join(", ")} held here as collateral, counted under Wealth
                    </span>
                  )}
                </span>
                <span className="flex items-center gap-3">
                  <span className="mono tabular-nums" style={{ color: "var(--text)" }}>
                    {p.value == null ? <LoadingDots label={`Loading ${p.label}`} /> : failed[p.key] ? <span style={{ color: "var(--text-faint)" }} title="SoDEX didn't answer for this part. Refresh to try again.">n/a</span> : fmtUsd(p.value)}
                  </span>
                  <span className="mono text-[11.5px] w-10 text-right" style={{ color: "var(--text-faint)" }}>
                    {p.value != null && nw.total > 0 ? pct(Math.max(0, p.value) / nw.total, 0) : ""}
                  </span>
                </span>
              </li>
            ))}
          </ul>
        </>
      )}
    </Panel>
  );
}

/* ── Performance ────────────────────────────────────────────────────────── */

export function PerformanceCard({ w, win, setWin }: { w: WalletData; win: WalletWindow; setWin: (w: WalletWindow) => void }) {
  const [view, setView] = useState<"pnl" | "value">("pnl");
  const o = w.overview.data;
  const chart = w.chart.data ?? [];
  const points = chart.map((p) => ({ date: new Date(p.t).toISOString().slice(0, 10), value: view === "pnl" ? p.pnl : p.accountValue }));
  const last = chart.length ? chart[chart.length - 1].pnl : 0;
  const busy = w.overview.loading || w.chart.loading;
  const compact = useCompact();
  const windows = <PillTabs label="Window" value={win} onChange={setWin} options={WALLET_WINDOWS.map((x) => ({ value: x, label: windowLabel(x) }))} />;
  return (
    // On a phone the window switcher gets its own line, so the title keeps the header.
    <Panel title="Performance" right={compact ? undefined : windows} className="lg:col-span-7">
      {compact && <div className="mb-3">{windows}</div>}
      {!o ? (
        w.overview.error ? <Failed message={w.overview.error} /> : <Skeleton height={compact ? 240 : 300} />
      ) : (
        <div style={{ opacity: busy ? 0.55 : 1, transition: "opacity .2s" }} aria-busy={busy}>
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <div className="text-[12px]" style={{ color: "var(--text-muted)" }}>
                Net PnL · {windowPhrase(win)}
              </div>
              <div className="mt-1 flex items-center gap-2 flex-wrap">
                <Figure color={tone(o.pnl)}>{signedUsd(o.pnl)}</Figure>
                <DeltaPill value={o.roi} title="Return on the capital SoDEX counts for this window" />
              </div>
            </div>
            <PillTabs
              label="Chart"
              value={view}
              onChange={setView}
              options={[
                { value: "pnl", label: "PnL" },
                { value: "value", label: compact ? "Value" : "Account value" },
              ]}
            />
          </div>
          <div className="mt-3 -mx-1">
            {points.length > 1 ? (
              <MiniChart
                key={`${view}-${win}`}
                label={view === "pnl" ? "Cumulative PnL" : "Account value"}
                kind="line"
                height={compact ? 140 : 170}
                signed={view === "pnl"}
                fitDomain={view === "value"}
                color={view === "pnl" ? (last >= 0 ? "var(--green)" : "var(--red)") : "var(--text)"}
                points={points}
                format={(v) => fmtUsd(v)}
              />
            ) : (
              <Empty>Not enough history in this window for a chart.</Empty>
            )}
          </div>
          <div className="mt-4 pt-4 grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-4" style={{ borderTop: "1px solid var(--border-subtle)" }}>
            <Stat label={`Volume · ${windowPhrase(win)}`} value={fmtUsd(o.volume)} />
            <Stat label="Perps, closed" value={signedUsd(o.perpsClosed)} color={tone(o.perpsClosed)} sub={`${signedUsd(o.perpsUnrealized)} open`} />
            <Stat label="Spot" value={signedUsd(o.spotPnl)} color={tone(o.spotPnl)} />
            <Stat label="Vault" value={signedUsd(o.vaultPnl)} color={tone(o.vaultPnl)} />
          </div>
        </div>
      )}
    </Panel>
  );
}

/* ── Open positions ─────────────────────────────────────────────────────── */

const shareable = (p: OpenPosition, mark: number | undefined, roi: number | null): ShareablePosition => ({
  symbol: p.market,
  side: p.long ? "LONG" : "SHORT",
  leverage: p.leverage,
  entryPrice: p.entry,
  markPrice: mark ?? null,
  pnl: p.upnl,
  roiPct: (roi ?? 0) * 100,
  createdAt: p.openedAt,
});

/** Always visible, touch included: sharing used to hide behind a hover. */
function ShareButton({ market, onClick, className = "" }: { market: string; onClick: () => void; className?: string }) {
  return (
    <button
      type="button"
      aria-label={`Share ${market} position`}
      title="Share"
      onClick={onClick}
      className={`w-8 h-8 items-center justify-center rounded-[9px] transition-colors hover:bg-[var(--bg-elevated)] ${className.startsWith("hidden") ? "" : "inline-flex"} ${className}`}
      style={{ color: "var(--text-muted)" }}
    >
      <Share2 size={14} />
    </button>
  );
}

export function PositionsCard({ w }: { w: WalletData }) {
  const [share, setShare] = useState<ShareablePosition | null>(null);
  const acc = w.account.data;
  const marks = w.markets.data?.marks;
  const rows = (acc?.openPositions ?? []).map((p) => {
    const mark = marks?.get(p.market);
    return { p, mark, notional: p.size * (mark ?? p.entry), dist: liqDistance(p, mark), roi: p.margin > 0 ? p.upnl / p.margin : null };
  });
  rows.sort((a, b) => b.notional - a.notional);
  const total = rows.reduce((a, r) => a + r.p.upnl, 0);
  const margin = rows.reduce((a, r) => a + r.p.margin, 0);
  const nearest = rows.reduce<number | null>((a, r) => (r.dist == null ? a : a == null ? r.dist : Math.min(a, r.dist)), null);
  // Every position on a wide screen; the biggest four on a phone, the rest a tap away.
  const { shown, toggle } = useRowLimit(rows, Infinity, 4);

  return (
    <Panel
      title="Open positions"
      sub={acc && rows.length ? `${rows.length} open · ${fmtUsd(margin)} margin${nearest != null ? ` · nearest liquidation ${pct(Math.max(0, nearest), 1)} away` : ""}` : undefined}
      right={
        acc && rows.length ? (
          <span className="text-[13px] mono font-semibold" style={{ color: tone(total) }}>
            {signedUsd(total)}
          </span>
        ) : undefined
      }
      className="lg:col-span-12"
    >
      {!acc ? (
        w.account.error ? <Failed message={w.account.error} /> : <Skeleton height={120} />
      ) : !rows.length ? (
        <Empty>No open positions right now.</Empty>
      ) : (
        <div className="-mx-4 sm:-mx-5">
          <div className="hidden md:grid grid-cols-[1.4fr_1fr_1fr_1fr_1.5fr_1fr_40px] gap-3 px-4 sm:px-5 pb-2 text-[11.5px]" style={{ color: "var(--text-faint)" }}>
            <span>Market</span>
            <span className="text-right">Size</span>
            <span className="text-right">Entry → Mark</span>
            <span className="text-right">Margin</span>
            <span>Liquidation</span>
            <span className="text-right">Unrealised</span>
            <span />
          </div>
          {shown.map(({ p, mark, notional, dist, roi }) => {
            const danger = dist != null && dist < 0.05;
            return (
              <div key={p.id} className="grid grid-cols-2 md:grid-cols-[1.4fr_1fr_1fr_1fr_1.5fr_1fr_40px] items-center gap-x-3 gap-y-2 px-4 sm:px-5 py-3 text-[13px]" style={{ borderTop: "1px solid var(--border-subtle)" }}>
                <span className="flex items-center gap-2 min-w-0 order-1 md:order-none">
                  <TokenIcon symbol={p.market} size={22} />
                  <span className="min-w-0">
                    <span className="block font-semibold truncate" style={{ color: "var(--text)" }}>
                      {p.market.replace(/-USD$/, "")}
                    </span>
                    <SidePill long={p.long} leverage={p.leverage} />
                  </span>
                </span>
                <span className="text-left md:text-right mono tabular-nums order-3 md:order-none" style={{ color: "var(--text)" }}>
                  {fmtUsd(notional)}
                  <span className="block text-[11px]" style={{ color: "var(--text-faint)" }}>
                    {p.size.toLocaleString("en-US", { maximumFractionDigits: 4 })}
                  </span>
                </span>
                <span className="hidden md:block text-right mono tabular-nums" style={{ color: "var(--text-muted)" }}>
                  {fmtPrice(p.entry)}
                  <span className="block text-[11px]" style={{ color: "var(--text)" }}>
                    {mark ? fmtPrice(mark) : "—"}
                  </span>
                </span>
                <span className="hidden md:block text-right mono tabular-nums" style={{ color: "var(--text-muted)" }}>
                  {fmtUsd(p.margin)}
                  <span className="block text-[11px]" style={{ color: "var(--text-faint)" }}>
                    {p.cross ? "cross" : "isolated"}
                  </span>
                </span>
                <span className="col-span-2 md:col-span-1 flex items-center gap-2 order-5 md:order-none">
                  <span className="flex-1 min-w-[80px]">
                    <SegmentMeter share={dist == null ? 0 : 1 - Math.min(1, Math.max(0, dist) / 0.3)} segments={14} color={danger ? "var(--red)" : "var(--tier-niche)"} />
                  </span>
                  <span className="mono text-[11.5px] w-[92px] text-right tabular-nums" style={{ color: danger ? "var(--red)" : "var(--text-muted)" }}>
                    {p.liq ? `${fmtPrice(p.liq)} · ${dist != null ? pct(Math.max(0, dist), 1) : "—"}` : "none"}
                  </span>
                  <ShareButton className="md:hidden" market={p.market} onClick={() => setShare(shareable(p, mark, roi))} />
                </span>
                <span className="text-right mono tabular-nums font-semibold order-2 md:order-none" style={{ color: tone(p.upnl) }}>
                  {signedUsd(p.upnl)}
                  {roi != null && (
                    <span className="block text-[11px] font-normal" style={{ opacity: 0.8 }}>
                      {signedPct(roi, 1)}
                    </span>
                  )}
                </span>
                <ShareButton className="hidden md:inline-flex justify-self-end" market={p.market} onClick={() => setShare(shareable(p, mark, roi))} />
              </div>
            );
          })}
          {toggle}
          <p className="px-4 sm:px-5 pt-3 text-[11.5px]" style={{ color: "var(--text-faint)" }}>
            The bar fills as price nears liquidation: full at the liquidation price, empty 30% or more away.
          </p>
        </div>
      )}
      {share && <PositionShareCard position={share} onClose={() => setShare(null)} />}
    </Panel>
  );
}
