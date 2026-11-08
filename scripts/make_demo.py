"""Genera DATOS DE EJEMPLO (inventados) para probar el sitio sin conexión.

Escribe un archivo por día en data/raw/ con el mismo formato que produce
sepa_fetch.py con datos reales, así build_data.py funciona igual con ambos.

Uso:  python scripts/make_demo.py [dias]
"""
import json, random, sys, datetime as dt
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
RAW = ROOT / "data" / "raw"

# nombre, marca, cantidad, unidad, precio base aproximado (ARS, inventado)
CATALOGO = [
    ("Leche entera La Serenísima 1 l", "La Serenísima", 1, "l", 1750),
    ("Leche descremada Sancor 1 l", "Sancor", 1, "l", 1590),
    ("Yogur bebible frutilla Ser 900 g", "Ser", 900, "g", 2900),
    ("Queso cremoso La Paulina x kg", "La Paulina", 1, "kg", 11900),
    ("Manteca La Serenísima 200 g", "La Serenísima", 200, "g", 3150),
    ("Dulce de leche clásico La Serenísima 400 g", "La Serenísima", 400, "g", 3300),
    ("Huevos blancos maple x 30", "Granja", 30, "un", 7900),
    ("Yerba mate Playadito 1 kg", "Playadito", 1, "kg", 5600),
    ("Yerba mate Taragüí con palo 1 kg", "Taragüí", 1, "kg", 5200),
    ("Yerba mate Unión suave 500 g", "Unión", 500, "g", 2700),
    ("Café molido La Virginia 500 g", "La Virginia", 500, "g", 7400),
    ("Azúcar Ledesma 1 kg", "Ledesma", 1, "kg", 1350),
    ("Harina 0000 Pureza 1 kg", "Pureza", 1, "kg", 1150),
    ("Harina 000 Blancaflor leudante 1 kg", "Blancaflor", 1, "kg", 1500),
    ("Aceite de girasol Natura 1,5 l", "Natura", 1.5, "l", 4300),
    ("Aceite de girasol Cocinero 900 ml", "Cocinero", 900, "ml", 2600),
    ("Aceite de oliva extra virgen Cocinero 500 ml", "Cocinero", 500, "ml", 8900),
    ("Arroz largo fino Gallo Oro 1 kg", "Gallo", 1, "kg", 2350),
    ("Arroz largo fino Molinos Ala 1 kg", "Molinos Ala", 1, "kg", 1950),
    ("Fideos spaghetti Matarazzo 500 g", "Matarazzo", 500, "g", 1650),
    ("Fideos tirabuzón Lucchetti 500 g", "Lucchetti", 500, "g", 1250),
    ("Puré de tomate Arcor 520 g", "Arcor", 520, "g", 990),
    ("Atún al natural La Campagnola 170 g", "La Campagnola", 170, "g", 2950),
    ("Galletitas Criollitas 3 x 100 g", "Bagley", 300, "g", 2100),
    ("Galletitas Oreo 118 g", "Oreo", 118, "g", 1300),
    ("Mayonesa Hellmann's 500 g", "Hellmann's", 500, "g", 3200),
    ("Sal fina Celusal 500 g", "Celusal", 500, "g", 980),
    ("Pan lacteado Fargo 360 g", "Fargo", 360, "g", 2850),
    ("Gaseosa Coca-Cola sabor original 2,25 l", "Coca-Cola", 2.25, "l", 3900),
    ("Gaseosa Pepsi 2 l", "Pepsi", 2, "l", 2900),
    ("Agua mineral sin gas Villavicencio 2 l", "Villavicencio", 2, "l", 1500),
    ("Agua mineral sin gas Glaciar 2 l", "Glaciar", 2, "l", 1100),
    ("Jugo en polvo Tang naranja 15 g", "Tang", 15, "g", 420),
    ("Cerveza Quilmes Clásica lata 473 ml", "Quilmes", 473, "ml", 1650),
    ("Vino tinto malbec Alamos 750 ml", "Alamos", 750, "ml", 7800),
    ("Detergente Magistral limón 500 ml", "Magistral", 500, "ml", 2650),
    ("Detergente Cif active gel 500 ml", "Cif", 500, "ml", 1900),
    ("Lavandina Ayudín 2 l", "Ayudín", 2, "l", 1750),
    ("Jabón líquido para ropa Skip 3 l", "Skip", 3, "l", 14900),
    ("Jabón en polvo Ala 800 g", "Ala", 800, "g", 3900),
    ("Suavizante Comfort 900 ml", "Comfort", 900, "ml", 3300),
    ("Papel higiénico Higienol 4 rollos x 30 m", "Higienol", 4, "un", 2600),
    ("Rollo de cocina Sussex 3 x 60 paños", "Sussex", 3, "un", 3100),
    ("Shampoo Sedal ceramidas 340 ml", "Sedal", 340, "ml", 3600),
    ("Pasta dental Colgate Total 12 90 g", "Colgate", 90, "g", 3800),
    ("Jabón de tocador Dove 90 g", "Dove", 90, "g", 1700),
    ("Desodorante Rexona aerosol 150 ml", "Rexona", 150, "ml", 3900),
    ("Pañales Pampers Confort Sec G x 36", "Pampers", 36, "un", 19900),
    ("Alimento para perros Dog Chow adultos 3 kg", "Dog Chow", 3, "kg", 16500),
    ("Alimento para gatos Cat Chow adultos 1 kg", "Cat Chow", 1, "kg", 7200),
]

# nivel de precios de cada cadena y probabilidad de tener el producto (todo inventado)
NIVEL = {"carrefour": 1.00, "carrefourmaxi": 0.90, "changomas": 0.95, "coto": 0.98, "dar": 0.96, "dia": 0.93, "diarco": 0.88, "diarcobarrio": 0.93,
         "disco": 1.06, "josimar": 0.97, "jumbo": 1.09, "makro": 0.91, "maxiconsumo": 0.87, "nini": 0.89, "pedidosya": 1.12,
         "puntomayorista": 0.90, "rappi": 1.14, "vea": 0.99, "vital": 0.89, "yaguar": 0.88}
TIENE = {"super": 0.88, "mayorista": 0.72, "app": 0.65}
# precio online respecto del local (Coto Digital a veces más barato: ofertas exclusivas online)
ONLINE = {"carrefour": (0.97, 1.05), "changomas": (0.96, 1.04), "coto": (0.88, 1.06), "dia": (0.98, 1.04), "disco": (0.99, 1.06),
          "jumbo": (0.99, 1.06), "vea": (0.97, 1.05)}
STORES = {s["id"]: s for s in json.loads((ROOT / "data" / "stores.json").read_text(encoding="utf-8"))["stores"]}
PROMOS = [("2x1", 2, 0.5), ("Llevando 2, la 2da al 70%", 2, 0.65), ("3x2", 3, 2 / 3),
          ("Llevando 2, la 2da al 50%", 2, 0.75), ("25% de descuento", 1, 0.75), ("Llevando 3, 20% c/u", 3, 0.80)]


def main(dias=60):
    rnd = random.Random(7)
    RAW.mkdir(parents=True, exist_ok=True)
    for old in RAW.glob("demo-*.json"):
        old.unlink()
    hoy = dt.date.today()
    # estado por (producto, cadena): precio actual, tiene stock
    estado = {}
    for i, (name, brand, qty, unit, base) in enumerate(CATALOGO):
        for s, lvl in NIVEL.items():
            if rnd.random() < TIENE[STORES[s]["tipo"]]:
                lo, hi = ONLINE.get(s, (1, 1))
                estado[(i, s)] = {"p": base * lvl * rnd.uniform(0.94, 1.07), "promo": None, "dias_promo": 0,
                                  "fo": rnd.uniform(lo, hi) if s in ONLINE and rnd.random() < 0.9 else None}
    for d in range(dias, -1, -1):
        fecha = hoy - dt.timedelta(days=d)
        items = []
        for (i, s), st in estado.items():
            name, brand, qty, unit, base = CATALOGO[i]
            # inflación suave + saltos de precio ocasionales
            if rnd.random() < 0.06:
                st["p"] *= rnd.uniform(1.02, 1.08)
            elif rnd.random() < 0.008:
                st["p"] *= rnd.uniform(0.90, 0.97)
            # promos que duran unos días
            if st["dias_promo"] > 0:
                st["dias_promo"] -= 1
                if st["dias_promo"] == 0:
                    st["promo"] = None
            elif rnd.random() < 0.025:
                st["promo"] = rnd.choice(PROMOS); st["dias_promo"] = rnd.randint(4, 12)
            price = round(st["p"] / 10) * 10
            app = STORES[s]["tipo"] == "app"
            item = {"store": s, "ean": f"DEMO{i:04d}", "name": name, "brand": brand, "qty": qty, "unit": unit,
                    "price": None if app else price, "branches": 1 if app else rnd.randint(3, 60)}
            if not app:
                item["price_max"] = round(price * rnd.uniform(1.0, 1.06) / 10) * 10
            if app:
                item["price_online"] = price
            elif st["fo"]:
                item["price_online"] = round(price * st["fo"] / 10) * 10
            if st["promo"]:
                txt, n, f = st["promo"]
                promo = {"txt": txt, "n": n, "pu": round(price * f / 10) * 10}
                item["promo_online" if app else "promo"] = promo
            items.append(item)
        # un precio con error de carga el último día, para mostrar el aviso de "precio inusual"
        if d == 0:
            for it in items:
                if it["ean"] == "DEMO0016" and it["store"] == "vea" and it["price"]:
                    it["price"] = round(it["price"] * 0.35 / 10) * 10
                    it.pop("promo", None)
        out = {"date": fecha.isoformat(), "source": "demo", "region": "CABA y GBA (ejemplo)", "items": items}
        (RAW / f"demo-{fecha.isoformat()}.json").write_text(json.dumps(out, ensure_ascii=False), encoding="utf-8")
    print(f"OK: {dias + 1} días de datos de ejemplo en {RAW}")


if __name__ == "__main__":
    main(int(sys.argv[1]) if len(sys.argv) > 1 else 60)
