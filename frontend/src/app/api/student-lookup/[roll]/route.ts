import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';

export const dynamic = 'force-dynamic';

export async function GET(
  request: Request,
  { params }: { params: Promise<{ roll: string }> }
) {
  try {
    const { roll } = await params;
    const { searchParams } = new URL(request.url);
    const sessionId = searchParams.get('session_id') || '';

    // 1. Try local FastAPI backend first
    try {
      const queryParam = sessionId ? `?session_id=${encodeURIComponent(sessionId)}` : '';
      const res = await fetch(`http://127.0.0.1:8000/api/student-lookup/${encodeURIComponent(roll)}${queryParam}`, {
        headers: { 'ngrok-skip-browser-warning': '69420' },
        cache: 'no-store',
      });
      if (res.ok) {
        const data = await res.json();
        return NextResponse.json(data);
      }
    } catch (e) {
      // Fall back to server-side Supabase
    }

    // 2. Direct Supabase Query from Server
    let { data: studentData, error: studErr } = await supabase
      .from('students')
      .select('id, student_roll, full_name, email, academic_year, face_encoding')
      .ilike('student_roll', roll.trim());

    if (!studentData || studentData.length === 0) {
      const resEq = await supabase
        .from('students')
        .select('id, student_roll, full_name, email, academic_year, face_encoding')
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

    let isAlreadyPresent = false;
    let attendanceInfo = null;
    let targetAcademicYear: string | null = null;
    let cohortMismatch = false;

    if (sessionId) {
      try {
        const { data: sessData } = await supabase
          .from('sessions')
          .select('id, class_name, target_academic_year')
          .eq('id', sessionId)
          .single();

        if (sessData) {
          targetAcademicYear = sessData.target_academic_year;
          const studYear = stud.academic_year || '1st Year';
          if (targetAcademicYear && targetAcademicYear !== 'All' && targetAcademicYear !== 'All Years' && targetAcademicYear !== 'All MBBS Batches') {
            const sClean = studYear.trim().toLowerCase();
            const tClean = targetAcademicYear.trim().toLowerCase();
            if (sClean !== tClean && (tClean.includes('(') || !sClean.startsWith(tClean))) {
              cohortMismatch = true;
            }
          }
        }
      } catch (e) {
        console.error('Session lookup error:', e);
      }

      const { data: attData } = await supabase
        .from('attendance')
        .select('id, status, capture_mode, confidence_score, recorded_at')
        .eq('session_id', sessionId)
        .eq('student_id', stud.id);

      if (attData && attData.length > 0) {
        isAlreadyPresent = true;
        attendanceInfo = attData[0];
      }
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
