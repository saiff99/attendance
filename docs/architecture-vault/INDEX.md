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
| **[02. Architecture Decision Records (ADRs)](./02_ARCHITECTURE_DECISION_RECORDS.md)** | Formal documentation of *why* specific engines, protocols, and designs were chosen over alternatives. |
| **[03. Hard Constraints & Security Rules](./03_HARD_CONSTRAINTS_AND_SECURITY_RULES.md)** | Non-negotiable architectural mandates (5-minute window, anti-spoofing thresholds, rate limits, RLS). |
| **[04. API Contracts & Database Schemas](./04_API_CONTRACTS_AND_DATABASE_SCHEMAS.md)** | Detailed payload schemas, headers, status codes, PostgreSQL tables, metadata tags, and foreign keys. |
| **[05. Edge Cases & Solved Gotchas](./05_EDGE_CASES_AND_SOLVED_GOTCHAS.md)** | Real-world institutional gotchas (Safari 16px zoom, RCC Faraday GPS attenuation, Re-check GPS sync, LAN IP cookie handling, insecure mediaDevices guards). |

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

*Last Verified & Certified: October 2026*  
*Architecture Compliance: Production-Grade, Zero-Trust, DPDP Act 2023 Aligned*

