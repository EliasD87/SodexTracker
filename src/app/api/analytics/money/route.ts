import { NextRequest, NextResponse } from "next/server";
import { liveView, snapshotKey, SNAPSHOT_TTL } from "@/lib/snapshots";
import { moneyFlow } from "@/lib/moneyStore";
import { WINDOWS, type WindowKey } from "@/lib/exchangeAnalytics";

/**
 * GET /api/analytics/money?window=30D
 *
 * Deposits and withdrawals from the collector's ledger reads. Totals only:
 * no account, address or transaction ever leaves the server.
 */
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const raw = request.nextUrl.searchParams.get("window") ?? "30D";
  const days = WINDOWS[(raw in WINDOWS ? raw : "30D") as WindowKey];
  try {
    return NextResponse.json(
      { code: 0, message: "success", data: await liveView(snapshotKey.money(days), SNAPSHOT_TTL.money, () => moneyFlow(days)) },
      { headers: { "Cache-Control": "public, s-maxage=120, stale-while-revalidate=600" } },
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : "Money flow failed";
    return NextResponse.json({ code: 1, message }, { status: 502 });
  }
}
