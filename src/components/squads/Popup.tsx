"use client";

import { useEffect, useRef } from "react";
import { X } from "lucide-react";

/**
 * A wallet's or a squad's details over the page. Closing it (✕, Esc, a click
 * outside) leaves the page exactly as it was underneath.
 */
export function Popup({ title, onClose, narrow, children }: { title: string; onClose: () => void; narrow?: boolean; children: React.ReactNode }) {
  const panel = useRef<HTMLDivElement>(null);
  const closeRef = useRef(onClose);
  useEffect(() => {
    closeRef.current = onClose;
  });

  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (e.key === "Escape") closeRef.current();
    };
    document.addEventListener("keydown", key);
    // The page underneath stays put while the popup scrolls.
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    panel.current?.focus();
    return () => {
      document.removeEventListener("keydown", key);
      document.body.style.overflow = overflow;
    };
  }, []);

  return (
    <div
      className="fixed inset-0 z-[60] flex items-start justify-center px-3 sm:px-6 pt-[64px] sm:pt-[84px] pb-6"
      style={{ background: "rgba(0,0,0,0.55)", backdropFilter: "blur(3px)" }}
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        ref={panel}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        tabIndex={-1}
        className={`dash-in w-full ${narrow ? "max-w-[680px]" : "max-w-[1100px]"} max-h-full overflow-y-auto outline-none p-3 sm:p-4`}
        style={{ background: "var(--bg)", borderRadius: "calc(var(--card-radius) + 6px)", border: "1px solid var(--border)", boxShadow: "0 30px 80px -20px rgba(0,0,0,0.5)" }}
      >
        <div className="flex items-center justify-between mb-3 px-1">
          <span className="text-[11px] font-semibold uppercase tracking-[0.08em]" style={{ color: "var(--text-faint)" }}>
            {title}
          </span>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="w-8 h-8 grid place-items-center cursor-pointer hover:bg-[var(--bg-elevated)]"
            style={{ borderRadius: 9, color: "var(--text-muted)" }}
          >
            <X size={16} />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}
