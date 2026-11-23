// Vigilancia diaria de la web publicada (la corre .github/workflows/vigilancia.yml). Solo lee; no cambia nada.
// Revisa: que la web responda, que los datos publicados no estén viejos, que el buscador siga encontrando
// lo que corresponde (los mismos casos que las pruebas) y que las fotos de productos carguen.
// Sale con error (y llega un correo) solo si algo está mal de verdad; lo demás queda como aviso en el resumen.
import { writeFileSync, appendFileSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const BASE = process.env.BASE || "https://superbarato.com.ar/";
const fallas = [], avisos = [], ok = [];
const get = async (u, opt = {}) => { const t = Date.now(); const r = await fetch(u, { ...opt, signal: AbortSignal.timeout(30000) }); return { r, ms: Date.now() - t }; };

// 1. la web responde
try { const { r, ms } = await get(BASE); (r.ok ? ok : fallas).push(`Página principal: HTTP ${r.status} en ${ms} ms`); } catch (e) { fallas.push(`Página principal no responde: ${e.message}`); }

// 2. datos publicados al día
let prodFile;
try {
  const { r } = await get(BASE + "data/meta.json?x=" + Date.now()), meta = await r.json();
  const { r: rp } = await get(BASE + "data/products.json?x=" + Date.now()), txt = await rp.text();
  prodFile = join(mkdtempSync(join(tmpdir(), "sb-")), "products.json"); writeFileSync(prodFile, txt);
  const pub = new Date(rp.headers.get("last-modified") || 0), horas = (Date.now() - pub) / 36e5;
  const dias = Math.floor((Date.now() - new Date(meta.updated + "T12:00:00-03:00")) / 864e5);
  (horas <= 36 ? ok : fallas).push(`Datos publicados hace ${Math.round(horas)} h`);
  (dias <= 3 ? ok : avisos).push(`Precios de sucursal del ${meta.updated} (hace ${dias} días)${dias > 3 ? ": la web lo avisa con el cartel amarillo" : ""}`);
} catch (e) { fallas.push(`No se pudieron leer los datos publicados: ${e.message}`); }

// 3. el buscador sigue siendo bueno (mismos casos y medición que las pruebas)
if (prodFile) try {
  const { cargar } = require("../tests/relevancia/motor-node.js"), { medir, casos, consultasAuto } = require("../tests/relevancia/evaluar.js");
  const B = cargar(prodFile), m = medir(B, consultasAuto(B.L)), malos = casos(B).filter(c => !c.ok);
  (malos.length ? fallas : ok).push(`Buscador: ${25 - malos.length}/25 casos de aceptación${malos.length ? " — fallan: " + malos.map(c => c.q).join(", ") : ""}`);
  (m.precision10 >= 97 && m.pctFalsosPositivos <= 5 ? ok : fallas).push(`Buscador: precisión ${m.precision10}% en los 10 primeros, ${m.pctFalsosPositivos}% de resultados que no van, recall ${m.recall}% (${m.consultas} búsquedas)`);
  // 4. fotos: una muestra al azar
  const con = B.L.filter(p => p.img), muestra = Array.from({ length: 80 }, () => con[Math.floor(Math.random() * con.length)]);
  let rotas = 0, sinResp = 0;
  await Promise.all(muestra.map(async p => { try { const { r } = await get(p.img, { method: "HEAD" }); if (r.status === 404 || r.status === 410) rotas++; } catch { sinResp++; } }));
  const pct = Math.round(100 * rotas / muestra.length);
  (pct <= 8 ? ok : avisos).push(`Fotos: ${rotas} de ${muestra.length} ya no existen en la tienda (${pct}%; la web muestra un dibujito en su lugar)${sinResp ? `, ${sinResp} sin respuesta` : ""}. Productos con foto: ${Math.round(100 * con.length / B.L.length)}%`);
} catch (e) { fallas.push(`No se pudo medir el buscador: ${e.message}`); }

// 5. fuente oficial (solo informa)
// Un 403 del firewall (BunkerWeb) significa que el portal está en línea pero rechaza servidores: no es una caída.
try {
  const { r } = await get("https://datos.produccion.gob.ar/api/3/action/package_show?id=sepa-precios");
  const waf = r.status === 403 && /BunkerWeb/.test(await r.text());
  (r.ok ? ok : avisos).push(r.ok ? `Portal oficial de precios (SEPA): responde (HTTP ${r.status})`
    : waf ? "Portal oficial de precios (SEPA): en línea, pero su firewall rechaza a los servidores (HTTP 403). No es una caída; ver docs/PENDIENTES.md"
    : `Portal oficial de precios (SEPA): HTTP ${r.status}`);
} catch (e) { avisos.push(`Portal oficial de precios (SEPA) no responde: ${e.message}`); }

const md = [`## Vigilancia de SuperBarato — ${new Date().toISOString().slice(0, 16)} UTC`, "",
  ...fallas.map(x => `- ❌ ${x}`), ...avisos.map(x => `- ⚠️ ${x}`), ...ok.map(x => `- ✅ ${x}`)].join("\n");
console.log(md);
if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, md + "\n");
if (process.env.VIGILANCIA_TXT) writeFileSync(process.env.VIGILANCIA_TXT, md.replace(/^## /, "") + "\n");   // va en el correo si algo falla
process.exit(fallas.length ? 1 : 0);
