/* SuperBarato — cuentas de usuario (Firebase Authentication) y preferencias (Firestore).
   - Se puede entrar con Google o con correo y contraseña (con verificación del correo).
   - Cada usuario elige qué recibir: ofertas de la semana y/o avisos cuando baja un producto que marcó.
   - Los productos marcados (🔔) se guardan en la cuenta: usuarios/{uid}.avisos = { "<zona>_<código>": { v: precio, n: nombre } }.
   - La librería de Firebase (js/vendor/firebase-auth.js) se carga recién cuando hace falta, para no hacer más lenta la página.
   - La base de datos se usa por su API web (REST) con el token del usuario; las reglas de Firestore solo dejan
     que cada persona lea y cambie su propio documento. Los correos los manda scripts/enviar_avisos.py. */
const Cuenta = (() => {
  let FB = null, auth = null, user = null, doc = null, cargando = null;
  const oyentes = [];
  const cfg = () => (CFG && CFG.firebase) || null;
  const docUrl = uid => `https://firestore.googleapis.com/v1/projects/${cfg().projectId}/databases/(default)/documents/usuarios/${uid}`;

  /* ---- Firestore: valores con tipo <-> valores comunes ---- */
  const aFs = v => v === null || v === undefined ? { nullValue: null }
    : typeof v === "boolean" ? { booleanValue: v }
    : typeof v === "number" ? (Number.isInteger(v) ? { integerValue: String(v) } : { doubleValue: v })
    : typeof v === "string" ? { stringValue: v }
    : v instanceof Date ? { timestampValue: v.toISOString() }
    : { mapValue: { fields: Object.fromEntries(Object.entries(v).map(([k, x]) => [k, aFs(x)])) } };
  const deFs = f => "nullValue" in f ? null : "booleanValue" in f ? f.booleanValue : "integerValue" in f ? +f.integerValue
    : "doubleValue" in f ? f.doubleValue : "stringValue" in f ? f.stringValue : "timestampValue" in f ? f.timestampValue
    : "mapValue" in f ? Object.fromEntries(Object.entries(f.mapValue.fields || {}).map(([k, x]) => [k, deFs(x)])) : null;

  async function api(metodo, campos) {
    const token = await user.getIdToken();
    let url = docUrl(user.uid);
    const op = { method: metodo, headers: { Authorization: "Bearer " + token } };
    if (campos) {
      url += "?" + Object.keys(campos).map(k => "updateMask.fieldPaths=" + encodeURIComponent(k)).join("&");
      op.headers["Content-Type"] = "application/json";
      op.body = JSON.stringify({ fields: Object.fromEntries(Object.entries(campos).map(([k, v]) => [k, aFs(v)])) });
    }
    const r = await fetch(url, op);
    if (metodo === "GET" && r.status === 404) return null;
    if (!r.ok) throw new Error("base " + r.status);
    return metodo === "DELETE" ? null : r.json();
  }
  async function guardar(campos) {
    if (!user) throw new Error("sin sesión");
    campos.actualizado = new Date();
    const r = await api("PATCH", campos);
    doc = deFs({ mapValue: r });
    avisar();
  }

  /* ---- librería de Firebase (se carga una sola vez) ---- */
  function cargar() {
    if (cargando) return cargando;
    if (!cfg()) return Promise.reject(new Error("sin configuración"));
    cargando = new Promise((ok, mal) => {
      const s = document.createElement("script");
      s.src = "js/vendor/firebase-auth.js"; s.async = true;
      s.onload = () => {
        FB = self.FBAuth;
        const app = FB.initializeApp(cfg());
        auth = FB.initializeAuth(app, { persistence: [FB.indexedDBLocalPersistence, FB.browserLocalPersistence], popupRedirectResolver: FB.browserPopupRedirectResolver });
        auth.languageCode = "es";
        let primera = true;
        FB.onAuthStateChanged(auth, async u => {
          user = u; doc = null;
          LS.set("cs_sesion", !!u);
          if (u) { let d; try { d = deFs({ mapValue: (await api("GET")) || { fields: {} } }); } catch { d = {}; } if (doc === null && user === u) doc = d; await migrar(); }
          avisar();
          if (primera) { primera = false; ok(); }
        });
      };
      s.onerror = () => { cargando = null; mal(new Error("no cargó")); };
      document.head.appendChild(s);
    });
    return cargando;
  }
  function avisar() { for (const f of oyentes) try { f(user, doc); } catch (e) { console.error(e); } }

  /* los avisos que alguien marcó antes de tener cuenta (en este navegador) pasan a su cuenta */
  async function migrar() {
    const viejos = [];
    for (let i = 0; i < localStorage.length; i++) { const k = localStorage.key(i); if (/^cs_avisos(_AR-.)?$/.test(k)) viejos.push(k); }
    if (!viejos.length || !doc) return;
    const av = { ...(doc.avisos || {}) };
    for (const k of viejos) {
      const zona = k === "cs_avisos" ? "amba" : k.slice(-1).toLowerCase();
      for (const [id, v] of Object.entries(LS.get(k, {}))) if (typeof v === "number" && Object.keys(av).length < 300) av[`${zona}_${id}`] = av[`${zona}_${id}`] || { v: Math.round(v), n: "" };
    }
    try { await guardar({ avisos: av }); for (const k of viejos) localStorage.removeItem(k); } catch { /* se reintenta la próxima vez */ }
  }

  const zona = () => (enAMBA() ? "amba" : PCARP());
  const ERR = {
    "auth/invalid-email": "Revisá el correo: parece incompleto.",
    "auth/missing-password": "Escribí tu contraseña.",
    "auth/weak-password": "La contraseña tiene que tener al menos 8 caracteres.",
    "auth/email-already-in-use": "Ya hay una cuenta con ese correo. Probá con «Ingresar» o con «Olvidé mi contraseña».",
    "auth/invalid-credential": "El correo o la contraseña no coinciden.",
    "auth/wrong-password": "El correo o la contraseña no coinciden.",
    "auth/user-not-found": "No encontramos una cuenta con ese correo.",
    "auth/too-many-requests": "Hubo muchos intentos seguidos. Esperá unos minutos y probá de nuevo.",
    "auth/popup-closed-by-user": "Cerraste la ventana de Google antes de terminar.",
    "auth/cancelled-popup-request": "Cerraste la ventana de Google antes de terminar.",
    "auth/network-request-failed": "No hay conexión. Revisá internet y probá de nuevo.",
    "auth/requires-recent-login": "Por seguridad, volvé a ingresar y repetí la acción.",
    "auth/unauthorized-domain": "Este sitio todavía no está autorizado para iniciar sesión.",
  };
  const msj = e => ERR[e && e.code] || "No se pudo completar. Probá de nuevo en un momento.";
  const volver = () => location.origin + location.pathname + "#cuenta";

  /* ---- ventana para ingresar o crear la cuenta ---- */
  function abrir(op = {}) {
    if (!cfg()) { toast("Las cuentas todavía no están activadas"); return Promise.resolve(null); }
    cargar().catch(() => {});
    return new Promise(listo => {
      let modo = op.modo || "ingresar";
      const pinta = () => {
        const crear = modo === "crear";
        openModal(`<h2>${crear ? "Crear tu cuenta" : "Ingresar a tu cuenta"}</h2>
          ${op.motivo ? `<p class="sub">${esc(op.motivo)}</p>` : `<p class="sub">Con tu cuenta elegís qué correos recibir y guardás los productos que querés seguir.</p>`}
          <button class="btn gbtn" type="button" id="cgoogle"><img src="img/google.svg" width="18" height="18" alt=""> Continuar con Google</button>
          <div class="orsep"><span>o con tu correo</span></div>
          <form id="cform" class="nform" novalidate>
            <label class="fl">Correo electrónico<input type="email" id="cmail" required autocomplete="email" placeholder="tu@correo.com"></label>
            <label class="fl">Contraseña<input type="password" id="cpass" required minlength="8" autocomplete="${crear ? "new-password" : "current-password"}" placeholder="${crear ? "Al menos 8 caracteres" : ""}"></label>
            ${crear ? `<fieldset><legend>Quiero recibir por correo <span class="sub">(opcional, lo podés cambiar cuando quieras)</span></legend>
              <label class="ck"><input type="checkbox" id="csem" ${op.semanal ? "checked" : ""}> Las ofertas de la semana (los lunes)</label>
              <label class="ck"><input type="checkbox" id="cbaj" ${op.bajas ? "checked" : ""}> Un aviso cuando baja un producto que marqué con la 🔔</label></fieldset>` : ""}
            <label class="ck"><input type="checkbox" id="cok"> Acepto los <a href="#legal" data-close>términos de uso</a> y la <a href="#legal-privacidad" data-close>política de privacidad</a>.</label>
            <div class="ferr" id="cerr" role="alert"></div>
            <div class="mfoot">${crear ? `<button type="button" class="linkbtn" id="cmodo">Ya tengo cuenta</button>` : `<button type="button" class="linkbtn" id="colv">Olvidé mi contraseña</button>`}
              <button class="btn" type="submit">${crear ? "Crear cuenta" : "Ingresar"}</button></div>
            ${crear ? "" : `<p class="sub" style="text-align:center;margin-top:10px">¿No tenés cuenta? <button type="button" class="linkbtn" id="cmodo">Crear una</button></p>`}
          </form>`);
        const err = $("#cerr"), acepto = () => { if ($("#cok").checked) return true; err.textContent = "Para seguir tenés que aceptar los términos y la política de privacidad."; return false; };
        const prefs = () => (crear ? { semanal: $("#csem").checked, bajas: $("#cbaj").checked } : null);
        const fin = async (u, nueva) => {
          if (nueva || !doc || doc.acepto == null) { const p = prefs() || {}; await guardar({ email: u.email || "", semanal: !!p.semanal || !!(doc && doc.semanal), bajas: !!p.bajas || !!(doc && doc.bajas), zona: zona(), acepto: new Date(), avisos: (doc && doc.avisos) || {} }).catch(() => {}); }
          closeModal(); listo(u);
          toast(nueva && !u.emailVerified ? "Cuenta creada. Te mandamos un correo para confirmarla." : "¡Listo! Ya ingresaste");
        };
        $("#cmodo").onclick = () => { modo = crear ? "ingresar" : "crear"; pinta(); };
        if ($("#colv")) $("#colv").onclick = async () => {
          const m = $("#cmail").value.trim(); if (!m) { err.textContent = "Escribí tu correo y tocá de nuevo «Olvidé mi contraseña»."; $("#cmail").focus(); return; }
          try { await cargar(); await FB.sendPasswordResetEmail(auth, m, { url: volver() }); err.textContent = ""; toast("Si hay una cuenta con ese correo, te mandamos un enlace para cambiar la contraseña", 5000); } catch (e) { err.textContent = msj(e); }
        };
        $("#cgoogle").onclick = async () => {
          if (!acepto()) return;
          try { await cargar(); const r = await FB.signInWithPopup(auth, new FB.GoogleAuthProvider()); user = r.user; await esperarDoc(); await fin(r.user, !doc || doc.acepto == null); }
          catch (e) { if (e && e.code === "auth/popup-blocked") { LS.set("cs_login_pend", prefs() || {}); await FB.signInWithRedirect(auth, new FB.GoogleAuthProvider()); return; } err.textContent = msj(e); }
        };
        $("#cform").onsubmit = async e => {
          e.preventDefault();
          const m = $("#cmail").value.trim(), p = $("#cpass").value;
          if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(m)) { err.textContent = ERR["auth/invalid-email"]; $("#cmail").focus(); return; }
          if (crear && p.length < 8) { err.textContent = ERR["auth/weak-password"]; $("#cpass").focus(); return; }
          if (!acepto()) return;
          const b = $("#cform button[type=submit]"); b.disabled = true;
          try {
            await cargar();
            if (crear) { const r = await FB.createUserWithEmailAndPassword(auth, m, p); user = r.user; FB.sendEmailVerification(r.user, { url: volver() }).catch(() => {}); doc = doc || {}; await fin(r.user, true); }
            else { const r = await FB.signInWithEmailAndPassword(auth, m, p); user = r.user; await esperarDoc(); await fin(r.user, false); }
          } catch (x) { err.textContent = msj(x); b.disabled = false; }
        };
      };
      pinta();
    });
  }
  /* después de ingresar, onAuthStateChanged trae el documento: esperamos a que llegue */
  function esperarDoc() { return new Promise(ok => { if (doc) return ok(); const t = setTimeout(ok, 4000); const f = () => { if (doc) { clearTimeout(t); oyentes.splice(oyentes.indexOf(f), 1); ok(); } }; oyentes.push(f); }); }

  /* ---- productos marcados con la 🔔 ---- */
  const avisos = () => { const z = zona() + "_", out = {}; for (const [k, x] of Object.entries((doc && doc.avisos) || {})) if (k.startsWith(z)) out[k.slice(z.length)] = x.v; return out; };
  async function marcar(id, precio, nombre) {
    if (!user) { const u = await abrir({ motivo: "Para avisarte cuando baje este producto, ingresá o creá tu cuenta (es gratis).", modo: "crear", bajas: true }); if (!u) return false; }
    const av = { ...((doc && doc.avisos) || {}) };
    if (Object.keys(av).length >= 300) { toast("Llegaste al máximo de 300 productos marcados"); return false; }
    av[`${zona()}_${id}`] = { v: Math.round(precio), n: String(nombre || "").slice(0, 120) };
    await guardar({ avisos: av });
    return true;
  }
  async function desmarcar(id) { const av = { ...((doc && doc.avisos) || {}) }; delete av[`${zona()}_${id}`]; await guardar({ avisos: av }); }

  async function salir() { await cargar(); await FB.signOut(auth); toast("Cerraste la sesión"); }
  async function borrar() {
    await cargar();
    try { await api("DELETE"); await FB.deleteUser(user); }
    catch (e) {
      if (e && e.code === "auth/requires-recent-login") {
        const g = user.providerData.some(p => p.providerId === "google.com");
        if (g) { await FB.reauthenticateWithPopup(user, new FB.GoogleAuthProvider()); }
        else { const p = prompt("Por seguridad, escribí tu contraseña para borrar la cuenta:"); if (!p) return false; await FB.reauthenticateWithCredential(user, FB.EmailAuthProvider.credential(user.email, p)); }
        await api("DELETE").catch(() => {}); await FB.deleteUser(user);
      } else throw e;
    }
    toast("Borramos tu cuenta y tus datos"); return true;
  }
  async function reenviar() { await FB.sendEmailVerification(user, { url: volver() }); toast("Te mandamos otro correo para confirmar tu cuenta", 4000); }
  async function recargar() { await user.reload(); user = auth.currentUser; avisar(); }

  /* si ya había una sesión abierta en este navegador, la retomamos sin que la persona haga nada */
  function iniciar() {
    if (!cfg()) return;
    if (LS.get("cs_sesion", false) || /#cuenta/.test(location.hash)) cargar().then(async () => {
      const pend = LS.get("cs_login_pend", null);   // volvió de iniciar sesión con Google por redirección
      if (pend && user) { localStorage.removeItem("cs_login_pend"); if (!doc || doc.acepto == null) await guardar({ email: user.email || "", semanal: !!pend.semanal, bajas: !!pend.bajas, zona: zona(), acepto: new Date(), avisos: (doc && doc.avisos) || {} }).catch(() => {}); }
    }).catch(() => {});
  }

  return {
    get user() { return user; }, get doc() { return doc; }, activa: () => !!cfg(),
    cambios: f => oyentes.push(f), abrir, cargar, iniciar, guardar, marcar, desmarcar, avisos, salir, borrar, reenviar, recargar, zona,
  };
})();
