# 🎓 MedAttend AI — Enterprise Smart Attendance & Multi-Camera Surveillance System

[![Next.js](https://img.shields.io/badge/Next.js-16.2.4-black?style=for-the-badge&logo=next.js)](https://nextjs.org/)
[![FastAPI](https://img.shields.io/badge/FastAPI-0.110+-009688?style=for-the-badge&logo=fastapi)](https://fastapi.tiangolo.com/)
[![InsightFace](https://img.shields.io/badge/InsightFace-ArcFace_512D-ff6f00?style=for-the-badge&logo=ai)](https://github.com/deepinsight/insightface)
[![Supabase](https://img.shields.io/badge/Supabase-PostgreSQL_Database-3ECF8E?style=for-the-badge&logo=supabase)](https://supabase.com/)
[![Meta WhatsApp](https://img.shields.io/badge/WhatsApp-Cloud_API_v21.0-25D366?style=for-the-badge&logo=whatsapp)](https://developers.facebook.com/)
[![Cloudflare](https://img.shields.io/badge/Cloudflare-Unlimited_Tunnels-F38020?style=for-the-badge&logo=cloudflare)](https://cloudflare.com/)
[![TailwindCSS](https://img.shields.io/badge/Tailwind_CSS-v4-38B2AC?style=for-the-badge&logo=tailwind-css)](https://tailwindcss.com/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.0+-3178C6?style=for-the-badge&logo=typescript)](https://www.typescriptlang.org/)

> **MedAttend AI** is an end-to-end, multi-tier automated attendance & classroom surveillance platform engineered for educational institutions, medical colleges, and enterprise lecture halls. It pairs ultra-fast biometric facial recognition with automated multi-camera RTSP surveillance, ONVIF PTZ camera controls, GPS geofenced mobile selfie attendance, and instant parent notifications via the official Meta WhatsApp Cloud API.

---

## 📑 Table of Contents

- [✨ Key Features](#-key-features)
- [🏛️ System Architecture](#️-system-architecture)
- [💻 Tech Stack](#-tech-stack)
- [⚙️ Prerequisites](#️-prerequisites)
- [🚀 Quick Start (1-Click Launch)](#-quick-start-1-click-launch)
- [🛠️ Detailed Step-by-Step Installation](#️-detailed-step-by-step-installation)
  - [1. Clone Repository](#1-clone-the-repository)
  - [2. Database Setup (Supabase)](#2-database-setup-supabase)
  - [3. Backend Setup (FastAPI + AI Engine)](#3-backend-setup-fastapi--ai-engine)
  - [4. Frontend Setup (Next.js 16)](#4-frontend-setup-nextjs-16)
  - [5. Environment Configuration](#5-environment-configuration)
  - [6. Meta WhatsApp Cloud API Setup](#6-meta-whatsapp-cloud-api-setup)
  - [7. Camera & RTSP Grid Configuration](#7-camera--rtsp-grid-configuration)
- [🖥️ Running Manually (Terminal by Terminal)](#️-running-manually-terminal-by-terminal)
- [📁 Project Directory Structure](#-project-directory-structure)
- [🔌 API Endpoints Reference](#-api-endpoints-reference)
- [❓ Troubleshooting & FAQs](#-troubleshooting--faqs)
- [📄 License & Credits](#-license--credits)

---

## ✨ Key Features

### 👁️ 1. Ultra-Fast AI Facial Recognition Engine
- **InsightFace MobileFaceNet / ArcFace**: Generates high-fidelity 512-dimensional facial feature embeddings.
- **Real-Time Bounding Box & Labeling**: Overlays recognized student names, roll numbers, and live cosine confidence scores (75%–99%) directly onto MJPEG video streams.
- **High-Recall Distant Detection**: Tuned detection thresholds (`det_thresh=0.15`) for recognizing students seated in distant rows across large lecture auditoriums.
- **Anti-Duplicate Ledger**: Thread-safe deduplication engine ensures attendances are recorded once per session in PostgreSQL.

### 📹 2. Multi-Camera CCTV Grid & PTZ Hardware Controls
- **6-Camera Lecture Hall Grid**: Native support for multiple simultaneous 4K/HD RTSP feeds (1st Row & 2nd Row Left, Middle, Right presets).
- **ONVIF PTZ Integration**: Real-time Pan, Tilt, and Zoom hardware commands straight from the web browser dashboard.
- **Dynamic Camera Switching**: Toggle between classroom presets and full-screen camera inspection on demand.

### 📱 3. Geofenced Student Mobile Attendance (Selfie Check-in)
- **Anti-Proxy Biometric Verification**: Students verify attendance from their own smartphones (`/self-attendance` & `/selfieattend`).
- **GPS Geofencing**: Computes real-time Haversine distance against campus/classroom latitude and longitude with strict radius tolerances.
- **Device Fingerprinting**: Locks check-ins to genuine physical devices to prevent attendance proxy.

### 💬 4. Meta Official WhatsApp Cloud API Parent Dispatcher
- **Instant Absentee Alerts**: One-click dispatch of formal absentee notifications to parents and guardians with personalized student name, roll number, subject, and time stamp.
- **In-Modal Token Manager**: Interactive in-modal updater allows pasting new Meta Access Tokens and triggering "Save & Retry" immediately without restarting backend services.
- **Sandbox Diagnostic Tools**: Built-in template tests (`hello_world`) and whitelist diagnostics for Meta Developer Sandbox mode.

### 📊 5. Academic Management & Excel Analytics
- **Student Biometric Enrollment**: Enroll student faces via live webcam snapshots, multi-shot burst capture, or photo upload.
- **Batch Data Operations**: Bulk import student rosters from CSV/Excel spreadsheets and export detailed session attendance reports in `.xlsx` format.
- **Interactive Visual Charts**: Powered by Recharts to display real-time attendance percentages, year-wise trends, and absentee distributions.

---

## 🏛️ System Architecture

```
                                  ┌───────────────────────────────┐
                                  │      Client Web / Mobile      │
                                  │   (Next.js 16 + Tailwind v4)  │
                                  └──────────────┬────────────────┘
                                                 │
                                 HTTPS / WebSocket / Next.js API
                                                 │
                                                 ▼
      ┌──────────────────────────────────────────────────────────────────────────────────┐
      │                        FastAPI AI Microservice (Port 8000)                       │
      │                                                                                  │
      │  ┌────────────────────────┐  ┌────────────────────────┐  ┌────────────────────┐  │
      │  │  InsightFace ArcFace   │  │    OpenCV RTSP/MJPEG   │  │   ONVIF PTZ Motor  │  │
      │  │    (MobileFaceNet)     │  │     Stream Pipeline    │  │     Controller     │  │
      │  └───────────┬────────────┘  └───────────┬────────────┘  └─────────┬──────────┘  │
      └──────────────┼───────────────────────────┼─────────────────────────┼─────────────┘
                     │                           │                         │
                     ▼                           ▼                         ▼
      ┌─────────────────────────┐  ┌───────────────────────────┐  ┌────────────────────┐
      │  Supabase (PostgreSQL)  │  │   6x IP Cameras / PTZ     │  │   Meta WhatsApp    │
      │   - Students (JSONB)    │  │   - RTSP 4K Mainstream    │  │     Cloud API      │
      │   - Attendance Ledger   │  │   - Local Webcams (cv2)   │  │   (Graph v21.0)    │
      └─────────────────────────┘  └───────────────────────────┘  └────────────────────┘
```

---

## 💻 Tech Stack

| Layer | Technologies |
| :--- | :--- |
| **Frontend Framework** | [Next.js 16 (App Router)](https://nextjs.org/), [React 19](https://react.dev/), [TypeScript 5](https://www.typescriptlang.org/) |
| **Styling & Icons** | [Tailwind CSS v4](https://tailwindcss.com/), [Lucide React](https://lucide.dev/), [clsx](https://github.com/lukeed/clsx) |
| **Analytics & Data** | [Recharts](https://recharts.org/), [XLSX (SheetJS)](https://sheetjs.com/), [QRCode.react](https://github.com/zpao/qrcode.react) |
| **Backend Framework** | [FastAPI](https://fastapi.tiangolo.com/), [Uvicorn](https://www.uvicorn.org/), [Pydantic v2](https://docs.pydantic.dev/) |
| **Computer Vision / AI** | [InsightFace](https://github.com/deepinsight/insightface) (`buffalo_sc`), [ONNX Runtime](https://onnxruntime.ai/), [OpenCV](https://opencv.org/) |
| **Camera Protocols** | RTSP (Real-Time Streaming Protocol), ONVIF (`onvif-zeep`) |
| **Database & Auth** | [Supabase](https://supabase.com/) (PostgreSQL with JSONB Vector Encodings) |
| **Messaging & Cloud** | [Meta WhatsApp Cloud API](https://developers.facebook.com/), [Cloudflare Tunnels](https://cloudflare.com/) |

---

## ⚙️ Prerequisites

Before you begin, ensure you have the following installed on your machine:

1. **Node.js**: `v18.17.0` or higher (recommended: Node `v20+` or `v22 LTS`)
   ```bash
   node -v
   npm -v
   ```
2. **Python**: `v3.10` or higher (Python 3.10 / 3.11 recommended for maximum AI wheel compatibility)
   ```bash
   python3 --version
   ```
3. **C++ Compiler / Build Tools** (Required to compile InsightFace and ONNX dependencies):
   - **macOS**: Install Xcode Command Line Tools:
     ```bash
     xcode-select --install
     ```
   - **Ubuntu / Debian Linux**:
     ```bash
     sudo apt update && sudo apt install -y build-essential cmake libgl1-mesa-glx libglib2.0-0
     ```
   - **Windows**: Install [Visual Studio C++ Build Tools](https://visualstudio.microsoft.com/visual-cpp-build-tools/) and [CMake](https://cmake.org/download/).

---

## 🚀 Quick Start (1-Click Launch)

If you are on **macOS** or **Linux**, MedAttend includes an intelligent 1-click launcher that:
1. Cleans lingering background port conflicts (3000, 8000).
2. Starts the Next.js Frontend.
3. Starts the FastAPI InsightFace AI Engine.
4. Initializes a Cloudflare Tunnel for secure remote student check-in.
5. Auto-syncs the live tunnel URL to Supabase.

```bash
# 1. Clone the project
git clone https://github.com/saiff99/attendance.git
cd attendance

# 2. Make launcher executable & run
chmod +x start.sh
./start.sh
```

Then navigate to **`http://localhost:3000`** in your browser!

---

## 🛠️ Detailed Step-by-Step Installation

Follow these steps if you are setting up the project from scratch on any computer.

### 1. Clone the Repository
```bash
git clone https://github.com/saiff99/attendance.git
cd attendance
```

---

### 2. Database Setup (Supabase)

1. Create a free account at [Supabase](https://supabase.com/) and create a new project.
2. In your Supabase Dashboard, navigate to the **SQL Editor**.
3. Copy and paste the contents of [`database/schema.sql`](file:///Users/saif/Desktop/Attendance/Attendance-app/database/schema.sql) and run the script:

```sql
-- Enable uuid extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Students Table
CREATE TABLE IF NOT EXISTS students (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    student_roll VARCHAR(50) UNIQUE NOT NULL,
    full_name VARCHAR(255) NOT NULL,
    email VARCHAR(255) UNIQUE NOT NULL,
    academic_year VARCHAR(50),
    face_encoding JSONB,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Sessions Table
CREATE TABLE IF NOT EXISTS sessions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    class_name VARCHAR(255) NOT NULL,
    date DATE NOT NULL,
    start_time TIMESTAMP WITH TIME ZONE NOT NULL,
    end_time TIMESTAMP WITH TIME ZONE NOT NULL,
    instructor_name VARCHAR(255) NOT NULL,
    target_academic_year VARCHAR(50),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Attendance Table
CREATE TABLE IF NOT EXISTS attendance (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    session_id UUID NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
    student_id UUID NOT NULL REFERENCES students(id) ON DELETE CASCADE,
    status VARCHAR(50) NOT NULL CHECK (status IN ('Present', 'Absent')),
    capture_mode VARCHAR(50) NOT NULL CHECK (capture_mode IN ('Live Scan', 'Manual Upload', 'Selfie Check-in')),
    confidence_score FLOAT,
    recorded_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(session_id, student_id)
);

-- Performance Indexes
CREATE INDEX IF NOT EXISTS idx_attendance_session ON attendance(session_id);
CREATE INDEX IF NOT EXISTS idx_attendance_student ON attendance(student_id);
CREATE INDEX IF NOT EXISTS idx_sessions_date ON sessions(date);
```

4. Retrieve your **Project URL** and **Anon API Key** from **Project Settings > API**.

---

### 3. Backend Setup (FastAPI + AI Engine)

Open your terminal and navigate to the `backend/` directory:

```bash
cd backend

# Create a Python virtual environment
python3 -m venv .venv

# Activate the virtual environment
# On macOS / Linux:
source .venv/bin/activate

# On Windows (Command Prompt):
# .venv\Scripts\activate.bat
# On Windows (PowerShell):
# .venv\Scripts\Activate.ps1

# Upgrade pip and install wheel
pip install --upgrade pip setuptools wheel

# Install backend dependencies
pip install -r requirements.txt
```

> 💡 **Note on InsightFace Models**: On the first run, InsightFace will automatically download the pretrained `buffalo_sc` models (~15MB) into your user cache directory (`~/.insightface/models/buffalo_sc/`).

---

### 4. Frontend Setup (Next.js 16)

Open a new terminal window and navigate to the `frontend/` directory:

```bash
cd frontend

# Install Node.js dependencies
npm install
```

---

### 5. Environment Configuration

#### A. Backend Environment (`backend/.env`)
Create a file named `.env` inside the `backend/` directory (or copy `backend/.env.example`):

```bash
cp backend/.env.example backend/.env
```

Edit `backend/.env` with your credentials:
```env
# Supabase Configuration
SUPABASE_URL="https://your-project-id.supabase.co"
SUPABASE_KEY="your-supabase-service-role-or-anon-key"

# Camera Source: Use "0" for local laptop webcam, or provide RTSP stream URLs
CCTV_URLS="0"

# Optional: ONVIF PTZ Camera Controls
PTZ_URLS="rtsp://admin:password@192.168.1.120:554/media2/video1"
PTZ_IP="192.168.1.120"
PTZ_USER="admin"
PTZ_PASSWORD="password"

# Meta WhatsApp Cloud API
WHATSAPP_TOKEN="your_meta_access_token"
WHATSAPP_PHONE_ID="your_meta_phone_number_id"
```

#### B. Frontend Environment (`frontend/.env.local`)
Create a file named `.env.local` inside the `frontend/` directory:

```bash
cp frontend/.env.example frontend/.env.local
```

Edit `frontend/.env.local`:
```env
NEXT_PUBLIC_SUPABASE_URL="https://your-project-id.supabase.co"
NEXT_PUBLIC_SUPABASE_ANON_KEY="your_supabase_anon_public_key"
NEXT_PUBLIC_BACKEND_URL="http://localhost:8000"
```

---

### 6. Meta WhatsApp Cloud API Setup

To send automated absentee WhatsApp notices to parents:

1. Log into the [Meta for Developers Portal](https://developers.facebook.com/).
2. Create an App with the **Business** or **Other** type and add the **WhatsApp** product.
3. In the left sidebar, navigate to **WhatsApp > API Setup**:
   - Copy the **Phone number ID** and paste it into `WHATSAPP_PHONE_ID`.
   - Copy the **Temporary access token** and paste it into `WHATSAPP_TOKEN`.
4. In **Step 1 (Send and receive messages)**, click **Manage phone number list** and add the mobile numbers (with country code, e.g., `+91...`) of the test recipients you want to receive alerts during development.
5. *(Optional)* For permanent production access without 24-hour token expiration, create a **System User** with the `whatsapp_business_messaging` permission under **Meta Business Settings > System Users** to generate a permanent access token.

---

### 7. Camera & RTSP Grid Configuration

MedAttend supports any standard RTSP IP camera, NVR channel, or USB webcam:

- **Local Laptop Webcam**: Set `CCTV_URLS="0"` in `backend/.env`.
- **Multiple RTSP Feeds**: Provide a comma-separated list of RTSP URLs:
  ```env
  CCTV_URLS="rtsp://user:pass@192.168.1.10:554/stream1,rtsp://user:pass@192.168.1.11:554/stream1"
  ```
- **CP Plus / Dahua / Hikvision Format Examples**:
  - `rtsp://admin:password@192.168.1.100:554/live`
  - `rtsp://admin:password@192.168.1.100:554/cam/realmonitor?channel=1&subtype=0`

---

## 🖥️ Running Manually (Terminal by Terminal)

If you prefer running services individually in separate terminal windows:

### Terminal 1: Backend AI Microservice
```bash
cd backend
source .venv/bin/activate
uvicorn main:app --reload --port 8000
```
*Backend runs on:* `http://localhost:8000` (Swagger docs available at `http://localhost:8000/docs`)

### Terminal 2: Next.js Frontend
```bash
cd frontend
npm run dev
```
*Frontend runs on:* `http://localhost:3000`

### Terminal 3: (Optional) Cloudflare Tunnel for Remote Mobile Check-in
```bash
# If cloudflared is installed:
cloudflared tunnel --url http://127.0.0.1:8000
```

---

## 📁 Project Directory Structure

```
attendance/
├── README.md                      # Complete Project Documentation
├── start.sh                       # 1-Click Launch Shell Script
├── start.py                       # Automated Process Manager & Cloudflare Orchestrator
├── Start_Attendance.command       # macOS Double-Clickable Launcher
│
├── database/
│   └── schema.sql                 # PostgreSQL / Supabase Schema Definition
│
├── backend/                       # FastAPI AI Core & RTSP Engines
│   ├── .env.example               # Backend Environment Template
│   ├── requirements.txt           # Python Package Dependencies
│   ├── main.py                    # FastAPI App Entrypoint
│   └── app/
│       ├── ai.py                  # InsightFace ArcFace Engine & Confidence Scoring
│       ├── config.py              # Supabase Client & Camera Topology
│       ├── stream.py              # Multi-Camera RTSP OpenCV MJPEG Generator
│       ├── ptz.py                 # ONVIF Motor Control Service
│       ├── routes.py              # RESTful API Endpoints
│       └── whatsapp.py            # Meta WhatsApp Cloud API Dispatcher
│
└── frontend/                      # Next.js 16 Web Dashboard & Student Portal
    ├── .env.example               # Frontend Environment Template
    ├── package.json               # Node.js Package Dependencies
    ├── src/
    │   ├── app/
    │   │   ├── page.tsx           # Main Dashboard & Analytics Overview
    │   │   ├── live-scan/         # Live Surveillance Grid & Biometric Recognition
    │   │   ├── students/          # Student Directory & Face Enroller
    │   │   ├── self-attendance/   # Geofenced Mobile Student Attendance Portal
    │   │   └── api/               # Next.js Server-side Proxies & Geofence Verification
    │   └── components/
    │       ├── Header.tsx         # Responsive Top Navigation & Session Selector
    │       ├── WhatsAppAlertModal.tsx # Absentee WhatsApp Dispatcher & Token Updater
    │       └── ...                # UI Modals, Camera Feeds, and Stats Cards
```

---

## 🔌 API Endpoints Reference

### AI & Live Video Feeds
| Endpoint | Method | Description |
| :--- | :--- | :--- |
| `/api/video-feed/{session_id}` | `GET` | Live MJPEG video stream with real-time biometric bounding boxes and names |
| `/api/ptz-video-feed/{session_id}` | `GET` | Real-time video stream from the ONVIF PTZ camera |
| `/api/cameras` | `GET` | Returns list of configured CCTV cameras and status |
| `/api/ptz-cameras` | `GET` | Returns list of active PTZ hardware cameras |
| `/api/ptz/move` | `POST` | Dispatches Pan/Tilt/Zoom motor velocity commands to PTZ cameras |

### Biometric Enrollment & Processing
| Endpoint | Method | Description |
| :--- | :--- | :--- |
| `/api/enroll-face/{student_id}` | `POST` | Extracts and stores 512D ArcFace embeddings from webcam snapshot |
| `/api/enroll-face-burst/{student_id}` | `POST` | Multi-shot burst enrollment for enhanced angle variance |
| `/api/upload-photo` | `POST` | Bulk photo upload for server-side biometric encoding |
| `/api/process-attendance` | `POST` | Processes batch classroom photos and logs attendance |
| `/api/selfie-attendance` | `POST` | Validates mobile selfie face match and geofence location |

### WhatsApp Notifications
| Endpoint | Method | Description |
| :--- | :--- | :--- |
| `/api/whatsapp/send-alerts` | `POST` | Dispatches WhatsApp alerts to all absent students' parents for a session |
| `/api/whatsapp/update-token` | `POST` | Dynamically updates the Meta Access Token in memory and `.env` |
| `/api/whatsapp/test` | `POST` | Sends a single test message or Meta template to a target phone number |

---

## ❓ Troubleshooting & FAQs

### Q1: `Meta Access Token expired (OAuth 190)` error when sending WhatsApp alerts?
> **Answer**: Meta Developer temporary access tokens expire every 24 hours. You don't need to restart the backend. Simply copy a fresh temporary token from [Meta Developer Portal > WhatsApp > API Setup](https://developers.facebook.com/), open the WhatsApp Alert modal on your dashboard, paste the new token into the red action box, and click **"Save & Retry"**.

### Q2: Why is the RTSP camera stream showing a black screen or timing out?
> **Answer**:
> 1. Ensure your computer is on the same local network / VLAN as the IP cameras.
> 2. Test the RTSP stream in [VLC Media Player](https://www.videolan.org/) (*Media > Open Network Stream*) to confirm credentials and port `554`.
> 3. For testing on a laptop without CCTV, set `CCTV_URLS="0"` in `backend/.env` to use your built-in webcam.

### Q3: `insightface` compilation error during `pip install`?
> **Answer**: InsightFace requires a C++ compiler.
> - **macOS**: Run `xcode-select --install`.
> - **Linux**: Run `sudo apt install build-essential cmake`.
> - **Windows**: Install Visual Studio Community with "Desktop development with C++".

### Q4: Port 3000 or 8000 already in use?
> **Answer**: Run the automated launcher `./start.sh` which automatically clears orphan processes, or manually kill the ports:
> ```bash
> # macOS / Linux
> lsof -ti:3000,8000 | xargs kill -9
> ```

---

## 📄 License & Credits

- Developed for high-precision institutional and healthcare attendance tracking.
- Built with ❤️ using [Next.js](https://nextjs.org/), [FastAPI](https://fastapi.tiangolo.com/), [InsightFace](https://github.com/deepinsight/insightface), and [Supabase](https://supabase.com/).
