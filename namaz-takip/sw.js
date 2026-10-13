const CACHE_NAME = 'talebe-takip-v1';
const ASSETS = [
  './',
  './index.html',
  './style.css?v=3.4',
  './app.js?v=3.4',
  './sortable.min.js',
  './corporate-logo-3.png',
  './corporate-logo-2.png',
  './corporate-logo.png',
  './student-logo.png',
  './firebase-sdk/firebase-app.js',
  './firebase-sdk/firebase-database.js'
];

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(ASSETS)).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))
      );
    }).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  // Realtime Database veya harici API isteklerini normal ağa bırak
  if (e.request.url.includes('firebaseio.com') || e.request.url.includes('identitytoolkit') || !e.request.url.startsWith(self.location.origin)) {
    return;
  }

  e.respondWith(
    caches.match(e.request).then((cachedResponse) => {
      if (cachedResponse) {
        // Arka planda güncelle (stale-while-revalidate)
        fetch(e.request).then((networkResponse) => {
          if (networkResponse && networkResponse.status === 200) {
            caches.open(CACHE_NAME).then((cache) => cache.put(e.request, networkResponse));
          }
        }).catch(() => {});
        return cachedResponse;
      }
      return fetch(e.request).then((networkResponse) => {
        if (networkResponse && networkResponse.status === 200) {
          const clone = networkResponse.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(e.request, clone));
        }
        return networkResponse;
      });
    })
  );
});
