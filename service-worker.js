/* Lets the app open from the home screen quickly and without a connection.
   The page itself is fetched fresh when online, so a new upload shows up the next time the app opens. */
const VERSION = 'household-eca42a2047';
const FILES = ["./", "apple-touch-icon.png", "firebase-app-compat.js", "firebase-auth-compat.js", "firebase-config.js", "firebase-firestore-compat.js", "icon-192.png", "icon-32.png", "icon-512.png", "icon-maskable-512.png", "index.html", "manifest.json"];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(VERSION).then((cache) => cache.addAll(FILES)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k.startsWith('household-') && k !== VERSION).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

const keep = (request, response) => {
  if (response && (response.ok || response.type === 'opaque')) {
    const copy = response.clone();
    caches.open(VERSION).then((cache) => cache.put(request, copy));
  }
  return response;
};

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  const sameSite = url.origin === self.location.origin;
  // Sign-in and your data always go straight to Firebase.
  if (!sameSite && !/^fonts\.(googleapis|gstatic)\.com$/.test(url.hostname)) return;

  if (request.mode === 'navigate' || (sameSite && /(\/|\.html|firebase-config\.js)$/.test(url.pathname))) {
    // Page and settings: network first, cached copy when offline.
    event.respondWith(
      fetch(request).then((res) => keep(request, res))
        .catch(() => caches.match(request).then((hit) => hit || caches.match('./')))
    );
    return;
  }
  // Icons, the Firebase library and fonts: cached copy first.
  event.respondWith(caches.match(request).then((hit) => hit || fetch(request).then((res) => keep(request, res))));
});
