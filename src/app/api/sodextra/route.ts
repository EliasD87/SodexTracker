import { NextResponse } from "next/server";

/**
 * GET /api/sodextra — what Sodextra's bots have traded so far, from sodextra.xyz's own
 * public total. Read here rather than in the browser (that site doesn't allow other
 * sites to read it), and held five minutes.
 */
export async function GET() {
  try {
    const res = await fetch("https://sodextra.xyz/api/stats/volume", { headers: { Accept: "application/json" }, next: { revalidate: 300 } });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const json = (await res.json()) as { volume?: number; fills?: number };
    if (typeof json.volume !== "number") throw new Error("No volume");
    return NextResponse.json(
      { code: 0, message: "success", data: { volume: json.volume, fills: json.fills ?? null } },
      { headers: { "Cache-Control": "public, s-maxage=300, stale-while-revalidate=600" } },
    );
  } catch (err) {
    return NextResponse.json({ code: 1, message: err instanceof Error ? err.message : "Unavailable" }, { status: 502 });
  }
}
