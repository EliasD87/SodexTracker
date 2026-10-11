import { NextResponse } from "next/server";
import { liveView, snapshotKey, SNAPSHOT_TTL } from "@/lib/snapshots";
import { riskData } from "@/lib/riskStore";

/**
 * GET /api/analytics/risk
 *
 * Likely liquidations and mark-vs-index stretch from the collector. Nicknames
 * only; no address or account ID is sent.
 */
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    return NextResponse.json(
      { code: 0, message: "success", data: await liveView(snapshotKey.risk, SNAPSHOT_TTL.risk, () => riskData(48)) },
      { headers: { "Cache-Control": "public, s-maxage=30, stale-while-revalidate=120" } },
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : "Risk data failed";
    return NextResponse.json({ code: 1, message }, { status: 502 });
  }
}
