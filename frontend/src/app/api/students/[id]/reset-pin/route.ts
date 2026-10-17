import { NextResponse, NextRequest } from 'next/server';
import { supabaseServer } from '@/lib/supabaseServer';
import { verifySessionToken, SESSION_COOKIE_NAME } from '@/lib/serverAuth';
import { logAuditEvent } from '@/lib/auditLog';

import crypto from 'crypto';
import bcrypt from 'bcryptjs';

export const dynamic = 'force-dynamic';

export async function POST(
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
    if (!id) {
      return NextResponse.json({ success: false, error: 'Student ID required.' }, { status: 400 });
    }

    // Verify student exists
    const { data: student, error: fetchErr } = await supabaseServer
      .from('students')
      .select('id, student_roll, full_name')
      .eq('id', id)
      .maybeSingle();

    if (fetchErr || !student) {
      return NextResponse.json({ success: false, error: 'Student not found.' }, { status: 404 });
    }

    // Generate cryptographically random 6-digit temporary activation PIN
    const tempPin = Math.floor(100000 + crypto.randomInt(900000)).toString();
    const tempPinHash = await bcrypt.hash(tempPin, 10);

    // Save temporary hash and tag portal_pin as 'TEMP'
    const { error: resetErr } = await supabaseServer
      .from('students')
      .update({
        portal_pin: 'TEMP',
        portal_password_hash: tempPinHash,
      })
      .eq('id', id);

    if (resetErr) {
      throw resetErr;
    }

    logAuditEvent({
      action: 'RESET_STUDENT_PIN',
      targetType: 'student',
      targetId: id,
      actorId: session.username || session.name || 'admin',
      request,
      details: {
        student_roll: student.student_roll,
        full_name: student.full_name,
        actor_name: session.name,
        actor_role: session.role,
        temporary_pin_issued: true,
      },
    });

    return NextResponse.json({
      success: true,
      tempPin,
      studentRoll: student.student_roll,
      fullName: student.full_name,
      message: `Temporary activation PIN for ${student.full_name} (Roll: ${student.student_roll}) has been generated successfully.`,
    });
  } catch (err: any) {
    console.error('Error resetting student PIN:', err);
    return NextResponse.json(
      { success: false, error: err.message || 'Failed to reset PIN.' },
      { status: 500 }
    );
  }
}
