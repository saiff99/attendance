# 🛠️ Edge Cases & Solved Gotchas
**Historical Troubleshooting Registry & Regression Prevention • Ref: MEDATTEND-ARCH-005**

---

## 📌 Purpose

This document catalogs critical real-world edge cases, platform-specific quirks, and hard-won debugging solutions encountered across institutional deployments of MedAttend AI. **Never alter or delete the architectural fixes detailed below.**

---

### Gotcha 1: iOS Safari Input Focus Auto-Zoom Distortion
- **Symptom:** On iPhones running iOS Safari, tapping into the Roll Number input or topic fields caused the entire web page to automatically zoom in by 10%–20%, breaking the mobile UI layout and forcing students to pinch-to-zoom back out.
- **Root Cause:** iOS WebKit has a hardcoded accessibility behavior: if any `<input>`, `<select>`, or `<textarea>` element has a `font-size` smaller than `16px` (`1rem`), Safari automatically magnifies the viewport upon focus.
- **Architectural Fix:** Enforced in `frontend/src/app/globals.css`:
  ```css
  /* Prevent iOS Safari auto-zoom on input focus by enforcing minimum 16px font size */
  @media screen and (max-width: 768px) {
    input[type="text"],
    input[type="number"],
    input[type="password"],
    input[type="search"],
    select,
    textarea {
      font-size: 16px !important;
    }
  }
  ```
- **Rule:** Never style mobile form inputs with text smaller than `16px` on mobile viewports.

---

### Gotcha 2: RCC Concrete & Ground Floor "Faraday Cage" GPS Drift
- **Symptom:** Students sitting inside ground-floor medical college lecture halls (encased in thick Reinforced Cement Concrete - RCC and metal reinforcement bars) reported red GPS boundary warnings (`"Outside Campus > 30m"`), even while physically seated in class. Google Maps also showed location circles drifting 30–50m outside the building.
- **Root Cause:** RCC multi-story structures attenuate GNSS/GPS satellite L1/L5 radio signals, forcing mobile phones to fall back to coarse Wi-Fi BSSID triangulation and cellular tower multi-path signals with high variance.
- **Architectural Fix:** Implemented a two-pronged institutional solution:
  1. **Multi-Sample Calibrator:** `getCalibratedHighPrecisionGPS()` gathers 3 to 5 successive GPS fixes over a 2.5s window, filtering out sudden satellite jumps and taking the median high-confidence fix.
  2. **Classroom GPS Shield ("Use Current Device GPS"):** The faculty member starts the session from their smartphone or laptop seated directly in that classroom. The teacher clicks *"Use Current Device GPS"*, locking the session center to the exact local indoor RF environment of that specific lecture hall.

---

### Gotcha 3: On-Demand "Re-Check GPS" State Desync
- **Symptom:** If a teacher started a session from their office and later updated the session coordinates to their current room via the "GPS Geofence Shield", students clicking the **"Re-check GPS"** button continued seeing the old red error box. Only killing the mobile browser and reopening the URL forced the new coordinates to load.
- **Root Cause:**
  1. `fetchActiveSessions()` and `verifyUserLocation(true)` were invoked concurrently via `Promise.all`.
  2. `verifyUserLocation` evaluated against `effectiveGeofence` from the current React render closure (stale coordinates) before the network response updated React state.
  3. `processSessionsList()` in `SelfieAttendClient.tsx` was dropping the `s.geofence` property during client array mapping, causing `effectiveGeofence` to fall back to static campus defaults.
- **Architectural Fix:**
  1. Updated `processSessionsList()` to preserve `geofence: sessionGeofence`.
  2. `fetchActiveSessions()` returns `Promise<ActiveSession[]>` with cache-busting headers (`_t=${Date.now()}`, `cache: "no-store"`).
  3. `handleRecheckGps` sequentially fetches the fresh session list, extracts the matching session's updated geofence, and directly passes it into `verifyUserLocation(true, targetGeofence)`.
  4. The distance recalculates against the new coordinates immediately, clearing the warning and turning the UI green without requiring a page refresh.

---

### Gotcha 4: Student Roster Re-Enrollment & Foreign Key Collisions
- **Symptom:** If an archived student profile (e.g., student returning after a semester gap or batch repeat) was re-enrolled with the same roll number, simple database `INSERT` operations failed with `UNIQUE constraint violation` on `student_roll`, while deleting the old profile first failed due to `ON DELETE RESTRICT` foreign keys in `attendance`.
- **Root Cause:** Deleting an archived student would orphan multi-year NMC compliance records in `attendance`.
- **Architectural Fix:** Implemented intelligent auto-restoration in `frontend/src/app/api/students/route.ts`:
  ```typescript
  if (existingArchived) {
    await supabaseServer
      .from('students')
      .update({ is_active: true, is_archived: false, archived_at: null, ...newData })
      .eq('id', existingArchived.id);
    await logAuditEvent({ action: 'RESTORE_ARCHIVED_STUDENT', target_id: existingArchived.id });
  }
  ```
- **Result:** Re-enrolling restores the exact existing `student_id`, seamlessly preserving past attendance history without relational errors.

---

### Gotcha 5: Next.js 15 Async Dynamic Route Parameters (`params`)
- **Symptom:** Upgrading to Next.js 15 triggered runtime warnings: `Route "/api/sessions/[id]" used params.id. In Next.js 15, params is a Promise and must be awaited.`
- **Root Cause:** Next.js 15 changed dynamic route parameters from synchronous objects to Promises to optimize partial prerendering.
- **Architectural Fix:** All dynamic route handlers in `frontend/src/app/api/**/[id]/route.ts` must explicitly type and await `params`:
  ```typescript
  export async function GET(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
  ) {
    const { id } = await params;
    // ...
  }
  ```

---

### Gotcha 6: Supabase Free Tier Connection Pool Exhaustion (PgBouncer)
- **Symptom:** Under concurrent surges (e.g., 200 students querying `/api/active-sessions` in 10 seconds), Supabase threw `FATAL: remaining connection slots are reserved for non-replication superuser connections (error 53300)`.
- **Root Cause:** Connecting directly to PostgreSQL port `5432` allocates 1 heavy process per client connection. The Supabase free tier limits direct connections to 60.
- **Architectural Fix:**
  - Route all application queries through the Supavisor / PgBouncer transactional connection pooler on port `6543`.
  - Enforced short statement timeouts (`statement_timeout = 8000ms`) and added client-side retry with exponential backoff on transient connection failures.

