# 🛡️ MedAttend AI — Automated Testing & Safe Data Guide

This document outlines the testing architecture, safe test data practices, and Continuous Integration (CI) configuration for **MedAttend AI**.

---

## 1. Testing Philosophy & Architecture

MedAttend employs a two-tier testing strategy designed to balance rapid, zero-dependency feedback with thorough end-to-end security verification:

```
┌────────────────────────────────────────────────────────┐
│  Tier 1: Offline Deterministic Unit Tests              │
│  - 0 external dependencies                             │
│  - Runs in ~0.5s on GitHub Actions CI & developer Macs  │
│  - Pure algorithmic, security & schema invariants      │
└────────────────────────────────────────────────────────┘
                           │
                           ▼
┌────────────────────────────────────────────────────────┐
│  Tier 2: End-to-End Zero-Trust Security Suite          │
│  - 106 automated security assertions                  │
│  - Tests live auth, RLS, PIN hardening & rate limiting │
│  - Runs against local dev environment (ports 3000/8000)│
└────────────────────────────────────────────────────────┘
```

---

## 2. Safe Test Data Policy (Zero-Production Pollution)

To prevent test scripts from creating orphaned rows or corrupting production analytics:
1. **Dry-Run by Default:** `backend/test_insert.py` executes schema constraint verification in dry-run mode without modifying any database tables.
2. **Strict Schema Constraints:** All test payloads strictly adhere to database `CHECK` constraints:
   - `capture_mode`: Must be one of `'Live Scan'`, `'Manual Upload'`, `'Selfie Scan'`, `'Manual Entry'`, `'Selfie Check-in'`. Legacy or unallowlisted values like `'Live CCTV'` are strictly blocked.
   - `status`: Must be `'Present'`, `'Absent'`, or `'Late'`.
   - `confidence_score`: Must be between `0.0` and `1.0`.
3. **Explicit Write Guard (`ALLOW_TEST_DB_WRITE`):** Live database writes in standalone scripts require `ALLOW_TEST_DB_WRITE=1`.
4. **Immediate Cleanup:** If a test record is inserted, the test framework guarantees its immediate deletion in a `finally` block before exiting.

---

## 3. Running Tests Locally

### Tier 1: Fast Offline Unit Tests (No Database, Camera, or Server Required)

Run these anytime during development or pre-commit checks:

```bash
# 1. Frontend Offline Security & Logic Unit Tests (34 tests)
cd frontend
npm test

# 2. Backend Security & Business Logic Unit Tests (10 tests)
python -m unittest discover backend/tests

# 3. Anti-Spoofing & Liveness Fail-Closed Tests (12 tests)
python backend/test_antispoof.py

# 4. Safe Attendance Insert Schema Validator
python backend/test_insert.py
```

### Tier 2: End-to-End Live Security Suite (106 Tests)

Run this while the application is running via `./start.sh` on `http://localhost:3000`:

```bash
cd frontend
npm run test:security
```

**Verifies:**
- Missing & invalid credential rejections (HTTP 400 / 401).
- Removal of hardcoded/default passwords (roll number as password, default `123456` PIN).
- Database-backed Super Admin authentication & signed session cookie issuance.
- Role-based access control (RBAC) & role separation.
- Biometric affirmative consent & revocation erasure (DPDP Act 2023).
- Attendance schema constraints & faculty cross-session tampering protection.
- Geofence coordinate boundary validation & fail-closed persistence.
- Concurrency-safe atomic rate limiting & shared campus Wi-Fi IP isolation.
- Internal API key header enforcement (`X-Internal-API-Key`) & RTSP password masking.

---

## 4. Continuous Integration (GitHub Actions)

The repository includes a GitHub Actions workflow located at [`.github/workflows/ci.yml`](.github/workflows/ci.yml) that triggers automatically on every push or pull request to `main`:

- **Frontend Job:**
  - Installs npm dependencies (`npm ci`).
  - Validates Next.js compilation & TypeScript type safety (`npm run build`).
  - Runs offline security unit tests (`npm test`).
- **Backend Job:**
  - Sets up Python 3.11.
  - Runs backend unit tests (`python -m unittest discover backend/tests`).
  - Runs anti-spoofing and liveness tests (`python backend/test_antispoof.py`).
  - Validates schema insertion safety (`python backend/test_insert.py`).

Both jobs execute entirely without physical cameras, tunnels, or live production credentials.

---

## 5. Setting Up a Dedicated Staging / Test Database

If you wish to run end-to-end integration tests against an isolated test database:

1. Create a free test project in [Supabase](https://supabase.com).
2. Apply the database schema from [`database/schema.sql`](database/schema.sql).
3. Copy the test environment templates:
   ```bash
   cp backend/.env.test.example backend/.env.test
   cp frontend/.env.test.example frontend/.env.test
   ```
4. Fill in your test project's `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY`.
5. Run the live test suite against the test target:
   ```bash
   TEST_BASE_URL="http://localhost:3000" npm run test:security
   ```
