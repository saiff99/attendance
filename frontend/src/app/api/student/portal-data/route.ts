import { NextResponse, NextRequest } from 'next/server';
import { verifySessionToken, SESSION_COOKIE_NAME } from '@/lib/serverAuth';
import { supabaseServer } from '@/lib/supabaseServer';
import { isCohortMatching } from '@/lib/cohort';
import { DEFAULT_MBBS_SUBJECTS, getSubjectsForCohort } from '@/lib/academicSubjects';
import { getParentPhone } from '@/lib/studentContact';
import { decodeSessionMetadata } from '@/lib/geofence';

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

    let student: any = null;
    let stuErr: any = null;

    // 1. If Super Admin or Faculty explicitly requested a specific student roll
    if ((session.role === 'Super Admin' || session.role === 'Faculty') && requestedRoll) {
      const cleanReqRoll = requestedRoll.trim();
      const res = await supabaseServer
        .from('students')
        .select('id, student_roll, full_name, email, academic_year, face_encoding, portal_pin, portal_password_hash, created_at')
        .ilike('student_roll', cleanReqRoll)
        .maybeSingle();
      student = res.data;
      stuErr = res.error;
    }

    // 2. If student is logged in, lookup by primary key studentId first
    if (!student && session.role === 'Student') {
      if (session.studentId) {
        const res = await supabaseServer
          .from('students')
          .select('id, student_roll, full_name, email, academic_year, face_encoding, portal_pin, portal_password_hash, created_at')
          .eq('id', session.studentId)
          .maybeSingle();
        student = res.data;
        stuErr = res.error;
      }
      if (!student && session.studentRoll) {
        const res = await supabaseServer
          .from('students')
          .select('id, student_roll, full_name, email, academic_year, face_encoding, portal_pin, portal_password_hash, created_at')
          .ilike('student_roll', session.studentRoll.trim())
          .maybeSingle();
        student = res.data;
        stuErr = res.error;
      }
    }

    // 3. Fallback for Super Admin or Faculty browsing /portal without query param: pick first enrolled student
    if (!student && (session.role === 'Super Admin' || session.role === 'Faculty')) {
      const res = await supabaseServer
        .from('students')
        .select('id, student_roll, full_name, email, academic_year, face_encoding, portal_pin, portal_password_hash, created_at')
        .order('student_roll', { ascending: true })
        .limit(1)
        .maybeSingle();
      student = res.data;
      stuErr = res.error;
    }

    // 4. General fallback if session has studentRoll
    if (!student && session.studentRoll) {
      const res = await supabaseServer
        .from('students')
        .select('id, student_roll, full_name, email, academic_year, face_encoding, portal_pin, portal_password_hash, created_at')
        .ilike('student_roll', session.studentRoll.trim())
        .maybeSingle();
      student = res.data;
      stuErr = res.error;
    }

    if (stuErr || !student) {
      return NextResponse.json({ success: false, error: 'Student not found in registry.' }, { status: 404 });
    }

    // Fetch list of students if viewer is Super Admin or Faculty for interactive switcher
    let adminStudentList: { roll: string; name: string; year: string }[] = [];
    if (session.role === 'Super Admin' || session.role === 'Faculty') {
      const { data: stList } = await supabaseServer
        .from('students')
        .select('student_roll, full_name, academic_year')
        .order('student_roll', { ascending: true });
      if (stList) {
        adminStudentList = stList.map(s => ({
          roll: s.student_roll,
          name: s.full_name,
          year: s.academic_year || '1st Year',
        }));
      }
    }

    const studentYear = student.academic_year || '1st Year';

    // 2. Fetch Sessions applicable to this cohort
    const { data: sessions, error: sessErr } = await supabaseServer
      .from('sessions')
      .select('id, class_name, date, start_time, end_time, instructor_name, target_academic_year, created_at')
      .neq('class_name', '__SYSTEM_CONFIG__')
      .order('date', { ascending: false })
      .order('start_time', { ascending: false });

    if (sessErr) {
      throw sessErr;
    }

    const applicableSessions = (sessions || []).filter(s =>
      isCohortMatching(s.target_academic_year, studentYear)
    );

    // Ensure applicable sessions are strictly sorted descending by start_time / created_at
    applicableSessions.sort((a, b) => {
      const timeA = new Date(a.start_time || a.created_at || a.date).getTime();
      const timeB = new Date(b.start_time || b.created_at || b.date).getTime();
      return timeB - timeA;
    });

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

    // 6. Recent Session Attendance Logs (Strictly Last 7 Days)
    const now = new Date();
    const sevenDaysAgo = new Date(now);
    sevenDaysAgo.setDate(now.getDate() - 7);
    sevenDaysAgo.setHours(0, 0, 0, 0); // Start of day 7 days ago
    const sevenDaysAgoMs = sevenDaysAgo.getTime();

    const getSessionTimeMs = (sess: typeof applicableSessions[0]) => {
      const att = presentSessionMap.get(sess.id);
      const attTime = att?.recorded_at ? new Date(att.recorded_at).getTime() : 0;
      const sessStartTime = sess.start_time ? new Date(sess.start_time).getTime() : 0;
      const sessCreatedAt = sess.created_at ? new Date(sess.created_at).getTime() : 0;
      let sessDateTime = 0;
      if (sess.date) {
        const dStr = sess.date.includes('T') ? sess.date : `${sess.date}T00:00:00`;
        sessDateTime = new Date(dStr).getTime();
      }
      return Math.max(
        isNaN(attTime) ? 0 : attTime,
        isNaN(sessStartTime) ? 0 : sessStartTime,
        isNaN(sessCreatedAt) ? 0 : sessCreatedAt,
        isNaN(sessDateTime) ? 0 : sessDateTime
      );
    };

    // Filter strictly for sessions from the last 7 days
    const last7DaysSessions = applicableSessions.filter(sess => {
      const sessionTime = getSessionTimeMs(sess);
      return sessionTime >= sevenDaysAgoMs;
    });

    // Strictly sort so that newly marked attendance or newly started sessions appear at the very top
    const sortedForRecent = [...last7DaysSessions].sort((a, b) => {
      return getSessionTimeMs(b) - getSessionTimeMs(a);
    });

    const recentSessions = sortedForRecent.map(sess => {
      const isPresent = presentSessionMap.has(sess.id);
      const attInfo = presentSessionMap.get(sess.id);
      return {
        sessionId: sess.id,
        className: sess.class_name,
        subject: extractSubjectName(sess.class_name),
        venue: extractVenueName(sess.class_name),
        date: sess.date,
        startTime: sess.start_time,
        instructor: decodeSessionMetadata(sess.instructor_name || '').topic || 'Faculty',
        status: isPresent ? 'Present' : 'Absent',
        captureMode: attInfo?.capture_mode || (isPresent ? 'Live Scan' : 'N/A'),
        recordedAt: attInfo?.recorded_at || null,
      };
    });

    return NextResponse.json({
      success: true,
      viewerRole: session.role,
      adminStudentList,
      student: {
        id: student.id,
        fullName: student.full_name,
        studentRoll: student.student_roll,
        academicYear: student.academic_year || '1st Year',
        email: student.email,
        parentPhone: getParentPhone(student),
        hasFaceEnrolled: Boolean(student.face_encoding),
        hasCustomPin: Boolean(student.portal_pin || student.portal_password_hash),
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
