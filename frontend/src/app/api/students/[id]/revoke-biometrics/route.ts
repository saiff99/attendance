import { NextResponse, NextRequest } from 'next/server';
import { supabaseServer } from '@/lib/supabaseServer';
import { verifySessionToken, SESSION_COOKIE_NAME } from '@/lib/serverAuth';
import { logAuditEvent } from '@/lib/auditLog';
import { fetchBackend } from '@/lib/serverBackend';

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
    if (!session || (session.role !== 'Super Admin' && session.role !== 'Admin' && session.role !== 'Faculty')) {
      return NextResponse.json(
        { success: false, error: 'Forbidden. Authorized access required.' },
        { status: 403 }
      );
    }

    const { id } = await params;
    if (!id) {
      return NextResponse.json({ success: false, error: 'Student ID is required.' }, { status: 400 });
    }

    // Verify student exists
    const { data: student, error: fetchErr } = await supabaseServer
      .from('students')
      .select('id, student_roll, full_name')
      .eq('id', id)
      .maybeSingle();

    if (fetchErr || !student) {
      return NextResponse.json({ success: false, error: 'Student record not found.' }, { status: 404 });
    }

    // 1. Permanently erase biometric face encoding and reset consent flags in database
    const { error: resetErr } = await supabaseServer
      .from('students')
      .update({
        face_encoding: null,
        biometric_consent: false,
        biometric_consent_date: null,
      })
      .eq('id', id);

    if (resetErr) {
      console.error('[ERASURE ERROR] Failed to reset biometric consent in database:', resetErr);
      return NextResponse.json(
        { success: false, error: `Database update failed while revoking biometrics: ${resetErr.message}` },
        { status: 500 }
      );
    }

    // 2. Notify AI backend to immediately invalidate in-memory stream and session cache
    let backendInvalidationResult: any = null;
    try {
      const backendRes = await fetchBackend(`/api/students/${encodeURIComponent(id)}/revoke-biometrics`, {
        method: 'POST',
      });
      if (backendRes.ok) {
        backendInvalidationResult = await backendRes.json().catch(() => null);
      }
    } catch (bErr) {
      console.warn('[WARN] AI backend unreachable for immediate stream cache invalidation:', bErr);
    }

    // 3. Log Immutable Audit Event for DPDP Compliance
    logAuditEvent({
      action: 'REVOKE_BIOMETRIC_CONSENT',
      targetType: 'student',
      targetId: id,
      actorId: session.username || session.name || 'admin',
      request,
      details: {
        student_roll: student.student_roll,
        student_name: student.full_name,
        compliance: 'DPDP Act 2023 Section 6(4) - Right to Withdraw Consent & Erasure',
        actor_name: session.name,
        actor_role: session.role,
        revoked_at: new Date().toISOString(),
      },
    });

    return NextResponse.json({
      success: true,
      message: `Facial biometric template for ${student.full_name} (${student.student_roll}) has been permanently erased and consent revoked.`,
    });
  } catch (err: any) {
    console.error('Error revoking biometrics:', err);
    return NextResponse.json(
      { success: false, error: err.message || 'Failed to revoke biometric data.' },
      { status: 500 }
    );
  }
}
