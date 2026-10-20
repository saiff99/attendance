import { NextResponse, NextRequest } from 'next/server';
import { supabaseServer } from '@/lib/supabaseServer';
import { verifySessionToken, SESSION_COOKIE_NAME } from '@/lib/serverAuth';
import { isValidUuid, isFacultyAuthorizedForSession } from '@/lib/attendanceAuth';

export const dynamic = 'force-dynamic';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ sessionId: string }> }
) {
  try {
    const sessionCookie = request.cookies.get(SESSION_COOKIE_NAME)?.value;
    if (!sessionCookie) {
      return NextResponse.json({ success: false, error: 'Unauthorized.' }, { status: 401 });
    }

    const session = await verifySessionToken(sessionCookie);
    if (!session || (session.role !== 'Super Admin' && session.role !== 'Admin' && session.role !== 'Faculty')) {
      return NextResponse.json(
        { success: false, error: 'Forbidden. Authorized access required.' },
        { status: 403 }
      );
    }

    const { sessionId } = await params;
    if (!sessionId) {
      return NextResponse.json({ success: false, error: 'Session ID required.' }, { status: 400 });
    }

    if (!isValidUuid(sessionId)) {
      return NextResponse.json({ success: false, error: 'Invalid Session ID format. Valid UUID required.' }, { status: 400 });
    }

    // 1. Fetch Session to verify existence and faculty authorization
    const { data: sessionInfo } = await supabaseServer
      .from('sessions')
      .select('id, class_name, instructor_name, target_academic_year')
      .eq('id', sessionId)
      .maybeSingle();

    if (!sessionInfo) {
      return NextResponse.json({ success: false, error: 'Session not found.' }, { status: 404 });
    }

    // 2. Authorization & Scope Check
    const isAuthorized = await isFacultyAuthorizedForSession(session, sessionInfo);
    if (!isAuthorized) {
      return NextResponse.json(
        { success: false, error: 'Forbidden. You are not authorized to view logs for another faculty member\'s session.' },
        { status: 403 }
      );
    }

    // 3. Fetch logs for authorized session
    const { data, error } = await supabaseServer
      .from('attendance')
      .select('*, students(id, student_roll, full_name, email)')
      .eq('session_id', sessionId)
      .order('recorded_at', { ascending: false });

    if (error) throw error;

    return NextResponse.json({
      success: true,
      logs: data || [],
    });
  } catch (err: any) {
    console.error('Error fetching session attendance logs:', err);
    return NextResponse.json({ success: false, error: err.message || 'Failed to fetch logs' }, { status: 500 });
  }
}
