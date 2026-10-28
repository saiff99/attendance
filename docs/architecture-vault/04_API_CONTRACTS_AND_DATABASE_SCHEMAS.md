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
{Topic Name} [GPS:{lat},{lng},{radius},{enabled},{campusName}] [BY:{username}] [WA:{0|1}]
```
- Example: `Gross Anatomy Thorax [GPS:22.451550,88.172366,30,1,JIMSH%20Campus] [BY:dr_sharma] [WA:0]`
- Decoded via: `decodeSessionMetadata()` in `frontend/src/lib/geofence.ts`.

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

## 2. API Contract Specifications

### 2.1. `GET /api/active-sessions`
- **Caller:** Student Mobile Portal (`/selfieattend`) & Faculty Dashboard.
- **Cache Policy:** `Cache-Control: no-cache, no-store, must-revalidate` (Requires `_t=${Date.now()}`).
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

