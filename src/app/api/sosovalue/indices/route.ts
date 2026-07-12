import { NextResponse } from "next/server";
import { getIndexOverview, SosoError } from "@/lib/sosovalue";

/**
 * GET /api/sosovalue/indices
 * All SoSoValue sector indices with snapshots, flagged for SoDEX tradeability.
 * Server-side proxy — keeps the SoSoValue key off the client. Cached upstream.
 */
export async function GET() {
  try {
    const data = await getIndexOverview();
    return NextResponse.json({ code: 0, message: "success", data });
  } catch (err) {
    const status = err instanceof SosoError ? err.status : 502;
    const message = err instanceof Error ? err.message : "Failed to fetch indices";
    return NextResponse.json({ code: 1, message }, { status });
  }
}
