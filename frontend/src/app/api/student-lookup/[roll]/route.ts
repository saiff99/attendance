import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { isCohortMatching } from '@/lib/cohort';
import { fetchBackend } from '@/lib/serverBackend';

export const dynamic = 'force-dynamic';

// Rate Limiter for student roll lookups: {clientIp: [timestamp, ...]}
const lookupRateLimits: Record<string, number[]> = {};

export async function GET(
  request: Request,
  { params }: { params: Promise<{ roll: string }> }
) {
  try {
    const { roll } = await params;
    const { searchParams } = new URL(request.url);
    const sessionId = searchParams.get('session_id') || '';

    // 1. Client IP Rate Limiting (Max 10 lookups per IP per 60s)
    const forwarded = request.headers.get('x-forwarded-for') || request.headers.get('cf-connecting-ip') || 'unknown';
    const clientIp = forwarded.split(',')[0].trim();
    const now = Date.now();
    const timestamps = (lookupRateLimits[clientIp] || []).filter(t => now - t < 60000);
    if (timestamps.length >= 10) {
      lookupRateLimits[clientIp] = timestamps;
      return NextResponse.json(
        { detail: 'Too many student lookup requests. Please wait 60 seconds.' },
        { status: 429 }
      );
    }
    timestamps.push(now);
    lookupRateLimits[clientIp] = timestamps;

    // 2. Require an active session ID to prevent arbitrary roster enumeration
    if (!sessionId.trim()) {
      return NextResponse.json(
        { detail: 'Active lecture session ID required for student lookup.' },
        { status: 403 }
      );
    }

    // 3. Try backend fast-path
    try {
      const queryParam = `?session_id=${encodeURIComponent(sessionId)}`;
      const res = await fetchBackend(`/api/student-lookup/${encodeURIComponent(roll)}${queryParam}`, {
        headers: { 'ngrok-skip-browser-warning': '69420' },
        cache: 'no-store',
      });
      if (res.ok) {
        const data = await res.json();
        return NextResponse.json(data);
      } else if (res.status === 403 || res.status === 429 || res.status === 404) {
        const errData = await res.json().catch(() => ({}));
        return NextResponse.json(errData, { status: res.status });
      }
    } catch (e) {
      // Fall back to server-side Supabase verification
    }

    // 4. Verify Session is active & unexpired (< 5.5 min)
    const { data: sessData, error: sessErr } = await supabase
      .from('sessions')
      .select('id, class_name, start_time, created_at, target_academic_year')
      .eq('id', sessionId.trim())
      .single();

    if (sessErr || !sessData) {
      return NextResponse.json({ detail: 'Lecture session not found.' }, { status: 404 });
    }

    const timeStr = sessData.start_time || sessData.created_at;
    if (timeStr) {
      const startMs = new Date(timeStr).getTime();
      const elapsedSec = Math.floor((now - startMs) / 1000);
      if (elapsedSec > 330) {
        return NextResponse.json(
          { detail: `Attendance window closed! The 5-minute check-in time for '${sessData.class_name}' has expired.` },
          { status: 403 }
        );
      }
    }

    // 5. Query student non-sensitive fields
    let { data: studentData } = await supabase
      .from('students')
      .select('id, student_roll, full_name, academic_year, face_encoding')
      .ilike('student_roll', roll.trim());

    if (!studentData || studentData.length === 0) {
      const resEq = await supabase
        .from('students')
        .select('id, student_roll, full_name, academic_year, face_encoding')
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
    const hasFace = !!(stud.face_encoding && Array.isArray(stud.face_encoding) && stud.face_encoding.length > 0);

    const targetAcademicYear = sessData.target_academic_year;
    const studYear = stud.academic_year || '1st Year';
    const cohortMismatch = !isCohortMatching(targetAcademicYear, studYear);

    let isAlreadyPresent = false;
    let attendanceInfo = null;

    const { data: attData } = await supabase
      .from('attendance')
      .select('id, status, capture_mode, confidence_score, recorded_at')
      .eq('session_id', sessionId)
      .eq('student_id', stud.id);

    if (attData && attData.length > 0) {
      isAlreadyPresent = true;
      attendanceInfo = attData[0];
    }

    return NextResponse.json({
      success: true,
      student: {
        id: stud.id,
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
