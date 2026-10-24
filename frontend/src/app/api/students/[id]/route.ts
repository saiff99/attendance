import { NextResponse, NextRequest } from 'next/server';
import { supabaseServer } from '@/lib/supabaseServer';
import { verifySessionToken, SESSION_COOKIE_NAME } from '@/lib/serverAuth';
import { logAuditEvent } from '@/lib/auditLog';
import { getParentPhone, encodeStudentEmail, cleanPhoneNumber } from '@/lib/studentContact';

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
    const { data, error } = await supabaseServer
      .from('students')
      .select('id, student_roll, full_name, email, academic_year, face_encoding, created_at')
      .eq('id', id)
      .maybeSingle();

    if (error || !data) {
      return NextResponse.json({ success: false, error: 'Student not found.' }, { status: 404 });
    }

    const hasFace = !!(
      data.face_encoding &&
      (Array.isArray(data.face_encoding)
        ? data.face_encoding.length > 0
        : typeof data.face_encoding === 'object' && Object.keys(data.face_encoding).length > 0 && !(data.face_encoding as any).parent_phone)
    );

    const phone = getParentPhone(data) || null;

    return NextResponse.json({
      success: true,
      student: {
        id: data.id,
        student_roll: data.student_roll,
        full_name: data.full_name,
        email: data.email,
        academic_year: data.academic_year,
        parent_phone: phone,
        created_at: data.created_at,
        has_face: hasFace,
        face_encoding: hasFace ? true : null,
      },
    });
  } catch (err: any) {
    console.error('Error fetching student via API:', err);
    return NextResponse.json({ success: false, error: err.message || 'Failed to fetch student' }, { status: 500 });
  }
}

export async function PUT(
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
    const body = await request.json();

    const cleanRoll = (body.student_roll || '').trim();
    const cleanName = (body.full_name || '').trim();
    const cleanYear = (body.academic_year || '1st Year').trim();
    const rawPhone = body.parent_phone ? String(body.parent_phone).trim() : '';
    const cleanPhone = rawPhone ? cleanPhoneNumber(rawPhone) : null;

    if (!cleanRoll) {
      return NextResponse.json({ success: false, error: 'Roll Number is required.' }, { status: 400 });
    }
    if (!cleanName) {
      return NextResponse.json({ success: false, error: 'Full Name is required.' }, { status: 400 });
    }

    // Check if another student has the same roll number
    const { data: existingCheck } = await supabaseServer
      .from('students')
      .select('id, student_roll, full_name, academic_year')
      .ilike('student_roll', cleanRoll)
      .maybeSingle();

    if (existingCheck && existingCheck.id !== id) {
      return NextResponse.json({
        success: false,
        error: `Duplicate Roll Number! Roll "${existingCheck.student_roll}" is already registered to "${existingCheck.full_name}".`
      }, { status: 409 });
    }

    // Persistently encode WhatsApp phone into student.local email
    const encodedEmail = encodeStudentEmail(cleanRoll, cleanPhone || undefined);

    const basePayload: any = {
      student_roll: cleanRoll,
      full_name: cleanName,
      email: encodedEmail,
      academic_year: cleanYear,
    };
    if (cleanPhone) basePayload.parent_phone = cleanPhone;

    const selectFields = 'id, student_roll, full_name, email, academic_year, face_encoding, created_at';

    let { data, error } = await supabaseServer
      .from('students')
      .update(basePayload)
      .eq('id', id)
      .select(selectFields)
      .single();

    if (error && (error.code === 'PGRST204' || error.message?.includes('parent_phone'))) {
      delete basePayload.parent_phone;
      const retry = await supabaseServer
        .from('students')
        .update(basePayload)
        .eq('id', id)
        .select(selectFields)
        .single();
      if (retry.error) throw retry.error;
      data = retry.data;
    } else if (error) {
      throw error;
    }

    logAuditEvent({
      action: 'UPDATE_STUDENT',
      targetType: 'student',
      targetId: id,
      actorId: session.username || session.name || 'faculty',
      request,
      details: {
        student_roll: cleanRoll,
        full_name: cleanName,
        academic_year: cleanYear,
        actor_name: session.name,
        actor_role: session.role,
      },
    });

    const hasFace = !!(
      data?.face_encoding &&
      (Array.isArray(data.face_encoding)
        ? data.face_encoding.length > 0
        : typeof data.face_encoding === 'object' && Object.keys(data.face_encoding).length > 0 && !(data.face_encoding as any).parent_phone)
    );

    const phone = getParentPhone(data) || cleanPhone || null;

    const sanitizedStudent = data ? {
      id: data.id,
      student_roll: data.student_roll,
      full_name: data.full_name,
      email: data.email,
      academic_year: data.academic_year,
      parent_phone: phone,
      created_at: data.created_at,
      has_face: hasFace,
      face_encoding: hasFace ? true : null,
    } : null;

    return NextResponse.json({
      success: true,
      student: sanitizedStudent,
    });
  } catch (err: any) {
    console.error('Error updating student via API:', err);
    return NextResponse.json({ success: false, error: err.message || 'Failed to update student' }, { status: 500 });
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
    if (!session || (session.role !== 'Super Admin' && session.role !== 'Admin' && session.role !== 'Faculty')) {
      return NextResponse.json(
        { success: false, error: 'Forbidden. Authorized access required.' },
        { status: 403 }
      );
    }

    const { id } = await params;

    // Step 1: Check if the student has any historical attendance records
    const { count: attendanceCount, error: countErr } = await supabaseServer
      .from('attendance')
      .select('*', { count: 'exact', head: true })
      .eq('student_id', id);

    // Step 2: If student has attendance records, DO NOT delete attendance records! Soft-delete / Archive instead!
    if (attendanceCount && attendanceCount > 0) {
      const { data: studentRow } = await supabaseServer
        .from('students')
        .select('student_roll, full_name, email, academic_year')
        .eq('id', id)
        .maybeSingle();

      const origYear = studentRow?.academic_year || '1st Year';
      const archivedYear = origYear.startsWith('[ARCHIVED]') ? origYear : `[ARCHIVED] ${origYear}`;

      // Soft-delete: Erase biometrics (DPDP Act compliance), revoke portal credentials, and archive student
      // Historical attendance records in 'attendance' table remain 100% UNTOUCHED!
      const archiveNow = new Date().toISOString();
      const { error: archiveErr } = await supabaseServer
        .from('students')
        .update({
          is_active: false,
          archived_at: archiveNow,
          academic_year: archivedYear,
          face_encoding: null,
          biometric_consent: false,
          biometric_consent_date: null,
          portal_pin: null,
          portal_password_hash: null,
        })
        .eq('id', id);

      if (archiveErr) throw archiveErr;

      logAuditEvent({
        action: 'ARCHIVE_STUDENT',
        targetType: 'student',
        targetId: id,
        actorId: session.username || session.name || 'admin',
        request,
        details: {
          student_roll: studentRow?.student_roll,
          student_name: studentRow?.full_name,
          preserved_attendance_count: attendanceCount,
          reason: 'Hard-delete prevented: Preserved historical attendance records (soft-delete)',
          archived_at: new Date().toISOString(),
          actor_name: session.name,
          actor_role: session.role,
        },
      });

      return NextResponse.json({
        success: true,
        archived: true,
        preservedAttendanceCount: attendanceCount,
        message: `Student archived and biometrics erased. All ${attendanceCount} historical attendance records were safely preserved.`,
      });
    }

    // Step 3: If student has 0 attendance records (e.g. newly created typo), clean hard-delete is safe
    const { error: deleteErr } = await supabaseServer.from('students').delete().eq('id', id);
    if (deleteErr) throw deleteErr;

    logAuditEvent({
      action: 'DELETE_STUDENT',
      targetType: 'student',
      targetId: id,
      actorId: session.username || session.name || 'admin',
      request,
      details: {
        reason: 'Empty student record deleted (0 attendance records)',
        deleted_at: new Date().toISOString(),
        actor_name: session.name,
        actor_role: session.role,
      },
    });

    return NextResponse.json({ success: true, message: 'Student record deleted successfully.' });
  } catch (err: any) {
    console.error('Error deleting student via API:', err);
    return NextResponse.json({ success: false, error: err.message || 'Failed to delete student' }, { status: 500 });
  }
}
