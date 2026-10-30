import type { SquadTier } from "@/lib/squadStore";
import { boostColor, plus } from "./track";

/** A boost as a small pill in its tier's colour. */
export function TierPill({ boost, tiers, className = "" }: { boost: number; tiers: SquadTier[]; className?: string }) {
  return (
    <span
      className={`inline-flex items-center px-1.5 py-[2px] text-[10.5px] font-semibold leading-none mono whitespace-nowrap ${className}`}
      style={{ borderRadius: 4, background: boostColor(boost, tiers), color: "var(--sq-on)" }}
    >
      {plus(boost)}
    </span>
  );
}

/**
 * The searched wallet's two squads, marked the same way on the track, the
 * standings and the cards: Joined solid amber, Built outlined amber.
 */
export function SquadTag({ kind, dashed }: { kind: "joined" | "built"; dashed?: boolean }) {
  const solid = kind === "joined" && !dashed;
  return (
    <span
      className="inline-flex items-center px-1.5 py-[3px] text-[10.5px] font-semibold leading-none whitespace-nowrap shrink-0"
      style={{
        borderRadius: 5,
        background: solid ? "var(--sq-you)" : "transparent",
        color: solid ? "var(--sq-on)" : "var(--sq-you)",
        border: solid ? "1px solid var(--sq-you)" : `1px ${dashed ? "dashed" : "solid"} var(--sq-you)`,
      }}
    >
      {kind === "joined" ? "Joined" : "Built"}
    </span>
  );
}
