/* ComparáSúper: funciona sin conexión con lo último que se vio.
   Página y código: primero la red (para tener siempre la versión nueva), si no hay señal se usa lo guardado.
   Datos (precios, descuentos) y fotos: se muestra lo guardado al instante y se actualiza por detrás. */
const VERSION = "cs-v4";
const BASE = ["./", "index.html", "css/app.css", "js/app.js", "js/mapa.js", "config.json", "manifest.webmanifest", "img/icon-192.png"];
self.addEventListener("install", e => { e.waitUntil(caches.open(VERSION).then(c => c.addAll(BASE)).catch(() => {})); self.skipWaiting(); });
self.addEventListener("activate", e => { e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== VERSION && k !== "cs-fotos").map(k => caches.delete(k)))).then(() => self.clients.claim())); });
self.addEventListener("fetch", e => {
  const r = e.request; if (r.method !== "GET") return;
  const u = new URL(r.url);
  if (u.origin === location.origin) {
    if (/\/data\/.*\.json$/.test(u.pathname)) { e.respondWith(staleWhile(r, VERSION)); return; }
    e.respondWith(fetch(r).then(res => { if (res.ok) { const cp = res.clone(); caches.open(VERSION).then(c => c.put(r, cp)); } return res; }).catch(() => caches.match(r, { ignoreSearch: true }).then(m => m || caches.match("index.html"))));
    return;
  }
  if (r.destination === "image") e.respondWith(staleWhile(r, "cs-fotos"));
});
async function staleWhile(r, name) {
  const c = await caches.open(name), hit = await c.match(r, { ignoreSearch: true });
  const net = fetch(r).then(res => { if (res.ok || res.type === "opaque") c.put(r, res.clone()); return res; }).catch(() => hit);
  if (name === "cs-fotos" && Math.random() < 0.05) c.keys().then(ks => ks.slice(0, Math.max(0, ks.length - 500)).forEach(k => c.delete(k)));   // guarda hasta ~500 fotos
  return hit || net;
}
