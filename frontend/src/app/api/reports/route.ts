import { NextResponse, NextRequest } from 'next/server';
import { supabaseServer } from '@/lib/supabaseServer';
import { verifySessionToken, SESSION_COOKIE_NAME } from '@/lib/serverAuth';

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

    // 1. Fetch sessions
    const { data: allSessions, error: sessErr } = await supabaseServer
      .from('sessions')
      .select('id, class_name, target_academic_year')
      .neq('class_name', '__SYSTEM_CONFIG__')
      .neq('class_name', '__GEOFENCE_CONFIG__');
    if (sessErr) throw sessErr;

    // 2. Fetch students
    const { data: students, error: stuErr } = await supabaseServer
      .from('students')
      .select('id, student_roll, full_name, email, academic_year')
      .order('student_roll', { ascending: true });
    if (stuErr) throw stuErr;

    // 3. Fetch attendance records
    const { data: attendance, error: attErr } = await supabaseServer
      .from('attendance')
      .select('session_id, student_id, status, capture_mode, recorded_at');
    if (attErr) throw attErr;

    // 4. Fetch curriculum subjects if available
    const { data: subjects } = await supabaseServer
      .from('academic_subjects')
      .select('id, name, code, academic_year, department, is_active')
      .order('name', { ascending: true });

    return NextResponse.json({
      success: true,
      sessions: allSessions || [],
      students: students || [],
      attendance: attendance || [],
      subjects: subjects || [],
    });
  } catch (err: any) {
    console.error('Error fetching reports data:', err);
    return NextResponse.json({ success: false, error: err.message || 'Failed to fetch reports data' }, { status: 500 });
  }
}
