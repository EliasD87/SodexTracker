import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { getPairIntel, SosoError } from "@/lib/sosovalue";

/**
 * GET /api/sosovalue/pair-intel/[base]
 * Global market context (SoSoValue) for one SoDEX base coin — snapshot with
 * cycle/valuation data plus ~35d of daily klines. The client crosses this
 * against SoDEX's own live venue data (mark/funding/OI/volume).
 */
export async function GET(
  req: NextRequest,
  ctx: { params: Promise<{ base: string }> },
) {
  const { base } = await ctx.params;
  // ?lite=1 → snapshot only (no klines): used by the multi-pair board so a
  // cold load stays inside SoSoValue's 20 req/min ceiling.
  const lite = req.nextUrl.searchParams.get("lite") === "1";
  try {
    const data = await getPairIntel(base, !lite);
    if (!data) {
      return NextResponse.json(
        { code: 1, message: "No global market data for this pair" },
        { status: 404 },
      );
    }
    return NextResponse.json({ code: 0, message: "success", data });
  } catch (err) {
    const status = err instanceof SosoError ? err.status : 502;
    const message = err instanceof Error ? err.message : "Failed to fetch pair intelligence";
    return NextResponse.json({ code: 1, message }, { status });
  }
}
