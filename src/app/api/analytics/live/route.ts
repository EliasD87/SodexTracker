import { NextRequest, NextResponse } from "next/server";
import { liveView, snapshotKey, SNAPSHOT_TTL } from "@/lib/snapshots";
import { liveFlow, liveTraders, traderInsights } from "@/lib/liveStore";

/**
 * GET /api/analytics/live?view=flow&hours=24[&market=BTC-USD]
 * GET /api/analytics/live?view=traders
 * GET /api/analytics/live?view=insights   retention, groups, most active
 *
 * Figures built from the live collector. When there's no collector data
 * (production, until it moves to the VPS), it answers `available: false`
 * and the pages keep their "coming" panels.
 */
export const dynamic = "force-dynamic";

const HOURS = new Set([1, 6, 24, 168]);

export async function GET(request: NextRequest) {
  const q = request.nextUrl.searchParams;
  const view = q.get("view") ?? "flow";

  try {
    const hours = HOURS.has(Number(q.get("hours"))) ? Number(q.get("hours")) : 24;
    const market = q.get("market");
    const data =
      view === "traders"
        ? await liveView(snapshotKey.traders, SNAPSHOT_TTL.traders, liveTraders)
        : view === "insights"
          ? await liveView(snapshotKey.insights, SNAPSHOT_TTL.insights, traderInsights)
          : // Production publishes each market's last 24 hours, which is what market pages ask for.
            await liveView(hours === 24 ? (market ? snapshotKey.marketFlow(market) : snapshotKey.flowAll) : `flow:${hours}:${market ?? "all"}`, SNAPSHOT_TTL.marketFlow, () =>
              liveFlow(hours, market),
            );
    return NextResponse.json(
      { code: 0, message: "success", data },
      { headers: { "Cache-Control": "public, s-maxage=30, stale-while-revalidate=60" } },
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : "Live data failed";
    return NextResponse.json({ code: 1, message }, { status: 502 });
  }
}
