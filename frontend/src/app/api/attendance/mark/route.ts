import { NextResponse, NextRequest } from 'next/server';
import { supabaseServer } from '@/lib/supabaseServer';
import { verifySessionToken, SESSION_COOKIE_NAME } from '@/lib/serverAuth';
import { logAuditEvent } from '@/lib/auditLog';
import { isCohortMatching } from '@/lib/cohort';
import {
  isValidUuid,
  validateMarkAttendanceInput,
  isFacultyAuthorizedForSession,
} from '@/lib/attendanceAuth';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
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

    const forwarded = request.headers.get('x-forwarded-for') || request.headers.get('cf-connecting-ip') || '127.0.0.1';
    const clientIp = forwarded.split(',')[0].trim();

    let rawBody: unknown;
    try {
      rawBody = await request.json();
    } catch {
      return NextResponse.json(
        { success: false, error: 'Invalid JSON payload in request body.' },
        { status: 400 }
      );
    }

    // 1. Strict Schema & Type-Safety Validation
    const validationResult = validateMarkAttendanceInput(rawBody);
    if (!validationResult.valid) {
      return NextResponse.json(
        { success: false, error: validationResult.error },
        { status: 400 }
      );
    }

    const {
      session_id,
      student_id,
      status,
      capture_mode,
      confidence_score,
      reason,
      client_recorded_at,
    } = validationResult.data;

    // 2. Fetch Session & Student Details
    const [sessionRes, studentRes] = await Promise.all([
      supabaseServer
        .from('sessions')
        .select('id, class_name, instructor_name, target_academic_year, start_time, end_time')
        .eq('id', session_id)
        .maybeSingle(),
      supabaseServer
        .from('students')
        .select('id, full_name, student_roll, academic_year')
        .eq('id', student_id)
        .maybeSingle(),
    ]);

    const sessionInfo = sessionRes.data;
    const studentInfo = studentRes.data;

    if (!sessionInfo) {
      return NextResponse.json(
        { success: false, error: 'Attendance session not found.' },
        { status: 404 }
      );
    }

    if (!studentInfo) {
      return NextResponse.json(
        { success: false, error: 'Student not found.' },
        { status: 404 }
      );
    }

    // 3. Authorization & Scope Check: Faculty can only mark attendance for their own sessions
    const isAuthorized = await isFacultyAuthorizedForSession(session, sessionInfo);
    if (!isAuthorized) {
      logAuditEvent({
        action: 'UNAUTHORIZED_SESSION_ACCESS_REJECTED',
        targetType: 'session',
        targetId: session_id,
        actorId: session.username || session.name || 'unauthorized_faculty',
        request,
        details: {
          session_id,
          class_name: sessionInfo.class_name,
          instructor: sessionInfo.instructor_name,
          faculty_actor: session.name || session.username,
          faculty_role: session.role,
          attempted_action: 'MARK_ATTENDANCE',
        },
      });
      return NextResponse.json(
        {
          success: false,
          error: 'Forbidden. You are not authorized to mark or alter attendance for another faculty member\'s session.'
        },
        { status: 403 }
      );
    }

    // 4. Scope Check: Student must belong to target academic year / cohort of this session
    if (sessionInfo.target_academic_year && !isCohortMatching(sessionInfo.target_academic_year, studentInfo.academic_year)) {
      return NextResponse.json(
        {
          success: false,
          error: `Student ${studentInfo.full_name} (${studentInfo.academic_year || 'Unassigned'}) does not belong to the target cohort (${sessionInfo.target_academic_year}) for this session.`
        },
        { status: 403 }
      );
    }

    // 5. Server-Controlled Timestamp
    const serverTimestamp = new Date().toISOString();
    let recorded_at = serverTimestamp;
    let timestampAuditNote: string | undefined = undefined;

    if (client_recorded_at) {
      const clientTime = new Date(client_recorded_at).getTime();
      const serverTime = Date.now();
      if (!isNaN(clientTime)) {
        const diffMinutes = Math.abs(serverTime - clientTime) / (60 * 1000);
        // If client sends timestamp significantly different from server (> 5 mins)
        if (diffMinutes > 5) {
          const sessStart = new Date(sessionInfo.start_time).getTime();
          const sessEnd = new Date(sessionInfo.end_time).getTime();
          // Allow reasonable retrospective manual log if within session date window (+/- 24h grace period)
          if (!isNaN(sessStart) && !isNaN(sessEnd) && clientTime >= (sessStart - 86400000) && clientTime <= (sessEnd + 86400000)) {
            recorded_at = new Date(clientTime).toISOString();
            timestampAuditNote = `Manual retrospective timestamp override accepted (${client_recorded_at})`;
          } else {
            timestampAuditNote = `Untrusted client timestamp rejected (${client_recorded_at}), defaulted to server clock`;
            recorded_at = serverTimestamp;
          }
        }
      }
    }

    // 6. Check existing record to capture previous status before update
    const { data: existingRecord } = await supabaseServer
      .from('attendance')
      .select('id, status, capture_mode, confidence_score')
      .eq('session_id', session_id)
      .eq('student_id', student_id)
      .maybeSingle();

    // 7. Map capture_mode to database-compatible schema constraint ('Live Scan', 'Manual Upload')
    let dbCaptureMode = capture_mode;
    if (dbCaptureMode === 'Manual Entry' || dbCaptureMode === 'Selfie Check-in') {
      dbCaptureMode = 'Manual Upload';
    } else if (dbCaptureMode === 'Selfie Scan') {
      dbCaptureMode = 'Live Scan';
    }

    let data;
    try {
      const res = await supabaseServer
        .from('attendance')
        .upsert(
          {
            session_id,
            student_id,
            status,
            capture_mode: dbCaptureMode,
            confidence_score,
            recorded_at,
          },
          { onConflict: 'session_id,student_id' }
        )
        .select()
        .single();
      if (res.error) throw res.error;
      data = res.data;
    } catch {
      // Fallback if DB check constraint strictly permits legacy 'Manual Upload'
      const fallbackRes = await supabaseServer
        .from('attendance')
        .upsert(
          {
            session_id,
            student_id,
            status,
            capture_mode: 'Manual Upload',
            confidence_score,
            recorded_at,
          },
          { onConflict: 'session_id,student_id' }
        )
        .select()
        .single();
      if (fallbackRes.error) throw fallbackRes.error;
      data = fallbackRes.data;
    }

    // 8. Log tamper-evident audit log event
    const effectiveReason = reason || (existingRecord ? 'Manual attendance status update' : 'Manual faculty attendance mark');

    logAuditEvent({
      action: existingRecord ? 'UPDATE_MANUAL_ATTENDANCE' : 'CREATE_MANUAL_ATTENDANCE',
      targetType: 'attendance',
      targetId: data?.id || undefined,
      actorId: session.username || session.name || 'faculty',
      request,
      details: {
        student_id,
        student_name: studentInfo.full_name || 'Unknown Student',
        student_roll: studentInfo.student_roll || 'N/A',
        student_academic_year: studentInfo.academic_year || 'Unassigned',
        session_id,
        class_name: sessionInfo.class_name || 'Unknown Class',
        session_target_cohort: sessionInfo.target_academic_year || 'All',
        session_instructor: sessionInfo.instructor_name || 'N/A',
        new_status: status,
        previous_status: existingRecord?.status || 'Absent',
        capture_mode,
        confidence_score,
        recorded_at,
        actor_name: session.name,
        actor_role: session.role,
        reason: effectiveReason,
        timestamp_audit: timestampAuditNote,
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
    if (!session || (session.role !== 'Super Admin' && session.role !== 'Admin' && session.role !== 'Faculty')) {
      return NextResponse.json(
        { success: false, error: 'Forbidden. Authorized access required.' },
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
    const reason = typeof body.reason === 'string' && body.reason.trim()
      ? body.reason.trim().slice(0, 500)
      : 'Manual attendance removal / undo';

    if (!targetId && (!session_id || !student_id)) {
      return NextResponse.json(
        { success: false, error: 'Log ID or session_id+student_id required for undo.' },
        { status: 400 }
      );
    }

    // Validate ID formats
    if (targetId && !isValidUuid(targetId)) {
      return NextResponse.json(
        { success: false, error: 'Invalid attendance record ID format. Valid UUID required.' },
        { status: 400 }
      );
    }
    if (session_id && !isValidUuid(session_id)) {
      return NextResponse.json(
        { success: false, error: 'Invalid session_id format. Valid UUID required.' },
        { status: 400 }
      );
    }
    if (student_id && !isValidUuid(student_id)) {
      return NextResponse.json(
        { success: false, error: 'Invalid student_id format. Valid UUID required.' },
        { status: 400 }
      );
    }

    // 1. Fetch existing attendance record
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

    // 2. Fetch session details to verify ownership and scope
    const { data: sessionInfo } = await supabaseServer
      .from('sessions')
      .select('id, class_name, instructor_name, target_academic_year')
      .eq('id', existingRecord.session_id)
      .maybeSingle();

    if (!sessionInfo) {
      return NextResponse.json({ success: false, error: 'Associated session not found.' }, { status: 404 });
    }

    // 3. Authorization & Scope Check: Faculty can only delete records from their OWN sessions
    const isAuthorized = await isFacultyAuthorizedForSession(session, sessionInfo);
    if (!isAuthorized) {
      logAuditEvent({
        action: 'UNAUTHORIZED_SESSION_ACCESS_REJECTED',
        targetType: 'session',
        targetId: existingRecord.session_id,
        actorId: session.username || session.name || 'unauthorized_faculty',
        request,
        details: {
          session_id: existingRecord.session_id,
          attendance_id: existingRecord.id,
          instructor: sessionInfo.instructor_name,
          faculty_actor: session.name || session.username,
          faculty_role: session.role,
          attempted_action: 'DELETE_ATTENDANCE',
        },
      });
      return NextResponse.json(
        {
          success: false,
          error: 'Forbidden. You are not authorized to delete attendance records for another faculty member\'s session.'
        },
        { status: 403 }
      );
    }

    // 4. Delete attendance record
    const { error } = await supabaseServer
      .from('attendance')
      .delete()
      .eq('id', existingRecord.id);

    if (error) throw error;

    // 5. Query student details for audit readability
    const { data: studentInfo } = await supabaseServer
      .from('students')
      .select('id, full_name, student_roll, academic_year')
      .eq('id', existingRecord.student_id)
      .maybeSingle();

    // 6. Log security audit event for manual removal / undo
    logAuditEvent({
      action: 'DELETE_MANUAL_ATTENDANCE',
      targetType: 'attendance',
      targetId: existingRecord.id,
      actorId: session.username || session.name || 'faculty',
      request,
      details: {
        attendance_id: existingRecord.id,
        student_id: existingRecord.student_id,
        student_name: studentInfo?.full_name || 'Unknown Student',
        student_roll: studentInfo?.student_roll || 'N/A',
        student_academic_year: studentInfo?.academic_year || 'Unassigned',
        session_id: existingRecord.session_id,
        class_name: sessionInfo?.class_name || 'Unknown Class',
        session_instructor: sessionInfo?.instructor_name || 'N/A',
        previous_status: existingRecord.status,
        capture_mode: existingRecord.capture_mode,
        actor_name: session.name,
        actor_role: session.role,
        reason,
        ip_address: clientIp,
      },
    });

    return NextResponse.json({
      success: true,
      message: 'Attendance record removed successfully.',
    });
  } catch (err: any) {
    console.error('Error undoing attendance via API:', err);
    return NextResponse.json({ success: false, error: err.message || 'Failed to undo attendance' }, { status: 500 });
  }
}
