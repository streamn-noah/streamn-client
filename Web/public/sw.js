const CACHE_NAME = "streamn-pwa-v1";
const STATIC_ASSETS = [
  "/discover",
  "/library",
  "/shining-fill.svg",
  "/icon.svg",
  "/manifest.json",
];

// Install Event: Cache key static assets & skip waiting
self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(STATIC_ASSETS).catch(() => {
        // Continue if non-essential asset fails pre-cache
      });
    }).then(() => self.skipWaiting())
  );
});

// Activate Event: Clean old caches & claim clients
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames
          .filter((name) => name !== CACHE_NAME)
          .map((name) => caches.delete(name))
      );
    }).then(() => self.clients.claim())
  );
});

// Fetch Event: Stale-while-revalidate for assets, Network-first for navigation
self.addEventListener("fetch", (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Ignore non-GET requests or browser extension requests
  if (request.method !== "GET" || !url.protocol.startsWith("http")) {
    return;
  }

  // Bypass service worker for video/audio requests
  if (request.destination === "video" || request.destination === "audio") {
    return;
  }

  // Bypass service worker for cross-origin requests except TMDB images
  const isSameOrigin = url.origin === self.location.origin;
  const isTMDbImage = url.hostname === "image.tmdb.org";
  if (!isSameOrigin && !isTMDbImage) {
    return;
  }

  // API calls & dynamic routes -> Network only / fallback
  if (url.pathname.startsWith("/api/")) {
    return;
  }

  // Navigation / HTML page requests -> Network first, fallback to Cache
  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request)
        .then((response) => {
          const responseClone = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(request, responseClone));
          return response;
        })
        .catch(() => {
          return caches.match(request).then((cachedResponse) => {
            if (cachedResponse) return cachedResponse;
            return caches.match("/discover");
          });
        })
    );
    return;
  }

  // Static Assets (Images, SVGs, Fonts, JS, CSS) -> Cache first, fallback to Network
  event.respondWith(
    caches.match(request).then((cachedResponse) => {
      if (cachedResponse) {
        // Revalidate background
        fetch(request)
          .then((networkResponse) => {
            if (networkResponse.ok) {
              caches.open(CACHE_NAME).then((cache) => cache.put(request, networkResponse));
            }
          })
          .catch(() => {});
        return cachedResponse;
      }

      return fetch(request).then((networkResponse) => {
        if (networkResponse.ok) {
          const responseClone = networkResponse.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(request, responseClone));
        }
        return networkResponse;
      });
    })
  );
});
