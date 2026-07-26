// Minimal service worker: precache the shell + brand assets, network-first
// for pages, cache-first for static assets. Enough for installability and
// snappier loads on cafe Wi-Fi; realtime traffic never touches the SW.
const CACHE = 'perx-play-v1';
const PRECACHE = ['/', '/manifest.webmanifest', '/brand/wordmark-white.svg', '/brand/favicon.svg'];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(PRECACHE)));
  self.skipWaiting();
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
  );
  self.clients.claim();
});

self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.pathname.startsWith('/api/') || url.pathname.startsWith('/socket.io')) {
    return;
  }
  if (url.pathname.startsWith('/brand/') || url.pathname.startsWith('/_next/static/')) {
    e.respondWith(
      caches.match(e.request).then(
        (hit) =>
          hit ||
          fetch(e.request).then((res) => {
            const copy = res.clone();
            caches.open(CACHE).then((c) => c.put(e.request, copy));
            return res;
          })
      )
    );
    return;
  }
  e.respondWith(fetch(e.request).catch(() => caches.match(e.request).then((hit) => hit || caches.match('/'))));
});
