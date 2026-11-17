// Lo principal de la web, como lo usaría una persona. Si algo de esto se rompe, no se publica.
const { test, expect } = require("@playwright/test");
const AxeBuilder = require("@axe-core/playwright").default;
const path = require("path");

// cada prueba arranca como alguien de CABA que ya vio la bienvenida y la guía
test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    if (sessionStorage.getItem("cs_test")) return;
    sessionStorage.setItem("cs_test", "1");
    for (const [k, v] of Object.entries({ cs_prov: "AR-C", cs_tour: 1, cs_wiz: 1, cs_bienvenida: 1 })) localStorage.setItem(k, JSON.stringify(v));
  });
});
const listo = page => page.waitForFunction(() => typeof READY !== "undefined" && READY && typeof BUSC !== "undefined" && (BUSC.ok || BUSC.w === false), null, { timeout: 45000 });
const esCelular = page => (page.viewportSize() || {}).width < 700;

test("el buscador entiende errores de ortografía y Enter lleva a Productos", async ({ page }) => {
  await page.goto("#inicio"); await listo(page);
  await page.locator("#q").click();
  await page.locator("#q").pressSequentially("yerva");
  await expect(page.locator("#qsug .qs-p").first()).toContainText(/yerba/i);
  await expect(page).toHaveURL(/#inicio/);   // escribir no cambia de sección
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(/#buscar/);
  await expect(page.locator("#rcount")).toContainText(/producto/);
});

test("la tecla atrás cierra la ficha del producto y no sale de la web", async ({ page }) => {
  await page.goto("#inicio"); await listo(page);
  await page.locator("#q").click(); await page.locator("#q").pressSequentially("arroz");
  await page.locator("#qsug .qs-p").first().click();
  await expect(page.locator("#drawer")).toBeVisible();
  await page.goBack();
  await expect(page.locator("#drawer")).toBeHidden();
  await expect(page).toHaveURL(/#buscar/);
});

test("la tecla atrás cierra las ventanas emergentes", async ({ page }) => {
  await page.goto("#inicio"); await listo(page);
  await page.locator("#mbtn").click();
  await expect(page.locator("#modal")).toBeVisible();
  await page.goBack();
  await expect(page.locator("#modal")).toBeHidden();
  await expect(page).toHaveURL(/#inicio/);
});

test("en CABA no aparecen cadenas lejanas (Toledo, Unicoop, La Coope, La Anónima)", async ({ page }) => {
  await page.goto("#inicio"); await listo(page);
  const ids = await page.evaluate(() => D.stores.map(s => s.id));
  for (const lejos of ["toledo", "unicoop", "coope", "laanonima"]) expect(ids).not.toContain(lejos);
  expect(ids).toContain("coto");
});

test("escanear la foto de un código de barras abre el producto", async ({ page }) => {
  await page.goto("#inicio"); await listo(page);
  await page.evaluate(() => modalScan());
  await page.locator("#scanfile").setInputFiles(path.join(__dirname, "archivos", "ean.png"));
  await expect(page.locator("#drawer")).toBeVisible({ timeout: 20000 });
  await expect(page.locator("#dtitle")).toContainText(/rexona/i);
});

test("una lista compartida desde otra app se reconoce", async ({ page }) => {
  await page.goto("?texto=2%20leche%20entera%0Ayerba%201kg%0Aaceite%20girasol#inicio"); await listo(page);
  await expect(page.locator("#tkres")).toContainText(/Reconocimos 3 de 3/, { timeout: 20000 });
});

test("el carrito y el modo en el súper andan sin internet", async ({ page, context }) => {
  await page.addInitScript(() => localStorage.setItem("cs_lista", JSON.stringify({ "7791293049595": 2 })));
  await page.goto("#inicio"); await listo(page);
  await page.waitForFunction(() => navigator.serviceWorker && navigator.serviceWorker.ready.then(() => true), null, { timeout: 30000 });
  await page.reload(); await listo(page);
  await context.setOffline(true);
  await page.reload(); await listo(page);
  await page.evaluate(() => { location.hash = "carrito"; });
  await expect(page.locator("#view")).toContainText(/Mi carrito/);
  await page.evaluate(() => { location.hash = "super"; });
  await expect(page.locator("#view")).toContainText(/En el súper/);
  await context.setOffline(false);
});

test("el mapa de sucursales muestra las cadenas", async ({ page }) => {
  await page.goto("#mapa"); await listo(page);
  await expect(page.locator("#mchips .chip").first()).toBeVisible({ timeout: 30000 });
  expect(await page.locator("#mchips .chip").count()).toBeGreaterThan(5);
});

test("en el celular el encabezado se achica al bajar", async ({ page }) => {
  test.skip(!esCelular(page), "solo en el celular");
  await page.goto("#buscar"); await listo(page);
  for (let i = 0; i < 6; i++) { await page.mouse.wheel(0, 300); await page.waitForTimeout(120); }
  await expect(page.locator("header.site")).toHaveClass(/min/);
});

// accesibilidad (axe-core): sin problemas graves en las secciones principales
for (const [nombre, hash] of [["Inicio", "#inicio"], ["Productos", "#buscar"], ["Descuentos", "#pagos"], ["Carrito", "#carrito"], ["Conocenos", "#nosotros"]]) {
  test(`accesibilidad: ${nombre}`, async ({ page }) => {
    await page.addInitScript(() => localStorage.setItem("cs_lista", JSON.stringify({ "7791293049595": 1 })));
    await page.goto(hash); await listo(page); await page.waitForTimeout(800);
    const r = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa"]).exclude(".leaflet-container").analyze();
    const graves = r.violations.filter(v => ["serious", "critical"].includes(v.impact));
    expect(graves.map(v => `${v.id}: ${v.help} (${v.nodes.length}) ${v.nodes.slice(0, 2).map(n => n.target.join(" ")).join(" | ")}`)).toEqual([]);
  });
}

test("el buscador entiende tamaños («yerba 1kg») y avisa cuando no hay ese tamaño", async ({ page }) => {
  await page.goto("#inicio"); await page.waitForFunction(() => typeof READY !== "undefined" && READY && BUSC.ok, null, { timeout: 45000 });
  await page.fill("#q", "yerba 1kg"); await page.press("#q", "Enter");
  await expect(page.locator("#rcount")).toContainText("de 1 kg");
  await expect(page.locator("#view .prod h3").first()).toContainText(/1\s*k/i);
  await page.fill("#q", "yerba 37 kg"); await page.press("#q", "Enter");
  await expect(page.locator("#rcount")).toContainText("No hay productos de 37 kg");
});

test("sin medios de pago elegidos, ¿Dónde conviene? no resta descuentos de tarjetas en el total", async ({ page }) => {
  await page.goto("#conviene"); await page.waitForFunction(() => typeof READY !== "undefined" && READY, null, { timeout: 45000 });
  await page.getByText("probá con la canasta básica").first().click();
  const card = page.locator(".sumc").first();
  await expect(card).toBeVisible();
  await expect(card).not.toContainText("Pagando con");
  await expect(page.locator("#view")).toContainText("no se restan");
});


test("en el celular, modo oscuro y tamaño de letra están en el menú Más y el encabezado es bajo", async ({ page }) => {
  test.skip(!esCelular(page), "solo en el celular");
  await page.goto("#inicio"); await listo(page);
  await expect(page.locator("#themebtn")).toBeHidden();
  expect(await page.locator("header.site").evaluate(e => e.offsetHeight)).toBeLessThan(170);
  await page.locator("#bmore").click();
  await page.locator("#bsheet [data-tema]").click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await page.locator("#bmore").click();
  await expect(page.locator("#bsheet [data-tema]")).toContainText("Modo claro");
});

test("«MANI» en el buscador trae maní (sugerencias y resultados), nunca toallitas ni «mini»", async ({ page }) => {
  await page.goto("#inicio"); await listo(page);
  await page.locator("#q").click(); await page.locator("#q").pressSequentially("MANI");
  const sug = page.locator("#qsug .qs-p");
  await expect(sug.first()).toContainText(/man[ií]/i);
  for (const t of await sug.allInnerTexts()) expect(t).toMatch(/man[ií]/i);
  await page.keyboard.press("Enter");
  await expect(page.locator("#res .prod, #res .lrow").first()).toBeVisible();
  const nombres = await page.locator("#res .prod, #res .lrow").evaluateAll(es => es.map(e => e.getAttribute("aria-label")));
  expect(nombres.length).toBeGreaterThan(0);
  for (const n of nombres) { expect(n).not.toMatch(/toall|femenin/i); expect(n).toMatch(/man[ií]/i); }
});

test("una búsqueda sin resultados lo dice claro y ofrece buscar cada palabra", async ({ page }) => {
  await page.goto("#inicio"); await listo(page);
  await page.locator("#q").fill("aceite de mani"); await page.locator("#q").press("Enter");
  await expect(page.locator("#res .empty")).toContainText("No encontramos");
  await page.locator("[data-solo='mani']").click();
  await expect(page.locator("#res .prod, #res .lrow").first()).toBeVisible();
});

test("ticket: lo leído se puede corregir (texto, producto, cantidad, precio, quitar y agregar) y el ahorro sale recién al confirmar", async ({ page }) => {
  await page.goto("#inicio"); await listo(page);
  // lo que devolvería el lector de tickets (OCR): dos renglones bien y uno mal leído
  // (en texto: son funciones de la página, no de la prueba)
  await page.evaluate(`(async () => {
    await lib("js/ticket.js");
    const lineas = [{ txt: "YERBA PLAYADITO 1KG", cant: 1, precio: 9999 }, { txt: "ARROZ GALLO 1KG", cant: 1, precio: 5000 }, { txt: "XQZ KWW", cant: 1, precio: 100 }];
    openModal('<h2>Ticket</h2><div id="tkres"></div>');
    ticketTabla(lineas, (await matchTicket(lineas)) || []);
  })()`);
  const res = page.locator("#tkres");
  await expect(res.locator(".tksum")).toContainText("Revisá cada uno");
  await expect(res).not.toContainText("Podrías ahorrar");
  await expect(res.locator("[data-tkdel]")).toHaveCount(3);
  await res.locator("[data-tkdel='2']").click();                       // quitar el mal leído
  await expect(res.locator("[data-tkdel]")).toHaveCount(2);
  await res.locator("[data-tkc='0']").fill("2"); await res.locator("[data-tkc='0']").press("Enter");
  await res.locator("[data-tkpr='1']").fill("4500"); await res.locator("[data-tkpr='1']").press("Enter");
  await res.locator("#tkadd").click();                                  // agregar uno que faltó
  await res.locator("[data-tkt='2']").fill("leche entera"); await res.locator("[data-tkt='2']").press("Tab");
  await expect(res.locator("[data-tksel='2']")).toBeVisible();
  await expect(res.locator("[data-tkc='0']")).toHaveValue("2");
  await expect(res.locator("[data-tkpr='1']")).toHaveValue("4500");
  await res.locator("#tkok").click();
  await expect(res.locator(".tksum")).toContainText(/Podrías ahorrar|Compraste bien/);
  await expect(res.locator("#tkplan")).toBeVisible();
});

test("comparar por kilo: normaliza presentaciones distintas, dice cuánto más cuesta y avisa si se miden distinto", async ({ page }) => {
  await page.goto("#inicio"); await listo(page);
  await page.evaluate(`(async () => {
    const r = await buscarProm("yerba", false), ps = r.ids.map(id => BY[id]).filter(p => p && tamOK(p) && p.bu === "kg");
    const a = ps.find(p => Math.abs(p.bq - 0.5) < 0.01), b = ps.find(p => Math.abs(p.bq - 1) < 0.01);
    const l = (await buscarProm("leche", false)).ids.map(id => BY[id]).find(p => p && tamOK(p) && p.bu === "l");
    CMP = [a.id, b.id, l.id]; vComparar();
  })()`);
  await expect(page.locator(".cmpc")).toHaveCount(3);
  await expect(page.locator("#view")).toContainText("menor precio por kg");
  await expect(page.locator("#view")).toContainText(/\d+% más por kg|Casi igual por kg/);
  await expect(page.locator("#view .note")).toContainText("Se miden distinto");
  await expect(page.locator("#view")).not.toContainText("menor precio por litro");   // una sola leche: no hay con quién comparar
});

test("asistente: entiende preguntas naturales, usa la ficha abierta y no inventa descuentos sin medios", async ({ page }) => {
  await page.goto("#inicio"); await listo(page);
  await page.evaluate(`lib("js/asistente.js")`);
  const pregunta = async q => page.evaluate(`botResponder(${JSON.stringify(q)})`);
  expect(await pregunta("¿Dónde consigo el aceite más barato?")).toMatch(/[Aa]ceite/);
  expect(await pregunta("Buscame una yerba de buena calidad y económica")).toContain("No tenemos calificaciones de calidad");
  expect(await pregunta("¿Qué ofertas tengo con mi tarjeta?")).toContain("necesito saber tus medios de pago");
  expect(await pregunta("¿Qué súper me conviene para mi carrito?")).toContain("carrito está vacío");
  expect(await pregunta("Comparame yerba playadito y yerba taragui")).toContain("para comparar");
  // con la ficha de un producto abierta, no hace falta escribir su nombre
  const nombre = await page.evaluate(`(async () => { const id = (await buscarProm("arroz", false)).ids[0]; await openProduct(id); return BY[id].name; })()`);
  expect(await pregunta("¿dónde está más barato?")).toContain(nombre.replace(/&/g, "&amp;"));
  expect(await pregunta("¿cuánto ahorro comprando acá?")).not.toContain("carrito");
});
