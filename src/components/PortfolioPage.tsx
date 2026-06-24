"use client";

import { useEffect, useState } from "react";
import { TrackerPage } from "@/components/TrackerPage";
import { usePortfolio } from "@/components/PortfolioProvider";
import type { TrackerData, PortfolioOverviewData, ChartPoint } from "@/components/TrackerPage";

export function PortfolioPage() {
  const {
    savedAddress,
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
        <div className="mono text-sm" style={{ color: "var(--text-faint)" }}>Loading…</div>
      </div>
    );
  }

  if (showUnbound && !savedAddress) {
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
    <TrackerPage
      initialAddress={savedAddress ?? undefined}
      portfolioMode
      onUnbind={handleUnbind}
      onAddressSearched={(addr) => bindAddress(addr)}
      cachedData={hasCache ? (cachedData as TrackerData) : null}
      cachedOverview={hasCache ? (cachedOverview as PortfolioOverviewData) : null}
      cachedChart={hasCache ? (cachedChart as ChartPoint[]) : null}
      onCacheUpdate={(data, overview, chart) => setCache(data, overview, chart)}
    />
  );
}
