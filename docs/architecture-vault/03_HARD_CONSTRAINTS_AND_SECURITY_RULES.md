# 🔒 Hard Constraints & Security Rules
**Non-Negotiable Engineering Mandates • Ref: MEDATTEND-ARCH-003**

---

## ⚠️ Core Directive

The rules documented in this specification are **Hard Constraints**. Under no circumstances may any AI coding agent, developer, or administrator relax, comment out, bypass, or mock these constraints in production code. Any pull request or commit that violates these rules must be rejected immediately.

---

## 1. Non-Negotiable Security Rules

### Rule 1: Strict 5-Minute (300s) Attendance Countdown Window
- **Constraint:** Self-attendance via `/selfieattend` is strictly permissible only while `remaining_seconds > 0` and `is_expired === false`.
- **Implementation:**
  - Client countdown calculates: `elapsed = (nowUtc - startMs) / 1000`; `remaining = max(0, 300 - elapsed)`.
  - Server validation: FastAPI independently computes `elapsed_seconds = (now_utc - start_dt).total_seconds()`. If `elapsed_seconds > 300`, it throws `HTTP 403: "Attendance window has expired."`
- **Violation Guard:** Never increase the default window beyond 300 seconds without an explicit institutional directive and an accompanying ADR.

### Rule 2: Physical Geofence Classroom Presence
- **Constraint:** If `geofence.enabled === true`, the camera shutter **CANNOT** trigger and the backend **CANNOT** record attendance unless the device's physical GPS location is within `radiusMeters` (default 30m) of the session coordinates.
- **Implementation:**
  - Distance formula: Haversine geodesic calculation on both client (`calculateDistanceMeters`) and server (`calculate_haversine_distance`).
  - Fail-safe: If GPS permissions are denied or mock/corrupt coordinates are supplied, attendance is strictly rejected (`HTTP 403`).
- **Violation Guard:** Never bypass geofence checks by passing dummy coordinates (`0, 0`).

### Rule 3: Biometric Liveness & Anti-Spoofing Gates
- **Constraint:** Every incoming selfie must satisfy all three automated anti-spoofing criteria:
  1. **Active Eye Blink:** Client-side EAR dip (`open -> dip < 0.20 -> reopen`) verified before capture.
  2. **Laplacian Blur / Texture Check:** Variance of the Laplacian image must exceed `50.0`. Re-photographed phone screens, photocopies, and blurry snapshots are immediately rejected.
  3. **Face-to-Frame Area Ratio:** Bounding box area must occupy between `8%` (`0.08`) and `70%` (`0.70`) of the total frame.
- **Biometric Matching Threshold:** ArcFace 512D cosine similarity between live frame and registered template must be `>= 0.40`. Matches below 0.40 are rejected as impostors.

### Rule 4: Device Lock & Anti-Proxying Defense
- **Constraint:** A single physical smartphone/tablet cannot be used to submit attendance for multiple different students within the same active session.
- **Implementation:**
  - Client extracts a persistent hardware/browser fingerprint (`device_fingerprint`).
  - If a device fingerprint has already been recorded for Session `S` under Student `A`, any subsequent check-in attempt for Student `B` using the same device fingerprint within Session `S` is blocked (`HTTP 403: Proxy attendance detected`).

### Rule 5: Zero Raw Biometric Storage (DPDP Act 2023 Compliance)
- **Constraint:** Raw facial photographs uploaded during enrollment or daily attendance **MUST NEVER** be permanently stored in cloud buckets or relational database tables.
- **Implementation:**
  - Incoming frames are processed in-memory (RAM buffer) into 512-dimensional float32 vectors.
  - The in-memory image buffer is immediately discarded from memory after vector extraction.
  - Only mathematical vector arrays (`JSONB` in Supabase) are persisted. It is mathematically impossible to reconstruct a human face from a 512D unit vector.

### Rule 6: Inactive & Archived Profile Gatekeeping
- **Constraint:** Archived (`is_archived === true`) or inactive (`is_active === false`) students are strictly barred from participating in any attendance pathway.
- **Pathways Guarded:**
  1. Student login (`/api/auth/student-login`)
  2. Self-attendance portal (`/api/student-lookup`)
  3. Live CCTV scan (`/api/process-attendance`)
  4. Single selfie matching (`/api/selfie-attendance`)
  5. Biometric face enrollment (`/api/enroll-face`)
  6. Biometric burst enrollment (`/api/enroll-face-burst`)
  7. Manual attendance marking (`/api/attendance/manual`)
  8. Face status verification (`/api/students/[id]/face-status`)
  9. Public roster listing (`/api/students`)

### Rule 7: PostgreSQL Row-Level Security & Search Path Isolation
- **Constraint:** All custom PostgreSQL functions handling security, rate limiting, or audit events must explicitly set immutable search paths:
  ```sql
  SET search_path = public, pg_temp;
  ```
- **Permission Boundary:**
  - `REVOKE ALL ON FUNCTION ... FROM PUBLIC, anon, authenticated;`
  - `GRANT EXECUTE ON FUNCTION ... TO service_role;`
  - Direct updates to `audit_logs` are prohibited. The audit ledger is strictly append-only (SELECT and INSERT only).

### Rule 8: Zero-Secret Commitment Policy
- **Constraint:** Hardcoded secrets, API keys, database passwords, or JWT secrets are strictly prohibited in git commits.
- **Implementation:**
  - Secrets are supplied exclusively via `.env` (backend) and `.env.local` (frontend).
  - Minimum secret length for `INTERNAL_API_KEY` and session secrets is 32 alphanumeric characters.

### Rule 9: 3-Attempt Face Verification Failure Lockout Ceiling (60s Max)
- **Constraint:** Repeated face recognition mismatches on a single device for a specific student roll within an active session trigger an automatic rate-limit lockout capped strictly at **60 seconds** (`HTTP 429`).
- **Implementation:**
  - Tracked under Redis/Postgres atomic key `rl_fail:{session_id}:{clean_roll}:{client_ip}`.
  - On 3 consecutive failures, `locked_until = now_ts + 60.0`.
  - Any subsequent attempts during the active lockout throw `HTTP 429: Cooldown active: 3 failed face attempts recorded... Please wait {wait_seconds}s.` with `Retry-After: {wait_seconds}` header, where `wait_seconds = min(60, max(1, math.ceil(locked_until - now_ts)))`.
  - Client (`SelfieAttendClient.tsx`) initiates a 1-second live countdown ticker decrementing `cooldownSeconds` to 0, visually disables the retry button, and automatically unlocks upon expiry without page refresh.

### Rule 10: Student Registry Mutation Least-Privilege Role Isolation (RBAC)
- **Constraint:** Teaching Faculty members (`role: 'Faculty'`) are strictly prohibited from creating, updating, archiving, deleting, or purging student biometrics and credentials in the student registry.
- **Permission Matrix:**
  - `GET /api/students` & `GET /api/students/[id]`: Allowed for `Super Admin`, `Admin`, `Faculty` (essential for Live Scan matching, classroom attendance rosters, and student profile inspection).
  - `POST /api/students` (Create student): Restricted strictly to `Super Admin` and `Admin`.
  - `PUT /api/students/[id]` (Update student profile / roll / name): Restricted strictly to `Super Admin` and `Admin`.
  - `DELETE /api/students/[id]` (Soft-delete / archive student & purge biometrics): Restricted strictly to `Super Admin` and `Admin`.
  - `POST /api/students/bulk` (Bulk import & bulk archive / delete): Restricted strictly to `Super Admin` and `Admin`.
  - `POST /api/students/[id]/revoke-biometrics`: Restricted strictly to `Super Admin` and `Admin`.
  - `POST /api/students/[id]/reset-pin`: Restricted strictly to `Super Admin` and `Admin`.
- **Violation Guard:** Never grant `Faculty` role mutation or deletion capabilities on student records. Hiding UI elements is insufficient; least-privilege must be strictly enforced at the API route layer.

### Rule 11: Student PIN Change Sliding-Window Rate Limiting & Account Isolation
- **Constraint:** Repeated attempts to update student security access PINs via `POST /api/student/change-pin` must enforce strict atomic sliding-window rate limiting of maximum **5 attempts per 60 seconds** (`HTTP 429`).
- **Implementation:**
  - Tracked under atomic PostgreSQL RPC key `rl_pin_change:{studentIdentifier}` via `atomic_check_rate_limit` (with degraded in-memory fail-closed fallback).
  - Rate check is executed *before* performing computationally expensive `bcrypt.compare` operations to prevent computational Denial-of-Service (Bcrypt CPU exhaustion).
  - Exceeding 5 attempts within 60s returns `HTTP 429 Too Many Requests` with a dynamic `Retry-After: {remainingSeconds}` header and logs a `PIN_CHANGE_RATE_LIMITED` audit event in `audit_logs`.
  - Rate limiting key is strictly bound to the authenticated student identifier (`studentId` / `studentRoll`), ensuring complete account isolation—preventing campus Wi-Fi NAT collisions where innocent students sharing a public IP could otherwise be throttled.
  - Upon successful PIN verification and update, the rate limit key is immediately purged via `resetPinChangeRateLimit`.
- **Violation Guard:** Never remove rate limiting from credential/PIN modification endpoints or depend solely on frontend UI button disables.


