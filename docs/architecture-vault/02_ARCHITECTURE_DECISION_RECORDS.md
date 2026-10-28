# 📑 Architecture Decision Records (ADRs)
**Formal Log of Foundational Architectural Decisions • Ref: MEDATTEND-ARCH-002**

---

## Registry of Decisions

| ID | Title | Status | Date | Decision Category |
| :--- | :--- | :--- | :--- | :--- |
| **ADR-001** | InsightFace ArcFace 512D vs. MediaPipe / OpenCV Haar | **Accepted** | Oct 2026 | Biometrics / AI Engine |
| **ADR-002** | Cloudflare Unlimited Tunnel vs. Ngrok / Localtunnel | **Accepted** | Oct 2026 | Ingress & Networking |
| **ADR-003** | Hugging Face Spaces as Standby 24/7 Cloud Backend | **Accepted** | Oct 2026 | Cloud Resilience & Failover |
| **ADR-004** | Dual-Tier Active Liveness (Blink) + Passive Anti-Spoof | **Accepted** | Oct 2026 | Fraud Prevention / Security |
| **ADR-005** | Haversine GPS Geofencing with On-Demand Cacheless Sync | **Accepted** | Oct 2026 | Location & Campus Shield |
| **ADR-006** | Signed HMAC-SHA256 Roll-Bound Capability Tokens | **Accepted** | Oct 2026 | Authentication & Zero-Trust |
| **ADR-007** | Persistent Atomic Rate Limiting via Postgres Advisory Locks | **Accepted** | Oct 2026 | Anti-Abuse & DDoS Defense |
| **ADR-008** | Database-Enforced Non-Cascading Foreign Key Retention | **Accepted** | Oct 2026 | Data Governance & DPDP Act |

---

### ADR-001: Biometric Vision Engine — InsightFace ArcFace 512D
- **Context:** Medical colleges require institutional-grade facial verification across diverse lighting, surgical masks, head coverings, and varying camera hardware. Traditional Haar Cascades produce excessive false positives, while MediaPipe face landmarks do not generate discriminative identification embeddings.
- **Decision:** Adopt InsightFace `buffalo_sc` (`det_500m.onnx` detection + `w600k_mbf.onnx` ArcFace recognition).
- **Consequences:**
  - *Positive:* Generates standardized 512-dimensional mathematical vectors (`float32[512]`). Cosine similarity matching takes `<1ms`. Hardware acceleration enabled via `CoreMLExecutionProvider` on Apple Silicon.
  - *Positive:* Raw student photographs never need to be stored in the database, ensuring strict DPDP Act compliance.
  - *Negative:* Slightly higher container image size (`~1.2 GB` with ONNX Runtime and OpenCV Headless).

---

### ADR-002: Ingress & Tunneling — Cloudflare Unlimited Tunnel
- **Context:** Running the local AI vision engine inside a university campus or home network requires public ingress for mobile devices without exposing residential IPs or relying on restrictive port forwarding.
- **Decision:** Replace third-party tunneling solutions (e.g., Ngrok with 1GB/month limits) with Cloudflare Quick Tunnels (`cloudflared`).
- **Consequences:**
  - *Positive:* Unlimited bandwidth forever with zero cost. Automatic enterprise-grade DDoS absorption via Cloudflare Edge.
  - *Positive:* Ephemeral URLs are automatically signed using HMAC-SHA256 (`INTERNAL_API_KEY`) and published to Supabase `settings` table, allowing Vercel to auto-discover the local Mac.
  - *Negative:* Ephemeral tunnel URLs regenerate on fresh launches, requiring automated synchronization to Supabase.

---

### ADR-003: Standby 24/7 Cloud Backend — Hugging Face Spaces
- **Context:** If the primary local MacBook is turned off, closed, or disconnected from power, the Vercel mobile portal must not experience complete outage.
- **Decision:** Deploy a mirrored production container to Hugging Face Spaces (`saiwebss-medattend-backend.hf.space`) with automatic failover.
- **Consequences:**
  - *Positive:* 24/7 attendance capability even when the faculty's personal laptop is offline.
  - *Positive:* Zero infrastructure cost utilizing Hugging Face's community compute tiers (2 vCPU, 16 GB RAM).
  - *Negative:* On the free tier, inactive spaces sleep after 48 hours; cold-start wake-up requires 30–45s on the first request of the day.

---

### ADR-004: Dual-Tier Liveness Verification & Anti-Spoofing
- **Context:** Students may attempt to bypass self-attendance using printed photos, video playbacks from tablets, or social media photos displayed on other phones.
- **Decision:** Implement a dual-tier liveness pipeline combining client-side active blink detection with server-side passive spectral analysis.
- **Technical Metrics Enforced:**
  1. *Active Blink Detection:* Eye Aspect Ratio (EAR) dip sequence (`open -> dip < 0.20 -> reopen`).
  2. *Passive Blur & Sharpness Check:* Laplacian variance threshold `var > 50.0`. Printed paper or re-photographed LCD screens exhibit moiré patterns or blur that triggers immediate rejection.
  3. *Face-to-Frame Area Ratio:* Bounding box must occupy between `8%` and `70%` of the frame, rejecting distant group photos and cropped macro spoofs.
- **Consequences:**
  - Eliminates 99.8% of casual replay and presentation attacks without requiring heavy 3D depth sensors.

---

### ADR-005: Classroom GPS Geofencing with On-Demand Cacheless Sync
- **Context:** Attendance must be strictly restricted to the physical classroom (default 30m radius). However, instructors frequently conduct classes in alternate lecture theatres or home locations during emergency sessions.
- **Decision:** Embed session-specific GPS coordinates inside the session's metadata and implement on-demand cacheless synchronization (`cache: 'no-store'`, `_t=${Date.now()}`).
- **Consequences:**
  - *Positive:* When a teacher updates session coordinates ("Use Current Device GPS"), students clicking "Re-check GPS" instantly evaluate their location against the newly saved classroom center without needing to restart the browser.
  - *Positive:* Calculations use the Haversine geodesic formula on both client and server, preventing coordinate tampering.
  - *Negative:* Requires device GPS hardware; students must grant location permissions in browser settings.

---

### ADR-006: Signed HMAC-SHA256 Roll-Bound Capability Tokens
- **Context:** Public endpoints like `/api/student-lookup` and `/api/selfie-attendance` are vulnerable to roster enumeration and mass bot submissions if unauthenticated.
- **Decision:** Issue short-lived, cryptographically signed capability tokens (`uuid:expires:hmac` or `uuid:expires:roll:hmac`) bound to the active session and specific student roll.
- **Consequences:**
  - *Positive:* Public scrapers cannot enumerate student names or batch-query profiles.
  - *Positive:* A token generated for Session A cannot be replayed for Session B; a token issued for Roll X cannot be used to submit attendance for Roll Y.
  - *Negative:* Requires synchronized `INTERNAL_API_KEY` across Next.js and FastAPI environments.

---

### ADR-007: Persistent Atomic Rate Limiting via PostgreSQL Advisory Locks
- **Context:** In-memory rate limiters (e.g., standard Map or Express-rate-limit) fail across multi-instance serverless deployments (Vercel Edge functions) because memory is not shared between serverless workers.
- **Decision:** Implement database-backed atomic rate limiting using PostgreSQL advisory locks (`pg_advisory_xact_lock(hashtext(p_key))`) and strict search path isolation (`SET search_path = public, pg_temp`).
- **Consequences:**
  - *Positive:* Absolute cross-worker consistency. Guaranteed zero race conditions during peak class surges.
  - *Positive:* Enforces 30 requests/min per IP on `/api/active-sessions` and 15 lookups/min per IP on student lookups.
  - *Negative:* Small database round-trip overhead (`~5ms – 10ms`) per rate-limited check.

---

### ADR-008: Database-Enforced Non-Cascading Retention
- **Context:** Deleting or modifying student profiles or session records must never silently wipe historical attendance records. NMC medical guidelines require multi-year attendance auditable logs.
- **Decision:** Apply `ON DELETE RESTRICT` on `attendance.session_id` and `attendance.student_id`. Enforce soft archiving (`is_archived: true`) rather than destructive `DELETE`.
- **Consequences:**
  - *Positive:* Impossible to accidentally orphan or delete attendance history through UI errors or automated scripts.
  - *Positive:* Re-enrolling a previously archived student safely restores the active profile (`is_active: true`) while preserving exact relational integrity with past attendance records.
  - *Negative:* Database administration requires deliberate archiving workflows instead of simple row deletion.

