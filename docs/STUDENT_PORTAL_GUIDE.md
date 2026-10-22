# 🎓 MedAttend AI — Medical Student Portal & Mobile Check-In Guide

Welcome to the **MedAttend AI Medical Student Portal Guide**. This manual guides undergraduate medical students, scholars, and interns on how to log in, verify attendance, submit mobile GPS selfie check-ins, and track NMC examination eligibility.

---

## 📑 Table of Contents

1. [Accessing the Student Portal](#1-accessing-the-student-portal)
2. [Logging In with Roll Number & PIN](#2-logging-in-with-roll-number--pin)
3. [Submitting Mobile GPS Selfie Attendance (`/selfieattend`)](#3-submitting-mobile-gps-selfie-attendance-selfieattend)
   - [Enabling Device Location Services](#enabling-device-location-services)
   - [Taking the Biometric Verification Selfie](#taking-the-biometric-verification-selfie)
4. [Viewing Your 7-Day Verified Attendance History](#4-viewing-your-7-day-verified-attendance-history)
5. [NMC Examination Eligibility & Subject Breakdown](#5-nmc-examination-eligibility--subject-breakdown)
6. [Managing & Changing Your 6-Digit PIN](#6-managing--changing-your-6-digit-pin)
7. [Troubleshooting & Common Questions](#7-troubleshooting--common-questions)

---

## 1. Accessing the Student Portal

The MedAttend Student Portal is accessible from any mobile smartphone, tablet, or laptop connected to the campus network or mobile internet:

- **Portal URL**: Navigate to `/portal` or click **Student Portal** on the login page.
- **Mobile Check-In URL**: Navigate to `/selfieattend` during active lecture hours.

---

## 2. Logging In with Roll Number & PIN

1. Open `/login` in your web browser.
2. Click on the **Student Portal** tab.
3. Enter your assigned credentials:
   - **Roll Number**: Your official college roll number (e.g., `24` or `MBBS-2024-042`).
   - **6-Digit Security PIN**: Your personal 6-digit access PIN provided during orientation.
4. Click **Sign In to Student Portal**.

> 🔒 **Privacy Guarantee**: Your portal session is strictly isolated to your personal attendance and curriculum records. No other student can view your logs.

---

## 3. Submitting Mobile GPS Selfie Attendance (`/selfieattend`)

When faculty announce that selfie attendance is open for a lecture, follow these steps:

### Enabling Device Location Services
To ensure that students are physically present in the auditorium, MedAttend verifies your device's GPS coordinates:
- **On iPhone (iOS Safari)**:
  - When prompted, tap **"Allow While Using App"**.
  - If blocked: Go to *Settings > Privacy & Security > Location Services > Safari Websites* and select **"While Using the App"**.
- **On Android (Google Chrome)**:
  - When prompted, tap **"Allow"**.
  - If blocked: Tap the padlock icon in the browser address bar > *Permissions > Location* > toggle to **Allowed**.

### Taking the Biometric Verification Selfie
1. Navigate to `/selfieattend` on your phone.
2. Select your scheduled class from the active sessions list.
3. Allow the front camera preview to initialize.
4. Align your face within the on-screen oval guide:
   - Ensure you are in a well-lit area.
   - Remove sunglasses, heavy masks, or face coverings.
   - Look directly into the front camera.
5. Tap **Capture & Submit Attendance**.
6. The system evaluates your GPS location and matches your facial embedding against your registered biometric profile in $< 1.5$ seconds.
7. Upon success, a green confirmation badge appears: **"Attendance Recorded Successfully!"**

---

## 4. Viewing Your 7-Day Verified Attendance History

On your Student Portal dashboard (`/portal`), the **Recent Class Attendance Log** displays all classes attended over the past 7 calendar days:

- **Verification Badge**:
  - `Live CCTV AI Scan`: Marked automatically by ceiling-mounted auditorium cameras while you were seated in class.
  - `GPS Mobile Selfie`: Marked via your mobile smartphone check-in.
- **Class Details**: Subject Name (e.g., *Pathology*), Host Faculty Name (e.g., *Dr. Rajesh Sharma*), Date, and Exact Timestamp.

---

## 5. NMC Examination Eligibility & Subject Breakdown

Under National Medical Commission (NMC) guidelines, medical students must maintain a minimum attendance threshold to be eligible for professional university examinations:

| Status Badge | Attendance Range | Exam Eligibility Condition |
| :---: | :---: | :--- |
| 🟢 **Good Standing** | $\ge 75\%$ | Fully eligible for university professional exams. |
| 🟡 **Borderline** | $65\% - 74\%$ | Deficit warning; makeup lectures recommended. |
| 🔴 **Critical Deficit** | $< 65\%$ | At risk of examination debarment under NMC criteria. |

The portal provides an interactive curriculum card for each enrolled MBBS subject showing:
- **Total Classes Held**
- **Classes Attended vs. Absent**
- **Current Attendance Percentage**
- **Required Classes**: Exact number of upcoming classes you must attend consecutively to cross the $75\%$ safety mark.

---

## 6. Managing & Changing Your 6-Digit PIN

You can update your security PIN at any time to keep your account secure:

1. In the Student Portal dashboard, click **Reset / Change PIN**.
2. A centered security modal will appear.
3. Enter your current PIN, followed by your new desired 6-digit PIN.
4. Click **Update PIN**.
5. If you have forgotten your PIN, visit the academic department office. An authorized faculty member or administrator can generate an instant temporary PIN for you.

---

## 7. Troubleshooting & Common Questions

#### Q1: Why does it say "Out of Classroom Range"?
MedAttend uses high-precision geofencing. You must be physically inside the designated auditorium or lecture hall. If you are seated inside but receive this error, step away from thick concrete pillars or connect to the campus Wi-Fi network for enhanced Wi-Fi positioning.

#### Q2: What if my face is not recognized during selfie check-in?
- Check lighting: Avoid backlighting (e.g., sitting directly with your back to a bright window).
- Hold the phone steady at eye level.
- If your appearance has changed significantly (e.g., new glasses or beard), visit the department to perform a quick **Biometric Burst Update** (`/enroll-face-burst`).

#### Q3: Can I check in for my classmate?
**No.** MedAttend pairs high-dimensional 512D ArcFace facial recognition with GPS geofencing. A photograph of a photograph or holding up a phone with a classmate's picture is rejected by anti-spoof checks.

---

*MedAttend AI — Seamless, Transparent, and Fair Attendance for Future Physicians.*
