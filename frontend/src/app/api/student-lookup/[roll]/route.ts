import { NextResponse } from 'next/server';
import { supabaseServer } from '@/lib/supabaseServer';
import { isCohortMatching } from '@/lib/cohort';
import { fetchBackend } from '@/lib/serverBackend';
import { isValidUuid } from '@/lib/attendanceAuth';
import { getTrustedClientIp, checkStudentLookupRateLimit } from '@/lib/rateLimiter';

export const dynamic = 'force-dynamic';

export async function GET(
  request: Request,
  { params }: { params: Promise<{ roll: string }> }
) {
  try {
    const { roll } = await params;
    const { searchParams } = new URL(request.url);
    const sessionId = searchParams.get('session_id') || '';

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

    // 3. Try backend fast-path
    try {
      const queryParam = `?session_id=${encodeURIComponent(cleanSessId)}`;
      const res = await fetchBackend(`/api/student-lookup/${encodeURIComponent(roll)}${queryParam}`, {
        headers: { 'ngrok-skip-browser-warning': '69420' },
        cache: 'no-store',
      });
      if (res.ok) {
        const data = await res.json();
        // Strict Data Minimization: eliminate internal DB UUID and raw biometric vectors
        if (data?.student) {
          delete data.student.id;
          delete data.student.face_encoding;
          if (data.student.attendance_info) {
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
      .select('id, class_name, start_time, created_at, target_academic_year')
      .eq('id', cleanSessId)
      .maybeSingle();

    if (sessErr || !sessData) {
      return NextResponse.json({ detail: 'Lecture session not found.' }, { status: 404 });
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

    // 5. Query student strictly non-sensitive fields (omit face_encoding vectors)
    let { data: studentData } = await supabaseServer
      .from('students')
      .select('id, student_roll, full_name, academic_year, biometric_consent')
      .ilike('student_roll', roll.trim());

    if (!studentData || studentData.length === 0) {
      const resEq = await supabaseServer
        .from('students')
        .select('id, student_roll, full_name, academic_year, biometric_consent')
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
    const hasFace = Boolean(stud.biometric_consent);

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

    return NextResponse.json({
      success: true,
      student: {
        student_roll: stud.student_roll,
        full_name: stud.full_name,
        academic_year: stud.academic_year || '1st Year',
        has_face_enrolled: hasFace,
        is_already_present: isAlreadyPresent,
        attendance_info: attendanceInfo,
        cohort_mismatch: cohortMismatch,
        target_academic_year: targetAcademicYear,
      }
    });
  } catch (err: any) {
    return NextResponse.json({ detail: err.message || 'Lookup failed' }, { status: 500 });
  }
}

