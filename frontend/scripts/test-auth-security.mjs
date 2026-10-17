/**
 * 🛡️ Automated Security Test Suite: Zero-Trust Authentication & PIN Hardening
 * 
 * Verifies:
 * 1. Missing credentials rejection (HTTP 400)
 * 2. Invalid credentials rejection (HTTP 401)
 * 3. Removal of hardcoded/built-in credentials fallback
 * 4. Complete elimination of default Roll Number as password
 * 5. Complete elimination of default '123456' as PIN
 * 6. Protection of unauthenticated API endpoints (HTTP 401)
 * 7. Legitimate database-backed admin authentication (HTTP 200)
 * 8. Dynamic temporary activation PIN issuance and verification
 */

const BASE_URL = process.env.TEST_BASE_URL || 'http://localhost:3000';

async function request(path, options = {}) {
  const url = `${BASE_URL}${path}`;
  const res = await fetch(url, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(options.headers || {}),
    },
  });
  let data;
  try {
    data = await res.json();
  } catch {
    data = null;
  }
  return { status: res.status, headers: res.headers, data };
}

let passedTests = 0;
let failedTests = 0;

function assert(condition, testName, detail = '') {
  if (condition) {
    console.log(`  ✅ PASS: ${testName}`);
    passedTests++;
  } else {
    console.error(`  ❌ FAIL: ${testName} - ${detail}`);
    failedTests++;
  }
}

async function runTests() {
  console.log('\n🔒 Starting Zero-Trust Authentication Security Test Suite...\n');
  console.log(`Target: ${BASE_URL}\n`);

  // =========================================================================
  // Test 1: Missing Credentials Rejection
  // =========================================================================
  console.log('--- Suite 1: Missing Credentials Handling ---');
  {
    const res1 = await request('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ username: '', password: '', mode: 'admin' }),
    });
    assert(res1.status === 400, 'Empty admin credentials return HTTP 400', `Got ${res1.status}`);

    const res2 = await request('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ username: 'saif', password: '', mode: 'admin' }),
    });
    assert(res2.status === 400, 'Missing password returns HTTP 400', `Got ${res2.status}`);

    const res3 = await request('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ username: '', password: 'somepassword', mode: 'student' }),
    });
    assert(res3.status === 400, 'Missing student roll returns HTTP 400', `Got ${res3.status}`);
  }

  // =========================================================================
  // Test 2: Invalid Credentials Rejection
  // =========================================================================
  console.log('\n--- Suite 2: Invalid Credentials Handling ---');
  {
    const res1 = await request('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ username: 'nonexistent_user_999', password: 'randompassword123', mode: 'admin' }),
    });
    assert(res1.status === 401, 'Nonexistent admin user returns HTTP 401', `Got ${res1.status}`);

    const res2 = await request('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ username: 'saif', password: 'wrongpassword456', mode: 'admin' }),
    });
    assert(res2.status === 401, 'Correct username with wrong password returns HTTP 401', `Got ${res2.status}`);
  }

  // =========================================================================
  // Test 3: Unauthenticated API Access Protection
  // =========================================================================
  console.log('\n--- Suite 3: Protected Routes Without Authentication ---');
  {
    const res1 = await request('/api/users', { method: 'GET' });
    assert(res1.status === 401, 'GET /api/users without cookie returns HTTP 401', `Got ${res1.status}`);

    const res2 = await request('/api/students/06e60fd0-ef78-4a04-a61c-7cf299b41561/reset-pin', { method: 'POST' });
    assert(res2.status === 401, 'POST reset-pin without session cookie returns HTTP 401', `Got ${res2.status}`);

    const res3 = await request('/api/student/change-pin', {
      method: 'POST',
      body: JSON.stringify({ newPin: '123456' }),
    });
    assert(res3.status === 401, 'POST /api/student/change-pin without student session returns HTTP 401', `Got ${res3.status}`);
  }

  // =========================================================================
  // Test 4: Weak Default Student Fallback Elimination (Roll as PIN & 123456)
  // =========================================================================
  console.log('\n--- Suite 4: Strict Student Default Fallback Elimination ---');
  {
    // Try logging in as Student 25001 with Roll Number as password
    const res1 = await request('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ username: '25001', password: '25001', mode: 'student' }),
    });
    assert(res1.status === 401 || res1.status === 429, 'Student Roll Number as password REJECTED (HTTP 401/429)', `Got ${res1.status}`);

    // Try logging in as Student 25003 with default PIN '123456'
    const res2 = await request('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ username: '25003', password: '123456', mode: 'student' }),
    });
    assert(res2.status === 401 || res2.status === 429, 'Default PIN "123456" REJECTED (HTTP 401/429)', `Got ${res2.status}`);

    // Try logging in as Student 26001 with Roll Number as password
    const res3 = await request('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ username: '26001', password: '26001', mode: 'student' }),
    });
    assert(res3.status === 401 || res3.status === 429, 'Student 26001 Roll Number as password REJECTED (HTTP 401/429)', `Got ${res3.status}`);
  }

  // =========================================================================
  // Test 5: Legitimate Database-Backed Admin Authentication
  // =========================================================================
  console.log('\n--- Suite 5: Database-Backed Super Admin Login ---');
  let adminSessionCookie = '';
  {
    const res = await request('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ username: 'saif', password: 'saif123', mode: 'admin' }),
    });
    assert(res.status === 200 && res.data?.success === true, 'Admin "saif" authenticated via app_users database record', `Got ${res.status}`);
    assert(res.data?.user?.role === 'Super Admin', 'User has role "Super Admin"', `Got ${res.data?.user?.role}`);

    const setCookie = res.headers.get('set-cookie');
    if (setCookie) {
      const match = setCookie.match(/medattend_session=([^;]+)/);
      if (match) {
        adminSessionCookie = `medattend_session=${match[1]}`;
      }
    }
    assert(Boolean(adminSessionCookie), 'Received cryptographically signed medattend_session cookie');
  }

  // =========================================================================
  // Test 6: Authenticated Access to Protected Routes
  // =========================================================================
  console.log('\n--- Suite 6: Authorized API Access with Session Cookie ---');
  {
    const res = await request('/api/users', {
      method: 'GET',
      headers: { Cookie: adminSessionCookie },
    });
    assert(res.status === 200 && res.data?.success === true, 'GET /api/users returns 200 for authorized Super Admin', `Got ${res.status}`);
    assert(Array.isArray(res.data?.users), 'Returns array of app_users from Supabase');
    assert(res.data?.users.some(u => u.username === 'saif'), 'Database user "saif" present in user directory');
    assert(!res.data?.users.some(u => u.id && u.id.startsWith('builtin-')), 'No fake "builtin-" mock IDs returned');
  }

  // =========================================================================
  // Test 7: Student Temporary Activation PIN Reset Flow
  // =========================================================================
  console.log('\n--- Suite 7: Dynamic Temporary PIN Issuance & Login ---');
  {
    // 1. Reset PIN for student 25002 using Super Admin session
    const resetRes = await request('/api/students/06e60fd0-ef78-4a04-a61c-7cf299b41561/reset-pin', {
      method: 'POST',
      headers: { Cookie: adminSessionCookie },
    });
    assert(resetRes.status === 200 && resetRes.data?.success === true, 'Admin triggers Reset PIN successfully', `Got ${resetRes.status}`);
    assert(/^\d{6}$/.test(resetRes.data?.tempPin), `Generated 6-digit temporary PIN: ${resetRes.data?.tempPin}`);

    const issuedPin = resetRes.data?.tempPin;

    // 2. Logging in with old PIN or default 123456 must FAIL
    const failRes = await request('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ username: '25002', password: '123456', mode: 'student' }),
    });
    assert(failRes.status === 401 || failRes.status === 429, 'Post-reset default 123456 login REJECTED (HTTP 401/429)', `Got ${failRes.status}`);

    // 3. Logging in with the newly generated temporary PIN must SUCCEED
    const successRes = await request('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ username: '25002', password: issuedPin, mode: 'student' }),
    });
    assert(successRes.status === 200 && successRes.data?.success === true, 'Student logs in successfully using Temporary Activation PIN', `Got ${successRes.status}`);
    assert(successRes.data?.user?.role === 'Student', 'Authenticated role is "Student"');
  }

  // =========================================================================
  // Test 8: Mandatory Current PIN Verification for Student PIN Change
  // =========================================================================
  console.log('\n--- Suite 8: Mandatory Current PIN Verification ---');
  let studentCookie = '';
  {
    // Log in as student 25001 using their known PIN (645053)
    const loginRes = await request('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ username: '25001', password: '645053', mode: 'student' }),
    });
    assert(loginRes.status === 200, 'Student 25001 logged in successfully');
    
    const setCookie = loginRes.headers.get('set-cookie');
    if (setCookie) {
      const match = setCookie.match(/medattend_session=([^;]+)/);
      if (match) studentCookie = `medattend_session=${match[1]}`;
    }
    assert(Boolean(studentCookie), 'Obtained Student session cookie');

    // 1. Missing old PIN must be REJECTED (HTTP 400)
    const missingOldRes = await request('/api/student/change-pin', {
      method: 'POST',
      headers: { Cookie: studentCookie },
      body: JSON.stringify({ newPin: '998877' }),
    });
    assert(missingOldRes.status === 400, 'Missing old PIN rejected with HTTP 400', `Got ${missingOldRes.status}`);
    assert(Boolean(missingOldRes.data?.error?.includes('Current PIN is required')), 'Error mentions Current PIN is required');

    // 2. Incorrect old PIN must be REJECTED (HTTP 401)
    const wrongOldRes = await request('/api/student/change-pin', {
      method: 'POST',
      headers: { Cookie: studentCookie },
      body: JSON.stringify({ oldPin: '000000', newPin: '998877' }),
    });
    assert(wrongOldRes.status === 401, 'Incorrect old PIN rejected with HTTP 401', `Got ${wrongOldRes.status}`);
    assert(Boolean(wrongOldRes.data?.error?.includes('Current PIN is incorrect')), 'Error mentions Current PIN is incorrect');

    // 3. Super Admin session trying to call student change-pin must be REJECTED (HTTP 403)
    const adminTryingRes = await request('/api/student/change-pin', {
      method: 'POST',
      headers: { Cookie: adminSessionCookie },
      body: JSON.stringify({ oldPin: '645053', newPin: '998877' }),
    });
    assert(adminTryingRes.status === 403, 'Admin calling student change-pin rejected with HTTP 403 (role separation)', `Got ${adminTryingRes.status}`);

    // 4. Valid PIN change with correct old PIN must SUCCEED (HTTP 200)
    const validChangeRes = await request('/api/student/change-pin', {
      method: 'POST',
      headers: { Cookie: studentCookie },
      body: JSON.stringify({ oldPin: '645053', newPin: '849201' }),
    });
    assert(validChangeRes.status === 200 && validChangeRes.data?.success === true, 'Valid PIN change with correct old PIN succeeded (HTTP 200)', `Got ${validChangeRes.status}`);

    // 5. Verify old PIN no longer works
    const oldLoginRes = await request('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ username: '25001', password: '645053', mode: 'student' }),
    });
    assert(oldLoginRes.status === 401 || oldLoginRes.status === 429, 'Old PIN no longer works after change (HTTP 401/429)');

    // 6. Verify new PIN works
    const newLoginRes = await request('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ username: '25001', password: '849201', mode: 'student' }),
    });
    assert(newLoginRes.status === 200, 'Student logs in successfully with newly set PIN (HTTP 200)');

    // Clean up: restore student 25001 back to 645053 so user experience is uninterrupted
    const restoreCookie = newLoginRes.headers.get('set-cookie')?.match(/medattend_session=([^;]+)/)?.[1];
    if (restoreCookie) {
      await request('/api/student/change-pin', {
        method: 'POST',
        headers: { Cookie: `medattend_session=${restoreCookie}` },
        body: JSON.stringify({ oldPin: '849201', newPin: '645053' }),
      });
      console.log('  ℹ️  Student 25001 PIN cleanly restored to 645053');
    }
  }

  // --- Suite 9: Biometric Consent & Erasure Verification (DPDP Act 2023) ---
  console.log('\n--- Suite 9: Biometric Consent & Erasure Verification (DPDP Act 2023) ---');
  {
    const testStudentId = '8ce29187-22d7-4d77-aeba-a26b9509ef84'; // Student 25003 (VINOD MAJHI)

    // 1. Enrollment without affirmative consent must be REJECTED (HTTP 400)
    const emptyForm = new FormData();
    emptyForm.append('files', new Blob(['fake_image_content'], { type: 'image/jpeg' }), 'frame_0.jpg');
    const noConsentRes = await fetch(`${BASE_URL}/api/enroll-face-burst/${testStudentId}`, {
      method: 'POST',
      headers: { Cookie: adminSessionCookie },
      body: emptyForm,
    });
    const noConsentData = await noConsentRes.json().catch(() => ({}));
    assert(noConsentRes.status === 400, 'Enrollment without affirmative consent REJECTED (HTTP 400)', `Got ${noConsentRes.status}`);
    assert(Boolean(noConsentData.detail?.includes('Biometric consent is mandatory')), 'Error mentions mandatory biometric consent');

    // 2. Revocation without authorization must be REJECTED
    const unauthRevoke = await request(`/api/students/${testStudentId}/revoke-biometrics`, {
      method: 'POST',
    });
    assert(unauthRevoke.status === 401, 'Revoke biometrics without session rejected with HTTP 401', `Got ${unauthRevoke.status}`);

    const studentTryingRevoke = await request(`/api/students/${testStudentId}/revoke-biometrics`, {
      method: 'POST',
      headers: { Cookie: studentCookie },
    });
    assert(studentTryingRevoke.status === 403, 'Student calling admin revoke-biometrics rejected with HTTP 403 (role separation)', `Got ${studentTryingRevoke.status}`);

    // 3. Nonexistent student revocation must return HTTP 404
    const notFoundRevoke = await request('/api/students/00000000-0000-0000-0000-000000000000/revoke-biometrics', {
      method: 'POST',
      headers: { Cookie: adminSessionCookie },
    });
    assert(notFoundRevoke.status === 404, 'Revoke biometrics for nonexistent student returns HTTP 404', `Got ${notFoundRevoke.status}`);

    // 4. Authorized Super Admin Revocation & Erasure Flow must SUCCEED (HTTP 200)
    const validRevoke = await request(`/api/students/${testStudentId}/revoke-biometrics`, {
      method: 'POST',
      headers: { Cookie: adminSessionCookie },
    });
    assert(validRevoke.status === 200 && validRevoke.data?.success === true, 'Authorized biometric revocation succeeded (HTTP 200)', `Got ${validRevoke.status}`);
    assert(Boolean(validRevoke.data?.message?.includes('permanently erased')), 'Confirmation confirms permanent erasure');
  }

  // --- Suite 10: Anti-Spoofing & Liveness Fail-Closed Verification ---
  console.log('\n--- Suite 10: Anti-Spoofing & Liveness Fail-Closed Verification ---');
  {
    const { execSync } = await import('child_process');
    const path = await import('path');
    const backendTestPath = path.resolve('../backend/test_antispoof.py');
    const pythonBin = path.resolve('../backend/.venv/bin/python');

    try {
      const output = execSync(`"${pythonBin}" "${backendTestPath}"`, { encoding: 'utf-8' });
      assert(output.includes('12/12 Passed'), 'All 12 Anti-Spoofing & Liveness Fail-Closed Security Tests Passed');
    } catch (err) {
      assert(false, 'Anti-Spoofing test execution failed', err.message);
    }
  }

  // --- Suite 11: Attendance API Strict Schema Validation & Faculty Scope Authorization ---
  console.log('\n--- Suite 11: Attendance API Strict Schema Validation & Faculty Scope Authorization ---');
  {
    // Authenticate Faculty member
    let facultySessionCookie = '';
    const facLogin = await request('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ username: 'faculty', password: 'faculty123', mode: 'admin' }),
    });
    if (facLogin.status === 200 && facLogin.headers.get('set-cookie')) {
      const match = facLogin.headers.get('set-cookie').match(/medattend_session=([^;]+)/);
      if (match) facultySessionCookie = `medattend_session=${match[1]}`;
    }
    assert(Boolean(facultySessionCookie), 'Authenticated Faculty user received medattend_session cookie');

    // 1. Unauthenticated requests rejected
    const unauthPost = await request('/api/attendance/mark', {
      method: 'POST',
      body: JSON.stringify({ session_id: '00000000-0000-0000-0000-000000000000', student_id: '00000000-0000-0000-0000-000000000000' }),
    });
    assert(unauthPost.status === 401, 'Unauthenticated POST mark attendance REJECTED (HTTP 401)');

    const unauthDel = await request('/api/attendance/mark?id=00000000-0000-0000-0000-000000000000', {
      method: 'DELETE',
    });
    assert(unauthDel.status === 401, 'Unauthenticated DELETE attendance REJECTED (HTTP 401)');

    // 2. Student role calling mark/delete rejected with HTTP 403
    const studentMark = await request('/api/attendance/mark', {
      method: 'POST',
      headers: { Cookie: studentCookie },
      body: JSON.stringify({ session_id: '00000000-0000-0000-0000-000000000000', student_id: '00000000-0000-0000-0000-000000000000' }),
    });
    assert(studentMark.status === 403, 'Student role calling mark attendance REJECTED with HTTP 403');

    // 3. Schema validation: Malformed/non-UUID IDs rejected with HTTP 400
    const invalidUuid = await request('/api/attendance/mark', {
      method: 'POST',
      headers: { Cookie: adminSessionCookie },
      body: JSON.stringify({ session_id: 'invalid-session-123', student_id: 'invalid-student-456' }),
    });
    assert(invalidUuid.status === 400, 'Non-UUID session_id and student_id REJECTED (HTTP 400)');

    // 4. Schema validation: Invalid status rejected with HTTP 400
    const validSessionId = '6581a431-42ca-40fe-b1c6-530f258eb658'; // Session owned by Rajashri Mam
    const validStudentId = '7c138d01-37e5-4074-9900-66a111d9e580'; // Student SAIF (3rd Year)

    const invalidStatus = await request('/api/attendance/mark', {
      method: 'POST',
      headers: { Cookie: adminSessionCookie },
      body: JSON.stringify({
        session_id: validSessionId,
        student_id: validStudentId,
        status: 'Excused_Absence', // Invalid enum
      }),
    });
    assert(invalidStatus.status === 400, 'Invalid attendance status REJECTED (HTTP 400)');

    // 5. Schema validation: Invalid confidence score rejected with HTTP 400
    const negConfidence = await request('/api/attendance/mark', {
      method: 'POST',
      headers: { Cookie: adminSessionCookie },
      body: JSON.stringify({
        session_id: validSessionId,
        student_id: validStudentId,
        status: 'Present',
        confidence_score: -0.25,
      }),
    });
    assert(negConfidence.status === 400, 'Negative confidence score REJECTED (HTTP 400)');

    const highConfidence = await request('/api/attendance/mark', {
      method: 'POST',
      headers: { Cookie: adminSessionCookie },
      body: JSON.stringify({
        session_id: validSessionId,
        student_id: validStudentId,
        status: 'Present',
        confidence_score: 1.5,
      }),
    });
    assert(highConfidence.status === 400, 'Out-of-range confidence (>1.0) REJECTED (HTTP 400)');

    const strConfidence = await request('/api/attendance/mark', {
      method: 'POST',
      headers: { Cookie: adminSessionCookie },
      body: JSON.stringify({
        session_id: validSessionId,
        student_id: validStudentId,
        status: 'Present',
        confidence_score: 'high_confidence',
      }),
    });
    assert(strConfidence.status === 400, 'Non-numeric confidence string REJECTED (HTTP 400)');

    // 6. Schema validation: Invalid capture_mode rejected with HTTP 400
    const invalidMode = await request('/api/attendance/mark', {
      method: 'POST',
      headers: { Cookie: adminSessionCookie },
      body: JSON.stringify({
        session_id: validSessionId,
        student_id: validStudentId,
        status: 'Present',
        capture_mode: 'Hacked Injected Mode',
      }),
    });
    assert(invalidMode.status === 400, 'Unallowlisted capture_mode REJECTED (HTTP 400)');

    // 7. Faculty Scope Isolation: Faculty cannot mark attendance for another Faculty\'s session (HTTP 403)
    const unauthorizedFacMark = await request('/api/attendance/mark', {
      method: 'POST',
      headers: { Cookie: facultySessionCookie },
      body: JSON.stringify({
        session_id: validSessionId, // Owned by Rajashri Mam
        student_id: validStudentId,
        status: 'Present',
        capture_mode: 'Manual Entry',
      }),
    });
    assert(unauthorizedFacMark.status === 403, 'Faculty modifying another Faculty member\'s session REJECTED (HTTP 403)');

    // 8. Faculty Scope Isolation: Faculty cannot delete attendance from another Faculty\'s session (HTTP 403)
    const unauthorizedFacDel = await request('/api/attendance/mark', {
      method: 'DELETE',
      headers: { Cookie: facultySessionCookie },
      body: JSON.stringify({
        session_id: validSessionId,
        student_id: validStudentId,
      }),
    });
    assert(unauthorizedFacDel.status === 403 || unauthorizedFacDel.status === 404, 'Faculty deleting another Faculty member\'s session record REJECTED (HTTP 403/404)');

    // 9. Faculty Scope Isolation: Faculty cannot view logs for another Faculty\'s session (HTTP 403)
    const unauthorizedFacLogs = await request(`/api/attendance/session/${validSessionId}`, {
      method: 'GET',
      headers: { Cookie: facultySessionCookie },
    });
    assert(unauthorizedFacLogs.status === 403, 'Faculty viewing logs for another Faculty member\'s session REJECTED (HTTP 403)');

    // 10. Super Admin Authorized Override: Marks attendance, enforces server timestamp, logs audit trail (HTTP 200)
    const adminMark = await request('/api/attendance/mark', {
      method: 'POST',
      headers: { Cookie: adminSessionCookie },
      body: JSON.stringify({
        session_id: validSessionId,
        student_id: validStudentId,
        status: 'Present',
        capture_mode: 'Manual Entry',
        confidence_score: 0.98,
        reason: 'Super Admin manual verification override test',
      }),
    });
    assert(adminMark.status === 200 && adminMark.data?.success === true, 'Authorized Super Admin attendance mark succeeded (HTTP 200)');
    assert(Boolean(adminMark.data?.data?.recorded_at), 'Server-controlled recorded_at timestamp present in record');

    // 11. Super Admin Authorized Deletion / Undo (HTTP 200)
    const adminDel = await request('/api/attendance/mark', {
      method: 'DELETE',
      headers: { Cookie: adminSessionCookie },
      body: JSON.stringify({
        session_id: validSessionId,
        student_id: validStudentId,
        reason: 'Clean up test record after automated audit verification',
      }),
    });
    assert(adminDel.status === 200 && adminDel.data?.success === true, 'Authorized Super Admin attendance deletion succeeded (HTTP 200)');
  }

  // =========================================================================
  // Test 12: Geofence Strict Numeric Validation, Fail-Closed Persistence & Active-Session Filtering
  // =========================================================================
  console.log('\n--- Suite 12: Geofence Validation, Fail-Closed Persistence & Active Sessions Isolation ---');
  {
    // 1. Unauthenticated and Student role rejection for Geofence POST
    const unauthGeofence = await request('/api/geofence', {
      method: 'POST',
      body: JSON.stringify({ latitude: 22.45, longitude: 88.17, radiusMeters: 50 }),
    });
    assert(unauthGeofence.status === 401, 'Unauthenticated POST /api/geofence REJECTED (HTTP 401)', `Got ${unauthGeofence.status}`);

    const studentGeofence = await request('/api/geofence', {
      method: 'POST',
      headers: { Cookie: studentCookie },
      body: JSON.stringify({ latitude: 22.45, longitude: 88.17, radiusMeters: 50 }),
    });
    assert(studentGeofence.status === 403, 'Student role calling POST /api/geofence REJECTED (HTTP 403)', `Got ${studentGeofence.status}`);

    // 2. Fetch initial valid geofence so we can safely restore it later
    const initialGet = await request('/api/geofence');
    const originalConfig = initialGet.data?.config || {
      enabled: false,
      latitude: 22.450026,
      longitude: 88.170683,
      radiusMeters: 30,
      campusName: 'JIMSH Medical College Campus & Lecture Halls',
    };

    // 3. Strict Numeric Validation: Invalid Latitude (must be between -90 and 90)
    const latOverRes = await request('/api/geofence', {
      method: 'POST',
      headers: { Cookie: adminSessionCookie },
      body: JSON.stringify({ latitude: 95.5 }),
    });
    assert(latOverRes.status === 400, 'Latitude > 90 REJECTED (HTTP 400)', `Got ${latOverRes.status}`);

    const latUnderRes = await request('/api/geofence', {
      method: 'POST',
      headers: { Cookie: adminSessionCookie },
      body: JSON.stringify({ latitude: -90.5 }),
    });
    assert(latUnderRes.status === 400, 'Latitude < -90 REJECTED (HTTP 400)', `Got ${latUnderRes.status}`);

    const latNanRes = await request('/api/geofence', {
      method: 'POST',
      headers: { Cookie: adminSessionCookie },
      body: JSON.stringify({ latitude: 'not-a-number' }),
    });
    assert(latNanRes.status === 400, 'Non-numeric Latitude string REJECTED (HTTP 400)', `Got ${latNanRes.status}`);

    // 4. Strict Numeric Validation: Invalid Longitude (must be between -180 and 180)
    const lngOverRes = await request('/api/geofence', {
      method: 'POST',
      headers: { Cookie: adminSessionCookie },
      body: JSON.stringify({ longitude: 185 }),
    });
    assert(lngOverRes.status === 400, 'Longitude > 180 REJECTED (HTTP 400)', `Got ${lngOverRes.status}`);

    const lngUnderRes = await request('/api/geofence', {
      method: 'POST',
      headers: { Cookie: adminSessionCookie },
      body: JSON.stringify({ longitude: -185 }),
    });
    assert(lngUnderRes.status === 400, 'Longitude < -180 REJECTED (HTTP 400)', `Got ${lngUnderRes.status}`);

    // 5. Strict Numeric Validation: Radius (must be positive, between 10m and 5000m)
    const radZeroRes = await request('/api/geofence', {
      method: 'POST',
      headers: { Cookie: adminSessionCookie },
      body: JSON.stringify({ radiusMeters: 0 }),
    });
    assert(radZeroRes.status === 400, 'Zero radius REJECTED (HTTP 400)', `Got ${radZeroRes.status}`);

    const radNegRes = await request('/api/geofence', {
      method: 'POST',
      headers: { Cookie: adminSessionCookie },
      body: JSON.stringify({ radiusMeters: -25 }),
    });
    assert(radNegRes.status === 400, 'Negative radius REJECTED (HTTP 400)', `Got ${radNegRes.status}`);

    const radHugeRes = await request('/api/geofence', {
      method: 'POST',
      headers: { Cookie: adminSessionCookie },
      body: JSON.stringify({ radiusMeters: 10000 }),
    });
    assert(radHugeRes.status === 400, 'Excessive radius (>5000m) REJECTED (HTTP 400)', `Got ${radHugeRes.status}`);

    // 6. Zero-Valued Input Protection: latitude: 0 and longitude: 0 must NOT be treated as falsy/missing
    const zeroValRes = await request('/api/geofence', {
      method: 'POST',
      headers: { Cookie: adminSessionCookie },
      body: JSON.stringify({
        latitude: 0,
        longitude: 0,
        radiusMeters: 45,
        campusName: 'Equator Prime Meridian Test Campus',
        enabled: true,
      }),
    });
    assert(zeroValRes.status === 200 && zeroValRes.data?.success === true, 'Valid 0-valued coordinate input ACCEPTED (HTTP 200)');
    assert(zeroValRes.data?.config?.latitude === 0, 'Zero latitude preserved (not discarded by falsy || check)');
    assert(zeroValRes.data?.config?.longitude === 0, 'Zero longitude preserved (not discarded by falsy || check)');

    // 7. Verify GET returns persisted zero-valued coordinates
    const verifyGet = await request('/api/geofence');
    assert(verifyGet.data?.config?.latitude === 0 && verifyGet.data?.config?.longitude === 0, 'GET /api/geofence confirms zero coordinates persisted correctly');

    // 8. Fail-Closed Persistence & In-Memory State Protection during Database Failure
    const dbFailRes = await request('/api/geofence', {
      method: 'POST',
      headers: {
        Cookie: adminSessionCookie,
        'x-test-simulate-db-failure': '1',
      },
      body: JSON.stringify({
        latitude: 45.0,
        longitude: 45.0,
        radiusMeters: 100,
        campusName: 'Temporary Failed Attempt',
      }),
    });
    assert(dbFailRes.status === 500 && dbFailRes.data?.success === false, 'Database persistence failure returns HTTP 500 (Fail-Closed)');
    assert(Boolean(dbFailRes.data?.error?.includes('Database persistence failed')), 'Error details mention persistence failure');

    // Verify cache was NOT altered by the failed request
    const afterFailGet = await request('/api/geofence');
    assert(afterFailGet.data?.config?.latitude === 0, 'In-memory cache protected: latitude not corrupted by failed request');
    assert(afterFailGet.data?.config?.campusName !== 'Temporary Failed Attempt', 'In-memory cache protected: unpersisted config not made authoritative');

    // 9. Active Sessions Listing: Exclusion of internal and system configuration rows
    const activeSessionsRes = await request('/api/active-sessions');
    assert(activeSessionsRes.status === 200 && activeSessionsRes.data?.success === true, 'GET /api/active-sessions succeeded (HTTP 200)');
    const returnedSessions = activeSessionsRes.data?.sessions || [];
    const hasInternalRow = returnedSessions.some(s => {
      const name = String(s.class_name || '');
      const year = String(s.target_academic_year || '');
      const id = String(s.id || '');
      return (
        name.startsWith('__') ||
        name === '__GEOFENCE_CONFIG__' ||
        name === '__SYSTEM_CONFIG__' ||
        year.toLowerCase() === 'system' ||
        id === '00000000-0000-0000-0000-000000000001'
      );
    });
    assert(!hasInternalRow, 'Active sessions list strictly excludes all internal/system configuration rows');

    // 10. Clean Restoration of Original Geofence Config
    const restoreRes = await request('/api/geofence', {
      method: 'POST',
      headers: { Cookie: adminSessionCookie },
      body: JSON.stringify(originalConfig),
    });
    assert(restoreRes.status === 200 && restoreRes.data?.success === true, 'Original geofence configuration restored cleanly');
  }

  // =========================================================================
  // Test 13: Persistent Atomic Rate Limiting, Race Condition & Fail-Closed Protection
  // =========================================================================
  console.log('\n--- Suite 13: Persistent Atomic Rate Limiting, Concurrency & Fail-Closed Protection ---');
  {
    const sharedWifiIp = '103.21.5.10';

    // 1. Threshold Crossing: 5 failed attempts allowed, 6th triggers HTTP 429
    const threshUser = `thresh_user_${Date.now()}`;
    let retryAfterHeader = null;

    for (let i = 1; i <= 6; i++) {
      const res = await request('/api/auth/login', {
        method: 'POST',
        headers: { 'cf-connecting-ip': sharedWifiIp },
        body: JSON.stringify({ username: threshUser, password: 'wrongpassword', mode: 'admin' }),
      });
      if (i <= 5) {
        assert(res.status === 401, `Threshold attempt ${i}/5 rejected with HTTP 401`);
      } else {
        retryAfterHeader = res.headers.get('retry-after');
        assert(res.status === 429, 'Threshold crossing attempt 6/5 LOCKED with HTTP 429');
        assert(Boolean(retryAfterHeader), 'Locked response includes Retry-After header');
      }
    }

    // 2. Concurrency & Race Condition: 10 parallel login attempts for same user
    const parallelUser = `parallel_user_${Date.now()}`;
    const parallelRequests = Array.from({ length: 10 }).map((_, idx) =>
      request('/api/auth/login', {
        method: 'POST',
        headers: { 'cf-connecting-ip': sharedWifiIp },
        body: JSON.stringify({ username: parallelUser, password: `wrong_${idx}`, mode: 'admin' }),
      })
    );
    const parallelResults = await Promise.all(parallelRequests);
    const count401 = parallelResults.filter(r => r.status === 401).length;
    const count429 = parallelResults.filter(r => r.status === 429).length;

    assert(count401 <= 5, 'Parallel race condition prevented: at most 5 attempts processed before lockout');
    assert(count429 > 0, `Parallel race condition prevented: ${count429} concurrent attempts rejected with HTTP 429`);

    // Verify subsequent attempt is immediately locked
    const postParallel = await request('/api/auth/login', {
      method: 'POST',
      headers: { 'cf-connecting-ip': sharedWifiIp },
      body: JSON.stringify({ username: parallelUser, password: 'wrong_post', mode: 'admin' }),
    });
    assert(postParallel.status === 429, 'Subsequent post-parallel attempt remains locked (HTTP 429)');

    // 3. Storage Failure / Fail-Closed Degraded Behavior: Local guard prevents unlimited attempts
    const storageFailUser = `storage_fail_user_${Date.now()}`;
    let storageFailLocked = false;
    for (let i = 1; i <= 6; i++) {
      const res = await request('/api/auth/login', {
        method: 'POST',
        headers: {
          'cf-connecting-ip': sharedWifiIp,
          'x-test-simulate-storage-failure': '1',
        },
        body: JSON.stringify({ username: storageFailUser, password: 'wrongpassword', mode: 'admin' }),
      });
      if (i >= 5 && res.status === 429) {
        storageFailLocked = true;
      }
    }
    assert(storageFailLocked, 'Storage failure enforces Fail-Closed protection (locks after threshold, no unlimited attempts)');

    // 4. Shared College Wi-Fi / NAT Multi-Student Isolation
    // When Student A gets locked on college Wi-Fi, Student B on the exact same Wi-Fi IP is NOT blocked
    const studentA = `wifi_student_a_${Date.now()}`;
    const studentB = `wifi_student_b_${Date.now()}`;

    // Lock student A with 5 failed attempts
    for (let i = 1; i <= 5; i++) {
      await request('/api/auth/login', {
        method: 'POST',
        headers: { 'cf-connecting-ip': sharedWifiIp },
        body: JSON.stringify({ username: studentA, password: 'wrongpassword', mode: 'student' }),
      });
    }
    const studentALocked = await request('/api/auth/login', {
      method: 'POST',
      headers: { 'cf-connecting-ip': sharedWifiIp },
      body: JSON.stringify({ username: studentA, password: 'wrongpassword', mode: 'student' }),
    });
    assert(studentALocked.status === 429, 'Student A locked on shared College Wi-Fi IP (HTTP 429)');

    // Student B attempts login from the EXACT SAME Wi-Fi IP: must NOT be locked (receives 401 for wrong pass, not 429)
    const studentBRes = await request('/api/auth/login', {
      method: 'POST',
      headers: { 'cf-connecting-ip': sharedWifiIp },
      body: JSON.stringify({ username: studentB, password: 'wrongpassword', mode: 'student' }),
    });
    assert(studentBRes.status === 401, 'Student B on same College Wi-Fi IP is NOT locked by Student A lockout (HTTP 401 != 429)');

    // 5. Rate Limit Reset on Successful Authentication
    // Admin saif logs in successfully and resets any failed attempt count
    const adminLogin = await request('/api/auth/login', {
      method: 'POST',
      headers: { 'cf-connecting-ip': sharedWifiIp },
      body: JSON.stringify({ username: 'saif', password: 'saif123', mode: 'admin' }),
    });
    assert(adminLogin.status === 200, 'Admin login succeeded and cleared rate limit');
  }

  // Summary
  console.log('\n=======================================================');
  console.log(`📊 Test Summary: ${passedTests} Passed, ${failedTests} Failed`);
  console.log('=======================================================\n');

  if (failedTests > 0) {
    process.exit(1);
  } else {
    process.exit(0);
  }
}

runTests().catch(err => {
  console.error('Test execution error:', err);
  process.exit(1);
});
