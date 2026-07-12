import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const query_param = searchParams.get("query")?.toLowerCase() || "";
    const prefix = searchParams.get("prefix")?.toLowerCase() || "";
    const suffix = searchParams.get("suffix")?.toLowerCase() || "";

    if (!query_param && !prefix && !suffix) {
      return NextResponse.json({ data: [] });
    }

    if (!supabase) {
      throw new Error("Supabase client not initialized");
    }

    let query = supabase
      .from("sodex_addresses")
      .select("address, user_id")
      .limit(1500);

    if (prefix) {
      query = query.ilike("address", `${prefix}%`);
    }
    if (suffix) {
      query = query.ilike("address", `%${suffix}`);
    }
    if (query_param) {
      query = query.ilike("address", `%${query_param}%`);
    }

    const { data, error } = await query;

    if (error) {
      console.error("[REVERSE-SEARCH] Supabase error:", error);
      throw error;
    }

    return NextResponse.json({
      data: (data || []).map((item: any) => ({
        address: item.address,
        userId: item.user_id,
      })),
    });
  } catch (error) {
    console.error("[REVERSE-SEARCH] Critical error:", error);
    return NextResponse.json(
      { error: "Failed to perform reverse search" },
      { status: 500 }
    );
  }
}
