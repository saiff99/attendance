import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { verifySessionToken, SESSION_COOKIE_NAME } from "@/lib/serverAuth";
import { supabaseServer } from "@/lib/supabaseServer";

interface AuditDetailsSummary {
  student_name?: string;
  student_roll?: string;
  actor_name?: string;
  actor_role?: string;
  status?: string;
  reason?: string;
  previous_status?: string;
  new_status?: string;
  lecture_hall?: string;
  subject_name?: string;
  count?: number;
  batch_size?: number;
  _lazy?: boolean;
  [key: string]: unknown;
}

/**
 * Prunes heavy JSONB audit details to a lightweight table-friendly summary (ADR-063).
 * Leaves a `_lazy: true` sentinel if extended payload properties exist, allowing
 * the UI to fetch the unpruned forensic record on-demand when inspected.
 */
function pruneAuditDetails(details: Record<string, unknown> | null): AuditDetailsSummary | null {
  if (!details || typeof details !== "object" || Array.isArray(details)) return null;

  const allowedKeys = [
    "student_name",
    "student_roll",
    "actor_name",
    "actor_role",
    "status",
    "reason",
    "previous_status",
    "new_status",
    "lecture_hall",
    "subject_name",
    "count",
    "batch_size",
  ];

  const summary: AuditDetailsSummary = {};
  let hasExtended = false;

  for (const [key, val] of Object.entries(details)) {
    if (allowedKeys.includes(key)) {
      summary[key] = val;
    } else {
      hasExtended = true;
    }
  }

  if (hasExtended) {
    summary._lazy = true;
  }

  return summary;
}

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

    const { searchParams } = new URL(request.url);

    // 2. On-demand single log lookup for lazy forensic inspection (ADR-063)
    const logId = searchParams.get("id");
    if (logId) {
      const { data, error } = await supabaseServer
        .from("audit_logs")
        .select("*")
        .eq("id", logId)
        .maybeSingle();

      if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
      }
      if (!data) {
        return NextResponse.json({ error: "Audit log not found" }, { status: 404 });
      }
      return NextResponse.json({ success: true, log: data });
    }

    // 3. Fetch logs from Supabase
    const limit = Math.min(2000, Math.max(10, parseInt(searchParams.get("limit") || "500", 10)));
    const action = searchParams.get("action");
    const targetType = searchParams.get("target_type");
    const startDate = searchParams.get("start_date");
    const endDate = searchParams.get("end_date");
    const detailsMode = searchParams.get("details") || "summary";
    const isFullDetails = detailsMode === "full" || searchParams.get("export") === "true";

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

    const rawLogs = data || [];
    const checksum = crypto
      .createHash("sha256")
      .update(JSON.stringify(rawLogs))
      .digest("hex");

    const logs = isFullDetails
      ? rawLogs
      : rawLogs.map((row) => ({
          ...row,
          details: pruneAuditDetails(row.details as Record<string, unknown> | null),
        }));

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
