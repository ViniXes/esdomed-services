// Service worker mínimo: NO cachea el bundle de Next (los assets llevan hash por
// build; cachearlos a ciegas sirve JS/CSS viejo tras cada deploy). Su único trabajo
// es mostrar una pantalla de "sin conexión" propia en vez del error del navegador
// cuando falla la navegación por red y enfocar la app al pulsar un recordatorio
// local de SIS. Todo lo demás (JS, CSS, API, Firestore) pasa
// directo a la red sin tocarlo.
//
// Para forzar que los clientes tomen una versión nueva de este archivo, sube
// CACHE_VERSION (invalida el caché anterior en `activate`).
const CACHE_VERSION = "v1";
const CACHE_NAME = `esdomed-offline-${CACHE_VERSION}`;
const OFFLINE_URL = "/offline.html";

// Los recordatorios locales de SIS se generan desde la página abierta.
// Al pulsarlos, enfocar el dashboard sin recargar formularios en curso.
self.addEventListener("notificationclick", (event) => {
  if (event.notification.data?.tipo !== "sincronizacion-sis") return;
  event.notification.close();
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((ventanas) => {
      const dashboard = ventanas.find((ventana) => {
        const url = new URL(ventana.url);
        return url.origin === self.location.origin && (url.pathname === "/dashboard" || url.pathname.startsWith("/dashboard/"));
      });
      return dashboard ? dashboard.focus() : self.clients.openWindow("/dashboard");
    })
  );
});

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.add(OFFLINE_URL)).then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  if (event.request.mode !== "navigate") return; // solo navegación de páginas
  event.respondWith(
    fetch(event.request).catch(() => caches.match(OFFLINE_URL))
  );
});
