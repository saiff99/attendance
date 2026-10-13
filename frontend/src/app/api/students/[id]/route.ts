import { NextResponse, NextRequest } from 'next/server';
import { supabaseServer } from '@/lib/supabaseServer';
import { verifySessionToken, SESSION_COOKIE_NAME } from '@/lib/serverAuth';
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
    if (!session || (session.role !== 'Super Admin' && session.role !== 'Faculty')) {
      return NextResponse.json(
        { success: false, error: 'Forbidden. Faculty or Super Admin access required.' },
        { status: 403 }
      );
    }

    const { id } = await params;
    const { data, error } = await supabaseServer
      .from('students')
      .select('id, student_roll, full_name, email, academic_year, parent_phone, face_encoding, created_at')
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

    let phone = data.parent_phone || null;
    if (!phone && data.face_encoding && typeof data.face_encoding === 'object' && !Array.isArray(data.face_encoding) && (data.face_encoding as any).parent_phone) {
      phone = (data.face_encoding as any).parent_phone;
    }

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
    if (!session || (session.role !== 'Super Admin' && session.role !== 'Faculty')) {
      return NextResponse.json(
        { success: false, error: 'Forbidden. Faculty or Super Admin access required.' },
        { status: 403 }
      );
    }

    const { id } = await params;
    const body = await request.json();

    const cleanRoll = (body.student_roll || '').trim();
    const cleanName = (body.full_name || '').trim();
    const cleanEmail = (body.email || '').trim().toLowerCase();
    const cleanYear = (body.academic_year || '1st Year').trim();
    const cleanPhone = body.parent_phone ? body.parent_phone.trim() : null;

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

    const basePayload: any = {
      student_roll: cleanRoll,
      full_name: cleanName,
      email: cleanEmail,
      academic_year: cleanYear,
    };
    if (cleanPhone) basePayload.parent_phone = cleanPhone;

    const selectFields = 'id, student_roll, full_name, email, academic_year, parent_phone, face_encoding, created_at';

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
      details: { student_roll: cleanRoll, full_name: cleanName, academic_year: cleanYear },
    });

    const hasFace = !!(
      data?.face_encoding &&
      (Array.isArray(data.face_encoding)
        ? data.face_encoding.length > 0
        : typeof data.face_encoding === 'object' && Object.keys(data.face_encoding).length > 0 && !(data.face_encoding as any).parent_phone)
    );

    let phone = data?.parent_phone || null;
    if (!phone && data?.face_encoding && typeof data.face_encoding === 'object' && !Array.isArray(data.face_encoding) && (data.face_encoding as any).parent_phone) {
      phone = (data.face_encoding as any).parent_phone;
    }

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
    if (!session || (session.role !== 'Super Admin' && session.role !== 'Faculty')) {
      return NextResponse.json(
        { success: false, error: 'Forbidden. Faculty or Super Admin access required.' },
        { status: 403 }
      );
    }

    const { id } = await params;

    // First delete any linked attendance records to maintain DB integrity
    await supabaseServer.from('attendance').delete().eq('student_id', id);

    // Delete the student profile
    const { error } = await supabaseServer.from('students').delete().eq('id', id);
    if (error) throw error;

    logAuditEvent({
      action: 'DELETE_STUDENT',
      targetType: 'student',
      targetId: id,
      details: { deleted_at: new Date().toISOString() },
    });

    return NextResponse.json({ success: true });
  } catch (err: any) {
    console.error('Error deleting student via API:', err);
    return NextResponse.json({ success: false, error: err.message || 'Failed to delete student' }, { status: 500 });
  }
}
