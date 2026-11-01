// MedAttend PWA Service Worker v4 (Offline Fallback + Background Sync + Push)
const CACHE_NAME = 'medattend-pwa-v4';
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

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(async (cache) => {
      // Prioritize caching offline.html first so fallback is 100% guaranteed
      try {
        await cache.add('/offline.html');
      } catch (err) {
        console.warn('PWA: Failed to cache /offline.html during install:', err);
      }
      return cache.addAll(STATIC_ASSETS).catch((err) => {
        console.warn('PWA: Failed to cache some static assets during install:', err);
      });
    }).then(() => self.skipWaiting())
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

  // 1. Strict Bypass for API calls, video streams, and dynamic data: ALWAYS Network-Only
  if (
    url.pathname.startsWith('/api/') ||
    url.pathname.includes('/video-feed') ||
    url.pathname.includes('/ptz-video-feed') ||
    url.pathname.includes('/socket.io') ||
    event.request.method !== 'GET'
  ) {
    return;
  }

  // 2. Navigation Requests (HTML pages): Network-First with Offline Fallback Page
  if (event.request.mode === 'navigate') {
    event.respondWith(
      fetch(event.request)
        .then((response) => {
          if (response && response.status === 200) {
            const clone = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
          }
          return response;
        })
        .catch(() => {
          return caches.match(event.request).then((cached) => {
            return (
              cached ||
              caches.match('/offline.html') ||
              caches.match('/portal') ||
              caches.match('/')
            );
          });
        })
    );
    return;
  }

  // 3. Static Assets (CSS, JS, Fonts, Images): Stale-While-Revalidate
  event.respondWith(
    caches.match(event.request).then((cachedResponse) => {
      const fetchPromise = fetch(event.request).then((networkResponse) => {
        if (networkResponse && networkResponse.status === 200 && networkResponse.type === 'basic') {
          const clone = networkResponse.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
        }
        return networkResponse;
      }).catch(() => null);

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
