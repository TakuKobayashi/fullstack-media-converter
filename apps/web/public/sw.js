/**
 * ConvertMate Service Worker — offline-first PWA
 * Cache-first for static assets, network-first for navigation.
 */
const CACHE_VERSION = 'v1';
const STATIC_CACHE = `convertmate-static-${CACHE_VERSION}`;
const RUNTIME_CACHE = `convertmate-runtime-${CACHE_VERSION}`;

const PRECACHE_URLS = [
  '/',
  '/webp-to-jpg/',
  '/heic-to-jpg/',
  '/mov-to-mp4/',
  '/export-exif/',
  '/manifest.json',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(STATIC_CACHE).then(cache => cache.addAll(PRECACHE_URLS))
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys
        .filter(k => k !== STATIC_CACHE && k !== RUNTIME_CACHE)
        .map(k => caches.delete(k))
      )
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Skip cross-origin requests and non-GET
  if (request.method !== 'GET' || url.origin !== self.location.origin) return;

  // Navigation: network-first, fall back to cache
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then(res => {
          const clone = res.clone();
          caches.open(RUNTIME_CACHE).then(c => c.put(request, clone));
          return res;
        })
        .catch(() => caches.match(request).then(r => r ?? caches.match('/')))
    );
    return;
  }

  // Static assets: cache-first
  if (url.pathname.match(/\.(js|css|woff2?|png|svg|ico|webp)$/)) {
    event.respondWith(
      caches.match(request).then(cached => {
        if (cached) return cached;
        return fetch(request).then(res => {
          const clone = res.clone();
          caches.open(STATIC_CACHE).then(c => c.put(request, clone));
          return res;
        });
      })
    );
  }
});
