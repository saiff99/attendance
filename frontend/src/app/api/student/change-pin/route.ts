import { NextResponse, NextRequest } from 'next/server';
import bcrypt from 'bcryptjs';
import { verifySessionToken, SESSION_COOKIE_NAME } from '@/lib/serverAuth';
import { supabaseServer } from '@/lib/supabaseServer';

export async function POST(request: NextRequest) {
  try {
    const sessionCookie = request.cookies.get(SESSION_COOKIE_NAME)?.value;
    if (!sessionCookie) {
      return NextResponse.json({ success: false, error: 'Unauthorized: Session required.' }, { status: 401 });
    }

    const session = await verifySessionToken(sessionCookie);
    if (!session || (session.role !== 'Student' && session.role !== 'Super Admin')) {
      return NextResponse.json({ success: false, error: 'Unauthorized: Student session required.' }, { status: 403 });
    }

    const body = await request.json();
    const newPin = (body.newPin || '').toString().trim();
    const oldPin = (body.oldPin || '').toString().trim();

    // Validate 6-digit numeric PIN format
    if (!/^\d{6}$/.test(newPin)) {
      return NextResponse.json(
        { success: false, error: 'PIN must be exactly 6 digits (e.g. 950426).' },
        { status: 400 }
      );
    }

    // Lookup student
    const studentQuery = session.studentId
      ? supabaseServer.from('students').select('*').eq('id', session.studentId).maybeSingle()
      : supabaseServer.from('students').select('*').ilike('student_roll', session.studentRoll || '').maybeSingle();

    const { data: student, error: stuErr } = await studentQuery;
    if (stuErr || !student) {
      return NextResponse.json({ success: false, error: 'Student record not found.' }, { status: 404 });
    }

    // If oldPin is provided, verify it; otherwise allow authenticated session to update new PIN directly
    if (session.role === 'Student' && oldPin) {
      let isOldMatch = false;
      if (student.portal_password_hash && student.portal_password_hash.startsWith('$2')) {
        isOldMatch = await bcrypt.compare(oldPin, student.portal_password_hash);
      }
      if (!isOldMatch && student.portal_pin) {
        isOldMatch = (oldPin === student.portal_pin.trim());
      }
      if (!isOldMatch) {
        return NextResponse.json({ success: false, error: 'Current PIN is incorrect.' }, { status: 401 });
      }
    }

    // Hash the PIN with bcrypt (10 rounds)
    const passwordHash = await bcrypt.hash(newPin, 10);

    // Update students table: store salted bcrypt hash and clear plain text PIN
    const { error: updateErr } = await supabaseServer
      .from('students')
      .update({
        portal_pin: null,
        portal_password_hash: passwordHash,
      })
      .eq('id', student.id);

    if (updateErr) {
      throw updateErr;
    }

    return NextResponse.json({
      success: true,
      message: 'Security PIN updated successfully.',
    });
  } catch (err: any) {
    console.error('Failed to update student PIN:', err);
    return NextResponse.json(
      { success: false, error: err.message || 'Failed to update PIN.' },
      { status: 500 }
    );
  }
}
