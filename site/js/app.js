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
let LISTA = LS.get("cs_lista", {});          // {idProducto: cantidad}
let MEDIOS = LS.get("cs_medios", null);      // null = no configurado (se muestran todos)
let AVISOS = LS.get("cs_avisos", {});        // {idProducto: precio cuando se pidió el aviso}

/* ---------- tema claro / oscuro ---------- */
function applyTheme(t) {
  document.documentElement.dataset.theme = t;
  const b = $("#themebtn");
  if (b) { b.innerHTML = t === "dark" ? '☀️<span class="hl">Modo Claro</span>' : '🌙<span class="hl">Modo Oscuro</span>'; b.title = t === "dark" ? "Cambiar a modo claro" : "Cambiar a modo oscuro"; }
  const m = $('meta[name="theme-color"]'); if (m) m.content = t === "dark" ? "#0b3d2c" : "#0e7a55";
}
applyTheme(LS.get("cs_tema", "light"));

/* ---------- datos ---------- */
let D, P, BY, ST, HIST, CFG = {};
async function load() {
  const [d, p, c] = await Promise.all([
    fetch("data/products.json").then(r => r.json()), fetch("data/promos.json").then(r => r.json()),
    fetch("config.json").then(r => r.json()).catch(() => ({}))]);
  D = d; P = p; CFG = c || {};
  D.stores.sort((a, b) => a.name.localeCompare(b.name, "es", { sensitivity: "base" }));   // siempre en orden alfabético
  for (const x of d.products) {   // datos comprimidos por build_data.py
    if (x.img && !/^https?:/.test(x.img) && d.imghosts) { const [h, id, f] = x.img.split("/"); x.img = `https://${d.imghosts[+h]}/arquivos/ids/${id}-300-300/${f}`; }
    for (const o of x.offers) if (o.pon && o.po) o.promoo = { txt: `${Math.round((1 - o.pon / o.po) * 100)}% menos comprando online`, pu: o.pon, n: 1 };
  }
  BY = Object.fromEntries(d.products.map(x => [x.id, x]));
  ST = Object.fromEntries(d.stores.map(s => [s.id, s]));
  P.medioBy = Object.fromEntries(P.medios.map(m => [m.id, m]));
  for (const id of Object.keys(LISTA)) if (!BY[id]) delete LISTA[id];
  if (MEDIOS) MEDIOS = MEDIOS.filter(id => P.medioBy[id]);
  if (UBIC) { await loadSuc(); calcCerca(); }
}
async function hist() {
  if (!HIST) HIST = await fetch("data/history.json").then(r => r.json()).catch(() => ({ dates: [], series: {} }));
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
  for (const o of p.offers) {
    if (filter && !filter.has(o.s)) continue;
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
const offerAt = (p, sid) => p.offers.find(o => o.s === sid);

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
const goUrl = (sid, p) => { const s = ST[sid]; const u = s.buscar || s.web; return u ? u.replaceAll("{q}", encodeURIComponent(p.name.replace(/\s\d.*$/, ""))) : null; };
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

/* ---------- interfaz general ---------- */
function toast(t, ms = 2400) { const el = $("#toast"); el.textContent = t; el.classList.add("on"); clearTimeout(toast.t); toast.t = setTimeout(() => el.classList.remove("on"), ms); }
function saveLista() { LS.set("cs_lista", LISTA); const n = Object.values(LISTA).reduce((a, b) => a + b, 0); const el = $("#lcount"); el.textContent = n; el.dataset.n = n; }
let PREF = LS.get("cs_pref", {});   // comercio elegido para cada producto del carrito {id: comercio}
const savePref = () => LS.set("cs_pref", PREF);
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
function setTab(v) { $$(".tabs a").forEach(a => a.classList.toggle("on", a.dataset.v === v)); }
const storeSelect = (id, val, label = "Todos los comercios") => `<select class="sel" id="${id}" aria-label="Comercio"><option value="">${label}</option>${grupos().map(([n, ss]) => `<optgroup label="${n}">${ss.map(s => `<option value="${s.id}" ${val === s.id ? "selected" : ""}>${esc(s.name)}</option>`).join("")}</optgroup>`).join("")}</select>`;
const canalChips = () => `<div class="chips" role="group" aria-label="Dónde comprar">${[["ambos", "🏬🛒 Local y online"], ["tienda", "🏬 Solo en el local"], ["online", "🛒 Solo online / apps"]].map(([v, t]) => `<button class="chip${S.canal === v ? " on" : ""}" data-canal="${v}">${t}</button>`).join("")}</div>`;

/* ---------- UBICACIÓN: comercios cerca ---------- */
let UBIC = LS.get("cs_ubic", null);   // { lat, lon, label, km }
let SUC = null;                        // sucursales con ubicación { comercio: [[lat, lon, dirección, barrio], …] }
async function loadSuc() { if (!SUC) SUC = await fetch("data/sucursales.json").then(r => (r.ok ? r.json() : {})).catch(() => ({})); return SUC; }
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
  const near = S.cerca && CERCA ? new Set(Object.keys(CERCA)) : null;
  if (S.stores.size && near) return new Set([...S.stores].filter(x => near.has(x)));
  return S.stores.size ? S.stores : near;
}
/* promos que valen en algún comercio cercano (o comprando online) */
const promoCerca = pr => !CERCA || pr.canal === "online" || pr.stores.some(s => CERCA[s]);
function ubicBar(where) {
  if (!UBIC) return `<div class="ubic"><span>📍 Marcá tu ubicación y te mostramos las promos de los comercios que tenés cerca.</span><button class="btn sm" data-ubic>Marcar mi ubicación</button></div>`;
  const ids = Object.keys(CERCA || {}).sort((a, b) => CERCA[a].d - CERCA[b].d);
  return `<div class="ubic on"><div><b>📍 Cerca de ${esc(UBIC.label)}</b> <span class="sub">· hasta ${UBIC.km} km · ${ids.length} ${ids.length === 1 ? "comercio" : "comercios"}${where === "pagos" || where === "inicio" ? " · mostramos solo sus promos y las online" : ""}</span>
      <div class="unear">${ids.slice(0, 12).map(id => `<span class="uchip" title="${esc(CERCA[id].dir + (CERCA[id].zona ? ", " + CERCA[id].zona : ""))}">${badge("s", id, ST[id].name, ST[id].color, ST[id].sigla)} ${esc(ST[id].name)} <small>${kmTxt(CERCA[id].d)}</small></span>`).join("") || '<span class="sub">No encontramos sucursales en ese radio. Probá con más kilómetros.</span>'}</div></div>
    <div class="ubtn"><button class="btn sec sm" data-ubic>Cambiar</button><button class="btn sec sm" data-noubic>Quitar</button></div></div>`;
}
async function modalUbic() {
  await loadSuc();
  const zonas = {};
  for (const list of Object.values(SUC)) for (const [la, lo, , z] of list) { if (!z) continue; (zonas[z] = zonas[z] || []).push([la, lo]); }
  const nombres = Object.keys(zonas).sort((a, b) => a.localeCompare(b, "es"));
  openModal(`<h2>📍 Mi ubicación</h2><p class="sub">La usamos solo en este navegador para mostrarte los comercios cercanos y sus promos. No se manda a ningún lado.</p>
    <button class="btn" id="ugps" style="width:100%;justify-content:center;margin:6px 0 12px">📡 Usar mi ubicación actual</button>
    <label class="flbl" for="uzona">O escribí tu barrio o localidad</label>
    <input class="inp" id="uzona" list="uzonas" placeholder="Ej.: Palermo, Caballito, Lanús…" autocomplete="off" value="${UBIC && !UBIC.gps ? esc(UBIC.label) : ""}">
    <datalist id="uzonas">${nombres.map(n => `<option value="${esc(n)}">`).join("")}</datalist>
    <label class="flbl" for="ukm">Hasta qué distancia</label>
    <select class="sel" id="ukm">${[1, 2, 3, 5, 10, 20].map(k => `<option value="${k}" ${(UBIC ? UBIC.km : 3) === k ? "selected" : ""}>${k} km</option>`).join("")}</select>
    <p class="sub" id="umsg" style="min-height:20px;margin:8px 0 0"></p>
    ${UBIC && CERCA ? `<div class="unear" style="margin-top:12px">${Object.keys(CERCA).sort((a, b) => CERCA[a].d - CERCA[b].d).slice(0, 12).map(id => `<span class="uchip" title="${esc(CERCA[id].dir)}">${badge("s", id, ST[id].name, ST[id].color, ST[id].sigla)} ${esc(ST[id].name)} <small>${kmTxt(CERCA[id].d)}</small></span>`).join("") || '<span class="sub">No hay sucursales en ese radio.</span>'}</div>` : ""}
    <div class="mfoot">${UBIC ? '<button class="btn sec sm" data-noubic>Quitar mi ubicación</button>' : '<button class="btn sec sm" data-close>Cancelar</button>'}<button class="btn sm" id="usave">Guardar</button></div>`);
  const save = u => { UBIC = u; LS.set("cs_ubic", UBIC); calcCerca(); updUbic(); closeModal(); route(); toast(`📍 ${Object.keys(CERCA || {}).length} comercios cerca de ${u.label}`); };
  $("#ugps").onclick = () => {
    if (!navigator.geolocation) { $("#umsg").textContent = "Tu navegador no permite usar la ubicación. Escribí tu barrio."; return; }
    $("#umsg").textContent = "Buscando tu ubicación…";
    navigator.geolocation.getCurrentPosition(pos => save({ lat: pos.coords.latitude, lon: pos.coords.longitude, label: "tu ubicación actual", km: +$("#ukm").value, gps: true }),
      () => { $("#umsg").textContent = "No pudimos obtener tu ubicación (quizás no diste permiso). Escribí tu barrio o localidad."; }, { enableHighAccuracy: false, timeout: 10000, maximumAge: 600000 });
  };
  $("#usave").onclick = () => {
    const v = $("#uzona").value.trim(), k = nombres.find(n => nrm(n) === nrm(v)) || nombres.find(n => nrm(n).startsWith(nrm(v)) && v);
    if (!k) { if (UBIC && !v) { UBIC.km = +$("#ukm").value; save(UBIC); return; } $("#umsg").textContent = v ? "No encontramos ese barrio o localidad. Elegilo de la lista." : "Escribí tu barrio o usá tu ubicación actual."; return; }
    const pts = zonas[k], lat = pts.reduce((a, p) => a + p[0], 0) / pts.length, lon = pts.reduce((a, p) => a + p[1], 0) / pts.length;
    save({ lat, lon, label: k, km: +$("#ukm").value });
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
  const promos = delDia(day).sort((a, b) => (mineOk(b) - mineOk(a)) || b.pct - a.pct);
  const pcard = pr => `<div class="pcard${MEDIOS && mineOk(pr) ? " mine" : ""}"><div class="pct">${pr.pct}%<small>${topeTxt(pr)}</small></div>
        <div class="pd">${medioBadge(medio(pr))} <b>${esc(medioName(pr))}</b> <span class="tag gr sm">${esc(P.tipos[medio(pr).tipo] || "")}</span><br>en ${pr.stores.map(s => esc(ST[s] ? ST[s].name : s)).join(", ")}
        <div class="how">${pagoIcon(pr)} ${esc(pagoTxt(pr))}</div></div></div>`;
  const tile = st => { const src = (CFG.logos || {})[st.id]; return `<a class="stile" href="#buscar" data-tienda="${st.id}" title="Ver productos de ${esc(st.name)}">${src ? `<img src="${esc(src)}" alt="${esc(st.name)}" loading="lazy">` : `<span class="stn" style="color:${esc(st.color || "var(--ink)")}">${esc(st.name)}</span>`}</a>`; };
  $("#view").innerHTML = `
  <section class="hero2"><div class="wrap">
    <h1>Encontrá los mejores precios <span class="l2">en un solo lugar</span></h1>
    <p>Buscá, compará y ahorrá</p>
  </div></section>
  <div class="wrap">
    <section class="blk"><div class="blk-h"><h2>🔥 Ofertas del día · ${day === HOY ? `hoy ${DIAS[day].toLowerCase()}` : DIAS[day].toLowerCase()}</h2><a href="#pagos" data-semana>Ver toda la semana →</a></div>
      <div class="week">${DIAS.map((d, i) => `<button class="day${i === day ? " on" : ""}" data-iday="${i}" aria-pressed="${i === day}">${DCORTO[i]}${i === HOY ? '<span class="hoy">HOY</span>' : ""}<small>${delDia(i).length} benef.</small></button>`).join("")}</div>
      ${MEDIOS ? "" : `<p class="sub" style="margin:2px 0 10px">Mostramos todos los descuentos${CERCA ? " de los comercios cerca tuyo" : ""}. <a href="#" data-medios>Elegí tus medios de pago</a> para ver solo los que podés usar.</p>`}
      <div class="today">${promos.map(pcard).join("") || `<div class="empty">No hay descuentos cargados para el ${DIAS[day].toLowerCase()}.</div>`}</div>
    </section>

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
function updUbic() { const l = $("#ulab"); if (l) l.textContent = UBIC ? (UBIC.gps ? `Tu ubicación · ${UBIC.km} km` : `${UBIC.label} · ${UBIC.km} km`) : "Elegí tu ubicación"; $("#uloc").classList.toggle("on", !!UBIC); }

/* ---------- CÓMO FUNCIONA ---------- */
function vComo() {
  setTab("como");
  $("#view").innerHTML = `<div class="wrap"><section class="blk first"><div class="blk-h"><h1>ℹ️ Cómo funciona</h1></div>
      <div class="how4">
        <div class="box"><div class="n">1</div><h3>Mismo producto, de verdad</h3><p>Comparamos por código de barras, no por el nombre: la leche de 1 litro de un súper es exactamente la misma que la del otro.</p></div>
        <div class="box"><div class="n">2</div><h3>Local, online o app</h3><p>Mostramos el precio en la sucursal y en la tienda web o app, con el costo de envío. A veces online sale menos.</p></div>
        <div class="box"><div class="n">3</div><h3>Tu forma de pago cuenta</h3><p>Elegí tus bancos, billeteras y tarjetas. Te decimos el precio final y <b>cómo pagar</b> para que el descuento aplique (QR, tarjeta física, NFC…).</p></div>
        <div class="box"><div class="n">4</div><h3>Tu compra entera</h3><p>Armá tu compra y te decimos dónde, qué día y con qué medio sale menos, incluso mezclando dos comercios. Tu carrito lo mandás por WhatsApp o correo.</p></div>
      </div>
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
function results() {
  const words = nrm(S.q).split(/\s+/).filter(Boolean);
  const list = D.products.filter(p => {
    if (S.cat && p.cat !== S.cat) return false;
    const n = nrm(p.name + " " + p.brand);
    if (!words.every(w => n.includes(w))) return false;
    const sf = stFilter(); if (sf && !p.offers.some(o => sf.has(o.s))) return false;
    if (S.onlyPromo && !hasPromo(p)) return false;
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
      ${grupos().map(([n, ss], i) => `<h4>${n}${i === 0 ? ' <button class="linkbtn" id="stall"></button>' : ""}</h4>
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
      <div id="res"></div>
    </div></div>`;
  const draw = () => {
    const r = results();
    $("#rcount").textContent = `${r.length} ${r.length === 1 ? "producto" : "productos"}${S.stores.size ? " · precios de los comercios elegidos" : ""}`;
    const per = VISTAS[S.vista].per, pages = Math.max(1, Math.ceil(r.length / per)); if (S.bpage > pages) S.bpage = 1;
    const pg = S.bpage || 1, slice = r.slice((pg - 1) * per, pg * per);
    $("#res").innerHTML = (slice.length ? (S.vista === "l" ? `<div class="lst">${slice.map(lrow).join("")}</div>` : `<div class="grid v-${S.vista}">${slice.map(card).join("")}</div>`)
      : `<div class="empty">No encontramos productos con esos filtros.<br><br><button class="btn sec sm" id="clr">Limpiar filtros</button></div>`)
      + `<div class="more">${pager(r.length, pg, "b", per)}</div>`;
    $$("[data-pg]", $("#res")).forEach(b => b.onclick = () => { S.bpage = +b.dataset.pg.split("|")[1]; draw(); $("#view").scrollIntoView({ behavior: "smooth" }); });
    const c = $("#clr"); if (c) c.onclick = () => { S.q = ""; $("#q").value = ""; S.cat = ""; S.stores.clear(); S.onlyPromo = false; S.canal = "ambos"; vBuscar(); };
    $("#stall").textContent = S.stores.size ? "ver todos" : "";
    const nf = (S.cat ? 1 : 0) + S.stores.size + (S.onlyPromo ? 1 : 0) + (S.cerca ? 1 : 0) + (S.canal !== "ambos" ? 1 : 0);
    $("#fopen").textContent = nf ? `Filtros (${nf})` : "Filtros";
    $("#fclose").textContent = r.length ? `Ver ${r.length} ${r.length === 1 ? "producto" : "productos"}` : "Sin resultados";
  };
  $$("input[name=cat]").forEach(i => i.onchange = () => { S.bpage = 1; S.cat = i.value; history.replaceState(null, "", S.cat ? "#c-" + S.cat : "#buscar"); const st = $("#filters").scrollTop; vBuscar(); $("#filters").scrollTop = st; });
  $$("input[name=can]").forEach(i => i.onchange = () => { S.bpage = 1; S.canal = i.value; draw(); });
  $$("input[name=st]").forEach(i => i.onchange = () => { S.bpage = 1; i.checked ? S.stores.add(i.value) : S.stores.delete(i.value); draw(); });
  $("#stall").onclick = () => { S.stores.clear(); $$("input[name=st]").forEach(i => (i.checked = false)); draw(); };
  $("#fpromo").onchange = e => { S.bpage = 1; S.onlyPromo = e.target.checked; draw(); };
  const fc = $("#fcerca"); if (fc) fc.onchange = e => { S.bpage = 1; S.cerca = e.target.checked; draw(); };
  $("#sort").onchange = e => { S.bpage = 1; S.sort = e.target.value; draw(); };
  $$("[data-vista]").forEach(b => b.onclick = () => { const first = ((S.bpage || 1) - 1) * VISTAS[S.vista].per; S.vista = b.dataset.vista; LS.set("cs_vista", S.vista); S.bpage = Math.floor(first / VISTAS[S.vista].per) + 1; vBuscar(); });
  const setF = open => { S.fopen = open; $("#filters").classList.toggle("open", open); $("#fback").classList.toggle("open", open); document.body.classList.toggle("noscroll", open); };
  $("#fopen").onclick = () => setF(true);
  $("#fclose").onclick = () => { setF(false); $("#view").scrollIntoView(); };
  $("#fx").onclick = () => setF(false);
  $("#fback").onclick = () => setF(false);
  $("#freset").onclick = () => { S.cat = ""; S.stores.clear(); S.onlyPromo = false; S.canal = "ambos"; S.bpage = 1; history.replaceState(null, "", "#buscar"); vBuscar(); };
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
  const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
  if (!BAN.pausa && !reduce) BAN.t = setInterval(() => { if (!$(".banner")) { clearInterval(BAN.t); return; } bannerGo(BAN.i + 1); }, 5000);
  $$("[data-bdot]").forEach(b => b.onclick = () => { bannerGo(+b.dataset.bdot); bannerStart(); });
  const pz = $("#bpause"); if (pz) pz.onclick = () => { BAN.pausa = !BAN.pausa; pz.textContent = BAN.pausa ? "▶" : "⏸"; pz.setAttribute("aria-label", BAN.pausa ? "Seguir pasando" : "Pausar"); bannerStart(); };
  const bn = $(".banner"); if (bn) { let x0 = null; bn.ontouchstart = e => (x0 = e.touches[0].clientX); bn.ontouchend = e => { if (x0 === null) return; const dx = e.changedTouches[0].clientX - x0; if (Math.abs(dx) > 40) { bannerGo(BAN.i + (dx < 0 ? 1 : -1)); bannerStart(); } x0 = null; }; }
}
function vOfertas() {
  setTab("ofertas");
  const all = D.products.flatMap(p => p.offers.flatMap(o => [["tienda", o.promo], ["online", o.promoo]].filter(x => x[1]).map(([c, pr]) => ({ p, o, c, pr }))));
  const tipos = [...new Set(all.map(x => tipo(x.pr.txt)))].sort();
  const list = all.filter(x => (!S.otipo || tipo(x.pr.txt) === S.otipo) && (!S.ostore || x.o.s === S.ostore))
    .sort((a, b) => (a.pr.pu / base(a.o, a.c)) - (b.pr.pu / base(b.o, b.c)));
  $("#view").innerHTML = `<div class="wrap">${banner()}<section class="blk">
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
    ${(pr.bancos || []).length ? `<div class="bancos"><span class="sub">${pr.medio === "cuentadni" ? "Billetera de" : "Vale con tarjetas de"}:</span> ${pr.bancos.map(b => P.medioBy[b]).filter(Boolean).map(m => `<span class="bk" title="${esc(m.name)}">${medioBadge(m)}</span>`).join("")}</div>` : ""}
    <div class="howpay"><div class="k">Cómo pagar para que aplique</div>
      ${(pr.pago || []).map(k => { const f = P.formas_pago[k] || { t: k, d: "" }; return `<div class="hp"><span class="i">${f.i || "💳"}</span><div><b>${esc(f.t)}</b><div class="sub">${esc(f.d)}</div></div></div>`; }).join('<div class="or">o</div>')}
      ${pr.nota ? `<div class="sub" style="margin-top:6px">${esc(pr.nota)}</div>` : ""}</div>
    <dl><dt>Tope</dt><dd>${pr.pct ? topeTxt(pr) : "—"}</dd>
      ${pr.minimo ? `<dt>Compra mínima</dt><dd>${money(pr.minimo)}</dd>` : ""}
      ${pr.reintegro ? `<dt>Te lo devuelven</dt><dd>${esc({ "en la caja": "En el momento, en la caja", "reintegro": "Después, como reintegro en tu cuenta o resumen" }[pr.reintegro] || pr.reintegro)}</dd>` : ""}
      <dt>Dónde</dt><dd>${CANAL[pr.canal] || "—"}</dd>
      <dt>Días</dt><dd>${pr.dias.length === 7 ? "Todos los días" : pr.dias.map(d => DCORTO[d]).join(", ")}</dd>
      <dt>Vigencia</dt><dd>hasta el ${pr.hasta.split("-").reverse().join("/")}</dd>
      <dt>Fuente</dt><dd>${pr.fuente ? `<a href="${esc(pr.fuente)}" target="_blank" rel="noopener">${esc(FUENTE[pr.fuente_tipo] || "ver fuente")} ↗</a> · ${esc(pr.verificado.split("-").reverse().join("/"))}${pr.fuente_tipo !== "oficial" ? '<div class="sub">Confirmá en la página del banco o del comercio antes de pagar.</div>' : ""}` : '<span class="tag gr sm">ejemplo, sin fuente</span>'}</dd></dl>
    ${pr.tope && pr.pct ? `<div class="sub">Para aprovechar el tope completo: compra de ${money(pr.tope / pr.pct * 100)}.</div>` : ""}
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
    ${ubicBar("pagos")}
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
      ${grupos().map(([n, ss]) => `<tr class="grp"><th colspan="8">${n}</th></tr>` + ss.map(s => `<tr><td>${storeChip(s.id)}</td>${DIAS.map((_, i) => { const v = cellPct(s.id, i); return `<td class="${i === HOY ? "tdhoy" : ""}">${v ? `<button class="cell" data-cell="${s.id}|${i}" style="--a:${(0.12 + v / 40).toFixed(2)}" data-hi="${v >= 20 ? 1 : 0}">${v}%</button>` : '<span class="sub">—</span>'}</td>`; }).join("")}</tr>`).join("")).join("")}
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
  return `<div class="litem">${prodImg(p, "e")}
    <div><div class="n" data-open="${p.id}">${esc(p.name)}</div>
      <div class="sub">${at ? `Elegido en <b>${esc(chanName(sid, at.c))}</b>: ${money(at.v)} c/u <button class="linkbtn" data-unpref="${p.id}">quitar elección</button>` : `Desde ${money(b.v)} en ${esc(chanName(b.o.s, b.c))} · en ${p.offers.length} comercios`}</div>
      ${hint ? `<div class="qhint">🏷️ ${esc(hint)}</div>` : ""}</div>
    <div class="qty"><button data-q="${kind}|${p.id}" data-d="-1" aria-label="Uno menos">−</button><span>${qty}</span><button data-q="${kind}|${p.id}" data-d="1" aria-label="Uno más">+</button></div>
    <button class="rm" data-rm="${kind}|${p.id}" aria-label="Sacar">✕</button></div>`;
}
function bindQty(rerender) {
  $$("[data-q]").forEach(b => b.onclick = () => {
    const [k, id] = b.dataset.q.split("|"), o = k === "c" ? LISTA : PLAN;
    o[id] = Math.max(1, Math.min(999, o[id] + +b.dataset.d)); k === "c" ? saveLista() : savePlan(); rerender();
    const h = qtyHint(BY[id], o[id], k === "c" ? PREF[id] : null); if (h) toast(h, 4500);
  });
  $$("[data-rm]").forEach(b => b.onclick = () => { const [k, id] = b.dataset.rm.split("|"); delete (k === "c" ? LISTA : PLAN)[id]; if (k === "c") { delete PREF[id]; savePref(); } k === "c" ? saveLista() : savePlan(); rerender(); });
  $$("[data-unpref]").forEach(b => b.onclick = () => { delete PREF[b.dataset.unpref]; savePref(); rerender(); });
}

function vCarrito() {
  setTab("");
  const items = listItems();
  if (!items.length) {
    $("#view").innerHTML = `<div class="wrap"><section class="blk"><h1>🛒 Mi carrito</h1>
      <div class="empty" style="padding:50px"><div style="font-size:48px">🛒</div><h3 class="ink">Tu carrito está vacío</h3>
      <p>Sumá productos con el botón <b>+</b>. Es tu lista: la podés mandar por WhatsApp o correo, y cuando quieras calcular dónde conviene comprarla.</p>
      <a class="btn" href="#buscar">Buscar productos</a></div></section></div>`;
    return;
  }
  const n = items.reduce((a, i) => a + i.qty, 0), approx = items.reduce((a, { p, qty }) => { const o = PREF[p.id] && offerAt(p, PREF[p.id]); return a + (o ? Math.min(...allChans(o).map(c => lineCost(o, c, qty).total)) : best(p).v * qty); }, 0);
  const link = shareLink(items), txt = shareText(items);
  $("#view").innerHTML = `<div class="wrap lgrid">
    <section class="box"><div class="blk-h"><h2>🛒 Mi carrito <span class="sub" style="font-weight:500">· ${items.length} productos, ${n} unidades</span></h2><button class="btn sec sm" id="lclear">Vaciar</button></div>
      ${items.map(({ p, qty }) => qtyRow(p, qty, "c")).join("")}
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
          <button class="btn sec" id="shlink">🔗 Copiar enlace</button></div>
        <details class="sub" style="margin-top:10px"><summary>Ver el mensaje</summary><pre class="msg">${esc(txt + "\n\nAbrir el carrito: " + link)}</pre></details></section>
    </aside></div>`;
  bindQty(vCarrito);
  $("#lclear").onclick = () => { LISTA = {}; saveLista(); vCarrito(); };
  $("#tocalc").onclick = () => { PLAN = { ...LISTA }; savePlan(); location.hash = "conviene"; };
  $("#shcopy").onclick = () => copy(txt + "\n\nAbrir el carrito: " + link, "Texto copiado: pegalo donde quieras");
  $("#shlink").onclick = () => copy(link, "Enlace copiado");
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
  history.replaceState(null, "", "#carrito");
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
const cartBtn = (b, sm) => { const u = cartUrl(b); return u ? `<a class="btn ${sm ? "sm " : ""}cartbtn" href="${esc(u)}" target="_blank" rel="noopener" title="Abre la tienda con estos productos ya cargados en el carrito">🛒 Armar el carrito en ${esc(ST[b.sid].name)}</a>` : ""; };

function vConviene() {
  setTab("conviene");
  const items = itemsOf(PLAN);
  const day = S.lday;
  const head = `<div class="toolbar"><div><h1>📊 ¿Dónde conviene mi compra?</h1><span class="sub">Armá la compra acá (no cambia tu carrito) y comparamos todo en un comercio, mezclando dos, por día y por medio de pago.</span></div></div>`;
  const editor = `<section class="box"><div class="blk-h"><h2>Productos a comparar <span class="sub" style="font-weight:500">· ${items.length}</span></h2>
      <div style="display:flex;gap:6px;flex-wrap:wrap">${Object.keys(LISTA).length ? `<button class="btn sec sm" id="fromcart">⬇️ Traer mi carrito</button>` : ""}${items.length ? `<button class="btn sec sm" id="tocart">🛒 Enviar al carrito</button><button class="btn sec sm" id="pclear">Vaciar</button>` : ""}</div></div>
    <div class="psearch"><input id="pq" type="search" placeholder="Sumá un producto: leche, yerba, aceite…" autocomplete="off" aria-label="Buscar producto para sumar"><div class="pres" id="pres" hidden></div></div>
    ${items.map(({ p, qty }) => qtyRow(p, qty, "p")).join("") || `<p class="sub" style="margin:14px 0 4px">Buscá productos arriba, traé tu carrito o <a href="#" data-canasta>probá con la canasta básica</a>.</p>`}
  </section>`;
  if (!items.length) { $("#view").innerHTML = `<div class="wrap">${head}<div class="cv">${editor}</div></div>`; bindPlanner(); return; }

  const rk = rankAll(items, day), full = rk.filter(b => !b.miss.length), bst = full[0], worst = full[full.length - 1];
  const split = bestSplit(items, day);
  const byDay = DIAS.map((_, d) => { const r = rankAll(items, d).filter(b => !b.miss.length)[0]; return r ? { d, b: r } : null; }).filter(Boolean).sort((a, b) => a.b.total - b.b.total);
  const bd = byDay[0];
  const ideal = items.reduce((a, { p, qty }) => a + Math.min(...p.offers.flatMap(o => chans(o).map(c => lineCost(o, c, qty).total))), 0);
  const splitGain = split && bst ? bst.total - split.total : 0;
  const pct = (a, b2) => b2 ? Math.round(a / b2 * 100) : 0;

  const card1 = bst ? `<div class="sumc win"><div class="k">① Todo en un solo comercio</div><div class="t">${esc(optName(bst))}</div><div class="big">${money(bst.total)}</div>
      ${bst.pay.promo ? `<div class="sv">💳 Pagando con <b>${esc(medioName(bst.pay.promo))}</b> (−${money(bst.pay.disc)})<br>${pagoIcon(bst.pay.promo)} ${esc(pagoTxt(bst.pay.promo))}</div>` : `<div class="sv">Sin descuentos de medio de pago este día</div>`}
      ${bst.c === "online" ? `<div class="sv">🚚 ${bst.env ? `Incluye envío ${money(bst.env)}` : "Envío gratis con esta compra"}</div>` : ""}
      ${cartBtn(bst) ? `<div style="margin-top:10px">${cartBtn(bst)}</div>` : ""}</div>`
    : `<div class="sumc box"><div class="k">① Todo en un solo comercio</div><p>Ningún comercio tiene todos los productos. Mirá abajo cuáles faltan en cada uno, o probá mezclando dos.</p></div>`;
  const card2 = split ? `<div class="sumc box ${splitGain > 0 ? "good" : ""}"><div class="k">② Mezclando dos comercios</div><div class="t">${split.parts.map(b => esc(optName(b))).join(" + ")}</div><div class="big">${money(split.total)}</div>
      <div class="sub">${bst ? (splitGain > 0 ? `<b class="okc">Ahorrás ${money(splitGain)} (${pct(splitGain, bst.total)}%)</b> frente a todo en ${esc(optName(bst))}, pero tenés que ir a dos lugares.` : `No conviene: sale ${money(-splitGain)} más que todo en ${esc(optName(bst))}.`) : "Es la única forma de conseguir todo."}</div></div>`
    : `<div class="sumc box"><div class="k">② Mezclando dos comercios</div><p class="sub">No hay una combinación de dos comercios que tenga todo.</p></div>`;
  const card3 = `<div class="sumc box"><div class="k">③ Cada producto en su lugar más barato</div><div class="big">${money(ideal)}</div><div class="sub">Yendo a todos los comercios que haga falta y sin descuentos de pago. Sirve de referencia.</div></div>`;
  const card4 = bd ? `<div class="sumc box ${bst && bd.d !== day && bst.total - bd.b.total > 100 ? "good" : ""}"><div class="k">④ El mejor día de la semana</div><div class="t">${DIAS[bd.d]} en ${esc(optName(bd.b))}</div><div class="big">${money(bd.b.total)}</div>
      <div class="sub">${bd.b.pay.promo ? `con ${esc(medioName(bd.b.pay.promo))} (${esc(pagoTxt(bd.b.pay.promo))})` : "sin descuento de pago"}${bst && bd.d !== day ? ` · ${money(bst.total - bd.b.total)} menos que el ${DIAS[day].toLowerCase()}` : ""}</div>
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
async function loadSug() {
  const cfg = CFG.sugerencias || {};
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
      if (cfg.votos_form_action && !data.demo) {
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
    if (!cfg.form_action) { err.innerHTML = "⚙️ El envío de sugerencias todavía no está conectado (prototipo): falta configurar el formulario en <code>config.json</code>. Tu sugerencia <b>no</b> se envió."; return; }
    const fd = new FormData(); fd.append(cfg.campo_texto, txt); if (cfg.campo_nombre) fd.append(cfg.campo_nombre, $("#snom").value.trim());
    try { await fetch(cfg.form_action, { method: "POST", mode: "no-cors", body: fd }); $("#sform").innerHTML = `<h3>✅ ¡Gracias!</h3><p>Recibimos tu sugerencia. Cuando la revisemos va a aparecer en la lista para que otros la voten.</p>`; }
    catch { err.textContent = "No se pudo enviar. Revisá tu conexión y probá de nuevo."; }
  };
}

/* ---------- FICHA DE PRODUCTO (panel lateral) ---------- */
async function openProduct(id) {
  const p = BY[id]; if (!p) return;
  const dr = $("#drawer"), sc = $("#scrim");
  if (openProduct.id !== id) openProduct.mas = false;
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
    if (u0) return `<a class="go" href="${esc(u0)}" target="_blank" rel="noopener">Ver en la tienda ↗</a>`;
    const u = goUrl(o.s, p);
    return u ? `<a class="go sec" href="${esc(u)}" target="_blank" rel="noopener" title="Abre la búsqueda de la tienda; puede mostrar productos parecidos">Buscar en la tienda ↗</a>` : "";
  };
  const chanLine = (o, c) => {
    const v = base(o, c); if (!v) return "";
    const pr = promoOf(o, c), pay = payDiscount(o.s, HOY, c, price1(o, c));
    return `<div class="sline"><span class="k">${c === "online" ? "🛒 Online" : "🏬 En el local"}</span> <b>${money(v)}</b>
      ${pr ? `<span class="tag sm">🏷️ ${esc(pr.txt)}: ${money(pr.pu)} c/u${pr.n > 1 ? ` llevando ${pr.n}` : ""}</span>` : ""}
      ${pay.promo ? `<span class="tag g sm">💳 Hoy ${money(price1(o, c) - pay.disc)} con ${esc(medioName(pay.promo))}</span>` : ""}</div>`;
  };
  const storeRow = o => {
    const mine = PREF[id] === o.s && q;
    return `<div class="srow${mine ? " mine" : ""}"><div class="sh">${storeChip(o.s)}${o.anom ? '<span class="tag r sm">⚠️ precio inusual</span>' : ""}</div>
      <div class="sp">${chanLine(o, "tienda")}${chanLine(o, "online")}</div>
      <div class="sa">${link(o)}<button class="btn sm${mine ? " sec" : ""}" data-inc="${id}" data-sid="${o.s}">${mine ? `✓ Elegido · sumar otro` : `🛒 Agregar desde ${esc(ST[o.s].name)}`}</button></div></div>`;
  };
  dr.innerHTML = `<div class="dh">${prodImg(p, "ph")}<div><h2 id="dtitle">${esc(p.name)}</h2>
      <div class="sub">${esc(p.brand)} · en ${p.offers.length} ${p.offers.length === 1 ? "comercio" : "comercios"}</div></div>
      <button class="x" id="dclose" aria-label="Cerrar">✕</button></div>
    <div class="db">
      <div class="box best">
        <div><div class="sub">Más barato sin descuentos</div><div class="big">${money(b.v)}</div><div class="sub">${where(b)}${b.c === "online" ? " · más envío" : ""}</div><div class="sub">${unitTxt(p, b.v)}</div></div>
        ${bp && bp.v < b.v ? `<div class="bestpay"><div class="sub">Pagando hoy con descuento</div><div class="big">${money(bp.v)}</div><div class="sub">${storeChip(bp.o.s, bp.c)} con <b>${esc(medioName(bp.pay.promo))}</b></div><div class="sub">${pagoIcon(bp.pay.promo)} ${esc(pagoTxt(bp.pay.promo))}</div></div>` : ""}
        ${pq.length ? `<div class="qnote">🏷️ ${esc(hint || qtyHint(p, 1))}</div>` : ""}
        <div class="bbtn">
          ${q ? `<div class="incart"><span>En tu carrito${PREF[id] ? ` (${esc(ST[PREF[id]].name)})` : ""}:</span> ${addCtl(id)}</div>` : `<button class="btn" data-inc="${id}">🛒 Agregar al carrito</button>`}
          <button class="btn sec" data-plan="${id}">📊 Sumar a ¿Dónde conviene?</button>
          <button class="btn sec" id="watch">${watching ? "🔔 Avisando" : "🔔 Avisarme si baja"}</button></div>
      </div>
      <button class="btn sec vermas" id="vermas" aria-expanded="${openProduct.mas}">${openProduct.mas ? "Ocultar supermercados ▲" : `Ver más supermercados (${p.offers.length}) ▼`}</button>
      <div class="slist" id="slist" ${openProduct.mas ? "" : "hidden"}>
        <p class="sub" style="margin:0 0 8px">Precio de cada comercio, de menor a mayor. Podés agregar el producto al carrito desde el súper que prefieras.</p>
        ${rows.map(storeRow).join("")}
        <p class="sub" style="margin:10px 0 0">Precios del ${esc(D.updated.split("-").reverse().join("/"))}. Local: precio más común en las sucursales (base oficial SEPA). Online: sin envío.</p>
      </div>
    </div>`;
  if (dr.hidden) { dr.hidden = false; sc.hidden = false; document.body.style.overflow = "hidden"; openProduct.back = document.activeElement; dr.scrollTop = 0; }
  $("#dclose").onclick = closeDrawer;
  $("#vermas").onclick = () => { openProduct.mas = !openProduct.mas; const st = dr.scrollTop; openProduct(id); dr.scrollTop = st; };
  $("#watch").onclick = () => { if (id in AVISOS) { delete AVISOS[id]; toast("Ya no te avisamos"); } else { AVISOS[id] = b.v; toast("Te avisamos con la 🔔 cuando baje"); } LS.set("cs_avisos", AVISOS); refreshAvisos(); openProduct(id); };
  if (location.hash !== "#p-" + id) history.replaceState(null, "", "#p-" + id);
}
function closeDrawer() {
  $("#drawer").hidden = true; if ($("#modal").hidden) $("#scrim").hidden = true; document.body.style.overflow = "";
  if (location.hash.startsWith("#p-")) history.replaceState(null, "", "#" + (closeDrawer.under || "inicio"));
  if (openProduct.back) openProduct.back.focus?.();
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
function openModal(html) { const m = $("#modal"); m.innerHTML = `<button class="mx" type="button" data-close aria-label="Cerrar">✕</button>` + html; m.hidden = false; $("#scrim").hidden = false; const f = m.querySelector("input, button"); f && f.focus(); }
function closeModal() { $("#modal").hidden = true; if ($("#drawer").hidden) $("#scrim").hidden = true; }
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
      <label class="fl">Zona<select class="sel" id="nzona">${["CABA", "GBA Norte", "GBA Oeste", "GBA Sur", "La Plata y alrededores"].map(z => `<option>${z}</option>`).join("")}</select></label>
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

/* ---------- navegación ---------- */
function route() {
  if (!/^#(buscar|c-)/.test(location.hash)) { S.fopen = false; document.body.classList.remove("noscroll"); }
  if (!D) return;   // todavía cargando: load() llama a route() al terminar
  const h = location.hash.slice(1) || "inicio";
  if (h.startsWith("l-")) { importList(h.slice(2)); return; }
  if (h.startsWith("p-")) { if (!$("#view").dataset.v) { closeDrawer.under = "inicio"; vInicio(); $("#view").dataset.v = "inicio"; } openProduct(h.slice(2)); return; }
  if (!$("#drawer").hidden) { $("#drawer").hidden = true; $("#scrim").hidden = $("#modal").hidden; document.body.style.overflow = ""; }
  let v = h;
  if (h.startsWith("c-")) { S.cat = h.slice(2); S.q = ""; $("#q").value = ""; v = "buscar"; }
  if (v === "lista") v = "carrito";   // enlaces viejos
  ({ inicio: vInicio, buscar: vBuscar, ofertas: vOfertas, pagos: vPagos, carrito: vCarrito, conviene: vConviene, como: vComo, sugerencias: vSugerencias }[v] || vInicio)();
  $("#view").dataset.v = v; closeDrawer.under = h;
}

document.addEventListener("click", e => {
  const vm = $("#vmenu"); if (vm && vm.open && !vm.contains(e.target)) vm.open = false;
  if (e.target.closest("[data-ubic]")) { e.preventDefault(); modalUbic(); return; }
  if (e.target.closest("[data-noubic]")) { UBIC = null; LS.set("cs_ubic", null); S.cerca = false; calcCerca(); updUbic(); closeModal(); route(); toast("Ubicación quitada"); return; }
  const inc = e.target.closest("[data-inc]"); if (inc) { e.stopPropagation(); const id = inc.dataset.inc; setQty(id, (LISTA[id] || 0) + 1, inc.dataset.sid); return; }
  const dec = e.target.closest("[data-dec]"); if (dec) { e.stopPropagation(); const id = dec.dataset.dec; setQty(id, (LISTA[id] || 0) - 1); return; }
  const add = e.target.closest("[data-add]"); if (add) { e.stopPropagation(); addToList(add.dataset.add); return; }
  const op = e.target.closest("[data-open]"); if (op) { closeModal(); openProduct(op.dataset.open); return; }
  if (e.target.closest("[data-close]")) { closeModal(); return; }
  if (e.target.closest("[data-medios]")) { e.preventDefault(); modalMedios(); return; }
  if (e.target.closest("[data-news]")) { e.preventDefault(); modalNews(); return; }
  const cn = e.target.closest("[data-canal]"); if (cn) { S.canal = cn.dataset.canal; route(); return; }
  if (e.target.closest("[data-canasta]")) { e.preventDefault(); canasta().forEach(({ p }) => (PLAN[p.id] = PLAN[p.id] || 1)); savePlan(); toast("Canasta básica cargada para comparar"); location.hash === "#conviene" ? route() : (location.hash = "conviene"); return; }
  const pl = e.target.closest("[data-plan]"); if (pl) { const id = pl.dataset.plan; PLAN[id] = (PLAN[id] || 0) + 1; savePlan(); const h = qtyHint(BY[id], PLAN[id]); toast(`Sumado a ¿Dónde conviene mi compra? 📊 (${PLAN[id]})${h ? " · " + h : ""}`, h ? 4500 : 2400); return; }
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
$("#themebtn").onclick = () => { const t = document.documentElement.dataset.theme === "dark" ? "light" : "dark"; LS.set("cs_tema", t); applyTheme(t); if (!$("#drawer").hidden && location.hash.startsWith("#p-")) chart(BY[location.hash.slice(3)]); };
$("#hform").onsubmit = e => { e.preventDefault(); S.q = $("#q").value.trim(); S.cat = ""; location.hash === "#buscar" ? vBuscar() : (location.hash = "buscar"); };
$("#q").addEventListener("input", () => { clearTimeout(route.t); route.t = setTimeout(() => { S.bpage = 1; S.q = $("#q").value.trim(); S.cat = ""; if (location.hash !== "#buscar") location.hash = "buscar"; else vBuscar(); }, 250); });
window.addEventListener("hashchange", route);
applyTheme(document.documentElement.dataset.theme);


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
  const hits = D.products.filter(p => { const n = nrm(p.name + " " + p.brand); return words.every(w => n.includes(w)); })
    .sort((a, b) => (matchScore(a, words) - matchScore(b, words)) || (b.offers.length - a.offers.length)).slice(0, 3);
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
function botAsk(q) { BOT.msgs.push({ who: "u", html: esc(q) }); BOT.msgs.push({ who: "b", html: botResponder(q) }); botRender(); }
function botOpen(open) {
  $("#chat").hidden = !open; $("#botbtn").setAttribute("aria-expanded", open);
  if (open && !BOT.msgs.length) { BOT.msgs.push({ who: "b", html: "¡Hola! Soy el asistente de ComparáSúper. Te ayudo a encontrar precios, descuentos por día y banco, y a usar la página. ¿Qué necesitás?" }); botRender(); }
  if (open) $("#chq").focus();
}
$("#botbtn").onclick = () => botOpen($("#chat").hidden);
$("#chatx").onclick = () => botOpen(false);
$("#chf").onsubmit = e => { e.preventDefault(); const q = $("#chq").value.trim(); if (!q || !D) return; $("#chq").value = ""; botAsk(q); };
$("#chm").addEventListener("click", e => {
  const c = e.target.closest("[data-botask]"); if (c) { botAsk(c.dataset.botask); return; }
  const bq = e.target.closest("[data-botq]"); if (bq) { S.q = bq.dataset.botq; $("#q").value = S.q; S.cat = ""; S.bpage = 1; if (innerWidth < 700) botOpen(false); }
  if (e.target.closest("a[href^='#']") && innerWidth < 700) botOpen(false);
});

load().then(() => {
  $("#demo").hidden = !D.demo;
  $("#year").textContent = new Date().getFullYear();
  $("#fupd").textContent = `Precios del ${D.updated.split("-").reverse().join("/")} · ${D.region}`;
  $("#mdot").hidden = !MEDIOS;
  saveLista(); refreshAvisos(); updUbic(); route();
}).catch(err => { $("#view").innerHTML = `<div class="wrap"><div class="empty" style="margin:40px 0">No se pudieron cargar los precios. Probá recargar la página.<br><span class="sub">${esc(err.message)}</span></div></div>`; });
