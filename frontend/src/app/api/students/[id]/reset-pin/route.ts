import { NextResponse, NextRequest } from 'next/server';
import { supabaseServer } from '@/lib/supabaseServer';
import { verifySessionToken, SESSION_COOKIE_NAME } from '@/lib/serverAuth';
import { logAuditEvent } from '@/lib/auditLog';

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

    // Reset PIN and password hash so initial login is restored
    const { error: resetErr } = await supabaseServer
      .from('students')
      .update({
        portal_pin: null,
        portal_password_hash: null,
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
      },
    });

    return NextResponse.json({
      success: true,
      message: `PIN for ${student.full_name} (Roll: ${student.student_roll}) has been reset successfully.`,
    });
  } catch (err: any) {
    console.error('Error resetting student PIN:', err);
    return NextResponse.json(
      { success: false, error: err.message || 'Failed to reset PIN.' },
      { status: 500 }
    );
  }
}
