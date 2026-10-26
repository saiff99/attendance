# 👨‍🏫 MedAttend AI — Faculty & User Operational Manual

Welcome to the **MedAttend AI Faculty & User Operational Manual**. This guide provides step-by-step instructions for professors, lecturers, teaching assistants, and academic staff to conduct attendance sessions, monitor live AI facial recognition, guide students through mobile GPS check-in, and export attendance records.

---

## 📑 Table of Contents

1. [Accessing the Portal & Logging In](#1-accessing-the-portal--logging-in)
2. [Faculty Session Scoping & Dashboard Overview](#2-faculty-session-scoping--dashboard-overview)
3. [Starting a New Class Attendance Session](#3-starting-a-new-class-attendance-session)
4. [Live Multi-Camera AI Surveillance & Monitoring](#4-live-multi-camera-ai-surveillance--monitoring)
5. [Guiding Students on Mobile GPS Selfie Attendance](#5-guiding-students-on-mobile-gps-selfie-attendance)
6. [Managing Active Classes (`/ongoing`)](#6-managing-active-classes-ongoing)
7. [Academic Attendance Reports & Excel Export (`/reports`)](#7-academic-attendance-reports--excel-export-reports)
8. [Manual Overrides & Classroom GPS Shield Management](#8-manual-overrides--classroom-gps-shield-management)
9. [Frequently Asked Questions (FAQs)](#9-frequently-asked-questions-faqs)

---

## 1. Accessing the Portal & Logging In

1. Open your web browser and navigate to the institutional portal URL (e.g., `https://medattend.yourcollege.edu` or `http://localhost:3000`).
2. Click **Login** in the top navigation bar or go to `/login`.
3. Select the **Staff & Admin** tab on the login screen.
4. Enter your institutional credentials:
   - **Username**: Your designated staff username (e.g., `dr_sharma`).
   - **Password**: Your secure password.
5. Click **Sign In**.

> 💡 **Faculty Privacy Note**: As a Faculty member, you are granted isolated access to your assigned subjects and sessions. Administrative settings (`/users`, `/audit-logs`) are reserved for Super Admins and Admins.

---

## 2. Faculty Session Scoping & Dashboard Overview

Upon logging in, your personalized dashboard greets you:
- **Profile Badge**: Your initials and official Full Name (e.g., `Dr. Rajesh Sharma`) appear in the navigation bar.
- **Recent Class Sessions**: Displays sessions you personally conducted, showing student attendance percentages, verification modes, and timestamps.
- **Quick Actions**: 1-click shortcuts to **Start Live Scan**, view **Ongoing Classes**, or inspect **Academic Reports**.

---

## 3. Starting a New Class Attendance Session

To begin attendance for an auditorium or lecture hall:

1. Click **Live Scan** or **New Session** from the navigation sidebar.
2. In the session configuration panel, complete the following fields:
   - **Target Student Cohort**: Select the intended academic year:
     - `1st Year MBBS`
     - `2nd Year MBBS`
     - `3rd Year MBBS`
     - `4th Year MBBS`
   - **Academic Sub-Group**: Select the relevant practical or lecture division:
     - `All Group` (Entire Batch)
     - `Group A`
     - `Group B`
     - `Group C`
   - **Subject**: Choose from the centralized institutional syllabus (e.g., *Anatomy*, *Physiology*, *Biochemistry*, *Pathology*, *Pharmacology*, etc.).
     > 🛡️ *Note: Subjects are centrally curated by college administrators to ensure compliance with NMC standards. Ad-hoc custom subjects are restricted.*
   - **Classroom / Auditorium**: Select the lecture hall where the cameras are stationed (e.g., *Auditorium 1*, *LT-2*).
3. Click **Start Attendance Session**.
4. The system will activate the CCTV streams and display the live surveillance grid.

---

## 4. Live Multi-Camera AI Surveillance & Monitoring

Once a session is active, the **Live Multi-Camera Grid** (`/live-scan`) provides real-time feedback:

- **AI Bounding Boxes**:
  - Green bounding boxes indicate a student has been identified and verified with high confidence (Cosine similarity $\ge 0.42$, ~78%+ match).
  - Blue/Gray bounding boxes indicate a face is tracked in the camera feed.
- **Spatial Tracking Optimization**: Students remaining seated in lecture hall chairs are cached for 60 seconds. The AI will not redundantly recalculate embeddings, keeping system temperature cool and latency under 1 second.
- **Auto-Sleep Engine**: If 100% of the enrolled students in the scheduled cohort are marked present, the AI inference automatically enters low-power sleep mode.
- **PTZ Camera Controls**: If an ONVIF PTZ camera is installed, use the on-screen directional pad to pan, tilt, or zoom toward back rows or side wings.

---

## 5. Guiding Students on Mobile GPS Selfie Attendance

In addition to ceiling-mounted CCTV cameras, students seated in the lecture hall can mark their attendance using their smartphones:

1. Instruct students to connect to the campus Wi-Fi or mobile network and open `/selfieattend`.
2. Students log in using their **Roll Number** and **6-Digit PIN**.
3. **Classroom Location Check**:
   - The device checks that the student is physically within the geofenced radius (typically 50–100 meters) of the lecture hall.
   - If coordinates need calibration, faculty can click **Calibrate Classroom GPS** on the session screen to pulse the centered GPS radar and lock the current hall coordinates.
4. **Selfie Capture**: The student captures a clear front-facing selfie. The system instantly verifies their biometric face vector and logs them as present.

---

## 6. Managing Active Classes (`/ongoing`)

Navigate to **Ongoing Classes** (`/ongoing`) to view active sessions:

- **Host Faculty Attribution**: Each session clearly displays `By: [Faculty Full Name]` (e.g., `By: Dr. Rajesh Sharma`).
- **Real-Time Attendance Counter**: Displays the live tally of Present vs. Absent students.
- **Student Checklist**: Expand any session card to see the full list of enrolled students with individual verification badges (`Live CCTV AI Scan` vs. `GPS Mobile Selfie`).
- **Ending the Session**: When the lecture ends, click **End Session**. This closes the attendance window, halts the camera streams, and commits the records to the permanent ledger.

---

## 7. Academic Attendance Reports & Excel Export (`/reports`)

MedAttend provides formatted export tools to generate compliance reports for department heads and university submissions:

1. Navigate to **Reports** (`/reports`).
2. Filter by:
   - **Academic Cohort** (e.g., `2nd Year MBBS`)
   - **Subject** (e.g., `Pathology`)
   - **Date Range** (Daily, Weekly, Monthly, or Custom Range)
3. Review the on-screen analytics:
   - Class attendance percentage distribution.
   - Deficit alert list (students falling below the 75% NMC threshold).
4. Click **Export to Excel (.xlsx)**:
   - Downloads a cleanly styled spreadsheet with institutional headers, student roll numbers, names, present/absent tallies, and verification modes.

---

## 8. Manual Overrides & Classroom GPS Shield Management

### Manual Attendance Adjustments
If a student arrives late with faculty permission or experienced technical difficulties:
1. Open the session attendance list.
2. Locate the student by Roll Number or Name.
3. Click **Mark Present** or **Mark Absent**.
4. Every manual adjustment is permanently recorded in the institutional **Security Audit Log** with your faculty identity and timestamp for transparency.

### Classroom GPS Shield Controls
When starting or managing an attendance session:
1. **Toggle GPS Shield**: Keep the shield **Active** (default: 30m radius) to ensure students can only check in while physically inside the lecture hall.
2. **Current Location Calibration**: Click **"Set Classroom GPS to Current Location"** to calibrate coordinates directly from your device.
3. **Customize Radius**: Adjust radius tolerance (e.g., 20m–100m) for large auditoriums.
4. **Reset Default**: If coordinates were changed during an outdoor session or demo, click **"Reset Default"** to immediately restore standard JIMSH classroom coordinates.

---

## 9. Frequently Asked Questions (FAQs)

#### Q1: Can other faculty members alter my class attendance?
**No.** MedAttend enforces strict **Faculty Session Isolation**. Only you and authorized institutional Administrators have permission to view or manage attendance for your assigned subjects.

#### Q2: What should I do if a student cannot check in via GPS selfie?
Ensure the student has enabled **Location Services** in their mobile browser settings (Safari/Chrome). Alternatively, verify their face in the CCTV camera feed or use the **Manual Override** option.

#### Q3: How do I reset a student's forgotten PIN?
Advise the student to contact the department office or administrator. Administrators can reset the student's PIN in seconds from `/users` or `/portal`.

---

*MedAttend AI — Empowering Educators with Accurate, Contactless Biometrics.*
