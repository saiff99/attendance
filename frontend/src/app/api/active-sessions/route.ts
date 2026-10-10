import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { fetchBackend } from '@/lib/serverBackend';
import { getTodayDateStr, getStartOfTodayISO } from '@/lib/dateUtils';

export const dynamic = 'force-dynamic';

// Rate Limiter for active sessions list: {clientIp: [timestamp, ...]}
const activeSessionsRateLimits: Record<string, number[]> = {};

export async function GET(request: Request) {
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

    // 2. Try secure backend fast-path
    try {
      const res = await fetchBackend('/api/active-sessions', {
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
    const todayStr = getTodayDateStr();
    const startOfTodayIso = getStartOfTodayISO();

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
