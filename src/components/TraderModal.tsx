"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { X, Copy, Check, Wallet, TrendingUp } from "lucide-react";
import { CornerMarks } from "@/components/CornerMarks";

const GW = "https://mainnet-gw.sodex.dev/api/v1";
const DATA = "https://mainnet-data.sodex.dev/api/v1";

export interface TraderEntry {
  rank: number;
  wallet_address: string;
  pnl_usd: string;
  volume_usd: string;
}

interface Overview {
  total_pnl_usd: string;
  roi: string;
  account_value_usd: string;
  volume_usd: string;
  net_deposit_usd: string;
  first_trade_ts_ms: number;
}

function fmt(n: number, dp = 2): string {
  const abs = Math.abs(n);
  const sign = n < 0 ? "-" : "";
  if (abs >= 1_000_000) return `${sign}$${(abs / 1_000_000).toFixed(dp)}M`;
  if (abs >= 1_000) return `${sign}$${(abs / 1_000).toFixed(dp)}K`;
  return `${sign}$${abs.toFixed(dp)}`;
}

function shortAddr(a: string): string {
  return a.length < 14 ? a : a.slice(0, 8) + "…" + a.slice(-6);
}

function fmtDate(ts: number): string {
  return new Date(ts).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });
}

async function apiData<T>(url: string): Promise<T> {
  const res = await fetch(url);
  const json = await res.json();
  if (json.code !== 0) throw new Error(json.message || "err");
  return json.data as T;
}

function StatCell({ label, value, tone }: { label: string; value: string; tone?: "up" | "down" }) {
  return (
    <div className="flex flex-col gap-1 px-3 py-2.5" style={{ border: "1px solid var(--border-subtle)", background: "var(--bg)" }}>
      <span className="tag" style={{ color: "var(--text-faint)" }}>{label}</span>
      <span
        className="mono text-sm font-bold tabular-nums"
        style={{ color: tone === "up" ? "var(--color-up)" : tone === "down" ? "var(--color-down)" : "var(--text)" }}
      >
        {value}
      </span>
    </div>
  );
}

export function TraderModal({ entry, onClose }: { entry: TraderEntry; onClose: () => void }) {
  const [overview, setOverview] = useState<Overview | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [copied, setCopied] = useState(false);

  const pnl24 = parseFloat(entry.pnl_usd);
  const vol24 = parseFloat(entry.volume_usd);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setNotFound(false);
      try {
        // 1 lightweight call to resolve account_id (perps, fall back to spot)
        let aid: number | undefined;
        try {
          aid = (await apiData<{ aid: number }>(`${GW}/perps/accounts/${entry.wallet_address}/state`)).aid;
        } catch {
          try {
            aid = (await apiData<{ aid: number }>(`${GW}/spot/accounts/${entry.wallet_address}/state`)).aid;
          } catch { /* ignore */ }
        }
        if (aid == null) {
          if (!cancelled) setNotFound(true);
          return;
        }
        // 1 call for the longest window the API supports (1Y ≈ all-time)
        const ov = await apiData<Overview>(`${DATA}/wallet/portfolio/overview?account_id=${aid}&window=1Y`).catch(() => null);
        if (!cancelled) {
          if (ov) setOverview(ov);
          else setNotFound(true);
        }
      } catch {
        if (!cancelled) setNotFound(true);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [entry.wallet_address]);

  useEffect(() => {
    const h = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [onClose]);

  const router = useRouter();

  const trackTrader = () => {
    onClose();
    router.push(`/tracker?address=${encodeURIComponent(entry.wallet_address)}`);
  };

  const copy = () => {
    navigator.clipboard?.writeText(entry.wallet_address).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1200);
    });
  };

  const allPnl = overview ? parseFloat(overview.total_pnl_usd) : 0;
  const roi = overview ? parseFloat(overview.roi) : 0;

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center p-4"
      style={{ background: "rgba(0,0,0,0.62)", backdropFilter: "blur(4px)", WebkitBackdropFilter: "blur(4px)" }}
      onClick={onClose}
    >
      <div
        className="podium-card relative w-full max-w-[440px]"
        style={{ border: "1px solid var(--border)", background: "var(--bg-surface)" }}
        onClick={(e) => e.stopPropagation()}
      >
        <CornerMarks size={9} inset={-1} thickness={1.5} />

        {/* Header */}
        <div className="flex items-start justify-between gap-3 p-5 pb-4">
          <div className="flex items-center gap-3 min-w-0">
            <div
              className="relative flex items-center justify-center shrink-0"
              style={{ width: 44, height: 44, background: "var(--accent-dim)", border: "1px solid var(--accent)" }}
            >
              <CornerMarks size={6} inset={-1} thickness={1.5} />
              <Wallet size={18} style={{ color: "var(--accent)" }} />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2 mb-1">
                <span className="tag" style={{ color: "var(--accent)" }}>RANK #{entry.rank}</span>
                <span className="tag" style={{ color: "var(--text-faint)" }}>· 24H LEADERBOARD</span>
              </div>
              <button onClick={copy} className="group flex items-center gap-2" title="Copy address">
                <span className="mono text-sm font-bold" style={{ color: "var(--text)" }}>{shortAddr(entry.wallet_address)}</span>
                {copied ? <Check size={13} style={{ color: "var(--accent)" }} /> : <Copy size={13} className="opacity-40 group-hover:opacity-90" style={{ color: "var(--text-faint)" }} />}
              </button>
            </div>
          </div>
          <button
            onClick={onClose}
            className="flex items-center justify-center w-7 h-7 shrink-0 transition-colors"
            style={{ border: "1px solid var(--border)", color: "var(--text-faint)" }}
            onMouseEnter={(e) => { e.currentTarget.style.borderColor = "var(--accent)"; e.currentTarget.style.color = "var(--accent)"; }}
            onMouseLeave={(e) => { e.currentTarget.style.borderColor = "var(--border)"; e.currentTarget.style.color = "var(--text-faint)"; }}
            aria-label="Close"
          >
            <X size={14} />
          </button>
        </div>

        <div className="px-5 pb-5 flex flex-col gap-4">
          {/* 24H — instant, from leaderboard row */}
          <div>
            <div className="tag mb-2" style={{ color: "var(--text-faint)" }}>◇ 24 HOUR</div>
            <div className="grid grid-cols-2 gap-2">
              <StatCell label="24H PNL" value={`${pnl24 >= 0 ? "+" : ""}${fmt(pnl24)}`} tone={pnl24 >= 0 ? "up" : "down"} />
              <StatCell label="24H VOLUME" value={fmt(vol24)} />
            </div>
          </div>

          {/* All-time — fetched */}
          <div>
            <div className="tag mb-2" style={{ color: "var(--text-faint)" }}>◇ 1 YEAR</div>
            {loading ? (
              <div className="grid grid-cols-2 gap-2">
                {Array.from({ length: 4 }).map((_, i) => (
                  <div key={i} className="h-[58px] animate-pulse" style={{ border: "1px solid var(--border-subtle)", background: "var(--bg)", opacity: 0.6 }} />
                ))}
              </div>
            ) : notFound ? (
              <div className="px-3 py-4 text-center" style={{ border: "1px solid var(--border-subtle)", background: "var(--bg)" }}>
                <span className="mono text-xs" style={{ color: "var(--text-faint)" }}>No all-time portfolio data.</span>
              </div>
            ) : overview ? (
              <>
                <div className="grid grid-cols-2 gap-2 mb-2">
                  <StatCell label="TOTAL PNL" value={`${allPnl >= 0 ? "+" : ""}${fmt(allPnl)}`} tone={allPnl >= 0 ? "up" : "down"} />
                  <StatCell label="ROI" value={`${roi >= 0 ? "+" : ""}${roi.toFixed(2)}%`} tone={roi >= 0 ? "up" : "down"} />
                  <StatCell label="ACCOUNT VALUE" value={fmt(parseFloat(overview.account_value_usd))} />
                  <StatCell label="TOTAL VOLUME" value={fmt(parseFloat(overview.volume_usd))} />
                </div>
                {overview.first_trade_ts_ms > 0 && (
                  <div className="tag" style={{ color: "var(--text-faint)" }}>FIRST TRADE · {fmtDate(overview.first_trade_ts_ms)}</div>
                )}
              </>
            ) : null}
          </div>

          {/* Footer */}
          <button
            onClick={trackTrader}
            className="flex items-center justify-center gap-2 py-2.5 tag transition-colors w-full"
            style={{ border: "1px solid var(--accent)", color: "var(--accent)", background: "var(--accent-dim)" }}
            onMouseEnter={(e) => { e.currentTarget.style.background = "var(--accent)"; e.currentTarget.style.color = "var(--accent-fg)"; }}
            onMouseLeave={(e) => { e.currentTarget.style.background = "var(--accent-dim)"; e.currentTarget.style.color = "var(--accent)"; }}
          >
            <TrendingUp size={12} />
            TRACK TRADER
          </button>
        </div>
      </div>
    </div>
  );
}
