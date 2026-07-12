"use client";

import type { MouseEvent, ReactNode } from "react";

/**
 * Small bordered icon button used as the row "analysis / overview" trigger.
 * Sits in the second column of the leaderboard tables.
 */
export function RowActionButton({
  onClick,
  title,
  children,
}: {
  onClick: (e: MouseEvent) => void;
  title: string;
  children: ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      title={title}
      aria-label={title}
      className="group/act flex items-center justify-center w-7 h-7 rounded-sm transition-all duration-150 active:scale-90"
      style={{ border: "1px solid var(--border)", color: "var(--text-faint)", background: "transparent" }}
      onMouseEnter={(e) => {
        e.currentTarget.style.borderColor = "var(--accent)";
        e.currentTarget.style.background = "var(--accent-dim)";
        e.currentTarget.style.color = "var(--accent)";
        e.currentTarget.style.boxShadow = "0 0 12px -2px var(--accent-glow)";
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.borderColor = "var(--border)";
        e.currentTarget.style.background = "transparent";
        e.currentTarget.style.color = "var(--text-faint)";
        e.currentTarget.style.boxShadow = "none";
      }}
    >
      {children}
    </button>
  );
}
