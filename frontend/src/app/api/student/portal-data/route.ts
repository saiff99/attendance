import { NextResponse, NextRequest } from 'next/server';
import { verifySessionToken, SESSION_COOKIE_NAME } from '@/lib/serverAuth';
import { supabaseServer } from '@/lib/supabaseServer';
import { isCohortMatching } from '@/lib/cohort';
import { DEFAULT_MBBS_SUBJECTS, getSubjectsForCohort } from '@/lib/academicSubjects';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    const sessionCookie = request.cookies.get(SESSION_COOKIE_NAME)?.value;
    if (!sessionCookie) {
      return NextResponse.json({ success: false, error: 'Unauthorized: Session required.' }, { status: 401 });
    }

    const session = await verifySessionToken(sessionCookie);
    if (!session) {
      return NextResponse.json({ success: false, error: 'Unauthorized: Invalid session.' }, { status: 401 });
    }

    // Determine target student: either logged-in student, or requested roll if admin/faculty
    const searchParams = request.nextUrl.searchParams;
    const requestedRoll = searchParams.get('roll');

    let targetRoll = session.studentRoll;
    if ((session.role === 'Super Admin' || session.role === 'Faculty') && requestedRoll) {
      targetRoll = requestedRoll.trim();
    }

    if (!targetRoll && session.studentId) {
      // Find roll by studentId
      const { data: sById } = await supabaseServer
        .from('students')
        .select('student_roll')
        .eq('id', session.studentId)
        .maybeSingle();
      if (sById) targetRoll = sById.student_roll;
    }

    if (!targetRoll) {
      return NextResponse.json({ success: false, error: 'Student Roll Number is required.' }, { status: 400 });
    }

    // 1. Fetch Student Record
    const { data: student, error: stuErr } = await supabaseServer
      .from('students')
      .select('id, student_roll, full_name, email, academic_year, parent_phone, face_encoding, portal_pin, created_at')
      .ilike('student_roll', targetRoll)
      .maybeSingle();

    if (stuErr || !student) {
      return NextResponse.json({ success: false, error: 'Student not found in registry.' }, { status: 404 });
    }

    const studentYear = student.academic_year || '1st Year';

    // 2. Fetch Sessions applicable to this cohort
    const { data: sessions, error: sessErr } = await supabaseServer
      .from('sessions')
      .select('id, class_name, date, start_time, end_time, instructor_name, target_academic_year')
      .neq('class_name', '__SYSTEM_CONFIG__')
      .order('date', { ascending: false });

    if (sessErr) {
      throw sessErr;
    }

    const applicableSessions = (sessions || []).filter(s =>
      isCohortMatching(s.target_academic_year, studentYear)
    );

    // 3. Fetch Attendance Records for this Student
    const { data: attendanceLogs, error: attErr } = await supabaseServer
      .from('attendance')
      .select('session_id, status, capture_mode, recorded_at')
      .eq('student_id', student.id);

    if (attErr) {
      throw attErr;
    }

    const presentSessionMap = new Map<string, { capture_mode: string; recorded_at: string }>();
    (attendanceLogs || []).forEach(att => {
      if (att.status === 'Present') {
        presentSessionMap.set(att.session_id, {
          capture_mode: att.capture_mode || 'Live Scan',
          recorded_at: att.recorded_at,
        });
      }
    });

    // 4. Fetch Curriculum Subjects (from DB or default MBBS seed)
    let cohortSubjects: { name: string; code?: string; department?: string }[] = [];
    try {
      const { data: dbSubjects } = await supabaseServer
        .from('academic_subjects')
        .select('id, name, code, department, academic_year, is_active')
        .eq('is_active', true);

      if (dbSubjects && dbSubjects.length > 0) {
        cohortSubjects = getSubjectsForCohort(dbSubjects, studentYear);
      } else {
        cohortSubjects = getSubjectsForCohort(DEFAULT_MBBS_SUBJECTS, studentYear);
      }
    } catch {
      cohortSubjects = getSubjectsForCohort(DEFAULT_MBBS_SUBJECTS, studentYear);
    }

    // Helper to extract clean subject from session class_name ("Anatomy - Lecture Hall 1" -> "Anatomy")
    const extractSubjectName = (className: string) => {
      if (!className) return 'General';
      if (className.includes(' - ')) {
        return className.split(' - ')[0].trim();
      }
      return className.trim();
    };

    // Helper to extract venue from session class_name ("Anatomy - Lecture Hall 1" -> "Lecture Hall 1")
    const extractVenueName = (className: string) => {
      if (!className) return 'Classroom';
      if (className.includes(' - ')) {
        const parts = className.split(' - ');
        return parts.slice(1).join(' - ').trim();
      }
      return 'Classroom';
    };

    // 5. Compute Subject-wise Breakdown
    // Map sessions to subjects
    const subjectStatsMap: Record<string, { totalClasses: number; present: number; code?: string }> = {};

    cohortSubjects.forEach(sub => {
      subjectStatsMap[sub.name.toLowerCase()] = {
        totalClasses: 0,
        present: 0,
        code: sub.code,
      };
    });

    const unmappedSessions: typeof applicableSessions = [];

    applicableSessions.forEach(sess => {
      const subName = extractSubjectName(sess.class_name);
      const subKey = subName.toLowerCase();

      // Find best matching subject key
      const matchedKey = Object.keys(subjectStatsMap).find(k =>
        k === subKey || subKey.includes(k) || k.includes(subKey)
      );

      if (matchedKey) {
        subjectStatsMap[matchedKey].totalClasses++;
        if (presentSessionMap.has(sess.id)) {
          subjectStatsMap[matchedKey].present++;
        }
      } else {
        unmappedSessions.push(sess);
      }
    });

    // Format Subject rows matching the exact user screenshot specification
    const subjectRows = cohortSubjects.map(sub => {
      const stat = subjectStatsMap[sub.name.toLowerCase()] || { totalClasses: 0, present: 0 };
      const absent = Math.max(0, stat.totalClasses - stat.present);
      const rate = stat.totalClasses > 0
        ? Math.round((stat.present / stat.totalClasses) * 1000) / 10
        : 100.0;

      let statusText: 'Good' | 'Borderline' | 'Low' = 'Good';
      if (stat.totalClasses > 0) {
        if (rate >= 75) statusText = 'Good';
        else if (rate >= 65) statusText = 'Borderline';
        else statusText = 'Low';
      }

      return {
        subject: sub.name,
        code: sub.code || '',
        department: sub.department || '',
        totalClasses: stat.totalClasses,
        present: stat.present,
        absent,
        percentage: rate,
        status: statusText,
      };
    });

    // If there were extra unmapped sessions (e.g. Clinical Seminars), append them
    if (unmappedSessions.length > 0) {
      let unmappedPresent = 0;
      unmappedSessions.forEach(s => {
        if (presentSessionMap.has(s.id)) unmappedPresent++;
      });
      const unmappedTotal = unmappedSessions.length;
      const unmappedAbsent = Math.max(0, unmappedTotal - unmappedPresent);
      const rate = Math.round((unmappedPresent / unmappedTotal) * 1000) / 10;

      subjectRows.push({
        subject: 'Other Academic Sessions',
        code: 'SEMINAR',
        department: 'General',
        totalClasses: unmappedTotal,
        present: unmappedPresent,
        absent: unmappedAbsent,
        percentage: rate,
        status: rate >= 75 ? 'Good' : (rate >= 65 ? 'Borderline' : 'Low'),
      });
    }

    // Overall Summary
    const totalApplicableClasses = applicableSessions.length;
    const totalPresent = presentSessionMap.size;
    const totalAbsent = Math.max(0, totalApplicableClasses - totalPresent);
    const overallRate = totalApplicableClasses > 0
      ? Math.round((totalPresent / totalApplicableClasses) * 1000) / 10
      : 0;

    let overallStatus: 'Eligible' | 'Borderline' | 'At Risk' = 'Eligible';
    if (totalApplicableClasses > 0) {
      if (overallRate >= 75) overallStatus = 'Eligible';
      else if (overallRate >= 65) overallStatus = 'Borderline';
      else overallStatus = 'At Risk';
    }

    // 6. Recent Session Attendance Logs (Last 20 sessions)
    const recentSessions = applicableSessions.slice(0, 20).map(sess => {
      const isPresent = presentSessionMap.has(sess.id);
      const attInfo = presentSessionMap.get(sess.id);
      return {
        sessionId: sess.id,
        className: sess.class_name,
        subject: extractSubjectName(sess.class_name),
        venue: extractVenueName(sess.class_name),
        date: sess.date,
        startTime: sess.start_time,
        instructor: sess.instructor_name?.split('|')[0] || 'Faculty',
        status: isPresent ? 'Present' : 'Absent',
        captureMode: attInfo?.capture_mode || (isPresent ? 'Live Scan' : 'N/A'),
        recordedAt: attInfo?.recorded_at || null,
      };
    });

    return NextResponse.json({
      success: true,
      student: {
        id: student.id,
        fullName: student.full_name,
        studentRoll: student.student_roll,
        academicYear: student.academic_year || '1st Year',
        email: student.email,
        parentPhone: student.parent_phone || '',
        hasFaceEnrolled: Boolean(student.face_encoding),
        hasCustomPin: Boolean(student.portal_pin),
      },
      summary: {
        totalClasses: totalApplicableClasses,
        present: totalPresent,
        absent: totalAbsent,
        percentage: overallRate,
        status: overallStatus,
        isExamEligible: overallRate >= 75,
      },
      subjects: subjectRows,
      recentSessions,
    });
  } catch (err: any) {
    console.error('Failed to fetch student portal data:', err);
    return NextResponse.json(
      { success: false, error: err.message || 'Internal server error' },
      { status: 500 }
    );
  }
}
