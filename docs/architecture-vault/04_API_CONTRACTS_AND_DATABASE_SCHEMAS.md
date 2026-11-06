# 📋 API Contracts & Database Schemas
**Interface Specifications & Data Dictionary • Ref: MEDATTEND-ARCH-004**

---

## 1. Database Schema Specification (PostgreSQL / Supabase)

### 1.1. Table: `sessions` (Class Sessions)
Tracks individual lecture periods, target student cohorts, duration windows, and dynamic GPS metadata.

| Column Name | Data Type | Constraints | Description |
| :--- | :--- | :--- | :--- |
| `id` | `UUID` | `PRIMARY KEY, DEFAULT gen_random_uuid()` | Unique session identifier |
| `class_name` | `VARCHAR(255)` | `NOT NULL` | Course or lecture name (e.g., "Human Anatomy - Batch A") |
| `date` | `DATE` | `NOT NULL, DEFAULT CURRENT_DATE` | Date of the lecture (`YYYY-MM-DD`) |
| `start_time` | `TIMESTAMPTZ` | `NOT NULL, DEFAULT NOW()` | Session opening timestamp (5-minute countdown starts) |
| `end_time` | `TIMESTAMPTZ` | `NULLABLE` | Formal session termination timestamp |
| `instructor_name`| `TEXT` | `NULLABLE` | Composite string storing topic, creator, & GPS metadata tags |
| `target_academic_year` | `VARCHAR(50)` | `NOT NULL, DEFAULT '1st Year'` | Eligible cohort (`1st Year`, `2nd Year`, `3rd Year`, `4th Year`) |
| `is_archived` | `BOOLEAN` | `NOT NULL, DEFAULT FALSE` | Soft deletion status |
| `archived_at` | `TIMESTAMPTZ` | `NULLABLE` | Timestamp when session was archived |
| `created_at` | `TIMESTAMPTZ` | `NOT NULL, DEFAULT NOW()` | Audit timestamp |

#### 🏷️ Composite Tag Format in `instructor_name`
To maintain seamless cross-version compatibility without altering legacy database columns, instructors' session metadata is encoded as follows:
```
{Topic Name} [GPS:{lat},{lng},{radius},{enabled},{campusName}] [BY:{username}]
```
- Example: `Gross Anatomy Thorax [GPS:22.451550,88.172366,30,1,JIMSH%20Campus] [BY:dr_sharma]`
- Decoded via: `decodeSessionMetadata()` in `frontend/src/lib/geofence.ts` (automatically strips any historical legacy tags).

---

### 1.2. Table: `students` (Student Profiles & Biometric Embeddings)
Stores verified student roster and 512-dimensional ArcFace biometric vectors.

| Column Name | Data Type | Constraints | Description |
| :--- | :--- | :--- | :--- |
| `id` | `UUID` | `PRIMARY KEY, DEFAULT gen_random_uuid()` | Permanent student identifier |
| `student_roll` | `VARCHAR(50)` | `NOT NULL, UNIQUE` | Institutional roll number (e.g., `26002`) |
| `full_name` | `VARCHAR(255)` | `NOT NULL` | Full registered name |
| `academic_year`| `VARCHAR(50)` | `NOT NULL, DEFAULT '1st Year'` | Enrolled academic year |
| `face_embedding`| `JSONB` | `NULLABLE` | ArcFace 512-dimensional vector array (`[float, ...]`) |
| `has_face_enrolled` | `BOOLEAN`| `NOT NULL, DEFAULT FALSE` | Biometric enrollment flag |
| `is_active` | `BOOLEAN` | `NOT NULL, DEFAULT TRUE` | Status flag; `false` blocks all check-in portals |
| `is_archived` | `BOOLEAN` | `NOT NULL, DEFAULT FALSE` | Soft delete flag |
| `archived_at` | `TIMESTAMPTZ` | `NULLABLE` | Timestamp when student was archived |
| `created_at` | `TIMESTAMPTZ` | `NOT NULL, DEFAULT NOW()` | Record creation timestamp |

---

### 1.3. Table: `attendance` (Relational Attendance Records)
Records immutable verified attendance events with foreign key protection.

| Column Name | Data Type | Constraints | Description |
| :--- | :--- | :--- | :--- |
| `id` | `UUID` | `PRIMARY KEY, DEFAULT gen_random_uuid()` | Unique record identifier |
| `session_id` | `UUID` | `NOT NULL, REFERENCES sessions(id) ON DELETE RESTRICT` | Associated session |
| `student_id` | `UUID` | `NOT NULL, REFERENCES students(id) ON DELETE RESTRICT` | Verified student |
| `capture_mode` | `VARCHAR(50)` | `NOT NULL, DEFAULT 'CCTV'` | `Selfie`, `CCTV`, or `Manual` |
| `confidence` | `FLOAT` | `NULLABLE` | AI cosine similarity score (e.g., `0.7728`) |
| `device_fingerprint` | `TEXT` | `NULLABLE` | Unique hardware/browser hash preventing proxy submissions |
| `created_at` | `TIMESTAMPTZ` | `NOT NULL, DEFAULT NOW()` | Exact timestamp when attendance was recorded |

- **Composite Integrity Constraint:** `UNIQUE (session_id, student_id)` prevents double-counting attendance for the same student in a single lecture.

---

### 1.4. Table: `audit_logs` (Forensic Security Ledger)
Append-only immutable record of all administrative, biometric, and security actions.

| Column Name | Data Type | Constraints | Description |
| :--- | :--- | :--- | :--- |
| `id` | `UUID` | `PRIMARY KEY, DEFAULT gen_random_uuid()` | Audit event identifier |
| `actor_id` | `VARCHAR(255)` | `NOT NULL` | Username or system actor performing action |
| `action` | `VARCHAR(100)` | `NOT NULL` | Event type (e.g., `START_SESSION`, `SELFIE_ATTENDANCE_SUCCESS`) |
| `target_type` | `VARCHAR(50)` | `NOT NULL` | Entity category (`session`, `student`, `attendance`, `system`) |
| `target_id` | `VARCHAR(255)` | `NULLABLE` | Primary key of affected resource |
| `details` | `JSONB` | `NOT NULL, DEFAULT '{}'` | Structured event context (IP, user agent, changes) |
| `created_at` | `TIMESTAMPTZ` | `NOT NULL, DEFAULT NOW()` | ISO timestamp |

---

### 1.5. Table: `_migrations` (Authoritative Migration Ledger & Schema History)
Tracks all executed schema migrations, SHA-256 integrity checksums, and execution latency.

| Column Name | Data Type | Constraints | Description |
| :--- | :--- | :--- | :--- |
| `id` | `SERIAL` | `PRIMARY KEY` | Auto-incrementing internal migration counter |
| `version` | `INTEGER` | `NOT NULL, UNIQUE` | Sequential migration number (e.g., `1`, `2`, ..., `20`) |
| `name` | `VARCHAR(255)` | `NOT NULL, UNIQUE` | Filename sans extension (e.g., `20_high_velocity_partial_composite_indexes`) |
| `checksum` | `VARCHAR(64)` | `NOT NULL` | Normalized SHA-256 hash of migration SQL content |
| `applied_at` | `TIMESTAMPTZ` | `NOT NULL, DEFAULT NOW()` | Exact timestamp when migration was committed |
| `execution_time_ms` | `INTEGER` | `NOT NULL, DEFAULT 0` | Execution latency in milliseconds |

#### 🛠️ Automated Migration CLI Utilities
- **Node.js Runner:** [scripts/migrate.mjs](file:///Users/saif/Desktop/Attendance/Attendance-app/scripts/migrate.mjs) (Callable via `npm run db:status`, `npm run db:migrate`, `npm run db:dry-run`, `npm run db:bundle`).
- **Python Runner:** [scripts/migrate.py](file:///Users/saif/Desktop/Attendance/Attendance-app/scripts/migrate.py) (Callable via `python3 scripts/migrate.py --status|--apply|--dry-run|--bundle|--create`).
- **1-Click macOS Launcher:** [Migrate_Database.command](file:///Users/saif/Desktop/Attendance/Attendance-app/Migrate_Database.command) (Interactive terminal runner for developers/administrators).
- **Consolidated SQL Bundle:** [database/combined_migrations_bundle.sql](file:///Users/saif/Desktop/Attendance/Attendance-app/database/combined_migrations_bundle.sql) (1-click copy-paste execution bundle for Supabase SQL Editor).

---

### 1.6. High-Velocity Partial & Composite Performance Indexes (Migration 20)
Specialized B-Tree indexes designed for real-time edge polling, student portal history scans, and centralized biometric retrieval.

| Index Identifier | Target Table | Columns & Expressions | Predicate (WHERE Clause) | Optimization Purpose |
| :--- | :--- | :--- | :--- | :--- |
| `idx_sessions_active_created` | `sessions` | `(created_at DESC)` | `WHERE is_archived = false` | Slashes active session polling latency to <1ms by isolating unarchived rows in a tiny <10KB tree. |
| `idx_attendance_student_recorded` | `attendance` | `(student_id, recorded_at DESC)` | *None (Composite)* | Fulfills student portal history and report ordering via Index-Only Scans with zero heap reads. |
| `idx_students_active_biometric_cohort` | `students` | `(academic_year)` | `WHERE is_active = true AND biometric_consent = true AND face_encoding IS NOT NULL` | Accelerates centralized biometric cache warming for active consented student cohorts. |
| `idx_sessions_is_archived` | `sessions` | `(is_archived)` | *None* | Baseline soft-delete index alignment across session listings. |
| `idx_students_is_active` | `students` | `(is_active)` | *None* | Baseline roster isolation index filtering inactive or graduated students. |

---

### 1.7. Server-Side Attendance Aggregation RPC & Index (Migration 21)
High-performance PostgreSQL stored procedure and composite index replacing sequential 50,000-row chunked attendance fetching in reports (Ref: ADR-032).

#### Function: `public.get_attendance_summary(p_start_date TIMESTAMPTZ DEFAULT NULL, p_end_date TIMESTAMPTZ DEFAULT NULL)`
- **Security:** `SECURITY DEFINER`, `SET search_path = public`. Executable by `authenticated` and `service_role`.
- **Return Type:** `TABLE (student_id UUID, present BIGINT, manual BIGINT, attended_session_ids UUID[], last_attended_at TIMESTAMPTZ)`
- **Aggregations:**
  - `present`: `COUNT(*) FILTER (WHERE a.status = 'Present')`
  - `manual`: `COUNT(*) FILTER (WHERE a.status = 'Present' AND (a.capture_mode = 'Manual Upload' OR a.capture_mode = 'Manual Entry'))`
  - `attended_session_ids`: `COALESCE(ARRAY_AGG(DISTINCT a.session_id) FILTER (WHERE a.status = 'Present' AND a.session_id IS NOT NULL), ARRAY[]::UUID[])`
  - `last_attended_at`: `MAX(a.recorded_at) FILTER (WHERE a.status = 'Present')`
- **Group By:** `a.student_id` with optional date pushdown `(p_start_date IS NULL OR a.recorded_at >= p_start_date) AND (p_end_date IS NULL OR a.recorded_at <= p_end_date)`.

| Index Identifier | Target Table | Columns | Type | Purpose |
| :--- | :--- | :--- | :--- | :--- |
| `idx_attendance_recorded_status` | `attendance` | `(recorded_at, status)` | B-Tree | Optimizes date-range filtered attendance aggregation in `get_attendance_summary`. |


---

## 2. API Contract Specifications

### 2.1. `GET /api/active-sessions`
- **Caller:** Student Mobile Portal (`/selfieattend`) & Faculty Dashboard.
- **Cache Policy:** `Cache-Control: no-cache, no-store, must-revalidate` (Requires `_t=${Date.now()}` on manual refresh). Static `app_users` role mapping cached in-memory on Next.js server for 5 minutes (`USER_MAP_TTL_MS = 300000`) to eliminate redundant SQL queries.
- **Client Polling Policy:** Must be guarded by `document.visibilityState === 'visible'`. Background polling is suppressed when tab is hidden/minimized; instant `0ms` synchronization executed upon `visibilitychange` focus. Interval set to 12s on global sidebar and 6s on active ongoing monitor.
- **Rate Limit:** 30 requests / minute per client IP.
- **Response Payload (`200 OK`):**
```json
{
  "success": true,
  "sessions": [
    {
      "id": "e4b6c31a-9f5e-4c7b-b841-8e8f8d9b1234",
      "class_name": "Gross Anatomy - Lecture 4",
      "date": "2026-10-28",
      "start_time": "2026-10-28T10:00:00.000Z",
      "instructor_name": "Dr. S. Sharma",
      "target_academic_year": "1st Year",
      "remaining_seconds": 240,
      "is_expired": false,
      "window_duration_seconds": 300,
      "checkin_token": "e4b6c31a...:1761646200:a7b8c9d...",
      "geofence": {
        "latitude": 22.451550,
        "longitude": 88.172366,
        "radiusMeters": 30,
        "enabled": true,
        "campusName": "JIMSH Lecture Hall 1"
      }
    }
  ]
}
```

---

### 2.2. `GET /api/student-lookup/{roll}`
- **Caller:** Student Roll Lookup Form.
- **Headers Required:** `X-Checkin-Token: {checkin_token}`
- **Rate Limit:** 15 requests / minute per client IP.
- **Response Payload (`200 OK`):**
```json
{
  "success": true,
  "student": {
    "id": "a1b2c3d4-0000-0000-0000-111122223333",
    "student_roll": "26002",
    "full_name": "SK SAIFUDDIN",
    "academic_year": "1st Year",
    "has_face_enrolled": true,
    "is_already_present": false,
    "can_checkin": true
  },
  "checkin_token": "e4b6c31a...:1761646200:26002:c4d5e6..."
}
```

---

### 2.3. `POST /api/selfie-attendance` (FastAPI AI Engine)
- **Caller:** Next.js Server / Student Client via Cloudflare Tunnel.
- **Content-Type:** `multipart/form-data`
- **Fields:**
  - `file`: Compressed image binary (`<200 KB` JPEG/WebP).
  - `student_roll`: String (e.g., `26002`).
  - `session_id`: UUID string.
  - `checkin_token`: HMAC-SHA256 Capability Token.
  - `latitude`: Float (Device GPS latitude).
  - `longitude`: Float (Device GPS longitude).
  - `device_fingerprint`: String (Hardware/browser fingerprint).
- **Success Response (`200 OK`):**
```json
{
  "success": true,
  "already_marked": false,
  "student_name": "SK SAIFUDDIN",
  "student_roll": "26002",
  "academic_year": "1st Year",
  "confidence": 0.7728,
  "recorded_at": "2026-10-28T10:02:15.123Z",
  "message": "Selfie attendance verified & marked successfully!"
}
```
- **Error Responses:**
  - `403 Forbidden`: Geofence boundary exceeded, window expired, face similarity `< 0.40`, or proxy device detected.
  - `422 Unprocessable`: No face detected or multiple faces in camera frame.
  - `429 Too Many Requests`: 3 consecutive failed face attempts on this device triggers temporary cooldown (`Retry-After: {wait_seconds}` capped at 60s max).

---

### 2.4. `GET /api/audit-logs` (Forensic Security Ledger & Tamper-Evident Verification)
- **Caller:** Super Admin Audit Portal (`/audit-logs`) & Institutional Compliance Exporters.
- **Access Control:** Restricted strictly to authenticated `Super Admin` role via `verifySessionToken()`.
- **Query Parameters:**
  - `start_date` *(optional)*: Filter events created on or after date/timestamp (`YYYY-MM-DD` or ISO string).
  - `end_date` *(optional)*: Filter events created on or before date/timestamp (`YYYY-MM-DD` or ISO string).
  - `action` *(optional)*: Filter by event action type (e.g., `START_SESSION`, `SELFIE_ATTENDANCE_SUCCESS`, `BULK_STUDENT_IMPORT`).
  - `target_type` *(optional)*: Filter by target resource entity (`session`, `student`, `attendance`, `system`).
  - `limit` *(optional, default: `500`, max: `2000`)*: Maximum records retrieved per query.
- **Forensic Checksum Calculation:**
  - Computes a deterministic SHA-256 cryptographic digest across the JSON serialized log array using Node.js standard `crypto`:
    ```ts
    const checksum = crypto.createHash("sha256").update(JSON.stringify(logs)).digest("hex");
    ```
  - Enables instant cryptographic verification of ledger integrity against offline archives and regulatory audits.
- **Export Standards:**
  - Institutional CSV export embeds Excel UTF-8 Byte Order Mark (`\uFEFF`) preventing script/character corruption in spreadsheet tools.
  - Header metadata section embeds generation timestamp, exporting administrator identity, query window, and live SHA-256 ledger fingerprint.
- **Response Payload (`200 OK`):**
```json
{
  "success": true,
  "logs": [
    {
      "id": "c1f7a4e9-1234-5678-90ab-cdef12345678",
      "actor_id": "dr_sharma",
      "action": "START_SESSION",
      "target_type": "session",
      "target_id": "e4b6c31a-9f5e-4c7b-b841-8e8f8d9b1234",
      "details": {
        "ip": "203.0.113.195",
        "class_name": "Gross Anatomy - Lecture 4",
        "academic_year": "1st Year"
      },
      "created_at": "2026-10-28T10:00:00.000Z"
    }
  ],
  "count": 1,
  "checksum": "a8f5b2c4d9e1f0a2b3c4d5e6f7a8b9c0d1e2f3a4b5c6d7e8f9a0b1c2d3e4f5a6"
}
```
- **Error Responses:**
  - `401 Unauthorized`: Session token missing or invalid.
  - `403 Forbidden`: Authenticated user does not possess `Super Admin` privileges.
  - `500 Internal Server Error`: Database query failure.

---

### 2.5. `GET /api/students` & `GET /api/students/{id}` (Student Registry & Biometric Minimization)
- **Callers:** Admin Student Management Directory (`/students`), Profile Modal, and Student Detail View.
- **Access Control:** Restricted strictly to authenticated `Super Admin`, `Admin`, or `Faculty` roles via `verifySessionToken()`.
- **Zero-Trust Biometric Minimization (Ref: ADR-014):**
  - **Omission of Raw 512D Biometric Embeddings:** Raw InsightFace 512-dimensional floating-point vectors (`face_encoding`) are strictly omitted from both the PostgreSQL database queries and the JSON API response contracts.
  - **Parallel ID-Only Enrollment Verification:** Rather than downloading multi-megabyte JSON arrays of raw unit vectors, the API executes parallel lightweight queries:
    ```typescript
    const [studentsRes, enrolledRes] = await Promise.all([
      supabaseServer.from('students').select('id, student_roll, full_name, email, academic_year, is_active, archived_at, created_at, biometric_consent').order('student_roll'),
      supabaseServer.from('students').select('id').not('face_encoding', 'is', null)
    ]);
    ```
  - **Bandwidth Reduction:** Shrinks network payload size from ~3 MB–5 MB down to **~35 KB** (a **~98% reduction** across 300+ students).
  - **Client Representation:** The client receives a boolean enrollment indicator (`has_face: boolean` and `face_encoding: boolean | null`), ensuring full compatibility with existing UI badge states without ever exposing raw biometric templates to web clients.
- **Query Parameters for `GET /api/students`:**
  - `cohort` *(optional)*: Filter by target academic year (`1st Year`, `2nd Year`, etc., or `All`).
  - `include_archived` *(optional, default: `false`)*: When `true`, includes soft-deleted/archived students.
- **Response Payload (`200 OK`):**
```json
{
  "success": true,
  "students": [
    {
      "id": "0221e62c-690d-4c93-9899-8cb26b4f68c5",
      "student_roll": "26002",
      "full_name": "SK SAIFUDDIN",
      "email": "26002__p919876543210@student.local",
      "academic_year": "1st Year",
      "parent_phone": "919876543210",
      "created_at": "2026-10-28T10:00:00.000Z",
      "has_face": true,
      "face_encoding": true
    }
  ]
}
```
- **Error Responses:**
  - `401 Unauthorized`: Session token missing or invalid.
  - `403 Forbidden`: Authenticated user does not possess administrative or faculty permissions.
  - `404 Not Found`: Student not found (in single student route).
  - `500 Internal Server Error`: Database query failure.

---

### 2.6. `GET /api/reports` (Academic Attendance Reports & Analytical Aggregation)
- **Callers:** Institutional Reports Portal (`/reports`) & Administrative CSV Exporter.
- **Access Control:** Restricted strictly to authenticated `Super Admin` and `Admin` roles via `verifySessionToken()`.
- **Architectural Mechanics (Ref: ADR-015, ADR-032):**
  - **Date-Range Windowing:** Supports optional `start_date` and `end_date` parameters filtering sessions by `date >= start_date AND date <= end_date` and attendance by `recorded_at >= start_date AND recorded_at <= end_date`.
  - **Parallel Query Execution (`Promise.all`):** Executes sessions, students, dynamic subjects, and attendance aggregation concurrently.
  - **Server-Side Aggregation RPC (ADR-032):** Executes PostgreSQL stored procedure `get_attendance_summary(p_start_date, p_end_date)`. This delivers pre-aggregated per-student attendance counts (`present`, `manual`, `attended_session_ids`, `last_attended_at`), shrinking response payloads from ~20MB of raw JSON to ~40KB (99.7% network reduction) with sub-15ms execution.
  - **Chunked Pagination Resilient Fallback:** If the RPC function is unavailable, the endpoint automatically falls back to sequential chunked pagination (`.range(from, from + 999)`) up to 50,000 records to ensure zero interruption of reporting services.
  - **Cohort Scoping:** Filters sessions and students at the query layer when `cohort` is specified, eliminating unneeded data transfer for other academic batches.
- **Query Parameters:**
  - `start_date` *(optional)*: Filter events on or after date (`YYYY-MM-DD` or ISO string).
  - `end_date` *(optional)*: Filter events on or before date (`YYYY-MM-DD` or ISO string).
  - `cohort` *(optional)*: Filter by target academic year (`1st Year`, `2nd Year`, etc., or `all`).
  - `include_archived` *(optional, default: `false`)*: Includes archived students and sessions.
- **Response Payload (`200 OK`):**
```json
{
  "success": true,
  "sessions": [
    {
      "id": "e4b6c31a-9f5e-4c7b-b841-8e8f8d9b1234",
      "class_name": "Gross Anatomy - Lecture 4",
      "date": "2026-10-28",
      "start_time": "2026-10-28T10:00:00.000Z",
      "target_academic_year": "1st Year",
      "is_archived": false,
      "archived_at": null
    }
  ],
  "students": [
    {
      "id": "0221e62c-690d-4c93-9899-8cb26b4f68c5",
      "student_roll": "26002",
      "full_name": "SK SAIFUDDIN",
      "email": "26002__p919876543210@student.local",
      "academic_year": "1st Year",
      "is_active": true,
      "archived_at": null
    }
  ],
  "attendance_summary": [
    {
      "student_id": "0221e62c-690d-4c93-9899-8cb26b4f68c5",
      "present": 12,
      "manual": 1,
      "attended_session_ids": ["e4b6c31a-9f5e-4c7b-b841-8e8f8d9b1234"],
      "last_attended_at": "2026-10-28T10:02:15.123Z"
    }
  ],
  "attendance": [],
  "subjects": [
    {
      "id": "s1",
      "name": "Anatomy",
      "code": "ANA101",
      "academic_year": "1st Year",
      "department": "Pre-Clinical",
      "is_active": true
    }
  ],
  "metadata": {
    "total_sessions": 1,
    "total_students": 1,
    "total_attendance_records": 12,
    "aggregated_server_side": true,
    "start_date": "2026-10-01",
    "end_date": "2026-10-31",
    "cohort": "1st Year"
  }
}
```
- **Error Responses:**
  - `401 Unauthorized`: Session cookie missing or invalid.
  - `403 Forbidden`: Authenticated user lacks administrative privileges.
  - `500 Internal Server Error`: Database query failure.

---

### 2.7. `POST /api/process-attendance` (Classroom Photo Face Matching & Atomic Batch Ingestion)
- **Caller:** Next.js authenticated proxy (`live-scan/page.tsx`).
- **Authorization:** Strictly restricted to Super Admin, Admin, and Faculty roles (`is_authorized_request`). Rejects unauthenticated callers with `401` and unauthorized roles with `403`.
- **Ingestion Mode:** Multipart form-data containing:
  - `file`: High-resolution classroom photograph (`MAX_CLASSROOM_IMAGE_SIZE = 15 MB`).
  - `session_id`: Active lecture session UUID.
- **Biometric Matching Pipeline:**
  1. InsightFace detection identifies all face regions in BGR image (`det_thresh = 0.15`, `det_size = 640x640`).
  2. In-memory biometric cache (`ADR-013`) resolves enrolled student vectors for the session cohort.
  3. Accelerated NumPy 2D matrix multiplication (`ADR-012`) matches all detected faces simultaneously.
- **Database Persistence Contract (`ADR-017`):**
  - Executes a single atomic PostgREST batch upsert: `supabase.table("attendance").upsert(batch_payload, on_conflict="session_id,student_id").execute()`.
  - Replaces legacy N+1 sequential loops, reducing database latency from 8,000–15,000ms down to ~80ms.
  - Automatically deduplicates and updates existing attendance rows without data pollution.
  - Features fault-tolerant individual retry fallback in case of payload size exceptions.
- **Response Payload (`200 OK`):**
```json
{
  "success": true,
  "message": "Processed image. Recognized 48 students.",
  "recognized": [
    {
      "name": "Rahim Ahmed",
      "confidence": 0.94
    },
    {
      "name": "Fatima Begum",
      "confidence": 0.89
    }
  ],
  "ai_used": true
}
```
- **Audit Logging:** Emits `CLASSROOM_PHOTO_ATTENDANCE_PROCESSED` audit event to `audit_logs` ledger detailing session ID, recognized student count, and faculty actor.

---

### 2.8. `GET /api/attendance/session/{sessionId}` (Live Attendance Logs & Incremental Delta Polling)
- **Caller:** Live Scan Dashboard (`/live-scan` grid & CCTV monitoring) & Report Generator (`DownloadReportButton`).
- **Authorization:** `Super Admin`, `Admin`, or session-owning `Faculty` (enforced via `isFacultyAuthorizedForSession`). Unauthorized faculty access triggers `403 Forbidden` and emits `UNAUTHORIZED_SESSION_ACCESS_REJECTED` audit log.
- **Query Parameters:**
  - `since` *(optional, ISO 8601 string)*: When provided, filters logs via PostgreSQL `.gt('recorded_at', since)`. Used by client polling loops to retrieve only delta records.
- **Client Polling Contract (`ADR-035`):**
  - Polling interval throttled to 4 seconds while document is visible; pauses completely when tab is hidden or minimized.
  - Client maintains `lastRecordedAtRef`. Idle ticks return empty logs array (`logs: []`), completely bypassing client DOM re-renders.
  - Full sync triggered on mount, session switch, tab refocus (`visibilitychange`), and periodically every 60 seconds (15 ticks).
- **Response Payload (`200 OK`):**
```json
{
  "success": true,
  "logs": [
    {
      "id": "c1d2e3f4-5678-90ab-cdef-1234567890ab",
      "student_id": "a1b2c3d4-0000-0000-0000-111122223333",
      "session_id": "e4b6c31a-9f5e-4c7b-b841-8e8f8d9b1234",
      "status": "Present",
      "capture_mode": "Selfie Scan",
      "recorded_at": "2026-11-06T10:01:00.000Z",
      "confidence_score": 0.94,
      "students": {
        "id": "a1b2c3d4-0000-0000-0000-111122223333",
        "student_roll": "26002",
        "full_name": "SK SAIFUDDIN",
        "email": "saif@example.com"
      }
    }
  ],
  "is_delta": true
}
```






