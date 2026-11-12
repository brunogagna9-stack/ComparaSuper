/* ComparáSúper — toda la web en un archivo. Lee site/data/*.json (los arma scripts/build_data.py) y site/config.json. */
"use strict";
const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const money = n => "$ " + Math.round(n).toLocaleString("es-AR");
const DIAS = ["Domingo", "Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado"];
const DCORTO = ["Dom", "Lun", "Mar", "Mié", "Jue", "Vie", "Sáb"];
const HOY = new Date().getDay();
const UNIT = { kg: "kg", l: "litro", un: "unidad" };
const CANAL = { tienda: "En el local", online: "Online", ambos: "En el local y online" };
const TIPO_ST = { mayorista: "Mayorista", app: "App de delivery" };
const GRUPOS = [["super", "Comercios"], ["mayorista", "Mayoristas"], ["app", "Apps de delivery"]];   // dentro de cada grupo, orden alfabético
const grupos = () => GRUPOS.map(([t, n]) => [n, D.stores.filter(s => s.tipo === t)]).filter(g => g[1].length);

const S = { canal: "ambos", q: "", cat: "", stores: new Set(), onlyPromo: false, sort: "relev", lday: HOY, pday: HOY, pstore: "", pmine: false, ptipo: "", otipo: "", ostore: "" };

/* ---------- guardado local (lista, medios, avisos, tema) ---------- */
const LS = {
  get(k, d) { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch { return d; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* sin almacenamiento: queda en memoria */ } },
};
/* ---------- provincia elegida (mapa de entrada) ---------- */
let PROV = LS.get("cs_prov", null);
const AMBA_P = new Set(["AR-C", "AR-B"]);
const enAMBA = () => !PROV || AMBA_P.has(PROV);
const PCARP = () => (PROV || "AR-C").split("-")[1].toLowerCase();
const DIR = () => (enAMBA() ? "data/" : `data/p/${PCARP()}/`);          // precios: AMBA usa los datos de siempre
const PK = k => (enAMBA() ? k : `${k}_${PROV}`);                        // carrito y avisos: uno por provincia
let LISTA = LS.get(PK("cs_lista"), {});          // {idProducto: cantidad}
let MEDIOS = LS.get("cs_medios", null);      // null = no configurado (se muestran todos)
let AVISOS = LS.get(PK("cs_avisos"), {});        // {idProducto: precio cuando se pidió el aviso}

/* ---------- tema claro / oscuro ---------- */
/* librerías que se bajan solo cuando hacen falta */
const LIBS = {};
function lib(js, css, glob) {
  if (!LIBS[js]) LIBS[js] = new Promise((ok, ko) => {
    if (css) for (const c of [].concat(css)) { const k = document.createElement("link"); k.rel = "stylesheet"; k.href = c; document.head.appendChild(k); }
    const s = document.createElement("script"); s.src = js; s.onload = () => ok(glob ? glob() : true); s.onerror = () => { delete LIBS[js]; ko(); }; document.head.appendChild(s);
  });
  return LIBS[js];
}
/* listas que se acomodan con movimiento (AutoAnimate, licencia MIT) */
function animar(el) { if (el && window.autoAnimate && !el.__aa && !matchMedia("(prefers-reduced-motion: reduce)").matches) { el.__aa = 1; try { autoAnimate(el, { duration: 180 }); } catch {} } }
/* pantallas que se vuelven a dibujar enteras (carrito, en el súper): cada producto se desliza a su nuevo lugar */
function suave(fn) {
  if (!document.startViewTransition || matchMedia("(prefers-reduced-motion: reduce)").matches) return fn();
  document.documentElement.classList.add("vt-items");
  const t = document.startViewTransition(fn); t.finished.finally(() => document.documentElement.classList.remove("vt-items"));
}
/* carteles y menús que nunca se salen de la pantalla (Floating UI, licencia MIT) */
function flotar(ref, el, placement = "bottom") {
  const F = window.FloatingUIDOM; if (!F || !ref || !el) return () => {};
  Object.assign(el.style, { position: "fixed", left: "0px", top: "0px", right: "auto" });
  const upd = () => F.computePosition(ref, el, { strategy: "fixed", placement, middleware: [F.offset(8), F.flip({ padding: 8 }), F.shift({ padding: 8 })] })
    .then(({ x, y }) => Object.assign(el.style, { left: x + "px", top: y + "px" }));
  return F.autoUpdate(ref, el, upd);
}
/* íconos Lucide (sprite dentro de index.html): iguales en todos los celulares, a diferencia de los emojis */
const ic = n => `<svg class="ic" aria-hidden="true"><use href="#i-${n}"/></svg>`;
function applyTheme(t) {
  document.documentElement.dataset.theme = t;
  const b = $("#themebtn");
  if (b) { b.innerHTML = t === "dark" ? ic("sun") + '<span class="hl">Modo Claro</span>' : ic("moon") + '<span class="hl">Modo Oscuro</span>'; b.title = t === "dark" ? "Cambiar a modo claro" : "Cambiar a modo oscuro"; }
  const m = $('meta[name="theme-color"]'); if (m) m.content = t === "dark" ? "#0b3d2c" : "#0e7a55";
}
applyTheme(LS.get("cs_tema", "light"));

/* ---------- datos ---------- */
let D, P, BY = {}, ST = {}, HIST, CFG = {};
/* Carga en dos pasos para que la página aparezca enseguida:
   1) meta.json + descuentos (pocos KB) → se muestra el inicio;
   2) products.json (los ~25.000 productos) en segundo plano; links.json (enlaces a las tiendas) cuando hace falta. */
let READY = false, PROD_P = null, LINKS_P = null, LINKS_DONE = false;
/* Cadenas que no tienen sucursales cerca: no se muestran (ni sus precios ni sus descuentos).
   - Si cargaste tu ubicación: las que no tienen ninguna sucursal a menos de 50 km de ahí.
   - En CABA sin ubicación: las que no tienen sucursal en CABA o el conurbano (por ejemplo Toledo, de Mar del Plata).
   No cuentan las "sucursales" que son depósitos o tiendas online (la base oficial las informa con dirección)
   ni las que dicen ser de la provincia pero están en la Ciudad (por ejemplo Supercoop, que informa con La Coope). */
let FUERA = new Set(), META_STORES = [], FUERA_PEND = false;
const OBELISCO = [-34.6037, -58.3816], RADIO_CABA = 45, RADIO_UBIC = 50;
const LEJOS_SIN_DATOS = new Set(["toledo", "unicoop", "comodin", "california", "marianomax"]);   // sin ubicación cargada: se sabe que no están en CABA
const VIRTUAL = /online|e-?commerce|virtual|dep[oó]sito|centro de dist|oficina|administraci/i;
const CABA_POLY = [[-58.531, -34.615], [-58.529, -34.651], [-58.461, -34.705], [-58.42, -34.668], [-58.392, -34.66], [-58.359, -34.647], [-58.335, -34.628], [-58.35, -34.58], [-58.368, -34.567], [-58.406, -34.548], [-58.462, -34.527], [-58.505, -34.546], [-58.531, -34.57]];
function enCABA(lat, lon) { let ins = false; for (let i = 0, j = CABA_POLY.length - 1; i < CABA_POLY.length; j = i++) { const [xi, yi] = CABA_POLY[i], [xj, yj] = CABA_POLY[j]; if ((yi > lat) !== (yj > lat) && lon < (xj - xi) * (lat - yi) / (yj - yi) + xi) ins = !ins; } return ins; }
const sucValida = b => !VIRTUAL.test(`${b[2] || ""} ${b[3] || ""}`) && !(b[4] === "AR-B" && enCABA(b[0], b[1]));
function fueraDe(stores, ubic) {
  const out = new Set();
  if (!SUC) return out;
  const c = ubic ? [ubic.lat, ubic.lon, RADIO_UBIC] : PROV === "AR-C" ? [...OBELISCO, RADIO_CABA] : null;
  if (!c) return out;
  for (const st of stores) {
    const l = SUC[st.id] || [];
    if (!l.length) { if (PROV === "AR-C" && LEJOS_SIN_DATOS.has(st.id)) out.add(st.id); continue; }   // sin datos de ubicación: se deja
    if (!l.some(b => sucValida(b) && dist(c[0], c[1], b[0], b[1]) <= c[2])) out.add(st.id);
  }
  return out;
}
function calcFuera(stores) { META_STORES = stores.slice(); FUERA = fueraDe(stores, UBIC); }
/* al cambiar la ubicación: si cambian las cadenas que corresponden, se recarga para rearmar precios y descuentos */
function ubicCambio(ahora = true) {
  const n = fueraDe(META_STORES, UBIC);
  if (n.size === FUERA.size && [...n].every(x => FUERA.has(x))) return;
  if (ahora) setTimeout(() => location.reload(), 900); else FUERA_PEND = true;
}
/* esqueleto de carga: tarjetas grises con la forma del contenido, en vez de una rueda girando */
const esqueleto = (n = 8) => `<div class="grid v-g esq" aria-busy="true" aria-label="Cargando">${Array.from({ length: n }, () => `<div class="sk-card"><div class="sk sk-img"></div><div class="sk sk-l"></div><div class="sk sk-l c"></div><div class="sk sk-p"></div></div>`).join("")}</div>`;
function prepList(d) { if (!d.listo) { d.products = decodificar(d, [...FUERA]); d.listo = true; } }   // ver js/datos.js
function prepProducts(d) {
  prepList(d);
  D.products = d.products;
  BY = Object.fromEntries(d.products.map(x => [x.id, x]));
  for (const id of Object.keys(LISTA)) if (!BY[id]) delete LISTA[id];
  VOC = null;   // el vocabulario de sugerencias se rearma con todos los productos
  READY = true;
  if (TOPR && /^#(buscar|c-)/.test(location.hash) && $("#drawer").hidden && !S.fopen) { const y = scrollY; vBuscar(); scrollTo(0, y); }   // ya están todos: se vuelve a dibujar
}
/* Para que el buscador ande enseguida (sobre todo con datos móviles), primero se bajan los ~5.000 productos
   más comparados (archivo chico) y después el resto. Mientras tanto, Productos y las sugerencias usan esos. */
let TOPR = false;
function usarTop(d) {
  if (!d || READY) return;
  prepList(d); D.products = d.products; BY = Object.fromEntries(d.products.map(x => [x.id, x])); TOPR = true;
  if (/^#(buscar|c-)/.test(location.hash) && $("#view .loading")) route();
  if (document.activeElement === $("#q")) qsugDraw();
}
function loadTop() {
  if (BUSC.w) return Promise.resolve();   // lo baja el proceso de fondo
  return fetch(DIR() + "products-top.json").then(r => (r.ok ? r.json() : null)).then(usarTop).catch(() => {});
}
/* ---------- PROCESO DE FONDO: baja los productos y busca sin trabar la pantalla (js/buscador.js) ---------- */
const BUSC = { w: null, ok: false, cache: new Map(), esp: new Map(), n: 0 };
function iniciarFondo() {
  if (BUSC.w !== null || !window.Worker) return false;
  try { BUSC.w = new Worker("js/buscador.js"); } catch { BUSC.w = false; return false; }
  const abs = f => new URL(DIR() + f, location.href).href;
  PROD_P = new Promise(ok => {
    BUSC.w.onmessage = e => {
      const m = e.data;
      if (m.t === "top") usarTop({ products: m.products, listo: true });
      else if (m.t === "origen") BUSC.cache_ = m.cache;
      else if (m.t === "parte") (BUSC.partes = BUSC.partes || []).push(m.products);
      else if (m.t === "full") { const L = [].concat(...BUSC.partes); BUSC.partes = null; prepProducts({ products: L, listo: true }); ok(); }
      else if (m.t === "indice") { BUSC.ok = true; if (document.activeElement === $("#q")) qsugDraw(); }
      else if (m.t === "ticket") { const f = BUSC.tk && BUSC.tk[m.id]; if (f) { delete BUSC.tk[m.id]; f(m.res); } }
      else if (m.t === "res") { BUSC.cache.set(m.q, m); const f = BUSC.esp.get(m.q); if (f) { BUSC.esp.delete(m.q); f(m); } }
      else if (m.t === "error") { BUSC.w.terminate(); BUSC.w = false; PROD_P = null; loadProducts().then(ok); }   // si falla, como siempre
    };
    BUSC.w.onerror = () => { if (READY) return; BUSC.w = false; PROD_P = null; loadProducts().then(ok); };
  });
  BUSC.w.postMessage({ t: "cargar", full: abs("products.json"), top: abs("products-top.json"), fuera: [...FUERA], clave: D && D.updated ? `${D.updated}|${PROV || ""}` : "" });
  return true;
}
/* pregunta al proceso de fondo qué productos coinciden; devuelve lo guardado si ya se preguntó */
function buscarFondo(q, cb) {
  const k = nrm(q).trim(); if (BUSC.cache.has(k)) return BUSC.cache.get(k);
  if (!BUSC.esp.has(k)) { BUSC.esp.set(k, cb); BUSC.w.postMessage({ t: "buscar", id: ++BUSC.n, q: k }); } else BUSC.esp.set(k, cb);
  if (BUSC.cache.size > 60) BUSC.cache.delete(BUSC.cache.keys().next().value);
  return null;
}
function loadProducts() {
  if (!PROD_P && BUSC.w === null) iniciarFondo();
  if (!PROD_P) PROD_P = fetch(DIR() + "products.json").then(r => r.json()).then(prepProducts);
  return PROD_P;
}
function ensureLinks() {
  if (!LINKS_P) LINKS_P = loadProducts().then(() => fetch(DIR() + "links.json")).then(r => (r.ok ? r.json() : {})).catch(() => ({})).then(L => {
    for (const [id, m] of Object.entries(L)) { const p = BY[id]; if (!p) continue; for (const o of p.offers) if (m[o.s]) Object.assign(o, m[o.s]); }
    LINKS_DONE = true;
  });
  return LINKS_P;
}
async function load() {
  const [m, p, c] = await Promise.all([
    PROV === "AR-C" || UBIC ? loadSuc().then(() => fetch(DIR() + "meta.json")).then(r => (r.ok ? r.json() : null)).catch(() => null) :
    fetch(DIR() + "meta.json").then(r => (r.ok ? r.json() : null)).catch(() => null), fetch(PROV ? `data/p/${PCARP()}/promos.json` : "data/promos.json").then(r => (r.ok ? r.json() : Promise.reject())).catch(() => fetch("data/promos.json").then(r => r.json())),
    fetch("config.json").then(r => r.json()).catch(() => ({}))]);
  P = p; CFG = c || {};
  if (m) { calcFuera(m.stores); m.stores = m.stores.filter(s => !FUERA.has(s.id)); D = { ...m, products: [] }; loadProducts(); loadTop(); }
  else { const full = await fetch(DIR() + "products.json").then(r => r.json()); D = { ...full, products: [] }; PROD_P = Promise.resolve(prepProducts(full)); }
  D.stores.sort((a, b) => a.name.localeCompare(b.name, "es", { sensitivity: "base" }));   // siempre en orden alfabético
  ST = Object.fromEntries(D.stores.map(s => [s.id, s]));
  for (const [id, c] of Object.entries(P.comercios || {})) if (!ST[id] && !FUERA.has(id)) ST[id] = { id, name: c.name, tipo: "super", color: "#64748b", comercio: true, lista: c.lista || null };
  P.medioBy = Object.fromEntries(P.medios.map(m => [m.id, m]));
  const hoyIso = new Date(Date.now() - 3 * 3600e3).toISOString().slice(0, 10);   // fecha de Argentina
  P.vencidas = P.promos.filter(pr => pr.hasta && pr.hasta < hoyIso).length;
  P.promos = P.promos.filter(pr => !pr.hasta || (pr.desde || "") <= hoyIso && hoyIso <= pr.hasta);
  if (FUERA.size) P.promos = P.promos.filter(pr => (pr.stores = pr.stores.filter(x => !FUERA.has(x))).length);
  if (MEDIOS) MEDIOS = MEDIOS.filter(id => P.medioBy[id]);
  if (UBIC) { await loadSuc(); calcCerca(); }
}
async function hist() {
  if (!HIST) HIST = await fetch(DIR() + "history.json").then(r => r.json()).catch(() => ({ dates: [], series: {} }));
  return HIST;
}

/* ---------- precios ---------- */
const EMO = [["leche", "🥛"], ["yogur", "🥛"], ["queso", "🧀"], ["manteca", "🧈"], ["dulce de leche", "🍯"], ["huevo", "🥚"], ["yerba", "🧉"], ["café", "☕"], ["azúcar", "🍬"], ["harina", "🌾"], ["aceite", "🫒"], ["arroz", "🍚"], ["fideo", "🍝"], ["puré", "🍅"], ["atún", "🐟"], ["galletita", "🍪"], ["mayonesa", "🥚"], ["sal ", "🧂"], ["pan ", "🍞"], ["gaseosa", "🥤"], ["agua", "💧"], ["jugo", "🧃"], ["cerveza", "🍺"], ["vino", "🍷"], ["detergente", "🧽"], ["lavandina", "🧴"], ["jabón líquido", "🧺"], ["jabón en polvo", "🧺"], ["suavizante", "🧺"], ["papel", "🧻"], ["rollo", "🧻"], ["shampoo", "🧴"], ["pasta dental", "🪥"], ["jabón de tocador", "🧼"], ["desodorante", "🧴"], ["pañal", "👶"], ["perro", "🐶"], ["gato", "🐱"]];
const emoji = p => { const n = p.name.toLowerCase() + " "; const f = EMO.find(([k]) => n.includes(k)); return f ? f[1] : (D.cats.find(c => c.id === p.cat) || {}).emoji || "🛒"; };
/* foto del producto (de la tienda online); si no hay o no carga, un dibujito según el tipo */
function prodImg(p, cls) {
  const e = emoji(p);
  return p.img ? `<div class="${cls} hasimg"><img src="${esc(p.img)}" alt="" loading="lazy" referrerpolicy="no-referrer" onerror="this.parentNode.classList.remove('hasimg');this.replaceWith(document.createTextNode('${e}'))"></div>`
    : `<div class="${cls}" aria-hidden="true">${e}</div>`;
}
const perUnit = (p, price) => p.bq ? price / p.bq : null;
const unitTxt = (p, price) => { const u = perUnit(p, price); return u ? `${money(u)} por ${UNIT[p.bu] || p.bu}` : ""; };
/* cada oferta puede tener precio en el local (p) y/o online (po); c = "tienda" | "online" */
const base = (o, c) => (c === "online" ? o.po : o.p);
const promoOf = (o, c) => (c === "online" ? o.promoo : o.promo);
const chans = o => ["tienda", "online"].filter(c => base(o, c) && (S.canal === "ambos" || S.canal === c));
const allChans = o => ["tienda", "online"].filter(c => base(o, c));
/* precio llevando 1 unidad (la promo solo cuenta si no exige llevar más de 1) */
function price1(o, c) { const pr = promoOf(o, c); return pr && pr.n <= 1 ? pr.pu : base(o, c); }
/* la opción más barata de un producto: {o, c, v} */
function best(p, filter = null) {
  let b = null;
  const sanos = p.offers.some(o => !o.anom && (!filter || filter.has(o.s)));   // un precio mal cargado no cuenta como "el más barato"
  for (const o of p.offers) {
    if (filter && !filter.has(o.s)) continue;
    if (o.anom && sanos) continue;
    for (const c of chans(o)) { const v = price1(o, c); if (!b || v < b.v) b = { o, c, v }; }
  }
  return b || { o: p.offers[0], c: allChans(p.offers[0])[0], v: price1(p.offers[0], allChans(p.offers[0])[0]) };
}
const hasPromo = p => p.offers.some(o => o.promo || o.promoo);
const refPrice = o => o.p || o.po;
function lineCost(o, c, qty) {
  const b = base(o, c), pr = promoOf(o, c);
  if (pr && qty >= pr.n) {
    const inPromo = Math.floor(qty / pr.n) * pr.n, total = inPromo * pr.pu + (qty - inPromo) * b;
    return { total, save: qty * b - total, promo: pr };
  }
  return { total: qty * b, save: 0, promo: null };
}
const offerAt = (p, sid) => p.offers.find(o => o.s === sid && !o.anom);   // los precios mal cargados no entran en las cuentas

/* ---------- descuentos por medio de pago ---------- */
/* una promo cuenta para los cálculos si la persona tiene el medio (y lo que la promo además requiera, p. ej. ser jubilado).
   Sin "Mis medios" elegidos se usan todas, salvo las que piden una condición especial. */
const needs = pr => (pr.requiere || []);
const mineOk = pr => {
  if (pr.medio === "todos") return !MEDIOS || needs(pr).every(r => MEDIOS.includes(r));
  return MEDIOS ? (MEDIOS.includes(pr.medio) || (pr.bancos || []).some(b => MEDIOS.includes(b))) && needs(pr).every(r => MEDIOS.includes(r)) : !needs(pr).length;
};
/* cuántos beneficios tiene un medio: los propios y, para los bancos, los de MODO / Cuenta DNI en los que participa */
const promosDe = id => P.promos.filter(pr => pr.medio === id || (pr.bancos || []).includes(id));
const canalOk = (pr, c) => pr.canal === "ambos" || pr.canal === c;
function promosFor(sid, day, c, { mine = true, withCuotas = false } = {}) {
  return P.promos.filter(pr => pr.stores.includes(sid) && pr.dias.includes(day) && (withCuotas || pr.pct > 0) && (!mine || mineOk(pr)) && canalOk(pr, c));
}
function payDiscount(sid, day, c, subtotal, mine = true) {
  let r = { disc: 0, promo: null };
  for (const pr of promosFor(sid, day, c, { mine })) {
    if (subtotal < (pr.minimo || 0)) continue;
    const d = Math.min(subtotal * pr.pct / 100, pr.tope ?? Infinity);
    if (d > r.disc) r = { disc: d, promo: pr };
  }
  return r;
}
const medio = pr => P.medioBy[pr.medio] || { name: pr.medio, tipo: "" };
const medioName = pr => medio(pr).name;
const topeTxt = pr => pr.tope ? `tope ${money(pr.tope)}${pr.periodo_tope ? " por " + pr.periodo_tope : ""}` : "sin tope";
const pagoTxt = pr => (pr.pago || []).map(k => (P.formas_pago[k] || { t: k }).t).join(" o ");
const FUENTE = { oficial: "página oficial", relevamiento: "relevamiento de sitios oficiales", prensa: "nota periodística" };
const pagoIcon = pr => (P.formas_pago[(pr.pago || [])[0]] || {}).i || "💳";

/* ---------- insignias y logos ---------- */
function badge(kind, id, name, color, sigla) {
  const src = ((CFG[kind === "s" ? "logos" : "logos_medios"]) || {})[id];
  if (src) return `<img class="logo-img${kind === "m" ? " m" : ""}" src="${esc(src)}" alt="" loading="lazy" onload="if(this.naturalWidth>3.5*this.naturalHeight)this.classList.add('wide')">`;
  const sg = sigla || name.replace(/^(Banco|Tarjeta)\s+/i, "").split(/\s+/).filter(w => /^[A-Za-zÁÉÍÓÚáéíóúÑñ]/.test(w)).slice(0, 2).map(w => w[0]).join("").toUpperCase();
  return `<span class="bdg${kind === "m" ? " m" : ""}" style="--c:${color || "var(--ink2)"}" aria-hidden="true">${esc(sg)}</span>`;
}
const TIPO_COLOR = { banco: "#1d4ed8", billetera: "#0f766e", tarjeta: "#7c3aed", programa: "#b45309", general: "#475569" };
const medioBadge = m => badge("m", m.id, m.name, TIPO_COLOR[m.tipo]);

/* ---------- tiendas ---------- */
const isApp = sid => ST[sid].tipo === "app";
const chanName = (sid, c) => (c === "online" ? (ST[sid].online && ST[sid].online.nombre) || ST[sid].name + " online" : ST[sid].name);
function storeChip(sid, c = null) {
  const s = ST[sid];
  const extra = c === "online" && !isApp(sid) ? ' <span class="tag b sm">online</span>' : "";
  return `<span class="store">${badge("s", sid, s.name, s.color, s.sigla)}${esc(s.name)}${extra}</span>`;
}
/* búsqueda en la tienda: cada cadena carga el producto con otro nombre ("Deo REXONA v8 250ml" en una es
   "Antitranspirante masculino Rexona V8 250 ml" en otra), así que se busca por marca + 1 o 2 palabras clave */
const PAL_GEN = new Set("de del la las el los con sin para y en x por deo desod ant antitransp alim bot bli fl cep dent shamp acond pack un uni ud unid unidades u ml cc gr grs g kg l lt lts cm mm cm3 c".split(" "));
const MARCA_NO = new Set(["generico", "sin marca", "s/d", "sd", "varios", "otros", ""]);
function claveBusqueda(p) {
  const n = t => (t || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  const marca = MARCA_NO.has(n(p.brand).trim()) ? "" : n(p.brand).trim();
  const mt = new Set(marca.split(/\s+/));
  const pal = n(p.name).replace(/[,()]/g, " ").split(/\s+/).filter(w => w.length >= 2 && !w.includes(".") && !w.includes("/") && !PAL_GEN.has(w) && !mt.has(w)
    && !/^x?\d+([.,]\d+)?(x\d+)?(ml|cc|cm3|l|lt|lts|g|gr|grs|kg|kgs|cm|mm|m|un|uni|unid|u|ud|uds|mts)?$/.test(w));
  return [marca, ...pal.slice(0, marca ? 2 : 3)].filter(Boolean).join(" ") || p.name.replace(/\s\d.*$/, "");
}
const goUrl = (sid, p) => { const s = ST[sid]; const u = s.buscar || s.web; return u ? u.replaceAll("{q}", encodeURIComponent(claveBusqueda(p))) : null; };
/* Google Maps: la sucursal más cercana a tu ubicación (o las cercanas a donde estés, si no cargaste ubicación) */
function mapaUrl(sid) {
  const s = ST[sid], l = SUC && SUC[sid];
  if (UBIC && l && l.length) {
    let m = null; for (const b of l) { const d = dist(UBIC.lat, UBIC.lon, b[0], b[1]); if (!m || d < m.d) m = { d, b }; }
    return `https://www.google.com/maps/dir/?api=1&origin=${UBIC.lat},${UBIC.lon}&destination=${m.b[0]},${m.b[1]}`;
  }
  const zona = UBIC && UBIC.label && !UBIC.gps && !UBIC.mapa ? " " + UBIC.label : PROV ? " " + provNombre(PROV) : "";
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent((s ? s.name : sid) + " supermercado" + zona)}`;
}
function shipping(sid, c, sub) {
  if (c !== "online") return 0;
  const on = ST[sid].online || {};
  if (on.gratis_desde && sub >= on.gratis_desde) return 0;
  return on.envio || 0;
}

/* ---------- compra completa ---------- */
function options() {   // cada súper en cada canal (local / online) según el filtro elegido
  const out = [];
  for (const s of D.stores) {
    if (!isApp(s.id) && (S.canal !== "online")) out.push({ sid: s.id, c: "tienda" });
    if (s.online && S.canal !== "tienda") out.push({ sid: s.id, c: "online" });
  }
  return out;
}
function basketAt(sid, c, items, day) {
  let reg = 0, sub = 0; const miss = [], lines = [];
  for (const { p, qty } of items) {
    const o = offerAt(p, sid);
    if (!o || !base(o, c)) { miss.push(p); continue; }
    const lc = lineCost(o, c, qty); reg += qty * base(o, c); sub += lc.total; lines.push({ p, qty, o, lc });
  }
  const pay = payDiscount(sid, day, c, sub), env = lines.length ? shipping(sid, c, sub) : 0;
  return { sid, c, reg, sub, promoSave: reg - sub, pay, env, total: sub - pay.disc + env, miss, lines };
}
const rankAll = (items, day) => options().map(x => basketAt(x.sid, x.c, items, day)).filter(b => b.lines.length)
  .sort((a, b) => (a.miss.length - b.miss.length) || (a.total - b.total));
function bestSplit(items, day) {
  const opts = options(); let bestR = null;
  for (let i = 0; i < opts.length; i++) for (let j = i + 1; j < opts.length; j++) {
    const a = opts[i], b = opts[j];
    if (a.sid === b.sid) continue;
    const A = [], B = []; let ok = true;
    for (const it of items) {
      const oa = offerAt(it.p, a.sid), ob = offerAt(it.p, b.sid);
      const ca = oa && base(oa, a.c) ? lineCost(oa, a.c, it.qty).total : Infinity, cb = ob && base(ob, b.c) ? lineCost(ob, b.c, it.qty).total : Infinity;
      if (ca === Infinity && cb === Infinity) { ok = false; break; }
      (ca <= cb ? A : B).push(it);
    }
    if (!ok || !A.length || !B.length) continue;
    const ba = basketAt(a.sid, a.c, A, day), bb = basketAt(b.sid, b.c, B, day);
    let total = ba.total + bb.total;
    if (ba.pay.promo && bb.pay.promo && ba.pay.promo.id === bb.pay.promo.id && ba.pay.promo.tope)   // un mismo tope por persona
      total += Math.max(0, ba.pay.disc + bb.pay.disc - ba.pay.promo.tope);
    if (!bestR || total < bestR.total) bestR = { total, parts: [ba, bb] };
  }
  return bestR;
}

/* Cada producto donde sale menos, yendo a todos los comercios que haga falta. Se calcula igual que las otras
   opciones (con el descuento de medio de pago del día, sus topes y el envío si es online), así se pueden comparar.
   Como ir a muchos lugares incluye la posibilidad de ir a uno o a dos, nunca puede dar más caro que esas opciones. */
function bestMulti(items, day, bst, split) {
  const opts = options();
  const bruto = items.reduce((a, { p, qty }) => a + Math.min(...opts.map(x => { const o = offerAt(p, x.sid); return o && base(o, x.c) ? lineCost(o, x.c, qty).total : Infinity; })), 0);
  if (!isFinite(bruto) || !bruto) return null;
  const armar = tasa => {
    const g = new Map();
    for (const it of items) {
      let m = null;
      opts.forEach((x, i) => { const o = offerAt(it.p, x.sid); if (!o || !base(o, x.c)) return; const v = lineCost(o, x.c, it.qty).total * (1 - tasa(x)); if (!m || v < m.v) m = { v, i }; });
      if (!m) return null;
      g.set(m.i, [...(g.get(m.i) || []), it]);
    }
    const parts = [...g].map(([i, its]) => basketAt(opts[i].sid, opts[i].c, its, day));
    let total = parts.reduce((a, b) => a + b.total, 0);
    const porPromo = {};   // un mismo tope por persona aunque se use en varios comercios
    for (const b of parts) if (b.pay.promo && b.pay.promo.tope) (porPromo[b.pay.promo.id] = porPromo[b.pay.promo.id] || { d: 0, t: b.pay.promo.tope }).d += b.pay.disc;
    for (const x of Object.values(porPromo)) total += Math.max(0, x.d - x.t);
    return { total, parts };
  };
  const cands = [armar(() => 0), armar(x => payDiscount(x.sid, day, x.c, bruto).disc / bruto)].filter(Boolean);
  if (split) cands.push({ total: split.total, parts: split.parts });
  if (bst) cands.push({ total: bst.total, parts: [bst] });
  return cands.sort((a, b) => a.total - b.total || a.parts.length - b.parts.length)[0] || null;
}

/* ---------- interfaz general ---------- */
function toast(t, ms = 2400) { const el = $("#toast"); el.textContent = t; el.classList.add("on"); clearTimeout(toast.t); toast.t = setTimeout(() => el.classList.remove("on"), ms); }
function saveLista() { LS.set(PK("cs_lista"), LISTA); const n = Object.values(LISTA).reduce((a, b) => a + b, 0); const el = $("#lcount"); el.textContent = n; el.dataset.n = n; }
let PREF = LS.get(PK("cs_pref"), {});   // comercio elegido para cada producto del carrito {id: comercio}
const savePref = () => LS.set(PK("cs_pref"), PREF);
/* control del carrito en cada producto: "+" si no está; "− cantidad +" si ya está */
function addCtl(id) {
  const q = LISTA[id] || 0;
  if (!q) return `<button class="add" data-inc="${id}" aria-label="Agregar al carrito">+</button>`;
  return `<span class="qmini" data-qc="${id}"><button data-dec="${id}" aria-label="Uno menos">−</button><b aria-live="polite">${q}</b><button data-inc="${id}" aria-label="Uno más">+</button></span>`;
}
/* ofertas que dependen de la cantidad (2x1, 2da al 70%, llevando 3…) */
const promoQty = p => p.offers.flatMap(o => [["tienda", o.promo], ["online", o.promoo]].filter(([, pr]) => pr && pr.n > 1).map(([c, pr]) => ({ o, c, pr })));
function qtyHint(p, q, sid) {
  let ps = promoQty(p); if (sid) ps = ps.filter(x => x.o.s === sid);
  if (!ps.length || !q) return "";
  const x = ps.sort((a, b) => a.pr.pu / base(a.o, a.c) - b.pr.pu / base(b.o, b.c))[0], n = x.pr.n, w = chanName(x.o.s, x.c), r = q % n;
  if (q < n) return `Llevando ${n} se aplica «${x.pr.txt}» en ${w}: ${n - q === 1 ? "te falta 1 unidad" : `te faltan ${n - q} unidades`}.`;
  if (r) return `«${x.pr.txt}» en ${w} va de a ${n}: con ${q}, ${r === 1 ? "1 queda" : r + " quedan"} sin promo. Sumá ${n - r} o sacá ${r}.`;
  return `✓ Con ${q} unidades aplica «${x.pr.txt}» en ${w}: ${money(x.pr.pu)} c/u.`;
}
function setQty(id, q, sid) {
  q = Math.max(0, Math.min(999, q));
  if (!q) { delete LISTA[id]; delete PREF[id]; } else LISTA[id] = q;
  if (sid) PREF[id] = sid;
  saveLista(); savePref();
  $$(`[data-qc="${id}"], .add[data-inc="${id}"]`).forEach(el => (el.outerHTML = addCtl(id)));
  const h = q ? qtyHint(BY[id], q, PREF[id]) : "";
  toast(!q ? "Sacado de tu carrito" : h ? h : sid ? `En tu carrito: ${q} · comprando en ${ST[sid].name}` : `En tu carrito: ${q}`, h ? 4500 : 2400);
  if (location.hash === "#carrito") route();
  if (!$("#drawer").hidden && location.hash === "#p-" + id) openProduct(id);
}
const addToList = id => setQty(id, (LISTA[id] || 0) + 1);
function refreshAvisos() {
  const ids = Object.keys(AVISOS).filter(id => BY[id]);
  const bajaron = ids.filter(id => best(BY[id]).v < AVISOS[id]);
  $("#abtn").hidden = !ids.length;
  const c = $("#acount"); c.textContent = bajaron.length; c.dataset.n = bajaron.length;
  return { ids, bajaron };
}
const where = b => `${storeChip(b.o.s, b.c)}`;
function card(p) {
  const b = best(p, stFilter()), n = p.offers.length;
  const promo = p.offers.find(x => x.promo || x.promoo), pt = promo && (promo.promo || promo.promoo);
  const tags = [];
  if (pt) tags.push(`<span class="tag">🏷️ ${esc(pt.txt)}</span>`);
  if (b.c === "online" && b.o.p && b.v < b.o.p) tags.push(`<span class="tag b">Más barato online</span>`);
  else if (b.o.low) tags.push(`<span class="tag g">Precio más bajo en 60 días</span>`);
  const dn = p.offers.find(x => x.chg && x.chg.pct < 0 && !x.anom);
  return `<article class="prod" data-open="${p.id}" tabindex="0" aria-label="${esc(p.name)}">
    ${prodImg(p, "ph")}
    <div class="tags">${tags.join("")}</div>
    <h3>${esc(p.name)}</h3>
    <div><div class="from">Más barato en ${where(b)}</div>
      <div class="price">${money(b.v)}</div>
      <div class="unit">${unitTxt(p, b.v)}${dn ? ` · <span class="chg dn">▼ ${Math.abs(dn.chg.pct)}% en ${esc(ST[dn.s].name)}</span>` : ""}</div></div>
    <div class="meta"><span class="sub">en ${n} ${n === 1 ? "comercio" : "comercios"}</span>
      ${addCtl(p.id)}</div>
  </article>`;
}
function setTab(v) { $$(".tabs a, .bnav a").forEach(a => a.classList.toggle("on", a.dataset.v === v)); const bm = $("#bmore"); if (bm) bm.classList.toggle("on", ["pagos", "conviene", "carrito", "como", "sugerencias", "legal", "nosotros"].includes(v)); }
const storeSelect = (id, val, label = "Todos los comercios") => `<select class="sel" id="${id}" aria-label="Comercio"><option value="">${label}</option>${grupos().map(([n, ss]) => `<optgroup label="${n}">${ss.map(s => `<option value="${s.id}" ${val === s.id ? "selected" : ""}>${esc(s.name)}</option>`).join("")}</optgroup>`).join("")}</select>`;
const canalChips = () => `<div class="chips" role="group" aria-label="Dónde comprar">${[["ambos", "🏬🛒 Local y online"], ["tienda", "🏬 Solo en el local"], ["online", "🛒 Solo online / apps"]].map(([v, t]) => `<button class="chip${S.canal === v ? " on" : ""}" data-canal="${v}">${t}</button>`).join("")}</div>`;

/* ---------- UBICACIÓN: comercios cerca ---------- */
let UBIC = LS.get(PK("cs_ubic"), null);   // { lat, lon, label, km }
let SUC = null;                        // sucursales con ubicación { comercio: [[lat, lon, dirección, barrio], …] }
async function loadSuc() {
  if (!SUC) {
    const [a, x] = await Promise.all([fetch(DIR() + "sucursales.json").then(r => (r.ok ? r.json() : {})).catch(() => ({})),
      fetch("data/sucursales_extra.json").then(r => (r.ok ? r.json() : {})).catch(() => ({}))]);   // las que la base informa sin longitud (Makro)
    const provs = enAMBA() ? ["AR-C", "AR-B"] : [PROV];
    for (const [sid, l] of Object.entries(x)) if (Array.isArray(l) && !(a[sid] || []).length) { const m = l.filter(b => provs.includes(b[4])); if (m.length) a[sid] = m; }
    SUC = a;
  }
  return SUC;
}
function dist(a, b, c, d) { const R = 6371, r = x => x * Math.PI / 180, dl = r(c - a), dn = r(d - b); const h = Math.sin(dl / 2) ** 2 + Math.cos(r(a)) * Math.cos(r(c)) * Math.sin(dn / 2) ** 2; return 2 * R * Math.asin(Math.sqrt(h)); }
let CERCA = null;   // { comercio: { d, dir, zona } } con la sucursal más cercana dentro del radio
function calcCerca() {
  if (!UBIC || !SUC) { CERCA = null; return; }
  CERCA = {};
  for (const [sid, list] of Object.entries(SUC)) {
    if (!ST[sid]) continue;
    let m = null;
    for (const b of list) { const d = dist(UBIC.lat, UBIC.lon, b[0], b[1]); if (!m || d < m.d) m = { d, dir: b[2], zona: b[3] }; }
    if (m && m.d <= UBIC.km) CERCA[sid] = m;
  }
}
const kmTxt = d => d < 1 ? `${Math.round(d * 10) * 100} m` : `${d.toFixed(1).replace(".", ",")} km`;
/* filtro de comercios de Productos: los elegidos y, si está activado, solo los cercanos */
function stFilter() {
  let near = S.cerca && CERCA ? new Set(Object.keys(CERCA)) : null;
  if (S.favf && FAV.size) near = near ? new Set([...near].filter(x => FAV.has(x))) : new Set(FAV);
  if (S.stores.size && near) return new Set([...S.stores].filter(x => near.has(x)));
  return S.stores.size ? S.stores : near;
}
/* promos que valen en algún comercio cercano (o comprando online) */
const promoCerca = pr => !CERCA || pr.canal === "online" || pr.stores.some(s => CERCA[s]);
function ubicBar(where) {
  if (!UBIC) return `<div class="ubic"><span>📍 Marcá tu ubicación y te mostramos las promos de los comercios que tenés cerca.</span><button class="btn sm" data-ubic>Marcar mi ubicación</button></div>`;
  const ids = Object.keys(CERCA || {}).sort((a, b) => CERCA[a].d - CERCA[b].d);
  return `<div class="ubic on"><div><b>📍 Cerca de ${esc(UBIC.label)}</b> <span class="sub">· hasta ${UBIC.km} km · ${ids.length} ${ids.length === 1 ? "comercio" : "comercios"}${where === "pagos" || where === "inicio" ? " · mostramos solo sus promos y las online" : ""}</span>
      <div class="unear"><a class="uchip" href="#mapa">🗺️ Ver en el mapa</a>${ids.slice(0, 12).map(id => `<span class="uchip" title="${esc(CERCA[id].dir + (CERCA[id].zona ? ", " + CERCA[id].zona : ""))}">${badge("s", id, ST[id].name, ST[id].color, ST[id].sigla)} ${esc(ST[id].name)} <small>${kmTxt(CERCA[id].d)}</small></span>`).join("") || '<span class="sub">No encontramos sucursales en ese radio. Probá con más kilómetros.</span>'}</div></div>
    <div class="ubtn"><button class="btn sec sm" data-ubic>Cambiar</button><button class="btn sec sm" data-noubic>Quitar</button></div></div>`;
}
/* barrios y localidades de la provincia elegida (en AMBA, cada sucursal dice si es de CABA o de Buenos Aires) */
async function zonasProv() {
  await loadSuc();
  const zonas = {}, cuenta = {}, grupos = {};
  for (const list of Object.values(SUC)) for (const b of list) {
    const [la, lo, , z, pv] = b;
    if (!z || !/[a-záéíóúñ]{2}/i.test(z) || (PROV && pv && pv !== PROV)) continue;
    const k = nrm(z).replace(/[^a-z0-9]+/g, " ").trim();          // «Agronomia» y «Agronomía» son la misma
    const g = grupos[k] = grupos[k] || { pts: [], nom: {} };
    g.pts.push([la, lo]); g.nom[z] = (g.nom[z] || 0) + 1;
  }
  for (const g of Object.values(grupos)) {   // nombre: el más usado, y si empatan el que tiene tildes
    const z = Object.keys(g.nom).sort((a, b) => (g.nom[b] - g.nom[a]) || (/[áéíóúñ]/i.test(b) - /[áéíóúñ]/i.test(a)))[0];
    zonas[z] = g.pts; cuenta[z] = g.pts.length;
  }
  const nombres = Object.keys(zonas).sort((a, b) => a.localeCompare(b, "es"));
  const ej = PROV === "AR-C" ? "Palermo, Caballito, Belgrano" : PROV === "AR-B" || !PROV ? "Lanús, Quilmes, La Plata"
    : Object.keys(cuenta).sort((a, b) => cuenta[b] - cuenta[a]).slice(0, 3).join(", ");
  const centro = k => { const pts = zonas[k]; return { lat: pts.reduce((a, p) => a + p[0], 0) / pts.length, lon: pts.reduce((a, p) => a + p[1], 0) / pts.length }; };
  const buscar = v => nombres.find(n => nrm(n) === nrm(v)) || (v ? nombres.find(n => nrm(n).startsWith(nrm(v))) : null);
  /* ¿el punto (GPS) está en la provincia elegida? = hay alguna localidad de la provincia a menos de 40 km */
  const enProv = (lat, lon) => !nombres.length || nombres.some(k => zonas[k].some(p => dist(lat, lon, p[0], p[1]) < 40));
  return { zonas, nombres, ej, centro, buscar, enProv };
}
/* lista desplegable propia: se abre al tocar el campo y se filtra mientras escribís */
function zonaPicker(inp, nombres) {
  const box = document.createElement("div"); box.className = "zlist"; box.hidden = true; box.setAttribute("role", "listbox");
  inp.setAttribute("role", "combobox"); inp.setAttribute("aria-autocomplete", "list"); inp.setAttribute("aria-expanded", "false");
  inp.insertAdjacentElement("afterend", box);
  let act = -1;
  const draw = () => {
    const q = nrm(inp.value.trim());
    const ini = nombres.filter(n => !q || nrm(n).startsWith(q)), med = q ? nombres.filter(n => !nrm(n).startsWith(q) && nrm(n).includes(q)) : [];
    const l = ini.concat(med).slice(0, 400);
    act = -1;
    box.innerHTML = l.length ? l.map(n => `<button type="button" class="zop" role="option" data-z="${esc(n)}">${esc(n)}</button>`).join("")
      : `<div class="zno">No hay comercios cargados en esa localidad de ${esc(provNombre(PROV) || "tu provincia")}.</div>`;
    box.hidden = false; inp.setAttribute("aria-expanded", "true");
  };
  const cerrar = () => { box.hidden = true; inp.setAttribute("aria-expanded", "false"); };
  inp.addEventListener("focus", draw); inp.addEventListener("click", draw); inp.addEventListener("input", draw);
  inp.addEventListener("blur", () => setTimeout(cerrar, 180));
  inp.addEventListener("keydown", e => {
    const ops = [...box.querySelectorAll(".zop")]; if (box.hidden || !ops.length) return;
    if (e.key === "ArrowDown" || e.key === "ArrowUp") { e.preventDefault(); act = (act + (e.key === "ArrowDown" ? 1 : -1) + ops.length) % ops.length; ops.forEach((o, i) => o.classList.toggle("on", i === act)); ops[act].scrollIntoView({ block: "nearest" }); }
    else if (e.key === "Enter" && act >= 0) { e.preventDefault(); inp.value = ops[act].dataset.z; cerrar(); }
    else if (e.key === "Escape") { e.stopPropagation(); cerrar(); }
  });
  box.addEventListener("mousedown", e => e.preventDefault());
  box.addEventListener("click", e => { const o = e.target.closest(".zop"); if (o) { inp.value = o.dataset.z; cerrar(); inp.dispatchEvent(new Event("change")); } });
}
async function modalUbic() {
  const Z = await zonasProv(), { zonas, nombres } = Z;
  openModal(`<h2>📍 Mi ubicación</h2><p class="sub">La usamos solo en este navegador para mostrarte los comercios cercanos y sus promos. No se manda a ningún lado.</p>
    <div class="ugrid"><button class="btn" id="ugps">📡 Usar mi ubicación actual</button><button class="btn sec" type="button" data-marcarmapa>🗺️ Marcarla en el mapa</button></div>
    <label class="flbl" for="uzona">O elegí tu barrio o localidad${PROV ? ` de ${esc(provNombre(PROV))}` : ""}</label>
    <div class="zwrap"><input class="inp" id="uzona" placeholder="Ej.: ${esc(Z.ej)}…" autocomplete="off" value="${UBIC && !UBIC.gps && !UBIC.mapa ? esc(UBIC.label) : ""}"></div>
    <label class="flbl" for="ukm">Hasta qué distancia</label>
    <select class="sel" id="ukm">${[1, 2, 3, 5, 10, 20].map(k => `<option value="${k}" ${(UBIC ? UBIC.km : 3) === k ? "selected" : ""}>${k} km</option>`).join("")}</select>
    <p class="sub" id="umsg" style="min-height:20px;margin:8px 0 0"></p>
    ${UBIC && CERCA ? `<div class="unear" style="margin-top:12px">${Object.keys(CERCA).sort((a, b) => CERCA[a].d - CERCA[b].d).slice(0, 12).map(id => `<span class="uchip" title="${esc(CERCA[id].dir)}">${badge("s", id, ST[id].name, ST[id].color, ST[id].sigla)} ${esc(ST[id].name)} <small>${kmTxt(CERCA[id].d)}</small></span>`).join("") || '<span class="sub">No hay sucursales en ese radio.</span>'}</div>` : ""}
    <div class="mfoot">${UBIC ? '<button class="btn sec sm" data-noubic>Quitar mi ubicación</button>' : '<button class="btn sec sm" data-close>Cancelar</button>'}<button class="btn sm" id="usave">Guardar</button></div>`);
  zonaPicker($("#uzona"), nombres);
  const save = async u => { UBIC = u; LS.set(PK("cs_ubic"), UBIC); await loadSuc(); calcCerca(); updUbic(); closeModal(); route(); toast(`📍 ${Object.keys(CERCA || {}).length} comercios cerca de ${u.label}`); ubicCambio(); };
  $("#ugps").onclick = () => {
    $("#umsg").textContent = "Buscando tu ubicación… (puede tardar unos segundos)";
    pedirUbicacion(pos => {
      const { latitude: lat, longitude: lon } = pos.coords;
      if (!Z.enProv(lat, lon)) { $("#umsg").innerHTML = `Tu ubicación actual está fuera de <b>${esc(provNombre(PROV))}</b>. Elegí una localidad de la lista o <button class="linkbtn" type="button" data-pcambiar2>cambiá de provincia</button>.`; $("[data-pcambiar2]").onclick = () => { closeModal(); $("#pbtn").click(); }; return; }
      save({ lat, lon, label: "tu ubicación actual", km: +$("#ukm").value, gps: true });
    },
      code => { $("#umsg").innerHTML = `${esc(geoError(code))} <button type="button" class="linkbtn" data-marcarmapa>Marcarla en el mapa</button>`; });
  };
  $("#usave").onclick = () => {
    const v = $("#uzona").value.trim(), k = Z.buscar(v);
    if (!k) { if (UBIC && !v) { UBIC.km = +$("#ukm").value; save(UBIC); return; } $("#umsg").textContent = v ? `«${v}» no es una localidad de ${provNombre(PROV) || "tu provincia"} con comercios cargados. Elegila de la lista.` : "Elegí tu barrio o usá tu ubicación actual."; return; }
    save({ ...Z.centro(k), label: k, km: +$("#ukm").value });
  };
}

/* ---------- INICIO ---------- */
/* canasta: para cada búsqueda, el producto que esté en más comercios (con datos reales cambia solo) */
const CANASTA = ["leche entera 1 l", "yerba mate 1 kg", "azucar 1 kg", "harina 0000 1 kg", "aceite girasol 1,5 l", "arroz largo fino 1 kg",
  "fideos spaghetti 500", "pure tomate", "huevos -kinder -choc -sorpresa -pascua", "pan lactal", "papel higienico", "detergente 500"];
let CAN = null;
function canasta() {
  if (!CAN) {
    const used = new Set();
    CAN = CANASTA.map(q => {
      const all = nrm(q).replace(/(\d),(\d)/g, "$1.$2").split(/\s+/).filter(Boolean);
      const ws = all.filter(w => w[0] !== "-"), no = all.filter(w => w[0] === "-").map(w => w.slice(1));
      const hits = D.products.filter(p => { if (used.has(p.id)) return false; const n = nrm(p.name).replace(/(\d),(\d)/g, "$1.$2");
        return ws.every(w => n.includes(w)) && !no.some(w => n.includes(w)); });
      const p = hits.sort((a, b) => b.offers.length - a.offers.length)[0];
      if (p) used.add(p.id);
      return p;
    }).filter(Boolean);
  }
  return CAN.map(p => ({ p, qty: 1 }));
}

function vInicio() {
  setTab("inicio");
  const day = S.iday ?? HOY;
  const delDia = d => P.promos.filter(pr => pr.dias.includes(d) && pr.pct > 0 && (!needs(pr).length || mineOk(pr)) && promoCerca(pr));
  const fv = pr => pr.stores.some(x => FAV.has(x)) ? 1 : 0;
  const promos = delDia(day).sort((a, b) => (mineOk(b) - mineOk(a)) || (fv(b) - fv(a)) || b.pct - a.pct);
  const pcard = pr => `<div class="pcard${MEDIOS && mineOk(pr) ? " mine" : ""}"><div class="pct">${pr.pct}%<small>${topeTxt(pr)}${pr.tope ? " " + tip("tope") : ""}</small></div>
        <div class="pd">${medioBadge(medio(pr))} <b>${esc(medioName(pr))}</b> <span class="tag gr sm">${esc(P.tipos[medio(pr).tipo] || "")}</span><br>en ${pr.stores.map(s => (FAV.has(s) ? "⭐ " : "") + esc(ST[s] ? ST[s].name : s)).join(", ")}
        <div class="how">${pagoIcon(pr)} ${esc(pagoTxt(pr))}</div>
        ${pr.tope ? `<div class="tline">Rinde al máximo con compras de hasta <b>${money(pr.tope / pr.pct * 100)}</b></div>` : ""}
        <button class="linkbtn agl" data-agendar="${pr.id}">📅 Agendar</button></div></div>`;
  const tile = st => { const src = (CFG.logos || {})[st.id]; return `<a class="stile" href="#buscar" data-tienda="${st.id}" title="Ver productos de ${esc(st.name)}">${src ? `<img src="${esc(src)}" alt="${esc(st.name)}" loading="lazy">` : `<span class="stn" style="color:${esc(st.color || "var(--ink)")}">${esc(st.name)}</span>`}</a>`; };
  $("#view").innerHTML = `
  <section class="hero2"><div class="wrap">
    <h1>Encontrá los mejores precios <span class="l2">en un solo lugar</span></h1>
    <p>Buscá, compará y ahorrá</p>
  </div></section>
  <div class="wrap">
    <section class="blk"><div class="blk-h"><h2>🔥 Ofertas del día · ${day === HOY ? `hoy ${DIAS[day].toLowerCase()}` : DIAS[day].toLowerCase()}</h2><a href="#pagos" data-semana>Ver toda la semana →</a></div>
      <div class="week">${DIAS.map((d, i) => `<button class="day${i === day ? " on" : ""}" data-iday="${i}" aria-pressed="${i === day}">${DCORTO[i]}${i === HOY ? '<span class="hoy">HOY</span>' : ""}<small>${delDia(i).length} benef.</small></button>`).join("")}</div>
      ${P.promos.length < 10 ? `<div class="note warn">🔄 Estamos actualizando los descuentos de este mes. En los próximos días vas a ver todos los nuevos.</div>` : ""}
      ${MEDIOS ? "" : `<p class="sub" style="margin:2px 0 10px">Mostramos todos los descuentos${CERCA ? " de los comercios cerca tuyo" : ""}. <a href="#" data-medios>Elegí tus medios de pago</a> para ver solo los que podés usar.</p>`}
      <div class="today">${promos.map(pcard).join("") || `<div class="empty">No hay descuentos cargados para el ${DIAS[day].toLowerCase()}.</div>`}</div>
    </section>

    ${anuncio("inicio")}
    <section class="blk"><div class="blk-h"><h2>Estos son los comercios comparados</h2></div>
      <div class="stiles">${D.stores.map(tile).join("")}</div></section>

    <section class="blk news" id="novedades-blk"><div><h2>📬 Recibí las mejores ofertas de la semana</h2>
      <p>Te mandamos por correo los descuentos bancarios de cada semana y los productos que más bajaron. Gratis, sin spam y te das de baja cuando quieras.</p></div>
      <button class="btn" data-news>Quiero recibir novedades</button></section>
  </div>`;
  $$("[data-iday]").forEach(b => b.onclick = () => { S.iday = +b.dataset.iday; vInicio(); });
  const sem = $("[data-semana]"); if (sem) sem.onclick = () => { S.pday = day; };
  $$("[data-tienda]").forEach(a => a.onclick = () => { S.stores = new Set([a.dataset.tienda]); S.cat = ""; S.q = ""; $("#q").value = ""; S.bpage = 1; });
}
/* marcador de ubicación del encabezado */
function updUbic() { const l = $("#ulab"); if (l) l.textContent = UBIC ? (UBIC.gps ? `Tu ubicación · ${UBIC.km} km` : UBIC.mapa ? `Punto del mapa · ${UBIC.km} km` : `${UBIC.label} · ${UBIC.km} km`) : "Elegí tu ubicación"; $("#uloc").classList.toggle("on", !!UBIC); }

/* ---------- CONTADOR DE VISITAS (GoatCounter: gratis, anónimo, sin cookies; se activa poniendo el código en config.json) ---------- */
let GC_P = null;
function gc() {
  const code = (CFG.goatcounter || "").trim(); if (!code) return null;
  if (!GC_P) GC_P = new Promise(ok => { const sc = document.createElement("script"); sc.async = true; sc.src = "https://gc.zgo.at/count.js"; sc.dataset.goatcounter = `https://${code}.goatcounter.com/count`; sc.dataset.goatcounterSettings = '{"no_onload": true}'; sc.onload = ok; document.head.appendChild(sc); });
  return GC_P;
}
/* errores que le aparecen a la gente en su celular: se cuentan de forma anónima en el contador de visitas
   (solo el mensaje y dónde pasó, nada personal; como mucho 3 por visita) */
let ERRS = 0;
function reportarError(msg, src) {
  if (ERRS >= 3 || !(CFG && CFG.goatcounter)) return; ERRS++;
  const t = String(msg || "error").replace(/https?:\/\/\S+/g, "").slice(0, 90), donde = (String(src || "").split("/").pop() || "").slice(0, 40);
  evento(`error/${(location.hash.split("-")[0] || "#inicio").slice(1)}/${t.replace(/[^\w áéíóúñ.:]/gi, "").replace(/\s+/g, "-")}`, `Error: ${t} (${donde})`);
}
addEventListener("error", e => { if (e.message) reportarError(e.message, `${e.filename}:${e.lineno}`); });
addEventListener("unhandledrejection", e => reportarError(e.reason && (e.reason.message || e.reason), "promesa"));
function contar(v) { const p = gc(); if (p) p.then(() => { try { window.goatcounter.count({ path: "/" + v, title: document.title }); } catch {} }); }
/* eventos: clics hacia las tiendas (prueba del tráfico que mandamos a cada súper) y a la publicidad */
function evento(path, title) { const p = gc(); if (p) p.then(() => { try { window.goatcounter.count({ path, title, event: true }); } catch {} }); }
document.addEventListener("click", e => {
  const a = e.target.closest("a[data-salida]");
  if (a) { const [tipo, sid] = a.dataset.salida.split("|"); evento(`salida-${tipo}-${sid || "tienda"}`, `Clic a ${ST[sid] ? ST[sid].name : sid} (${tipo === "carrito" ? "armar carrito" : tipo === "producto" ? "ver producto" : "buscar en tienda"})`); }
  const ad = e.target.closest("a[data-ad]"); if (ad) evento(`publicidad-clic-${ad.dataset.ad}`, `Clic en publicidad ${ad.dataset.ad}`);
}, true);

/* ---------- PUBLICIDAD ----------
   Espacios que solo aparecen si hay un anuncio cargado en config.json → "publicidad". Siempre van marcados como
   "Publicidad" y nunca cambian el orden de precios ni qué comercio es el más barato. */
const AD_VISTO = new Set();
function anuncio(lugar) {
  const hoy = new Date(Date.now() - 3 * 3600e3).toISOString().slice(0, 10);
  const ads = (CFG.publicidad || []).filter(a => a && a.activo !== false && (a.lugares || []).includes(lugar) && a.link && (a.imagen || a.titulo)
    && (!a.desde || a.desde <= hoy) && (!a.hasta || hoy <= a.hasta));
  if (!ads.length) return "";
  const a = ads[Math.floor(Math.random() * ads.length)];
  if (!AD_VISTO.has(a.id + lugar)) { AD_VISTO.add(a.id + lugar); evento(`publicidad-vista-${a.id}`, `Se vio la publicidad ${a.id} (${lugar})`); }
  return `<aside class="ad ad-${lugar}" aria-label="Publicidad"><span class="adlbl">Publicidad${a.anunciante ? " · " + esc(a.anunciante) : ""}</span>
    <a href="${esc(a.link)}" target="_blank" rel="sponsored noopener" data-ad="${esc(a.id)}">
      ${a.imagen ? `<img src="${esc(a.imagen)}" alt="${esc(a.titulo || a.anunciante || "Publicidad")}" loading="lazy">` : ""}
      ${a.titulo ? `<span class="adt"><b>${esc(a.titulo)}</b>${a.texto ? `<span>${esc(a.texto)}</span>` : ""}</span>` : ""}</a></aside>`;
}
/* ---------- ESCANEAR EL TICKET DEL SÚPER (Tesseract.js, lector de texto en fotos, licencia Apache 2.0) ----------
   Se baja solo cuando lo usás (unos 4 MB la primera vez). Lee el ticket en tu celular: la foto no se manda a ningún lado. */
let TS_P = null;
const loadTS = () => TS_P || (TS_P = new Promise((ok, ko) => { const s = document.createElement("script"); s.src = "https://cdn.jsdelivr.net/npm/tesseract.js@7.0.0/dist/tesseract.min.js"; s.onload = () => ok(window.Tesseract); s.onerror = () => { TS_P = null; ko(); }; document.head.appendChild(s); }));
const NO_PROD = /total|subtotal|iva\b|efectivo|tarjeta|vuelto|cambio|cuit|ticket|factura|fecha|hora|cajer|caja\b|descuento|bonif|redondeo|pago|saldo|debito|credito|qr\b|mercado ?pago|gracias|cliente|consumidor|items?\b|art[ií]culos|domicilio|ing\.? ?br|p\.?v\.?|nro|n[º°]/i;
function leerTicket(txt) {
  const out = [];
  for (let l of txt.split(/\n+/)) {
    l = l.replace(/\s+/g, " ").trim();
    const m = l.match(/^(.*?)[\s$]*(\d{1,3}(?:[.,]\d{3})*[.,]\d{2})\s*[A-Z%]{0,3}$/);   // termina en un precio: "LECHE SERENIS 1L 1.234,50"
    if (!m || NO_PROD.test(m[1]) || m[1].replace(/[^a-záéíóúñ]/gi, "").length < 4) continue;
    let nombre = m[1], cant = 1;
    const q = nombre.match(/^(\d+(?:[.,]\d+)?)\s*[xX*]\s*/); if (q) { cant = Math.round(parseFloat(q[1].replace(",", "."))) || 1; nombre = nombre.slice(q[0].length); }
    const precio = parseFloat(m[2].replace(/[.,](?=\d{3}\b)/g, "").replace(",", "."));
    if (precio > 0 && precio < 1e7) out.push({ txt: nombre.trim(), cant, precio });
  }
  return out;
}
const matchTicket = lineas => new Promise(ok => {
  if (!BUSC.w || !BUSC.ok) return ok(null);
  const id = ++BUSC.n; (BUSC.tk = BUSC.tk || {})[id] = ok;
  BUSC.w.postMessage({ t: "ticket", id, lineas: lineas.map(l => l.txt) });
});
function modalTicket() {
  openModal(`<h2>🧾 ¿Cuánto te hubieras ahorrado?</h2>
    <p class="sub">Sacale una foto al ticket del súper y te decimos cuánto te hubiera salido lo mismo comprando cada cosa donde está más barato. La foto se lee en tu celular y no se manda a ningún lado.</p>
    <label class="btn" style="display:inline-flex;gap:8px;cursor:pointer;margin:6px 0">📷 Sacar o elegir foto del ticket<input type="file" id="tkfile" accept="image/*" capture="environment" hidden></label>
    <p class="sub">Consejo: el ticket estirado, derecho, con buena luz y que se lea entero.</p>
    <div id="tkres" role="status"></div>`);
  $("#tkfile").onchange = async e => {
    const f = e.target.files[0]; if (!f) return;
    const box = $("#tkres"), est = t => { box.innerHTML = `<div class="tkprog"><div class="spin"></div>${t}</div>`; };
    est("Preparando el lector de tickets… (la primera vez tarda un poco más)");
    try {
      await loadProducts();
      const T = await loadTS();
      const w = await T.createWorker("spa", 1, { logger: m => { if (m.status === "recognizing text" && $("#tkres")) est(`Leyendo el ticket… ${Math.round(m.progress * 100)}%`); } });
      const { data } = await w.recognize(f); await w.terminate();
      const lineas = leerTicket(data.text || "");
      if (!lineas.length) { box.innerHTML = `<div class="warn">No pudimos leer productos con precio en la foto. Probá con más luz, el ticket derecho y más cerca.</div>`; return; }
      est("Buscando cada producto…");
      const res = await matchTicket(lineas);
      if (!$("#tkres")) return;
      ticketTabla(lineas, res || []);
    } catch { box.innerHTML = `<div class="warn">No se pudo leer el ticket. Revisá tu conexión (la primera vez se baja el lector) y probá de nuevo.</div>`; }
  };
}
/* tamaño escrito en el renglón del ticket ("1KG", "750CC", "500 GR") en kg o litros, para elegir la presentación correcta */
function tamTicket(t) {
  const m = nrm(t).match(/(\d+(?:[.,]\d+)?)\s*(kgs?|k|grs?|g|lts?|l|ml|cc|cm3)\b/); if (!m) return null;
  const n = parseFloat(m[1].replace(",", ".")), u = m[2];
  return /^(kgs?|k)$/.test(u) ? { q: n, u: "kg" } : /^(grs?|g)$/.test(u) ? { q: n / 1000, u: "kg" } : /^(lts?|l)$/.test(u) ? { q: n, u: "l" } : { q: n / 1000, u: "l" };
}
function ticketTabla(lineas, res, esLista) {
  // primero el tamaño que dice el renglón (si lo dice) y después el producto que más comercios venden (el más común)
  const orden = (l, ids) => { const t = tamTicket(l.txt); const d = id => { const p = BY[id]; return !t ? 0 : p.bq && p.bu === t.u ? Math.round(Math.abs(p.bq - t.q) / t.q * 10) : 99; };
    return [...ids].sort((a, b) => d(a) - d(b) || BY[b].offers.length - BY[a].offers.length).slice(0, 6); };
  const filas = lineas.map((l, i) => ({ ...l, ids: orden(l, (res[i] && res[i].ids.filter(id => BY[id])) || []), sel: 0, on: !!(res[i] && res[i].ids.length) }));
  const draw = () => {
    let pag = 0, mej = 0, n = 0;
    const html = filas.map((f, i) => {
      const p = f.on && BY[f.ids[f.sel]], b = p && best(p);
      if (p) { pag += f.precio; mej += esLista ? b.v * f.cant : Math.min(f.precio, b.v * f.cant); n++; }
      return `<div class="tkrow${p ? "" : " off"}"><div class="tkl"><span class="sub">«${esc(f.txt)}»${f.cant > 1 ? ` × ${f.cant}` : ""}${esLista ? "" : ` · pagaste ${money(f.precio)}`}</span>
        ${f.ids.length ? `<select class="sel" data-tksel="${i}" aria-label="Producto">${f.ids.map((id, k) => `<option value="${k}" ${k === f.sel && f.on ? "selected" : ""}>${esc(BY[id].name)}</option>`).join("")}<option value="-1" ${f.on ? "" : "selected"}>No es ninguno</option></select>` : `<span class="sub">No lo reconocimos</span>`}</div>
        <div class="tkp">${p ? `<b>${money(b.v * f.cant)}</b><br><span class="sub">en ${esc(ST[b.o.s].name)}</span>` : ""}</div></div>`;
    }).join("");
    const ah = pag - mej;
    $("#tkres").innerHTML = esLista ? `<div class="tksum">${n ? `<div>Reconocimos <b>${n}</b> de ${filas.length} productos.</div><div class="big">Desde ${money(mej)}</div><div class="sub">comprando cada uno donde está más barato. Tocá abajo para ver en qué comercio y qué día te conviene todo junto.</div>` : "No reconocimos productos. Probá escribiéndolos de otra forma."}</div>
      <p class="sub">Revisá que cada producto sea el correcto; si no, elegí otro de la lista.</p>${html}
      <div class="mfoot"><span></span>${n ? `<button class="btn" id="tkplan">${ic("chart-column")} Ver dónde conviene esta compra</button>` : ""}</div>` : `<div class="tksum">${n ? `<div>Reconocimos <b>${n}</b> de ${filas.length} productos. Pagaste <b>${money(pag)}</b> por ellos.</div>
        <div class="big">${ah > 0 ? `Podrías ahorrar ${money(ah)}` : "¡Compraste bien!"}</div><div class="sub">comprando cada uno donde está más barato (${money(mej)}), sin contar descuentos con tu banco.</div>` : "No reconocimos productos. Elegilos de la lista si alguno aparece."}</div>
      <p class="sub">Los tickets abrevian los nombres: revisá que cada producto sea el correcto.</p>${html}
      <div class="mfoot"><span></span>${n ? `<button class="btn" id="tkplan">📊 Ver dónde conviene esta compra</button>` : ""}</div>`;
    $$("[data-tksel]").forEach(s => s.onchange = () => { const f = filas[+s.dataset.tksel], v = +s.value; f.on = v >= 0; if (v >= 0) f.sel = v; draw(); });
    const pb = $("#tkplan"); if (pb) pb.onclick = () => { PLAN = {}; for (const f of filas) if (f.on && BY[f.ids[f.sel]]) PLAN[f.ids[f.sel]] = (PLAN[f.ids[f.sel]] || 0) + f.cant; savePlan(); closeModal(); irA("conviene"); };
  };
  draw();
}

/* ---------- LISTA DE COMPRAS COMPARTIDA DESDE OTRA APP O PEGADA ----------
   Con la web instalada, en "Compartir" de WhatsApp, Notas, etc. aparece ComparáSúper (Web Share Target).
   Cada renglón ("2 leche", "yerba x1kg", "• aceite") se busca entre los productos. */
function partirLista(t) {
  return (t || "").split(/\n|,|;|•|·|- (?=\S)/).map(x => x.replace(/^[\s\-*–—>✅☑️🔲⬜\d.)]*(?=\D)/u, m => (/^\s*\d+\s*$/.test(m) ? m : m.replace(/[\d.)]/g, ""))).trim()).filter(x => x.length >= 3)
    .map(x => { let cant = 1; const a = x.match(/^(\d{1,2})\s*(?:x\s*)?(?=\D)/i) || x.match(/\s+x\s*(\d{1,2})$/i); if (a) { cant = +a[1] || 1; x = x.replace(a[0], " ").trim(); } return { txt: x, cant, precio: 0 }; })
    .slice(0, 60);
}
function modalLista(texto, auto) {
  openModal(`<h2>${ic("receipt")} ${auto ? "Recibimos tu lista" : "Pegá tu lista de compras"}</h2>
    <p class="sub">Un producto por renglón (por ejemplo «2 leche», «yerba 1kg», «aceite»). Te mostramos qué producto es cada uno y después calculamos dónde te conviene comprar todo.</p>
    <textarea class="ta" id="lstxt" rows="7" placeholder="leche&#10;2 yerba&#10;aceite girasol&#10;galletitas">${esc(texto || "")}</textarea>
    <div class="mfoot"><span></span><button class="btn" id="lsgo">Buscar los productos</button></div><div id="tkres" role="status"></div>`);
  const go = async () => {
    const lineas = partirLista($("#lstxt").value);
    if (!lineas.length) { $("#tkres").innerHTML = `<div class="warn">Escribí al menos un producto.</div>`; return; }
    $("#tkres").innerHTML = `<div class="tkprog"><div class="spin"></div>Buscando cada producto…</div>`;
    await loadProducts();
    for (let i = 0; i < 40 && !BUSC.ok && BUSC.w; i++) await new Promise(r => setTimeout(r, 250));   // el buscador termina de armarse
    const res = await matchTicket(lineas);
    if ($("#tkres")) ticketTabla(lineas, res || [], true);
  };
  $("#lsgo").onclick = go;
  if (texto) go();
}
/* abierta desde "Compartir" de otra app: la dirección trae ?texto=… */
function listaCompartida() {
  const q = new URLSearchParams(location.search), t = [q.get("titulo"), q.get("texto"), q.get("enlace")].filter(Boolean).join("\n").trim();
  if (!t) return;
  history.replaceState(null, "", location.pathname + (location.hash || "#conviene"));
  setTimeout(() => modalLista(t, true), 300);
}

/* ---------- FOTO AMPLIADA (PhotoSwipe, licencia MIT): se puede pellizcar para acercar ---------- */
async function zoomFoto(p) {
  const PS = await lib("js/vendor/photoswipe/photoswipe.js", "js/vendor/photoswipe/photoswipe.css", () => window.PhotoSwipe).catch(() => null);
  const src = /\/arquivos\/ids\/\d+-300-300\//.test(p.img) ? p.img.replace(/-300-300\//, "-1000-1000/") : p.img;
  const im = new Image(); im.referrerPolicy = "no-referrer"; im.src = src;
  await new Promise(ok => { im.onload = im.onerror = ok; });
  const w = im.naturalWidth || 800, h = im.naturalHeight || 800, ok = im.naturalWidth > 0;
  if (!PS) { window.open(ok ? src : p.img, "_blank", "noopener"); return; }
  const ps = new PS({ dataSource: [{ src: ok ? src : p.img, width: w, height: h, alt: p.name }], bgOpacity: 0.92, showHideAnimationType: "fade", closeTitle: "Cerrar", zoomTitle: "Acercar", arrowPrevTitle: "Anterior", arrowNextTitle: "Siguiente", errorMsg: "No se pudo cargar la foto" });
  ps.on("destroy", () => ovDone("zoom"));
  ovOpen("zoom", () => ps.close());
  ps.init();
}

/* ---------- MAPA DE SUCURSALES (Leaflet + OpenStreetMap, gratis y sin clave) ---------- */
let LF_P = null;
function cargarLeaflet() {
  if (!LF_P) LF_P = new Promise((ok, ko) => {
    const l = document.createElement("link"); l.rel = "stylesheet"; l.href = "js/vendor/leaflet/leaflet.css"; document.head.appendChild(l);
    const js = src => new Promise((a, b) => { const sc = document.createElement("script"); sc.src = src; sc.onload = a; sc.onerror = b; document.head.appendChild(sc); });
    for (const css of ["js/vendor/leaflet/markercluster.css", "js/vendor/leaflet/locate.css", "js/vendor/leaflet/gesture.css"]) { const k = document.createElement("link"); k.rel = "stylesheet"; k.href = css; document.head.appendChild(k); }
    // Leaflet + agrupar puntos (Leaflet.markercluster, MIT) + "seguir mi ubicación" (Leaflet.Locate, MIT)
    js("js/vendor/leaflet/leaflet.js").then(() => Promise.all([js("js/vendor/leaflet/markercluster.js"), js("js/vendor/leaflet/locate.js"), js("js/vendor/leaflet/gesture.js").catch(() => {})])).then(() => ok(window.L), () => { LF_P = null; ko(); });
  });
  return LF_P;
}
const MAPA = { off: new Set() };
/* pin de una sucursal: gota con la sigla de la cadena (en vez de un puntito de color) */
const pinHtml = (st, grande) => `<span class="pin${grande ? " g" : ""}" style="--c:${st.color || "#0e7a55"}"><b>${esc(st.sigla || st.name.slice(0, 2))}</b></span>`;
async function vMapa() {
  setTab("");
  const marcar = MAPA.marcar; MAPA.marcar = false;
  $("#view").innerHTML = `<div class="wrap"><section class="blk first"><div class="blk-h"><h1>🗺️ Sucursales cerca</h1>
      <button class="btn sec sm" data-ubic>${ic("map-pin")} ${UBIC ? "Cambiar ubicación" : "Elegir ubicación"}</button></div>
    <p class="sub" id="mintro" style="margin:-4px 0 10px"></p>
    <div class="chips mchips" id="mchips"></div>
    <div class="mapw"><div id="mapa" class="mapa" role="region" aria-label="Mapa de sucursales"><div class="loading" style="padding:40px">Cargando el mapa…</div></div>
      <button type="button" class="btn sm mzona" id="mzona" hidden>${ic("search")} Buscar en esta zona</button></div>
    <div id="mlista" class="mlista" aria-live="polite"></div>
    <p class="sub" style="margin-top:8px">Mapa: © colaboradores de <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a>. Ubicaciones de la base oficial de precios; algunas son aproximadas.</p>
  </section></div>`;
  let L;
  try { [L] = await Promise.all([cargarLeaflet(), loadSuc(), loadProducts()]); } catch { $("#mapa").innerHTML = '<div class="empty">No se pudo cargar el mapa. Revisá tu conexión.</div>'; return; }
  if (!$("#mapa")) return;   // te fuiste mientras cargaba
  // cuánto sale el carrito en cada cadena (en el local, hoy)
  const items = itemsOf(LISTA), tot = {};
  if (items.length) for (const b of rankAll(items, HOY)) if (b.c === "tienda" && !b.miss.length && !(b.sid in tot)) tot[b.sid] = b.total;
  const cadenas = D.stores.filter(st => (SUC[st.id] || []).some(sucValida));
  const intro = () => { $("#mintro").innerHTML = (UBIC ? `Tu ubicación: <b>${esc(UBIC.label)}</b> (tocá el mapa o arrastrá el punto negro para cambiarla). ` : "<b>Tocá el mapa donde estás</b> para marcar tu ubicación, o usá el botón ➤. ")
    + "Tocá una sucursal para ver la dirección" + (items.length ? " y cuánto te sale tu carrito ahí." : "."); };
  intro();
  const centro = UBIC ? [UBIC.lat, UBIC.lon] : (() => { const all = cadenas.flatMap(st => SUC[st.id].filter(sucValida)); if (!all.length) return OBELISCO; return [all.reduce((a, b) => a + b[0], 0) / all.length, all.reduce((a, b) => a + b[1], 0) / all.length]; })();
  $("#mapa").innerHTML = "";
  const m = L.map("mapa", { zoomControl: true, tap: true, gestureHandling: !!window.leafletGestureHandling,
    gestureHandlingOptions: { duration: 1400, text: { touch: "Usá dos dedos para mover el mapa", scroll: "Usá Ctrl + rueda del mouse para acercar o alejar", scrollMac: "Usá ⌘ + rueda del mouse para acercar o alejar" } } }).setView(centro, UBIC ? 15 : PROV === "AR-C" ? 12 : 9);
  L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", { maxZoom: 19, attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>' }).addTo(m);

  // ---- tu ubicación: punto azul que se puede arrastrar ----
  let yo = null;
  const ponerYo = () => {
    if (yo) { m.removeLayer(yo); yo = null; }
    if (!UBIC) return;
    yo = L.marker([UBIC.lat, UBIC.lon], { draggable: true, zIndexOffset: 1000, title: "Tu ubicación (arrastrala para moverla)", keyboard: false,
      icon: L.divIcon({ className: "yo", html: "<span></span>", iconSize: [26, 26] }) }).addTo(m)
      .bindTooltip("Vos estás acá · arrastrá para mover", { direction: "top", offset: [0, -14] });
    yo.on("dragend", e => { const { lat, lng } = e.target.getLatLng(); fijarUbic(lat, lng, "punto del mapa"); });
  };
  const fijarUbic = (lat, lon, label, gps) => {
    UBIC = { lat: +lat.toFixed(5), lon: +lon.toFixed(5), label, km: (UBIC && UBIC.km) || 3, ...(gps ? { gps: true } : { mapa: true }) };
    LS.set(PK("cs_ubic"), UBIC); calcCerca(); updUbic(); ponerYo(); intro(); m.closePopup(); buscarZona(); ubicCambio();
    toast("📍 Ubicación guardada: «Cómo llegar» sale desde acá");
  };
  ponerYo();
  // tocar el mapa: marcar mi ubicación en ese punto
  m.on("click", e => {
    // el botón se arma como elemento y se conecta directo: si tocás el mapa varias veces, cada cartel tiene el suyo
    const box = L.DomUtil.create("div", "mmb"), bt = L.DomUtil.create("button", "btn sm", box);
    bt.type = "button"; bt.innerHTML = `${ic("map-pin")} Marcar mi ubicación acá`;
    L.DomEvent.disableClickPropagation(box);
    L.DomEvent.on(bt, "click", ev => { L.DomEvent.stop(ev); m.closePopup(); fijarUbic(e.latlng.lat, e.latlng.lng, "punto del mapa"); });
    L.popup({ closeButton: true, className: "mmarca", autoPan: false }).setLatLng(e.latlng).setContent(box).openOn(m);
  });
  // botón ➤: usar la ubicación del dispositivo (y seguirla mientras caminás)
  if (L.control.locate) {
    const lc = L.control.locate({ position: "topleft", setView: "untilPanOrZoom", flyTo: true, showPopup: false, keepCurrentZoomLevel: false, initialZoomLevel: 16, drawCircle: true, drawMarker: false,
      strings: { title: "Usar mi ubicación actual" }, locateOptions: { enableHighAccuracy: true, maxZoom: 16, timeout: 20000 } }).addTo(m);
    let primera = true;
    m.on("locationfound", e => { if (primera) { primera = false; fijarUbic(e.latlng.lat, e.latlng.lng, "tu ubicación actual", true); } });
    m.on("locationerror", e => { primera = true; lc.stop(); toast(geoError(e.code), 7000); });
  }

  // ---- sucursales, agrupadas cuando están muy juntas ----
  const grupo = L.markerClusterGroup ? L.markerClusterGroup({ chunkedLoading: true, maxClusterRadius: 44, disableClusteringAtZoom: 15, showCoverageOnHover: false, spiderfyOnMaxZoom: true,
    iconCreateFunction: c => { const n = c.getChildCount(); return L.divIcon({ className: "mcl", html: `<span>${n}</span>`, iconSize: n < 10 ? [34, 34] : n < 100 ? [40, 40] : [46, 46] }); } }) : L.layerGroup();
  grupo.addTo(m);
  const capas = {}, todas = [];
  const popup = (st, b) => {
    const d = UBIC ? dist(UBIC.lat, UBIC.lon, b[0], b[1]) : null;
    return `<div class="mpop"><div class="mph">${pinHtml(st)}<b>${esc(st.name)}</b></div>${esc(b[2] || "")}${b[3] ? `, ${esc(b[3])}` : ""}${d != null ? `<br><span class="sub">a ${kmTxt(d)} de tu ubicación</span>` : ""}
      ${st.id in tot ? `<div class="mtot">Tu carrito acá: <b>${money(tot[st.id])}</b></div>` : ""}
      <a class="btn sm" target="_blank" rel="noopener" data-mapa-ir href="https://www.google.com/maps/dir/?api=1${UBIC ? `&origin=${UBIC.lat},${UBIC.lon}` : ""}&destination=${b[0]},${b[1]}">${ic("navigation")} Cómo llegar${UBIC ? "" : " (desde donde estés)"}</a></div>`;
  };
  for (const st of cadenas) {
    const g = [];
    for (const b of SUC[st.id]) {
      if (!sucValida(b)) continue;
      const mk = L.marker([b[0], b[1]], { title: `${st.name} · ${b[2] || ""}`, riseOnHover: true, icon: L.divIcon({ className: "mpin", html: pinHtml(st), iconSize: [30, 38], iconAnchor: [15, 37], popupAnchor: [0, -34] }) })
        .bindPopup(() => popup(st, b), { maxWidth: 260 });   // se arma al abrir: así usa tu ubicación actual
      mk._suc = { st, b }; g.push(mk); todas.push(mk);
    }
    capas[st.id] = g; if (!MAPA.off.has(st.id)) grupo.addLayers(g);
  }
  const chips = () => { $("#mchips").innerHTML = cadenas.map(st => `<button type="button" class="chip${MAPA.off.has(st.id) ? "" : " on"}" data-mcad="${st.id}" aria-pressed="${!MAPA.off.has(st.id)}">${pinHtml(st)}${esc(st.name)}${st.id in tot ? ` · ${money(tot[st.id])}` : ""}</button>`).join(""); };
  chips();
  $("#mchips").onclick = e => { const c = e.target.closest("[data-mcad]"); if (!c) return; const id = c.dataset.mcad; if (MAPA.off.has(id)) { MAPA.off.delete(id); grupo.addLayers ? grupo.addLayers(capas[id]) : capas[id].forEach(x => x.addTo(grupo)); } else { MAPA.off.add(id); grupo.removeLayers ? grupo.removeLayers(capas[id]) : capas[id].forEach(x => grupo.removeLayer(x)); } chips(); buscarZona(); };

  // ---- "Buscar en esta zona": la sucursal más cercana de cada cadena en lo que se ve del mapa ----
  const buscarZona = () => {
    $("#mzona").hidden = true;
    const bz = m.getBounds(), c = m.getCenter(), ref = UBIC && bz.contains([UBIC.lat, UBIC.lon]) ? [UBIC.lat, UBIC.lon] : [c.lat, c.lng];
    const porCad = {};
    for (const mk of todas) {
      const { st, b } = mk._suc; if (MAPA.off.has(st.id) || !bz.contains(mk.getLatLng())) continue;
      const d = dist(ref[0], ref[1], b[0], b[1]), x = porCad[st.id] || (porCad[st.id] = { st, n: 0, best: null });
      x.n++; if (!x.best || d < x.best.d) x.best = { d, b, mk };
    }
    const filas = Object.values(porCad).sort((a, b2) => items.length && (a.st.id in tot) !== (b2.st.id in tot) ? ((b2.st.id in tot) - (a.st.id in tot)) : items.length && a.st.id in tot ? tot[a.st.id] - tot[b2.st.id] : a.best.d - b2.best.d);
    const n = filas.reduce((a, f) => a + f.n, 0);
    $("#mlista").innerHTML = !filas.length ? `<div class="empty" style="padding:18px">No hay sucursales en esta parte del mapa. Alejá el mapa o movelo.</div>`
      : `<h3 class="mlh">${n} ${n === 1 ? "sucursal" : "sucursales"} en esta zona${items.length ? " · ordenadas por lo que te sale tu carrito" : ""}</h3>` + filas.map((f, i) => `<div class="mfila">
        ${pinHtml(f.st)}<div class="mfi"><b>${esc(f.st.name)}</b>${f.n > 1 ? ` <span class="sub">· ${f.n} en la zona</span>` : ""}<br><span class="sub">La más cercana: ${esc(f.best.b[2] || "")}${f.best.b[3] ? `, ${esc(f.best.b[3])}` : ""} · a ${kmTxt(f.best.d)}${UBIC && ref[0] === UBIC.lat ? "" : " del centro del mapa"}</span></div>
        ${f.st.id in tot ? `<div class="mft"><b>${money(tot[f.st.id])}</b><span class="sub">tu carrito</span></div>` : ""}
        <div class="mfb"><button type="button" class="btn sec sm" data-mver="${i}">Ver</button><a class="btn sm" target="_blank" rel="noopener" href="https://www.google.com/maps/dir/?api=1${UBIC ? `&origin=${UBIC.lat},${UBIC.lon}` : ""}&destination=${f.best.b[0]},${f.best.b[1]}">${ic("navigation")} Cómo llegar</a></div></div>`).join("");
    $$("[data-mver]").forEach(bt => bt.onclick = () => { const mk = filas[+bt.dataset.mver].best.mk; $("#mapa").scrollIntoView({ behavior: "smooth", block: "center" }); grupo.zoomToShowLayer ? grupo.zoomToShowLayer(mk, () => mk.openPopup()) : (m.setView(mk.getLatLng(), 16), mk.openPopup()); });
  };
  let auto = true;
  m.on("movestart", () => { if (!auto) $("#mzona").hidden = false; });
  $("#mzona").onclick = buscarZona;
  setTimeout(() => { m.invalidateSize(); buscarZona(); auto = false; }, 150);
  if (marcar) toast("Tocá el mapa en el lugar donde estás y elegí «Marcar mi ubicación acá»", 6000);
}
/* por qué no se pudo obtener la ubicación, en criollo */
function geoError(code) {
  if (code === 1) return "El navegador no deja usar tu ubicación. Activá el permiso del sitio (el candado al lado de la dirección) o marcala tocando el mapa.";
  if (code === 3) return "Tardó demasiado en encontrar tu ubicación. Probá de nuevo al aire libre o marcala tocando el mapa.";
  return "Tu dispositivo no pudo saber dónde estás. En la compu, revisá que la ubicación de Windows o Mac esté activada; si no, marcala tocando el mapa.";
}
/* pide la ubicación: primero rápida (Wi-Fi), y si falla, con GPS y más tiempo */
function pedirUbicacion(ok, mal) {
  if (!navigator.geolocation) return mal(2);
  navigator.geolocation.getCurrentPosition(ok, e1 => {
    if (e1.code === 1) return mal(1);
    navigator.geolocation.getCurrentPosition(ok, e2 => mal(e2.code), { enableHighAccuracy: true, timeout: 20000, maximumAge: 0 });
  }, { enableHighAccuracy: false, timeout: 8000, maximumAge: 600000 });
}

/* ---------- CONOCENOS / ACERCA DE ---------- */
function vNosotros() {
  setTab("nosotros");
  const zona = enAMBA() ? "CABA y el Gran Buenos Aires" : provNombre(PROV);
  const faq = [
    ["¿Es gratis?", "Sí. No cobramos nada, no hace falta crear una cuenta y no vendemos productos: te mostramos dónde conviene y el botón «Ver» te lleva a la tienda de cada comercio."],
    ["¿Por qué el precio de mi sucursal es distinto?", "Mostramos el precio más común entre las sucursales de cada cadena en tu provincia. Algunas sucursales tienen precios propios, así que puede variar un poco."],
    ["¿Los descuentos se suman entre sí?", "En general no: cada banco o billetera tiene su tope y sus condiciones. En cada descuento te decimos el tope, los días y cómo hay que pagar para que se aplique."],
    ["¿Cada cuánto se actualizan los precios?", "Todos los días. Los precios de las sucursales salen de la base oficial que las cadenas informan a diario."],
    ["¿Por qué en mi provincia hay pocas cadenas?", "Solo podemos mostrar las cadenas que informan sus precios a la base oficial. Los descuentos con bancos y billeteras sí están completos, aunque la cadena no informe precios."],
    ["¿Cómo cambio de provincia?", "Con el botón 🗺️ que está arriba, al lado de «Elegí tu ubicación». Tu carrito se guarda aparte para cada provincia."],
    ["¿Qué hacen con mis datos?", "Tu carrito, tus medios de pago y tu ubicación quedan solo en tu navegador. Más detalles en la Política de privacidad."],
  ];
  $("#view").innerHTML = `<div class="wrap legal nosotros"><section class="blk first">
    <h1>👋 Conocenos</h1>
    <p>ComparáSúper nació con una idea simple: que hacer las compras del súper cueste menos. Juntamos en un solo lugar los precios de los supermercados y mayoristas, sus ofertas y los descuentos de bancos, billeteras y tarjetas de cada día, para que sepas <b>dónde, qué día y cómo pagar</b> para gastar menos.</p>
    <p>Es un <b>proyecto independiente</b>: no tiene relación comercial con los comercios, las apps ni los bancos que aparecen, y ningún comercio paga para salir primero.</p>
    <h2 id="s-acerca">Acerca de</h2>
    <ul>
      <li><b>Qué comparamos:</b> el mismo producto (por código de barras) en cada cadena de ${esc(zona)}, en el local y online.</li>
      <li><b>Dónde:</b> en las 24 provincias. Elegís la tuya al entrar y ves solo sus comercios, precios y descuentos.</li>
      <li><b>Cuánto cuesta:</b> nada. Si en algún momento hay publicidad, siempre va a estar marcada como tal y nunca cambia los precios ni el orden.</li>
    </ul>
    <h2 id="s-datos">De dónde salen los precios</h2>
    <ul>
      <li><b>Precios de las sucursales:</b> base oficial <b>SEPA / Precios Claros</b> de la Secretaría de Comercio, que las cadenas grandes informan todos los días, sucursal por sucursal.</li>
      <li><b>Precios online:</b> los de la tienda web o app de cada comercio, sin el costo de envío.</li>
      <li><b>Descuentos con medios de pago:</b> los leemos de las páginas oficiales de cada banco, billetera o tarjeta (y de MODO, que se actualiza solo). Cada descuento dice su fuente y la fecha en que se verificó.</li>
    </ul>
    <h2 id="s-aviso">Aviso sobre precios</h2>
    <p>Mostramos el precio <b>más común</b> entre las sucursales de cada cadena; en tu sucursal puede variar. Los descuentos bancarios tienen topes, días y condiciones, y no suelen sumarse entre sí: <b>verificá siempre el precio y el descuento antes de pagar</b>.</p>
    <h2 id="s-preguntas">Preguntas frecuentes</h2>
    <div class="faq">${faq.map(([q, a]) => `<details><summary>${q}</summary><p>${a}</p></details>`).join("")}</div>
    <h2>Contacto</h2>
    <p>¿Encontraste un error, falta un comercio o tenés una idea? Escribinos desde <a href="#sugerencias">Contacto y sugerencias</a>.</p>
    <p class="sub">También podés leer los <a href="#legal">Términos de uso</a> y la <a href="#legal-privacidad">Política de privacidad</a>.</p>
  </section></div>`;
}

/* ---------- TÉRMINOS Y PRIVACIDAD ---------- */
function vLegal() {
  setTab("legal");
  $("#view").innerHTML = `<div class="wrap legal"><section class="blk first">
    <h1>📄 Términos de uso y privacidad</h1><p class="sub">Última actualización: noviembre de 2026.</p>
    <h2>Qué es ComparáSúper</h2>
    <p>ComparáSúper es un comparador independiente y gratuito de precios de supermercados, mayoristas y tiendas online de ${enAMBA() ? "CABA y GBA" : esc(provNombre(PROV))}. <b>No vende productos</b>, no cobra comisiones y no tiene relación comercial con los comercios, bancos ni billeteras que aparecen.</p>
    <h2>Precios y descuentos</h2>
    <ul>
      <li>Los precios de las sucursales salen de la base oficial <b>SEPA (Precios Claros)</b> de la Secretaría de Comercio, que informan las cadenas. Mostramos el precio más común entre las sucursales de la zona; en tu sucursal puede ser distinto.</li>
      <li>Los precios online salen de las tiendas web de cada cadena, sin costo de envío.</li>
      <li>Los descuentos con bancos, billeteras y tarjetas los relevamos de las páginas oficiales y de notas periodísticas; cada uno indica su fuente y la fecha en que se verificó. Tienen topes, días y condiciones que pueden cambiar sin aviso.</li>
      <li>Hacemos lo posible para que todo esté correcto, pero <b>la información es orientativa</b>: confirmá siempre el precio y el descuento en el comercio antes de pagar. No nos hacemos responsables por diferencias, errores de las fuentes ni cambios de último momento.</li>
      <li>Las marcas, logos y fotos de productos pertenecen a sus dueños y se usan solo para identificar los productos y comercios comparados.</li>
    </ul>
    <h2 id="s-privacidad">Privacidad: qué datos usamos</h2>
    <ul>
      <li><b>No necesitás crear una cuenta.</b> Tu carrito, tus medios de pago, tus avisos, la vista elegida y el tema se guardan <b>solo en tu navegador</b> (almacenamiento local) y no se mandan a ningún lado. Si borrás los datos del navegador, se borran.</li>
      <li><b>Ubicación:</b> si la marcás, se usa en tu navegador para calcular los comercios cercanos. No se envía ni se guarda en ningún servidor.</li>
      <li><b>Cámara:</b> al escanear un código de barras, la imagen se procesa en tu celular y no se sube a ningún lado.</li>
      <li><b>Sugerencias y novedades:</b> si dejás una sugerencia (con tu nombre, si querés) o tu correo para recibir novedades, se guardan en una planilla privada de Google del responsable del sitio. Las sugerencias solo se publican después de ser revisadas. Tu correo se usa únicamente para mandarte las novedades; podés pedir la baja en cualquier momento respondiendo cualquier correo.</li>
      <li><b>Publicidad:</b> si hay anuncios, siempre están marcados como «Publicidad» y nunca cambian los precios, el orden ni qué comercio aparece como más barato.</li>
      <li><b>Estadísticas de visitas:</b> si están activadas, contamos visitas de forma anónima (qué secciones se usan, desde qué tipo de dispositivo y cuántas veces se toca un enlace hacia cada tienda), sin cookies y sin datos personales.</li>
      <li><b>Enlaces a otras páginas:</b> al tocar «Ver en la tienda» o «Armar el carrito» pasás al sitio del comercio, que tiene sus propias condiciones y políticas de privacidad.</li>
      <li>El <b>asistente virtual</b> funciona dentro de tu navegador: lo que le escribís no se envía a ningún lado.</li>
    </ul>
    <p>Podés pedir que se borre tu correo o una sugerencia tuya escribiendo por la sección <a href="#sugerencias">Dejanos tu sugerencia</a>. Estos datos se tratan conforme a la Ley 25.326 de Protección de Datos Personales.</p>
  </section></div>`;
}

/* ---------- CÓMO FUNCIONA ---------- */
function vComo() {
  setTab("como");
  setTimeout(() => { const w = $("#cwiz"); if (w) w.onclick = () => wizard(1); });
  $("#view").innerHTML = `<div class="wrap"><section class="blk first"><div class="blk-h"><h1>ℹ️ Cómo funciona</h1></div>
      <div class="how4">
        <div class="box"><div class="n">1</div><h3>Mismo producto, de verdad</h3><p>Comparamos por código de barras, no por el nombre: la leche de 1 litro de un súper es exactamente la misma que la del otro.</p></div>
        <div class="box"><div class="n">2</div><h3>Local, online o app</h3><p>Mostramos el precio en la sucursal y en la tienda web o app, con el costo de envío. A veces online sale menos.</p></div>
        <div class="box"><div class="n">3</div><h3>Tu forma de pago cuenta</h3><p>Elegí tus bancos, billeteras y tarjetas. Te decimos el precio final y <b>cómo pagar</b> para que el descuento aplique (QR, tarjeta física, NFC…).</p></div>
        <div class="box"><div class="n">4</div><h3>Tu compra entera</h3><p>Armá tu compra y te decimos dónde, qué día y con qué medio sale menos, incluso mezclando dos comercios. Tu carrito lo mandás por WhatsApp o correo.</p></div>
      </div>
      <div class="cbtns"><button class="btn" data-tour>🧭 Ver la guía rápida</button><button class="btn sec" id="cwiz">⚙️ Configurar mis preferencias</button><button class="btn sec" data-instalar>📲 Instalar como app</button></div>
      <div class="box" style="margin-top:16px"><h3>📖 Palabras que vas a ver</h3><dl class="glos">${Object.values(GLOS).map(([t, d]) => `<dt>${esc(t)}</dt><dd>${esc(d)}</dd>`).join("")}</dl></div>
      <div class="box" style="margin-top:16px"><h3>¿De dónde salen los datos?</h3>
        <p class="sub">Los precios de las sucursales vienen de la base oficial de precios (SEPA) que las cadenas informan cada día. Los precios online, de las tiendas web de cada cadena. Los descuentos con bancos y billeteras los relevamos de las páginas oficiales y de notas periodísticas, y cada uno dice su fuente. Actualizamos todos los días: confirmá siempre antes de pagar.</p></div>
    </section></div>`;
}

/* ---------- BUSCAR / CATEGORÍAS ---------- */
const nrm = s => s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
/* qué tan bien coincide el nombre con lo buscado: 0 = empieza con la palabra, 1 = la tiene como palabra entera, 2 = la tiene dentro de otra */
function matchScore(p, words) {
  if (!words.length) return 0;
  const n = nrm(p.name), w = words[0];
  if (n.startsWith(w)) return 0;
  if (new RegExp("(^|[^a-z0-9])" + w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "([^a-z0-9]|$)").test(n)) return 1;
  return 2;
}
/* búsqueda tolerante: "yerva" encuentra yerba, "galletistas" encuentra galletitas, "aseite" encuentra aceite */
const fon = w => nrm(w).replace(/[^a-z0-9ñ]/g, "").replace(/ñ/g, "n").replace(/ch/g, "§").replace(/h/g, "").replace(/§/g, "ch").replace(/v/g, "b").replace(/w/g, "u")
  .replace(/z/g, "s").replace(/c([ei])/g, "s$1").replace(/qu/g, "k").replace(/c/g, "k").replace(/ll/g, "y").replace(/g([ei])/g, "j$1").replace(/x/g, "ks").replace(/(.)\1+/g, "$1");
let VOC = null;   // palabras de los nombres → cuántos productos las tienen
function vocab() {
  if (VOC) return VOC; VOC = new Map();
  for (const p of D.products) { p._t = nrm(p.name + " " + p.brand); p._f = p._t.split(/[^a-z0-9ñ]+/).map(fon).join(" "); for (const w of new Set(p._t.split(/[^a-z0-9ñ]+/))) if (w.length > 2 && !/\d/.test(w)) VOC.set(w, (VOC.get(w) || 0) + 1); }
  return VOC;
}
function lev(a, b, max) {   // distancia de edición, cortando si pasa de "max"
  if (Math.abs(a.length - b.length) > max) return max + 1;
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) { const cur = [i]; let mn = i; for (let j = 1; j <= b.length; j++) { cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1)); mn = Math.min(mn, cur[j]); } if (mn > max) return max + 1; prev = cur; }
  return prev[b.length];
}
/* palabra mal escrita → la más parecida que existe en los productos */
function corregir(w) {
  const V = vocab(); if (w.length < 4 || V.has(w) || /\d/.test(w)) return w;
  const max = w.length >= 7 ? 2 : 1; let best = null;
  for (const [x, n] of V) { if (x[0] !== w[0] && fon(x)[0] !== fon(w)[0]) continue; const d = lev(w, x, max); if (d <= max && (!best || d < best.d || (d === best.d && n > best.n))) best = { x, d, n }; }
  return best ? best.x : w;
}
const matchW = (p, w) => p._t.includes(w) || p._f.includes(fon(w));
const MARCA_PROPIA = /^(carrefour|cuisine ?& ?co|dia\b|great value|coto\b|check\b|best choice|jumbo\b|vea\b|disco\b)/;
function results() {
  let words = nrm(S.q).split(/\s+/).filter(Boolean), ids = null;
  S.qfix = "";
  if (words.length && BUSC.ok && READY) {   // el proceso de fondo ya tiene el índice: le preguntamos
    const k = nrm(S.q).trim(), res = buscarFondo(S.q, () => { if (nrm(S.q).trim() === k && vBuscar.draw && $("#res")) vBuscar.draw(); });
    if (!res) return null;   // en camino: se dibuja al llegar
    ids = new Set(res.ids); if (res.fix) { S.qfix = res.fix; words = res.fix.split(" "); }
  } else {
    vocab();
    const base = p => (!S.cat || p.cat === S.cat);
    if (words.length && !D.products.some(p => base(p) && words.every(w => matchW(p, w)))) {   // sin resultados: probar corrigiendo
      const fixed = words.map(corregir);
      if (fixed.join(" ") !== words.join(" ")) { words = fixed; S.qfix = fixed.join(" "); }
    }
  }
  const list = D.products.filter(p => {
    if (S.cat && p.cat !== S.cat) return false;
    if (ids ? !ids.has(p.id) : !words.every(w => matchW(p, w))) return false;
    const sf = stFilter(); if (sf && !p.offers.some(o => sf.has(o.s))) return false;
    if (S.onlyPromo && !hasPromo(p)) return false;
    if (S.sintacc && !/tacc|sin gluten|libre de gluten/.test(nrm(p.name))) return false;
    if (S.propia && !MARCA_PROPIA.test(nrm(p.brand))) return false;
    return true;
  });
  const flt = stFilter();
  const pr = p => best(p, flt).v;
  const spread = p => { const vs = p.offers.flatMap(o => allChans(o).map(c => price1(o, c))); return vs.length < 2 ? 0 : (Math.max(...vs) - Math.min(...vs)) / Math.max(...vs); };
  const drop = p => Math.min(0, ...p.offers.map(o => (o.chg && !o.anom ? o.chg.pct : 0)));
  const sorters = { relev: (a, b) => (matchScore(a, words) - matchScore(b, words)) || (b.offers.length - a.offers.length) || ((b.img ? 1 : 0) - (a.img ? 1 : 0)) || (pr(a) - pr(b)), precio: (a, b) => pr(a) - pr(b), unidad: (a, b) => (perUnit(a, pr(a)) ?? 1e12) - (perUnit(b, pr(b)) ?? 1e12),
    ahorro: (a, b) => spread(b) - spread(a), baja: (a, b) => drop(a) - drop(b), nombre: (a, b) => a.name.localeCompare(b.name, "es") };
  return list.sort(sorters[S.sort] || sorters.relev);
}
const PAGE = 48;
/* paginado con números: 1 2 3 … 10 */
function pager(total, page, id, per = PAGE) {
  const pages = Math.ceil(total / per); if (pages <= 1) return "";
  const nums = [...new Set([1, 2, page - 1, page, page + 1, pages - 1, pages].filter(n => n >= 1 && n <= pages))].sort((a, b) => a - b);
  let out = [], prev = 0;
  for (const n of nums) { if (n - prev > 1) out.push('<span class="gap">…</span>'); out.push(`<button class="pg${n === page ? " on" : ""}" data-pg="${id}|${n}" ${n === page ? 'aria-current="page"' : ""}>${n}</button>`); prev = n; }
  return `<nav class="pager" aria-label="Páginas"><button class="pg nav" data-pg="${id}|${page - 1}" ${page <= 1 ? "disabled" : ""}>‹ Anterior</button>${out.join("")}<button class="pg nav" data-pg="${id}|${page + 1}" ${page >= pages ? "disabled" : ""}>Siguiente ›</button></nav>`;
}   // productos por tanda, para que la página no se ponga lenta con miles de resultados
/* formas de ver los productos (como "Ver" del explorador de Windows) */
const VISTAS = { m: { t: "Íconos grandes", d: "3 columnas", i: "▦", per: 15 }, s: { t: "Íconos chicos", d: "5 columnas", i: "▪", per: 35 }, l: { t: "Lista", d: "50 por página", i: "☰", per: 50 } };
S.vista = VISTAS[LS.get("cs_vista", "m")] ? LS.get("cs_vista", "m") : "m";
function lrow(p) {
  const b = best(p, stFilter()), pr = p.offers.find(x => x.promo || x.promoo), pt = pr && (pr.promo || pr.promoo);
  return `<div class="lrow" data-open="${p.id}" tabindex="0" role="button" aria-label="${esc(p.name)}">${prodImg(p, "li")}
    <div class="ln"><b>${esc(p.name)}</b>${pt ? ` <span class="tag sm">🏷️ ${esc(pt.txt)}</span>` : ""}</div>
    <div class="lw">${where(b)}</div>
    <div class="lp"><b>${money(b.v)}</b><span class="sub">${unitTxt(p, b.v)}</span></div>
    <div class="lc sub">${p.offers.length} com.</div>
    <div class="la">${addCtl(p.id)}</div></div>`;
}
function vBuscar() {
  setTab("buscar");
  const cat = D.cats.find(c => c.id === S.cat);
  const title = S.q ? `Resultados para «${esc(S.q)}»` : cat ? `${cat.emoji} ${esc(cat.name)}` : "Todos los productos";
  $("#view").innerHTML = `<div class="wrap layout">
    <div class="fback${S.fopen ? " open" : ""}" id="fback"></div>
    <aside class="filters${S.fopen ? " open" : ""}" id="filters" aria-label="Filtros">
      <div class="fhead"><b>Filtros</b><button class="fx" id="fx" type="button" aria-label="Cerrar filtros">✕</button></div>
      <label class="fpromo"><input type="checkbox" id="fpromo" ${S.onlyPromo ? "checked" : ""}> 🏷️ Solo con oferta</label>
      ${UBIC ? `<label class="fcerca"><input type="checkbox" id="fcerca" ${S.cerca ? "checked" : ""}> 📍 Solo comercios cerca de ${esc(UBIC.label)} (${Object.keys(CERCA || {}).length})</label>` : `<button class="linkbtn fcerca0" type="button" data-ubic>📍 Marcar mi ubicación para ver comercios cercanos</button>`}
      <h4>Categoría</h4>
      <label><input type="radio" name="cat" value="" ${S.cat ? "" : "checked"}> Todas</label>
      ${D.cats.filter(c => D.products.some(p => p.cat === c.id)).map(c => `<label><input type="radio" name="cat" value="${c.id}" ${S.cat === c.id ? "checked" : ""}> ${c.emoji} ${esc(c.name)}</label>`).join("")}
      <h4>Dónde comprar</h4>
      ${[["ambos", "Local y online"], ["tienda", "Solo en el local"], ["online", "Solo online / apps"]].map(([v, t]) => `<label><input type="radio" name="can" value="${v}" ${S.canal === v ? "checked" : ""}> ${t}</label>`).join("")}
      ${grupos().map(([n, ss], i) => `<h4>${n}${i === 0 ? ' <button class="linkbtn" id="stall" hidden>ver todos</button>' : ""}</h4>
      <div class="stlist">${ss.map(s => `<label><input type="checkbox" name="st" value="${s.id}" ${S.stores.has(s.id) ? "checked" : ""}> ${storeChip(s.id)}</label>`).join("")}</div>`).join("")}
      <div class="ffoot"><button class="btn sec sm" id="freset" type="button">Limpiar</button><button class="btn sm" id="fclose" type="button">Ver resultados</button></div>
    </aside>
    <div>
      <div class="toolbar"><div><h1>${title}</h1><span class="sub" id="rcount"></span></div>
        <div class="tbtns"><button class="btn sec sm fbtn" id="fopen">Filtros</button>
        <details class="vmenu" id="vmenu"><summary class="btn sec sm" aria-label="Cambiar la vista">${VISTAS[S.vista].i} Ver ▾</summary>
          <div class="vopts">${Object.entries(VISTAS).map(([k, v]) => `<button type="button" data-vista="${k}" class="${S.vista === k ? "on" : ""}"><span class="vi">${v.i}</span><span>${v.t}<small>${v.d}</small></span>${S.vista === k ? "<b>•</b>" : ""}</button>`).join("")}</div></details>
        <select class="sel" id="sort" aria-label="Ordenar">
          ${[["relev", "Más populares"], ["precio", "Menor precio"], ["unidad", "Menor precio por kg / litro"], ["ahorro", "Mayor diferencia entre comercios"], ["baja", "Más bajaron"], ["nombre", "Nombre (A-Z)"]].map(([v, t]) => `<option value="${v}" ${S.sort === v ? "selected" : ""}>${t}</option>`).join("")}
        </select></div></div>
      <div class="qchips" role="group" aria-label="Filtros rápidos">${[
        ["promo", ic("tag") + " Con oferta", S.onlyPromo], FAV.size ? ["fav", `${ic("star")} Mis súper (${FAV.size})`, S.favf] : null, UBIC ? ["cerca", ic("map-pin") + " Cerca mío", S.cerca] : null,
        ["tacc", ic("wheat-off") + " Sin TACC", S.sintacc], ["propia", ic("store") + " Marca propia del súper", S.propia], ["kilo", ic("scale") + " Más barato por kilo", S.sort === "unidad"]]
        .filter(Boolean).map(([k, t, on]) => `<button type="button" class="qchip${on ? " on" : ""}" data-qchip="${k}" aria-pressed="${!!on}">${t}</button>`).join("")}</div>
      <div id="res"></div>
    </div></div>`;
  const draw = vBuscar.draw = () => {
    const r = results();
    if (!r) { $("#res").innerHTML = esqueleto(8); return; }
    animar($("#res"));
    $("#rcount").innerHTML = `${r.length} ${r.length === 1 ? "producto" : "productos"}${S.stores.size ? " · precios de los comercios elegidos" : ""}${S.qfix ? ` · <span class="qfix">Mostramos resultados para <b>«${esc(S.qfix)}»</b> (buscaste «${esc(S.q)}»)</span>` : ""}`;
    const per = VISTAS[S.vista].per, pages = Math.max(1, Math.ceil(r.length / per)); if (S.bpage > pages) S.bpage = 1;
    const pg = S.bpage || 1, slice = r.slice((pg - 1) * per, pg * per);
    $("#res").innerHTML = (slice.length ? (S.vista === "l" ? `<div class="lst">${slice.map(lrow).join("")}</div>` : `<div class="grid v-${S.vista}">${slice.map(card).join("")}</div>`)
      : `<div class="empty">No encontramos productos con esos filtros.<br><br><button class="btn sec sm" id="clr">Limpiar filtros</button></div>`)
      + `<div class="more">${pager(r.length, pg, "b", per)}</div>`;
    $$("[data-pg]", $("#res")).forEach(b => b.onclick = () => { S.bpage = +b.dataset.pg.split("|")[1]; draw(); $("#view").scrollIntoView({ behavior: "smooth" }); });
    const c = $("#clr"); if (c) c.onclick = () => { S.q = ""; $("#q").value = ""; S.cat = ""; S.stores.clear(); S.onlyPromo = false; S.canal = "ambos"; vBuscar(); };
    $("#stall").textContent = S.stores.size ? "ver todos" : ""; $("#stall").hidden = !S.stores.size;
    const nf = (S.cat ? 1 : 0) + S.stores.size + (S.onlyPromo ? 1 : 0) + (S.cerca ? 1 : 0) + (S.favf ? 1 : 0) + (S.sintacc ? 1 : 0) + (S.propia ? 1 : 0) + (S.canal !== "ambos" ? 1 : 0);
    $("#fopen").textContent = nf ? `Filtros (${nf})` : "Filtros";
    $("#fclose").textContent = r.length ? `Ver ${r.length} ${r.length === 1 ? "producto" : "productos"}` : "Sin resultados";
  };
  $$("input[name=cat]").forEach(i => i.onchange = () => { S.bpage = 1; S.cat = i.value; setHash(S.cat ? "#c-" + S.cat : "#buscar"); const st = $("#filters").scrollTop; vBuscar(); $("#filters").scrollTop = st; });
  $$("input[name=can]").forEach(i => i.onchange = () => { S.bpage = 1; S.canal = i.value; draw(); });
  $$("input[name=st]").forEach(i => i.onchange = () => { S.bpage = 1; i.checked ? S.stores.add(i.value) : S.stores.delete(i.value); draw(); });
  $("#stall").onclick = () => { S.stores.clear(); $$("input[name=st]").forEach(i => (i.checked = false)); draw(); };
  $("#fpromo").onchange = e => { S.bpage = 1; S.onlyPromo = e.target.checked; draw(); };
  const fc = $("#fcerca"); if (fc) fc.onchange = e => { S.bpage = 1; S.cerca = e.target.checked; draw(); };
  $$("[data-qchip]").forEach(b => b.onclick = () => {
    const k = b.dataset.qchip; S.bpage = 1;
    if (k === "promo") S.onlyPromo = !S.onlyPromo; if (k === "fav") S.favf = !S.favf; if (k === "cerca") S.cerca = !S.cerca;
    if (k === "tacc") S.sintacc = !S.sintacc; if (k === "propia") S.propia = !S.propia; if (k === "kilo") S.sort = S.sort === "unidad" ? "relev" : "unidad";
    vBuscar();
  });
  $("#sort").onchange = e => { S.bpage = 1; S.sort = e.target.value; draw(); };
  $$("[data-vista]").forEach(b => b.onclick = () => { const first = ((S.bpage || 1) - 1) * VISTAS[S.vista].per; S.vista = b.dataset.vista; LS.set("cs_vista", S.vista); S.bpage = Math.floor(first / VISTAS[S.vista].per) + 1; vBuscar(); });
  const setF = open => { if (open) ovOpen("filtros", () => setF(false)); else ovDone("filtros"); S.fopen = open; $("#filters").classList.toggle("open", open); $("#fback").classList.toggle("open", open); document.body.classList.toggle("noscroll", open); };
  $("#fopen").onclick = () => setF(true);
  $("#fclose").onclick = () => { setF(false); $("#view").scrollIntoView(); };
  $("#fx").onclick = () => setF(false);
  $("#fback").onclick = () => setF(false);
  $("#freset").onclick = () => { S.cat = ""; S.stores.clear(); S.onlyPromo = false; S.favf = S.sintacc = S.propia = S.cerca = false; S.canal = "ambos"; S.bpage = 1; setHash("#buscar"); vBuscar(); };
  document.body.classList.toggle("noscroll", !!S.fopen);
  draw();
}

/* ---------- OFERTAS ---------- */
function tipo(t) {
  const n = nrm(t);
  if (/\d\s*x\s*\d/.test(n)) return n.match(/\d\s*x\s*\d/)[0].replace(/\s/g, "");
  if (/2(da|do)/.test(n)) return "2da unidad";
  if (/%/.test(n)) return "% de descuento";
  return "Otras";
}
/* banner de ofertas destacadas: pasa solo cada 5 segundos, con puntitos para elegir y botón de pausa */
let BAN = { t: null, i: 0, pausa: false };
function destacadas() {
  return D.products.filter(p => p.img && p.offers.length >= 2).flatMap(p => p.offers.flatMap(o => [["tienda", o.promo], ["online", o.promoo]]
    .filter(([c, pr]) => pr && base(o, c)).map(([c, pr]) => ({ p, o, c, pr, off: 1 - pr.pu / base(o, c) }))))
    .filter(x => x.off >= 0.15 && x.off <= 0.7).sort((a, b) => b.p.offers.length - a.p.offers.length || b.off - a.off)
    .filter((x, i, arr) => arr.findIndex(y => y.p.id === x.p.id) === i).slice(0, 8);
}
function banner() {
  const xs = destacadas(); if (!xs.length) return "";
  return `<section class="banner" aria-roledescription="carrusel" aria-label="Ofertas destacadas">
    <div class="btrack">${xs.map(({ p, o, c, pr, off }, i) => `<article class="bslide${i === BAN.i % xs.length ? " on" : ""}" aria-roledescription="diapositiva" aria-label="${i + 1} de ${xs.length}">
      <div class="bimg">${prodImg(p, "bi")}</div>
      <div class="btxt"><span class="bk">Oferta destacada</span><span class="tag">🏷️ ${esc(pr.txt)}</span>
        <h3>${esc(p.name)}</h3>
        <div class="bst">${storeChip(o.s, c)}</div>
        <div class="bpr"><b>${money(pr.pu)}</b> <span class="sub">c/u${pr.n > 1 ? ` llevando ${pr.n}` : ""}</span> <s>${money(base(o, c))}</s> <span class="boff">−${Math.round(off * 100)}%</span></div>
        <div class="bbt"><button class="btn light" data-open="${p.id}">Ver producto</button>${addCtl(p.id)}</div></div></article>`).join("")}</div>
    <button class="bpause" id="bpause" aria-label="${BAN.pausa ? "Seguir pasando" : "Pausar"}">${BAN.pausa ? "▶" : "⏸"}</button>
    <div class="bdots" role="group" aria-label="Elegir oferta">${xs.map((_, i) => `<button class="${i === BAN.i % xs.length ? "on" : ""}" data-bdot="${i}" aria-label="Oferta ${i + 1}"></button>`).join("")}</div></section>`;
}
function bannerGo(i) {
  const sl = $$(".bslide"), dots = $$("[data-bdot]"); if (!sl.length) return;
  BAN.i = (i + sl.length) % sl.length;
  sl.forEach((x, k) => x.classList.toggle("on", k === BAN.i)); dots.forEach((x, k) => x.classList.toggle("on", k === BAN.i));
}
function bannerStart() {
  clearInterval(BAN.t);
  if (BAN.emb) { try { BAN.emb.destroy(); } catch {} BAN.emb = null; }
  if ($(".banner")) lib("js/vendor/embla.js", null, () => window.EmblaCarousel).then(emblaBanner).catch(() => {});
  const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
  if (!BAN.pausa && !reduce) BAN.t = setInterval(() => { if (!$(".banner")) { clearInterval(BAN.t); return; } bannerGo(BAN.i + 1); }, 5000);
  $$("[data-bdot]").forEach(b => b.onclick = () => { bannerGo(+b.dataset.bdot); bannerStart(); });
  const pz = $("#bpause"); if (pz) pz.onclick = () => { BAN.pausa = !BAN.pausa; pz.textContent = BAN.pausa ? "▶" : "⏸"; pz.setAttribute("aria-label", BAN.pausa ? "Seguir pasando" : "Pausar"); bannerStart(); };
  const bn = $(".banner"); if (bn) { let x0 = null; bn.ontouchstart = e => (x0 = e.touches[0].clientX); bn.ontouchend = e => { if (x0 === null) return; const dx = e.changedTouches[0].clientX - x0; if (Math.abs(dx) > 40) { bannerGo(BAN.i + (dx < 0 ? 1 : -1)); bannerStart(); } x0 = null; }; }
}
/* carrusel que se desliza con el dedo, con inercia (Embla Carousel + Autoplay, licencia MIT) */
function emblaBanner(E) {
  const bn = $(".banner"); if (!E || !bn || BAN.emb) return;
  clearInterval(BAN.t); bn.ontouchstart = bn.ontouchend = null; bn.classList.add("embla");
  const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches, A = window.EmblaCarouselAutoplay;
  const auto = A && !reduce ? A({ delay: 5000, stopOnInteraction: false, stopOnMouseEnter: true, playOnInit: !BAN.pausa }) : null;
  const emb = BAN.emb = E(bn, { loop: true, container: ".btrack", startIndex: BAN.i % $$(".bslide").length }, auto ? [auto] : []);
  const dots = $$("[data-bdot]"), sel = () => { BAN.i = emb.selectedScrollSnap(); dots.forEach((x, k) => x.classList.toggle("on", k === BAN.i)); $$(".bslide").forEach((x, k) => x.setAttribute("aria-hidden", k !== BAN.i)); };
  emb.on("select", sel); sel();
  dots.forEach(b => b.onclick = () => emb.scrollTo(+b.dataset.bdot));
  const pz = $("#bpause");
  if (pz) { if (!auto) pz.hidden = true; pz.onclick = () => { BAN.pausa = !BAN.pausa; pz.textContent = BAN.pausa ? "▶" : "⏸"; pz.setAttribute("aria-label", BAN.pausa ? "Seguir pasando" : "Pausar"); if (auto) BAN.pausa ? auto.stop() : auto.play(); }; }
}
function vOfertas() {
  setTab("ofertas");
  const all = D.products.flatMap(p => p.offers.flatMap(o => [["tienda", o.promo], ["online", o.promoo]].filter(x => x[1]).map(([c, pr]) => ({ p, o, c, pr }))));
  const tipos = [...new Set(all.map(x => tipo(x.pr.txt)))].sort();
  const list = all.filter(x => (!S.otipo || tipo(x.pr.txt) === S.otipo) && (!S.ostore || x.o.s === S.ostore))
    .sort((a, b) => (a.pr.pu / base(a.o, a.c)) - (b.pr.pu / base(b.o, b.c)));
  $("#view").innerHTML = `<div class="wrap">${banner()}${anuncio("ofertas")}<section class="blk">
    <div class="toolbar"><div><h1>🏷️ Ofertas vigentes</h1><span class="sub">${list.length} ofertas · ordenadas por mayor descuento real por unidad</span></div>${storeSelect("ostore", S.ostore)}</div>
    <div class="chips" style="margin-bottom:18px"><button class="chip${S.otipo ? "" : " on"}" data-ot="">Todas</button>${tipos.map(t => `<button class="chip${S.otipo === t ? " on" : ""}" data-ot="${esc(t)}">${esc(t)}</button>`).join("")}</div>
    <div class="grid">${list.slice(((S.opage || 1) - 1) * PAGE, (S.opage || 1) * PAGE).map(({ p, o, c, pr }) => {
      const off = Math.round((1 - pr.pu / base(o, c)) * 100), b = best(p);
      return `<article class="prod" data-open="${p.id}" tabindex="0">${prodImg(p, "ph")}
        <div class="tags"><span class="tag">🏷️ ${esc(pr.txt)}</span></div>
        <h3>${esc(p.name)}</h3>
        <div>${storeChip(o.s, c)}<div class="price">${money(pr.pu)} <span class="sub" style="font-size:12px;font-weight:600">c/u</span></div>
        <div class="unit">${pr.n > 1 ? `llevando ${pr.n} · ` : ""}<s>${money(base(o, c))}</s> · <b class="okc">−${off}%</b></div>
        ${b.o.s !== o.s && b.v < pr.pu ? `<div class="note">Ojo: sin oferta está más barato en ${esc(chanName(b.o.s, b.c))} (${money(b.v)})</div>` : ""}</div>
        <div class="meta"><span class="sub">${unitTxt(p, pr.pu)}</span>${addCtl(p.id)}</div></article>`;
    }).join("") || `<div class="empty" style="grid-column:1/-1">No hay ofertas con ese filtro.</div>`}
    <div class="more">${pager(list.length, S.opage || 1, "o")}</div></div></section></div>`;
  $$("[data-pg]").forEach(b => b.onclick = () => { S.opage = +b.dataset.pg.split("|")[1]; vOfertas(); scrollTo({ top: 0, behavior: "smooth" }); });
  $$("[data-ot]").forEach(b => b.onclick = () => { S.otipo = b.dataset.ot; S.opage = 1; vOfertas(); });
  $("#ostore").onchange = e => { S.ostore = e.target.value; S.opage = 1; vOfertas(); };
  bannerStart();
}

/* ---------- DESCUENTOS POR DÍA ---------- */
function promoCard(pr) {
  const m = medio(pr);
  return `<div class="promo">
    <div class="top"><div class="mname">${medioBadge(m)}<div><b>${esc(m.name)}</b> <span class="tag gr sm">${esc(P.tipos[m.tipo] || "")}</span>${MEDIOS && mineOk(pr) ? ' <span class="tag g sm">Lo tenés</span>' : ""}
      ${needs(pr).length ? `<div class="req">Requiere además: ${needs(pr).map(r => esc((P.medioBy[r] || { name: r }).name)).join(", ")}</div>` : ""}</div></div>
      <div class="pp">${pr.pct ? pr.pct + "%" : pr.cuotas + " cuotas"}</div></div>
    <div class="stores">${pr.stores.filter(s => ST[s]).map(s => storeChip(s)).join(" ")}</div>
    ${pr.stores.filter(s => ST[s] && ST[s].lista && ST[s].lista.length).map(s => `<div class="sub adher">Adheridos en ${esc(provCorto(PROV))}: ${ST[s].lista.map(esc).join(", ")}</div>`).join("")}
    ${(pr.bancos || []).length ? `<div class="bancos"><span class="sub">${pr.medio === "cuentadni" ? "Billetera de" : "Vale con tarjetas de"}:</span> ${pr.bancos.map(b => P.medioBy[b]).filter(Boolean).map(m => `<span class="bk" title="${esc(m.name)}">${medioBadge(m)}</span>`).join("")}</div>` : ""}
    <div class="howpay"><div class="k">Cómo pagar para que aplique</div>
      ${(pr.pago || []).map(k => { const f = P.formas_pago[k] || { t: k, d: "" }; return `<div class="hp"><span class="i">${f.i || "💳"}</span><div><b>${esc(f.t)}</b><div class="sub">${esc(f.d)}</div></div></div>`; }).join('<div class="or">o</div>')}
      ${pr.nota ? `<div class="sub" style="margin-top:6px">${esc(pr.nota)}</div>` : ""}</div>
    <dl><dt>Tope ${pr.tope ? tip("tope") : ""}</dt><dd>${pr.pct ? topeTxt(pr) : "—"}</dd>
      ${pr.minimo ? `<dt>Compra mínima</dt><dd>${money(pr.minimo)}</dd>` : ""}
      ${pr.reintegro ? `<dt>Te lo devuelven ${pr.reintegro === "reintegro" ? tip("reintegro") : ""}</dt><dd>${esc({ "en la caja": "En el momento, en la caja", "reintegro": "Después, como reintegro en tu cuenta o resumen" }[pr.reintegro] || pr.reintegro)}</dd>` : ""}
      <dt>Dónde</dt><dd>${CANAL[pr.canal] || "—"}</dd>
      <dt>Días</dt><dd>${pr.dias.length === 7 ? "Todos los días" : pr.dias.map(d => DCORTO[d]).join(", ")}</dd>
      <dt>Vigencia</dt><dd>hasta el ${pr.hasta.split("-").reverse().join("/")}</dd>
      <dt>Fuente</dt><dd>${pr.fuente ? `<a href="${esc(pr.fuente)}" target="_blank" rel="noopener">${esc(FUENTE[pr.fuente_tipo] || "ver fuente")} ↗</a> · ${esc(pr.verificado.split("-").reverse().join("/"))}${pr.fuente_tipo !== "oficial" ? '<div class="sub">Confirmá en la página del banco o del comercio antes de pagar.</div>' : ""}` : '<span class="tag gr sm">ejemplo, sin fuente</span>'}</dd></dl>
    ${pr.pct ? `<div class="tcalc" data-pct="${pr.pct}" data-tope="${pr.tope || ""}">
      ${pr.tope ? `<div>Rinde al máximo con compras de hasta <b>${money(pr.tope / pr.pct * 100)}</b>: ahí te descuentan los ${money(pr.tope)} del tope.</div>` : `<div>Sin tope: te descuentan el ${pr.pct}% de lo que gastes.</div>`}
      <label>¿Cuánto vas a gastar? <input type="text" inputmode="numeric" placeholder="Ej.: 50000" aria-label="Cuánto vas a gastar"></label><div class="tres" aria-live="polite"></div></div>` : ""}
    <button class="btn sec sm agb" data-agendar="${pr.id}">📅 Agendar recordatorio</button>
  </div>`;
}
const mesTxt = d => { if (!d) return "este mes"; const [y, m] = d.split("-"); return ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"][+m - 1] + " " + y; };
function vPagos() {
  setTab("pagos");
  const day = S.pday;
  const okF = pr => (!S.pstore || pr.stores.includes(S.pstore)) && (!S.pmine || mineOk(pr)) && (!S.ptipo || medio(pr).tipo === S.ptipo) && promoCerca(pr);
  const list = P.promos.filter(pr => pr.dias.includes(day) && okF(pr)).sort((a, b) => b.pct - a.pct || (b.cuotas || 0) - (a.cuotas || 0));
  const cellPct = (sid, d) => Math.max(0, ...P.promos.filter(pr => pr.stores.includes(sid) && pr.dias.includes(d) && (S.pmine ? mineOk(pr) : (!needs(pr).length || mineOk(pr))) && (!S.ptipo || medio(pr).tipo === S.ptipo)).map(pr => pr.pct));
  const ej = P.promos.some(p => p.ejemplo);
  $("#view").innerHTML = `<div class="wrap"><section class="blk">
    <div class="toolbar"><div><h1>💳 Descuentos por día y medio de pago</h1><span class="sub">Bancos, billeteras virtuales, tarjetas y clubes de cada comercio, con cómo hay que pagar para que el descuento aplique.</span></div>
      <button class="btn sec sm" data-medios>💳 ${MEDIOS ? `Mis medios (${MEDIOS.length})` : "Elegir mis medios"}</button></div>
    ${ej ? `<div class="note" style="margin-bottom:14px">Estos descuentos son <b>de ejemplo</b>. En la versión real cada uno lleva el enlace a la página oficial y la fecha en que lo verificamos.</div>`
      : `<div class="note ok" style="margin-bottom:14px">✅ Descuentos reales de ${esc(mesTxt(P.relevado))}, relevados el ${esc((P.relevado || "").split("-").reverse().join("/"))} de páginas oficiales, relevamientos y notas periodísticas (cada uno dice su fuente). Cambian seguido: confirmalos antes de pagar.</div>`}
    ${anuncio("descuentos")}
    <details class="box legend-pay"><summary><b>¿QR, tarjeta física, MODO o celular? Cómo no confundirse</b> <span class="sub">— tocá para ver</span></summary>
      <p class="sub">Muchas promos aplican solo con una forma de pago. Pagar con la misma tarjeta pero de otra manera (por ejemplo, con QR en vez del plástico) puede dejarte sin el descuento.</p>
      <div class="hpgrid">${Object.values(P.formas_pago).map(f => `<div class="hp"><span class="i">${f.i}</span><div><b>${esc(f.t)}</b><div class="sub">${esc(f.d)}</div></div></div>`).join("")}</div></details>
    <div class="week">${DIAS.map((d, i) => `<button class="day${i === day ? " on" : ""}" data-day="${i}">${DCORTO[i]}${i === HOY ? '<span class="hoy">HOY</span>' : ""}<small>${P.promos.filter(pr => pr.dias.includes(i) && okF(pr)).length} benef.</small></button>`).join("")}</div>
    <div class="fbar">
      <div class="chips"><button class="chip${S.ptipo ? "" : " on"}" data-pt="">Todos</button>${Object.entries(P.tipos).map(([k, v]) => `<button class="chip${S.ptipo === k ? " on" : ""}" data-pt="${k}">${esc(v)}</button>`).join("")}</div>
      ${storeSelect("pstore", S.pstore)}
      <label class="chip" style="display:flex;gap:6px;align-items:center;cursor:pointer"><input type="checkbox" id="pmine" ${S.pmine ? "checked" : ""} ${MEDIOS ? "" : "disabled"}> Solo mis medios</label>
    </div>
    <h2 style="font-size:18px;margin:18px 0 10px">${DIAS[day]}${day === HOY ? " (hoy)" : ""}: ${list.length} ${list.length === 1 ? "beneficio" : "beneficios"}</h2>
    <div class="plist">${list.map(promoCard).join("") || `<div class="empty">No hay beneficios para ese día con esos filtros.</div>`}</div>

    <h2 style="font-size:18px;margin:30px 0 10px">La semana de un vistazo <span class="sub" style="font-weight:500">· mayor descuento de cada día${S.ptipo ? " (" + esc(P.tipos[S.ptipo]) + ")" : ""}</span></h2>
    <div class="matrix"><table><thead><tr><th>Comercio</th>${DIAS.map((d, i) => `<th>${DCORTO[i]}${i === HOY ? " · hoy" : ""}</th>`).join("")}</tr></thead><tbody>
      ${grupos().map(([n, ss]) => `<tr class="grp"><th colspan="8">${n}</th></tr>` + ss.map(s => `<tr><td>${storeChip(s.id)}</td>${DIAS.map((_, i) => { const v = cellPct(s.id, i); return `<td class="${i === HOY ? "tdhoy" : ""}">${v ? `<button class="cell" data-cell="${s.id}|${i}" style="--a:${Math.min(0.3, 0.08 + v / 80).toFixed(2)}" data-hi="${v >= 20 ? 1 : 0}">${v}%</button>` : '<span class="sub">—</span>'}</td>`; }).join("")}</tr>`).join("")).join("")}
    </tbody></table></div>
  </section></div>`;
  $$("[data-day]").forEach(b => b.onclick = () => { S.pday = +b.dataset.day; vPagos(); });
  $$("[data-pt]").forEach(b => b.onclick = () => { S.ptipo = b.dataset.pt; vPagos(); });
  $("#pstore").onchange = e => { S.pstore = e.target.value; vPagos(); };
  $$("[data-cell]").forEach(b => b.onclick = () => { const [s, d] = b.dataset.cell.split("|"); S.pstore = s; S.pday = +d; vPagos(); scrollTo({ top: 0, behavior: "smooth" }); });
  const pm = $("#pmine"); if (pm) pm.onchange = () => { S.pmine = pm.checked; vPagos(); };
}

/* ---------- MI CARRITO (lista propia) y ¿DÓNDE CONVIENE MI COMPRA? (comparador aparte) ---------- */
let PLAN = LS.get("cs_plan", {});            // productos del comparador "¿Dónde conviene?" {id: cantidad}
const savePlan = () => LS.set("cs_plan", PLAN);
const itemsOf = obj => Object.entries(obj).filter(([id]) => BY[id]).map(([id, qty]) => ({ p: BY[id], qty }));
const listItems = () => itemsOf(LISTA);
const shortName = p => p.name.split(" ").slice(0, 5).join(" ");
const optName = b => chanName(b.sid, b.c) + (b.c === "online" && !isApp(b.sid) ? " (online)" : "");
function qtyRow(p, qty, kind) {
  const b = best(p), sid = kind === "c" && PREF[p.id], o = sid && offerAt(p, sid);
  const at = o ? allChans(o).map(c => ({ c, v: price1(o, c) })).sort((x, y) => x.v - y.v)[0] : null;
  const hint = qtyHint(p, qty, sid || null);
  return `<div class="litem" style="view-transition-name:q${kind}${p.id}">${prodImg(p, "e")}
    <div><div class="n" data-open="${p.id}">${esc(p.name)}</div>
      <div class="sub">${at ? `Elegido en <b>${esc(chanName(sid, at.c))}</b>: ${money(at.v)} c/u <button class="linkbtn" data-unpref="${p.id}">quitar elección</button>` : `Desde ${money(b.v)} en ${esc(chanName(b.o.s, b.c))} · en ${p.offers.length} comercios`}</div>
      ${hint ? `<div class="qhint">🏷️ ${esc(hint)}</div>` : ""}</div>
    <div class="qty"><button data-q="${kind}|${p.id}" data-d="-1" aria-label="Uno menos">−</button><span>${qty}</span><button data-q="${kind}|${p.id}" data-d="1" aria-label="Uno más">+</button></div>
    <button class="rm" data-rm="${kind}|${p.id}" aria-label="Sacar">✕</button></div>`;
}
function bindQty(rerender) {
  $$("[data-q]").forEach(b => b.onclick = () => {
    const [k, id] = b.dataset.q.split("|"), o = k === "c" ? LISTA : PLAN;
    o[id] = Math.max(1, Math.min(999, o[id] + +b.dataset.d)); k === "c" ? saveLista() : savePlan(); suave(rerender);
    const h = qtyHint(BY[id], o[id], k === "c" ? PREF[id] : null); if (h) toast(h, 4500);
  });
  $$("[data-rm]").forEach(b => b.onclick = () => { const [k, id] = b.dataset.rm.split("|"); delete (k === "c" ? LISTA : PLAN)[id]; if (k === "c") { delete PREF[id]; savePref(); } k === "c" ? saveLista() : savePlan(); suave(rerender); });
  $$("[data-unpref]").forEach(b => b.onclick = () => { delete PREF[b.dataset.unpref]; savePref(); rerender(); });
}

function vCarrito() {
  setTab("");
  const items = listItems();
  if (!items.length) {
    $("#view").innerHTML = `<div class="wrap"><section class="blk"><h1>🛒 Mi carrito</h1>
      <div class="empty" style="padding:50px"><div style="font-size:48px">🛒</div><h3 class="ink">Tu carrito está vacío</h3>
      <p>Sumá productos con el botón <b>+</b>. Es tu lista: la podés mandar por WhatsApp o correo, y cuando quieras calcular dónde conviene comprarla.</p>
      <a class="btn" href="#buscar">Buscar productos</a></div></section>${Object.keys(LISTAS).length ? listasBox() : ""}</div>`;
    bindListas(); return;
  }
  const n = items.reduce((a, i) => a + i.qty, 0), approx = items.reduce((a, { p, qty }) => { const o = PREF[p.id] && offerAt(p, PREF[p.id]); return a + (o ? Math.min(...allChans(o).map(c => lineCost(o, c, qty).total)) : best(p).v * qty); }, 0);
  const link = shareLink(items), txt = shareText(items);
  $("#view").innerHTML = `<div class="wrap lgrid">
    <section class="box"><div class="blk-h"><h2>🛒 Mi carrito <span class="sub" style="font-weight:500">· ${items.length} productos, ${n} unidades</span></h2><button class="btn sec sm" id="lclear">Vaciar</button></div>
      ${items.map(({ p, qty }) => qtyRow(p, qty, "c")).join("")}
      <a class="btn superbtn" href="#super">🛍️ Modo en el súper: ir tachando lo que compraste</a>
      <p class="sub" style="margin-top:12px">Comprando cada producto donde lo elegiste (o donde está más barato), sin descuentos de pago, sería alrededor de <b>${money(approx)}</b>.</p></section>
    <aside class="res">
      <div class="win"><div class="k">¿Dónde lo compro?</div><div style="font-size:18px;font-weight:800;margin:4px 0 10px">Calculá en qué comercio, qué día y con qué medio de pago te sale menos</div>
        <button class="btn light" id="tocalc">📊 Calcular dónde conviene este carrito</button></div>
      <section class="box share"><h3>📤 Compartir el carrito</h3>
        <p class="sub" style="margin:-4px 0 12px">Con los productos y las cantidades. Quien lo reciba lo abre acá con un toque.</p>
        <div class="sharebtns">
          <a class="btn wa" href="https://wa.me/?text=${encodeURIComponent(txt + "\n\nAbrir el carrito: " + link)}" target="_blank" rel="noopener">WhatsApp</a>
          <a class="btn sec" href="mailto:?subject=${encodeURIComponent("Mi carrito del súper")}&body=${encodeURIComponent(txt + "\n\nAbrir el carrito: " + link)}">✉️ Correo electrónico</a>
          <button class="btn sec" id="shcopy">📋 Copiar texto</button>
          <button class="btn sec" id="shlink">🔗 Copiar enlace</button>
          <button class="btn sec" id="shqr">📱 Código QR</button></div>
        <details class="sub" style="margin-top:10px"><summary>Ver el mensaje</summary><pre class="msg">${esc(txt + "\n\nAbrir el carrito: " + link)}</pre></details></section>
      ${listasBox()}
    </aside></div>`;
  bindQty(vCarrito); bindListas();
  $("#lclear").onclick = () => { for (const k of Object.keys(LISTA)) delete LISTA[k]; saveLista(); vCarrito(); };
  $("#tocalc").onclick = () => { PLAN = { ...LISTA }; savePlan(); location.hash = "conviene"; };
  $("#shcopy").onclick = () => copy(txt + "\n\nAbrir el carrito: " + link, "Texto copiado: pegalo donde quieras");
  $("#shlink").onclick = () => copy(link, "Enlace copiado");
  $("#shqr").onclick = () => modalQR(link);
}
/* código QR del carrito (qrcode-generator, licencia MIT): para pasarlo de la compu al celular con la cámara */
let QR_P = null;
const loadQR = () => QR_P || (QR_P = new Promise((ok, ko) => { const s = document.createElement("script"); s.src = "js/vendor/qrcode.js"; s.onload = () => ok(window.qrcode); s.onerror = () => { QR_P = null; ko(); }; document.head.appendChild(s); }));
async function modalQR(link) {
  let svg = "";
  try { const qr = (await loadQR())(0, "L"); qr.addData(link); qr.make(); svg = qr.createSvgTag({ cellSize: 6, margin: 2, scalable: true }); }
  catch { openModal(`<h2>📱 Código QR</h2><p>Tu carrito tiene demasiados productos para un código QR. Usá «Copiar enlace» o WhatsApp.</p>`); return; }
  openModal(`<h2>📱 Abrí tu carrito en otro celular</h2><p class="sub">Apuntá la cámara del otro teléfono a este código y tocá el enlace que aparece.</p><div class="qrbox">${svg}</div><div class="mfoot"><span></span><button class="btn sec" data-close>Cerrar</button></div>`);
}
function shareText(items, bst, day) {
  let t = `🛒 Mi carrito del súper (${items.length} productos)\n${items.map(({ p, qty }) => `• ${qty} × ${p.name}${PREF[p.id] && ST[PREF[p.id]] ? ` (en ${ST[PREF[p.id]].name})` : ""}`).join("\n")}`;
  if (bst) {
    t += `\n\n💡 Lo más barato el ${DIAS[day].toLowerCase()}: todo en ${optName(bst)}, ${money(bst.total).replace(" ", " ")}`;
    if (bst.pay.promo) t += `\n💳 Pagando con ${medioName(bst.pay.promo)} (${bst.pay.promo.pct}%) — cómo pagar: ${pagoTxt(bst.pay.promo)}`;
  }
  return t + `\n\nPrecios de ComparáSúper del ${D.updated.split("-").reverse().join("/")}; pueden cambiar.`;
}
function siteBase() { if (CFG.sitio_url) return CFG.sitio_url.replace(/#.*$/, ""); return location.href.replace(/#.*$/, ""); }
const shareLink = items => siteBase() + "#l-" + items.map(({ p, qty }) => `${p.id}-${qty}`).join("-");
async function copy(text, okMsg) {
  try { await navigator.clipboard.writeText(text); toast(okMsg); }
  catch { openModal(`<h2>Copiá el texto</h2><p class="sub">Tu navegador no deja copiar automáticamente. Seleccioná el texto y copialo.</p><textarea class="ta" readonly>${esc(text)}</textarea><div class="mfoot"><span></span><button class="btn sec sm" data-close>Cerrar</button></div>`); $("#modal textarea").select(); }
}
/* abrir un carrito compartido (#l-ID-cant-ID-cant…) */
function importList(code) {
  const parts = code.split("-"), got = {};
  for (let i = 0; i + 1 < parts.length; i += 2) { const id = parts[i], q = parseInt(parts[i + 1], 10); if (BY[id] && q > 0) got[id] = Math.min(99, q); }
  const n = Object.keys(got).length;
  setHash("#carrito");
  if (!n) { toast("El enlace del carrito no es válido"); route(); return; }
  const has = Object.keys(LISTA).length;
  const apply = mode => { if (mode === "rep") LISTA = {}; for (const [id, q] of Object.entries(got)) LISTA[id] = mode === "rep" ? q : Math.max(LISTA[id] || 0, q); saveLista(); closeModal(); route(); toast("Carrito cargado 🛒"); };
  if (!has) { apply("rep"); return; }
  route();
  openModal(`<h2>🛒 Te compartieron un carrito</h2><p class="sub">Tiene ${n} productos. Vos ya tenés ${has} en el tuyo.</p>
    <div class="alts" style="margin:12px 0">${Object.entries(got).map(([id, q]) => `<div class="alt" style="cursor:default"><span>${esc(BY[id].name)}</span><b>× ${q}</b></div>`).join("")}</div>
    <div class="mfoot"><button class="btn sec sm" data-close>Cancelar</button><span style="display:flex;gap:8px"><button class="btn sec sm" id="imadd">Sumar al mío</button><button class="btn sm" id="imrep">Reemplazar el mío</button></span></div>`);
  $("#imadd").onclick = () => apply("add"); $("#imrep").onclick = () => apply("rep");
}
/* carrito online automático: las tiendas VTEX aceptan un enlace que agrega varios productos al carrito */
function cartUrl(b) {
  const host = ST[b.sid].online && ST[b.sid].online.vtex;
  if (!host || b.miss.length || !b.lines.every(l => l.o.sku)) return null;
  return `https://${host}/checkout/cart/add?` + b.lines.map(l => `sku=${encodeURIComponent(l.o.sku)}&qty=${l.qty}&seller=${encodeURIComponent(l.o.seller || "1")}`).join("&") + "&sc=1";
}
const cartBtn = (b, sm) => { const u = cartUrl(b); return u ? `<a class="btn ${sm ? "sm " : ""}cartbtn" data-salida="carrito|${esc(b.sid)}" href="${esc(u)}" target="_blank" rel="noopener" title="Abre la tienda con estos productos ya cargados en el carrito">🛒 Armar el carrito en ${esc(ST[b.sid].name)}</a>` : ""; };

/* panel de al lado cuando la página está vacía: productos vistos hace poco para sumar de un toque */
function ayudaVacia(modo) {
  const vis = VISTOS.filter(id => BY[id]).slice(0, 6);
  const extra = modo === "plan" ? `<p class="sub" style="margin:0 0 10px">¿No sabés por dónde empezar? <a href="#" data-canasta>Probá con la canasta básica</a>: 20 productos de todos los días.</p>` : "";
  return `<aside class="box ayudav"><h3 style="margin:0 0 8px">💡 Para empezar</h3>${extra}
    ${vis.length ? `<div class="sub" style="margin-bottom:6px">Vistos hace poco:</div>${vis.map(id => { const p = BY[id]; return `<div class="alt">${prodImg(p, "li")}<span class="an" data-open="${id}" role="button" tabindex="0" style="cursor:pointer;flex:1">${esc(p.name)}<br><span class="sub">${money(best(p).v)}</span></span>
      <button class="btn sec sm" type="button" ${modo === "plan" ? `data-plan="${id}" data-replan` : `data-cmp="${id}"`}>${modo === "plan" ? "+ Sumar" : "⚖️ Sumar"}</button></div>`; }).join("")}`
      : `<p class="sub" style="margin:0">Los productos que abras van a aparecer acá para sumarlos de un toque.</p>`}</aside>`;
}
function vConviene() {
  setTab("conviene");
  const items = itemsOf(PLAN);
  const day = S.lday;
  const head = `<div class="toolbar"><div><h1>📊 ¿Dónde conviene mi compra?</h1><span class="sub">Armá la compra acá (no cambia tu carrito) y comparamos todo en un comercio, mezclando dos, por día y por medio de pago.</span></div></div>`;
  const editor = `<section class="box"><div class="blk-h"><h2>Productos a comparar <span class="sub" style="font-weight:500">· ${items.length}</span></h2>
      <div style="display:flex;gap:6px;flex-wrap:wrap">${Object.keys(LISTA).length ? `<button class="btn sec sm" id="fromcart">⬇️ Traer mi carrito</button>` : ""}<button class="btn sec sm" type="button" data-pegar>📋 Pegar una lista</button>${items.length ? `<button class="btn sec sm" id="tocart">🛒 Enviar al carrito</button><button class="btn sec sm" id="pclear">Vaciar</button>` : ""}</div></div>
    <div class="psearch"><input id="pq" type="search" placeholder="Sumá un producto: leche, yerba, aceite…" autocomplete="off" aria-label="Buscar producto para sumar"><div class="pres" id="pres" hidden></div></div>
    ${items.map(({ p, qty }) => qtyRow(p, qty, "p")).join("") || `<p class="sub" style="margin:14px 0 4px">Buscá productos arriba, traé tu carrito o <a href="#" data-canasta>probá con la canasta básica</a>.</p>`}
  </section>`;
  if (!items.length) { $("#view").innerHTML = `<div class="wrap">${head}<div class="cv">${editor}${ayudaVacia("plan")}</div></div>`; bindPlanner(); return; }

  const rk = rankAll(items, day), full = rk.filter(b => !b.miss.length), bst = full[0], worst = full[full.length - 1];
  const split = bestSplit(items, day);
  const byDay = DIAS.map((_, d) => { const r = rankAll(items, d).filter(b => !b.miss.length)[0]; return r ? { d, b: r } : null; }).filter(Boolean).sort((a, b) => (a.b.total - b.b.total) || ((a.d === day ? 0 : 1) - (b.d === day ? 0 : 1)));
  let bd = byDay[0];
  if (bd && bst && bd.d !== day && bst.total - bd.b.total < 1) bd = { d: day, b: bst };   // ningún otro día es más barato: se queda con hoy
  const multi = bestMulti(items, day, bst, split);
  const pagoDe = parts => { const ps = parts.filter(b => b.pay.promo && b.pay.disc > 0); return ps.length ? `Incluye ${ps.map(b => `${money(b.pay.disc)} de descuento con ${esc(medioName(b.pay.promo))} en ${esc(ST[b.sid].name)}`).join(" y ")}.` : "Sin descuentos de medio de pago este día."; };
  const splitGain = split && bst ? bst.total - split.total : 0;
  const pct = (a, b2) => b2 ? Math.round(a / b2 * 100) : 0;

  const card1 = bst ? `<div class="sumc win"><div class="k">① Todo en un solo comercio</div><div class="t">${esc(optName(bst))}</div><div class="big">${money(bst.total)}</div>
      ${bst.pay.promo ? `<div class="sv">💳 Pagando con <b>${esc(medioName(bst.pay.promo))}</b> (−${money(bst.pay.disc)})<br>${pagoIcon(bst.pay.promo)} ${esc(pagoTxt(bst.pay.promo))}</div>` : `<div class="sv">Sin descuentos de medio de pago este día</div>`}
      ${bst.c === "online" ? `<div class="sv">🚚 ${bst.env ? `Incluye envío ${money(bst.env)}` : "Envío gratis con esta compra"}</div>` : ""}
      ${cartBtn(bst) ? `<div style="margin-top:10px">${cartBtn(bst)}</div>` : ""}</div>`
    : `<div class="sumc box"><div class="k">① Todo en un solo comercio</div><p>Ningún comercio tiene todos los productos. Mirá abajo cuáles faltan en cada uno, o probá mezclando dos.</p></div>`;
  const card2 = split ? `<div class="sumc box ${splitGain > 0 ? "good" : ""}"><div class="k">② Mezclando dos comercios</div><div class="t">${split.parts.map(b => esc(optName(b))).join(" + ")}</div><div class="big">${money(split.total)}</div>
      <div class="sub">${bst ? (splitGain > 0 ? `<b class="okc">Ahorrás ${money(splitGain)} (${pct(splitGain, bst.total)}%)</b> frente a todo en ${esc(optName(bst))}, pero tenés que ir a dos lugares. ${pagoDe(split.parts)}` : `No conviene: sale ${money(-splitGain)} más que todo en ${esc(optName(bst))}.`) : "Es la única forma de conseguir todo."}</div></div>`
    : `<div class="sumc box"><div class="k">② Mezclando dos comercios</div><p class="sub">No hay una combinación de dos comercios que tenga todo.</p></div>`;
  const mismos = multi && split && multi.total >= split.total - 1, nm = multi ? new Set(multi.parts.map(b => b.sid)).size : 0;
  const card3 = multi ? `<div class="sumc box"><div class="k">③ Cada producto en su lugar más barato</div><div class="t">${nm === 1 ? esc(optName(multi.parts[0])) : `${nm} comercios`}</div><div class="big">${money(multi.total)}</div>
      <div class="sub">${mismos || nm <= 2 ? `Ir a más comercios no baja el total: lo más barato ya se consigue ${nm === 1 ? "en un solo lugar" : "con la opción ②"}.`
        : `${split ? `<b class="okc">${money(split.total - multi.total)} menos</b> que mezclando dos, pero` : "Pero"} hay que ir a ${[...new Set(multi.parts.map(b => ST[b.sid].name))].map(esc).join(", ")}. ${pagoDe(multi.parts)}`}</div></div>` : "";
  const card4 = bd ? `<div class="sumc box ${bst && bd.d !== day && bst.total - bd.b.total > 100 ? "good" : ""}"><div class="k">④ El mejor día de la semana</div><div class="t">${DIAS[bd.d]} en ${esc(optName(bd.b))}</div><div class="big">${money(bd.b.total)}</div>
      <div class="sub">${bd.b.pay.promo ? `con ${esc(medioName(bd.b.pay.promo))} (${esc(pagoTxt(bd.b.pay.promo))})` : "sin descuento de pago"}${bst && bd.d !== day ? ` · ${money(bst.total - bd.b.total)} menos que el ${DIAS[day].toLowerCase()}` : bd.d === day ? " · ningún otro día de la semana sale menos" : ""}</div>
      ${bd.d !== day ? `<button class="btn sec sm" data-ld="${bd.d}" style="margin-top:8px">Ver el ${DIAS[bd.d].toLowerCase()}</button>` : ""}</div>` : "";

  const splitTable = split ? `<section class="box"><h3>Detalle: cómo repartir la compra entre ${split.parts.map(b => esc(optName(b))).join(" y ")}</h3>
      <div class="tscroll"><table class="cmp split"><thead><tr><th>Producto</th><th>Dónde</th><th class="r">Precio</th><th class="r">En ${esc(optName(bst || split.parts[0]))}</th></tr></thead><tbody>
      ${split.parts.flatMap(b => b.lines.map(l => {
        const alt = bst && bst.lines.find(x => x.p.id === l.p.id);
        return `<tr><td>${esc(l.p.name)}${l.qty > 1 ? ` <b>×${l.qty}</b>` : ""}${l.lc.promo ? `<div class="sub">🏷️ ${esc(l.lc.promo.txt)}</div>` : ""}</td><td>${storeChip(b.sid, b.c)}</td><td class="r"><b>${money(l.lc.total)}</b></td><td class="r sub" data-l="${alt ? "Todo en " + esc(optName(bst)) + ":" : ""}">${alt ? money(alt.lc.total) : ""}</td></tr>`;
      })).join("")}</tbody>
      <tfoot>${split.parts.map(b => `<tr><td colspan="2">Subtotal en ${esc(optName(b))}${b.pay.promo ? ` <span class="sub">· 💳 ${esc(medioName(b.pay.promo))} −${money(b.pay.disc)} (${esc(pagoTxt(b.pay.promo))})</span>` : ""}${b.env ? ` <span class="sub">· envío ${money(b.env)}</span>` : ""}</td><td class="r"><b>${money(b.total)}</b></td><td class="r">${cartBtn(b, true)}</td></tr>`).join("")}</tfoot></table></div></section>` : "";

  const shown = rk.slice(0, 15);
  const optTable = `<section class="box"><h3>Todas las opciones comprando todo en un solo lugar · ${DIAS[day]}</h3>
    <div class="tscroll"><table class="cmp opt"><thead><tr><th>#</th><th>Comercio</th><th class="r">Sin descuentos</th><th class="r">Ofertas</th><th>Medio de pago del día</th><th class="r">Envío</th><th class="r">Total</th><th class="r">Diferencia</th><th></th></tr></thead><tbody>
    ${shown.map((b, i) => `<tr class="${b === bst ? "top" : ""}${b.miss.length ? " inc" : ""}"><td>${b.miss.length ? "–" : i + 1}</td><td>${storeChip(b.sid, b.c)}${b.miss.length ? `<div class="miss">Le falta${b.miss.length > 1 ? "n" : ""}: ${b.miss.map(p => esc(shortName(p))).join(", ")}</div>` : ""}</td>
      <td class="r" data-l="Sin descuentos">${money(b.reg)}</td><td class="r okc${b.promoSave > 0 ? "" : " nil"}" data-l="Ofertas">${b.promoSave > 0 ? "−" + money(b.promoSave) : "—"}</td>
      <td class="${b.pay.promo ? "" : "nil"}" data-l="Medio de pago">${b.pay.promo ? `<span class="okc">−${money(b.pay.disc)}</span> ${esc(medioName(b.pay.promo))} ${b.pay.promo.pct}%<div class="sub">${esc(pagoTxt(b.pay.promo))}</div>` : '<span class="sub">—</span>'}</td>
      <td class="r${b.c === "online" ? "" : " nil"}" data-l="Envío">${b.c === "online" ? (b.env ? money(b.env) : "gratis") : "—"}</td>
      <td class="r"><b>${money(b.total)}</b>${b.miss.length ? '<div class="sub">sin lo que falta</div>' : ""}</td>
      <td class="r" data-l="Diferencia">${b.miss.length || !bst ? "" : b === bst ? '<span class="tag g sm">la mejor</span>' : `+${money(b.total - bst.total)}`}</td>
      <td>${cartBtn(b, true)}</td></tr>`).join("")}</tbody></table></div>
    ${rk.length > shown.length ? `<p class="sub">Y ${rk.length - shown.length} opciones más caras.</p>` : ""}
    <p class="sub">El botón «Armar el carrito» abre la tienda online con los productos ya cargados; ahí elegís envío o retiro y pagás. Solo aparece en las tiendas online que lo permiten (Carrefour, ChangoMás, Día, Disco, Jumbo y Vea) y cuando tienen todos los productos.</p></section>`;

  $("#view").innerHTML = `<div class="wrap">${head}
    <div class="cv">${editor}
      <section class="box"><h3>¿Cuándo y cómo comprás?</h3>
        <div class="daysel">${DIAS.map((d, i) => `<button class="${i === day ? "on" : ""}" data-ld="${i}">${DCORTO[i]}${i === HOY ? " (hoy)" : ""}</button>`).join("")}</div>
        <div style="margin-top:10px">${canalChips()}</div>
        <p class="sub" style="margin:10px 0 0">Descuentos de pago: ${MEDIOS ? `solo con <b>tus ${MEDIOS.length} medios</b>` : "<b>todos</b> (no elegiste tus medios)"} · <a href="#" data-medios>cambiar</a></p></section></div>
    <div class="sumgrid">${card1}${card2}${card3}${card4}</div>
    ${splitTable}${optTable}</div>`;
  bindPlanner();
  $$("[data-ld]").forEach(b => b.onclick = e => { e.preventDefault(); S.lday = +b.dataset.ld; vConviene(); });
}
function bindPlanner() {
  bindQty(vConviene);
  const fc = $("#fromcart"); if (fc) fc.onclick = () => { for (const [id, q] of Object.entries(LISTA)) PLAN[id] = Math.max(PLAN[id] || 0, q); savePlan(); toast("Carrito traído"); vConviene(); };
  const tc = $("#tocart"); if (tc) tc.onclick = () => { for (const [id, q] of Object.entries(PLAN)) LISTA[id] = Math.max(LISTA[id] || 0, q); saveLista(); toast("Productos enviados a tu carrito 🛒"); };
  const pc = $("#pclear"); if (pc) pc.onclick = () => { PLAN = {}; savePlan(); vConviene(); };
  const q = $("#pq"), res = $("#pres");
  q.oninput = () => {
    const ws = nrm(q.value).split(/\s+/).filter(Boolean);
    if (!ws.length) { res.hidden = true; return; }
    const hits = D.products.filter(p => ws.every(w => nrm(p.name + " " + p.brand).includes(w))).sort((a, b) => (matchScore(a, ws) - matchScore(b, ws)) || (b.offers.length - a.offers.length)).slice(0, 8);
    res.innerHTML = hits.map(p => `<button class="pr" data-padd="${p.id}">${prodImg(p, "e")}<span>${esc(p.name)}<br><span class="sub">desde ${money(best(p).v)} · en ${p.offers.length} comercios</span></span>${PLAN[p.id] ? "✓" : "+"}</button>`).join("") || `<div class="sub" style="padding:10px">Sin resultados</div>`;
    res.hidden = false;
    $$("[data-padd]", res).forEach(b => b.onclick = () => { PLAN[b.dataset.padd] = (PLAN[b.dataset.padd] || 0) + 1; savePlan(); vConviene(); setTimeout(() => $("#pq") && $("#pq").focus(), 0); });
  };
}

/* ---------- DEJANOS TU SUGERENCIA ---------- */
/* Las sugerencias llegan a un formulario de Google; las aprobadas se publican en una hoja de cálculo pública
   que la web lee. Los votos llegan a otro formulario. Ver README → "Sugerencias". */
let VOTOS = LS.get("cs_votos", {});
const SUG_EJEMPLO = [
  { id: "e1", fecha: "2026-11-05", nombre: "Marta", texto: "Que se pueda filtrar por sucursal cercana a mi casa.", pos: 12, neg: 1 },
  { id: "e2", fecha: "2026-11-06", nombre: "", texto: "Agregar precios de verdulerías y carnicerías del barrio.", pos: 7, neg: 3 },
  { id: "e3", fecha: "2026-11-07", nombre: "Juan", texto: "Avisos por WhatsApp cuando baja un producto de mi carrito.", pos: 9, neg: 0 },
];
function parseCSV(t) {
  const rows = []; let row = [], f = "", q = false;
  for (let i = 0; i < t.length; i++) {
    const c = t[i];
    if (q) { if (c === '"' && t[i + 1] === '"') { f += '"'; i++; } else if (c === '"') q = false; else f += c; }
    else if (c === '"') q = true; else if (c === ",") { row.push(f); f = ""; } else if (c === "\n" || c === "\r") { if (c === "\r" && t[i + 1] === "\n") i++; row.push(f); rows.push(row); row = []; f = ""; } else f += c;
  }
  if (f || row.length) { row.push(f); rows.push(row); }
  return rows;
}
/* backend gratis: una planilla de Google con un Apps Script publicado (ver apps-script/Codigo.gs) */
const API = () => (CFG.apps_script_url || "").trim();
async function apiPost(data) { await fetch(API(), { method: "POST", mode: "no-cors", headers: { "Content-Type": "text/plain;charset=utf-8" }, body: JSON.stringify(data) }); }
async function loadSug() {
  const cfg = CFG.sugerencias || {};
  if (API()) {
    try { const r = await fetch(API() + "?accion=sugerencias", { cache: "no-store" }).then(r => r.json()); return { demo: false, list: (r.sugerencias || []).map(x => ({ id: String(x.id), fecha: x.fecha || "", nombre: x.nombre || "", texto: x.texto || "", pos: +x.positivos || 0, neg: +x.negativos || 0 })) }; }
    catch { return { demo: false, error: true, list: [] }; }
  }
  if (!cfg.csv_publico) return { demo: true, list: SUG_EJEMPLO.map(s => ({ ...s })) };
  try {
    const rows = parseCSV(await fetch(cfg.csv_publico, { cache: "no-store" }).then(r => r.text()));
    const h = rows.shift().map(x => nrm(x.trim()));
    const col = n => h.indexOf(n);
    return { demo: false, list: rows.filter(r => r[col("id")]).map(r => ({ id: r[col("id")], fecha: r[col("fecha")] || "", nombre: r[col("nombre")] || "", texto: r[col("texto")] || "", pos: +r[col("positivos")] || 0, neg: +r[col("negativos")] || 0 })) };
  } catch { return { demo: false, error: true, list: [] }; }
}
async function vSugerencias() {
  setTab("sugerencias");
  const cfg = CFG.sugerencias || {};
  $("#view").innerHTML = `<div class="wrap"><section class="blk">
    <div class="toolbar"><div><h1>💬 Dejanos tu sugerencia</h1><span class="sub">¿Qué le falta a la página? Las sugerencias se publican después de revisarlas, y todos pueden votarlas.</span></div></div>
    <div class="sggrid">
      <form class="box nform" id="sform" novalidate><h3>Nueva sugerencia</h3>
        <label class="fl">Tu idea<textarea id="stxt" maxlength="500" rows="5" placeholder="Por ejemplo: que se pueda ordenar por precio por kilo en el carrito"></textarea></label>
        <label class="fl">Tu nombre (opcional, se publica)<input type="text" id="snom" maxlength="40" autocomplete="given-name"></label>
        <div class="sub">Antes de publicarla la revisamos. No publiques datos personales.</div>
        <div class="ferr" id="serr" role="alert"></div>
        <button class="btn" type="submit">Enviar sugerencia</button></form>
      <div><div class="blk-h"><h3 style="margin:0">Sugerencias publicadas</h3><select class="sel" id="ssort" aria-label="Ordenar"><option value="votos">Más votadas</option><option value="nuevas">Más nuevas</option></select></div>
        <div id="slist"><div class="sub">Cargando…</div></div></div>
    </div></section></div>`;
  const data = await loadSug();
  if (!$("#ssort")) return;   // te fuiste de la página mientras cargaba
  const draw = () => {
    const list = [...data.list].sort($("#ssort").value === "nuevas" ? (a, b) => b.fecha.localeCompare(a.fecha) : (a, b) => (b.pos - b.neg) - (a.pos - a.neg));
    $("#slist").innerHTML = (data.demo ? `<div class="note" style="margin-bottom:10px">Ejemplos de cómo se van a ver. Las sugerencias reales aparecen cuando conectes la planilla (ver README).</div>` : "")
      + (data.error ? `<div class="warn">No se pudieron cargar las sugerencias. Probá más tarde.</div>` : "")
      + (list.map(s => `<div class="sug"><p>${esc(s.texto)}</p><div class="sub">${s.nombre ? esc(s.nombre) + " · " : ""}${esc(s.fecha.split("-").reverse().join("/"))}</div>
          <div class="votes"><button class="vote${VOTOS[s.id] === 1 ? " on" : ""}" data-vote="${esc(s.id)}|1" aria-label="Apoyar">👍 <b>${s.pos + (VOTOS[s.id] === 1 ? 1 : 0)}</b></button>
          <button class="vote neg${VOTOS[s.id] === -1 ? " on" : ""}" data-vote="${esc(s.id)}|-1" aria-label="No hace falta">👎 <b>${s.neg + (VOTOS[s.id] === -1 ? 1 : 0)}</b></button></div></div>`).join("") || (data.error ? "" : `<div class="empty">Todavía no hay sugerencias publicadas. ¡Dejá la primera!</div>`));
    $$("[data-vote]").forEach(b => b.onclick = async () => {
      const [id, v] = b.dataset.vote.split("|");
      if (VOTOS[id]) { toast("Ya votaste esta sugerencia"); return; }
      VOTOS[id] = +v; LS.set("cs_votos", VOTOS); draw();
      if (API() && !data.demo) {
        try { await apiPost({ tipo: "voto", id, voto: v === "1" ? "positivo" : "negativo" }); toast("¡Gracias por votar!"); } catch { toast("No se pudo registrar el voto"); }
      } else if (cfg.votos_form_action && !data.demo) {
        const fd = new FormData(); fd.append(cfg.campo_voto_id, id); fd.append(cfg.campo_voto, v === "1" ? "positivo" : "negativo");
        try { await fetch(cfg.votos_form_action, { method: "POST", mode: "no-cors", body: fd }); toast("¡Gracias por votar!"); } catch { toast("No se pudo registrar el voto"); }
      } else toast(data.demo ? "Voto de prueba (no se guarda)" : "¡Gracias por votar!");
    });
  };
  $("#ssort").onchange = draw; draw();
  $("#sform").onsubmit = async e => {
    e.preventDefault();
    const txt = $("#stxt").value.trim(), err = $("#serr");
    if (txt.length < 10) { err.textContent = "Contanos un poco más (al menos 10 letras)."; return; }
    if (API()) {
      try { await apiPost({ tipo: "sugerencia", texto: txt.slice(0, 1000), nombre: $("#snom").value.trim().slice(0, 60) }); $("#sform").innerHTML = `<h3>✅ ¡Gracias!</h3><p>Recibimos tu sugerencia. Cuando la revisemos va a aparecer en la lista para que otros la voten.</p>`; }
      catch { err.textContent = "No se pudo enviar. Revisá tu conexión y probá de nuevo."; }
      return;
    }
    if (!cfg.form_action) { err.innerHTML = "⚙️ El envío de sugerencias todavía no está conectado (prototipo): falta configurar el formulario en <code>config.json</code>. Tu sugerencia <b>no</b> se envió."; return; }
    const fd = new FormData(); fd.append(cfg.campo_texto, txt); if (cfg.campo_nombre) fd.append(cfg.campo_nombre, $("#snom").value.trim());
    try { await fetch(cfg.form_action, { method: "POST", mode: "no-cors", body: fd }); $("#sform").innerHTML = `<h3>✅ ¡Gracias!</h3><p>Recibimos tu sugerencia. Cuando la revisemos va a aparecer en la lista para que otros la voten.</p>`; }
    catch { err.textContent = "No se pudo enviar. Revisá tu conexión y probá de nuevo."; }
  };
}

/* ---------- FICHA DE PRODUCTO (panel lateral) ---------- */
/* productos parecidos (mismo tipo y tamaño parecido) que salen menos por kilo o por litro */
const TIPO_STOP = new Set("de del la el los las con sin en x y para tipo sabor pack".split(" "));
const tipoDe = p => { const ws = nrm(p.name).split(/[^a-z]+/).filter(w => w.length > 2 && !TIPO_STOP.has(w)); return ws.slice(0, 2); };
function alternativas(p) {
  if (!p.bq || !p.bu) return [];
  const t = tipoDe(p); if (!t.length) return [];
  const mine = perUnit(p, best(p).v); if (!mine) return [];
  const out = [];
  for (const q of D.products) {
    if (q === p || q.cat !== p.cat || q.bu !== p.bu || !q.bq) continue;
    const r = q.bq / p.bq; if (r < 0.6 || r > 1.7) continue;
    const tq = tipoDe(q); if (tq[0] !== t[0] || (t[1] && tq[1] && tq[1] !== t[1] && !nrm(q.name).includes(t[1]))) continue;
    const b = best(q), u = perUnit(q, b.v); if (!u || u > mine * 0.95) continue;
    out.push({ q, b, u, ah: Math.round((1 - u / mine) * 100) });
  }
  return out.sort((a, b) => (b.q.offers.length >= 3) - (a.q.offers.length >= 3) || a.u - b.u).slice(0, 3);
}
async function openProduct(id) {
  const p = BY[id]; if (!p) return;
  if (!SUC) loadSuc();   // para "Cómo llegar" a la sucursal más cercana
  guardarVisto(id);
  const dr = $("#drawer"), sc = $("#scrim");
  if (openProduct.id !== id) { openProduct.mas = false; openProduct.menu = false; }
  openProduct.id = id;
  const b = best(p);
  const rows = [...p.offers].sort((x, y) => Math.min(...allChans(x).map(c => price1(x, c))) - Math.min(...allChans(y).map(c => price1(y, c))));
  const watching = id in AVISOS;
  // el más barato pagando hoy con un descuento de medio de pago
  let bp = null;
  for (const o of p.offers) for (const c of chans(o)) { const pay = payDiscount(o.s, HOY, c, price1(o, c)); const v = price1(o, c) - pay.disc; if (pay.promo && (!bp || v < bp.v)) bp = { o, c, v, pay }; }
  const pq = promoQty(p), q = LISTA[id] || 0, hint = q ? qtyHint(p, q, PREF[id]) : "";
  const link = o => {
    const u0 = o.url || (o.lk && ST[o.s].online && ST[o.s].online.vtex ? `https://${ST[o.s].online.vtex}/${o.lk}/p` : null);
    if (u0) return `<a class="go" data-salida="producto|${o.s}" href="${esc(u0)}" target="_blank" rel="noopener">Ver en la tienda ↗</a>`;
    const u = goUrl(o.s, p);
    return u ? `<a class="go sec" data-salida="buscar|${o.s}" href="${esc(u)}" target="_blank" rel="noopener" title="Abre la búsqueda de la tienda; puede mostrar productos parecidos">Buscar en la tienda ↗</a>` : "";
  };
  const chanLine = (o, c) => {
    const v = base(o, c); if (!v) return "";
    const pr = promoOf(o, c), pay = payDiscount(o.s, HOY, c, price1(o, c));
    return `<div class="sline"><span class="k">${c === "online" ? "🛒 Online " + tip("online") : "🏬 En el local " + tip("local")}</span> <b>${money(v)}</b>
      ${pr ? `<span class="tag sm">🏷️ ${esc(pr.txt)}: ${money(pr.pu)} c/u${pr.n > 1 ? ` llevando ${pr.n}` : ""}</span>` : ""}
      ${pay.promo ? `<span class="tag g sm">💳 Hoy ${money(price1(o, c) - pay.disc)} con ${esc(medioName(pay.promo))}</span>` : ""}</div>`;
  };
  const storeRow = o => {
    const mine = PREF[id] === o.s && q;
    return `<div class="srow${mine ? " mine" : ""}"><div class="sh">${storeChip(o.s)}${FAV.has(o.s) ? '<span class="tag y sm">⭐ tu súper</span>' : ""}${CERCA && CERCA[o.s] ? `<span class="sub">📍 a ${kmTxt(CERCA[o.s].d)}</span>` : ""}${o.anom ? '<span class="tag r sm">⚠️ precio inusual</span>' : ""}</div>
      <div class="sp">${chanLine(o, "tienda")}${chanLine(o, "online")}</div>
      <div class="sa">${link(o)}${o.p ? `<a class="go sec" data-mapa="${o.s}" href="${esc(mapaUrl(o.s))}" target="_blank" rel="noopener" title="Ver en Google Maps la sucursal más cercana y cómo llegar">${ic("navigation")} Cómo llegar</a>` : ""}<button class="btn sm${mine ? " sec" : ""}" data-inc="${id}" data-sid="${o.s}">${mine ? `✓ Elegido · sumar otro` : `🛒 Agregar desde ${esc(ST[o.s].name)}`}</button></div></div>`;
  };
  dr.innerHTML = `<div class="dh"><button type="button" class="zoomb" ${p.img ? `data-zoom="${p.id}" aria-label="Ver la foto más grande"` : "disabled aria-hidden=\"true\""}>${prodImg(p, "ph")}</button><div><h2 id="dtitle">${esc(p.name)}</h2>
      <div class="sub">${esc(p.brand)} · en ${p.offers.length} ${p.offers.length === 1 ? "comercio" : "comercios"}</div></div>
      <button class="x" id="dclose" aria-label="Cerrar">✕</button></div>
    <div class="db">
      <div class="box best">
        <div><div class="sub">Más barato sin descuentos ${tip("sindto")}</div><div class="big">${money(b.v)}</div><div class="sub">${where(b)}${b.c === "online" ? " · más envío" : ` · <a data-mapa="${b.o.s}" href="${esc(mapaUrl(b.o.s))}" target="_blank" rel="noopener" title="Sucursal más cercana en Google Maps">${ic("navigation")} Cómo llegar</a>`}</div><div class="sub">${unitTxt(p, b.v)} ${unitTxt(p, b.v) ? tip("kg") : ""}</div></div>
        ${bp && bp.v < b.v ? `<div class="bestpay"><div class="sub">Pagando hoy con descuento ${tip("condto")}</div><div class="big">${money(bp.v)}</div><div class="sub">${storeChip(bp.o.s, bp.c)} con <b>${esc(medioName(bp.pay.promo))}</b></div><div class="sub">${pagoIcon(bp.pay.promo)} ${esc(pagoTxt(bp.pay.promo))}</div></div>` : ""}
        ${pq.length ? `<div class="qnote">🏷️ ${esc(hint || qtyHint(p, 1))}</div>` : ""}
        <div class="bbtn">
          ${q ? `<div class="incart"><span>En tu carrito${PREF[id] ? ` (${esc(ST[PREF[id]].name)})` : ""}:</span> ${addCtl(id)}</div>` : `<button class="btn" data-inc="${id}">${ic("shopping-cart")} Agregar al carrito</button>`}
          <div class="pmas"><button class="btn sec" id="pmasb" type="button" aria-expanded="${!!openProduct.menu}" aria-controls="pmenu">${ic("ellipsis")} Más opciones</button>
          <div class="pmenu" id="pmenu" ${openProduct.menu ? "" : "hidden"}>
          <button type="button" data-plan="${id}">${ic("chart-column")} Sumar a ¿Dónde conviene?</button>
          <button type="button" id="watch">${ic("bell")} ${watching ? "Avisando si baja (tocá para quitar)" : "Avisarme si baja"}</button>
          <button type="button" data-cmp="${id}">${CMP.includes(id) ? ic("check") + " En comparación" : ic("scale") + " Comparar"}</button>
          <button type="button" id="pshare">${ic("share-2")} Compartir</button></div></div></div>
        <div class="pbueno" id="pbueno"></div>
      </div>
      ${(() => { const alt = alternativas(p); return alt.length ? `<div class="alts"><h3>💡 Parecidos y más baratos ${p.bu === "kg" ? "por kilo" : p.bu === "l" ? "por litro" : "por unidad"}</h3>${alt.map(({ q, b, ah }) => `<div class="alt" data-open="${q.id}" role="button" tabindex="0">${prodImg(q, "li")}<div class="an"><b>${esc(q.name)}</b><span class="sub">${money(b.v)} en ${esc(chanName(b.o.s, b.c))} · ${unitTxt(q, b.v)}</span></div><span class="tag g sm">−${ah}%</span>${addCtl(q.id)}</div>`).join("")}</div>` : ""; })()}
      <details class="hist" id="phist" ${openProduct.hist ? "open" : ""}><summary>${ic("history")} Historial de precios</summary>
        <div class="chips hper" role="group" aria-label="Período">${[[7, "7 días"], [30, "30 días"], [0, "Todo"]].map(([d, t]) => `<button type="button" class="chip${(openProduct.dias ?? 30) === d ? " on" : ""}" data-hdias="${d}">${t}</button>`).join("")}</div>
        <div id="chart" class="chart"></div></details>
      ${anuncio("ficha")}
      <button class="btn sec vermas" id="vermas" aria-expanded="${openProduct.mas}">${openProduct.mas ? "Ocultar supermercados ▲" : `Ver más supermercados (${p.offers.length}) ▼`}</button>
      <div class="slist" id="slist" ${openProduct.mas ? "" : "hidden"}>
        <p class="sub" style="margin:0 0 8px">Precio de cada comercio, de menor a mayor. Podés agregar el producto al carrito desde el súper que prefieras. 🏷️ = oferta del comercio ${tip("oferta")} · 💳 = descuento con medio de pago ${tip("bancaria")}</p>
        ${rows.map(storeRow).join("")}
        <p class="sub" style="margin:10px 0 0">Precios del ${esc(D.updated.split("-").reverse().join("/"))}. Local: precio más común en las sucursales (base oficial SEPA). Online: sin envío.</p>
      </div>
    </div>`;
  if (dr.hidden) { dr.hidden = false; sc.hidden = false; document.body.style.overflow = "hidden"; openProduct.back = document.activeElement; dr.scrollTop = 0; }
  $("#dclose").onclick = closeDrawer;
  $("#pmasb").onclick = e => { e.stopPropagation(); openProduct.menu = !openProduct.menu; $("#pmenu").hidden = !openProduct.menu; $("#pmasb").setAttribute("aria-expanded", openProduct.menu);
    if (openProduct.fin) { openProduct.fin(); openProduct.fin = null; }
    if (openProduct.menu) openProduct.fin = flotar($("#pmasb"), $("#pmenu"), "bottom-end"); };
  buenPrecio(p, b.v);
  $("#phist").ontoggle = () => { openProduct.hist = $("#phist").open; if (openProduct.hist) chartU(p, openProduct.dias ?? 30); };
  if (openProduct.hist) chartU(p, openProduct.dias ?? 30);
  $$("[data-hdias]").forEach(bt => bt.onclick = () => { openProduct.dias = +bt.dataset.hdias; $$("[data-hdias]").forEach(x => x.classList.toggle("on", x === bt)); chartU(p, openProduct.dias); });
  $("#pshare").onclick = async () => {
    const site = (CFG.sitio_url || location.href.split("#")[0]).replace(/\/?$/, "/");
    const url = p.offers.length >= 6 ? `${site}p/${id}.html` : `${site}#p-${id}`;   // con 6+ comercios hay página con vista previa
    const text = `${p.name}: desde ${money(b.v)} en ${ST[b.o.s].name} (comparado en ${p.offers.length} comercios)`;
    if (navigator.share) { try { await navigator.share({ title: p.name, text, url }); } catch {} return; }
    openModal(`<h2>📤 Compartir</h2><p>${esc(text)}</p><div class="sharebtns"><a class="btn" target="_blank" rel="noopener" href="https://wa.me/?text=${encodeURIComponent(text + " " + url)}">WhatsApp</a><a class="btn sec" href="mailto:?subject=${encodeURIComponent(p.name)}&body=${encodeURIComponent(text + "\n" + url)}">Correo</a><button class="btn sec" id="pcopy">Copiar link</button></div>`);
    $("#pcopy").onclick = () => navigator.clipboard.writeText(url).then(() => toast("Link copiado"));
  };
  $("#vermas").onclick = () => { openProduct.mas = !openProduct.mas; const st = dr.scrollTop; openProduct(id); dr.scrollTop = st; };
  $("#watch").onclick = () => { if (id in AVISOS) { delete AVISOS[id]; toast("Ya no te avisamos"); } else { AVISOS[id] = b.v; toast("Te avisamos con la 🔔 cuando baje"); } LS.set(PK("cs_avisos"), AVISOS); refreshAvisos(); openProduct(id); };
  const url = "#p-" + id;
  if (!ovEsta("drawer")) {
    if (location.hash !== url) ovOpen("drawer", closeDrawer, url);
    else if (history.state && history.state.ov === "drawer") ovReg("drawer", closeDrawer);
    else if (openProduct.fresh) { history.replaceState(null, "", "#" + (closeDrawer.under || "inicio")); ovOpen("drawer", closeDrawer, url); }   // llegaste por un link compartido
    else { history.replaceState({ ov: "drawer" }, "", url); ovReg("drawer", closeDrawer); OV.h = url; }
  } else if (location.hash !== url) ovHist(() => setHash(url));
  openProduct.fresh = false;
  if (!LINKS_DONE) ensureLinks().then(() => { if (!dr.hidden && openProduct.id === id) { const st = dr.scrollTop; openProduct(id); dr.scrollTop = st; } });
}
function closeDrawer() {
  $("#drawer").hidden = true; if ($("#modal").hidden) $("#scrim").hidden = true; document.body.style.overflow = "";
  if (!ovDone("drawer") && location.hash.startsWith("#p-")) setHash("#" + (closeDrawer.under || "inicio"));
  if (openProduct.back) openProduct.back.focus?.();
}

/* una línea con lo que pasó con el precio más bajo desde que lo seguimos (sin gráficos) */
async function buenPrecio(p, ahora) {
  const h = await hist(), el = $("#pbueno"); if (!el || openProduct.id !== p.id) return;
  const ser = h.series[p.id], n = h.dates.length; if (!ser || n < 3) return;
  const minDia = i => { let m = null; for (const [s, l] of Object.entries(ser)) if (ST[s] && !FUERA.has(s) && l[i]) m = m == null ? l[i] : Math.min(m, l[i]); return m; };
  const serie = h.dates.map((_, i) => minDia(i)).filter(v => v), desde = h.dates[0].split("-").reverse().slice(0, 2).join("/");
  if (serie.length < 3) return;
  const min = Math.min(...serie), ini = serie[0], dias = n === 1 ? "" : `desde el ${desde}`;
  const pct = Math.round((ahora - ini) / ini * 100);
  let t = "", c = "";
  if (ahora <= min && ahora < Math.max(...serie)) { t = `${ic("trending-down")} Es el precio más bajo ${dias}`; c = "dn"; }
  else if (pct <= -3) { t = `${ic("trending-down")} Bajó ${Math.abs(pct)}% ${dias}`; c = "dn"; }
  else if (pct >= 3) { t = `${ic("trending-up")} Subió ${pct}% ${dias}` + (min < ahora ? ` · llegó a estar a ${money(min)}` : ""); c = "up"; }
  else { t = `${ic("minus")} Precio estable ${dias}`; c = ""; }
  el.innerHTML = `<span class="chg ${c}">${t}</span>`;
}
/* historial de precios con uPlot (licencia MIT): liviano, se puede tocar para ver el precio de cada día */
let UP_P = null;
const loadUP = () => UP_P || (UP_P = new Promise((ok, ko) => {
  const l = document.createElement("link"); l.rel = "stylesheet"; l.href = "js/vendor/uplot/uPlot.min.css"; document.head.appendChild(l);
  const s = document.createElement("script"); s.src = "js/vendor/uplot/uPlot.iife.min.js"; s.onload = () => ok(window.uPlot); s.onerror = () => { UP_P = null; ko(); }; document.head.appendChild(s);
}));
async function chartU(p, dias) {
  const el = $("#chart"); if (!el) return;
  let h, U;
  try { [h, U] = await Promise.all([hist(), loadUP()]); } catch { return chart(p); }   // sin la librería: el gráfico simple
  if (!$("#chart") || openProduct.id !== p.id) return;
  const ser = h.series[p.id] || {}, n = h.dates.length, desde = dias ? Math.max(0, n - dias) : 0;
  const sids = D.stores.map(s => s.id).filter(s => ser[s] && ser[s].slice(desde).some(Boolean));
  if (n - desde < 2 || !sids.length) { el.innerHTML = '<div class="sub">Todavía no hay historial suficiente. Se completa día a día.</div>'; return; }
  const xs = h.dates.slice(desde).map(d => Date.parse(d + "T12:00:00-03:00") / 1000);
  const css = getComputedStyle(document.documentElement), mut = css.getPropertyValue("--mut").trim() || "#888", line = css.getPropertyValue("--line").trim() || "#ddd";
  const eje = { stroke: mut, grid: { stroke: line, width: 1 }, ticks: { stroke: line, width: 1 }, font: "11px " + getComputedStyle(document.body).fontFamily };
  el.innerHTML = `<div class="ugraf"></div><div class="uinfo sub" aria-live="polite">Tocá o pasá el mouse por el gráfico para ver el precio de cada día.</div>
    <div class="uley">${sids.map(sd => `<span><i style="background:${ST[sd].color || "#16a34a"}"></i>${esc(ST[sd].name)}</span>`).join("")}</div>`;
  const info = $(".uinfo", el), fecha = t => new Date(t * 1000).toLocaleDateString("es-AR", { weekday: "short", day: "numeric", month: "numeric" });
  const datos = [xs, ...sids.map(s => ser[s].slice(desde).map(v => v || null))];
  new U({
    width: el.clientWidth || 600, height: 220, cursor: { drag: { x: false, y: false }, points: { size: 8 } }, legend: { show: false },
    scales: { x: { time: true } },
    hooks: { setCursor: [u => { const i = u.cursor.idx; if (i == null) return; const filas = sids.map((sd, k) => [sd, datos[k + 1][i]]).filter(x => x[1]).sort((a, b) => a[1] - b[1]);
      info.innerHTML = `<b>${fecha(xs[i])}</b>: ` + filas.map(([sd, v]) => `${esc(ST[sd].name)} ${money(v)}`).join(" · "); }] },
    axes: [{ ...eje, splits: () => xs.length <= 10 ? xs : xs.filter((_, i) => i % Math.ceil(xs.length / 8) === 0), values: (u, v) => v.map(t => { const d = new Date(t * 1000); return `${d.getDate()}/${d.getMonth() + 1}`; }) },
      { ...eje, size: 64, values: (u, v) => v.map(x => money(x)) }],
    series: [{ value: (u, t) => (t == null ? "" : new Date(t * 1000).toLocaleDateString("es-AR", { day: "numeric", month: "numeric" })) },
      ...sids.map(s => ({ label: ST[s].name, stroke: ST[s].color || "#16a34a", width: 2.2, spanGaps: true, points: { show: n - desde <= 15, size: 6 }, value: (u, v) => (v == null ? "—" : money(v)) }))],
  }, datos, $(".ugraf", el));
}
async function chart(p) {
  const h = await hist(), el = $("#chart"); if (!el) return;
  const ser = h.series[p.id] || {}, dates = h.dates, sids = D.stores.map(s => s.id).filter(s => ser[s]);
  if (dates.length < 2 || !sids.length) { el.innerHTML = '<div class="sub">Todavía no hay historial suficiente.</div>'; return; }
  const off = new Set();
  const draw = () => {
    const W = el.clientWidth || 600, H = 240, L = 58, R = 10, T = 10, B = 26;
    const vis = sids.filter(s => !off.has(s));
    const vals = vis.flatMap(s => ser[s].filter(Boolean));
    if (!vals.length) { el.innerHTML = '<div class="sub">Elegí al menos un comercio.</div>'; return; }
    let lo = Math.min(...vals), hi = Math.max(...vals); const pad = (hi - lo) * 0.1 || hi * 0.05; lo -= pad; hi += pad;
    const x = i => L + i / (dates.length - 1) * (W - L - R), y = v => T + (1 - (v - lo) / (hi - lo)) * (H - T - B);
    const ticks = [0, 1, 2, 3].map(k => lo + (hi - lo) * k / 3);
    const xt = [0, Math.floor(dates.length / 2), dates.length - 1];
    const path = s => { let d = "", pen = false; ser[s].forEach((v, i) => { if (v) { d += (pen ? "L" : "M") + x(i).toFixed(1) + "," + y(v).toFixed(1); pen = true; } else pen = false; }); return d; };
    el.innerHTML = `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Historial de precios de ${esc(p.name)}">
      ${ticks.map(t => `<line x1="${L}" x2="${W - R}" y1="${y(t)}" y2="${y(t)}" style="stroke:var(--line)"/><text x="${L - 6}" y="${y(t) + 4}" text-anchor="end" font-size="11" style="fill:var(--mut)">${money(t)}</text>`).join("")}
      ${xt.map(i => `<text x="${x(i)}" y="${H - 6}" text-anchor="${i === 0 ? "start" : i === dates.length - 1 ? "end" : "middle"}" font-size="11" style="fill:var(--mut)">${dates[i].slice(8, 10)}/${dates[i].slice(5, 7)}</text>`).join("")}
      ${vis.map(s => `<path d="${path(s)}" fill="none" stroke="${ST[s].color}" stroke-width="2.2" stroke-linejoin="round" stroke-linecap="round"/>`).join("")}
      <line id="cx" y1="${T}" y2="${H - B}" style="stroke:var(--ink)" stroke-dasharray="3 3" opacity="0"/>
      <rect x="${L}" y="${T}" width="${W - L - R}" height="${H - T - B}" fill="transparent" id="hit"/></svg><div class="tip" id="tip" hidden></div>`;
    const hit = $("#hit", el), tip = $("#tip", el), cx = $("#cx", el);
    const move = ev => {
      const r = el.getBoundingClientRect(), px = (ev.touches ? ev.touches[0].clientX : ev.clientX) - r.left;
      const i = Math.max(0, Math.min(dates.length - 1, Math.round((px * (W / r.width) - L) / (W - L - R) * (dates.length - 1))));
      cx.setAttribute("x1", x(i)); cx.setAttribute("x2", x(i)); cx.setAttribute("opacity", ".4");
      const rowsT = vis.filter(s => ser[s][i]).sort((a, b2) => ser[a][i] - ser[b2][i]);
      tip.innerHTML = `<b>${dates[i].split("-").reverse().join("/")}</b>` + rowsT.map(s => `<div><i style="width:8px;height:8px;border-radius:50%;background:${ST[s].color};display:inline-block"></i>${esc(ST[s].name)} ${money(ser[s][i])}</div>`).join("");
      tip.hidden = false; const tx = x(i) * r.width / W; tip.style.left = Math.min(r.width - 180, Math.max(0, tx + 12)) + "px"; tip.style.top = "6px";
    };
    hit.onmousemove = move; hit.ontouchmove = move; hit.onmouseleave = () => { tip.hidden = true; cx.setAttribute("opacity", "0"); };
  };
  $("#legend").innerHTML = sids.map(s => `<button data-lg="${s}"><i style="width:9px;height:9px;border-radius:50%;background:${ST[s].color};display:inline-block"></i>${esc(ST[s].name)}</button>`).join("");
  $$("[data-lg]").forEach(b => b.onclick = () => { const s = b.dataset.lg; off.has(s) ? off.delete(s) : off.add(s); b.classList.toggle("off", off.has(s)); draw(); });
  draw();
}

/* ---------- ventanas ---------- */
function openModal(html) { const m = $("#modal"); m.innerHTML = `<button class="mx" type="button" data-close aria-label="Cerrar">✕</button>` + html; m.hidden = false; $("#scrim").hidden = false; ovOpen("modal", closeModal); const f = m.querySelector("input, button"); f && f.focus(); }
function closeModal() { if (FUERA_PEND) { FUERA_PEND = false; setTimeout(() => location.reload(), 300); } if (typeof scanStop === "function") scanStop(); const was = !$("#modal").hidden; $("#modal").hidden = true; if ($("#drawer").hidden) $("#scrim").hidden = true; if (was || ovEsta("modal")) ovDone("modal"); }
function modalMedios() {
  const sel = new Set(MEDIOS || []);
  const groups = Object.entries(P.tipos).filter(([k]) => k !== "general").map(([k, v]) => [k, v, P.medios.filter(m => m.tipo === k).sort((a, b) => a.name.localeCompare(b.name, "es"))]).filter(g => g[2].length);
  openModal(`<h2>💳 Mis medios de pago</h2><p class="sub">Marcá los bancos, billeteras, tarjetas y clubes que tenés. Calculamos los precios finales solo con esos descuentos. Se guarda en este navegador, no se manda a ningún lado.</p>
    ${groups.map(([k, v, ms]) => `<h4 class="mg">${esc(v)}</h4><div class="mgrid">${ms.map(m => `<label class="mopt"><input type="checkbox" value="${m.id}" ${sel.has(m.id) ? "checked" : ""}>${medioBadge(m)}<span>${esc(m.name)}<small>${promosDe(m.id).length} beneficios</small></span></label>`).join("")}</div>`).join("")}
    <div class="mfoot"><button class="btn sec sm" id="mall">Ver todos (no filtrar)</button><button class="btn" id="msave">Guardar</button></div>`);
  $("#msave").onclick = () => { const v = $$("#modal input:checked").map(i => i.value); MEDIOS = v.length ? v : null; LS.set("cs_medios", MEDIOS); afterMedios(); };
  $("#mall").onclick = () => { MEDIOS = null; LS.set("cs_medios", null); afterMedios(); };
}
function afterMedios() { closeModal(); $("#mdot").hidden = !MEDIOS; toast(MEDIOS ? `Listo: ${MEDIOS.length} medios de pago` : "Mostrando todos los descuentos"); const id = location.hash.startsWith("#p-") && location.hash.slice(3); route(); if (id) openProduct(id); }
function avisoBajas() {
  const { bajaron } = refreshAvisos(); if (!bajaron.length) return;
  const visto = LS.get(PK("cs_avisos_vistos"), {}), nuevos = bajaron.filter(id => visto[id] !== best(BY[id]).v);
  if (!nuevos.length) return;
  const el = document.createElement("div"); el.className = "abaja"; el.setAttribute("role", "status");
  el.innerHTML = `<span>${ic("bell")} ${nuevos.length === 1 ? `Bajó <b>${esc(BY[nuevos[0]].name)}</b>` : `Bajaron <b>${nuevos.length} productos</b> que seguís`}</span><button class="btn sm" type="button">Ver</button><button class="ax" type="button" aria-label="Cerrar aviso">✕</button>`;
  const cerrar = () => { el.remove(); for (const id of bajaron) visto[id] = best(BY[id]).v; LS.set(PK("cs_avisos_vistos"), visto); };
  el.querySelector(".btn").onclick = () => { cerrar(); nuevos.length === 1 ? openProduct(nuevos[0]) : modalAvisos(); };
  el.querySelector(".ax").onclick = cerrar;
  document.body.appendChild(el); setTimeout(() => el.isConnected && el.classList.add("fuera"), 12000); setTimeout(() => el.isConnected && el.remove(), 12600);
}
function modalAvisos() {
  const { ids, bajaron } = refreshAvisos();
  openModal(`<h2>🔔 Mis avisos</h2><p class="sub">Te marcamos los productos que bajaron desde que pediste el aviso. ¿Lo querés por correo? <a href="#" data-news>Registrate para recibir novedades</a>.</p>
    <div class="alts" style="margin-top:12px">${ids.map(id => { const p = BY[id], now = best(p).v, d = bajaron.includes(id);
      return `<button class="alt" data-open="${id}"><span><b>${esc(p.name)}</b><br><span class="sub">Cuando lo guardaste: ${money(AVISOS[id])}</span></span><span style="text-align:right"><b>${money(now)}</b><br>${d ? `<span class="chg dn">▼ bajó ${money(AVISOS[id] - now)}</span>` : now > AVISOS[id] ? '<span class="chg up">▲ subió</span>' : '<span class="sub">igual</span>'}</span></button>`; }).join("")}</div>
    <div class="mfoot"><span></span><button class="btn sec sm" data-close>Cerrar</button></div>`);
}
/* registro para recibir novedades: se guarda en un formulario de Google (ver site/config.json y README) */
function modalNews() {
  const temas = [["semanal", "Resumen semanal de ofertas y descuentos bancarios"], ["bajas", "Bajas de precio de los productos de mis avisos"], ["nuevos", "Nuevos comercios y funciones de la página"]];
  openModal(`<h2>📬 Recibir novedades</h2><p class="sub">Dejanos tu correo y elegí qué te interesa. Te podés dar de baja cuando quieras desde el enlace de cada correo.</p>
    <form id="nform" class="nform" novalidate>
      <label class="fl">Correo electrónico<input type="email" id="nmail" required autocomplete="email" placeholder="tu@correo.com"></label>
      <fieldset><legend>Quiero recibir</legend>${temas.map(([v, t], i) => `<label class="ck"><input type="checkbox" name="tema" value="${v}" ${i < 2 ? "checked" : ""}> ${t}</label>`).join("")}</fieldset>
      <label class="fl">Zona<select class="sel" id="nzona">${(enAMBA() ? ["CABA", "GBA Norte", "GBA Oeste", "GBA Sur", "La Plata y alrededores"] : [provNombre(PROV)]).concat(PROVINCIAS.map(x => x.name).filter(n => !["Ciudad de Buenos Aires", provNombre(PROV)].includes(n))).map(z => `<option>${esc(z)}</option>`).join("")}</select></label>
      <label class="ck"><input type="checkbox" id="nok" required> Acepto recibir correos de ComparáSúper. Solo usamos tu correo para esto y no lo compartimos.</label>
      <div class="ferr" id="nerr" role="alert"></div>
      <div class="mfoot"><button type="button" class="btn sec sm" data-close>Cancelar</button><button class="btn" type="submit">Registrarme</button></div>
    </form>`);
  $("#nform").onsubmit = async e => {
    e.preventDefault();
    const mail = $("#nmail").value.trim(), err = $("#nerr");
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(mail)) { err.textContent = "Revisá el correo: parece incompleto."; $("#nmail").focus(); return; }
    if (!$("#nok").checked) { err.textContent = "Para registrarte tenés que aceptar recibir los correos."; return; }
    const cfg = (CFG.novedades || {});
    if (API()) {
      try { await apiPost({ tipo: "novedades", email: mail, temas: $$("input[name=tema]:checked").map(i => i.value).join(", "), zona: $("#nzona") ? $("#nzona").value : "" });
        LS.set("cs_news", mail);
        $("#modal").innerHTML = `<button class="mx" type="button" data-close aria-label="Cerrar">✕</button><h2>✅ ¡Listo!</h2><p>Registramos <b>${esc(mail)}</b>. Vas a recibir las novedades que elegiste.</p><div class="mfoot"><span></span><button class="btn" data-close>Cerrar</button></div>`;
      } catch { err.textContent = "No pudimos enviar el registro. Revisá tu conexión y probá de nuevo."; }
      return;
    }
    if (!cfg.form_action) { err.innerHTML = "⚙️ El registro todavía no está conectado (prototipo): falta configurar el formulario en <code>config.json</code>. Tu correo <b>no</b> se guardó."; return; }
    const fd = new FormData();
    fd.append(cfg.campo_email, mail);
    if (cfg.campo_temas) $$("input[name=tema]:checked").forEach(i => fd.append(cfg.campo_temas, i.value));
    if (cfg.campo_zona) fd.append(cfg.campo_zona, $("#nzona").value);
    try {
      await fetch(cfg.form_action, { method: "POST", mode: "no-cors", body: fd });
      LS.set("cs_news", mail);
      $("#modal").innerHTML = `<h2>✅ ¡Listo!</h2><p>Registramos <b>${esc(mail)}</b>. Vas a recibir las novedades que elegiste.</p><div class="mfoot"><span></span><button class="btn" data-close>Cerrar</button></div>`;
    } catch { err.textContent = "No pudimos enviar el registro. Revisá tu conexión y probá de nuevo."; }
  };
}

/* menú "⋯ Más opciones" de la ficha: se cierra al tocar afuera o al elegir algo */
document.addEventListener("click", e => {
  if (!openProduct.menu || e.target.closest("#pmasb")) return;
  const m = $("#pmenu"); openProduct.menu = false; if (openProduct.fin) { openProduct.fin(); openProduct.fin = null; }
  if (m) { m.hidden = true; const b = $("#pmasb"); b && b.setAttribute("aria-expanded", false); }
}, true);

/* ---------- FILAS QUE SE DESLIZAN: borde desvanecido si hay más para ver al costado ---------- */
const DESLIZ = ".qchips,.hscroll,.cmpgrid,.tscroll,.matrix,.chips,.week,.dayrow";
function fadeUpd(el) {
  if (el.scrollWidth <= el.clientWidth + 2) { el.classList.remove("fd-r", "fd-l"); return; }
  el.classList.toggle("fd-l", el.scrollLeft > 4); el.classList.toggle("fd-r", el.scrollLeft + el.clientWidth < el.scrollWidth - 4);
}
const fadeAll = () => $$(DESLIZ).forEach(fadeUpd);
document.addEventListener("scroll", e => { if (e.target.matches && e.target.matches(DESLIZ)) fadeUpd(e.target); }, true);
addEventListener("resize", fadeAll);
new MutationObserver(() => { clearTimeout(fadeAll.t); fadeAll.t = setTimeout(fadeAll, 80); }).observe(document.getElementById("view"), { childList: true });
new MutationObserver(() => { clearTimeout(fadeAll.t); fadeAll.t = setTimeout(fadeAll, 80); }).observe(document.getElementById("drawer"), { childList: true });

/* ---------- ENCABEZADO QUE SE ACHICA AL BAJAR (celular) ----------
   Bajando queda solo el buscador; subiendo un poco vuelve todo. El encabezado queda fijo arriba y la página
   reserva su alto completo, así nada salta al achicarse. */
(() => {
  const hd = $("header.site"), cel = matchMedia("(max-width:640px)");
  let lastY = scrollY, tick = false;
  const medir = () => { if (!hd.classList.contains("min")) document.documentElement.style.setProperty("--hh", hd.offsetHeight + "px"); };
  new ResizeObserver(medir).observe(hd); addEventListener("resize", medir);
  const set = min => { if (hd.classList.contains("min") !== min) hd.classList.toggle("min", min); };
  addEventListener("scroll", () => {
    if (tick) return; tick = true;
    requestAnimationFrame(() => {
      tick = false; const y = scrollY;
      if (!cel.matches || y < 90 || !$("#qsug").hidden || document.activeElement === $("#q")) set(false);
      else if (y > lastY + 6) set(true);
      else if (y < lastY - 10) set(false);
      lastY = y;
    });
  }, { passive: true });
})();

/* ---------- VENTANAS Y BOTÓN "ATRÁS" ----------
   Cada ventana (ficha de producto, ventanas emergentes, asistente, menú "Más", filtros, guía, mapa) deja una
   entrada en el historial al abrirse. Así el botón "atrás" del celular la cierra a ella sola, en vez de salir de la web. */
const OV = { pila: [], saltar: 0, cola: [], ir: null, ev: null, quieto: false, h: location.hash };
const ovEsta = n => OV.pila.some(o => o.n === n);
function ovHist(fn) { OV.saltar ? OV.cola.push(fn) : fn(); }          // espera si hay un "atrás" en camino
function ovOpen(n, cerrar, url) {
  if (ovEsta(n)) return; OV.pila.push({ n, cerrar });
  ovHist(() => { history.pushState({ ov: n }, "", url || location.href); OV.h = location.hash; });
}
function ovReg(n, cerrar) { if (!ovEsta(n)) OV.pila.push({ n, cerrar }); }   // la entrada ya existe (recarga o enlace)
function ovForget(n) { OV.pila = OV.pila.filter(o => o.n !== n); }
function ovDone(n) {   // la ventana se cerró con su ✕ o tocando afuera: quitamos su entrada del historial
  if (!ovEsta(n)) return false; ovForget(n);
  if (OV.ev) { OV.ev.preventDefault(); OV.ir = OV.ev.target.closest("a").getAttribute("href"); OV.ev = null; }   // se cerró por un enlace: navegamos después
  if (history.state && history.state.ov === n) { if (n === "drawer") OV.quieto = true; OV.saltar++; history.back(); return true; }
  if (OV.ir) { const h = OV.ir; OV.ir = null; location.hash === h ? route() : (location.hash = h); }
  return false;
}
document.addEventListener("click", e => { const a = e.target.closest && e.target.closest('a[href^="#"]'); OV.ev = a && a.getAttribute("href").length > 1 ? e : null; setTimeout(() => { OV.ev = null; }); }, true);
addEventListener("popstate", e => {
  if (OV.saltar) {
    OV.saltar--;
    if (!OV.saltar) { const c = OV.cola.splice(0); c.forEach(f => f()); if (OV.ir) { const h = OV.ir; OV.ir = null; setTimeout(() => { location.hash === h ? route() : (location.hash = h); }); } }
    OV.h = location.hash; return;
  }
  const top = OV.pila.pop();
  if (top) {
    if (top.n === "drawer") { if (location.hash !== OV.h) OV.quieto = true; }
    else if (location.hash !== OV.h) { history.replaceState(history.state, "", OV.h); OV.quieto = true; }   // la página de abajo queda igual
    top.cerrar(); OV.h = location.hash; return;
  }
  OV.h = location.hash;
  if (e.state && e.state.ov && e.state.ov !== "drawer") { OV.saltar++; history.back(); }   // entrada vieja de una ventana ya cerrada
});
if (history.state && history.state.ov && history.state.ov !== "drawer") { OV.saltar++; history.back(); }   // recargaste con una ventana abierta
/* ir a otra sección justo después de cerrar una ventana (espera a que termine el "atrás" de la ventana) */
function irA(h) { if (OV.saltar) OV.ir = "#" + h; else location.hash = h; }
function setHash(h) { history.replaceState(history.state, "", h); OV.h = location.hash; }

/* ---------- navegación ---------- */
function route() {
  if (OV.quieto) { OV.quieto = false; OV.h = location.hash; if (!location.hash.startsWith("#p-")) return; }
  OV.h = location.hash;
  if (!/^#(buscar|c-)/.test(location.hash)) { S.fopen = false; ovForget("filtros"); document.body.classList.remove("noscroll"); }
  if (!D) return;   // todavía cargando: load() llama a route() al terminar
  const h = location.hash.slice(1) || "inicio";
  if (!READY && !/^(inicio|pagos|como|legal|sugerencias|nosotros.*|legal.*)?$/.test(h) && !(TOPR && /^(buscar|c-)/.test(h))) {   // super, comparar… esperan los productos
    $("#view").innerHTML = `<div class="wrap loading"><div class="sk sk-h"></div>${esqueleto(8)}<span class="sr">Cargando productos…</span></div>`;
    loadProducts().then(() => route()); return;
  }
  if (!LINKS_DONE && /^(conviene|carrito)/.test(h)) ensureLinks().then(() => { if (location.hash.slice(1) === h) route(); });   // vuelve a dibujar con los botones de carrito online
  if (h.startsWith("l-")) { importList(h.slice(2)); return; }
  if (h.startsWith("p-")) { if (!$("#view").dataset.v) { closeDrawer.under = "inicio"; vInicio(); $("#view").dataset.v = "inicio"; openProduct.fresh = true; } openProduct(h.slice(2)); return; }
  if (!$("#drawer").hidden) { $("#drawer").hidden = true; $("#scrim").hidden = $("#modal").hidden; document.body.style.overflow = ""; ovForget("drawer"); }
  let v = h;
  if (h.startsWith("c-")) { S.cat = h.slice(2); S.q = ""; $("#q").value = ""; v = "buscar"; }
  if (v === "lista") v = "carrito";   // enlaces viejos
  const [v0, sec] = v.split("-");
  if (v0 === "nosotros" || v0 === "legal") { (v0 === "nosotros" ? vNosotros : vLegal)(); if (sec) setTimeout(() => { const el = document.getElementById("s-" + sec); if (el) el.scrollIntoView({ behavior: "smooth", block: "start" }); }, 30); else scrollTo(0, 0); return; }
  if (!READY && TOPR && v === "buscar") setTimeout(() => { const h1 = $("#view h1"); if (h1 && !READY && !$("#cargando")) h1.insertAdjacentHTML("afterend", '<div class="sub" id="cargando">⏳ Mostrando los más comparados mientras cargamos el resto…</div>'); });
  ({ mapa: vMapa, inicio: vInicio, buscar: vBuscar, ofertas: vOfertas, pagos: vPagos, carrito: vCarrito, conviene: vConviene, como: vComo, legal: vLegal, sugerencias: vSugerencias, super: vSuper, comparar: vComparar }[v] || vInicio)();
  $("#view").dataset.v = v; closeDrawer.under = h;
  contar(v); cmpBar();
}

document.addEventListener("click", e => {
  const vm = $("#vmenu"); if (vm && vm.open && !vm.contains(e.target)) vm.open = false;
  if (e.target.closest("[data-ubic]")) { e.preventDefault(); modalUbic(); return; }
  if (e.target.closest("[data-scan]")) { e.preventDefault(); modalScan(); return; }
  if (e.target.closest("[data-tour]")) { e.preventDefault(); if (!$("#bsheet").hidden) masShow(false); startTour(); return; }
  const ag = e.target.closest("[data-agendar]"); if (ag) { e.preventDefault(); modalAgendar(ag.dataset.agendar); return; }
  const cm = e.target.closest("[data-cmp]"); if (cm) { e.preventDefault(); cmpToggle(cm.dataset.cmp); if (!$("#drawer").hidden && openProduct.id) { const st = $("#drawer").scrollTop; openProduct(openProduct.id); $("#drawer").scrollTop = st; } return; }
  if (e.target.closest("[data-noubic]")) { UBIC = null; LS.set(PK("cs_ubic"), null); S.cerca = false; calcCerca(); updUbic(); closeModal(); route(); toast("Ubicación quitada"); ubicCambio(); return; }
  const inc = e.target.closest("[data-inc]"); if (inc) { e.stopPropagation(); const id = inc.dataset.inc; setQty(id, (LISTA[id] || 0) + 1, inc.dataset.sid); return; }
  const dec = e.target.closest("[data-dec]"); if (dec) { e.stopPropagation(); const id = dec.dataset.dec; setQty(id, (LISTA[id] || 0) - 1); return; }
  const add = e.target.closest("[data-add]"); if (add) { e.stopPropagation(); addToList(add.dataset.add); return; }
  const op = e.target.closest("[data-open]"); if (op) { closeModal(); openProduct(op.dataset.open); return; }
  if (e.target.closest("[data-close]")) { closeModal(); return; }
  if (e.target.closest("[data-medios]")) { e.preventDefault(); modalMedios(); return; }
  if (e.target.closest("[data-news]")) { e.preventDefault(); modalNews(); return; }
  if (e.target.closest("[data-marcarmapa]")) { e.preventDefault(); MAPA.marcar = true; closeModal(); if (location.hash === "#mapa") vMapa(); else irA("mapa"); return; }
  const zb = e.target.closest("[data-zoom]"); if (zb) { e.preventDefault(); zoomFoto(BY[zb.dataset.zoom]); return; }
  if (e.target.closest("[data-pegar]")) { e.preventDefault(); modalLista(""); return; }
  if (e.target.closest("[data-ticket]")) { e.preventDefault(); scanStop(); if (!$("#bsheet").hidden) masShow(false); modalTicket(); return; }
  const cn = e.target.closest("[data-canal]"); if (cn) { S.canal = cn.dataset.canal; route(); return; }
  if (e.target.closest("[data-canasta]")) { e.preventDefault(); canasta().forEach(({ p }) => (PLAN[p.id] = PLAN[p.id] || 1)); savePlan(); toast("Canasta básica cargada para comparar"); location.hash === "#conviene" ? route() : (location.hash = "conviene"); return; }
  const pl = e.target.closest("[data-plan]"); if (pl) { const id = pl.dataset.plan; PLAN[id] = (PLAN[id] || 0) + 1; savePlan(); if (pl.hasAttribute("data-replan")) vConviene(); const h = qtyHint(BY[id], PLAN[id]); toast(`Sumado a ¿Dónde conviene mi compra? 📊 (${PLAN[id]})${h ? " · " + h : ""}`, h ? 4500 : 2400); return; }
  const so = e.target.closest("[data-sort]"); if (so) { S.sort = so.dataset.sort; S.cat = ""; S.q = ""; }
});
document.addEventListener("keydown", e => {
  if (e.key === "Escape" && S.fopen && $("#fx")) { $("#fx").click(); return; }
  if (e.key === "Escape") { if (!$("#modal").hidden) closeModal(); else if (!$("#drawer").hidden) closeDrawer(); }
  if (e.key === "Enter" && e.target.matches("article[data-open]")) openProduct(e.target.dataset.open);
});
$("#scrim").onclick = () => { if (!$("#modal").hidden) closeModal(); else closeDrawer(); };
$("#mbtn").onclick = modalMedios;
$("#abtn").onclick = modalAvisos;
$("#themebtn").onclick = () => { const t = document.documentElement.dataset.theme === "dark" ? "light" : "dark"; LS.set("cs_tema", t); applyTheme(t); if (!$("#drawer").hidden && location.hash.startsWith("#p-")) openProduct.hist && chartU(BY[location.hash.slice(3)], openProduct.dias ?? 30); };
$("#hform").onsubmit = e => { e.preventDefault(); clearTimeout(qsugDraw.t); qsugShow(false); guardarBusq($("#q").value); $("#q").blur(); S.q = $("#q").value.trim(); S.cat = ""; location.hash === "#buscar" ? vBuscar() : (location.hash = "buscar"); };
$("#q").addEventListener("input", () => { clearTimeout(route.t); if (location.hash !== "#buscar") return;   // fuera de Productos: solo se abre la lista; se pasa con Enter o al elegir
  route.t = setTimeout(() => { S.bpage = 1; S.q = $("#q").value.trim(); S.cat = ""; vBuscar(); }, 250); });
/* cambio de sección con una transición suave (función nativa del navegador; si no la tiene, cambia como siempre) */
const SUAVE = !!document.startViewTransition && !matchMedia("(prefers-reduced-motion: reduce)").matches;
window.addEventListener("hashchange", () => {
  if (SUAVE && !location.hash.startsWith("#p-") && $("#drawer").hidden && $("#modal").hidden && !OV.quieto && D) document.startViewTransition(() => route());
  else route();
});
applyTheme(document.documentElement.dataset.theme);


/* ---------- BÚSQUEDAS RECIENTES Y VISTOS HACE POCO (solo en este navegador) ---------- */
let BUSQ = LS.get("cs_busq", []), VISTOS = LS.get(PK("cs_vistos"), []);
function guardarBusq(q) { q = (q || "").trim(); if (q.length < 2) return; BUSQ = [q, ...BUSQ.filter(x => nrm(x) !== nrm(q))].slice(0, 5); LS.set("cs_busq", BUSQ); }
function guardarVisto(id) { VISTOS = [id, ...VISTOS.filter(x => x !== id)].slice(0, 8); LS.set(PK("cs_vistos"), VISTOS); }
function recientesDraw() {
  const vis = VISTOS.filter(id => BY && BY[id]).slice(0, 5), box = $("#qsug");
  if (!BUSQ.length && !vis.length) { qsugShow(false); return; }
  box.innerHTML = (BUSQ.length ? `<div class="qs-h">Búsquedas recientes <button type="button" class="linkbtn" data-borrarbusq>Borrar</button></div>` + BUSQ.map(t => `<button type="button" class="qs-w" role="option" data-qs="${esc(t)}">${ic("history")} ${esc(t)}</button>`).join("") : "")
    + (vis.length ? `<div class="qs-h">Vistos hace poco</div>` + vis.map(id => { const p = BY[id], b = best(p); return `<button type="button" class="qs-p" role="option" data-open="${p.id}">${prodImg(p, "li")}<span class="qn">${esc(p.name)}</span><span class="qp">${money(b.v)}<small>${esc(ST[b.o.s] ? ST[b.o.s].name : "")}</small></span></button>`; }).join("") : "");
  qsugShow(true);
}

/* ---------- SUGERENCIAS MIENTRAS ESCRIBÍS ---------- */
function qsugShow(show) { const b = $("#qsug"); b.hidden = !show; $("#q").setAttribute("aria-expanded", show); }
function qsugDraw() {
  const q = $("#q").value.trim(), box = $("#qsug");
  if (document.activeElement !== $("#q")) { qsugShow(false); return; }
  if (q.length < 2) { recientesDraw(); return; }   // buscador vacío: búsquedas recientes y vistos hace poco
  if (!READY && !TOPR) { qsugShow(false); return; }
  const ws = nrm(q).split(/\s+/).filter(Boolean), last = ws[ws.length - 1], head = ws.slice(0, -1);
  let comp, wsx = ws, fix = "", prods;
  if (BUSC.ok && READY) {   // lo resuelve el proceso de fondo (no traba mientras escribís)
    const res = buscarFondo(q, () => { if ($("#q").value.trim() === q) qsugDraw(); });
    if (!res) return;
    comp = res.comp; fix = res.fix; if (fix) wsx = fix.split(" ");
    const ids = res.ids.slice(0, 400); prods = ids.map(id => BY[id]).filter(Boolean);
  } else {
    vocab();
    // palabras que completan lo que estás escribiendo
    comp = [...VOC].filter(([w]) => w.startsWith(last) && w !== last).sort((a, b) => b[1] - a[1]).slice(0, 4).map(([w]) => [...head, w].join(" "));
    prods = D.products.filter(p => ws.every(w => matchW(p, w)));
    if (!prods.length) { wsx = ws.map(corregir); fix = wsx.join(" ") !== ws.join(" ") ? wsx.join(" ") : ""; prods = fix ? D.products.filter(p => wsx.every(w => matchW(p, w))) : []; }
  }
  prods = prods.sort((a, b) => (matchScore(a, wsx) - matchScore(b, wsx)) || (b.offers.length - a.offers.length)).slice(0, 6);
  const cats = D.cats.filter(c => nrm(c.name).includes(last)).slice(0, 2);
  if (!prods.length && !comp.length && !cats.length) { box.innerHTML = `<div class="qs-none">No encontramos «${esc(q)}». Probá con otra palabra o <button type="button" class="linkbtn" data-scan>escaneá el código</button>.</div>`; qsugShow(true); return; }
  box.innerHTML = (fix ? `<div class="qs-fix">¿Quisiste decir <button type="button" class="linkbtn" data-qs="${esc(fix)}">${esc(fix)}</button>?</div>` : "")
    + comp.map(t => `<button type="button" class="qs-w" role="option" data-qs="${esc(t)}">${ic("search")} ${esc(t)}</button>`).join("")
    + cats.map(c => `<a class="qs-w" role="option" href="#c-${c.id}">${c.emoji} ${esc(c.name)}</a>`).join("")
    + prods.map(p => { const b = best(p); return `<button type="button" class="qs-p" role="option" data-open="${p.id}">${prodImg(p, "li")}<span class="qn">${esc(p.name)}</span><span class="qp">${money(b.v)}<small>${esc(ST[b.o.s] ? ST[b.o.s].name : "")}</small></span></button>`; }).join("")
    + `<button type="button" class="qs-all" data-qs="${esc(fix || q)}">Ver todos los resultados de «${esc(fix || q)}» →</button>`;
  qsugShow(true); animar(box);
}
$("#q").addEventListener("input", () => { clearTimeout(qsugDraw.t); qsugDraw.t = setTimeout(qsugDraw, 120); });
$("#q").addEventListener("focus", () => qsugDraw());
$("#q").addEventListener("click", () => { if ($("#qsug").hidden) qsugDraw(); });
$("#q").addEventListener("keydown", e => {
  const items = $$("#qsug [role=option], #qsug .qs-all"); if ($("#qsug").hidden || !items.length) return;
  const i = items.indexOf(document.activeElement);
  if (e.key === "ArrowDown") { e.preventDefault(); items[0].focus(); }
  if (e.key === "Escape") qsugShow(false);
});
$("#qsug").addEventListener("keydown", e => {
  const items = $$("#qsug [role=option], #qsug .qs-all"), i = items.indexOf(document.activeElement);
  if (e.key === "ArrowDown") { e.preventDefault(); (items[i + 1] || items[i]).focus(); }
  if (e.key === "ArrowUp") { e.preventDefault(); i > 0 ? items[i - 1].focus() : $("#q").focus(); }
  if (e.key === "Escape") { qsugShow(false); $("#q").focus(); }
});
$("#qsug").addEventListener("click", e => {
  const t = e.target.closest("[data-qs]");
  if (e.target.closest("[data-borrarbusq]")) { e.stopPropagation(); BUSQ = []; LS.set("cs_busq", BUSQ); recientesDraw(); $("#q").focus(); return; }
  if (t) { guardarBusq(t.dataset.qs); $("#q").value = t.dataset.qs; S.q = t.dataset.qs; S.cat = ""; S.bpage = 1; qsugShow(false); location.hash === "#buscar" ? vBuscar() : (location.hash = "buscar"); return; }
  const op = e.target.closest("[data-open]");
  if (op) {   // producto de la lista: pasa a Productos con esa búsqueda y abre el producto
    e.stopPropagation(); qsugShow(false); $("#q").blur();
    S.q = $("#q").value.trim(); S.cat = ""; S.bpage = 1; guardarBusq(S.q);
    if (location.hash !== "#buscar") { location.hash = "buscar"; setTimeout(() => openProduct(op.dataset.open), 60); } else { vBuscar(); openProduct(op.dataset.open); }
    return;
  }
  if (e.target.closest("a")) qsugShow(false);
});
document.addEventListener("click", e => { if (!e.target.closest(".hsearch")) qsugShow(false); });

/* ---------- MENÚ DE ABAJO (celular) ---------- */
function masShow(open) { const sh = $("#bsheet"); sh.hidden = !open; $("#bmore").setAttribute("aria-expanded", open); if (open) ovOpen("mas", () => masShow(false)); else ovDone("mas"); }
$("#bmore").onclick = e => { e.stopPropagation(); masShow($("#bsheet").hidden); };
document.addEventListener("click", e => { const sh = $("#bsheet"); if (!sh.hidden && (!e.target.closest("#bsheet") || e.target.closest("a, button"))) masShow(false); });

/* ---------- ESCANEAR CÓDIGO DE BARRAS (cámara o foto) ---------- */
const SCAN = { stream: null, timer: null, reader: null, ses: 0, parado: 0, leido: false, vigia: null };
function findEan(code) {
  const c = String(code || "").replace(/\D/g, ""); if (!c) return null;
  const k = c.replace(/^0+/, "");
  return BY[c] || BY[c.padStart(13, "0")] || BY[c.padStart(14, "0")] || D.products.find(p => p.id.replace(/^0+/, "") === k) || null;
}
let ZX_P = null;
const loadZX = () => ZX_P || (ZX_P = new Promise((ok, ko) => { const s = document.createElement("script"); s.src = "js/vendor/zxing.min.js"; s.onload = () => ok(window.ZXing); s.onerror = ko; document.head.appendChild(s); }));
/* lector de códigos de barras rápido para los navegadores que no traen uno (iPhone, Firefox):
   zxing-wasm (licencia MIT), en js/vendor/zxing-wasm/. Se baja solo la primera vez que escaneás. */
let ZW_P = null;
const loadZW = () => ZW_P || (ZW_P = new Promise((ok, ko) => {
  const s = document.createElement("script"); s.src = "js/vendor/zxing-wasm/zxing-reader.js";
  s.onload = async () => {
    try {
      await window.ZXingWASM.prepareZXingModule({ overrides: { locateFile: (path, pre) => (path.endsWith(".wasm") ? new URL("js/vendor/zxing-wasm/" + path, location.href).href : pre + path) }, fireImmediately: true });
      ok(window.ZXingWASM);
    } catch (e) { ZW_P = null; ko(e); }
  };
  s.onerror = () => { ZW_P = null; ko(); }; document.head.appendChild(s);
}));
const ZW_OPC = { formats: ["EAN13", "EAN8", "UPCA", "UPCE"], tryHarder: true, maxNumberOfSymbols: 1 };
async function leerZW(img) { const ZW = await loadZW(); const r = await ZW.readBarcodes(img, ZW_OPC); return r && r[0] && r[0].isValid !== false ? r[0].text : null; }
async function nativeDetector() {
  if (!("BarcodeDetector" in window)) return null;
  try { const f = await BarcodeDetector.getSupportedFormats(); const want = ["ean_13", "ean_8", "upc_a", "upc_e"].filter(x => f.includes(x)); return want.length ? new BarcodeDetector({ formats: want }) : null; } catch { return null; }
}
function scanStop() {
  SCAN.ses++;   // cualquier pedido de cámara que todavía esté en camino queda anulado
  clearInterval(SCAN.timer); SCAN.timer = null; clearTimeout(SCAN.vigia);
  if (SCAN.reader) { try { SCAN.reader.reset(); } catch {} SCAN.reader = null; }
  if (SCAN.stream) { SCAN.stream.getTracks().forEach(t => t.stop()); SCAN.stream = null; SCAN.parado = Date.now(); }
  const v = $("#scanv"); if (v) { try { v.pause(); } catch {} v.srcObject = null; }
}
async function scanFound(code) {
  if (SCAN.leido) return; SCAN.leido = true;   // el mismo código puede leerse dos veces seguidas: se usa una sola
  scanStop(); await loadProducts();
  const p = findEan(code);
  if (p) { closeModal(); openProduct(p.id); toast(`📷 Código ${code}`); return; }
  SCAN.leido = false;
  const m = $("#scanmsg"); if (m) m.innerHTML = `No encontramos el código <b>${esc(code)}</b> entre los productos comparados. Probá <a href="#buscar" data-close>buscarlo por nombre</a>.`;
}
async function modalScan() {
  openModal(`<h2>📷 Escanear código de barras</h2>
    <p class="sub">Apuntá la cámara al código de barras del producto (las rayitas con números) y te mostramos dónde está más barato.</p>
    <div class="scanbox"><video id="scanv" playsinline muted></video><div class="scanframe"></div></div>
    <p class="sub" id="scanmsg" role="status" style="min-height:22px;margin:8px 0">Pidiendo permiso para usar la cámara…</p>
    <div class="scanalt">
      <label class="btn sec sm" for="scanfile">🖼️ Usar una foto del código</label>
      <input id="scanfile" type="file" accept="image/*" capture="environment" hidden>
      <form id="scanman" class="scanman"><input class="inp" id="scancode" inputmode="numeric" pattern="[0-9]*" placeholder="o escribí los números" aria-label="Número del código de barras"><button class="btn sm">Buscar</button></form>
    </div>
    <p class="sub" style="margin:12px 0 0">🧾 ¿Tenés el ticket de tu última compra? <a href="#" data-ticket>Calculá cuánto te hubieras ahorrado</a></p>`);
  const v = $("#scanv"), msg = $("#scanmsg");
  $("#scanman").onsubmit = e => { e.preventDefault(); const c = $("#scancode").value.replace(/\D/g, ""); if (c.length >= 8) scanFound(c); else msg.textContent = "El código tiene que tener al menos 8 números."; };
  $("#scanfile").onchange = async e => {
    const f = e.target.files[0]; if (!f) return;
    scanStop(); msg.textContent = "Buscando el código en la foto…";
    try {
      const det = await nativeDetector();
      if (det) { const r = await det.detect(await createImageBitmap(f)); if (r[0]) return scanFound(r[0].rawValue); }
      let t = null;
      try { t = await leerZW(f); } catch {}
      if (t) return scanFound(t);
      const ZX = await loadZX(), url = URL.createObjectURL(f);   // respaldo: el lector anterior
      try { const r = await new ZX.BrowserMultiFormatReader().decodeFromImageUrl(url); return scanFound(r.getText()); } finally { URL.revokeObjectURL(url); }
    } catch { msg.textContent = "No encontramos un código de barras en la foto. Sacala de cerca, derecha y con buena luz, que se vean las rayitas y los números."; }
  };
  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) { msg.textContent = "Tu navegador no deja usar la cámara acá. Usá una foto del código o escribí los números."; return; }
  SCAN.leido = false;
  camara(v, msg);
}
/* abre la cámara para esta ventana del escáner. Cada apertura tiene su número (SCAN.ses): si mientras tanto
   se cerró o se abrió otra, la cámara que llega tarde se apaga enseguida y no queda tomada. */
async function camara(v, msg, intento = 0) {
  scanStop(); const ses = SCAN.ses;
  const vivo = () => ses === SCAN.ses && !$("#modal").hidden && $("#scanv") === v;
  // el celular tarda un momento en soltar la cámara anterior: si se cerró hace muy poco, se espera
  const espera = 450 - (Date.now() - SCAN.parado); if (espera > 0) await new Promise(r => setTimeout(r, espera));
  if (!vivo()) return;
  let st;
  try {
    st = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: "environment" }, width: { ideal: 1280 } }, audio: false });
  } catch (err) {
    if (!vivo()) return;
    if (err && (err.name === "NotReadableError" || err.name === "AbortError" || err.name === "TrackStartError") && intento < 2) { msg.textContent = "Abriendo la cámara…"; SCAN.parado = Date.now(); return camara(v, msg, intento + 1); }
    msg.textContent = err && err.name === "NotAllowedError" ? "No diste permiso para usar la cámara. Podés usar una foto del código o escribir los números." : "No pudimos abrir la cámara. Usá una foto del código o escribí los números.";
    return;
  }
  if (!vivo()) { st.getTracks().forEach(t => t.stop()); SCAN.parado = Date.now(); return; }
  SCAN.stream = st;
  try { v.srcObject = st; await v.play(); } catch {}
  if (!vivo()) return;
  msg.textContent = "Buscando un código…";
  // vigía: si en 2,5 segundos la imagen sigue negra (sin cuadros), se reabre la cámara sola (hasta 2 veces)
  const t0 = v.currentTime;
  SCAN.vigia = setTimeout(() => { if (vivo() && (!v.videoWidth || v.readyState < 2 || v.currentTime === t0) && intento < 2) { msg.textContent = "Reiniciando la cámara…"; camara(v, msg, intento + 1); } }, 2500);
  st.getVideoTracks().forEach(t => t.addEventListener("ended", () => { if (vivo() && intento < 2) camara(v, msg, intento + 1); }));
  try {
    const det = await nativeDetector();
    if (!vivo()) return;
    if (det) {
      SCAN.timer = setInterval(async () => { if (!vivo()) return; try { const r = await det.detect(v); if (r[0] && vivo()) scanFound(r[0].rawValue); } catch {} }, 250);
    } else if (await loadZW().then(() => true, () => false)) {
      if (!vivo()) return;
      // cuadro por cuadro de la cámara, ~6 veces por segundo, recortando el centro (donde está el recuadro)
      const cv = document.createElement("canvas"), cx = cv.getContext("2d", { willReadFrequently: true });
      let ocupado = false;
      SCAN.timer = setInterval(async () => {
        if (!vivo() || ocupado || !v.videoWidth) return; ocupado = true;
        try {
          const w = v.videoWidth, h = v.videoHeight, cw = Math.round(w * 0.8), ch = Math.round(h * 0.5);
          cv.width = cw; cv.height = ch; cx.drawImage(v, (w - cw) / 2, (h - ch) / 2, cw, ch, 0, 0, cw, ch);
          const t = await leerZW(cx.getImageData(0, 0, cw, ch));
          if (t && vivo()) scanFound(t);
        } catch {} finally { ocupado = false; }
      }, 160);
    } else {
      const ZX = await loadZX(); if (!vivo()) return;
      const hints = new Map(); hints.set(ZX.DecodeHintType.POSSIBLE_FORMATS, [ZX.BarcodeFormat.EAN_13, ZX.BarcodeFormat.EAN_8, ZX.BarcodeFormat.UPC_A, ZX.BarcodeFormat.UPC_E]);
      SCAN.reader = new ZX.BrowserMultiFormatReader(hints);
      SCAN.reader.decodeFromStream(st, v, r => { if (r && vivo()) scanFound(r.getText()); });
    }
  } catch { if (vivo()) msg.textContent = "No pudimos usar el lector. Usá una foto del código o escribí los números."; }
}
/* si salís de la página (otra app usó la cámara) y volvés con el escáner abierto, se reabre la cámara */
document.addEventListener("visibilitychange", () => {
  const v = $("#scanv"), msg = $("#scanmsg");
  if (document.visibilityState === "visible" && v && msg && !$("#modal").hidden && (!SCAN.stream || SCAN.stream.getVideoTracks().every(t => t.readyState === "ended"))) camara(v, msg);
});

/* =====================================================================
   AYUDAS PARA ENTENDER Y USAR LA PÁGINA
   ===================================================================== */

/* ---------- explicaciones con la "i" ---------- */
const GLOS = {
  kg: ["Precio por kilo o por litro", "Cuánto sale 1 kg o 1 litro de ese producto. Sirve para comparar paquetes de distinto tamaño: el más barato por kilo es el que más rinde."],
  sindto: ["Precio sin descuentos", "El precio de góndola, sin contar promos de bancos ni billeteras. Ya incluye las ofertas del propio comercio, si hay."],
  condto: ["Pagando con descuento", "Lo que te queda pagando hoy con un banco, billetera o tarjeta que tenga promo en ese comercio. Tenés que pagar como dice «Cómo pagar»."],
  oferta: ["Oferta del comercio", "Una rebaja que pone el propio súper (2x1, 2da al 70%, % de descuento). La tenés pagues como pagues."],
  bancaria: ["Descuento con medio de pago", "Una promo de un banco, billetera o tarjeta: solo vale si pagás con ese medio, ese día y de la forma indicada."],
  tope: ["Tope", "Lo máximo que te descuentan. Ejemplo: 25% con tope de $10.000 → en compras de más de $40.000 el descuento queda fijo en $10.000."],
  reintegro: ["Reintegro", "El descuento no se ve en la caja: te lo devuelven después en tu cuenta o en el resumen de la tarjeta (puede tardar días o semanas)."],
  online: ["Precio online", "El precio en la tienda web o la app del súper. No incluye el costo del envío."],
  local: ["Precio en el local", "El precio más común en las sucursales de la zona, según la base oficial de precios (SEPA). En tu sucursal puede variar un poco."],
};
const tip = k => GLOS[k] ? `<button type="button" class="ibtn" data-tip="${k}" aria-label="Qué significa: ${esc(GLOS[k][0])}">i</button>` : "";
function tipClose() { const t = $("#tippop"); if (t) { if (t.__fin) t.__fin(); t.remove(); } }
document.addEventListener("click", e => {
  const b = e.target.closest("[data-tip]");
  if (!b) { if (!e.target.closest("#tippop")) tipClose(); return; }
  e.preventDefault(); e.stopPropagation();
  const was = $("#tippop") && $("#tippop").dataset.k === b.dataset.tip; tipClose(); if (was) return;
  const [t, d] = GLOS[b.dataset.tip], r = b.getBoundingClientRect(), pop = document.createElement("div");
  pop.id = "tippop"; pop.className = "tippop"; pop.dataset.k = b.dataset.tip; pop.setAttribute("role", "tooltip");
  pop.innerHTML = `<b>${esc(t)}</b><p>${esc(d)}</p>`; document.body.appendChild(pop);
  if (window.FloatingUIDOM) { pop.__fin = flotar(b, pop, "bottom"); return; }   // sigue al botón aunque se mueva la pantalla
  const w = pop.offsetWidth, h = pop.offsetHeight;
  pop.style.left = Math.max(8, Math.min(innerWidth - w - 8, r.left + r.width / 2 - w / 2)) + "px";
  pop.style.top = (r.bottom + h + 12 < innerHeight ? r.bottom + 8 : Math.max(8, r.top - h - 8)) + "px";
}, true);
addEventListener("scroll", () => { if (!window.FloatingUIDOM) tipClose(); }, { passive: true, capture: true });

/* ---------- mis súper (los que la persona elige como habituales) ---------- */
let FAV = new Set(LS.get("cs_fav", []));
const saveFav = () => LS.set("cs_fav", [...FAV]);

/* ---------- bienvenida y configuración en 3 preguntas ---------- */
function modalBienvenida() {
  LS.set("cs_bienvenida", 1);
  openModal(`<div class="wel"><div class="wic">👋</div><h2>¡Bienvenido a ComparáSúper!</h2>
    <p>Compará el mismo producto en ${D.stores.length} supermercados y mayoristas, con sus ofertas y los descuentos de tu banco o billetera según el día.</p>
    <p class="sub">Si contestás 3 preguntas (menos de un minuto), te mostramos los precios y descuentos que te sirven a vos.</p>
    <div class="wbtns"><button class="btn" id="wconf">⚙️ Configurar en 3 preguntas</button><button class="btn sec" id="wtour">🧭 Ver la guía rápida</button><button class="linkbtn" data-close>Ahora no</button></div></div>`);
  $("#wconf").onclick = () => wizard(1);
  $("#wtour").onclick = () => { closeModal(); startTour(); };
}
async function wizard(paso) {
  const head = n => `<div class="wsteps">${[1, 2, 3].map(i => `<span class="${i === n ? "on" : i < n ? "ok" : ""}">${i < n ? "✓" : i}</span>`).join("")}</div>`;
  if (paso === 1) {
    const sel = new Set(MEDIOS || []);
    const grupos = Object.entries(P.tipos).filter(([k]) => k !== "general").map(([k, v]) => [v, P.medios.filter(m => m.tipo === k).sort((a, b) => a.name.localeCompare(b.name, "es"))]).filter(g => g[1].length);
    openModal(`${head(1)}<h2>1. ¿Con qué pagás?</h2><p class="sub">Marcá tus bancos, billeteras, tarjetas y clubes. Te mostramos los precios con <b>tus</b> descuentos. Si no sabés, seguí sin marcar nada.</p>
      ${grupos.map(([t, ms]) => `<h4 class="mg">${esc(t)}</h4><div class="wchips">${ms.map(m => `<label class="wchip"><input type="checkbox" value="${m.id}" ${sel.has(m.id) ? "checked" : ""}>${medioBadge(m)}<span>${esc(m.name)}</span></label>`).join("")}</div>`).join("")}
      <div class="mfoot"><button class="btn sec sm" data-close>Salir</button><button class="btn" id="wnext">Siguiente →</button></div>`);
    $("#wnext").onclick = () => { const v = $$("#modal input:checked").map(i => i.value); MEDIOS = v.length ? v : null; LS.set("cs_medios", MEDIOS); $("#mdot").hidden = !MEDIOS; wizard(2); };
  } else if (paso === 2) {
    const Z = await zonasProv(), { nombres } = Z;
    openModal(`${head(2)}<h2>2. ¿Por dónde comprás?</h2><p class="sub">Así te mostramos primero los comercios que tenés cerca. Queda guardado solo en este navegador.</p>
      <button class="btn" id="wgps" style="width:100%;justify-content:center;margin:6px 0 12px">📡 Usar mi ubicación actual</button>
      <label class="flbl" for="wzona">O elegí tu barrio o localidad${PROV ? ` de ${esc(provNombre(PROV))}` : ""}</label>
      <div class="zwrap"><input class="inp" id="wzona" placeholder="Ej.: ${esc(Z.ej)}…" autocomplete="off" value="${UBIC && !UBIC.gps && !UBIC.mapa ? esc(UBIC.label) : ""}"></div>
      <p class="sub" id="wmsg" style="min-height:20px;margin:8px 0 0">${UBIC ? `Ya tenés marcada: <b>${esc(UBIC.gps ? "tu ubicación actual" : UBIC.label)}</b>.` : ""}</p>
      <div class="mfoot"><button class="btn sec sm" id="wback">← Atrás</button><button class="btn" id="wnext">Siguiente →</button></div>`);
    zonaPicker($("#wzona"), nombres);
    const fijar = u => { UBIC = u; LS.set(PK("cs_ubic"), UBIC); loadSuc().then(() => { calcCerca(); updUbic(); ubicCambio(false); }); };
    $("#wback").onclick = () => wizard(1);
    $("#wgps").onclick = () => {
      $("#wmsg").textContent = "Buscando tu ubicación… (puede tardar unos segundos)";
      pedirUbicacion(pos => { if (!Z.enProv(pos.coords.latitude, pos.coords.longitude)) { $("#wmsg").innerHTML = `Tu ubicación actual está fuera de <b>${esc(provNombre(PROV))}</b>. Elegí una localidad de la lista (o cambiá de provincia con el botón 🗺️ de arriba).`; return; } fijar({ lat: pos.coords.latitude, lon: pos.coords.longitude, label: "tu ubicación actual", km: 3, gps: true }); $("#wmsg").innerHTML = `✓ Listo: ${Object.keys(CERCA || {}).length} comercios a menos de 3 km.`; },
        code => { $("#wmsg").textContent = geoError(code) + " También podés escribir tu barrio o localidad."; });
    };
    $("#wnext").onclick = () => {
      const v = $("#wzona").value.trim();
      if (v) {
        const k = Z.buscar(v);
        if (!k) { $("#wmsg").textContent = `«${v}» no es una localidad de ${provNombre(PROV) || "tu provincia"} con comercios cargados. Elegila de la lista o dejalo vacío.`; return; }
        fijar({ ...Z.centro(k), label: k, km: 3 });
      }
      wizard(3);
    };
  } else {
    const cerca = CERCA ? Object.keys(CERCA) : [];
    const lista = [...D.stores].sort((a, b) => (cerca.includes(b.id) - cerca.includes(a.id)) || a.name.localeCompare(b.name, "es"));
    openModal(`${head(3)}<h2>3. ¿En qué súper comprás seguido?</h2><p class="sub">Los marcamos con ⭐ y podés filtrar por ellos. Igual te vamos a avisar si en otro lado está más barato.</p>
      <div class="wchips st">${lista.map(st => `<label class="wchip"><input type="checkbox" value="${st.id}" ${FAV.has(st.id) ? "checked" : ""}>${badge("s", st.id, st.name, st.color, st.sigla)}<span>${esc(st.name)}${CERCA && CERCA[st.id] ? `<small>${kmTxt(CERCA[st.id].d)}</small>` : ""}</span></label>`).join("")}</div>
      <div class="mfoot"><button class="btn sec sm" id="wback">← Atrás</button><button class="btn" id="wfin">Terminar ✓</button></div>`);
    $("#wback").onclick = () => wizard(2);
    $("#wfin").onclick = () => {
      FAV = new Set($$("#modal input:checked").map(i => i.value)); saveFav();
      openModal(`<div class="wel"><div class="wic">🎉</div><h2>¡Listo!</h2><p>La página ya muestra ${MEDIOS ? "tus descuentos" : "todos los descuentos"}${UBIC ? ", los comercios cerca tuyo" : ""}${FAV.size ? " y tus súper con ⭐" : ""}. Lo podés cambiar cuando quieras desde «Mis medios» y «📍 ubicación».</p>
        <div class="wbtns"><button class="btn" id="wtour">🧭 Ver la guía rápida</button><button class="btn sec" data-close>Empezar a comparar</button></div></div>`);
      $("#wtour").onclick = () => { closeModal(); startTour(); };
      route();
    };
  }
}

/* ---------- guía rápida (globitos que señalan cada parte) ---------- */
const TOUR = [
  ["#q", "🔎 Buscá cualquier producto", "Escribí lo que necesitás (leche, yerba, aceite…). Aunque te equivoques al escribir, lo encontramos."],
  ["#hform .qscan", "📷 Escaneá el código de barras", "¿Estás en el súper? Apuntá la cámara al código del producto y te decimos dónde está más barato.", "desk"],
  [".bnav .bscan", "📷 Escaneá el código de barras", "¿Estás en el súper? Apuntá la cámara al código del producto y te decimos dónde está más barato.", "mob"],
  ["#mbtn", "💳 Mis medios de pago", "Marcá tus bancos y billeteras: te mostramos el precio final con tus descuentos y cómo pagar."],
  ["#pbtn", "🗺️ Tu provincia", "Ves los precios y descuentos de esta provincia. Tocá acá para cambiarla."],
  ["#uloc", "📍 Tu ubicación", "Te mostramos los comercios que tenés cerca y sus promos."],
  [".hbtn.cart", "🛒 Mi carrito", "Sumá productos con el +. Después lo mandás por WhatsApp o lo usás en el súper para ir tachando."],
  [".tabs a[data-v=conviene]", "📊 ¿Dónde conviene mi compra?", "Te dice en qué súper, qué día y con qué medio de pago sale menos toda tu compra.", "desk"],
  ["#bmore", "☰ Más opciones", "Acá están Descuentos por día, ¿Dónde conviene?, tu carrito y más.", "mob"],
  ["#hsize", "Aa Tamaño de letra", "Si te cuesta leer, agrandá la letra de toda la página."],
  ["#fmas", "🙋 Ayuda", "Tocá acá para ver esta guía otra vez, dejarnos una sugerencia o hablar con el asistente.", "mob"],
  [".fab.guia", "❓ Guía rápida", "Si te perdés, tocá este botón y te volvemos a mostrar esta guía."],
  ["#botbtn", "🤖 Asistente", "¿Dudas? Preguntale al asistente: precios, descuentos del día o cómo usar la página."],
];
let TOURI = 0;
/* guía rápida con Driver.js (licencia MIT); si no carga, la guía de siempre */
let TOURD = null;
async function startTour() {
  closeModal(); if (!$("#drawer").hidden) closeDrawer();
  let mk = null;
  try { mk = await lib("js/vendor/driver/driver.js", "js/vendor/driver/driver.css", () => window.driver && window.driver.js && window.driver.js.driver); } catch {}
  if (!mk) return tourViejo();
  if (TOURD) TOURD.destroy();
  const steps = tourSteps();
  TOURD = mk({
    showProgress: true, progressText: "{{current}} de {{total}}", nextBtnText: "Siguiente →", prevBtnText: "← Atrás", doneBtnText: "¡Listo!",
    allowClose: true, overlayOpacity: 0.55, stagePadding: 6, stageRadius: 12, popoverClass: "cs-tour", smoothScroll: true,
    steps: steps.map(([el, title, description]) => ({ element: el, popover: { title, description } })),
    onDestroyed: () => { TOURD = null; ovDone("tour"); LS.set("cs_tour", 1); toast("¡Listo! La guía la podés volver a ver con el botón de ayuda, abajo a la derecha"); },
  });
  ovOpen("tour", () => TOURD && TOURD.destroy());
  TOURD.drive();
}
function tourViejo() { closeModal(); closeDrawer && !$("#drawer").hidden && closeDrawer(); TOURI = 0; if (!$("#tour")) document.body.insertAdjacentHTML("beforeend", `<div id="tour" class="tour" role="dialog" aria-live="polite"><div class="tspot"></div><div class="tbub"></div></div>`); ovOpen("tour", () => tourGo(1e3)); tourGo(0); }
function tourSteps() { const mob = innerWidth <= 640; return TOUR.filter(s => !s[3] || (s[3] === "mob") === mob).filter(s => { const el = $(s[0]); return el && el.getBoundingClientRect().width > 0; }); }
function tourGo(i) {
  const steps = tourSteps(); if (i < 0) i = 0;
  if (i >= steps.length) { if (!$("#tour")) return; $("#tour").remove(); ovDone("tour"); LS.set("cs_tour", 1); toast("¡Listo! La guía la podés volver a ver con el botón ❓ de abajo a la derecha"); return; }
  TOURI = i;
  const [sel, t, d] = steps[i], el = $(sel);
  el.scrollIntoView({ block: "nearest" });
  const r = el.getBoundingClientRect(), sp = $("#tour .tspot"), bub = $("#tour .tbub"), pad = 6;
  Object.assign(sp.style, { left: r.left - pad + "px", top: r.top - pad + "px", width: r.width + pad * 2 + "px", height: r.height + pad * 2 + "px" });
  bub.innerHTML = `<b>${t}</b><p>${d}</p><div class="tnav"><span class="sub">${i + 1} de ${steps.length}</span><button class="linkbtn" id="tskip">Saltar</button>${i ? '<button class="btn sec sm" id="tprev">←</button>' : ""}<button class="btn sm" id="tnext">${i === steps.length - 1 ? "Terminar" : "Siguiente →"}</button></div>`;
  const bw = Math.min(320, innerWidth - 24); bub.style.width = bw + "px";
  bub.style.left = Math.max(12, Math.min(innerWidth - bw - 12, r.left + r.width / 2 - bw / 2)) + "px";
  const below = r.bottom + 14 + bub.offsetHeight < innerHeight;
  bub.style.top = (below ? r.bottom + 14 : Math.max(12, r.top - bub.offsetHeight - 14)) + "px";
  $("#tnext").onclick = () => tourGo(i + 1); $("#tskip").onclick = () => tourGo(1e3); const pv = $("#tprev"); if (pv) pv.onclick = () => tourGo(i - 1);
  $("#tnext").focus();
}
addEventListener("resize", () => { if ($("#tour")) tourGo(TOURI); });
document.addEventListener("keydown", e => { if ($("#tour") && e.key === "Escape") tourGo(1e3); });

/* ---------- tamaño de letra ---------- */
const ZOOMS = [1, 1.12, 1.25];
function applyZoom(i) {
  const max = innerWidth <= 640 ? 1 : 2; i = Math.min(i, max);
  document.documentElement.style.zoom = ZOOMS[i] === 1 ? "" : ZOOMS[i];
  const b = $("#hsize"); if (b) { b.textContent = ["Aa", "Aa+", "Aa++"][i]; b.setAttribute("aria-label", `Tamaño de letra: ${["normal", "grande", "muy grande"][i]}. Tocá para cambiar`); b.classList.toggle("on", i > 0); }
}
let ZI = LS.get("cs_zoom", 0); applyZoom(ZI);
$("#hsize").onclick = () => { const max = innerWidth <= 640 ? 1 : 2; ZI = ZI >= max ? 0 : ZI + 1; LS.set("cs_zoom", ZI); applyZoom(ZI); toast(["Letra normal", "Letra grande", "Letra muy grande"][ZI]); };

/* ---------- MODO EN EL SÚPER: lista para ir tachando ---------- */
let TACH = LS.get("cs_tach", {}), WAKE = null;
async function despierto(on) {
  try { if (on && "wakeLock" in navigator && !WAKE) { WAKE = await navigator.wakeLock.request("screen"); WAKE.addEventListener("release", () => (WAKE = null)); } if (!on && WAKE) { await WAKE.release(); WAKE = null; } } catch {}
}
document.addEventListener("visibilitychange", () => { if (document.visibilityState === "visible" && location.hash === "#super") despierto(true); });
function vSuper() {
  setTab("carrito");
  const items = listItems();
  if (!items.length) { location.hash = "carrito"; return; }
  const g = {};
  for (const { p, qty } of items) {
    const o = PREF[p.id] && offerAt(p, PREF[p.id]), b = best(p), sid = o ? o.s : b.o.s, oo = o || b.o;
    const v = Math.min(...allChans(oo).map(c => lineCost(oo, c, qty).total));
    (g[sid] = g[sid] || []).push({ p, qty, v });
  }
  const tot = items.length, hechos = items.filter(i => TACH[i.p.id]).length;
  const falta = Object.values(g).flat().filter(x => !TACH[x.p.id]).reduce((a, x) => a + x.v, 0);
  $("#view").innerHTML = `<div class="wrap super"><div class="shead"><div><h1>🛍️ En el súper</h1><div class="sbar"><span style="width:${Math.round(hechos / tot * 100)}%"></span></div>
      <p class="sub"><b>${hechos} de ${tot}</b> en el chango${hechos < tot ? ` · falta aprox. <b>${money(falta)}</b>` : " · ¡ya tenés todo! 🎉"}</p></div>
      <div class="sbtns"><button class="btn sec sm" id="sreset">Destachar todo</button><a class="btn sm" href="#carrito">Salir</a></div></div>
    ${Object.entries(g).map(([sid, xs]) => `<section class="sgrp"><h2>${storeChip(sid)}</h2>${xs.sort((a, b) => (TACH[a.p.id] ? 1 : 0) - (TACH[b.p.id] ? 1 : 0)).map(({ p, qty, v }) => `
      <label class="sitem${TACH[p.id] ? " done" : ""}" style="view-transition-name:t${p.id}"><input type="checkbox" data-tach="${p.id}" ${TACH[p.id] ? "checked" : ""}>${prodImg(p, "si")}
        <span class="sn"><b>${qty} × ${esc(p.name)}</b><span class="sub">${money(v)}${qtyHint(p, qty, sid) ? " · 🏷️ " + esc(qtyHint(p, qty, sid)) : ""}</span></span></label>`).join("")}</section>`).join("")}
    <p class="sub" style="text-align:center;margin:18px 0">La pantalla queda prendida mientras estás en esta lista. Los precios son de referencia: confirmalos en la góndola.</p></div>`;
  $$("[data-tach]").forEach(c => c.onchange = () => { if (c.checked) TACH[c.dataset.tach] = 1; else delete TACH[c.dataset.tach]; LS.set("cs_tach", TACH); if (navigator.vibrate) navigator.vibrate(15); suave(vSuper); });
  $("#sreset").onclick = () => { TACH = {}; LS.set("cs_tach", TACH); vSuper(); };
  despierto(true);
}
addEventListener("hashchange", () => { if (location.hash !== "#super") despierto(false); });

/* ---------- calculadora de topes ---------- */
document.addEventListener("input", e => {
  const inp = e.target.closest(".tcalc input"); if (!inp) return;
  const box = inp.closest(".tcalc"), pct = +box.dataset.pct, tope = +box.dataset.tope || Infinity, g = +inp.value.replace(/\D/g, "") || 0, out = box.querySelector(".tres");
  if (!g) { out.textContent = ""; return; }
  const d = Math.min(g * pct / 100, tope);
  out.innerHTML = `Te descuentan <b>${money(d)}</b> y pagás <b>${money(g - d)}</b>${d >= tope ? ` <span class="tag r sm">llegaste al tope: lo que gastes de más no tiene descuento</span>` : ""}`;
});

/* ---------- recordatorio en el calendario ---------- */
const ICSD = ["SU", "MO", "TU", "WE", "TH", "FR", "SA"];
function proxDia(dias) { const t = new Date(Date.now() - 3 * 3600e3); for (let k = 0; k < 8; k++) { const d = new Date(t.getTime() + k * 864e5); if (dias.includes(d.getUTCDay())) return d; } return t; }
const ymd = d => d.toISOString().slice(0, 10).replace(/-/g, "");
function modalAgendar(id) {
  const pr = P.promos.find(x => x.id === id); if (!pr) return;
  const d0 = proxDia(pr.dias), d1 = new Date(d0.getTime() + 864e5), hasta = pr.hasta.replace(/-/g, "");
  const tit = `${pr.pct ? pr.pct + "% " : ""}${medioName(pr)} en ${pr.stores.map(s => ST[s] ? ST[s].name : s).join(", ")}`;
  const desc = `${pr.pct ? pr.pct + "% de descuento" : pr.cuotas + " cuotas"} · ${topeTxt(pr)}. Cómo pagar: ${pagoTxt(pr)}. Vigente hasta el ${pr.hasta.split("-").reverse().join("/")}. Más info: ${(CFG.sitio_url || location.href.split("#")[0])}#pagos`;
  const rrule = `RRULE:FREQ=WEEKLY;BYDAY=${pr.dias.map(i => ICSD[i]).join(",")};UNTIL=${hasta}`;
  const gurl = `https://calendar.google.com/calendar/render?action=TEMPLATE&text=${encodeURIComponent("🛒 " + tit)}&dates=${ymd(d0)}/${ymd(d1)}&details=${encodeURIComponent(desc)}&recur=${encodeURIComponent(rrule)}`;
  const ics = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//ComparaSuper//ES", "BEGIN:VEVENT", `UID:${pr.id}-${Date.now()}@comparasuper`, `DTSTAMP:${new Date().toISOString().replace(/[-:]/g, "").slice(0, 15)}Z`,
    `DTSTART;VALUE=DATE:${ymd(d0)}`, `DTEND;VALUE=DATE:${ymd(d1)}`, rrule, `SUMMARY:🛒 ${tit.replace(/[,;]/g, " ")}`, `DESCRIPTION:${desc.replace(/[,;]/g, " ").replace(/\n/g, "\\n")}`,
    "BEGIN:VALARM", "TRIGGER:-PT15H", "ACTION:DISPLAY", "DESCRIPTION:Hoy hay descuento en el súper", "END:VALARM", "END:VEVENT", "END:VCALENDAR"].join("\r\n");
  const url = URL.createObjectURL(new Blob([ics], { type: "text/calendar" }));
  openModal(`<h2>📅 Agendar este descuento</h2><p><b>${esc(tit)}</b><br><span class="sub">Todos los ${pr.dias.length === 7 ? "días" : pr.dias.map(d => DIAS[d].toLowerCase()).join(", ")} hasta el ${pr.hasta.split("-").reverse().join("/")}, con un aviso la noche anterior.</span></p>
    <div class="sharebtns"><a class="btn" href="${gurl}" target="_blank" rel="noopener">Google Calendar</a><a class="btn sec" href="${url}" download="descuento-${pr.id}.ics">Calendario del celular (iPhone u otros)</a></div>
    <p class="sub" style="margin-top:10px">En el celular, abrí el archivo que se descarga y tocá «Agregar».</p>`);
}

/* ---------- listas guardadas ---------- */
let LISTAS = LS.get("cs_listas", {});
const saveListas = () => LS.set("cs_listas", LISTAS);
function listasBox() {
  const ns = Object.keys(LISTAS).sort((a, b) => (LISTAS[b].f || "").localeCompare(LISTAS[a].f || ""));
  return `<section class="box listas"><h3>💾 Mis listas guardadas</h3>
    <p class="sub" style="margin:-4px 0 10px">Guardá este carrito con un nombre (por ejemplo «Compra del mes») para volver a cargarlo con un toque.</p>
    <form class="lsave" id="lsave"><input class="inp" id="lname" maxlength="40" placeholder="Nombre de la lista" aria-label="Nombre de la lista"><button class="btn sm">Guardar</button></form>
    ${ns.length ? `<div class="lls">${ns.map(n => { const l = LISTAS[n], k = Object.keys(l.items).length; return `<div class="ll"><div><b>${esc(n)}</b><span class="sub">${k} productos · ${esc((l.f || "").split("-").reverse().join("/"))}</span></div>
      <button class="btn sec sm" data-lcarga="${esc(n)}" title="Reemplaza tu carrito por esta lista">Cargar</button><button class="btn sec sm" data-lsuma="${esc(n)}" title="Suma la lista a lo que ya tenés">Sumar</button><button class="rm" data-lborra="${esc(n)}" aria-label="Borrar la lista ${esc(n)}">✕</button></div>`; }).join("")}</div>` : '<p class="sub">Todavía no guardaste ninguna lista.</p>'}</section>`;
}
function bindListas() {
  const f = $("#lsave"); if (!f) return;
  f.onsubmit = e => { e.preventDefault(); const n = $("#lname").value.trim(); if (!n) { $("#lname").focus(); return; } LISTAS[n] = { items: { ...LISTA }, pref: { ...PREF }, f: new Date(Date.now() - 3 * 3600e3).toISOString().slice(0, 10) }; saveListas(); toast(`Lista «${n}» guardada`); route(); };
  const carga = (n, sumar) => { const l = LISTAS[n]; if (!l) return; if (!sumar) { for (const k of Object.keys(LISTA)) delete LISTA[k]; for (const k of Object.keys(PREF)) delete PREF[k]; }
    for (const [id, q] of Object.entries(l.items)) if (BY[id]) LISTA[id] = (sumar ? LISTA[id] || 0 : 0) + q;
    for (const [id, s] of Object.entries(l.pref || {})) if (BY[id] && !PREF[id]) PREF[id] = s;
    saveLista(); savePref(); toast(sumar ? `Sumaste «${n}» al carrito` : `Cargaste «${n}»`); route(); };
  $$("[data-lcarga]").forEach(b => b.onclick = () => carga(b.dataset.lcarga, false));
  $$("[data-lsuma]").forEach(b => b.onclick = () => carga(b.dataset.lsuma, true));
  $$("[data-lborra]").forEach(b => b.onclick = () => { delete LISTAS[b.dataset.lborra]; saveListas(); route(); });
}

/* ---------- comparar productos lado a lado ---------- */
let CMP = LS.get(PK("cs_cmp"), []).filter(Boolean);
function cmpToggle(id) {
  if (CMP.includes(id)) CMP = CMP.filter(x => x !== id);
  else { if (CMP.length >= 4) { toast("Podés comparar hasta 4 productos"); return; } CMP.push(id); }
  LS.set(PK("cs_cmp"), CMP); cmpBar(); toast(CMP.includes(id) ? `Para comparar: ${CMP.length} ${CMP.length === 1 ? "producto" : "productos"}` : "Sacado de la comparación");
}
function cmpBar() {
  let b = $("#cmpbar");
  if (!CMP.length || location.hash === "#comparar") { if (b) b.remove(); return; }
  if (!b) { document.body.insertAdjacentHTML("beforeend", `<div id="cmpbar" class="cmpbar"></div>`); b = $("#cmpbar"); }
  b.innerHTML = `<a href="#comparar" class="btn sm">⚖️ Comparar (${CMP.length})</a><button class="x" id="cmpx" aria-label="Vaciar la comparación">✕</button>`;
  $("#cmpx").onclick = () => { CMP = []; LS.set(PK("cs_cmp"), CMP); cmpBar(); };
}
function vComparar() {
  setTab("");
  const ps = CMP.map(id => BY[id]).filter(Boolean);
  if (!ps.length) { $("#view").innerHTML = `<div class="wrap"><section class="blk first"><h1>⚖️ Comparar productos</h1><div class="cv"><div class="empty" style="padding:40px">Abrí un producto y tocá <b>«⚖️ Comparar»</b> (en «⋯ Más opciones») para sumarlo acá (hasta 4).<br><br><a class="btn" href="#buscar">Buscar productos</a></div>${ayudaVacia("cmp")}</div></section></div>`; cmpBar(); return; }
  const rows = ps.map(p => { const b = best(p); let bp = null; for (const o of p.offers) for (const c of chans(o)) { const pay = payDiscount(o.s, HOY, c, price1(o, c)); const v = price1(o, c) - pay.disc; if (pay.promo && (!bp || v < bp.v)) bp = { o, c, v, pay }; } return { p, b, bp, u: perUnit(p, b.v), of: p.offers.find(o => o.promo || o.promoo) }; });
  const minU = Math.min(...rows.filter(r => r.u).map(r => r.u)), minV = Math.min(...rows.map(r => r.b.v));
  $("#view").innerHTML = `<div class="wrap"><section class="blk first"><div class="blk-h"><h1>⚖️ Comparar productos</h1><button class="btn sec sm" id="cmpclr">Vaciar</button></div>
    <div class="cmpgrid" style="--n:${rows.length}">${rows.map(({ p, b, bp, u, of }) => `<article class="cmpc${u && u === minU ? " gana" : ""}">
      <button class="rm" data-cmpq="${p.id}" aria-label="Sacar de la comparación">✕</button>
      <div data-open="${p.id}" role="button" tabindex="0">${prodImg(p, "ph")}<h3>${esc(p.name)}</h3></div>
      <dl><dt>Más barato ${tip("sindto")}</dt><dd><b class="${b.v === minV ? "okc" : ""}">${money(b.v)}</b><br>${where(b)}</dd>
      <dt>Por kilo o litro ${tip("kg")}</dt><dd>${u ? `<b class="${u === minU ? "okc" : ""}">${unitTxt(p, b.v)}</b>${u === minU ? ' <span class="tag g sm">rinde más</span>' : ""}` : "—"}</dd>
      <dt>Pagando hoy ${tip("condto")}</dt><dd>${bp && bp.v < b.v ? `${money(bp.v)}<br><span class="sub">en ${esc(ST[bp.o.s].name)} con ${esc(medioName(bp.pay.promo))}</span>` : "—"}</dd>
      <dt>Oferta ${tip("oferta")}</dt><dd>${of ? esc((of.promo || of.promoo).txt) + ` <span class="sub">(${esc(ST[of.s].name)})</span>` : "—"}</dd>
      <dt>Comercios</dt><dd>${p.offers.length}</dd></dl>
      <div class="cmpa">${addCtl(p.id)}</div></article>`).join("")}</div>
    ${rows.length < 4 ? `<p class="sub" style="margin-top:14px">Podés sumar ${4 - rows.length} más desde la ficha de cualquier producto.</p>` : ""}</section></div>`;
  $("#cmpclr").onclick = () => { CMP = []; LS.set(PK("cs_cmp"), CMP); vComparar(); };
  $$("[data-cmpq]").forEach(b => b.onclick = () => { CMP = CMP.filter(x => x !== b.dataset.cmpq); LS.set(PK("cs_cmp"), CMP); vComparar(); });
  cmpBar();
}

/* ---------- buscar hablando ---------- */
(() => {
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition, f = $("#hform");
  if (!SR || !f) return;
  f.classList.add("conmic");
  f.insertAdjacentHTML("beforeend", `<button class="qmic" type="button" id="qmic" title="Buscar hablando" aria-label="Buscar hablando"><svg viewBox="0 0 24 24" aria-hidden="true"><rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5 11a7 7 0 0 0 14 0M12 18v3"/></svg></button>`);
  let rec = null;
  $("#qmic").onclick = () => {
    if (rec) { rec.stop(); return; }
    rec = new SR(); rec.lang = "es-AR"; rec.interimResults = true; rec.maxAlternatives = 1;
    $("#qmic").classList.add("on"); toast("🎤 Te escucho… decí qué producto buscás");
    rec.onresult = e => { const t = [...e.results].map(r => r[0].transcript).join(" "); $("#q").value = t; if (e.results[e.results.length - 1].isFinal) { $("#hform").requestSubmit(); } };
    rec.onerror = e => toast(e.error === "not-allowed" ? "No diste permiso para usar el micrófono" : "No te escuché bien, probá de nuevo");
    rec.onend = () => { rec = null; $("#qmic").classList.remove("on"); };
    rec.start();
  };
})();

/* ---------- instalar como app ---------- */
let INSTALL = null;
addEventListener("beforeinstallprompt", e => { e.preventDefault(); INSTALL = e; $$(".inst").forEach(x => (x.hidden = false)); });
addEventListener("appinstalled", () => { INSTALL = null; $$(".inst").forEach(x => (x.hidden = true)); toast("¡Listo! ComparáSúper quedó instalada"); });
const yaInstalada = () => matchMedia("(display-mode: standalone)").matches || navigator.standalone;
async function instalar() {
  if (INSTALL) { INSTALL.prompt(); await INSTALL.userChoice; INSTALL = null; return; }
  const ios = /iphone|ipad|ipod/i.test(navigator.userAgent);
  openModal(`<h2>📲 Instalar ComparáSúper</h2><p>Queda un ícono en la pantalla de tu celular, abre más rápido y podés ver tu carrito aunque no tengas señal en el súper.</p>
    ${ios ? `<ol class="steps"><li>Abrí esta página en <b>Safari</b>.</li><li>Tocá el botón <b>Compartir</b> (el cuadrado con la flecha hacia arriba).</li><li>Elegí <b>«Agregar a inicio»</b> y tocá <b>Agregar</b>.</li></ol>`
      : `<ol class="steps"><li>Abrí el menú del navegador (los tres puntitos <b>⋮</b>).</li><li>Tocá <b>«Instalar app»</b> o <b>«Agregar a la pantalla principal»</b>.</li><li>Confirmá con <b>Instalar</b>.</li></ol>`}
    <div class="mfoot"><span></span><button class="btn" data-close>Entendido</button></div>`);
}
document.addEventListener("click", e => { const mp = e.target.closest("a[data-mapa]"); if (mp) { mp.href = mapaUrl(mp.dataset.mapa); evento("mapa-" + mp.dataset.mapa, "Cómo llegar a " + mp.dataset.mapa); } }, true);
document.addEventListener("click", e => { if (e.target.closest("[data-instalar]")) { e.preventDefault(); instalar(); } });
if ("serviceWorker" in navigator && (location.protocol === "https:" || location.hostname === "localhost")) addEventListener("load", () => navigator.serviceWorker.register("sw.js").catch(() => {}));

/* ---------- ASISTENTE VIRTUAL ----------
   Funciona dentro de la página, sin servicios externos: entiende preguntas sobre precios, descuentos,
   comercios y cómo usar cada sección, y responde con los datos cargados. */
const BOT = { msgs: [] };
const DIAS_N = ["domingo", "lunes", "martes", "miercoles", "jueves", "viernes", "sabado"];
const STOP = new Set("donde esta mas barato barata baratos baratas precio precios cuanto cuesta cuestan sale salen vale valen conviene comprar compro el la los las un una unos unas de del en que para por con y o me mi hay a al es son busco buscar quiero necesito super supermercado hoy ahora".split(" "));
const BOT_TEMAS = [
  [/carrit|lista/, () => `<b>🛒 Mi carrito</b>: tocá el <b>+</b> de cualquier producto para sumarlo; si ya está, aparecen <b>− cantidad +</b>. En la ficha del producto, con <b>«Ver más supermercados»</b> podés elegir de qué súper agregarlo. Desde el carrito lo compartís por WhatsApp o correo. <a href="#carrito">Ir a mi carrito</a>`],
  [/conviene|calcul|compar.*compra|mezcl/, () => `<b>📊 ¿Dónde conviene mi compra?</b>: cargá productos (o traé tu carrito) y te muestra cuánto sale todo en un comercio, mezclando dos, y el mejor día con tus medios de pago. <a href="#conviene">Abrir</a>`],
  [/medio|tarjeta mia|mis tarjetas|mis bancos/, () => `<b>💳 Mis medios</b>: arriba a la derecha marcás tus bancos, billeteras y tarjetas, y te mostramos solo los descuentos que podés usar. <button class="linkbtn" data-medios>Elegir mis medios</button>`],
  [/ubicaci|cerca|barrio|localidad|gps/, () => `<b>📍 Ubicación</b>: tocá «Elegí tu ubicación» debajo del logo. Podés usar el GPS o escribir tu barrio, y te mostramos los comercios cercanos y sus promos. <button class="linkbtn" data-ubic>Marcar mi ubicación</button>`],
  [/aviso|alerta|baje|bajo de precio|avisame/, () => `<b>🔔 Avisos</b>: en la ficha de un producto tocá «Avisarme si baja». Cuando baje, aparece una campanita arriba con el número de productos que bajaron.`],
  [/sugerenc|reclam|idea|mejora/, () => `<b>💬 Sugerencias</b>: tocá el globo de abajo a la derecha o <a href="#sugerencias">entrá acá</a>. Se publican después de revisarlas y todos pueden votarlas.`],
  [/oscuro|claro|tema|color de la pagina/, () => `Arriba tenés el botón <b>Modo Oscuro / Modo Claro</b> para cambiar los colores.`],
  [/vista|columna|lista de productos|iconos/, () => `En <a href="#buscar">Productos</a> el botón <b>«Ver»</b> cambia entre íconos grandes (3 columnas), íconos chicos (5 columnas) o lista de 50.`],
  [/de donde|datos|fuente|actualiz|confiable|sepa|oficial/, () => `Los precios de las sucursales vienen de la <b>base oficial SEPA</b> que informan las cadenas todos los días; los online, de la tienda web de cada cadena. Los descuentos los relevamos de páginas oficiales y notas, y cada uno dice su fuente. Se actualiza todos los días. Datos del ${esc(D.updated.split("-").reverse().join("/"))}.`],
  [/envio|online|delivery|a domicilio/, () => `Mostramos el precio <b>online</b> de cada cadena aparte del de la sucursal. El envío se suma en «¿Dónde conviene?». Si una tienda online tiene todos tus productos, te armamos el carrito allá con un botón.`],
  [/oferta|2x1|3x2|2da|segunda unidad/, () => `En <a href="#ofertas">Ofertas</a> están todas las ofertas vigentes de los comercios, con un banner de las destacadas. Las que van por cantidad (2x1, 2da al 70%) te avisan cuántas unidades llevar cuando sumás al carrito.`],
  [/jubilad|anses|pension/, () => { const ps = P.promos.filter(pr => (pr.requiere || []).includes("jubilados") || pr.medio === "jubilados"); return `Para jubilados hay ${ps.length} descuentos cargados. Marcá «Jubilados y pensionados» en <button class="linkbtn" data-medios>Mis medios</button> para verlos en los precios.`; }],
];
function botPromos(q) {
  const n = nrm(q);
  let day = DIAS_N.findIndex(d => n.includes(d)); if (/manana/.test(n)) day = (HOY + 1) % 7; if (day < 0 && /hoy/.test(n)) day = HOY;
  const w = t => new RegExp("(^|[^a-z0-9])" + t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "([^a-z0-9]|$)").test(n);
  const meds = P.medios.filter(m => m.id !== "todos" && m.id !== "credito" && (w(nrm(m.name).replace(/^(banco|tarjeta) /, "").replace(/ \(.*\)$/, "")) || (m.id.length > 3 && w(m.id))));
  const sts = D.stores.filter(st => st.id === "dia" ? /(en|del|de|al) dia([^a-z]|$)|supermercados? dia|dia%/.test(n) : (w(nrm(st.name)) || w(st.id)));
  if (day < 0 && !meds.length && !sts.length) day = HOY;
  let ps = P.promos.filter(pr => pr.pct > 0 && (day < 0 || pr.dias.includes(day)) && (!meds.length || meds.some(m => pr.medio === m.id || (pr.bancos || []).includes(m.id))) && (!sts.length || sts.some(st => pr.stores.includes(st.id))));
  ps = ps.sort((a, b) => b.pct - a.pct);
  const tit = [day >= 0 ? (day === HOY ? "hoy " + DIAS[day].toLowerCase() : "el " + DIAS[day].toLowerCase()) : "esta semana", meds.length ? "con " + meds.map(m => m.name).join(" o ") : "", sts.length ? "en " + sts.map(x => x.name).join(" o ") : ""].filter(Boolean).join(" ");
  if (!ps.length) return `No encontré descuentos ${esc(tit)}. Mirá la semana completa en <a href="#pagos">Descuentos por día</a>.`;
  return `Descuentos ${esc(tit)} (${ps.length}):<ul>${ps.slice(0, 6).map(pr => `<li><b>${pr.pct}%</b> con ${esc(medioName(pr))} en ${esc(pr.stores.map(x => ST[x] ? ST[x].name : x).join(", "))}${day < 0 ? ` · ${pr.dias.length === 7 ? "todos los días" : pr.dias.map(d => DCORTO[d]).join(", ")}` : ""} · ${esc(topeTxt(pr))}<br><span class="sub">${pagoIcon(pr)} ${esc(pagoTxt(pr))}</span></li>`).join("")}</ul>${ps.length > 6 ? `<a href="#pagos">Ver todos en Descuentos por día</a>` : ""}`;
}
function botProductos(q) {
  const words = nrm(q).replace(/[¿?¡!.,]/g, " ").split(/\s+/).filter(w => w.length > 1 && !STOP.has(w));
  if (!words.length) return null;
  vocab(); let ws2 = words; if (!D.products.some(p => words.every(w => matchW(p, w)))) ws2 = words.map(corregir);
  const hits = D.products.filter(p => ws2.every(w => matchW(p, w)))
    .sort((a, b) => (matchScore(a, ws2) - matchScore(b, ws2)) || (b.offers.length - a.offers.length)).slice(0, 3);
  if (!hits.length) return null;
  return `Esto encontré:${hits.map(p => { const b = best(p); return `<div class="bprod">${prodImg(p, "li")}<div><b>${esc(p.name)}</b><br>Más barato: <b>${money(b.v)}</b> en ${esc(chanName(b.o.s, b.c))} <span class="sub">(${p.offers.length} comercios)</span></div><div class="bpa"><button class="linkbtn" data-open="${p.id}">Ver</button>${addCtl(p.id)}</div></div>`; }).join("")}
    <a href="#buscar" data-botq="${esc(words.join(" "))}">Ver todos los resultados</a>`;
}
function botFormas(q) {
  const n = nrm(q), f = Object.values(P.formas_pago).find(f => { const t = nrm(f.t); return (/modo/.test(n) && /modo/.test(t)) || (/nfc|contactless|celular/.test(n) && /nfc/.test(t)) || (/qr/.test(n) && /qr de la billetera/.test(t)); });
  return f ? `<b>${f.i} ${esc(f.t)}</b>: ${esc(f.d)}` : null;
}
function botResponder(q) {
  const n = nrm(q).trim();
  if (!n) return "";
  if (/^(hola|buenas|buen dia|buenas tardes|buenas noches|hey)\b/.test(n) && n.length < 20) return "¡Hola! Preguntame, por ejemplo: «¿dónde está más barata la yerba?», «descuentos del jueves», «promos con Galicia» o «¿cómo armo mi carrito?».";
  if (/gracias/.test(n) && n.length < 25) return "¡De nada! Si necesitás algo más, preguntame.";
  if (/(como|que es).*(pago|pagar|modo|qr|nfc|contactless)|pagar con (qr|nfc|el celular)/.test(n)) { const r = botFormas(q); if (r) return r; }
  const promoQ = /descuent|promo|reintegro|beneficio|banco|billetera|tarjeta|cuenta dni|mercado pago|modo|que dia|dia conviene/.test(n) && !/carrit|mis medios/.test(n);
  if (promoQ) return botPromos(q);
  for (const [re, f] of BOT_TEMAS) if (re.test(n)) return f();
  const st = D.stores.find(x => n === nrm(x.name) || n === x.id);
  if (st) return `${esc(st.name)}: ${D.products.filter(p => offerAt(p, st.id)).length} productos comparados.${st.online ? ` Tiene tienda online (${esc(st.online.nombre || "")}).` : ""}<br>${botPromos(st.name)}`;
  return botProductos(q) || `No estoy seguro de haber entendido 🤔. Puedo ayudarte con:<ul><li>Precios: «¿dónde está más barato el aceite?»</li><li>Descuentos: «promos del sábado», «descuentos con BBVA», «promos en Coto»</li><li>Cómo usar la página: carrito, ¿dónde conviene?, mis medios, ubicación, avisos</li></ul>`;
}
const BOT_CHIPS = ["¿Qué descuentos hay hoy?", "¿Dónde está más barata la yerba?", "¿Cómo armo mi carrito?", "¿Cómo pago con MODO?", "Comercios cerca de mí"];
function botRender() {
  $("#chm").innerHTML = BOT.msgs.map(m => `<div class="cm ${m.who}">${m.html}</div>`).join("")
    + (BOT.msgs.length <= 1 ? `<div class="cchips">${BOT_CHIPS.map(c => `<button type="button" class="chip" data-botask="${esc(c)}">${esc(c)}</button>`).join("")}</div>` : "");
  $("#chm").scrollTop = 1e6;
}
async function botAsk(q) { BOT.msgs.push({ who: "u", html: esc(q) }); botRender(); await loadProducts(); BOT.msgs.push({ who: "b", html: botResponder(q) }); botRender(); }
function botOpen(open) {
  $("#chat").hidden = !open; $("#botbtn").setAttribute("aria-expanded", open);
  if (open) ovOpen("chat", () => botOpen(false)); else ovDone("chat");
  if (open && !BOT.msgs.length) { BOT.msgs.push({ who: "b", html: "¡Hola! Soy el asistente de ComparáSúper. Te ayudo a encontrar precios, descuentos por día y banco, y a usar la página. ¿Qué necesitás?" }); botRender(); }
  if (open) $("#chq").focus();
}
$("#botbtn").onclick = () => botOpen($("#chat").hidden);
/* celular: los tres globos se juntan en uno ("Ayuda") para no tapar precios ni botones */
function fabsShow(open) { $("#fabs").classList.toggle("abierto", open); $("#fmas").setAttribute("aria-expanded", open); $("#fmas .fi").innerHTML = open ? ic("x") : ic("life-buoy"); $("#fmas .ft").textContent = open ? "Cerrar" : "Ayuda"; if (open) ovOpen("fabs", () => fabsShow(false)); else ovDone("fabs"); }
$("#fmas").onclick = e => { e.stopPropagation(); fabsShow(!$("#fabs").classList.contains("abierto")); };
document.addEventListener("click", e => { if ($("#fabs").classList.contains("abierto") && !e.target.closest("#fmas")) fabsShow(false); }, true);
$("#chatx").onclick = () => botOpen(false);
$("#chf").onsubmit = e => { e.preventDefault(); const q = $("#chq").value.trim(); if (!q || !D) return; $("#chq").value = ""; botAsk(q); };
$("#chm").addEventListener("click", e => {
  const c = e.target.closest("[data-botask]"); if (c) { botAsk(c.dataset.botask); return; }
  const bq = e.target.closest("[data-botq]"); if (bq) { S.q = bq.dataset.botq; $("#q").value = S.q; S.cat = ""; S.bpage = 1; if (innerWidth < 700) botOpen(false); }
  if (e.target.closest("a[href^='#']") && innerWidth < 700) botOpen(false);
});

$("#pbtn").onclick = async () => {
  if (document.getElementById("pmapa")) return;
  const pr = abrirMapa({ actual: PROV }); ovOpen("mapa", () => window.cerrarMapa && window.cerrarMapa());
  const v = await pr; ovDone("mapa");
  if (v && v !== PROV) { LS.set("cs_prov", v); setTimeout(() => location.reload(), 150); }
};
listaCompartida();
(async () => {
  if (!PROV) {                         // primera visita: elegir la provincia antes de cargar precios
    $("#view").innerHTML = "";
    const v = await abrirMapa({ primera: true });
    LS.set("cs_prov", v || "AR-C"); location.reload();
    return new Promise(() => {});
  }
  $("#plab").textContent = provCorto(PROV);
  return load();
})().then(() => {
  const pocas = !enAMBA() && D.stores.length <= 3;
  if (pocas) { $("#pocos").hidden = false; $("#pocos").innerHTML = `📍 En <b>${esc(provNombre(PROV))}</b> todavía tenemos precios de pocas cadenas (${D.stores.map(s => esc(s.name)).join(", ")}). Los descuentos con bancos y billeteras sí están completos. <button type="button" class="lnk" data-pcambiar>Cambiar provincia</button>`; $("[data-pcambiar]").onclick = () => $("#pbtn").click(); }
  loadProducts().then(() => { saveLista(); refreshAvisos(); setTimeout(avisoBajas, 1500); if (!LS.get("cs_bienvenida", 0) && /^#?(inicio)?$/.test(location.hash)) setTimeout(() => { if (!LS.get("cs_bienvenida") && /^#?(inicio)?$/.test(location.hash) && $("#modal").hidden) modalBienvenida(); }, 600); });
  $("#demo").hidden = !D.demo;
  $("#year").textContent = new Date().getFullYear();
  $("#fupd").textContent = `Precios del ${D.updated.split("-").reverse().join("/")} · ${D.region}`;
  $("#mdot").hidden = !MEDIOS;
  saveLista(); refreshAvisos(); updUbic(); route();
}).catch(err => { $("#view").innerHTML = `<div class="wrap"><div class="empty" style="margin:40px 0">No se pudieron cargar los precios. Probá recargar la página.<br><span class="sub">${esc(err.message)}</span></div></div>`; });
