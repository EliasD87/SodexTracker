"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/** A box's width, kept in step as the layout changes, for visuals drawn to size. */
export function useWidth<T extends HTMLElement>(): [(el: T | null) => void, number] {
  const [width, setWidth] = useState(0);
  const ro = useRef<ResizeObserver | null>(null);
  // A callback ref: measures the moment the box appears (the observer alone
  // waits for a paint, which a background tab may never do), then follows it.
  const ref = useCallback((el: T | null) => {
    ro.current?.disconnect();
    ro.current = null;
    if (!el) return;
    setWidth(Math.round(el.getBoundingClientRect().width));
    ro.current = new ResizeObserver(([e]) => setWidth(Math.round(e.contentRect.width)));
    ro.current.observe(el);
  }, []);
  useEffect(() => () => ro.current?.disconnect(), []);
  return [ref, width];
}

/** Green for up or buying, red for down or selling, deeper with `strength` (0–1). */
export function heat(sign: number, strength: number) {
  const s = Math.max(0, Math.min(1, strength));
  const hue = sign >= 0 ? "var(--green)" : "var(--red)";
  return `color-mix(in srgb, ${hue} ${Math.round(14 + s * 72)}%, var(--bg-elevated))`;
}

/** The empty or loading state every visual shares. */
export function Waiting({ reason, height = 320 }: { reason?: string; height?: number }) {
  return (
    <div
      className={`flex items-center justify-center text-center px-6 rounded-[14px] ${reason ? "" : "animate-pulse"}`}
      style={{ height, background: "var(--bg-elevated)" }}
    >
      {reason && (
        <p className="text-[12.5px] max-w-[300px]" style={{ color: "var(--text-muted)" }}>
          {reason}
        </p>
      )}
    </div>
  );
}

/** A small key: swatches with labels. */
export function Legend({ items }: { items: { label: string; color: string; round?: boolean }[] }) {
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-[11.5px]" style={{ color: "var(--text-muted)" }}>
      {items.map((i) => (
        <span key={i.label} className="inline-flex items-center gap-1.5">
          <span className={`w-2.5 h-2.5 ${i.round ? "rounded-full" : "rounded-[3px]"}`} style={{ background: i.color }} />
          {i.label}
        </span>
      ))}
    </div>
  );
}
