import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { getMacroEvents, SosoError } from "@/lib/sosovalue";

/**
 * GET /api/sosovalue/macro/upcoming?days=5
 * Macro calendar filtered to a forward-looking window. The full calendar is
 * cached upstream, but the time-window filter runs fresh on every request —
 * baking "now" into a cached payload would serve a stale window.
 */
export async function GET(req: NextRequest) {
  const days = Math.max(1, Math.min(30, Number(req.nextUrl.searchParams.get("days")) || 5));
  try {
    const all = await getMacroEvents();
    const now = Date.now();
    const horizon = now + days * 24 * 60 * 60 * 1000;
    const dayStart = now - 24 * 60 * 60 * 1000; // include events earlier "today"
    const upcoming = all
      .filter((e) => {
        const t = Date.parse(e.date);
        return !Number.isNaN(t) && t >= dayStart && t <= horizon;
      })
      .sort((a, b) => a.date.localeCompare(b.date));
    return NextResponse.json({ code: 0, message: "success", data: upcoming });
  } catch (err) {
    const status = err instanceof SosoError ? err.status : 502;
    const message = err instanceof Error ? err.message : "Failed to fetch macro calendar";
    return NextResponse.json({ code: 1, message }, { status });
  }
}
