import { NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import { createSessionToken, SESSION_COOKIE_NAME } from '@/lib/serverAuth';
import { logAuditEvent } from '@/lib/auditLog';
import { supabaseServer } from '@/lib/supabaseServer';

// Secure Server-side User Directory with Salted Bcrypt Hashes (Built-in Fallbacks)
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

// Dual-Layer Persistent Rate Limiter (Memory Fast-Cache + Persistent Supabase Storage)
// Survived across server restarts, PM2 recycles, and multi-instance / serverless deployments
const loginAttemptsCache: Record<string, { count: number; firstAttempt: number; lockedUntil?: number }> = {};
const MAX_ATTEMPTS = 5;
const WINDOW_MS = 15 * 60 * 1000; // 15 minutes lockout window

async function checkRateLimit(rateKey: string, now: number): Promise<{ locked: boolean; remainingSeconds: number }> {
  // 1. Fast in-memory check
  const cached = loginAttemptsCache[rateKey];
  if (cached) {
    if (cached.lockedUntil && now < cached.lockedUntil) {
      const remainingSeconds = Math.ceil((cached.lockedUntil - now) / 1000);
      return { locked: true, remainingSeconds };
    }
    if (now - cached.firstAttempt > WINDOW_MS) {
      delete loginAttemptsCache[rateKey];
    } else if (cached.count >= MAX_ATTEMPTS) {
      const remainingSeconds = Math.ceil((cached.firstAttempt + WINDOW_MS - now) / 1000);
      return { locked: true, remainingSeconds };
    }
  }

  // 2. Persistent Supabase settings check (survives server restart & serverless scaling)
  try {
    const dbKey = `rl_login:${rateKey}`;
    const { data, error } = await supabaseServer
      .from('settings')
      .select('value')
      .eq('key', dbKey)
      .maybeSingle();

    if (!error && data?.value) {
      const val = data.value;
      const firstAttempt = Number(val.firstAttempt) || now;
      const count = Number(val.count) || 0;
      const lockedUntil = Number(val.lockedUntil) || 0;

      // Sync into memory cache
      loginAttemptsCache[rateKey] = { count, firstAttempt, lockedUntil };

      if (lockedUntil && now < lockedUntil) {
        const remainingSeconds = Math.ceil((lockedUntil - now) / 1000);
        return { locked: true, remainingSeconds };
      }
      if (now - firstAttempt > WINDOW_MS) {
        Promise.resolve(supabaseServer.from('settings').delete().eq('key', dbKey)).catch(() => {});
        delete loginAttemptsCache[rateKey];
      } else if (count >= MAX_ATTEMPTS) {
        const remainingSeconds = Math.ceil((firstAttempt + WINDOW_MS - now) / 1000);
        return { locked: true, remainingSeconds };
      }
    }
  } catch (e) {
    // Fail-open on database glitch to ensure legitimate users are never locked out
  }

  return { locked: false, remainingSeconds: 0 };
}

async function recordFailedAttempt(rateKey: string, now: number): Promise<number> {
  const cached = loginAttemptsCache[rateKey] || { count: 0, firstAttempt: now };
  cached.count += 1;
  if (cached.count >= MAX_ATTEMPTS && !cached.lockedUntil) {
    cached.lockedUntil = now + WINDOW_MS;
  }
  loginAttemptsCache[rateKey] = cached;

  // Persist to Supabase settings
  try {
    const dbKey = `rl_login:${rateKey}`;
    await supabaseServer
      .from('settings')
      .upsert({
        key: dbKey,
        value: {
          count: cached.count,
          firstAttempt: cached.firstAttempt,
          lockedUntil: cached.lockedUntil || (cached.count >= MAX_ATTEMPTS ? now + WINDOW_MS : 0),
          lastAttempt: now,
        },
      });
  } catch (e) {
    console.warn('[RATE LIMIT DB SYNC WARNING]', e);
  }

  return cached.count;
}

async function resetRateLimit(rateKey: string): Promise<void> {
  delete loginAttemptsCache[rateKey];
  try {
    const dbKey = `rl_login:${rateKey}`;
    await supabaseServer.from('settings').delete().eq('key', dbKey);
  } catch (e) {
    // Graceful catch
  }
}

export async function POST(request: Request) {
  try {
    const forwarded = request.headers.get('x-forwarded-for') || request.headers.get('cf-connecting-ip') || '127.0.0.1';
    const clientIp = forwarded.split(',')[0].trim();

    const body = await request.json();
    const username = (body.username || '').trim().toLowerCase();
    const password = (body.password || '').trim();
    const mode = (body.mode || '').trim().toLowerCase(); // 'admin' | 'student' | ''

    const rateKey = `${clientIp}:${username || 'unknown'}`;
    const now = Date.now();

    // Check shared & persistent rate limiter
    const rateStatus = await checkRateLimit(rateKey, now);
    if (rateStatus.locked) {
      return NextResponse.json(
        {
          success: false,
          error: `Too many failed login attempts. Account locked for security. Please try again in ${rateStatus.remainingSeconds}s.`,
        },
        {
          status: 429,
          headers: { 'Retry-After': rateStatus.remainingSeconds.toString() },
        }
      );
    }

    if (!username || !password) {
      return NextResponse.json(
        { success: false, error: 'Username and password are required.' },
        { status: 400 }
      );
    }

    let authSuccess = false;
    let authUser = {
      username,
      name: '',
      role: 'Faculty' as 'Super Admin' | 'Faculty' | 'Student',
      department: '',
      studentId: undefined as string | undefined,
      studentRoll: undefined as string | undefined,
      academicYear: undefined as string | undefined,
    };

    // 1. Check dynamic Supabase app_users table (Only for Admin/Faculty mode or unspecified mode)
    if (mode !== 'student') {
      try {
        const { data: dbUser, error: dbErr } = await supabaseServer
          .from('app_users')
          .select('*')
          .ilike('username', username)
          .maybeSingle();

        if (!dbErr && dbUser) {
          if (!dbUser.is_active) {
            return NextResponse.json(
              { success: false, error: 'Your account has been deactivated. Please contact the administrator.' },
              { status: 403 }
            );
          }

          const isMatch = await bcrypt.compare(password, dbUser.password_hash);
          if (isMatch) {
            authSuccess = true;
            authUser = {
              username: dbUser.username,
              name: dbUser.full_name,
              role: dbUser.role as 'Super Admin' | 'Faculty',
              department: dbUser.department || '',
              studentId: undefined,
              studentRoll: undefined,
              academicYear: undefined,
            };

            // Update last_login timestamp asynchronously
            Promise.resolve(
              supabaseServer
                .from('app_users')
                .update({ last_login: new Date().toISOString() })
                .eq('id', dbUser.id)
            ).catch(() => {});
          }
        }
      } catch (dbEx) {
        console.warn('[LOGIN DB CHECK FAILED, FALLING BACK TO BUILT-IN]', dbEx);
      }
    }

    // 2. Fallback to built-in user directory (Only for Admin/Faculty mode or unspecified mode)
    if (!authSuccess && mode !== 'student') {
      const targetUser = USER_DIRECTORY[username];
      if (targetUser) {
        const customPlain = process.env[targetUser.plainEnvVar]?.trim();
        const customHash = process.env[targetUser.hashEnvVar]?.trim();

        if (customPlain && password === customPlain) {
          authSuccess = true;
        } else if (customHash && customHash.startsWith('$2') && (await bcrypt.compare(password, customHash))) {
          authSuccess = true;
        } else {
          const defaultHash = BUILTIN_USER_HASHES[username];
          if (defaultHash && (await bcrypt.compare(password, defaultHash))) {
            authSuccess = true;
          }
        }

        if (authSuccess) {
          authUser = {
            username,
            name: targetUser.name,
            role: targetUser.role,
            department: 'Administration',
            studentId: undefined,
            studentRoll: undefined,
            academicYear: undefined,
          };
        }
      }
    }

    // 3. Fallback to Supabase students table for Student Portal Login (Only for Student mode or unspecified mode)
    if (!authSuccess && mode !== 'admin') {
      try {
        const { data: student, error: stuErr } = await supabaseServer
          .from('students')
          .select('*')
          .or(`student_roll.ilike.${username},email.ilike.${username}`)
          .maybeSingle();

        if (!stuErr && student) {
          let isStudentMatch = false;

          // Check custom portal password hash if set
          if (student.portal_password_hash && student.portal_password_hash.startsWith('$2')) {
            isStudentMatch = await bcrypt.compare(password, student.portal_password_hash);
          }

          // Check plain portal PIN if set
          if (!isStudentMatch && student.portal_pin) {
            isStudentMatch = (password === student.portal_pin.trim());
          }

          // Default Initial Fallback if neither hash nor PIN is set yet:
          // Allow student to log in using their roll number or 123456
          if (!isStudentMatch && !student.portal_password_hash && !student.portal_pin) {
            const cleanRoll = (student.student_roll || '').trim().toLowerCase();
            if (password.toLowerCase() === cleanRoll || password === '123456') {
              isStudentMatch = true;
            }
          }

          if (isStudentMatch) {
            authSuccess = true;
            authUser = {
              username: student.student_roll,
              name: student.full_name,
              role: 'Student',
              department: student.academic_year || 'MBBS',
              studentId: student.id,
              studentRoll: student.student_roll,
              academicYear: student.academic_year || '1st Year',
            };

            // Update last_portal_login timestamp asynchronously if column exists
            Promise.resolve(
              supabaseServer
                .from('students')
                .update({ last_portal_login: new Date().toISOString() })
                .eq('id', student.id)
            ).catch(() => {});
          }
        }
      } catch (stuEx) {
        console.warn('[STUDENT LOGIN CHECK EXCEPTION]', stuEx);
      }
    }

    if (!authSuccess) {
      // Check if user accidentally entered credentials for the other tab
      if (mode === 'admin') {
        try {
          const { data: studentMatch } = await supabaseServer
            .from('students')
            .select('id, student_roll')
            .or(`student_roll.ilike.${username},email.ilike.${username}`)
            .maybeSingle();

          if (studentMatch) {
            return NextResponse.json(
              {
                success: false,
                error: 'This account belongs to a Student. Please switch to the "Student Portal" tab to sign in.',
              },
              { status: 403 }
            );
          }
        } catch {}
      }

      if (mode === 'student') {
        try {
          const isBuiltin = Boolean(USER_DIRECTORY[username]);
          let isDbStaff = false;
          if (!isBuiltin) {
            const { data: dbUser } = await supabaseServer
              .from('app_users')
              .select('id')
              .ilike('username', username)
              .maybeSingle();
            isDbStaff = Boolean(dbUser);
          }

          if (isBuiltin || isDbStaff) {
            return NextResponse.json(
              {
                success: false,
                error: 'This is a Staff/Admin account. Please switch to the "Staff & Admin" tab to sign in.',
              },
              { status: 403 }
            );
          }
        } catch {}
      }

      const attemptCount = await recordFailedAttempt(rateKey, now);

      logAuditEvent({
        action: 'FAILED_LOGIN_ATTEMPT',
        targetType: 'system',
        actorId: username,
        details: { reason: 'Incorrect credentials', ip: clientIp, attemptCount, mode },
      });

      const genericError = mode === 'student'
        ? 'Invalid Student Roll Number or PIN.'
        : mode === 'admin'
          ? 'Invalid username or password for Staff & Admin.'
          : 'Invalid username or password.';

      return NextResponse.json(
        { success: false, error: genericError },
        { status: 401 }
      );
    }

    // Reset shared persistent and in-memory rate limiter on successful authentication
    await resetRateLimit(rateKey);

    // Log successful login audit entry
    logAuditEvent({
      action: 'USER_LOGIN',
      targetType: 'system',
      actorId: authUser.username,
      details: { name: authUser.name, role: authUser.role, ip: clientIp },
    });

    // Create signed cryptographic HMAC-SHA256 session token (10 hours expiry)
    const token = await createSessionToken({
      username: authUser.username,
      name: authUser.name,
      role: authUser.role,
      department: authUser.department,
      studentId: authUser.studentId,
      studentRoll: authUser.studentRoll,
      academicYear: authUser.academicYear,
    }, 36000);

    const response = NextResponse.json({
      success: true,
      user: authUser,
    });



    // Set secure HttpOnly cookie (10 hours = 36000s)
    response.cookies.set({
      name: SESSION_COOKIE_NAME,
      value: token,
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
      maxAge: 36000,
    });

    // Also set client readable indicator cookie
    response.cookies.set({
      name: 'medattend_auth',
      value: 'true',
      httpOnly: false,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
      maxAge: 36000,
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
