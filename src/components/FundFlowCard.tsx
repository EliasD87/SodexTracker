"use client";

import { useEffect, useState, useMemo } from "react";
import { CornerMarks } from "@/components/CornerMarks";
import { ArrowDown, ArrowUp, RefreshCw, ExternalLink } from "lucide-react";

interface FundFlowItem {
  account: string;
  amount: string;
  chain: string;
  coin: string;
  decimals: number;
  status: string;
  statusTime: number;
  type: string;
  token: string;
  txHash: string;
  receiver?: string;
  sender?: string;
}

const FLOW_API = "https://alpha-biz.sodex.dev/biz/mirror/account_flow";

const CHAIN_EXPLORER: Record<string, string> = {
  SOL: "https://solscan.io/tx/",
  SOLANA: "https://solscan.io/tx/",
  ETH: "https://etherscan.io/tx/",
  ETHEREUM: "https://etherscan.io/tx/",
  ARB: "https://arbiscan.io/tx/",
  ARBITRUM: "https://arbiscan.io/tx/",
  BASE: "https://basescan.org/tx/",
  BSC: "https://bscscan.com/tx/",
  BINANCE: "https://bscscan.com/tx/",
  POLYGON: "https://polygonscan.com/tx/",
  POLY: "https://polygonscan.com/tx/",
  OPTIMISM: "https://optimistic.etherscan.io/tx/",
  OPT: "https://optimistic.etherscan.io/tx/",
  AVAX: "https://snowtrace.io/tx/",
  AVALANCHE: "https://snowtrace.io/tx/",
  HYPERLIQUID: "https://explorer.hyperliquid.xyz/tx/",
  HYPE: "https://explorer.hyperliquid.xyz/tx/",
};

function getExplorerUrl(txHash: string, chain: string): string {
  const chainName = chain.split("_")[0].toUpperCase();
  const base = CHAIN_EXPLORER[chainName] ?? CHAIN_EXPLORER["ARB"];
  return `${base}${txHash}`;
}

function fmtAmount(amount: string, decimals: number): string {
  const num = parseFloat(amount) / Math.pow(10, decimals);
  return num.toLocaleString("en-US", { maximumFractionDigits: 4, minimumFractionDigits: 2 });
}

function fmtUsd(n: number): string {
  if (Math.abs(n) >= 1_000_000) return `$${(n / 1_000_000).toFixed(2)}M`;
  if (Math.abs(n) >= 1_000) return `$${(n / 1_000).toFixed(1)}K`;
  return `$${n.toFixed(2)}`;
}

function fmtDate(ts: number): string {
  return new Date(ts * 1000).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function isDeposit(type: string): boolean {
  return type.includes("Deposit");
}

function isUsdLike(coin: string): boolean {
  const u = coin.toUpperCase();
  return u.includes("USD") || u.includes("USDC") || u.includes("USDT");
}

export function FundFlowCard({ walletAddress }: { walletAddress: string }) {
  const [flows, setFlows] = useState<FundFlowItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [filter, setFilter] = useState<"all" | "deposit" | "withdraw">("all");
  const [page, setPage] = useState(0);
  const pageSize = 5;

  useEffect(() => {
    if (!walletAddress) return;
    let cancelled = false;
    setLoading(true);
    setError(false);
    fetch(FLOW_API, {
      method: "POST",
      headers: {
        "Content-Type": "application/json;charset=UTF-8",
        Accept: "application/json, text/plain, */*",
        Origin: "https://sodex.com",
        Referer: "https://sodex.com/",
      },
      body: JSON.stringify({ account: walletAddress, start: 0, limit: 200 }),
    })
      .then((r) => r.json())
      .then((json) => {
        if (cancelled) return;
        if (json.code !== "0") throw new Error(json.message || "API error");
        setFlows(json.data?.accountFlows ?? []);
      })
      .catch(() => {
        if (!cancelled) setError(true);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [walletAddress]);

  const stats = useMemo(() => {
    let deposits = 0;
    let withdrawals = 0;
    for (const f of flows) {
      const amount = parseFloat(f.amount) / Math.pow(10, f.decimals);
      const usdVal = isUsdLike(f.coin) ? amount : 0;
      if (isDeposit(f.type)) deposits += usdVal;
      else withdrawals += usdVal;
    }
    return { deposits, withdrawals, net: deposits - withdrawals };
  }, [flows]);

  const filtered = useMemo(() => {
    if (filter === "deposit") return flows.filter((f) => isDeposit(f.type));
    if (filter === "withdraw") return flows.filter((f) => !isDeposit(f.type));
    return flows;
  }, [flows, filter]);

  useEffect(() => { setPage(0); }, [filter]);

  const totalPages = Math.ceil(filtered.length / pageSize);
  const pageFlows = filtered.slice(page * pageSize, (page + 1) * pageSize);

  return (
    <div className="relative" style={{ border: "1px solid var(--border)", background: "var(--bg-surface)" }}>
      <CornerMarks size={8} inset={-1} thickness={1} opacity={0.5} />

      {/* Header */}
      <div className="flex items-center justify-between px-5 py-3" style={{ borderBottom: "1px solid var(--border-subtle)" }}>
        <div className="flex items-center gap-2">
          <ArrowDown size={14} style={{ color: "var(--accent)" }} />
          <span className="tag" style={{ color: "var(--accent)" }}>FUND FLOW</span>
        </div>
        {loading && <RefreshCw size={12} className="animate-spin" style={{ color: "var(--text-faint)" }} />}
      </div>

      {/* Netflow stats strip */}
      {!loading && !error && flows.length > 0 && (
        <div className="grid grid-cols-3" style={{ borderBottom: "1px solid var(--border-subtle)" }}>
          {[
            { label: "INFLOW", value: stats.deposits, tone: "var(--color-up)" },
            { label: "OUTFLOW", value: stats.withdrawals, tone: "var(--color-down)" },
            { label: "NET", value: stats.net, tone: stats.net >= 0 ? "var(--color-up)" : "var(--color-down)" },
          ].map((s, i) => (
            <div
              key={s.label}
              className="px-4 py-3 flex flex-col gap-1"
              style={{ borderLeft: i > 0 ? "1px solid var(--border-subtle)" : "none" }}
            >
              <span className="tag" style={{ color: "var(--text-faint)" }}>{s.label}</span>
              <span className="mono text-sm font-bold tabular-nums" style={{ color: s.tone }}>
                {s.label === "NET" && s.value >= 0 ? "+" : ""}{fmtUsd(s.value)}
              </span>
            </div>
          ))}
        </div>
      )}

      {/* Filter buttons */}
      {!loading && !error && flows.length > 0 && (
        <div className="flex items-center gap-2 px-5 py-2.5" style={{ borderBottom: "1px solid var(--border-subtle)" }}>
          {[
            { id: "all", label: "ALL" },
            { id: "deposit", label: "DEPOSITS" },
            { id: "withdraw", label: "WITHDRAWALS" },
          ].map((t) => (
            <button
              key={t.id}
              onClick={() => setFilter(t.id as typeof filter)}
              className="tag px-2.5 py-1 transition-colors"
              style={{
                background: filter === t.id ? "var(--accent)" : "transparent",
                color: filter === t.id ? "var(--accent-fg)" : "var(--text-muted)",
                border: `1px solid ${filter === t.id ? "var(--accent)" : "var(--border)"}`,
                cursor: "pointer",
              }}
            >
              {t.label}
            </button>
          ))}
        </div>
      )}

      {/* Content */}
      <div className="p-5">
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <div className="flex items-end gap-1.5" style={{ height: 60 }}>
              {Array.from({ length: 20 }).map((_, i) => (
                <div
                  key={i}
                  className="w-2 rounded-sm animate-pulse"
                  style={{
                    height: `${30 + ((i * 37) % 60)}%`,
                    background: "var(--border)",
                    animationDelay: `${i * 40}ms`,
                  }}
                />
              ))}
            </div>
          </div>
        ) : error ? (
          <div className="flex flex-col items-center justify-center gap-3 py-12">
            <span className="mono text-sm" style={{ color: "var(--text-faint)" }}>Failed to load fund flow data</span>
            <span className="tag px-3 py-1.5" style={{ border: "1px solid var(--accent)", color: "var(--accent)" }}>
              RETRY
            </span>
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex items-center justify-center py-12">
            <span className="mono text-sm" style={{ color: "var(--text-faint)" }}>
              {flows.length === 0 ? "No transfers detected" : "No flows match this filter"}
            </span>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead>
                <tr style={{ borderBottom: "1px solid var(--border-subtle)" }}>
                  <th className="py-2 px-2 tag" style={{ color: "var(--text-faint)" }}>TYPE</th>
                  <th className="py-2 px-2 tag" style={{ color: "var(--text-faint)" }}>ASSET</th>
                  <th className="py-2 px-2 tag text-right" style={{ color: "var(--text-faint)" }}>AMOUNT</th>
                  <th className="py-2 px-2 tag" style={{ color: "var(--text-faint)" }}>CHAIN</th>
                  <th className="py-2 px-2 tag" style={{ color: "var(--text-faint)" }}>TIME</th>
                  <th className="py-2 px-2 tag" style={{ color: "var(--text-faint)" }}>TX</th>
                </tr>
              </thead>
              <tbody>
                {pageFlows.map((flow, i) => {
                  const deposit = isDeposit(flow.type);
                  return (
                    <tr
                      key={i}
                      className="transition-colors"
                      style={{ borderBottom: "1px solid var(--border-subtle)" }}
                      onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = "var(--bg-elevated)"; }}
                      onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = "transparent"; }}
                    >
                      <td className="py-2.5 px-2">
                        <div className="flex items-center gap-1.5">
                          {deposit ? (
                            <ArrowDown size={12} style={{ color: "var(--color-up)" }} />
                          ) : (
                            <ArrowUp size={12} style={{ color: "var(--color-down)" }} />
                          )}
                          <span
                            className="tag"
                            style={{ color: deposit ? "var(--color-up)" : "var(--color-down)" }}
                          >
                            {deposit ? "DEPOSIT" : "WITHDRAW"}
                          </span>
                        </div>
                      </td>
                      <td className="py-2.5 px-2">
                        <span className="mono text-xs font-bold" style={{ color: "var(--text)" }}>{flow.coin}</span>
                      </td>
                      <td
                        className="py-2.5 px-2 text-right mono text-xs font-bold"
                        style={{ color: deposit ? "var(--color-up)" : "var(--color-down)" }}
                      >
                        {deposit ? "+" : "-"}{fmtAmount(flow.amount, flow.decimals)}
                      </td>
                      <td className="py-2.5 px-2">
                        <span className="tag" style={{ color: "var(--text-faint)" }}>
                          {flow.chain.replace("_", " ")}
                        </span>
                      </td>
                      <td className="py-2.5 px-2">
                        <span className="mono text-xs" style={{ color: "var(--text-faint)" }}>
                          {fmtDate(flow.statusTime)}
                        </span>
                      </td>
                      <td className="py-2.5 px-2">
                        <a
                          href={getExplorerUrl(flow.txHash, flow.chain)}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center justify-center transition-colors"
                          style={{ color: "var(--text-faint)" }}
                          onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.color = "var(--accent)"; }}
                          onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.color = "var(--text-faint)"; }}
                        >
                          <ExternalLink size={12} />
                        </a>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            {totalPages > 1 && (
              <div className="flex items-center justify-between py-3 px-2">
                <span className="tag" style={{ color: "var(--text-faint)" }}>
                  {page * pageSize + 1}–{Math.min((page + 1) * pageSize, filtered.length)} of {filtered.length}
                </span>
                <div className="flex items-center gap-1">
                  <button
                    onClick={() => setPage((p) => Math.max(0, p - 1))}
                    disabled={page === 0}
                    className="flex items-center justify-center w-7 h-7 transition-colors disabled:opacity-30"
                    style={{ border: "1px solid var(--border)", color: "var(--text-muted)" }}
                  >
                    <span style={{ fontSize: 14 }}>‹</span>
                  </button>
                  <span className="tag px-2" style={{ color: "var(--text-faint)" }}>
                    {page + 1}/{totalPages}
                  </span>
                  <button
                    onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
                    disabled={page === totalPages - 1}
                    className="flex items-center justify-center w-7 h-7 transition-colors disabled:opacity-30"
                    style={{ border: "1px solid var(--border)", color: "var(--text-muted)" }}
                  >
                    <span style={{ fontSize: 14 }}>›</span>
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
