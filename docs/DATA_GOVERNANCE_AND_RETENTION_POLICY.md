# 📜 MedAttend AI — Data Governance & Retention Policy
**Regulatory Alignment: Digital Personal Data Protection (DPDP) Act 2023 (India), NMC Institutional Directives & ISO 27001 Information Security**

---

## 1. Executive Summary & Purpose

MedAttend AI is an intelligent attendance and academic tracking platform deployed in medical and professional colleges. This document establishes the **Data Governance and Retention Policy**, defining:
1. What personal and sensitive data categories are collected and processed.
2. The specific institutional purpose and lawful basis for each data element.
3. The exact retention duration before mandatory data retirement or cryptographic erasure.
4. Standard Operating Procedures (SOP) for data erasure, consent withdrawal, and graduation archiving.

---

## 2. Personal Data Classification Matrix

| Data Category | Specific Data Elements | Classification | Lawful Basis (DPDP Act 2023) | Storage Format |
| :--- | :--- | :--- | :--- | :--- |
| **Biometric Face Embeddings** | 512-dimensional ArcFace mathematical vectors (`float32[512]`) | **Sensitive Personal Data** | Explicit Consent (Sec 6) | Irreversible JSONB vector array. *No raw photographs stored.* |
| **Student Identification** | Full name, Roll Number, Academic Year, College Email | **Personal Data** | Educational Contract & Legitimate Use | Encrypted text columns |
| **Communication Data** | Parent/Guardian emergency contact phone numbers | **Personal Data** | Legitimate Interest (Academic notifications & student safety) | E.164 formatted string |
| **Attendance History** | Session ID, Subject, Timestamp, Capture Mode (CCTV/Selfie/Manual), Confidence | **Operational Record** | Regulatory Academic Compliance (NMC minimum attendance criteria) | Relational database with Foreign Keys |
| **Authentication Credentials** | Portal PIN / Password, Session Tokens | **Confidential Security Data** | Identity Verification & Access Control | One-way salted Bcrypt hash (`$2b$10$...`), HMAC-SHA256 HttpOnly cookies |
| **Audit Trails** | Actor username, IP address, Action timestamp, Target entity, HTTP metadata | **Forensic Audit Record** | Security Oversight & Legal Accountability | Append-only, trigger-protected immutable PostgreSQL table |

---

## 3. Purpose Limitation (Why Data Is Retained)

1. **Biometric Face Embeddings**: Used solely for high-accuracy face matching during scheduled classroom lectures, clinical postings, and examination attendance via RTSP streams or verified mobile selfie checks. **Facial vectors are never monetized, cross-linked, or transferred to third parties.**
2. **Parent Phone Numbers**: Exclusively used for emergency contact and institutional communication regarding student attendance and academic safety.
3. **Attendance Records**: Required to compute semester-end attendance percentages, qualify students for university professional examinations, and furnish official documentation for medical regulatory inspections.
4. **Audit Logs**: Maintained to prove non-repudiation, detect brute-force attacks, verify faculty session boundaries, and provide an indisputable forensic trail.

---

## 4. Retention Schedule & Lifecycle Management

| Data Category | Retention Duration | Trigger for Deletion / Archival | Disposal Method |
| :--- | :--- | :--- | :--- |
| **Biometric Face Embeddings** | **Active Enrollment Only** | 1. Withdrawal of consent<br>2. Graduation / Course completion<br>3. Transfer to another institution | **Cryptographic Erasure**: Embedding set to `NULL`, in-memory cache evicted instantly. Irreversible. |
| **Temporary Activation PINs** | **24 Hours / Single-Use** | Student's initial portal login or 24 hours post-issuance | **Auto-expiry**: Overwritten upon mandatory password change. |
| **Attendance Records** | **5 Academic Years** | Expiration of 5-year post-graduation accreditation cycle | Anonymized or transferred to offline institutional cold archive. |
| **Parent Phone Numbers** | **Active Course Duration** | Graduation of student or formal update request | Overwritten or deleted from active database. |
| **Security Audit Logs** | **3 Years** | 36 months rolling window | Append-only ledger; archived to read-only cold storage for regulatory review. |

### 4.1 Database-Enforced Non-Cascading Retention (`ON DELETE RESTRICT`)

To ensure compliance with the **National Medical Commission (NMC)** 5-year academic audit mandate and the **DPDP Act 2023** non-repudiation principles, attendance records are safeguarded at the relational database engine layer:

1. **Schema-Level Invariant**:
   - `public.attendance.session_id` ➔ `REFERENCES public.sessions(id) ON DELETE RESTRICT`
   - `public.attendance.student_id` ➔ `REFERENCES public.students(id) ON DELETE RESTRICT`
   - **`ON DELETE CASCADE` is strictly prohibited.** Under no circumstances may an operation on a parent table cascade into automatic deletion of historical attendance records.
2. **Database Engine Rejection**:
   - Any raw SQL query, database migration, automated maintenance script, or API call attempting a `DELETE FROM sessions` or `DELETE FROM students` where attendance records exist will be rejected immediately by PostgreSQL with error code `23503` (`foreign_key_violation`).
3. **Institutional Archival & Deletion SOP**:
   - **Records with Attendance History (> 0 records)**: Must be archived using Soft-Delete. The system marks `is_archived = true` or `academic_year = '[ARCHIVED]'`, cryptographically erases biometric templates (`face_encoding = NULL`), and leaves the complete attendance audit trail 100% intact.
   - **Empty Records (0 attendance history)**: Authorized administrators may perform a clean hard-delete only on unlinked records created by clerical mistake.

---

## 5. Right to Withdraw Consent & Erasure SOP (Section 12 DPDP Act)

Any student or legal guardian has the right under Section 12 of the DPDP Act 2023 to withdraw biometric consent at any time without punitive consequences to their academic standing.

### Standard Operating Procedure (SOP) for Biometric Erasure:
1. **Initiation**: Student requests revocation via the Student Portal or an authorized Administrator executes:
   ```http
   POST /api/students/{student_id}/revoke-biometrics
   ```
2. **Server Execution**:
   - `face_encoding` is set to `NULL` in the database.
   - `biometric_consent` is toggled to `false`.
   - `biometric_consent_revoked_at` timestamp is recorded.
3. **Cache Eviction**:
   - The AI backend (`app/stream.py`) invalidates its in-memory face recognition cache immediately.
4. **Audit Record**:
   - An immutable entry is written to `audit_logs` detailing the actor, student ID, timestamp, and legal basis (`DPDP Act 2023 Section 6(4)`).
5. **Alternative Attendance**:
   - The student seamlessly transitions to secure manual attendance marked by the course faculty.

---

## 6. Access Control & Security Governance

1. **Service-Role Key Isolation**: The Supabase Service Role Key is strictly isolated to the server runtime (`import 'server-only'`). It is never bundled into client browsers.
2. **Immutable Audit Ledger**: All audit log entries are guarded by PostgreSQL database triggers (`trg_audit_logs_immutable`) preventing `UPDATE` and `DELETE` commands.
3. **Zero-Trust Faculty Scope**: Faculty members can only mark, delete, or inspect attendance records for their own designated lecture sessions. Cross-faculty session alterations are rejected with `HTTP 403` and logged as security violations.
4. **IDOR Defense**: Student portal endpoints derive student identity exclusively from cryptographically signed session tokens; client-supplied query parameters are strictly ignored.

---

## 7. Data Protection Officer (DPO) & Redressal Contact

In accordance with Section 8 of the DPDP Act 2023, the institution shall designate a Data Protection Officer (DPO) or IT Security Administrator responsible for overseeing compliance with this policy.

- **Institutional Oversight**: Principal / Dean / Academic Director
- **Technical Custodian**: Super Administrator (System & Database Governance)
- **Review Cadence**: This policy shall be reviewed annually or upon major legislative/regulatory revisions by the NMC or Government of India.
