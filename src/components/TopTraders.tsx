"use client";

import { useMemo, useState, useEffect } from "react";
import { Eye } from "lucide-react";
import Link from "next/link";
import { TraderModal } from "@/components/TraderModal";
import { RowActionButton } from "@/components/RowActionButton";
import { useLandingData } from "@/components/LandingDataProvider";

interface LeaderEntry {
  rank: number;
  wallet_address: string;
  pnl_usd: string;
  volume_usd: string;
}

interface LeaderData {
  items: LeaderEntry[];
  snapshot_ts: number;
}

function shortAddr(addr: string): string {
  if (addr.length < 10) return addr;
  return addr.slice(0, 4) + "…" + addr.slice(-4);
}

function fmtPnl(s: string): { label: string; positive: boolean } {
  const n = parseFloat(s);
  const abs = Math.abs(n);
  let label: string;
  if (abs >= 1_000_000) label = "$" + (abs / 1_000_000).toFixed(2) + "M";
  else if (abs >= 1_000) label = "$" + (abs / 1_000).toFixed(1) + "K";
  else label = "$" + abs.toFixed(2);
  return { label: (n >= 0 ? "+" : "-") + label, positive: n >= 0 };
}

function fmtVol(s: string): string {
  const n = parseFloat(s);
  if (n >= 1_000_000) return "$" + (n / 1_000_000).toFixed(2) + "M";
  if (n >= 1_000) return "$" + (n / 1_000).toFixed(1) + "K";
  return "$" + n.toFixed(2);
}

function fmtSnap(ts: number): string {
  const d = new Date(ts);
  return (
    d.toLocaleString("en-US", {
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      timeZone: "UTC",
      hour12: false,
    }) + " UTC"
  );
}

function RankBadge({ rank }: { rank: number }) {
  return (
    <div
      className="w-6 h-6 flex items-center justify-center rounded-sm text-[10px] font-bold mono shrink-0"
      style={
        rank <= 3
          ? { background: "var(--accent)", color: "var(--accent-fg)" }
          : { background: "var(--bg-elevated)", color: "var(--text-faint)" }
      }
    >
      {rank}
    </div>
  );
}

function SkeletonRows() {
  return (
    <>
      {Array.from({ length: 10 }).map((_, i) => (
        <div
          key={i}
          className="traders-grid grid gap-4 px-4 sm:px-5 py-3 items-center"
          style={{ gridTemplateColumns: ROW_COLS, borderTop: i > 0 ? "1px solid var(--border-subtle)" : undefined }}
        >
          <div className="w-6 h-6 rounded-sm animate-pulse" style={{ background: "var(--border)" }} />
          <div className="w-7 h-7 rounded-sm animate-pulse" style={{ background: "var(--border)" }} />
          <div className="h-4 rounded-sm animate-pulse" style={{ background: "var(--border)" }} />
          <div className="h-4 rounded-sm animate-pulse" style={{ background: "var(--border)" }} />
          <div className="traders-col-extra h-4 rounded-sm animate-pulse" style={{ background: "var(--border)" }} />
        </div>
      ))}
    </>
  );
}

const ROW_COLS = "auto 34px 1fr 110px 110px";

function PnlTable({ data, loading, onView }: { data: LeaderEntry[]; loading: boolean; onView: (e: LeaderEntry) => void }) {
  return (
    <div>
      <div
        className="traders-grid grid gap-4 px-4 sm:px-5 py-3 text-[10px] mono tracking-widest"
        style={{
          gridTemplateColumns: ROW_COLS,
          color: "var(--text-faint)",
          borderBottom: "1px solid var(--border-subtle)",
        }}
      >
        <span>#</span>
        <span />
        <span>ADDRESS</span>
        <span className="text-right">24H PNL</span>
        <span className="traders-col-extra text-right">24H VOL</span>
      </div>
      {loading ? (
        <SkeletonRows />
      ) : (
        data.map((t, i) => {
          const pnl = fmtPnl(t.pnl_usd);
          return (
            <div
              key={t.wallet_address + i}
              className="traders-grid relative grid gap-4 px-4 sm:px-5 py-3 sm:py-3.5 items-center cursor-pointer"
              style={{
                gridTemplateColumns: ROW_COLS,
                borderTop: i > 0 ? "1px solid var(--border-subtle)" : undefined,
                transition: "background 0.1s",
              }}
              onClick={() => onView(t)}
              onMouseEnter={(e) => {
                (e.currentTarget as HTMLElement).style.background = "var(--bg-elevated)";
                (e.currentTarget as HTMLElement).style.boxShadow = "inset 2px 0 0 0 var(--accent)";
              }}
              onMouseLeave={(e) => {
                (e.currentTarget as HTMLElement).style.background = "";
                (e.currentTarget as HTMLElement).style.boxShadow = "none";
              }}
            >
              <RankBadge rank={t.rank} />
              <EyeButton onClick={() => onView(t)} />
              <span className="relative text-xs mono font-medium truncate" style={{ color: "var(--text)" }}>
                {shortAddr(t.wallet_address)}
              </span>
              <span
                className="relative text-sm mono font-bold text-right"
                style={{ color: pnl.positive ? "var(--color-up)" : "var(--color-down)" }}
              >
                {pnl.label}
              </span>
              <span className="traders-col-extra relative text-sm mono text-right" style={{ color: "var(--text-muted)" }}>
                {parseFloat(t.volume_usd) > 0 ? fmtVol(t.volume_usd) : "—"}
              </span>
            </div>
          );
        })
      )}
    </div>
  );
}

function EyeButton({ onClick }: { onClick: () => void }) {
  return (
    <RowActionButton onClick={(e) => { e.stopPropagation(); onClick(); }} title="Quick stats">
      <Eye size={13} />
    </RowActionButton>
  );
}

function VolTable({ data, loading, onView }: { data: LeaderEntry[]; loading: boolean; onView: (e: LeaderEntry) => void }) {
  return (
    <div>
      <div
        className="traders-grid grid gap-4 px-4 sm:px-5 py-3 text-[10px] mono tracking-widest"
        style={{
          gridTemplateColumns: ROW_COLS,
          color: "var(--text-faint)",
          borderBottom: "1px solid var(--border-subtle)",
        }}
      >
        <span>#</span>
        <span />
        <span>ADDRESS</span>
        <span className="text-right">24H VOL</span>
        <span className="traders-col-extra text-right">24H PNL</span>
      </div>
      {loading ? (
        <SkeletonRows />
      ) : (
        data.map((t, i) => {
          const pnl = fmtPnl(t.pnl_usd);
          return (
            <div
              key={t.wallet_address + i}
              className="traders-grid relative grid gap-4 px-4 sm:px-5 py-3 sm:py-3.5 items-center cursor-pointer"
              style={{
                gridTemplateColumns: ROW_COLS,
                borderTop: i > 0 ? "1px solid var(--border-subtle)" : undefined,
                transition: "background 0.1s",
              }}
              onClick={() => onView(t)}
              onMouseEnter={(e) => {
                (e.currentTarget as HTMLElement).style.background = "var(--bg-elevated)";
                (e.currentTarget as HTMLElement).style.boxShadow = "inset 2px 0 0 0 var(--accent)";
              }}
              onMouseLeave={(e) => {
                (e.currentTarget as HTMLElement).style.background = "";
                (e.currentTarget as HTMLElement).style.boxShadow = "none";
              }}
            >
              <RankBadge rank={t.rank} />
              <EyeButton onClick={() => onView(t)} />
              <span className="relative text-xs mono font-medium truncate" style={{ color: "var(--text)" }}>
                {shortAddr(t.wallet_address)}
              </span>
              <span className="relative text-sm mono font-bold text-right" style={{ color: "var(--text)" }}>
                {fmtVol(t.volume_usd)}
              </span>
              <span
                className="traders-col-extra relative text-sm mono text-right"
                style={{ color: pnl.positive ? "var(--color-up)" : "var(--color-down)" }}
              >
                {pnl.label}
              </span>
            </div>
          );
        })
      )}
    </div>
  );
}

export function TopTraders() {
  const { pnlLeadersRaw, volLeadersRaw, loadingLeaders, loadLeaders } = useLandingData();
  const [tab, setTab] = useState<"pnl" | "volume">("pnl");
  const [viewing, setViewing] = useState<LeaderEntry | null>(null);

  useEffect(() => { loadLeaders(); }, [loadLeaders]);

  const { pnlData, volData, loading } = useMemo<{ pnlData: LeaderData | null; volData: LeaderData | null; loading: boolean }>(() => {
    return {
      pnlData: (pnlLeadersRaw?.data ?? null) as LeaderData | null,
      volData: (volLeadersRaw?.data ?? null) as LeaderData | null,
      loading: loadingLeaders,
    };
  }, [pnlLeadersRaw, volLeadersRaw, loadingLeaders]);

  const pnlItems = pnlData?.items ?? [];
  const volItems = volData?.items ?? [];
  const snapTs = pnlData?.snapshot_ts ?? volData?.snapshot_ts;

  return (
    <section className="py-10 sm:py-16">
      <div className="max-w-[1200px] mx-auto px-5">
        {/* Header */}
        <div className="flex items-center justify-between mb-8 flex-wrap gap-4">
          <div>
            <div className="tag mb-2 flex items-center gap-2" style={{ color: "var(--accent)" }}>
              <span className="w-5 h-px" style={{ background: "var(--accent)" }} />
              LEADERBOARD · PNL & VOLUME
            </div>
            <h2 className="text-xl sm:text-[28px] font-bold tracking-tight leading-none" style={{ color: "var(--text)", letterSpacing: "-0.02em" }}>
              Top Traders <span style={{ color: "var(--text-faint)" }}>— 24H</span>
            </h2>
            {snapTs && (
              <div className="tag mt-2" style={{ color: "var(--text-faint)" }}>
                SNAPSHOT · {fmtSnap(snapTs)}
              </div>
            )}
          </div>

          {/* Mobile tab toggle */}
          <div
            className="flex lg:hidden items-center p-0.5 rounded-sm"
            style={{ border: "1px solid var(--border)", background: "var(--bg)" }}
          >
            {(["pnl", "volume"] as const).map((t) => (
              <button
                key={t}
                onClick={() => setTab(t)}
                className="px-4 py-1.5 text-xs mono font-medium rounded-sm transition-all"
                style={
                  tab === t
                    ? { background: "var(--accent)", color: "var(--accent-fg)" }
                    : { color: "var(--text-muted)" }
                }
              >
                {t === "pnl" ? "By PnL" : "By Volume"}
              </button>
            ))}
          </div>
        </div>

        {/* Desktop: both tables side by side */}
        <div className="hidden lg:grid grid-cols-2 gap-x-10">
          <PnlTable data={pnlItems} loading={loading} onView={setViewing} />
          <VolTable data={volItems} loading={loading} onView={setViewing} />
        </div>

        {/* Mobile: single table per tab */}
        <div className="lg:hidden">
          {tab === "pnl" ? (
            <PnlTable data={pnlItems} loading={loading} onView={setViewing} />
          ) : (
            <VolTable data={volItems} loading={loading} onView={setViewing} />
          )}
        </div>

        <div className="mt-4 flex justify-end">
          <Link
            href="/leaderboard"
            className="text-xs mono transition-colors"
            style={{ color: "var(--text-faint)" }}
            onMouseEnter={(e) => ((e.currentTarget as HTMLElement).style.color = "var(--accent)")}
            onMouseLeave={(e) => ((e.currentTarget as HTMLElement).style.color = "var(--text-faint)")}
          >
            View full leaderboard →
          </Link>
        </div>
      </div>

      {viewing && <TraderModal entry={viewing} onClose={() => setViewing(null)} />}
    </section>
  );
}
