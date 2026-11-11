/* ComparáSúper — pantalla para elegir la provincia (mapa 3D con fotos, alfiler y zoom).
   Uso: abrirMapa({ actual: "AR-X", primera: true }) → Promise con el código elegido ("AR-X") o null si se cerró. */
(function () {
  const PROVS = [
    ["AR-C", "Ciudad de Buenos Aires", "caba", "el Obelisco"], ["AR-B", "Buenos Aires", "bsas", "la llanura pampeana"],
    ["AR-K", "Catamarca", "catamarca", "el Campo de Piedra Pómez"], ["AR-H", "Chaco", "chaco", "el algodón"],
    ["AR-U", "Chubut", "chubut", "la ballena franca"], ["AR-X", "Córdoba", "cordoba", "las sierras"],
    ["AR-W", "Corrientes", "corrientes", "los Esteros del Iberá"], ["AR-E", "Entre Ríos", "entrerios", "los ríos y puentes"],
    ["AR-P", "Formosa", "formosa", "el pomelo"], ["AR-Y", "Jujuy", "jujuy", "los cerros de colores"],
    ["AR-L", "La Pampa", "lapampa", "el trigo"], ["AR-F", "La Rioja", "larioja", "Talampaya"],
    ["AR-M", "Mendoza", "mendoza", "los viñedos"], ["AR-N", "Misiones", "misiones", "las Cataratas"],
    ["AR-Q", "Neuquén", "neuquen", "los lagos"], ["AR-R", "Río Negro", "rionegro", "Bariloche"],
    ["AR-A", "Salta", "salta", "los cardones"], ["AR-J", "San Juan", "sanjuan", "los valles"],
    ["AR-D", "San Luis", "sanluis", "las sierras"], ["AR-Z", "Santa Cruz", "santacruz", "el glaciar Perito Moreno"],
    ["AR-S", "Santa Fe", "santafe", "el río Paraná"], ["AR-G", "Santiago del Estero", "sde", "el monte"],
    ["AR-V", "Tierra del Fuego", "tdf", "el faro del fin del mundo"], ["AR-T", "Tucumán", "tucuman", "los cerros verdes"],
  ];
  const POR_NOMBRE = Object.fromEntries(PROVS.map(p => [p[1], p]));
  const POR_COD = Object.fromEntries(PROVS.map(p => [p[0], p]));
  window.PROVINCIAS = PROVS.map(([c, n]) => ({ code: c, name: n }));
  window.provNombre = c => (POR_COD[c] || [, ""])[1];
  window.provCorto = c => (c === "AR-C" ? "CABA" : window.provNombre(c));

  const NS = "http://www.w3.org/2000/svg";
  const foto = n => `img/prov/${POR_NOMBRE[n][2]}.webp`;
  const de = c => (c.startsWith("el ") ? "del " + c.slice(3) : "de " + c);
  const corto = n => (n === "Ciudad de Buenos Aires" ? "CABA" : n);
  const esc = s => String(s).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  const PIN = `<svg viewBox="0 0 28 40" width="28" height="40"><path d="M14 39C14 39 2 23.5 2 14a12 12 0 0 1 24 0c0 9.5-12 25-12 25z" fill="#0e7a55" stroke="#063a29" stroke-width="1.5"/><circle cx="14" cy="14" r="6.5" fill="#fff"/><circle cx="14" cy="14" r="3.6" fill="#ffc21a"/><path d="M8 8a8 8 0 0 1 5-3" stroke="#fff" stroke-width="1.6" stroke-linecap="round" opacity=".6" fill="none"/></svg>`;

  const ESTILO = `
#pmapa{position:fixed;inset:0;z-index:200;background:var(--bg);overflow:auto;-webkit-overflow-scrolling:touch;animation:pmIn .25s ease-out}
@keyframes pmIn{from{opacity:0}}
#pmapa .pm-in{max-width:1080px;margin:0 auto;padding:18px 16px 40px}
#pmapa .pm-top{display:flex;align-items:center;gap:12px;justify-content:space-between;margin-bottom:6px}
#pmapa .pm-logo{font-weight:800;font-size:20px;color:var(--g)}#pmapa .pm-logo span{color:var(--y)}
#pmapa .pm-x{border:1px solid var(--line);background:var(--card);border-radius:999px;padding:8px 14px;font-weight:700}
#pmapa h1{font-size:26px;margin:6px 0 4px;line-height:1.2}
#pmapa .pm-sub{color:var(--mut);margin:0 0 14px;font-size:15px;line-height:1.45}
#pmapa .pm-box{background:var(--card);border:1px solid var(--line);border-radius:22px;padding:20px;overflow:clip;box-shadow:var(--sh)}
#pmapa .mapwrap{display:grid;grid-template-columns:minmax(0,1fr) 320px;gap:20px;align-items:start}
#pmapa .stage{position:relative;display:flex;justify-content:center;perspective:1000px;padding-top:8px}
#pmapa .plano{position:relative;width:min(330px,86vw);transform:rotateX(20deg);transform-origin:50% 0;transform-style:preserve-3d}
#pmapa .plano svg.base{display:block;width:100%;height:auto;overflow:visible}
#pmapa .base .prov{fill:#cfe6da;stroke:var(--card);stroke-width:.55;cursor:pointer}
[data-theme="dark"] #pmapa .base .prov{fill:#2a4a3c}
#pmapa .base .prov.sel{fill:#93cdb0}
#pmapa .base .fijo .borde{fill:none;stroke:var(--g);stroke-width:1.2;stroke-linejoin:round}
#pmapa .base .fijo image{animation:pmIn .5s ease-out}
#pmapa .pin{position:absolute;width:28px;height:40px;margin:-40px 0 0 -14px;pointer-events:none;transform-origin:50% 100%;transform:rotateX(-20deg);z-index:4;animation:pmCae .7s cubic-bezier(.3,1.6,.5,1) both;filter:drop-shadow(0 3px 2px rgba(0,0,0,.35))}
@keyframes pmCae{from{transform:translateY(-70px) rotateX(-20deg);opacity:0}60%{opacity:1}}
#pmapa .pinsombra{position:absolute;width:16px;height:6px;margin:-3px 0 0 -8px;border-radius:50%;background:rgba(0,0,0,.35);pointer-events:none;z-index:3}
#pmapa .capa{position:absolute;pointer-events:none;display:none}
#pmapa .capa.vis{display:block}
#pmapa .capa svg{position:absolute;inset:0;width:100%;height:100%;overflow:visible}
#pmapa .capa .hole{fill:#063a29;opacity:0;transition:opacity .2s}
#pmapa .capa.up .hole{opacity:.55}
#pmapa .capa .alza{position:absolute;inset:0;will-change:transform;transform:translateY(0);transition:transform .38s cubic-bezier(.25,1.5,.45,1)}
#pmapa .capa.up .alza{transform:translateY(calc(var(--h) * -1px))}
#pmapa .capa .pared{fill:#0b4d37;stroke:#063a29;stroke-width:.25;opacity:0;transition:opacity .12s}
#pmapa .capa.up .pared{opacity:1}
#pmapa .capa .tapa{fill:#0e7a55}
#pmapa .capa .foto{opacity:0;transition:opacity .35s .12s}
#pmapa .capa.up .foto{opacity:1}
#pmapa .capa .borde{fill:none;stroke:#0e7a55;stroke-width:1.3;stroke-linejoin:round}
#pmapa .capa .brillo{fill:url(#pmbrillo)}
#pmapa .tt{position:absolute;left:0;top:0;pointer-events:none;background:#14201b;color:#fff;padding:8px 12px;border-radius:12px;font-weight:700;font-size:14px;white-space:nowrap;opacity:0;transition:opacity .15s;box-shadow:0 8px 20px rgba(0,0,0,.25);will-change:transform;z-index:5}
#pmapa .tt.on{opacity:1}#pmapa .tt small{display:block;font-weight:500;opacity:.8;font-size:12px}
#pmapa .pulso{fill:var(--y);stroke:#0b4d37;stroke-width:.8;pointer-events:none;transform-box:fill-box;transform-origin:center;animation:pmPul 1.6s ease-in-out infinite}
@keyframes pmPul{50%{transform:scale(1.5)}}
#pmapa .lado h3{margin:0 0 6px;font-size:15px}
#pmapa .lado>p{margin:0 0 8px;color:var(--mut);font-size:13.5px;line-height:1.4}
#pmapa .zoombox{position:relative;background:#cfe3f3;border-radius:16px;border:1px solid var(--line);overflow:hidden}
[data-theme="dark"] #pmapa .zoombox{background:#16324a}
#pmapa #pmzoom{display:block;width:100%;height:auto;aspect-ratio:1/1}
#pmapa #pmzoom .zp{fill:#d9ece2;stroke:#fff;stroke-width:1;vector-effect:non-scaling-stroke;cursor:pointer;transition:fill .15s}
[data-theme="dark"] #pmapa #pmzoom .zp{fill:#2a4a3c;stroke:#16324a}
#pmapa #pmzoom .zp:hover{fill:#bfe0cf}
#pmapa #pmzoom .zfoco .borde{fill:none;stroke:#0e7a55;stroke-width:3;vector-effect:non-scaling-stroke;stroke-linejoin:round}
#pmapa #pmzoom .zfoco .sombra2{fill:rgba(6,58,41,.35)}
#pmapa .zname{position:absolute;left:8px;bottom:8px;right:8px;background:rgba(20,32,27,.82);color:#fff;border-radius:10px;padding:7px 10px;font-weight:800;font-size:14px;pointer-events:none}
#pmapa .zname small{display:block;font-weight:500;opacity:.85;font-size:12px}
#pmapa .zbtns{display:flex;gap:6px;margin-top:8px;flex-wrap:wrap}
#pmapa .zbtns button{border:1px solid var(--line);background:var(--card);border-radius:999px;padding:6px 12px;font-weight:700;font-size:13px}
#pmapa .zbtns button:hover{border-color:var(--g);color:var(--g)}
#pmapa .lista{margin-top:14px}
#pmapa .lista p{margin:0 0 6px;font-size:13.5px;color:var(--mut)}
#pmapa .lista select{width:100%;padding:10px;border-radius:12px;border:1px solid var(--line);font-size:15px;background:var(--card);color:var(--ink)}
#pmapa .lista select option{background:var(--card);color:var(--ink)}
#pmapa .elegido{position:sticky;bottom:10px;z-index:21;box-shadow:0 8px 24px rgba(0,0,0,.14);margin-top:14px;background:var(--gl);border-radius:14px;padding:12px 16px;font-size:15px;min-height:52px;display:flex;align-items:center;gap:12px;flex-wrap:wrap}
#pmapa .elegido img{width:44px;height:44px;border-radius:10px;object-fit:cover;flex:none}
#pmapa .elegido b{color:var(--gtx)}
#pmapa .elegido .txt{flex:1;min-width:180px}
#pmapa .pm-ok{border:0;background:var(--g);color:#fff;border-radius:999px;padding:12px 20px;font-weight:800;font-size:16px;box-shadow:0 6px 16px rgba(14,122,85,.3)}
#pmapa .pm-ok:hover{background:var(--g2)}
#pmapa .creditos{color:var(--mut);font-size:12px;margin-top:14px}
@media (max-width:760px){
  #pmapa .mapwrap{grid-template-columns:1fr}
  #pmapa .lado{order:-1}
  #pmapa .lado>p,#pmapa .lado>h3{display:none}
  #pmapa .zoombox{position:fixed;right:10px;bottom:90px;width:42vw;max-width:190px;z-index:20;box-shadow:0 10px 30px rgba(0,0,0,.3);border:2px solid #fff}
  #pmapa .zname{left:5px;right:5px;bottom:5px;padding:4px 7px;font-size:12px}#pmapa .zname small{font-size:10.5px}
  #pmapa .zbtns{margin-top:0}
  #pmapa .lista{margin-top:8px}#pmapa .lista p{display:none}
  #pmapa h1{font-size:21px}#pmapa .pm-box{padding:14px}
  #pmapa .pm-in{padding-bottom:120px}
  #pmapa .elegido{position:fixed;left:10px;right:10px;bottom:10px;margin:0;padding:10px 12px;gap:8px}
  #pmapa .elegido img{display:none}
  #pmapa .elegido .txt{min-width:0;font-size:14px}
  #pmapa .pm-ok{width:100%;padding:11px 16px}
  #pmapa .zoombox{bottom:128px}
}
@media (prefers-reduced-motion:reduce){#pmapa .alza,#pmapa .pin{transition:none!important;animation:none!important}}`;

  let M = null;
  async function datosMapa() {
    if (!M) M = await fetch("js/mapa.json").then(r => r.json());
    return M;
  }

  window.abrirMapa = async function ({ actual = null, primera = false } = {}) {
    const M = await datosMapa();
    if (!document.getElementById("pmapa-css")) { const st = document.createElement("style"); st.id = "pmapa-css"; st.textContent = ESTILO; document.head.appendChild(st); }
    document.getElementById("pmapa")?.remove();
    const root = document.createElement("div");
    root.id = "pmapa"; root.setAttribute("role", "dialog"); root.setAttribute("aria-modal", "true"); root.setAttribute("aria-label", "Elegí tu provincia");
    root.innerHTML = `<div class="pm-in">
      <div class="pm-top"><div class="pm-logo">🛒 Compará<span>Súper</span></div>${primera ? "" : '<button class="pm-x" type="button" data-pmx>✕ Cerrar</button>'}</div>
      <h1>${primera ? "¡Bienvenido! ¿Desde qué provincia comprás?" : "Cambiar de provincia"}</h1>
      <p class="pm-sub">Elegí tu provincia en el mapa (o en la lista) y te mostramos solo los supermercados, precios y descuentos de ahí. La podés cambiar cuando quieras desde el botón 🗺️ de arriba.</p>
      <div class="pm-box"><div class="mapwrap">
        <div class="stage"><div class="plano"></div><div class="tt"></div></div>
        <div class="lado">
          <h3>🔍 Zoom</h3>
          <p>Acá ves de cerca la provincia que señalás. También podés tocarla acá para elegirla.</p>
          <div class="zoombox"><svg id="pmzoom" viewBox="0 0 100 100"></svg><div class="zname"></div></div>
          <div class="zbtns"><button type="button" data-zcaba>📍 CABA y alrededores</button><button type="button" data-zpais>🇦🇷 Todo el país</button></div>
          <div class="lista"><p>¿Preferís elegir de una lista?</p><select aria-label="Elegí tu provincia de la lista"><option value="">Elegí tu provincia…</option></select></div>
        </div>
      </div>
      <div class="elegido"><span class="txt">👆 Tocá tu provincia en el mapa.</span></div></div>
      <p class="creditos">Fotos: Unsplash (uso libre). Mapa: Natural Earth (dominio público).</p>
    </div>`;
    document.body.appendChild(root);
    document.documentElement.style.overflow = "hidden";
    const $ = s => root.querySelector(s);
    const plano = $(".plano"), tt = $(".tt"), stage = $(".stage"), sel = $("select"), zoom = $("#pmzoom"), zname = $(".zname");

    const precargadas = new Set();
    const precargar = n => { if (precargadas.has(n)) return; precargadas.add(n); const i = new Image(); i.src = foto(n); };

    /* ---- mapa: una capa liviana por provincia, se eleva al pasar ---- */
    const vb = [-6, -6, M.W + 12, M.H + 12], alto = 9;
    const base = document.createElementNS(NS, "svg");
    base.setAttribute("viewBox", vb.join(" ")); base.setAttribute("class", "base");
    base.innerHTML = `<defs><linearGradient id="pmbrillo" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff" stop-opacity=".28"/><stop offset=".5" stop-color="#fff" stop-opacity="0"/></linearGradient></defs>`;
    for (const [n, d] of Object.entries(M.main)) {
      if (!d || !POR_NOMBRE[n]) continue;
      const p = document.createElementNS(NS, "path");
      p.setAttribute("d", d); p.setAttribute("class", "prov"); p.dataset.n = n; base.appendChild(p);
    }
    plano.appendChild(base);
    const dot = document.createElementNS(NS, "circle");
    dot.setAttribute("cx", M.caba[0]); dot.setAttribute("cy", M.caba[1]); dot.setAttribute("r", 2.6); dot.setAttribute("class", "pulso"); base.appendChild(dot);

    const capas = {}; let arriba = null;
    function capa(n) {
      if (capas[n]) return capas[n];
      const src = base.querySelector(`[data-n="${CSS.escape(n)}"]`); if (!src) return null;
      const bb = src.getBBox(), d = src.getAttribute("d"), pad = 2;
      const x = bb.x - pad, y = bb.y - pad, w = bb.width + pad * 2, h = bb.height + pad * 2;
      const div = document.createElement("div"); div.className = "capa";
      Object.assign(div.style, { left: (x - vb[0]) / vb[2] * 100 + "%", top: (y - vb[1]) / vb[3] * 100 + "%", width: w / vb[2] * 100 + "%", height: h / vb[3] * 100 + "%" });
      const id = "pc" + Math.random().toString(36).slice(2, 8);
      let paredes = ""; for (let i = 10; i >= 1; i--) paredes += `<path class="pared" d="${d}" transform="translate(0 ${(alto * i / 10).toFixed(2)})"/>`;
      div.innerHTML = `<svg viewBox="${x} ${y} ${w} ${h}"><path class="hole" d="${d}"/></svg><div class="alza"><svg viewBox="${x} ${y} ${w} ${h}"><defs><clipPath id="${id}"><path d="${d}"/></clipPath></defs>${paredes}<path class="tapa" d="${d}"/><image class="foto" href="${foto(n)}" x="${x}" y="${y}" width="${w}" height="${h}" preserveAspectRatio="xMidYMid slice" clip-path="url(#${id})"/><path class="brillo" d="${d}"/><path class="borde" d="${d}"/></svg></div>`;
      plano.appendChild(div);
      return capas[n] = { div };
    }
    const subir = n => {
      if (arriba === n) return; bajar();
      const c = capa(n); if (!c) return; precargar(n);
      c.div.style.setProperty("--h", (alto * plano.clientWidth / vb[2]).toFixed(1));
      c.div.classList.add("vis"); c.div.offsetWidth; c.div.classList.add("up"); clearTimeout(c.t); arriba = n;
    };
    function bajar() {
      if (!arriba) return; const c = capas[arriba]; arriba = null; c.div.classList.remove("up");
      clearTimeout(c.t); c.t = setTimeout(() => { if (!c.div.classList.contains("up")) c.div.classList.remove("vis"); }, 420);
    }

    let raf = 0, ultimoEv = null, ultimoToque = null, elegida = null;
    const salir = () => { bajar(); tt.classList.remove("on"); };
    function mover(ev) {
      ultimoEv = ev; if (raf) return;
      raf = requestAnimationFrame(() => {
        raf = 0; const e = ultimoEv, p = e.target.closest && e.target.closest(".prov");
        if (!p) { salir(); return; }
        const n = p.dataset.n; subir(n); zoomPronto(n);
        if (tt.dataset.n !== n) { tt.dataset.n = n; tt.innerHTML = `${esc(corto(n))}<small>Tierra ${de(POR_NOMBRE[n][3])}</small>`; }
        tt.classList.add("on");
        const r = stage.getBoundingClientRect();
        tt.style.transform = `translate(${e.clientX - r.left + 18}px,${e.clientY - r.top}px) translate(0,-115%)`;
      });
    }
    base.addEventListener("pointermove", mover);
    base.addEventListener("pointerdown", mover);
    base.addEventListener("pointerleave", e => { if (e.pointerType === "mouse") { cancelAnimationFrame(raf); raf = 0; salir(); if (elegida) zoomPronto(elegida); } });
    base.addEventListener("click", e => {
      const p = e.target.closest(".prov"); if (!p) return;
      const n = p.dataset.n, tactil = matchMedia("(hover:none)").matches;
      elegir(n); if (tactil) setTimeout(salir, 700);   // en celular: se eleva un momento, queda la foto con el alfiler y abajo el botón para confirmar
    });
    (window.requestIdleCallback || (f => setTimeout(f, 1500)))(() => PROVS.forEach(p => precargar(p[1])));

    PROVS.slice().sort((a, b) => corto(a[1]).localeCompare(corto(b[1]), "es")).forEach(p => sel.add(new Option(corto(p[1]), p[1])));
    sel.onchange = () => { if (sel.value) elegir(sel.value); };

    /* ---- foto fija + alfiler ---- */
    function fijar(n) {
      base.querySelector(".fijo")?.remove();
      plano.querySelectorAll(".pin,.pinsombra").forEach(e => e.remove());
      const src = base.querySelector(`.prov[data-n="${CSS.escape(n)}"]`); if (!src) return;
      const bb = src.getBBox(), d = src.getAttribute("d");
      const g = document.createElementNS(NS, "g"); g.setAttribute("class", "fijo"); g.style.pointerEvents = "none";
      g.innerHTML = `<clipPath id="pmclipfijo"><path d="${d}"/></clipPath><image href="${foto(n)}" x="${bb.x}" y="${bb.y}" width="${bb.width}" height="${bb.height}" preserveAspectRatio="xMidYMid slice" clip-path="url(#pmclipfijo)"/><path class="borde" d="${d}"/>`;
      base.insertBefore(g, dot);
      const [lx, ly] = M.lab[n] || [bb.x + bb.width / 2, bb.y + bb.height / 2];
      const left = (lx - vb[0]) / vb[2] * 100 + "%", top = (ly - vb[1]) / vb[3] * 100 + "%";
      const sh = document.createElement("div"); sh.className = "pinsombra"; sh.style.left = left; sh.style.top = top;
      const pin = document.createElement("div"); pin.className = "pin"; pin.innerHTML = PIN; pin.style.left = left; pin.style.top = top;
      plano.append(sh, pin);
    }

    /* ---- zoom ---- */
    zoom.innerHTML = `<defs><clipPath id="pmclipzoom"><path class="clipzd"/></clipPath></defs>
      <g class="zmain">${Object.entries(M.main).filter(([n]) => POR_NOMBRE[n]).map(([n, d]) => `<path class="zp" data-n="${n}" d="${d}"/>`).join("")}</g>
      <g class="zins" style="display:none">${Object.entries(M.ins).map(([n, d]) => `<path class="zp" data-n="${n}" d="${d}"/>`).join("")}</g>
      <g class="zfoco" style="pointer-events:none"></g>`;
    let zvb = vb.slice(), zModo = "main", zAnim = 0, zT = 0, zActual = null;
    const cuadrar = ([x, y, w, h], pad, cartel = 0) => { const s = Math.max(w, h) * (1 + pad * 2) / (1 - cartel), cx = x + w / 2, cy = y + h / 2 + s * cartel / 2; return [cx - s / 2, cy - s / 2, s, s]; };
    function irA(dest, modo) {
      cancelAnimationFrame(zAnim);
      if (modo !== zModo) {
        zModo = modo; zoom.querySelector(".zmain").style.display = modo === "main" ? "" : "none"; zoom.querySelector(".zins").style.display = modo === "ins" ? "" : "none";
        zvb = dest; zoom.setAttribute("viewBox", dest.join(" ")); return;
      }
      const ini = zvb.slice(), t0 = performance.now();
      const paso = t => { const k = Math.min(1, (t - t0) / 380), e = 1 - Math.pow(1 - k, 3); zvb = ini.map((v, i) => v + (dest[i] - v) * e); zoom.setAttribute("viewBox", zvb.join(" ")); if (k < 1) zAnim = requestAnimationFrame(paso); };
      zAnim = requestAnimationFrame(paso);
    }
    function zoomA(n) {
      clearTimeout(zT); if (zActual === n) return; zActual = n;
      const caba = n === "Ciudad de Buenos Aires", modo = caba ? "ins" : "main";
      const src = zoom.querySelector(`.z${modo} [data-n="${CSS.escape(n)}"]`); if (!src) return;
      const bb = src.getBBox(), d = src.getAttribute("d");
      zoom.querySelector(".clipzd").setAttribute("d", d);
      const lab = caba ? M.labIns : M.lab[n];
      const destino = caba ? cuadrar([0, 0, M.iW, M.iH], 0) : cuadrar([bb.x, bb.y, bb.width, bb.height], .08, .2);
      const pinH = destino[2] * .1;
      zoom.querySelector(".zfoco").innerHTML = `<path class="sombra2" d="${d}" transform="translate(${destino[2] * .006} ${destino[2] * .012})"/>
        <image href="${foto(n)}" x="${bb.x}" y="${bb.y}" width="${bb.width}" height="${bb.height}" preserveAspectRatio="xMidYMid slice" clip-path="url(#pmclipzoom)"/>
        <path class="borde" d="${d}"/>
        ${n === elegida && lab ? `<g transform="translate(${lab[0] - pinH * .35} ${lab[1] - pinH}) scale(${pinH / 40})">${PIN.replace(/^<svg[^>]*>|<\/svg>$/g, "")}</g>` : ""}`;
      zname.innerHTML = `${esc(corto(n))}<small>Tierra ${de(POR_NOMBRE[n][3])}${n === elegida ? " · 📍 elegida" : ""}</small>`;
      irA(destino, modo);
    }
    const zoomPronto = n => { clearTimeout(zT); zT = setTimeout(() => zoomA(n), 90); };
    function zoomVista(modo) {
      clearTimeout(zT); zActual = null; zoom.querySelector(".zfoco").innerHTML = "";
      if (modo === "ins") { irA(cuadrar([0, 0, M.iW, M.iH], 0), "ins"); zname.innerHTML = `CABA y alrededores<small>Tocá la Ciudad o la provincia</small>`; }
      else { irA(cuadrar(vb, 0), "main"); zname.innerHTML = `Argentina<small>Pasá el mouse por el mapa</small>`; }
    }
    zoom.addEventListener("click", e => { const p = e.target.closest(".zp"); if (p) elegir(p.dataset.n); });
    $("[data-zcaba]").onclick = () => zoomVista("ins");
    $("[data-zpais]").onclick = () => zoomVista("main");

    let resolver;
    const tecla = e => { if (e.key === "Escape" && !primera) cerrar(null); };
    const cerrar = v => { document.removeEventListener("keydown", tecla); document.documentElement.style.overflow = ""; root.remove(); resolver(v); };
    function elegir(n) {
      elegida = n; ultimoToque = null; fijar(n); zActual = null; zoomA(n);
      base.querySelectorAll(".prov").forEach(p => p.classList.toggle("sel", p.dataset.n === n));
      sel.value = n;
      $(".elegido").innerHTML = `<img src="${foto(n)}" alt=""><span class="txt">Elegiste <b>${esc(corto(n))}</b>, tierra ${de(POR_NOMBRE[n][3])}.</span><button class="pm-ok" type="button">Ver precios de ${esc(corto(n))} →</button>`;
      $(".pm-ok").onclick = () => cerrar(POR_NOMBRE[n][0]);
    }
    const x = $("[data-pmx]"); if (x) x.onclick = () => cerrar(null);
    document.addEventListener("keydown", tecla);
    if (!primera) $(".elegido .txt").textContent = "👆 Tocá la provincia nueva en el mapa.";
    const ini = actual && POR_COD[actual] ? POR_COD[actual][1] : null;
    if (ini) elegir(ini); else zoomVista("ins");
    return new Promise(r => { resolver = r; });
  };
})();
