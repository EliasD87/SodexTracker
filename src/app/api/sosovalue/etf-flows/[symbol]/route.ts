import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { getEtfFlowHistory, SosoError } from "@/lib/sosovalue";

/**
 * GET /api/sosovalue/etf-flows/[symbol]
 * Recent daily spot-ETF net-flow history for BTC/ETH/SOL — real institutional
 * positioning, contrasted against SoDEX's own retail funding/OI in the UI.
 */
export async function GET(
  _req: NextRequest,
  ctx: { params: Promise<{ symbol: string }> },
) {
  const { symbol } = await ctx.params;
  try {
    const data = await getEtfFlowHistory(symbol.toUpperCase());
    return NextResponse.json({ code: 0, message: "success", data });
  } catch (err) {
    const status = err instanceof SosoError ? err.status : 502;
    const message = err instanceof Error ? err.message : "Failed to fetch ETF flow history";
    return NextResponse.json({ code: 1, message }, { status });
  }
}
