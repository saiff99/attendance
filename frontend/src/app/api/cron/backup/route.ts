import { NextResponse, NextRequest } from 'next/server';
import { logAuditEvent } from '@/lib/auditLog';
import {
  getGoogleDriveConfig,
  generateDatabaseBackupPayload,
  uploadBackupToGoogleDrive,
  pruneOldGoogleDriveBackups,
} from '@/lib/googleDriveBackup';

export const dynamic = 'force-dynamic';
export const maxDuration = 120; // 2 minutes

function verifyCronAuthorization(request: NextRequest): boolean {
  const cronSecret = process.env.CRON_SECRET?.trim();
  if (!cronSecret) {
    // If CRON_SECRET is not set, allow only local development requests
    const isDev = process.env.NODE_ENV === 'development';
    const host = request.headers.get('host') || '';
    return isDev && (host.startsWith('localhost') || host.startsWith('127.0.0.1'));
  }

  // 1. Check Authorization Header (Bearer token)
  const authHeader = request.headers.get('authorization');
  if (authHeader && authHeader.startsWith('Bearer ')) {
    const token = authHeader.slice(7).trim();
    if (token === cronSecret) return true;
  }

  // 2. Check X-Cron-Secret header or URL query parameter
  const xSecret = request.headers.get('x-cron-secret');
  if (xSecret && xSecret === cronSecret) return true;

  const urlSecret = new URL(request.url).searchParams.get('secret');
  if (urlSecret && urlSecret === cronSecret) return true;

  return false;
}

export async function GET(request: NextRequest) {
  return handleAutomatedBackup(request);
}

export async function POST(request: NextRequest) {
  return handleAutomatedBackup(request);
}

async function handleAutomatedBackup(request: NextRequest) {
  try {
    // 1. Verify Secret Gate
    if (!verifyCronAuthorization(request)) {
      return NextResponse.json(
        { error: 'Unauthorized: Valid CRON_SECRET is required to trigger automated backups.' },
        { status: 401 }
      );
    }

    const config = getGoogleDriveConfig();
    if (!config.isConfigured) {
      return NextResponse.json(
        {
          error: `Automated backup skipped: Google Drive is not configured. Missing: ${config.missingKeys.join(', ')}`,
        },
        { status: 503 }
      );
    }

    // 2. Generate encrypted database snapshot
    const actor = 'Automated Nightly Cron (System)';
    const { payloadString, recordCounts, checksum, timestampIso } =
      await generateDatabaseBackupPayload(actor);

    const fileTimestamp = timestampIso.replace(/[:.]/g, '-');
    const filename = `medattend_backup_${fileTimestamp}.enc.json`;

    // 3. Upload to Google Drive
    const uploadResult = await uploadBackupToGoogleDrive(filename, payloadString);

    // 4. Prune older backups (> 30 days)
    const pruneResult = await pruneOldGoogleDriveBackups(30);

    // 5. Audit Log
    logAuditEvent({
      action: 'DATABASE_BACKUP_AUTOMATED_CRON_SYNC',
      targetType: 'system',
      targetId: uploadResult.fileId,
      actorId: 'system_cron',
      request,
      details: {
        fileName: filename,
        fileId: uploadResult.fileId,
        sizeBytes: uploadResult.sizeBytes,
        checksum,
        recordCounts,
        prunedFiles: pruneResult.prunedFiles,
      },
    });

    return NextResponse.json({
      success: true,
      timestamp: timestampIso,
      file: {
        id: uploadResult.fileId,
        name: filename,
        sizeBytes: uploadResult.sizeBytes,
        recordCounts,
        checksum,
      },
      retention: {
        prunedCount: pruneResult.prunedCount,
        prunedFiles: pruneResult.prunedFiles,
      },
    });
  } catch (error: any) {
    console.error('[Automated Cron Backup Error]:', error);
    return NextResponse.json(
      { error: error.message || 'Automated backup job failed' },
      { status: 500 }
    );
  }
}
