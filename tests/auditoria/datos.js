// Calidad de los datos publicados: fotos, tamaños, precios dudosos, duplicados y antigüedad por cadena.
// Uso: node tests/auditoria/datos.js products.json meta.json
const { cargar } = require("../relevancia/motor-node.js");
const fs = require("fs");
const B = cargar(process.argv[2]), meta = JSON.parse(fs.readFileSync(process.argv[3], "utf8"));
const L = B.L, n = L.length, pct = x => +(100 * x / n).toFixed(1);
const conFoto = L.filter(p => p.img).length, conTam = L.filter(p => p.bq > 0 && p.bu).length;
const tamDudoso = L.filter(p => p.bq > 0 && (p.bu === "un" ? p.bq > 1000 : p.bq > 50)).length;
const ofs = L.flatMap(p => p.offers), anom = ofs.filter(o => o.anom).length, sinPrecio = ofs.filter(o => !o.p && !o.po).length;
const nom = new Map(); for (const p of L) { const k = (p.name + "|" + p.brand).toLowerCase(); nom.set(k, (nom.get(k) || 0) + 1); }
const dup = [...nom.values()].filter(v => v > 1).reduce((a, v) => a + v, 0);
const hoy = new Date(new Date(Date.now() - 3 * 36e5).toISOString().slice(0, 10)),   // hoy en Argentina (antes se medía contra la fecha de los datos y nunca daba atraso)
   dias = s => s.fecha ? Math.round((hoy - new Date(s.fecha)) / 864e5) : null;
const viejas = meta.stores.filter(s => dias(s) > 3);
const unaSola = L.filter(p => p.offers.length === 1).length;
console.log(JSON.stringify({ fecha_datos: meta.updated, productos: n, comercios: meta.stores.length, con_foto_pct: pct(conFoto), con_tamano_pct: pct(conTam),
  tamano_dudoso: tamDudoso, ofertas_de_precio: ofs.length, precios_marcados_anomalos: anom, ofertas_sin_precio: sinPrecio,
  productos_con_nombre_repetido: dup, productos_en_un_solo_comercio_pct: pct(unaSola),
  cadenas_desactualizadas_3d: viejas.map(s => `${s.name} (${dias(s)} días)`), fuentes: meta.fuentes || meta.sources || null }, null, 1));
