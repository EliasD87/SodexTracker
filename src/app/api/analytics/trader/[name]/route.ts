import { NextRequest, NextResponse } from "next/server";
import { liveView, snapshotKey, SNAPSHOT_TTL } from "@/lib/snapshots";
import { traderProfile } from "@/lib/traderStore";

/**
 * GET /api/analytics/trader/{nickname}
 *
 * One trader's page data, by nickname only. No address or account ID is sent.
 */
export const dynamic = "force-dynamic";

export async function GET(_request: NextRequest, { params }: { params: Promise<{ name: string }> }) {
  const { name } = await params;
  try {
    return NextResponse.json(
      { code: 0, message: "success", data: await liveView(snapshotKey.trader(decodeURIComponent(name)), SNAPSHOT_TTL.trader, () => traderProfile(decodeURIComponent(name))) },
      { headers: { "Cache-Control": "public, s-maxage=30, stale-while-revalidate=120" } },
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : "Trader failed";
    return NextResponse.json({ code: 1, message }, { status: 502 });
  }
}
