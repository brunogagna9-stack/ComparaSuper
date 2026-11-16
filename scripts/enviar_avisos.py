"""Manda los correos a los usuarios con cuenta (Firebase) usando Brevo.

  python3 scripts/enviar_avisos.py bajas     → a quien activó "Avisos de baja de precio": un correo con los productos
                                               marcados (🔔) que hoy están más baratos que cuando los marcó
                                               (y más baratos que en el último aviso, para no repetir).
  python3 scripts/enviar_avisos.py semanal   → a quien activó "Ofertas de la semana": el correo de scripts/correo_semanal.py.
  Agregá --prueba para ver qué se mandaría sin mandar nada ni cambiar la base.

Solo se escribe a cuentas con el correo confirmado. Necesita dos secretos (GitHub → Settings → Secrets → Actions):
  FIREBASE_SA   = el archivo JSON de la cuenta de servicio de Firebase (Configuración → Cuentas de servicio)
  BREVO_API_KEY = la clave de la API de Brevo (SMTP y API → Claves API)
El plan gratis de Brevo permite 300 correos por día: si hay más, se mandan los primeros y se avisa en el registro.
"""
import datetime as dt
import html
import json
import os
import sys
import urllib.request

sys.path.insert(0, os.path.dirname(__file__))
import correo_semanal as cs  # noqa: E402

WEB = "https://superbarato.com.ar/"
CUENTA = WEB + "#cuenta"
REMITENTE = {"name": "SuperBarato", "email": "novedades@superbarato.com.ar"}
TOPE_DIA = 290
PRUEBA = "--prueba" in sys.argv
VERDE, AMARILLO = cs.VERDE, cs.AMARILLO


def leer_web(ruta):
    req = urllib.request.Request(WEB + ruta, headers={"User-Agent": "SuperBarato/0.1 (avisos)"})
    return json.loads(urllib.request.urlopen(req, timeout=90).read())


def brevo(cuerpo):
    if PRUEBA:
        return
    req = urllib.request.Request("https://api.brevo.com/v3/smtp/email", data=json.dumps(cuerpo).encode(), method="POST",
                                 headers={"api-key": os.environ["BREVO_API_KEY"], "Content-Type": "application/json", "Accept": "application/json"})
    urllib.request.urlopen(req, timeout=60).read()


def cabeceras():
    return {"List-Unsubscribe": f"<mailto:contacto@superbarato.com.ar?subject=baja>, <{CUENTA}>"}


def firebase():
    import firebase_admin
    from firebase_admin import auth, credentials, firestore
    if not firebase_admin._apps:
        firebase_admin.initialize_app(credentials.Certificate(json.loads(os.environ["FIREBASE_SA"])))
    return auth, firestore.client()


def usuarios(campo):
    """(uid, correo, documento) de quienes activaron `campo` y confirmaron el correo."""
    auth, db = firebase()
    for d in db.collection("usuarios").where(campo, "==", True).stream():
        try:
            u = auth.get_user(d.id)
        except Exception:
            continue
        if u.email and u.email_verified and not u.disabled:
            yield d.id, u.email, d.to_dict(), d.reference


def precios_zona(zona, cache={}):
    """{código: (precio más bajo hoy, comercio)} para una zona ('amba' o la letra de la provincia)."""
    if zona not in cache:
        datos = leer_web("data/products.json" if zona == "amba" else f"data/p/{zona}/products.json")
        res = {}
        for p in cs.productos(datos):
            mejor = None
            for o in p["offers"]:
                if o.get("bulto", 1) > 1 or o.get("anom"):
                    continue
                for k in ("p", "po", "pon"):
                    v = o.get(k)
                    if v and (mejor is None or v < mejor[0]):
                        mejor = (v, o["tienda"])
            if mejor:
                res[p["id"]] = (mejor[0], mejor[1], p["name"], p["img"])
        cache[zona] = res
    return cache[zona]


def pie(motivo):
    return f"""<tr><td style="padding:16px 18px;font-size:12px;color:#4b5a53;text-align:center;line-height:1.5">
{motivo}<br>Para cambiar qué correos recibís o dejar de recibirlos, entrá a <a href="{CUENTA}" style="color:{VERDE}">Mi cuenta</a>.<br>
SuperBarato · Ciudad de Buenos Aires · <a href="mailto:contacto@superbarato.com.ar" style="color:{VERDE}">contacto@superbarato.com.ar</a></td></tr>"""


def correo_bajas(items):
    filas = "".join(f"""<tr><td style="padding:10px 0;border-top:1px solid #e5ece8">
<a href="{WEB}p/{html.escape(i['id'])}.html" style="text-decoration:none;color:#14231c"><table width="100%" cellpadding="0" cellspacing="0"><tr>
<td width="72" valign="middle">{f'<img src="{html.escape(i["img"])}" width="64" height="64" alt="" style="display:block;width:64px;height:64px;object-fit:contain">' if i['img'] else '🛒'}</td>
<td valign="middle" style="font-size:14px;padding-left:10px"><b>{html.escape(i['nombre'][:80])}</b><br><span style="color:#4b5a53">en {html.escape(i['tienda'])}</span></td>
<td valign="middle" align="right" style="white-space:nowrap"><div style="font-size:20px;font-weight:800;color:{VERDE}">{cs.plata(i['ahora'])}</div>
<div style="font-size:12px;color:#4b5a53">antes {cs.plata(i['antes'])} · <b style="color:{VERDE}">−{i['pct']}%</b></div></td></tr></table></a></td></tr>""" for i in items)
    n = len(items)
    return f"""<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;background:#f4f7f5;font-family:Arial,Helvetica,sans-serif;color:#14231c">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f7f5"><tr><td align="center" style="padding:16px 8px">
<table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%">
<tr><td style="background:{VERDE};border-radius:14px 14px 0 0;padding:20px 24px;color:#fff">
<a href="{WEB}" style="color:#fff;text-decoration:none;font-size:24px;font-weight:800">🛒 Super<span style="color:{AMARILLO}">Barato</span></a>
<div style="font-size:19px;font-weight:700;margin-top:8px">🔔 {"Bajó un producto que seguís" if n == 1 else f"Bajaron {n} productos que seguís"}</div></td></tr>
<tr><td style="background:#fff;padding:12px 20px 20px"><table width="100%" cellpadding="0" cellspacing="0">{filas}</table>
<p style="font-size:12px;color:#4b5a53">Precio más bajo de hoy entre los comercios comparados, sin descuentos de medio de pago. Confirmá siempre en el comercio.</p>
<table cellpadding="0" cellspacing="0" style="margin:16px auto 0"><tr><td style="background:{AMARILLO};border-radius:999px"><a href="{WEB}#conviene" style="display:inline-block;padding:13px 24px;font-weight:800;color:#14231c;text-decoration:none">Ver dónde conviene comprar »</a></td></tr></table></td></tr>
{pie("Recibís este correo porque marcaste estos productos con la 🔔 y activaste los avisos de baja de precio.")}
</table></td></tr></table></body></html>"""


def bajas():
    hoy = dt.date.today().isoformat()
    enviados = 0
    for uid, mail, d, ref in usuarios("bajas"):
        if enviados >= TOPE_DIA:
            print("⚠️ Se llegó al tope diario de correos; el resto queda para mañana")
            break
        if (d.get("ultimoEnvio") or "")[:10] == hoy:
            continue
        ya = dict(d.get("enviados") or {})
        items = []
        for clave, x in (d.get("avisos") or {}).items():
            if "_" not in clave:
                continue
            zona, pid = clave.split("_", 1)
            act = precios_zona(zona).get(pid)
            if not act:
                continue
            ahora, tienda, nombre, img = act
            antes = min(x.get("v") or 0, ya.get(clave) or 10**12)
            if antes and ahora <= antes * 0.99:
                items.append({"clave": clave, "id": pid, "nombre": x.get("n") or nombre, "img": img, "tienda": tienda, "ahora": ahora, "antes": x.get("v"), "pct": round((1 - ahora / x["v"]) * 100)})
        if not items:
            continue
        items.sort(key=lambda i: -i["pct"])
        asunto = f"🔔 Bajó {items[0]['nombre'][:50]}" if len(items) == 1 else f"🔔 Bajaron {len(items)} productos que seguís"
        print(f"{'(prueba) ' if PRUEBA else ''}{mail}: {len(items)} productos")
        brevo({"sender": REMITENTE, "to": [{"email": mail}], "subject": asunto, "htmlContent": correo_bajas(items), "headers": cabeceras(), "tags": ["bajas"]})
        enviados += 1
        if not PRUEBA:
            for i in items:
                ya[i["clave"]] = i["ahora"]
            ref.update({"enviados": ya, "ultimoEnvio": dt.datetime.now(dt.timezone.utc).isoformat()})
    print(f"Avisos de baja enviados: {enviados}")


def semanal():
    cs.main()
    lunes = dt.date.today() + dt.timedelta(days=(7 - dt.date.today().weekday()) % 7)
    cuerpo = (cs.RAIZ / "correo" / f"semana-{lunes.isoformat()}.html").read_text(encoding="utf-8")
    cuerpo = cuerpo.replace("{{ unsubscribe }}", CUENTA).replace("Darme de baja", "Cambiar qué correos recibo o darme de baja")
    destinos = [{"email": mail} for _, mail, d, _ in usuarios("semanal") if (d.get("zona") or "amba") == "amba"]   # por ahora el resumen es de CABA y GBA
    if len(destinos) > TOPE_DIA:
        print(f"⚠️ Hay {len(destinos)} suscriptos y el plan gratis permite {TOPE_DIA} por día: se manda a los primeros")
        destinos = destinos[:TOPE_DIA]
    asunto = f"📉 Las ofertas de la semana del {lunes.day}/{lunes.month} en SuperBarato"
    for i in range(0, len(destinos), 900):   # Brevo: una llamada con un mensaje por persona (nadie ve los correos de los demás)
        lote = destinos[i:i + 900]
        print(f"{'(prueba) ' if PRUEBA else ''}Semanal a {len(lote)} personas")
        brevo({"sender": REMITENTE, "subject": asunto, "htmlContent": cuerpo, "headers": cabeceras(), "tags": ["semanal"],
               "messageVersions": [{"to": [x]} for x in lote]})
    print(f"Correo semanal enviado a {len(destinos)} personas")


if __name__ == "__main__":
    modo = next((a for a in sys.argv[1:] if not a.startswith("--")), "bajas")
    {"bajas": bajas, "semanal": semanal}[modo]()
