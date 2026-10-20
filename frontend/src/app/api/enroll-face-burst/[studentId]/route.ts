import { NextResponse, NextRequest } from 'next/server';
import { fetchBackend } from '@/lib/serverBackend';
import { verifySessionToken, SESSION_COOKIE_NAME } from '@/lib/serverAuth';
import { logAuditEvent } from '@/lib/auditLog';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ studentId: string }> }
) {
  try {
    const sessionCookie = request.cookies.get(SESSION_COOKIE_NAME)?.value;
    if (!sessionCookie) {
      return NextResponse.json(
        { detail: 'Unauthorized. Super Admin login is required to register facial biometrics.' },
        { status: 401 }
      );
    }

    const session = await verifySessionToken(sessionCookie);
    if (!session || (session.role !== 'Super Admin' && session.role !== 'Admin')) {
      return NextResponse.json(
        { detail: 'Access denied: Only Super Admin or Admin is authorized to register or modify student Face ID biometrics.' },
        { status: 403 }
      );
    }

    const { studentId } = await params;
    const formData = await request.formData();

    // Strict DPDP Act 2023 Compliance: Validate affirmative biometric consent
    const rawConsent = formData.get('consent_granted') || formData.get('consent');
    const isConsented = typeof rawConsent === 'string' && ['true', '1', 'yes'].includes(rawConsent.trim().toLowerCase());

    if (!isConsented) {
      return NextResponse.json(
        { detail: 'Biometric consent is mandatory before enrolling facial template (DPDP Act 2023). Explicit affirmative consent must be confirmed.' },
        { status: 400 }
      );
    }

    // Ensure consent metadata is attached
    if (!formData.has('consent_version')) {
      formData.set('consent_version', 'v1.0-dpdp');
    }
    if (!formData.has('actor')) {
      formData.set('actor', session.name || session.username || 'Super Admin');
    }

    const files = formData.getAll('files') as Blob[];
    if (files.length > 10) {
      return NextResponse.json({ detail: 'Maximum 10 angle photos allowed per burst.' }, { status: 400 });
    }
    for (const f of files) {
      if (f.size > 6 * 1024 * 1024) {
        return NextResponse.json({ detail: 'Each burst photo must be under 6MB.' }, { status: 413 });
      }
      if (f.type && !f.type.startsWith('image/')) {
        return NextResponse.json({ detail: 'Only image files are permitted.' }, { status: 415 });
      }
    }

    const res = await fetchBackend(`/api/enroll-face-burst/${studentId}`, {
      method: 'POST',
      body: formData,
    });

    let data;
    try {
      data = await res.json();
    } catch {
      const text = await res.text().catch(() => '');
      data = { detail: text || `Upstream returned status ${res.status}` };
    }
    if (res.ok) {
      logAuditEvent({
        action: 'ENROLL_FACE',
        targetType: 'student',
        targetId: studentId,
        actorId: session.username || session.name || 'admin',
        request,
        details: {
          student_id: studentId,
          frames_count: files.length,
          biometric_consent: true,
          consent_version: 'v1.0-dpdp',
          compliance: 'DPDP Act 2023 Section 6(1) - Explicit Affirmative Biometric Consent',
          actor_name: session.name,
          actor_role: session.role,
        },
      });
    }

    return NextResponse.json(data, { status: res.status });
  } catch (err: any) {
    console.error('Face enrollment error:', err);
    return NextResponse.json(
      { detail: err.message || 'Face enrollment AI engine unreachable. Please ensure your backend is running.' },
      { status: 500 }
    );
  }
}

