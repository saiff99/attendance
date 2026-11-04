import { NextResponse, NextRequest } from 'next/server';
import { supabaseServer } from '@/lib/supabaseServer';
import { verifySessionToken, SESSION_COOKIE_NAME } from '@/lib/serverAuth';
import { DEFAULT_MBBS_SUBJECTS, AcademicSubject } from '@/lib/academicSubjects';
import { logAuditEvent } from '@/lib/auditLog';
import { getCachedAcademicSubjects, invalidateAcademicSubjectsCache } from '@/lib/subjectCache';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const yearParam = searchParams.get('year');

    const allSubjects = await getCachedAcademicSubjects();

    let subjects: AcademicSubject[] = allSubjects;
    if (yearParam && yearParam !== 'All') {
      subjects = subjects.filter(s => s.academic_year === yearParam || yearParam.startsWith(s.academic_year));
    }

    return NextResponse.json({
      success: true,
      subjects,
      tableReady: true,
    });
  } catch (err: any) {
    console.error('Error fetching academic subjects:', err);
    // Graceful fallback to default subjects so app never crashes
    return NextResponse.json({
      success: true,
      subjects: DEFAULT_MBBS_SUBJECTS,
      tableReady: false,
      error: err.message,
    });
  }
}

export async function POST(request: NextRequest) {
  try {
    const sessionCookie = request.cookies.get(SESSION_COOKIE_NAME)?.value;
    if (!sessionCookie) {
      return NextResponse.json({ success: false, error: 'Unauthorized.' }, { status: 401 });
    }

    const session = await verifySessionToken(sessionCookie);
    if (!session || session.role !== 'Super Admin') {
      return NextResponse.json(
        { success: false, error: 'Forbidden. Super Admin access required.' },
        { status: 403 }
      );
    }

    const body = await request.json();
    const academic_year = (body.academic_year || '').trim();
    const name = (body.name || '').trim();
    const code = (body.code || '').trim() || null;
    const department = (body.department || '').trim() || null;

    if (!academic_year) {
      return NextResponse.json({ success: false, error: 'Academic Year is required.' }, { status: 400 });
    }
    if (!name) {
      return NextResponse.json({ success: false, error: 'Subject name is required.' }, { status: 400 });
    }

    const { data, error } = await supabaseServer
      .from('academic_subjects')
      .insert([
        {
          academic_year,
          name,
          code,
          department,
          is_active: true,
        },
      ])
      .select()
      .single();

    if (error) {
      if (error.code === 'PGRST205' || error.message?.includes('does not exist')) {
        return NextResponse.json(
          {
            success: false,
            tableReady: false,
            error: 'The academic_subjects table is not created yet in Supabase. Please run the SQL migration.',
          },
          { status: 400 }
        );
      }
      throw error;
    }

    logAuditEvent({
      action: 'CREATE_SUBJECT',
      targetType: 'system',
      targetId: data.id,
      actorId: session.username || session.name || 'admin',
      request,
      details: {
        academic_year,
        name,
        code,
        actor_name: session.name,
        actor_role: session.role,
      },
    });

    invalidateAcademicSubjectsCache();

    return NextResponse.json({
      success: true,
      subject: data,
    });
  } catch (err: any) {
    console.error('Error creating academic subject:', err);
    return NextResponse.json(
      { success: false, error: err.message || 'Failed to create subject.' },
      { status: 500 }
    );
  }
}
