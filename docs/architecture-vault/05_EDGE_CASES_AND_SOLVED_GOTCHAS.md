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

---

### Gotcha 7: Local LAN IP (HTTP) Cookie Rejection & Infinite Login Redirect Loop
- **Symptom:** Accessing the application via local Wi-Fi or LAN IP address (e.g., `http://172.16.2.76:3000` or `http://192.168.1.50:3000`) allows viewing the login page, but submitting valid credentials leaves the button indefinitely stuck on `"Redirecting to Dashboard..."` or immediately bounces the user back to `/login?from=%2F`.
- **Root Cause:**
  1. RFC 6265bis specifications dictate that browsers treat `localhost` and `127.0.0.1` as "Potentially Trustworthy Origins", allowing `Secure` cookies over plain HTTP. However, private LAN IP addresses (`172.16.x.x`, `192.168.x.x`, `10.x.x.x`) are classified as untrusted plain HTTP (`⚠️ Not Secure`).
  2. The Next.js login endpoint previously set `secure: process.env.NODE_ENV === 'production'`. In production builds (`npm run build && npm start`), this evaluated to `secure: true`.
  3. Chromium, Safari, and Firefox strictly drop and reject any incoming `Set-Cookie` header carrying the `Secure` attribute over an insecure HTTP connection.
  4. Although the API authenticated successfully (`200 OK`), the browser discarded `medattend_session`. When the client navigated to `/`, Next.js `middleware.ts` found no session cookie and redirected the user straight back to `/login`.
- **Architectural Fix:**
  1. **Dynamic Transport-Aware Cookie Security (`frontend/src/app/api/auth/login/route.ts`):** Dynamically evaluate the transport protocol using `x-forwarded-proto` and `new URL(request.url).protocol`. Only set `secure: true` when accessed via actual TLS/HTTPS (e.g., Vercel Edge, custom HTTPS domain, Cloudflare SSL). Over local unencrypted HTTP, set `secure: false`:
     ```typescript
     const forwardedProto = request.headers.get('x-forwarded-proto');
     const isHttps = forwardedProto ? forwardedProto.includes('https') : new URL(request.url).protocol === 'https:';
     
     response.cookies.set({
       name: SESSION_COOKIE_NAME,
       value: token,
       httpOnly: true,
       secure: isHttps,
       sameSite: 'lax',
       path: '/',
       maxAge: 36000,
     });
     ```
  2. **CORS Regex Subnet Ingress (`backend/main.py` & `backend/app.py`):** Expanded `allowed_origin_regex` to permit local private LAN subnets (`10.0.0.0/8`, `172.16.0.0/12`, `192.168.0.0/16`) on standard development ports:
     ```python
     default_origin_regex = r"^(?:https://.*\.vercel\.app|https?://(?:localhost|127\.0\.0\.1|10\.\d+\.\d+\.\d+|172\.(?:1[6-9]|2\d|3[0-1])\.\d+\.\d+|192\.168\.\d+\.\d+)(?::\d+)?)$"
     ```
- **Rule:** Never hardcode cookie `secure: process.env.NODE_ENV === 'production'` without evaluating genuine connection TLS state. This ensures zero friction during institutional on-premise Wi-Fi/LAN testing while preserving maximum cryptographic protection in cloud production.

---

### Gotcha 8: Insecure HTTP Origin `navigator.mediaDevices` Disablement & Live Scan Crash
- **Symptom:** Accessing the application from a secondary device or desktop on the local LAN via private IP (e.g., `http://172.16.2.76:3000`) worked perfectly for login, Ongoing Sessions, Reports, and Academic Subjects. However, clicking the **"Live Scan"** menu immediately crashed with Next.js's dark error screen: `"This page couldn't load. Reload to try again, or go back."`
- **Root Cause:**
  1. Modern Web APIs restrict sensitive hardware capabilities (Webcams, Microphones, Screen Capture, WebRTC) exclusively to **Secure Contexts** (`window.isSecureContext === true`, i.e., `https://` or `localhost`).
  2. When accessing over an unencrypted local IP (`http://172.16.2.76:3000`), modern browsers (Chromium, WebKit, Gecko) intentionally strip and leave `navigator.mediaDevices` as `undefined`.
  3. `LiveScan` in `frontend/src/app/live-scan/page.tsx` previously ran `navigator.mediaDevices.enumerateDevices().then(handleDevices)` in an unguarded `useEffect` on mount.
  4. Evaluating `navigator.mediaDevices.enumerateDevices()` threw an uncaught `TypeError: Cannot read properties of undefined (reading 'enumerateDevices')`, crashing React during initial lifecycle hydration.
  5. Similarly, rendering `<Webcam>` from `react-webcam` without media devices triggered internal fallbacks to deprecated `MediaStreamTrack.getSources`, causing additional unhandled exceptions.
- **Architectural Fix:**
  1. **Safe MediaDevices Guard on Mount (`frontend/src/app/live-scan/page.tsx`):**
     ```typescript
     if (
       typeof window !== "undefined" &&
       typeof navigator !== "undefined" &&
       navigator.mediaDevices &&
       typeof navigator.mediaDevices.enumerateDevices === "function"
     ) {
       setHasMediaDevicesSupport(true);
       navigator.mediaDevices.enumerateDevices().then(handleDevices).catch(console.warn);
     } else {
       setHasMediaDevicesSupport(false);
     }
     ```
  2. **Non-Breaking Webcam Standby UI:** In the "Webcam" scan tab, if `!hasMediaDevicesSupport`, `<Webcam>` is replaced with an informative banner explaining that hardware webcams are blocked on unencrypted HTTP IP origins, directing users to use the **Multi-CCTV Grid** (RTSP/MJPEG over LAN) or open via `localhost` / HTTPS.
  3. **Omni-Modal Invariant:** Extended identical defensive media guards to `FaceRegistrationModal.tsx` and `SelfieAttendClient.tsx` to prevent camera initialization crashes anywhere in the platform.
- **Rule:** Never call `navigator.mediaDevices.*` or mount camera capture components without verifying `typeof navigator !== 'undefined' && Boolean(navigator.mediaDevices?.getUserMedia)`.

---

### Gotcha 9: `aspect-video` Flex Container Expansion & Horizontal Clipping on Mobile
- **Symptom:** On mobile viewports (e.g., iPhone 12/13/14/15/16 at 375px–390px width), the **"Take Classroom Group Photo"** card and adjacent **"Upload Photo"** card overflowed horizontally outside the screen boundaries. Text lines (`"photo. AI will recognize..."`), pill badges (`512D ArcFace`), and the right rounded borders were chopped off, breaking layout symmetry.
- **Root Cause:**
  1. The container element had CSS class `aspect-video` (`aspect-ratio: 16 / 9;`).
  2. The interactive card content (camera icon, header, subtitle, 3 pill badges, and CTA button) required ~320px–360px vertical height when stacked on narrow mobile screens.
  3. Because `aspect-ratio: 16 / 9` was set without an explicit `max-width: 100%` / dynamic height override, browser CSS layout calculated the intrinsic width from the height: `width = 340px * (16 / 9) ≈ 604px`!
  4. Inside an `overflow-hidden` or flex parent, this forced the container to blow out to ~600px wide, cutting off the right ~200px on 390px mobile screens.
- **Architectural Fix:**
  1. **Strict Separation of Video Feeds vs UI Action Cards (`frontend/src/app/live-scan/page.tsx`):** `aspect-video` is reserved strictly for genuine streaming video players (CCTV MJPEG/WebRTC streams). Interactive cards with variable text, badges, and buttons must NEVER use `aspect-video`.
  2. **Responsive Dynamic Height & Bounded Width:**
     ```tsx
     <div className="w-full max-w-full min-w-0 flex-1 flex flex-col items-center justify-center bg-gradient-to-b from-slate-900/90 via-slate-950 to-slate-950 rounded-2xl relative overflow-hidden group min-h-[260px] sm:min-h-[340px] lg:min-h-[420px] border border-slate-800 p-3.5 sm:p-6 lg:p-8 box-border">
     ```
  3. **Pill Flex Wrapping & Compact Mobile Padding:** Applied `shrink-0` on badges with responsive padding (`p-3.5 sm:p-6`) and shortened segmented mode tab labels on mobile (`Multi` instead of `Multi Cam`, `Upload` instead of `Upload Photo`) to prevent tab-bar blowout.
- **Rule:** Never apply `aspect-video` or fixed aspect ratios to flex containers containing stacked text, badges, or buttons. Always enforce `w-full max-w-full min-w-0 box-border` with content-adaptive heights (`min-h-[...]`).

