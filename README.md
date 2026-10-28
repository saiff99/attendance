# 🎓 MedAttend AI — Enterprise Smart Attendance, Medical Student Portal & Multi-Camera Surveillance System

[![Next.js](https://img.shields.io/badge/Next.js-16.2.4-black?style=for-the-badge&logo=next.js)](https://nextjs.org/)
[![FastAPI](https://img.shields.io/badge/FastAPI-0.110+-009688?style=for-the-badge&logo=fastapi)](https://fastapi.tiangolo.com/)
[![InsightFace](https://img.shields.io/badge/InsightFace-ArcFace_512D-ff6f00?style=for-the-badge&logo=ai)](https://github.com/deepinsight/insightface)
[![Supabase](https://img.shields.io/badge/Supabase-PostgreSQL_Database-3ECF8E?style=for-the-badge&logo=supabase)](https://supabase.com/)
[![Hugging Face](https://img.shields.io/badge/Hugging_Face-Spaces_24%2F7_Failover-ffd21e?style=for-the-badge&logo=huggingface)](https://huggingface.co/)
[![Cloudflare](https://img.shields.io/badge/Cloudflare-Unlimited_Tunnels-F38020?style=for-the-badge&logo=cloudflare)](https://cloudflare.com/)
[![TailwindCSS](https://img.shields.io/badge/Tailwind_CSS-v4-38B2AC?style=for-the-badge&logo=tailwind-css)](https://tailwindcss.com/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.0+-3178C6?style=for-the-badge&logo=typescript)](https://www.typescriptlang.org/)

> **MedAttend AI** is an enterprise-grade, end-to-end automated academic attendance and classroom surveillance system designed for large educational auditoriums, medical colleges, and institutions (**stress-tested for 300+ students across 6 simultaneous CCTV streams**).
> 
> It pairs ultra-fast biometric facial recognition (InsightFace ArcFace 512D) with dual-stream RTSP camera pipelines, ONVIF PTZ controls, a dedicated **Medical Student Portal** (with 7-day attendance logs & curriculum eligibility), **3-Tier Role-Based Access Control (Super Admin / Admin / Faculty)** with **Bulletproof Lockout Guardrails**, **Staff & Faculty Account Management**, **Centralized MBBS Academic Curriculum Governance**, **Faculty Full Name Session Attribution**, **Geofenced Classroom GPS Shield** with multi-tier hardware fallback, **24/7 Cloud Failover via Hugging Face Spaces**, and **Enterprise Audit Logging**.

---

## 📚 Comprehensive Documentation Suite

For specialized operational, administrative, and compliance instructions, please refer to our dedicated documentation guides:

| Guide | Target Audience | Primary Focus |
| :--- | :--- | :--- |
| [**🏛️ Context Architecture Vault**](docs/architecture-vault/INDEX.md) | Software Engineers & AI Agents | Authoritative Single Source of Truth for system topology, ADRs, hard security constraints, database schemas, and solved edge cases. |
| [**👨‍🏫 Faculty & User Guide**](docs/USER_GUIDE.md) | Professors, Lecturers & Teaching Staff | Conducting attendance sessions, live AI camera monitoring, GPS selfie instructions, and exporting Excel reports. |
| [**🛠️ Admin & IT Setup Guide**](docs/ADMIN_SETUP_GUIDE.md) | System Admins & IT Engineers | 3-tier user governance, lockout guardrails, RTSP multi-camera setup, ONVIF PTZ controls, and curriculum configuration. |
| [**🎓 Student Portal Guide**](docs/STUDENT_PORTAL_GUIDE.md) | Medical Students & Interns | Logging in with Roll No & PIN, mobile GPS selfie check-in, 7-day attendance logs, and NMC exam eligibility. |
| [**🛡️ Security & Privacy Policy**](docs/SECURITY_AND_PRIVACY.md) | Deans, Legal Counsel & Compliance | India DPDP Act 2023 compliance, irreversible 512D ArcFace embeddings, zero raw photo storage, and audit logs. |
| [**🤝 Contributing Guidelines**](CONTRIBUTING.md) | Developers & Open-Source Contributors | Development environment setup, branch conventions, testing, and pull request workflow. |

---

## 📑 Table of Contents

- [📚 Comprehensive Documentation Suite](#-comprehensive-documentation-suite)
- [✨ Core Enterprise Features](#-core-enterprise-features)
- [👥 3-Tier Role-Based Access Control (RBAC)](#-3-tier-role-based-access-control-rbac)
  - [Role Hierarchy Overview](#role-hierarchy-overview)
  - [Role Permission Matrix](#role-permission-matrix)
- [🏛️ System Architecture & 24/7 Resilience](#️-system-architecture--247-resilience)
  - [Dual Backend & Cloud Failover Workflow](#dual-backend--cloud-failover-workflow)
- [🎯 Application Modules & Portals](#-application-modules--portals)
  - [1. Student Medical Portal (`/portal`)](#1-student-medical-portal-portal)
  - [2. GPS Selfie Attendance Portal (`/selfieattend`)](#2-gps-selfie-attendance-portal-selfieattend)
  - [3. User Management & Curriculum Configuration (`/users`)](#3-user-management--curriculum-configuration-users)
  - [4. Faculty Session Isolation & Ongoing Classes (`/ongoing`)](#4-faculty-session-isolation--ongoing-classes-ongoing)
  - [5. Dual-Tab Role Authentication (`/login`)](#5-dual-tab-role-authentication-login)
  - [6. Enterprise Audit Logs (`/audit-logs`)](#6-enterprise-audit-logs-audit-logs)
  - [7. Live Multi-Camera Surveillance (`/live-scan`)](#7-live-multi-camera-surveillance-live-scan)
  - [8. Academic Reports & Excel Export (`/reports`)](#8-academic-reports--excel-export-reports)
- [⚙️ Classroom & Hardware Optimization (300+ Students)](#️-classroom--hardware-optimization-300-students)
- [💻 Tech Stack](#-tech-stack)
- [⚙️ Prerequisites](#️-prerequisites)
- [🚀 Quick Start (1-Click Production Launch)](#-quick-start-1-click-production-launch)
- [🛠️ Detailed Step-by-Step Installation](#️-detailed-step-by-step-installation)
  - [1. Clone Repository](#1-clone-repository)
  - [2. Database Setup & Migrations (Supabase PostgreSQL)](#2-database-setup--migrations-supabase-postgresql)
  - [3. Backend Setup (FastAPI + InsightFace)](#3-backend-setup-fastapi--insightface)
  - [4. Frontend Setup (Next.js 16 Production)](#4-frontend-setup-nextjs-16-production)
  - [5. Environment Configuration](#5-environment-configuration)
  - [6. Biometric Consent & Privacy Architecture (DPDP Act 2023)](#6-biometric-consent--privacy-architecture-dpdp-act-2023)
  - [7. Automated Testing, QA & Continuous Integration](#7--automated-testing-qa--continuous-integration)
  - [8. 24/7 Cloud Backend Sync (Hugging Face Spaces)](#8-247-cloud-backend-sync-hugging-face-spaces)
  - [9. Classroom GPS Geofence & Shield Configuration](#9-classroom-gps-geofence--shield-configuration)
  - [10. Multi-Camera RTSP Grid Configuration](#10-multi-camera-rtsp-grid-configuration)
- [🖥️ Production Watchdogs & Desktop Launchers](#️-production-watchdogs--desktop-launchers)
- [📁 Project Directory Structure](#-project-directory-structure)
- [🔌 API Endpoints Reference](#-api-endpoints-reference)
- [❓ Troubleshooting & FAQs](#-troubleshooting--faqs)
- [📄 License & Credits](#-license--credits)

---

## ✨ Core Enterprise Features

### 👁️ 1. Ultra-Fast Biometric AI Engine (ArcFace 512D)
- **InsightFace Buffalo_SC (MobileFaceNet + RetinaFace)**: High-dimensional 512D facial feature vectors with CoreML and ONNX Runtime GPU acceleration.
- **High-Recall Distant Face Detection (`det_thresh=0.15`, `det_size=(640, 640)`)**: Reliably captures seated students in the back rows of massive tiered lecture halls.
- **Spatial Tracking Cache (`60.0s`, `80px`)**: Prevents repetitive, wasteful re-inference on stationary seated students.
- **Zero-Backlog Timestamp Scheduling**: Always grabs and evaluates strictly the newest decoded video frame per RTSP camera.
- **Auto-Sleep on 100% Attendance**: Switches AI inference to low-power standby when all students in a scheduled cohort are marked present.

### 🌐 2. 24/7 Cloud Failover & Hybrid Resilience
- **Dual-Layer Backend Engine**: Automatically routes requests to the local high-performance hardware backend when online, and transparently fails over to a 24/7 cloud instance hosted on **Hugging Face Spaces** when the local server is asleep or offline.
- **Cryptographic Tunnel Verification**: Dynamic Cloudflare tunnels are signed with HMAC-SHA256 tokens and synchronized to Supabase in real-time, preventing DNS or tunnel hijacking.
- **Automated GitHub Actions CI/CD**: Pushing changes to `backend/**` automatically syncs and deploys containerized updates to Hugging Face Spaces.

### 👥 3. Three-Tier Role-Based Access Control (RBAC) & Bulletproof Lockout Guardrails
- **Super Admin vs. Admin vs. Faculty**: Strict separation of institutional responsibilities and administrative boundaries.
- **Zero-Trust Super Admin Isolation**: Admins can manage faculty members, sessions, and attendance, but cannot view, edit, or tamper with Super Administrator accounts.
- **Three-Layer Lockout Protection**:
  - **Self-Action Immunity**: Logged-in administrators cannot delete or deactivate their own accounts (highlighted with an intuitive `You` badge).
  - **Root Admin Immunity**: The primary built-in root administrator (`admin` / `is_builtin`) is permanently protected from deletion, deactivation, and username tampering.
  - **Last Active Super Admin Guardrail**: Backend and frontend prevent deletion, deactivation, or demotion if only one active Super Admin exists in the institution.
- **Comprehensive Staff Account Editing**: In-place modal editing of full names, alphanumeric usernames (`/^[a-zA-Z0-9._-]{3,30}$/`), departments, emails, and credentials with instant validation.
- **Faculty Session Privacy & Full Name Attribution**: Sessions are tagged with official Faculty Full Names (e.g., `By: Dr. Rajesh Sharma`) instead of raw usernames, and faculty only see and manage their instructed classes.

### 📍 4. Multi-Tier Geofencing & Centered GPS Radar Modal
- **High-Accuracy Geolocation**: Haversine distance calculations ensure students are physically inside the designated lecture hall radius.
- **Modern Centered GPS Radar Calibration Modal**: Replaced intrusive native browser dialogs with a centered radar-pulse modal showing live coordinates and accuracy radii.
- **Multi-Tier Hardware Fallback**: Gracefully falls back from satellite GPS to network Wi-Fi positioning on macOS and laptops, with diagnostic guidance to eliminate `POSITION_UNAVAILABLE` errors.

### 📚 5. Centralized Academic Curriculum & Syllabus Governance
- **Institutional MBBS Subject Governance**: Standardized academic syllabus for 1st Year, 2nd Year, 3rd Year Part 1, and 3rd Year Part 2. Ad-hoc custom subject inputs are restricted to maintain clean, unified records.
- **Streamlined 4-Year Cohort Selection**: Intuitive cohort selection (`1st Year MBBS` to `4th Year MBBS`) and simplified sub-groups (`All Group`, `Group A`, `Group B`, `Group C`).
- **Instant Database Synchronization**: Configured subjects are dynamically available in session creation drop-downs and student medical portal calculations.

### 🌡️ 6. Adaptive Thermal Load Controller & Eco-Power Engine
- **Rolling Average Load Balancing**: Dynamically balances AI scan intervals between **0.8s and 2.0s** based on inference latency (EMA). Keeps institutional hardware cool during multi-hour lecture blocks.
- **Eco-Power Idle Sleep**: When no session is running and no cameras are previewed, stream decoders sleep (`0.5s`), slashing idle CPU consumption by >70%.
- **Instant On-Demand Wakeup (<0.05s)**: Resumes full 20–25 FPS stream playback the moment an operator views cameras or begins a lecture.

### 📹 7. Dual-Stream Multi-Camera Grid & PTZ Hardware Controls
- **6-Camera Simultaneous Grid**: Native RTSP feeds covering 1st Row, 2nd Row, and Left/Middle/Right auditorium wings.
- **Dual Stream Topology**: High-res Main Stream for operators + 960×540 Sub-Stream for ultra-fast AI inference.
- **ONVIF PTZ Motor Controls**: Real-time Pan, Tilt, and Zoom hardware control from the web dashboard.

### 🛡️ 8. High-Precision Classroom GPS Shield & Anti-Proxy Verification
- **Strict Classroom Radius Enclosure**: Calculates real-time Haversine distance, automatically verifying student mobile selfies are taken strictly inside the active lecture hall (default: 30m radius).
- **Institutional Campus Default Sync**: Pre-calibrated to institutional lecture complex coordinates (`22.451550, 88.172366`) with instant one-click "Reset Default" restoration.
- **Mobile Anti-Zoom & Instant Touch UX**: Implements strict 16px mobile form controls and `touch-action: manipulation`, completely eliminating iOS Safari viewport auto-zoom and 300ms tap delay.

### 🔒 9. Enterprise Security & Audit Log Ledger
- **Tamper-Evident Audit Trails**: Every manual attendance override, PIN reset, and administrative action is permanently logged with IP address, user agent, actor details, and timestamps.
- **India DPDP Act 2023 Compliance**: Explicit biometric opt-in consent recording and instantaneous permanent vector erasure upon revocation.

---

## 👥 3-Tier Role-Based Access Control (RBAC)

MedAttend features a comprehensive three-tier hierarchy for institutional staff, plus a dedicated portal for students:

```
                            ┌───────────────────────────────────────────┐
                            │               Super Admin                 │
                            │  - Full Institution Governance            │
                            │  - Manage Admins, Faculty & Settings      │
                            │  - Security Audit Logs Ledger             │
                            └─────────────────────┬─────────────────────┘
                                                  │
                                                  ▼
                            ┌───────────────────────────────────────────┐
                            │                  Admin                    │
                            │  - Faculty Management (Super Admin Hidden)│
                            │  - Academic Subjects & Curriculum Config  │
                            │  - Cross-Cohort Attendance & Sessions     │
                            │  - Student Enrollment & Biometrics        │
                            └─────────────────────┬─────────────────────┘
                                                  │
                                                  ▼
                            ┌───────────────────────────────────────────┐
                            │                 Faculty                   │
                            │  - Isolated Session Management            │
                            │  - Attendance for Own Subjects Only       │
                            │  - Student Search & Cohort Reports        │
                            └───────────────────────────────────────────┘
```

### Role Hierarchy Overview

1. **Super Administrator**:
   - Holds global oversight over all institutional data, database configurations, and audit trails.
   - The only role empowered to create, edit, or remove other Super Admins and Admins.
   - Full visibility into the complete security audit log ledger.

2. **Administrator**:
   - Designed for academic department heads, registrars, and operational managers.
   - Manages faculty accounts, configures academic curriculum subjects, and creates class sessions across all years.
   - Can manually adjust and delete attendance records (all logged to audit trails).
   - **Zero-Trust Protected**: Cannot view or modify Super Admin accounts in the Users directory.

3. **Faculty**:
   - Designed for professors, lecturers, and teaching assistants.
   - **Strict Session Isolation**: On the Dashboard and Ongoing Sessions page, faculty only see and control classes corresponding to their instructed subjects.
   - Cannot access the administrative Users portal (`/users`) or alter institutional system configurations.

4. **Medical Student**:
   - Accesses the dedicated Student Medical Portal (`/portal`) using their Roll Number and 6-digit Security PIN.
   - Accesses GPS Selfie Check-In (`/selfieattend`) during active class sessions.
   - Strictly isolated to their own attendance records and curriculum progress.

---

### Role Permission Matrix

| Capability / Resource | Super Admin | Admin | Faculty | Student |
| :--- | :---: | :---: | :---: | :---: |
| **Manage Super Admin Accounts** | ✅ | ❌ | ❌ | ❌ |
| **Manage Admin & Faculty Accounts** | ✅ | ✅ (Faculty only) | ❌ | ❌ |
| **Edit Staff & Faculty Accounts** | ✅ | ✅ (Faculty only) | ❌ | ❌ |
| **Self-Action & Root Lockout Protection** | 🛡️ Protected | 🛡️ Protected | 🛡️ Protected | ❌ |
| **Academic Curriculum Configuration (`/users`)** | ✅ | ✅ | ❌ | ❌ |
| **View All Ongoing / Past Class Sessions** | ✅ | ✅ | ❌ (Own only) | ❌ |
| **Create & Start New Class Sessions** | ✅ | ✅ | ✅ | ❌ |
| **Calibrate Classroom GPS Coordinates** | ✅ | ✅ | ✅ | ❌ |
| **Live Multi-Camera Surveillance & PTZ** | ✅ | ✅ | ✅ | ❌ |
| **Manual Attendance Marking & Deletion** | ✅ | ✅ | ❌ | ❌ |
| **Student Enrollment & Biometric Registration** | ✅ | ✅ | ✅ | ❌ |
| **Security Audit Logs Ledger (`/audit-logs`)** | ✅ | ❌ | ❌ | ❌ |
| **Classroom GPS Shield & Geofence Guard** | ✅ | ✅ | ✅ | ❌ |
| **Export Academic Attendance Reports (Excel)** | ✅ | ✅ | ✅ (Own classes) | ❌ |
| **Mobile Geofenced Selfie Check-In** | ❌ | ❌ | ❌ | ✅ |
| **Personal 7-Day Log & Curriculum Eligibility**| ❌ | ❌ | ❌ | ✅ |

---

## 🏛️ System Architecture & 24/7 Resilience

```
                                      ┌─────────────────────────────────┐
                                      │       Client Web / Mobile       │
                                      │   (Next.js 16 + Tailwind v4)    │
                                      │  - Student Portal (/portal)     │
                                      │  - GPS Selfie (/selfieattend)   │
                                      │  - Admin Hub & CCTV Grid        │
                                      │  - Users & Curriculum (/users)  │
                                      └────────────────┬────────────────┘
                                                       │
                                      HTTPS / WebSocket / Next.js API Proxy
                                                       │
                           ┌───────────────────────────┴───────────────────────────┐
                           │                                                       │
               [Priority 1: Local Server]                              [Priority 2: Cloud Failover]
                           │                                                       │
                           ▼                                                       ▼
        ┌──────────────────────────────────────┐                ┌──────────────────────────────────────┐
        │   FastAPI Local Core (Port 8000)     │                │   Hugging Face Spaces (24/7 Cloud)   │
        │                                      │                │                                      │
        │  ┌────────────────────────────────┐  │                │  ┌────────────────────────────────┐  │
        │  │ 6x RTSP Dual-Stream AI Grabbers│  │                │  │ Serverless AI Fallback Core    │  │
        │  │ ArcFace 512D CoreML / GPU      │  │                │  │ Student Face Vector Verifier   │  │
        │  │ ONVIF PTZ Hardware Controller  │  │                │  │ Health & Status Endpoints      │  │
        │  │ GPS Geofence Haversine Verifier│  │                │  └────────────────────────────────┘  │
        │  │ Cloudflare Dynamic HMAC Tunnel │  │                │                                      │
        │  └────────────────────────────────┘  │                │  Automatic failover if local machine │
        │                                      │                │  is shut down, sleeping, or offline. │
        └──────────────────┬───────────────────┘                └──────────────────┬───────────────────┘
                           │                                                       │
                           └───────────────────────────┬───────────────────────────┘
                                                       │
                                                       ▼
                                        ┌────────────────────────────┐
                                        │   Supabase (PostgreSQL)    │
                                        │    - Students & 512D Vector│
                                        │    - 3-Tier App Users RBAC │
                                        │    - Academic Subjects     │
                                        │    - Attendance Ledger     │
                                        │    - Enterprise Audit Logs │
                                        │    - Settings & HMAC Tunnel│
                                        └────────────────────────────┘
```

### Dual Backend & Cloud Failover Workflow

1. **Local High-Performance Engine**: When the local Mac/PC is running (`./start.sh`), local cameras stream at 25 FPS, AI scans execute with hardware acceleration, and the Cloudflare Tunnel securely synchronizes its HMAC-signed URL with Supabase.
2. **24/7 Cloud Resilience**: If the local workstation is turned off after classes, the server proxy (`serverBackend.ts`) automatically falls back to the **Hugging Face Spaces** cloud backend. Students can continue checking in via mobile GPS selfie, viewing 7-day logs, and resetting security PINs without server downtime.
3. **Automated Clean Exit Sync**: When terminating services (`Ctrl+C` or `Stop_Attendance.command`), `start.py` instantly updates Supabase to point back to the 24/7 Hugging Face backend.

---

## 🎯 Application Modules & Portals

### 1. Student Medical Portal (`/portal`)
Designed specifically for MBBS and academic curriculum tracking:
- **7-Day Recent Class Attendance Log**: Displays verified sessions from the last 7 calendar days with verification mode badges (`Live CCTV AI Scan` or `GPS Mobile Selfie`).
- **Curriculum Performance Breakdown**: Subject-wise statistics (Total Classes, Present, Absent, Attendance Percentage, and Health Status: Good / Borderline / Low).
- **NMC Examination Eligibility**: Real-time feedback on examination eligibility (Eligible $\ge 75\%$, Borderline $65\%\text{--}74\%$, Risk $< 65\%$).
- **Centered Security PIN Modal**: Self-service 6-digit PIN reset dialog with instant validation and secure random generation.
- **Biometric Enrolled Status**: Real-time indicator displaying registered facial vector readiness.
- **Elevated Faculty Viewer**: Administrators and Faculty can search and inspect student profiles with strict privacy compliance.

### 2. GPS Selfie Attendance Portal (`/selfieattend`)
Mobile-friendly student self-check-in:
- **Haversine GPS Geofencing**: Compares device GPS against lecture hall coordinates calibrated in the session.
- **Centered Radar Calibration Modal**: Modern UI with a radar pulse animation allowing faculty to calibrate classroom coordinates with a single click.
- **Multi-Tier Accuracy Fallback**: Prevents `POSITION_UNAVAILABLE` errors on macOS and laptops by seamlessly attempting high-precision satellite GPS before falling back to network positioning.
- **Anti-Spoof Biometric Verification**: Front-facing selfie capture with instant ArcFace 512D facial embedding verification.

### 3. User Management & Curriculum Configuration (`/users`)
Accessible to Super Administrators and Administrators:
- **Tab 1: Staff & Faculty Directory**:
  - Provision, search, and manage user accounts with clean role assignments (`Faculty`, `Admin`, or `Super Admin`).
  - **Edit Staff Modal**: In-place editing of Full Name, Username, Department, Email, Role, and optional Password resets.
  - **Bulletproof Lockout Guardrails**:
    - Current logged-in administrator is protected with an intuitive `You` badge; self-deletion and self-deactivation are completely disabled.
    - Built-in root administrator (`admin`) is permanently locked from deletion, deactivation, or username modifications.
    - Last active Super Admin account is protected from deletion or demotion to prevent institutional lockout.
  - Zero-Trust role scoping masks Super Admin accounts from regular Admins.
- **Tab 2: Academic Subjects & Curriculum**:
  - Configure subjects per academic year (1st Year, 2nd Year, 3rd Year Part 1, 3rd Year Part 2).
  - Add, delete, and search subjects with instant database updates and synchronization with session creation.

### 4. Faculty Session Isolation & Ongoing Classes (`/ongoing`)
- **Faculty Scoping**: Faculty members see only the active sessions for subjects they instruct.
- **Administrative Oversight**: Super Admins and Admins view all active sessions across the institution.
- **Faculty Full Name Attribution**: Displays the host instructor's official Full Name (e.g., `By: Dr. Rajesh Sharma` or `By: Faculty Member`) rather than raw `@username` handles.
- **Dynamic Header Badges**: Displays faculty name and initials (`profile-initials-badge`) dynamically.
- **Live Attendance Tally**: Real-time counter of present students, absent students, and session elapsed time.

### 5. Dual-Tab Role Authentication (`/login`)
- **Staff & Admin Tab**: Single unified portal for Super Admins, Admins, and Faculty with bcrypt verification.
- **Student Portal Tab**: Secure student entry requiring Roll Number and 6-digit PIN.
- **Strict Role Enforcement**: Prevents unauthorized cross-portal access and routes users to their authorized interfaces.

### 6. Enterprise Audit Logs (`/audit-logs`)
Full compliance and governance for institutional accountability:
- Tracks manual attendance insertions, deletions, and overrides (`attendance/mark`).
- Records student PIN resets, user account creation, profile edits, and credential modifications.
- Searchable and filterable by action, severity (`INFO`, `WARN`, `CRITICAL`), actor, and date range.
- High-contrast **Live Refresh** action bar with seamless dark and light mode theme integration.

### 7. Live Multi-Camera Surveillance (`/live-scan`)
- 6-Camera simultaneous grid with real-time bounding boxes and student identification overlays.
- **Standardized Academic Cohorts**: Streamlined Target Student Cohort dropdown strictly featuring 4 academic years (`1st Year MBBS`, `2nd Year MBBS`, `3rd Year MBBS`, `4th Year MBBS`) and simplified sub-groups (`All Group`, `Group A`, `Group B`, `Group C`).
- **Curriculum Governance**: Enforces institutional syllabus subjects, eliminating fragmented ad-hoc custom subject entries.
- ONVIF PTZ control pad with pan/tilt/zoom speeds and preset recall.
- Real-time present student counter and cohort attendance statistics.

### 8. Academic Reports & Excel Export (`/reports`)
- Comprehensive cohort and subject attendance logs.
- Export to formatted Microsoft Excel (`.xlsx`) and CSV files.
- Visual attendance distributions, deficit warnings, and parent communication records.

---

## ⚙️ Classroom & Hardware Optimization (300+ Students)

| Configuration Item | Recommended Target | Purpose & Impact |
| :--- | :--- | :--- |
| **Number of Cameras** | 6 IP Cameras + 1 PTZ | Complete front-to-back lecture hall coverage |
| **AI Stream Source** | Camera Sub-Stream (`CCTV_AI_URLS`) | Keeps CPU decode low while preserving 4K display preview |
| **AI Frame Resolution** | `960 × 540` | Retains high recognition accuracy for distant seated faces |
| **Face Detector Grid** | `(640, 640)` | High-recall RetinaFace detector size |
| **Cosine Threshold** | `0.42` (~78%+ Confidence) | Zero false-positive matching with ArcFace |
| **AI Scan Frequency** | `1.0 sec / camera` (Adaptive 0.8s–2.0s) | Prevents CPU spikes and maintains cool thermal operating range |
| **Frame Queuing** | Latest Frame Only | Zero buffer lag or ghost attendance |
| **Spatial Tracking Cache** | Enabled (`60.0s`, `80px`) | Prevents repeated re-inference on stationary students |
| **Session Cleanup** | Enabled (`gc.collect()`) | Purges cache upon session end to prevent memory creep |
| **Classroom Geofencing** | Haversine Distance Engine | Sub-millisecond GPS verification on student check-in |

---

## 💻 Tech Stack

| Layer | Technologies |
| :--- | :--- |
| **Frontend** | [Next.js 16](https://nextjs.org/) (App Router), [React 19](https://react.dev/), [TypeScript 5](https://www.typescriptlang.org/) |
| **Styling & UI** | [Tailwind CSS v4](https://tailwindcss.com/), [Lucide React](https://lucide.dev/), [Recharts](https://recharts.org/), [ExcelJS](https://github.com/exceljs/exceljs) |
| **Backend Core** | [FastAPI](https://fastapi.tiangolo.com/), [Uvicorn](https://www.uvicorn.org/) (Production Mode), [Pydantic v2](https://docs.pydantic.dev/) |
| **Computer Vision** | [InsightFace](https://github.com/deepinsight/insightface) (`buffalo_sc`), [ONNX Runtime](https://onnxruntime.ai/) (CoreML / CUDA), [OpenCV](https://opencv.org/) |
| **Camera Protocols** | RTSP (H.264 / H.265), ONVIF (`onvif-zeep`) |
| **Database & Auth** | [Supabase](https://supabase.com/) (PostgreSQL with JSONB Vector Encodings, Row-Level Security & Audit Tables) |
| **Cloud Failover** | [Hugging Face Spaces](https://huggingface.co/) (24/7 Serverless Containerized AI Fallback) |
| **Security & Geofence** | Haversine Distance Formula, W3C Geolocation API, Rate Limiting RPC |
| **Tunnels & Networking** | [Cloudflare Tunnels](https://cloudflare.com/) (Secure HMAC-authenticated zero-config remote check-in) |

---

## ⚙️ Prerequisites

1. **Node.js**: `v18.17.0` or higher (Recommended: Node `v20+` or `v22 LTS`)
   ```bash
   node -v
   npm -v
   ```
2. **Python**: `v3.10` or `v3.11`
   ```bash
   python3 --version
   ```
3. **C++ Build Tools** (For InsightFace & ONNX compilation):
   - **macOS**: `xcode-select --install`
   - **Ubuntu/Debian**: `sudo apt update && sudo apt install -y build-essential cmake libgl1-mesa-glx libglib2.0-0`
   - **Windows**: Install [Visual Studio C++ Build Tools](https://visualstudio.microsoft.com/visual-cpp-build-tools/) and [CMake](https://cmake.org/download/).

---

## 🚀 Quick Start (1-Click Production Launch)

MedAttend includes an automated production process manager (`start.py` / `start.sh`) featuring:
1. **Port Cleaning**: Safely frees ports `3000` and `8000` without system disruption.
2. **Next.js Production Builder**: Automatically builds and runs the optimized production bundle (`npm start`).
3. **FastAPI Production Engine**: Runs Uvicorn in production mode without dev hot-reload overhead.
4. **Dual Watchdogs**: Continuous background health checks with automatic sub-second recovery.
5. **Cloudflare Tunnel Auto-Sync**: Automatically syncs public mobile check-in URL with HMAC signature to Supabase.
6. **24/7 Cloud Fallback Restore**: Automatically restores the cloud failover URL on graceful shutdown.

```bash
# 1. Clone the project
git clone https://github.com/saiff99/attendance.git
cd attendance

# 2. Make executable and run
chmod +x start.sh
./start.sh
```

Open **`http://localhost:3000`** in your browser!

> 💡 **macOS Desktop User?** Double-click `Start_Attendance.command` or launch `Attendance.app` directly from your Applications/Desktop folder!

---

## 🛠️ Detailed Step-by-Step Installation

### 1. Clone Repository
```bash
git clone https://github.com/saiff99/attendance.git
cd attendance
```

---

### 2. Database Setup & Migrations (Supabase PostgreSQL)

#### Option A: Fresh Database Setup
1. Create a project at [Supabase](https://supabase.com/).
2. In the **SQL Editor**, run the complete unified production schema located in [`database/schema.sql`](database/schema.sql). 

This initializes all tables, performance indexes, seed curriculum subjects, and Zero-Trust RLS policies with automatic purge of legacy policies.

#### Option B: Incremental & Production Database Migrations
All migrations in [`database/migrations/`](database/migrations/) are **strictly additive, idempotent, and non-destructive**. They do **not** drop existing student tables or wipe historical attendance records.

| Migration File | Name / Purpose | Impact on Existing Data |
| :--- | :--- | :--- |
| [`01_unique_session_student_attendance.sql`](database/migrations/01_unique_session_student_attendance.sql) | Deduplicates attendance records & adds unique `(session_id, student_id)` constraint | Preserves newest record; prevents duplicate scans |
| [`02_student_portal_auth.sql`](database/migrations/02_student_portal_auth.sql) | Adds portal credential columns (`portal_pin`, `portal_password_hash`, `parent_phone`) | Additive `ADD COLUMN IF NOT EXISTS` |
| [`03_create_academic_subjects.sql`](database/migrations/03_create_academic_subjects.sql) | Creates curriculum table & seeds standard MBBS subjects | Additive `CREATE TABLE IF NOT EXISTS` |
| [`04_create_app_users.sql`](database/migrations/04_create_app_users.sql) | Provisions RBAC accounts table for Super Admin and Faculty | Additive `CREATE TABLE IF NOT EXISTS` |
| [`05_create_settings_and_rate_limit.sql`](database/migrations/05_create_settings_and_rate_limit.sql) | Persistent key-value table for rate limits & system configurations | Additive `CREATE TABLE IF NOT EXISTS` |
| [`06_zero_trust_rls_lockdown.sql`](database/migrations/06_zero_trust_rls_lockdown.sql) | Enables Row Level Security (RLS) across all core database tables | Locks public write access; grants `service_role` full access |
| [`07_biometric_explicit_consent_and_erasure.sql`](database/migrations/07_biometric_explicit_consent_and_erasure.sql) | DPDP Act 2023 opt-in default (`biometric_consent = false`) | Safe migration of existing consent states |
| [`08_dedicated_tunnel_security_settings.sql`](database/migrations/08_dedicated_tunnel_security_settings.sql) | Migrates Cloudflare tunnel config to dedicated settings store | Eliminates reliance on dummy session rows |
| [`09_zero_trust_rls_purge_and_verification.sql`](database/migrations/09_zero_trust_rls_purge_and_verification.sql) | Purges legacy permissive policies and verifies Zero-Trust lockdown | Automated assertion checks for 0 public policy leaks |
| [`10_zero_trust_credentials_and_pins.sql`](database/migrations/10_zero_trust_credentials_and_pins.sql) | Enforces Zero-Trust app_users schema and eliminates default credentials | Prevents default `123456` or roll number login fallback |
| [`11_biometric_explicit_consent_audit_and_erasure.sql`](database/migrations/11_biometric_explicit_consent_audit_and_erasure.sql) | Adds consent versioning, actor tracking, and revocation audit fields | Additive compliance audit fields under DPDP Act 2023 |
| [`12_add_admin_role.sql`](database/migrations/12_add_admin_role.sql) | Updates `app_users_role_check` constraint to support `'Admin'` role | Expands RBAC hierarchy to Super Admin, Admin, and Faculty |

> **⚠️ Safe Execution Policy:** Migrations are **never executed automatically** against your live production database. If upgrading an existing installation, review each file and run it manually in sequence (01 to 12) using the **Supabase Dashboard > SQL Editor**.

---

### 3. Backend Setup (FastAPI + InsightFace)

```bash
cd backend

# Create and activate virtual environment
python3 -m venv .venv
source .venv/bin/activate

# Upgrade pip & install dependencies
pip install --upgrade pip setuptools wheel
pip install -r requirements.txt
```

---

### 4. Frontend Setup (Next.js 16 Production)

```bash
cd frontend

# Install Node dependencies
npm install

# Build production bundle
npm run build
```

---

### 5. Environment Configuration

#### A. Backend (`backend/.env`)
Create `backend/.env` (or copy from `backend/.env.example`):

```env
# Supabase Database
SUPABASE_URL="https://your-project.supabase.co"
SUPABASE_KEY="your-supabase-service-role-key"

# Camera RTSP URLs (comma-separated for 6 cameras, or "0" for webcam)
CCTV_URLS="rtsp://admin:pass@192.168.1.101:554/stream1,rtsp://admin:pass@192.168.1.102:554/stream1"
# Optional AI Sub-streams
CCTV_AI_URLS="rtsp://admin:pass@192.168.1.101:554/stream2,rtsp://admin:pass@192.168.1.102:554/stream2"

# PTZ Camera (Optional)
PTZ_URLS="rtsp://admin:pass@192.168.1.120:554/media2/video1"
PTZ_IP="192.168.1.120"
PTZ_USER="admin"
PTZ_PASSWORD="password"

# AI & Thermal Tuning
AI_SCAN_INTERVAL_SEC=1.0
AI_ADAPTIVE_LOAD_CONTROL=True
AI_FRAME_WIDTH=960
AI_FRAME_HEIGHT=540

# Cryptographic Internal API Key for Dynamic Tunnel Verification
INTERNAL_API_KEY="your-random-cryptographic-secret"
```

#### B. Frontend (`frontend/.env.local`)
Create `frontend/.env.local`:

```env
NEXT_PUBLIC_SUPABASE_URL="https://your-project.supabase.co"
NEXT_PUBLIC_SUPABASE_ANON_KEY="your-supabase-anon-key"
SUPABASE_SERVICE_ROLE_KEY="your-supabase-service-role-key"
NEXT_PUBLIC_BACKEND_URL="http://localhost:8000"
BACKEND_URL="https://saiwebss-medattend-backend.hf.space"
INTERNAL_API_KEY="your-random-cryptographic-secret"
```

> **🔒 Critical Secret Storage Policy:**
> - `SUPABASE_SERVICE_ROLE_KEY` and `INTERNAL_API_KEY` bypass Row Level Security and sign live tunnel entries.
> - They **must NEVER** be prefixed with `NEXT_PUBLIC_`, committed to git, or sent to client browsers.
> - All client-side requests must communicate exclusively through Next.js server-side API routes (`/api/...`), which securely inject credentials.

---

### 6. Biometric Consent & Privacy Architecture (DPDP Act 2023)

MedAttend AI is architected from the ground up to comply with India's **Digital Personal Data Protection (DPDP) Act 2023**:
1. **Strict Opt-In Default:** All students have `biometric_consent = false` by default. No facial vectors are scanned or compared without affirmative, informed consent.
2. **Explicit Consent Recording:** Face enrollment requires checking the affirmative DPDP consent box, recording `biometric_consent_date`, `biometric_consent_version`, and `biometric_consent_actor`.
3. **Legal Right to Revoke & Erase:** Students or administrators can revoke consent at any time (`POST /api/students/{id}/revoke-biometrics`). This permanently sets `biometric_consent = false` and irreversibly overwrites facial vector embeddings with `NULL`.

---

### 7. 🧪 Automated Testing, QA & Continuous Integration

MedAttend features a multi-tiered test suite and automated GitHub Actions CI pipeline. For full instructions, refer to [`TESTING.md`](TESTING.md).

#### Tier 1: Fast Offline Unit Tests (No Database or Cameras Required)
```bash
# 1. Frontend Offline Security & Math Unit Tests (34 tests)
npm --prefix frontend test

# 2. Backend Security & Business Logic Unit Tests (10 tests)
python3 -m unittest discover backend/tests

# 3. Anti-Spoofing & Liveness Fail-Closed Tests (12 tests)
python3 backend/test_antispoof.py

# 4. Safe Attendance Insert Dry-Run Schema Validator
python3 backend/test_insert.py
```

#### Tier 2: End-to-End Zero-Trust Security Suite (106 Tests)
Run while the local development or staging server is running on `http://localhost:3000`:
```bash
npm --prefix frontend run test:security
```

#### GitHub Actions CI
Automated validation runs on every push and PR via [`.github/workflows/ci.yml`](.github/workflows/ci.yml) covering Next.js compilation, TypeScript type checking, ESLint verification, and offline test execution.

---

### 8. 24/7 Cloud Backend Sync (Hugging Face Spaces)

The system automatically synchronizes backend updates to Hugging Face Spaces via GitHub Actions:
1. Create a Docker Space on [Hugging Face](https://huggingface.co/spaces) (e.g., `saiwebss/medattend-backend`).
2. Add your Hugging Face write token to GitHub repository secrets as `HF_TOKEN`.
3. Pushes to `backend/**` trigger [`.github/workflows/sync-to-hf.yml`](.github/workflows/sync-to-hf.yml), automatically packaging the Docker container, syncing dependencies, and deploying the cloud AI fallback.

---

### 9. Classroom GPS Geofence & Shield Configuration

MedAttend features a high-precision, zero-trust **Classroom GPS Shield** that restricts student mobile selfie attendance to the physical boundaries of the lecture hall:
1. **Configurable Geofence Radius**: Enforces an active perimeter (default: 30m) around the classroom. Submissions originating from hostels or off-campus locations are strictly blocked.
2. **Default Institutional Coordinates**: Pre-calibrated to JIMSH lecture hall coordinates (`22.451550, 88.172366`).
3. **1-Click Device GPS Calibration**: Instructors can click **"Set Classroom GPS to Current Location"** on their mobile or laptop to immediately calibrate coordinates for outdoor clinics or alternate demo rooms.
4. **Instant Default Reset**: Click **"Reset Default"** in the session setup card or Geofence Modal at any time to instantly restore the standard classroom location.
5. **Mobile Anti-Zoom Optimization**: Fully optimized for mobile browsers (iOS Safari / Android Chrome) with strict 16px form inputs to prevent intrusive viewport zooming during session creation.

---

### 10. Multi-Camera RTSP Grid Configuration

MedAttend supports any standard RTSP IP camera (Dahua, Hikvision, CP Plus, Uniview, Axis):

```env
# Example 6-Camera Lecture Hall Grid
CCTV_URLS="rtsp://admin:pass@192.168.1.51:554/cam/realmonitor?channel=1&subtype=0,rtsp://admin:pass@192.168.1.52:554/cam/realmonitor?channel=1&subtype=0,rtsp://admin:pass@192.168.1.53:554/cam/realmonitor?channel=1&subtype=0,rtsp://admin:pass@192.168.1.54:554/cam/realmonitor?channel=1&subtype=0,rtsp://admin:pass@192.168.1.55:554/cam/realmonitor?channel=1&subtype=0,rtsp://admin:pass@192.168.1.56:554/cam/realmonitor?channel=1&subtype=0"

# Corresponding Low-Bitrate AI Sub-streams (subtype=1)
CCTV_AI_URLS="rtsp://admin:pass@192.168.1.51:554/cam/realmonitor?channel=1&subtype=1,rtsp://admin:pass@192.168.1.52:554/cam/realmonitor?channel=1&subtype=1,rtsp://admin:pass@192.168.1.53:554/cam/realmonitor?channel=1&subtype=1,rtsp://admin:pass@192.168.1.54:554/cam/realmonitor?channel=1&subtype=1,rtsp://admin:pass@192.168.1.55:554/cam/realmonitor?channel=1&subtype=1,rtsp://admin:pass@192.168.1.56:554/cam/realmonitor?channel=1&subtype=1"
```

---

## 🖥️ Production Watchdogs & Desktop Launchers

MedAttend is built for resilient, zero-maintenance institutional deployment:

| Launcher / Script | Target OS / Use Case | Description |
| :--- | :--- | :--- |
| **`./start.sh`** | macOS / Linux Terminal | 1-Click launcher with auto-build, port cleanup, and watchdogs. |
| **`Start_Attendance.command`** | macOS Finder | Double-clickable desktop script to launch system into production. |
| **`Stop_Attendance.command`** | macOS Finder | Double-clickable desktop script to gracefully terminate all services. |
| **`Attendance.app`** | macOS Application Bundle | Native macOS application launcher icon. |

---

## 📁 Project Directory Structure

```
attendance/
├── README.md                      # Complete Project Documentation & Architecture
├── start.sh                       # 1-Click Production Shell Launcher
├── start.py                       # Dual-Watchdog Process Manager & Tunnel Orchestrator
├── Start_Attendance.command       # macOS Desktop Launch Shortcut
├── Stop_Attendance.command        # macOS Desktop Stop Shortcut
├── Attendance.app/                # macOS Native Application Bundle
│
├── .github/workflows/
│   ├── ci.yml                     # Continuous Integration (Next.js, Python tests, ESLint)
│   └── sync-to-hf.yml             # Automated Backend Mirroring to Hugging Face Spaces
│
├── database/
│   ├── schema.sql                 # Complete PostgreSQL / Supabase Unified Production Schema
│   └── migrations/                # Additive, Idempotent Database Migrations (01 to 12)
│
├── backend/                       # FastAPI AI Core & Stream Engine
│   ├── Dockerfile                 # Container Definition for Hugging Face Spaces
│   ├── requirements.txt           # Python Package Dependencies
│   ├── main.py                    # FastAPI Entrypoint & Lifecycle
│   ├── app/
│   │   ├── ai.py                  # InsightFace ArcFace 512D Biometric Matcher
│   │   ├── config.py              # Supabase Client & Multi-Camera Config
│   │   ├── stream.py              # Dual-Stream RTSP Grabbers & Adaptive Load Control
│   │   ├── ptz.py                 # ONVIF PTZ Hardware Motor Controller
│   │   ├── routes.py              # RESTful APIs (Attendance, Memory Purge, Biometrics)
│   │   └── security.py            # Security & Rate Limiting Guardrails
│   └── tests/                     # Unit Tests for AI, Anti-Spoofing & Business Logic
│
└── frontend/                      # Next.js 16 Web Application (App Router)
    ├── package.json               # Node Dependencies
    ├── src/
    │   ├── app/
    │   │   ├── page.tsx           # Main Analytics & Recent Classes Dashboard
    │   │   ├── ongoing/           # Live Ongoing Sessions (Faculty-Isolated)
    │   │   ├── users/             # User Management (RBAC) & Academic Subjects Curriculum
    │   │   ├── portal/            # Medical Student Portal (7-Day Log & Curriculum)
    │   │   ├── selfieattend/      # GPS Geofenced Selfie Check-in Portal
    │   │   ├── audit-logs/        # Enterprise Security & Audit Log Ledger (Super Admin)
    │   │   ├── reports/           # Academic Reports & Excel (.xlsx) Exporter
    │   │   ├── live-scan/         # 6-Camera Live Surveillance & Biometric Overlay Grid
    │   │   ├── students/          # Student Biometric Directory & Face Enrollment
    │   │   ├── login/             # Dual-Tab (Staff/Admin vs Student) Authentication
    │   │   └── api/               # Server-Side API Proxies & Session Guards
    │   ├── components/            # Reusable UI Components, Modals & Video Players
    │   │   ├── ClassroomGpsModal.tsx # Modern Centered Radar GPS Calibration Modal
    │   │   ├── RecentClassSessionsTable.tsx # Role-Scoped Recent Classes Table
    │   │   └── Sidebar.tsx        # Dynamic RBAC Navigation & Faculty Profile Badges
    │   └── lib/                   # Auth Helpers, Geofence Math & Cloud Failover Client
```

---

## 🔌 API Endpoints Reference

### 🎓 Student Portal & Self-Attendance
| Endpoint | Method | Description |
| :--- | :--- | :--- |
| `/api/student/portal-data` | `GET` | Returns 7-day attendance logs, subject breakdown, and examination eligibility |
| `/api/students/{id}/reset-pin` | `POST` | Admin/Faculty endpoint to generate a secure 6-digit temporary activation PIN |
| `/api/selfie-attendance` | `POST` | Validates mobile selfie image with Haversine GPS coordinate geofencing |

### 🔒 Authentication & RBAC User Management
| Endpoint | Method | Description |
| :--- | :--- | :--- |
| `/api/auth/login` | `POST` | Dual-mode login for Staff/Admin or Student with bcrypt role protection |
| `/api/auth/me` | `GET` | Retrieves current session user info and role (`Super Admin`, `Admin`, `Faculty`, `Student`) |
| `/api/auth/logout` | `POST` | Invalidates session and clears secure HTTP-only cookies |
| `/api/users` | `GET`, `POST` | User account directory & creation with Zero-Trust Super Admin isolation |
| `/api/users/{id}` | `PUT`, `PATCH`, `DELETE`| Update staff account (Full Name, Username, Department, Email, Role, Password) or delete user account with bulletproof lockout guardrails (self-action, root admin, last super admin) |

### 📚 Academic Curriculum & Sessions
| Endpoint | Method | Description |
| :--- | :--- | :--- |
| `/api/subjects` | `GET`, `POST`, `DELETE` | Manage dynamic academic curriculum subjects configured per MBBS year |
| `/api/sessions` | `GET`, `POST` | List and create class sessions (faculty-isolated or institution-wide, with full faculty name resolution) |
| `/api/active-sessions` | `GET` | Retrieve live active sessions with host faculty full name attribution, check-in tokens, and geofence parameters |
| `/api/sessions/{id}` | `GET`, `PATCH`, `DELETE` | Retrieve session details, calibrate classroom GPS coordinates, or end session |

### 🛡️ Enterprise Audit Logs & Attendance
| Endpoint | Method | Description |
| :--- | :--- | :--- |
| `/api/audit-logs` | `GET` | Fetches filtered administrative and security audit trail records |
| `/api/attendance/mark` | `POST` | Manually mark or delete attendance records (with mandatory audit logging) |

### 📹 Live Video & Camera Management
| Endpoint | Method | Description |
| :--- | :--- | :--- |
| `/api/video-feed/{session_id}` | `GET` | MJPEG video stream with real-time bounding boxes & cosine confidence |
| `/api/ptz-video-feed/{session_id}` | `GET` | Live stream from active ONVIF PTZ camera |
| `/api/cameras` | `GET` | Returns list and connection health of all CCTV cameras |
| `/api/ptz/move` | `POST` | Dispatches Pan/Tilt/Zoom motor velocity commands |

### 🧬 Biometric Enrollment & AI Processing
| Endpoint | Method | Description |
| :--- | :--- | :--- |
| `/api/enroll-face/{student_id}` | `POST` | Stores 512D ArcFace embeddings from camera snapshot |
| `/api/enroll-face-burst/{student_id}` | `POST` | Multi-shot burst enrollment for multi-angle robustness |
| `/api/upload-photo` | `POST` | Processes batch photo for server-side face enrollment |
| `/api/students/{id}/revoke-biometrics` | `POST` | Irreversibly purges biometric face vectors under DPDP Act 2023 |

### 📍 Classroom GPS Shield & Security Tokens
| Endpoint | Method | Description |
| :--- | :--- | :--- |
| `/api/active-sessions` | `GET` | Issues cryptographic check-in capability tokens and geofence parameters for active sessions |
| `/api/student-lookup` | `POST` | Token-protected student profile lookup preventing public scraping of rosters |
| `/api/selfie-attendance` | `POST` | Validates mobile selfie face vector against 512D embeddings and verifies Haversine GPS radius |

---

## ❓ Troubleshooting & FAQs

### Q1: What is the difference between Super Admin, Admin, and Faculty?
> **Answer**: 
> - **Super Admin** has full institution governance, user provisioning (including creating/editing other Super Admins), and access to the complete security audit log ledger.
> - **Admin** manages day-to-day operations, creates sessions, configures curriculum subjects, and manages faculty accounts (Super Admin accounts are hidden from Admins under Zero-Trust scoping).
> - **Faculty** can only view and manage class sessions for the subjects they personally teach. They cannot access `/users` or tamper with other instructors' classes.

### Q2: Why does GPS check-in fail on Mac or laptop browsers?
> **Answer**: Laptop browsers and macOS Safari/Chrome sometimes fail high-accuracy satellite GPS requests (`POSITION_UNAVAILABLE`) when satellite lock is unavailable indoors. MedAttend's `geofence.ts` implements a multi-tier fallback that automatically retries using standard Wi-Fi network positioning with a generous accuracy tolerance, alongside tips to enable macOS System Location Services.

### Q3: How does the system remain accessible 24/7 if the classroom PC is turned off?
> **Answer**: MedAttend implements a **Dual Backend Architecture**. When your local high-power workstation is active, it handles heavy CCTV RTSP streaming. When shut down, the system transparently fails over to a 24/7 containerized instance on **Hugging Face Spaces**, allowing students to continue checking in via mobile GPS selfie and accessing their attendance records anytime.

### Q4: Why does the system stay cool even during 300-student classes?
> **Answer**: MedAttend uses an **Adaptive Thermal Load Controller** (`stream.py`) that monitors rolling AI inference latency. When inference load increases, it automatically adjusts scan intervals within safe bounds (0.8s–2.0s), preventing thermal throttling. Additionally, seated students are tracked via a 60-second spatial cache to eliminate redundant ArcFace calculations.

### Q5: How does the Student Portal protect student attendance privacy?
> **Answer**: The portal features **Role-Based Isolation**. Students can only log in with their assigned Roll Number and personal 6-digit PIN, giving them access exclusively to their own curriculum stats and past 7 days of verified attendance. Faculty and Admins cannot tamper with student records without creating an immutable audit trail.

### Q6: How does the Classroom GPS Shield prevent proxy attendance?
> **Answer**: When enabled, the Classroom GPS Shield calculates the real-time Haversine distance between the student's device coordinates and the verified classroom location. If a student attempts to check in from a hostel, home, or outside the configured radius (default: 30m), attendance submission is strictly rejected. Instructors can calibrate coordinates or restore the default institutional location at any time with 1-click.

### Q7: Port 3000 or 8000 already in use?
> **Answer**: Simply launch the app using `./start.sh`. The built-in process manager identifies and cleans only conflicting local processes before starting the production services.

### Q8: How does MedAttend prevent accidental Super Admin lockout or administrative disruption?
> **Answer**: 
> MedAttend incorporates **Three-Layer Lockout Guardrails**:
> 1. **Self-Action Immunity**: Logged-in administrators are visually identified with a `You` badge and cannot delete or deactivate themselves.
> 2. **Root Admin Immunity**: The primary built-in root administrator (`admin`) is permanently protected from deletion, deactivation, and username changes.
> 3. **Last Active Super Admin Guardrail**: Both backend API and frontend prevent deleting or demoting a Super Admin if only one active Super Admin remains in the entire institution.

### Q9: Why is ad-hoc custom subject entry restricted in Live Scan and session creation?
> **Answer**: 
> In institutional and medical college environments, attendance records must align strictly with the official NMC curriculum. Allowing ad-hoc custom subjects leads to fragmented reports, misspelled subject duplicates, and inaccurate student examination eligibility tallies. All subjects are centrally governed by Administrators under **Curriculum Configuration** (`/users`), ensuring reliable, unified attendance ledgers.

---

## 📄 License & Credits

- Developed for high-precision institutional, academic, and medical college attendance tracking.
- Built with ❤️ using [Next.js](https://nextjs.org/), [FastAPI](https://fastapi.tiangolo.com/), [InsightFace](https://github.com/deepinsight/insightface), [Supabase](https://supabase.com/), and [Hugging Face](https://huggingface.co/).
