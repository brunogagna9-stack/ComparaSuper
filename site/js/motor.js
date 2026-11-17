/* SuperBarato: motor de relevancia del buscador (lo usan el proceso de fondo y, si hace falta, la página).
   Reglas, de más a menos importante:
   1. La palabra buscada tiene que estar ENTERA en el nombre o la marca ("mani" encuentra "Maní", no "Mini" ni "Manicura").
      Se ignoran acentos, mayúsculas, plural/singular ("panes" = "pan") y cómo suena ("yerva" = "yerba").
   2. Diminutivos y sinónimos comerciales cuentan, con un poco menos de peso ("toallitas" = "toallas", "birra" = "cerveza").
   3. Comienzo de palabra solo para lo que todavía estás escribiendo ("lec" → leche); nunca para una palabra ya completa.
   4. El nombre pesa más que la marca, y la marca más que la categoría; arriba va lo que empieza con lo buscado.
   5. Si no hay nada así, se prueba corregir errores de tipeo, pero solo en palabras de 5 letras o más
      (en una de 4, una letra cambia el producto: mani/mini/mano). Eso se muestra aparte, como "quizás quisiste decir". */
(function (G) {
  const nrm = s => (s || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
  const partir = s => nrm(s).split(/[^a-z0-9ñ]+/).filter(Boolean);
  // cómo suena en español: v/b, z/s, c/k/qu, ll/y, h muda, letras repetidas
  const fon = w => nrm(w).replace(/[^a-z0-9ñ]/g, "").replace(/ñ/g, "n").replace(/ch/g, "§").replace(/h/g, "").replace(/§/g, "ch").replace(/v/g, "b").replace(/w/g, "u")
    .replace(/z/g, "s").replace(/c([ei])/g, "s$1").replace(/qu/g, "k").replace(/c/g, "k").replace(/ll/g, "y").replace(/g([ei])/g, "j$1").replace(/x/g, "ks").replace(/(.)\1+/g, "$1");
  // forma base: sin plural ("leches" → "lech", "limones" → "limon", "panes" → "pan")
  const base = w => {
    const n = nrm(w); let f = fon(w);
    if (/\d/.test(f)) return n;
    if (f.length > 3 && n.endsWith("s")) f = f.slice(0, -1);   // solo si de verdad termina en s ("arroz" no es plural de "aro")
    if (f.length > 3 && /[lrnds]e$/.test(f) && /es?$/.test(n)) f = f.slice(0, -1);
    return f;
  };
  const dimin = b => (b.length >= 7 && /(s?it)[ao]$/.test(b) ? b.replace(/s?it([ao])$/, "$1") : "");   // toallita → toalla, galletita → galleta
  const SIN = { cacahuete: "mani", cacahuetes: "mani", cacahuate: "mani", birra: "cerveza", yogur: "yogurt", yoghurt: "yogurt", refresco: "gaseosa", lejia: "lavandina", frijol: "poroto", frijoles: "poroto", mantequilla: "manteca", aguacate: "palta", elote: "choclo", melocoton: "durazno", fresa: "frutilla", fresas: "frutilla", pina: "anana" };
  const VACIAS = new Set("de del la el los las y en a al para por x un una con".split(" "));

  let IDX = null;   // forma base → [[id, campo(0 nombre, 1 marca, 2 categoría), posición en el nombre]]
  let CLAVES = [], VOC = new Map(), POP = new Map(), NOM = new Map(), N = 0;
  function poner(k, v) { let a = IDX.get(k); if (!a) IDX.set(k, a = []); a.push(v); }
  function indexar(L) {
    IDX = new Map(); VOC = new Map(); POP = new Map(); NOM = new Map(); N = L.length;
    for (const p of L) {
      POP.set(p.id, (p.offers || []).length); NOM.set(p.id, `${p.name} ${p.brand || ""}`);
      const vistos = new Set();
      [[partir(p.name), 0], [partir(p.brand), 1], [p.cat ? [p.cat] : [], 2]].forEach(([ts, campo]) => ts.forEach((t, i) => {
        const b = base(t); if (!b) return;
        const k = b + "|" + campo; if (vistos.has(k)) return; vistos.add(k);
        poner(b, [p.id, campo, i]);
        const d = dimin(b); if (d) poner("~" + d, [p.id, campo, i]);
        if (campo < 2 && t.length > 2 && !/\d/.test(t)) VOC.set(t, (VOC.get(t) || 0) + 1);
      }));
      // abreviaturas de los tickets y la base oficial ("Crem.", "Choc.", "Lech."): "crema" las encuentra
      for (const [, a] of nrm(p.name).matchAll(/([a-zñ]{5,})\./g)) { const k = "^" + fon(a); if (!vistos.has(k)) { vistos.add(k); poner(k, [p.id, 0, 9]); } }
    }
    CLAVES = [...IDX.keys()].filter(k => k[0] !== "~" && k[0] !== "^").sort();
  }
  function conPrefijo(b) {   // claves que empiezan con b (búsqueda binaria en la lista ordenada)
    let lo = 0, hi = CLAVES.length;
    while (lo < hi) { const m = (lo + hi) >> 1; if (CLAVES[m] < b) lo = m + 1; else hi = m; }
    const r = []; for (let i = lo; i < CLAVES.length && CLAVES[i].startsWith(b); i++) r.push(CLAVES[i]);
    return r;
  }
  const PESO = [1, 0.7, 0.45];   // nombre, marca, categoría

  /* coincidencias de una palabra: Map id → puntaje (el mejor de sus apariciones) */
  function coincidencias(w, escribiendo) {
    const m = new Map(), b = base(w);
    if (b.length < 2 && w.length > 2) return m;   // "zzzzz" → "s": no es una palabra
    const sumar = (k, nivel) => { for (const [id, campo, pos] of IDX.get(k) || []) { const s = nivel * PESO[campo] + (campo === 0 && pos === 0 ? 0.6 : campo === 0 && pos === 1 ? 0.3 : 0); if (s > (m.get(id) || 0)) m.set(id, s); } };
    sumar(b, 3);
    const sin = SIN[nrm(w)]; if (sin && base(sin) !== b) sumar(base(sin), 2.6);
    const d = dimin(b); sumar("~" + (d || b), 2.6); if (d) sumar(d, 2.6);
    const f = fon(w); for (let i = 5; i < f.length; i++) sumar("^" + f.slice(0, i), 2.4);   // abreviado en el nombre
    // comienzo de palabra: solo para la palabra que estás escribiendo ("lech" → leche), o si la palabra no existe entera.
    // Si ya es una palabra completa y común ("mani"), no se completa: así no aparecen "manicura" ni "manises".
    if (!/\d/.test(w) && b.length >= 2 && (escribiendo || (!m.size && b.length >= 4))) {
      const ks = conPrefijo(b).filter(k => k !== b);
      let otros = 0; for (const k of ks) otros += IDX.get(k).length;
      const completa = m.size >= 3 && (!escribiendo || (b.length >= 4 && m.size >= otros / 4));
      if (!completa) for (const k of ks) sumar(k, 3 * b.length / k.length);
    }
    return m;
  }

  function lev(a, b, max) {
    if (Math.abs(a.length - b.length) > max) return max + 1;
    let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
    for (let i = 1; i <= a.length; i++) {
      const cur = [i]; let mn = i;
      for (let j = 1; j <= b.length; j++) { cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1)); mn = Math.min(mn, cur[j]); }
      if (mn > max) return max + 1;
      prev = cur;
    }
    return prev[b.length];
  }
  /* error de tipeo: solo palabras de 5 letras o más, misma primera letra, y la más común entre las parecidas */
  function corregir(w) {
    if (w.length < 5 || /\d/.test(w) || IDX.has(base(w))) return w;
    const max = w.length >= 8 ? 2 : 1; let best = null;
    for (const [x, n] of VOC) { if (x[0] !== w[0]) continue; const d = lev(w, x, max); if (d <= max && (!best || d < best.d || (d === best.d && n > best.n))) best = { x, d, n }; }
    return best ? best.x : w;
  }

  /* palabras → productos que tienen TODAS, ordenados por relevancia */
  function estricta(words, escribiendo) {
    const reales = words.filter(w => !VACIAS.has(w));
    const ws = reales.length ? reales : words;
    const num = ws.filter(w => /\d/.test(w)), txt = ws.filter(w => !/\d/.test(w));
    if (!txt.length && !num.length) return [];
    let tot = null;
    (txt.length ? txt : num).forEach((w, i, a) => {
      const m = coincidencias(w, escribiendo && i === a.length - 1);
      if (!tot) { tot = m; return; }
      const t2 = new Map(); for (const [id, s] of tot) { const s2 = m.get(id); if (s2) t2.set(id, s + s2); } tot = t2;
    });
    if (txt.length) for (const w of num) { const m = coincidencias(w, false); for (const [id, s] of tot) if (m.has(id)) tot.set(id, s + m.get(id)); }   // "7up", "x2": suman si están, no filtran
    return [...tot].map(([id, s]) => [id, s + Math.min(POP.get(id) || 0, 20) * 0.01]).sort((a, b) => b[1] - a[1]);
  }

  /* busca: {ids, fix} — fix: la búsqueda corregida, si hubo que corregir para encontrar algo */
  function buscar(words, escribiendo) {
    if (!IDX) return { ids: [], fix: "" };
    let r = estricta(words, escribiendo), fix = "";
    if (!r.length) {
      const fixed = words.map(corregir);
      if (fixed.join(" ") !== words.join(" ")) { const r2 = estricta(fixed, false); if (r2.length) { r = r2; fix = fixed.join(" "); } }
    }
    return { ids: r.map(x => x[0]), fix };
  }
  /* palabras que completan la que estás escribiendo, de las que más productos tienen */
  const completar = last => [...VOC].filter(([w]) => w.startsWith(last) && w !== last).sort((a, b) => b[1] - a[1]).slice(0, 4).map(([w]) => w);
  /* ¿la palabra aparece de verdad en el nombre o la marca del producto? */
  const aparece = (id, w) => { const b = base(w); return partir(NOM.get(id) || "").some(t => base(t) === b || base(t).startsWith(b)); };

  G.Motor = { indexar, buscar, completar, aparece, nrm, partir, fon, listo: () => !!IDX, total: () => N };
})(typeof self !== "undefined" ? self : this);
