"use client";

import { createContext, useContext, useState, useCallback, useRef, useEffect, type ReactNode } from "react";
import type { User } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabase";

const LEGACY_STORAGE_KEY = "sodex-portfolio-address";
const LIST_STORAGE_KEY = "sodex-portfolio-addresses";
const ACTIVE_STORAGE_KEY = "sodex-portfolio-active";

export interface SavedPortfolioAddress {
  id: string;
  address: string;
  label: string | null;
}

interface PortfolioContextValue {
  savedAddress: string | null;
  addresses: SavedPortfolioAddress[];
  activeId: string | null;
  loaded: boolean;
  cachedData: unknown;
  cachedOverview: unknown;
  cachedChart: unknown[];
  hasCache: boolean;
  bindAddress: (addr: string) => void;
  addAddress: (addr: string) => void;
  removeAddress: (id: string) => void;
  switchAddress: (id: string) => void;
  renameAddress: (id: string, label: string) => void;
  unbindAddress: () => void;
  setCache: (data: unknown, overview: unknown, chart: unknown[]) => void;
  clearCache: () => void;
}

const PortfolioContext = createContext<PortfolioContextValue | null>(null);

function readLocalList(): SavedPortfolioAddress[] {
  try {
    const raw = localStorage.getItem(LIST_STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as SavedPortfolioAddress[];
      if (Array.isArray(parsed)) return parsed;
    }
  } catch { /* ignore */ }

  // Migrate legacy single-address storage into the list format.
  const legacy = localStorage.getItem(LEGACY_STORAGE_KEY);
  if (legacy) {
    const migrated: SavedPortfolioAddress[] = [{ id: `${Date.now()}`, address: legacy, label: null }];
    localStorage.setItem(LIST_STORAGE_KEY, JSON.stringify(migrated));
    localStorage.removeItem(LEGACY_STORAGE_KEY);
    return migrated;
  }
  return [];
}

function writeLocalList(list: SavedPortfolioAddress[]) {
  localStorage.setItem(LIST_STORAGE_KEY, JSON.stringify(list));
}

function readLocalActiveId(): string | null {
  return localStorage.getItem(ACTIVE_STORAGE_KEY);
}

function writeLocalActiveId(id: string | null) {
  if (id) localStorage.setItem(ACTIVE_STORAGE_KEY, id);
  else localStorage.removeItem(ACTIVE_STORAGE_KEY);
}

function resolveActiveId(list: SavedPortfolioAddress[], preferredId: string | null): string | null {
  if (preferredId && list.some((entry) => entry.id === preferredId)) return preferredId;
  return list[0]?.id ?? null;
}

export function PortfolioProvider({ children }: { children: ReactNode }) {
  const [addresses, setAddresses] = useState<SavedPortfolioAddress[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [hasCache, setHasCache] = useState(false);
  const userRef = useRef<User | null>(null);
  const cacheRef = useRef<{ data: unknown; overview: unknown; chart: unknown[] }>({
    data: null,
    overview: null,
    chart: [],
  });

  const loadLocal = useCallback(() => {
    const list = readLocalList();
    setAddresses(list);
    setActiveId(resolveActiveId(list, readLocalActiveId()));
    setLoaded(true);
  }, []);

  const loadRemoteAddresses = useCallback(async (user: User) => {
    if (!supabase) return;
    const { data, error } = await supabase
      .from("portfolio_addresses")
      .select("id,address,label")
      .eq("user_id", user.id)
      .order("created_at", { ascending: true });
    const list = !error && data ? (data as SavedPortfolioAddress[]) : [];
    setAddresses(list);
    setActiveId(resolveActiveId(list, readLocalActiveId()));
    setLoaded(true);
  }, []);

  useEffect(() => {
    if (!supabase) {
      loadLocal();
      return;
    }

    supabase.auth.getUser().then(({ data }) => {
      userRef.current = data.user;
      if (data.user) void loadRemoteAddresses(data.user);
      else loadLocal();
    });

    const { data: subscription } = supabase.auth.onAuthStateChange((_event, session) => {
      userRef.current = session?.user ?? null;
      if (session?.user) void loadRemoteAddresses(session.user);
      else loadLocal();
    });

    return () => subscription.subscription.unsubscribe();
  }, [loadLocal, loadRemoteAddresses]);

  const switchAddress = useCallback((id: string) => {
    setActiveId(id);
    writeLocalActiveId(id);
    cacheRef.current = { data: null, overview: null, chart: [] };
    setHasCache(false);
  }, []);

  const addAddress = useCallback((addr: string) => {
    const trimmed = addr.trim();
    if (!trimmed) return;
    const user = userRef.current;

    setAddresses((current) => {
      const existing = current.find((entry) => entry.address.toLowerCase() === trimmed.toLowerCase());
      if (existing) {
        switchAddress(existing.id);
        return current;
      }

      if (supabase && user) {
        void supabase
          .from("portfolio_addresses")
          .insert({ user_id: user.id, address: trimmed })
          .select("id,address,label")
          .single()
          .then(({ data, error }) => {
            if (error || !data) return;
            setAddresses((list) => [...list, data as SavedPortfolioAddress]);
            switchAddress((data as SavedPortfolioAddress).id);
          });
        return current;
      }

      const entry: SavedPortfolioAddress = { id: `${Date.now()}`, address: trimmed, label: null };
      const next = [...current, entry];
      writeLocalList(next);
      switchAddress(entry.id);
      return next;
    });
  }, [switchAddress]);

  const removeAddress = useCallback((id: string) => {
    const user = userRef.current;
    if (supabase && user) {
      void supabase.from("portfolio_addresses").delete().eq("id", id);
    }

    setAddresses((current) => {
      const next = current.filter((entry) => entry.id !== id);
      if (!supabase || !user) writeLocalList(next);
      setActiveId((currentActiveId) => {
        if (currentActiveId !== id) return currentActiveId;
        const nextActiveId = next[0]?.id ?? null;
        writeLocalActiveId(nextActiveId);
        cacheRef.current = { data: null, overview: null, chart: [] };
        setHasCache(false);
        return nextActiveId;
      });
      return next;
    });
  }, []);

  const renameAddress = useCallback((id: string, label: string) => {
    const trimmed = label.trim();
    const user = userRef.current;
    if (supabase && user) {
      void supabase.from("portfolio_addresses").update({ label: trimmed || null }).eq("id", id);
    }
    setAddresses((current) => {
      const next = current.map((entry) => (entry.id === id ? { ...entry, label: trimmed || null } : entry));
      if (!supabase || !user) writeLocalList(next);
      return next;
    });
  }, []);

  const unbindAddress = useCallback(() => {
    if (activeId) removeAddress(activeId);
  }, [activeId, removeAddress]);

  const setCache = useCallback((data: unknown, overview: unknown, chart: unknown[]) => {
    cacheRef.current = { data, overview, chart };
    setHasCache(true);
  }, []);

  const clearCache = useCallback(() => {
    cacheRef.current = { data: null, overview: null, chart: [] };
    setHasCache(false);
  }, []);

  const savedAddress = addresses.find((entry) => entry.id === activeId)?.address ?? null;

  return (
    <PortfolioContext.Provider
      value={{
        savedAddress,
        addresses,
        activeId,
        loaded,
        cachedData: cacheRef.current.data,
        cachedOverview: cacheRef.current.overview,
        cachedChart: cacheRef.current.chart,
        hasCache,
        bindAddress: addAddress,
        addAddress,
        removeAddress,
        switchAddress,
        renameAddress,
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
