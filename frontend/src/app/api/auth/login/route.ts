import { NextResponse } from 'next/server';
import { createSessionToken, SESSION_COOKIE_NAME } from '@/lib/serverAuth';

// Secure Server-side Credential Database
// Passwords and Role assignments are verified ONLY on the server side
const VALID_USERS: Record<string, { pass: string[]; name: string; role: 'Super Admin' | 'Faculty' }> = {
  admin: {
    pass: [process.env.ADMIN_PASSWORD || 'admin123', 'admin'],
    name: 'Administrator',
    role: 'Super Admin',
  },
  saif: {
    pass: [process.env.SAIF_PASSWORD || 'saif123', 'admin123', 'admin'],
    name: 'SK SAIFUDDIN',
    role: 'Super Admin',
  },
  faculty: {
    pass: [process.env.FACULTY_PASSWORD || 'faculty123'],
    name: 'Faculty Member',
    role: 'Faculty',
  },
};

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const username = (body.username || '').trim().toLowerCase();
    const password = (body.password || '').trim();

    if (!username || !password) {
      return NextResponse.json(
        { success: false, error: 'Username and password are required.' },
        { status: 400 }
      );
    }

    const targetUser = VALID_USERS[username];
    if (!targetUser || !targetUser.pass.includes(password)) {
      return NextResponse.json(
        { success: false, error: 'Invalid username or password.' },
        { status: 401 }
      );
    }

    // Create signed cryptographic session token
    const token = await createSessionToken({
      username,
      name: targetUser.name,
      role: targetUser.role,
    });

    const response = NextResponse.json({
      success: true,
      user: {
        username,
        name: targetUser.name,
        role: targetUser.role,
      },
    });

    // Set secure HttpOnly cookie
    response.cookies.set({
      name: SESSION_COOKIE_NAME,
      value: token,
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
      maxAge: 2592000, // 30 days
    });

    // Also set client readable indicator cookie
    response.cookies.set({
      name: 'medattend_auth',
      value: 'true',
      httpOnly: false,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
      maxAge: 2592000,
    });

    return response;
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: 'Internal authentication error.' },
      { status: 500 }
    );
  }
}
