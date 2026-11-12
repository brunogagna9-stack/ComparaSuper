// Revisión visual: se saca una captura de las pantallas que no cambian con los precios del día y se compara
// con la anterior. Si algo se descuadra (un menú cortado, un botón corrido), avisa con la imagen de la diferencia.
// Las capturas de referencia las guarda GitHub entre una publicación y otra (ver .github/workflows/publicar.yml).
const { test, expect } = require("@playwright/test");

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    for (const [k, v] of Object.entries({ cs_prov: "AR-C", cs_tour: 1, cs_wiz: 1, cs_bienvenida: 1 })) localStorage.setItem(k, JSON.stringify(v));
  });
});
const listo = page => page.waitForFunction(() => typeof READY !== "undefined" && READY, null, { timeout: 45000 });
const opciones = page => ({ animations: "disabled", caret: "hide", maxDiffPixelRatio: 0.01,
  mask: [page.locator("#fupd"), page.locator(".anuncio"), page.locator("#pbtn .cnt"), page.locator(".fabs")] });

for (const [nombre, hash] of [["conocenos", "#nosotros"], ["terminos", "#legal"], ["como-funciona", "#como"]]) {
  test(`@visual ${nombre}`, async ({ page }) => {
    await page.goto(hash); await listo(page); await page.waitForTimeout(600);
    await expect(page).toHaveScreenshot(`${nombre}.png`, opciones(page));
  });
}
test("@visual encabezado y pie", async ({ page }) => {
  await page.goto("#nosotros"); await listo(page); await page.waitForTimeout(600);
  await expect(page.locator("header.site")).toHaveScreenshot("encabezado.png", opciones(page));
  await expect(page.locator("footer.site")).toHaveScreenshot("pie.png", opciones(page));
});
test("@visual ventana de medios de pago", async ({ page }) => {
  await page.goto("#nosotros"); await listo(page);
  await page.locator("#mbtn").click(); await page.waitForTimeout(400);
  await expect(page.locator("#modal")).toHaveScreenshot("medios.png", opciones(page));
});
