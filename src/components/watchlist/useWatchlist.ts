"use client";

import { useCallback, useEffect, useState } from "react";
import type { User } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabase";
import { defaultName } from "@/lib/watchlistAddress";

/**
 * The watchlist's data: groups and saved wallets, in this browser
 * (localStorage) or, when signed in, in Supabase. The storage keys, tables
 * and row shapes are the ones the watchlist has always used, so nothing
 * anyone saved is lost by the redesign.
 */

export interface WatchlistEntry {
  id: string;
  name: string;
  address: string;
  color: string;
  groupId: string;
}

export interface WatchlistGroup {
  id: string;
  name: string;
}

type GroupRow = { id: string; name: string };
type AddressRow = { id: string; name: string; address: string; color: string; group_id: string };

const ENTRIES_KEY = "sodex-watchlist-v1";
const GROUPS_KEY = "sodex-watchlist-groups-v1";
export const WATCHLIST_COLORS = ["#35C77F", "#60A5FA", "#F59E0B", "#F0616D", "#A78BFA", "#EDEDED"];
export const DEFAULT_GROUPS: WatchlistGroup[] = [
  { id: "main", name: "Main" },
  { id: "whales", name: "Whales" },
];

function read<T>(key: string, fallback: T): T {
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return fallback;
    const v = JSON.parse(raw) as T;
    return Array.isArray(v) && !v.length && Array.isArray(fallback) && fallback.length ? fallback : v;
  } catch {
    return fallback;
  }
}
function write(key: string, value: unknown) {
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* storage full or blocked: the in-memory list still works this visit */
  }
}

const fromRow = (r: AddressRow): WatchlistEntry => ({ id: r.id, name: r.name, address: r.address, color: r.color, groupId: r.group_id });

export function useWatchlist() {
  const [entries, setEntries] = useState<WatchlistEntry[]>([]);
  const [groups, setGroups] = useState<WatchlistGroup[]>(DEFAULT_GROUPS);
  const [user, setUser] = useState<User | null>(null);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadLocal = useCallback(() => {
    setGroups(read(GROUPS_KEY, DEFAULT_GROUPS));
    setEntries(read<WatchlistEntry[]>(ENTRIES_KEY, []));
    setReady(true);
  }, []);

  const loadRemote = useCallback(async (u: User) => {
    if (!supabase) return;
    setError(null);
    try {
      const loaded = await supabase.from("watchlist_groups").select("id,name").order("created_at", { ascending: true });
      if (loaded.error) throw loaded.error;
      let groupRows = loaded.data;
      if (!groupRows?.length) {
        const created = await supabase
          .from("watchlist_groups")
          .insert(DEFAULT_GROUPS.map((g) => ({ name: g.name, user_id: u.id })))
          .select("id,name");
        if (created.error) throw created.error;
        groupRows = created.data;
      }
      const { data: rows, error: aErr } = await supabase
        .from("watchlist_addresses")
        .select("id,name,address,color,group_id")
        .order("created_at", { ascending: false });
      if (aErr) throw aErr;
      setGroups((groupRows as GroupRow[]).map((g) => ({ id: g.id, name: g.name })));
      setEntries((rows as AddressRow[]).map(fromRow));
    } catch (e) {
      setError(e instanceof Error ? `Couldn't load your synced watchlist: ${e.message}` : "Couldn't load your synced watchlist.");
    } finally {
      setReady(true);
    }
  }, []);

  useEffect(() => {
    // Storage and the session only exist in the browser; read them after mount.
    if (!supabase) {
      const id = setTimeout(loadLocal, 0);
      return () => clearTimeout(id);
    }
    supabase.auth.getUser().then(({ data }) => {
      setUser(data.user);
      if (data.user) void loadRemote(data.user);
      else loadLocal();
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_e, session) => {
      setUser(session?.user ?? null);
      if (session?.user) void loadRemote(session.user);
      else loadLocal();
    });
    return () => sub.subscription.unsubscribe();
  }, [loadLocal, loadRemote]);

  // Signed out, this browser is the store. Only once loaded, or the first
  // empty render would overwrite what's saved.
  useEffect(() => {
    if (ready && !user) write(GROUPS_KEY, groups);
  }, [groups, ready, user]);
  useEffect(() => {
    if (ready && !user) write(ENTRIES_KEY, entries);
  }, [entries, ready, user]);

  const remote = !!(user && supabase);

  /** Save wallets into a group. Returns how many were new. Already-saved ones are skipped. */
  const add = useCallback(
    async (addresses: string[], opts: { groupId: string; name?: string; color?: string }): Promise<{ added: number; skipped: number }> => {
      setError(null);
      const known = new Set(entries.map((e) => e.address.toLowerCase()));
      const fresh = addresses.filter((a) => !known.has(a.toLowerCase()));
      if (!fresh.length) return { added: 0, skipped: addresses.length };
      const one = fresh.length === 1;
      const rows = fresh.map((address) => ({
        name: one && opts.name?.trim() ? opts.name.trim() : defaultName(address),
        address,
        color: opts.color ?? WATCHLIST_COLORS[0],
        groupId: opts.groupId,
      }));
      if (remote) {
        const { data, error: e } = await supabase!
          .from("watchlist_addresses")
          .insert(rows.map((r) => ({ name: r.name, address: r.address, color: r.color, group_id: r.groupId, user_id: user!.id })))
          .select("id,name,address,color,group_id");
        if (e || !data) {
          setError("Couldn't save to your synced watchlist.");
          return { added: 0, skipped: 0 };
        }
        setEntries((xs) => [...(data as AddressRow[]).map(fromRow), ...xs]);
      } else {
        const stamp = Date.now();
        setEntries((xs) => [...rows.map((r, i) => ({ id: `${stamp}-${i}-${r.address.slice(0, 8)}`, ...r })), ...xs]);
      }
      return { added: fresh.length, skipped: addresses.length - fresh.length };
    },
    [entries, remote, user],
  );

  const update = useCallback(
    async (id: string, patch: Partial<Pick<WatchlistEntry, "name" | "groupId" | "color">>) => {
      setError(null);
      if (remote) {
        const row: Record<string, string> = {};
        if (patch.name != null) row.name = patch.name;
        if (patch.groupId != null) row.group_id = patch.groupId;
        if (patch.color != null) row.color = patch.color;
        const { error: e } = await supabase!.from("watchlist_addresses").update(row).eq("id", id);
        if (e) return setError("Couldn't save that change.");
      }
      setEntries((xs) => xs.map((x) => (x.id === id ? { ...x, ...patch } : x)));
    },
    [remote],
  );

  const remove = useCallback(
    async (id: string) => {
      setError(null);
      if (remote) {
        const { error: e } = await supabase!.from("watchlist_addresses").delete().eq("id", id);
        if (e) return setError("Couldn't remove it from your synced watchlist.");
      }
      setEntries((xs) => xs.filter((x) => x.id !== id));
    },
    [remote],
  );

  const addGroup = useCallback(
    async (name: string): Promise<WatchlistGroup | null> => {
      const n = name.trim();
      if (!n) return null;
      setError(null);
      if (remote) {
        const { data, error: e } = await supabase!.from("watchlist_groups").insert({ name: n, user_id: user!.id }).select("id,name").single();
        if (e || !data) {
          setError("Couldn't create the group.");
          return null;
        }
        const g = { id: (data as GroupRow).id, name: (data as GroupRow).name };
        setGroups((gs) => [...gs, g]);
        return g;
      }
      const g = { id: `${Date.now()}-${n.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`, name: n };
      setGroups((gs) => [...gs, g]);
      return g;
    },
    [remote, user],
  );

  const renameGroup = useCallback(
    async (id: string, name: string) => {
      const n = name.trim();
      if (!n) return;
      if (remote) {
        const { error: e } = await supabase!.from("watchlist_groups").update({ name: n }).eq("id", id);
        if (e) return setError("Couldn't rename the group.");
      }
      setGroups((gs) => gs.map((g) => (g.id === id ? { ...g, name: n } : g)));
    },
    [remote],
  );

  /** Delete a group and the wallets in it. The last group stays. */
  const deleteGroup = useCallback(
    async (id: string) => {
      if (groups.length <= 1) return setError("Keep at least one group.");
      if (remote) {
        const a = await supabase!.from("watchlist_addresses").delete().eq("group_id", id);
        if (a.error) return setError("Couldn't remove that group's wallets.");
        const g = await supabase!.from("watchlist_groups").delete().eq("id", id);
        if (g.error) return setError("Couldn't delete the group.");
      }
      setGroups((gs) => gs.filter((g) => g.id !== id));
      setEntries((xs) => xs.filter((x) => x.groupId !== id));
    },
    [groups.length, remote],
  );

  return { entries, groups, ready, synced: !!user, error, setError, add, update, remove, addGroup, renameGroup, deleteGroup };
}

export type Watchlist = ReturnType<typeof useWatchlist>;
