import { NextRequest, NextResponse } from "next/server";
import { liveView, snapshotKey, SNAPSHOT_TTL } from "@/lib/snapshots";
import { marketView } from "@/lib/views";
import { marketFromSlug } from "@/lib/analyticsFormat";

/**
 * GET /api/analytics/market/{symbol}/positions
 *
 * Who is positioned in one market (perps) and how concentrated its trading
 * is, from the live collector. Nicknames only.
 */
export const dynamic = "force-dynamic";

export async function GET(_request: NextRequest, { params }: { params: Promise<{ symbol: string }> }) {
  const market = marketFromSlug((await params).symbol);
  try {
    const data = await liveView(snapshotKey.market(market), SNAPSHOT_TTL.market, () => marketView(market));
    return NextResponse.json(
      { code: 0, message: "success", data },
      { headers: { "Cache-Control": "public, s-maxage=30, stale-while-revalidate=120" } },
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : "Market positions failed";
    return NextResponse.json({ code: 1, message }, { status: 502 });
  }
}
