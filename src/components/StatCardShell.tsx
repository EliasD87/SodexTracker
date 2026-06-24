"use client";

import type { ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import { ArrowUpRight, ArrowDownRight } from "lucide-react";
import { CountUp } from "@/components/CountUp";
import { Sparkbars } from "@/components/Sparkbars";

interface Props {
  label: string;
  icon?: LucideIcon;
  index?: number;
  isExpanded: boolean;
  onMouseEnter: () => void;
  onMouseLeave: () => void;
  loading: boolean;
  error: boolean;
  /** Formatted fallback value (used when rawValue not supplied) */
  value: ReactNode;
  /** Raw numeric value — enables count-up animation */
  rawValue?: number;
  format?: (n: number) => string;
  /** Tiny always-on visualization series */
  bars?: number[];
  /** Change chip */
  deltaLabel?: string;
  deltaTone?: "up" | "down" | "neutral";
  expandLabel?: string;
  expandContent?: ReactNode;
}

export function StatCardShell({
  label,
  icon: Icon,
  isExpanded,
  onMouseEnter,
  onMouseLeave,
  loading,
  error,
  value,
  rawValue,
  format,
  bars,
  deltaLabel,
  deltaTone = "neutral",
  expandLabel,
  expandContent,
}: Props) {
  const deltaColor =
    deltaTone === "up" ? "var(--green)" : deltaTone === "down" ? "var(--red)" : "var(--text-muted)";
  const deltaBg =
    deltaTone === "up" ? "var(--green-tint)" : deltaTone === "down" ? "var(--cal-red-tint)" : "var(--bg-elevated)";

  return (
    <div onMouseEnter={onMouseEnter} onMouseLeave={onMouseLeave} className="relative">
      {/* ── Floating expansion panel (left) ── */}
      <div
        className="absolute top-0"
        style={{
          right: "calc(100% + 14px)",
          width: 224,
          opacity: isExpanded ? 1 : 0,
          transform: isExpanded ? "translateX(0)" : "translateX(12px)",
          transition: "opacity 0.2s ease, transform 0.2s cubic-bezier(0.2,0.9,0.3,1)",
          pointerEvents: isExpanded ? "auto" : "none",
          zIndex: 20,
        }}
      >
        <div
          className="relative"
          style={{
            background: "var(--panel-bg)",
            backdropFilter: "blur(22px)",
            WebkitBackdropFilter: "blur(22px)",
            border: "1px solid var(--panel-border)",
            borderRadius: "var(--r-card)",
            boxShadow: "0 16px 44px rgba(0,0,0,0.36)",
          }}
        >
          <div className="p-4">
            {expandLabel && (
              <div
                className="text-[10px] font-medium uppercase tracking-wider mb-3"
                style={{ color: "var(--text-faint)" }}
              >
                {expandLabel}
              </div>
            )}
            {expandContent}
          </div>
        </div>
      </div>

      {/* ── Card — borderless & transparent in every state ── */}
      <div className="relative overflow-hidden">
        <div className="px-1 pt-3.5 pb-4">
          {/* header row */}
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2.5 min-w-0">
              {Icon && (
                <span
                  className="flex items-center justify-center shrink-0"
                  style={{
                    width: 28,
                    height: 28,
                    borderRadius: 9,
                    background: isExpanded ? "var(--accent-dim)" : "var(--bg-elevated)",
                    color: isExpanded ? "var(--accent)" : "var(--text-muted)",
                    transition: "background 0.2s, color 0.2s",
                  }}
                >
                  <Icon size={14} strokeWidth={2} />
                </span>
              )}
              <span className="text-[12.5px] font-medium truncate" style={{ color: "var(--text-muted)" }}>
                {label}
              </span>
            </div>
            <span
              className="live-dot w-1.5 h-1.5 rounded-full shrink-0"
              style={{
                background: isExpanded ? "var(--accent)" : "var(--text-faint)",
                transition: "background 0.2s",
              }}
            />
          </div>

          {/* value + delta — fixed height to prevent layout shift between loading and loaded */}
          <div style={{ minHeight: 28 }} className="flex items-center">
            {loading ? (
              <div className="h-7 w-24 rounded-md animate-pulse" style={{ background: "var(--bg-elevated)" }} />
            ) : error ? (
              <span className="text-lg mono" style={{ color: "var(--text-faint)" }}>
                ——
              </span>
            ) : (
              <div className="flex items-end justify-between gap-2 w-full">
                <div
                  className="text-[25px] font-semibold leading-none tracking-tight tabular-nums value-in"
                  style={{ color: "var(--text)" }}
                >
                  {rawValue != null && format ? <CountUp value={rawValue} format={format} /> : value}
                </div>
                {deltaLabel && (
                  <span
                    className="inline-flex items-center gap-0.5 px-1.5 py-0.5 mono text-[10.5px] font-medium shrink-0"
                    style={{ color: deltaColor, background: deltaBg, borderRadius: 999 }}
                  >
                    {deltaTone === "up" && <ArrowUpRight size={11} strokeWidth={2.4} />}
                    {deltaTone === "down" && <ArrowDownRight size={11} strokeWidth={2.4} />}
                    {deltaLabel}
                  </span>
                )}
              </div>
            )}
          </div>

          {/* always-on sparkline — space always reserved to prevent layout shift */}
          {bars !== undefined && (
            <div className="mt-3.5" style={{ height: 22 }}>
              {loading ? (
                <div className="flex items-end gap-[2px] h-full">
                  {Array.from({ length: 5 }).map((_, i) => (
                    <div
                      key={i}
                      className="flex-1 rounded-[1px] animate-pulse"
                      style={{ height: "45%", background: "var(--bg-elevated)" }}
                    />
                  ))}
                </div>
              ) : !error && bars.length > 0 ? (
                <Sparkbars values={bars} active={isExpanded} />
              ) : null}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
