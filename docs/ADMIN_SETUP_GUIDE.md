# 🛠️ MedAttend AI — System Administrator & IT Hardware Guide

This guide is designed for **College IT Engineers, System Administrators, and Institutional Super Admins** responsible for deploying, maintaining, and configuring the MedAttend AI attendance infrastructure.

---

## 📑 Table of Contents

1. [Architectural Overview & Server Deployment](#1-architectural-overview--server-deployment)
2. [Staff & Faculty Account Governance (`/users`)](#2-staff--faculty-account-governance-users)
   - [3-Tier Role Hierarchy](#3-tier-role-hierarchy)
   - [Adding & Editing Staff Accounts](#adding--editing-staff-accounts)
   - [Bulletproof Administrator Lockout Guardrails](#bulletproof-administrator-lockout-guardrails)
3. [Centralized MBBS Academic Curriculum Governance](#3-centralized-mbbs-academic-curriculum-governance)
4. [Multi-Camera CCTV RTSP & ONVIF PTZ Configuration](#4-multi-camera-cctv-rtsp--onvif-ptz-configuration)
   - [Dual-Stream Camera Topology](#dual-stream-camera-topology)
   - [Auditorium Camera Layout & Placement](#auditorium-camera-layout--placement)
   - [Configuring `.env` Stream Endpoints](#configuring-env-stream-endpoints)
5. [Classroom GPS Geofencing & Radar Calibration](#5-classroom-gps-geofencing--radar-calibration)
6. [24/7 Cloud Failover & Hybrid Resilience (Hugging Face Spaces)](#6-247-cloud-failover--hybrid-resilience-hugging-face-spaces)
7. [Meta WhatsApp Cloud API Configuration](#7-meta-whatsapp-cloud-api-configuration)
8. [Security Audit Logs & Compliance Monitoring (`/audit-logs`)](#8-security-audit-logs--compliance-monitoring-audit-logs)

---

## 1. Architectural Overview & Server Deployment

MedAttend employs a high-performance **hybrid architecture**:
- **Local On-Premises Server**: Executes heavy multi-camera RTSP decoding and InsightFace ArcFace 512D facial recognition using CoreML (macOS) or CUDA/ONNX (Linux/Windows).
- **Cloud Failover Layer (Hugging Face Spaces)**: Handles 24/7 student portal access, PIN resets, and mobile GPS selfie check-ins when the local hardware is shut down.
- **Supabase PostgreSQL**: Central cloud database for biometrics, student rosters, academic curricula, and immutable audit trails.

### Production Startup
To launch both the FastAPI backend and Next.js production frontend with automated port clearing and watchdog monitoring:
```bash
chmod +x start.sh
./start.sh
```

### Hardware Sizing & Recommended Specifications (300+ Students Cohort)
To guarantee high-recall face recognition across multiple simultaneous 4K/1080p RTSP camera streams in large tiered lecture halls:

| Component | Minimum Specification (1–2 Cameras) | Recommended Specification (6 Cameras, 300+ Cohort) |
| :--- | :--- | :--- |
| **Processor (CPU)** | 6-Core Intel Core i5 / AMD Ryzen 5 / Apple M1 | 8–16 Core Intel Core i7/i9 (12th Gen+) / AMD Ryzen 7/9 / Apple M2/M3/M4 |
| **GPU Acceleration** | Integrated GPU / Neural Engine | **Dedicated NVIDIA GPU (RTX 3060 12GB / RTX 4060 / A2000+)** with CUDA 12.x or Apple Silicon Neural Engine |
| **RAM** | 16 GB DDR4/LPDDR5 | **32 GB DDR5** (Ensures smooth concurrent Next.js, Uvicorn, and WhatsApp runtime) |
| **Networking** | 100 Mbps Fast Ethernet | **Dedicated Gigabit Ethernet Switch (Cat6 cabling)**. *RTSP video streams must not run over Wi-Fi to eliminate packet jitter.* |
| **Storage** | 256 GB SSD | 512 GB NVMe PCIe 4.0 SSD |

### Distributed Multi-Worker State Architecture & Cache Lifecycle
When deploying MedAttend across multiple processes, container instances, or load-balanced nodes:

1. **Volatile Local Memory (Per-Worker)**:
   - RTSP frame buffers (`numpy.ndarray`) and live RetinaFace detection grids are held in volatile RAM for $< 100$ms before being discarded.
   - Facial feature vector matrices (`session_matrix_cache`) use an automatic **60-second Time-to-Live (TTL)**.
2. **Centralized Shared State (Database Layer)**:
   - **Attendance Deduplication**: Enforced via PostgreSQL `CONSTRAINT unique_session_student UNIQUE (session_id, student_id)`. Parallel requests across instances cannot create duplicate records.
   - **Persistent Rate Limiting & Device Fingerprints**: Centrally synchronized in the `public.settings` table and Supabase cache.
3. **Biometric Erasure & Consent Revocation Lifecycle**:
   - When consent is revoked (`POST /api/students/{id}/revoke-biometrics`), the student's vector embedding is set to `NULL` in the database immediately.
   - The serving instance purges its local cache instantly; peer instances drop the embedding automatically upon their 60-second TTL expiry. Furthermore, database-level constraint validation prevents unconsented attendance insertion.

---

## 2. Staff & Faculty Account Governance (`/users`)

### 3-Tier Role Hierarchy

| Role | Permissions & Access Boundaries |
| :--- | :--- |
| **Super Admin** | Full institutional governance. Can create, edit, and deactivate other Admins, configure subjects, and review all security audit logs. |
| **Admin** | Day-to-day operations. Can manage Faculty accounts, configure MBBS curriculum subjects, and initiate sessions across all years. *Zero-Trust*: Cannot view or modify Super Admins. |
| **Faculty** | Session-isolated access. Conducts attendance sessions for assigned subjects only. Cannot access `/users` or institutional settings. |

### Adding & Editing Staff Accounts

1. Navigate to **User Management** (`/users`) as an Admin or Super Admin.
2. Under the **Staff & Faculty Directory** tab:
   - **To Create a User**: Click **Add New Staff**, fill in Full Name, Username, Department, Email, Role (`Faculty`, `Admin`, or `Super Admin`), and temporary password.
   - **To Edit a User**: Click the **Edit (Pencil)** icon on any user row. Update Full Name, Username, Department, Email, or Role. Optionally enter a new password to reset their credentials.
3. **Username Validation**:
   - Must be 3–30 characters long.
   - Permitted characters: letters, numbers, dots, underscores, and hyphens (`/^[a-zA-Z0-9._-]{3,30}$/`).
   - Automatically converted to lowercase; duplicate usernames are rejected by database uniqueness constraints.

### Bulletproof Administrator Lockout Guardrails

To prevent accidental institutional paralysis or administrative lockouts, MedAttend enforces a **Three-Layer Safety Guardrail**:

```
                                  🛡️ 3-LAYER LOCKOUT PROTECTION
                                
   [Layer 1: Self-Action Guard]       [Layer 2: Root Admin Lock]       [Layer 3: Last Super Admin]
   Current user cannot delete or      Root account 'admin' is          System enforces minimum 1
   deactivate themselves. Displays    permanently protected from       active Super Admin at all
   an intuitive "You" badge.          deletion or renaming.            times. Demotion blocked.
```

1. **Self-Action Immunity**:
   - The logged-in administrator is visually designated with a `You` badge.
   - Deletion and deactivation buttons are disabled for their own account to prevent accidental self-lockout.
2. **Root Admin Immunity**:
   - The primary built-in root account (`admin` / `is_builtin === true`) is permanently locked in both frontend and backend.
   - Cannot be deleted, deactivated, or renamed under any circumstance.
3. **Last Active Super Admin Guardrail**:
   - Before any Super Admin deletion, deactivation, or role demotion occurs, the backend queries the database for total active Super Admins.
   - If $\le 1$ remains, the operation is rejected (`400: Cannot delete/deactivate the only remaining Super Admin account`).

---

## 3. Centralized MBBS Academic Curriculum Governance

In institutional healthcare environments, syllabus compliance is vital. MedAttend eliminates fragmented or misspelled custom subjects through **Centralized Curriculum Configuration**:

1. Navigate to `/users` and select the **Academic Subjects & Curriculum** tab.
2. Configure subjects categorized by academic year:
   - **1st Year MBBS**: e.g., *Human Anatomy*, *Physiology*, *Biochemistry*.
   - **2nd Year MBBS**: e.g., *Pathology*, *Microbiology*, *Pharmacology*.
   - **3rd Year MBBS (Part 1)**: e.g., *Community Medicine*, *Ophthalmology*, *ENT*.
   - **4th Year MBBS (Part 2)**: e.g., *General Medicine*, *General Surgery*, *Obstetrics & Gynaecology*, *Paediatrics*.
3. Subjects added here are immediately synchronized with the session creation drop-downs in `/live-scan` and calculation engines in the Student Medical Portal (`/portal`).

---

## 4. Multi-Camera CCTV RTSP & ONVIF PTZ Configuration

### Dual-Stream Camera Topology
For massive tiered lecture halls (300+ students), standard video streams overwhelm CPU decoding. MedAttend utilizes a **Dual-Stream RTSP Architecture**:

```
   CCTV Camera
   ├── High-Resolution Main Stream (4K / 1080p) ────────► Operator Preview Screen
   └── Sub-Stream (960 × 540 @ 15–20 FPS)      ────────► InsightFace ArcFace 512D AI Engine
```

- **Inference Resolution**: `960 × 540` provides an optimal balance between low memory footprint and high feature retention for distant seated faces.
- **Detector Frame Size**: Configured to `(640, 640)` RetinaFace grid with `det_thresh=0.15` for high-recall back-row capture.

### Auditorium Camera Layout & Placement
For optimal 300-student coverage, deploy 6 fixed IP cameras + 1 central PTZ camera:
- **Cameras 1 & 2**: Cover the front stage and Rows 1–5 (Left and Right).
- **Cameras 3 & 4**: Mounted at mid-hall height pointing downward at Rows 6–15 (Left and Right wings).
- **Cameras 5 & 6**: Rear elevated cameras with zoom lenses angled toward Rows 16–25.
- **PTZ Camera**: Centered high on the back wall for targeted zoom inspections during live scans.

### Configuring `.env` Stream Endpoints
In the root `.env` file, configure your RTSP camera URLs:
```env
# Multi-Camera RTSP Streams (Sub-streams recommended for AI processing)
CCTV_CAMERA_1="rtsp://admin:Pass123@192.168.1.101:554/stream2"
CCTV_CAMERA_2="rtsp://admin:Pass123@192.168.1.102:554/stream2"
CCTV_CAMERA_3="rtsp://admin:Pass123@192.168.1.103:554/stream2"
CCTV_CAMERA_4="rtsp://admin:Pass123@192.168.1.104:554/stream2"
CCTV_CAMERA_5="rtsp://admin:Pass123@192.168.1.105:554/stream2"
CCTV_CAMERA_6="rtsp://admin:Pass123@192.168.1.106:554/stream2"

# ONVIF PTZ Motor Controller
ONVIF_IP="192.168.1.110"
ONVIF_PORT=80
ONVIF_USER="admin"
ONVIF_PASS="Pass123"
```

---

## 5. Classroom GPS Geofencing & Radar Calibration

Students can check in via their mobile smartphones using the `/selfieattend` portal. To ensure they are physically present inside the lecture hall:

1. When initiating a session in an auditorium, click **Calibrate Classroom GPS**.
2. The modern **Centered GPS Radar Calibration Modal** activates:
   - Queries hardware GPS with sub-meter accuracy.
   - Displays real-time latitude, longitude, and accuracy radius.
   - Automatically tests fallback Wi-Fi network positioning to prevent `POSITION_UNAVAILABLE` errors on laptops or Mac workstations.
3. Click **Lock Coordinates**. The session record stores the coordinates and a default 75-meter geofence radius.

---

## 6. 24/7 Cloud Failover & Hybrid Resilience (Hugging Face Spaces)

MedAttend guarantees 24/7 uptime for students even when local classroom workstations are shut down overnight:

1. **Local Server Mode**:
   - `start.py` launches a secure Cloudflare Tunnel.
   - Computes an HMAC-SHA256 signature and registers the active local tunnel URL with Supabase.
   - Local high-speed ArcFace AI engine processes camera streams.
2. **Automated Cloud Failover**:
   - If the local workstation sleeps or disconnects, the Next.js API layer (`serverBackend.ts`) automatically routes requests to the containerized **Hugging Face Spaces** cloud instance.
   - Students can check 7-day attendance logs, verify examination eligibility, and reset PINs 24 hours a day without downtime.
3. **Clean Shutdown Sync**:
   - When stopping the local server (`Ctrl+C` or `Stop_Attendance.command`), the shutdown hook automatically points Supabase back to the Hugging Face cloud failover URL.

---

## 7. Meta WhatsApp Cloud API Configuration

MedAttend dispatches automated absentee alerts to parents using the official Meta WhatsApp Cloud API (Graph v21.0):

1. **Prerequisites**: A verified Meta for Developers account, WhatsApp Business Account (WABA), and a registered institutional phone number.
2. **Environment Variables**:
   ```env
   WHATSAPP_PHONE_NUMBER_ID="your_phone_number_id"
   WHATSAPP_BUSINESS_ACCOUNT_ID="your_business_account_id"
   WHATSAPP_ACCESS_TOKEN="EAAG..."
   ```
3. **Handling Token Renewal**:
   - Meta temporary developer tokens expire every 24 hours.
   - When a token expires, operators can click **WhatsApp Status** in the dashboard, paste the new token into the modal, and click **Save & Retry**.
   - The token updates in memory and persists to `.env` without restarting services.
4. **Dedicated Queue Worker**: Alerts are processed sequentially through `whatsapp_event_queue` with a 3-second anti-spam delay to adhere to WhatsApp rate limits.

---

## 8. Security Audit Logs & Compliance Monitoring (`/audit-logs`)

For administrative accountability and legal governance, all privileged operations are permanently logged:

- **Recorded Events**:
  - Manual attendance marking and deletions (`attendance/mark`).
  - Student biometric vector registrations and revocations.
  - Staff account provisioning, edits, and password changes.
  - GPS coordinate calibrations and session terminations.
- **Audit Attributes**: Captures Timestamp, Actor Name, User Role, Severity (`INFO`, `WARN`, `CRITICAL`), Client IP Address, and Action Details.
- **Theme-Integrated Live Refresh**: The audit log interface features a high-contrast **Live Refresh** action bar with seamless dark and light mode theme integration for 24/7 control room viewing.

---

*MedAttend AI — Enterprise Architectural Reliability and Institutional Governance.*
