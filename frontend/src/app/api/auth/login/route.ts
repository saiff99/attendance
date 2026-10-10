import { NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import { createSessionToken, SESSION_COOKIE_NAME } from '@/lib/serverAuth';
import { logAuditEvent } from '@/lib/auditLog';

// Secure Server-side User Directory with Salted Bcrypt Hashes
interface UserConfig {
  plainEnvVar: string;
  hashEnvVar: string;
  name: string;
  role: 'Super Admin' | 'Faculty';
}

const USER_DIRECTORY: Record<string, UserConfig> = {
  admin: {
    plainEnvVar: 'ADMIN_PASSWORD',
    hashEnvVar: 'ADMIN_PASSWORD_HASH',
    name: 'Administrator',
    role: 'Super Admin',
  },
  saif: {
    plainEnvVar: 'SAIF_PASSWORD',
    hashEnvVar: 'SAIF_PASSWORD_HASH',
    name: 'SK SAIFUDDIN',
    role: 'Super Admin',
  },
  faculty: {
    plainEnvVar: 'FACULTY_PASSWORD',
    hashEnvVar: 'FACULTY_PASSWORD_HASH',
    name: 'Faculty Member',
    role: 'Faculty',
  },
};

// Default high-entropy salted bcrypt hashes (10 rounds)
const BUILTIN_USER_HASHES: Record<string, string> = {
  admin: '$2b$10$ndT3bKNmLRaSxnbrHr/OD.Z3e9MaqMv20Ywa4ZDfNxOV2.Wj6F7RC',
  saif: '$2b$10$Ij7ikhnwMkponzuv8QcfNeRkQV7LsBy./fkDgx0lxIlAAAS.4.ARG',
  faculty: '$2b$10$zre7r25egIL9M5o9H5nL4eQZuyzr8kIfK9AjD5jH/7eVtqtbNS25O',
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

    const targetUser = USER_DIRECTORY[username];
    if (!targetUser) {
      return NextResponse.json(
        { success: false, error: 'Invalid username or password.' },
        { status: 401 }
      );
    }

    let isPasswordValid = false;

    // 1. Check custom password or hash configured in environment
    const customPlain = process.env[targetUser.plainEnvVar]?.trim();
    const customHash = process.env[targetUser.hashEnvVar]?.trim();

    if (customPlain && password === customPlain) {
      isPasswordValid = true;
    } else if (customHash && customHash.startsWith('$2') && (await bcrypt.compare(password, customHash))) {
      isPasswordValid = true;
    } else {
      // 2. Default secure salted bcrypt verification
      const defaultHash = BUILTIN_USER_HASHES[username];
      if (defaultHash && (await bcrypt.compare(password, defaultHash))) {
        isPasswordValid = true;
      }
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
