import { NextResponse, NextRequest } from 'next/server';
import bcrypt from 'bcryptjs';
import { verifySessionToken, SESSION_COOKIE_NAME } from '@/lib/serverAuth';
import { supabaseServer } from '@/lib/supabaseServer';
import { logAuditEvent } from '@/lib/auditLog';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  try {
    const sessionCookie = request.cookies.get(SESSION_COOKIE_NAME)?.value;
    if (!sessionCookie) {
      return NextResponse.json({ success: false, error: 'Unauthorized: Session required.' }, { status: 401 });
    }

    const session = await verifySessionToken(sessionCookie);
    if (!session || session.role !== 'Student') {
      return NextResponse.json({ success: false, error: 'Unauthorized: Student session required.' }, { status: 403 });
    }

    const body = await request.json();
    const oldPin = (body.oldPin || '').toString().trim();
    const newPin = (body.newPin || '').toString().trim();

    // 1. Mandatory verification of current PIN
    if (!oldPin) {
      return NextResponse.json(
        { success: false, error: 'Current PIN is required to change your security PIN.' },
        { status: 400 }
      );
    }

    // 2. Validate 6-digit numeric format for new PIN
    if (!/^\d{6}$/.test(newPin)) {
      return NextResponse.json(
        { success: false, error: 'New PIN must be exactly 6 digits (e.g. 950426).' },
        { status: 400 }
      );
    }

    if (newPin === oldPin) {
      return NextResponse.json(
        { success: false, error: 'New PIN must be different from your current PIN.' },
        { status: 400 }
      );
    }

    // 3. Lookup student record
    const studentQuery = session.studentId
      ? supabaseServer.from('students').select('*').eq('id', session.studentId).maybeSingle()
      : supabaseServer.from('students').select('*').ilike('student_roll', session.studentRoll || '').maybeSingle();

    const { data: student, error: stuErr } = await studentQuery;
    if (stuErr || !student) {
      return NextResponse.json({ success: false, error: 'Student record not found.' }, { status: 404 });
    }

    // 4. Strict validation of old PIN against stored hash or activation PIN
    let isOldMatch = false;
    if (student.portal_password_hash && student.portal_password_hash.startsWith('$2')) {
      isOldMatch = await bcrypt.compare(oldPin, student.portal_password_hash);
    }
    if (!isOldMatch && student.portal_pin && student.portal_pin !== 'TEMP') {
      isOldMatch = (oldPin === student.portal_pin.trim());
    }

    if (!isOldMatch) {
      return NextResponse.json({ success: false, error: 'Current PIN is incorrect.' }, { status: 401 });
    }

    // 5. Hash the new PIN with salted bcrypt (10 rounds)
    const passwordHash = await bcrypt.hash(newPin, 10);

    // 6. Update student record: save new hash and clear temporary tags
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

    // 7. Audit Logging
    logAuditEvent({
      action: 'STUDENT_CHANGED_PIN',
      targetType: 'student',
      targetId: student.id,
      actorId: student.student_roll || session.username,
      request,
      details: {
        student_roll: student.student_roll,
        full_name: student.full_name,
      },
    });

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
