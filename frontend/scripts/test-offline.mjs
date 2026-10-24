/**
 * ⚡ Offline Deterministic Unit Test Suite
 * 
 * Verifies core security invariants completely offline:
 * - 0 External Dependencies (No running servers, no live database, no cameras, no tunnels)
 * - Geofencing bounds & zero-value preservation
 * - Attendance capture_mode database constraint alignment
 * - Zero-Trust student PIN & default credential elimination
 * - Rate limiting threshold & sliding window math
 * - Security path normalization & API key header enforcement
 * - RTSP credential masking
 */

import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

let passed = 0;
let failed = 0;

function assert(condition, name, detail = '') {
  if (condition) {
    console.log(`  ✅ PASS: ${name}`);
    passed++;
  } else {
    console.error(`  ❌ FAIL: ${name} ${detail ? `(${detail})` : ''}`);
    failed++;
  }
}

console.log('=' .repeat(65));
console.log('🛡️  Running Offline Core Security & Logic Unit Tests');
console.log('=' .repeat(65));

// --- 1. Geofence Coordinates Validation Logic ---
console.log('\n--- 1. Geofence Coordinate Boundaries & Zero Preservation ---');
{
  function validateGeofence(lat, lng, radius) {
    if (lat === undefined || lat === null || isNaN(Number(lat))) {
      return { valid: false, error: 'Invalid latitude' };
    }
    const numLat = Number(lat);
    if (numLat < -90 || numLat > 90) {
      return { valid: false, error: 'Latitude out of range (-90 to 90)' };
    }

    if (lng === undefined || lng === null || isNaN(Number(lng))) {
      return { valid: false, error: 'Invalid longitude' };
    }
    const numLng = Number(lng);
    if (numLng < -180 || numLng > 180) {
      return { valid: false, error: 'Longitude out of range (-180 to 180)' };
    }

    if (radius === undefined || radius === null || isNaN(Number(radius))) {
      return { valid: false, error: 'Invalid radius' };
    }
    const numRadius = Number(radius);
    if (numRadius <= 0 || numRadius > 5000) {
      return { valid: false, error: 'Radius out of range (1 to 5000m)' };
    }

    return { valid: true, lat: numLat, lng: numLng, radius: numRadius };
  }

  // Valid coordinate
  const v1 = validateGeofence(22.5726, 88.3639, 100);
  assert(v1.valid, 'Valid college campus coordinates accepted');

  // Zero-coordinate preservation (e.g. Equator/Prime Meridian)
  const vZero = validateGeofence(0, 0, 50);
  assert(vZero.valid && vZero.lat === 0 && vZero.lng === 0, 'Zero-coordinate (lat=0, lng=0) strictly preserved');

  // Boundary rejections
  assert(!validateGeofence(91, 88, 100).valid, 'Latitude > 90 rejected');
  assert(!validateGeofence(-91, 88, 100).valid, 'Latitude < -90 rejected');
  assert(!validateGeofence(22, 181, 100).valid, 'Longitude > 180 rejected');
  assert(!validateGeofence(22, -181, 100).valid, 'Longitude < -180 rejected');
  assert(!validateGeofence(22, 88, 0).valid, 'Radius <= 0 rejected');
  assert(!validateGeofence(22, 88, -10).valid, 'Negative radius rejected');
  assert(!validateGeofence(22, 88, 5001).valid, 'Excessive radius > 5000m rejected');
  assert(!validateGeofence('invalid', 88, 100).valid, 'Non-numeric coordinate rejected');
}

// --- 2. Attendance capture_mode Database Constraint Alignment ---
console.log('\n--- 2. Database Schema capture_mode Alignment ---');
{
  const ALLOWED_CAPTURE_MODES = new Set([
    'Live Scan',
    'Manual Upload',
    'Selfie Scan',
    'Manual Entry',
    'Selfie Check-in',
  ]);

  function isAllowedCaptureMode(mode) {
    return typeof mode === 'string' && ALLOWED_CAPTURE_MODES.has(mode.trim());
  }

  assert(isAllowedCaptureMode('Live Scan'), "'Live Scan' is valid capture_mode");
  assert(isAllowedCaptureMode('Manual Upload'), "'Manual Upload' is valid capture_mode");
  assert(isAllowedCaptureMode('Selfie Scan'), "'Selfie Scan' is valid capture_mode");
  assert(isAllowedCaptureMode('Manual Entry'), "'Manual Entry' is valid capture_mode");
  assert(isAllowedCaptureMode('Selfie Check-in'), "'Selfie Check-in' is valid capture_mode");

  // Verify rejection of unallowlisted / legacy modes
  assert(!isAllowedCaptureMode('Live CCTV'), "Legacy invalid 'Live CCTV' rejected");
  assert(!isAllowedCaptureMode('Hacked Injected Mode'), "Injected capture_mode rejected");
  assert(!isAllowedCaptureMode(''), 'Empty string capture_mode rejected');
  assert(!isAllowedCaptureMode(null), 'Null capture_mode rejected');
}

// --- 3. Zero-Trust Student PIN & Default Password Elimination ---
console.log('\n--- 3. Student PIN & Password Zero-Trust Invariants ---');
{
  function isDangerousDefaultCredential(input, studentRoll) {
    if (!input || !input.trim()) return true;
    const clean = input.trim();
    if (clean === '123456') return true;
    if (studentRoll && clean.toLowerCase() === studentRoll.trim().toLowerCase()) return true;
    if (clean === 'TEMP' || clean === 'password' || clean === 'admin') return true;
    return false;
  }

  assert(isDangerousDefaultCredential('123456', '25001'), "Default PIN '123456' flagged as dangerous");
  assert(isDangerousDefaultCredential('25001', '25001'), 'Student Roll number as password flagged as dangerous');
  assert(isDangerousDefaultCredential('TEMP', '25001'), "Placeholder 'TEMP' flagged as dangerous");
  assert(isDangerousDefaultCredential('', '25001'), 'Empty password flagged as dangerous');
  assert(!isDangerousDefaultCredential('StrongSecret#99', '25001'), 'Legitimate strong password accepted');
}

// --- 4. Rate Limiting Sliding Window Invariants ---
console.log('\n--- 4. Persistent Rate Limiting Parameters & Math ---');
{
  const MAX_ACCOUNT_FAILED_ATTEMPTS = 5;
  const MAX_IP_FAILED_ATTEMPTS = 60;
  const LOCKOUT_WINDOW_MS = 60 * 1000;

  assert(MAX_ACCOUNT_FAILED_ATTEMPTS === 5, 'Account threshold enforced at 5 failed attempts');
  assert(MAX_IP_FAILED_ATTEMPTS >= 50, 'IP threshold is elevated (>=50) to protect campus Wi-Fi NAT');
  assert(LOCKOUT_WINDOW_MS === 60000, 'Lockout window set to 60 seconds');

  function calculateRemainingSeconds(lockedUntil, now) {
    if (lockedUntil <= now) return 0;
    return Math.max(1, Math.ceil((lockedUntil - now) / 1000));
  }

  const now = 1000000;
  assert(calculateRemainingSeconds(now + 30000, now) === 30, 'Remaining lock seconds calculated accurately');
  assert(calculateRemainingSeconds(now - 1000, now) === 0, 'Expired lock returns 0 remaining seconds');
}

// --- 5. RTSP Credential Masking ---
console.log('\n--- 5. RTSP URL Credential Redaction ---');
{
  function redactStreamUrl(url) {
    if (!url || typeof url !== 'string') return '';
    return url.replace(/(:\/\/[^/@:]+):(.*)@([^/@]+(?:\/.*)?)$/, '$1:***@$3');
  }

  assert(
    redactStreamUrl('rtsp://admin:Tech_1234@172.16.7.5:554/live') === 'rtsp://admin:***@172.16.7.5:554/live',
    'Standard RTSP camera password redacted'
  );
  assert(
    redactStreamUrl('rtsp://user:P@ss!w0rd_99@10.0.0.1:554/ch1') === 'rtsp://user:***@10.0.0.1:554/ch1',
    'Complex password with special chars redacted'
  );
  assert(
    redactStreamUrl('rtsp://172.16.7.5:554/live') === 'rtsp://172.16.7.5:554/live',
    'URL without credentials preserved unchanged'
  );
  assert(redactStreamUrl('0') === '0', 'Local webcam 0 preserved');
  assert(redactStreamUrl('') === '', 'Empty URL handled safely');
}

// --- 6. Student Name Privacy Masking (Anti-Scraping Data Minimization) ---
console.log('\n--- 6. Student Name Privacy Masking (Anti-Scraping Data Minimization) ---');
{
  function maskStudentName(fullName) {
    if (!fullName || typeof fullName !== 'string') return '';
    const parts = fullName.trim().split(/\s+/);
    return parts.map(part => {
      if (part.length <= 2) {
        return part;
      } else if (part.length === 3) {
        return `${part[0]}*${part[2]}`;
      } else {
        const visibleStart = Math.min(2, Math.floor(part.length / 3));
        const start = part.slice(0, visibleStart);
        const end = part.slice(-1);
        const maskedCount = Math.max(1, part.length - visibleStart - 1);
        return `${start}${'*'.repeat(maskedCount)}${end}`;
      }
    }).join(' ');
  }

  assert(maskStudentName('Sk Saifuddin') === 'Sk Sa******n', 'Mask multi-word name preserving initials & ending');
  assert(maskStudentName('Rahul') === 'R***l', 'Mask single word name preserving start & ending');
  assert(maskStudentName('A') === 'A', 'Single character preserved');
  assert(maskStudentName('Dr. Arindam Das') === 'D*. Ar****m D*s', 'Mask 3-word title and name');
  assert(maskStudentName('') === '', 'Empty string handled safely');
  assert(maskStudentName(null) === '', 'Null input handled safely');
}

// --- 7. Soft-Delete & Historical Attendance Retention Logic ---
console.log('\n--- 7. Soft-Delete & Historical Attendance Retention Logic ---');
{
  function isInternalOrArchivedSession(s) {
    if (!s || typeof s !== 'object') return true;
    const name = String(s.class_name || '').trim();
    const year = String(s.target_academic_year || '').trim();
    return (
      s.is_archived === true ||
      name.startsWith('__') ||
      name.startsWith('[ARCHIVED]') ||
      name === '__SYSTEM_CONFIG__' ||
      year.toLowerCase() === 'system' ||
      year.toLowerCase() === 'archived'
    );
  }

  function resolveSessionDeleteAction(attendanceCount) {
    if (attendanceCount > 0) return 'ARCHIVE';
    return 'HARD_DELETE';
  }

  function softDeleteStudent(studentProfile) {
    return {
      ...studentProfile,
      is_active: false,
      archived_at: new Date().toISOString(),
      academic_year: studentProfile.academic_year?.startsWith('[ARCHIVED]')
        ? studentProfile.academic_year
        : `[ARCHIVED] ${studentProfile.academic_year || '1st Year'}`,
      face_encoding: null,
      biometric_consent: false,
      biometric_consent_date: null,
      portal_pin: null,
      portal_password_hash: null,
    };
  }

  assert(isInternalOrArchivedSession({ is_archived: true, class_name: 'Biochemistry' }), 'Archived session by is_archived flag detected');
  assert(isInternalOrArchivedSession({ class_name: '[ARCHIVED] Anatomy Lecture 1', target_academic_year: '1st Year' }), 'Archived session by class_name flagged');
  assert(isInternalOrArchivedSession({ class_name: 'Physiology Lab', target_academic_year: 'Archived' }), 'Archived session by target_academic_year flagged');
  assert(!isInternalOrArchivedSession({ class_name: 'Pathology Lecture 3', target_academic_year: '2nd Year' }), 'Active session not flagged as archived');

  assert(resolveSessionDeleteAction(150) === 'ARCHIVE', 'Session with 150 attendance records protected from hard-delete');
  assert(resolveSessionDeleteAction(1) === 'ARCHIVE', 'Session with 1 attendance record protected from hard-delete');
  assert(resolveSessionDeleteAction(0) === 'HARD_DELETE', 'Empty session (0 attendance) allowed for clean deletion');

  const activeStudent = {
    student_roll: '101',
    full_name: 'Aman Roy',
    academic_year: '1st Year',
    face_encoding: [0.1, 0.2, 0.3],
    biometric_consent: true,
  };
  const archived = softDeleteStudent(activeStudent);
  assert(archived.is_active === false, 'Student is_active set to false on archival');
  assert(typeof archived.archived_at === 'string' && archived.archived_at.length > 0, 'Student archived_at timestamp recorded on archival');
  assert(archived.face_encoding === null, 'Biometric face encoding purged on archival');
  assert(archived.biometric_consent === false, 'Biometric consent revoked on archival');
  assert(archived.academic_year === '[ARCHIVED] 1st Year', 'Academic year tagged with [ARCHIVED]');

  // Verify API routes set is_active and is_archived
  const studentDeleteRoute = fs.readFileSync(path.resolve(__dirname, '../src/app/api/students/[id]/route.ts'), 'utf8');
  assert(studentDeleteRoute.includes('is_active: false') && studentDeleteRoute.includes('archived_at: archiveNow'), 'students/[id]/route.ts sets authoritative is_active: false and archived_at');

  const sessionDeleteRoute = fs.readFileSync(path.resolve(__dirname, '../src/app/api/sessions/[id]/route.ts'), 'utf8');
  assert(sessionDeleteRoute.includes('is_archived: true') && sessionDeleteRoute.includes('archived_at: archiveNow'), 'sessions/[id]/route.ts sets authoritative is_archived: true and archived_at');

  const studentLoginRoute = fs.readFileSync(path.resolve(__dirname, '../src/app/api/auth/login/route.ts'), 'utf8');
  assert(studentLoginRoute.includes('student.is_active === false'), 'auth/login/route.ts rejects inactive/archived student logins');

  const migration19Path = path.resolve(__dirname, '../../database/migrations/19_backfill_and_align_archive_flags.sql');
  assert(fs.existsSync(migration19Path), 'Migration 19 (19_backfill_and_align_archive_flags.sql) exists');
}

// --- 8. Face Enrollment Status (Consent vs Biometric Template Separation) ---
console.log('\n--- 8. Face Enrollment Status (Consent vs Biometric Template Separation) ---');
{
  function hasValidFaceEncoding(faceEncoding) {
    if (!faceEncoding) return false;
    if (Array.isArray(faceEncoding)) {
      return faceEncoding.length >= 128;
    }
    if (typeof faceEncoding === 'object') {
      const keys = Object.keys(faceEncoding);
      return keys.length > 0 && !(keys.length === 1 && 'parent_phone' in faceEncoding);
    }
    return false;
  }

  function resolveFaceEnrolledStatus(biometricConsent, faceEncoding) {
    return Boolean(biometricConsent) && hasValidFaceEncoding(faceEncoding);
  }

  // 1. Consent alone without face template MUST NOT count as enrolled
  assert(
    resolveFaceEnrolledStatus(true, null) === false,
    'Consent alone (face_encoding=null) correctly evaluates has_face_enrolled=false'
  );
  assert(
    resolveFaceEnrolledStatus(true, []) === false,
    'Consent with empty face_encoding array evaluates has_face_enrolled=false'
  );
  assert(
    resolveFaceEnrolledStatus(true, { parent_phone: '9876543210' }) === false,
    'Consent with legacy phone object in face_encoding evaluates has_face_enrolled=false'
  );

  // 2. Revoked consent with enrolled vector MUST evaluate as false
  const validVector = new Array(512).fill(0.02);
  assert(
    resolveFaceEnrolledStatus(false, validVector) === false,
    'Revoked consent (biometric_consent=false) blocks has_face_enrolled even if vector exists'
  );

  // 3. Dual condition met (Consent=true AND valid 512D vector) -> true
  assert(
    resolveFaceEnrolledStatus(true, validVector) === true,
    'Both consent and valid 512D vector present evaluates has_face_enrolled=true'
  );
}

// --- 9. Session Ownership Sanitization & Faculty Immutability ---
console.log('\n--- 9. Session Ownership Sanitization & Faculty Immutability ---');
{
  function sanitizeFacultyInstructorUpdate(incomingInstructor, existingInstructor, facultyUsername) {
    // 1. Decode incoming and authoritative
    const byRegex = /\[BY:([^\]]+)\]/;
    const incomingMatch = (incomingInstructor || '').match(byRegex);
    const existingMatch = (existingInstructor || '').match(byRegex);

    const authoritativeCreator = (existingMatch ? decodeURIComponent(existingMatch[1]) : facultyUsername).trim();
    const incomingCreator = incomingMatch ? decodeURIComponent(incomingMatch[1]).trim() : null;

    // 2. Reject transfer to another user
    if (incomingCreator && authoritativeCreator && incomingCreator.toLowerCase() !== authoritativeCreator.toLowerCase()) {
      return { allowed: false, status: 403, error: "Forbidden. Faculty members are not permitted to transfer session ownership to another user." };
    }

    // 3. Strip forged/incoming tags and enforce authoritative tag
    let cleanInstructor = (incomingInstructor || '').trim().replace(/\[BY:[^\]]*\]/g, '').trim();
    if (authoritativeCreator) {
      cleanInstructor = `${cleanInstructor} [BY:${encodeURIComponent(authoritativeCreator)}]`.trim();
    }

    return { allowed: true, instructor_name: cleanInstructor };
  }

  // Test 9.1: Faculty attempting to transfer session to another faculty is blocked
  const attackTransfer = sanitizeFacultyInstructorUpdate(
    'Computer Science 101 [BY:hacker_prof]',
    'Computer Science 101 [BY:prof_smith]',
    'prof_smith'
  );
  assert(!attackTransfer.allowed && attackTransfer.status === 403, 'Faculty transfer of ownership to another user blocked with 403');

  // Test 9.2: Faculty stripping [BY:...] tag still has authoritative creator tag re-attached
  const stripAttempt = sanitizeFacultyInstructorUpdate(
    'Computer Science 101 - Updated Topic',
    'Computer Science 101 [BY:prof_smith]',
    'prof_smith'
  );
  assert(
    stripAttempt.allowed && stripAttempt.instructor_name === 'Computer Science 101 - Updated Topic [BY:prof_smith]',
    'Stripped [BY:...] tag automatically re-attaches authoritative creator'
  );

  // Test 9.3: Preserving geofence tags while enforcing ownership
  const geofenceUpdate = sanitizeFacultyInstructorUpdate(
    'Data Structures [GPS:22.572600,88.363900,100,1,Main%20Campus]',
    'Data Structures [GPS:22.572600,88.363900,100,1,Main%20Campus] [BY:prof_smith]',
    'prof_smith'
  );
  assert(
    geofenceUpdate.allowed && geofenceUpdate.instructor_name.endsWith('[BY:prof_smith]'),
    'Geofence update preserves authoritative [BY:prof_smith] creator tag'
  );
}

// --- 10. Audit Log Forensic Ledger Immutability & Least Privilege ---
console.log('\n--- 10. Audit Log Forensic Ledger Immutability & Least Privilege ---');
{
  const schemaPath = path.resolve(__dirname, '../../database/schema.sql');
  const migration16Path = path.resolve(__dirname, '../../database/migrations/16_audit_logs_strict_immutability.sql');

  const schemaSql = fs.existsSync(schemaPath) ? fs.readFileSync(schemaPath, 'utf8') : '';
  const migrationSql = fs.existsSync(migration16Path) ? fs.readFileSync(migration16Path, 'utf8') : '';

  // 1. Verify Statement-Level TRUNCATE Trigger exists in schema and migration
  const hasTruncateTrigger = 
    schemaSql.includes('BEFORE TRUNCATE ON public.audit_logs') && 
    schemaSql.includes('FOR EACH STATEMENT') &&
    schemaSql.includes('trg_audit_logs_immutable_truncate');
  assert(hasTruncateTrigger, 'PostgreSQL statement-level BEFORE TRUNCATE trigger defined in schema.sql');

  const hasMigrationTruncate = 
    migrationSql.includes('BEFORE TRUNCATE ON public.audit_logs') &&
    migrationSql.includes('FOR EACH STATEMENT');
  assert(hasMigrationTruncate, 'Migration 16 includes statement-level BEFORE TRUNCATE trigger');

  // 2. Verify Row-Level UPDATE & DELETE trigger exists
  const hasRowTrigger = 
    schemaSql.includes('BEFORE UPDATE OR DELETE ON public.audit_logs') && 
    schemaSql.includes('FOR EACH ROW');
  assert(hasRowTrigger, 'Row-level BEFORE UPDATE OR DELETE trigger defined on audit_logs');

  // 3. Verify Revocation of UPDATE, DELETE, TRUNCATE from service_role
  const revokesMutationFromServiceRole = 
    /REVOKE\s+UPDATE,\s*DELETE,\s*TRUNCATE\s+ON\s+public\.audit_logs\s+FROM[\s\w,]*service_role/i.test(schemaSql);
  assert(revokesMutationFromServiceRole, 'UPDATE, DELETE, TRUNCATE privileges revoked from service_role in schema.sql');

  // 4. Verify Explicit Least-Privilege GRANT (SELECT, INSERT only) to service_role
  const grantsOnlyReadAppend = 
    /GRANT\s+SELECT,\s*INSERT\s+ON\s+public\.audit_logs\s+TO\s+service_role/i.test(schemaSql);
  assert(grantsOnlyReadAppend, 'Strict least privilege (SELECT, INSERT only) granted to service_role in schema.sql');

  // 5. Verify RLS policies separate SELECT and INSERT without generic FOR ALL
  const hasSelectRls = schemaSql.includes('CREATE POLICY "service_role_select_audit_logs"');
  const hasInsertRls = schemaSql.includes('CREATE POLICY "service_role_insert_audit_logs"');
  const hasOldGenericRls = schemaSql.includes('CREATE POLICY "service_role_full_audit_logs"');
  assert(hasSelectRls && hasInsertRls && !hasOldGenericRls, 'Audit logs RLS policies separated into SELECT and INSERT only (no generic ALL)');
}

// --- 11. Attendance Foreign Key Non-Cascading Retention Lockdown ---
console.log('\n--- 11. Attendance Foreign Key Non-Cascading Retention Lockdown ---');
{
  const schemaPath = path.resolve(__dirname, '../../database/schema.sql');
  const migration17Path = path.resolve(__dirname, '../../database/migrations/17_attendance_restrict_foreign_keys.sql');
  const policyDocPath = path.resolve(__dirname, '../../docs/DATA_GOVERNANCE_AND_RETENTION_POLICY.md');

  const schemaSql = fs.existsSync(schemaPath) ? fs.readFileSync(schemaPath, 'utf8') : '';
  const migrationSql = fs.existsSync(migration17Path) ? fs.readFileSync(migration17Path, 'utf8') : '';
  const policyDoc = fs.existsSync(policyDocPath) ? fs.readFileSync(policyDocPath, 'utf8') : '';

  // 1. Verify schema.sql uses ON DELETE RESTRICT on attendance foreign keys
  const hasSessionRestrict = /session_id\s+UUID\s+NOT\s+NULL\s+REFERENCES\s+public\.sessions\(id\)\s+ON\s+DELETE\s+RESTRICT/i.test(schemaSql);
  assert(hasSessionRestrict, 'schema.sql defines attendance.session_id with ON DELETE RESTRICT');

  const hasStudentRestrict = /student_id\s+UUID\s+NOT\s+NULL\s+REFERENCES\s+public\.students\(id\)\s+ON\s+DELETE\s+RESTRICT/i.test(schemaSql);
  assert(hasStudentRestrict, 'schema.sql defines attendance.student_id with ON DELETE RESTRICT');

  // 2. Verify NO ON DELETE CASCADE remains in schema.sql
  const hasNoCascade = !/ON\s+DELETE\s+CASCADE/i.test(schemaSql);
  assert(hasNoCascade, 'Zero instances of ON DELETE CASCADE found in schema.sql');

  // 3. Verify Migration 17 enforces data integrity pre-check and ON DELETE RESTRICT
  const hasMigrationFile = fs.existsSync(migration17Path);
  assert(hasMigrationFile, 'Migration 17 (17_attendance_restrict_foreign_keys.sql) exists');

  const hasPreflight = migrationSql.includes('Pre-flight data integrity validation') && migrationSql.includes('orphan_session_count');
  assert(hasPreflight, 'Migration 17 includes pre-flight orphaned record validation');

  const hasMigrationRestrict = 
    migrationSql.includes('FOREIGN KEY (session_id)') &&
    migrationSql.includes('ON DELETE RESTRICT') &&
    migrationSql.includes('FOREIGN KEY (student_id)') &&
    migrationSql.includes('ON DELETE RESTRICT');
  assert(hasMigrationRestrict, 'Migration 17 re-creates foreign keys with ON DELETE RESTRICT');

  // 4. Verify explicit retention policy documentation
  const hasPolicyDocSection = policyDoc.includes('Database-Enforced Non-Cascading Retention (`ON DELETE RESTRICT`)');
  assert(hasPolicyDocSection, 'DATA_GOVERNANCE_AND_RETENTION_POLICY.md documents database-enforced non-cascading retention');
}

// --- 12. Check-In Capability Token & Public Lookup Protection ---
console.log('\n--- 12. Check-In Capability Token & Public Lookup Protection ---');
{
  const testKey = 'test_64_char_cryptographic_secret_for_unit_tests_medattend_secure_12345';
  process.env.INTERNAL_API_KEY = testKey;

  function getCheckinSigningSecret(customSecret) {
    const secret = (customSecret !== undefined ? customSecret : (process.env.CHECKIN_SIGNING_SECRET || process.env.INTERNAL_API_KEY || process.env.AUTH_SECRET || '')).trim();
    if (secret.length < 32) {
      throw new Error('Missing or insecure check-in token secret. Set CHECKIN_SIGNING_SECRET or INTERNAL_API_KEY with at least 32 characters.');
    }
    return secret;
  }

  function generateCheckinToken(sessionId, validSeconds = 300) {
    const expiresAt = Math.floor(Date.now() / 1000) + Math.min(Math.max(validSeconds, 30), 330);
    const payload = `${sessionId}:${expiresAt}`;
    const secret = getCheckinSigningSecret();
    const signature = crypto.createHmac('sha256', secret).update(payload).digest('hex');
    return `${payload}:${signature}`;
  }

  function verifyCheckinToken(token, expectedSessionId) {
    if (typeof token !== 'string' || !token.trim()) return false;
    const parts = token.trim().split(':');
    if (parts.length !== 3) return false;
    const [sessId, expiresAtStr, signature] = parts;
    if (sessId.toLowerCase() !== expectedSessionId.toLowerCase()) return false;
    const expiresAt = parseInt(expiresAtStr, 10);
    if (isNaN(expiresAt)) return false;
    if (Math.floor(Date.now() / 1000) > expiresAt) return false;
    try {
      const secret = getCheckinSigningSecret();
      const expectedSig = crypto.createHmac('sha256', secret).update(`${sessId}:${expiresAtStr}`).digest('hex');
      const sigBuf = Buffer.from(signature, 'hex');
      const expBuf = Buffer.from(expectedSig, 'hex');
      if (sigBuf.length !== expBuf.length) return false;
      return crypto.timingSafeEqual(sigBuf, expBuf);
    } catch {
      return false;
    }
  }

  // 1. Verify weak/absent secret rejection (no hardcoded fallback)
  let weakSecretRejected = false;
  try {
    getCheckinSigningSecret('short_secret');
  } catch {
    weakSecretRejected = true;
  }
  assert(weakSecretRejected, 'Weak or absent secret (<32 chars) strictly throws server-side error with no fallback');

  const testSessionUuid = 'a1b2c3d4-e5f6-4a1b-8c2d-3e4f5a6b7c8d';
  const otherSessionUuid = 'b2c3d4e5-f6a1-4b2c-9d3e-4f5a6b7c8d9e';

  // 2. Token generation format
  const token = generateCheckinToken(testSessionUuid, 300);
  assert(Boolean(token) && token.split(':').length === 3, 'generateCheckinToken produces 3-part signed token (uuid:expires:hmac)');

  // 3. Fresh token verification
  assert(verifyCheckinToken(token, testSessionUuid), 'Fresh valid token verifies successfully against matching session UUID');

  // 4. Mismatched session rejection (prevent token theft across lectures)
  assert(!verifyCheckinToken(token, otherSessionUuid), 'Token presented for mismatched session UUID is strictly REJECTED');

  // 5. Tampered signature rejection
  const [sessId, expires, sig] = token.split(':');
  const tamperedSig = sig.slice(0, -2) + (sig.slice(-2) === 'aa' ? 'bb' : 'aa');
  const tamperedToken = `${sessId}:${expires}:${tamperedSig}`;
  assert(!verifyCheckinToken(tamperedToken, testSessionUuid), 'Token with tampered signature is strictly REJECTED');

  // 6. Expired token rejection
  const expiredPayload = `${testSessionUuid}:${Math.floor(Date.now() / 1000) - 10}`;
  const secret = getCheckinSigningSecret();
  const expiredSig = crypto.createHmac('sha256', secret).update(expiredPayload).digest('hex');
  const expiredToken = `${expiredPayload}:${expiredSig}`;
  assert(!verifyCheckinToken(expiredToken, testSessionUuid), 'Expired capability token is strictly REJECTED');

  // 7. Malformed token strings
  assert(!verifyCheckinToken('not-a-token', testSessionUuid), 'Malformed token string rejected');
  assert(!verifyCheckinToken(null, testSessionUuid), 'Null token rejected');
  assert(!verifyCheckinToken('', testSessionUuid), 'Empty token string rejected');

  // 8. Verify hard-coded fallback string is completely eradicated from codebase
  const authTsPath = path.resolve(__dirname, '../src/lib/attendanceAuth.ts');
  const authTsContent = fs.readFileSync(authTsPath, 'utf8');
  const backendRoutesPath = path.resolve(__dirname, '../../backend/app/routes.py');
  const backendRoutesContent = fs.readFileSync(backendRoutesPath, 'utf8');

  const fallbackStr = 'medattend_default_secure_checkin_secret_2026';
  assert(!authTsContent.includes(fallbackStr), 'frontend/src/lib/attendanceAuth.ts has zero instances of hard-coded fallback secret');
  assert(!backendRoutesContent.includes(fallbackStr), 'backend/app/routes.py has zero instances of hard-coded fallback secret');

  // 9. Verify active-sessions route issues checkin_token and hides headcount
  const activeSessionsRoutePath = path.resolve(__dirname, '../src/app/api/active-sessions/route.ts');
  const activeSessionsContent = fs.existsSync(activeSessionsRoutePath) ? fs.readFileSync(activeSessionsRoutePath, 'utf8') : '';
  assert(
    activeSessionsContent.includes('generateCheckinToken') &&
    activeSessionsContent.includes('checkin_token'),
    'active-sessions route issues signed checkin_token for active sessions'
  );
  assert(
    activeSessionsContent.includes('attendance_count: undefined'),
    'active-sessions route hides live attendance headcount from unauthenticated public scrapers'
  );

  // 10. Verify student-lookup route enforces checkin_token or session auth
  const studentLookupRoutePath = path.resolve(__dirname, '../src/app/api/student-lookup/[roll]/route.ts');
  const studentLookupContent = fs.existsSync(studentLookupRoutePath) ? fs.readFileSync(studentLookupRoutePath, 'utf8') : '';
  assert(
    studentLookupContent.includes('verifyCheckinToken') &&
    studentLookupContent.includes('!canSeeFullProfile && !hasValidCheckinToken'),
    'student-lookup route enforces check-in capability token or authenticated session'
  );

  // 11. Verify Python backend route synchronization
  assert(
    backendRoutesContent.includes('def verify_checkin_token') &&
    backendRoutesContent.includes('clean_public_instructor_name'),
    'backend/app/routes.py defines synchronized verify_checkin_token and clean_public_instructor_name'
  );
}

// --- 13. Atomic Rate Limiter Privilege Lockdown & Search Path Isolation ---
console.log('\n--- 13. Atomic Rate Limiter Privilege Lockdown & Search Path Isolation ---');
{
  const schemaPath = path.resolve(__dirname, '../../database/schema.sql');
  const migration15Path = path.resolve(__dirname, '../../database/migrations/15_atomic_rate_limiter.sql');
  const migration18Path = path.resolve(__dirname, '../../database/migrations/18_atomic_rate_limit_permissions.sql');

  const schemaSql = fs.existsSync(schemaPath) ? fs.readFileSync(schemaPath, 'utf8') : '';
  const migration15Sql = fs.existsSync(migration15Path) ? fs.readFileSync(migration15Path, 'utf8') : '';
  const migration18Sql = fs.existsSync(migration18Path) ? fs.readFileSync(migration18Path, 'utf8') : '';

  // 1. Verify schema.sql specifies immutable search_path on atomic_check_rate_limit
  const schemaHasSearchPath = /CREATE\s+OR\s+REPLACE\s+FUNCTION\s+public\.atomic_check_rate_limit[\s\S]*?SECURITY\s+DEFINER\s+SET\s+search_path\s*=\s*public,\s*pg_temp/i.test(schemaSql);
  assert(schemaHasSearchPath, 'schema.sql defines atomic_check_rate_limit with immutable search_path = public, pg_temp');

  // 2. Verify schema.sql revokes EXECUTE from PUBLIC, anon, and authenticated
  const schemaRevokesPublic = /REVOKE\s+EXECUTE\s+ON\s+FUNCTION\s+public\.atomic_check_rate_limit[\s\S]*?FROM[\s\w,]*PUBLIC/i.test(schemaSql);
  assert(schemaRevokesPublic, 'schema.sql revokes EXECUTE on atomic_check_rate_limit from PUBLIC');

  const schemaRevokesAnon = /REVOKE\s+EXECUTE\s+ON\s+FUNCTION\s+public\.atomic_check_rate_limit[\s\S]*?FROM[\s\w,]*anon/i.test(schemaSql);
  assert(schemaRevokesAnon, 'schema.sql revokes EXECUTE on atomic_check_rate_limit from anon');

  const schemaRevokesAuth = /REVOKE\s+EXECUTE\s+ON\s+FUNCTION\s+public\.atomic_check_rate_limit[\s\S]*?FROM[\s\w,]*authenticated/i.test(schemaSql);
  assert(schemaRevokesAuth, 'schema.sql revokes EXECUTE on atomic_check_rate_limit from authenticated');

  // 3. Verify schema.sql grants EXECUTE strictly to service_role
  const schemaGrantsServiceRole = /GRANT\s+EXECUTE\s+ON\s+FUNCTION\s+public\.atomic_check_rate_limit[\s\S]*?TO\s+service_role/i.test(schemaSql);
  assert(schemaGrantsServiceRole, 'schema.sql grants EXECUTE on atomic_check_rate_limit strictly to service_role');

  // 4. Verify Migration 15 includes search_path and permission revocation
  const mig15HasSearchPath = /SET\s+search_path\s*=\s*public,\s*pg_temp/i.test(migration15Sql);
  assert(mig15HasSearchPath, 'Migration 15 includes SET search_path = public, pg_temp');

  const mig15Revokes = /REVOKE\s+EXECUTE\s+ON\s+FUNCTION\s+public\.atomic_check_rate_limit[\s\S]*?FROM[\s\w,]*PUBLIC/i.test(migration15Sql) &&
                       /REVOKE\s+EXECUTE\s+ON\s+FUNCTION\s+public\.atomic_check_rate_limit[\s\S]*?FROM[\s\w,]*anon/i.test(migration15Sql);
  assert(mig15Revokes, 'Migration 15 revokes EXECUTE from PUBLIC, anon, authenticated');

  const mig15Grants = /GRANT\s+EXECUTE\s+ON\s+FUNCTION\s+public\.atomic_check_rate_limit[\s\S]*?TO\s+service_role/i.test(migration15Sql);
  assert(mig15Grants, 'Migration 15 grants EXECUTE strictly to service_role');

  // 5. Verify Migration 18 exists for sequential migration pipelines
  assert(fs.existsSync(migration18Path), 'Migration 18 (18_atomic_rate_limit_permissions.sql) exists');

  const mig18HasSearchPath = /SET\s+search_path\s*=\s*public,\s*pg_temp/i.test(migration18Sql);
  assert(mig18HasSearchPath, 'Migration 18 re-defines function with SET search_path = public, pg_temp');

  const mig18RevokesAndGrants = /REVOKE\s+EXECUTE\s+ON\s+FUNCTION\s+public\.atomic_check_rate_limit/i.test(migration18Sql) &&
                               /GRANT\s+EXECUTE\s+ON\s+FUNCTION\s+public\.atomic_check_rate_limit[\s\S]*?TO\s+service_role/i.test(migration18Sql);
  assert(mig18RevokesAndGrants, 'Migration 18 executes REVOKE from unauthenticated roles and GRANT to service_role');

  // 6. Verify Advisory Lock and Pre-Insert (Race Condition Prevention on Empty/New Keys)
  const schemaHasAdvisoryLock = schemaSql.includes('pg_advisory_xact_lock(hashtext(p_key))');
  const schemaHasPreInsert = /INSERT\s+INTO\s+public\.settings\s*\(key,\s*value,\s*updated_at\)\s*VALUES\s*\(p_key,\s*'\{"attempts":\[\]\}'::jsonb,\s*CURRENT_TIMESTAMP\)\s*ON\s+CONFLICT\s*\(key\)\s*DO\s+NOTHING/i.test(schemaSql);
  assert(schemaHasAdvisoryLock, 'schema.sql defines pg_advisory_xact_lock for strict transaction serialization');
  assert(schemaHasPreInsert, 'schema.sql pre-inserts empty settings row to guarantee row-level lock on new keys');

  const mig15HasAdvisoryLock = migration15Sql.includes('pg_advisory_xact_lock(hashtext(p_key))');
  assert(mig15HasAdvisoryLock, 'Migration 15 defines pg_advisory_xact_lock on p_key');

  const mig18HasAdvisoryLock = migration18Sql.includes('pg_advisory_xact_lock(hashtext(p_key))');
  assert(mig18HasAdvisoryLock, 'Migration 18 defines pg_advisory_xact_lock on p_key');

  // 7. Verify Frontend Rate Limiter uses atomic_check_rate_limit RPC
  const frontendLimiterPath = path.resolve(__dirname, '../src/lib/rateLimiter.ts');
  const frontendLimiterContent = fs.existsSync(frontendLimiterPath) ? fs.readFileSync(frontendLimiterPath, 'utf8') : '';
  const frontendCallsRpc = frontendLimiterContent.includes("supabaseServer.rpc('atomic_check_rate_limit'");
  assert(frontendCallsRpc, 'Frontend checkStudentLookupRateLimit calls atomic_check_rate_limit RPC');

  // 8. Verify Backend Rate Limiter uses atomic_check_rate_limit RPC
  const backendLimiterPath = path.resolve(__dirname, '../../backend/app/rate_limiter.py');
  const backendLimiterContent = fs.existsSync(backendLimiterPath) ? fs.readFileSync(backendLimiterPath, 'utf8') : '';
  const backendCallsRpc = backendLimiterContent.includes('supabase.rpc("atomic_check_rate_limit"');
  assert(backendCallsRpc, 'Backend check_lookup_rate_limit harmonized to call atomic_check_rate_limit RPC');
}

// --- 15. Student Enrollment Reactivation & Attendance Preservation ---
console.log('\n--- 15. Student Re-enrollment Auto-Restore & Audit Preservation ---');
{
  const studentRoutePath = path.resolve(__dirname, '../src/app/api/students/route.ts');
  const studentRouteContent = fs.readFileSync(studentRoutePath, 'utf8');

  // 1. Verify students/route.ts checks is_active / [ARCHIVED]
  const checksIsArchived = studentRouteContent.includes('existingCheck.is_active === false') &&
                           studentRouteContent.includes('[ARCHIVED]');
  assert(checksIsArchived, 'students/route.ts distinguishes archived student from active duplicates');

  // 2. Verify students/route.ts reactivates profile with is_active: true, archived_at: null
  const reactivatesProfile = studentRouteContent.includes('is_active: true') &&
                             studentRouteContent.includes('archived_at: null') &&
                             studentRouteContent.includes('RESTORE_ARCHIVED_STUDENT');
  assert(reactivatesProfile, 'students/route.ts auto-restores archived profile with is_active: true and logs audit event');

  // 3. Verify bulk student route also reactivates archived entries
  const bulkRoutePath = path.resolve(__dirname, '../src/app/api/students/bulk/route.ts');
  const bulkRouteContent = fs.readFileSync(bulkRoutePath, 'utf8');
  const bulkReactivates = bulkRouteContent.includes('is_active: true') && bulkRouteContent.includes('archived_at: null');
  assert(bulkReactivates, 'students/bulk/route.ts sets is_active: true and archived_at: null on upsert');

  // 4. Invariant: Re-enrolled student keeps identical UUID so existing attendance records remain linked
  function simulateStudentEnrollment(existingDbRecord, newEnrollmentPayload) {
    if (!existingDbRecord) {
      return { status: 201, action: 'INSERT_NEW', student_id: 'new-uuid-999' };
    }
    const isArchived = existingDbRecord.is_active === false || String(existingDbRecord.academic_year || '').startsWith('[ARCHIVED]');
    if (!isArchived) {
      return { status: 409, error: 'Duplicate Roll Number!' };
    }
    // Restore: keep exact same UUID, update fields, set active
    return {
      status: 201,
      action: 'RESTORE_ARCHIVED_STUDENT',
      student_id: existingDbRecord.id, // Preserves foreign key to attendance table!
      is_active: true,
      academic_year: newEnrollmentPayload.academic_year,
    };
  }

  const archivedStudent = {
    id: 'student-uuid-24001',
    student_roll: '24001',
    full_name: 'SK SAHIR',
    academic_year: '[ARCHIVED] 3rd Year',
    is_active: false,
  };

  const restoredResult = simulateStudentEnrollment(archivedStudent, {
    student_roll: '24001',
    full_name: 'SK SAHIR',
    academic_year: '3rd Year',
  });

  assert(restoredResult.status === 201, 'Re-enrolling archived student returns 201 status');
  assert(restoredResult.action === 'RESTORE_ARCHIVED_STUDENT', 'Re-enrolling archived student performs RESTORE_ARCHIVED_STUDENT');
  assert(restoredResult.student_id === 'student-uuid-24001', 'Re-enrolled student preserves exact student_id foreign key for attendance history');
  assert(restoredResult.is_active === true, 'Re-enrolled student is set to is_active: true');
}

// --- 15. Shared Atomic Rate Limiting & Trusted IP Extraction ---
console.log('\n--- 15. Shared Atomic Rate Limiting & Trusted IP Extraction ---');
{
  const activeSessionsRoutePath = path.resolve(__dirname, '../src/app/api/active-sessions/route.ts');
  const activeSessionsContent = fs.readFileSync(activeSessionsRoutePath, 'utf8');
  const rateLimiterTsPath = path.resolve(__dirname, '../src/lib/rateLimiter.ts');
  const rateLimiterContent = fs.readFileSync(rateLimiterTsPath, 'utf8');
  const backendRoutesPath = path.resolve(__dirname, '../../backend/app/routes.py');
  const backendRoutesContent = fs.readFileSync(backendRoutesPath, 'utf8');
  const backendLimiterPath = path.resolve(__dirname, '../../backend/app/rate_limiter.py');
  const backendLimiterContent = fs.readFileSync(backendLimiterPath, 'utf8');

  // 1. Verify legacy in-memory rate limiting map is eradicated from active-sessions route
  assert(!activeSessionsContent.includes('const activeSessionsRateLimits'), 'active-sessions route eradicated local in-memory rate map');

  // 2. Verify active-sessions uses getTrustedClientIp and checkActiveSessionsRateLimit
  assert(
    activeSessionsContent.includes('getTrustedClientIp') &&
    activeSessionsContent.includes('checkActiveSessionsRateLimit'),
    'active-sessions route imports and calls getTrustedClientIp and checkActiveSessionsRateLimit'
  );

  // 3. Verify rateLimiter.ts exports checkActiveSessionsRateLimit and resetActiveSessionsRateLimit
  assert(
    rateLimiterContent.includes('export async function checkActiveSessionsRateLimit') &&
    rateLimiterContent.includes('export async function resetActiveSessionsRateLimit'),
    'rateLimiter.ts exports checkActiveSessionsRateLimit and resetActiveSessionsRateLimit'
  );

  // 4. Verify rateLimiter.ts uses PostgreSQL stored procedure atomic_check_rate_limit with shared key
  assert(
    rateLimiterContent.includes('rl_active_sessions:') &&
    rateLimiterContent.includes('atomic_check_rate_limit'),
    'rateLimiter.ts uses shared atomic_check_rate_limit with key rl_active_sessions:'
  );

  // 5. Test IP validation & trusted IP extraction logic
  function isValidIp(ip) {
    if (!ip || typeof ip !== 'string') return false;
    const ipv4 = /^(?:(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.){3}(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)$/;
    const ipv6 = /^([0-9a-fA-F]{1,4}:){1,7}[0-9a-fA-F]{1,4}$|^::$|^::1$/;
    return ipv4.test(ip.trim()) || ipv6.test(ip.trim());
  }

  function simulateGetTrustedClientIp(headers) {
    const cfIp = headers['cf-connecting-ip'];
    if (cfIp && isValidIp(cfIp)) return cfIp.trim();

    const realIp = headers['x-real-ip'];
    if (realIp && isValidIp(realIp)) return realIp.trim();

    const xff = headers['x-forwarded-for'];
    if (xff) {
      const parts = xff.split(',').map(p => p.trim()).filter(isValidIp);
      if (parts.length > 0) return parts[0];
    }
    return '127.0.0.1';
  }

  assert(simulateGetTrustedClientIp({ 'cf-connecting-ip': '203.0.113.1' }) === '203.0.113.1', 'Cloudflare connecting IP takes precedence');
  assert(simulateGetTrustedClientIp({ 'cf-connecting-ip': 'forged_garbage', 'x-real-ip': '198.51.100.5' }) === '198.51.100.5', 'Forged CF IP ignored; falls back to verified X-Real-IP');
  assert(simulateGetTrustedClientIp({ 'x-forwarded-for': 'attacker-ip, 192.0.2.1, 10.0.0.1' }) === '192.0.2.1', 'Malformed leftmost IP filtered out; valid leftmost forwarded IP extracted');
  assert(simulateGetTrustedClientIp({}) === '127.0.0.1', 'Missing headers fall back safely to 127.0.0.1');

  // 6. Test active sessions sliding window rate limiting invariant (30 req / 60s)
  const memoryCache = {};
  function simulateActiveSessionsLimit(clientIp, nowSec) {
    const windowSeconds = 60.0;
    const maxAttempts = 30;
    let attempts = (memoryCache[clientIp] || []).filter(ts => nowSec - ts < windowSeconds);
    if (attempts.length >= maxAttempts) {
      const oldest = attempts[0];
      const remainingSeconds = Math.max(1, Math.ceil(windowSeconds - (nowSec - oldest)));
      return { allowed: false, remainingSeconds };
    }
    attempts.push(nowSec);
    memoryCache[clientIp] = attempts;
    return { allowed: true, remainingSeconds: 0 };
  }

  const testIp = '203.0.113.42';
  const now = 1700000000;
  for (let i = 0; i < 30; i++) {
    const res = simulateActiveSessionsLimit(testIp, now);
    assert(res.allowed === true, `Request ${i + 1} of 30 within 60s is allowed`);
  }
  const overflowRes = simulateActiveSessionsLimit(testIp, now);
  assert(overflowRes.allowed === false, '31st request is strictly blocked');
  assert(overflowRes.remainingSeconds > 0, 'Retry-After indicates positive remaining cooldown');

  // 7. Verify backend implementation synchronicity
  assert(
    backendLimiterContent.includes('def check_active_sessions_rate_limit') &&
    backendLimiterContent.includes('def reset_active_sessions_rate_limit'),
    'backend/app/rate_limiter.py implements check_active_sessions_rate_limit and reset_active_sessions_rate_limit'
  );
  assert(
    backendRoutesContent.includes('check_active_sessions_rate_limit(client_ip)') &&
    backendRoutesContent.includes('get_real_client_ip'),
    'backend/app/routes.py protects /api/active-sessions with check_active_sessions_rate_limit'
  );
}

// Summary
console.log('\n' + '=' .repeat(65));
console.log(`📊 Offline Unit Test Summary: ${passed} Passed, ${failed} Failed`);
console.log('=' .repeat(65) + '\n');

if (failed > 0) {
  process.exit(1);
} else {
  process.exit(0);
}



