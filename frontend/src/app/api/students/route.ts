import { NextResponse, NextRequest } from 'next/server';
import { supabaseServer } from '@/lib/supabaseServer';
import { verifySessionToken, SESSION_COOKIE_NAME } from '@/lib/serverAuth';
import { isCohortMatching } from '@/lib/cohort';
import { logAuditEvent } from '@/lib/auditLog';
import { getParentPhone, encodeStudentEmail, cleanPhoneNumber } from '@/lib/studentContact';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
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

    const { searchParams } = new URL(request.url);
    const cohort = searchParams.get('cohort');

    const { data, error } = await supabaseServer
      .from('students')
      .select('id, student_roll, full_name, email, academic_year, is_active, archived_at, face_encoding, created_at')
      .order('student_roll', { ascending: true });

    if (error) throw error;

    let rawStudents = data || [];
    const includeArchived = searchParams.get('include_archived') === 'true';
    if (!includeArchived) {
      rawStudents = rawStudents.filter((s: any) => s.is_active !== false && !String(s.academic_year || '').startsWith('[ARCHIVED]'));
    }
    if (cohort && cohort !== 'All') {
      rawStudents = rawStudents.filter(s => isCohortMatching(cohort, s.academic_year));
    }

    const students = rawStudents.map((s: any) => {
      const hasFace = !!(
        s.face_encoding &&
        (Array.isArray(s.face_encoding)
          ? s.face_encoding.length > 0
          : typeof s.face_encoding === 'object' && Object.keys(s.face_encoding).length > 0 && !(s.face_encoding as any).parent_phone)
      );

      const phone = getParentPhone(s) || null;

      return {
        id: s.id,
        student_roll: s.student_roll,
        full_name: s.full_name,
        email: s.email,
        academic_year: s.academic_year,
        parent_phone: phone,
        created_at: s.created_at,
        has_face: hasFace,
        face_encoding: hasFace ? true : null,
      };
    });

    return NextResponse.json({
      success: true,
      students,
    });
  } catch (err: any) {
    console.error('Error fetching students via API:', err);
    return NextResponse.json({ success: false, error: err.message || 'Failed to fetch students' }, { status: 500 });
  }
}

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

    // Check duplicate roll number (case-insensitive)
    const { data: existingCheck } = await supabaseServer
      .from('students')
      .select('id, student_roll, full_name, academic_year, is_active')
      .ilike('student_roll', cleanRoll)
      .maybeSingle();

    const selectFields = 'id, student_roll, full_name, email, academic_year, created_at';

    if (existingCheck) {
      const isArchived = existingCheck.is_active === false || String(existingCheck.academic_year || '').startsWith('[ARCHIVED]');
      if (!isArchived) {
        return NextResponse.json({
          success: false,
          error: `Duplicate Roll Number! Roll "${existingCheck.student_roll}" is already registered to "${existingCheck.full_name}".`
        }, { status: 409 });
      }

      // Seamlessly reactivate and restore archived student
      const encodedEmail = encodeStudentEmail(cleanRoll, cleanPhone || undefined);
      const updatePayload: any = {
        full_name: cleanName,
        academic_year: cleanYear,
        email: encodedEmail,
        is_active: true,
        archived_at: null,
        face_encoding: cleanPhone ? { parent_phone: cleanPhone } : null,
        biometric_consent: false,
        biometric_consent_date: null,
        portal_pin: null,
        portal_password_hash: null,
      };
      if (cleanPhone) updatePayload.parent_phone = cleanPhone;

      let { data: reactivated, error: reactivateErr } = await supabaseServer
        .from('students')
        .update(updatePayload)
        .eq('id', existingCheck.id)
        .select(selectFields)
        .single();

      if (reactivateErr && (reactivateErr.code === 'PGRST204' || reactivateErr.message?.includes('parent_phone') || reactivateErr.message?.includes('biometric_consent') || reactivateErr.message?.includes('is_active'))) {
        const fallbackPayload: any = {
          full_name: cleanName,
          academic_year: cleanYear,
          email: encodedEmail,
          is_active: true,
          archived_at: null,
          face_encoding: cleanPhone ? { parent_phone: cleanPhone } : null,
        };
        const retry = await supabaseServer
          .from('students')
          .update(fallbackPayload)
          .eq('id', existingCheck.id)
          .select(selectFields)
          .single();
        if (retry.error) throw retry.error;
        reactivated = retry.data;
      } else if (reactivateErr) {
        throw reactivateErr;
      }

      logAuditEvent({
        action: 'RESTORE_ARCHIVED_STUDENT',
        targetType: 'student',
        targetId: existingCheck.id,
        actorId: session.username || session.name || 'admin',
        request,
        details: {
          student_roll: cleanRoll,
          full_name: cleanName,
          academic_year: cleanYear,
          actor_name: session.name,
          actor_role: session.role,
          restored_from_archive: true,
        },
      });

      const sanitizedStudent = reactivated ? {
        id: reactivated.id,
        student_roll: reactivated.student_roll,
        full_name: reactivated.full_name,
        email: reactivated.email,
        academic_year: reactivated.academic_year,
        parent_phone: cleanPhone || null,
        created_at: reactivated.created_at,
        has_face: false,
        face_encoding: null,
      } : null;

      return NextResponse.json({
        success: true,
        student: sanitizedStudent,
        message: `Student '${cleanName}' (Roll ${cleanRoll}) was restored from archive and reactivated successfully!`,
      }, { status: 201 });
    }

    // Persistently encode WhatsApp phone into student.local email
    const encodedEmail = encodeStudentEmail(cleanRoll, cleanPhone || undefined);

    const basePayload: any = {
      student_roll: cleanRoll,
      full_name: cleanName,
      email: encodedEmail,
      academic_year: cleanYear,
    };

    const fullPayload: any = {
      ...basePayload,
      face_encoding: cleanPhone ? { parent_phone: cleanPhone } : null,
      biometric_consent: false,
      biometric_consent_date: null,
    };
    if (cleanPhone) fullPayload.parent_phone = cleanPhone;

    let { data, error } = await supabaseServer
      .from('students')
      .insert([fullPayload])
      .select(selectFields)
      .single();

    if (error && (error.code === 'PGRST204' || error.message?.includes('parent_phone') || error.message?.includes('biometric_consent'))) {
      const fallbackPayload: any = {
        ...basePayload,
        face_encoding: cleanPhone ? { parent_phone: cleanPhone } : null,
      };
      const retry = await supabaseServer
        .from('students')
        .insert([fallbackPayload])
        .select(selectFields)
        .single();
      if (retry.error) throw retry.error;
      data = retry.data;
    } else if (error) {
      throw error;
    }

    logAuditEvent({
      action: 'ADD_STUDENT',
      targetType: 'student',
      targetId: data?.id || cleanRoll,
      actorId: session.username || session.name || 'admin',
      request,
      details: {
        student_roll: cleanRoll,
        full_name: cleanName,
        academic_year: cleanYear,
        actor_name: session.name,
        actor_role: session.role,
      },
    });

    const sanitizedStudent = data ? {
      id: data.id,
      student_roll: data.student_roll,
      full_name: data.full_name,
      email: data.email,
      academic_year: data.academic_year,
      parent_phone: cleanPhone || null,
      created_at: data.created_at,
      has_face: false,
      face_encoding: null,
    } : null;

    return NextResponse.json({
      success: true,
      student: sanitizedStudent,
    });
  } catch (err: any) {
    console.error('Error creating student via API:', err);
    return NextResponse.json({ success: false, error: err.message || 'Failed to create student' }, { status: 500 });
  }
}
