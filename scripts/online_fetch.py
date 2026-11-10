"""Completa la lectura del día con datos de las tiendas online que usan VTEX
(Carrefour, ChangoMás/Más Online, Día, Disco, Jumbo y Vea):

  - precio online (y si la tienda lo muestra rebajado, la rebaja)
  - enlace exacto al producto en la tienda (no a la portada)
  - código del producto en la tienda (sku), para armar el carrito online de un toque
  - foto del producto

Busca por código de barras, de a 50 productos por consulta. Las fotos se guardan en
data/imagenes.json para no volver a buscarlas todos los días.

Uso: python scripts/online_fetch.py   (después de sepa_fetch.py)
"""
import json
import unicodedata
import re
import re, time, urllib.request, urllib.parse
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
UA = {"User-Agent": "Mozilla/5.0 (compatible; ComparaSuper/0.2; comparador independiente de precios)", "Accept": "application/json"}
LOTE = 50            # códigos por consulta
PAUSA = 0.4          # segundos entre consultas a una misma tienda
MAX_ERRORES = 15
# Tiendas que solo se usan para buscar fotos de los productos que todavía no tienen
SOLO_FOTOS = ["www.farmacity.com", "www.toledodigital.com.ar", "www.cordiez.com.ar"]


def ean_key(e):
    return str(e).lstrip("0")


def parse_vtex(products, host):
    """De la respuesta de VTEX arma {ean: datos} con precio, rebaja, enlace, sku y foto."""
    out = {}
    for prod in products or []:
        link = prod.get("link") or (f"https://{host}/{prod['linkText']}/p" if prod.get("linkText") else None)
        for it in prod.get("items", []):
            ean = ean_key(it.get("ean", ""))
            if not ean:
                continue
            img = next((i.get("imageUrl") for i in it.get("images", []) if i.get("imageUrl")), None)
            if img and ean not in out:
                out[ean] = {"img": img}   # la foto sirve aunque el producto esté sin stock online
            for seller in it.get("sellers", []):
                off = seller.get("commertialOffer") or {}
                price, lst = off.get("Price"), off.get("ListPrice")
                if not price or off.get("AvailableQuantity", 0) <= 0:
                    continue
                d = {"price": round(price), "url": link, "sku": it.get("itemId"), "seller": seller.get("sellerId", "1"), "img": img}
                if lst and price * 1.02 < lst <= price * 2:   # rebaja creíble (hasta 50%); listas absurdas se ignoran
                    d["list"] = round(lst)
                out[ean] = d
                break
    return out


def fetch_store(host, eans):
    found, errors = {}, 0
    for i in range(0, len(eans), LOTE):
        q = "&".join("fq=" + urllib.parse.quote(f"alternateIds_Ean:{e}") for e in eans[i:i + LOTE])
        url = f"https://{host}/api/catalog_system/pub/products/search?{q}&_from=0&_to={LOTE - 1}"
        try:
            with urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=30) as r:
                found.update(parse_vtex(json.load(r), host))
        except Exception as e:
            errors += 1
            print(f"  {host}: error {e}")
            if errors >= MAX_ERRORES:
                print(f"  {host}: demasiados errores, se corta")
                break
        time.sleep(PAUSA)
    return found, errors


def guardar_foto(found, info, imgs):
    n = 0
    for ean, d in found.items():
        if d.get("img") and ean in info and info[ean]["ean"] not in imgs:
            imgs[info[ean]["ean"]] = d["img"]; n += 1
    return n


def fotos_extra(hosts, faltan, info, imgs):
    """Fotos que no aparecieron en la búsqueda normal: algunas tiendas guardan el código de barras sin los ceros de adelante."""
    sin_ceros = [ean_key(e) for e in faltan if str(e) != ean_key(e)]
    if sin_ceros:
        with ThreadPoolExecutor(max_workers=len(hosts)) as ex:
            for h, (found, _) in zip(hosts, ex.map(lambda h: fetch_store(h, sin_ceros), hosts)):
                print(f"  fotos con código sin ceros en {h}: {guardar_foto(found, info, imgs)}")


# ---------- Coto Digital (no es VTEX: catálogo público en formato JSON, de a 500 productos) ----------
COTO_URL = "https://www.coto.com.ar/sitios/cdigi/browse?Nrpp={n}&No={desde}&format=json"
COTO_LOTE = 500


def _records(o):
    if isinstance(o, dict):
        if o.get("records") and isinstance(o["records"], list) and isinstance(o["records"][0], dict) and "attributes" in o["records"][0]:
            yield from o["records"]
            return
        for v in o.values():
            yield from _records(v)
    elif isinstance(o, list):
        for v in o:
            yield from _records(v)


def _total(o):
    if isinstance(o, dict):
        if "totalNumRecs" in o:
            return int(o["totalNumRecs"])
        for v in o.values():
            t = _total(v)
            if t:
                return t
    elif isinstance(o, list):
        for v in o:
            t = _total(v)
            if t:
                return t
    return 0


def _slug(t):
    t = unicodedata.normalize("NFD", t.lower())
    t = "".join(c for c in t if unicodedata.category(c) != "Mn")
    return re.sub(r"[^a-z0-9]+", "-", t).strip("-")


def parse_coto(data):
    """{ean: {price, url, img, promo}} de una página del catálogo de Coto Digital."""
    out = {}
    for r in _records(data):
        a = dict(r.get("attributes") or {})
        for sub in r.get("records") or []:
            a.update(sub.get("attributes") or {})
        g = lambda k: (a.get(k) or [""])[0]
        ean = re.sub(r"\D", "", g("product.eanPrincipal"))
        try:
            price = float(g("sku.activePrice") or 0)
        except ValueError:
            price = 0
        if not ean or price <= 0:
            continue
        m = re.search(r"sku(\d+)", g("sku.url") or g("product.url"))
        url = f"https://www.coto.com.ar/productos/{_slug(g('product.displayName'))}/_/R-{m.group(1)}-{m.group(1)}-200" if m else None
        d = {"price": round(price, 2), "url": url, "img": g("product.mediumImage.url") or None, "sku": None, "seller": None}
        try:
            descs = json.loads(g("product.dtoDescuentos") or "[]")
        except ValueError:
            descs = []
        for x in descs:
            txt = (x.get("textoDescuento") or "").replace("Dto", " de descuento").strip()
            try:
                pu = float(x.get("precioDesc") or 0)
            except ValueError:
                pu = 0
            n = int(re.sub(r"\D", "", x.get("textoLlevando") or "") or 1)
            if txt and 0 < pu < price and n == 1:   # las de cantidad (2x1, 2da al 70%) ya vienen en los precios de sucursal
                d["promo"] = {"txt": txt, "pu": round(pu, 2)}
                break
        out[ean_key(ean)] = d
    return out


def fetch_coto():
    found, errores, desde, total = {}, 0, 0, None
    while total is None or desde < total:
        try:
            with urllib.request.urlopen(urllib.request.Request(COTO_URL.format(n=COTO_LOTE, desde=desde), headers=UA), timeout=90) as r:
                data = json.load(r)
            total = total or _total(data) or 0
            found.update(parse_coto(data))
        except Exception as e:
            errores += 1
            print(f"  Coto Digital: error en la página {desde // COTO_LOTE + 1}: {e}")
            if errores >= 5:
                break
        desde += COTO_LOTE
        time.sleep(1)
        if desde > 80000:
            break
    return found, errores


def main():
    stores = json.loads((ROOT / "data" / "stores.json").read_text(encoding="utf-8"))["stores"]
    vtex = {s["id"]: s["online"]["vtex"] for s in stores if (s.get("online") or {}).get("vtex")}
    raw = sorted((ROOT / "data" / "raw").glob("sepa-*.json"))
    if not raw:
        raise SystemExit("Primero hay que correr sepa_fetch.py")
    snap = json.loads(raw[-1].read_text(encoding="utf-8"))
    count = {}
    for it in snap["items"]:
        count[it["ean"]] = count.get(it["ean"], 0) + 1
    eans = [e for e in sorted(count, key=lambda e: -count[e]) if count[e] >= 2]   # solo los que se pueden comparar
    print(f"Buscando {len(eans)} productos en {len(vtex)} tiendas online")
    with ThreadPoolExecutor(max_workers=(len(vtex) or 1) + 1) as ex:
        coto_f = ex.submit(fetch_coto)
        results = dict(zip(vtex, ex.map(lambda h: fetch_store(h, eans), vtex.values())))
        results["coto"] = coto_f.result()
    idx = {(it["store"], ean_key(it["ean"])): it for it in snap["items"]}
    info = {ean_key(it["ean"]): it for it in snap["items"]}
    ip = ROOT / "data" / "imagenes.json"
    imgs = json.loads(ip.read_text(encoding="utf-8")) if ip.exists() else {}
    for sid, (found, errors) in results.items():
        print(f"{sid}: {len(found)} productos online ({errors} errores)")
        for ean, d in found.items():
            if ean not in info:
                continue
            if d.get("img") and info[ean]["ean"] not in imgs:
                imgs[info[ean]["ean"]] = d["img"]
            if not d.get("price"):   # sin stock online: solo se aprovecha la foto
                continue
            it = idx.get((sid, ean))
            if it is None:   # se vende online pero no figura en las sucursales de la zona
                base = info[ean]
                it = {k: base[k] for k in ("ean", "name", "brand", "qty", "unit")} | {"store": sid, "price": None, "branches": 0}
                snap["items"].append(it); idx[(sid, ean)] = it
            it["price_online"] = d["price"]
            it["url"] = d["url"]
            if d.get("promo"):   # oferta online de Coto Digital
                off = round((1 - d["promo"]["pu"] / d["price"]) * 100)
                it["promo_online"] = {"txt": f"{off}% off online", "pu": d["promo"]["pu"], "n": 1, "list": d["price"]}
            it["sku"] = d["sku"]
            it["seller"] = d["seller"]
            if d.get("list"):
                off = round((1 - d["price"] / d["list"]) * 100)
                it["promo_online"] = {"txt": f"{off}% off online (antes {d['list']:,})".replace(",", "."), "pu": d["price"], "n": 1, "list": d["list"]}
                it["price_online"] = d["list"]
    faltan = [e for e in eans if info.get(ean_key(e)) and info[ean_key(e)]["ean"] not in imgs]
    print(f"Faltan fotos de {len(faltan)} productos: se buscan de otras formas")
    fotos_extra(list(vtex.values()) + SOLO_FOTOS, faltan, info, imgs)
    faltan = [e for e in faltan if info[ean_key(e)]["ean"] not in imgs]
    for host in SOLO_FOTOS:
        if not faltan:
            break
        found, _ = fetch_store(host, faltan)
        n = 0
        for ean, d in found.items():
            if d.get("img") and ean in info and info[ean]["ean"] not in imgs:
                imgs[info[ean]["ean"]] = d["img"]; n += 1
        print(f"  fotos extra de {host}: {n}")
        faltan = [e for e in faltan if info[ean_key(e)]["ean"] not in imgs]
    raw[-1].write_text(json.dumps(snap, ensure_ascii=False), encoding="utf-8")
    ip.write_text(json.dumps(imgs, separators=(",", ":")), encoding="utf-8")
    print(f"OK: {len(imgs)} fotos de productos guardadas")


if __name__ == "__main__":
    main()
