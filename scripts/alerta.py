"""Manda un correo a contacto@superbarato.com.ar cuando falla un proceso automático (precios, publicación, correos…).
Lo usan los workflows de GitHub (solo si algo falló) y scripts/monitor.py. Usa la clave de Brevo (secreto BREVO_API_KEY).
Uso: python3 scripts/alerta.py "<nombre del proceso>" "<enlace a la ejecución>" [archivo con el detalle]
Sin BREVO_API_KEY (pruebas) no manda nada: muestra el correo en pantalla.
"""
import html as H
import json
import os
import sys
import urllib.request

DESTINO = "contacto@superbarato.com.ar"


def enviar(asunto, html, etiqueta="alerta"):
    """Devuelve True si Brevo aceptó el correo."""
    clave = os.environ.get("BREVO_API_KEY")
    if not clave or os.environ.get("MONITOR_SIN_CORREO"):
        print(f"[correo NO enviado: modo prueba o sin BREVO_API_KEY]\nAsunto: {asunto}\n{html}")
        return False
    cuerpo = {"sender": {"name": "SuperBarato (avisos)", "email": "novedades@superbarato.com.ar"},
              "to": [{"email": DESTINO}], "subject": asunto, "htmlContent": html, "tags": [etiqueta]}
    req = urllib.request.Request("https://api.brevo.com/v3/smtp/email", data=json.dumps(cuerpo).encode(), method="POST",
                                 headers={"api-key": clave, "Content-Type": "application/json", "Accept": "application/json"})
    try:
        urllib.request.urlopen(req, timeout=30).read()
        print(f"Aviso enviado a {DESTINO}: {asunto}")
        return True
    except Exception as e:
        print("No se pudo mandar el aviso:", e)
        return False


if __name__ == "__main__":
    proceso = sys.argv[1] if len(sys.argv) > 1 else "un proceso"
    enlace = sys.argv[2] if len(sys.argv) > 2 else "https://github.com/brunogagna9-stack/ComparaSuper/actions"
    detalle = ""
    if len(sys.argv) > 3 and os.path.exists(sys.argv[3]):
        detalle = "<pre style='white-space:pre-wrap;font-size:13px'>" + H.escape(open(sys.argv[3], encoding="utf-8").read()[:6000]) + "</pre>"
    enviar(f"⚠️ Falló: {proceso}", f"""<p>Hola Bruno:</p><p>Falló <b>{H.escape(proceso)}</b> en SuperBarato.</p>{detalle}
<p>Mirá el detalle acá: <a href="{enlace}">{enlace}</a></p>
<p style="color:#4b5a53;font-size:12px">Aviso automático de SuperBarato.</p>""")
