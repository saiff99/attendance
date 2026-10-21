import { Suspense } from 'react';
import { cookies } from 'next/headers';
import { supabaseServer } from '@/lib/supabaseServer';
import { SelfieAttendContent, ActiveSession } from './SelfieAttendClient';
import { getTodayDateStr, getStartOfTodayISO } from '@/lib/dateUtils';
import { verifySessionToken, SESSION_COOKIE_NAME } from '@/lib/serverAuth';
import { decodeSessionMetadata } from '@/lib/geofence';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

async function getInitialSessions(): Promise<ActiveSession[]> {
  try {
    // 1. Try local FastAPI backend first
    try {
      const res = await fetch('http://127.0.0.1:8000/api/active-sessions', {
        headers: { 'ngrok-skip-browser-warning': '69420' },
        cache: 'no-store',
        next: { revalidate: 0 }
      });
      if (res.ok) {
        const data = await res.json();
        if (data.sessions && Array.isArray(data.sessions)) {
          return data.sessions;
        }
      }
    } catch (e) {
      // Backend unreachable, fall through to Supabase
    }

    // 2. Direct Supabase query from server
    const todayStr = getTodayDateStr();
    const startOfTodayIso = getStartOfTodayISO();

    const { data: sessionData, error } = await supabaseServer
      .from('sessions')
      .select('id, class_name, date, start_time, end_time, instructor_name, target_academic_year, created_at')
      .neq('class_name', '__SYSTEM_CONFIG__')
      .order('created_at', { ascending: false })
      .limit(50);

    if (error || !sessionData) return [];

    // Filter strictly for today's sessions
    const todaySessions = (sessionData || []).filter((s: any) => {
      const dateVal = s.date || '';
      const createdVal = s.created_at || '';
      return dateVal === todayStr || createdVal.startsWith(todayStr) || createdVal >= startOfTodayIso;
    });

    const nowUtc = Date.now();
    return todaySessions.map((s: any) => {
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
        attendance_count: 0,
        remaining_seconds: remainingSeconds,
        is_expired: isExpired,
        window_duration_seconds: 300,
      };
    });
  } catch (e) {
    return [];
  }
}

export default async function SelfieAttendPortal() {
  const cookieStore = await cookies();
  const sessionToken = cookieStore.get(SESSION_COOKIE_NAME)?.value;
  const authUser = sessionToken ? await verifySessionToken(sessionToken) : null;
  let initialSessions = await getInitialSessions();

  if (authUser?.role === "Faculty") {
    const u = (authUser.username || "").toLowerCase();
    const n = (authUser.name || "").toLowerCase();
    initialSessions = initialSessions.filter((s: any) => {
      const cb = ((s as any).created_by || "").toLowerCase();
      const dec = decodeSessionMetadata(s.instructor_name || "");
      const byTag = (dec.facultyUsername || "").toLowerCase();
      const topic = (dec.topic || "").toLowerCase();

      return (
        (byTag && (byTag === u || byTag === n)) ||
        (cb && (cb === u || cb === n)) ||
        (topic && (topic === u || topic === n))
      );
    });
  }

  return (
    <Suspense 
      fallback={
        <div className="fixed inset-0 z-50 bg-[#070B12] text-slate-200 flex flex-col items-center justify-center gap-3 p-4 text-center select-none">
          <div className="w-10 h-10 rounded-full border-2 border-indigo-500 border-t-transparent animate-spin mb-1" />
          <p className="text-sm text-slate-300 font-medium">Loading Selfie Attendance Portal...</p>
          <p className="text-xs text-slate-500">Initializing session data</p>
        </div>
      }
    >
      <SelfieAttendContent initialSessions={initialSessions} />
    </Suspense>
  );
}
