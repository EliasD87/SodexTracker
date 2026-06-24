"use client";

import { createContext, useContext, useState, useCallback, useRef, useEffect, type ReactNode } from "react";

const STORAGE_KEY = "sodex-portfolio-address";

interface PortfolioContextValue {
  savedAddress: string | null;
  loaded: boolean;
  cachedData: unknown;
  cachedOverview: unknown;
  cachedChart: unknown[];
  hasCache: boolean;
  bindAddress: (addr: string) => void;
  unbindAddress: () => void;
  setCache: (data: unknown, overview: unknown, chart: unknown[]) => void;
  clearCache: () => void;
}

const PortfolioContext = createContext<PortfolioContextValue | null>(null);

export function PortfolioProvider({ children }: { children: ReactNode }) {
  const [savedAddress, setSavedAddress] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [hasCache, setHasCache] = useState(false);
  const cacheRef = useRef<{ data: unknown; overview: unknown; chart: unknown[] }>({
    data: null,
    overview: null,
    chart: [],
  });

  useEffect(() => {
    const stored = localStorage.getItem(STORAGE_KEY);
    setSavedAddress(stored);
    setLoaded(true);
  }, []);

  const bindAddress = useCallback((addr: string) => {
    localStorage.setItem(STORAGE_KEY, addr);
    setSavedAddress(addr);
  }, []);

  const unbindAddress = useCallback(() => {
    localStorage.removeItem(STORAGE_KEY);
    setSavedAddress(null);
    cacheRef.current = { data: null, overview: null, chart: [] };
    setHasCache(false);
  }, []);

  const setCache = useCallback((data: unknown, overview: unknown, chart: unknown[]) => {
    cacheRef.current = { data, overview, chart };
    setHasCache(true);
  }, []);

  const clearCache = useCallback(() => {
    cacheRef.current = { data: null, overview: null, chart: [] };
    setHasCache(false);
  }, []);

  return (
    <PortfolioContext.Provider
      value={{
        savedAddress,
        loaded,
        cachedData: cacheRef.current.data,
        cachedOverview: cacheRef.current.overview,
        cachedChart: cacheRef.current.chart,
        hasCache,
        bindAddress,
        unbindAddress,
        setCache,
        clearCache,
      }}
    >
      {children}
    </PortfolioContext.Provider>
  );
}

export function usePortfolio() {
  const ctx = useContext(PortfolioContext);
  if (!ctx) throw new Error("usePortfolio must be used within PortfolioProvider");
  return ctx;
}
