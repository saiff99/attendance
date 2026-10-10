import { NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import { createSessionToken, SESSION_COOKIE_NAME } from '@/lib/serverAuth';
import { logAuditEvent } from '@/lib/auditLog';

// Secure Server-side User Directory with Bcrypt Hashes (loaded from environment)
interface UserConfig {
  hashEnvVar: string;
  name: string;
  role: 'Super Admin' | 'Faculty';
}

const USER_DIRECTORY: Record<string, UserConfig> = {
  admin: {
    hashEnvVar: 'ADMIN_PASSWORD_HASH',
    name: 'Administrator',
    role: 'Super Admin',
  },
  saif: {
    hashEnvVar: 'SAIF_PASSWORD_HASH',
    name: 'SK SAIFUDDIN',
    role: 'Super Admin',
  },
  faculty: {
    hashEnvVar: 'FACULTY_PASSWORD_HASH',
    name: 'Faculty Member',
    role: 'Faculty',
  },
};

// Fallback hashes strictly for initial local dev bootstrap (if env not yet populated)
const DEV_FALLBACK_HASHES: Record<string, string> = {
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

    // Retrieve hash from environment variable or development fallback
    const configuredHash = process.env[targetUser.hashEnvVar]?.trim();
    const isProduction = process.env.NODE_ENV === 'production';
    
    // In production, reject authentication if password hash has not been configured in environment
    const targetHash = configuredHash || (!isProduction ? DEV_FALLBACK_HASHES[username] : null);

    if (!targetHash) {
      console.error(`[SECURITY ERROR] ${targetUser.hashEnvVar} is not configured in production environment!`);
      return NextResponse.json(
        { success: false, error: 'Authentication configuration error. Please contact administrator.' },
        { status: 500 }
      );
    }

    // Secure asynchronous Bcrypt password verification against one-way salted hash
    const isPasswordValid = await bcrypt.compare(password, targetHash);

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
