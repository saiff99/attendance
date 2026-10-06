import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  try {
    const backendUrl = process.env.NEXT_PUBLIC_BACKEND_URL || 'http://127.0.0.1:8000';
    // 1. Try local FastAPI backend first
    try {
      const res = await fetch(`${backendUrl}/api/active-sessions`, {
        headers: { 'ngrok-skip-browser-warning': '69420' },
        cache: 'no-store',
        next: { revalidate: 0 },
      });
      if (res.ok) {
        const data = await res.json();
        if (data && data.sessions && Array.isArray(data.sessions)) {
          return NextResponse.json(data);
        }
      }
    } catch (e) {
      // Backend offline or unreachable, fall back to Supabase
    }

    // 2. Query Supabase directly
    const now = new Date();
    const todayStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
    const startOfTodayIso = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();

    const { data: sessionData, error } = await supabase
      .from('sessions')
      .select('id, class_name, date, start_time, end_time, instructor_name, target_academic_year, created_at')
      .neq('class_name', '__SYSTEM_CONFIG__')
      .order('created_at', { ascending: false })
      .limit(50);

    if (error) {
      return NextResponse.json({ success: false, error: error.message, sessions: [] }, { status: 500 });
    }

    // Filter strictly for today's sessions
    const todaySessions = (sessionData || []).filter((s: any) => {
      const dateVal = s.date || '';
      const createdVal = s.created_at || '';
      return dateVal === todayStr || createdVal.startsWith(todayStr) || createdVal >= startOfTodayIso;
    });

    // Query exact attendance records for all sessions today
    const sessionIds = todaySessions.map((s: any) => s.id);
    const attendanceMap: Record<string, number> = {};

    if (sessionIds.length > 0) {
      const { data: attData } = await supabase
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

    return NextResponse.json({ success: true, sessions });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message, sessions: [] }, { status: 500 });
  }
}
