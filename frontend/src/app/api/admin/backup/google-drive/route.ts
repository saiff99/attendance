import { NextResponse, NextRequest } from 'next/server';
import { verifySessionToken, SESSION_COOKIE_NAME } from '@/lib/serverAuth';
import { logAuditEvent } from '@/lib/auditLog';
import {
  getGoogleDriveConfig,
  generateDatabaseBackupPayload,
  uploadBackupToGoogleDrive,
  pruneOldGoogleDriveBackups,
  listRecentGoogleDriveBackups,
} from '@/lib/googleDriveBackup';

export const dynamic = 'force-dynamic';
export const maxDuration = 120; // 2 minutes for full export & upload

/**
 * GET: Returns Google Drive connection status and recent backups
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
        { error: 'Forbidden: Super Admin access required.' },
        { status: 403 }
      );
    }

    const config = getGoogleDriveConfig();
    const recentFiles = config.isConfigured ? await listRecentGoogleDriveBackups(5) : [];

    return NextResponse.json({
      success: true,
      config: {
        isConfigured: config.isConfigured,
        clientEmail: config.clientEmail ? `${config.clientEmail.slice(0, 4)}...${config.clientEmail.slice(-15)}` : null,
        folderId: config.folderId ? `${config.folderId.slice(0, 6)}...` : null,
        missingKeys: config.missingKeys,
        hasEncryptionKey: config.hasEncryptionKey,
      },
      recentFiles,
    });
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message || 'Failed to check Google Drive status' },
      { status: 500 }
    );
  }
}

/**
 * POST: Super Admin on-demand backup & sync to Google Drive
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
        { error: 'Forbidden: Super Admin access required.' },
        { status: 403 }
      );
    }

    const config = getGoogleDriveConfig();
    if (!config.isConfigured) {
      return NextResponse.json(
        {
          error: `Google Drive is not configured. Missing environment variables: ${config.missingKeys.join(', ')}`,
          missingKeys: config.missingKeys,
        },
        { status: 400 }
      );
    }

    // 1. Generate encrypted backup snapshot
    const actor = session.username || session.name || 'Super Admin';
    const { payloadString, recordCounts, checksum, timestampIso } =
      await generateDatabaseBackupPayload(actor);

    const fileTimestamp = timestampIso.replace(/[:.]/g, '-');
    const filename = `medattend_backup_${fileTimestamp}.enc.json`;

    // 2. Upload to Google Drive via native REST API
    const uploadResult = await uploadBackupToGoogleDrive(filename, payloadString);

    // 3. Prune backups older than 30 days
    const pruneResult = await pruneOldGoogleDriveBackups(30);

    // 4. Audit Log
    logAuditEvent({
      action: 'DATABASE_BACKUP_GOOGLE_DRIVE_SYNC',
      targetType: 'system',
      targetId: uploadResult.fileId,
      actorId: actor,
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
      message: 'Encrypted database snapshot successfully backed up to Google Drive!',
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
    console.error('[Google Drive Backup Error]:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to complete Google Drive backup' },
      { status: 500 }
    );
  }
}
