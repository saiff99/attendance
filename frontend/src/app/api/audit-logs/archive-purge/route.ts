import { NextResponse, NextRequest } from 'next/server';
import crypto from 'crypto';
import { supabaseServer } from '@/lib/supabaseServer';
import { verifySessionToken, SESSION_COOKIE_NAME } from '@/lib/serverAuth';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const MIN_RETENTION_DAYS = 180; // Hard security limit: Cannot purge logs newer than 180 days

function getMinAllowedDate(): Date {
  const minDate = new Date();
  minDate.setDate(minDate.getDate() - MIN_RETENTION_DAYS);
  return minDate;
}

/**
 * GET /api/audit-logs/archive-purge
 * Query params:
 *   - cutoff_date: ISO date string
 *   - action: 'stats' (default) | 'export'
 */
export async function GET(request: NextRequest) {
  try {
    const sessionCookie = request.cookies.get(SESSION_COOKIE_NAME)?.value;
    if (!sessionCookie) {
      return NextResponse.json({ error: 'Unauthorized: Session required.' }, { status: 401 });
    }

    const session = await verifySessionToken(sessionCookie);
    if (!session || session.role !== 'Super Admin') {
      return NextResponse.json(
        { error: 'Forbidden: Archival and purge operations are restricted exclusively to Super Admin.' },
        { status: 403 }
      );
    }

    const { searchParams } = new URL(request.url);
    const cutoffParam = searchParams.get('cutoff_date');
    const action = searchParams.get('action') || 'stats';

    if (!cutoffParam) {
      return NextResponse.json({ error: 'Missing required parameter: cutoff_date' }, { status: 400 });
    }

    const cutoffDate = new Date(cutoffParam);
    if (isNaN(cutoffDate.getTime())) {
      return NextResponse.json({ error: 'Invalid cutoff_date format.' }, { status: 400 });
    }

    const minAllowedDate = getMinAllowedDate();
    if (cutoffDate.getTime() > minAllowedDate.getTime()) {
      return NextResponse.json(
        {
          error: `Security Guard: Cutoff date must be at least ${MIN_RETENTION_DAYS} days in the past (on or before ${minAllowedDate.toISOString().slice(0, 10)}).`,
        },
        { status: 400 }
      );
    }

    const cutoffIso = cutoffDate.toISOString();

    if (action === 'export') {
      // Export full matching logs for cold storage download
      const { data, error } = await supabaseServer
        .from('audit_logs')
        .select('*')
        .lt('created_at', cutoffIso)
        .order('created_at', { ascending: true });

      if (error) {
        return NextResponse.json({ error: `Database read failed: ${error.message}` }, { status: 500 });
      }

      const records = data || [];
      const checksum = crypto.createHash('sha256').update(JSON.stringify(records)).digest('hex');

      return NextResponse.json({
        success: true,
        count: records.length,
        cutoff_date: cutoffIso,
        checksum,
        archive_payload: {
          app: 'MedAttend',
          version: '2.0',
          archive_type: 'ANNUAL_FORENSIC_COLD_STORAGE',
          exported_at: new Date().toISOString(),
          exported_by: session.username || session.name || 'Super Admin',
          cutoff_date: cutoffIso,
          record_count: records.length,
          checksum,
          records,
        },
      });
    }

    // Default: Return stats count of matching logs
    const { count, error } = await supabaseServer
      .from('audit_logs')
      .select('*', { count: 'exact', head: true })
      .lt('created_at', cutoffIso);

    if (error) {
      return NextResponse.json({ error: `Failed to fetch stats: ${error.message}` }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      count: count || 0,
      cutoff_date: cutoffIso,
      min_allowed_date: minAllowedDate.toISOString(),
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Internal Server Error';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

/**
 * POST /api/audit-logs/archive-purge
 * Body:
 *   - cutoff_date: ISO date string
 *   - confirmation: 'CONFIRM_FORENSIC_PURGE'
 */
export async function POST(request: NextRequest) {
  try {
    const sessionCookie = request.cookies.get(SESSION_COOKIE_NAME)?.value;
    if (!sessionCookie) {
      return NextResponse.json({ error: 'Unauthorized: Session required.' }, { status: 401 });
    }

    const session = await verifySessionToken(sessionCookie);
    if (!session || session.role !== 'Super Admin') {
      return NextResponse.json(
        { error: 'Forbidden: Archival and purge operations are restricted exclusively to Super Admin.' },
        { status: 403 }
      );
    }

    const body = await request.json().catch(() => ({}));
    const { cutoff_date: cutoffParam, confirmation } = body;

    if (!cutoffParam || !confirmation) {
      return NextResponse.json(
        { error: 'Missing required parameters: cutoff_date and confirmation.' },
        { status: 400 }
      );
    }

    if (confirmation !== 'CONFIRM_FORENSIC_PURGE') {
      return NextResponse.json(
        { error: 'Invalid confirmation token. You must type CONFIRM_FORENSIC_PURGE to execute purge.' },
        { status: 400 }
      );
    }

    const cutoffDate = new Date(cutoffParam);
    if (isNaN(cutoffDate.getTime())) {
      return NextResponse.json({ error: 'Invalid cutoff_date format.' }, { status: 400 });
    }

    const minAllowedDate = getMinAllowedDate();
    if (cutoffDate.getTime() > minAllowedDate.getTime()) {
      return NextResponse.json(
        {
          error: `Security Guard: Cutoff date must be at least ${MIN_RETENTION_DAYS} days in the past (on or before ${minAllowedDate.toISOString().slice(0, 10)}).`,
        },
        { status: 400 }
      );
    }

    const cutoffIso = cutoffDate.toISOString();
    const adminIdentifier = session.username || session.name || session.userId || 'admin';

    // Execute via atomic PostgreSQL Stored Procedure (Migration 22)
    const { data: rpcData, error: rpcError } = await supabaseServer.rpc('purge_archived_audit_logs', {
      p_cutoff_timestamp: cutoffIso,
      p_confirmation: 'CONFIRM_FORENSIC_PURGE',
      p_admin_id: adminIdentifier,
    });

    if (rpcError) {
      // If RPC is missing in schema cache, inform user clearly
      if (rpcError.code === 'PGRST202' || rpcError.message.includes('not find the function')) {
        return NextResponse.json(
          {
            error:
              'Database procedure purge_archived_audit_logs is not yet registered. Please apply database migration 22 in your Supabase SQL editor.',
            details: rpcError.message,
          },
          { status: 501 }
        );
      }
      return NextResponse.json({ error: `Purge execution failed: ${rpcError.message}` }, { status: 500 });
    }

    const result = rpcData as { success?: boolean; deleted_count?: number; cutoff_timestamp?: string };

    return NextResponse.json({
      success: true,
      purged_count: result.deleted_count ?? 0,
      cutoff_date: cutoffIso,
      executed_at: new Date().toISOString(),
      executed_by: adminIdentifier,
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Internal Server Error';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
