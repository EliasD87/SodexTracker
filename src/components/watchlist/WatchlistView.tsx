"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { ArrowRight, Check, Copy, FolderInput, MoreHorizontal, Pencil, Plus, Search, Trash2, X } from "lucide-react";
import { defaultName, parseAddresses } from "@/lib/watchlistAddress";
import { fetchAccount, fetchOverview } from "@/lib/wallet/api";
import { CARD_STYLE } from "@/components/analytics/kit";
import { useCompact } from "@/components/analytics/hooks";
import { Identicon, LoadingDots, fmtUsd, shortAddr, signedUsd, tone } from "@/components/wallet/ui";
import { useWatchlist, WATCHLIST_COLORS, type Watchlist, type WatchlistEntry } from "@/components/watchlist/useWatchlist";

/* ── A row's numbers, loaded once the row is on screen ─────────────────── */

function useOnScreen<T extends Element>(): [React.RefObject<T | null>, boolean] {
  const ref = useRef<T>(null);
  const [seen, setSeen] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el || seen) return;
    const io = new IntersectionObserver(([e]) => e.isIntersecting && setSeen(true), { rootMargin: "200px" });
    io.observe(el);
    return () => io.disconnect();
  }, [seen]);
  return [ref, seen];
}

/** All-time PnL and account value for one wallet: two cached reads, only for rows someone can see. */
function useRowStats(address: string, active: boolean) {
  const [s, set] = useState<{ value: number; pnl: number } | "none" | null>(null);
  useEffect(() => {
    if (!active) return;
    let live = true;
    fetchAccount(address)
      .then((a) => fetchOverview(a.accountId, "1Y"))
      .then((o) => live && set({ value: o.accountValue, pnl: o.pnl }))
      .catch(() => live && set("none"));
    return () => {
      live = false;
    };
  }, [address, active]);
  return s;
}

/* ── One saved wallet ───────────────────────────────────────────────────── */

/**
 * A row's menu on a phone: a sheet from the bottom edge, over a dimmed page,
 * so it is never clipped by the list or pushed off the side of the screen.
 */
function Sheet({ title, panelRef, onClose, children }: { title: string; panelRef: React.RefObject<HTMLDivElement | null>; onClose: () => void; children: React.ReactNode }) {
  return createPortal(
    <div className="fixed inset-0 z-[90] flex items-end">
      <div className="absolute inset-0" style={{ background: "rgba(0,0,0,0.5)" }} onClick={onClose} aria-hidden />
      <div
        ref={panelRef}
        role="menu"
        aria-label={title}
        className="relative w-full px-2 pt-2 pb-[max(12px,env(safe-area-inset-bottom))] rounded-t-2xl"
        style={{ background: "var(--bg-surface)", borderTop: "1px solid var(--border)", boxShadow: "0 -12px 40px rgba(0,0,0,0.3)" }}
      >
        <p className="px-3 pt-1 pb-2 text-[12px] font-medium truncate" style={{ color: "var(--text-faint)" }}>
          {title}
        </p>
        {children}
      </div>
    </div>,
    document.body,
  );
}

function Row({ e, wl, onTrack, showGroup }: { e: WatchlistEntry; wl: Watchlist; onTrack: (a: string) => void; showGroup: boolean }) {
  const [ref, seen] = useOnScreen<HTMLLIElement>();
  const stats = useRowStats(e.address, seen);
  const [menu, setMenu] = useState(false);
  const [mode, setMode] = useState<"idle" | "rename" | "move" | "remove">("idle");
  const [name, setName] = useState(e.name);
  const [copied, setCopied] = useState(false);
  const group = wl.groups.find((g) => g.id === e.groupId);
  const menuRef = useRef<HTMLDivElement>(null);
  const sheetRef = useRef<HTMLDivElement>(null);
  const phone = useCompact();

  useEffect(() => {
    if (!menu) return;
    // The phone's sheet lives in a portal, outside the row: a tap in it isn't "outside".
    const close = (ev: MouseEvent) =>
      menuRef.current && !menuRef.current.contains(ev.target as Node) && !sheetRef.current?.contains(ev.target as Node) && setMenu(false);
    const esc = (ev: KeyboardEvent) => ev.key === "Escape" && setMenu(false);
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", esc);
    return () => {
      document.removeEventListener("mousedown", close);
      document.removeEventListener("keydown", esc);
    };
  }, [menu]);

  const item = phone
    ? "w-full flex items-center gap-3 px-3 py-3 text-[14px] text-left rounded-[10px] hover:bg-[var(--bg-elevated)]"
    : "w-full flex items-center gap-2 px-3 py-2 text-[12.5px] text-left rounded-[8px] hover:bg-[var(--bg-elevated)]";

  const menuItems = (
    <>
      <button type="button" className={item} style={{ color: "var(--text)" }} onClick={() => (setMenu(false), onTrack(e.address))}>
        <ArrowRight size={14} /> Track wallet
      </button>
      <button
        type="button"
        className={item}
        style={{ color: "var(--text)" }}
        onClick={() => {
          void navigator.clipboard?.writeText(e.address).then(() => {
            setCopied(true);
            setTimeout(() => setCopied(false), 1200);
          });
          setMenu(false);
        }}
      >
        {copied ? <Check size={14} /> : <Copy size={14} />} Copy address
      </button>
      <button type="button" className={item} style={{ color: "var(--text)" }} onClick={() => (setMenu(false), setName(e.name), setMode("rename"))}>
        <Pencil size={14} /> Rename
      </button>
      {wl.groups.length > 1 && (
        <button type="button" className={item} style={{ color: "var(--text)" }} onClick={() => (setMenu(false), setMode("move"))}>
          <FolderInput size={14} /> Move to group
        </button>
      )}
      <button type="button" className={item} style={{ color: "var(--red)" }} onClick={() => (setMenu(false), setMode("remove"))}>
        <Trash2 size={14} /> Remove
      </button>
    </>
  );

  return (
    <li ref={ref} className="group relative flex items-center gap-3 px-4 sm:px-5 py-2.5 sm:py-3 transition-colors hover:bg-[var(--bg-elevated)]" style={{ borderTop: "1px solid var(--border-subtle)" }}>
      {/* The whole row opens the wallet too; the Track button is the visible, labelled way in. */}
      {mode === "idle" && (
        <button type="button" tabIndex={-1} aria-hidden className="absolute inset-0 cursor-pointer" onClick={() => onTrack(e.address)} />
      )}
      <span className="relative pointer-events-none">
        <Identicon address={e.address} size={34} />
        <span className="absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full" style={{ background: e.color, boxShadow: "0 0 0 2px var(--bg-surface)" }} aria-hidden />
      </span>

      <span className="min-w-0 flex-1 relative">
        {mode === "rename" ? (
          <form
            onSubmit={(ev) => {
              ev.preventDefault();
              void wl.update(e.id, { name: name.trim() || e.name });
              setMode("idle");
            }}
            className="flex items-center gap-2"
          >
            <input autoFocus value={name} onChange={(ev) => setName(ev.target.value)} onKeyDown={(ev) => ev.key === "Escape" && setMode("idle")} aria-label="Name" className="flex-1 min-w-0 h-8 px-2 rounded-[8px] bg-transparent outline-none text-[13px]" style={{ border: "1px solid var(--border)", color: "var(--text)" }} />
            <button type="submit" aria-label="Save name" className="h-8 w-8 inline-flex items-center justify-center rounded-[8px]" style={{ background: "var(--text)", color: "var(--bg)" }}>
              <Check size={14} />
            </button>
          </form>
        ) : mode === "move" ? (
          <span className="flex flex-wrap items-center gap-1.5">
            <span className="text-[12px] mr-1" style={{ color: "var(--text-muted)" }}>Move to</span>
            {wl.groups.map((g) => (
              <button
                key={g.id}
                type="button"
                disabled={g.id === e.groupId}
                onClick={() => {
                  void wl.update(e.id, { groupId: g.id });
                  setMode("idle");
                }}
                className="h-8 sm:h-7 px-2.5 rounded-full text-[12px] disabled:opacity-40"
                style={{ border: "1px solid var(--border)", color: "var(--text)" }}
              >
                {g.name}
              </button>
            ))}
            <button type="button" aria-label="Cancel" onClick={() => setMode("idle")} className="h-8 w-8 sm:h-7 sm:w-7 inline-flex items-center justify-center" style={{ color: "var(--text-muted)" }}>
              <X size={13} />
            </button>
          </span>
        ) : mode === "remove" ? (
          <span className="flex flex-wrap items-center gap-2 text-[12.5px]">
            <span style={{ color: "var(--text)" }}>Remove {e.name}?</span>
            <button type="button" onClick={() => void wl.remove(e.id)} className="h-8 sm:h-7 px-2.5 rounded-[8px] text-[12px] font-semibold" style={{ background: "var(--red)", color: "#fff" }}>
              Remove
            </button>
            <button type="button" onClick={() => setMode("idle")} className="h-8 sm:h-7 px-2.5 rounded-[8px] text-[12px]" style={{ border: "1px solid var(--border)", color: "var(--text-muted)" }}>
              Keep
            </button>
          </span>
        ) : (
          <span className="pointer-events-none">
            {/* An unnamed wallet's name is its short address: show it once. */}
            <span className={`block text-[13.5px] font-medium truncate underline-offset-2 group-hover:underline ${e.name === defaultName(e.address) ? "mono" : ""}`} style={{ color: "var(--text)" }}>
              {e.name}
            </span>
            <span className="flex items-center gap-2 text-[11.5px] min-h-[16px] min-w-0 overflow-hidden" style={{ color: "var(--text-faint)" }}>
              {e.name !== defaultName(e.address) && <span className="mono shrink-0">{shortAddr(e.address)}</span>}
              {showGroup && group && <span className="px-1.5 rounded-[5px] truncate" style={{ background: "var(--bg-elevated)", color: "var(--text-muted)" }}>{group.name}</span>}
              {stats && stats !== "none" && (
                <span className="sm:hidden mono shrink-0" style={{ color: tone(stats.pnl) }}>
                  {signedUsd(stats.pnl)}
                </span>
              )}
            </span>
          </span>
        )}
      </span>

      {mode === "idle" && (
        <>
          <span className="hidden sm:block text-right pointer-events-none min-w-[110px]">
            {stats == null ? (
              <LoadingDots />
            ) : stats === "none" ? (
              <span className="text-[11.5px]" style={{ color: "var(--text-faint)" }}>Not on SoDEX yet</span>
            ) : (
              <>
                <span className="block mono tabular-nums text-[13px]" style={{ color: tone(stats.pnl) }}>
                  {signedUsd(stats.pnl)}
                </span>
                <span className="block text-[11px] mono" style={{ color: "var(--text-faint)" }}>
                  {fmtUsd(stats.value)} account
                </span>
              </>
            )}
          </span>
          <button
            type="button"
            onClick={() => onTrack(e.address)}
            aria-label={`Track ${e.name}`}
            className="relative shrink-0 h-8 w-8 sm:w-[84px] inline-flex items-center justify-center gap-1.5 rounded-[9px] text-[12.5px] font-semibold cursor-pointer transition-colors border border-[var(--border)] text-[var(--text)] group-hover:border-[var(--text)] hover:bg-[var(--text)] hover:text-[var(--bg)]"
          >
            <span className="hidden sm:inline">Track</span>
            <ArrowRight size={14} />
          </button>
          <div ref={menuRef} className="relative">
            <button
              type="button"
              aria-label="More"
              aria-expanded={menu}
              onClick={() => setMenu((x) => !x)}
              className="relative h-8 w-8 inline-flex items-center justify-center rounded-[9px] cursor-pointer hover:bg-[var(--bg-surface)]"
              style={{ color: "var(--text-muted)" }}
            >
              <MoreHorizontal size={16} />
            </button>
            {menu &&
              (phone ? (
                <Sheet title={e.name} panelRef={sheetRef} onClose={() => setMenu(false)}>
                  {menuItems}
                </Sheet>
              ) : (
                <div className="absolute right-0 top-9 z-30 w-[180px] p-1" style={{ ...CARD_STYLE, borderRadius: 12, boxShadow: "0 12px 32px rgba(0,0,0,0.25)" }} role="menu">
                  {menuItems}
                </div>
              ))}
          </div>
        </>
      )}
    </li>
  );
}

/* ── Adding wallets ─────────────────────────────────────────────────────── */

function AddPanel({ wl, groupId, onDone }: { wl: Watchlist; groupId: string; onDone: (msg: string) => void }) {
  const [text, setText] = useState("");
  const [name, setName] = useState("");
  const [color, setColor] = useState(WATCHLIST_COLORS[0]);
  const [target, setTarget] = useState(groupId);
  const [problem, setProblem] = useState<string | null>(null);
  const parsed = useMemo(() => parseAddresses(text), [text]);
  const one = parsed.valid.length === 1;

  const submit = async () => {
    if (!parsed.valid.length) return setProblem(parsed.invalid.length ? "That doesn't look like a wallet address (0x and 40 characters)." : "Paste a wallet address first.");
    const r = await wl.add(parsed.valid, { groupId: target, name, color });
    if (!r.added && r.skipped) return setProblem(r.skipped === 1 ? "Already in your watchlist." : "All of those are already in your watchlist.");
    if (!r.added) return;
    const g = wl.groups.find((x) => x.id === target)?.name ?? "the group";
    onDone(`${r.added} wallet${r.added === 1 ? "" : "s"} added to ${g}${r.skipped ? ` · ${r.skipped} already saved` : ""}`);
    setText("");
    setName("");
  };

  return (
    <div className="p-4 sm:p-5" style={{ borderTop: "1px solid var(--border-subtle)", background: "var(--bg-elevated)" }}>
      <textarea
        autoFocus
        value={text}
        onChange={(ev) => {
          setText(ev.target.value);
          setProblem(null);
        }}
        onKeyDown={(ev) => ev.key === "Enter" && (ev.metaKey || ev.ctrlKey) && void submit()}
        rows={text.includes("\n") ? 4 : 2}
        placeholder="Paste a wallet address, or a whole list: one per line, or separated by commas"
        aria-label="Wallet addresses"
        spellCheck={false}
        className="w-full resize-none rounded-[12px] px-3 py-2.5 bg-transparent outline-none text-[13px] mono"
        style={{ background: "var(--bg-surface)", border: "1px solid var(--border)", color: "var(--text)" }}
      />
      <div className="mt-3 flex flex-wrap items-center gap-2">
        {one && (
          <input value={name} onChange={(ev) => setName(ev.target.value)} placeholder="Name (optional)" aria-label="Name" className="h-9 px-3 rounded-[10px] bg-transparent outline-none text-[13px] w-full sm:w-[180px]" style={{ background: "var(--bg-surface)", border: "1px solid var(--border)", color: "var(--text)" }} />
        )}
        {/* Which group: chips rather than a native select, whose open list can't be styled. Nothing to pick with one group. */}
        {wl.groups.length > 1 && (
          <span className="scroll-row inline-flex items-center gap-0.5 max-w-full h-9 p-[3px] rounded-[10px]" role="radiogroup" aria-label="Group" style={{ background: "var(--bg-surface)", border: "1px solid var(--border)" }}>
            {wl.groups.map((g) => (
              <button
                key={g.id}
                type="button"
                role="radio"
                aria-checked={target === g.id}
                onClick={() => setTarget(g.id)}
                className="shrink-0 h-full px-2.5 rounded-[7px] text-[12.5px] font-medium whitespace-nowrap transition-colors"
                style={{ background: target === g.id ? "var(--text)" : "transparent", color: target === g.id ? "var(--bg)" : "var(--text-muted)" }}
              >
                {g.name}
              </button>
            ))}
          </span>
        )}
        <span className="flex items-center gap-2 sm:gap-1.5 px-1" role="radiogroup" aria-label="Colour">
          {WATCHLIST_COLORS.map((c) => (
            <button key={c} type="button" role="radio" aria-checked={color === c} aria-label={`Colour ${c}`} onClick={() => setColor(c)} className="w-6 h-6 sm:w-5 sm:h-5 rounded-full" style={{ background: c, boxShadow: color === c ? "0 0 0 2px var(--bg-elevated), 0 0 0 4px var(--text)" : undefined }} />
          ))}
        </span>
        <button type="button" onClick={() => void submit()} className="w-full sm:w-auto sm:ml-auto h-10 sm:h-9 px-4 rounded-[10px] text-[13px] font-semibold" style={{ background: "var(--text)", color: "var(--bg)" }}>
          {parsed.valid.length > 1 ? `Add ${parsed.valid.length} wallets` : "Add wallet"}
        </button>
      </div>
      <p className="mt-2 text-[11.5px] min-h-[16px]" role={problem ? "alert" : undefined} style={{ color: problem ? "var(--red)" : "var(--text-faint)" }}>
        {problem ?? (parsed.valid.length > 1 ? `${parsed.valid.length} addresses found${parsed.invalid.length ? `, ${parsed.invalid.length} skipped` : ""}.` : " ")}
      </p>
    </div>
  );
}

/* ── The watchlist ──────────────────────────────────────────────────────── */

/**
 * Saved wallets to keep an eye on. Full on /watchlist; `compact` under the
 * Tracker's search, showing the first few with a link to the rest.
 */
export function WatchlistView({ onTrack, compact = false }: { onTrack: (address: string) => void; compact?: boolean }) {
  const wl = useWatchlist();
  const [tab, setTab] = useState<string>("all");
  const [q, setQ] = useState("");
  const [adding, setAdding] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [groupMode, setGroupMode] = useState<"idle" | "new" | "rename" | "delete">("idle");
  const [groupName, setGroupName] = useState("");

  const activeGroup = wl.groups.find((g) => g.id === tab) ?? null;
  const list = wl.entries.filter((e) => (tab === "all" || e.groupId === tab) && (!q.trim() || e.name.toLowerCase().includes(q.trim().toLowerCase()) || e.address.toLowerCase().includes(q.trim().toLowerCase())));
  const phone = useCompact();
  const LIMIT = phone ? 4 : 6;
  const shown = compact ? list.slice(0, LIMIT) : list;
  // A find box once the list is longer than a glance, on the Tracker's short list too (it searches all saved wallets).
  const finding = wl.entries.length > 5;
  const count = (id: string) => wl.entries.filter((e) => e.groupId === id).length;

  const flash = (m: string) => {
    setNotice(m);
    setTimeout(() => setNotice(null), 2600);
  };

  const pill = (active: boolean) => ({
    background: active ? "var(--text)" : "transparent",
    color: active ? "var(--bg)" : "var(--text-muted)",
    border: `1px solid ${active ? "var(--text)" : "var(--border)"}`,
  });

  const chips = (
    <>
      <button type="button" onClick={() => setTab("all")} className="shrink-0 h-8 px-3 rounded-full text-[12.5px] font-medium whitespace-nowrap" style={pill(tab === "all")}>
        All <span className="mono opacity-70">{wl.entries.length}</span>
      </button>
      {wl.groups.map((g) => (
        <button key={g.id} type="button" onClick={() => (setTab(g.id), setGroupMode("idle"))} className="shrink-0 h-8 px-3 rounded-full text-[12.5px] font-medium whitespace-nowrap" style={pill(tab === g.id)}>
          {g.name} <span className="mono opacity-70">{count(g.id)}</span>
        </button>
      ))}
      {groupMode === "new" ? (
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            const g = await wl.addGroup(groupName);
            if (g) setTab(g.id);
            setGroupName("");
            setGroupMode("idle");
          }}
          className="shrink-0 flex items-center gap-1"
        >
          <input autoFocus value={groupName} onChange={(e) => setGroupName(e.target.value)} onKeyDown={(e) => e.key === "Escape" && setGroupMode("idle")} placeholder="Group name" aria-label="New group name" className="h-8 w-[130px] px-3 rounded-full bg-transparent outline-none text-[12.5px]" style={{ border: "1px solid var(--border)", color: "var(--text)" }} />
          <button type="submit" aria-label="Create group" className="h-8 w-8 inline-flex items-center justify-center rounded-full" style={{ background: "var(--text)", color: "var(--bg)" }}>
            <Check size={13} />
          </button>
        </form>
      ) : (
        <button type="button" onClick={() => setGroupMode("new")} className="shrink-0 h-8 px-3 rounded-full text-[12.5px] inline-flex items-center gap-1 whitespace-nowrap" style={{ border: "1px dashed var(--border)", color: "var(--text-muted)" }}>
          <Plus size={13} /> Group
        </button>
      )}
    </>
  );
  // The open group's rename and delete; nothing while a new group is being named.
  const groupTools =
    !activeGroup || groupMode === "new" ? null : groupMode === "rename" ? (
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void wl.renameGroup(activeGroup.id, groupName);
          setGroupMode("idle");
        }}
        className="flex items-center gap-1"
      >
        <input autoFocus value={groupName} onChange={(e) => setGroupName(e.target.value)} onKeyDown={(e) => e.key === "Escape" && setGroupMode("idle")} aria-label="Group name" className="h-8 w-[130px] px-3 rounded-full bg-transparent outline-none text-[12.5px]" style={{ border: "1px solid var(--border)", color: "var(--text)" }} />
        <button type="submit" aria-label="Save group name" className="h-8 w-8 inline-flex items-center justify-center rounded-full" style={{ background: "var(--text)", color: "var(--bg)" }}>
          <Check size={13} />
        </button>
      </form>
    ) : groupMode === "delete" ? (
      <>
        <span style={{ color: "var(--text)" }}>Delete {activeGroup.name} and its {count(activeGroup.id)} wallets?</span>
        <button type="button" onClick={() => (void wl.deleteGroup(activeGroup.id), setTab("all"), setGroupMode("idle"))} className="h-8 sm:h-7 px-2.5 rounded-[8px] font-semibold" style={{ background: "var(--red)", color: "#fff" }}>
          Delete
        </button>
        <button type="button" onClick={() => setGroupMode("idle")} className="h-8 sm:h-7 px-2.5 rounded-[8px]" style={{ border: "1px solid var(--border)", color: "var(--text-muted)" }}>
          Keep
        </button>
      </>
    ) : (
      <>
        <button type="button" onClick={() => (setGroupName(activeGroup.name), setGroupMode("rename"))} className="h-8 sm:h-7 px-2 rounded-[8px] inline-flex items-center gap-1 hover:bg-[var(--bg-elevated)]" style={{ color: "var(--text-muted)" }}>
          <Pencil size={12} /> Rename
        </button>
        {wl.groups.length > 1 && (
          <button type="button" onClick={() => setGroupMode("delete")} className="h-8 sm:h-7 px-2 rounded-[8px] inline-flex items-center gap-1 hover:bg-[var(--bg-elevated)]" style={{ color: "var(--text-muted)" }}>
            <Trash2 size={12} /> Delete
          </button>
        )}
      </>
    );

  return (
    <section style={CARD_STYLE} className="overflow-hidden">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3 px-4 sm:px-5 pt-4 pb-3">
        <div>
          <h2 className="text-[15px] font-semibold" style={{ color: "var(--text)" }}>
            {compact ? "Your watchlist" : "Saved wallets"}
            <span className="ml-2 text-[12px] font-normal mono" style={{ color: "var(--text-faint)" }}>
              {wl.ready ? wl.entries.length : ""}
            </span>
          </h2>
          <p className="text-[11.5px] mt-0.5" style={{ color: "var(--text-faint)" }}>
            {wl.synced ? "Synced to your account" : (
              <>
                On this device · <Link href="/account" className="underline underline-offset-2">sign in</Link> to sync
              </>
            )}
          </p>
        </div>
        {/* With a search box, a phone gives this its own full-width line. */}
        <div className={`flex items-center gap-2 ${finding ? "w-full sm:w-auto" : ""}`}>
          {finding && (
            <label className="flex flex-1 sm:flex-none min-w-0 items-center gap-2 h-9 px-3 rounded-[10px]" style={{ border: "1px solid var(--border)" }}>
              <Search size={14} className="shrink-0" style={{ color: "var(--text-faint)" }} />
              <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Find" aria-label="Find a saved wallet" className="w-full min-w-0 sm:w-[110px] bg-transparent outline-none text-[13px]" style={{ color: "var(--text)" }} />
            </label>
          )}
          <button type="button" onClick={() => setAdding((x) => !x)} aria-expanded={adding} className="shrink-0 inline-flex items-center gap-1.5 h-9 px-3.5 rounded-[10px] text-[13px] font-semibold" style={{ background: adding ? "var(--bg-elevated)" : "var(--text)", color: adding ? "var(--text)" : "var(--bg)" }}>
            {adding ? <X size={14} /> : <Plus size={14} />}
            {adding ? "Close" : "Add wallets"}
          </button>
        </div>
      </div>

      {/* Groups: on a phone the chips slide sideways and the group's own tools take the line below. */}
      {!compact &&
        (phone ? (
          <div className="pb-3">
            <div className="scroll-row flex flex-nowrap items-center gap-1.5 px-4">{chips}</div>
            {groupTools && <div className="flex flex-wrap items-center gap-1 px-4 pt-2 text-[12px]">{groupTools}</div>}
          </div>
        ) : (
          <div className="flex flex-wrap items-center gap-1.5 px-4 sm:px-5 pb-3">
            {chips}
            {groupTools && <span className="ml-auto flex items-center gap-1 text-[12px]">{groupTools}</span>}
          </div>
        ))}

      {adding && <AddPanel wl={wl} groupId={activeGroup?.id ?? wl.groups[0]?.id ?? "main"} onDone={(m) => (flash(m), setAdding(false))} />}

      {(notice || wl.error) && (
        <p role="status" className="mx-4 sm:mx-5 my-2 px-3 py-2 rounded-[10px] text-[12.5px]" style={{ background: wl.error ? "color-mix(in srgb, var(--red) 10%, transparent)" : "color-mix(in srgb, var(--green) 10%, transparent)", color: wl.error ? "var(--red)" : "var(--green)" }}>
          {wl.error ?? notice}
        </p>
      )}

      {/* List */}
      {!wl.ready ? (
        <div className="px-4 sm:px-5 py-8 flex justify-center">
          <LoadingDots />
        </div>
      ) : !wl.entries.length ? (
        <div className="px-4 sm:px-5 py-10 text-center" style={{ borderTop: "1px solid var(--border-subtle)" }}>
          <p className="text-[13.5px] font-medium" style={{ color: "var(--text)" }}>
            Nothing saved yet
          </p>
          <p className="mt-1 text-[12.5px]" style={{ color: "var(--text-muted)" }}>
            Save wallets you want to keep an eye on: traders you follow, whales, your own.
          </p>
          {!adding && (
            <button type="button" onClick={() => setAdding(true)} className="mt-4 inline-flex items-center gap-1.5 h-9 px-4 rounded-[10px] text-[13px] font-semibold" style={{ background: "var(--text)", color: "var(--bg)" }}>
              <Plus size={14} /> Add a wallet
            </button>
          )}
        </div>
      ) : !list.length ? (
        <p className="px-4 sm:px-5 py-8 text-center text-[12.5px]" style={{ borderTop: "1px solid var(--border-subtle)", color: "var(--text-muted)" }}>
          {q ? "No saved wallet matches that." : "This group is empty."}
        </p>
      ) : (
        <>
          <div className="hidden sm:flex justify-end px-5 pb-1.5 text-[11px]" style={{ color: "var(--text-faint)" }}>
            {/* Over the figures: clear of the Track button (84px) and the menu (32px), with their 12px gaps. */}
            <span className="mr-[140px]">All-time PnL</span>
          </div>
          <ul>
            {shown.map((e) => (
              <Row key={e.id} e={e} wl={wl} onTrack={onTrack} showGroup={tab === "all" && wl.groups.length > 1} />
            ))}
          </ul>
          {compact && (
            <Link href="/watchlist" className="flex items-center justify-center gap-1.5 py-3 text-[12.5px] font-medium hover:bg-[var(--bg-elevated)]" style={{ borderTop: "1px solid var(--border-subtle)", color: "var(--text-muted)" }}>
              {list.length > LIMIT ? `See all ${list.length}` : "Open watchlist"} <ArrowRight size={13} />
            </Link>
          )}
        </>
      )}
    </section>
  );
}
