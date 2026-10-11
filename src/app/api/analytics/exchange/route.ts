import { NextRequest, NextResponse } from "next/server";
import { computeExchangeAnalytics, WINDOWS, type WindowKey } from "@/lib/exchangeAnalytics";

/**
 * GET /api/analytics/exchange?window=30D
 *
 * Exchange-wide analytics, computed here so the browser receives a few KB of
 * finished figures instead of ~3 MB of raw per-market history.
 *
 * The upstream data is daily, so the CDN may hold a response for ten minutes
 * and serve it stale for a further half hour while it refreshes.
 */
export async function GET(request: NextRequest) {
  const param = request.nextUrl.searchParams.get("window") ?? "30D";
  const window: WindowKey = param in WINDOWS ? (param as WindowKey) : "30D";

  try {
    const data = await computeExchangeAnalytics(window);
    if (!data.sources.volume) {
      return NextResponse.json({ code: 1, message: "SoDEX stats are unavailable right now" }, { status: 502 });
    }
    return NextResponse.json(
      { code: 0, message: "success", data },
      { headers: { "Cache-Control": "public, s-maxage=600, stale-while-revalidate=1800" } },
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to compute analytics";
    return NextResponse.json({ code: 1, message }, { status: 502 });
  }
}
