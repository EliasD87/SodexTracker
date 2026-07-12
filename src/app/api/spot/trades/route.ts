import { NextRequest, NextResponse } from "next/server";

const UPSTREAM = "https://mainnet-data.sodex.dev/api/v1/spot/trades";

async function fetchWithRetry(url: string, maxRetries = 3): Promise<Response> {
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    const res = await fetch(url);
    if (res.status === 429 || res.status === 503) {
      if (attempt < maxRetries) {
        await new Promise((r) => setTimeout(r, 2000));
        continue;
      }
    }
    return res;
  }
  throw new Error("Max retries exceeded");
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const account_id = searchParams.get("account_id");
  const cursor = searchParams.get("cursor");
  const limit = searchParams.get("limit") || "200";

  if (!account_id) {
    return NextResponse.json({ code: 1, message: "account_id is required" }, { status: 400 });
  }

  const params = new URLSearchParams({ account_id, limit });
  if (cursor) params.set("cursor", cursor);

  try {
    const res = await fetchWithRetry(`${UPSTREAM}?${params.toString()}`);
    const data = await res.json();

    if (data.code === 0 && data.data?.length >= Number(limit) && !data.meta?.next_cursor) {
      const trades = data.data;
      const last = trades[trades.length - 1];
      if (last && last.ts_ms && last.trade_id && last.symbol_id) {
        if (!data.meta) data.meta = {};
        data.meta.next_cursor = Buffer.from(
          `${last.ts_ms},${last.trade_id},${last.symbol_id}`
        ).toString("base64");
      }
    }

    return NextResponse.json(data);
  } catch {
    return NextResponse.json({ code: 1, message: "Failed to fetch spot trades" }, { status: 502 });
  }
}
