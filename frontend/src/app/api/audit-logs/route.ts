import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { verifySessionToken, SESSION_COOKIE_NAME } from "@/lib/serverAuth";
import { supabaseServer } from "@/lib/supabaseServer";

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
    const limit = Math.min(2000, Math.max(10, parseInt(searchParams.get("limit") || "500", 10)));
    const action = searchParams.get("action");
    const targetType = searchParams.get("target_type");
    const startDate = searchParams.get("start_date");
    const endDate = searchParams.get("end_date");

    let query = supabaseServer
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

    if (startDate) {
      const startIso = startDate.includes("T") ? startDate : `${startDate}T00:00:00.000Z`;
      query = query.gte("created_at", startIso);
    }

    if (endDate) {
      const endIso = endDate.includes("T") ? endDate : `${endDate}T23:59:59.999Z`;
      query = query.lte("created_at", endIso);
    }

    const { data, error } = await query;

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const logs = data || [];
    const checksum = crypto
      .createHash("sha256")
      .update(JSON.stringify(logs))
      .digest("hex");

    return NextResponse.json({
      success: true,
      logs,
      count: logs.length,
      checksum,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Internal server error";
    return NextResponse.json(
      { error: message },
      { status: 500 }
    );
  }
}
