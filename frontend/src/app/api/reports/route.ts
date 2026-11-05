import { NextResponse, NextRequest } from 'next/server';
import { supabaseServer } from '@/lib/supabaseServer';
import { verifySessionToken, SESSION_COOKIE_NAME } from '@/lib/serverAuth';
import { isCohortMatching } from '@/lib/cohort';
import { getCachedAcademicSubjects } from '@/lib/subjectCache';

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

    // 2. Build Students Query (SQL pushdown: filter active students when archived are not requested)
    let stuQuery = supabaseServer
      .from('students')
      .select('id, student_roll, full_name, email, academic_year, is_active, archived_at');

    if (!includeArchived) {
      stuQuery = stuQuery.eq('is_active', true);
    }
    stuQuery = stuQuery.order('student_roll', { ascending: true });

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

    // Execute Sessions, Students, and cached Subjects queries in parallel
    const [sessRes, stuRes, allSubjects] = await Promise.all([
      sessQuery,
      stuQuery,
      getCachedAcademicSubjects(),
    ]);

    if (sessRes.error) throw sessRes.error;
    if (stuRes.error) throw stuRes.error;

    // Filter sessions & students by cohort and archive status
    let allSessions = sessRes.data || [];
    let students = stuRes.data || [];

    if (!includeArchived) {
      students = students.filter(
        (s: { is_active?: boolean | null; academic_year?: string | null }) => s.is_active !== false && !String(s.academic_year || '').startsWith('[ARCHIVED]')
      );
    }

    if (cohort && cohort.toLowerCase() !== 'all') {
      allSessions = allSessions.filter((sess: { target_academic_year?: string | null }) =>
        isCohortMatching(cohort, sess.target_academic_year)
      );
      students = students.filter((s: { academic_year?: string | null }) =>
        isCohortMatching(cohort, s.academic_year)
      );
    }

    // 5. Fetch Attendance Summary (Fast Server-Side Aggregation RPC with Chunked Fallback)
    interface AttendanceSummaryRow {
      student_id: string;
      present: number;
      manual: number;
      attended_session_ids: string[];
      last_attended_at?: string | null;
    }

    let attendanceSummary: AttendanceSummaryRow[] | null = null;

    try {
      const rpcParams: Record<string, string> = {};
      if (startDate) rpcParams.p_start_date = startDate.includes('T') ? startDate : `${startDate}T00:00:00.000Z`;
      if (endDate) rpcParams.p_end_date = endDate.includes('T') ? endDate : `${endDate}T23:59:59.999Z`;

      const { data: rpcData, error: rpcError } = await supabaseServer.rpc('get_attendance_summary', rpcParams);
      if (!rpcError && Array.isArray(rpcData)) {
        attendanceSummary = rpcData.map((row: Record<string, unknown>) => ({
          student_id: String(row.student_id || ''),
          present: Number(row.present || 0),
          manual: Number(row.manual || 0),
          attended_session_ids: Array.isArray(row.attended_session_ids) ? row.attended_session_ids.map(String) : [],
          last_attended_at: row.last_attended_at ? String(row.last_attended_at) : null,
        }));
      }
    } catch (e) {
      console.warn('Attendance summary RPC fallback to chunked fetch:', e);
    }

    const attendance: Array<{ id?: string; session_id?: string; student_id?: string; status?: string; recorded_at?: string }> = [];

    // Fallback: If RPC is not available, execute safe chunked pagination
    if (!attendanceSummary) {
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
    }

    const activeSubjects = (allSubjects || []).filter((s: { is_active?: boolean | null }) => s.is_active !== false);

    const totalAttendanceCount = attendanceSummary
      ? attendanceSummary.reduce((acc, curr) => acc + curr.present, 0)
      : attendance.length;

    return NextResponse.json({
      success: true,
      sessions: allSessions,
      students: students,
      attendance: attendance,
      attendance_summary: attendanceSummary,
      subjects: activeSubjects,
      metadata: {
        total_sessions: allSessions.length,
        total_students: students.length,
        total_attendance_records: totalAttendanceCount,
        aggregated_server_side: attendanceSummary !== null,
        start_date: startDate || null,
        end_date: endDate || null,
        cohort: cohort || 'all',
      },
    });
  } catch (err: unknown) {
    const errMsg = err instanceof Error ? err.message : String(err);
    console.error('Error fetching reports data:', err);
    return NextResponse.json(
      { success: false, error: errMsg },
      { status: 500 }
    );
  }
}
