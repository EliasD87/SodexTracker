"use client";

import { useEffect, useState } from "react";
import { AlertTriangle, X } from "lucide-react";
import { cachedApiFetch } from "@/lib/fetchCache";

/**
 * Heads-up for wallets with REAL open leveraged positions: an upcoming
 * macro print (CPI, PPI, retail sales...) that could move markets while that
 * risk is live. Only fetches/renders when the wallet actually has active
 * positions — decorative on an empty book helps no one.
 */

interface MacroEventDay {
  date: string;
  events: string[];
}

function daysUntil(dateStr: string): number {
  const target = Date.parse(dateStr);
  const now = Date.now();
  return Math.ceil((target - now) / (24 * 60 * 60 * 1000));
}

function fmtWhen(days: number): string {
  if (days <= 0) return "today";
  if (days === 1) return "tomorrow";
  return `in ${days} days`;
}

export function MacroRiskBanner({ positionCount }: { positionCount: number }) {
  const [event, setEvent] = useState<MacroEventDay | null>(null);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    if (positionCount <= 0) return;
    let alive = true;
    cachedApiFetch<MacroEventDay[]>("/api/sosovalue/macro/upcoming?days=5")
      .then((events) => {
        if (alive && events.length > 0) setEvent(events[0]);
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [positionCount]);

  if (!event || dismissed) return null;

  const days = daysUntil(event.date);
  const imminent = days <= 1;

  return (
    <div
      className="flex items-center gap-2.5 rounded-[10px] px-3.5 py-2.5 mb-3"
      style={{ background: "var(--bg-elevated)", border: `1px solid ${imminent ? "var(--cal-red-tint)" : "var(--border-subtle)"}` }}
    >
      <AlertTriangle size={14} style={{ color: imminent ? "var(--red)" : "var(--text-muted)", flexShrink: 0 }} />
      <span className="text-[12px] leading-snug flex-1" style={{ color: "var(--text-muted)" }}>
        <b style={{ color: "var(--text)" }}>{event.events.join(", ")}</b>{" "}
        <span style={{ color: imminent ? "var(--red)" : "var(--text-muted)", fontWeight: 600 }}>{fmtWhen(days)}</span>
        {" — "}you have {positionCount} open leveraged {positionCount === 1 ? "position" : "positions"}.
      </span>
      <span className="tag shrink-0" style={{ color: "#7C6BF0" }}>SOSOVALUE</span>
      <button
        onClick={() => setDismissed(true)}
        className="w-6 h-6 flex items-center justify-center rounded-full shrink-0"
        style={{ color: "var(--text-faint)" }}
        aria-label="Dismiss"
      >
        <X size={13} />
      </button>
    </div>
  );
}
