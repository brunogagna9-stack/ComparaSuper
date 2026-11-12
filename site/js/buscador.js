/* ComparáSúper: proceso de fondo (Web Worker).
   Baja y lee los productos y arma el índice del buscador SIN trabar la pantalla: la página
   solo recibe la lista ya lista y le pregunta qué productos coinciden con lo que escribiste.
   Buscador: MiniSearch (licencia MIT, js/vendor/minisearch.js) con tolerancia a errores de
   ortografía y a cómo suenan las palabras ("yerva" → yerba, "aseite" → aceite). */
importScripts("datos.js", "vendor/minisearch.js", "vendor/idb-keyval.js");   // idb-keyval (Apache 2.0): guarda en el celular

const nrm = s => (s || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
// clave "fonética" en español: v/b, z/s, c/k/qu, ll/y, h muda, letras repetidas
const fon = w => nrm(w).replace(/[^a-z0-9ñ]/g, "").replace(/ñ/g, "n").replace(/ch/g, "§").replace(/h/g, "").replace(/§/g, "ch").replace(/v/g, "b").replace(/w/g, "u")
  .replace(/z/g, "s").replace(/c([ei])/g, "s$1").replace(/qu/g, "k").replace(/c/g, "k").replace(/ll/g, "y").replace(/g([ei])/g, "j$1").replace(/x/g, "ks").replace(/(.)\1+/g, "$1");
const partir = s => nrm(s).split(/[^a-z0-9ñ]+/).filter(Boolean);

let MS = null, VOC = null;

function lev(a, b, max) {
  if (Math.abs(a.length - b.length) > max) return max + 1;
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i]; let mn = i;
    for (let j = 1; j <= b.length; j++) { cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1)); mn = Math.min(mn, cur[j]); }
    if (mn > max) return max + 1;
    prev = cur;
  }
  return prev[b.length];
}
function corregir(w) {
  if (w.length < 4 || VOC.has(w) || /\d/.test(w)) return w;
  const max = w.length >= 7 ? 2 : 1; let best = null;
  for (const [x, n] of VOC) { if (x[0] !== w[0] && fon(x)[0] !== fon(w)[0]) continue; const d = lev(w, x, max); if (d <= max && (!best || d < best.d || (d === best.d && n > best.n))) best = { x, d, n }; }
  return best ? best.x : w;
}

const OPC_MS = {
  fields: ["name", "brand"], idField: "id",
  tokenize: s => partir(s),
  processTerm: t => { const f = fon(t); return f || null; },
  searchOptions: { boost: { name: 2 }, combineWith: "AND", prefix: t => t.length >= 2, fuzzy: t => (t.length >= 6 ? 0.2 : t.length >= 4 ? 1 : 0) },
};
function vocabular(L) { VOC = new Map(); for (const p of L) for (const w of new Set(partir(p.name + " " + p.brand))) if (w.length > 2 && !/\d/.test(w)) VOC.set(w, (VOC.get(w) || 0) + 1); }
function indexar(L) {
  vocabular(L);
  const ms = new MiniSearch(OPC_MS);
  ms.addAll(L.map(p => ({ id: p.id, name: p.name, brand: p.brand })));
  MS = ms;
}

function buscar(q) {
  const words = partir(q);
  if (!words.length) return { ids: [], fix: "", comp: [] };
  let r = MS.search(words.join(" ")), fix = "";
  if (!r.length) {   // nada: probar corrigiendo cada palabra con las que existen en los productos
    const fixed = words.map(corregir);
    if (fixed.join(" ") !== words.join(" ")) { fix = fixed.join(" "); r = MS.search(fix); }
  }
  const last = words[words.length - 1], head = words.slice(0, -1);
  const comp = [...VOC].filter(([w]) => w.startsWith(last) && w !== last).sort((a, b) => b[1] - a[1]).slice(0, 4).map(([w]) => [...head, w].join(" "));
  return { ids: r.map(x => x.id), fix, comp };
}

/* los tickets abrevian mucho ("LECH SERENIS ENT"): se buscan las palabras de a una menos hasta encontrar algo */
function matchLinea(txt) {
  let ws = partir(txt).filter(w => w.length >= 3 && !/\d/.test(w)).slice(0, 5);
  if (!ws.length) return null;
  for (let n = ws.length; n >= Math.min(2, ws.length); n--) {
    const r = MS.search(ws.slice(0, n).join(" "), { combineWith: "AND", prefix: true, fuzzy: t => (t.length >= 5 ? 0.25 : 0) });
    if (r.length) return { ids: r.slice(0, 15).map(x => x.id), conf: n / ws.length };
  }
  return null;
}

/* lo guardado en el celular (IndexedDB): si los precios son los mismos de la última visita, no se baja nada */
const IDB = self.idbKeyval;
const guardado = async k => { try { return IDB ? await IDB.get(k) : null; } catch { return null; } };
const guardar = (k, v) => { try { IDB && IDB.set(k, v).catch(() => {}); } catch {} };
const quitarFuera = (L, fuera) => { if (!fuera || !fuera.length) return L; const F = new Set(fuera); return L.map(x => ({ ...x, offers: x.offers.filter(o => !F.has(o.s)) })).filter(x => x.offers.length); };

async function bajar(url) {
  const r = await fetch(url);
  if (!r.ok) throw new Error(r.status);
  return r.json();
}

onmessage = async e => {
  const m = e.data;
  if (m.t === "cargar") {
    let listo = false, top = null;
    const kP = "productos:" + m.full, kI = "indice:" + m.full + "|" + (m.fuera || []).join(",");
    const g = m.clave ? await guardado(kP) : null, desdeCache = !!(g && g.clave === m.clave);
    if (!desdeCache) top = m.top ? bajar(m.top).then(d => { if (!listo) postMessage({ t: "top", products: quitarFuera(decodificar(d), m.fuera) }); }).catch(() => {}) : null;
    try {
      let todos;
      if (desdeCache) todos = g.L;
      else { todos = decodificar(await bajar(m.full)); if (m.clave) guardar(kP, { clave: m.clave, L: todos }); }
      const L = quitarFuera(todos, m.fuera);
      listo = true;
      postMessage({ t: "origen", cache: desdeCache });
      // se manda en partes: así la página recibe de a poco y la pantalla no se congela
      for (let i = 0; i < L.length; i += 2500) { postMessage({ t: "parte", products: L.slice(i, i + 2500) }); await new Promise(r => setTimeout(r, 0)); }
      postMessage({ t: "full" });
      const gi = m.clave ? await guardado(kI) : null;
      if (gi && gi.clave === m.clave) { try { MS = MiniSearch.loadJSON(gi.json, OPC_MS); vocabular(L); } catch { MS = null; } }
      if (!MS) { indexar(L); if (m.clave) guardar(kI, { clave: m.clave, json: JSON.stringify(MS) }); }
      postMessage({ t: "indice" });
    } catch (err) {
      postMessage({ t: "error", msg: String(err) });
    }
    await top;
  } else if (m.t === "ticket") {   // renglones de un ticket → producto más parecido de cada uno
    postMessage({ t: "ticket", id: m.id, res: MS ? m.lineas.map(matchLinea) : null });
  } else if (m.t === "buscar") {
    postMessage(MS ? { t: "res", id: m.id, q: m.q, ...buscar(m.q) } : { t: "res", id: m.id, q: m.q, nolisto: true });
  }
};
