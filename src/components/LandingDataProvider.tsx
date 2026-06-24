"use client";

import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { cachedFetchJson } from "@/lib/fetchCache";

const GW_BASE = "https://mainnet-gw.sodex.dev/api/v1";
const DATA_BASE = "https://mainnet-data.sodex.dev/api/v1";

function getUtcDateRange() {
  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  const fmt = (d: Date) =>
    `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
  return {
    start: fmt(new Date(now.getTime() - 24 * 60 * 60 * 1000)),
    end: fmt(now),
    today: fmt(now),
  };
}

async function fetchJson(url: string, opts?: RequestInit): Promise<any> {
  try {
    return await cachedFetchJson(url, opts);
  } catch {
    return null;
  }
}

interface LandingData {
  vol24hRaw: any;
  oiRaw: any;
  usersRaw: any;
  tvlRaw: any;
  markPricesRaw: any;
  loadingCards: boolean;

  volumeAllRaw: any;
  volumeSpotRaw: any;
  volumeFutRaw: any;
  loadingVolume: boolean;

  pnlLeadersRaw: any;
  volLeadersRaw: any;
  loadingLeaders: boolean;
}

const LandingContext = createContext<LandingData | null>(null);

export function useLandingData(): LandingData {
  const ctx = useContext(LandingContext);
  if (!ctx) throw new Error("useLandingData must be used within LandingDataProvider");
  return ctx;
}

export function LandingDataProvider({ children }: { children: ReactNode }) {
  const [vol24hRaw, setVol24hRaw] = useState<any>(null);
  const [oiRaw, setOiRaw] = useState<any>(null);
  const [usersRaw, setUsersRaw] = useState<any>(null);
  const [tvlRaw, setTvlRaw] = useState<any>(null);
  const [markPricesRaw, setMarkPricesRaw] = useState<any>(null);
  const [loadingCards, setLoadingCards] = useState(true);

  const [volumeAllRaw, setVolumeAllRaw] = useState<any>(null);
  const [volumeSpotRaw, setVolumeSpotRaw] = useState<any>(null);
  const [volumeFutRaw, setVolumeFutRaw] = useState<any>(null);
  const [loadingVolume, setLoadingVolume] = useState(true);

  const [pnlLeadersRaw, setPnlLeadersRaw] = useState<any>(null);
  const [volLeadersRaw, setVolLeadersRaw] = useState<any>(null);
  const [loadingLeaders, setLoadingLeaders] = useState(true);

  useEffect(() => {
    let cancelled = false;
    const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

    async function fetchAll() {
      const { start, end, today } = getUtcDateRange();

      // Batch 1: top 4 cards + mark prices (5 parallel requests)
      const [vol24h, oi, users, tvl, markPrices] = await Promise.all([
        fetchJson(`${DATA_BASE}/dashboard/volume?start_date=${start}&end_date=${end}&market_type=all`),
        fetchJson(`${DATA_BASE}/dashboard/open-interest?start_date=${start}&end_date=${end}`),
        fetchJson(`${DATA_BASE}/dashboard/users?start_date=2024-01-01&end_date=${today}`),
        fetchJson(`${DATA_BASE}/mirror/tvl/history`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({}),
        }),
        fetchJson(`${GW_BASE}/perps/markets/mark-prices`),
      ]);
      if (cancelled) return;
      setVol24hRaw(vol24h);
      setOiRaw(oi);
      setUsersRaw(users);
      setTvlRaw(tvl);
      setMarkPricesRaw(markPrices);
      setLoadingCards(false);

      await sleep(200);
      if (cancelled) return;

      // Batch 2: volume over time — ALL history (3 parallel requests)
      const [allRes, spotRes, futRes] = await Promise.all([
        fetchJson(`${DATA_BASE}/dashboard/volume?start_date=2020-01-01&end_date=${today}&market_type=all`),
        fetchJson(`${DATA_BASE}/dashboard/volume?start_date=2020-01-01&end_date=${today}&market_type=spot`),
        fetchJson(`${DATA_BASE}/dashboard/volume?start_date=2020-01-01&end_date=${today}&market_type=futures`),
      ]);
      if (cancelled) return;
      setVolumeAllRaw(allRes);
      setVolumeSpotRaw(spotRes);
      setVolumeFutRaw(futRes);
      setLoadingVolume(false);

      await sleep(200);
      if (cancelled) return;

      // Batch 3: leaderboard (2 parallel requests)
      const [pnl, vol] = await Promise.all([
        fetchJson(`${DATA_BASE}/leaderboard?window_type=24H&page=1&page_size=10&sort_order=desc&sort_by=pnl`),
        fetchJson(`${DATA_BASE}/leaderboard?window_type=24H&page=1&page_size=10&sort_order=desc&sort_by=volume`),
      ]);
      if (cancelled) return;
      setPnlLeadersRaw(pnl);
      setVolLeadersRaw(vol);
      setLoadingLeaders(false);
    }

    fetchAll();
    return () => { cancelled = true; };
  }, []);

  return (
    <LandingContext.Provider
      value={{
        vol24hRaw,
        oiRaw,
        usersRaw,
        tvlRaw,
        markPricesRaw,
        loadingCards,
        volumeAllRaw,
        volumeSpotRaw,
        volumeFutRaw,
        loadingVolume,
        pnlLeadersRaw,
        volLeadersRaw,
        loadingLeaders,
      }}
    >
      {children}
    </LandingContext.Provider>
  );
}
