import { NextResponse, NextRequest } from 'next/server';
import { supabaseServer } from '@/lib/supabaseServer';
import { verifySessionToken, SESSION_COOKIE_NAME } from '@/lib/serverAuth';

export const dynamic = 'force-dynamic';

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
    const { session_id, student_id } = body;

    if (!session_id || !student_id) {
      return NextResponse.json({ success: false, error: 'session_id and student_id are required.' }, { status: 400 });
    }

    const status = body.status || 'Present';
    const capture_mode = body.capture_mode || 'Manual Upload';
    const confidence_score = body.confidence_score !== undefined ? body.confidence_score : 1.0;
    const recorded_at = body.recorded_at || new Date().toISOString();

    const { data, error } = await supabaseServer
      .from('attendance')
      .upsert(
        {
          session_id,
          student_id,
          status,
          capture_mode,
          confidence_score,
          recorded_at,
        },
        { onConflict: 'session_id,student_id' }
      )
      .select()
      .single();

    if (error) throw error;

    return NextResponse.json({
      success: true,
      data,
    });
  } catch (err: any) {
    console.error('Error marking attendance via API:', err);
    return NextResponse.json({ success: false, error: err.message || 'Failed to mark attendance' }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
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
    const id = searchParams.get('id');

    if (id) {
      const { error } = await supabaseServer
        .from('attendance')
        .delete()
        .eq('id', id);
      if (error) throw error;
      return NextResponse.json({ success: true });
    }

    const body = await request.json().catch(() => ({}));
    if (body.id) {
      const { error } = await supabaseServer
        .from('attendance')
        .delete()
        .eq('id', body.id);
      if (error) throw error;
      return NextResponse.json({ success: true });
    }

    if (body.session_id && body.student_id) {
      const { error } = await supabaseServer
        .from('attendance')
        .delete()
        .eq('session_id', body.session_id)
        .eq('student_id', body.student_id);
      if (error) throw error;
      return NextResponse.json({ success: true });
    }

    return NextResponse.json({ success: false, error: 'Log ID or session_id+student_id required for undo.' }, { status: 400 });
  } catch (err: any) {
    console.error('Error undoing attendance via API:', err);
    return NextResponse.json({ success: false, error: err.message || 'Failed to undo attendance' }, { status: 500 });
  }
}
