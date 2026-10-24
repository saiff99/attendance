import { NextResponse, NextRequest } from 'next/server';
import { supabaseServer } from '@/lib/supabaseServer';
import { verifySessionToken, SESSION_COOKIE_NAME } from '@/lib/serverAuth';
import { logAuditEvent } from '@/lib/auditLog';

import { decodeSessionMetadata } from '@/lib/geofence';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    const sessionCookie = request.cookies.get(SESSION_COOKIE_NAME)?.value;
    if (!sessionCookie) {
      return NextResponse.json({ success: false, error: 'Unauthorized.' }, { status: 401 });
    }

    const session = await verifySessionToken(sessionCookie);
    if (!session || (session.role !== 'Super Admin' && session.role !== 'Admin' && session.role !== 'Faculty')) {
      return NextResponse.json(
        { success: false, error: 'Forbidden. Authorized access required.' },
        { status: 403 }
      );
    }

    const { searchParams } = new URL(request.url);

    // Strict schema validation on query limits (prevents query amplification and DoS)
    const rawLimit = searchParams.get('limit');
    let limit = 50;
    if (rawLimit !== null) {
      if (!/^\d+$/.test(rawLimit)) {
        return NextResponse.json(
          { success: false, error: 'Invalid limit parameter. Must be an integer between 1 and 100.' },
          { status: 400 }
        );
      }
      const parsed = parseInt(rawLimit, 10);
      if (parsed < 1 || parsed > 100) {
        return NextResponse.json(
          { success: false, error: 'Invalid limit parameter. Must be an integer between 1 and 100.' },
          { status: 400 }
        );
      }
      limit = parsed;
    }

    const rawPage = searchParams.get('page');
    let page = 1;
    if (rawPage !== null) {
      if (!/^\d+$/.test(rawPage)) {
        return NextResponse.json(
          { success: false, error: 'Invalid page parameter. Must be a positive integer.' },
          { status: 400 }
        );
      }
      const parsedPage = parseInt(rawPage, 10);
      if (parsedPage < 1) {
        return NextResponse.json(
          { success: false, error: 'Invalid page parameter. Must be a positive integer.' },
          { status: 400 }
        );
      }
      page = parsedPage;
    }

    const offset = (page - 1) * limit;

    const { data, error, count } = await supabaseServer
      .from('sessions')
      .select('id, class_name, date, start_time, end_time, instructor_name, target_academic_year, created_at, attendance(count)', { count: 'exact' })
      .neq('class_name', '__SYSTEM_CONFIG__')
      .neq('class_name', '__GEOFENCE_CONFIG__')
      .neq('id', '00000000-0000-0000-0000-000000000001')
      .neq('id', '00000000-0000-0000-0000-000000000000')
      .neq('target_academic_year', 'System')
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);

    if (error) throw error;

    const includeArchived = searchParams.get('include_archived') === 'true';
    let filteredSessions = (data || []).filter((s: any) => {
      if (s.class_name?.startsWith('__')) return false;
      if (!includeArchived && (s.class_name?.startsWith('[ARCHIVED]') || s.target_academic_year === 'Archived')) return false;
      return true;
    });
    if (session.role === 'Faculty') {
      const u = (session.username || '').toLowerCase();
      const n = (session.name || '').toLowerCase();
      filteredSessions = filteredSessions.filter((s: any) => {
        const raw = s.instructor_name || '';
        const dec = decodeSessionMetadata(raw);
        const fac = (dec.facultyUsername || '').toLowerCase();
        const top = (dec.topic || '').toLowerCase();
        return (fac && (fac === u || fac === n)) || (top && (top === u || top === n));
      });
    }

    // Fetch registered users to map usernames to full names
    const { data: appUsers } = await supabaseServer
      .from('app_users')
      .select('username, full_name');

    const userMap: Record<string, string> = {
      admin: 'System Administrator',
      faculty: 'Faculty Member',
    };
    if (appUsers) {
      appUsers.forEach((u: any) => {
        if (u.username && u.full_name) {
          userMap[u.username.toLowerCase()] = u.full_name;
        }
      });
    }

    const enrichedSessions = filteredSessions.map((s: any) => {
      const dec = decodeSessionMetadata(s.instructor_name || '');
      const facUser = (dec.facultyUsername || '').toLowerCase();
      const rawUser = dec.facultyUsername || '';
      return {
        ...s,
        creator_name: userMap[facUser] || (rawUser.startsWith('@') ? rawUser.slice(1) : rawUser) || null,
        creator_username: dec.facultyUsername || null,
      };
    });

    return NextResponse.json({
      success: true,
      sessions: enrichedSessions,
      pagination: {
        page,
        limit,
        total: count ?? enrichedSessions.length,
      },
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
    if (!session || (session.role !== 'Super Admin' && session.role !== 'Admin' && session.role !== 'Faculty')) {
      return NextResponse.json(
        { success: false, error: 'Forbidden. Authorized access required.' },
        { status: 403 }
      );
    }

    const body = await request.json();
    const className = (body.class_name || '').trim();
    if (!className) {
      return NextResponse.json({ success: false, error: 'Class / Subject name is required.' }, { status: 400 });
    }

    let finalInstructor = (body.instructor_name || '').trim();
    const facultyUsername = (session.username || session.name || '').trim();
    if (facultyUsername && !finalInstructor.includes('[BY:')) {
      finalInstructor = `${finalInstructor} [BY:${encodeURIComponent(facultyUsername)}]`.trim();
    }

    const newSession = {
      class_name: className,
      date: body.date,
      start_time: body.start_time,
      end_time: body.end_time,
      instructor_name: finalInstructor,
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
      actorId: session.username || session.name || 'admin',
      request,
      details: {
        class_name: className,
        instructor: session.name,
        target_cohort: body.target_academic_year,
        actor_name: session.name,
        actor_role: session.role,
      },
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
