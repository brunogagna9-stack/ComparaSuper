"""Arma los archivos que usa la web (site/data/*.json) a partir de las lecturas diarias.

Entrada:  data/raw/*.json   (una lectura por día: sepa-AAAA-MM-DD.json o demo-AAAA-MM-DD.json)
          data/history.json (historial acumulado; se actualiza acá)
          data/stores.json, data/promos_pago.json
Salida:   site/data/products.json, site/data/history.json, site/data/promos.json

Uso: python scripts/build_data.py
"""
import json, re, datetime as dt, unicodedata
from collections import Counter
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
RAW, OUT = ROOT / "data" / "raw", ROOT / "site" / "data"
HIST_DAYS = 90               # días de historial que se guardan
ANOM_DOWN, ANOM_UP = -50, 80
MIN_PRECIO = 50      # pesos: debajo de esto es un error de carga
MIN_OFERTAS = 2      # con datos reales solo se publican productos que se venden en 2 o más comercios (si no, no hay qué comparar)  # % de cambio diario a partir del cual se avisa "precio inusual"

CATS = [  # id, nombre, emoji, palabras clave. Se comparan con el nombre sin tildes ni signos: una palabra clave de 4+ letras
          # también reconoce abreviaturas que empiezan igual ("galle" → galletitas). El orden importa: gana la primera categoría.
    ("bebes_mascotas", "Bebés y mascotas", "🐾", ["panal", "pañal", "toallitas humedas", "toallas humedas", "mamadera", "chupete", "perro", "perros",
        "gato", "gatos", "cachorro", "pedigree", "whiskas", "dog chow", "cat chow", "piedras sanitarias", "mascota"]),
    ("limpieza", "Limpieza", "🧽", ["detergente", "lavavajilla", "lavandina", "suavizante", "quitamanchas", "limpiador", "limpia", "desinfectante",
        "desengrasante", "jabon ropa", "jabon para ropa", "jabon e polvo", "jabon en polvo", "jabon liquido para ropa", "para ropa", "papel higienico",
        "rollo de cocina", "rollo cocina", "servilleta", "esponja", "fibra", "trapo", "guante", "bolsa residuo", "bolsas residuo", "residuos",
        "insecticida", "matamoscas", "aromatizante", "aromatiz", "desodorante ambiente", "desodorante de ambiente", "inodoro", "canasta liquida", "cera", "lustramuebles",
        "repelente", "espiral", "lavarropas", "prelavado", "blanqueador", "toalla de papel"]),
    ("perfumeria", "Perfumería e higiene", "🧴", ["shampoo", "shamp", "acondicionador", "enjuague", "pasta dental", "crema dental", "hilo dental",
        "cepillo dental", "jabon de tocador", "jabon tocador", "jabon d tocad", "jabon de toca", "jabon liquido", "jabon liq", "jabon", "desodorante",
        "antitranspirante", "toalla femenina", "toallas femeninas", "toalla femeni", "toallitas femeninas", "protector diario", "protectores diarios",
        "tampon", "afeitar", "maquina desechable", "after shave", "coloracion", "tintura", "crema corporal", "crema de manos", "protector solar",
        "algodon", "hisopo", "panuelos", "alcohol en gel", "preservativo", "gel", "talco", "maquillaje", "esmalte", "depilar", "cotonete", "colonia",
        "perfume", "locion", "serum", "limpieza facial", "crema facial", "eau de", "micelar", "quitaesmalte", "acond", "repuesto",
        "maquina de afeitar", "cepillo de dientes", "toallitas desmaquillantes"]),
    ("bebidas", "Bebidas", "🥤", ["gaseosa", "agua", "jugo", "cerveza", "vino", "espumante", "champagne", "sidra", "soda", "fernet", "aperitivo",
        "gin", "vodka", "whisky", "ron", "licor", "oporto", "energizante", "isotonica", "bebida", "beb", "amargo", "tonica", "malbec", "cabernet",
        "torrontes", "vermouth", "cafe frio", "te frio", "agua saborizada", "bitter", "cerv"]),
    ("lacteos", "Lácteos, fiambres y frescos", "🥛", ["leche", "yogur", "yog", "queso", "quesos", "manteca", "dulce de leche", "crema de leche",
        "huevo", "huevos", "postre", "ricota", "muzzarella", "mozzarella", "jamon", "salame", "salamin", "mortadela", "fiambre", "salchicha",
        "hamburguesa", "medallon", "milanesa", "tapa", "tapas", "pascualina", "noquis", "ñoquis", "ravioles", "sorrentinos", "capelettis", "prepizza",
        "pizza", "helado", "congelado", "congeladas", "pollo", "carne", "cerdo", "bife", "nalga", "vacio", "asado", "ensalada", "verdura", "fruta",
        "papa", "papas", "cebolla", "tomate perita", "zanahoria", "lechuga", "banana", "manzana", "naranja", "limon", "puerro", "queso rallado",
        "crema", "flan", "leches", "lacteo", "untable", "margarina", "dulce de batata", "dulce de membrillo", "pan lactal", "lactal"]),
    ("almacen", "Almacén", "🥫", ["yerba", "cafe", "azucar", "harina", "aceite", "aceitunas", "arroz", "fideo", "fideos", "spaghetti", "tallarin",
        "mostachol", "tirabuzon", "polenta", "lenteja", "poroto", "garbanzo", "arveja", "pure", "tomate", "salsa", "aderezo", "mayonesa", "ketchup",
        "mostaza", "vinagre", "sal", "pimienta", "condimento", "oregano", "caldo", "sopa", "risotto", "noodles", "galletita", "galle", "galleta",
        "bizcocho", "bizcochos", "tostada", "pan", "budin", "torta", "magdalena", "alfajor", "chocolate", "tableta", "caramelo", "caramelos",
        "chicle", "golosina", "gomitas", "cereal", "avena", "mermelada", "dulce", "miel", "edulcorante", "atun", "caballa", "sardina", "conserva",
        "choclo", "durazno", "mani", "almendra", "nuez", "frutos secos", "mix", "snack", "chizito", "palitos", "rebozador", "premezcla",
        "bizcochuelo", "gelatina", "te", "mate cocido", "cacao", "tortilla", "tortillas", "chimichurri", "pickles", "grisines", "barra de cereal",
        "pochoclo", "copos", "granola", "levadura", "polvo de hornear", "esencia", "cacao", "leche en polvo", "maicena", "fecula", "semola"]),
]
OTROS = ("otros", "Hogar y otros", "🛒")


def norm(s):
    s = unicodedata.normalize("NFD", (s or "").lower())
    return "".join(c for c in s if unicodedata.category(c) != "Mn") + " "


def _tokens(name):
    return re.sub(r"[^a-z0-9ñ]+", " ", norm(name)).split()


def classify(name):
    """Gana la palabra clave que aparece primero en el nombre (el tipo de producto suele ir adelante:
    'Noodles sabor pollo' es almacén, no carnes). Si empatan, gana la categoría que está antes en CATS."""
    toks = _tokens(name)
    best = None
    for order, (cid, _, _, words) in enumerate(CATS):
        for w in words:
            wt = _tokens(w)
            if not wt:
                continue
            for i, t in enumerate(toks):
                if len(wt) > 1:
                    hit = toks[i:i + len(wt)] == wt
                elif len(wt[0]) >= 4:
                    hit = t.startswith(wt[0])
                else:
                    hit = t in (wt[0], wt[0] + "s", wt[0] + "es")
                if hit:
                    if best is None or (i, order) < best[:2]:
                        best = (i, order, cid)
                    break
    return best[2] if best else OTROS[0]


CODE_SUFFIX = re.compile(r"\s+[A-Za-z]{2,4}-\d+(?:[.,]\d+)?-[A-Za-z]+\.?\s*$")   # ej. " BOT-1350-ml." que agregan algunas cadenas
SMALL = {"de", "del", "con", "sin", "y", "x", "en", "la", "el", "p", "c", "s", "d", "a", "al"}
UNITS = {"g", "gr", "grs", "grm", "kg", "kgm", "ml", "cc", "cm3", "l", "lt", "lts", "un", "uni", "u"}


def nice_name(raw):
    """Saca códigos internos del final y pasa a 'Tipo Oración' los nombres escritos todo en mayúsculas."""
    n = CODE_SUFFIX.sub("", (raw or "").strip())
    n = re.sub(r"\s+", " ", n).strip()
    letters = [c for c in n if c.isalpha()]
    if letters and sum(c.isupper() for c in letters) / len(letters) > 0.7:
        out = []
        for i, w in enumerate(n.lower().split(" ")):
            if i and (w in SMALL or w.rstrip(".") in UNITS or re.match(r"^[a-z]/", w)):
                out.append(w)
            else:
                out.append(w[:1].upper() + w[1:])
        n = " ".join(out)
    else:
        n = n[:1].upper() + n[1:]
    return n


def qty_from_name(name):
    pack = re.search(r"(\d+)\s*x\s*(\d+(?:[.,]\d+)?)\s*(kgs?|kgm|grs?|grm|g|ml|cc|cm3|lts?|ltr|l)\b", norm(name))
    if pack:   # multipack "3x90g" = 270 g
        return int(pack.group(1)) * float(pack.group(2).replace(",", ".")), pack.group(3)
    m = re.findall(r"(\d+(?:[.,]\d+)?)\s*(kgs?|kgm|grs?|grm|g|ml|cc|cm3|lts?|ltr|l)\b", norm(name))
    if not m:
        return None
    q, u = m[-1]
    try:
        return float(q.replace(",", ".")), u
    except ValueError:
        return None


def size_of(it):
    """(cantidad, unidad base) confiable: corrige '0.27 gr' (=270 g) y usa el nombre cuando la cadena informa '1 unidad'."""
    try:
        q = float(it.get("qty") or 0)
    except (TypeError, ValueError):
        q = 0
    bq, bu = base_qty(q or 1, it.get("unit"))
    if bu in ("kg", "l") and q and q < 5 and (it.get("unit") or "").lower().strip(".") in ("g", "gr", "grs", "grm", "ml", "cc", "cm3", "mlt"):
        bq = q                      # vino en kg/l aunque diga gramos o mililitros
    named = qty_from_name(it.get("name", ""))
    if named:
        nb = base_qty(*named)
        if bu == "un" or abs(nb[0] - bq) / max(nb[0], 1e-9) > 0.2:
            return nb
    return bq, bu


def base_qty(qty, unit):
    """Lleva la presentación a kg, l o unidades para calcular el precio por unidad de medida."""
    qty = float(qty)
    u = (unit or "").lower().strip().strip(".")
    if u in ("g", "gr", "grs", "grm", "gramos"):
        return qty / 1000, "kg"
    if u in ("ml", "mlt", "cc", "cm3", "cmq"):
        return qty / 1000, "l"
    if u in ("kg", "kgs", "kgm", "kilo", "kilos"):
        return qty, "kg"
    if u in ("l", "lt", "lts", "ltr", "litro", "litros"):
        return qty, "l"
    if u in ("cl",):
        return qty / 100, "l"
    return qty, "un"


def clean_promo_txt(txt):
    """Pasa las leyendas de SEPA a algo legible.
    'Promo A valida desde el 01/09 hasta el 30/11' -> 'Oferta hasta 30/11'
    'Paga solo Cantidad minima 1 UN' -> 'Precio rebajado'
    '20% - Llevando promo precio x unidad Cantidad minima 2 UN' -> '20% llevando 2'"""
    t = (txt or "").strip()
    nt = norm(t)
    m = re.search(r"cantidad\s*minima\s*(\d+)", nt)
    n = int(m.group(1)) if m else 0
    hasta = re.search(r"hasta\s*(?:el\s*)?(\d{1,2})/(\d{1,2})", t, re.I)
    if re.match(r"promo\s*[a-z]?\s*valida", nt) or nt.startswith("valida desde"):
        return f"Oferta hasta {int(hasta.group(1)):02d}/{int(hasta.group(2)):02d}" if hasta else "Oferta del comercio"
    t = re.sub(r"\s*-?\s*llev(?:ando)?\s*promo.*$", "", t, flags=re.I)
    t = re.sub(r"\s*cantidad\s*m[ií]nima.*$", "", t, flags=re.I)
    t = re.sub(r"\s*\(?v[aá]lid[ao] desde.*$", "", t, flags=re.I).strip(" -.,#")
    if not t or re.fullmatch(r"paga\s*solo", norm(t).strip()):
        t = "Precio rebajado"
    if n > 1 and "llevando" not in norm(t) and not re.search(r"\d\s*x\s*\d|2da|2do", norm(t)):
        t += f" llevando {n}"
    if len(t) > 28 and ". " in t:
        t = t.split(". ")[0]
    return (t[:44] + "…") if len(t) > 45 else t


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


NAME_PREF = {s: i for i, s in enumerate(["jumbo", "disco", "vea", "carrefour", "coto", "changomas", "dia", "carrefourmaxi", "makro"])}


def build(snap, hist, stores, min_offers=1):
    known = {s["id"] for s in stores}
    groups = {}
    for it in snap["items"]:
        if it["store"] not in known or not (it.get("price") or it.get("price_online")):
            continue
        groups.setdefault(it["ean"], []).append(it)
    products = []
    n = len(hist["dates"])
    for ean, its in groups.items():
        if len({i["store"] for i in its}) < min_offers:
            continue
        # nombre: el de la cadena con nombres más prolijos; tamaño: el que más se repite entre cadenas
        first = min(its, key=lambda x: NAME_PREF.get(x["store"], 99))
        sizes = Counter((round(b, 3), u) for b, u in (size_of(i) for i in its))
        (bq, bu), _ = sizes.most_common(1)[0]
        # precios absurdos (ej. $1 por un error de carga): fuera si valen menos de un cuarto de la mediana de las demás cadenas
        refs = sorted((i.get("price") or i.get("price_online")) for i in its)
        med = refs[len(refs) // 2]
        its = [i for i in its if (i.get("price") or i.get("price_online")) >= max(MIN_PRECIO, med * 0.25)]
        if len({i["store"] for i in its}) < min_offers or not its:
            continue
        offers = []
        for it in its:
            o = {"s": it["store"]}
            if it.get("price"):
                o["p"] = it["price"]                     # precio en el local
            if it.get("price_online"):
                o["po"] = it["price_online"]             # precio en la web / app
            if it.get("bulto"):
                o["bulto"] = it["bulto"]
            # enlace exacto (se guarda solo la parte final: https://<tienda>/<lk>/p) y código para el carrito online
            m = re.match(r"https://[^/]+/(.+)/p$", it.get("url") or "")
            if m:
                o["lk"] = m.group(1)
            elif it.get("url"):
                o["url"] = it["url"]
            if it.get("sku"):
                o["sku"] = it["sku"]
            if it.get("seller") and str(it["seller"]) != "1":
                o["seller"] = it["seller"]
            if it.get("price") and it.get("price_max") and it["price_max"] > it["price"] * 1.05:
                o["pmax"] = it["price_max"]
            po = it.get("promo_online")
            if po and po.get("list") and it.get("price_online") and po["pu"] < it["price_online"] * 0.5:
                o["po"] = po["pu"]   # "precio de lista" absurdo de la tienda: se usa el precio real
                po = None
            if po and po.get("list") and it.get("price_online") and po["pu"] < it["price_online"] and po["pu"] >= it["price_online"] * 0.5:
                o["pon"] = po["pu"]   # precio online rebajado (la web arma el texto de la rebaja)
                po = None
            for key, out in (("promo", "promo"), ("promo_online" if po else "_", "promoo")):
                pr = it.get(key)
                ref_p = it.get("price") if key == "promo" else it.get("price_online")
                if pr and pr.get("pu") and ref_p and pr["pu"] < ref_p:   # una "promo" que no baja el precio no se muestra
                    o[out] = {"txt": clean_promo_txt(pr["txt"]), "pu": pr["pu"], "n": pr.get("n") or promo_min_qty(pr["txt"])}
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
        name = nice_name(first["name"])
        cat = next((c for c in (classify(i["name"]) for i in its) if c != OTROS[0]), OTROS[0])
        img = pack_img(IMGS.get(ean) or IMGS.get(ean.lstrip("0")))
        products.append({"id": ean, **({"img": img} if img else {}), "name": name, "brand": (first.get("brand") or "").title(), "cat": cat,
                         "bq": round(bq, 4), "bu": bu, "offers": offers})
    products.sort(key=lambda p: p["name"])
    return products


def public_online(o):
    if not o:
        return None
    return {k: o.get(k) for k in ("nombre", "envio", "gratis_desde", "retiro", "solo_app", "vtex")}


def active_promos(promos, today):
    t = today.isoformat()
    return [p for p in promos["promos"] if p["desde"] <= t <= p["hasta"]]


IMGS = {}


IMGHOSTS = []


def pack_img(u):
    """Foto comprimida: "h/id/archivo" (h = índice del servidor de fotos). La web la arma en tamaño miniatura."""
    if not u:
        return None
    m = re.match(r"https://([^/]+)/arquivos/ids/(\d+)(?:-\d+-\d+)?/([^?]+)", u)
    if not m:
        return u
    if m.group(1) not in IMGHOSTS:
        IMGHOSTS.append(m.group(1))
    return f"{IMGHOSTS.index(m.group(1))}/{m.group(2)}/{m.group(3)}"


def small_img(u):
    """Foto en tamaño miniatura (las tiendas VTEX la sirven achicada si se pide /ids/<n>-300-300/)."""
    if not u:
        return None
    u = u.split("?")[0]
    return re.sub(r"/arquivos/ids/(\d+)/", r"/arquivos/ids/\1-300-300/", u)


def main():
    ip = ROOT / "data" / "imagenes.json"
    if ip.exists():
        IMGS.update(json.loads(ip.read_text(encoding="utf-8")))
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
    products = build(last, hist, stores, min_offers=1 if last.get("source") == "demo" else MIN_OFERTAS)
    OUT.mkdir(parents=True, exist_ok=True)
    meta = {"imghosts": IMGHOSTS, "updated": last["date"], "source": last.get("source", "sepa"), "region": last.get("region", ""),
            "demo": last.get("source") == "demo",
            "stores": [{k: s.get(k) for k in ("id", "name", "tipo", "color", "sigla", "web", "buscar", "nota")} | {"online": public_online(s.get("online"))}
                       for s in stores if s["id"] in {o["s"] for p in products for o in p["offers"]}],
            "cats": [{"id": c[0], "name": c[1], "emoji": c[2]} for c in CATS] + [{"id": OTROS[0], "name": OTROS[1], "emoji": OTROS[2]}]}
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
