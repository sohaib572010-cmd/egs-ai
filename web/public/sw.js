// EGS AI service worker: cache-first for immutable build assets, network-first for pages.
const STATIC_CACHE = 'egs-static-v2';
const PAGE_CACHE = 'egs-pages-v2';
const PRECACHE = ['/', '/manifest.webmanifest', '/icon.png', '/logo.png', '/download', '/favicon.ico'];
const MAX_PAGE_ENTRIES = 30;

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(PAGE_CACHE).then((cache) => cache.addAll(PRECACHE).catch(() => undefined))
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== STATIC_CACHE && k !== PAGE_CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

async function trimCache(name, max) {
  const cache = await caches.open(name);
  const keys = await cache.keys();
  for (let i = 0; i < keys.length - max; i++) await cache.delete(keys[i]);
}

async function cacheFirst(request) {
  const cached = await caches.match(request);
  if (cached) return cached;
  const response = await fetch(request);
  if (response.ok) {
    const copy = response.clone();
    caches.open(STATIC_CACHE).then((cache) => cache.put(request, copy));
  }
  return response;
}

async function networkFirst(request) {
  try {
    const response = await fetch(request);
    if (response.ok && response.type === 'basic') {
      const copy = response.clone();
      caches.open(PAGE_CACHE)
        .then((cache) => cache.put(request, copy))
        .then(() => trimCache(PAGE_CACHE, MAX_PAGE_ENTRIES));
    }
    return response;
  } catch {
    const cached = await caches.match(request);
    if (cached) return cached;
    if (request.mode === 'navigate') {
      const shell = await caches.match('/');
      if (shell) return shell;
    }
    return Response.error();
  }
}

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin || url.pathname.startsWith('/api/')) return;
  // Dev bundles are not content-hashed, so caching them on localhost would serve stale code
  if (url.hostname === 'localhost' || url.hostname === '127.0.0.1') return;

  if (url.pathname.startsWith('/_next/static/') || /\.(?:woff2?|png|jpg|jpeg|webp|avif|svg|ico)$/.test(url.pathname)) {
    event.respondWith(cacheFirst(request));
    return;
  }
  event.respondWith(networkFirst(request));
});
