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

