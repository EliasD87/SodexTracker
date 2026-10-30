import { NextResponse } from "next/server";
import { liveView, snapshotKey, SNAPSHOT_TTL } from "@/lib/snapshots";
import { squadsOverview } from "@/lib/squadStore";
import { SQUADS_LIVE } from "@/lib/features";

/**
 * GET /api/analytics/squads
 *
 * SoPoints squads: the season's week and boost tiers, totals, and the
 * biggest squads by estimated Energy. Published hourly by the VPS.
 */
export const dynamic = "force-dynamic";

export async function GET() {
  if (!SQUADS_LIVE) return NextResponse.json({ code: 1, message: "Not found" }, { status: 404 });
  try {
    return NextResponse.json(
      { code: 0, message: "success", data: await liveView(snapshotKey.squads, SNAPSHOT_TTL.squads, () => squadsOverview()) },
      { headers: { "Cache-Control": "public, s-maxage=300, stale-while-revalidate=900" } },
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : "Squads failed";
    return NextResponse.json({ code: 1, message }, { status: 502 });
  }
}
