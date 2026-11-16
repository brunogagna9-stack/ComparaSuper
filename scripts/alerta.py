"""Manda un correo a contacto@superbarato.com.ar cuando falla un proceso automático (precios, publicación, correos…).
Lo llaman los workflows de GitHub en su último paso, solo si algo falló. Usa la clave de Brevo (secreto BREVO_API_KEY).
Uso: python3 scripts/alerta.py "<nombre del proceso>" "<enlace a la ejecución>"
"""
import json
import os
import sys
import urllib.request

proceso = sys.argv[1] if len(sys.argv) > 1 else "un proceso"
enlace = sys.argv[2] if len(sys.argv) > 2 else "https://github.com/brunogagna9-stack/ComparaSuper/actions"
clave = os.environ.get("BREVO_API_KEY")
if not clave:
    print("Sin BREVO_API_KEY: no se puede avisar por correo")
    sys.exit(0)
html = f"""<p>Hola Bruno:</p><p>Falló <b>{proceso}</b> en SuperBarato.</p>
<p>Mirá el detalle acá: <a href="{enlace}">{enlace}</a></p>
<p>Si vuelve a fallar mañana, pasame el enlace y lo revisamos.</p><p style="color:#4b5a53;font-size:12px">Aviso automático de SuperBarato.</p>"""
cuerpo = {"sender": {"name": "SuperBarato (avisos)", "email": "novedades@superbarato.com.ar"},
          "to": [{"email": "contacto@superbarato.com.ar"}], "subject": f"⚠️ Falló: {proceso}", "htmlContent": html, "tags": ["alerta"]}
req = urllib.request.Request("https://api.brevo.com/v3/smtp/email", data=json.dumps(cuerpo).encode(), method="POST",
                             headers={"api-key": clave, "Content-Type": "application/json", "Accept": "application/json"})
try:
    urllib.request.urlopen(req, timeout=30).read()
    print("Aviso enviado a contacto@superbarato.com.ar")
except Exception as e:
    print("No se pudo mandar el aviso:", e)
