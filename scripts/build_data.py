"""Arma los archivos que usa la web (site/data/*.json) a partir de las lecturas diarias.

Entrada:  data/raw/*.json   (una lectura por día: sepa-AAAA-MM-DD.json o demo-AAAA-MM-DD.json)
          data/history.json (historial acumulado; se actualiza acá)
          data/stores.json, data/promos_pago.json
Salida:   site/data/products.json, site/data/history.json, site/data/promos.json

Uso: python scripts/build_data.py
"""
import json, re, datetime as dt, unicodedata
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
RAW, OUT = ROOT / "data" / "raw", ROOT / "site" / "data"
HIST_DAYS = 90               # días de historial que se guardan
ANOM_DOWN, ANOM_UP = -50, 80  # % de cambio diario a partir del cual se avisa "precio inusual"

CATS = [  # id, nombre, emoji, palabras clave (se buscan en el nombre sin tildes, en minúscula)
    ("lacteos", "Lácteos y frescos", "🥛", ["leche", "yogur", "queso", "manteca", "dulce de leche", "crema", "huevo"]),
    ("bebidas", "Bebidas", "🥤", ["gaseosa", "agua", "jugo", "cerveza", "vino", "soda", "fernet"]),
    ("limpieza", "Limpieza", "🧽", ["detergente", "lavandina", "jabon liquido para ropa", "jabon en polvo", "suavizante", "papel higienico", "rollo de cocina", "limpiador", "desinfectante"]),
    ("perfumeria", "Perfumería e higiene", "🧴", ["shampoo", "acondicionador", "pasta dental", "jabon de tocador", "desodorante", "cepillo"]),
    ("bebes_mascotas", "Bebés y mascotas", "🐾", ["panal", "toallita", "alimento para perro", "alimento para gato"]),
    ("almacen", "Almacén", "🥫", ["yerba", "cafe", "azucar", "harina", "aceite", "arroz", "fideo", "pure de tomate", "atun", "galletita", "mayonesa", "sal", "pan", "te", "mate cocido", "polenta", "lenteja"]),
]


def norm(s):
    s = unicodedata.normalize("NFD", s.lower())
    return "".join(c for c in s if unicodedata.category(c) != "Mn") + " "


def classify(name):
    n = norm(name)
    for cid, _, _, words in CATS:
        if any(re.search(r"\b" + re.escape(w.strip()) + r"(s|es)?\b", n) for w in words):
            return cid
    return "otros"


def base_qty(qty, unit):
    """Lleva la presentación a kg, l o unidades para calcular el precio por unidad de medida."""
    u = (unit or "").lower().strip(".")
    if u in ("g", "gr", "grs"):
        return qty / 1000, "kg"
    if u in ("ml", "cc", "cm3"):
        return qty / 1000, "l"
    if u in ("kg", "kilo"):
        return qty, "kg"
    if u in ("l", "lt", "lts", "litro"):
        return qty, "l"
    return qty, "un"


def promo_min_qty(txt):
    """Cantidad mínima para que aplique la promo, leída de la leyenda (ej. '3x2', 'llevando 2')."""
    t = norm(txt)
    m = re.search(r"(\d+)\s*x\s*\d+", t) or re.search(r"llevando\s*(\d+)", t)
    if m:
        return int(m.group(1))
    if re.search(r"\b2(da|do|°|º)\b", t):
        return 2
    return 1


def load_raw():
    files = sorted(RAW.glob("*.json"), key=lambda p: p.stem.split("-", 1)[-1])
    return [json.loads(f.read_text(encoding="utf-8")) for f in files]


def update_history(hist, snap):
    d = snap["date"]
    if d in hist["dates"]:
        idx = hist["dates"].index(d)
    else:
        hist["dates"].append(d); idx = len(hist["dates"]) - 1
    for it in snap["items"]:
        ser = hist["series"].setdefault(it["ean"], {}).setdefault(it["store"], [])
        ser.extend([None] * (idx + 1 - len(ser)))
        ser[idx] = it.get("price") or it.get("price_online")
    # recorta a los últimos HIST_DAYS días
    cut = max(0, len(hist["dates"]) - HIST_DAYS)
    if cut:
        hist["dates"] = hist["dates"][cut:]
        for e in hist["series"].values():
            for s in list(e):
                e[s] = e[s][cut:]
    return hist


def build(snap, hist, stores):
    known = {s["id"] for s in stores}
    groups = {}
    for it in snap["items"]:
        if it["store"] not in known or not (it.get("price") or it.get("price_online")):
            continue
        groups.setdefault(it["ean"], []).append(it)
    products = []
    n = len(hist["dates"])
    for ean, its in groups.items():
        first = max(its, key=lambda x: len(x.get("name", "")))   # el nombre más completo
        bq, bu = base_qty(float(first["qty"]), first["unit"])
        offers = []
        for it in its:
            o = {"s": it["store"]}
            if it.get("price"):
                o["p"] = it["price"]                     # precio en el local
            if it.get("price_online"):
                o["po"] = it["price_online"]             # precio en la web / app
            if it.get("price") and it.get("price_max") and it["price_max"] > it["price"]:
                o["pmax"] = it["price_max"]
            for key, out in (("promo", "promo"), ("promo_online", "promoo")):
                pr = it.get(key)
                if pr and pr.get("pu"):
                    o[out] = {"txt": pr["txt"], "pu": pr["pu"], "n": pr.get("n") or promo_min_qty(pr["txt"])}
            ref = o.get("p") or o.get("po")
            ser = hist["series"].get(ean, {}).get(it["store"], [])
            prev = next((v for v in reversed(ser[:-1]) if v), None) if len(ser) > 1 else None
            if prev and prev != ref:
                pct = round((ref - prev) / prev * 100, 1)
                o["chg"] = {"prev": prev, "pct": pct}
                if pct <= ANOM_DOWN or pct >= ANOM_UP:
                    o["anom"] = True
            vals = [v for v in ser if v]
            if len(vals) >= 20 and ref <= min(vals) and not o.get("anom"):
                o["low"] = True   # el precio más bajo del período guardado
            offers.append(o)
        offers.sort(key=lambda o: o.get("p") or o.get("po"))
        products.append({"id": ean, "name": first["name"], "brand": first.get("brand", ""), "cat": classify(first["name"]),
                         "qty": first["qty"], "unit": first["unit"], "bq": round(bq, 4), "bu": bu, "offers": offers})
    products.sort(key=lambda p: p["name"])
    return products


def public_online(o):
    if not o:
        return None
    return {k: o.get(k) for k in ("nombre", "envio", "gratis_desde", "retiro", "solo_app")}


def active_promos(promos, today):
    t = today.isoformat()
    return [p for p in promos["promos"] if p["desde"] <= t <= p["hasta"]]


def main():
    stores = json.loads((ROOT / "data" / "stores.json").read_text(encoding="utf-8"))["stores"]
    promos = json.loads((ROOT / "data" / "promos_pago.json").read_text(encoding="utf-8"))
    hp = ROOT / "data" / "history.json"
    hist = json.loads(hp.read_text(encoding="utf-8")) if hp.exists() else {"dates": [], "series": {}}
    snaps = load_raw()
    if not snaps:
        raise SystemExit("No hay lecturas en data/raw/. Corré sepa_fetch.py (datos reales) o make_demo.py (ejemplo).")
    for s in snaps:
        if not hist["dates"] or s["date"] >= hist["dates"][-1]:
            update_history(hist, s)
    last = snaps[-1]
    products = build(last, hist, stores)
    OUT.mkdir(parents=True, exist_ok=True)
    meta = {"updated": last["date"], "source": last.get("source", "sepa"), "region": last.get("region", ""),
            "demo": last.get("source") == "demo",
            "stores": [{k: s.get(k) for k in ("id", "name", "tipo", "color", "sigla", "web", "buscar", "nota")} | {"online": public_online(s.get("online"))}
                       for s in stores if s["id"] in {o["s"] for p in products for o in p["offers"]}],
            "cats": [{"id": c[0], "name": c[1], "emoji": c[2]} for c in CATS] + [{"id": "otros", "name": "Otros", "emoji": "🛒"}]}
    (OUT / "products.json").write_text(json.dumps(dict(meta, products=products), ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    used = {p["id"] for p in products}
    (OUT / "history.json").write_text(json.dumps({"dates": hist["dates"], "series": {k: v for k, v in hist["series"].items() if k in used}},
                                                 separators=(",", ":")), encoding="utf-8")
    (OUT / "promos.json").write_text(json.dumps({k: promos.get(k) for k in ("tipos", "formas_pago", "medios", "relevado")} | {"promos": active_promos(promos, dt.date.fromisoformat(last["date"]))},
                                                ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    hp.write_text(json.dumps(hist, separators=(",", ":")), encoding="utf-8")
    print(f"OK: {len(products)} productos, {len(hist['dates'])} días de historial, lectura del {last['date']}")


if __name__ == "__main__":
    main()
