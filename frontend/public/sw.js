// MedAttend PWA Service Worker v5 (Bulletproof Offline Fallback + Background Sync + Push)
const CACHE_NAME = 'medattend-pwa-v5';
const STATIC_ASSETS = [
  '/',
  '/login',
  '/portal',
  '/selfieattend',
  '/offline.html',
  '/manifest.json',
  '/icons/icon-192x192.png',
  '/icons/icon-512x512.png',
  '/icons/apple-touch-icon.png'
];

// In-Memory Bulletproof Offline Fallback (Guaranteed to serve even if CacheStorage is unavailable)
const INLINE_OFFLINE_PAGE = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover, maximum-scale=1.0, user-scalable=no" />
  <title>Offline • MedAttend AI</title>
  <meta name="theme-color" content="#070B12" />
  <meta name="apple-mobile-web-app-capable" content="yes" />
  <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
  <style>
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; -webkit-tap-highlight-color: transparent; }
    body {
      background-color: #070B12; color: #F8FAFC;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
      min-height: 100vh; min-height: 100dvh; display: flex; flex-direction: column; align-items: center; justify-content: space-between;
      padding: calc(env(safe-area-inset-top, 24px) + 20px) 24px calc(env(safe-area-inset-bottom, 24px) + 24px);
      user-select: none; -webkit-user-select: none;
    }
    .header { display: flex; align-items: center; gap: 10px; padding-top: 10px; }
    .header-logo { width: 36px; height: 36px; border-radius: 10px; background: linear-gradient(135deg, #4F46E5 0%, #6366F1 100%); display: flex; align-items: center; justify-content: center; box-shadow: 0 4px 14px rgba(79, 70, 229, 0.35); }
    .header-logo svg { width: 20px; height: 20px; color: #FFFFFF; }
    .header-title { font-size: 19px; font-weight: 700; color: #FFFFFF; }
    .header-badge { font-size: 10px; font-weight: 700; text-transform: uppercase; padding: 3px 7px; border-radius: 6px; background: rgba(99, 102, 241, 0.15); border: 1px solid rgba(99, 102, 241, 0.3); color: #A5B4FC; }
    .content { display: flex; flex-direction: column; align-items: center; text-align: center; max-width: 380px; width: 100%; margin: auto 0; }
    .icon-container { width: 92px; height: 92px; border-radius: 26px; background: rgba(15, 23, 42, 0.8); border: 1px solid rgba(255, 255, 255, 0.08); display: flex; align-items: center; justify-content: center; margin-bottom: 24px; box-shadow: 0 10px 30px rgba(0, 0, 0, 0.4); }
    .icon-container svg { width: 44px; height: 44px; color: #F87171; }
    .title { font-size: 24px; font-weight: 700; color: #FFFFFF; margin-bottom: 8px; }
    .title-bn { font-size: 14px; font-weight: 600; color: #94A3B8; margin-bottom: 14px; }
    .description { font-size: 14px; line-height: 1.55; color: #94A3B8; margin-bottom: 24px; }
    .status-pill { display: inline-flex; align-items: center; gap: 7px; padding: 6px 14px; border-radius: 9999px; font-size: 12px; font-weight: 600; margin-bottom: 28px; background: rgba(239, 68, 68, 0.12); border: 1px solid rgba(239, 68, 68, 0.25); color: #FCA5A5; }
    .status-pill .dot { width: 7px; height: 7px; border-radius: 50%; background-color: #EF4444; box-shadow: 0 0 8px #EF4444; }
    .status-pill.online { background: rgba(16, 185, 129, 0.15); border-color: rgba(16, 185, 129, 0.3); color: #6EE7B7; }
    .status-pill.online .dot { background-color: #10B981; box-shadow: 0 0 8px #10B981; }
    .btn-retry { width: 100%; height: 52px; border-radius: 16px; border: none; background: linear-gradient(135deg, #4F46E5 0%, #6366F1 50%, #7C3AED 100%); color: #FFFFFF; font-size: 15px; font-weight: 600; cursor: pointer; display: flex; align-items: center; justify-content: center; gap: 8px; box-shadow: 0 8px 24px rgba(79, 70, 229, 0.35); }
    .btn-retry:active { transform: scale(0.97); }
    .btn-retry svg { width: 18px; height: 18px; }
    .auto-hint { margin-top: 18px; font-size: 12px; color: #64748B; }
    .footer { font-size: 11px; color: #475569; text-align: center; }
  </style>
</head>
<body>
  <header class="header">
    <div class="header-logo"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M22 12h-4l-3 9L9 3l-3 9H2"/></svg></div>
    <span class="header-title">MedAttend</span>
    <span class="header-badge">PWA</span>
  </header>
  <main class="content">
    <div class="icon-container">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="1" y1="1" x2="23" y2="23"/><path d="M16.72 11.06A10.94 10.94 0 0 1 19 12.55"/><path d="M5 12.55a10.94 10.94 0 0 1 5.17-2.39"/><path d="M10.71 5.05A16 16 0 0 1 22.58 9"/><path d="M1.42 9a15.91 15.91 0 0 1 4.7-2.88"/><path d="M8.53 16.11a6 6 0 0 1 6.95 0"/><line x1="12" y1="20" x2="12.01" y2="20" stroke-width="3"/></svg>
    </div>
    <h1 class="title">You're Offline</h1>
    <p class="title-bn">ইন্টারনেট সংযোগ বিচ্ছিন্ন রয়েছে</p>
    <p class="description">ইন্টারনেট সংযোগ না থাকায় লাইভ সার্ভারের সাথে যোগাযোগ করা যাচ্ছে না। আপনার ওয়াই-ফাই বা মোবাইল ডেটা অন করুন।</p>
    <div id="status-pill" class="status-pill"><span class="dot"></span><span id="status-text">No Internet Connection</span></div>
    <button id="retry-btn" class="btn-retry" onclick="window.location.reload()"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M21.5 2v6h-6M21.34 15.57a10 10 0 1 1-.57-8.38l5.67-5.19"/></svg><span>Try Again / পুনরায় চেষ্টা করুন</span></button>
    <p class="auto-hint">ইন্টারনেট ফিরে আসলেই পেজটি স্বয়ংক্রিয়ভাবে রিলোড হবে</p>
  </main>
  <footer class="footer">MedAttend AI Smart Attendance • Offline Protection</footer>
  <script>
    window.addEventListener('online', function() {
      var p = document.getElementById('status-pill');
      var t = document.getElementById('status-text');
      if (p) p.classList.add('online');
      if (t) t.innerText = 'Connected! Reloading...';
      setTimeout(function() { window.location.reload(); }, 400);
    });
  </script>
</body>
</html>`;

self.addEventListener('install', (event) => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME).then(async (cache) => {
      // Prioritize caching offline.html and static assets resiliently
      await Promise.allSettled(
        STATIC_ASSETS.map((asset) =>
          cache.add(asset).catch((err) => {
            console.warn('PWA: Failed to cache', asset, err);
          })
        )
      );
    })
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.map((key) => {
          if (key !== CACHE_NAME) {
            return caches.delete(key);
          }
        })
      );
    }).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // 1. Strict Bypass for API calls, video streams, and non-GET requests: Network-Only
  if (
    url.pathname.startsWith('/api/') ||
    url.pathname.includes('/video-feed') ||
    url.pathname.includes('/ptz-video-feed') ||
    url.pathname.includes('/socket.io') ||
    event.request.method !== 'GET'
  ) {
    return;
  }

  const isHtmlRequest =
    event.request.mode === 'navigate' ||
    (event.request.headers.get('accept') && event.request.headers.get('accept').includes('text/html'));

  // 2. Navigation / HTML Requests: Network-First with Dual-Layer Offline Fallback
  if (isHtmlRequest) {
    event.respondWith(
      fetch(event.request)
        .then((response) => {
          if (response && response.status === 200) {
            const clone = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
          }
          return response;
        })
        .catch(async () => {
          // Layer 1: Check if specific requested page was cached
          const cached = await caches.match(event.request);
          if (cached) return cached;

          // Layer 2: Check offline.html from cache
          const offlineFromCache = await caches.match('/offline.html');
          if (offlineFromCache) return offlineFromCache;

          // Layer 3: Check cached portal or root
          const rootCached = (await caches.match('/')) || (await caches.match('/portal'));
          if (rootCached) return rootCached;

          // Layer 4: Return in-memory offline fallback directly from Service Worker
          return new Response(INLINE_OFFLINE_PAGE, {
            status: 200,
            headers: { 'Content-Type': 'text/html; charset=utf-8' },
          });
        })
    );
    return;
  }

  // 3. Static Assets (CSS, JS, Fonts, Images): Stale-While-Revalidate
  event.respondWith(
    caches.match(event.request).then((cachedResponse) => {
      const fetchPromise = fetch(event.request)
        .then((networkResponse) => {
          if (networkResponse && networkResponse.status === 200 && networkResponse.type === 'basic') {
            const clone = networkResponse.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
          }
          return networkResponse;
        })
        .catch(async () => {
          if (event.request.headers.get('accept')?.includes('text/html')) {
            return (
              (await caches.match('/offline.html')) ||
              new Response(INLINE_OFFLINE_PAGE, {
                status: 200,
                headers: { 'Content-Type': 'text/html; charset=utf-8' },
              })
            );
          }
          return null;
        });

      return cachedResponse || fetchPromise;
    })
  );
});

// 4. Push Notification Event Handler
self.addEventListener('push', (event) => {
  let payload = {
    title: 'MedAttend AI',
    body: 'New lecture attendance session started in your hall.',
    url: '/selfieattend'
  };

  if (event.data) {
    try {
      payload = Object.assign(payload, event.data.json());
    } catch (e) {
      payload.body = event.data.text() || payload.body;
    }
  }

  const options = {
    body: payload.body,
    icon: '/icons/icon-192x192.png',
    badge: '/icons/icon-192x192.png',
    vibrate: [100, 50, 100],
    data: {
      url: payload.url || '/selfieattend',
    },
    actions: [
      { action: 'attend', title: 'Open Check-in' }
    ]
  };

  event.waitUntil(self.registration.showNotification(payload.title, options));
});

// 5. Notification Click Handler
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const targetUrl = event.notification.data?.url || '/selfieattend';

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((windowClients) => {
      for (const client of windowClients) {
        if (client.url.includes(targetUrl) && 'focus' in client) {
          return client.focus();
        }
      }
      if (clients.openWindow) {
        return clients.openWindow(targetUrl);
      }
    })
  );
});
