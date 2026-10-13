import { NextResponse, NextRequest } from 'next/server';
import { supabaseServer } from '@/lib/supabaseServer';
import { verifySessionToken, SESSION_COOKIE_NAME } from '@/lib/serverAuth';
import { logAuditEvent } from '@/lib/auditLog';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  try {
    const sessionCookie = request.cookies.get(SESSION_COOKIE_NAME)?.value;
    if (!sessionCookie) {
      return NextResponse.json({ success: false, error: 'Unauthorized.' }, { status: 401 });
    }

    const session = await verifySessionToken(sessionCookie);
    if (!session || (session.role !== 'Super Admin' && session.role !== 'Faculty')) {
      return NextResponse.json(
        { success: false, error: 'Forbidden. Faculty or Super Admin access required.' },
        { status: 403 }
      );
    }

    const forwarded = request.headers.get('x-forwarded-for') || request.headers.get('cf-connecting-ip') || '127.0.0.1';
    const clientIp = forwarded.split(',')[0].trim();

    const body = await request.json();
    const { session_id, student_id } = body;

    if (!session_id || !student_id) {
      return NextResponse.json({ success: false, error: 'session_id and student_id are required.' }, { status: 400 });
    }

    const status = body.status || 'Present';
    const capture_mode = body.capture_mode || 'Manual Upload';
    const confidence_score = body.confidence_score !== undefined ? body.confidence_score : 1.0;
    const recorded_at = body.recorded_at || new Date().toISOString();

    // 1. Check existing record to capture previous status before update
    const { data: existingRecord } = await supabaseServer
      .from('attendance')
      .select('id, status, capture_mode')
      .eq('session_id', session_id)
      .eq('student_id', student_id)
      .maybeSingle();

    // 2. Query student and session details for descriptive audit trail
    const [studentRes, sessionRes] = await Promise.all([
      supabaseServer.from('students').select('id, full_name, student_roll').eq('id', student_id).maybeSingle(),
      supabaseServer.from('sessions').select('id, class_name').eq('id', session_id).maybeSingle(),
    ]);

    const studentInfo = studentRes.data;
    const sessionInfo = sessionRes.data;

    // 3. Upsert attendance record
    const { data, error } = await supabaseServer
      .from('attendance')
      .upsert(
        {
          session_id,
          student_id,
          status,
          capture_mode,
          confidence_score,
          recorded_at,
        },
        { onConflict: 'session_id,student_id' }
      )
      .select()
      .single();

    if (error) throw error;

    // 4. Log tamper-evident audit log event
    logAuditEvent({
      action: existingRecord ? 'UPDATE_MANUAL_ATTENDANCE' : 'CREATE_MANUAL_ATTENDANCE',
      targetType: 'attendance',
      targetId: data?.id || undefined,
      actorId: session.username || session.name || 'faculty',
      details: {
        student_id,
        student_name: studentInfo?.full_name || 'Unknown Student',
        student_roll: studentInfo?.student_roll || 'N/A',
        session_id,
        class_name: sessionInfo?.class_name || 'Unknown Class',
        new_status: status,
        previous_status: existingRecord?.status || 'Absent',
        capture_mode,
        actor_name: session.name,
        actor_role: session.role,
        ip_address: clientIp,
      },
    });

    return NextResponse.json({
      success: true,
      data,
    });
  } catch (err: any) {
    console.error('Error marking attendance via API:', err);
    return NextResponse.json({ success: false, error: err.message || 'Failed to mark attendance' }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const sessionCookie = request.cookies.get(SESSION_COOKIE_NAME)?.value;
    if (!sessionCookie) {
      return NextResponse.json({ success: false, error: 'Unauthorized.' }, { status: 401 });
    }

    const session = await verifySessionToken(sessionCookie);
    if (!session || (session.role !== 'Super Admin' && session.role !== 'Faculty')) {
      return NextResponse.json(
        { success: false, error: 'Forbidden. Faculty or Super Admin access required.' },
        { status: 403 }
      );
    }

    const forwarded = request.headers.get('x-forwarded-for') || request.headers.get('cf-connecting-ip') || '127.0.0.1';
    const clientIp = forwarded.split(',')[0].trim();

    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');
    const body = await request.json().catch(() => ({}));

    const targetId = id || body.id;
    const session_id = body.session_id;
    const student_id = body.student_id;

    if (!targetId && (!session_id || !student_id)) {
      return NextResponse.json({ success: false, error: 'Log ID or session_id+student_id required for undo.' }, { status: 400 });
    }

    // 1. Fetch existing attendance record before deletion to record who was removed
    let query = supabaseServer.from('attendance').select('id, session_id, student_id, status, capture_mode');
    if (targetId) {
      query = query.eq('id', targetId);
    } else {
      query = query.eq('session_id', session_id).eq('student_id', student_id);
    }
    const { data: existingRecord } = await query.maybeSingle();

    if (!existingRecord) {
      return NextResponse.json({ success: false, error: 'Attendance record not found.' }, { status: 404 });
    }

    // 2. Fetch student and session names for audit readability
    const [studentRes, sessionRes] = await Promise.all([
      supabaseServer.from('students').select('id, full_name, student_roll').eq('id', existingRecord.student_id).maybeSingle(),
      supabaseServer.from('sessions').select('id, class_name').eq('id', existingRecord.session_id).maybeSingle(),
    ]);

    const studentInfo = studentRes.data;
    const sessionInfo = sessionRes.data;

    // 3. Delete attendance record
    const { error } = await supabaseServer
      .from('attendance')
      .delete()
      .eq('id', existingRecord.id);

    if (error) throw error;

    // 4. Log security audit event for manual removal / undo
    logAuditEvent({
      action: 'DELETE_MANUAL_ATTENDANCE',
      targetType: 'attendance',
      targetId: existingRecord.id,
      actorId: session.username || session.name || 'faculty',
      details: {
        attendance_id: existingRecord.id,
        student_id: existingRecord.student_id,
        student_name: studentInfo?.full_name || 'Unknown Student',
        student_roll: studentInfo?.student_roll || 'N/A',
        session_id: existingRecord.session_id,
        class_name: sessionInfo?.class_name || 'Unknown Class',
        previous_status: existingRecord.status,
        capture_mode: existingRecord.capture_mode,
        actor_name: session.name,
        actor_role: session.role,
        reason: 'Manual attendance removal / undo',
        ip_address: clientIp,
      },
    });

    return NextResponse.json({ success: true });
  } catch (err: any) {
    console.error('Error undoing attendance via API:', err);
    return NextResponse.json({ success: false, error: err.message || 'Failed to undo attendance' }, { status: 500 });
  }
}
