import { marketPositions, positionsOverview } from "@/lib/positionStore";
import { volumeConcentration } from "@/lib/liveStore";

/**
 * Views built from more than one store. Shared by the API routes (local
 * development) and the VPS publisher (production), so both always return
 * exactly the same shape.
 */

/** The Markets table's positioning columns: coverage plus per-market totals only. */
export async function positionsMarketsView() {
  const all = await positionsOverview();
  return all.available ? { available: true as const, coverage: all.coverage, markets: all.markets } : all;
}

/** A market page's live section: who is positioned, and how concentrated trading is. */
export async function marketView(market: string) {
  const [positions, concentration] = await Promise.all([
    market.includes("/") ? Promise.resolve({ available: false as const, reason: "Spot markets have no open positions." }) : marketPositions(market),
    Promise.resolve(volumeConcentration(market)),
  ]);
  return { positions, concentration };
}
