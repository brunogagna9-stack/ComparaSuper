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
  return MEDIOS ? MEDIOS.includes(pr.medio) && needs(pr).every(r => MEDIOS.includes(r)) : !needs(pr).length;
};
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
  if (src) return `<img class="logo-img${kind === "m" ? " m" : ""}" src="${esc(src)}" alt="" loading="lazy">`;
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
function toast(t) { const el = $("#toast"); el.textContent = t; el.classList.add("on"); clearTimeout(toast.t); toast.t = setTimeout(() => el.classList.remove("on"), 2400); }
function saveLista() { LS.set("cs_lista", LISTA); const n = Object.values(LISTA).reduce((a, b) => a + b, 0); const el = $("#lcount"); el.textContent = n; el.dataset.n = n; }
function addToList(id) {
  if (LISTA[id]) { delete LISTA[id]; toast("Sacado de tu carrito"); } else { LISTA[id] = 1; toast("Agregado a tu carrito 🛒"); }
  saveLista();
  $$(`[data-add="${id}"]`).forEach(b => { if (b.classList.contains("add")) { b.classList.toggle("in", !!LISTA[id]); b.textContent = LISTA[id] ? "✓" : "+"; } });
  if (location.hash === "#carrito") route();
}
function refreshAvisos() {
  const ids = Object.keys(AVISOS).filter(id => BY[id]);
  const bajaron = ids.filter(id => best(BY[id]).v < AVISOS[id]);
  $("#abtn").hidden = !ids.length;
  const c = $("#acount"); c.textContent = bajaron.length; c.dataset.n = bajaron.length;
  return { ids, bajaron };
}
const where = b => `${storeChip(b.o.s, b.c)}`;
function card(p) {
  const b = best(p, S.stores.size ? S.stores : null), n = p.offers.length;
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
      <button class="add${LISTA[p.id] ? " in" : ""}" data-add="${p.id}" aria-label="Agregar o sacar del carrito">${LISTA[p.id] ? "✓" : "+"}</button></div>
  </article>`;
}
function setTab(v) { $$(".tabs a").forEach(a => a.classList.toggle("on", a.dataset.v === v)); }
const storeSelect = (id, val, label = "Todos los comercios") => `<select class="sel" id="${id}" aria-label="Comercio"><option value="">${label}</option>${grupos().map(([n, ss]) => `<optgroup label="${n}">${ss.map(s => `<option value="${s.id}" ${val === s.id ? "selected" : ""}>${esc(s.name)}</option>`).join("")}</optgroup>`).join("")}</select>`;
const canalChips = () => `<div class="chips" role="group" aria-label="Dónde comprar">${[["ambos", "🏬🛒 Local y online"], ["tienda", "🏬 Solo en el local"], ["online", "🛒 Solo online / apps"]].map(([v, t]) => `<button class="chip${S.canal === v ? " on" : ""}" data-canal="${v}">${t}</button>`).join("")}</div>`;

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
  const promos = P.promos.filter(pr => pr.dias.includes(HOY) && pr.pct > 0 && (!needs(pr).length || mineOk(pr))).sort((a, b) => (mineOk(b) - mineOk(a)) || b.pct - a.pct).slice(0, 6);
  const items = canasta();
  // por comercio, su mejor canal (local u online), sin descuentos de pago
  const per = {};
  for (const b of rankAll(items, -1)) { if (!per[b.sid] || (b.miss.length - per[b.sid].miss.length || b.total - per[b.sid].total) < 0) per[b.sid] = b; }
  const rk = Object.values(per).sort((a, b) => (a.miss.length - b.miss.length) || a.total - b.total);
  const full = rk.filter(b => !b.miss.length), inc = rk.filter(b => b.miss.length).slice(0, 6), max = Math.max(1, ...rk.map(b => b.total));
  const bajaron = D.products.flatMap(p => p.offers.filter(o => o.chg && o.chg.pct <= -3 && !o.anom).map(o => ({ p, o }))).sort((a, b) => a.o.chg.pct - b.o.chg.pct).slice(0, 12);
  const subieron = D.products.flatMap(p => p.offers.filter(o => o.chg && o.chg.pct >= 5 && !o.anom).map(o => ({ p, o }))).sort((a, b) => b.o.chg.pct - a.o.chg.pct).slice(0, 6);
  const online = D.products.flatMap(p => p.offers.filter(o => o.p && o.po && o.po < o.p * 0.97 && !isApp(o.s)).map(o => ({ p, o }))).sort((a, b) => a.o.po / a.o.p - b.o.po / b.o.p).slice(0, 10);
  const ofertas = D.products.filter(hasPromo).slice(0, 12);
  const nPromo = D.products.reduce((a, p) => a + p.offers.filter(o => o.promo || o.promoo).length, 0);
  const row = (b, i, ref) => `<div class="rrow${i === 0 ? " first" : ""}${b.miss.length ? " inc" : ""}"><span class="medal">${b.miss.length ? "–" : i + 1}</span>${storeChip(b.sid, b.c)}
        <div class="bar">${b.miss.length ? `<span class="sub">le falta${b.miss.length > 1 ? "n" : ""}: ${b.miss.map(p => esc(p.name.split(" ").slice(0, 2).join(" "))).join(", ")}</span>` : `<i style="width:${(b.total / max * 100).toFixed(1)}%;background:${ST[b.sid].color}"></i>`}</div>
        <div class="tot">${money(b.total)}<small>${b.miss.length ? "sin lo que falta" : i ? "+" + money(b.total - ref) : "la más barata"}${b.env ? ` · incluye envío ${money(b.env)}` : ""}</small></div></div>`;
  $("#view").innerHTML = `
  <div class="hero"><div class="wrap">
    <h1>El mejor precio del súper, todos los días</h1>
    <p>Compará el mismo producto en ${D.stores.length} supermercados, mayoristas y apps de CABA y GBA, sus ofertas, el precio online y cuánto te descuenta tu banco, billetera o tarjeta según el día.</p>
    <div class="hstats"><div class="hstat"><b>${D.products.length}</b>productos</div><div class="hstat"><b>${D.stores.length}</b>comercios</div><div class="hstat"><b>${nPromo}</b>ofertas vigentes</div><div class="hstat"><b>${P.promos.length}</b>descuentos con medios de pago</div></div>
  </div></div>
  <div class="wrap">
    <section class="blk"><div class="blk-h"><h2>Hoy ${DIAS[HOY].toLowerCase()} conviene pagar con…</h2><a href="#pagos">Ver toda la semana →</a></div>
      ${MEDIOS ? "" : `<p class="sub" style="margin:-6px 0 10px">Mostramos todos los descuentos. <a href="#" data-medios>Elegí tus medios de pago</a> para ver solo los que podés usar.</p>`}
      <div class="today">${promos.map(pr => `<div class="pcard${MEDIOS && mineOk(pr) ? " mine" : ""}"><div class="pct">${pr.pct}%<small>${topeTxt(pr)}</small></div>
        <div class="pd">${medioBadge(medio(pr))} <b>${esc(medioName(pr))}</b> <span class="tag gr sm">${esc(P.tipos[medio(pr).tipo] || "")}</span><br>en ${pr.stores.map(s => esc(ST[s] ? ST[s].name : s)).join(", ")}
        <div class="how">${pagoIcon(pr)} ${esc(pagoTxt(pr))}</div></div></div>`).join("") || `<div class="empty">Hoy no hay descuentos cargados.</div>`}</div>
    </section>

    <section class="blk basket"><div class="blk-h"><h2>¿Dónde está más barata la canasta básica hoy?</h2><a href="#" data-canasta>Comparar la canasta en detalle →</a></div>
      <p class="sub" style="margin:-6px 0 14px">${items.length} productos de todos los días. Con las ofertas vigentes y el envío si es online, sin descuentos de pago. De cada comercio mostramos lo más barato entre local y online.</p>
      <div class="rank">${full.map((b, i) => row(b, i, full[0].total)).join("") || `<div class="empty">Ningún comercio tiene todos los productos de la canasta.</div>`}${inc.map(b => row(b, 0, 0)).join("")}</div>
    </section>

    <section class="blk"><div class="blk-h"><h2>Categorías</h2></div>
      <div class="cats">${D.cats.filter(c => D.products.some(p => p.cat === c.id)).map(c => `<a class="cat" href="#c-${c.id}"><span class="e">${c.emoji}</span><span>${esc(c.name)}<small>${D.products.filter(p => p.cat === c.id).length} productos</small></span></a>`).join("")}</div>
    </section>

    ${online.length ? `<section class="blk"><div class="blk-h"><h2>🛒 Más baratos comprando online</h2></div>
      <p class="sub" style="margin:-6px 0 10px">Productos que en la tienda web de la cadena están más baratos que en sus sucursales. Ojo con el costo de envío: fijate el mínimo para envío gratis.</p>
      <div class="hscroll">${online.map(({ p, o }) => `<article class="prod" data-open="${p.id}" tabindex="0">${prodImg(p, "ph")}<h3>${esc(p.name)}</h3>
        <div>${storeChip(o.s, "online")}<div class="price">${money(o.po)}</div><div class="unit">en el local ${money(o.p)} · <span class="chg dn">−${Math.round((1 - o.po / o.p) * 100)}% online</span></div></div>
        <div class="meta"><span class="sub">${esc(chanName(o.s, "online"))}</span><button class="add${LISTA[p.id] ? " in" : ""}" data-add="${p.id}">${LISTA[p.id] ? "✓" : "+"}</button></div></article>`).join("")}</div></section>` : ""}

    ${bajaron.length ? `<section class="blk"><div class="blk-h"><h2>▼ Bajaron de precio</h2><a href="#buscar" data-sort="baja">Ver todos →</a></div>
      <div class="hscroll">${bajaron.map(({ p, o }) => `<article class="prod" data-open="${p.id}" tabindex="0">${prodImg(p, "ph")}<h3>${esc(p.name)}</h3>
        <div>${storeChip(o.s, o.p ? null : "online")}<div class="price">${money(refPrice(o))}</div><div class="unit"><s>${money(o.chg.prev)}</s> <span class="chg dn">▼ ${Math.abs(o.chg.pct)}%</span></div></div>
        <div class="meta"><span class="sub">desde ayer</span><button class="add${LISTA[p.id] ? " in" : ""}" data-add="${p.id}">${LISTA[p.id] ? "✓" : "+"}</button></div></article>`).join("")}</div></section>` : ""}

    <section class="blk"><div class="blk-h"><h2>🏷️ Ofertas destacadas</h2><a href="#ofertas">Ver todas →</a></div>
      <div class="hscroll">${ofertas.map(card).join("")}</div></section>

    ${subieron.length ? `<section class="blk"><div class="blk-h"><h2>⚠️ Aviso: subieron de precio</h2></div>
      <p class="sub" style="margin:-6px 0 10px">Si los ibas a comprar, fijate si en otro comercio siguen más baratos.</p>
      <div class="grid">${subieron.map(({ p, o }) => { const b = best(p); return `<article class="prod" data-open="${p.id}" tabindex="0"><h3>${esc(p.name)}</h3>
        <div>${storeChip(o.s)} <span class="chg up">▲ ${o.chg.pct}%</span><div class="unit">${money(o.chg.prev)} → <b>${money(refPrice(o))}</b></div>
        ${b.o.s !== o.s ? `<div class="unit">Más barato ahora: ${where(b)} ${money(b.v)}</div>` : `<div class="unit">Sigue siendo el más barato</div>`}</div></article>`; }).join("")}</div></section>` : ""}

    <section class="blk news" id="novedades-blk"><div><h2>📬 Recibí las mejores ofertas de la semana</h2>
      <p>Te mandamos por correo los descuentos bancarios de cada semana y los productos que más bajaron. Gratis, sin spam y te das de baja cuando quieras.</p></div>
      <button class="btn" data-news>Quiero recibir novedades</button></section>

    <section class="blk" id="como"><div class="blk-h"><h2>Cómo funciona</h2></div>
      <div class="how4">
        <div class="box"><div class="n">1</div><h3>Mismo producto, de verdad</h3><p>Comparamos por código de barras, no por el nombre: la leche de 1 litro de un súper es exactamente la misma que la del otro.</p></div>
        <div class="box"><div class="n">2</div><h3>Local, online o app</h3><p>Mostramos el precio en la sucursal y en la tienda web o app, con el costo de envío. A veces online sale menos.</p></div>
        <div class="box"><div class="n">3</div><h3>Tu forma de pago cuenta</h3><p>Elegí tus bancos, billeteras y tarjetas. Te decimos el precio final y <b>cómo pagar</b> para que el descuento aplique (QR, tarjeta física, NFC…).</p></div>
        <div class="box"><div class="n">4</div><h3>Tu compra entera</h3><p>Armá tu compra y te decimos dónde, qué día y con qué medio sale menos, incluso mezclando dos comercios. Tu carrito lo mandás por WhatsApp o correo.</p></div>
      </div></section>
  </div>`;
}

/* ---------- BUSCAR / CATEGORÍAS ---------- */
const nrm = s => s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
function results() {
  const words = nrm(S.q).split(/\s+/).filter(Boolean);
  const list = D.products.filter(p => {
    if (S.cat && p.cat !== S.cat) return false;
    const n = nrm(p.name + " " + p.brand);
    if (!words.every(w => n.includes(w))) return false;
    if (S.stores.size && !p.offers.some(o => S.stores.has(o.s))) return false;
    if (S.onlyPromo && !hasPromo(p)) return false;
    return true;
  });
  const flt = S.stores.size ? S.stores : null;
  const pr = p => best(p, flt).v;
  const spread = p => { const vs = p.offers.flatMap(o => allChans(o).map(c => price1(o, c))); return vs.length < 2 ? 0 : (Math.max(...vs) - Math.min(...vs)) / Math.max(...vs); };
  const drop = p => Math.min(0, ...p.offers.map(o => (o.chg && !o.anom ? o.chg.pct : 0)));
  const sorters = { relev: (a, b) => (b.offers.length - a.offers.length) || ((b.img ? 1 : 0) - (a.img ? 1 : 0)) || (pr(a) - pr(b)), precio: (a, b) => pr(a) - pr(b), unidad: (a, b) => (perUnit(a, pr(a)) ?? 1e12) - (perUnit(b, pr(b)) ?? 1e12),
    ahorro: (a, b) => spread(b) - spread(a), baja: (a, b) => drop(a) - drop(b), nombre: (a, b) => a.name.localeCompare(b.name, "es") };
  return list.sort(sorters[S.sort] || sorters.relev);
}
const PAGE = 48;
/* paginado con números: 1 2 3 … 10 */
function pager(total, page, id) {
  const pages = Math.ceil(total / PAGE); if (pages <= 1) return "";
  const nums = [...new Set([1, 2, page - 1, page, page + 1, pages - 1, pages].filter(n => n >= 1 && n <= pages))].sort((a, b) => a - b);
  let out = [], prev = 0;
  for (const n of nums) { if (n - prev > 1) out.push('<span class="gap">…</span>'); out.push(`<button class="pg${n === page ? " on" : ""}" data-pg="${id}|${n}" ${n === page ? 'aria-current="page"' : ""}>${n}</button>`); prev = n; }
  return `<nav class="pager" aria-label="Páginas"><button class="pg nav" data-pg="${id}|${page - 1}" ${page <= 1 ? "disabled" : ""}>‹ Anterior</button>${out.join("")}<button class="pg nav" data-pg="${id}|${page + 1}" ${page >= pages ? "disabled" : ""}>Siguiente ›</button></nav>`;
}   // productos por tanda, para que la página no se ponga lenta con miles de resultados
function vBuscar() {
  setTab("buscar");
  const cat = D.cats.find(c => c.id === S.cat);
  const title = S.q ? `Resultados para «${esc(S.q)}»` : cat ? `${cat.emoji} ${esc(cat.name)}` : "Todos los productos";
  $("#view").innerHTML = `<div class="wrap layout">
    <aside class="filters" id="filters" aria-label="Filtros">
      <h4>Categoría</h4>
      <label><input type="radio" name="cat" value="" ${S.cat ? "" : "checked"}> Todas</label>
      ${D.cats.filter(c => D.products.some(p => p.cat === c.id)).map(c => `<label><input type="radio" name="cat" value="${c.id}" ${S.cat === c.id ? "checked" : ""}> ${c.emoji} ${esc(c.name)}</label>`).join("")}
      <h4>Dónde comprar</h4>
      ${[["ambos", "Local y online"], ["tienda", "Solo en el local"], ["online", "Solo online / apps"]].map(([v, t]) => `<label><input type="radio" name="can" value="${v}" ${S.canal === v ? "checked" : ""}> ${t}</label>`).join("")}
      ${grupos().map(([n, ss], i) => `<h4>${n}${i === 0 ? ' <button class="linkbtn" id="stall"></button>' : ""}</h4>
      <div class="stlist">${ss.map(s => `<label><input type="checkbox" name="st" value="${s.id}" ${S.stores.has(s.id) ? "checked" : ""}> ${storeChip(s.id)}</label>`).join("")}</div>`).join("")}
      <h4>Mostrar</h4>
      <label><input type="checkbox" id="fpromo" ${S.onlyPromo ? "checked" : ""}> Solo con oferta</label>
      <button class="btn sm fbtn" id="fclose" style="margin-top:12px">Ver resultados</button>
    </aside>
    <div>
      <div class="toolbar"><div><h1>${title}</h1><span class="sub" id="rcount"></span></div>
        <div style="display:flex;gap:8px"><button class="btn sec sm fbtn" id="fopen">Filtros</button>
        <select class="sel" id="sort" aria-label="Ordenar">
          ${[["relev", "Más populares"], ["precio", "Menor precio"], ["unidad", "Menor precio por kg / litro"], ["ahorro", "Mayor diferencia entre comercios"], ["baja", "Más bajaron"], ["nombre", "Nombre (A-Z)"]].map(([v, t]) => `<option value="${v}" ${S.sort === v ? "selected" : ""}>${t}</option>`).join("")}
        </select></div></div>
      <div class="grid" id="res"></div>
    </div></div>`;
  const draw = () => {
    const r = results();
    $("#rcount").textContent = `${r.length} ${r.length === 1 ? "producto" : "productos"}${S.stores.size ? " · precios de los comercios elegidos" : ""}`;
    const pages = Math.max(1, Math.ceil(r.length / PAGE)); if (S.bpage > pages) S.bpage = 1;
    const pg = S.bpage || 1;
    $("#res").innerHTML = (r.slice((pg - 1) * PAGE, pg * PAGE).map(card).join("") || `<div class="empty" style="grid-column:1/-1">No encontramos productos con esos filtros.<br><br><button class="btn sec sm" id="clr">Limpiar filtros</button></div>`)
      + `<div class="more">${pager(r.length, pg, "b")}</div>`;
    $$("[data-pg]", $("#res")).forEach(b => b.onclick = () => { S.bpage = +b.dataset.pg.split("|")[1]; draw(); $("#view").scrollIntoView({ behavior: "smooth" }); });
    const c = $("#clr"); if (c) c.onclick = () => { S.q = ""; $("#q").value = ""; S.cat = ""; S.stores.clear(); S.onlyPromo = false; S.canal = "ambos"; vBuscar(); };
    $("#stall").textContent = S.stores.size ? "ver todos" : "";
  };
  $$("input[name=cat]").forEach(i => i.onchange = () => { S.bpage = 1; S.cat = i.value; history.replaceState(null, "", S.cat ? "#c-" + S.cat : "#buscar"); vBuscar(); });
  $$("input[name=can]").forEach(i => i.onchange = () => { S.bpage = 1; S.canal = i.value; draw(); });
  $$("input[name=st]").forEach(i => i.onchange = () => { S.bpage = 1; i.checked ? S.stores.add(i.value) : S.stores.delete(i.value); draw(); });
  $("#stall").onclick = () => { S.stores.clear(); $$("input[name=st]").forEach(i => (i.checked = false)); draw(); };
  $("#fpromo").onchange = e => { S.bpage = 1; S.onlyPromo = e.target.checked; draw(); };
  $("#sort").onchange = e => { S.bpage = 1; S.sort = e.target.value; draw(); };
  $("#fopen").onclick = () => $("#filters").classList.add("open");
  $("#fclose").onclick = () => $("#filters").classList.remove("open");
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
function vOfertas() {
  setTab("ofertas");
  const all = D.products.flatMap(p => p.offers.flatMap(o => [["tienda", o.promo], ["online", o.promoo]].filter(x => x[1]).map(([c, pr]) => ({ p, o, c, pr }))));
  const tipos = [...new Set(all.map(x => tipo(x.pr.txt)))].sort();
  const list = all.filter(x => (!S.otipo || tipo(x.pr.txt) === S.otipo) && (!S.ostore || x.o.s === S.ostore))
    .sort((a, b) => (a.pr.pu / base(a.o, a.c)) - (b.pr.pu / base(b.o, b.c)));
  $("#view").innerHTML = `<div class="wrap"><section class="blk">
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
        <div class="meta"><span class="sub">${unitTxt(p, pr.pu)}</span><button class="add${LISTA[p.id] ? " in" : ""}" data-add="${p.id}">${LISTA[p.id] ? "✓" : "+"}</button></div></article>`;
    }).join("") || `<div class="empty" style="grid-column:1/-1">No hay ofertas con ese filtro.</div>`}
    <div class="more">${pager(list.length, S.opage || 1, "o")}</div></div></section></div>`;
  $$("[data-pg]").forEach(b => b.onclick = () => { S.opage = +b.dataset.pg.split("|")[1]; vOfertas(); scrollTo({ top: 0, behavior: "smooth" }); });
  $$("[data-ot]").forEach(b => b.onclick = () => { S.otipo = b.dataset.ot; S.opage = 1; vOfertas(); });
  $("#ostore").onchange = e => { S.ostore = e.target.value; S.opage = 1; vOfertas(); };
}

/* ---------- DESCUENTOS POR DÍA ---------- */
function promoCard(pr) {
  const m = medio(pr);
  return `<div class="promo">
    <div class="top"><div class="mname">${medioBadge(m)}<div><b>${esc(m.name)}</b> <span class="tag gr sm">${esc(P.tipos[m.tipo] || "")}</span>${MEDIOS && mineOk(pr) ? ' <span class="tag g sm">Lo tenés</span>' : ""}
      ${needs(pr).length ? `<div class="req">Requiere además: ${needs(pr).map(r => esc((P.medioBy[r] || { name: r }).name)).join(", ")}</div>` : ""}</div></div>
      <div class="pp">${pr.pct ? pr.pct + "%" : pr.cuotas + " cuotas"}</div></div>
    <div class="stores">${pr.stores.filter(s => ST[s]).map(s => storeChip(s)).join(" ")}</div>
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
  const okF = pr => (!S.pstore || pr.stores.includes(S.pstore)) && (!S.pmine || mineOk(pr)) && (!S.ptipo || medio(pr).tipo === S.ptipo);
  const list = P.promos.filter(pr => pr.dias.includes(day) && okF(pr)).sort((a, b) => b.pct - a.pct || (b.cuotas || 0) - (a.cuotas || 0));
  const cellPct = (sid, d) => Math.max(0, ...P.promos.filter(pr => pr.stores.includes(sid) && pr.dias.includes(d) && (S.pmine ? mineOk(pr) : (!needs(pr).length || mineOk(pr))) && (!S.ptipo || medio(pr).tipo === S.ptipo)).map(pr => pr.pct));
  const ej = P.promos.some(p => p.ejemplo);
  $("#view").innerHTML = `<div class="wrap"><section class="blk">
    <div class="toolbar"><div><h1>💳 Descuentos por día y medio de pago</h1><span class="sub">Bancos, billeteras virtuales, tarjetas y clubes de cada comercio, con cómo hay que pagar para que el descuento aplique.</span></div>
      <button class="btn sec sm" data-medios>💳 ${MEDIOS ? `Mis medios (${MEDIOS.length})` : "Elegir mis medios"}</button></div>
    ${ej ? `<div class="note" style="margin-bottom:14px">Estos descuentos son <b>de ejemplo</b>. En la versión real cada uno lleva el enlace a la página oficial y la fecha en que lo verificamos.</div>`
      : `<div class="note ok" style="margin-bottom:14px">✅ Descuentos reales de ${esc(mesTxt(P.relevado))}, relevados el ${esc((P.relevado || "").split("-").reverse().join("/"))} de páginas oficiales, relevamientos y notas periodísticas (cada uno dice su fuente). Cambian seguido: confirmalos antes de pagar.</div>`}
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
  const b = best(p);
  return `<div class="litem">${prodImg(p, "e")}
    <div><div class="n" data-open="${p.id}">${esc(p.name)}</div><div class="sub">Desde ${money(b.v)} en ${esc(chanName(b.o.s, b.c))} · en ${p.offers.length} comercios</div></div>
    <div class="qty"><button data-q="${kind}|${p.id}" data-d="-1" aria-label="Uno menos">−</button><span>${qty}</span><button data-q="${kind}|${p.id}" data-d="1" aria-label="Uno más">+</button></div>
    <button class="rm" data-rm="${kind}|${p.id}" aria-label="Sacar">✕</button></div>`;
}
function bindQty(rerender) {
  $$("[data-q]").forEach(b => b.onclick = () => { const [k, id] = b.dataset.q.split("|"), o = k === "c" ? LISTA : PLAN; o[id] = Math.max(1, Math.min(99, o[id] + +b.dataset.d)); k === "c" ? saveLista() : savePlan(); rerender(); });
  $$("[data-rm]").forEach(b => b.onclick = () => { const [k, id] = b.dataset.rm.split("|"); delete (k === "c" ? LISTA : PLAN)[id]; k === "c" ? saveLista() : savePlan(); rerender(); });
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
  const n = items.reduce((a, i) => a + i.qty, 0), approx = items.reduce((a, { p, qty }) => a + best(p).v * qty, 0);
  const link = shareLink(items), txt = shareText(items);
  $("#view").innerHTML = `<div class="wrap lgrid">
    <section class="box"><div class="blk-h"><h2>🛒 Mi carrito <span class="sub" style="font-weight:500">· ${items.length} productos, ${n} unidades</span></h2><button class="btn sec sm" id="lclear">Vaciar</button></div>
      ${items.map(({ p, qty }) => qtyRow(p, qty, "c")).join("")}
      <p class="sub" style="margin-top:12px">Comprando cada producto donde está más barato, sin descuentos, sería alrededor de <b>${money(approx)}</b>.</p></section>
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
  let t = `🛒 Mi carrito del súper (${items.length} productos)\n${items.map(({ p, qty }) => `• ${qty} × ${p.name}`).join("\n")}`;
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
      <div class="tscroll"><table class="cmp"><thead><tr><th>Producto</th><th>Dónde</th><th class="r">Precio</th><th class="r">En ${esc(optName(bst || split.parts[0]))}</th></tr></thead><tbody>
      ${split.parts.flatMap(b => b.lines.map(l => {
        const alt = bst && bst.lines.find(x => x.p.id === l.p.id);
        return `<tr><td>${esc(l.p.name)}${l.qty > 1 ? ` <b>×${l.qty}</b>` : ""}${l.lc.promo ? `<div class="sub">🏷️ ${esc(l.lc.promo.txt)}</div>` : ""}</td><td>${storeChip(b.sid, b.c)}</td><td class="r"><b>${money(l.lc.total)}</b></td><td class="r sub">${alt ? money(alt.lc.total) : "—"}</td></tr>`;
      })).join("")}</tbody>
      <tfoot>${split.parts.map(b => `<tr><td colspan="2">Subtotal en ${esc(optName(b))}${b.pay.promo ? ` <span class="sub">· 💳 ${esc(medioName(b.pay.promo))} −${money(b.pay.disc)} (${esc(pagoTxt(b.pay.promo))})</span>` : ""}${b.env ? ` <span class="sub">· envío ${money(b.env)}</span>` : ""}</td><td class="r"><b>${money(b.total)}</b></td><td class="r">${cartBtn(b, true)}</td></tr>`).join("")}</tfoot></table></div></section>` : "";

  const shown = rk.slice(0, 15);
  const optTable = `<section class="box"><h3>Todas las opciones comprando todo en un solo lugar · ${DIAS[day]}</h3>
    <div class="tscroll"><table class="cmp"><thead><tr><th>#</th><th>Comercio</th><th class="r">Sin descuentos</th><th class="r">Ofertas</th><th>Medio de pago del día</th><th class="r">Envío</th><th class="r">Total</th><th class="r">Diferencia</th><th></th></tr></thead><tbody>
    ${shown.map((b, i) => `<tr class="${b === bst ? "top" : ""}${b.miss.length ? " inc" : ""}"><td>${b.miss.length ? "–" : i + 1}</td><td>${storeChip(b.sid, b.c)}${b.miss.length ? `<div class="miss">Le falta${b.miss.length > 1 ? "n" : ""}: ${b.miss.map(p => esc(shortName(p))).join(", ")}</div>` : ""}</td>
      <td class="r">${money(b.reg)}</td><td class="r okc">${b.promoSave > 0 ? "−" + money(b.promoSave) : "—"}</td>
      <td>${b.pay.promo ? `<span class="okc">−${money(b.pay.disc)}</span> ${esc(medioName(b.pay.promo))} ${b.pay.promo.pct}%<div class="sub">${esc(pagoTxt(b.pay.promo))}</div>` : '<span class="sub">—</span>'}</td>
      <td class="r">${b.c === "online" ? (b.env ? money(b.env) : "gratis") : "—"}</td>
      <td class="r"><b>${money(b.total)}</b>${b.miss.length ? '<div class="sub">sin lo que falta</div>' : ""}</td>
      <td class="r">${b.miss.length || !bst ? "" : b === bst ? '<span class="tag g sm">la mejor</span>' : `+${money(b.total - bst.total)}`}</td>
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
    const hits = D.products.filter(p => ws.every(w => nrm(p.name + " " + p.brand).includes(w))).sort((a, b) => b.offers.length - a.offers.length).slice(0, 8);
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
  const b = best(p), worst = Math.max(...p.offers.flatMap(o => allChans(o).map(c => base(o, c))));
  const rows = [...p.offers].sort((x, y) => Math.min(...allChans(x).map(c => price1(x, c))) - Math.min(...allChans(y).map(c => price1(y, c))));
  const watching = id in AVISOS;
  const first = p.name.split(" ")[0].toLowerCase();
  const alts = D.products.filter(x => x.id !== p.id && x.bu === p.bu && x.name.split(" ")[0].toLowerCase() === first)
    .map(x => ({ x, bx: best(x), u: perUnit(x, best(x).v) })).filter(a => a.u && a.u < perUnit(p, b.v)).sort((a, c) => a.u - c.u).slice(0, 4);
  // el más barato pagando hoy con un descuento de medio de pago
  let bp = null;
  for (const o of p.offers) for (const c of chans(o)) { const pay = payDiscount(o.s, HOY, c, price1(o, c)); const v = price1(o, c) - pay.disc; if (pay.promo && (!bp || v < bp.v)) bp = { o, c, v, pay }; }
  const payToday = (o, c) => {
    const pay = payDiscount(o.s, HOY, c, price1(o, c));
    if (!pay.promo) return "";
    return `<div class="pline pay"><span class="k">💳 Hoy ${DIAS[HOY].toLowerCase()} con ${esc(medioName(pay.promo))} (−${pay.promo.pct}%)</span> <b>${money(price1(o, c) - pay.disc)}</b>
      <div class="sub">${pagoIcon(pay.promo)} Cómo pagar: ${esc(pagoTxt(pay.promo))} · ${topeTxt(pay.promo)}${pay.promo.minimo ? ` · compra mínima ${money(pay.promo.minimo)}` : ""}</div></div>`;
  };
  const priceCell = (o, c) => {
    const v = base(o, c); if (!v) return '<span class="sub">No se vende por este canal</span>';
    const pr = promoOf(o, c), other = base(o, c === "online" ? "tienda" : "online");
    return `<div class="pline"><span class="k">Precio sin descuentos</span> <span class="pp">${money(v)}</span></div>
      ${c === "online" && other && v < other ? `<span class="tag b sm">${Math.round((1 - v / other) * 100)}% más barato que en el local</span>` : ""}
      ${c === "online" && other && v > other ? `<div class="sub">${Math.round((v / other - 1) * 100)}% más caro que en el local</div>` : ""}
      ${pr ? `<div class="pline promo"><span class="k">🏷️ Oferta del comercio: ${esc(pr.txt)}</span> <b>${money(pr.pu)}</b> c/u
        <div class="sub">${pr.n > 1 ? `Solo llevando ${pr.n} unidades. ` : ""}Vigente según la última lectura; vale con cualquier medio de pago.</div></div>` : ""}
      ${payToday(o, c)}`;
  };
  // descuentos de medios de pago de cada día en ese comercio (el mejor de cada día)
  const week = sid => DIAS.map((d, i) => {
    const ps = P.promos.filter(pr => pr.stores.includes(sid) && pr.dias.includes(i) && pr.pct > 0 && (!needs(pr).length || mineOk(pr)) && (!MEDIOS || mineOk(pr)));
    const top = ps.sort((a, c) => c.pct - a.pct)[0];
    return top ? `<a class="wk${i === HOY ? " hoy" : ""}" href="#pagos" data-wk="${sid}|${i}" title="${esc(medioName(top) + ": " + pagoTxt(top))}">${DCORTO[i]} <b>${top.pct}%</b> ${esc(medioName(top))}</a>` : "";
  }).join("");
  const link = o => {
    const u0 = o.url || (o.lk && ST[o.s].online && ST[o.s].online.vtex ? `https://${ST[o.s].online.vtex}/${o.lk}/p` : null);
    if (u0) return `<a class="go" href="${esc(u0)}" target="_blank" rel="noopener">Ver producto ↗</a>`;
    const u = goUrl(o.s, p);
    return u ? `<a class="go sec" href="${esc(u)}" target="_blank" rel="noopener" title="Abre la búsqueda de la tienda; puede mostrar productos parecidos">Buscar en la tienda ↗</a>` : '<span class="sub">Sin tienda online</span>';
  };
  dr.innerHTML = `<div class="dh">${prodImg(p, "ph")}<div><h2 id="dtitle">${esc(p.name)}</h2>
      <div class="sub">${esc(p.brand)} · ${esc((D.cats.find(c => c.id === p.cat) || {}).name || "")} · código de barras ${esc(p.id)}</div></div>
      <button class="x" id="dclose" aria-label="Cerrar">✕</button></div>
    <div class="db">
      <div class="box best">
        <div><div class="sub">Más barato sin descuentos</div><div class="big">${money(b.v)}</div><div class="sub">${where(b)}${b.c === "online" ? " · más envío" : ""}</div><div class="sub">${unitTxt(p, b.v)}</div></div>
        ${bp && bp.v < b.v ? `<div class="bestpay"><div class="sub">Pagando hoy con descuento</div><div class="big">${money(bp.v)}</div><div class="sub">${storeChip(bp.o.s, bp.c)} con <b>${esc(medioName(bp.pay.promo))}</b></div><div class="sub">${pagoIcon(bp.pay.promo)} ${esc(pagoTxt(bp.pay.promo))}</div></div>` : ""}
        <div class="bbtn">
          <button class="btn${LISTA[id] ? " sec" : ""}" data-add="${id}">${LISTA[id] ? "✓ En tu carrito" : "🛒 Agregar al carrito"}</button>
          <button class="btn sec" data-plan="${id}">📊 Sumar a ¿Dónde conviene?</button>
          <button class="btn sec" id="watch">${watching ? "🔔 Avisando" : "🔔 Avisarme si baja"}</button></div>
        ${p.offers.length > 1 ? `<div class="sub" style="flex-basis:100%">Entre el más barato y el más caro hay ${money(worst - b.v)} de diferencia (${Math.round((1 - b.v / worst) * 100)}%).</div>` : ""}</div>

      <div class="box"><h3>Precio en cada comercio</h3>
        <p class="sub" style="margin:-4px 0 10px">Cada precio dice si es <b>sin descuentos</b>, con una <b>oferta del comercio</b> (vale para todos) o con un <b>descuento de medio de pago</b> (solo ese día y pagando de esa forma).</p>
        <div class="tscroll"><table class="offers"><thead><tr><th>Comercio</th><th>🏬 En el local</th><th>🛒 Online / app</th><th></th></tr></thead><tbody>
        ${rows.map((o, i) => `<tr class="${i ? "" : "top"}"><td>${storeChip(o.s)}${o.low ? '<div><span class="tag g sm">mín. 60 días</span></div>' : ""}
            ${o.chg && !o.anom ? `<div class="chg ${o.chg.pct < 0 ? "dn" : "up"}">${o.chg.pct < 0 ? "▼" : "▲"} ${Math.abs(o.chg.pct)}% <span class="sub">desde la lectura anterior</span></div>` : ""}
            ${o.pmax ? `<div class="sub">hasta ${money(o.pmax)} según sucursal</div>` : ""}
            ${o.bulto > 1 ? `<div class="sub">📦 Precio por unidad llevando el bulto de ${o.bulto}</div>` : ""}
            ${ST[o.s].nota ? `<div class="sub">${esc(ST[o.s].nota)}</div>` : ""}
            ${o.anom ? `<div class="warn">⚠️ Precio inusual: cambió ${o.chg.pct}% de un día al otro. Puede ser un error de carga; confirmalo antes de ir.</div>` : ""}</td>
          <td data-l="🏬 En el local">${priceCell(o, "tienda")}</td>
          <td data-l="🛒 ${esc(chanName(o.s, "online"))}">${priceCell(o, "online")}</td>
          <td>${link(o)}</td></tr>
          ${week(o.s) ? `<tr class="wkrow"><td colspan="4"><span class="sub">💳 Descuentos con medios de pago en ${esc(ST[o.s].name)} esta semana${MEDIOS ? " (tus medios)" : ""}:</span> ${week(o.s)}</td></tr>` : ""}`).join("")}</tbody></table></div>
        <p class="sub" style="margin:10px 0 0">Local: precio más común entre las sucursales de ${esc(D.region || "la zona")} (base oficial SEPA). Online: precio de la tienda web, sin envío. Datos del ${esc(D.updated.split("-").reverse().join("/"))}. Los descuentos de medios de pago no se suman entre sí: se muestra el mayor.</p></div>

      <div class="box"><h3>Historial de precios</h3><div class="chart" id="chart"><div class="sub">Cargando…</div></div><div class="legend" id="legend"></div></div>

      ${alts.length ? `<div class="box"><h3>Más barato por ${UNIT[p.bu]}</h3><p class="sub" style="margin:-6px 0 10px">Otras opciones de ${esc(first)} que rinden más por la misma plata.</p>
        <div class="alts">${alts.map(({ x, bx, u }) => `<button class="alt" data-open="${x.id}"><span><b>${esc(x.name)}</b><br><span class="sub">${money(bx.v)} en ${esc(chanName(bx.o.s, bx.c))}</span></span>
          <span style="text-align:right"><b>${money(u)}</b><br><span class="chg dn">−${Math.round((1 - u / perUnit(p, b.v)) * 100)}% por ${UNIT[p.bu]}</span></span></button>`).join("")}</div></div>` : ""}
    </div>`;
  if (dr.hidden) { dr.hidden = false; sc.hidden = false; document.body.style.overflow = "hidden"; openProduct.back = document.activeElement; }
  dr.scrollTop = 0;
  $("#dclose").onclick = closeDrawer; $("#dclose").focus();
  $("#watch").onclick = () => { if (id in AVISOS) { delete AVISOS[id]; toast("Ya no te avisamos"); } else { AVISOS[id] = b.v; toast("Te avisamos con la 🔔 cuando baje"); } LS.set("cs_avisos", AVISOS); refreshAvisos(); openProduct(id); };
  $$("[data-wk]", dr).forEach(a => a.onclick = e => { e.preventDefault(); const [s, d] = a.dataset.wk.split("|"); S.pstore = s; S.pday = +d; closeDrawer(); location.hash = "pagos"; route(); });
  if (location.hash !== "#p-" + id) history.replaceState(null, "", "#p-" + id);
  chart(p);
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
function openModal(html) { const m = $("#modal"); m.innerHTML = html; m.hidden = false; $("#scrim").hidden = false; const f = m.querySelector("input, button"); f && f.focus(); }
function closeModal() { $("#modal").hidden = true; if ($("#drawer").hidden) $("#scrim").hidden = true; }
function modalMedios() {
  const sel = new Set(MEDIOS || []);
  const groups = Object.entries(P.tipos).filter(([k]) => k !== "general").map(([k, v]) => [k, v, P.medios.filter(m => m.tipo === k).sort((a, b) => a.name.localeCompare(b.name, "es"))]).filter(g => g[2].length);
  openModal(`<h2>💳 Mis medios de pago</h2><p class="sub">Marcá los bancos, billeteras, tarjetas y clubes que tenés. Calculamos los precios finales solo con esos descuentos. Se guarda en este navegador, no se manda a ningún lado.</p>
    ${groups.map(([k, v, ms]) => `<h4 class="mg">${esc(v)}</h4><div class="mgrid">${ms.map(m => `<label class="mopt"><input type="checkbox" value="${m.id}" ${sel.has(m.id) ? "checked" : ""}>${medioBadge(m)}<span>${esc(m.name)}<small>${P.promos.filter(pr => pr.medio === m.id).length} beneficios</small></span></label>`).join("")}</div>`).join("")}
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
  if (!D) return;   // todavía cargando: load() llama a route() al terminar
  const h = location.hash.slice(1) || "inicio";
  if (h.startsWith("l-")) { importList(h.slice(2)); return; }
  if (h.startsWith("p-")) { if (!$("#view").dataset.v) { closeDrawer.under = "inicio"; vInicio(); $("#view").dataset.v = "inicio"; } openProduct(h.slice(2)); return; }
  if (!$("#drawer").hidden) { $("#drawer").hidden = true; $("#scrim").hidden = $("#modal").hidden; document.body.style.overflow = ""; }
  let v = h;
  if (h.startsWith("c-")) { S.cat = h.slice(2); S.q = ""; $("#q").value = ""; v = "buscar"; }
  if (v === "lista") v = "carrito";   // enlaces viejos
  ({ inicio: vInicio, buscar: vBuscar, ofertas: vOfertas, pagos: vPagos, carrito: vCarrito, conviene: vConviene, sugerencias: vSugerencias }[v] || vInicio)();
  $("#view").dataset.v = v; closeDrawer.under = h;
}

document.addEventListener("click", e => {
  const add = e.target.closest("[data-add]"); if (add) { e.stopPropagation(); addToList(add.dataset.add); if (!$("#drawer").hidden) openProduct(add.dataset.add); return; }
  const op = e.target.closest("[data-open]"); if (op) { closeModal(); openProduct(op.dataset.open); return; }
  if (e.target.closest("[data-close]")) { closeModal(); return; }
  if (e.target.closest("[data-medios]")) { e.preventDefault(); modalMedios(); return; }
  if (e.target.closest("[data-news]")) { e.preventDefault(); modalNews(); return; }
  const cn = e.target.closest("[data-canal]"); if (cn) { S.canal = cn.dataset.canal; route(); return; }
  if (e.target.closest("[data-canasta]")) { e.preventDefault(); canasta().forEach(({ p }) => (PLAN[p.id] = PLAN[p.id] || 1)); savePlan(); toast("Canasta básica cargada para comparar"); location.hash === "#conviene" ? route() : (location.hash = "conviene"); return; }
  const pl = e.target.closest("[data-plan]"); if (pl) { PLAN[pl.dataset.plan] = (PLAN[pl.dataset.plan] || 0) + 1; savePlan(); toast("Sumado a ¿Dónde conviene mi compra? 📊"); return; }
  const so = e.target.closest("[data-sort]"); if (so) { S.sort = so.dataset.sort; S.cat = ""; S.q = ""; }
});
document.addEventListener("keydown", e => {
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

load().then(() => {
  $("#demo").hidden = !D.demo;
  $("#year").textContent = new Date().getFullYear();
  $("#fupd").textContent = `Precios del ${D.updated.split("-").reverse().join("/")} · ${D.region}`;
  $("#mdot").hidden = !MEDIOS;
  saveLista(); refreshAvisos(); route();
}).catch(err => { $("#view").innerHTML = `<div class="wrap"><div class="empty" style="margin:40px 0">No se pudieron cargar los precios. Probá recargar la página.<br><span class="sub">${esc(err.message)}</span></div></div>`; });
