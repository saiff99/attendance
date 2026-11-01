import crypto from 'crypto';
import { supabaseServer } from '@/lib/supabaseServer';

export interface GoogleDriveConfig {
  isConfigured: boolean;
  missingKeys: string[];
  clientEmail?: string;
  folderId?: string;
  hasEncryptionKey: boolean;
}

/**
 * Reads Google Drive and Backup Encryption credentials from environment
 */
export function getGoogleDriveConfig(): GoogleDriveConfig {
  const clientEmail = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL?.trim();
  const rawKey = process.env.GOOGLE_PRIVATE_KEY?.trim();
  const folderId = process.env.GOOGLE_DRIVE_FOLDER_ID?.trim();
  const encryptionKey = process.env.BACKUP_ENCRYPTION_KEY?.trim();

  const missingKeys: string[] = [];
  if (!clientEmail) missingKeys.push('GOOGLE_SERVICE_ACCOUNT_EMAIL');
  if (!rawKey) missingKeys.push('GOOGLE_PRIVATE_KEY');
  if (!folderId) missingKeys.push('GOOGLE_DRIVE_FOLDER_ID');

  return {
    isConfigured: missingKeys.length === 0,
    missingKeys,
    clientEmail,
    folderId,
    hasEncryptionKey: Boolean(encryptionKey && encryptionKey.length >= 8),
  };
}

/**
 * Formats a private key, converting escaped \n strings to genuine newlines
 */
function normalizePrivateKey(rawKey: string): string {
  let key = rawKey.replace(/\\n/g, '\n').trim();
  if (!key.startsWith('-----BEGIN PRIVATE KEY-----')) {
    key = `-----BEGIN PRIVATE KEY-----\n${key}`;
  }
  if (!key.endsWith('-----END PRIVATE KEY-----')) {
    key = `${key}\n-----END PRIVATE KEY-----`;
  }
  return key;
}

/**
 * Generates an OAuth2 Access Token for Google Drive API using pure native Node.js crypto (Zero dependencies)
 */
export async function getGoogleDriveAccessToken(): Promise<string> {
  const config = getGoogleDriveConfig();
  if (!config.isConfigured || !config.clientEmail) {
    throw new Error(
      `Google Drive is not fully configured. Missing environment variables: ${config.missingKeys.join(', ')}`
    );
  }

  const rawPrivateKey = process.env.GOOGLE_PRIVATE_KEY || '';
  const privateKey = normalizePrivateKey(rawPrivateKey);

  const now = Math.floor(Date.now() / 1000);
  const expiry = now + 3600; // 1 hour token

  // 1. JWT Header
  const header = {
    alg: 'RS256',
    typ: 'JWT',
  };

  // 2. JWT Payload (Scope for creating and reading files in the designated folder)
  const payload = {
    iss: config.clientEmail,
    scope: 'https://www.googleapis.com/auth/drive.file https://www.googleapis.com/auth/drive.metadata.readonly',
    aud: 'https://oauth2.googleapis.com/token',
    exp: expiry,
    iat: now,
  };

  const base64UrlEncode = (obj: Record<string, unknown> | string): string => {
    const str = typeof obj === 'string' ? obj : JSON.stringify(obj);
    return Buffer.from(str)
      .toString('base64')
      .replace(/=/g, '')
      .replace(/\+/g, '-')
      .replace(/\//g, '_');
  };

  const encodedHeader = base64UrlEncode(header);
  const encodedPayload = base64UrlEncode(payload);
  const unsignedToken = `${encodedHeader}.${encodedPayload}`;

  // 3. Sign using RSA-SHA256 with Service Account Private Key
  const signer = crypto.createSign('RSA-SHA256');
  signer.update(unsignedToken);
  signer.end();

  const signature = signer.sign(privateKey, 'base64');
  const base64UrlSignature = signature
    .replace(/=/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_');

  const signedJwt = `${unsignedToken}.${base64UrlSignature}`;

  // 4. Exchange JWT assertion for OAuth2 Access Token
  const tokenResponse = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion: signedJwt,
    }).toString(),
    cache: 'no-store',
  });

  if (!tokenResponse.ok) {
    const errorBody = await tokenResponse.text();
    console.error('[Google OAuth Token Error]:', tokenResponse.status, errorBody);
    throw new Error(
      `Failed to obtain Google Drive OAuth token (HTTP ${tokenResponse.status}): ${errorBody}`
    );
  }

  const tokenData = await tokenResponse.json();
  if (!tokenData.access_token) {
    throw new Error('Google OAuth token response did not contain access_token');
  }

  return tokenData.access_token;
}

/**
 * Encrypts backup data using AES-256-GCM with a derived 256-bit cryptographic key
 */
export function encryptBackupPayload(dataString: string, secretKey: string): {
  encrypted: boolean;
  algorithm: string;
  iv: string;
  authTag: string;
  ciphertext: string;
} {
  // Derive 32-byte key using SHA-256
  const key = crypto.createHash('sha256').update(secretKey).digest();
  const iv = crypto.randomBytes(12); // Recommended 12 bytes for GCM

  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  let ciphertext = cipher.update(dataString, 'utf8', 'base64');
  ciphertext += cipher.final('base64');
  const authTag = cipher.getAuthTag();

  return {
    encrypted: true,
    algorithm: 'aes-256-gcm',
    iv: iv.toString('hex'),
    authTag: authTag.toString('hex'),
    ciphertext,
  };
}

/**
 * Decrypts an AES-256-GCM encrypted backup envelope
 */
export function decryptBackupPayload(
  envelope: {
    encrypted: boolean;
    algorithm?: string;
    iv: string;
    authTag: string;
    ciphertext: string;
  },
  secretKey: string
): any {
  if (!envelope.encrypted) {
    return envelope;
  }
  const key = crypto.createHash('sha256').update(secretKey).digest();
  const iv = Buffer.from(envelope.iv, 'hex');
  const authTag = Buffer.from(envelope.authTag, 'hex');

  const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(authTag);

  let decrypted = decipher.update(envelope.ciphertext, 'base64', 'utf8');
  decrypted += decipher.final('utf8');

  return JSON.parse(decrypted);
}

/**
 * Helper to fetch all paginated rows from Supabase
 */
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
      throw new Error(`Failed to read data from ${tableName}: ${error.message}`);
    }
    if (!data || data.length === 0) break;
    allRows.push(...(data as unknown as T[]));
    if (data.length < step) break;
    from += step;
  }

  return allRows;
}

/**
 * Generates the complete database backup snapshot
 */
export async function generateDatabaseBackupPayload(actorName = 'System Automated Backup') {
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

  const rawJsonString = JSON.stringify(backupData);
  const checksum = crypto.createHash('sha256').update(rawJsonString).digest('hex');
  const timestampIso = new Date().toISOString();

  const recordCounts = {
    students: students.length,
    sessions: sessions.length,
    attendance: attendance.length,
    subjects: subjects.length,
    settings: settings.length,
  };

  const config = getGoogleDriveConfig();
  const encryptionKey = process.env.BACKUP_ENCRYPTION_KEY?.trim() || process.env.JWT_SECRET?.trim() || 'MedAttend-Default-Secret-Key-2026';

  // Apply AES-256-GCM encryption
  const encryptedContainer = encryptBackupPayload(rawJsonString, encryptionKey);

  const backupPayload = {
    app: 'MedAttend',
    version: '2.0',
    exported_at: timestampIso,
    exported_by: actorName,
    record_counts: recordCounts,
    checksum,
    ...encryptedContainer,
  };

  return {
    backupPayload,
    recordCounts,
    checksum,
    timestampIso,
    payloadString: JSON.stringify(backupPayload, null, 2),
  };
}

/**
 * Uploads file to Google Drive via native REST v3 Multipart Upload (Zero dependencies)
 */
export async function uploadBackupToGoogleDrive(
  filename: string,
  content: string
): Promise<{ fileId: string; fileName: string; sizeBytes: number; webViewLink?: string }> {
  const config = getGoogleDriveConfig();
  if (!config.folderId) {
    throw new Error('GOOGLE_DRIVE_FOLDER_ID is missing.');
  }

  const accessToken = await getGoogleDriveAccessToken();
  const boundary = `===============medattend_gdrive_${Date.now()}===============`;

  const metadata = {
    name: filename,
    parents: [config.folderId],
    mimeType: 'application/json',
    description: 'MedAttend AI Automated Encrypted Institutional Database Snapshot',
  };

  const delimiter = `\r\n--${boundary}\r\n`;
  const closeDelimiter = `\r\n--${boundary}--`;

  const multipartRequestBody =
    delimiter +
    'Content-Type: application/json; charset=UTF-8\r\n\r\n' +
    JSON.stringify(metadata) +
    delimiter +
    'Content-Type: application/json\r\n\r\n' +
    content +
    closeDelimiter;

  const uploadResponse = await fetch(
    'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,name,size,webViewLink',
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': `multipart/related; boundary=${boundary}`,
      },
      body: multipartRequestBody,
      cache: 'no-store',
    }
  );

  if (!uploadResponse.ok) {
    const errorText = await uploadResponse.text();
    console.error('[Google Drive Upload Error]:', uploadResponse.status, errorText);
    throw new Error(`Google Drive API upload failed (HTTP ${uploadResponse.status}): ${errorText}`);
  }

  const uploadResult = await uploadResponse.json();

  return {
    fileId: uploadResult.id,
    fileName: uploadResult.name,
    sizeBytes: Buffer.byteLength(content, 'utf8'),
    webViewLink: uploadResult.webViewLink,
  };
}

/**
 * Auto-rotation: Prunes backups older than the retention threshold (defaults to 30 days)
 */
export async function pruneOldGoogleDriveBackups(
  daysToKeep = 30
): Promise<{ checkedFiles: number; prunedCount: number; prunedFiles: string[] }> {
  const config = getGoogleDriveConfig();
  if (!config.folderId) return { checkedFiles: 0, prunedCount: 0, prunedFiles: [] };

  try {
    const accessToken = await getGoogleDriveAccessToken();
    const query = `'${config.folderId}'+in+parents+and+trashed=false`;
    const listUrl = `https://www.googleapis.com/drive/v3/files?q=${query}&fields=files(id,name,createdTime)&pageSize=100`;

    const listRes = await fetch(listUrl, {
      headers: { Authorization: `Bearer ${accessToken}` },
      cache: 'no-store',
    });

    if (!listRes.ok) {
      console.warn('Failed to list files for Google Drive retention pruning:', await listRes.text());
      return { checkedFiles: 0, prunedCount: 0, prunedFiles: [] };
    }

    const data = await listRes.json();
    const files = data.files || [];
    const cutoffTime = Date.now() - daysToKeep * 24 * 60 * 60 * 1000;

    const prunedFiles: string[] = [];

    for (const file of files) {
      if (file.name && file.name.startsWith('medattend_backup_')) {
        const fileCreated = new Date(file.createdTime).getTime();
        if (fileCreated < cutoffTime) {
          // Delete old backup
          const delRes = await fetch(`https://www.googleapis.com/drive/v3/files/${file.id}`, {
            method: 'DELETE',
            headers: { Authorization: `Bearer ${accessToken}` },
          });
          if (delRes.ok) {
            prunedFiles.push(file.name);
          }
        }
      }
    }

    return {
      checkedFiles: files.length,
      prunedCount: prunedFiles.length,
      prunedFiles,
    };
  } catch (err) {
    console.warn('Error during Google Drive backup pruning:', err);
    return { checkedFiles: 0, prunedCount: 0, prunedFiles: [] };
  }
}

/**
 * Lists the most recent backups in the target Google Drive folder
 */
export async function listRecentGoogleDriveBackups(limit = 5): Promise<
  Array<{ id: string; name: string; createdTime: string; size?: string }>
> {
  const config = getGoogleDriveConfig();
  if (!config.isConfigured || !config.folderId) return [];

  try {
    const accessToken = await getGoogleDriveAccessToken();
    const query = encodeURIComponent(`'${config.folderId}' in parents and trashed = false`);
    const listUrl = `https://www.googleapis.com/drive/v3/files?q=${query}&fields=files(id,name,createdTime,size)&orderBy=createdTime+desc&pageSize=${limit}`;

    const res = await fetch(listUrl, {
      headers: { Authorization: `Bearer ${accessToken}` },
      cache: 'no-store',
    });

    if (!res.ok) return [];
    const data = await res.json();
    return data.files || [];
  } catch {
    return [];
  }
}
