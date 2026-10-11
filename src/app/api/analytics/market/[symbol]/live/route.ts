import { NextResponse } from "next/server";
import { getLiveMarket } from "@/lib/marketLive";
import { marketFromSlug } from "@/lib/analyticsFormat";

/** GET /api/analytics/market/BTC-USD/live — ticker, slippage and depth now. */
export async function GET(_request: Request, { params }: { params: Promise<{ symbol: string }> }) {
  const { symbol: slug } = await params;
  const symbol = marketFromSlug(slug);

  try {
    const data = await getLiveMarket(symbol);
    if (!data) return NextResponse.json({ code: 1, message: `No market named ${symbol}` }, { status: 404 });
    return NextResponse.json(
      { code: 0, message: "success", data },
      { headers: { "Cache-Control": "public, s-maxage=15, stale-while-revalidate=30" } },
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to load market";
    return NextResponse.json({ code: 1, message }, { status: 502 });
  }
}
