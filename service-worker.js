/* Melexis IO Tools — offline shell.
 *
 * Network-first on purpose: these pages are edited live during development and
 * a cache-first worker keeps serving stale HTML/JS long after a change. The
 * cache is only a fallback for when the network is unavailable.
 */
const CACHE = "melexis-io-tools-v1";

const SHELL = [
  "./",
  "./index.html",
  "./terminal.html",
  "./dfuupdate.html",
  "./pressure.html",
  "./infrared.html",
  "./mlx90640.html",
  "./mlx90641.html",
  "./mlx90642.html",
  "./theme.css",
  "./pressure-README.md",
  "./pressure-LICENSE",
  "./style.css",
  "./app.js",
  "./favicon.svg",
  "./manifest.webmanifest",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE)
      // Individually, so one missing file cannot fail the whole install.
      .then((cache) => Promise.all(
        SHELL.map((url) => cache.add(url).catch(() => undefined))
      ))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(
        keys.filter((key) => key !== CACHE).map((key) => caches.delete(key))
      ))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const request = event.request;

  // Leave cross-origin requests (fonts) and non-GET traffic alone.
  if (request.method !== "GET" || new URL(request.url).origin !== self.location.origin) {
    return;
  }

  event.respondWith(
    fetch(request)
      .then((response) => {
        if (response && response.status === 200 && response.type === "basic") {
          const copy = response.clone();
          caches.open(CACHE).then((cache) => cache.put(request, copy));
        }
        return response;
      })
      .catch(() => caches.match(request).then(
        (cached) => cached || (request.mode === "navigate"
          ? caches.match("./index.html")
          : undefined)
      ))
  );
});

// Lets a page trigger an immediate update instead of waiting for a reload.
self.addEventListener("message", (event) => {
  if (event.data === "skip-waiting") {
    self.skipWaiting();
  }
});
