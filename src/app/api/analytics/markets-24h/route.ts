import { NextResponse } from "next/server";
import { getMarkets24h } from "@/lib/marketLive";

/** GET /api/analytics/markets-24h — every market's rolling last 24 hours, live. */
export async function GET() {
  try {
    const data = await getMarkets24h();
    if (!data.markets.length) return NextResponse.json({ code: 1, message: "SoDEX's live prices are unavailable right now" }, { status: 502 });
    return NextResponse.json(
      { code: 0, message: "success", data },
      { headers: { "Cache-Control": "public, s-maxage=30, stale-while-revalidate=60" } },
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to load markets";
    return NextResponse.json({ code: 1, message }, { status: 502 });
  }
}
