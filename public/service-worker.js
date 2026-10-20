const CACHE_NAME = 'mega-mall-v1';

const STATIC_ASSETS = [
  '/',
  '/index.html',
  '/style.css?v=5',
  '/style.css',
  '/app.js',
  '/assets/jspdf.umd.min.js',
  '/assets/html2canvas.min.js',
  '/assets/xlsx.full.min.js',
  '/assets/mega-mall-logo.png',
  '/assets/kampus-logo.png',
  '/assets/X1.png',
  '/assets/X2.png'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(STATIC_ASSETS);
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
  const req = event.request;
  const url = new URL(req.url);

  // Skip non-GET requests and browser extensions
  if (req.method !== 'GET' || !url.protocol.startsWith('http')) {
    return;
  }

  // Handle API routes: Network First, fallback to offline response if disconnected
  if (url.pathname.startsWith('/api/')) {
    event.respondWith(
      fetch(req).catch(() => {
        return new Response(JSON.stringify({ offline: true, error: 'Network unavailable. Running in offline mode.' }), {
          headers: { 'Content-Type': 'application/json' }
        });
      })
    );
    return;
  }

  // Handle SPA Page Navigations (e.g. /, /rent, /rents, /kernelx):
  // Return cached index.html so the full application always loads offline
  if (req.mode === 'navigate') {
    event.respondWith(
      fetch(req).catch(() => {
        return caches.match('/index.html', { ignoreSearch: true }).then((res) => res || caches.match('/'));
      })
    );
    return;
  }

  // Static Assets (CSS, JS, images, icons): Cache First, with Stale-While-Revalidate
  event.respondWith(
    caches.match(req, { ignoreSearch: true }).then((cachedResponse) => {
      if (cachedResponse) {
        // Fetch in background to keep cache up to date
        fetch(req).then((networkResponse) => {
          if (networkResponse && networkResponse.status === 200) {
            caches.open(CACHE_NAME).then((cache) => cache.put(req, networkResponse));
          }
        }).catch(() => {});
        return cachedResponse;
      }
      return fetch(req).then((networkResponse) => {
        if (networkResponse && networkResponse.status === 200) {
          const resClone = networkResponse.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(req, resClone));
        }
        return networkResponse;
      });
    })
  );
});
