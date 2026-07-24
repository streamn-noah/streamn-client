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

// Fetch Event: Stale-while-revalidate for assets, Network-first for navigation, Stream proxy for videos
self.addEventListener("fetch", (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Handle /api/proxy/video requests for direct client-side device IP streaming & API proxying
  if (url.pathname === "/api/proxy/video" || url.pathname === "/_stream_proxy") {
    event.respondWith(handleStreamProxy(request));
    return;
  }

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
          if (response.status === 200) {
            const cacheCopy = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(request, cacheCopy));
          }
          return response;
        })
        .catch(() => caches.match(request))
    );
    return;
  }

  // Static Assets -> Stale While Revalidate
  event.respondWith(
    caches.match(request).then((cachedResponse) => {
      const fetchPromise = fetch(request)
        .then((networkResponse) => {
          if (networkResponse.status === 200) {
            const cacheCopy = networkResponse.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(request, cacheCopy));
          }
          return networkResponse;
        })
        .catch(() => cachedResponse);

      return cachedResponse || fetchPromise;
    })
  );
});

async function handleStreamProxy(request) {
  const rawUrl = request.url;
  const urlParamIndex = rawUrl.indexOf("url=");
  let targetUrl = null;

  if (urlParamIndex !== -1) {
    const rawParam = rawUrl.substring(urlParamIndex + 4);
    try {
      targetUrl = decodeURIComponent(rawParam);
    } catch {
      targetUrl = rawParam;
    }
  }

  if (!targetUrl) {
    return new Response("Missing url parameter", { status: 400 });
  }

  const rangeHeader = request.headers.get("range");
  const contentType = request.headers.get("content-type");
  const xTimestamp = request.headers.get("x-client-timestamp");
  const xNonce = request.headers.get("x-client-nonce");
  const xSignature = request.headers.get("x-client-signature");
  const xVersion = request.headers.get("x-client-version");
  const xPlatform = request.headers.get("x-client-platform");
  const authorization = request.headers.get("authorization");
  const xTrSignature = request.headers.get("x-tr-signature");
  const xClientToken = request.headers.get("x-client-token");
  const xClientInfo = request.headers.get("x-client-info");

  const reqAccept = request.headers.get("accept");
  const acceptHeader = xTrSignature
    ? "application/json"
    : reqAccept && reqAccept !== "*/*"
    ? reqAccept
    : "*/*";

  const fetchHeaders = {
    "User-Agent":
      "com.community.oneroom/50020044 (Linux; U; Android 13; en_US; 23078RKD5C; Build/TQ2A.230405.003; Cronet/135.0.7012.3)",
    Accept: acceptHeader,
    "Accept-Language": "en-US,en;q=0.9",
    ...(rangeHeader ? { Range: rangeHeader } : {}),
    ...(contentType ? { "Content-Type": contentType } : {}),
    ...(xTimestamp ? { "X-Client-Timestamp": xTimestamp } : {}),
    ...(xNonce ? { "X-Client-Nonce": xNonce } : {}),
    ...(xSignature ? { "X-Client-Signature": xSignature } : {}),
    ...(xVersion ? { "X-Client-Version": xVersion } : {}),
    ...(xPlatform ? { "X-Client-Platform": xPlatform } : {}),
    ...(authorization ? { Authorization: authorization } : {}),
    ...(xTrSignature ? { "x-tr-signature": xTrSignature } : {}),
    ...(xClientToken ? { "X-Client-Token": xClientToken } : {}),
    ...(xClientInfo ? { "X-Client-Info": xClientInfo } : {}),
  };

  const hasBody = ["POST", "PUT", "PATCH"].includes(request.method);
  const response = await fetch(targetUrl, {
    method: request.method,
    headers: fetchHeaders,
    body: hasBody ? await request.arrayBuffer() : undefined,
    redirect: "follow",
  });

  const responseHeaders = new Headers(response.headers);
  responseHeaders.delete("content-encoding");
  responseHeaders.set("Access-Control-Allow-Origin", "*");
  responseHeaders.set("Access-Control-Expose-Headers", "*");

  if (request.method === "HEAD" || !response.body) {
    return new Response(null, {
      status: response.status,
      headers: responseHeaders,
    });
  }

  const isVideo = (response.headers.get("content-type") || "").includes("video") || targetUrl.includes(".mp4");

  if (isVideo) {
    const HEV1 = new Uint8Array([104, 101, 118, 49]); // 'hev1'
    const HVC1 = new Uint8Array([104, 118, 99, 49]); // 'hvc1'

    const transformStream = new TransformStream({
      transform(chunk, controller) {
        let offset = 0;
        while (true) {
          let found = -1;
          for (let i = offset; i < chunk.length - 3; i++) {
            if (
              chunk[i] === HEV1[0] &&
              chunk[i + 1] === HEV1[1] &&
              chunk[i + 2] === HEV1[2] &&
              chunk[i + 3] === HEV1[3]
            ) {
              found = i;
              break;
            }
          }
          if (found === -1) break;
          chunk.set(HVC1, found);
          offset = found + 4;
        }
        controller.enqueue(chunk);
      },
    });

    return new Response(response.body.pipeThrough(transformStream), {
      status: response.status,
      headers: responseHeaders,
    });
  }

  return new Response(response.body, {
    status: response.status,
    headers: responseHeaders,
  });
}
