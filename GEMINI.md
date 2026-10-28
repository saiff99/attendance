# 🤖 MedAttend AI — Workspace Agent Rules & Permanent Directives
**Universal Directives for all AI Assistants & Subagents operating in this repository**

---

## 🏛️ 1. Absolute Authority: Context Architecture Vault
- The directory [`docs/architecture-vault/`](docs/architecture-vault/INDEX.md) is the **Authoritative Single Source of Truth** for this entire repository.
- Every new conversation or agent turn **must** respect the architectural decisions, constraints, and schemas documented therein:
  - `01_SYSTEM_TOPOLOGY_AND_DATA_FLOW.md` (Topology, failover, Vercel Edge, FastAPI, Cloudflare, Supabase)
  - `02_ARCHITECTURE_DECISION_RECORDS.md` (ADR-001 to ADR-008: InsightFace 512D, Cloudflare, Hugging Face failover, etc.)
  - `03_HARD_CONSTRAINTS_AND_SECURITY_RULES.md` (5-minute window, geofence, liveness, device lock, RLS)
  - `04_API_CONTRACTS_AND_DATABASE_SCHEMAS.md` (PostgreSQL schemas, tag syntax `[GPS:...][BY:...][WA:...]`, REST contracts)
  - `05_EDGE_CASES_AND_SOLVED_GOTCHAS.md` (16px Safari zoom fix, Faraday cage GPS calibration, on-demand re-check sync)

---

## 🔔 2. Mandatory Proactive Vault Synchronization Reminder
Whenever working on any task with the user, if the requested change introduces or modifies any of the following:
1. **Database tables, columns, migrations, or foreign keys**
2. **Core security rules, countdown windows, anti-spoofing criteria, or geofence thresholds**
3. **Architectural components, failover mechanics, or network ingress**
4. **Critical solved bugs, platform gotchas, or edge case fixes**

You **MUST PROACTIVELY REMIND** the user at the conclusion of your response:
> *"যেহেতু আমরা অমুক কাঠামোগত পরিবর্তনটি করেছি, তাই আমাদের Context Architecture Vault-এর [ফাইলের নাম] ফাইলটি আপডেট করা প্রয়োজন। আপনি সম্মতি দিলে আমি এখনই তা আপডেট করে দিচ্ছি।"*

Once the user approves, immediately update the corresponding document in `docs/architecture-vault/` and commit/push to git.

---

## 🛡️ 3. Non-Negotiable Hard Security Constraints
- **Never store raw facial photos:** Only store 512-dimensional ArcFace unit vectors (`JSONB`).
- **Never bypass the 5-minute session countdown:** `remaining_seconds > 0` and `is_expired === false` enforced on both client and server.
- **Never commit plaintext secrets:** All keys, passwords, and tokens strictly via `.env` / `.env.local`.
- **Preserve mobile 16px inputs:** To avoid iOS Safari auto-zoom distortion, all inputs on mobile must have font-size `>= 16px`.
- **Maintain non-cascading data retention:** Attendance records must never be cascaded on deletion (`ON DELETE RESTRICT`).

---

## 🗣️ 4. Communication Style
- Always communicate with the user in polite, respectful, and clear **Bengali (বাংলা)**.
- Always use clickable `file://` markdown links when referencing local files.
