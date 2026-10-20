import { NextResponse, NextRequest } from 'next/server';
import bcrypt from 'bcryptjs';
import { verifySessionToken, SESSION_COOKIE_NAME } from '@/lib/serverAuth';
import { supabaseServer } from '@/lib/supabaseServer';
import { logAuditEvent } from '@/lib/auditLog';

export async function GET(request: NextRequest) {
  try {
    const sessionCookie = request.cookies.get(SESSION_COOKIE_NAME)?.value;
    if (!sessionCookie) {
      return NextResponse.json({ success: false, error: 'Unauthorized.' }, { status: 401 });
    }

    const session = await verifySessionToken(sessionCookie);
    if (!session || (session.role !== 'Super Admin' && session.role !== 'Admin')) {
      return NextResponse.json(
        { success: false, error: 'Forbidden. Admin or Super Admin access required.' },
        { status: 403 }
      );
    }

    // Fetch dynamic users from Supabase
    const { data: dbUsers, error } = await supabaseServer
      .from('app_users')
      .select('id, username, full_name, email, role, department, is_active, created_at, last_login')
      .order('created_at', { ascending: false });

    if (error) {
      // If table doesn't exist yet in Supabase (PGRST205)
      if (error.code === 'PGRST205' || error.message?.includes('does not exist')) {
        return NextResponse.json({
          success: true,
          users: [],
          tableReady: false,
          message: 'The app_users table is not yet created in Supabase. Please run the SQL migration script.',
        });
      }
      throw error;
    }

    return NextResponse.json({
      success: true,
      users: dbUsers || [],
      tableReady: true,
    });
  } catch (error: any) {
    console.error('[GET /api/users ERROR]', error);
    return NextResponse.json(
      { success: false, error: error.message || 'Failed to fetch users.' },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const sessionCookie = request.cookies.get(SESSION_COOKIE_NAME)?.value;
    if (!sessionCookie) {
      return NextResponse.json({ success: false, error: 'Unauthorized.' }, { status: 401 });
    }

    const session = await verifySessionToken(sessionCookie);
    if (!session || (session.role !== 'Super Admin' && session.role !== 'Admin')) {
      return NextResponse.json(
        { success: false, error: 'Forbidden. Administrator privileges required.' },
        { status: 403 }
      );
    }

    const body = await request.json();
    const username = (body.username || '').trim().toLowerCase();
    const fullName = (body.full_name || '').trim();
    const email = body.email ? body.email.trim().toLowerCase() : null;
    const password = (body.password || '').trim();
    const department = (body.department || '').trim();

    // Strict Role Authorization:
    // 1. Admin can ONLY create Faculty accounts.
    // 2. Super Admin can create Super Admin, Admin, or Faculty accounts.
    let role: 'Super Admin' | 'Admin' | 'Faculty' = 'Faculty';
    if (session.role === 'Admin') {
      if (body.role && body.role !== 'Faculty') {
        return NextResponse.json(
          { success: false, error: 'Forbidden. Admins can only create Faculty accounts.' },
          { status: 403 }
        );
      }
      role = 'Faculty';
    } else if (session.role === 'Super Admin') {
      if (body.role === 'Super Admin') {
        role = 'Super Admin';
      } else if (body.role === 'Admin') {
        role = 'Admin';
      } else {
        role = 'Faculty';
      }
    }

    if (!username || username.length < 3) {
      return NextResponse.json(
        { success: false, error: 'Username must be at least 3 characters.' },
        { status: 400 }
      );
    }

    if (!fullName) {
      return NextResponse.json(
        { success: false, error: 'Full name is required.' },
        { status: 400 }
      );
    }

    if (!password || password.length < 6) {
      return NextResponse.json(
        { success: false, error: 'Password must be at least 6 characters.' },
        { status: 400 }
      );
    }


    // Check if user already exists in DB
    const { data: existingUser } = await supabaseServer
      .from('app_users')
      .select('id, username')
      .ilike('username', username)
      .maybeSingle();

    if (existingUser) {
      return NextResponse.json(
        { success: false, error: `The username '${username}' is already in use. Please pick another.` },
        { status: 400 }
      );
    }

    // Hash password with salted bcrypt (10 rounds)
    const passwordHash = await bcrypt.hash(password, 10);

    const { data: newUser, error: insertError } = await supabaseServer
      .from('app_users')
      .insert([
        {
          username,
          full_name: fullName,
          email,
          password_hash: passwordHash,
          role,
          department: department || null,
          is_active: true,
        },
      ])
      .select('id, username, full_name, email, role, department, is_active, created_at')
      .single();

    if (insertError) {
      if (insertError.code === 'PGRST205') {
        return NextResponse.json(
          {
            success: false,
            error: 'The app_users table does not exist in Supabase yet. Please run database/create_users_table.sql in Supabase SQL Editor.',
          },
          { status: 503 }
        );
      }
      throw insertError;
    }

    logAuditEvent({
      action: 'CREATE_FACULTY_USER',
      targetType: 'system',
      targetId: newUser.id,
      actorId: session.username,
      details: {
        created_username: username,
        full_name: fullName,
        role,
        department,
      },
    });

    return NextResponse.json({
      success: true,
      user: newUser,
      message: `Account for ${fullName} (${username}) created successfully.`,
    });
  } catch (error: any) {
    console.error('[POST /api/users ERROR]', error);
    return NextResponse.json(
      { success: false, error: error.message || 'Failed to create user account.' },
      { status: 500 }
    );
  }
}

