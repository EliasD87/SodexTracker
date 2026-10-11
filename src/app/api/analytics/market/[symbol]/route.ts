import { NextRequest, NextResponse } from "next/server";
import { computeMarketHistory, WINDOWS, type WindowKey } from "@/lib/exchangeAnalytics";
import { marketFromSlug } from "@/lib/analyticsFormat";

/** GET /api/analytics/market/BTC-USD?window=30D — one market's daily history. */
export async function GET(request: NextRequest, { params }: { params: Promise<{ symbol: string }> }) {
  const { symbol: slug } = await params;
  const symbol = marketFromSlug(slug);
  const param = request.nextUrl.searchParams.get("window") ?? "30D";
  const window: WindowKey = param in WINDOWS ? (param as WindowKey) : "30D";

  try {
    const data = await computeMarketHistory(symbol, window);
    if (!data) return NextResponse.json({ code: 1, message: `No market named ${symbol}` }, { status: 404 });
    return NextResponse.json(
      { code: 0, message: "success", data },
      { headers: { "Cache-Control": "public, s-maxage=600, stale-while-revalidate=1800" } },
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to load market";
    return NextResponse.json({ code: 1, message }, { status: 502 });
  }
}
