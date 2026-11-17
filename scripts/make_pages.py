"""Genera una página chiquita por producto (site/p/<código>.html) con la vista previa para WhatsApp, Facebook y Google
(título, precio, foto), más sitemap.xml y robots.txt. Cada página es una página real (no una redirección): muestra los
precios por comercio y lleva "datos estructurados" (schema.org Product + AggregateOffer) para que Google pueda mostrar
"desde $X" en los resultados. Un botón lleva a la ficha completa dentro de la web.

Se corre al publicar (workflow "Publicar la web"); los archivos no se guardan en el repositorio.
"""
import html
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SITE = ROOT / "site"
MIN_COMERCIOS = 6   # solo los productos que están en muchos comercios (los más buscados), para que la publicación no sea pesada
OG_N = 1000         # los más comparados tienen además una imagen propia para compartir (la arma scripts/og.mjs)


def money(v):
    return "$" + f"{round(v):,}".replace(",", ".")


def main():
    cfg = json.loads((SITE / "config.json").read_text(encoding="utf-8"))
    url = (cfg.get("sitio_url") or "").rstrip("/") + "/"
    d = json.loads((SITE / "data" / "products.json").read_text(encoding="utf-8"))
    stores = {s["id"]: s["name"] for s in d["stores"]}
    # cadenas que no informan precios de sucursal hace más de 3 días: esos precios no cuentan para "desde $X"
    import datetime as _dt
    hoy = _dt.date.fromisoformat(d["updated"]) if d.get("updated") else None
    viejas = {s["id"] for s in d["stores"] if hoy and s.get("fecha") and (hoy - _dt.date.fromisoformat(s["fecha"])).days > 3}
    fecha = "/".join(reversed((d.get("updated") or "").split("-")))
    hosts = d.get("imghosts") or []
    out = SITE / "p"
    out.mkdir(exist_ok=True)
    urls = [url]
    n = 0
    from build_data import descolumnar   # products.json puede venir "por columnas" (ver build_data.py)
    todos = [p for p in descolumnar(d) if len(p["offers"]) >= MIN_COMERCIOS]
    con_og = {p["id"] for p in sorted(todos, key=lambda p: -len(p["offers"]))[:OG_N]}
    og = []
    for p in todos:
        sanas = [o for o in p["offers"] if not o.get("anom")] or p["offers"]   # sin precios mal cargados
        vigente = lambda o: (None if o["s"] in viejas else o.get("p"), o.get("po"))
        precios = sorted((min(x for x in vigente(o) if x), o["s"]) for o in sanas if any(vigente(o)) and (o.get("bulto") or 1) <= 1)
        if not precios:
            continue
        v, s = precios[0]
        img = p.get("img") or ""
        if img and not img.startswith("http") and hosts:
            h, iid, f = img.split("/", 2)
            img = f"https://{hosts[int(h)]}/arquivos/ids/{iid}-300-300/{f}"
        t = html.escape(f"{p['name']}: desde {money(v)} en {stores.get(s, s)}")
        desc = html.escape(f"Compará el precio en {len(p['offers'])} supermercados de CABA y GBA, con ofertas y descuentos por banco y billetera. SuperBarato.")
        dest = f"../#p-{p['id']}"
        if p["id"] in con_og:
            og.append({"id": p["id"], "name": p["name"], "precio": money(v), "store": stores.get(s, s), "n": len(p["offers"]), "img": img})
            img = f"{url}og/{p['id']}.jpg"
        foto = p.get("img") or ""
        if foto and not foto.startswith("http") and hosts:
            h, iid, f = foto.split("/", 2)
            foto = f"https://{hosts[int(h)]}/arquivos/ids/{iid}-300-300/{f}"
        n_name = html.escape(p["name"])
        filas = "".join(f'<tr><td>{html.escape(stores.get(st, st))}</td><td class="pr">{money(pv)}</td></tr>' for pv, st in precios[:12])
        ld = {"@context": "https://schema.org", "@type": "Product", "name": p["name"], "url": f"{url}p/{p['id']}.html",
              "offers": {"@type": "AggregateOffer", "priceCurrency": "ARS", "lowPrice": round(precios[0][0], 2), "highPrice": round(precios[-1][0], 2),
                         "offerCount": len(precios), "availability": "https://schema.org/InStock"}}
        if foto:
            ld["image"] = foto
        if p["id"].isdigit() and len(p["id"]) in (8, 12, 13, 14):
            ld["gtin" + str(len(p["id"]))] = p["id"]
        ldj = json.dumps(ld, ensure_ascii=False).replace("</", "<\\/")
        page = f"""<!DOCTYPE html><html lang="es-AR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>{t} · SuperBarato</title><meta name="description" content="{desc}">
<link rel="canonical" href="{url}p/{p['id']}.html"><link rel="icon" href="../img/icon-192.png">
<meta property="og:type" content="product"><meta property="og:site_name" content="SuperBarato"><meta property="og:title" content="{t}">
<meta property="og:description" content="{desc}"><meta property="og:url" content="{url}p/{p['id']}.html">{f'<meta property="og:image" content="{html.escape(img)}">' if img else ""}
<meta name="twitter:card" content="{'summary_large_image' if p['id'] in con_og else 'summary'}">{'<meta property="og:image:width" content="800"><meta property="og:image:height" content="420">' if p['id'] in con_og else ""}
<script type="application/ld+json">{ldj}</script>
<style>body{{margin:0;font-family:system-ui,-apple-system,Segoe UI,Roboto,Arial,sans-serif;background:#f4f7f5;color:#14231c}}
header{{background:#0e7a55;color:#fff;padding:14px 18px}}header a{{color:#fff;text-decoration:none;font-weight:800;font-size:22px}}header span{{color:#ffc72c}}
main{{max-width:640px;margin:0 auto;padding:18px}}.card{{background:#fff;border:1px solid #dfe8e3;border-radius:14px;padding:18px}}
h1{{font-size:21px;margin:0 0 10px}}img{{display:block;width:160px;height:160px;object-fit:contain;margin:0 auto 10px}}
.desde{{font-size:15px;margin:0 0 12px}}.desde b{{font-size:24px;color:#0e7a55}}table{{width:100%;border-collapse:collapse;font-size:15px}}
td{{padding:8px 4px;border-top:1px solid #e5ece8}}td.pr{{text-align:right;font-weight:700}}
.btn{{display:block;text-align:center;background:#ffc72c;color:#14231c;font-weight:800;text-decoration:none;border-radius:999px;padding:14px;margin:16px 0 6px}}
.sub{{font-size:12px;color:#4b5a53;line-height:1.5}}</style></head>
<body><header><a href="../">🛒 Super<span>Barato</span></a></header>
<main><div class="card">{f'<img src="{html.escape(foto)}" alt="" width="160" height="160">' if foto else ""}<h1>{n_name}</h1>
<p class="desde">Desde <b>{money(v)}</b> en {html.escape(stores.get(s, s))}</p>
<table><tbody>{filas}</tbody></table>
<a class="btn" href="{dest}">Ver ofertas, descuentos y dónde conviene »</a>
<p class="sub">Precio más bajo por comercio entre sucursales y tiendas online de CABA y GBA, sin descuentos de medios de pago. Precios de sucursales: base oficial SEPA (Precios Claros), del {html.escape(fecha)}. Pueden cambiar: confirmalos en el comercio.</p>
</div></main></body></html>"""
        (out / f"{p['id']}.html").write_text(page, encoding="utf-8")
        urls.append(f"{url}p/{p['id']}.html")
        n += 1
    (SITE / "sitemap.xml").write_text('<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n'
                                      + "".join(f"<url><loc>{html.escape(u)}</loc></url>\n" for u in urls) + "</urlset>\n", encoding="utf-8")
    (SITE / "robots.txt").write_text(f"User-agent: *\nAllow: /\nSitemap: {url}sitemap.xml\n", encoding="utf-8")
    (SITE / "og").mkdir(exist_ok=True)
    (SITE / "og" / "lista.json").write_text(json.dumps(og, ensure_ascii=False), encoding="utf-8")
    print(f"Páginas de productos para compartir: {n} (con imagen propia: {len(og)})")


if __name__ == "__main__":
    main()
