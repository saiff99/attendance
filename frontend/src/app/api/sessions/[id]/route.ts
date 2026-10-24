import { NextResponse, NextRequest } from 'next/server';
import { supabaseServer } from '@/lib/supabaseServer';
import { verifySessionToken, SESSION_COOKIE_NAME } from '@/lib/serverAuth';
import { isFacultyAuthorizedForSession } from '@/lib/attendanceAuth';
import { decodeSessionMetadata } from '@/lib/geofence';
import { logAuditEvent } from '@/lib/auditLog';

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
    let existingSession: any = null;

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
      existingSession = existing;
    }

    const body = await request.json();

    const updatePayload: any = {};
    if (body.class_name !== undefined) updatePayload.class_name = body.class_name;
    if (body.end_time !== undefined) updatePayload.end_time = body.end_time;

    if (body.instructor_name !== undefined) {
      if (session.role === 'Faculty') {
        // Strict Session Ownership Protection:
        // Faculty members cannot transfer session ownership to another user or strip the ownership tag.
        const existingMeta = decodeSessionMetadata(existingSession?.instructor_name || '');
        const authoritativeCreator = (existingMeta.facultyUsername || session.username || session.name || '').trim();

        const incomingMeta = decodeSessionMetadata(body.instructor_name || '');
        if (
          incomingMeta.facultyUsername &&
          authoritativeCreator &&
          incomingMeta.facultyUsername.toLowerCase() !== authoritativeCreator.toLowerCase()
        ) {
          return NextResponse.json(
            { success: false, error: "Forbidden. Faculty members are not permitted to transfer session ownership to another user." },
            { status: 403 }
          );
        }

        // Clean out any raw [BY:...] tag from incoming string and re-attach the authoritative immutable creator tag
        let cleanInstructor = (body.instructor_name || '').trim().replace(/\[BY:[^\]]*\]/g, '').trim();
        if (authoritativeCreator) {
          cleanInstructor = `${cleanInstructor} [BY:${encodeURIComponent(authoritativeCreator)}]`.trim();
        }
        updatePayload.instructor_name = cleanInstructor;
      } else {
        // Super Admin & Admin have full authority to reassign session ownership or edit instructor attribution
        updatePayload.instructor_name = body.instructor_name;
      }
    }

    const { data, error } = await supabaseServer
      .from('sessions')
      .update(updatePayload)
      .eq('id', id)
      .neq('class_name', '__SYSTEM_CONFIG__')
      .select('id, class_name, date, start_time, end_time, instructor_name, target_academic_year, created_at')
      .single();

    if (error) throw error;

    logAuditEvent({
      action: 'UPDATE_SESSION',
      targetType: 'session',
      targetId: id,
      actorId: session.username || session.name || 'admin',
      request,
      details: {
        updated_fields: Object.keys(updatePayload),
        class_name: data?.class_name,
        actor_name: session.name,
        actor_role: session.role,
      },
    });

    return NextResponse.json({
      success: true,
      session: data,
    });

  } catch (err: any) {
    console.error('Error updating session:', err);
    return NextResponse.json({ success: false, error: err.message || 'Failed to update session' }, { status: 500 });
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const sessionCookie = request.cookies.get(SESSION_COOKIE_NAME)?.value;
    if (!sessionCookie) {
      return NextResponse.json({ success: false, error: 'Unauthorized.' }, { status: 401 });
    }

    const session = await verifySessionToken(sessionCookie);
    if (!session || (session.role !== 'Super Admin' && session.role !== 'Admin')) {
      return NextResponse.json(
        { success: false, error: 'Forbidden. Admin privileges required.' },
        { status: 403 }
      );
    }

    const { id } = await params;
    if (!id) {
      return NextResponse.json({ success: false, error: 'Session ID required.' }, { status: 400 });
    }

    // Step 1: Check if the session has any linked attendance records
    const { count: attendanceCount, error: countErr } = await supabaseServer
      .from('attendance')
      .select('*', { count: 'exact', head: true })
      .eq('session_id', id);

    if (countErr) {
      console.warn('Could not verify attendance record count before delete:', countErr);
    }

    // Step 2: Prevent hard-delete if attendance records exist! Soft-delete / Archive instead!
    if (attendanceCount && attendanceCount > 0) {
      const { data: sessRow } = await supabaseServer
        .from('sessions')
        .select('class_name, target_academic_year')
        .eq('id', id)
        .maybeSingle();

      const origClassName = sessRow?.class_name || 'Class Session';
      const archivedClassName = origClassName.startsWith('[ARCHIVED]') ? origClassName : `[ARCHIVED] ${origClassName}`;

      const { error: archiveErr } = await supabaseServer
        .from('sessions')
        .update({
          class_name: archivedClassName,
          target_academic_year: 'Archived',
        })
        .eq('id', id);

      if (archiveErr) throw archiveErr;

      logAuditEvent({
        action: 'ARCHIVE_SESSION',
        targetType: 'session',
        targetId: id,
        actorId: session.username || session.name || 'admin',
        request,
        details: {
          reason: 'Hard-delete prevented: Preserved historical student attendance records',
          attendance_count: attendanceCount,
          original_class_name: origClassName,
          archived_class_name: archivedClassName,
          archived_at: new Date().toISOString(),
          actor_name: session.name,
          actor_role: session.role,
        },
      });

      return NextResponse.json({
        success: true,
        archived: true,
        message: `Session has ${attendanceCount} student attendance records and was safely archived to prevent data loss. Historical attendance records are preserved.`,
      });
    }

    // Step 3: If session is completely empty (0 attendance records), safe to hard-delete
    const { error } = await supabaseServer
      .from('sessions')
      .delete()
      .eq('id', id)
      .neq('class_name', '__SYSTEM_CONFIG__');

    if (error) throw error;

    logAuditEvent({
      action: 'DELETE_SESSION',
      targetType: 'session',
      targetId: id,
      actorId: session.username || session.name || 'admin',
      request,
      details: {
        reason: 'Empty session deleted (0 attendance records)',
        deleted_at: new Date().toISOString(),
        actor_name: session.name,
        actor_role: session.role,
      },
    });

    return NextResponse.json({ success: true, message: 'Empty session deleted successfully.' });
  } catch (err: any) {
    console.error('Error deleting session:', err);
    return NextResponse.json({ success: false, error: err.message || 'Failed to delete session' }, { status: 500 });
  }
}

