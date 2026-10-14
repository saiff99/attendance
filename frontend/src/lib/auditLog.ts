import { supabaseServer } from "@/lib/supabaseServer";
import { getSessionFromRequest } from "@/lib/serverAuth";

export interface AuditEventParams {
  action: string;
  targetType: "student" | "attendance" | "session" | "system" | "user" | "subject";
  targetId?: string;
  details?: Record<string, any>;
  actorId?: string;
  request?: Request | any;
}

/**
 * Logs a non-blocking tamper-evident audit trail entry to the database.
 * Automatically extracts the authenticated username (Faculty, Admin, etc.) from the request session when available.
 */
export async function logAuditEvent({
  action,
  targetType,
  targetId,
  details = {},
  actorId,
  request,
}: AuditEventParams): Promise<void> {
  try {
    let resolvedActor = (actorId || "").trim();
    let clientIp: string | null = null;

    if (request) {
      try {
        const forwarded = request.headers?.get?.("x-forwarded-for") || request.headers?.get?.("cf-connecting-ip");
        if (forwarded) {
          clientIp = forwarded.split(",")[0].trim();
        }
      } catch {}

      // If actorId was omitted or is generic "admin"/"faculty", extract true username from signed session
      if (!resolvedActor || resolvedActor === "admin" || resolvedActor === "faculty") {
        try {
          const session = await getSessionFromRequest(request);
          if (session?.username) {
            resolvedActor = session.username;
            if (!details.actor_name && session.name) details.actor_name = session.name;
            if (!details.actor_role && session.role) details.actor_role = session.role;
          } else if (session?.name) {
            resolvedActor = session.name;
          }
        } catch {}
      }
    }

    // Ultimate fallback if no session or actor specified
    resolvedActor = resolvedActor || "admin";

    const payload: any = {
      action,
      target_type: targetType,
      target_id: targetId || null,
      details,
      actor_id: resolvedActor,
      created_at: new Date().toISOString(),
    };

    if (clientIp) {
      payload.ip_address = clientIp;
    }

    const { error } = await supabaseServer.from("audit_logs").insert([payload]);
    if (error) {
      console.warn("[AUDIT LOG WARNING] Failed to record audit log:", error.message);
    }
  } catch (e) {
    console.warn("[AUDIT LOG EXCEPTION]", e);
  }
}
