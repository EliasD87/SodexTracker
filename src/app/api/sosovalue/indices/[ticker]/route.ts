import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { getIndexSnapshot, getIndexConstituents, SosoError } from "@/lib/sosovalue";

/**
 * GET /api/sosovalue/indices/[ticker]
 * Full Index X-ray: snapshot + constituents (with live price & daily
 * contribution).
 *
 * Deliberately NO SoDEX-vs-NAV price comparison here: the SoSoValue snapshot
 * can be ≤15m stale while SoDEX quotes are live, so any cross-source
 * "premium/divergence" would be fabricated by the time gap.
 */
export async function GET(
  _req: NextRequest,
  ctx: { params: Promise<{ ticker: string }> },
) {
  const { ticker } = await ctx.params;
  try {
    const [snapshot, constituents] = await Promise.all([
      getIndexSnapshot(ticker),
      getIndexConstituents(ticker),
    ]);
    return NextResponse.json({
      code: 0,
      message: "success",
      data: { ticker, snapshot, constituents },
    });
  } catch (err) {
    const status = err instanceof SosoError ? err.status : 502;
    const message = err instanceof Error ? err.message : "Failed to fetch index";
    return NextResponse.json({ code: 1, message }, { status });
  }
}
