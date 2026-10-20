import { NextResponse, NextRequest } from 'next/server';
import { supabaseServer } from '@/lib/supabaseServer';
import { verifySessionToken, SESSION_COOKIE_NAME } from '@/lib/serverAuth';
import { isFacultyAuthorizedForSession } from '@/lib/attendanceAuth';

export const dynamic = 'force-dynamic';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
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

    const { id } = await params;
    if (!id) {
      return NextResponse.json({ success: false, error: 'Session ID required.' }, { status: 400 });
    }

    const { data, error } = await supabaseServer
      .from('sessions')
      .select('id, class_name, date, start_time, end_time, instructor_name, target_academic_year, created_at')
      .eq('id', id)
      .neq('class_name', '__SYSTEM_CONFIG__')
      .maybeSingle();

    if (error || !data) {
      return NextResponse.json({ success: false, error: 'Session not found.' }, { status: 404 });
    }

    if (session.role === 'Faculty') {
      const authorized = await isFacultyAuthorizedForSession(session, data);
      if (!authorized) {
        return NextResponse.json(
          { success: false, error: "Forbidden. You do not have permission to view another faculty member's session." },
          { status: 403 }
        );
      }
    }

    return NextResponse.json({
      success: true,
      session: data,
    });
  } catch (err: any) {
    console.error('Error fetching session by id:', err);
    return NextResponse.json({ success: false, error: err.message || 'Failed to fetch session' }, { status: 500 });
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
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

    const { id } = await params;
    if (session.role === 'Faculty') {
      const { data: existing } = await supabaseServer
        .from('sessions')
        .select('id, instructor_name, class_name')
        .eq('id', id)
        .maybeSingle();

      if (!existing || !(await isFacultyAuthorizedForSession(session, existing))) {
        return NextResponse.json(
          { success: false, error: "Forbidden. You do not have permission to modify another faculty member's session." },
          { status: 403 }
        );
      }
    }

    const body = await request.json();

    const updatePayload: any = {};
    if (body.instructor_name !== undefined) updatePayload.instructor_name = body.instructor_name;
    if (body.class_name !== undefined) updatePayload.class_name = body.class_name;
    if (body.end_time !== undefined) updatePayload.end_time = body.end_time;

    const { data, error } = await supabaseServer
      .from('sessions')
      .update(updatePayload)
      .eq('id', id)
      .neq('class_name', '__SYSTEM_CONFIG__')
      .select('id, class_name, date, start_time, end_time, instructor_name, target_academic_year, created_at')
      .single();

    if (error) throw error;

    return NextResponse.json({
      success: true,
      session: data,
    });
  } catch (err: any) {
    console.error('Error updating session:', err);
    return NextResponse.json({ success: false, error: err.message || 'Failed to update session' }, { status: 500 });
  }
}
