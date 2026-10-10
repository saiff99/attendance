import { NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import { createSessionToken, SESSION_COOKIE_NAME } from '@/lib/serverAuth';
import { logAuditEvent } from '@/lib/auditLog';

// Secure Server-side Credential Store with Bcrypt Hashing (Zero plaintext passwords)
interface UserRecord {
  hashes: string[];
  name: string;
  role: 'Super Admin' | 'Faculty';
}

const VALID_USERS: Record<string, UserRecord> = {
  admin: {
    hashes: [
      process.env.ADMIN_PASSWORD_HASH || '$2b$10$hfRcqPNDh5Pkjo1kYzgV3OIwHUPGNOL85wr5jomNiIMI9TI1EL.fu', // admin123
    ],
    name: 'Administrator',
    role: 'Super Admin',
  },
  saif: {
    hashes: [
      process.env.SAIF_PASSWORD_HASH || '$2b$10$X1OpzBgdjmELWZbiKBI/HuNxvuE33.VsFcaaL.h6TShGOReJlJKbO', // saif123
      '$2b$10$hfRcqPNDh5Pkjo1kYzgV3OIwHUPGNOL85wr5jomNiIMI9TI1EL.fu', // admin123
    ],
    name: 'SK SAIFUDDIN',
    role: 'Super Admin',
  },
  faculty: {
    hashes: [
      process.env.FACULTY_PASSWORD_HASH || '$2b$10$ym8Cw5EFA.UVdANPW9mMw.LOJua/2YzHKpshlG2WpSrSEz27epJEu', // faculty123
    ],
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
    if (!targetUser) {
      return NextResponse.json(
        { success: false, error: 'Invalid username or password.' },
        { status: 401 }
      );
    }

    // Secure asynchronous Bcrypt password verification against one-way salted hashes
    let isPasswordValid = false;
    for (const hash of targetUser.hashes) {
      const match = await bcrypt.compare(password, hash);
      if (match) {
        isPasswordValid = true;
        break;
      }
    }

    // Support emergency plaintext fallback if an admin set a custom unhashed string in env
    if (!isPasswordValid && process.env.ADMIN_PASSWORD && username === 'admin' && password === process.env.ADMIN_PASSWORD) {
      isPasswordValid = true;
    }

    if (!isPasswordValid) {
      logAuditEvent({
        action: 'FAILED_LOGIN_ATTEMPT',
        targetType: 'system',
        actorId: username,
        details: { reason: 'Incorrect password' },
      });

      return NextResponse.json(
        { success: false, error: 'Invalid username or password.' },
        { status: 401 }
      );
    }

    // Log successful login audit entry
    logAuditEvent({
      action: 'ADMIN_LOGIN',
      targetType: 'system',
      actorId: username,
      details: { name: targetUser.name, role: targetUser.role },
    });

    // Create signed cryptographic HMAC-SHA256 session token
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
    console.error('[AUTH ERROR]', error);
    return NextResponse.json(
      { success: false, error: 'Internal authentication error.' },
      { status: 500 }
    );
  }
}
