import { supabaseServer } from "@/lib/supabaseServer";

export interface AuditEventParams {
  action: string;
  targetType: "student" | "attendance" | "session" | "system";
  targetId?: string;
  details?: Record<string, any>;
  actorId?: string;
}

/**
 * Logs a non-blocking audit trail entry to the database.
 * Used for tracking biometric modifications, manual attendance overrides, deletions, and config changes.
 */
export async function logAuditEvent({
  action,
  targetType,
  targetId,
  details = {},
  actorId = "admin",
}: AuditEventParams): Promise<void> {
  try {
    const payload = {
      action,
      target_type: targetType,
      target_id: targetId || null,
      details,
      actor_id: actorId,
      created_at: new Date().toISOString(),
    };

    const { error } = await supabaseServer.from("audit_logs").insert([payload]);
    if (error) {
      console.warn("[AUDIT LOG WARNING] Failed to record audit log:", error.message);
    }
  } catch (e) {
    console.warn("[AUDIT LOG EXCEPTION]", e);
  }
}
