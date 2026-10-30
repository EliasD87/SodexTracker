import { NextResponse } from "next/server";
import { marketNamesById } from "@/lib/marketIds";

/** SoDEX's stats feed keys markets "ID_n"; this maps them back to names for the browser. */
export async function GET() {
  return NextResponse.json(await marketNamesById(), { headers: { "Cache-Control": "public, s-maxage=3600, stale-while-revalidate=86400" } });
}
