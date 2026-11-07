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

---

### Gotcha 10: iOS PWA Cold-Start Pre-Hydration Touch Dead-Zone & CSS Scale Tap Drop
- **Symptom:**
  1. On mobile devices (specifically iPhones running the installed PWA in standalone WebKit mode), tapping the 3-line hamburger menu icon immediately upon opening the app produced no activity—the slide-in sidebar menu did not open. However, if the user waited ~8–10 seconds after opening without touching anything, tapping the hamburger icon opened the sidebar instantly on the very first touch.
  2. Previously, tapping the hamburger icon also required a double-tap because the button's bounding box shrank during touch due to `active:scale-95`, causing iOS Safari to cancel the gesture.
- **Root Cause:**
  1. **The Uncanny Valley of SSR (Pre-Hydration Gap):** In an offline-first PWA, the service worker and WebKit render the cached HTML structure in ~100ms. The UI appears fully interactive, but the underlying JavaScript bundle (which included heavy SVG visualization libraries like `recharts` ~350KB) took 5–8 seconds to download, parse, and execute on mobile hardware. Before React 19 finished hydrating the page, the `<button>` had no native `onclick` or synthetic event listener attached, silently discarding any early tap.
  2. **Mount-Time Route Reset Interference:** In Next.js client layout components, an unguarded `useEffect(() => setIsOpen(false), [pathname])` fired on initial mount, forcibly resetting any early-toggled `isOpen` state back to `false`.
  3. **WebKit CSS Scale Touch Cancellation:** An `active:scale-95` transform shrank the button bounding box mid-gesture (`touchstart` to `touchend`), causing iOS WebKit to cancel the synthesized `click` event.
- **Architectural Fix:**
  1. **Instant Pre-Hydration Native DOM Bridge (`frontend/src/app/layout.tsx`):**
     Added an ultra-lightweight inline `<script id="medattend-mobile-sidebar-init">` in `<head>` that executes synchronously before any JS chunk is loaded. It attaches an early event listener to `document` to intercept `#mobile-sidebar-toggle`, directly toggling Tailwind classes (`translate-x-0` vs `-translate-x-full`) on `#medattend-sidebar` and displaying `#medattend-sidebar-backdrop` with 0ms latency.
  2. **Bi-Directional React Hydration Synchronization (`frontend/src/components/layout/Sidebar.tsx`):**
     When React hydrates, `Sidebar` checks the DOM classes to inherit any pre-hydration toggle state, and listens to custom `medattend-sidebar-sync` events to keep `isOpen` in lockstep without double-toggling or visual flicker.
  3. **Bundle Splitting & Lazy Loading (`frontend/src/app/page.tsx`):**
     Converted `AttendanceChart` to use `nextDynamic` (`next/dynamic`) with a sleek animated skeleton fallback, stripping ~350KB of Recharts code from the critical initial chunk.
  4. **Initial Mount Guard on Route Changes:**
     Implemented `initialPathRef = useRef(pathname)` so route changes close the drawer only when `initialPathRef.current !== pathname`, avoiding initial mount overrides.
  5. **Scale Elimination & Apple HIG 44px Touch Standards:**
     Replaced `active:scale-95` with instant `transition-colors`, enforcing `min-w-[44px] min-h-[44px]` touch targets with `touch-manipulation cursor-pointer select-none`.
- **Rule:** Never rely solely on React synthetic event listeners for critical mobile navigation elements (such as hamburger toggles) on PWA cold start. Always provide an inline native DOM bridge and decouple heavy third-party libraries from the critical initial bundle.

---

### Gotcha 11: Static Hardcoded macOS Location Permission Strings on Mobile & Cross-Platform GPS Fix
- **Symptom:** On Android devices and iPhones running the PWA, when location permissions were blocked or GPS was unavailable, the attendance portal displayed confusing, irrelevant guidance:
  `"Location permission was denied. Please allow location access in your browser settings and macOS System Settings > Privacy & Security > Location Services."`
  Additionally, consecutive redundant error boxes displayed this identical multi-line string on top of each other.
- **Root Cause:**
  1. During early desktop development on macOS, `frontend/src/lib/geofence.ts` hardcoded macOS-specific error strings directly into the `PERMISSION_DENIED` and `POSITION_UNAVAILABLE` error branches without user-agent or platform detection.
  2. In `SelfieAttendClient.tsx`, both the inline geofence status card and the outer permission warning banner rendered `geofenceErrorMessage` simultaneously, causing duplicate identical multi-line warning cards on mobile viewports.
- **Architectural Fix:**
  1. **Dynamic Platform-Aware Geolocation Formatter (`frontend/src/lib/geofence.ts`):**
     Implemented `getGeolocationErrorMessage(err)` which inspects `navigator.userAgent` to deliver exact, actionable OS-specific navigation:
     - **Android:** Directs students to `"browser or Android App Settings (Settings > Apps > Chrome/MedAttend > Permissions > Location)"`.
     - **iOS:** Directs students to `"iOS Settings > Safari (or MedAttend) > Location"`.
     - **Windows:** Directs users to `"Windows Settings > Privacy & Security > Location"`.
     - **macOS:** Retained exclusively for macOS environments.
  2. **Card Redundancy & Visual Hierarchy Decoupling (`SelfieAttendClient.tsx`):**
     - The inline GPS status card provides a concise, single-line alert (`⚠️ Location permission was denied. Please allow location access below and tap "Re-check GPS"`).
     - The dedicated warning banner below renders the detailed, platform-specific operating system steps without UI duplication.
- **Rule:** Never hardcode operating-system-specific paths or instructions (macOS, iOS, Android, Windows) in client-facing error strings. Always route through a platform detection helper to provide accurate, device-appropriate recovery instructions.

---

### Gotcha 12: Frozen 3-Attempt Face Verification Failure Warning & 60s Live Ticker Lock
- **Symptom:**
  When a student failed facial verification 3 consecutive times in `/selfieattend`, the application displayed a sticky, static warning card:
  `"Cooldown active: 3 failed face attempts recorded for Roll '26001' on this device. Please wait 97s."`
  The countdown number remained permanently frozen at `97s` without decrementing. Simultaneously, the `"Try Selfie Again"` button below remained clickable, allowing students to repeatedly trigger immediate 429 errors while trapped in the lockout.
- **Root Cause:**
  1. **Static Error Payload Assignment:** The API error handler in `SelfieAttendClient.tsx` stored `data.detail` directly into `resultData.message` as a static string. React had no interval timer or reactive state to decrement the remaining seconds dynamically.
  2. **Uncapped Server Lockout Window:** `backend/app/rate_limiter.py` previously locked students out for 120 seconds (`now_ts + 120.0`). In high-pressure classroom environments with 5-minute total attendance windows, a 2-minute lockout was excessively punitive.
  3. **Proxy Header Stripping:** The Next.js API route (`frontend/src/app/api/selfie-attendance/route.ts`) returned `NextResponse.json(data, { status: res.status })` without forwarding the upstream `Retry-After` header sent by the FastAPI backend.
  4. **Unconditional Retry Button:** The `"Try Selfie Again"` button was rendered without any state disabling or lockout condition, leaving students unaware of when it was safe to retry.
- **Architectural Fix:**
  1. **60-Second Maximum Lockout Ceiling (`backend/app/rate_limiter.py`):** Reduced failure cooldown duration from 120s to strictly 60s (`now_ts + 60.0`) and capped remaining seconds calculation with `min(60, max(1, math.ceil(locked_until - now_ts)))`.
  2. **API Proxy Header Preservation (`frontend/src/app/api/selfie-attendance/route.ts`):** Forwarded `Retry-After` upstream response header to the client.
  3. **Client-Side Live Countdown State & 1-Second Interval Ticker (`SelfieAttendClient.tsx`):**
     - Added `cooldownSeconds` reactive state initialized by extracting `Retry-After` header or regex matching `wait (\d+)s` (strictly clamped at `Math.min(60, waitSec)`).
     - Running a 1000ms `setInterval` effect to decrement `cooldownSeconds` by 1 second down to 0.
     - Dynamically substituted subtitle message `Please wait \d+s` with the live countdown value.
     - Added an interactive amber glowing status badge: `⏳ Cooldown Active: Please wait {cooldownSeconds}s before retrying`.
     - Disabled the `"Try Selfie Again"` button while `cooldownSeconds > 0` with explicit label: `Please wait {cooldownSeconds}s to retry`.
     - Automatically transitioned to an emerald green alert (`✅ Cooldown expired! You may now take a selfie again.`) and unlocked the button instantly at `0s` without requiring page reload.
- **Rule:** Never display static countdown warnings to end-users without an active reactive ticker. All rate-limit lockout intervals must be strictly bounded (capped at 60s max) and synchronize live client decrementing with backend header contracts.

---

### Gotcha 13: Background Tab Polling Storms, Campus Wi-Fi NAT 429 Collisions & Instant Visibility Wakeup
- **Symptom:**
  Faculty and administrative users leaving MedAttend browser tabs open or minimized during the school day inadvertently triggered `HTTP 429 Too Many Requests` for all users on the same campus Wi-Fi network, while consuming hundreds of thousands of Vercel serverless function invocations per month. In CCTV Live Scan mode (`/live-scan`), unthrottled 2-second log polling generated 1,800 requests/hour per background tab.
- **Root Cause:**
  1. `Sidebar.tsx`, `ongoing/page.tsx`, and `live-scan/page.tsx` executed unthrottled `setInterval` polling loops regardless of whether the browser tab was active, minimized, or occluded.
  2. A single open tab made 20 to 30 requests per minute. Two teachers on the same campus Wi-Fi NAT generated 40-60 requests/minute, breaching active-session and log IP rate limits.
  3. Redundant SQL queries were executed against static tables (`app_users`, and `sessions` metadata) on every single poll tick.
- **Architectural Fix:**
  1. **Page Visibility API Check:** In `Sidebar.tsx`, `ongoing/page.tsx`, and `live-scan/page.tsx`, suppress network fetches during interval ticks when `document.visibilityState !== 'visible'`.
  2. **Instant Wakeup Listener:** Register a `visibilitychange` listener on `document` that triggers an immediate fetch (`0ms` latency) the exact moment the tab becomes visible again, guaranteeing zero stale data.
  3. **Relaxed Adaptive Intervals:** Extended background intervals to 12s on the persistent sidebar, 6s on the ongoing monitor, and 4s on live-scan CCTV logs.
  4. **In-Flight Concurrency Guard:** Use ref-based boolean guards (e.g. `isFetchingLogsRef`) to prevent stacking queries during network latency spikes.
  5. **In-Memory TTL Caching:**
     - In `frontend/src/app/api/active-sessions/route.ts`, cached the `app_users` mapping in memory for 5 minutes (`getCachedUserMap()`).
     - In `frontend/src/app/api/attendance/session/[sessionId]/route.ts`, cached session metadata in memory for 60 seconds (`sessionInfoCache`), cutting per-poll database query volume by 50%.
- **Rule:** Background client intervals must always be visibility-aware. Never poll unthrottled when the tab is hidden; always use `document.visibilityState` guards combined with `visibilitychange` instant-wakeup listeners and in-memory metadata caching.

---

### Gotcha 14: Headless Minimal CI Runners Missing Heavy C++ AI Binaries (`onnxruntime`) & Offline Unit Test Isolation
- **Symptom:**
  GitHub Actions CI failed on commit `b6bc0f5` during the backend test suite with:
  `ModuleNotFoundError: No module named 'onnxruntime'` when loading `test_vectorized_matching.py`, followed by `FAIL: test_active_sessions_rate_limit_and_reset` due to network timeouts.
- **Root Cause:**
  1. In `.github/workflows/ci.yml`, the headless CI runner purposely installs only minimal offline Python dependencies (`numpy`, `opencv-python-headless`, `fastapi`, `supabase`) to keep test runs fast and lightweight, avoiding massive 300MB+ C++ AI runtimes (`onnxruntime`, `insightface`).
  2. `backend/app/ai.py` had `import onnxruntime as ort` at top-level outside any `try...except` block. When `test_vectorized_matching.py` imported mathematical matrix functions (`match_faces_vectorized`) which only require `numpy`, `ai.py` crashed on file load.
  3. In `test_security_unit.py`, the active sessions rate limiter test ran 30 iterations in a loop. With mock `ci-test-mock.supabase.co`, each iteration attempted 3 failing TCP/DNS roundtrips. The 30 iterations accumulated 4+ minutes of runner delay, causing the 60-second sliding-window timestamps to expire during the test run itself and failing the 31st call 429 assertion.
- **Architectural Fix:**
  1. Guarded `import onnxruntime as ort` inside the existing `try...except Exception as e:` block in `backend/app/ai.py` with `ort = None` fallback, allowing NumPy matrix functions to load anywhere without requiring `onnxruntime`.
  2. Isolated `test_active_sessions_rate_limit_and_reset` with `unittest.mock.patch("app.rate_limiter.supabase", None)` so offline unit tests test memory sliding-window algorithms in microseconds without external network dependencies.
- **Rule:** Never top-level import heavy, platform-compiled machine learning runtimes without a `try...except ImportError` fallback. Mathematical vector algorithms (`numpy`) must run cleanly in minimal headless environments without requiring runtime AI inference engines. Offline unit tests must strictly mock external database connections.

---

### Gotcha 15: MJPEG Video Stream CORS Preflight Rejection (`ngrok-skip-browser-warning`) & Infinite Auto-Reconnect Spinners on Offline Cameras
- **Symptom:**
  When loading the multi-camera Live Scan classroom dashboard (`/live-scan?session_id=...`), all 6 CCTV camera grid cards rendered broken video placeholders displaying a permanent spinning loader with:
  `"Connecting Camera Feed..."`
  `"Auto-reconnecting"`
  simultaneously with deceptive green pulsing indicators (`2L`, `2M`, `2R`, `1L`, `1M`, `1R`). The browser console logged `HTTP 400 Bad Request (Disallowed CORS headers)` on all `GET /api/video-feed/...` endpoints every 2.5 seconds, while the physical cameras were powered off and dormant.
- **Root Cause:**
  1. **Legacy Header Forcing CORS Preflight:** In `frontend/src/components/MjpegPlayer.tsx`, the `fetchStream()` function sent `headers: { 'ngrok-skip-browser-warning': 'true' }`. Because this is a custom, non-CORS-safelisted request header, the browser was forced to execute an `OPTIONS` preflight request before initiating the stream.
  2. **FastAPI CORSMiddleware Allowlist Rejection:** `backend/main.py` explicitly listed allowed CORS request headers (`Content-Type`, `Authorization`, `X-Internal-API-Key`, etc.) but omitted `ngrok-skip-browser-warning`. As a result, FastAPI's `CORSMiddleware` aborted the browser preflight with `HTTP 400 Bad Request: Disallowed CORS headers`, preventing the client from ever reading the stream response.
  3. **Aggressive Frontend Reconnection Loop:** Upon catching the fetch error, `MjpegPlayer.tsx` entered a 2.5-second `setInterval` / `setTimeout` auto-reconnect loop. This spammed failing requests continuously, saturating browser network sockets and CPU cycles.
  4. **Deceptive Hardcoded Green Badges:** In `frontend/src/app/live-scan/page.tsx`, camera labels unconditionally rendered `<span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />`, giving users the false impression that offline/unplugged cameras were active and online.
- **Architectural Fix:**
  1. **Eliminate Unnecessary Custom Headers (`MjpegPlayer.tsx`):** Removed `ngrok-skip-browser-warning` from client-side `fetchStream()` calls, converting the video feed into a standard CORS simple request that does not trigger preflight negotiation.
  2. **Add Whitelist Fallback (`backend/main.py`):** Added `ngrok-skip-browser-warning` to `CORSMiddleware` `allow_headers` as a defensive measure for any legacy proxies or tunnels.
  3. **Calm Dormant Fallback UI & Throttled Retry (`MjpegPlayer.tsx`):**
     - Replaced the frantic "Auto-reconnecting" spinner with a clear, professional card: `Camera Offline (Dormant)` and `Standby Mode` with an amber indicator.
     - Extended reconnection backoff from 2.5s to 15s to eliminate browser event loop thrashing.
     - Added an interactive manual `Re-check Feed` button.
  4. **Dynamic Connection State & Dormancy Badges (`live-scan/page.tsx` & `streaming.py`):**
     - Enhanced `GET /api/cameras` to return live runtime circuit-breaker states (`is_connected`, `is_dormant`, `circuit_breaker_state`).
     - Updated camera grid cards to render amber `Dormant` badges when offline, and emerald green `Live` pulsing dots only when actively streaming.
     - Updated top banner to display `CP PLUS Vision Hub (6 Nodes Standby / Dormant • Mobile Attendance Active)` with a one-click `[Recheck Nodes]` action.
- **Rule:** Never attach custom, non-standard request headers to streaming media endpoints without explicit CORS allowlist matching. Streaming player components must never loop aggressively on offline hardware; they must display calm, informative dormant states and respect circuit-breaker backoffs.

---

### Gotcha 16: HTTP/2 Persistent Stream Expiry (`last_stream_id: 19999`) & Unshielded Database Queries in Live Stream Enrollment
- **Symptom:**
  During backend execution or when processing active classroom sessions (e.g. `session_id="test"`), the terminal logged:
  `! Error fetching students for session test: <ConnectionTerminated error_code:ErrorCodes.NO_ERROR, last_stream_id:19999, additional_data:None>`.
- **Root Cause:**
  1. **HTTP/2 Stream ID Protocol Limit (RFC 7540):** Under the hood, `supabase-py` uses `httpx` with persistent connection pooling and HTTP/2 multiplexing. Cloudflare and Supabase PostgREST gateways enforce an upper limit of stream IDs per single TCP connection (stream ID 19,999). When this limit is reached, or when the edge proxy cleanly rotates long-lived idle connections, the server emits an HTTP/2 `GOAWAY` frame with `error_code: ErrorCodes.NO_ERROR` and `last_stream_id: 19999` to instruct the client to cleanly close the connection and open a fresh one.
  2. **Unshielded Direct Query in `stream.py`:** While API routes utilized retry shields, `get_enrolled_data()` in `backend/app/stream.py` executed an unshielded `supabase.table("sessions").select("target_academic_year").eq("id", session_id).execute()` call. When the socket rotated, the unshielded call immediately threw the connection terminated error.
  3. **Missing Error Code Patterns in `safe_db_execute`:** `backend/app/config.py` had retry patterns for `"remoteprotocolerror"` and `"broken pipe"`, but did not catch lowercase `"connectionterminated"` or `"errorcodes"`.
- **Architectural Fix:**
  1. **Shielded Query via `safe_db_execute` (`stream.py`):** Wrapped the `target_academic_year` lookup with `safe_db_execute()`.
  2. **In-Memory Session Metadata Fallback:** Integrated with `session_cache.py` (`get_cached_session_metadata`) so that if the network query encounters a socket reset, the query seamlessly falls back to the in-memory cached session metadata without dropping frame processing.
  3. **Expanded Socket Error Detection (`config.py`):** Added `"connectionterminated"` and `"errorcodes"` to `safe_db_execute` transient error patterns, allowing transparent socket re-negotiation and immediate retry without logging unhandled exceptions.
- **Rule:** Never execute raw `.execute()` database queries inside streaming loops or background worker threads. All Supabase queries must go through `safe_db_execute` with transient socket retry coverage and RAM cache fallbacks.

---

### Gotcha 17: Per-Frame 512D ArcFace Array Re-Allocation and L2-Norm Redundancy in High-Velocity Video Inference
- **Symptom:**
  During live RTSP multi-camera streaming and classroom photo batch scans with large cohorts (300+ students), the backend exhibited elevated CPU spikes (40%–60% higher than expected) and periodic memory micro-pauses due to Python Garbage Collection.
- **Root Cause:**
  1. **Redundant Per-Frame Array Conversions:** Although student profile dictionaries were cached for 60 seconds, `match_faces_vectorized` and `stream.py` iterated through all enrolled students on every single video frame (up to 15 FPS), converting each student's 512-float Python list to a NumPy array via `np.asarray(...)` and computing its L2 vector norm (`norm(arr)`).
  2. **Memory Allocation Churn:** In a 300-student class, this resulted in 3,000 array allocations and 3,000 norm calculations every second (over 10 million temporary objects per hour), severely degrading throughput and starving CPU resources.
- **Architectural Fix:**
  1. **Pre-Stacked Matrix Caching (`biometric_cache.py`):** Elevated the in-memory cache to compute a pre-normalized 2D float32 NumPy matrix of shape `(N, 512)` per cohort (`_cohort_matrix_cache`) exactly once when loading students or upon invalidation.
  2. **Direct BLAS Matrix Matching (`ai.py`):** Enhanced `match_faces_vectorized` to accept `enrolled_matrix: Optional[np.ndarray]`. When provided, all per-frame loops and array allocations are completely bypassed, executing an immediate $O(1)$ BLAS matrix dot product (`np.dot(enrolled_matrix, unknown_unit)`).
  3. **Centralized Integration (`routes.py` & `stream.py`):** Both classroom photo scans and RTSP stream loops now retrieve `(enrolled_students, enrolled_matrix)` from `get_cached_enrolled_data()`.
- **Rule:** Never reconstruct or re-normalize static biometric embedding matrices inside high-frequency frame processing loops. Always cache pre-normalized 2D float32 matrices in memory and evaluate matches using single-shot BLAS matrix multiplication.

---

### Gotcha 18: PostgREST 1,000-Row Hard Cap & Sequential 50,000-Row Chunked Attendance Fetching Bottleneck in Reports
- **Symptom:**
  As institutional attendance history exceeded tens of thousands of rows, opening the Reports dashboard (`/reports`) became sluggish, taking 3–6 seconds to load and transferring up to 20MB of raw JSON data over the network, leading to occasional client browser tab freezing.
- **Root Cause:**
  1. **PostgREST Hard Cap:** Supabase/PostgREST automatically caps unpaginated `SELECT` queries at 1,000 rows.
  2. **Sequential Chunked Fetching:** To bypass the 1,000-row cap, `api/reports/route.ts` executed a sequential `while` loop with `.range(from, from + 999)` up to 50,000 records. For a college with 30,000 records, this created 30 sequential HTTP roundtrips between Vercel Edge and Supabase.
  3. **Data Redundancy:** The client browser only required counts (`present`, `manual`), attended session IDs for subject breakdown matching, and last-seen timestamps. Transferring tens of thousands of individual record rows containing IDs, status strings, and timestamps created massive network and memory waste.
- **Architectural Fix:**
  1. **Server-Side Aggregation RPC (Migration 21):** Created `public.get_attendance_summary(p_start_date, p_end_date)` in PostgreSQL (Ref: ADR-032). It performs single-pass aggregation using native `FILTER` clauses and returns only 1 summary row per student (~40KB total payload for 300 students vs ~20MB).
  2. **Composite Date Index:** Added `idx_attendance_recorded_status` on `attendance(recorded_at, status)` to ensure index-only / index-accelerated scans over date ranges.
  3. **Fast-Path Frontend & Safe Fallback:** `reports/page.tsx` directly maps `attendance_summary` in `<1ms`. If the RPC is uninstalled or fails, `api/reports/route.ts` gracefully falls back to the safe chunked loop.
- **Rule:** Never fetch massive raw event tables across the network to compute simple grouped aggregates on the client. Always push grouping, filtering, and aggregation down to PostgreSQL RPCs with composite indexes.

---

### Gotcha 19: Main-Thread `setInterval` Liveness Video Frame Stutter and GPU Readback Jank on Mobile
- **Symptom:**
  During student selfie check-in on budget Android and older iOS devices, the camera viewfinder exhibited visible micro-stutters (jank) and frame drops (~15–20 FPS instead of 60 FPS). The animated scanning bar occasionally lagged, and phone bodies heated up quickly during active camera sessions.
- **Root Cause:**
  1. **Main-Thread Pixel Loop:** `processLivenessFrame` was executed every 75ms via `setInterval` on the main UI thread. It drew the video frame to a 64x64 canvas, performed `ctx.getImageData()` (causing synchronous GPU-to-CPU pipeline stalls), and iterated over 4,096 pixels with floating-point luminance calculations.
  2. **Unsynchronized Timer Drift:** `setInterval` operates without V-Sync awareness, firing asynchronously during layout calculations or CSS animation paint phases, degrading rendering performance.
  3. **Lack of Backpressure Guard:** If frame processing took longer than 75ms on an overloaded device, timers could fire in rapid succession, compounding main-thread starvation.
- **Architectural Fix:**
  1. **Web Worker Offloading (`livenessWorker.ts`):** Moved all pixel iteration, luminance scoring, and blink delta computations to a dedicated background Web Worker (Ref: ADR-033).
  2. **Zero-Copy ArrayBuffer Transfer:** The canvas pixel buffer is transferred via `postMessage({ ... }, [imgData.data.buffer])`, avoiding memory cloning.
  3. **`requestAnimationFrame` Pacing & Backpressure Lock:** Replaced `setInterval` with a `requestAnimationFrame` loop throttled to 75ms with an `isProcessing` lock that drops trailing frames rather than queuing them if the device is busy.
  4. **Automatic Tab Sleep:** Because `requestAnimationFrame` pauses when tabs are hidden or screens lock, battery drain and thermal buildup are eliminated.
- **Rule:** Never execute per-frame video pixel calculations or synchronous image processing directly on the browser main thread. Always offload frame mathematics to a background Web Worker and drive pacing via `requestAnimationFrame`.

---

### Gotcha 20: Eye Region Luminance Dilution & Auto-Exposure Lock Causing Infinite Selfie Scanning Freeze
- **Symptom:**
  During student mobile selfie attendance (`/selfieattend`), the camera remained scanning indefinitely with the banner stuck on `"👁️ Blinking detected... Reopen eyes"`. Even when students blinked repeatedly or held still, no photo was captured, and the 5-minute countdown expired, preventing attendance submission.
- **Root Cause:**
  1. **Luminance Signal Dilution:** In the 64x64 pixel downsampled canvas, the designated eye bounding box (`y: 18..36, x: 14..50`) encompasses 703 pixels. A natural human blink alters the brightness of only 30–40 eyelid pixels. When averaged across all 703 pixels, the net luminance shift was diluted to just 0.6–1.2 units, failing to reach the previous hardcoded threshold of 2.8 units.
  2. **Camera Hardware Auto-Exposure Shift:** When eyelids closed, mobile camera sensors dynamically boosted local sensor gain/exposure to compensate for the darker frame, shifting the post-blink baseline upward. The system checked against an unlocked rolling history rather than a locked pre-blink baseline, causing reopening checks to fail.
  3. **Absence of Blink Stage Timeout:** Once `blinkStage` transitioned to 1, there was no frame timeout. If the reopening condition was never met, `blinkStage` remained deadlocked at 1 forever.
- **Architectural Fix:**
  1. **Calibrated Sensitive Delta (`deviation >= 1.4`):** Lowered the blink detection trigger from 2.8 to 1.4 units, reliably capturing natural eyelid flutter in high and low ambient lighting.
  2. **Locked Pre-Blink Baseline & Dynamic Tolerance:** When eyelid depression is detected, `lockedBaseline` is frozen at the pre-blink average. Reopening is evaluated against this locked baseline using a dynamic percentage tolerance (`Math.max(3.5, lockedBaseline * 0.08)`).
  3. **Stage-1 Deadlock Timeout Guard:** Added a 14-frame (~1.05s) timeout window in `livenessWorker.ts`. If reopening is not confirmed within 14 frames, `blinkStage` automatically resets to 0 (`ready`), preventing state freeze.
  4. **Guaranteed 2s Steady Face-Hold Auto-Capture:** Added a continuous 24-frame (~2.0–2.2s) steady face-hold fail-safe that auto-triggers capture hands-free with an advance countdown warning, ensuring students with spectacles or dark environments are never trapped.
- **Rule:** Never implement multi-stage state machines for biometric video frames without strict per-stage frame timeouts. Never use unweighted full-box averaging for localized facial micro-movements without calibrating for downsampling dilution. Always provide a bounded steady-hold auto-capture fallback to guarantee 100% hands-free completion.

---

### Gotcha 21: Tailwind CSS v4 Standalone CSS `translate` Property Unsupported on Legacy Android Chromium / WebView (Chrome < 104) Causing Pinned Mobile Sidebar
- **Symptom:**
  When logging in to the admin/faculty dashboard from legacy Android mobile devices (e.g., Realme 2, ColorOS / Android 8.1 / 9.0, or devices running Chrome < 104 in both browser and PWA modes), the slide-out navigation sidebar was permanently pinned to the screen upon page load, obscuring 70% of the dashboard. Tapping the close button (`✕`) or backdrop had no effect, and the sidebar never slid off-screen, while modern devices (e.g., iPhone 12, modern Android) operated normally.
- **Root Cause:**
  1. **Tailwind CSS v4 Modern Property Shift:** Tailwind CSS v4 compiles transform utility classes like `-translate-x-full` and `translate-x-0` into modern CSS individual transform properties:
     `.-translate-x-full { --tw-translate-x: -100%; translate: var(--tw-translate-x) var(--tw-translate-y); }`
  2. **Browser Engine Incompatibility:** The standalone CSS `translate` property was only introduced to Chromium and Android System WebView in **Chrome 104 (August 2022)**. On older Android engines (Chrome 68–103), `translate` is an unrecognized property and is discarded by the CSS parser.
  3. **Pinned Left-0 Position:** Since `#medattend-sidebar` has `fixed inset-y-0 left-0 z-50`, the absence of a recognized translation rule caused the sidebar to render at `left: 0` immediately upon initial paint. Furthermore, React loaded in its initial closed state (`isOpen: false`, backdrop hidden with `opacity-0 pointer-events-none`), meaning the sidebar was physically visible on screen purely due to CSS parser rejection.
- **Architectural Fix:**
  1. **Universal Feature Query Fallback (`globals.css`):** Added `@supports not (translate: 0px 0px)` targeting pre-Chrome 104 engines. It maps utility translation classes (`.-translate-x-full`, `.translate-x-0`, `.translate-x-full`, `.-translate-x-1\/2`, etc.) to universally supported `transform: translateX(...) !important;`.
  2. **Scoped Legacy Mobile Sidebar Transform Engine:**
     - On screens `< 1024px`, `#medattend-sidebar` defaults to `transform: translateX(-100%);`, guaranteeing that legacy engines paint the sidebar off-screen by default.
     - When `.translate-x-0` or `[data-open="true"]` is applied, `transform: translateX(0) !important;` smoothly slides it in.
     - On desktop (`min-width: 1024px`), `transform: translateX(0) !important;` ensures the desktop sidebar remains permanently docked.
  3. **Zero-Latency Pre-Hydration & Safe Microtask Fallback:**
     - Updated `frontend/src/app/layout.tsx` pre-hydration script to manage `sb.setAttribute('data-open', ...)` and `sb.style.transform` directly, delivering instant response prior to React hydration.
     - Polyfilled `queueMicrotask` in `frontend/src/components/layout/Sidebar.tsx` with a `setTimeout(..., 0)` fallback for legacy engines (< Chrome 71).
- **Rule:** Never rely solely on modern CSS individual transform properties (`translate`, `rotate`, `scale`) for critical off-screen navigation drawers without providing an `@supports not (translate: 0px 0px)` fallback to standard `transform: translateX(...)` for institutional cross-device compatibility.

---

### Gotcha 22: Safari WebKit Worker Blob Revocation & React 19 Staging Optimization Deadlock
- **Symptom:**
  When faculty snapped multiple classroom photos using the in-app Smart Camera Viewfinder, the photos staged in the tray remained permanently stuck showing yellow `🔄 Optimizing` badges with spinning wheels. Tapping "Process All Photos" caused long hangs.
- **Root Cause:**
  1. **Premature Blob URL Revocation on Safari/WebKit:** In `getOrCreateOptimizerWorker()`, `URL.revokeObjectURL(workerUrl)` was invoked synchronously immediately following `new Worker(workerUrl)`. WebKit fetches the worker script asynchronously; revoking the blob URL immediately caused the script fetch to fail silently, putting the worker into an unresponsive state.
  2. **Unbounded Task Queue Timeout:** Unresponsive worker tasks hung for 8000ms each without marking `workerFailed = true`, cascading 8-second timeouts per photo (24s–32s total).
  3. **React 19 Concurrent Updater Mutation Antipattern:** In `handleQueuePhotoFiles`, `newItems` was declared outside `setQueuedPhotos` and pushed to *inside* the state updater callback. In React 19's batched execution, `newItems.forEach` executed before the updater was scheduled, running on an empty array and never triggering optimization.
  4. **Redundant Re-Optimization of Native Canvas Snaps:** Photos captured via Smart Camera Viewfinder were drawn directly from `<video>` onto `<canvas>` at 1080p and exported as ~250KB JPEG blobs. They were already optimized and well below Vercel's 4.5MB limit, yet were marked as `compressing` and queued for redundant worker processing.
- **Architectural Fix:**
  1. **Preserve Worker Blob URL Lifetime:** Retained `workerBlobUrl` for the duration of the worker lifecycle, revoking only in `resetOptimizerWorker()`.
  2. **Fast-Path Compact File Bypass & 2s Worker Watchdog:** In `optimizeClassroomPhoto()`, files `<= 600KB` bypass canvas re-encoding immediately. Reduced worker watchdog from 8000ms to 2000ms, immediately terminating and setting `workerFailed = true` on timeout so fallbacks run without delay.
  3. **Deterministic State Construction:** Constructed `newItems` purely and synchronously before calling `setQueuedPhotos`, synchronized with `queuedPhotosRef.current`.
  4. **Zero-Wait Pre-Optimized Smart Camera Injection:** `handleCaptureSmartPhoto` marks camera snaps as `isPreOptimized: true`, setting `compressionStatus: "ready"` and snapshot `quality` instantaneously without spinner delay.
  5. **Resilient Upload Fallback:** In `handleProcessBatchAttendance`, `fileToUpload = item.optimizedFile || item.file` ensures upload never blocks on redundant optimization.
- **Rule:** Never revoke a Web Worker blob URL synchronously immediately after instantiation. Never mutate an outer array inside a React functional state updater. All in-app camera canvas captures must bypass re-compression pipelines as pre-optimized assets.








