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



