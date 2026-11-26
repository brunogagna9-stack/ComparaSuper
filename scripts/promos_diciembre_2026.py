"""Carga en data/promos_pago.json los descuentos REALES de diciembre 2026 (CABA y GBA).

Relevados el 26/11/2026 (carga parcial: la mayoría de las grillas de diciembre se publican el 1/12; completar en la primera semana). Cada promo lleva su fuente:
  - "oficial": página del banco, billetera o comercio.
  - "relevamiento": sitio que copia las condiciones de las páginas oficiales (convi.ar).
  - "prensa": nota periodística que resume la grilla del mes.
Cuando dos fuentes no coinciden se usó la más nueva. Las promos que solo valen en otras provincias
no se cargaron. Para el mes siguiente: copiar este archivo, cambiar las promos y correrlo.

Uso: python scripts/promos_diciembre_2026.py
"""
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent

F = {  # fuentes: (url, tipo, fecha en que se verificó)
    "modo_coto": ("https://www.modo.com.ar/promos/coto-noviembre26", "oficial", "2026-11-26"),
    "modo_dia": ("https://www.modo.com.ar/promos/superdia-noviembre26", "oficial", "2026-11-26"),
    "modo_chango": ("https://www.modo.com.ar/promos/changomas-noviembre26", "oficial", "2026-11-26"),
    "modo_masgo": ("https://www.modo.com.ar/promos/masgo-nov26", "oficial", "2026-11-26"),
    "modo_josimar": ("https://www.modo.com.ar/promos/josimar-noviembre-2611", "oficial", "2026-11-26"),
    "nini": ("https://www.nini.com.ar/promociones", "oficial", "2026-11-26"),
    "cs_dia": ("https://calcularsueldo.com.ar/finanzas/16411/promos-dia-noviembre-2026.html", "prensa", "2026-11-26"),
}

# Bancos que participan de las promos de MODO en supermercados (Los Andes, 09/11/2026, lista de la promo de Coto; Makro publica una lista igual).
# Pagando con la tarjeta de cualquiera de estos bancos cargada en MODO (o en la app del banco con MODO) aplica el descuento.
MODO_BANCOS = ["bna", "santander", "bbva", "galicia", "credicoop", "supervielle", "comafi", "icbc", "macro", "ciudad", "hipotecario", "columbia"]

MEDIOS = [
    ("bna", "Banco Nación", "banco"), ("ciudad", "Banco Ciudad", "banco"), ("columbia", "Banco Columbia", "banco"),
    ("comafi", "Banco Comafi", "banco"), ("credicoop", "Credicoop", "banco"), ("hipotecario", "Banco Hipotecario", "banco"),
    ("icbc", "ICBC", "banco"), ("patagonia", "Banco Patagonia", "banco"), ("supervielle", "Supervielle", "banco"),
    ("galicia", "Galicia", "banco"), ("bbva", "BBVA", "banco"), ("santander", "Santander", "banco"),
    ("provincia", "Banco Provincia", "banco"), ("macro", "Banco Macro", "banco"),
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
        nota=None, cuotas=None, requiere=(), desde="2026-12-01", hasta="2026-12-31", bancos=None):
    url, tipo, fecha = F[fuente]
    if bancos is None:   # promos de MODO: valen con las tarjetas de los bancos adheridos; Cuenta DNI es la billetera de Banco Provincia
        bancos = MODO_BANCOS if medio == "modo" else ["provincia"] if medio == "cuentadni" else []
    P.append({"id": f"d{len(P) + 1:03d}", "medio": medio, "stores": list(stores), "dias": list(dias), "pct": pct, "tope": tope,
              "periodo_tope": per, "minimo": minimo, "canal": canal, "pago": list(pago), "reintegro": reintegro, "nota": nota,
              "cuotas": cuotas, "requiere": list(requiere), "desde": desde, "hasta": hasta,
              "fuente": url, "fuente_tipo": tipo, "verificado": fecha, "ejemplo": False, "bancos": list(bancos)})


# Solo promos cuya fuente dice expresamente que valen en diciembre 2026.

# ---------- Coto ----------
add("modo", ["coto"], [MAR], 25, "modo_coto", pago=(MO,), reintegro="reintegro",
    nota="Sin tope, solo en sucursales pagando con el QR de MODO o de la app del banco (no NFC, no online, no American Express). Excluye productos con otras promociones, carnes, pollo y otros productos. Vigente hasta el 28/02/2027.")

# ---------- ChangoMás ----------
add("modo", ["changomas"], [LUN], 20, "modo_chango", tope=25000, per="mes", minimo=75000, canal="ambos", pago=(MO, NFC, OB), reintegro="reintegro",
    nota="El tope es por banco. QR, botón de pago online o MODO Contactless.")
add("modo", ["changomas"], [DOM], 20, "modo_masgo", tope=20000, per="mes", minimo=30000, pago=(MO, NFC), reintegro="reintegro",
    nota="Solo en MasGo, presencial (QR de MODO o MODO Contactless en Android). El tope es por banco.")

# ---------- Día ----------
add("modo", ["dia"], [VIE, SAB], 20, "modo_dia", tope=20000, per="mes", minimo=35000, canal="ambos", pago=(MO, OB), reintegro="reintegro",
    nota="El tope es por banco.")
add("cuentadni", ["dia"], [LUN], 20, "cs_dia", pago=(NFC,), reintegro="reintegro", nota="Con tarjeta de crédito Visa cargada en la app, pagando por NFC. Sin tope.")
add("columbia", ["dia"], [LUN, VIE], 20, "cs_dia", tope=10000, per="compra", canal="ambos", pago=(CR, OT), reintegro="reintegro",
    nota="Con crédito Visa o Mastercard de Banco Columbia, en 1 pago. Vigente hasta el 31/03/2027.")
add("naranjax", ["dia"], [MAR], 20, "cs_dia", tope=3000, per="semana", canal="ambos", pago=(CR, DB, OT), reintegro="reintegro",
    nota="Plan Inicial. Con Plan Turbo: 25% (tope $9.500); con Plan Épico: 30% (tope $12.000). Tarjeta Naranja X o débito Visa Naranja X.")

# ---------- Josimar y mayoristas ----------
add("modo", ["josimar"], [VIE], 20, "modo_josimar", tope=6000, per="semana", canal="ambos", pago=(MO, NFC, OB), reintegro="reintegro",
    nota="El tope es por banco y por semana.")
add("credicoop", ["nini"], [SAB], 30, "nini", tope=13500, per="dia", pago=(MO,), reintegro="reintegro", desde="2026-12-26", hasta="2026-12-26",
    nota="Solo el sábado 26/12. Con tarjetas Cabal Credicoop por QR de MODO; si cobrás el sueldo en Credicoop: 40%, tope $18.000.")


HOY = "2026-11-26"


def main():
    p = ROOT / "data" / "promos_pago.json"
    old = json.loads(p.read_text(encoding="utf-8"))
    # Se conservan las promos de noviembre que siguen vigentes hasta fin de mes (vencen solas el 30/11);
    # las que decían seguir en diciembre quedan cortadas al 30/11 hasta confirmarlas con una fuente de diciembre.
    P[:0] = [{**pr, "hasta": min(pr["hasta"], "2026-11-30")} for pr in old["promos"] if pr["id"].startswith("n") and pr["hasta"] >= HOY]
    used = {pr["medio"] for pr in P} | {r for pr in P for r in pr["requiere"]} | {b for pr in P for b in pr["bancos"]}
    out = {"_comentario": old["_comentario"] + " requiere: otros medios o condiciones que hay que tener además del principal (por ejemplo, ser jubilado); esas promos solo se usan en los cálculos si la persona los marcó en 'Mis medios'. fuente_tipo: oficial | relevamiento | prensa.",
           "relevado": "2026-11-26", "tipos": TIPOS, "formas_pago": PAGO,
           "medios": [{"id": i, "name": n, "tipo": t} for i, n, t in MEDIOS if i in used | {r for pr in P for r in [pr["medio"], *pr["requiere"], *pr["bancos"]]}], "promos": P}
    p.write_text(json.dumps(out, ensure_ascii=False, indent=1), encoding="utf-8")
    print(f"OK: {len(P)} promos ({sum(pr['id'].startswith('d') for pr in P)} de diciembre), {len(out['medios'])} medios de pago")


if __name__ == "__main__":
    main()
