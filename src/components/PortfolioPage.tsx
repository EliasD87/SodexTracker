"use client";

import { useEffect, useRef, useState } from "react";
import { Plus, X, Wallet } from "lucide-react";
import { TrackerPage } from "@/components/TrackerPage";
import { usePortfolio } from "@/components/PortfolioProvider";
import { TradeLoader } from "@/components/TradeLoader";
import type { TrackerData, PortfolioOverviewData, ChartPoint } from "@/components/TrackerPage";

function shortAddr(addr: string): string {
  if (addr.length <= 14) return addr;
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`;
}

function AddressSwitcher() {
  const { addresses, activeId, switchAddress, addAddress, removeAddress } = usePortfolio();
  const [adding, setAdding] = useState(false);
  const [value, setValue] = useState("");
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (adding) inputRef.current?.focus();
  }, [adding]);

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
    <div className="max-w-[1100px] mx-auto px-5 pt-[88px] fade-up" style={{ background: "var(--bg)" }}>
      {addresses.length > 1 && (
        <div className="flex items-center gap-2 mb-2.5">
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
              <button
                className="flex items-center gap-1.5 mono text-[11px] font-bold tracking-tight"
                onClick={() => switchAddress(entry.id)}
                style={{ color: active ? "var(--accent)" : "var(--text-muted)" }}
                title={entry.address}
              >
                <Wallet size={11} style={{ opacity: active ? 1 : 0.6 }} />
                {shortAddr(entry.address)}
              </button>
              {addresses.length > 1 && (
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
      <TrackerPage
        key={savedAddress ?? "none"}
        initialAddress={savedAddress ?? undefined}
        portfolioMode
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
