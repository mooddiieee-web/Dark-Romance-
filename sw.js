// Service Worker — offline support for the "Truth or Dare" site
// Uses runtime (on-the-fly) caching, so it doesn't need a hardcoded
// list of every page/image in the repo — it just remembers whatever
// the visitor's browser actually requests.

const CACHE_VERSION = 'tod-cache-v1';
const CACHE_NAME = CACHE_VERSION;
const BASE = './';

// Only the bare minimum needs to be known ahead of time.
const CORE_ASSETS = [
  BASE,
  BASE + 'index.html',
  BASE + 'manifest.json',
  BASE + 'icons/icon-72x72.png',
  BASE + 'icons/icon-96x96.png',
  BASE + 'icons/icon-128x128.png',
  BASE + 'icons/icon-144x144.png',
  BASE + 'icons/icon-152x152.png',
  BASE + 'icons/icon-180x180.png',
  BASE + 'icons/icon-192x192.png',
  BASE + 'icons/icon-384x384.png',
  BASE + 'icons/icon-512x512.png'
];

// --- Install: pre-cache the core app shell ---
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) =>
      Promise.all(
        CORE_ASSETS.map((url) =>
          cache.add(url).catch((err) => console.warn('SW: failed to precache', url, err))
        )
      )
    ).then(() => self.skipWaiting())
  );
});

// --- Activate: drop old cache versions ---
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key)))
    ).then(() => self.clients.claim())
  );
});

// --- Fetch ---
self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return; // let fonts/CDNs pass through normally

  // Page navigations: network-first, falling back to cache, then to index.html when fully offline.
  if (req.mode === 'navigate') {
    event.respondWith(
      fetch(req)
        .then((res) => {
          const clone = res.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(req, clone));
          return res;
        })
        .catch(() =>
          caches.match(req).then((cached) => cached || caches.match(BASE + 'index.html'))
        )
    );
    return;
  }

  // Everything else (css, js, images): cache-first, then fetch + store for next time.
  event.respondWith(
    caches.match(req).then((cached) => {
      if (cached) return cached;
      return fetch(req)
        .then((res) => {
          if (!res || res.status !== 200 || res.type === 'opaque') return res;
          const clone = res.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(req, clone));
          return res;
        })
        .catch(() => {
          if (req.destination === 'image') {
            return caches.match(BASE + 'icons/icon-192x192.png');
          }
        });
    })
  );
});
