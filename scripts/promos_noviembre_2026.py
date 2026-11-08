"""Carga en data/promos_pago.json los descuentos REALES de noviembre 2026 (CABA y GBA).

Relevados el 08/11/2026. Cada promo lleva su fuente:
  - "oficial": página del banco, billetera o comercio.
  - "relevamiento": sitio que copia las condiciones de las páginas oficiales (convi.ar).
  - "prensa": nota periodística que resume la grilla del mes.
Cuando dos fuentes no coinciden se usó la más nueva. Las promos que solo valen en otras provincias
no se cargaron. Para el mes siguiente: copiar este archivo, cambiar las promos y correrlo.

Uso: python scripts/promos_noviembre_2026.py
"""
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent

F = {  # fuentes: (url, tipo, fecha en que se verificó)
    "cv_carrefour": ("https://www.convi.ar/promos-bancarias/carrefour", "relevamiento", "2026-11-07"),
    "cv_coto": ("https://www.convi.ar/promos-bancarias/coto", "relevamiento", "2026-11-07"),
    "cv_jumbo": ("https://www.convi.ar/promos-bancarias/jumbo", "relevamiento", "2026-11-07"),
    "cv_disco": ("https://www.convi.ar/promos-bancarias/disco", "relevamiento", "2026-11-07"),
    "cv_vea": ("https://www.convi.ar/promos-bancarias/vea", "relevamiento", "2026-11-07"),
    "cv_mas": ("https://www.convi.ar/promos-bancarias/masonline", "relevamiento", "2026-11-08"),
    "cs_dia": ("https://calcularsueldo.com.ar/finanzas/16411/promos-dia-noviembre-2026.html", "prensa", "2026-11-02"),
    "cs_bna": ("https://calcularsueldo.com.ar/finanzas/16394/supermercados-banco-nacion-renueva-descuentos-en-tus-compras-de-noviembre-2026.html", "prensa", "2026-11-01"),
    "cs_mp": ("https://calcularsueldo.com.ar/finanzas/16359/supermercados-mercado-pago-la-guia-completa-de-descuentos-y-cuotas-por-dia.html", "prensa", "2026-10-30"),
    "cs_dni": ("https://calcularsueldo.com.ar/finanzas/16379/supermercados-cuenta-dni-noviembre-2026.html", "prensa", "2026-10-30"),
    "cs_carrefour": ("https://calcularsueldo.com.ar/?p=16402", "prensa", "2026-11-02"),
    "cs_galicia": ("https://calcularsueldo.com.ar/finanzas/16396/descuentos-supermercados-galicia-noviembre-2026.html", "prensa", "2026-11-02"),
    "bp": ("https://www.bancoprovincia.com.ar/Noticias/MasNoticias/todas-las-promociones-de-cuenta-dni-en-supermercados-3031", "oficial", "2026-11-06"),
    "nini": ("https://www.nini.com.ar/promociones", "oficial", "2026-11-08"),
    "hipo": ("https://www.hipotecario.com.ar/alianzas-bh/changomas/", "oficial", "2026-11-08"),
}

MEDIOS = [
    ("bna", "Banco Nación", "banco"), ("ciudad", "Banco Ciudad", "banco"), ("columbia", "Banco Columbia", "banco"),
    ("comafi", "Banco Comafi", "banco"), ("credicoop", "Credicoop", "banco"), ("hipotecario", "Banco Hipotecario", "banco"),
    ("icbc", "ICBC", "banco"), ("patagonia", "Banco Patagonia", "banco"), ("supervielle", "Supervielle", "banco"),
    ("galicia", "Galicia", "banco"),
    ("cencopay", "CencoPay", "billetera"), ("cuentacarrefour", "Carrefour Banco (cuenta digital)", "billetera"),
    ("cuentadni", "Cuenta DNI", "billetera"), ("mp", "Mercado Pago", "billetera"), ("modo", "MODO", "billetera"),
    ("naranjax", "Naranja X", "billetera"), ("personalpay", "Personal Pay", "billetera"),
    ("naranja", "Tarjeta Naranja (Plan Z)", "tarjeta"), ("tcarrefour", "Tarjeta Carrefour (crédito)", "tarjeta"),
    ("tci", "Tarjeta Coto TCI", "tarjeta"), ("credito", "Cualquier tarjeta de crédito", "tarjeta"),
    ("ciudadania", "Ciudadanía Porteña", "programa"), ("clublanacion", "Club La Nación", "programa"),
    ("comunidadcoto", "Comunidad Coto", "programa"), ("jubilados", "Jubilados y pensionados (ANSES)", "programa"),
    ("masclub", "MasClub (ChangoMás)", "programa"), ("micarrefour", "Mi Carrefour", "programa"),
    ("todos", "Cualquier medio de pago", "general"),
]

PAGO = {
    "credito_fisica": {"t": "Tarjeta de crédito física", "d": "Pasando el plástico por el posnet de la caja. Si pagás con QR o con el celular, NO aplica.", "i": "💳"},
    "debito_fisica": {"t": "Tarjeta de débito física", "d": "Pasando la tarjeta de débito por el posnet. Con crédito o con QR no aplica.", "i": "💳"},
    "qr_modo": {"t": "QR con MODO", "d": "Con la tarjeta del banco cargada en MODO (o en la app del banco con MODO), escaneando el QR de la caja. Con el plástico NO aplica.", "i": "📱"},
    "qr_billetera": {"t": "QR de la billetera, con dinero en cuenta", "d": "Abrís la app de la billetera, escaneás el QR de la caja y pagás con la plata que tenés en la cuenta.", "i": "📱"},
    "qr_billetera_tarjeta": {"t": "QR de la billetera, con tarjeta", "d": "Escaneando el QR con la app de la billetera, pero eligiendo pagar con una tarjeta cargada en ella.", "i": "📱"},
    "nfc": {"t": "Celular contactless (NFC)", "d": "Acercando el celular al posnet, sin escanear nada. Necesitás la tarjeta cargada en la app y el NFC activado (en general, solo Android).", "i": "📶"},
    "cuenta_digital": {"t": "Con la cuenta digital del banco", "d": "Pagando con el saldo o la tarjeta de la cuenta digital del banco de la cadena.", "i": "🏦"},
    "online_tarjeta": {"t": "Compra online con tarjeta", "d": "Comprando en la página o app del súper y pagando ahí con la tarjeta.", "i": "🛒"},
    "online_billetera": {"t": "Compra online con la billetera", "d": "Comprando en la página o app del súper y eligiendo la billetera como medio de pago.", "i": "🛒"},
    "presentar": {"t": "Identificándote como socio o beneficiario", "d": "Mostrás la tarjeta, la app o el DNI en la caja (u online, el cupón del club) y pagás con cualquier medio.", "i": "🪪"},
    "ver_condiciones": {"t": "Medio de pago a confirmar", "d": "La fuente no aclara si es con tarjeta física, QR o celular: revisá las condiciones antes de pagar.", "i": "❔"},
}
TIPOS = {"banco": "Bancos", "billetera": "Billeteras virtuales", "tarjeta": "Tarjetas", "programa": "Clubes y beneficios", "general": "Para todos"}

CR, DB, MO, QR, QRT, NFC, CD, OT, OB, PR, VC = ("credito_fisica", "debito_fisica", "qr_modo", "qr_billetera", "qr_billetera_tarjeta",
                                               "nfc", "cuenta_digital", "online_tarjeta", "online_billetera", "presentar", "ver_condiciones")
LUN, MAR, MIE, JUE, VIE, SAB, DOM = 1, 2, 3, 4, 5, 6, 0
TODOS = [0, 1, 2, 3, 4, 5, 6]
P = []


def add(medio, stores, dias, pct, fuente, *, tope=None, per=None, minimo=0, canal="tienda", pago=(VC,), reintegro=None,
        nota=None, cuotas=None, requiere=(), desde="2026-11-01", hasta="2026-11-30"):
    url, tipo, fecha = F[fuente]
    P.append({"id": f"n{len(P) + 1:03d}", "medio": medio, "stores": list(stores), "dias": list(dias), "pct": pct, "tope": tope,
              "periodo_tope": per, "minimo": minimo, "canal": canal, "pago": list(pago), "reintegro": reintegro, "nota": nota,
              "cuotas": cuotas, "requiere": list(requiere), "desde": desde, "hasta": hasta,
              "fuente": url, "fuente_tipo": tipo, "verificado": fecha, "ejemplo": False})


# ---------- Carrefour ----------
add("tcarrefour", ["carrefour"], [DOM, LUN, MIE, JUE, VIE, SAB], 15, "cv_carrefour", canal="ambos", pago=(CR, OT), reintegro="en la caja")
add("tcarrefour", ["carrefour"], [MAR], 20, "cv_carrefour", canal="ambos", pago=(CR, OT), reintegro="en la caja")
add("cuentacarrefour", ["carrefour"], [VIE], 15, "cv_carrefour", canal="ambos", pago=(CD,), reintegro="en la caja")
add("cuentacarrefour", ["carrefour", "carrefourmaxi"], [SAB, DOM], 10, "cs_carrefour", canal="ambos", pago=(CD,), reintegro="en la caja",
    nota="En Carrefour Maxi no se acumula con otras promociones.")
add("cuentacarrefour", ["carrefour"], [JUE], 20, "cv_carrefour", tope=10000, per="semana", canal="online", pago=(OT,), reintegro="en la caja")
add("clublanacion", ["carrefour"], [LUN], 15, "cv_carrefour", canal="ambos", pago=(PR,), reintegro="en la caja")
add("clublanacion", ["carrefour"], [MAR, MIE, JUE, VIE, SAB, DOM], 10, "cv_carrefour", canal="online", pago=(PR,), reintegro="en la caja",
    nota="Solo entrega inmediata, según la zona. Hay que registrarse 24 horas antes.")
add("micarrefour", ["carrefour"], [LUN, MAR, MIE], 10, "cv_carrefour", tope=35000, per="mes", canal="ambos", pago=(PR,),
    reintegro="reintegro", requiere=["jubilados"], nota="Para socios de Mi Carrefour que cobran por ANSES o tienen más de 60 años.")
add("patagonia", ["carrefour"], [MIE], 15, "cv_carrefour", tope=10000, per="mes", canal="online", pago=(OT,), reintegro="reintegro",
    nota="Con cuenta sueldo o carteras Plus/Singular el descuento sube hasta 35%.")
add("cuentadni", ["carrefour"], [MIE], 10, "cv_carrefour", minimo=20000, pago=(QR,), reintegro="en la caja",
    nota="Jubilados que cobran por Cuenta DNI: 5% adicional.")
add("mp", ["carrefour"], [JUE], 15, "cv_carrefour", minimo=20000, pago=(QR, QRT), reintegro="en la caja", nota="Acumulable con las ofertas del súper.")
add("mp", ["carrefour", "carrefourmaxi"], [VIE], 10, "cv_carrefour", pago=(QR, QRT), reintegro="en la caja")
add("todos", ["carrefour"], [JUE], 10, "cv_carrefour", tope=8000, per="semana", canal="online", pago=(OT, OB), reintegro="en la caja", nota="Exclusivo compra online.")
add("mp", ["carrefour"], TODOS, 0, "cs_carrefour", minimo=150000, pago=(QRT,), cuotas=3, nota="3 cuotas sin interés pagando con el QR de Mercado Pago.")
add("naranjax", ["carrefour"], TODOS, 0, "cs_carrefour", pago=(CR,), cuotas=4, nota="Con tarjeta Naranja X, solo en tiendas físicas.")

# ---------- Coto ----------
add("ciudad", ["coto"], [LUN], 25, "cv_coto", tope=30000, per="compra", canal="ambos", pago=(MO, OT), reintegro="reintegro",
    nota="En sucursal pagando con MODO desde la app del Ciudad; online con crédito Visa, Mastercard o Cabal.")
add("icbc", ["coto"], [LUN], 20, "cv_coto", tope=15000, per="compra", canal="online", pago=(OT,), reintegro="reintegro",
    nota="Con Plan Sueldo ICBC: 30%, tope $20.000.")
add("icbc", ["coto"], [JUE], 20, "cv_coto", pago=(DB,), reintegro="reintegro", nota="Con débito Visa ICBC.")
add("jubilados", ["coto"], [LUN, MAR, MIE, JUE], 10, "cv_coto", pago=(CR, DB), reintegro="en la caja",
    nota="Beneficios ANSES, con tarjeta de crédito o débito. No vale en Coto Digital.")
add("jubilados", ["coto"], [JUE], 15, "cv_coto", pago=(PR,), reintegro="en la caja", nota="Presentando el DNI; cualquier medio de pago.")
add("comafi", ["coto"], [MAR], 35, "cv_coto", pago=(MO,), reintegro="reintegro", nota="Online: 35% con tope $15.000 por compra.")
add("supervielle", ["coto"], [MAR], 30, "cv_coto", pago=(MO,), reintegro="reintegro", nota="Online: 20% con crédito o débito Visa.")
add("supervielle", ["coto"], [SAB, DOM], 20, "cv_coto", tope=10000, per="compra", pago=(MO,), reintegro="reintegro",
    nota="Con crédito, pagando con MODO desde la app de Supervielle. Clientes Identité: 25%, tope $15.000.")
add("columbia", ["coto"], [MAR], 30, "cv_coto", pago=(MO,), reintegro="reintegro")
add("columbia", ["coto"], [JUE], 30, "cv_coto", canal="ambos", pago=(CR, OT), reintegro="reintegro")
add("credicoop", ["coto"], [MAR], 30, "cv_coto", canal="ambos", pago=(MO, OT), reintegro="reintegro",
    nota="En sucursal con MODO desde la app Credicoop (Cabal o Visa Credicoop); online con Cabal.")
add("tci", ["coto"], [MAR], 20, "cv_coto", canal="online", pago=(OT,), reintegro="reintegro")
add("ciudadania", ["dia"], [LUN, JUE], 15, "cs_dia", pago=(PR,), reintegro="en la caja", nota="Solo en sucursales de CABA.")
add("ciudadania", ["coto"], [MAR, JUE], 15, "cv_coto", pago=(PR,), reintegro="en la caja", nota="Solo en sucursales de CABA.")
add("naranjax", ["coto", "jumbo", "disco", "vea", "dia", "changomas"], [MAR], 20, "cv_coto", tope=3000, per="semana", canal="ambos",
    pago=(CR, DB, OT), reintegro="reintegro", nota="Plan Inicial. Con Plan Turbo: 25% (tope $9.500); con Plan Épico: 30% (tope $12.000).")
add("comunidadcoto", ["coto"], [MIE], 15, "cv_coto", canal="ambos", pago=(PR,), reintegro="en la caja", nota="Para socios de Comunidad Coto (es gratis).")
add("patagonia", ["coto"], [JUE], 20, "cv_coto", tope=25000, per="compra", canal="online", pago=(OT,), reintegro="reintegro")
add("mp", ["coto"], [VIE], 25, "cv_coto", pago=(QR, QRT), reintegro="en la caja")
add("mp", ["coto"], [SAB, DOM], 20, "cv_coto", pago=(QR, QRT), reintegro="en la caja")
add("ciudad", ["coto"], [SAB, DOM], 20, "cv_coto", canal="ambos", pago=(DB, OT), reintegro="reintegro", nota="Con débito Visa o Maestro.")
add("bna", ["coto"], [MAR], 25, "cs_bna", pago=(MO,), reintegro="reintegro", nota="Con Visa crédito o débito del Nación, en BNA+ MODO.")
add("galicia", ["coto", "changomas"], TODOS, 0, "cs_galicia", canal="ambos", pago=(CR, OT), cuotas=18,
    nota="Hasta 18 cuotas con Mastercard Galicia; hasta 12 con Visa o American Express.")

# ---------- Jumbo, Disco y Vea (Cencosud) ----------
add("cencopay", ["jumbo", "disco", "vea"], [LUN], 25, "cv_jumbo", tope=15000, per="mes", pago=(CR,), reintegro="en la caja", nota="CencoPay Cuenta, con crédito.")
add("cencopay", ["jumbo", "disco", "vea"], [MIE], 20, "cv_jumbo", canal="ambos", pago=(CR, OT), reintegro="en la caja")
add("hipotecario", ["jumbo", "disco"], [MAR], 25, "cv_jumbo", tope=15000, per="mes", pago=(MO,), reintegro="reintegro")
add("modo", ["jumbo"], [MAR, JUE], 20, "cv_jumbo", tope=25000, per="mes", minimo=100000, canal="ambos", pago=(MO, OB), reintegro="reintegro",
    nota="El tope es por banco: con tarjetas de dos bancos distintos podés sumar dos topes.")
add("modo", ["disco"], [VIE, SAB], 20, "cv_disco", tope=25000, per="mes", minimo=100000, canal="ambos", pago=(MO, OB), reintegro="reintegro",
    nota="El tope es por banco.")
add("modo", ["vea"], [VIE], 20, "cv_vea", tope=25000, per="mes", minimo=100000, canal="ambos", pago=(MO, OB), reintegro="reintegro",
    nota="El tope es por banco.")
add("supervielle", ["jumbo", "disco", "vea"], [MAR], 25, "cv_jumbo", tope=25000, per="mes", pago=(DB,), reintegro="en la caja",
    requiere=["jubilados"], nota="Solo jubilados que cobran en Supervielle. No aplica a todos los productos.")
add("jubilados", ["vea"], [MAR], 10, "cv_vea", tope=5000, per="semana", canal="ambos", pago=(CR, DB, OT), reintegro="reintegro")
add("mp", ["vea"], [LUN], 20, "cs_mp", pago=(QR, QRT), reintegro="en la caja")

# ---------- ChangoMás (y MasOnline) ----------
add("modo", ["changomas"], [LUN], 20, "cv_mas", tope=25000, per="mes", minimo=75000, canal="ambos", pago=(MO, OB), reintegro="reintegro")
add("bna", ["changomas"], [LUN], 10, "cv_mas", tope=7500, per="mes", minimo=75000, canal="ambos", pago=(MO,), reintegro="reintegro", nota="BNA+ MODO.")
add("modo", ["changomas"], [DOM], 20, "cv_mas", tope=20000, per="mes", minimo=30000, pago=(MO,), reintegro="reintegro")
add("hipotecario", ["changomas", "puntomayorista"], [MAR], 25, "hipo", tope=10000, per="mes", canal="ambos", pago=(MO, OT), reintegro="reintegro",
    nota="Con débito Visa del Hipotecario, pagando con MODO desde la App BH. Tope según convi.ar.")
add("comafi", ["changomas"], [MAR], 20, "cv_mas", tope=12000, per="semana", canal="ambos", pago=(CR, DB, OT), reintegro="reintegro")
add("columbia", ["changomas"], [MAR, SAB], 20, "cv_mas", tope=10000, per="semana", canal="ambos", pago=(CR, OT), reintegro="reintegro")
add("mp", ["changomas"], [MAR], 15, "cv_mas", canal="ambos", pago=(QR, QRT, OB), reintegro="en la caja", nota="No aplica a todos los productos.")
add("mp", ["changomas"], [VIE, SAB, DOM], 15, "cv_mas", canal="ambos", pago=(QR, QRT, OB), reintegro="en la caja")
add("supervielle", ["changomas"], [MAR], 20, "cv_mas", tope=25000, per="mes", canal="ambos", pago=(DB,), reintegro="reintegro",
    requiere=["jubilados"], nota="Solo jubilados, con débito Visa.")
add("bna", ["changomas"], [MIE], 35, "cv_mas", tope=15000, per="semana", pago=(MO,), reintegro="en la caja",
    nota="Con crédito Visa o Mastercard del Nación en BNA+ MODO. No aplica a todos los productos.")
add("masclub", ["changomas"], [MIE, JUE], 15, "cv_mas", canal="ambos", pago=(PR,), reintegro="en la caja", nota="En Más GO: 20%.")
add("ciudad", ["changomas"], [JUE], 35, "cv_mas", tope=20000, per="mes", pago=(VC,), reintegro="reintegro", nota="Con crédito Mastercard a través de Buepp y la App Ciudad.")
add("credicoop", ["changomas"], [JUE], 30, "cv_mas", tope=9000, per="semana", canal="ambos", pago=(CR, DB, OT), reintegro="reintegro", nota="Con Cabal.")
add("icbc", ["changomas"], [JUE], 20, "cv_mas", tope=10000, per="semana", canal="ambos", pago=(CR, DB, OT), reintegro="reintegro",
    nota="Con Plan Sueldo ICBC: 30%, tope $15.000.")
add("cuentadni", ["changomas"], [JUE], 20, "bp", pago=(QR,), reintegro="en la caja", nota="Incluye MasGO. Jubilados que cobran por Cuenta DNI: 5% adicional.")
add("cuentadni", ["changomas"], [JUE], 20, "bp", pago=(NFC,), reintegro="en la caja", nota="Con tarjeta de crédito Visa cargada en la app, pagando por NFC.")
add("patagonia", ["changomas"], [SAB], 15, "cv_mas", tope=10000, per="mes", canal="ambos", pago=(CR, OT), reintegro="reintegro",
    nota="Con carteras Plus o Singular: 20% o 30%.")

# ---------- Día ----------
add("cuentadni", ["dia"], [LUN], 20, "bp", pago=(NFC,), reintegro="en la caja", hasta="2026-12-31", nota="Con tarjeta de crédito Visa cargada en la app, pagando por NFC.")
add("cuentadni", ["dia"], [LUN], 10, "cs_dia", pago=(QR,), reintegro="en la caja", nota="Pagando con Clave DNI. Jubilados que cobran por la app: 5% adicional (tope $5.000 por semana).")
add("jubilados", ["dia"], [LUN], 10, "cs_dia", tope=2000, per="compra", pago=(DB,), reintegro="reintegro")
add("mp", ["dia"], [MIE], 10, "cs_dia", canal="ambos", pago=(QR, OB), reintegro="en la caja", nota="Con dinero en cuenta.")
add("personalpay", ["dia"], [JUE], 15, "cs_dia", canal="ambos", pago=(NFC, QRT, OT), reintegro="reintegro", nota="Con la Visa de Personal Pay.")
add("modo", ["dia"], [VIE, SAB], 20, "cs_dia", tope=20000, per="mes", minimo=35000, canal="ambos", pago=(MO, OB), reintegro="reintegro",
    nota="El tope es por banco.")
add("bna", ["dia"], [VIE, SAB], 10, "cs_dia", tope=7500, per="mes", minimo=35000, canal="ambos", pago=(MO,), reintegro="reintegro",
    hasta="2026-12-31", nota="BNA+ MODO.")
add("credito", ["dia"], [SAB], 0, "cs_dia", canal="ambos", pago=(CR, OT), cuotas=3, nota="3 cuotas sin interés con Visa, Mastercard, American Express o Cabal.")
add("naranja", ["dia", "nini"], TODOS, 0, "cs_dia", canal="ambos", pago=(CR, OT), cuotas=3, hasta="2026-12-31", nota="Plan Z: 3 cuotas sin interés.")

# ---------- Josimar, mayoristas y otros ----------
add("cuentadni", ["josimar"], [MIE], 10, "cs_dni", tope=6000, per="semana", pago=(QR,), reintegro="en la caja")
add("bna", ["josimar"], [VIE], 20, "cs_bna", tope=6000, per="semana", canal="ambos", pago=(MO,), reintegro="reintegro", hasta="2026-12-31")
add("cuentadni", ["nini"], [MAR], 15, "nini", tope=20000, per="semana", pago=(QR,), reintegro="en la caja", nota="Tope según calcularsueldo.com.ar.")
add("bna", ["nini"], [JUE], 20, "cs_bna", tope=20000, per="mes", pago=(MO,), reintegro="reintegro", desde="2026-11-05", hasta="2026-11-26")
add("bna", ["diarco"], [VIE, SAB, DOM], 15, "cs_bna", pago=(MO,), reintegro="reintegro", desde="2026-11-07", hasta="2026-11-29",
    nota="Diarco Mayorista.")
add("bna", ["diarcobarrio"], [VIE, SAB, DOM], 20, "cs_bna", minimo=35000, pago=(MO,), reintegro="reintegro", desde="2026-11-07", hasta="2026-11-29",
    nota="Diarco Barrio y Diarco Pueblo.")
add("mp", ["diarco", "diarcobarrio"], [SAB, DOM], 15, "cs_mp", pago=(QR, QRT), reintegro="en la caja")
add("bna", ["makro"], [JUE], 20, "cs_bna", tope=20000, per="mes", pago=(MO,), reintegro="reintegro")
add("mp", ["makro"], [VIE, SAB], 10, "cs_mp", pago=(QR, QRT), reintegro="en la caja")
add("mp", ["maxiconsumo"], TODOS, 5, "cs_mp", pago=(QR,), reintegro="en la caja", nota="Con dinero en cuenta.")
add("bna", ["carrefour", "coto", "jumbo", "makro", "changomas", "dia", "josimar"], [LUN, MAR, MIE, JUE, VIE], 5, "cs_bna", tope=20000, per="mes",
    pago=(MO,), reintegro="reintegro", requiere=["jubilados"], hasta="2026-12-31",
    nota="Para jubilados que cobran en el Nación. Se suma a las otras promos del comercio.")


def main():
    p = ROOT / "data" / "promos_pago.json"
    old = json.loads(p.read_text(encoding="utf-8"))
    used = {pr["medio"] for pr in P} | {r for pr in P for r in pr["requiere"]}
    out = {"_comentario": old["_comentario"] + " requiere: otros medios o condiciones que hay que tener además del principal (por ejemplo, ser jubilado); esas promos solo se usan en los cálculos si la persona los marcó en 'Mis medios'. fuente_tipo: oficial | relevamiento | prensa.",
           "relevado": "2026-11-08", "tipos": TIPOS, "formas_pago": PAGO,
           "medios": [{"id": i, "name": n, "tipo": t} for i, n, t in MEDIOS if i in used], "promos": P}
    p.write_text(json.dumps(out, ensure_ascii=False, indent=1), encoding="utf-8")
    print(f"OK: {len(P)} promos reales, {len(out['medios'])} medios de pago")


if __name__ == "__main__":
    main()
