import { NextResponse, NextRequest } from 'next/server';
import crypto from 'crypto';
import { supabaseServer } from '@/lib/supabaseServer';
import { verifySessionToken, SESSION_COOKIE_NAME } from '@/lib/serverAuth';
import { logAuditEvent } from '@/lib/auditLog';

export const dynamic = 'force-dynamic';
export const maxDuration = 300; // 5 minutes for full disaster recovery restoration

async function batchUpsert(
  tableName: string,
  records: any[],
  chunkSize: number = 100,
  onConflictKey: string = 'id'
): Promise<number> {
  if (!records || records.length === 0) return 0;
  let totalRestored = 0;

  for (let i = 0; i < records.length; i += chunkSize) {
    const chunk = records.slice(i, i + chunkSize);
    const { error } = await supabaseServer
      .from(tableName)
      .upsert(chunk, { onConflict: onConflictKey });

    if (error) {
      console.error(`Restore error on table ${tableName} chunk [${i} to ${i + chunkSize}]:`, error);
      throw new Error(`Failed to restore ${tableName}: ${error.message}`);
    }
    totalRestored += chunk.length;
  }

  return totalRestored;
}

export async function POST(request: NextRequest) {
  try {
    // 1. Strict Super Admin Authorization Gate
    const sessionCookie = request.cookies.get(SESSION_COOKIE_NAME)?.value;
    if (!sessionCookie) {
      return NextResponse.json({ error: 'Unauthorized: Session required.' }, { status: 401 });
    }

    const session = await verifySessionToken(sessionCookie);
    if (!session || session.role !== 'Super Admin') {
      return NextResponse.json(
        { error: 'Forbidden: Database restoration is restricted exclusively to Super Admin.' },
        { status: 403 }
      );
    }

    // 2. Parse and Validate Payload
    let payload: any;
    try {
      payload = await request.json();
    } catch {
      return NextResponse.json(
        { error: 'Invalid JSON payload. Please supply a valid MedAttend backup file.' },
        { status: 400 }
      );
    }

    if (!payload || typeof payload !== 'object' || !payload.data) {
      return NextResponse.json(
        { error: 'Malformed backup file: Missing "data" container.' },
        { status: 400 }
      );
    }

    const { data, checksum } = payload;
    const { students = [], sessions = [], attendance = [], subjects = [], settings = [] } = data;

    // Optional Checksum Validation
    if (checksum && typeof checksum === 'string') {
      const calculatedHash = crypto.createHash('sha256').update(JSON.stringify(data)).digest('hex');
      if (calculatedHash !== checksum) {
        return NextResponse.json(
          { error: 'Integrity Check Failed: Backup file checksum mismatch. File may be corrupted or modified.' },
          { status: 400 }
        );
      }
    }

    // 3. Foreign-Key Compliant Sequential Restoration
    // Step A: Restore Academic Subjects
    const restoredSubjects = await batchUpsert('academic_subjects', subjects, 50, 'id');

    // Step B: Restore System Settings (non-rate-limiting)
    const validSettings = settings.filter((s: any) => s && s.key && !s.key.startsWith('rl_'));
    const restoredSettings = await batchUpsert('settings', validSettings, 50, 'key');

    // Step C: Restore Students (Prerequisite for attendance foreign keys)
    const restoredStudents = await batchUpsert('students', students, 100, 'id');

    // Step D: Restore Sessions (Prerequisite for attendance foreign keys)
    const restoredSessions = await batchUpsert('sessions', sessions, 100, 'id');

    // Step E: Restore Attendance Logs
    const restoredAttendance = await batchUpsert('attendance', attendance, 250, 'id');

    // 4. Forensic Audit Log Recording
    logAuditEvent({
      action: 'DATABASE_RESTORE_COMPLETED',
      targetType: 'system',
      targetId: 'database_restore',
      actorId: session.username || session.name || 'Super Admin',
      request,
      details: {
        restored_by: session.username || session.name,
        backup_exported_at: payload.exported_at || 'unknown',
        restored_counts: {
          students: restoredStudents,
          sessions: restoredSessions,
          attendance: restoredAttendance,
          subjects: restoredSubjects,
          settings: restoredSettings,
        },
      },
    });

    return NextResponse.json({
      success: true,
      message: 'Database restoration completed successfully.',
      restored_counts: {
        students: restoredStudents,
        sessions: restoredSessions,
        attendance: restoredAttendance,
        subjects: restoredSubjects,
        settings: restoredSettings,
      },
    });
  } catch (error: any) {
    console.error('[Database Restore Fatal Error]:', error);
    return NextResponse.json(
      { error: error.message || 'Database restoration encountered an unexpected error.' },
      { status: 500 }
    );
  }
}
