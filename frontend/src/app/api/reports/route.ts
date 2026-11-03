import { NextResponse, NextRequest } from 'next/server';
import { supabaseServer } from '@/lib/supabaseServer';
import { verifySessionToken, SESSION_COOKIE_NAME } from '@/lib/serverAuth';
import { isCohortMatching } from '@/lib/cohort';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    const sessionCookie = request.cookies.get(SESSION_COOKIE_NAME)?.value;
    if (!sessionCookie) {
      return NextResponse.json({ success: false, error: 'Unauthorized.' }, { status: 401 });
    }

    const session = await verifySessionToken(sessionCookie);
    if (!session || (session.role !== 'Super Admin' && session.role !== 'Admin')) {
      return NextResponse.json(
        { success: false, error: 'Forbidden. Administrator privileges required.' },
        { status: 403 }
      );
    }

    const { searchParams } = new URL(request.url);
    const startDate = searchParams.get('start_date');
    const endDate = searchParams.get('end_date');
    const cohort = searchParams.get('cohort');
    const includeArchived = searchParams.get('include_archived') === 'true';

    // 1. Build Sessions Query
    let sessQuery = supabaseServer
      .from('sessions')
      .select('id, class_name, date, start_time, target_academic_year, is_archived, archived_at')
      .neq('class_name', '__SYSTEM_CONFIG__')
      .neq('class_name', '__GEOFENCE_CONFIG__');

    if (!includeArchived) {
      sessQuery = sessQuery.eq('is_archived', false);
    }
    if (startDate) {
      sessQuery = sessQuery.gte('date', startDate);
    }
    if (endDate) {
      sessQuery = sessQuery.lte('date', endDate);
    }

    // 2. Build Students Query
    const stuQuery = supabaseServer
      .from('students')
      .select('id, student_roll, full_name, email, academic_year, is_active, archived_at')
      .order('student_roll', { ascending: true });

    // 3. Build Attendance Query (with date filtering)
    let attQuery = supabaseServer
      .from('attendance')
      .select('session_id, student_id, status, capture_mode, recorded_at');

    if (startDate) {
      const startIso = startDate.includes('T') ? startDate : `${startDate}T00:00:00.000Z`;
      attQuery = attQuery.gte('recorded_at', startIso);
    }
    if (endDate) {
      const endIso = endDate.includes('T') ? endDate : `${endDate}T23:59:59.999Z`;
      attQuery = attQuery.lte('recorded_at', endIso);
    }

    // 4. Build Curriculum Subjects Query
    const subQuery = supabaseServer
      .from('academic_subjects')
      .select('id, name, code, academic_year, department, is_active')
      .order('name', { ascending: true });

    // Execute Sessions, Students, and Subjects queries in parallel
    const [sessRes, stuRes, subRes] = await Promise.all([
      sessQuery,
      stuQuery,
      subQuery,
    ]);

    if (sessRes.error) throw sessRes.error;
    if (stuRes.error) throw stuRes.error;

    // Filter sessions & students by cohort and archive status
    let allSessions = sessRes.data || [];
    let students = stuRes.data || [];

    if (!includeArchived) {
      students = students.filter(
        (s: any) => s.is_active !== false && !String(s.academic_year || '').startsWith('[ARCHIVED]')
      );
    }

    if (cohort && cohort.toLowerCase() !== 'all') {
      allSessions = allSessions.filter((sess: any) =>
        isCohortMatching(cohort, sess.target_academic_year)
      );
      students = students.filter((s: any) =>
        isCohortMatching(cohort, s.academic_year)
      );
    }

    // 5. Fetch Attendance with Safe Chunked Pagination (prevents Supabase 1,000-row silent truncation)
    let attendance: any[] = [];
    const CHUNK_SIZE = 1000;
    const MAX_ATTENDANCE_LIMIT = 50000;
    let from = 0;

    while (from < MAX_ATTENDANCE_LIMIT) {
      const { data, error } = await attQuery.range(from, from + CHUNK_SIZE - 1);
      if (error) throw error;
      if (!data || data.length === 0) break;
      attendance.push(...data);
      if (data.length < CHUNK_SIZE) break;
      from += CHUNK_SIZE;
    }

    return NextResponse.json({
      success: true,
      sessions: allSessions,
      students: students,
      attendance: attendance,
      subjects: subRes.data || [],
      metadata: {
        total_sessions: allSessions.length,
        total_students: students.length,
        total_attendance_records: attendance.length,
        start_date: startDate || null,
        end_date: endDate || null,
        cohort: cohort || 'all',
      },
    });
  } catch (err: any) {
    console.error('Error fetching reports data:', err);
    return NextResponse.json(
      { success: false, error: err.message || 'Failed to fetch reports data' },
      { status: 500 }
    );
  }
}
