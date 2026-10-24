import { NextResponse, NextRequest } from 'next/server';
import { fetchBackend } from '@/lib/serverBackend';
import { verifySessionToken, SESSION_COOKIE_NAME } from '@/lib/serverAuth';
import { supabaseServer } from '@/lib/supabaseServer';
import { logAuditEvent } from '@/lib/auditLog';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/**
 * 🎓 POST /api/student/self-enroll-face
 * Allows an authenticated student to self-enroll their facial biometrics for the first time
 * using the high-accuracy 5-angle burst capture model.
 * 
 * Strict Security Guardrails:
 * 1. Must be authenticated with role 'Student'.
 * 2. Uses session.studentId (or session.studentRoll) from the cryptographically verified session.
 * 3. Strict One-Time Enforcement: If student.face_encoding is already populated, returns 403 Forbidden.
 * 4. DPDP Act 2023 Explicit Affirmative Consent check.
 * 5. Full tamper-evident audit logging.
 */
export async function POST(request: NextRequest) {
  try {
    const sessionCookie = request.cookies.get(SESSION_COOKIE_NAME)?.value;
    if (!sessionCookie) {
      return NextResponse.json(
        { detail: 'Unauthorized. Please log in to your student portal.' },
        { status: 401 }
      );
    }

    const session = await verifySessionToken(sessionCookie);
    if (!session || session.role !== 'Student') {
      return NextResponse.json(
        { detail: 'Access denied: This endpoint is dedicated to student portal self-enrollment.' },
        { status: 403 }
      );
    }

    // 1. Resolve student record from verified session
    let targetStudentId = session.studentId;
    let student: any = null;

    if (targetStudentId) {
      const { data, error } = await supabaseServer
        .from('students')
        .select('id, full_name, student_roll, academic_year, is_active, face_encoding, biometric_consent')
        .eq('id', targetStudentId)
        .maybeSingle();

      if (!error && data) {
        student = data;
      }
    }

    if (!student && session.studentRoll) {
      const { data, error } = await supabaseServer
        .from('students')
        .select('id, full_name, student_roll, academic_year, is_active, face_encoding, biometric_consent')
        .ilike('student_roll', session.studentRoll.trim())
        .maybeSingle();

      if (!error && data) {
        student = data;
        targetStudentId = data.id;
      }
    }

    if (!student || !targetStudentId) {
      return NextResponse.json(
        { detail: 'Student record could not be found in the registry.' },
        { status: 404 }
      );
    }

    if (student.is_active === false || String(student.academic_year || '').startsWith('[ARCHIVED]')) {
      return NextResponse.json(
        { detail: 'Archived student accounts cannot enroll biometric facial profiles.' },
        { status: 403 }
      );
    }

    // 2. Strict One-Time Lock Enforcement:
    // If student already has a registered face encoding, reject self-registration immediately!
    const hasExistingFace = Boolean(
      student.face_encoding &&
      Array.isArray(student.face_encoding) &&
      student.face_encoding.length > 0
    );

    if (hasExistingFace) {
      return NextResponse.json(
        {
          detail: 'Your Face ID is already registered and locked. If you need to update or reset your biometrics, please contact your college administrator.',
        },
        { status: 403 }
      );
    }

    const formData = await request.formData();

    // 3. Strict DPDP Act 2023 Compliance: Validate explicit affirmative consent
    const rawConsent = formData.get('consent_granted') || formData.get('consent');
    const isConsented =
      typeof rawConsent === 'string' &&
      ['true', '1', 'yes', 'affirmative'].includes(rawConsent.trim().toLowerCase());

    if (!isConsented) {
      return NextResponse.json(
        {
          detail: 'Biometric consent is mandatory before enrolling your facial template (DPDP Act 2023 Section 6(1)). Explicit affirmative consent must be confirmed.',
        },
        { status: 400 }
      );
    }

    // Attach verified consent metadata and actor
    formData.set('consent_version', 'v1.0-dpdp');
    formData.set('actor', `Student (${student.student_roll})`);

    // 4. Validate captured image frames
    const files = formData.getAll('files') as Blob[];
    if (!files || files.length === 0) {
      return NextResponse.json({ detail: 'No camera frames were captured.' }, { status: 400 });
    }

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

    // 5. Forward to backend 5-angle AI embedding extractor
    const res = await fetchBackend(`/api/enroll-face-burst/${targetStudentId}`, {
      method: 'POST',
      body: formData,
      headers: {
        'X-Actor-Id': String(targetStudentId),
        'X-Actor-Name': student.full_name || student.student_roll || 'Student',
        'X-Actor-Role': 'Student (Self-Enrollment)',
      },
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
        action: 'STUDENT_SELF_ENROLL_FACE',
        targetType: 'student',
        targetId: targetStudentId,
        actorId: student.student_roll,
        request,
        details: {
          student_id: targetStudentId,
          student_roll: student.student_roll,
          student_name: student.full_name,
          frames_count: files.length,
          biometric_consent: true,
          consent_version: 'v1.0-dpdp',
          compliance: 'DPDP Act 2023 Section 6(1) - Student Portal Self-Enrollment',
        },
      });
    }

    return NextResponse.json(data, { status: res.status });
  } catch (err: any) {
    console.error('[SELF_ENROLL_FACE ERROR]', err);
    return NextResponse.json(
      { detail: err.message || 'Face enrollment AI vision engine unreachable. Please ensure the server is active.' },
      { status: 500 }
    );
  }
}
