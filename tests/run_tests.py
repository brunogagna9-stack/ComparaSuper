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
    prods = [{"items": [{"ean": "7790000000011", "sellers": [{"commertialOffer": {"Price": 1799.9, "AvailableQuantity": 50}}]},
                        {"ean": "7790000000999", "sellers": [{"commertialOffer": {"Price": 10, "AvailableQuantity": 5}}]}]}]
    assert of.parse_vtex(prods, "7790000000011") == 1800
    sin_stock = [{"items": [{"ean": "1", "sellers": [{"commertialOffer": {"Price": 5, "AvailableQuantity": 0}}]}]}]
    assert of.parse_vtex(sin_stock, "1") is None and of.parse_vtex([], "1") is None


def test_precio_online_y_app():
    hist = {"dates": [], "series": {}}
    snap = {"date": "2026-11-08", "items": [
        {"store": "coto", "ean": "E2", "name": "Yerba 1 kg", "brand": "X", "qty": 1, "unit": "kg", "price": 5000, "price_online": 4600},
        {"store": "rappi", "ean": "E2", "name": "Yerba 1 kg", "brand": "X", "qty": 1, "unit": "kg", "price": None, "price_online": 5600}]}
    bd.update_history(hist, snap)
    offers = {o["s"]: o for o in bd.build(snap, hist, STORES)[0]["offers"]}
    assert offers["coto"]["p"] == 5000 and offers["coto"]["po"] == 4600
    assert "p" not in offers["rappi"] and offers["rappi"]["po"] == 5600


if __name__ == "__main__":
    fails = 0
    for name, fn in list(globals().items()):
        if name.startswith("test_"):
            try:
                fn(); print("ok  ", name)
            except Exception as e:
                fails += 1; print("FALLA", name, repr(e))
    sys.exit(1 if fails else 0)
