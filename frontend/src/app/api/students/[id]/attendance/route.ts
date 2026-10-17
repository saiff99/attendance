import { NextResponse, NextRequest } from 'next/server';
import { supabaseServer } from '@/lib/supabaseServer';
import { verifySessionToken, SESSION_COOKIE_NAME } from '@/lib/serverAuth';

import { isValidUuid } from '@/lib/attendanceAuth';

export const dynamic = 'force-dynamic';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const sessionCookie = request.cookies.get(SESSION_COOKIE_NAME)?.value;
    if (!sessionCookie) {
      return NextResponse.json({ success: false, error: 'Unauthorized.' }, { status: 401 });
    }

    const session = await verifySessionToken(sessionCookie);
    if (!session) {
      return NextResponse.json({ success: false, error: 'Unauthorized.' }, { status: 401 });
    }

    const { id } = await params;
    if (!id || !isValidUuid(id)) {
      return NextResponse.json({ success: false, error: 'Invalid Student ID format. Valid UUID required.' }, { status: 400 });
    }

    // Student can view their own profile, Faculty/Admin can view any student
    if (session.role === 'Student' && session.studentId && session.studentId !== id) {
      return NextResponse.json({ success: false, error: 'Forbidden.' }, { status: 403 });
    }

    const { data, error } = await supabaseServer
      .from('attendance')
      .select('*, sessions(class_name, date)')
      .eq('student_id', id)
      .order('recorded_at', { ascending: false });

    if (error) throw error;

    return NextResponse.json({
      success: true,
      attendance: data || [],
    });
  } catch (err: any) {
    console.error('Error fetching student attendance history:', err);
    return NextResponse.json({ success: false, error: err.message || 'Failed to fetch attendance history' }, { status: 500 });
  }
}
