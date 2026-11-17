// Carga el buscador de la web (site/js/buscador.js, que usa motor.js) dentro de Node, con un catálogo real,
// para medir la relevancia sin navegador. SITE_JS permite comparar con otra versión del buscador.
const fs = require("fs"), vm = require("vm"), path = require("path");
function cargar(prodFile, siteJs = process.env.SITE_JS || path.join(__dirname, "../../site/js")) {
  const ctx = { console, setTimeout, postMessage: () => {} };
  ctx.self = ctx;
  ctx.importScripts = (...fs_) => fs_.forEach(f => { const p = path.join(siteJs, f); if (fs.existsSync(p)) vm.runInContext(fs.readFileSync(p, "utf8"), ctx, { filename: f }); });
  vm.createContext(ctx);
  vm.runInContext(fs.readFileSync(path.join(siteJs, "buscador.js"), "utf8"), ctx, { filename: "buscador.js" });
  const L = vm.runInContext("decodificar", ctx)(JSON.parse(fs.readFileSync(prodFile, "utf8")));
  ctx.__L = L; vm.runInContext("indexar(__L)", ctx);
  const byId = new Map(L.map(p => [p.id, p])), buscar = vm.runInContext("buscar", ctx);
  return { L, byId, buscar };
}
module.exports = { cargar };
