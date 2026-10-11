"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowUpRight, Check, Copy, Flame, Layers, Star } from "lucide-react";
import { usd } from "@/lib/analyticsFormat";
import type { Watchlist } from "@/components/watchlist/useWatchlist";
import type { LbWindow } from "@/components/leaderboard/data";

/** Gold, silver and bronze: the only colour on the board besides up and down. */
export const MEDAL: Record<number, string> = { 1: "#E8B931", 2: "#C3C9D2", 3: "#D08A52" };

export const signed = (v: number) => `${v > 0 ? "+" : v < 0 ? "−" : ""}${usd(Math.abs(v))}`;
export const toneOf = (v: number) => (v > 0 ? "var(--green)" : v < 0 ? "var(--red)" : "var(--text-muted)");
export const short = (a: string) => `${a.slice(0, 6)}…${a.slice(-4)}`;
export const trackHref = (a: string) => `/tracker?address=${a}`;

/** Edge as a signed percentage: +0.19%, +156%. */
export const edgeText = (v: number | null) => {
  if (v == null) return "—";
  const p = Math.abs(v * 100);
  return `${v > 0 ? "+" : v < 0 ? "−" : ""}${p >= 10 ? Math.round(p) : p >= 1 ? p.toFixed(1) : p.toFixed(2)}%`;
};

/** What a wallet earned its badges for, from where else it places. */
export function Badges({ where, win, size = "sm" }: { where: LbWindow[] | undefined; win: LbWindow; size?: "sm" | "md" }) {
  if (!where?.length) return null;
  const hot = win !== "24H" && where.includes("24H");
  const many = where.length >= 3;
  if (!hot && !many) return null;
  const cls = `inline-flex items-center gap-1 rounded-[5px] font-semibold whitespace-nowrap ${size === "md" ? "h-6 px-2 text-[11px]" : "h-5 px-1.5 text-[10px]"}`;
  return (
    <span className="inline-flex flex-wrap gap-1">
      {hot && (
        <span className={cls} style={{ background: "color-mix(in srgb, #F0884A 16%, transparent)", color: "#F0884A" }} title="Also in today's top 20 by PnL">
          <Flame size={size === "md" ? 12 : 10} /> Hot today
        </span>
      )}
      {many && (
        <span
          className={cls}
          style={{ background: "var(--bg-elevated)", color: "var(--text)" }}
          title={`In the top 20 by PnL for ${where.length} of 4 windows`}
        >
          <Layers size={size === "md" ? 12 : 10} /> {where.length === 4 ? "Top 20 everywhere" : `Top 20 in ${where.length} windows`}
        </span>
      )}
    </span>
  );
}

/** Save to, or drop from, the watchlist: one tap. */
export function WatchStar({ wl, address, size = 15 }: { wl: Watchlist; address: string; size?: number }) {
  const entry = wl.entries.find((e) => e.address.toLowerCase() === address.toLowerCase());
  const on = !!entry;
  return (
    <button
      type="button"
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        if (entry) void wl.remove(entry.id);
        else if (wl.groups[0]) void wl.add([address], { groupId: wl.groups[0].id });
      }}
      disabled={!wl.ready}
      aria-pressed={on}
      aria-label={on ? "Remove from watchlist" : "Add to watchlist"}
      title={on ? "In your watchlist" : "Add to watchlist"}
      className="w-8 h-8 inline-flex items-center justify-center rounded-[9px] transition-colors hover:bg-[var(--bg-elevated)] disabled:opacity-40"
      style={{ color: on ? "#E8B931" : "var(--text-faint)" }}
    >
      <Star size={size} fill={on ? "#E8B931" : "none"} />
    </button>
  );
}

/** Open the wallet in Tracker. */
export function TrackLink({ address, label = false }: { address: string; label?: boolean }) {
  return (
    <Link
      href={trackHref(address)}
      onClick={(e) => e.stopPropagation()}
      aria-label="Open in Tracker"
      title="Open in Tracker"
      className={`inline-flex items-center justify-center gap-1 h-8 rounded-[9px] text-[12px] font-medium transition-colors hover:bg-[var(--bg-elevated)] ${label ? "px-3" : "w-8"}`}
      style={{ color: label ? "var(--text)" : "var(--text-faint)", border: label ? "1px solid var(--border)" : undefined }}
    >
      {label && "Track"}
      <ArrowUpRight size={14} />
    </Link>
  );
}

/** A PnL curve drawn to whatever box it sits in: green above where it started, red below. */
export function Spark({ values, height = 44, color }: { values: number[]; height?: number; color?: string }) {
  if (values.length < 2) return <div style={{ height }} />;
  const base = values[0];
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  const y = (v: number) => 2 + (1 - (v - min) / span) * 36;
  const x = (i: number) => (i / (values.length - 1)) * 100;
  const line = values.map((v, i) => `${i ? "L" : "M"}${x(i).toFixed(2)},${y(v).toFixed(2)}`).join("");
  const end = values[values.length - 1];
  const c = color ?? (end >= base ? "var(--green)" : "var(--red)");
  const id = `sp${Math.round(Math.abs(base + end + values.length) * 1000) % 1e9}`;
  return (
    <svg viewBox="0 0 100 40" preserveAspectRatio="none" className="w-full block" style={{ height }} aria-hidden>
      <defs>
        <linearGradient id={id} x1="0" x2="0" y1="0" y2="1">
          <stop offset="0" stopColor={c} stopOpacity="0.28" />
          <stop offset="1" stopColor={c} stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={`${line}L100,40L0,40Z`} fill={`url(#${id})`} />
      <path d={line} fill="none" stroke={c} strokeWidth={1.6} vectorEffect="non-scaling-stroke" strokeLinejoin="round" />
    </svg>
  );
}

/** A quiet copy glyph beside an address. */
export function CopyAddr({ address }: { address: string }) {
  const [done, setDone] = useState(false);
  return (
    <button
      type="button"
      aria-label="Copy address"
      title="Copy address"
      onClick={(e) => {
        e.stopPropagation();
        void navigator.clipboard?.writeText(address).then(() => {
          setDone(true);
          setTimeout(() => setDone(false), 1200);
        });
      }}
      className="shrink-0 w-6 h-6 inline-flex items-center justify-center rounded-[6px] transition-colors hover:bg-[var(--bg-elevated)]"
      style={{ color: done ? "var(--green)" : "var(--text-faint)" }}
    >
      {done ? <Check size={12} /> : <Copy size={12} />}
    </button>
  );
}
