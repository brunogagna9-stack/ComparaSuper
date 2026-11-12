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
