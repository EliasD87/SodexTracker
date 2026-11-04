import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { SQUADS_LIVE } from "@/lib/features";
import { Info } from "lucide-react";
import { Navbar } from "@/components/Navbar";
import { SquadsView } from "@/components/analytics/SquadsView";
import { SQUAD_CSS } from "@/components/squads/track";

export const metadata: Metadata = {
  title: "Squads — SoDEX Tracker",
  description: "SoPoints squads on SoDEX: find any wallet's squads, their estimated Energy and boost, and the biggest squads this season.",
};

export default function Squads() {
  if (!SQUADS_LIVE) notFound();
  return (
    <main>
      <Navbar />
      <style>{SQUAD_CSS}</style>
      <div className="sq max-w-[1240px] mx-auto px-4 sm:px-6 pt-[76px] sm:pt-[96px] pb-20">
        <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
          <h1 className="text-[26px] sm:text-[34px] font-semibold leading-none" style={{ color: "var(--text)", letterSpacing: "-0.03em" }}>
            Squads
          </h1>
          <a
            href="#method"
            className="h-7 px-2.5 inline-flex items-center gap-1.5 text-[12px] font-medium border border-[var(--border)] rounded-full hover:bg-[var(--bg-elevated)]"
            style={{ color: "var(--text-muted)" }}
            title="How we estimate"
          >
            <Info size={12} /> Estimated
          </a>
        </div>
        <SquadsView />
      </div>
    </main>
  );
}
