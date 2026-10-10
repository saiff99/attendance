import { NextRequest, NextResponse } from "next/server";
import { verifySessionToken, SESSION_COOKIE_NAME } from "@/lib/serverAuth";
import { supabase } from "@/lib/supabase";

export async function GET(request: NextRequest) {
  try {
    // 1. Verify that caller is logged in and has Super Admin role
    const sessionToken = request.cookies.get(SESSION_COOKIE_NAME)?.value;
    const user = sessionToken ? await verifySessionToken(sessionToken) : null;

    if (!user || user.role !== "Super Admin") {
      return NextResponse.json(
        { error: "Forbidden: Only Super Admin can access audit logs." },
        { status: 403 }
      );
    }

    // 2. Fetch logs from Supabase
    const { searchParams } = new URL(request.url);
    const limit = Math.min(200, Math.max(10, parseInt(searchParams.get("limit") || "100", 10)));
    const action = searchParams.get("action");
    const targetType = searchParams.get("target_type");

    let query = supabase
      .from("audit_logs")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(limit);

    if (action && action !== "all") {
      query = query.eq("action", action);
    }

    if (targetType && targetType !== "all") {
      query = query.eq("target_type", targetType);
    }

    const { data, error } = await query;

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      logs: data || [],
      count: (data || []).length,
    });
  } catch (err: any) {
    return NextResponse.json(
      { error: err.message || "Internal server error" },
      { status: 500 }
    );
  }
}
