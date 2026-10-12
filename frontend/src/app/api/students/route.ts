import { NextResponse, NextRequest } from 'next/server';
import { supabaseServer } from '@/lib/supabaseServer';
import { verifySessionToken, SESSION_COOKIE_NAME } from '@/lib/serverAuth';
import { isCohortMatching } from '@/lib/cohort';
import { logAuditEvent } from '@/lib/auditLog';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
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

    const { searchParams } = new URL(request.url);
    const cohort = searchParams.get('cohort');

    const { data, error } = await supabaseServer
      .from('students')
      .select('*')
      .order('student_roll', { ascending: true });

    if (error) throw error;

    let students = data || [];
    if (cohort && cohort !== 'All') {
      students = students.filter(s => isCohortMatching(cohort, s.academic_year));
    }

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
    if (!session || (session.role !== 'Super Admin' && session.role !== 'Faculty')) {
      return NextResponse.json(
        { success: false, error: 'Forbidden. Faculty or Super Admin access required.' },
        { status: 403 }
      );
    }

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

    // Check duplicate roll number (case-insensitive)
    const { data: existingCheck } = await supabaseServer
      .from('students')
      .select('id, student_roll, full_name, academic_year')
      .ilike('student_roll', cleanRoll)
      .maybeSingle();

    if (existingCheck) {
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

    const fullPayload: any = {
      ...basePayload,
      face_encoding: cleanPhone ? { parent_phone: cleanPhone } : null,
      biometric_consent: true,
    };
    if (cleanPhone) fullPayload.parent_phone = cleanPhone;

    let { data, error } = await supabaseServer
      .from('students')
      .insert([fullPayload])
      .select()
      .single();

    if (error && (error.code === 'PGRST204' || error.message?.includes('parent_phone') || error.message?.includes('biometric_consent'))) {
      const fallbackPayload: any = {
        ...basePayload,
        face_encoding: cleanPhone ? { parent_phone: cleanPhone } : null,
      };
      const retry = await supabaseServer
        .from('students')
        .insert([fallbackPayload])
        .select()
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
      details: { student_roll: cleanRoll, full_name: cleanName, academic_year: cleanYear },
    });

    return NextResponse.json({
      success: true,
      student: data,
    });
  } catch (err: any) {
    console.error('Error creating student via API:', err);
    return NextResponse.json({ success: false, error: err.message || 'Failed to create student' }, { status: 500 });
  }
}
