import { NextResponse, NextRequest } from 'next/server';
import crypto from 'crypto';
import { supabaseServer } from '@/lib/supabaseServer';
import { verifySessionToken, SESSION_COOKIE_NAME } from '@/lib/serverAuth';
import { logAuditEvent } from '@/lib/auditLog';

export const dynamic = 'force-dynamic';
export const maxDuration = 120; // 2 minutes for large datasets

async function fetchAllRows<T = Record<string, unknown>>(
  tableName: string,
  selectFields: string,
  filterFn?: (query: any) => any
): Promise<T[]> {
  const allRows: T[] = [];
  let from = 0;
  const step = 1000;

  while (true) {
    let query = supabaseServer.from(tableName).select(selectFields).range(from, from + step - 1);
    if (filterFn) {
      query = filterFn(query);
    }
    const { data, error } = await query;
    if (error) {
      console.error(`Error fetching table ${tableName} at range [${from}, ${from + step - 1}]:`, error);
      throw new Error(`Failed to read data from ${tableName}: ${error.message}`);
    }
    if (!data || data.length === 0) break;
    allRows.push(...(data as unknown as T[]));
    if (data.length < step) break;
    from += step;
  }

  return allRows;
}

export async function GET(request: NextRequest) {
  try {
    // 1. Strict Super Admin Authorization Gate
    const sessionCookie = request.cookies.get(SESSION_COOKIE_NAME)?.value;
    if (!sessionCookie) {
      return NextResponse.json({ error: 'Unauthorized: Session required.' }, { status: 401 });
    }

    const session = await verifySessionToken(sessionCookie);
    if (!session || session.role !== 'Super Admin') {
      return NextResponse.json(
        { error: 'Forbidden: Database backup export is restricted exclusively to Super Admin.' },
        { status: 403 }
      );
    }

    const { searchParams } = new URL(request.url);
    const isStatsOnly = searchParams.get('action') === 'stats';

    // 2. If stats only, return quick counts for admin UI summary
    if (isStatsOnly) {
      const [studentsCount, sessionsCount, attendanceCount, subjectsCount] = await Promise.all([
        supabaseServer.from('students').select('*', { count: 'exact', head: true }),
        supabaseServer.from('sessions').select('*', { count: 'exact', head: true }),
        supabaseServer.from('attendance').select('*', { count: 'exact', head: true }),
        supabaseServer.from('academic_subjects').select('*', { count: 'exact', head: true }),
      ]);

      return NextResponse.json({
        success: true,
        stats: {
          students: studentsCount.count || 0,
          sessions: sessionsCount.count || 0,
          attendance: attendanceCount.count || 0,
          subjects: subjectsCount.count || 0,
        },
      });
    }

    // 3. Complete Paginated Export of Production Tables
    const [students, sessions, attendance, subjects, settings] = await Promise.all([
      fetchAllRows('students', '*'),
      fetchAllRows('sessions', '*'),
      fetchAllRows('attendance', '*'),
      fetchAllRows('academic_subjects', '*'),
      fetchAllRows('settings', '*', (q) => q.not('key', 'like', 'rl_%')),
    ]);

    const backupData = {
      students,
      sessions,
      attendance,
      subjects,
      settings,
    };

    const dataString = JSON.stringify(backupData);
    const checksum = crypto.createHash('sha256').update(dataString).digest('hex');
    const timestampIso = new Date().toISOString();
    const fileTimestamp = timestampIso.replace(/[:.]/g, '-');

    const backupPayload = {
      app: 'MedAttend',
      version: '2.0',
      exported_at: timestampIso,
      exported_by: session.username || session.name || 'Super Admin',
      record_counts: {
        students: students.length,
        sessions: sessions.length,
        attendance: attendance.length,
        subjects: subjects.length,
        settings: settings.length,
      },
      checksum,
      data: backupData,
    };

    // 4. Audit Log Recording
    logAuditEvent({
      action: 'DATABASE_BACKUP_DOWNLOADED',
      targetType: 'system',
      targetId: 'database_backup',
      actorId: session.username || session.name || 'Super Admin',
      request,
      details: {
        exported_by: session.username || session.name,
        record_counts: backupPayload.record_counts,
        checksum,
      },
    });

    const filename = `medattend_backup_${fileTimestamp}.json`;

    return new Response(JSON.stringify(backupPayload, null, 2), {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'Content-Disposition': `attachment; filename="${filename}"`,
        'Cache-Control': 'no-store, no-cache, must-revalidate',
      },
    });
  } catch (error: any) {
    console.error('[Database Backup Error]:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to generate database backup' },
      { status: 500 }
    );
  }
}
