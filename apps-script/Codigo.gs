/**
 * ComparáSúper — recibe sugerencias, votos y registros de novedades, y publica las sugerencias aprobadas.
 *
 * Va pegado en la planilla de Google (Extensiones > Apps Script) y se publica como "Aplicación web"
 * con acceso "Cualquier usuario". La dirección que da Google se pone en site/config.json → "apps_script_url".
 *
 * Pestañas que usa (se crean solas si no existen):
 *   Sugerencias: Fecha | Sugerencia | Nombre | Aprobada (casilla)   ← tildá "Aprobada" para publicarla
 *   Votos:       Fecha | Id | Voto
 *   Novedades:   Fecha | Correo | Temas | Zona
 */

function hoja_(nombre, encabezados) {
  const libro = SpreadsheetApp.getActiveSpreadsheet();
  let h = libro.getSheetByName(nombre);
  if (!h) {
    h = libro.insertSheet(nombre);
    h.appendRow(encabezados);
    h.setFrozenRows(1);
    h.getRange(1, 1, 1, encabezados.length).setFontWeight("bold");
  }
  return h;
}

function limpiar_(t, max) {
  // evita fórmulas inyectadas en la planilla y recorta el largo
  t = String(t || "").replace(/[\u0000-\u001f]/g, " ").trim().slice(0, max);
  return /^[=+\-@]/.test(t) ? "'" + t : t;
}

function doPost(e) {
  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    const d = JSON.parse(e.postData.contents || "{}");
    if (d.tipo === "sugerencia") {
      const texto = limpiar_(d.texto, 1000);
      if (texto.length < 10) return salida_({ ok: false });
      const h = hoja_("Sugerencias", ["Fecha", "Sugerencia", "Nombre", "Aprobada"]);
      h.appendRow([new Date(), texto, limpiar_(d.nombre, 60), false]);
      h.getRange(h.getLastRow(), 4).insertCheckboxes();
    } else if (d.tipo === "voto") {
      const voto = d.voto === "positivo" ? "positivo" : "negativo";
      hoja_("Votos", ["Fecha", "Id", "Voto"]).appendRow([new Date(), limpiar_(d.id, 20), voto]);
    } else if (d.tipo === "novedades") {
      const mail = limpiar_(d.email, 120);
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(mail)) return salida_({ ok: false });
      hoja_("Novedades", ["Fecha", "Correo", "Temas", "Zona"]).appendRow([new Date(), mail, limpiar_(d.temas, 200), limpiar_(d.zona, 60)]);
    }
    return salida_({ ok: true });
  } finally {
    lock.releaseLock();
  }
}

function doGet(e) {
  if ((e.parameter || {}).accion !== "sugerencias") return salida_({ ok: true });
  const s = hoja_("Sugerencias", ["Fecha", "Sugerencia", "Nombre", "Aprobada"]).getDataRange().getValues();
  const v = hoja_("Votos", ["Fecha", "Id", "Voto"]).getDataRange().getValues();
  const cuenta = {};
  for (let i = 1; i < v.length; i++) {
    const id = String(v[i][1]);
    cuenta[id] = cuenta[id] || { p: 0, n: 0 };
    v[i][2] === "positivo" ? cuenta[id].p++ : cuenta[id].n++;
  }
  const lista = [];
  for (let i = 1; i < s.length; i++) {
    if (s[i][3] !== true) continue;
    const id = String(i + 1);   // número de fila: no cambia mientras no borres filas
    const f = s[i][0] instanceof Date ? Utilities.formatDate(s[i][0], "America/Argentina/Buenos_Aires", "dd/MM/yyyy") : "";
    lista.push({ id: id, fecha: f, texto: String(s[i][1]), nombre: String(s[i][2] || ""), positivos: (cuenta[id] || {}).p || 0, negativos: (cuenta[id] || {}).n || 0 });
  }
  return salida_({ sugerencias: lista });
}

function salida_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}
