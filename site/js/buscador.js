/* SuperBarato: proceso de fondo (Web Worker).
   Baja y lee los productos y arma el índice del buscador SIN trabar la pantalla: la página
   solo recibe la lista ya lista y le pregunta qué productos coinciden con lo que escribiste.
   Las reglas de relevancia están en motor.js. */
importScripts("datos.js", "motor.js", "vendor/idb-keyval.js");   // motor.js: reglas de relevancia; idb-keyval (Apache 2.0): guarda en el celular


let MS = null;   // índice de MiniSearch (MIT): solo para leer tickets, se arma la primera vez que hace falta
const { nrm, partir } = Motor;
const OPC_MS = { fields: ["name", "brand"], idField: "id", tokenize: s => partir(s), processTerm: t => Motor.fon(t) || null };
const NOM = new Map(), POP = new Map(), TAM = new Map();   // nombre, en cuántos comercios está (para desempatar) y tamaño (cantidad y unidad base)
let LISTA = [];
const nombres = L => { for (const p of L) { NOM.set(p.id, `${p.name} ${p.brand || ""}`); POP.set(p.id, p.offers.length); if (p.bq && p.bu) TAM.set(p.id, [p.bq, p.bu]); } };
/* tamaño escrito en la búsqueda: "1 l", "1lt", "500 g", "1,5 litros", "900cc" → {q, u} en kg, l o un; el resto se busca como texto */
const UNID = [[/^(kg|kgs|kilo|kilos|k)$/, 1, "kg"], [/^(g|gr|grs|gramos?)$/, 0.001, "kg"], [/^(l|lt|lts|litros?)$/, 1, "l"], [/^(ml|cc|cm3|mililitros?)$/, 0.001, "l"], [/^(u|un|uni|unidad(es)?)$/, 1, "un"]];
function leerTam(q) {
  const m = nrm(q).match(/(\d+(?:[.,]\d+)?)\s*(kgs?|kilos?|k|grs?|gramos?|g|lts?|litros?|l|ml|cc|cm3|mililitros?|unidad(?:es)?|uni|un|u)\b/);
  if (!m) return { tam: null, resto: q };
  const n = parseFloat(m[1].replace(",", ".")), u = UNID.find(([re]) => re.test(m[2]));
  return { tam: u ? { q: n * u[1], u: u[2] } : null, resto: nrm(q).replace(m[0], " ") };
}
const mismoTam = (id, t) => { const x = TAM.get(id); return x && x[1] === t.u && Math.abs(x[0] - t.q) / t.q <= 0.03; };
function indexar(L) { LISTA = L; nombres(L); Motor.indexar(L); MS = null; }
function indiceTickets() { if (!MS) { importScripts("vendor/minisearch.js"); MS = new MiniSearch(OPC_MS); MS.addAll(LISTA.map(p => ({ id: p.id, name: p.name, brand: p.brand }))); } }

function buscar(q, escribiendo) {
  const { tam, resto } = leerTam(q);
  const words = partir(resto);
  if (!words.length && !tam) return { ids: [], fix: "", comp: [] };
  let ids, fix = "";
  if (words.length) ({ ids, fix } = Motor.buscar(words, !!escribiendo)); else ids = [...TAM.keys()];
  let sinTam = false;
  if (tam) { const f = ids.filter(id => mismoTam(id, tam)); if (f.length) ids = f; else sinTam = true; }   // de ese tamaño; si no hay, se avisa y se muestran todos
  const ws = (fix ? fix.split(" ") : words).filter(w => w.length >= 3 && !/\d/.test(w));
  const aprox = ws.filter(w => !ids.slice(0, 30).some(id => Motor.aparece(id, w)));   // palabras que no están literalmente (sinónimos, diminutivos)
  const last = words[words.length - 1] || "", head = words.slice(0, -1);
  const comp = last ? Motor.completar(last).map(w => [...head, w].join(" ")) : [];
  return { ids, fix, comp, aprox, tam: tam && { ...tam, sin: sinTam } };
}

/* los tickets abrevian mucho ("LECH SERENIS ENT"): MiniSearch junta candidatos y fuzzball (licencia MIT) los ordena
   por parecido real del texto, como RapidFuzz ("token set ratio"). */
let FZ = null;
function matchLinea(txt) {
  indiceTickets();
  const ws = partir(txt).filter(w => w.length >= 3 && !/\d/.test(w)).slice(0, 5);
  if (!ws.length) return null;
  const cand = new Map();
  for (let n = ws.length; n >= Math.min(2, ws.length); n--) {   // primero con todas las palabras, después con menos
    const r = MS.search(ws.slice(0, n).join(" "), { combineWith: "AND", prefix: true, fuzzy: t => (t.length >= 5 ? 0.25 : 0) });
    r.slice(0, 40).forEach((x, i) => { if (!cand.has(x.id)) cand.set(x.id, 10 * n / ws.length - i / 40); });
    if (cand.size >= 25) break;
  }
  if (cand.size < 10) MS.search(ws.join(" "), { combineWith: "OR", prefix: true, fuzzy: 0.2 }).slice(0, 40).forEach(x => { if (!cand.has(x.id)) cand.set(x.id, 0); });
  if (!cand.size) return null;
  if (FZ === null) { try { importScripts("vendor/fuzzball.js"); FZ = self.fuzzball || false; } catch { FZ = false; } }
  const qs = partir(txt);
  const pts = [...cand].map(([id, b]) => {
    const nom = nrm(NOM.get(id) || ""), toks = partir(nom);
    // "tirabuz" → "tirabuzon", "serenis" → "serenisima": cada palabra cortada se completa con la del producto
    const t = qs.map(w => (w.length >= 3 && !/\d/.test(w) && toks.find(x => x.startsWith(w))) || w).join(" ");
    return [id, (FZ ? FZ.token_set_ratio(t, nom) : 0) + b + Math.min(POP.get(id) || 0, 20) * 0.4];   // a igual parecido, el más común
  });
  pts.sort((a, b) => b[1] - a[1]);
  return { ids: pts.slice(0, 15).map(x => x[0]), conf: pts[0][1] / 110 };
}

/* lo guardado en el celular (IndexedDB): si los precios son los mismos de la última visita, no se baja nada */
const IDB = self.idbKeyval;
const guardado = async k => { try { return IDB ? await IDB.get(k) : null; } catch { return null; } };
const guardar = (k, v) => { try { IDB && IDB.set(k, v).catch(() => {}); } catch {} };
// el índice viejo (antes se guardaba el de MiniSearch) ya no se usa: se borra para liberar lugar
try { IDB && IDB.keys().then(ks => ks.filter(k => String(k).startsWith("indice:")).forEach(k => IDB.del(k))).catch(() => {}); } catch {}
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
    const kP = "productos:" + m.full;
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
      indexar(L);
      postMessage({ t: "indice" });
    } catch (err) {
      postMessage({ t: "error", msg: String(err) });
    }
    await top;
  } else if (m.t === "ticket") {   // renglones de un ticket → producto más parecido de cada uno
    postMessage({ t: "ticket", id: m.id, res: Motor.listo() ? m.lineas.map(matchLinea) : null });
  } else if (m.t === "buscar") {
    postMessage(Motor.listo() ? { t: "res", id: m.id, q: m.q, esc: m.esc, ...buscar(m.q, m.esc) } : { t: "res", id: m.id, q: m.q, esc: m.esc, ids: [], nolisto: true });
  }
};
