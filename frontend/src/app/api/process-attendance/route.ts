import { NextResponse, NextRequest } from 'next/server';
import { fetchBackend } from '@/lib/serverBackend';
import { verifySessionToken, SESSION_COOKIE_NAME } from '@/lib/serverAuth';
import { logAuditEvent } from '@/lib/auditLog';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  try {
    // 1. Mandatory Session Verification (Zero Unauthenticated Access)
    const sessionCookie = request.cookies.get(SESSION_COOKIE_NAME)?.value;
    if (!sessionCookie) {
      return NextResponse.json(
        { success: false, detail: 'Unauthorized: Authentication session required.', error: 'Unauthorized: Authentication session required.' },
        { status: 401 }
      );
    }

    const session = await verifySessionToken(sessionCookie);
    if (!session) {
      return NextResponse.json(
        { success: false, detail: 'Unauthorized: Invalid or expired session.', error: 'Unauthorized: Invalid or expired session.' },
        { status: 401 }
      );
    }

    // 2. Strict Role-Based Access Control (RBAC): Super Admin, Admin, and Faculty only
    if (session.role !== 'Super Admin' && session.role !== 'Admin' && session.role !== 'Faculty') {
      logAuditEvent({
        action: 'UNAUTHORIZED_CLASSROOM_ATTENDANCE_ATTEMPT',
        targetType: 'attendance',
        targetId: 'unknown',
        actorId: session.username || 'unknown',
        request,
        details: {
          role: session.role,
          reason: 'Student or unprivileged role attempted to trigger classroom attendance processing',
        },
      });

      return NextResponse.json(
        { success: false, detail: 'Forbidden: Faculty or Admin privileges required.', error: 'Forbidden: Faculty or Admin privileges required.' },
        { status: 403 }
      );
    }

    const formData = await request.formData();
    const sessionId = (formData.get('session_id') || '').toString().trim();
    if (!sessionId) {
      return NextResponse.json(
        { success: false, detail: 'session_id is required.', error: 'session_id is required.' },
        { status: 400 }
      );
    }

    const file = formData.get('file') as Blob | null;
    if (!file) {
      return NextResponse.json(
        { success: false, detail: 'Classroom photo file is required.', error: 'Classroom photo file is required.' },
        { status: 400 }
      );
    }

    if (file.size > 15 * 1024 * 1024) {
      return NextResponse.json(
        { success: false, detail: 'Classroom photo too large (Max 15MB).', error: 'Classroom photo too large (Max 15MB).' },
        { status: 413 }
      );
    }
    if (file.type && !file.type.startsWith('image/')) {
      return NextResponse.json(
        { success: false, detail: 'Only image files are permitted.', error: 'Only image files are permitted.' },
        { status: 415 }
      );
    }

    // Forward to FastAPI AI backend via secure internal proxy
    const res = await fetchBackend('/api/process-attendance', {
      method: 'POST',
      body: formData,
    });

    const data = await res.json();

    if (res.ok && data.success) {
      logAuditEvent({
        action: 'CLASSROOM_PHOTO_ATTENDANCE_PROCESSED',
        targetType: 'session',
        targetId: sessionId,
        actorId: session.username,
        request,
        details: {
          session_id: sessionId,
          recognized_count: data.recognized ? data.recognized.length : 0,
          actor_role: session.role,
        },
      });
    }

    return NextResponse.json(data, { status: res.status });
  } catch (err: unknown) {
    console.error('Failed to process classroom attendance:', err);
    const message = err instanceof Error ? err.message : 'Face processing service unavailable.';
    return NextResponse.json(
      { success: false, detail: message, error: message },
      { status: 500 }
    );
  }
}
