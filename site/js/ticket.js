/* SuperBarato: lector de tickets del súper y lista de compras pegada o compartida.
   Se baja recién cuando alguien lo usa (así la web carga más rápido). Usa funciones y datos de app.js. */
const NO_PROD = /total|subtotal|iva\b|efectivo|tarjeta|vuelto|cambio|cuit|ticket|factura|fecha|hora|cajer|caja\b|descuento|bonif|redondeo|pago|saldo|debito|credito|qr\b|mercado ?pago|gracias|cliente|consumidor|items?\b|art[ií]culos|domicilio|ing\.? ?br|p\.?v\.?|nro|n[º°]/i;
function leerTicket(txt) {
  const out = [];
  for (let l of txt.split(/\n+/)) {
    l = l.replace(/\s+/g, " ").trim();
    const m = l.match(/^(.*?)[\s$]*(\d{1,3}(?:[.,]\d{3})*[.,]\d{2})\s*[A-Z%]{0,3}$/);   // termina en un precio: "LECHE SERENIS 1L 1.234,50"
    if (!m || NO_PROD.test(m[1]) || m[1].replace(/[^a-záéíóúñ]/gi, "").length < 4) continue;
    let nombre = m[1], cant = 1;
    const q = nombre.match(/^(\d+(?:[.,]\d+)?)\s*[xX*]\s*/); if (q) { cant = Math.round(parseFloat(q[1].replace(",", "."))) || 1; nombre = nombre.slice(q[0].length); }
    const precio = parseFloat(m[2].replace(/[.,](?=\d{3}\b)/g, "").replace(",", "."));
    if (precio > 0 && precio < 1e7) out.push({ txt: nombre.trim(), cant, precio });
  }
  return out;
}
const matchTicket = lineas => new Promise(ok => {
  if (!BUSC.w || !BUSC.ok) return ok(null);
  const id = ++BUSC.n; (BUSC.tk = BUSC.tk || {})[id] = ok;
  BUSC.w.postMessage({ t: "ticket", id, lineas: lineas.map(l => l.txt) });
});
function modalTicket() {
  openModal(`<h2>🧾 ¿Cuánto te hubieras ahorrado?</h2>
    <p class="sub">Sacale una foto al ticket del súper y te decimos cuánto te hubiera salido lo mismo comprando cada cosa donde está más barato. La foto se lee en tu celular y no se manda a ningún lado.</p>
    <label class="btn" style="display:inline-flex;gap:8px;cursor:pointer;margin:6px 0">📷 Sacar o elegir foto del ticket<input type="file" id="tkfile" accept="image/*" capture="environment" hidden></label>
    <p class="sub">Consejo: el ticket estirado, derecho, con buena luz y que se lea entero.</p>
    <div id="tkres" role="status"></div>`);
  $("#tkfile").onchange = async e => {
    const f = e.target.files[0]; if (!f) return;
    const box = $("#tkres"), est = t => { box.innerHTML = `<div class="tkprog"><div class="spin"></div>${t}</div>`; };
    est("Preparando el lector de tickets… (la primera vez tarda un poco más)");
    try {
      await loadProducts();
      const T = await loadTS();
      const w = await T.createWorker("spa", 1, { logger: m => { if (m.status === "recognizing text" && $("#tkres")) est(`Leyendo el ticket… ${Math.round(m.progress * 100)}%`); } });
      const { data } = await w.recognize(f); await w.terminate();
      const lineas = leerTicket(data.text || "");
      if (!lineas.length) { box.innerHTML = `<div class="warn">No pudimos leer productos con precio en la foto. Probá con más luz, el ticket derecho y más cerca.</div>`; return; }
      est("Buscando cada producto…");
      const res = await matchTicket(lineas);
      if (!$("#tkres")) return;
      ticketTabla(lineas, res || []);
    } catch { box.innerHTML = `<div class="warn">No se pudo leer el ticket. Revisá tu conexión (la primera vez se baja el lector) y probá de nuevo.</div>`; }
  };
}
/* tamaño escrito en el renglón del ticket ("1KG", "750CC", "500 GR") en kg o litros, para elegir la presentación correcta */
function tamTicket(t) {
  const m = nrm(t).match(/(\d+(?:[.,]\d+)?)\s*(kgs?|k|grs?|g|lts?|l|ml|cc|cm3)\b/); if (!m) return null;
  const n = parseFloat(m[1].replace(",", ".")), u = m[2];
  return /^(kgs?|k)$/.test(u) ? { q: n, u: "kg" } : /^(grs?|g)$/.test(u) ? { q: n / 1000, u: "kg" } : /^(lts?|l)$/.test(u) ? { q: n, u: "l" } : { q: n / 1000, u: "l" };
}
/* Tabla para revisar lo leído (ticket o lista pegada). Todo se puede corregir antes de usarlo: el texto (se vuelve
   a buscar), cuál producto es, la cantidad y lo que pagaste; se pueden quitar renglones y sumar los que faltan.
   Lo leído automáticamente NO se toma como cierto: el ahorro se muestra recién cuando confirmás. */
function ticketTabla(lineas, res, esLista) {
  // primero el tamaño que dice el renglón (si lo dice); después, el más parecido al texto (lo ordena el proceso de fondo)
  const orden = (l, ids) => { const t = tamTicket(l.txt); const d = id => { const p = BY[id]; return !t ? 0 : p.bq && p.bu === t.u ? Math.round(Math.abs(p.bq - t.q) / t.q * 10) : 99; };
    return [...ids].sort((a, b) => d(a) - d(b)).slice(0, 6); };   // a igual tamaño, se respeta el orden por parecido del texto
  const fila = (l, r) => { const ids = orden(l, ((r && r.ids) || []).filter(id => BY[id])); return { ...l, ids, sel: 0, on: ids.length > 0 }; };
  const filas = lineas.map((l, i) => fila(l, res[i]));
  let conf = false;
  const rebuscar = async i => { const f = filas[i]; const r = f.txt.trim().length >= 3 ? await matchTicket([f]) : null; Object.assign(f, fila(f, r && r[0])); conf = false; draw(); };
  const num = (v, min) => { const n = parseFloat(String(v).replace(",", ".")); return Number.isFinite(n) && n >= min ? n : null; };
  const draw = () => {
    let pag = 0, mej = 0, n = 0, sinPrecio = 0;
    const html = filas.map((f, i) => {
      const p = f.on && BY[f.ids[f.sel]], b = p && best(p);
      if (p) { n++; if (esLista) mej += b.v * f.cant; else if (f.precio > 0) { pag += f.precio; mej += Math.min(f.precio, b.v * f.cant); } else sinPrecio++; }
      return `<div class="tkrow${p ? "" : " off"}"><div class="tkl">
        <label class="tkf"><span class="sub">${esLista ? "Producto" : "Texto del ticket"}</span><input class="in" data-tkt="${i}" value="${esc(f.txt)}" placeholder="Ej.: leche entera 1 l" autocomplete="off"></label>
        ${f.ids.length ? `<select class="sel" data-tksel="${i}" aria-label="Qué producto es">${f.ids.map((id, k) => `<option value="${k}" ${k === f.sel && f.on ? "selected" : ""}>${esc(BY[id].name)}</option>`).join("")}<option value="-1" ${f.on ? "" : "selected"}>No es ninguno de estos</option></select>`
          : `<span class="sub">${f.txt.trim() ? "No lo encontramos: corregí el texto (por ejemplo, sin abreviaturas)." : "Escribí qué producto es."}</span>`}
        <div class="tkn"><label>Cantidad <input class="in" type="number" inputmode="numeric" min="1" step="1" data-tkc="${i}" value="${f.cant}"></label>
          ${esLista ? "" : `<label>Pagaste $ <input class="in" type="number" inputmode="decimal" min="0" step="0.01" data-tkpr="${i}" value="${f.precio || ""}" placeholder="0"></label>`}</div></div>
        <div class="tkp">${p ? `<b>${money(b.v * f.cant)}</b><br><span class="sub">en ${esc(chanName(b.o.s, b.c))}</span>` : ""}</div>
        <button type="button" class="x" data-tkdel="${i}" aria-label="Quitar este renglón" title="Quitar">${ic("x")}</button></div>`;
    }).join("");
    const ah = pag - mej, cuenta = `Reconocimos <b>${n}</b> de ${filas.length} renglones`;
    const resumen = !n ? `No reconocimos productos todavía. Corregí el texto de cada renglón o agregá los que falten.`
      : !conf ? `<div>${cuenta}. <b>Revisá cada uno</b>: el ticket se leyó automáticamente y puede tener errores.</div><div class="sub">Cuando esté todo bien, tocá «Confirmar».</div>`
      : esLista ? `<div>${cuenta}.</div><div class="big">Desde ${money(mej)}</div><div class="sub">comprando cada uno donde está más barato, sin descuentos de pago.</div>`
      : `<div>${cuenta}. Pagaste <b>${money(pag)}</b> por ellos.</div><div class="big">${ah > 0 ? `Podrías ahorrar ${money(ah)}` : "¡Compraste bien!"}</div><div class="sub">comprando cada uno donde está más barato (${money(mej)}), sin contar descuentos con tu banco.${sinPrecio ? ` ${sinPrecio} sin precio no se cuentan.` : ""}</div>`;
    $("#tkres").innerHTML = `<div class="tksum" role="status">${resumen}</div>${html}
      <button type="button" class="btn sec sm" id="tkadd" style="margin-top:10px">+ Agregar un producto que falta</button>
      <div class="mfoot"><span></span>${!n ? "" : conf ? `<button class="btn sec" id="tkedit">Seguir corrigiendo</button><button class="btn" id="tkplan">${ic("chart-column")} Ver dónde conviene esta compra</button>` : `<button class="btn" id="tkok">${ic("check")} Confirmar</button>`}</div>`;
    $$("[data-tksel]").forEach(e => e.onchange = () => { const f = filas[+e.dataset.tksel], v = +e.value; f.on = v >= 0; if (v >= 0) f.sel = v; conf = false; draw(); });
    $$("[data-tkt]").forEach(e => e.onchange = () => { filas[+e.dataset.tkt].txt = e.value; rebuscar(+e.dataset.tkt); });
    $$("[data-tkc]").forEach(e => e.onchange = () => { filas[+e.dataset.tkc].cant = Math.round(num(e.value, 1) || 1); conf = false; draw(); });
    $$("[data-tkpr]").forEach(e => e.onchange = () => { filas[+e.dataset.tkpr].precio = num(e.value, 0) || 0; conf = false; draw(); });
    $$("[data-tkdel]").forEach(e => e.onclick = () => { filas.splice(+e.dataset.tkdel, 1); conf = false; draw(); });
    $("#tkadd").onclick = () => { filas.push({ txt: "", cant: 1, precio: 0, ids: [], sel: 0, on: false }); conf = false; draw(); $(`[data-tkt="${filas.length - 1}"]`).focus(); };
    const ok = $("#tkok"); if (ok) ok.onclick = () => { conf = true; draw(); $("#tkres .tksum").scrollIntoView({ block: "nearest" }); };
    const ed = $("#tkedit"); if (ed) ed.onclick = () => { conf = false; draw(); };
    const pb = $("#tkplan"); if (pb) pb.onclick = () => { PLAN = {}; for (const f of filas) if (f.on && BY[f.ids[f.sel]]) PLAN[f.ids[f.sel]] = (PLAN[f.ids[f.sel]] || 0) + f.cant; savePlan(); closeModal(); irA("conviene"); };
  };
  draw();
}

/* ---------- LISTA DE COMPRAS COMPARTIDA DESDE OTRA APP O PEGADA ----------
   Con la web instalada, en "Compartir" de WhatsApp, Notas, etc. aparece SuperBarato (Web Share Target).
   Cada renglón ("2 leche", "yerba x1kg", "• aceite") se busca entre los productos. */
function partirLista(t) {
  return (t || "").split(/\n|,|;|•|·|- (?=\S)/).map(x => x.replace(/^[\s\-*–—>✅☑️🔲⬜\d.)]*(?=\D)/u, m => (/^\s*\d+\s*$/.test(m) ? m : m.replace(/[\d.)]/g, ""))).trim()).filter(x => x.length >= 3)
    .map(x => { let cant = 1; const a = x.match(/^(\d{1,2})\s*(?:x\s*)?(?=\D)/i) || x.match(/\s+x\s*(\d{1,2})$/i); if (a) { cant = +a[1] || 1; x = x.replace(a[0], " ").trim(); } return { txt: x, cant, precio: 0 }; })
    .slice(0, 60);
}
function modalLista(texto, auto) {
  openModal(`<h2>${ic("receipt")} ${auto ? "Recibimos tu lista" : "Pegá tu lista de compras"}</h2>
    <p class="sub">Un producto por renglón (por ejemplo «2 leche», «yerba 1kg», «aceite»). Te mostramos qué producto es cada uno y después calculamos dónde te conviene comprar todo.</p>
    <textarea class="ta" id="lstxt" rows="7" placeholder="leche&#10;2 yerba&#10;aceite girasol&#10;galletitas">${esc(texto || "")}</textarea>
    <div class="mfoot"><span></span><button class="btn" id="lsgo">Buscar los productos</button></div><div id="tkres" role="status"></div>`);
  const go = async () => {
    const lineas = partirLista($("#lstxt").value);
    if (!lineas.length) { $("#tkres").innerHTML = `<div class="warn">Escribí al menos un producto.</div>`; return; }
    $("#tkres").innerHTML = `<div class="tkprog"><div class="spin"></div>Buscando cada producto…</div>`;
    await loadProducts();
    for (let i = 0; i < 40 && !BUSC.ok && BUSC.w; i++) await new Promise(r => setTimeout(r, 250));   // el buscador termina de armarse
    const res = await matchTicket(lineas);
    if ($("#tkres")) ticketTabla(lineas, res || [], true);
  };
  $("#lsgo").onclick = go;
  if (texto) go();
}
