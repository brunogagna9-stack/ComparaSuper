"""Lee el precio ONLINE (tienda web) de las cadenas que usan la plataforma VTEX y lo suma a la lectura del día.

A veces comprar online sale más barato que en el local (ofertas exclusivas web), y a veces más caro.
SEPA solo trae precios de sucursal, así que el precio web se lee de la propia tienda, buscando por
código de barras (EAN) los productos que ya tenemos de SEPA.

Cadenas: las que en data/stores.json tienen "online": {"vtex": "<dominio>"}.
Coto Digital, PedidosYa Market y Rappi Turbo tienen "adaptador": "pendiente" (todavía no se leen).

Uso: python scripts/online_fetch.py   (después de sepa_fetch.py)
"""
import json, time, urllib.request, urllib.parse
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
UA = {"User-Agent": "ComparaSuper/0.1 (comparador independiente de precios)", "Accept": "application/json"}
MAX_EANS = 1200      # productos por cadena y por día (los que están en más cadenas primero)
PAUSA = 0.35         # segundos entre pedidos a una misma tienda, para no sobrecargarla


def parse_vtex(products, ean):
    """Del JSON de búsqueda de VTEX saca el precio del producto con ese EAN (o None si no hay stock)."""
    for prod in products or []:
        for it in prod.get("items", []):
            if str(it.get("ean", "")).lstrip("0") != str(ean).lstrip("0"):
                continue
            for seller in it.get("sellers", []):
                off = seller.get("commertialOffer") or {}
                if off.get("AvailableQuantity", 0) > 0 and off.get("Price"):
                    return round(off["Price"])
    return None


def fetch_store(host, eans):
    prices, errors = {}, 0
    for ean in eans:
        url = f"https://{host}/api/catalog_system/pub/products/search?fq=" + urllib.parse.quote(f"alternateIds_Ean:{ean}")
        try:
            with urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=20) as r:
                p = parse_vtex(json.load(r), ean)
            if p:
                prices[ean] = p
        except Exception:
            errors += 1
            if errors > 30:   # la tienda bloquea o no responde: se corta para no insistir
                break
        time.sleep(PAUSA)
    return prices, errors


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
    eans = sorted(count, key=lambda e: -count[e])[:MAX_EANS]
    with ThreadPoolExecutor(max_workers=len(vtex) or 1) as ex:
        results = dict(zip(vtex, ex.map(lambda h: fetch_store(h, eans), vtex.values())))
    idx = {(it["store"], it["ean"]): it for it in snap["items"]}
    info = {it["ean"]: it for it in snap["items"]}
    for sid, (prices, errors) in results.items():
        print(f"{sid}: {len(prices)} precios online ({errors} errores)")
        for ean, p in prices.items():
            it = idx.get((sid, ean))
            if it is None:   # se vende online pero no figura en las sucursales de la zona
                base = info[ean]
                it = {k: base[k] for k in ("ean", "name", "brand", "qty", "unit")} | {"store": sid, "price": None, "branches": 0}
                snap["items"].append(it)
            it["price_online"] = p
    raw[-1].write_text(json.dumps(snap, ensure_ascii=False), encoding="utf-8")


if __name__ == "__main__":
    main()
