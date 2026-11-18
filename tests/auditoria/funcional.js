// Auditoría funcional: recorre cada herramienta de SuperBarato en un navegador real (Chromium) y anota si anda.
// Uso: node tests/auditoria/funcional.js [URL base] [salida.json]   (por defecto, la web publicada)
// Mismo recorrido antes y después de cada etapa, para comparar.
const { chromium, devices } = require("@playwright/test");
const BASE = process.argv[2] || "https://superbarato.com.ar/";
const OUT = process.argv[3];
const ini = () => { for (const [k, v] of Object.entries({ cs_prov: "AR-C", cs_tour: 1, cs_wiz: 1, cs_bienvenida: 1 })) localStorage.setItem(k, JSON.stringify(v)); };
const ev = (p, code) => p.evaluate(code);   // funciones de la página, en texto

const CASOS = [
  ["Inicio carga con ofertas y accesos", async p => { await p.goto(BASE + "#inicio"); await p.waitForSelector(".atajos a"); return (await p.$$("#view .pcard")).length > 0; }],
  ["Buscador: «leche» trae lácteos", async p => { const r = await ev(p, `buscarProm("leche",false).then(r=>r.ids.slice(0,10).map(i=>BY[i].name))`); return r.length === 10 && r.every(n => /leche/i.test(n)); }],
  ["Buscador: «MANI» sin toallitas", async p => { const r = await ev(p, `buscarProm("MANI",false).then(r=>r.ids.map(i=>BY[i].name))`); return r.length > 0 && !r.some(n => /toall|femen/i.test(n)); }],
  ["Autocompletado muestra sugerencias", async p => { await p.goto(BASE + "#inicio"); await p.locator("#q").click(); await p.locator("#q").pressSequentially("yerb"); await p.waitForSelector("#qsug .qs-p", { timeout: 8000 }); return true; }],
  ["Resultados de búsqueda con filtros y orden", async p => { await p.goto(BASE + "#buscar"); await p.locator("#q").fill("arroz"); await p.locator("#q").press("Enter"); await p.waitForSelector("#res .prod, #res .lrow"); return (await p.$$("#res .prod, #res .lrow")).length > 0; }],
  ["Ficha de producto con precios por comercio", async p => { const id = await ev(p, `buscarProm("arroz",false).then(r=>r.ids[0])`); await ev(p, `openProduct(${JSON.stringify(id)})`); await p.waitForSelector("#drawer:not([hidden])"); return /\$/.test(await p.$eval("#drawer", e => e.textContent)); }],
  ["¿Dónde conviene? con canasta y barras", async p => { await p.goto(BASE + "#conviene"); await p.getByText("probá con la canasta básica").first().click(); await p.waitForSelector(".sumc"); return (await p.$$(".cvb")).length > 1; }],
  ["¿Dónde conviene? no resta descuentos sin medios", async p => !(await p.$eval(".sumc", e => e.textContent)).includes("Pagando con")],
  ["Descuentos por día", async p => { await p.goto(BASE + "#pagos"); await p.waitForSelector(".pcard, .promo, [data-pday]", { timeout: 15000 }); return true; }],
  ["Comparar por kilo", async p => { await ev(p, `(async()=>{const r=await buscarProm("yerba",false);const ps=r.ids.map(i=>BY[i]).filter(p=>tamOK(p)&&p.bu==="kg");CMP=[ps[0].id,ps[1].id];location.hash="#comparar";})()`); await p.waitForSelector(".cmpc"); return /por kg/.test(await p.$eval("#view", e => e.textContent)); }],
  ["Ranking de cadenas con cobertura", async p => { await p.goto(BASE + "#ranking"); await p.waitForSelector("table", { timeout: 15000 }); return /% del total/.test(await p.$eval("#view", e => e.textContent)); }],
  ["Mapa de sucursales", async p => { await p.goto(BASE + "#mapa"); await p.waitForSelector(".leaflet-container, .maplibregl-canvas, #map", { timeout: 20000 }); return true; }],
  ["Carrito: agregar y ver total", async p => { await ev(p, `(async()=>{const r=await buscarProm("leche",false);LISTA[r.ids[0]]=2;})()`); await p.goto(BASE + "#carrito"); await p.waitForTimeout(800); return /\$/.test(await p.$eval("#view", e => e.textContent)); }],
  ["Modo súper", async p => { await p.goto(BASE + "#super"); await p.waitForTimeout(800); return /chango|súper/i.test(await p.$eval("#view", e => e.textContent)); }],
  ["Ticket: lector y edición", async p => { await ev(p, `(async()=>{await lib("js/ticket.js");const l=[{txt:"ARROZ GALLO 1KG",cant:1,precio:5000}];openModal('<div id="tkres"></div>');ticketTabla(l,(await matchTicket(l))||[]);})()`); await p.waitForSelector("#tkok"); await p.click("#tkok"); return /ahorrar|Compraste/.test(await p.$eval("#tkres", e => e.textContent)); }],
  ["Asistente responde con datos", async p => { await ev(p, `lib("js/asistente.js")`); const r = await ev(p, `botResponder("¿dónde consigo el aceite más barato?")`); return /aceite/i.test(r) && /\$/.test(r); }],
  ["Modo oscuro", async p => { await p.goto(BASE + "#inicio"); await p.waitForTimeout(500); await ev(p, `document.querySelector("#themebtn").click()`); return (await p.getAttribute("html", "data-theme")) === "dark"; }],
  ["Tamaño de letra", async p => { const a = await ev(p, `document.documentElement.style.zoom`); await ev(p, `document.querySelector("#hsize").click()`); const b = await ev(p, `document.documentElement.style.zoom`); return a !== b; }],
  ["Términos y privacidad", async p => { await p.goto(BASE + "#legal"); await p.waitForTimeout(1500); return /privacidad/i.test(await p.$eval("#view", e => e.textContent)); }],
  ["Conocenos", async p => { await p.goto(BASE + "#nosotros"); await p.waitForTimeout(800); return /Conocenos/i.test(await p.$eval("#view", e => e.textContent)); }],
  ["Cuenta (sin iniciar sesión)", async p => { await p.goto(BASE + "#cuenta"); await p.waitForTimeout(1500); return /Google|correo/i.test(await p.$eval("#view", e => e.textContent)); }],
];

(async () => {
  const b = await chromium.launch(), res = [];
  for (const [disp, opts] of [["pc", { viewport: { width: 1280, height: 900 } }], ["celular", devices["Pixel 7"]]]) {
    const ctx = await b.newContext(opts); await ctx.addInitScript(ini);
    const p = await ctx.newPage(), errs = [];
    p.on("pageerror", e => errs.push(e.message + " @ " + (e.stack || "").split("\n").slice(1, 3).join(" ").trim())); p.on("console", m => { if (m.type() === "error" && !/favicon|net::ERR|Failed to load resource/.test(m.text())) errs.push(m.text()); });
    const t0 = Date.now(); await p.goto(BASE + "#inicio"); await p.waitForFunction("typeof READY!=='undefined'&&READY&&BUSC.ok", null, { timeout: 90000 }); const listo = Date.now() - t0;
    for (const [nom, f] of CASOS) {
      if (disp === "celular" && /Tamaño de letra/.test(nom)) continue;   // en el celular está en el menú "Más" (lo cubre otra prueba)
      const e0 = errs.length; let ok = false, det = "";
      try { ok = !!(await f(p)); } catch (e) { det = e.message.split("\n")[0].slice(0, 140); }
      if (errs.length > e0) det += " errores: " + errs.slice(e0).join(" | ").slice(0, 200);
      res.push({ disp, caso: nom, ok: ok && errs.length === e0, det });
    }
    res.push({ disp, caso: "Tiempo hasta buscador listo (ms)", ok: true, det: String(listo) });
    await ctx.close();
  }
  await b.close();
  const ok = res.filter(r => r.ok).length;
  console.log(`Aprobados: ${ok - 2}/${res.length - 2}`); res.filter(r => !r.ok || /Tiempo/.test(r.caso)).forEach(r => console.log(r.ok ? "·" : "✗", r.disp, r.caso, r.det));
  if (OUT) require("fs").writeFileSync(OUT, JSON.stringify({ fecha: new Date().toISOString(), base: BASE, res }, null, 1));
})();
