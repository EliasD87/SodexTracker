"use client";

import { createContext, useContext, useState, useCallback, useRef, useEffect, type ReactNode } from "react";
import type { User } from "@supabase/supabase-js";
import { useConnection, useConnectionEffect, useDisconnect } from "wagmi";
import { supabase } from "@/lib/supabase";

const LEGACY_STORAGE_KEY = "sodex-portfolio-address";
const LIST_STORAGE_KEY = "sodex-portfolio-addresses";
const ACTIVE_STORAGE_KEY = "sodex-portfolio-active";

export interface SavedPortfolioAddress {
  id: string;
  address: string;
  label: string | null;
  /** True for the entry that mirrors the connected wallet. */
  connected?: boolean;
}

/**
 * The connected wallet's entry. It is derived from the wallet on every render
 * and never written to storage or Supabase, so disconnecting removes it and
 * switching accounts inside the wallet moves it along.
 */
export const WALLET_ENTRY_ID = "connected-wallet";

interface PortfolioContextValue {
  savedAddress: string | null;
  /** The address of the connected wallet, if one is connected. */
  connectedAddress: string | null;
  addresses: SavedPortfolioAddress[];
  activeId: string | null;
  loaded: boolean;
  /** True when the list lives in the user's account (signed in), false when only on this device. */
  synced: boolean;
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

/** The wallet first, then every saved address that isn't the same one. */
function withWallet(list: SavedPortfolioAddress[], wallet: string | null): SavedPortfolioAddress[] {
  if (!wallet) return list;
  return [
    { id: WALLET_ENTRY_ID, address: wallet, label: null, connected: true },
    ...list.filter((entry) => entry.address.toLowerCase() !== wallet.toLowerCase()),
  ];
}

interface Cache {
  /** The address this data belongs to. */
  address: string | null;
  data: unknown;
  overview: unknown;
  chart: unknown[];
}

const EMPTY_CACHE: Cache = { address: null, data: null, overview: null, chart: [] };

export function PortfolioProvider({ children }: { children: ReactNode }) {
  const [addresses, setAddresses] = useState<SavedPortfolioAddress[]>([]);
  // The preferred selection. It may name the wallet entry while no wallet is
  // connected; the effective selection is resolved against the list at render.
  const [activeId, setActiveId] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);
  const userRef = useRef<User | null>(null);
  // userRef serves the callbacks; this is the same fact as state, for the UI.
  const [synced, setSynced] = useState(false);
  const [cache, setCacheState] = useState<Cache>(EMPTY_CACHE);

  const { address: walletAddress } = useConnection();
  const { mutate: disconnectWallet } = useDisconnect();
  const wallet = walletAddress ?? null;
  const walletRef = useRef<string | null>(null);
  useEffect(() => {
    walletRef.current = wallet;
  }, [wallet]);

  const loadLocal = useCallback(() => {
    setAddresses(readLocalList());
    setActiveId(readLocalActiveId());
    setLoaded(true);
  }, []);

  const loadRemoteAddresses = useCallback(async (user: User) => {
    if (!supabase) return;
    const { data, error } = await supabase
      .from("portfolio_addresses")
      .select("id,address,label")
      .eq("user_id", user.id)
      .order("created_at", { ascending: true });
    setAddresses(!error && data ? (data as SavedPortfolioAddress[]) : []);
    setActiveId(readLocalActiveId());
    setLoaded(true);
  }, []);

  useEffect(() => {
    if (!supabase) {
      loadLocal();
      return;
    }

    supabase.auth.getUser().then(({ data }) => {
      userRef.current = data.user;
      setSynced(!!data.user);
      if (data.user) void loadRemoteAddresses(data.user);
      else loadLocal();
    });

    const { data: subscription } = supabase.auth.onAuthStateChange((_event, session) => {
      userRef.current = session?.user ?? null;
      setSynced(!!session?.user);
      if (session?.user) void loadRemoteAddresses(session.user);
      else loadLocal();
    });

    return () => subscription.subscription.unsubscribe();
  }, [loadLocal, loadRemoteAddresses]);

  const switchAddress = useCallback((id: string) => {
    setActiveId(id);
    writeLocalActiveId(id);
    setCacheState(EMPTY_CACHE);
  }, []);

  // A wallet the user has just connected is what they want to look at. A
  // silent reconnect on page load is not a choice, so it leaves the stored
  // selection alone, which already names the wallet if it was last used.
  useConnectionEffect({
    onConnect({ isReconnected }) {
      if (!isReconnected) switchAddress(WALLET_ENTRY_ID);
    },
  });

  const addAddress = useCallback((addr: string) => {
    const trimmed = addr.trim();
    if (!trimmed) return;
    if (walletRef.current && walletRef.current.toLowerCase() === trimmed.toLowerCase()) {
      switchAddress(WALLET_ENTRY_ID);
      return;
    }
    const user = userRef.current;
    // Made once, out here: React may run the updater below twice, and two
    // timestamps would leave the list and the selection naming different ids.
    const newId = `${Date.now()}`;

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

      const entry: SavedPortfolioAddress = { id: newId, address: trimmed, label: null };
      const next = [...current, entry];
      writeLocalList(next);
      switchAddress(entry.id);
      return next;
    });
  }, [switchAddress]);

  const removeAddress = useCallback((id: string) => {
    // "Removing" the wallet entry means disconnecting the wallet.
    if (id === WALLET_ENTRY_ID) {
      disconnectWallet();
      return;
    }
    const user = userRef.current;
    if (supabase && user) {
      // A Supabase query only runs once it's awaited or then'd: without this
      // the row stayed, and the wallet came back on the next load.
      void supabase
        .from("portfolio_addresses")
        .delete()
        .eq("id", id)
        .then(({ error }) => {
          if (error) void loadRemoteAddresses(user);
        });
    }

    setAddresses((current) => {
      const next = current.filter((entry) => entry.id !== id);
      if (!supabase || !user) writeLocalList(next);
      setActiveId((currentActiveId) => {
        if (currentActiveId !== id) return currentActiveId;
        const nextActiveId = next[0]?.id ?? null;
        writeLocalActiveId(nextActiveId);
        setCacheState(EMPTY_CACHE);
        return nextActiveId;
      });
      return next;
    });
  }, [disconnectWallet, loadRemoteAddresses]);

  const renameAddress = useCallback((id: string, label: string) => {
    if (id === WALLET_ENTRY_ID) return;
    const trimmed = label.trim();
    const user = userRef.current;
    if (supabase && user) {
      void supabase
        .from("portfolio_addresses")
        .update({ label: trimmed || null })
        .eq("id", id)
        .then(({ error }) => {
          if (error) void loadRemoteAddresses(user);
        });
    }
    setAddresses((current) => {
      const next = current.map((entry) => (entry.id === id ? { ...entry, label: trimmed || null } : entry));
      if (!supabase || !user) writeLocalList(next);
      return next;
    });
  }, [loadRemoteAddresses]);

  const effectiveAddresses = withWallet(addresses, wallet);
  const effectiveActiveId = resolveActiveId(effectiveAddresses, activeId);
  const savedAddress = effectiveAddresses.find((entry) => entry.id === effectiveActiveId)?.address ?? null;

  const unbindAddress = useCallback(() => {
    if (effectiveActiveId) removeAddress(effectiveActiveId);
  }, [effectiveActiveId, removeAddress]);

  // The page reporting data is always showing the active address, so that is
  // the address the data is filed under.
  const setCache = useCallback((data: unknown, overview: unknown, chart: unknown[]) => {
    setCacheState({ address: savedAddress, data, overview, chart });
  }, [savedAddress]);

  const clearCache = useCallback(() => setCacheState(EMPTY_CACHE), []);

  // Switching accounts inside the wallet changes the address without passing
  // through switchAddress, so a cache from the previous account must not be
  // handed to the new one.
  const cacheMatches = cache.address !== null && cache.address === savedAddress;

  return (
    <PortfolioContext.Provider
      value={{
        savedAddress,
        connectedAddress: wallet,
        addresses: effectiveAddresses,
        activeId: effectiveActiveId,
        loaded,
        synced,
        cachedData: cache.data,
        cachedOverview: cache.overview,
        cachedChart: cache.chart,
        hasCache: cacheMatches,
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
