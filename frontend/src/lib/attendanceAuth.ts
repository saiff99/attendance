import { supabaseServer } from '@/lib/supabaseServer';
import { decodeSessionMetadata } from '@/lib/geofence';

export const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function isValidUuid(id: unknown): id is string {
  return typeof id === 'string' && UUID_REGEX.test(id.trim());
}

export const ALLOWED_ATTENDANCE_STATUSES = ['Present', 'Absent'] as const;
export type AllowedAttendanceStatus = typeof ALLOWED_ATTENDANCE_STATUSES[number];

export const ALLOWED_CAPTURE_MODES = [
  'Live Scan',
  'Manual Upload',
  'Selfie Scan',
  'Manual Entry',
  'Selfie Check-in'
] as const;
export type AllowedCaptureMode = typeof ALLOWED_CAPTURE_MODES[number];

export interface ValidatedMarkAttendanceInput {
  session_id: string;
  student_id: string;
  status: AllowedAttendanceStatus;
  capture_mode: AllowedCaptureMode;
  confidence_score: number;
  reason?: string;
  client_recorded_at?: string;
}

/**
 * Strict schema validation for attendance marking requests
 */
export function validateMarkAttendanceInput(body: unknown): {
  valid: true;
  data: ValidatedMarkAttendanceInput;
} | {
  valid: false;
  error: string;
} {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return { valid: false, error: 'Malformed request body. JSON object expected.' };
  }

  const b = body as Record<string, unknown>;

  // 1. session_id validation
  if (!b.session_id) {
    return { valid: false, error: 'session_id is required.' };
  }
  if (!isValidUuid(b.session_id)) {
    return { valid: false, error: 'Invalid session_id format. Must be a valid UUID.' };
  }

  // 2. student_id validation
  if (!b.student_id) {
    return { valid: false, error: 'student_id is required.' };
  }
  if (!isValidUuid(b.student_id)) {
    return { valid: false, error: 'Invalid student_id format. Must be a valid UUID.' };
  }

  // 3. status validation (Allowlist: Present, Absent)
  let status: AllowedAttendanceStatus = 'Present';
  if (b.status !== undefined && b.status !== null) {
    const rawStatus = String(b.status).trim();
    if (!ALLOWED_ATTENDANCE_STATUSES.includes(rawStatus as AllowedAttendanceStatus)) {
      return {
        valid: false,
        error: `Invalid status '${b.status}'. Allowed values are: ${ALLOWED_ATTENDANCE_STATUSES.join(', ')}.`
      };
    }
    status = rawStatus as AllowedAttendanceStatus;
  }

  // 4. capture_mode validation
  let capture_mode: AllowedCaptureMode = 'Manual Entry';
  if (b.capture_mode !== undefined && b.capture_mode !== null) {
    const rawMode = String(b.capture_mode).trim();
    if (!ALLOWED_CAPTURE_MODES.includes(rawMode as AllowedCaptureMode)) {
      return {
        valid: false,
        error: `Invalid capture_mode '${b.capture_mode}'. Allowed values: ${ALLOWED_CAPTURE_MODES.join(', ')}.`
      };
    }
    capture_mode = rawMode as AllowedCaptureMode;
  }

  // 5. confidence_score validation (Must be numeric and between 0.0 and 1.0)
  let confidence_score = 1.0;
  if (b.confidence_score !== undefined && b.confidence_score !== null) {
    const scoreNum = Number(b.confidence_score);
    if (typeof b.confidence_score !== 'number' || isNaN(scoreNum) || scoreNum < 0.0 || scoreNum > 1.0) {
      return {
        valid: false,
        error: `Invalid confidence_score '${b.confidence_score}'. Must be a valid number between 0.0 and 1.0.`
      };
    }
    confidence_score = Math.round(scoreNum * 10000) / 10000;
  }

  // 6. reason (Optional string, trimmed)
  const reason = typeof b.reason === 'string' && b.reason.trim() ? b.reason.trim().slice(0, 500) : undefined;

  // 7. client timestamp (Optional string, will be audited/clamped on server)
  const client_recorded_at = typeof b.recorded_at === 'string' && b.recorded_at.trim() ? b.recorded_at.trim() : undefined;

  return {
    valid: true,
    data: {
      session_id: (b.session_id as string).trim(),
      student_id: (b.student_id as string).trim(),
      status,
      capture_mode,
      confidence_score,
      reason,
      client_recorded_at,
    }
  };
}

/**
 * Validates whether the authenticated user has authorization to modify/view the target session
 */
export async function isFacultyAuthorizedForSession(
  sessionUser: { role: string; username: string; name?: string },
  sessionData: { id: string; instructor_name?: string | null; class_name?: string }
): Promise<boolean> {
  // 1. Super Admin is omnipotent across all sessions
  if (sessionUser.role === 'Super Admin') return true;

  // 2. Only Faculty can access faculty-authorized actions
  if (sessionUser.role !== 'Faculty') return false;

  const rawInstructor = (sessionData.instructor_name || '').trim();
  const userName = (sessionUser.name || '').trim().toLowerCase();
  const userUsername = (sessionUser.username || '').trim().toLowerCase();

  // Check if instructor_name matches directly
  if (rawInstructor) {
    const { topic, facultyUsername } = decodeSessionMetadata(rawInstructor);
    if (
      (facultyUsername && (facultyUsername.toLowerCase() === userUsername || facultyUsername.toLowerCase() === userName)) ||
      (userUsername && topic.toLowerCase() === userUsername) ||
      (userName && topic.toLowerCase() === userName) ||
      (userUsername && topic.toLowerCase().includes(userUsername)) ||
      (userName && topic.toLowerCase().includes(userName))
    ) {
      return true;
    }
  }

  // Check audit_logs to see if this faculty started/created the session
  const { data: auditRecord } = await supabaseServer
    .from('audit_logs')
    .select('actor_id, details')
    .eq('target_type', 'session')
    .eq('target_id', sessionData.id)
    .eq('action', 'START_SESSION')
    .maybeSingle();

  if (auditRecord) {
    const actor = (auditRecord.actor_id || '').toLowerCase();
    const details = (auditRecord.details || {}) as Record<string, any>;
    const actorName = (details.actor_name || details.instructor || '').toLowerCase();

    if (
      (userUsername && actor === userUsername) ||
      (userName && actor === userName) ||
      (userName && actorName === userName) ||
      (userUsername && actorName === userUsername)
    ) {
      return true;
    }
  }

  return false;
}
