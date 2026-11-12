/* ComparáSúper: funciona sin internet con lo último que se vio (por ejemplo, adentro del súper sin señal).
   Usa Workbox (de Google, código abierto, licencia MIT), guardado en js/vendor/workbox/.
   - Página, código y datos de precios: primero la red (siempre lo más nuevo); si no hay señal o tarda
     demasiado, lo guardado.
   - Librerías (mapa, escáner, gráficos) y fotos de productos: lo guardado al instante.
   - Mapas (OpenStreetMap): se guardan los pedazos que ya viste. */
importScripts("js/vendor/workbox/workbox-sw.js");
workbox.setConfig({ modulePathPrefix: "js/vendor/workbox/", debug: false });

const VERSION = "cs-v8";
const { registerRoute, setCatchHandler } = workbox.routing;
const { NetworkFirst, CacheFirst, StaleWhileRevalidate } = workbox.strategies;
const { ExpirationPlugin } = workbox.expiration;
const { CacheableResponsePlugin } = workbox.cacheableResponse;

const APP = `${VERSION}-app`, DATOS = `${VERSION}-datos`;
const BASE = ["./", "index.html", "css/app.css", "js/app.js", "js/datos.js", "js/buscador.js", "js/mapa.js", "js/vendor/minisearch.js", "config.json", "manifest.webmanifest", "img/icon-192.png"];

self.addEventListener("install", e => { e.waitUntil(caches.open(APP).then(c => c.addAll(BASE)).catch(() => {})); self.skipWaiting(); });
self.addEventListener("activate", e => {
  const vivas = new Set([APP, DATOS, "cs-libs", "cs-fotos", "cs-mapas"]);
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => !vivas.has(k)).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});

const mismo = u => u.origin === self.location.origin;
// librerías pesadas (se bajan solo cuando se usan): no cambian, se guardan
registerRoute(({ url }) => (mismo(url) && /\/js\/vendor\//.test(url.pathname)) || /cdn\.jsdelivr\.net|tessdata/.test(url.host + url.pathname),
  new CacheFirst({ cacheName: "cs-libs", plugins: [new CacheableResponsePlugin({ statuses: [0, 200] }), new ExpirationPlugin({ maxEntries: 60, maxAgeSeconds: 60 * 24 * 3600 })] }));
// precios, descuentos, sucursales: lo más nuevo; sin señal, lo último guardado
registerRoute(({ url }) => mismo(url) && /\/data\/.*\.json$/.test(url.pathname),
  new NetworkFirst({ cacheName: DATOS, networkTimeoutSeconds: 6, plugins: [new CacheableResponsePlugin({ statuses: [200] })] }));
// página y código propio
registerRoute(({ url, request }) => mismo(url) && (request.mode === "navigate" || /\.(js|css|json|webmanifest|png|svg)$/.test(url.pathname)),
  new NetworkFirst({ cacheName: APP, networkTimeoutSeconds: 4, plugins: [new CacheableResponsePlugin({ statuses: [200] })] }));
// fotos de productos (de las tiendas)
registerRoute(({ request, url }) => request.destination === "image" && !/tile\.openstreetmap/.test(url.host),
  new StaleWhileRevalidate({ cacheName: "cs-fotos", plugins: [new CacheableResponsePlugin({ statuses: [0, 200] }), new ExpirationPlugin({ maxEntries: 600, maxAgeSeconds: 30 * 24 * 3600, purgeOnQuotaError: true })] }));
// pedazos del mapa de OpenStreetMap
registerRoute(({ url }) => /tile\.openstreetmap\.org$/.test(url.host),
  new CacheFirst({ cacheName: "cs-mapas", plugins: [new CacheableResponsePlugin({ statuses: [0, 200] }), new ExpirationPlugin({ maxEntries: 400, maxAgeSeconds: 14 * 24 * 3600, purgeOnQuotaError: true })] }));

// sin señal y sin nada guardado para esa dirección: se muestra la página principal guardada
setCatchHandler(async ({ request }) => {
  if (request.mode === "navigate") return (await caches.match("index.html", { ignoreSearch: true })) || (await caches.match("./")) || Response.error();
  return Response.error();
});
