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
| `version` | `INTEGER` | `NOT NULL, UNIQUE` | Sequential migration number (e.g., `1`, `2`, ..., `19`) |
| `name` | `VARCHAR(255)` | `NOT NULL, UNIQUE` | Filename sans extension (e.g., `19_backfill_and_align_archive_flags`) |
| `checksum` | `VARCHAR(64)` | `NOT NULL` | Normalized SHA-256 hash of migration SQL content |
| `applied_at` | `TIMESTAMPTZ` | `NOT NULL, DEFAULT NOW()` | Exact timestamp when migration was committed |
| `execution_time_ms` | `INTEGER` | `NOT NULL, DEFAULT 0` | Execution latency in milliseconds |

#### 🛠️ Automated Migration CLI Utilities
- **Node.js Runner:** [scripts/migrate.mjs](file:///Users/saif/Desktop/Attendance/Attendance-app/scripts/migrate.mjs) (Callable via `npm run db:status`, `npm run db:migrate`, `npm run db:dry-run`, `npm run db:bundle`).
- **Python Runner:** [scripts/migrate.py](file:///Users/saif/Desktop/Attendance/Attendance-app/scripts/migrate.py) (Callable via `python3 scripts/migrate.py --status|--apply|--dry-run|--bundle|--create`).
- **1-Click macOS Launcher:** [Migrate_Database.command](file:///Users/saif/Desktop/Attendance/Attendance-app/Migrate_Database.command) (Interactive terminal runner for developers/administrators).
- **Consolidated SQL Bundle:** [database/combined_migrations_bundle.sql](file:///Users/saif/Desktop/Attendance/Attendance-app/database/combined_migrations_bundle.sql) (1-click copy-paste execution bundle for Supabase SQL Editor).

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
- **Architectural Mechanics (Ref: ADR-015):**
  - **Date-Range Windowing:** Supports optional `start_date` and `end_date` parameters filtering sessions by `date >= start_date AND date <= end_date` and attendance by `recorded_at >= start_date AND recorded_at <= end_date`.
  - **Parallel Query Execution (`Promise.all`):** Executes sessions, students, and academic curriculum queries concurrently, reducing API latency from ~1.2s down to **~370ms** (~70% improvement).
  - **Chunked Pagination Safeguard:** PostgREST automatically caps unpaginated result sets at 1,000 rows. To prevent silent truncation of historical attendance data as the registry scales past thousands of records, the endpoint implements an automated chunked window reader (`.range(from, from + 999)`) fetching all valid records up to a safety ceiling (50,000 records).
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
  "attendance": [
    {
      "session_id": "e4b6c31a-9f5e-4c7b-b841-8e8f8d9b1234",
      "student_id": "0221e62c-690d-4c93-9899-8cb26b4f68c5",
      "status": "Present",
      "capture_mode": "Live Scan",
      "recorded_at": "2026-10-28T10:02:15.123Z"
    }
  ],
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
    "total_attendance_records": 1,
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




