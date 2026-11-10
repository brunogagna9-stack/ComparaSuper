"""Genera una página chiquita por producto (site/p/<código>.html) con la vista previa para WhatsApp, Facebook y Google
(título, precio, foto), más sitemap.xml y robots.txt. La persona que abre el link va directo a la ficha del producto.

Se corre al publicar (workflow "Publicar la web"); los archivos no se guardan en el repositorio.
"""
import html
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SITE = ROOT / "site"
MIN_COMERCIOS = 6   # solo los productos que están en muchos comercios (los más buscados), para que la publicación no sea pesada


def money(v):
    return "$" + f"{round(v):,}".replace(",", ".")


def main():
    cfg = json.loads((SITE / "config.json").read_text(encoding="utf-8"))
    url = (cfg.get("sitio_url") or "").rstrip("/") + "/"
    d = json.loads((SITE / "data" / "products.json").read_text(encoding="utf-8"))
    stores = {s["id"]: s["name"] for s in d["stores"]}
    hosts = d.get("imghosts") or []
    out = SITE / "p"
    out.mkdir(exist_ok=True)
    urls = [url]
    n = 0
    for p in d["products"]:
        if len(p["offers"]) < MIN_COMERCIOS:
            continue
        precios = sorted((min(x for x in (o.get("p"), o.get("po")) if x), o["s"]) for o in p["offers"] if o.get("p") or o.get("po"))
        if not precios:
            continue
        v, s = precios[0]
        img = p.get("img") or ""
        if img and not img.startswith("http") and hosts:
            h, iid, f = img.split("/", 2)
            img = f"https://{hosts[int(h)]}/arquivos/ids/{iid}-300-300/{f}"
        t = html.escape(f"{p['name']}: desde {money(v)} en {stores.get(s, s)}")
        desc = html.escape(f"Compará el precio en {len(p['offers'])} supermercados de CABA y GBA, con ofertas y descuentos por banco y billetera. ComparáSúper.")
        dest = f"../#p-{p['id']}"
        page = f"""<!DOCTYPE html><html lang="es-AR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>{t} · ComparáSúper</title><meta name="description" content="{desc}">
<link rel="canonical" href="{url}p/{p['id']}.html">
<meta property="og:type" content="product"><meta property="og:site_name" content="ComparáSúper"><meta property="og:title" content="{t}">
<meta property="og:description" content="{desc}"><meta property="og:url" content="{url}p/{p['id']}.html">{f'<meta property="og:image" content="{html.escape(img)}">' if img else ""}
<meta name="twitter:card" content="summary">
<meta http-equiv="refresh" content="0;url={dest}"><script>location.replace("{dest}")</script></head>
<body><p><a href="{dest}">{t}</a></p></body></html>"""
        (out / f"{p['id']}.html").write_text(page, encoding="utf-8")
        urls.append(f"{url}p/{p['id']}.html")
        n += 1
    (SITE / "sitemap.xml").write_text('<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n'
                                      + "".join(f"<url><loc>{html.escape(u)}</loc></url>\n" for u in urls) + "</urlset>\n", encoding="utf-8")
    (SITE / "robots.txt").write_text(f"User-agent: *\nAllow: /\nSitemap: {url}sitemap.xml\n", encoding="utf-8")
    print(f"Páginas de productos para compartir: {n}")


if __name__ == "__main__":
    main()
