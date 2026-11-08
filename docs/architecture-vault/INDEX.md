# 🏛️ MedAttend AI — Context Architecture Vault
**Authoritative Single Source of Truth for Architecture, System Contracts & Engineering Guidelines**

---

## 📌 Executive Overview

The **MedAttend AI Context Architecture Vault** is the definitive, immutable knowledge repository for the MedAttend AI biometric attendance ecosystem. It records the complete technical blueprint, architectural decisions, strict security constraints, API contracts, database schemas, and hard-won edge case solutions.

Whenever human engineers, system administrators, or AI pair-programmers interact with this repository, this vault serves as the **foundational context** to ensure:
1. Zero regression of previously resolved bugs or security controls.
2. Complete adherence to cryptographic, privacy, and regulatory mandates (DPDP Act 2023 & NMC Directives).
3. Consistent and predictable scale across Vercel Edge, FastAPI AI, Cloudflare Tunnels, and Supabase PostgreSQL.

---

## 🗂️ Vault Structure & Navigation

| Document | Purpose & Key Contents |
| :--- | :--- |
| **[01. System Topology & Data Flow](./01_SYSTEM_TOPOLOGY_AND_DATA_FLOW.md)** | End-to-end component architecture, network ingress, failover pipelines, and Mermaid diagrams. |
| **[02. Architecture Decision Records (ADRs)](./02_ARCHITECTURE_DECISION_RECORDS.md)** | Formal documentation of *why* specific engines, protocols, and designs were chosen over alternatives (ADR-001 to ADR-055: InsightFace 512D, Cloudflare, Hugging Face, Pure Dark Mode, Vectorized 2D Matrix matching, In-Memory Biometric Caching, Zero-Trust Biometric Vector Minimization, Parallelized Reports with Date-Range Windowing, Adaptive Visibility-Aware Polling & User Map Caching, Atomic Single-Roundtrip Batch Upsert, Periodic Rate-Limiter Pruning, Unified Stream Biometric Cache, High-Velocity Partial & Composite Indexes, Adaptive CCTV Log Polling & Session Metadata Caching, Student Portal SQL Archival Pushdown & Safe Bounding, Reports Dashboard Bounded Pagination & API SQL Pushdown, User Mutation-Driven User Map Cache Invalidation, Ephemeral Device-Lock Sanitization from Database Backups, Centralized Session Metadata Caching & Mutation Eviction, Server-Side Geofence In-Memory Caching & Fault-Tolerant Fallback, Main Dashboard Concurrency Optimization, Cached User Map Reuse & SQL Pushdown, FastAPI Backend Thread-Safe Session Metadata In-Memory Caching & Fault-Tolerant Fallback, Smart Dormant Circuit-Breaker & Exponential Backoff for Unstable/Dormant RTSP Camera Streams, In-Memory Pre-Stacked 2D ArcFace Embedding Matrix Caching & Zero-Allocation Vectorized Face Matching, Server-Side Attendance Aggregation RPC for Reports Dashboard, Offload Selfie Liveness Frame Analysis to Web Worker with requestAnimationFrame Pacing, Pure Hands-Free Dual Auto-Capture for Anti-Spoofing Selfie Attendance, High-Performance Incremental Delta Polling for Live Session Attendance Logs, On-Demand Dynamic Loading / Code Splitting for Heavy Vendor Dependencies ExcelJS, Asynchronous Concurrency Limiting asyncio.Semaphore for AI Face Inference to Prevent Classroom Thundering Herd, In-Memory Biometric RAM Caching & O(1) Roll Index for Zero-DB-Hit Student Selfie Attendance Verification, Role-Based Audit Log & Headcount Query Bypass with In-Memory Creator Caching in Active Sessions API, Next.js Client-Facing Campus Geofence In-Memory 5-Minute TTL Caching & Zero-DB-Hit Resilience, In-Memory Session Attendance Caching & Single-Roundtrip Atomic Save for Zero-Redundant SELECT Database Queries, Rate Limiter L2 Settings Table Thrashing Mitigation via Session-Scoped Batch Ingestion and Conditional Failure Purging, Live-Scan Dashboard Attendance Card Memoization & Session Timer Isolation for Zero-Re-Render Scalability, Portal-Native 1-Tap Attendance & Complete Elimination of Impractical Classroom QR Codes, Faculty Mobile Dynamic Multi-Photo Capture & Batch Attendance Processing Pipeline, Dedicated Web Worker & OffscreenCanvas Offloading for Zero-Jank Client-Side Image Optimization, Controlled Dual-Connection Concurrent Upload Pipeline 2x Concurrency for Batch Attendance, Per-Photo Exponential Backoff Retry with Smart Error Discrimination for Mobile Network Flakes, Fast-Path ONNX Runtime Thread Tuning & Memory-Mapped Image Decoding via np.frombuffer and cv2.imdecode, Real-Time Classroom Framing & Blur/Low-Light Quality Advisor Engine, Interactive Face Bounding-Box Inspector & 1-Tap Manual Correction, Offline-First Classroom Photo Staging via IndexedDB, Large Classroom High-Resolution Face Detector Scaling 1280x1280, Modular Code-Splitting and Component Decomposition for Live-Scan Faculty Hub, Zero-Overhead Virtualized Card Rendering via CSS content-visibility for 300+ Student Rosters). |
| **[03. Hard Constraints & Security Rules](./03_HARD_CONSTRAINTS_AND_SECURITY_RULES.md)** | Non-negotiable architectural mandates (5-minute window, anti-spoofing thresholds, rate limits, RLS, student registry RBAC least-privilege, student PIN change sliding-window protection, classroom photo attendance session authentication & biometric preservation, pure hands-free auto-capture & zero manual proxy bypass, silent in-class verbal trigger & prohibition of broadcast session notifications). |
| **[04. API Contracts & Database Schemas](./04_API_CONTRACTS_AND_DATABASE_SCHEMAS.md)** | Detailed payload schemas, headers, status codes, PostgreSQL tables, metadata tags, and foreign keys. |
| **[05. Edge Cases & Solved Gotchas](./05_EDGE_CASES_AND_SOLVED_GOTCHAS.md)** | Real-world institutional gotchas (Safari 16px zoom, RCC Faraday GPS attenuation, Re-check GPS sync, LAN IP cookie handling, insecure mediaDevices guards, mobile aspect-video flex blowout, platform-aware GPS permission guidance, 60s face failure lockout live ticker, Background tab polling storm, Headless CI minimal ONNX isolation, MJPEG CORS preflight & dormant camera standby, HTTP/2 stream rotation & unshielded query resilience, Per-frame 512D ArcFace array re-allocation and L2-norm redundancy in high-velocity video inference, PostgREST 1,000-Row Hard Cap & Sequential 50,000-Row Chunked Attendance Fetching Bottleneck in Reports, Main-Thread setInterval Liveness Video Frame Stutter and GPU Readback Jank on Mobile, Eye Region Luminance Dilution & Auto-Exposure Lock Causing Infinite Selfie Scanning Freeze, Tailwind CSS v4 Standalone CSS translate Property Unsupported on Legacy Android Chromium / WebView (Chrome < 104) Causing Pinned Mobile Sidebar). |

---

## ⚡ High-Level System Architecture at a Glance

```
                         [ Student Mobile / Faculty Desktop ]
                                          |
                +-------------------------+-------------------------+
                |                                                   |
        (Web UI & Next.js APIs)                             (Direct AI Biometrics)
                |                                                   |
                v                                                   v
     [ Vercel Edge Global CDN ]                             [ Cloudflare Tunnel ]
   (Next.js 15 Production App)                         (Unlimited Bandwidth Ingress)
                |                                                   |
                +-------------------------+                         v
                |                         |              [ Local FastAPI AI Hub ]
                v                         v             (Mac M-Series CoreML / CPU)
     [ Supabase PostgreSQL ]     [ Hugging Face Spaces ]  (InsightFace ArcFace 512D)
   (RLS Policies, PgBouncer,     (24/7 Standby Cloud AI            |
    Audit Ledger, JSONB Vectors)   Automatic Failover)             |
                ^                         ^                        |
                |                         +------------------------+
                +--------------------------------------------------+
                             (Postgres Synchronization)
```

---

## 📜 How to Maintain this Vault

1. **Rule of Architectural Synchronization:** Any change to backend logic, API request/response structures, security policies, or database schemas **MUST** be reflected in this vault in the same commit.
2. **Zero Plaintext Secrets:** No production secrets, service role keys, or database passwords may ever be committed to any markdown document within this vault.
3. **Immutability of Historical ADRs:** Existing Architecture Decision Records (ADRs) must never be rewritten. If an architectural decision changes, author a new ADR (e.g., `ADR-009`) superseding the older decision.

---

*Last Verified & Certified: November 2026*  
*Architecture Compliance: Production-Grade, Zero-Trust, DPDP Act 2023 Aligned*

