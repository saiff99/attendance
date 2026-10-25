import { NextResponse, NextRequest } from 'next/server';
import { supabaseServer } from '@/lib/supabaseServer';
import { isCohortMatching } from '@/lib/cohort';
import { fetchBackend } from '@/lib/serverBackend';
import { isValidUuid, verifyCheckinToken, generateCheckinToken } from '@/lib/attendanceAuth';
import { getTrustedClientIp, checkStudentLookupRateLimit } from '@/lib/rateLimiter';
import { verifySessionToken, SESSION_COOKIE_NAME } from '@/lib/serverAuth';

export const dynamic = 'force-dynamic';

/**
 * Masks student full name for public unauthenticated endpoints to prevent roster scraping.
 * Example: "Sk Saifuddin" -> "Sk Sa******n", "Rahul Roy" -> "R***l R*y"
 */
export function maskStudentName(fullName: string): string {
  if (!fullName || typeof fullName !== 'string') return '';
  const parts = fullName.trim().split(/\s+/);
  return parts.map(part => {
    if (part.length <= 2) {
      return part;
    } else if (part.length === 3) {
      return `${part[0]}*${part[2]}`;
    } else {
      const visibleStart = Math.min(2, Math.floor(part.length / 3));
      const start = part.slice(0, visibleStart);
      const end = part.slice(-1);
      const maskedCount = Math.max(1, part.length - visibleStart - 1);
      return `${start}${'*'.repeat(maskedCount)}${end}`;
    }
  }).join(' ');
}

export function hasValidFaceEncoding(faceEncoding: any): boolean {
  if (!faceEncoding) return false;
  if (Array.isArray(faceEncoding)) {
    return faceEncoding.length >= 128;
  }
  if (typeof faceEncoding === 'object') {
    const keys = Object.keys(faceEncoding);
    return keys.length > 0 && !(keys.length === 1 && 'parent_phone' in faceEncoding);
  }
  return false;
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ roll: string }> }
) {
  try {
    const { roll } = await params;
    const { searchParams } = new URL(request.url);
    const sessionId = searchParams.get('session_id') || '';
    const token = searchParams.get('token') || request.headers.get('x-checkin-token') || '';

    // 1. Require an active session ID to prevent general roster scraping
    if (!sessionId.trim()) {
      return NextResponse.json(
        { detail: 'Active lecture session ID required for student lookup.' },
        { status: 403 }
      );
    }

    const cleanSessId = sessionId.trim();
    if (!isValidUuid(cleanSessId)) {
      return NextResponse.json(
        { detail: 'Invalid session_id format: Must be a valid UUID.' },
        { status: 400 }
      );
    }

    // 2. Client IP Rate Limiting (Shared & Persistent: Max 10 lookups per IP per 60s)
    const clientIp = getTrustedClientIp(request);
    const rlStatus = await checkStudentLookupRateLimit(clientIp);
    if (!rlStatus.allowed) {
      return NextResponse.json(
        { detail: 'Too many student lookup requests. Please wait 60 seconds.' },
        {
          status: 429,
          headers: {
            'Retry-After': String(rlStatus.remainingSeconds),
          },
        }
      );
    }

    // Check caller authorization: Staff or the student themselves can see unmasked profile and timestamps
    const sessionCookie = request.cookies.get(SESSION_COOKIE_NAME)?.value;
    const authUser = sessionCookie ? await verifySessionToken(sessionCookie) : null;
    const isStaff = Boolean(authUser && ['Super Admin', 'Admin', 'Faculty'].includes(authUser.role));
    const isOwnStudent = Boolean(
      authUser &&
      authUser.role === 'Student' &&
      (authUser.studentRoll?.trim().toLowerCase() === roll.trim().toLowerCase() ||
       authUser.username?.trim().toLowerCase() === roll.trim().toLowerCase())
    );
    const cleanRoll = roll.trim();
    const canSeeFullProfile = isStaff || isOwnStudent;

    // Strict check: verifyCheckinToken will only return true if token is a 4-part token matching cleanRoll
    let hasValidCheckinToken = verifyCheckinToken(token, cleanSessId, cleanRoll);
    let hasValidSessionToken = verifyCheckinToken(token, cleanSessId);

    // Optional Verification Challenge: If unauthenticated caller doesn't have a roll-bound token, verify via Student PIN
    const studentPin = (searchParams.get('pin') || request.headers.get('x-student-pin') || '').trim();
    let isChallengeVerified = false;
    if (!canSeeFullProfile && !hasValidCheckinToken && studentPin) {
      try {
        const { data: stuPinRecord } = await supabaseServer
          .from('students')
          .select('portal_password_hash')
          .ilike('student_roll', cleanRoll)
          .maybeSingle();
        if (stuPinRecord?.portal_password_hash && stuPinRecord.portal_password_hash.startsWith('$2')) {
          const bcrypt = (await import('bcryptjs')).default;
          isChallengeVerified = await bcrypt.compare(studentPin, stuPinRecord.portal_password_hash);
        }
      } catch {
        isChallengeVerified = false;
      }
    }

    // Unauthenticated requests MUST carry a cryptographically signed roll-bound checkin token or pass PIN challenge.
    // A raw 3-part classroom session token cannot be used to probe student profiles without identity verification.
    if (!canSeeFullProfile && !hasValidCheckinToken && !isChallengeVerified) {
      if (hasValidSessionToken && !studentPin) {
        return NextResponse.json(
          { detail: 'Student Portal PIN required. Enter your 4-6 digit secret PIN to verify identity and generate check-in token.' },
          { status: 403 }
        );
      }
      return NextResponse.json(
        { detail: 'Valid signed check-in token, student PIN challenge, or authenticated session required. Direct unauthenticated student lookup is prohibited.' },
        { status: 403 }
      );
    }

    // 3. Try backend fast-path
    try {
      const tokenParam = token ? `&token=${encodeURIComponent(token)}` : '';
      const pinParam = studentPin ? `&pin=${encodeURIComponent(studentPin)}` : '';
      const queryParam = `?session_id=${encodeURIComponent(cleanSessId)}${tokenParam}${pinParam}`;
      const res = await fetchBackend(`/api/student-lookup/${encodeURIComponent(cleanRoll)}${queryParam}`, {
        headers: {
          'ngrok-skip-browser-warning': '69420',
          ...(token ? { 'x-checkin-token': token } : {}),
          ...(studentPin ? { 'x-student-pin': studentPin } : {}),
        },
        cache: 'no-store',
      });
      if (res.ok) {
        const data = await res.json();
        // Strict Data Minimization: eliminate internal DB UUID and raw biometric vectors
        if (data?.student) {
          delete data.student.id;
          delete data.student.face_encoding;
          if (!canSeeFullProfile) {
            data.student.full_name = maskStudentName(data.student.full_name);
            delete data.student.attendance_info;
            data.student.academic_year = 'Enrolled Student';
            delete data.student.target_academic_year;
            // Prevent enumeration of biometric status and presence status
            data.student.has_face_enrolled = true;
            data.student.is_already_present = false;
            data.student.cohort_mismatch = false;
            data.student.can_checkin = true;
          } else if (data.student.attendance_info) {
            data.student.attendance_info = {
              status: data.student.attendance_info.status || 'Present',
              recorded_at: data.student.attendance_info.recorded_at || 'Earlier Today',
            };
          }
        }
        return NextResponse.json(data);
      } else if (res.status === 400 || res.status === 403 || res.status === 429 || res.status === 404) {
        const errData = await res.json().catch(() => ({}));
        const headers: Record<string, string> = {};
        const retryAfter = res.headers.get('retry-after');
        if (retryAfter) headers['Retry-After'] = retryAfter;
        return NextResponse.json(errData, { status: res.status, headers });
      }
    } catch (e) {
      // Fall back to server-side Supabase verification
    }

    // 4. Verify Session is active & unexpired (< 5.5 min)
    const { data: sessData, error: sessErr } = await supabaseServer
      .from('sessions')
      .select('id, class_name, start_time, created_at, target_academic_year, is_archived')
      .eq('id', cleanSessId)
      .maybeSingle();

    if (sessErr || !sessData) {
      return NextResponse.json({ detail: 'Lecture session not found.' }, { status: 404 });
    }

    if (sessData.is_archived || String(sessData.class_name || '').startsWith('[ARCHIVED]')) {
      return NextResponse.json(
        { detail: 'This lecture session has been archived. Attendance lookup is not permitted.' },
        { status: 403 }
      );
    }

    const timeStr = sessData.start_time || sessData.created_at;
    if (timeStr) {
      const startMs = new Date(timeStr).getTime();
      const elapsedSec = Math.floor((Date.now() - startMs) / 1000);
      if (elapsedSec > 330) {
        return NextResponse.json(
          { detail: `Attendance window closed! The 5-minute check-in time for '${sessData.class_name}' has expired.` },
          { status: 403 }
        );
      }
    }

    // 5. Query student profile and face template status (face_encoding vector omitted from client response)
    let { data: studentData } = await supabaseServer
      .from('students')
      .select('id, student_roll, full_name, academic_year, is_active, biometric_consent, face_encoding')
      .ilike('student_roll', roll.trim());

    if (!studentData || studentData.length === 0) {
      const resEq = await supabaseServer
        .from('students')
        .select('id, student_roll, full_name, academic_year, is_active, biometric_consent, face_encoding')
        .eq('student_roll', roll.trim());
      studentData = resEq.data;
    }

    if (!studentData || studentData.length === 0) {
      return NextResponse.json(
        { detail: `No student found with Roll Number '${roll}'.` },
        { status: 404 }
      );
    }

    const stud = studentData[0];
    if (stud.is_active === false || String(stud.academic_year || '').startsWith('[ARCHIVED]')) {
      return NextResponse.json(
        { detail: 'This student record has been archived and is not eligible for attendance check-in.' },
        { status: 403 }
      );
    }

    const hasFace = Boolean(stud.biometric_consent) && hasValidFaceEncoding(stud.face_encoding);

    const targetAcademicYear = sessData.target_academic_year;
    const studYear = stud.academic_year || '1st Year';
    const cohortMismatch = !isCohortMatching(targetAcademicYear, studYear);

    let isAlreadyPresent = false;
    let attendanceInfo = null;

    const { data: attData } = await supabaseServer
      .from('attendance')
      .select('status, recorded_at')
      .eq('session_id', cleanSessId)
      .eq('student_id', stud.id);

    if (attData && attData.length > 0) {
      isAlreadyPresent = true;
      attendanceInfo = {
        status: attData[0].status || 'Present',
        recorded_at: attData[0].recorded_at || 'Earlier Today',
      };
    }

    const canCheckin = Boolean(!cohortMismatch && !isAlreadyPresent && hasFace);
    const rollBoundToken = generateCheckinToken(cleanSessId, 300, stud.student_roll);

    return NextResponse.json({
      success: true,
      checkin_token: rollBoundToken,
      student: {
        student_roll: stud.student_roll,
        full_name: canSeeFullProfile ? stud.full_name : maskStudentName(stud.full_name),
        academic_year: canSeeFullProfile ? (stud.academic_year || '1st Year') : 'Enrolled Student',
        has_face_enrolled: canSeeFullProfile ? hasFace : true,
        is_already_present: canSeeFullProfile ? isAlreadyPresent : false,
        can_checkin: canSeeFullProfile ? canCheckin : true,
        attendance_info: canSeeFullProfile ? attendanceInfo : null,
        cohort_mismatch: canSeeFullProfile ? cohortMismatch : false,
        target_academic_year: canSeeFullProfile ? targetAcademicYear : null,
      }
    });
  } catch (err: any) {
    return NextResponse.json({ detail: err.message || 'Lookup failed' }, { status: 500 });
  }
}

