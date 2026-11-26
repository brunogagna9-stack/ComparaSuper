// Pruebas de las reglas de Firestore (firestore.rules) contra el emulador oficial de Firebase, sin tocar la base real.
// Uso: npx firebase-tools@14 emulators:exec --only firestore --project demo-superbarato "node tests/reglas/probar_reglas.mjs"
import { readFileSync } from "node:fs";
import { initializeTestEnvironment, assertFails, assertSucceeds } from "@firebase/rules-unit-testing";
import { doc, getDoc, setDoc, updateDoc, deleteDoc, deleteField, Timestamp } from "firebase/firestore";

const env = await initializeTestEnvironment({ projectId: "demo-superbarato", firestore: { rules: readFileSync("firestore.rules", "utf8") } });
const TOKEN = "clave-secreta-de-baja-0123456789";
const base = { email: "ana@ejemplo.com", semanal: true, bajas: true, zona: "AR-C", acepto: Timestamp.now(), actualizado: Timestamp.now(), avisos: { "7790001": 1500 } };
async function sembrar() {   // el documento como lo deja el servidor (con sus campos propios)
  await env.clearFirestore();
  await env.withSecurityRulesDisabled(c => setDoc(doc(c.firestore(), "usuarios/ana"), { ...base, enviados: 3, ultimoEnvio: Timestamp.now(), bajaToken: TOKEN }));
}
const ana = () => env.authenticatedContext("ana").firestore(), beto = () => env.authenticatedContext("beto").firestore(), anon = () => env.unauthenticatedContext().firestore();
const casos = [
  ["la persona lee su propio documento", () => assertSucceeds(getDoc(doc(ana(), "usuarios/ana")))],
  ["otra persona NO puede leerlo", () => assertFails(getDoc(doc(beto(), "usuarios/ana")))],
  ["sin sesión NO se puede leer", () => assertFails(getDoc(doc(anon(), "usuarios/ana")))],
  ["la persona cambia sus preferencias", () => assertSucceeds(updateDoc(doc(ana(), "usuarios/ana"), { semanal: false, zona: "AR-B", actualizado: Timestamp.now() }))],
  ["otra persona NO puede cambiarlas", () => assertFails(updateDoc(doc(beto(), "usuarios/ana"), { semanal: false }))],
  ["otra persona NO puede borrarlo", () => assertFails(deleteDoc(doc(beto(), "usuarios/ana")))],
  ["la persona puede borrar su cuenta", () => assertSucceeds(deleteDoc(doc(ana(), "usuarios/ana")))],
  ["crear la propia cuenta (como lo hace la web)", () => assertSucceeds(setDoc(doc(beto(), "usuarios/beto"), base))],
  ["NO crear la cuenta de otra persona", () => assertFails(setDoc(doc(beto(), "usuarios/carla"), base))],
  ["NO crear con campos del servidor (enviados)", () => assertFails(setDoc(doc(beto(), "usuarios/beto"), { ...base, enviados: 0 }))],
  ["NO poner su propia clave de baja", () => assertFails(setDoc(doc(beto(), "usuarios/beto"), { ...base, bajaToken: "x".repeat(20) }))],
  ["NO tocar el contador de correos enviados", () => assertFails(updateDoc(doc(ana(), "usuarios/ana"), { enviados: 0 }))],
  ["NO borrar el contador de correos enviados", () => assertFails(updateDoc(doc(ana(), "usuarios/ana"), { enviados: deleteField() }))],
  ["NO cambiar la fecha del último envío", () => assertFails(updateDoc(doc(ana(), "usuarios/ana"), { ultimoEnvio: Timestamp.now() }))],
  ["NO cambiar la clave de baja", () => assertFails(updateDoc(doc(ana(), "usuarios/ana"), { bajaToken: "y".repeat(20) }))],
  ["NO agregar campos desconocidos", () => assertFails(updateDoc(doc(ana(), "usuarios/ana"), { admin: true }))],
  ["NO guardar tipos incorrectos (semanal como texto)", () => assertFails(updateDoc(doc(ana(), "usuarios/ana"), { semanal: "sí" }))],
  ["NO guardar fechas falsas (acepto como texto)", () => assertFails(updateDoc(doc(ana(), "usuarios/ana"), { acepto: "hoy" }))],
  ["NO guardar una zona demasiado larga", () => assertFails(updateDoc(doc(ana(), "usuarios/ana"), { zona: "x".repeat(50) }))],
  ["baja desde el correo, sin sesión y con la clave: apaga el semanal", () => assertSucceeds(updateDoc(doc(anon(), "usuarios/ana"), { semanal: false, bajaUsado: TOKEN }))],
  ["baja desde el correo con clave equivocada: NO", () => assertFails(updateDoc(doc(anon(), "usuarios/ana"), { semanal: false, bajaUsado: "otra-clave-cualquiera-123" }))],
  ["sin sesión NO se puede PRENDER el semanal (aun con la clave)", async () => {
    await env.withSecurityRulesDisabled(c => updateDoc(doc(c.firestore(), "usuarios/ana"), { semanal: false }));
    await assertFails(updateDoc(doc(anon(), "usuarios/ana"), { semanal: true, bajaUsado: TOKEN }));
  }],
  ["sin sesión NO se puede cambiar el correo", () => assertFails(updateDoc(doc(anon(), "usuarios/ana"), { email: "otro@ejemplo.com", bajaUsado: TOKEN }))],
  ["sin sesión NO se puede crear un documento", () => assertFails(setDoc(doc(anon(), "usuarios/nuevo"), base))],
  ["la persona activa las promos del día y guarda sus medios", () => assertSucceeds(updateDoc(doc(ana(), "usuarios/ana"), { promos: true, medios: ["bna", "modo"], actualizado: Timestamp.now() }))],
  ["NO guardar promos como texto", () => assertFails(updateDoc(doc(ana(), "usuarios/ana"), { promos: "sí" }))],
  ["NO guardar medios que no sean una lista", () => assertFails(updateDoc(doc(ana(), "usuarios/ana"), { medios: "bna" }))],
  ["la persona guarda sus comercios", () => assertSucceeds(updateDoc(doc(ana(), "usuarios/ana"), { comercios: ["coto", "dia"], actualizado: Timestamp.now() }))],
  ["NO guardar más de 60 comercios", () => assertFails(updateDoc(doc(ana(), "usuarios/ana"), { comercios: Array.from({ length: 61 }, (_, i) => "c" + i) }))],
  ["sin sesión NO se pueden cambiar los comercios", () => assertFails(updateDoc(doc(anon(), "usuarios/ana"), { comercios: ["x"], bajaUsado: TOKEN }))],
  ["NO guardar más de 80 medios", () => assertFails(updateDoc(doc(ana(), "usuarios/ana"), { medios: Array.from({ length: 81 }, (_, i) => "m" + i) }))],
  ["otra persona NO puede activar las promos de ana", () => assertFails(updateDoc(doc(beto(), "usuarios/ana"), { promos: true }))],
  ["baja desde el correo, sin sesión y con la clave: apaga las promos", async () => {
    await env.withSecurityRulesDisabled(c => updateDoc(doc(c.firestore(), "usuarios/ana"), { promos: true }));
    await assertSucceeds(updateDoc(doc(anon(), "usuarios/ana"), { promos: false, bajaUsado: TOKEN }));
  }],
  ["sin sesión NO se pueden PRENDER las promos (aun con la clave)", () => assertFails(updateDoc(doc(anon(), "usuarios/ana"), { promos: true, bajaUsado: TOKEN }))],
  ["NO cambiar la fecha del último correo de promos (la pone el servidor)", () => assertFails(updateDoc(doc(ana(), "usuarios/ana"), { ultimoPromos: "2099-01-01" }))],
  ["con ultimoPromos puesto por el servidor, la persona igual guarda sus preferencias", async () => {
    await env.withSecurityRulesDisabled(c => updateDoc(doc(c.firestore(), "usuarios/ana"), { ultimoPromos: "2026-11-25" }));
    await assertSucceeds(updateDoc(doc(ana(), "usuarios/ana"), { promos: false, actualizado: Timestamp.now() }));
  }],
  ["sin sesión NO se pueden cambiar los medios", () => assertFails(updateDoc(doc(anon(), "usuarios/ana"), { medios: ["x"], bajaUsado: TOKEN }))],
  ["ninguna otra colección es accesible", () => assertFails(setDoc(doc(ana(), "admin/config"), { x: 1 }))],
];
let ok = 0, mal = [];
for (const [nom, f] of casos) { await sembrar(); try { await f(); ok++; console.log("✓", nom); } catch (e) { mal.push(nom); console.log("✗", nom, "—", (e.message || "").split("\n")[0].slice(0, 120)); } }
await env.cleanup();
console.log(`\nReglas: ${ok}/${casos.length} aprobadas`);
process.exit(mal.length ? 1 : 0);
