"use client";

import { useEffect, useRef, useState } from "react";
import { Plus, X, Wallet, Pencil, Check } from "lucide-react";
import { TrackerPage } from "@/components/TrackerPage";
import { usePortfolio } from "@/components/PortfolioProvider";
import { TradeLoader } from "@/components/TradeLoader";
import { cachedApiFetch } from "@/lib/fetchCache";
import type { TrackerData, PortfolioOverviewData, ChartPoint } from "@/components/TrackerPage";

const GW_BASE = "https://mainnet-gw.sodex.dev/api/v1";
const DATA_BASE = "https://mainnet-data.sodex.dev/api/v1";

function shortAddr(addr: string): string {
  if (addr.length <= 14) return addr;
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`;
}

function fmtUsd(n: number): string {
  const abs = Math.abs(n);
  const sign = n < 0 ? "-" : "";
  if (abs >= 1_000_000) return `${sign}$${(abs / 1_000_000).toFixed(2)}M`;
  if (abs >= 1_000) return `${sign}$${(abs / 1_000).toFixed(2)}K`;
  return `${sign}$${abs.toFixed(2)}`;
}

interface AddressSummary {
  value: number;
  pnl: number;
  volume: number;
}

async function fetchAddressSummary(addr: string): Promise<AddressSummary> {
  const state = await cachedApiFetch<{ aid: number }>(`${GW_BASE}/perps/accounts/${addr}/state`);
  const overview = await cachedApiFetch<PortfolioOverviewData>(
    `${DATA_BASE}/wallet/portfolio/overview?account_id=${state.aid}&window=1Y`
  );
  return {
    value: parseFloat(overview.account_value_usd) || 0,
    pnl: parseFloat(overview.total_pnl_usd) || 0,
    volume: parseFloat(overview.volume_usd) || 0,
  };
}

function PortfolioSummary() {
  const { addresses } = usePortfolio();
  const [loading, setLoading] = useState(false);
  const [totals, setTotals] = useState<{ value: number; pnl: number; volume: number; loadedCount: number } | null>(null);
  const addressKey = addresses.map((a) => a.id).join(",");

  useEffect(() => {
    if (addresses.length < 2) {
      setTotals(null);
      return;
    }
    let cancelled = false;
    setLoading(true);
    Promise.allSettled(addresses.map((a) => fetchAddressSummary(a.address))).then((results) => {
      if (cancelled) return;
      const acc = { value: 0, pnl: 0, volume: 0, loadedCount: 0 };
      for (const r of results) {
        if (r.status === "fulfilled") {
          acc.value += r.value.value;
          acc.pnl += r.value.pnl;
          acc.volume += r.value.volume;
          acc.loadedCount += 1;
        }
      }
      setTotals(acc);
      setLoading(false);
    });
    return () => { cancelled = true; };
  }, [addressKey]);

  if (addresses.length < 2) return null;

  const tiles = [
    { label: "TOTAL VALUE", value: totals ? fmtUsd(totals.value) : null },
    {
      label: "TOTAL PNL (1Y)",
      value: totals ? `${totals.pnl >= 0 ? "+" : ""}${fmtUsd(totals.pnl)}` : null,
      tone: totals && totals.pnl >= 0 ? "var(--green)" : "var(--red)",
    },
    { label: "TOTAL VOLUME (1Y)", value: totals ? fmtUsd(totals.volume) : null },
  ];

  return (
    <div className="max-w-[1100px] mx-auto px-5 pb-6 fade-up">
      <div className="grid grid-cols-3 gap-3">
        {tiles.map((tile) => (
          <div
            key={tile.label}
            className="p-4"
            style={{ border: "1px solid var(--border)", background: "var(--bg-surface)" }}
          >
            <div className="tag mb-2" style={{ color: "var(--text-faint)" }}>{tile.label}</div>
            {loading || !tile.value ? (
              <div className="h-5 w-20 animate-pulse" style={{ background: "var(--bg-elevated)" }} />
            ) : (
              <div
                className="mono text-lg font-bold"
                style={{ color: tile.tone ?? "var(--text)" }}
              >
                {tile.value}
              </div>
            )}
          </div>
        ))}
      </div>
      {totals && totals.loadedCount < addresses.length && (
        <div className="tag mt-2" style={{ color: "var(--text-faint)" }}>
          {totals.loadedCount}/{addresses.length} portfolios loaded
        </div>
      )}
    </div>
  );
}

function AddressSwitcher() {
  const { addresses, activeId, switchAddress, addAddress, removeAddress, renameAddress } = usePortfolio();
  const [adding, setAdding] = useState(false);
  const [value, setValue] = useState("");
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editValue, setEditValue] = useState("");
  const editRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (adding) inputRef.current?.focus();
  }, [adding]);

  useEffect(() => {
    if (editingId) editRef.current?.focus();
  }, [editingId]);

  const startEdit = (id: string, currentLabel: string | null) => {
    setEditingId(id);
    setEditValue(currentLabel ?? "");
  };

  const commitEdit = () => {
    if (editingId) renameAddress(editingId, editValue);
    setEditingId(null);
    setEditValue("");
  };

  if (addresses.length === 0 && !adding) return null;

  const submit = () => {
    const addr = value.trim();
    if (!addr) {
      setAdding(false);
      return;
    }
    if (!/^0x[a-fA-F0-9]{40}$/.test(addr)) {
      setError("Enter a valid wallet address.");
      return;
    }
    addAddress(addr);
    setValue("");
    setError(null);
    setAdding(false);
  };

  return (
    <div className="max-w-[1100px] mx-auto px-5 pt-[88px] pb-4 fade-up" style={{ background: "var(--bg)" }}>
      {addresses.length > 1 && (
        <div className="flex items-center gap-2 mb-3">
          <span className="w-3 h-px" style={{ background: "var(--text-faint)" }} />
          <span className="tag" style={{ color: "var(--text-faint)" }}>
            {addresses.length} SAVED PORTFOLIOS
          </span>
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2">
        {addresses.map((entry) => {
          const active = entry.id === activeId;
          return (
            <div
              key={entry.id}
              className="group flex items-center gap-2 pl-3 pr-2 py-1.5 transition-colors"
              style={{
                border: `1px solid ${active ? "var(--accent)" : "var(--border)"}`,
                background: active ? "var(--accent-dim)" : "var(--bg-surface)",
              }}
            >
              {editingId === entry.id ? (
                <div className="flex items-center gap-1">
                  <input
                    ref={editRef}
                    value={editValue}
                    onChange={(e) => setEditValue(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") commitEdit();
                      if (e.key === "Escape") setEditingId(null);
                    }}
                    onBlur={commitEdit}
                    placeholder="Label…"
                    spellCheck={false}
                    autoComplete="off"
                    className="mono text-[11px] font-bold bg-transparent outline-none"
                    style={{ color: "var(--text)", width: 90 }}
                  />
                  <button onClick={commitEdit} style={{ color: "var(--accent)" }}>
                    <Check size={11} />
                  </button>
                </div>
              ) : (
                <button
                  className="flex items-center gap-1.5 mono text-[11px] font-bold tracking-tight"
                  onClick={() => switchAddress(entry.id)}
                  style={{ color: active ? "var(--accent)" : "var(--text-muted)" }}
                  title={entry.address}
                >
                  <Wallet size={11} style={{ opacity: active ? 1 : 0.6 }} />
                  {entry.label || shortAddr(entry.address)}
                </button>
              )}
              {editingId !== entry.id && (
                <button
                  onClick={() => startEdit(entry.id, entry.label)}
                  className="opacity-0 group-hover:opacity-60 hover:!opacity-100 transition-opacity"
                  style={{ color: "var(--text-faint)" }}
                  title="Rename"
                >
                  <Pencil size={10} />
                </button>
              )}
              {addresses.length > 1 && editingId !== entry.id && (
                <button
                  onClick={() => removeAddress(entry.id)}
                  className="opacity-0 group-hover:opacity-60 hover:!opacity-100 transition-opacity"
                  style={{ color: "var(--text-faint)" }}
                  title="Remove address"
                >
                  <X size={11} />
                </button>
              )}
            </div>
          );
        })}

        {adding ? (
          <div className="relative flex items-center gap-1.5">
            <input
              ref={inputRef}
              value={value}
              onChange={(e) => { setValue(e.target.value); setError(null); }}
              onKeyDown={(e) => {
                if (e.key === "Enter") submit();
                if (e.key === "Escape") { setAdding(false); setValue(""); setError(null); }
              }}
              onBlur={() => { if (!value.trim()) setAdding(false); }}
              placeholder="Enter wallet address…"
              spellCheck={false}
              autoComplete="off"
              className="mono text-[11px] px-3 py-1.5 outline-none"
              style={{
                border: `1px solid ${error ? "var(--red)" : "var(--accent)"}`,
                background: "var(--bg-surface)",
                color: "var(--text)",
                width: 240,
              }}
            />
            <button
              onClick={submit}
              className="px-2.5 py-1.5 tag font-bold"
              style={{ background: "var(--accent)", color: "var(--accent-fg)" }}
            >
              ADD
            </button>
            {error && (
              <span
                className="absolute top-full left-0 mt-1.5 tag whitespace-nowrap"
                style={{ color: "var(--red)" }}
              >
                {error}
              </span>
            )}
          </div>
        ) : (
          <button
            onClick={() => setAdding(true)}
            className="flex items-center gap-1 px-2.5 py-1.5 tag font-bold transition-colors"
            style={{ border: "1px dashed var(--border)", color: "var(--text-muted)" }}
            onMouseEnter={(e) => {
              (e.currentTarget as HTMLElement).style.borderColor = "var(--accent)";
              (e.currentTarget as HTMLElement).style.color = "var(--accent)";
            }}
            onMouseLeave={(e) => {
              (e.currentTarget as HTMLElement).style.borderColor = "var(--border)";
              (e.currentTarget as HTMLElement).style.color = "var(--text-muted)";
            }}
          >
            <Plus size={11} />
            ADD ADDRESS
          </button>
        )}
      </div>
    </div>
  );
}

export function PortfolioPage() {
  const {
    savedAddress,
    addresses,
    loaded,
    unbindAddress,
    bindAddress,
    cachedData,
    cachedOverview,
    cachedChart,
    hasCache,
    setCache,
  } = usePortfolio();
  const [showUnbound, setShowUnbound] = useState(false);

  // When unbind is triggered, show a brief "unbound" confirmation screen
  useEffect(() => {
    if (showUnbound && !savedAddress) {
      const t = setTimeout(() => setShowUnbound(false), 2500);
      return () => clearTimeout(t);
    }
  }, [showUnbound, savedAddress]);

  const handleUnbind = () => {
    unbindAddress();
    setShowUnbound(true);
  };

  if (!loaded) {
    return (
      <div className="min-h-screen flex items-center justify-center pt-14">
        <TradeLoader label="LOADING PORTFOLIO" />
      </div>
    );
  }

  if (showUnbound && !savedAddress && addresses.length === 0) {
    return (
      <div className="min-h-screen flex items-center justify-center pt-14 px-5">
        <div className="flex flex-col items-center gap-4 text-center fade-up">
          <div
            className="flex items-center justify-center rounded-sm"
            style={{
              width: 56,
              height: 56,
              background: "var(--bg-surface)",
              border: "1px solid var(--accent)",
            }}
          >
            <span style={{ color: "var(--accent)", fontSize: 24 }}>✓</span>
          </div>
          <h2 className="text-xl font-bold" style={{ color: "var(--text)" }}>Wallet Unbound</h2>
          <p className="text-sm max-w-sm" style={{ color: "var(--text-muted)" }}>
            Your wallet address has been removed from this device.
            You can bind a new wallet at any time.
          </p>
        </div>
      </div>
    );
  }

  return (
    <>
      <AddressSwitcher />
      <PortfolioSummary />
      <TrackerPage
        key={savedAddress ?? "none"}
        initialAddress={savedAddress ?? undefined}
        portfolioMode
        compact={addresses.length > 0}
        onUnbind={handleUnbind}
        onAddressSearched={(addr) => bindAddress(addr)}
        cachedData={hasCache ? (cachedData as TrackerData) : null}
        cachedOverview={hasCache ? (cachedOverview as PortfolioOverviewData) : null}
        cachedChart={hasCache ? (cachedChart as ChartPoint[]) : null}
        onCacheUpdate={(data, overview, chart) => setCache(data, overview, chart)}
      />
    </>
  );
}
