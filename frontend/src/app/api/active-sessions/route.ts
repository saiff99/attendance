import { NextResponse, NextRequest } from 'next/server';
import { supabaseServer } from '@/lib/supabaseServer';
import { fetchBackend } from '@/lib/serverBackend';
import { getTodayDateStr, getStartOfTodayISO } from '@/lib/dateUtils';
import { verifySessionToken, SESSION_COOKIE_NAME } from '@/lib/serverAuth';
import { decodeSessionMetadata } from '@/lib/geofence';
import { generateCheckinToken } from '@/lib/attendanceAuth';
import { getTrustedClientIp, checkActiveSessionsRateLimit } from '@/lib/rateLimiter';
import { getCachedUserMap, USER_MAP_TTL_MS } from '@/lib/userCache';

export { getCachedUserMap, USER_MAP_TTL_MS };
export const dynamic = 'force-dynamic';

const SESSION_CREATOR_CACHE_MAX = 500;
const sessionCreatorCache = new Map<string, string>();

export function getCachedSessionCreator(sessionId: string): string | undefined {
  return sessionCreatorCache.get(sessionId);
}

export function setCachedSessionCreator(sessionId: string, creator: string): void {
  if (sessionCreatorCache.size >= SESSION_CREATOR_CACHE_MAX) {
    const firstKey = sessionCreatorCache.keys().next().value;
    if (firstKey) sessionCreatorCache.delete(firstKey);
  }
  sessionCreatorCache.set(sessionId, creator);
}

export interface ActiveSessionItem {
  id: string;
  class_name: string;
  date?: string | null;
  start_time?: string | null;
  end_time?: string | null;
  instructor_name?: string | null;
  target_academic_year?: string | null;
  is_archived?: boolean | null;
  archived_at?: string | null;
  created_at?: string | null;
  attendance_count?: number;
  remaining_seconds?: number;
  is_expired?: boolean;
  window_duration_seconds?: number;
  checkin_token?: string | null;
  created_by?: string;
  creator_name?: string;
  created_by_name?: string;
  geofence?: Record<string, unknown> | null;
}

/**
 * Checks whether a given session object is an internal system/configuration row.
 * System configuration rows must NEVER be exposed to students or faculty as active sessions.
 */
export function isInternalSession(s: Partial<ActiveSessionItem> | Record<string, unknown> | null | undefined): boolean {
  if (!s || typeof s !== 'object') return true;
  if ('is_archived' in s && s.is_archived === true) return true;
  const name = String(s.class_name || '').trim();
  const year = String(s.target_academic_year || '').trim();
  const id = String(s.id || '').trim();
  return (
    name.startsWith('__') ||
    name.startsWith('[ARCHIVED]') ||
    name === '__SYSTEM_CONFIG__' ||
    name === '__GEOFENCE_CONFIG__' ||
    year.toLowerCase() === 'system' ||
    year.toLowerCase() === 'archived' ||
    id === '00000000-0000-0000-0000-000000000001' ||
    id === '00000000-0000-0000-0000-000000000000'
  );
}

/**
 * Helper to enrich sessions with creator info and filter according to requester's role
 */
async function processAndFilterSessions(
  rawSessions: ActiveSessionItem[],
  authUser: { role: string; username: string; name?: string; studentRoll?: string } | null
): Promise<ActiveSessionItem[]> {
  if (!rawSessions || !Array.isArray(rawSessions)) return [];

  // Filter out system config rows first
  const validSessions = rawSessions.filter((s) => !isInternalSession(s));
  if (validSessions.length === 0) return [];

  const isStaffOrAdmin = Boolean(
    authUser && ['Faculty', 'Admin', 'Super Admin'].includes(authUser.role)
  );

  // Batch query audit_logs for creators of sessions lacking [BY:...] tag.
  // CRITICAL SCALABILITY OPTIMIZATION: Student & public/unauthenticated callers never receive
  // creator identity (sanitized to 'Faculty Member' / undefined). We strictly bypass audit_logs
  // for all student and public callers to eliminate database query storms (150 -> 0 DB hits).
  const creatorMap: Record<string, string> = {};

  if (isStaffOrAdmin) {
    // Only query audit_logs for sessions that lack the embedded [BY:...] tag AND are not cached in RAM
    const missingSessionIds = validSessions
      .filter((s) => {
        const dec = decodeSessionMetadata(s.instructor_name || '');
        if (dec.facultyUsername) return false;
        const cached = sessionCreatorCache.get(s.id);
        if (cached) {
          creatorMap[s.id] = cached;
          return false;
        }
        return true;
      })
      .map((s) => s.id)
      .filter(Boolean);

    if (missingSessionIds.length > 0) {
      try {
        const { data: auditData } = await supabaseServer
          .from('audit_logs')
          .select('target_id, actor_id, details')
          .eq('action', 'START_SESSION')
          .eq('target_type', 'session')
          .in('target_id', missingSessionIds);

        if (auditData) {
          for (const row of auditData) {
            if (row.target_id) {
              const details = (row.details || {}) as Record<string, unknown>;
              const creator = row.actor_id || String(details.actor_name || details.instructor || '');
              if (creator) {
                creatorMap[row.target_id] = creator;
                setCachedSessionCreator(row.target_id, creator);
              }
            }
          }
        }
      } catch {
        // Non-blocking fallback
      }
    }
  }

  // Load user map only when staff/admin caller requires human-readable creator names
  const userMap = isStaffOrAdmin ? await getCachedUserMap() : {};

  // Enrich each session with creator info and check-in token
  const enriched: ActiveSessionItem[] = validSessions.map((s) => {
    const rawInstructor = s.instructor_name || '';
    const dec = decodeSessionMetadata(rawInstructor);
    const auditCreator = creatorMap[s.id] || '';
    const creator = dec.facultyUsername || auditCreator || '';
    const creatorClean = creator.startsWith('@') ? creator.slice(1) : creator;
    const fullName = userMap[creatorClean.toLowerCase()] || creatorClean || 'Faculty Member';

    return {
      ...s,
      checkin_token: null, // Default to null for unauthenticated safety
      created_by: creator,
      creator_name: fullName,
      created_by_name: fullName,
      geofence: (dec.geofence as unknown as Record<string, unknown>) || null,
    };
  });

  // If user is logged in as Faculty, filter to only their own sessions and include classroom checkin token
  if (authUser && authUser.role === 'Faculty') {
    const facultyUser = (authUser.username || '').trim().toLowerCase();
    const facultyName = (authUser.name || '').trim().toLowerCase();

    return enriched
      .filter((s) => {
        const cb = (s.created_by || '').trim().toLowerCase();
        const dec = decodeSessionMetadata(s.instructor_name || '');
        const byTag = (dec.facultyUsername || '').trim().toLowerCase();
        const topic = (dec.topic || '').trim().toLowerCase();

        return (
          (byTag && (byTag === facultyUser || byTag === facultyName)) ||
          (cb && (cb === facultyUser || cb === facultyName)) ||
          (topic && (topic === facultyUser || topic === facultyName))
        );
      })
      .map((s) => {
        const remSec = Number(s.remaining_seconds) || 0;
        return {
          ...s,
          checkin_token: (!s.is_expired && remSec > 0) ? generateCheckinToken(s.id, remSec) : null,
          geofence: s.geofence || null,
        };
      });
  }

  // Super Admin or Admin receives all sessions with full creator/audit information and classroom checkin token
  if (authUser && ['Super Admin', 'Admin'].includes(authUser.role)) {
    return enriched.map((s) => {
      const remSec = Number(s.remaining_seconds) || 0;
      return {
        ...s,
        checkin_token: (!s.is_expired && remSec > 0) ? generateCheckinToken(s.id, remSec) : null,
        geofence: s.geofence || null,
      };
    });
  }

  // Logged-in Students receive active sessions with roll-bound checkin token (bound to student's own roll)
  if (authUser && authUser.role === 'Student') {
    return enriched.map((s) => {
      const dec = decodeSessionMetadata(s.instructor_name || '');
      const remSec = Number(s.remaining_seconds) || 0;
      const rollBoundToken = (!s.is_expired && remSec > 0 && authUser.studentRoll)
        ? generateCheckinToken(s.id, remSec, authUser.studentRoll)
        : null;

      return {
        ...s,
        checkin_token: rollBoundToken,
        instructor_name: dec.topic || s.class_name,
        created_by: undefined,
        attendance_count: undefined,
        geofence: (dec.geofence as unknown as Record<string, unknown>) || null,
      };
    });
  }

  // Public / Unauthenticated callers: strictly minimize sensitive creator, internal faculty tags, live headcount, and zero check-in token exposure
  return enriched.map((s) => {
    const dec = decodeSessionMetadata(s.instructor_name || '');
    return {
      ...s,
      checkin_token: null, // Hidden from unauthenticated public scrapers
      instructor_name: dec.topic || 'Faculty Member',
      created_by: undefined,
      creator_name: 'Faculty Member',
      created_by_name: 'Faculty Member',
      attendance_count: undefined, // Hidden from unauthenticated public scrapers
      geofence: (dec.geofence as unknown as Record<string, unknown>) || null,
    };
  });
}

export async function GET(request: NextRequest) {
  try {
    // 1. Trusted Client IP Verification & Shared Atomic Persistent Rate Limiting (Max 30 requests/min per IP)
    const clientIp = getTrustedClientIp(request);
    const rlStatus = await checkActiveSessionsRateLimit(clientIp);
    if (!rlStatus.allowed) {
      return NextResponse.json(
        { success: false, detail: 'Too many requests. Please wait a moment.' },
        {
          status: 429,
          headers: {
            'Retry-After': String(rlStatus.remainingSeconds),
          },
        }
      );
    }

    // 2. Identify Authenticated User (if any)
    const sessionCookie = request.cookies.get(SESSION_COOKIE_NAME)?.value;
    const authUser = sessionCookie ? await verifySessionToken(sessionCookie) : null;

    // 3. Try secure backend fast-path
    try {
      const res = await fetchBackend('/api/active-sessions', {
        headers: { 'ngrok-skip-browser-warning': '69420' },
        cache: 'no-store',
        next: { revalidate: 0 },
      });
      if (res.ok) {
        const data = await res.json();
        if (data && data.sessions && Array.isArray(data.sessions)) {
          const processed = await processAndFilterSessions(data.sessions as ActiveSessionItem[], authUser);
          return NextResponse.json({ ...data, sessions: processed });
        }
      }
    } catch {
      // Backend offline or unreachable, fall back to Supabase
    }

    // 4. Query Supabase directly with strict exclusion of internal system rows
    const todayStr = getTodayDateStr();
    const startOfTodayIso = getStartOfTodayISO();

    const { data: sessionData, error } = await supabaseServer
      .from('sessions')
      .select('id, class_name, date, start_time, end_time, instructor_name, target_academic_year, is_archived, archived_at, created_at')
      .neq('class_name', '__SYSTEM_CONFIG__')
      .neq('class_name', '__GEOFENCE_CONFIG__')
      .neq('id', '00000000-0000-0000-0000-000000000001')
      .neq('id', '00000000-0000-0000-0000-000000000000')
      .neq('target_academic_year', 'System')
      .order('created_at', { ascending: false })
      .limit(50);

    if (error) {
      return NextResponse.json({ success: false, error: error.message, sessions: [] }, { status: 500 });
    }

    // Filter strictly for today's non-internal sessions
    const typedSessionData = (sessionData || []) as unknown as ActiveSessionItem[];
    const todaySessions = typedSessionData.filter((s) => {
      if (isInternalSession(s)) return false;
      const dateVal = s.date || '';
      const createdVal = s.created_at || '';
      return dateVal === todayStr || createdVal.startsWith(todayStr) || createdVal >= startOfTodayIso;
    });

    // Query exact attendance records for all sessions today.
    // OPTIMIZATION: Only fetch live headcounts for authenticated Staff/Admin.
    // Students & public callers have attendance_count sanitized to undefined, so querying attendance is skipped.
    const sessionIds = todaySessions.map((s) => s.id);
    const attendanceMap: Record<string, number> = {};

    const isStaffOrAdminFallback = Boolean(
      authUser && ['Faculty', 'Admin', 'Super Admin'].includes(authUser.role)
    );

    if (isStaffOrAdminFallback && sessionIds.length > 0) {
      const { data: attData } = await supabaseServer
        .from('attendance')
        .select('session_id')
        .in('session_id', sessionIds);

      if (attData) {
        attData.forEach((att: { session_id?: string | null }) => {
          if (att.session_id) {
            attendanceMap[att.session_id] = (attendanceMap[att.session_id] || 0) + 1;
          }
        });
      }
    }

    const nowUtc = Date.now();
    const sessions: ActiveSessionItem[] = todaySessions.map((s) => {
      const timeStr = s.start_time || s.created_at;
      let remainingSeconds = 0;
      let isExpired = true;
      if (timeStr) {
        const startMs = new Date(timeStr).getTime();
        const elapsedSec = Math.floor((nowUtc - startMs) / 1000);
        remainingSeconds = Math.max(0, 300 - elapsedSec);
        isExpired = remainingSeconds <= 0;
      }
      return {
        id: s.id,
        class_name: s.class_name,
        date: s.date,
        start_time: s.start_time,
        end_time: s.end_time,
        instructor_name: s.instructor_name,
        target_academic_year: s.target_academic_year,
        created_at: s.created_at,
        attendance_count: attendanceMap[s.id] || 0,
        remaining_seconds: remainingSeconds,
        is_expired: isExpired,
        window_duration_seconds: 300,
      };
    });

    const processed = await processAndFilterSessions(sessions, authUser);
    return NextResponse.json({ success: true, sessions: processed });
  } catch (err: unknown) {
    const errMsg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ success: false, error: errMsg, sessions: [] }, { status: 500 });
  }
}
