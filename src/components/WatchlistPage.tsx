"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import type { User } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabase";
import {
  Search,
  X,
  Check,
  Bookmark,
  Lock,
  Plus,
  Folder,
  UserRound,
  Copy,
  TrendingUp,
} from "lucide-react";
import Link from "next/link";

/* ════════════════════════════════════════════════════════════════
   Types
   ════════════════════════════════════════════════════════════════ */

interface WatchlistEntry {
  id: string;
  name: string;
  address: string;
  color: string;
  groupId: string;
}

interface WatchlistGroup {
  id: string;
  name: string;
}

interface WatchlistGroupRow {
  id: string;
  name: string;
  user_id: string;
}

interface WatchlistAddressRow {
  id: string;
  name: string;
  address: string;
  color: string;
  group_id: string;
  user_id: string;
}

const WATCHLIST_STORAGE_KEY = "sodex-watchlist-v1";
const WATCHLIST_GROUPS_STORAGE_KEY = "sodex-watchlist-groups-v1";
const WATCHLIST_COLORS = ["#35C77F", "#60A5FA", "#F59E0B", "#F0616D", "#A78BFA", "#EDEDED"];

const DEFAULT_WATCHLIST_GROUPS: WatchlistGroup[] = [
  { id: "main", name: "Main" },
  { id: "whales", name: "Whales" },
];

function readStoredWatchlistGroups(): WatchlistGroup[] {
  if (typeof window === "undefined") return DEFAULT_WATCHLIST_GROUPS;
  try {
    const saved = window.localStorage.getItem(WATCHLIST_GROUPS_STORAGE_KEY);
    if (!saved) return DEFAULT_WATCHLIST_GROUPS;
    const parsed = JSON.parse(saved) as WatchlistGroup[];
    return parsed.length > 0 ? parsed : DEFAULT_WATCHLIST_GROUPS;
  } catch {
    return DEFAULT_WATCHLIST_GROUPS;
  }
}

function readStoredWatchlist(): WatchlistEntry[] {
  if (typeof window === "undefined") return [];
  try {
    const saved = window.localStorage.getItem(WATCHLIST_STORAGE_KEY);
    return saved ? (JSON.parse(saved) as WatchlistEntry[]) : [];
  } catch {
    return [];
  }
}

/* ════════════════════════════════════════════════════════════════
   Watchlist Page
   ════════════════════════════════════════════════════════════════ */

export function WatchlistPage() {
  const router = useRouter();
  const [watchlist, setWatchlist] = useState<WatchlistEntry[]>([]);
  const [groups, setGroups] = useState<WatchlistGroup[]>(DEFAULT_WATCHLIST_GROUPS);
  const [activeGroupId, setActiveGroupId] = useState(DEFAULT_WATCHLIST_GROUPS[0].id);
  const [entryName, setEntryName] = useState("");
  const [entryAddress, setEntryAddress] = useState("");
  const [entryColor, setEntryColor] = useState(WATCHLIST_COLORS[0]);
  const [newGroupName, setNewGroupName] = useState("");
  const [watchlistError, setWatchlistError] = useState<string | null>(null);
  const [watchlistLoading, setWatchlistLoading] = useState(false);
  const [user, setUser] = useState<User | null>(null);
  const [searchInput, setSearchInput] = useState("");
  const [searchFocused, setSearchFocused] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  const loadRemoteWatchlist = useCallback(async (currentUser: User) => {
    if (!supabase) return;
    setWatchlistLoading(true);
    setWatchlistError(null);

    try {
      let { data: groupRows, error: groupsError } = await supabase
        .from("watchlist_groups")
        .select("id,name,user_id")
        .order("created_at", { ascending: true });

      if (groupsError) throw groupsError;

      if (!groupRows || groupRows.length === 0) {
        const { data: createdGroups, error: createGroupsError } = await supabase
          .from("watchlist_groups")
          .insert(DEFAULT_WATCHLIST_GROUPS.map((group) => ({ name: group.name, user_id: currentUser.id })))
          .select("id,name,user_id");

        if (createGroupsError) throw createGroupsError;
        groupRows = createdGroups;
      }

      const remoteGroups = ((groupRows ?? []) as WatchlistGroupRow[]).map((group) => ({
        id: group.id,
        name: group.name,
      }));

      const { data: addressRows, error: addressesError } = await supabase
        .from("watchlist_addresses")
        .select("id,name,address,color,group_id,user_id")
        .order("created_at", { ascending: false });

      if (addressesError) throw addressesError;

      setGroups(remoteGroups.length > 0 ? remoteGroups : DEFAULT_WATCHLIST_GROUPS);
      setActiveGroupId((current) => (
        remoteGroups.some((group) => group.id === current) ? current : remoteGroups[0]?.id ?? DEFAULT_WATCHLIST_GROUPS[0].id
      ));
      setWatchlist(((addressRows ?? []) as WatchlistAddressRow[]).map((entry) => ({
        id: entry.id,
        name: entry.name,
        address: entry.address,
        color: entry.color,
        groupId: entry.group_id,
      })));
    } catch (error) {
      setWatchlistError(
        error instanceof Error
          ? `Could not load Supabase watchlist: ${error.message}`
          : "Could not load Supabase watchlist. Check the SQL tables and RLS policies."
      );
    } finally {
      setWatchlistLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!supabase) return;

    supabase.auth.getUser().then(({ data }) => {
      setUser(data.user);
      if (data.user) void loadRemoteWatchlist(data.user);
      if (!data.user) {
        const storedGroups = readStoredWatchlistGroups();
        setGroups(storedGroups);
        setActiveGroupId(storedGroups[0].id);
        setWatchlist(readStoredWatchlist());
      }
    });

    const { data: subscription } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
      if (session?.user) {
        void loadRemoteWatchlist(session.user);
      } else {
        setGroups(readStoredWatchlistGroups());
        setActiveGroupId(readStoredWatchlistGroups()[0].id);
        setWatchlist(readStoredWatchlist());
      }
    });

    return () => subscription.subscription.unsubscribe();
  }, [loadRemoteWatchlist]);

  useEffect(() => {
    if (supabase) return;
    const storedGroups = readStoredWatchlistGroups();
    setGroups(storedGroups);
    setActiveGroupId(storedGroups[0].id);
    setWatchlist(readStoredWatchlist());
  }, []);

  useEffect(() => {
    window.localStorage.setItem(WATCHLIST_GROUPS_STORAGE_KEY, JSON.stringify(groups));
  }, [groups]);

  useEffect(() => {
    window.localStorage.setItem(WATCHLIST_STORAGE_KEY, JSON.stringify(watchlist));
  }, [watchlist]);

  const activeEntries = watchlist.filter((entry) => entry.groupId === activeGroupId);

  const addGroup = async () => {
    const name = newGroupName.trim();
    if (!name) return;

    if (user && supabase) {
      const { data: group, error: groupError } = await supabase
        .from("watchlist_groups")
        .insert({ name, user_id: user.id })
        .select("id,name,user_id")
        .single();

      if (groupError || !group) {
        setWatchlistError("Could not save group to Supabase.");
        return;
      }

      setGroups((items) => [...items, { id: group.id, name: group.name }]);
      setActiveGroupId(group.id);
      setNewGroupName("");
      return;
    }

    const group: WatchlistGroup = {
      id: `${Date.now()}-${name.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`,
      name,
    };
    setGroups((items) => [...items, group]);
    setActiveGroupId(group.id);
    setNewGroupName("");
  };

  const deleteGroup = async (groupId: string) => {
    if (groups.length <= 1) {
      setWatchlistError("Cannot delete the last group.");
      return;
    }

    if (user && supabase) {
      const { error: addrError } = await supabase
        .from("watchlist_addresses")
        .delete()
        .eq("group_id", groupId);
      if (addrError) {
        setWatchlistError("Could not remove addresses from Supabase.");
        return;
      }
      const { error: groupError } = await supabase
        .from("watchlist_groups")
        .delete()
        .eq("id", groupId);
      if (groupError) {
        setWatchlistError("Could not delete group from Supabase.");
        return;
      }
    }

    const remaining = groups.filter((g) => g.id !== groupId);
    setGroups(remaining);
    setWatchlist((items) => items.filter((e) => e.groupId !== groupId));
    if (activeGroupId === groupId) setActiveGroupId(remaining[0].id);
  };

  const addWatchlistEntry = async () => {
    const name = entryName.trim();
    const address = entryAddress.trim() || searchInput.trim();
    if (!name || !address) {
      setWatchlistError("Add a name and address.");
      return;
    }
    if (watchlist.some((entry) => entry.address.toLowerCase() === address.toLowerCase())) {
      setWatchlistError("This address is already saved.");
      return;
    }

    if (user && supabase) {
      const { data: entry, error: entryError } = await supabase
        .from("watchlist_addresses")
        .insert({
          name,
          address,
          color: entryColor,
          group_id: activeGroupId,
          user_id: user.id,
        })
        .select("id,name,address,color,group_id,user_id")
        .single();

      if (entryError || !entry) {
        setWatchlistError("Could not save address to Supabase.");
        return;
      }

      setWatchlist((items) => [
        {
          id: entry.id,
          name: entry.name,
          address: entry.address,
          color: entry.color,
          groupId: entry.group_id,
        },
        ...items,
      ]);
      setEntryName("");
      setEntryAddress("");
      setWatchlistError(null);
      return;
    }

    setWatchlist((items) => [
      {
        id: `${Date.now()}-${address.slice(0, 8)}`,
        name,
        address,
        color: entryColor,
        groupId: activeGroupId,
      },
      ...items,
    ]);
    setEntryName("");
    setEntryAddress("");
    setWatchlistError(null);
  };

  const removeWatchlistEntry = async (id: string) => {
    if (user && supabase) {
      const { error: deleteError } = await supabase
        .from("watchlist_addresses")
        .delete()
        .eq("id", id);

      if (deleteError) {
        setWatchlistError("Could not remove address from Supabase.");
        return;
      }
    }

    setWatchlist((items) => items.filter((entry) => entry.id !== id));
  };

  const trackAddress = (addr: string) => {
    router.push(`/tracker?address=${encodeURIComponent(addr)}`);
  };

  const copyAddress = async (addr: string, id: string) => {
    try {
      await navigator.clipboard.writeText(addr);
      setCopiedId(id);
      setTimeout(() => setCopiedId(null), 1500);
    } catch {}
  };

  const handleSearch = () => {
    const addr = searchInput.trim();
    if (!addr) return;
    trackAddress(addr);
  };

  return (
    <div className="min-h-screen pt-[72px] pb-20" style={{ background: "var(--bg)" }}>
      <div className="max-w-[820px] mx-auto px-5 sm:px-8">

        {/* ── Header ── */}
        <div className="flex flex-col items-center text-center mb-8 pt-8">
          <div
            className="flex items-center justify-center mb-4"
            style={{
              width: 48, height: 48, borderRadius: 12,
              background: "var(--accent-dim)",
            }}
          >
            <Bookmark size={22} style={{ color: "var(--accent)" }} />
          </div>
          <h1 className="text-[28px] sm:text-[36px] font-bold leading-none tracking-tight mb-3"
            style={{ color: "var(--text)", letterSpacing: "-0.02em" }}>
            Watchlist
          </h1>
          <p className="text-sm max-w-md" style={{ color: "var(--text-muted)" }}>
            Save and organize wallet addresses to track. Click track to view their full portfolio, or copy an address to use elsewhere.
          </p>
        </div>

        {/* ── Search bar ── */}
        <div className="mb-6">
          <div className="relative flex items-center" style={{
            border: `1px solid ${searchFocused ? "var(--accent)" : "var(--border)"}`,
            background: "var(--bg-surface)",
            boxShadow: searchFocused ? "0 0 0 1px var(--accent), 0 0 40px var(--accent-dim)" : "none",
            transition: "border-color 0.15s, box-shadow 0.15s",
            borderRadius: 10,
          }}>
            <Search size={16} className="absolute left-4 pointer-events-none" style={{ color: "var(--text-faint)" }} />
            <input
              ref={searchRef}
              type="text"
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              onFocus={() => setSearchFocused(true)}
              onBlur={() => setSearchFocused(false)}
              onKeyDown={(e) => e.key === "Enter" && handleSearch()}
              placeholder="Paste a wallet address to track…"
              className="w-full bg-transparent outline-none mono text-sm py-3.5 pl-11 pr-24"
              style={{ color: "var(--text)", caretColor: "var(--accent)" }}
              spellCheck={false}
              autoComplete="off"
            />
            {searchInput && (
              <button onClick={() => setSearchInput("")}
                className="absolute right-[88px] opacity-50 hover:opacity-100 transition-opacity"
                style={{ color: "var(--text-faint)" }}>
                <X size={14} />
              </button>
            )}
            <button
              onClick={handleSearch}
              disabled={!searchInput.trim()}
              className="absolute right-2 px-4 py-2 tag font-bold transition-opacity disabled:opacity-40"
              style={{ background: "var(--accent)", color: "var(--accent-fg)", borderRadius: 6 }}
            >
              TRACK
            </button>
          </div>
        </div>

        {/* ── Watchlist card ── */}
        <div
          className="fade-up text-left"
          style={{
            border: "1px solid var(--border)",
            background: "var(--bg-surface)",
            borderRadius: "var(--r-card)",
            boxShadow: "0 2px 12px rgba(0,0,0,0.04)",
          }}
        >
          {/* Header */}
          <div className="p-4 sm:p-6" style={{ borderBottom: "1px solid var(--border-subtle)" }}>
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-2.5 sm:gap-3">
                <div
                  className="flex items-center justify-center shrink-0"
                  style={{
                    width: 30, height: 30, borderRadius: "var(--r-sm)",
                    background: "var(--accent-dim)",
                  }}
                >
                  <Bookmark size={14} style={{ color: "var(--accent)" }} />
                </div>
                <div>
                  <h2 className="text-base sm:text-xl font-bold leading-tight" style={{ color: "var(--text)" }}>
                    Saved Addresses
                  </h2>
                  <p className="text-[11px] sm:text-sm" style={{ color: "var(--text-muted)" }}>
                    {watchlist.length} saved · {groups.length} groups
                  </p>
                </div>
              </div>
              <Link
                href="/account"
                className="flex items-center gap-1.5 px-2.5 py-1.5 sm:px-3 sm:py-2 tag font-bold transition-colors"
                style={{
                  border: "1px solid var(--border)",
                  color: "var(--text-muted)",
                  borderRadius: "var(--r-sm)",
                  background: "var(--bg)",
                }}
                onMouseEnter={(e) => { e.currentTarget.style.borderColor = "var(--accent)"; e.currentTarget.style.color = "var(--accent)"; }}
                onMouseLeave={(e) => { e.currentTarget.style.borderColor = "var(--border)"; e.currentTarget.style.color = "var(--text-muted)"; }}
              >
                {user ? <UserRound size={12} /> : <Lock size={12} />}
                <span className="hidden sm:inline">{user ? "ACCOUNT" : "SIGN IN"}</span>
              </Link>
            </div>

            {/* Sync status */}
            <div className="flex items-center gap-2 mt-2.5 sm:mt-3">
              <span
                className="w-1.5 h-1.5 rounded-full shrink-0"
                style={{ background: user ? "var(--green)" : "var(--text-faint)" }}
              />
              <p className="text-[11px] sm:text-xs truncate" style={{ color: watchlistError ? "var(--red)" : "var(--text-faint)" }}>
                {watchlistLoading
                  ? "Loading saved watchlist..."
                  : watchlistError
                  ? watchlistError
                  : user
                  ? `Synced as ${user.email}`
                  : "Local only — sign in to sync across devices"}
              </p>
            </div>
          </div>

          {/* Nested tree: groups with addresses indented below */}
          <div className="p-4 sm:p-6">
            {groups.map((group) => {
              const entries = watchlist.filter((entry) => entry.groupId === group.id);
              const isActive = group.id === activeGroupId;
              return (
                <div key={group.id} className="mb-3 sm:mb-4 last:mb-0">
                  {/* Group header row */}
                  <div
                    className="flex items-center gap-2 px-2.5 sm:px-3 py-2 sm:py-2.5 transition-colors cursor-pointer"
                    style={{
                      borderRadius: "var(--r-sm)",
                      background: isActive ? "var(--accent-dim)" : "var(--bg)",
                      border: "1px solid var(--border-subtle)",
                    }}
                    onClick={() => setActiveGroupId(group.id)}
                  >
                    <span
                      className="flex items-center justify-center shrink-0"
                      style={{ width: 18, height: 18 }}
                    >
                      <Folder size={12} style={{ color: isActive ? "var(--accent)" : "var(--text-faint)" }} />
                    </span>
                    <span className="tag font-bold text-xs sm:text-sm" style={{ color: "var(--text)" }}>
                      {group.name}
                    </span>
                    <span
                      className="mono text-[9px] sm:text-[10px] font-bold px-1.5 py-0.5"
                      style={{
                        color: "var(--text-faint)",
                        border: "1px solid var(--border-subtle)",
                        borderRadius: "var(--r-sm)",
                      }}
                    >
                      {entries.length}
                    </span>
                    <div className="flex-1" />
                    {groups.length > 1 && (
                      <button
                        onClick={(e) => { e.stopPropagation(); void deleteGroup(group.id); }}
                        className="flex items-center justify-center w-5 h-5 transition-colors"
                        style={{ color: "var(--text-faint)", borderRadius: "50%" }}
                        onMouseEnter={(e) => { e.currentTarget.style.color = "var(--red)"; e.currentTarget.style.background = "rgba(204,46,46,0.08)"; }}
                        onMouseLeave={(e) => { e.currentTarget.style.color = "var(--text-faint)"; e.currentTarget.style.background = "transparent"; }}
                        title={`Delete ${group.name}`}
                      >
                        <X size={11} />
                      </button>
                    )}
                  </div>

                  {/* Addresses indented under group */}
                  {entries.length > 0 && (
                    <div className="ml-3 sm:ml-4 mt-1 sm:mt-1.5 border-l" style={{ borderColor: "var(--border-subtle)" }}>
                      {entries.map((entry) => (
                        <div
                          key={entry.id}
                          className="flex items-center gap-2 sm:gap-3 pl-3 sm:pl-4 pr-2 py-1.5 sm:py-2 transition-colors"
                          onMouseEnter={(e) => { e.currentTarget.style.background = "var(--bg)"; }}
                          onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; }}
                        >
                          <span
                            className="w-1.5 h-1.5 rounded-full shrink-0"
                            style={{ background: entry.color }}
                          />
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-1.5">
                              <span className="font-bold text-xs sm:text-sm truncate" style={{ color: "var(--text)" }}>{entry.name}</span>
                            </div>
                            <span className="mono text-[9px] sm:text-[10px] break-all" style={{ color: "var(--text-faint)" }}>
                              {entry.address.slice(0, 10)}…{entry.address.slice(-6)}
                            </span>
                          </div>
                          <div className="flex items-center gap-1 sm:gap-1.5 shrink-0">
                            <button
                              onClick={() => copyAddress(entry.address, entry.id)}
                              className="flex items-center justify-center w-7 h-7 sm:w-8 sm:h-8 transition-colors"
                              style={{
                                color: copiedId === entry.id ? "var(--green)" : "var(--text-faint)",
                                borderRadius: "var(--r-sm)",
                                border: "1px solid var(--border)",
                              }}
                              onMouseEnter={(e) => { if (copiedId !== entry.id) { e.currentTarget.style.color = "var(--text)"; e.currentTarget.style.borderColor = "var(--text-muted)"; } }}
                              onMouseLeave={(e) => { if (copiedId !== entry.id) { e.currentTarget.style.color = "var(--text-faint)"; e.currentTarget.style.borderColor = "var(--border)"; } }}
                              title="Copy address"
                            >
                              {copiedId === entry.id ? <Check size={12} /> : <Copy size={12} />}
                            </button>
                            <button
                              onClick={() => trackAddress(entry.address)}
                              className="px-2 sm:px-2.5 py-1 tag font-bold text-[9px] sm:text-[10px] transition-colors"
                              style={{
                                border: "1px solid var(--border)",
                                color: "var(--text-muted)",
                                borderRadius: "var(--r-sm)",
                              }}
                              onMouseEnter={(e) => { e.currentTarget.style.background = "var(--accent)"; e.currentTarget.style.color = "var(--accent-fg)"; e.currentTarget.style.borderColor = "var(--accent)"; }}
                              onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; e.currentTarget.style.color = "var(--text-muted)"; e.currentTarget.style.borderColor = "var(--border)"; }}
                            >
                              TRACK
                            </button>
                            <button
                              onClick={() => removeWatchlistEntry(entry.id)}
                              className="flex items-center justify-center w-5 h-5 sm:w-6 sm:h-6 transition-colors"
                              style={{ color: "var(--text-faint)", borderRadius: "var(--r-sm)" }}
                              onMouseEnter={(e) => { e.currentTarget.style.color = "var(--red)"; e.currentTarget.style.background = "rgba(204,46,46,0.08)"; }}
                              onMouseLeave={(e) => { e.currentTarget.style.color = "var(--text-faint)"; e.currentTarget.style.background = "transparent"; }}
                              title="Remove"
                            >
                              <X size={11} />
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}

                  {entries.length === 0 && (
                    <div className="ml-3 sm:ml-4 mt-1 sm:mt-1.5 pl-3 sm:pl-4 py-1.5 sm:py-2 border-l" style={{ borderColor: "var(--border-subtle)" }}>
                      <span className="text-[11px] sm:text-xs" style={{ color: "var(--text-faint)" }}>No addresses yet</span>
                    </div>
                  )}
                </div>
              );
            })}

            {/* Add group inline */}
            <div className="flex items-center gap-2 mt-2.5 sm:mt-3 pt-2.5 sm:pt-3" style={{ borderTop: "1px solid var(--border-subtle)" }}>
              <input
                value={newGroupName}
                onChange={(e) => setNewGroupName(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") void addGroup(); }}
                placeholder="New group name…"
                className="flex-1 bg-transparent outline-none text-xs sm:text-sm px-3 py-2"
                style={{
                  border: "1px solid var(--border)",
                  color: "var(--text)",
                  borderRadius: "var(--r-sm)",
                  background: "var(--bg)",
                }}
              />
              <button
                onClick={() => void addGroup()}
                className="flex items-center justify-center gap-1.5 px-3 py-2 tag font-bold transition-colors"
                style={{
                  border: "1px solid var(--border)",
                  color: "var(--text-muted)",
                  borderRadius: "var(--r-sm)",
                  background: "var(--bg)",
                }}
                onMouseEnter={(e) => { e.currentTarget.style.borderColor = "var(--accent)"; e.currentTarget.style.color = "var(--accent)"; }}
                onMouseLeave={(e) => { e.currentTarget.style.borderColor = "var(--border)"; e.currentTarget.style.color = "var(--text-muted)"; }}
              >
                <Plus size={12} />
                GROUP
              </button>
            </div>

            {/* Add address form — adds to active group */}
            <div className="mt-2.5 sm:mt-3 pt-2.5 sm:pt-3" style={{ borderTop: "1px solid var(--border-subtle)" }}>
              <div className="flex items-center gap-2 mb-2">
                <span className="tag text-[10px] sm:text-xs" style={{ color: "var(--text-faint)" }}>
                  ADD TO: <span style={{ color: "var(--accent)" }}>{groups.find((g) => g.id === activeGroupId)?.name ?? "—"}</span>
                </span>
              </div>
              <div className="flex flex-col sm:flex-row gap-2">
                <input
                  value={entryName}
                  onChange={(e) => setEntryName(e.target.value)}
                  placeholder="Name (e.g. My Whale)"
                  className="flex-1 bg-transparent outline-none text-xs sm:text-sm px-3 py-2 sm:py-2.5"
                  style={{
                    border: "1px solid var(--border)",
                    color: "var(--text)",
                    borderRadius: "var(--r-sm)",
                    background: "var(--bg)",
                  }}
                />
                <input
                  value={entryAddress}
                  onChange={(e) => setEntryAddress(e.target.value)}
                  placeholder={searchInput.trim() ? "Use typed address or paste another" : "0x… wallet address"}
                  className="flex-1 bg-transparent outline-none mono text-xs sm:text-sm px-3 py-2 sm:py-2.5"
                  style={{
                    border: "1px solid var(--border)",
                    color: "var(--text)",
                    borderRadius: "var(--r-sm)",
                    background: "var(--bg)",
                  }}
                />
                <div className="flex items-center gap-1.5 px-2 py-2 sm:py-2.5" style={{ border: "1px solid var(--border)", borderRadius: "var(--r-sm)", background: "var(--bg)" }}>
                  {WATCHLIST_COLORS.map((color) => (
                    <button
                      key={color}
                      onClick={() => setEntryColor(color)}
                      aria-label={`Pick ${color}`}
                      className="w-4 h-4 transition-transform"
                      style={{
                        background: color,
                        borderRadius: "50%",
                        border: entryColor === color ? "2px solid var(--text)" : "2px solid transparent",
                        transform: entryColor === color ? "scale(1.15)" : "scale(1)",
                        boxShadow: entryColor === color ? `0 0 0 1px ${color}` : "none",
                      }}
                    />
                  ))}
                </div>
                <button
                  onClick={addWatchlistEntry}
                  className="flex items-center justify-center gap-2 px-4 py-2 sm:py-2.5 tag font-bold transition-transform"
                  style={{
                    background: "var(--accent)",
                    color: "var(--accent-fg)",
                    borderRadius: "var(--r-sm)",
                  }}
                >
                  <Plus size={14} />
                  ADD
                </button>
              </div>
              {watchlistError && (
                <span className="mono text-[11px] sm:text-xs mt-2 block" style={{ color: "var(--red)" }}>{watchlistError}</span>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
