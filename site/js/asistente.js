/* SuperBarato: asistente virtual. Funciona dentro de la página, sin servicios externos: entiende preguntas sobre
   precios, descuentos, tu compra y cómo usar cada sección, y responde con los datos cargados (no inventa nada).
   Se baja la primera vez que alguien le pregunta algo. Usa funciones y datos de app.js. */
const DIAS_N = ["domingo", "lunes", "martes", "miercoles", "jueves", "viernes", "sabado"];
const STOP = new Set("donde esta mas barato barata baratos baratas precio precios cuanto cuesta cuestan sale salen vale valen conviene comprar compro el la los las un una unos unas de del en que para por con y o me mi hay a al es son busco buscar quiero necesito super supermercado hoy ahora".split(" "));
const BOT_TEMAS = [
  [/carrit|lista/, () => `<b>🛒 Mi carrito</b>: tocá el <b>+</b> de cualquier producto para sumarlo; si ya está, aparecen <b>− cantidad +</b>. En la ficha del producto, con <b>«Ver más supermercados»</b> podés elegir de qué súper agregarlo. Desde el carrito lo compartís por WhatsApp o correo. <a href="#carrito">Ir a mi carrito</a>`],
  [/conviene|calcul|compar.*compra|mezcl/, () => `<b>📊 ¿Dónde conviene mi compra?</b>: cargá productos (o traé tu carrito) y te muestra cuánto sale todo en un comercio, mezclando dos, y el mejor día con tus medios de pago. <a href="#conviene">Abrir</a>`],
  [/medio|tarjeta mia|mis tarjetas|mis bancos/, () => `<b>💳 Mis medios</b>: arriba a la derecha marcás tus bancos, billeteras y tarjetas, y te mostramos solo los descuentos que podés usar. <button class="linkbtn" data-medios>Elegir mis medios</button>`],
  [/ubicaci|cerca|barrio|localidad|gps/, () => `<b>📍 Ubicación</b>: tocá «Elegí tu ubicación» debajo del logo. Podés usar el GPS o escribir tu barrio, y te mostramos los comercios cercanos y sus promos. <button class="linkbtn" data-ubic>Marcar mi ubicación</button>`],
  [/aviso|alerta|baje|bajo de precio|avisame/, () => `<b>🔔 Avisos</b>: en la ficha de un producto tocá «Avisarme si baja». Cuando baje, aparece una campanita arriba con el número de productos que bajaron.`],
  [/sugerenc|reclam|idea|mejora/, () => `<b>💬 Sugerencias</b>: tocá el globo de abajo a la derecha o <a href="#sugerencias">entrá acá</a>. Se publican después de revisarlas y todos pueden votarlas.`],
  [/oscuro|claro|tema|color de la pagina/, () => `Arriba tenés el botón <b>Modo Oscuro / Modo Claro</b> para cambiar los colores.`],
  [/vista|columna|lista de productos|iconos/, () => `En <a href="#buscar">Productos</a> el botón <b>«Ver»</b> cambia entre íconos grandes (3 columnas), íconos chicos (5 columnas) o lista de 50.`],
  [/de donde|datos|fuente|actualiz|confiable|sepa|oficial/, () => `Los precios de las sucursales vienen de la <b>base oficial SEPA</b> que informan las cadenas todos los días; los online, de la tienda web de cada cadena. Los descuentos los relevamos de páginas oficiales y notas, y cada uno dice su fuente. Se actualiza todos los días. Datos del ${esc(D.updated.split("-").reverse().join("/"))}.`],
  [/envio|online|delivery|a domicilio/, () => `Mostramos el precio <b>online</b> de cada cadena aparte del de la sucursal. El envío se suma en «¿Dónde conviene?». Si una tienda online tiene todos tus productos, te armamos el carrito allá con un botón.`],
  [/oferta|2x1|3x2|2da|segunda unidad/, () => `En <a href="#ofertas">Ofertas</a> están todas las ofertas vigentes de los comercios, con un banner de las destacadas. Las que van por cantidad (2x1, 2da al 70%) te avisan cuántas unidades llevar cuando sumás al carrito.`],
  [/jubilad|anses|pension/, () => { const ps = P.promos.filter(pr => (pr.requiere || []).includes("jubilados") || pr.medio === "jubilados"); return `Para jubilados hay ${ps.length} descuentos cargados. Marcá «Jubilados y pensionados» en <button class="linkbtn" data-medios>Mis medios</button> para verlos en los precios.`; }],
];
function botPromos(q, mios) {
  const n = nrm(q);
  let day = DIAS_N.findIndex(d => n.includes(d)); if (/manana/.test(n)) day = (HOY + 1) % 7; if (day < 0 && /hoy/.test(n)) day = HOY;
  const w = t => new RegExp("(^|[^a-z0-9])" + t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "([^a-z0-9]|$)").test(n);
  const meds = P.medios.filter(m => m.id !== "todos" && m.id !== "credito" && (w(nrm(m.name).replace(/^(banco|tarjeta) /, "").replace(/ \(.*\)$/, "")) || (m.id.length > 3 && w(m.id))));
  const sts = D.stores.filter(st => st.id === "dia" ? /(en|del|de|al) dia([^a-z]|$)|supermercados? dia|dia%/.test(n) : (w(nrm(st.name)) || w(st.id)));
  if (day < 0 && !meds.length && !sts.length) day = HOY;
  let ps = P.promos.filter(pr => pr.pct > 0 && (!mios || mineOk(pr)) && (day < 0 || pr.dias.includes(day)) && (!meds.length || meds.some(m => pr.medio === m.id || (pr.bancos || []).includes(m.id))) && (!sts.length || sts.some(st => pr.stores.includes(st.id))));
  ps = ps.sort((a, b) => b.pct - a.pct);
  const tit = [day >= 0 ? (day === HOY ? "hoy " + DIAS[day].toLowerCase() : "el " + DIAS[day].toLowerCase()) : "esta semana", mios && MEDIOS ? "con tus medios de pago" : "", meds.length ? "con " + meds.map(m => m.name).join(" o ") : "", sts.length ? "en " + sts.map(x => x.name).join(" o ") : ""].filter(Boolean).join(" ");
  if (!ps.length) return `No encontré descuentos ${esc(tit)}. Mirá la semana completa en <a href="#pagos">Descuentos por día</a>.`;
  return `Descuentos ${esc(tit)} (${ps.length}):<ul>${ps.slice(0, 6).map(pr => `<li><b>${pr.pct}%</b> con ${esc(medioName(pr))} en ${esc(pr.stores.map(x => ST[x] ? ST[x].name : x).join(", "))}${day < 0 ? ` · ${pr.dias.length === 7 ? "todos los días" : pr.dias.map(d => DCORTO[d]).join(", ")}` : ""} · ${esc(topeTxt(pr))}<br><span class="sub">${pagoIcon(pr)} ${esc(pagoTxt(pr))}</span></li>`).join("")}</ul>${ps.length > 6 ? `<a href="#pagos">Ver todos en Descuentos por día</a>` : ""}`;
}
/* productos que pide: los más baratos de la búsqueda. Si se miden igual (kg, litros), se ordenan por precio por kilo
   o litro, que es lo justo entre paquetes de distinto tamaño; si no, por precio. */
async function botProductos(q, calidad) {
  const words = nrm(q).replace(/[¿?¡!.,]/g, " ").split(/\s+/).filter(w => w.length > 1 && !STOP.has(w) && !BOT_RELLENO.has(w));
  if (!words.length) return null;
  const r = await buscarProm(words.join(" "), false), ps = r.ids.slice(0, 60).map(id => BY[id]).filter(Boolean);
  if (!ps.length) return `No encontré «${esc(words.join(" "))}» en los comercios que comparamos. Probá con otra palabra o sin la marca.`;
  const cuenta = {}; for (const p of ps) if (perUnit(p, 1)) cuenta[p.bu] = (cuenta[p.bu] || 0) + 1;
  const u = Object.keys(cuenta).sort((a, b) => cuenta[b] - cuenta[a])[0], porU = u && cuenta[u] >= ps.length * 0.6;
  let lista = porU ? ps.filter(p => p.bu === u && perUnit(p, 1)) : ps;
  if (calidad) lista = lista.filter(p => p.offers.length >= 5);   // "buena": de las que se venden en muchos comercios
  const val = p => { const v = best(p).v; return porU ? perUnit(p, v) : v; };
  const hits = [...lista].sort((a, b) => val(a) - val(b)).slice(0, 3);
  if (!hits.length) return null;
  const intro = (r.fix ? `Busqué «${esc(r.fix)}», que se parece a lo que escribiste. ` : "")
    + (calidad ? "No tenemos calificaciones de calidad, así que no puedo decirte cuál es mejor. Te muestro las más baratas entre las que se venden en muchos comercios (suelen ser las más conocidas):" : porU ? `Los más baratos por ${UNIT[u]} (así se comparan bien paquetes de distinto tamaño):` : "Los más baratos que encontré:");
  return `${intro}${hits.map(p => { const b = best(p); return `<div class="bprod">${prodImg(p, "li")}<div><button type="button" class="linkbtn" data-open="${p.id}"><b>${esc(p.name)}</b></button><br><b>${money(b.v)}</b> en ${esc(chanName(b.o.s, b.c))}${porU ? ` · <span class="sub">${unitTxt(p, b.v)}</span>` : ""} <span class="sub">(${p.offers.length} comercios)</span></div></div>`; }).join("")}
    <a href="#buscar" data-botq="${esc(words.join(" "))}">Ver todos los resultados</a>`;
}
/* el producto que la persona está mirando (ficha abierta): para no tener que escribir su nombre */
const botCtx = () => (openProduct.id && !$("#drawer").hidden && BY[openProduct.id]) || null;
function botDeProducto(p, n) {
  const ofs = p.offers.flatMap(o => allChans(o).map(c => ({ o, c, v: price1(o, c) }))).sort((a, b) => a.v - b.v);
  if (!ofs.length) return `De <b>${esc(p.name)}</b> no tenemos precios ahora.`;
  const lo = ofs[0], hi = ofs[ofs.length - 1], nom = `<b>${esc(p.name)}</b>`;
  if (/descuent|promo|tarjeta|banco|billetera|pagando/.test(n)) {
    let mj = null; for (const { o, c, v } of ofs) { const pay = payDiscount(o.s, HOY, c, v, true, base(o, c)); if (pay.promo && (!mj || v - pay.disc < mj.v)) mj = { o, c, v: v - pay.disc, pay }; }
    if (!mj) return `Hoy no encontré descuentos de pago para ${nom}${MEDIOS ? " con tus medios" : ""}. Lo más barato es ${money(lo.v)} en ${esc(chanName(lo.o.s, lo.c))}.`;
    return `Pagando hoy, ${nom} te queda en <b>${money(mj.v)}</b> en ${esc(chanName(mj.o.s, mj.c))} con ${esc(medioName(mj.pay.promo))}.${MEDIOS ? "" : ` Ojo: todavía no elegiste tus medios de pago, así que puede que no tengas esa tarjeta. <button type="button" class="linkbtn" data-medios>Elegir mis medios</button>`}`;
  }
  if (/ahorr|diferencia|cuanto (me )?sale|caro/.test(n)) {
    if (ofs.length < 2) return `${nom} lo encontramos en un solo comercio: ${money(lo.v)} en ${esc(chanName(lo.o.s, lo.c))}.`;
    const ah = hi.v - lo.v;
    return `${nom}: lo más barato es ${money(lo.v)} en ${esc(chanName(lo.o.s, lo.c))} y lo más caro ${money(hi.v)} en ${esc(chanName(hi.o.s, hi.c))}. Comprándolo en el más barato ahorrás <b>${money(ah)}</b> (${Math.round(ah / hi.v * 100)}%) por unidad, sin contar descuentos de pago.`;
  }
  return `${nom} está más barato en:<ul>${ofs.slice(0, 3).map(x => `<li><b>${money(x.v)}</b> en ${esc(chanName(x.o.s, x.c))}${ST[x.o.s] && ST[x.o.s].viejo && x.c === "tienda" ? " <span class='sub'>(precio desactualizado)</span>" : ""}</li>`).join("")}</ul>${unitTxt(p, lo.v) ? `<span class="sub">${unitTxt(p, lo.v)}</span>` : ""}`;
}
/* "¿qué súper me conviene para esta lista?": la de ¿Dónde conviene? si estás ahí; si no, el carrito */
function botLista() {
  const enPlan = location.hash === "#conviene" && Object.keys(PLAN).length, src = enPlan ? PLAN : LISTA;
  const items = Object.entries(src).map(([id, qty]) => ({ p: BY[id], qty })).filter(x => x.p);
  if (!items.length) return `Tu ${enPlan ? "lista" : "carrito"} está vacío. Sumá productos con el <b>+</b> y te digo dónde conviene. <a href="#conviene">Abrir ¿Dónde conviene?</a>`;
  const rk = rankAll(items, HOY).filter(b => b.lines.length >= Math.ceil(items.length * 0.7)).slice(0, 3);   // con poca cobertura no compite
  if (!rk.length) return `Ningún comercio tiene la mayoría de tus ${items.length} productos. Mirá el detalle en <a href="#conviene">¿Dónde conviene?</a>, donde se puede mezclar comercios.`;
  return `Para tus ${items.length} productos, hoy:<ul>${rk.map(b => `<li><b>${money(b.total)}</b> en ${esc(chanName(b.sid, b.c))}${b.miss.length ? ` <span class="sub">(le faltan ${b.miss.length})</span>` : ""}</li>`).join("")}</ul><span class="sub">${MEDIOS ? "Con tus medios de pago." : "Sin descuentos de pago (no elegiste tus medios)."}</span> <a href="#conviene">Ver el detalle y mezclar comercios</a>`;
}
/* "comparame X y Y": busca cada uno y los manda a Comparar */
async function botComparar(q, n) {
  const ctx = botCtx(), partes = n.replace(/^.*?compar(a|á)?(me|r)?( los| las| el| la)?/, "").split(/\s+(?:y|vs|contra|con|o)\s+|,/).map(x => x.trim()).filter(x => x.length > 2 && !/^(estos|estas|esos|dos|productos?)$/.test(x));
  const ids = [];
  if (ctx) ids.push(ctx.id);
  for (const t of partes.slice(0, 4)) { const r = await buscarProm(t, false); if (r.ids[0] && !ids.includes(r.ids[0])) ids.push(r.ids[0]); }
  if (ids.length) { CMP = [...new Set([...ids, ...CMP])].slice(0, 4); LS.set(PK("cs_cmp"), CMP); cmpBar(); }
  if (CMP.length >= 2) return `Listo: tenés ${CMP.length} productos para comparar (${CMP.map(id => esc(BY[id] ? BY[id].name : "")).join(", ")}). <a href="#comparar">Ver la comparación</a>, con precio por kilo o litro.`;
  return `Para comparar necesito dos productos. Abrí uno y tocá «Comparar», o escribime por ejemplo «comparame yerba playadito y yerba taragüí».`;
}
const BOT_RELLENO = new Set("che porfa favor dale consigo encuentro encontrar buscame mostrame decime dame tenes calidad buena bueno buenas buenos economica economico economicas economicos rica rico mejor mejores marca marcas recomendas recomendame".split(" "));
function botFormas(q) {
  const n = nrm(q), f = Object.values(P.formas_pago).find(f => { const t = nrm(f.t); return (/modo/.test(n) && /modo/.test(t)) || (/nfc|contactless|celular/.test(n) && /nfc/.test(t)) || (/qr/.test(n) && /qr de la billetera/.test(t)); });
  return f ? `<b>${f.i} ${esc(f.t)}</b>: ${esc(f.d)}` : null;
}
async function botResponder(q) {
  const n = nrm(q).trim().replace(/[¿?¡!]/g, "");
  if (!n) return "";
  if (!D || !D.products) return "Todavía estoy cargando los precios. Probá de nuevo en unos segundos.";
  if (/^(hola|buenas|buen dia|buenas tardes|buenas noches|hey|que tal)\b/.test(n) && n.length < 20) return "¡Hola! Preguntame, por ejemplo: «¿dónde está más barata la yerba?», «¿qué descuentos tengo hoy con mi tarjeta?», «¿qué súper me conviene para mi carrito?» o «comparame dos productos».";
  if (/gracias|genial|buenisimo/.test(n) && n.length < 25) return "¡De nada! Si necesitás algo más, preguntame.";
  if (/(como|que es).*(pago|pagar|modo|qr|nfc|contactless)|pagar con (qr|nfc|el celular)/.test(n)) { const r = botFormas(q); if (r) return r; }
  if (/compar(a|á|ame|ar)\b|comparame|\bvs\b/.test(n)) return botComparar(q, n);
  if (/\b(lista|carrito|compra)\b/.test(n) && /(conviene|super|supermercado|donde|cual|mas barat|cuanto)/.test(n) && !/como (armo|hago|uso)/.test(n)) return botLista();
  // la ficha de un producto abierta: "¿dónde está más barato?", "¿cuánto ahorro?", "¿tiene descuento?" se refieren a ese
  const ctx = botCtx(), sinNombre = !n.split(/\s+/).some(w => w.length > 2 && !STOP.has(w) && !BOT_RELLENO.has(w) && !/^(este|esta|esto|aca|ahi|producto|descuento|descuentos|promo|promos|ahorro|ahorro|tiene|tarjeta|tarjetas|banco|pagando|diferencia|caro)$/.test(w));
  if (ctx && (sinNombre || /\b(este|esta|esto|aca)\b/.test(n))) return botDeProducto(ctx, n);
  const mios = /\b(mi|mis)\b.*(tarjeta|banco|medio|billetera|cuenta)|\btengo\b|puedo aprovechar|me corresponde/.test(n);
  const promoQ = /descuent|promo|reintegro|beneficio|banco|billetera|tarjeta|cuenta dni|mercado pago|modo|que dia|dia conviene|ofertas? (tengo|hay)/.test(n) && !/carrit|mis medios$/.test(n);
  if (promoQ && mios && !MEDIOS) return `Para decirte qué descuentos podés usar necesito saber tus medios de pago (bancos, billeteras, tarjetas). <button type="button" class="linkbtn" data-medios>Elegir mis medios</button> Mientras tanto, estos son todos los de hoy:<br>${botPromos(q.replace(/mis?|tengo/gi, " "))}`;
  if (promoQ) return botPromos(q, mios);
  for (const [re, f] of BOT_TEMAS) if (re.test(n)) return f();
  const st = D.stores.find(x => n === nrm(x.name) || n === x.id);
  if (st) return `${esc(st.name)}: ${D.products.filter(p => offerAt(p, st.id)).length} productos comparados.${st.online ? ` Tiene tienda online (${esc(st.online.nombre || "")}).` : ""}<br>${botPromos(st.name)}`;
  if (ctx && /barat|conviene|ahorr|donde/.test(n) && sinNombre) return botDeProducto(ctx, n);
  return (await botProductos(q, /calidad|buena|bueno|mejor|recomend/.test(n))) || `No estoy seguro de haber entendido 🤔. Puedo ayudarte con:<ul><li>Precios: «¿dónde consigo el aceite más barato?»</li><li>Descuentos: «¿qué descuentos tengo hoy con mi tarjeta?», «promos del sábado», «promos en Coto»</li><li>Tu compra: «¿qué súper me conviene para mi carrito?», «comparame dos productos»</li><li>Cómo usar la página: carrito, mis medios, ubicación, avisos</li></ul>`;
}
