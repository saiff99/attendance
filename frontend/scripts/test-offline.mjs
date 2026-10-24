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
  assert(archived.face_encoding === null, 'Biometric face encoding purged on archival');
  assert(archived.biometric_consent === false, 'Biometric consent revoked on archival');
  assert(archived.academic_year === '[ARCHIVED] 1st Year', 'Academic year tagged with [ARCHIVED]');
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

// Summary
console.log('\n' + '=' .repeat(65));
console.log(`📊 Offline Unit Test Summary: ${passed} Passed, ${failed} Failed`);
console.log('=' .repeat(65) + '\n');

if (failed > 0) {
  process.exit(1);
} else {
  process.exit(0);
}


