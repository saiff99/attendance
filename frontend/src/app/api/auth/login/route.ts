import { NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import { createSessionToken, SESSION_COOKIE_NAME } from '@/lib/serverAuth';
import { logAuditEvent } from '@/lib/auditLog';
import { supabaseServer } from '@/lib/supabaseServer';
import {
  acquireLoginSlot,
  getTrustedClientIp,
} from '@/lib/rateLimiter';

export async function POST(request: Request) {
  let slot: { allowed: boolean; remainingSeconds: number; reason?: 'account' | 'ip'; release: (success: boolean) => Promise<void> } | null = null;
  try {
    const simulateStorageFailure = request.headers.get('x-test-simulate-storage-failure') === '1';
    const clientIp = getTrustedClientIp(request);

    let body: any;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ success: false, error: 'Invalid JSON body.' }, { status: 400 });
    }

    const username = (body.username || '').trim().toLowerCase();
    const password = (body.password || '').trim();
    const mode = (body.mode || '').trim().toLowerCase(); // 'admin' | 'student' | ''

    const now = Date.now();

    // Concurrency-safe atomic attempt slot reservation (eliminates parallel race condition)
    slot = await acquireLoginSlot(username, clientIp, now, simulateStorageFailure);
    if (!slot.allowed) {
      const lockMsg = slot.reason === 'ip'
        ? `Too many failed login attempts from this network. Temporarily throttled. Please try again in ${slot.remainingSeconds}s.`
        : `Too many failed login attempts. Account locked for security. Please try again in ${slot.remainingSeconds}s.`;

      return NextResponse.json(
        {
          success: false,
          error: lockMsg,
        },
        {
          status: 429,
          headers: { 'Retry-After': slot.remainingSeconds.toString() },
        }
      );
    }

    if (!username || !password) {
      await slot.release(false);
      return NextResponse.json(
        { success: false, error: 'Username and password are required.' },
        { status: 400 }
      );
    }

    let authSuccess = false;
    let authUser = {
      username,
      name: '',
      role: 'Faculty' as 'Super Admin' | 'Admin' | 'Faculty' | 'Student',
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
            await slot.release(false);
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
              role: dbUser.role as 'Super Admin' | 'Admin' | 'Faculty',
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
        console.warn('[LOGIN DB CHECK FAILED]', dbEx);
      }
    }

    // 2. Fallback to Supabase students table for Student Portal Login (Only for Student mode or unspecified mode)
    if (!authSuccess && mode !== 'admin') {
      try {
        const { data: student, error: stuErr } = await supabaseServer
          .from('students')
          .select('*')
          .or(`student_roll.ilike.${username},email.ilike.${username}`)
          .maybeSingle();

        if (!stuErr && student) {
          let isStudentMatch = false;

          // Strict Zero-Trust PIN Verification:
          // Authentication is exclusively verified against salted bcrypt hashes ($2b$10$...).
          // Insecure plaintext comparisons against portal_pin have been permanently eliminated.
          if (student.portal_password_hash && student.portal_password_hash.startsWith('$2')) {
            isStudentMatch = await bcrypt.compare(password, student.portal_password_hash);
          }

          // Strict Zero-Trust: If no valid hash exists or comparison fails, login fails immediately.
          // No Roll Number, empty string, or default 123456 fallback is ever permitted.

          if (isStudentMatch) {
            authSuccess = true;
            const isTempActivationPin = student.portal_pin === 'TEMP';
            authUser = {
              username: student.student_roll,
              name: student.full_name,
              role: 'Student',
              department: student.academic_year || 'MBBS',
              studentId: student.id,
              studentRoll: student.student_roll,
              academicYear: student.academic_year || '1st Year',
              requiresPinChange: isTempActivationPin,
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
            await slot.release(false);
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
          const { data: dbUser } = await supabaseServer
            .from('app_users')
            .select('id')
            .ilike('username', username)
            .maybeSingle();

          if (dbUser) {
            await slot.release(false);
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

      // Record failed attempt and release concurrency slot
      await slot.release(false);

      // Record failed attempt for Admin & Faculty security auditing only (exclude routine student login typos)
      if (mode !== 'student') {
        logAuditEvent({
          action: 'FAILED_LOGIN_ATTEMPT',
          targetType: 'system',
          actorId: username,
          details: { reason: 'Incorrect credentials', ip: clientIp, mode },
        });
      }

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

    // Authentication succeeded: clear rate limiter and release concurrency slot
    await slot.release(true);

    // Log successful login audit entry (Excluded for routine Students to keep audit trail clean and focused on Admin/Faculty operations)
    if (authUser.role !== 'Student') {
      logAuditEvent({
        action: 'USER_LOGIN',
        targetType: 'system',
        actorId: authUser.username,
        details: { name: authUser.name, role: authUser.role, ip: clientIp },
      });
    }

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
    if (slot) {
      try {
        await slot.release(false);
      } catch {}
    }
    console.error('[AUTH ERROR]', error);
    return NextResponse.json(
      { success: false, error: 'Internal authentication error.' },
      { status: 500 }
    );
  }
}
