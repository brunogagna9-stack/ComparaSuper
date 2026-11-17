// Calidad del buscador con el catálogo real (site/data/products.json), sin navegador.
// Si alguien cambia las reglas del buscador, esto mide de nuevo y frena la publicación si empeora.
const { test, expect } = require("@playwright/test");
const path = require("path");
const { cargar } = require("./relevancia/motor-node.js");
const { medir, casos, consultasAuto } = require("./relevancia/evaluar.js");

test.describe("relevancia del buscador", () => {
  let B;
  test.beforeEach(() => {
    test.skip(test.info().project.name !== "pc", "una sola vez (no depende de la pantalla)");
    B = B || cargar(path.join(__dirname, "../site/data/products.json"));
  });

  test("casos de aceptación: «MANI» nunca trae toallitas ni «mini», y lo demás encuentra lo que corresponde", () => {
    const malos = casos(B).filter(c => !c.ok);
    expect(malos.map(c => `${c.q}: ${c.err.join("; ")}`)).toEqual([]);
  });

  test("cientos de búsquedas reales: precisión alta y pocos falsos positivos", () => {
    const m = medir(B, consultasAuto(B.L));
    console.log("Relevancia del buscador:", JSON.stringify(m));
    expect(m.consultas).toBeGreaterThan(300);
    expect(m.precision10).toBeGreaterThanOrEqual(97);
    expect(m.pctFalsosPositivos).toBeLessThanOrEqual(5);
    expect(m.sinResultadosIndebidos).toBe(0);
    expect(m.msPromedio).toBeLessThan(20);
  });
});
