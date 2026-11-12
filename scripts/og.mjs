// Imágenes para compartir (1200×630): foto del producto, nombre, precio más bajo y en qué súper.
// Se ven al mandar el link de un producto por WhatsApp, Facebook, X, etc.
// Usa Satori (arma la imagen a partir de un diseño) y resvg (la pasa a PNG), los dos de código abierto.
// Lee site/og/lista.json (lo escribe scripts/make_pages.py) y escribe site/og/<código>.jpg.
// Si una imagen falla, se usa la general (site/img/og.png) para que el link nunca quede sin foto.
// Se corre al publicar: node scripts/og.mjs
import { readFile, writeFile, copyFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";
import satori from "satori";
import { Resvg } from "@resvg/resvg-js";
import jpeg from "jpeg-js";   // pasa la imagen a JPG: pesa la cuarta parte que el PNG

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const OG = path.join(RAIZ, "site", "og");
const fuente = f => readFile(path.join(RAIZ, "scripts", "og-fuentes", `plus-jakarta-sans-latin-${f}-normal.woff`));
const fonts = [
  { name: "Jakarta", data: await fuente(400), weight: 400, style: "normal" },
  { name: "Jakarta", data: await fuente(700), weight: 700, style: "normal" },
  { name: "Jakarta", data: await fuente(800), weight: 800, style: "normal" },
];
const lista = JSON.parse(await readFile(path.join(OG, "lista.json"), "utf8"));
const ANCHO = 800;   // WhatsApp y Facebook muestran la vista grande desde 600 px de ancho
const VERDE = "#0e7a55", AMARILLO = "#ffc72c";

// la foto del producto, achicada y en PNG (wsrv.nl), como dato dentro de la imagen
async function foto(src) {
  if (!src) return null;
  const u = `https://wsrv.nl/?url=${encodeURIComponent(src)}&w=420&h=420&fit=contain&cbg=white&output=png`;
  for (let i = 0; i < 2; i++) {
    try {
      const r = await fetch(u, { signal: AbortSignal.timeout(15000) });
      if (r.ok) return `data:image/png;base64,${Buffer.from(await r.arrayBuffer()).toString("base64")}`;
    } catch {}
  }
  return null;
}
const h = (type, style, children) => ({ type, props: { style, children } });

function diseno(p, img) {
  const nombre = p.name.length > 70 ? p.name.slice(0, 68) + "…" : p.name;
  return h("div", { width: 1200, height: 630, display: "flex", flexDirection: "column", background: "#f4f7f5", fontFamily: "Jakarta" }, [
    h("div", { display: "flex", alignItems: "center", justifyContent: "space-between", background: VERDE, color: "#fff", padding: "26px 48px" }, [
      h("div", { display: "flex", fontSize: 40, fontWeight: 800 }, [h("span", {}, "Compará"), h("span", { color: AMARILLO }, "Súper")]),
      h("div", { display: "flex", fontSize: 26, fontWeight: 700, opacity: 0.9 }, `Comparado en ${p.n} comercios`),
    ]),
    h("div", { display: "flex", flex: 1, alignItems: "center", padding: "26px 48px", gap: 44 }, [
      h("div", { display: "flex", width: 400, height: 400, background: "#fff", borderRadius: 28, alignItems: "center", justifyContent: "center", border: "2px solid #dfe8e3", flexShrink: 0 },
        img ? [{ type: "img", props: { src: img, width: 360, height: 360, style: { objectFit: "contain" } } }] : h("div", { display: "flex", fontSize: 140 }, "🛒")),
      h("div", { display: "flex", flexDirection: "column", flex: 1, gap: 12 }, [
        h("div", { display: "flex", fontSize: nombre.length > 45 ? 44 : 52, fontWeight: 800, color: "#14231c", lineHeight: 1.15 }, nombre),
        h("div", { display: "flex", fontSize: 30, color: "#4b5a53", fontWeight: 600, marginTop: 6 }, "Precio más bajo hoy"),
        h("div", { display: "flex", alignItems: "baseline", gap: 18 }, [
          h("div", { display: "flex", fontSize: 84, fontWeight: 800, color: VERDE, lineHeight: 1 }, p.precio),
        ]),
        h("div", { display: "flex", fontSize: 34, fontWeight: 700, color: "#14231c" }, `en ${p.store}`),
        h("div", { display: "flex", marginTop: 10, background: AMARILLO, color: "#14231c", fontSize: 26, fontWeight: 800, padding: "12px 22px", borderRadius: 999, alignSelf: "flex-start" }, "Mirá dónde te conviene »"),
      ]),
    ]),
  ]);
}

let ok = 0, mal = 0;
async function una(p) {
  const dest = path.join(OG, `${p.id}.jpg`);
  try {
    const svg = await satori(diseno(p, await foto(p.img)), { width: 1200, height: 630, fonts, loadAdditionalAsset: async () => [] });
    const im = new Resvg(svg, { fitTo: { mode: "width", value: ANCHO } }).render();
    await writeFile(dest, jpeg.encode({ data: im.pixels, width: im.width, height: im.height }, 82).data);
    ok++;
  } catch (e) {
    mal++;
    await copyFile(path.join(RAIZ, "site", "img", "og.jpg"), dest).catch(() => {});
    if (mal <= 3) console.log("No se pudo armar", p.id, String(e).slice(0, 120));
  }
}
const N = +(process.argv[2] || lista.length), cola = lista.slice(0, N);
const PAR = 12;   // de a 12 a la vez
for (let i = 0; i < cola.length; i += PAR) await Promise.all(cola.slice(i, i + PAR).map(una));
console.log(`Imágenes para compartir: ${ok} armadas, ${mal} con la imagen general`);
