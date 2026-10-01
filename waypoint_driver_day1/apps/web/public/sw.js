/* global self, caches, fetch, Request, URL, AbortController, setTimeout, clearTimeout */
/* Waypoint Sync Driver service worker.
 * Hand-written on purpose: no build plugin, so it cannot clash with the monorepo build.
 * Strategy: pre-cache the /drive shell, then network-first with cache fallback.
 * /api/* is never cached. Offline API actions are the IndexedDB outbox's job. */
const CACHE = 'waypoint-driver-v1';
const SHELL = ['/drive', '/drive/login', '/manifest.json', '/icons/icon-192.png', '/icons/icon-512.png'];
const NAV_TIMEOUT_MS = 4000; // weak signal should fall back to cache, not hang

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE).then((cache) =>
      // allSettled: one missing URL must not abort the whole install
      Promise.allSettled(SHELL.map((url) => cache.add(new Request(url, { cache: 'reload' }))))
    ).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

function isCacheable(url, request) {
  if (url.origin !== self.location.origin) return false;
  if (url.pathname.startsWith('/api/')) return false;
  if (url.searchParams.has('_rsc') || request.headers.get('RSC')) return false;
  return (
    url.pathname === '/drive' ||
    url.pathname.startsWith('/drive/') ||
    url.pathname.startsWith('/_next/static/') ||
    url.pathname.startsWith('/icons/') ||
    url.pathname === '/manifest.json'
  );
}

async function networkFirst(request, isNavigation) {
  const cache = await caches.open(CACHE);
  try {
    const controller = new AbortController();
    const timer = isNavigation ? setTimeout(() => controller.abort(), NAV_TIMEOUT_MS) : null;
    const response = await fetch(request, isNavigation ? { signal: controller.signal } : undefined);
    if (timer) clearTimeout(timer);
    if (response && response.ok) cache.put(request, response.clone());
    return response;
  } catch (err) {
    const cached = await cache.match(request, { ignoreSearch: true });
    if (cached) return cached;
    // Unknown /drive page while offline: serve the cached shell, the client router takes over
    if (isNavigation) {
      const shell = await cache.match('/drive');
      if (shell) return shell;
    }
    throw err;
  }
}

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (!isCacheable(url, request)) return;
  event.respondWith(networkFirst(request, request.mode === 'navigate'));
});
