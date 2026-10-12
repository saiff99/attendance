import { NextResponse, NextRequest } from 'next/server';
import { supabaseServer } from '@/lib/supabaseServer';
import { verifySessionToken, SESSION_COOKIE_NAME } from '@/lib/serverAuth';
import { logAuditEvent } from '@/lib/auditLog';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    const sessionCookie = request.cookies.get(SESSION_COOKIE_NAME)?.value;
    if (!sessionCookie) {
      return NextResponse.json({ success: false, error: 'Unauthorized.' }, { status: 401 });
    }

    const session = await verifySessionToken(sessionCookie);
    if (!session || (session.role !== 'Super Admin' && session.role !== 'Faculty')) {
      return NextResponse.json(
        { success: false, error: 'Forbidden. Faculty or Super Admin access required.' },
        { status: 403 }
      );
    }

    const { searchParams } = new URL(request.url);
    const limit = parseInt(searchParams.get('limit') || '50', 10);

    const { data, error } = await supabaseServer
      .from('sessions')
      .select('id, class_name, date, start_time, end_time, instructor_name, target_academic_year, created_at')
      .neq('class_name', '__SYSTEM_CONFIG__')
      .order('created_at', { ascending: false })
      .limit(limit);

    if (error) throw error;

    return NextResponse.json({
      success: true,
      sessions: data || [],
    });
  } catch (err: any) {
    console.error('Error fetching sessions:', err);
    return NextResponse.json({ success: false, error: err.message || 'Failed to fetch sessions' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const sessionCookie = request.cookies.get(SESSION_COOKIE_NAME)?.value;
    if (!sessionCookie) {
      return NextResponse.json({ success: false, error: 'Unauthorized.' }, { status: 401 });
    }

    const session = await verifySessionToken(sessionCookie);
    if (!session || (session.role !== 'Super Admin' && session.role !== 'Faculty')) {
      return NextResponse.json(
        { success: false, error: 'Forbidden. Faculty or Super Admin access required.' },
        { status: 403 }
      );
    }

    const body = await request.json();
    const className = (body.class_name || '').trim();
    if (!className) {
      return NextResponse.json({ success: false, error: 'Class / Subject name is required.' }, { status: 400 });
    }

    const newSession = {
      class_name: className,
      date: body.date,
      start_time: body.start_time,
      end_time: body.end_time,
      instructor_name: body.instructor_name,
      target_academic_year: body.target_academic_year,
    };

    const { data, error } = await supabaseServer
      .from('sessions')
      .insert([newSession])
      .select()
      .single();

    if (error) throw error;

    logAuditEvent({
      action: 'START_SESSION',
      targetType: 'session',
      targetId: data?.id,
      details: { class_name: className, instructor: session.name, target_cohort: body.target_academic_year },
    });

    return NextResponse.json({
      success: true,
      session: data,
    });
  } catch (err: any) {
    console.error('Error creating session:', err);
    return NextResponse.json({ success: false, error: err.message || 'Failed to start session' }, { status: 500 });
  }
}
