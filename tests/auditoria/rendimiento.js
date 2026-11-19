// Auditoría de rendimiento en un navegador real (Chromium), con las mismas condiciones antes y después.
// Uso: node tests/auditoria/rendimiento.js [URL base] [salida.json]
// Mide: descargas (primera visita y vuelta, con y sin trabajo de fondo), código JS/CSS usado, tiempo de cada
// sección, respuesta a toques (Event Timing ≈ INP), tareas largas, cuadros perdidos en transiciones,
// memoria y nodos tras una sesión larga. Celular simulado (Pixel 7) con CPU 4× más lenta.
const { chromium, devices } = require("@playwright/test");
const BASE = process.argv[2] || "https://superbarato.com.ar/";
const OUT = process.argv[3];
const ini = () => { for (const [k, v] of Object.entries({ cs_prov: "AR-C", cs_tour: 1, cs_wiz: 1, cs_bienvenida: 1 })) localStorage.setItem(k, JSON.stringify(v)); };
const SECCIONES = ["#buscar", "#ofertas", "#pagos", "#conviene", "#carrito", "#comparar", "#ranking", "#mapa", "#super", "#cuenta", "#legal", "#inicio"];
const kb = b => Math.round(b / 102.4) / 10;

async function descargas(b, conProv) {   // bytes transferidos (comprimidos) hasta la carga y tras 15 s de calma
  const ctx = await b.newContext({ ...devices["Pixel 7"] }); if (conProv) await ctx.addInitScript(ini);
  const p = await ctx.newPage(), cdp = await ctx.newCDPSession(p);
  await cdp.send("Network.enable"); const tipos = new Map(), porTipo = {}; let n = 0, total = 0, alCargar = null;
  cdp.on("Network.responseReceived", e => tipos.set(e.requestId, e.type));
  cdp.on("Network.loadingFinished", e => { n++; total += e.encodedDataLength; const t = tipos.get(e.requestId) || "Otro"; porTipo[t] = (porTipo[t] || 0) + e.encodedDataLength; });
  await p.goto(BASE + "#inicio", { waitUntil: "load" }); alCargar = { pedidos: n, KB: kb(total) };
  await p.waitForTimeout(15000);
  const r = { alCargar, tras15s: { pedidos: n, KB: kb(total), porTipo: Object.fromEntries(Object.entries(porTipo).map(([k, v]) => [k, kb(v)])) } };
  // segunda visita (con lo guardado)
  n = 0; total = 0; for (const k in porTipo) delete porTipo[k];
  await p.reload({ waitUntil: "load" }); await p.waitForTimeout(5000); r.vuelta = { pedidos: n, KB: kb(total) };
  await ctx.close(); return r;
}

async function cobertura(b) {   // cuánto del JS y CSS bajado al entrar se usa en el inicio
  const ctx = await b.newContext({ viewport: { width: 1280, height: 900 } }); await ctx.addInitScript(ini);
  const p = await ctx.newPage(); await p.coverage.startJSCoverage({ resetOnNavigation: false }); await p.coverage.startCSSCoverage({ resetOnNavigation: false });
  await p.goto(BASE + "#inicio"); await p.waitForFunction("typeof READY!=='undefined'&&READY", null, { timeout: 90000 }); await p.waitForTimeout(1500);
  const js = await p.coverage.stopJSCoverage(), css = await p.coverage.stopCSSCoverage();
  const sum = (arr, usado) => arr.filter(e => e.url.startsWith(BASE)).reduce((a, e) => { const t = (e.text || e.source || "").length; return { tot: a.tot + t, usado: a.usado + usado(e) }; }, { tot: 0, usado: 0 });
  // usado = tamaño − (unión de los rangos que nunca se ejecutaron); en la cobertura por bloques los rangos vienen anidados
  const usadoJS = e => { const z = e.functions.flatMap(f => f.ranges).filter(r => r.count === 0).map(r => [r.startOffset, r.endOffset]).sort((a, b) => a[0] - b[0]);
    let sin = 0, fin = -1; for (const [a, b] of z) { if (b <= fin) continue; sin += b - Math.max(a, fin); fin = b; } return (e.source || "").length - sin; };
  const J = sum(js, usadoJS);
  const C = sum(css, e => e.ranges.reduce((s, r) => s + r.end - r.start, 0));
  const porArchivo = js.filter(e => e.url.startsWith(BASE)).map(e => e.url.replace(BASE, "")).filter(u => u.endsWith(".js"));
  await ctx.close();
  return { jsKBsinComprimir: kb(J.tot), jsUsadoAlEntrarPct: Math.round(100 * Math.min(J.usado, J.tot) / J.tot), cssKBsinComprimir: kb(C.tot), cssUsadoAlEntrarPct: Math.round(100 * C.usado / C.tot), scripts: porArchivo };
}

async function sesion(b) {   // celular con CPU 4× más lenta: secciones, toques, transiciones y memoria
  const ctx = await b.newContext({ ...devices["Pixel 7"] }); await ctx.addInitScript(ini);
  await ctx.addInitScript(() => {
    window.__ev = []; window.__lt = [];
    try { new PerformanceObserver(l => l.getEntries().forEach(e => e.interactionId && window.__ev.push(e.duration))).observe({ type: "event", durationThreshold: 16, buffered: true }); } catch {}
    try { new PerformanceObserver(l => l.getEntries().forEach(e => window.__lt.push(e.duration))).observe({ type: "longtask", buffered: true }); } catch {}
  });
  const p = await ctx.newPage(), cdp = await ctx.newCDPSession(p);
  await cdp.send("Performance.enable"); await cdp.send("Emulation.setCPUThrottlingRate", { rate: 4 });
  const met = async () => Object.fromEntries((await cdp.send("Performance.getMetrics")).metrics.map(m => [m.name, m.value]));
  const t0 = Date.now(); await p.goto(BASE + "#inicio"); await p.waitForFunction("typeof READY!=='undefined'&&READY&&BUSC.ok", null, { timeout: 120000 });
  const listo = Date.now() - t0; await p.waitForTimeout(1000);
  const m0 = await met();
  const secs = {};
  for (let vuelta = 0; vuelta < 2; vuelta++) for (const h of SECCIONES) {
    const ms = await p.evaluate(h => new Promise(res => { const t = performance.now(); const v = document.querySelector("#view"); let ok = false;
      const mo = new MutationObserver(() => { if (!ok) { ok = true; requestAnimationFrame(() => requestAnimationFrame(() => { mo.disconnect(); res(Math.round(performance.now() - t)); })); } });
      mo.observe(v, { childList: true, subtree: true }); location.hash = h; setTimeout(() => { if (!ok) { mo.disconnect(); res(-1); } }, 8000); }), h);
    await p.waitForTimeout(h === "#mapa" ? 2500 : 600);
    (secs[h] = secs[h] || []).push(ms);
  }
  // toques reales: buscar, abrir producto, agregar al carrito, abrir el menú Más, filtros
  await p.goto(BASE + "#inicio"); await p.waitForTimeout(800);
  await p.locator("#q").click(); await p.keyboard.type("leche", { delay: 60 }); await p.waitForTimeout(800); await p.keyboard.press("Enter"); await p.waitForTimeout(1200);
  const prod = p.locator("#res .prod, #res .lrow").first(); await prod.click(); await p.waitForTimeout(900);
  const add = p.locator("#drawer [data-add], #drawer .add").first(); if (await add.count()) { await add.click(); await p.waitForTimeout(400); }
  await p.keyboard.press("Escape"); await p.waitForTimeout(600);
  if (await p.locator("#bmore").isVisible()) { await p.locator("#bmore").click(); await p.waitForTimeout(400); await p.keyboard.press("Escape"); }
  // cuadros durante la apertura de la ficha (con CPU lenta)
  const frames = await p.evaluate(async () => { const id = (await buscarProm("arroz", false)).ids[0]; const ts = []; let on = true;
    const f = t => { ts.push(t); if (on) requestAnimationFrame(f); }; requestAnimationFrame(f); openProduct(id);
    await new Promise(r => setTimeout(r, 700)); on = false; const d = ts.slice(1).map((t, i) => t - ts[i]); return { cuadros: d.length, perdidos: d.filter(x => x > 25).length, peorMs: Math.round(Math.max(...d)) }; });
  await p.keyboard.press("Escape"); await p.waitForTimeout(800);
  const m1 = await met(); await cdp.send("HeapProfiler.collectGarbage"); await p.waitForTimeout(500); const m2 = await met();
  const ev = await p.evaluate("window.__ev.slice()"), lt = await p.evaluate("window.__lt.slice()");
  ev.sort((a, b) => a - b); const p98 = ev.length ? ev[Math.min(ev.length - 1, Math.floor(ev.length * 0.98))] : 0;
  await ctx.close();
  const med = a => a.filter(x => x >= 0).sort((x, y) => x - y)[Math.floor(a.length / 2)];
  return { buscadorListoMs: listo, seccionesMs: Object.fromEntries(Object.entries(secs).map(([h, a]) => [h, med(a)])), seccionMaxMs: Math.max(...Object.values(secs).flat()),
    toques: { cantidad: ev.length, peorMs: Math.round(ev[ev.length - 1] || 0), inpAproxMs: Math.round(p98) },
    tareasLargas: { cantidad: lt.length, totalMs: Math.round(lt.reduce((a, b) => a + b, 0)), peorMs: Math.round(Math.max(0, ...lt)) },
    fichaAbrir: frames,
    memoria: { heapAlEntrarMB: +(m0.JSHeapUsedSize / 1048576).toFixed(1), heapTrasSesionMB: +(m2.JSHeapUsedSize / 1048576).toFixed(1), nodosAlEntrar: m0.Nodes, nodosTrasSesion: m2.Nodes, escuchasAlEntrar: m0.JSEventListeners, escuchasTrasSesion: m2.JSEventListeners },
    trabajo: { scriptS: +(m1.ScriptDuration - m0.ScriptDuration).toFixed(2), estilosS: +(m1.RecalcStyleDuration - m0.RecalcStyleDuration).toFixed(2), layoutS: +(m1.LayoutDuration - m0.LayoutDuration).toFixed(2), layouts: m1.LayoutCount - m0.LayoutCount } };
}

(async () => {
  const b = await chromium.launch(), r = { fecha: new Date().toISOString(), base: BASE };
  r.primeraVisita = await descargas(b, false);      // sin provincia elegida (elegidor de provincia)
  r.visitaConProvincia = await descargas(b, true);  // la persona ya eligió provincia (la mayoría de las visitas)
  r.cobertura = await cobertura(b);
  r.sesion = await sesion(b);
  await b.close();
  console.log(JSON.stringify(r, null, 1));
  if (OUT) require("fs").writeFileSync(OUT, JSON.stringify(r, null, 1));
})();
