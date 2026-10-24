import { NextResponse, NextRequest } from 'next/server';
import { fetchBackend } from '@/lib/serverBackend';
import { verifySessionToken, SESSION_COOKIE_NAME } from '@/lib/serverAuth';
import { supabaseServer } from '@/lib/supabaseServer';

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
    if (!session || session.role !== 'Super Admin') {
      return NextResponse.json(
        { detail: 'Access denied: Only Super Admin is authorized to register or modify student Face ID biometrics.' },
        { status: 403 }
      );
    }

    const { studentId } = await params;

    // Check student existence and active status
    const { data: studentInfo } = await supabaseServer
      .from('students')
      .select('id, student_roll, academic_year, is_active')
      .eq('id', studentId)
      .maybeSingle();

    if (studentInfo && (studentInfo.is_active === false || String(studentInfo.academic_year || '').startsWith('[ARCHIVED]'))) {
      return NextResponse.json(
        { detail: 'Cannot register or modify facial biometrics for an archived or inactive student profile.' },
        { status: 403 }
      );
    }

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

    const file = formData.get('file') as Blob | null;
    if (file) {
      if (file.size > 6 * 1024 * 1024) {
        return NextResponse.json({ detail: 'Enrollment photo too large (Max 6MB).' }, { status: 413 });
      }
      if (file.type && !file.type.startsWith('image/')) {
        return NextResponse.json({ detail: 'Only image files are permitted.' }, { status: 415 });
      }
    }

    const res = await fetchBackend(`/api/enroll-face/${studentId}`, {
      method: 'POST',
      body: formData,
      headers: {
        'X-Actor-Id': session.username || session.userId || '',
        'X-Actor-Name': session.name || session.username || 'Super Admin',
        'X-Actor-Role': session.role || 'Super Admin',
      },
    });

    let data;
    try {
      data = await res.json();
    } catch {
      const text = await res.text().catch(() => '');
      data = { detail: text || `Upstream returned status ${res.status}` };
    }
    return NextResponse.json(data, { status: res.status });
  } catch (err: any) {
    console.error('Face enrollment single error:', err);
    return NextResponse.json(
      { detail: err.message || 'Face enrollment AI engine unreachable.' },
      { status: 500 }
    );
  }
}

