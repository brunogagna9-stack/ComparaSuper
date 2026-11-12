/* ComparáSúper: lee el archivo de productos. Lo usan la página y el proceso de fondo (buscador.js).
   Entiende los dos formatos: el de siempre ({products: [...]}) y el "por columnas" (v2), que arma
   scripts/build_data.py: pesa menos y se lee más rápido. */
(function (g) {
  const K = ["p", "po", "pon", "pmax", "bulto", "promo", "chg", "anom", "low"];
  g.decodificar = function (d, fuera) {
    let L;
    if (d.products) L = d.products;
    else {
      const P = d.P, n = P.id.length;
      L = new Array(n);
      for (let i = 0; i < n; i++) {
        const offers = d.O[i].map(a => {
          const o = { s: d.sids[a[0]] };
          for (let j = 1; j < a.length; j++) {
            const v = a[j]; if (v == null) continue;
            const k = K[j - 1];
            o[k] = k === "promo" ? { txt: v[0], pu: v[1], n: v[2] } : k === "chg" ? { prev: v[0], pct: v[1] } : v;
          }
          return o;
        });
        const x = { id: P.id[i], name: P.name[i], brand: P.brand[i], cat: P.cat[i] >= 0 ? d.cats_i[P.cat[i]] : "", bq: P.bq[i], bu: P.bu[i] >= 0 ? d.bus[P.bu[i]] : null, offers };
        if (P.img[i]) x.img = P.img[i];
        L[i] = x;
      }
    }
    if (fuera && fuera.length) { const F = new Set(fuera); L = L.filter(x => (x.offers = x.offers.filter(o => !F.has(o.s))).length); }
    for (const x of L) {
      if (x.img && !/^https?:/.test(x.img) && d.imghosts) { const [h, id, f] = x.img.split("/"); x.img = `https://${d.imghosts[+h]}/arquivos/ids/${id}-300-300/${f}`; }
      for (const o of x.offers) if (o.pon && o.po) o.promoo = { txt: `${Math.round((1 - o.pon / o.po) * 100)}% menos comprando online`, pu: o.pon, n: 1 };
    }
    return L;
  };
})(self);
