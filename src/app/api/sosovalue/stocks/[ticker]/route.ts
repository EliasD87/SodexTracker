import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { getStockXray, SosoError } from "@/lib/sosovalue";

/**
 * GET /api/sosovalue/stocks/[ticker]
 * Fundamentals for a SoDEX-tokenised stock perp: market status (open/closed),
 * P/E, P/B, market cap, and BTC-treasury holdings when applicable (e.g. MSTR).
 */
export async function GET(
  _req: NextRequest,
  ctx: { params: Promise<{ ticker: string }> },
) {
  const { ticker } = await ctx.params;
  try {
    const data = await getStockXray(ticker);
    return NextResponse.json({ code: 0, message: "success", data });
  } catch (err) {
    const status = err instanceof SosoError ? err.status : 502;
    const message = err instanceof Error ? err.message : "Failed to fetch stock fundamentals";
    return NextResponse.json({ code: 1, message }, { status });
  }
}
