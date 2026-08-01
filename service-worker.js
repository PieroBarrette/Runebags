const CACHE_NAME = "runebags-v42";
const APP_SHELL = [
  "./",
  "./index.html",
  "./manifest.webmanifest",
  "./styles/main.css",
  "./styles/board.css",
  "./styles/runes.css",
  "./js/main.js",
  "./assets/RuneBags_Logo.svg",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL))
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((key) => key !== CACHE_NAME)
          .map((key) => caches.delete(key))
      )
    )
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") {
    return;
  }

  // API responses are live data — never serve them from (or add them to) the
  // app-shell cache, or the first cached copy would be frozen forever.
  const url = new URL(event.request.url);
  if (url.pathname === "/api" || url.pathname.startsWith("/api/")) {
    return;
  }

  event.respondWith(
    caches.match(event.request).then((cached) => {
      if (cached) {
        return cached;
      }

      return fetch(event.request)
        .then((response) => {
          if (!response || response.status !== 200 || response.type !== "basic") {
            return response;
          }

          const responseToCache = response.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(event.request, responseToCache);
          });

          return response;
        })
        .catch(() => caches.match("./index.html"));
    })
  );
});

// Push payloads arrive pre-localized from the server: this worker can't import
// js/i18n.js (that module touches document/localStorage), so each subscription
// records the language it was registered with.
self.addEventListener("push", (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = {};
  }

  const title = data.title || "RuneBags";
  event.waitUntil(
    self.registration.showNotification(title, {
      body: data.body || "",
      icon: "./assets/icon-192.png",
      badge: "./assets/icon-192.png",
      tag: data.tag || "runebags",
      data: { url: data.url || "/" },
    })
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const target = event.notification.data?.url || "/";

  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clientList) => {
      // Reuse an already-open tab when there is one, so tapping the
      // notification doesn't pile up duplicate copies of the game.
      for (const client of clientList) {
        if ("focus" in client) {
          client.navigate?.(target);
          return client.focus();
        }
      }
      return self.clients.openWindow(target);
    })
  );
});
