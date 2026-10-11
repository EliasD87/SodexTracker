import { NextRequest, NextResponse } from "next/server";

/**
 * GET /api/wealth?address=0x…   one wallet's SoDEX Wealth holdings, PnL and history
 * GET /api/wealth?view=funds     every Wealth product with its price and yield
 *
 * SoDEX's Wealth API (wealth.sodex.dev) answers publicly per wallet but only
 * allows sodex.com in the browser, so the site reads it through here. Each
 * wallet costs one request from the browser instead of three, and the CDN
 * shares answers between visitors for a minute.
 */

const WEALTH = "https://wealth.sodex.dev/api/v1/wealth";
const ADDRESS = /^0x[0-9a-fA-F]{40}$/;

async function get<T>(path: string): Promise<T | null> {
  try {
    const res = await fetch(`${WEALTH}${path}`, { signal: AbortSignal.timeout(10_000), next: { revalidate: 60 } });
    if (!res.ok) return null;
    const json = (await res.json()) as { code: number; data: T };
    return json.code === 0 ? json.data : null;
  } catch {
    return null;
  }
}

const headers = { "Cache-Control": "public, s-maxage=60, stale-while-revalidate=300" };

export async function GET(request: NextRequest) {
  const q = request.nextUrl.searchParams;

  if (q.get("view") === "funds") {
    const [funds, markets] = await Promise.all([get<unknown[]>("/funds"), get<{ quotes: unknown[] }>("/markets")]);
    if (!funds) return NextResponse.json({ code: 1, message: "SoDEX Wealth didn't answer" }, { status: 502 });
    return NextResponse.json({ code: 0, data: { funds, quotes: markets?.quotes ?? [] } }, { headers });
  }

  const address = q.get("address") ?? "";
  if (!ADDRESS.test(address)) return NextResponse.json({ code: 1, message: "Not a wallet address" }, { status: 400 });

  const a = encodeURIComponent(address.toLowerCase());
  const [pnl, positions, history, orders] = await Promise.all([
    get(`/users/${a}/pnl`),
    get(`/users/${a}/positions`),
    get(`/users/${a}/pnl-history?range=1M&interval=1d`),
    get(`/users/${a}/orders`),
  ]);
  if (!pnl && !positions) return NextResponse.json({ code: 1, message: "SoDEX Wealth didn't answer" }, { status: 502 });
  return NextResponse.json({ code: 0, data: { pnl, positions, history, orders } }, { headers });
}
