// Mide la calidad del buscador con el catálogo real. Uso: node tests/relevancia/evaluar.js [products.json] [--json]
// Juez independiente del motor: un resultado es relevante si TODAS las palabras buscadas están como palabra entera
// (sin acentos; vale el plural/singular, el diminutivo y la abreviatura con punto) en el nombre o la marca, o es su categoría.
const path = require("path");
const { cargar } = require("./motor-node.js");
const CASOS = require("./casos.js");
const prod = process.argv[2] && !process.argv[2].startsWith("--") ? process.argv[2] : path.join(__dirname, "../../site/data/products.json");
const nrm = s => (s || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
const VACIAS = new Set("de del la el los las y en a al para por x un una con sin".split(" "));
const SIN = { birra: "cerveza", yerva: "yerba", aseite: "aceite" };
function formas(w) {   // la palabra, su plural/singular y su diminutivo ("toallitas" ↔ "toallas"): nada más
  const f = new Set([w, w + "s", w + "es"]);
  if (w.length > 3 && w.endsWith("s")) f.add(w.slice(0, -1));
  if (w.length > 4 && w.endsWith("es")) f.add(w.slice(0, -2));
  for (const x of [...f]) { const m = x.match(/^(.{3,})(c?it)(a|o)(s?)$/); if (m) { f.add(m[1] + m[3] + m[4]); f.add(m[1] + m[3]); } }
  for (const x of [...f]) { const m = x.match(/^(.{3,})(a|o)(s?)$/); if (m) { f.add(m[1] + "it" + m[2] + m[3]); f.add(m[1] + "it" + m[2] + "s"); } }
  return f;
}
function juez(p, q) {
  const ts = nrm(p.name + " " + p.brand).split(/[^a-z0-9ñ]+/).filter(Boolean);
  return nrm(q).split(/[^a-z0-9ñ]+/).filter(w => w && !VACIAS.has(w) && !/\d/.test(w)).every(w0 => {
    const w = SIN[w0] || w0, fs = formas(w);
    if (ts.some(t => fs.has(t))) return true;
    if (nrm(p.cat).startsWith(w.replace(/s$/, "")) && w.length >= 5) return true;   // la categoría ("bebidas")
    return [...nrm(p.name).matchAll(/([a-zñ]{5,})\./g)].some(([, a]) => w.startsWith(a));   // abreviado con punto: "Shamp." = shampoo
  });
}
function medir(B, consultas) {
  let p10 = 0, n10 = 0, fp = 0, ret = 0, fnCero = 0, recall = 0, nrec = 0, ms = 0, fn = 0, rel = 0, s6 = 0, n6 = 0;
  for (const q of consultas) {
    const t0 = process.hrtime.bigint(), r = B.buscar(nrm(q)); ms += Number(process.hrtime.bigint() - t0) / 1e6;
    const ids = r.fix ? [] : r.ids;   // lo corregido se muestra aparte ("quizás quisiste decir"): no cuenta como resultado
    const top = ids.slice(0, 10).map(id => B.byId.get(id));
    if (top.length) { p10 += top.filter(p => juez(p, q)).length / top.length; n10++; }
    const todos = ids.map(id => B.byId.get(id)); ret += todos.length; fp += todos.filter(p => !juez(p, q)).length;
    const nRel = B.L.filter(p => juez(p, q)).length, hall = todos.filter(p => juez(p, q)).length;
    rel += nRel; fn += Math.max(0, nRel - hall);
    if (nRel) { nrec++; recall += Math.min(1, hall / nRel); if (!todos.length) fnCero++; }
    const sug = B.buscar(nrm(q), true), s = (sug.fix ? [] : sug.ids).slice(0, 6).map(id => B.byId.get(id));   // lo que muestra el autocompletado
    if (s.length) { s6 += s.filter(p => juez(p, q)).length / s.length; n6++; }
  }
  return { consultas: consultas.length, precision10: +(100 * p10 / n10).toFixed(1), falsosPositivos: fp, pctFalsosPositivos: +(100 * fp / Math.max(ret, 1)).toFixed(1),
    recall: +(100 * recall / nrec).toFixed(1), falsosNegativos: fn, pctFalsosNegativos: +(100 * fn / Math.max(rel, 1)).toFixed(1),
    precisionSugerencias6: +(100 * s6 / n6).toFixed(1), sinResultadosIndebidos: fnCero, msPromedio: +(ms / consultas.length).toFixed(2) };
}
function consultasAuto(L) {   // cientos de búsquedas reales: las palabras con que empiezan los nombres, y pares de palabras
  const c = new Map(), pares = new Map();
  for (const p of L) {
    const ws = nrm(p.name).split(/[^a-z0-9ñ]+/).filter(w => w.length >= 3 && !/\d/.test(w) && !VACIAS.has(w));
    if (ws[0]) c.set(ws[0], (c.get(ws[0]) || 0) + 1);
    if (ws[1]) { const k = ws[0] + " " + ws[1]; pares.set(k, (pares.get(k) || 0) + 1); }
  }
  const top = (m, n) => [...m].filter(([, k]) => k >= 3).sort((a, b) => b[1] - a[1]).slice(0, n).map(([w]) => w);
  return [...top(c, 300), ...top(pares, 150)];
}
function casos(B) {
  const out = [];
  for (const k of CASOS) {
    const r = B.buscar(nrm(k.q)), ids = r.fix ? [] : r.ids, ps = ids.map(id => B.byId.get(id)), txt = p => nrm(p.name + " " + p.brand);
    const err = [];
    if (k.vacio && ps.length) err.push(`debía no encontrar nada y trajo ${ps.length}`);
    if (k.debe) { const malos = ps.slice(0, 10).filter(p => !k.debe.test(txt(p))); if (malos.length) err.push(`entre los primeros: ${malos.slice(0, 3).map(p => p.name).join(" / ")}`); }
    if (k.nunca) { const malos = (k.todos ? ps : ps.slice(0, 20)).filter(p => k.nunca.test(txt(p)) && !(k.debe && k.debe.test(txt(p)))); if (malos.length) err.push(`trajo ${malos.length} que no van: ${malos.slice(0, 3).map(p => p.name).join(" / ")}`); }
    if (k.tam && r.tam && r.tam.sin) err.push("no filtró por tamaño");
    out.push({ q: k.q, ok: !err.length, resultados: ps.length, fix: r.fix || "", err });
  }
  return out;
}
module.exports = { medir, casos, consultasAuto, juez };
if (require.main === module) {
  const B = cargar(prod);
  const qs = consultasAuto(B.L), m = medir(B, qs), cs = casos(B);
  if (process.argv.includes("--json")) console.log(JSON.stringify({ metricas: m, casos: cs }));
  else { console.log(m); cs.forEach(c => console.log(c.ok ? "✓" : "✗", c.q, `(${c.resultados}${c.fix ? ", corregido a " + c.fix : ""})`, c.err.join("; "))); }
}
