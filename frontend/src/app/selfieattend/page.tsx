import { Suspense } from 'react';
import { supabase } from '@/lib/supabase';
import { SelfieAttendContent, ActiveSession } from './SelfieAttendClient';

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
    const now = new Date();
    const todayStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
    const startOfTodayIso = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();

    const { data: sessionData, error } = await supabase
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
  const initialSessions = await getInitialSessions();

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
