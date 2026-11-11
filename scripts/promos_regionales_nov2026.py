"""Promos de supermercados del INTERIOR que no están en MODO (noviembre 2026). Escribe data/promos_regionales.json.

Las promos que publica MODO (la mayoría de las regionales) se leen solas con scripts/modo_fetch.py.
Acá van las que hay que cargar a mano: las de la web de La Anónima y La Coope, Cuenta DNI en el interior
bonaerense, cuotas con tarjetas locales, promos de bancos de provincia fuera de MODO, etc.
Relevadas el 10/11/2026 (ver la planilla "Promos de supermercados por provincia - noviembre 2026").

Cada promo lleva "provincias": códigos ISO donde vale. Las cadenas sin precios en la web (La Gallega,
Alvear, comercios locales) van en "comercios" con su nombre, para mostrarlas en Descuentos.

Uso: python scripts/promos_regionales_nov2026.py
"""
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent

F = {
    "la": ("https://www.laanonima.com.ar/empresa/promociones-y-descuentos", "oficial", "2026-11-10"),
    "cv_la": ("https://www.convi.ar/promos-bancarias/la-anonima", "relevamiento", "2026-11-10"),
    "coope": ("https://www.cooperativaobrera.coop/financiacion-y-promos-bancarias/", "oficial", "2026-11-10"),
    "bna": ("https://semananacion.com.ar/semananacion/buscador?categoria=supermercados", "oficial", "2026-11-10"),
    "cv_gal": ("https://www.convi.ar/promos-bancarias/la-gallega", "relevamiento", "2026-11-10"),
    "cv_cor": ("https://www.convi.ar/promos-bancarias/cordiez", "relevamiento", "2026-11-10"),
    "cv_dino": ("https://www.convi.ar/promos-bancarias/dino", "relevamiento", "2026-11-10"),
    "cs_dia": ("https://calcularsueldo.com.ar/finanzas/16411/promos-dia-noviembre-2026.html", "prensa", "2026-11-02"),
    "cs_dni": ("https://calcularsueldo.com.ar/finanzas/16379/supermercados-cuenta-dni-noviembre-2026.html", "prensa", "2026-10-30"),
    "cs_mp": ("https://calcularsueldo.com.ar/?p=16359", "prensa", "2026-10-30"),
    "cba": ("https://puntoapunto.com.ar/el-gobierno-de-cordoba-sale-a-apuntalar-el-consumo-6-cuotas-sin-interes-y-creditos-por-20-000-millones", "prensa", "2026-11-10"),
    "btf": ("https://www.btf.com.ar/promociones/la-25/", "oficial", "2026-11-10"),
    "nbch": ("https://www.diarionorte.com/336115-se-suman-chances-para-ganar-12-millones-con-tuya", "prensa", "2026-11-10"),
    "macro": ("https://www.macro.com.ar/beneficios", "oficial", "2026-11-10"),
    "ln_dni": ("https://www.lanacion.com.ar/economia/promociones-y-ofertas-de-cuenta-dni-en-noviembre-2026-todos-los-beneficios-para-hacer-compras-con-nid02112026/", "prensa", "2026-11-02"),
}

MEDIOS = [  # medios nuevos del interior (los de AMBA ya están en promos_pago.json)
    ("bsantafe", "Banco Santa Fe", "banco"), ("bancor", "Bancor (Banco de Córdoba)", "banco"), ("bentrerios", "Banco Entre Ríos", "banco"),
    ("bcorrientes", "Banco de Corrientes", "banco"), ("bsantacruz", "Banco Santa Cruz", "banco"), ("bsanjuan", "Banco San Juan", "banco"),
    ("bpn", "BPN (Banco Provincia del Neuquén)", "banco"), ("bchubut", "Banco del Chubut", "banco"), ("bsantiago", "Banco Santiago del Estero", "banco"),
    ("blapampa", "Banco de La Pampa", "banco"), ("nbch", "Nuevo Banco del Chaco", "banco"), ("btf", "Banco de Tierra del Fuego", "banco"),
    ("brioja", "Banco Rioja", "banco"), ("bformosa", "Banco Formosa", "banco"), ("coinag", "Banco Coinag", "banco"),
    ("bmunicipal", "Banco Municipal de Rosario", "banco"), ("buepp", "Buepp (Banco Ciudad)", "billetera"), ("yoy", "YOY", "billetera"),
    ("bdino", "Banco Dino", "banco"), ("billeterasantafe", "Billetera Santa Fe / Plus Pagos", "billetera"),
    ("cordobesa", "Tarjeta Cordobesa (Bancor)", "tarjeta"), ("tlaanonima", "Tarjeta La Anónima", "tarjeta"),
    ("sucredito", "Tarjeta Sucrédito", "tarjeta"), ("credimas", "Tarjeta Credimas", "tarjeta"), ("favacard", "Favacard / Elebar", "tarjeta"),
    ("tuya", "Tarjeta Tuya (Nuevo Banco del Chaco)", "tarjeta"), ("sidecreer", "Tarjeta Sidecreer", "tarjeta"),
    ("tdino", "Tarjeta Dino", "tarjeta"), ("mutualcard", "Mutualcard Cabal", "tarjeta"),
]

COMERCIOS = {  # cadenas y grupos sin precios en la web
    "lagallega": {"name": "La Gallega"},
    "alvear": {"name": "Alvear"},
    "cordiez": {"name": "Cordiez"},
    "dino": {"name": "Dino"},
    "m-cordobaimpulsa": {"name": "Supermercados adheridos a Córdoba Impulsa",
                         "lista": {"AR-X": ["Mariano Max", "Cordiez Super Top", "Super Mami", "Almacor", "Buenos Días", "Luconi",
                                            "Hnos Becerra", "Súper Dos", "Súper Granja", "Súper Mac"]}},
    "m-bonaerenses": {"name": "Supermercados del interior bonaerense",
                      "lista": {"AR-B": ["5mentarios", "Don Luis", "La Amistad", "Sabor Criollo", "Autoservicio 228", "Actual", "Red Minicosto"]}},
    "supercoop": {"name": "Supercoop"},
    "m-btf": {"name": "Comercios adheridos (La 25, Supermercado Belgrano y otros)"},
    "m-tuya": {"name": "Supermercados, despensas y almacenes adheridos a Tuya"},
    "m-macro-cba": {"name": "Supermercados locales de Córdoba (Macro)",
                    "lista": {"AR-X": ["Villa María Supermercados", "Río Cuarto Supermercado", "Justiniano Posse", "La Carlota Supermercados"]}},
    "m-macro-sf": {"name": "Supermercados locales de Santa Fe (Macro)",
                   "lista": {"AR-S": ["Supermercado Giro (Ceres, Colonia Alpina, Humberto Primo)", "Frioteka Rafaela"]}},
    "m-macro-otros": {"name": "Supermercados locales (Macro)",
                      "lista": {"AR-U": ["Trelew"], "AR-V": ["Distri TDF"], "AR-J": ["La Cumbre Sanjuanina"]}},
    "m-cualquiera": {"name": "Cualquier supermercado que acepte MODO"},
}

CR, DB, MO, QR, QRT, NFC, OT, PR, VC = ("credito_fisica", "debito_fisica", "qr_modo", "qr_billetera", "qr_billetera_tarjeta",
                                        "nfc", "online_tarjeta", "presentar", "ver_condiciones")
LUN, MAR, MIE, JUE, VIE, SAB, DOM = 1, 2, 3, 4, 5, 6, 0
TODOS = [0, 1, 2, 3, 4, 5, 6]
LA_PROVS = ["AR-B", "AR-R", "AR-Q", "AR-U", "AR-Z", "AR-V", "AR-L", "AR-S", "AR-X", "AR-A", "AR-G", "AR-T", "AR-J", "AR-W", "AR-H", "AR-N", "AR-Y", "AR-K", "AR-D"]
TODAS = ["AR-C", "AR-B", "AR-K", "AR-H", "AR-U", "AR-X", "AR-W", "AR-E", "AR-P", "AR-Y", "AR-L", "AR-F", "AR-M", "AR-N", "AR-Q", "AR-R",
         "AR-A", "AR-J", "AR-D", "AR-Z", "AR-S", "AR-G", "AR-T", "AR-V"]
COOPE = ["AR-B", "AR-L", "AR-R", "AR-Q", "AR-U", "AR-S", "AR-X"]
P = []


def add(medio, stores, dias, pct, fuente, provincias, *, tope=None, per=None, minimo=0, canal="tienda", pago=(VC,), reintegro=None,
        nota=None, cuotas=None, requiere=(), desde="2026-11-01", hasta="2026-11-30", bancos=()):
    url, tipo, fecha = F[fuente]
    P.append({"id": f"r{len(P) + 1:03d}", "medio": medio, "stores": list(stores), "dias": list(dias), "pct": pct, "tope": tope,
              "periodo_tope": per, "minimo": minimo, "canal": canal, "pago": list(pago), "reintegro": reintegro, "nota": nota,
              "cuotas": cuotas, "requiere": list(requiere), "desde": desde, "hasta": hasta, "fuente": url, "fuente_tipo": tipo,
              "verificado": fecha, "ejemplo": False, "bancos": list(bancos), "provincias": list(provincias)})


# ---------- La Anónima (web oficial) ----------
add("patagonia", ["laanonima"], [LUN, JUE], 30, "la", LA_PROVS, tope=20000, per="mes", pago=(NFC,), reintegro="reintegro",
    desde="2026-09-07", hasta="2026-12-31", nota="Con tarjeta de crédito Visa del Patagonia pagando con el celular (NFC).")
add("columbia", ["laanonima"], [MAR], 20, "la", LA_PROVS, tope=15000, per="mes", pago=(CR,), reintegro="reintegro",
    desde="2026-10-01", hasta="2027-03-31", nota="Tarjetas de crédito Visa y Mastercard. Tope por cuenta.")
add("bchubut", ["laanonima"], [MIE], 20, "la", ["AR-U"], tope=10000, per="mes", pago=(CR,), reintegro="reintegro",
    hasta="2027-01-31", nota="Tarjeta de crédito Patagonia 365. Solo sucursales de Chubut.")
add("cuentadni", ["laanonima"], [MIE], 10, "ln_dni", ["AR-B"], tope=5000, per="dia", minimo=25000, pago=(QR,), reintegro="en la caja",
    bancos=["provincia"], nota="Jubilados que cobran por Cuenta DNI: 5% más.")
add("jubilados", ["laanonima"], TODOS, 10, "la", LA_PROVS, pago=(DB,), reintegro="en la caja",
    nota="Jubilados y pensionados de ANSES, con la tarjeta de débito de la cuenta donde cobran. Excluye algunos productos.")
add("tlaanonima", ["laanonima"], TODOS, 0, "la", LA_PROVS, pago=(CR,), cuotas=3, hasta="2026-11-30",
    nota="Exclusivo clientes Plus. Hasta 4 cuotas en sucursales del norte, Córdoba y Rosario. No vale en sucursales Libertad.")
add("btf", ["laanonima"], TODOS, 0, "la", ["AR-V", "AR-Z"], pago=(CR,), cuotas=3,
    nota="Tarjetas Fueguina Visa y Master. Solo en Tierra del Fuego, Río Gallegos y El Calafate.")
add("bancor", ["laanonima"], TODOS, 0, "la", ["AR-X"], pago=(CR,), cuotas=4, hasta="2026-12-31",
    nota="Visa y Master de Bancor. Sucursales de Laboulaye, Morteros, Arroyito, Marcos Juárez y Córdoba capital.")
add("naranjax", ["laanonima"], TODOS, 0, "la", ["AR-W", "AR-H", "AR-X", "AR-J", "AR-T", "AR-A", "AR-G", "AR-N", "AR-S"], pago=(CR,), cuotas=4,
    nota="Solo en las sucursales del norte, Córdoba, San Juan, Posadas y Santa Fe que nombra la web de La Anónima.")
add("mp", ["laanonima"], TODOS, 0, "la", LA_PROVS, minimo=50000, pago=(QRT,), cuotas=3,
    nota="Con la tarjeta de crédito Mercado Pago por QR: 2 cuotas desde $50.000 y 3 cuotas desde $150.000.")
add("sucredito", ["laanonima"], TODOS, 0, "la", ["AR-X", "AR-A", "AR-G", "AR-T"], pago=(CR,), cuotas=4,
    nota="Vale también en las sucursales Libertad.")
add("credimas", ["laanonima"], TODOS, 0, "la", ["AR-A", "AR-T", "AR-G"], pago=(CR,), cuotas=3,
    nota="En Tucumán también Tarjeta Titanio y en Santiago del Estero Tarjeta Única.")
add("favacard", ["laanonima"], TODOS, 0, "la", ["AR-B"], pago=(CR,), cuotas=3, hasta="2026-12-31",
    nota="Sucursales de Trenque Lauquen, Azul, 9 de Julio, Pehuajó, Carlos Casares y otras del oeste bonaerense.")
add("bna", ["laanonima"], [VIE, SAB], 20, "bna", LA_PROVS, tope=15000, per="mes", minimo=50000, pago=(MO,), reintegro="reintegro",
    bancos=["bna"], nota="Con BNA+ MODO.")

# ---------- La Coope (web oficial) ----------
add("credicoop", ["coope"], [MAR], 30, "coope", COOPE, pago=(MO,), reintegro="reintegro", hasta="2026-12-31",
    nota="Con Cabal Credicoop por MODO. Excluye carnes, pescados, hogar y tecnología.")
add("bna", ["coope"], [MIE], 20, "bna", COOPE, tope=15000, per="mes", pago=(MO,), reintegro="reintegro", desde="2026-11-04",
    hasta="2026-12-31", bancos=["bna"], nota="Con BNA+ MODO.")
add("macro", ["coope"], [MIE], 20, "coope", COOPE, tope=15000, per="mes", pago=(MO, CR), reintegro="reintegro",
    nota="25% con Platinum (tope $20.000) y 30% con Selecta (tope $25.000). Excluye carnes, pollos, pescados, hogar y tecnología.")
add("galicia", ["coope"], [VIE], 25, "coope", COOPE, pago=(MO,), reintegro="reintegro",
    nota="Con Mastercard de crédito Galicia por MODO. 30% para Eminent.")
add("blapampa", ["coope"], [LUN, MIE, VIE, SAB], 25, "coope", ["AR-L"], tope=25000, per="semana", pago=(CR,), reintegro="reintegro",
    nota="Tarjetas de crédito del Banco de La Pampa (los miércoles, con Billetera Pampa).")
add("cuentadni", ["coope"], [VIE, SAB], 15, "cs_dni", ["AR-B"], pago=(QR,), reintegro="en la caja", bancos=["provincia"],
    nota="Solo sucursales de Lobos y La Plata.")

# ---------- Santa Fe ----------
add("bna", ["lagallega"], [LUN], 25, "bna", ["AR-S"], tope=20000, per="mes", pago=(MO,), reintegro="reintegro", desde="2026-11-02",
    bancos=["bna"], nota="Con BNA+ MODO.")
add("billeterasantafe", ["lagallega"], TODOS, 20, "cv_gal", ["AR-S"], tope=10000, per="mes", minimo=90000, pago=(QR,), reintegro="reintegro")
add("supervielle", ["lagallega"], [LUN], 20, "cv_gal", ["AR-S"], tope=15000, per="mes", pago=(MO,), reintegro="reintegro")
add("naranjax", ["lagallega"], [MAR], 20, "cv_gal", ["AR-S"], tope=3000, per="semana", pago=(QR,), reintegro="reintegro",
    nota="Hasta 25% según el plan de Naranja X.")
add("galicia", ["lagallega"], [MAR], 20, "cv_gal", ["AR-S"], tope=5000, per="mes", pago=(QRT,), reintegro="reintegro")
add("credicoop", ["lagallega"], [MIE], 30, "cv_gal", ["AR-S"], tope=9000, per="semana", pago=(MO,), reintegro="reintegro")
add("bmunicipal", ["lagallega"], [JUE], 20, "cv_gal", ["AR-S"], tope=18000, per="mes", pago=(CR,), reintegro="reintegro")
add("jubilados", ["lagallega"], [JUE, SAB], 10, "cv_gal", ["AR-S"], pago=(PR,), reintegro="en la caja", nota="Con registro previo en la cadena.")
add("bsantafe", ["lagallega"], [VIE], 30, "cv_gal", ["AR-S"], tope=25000, per="mes", pago=(CR,), reintegro="reintegro",
    nota="Clientes con paquete del Banco Santa Fe.")
add("coinag", ["lagallega"], [VIE], 20, "cv_gal", ["AR-S"], tope=14000, per="mes", pago=(CR,), reintegro="reintegro")
add("bna", ["alvear"], [LUN], 25, "bna", ["AR-S", "AR-E"], tope=6000, per="semana", minimo=24000, pago=(MO,), reintegro="reintegro",
    desde="2026-11-02", bancos=["bna"], nota="Con BNA+ MODO.")

# ---------- Córdoba ----------
add("cordobesa", ["marianomax", "m-cordobaimpulsa"], TODOS, 0, "cba", ["AR-X"], pago=(CR,), cuotas=6, desde="2026-09-01",
    hasta="2027-01-31", nota="Programa Córdoba Impulsa, en las sucursales adheridas.")
add("credicoop", ["cordiez"], [MIE], 20, "cv_cor", ["AR-X"], tope=3000, per="compra", pago=(MO,), reintegro="reintegro",
    hasta="2026-12-31", nota="Solo la primera compra.")
add("tdino", ["dino"], TODOS, 5, "cv_dino", ["AR-X"], pago=(CR,), reintegro="en la caja", nota="Tarjeta Dino Mastercard.")
add("macro", ["m-macro-cba"], [MIE], 20, "macro", ["AR-X"], tope=15000, per="mes", pago=(CR, MO, NFC), reintegro="reintegro",
    desde="2026-10-01", hasta="2026-12-31", nota="Con tarjeta de crédito Macro. 25% con Platinum (tope $20.000) y 30% con Selecta (tope $25.000).")
add("macro", ["m-macro-sf"], [MIE], 20, "macro", ["AR-S"], tope=15000, per="mes", pago=(CR, MO, NFC), reintegro="reintegro",
    desde="2026-10-01", hasta="2026-12-31", nota="Con tarjeta de crédito Macro, según nivel hasta 30%. En Frioteka Rafaela es los jueves.")
add("macro", ["m-macro-otros"], [MIE], 20, "macro", ["AR-U", "AR-V", "AR-J"], tope=15000, per="mes", pago=(CR, MO, NFC), reintegro="reintegro",
    desde="2026-10-01", hasta="2026-12-31", nota="Con tarjeta de crédito Macro, según nivel hasta 30%.")
add("macro", ["m-cualquiera"], [MIE], 30, "macro", TODAS, tope=80000, per="mes",
    pago=(MO,), reintegro="reintegro", hasta="2027-03-31",
    nota="Solo clientes Macro Selecta nivel 3 (tope $80.000) y nivel 4 (tope $120.000), con crédito por MODO.")

# ---------- Entre Ríos, Corrientes, Chaco, Tierra del Fuego ----------
add("sidecreer", ["dia"], [DOM], 25, "cs_dia", ["AR-E"], tope=5000, per="compra", pago=(CR,), reintegro="en la caja", desde="2026-07-01",
    cuotas=3, nota="25% con Black (tope $5.000), 20% con Platinum ($3.000) y 10% con Verde ($2.000). Solo tiendas de Entre Ríos.")
add("bcorrientes", ["dia"], [MAR, JUE], 30, "cs_dia", ["AR-W"], tope=20000, per="mes", pago=(MO,), reintegro="reintegro", cuotas=3,
    nota="Con MásBanCo por MODO. Solo tiendas de Corrientes.")
add("tuya", ["m-tuya"], TODOS, 0, "nbch", ["AR-H"], pago=(CR,), cuotas=3, nota="Consultá la lista de comercios en promociones.nbch.com.ar.")
add("btf", ["m-btf"], TODOS, 0, "btf", ["AR-V"], pago=(CR,), cuotas=3, nota="Tarjetas Fueguina.")

# ---------- Interior bonaerense ----------
add("cuentadni", ["m-bonaerenses"], [MAR, MIE], 15, "cs_dni", ["AR-B"], tope=6000, per="semana", minimo=30000, pago=(QR,),
    reintegro="en la caja", bancos=["provincia"])
add("cuentadni", ["supercoop"], [VIE, SAB], 15, "ln_dni", ["AR-B"], pago=(QR,), reintegro="en la caja", bancos=["provincia"])
add("mp", ["toledo"], TODOS, 0, "cs_mp", ["AR-B"], pago=(QRT,), cuotas=3)


def main():
    out = {"_comentario": "Promos regionales cargadas a mano (las de MODO van en promos_modo.json). provincias: códigos ISO donde vale.",
           "relevado": "2026-11-10", "medios": [{"id": i, "name": n, "tipo": t} for i, n, t in MEDIOS],
           "comercios": COMERCIOS, "promos": P}
    p = ROOT / "data" / "promos_regionales.json"
    p.write_text(json.dumps(out, ensure_ascii=False, indent=1), encoding="utf-8")
    print(f"OK: {len(P)} promos regionales")


if __name__ == "__main__":
    main()
