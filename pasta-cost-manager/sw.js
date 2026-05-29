const CACHE_NAME = 'wild-pasta-v12'; // v12: Date Filters, Flatpickr, Custom Alerts, Recycle Bin
const ASSETS_TO_CACHE = [
  './',
  './index.html',
  './app.js',
  './styles.css',
  './sample-data.js',
  './manifest.json',
  './icon.png'
];

// Install Event - Caching core app shell & assets
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => {
        console.log('[Service Worker] Caching core app shell & assets');
        return cache.addAll(ASSETS_TO_CACHE);
      })
      .then(() => self.skipWaiting())
  );
});

// Activate Event - Clean up old caches cleanly
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys => {
      return Promise.all(
        keys.map(key => {
          if (key !== CACHE_NAME) {
            console.log('[Service Worker] Removing old cache:', key);
            return caches.delete(key);
          }
        })
      );
    }).then(() => self.clients.claim())
  );
});

// Fetch Event - Network-First falling back to Cache
// This guarantees the user always gets the latest updates when online (like new features),
// while retaining perfect offline-first operations when at the farmers market booth!
self.addEventListener('fetch', event => {
  // Only intercept requests for THIS app's own assets.
  // Do NOT intercept external API calls (e.g. JSONBin) — they must go straight
  // to the network so AbortController signals work and CORS isn't broken.
  if (!event.request.url.startsWith(self.location.origin)) return;
  if (event.request.method !== 'GET') return;

  event.respondWith(
    fetch(event.request)
      .then(networkResponse => {
        // If the request succeeds, clone it, update cache, and return
        if (networkResponse && networkResponse.status === 200 && networkResponse.type === 'basic') {
          const responseToCache = networkResponse.clone();
          caches.open(CACHE_NAME).then(cache => {
            cache.put(event.request, responseToCache);
          });
        }
        return networkResponse;
      })
      .catch(() => {
        // If network request fails (offline), gracefully fall back to cache
        return caches.match(event.request);
      })
  );
});
