import { NextResponse } from "next/server";
import { liveView, snapshotKey, SNAPSHOT_TTL } from "@/lib/snapshots";
import { collectorHealth, healthStatus, type CollectorHealth } from "@/lib/liveStore";

/**
 * GET /api/analytics/health
 *
 * Whether the live figures are current. Judged here against the server's own
 * clock, so a collector or publisher that stops entirely still shows as
 * paused: its last heartbeat simply gets older.
 */
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const h = await liveView(snapshotKey.health, SNAPSHOT_TTL.health, collectorHealth);
    const status = h.available ? healthStatus(h as CollectorHealth) : { state: "offline" as const, since: null, message: null };
    return NextResponse.json(
      { code: 0, message: "success", data: { ...h, status } },
      { headers: { "Cache-Control": "public, s-maxage=30, stale-while-revalidate=60" } },
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : "Health failed";
    return NextResponse.json({ code: 1, message }, { status: 502 });
  }
}
