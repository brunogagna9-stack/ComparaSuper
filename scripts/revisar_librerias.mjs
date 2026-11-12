// Revisa las librerías de site/js/vendor: si hay versiones nuevas y si alguna tiene un problema de seguridad conocido.
// Escribe el resumen en revision_librerias.md y avisa (GITHUB_OUTPUT avisar=si) si hay algo para hacer.
import { readFile, writeFile, mkdtemp } from "node:fs/promises";
import { execSync } from "node:child_process";
import { tmpdir } from "node:os";
import path from "node:path";

const libs = JSON.parse(await readFile("site/js/vendor/librerias.json", "utf8"));
delete libs._nota;
const nuevas = [];
for (const [n, v] of Object.entries(libs)) {
  try {
    const ult = execSync(`npm view ${n} version`, { encoding: "utf8" }).trim();
    if (ult && ult !== v) nuevas.push({ n, v, ult, mayor: ult.split(".")[0] !== v.split(".")[0] });
  } catch {}
}
// problemas de seguridad: se arma un proyecto de prueba con esas versiones y se consulta npm audit
let vulns = [];
try {
  const d = await mkdtemp(path.join(tmpdir(), "libs-"));
  await writeFile(path.join(d, "package.json"), JSON.stringify({ name: "libs", private: true, dependencies: libs }));
  execSync("npm install --package-lock-only --ignore-scripts --no-audit --no-fund", { cwd: d, stdio: "ignore" });
  let out = "";
  try { out = execSync("npm audit --json", { cwd: d, encoding: "utf8" }); } catch (e) { out = e.stdout || ""; }
  const a = JSON.parse(out || "{}");
  vulns = Object.entries(a.vulnerabilities || {}).map(([n, x]) => `${n} (${x.severity})`);
} catch {}
const md = [`Revisión del ${new Date().toLocaleDateString("es-AR")} de las librerías de la web.`, ""];
if (vulns.length) md.push("### ⚠️ Problemas de seguridad conocidos", ...vulns.map(x => `- ${x}`), "");
if (nuevas.length) md.push("### 📦 Versiones nuevas", ...nuevas.map(x => `- **${x.n}**: ${x.v} → ${x.ult}${x.mayor ? " (cambio grande: revisar con cuidado)" : ""}`), "");
const hay = vulns.length > 0 || nuevas.some(x => !x.mayor);
md.push(hay ? "**Qué hacer:** pedile a Claude que actualice estas librerías (primero hace una copia de seguridad y prueba todo)." : "Todo en orden: no hace falta hacer nada.");
await writeFile("revision_librerias.md", md.join("\n") + "\n");
console.log(md.join("\n"));
if (process.env.GITHUB_OUTPUT) await writeFile(process.env.GITHUB_OUTPUT, `avisar=${hay ? "si" : "no"}\n`, { flag: "a" });
