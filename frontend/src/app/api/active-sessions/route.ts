import { NextResponse, NextRequest } from 'next/server';
import { supabaseServer } from '@/lib/supabaseServer';
import { fetchBackend } from '@/lib/serverBackend';
import { getTodayDateStr, getStartOfTodayISO } from '@/lib/dateUtils';
import { verifySessionToken, SESSION_COOKIE_NAME } from '@/lib/serverAuth';
import { decodeSessionMetadata } from '@/lib/geofence';

export const dynamic = 'force-dynamic';

// Rate Limiter for active sessions list: {clientIp: [timestamp, ...]}
const activeSessionsRateLimits: Record<string, number[]> = {};

/**
 * Checks whether a given session object is an internal system/configuration row.
 * System configuration rows must NEVER be exposed to students or faculty as active sessions.
 */
export function isInternalSession(s: any): boolean {
  if (!s || typeof s !== 'object') return true;
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
  rawSessions: any[],
  authUser: { role: string; username: string; name?: string } | null
): Promise<any[]> {
  if (!rawSessions || !Array.isArray(rawSessions)) return [];

  // Filter out system config rows first
  const validSessions = rawSessions.filter((s: any) => !isInternalSession(s));
  if (validSessions.length === 0) return [];

  const sessionIds = validSessions.map((s: any) => s.id).filter(Boolean);

  // Batch query audit_logs for creators of sessions lacking [BY:...] tag
  const creatorMap: Record<string, string> = {};
  if (sessionIds.length > 0) {
    try {
      const { data: auditData } = await supabaseServer
        .from('audit_logs')
        .select('target_id, actor_id, details')
        .eq('action', 'START_SESSION')
        .eq('target_type', 'session')
        .in('target_id', sessionIds);

      if (auditData) {
        for (const row of auditData) {
          if (row.target_id) {
            const details = (row.details || {}) as Record<string, any>;
            creatorMap[row.target_id] = row.actor_id || details.actor_name || details.instructor || '';
          }
        }
      }
    } catch (e) {
      // Non-blocking fallback
    }
  }

  const userMap: Record<string, string> = {
    admin: 'System Administrator',
    faculty: 'Faculty Member',
  };
  try {
    const { data: appUsers } = await supabaseServer
      .from('app_users')
      .select('username, full_name');
    if (appUsers) {
      appUsers.forEach((u: any) => {
        if (u.username && u.full_name) {
          userMap[u.username.toLowerCase()] = u.full_name;
        }
      });
    }
  } catch (e) {
    // Non-blocking
  }

  // Enrich each session with creator info
  const enriched = validSessions.map((s: any) => {
    const rawInstructor = s.instructor_name || '';
    const dec = decodeSessionMetadata(rawInstructor);
    const auditCreator = creatorMap[s.id] || '';
    const creator = dec.facultyUsername || auditCreator || '';
    const creatorClean = creator.startsWith('@') ? creator.slice(1) : creator;
    const fullName = userMap[creatorClean.toLowerCase()] || creatorClean || 'Faculty Member';

    return {
      ...s,
      created_by: creator,
      creator_name: fullName,
      created_by_name: fullName,
    };
  });

  // If user is logged in as Faculty, filter to only their own sessions
  if (authUser && authUser.role === 'Faculty') {
    const facultyUser = (authUser.username || '').trim().toLowerCase();
    const facultyName = (authUser.name || '').trim().toLowerCase();

    return enriched.filter((s: any) => {
      const cb = (s.created_by || '').trim().toLowerCase();
      const dec = decodeSessionMetadata(s.instructor_name || '');
      const byTag = (dec.facultyUsername || '').trim().toLowerCase();
      const topic = (dec.topic || '').trim().toLowerCase();

      return (
        (byTag && (byTag === facultyUser || byTag === facultyName)) ||
        (cb && (cb === facultyUser || cb === facultyName)) ||
        (topic && (topic === facultyUser || topic === facultyName))
      );
    });
  }

  // Super Admin or Admin receives all sessions with full creator/audit information
  if (authUser && ['Super Admin', 'Admin'].includes(authUser.role)) {
    return enriched;
  }

  // Logged-in Students receive active sessions with general creator info (strip internal creator username)
  if (authUser && authUser.role === 'Student') {
    return enriched.map((s: any) => ({
      ...s,
      created_by: undefined,
    }));
  }

  // Public / Unauthenticated callers: strictly minimize sensitive creator and internal audit info
  return enriched.map((s: any) => ({
    ...s,
    created_by: undefined,
    creator_name: 'Faculty Member',
    created_by_name: 'Faculty Member',
  }));
}

export async function GET(request: NextRequest) {
  try {
    // 1. IP Rate Limiting (Max 30 requests per minute per IP)
    const forwarded = request.headers.get('x-forwarded-for') || request.headers.get('cf-connecting-ip') || 'unknown';
    const clientIp = forwarded.split(',')[0].trim();
    const nowMs = Date.now();
    const timestamps = (activeSessionsRateLimits[clientIp] || []).filter(t => nowMs - t < 60000);
    if (timestamps.length >= 30) {
      activeSessionsRateLimits[clientIp] = timestamps;
      return NextResponse.json(
        { success: false, detail: 'Too many requests. Please wait a moment.' },
        { status: 429 }
      );
    }
    timestamps.push(nowMs);
    activeSessionsRateLimits[clientIp] = timestamps;

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
          const processed = await processAndFilterSessions(data.sessions, authUser);
          return NextResponse.json({ ...data, sessions: processed });
        }
      }
    } catch (e) {
      // Backend offline or unreachable, fall back to Supabase
    }

    // 4. Query Supabase directly with strict exclusion of internal system rows
    const todayStr = getTodayDateStr();
    const startOfTodayIso = getStartOfTodayISO();

    const { data: sessionData, error } = await supabaseServer
      .from('sessions')
      .select('id, class_name, date, start_time, end_time, instructor_name, target_academic_year, created_at')
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
    const todaySessions = (sessionData || []).filter((s: any) => {
      if (isInternalSession(s)) return false;
      const dateVal = s.date || '';
      const createdVal = s.created_at || '';
      return dateVal === todayStr || createdVal.startsWith(todayStr) || createdVal >= startOfTodayIso;
    });

    // Query exact attendance records for all sessions today
    const sessionIds = todaySessions.map((s: any) => s.id);
    const attendanceMap: Record<string, number> = {};

    if (sessionIds.length > 0) {
      const { data: attData } = await supabaseServer
        .from('attendance')
        .select('session_id')
        .in('session_id', sessionIds);

      if (attData) {
        attData.forEach((att: any) => {
          if (att.session_id) {
            attendanceMap[att.session_id] = (attendanceMap[att.session_id] || 0) + 1;
          }
        });
      }
    }

    const nowUtc = Date.now();
    const sessions = todaySessions.map((s: any) => {
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
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message, sessions: [] }, { status: 500 });
  }
}
