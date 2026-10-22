# 🛡️ MedAttend AI — Biometric Security, Data Governance & DPDP Act 2023 Compliance

This document outlines the **architectural security controls, biometric data handling protocols, and privacy compliance standards** implemented across the MedAttend AI attendance ecosystem.

MedAttend is engineered to comply with the **Digital Personal Data Protection Act (DPDP Act 2023 of India)**, the **National Medical Commission (NMC) institutional directives**, and international standards for biometric data minimization.

---

## 📑 Table of Contents

1. [Core Privacy Principles](#1-core-privacy-principles)
2. [Irreversible Biometric Vectorization (ArcFace 512D)](#2-irreversible-biometric-vectorization-arcface-512d)
3. [Digital Personal Data Protection (DPDP) Act 2023 Compliance](#3-digital-personal-data-protection-dpdp-act-2023-compliance)
   - [Explicit Informed Consent](#explicit-informed-consent)
   - [Purpose Limitation](#purpose-limitation)
   - [Right to Erasure & Biometric Revocation](#right-to-erasure--biometric-revocation)
4. [Three-Tier Zero-Trust Role-Based Access Control (RBAC)](#4-three-tier-zero-trust-role-based-access-control-rbac)
5. [Immutable Security Audit Ledger (`/audit-logs`)](#5-immutable-security-audit-ledger-audit-logs)
6. [Network & Cryptographic Transport Security](#6-network--cryptographic-transport-security)

---

## 1. Core Privacy Principles

MedAttend adheres to four non-negotiable architectural mandates:

- **Data Minimization**: We only process what is strictly necessary to verify academic presence.
- **Zero Raw Biometric Storage**: Unprocessed facial photographs are never permanently stored on servers or cloud databases for facial recognition.
- **Cryptographic Storage**: Mathematical vectors and credentials are encrypted at rest and in transit.
- **Institutional Accountability**: Every administrative decision or manual attendance override produces an immutable audit record.

---

## 2. Irreversible Biometric Vectorization (ArcFace 512D)

A frequent institutional concern regarding facial recognition is the security of stored biometric images. MedAttend eliminates this risk through **Mathematical Feature Vectorization**:

```
   Student Camera Frame
           │
           ▼
   RetinaFace AI (Landmark Detection: Eyes, Nose, Lips)
           │
           ▼
   InsightFace ArcFace 512D Neural Network
           │
           ▼
   Mathematical Embedding: [-0.0421, 0.1284, ..., 0.0091] (float32[512])
           │
           ▼
   Supabase PostgreSQL JSONB Vector Ledger
   
   ⚠️ Original facial frame is discarded immediately from memory (RAM).
```

### Why This Is Secure:
1. **One-Way Mathematical Transformation**: A 512-dimensional vector is an abstract directional coordinate in a high-dimensional hypersphere. It represents facial curvature and distance relationships—**it is mathematically impossible to reconstruct the student's original face photograph from a 512D vector**.
2. **Useless Outside MedAttend**: Stolen vectors cannot be used to unlock consumer phones, recreate 3D face models, or generate deepfakes.
3. **In-Memory Volatility**: During live CCTV RTSP streaming, decoded video frames reside solely in volatile system RAM (`numpy.ndarray`) for $< 0.1$ seconds before garbage collection (`gc.collect()`). Video frames are never written to disk.

---

## 3. Digital Personal Data Protection (DPDP) Act 2023 Compliance

### Explicit Informed Consent
Under Section 6 of the DPDP Act 2023, processing biometric data requires explicit, freely given, and informed consent:
- During student orientation and biometric onboarding, each student's explicit consent is registered.
- The system logs `biometric_consent: true`, the consenting timestamp, and the enrolling administrator's ID in the student record.

### Purpose Limitation
Biometric feature vectors stored in MedAttend are strictly restricted to:
- Verifying presence during scheduled academic class sessions.
- Calculating attendance eligibility under NMC guidelines.
- **Prohibition**: Facial vectors are never shared, monetized, federated across institutions, or used for commercial behavioral tracking.

### Right to Erasure & Biometric Revocation
Under Section 12 of the DPDP Act 2023 (Right to Correction and Erasure), any student or legal guardian has the right to withdraw biometric consent at any time:
- An authorized administrator or student can trigger the revocation endpoint:
  ```http
  POST /api/students/{id}/revoke-biometrics
  ```
- **What Happens Instantly**:
  1. The 512D ArcFace vector is permanently overwritten with `NULL` in the database.
  2. The student's facial cache is evicted from active memory.
  3. The student's status transitions to manual/PIN attendance mode.
  4. An audit record is created documenting the exact timestamp and actor who initiated the revocation.

---

## 4. Three-Tier Zero-Trust Role-Based Access Control (RBAC)

MedAttend enforces rigorous architectural separation across institutional roles:

```
                  ┌───────────────────────────────────────────────┐
                  │                 Super Admin                   │
                  │   - Full institutional governance             │
                  │   - Manage Admins, Faculty & Settings         │
                  │   - Inspect complete Audit Logs Ledger        │
                  └───────────────────────┬───────────────────────┘
                                          │
                                          ▼
                  ┌───────────────────────────────────────────────┐
                  │                    Admin                      │
                  │   - Manage Faculty & Sessions                 │
                  │   - Configure MBBS Curricula                  │
                  │   - Zero-Trust: Super Admins are HIDDEN       │
                  └───────────────────────┬───────────────────────┘
                                          │
                                          ▼
                  ┌───────────────────────────────────────────────┐
                  │                   Faculty                     │
                  │   - Session Isolation: Own classes only       │
                  │   - Cannot access /users or system settings   │
                  └───────────────────────────────────────────────┘
```

- **Password Security**: All user passwords are encrypted using **bcrypt** with a work factor of 12 (`$2b$12$`).
- **Session Tokens**: Protected using secure, HTTP-only, `SameSite=Lax` cookies that are immune to clientside JavaScript XSS extraction.
- **Zero-Trust Administrative Scoping**: Admins cannot view, edit, or tamper with Super Administrator accounts in `/users`.

---

## 5. Immutable Security Audit Ledger (`/audit-logs`)

To ensure absolute administrative transparency and eliminate unauthorized attendance tampering, MedAttend maintains an **Immutable Audit Log Ledger**:

### Events Captured in the Audit Ledger:
- Every manual attendance insertion, deletion, or override (`attendance/mark`).
- Student PIN resets and credential regenerations.
- Staff user provisioning, credential edits, and deactivations.
- Biometric vector burst enrollments and revocations.
- Classroom GPS coordinate calibrations.

### Data Attributes Recorded:
- **Timestamp**: High-precision UTC timestamp.
- **Actor Identity**: Full Name, Username, and Role of the actor.
- **Client IP & User Agent**: Request origin IP and browser signature.
- **Severity Level**: `INFO` (routine operations), `WARN` (credential resets), `CRITICAL` (biometric revocations, admin alterations).
- **Audit Immutability**: Audit logs cannot be deleted, modified, or truncated through the user interface.

---

## 6. Network & Cryptographic Transport Security

1. **Transport Layer Encryption (TLS 1.3)**: All web and API traffic is encrypted in transit over HTTPS.
2. **Cloudflare HMAC-SHA256 Authenticated Tunnels**: Remote check-ins routed through dynamic Cloudflare tunnels require HMAC-SHA256 cryptographic signatures registered with Supabase, preventing DNS spoofing and unauthorized proxy interception.
3. **Internal Sub-Stream Isolation**: Local RTSP camera feeds communicate over an isolated campus CCTV VLAN (`192.168.1.0/24`), ensuring raw video streams are never exposed to public internet endpoints.

---

*MedAttend AI — Built with Privacy by Design, Guided by Ethical Technology Standards.*
