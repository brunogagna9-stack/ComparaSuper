"""Pruebas automáticas. Uso: python tests/run_tests.py"""
import io, json, sys, zipfile, tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "scripts"))
import sepa_fetch as sf, build_data as bd, online_fetch as of

STORES = json.loads((ROOT / "data/stores.json").read_text(encoding="utf-8"))["stores"]

PH = ("id_comercio|id_bandera|id_sucursal|id_producto|productos_ean|productos_descripcion|productos_cantidad_presentacion|"
      "productos_unidad_medida_presentacion|productos_marca|productos_precio_lista|productos_precio_referencia|"
      "productos_cantidad_referencia|productos_unidad_medida_referencia|productos_precio_unitario_promo1|"
      "productos_leyenda_promo1|productos_precio_unitario_promo2|productos_leyenda_promo2")


def fake_zip(path):
    """Arma un SEPA en miniatura: Coto con 3 sucursales (2 en CABA, 1 en Córdoba) y una cadena que no seguimos."""
    def comercio(idc, bandera, sucs, prods):
        b = io.BytesIO()
        with zipfile.ZipFile(b, "w") as z:
            z.writestr("comercio.csv", f"id_comercio|id_bandera|comercio_cuit|comercio_razon_social|comercio_bandera_nombre\n{idc}|1|1|X|{bandera}\nÚltima actualización: 2026-11-07\n")
            z.writestr("sucursales.csv", "id_comercio|id_bandera|id_sucursal|sucursales_nombre|sucursales_provincia\n" +
                       "".join(f"{idc}|1|{s}|S{s}|{p}\n" for s, p in sucs))
            z.writestr("productos.csv", PH + "\n" + "".join(r + "\n" for r in prods))
        return b.getvalue()
    coto = comercio("10", "COTO CICSA", [("1", "AR-C"), ("2", "AR-B"), ("3", "AR-X")], [
        "10|1|1|a|7790000000011|Leche Entera 1 L|1|lt|La Serenisima|1800|1800|1|lt|900|2x1||",
        "10|1|2|a|7790000000011|Leche Entera 1 L|1|lt|La Serenisima|1900|1900|1|lt|950|2x1||",
        "10|1|3|a|7790000000011|Leche Entera 1 L|1|lt|La Serenisima|100|100|1|lt|||",      # Córdoba: se ignora
        "10|1|1|b|7790000000028|Yerba 1 Kg|1|kg|Playadito|5000|5000|1|kg|||",              # 1 sola sucursal: no se publica
        "10|1|1|c|0|Pan del dia|1|un|Coto|900|900|1|un|||",                                  # sin EAN: no se compara
    ])
    otra = comercio("99", "OTRA CADENA", [("1", "AR-C")], ["99|1|1|a|7790000000011|Leche|1|lt|X|10|10|1|lt|||"])
    with zipfile.ZipFile(path, "w") as z:
        z.writestr("__MACOSX/sepa_sabado/._coto.zip", b"no es un zip")    # archivo oculto de macOS
        z.writestr("sepa_sabado/roto.zip", b"PK\x03\x04 truncado")        # zip dañado: se saltea
        z.writestr("sepa_sabado/coto.zip", coto)
        z.writestr("sepa_sabado/otra.zip", otra)


def test_sepa_resumen():
    with tempfile.TemporaryDirectory() as t:
        p = Path(t) / "s.zip"; fake_zip(p)
        items = sf.summarize(p, STORES)
    assert len(items) == 1, items
    it = items[0]
    assert it["store"] == "coto" and it["ean"] == "7790000000011"
    assert it["price"] == 1850 and it["price_min"] == 1800 and it["price_max"] == 1900 and it["branches"] == 2
    assert it["promo"]["txt"] == "2x1" and it["promo"]["pu"] == 925


def test_diarco_barrio_y_mayorista():
    b = io.BytesIO()
    with zipfile.ZipFile(b, "w") as z:
        z.writestr("comercio.csv", "id_comercio|id_bandera|comercio_bandera_nombre\n5|1|DIARCO\n")
        z.writestr("sucursales.csv", "id_comercio|id_bandera|id_sucursal|sucursales_nombre|sucursales_provincia\n"
                   "5|1|1|DIARCO BARRIO RAMOS|AR-B\n5|1|2|DIARCO BARRIO MORON|AR-B\n5|1|3|DIARCO MAYORISTA LANUS|AR-B\n5|1|4|DIARCO AVELLANEDA|AR-B\n")
        z.writestr("productos.csv", PH + "\n" + "".join(f"5|1|{i}|a|7790000000011|Leche 1 L|1|lt|X|{p}|{p}|1|lt|||\n" for i, p in [(1, 2000), (2, 2100), (3, 1500), (4, 1600)]))
    with tempfile.TemporaryDirectory() as t:
        path = Path(t) / "s.zip"
        with zipfile.ZipFile(path, "w") as z:
            z.writestr("diarco.zip", b.getvalue())
        items = {i["store"]: i for i in sf.summarize(path, STORES)}
    assert items["diarcobarrio"]["price"] == 2050 and items["diarco"]["price"] == 1550, items


def test_formato_real_sepa():
    """Formato real: el código de barras va en id_producto y productos_ean es 1 (EAN) o 0 (código interno)."""
    r = {"id_producto": "7790580136260", "productos_ean": "1"}
    assert sf.barcode(r) == "7790580136260"
    assert sf.barcode({"id_producto": "0000000003136", "productos_ean": "0"}) is None
    assert sf.qty_from_name("ENERGIZ MONSTER ANANA 473 cc") == ("473", "CC")
    assert bd.size_of({"qty": 0.27, "unit": "gr.", "name": "jabon REXONA 3x90g PAS-270-gr."}) == (0.27, "kg")
    assert bd.size_of({"qty": 1, "unit": "uni", "name": "BASTONITOS KRACHITOS X 60 GRS"}) == (0.06, "kg")
    assert bd.nice_name("ALIM.P/GATOS SAB.CARNE WHISKAS BSA 8 KGM").startswith("Alim.p/gatos")
    assert bd.classify("NOODLES SABOR POLLO PICANTE KNORR X 72 GRS") == "almacen"
    assert bd.classify("ALIM.P/GATOS ADULTOS CARNE Y POLLO CAT CHOW BSA 8 KGM") == "bebes_mascotas"
    assert bd.classify("JABON E/POLVO MATIC FRAG.ROSAS GRANBY PAQ 3 KGM") == "limpieza"


def test_unidades_y_promos():
    assert bd.base_qty(500, "g") == (0.5, "kg") and bd.base_qty(2.25, "lt") == (2.25, "l") and bd.base_qty(900, "cc") == (0.9, "l")
    assert bd.promo_min_qty("3x2") == 3 and bd.promo_min_qty("Llevando 2, la 2da al 70%") == 2 and bd.promo_min_qty("2do al 50%") == 2
    assert bd.promo_min_qty("25% de descuento") == 1


def test_categorias():
    assert bd.classify("Detergente Magistral limón 500 ml") == "limpieza"
    assert bd.classify("Desodorante Rexona aerosol") == "perfumeria"
    assert bd.classify("Pañales Pampers G") == "bebes_mascotas"
    assert bd.classify("Yerba mate Playadito 1 kg") == "almacen"
    assert bd.classify("Leche entera 1 l") == "lacteos"


def test_cambio_e_inusual():
    hist = {"dates": [], "series": {}}
    base = {"store": "dia", "ean": "E1", "name": "Aceite 1,5 l", "brand": "N", "qty": 1.5, "unit": "l"}
    for d, p in [("2026-11-05", 4000), ("2026-11-06", 4000), ("2026-11-07", 1500)]:
        snap = {"date": d, "items": [dict(base, price=p)]}
        bd.update_history(hist, snap)
    prods = bd.build(snap, hist, STORES)
    o = prods[0]["offers"][0]
    assert o["chg"]["pct"] == -62.5 and o.get("anom") is True
    assert prods[0]["bu"] == "l"


def test_vtex_precio_online():
    prods = [{"linkText": "yerba-x", "items": [
        {"ean": "7790000000011", "itemId": "123", "images": [{"imageUrl": "https://img/x.jpg"}],
         "sellers": [{"sellerId": "1", "commertialOffer": {"Price": 1799.9, "ListPrice": 2200, "AvailableQuantity": 50}}]},
        {"ean": "7790000000999", "itemId": "9", "sellers": [{"commertialOffer": {"Price": 10, "AvailableQuantity": 0}}]}]}]
    d = of.parse_vtex(prods, "www.tienda.com")
    x = d["7790000000011"]
    assert x["price"] == 1800 and x["list"] == 2200 and x["sku"] == "123" and x["url"] == "https://www.tienda.com/yerba-x/p" and x["img"]
    assert "7790000000999" not in d   # sin stock


def test_precio_online_y_app():
    hist = {"dates": [], "series": {}}
    snap = {"date": "2026-11-08", "items": [
        {"store": "coto", "ean": "E2", "name": "Yerba 1 kg", "brand": "X", "qty": 1, "unit": "kg", "price": 5000, "price_online": 4600},
        {"store": "rappi", "ean": "E2", "name": "Yerba 1 kg", "brand": "X", "qty": 1, "unit": "kg", "price": None, "price_online": 5600}]}
    bd.update_history(hist, snap)
    offers = {o["s"]: o for o in bd.build(snap, hist, STORES)[0]["offers"]}
    assert offers["coto"]["p"] == 5000 and offers["coto"]["po"] == 4600
    assert "p" not in offers["rappi"] and offers["rappi"]["po"] == 5600


def test_historial_base_vieja_online_hoy():
    """Si la base oficial quedó en el 15/11, los precios online leídos el 22/11 van al 22/11 (no pisan el 15/11)."""
    hist = {"dates": ["2026-11-14"], "series": {}}
    snap = {"date": "2026-11-15", "items": [{"ean": "1", "store": "coto", "price": 100},
                                            {"ean": "1", "store": "dia", "price": None, "price_online": 90}]}
    bd.update_history(hist, snap, "2026-11-15")
    snap["items"][1]["price_online"] = 95
    bd.update_history(hist, snap, "2026-11-22")
    assert hist["dates"] == ["2026-11-14", "2026-11-15", "2026-11-22"], hist["dates"]
    assert hist["series"]["1"]["coto"][1] == 100 and len(hist["series"]["1"]["coto"]) == 2   # sucursal: solo su fecha
    assert hist["series"]["1"]["dia"] == [None, 90, 95]                                          # online: cada día el suyo
    manual = {"date": "2026-11-20", "items": [{"ean": "1", "store": "coto", "price": 110}]}
    bd.update_history(hist, manual)   # carga manual de un día anterior: va en su lugar, sin correr los demás
    assert hist["dates"] == ["2026-11-14", "2026-11-15", "2026-11-20", "2026-11-22"], hist["dates"]
    assert hist["series"]["1"]["coto"] == [None, 100, 110] and hist["series"]["1"]["dia"] == [None, 90, None, 95]
    # cada cadena va en la fecha de SUS precios (mayoristas cargados aparte, con otra fecha)
    mix = {"date": "2026-11-20", "fechas": {"coto": "2026-11-20", "makro": "2026-11-21"},
           "items": [{"ean": "1", "store": "coto", "price": 111}, {"ean": "1", "store": "makro", "price": 80}]}
    bd.update_history(hist, mix)
    assert hist["dates"] == ["2026-11-14", "2026-11-15", "2026-11-20", "2026-11-21", "2026-11-22"], hist["dates"]
    assert hist["series"]["1"]["coto"] == [None, 100, 111] and hist["series"]["1"]["makro"] == [None, None, None, 80]
    assert hist["series"]["1"]["dia"] == [None, 90, None, None, 95]
    bd.update_history(hist, {"date": "2026-11-01", "items": [{"ean": "1", "store": "coto", "price": 1}]})   # anterior a todo: no
    assert "2026-11-01" not in hist["dates"]


def test_promos_del_dia():
    """Correo de promos bancarias del día: día de la semana como la web (0 = domingo), vigencia, zona y medios."""
    import datetime as _dt
    sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "scripts"))
    import enviar_avisos as ea
    datos = {"medios": [{"id": "bna", "name": "Banco Nación"}, {"id": "modo", "name": "MODO"}], "formas_pago": {}, "promos": [
        {"id": "a", "medio": "bna", "stores": ["coto"], "dias": [3], "pct": 25, "tope": 10000, "desde": "2026-11-01", "hasta": "2026-11-30"},
        {"id": "b", "medio": "modo", "bancos": ["galicia"], "stores": ["dia", "lejos"], "dias": [3], "pct": 20},
        {"id": "c", "medio": "bna", "stores": ["coto"], "dias": [4], "pct": 30},                          # jueves: no
        {"id": "d", "medio": "bna", "stores": ["coto"], "dias": [3], "pct": 40, "hasta": "2026-11-20"},  # vencida
        {"id": "e", "medio": "anses", "stores": ["coto"], "dias": [3], "pct": 15, "requiere": ["jubilado"]},
        {"id": "f", "medio": "bna", "stores": ["coto"], "dias": [3], "pct": 0, "cuotas": 6}]}           # solo cuotas: no
    tiendas = {"coto": "Coto", "dia": "Día"}
    mie = _dt.date(2026, 11, 25)   # miércoles = 3
    todos = ea.promos_de_hoy(datos, tiendas, [], mie)
    assert [p["id"] for p in todos] == ["a", "b"], [p["id"] for p in todos]   # sin medios: todas menos las con requisitos
    assert todos[1]["stores"] == ["dia"]                                      # solo comercios de la zona
    assert [p["id"] for p in ea.promos_de_hoy(datos, tiendas, ["galicia"], mie)] == ["b"]   # banco que participa en MODO
    assert [p["id"] for p in ea.promos_de_hoy(datos, tiendas, ["anses", "jubilado"], mie)] == ["e"]
    assert ea.promos_de_hoy(datos, tiendas, ["bna"], _dt.date(2026, 11, 26))[0]["id"] == "c"   # jueves
    assert [p["id"] for p in ea.promos_de_hoy(datos, tiendas, [], mie, {"dia"})] == ["b"]   # solo «mis comercios»
    html_, titulo = ea.correo_promos(todos, datos, tiendas, [], mie)
    assert "2 descuentos para hoy miércoles 25/11" in titulo and "25%" in html_ and "Banco Nación" in html_ and "tope $" in html_


def test_nutricion_lectura():
    """Ficha de Jumbo y Open Food Facts -> registro para la web (tabla, ingredientes con abreviaturas, aptitudes)."""
    sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "scripts"))
    import nutricion as nu
    p = {"Ingredientes": ["'agua carbonatada', 'azúcar', 'jmaf', 'col 150 d', 'aci 338', 'aro', 'edu sucralosa'"],
         "Tabla Nutricional": ["{'basic_unit_name': 'ml', 'portion_text': '1 vaso', 'portion_value': 200, 'portion_unit_name': 'ml', "
                               "'energy_value': 60, 'energy_value_per_portion': 120, 'energy_unit_name': 'kCal', 'sugars_value': 15, "
                               "'sugars_value_per_portion': 30, 'sugars_unit_name': 'g', 'sodium_value': 12, 'sodium_value_per_portion': 24}"],
         "Condiciones Alimentarias": ["'cafeína'"],
         "Sellos": ["[{'certification_type_code': 'vegan', 'certification_type_name': 'Vegano'}]"]}
    r = nu.para_web(nu.parse_jumbo(p))
    assert nu.expandir("cons ins 202") == "conservante (INS 202)" and nu.expandir("rai: (ins 500ii)") == "leudante químico (INS 500ii)"
    assert nu.expandir("ac reg bicarbonato de sodio") == "regulador de acidez (bicarbonato de sodio)" and nu.expandir("sal") == "sal"
    assert r["ing"] == "agua carbonatada, azúcar, jarabe de maíz de alta fructosa, colorante (150 d), acidulante (338), aromatizante, edulcorante (sucralosa)", r["ing"]
    assert r["tab"]["base"] == "ml" and r["tab"]["porcion"] == 200 and r["tab"]["filas"][0] == ["Valor energético", 60, 120, "kcal"]
    assert ["Sodio", 12, 24, "mg"] in r["tab"]["filas"] and r["cond"] == ["cafeína"] and r["apto"] == ["Vegano"]
    assert nu.parse_jumbo({"Sellos": ["[]"]}) is None                         # sin tabla ni ingredientes: nada
    o = nu.parse_off({"ingredients_text": "harina de trigo,  azúcar", "nutriments": {"energy-kcal_100g": 450, "sugars_100g": 30,
                      "fat_100g": "20", "sodium_100g": 0.25, "proteins_100g": 6}})
    assert o["ing"] == "harina de trigo, azúcar" and ["Sodio", 250.0, None, "mg"] in o["tab"]["filas"]
    assert nu.parse_off({"nutriments": {"energy-kcal_100g": 1}}) is None       # tabla incompleta y sin ingredientes


# escenarios del monitoreo de la actualización (tests/test_monitor.py)
sys.path.insert(0, str(Path(__file__).resolve().parent))
import test_monitor as TM  # noqa: E402
globals().update({k: v for k, v in vars(TM).items() if k.startswith("test_")})


if __name__ == "__main__":
    fails = 0
    for name, fn in list(globals().items()):
        if name.startswith("test_"):
            try:
                fn(); print("ok  ", name)
            except Exception as e:
                fails += 1; print("FALLA", name, repr(e))
    sys.exit(1 if fails else 0)
