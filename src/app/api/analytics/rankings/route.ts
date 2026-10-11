import { NextRequest, NextResponse } from "next/server";
import { liveView, snapshotKey, SNAPSHOT_TTL } from "@/lib/snapshots";
import { rankings } from "@/lib/rankingStore";

/**
 * GET /api/analytics/rankings?days=7
 *
 * Rankings from the collector's data, under nicknames only. `days` scopes the
 * deposit and withdrawal boards (1, 7 or 30).
 */
export const dynamic = "force-dynamic";

const DAYS = new Set([1, 7, 30]);

export async function GET(request: NextRequest) {
  const raw = Number(request.nextUrl.searchParams.get("days"));
  const days = DAYS.has(raw) ? raw : 7;
  try {
    return NextResponse.json(
      { code: 0, message: "success", data: await liveView(snapshotKey.rankings(days), SNAPSHOT_TTL.rankings, () => rankings(days)) },
      { headers: { "Cache-Control": "public, s-maxage=60, stale-while-revalidate=300" } },
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : "Rankings failed";
    return NextResponse.json({ code: 1, message }, { status: 502 });
  }
}
