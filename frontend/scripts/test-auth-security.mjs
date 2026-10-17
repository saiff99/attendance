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
