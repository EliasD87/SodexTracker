"use client";

import { useState } from "react";
import { Check, Copy } from "lucide-react";

/** Pieces every wallet card shares. */

export const signedUsd = (v: number, digits?: number) => {
  const a = Math.abs(v);
  const body = a >= 1e3 ? fmtUsd(a, digits) : `$${a.toFixed(2)}`;
  return `${v > 0 ? "+" : v < 0 ? "−" : ""}${body}`;
};

export function fmtUsd(v: number, digits = 2): string {
  const a = Math.abs(v);
  const s = v < 0 ? "−" : "";
  if (a >= 1e9) return `${s}$${(a / 1e9).toFixed(2)}B`;
  if (a >= 1e6) return `${s}$${(a / 1e6).toFixed(digits)}M`;
  if (a >= 1e3) return `${s}$${(a / 1e3).toFixed(digits)}K`;
  return `${s}$${a.toFixed(2)}`;
}

/** Prices keep their precision: 81,435 or 0.3319 or 0.0000231. */
export function fmtPrice(v: number): string {
  if (!v) return "—";
  if (v >= 1000) return v.toLocaleString("en-US", { maximumFractionDigits: 0 });
  if (v >= 1) return v.toLocaleString("en-US", { maximumFractionDigits: 2 });
  return v.toPrecision(3);
}

export function fmtAmount(v: number): string {
  if (v >= 1e6) return `${(v / 1e6).toFixed(2)}M`;
  if (v >= 1e3) return v.toLocaleString("en-US", { maximumFractionDigits: 2 });
  if (v >= 1) return v.toLocaleString("en-US", { maximumFractionDigits: 4 });
  return v.toPrecision(3);
}

export const shortAddr = (a: string) => `${a.slice(0, 6)}…${a.slice(-4)}`;

export function ago(t: number, now = Date.now()): string {
  const m = Math.floor((now - t) / 60_000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 48) return `${h}h ago`;
  const d = Math.floor(h / 24);
  if (d < 60) return `${d}d ago`;
  return new Date(t).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

export function duration(ms: number): string {
  const m = ms / 60_000;
  if (m < 60) return `${Math.max(1, Math.round(m))}m`;
  const h = m / 60;
  if (h < 48) return `${h.toFixed(h < 10 ? 1 : 0)}h`;
  return `${(h / 24).toFixed(h / 24 < 10 ? 1 : 0)}d`;
}

export const tone = (v: number) => (v > 0 ? "var(--green)" : v < 0 ? "var(--red)" : "var(--text-muted)");

/**
 * A wallet's mark: a 5×5 mirrored pattern seeded by the address, in one quiet
 * hue, so the same wallet always looks the same and two wallets rarely match.
 */
export function Identicon({ address, size = 44 }: { address: string; size?: number }) {
  const hex = address.toLowerCase().replace(/^0x/, "").padEnd(40, "0");
  const hue = parseInt(hex.slice(0, 4), 16) % 360;
  const cells: boolean[] = [];
  for (let i = 0; i < 15; i++) cells.push(parseInt(hex[i + 4], 16) % 2 === 0);
  const c = size / 5;
  return (
    <span className="inline-block shrink-0 overflow-hidden" style={{ width: size, height: size, borderRadius: size * 0.28, background: `hsl(${hue} 30% 50% / 0.14)` }} aria-hidden>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        {Array.from({ length: 5 }, (_, row) =>
          Array.from({ length: 5 }, (_, col) => {
            const on = cells[row * 3 + (col < 3 ? col : 4 - col)];
            return on ? <rect key={`${row}-${col}`} x={col * c + c * 0.12} y={row * c + c * 0.12} width={c * 0.76} height={c * 0.76} rx={c * 0.2} fill={`hsl(${hue} 45% 55%)`} /> : null;
          }),
        )}
      </svg>
    </span>
  );
}

/** `icon` replaces the copy glyph, for buttons that show only an icon on a phone. */
export function CopyButton({ text, label = "Copy", icon, children }: { text: string; label?: string; icon?: React.ReactNode; children?: React.ReactNode }) {
  const [done, setDone] = useState(false);
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={() => {
        void navigator.clipboard?.writeText(text).then(() => {
          setDone(true);
          setTimeout(() => setDone(false), 1400);
        });
      }}
      className="shrink-0 inline-flex items-center gap-1.5 h-8 px-2.5 rounded-[9px] text-[12px] font-medium whitespace-nowrap transition-colors hover:bg-[var(--bg-elevated)]"
      style={{ border: "1px solid var(--border)", color: "var(--text)" }}
    >
      {done ? <Check size={13} style={{ color: "var(--green)" }} /> : (icon ?? <Copy size={13} />)}
      {children}
    </button>
  );
}

/** A card's loading body. */
export function Skeleton({ height = 160 }: { height?: number }) {
  return <div className="animate-pulse rounded-[12px]" style={{ height, background: "var(--bg-elevated)" }} aria-busy="true" />;
}

/** What a card says when its part couldn't load. */
export function Failed({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div role="alert" className="flex flex-wrap items-center justify-between gap-3 rounded-[12px] px-4 py-3 text-[12.5px]" style={{ background: "var(--bg-elevated)", color: "var(--text-muted)" }}>
      {message}
      {onRetry && (
        <button type="button" onClick={onRetry} className="text-[12px] font-medium underline underline-offset-2" style={{ color: "var(--text)" }}>
          Try again
        </button>
      )}
    </div>
  );
}

export function Empty({ children }: { children: React.ReactNode }) {
  return (
    <p className="rounded-[12px] px-4 py-6 text-center text-[12.5px]" style={{ background: "var(--bg-elevated)", color: "var(--text-muted)" }}>
      {children}
    </p>
  );
}

/** LONG or SHORT, with the leverage. */
export function SidePill({ long, leverage }: { long: boolean; leverage?: number }) {
  const c = long ? "var(--green)" : "var(--red)";
  return (
    <span className="inline-flex items-center gap-1 px-1.5 py-[2px] rounded-[6px] text-[10.5px] font-semibold mono whitespace-nowrap" style={{ color: c, background: `color-mix(in srgb, ${c} 12%, transparent)` }}>
      {long ? "LONG" : "SHORT"}
      {leverage ? <span style={{ opacity: 0.75 }}>{leverage}×</span> : null}
    </span>
  );
}

/** A small label over a figure, for stat grids. */
export function Stat({ label, value, sub, color }: { label: string; value: React.ReactNode; sub?: React.ReactNode; color?: string }) {
  return (
    <div className="min-w-0">
      <div className="text-[12px] truncate" style={{ color: "var(--text-muted)" }}>
        {label}
      </div>
      <div className="mt-1 text-[17px] font-semibold tabular-nums truncate" style={{ color: color ?? "var(--text)", letterSpacing: "-0.01em" }}>
        {value}
      </div>
      {sub && (
        <div className="mt-0.5 text-[11.5px] truncate" style={{ color: "var(--text-faint)" }}>
          {sub}
        </div>
      )}
    </div>
  );
}

/** Three dots in a wave: a figure still on its way. */
export function LoadingDots({ label = "Loading" }: { label?: string }) {
  return (
    <span className="dot-wave inline-flex items-center gap-[3px] h-4 px-1" role="status" aria-label={label} style={{ color: "var(--text-muted)" }}>
      <span />
      <span />
      <span />
    </span>
  );
}
