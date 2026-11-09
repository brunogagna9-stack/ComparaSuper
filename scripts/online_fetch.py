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
    with ThreadPoolExecutor(max_workers=len(vtex) or 1) as ex:
        results = dict(zip(vtex, ex.map(lambda h: fetch_store(h, eans), vtex.values())))
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
