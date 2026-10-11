import { NextRequest, NextResponse } from "next/server";
import { liveView, snapshotKey, SNAPSHOT_TTL } from "@/lib/snapshots";
import { positionsMarketsView } from "@/lib/views";
import { positionsOverview } from "@/lib/positionStore";

/**
 * GET /api/analytics/positions
 * GET /api/analytics/positions?view=markets   per-market positioning only
 *
 * Open positions across SoDEX by group, valued at live marks. Nicknames only:
 * no address or account ID is ever sent.
 */
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    const data =
      request.nextUrl.searchParams.get("view") === "markets"
        ? await liveView(snapshotKey.positionsMarkets, SNAPSHOT_TTL.positions, positionsMarketsView)
        : await liveView(snapshotKey.positions, SNAPSHOT_TTL.positions, positionsOverview);
    return NextResponse.json(
      { code: 0, message: "success", data },
      { headers: { "Cache-Control": "public, s-maxage=30, stale-while-revalidate=120" } },
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : "Positions failed";
    return NextResponse.json({ code: 1, message }, { status: 502 });
  }
}
