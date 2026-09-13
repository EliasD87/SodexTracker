"use client";

import { useEffect, useMemo, useRef, useState, useCallback } from "react";
import type { User } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabase";
import {
  X,
  Check,
  Bookmark,
  Lock,
  Plus,
  Folder,
  UserRound,
  Copy,
  Pencil,
  ClipboardPaste,
  ChevronDown,
  FolderOpen,
  Search,
  AlertTriangle,
} from "lucide-react";
import Link from "next/link";
import { parseAddresses, shortAddress, defaultName } from "@/lib/watchlistAddress";

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
const WATCHLIST_COLLAPSED_KEY = "sodex-watchlist-collapsed-v1";
const WATCHLIST_COLORS = ["#35C77F", "#60A5FA", "#F59E0B", "#F0616D", "#A78BFA", "#EDEDED"];

/** Show the filter box only once a list is long enough to need one. */
const FILTER_THRESHOLD = 6;

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

function readStoredCollapsed(): string[] {
  if (typeof window === "undefined") return [];
  try {
    const saved = window.localStorage.getItem(WATCHLIST_COLLAPSED_KEY);
    return saved ? (JSON.parse(saved) as string[]) : [];
  } catch {
    return [];
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

/** The picked colour, softened — used for row washes and glows. */
function tint(hex: string, alpha: number): string {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${alpha})`;
}

/** Hex → HSL, so a picked colour can spawn a harmonised palette. */
function toHsl(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1), 16);
  const r = ((n >> 16) & 255) / 255, g = ((n >> 8) & 255) / 255, b = (n & 255) / 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  const l = (max + min) / 2;
  if (max === min) return [0, 0, l * 100];
  const d = max - min;
  const sat = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  const h =
    max === r ? ((g - b) / d + (g < b ? 6 : 0)) : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return [h * 60, sat * 100, l * 100];
}

const hsl = (h: number, s: number, l: number) => `hsl(${((h % 360) + 360) % 360} ${s}% ${l}%)`;

/** A stable 32-bit hash of the address, so a wallet always draws the same mark. */
function hashAddress(address: string): number {
  let h = 2166136261;
  for (let i = 0; i < address.length; i++) {
    h ^= address.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/**
 * A generative sigil for a wallet — a gradient ground with two shapes whose
 * angle, position and size all derive from the address itself.
 *
 * The point is recognition rather than decoration: the same wallet always
 * draws the same mark, so you come to know it by shape the way you'd know a
 * face, and the picked colour sets the palette it's built from.
 */
function Sigil({ address, color, size = 34 }: { address: string; color: string; size?: number }) {
  const h = hashAddress(address);
  const [baseH, baseS, baseL] = toHsl(color);

  // Each nibble of the hash drives one property of the drawing.
  const angle = (h & 0xff) / 255 * 360;
  /* Kept narrow on purpose: a wider spread wandered so far round the wheel
     that an amber pick rendered pink-to-green and the chosen colour vanished.
     Depth comes from lightness instead, which keeps the family intact. */
  const hueShift = 8 + ((h >> 8) & 0x0f);
  const cx = 22 + (((h >> 13) & 0x1f) / 31) * 56;
  const cy = 20 + (((h >> 18) & 0x1f) / 31) * 60;
  const r = 20 + (((h >> 23) & 0x0f) / 15) * 18;
  const rectRot = (((h >> 27) & 0x1f) / 31) * 180;

  const s = Math.max(baseS, 55);
  const gradId = `sig-${h.toString(36)}`;

  return (
    <span
      aria-hidden="true"
      className="shrink-0 overflow-hidden"
      style={{
        width: size,
        height: size,
        borderRadius: 10,
        boxShadow: `0 0 0 1px ${tint(color, 0.45)}, 0 2px 8px ${tint(color, 0.28)}`,
      }}
    >
      <svg viewBox="0 0 100 100" width={size} height={size} style={{ display: "block" }}>
        <defs>
          <linearGradient id={gradId} gradientTransform={`rotate(${angle} 0.5 0.5)`}>
            <stop offset="0%" stopColor={hsl(baseH - hueShift, s, Math.min(baseL + 20, 74))} />
            <stop offset="100%" stopColor={hsl(baseH + hueShift, s, Math.max(baseL - 18, 22))} />
          </linearGradient>
        </defs>
        <rect width="100" height="100" fill={`url(#${gradId})`} />
        <circle cx={cx} cy={cy} r={r} fill="#fff" opacity={0.26} />
        <rect
          x={18}
          y={54}
          width={64}
          height={18}
          rx={9}
          fill="#000"
          opacity={0.22}
          transform={`rotate(${rectRot} 50 63)`}
        />
      </svg>
    </span>
  );
}

/* ════════════════════════════════════════════════════════════════
   Watchlist Page
   ════════════════════════════════════════════════════════════════ */

export function WatchlistPanel({ onTrack }: { onTrack: (address: string) => void }) {
  const [watchlist, setWatchlist] = useState<WatchlistEntry[]>([]);
  const [groups, setGroups] = useState<WatchlistGroup[]>(DEFAULT_WATCHLIST_GROUPS);
  /** The group new addresses land in. */
  const [targetGroupId, setTargetGroupId] = useState(DEFAULT_WATCHLIST_GROUPS[0].id);

  /* One paste field for everything — no hidden coupling between two inputs. */
  const [pasteInput, setPasteInput] = useState("");
  const [entryName, setEntryName] = useState("");
  const [entryColor, setEntryColor] = useState(WATCHLIST_COLORS[0]);
  const pasteRef = useRef<HTMLTextAreaElement>(null);
  const addBoxRef = useRef<HTMLDivElement>(null);

  const [newGroupName, setNewGroupName] = useState("");
  const [renamingGroupId, setRenamingGroupId] = useState<string | null>(null);
  const [renamingEntryId, setRenamingEntryId] = useState<string | null>(null);
  const [renameDraft, setRenameDraft] = useState("");
  const [confirmDeleteGroupId, setConfirmDeleteGroupId] = useState<string | null>(null);
  const [filter, setFilter] = useState("");

  const [watchlistError, setWatchlistError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [watchlistLoading, setWatchlistLoading] = useState(false);
  const [user, setUser] = useState<User | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  /* The persist effects below run on mount with empty state. Without this
     gate they overwrite storage before the initial read has populated it —
     which silently wiped a signed-out watchlist on every refresh. */
  const [hydrated, setHydrated] = useState(false);

  /* Which groups are folded shut. Persisted so a tidied list stays tidy. */
  const [collapsed, setCollapsed] = useState<string[]>([]);
  const [groupMenuOpen, setGroupMenuOpen] = useState(false);
  const [creatingGroup, setCreatingGroup] = useState(false);
  const groupMenuRef = useRef<HTMLDivElement>(null);

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
      setTargetGroupId((current) => (
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
        setTargetGroupId(storedGroups[0].id);
        setWatchlist(readStoredWatchlist());
        setCollapsed(readStoredCollapsed());
      }
      setHydrated(true);
    });

    const { data: subscription } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
      if (session?.user) {
        void loadRemoteWatchlist(session.user);
      } else {
        const storedGroups = readStoredWatchlistGroups();
        setGroups(storedGroups);
        setTargetGroupId(storedGroups[0].id);
        setWatchlist(readStoredWatchlist());
        setCollapsed(readStoredCollapsed());
      }
      setHydrated(true);
    });

    return () => subscription.subscription.unsubscribe();
  }, [loadRemoteWatchlist]);

  useEffect(() => {
    if (supabase) return;
    const storedGroups = readStoredWatchlistGroups();
    setGroups(storedGroups);
    setTargetGroupId(storedGroups[0].id);
    setWatchlist(readStoredWatchlist());
    setCollapsed(readStoredCollapsed());
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    window.localStorage.setItem(WATCHLIST_GROUPS_STORAGE_KEY, JSON.stringify(groups));
  }, [groups, hydrated]);

  useEffect(() => {
    if (!hydrated) return;
    window.localStorage.setItem(WATCHLIST_STORAGE_KEY, JSON.stringify(watchlist));
  }, [watchlist, hydrated]);

  useEffect(() => {
    if (!hydrated) return;
    window.localStorage.setItem(WATCHLIST_COLLAPSED_KEY, JSON.stringify(collapsed));
  }, [collapsed, hydrated]);

  /* Close the group menu on an outside click or Escape. */
  useEffect(() => {
    if (!groupMenuOpen) return;
    const close = () => { setGroupMenuOpen(false); setCreatingGroup(false); };
    const onDown = (e: MouseEvent) => {
      if (groupMenuRef.current && !groupMenuRef.current.contains(e.target as Node)) close();
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") close(); };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [groupMenuOpen]);

  /* ── What the paste box currently holds ── */
  const parsed = useMemo(() => parseAddresses(pasteInput), [pasteInput]);
  const alreadySaved = useMemo(() => {
    const known = new Set(watchlist.map((e) => e.address.toLowerCase()));
    return parsed.valid.filter((a) => known.has(a.toLowerCase()));
  }, [parsed.valid, watchlist]);
  const toAdd = useMemo(
    () => parsed.valid.filter((a) => !alreadySaved.some((s) => s.toLowerCase() === a.toLowerCase())),
    [parsed.valid, alreadySaved]
  );

  const flash = (message: string) => {
    setNotice(message);
    setTimeout(() => setNotice(null), 2600);
  };

  /* ════════════════════ Groups ════════════════════ */

  const addGroup = async () => {
    const name = newGroupName.trim();
    if (!name) return;
    setWatchlistError(null);

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
      setTargetGroupId(group.id);
      setNewGroupName("");
      setCreatingGroup(false);
      setGroupMenuOpen(false);
      return;
    }

    const group: WatchlistGroup = {
      id: `${Date.now()}-${name.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`,
      name,
    };
    setGroups((items) => [...items, group]);
    setTargetGroupId(group.id);
    setNewGroupName("");
    setCreatingGroup(false);
    setGroupMenuOpen(false);
  };

  const renameGroup = async (groupId: string) => {
    const name = renameDraft.trim();
    setRenamingGroupId(null);
    if (!name) return;

    if (user && supabase) {
      const { error } = await supabase.from("watchlist_groups").update({ name }).eq("id", groupId);
      if (error) {
        setWatchlistError("Could not rename group in Supabase.");
        return;
      }
    }
    setGroups((items) => items.map((g) => (g.id === groupId ? { ...g, name } : g)));
  };

  const deleteGroup = async (groupId: string) => {
    setConfirmDeleteGroupId(null);
    if (groups.length <= 1) {
      setWatchlistError("Cannot delete the last group.");
      return;
    }

    if (user && supabase) {
      const { error: addrError } = await supabase.from("watchlist_addresses").delete().eq("group_id", groupId);
      if (addrError) {
        setWatchlistError("Could not remove addresses from Supabase.");
        return;
      }
      const { error: groupError } = await supabase.from("watchlist_groups").delete().eq("id", groupId);
      if (groupError) {
        setWatchlistError("Could not delete group from Supabase.");
        return;
      }
    }

    const remaining = groups.filter((g) => g.id !== groupId);
    setGroups(remaining);
    setWatchlist((items) => items.filter((e) => e.groupId !== groupId));
    if (targetGroupId === groupId) setTargetGroupId(remaining[0].id);
  };

  /* ════════════════════ Addresses ════════════════════ */

  const addAddresses = async () => {
    setWatchlistError(null);

    if (toAdd.length === 0) {
      if (parsed.valid.length > 0) setWatchlistError("Already in your watchlist.");
      else if (parsed.invalid.length > 0) setWatchlistError("That doesn't look like a wallet address.");
      else setWatchlistError("Paste a wallet address to save.");
      return;
    }

    // A name only makes sense for a single address; a batch gets derived names.
    const single = toAdd.length === 1;
    const rows = toAdd.map((address) => ({
      name: single && entryName.trim() ? entryName.trim() : defaultName(address),
      address,
      color: entryColor,
      groupId: targetGroupId,
    }));

    if (user && supabase) {
      const { data, error } = await supabase
        .from("watchlist_addresses")
        .insert(rows.map((r) => ({
          name: r.name,
          address: r.address,
          color: r.color,
          group_id: r.groupId,
          user_id: user.id,
        })))
        .select("id,name,address,color,group_id,user_id");

      if (error || !data) {
        setWatchlistError("Could not save to Supabase.");
        return;
      }
      setWatchlist((items) => [
        ...(data as WatchlistAddressRow[]).map((e) => ({
          id: e.id,
          name: e.name,
          address: e.address,
          color: e.color,
          groupId: e.group_id,
        })),
        ...items,
      ]);
    } else {
      setWatchlist((items) => [
        ...rows.map((r, i) => ({ id: `${Date.now()}-${i}-${r.address.slice(0, 8)}`, ...r })),
        ...items,
      ]);
    }

    const groupName = groups.find((g) => g.id === targetGroupId)?.name ?? "group";
    flash(
      `${toAdd.length} address${toAdd.length === 1 ? "" : "es"} added to ${groupName}` +
        (alreadySaved.length ? ` · ${alreadySaved.length} already saved, skipped` : "")
    );
    setPasteInput("");
    setEntryName("");
  };

  const pasteFromClipboard = async () => {
    try {
      const text = await navigator.clipboard.readText();
      if (!text.trim()) return;
      setPasteInput((prev) => (prev.trim() ? `${prev.trim()}\n${text.trim()}` : text.trim()));
      pasteRef.current?.focus();
    } catch {
      setWatchlistError("Clipboard unavailable — paste with Ctrl/Cmd+V instead.");
    }
  };

  const renameEntry = async (id: string) => {
    const name = renameDraft.trim();
    setRenamingEntryId(null);
    if (!name) return;

    if (user && supabase) {
      const { error } = await supabase.from("watchlist_addresses").update({ name }).eq("id", id);
      if (error) {
        setWatchlistError("Could not rename in Supabase.");
        return;
      }
    }
    setWatchlist((items) => items.map((e) => (e.id === id ? { ...e, name } : e)));
  };


  const removeWatchlistEntry = async (id: string) => {
    if (user && supabase) {
      const { error } = await supabase.from("watchlist_addresses").delete().eq("id", id);
      if (error) {
        setWatchlistError("Could not remove address from Supabase.");
        return;
      }
    }
    setWatchlist((items) => items.filter((entry) => entry.id !== id));
  };

  const trackAddress = (addr: string) => onTrack(addr);

  const copyAddress = async (addr: string, id: string) => {
    try {
      await navigator.clipboard.writeText(addr);
      setCopiedId(id);
      setTimeout(() => setCopiedId(null), 1500);
    } catch {}
  };

  /** Aim the add box at a group and bring it to the eye — no scrolling hunt. */
  const addInto = (groupId: string) => {
    setTargetGroupId(groupId);
    addBoxRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
    window.setTimeout(() => pasteRef.current?.focus(), 180);
  };

  const toggleCollapse = (groupId: string) =>
    setCollapsed((ids) => (ids.includes(groupId) ? ids.filter((i) => i !== groupId) : [...ids, groupId]));

  const startRenameGroup = (g: WatchlistGroup) => {
    setRenameDraft(g.name);
    setRenamingEntryId(null);
    setRenamingGroupId(g.id);
  };
  const startRenameEntry = (e: WatchlistEntry) => {
    setRenameDraft(e.name);
    setRenamingGroupId(null);
    setRenamingEntryId(e.id);
  };

  const q = filter.trim().toLowerCase();
  const matches = (e: WatchlistEntry) =>
    !q || e.name.toLowerCase().includes(q) || e.address.toLowerCase().includes(q);

  const addLabel =
    toAdd.length > 1 ? `ADD ${toAdd.length}` : toAdd.length === 1 ? "ADD" : "ADD";

  return (
    <div className="w-full">
        {/* ── Add box: the single place addresses come in ── */}
        <div
          ref={addBoxRef}
          className="mb-5"
          style={{
            border: "1px solid var(--border)",
            background: "var(--bg-surface)",
            borderRadius: "var(--r-card)",
          }}
        >
          <div className="p-4 sm:p-5">
            <div className="relative">
              <textarea
                ref={pasteRef}
                value={pasteInput}
                onChange={(e) => setPasteInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) void addAddresses();
                }}
                rows={pasteInput.includes("\n") ? 4 : 2}
                placeholder={"Paste a wallet address — or several, one per line\n0x…"}
                className="w-full bg-transparent outline-none mono text-[11px] sm:text-xs p-3 pr-24 resize-y"
                style={{
                  border: "1px solid var(--border)",
                  borderRadius: "var(--r-sm)",
                  background: "var(--bg)",
                  color: "var(--text)",
                  caretColor: "var(--accent)",
                  minHeight: 72,
                }}
                spellCheck={false}
                autoComplete="off"
              />
              <div className="absolute top-2 right-2 flex items-center gap-1.5">
                {pasteInput && (
                  <button
                    onClick={() => setPasteInput("")}
                    className="flex items-center justify-center w-7 h-7 transition-colors"
                    style={{ color: "var(--text-faint)", borderRadius: "var(--r-sm)" }}
                    title="Clear"
                  >
                    <X size={13} />
                  </button>
                )}
                <button
                  onClick={() => void pasteFromClipboard()}
                  className="flex items-center gap-1.5 px-2.5 h-7 tag font-bold transition-colors"
                  style={{
                    border: "1px solid var(--border)",
                    color: "var(--text-muted)",
                    borderRadius: "var(--r-sm)",
                    background: "var(--bg-surface)",
                  }}
                  onMouseEnter={(e) => { e.currentTarget.style.borderColor = "var(--accent)"; e.currentTarget.style.color = "var(--accent)"; }}
                  onMouseLeave={(e) => { e.currentTarget.style.borderColor = "var(--border)"; e.currentTarget.style.color = "var(--text-muted)"; }}
                  title="Paste from clipboard"
                >
                  <ClipboardPaste size={12} />
                  PASTE
                </button>
              </div>
            </div>

            {/* Live read-out of what was pasted */}
            {pasteInput.trim() && (
              <div className="flex items-center flex-wrap gap-x-3 gap-y-1 mt-2">
                <span className="tag" style={{ color: toAdd.length ? "var(--green)" : "var(--text-faint)" }}>
                  {toAdd.length} ready
                </span>
                {alreadySaved.length > 0 && (
                  <span className="tag" style={{ color: "var(--text-faint)" }}>
                    {alreadySaved.length} already saved
                  </span>
                )}
                {parsed.invalid.length > 0 && (
                  <span className="tag flex items-center gap-1" style={{ color: "var(--red)" }}>
                    <AlertTriangle size={10} />
                    {parsed.invalid.length} not an address
                  </span>
                )}
              </div>
            )}

            {/* Destination + options */}
            <div className="flex flex-col sm:flex-row sm:items-center gap-2 mt-3">
              <div className="flex items-center gap-2 shrink-0">
                <span className="tag" style={{ color: "var(--text-faint)" }}>INTO</span>
                <div className="relative" ref={groupMenuRef}>
                  <button
                    onClick={() => { setGroupMenuOpen((v) => !v); setCreatingGroup(false); }}
                    aria-haspopup="menu"
                    aria-expanded={groupMenuOpen}
                    className="flex items-center gap-2 px-2.5 py-2 text-xs sm:text-sm transition-colors"
                    style={{
                      border: `1px solid ${groupMenuOpen ? "var(--accent)" : "var(--border)"}`,
                      borderRadius: "var(--r-sm)",
                      background: "var(--bg)",
                      color: "var(--text)",
                      minWidth: 132,
                    }}
                  >
                    <Folder size={12} style={{ color: "var(--text-faint)" }} />
                    <span className="truncate flex-1 text-left">
                      {groups.find((g) => g.id === targetGroupId)?.name ?? "—"}
                    </span>
                    <ChevronDown
                      size={12}
                      style={{
                        color: "var(--text-faint)",
                        transition: "transform 0.18s",
                        transform: groupMenuOpen ? "rotate(180deg)" : "none",
                      }}
                    />
                  </button>

                  {groupMenuOpen && (
                    <div
                      role="menu"
                      className="absolute left-0 top-full mt-1.5 z-50 py-1.5"
                      style={{
                        minWidth: 210,
                        background: "var(--bg-surface)",
                        border: "1px solid var(--border)",
                        borderRadius: "var(--r-md)",
                        boxShadow: "0 12px 32px rgba(0,0,0,0.22)",
                      }}
                    >
                      {groups.map((g) => {
                        const count = watchlist.filter((e) => e.groupId === g.id).length;
                        const active = g.id === targetGroupId;
                        return (
                          <button
                            key={g.id}
                            role="menuitem"
                            onClick={() => { setTargetGroupId(g.id); setGroupMenuOpen(false); }}
                            className="flex items-center gap-2 w-full text-left px-3 py-2 text-xs sm:text-sm transition-colors"
                            style={{ color: active ? "var(--accent)" : "var(--text)" }}
                            onMouseEnter={(e) => { e.currentTarget.style.background = "var(--bg-elevated)"; }}
                            onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; }}
                          >
                            <Folder size={12} style={{ color: active ? "var(--accent)" : "var(--text-faint)" }} />
                            <span className="truncate flex-1">{g.name}</span>
                            <span className="mono text-[10px]" style={{ color: "var(--text-faint)" }}>{count}</span>
                            {active && <Check size={12} />}
                          </button>
                        );
                      })}

                      <div className="my-1.5" style={{ borderTop: "1px solid var(--border-subtle)" }} />

                      {creatingGroup ? (
                        <div className="px-2 pb-1">
                          <input
                            autoFocus
                            value={newGroupName}
                            onChange={(e) => setNewGroupName(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === "Enter") void addGroup();
                              if (e.key === "Escape") { setCreatingGroup(false); setNewGroupName(""); }
                            }}
                            placeholder="Group name…"
                            className="w-full bg-transparent outline-none text-xs sm:text-sm px-2.5 py-2"
                            style={{
                              border: "1px solid var(--accent)",
                              borderRadius: "var(--r-sm)",
                              background: "var(--bg)",
                              color: "var(--text)",
                            }}
                          />
                        </div>
                      ) : (
                        <button
                          role="menuitem"
                          onClick={() => { setCreatingGroup(true); setNewGroupName(""); }}
                          className="flex items-center gap-2 w-full text-left px-3 py-2 text-xs sm:text-sm transition-colors"
                          style={{ color: "var(--text-muted)" }}
                          onMouseEnter={(e) => { e.currentTarget.style.background = "var(--bg-elevated)"; e.currentTarget.style.color = "var(--accent)"; }}
                          onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; e.currentTarget.style.color = "var(--text-muted)"; }}
                        >
                          <Plus size={12} />
                          New group
                        </button>
                      )}
                    </div>
                  )}
                </div>
              </div>

              <input
                value={entryName}
                onChange={(e) => setEntryName(e.target.value)}
                disabled={toAdd.length > 1}
                placeholder={toAdd.length > 1 ? "Names are auto-set for a batch" : "Label (optional)"}
                className="flex-1 min-w-0 bg-transparent outline-none text-xs sm:text-sm px-3 py-2 disabled:opacity-45"
                style={{
                  border: "1px solid var(--border)",
                  color: "var(--text)",
                  borderRadius: "var(--r-sm)",
                  background: "var(--bg)",
                }}
              />

              <div
                className="flex items-center gap-1.5 px-2 py-2 shrink-0"
                style={{ border: "1px solid var(--border)", borderRadius: "var(--r-sm)", background: "var(--bg)" }}
              >
                {WATCHLIST_COLORS.map((color) => (
                  <button
                    key={color}
                    onClick={() => setEntryColor(color)}
                    aria-label={`Pick ${color}`}
                    aria-pressed={entryColor === color}
                    className="flex items-center justify-center transition-transform"
                    style={{
                      width: 22,
                      height: 22,
                      background: `linear-gradient(135deg, ${hsl(toHsl(color)[0] - 14, Math.max(toHsl(color)[1], 55), Math.min(toHsl(color)[2] + 20, 74))}, ${hsl(toHsl(color)[0] + 14, Math.max(toHsl(color)[1], 55), Math.max(toHsl(color)[2] - 18, 22))})`,
                      borderRadius: 7,
                      boxShadow: entryColor === color ? `0 0 0 2px var(--bg), 0 0 0 3px var(--text)` : `0 0 0 1px ${tint(color, 0.4)}`,
                      transform: entryColor === color ? "scale(1.06)" : "scale(1)",
                    }}
                  >
                    {entryColor === color && <Check size={12} strokeWidth={3} style={{ color: "#fff" }} />}
                  </button>
                ))}
              </div>

              <button
                onClick={() => void addAddresses()}
                disabled={toAdd.length === 0}
                className="flex items-center justify-center gap-2 px-4 py-2 tag font-bold shrink-0 transition-opacity disabled:opacity-40"
                style={{ background: "var(--accent)", color: "var(--accent-fg)", borderRadius: "var(--r-sm)" }}
              >
                <Plus size={14} />
                {addLabel}
              </button>
            </div>

            {(watchlistError || notice) && (
              <div className="mt-2.5">
                {watchlistError && (
                  <span className="text-[11px] sm:text-xs" style={{ color: "var(--red)" }}>{watchlistError}</span>
                )}
                {!watchlistError && notice && (
                  <span className="text-[11px] sm:text-xs" style={{ color: "var(--green)" }}>{notice}</span>
                )}
              </div>
            )}
          </div>
        </div>

        {/* ── Saved addresses ── */}
        <div
          className="fade-up text-left"
          style={{
            border: "1px solid var(--border)",
            background: "var(--bg-surface)",
            borderRadius: "var(--r-card)",
          }}
        >
          {/* Card header */}
          <div className="p-4 sm:p-6" style={{ borderBottom: "1px solid var(--border-subtle)" }}>
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-2.5 sm:gap-3">
                <div
                  className="flex items-center justify-center shrink-0"
                  style={{ width: 30, height: 30, borderRadius: "var(--r-sm)", background: "var(--accent-dim)" }}
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

            <div className="flex items-center gap-2 mt-2.5 sm:mt-3">
              <span
                className="w-1.5 h-1.5 rounded-full shrink-0"
                style={{ background: user ? "var(--green)" : "var(--text-faint)" }}
              />
              <p className="text-[11px] sm:text-xs truncate" style={{ color: "var(--text-faint)" }}>
                {watchlistLoading
                  ? "Loading saved watchlist…"
                  : user
                  ? `Synced as ${user.email}`
                  : "Local only — sign in to sync across devices"}
              </p>
            </div>

            {watchlist.length >= FILTER_THRESHOLD && (
              <div className="relative mt-3">
                <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" style={{ color: "var(--text-faint)" }} />
                <input
                  value={filter}
                  onChange={(e) => setFilter(e.target.value)}
                  placeholder="Filter by name or address…"
                  className="w-full bg-transparent outline-none text-xs sm:text-sm py-2 pl-9 pr-3"
                  style={{
                    border: "1px solid var(--border)",
                    borderRadius: "var(--r-sm)",
                    background: "var(--bg)",
                    color: "var(--text)",
                  }}
                />
              </div>
            )}
          </div>

          {/* Groups */}
          <div className="p-4 sm:p-6">
            {groups.map((group) => {
              const all = watchlist.filter((entry) => entry.groupId === group.id);
              const entries = all.filter(matches);
              const isTarget = group.id === targetGroupId;
              const isCollapsed = collapsed.includes(group.id);
              const confirming = confirmDeleteGroupId === group.id;

              return (
                <div key={group.id} className="mb-3 sm:mb-4 last:mb-0">
                  {/* Group header */}
                  <div
                    role="button"
                    tabIndex={0}
                    aria-expanded={!isCollapsed}
                    onClick={() => toggleCollapse(group.id)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") { e.preventDefault(); toggleCollapse(group.id); }
                    }}
                    title={isCollapsed ? `Expand ${group.name}` : `Collapse ${group.name}`}
                    className="flex items-center gap-2 px-2.5 sm:px-3 py-2 sm:py-2.5 cursor-pointer select-none"
                    style={{
                      borderRadius: "var(--r-sm)",
                      background: isTarget ? "var(--accent-dim)" : "var(--bg)",
                      border: "1px solid var(--border-subtle)",
                    }}
                  >
                    <span
                      className="flex items-center gap-1.5 shrink-0"
                      style={{ color: isTarget ? "var(--accent)" : "var(--text-faint)" }}
                    >
                      <ChevronDown
                        size={12}
                        style={{ transition: "transform 0.18s", transform: isCollapsed ? "rotate(-90deg)" : "none" }}
                      />
                      {isCollapsed ? <Folder size={12} /> : <FolderOpen size={12} />}
                    </span>

                    {renamingGroupId === group.id ? (
                      <input
                        autoFocus
                        value={renameDraft}
                        onChange={(e) => setRenameDraft(e.target.value)}
                        onBlur={() => void renameGroup(group.id)}
                        onClick={(e) => e.stopPropagation()}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") void renameGroup(group.id);
                          if (e.key === "Escape") setRenamingGroupId(null);
                        }}
                        className="outline-none text-xs sm:text-sm font-bold px-2 py-1"
                        style={{
                          color: "var(--text)",
                          background: "var(--bg-surface)",
                          border: "1px solid var(--border)",
                          borderRadius: "var(--r-sm)",
                          maxWidth: 160,
                        }}
                      />
                    ) : (
                      <span className="tag font-bold text-xs sm:text-sm" style={{ color: "var(--text)" }}>
                        {group.name}
                      </span>
                    )}

                    <span
                      className="mono text-[9px] sm:text-[10px] font-bold px-1.5 py-0.5"
                      style={{ color: "var(--text-faint)", border: "1px solid var(--border-subtle)", borderRadius: "var(--r-sm)" }}
                    >
                      {all.length}
                    </span>

                    <div className="flex-1" />

                    {confirming ? (
                      <div className="flex items-center gap-1.5">
                        <span className="tag text-right" style={{ color: "var(--red)" }}>
                          {all.length > 0
                            ? `Delete group and ${all.length} address${all.length === 1 ? "" : "es"}?`
                            : "Delete group?"}
                        </span>
                        <button
                          onClick={(e) => { e.stopPropagation(); void deleteGroup(group.id); }}
                          className="tag font-bold px-2 py-1"
                          style={{ background: "var(--red)", color: "#fff", borderRadius: "var(--r-sm)" }}
                        >
                          YES
                        </button>
                        <button
                          onClick={(e) => { e.stopPropagation(); setConfirmDeleteGroupId(null); }}
                          className="tag font-bold px-2 py-1"
                          style={{ border: "1px solid var(--border)", color: "var(--text-muted)", borderRadius: "var(--r-sm)" }}
                        >
                          NO
                        </button>
                      </div>
                    ) : (
                      <>
                        {/* what colours live in here, at a glance */}
                        {all.length > 0 && (
                          <span className="hidden sm:flex items-center gap-1 mr-1">
                            {[...new Set(all.map((e) => e.color))].slice(0, 5).map((c) => (
                              <span key={c} className="w-2 h-2 rounded-full" style={{ background: c }} />
                            ))}
                          </span>
                        )}
                        <button
                          onClick={(e) => { e.stopPropagation(); addInto(group.id); }}
                          className="flex items-center gap-1 px-2 py-1 tag font-bold transition-colors"
                          style={{
                            border: `1px solid ${isTarget ? "var(--accent)" : "var(--border)"}`,
                            color: isTarget ? "var(--accent)" : "var(--text-muted)",
                            borderRadius: "var(--r-sm)",
                            background: "var(--bg-surface)",
                          }}
                          title={`Add addresses to ${group.name}`}
                        >
                          <Plus size={11} />
                          ADD
                        </button>
                        <button
                          onClick={(e) => { e.stopPropagation(); startRenameGroup(group); }}
                          className="flex items-center justify-center w-5 h-5"
                          style={{ color: "var(--text-faint)" }}
                          title={`Rename ${group.name}`}
                        >
                          <Pencil size={11} />
                        </button>
                        {groups.length > 1 && (
                          <button
                            onClick={(e) => { e.stopPropagation(); setConfirmDeleteGroupId(group.id); }}
                            className="flex items-center justify-center w-5 h-5"
                            style={{ color: "var(--text-faint)" }}
                            title={`Delete ${group.name}`}
                          >
                            <X size={11} />
                          </button>
                        )}
                      </>
                    )}
                  </div>

                  {/* Entries */}
                  <div
                    className="ml-3 sm:ml-4 mt-1 sm:mt-1.5 border-l"
                    style={{ borderColor: "var(--border-subtle)", display: isCollapsed ? "none" : undefined }}
                  >
                    {entries.map((entry) => (
                      <div
                        key={entry.id}
                        className="wl-row relative flex items-center gap-3 ml-2 sm:ml-2.5 mb-1.5 pl-2.5 sm:pl-3 pr-2 py-2 overflow-hidden"
                        style={{
                          borderRadius: "var(--r-sm)",
                          // The colour bleeds in from the edge and fades out, so the
                          // row reads as belonging to it rather than merely tagged.
                          background: `linear-gradient(100deg, ${tint(entry.color, 0.20)} 0%, ${tint(entry.color, 0.07)} 32%, transparent 70%)`,
                          ["--wl-glow" as string]: tint(entry.color, 0.30),
                        }}
                      >
                        <Sigil address={entry.address} color={entry.color} />

                        <div className="min-w-0 flex-1">
                          {renamingEntryId === entry.id ? (
                            <input
                              autoFocus
                              value={renameDraft}
                              onChange={(e) => setRenameDraft(e.target.value)}
                              onBlur={() => void renameEntry(entry.id)}
                              onKeyDown={(e) => {
                                if (e.key === "Enter") void renameEntry(entry.id);
                                if (e.key === "Escape") setRenamingEntryId(null);
                              }}
                              className="outline-none text-xs sm:text-sm font-bold w-full px-2 py-1"
                              style={{
                                color: "var(--text)",
                                background: "var(--bg-surface)",
                                border: "1px solid var(--border)",
                                borderRadius: "var(--r-sm)",
                              }}
                            />
                          ) : (
                            <button
                              onClick={() => startRenameEntry(entry)}
                              className="font-bold text-xs sm:text-sm truncate block text-left"
                              style={{ color: "var(--text)" }}
                              title="Rename"
                            >
                              {entry.name}
                            </button>
                          )}
                          <span className="mono text-[9px] sm:text-[10px]" style={{ color: "var(--text-faint)" }}>
                            {shortAddress(entry.address)}
                          </span>
                        </div>

                        <div className="flex items-center gap-1 sm:gap-1.5 shrink-0">
                          <button
                            onClick={() => copyAddress(entry.address, entry.id)}
                            className="flex items-center justify-center w-7 h-7 sm:w-8 sm:h-8"
                            style={{
                              color: copiedId === entry.id ? "var(--green)" : "var(--text-faint)",
                              borderRadius: "var(--r-sm)",
                              border: "1px solid var(--border)",
                            }}
                            title="Copy address"
                          >
                            {copiedId === entry.id ? <Check size={12} /> : <Copy size={12} />}
                          </button>
                          <button
                            onClick={() => trackAddress(entry.address)}
                            className="px-2 sm:px-2.5 py-1 tag font-bold text-[9px] sm:text-[10px] transition-colors"
                            style={{ border: "1px solid var(--border)", color: "var(--text-muted)", borderRadius: "var(--r-sm)" }}
                            onMouseEnter={(e) => { e.currentTarget.style.background = "var(--accent)"; e.currentTarget.style.color = "var(--accent-fg)"; e.currentTarget.style.borderColor = "var(--accent)"; }}
                            onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; e.currentTarget.style.color = "var(--text-muted)"; e.currentTarget.style.borderColor = "var(--border)"; }}
                          >
                            TRACK
                          </button>
                          <button
                            onClick={() => void removeWatchlistEntry(entry.id)}
                            className="flex items-center justify-center w-5 h-5 sm:w-6 sm:h-6"
                            style={{ color: "var(--text-faint)", borderRadius: "var(--r-sm)" }}
                            title="Remove"
                          >
                            <X size={11} />
                          </button>
                        </div>

                      </div>
                    ))}

                    {all.length === 0 && (
                      <div className="pl-3 sm:pl-4 py-1.5 sm:py-2">
                        <button
                          onClick={() => { setTargetGroupId(group.id); pasteRef.current?.focus(); }}
                          className="text-[11px] sm:text-xs"
                          style={{ color: "var(--text-faint)" }}
                        >
                          No addresses yet — paste one above
                        </button>
                      </div>
                    )}
                    {all.length > 0 && entries.length === 0 && (
                      <div className="pl-3 sm:pl-4 py-1.5 sm:py-2">
                        <span className="text-[11px] sm:text-xs" style={{ color: "var(--text-faint)" }}>
                          Nothing here matches the filter
                        </span>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}

          </div>
        </div>
    </div>
  );
}
