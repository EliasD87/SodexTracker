import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { SQUADS_LIVE } from "@/lib/features";
import { Info, TrendingUp, Users, Zap } from "lucide-react";
import { Navbar } from "@/components/Navbar";
import { SquadsView } from "@/components/analytics/SquadsView";
import { SQUAD_CSS } from "@/components/squads/track";

export const metadata: Metadata = {
  title: "Squads — SoDEX Tracker",
  description: "SoPoints squads on SoDEX: find any wallet's squads, their estimated Energy and boost, and the biggest squads this season.",
};

/** The whole idea in three steps, in place of a paragraph. */
const STEPS = [
  { icon: <Users size={13} />, label: "Squad", value: "a captain + their invitees" },
  { icon: <Zap size={13} />, label: "Energy", value: "4-week trading volume" },
  { icon: <TrendingUp size={13} />, label: "Boost", value: "up to +25% SoPoints per squad" },
];

export default function Squads() {
  if (!SQUADS_LIVE) notFound();
  return (
    <main>
      <Navbar />
      <style>{SQUAD_CSS}</style>
      <div className="sq max-w-[1240px] mx-auto px-4 sm:px-6 pt-[76px] sm:pt-[96px] pb-20">
        <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
          <div className="flex items-center gap-2.5">
            <h1 className="text-[26px] sm:text-[34px] font-semibold leading-none" style={{ color: "var(--text)", letterSpacing: "-0.03em" }}>
              Squads
            </h1>
            <span
              className="text-[10px] sm:text-[11px] font-bold px-1.5 py-[3px] leading-none rounded-[4px] tracking-[0.06em]"
              style={{ color: "var(--accent)", border: "1px solid var(--accent)" }}
              title="New feature"
            >
              BETA
            </span>
          </div>
          <a
            href="#method"
            className="h-7 px-2.5 inline-flex items-center gap-1.5 text-[12px] font-medium border border-[var(--border)] rounded-full hover:bg-[var(--bg-elevated)]"
            style={{ color: "var(--text-muted)" }}
            title="How we estimate"
          >
            <Info size={12} /> Estimated
          </a>
        </div>
        <ul className="mt-3 flex flex-wrap gap-1.5 sm:gap-2">
          {STEPS.map((s, i) => (
            <li
              key={s.label}
              className="h-8 pl-1 pr-3 inline-flex items-center gap-2 text-[12.5px] rounded-full"
              style={{ background: "var(--bg-surface)", border: "1px solid var(--border-subtle)", color: "var(--text-muted)" }}
            >
              <span className="w-6 h-6 grid place-items-center rounded-full" style={{ background: `var(--sq-t${i * 2 + 1})`, color: "var(--sq-on)" }}>
                {s.icon}
              </span>
              <span className="font-semibold" style={{ color: "var(--text)" }}>
                {s.label}
              </span>
              {s.value}
            </li>
          ))}
        </ul>
        <SquadsView />
      </div>
    </main>
  );
}
