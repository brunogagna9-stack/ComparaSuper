"""Arma los datos de la web POR PROVINCIA (versión de prueba del mapa por provincias).

Entrada:  data/raw-prov/sepa-*.json   (lo escribe sepa_fetch_prov.py)
          <historial>/hist/<x>.json   (historial de cada provincia; se actualiza acá)
Salida:   site/data/p/<x>/meta.json, products.json, links.json, history.json, sucursales.json
          (x = letra de la provincia: c = CABA, b = Buenos Aires, x = Córdoba, ...)

CABA y Buenos Aires no se arman acá: la web usa para esas dos los datos de siempre (site/data/*.json),
que además traen los precios de las tiendas online.

Uso: python scripts/build_data_prov.py [carpeta_del_historial]
     (por defecto el historial va en data/hist-prov/)
"""
import json, sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import build_data as B
from provincias import PROVS, NOMBRE, AMBA, carpeta

ROOT = B.ROOT
RAWP = ROOT / "data" / "raw-prov"
OUTP = ROOT / "site" / "data" / "p"


def write(path, obj):
    path.write_text(json.dumps(obj, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")


def main():
    hdir = Path(sys.argv[1]) if len(sys.argv) > 1 else ROOT / "data" / "hist-prov"
    (hdir / "hist").mkdir(parents=True, exist_ok=True)
    ip = ROOT / "data" / "imagenes.json"
    if ip.exists():
        B.IMGS.update(json.loads(ip.read_text(encoding="utf-8")))
    stores = json.loads((ROOT / "data" / "stores.json").read_text(encoding="utf-8"))["stores"]
    files = sorted(RAWP.glob("sepa-*.json"))
    if not files:
        raise SystemExit("No hay lecturas en data/raw-prov/. Corré sepa_fetch_prov.py.")
    raw = json.loads(files[-1].read_text(encoding="utf-8"))
    resumen = []
    for code, nombre in PROVS:
        if code in AMBA:
            continue
        x = carpeta(code)
        out = OUTP / x
        out.mkdir(parents=True, exist_ok=True)
        hp = hdir / "hist" / f"{x}.json"
        hist = json.loads(hp.read_text(encoding="utf-8")) if hp.exists() else {"dates": [], "series": {}}
        snap = {"date": raw["date"], "source": "sepa", "region": nombre, "items": raw["items"].get(code, [])}
        if not hist["dates"] or snap["date"] >= hist["dates"][-1]:
            B.update_history(hist, snap)
        B.IMGHOSTS.clear()   # cada provincia lleva su propia lista de servidores de fotos
        products = B.build(snap, hist, stores, min_offers=B.MIN_OFERTAS)
        usados = {o["s"] for p in products for o in p["offers"]}
        meta = {"imghosts": list(B.IMGHOSTS), "updated": snap["date"], "source": "sepa", "region": nombre, "prov": code, "demo": False,
                "stores": [{k: s.get(k) for k in ("id", "name", "tipo", "color", "sigla", "web", "buscar", "nota")} | {"online": None}
                           for s in stores if s["id"] in usados],
                "cats": [{"id": c[0], "name": c[1], "emoji": c[2]} for c in B.CATS] + [{"id": B.OTROS[0], "name": B.OTROS[1], "emoji": B.OTROS[2]}]}
        for p in products:
            for o in p["offers"]:
                for k in ("lk", "url", "sku", "seller"):
                    o.pop(k, None)
        write(out / "meta.json", meta)
        write(out / "products.json", B.columnas(meta, products))
        write(out / "products-top.json", B.columnas(meta, sorted(products, key=lambda p: -len(p["offers"]))[:5000]))   # para buscar mientras baja el resto
        write(out / "links.json", {})
        used = {p["id"] for p in products}
        write(out / "history.json", {"dates": hist["dates"], "series": {k: v for k, v in hist["series"].items() if k in used}})
        write(out / "sucursales.json", raw.get("sucursales", {}).get(code, {}))
        # el historial guardado solo conserva productos que se publicaron alguna vez en la provincia
        write(hp, hist)
        resumen.append(f"{nombre}: {len(products)} productos, {len(usados)} cadenas")
    print("\n".join(resumen))
    print(f"OK: datos de {len(resumen)} provincias, lectura del {raw['date']}")


if __name__ == "__main__":
    main()
