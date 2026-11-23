"""Escenarios del monitoreo de precios (scripts/monitor.py y la consulta de scripts/sepa_fetch.py).
No manda correos: evaluar() es una función pura y la consulta se prueba contra un servidor local.
Uso: python tests/test_monitor.py   (también lo corre tests/run_tests.py)
"""
import datetime as dt
import http.server
import json
import sys
import threading
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "scripts"))
import monitor as M  # noqa: E402
import sepa_fetch as S  # noqa: E402

UTC = dt.timezone.utc


def T(s):  # hora UTC
    return dt.datetime.fromisoformat(s).replace(tzinfo=UTC)


def sepa_ok(publicado="2026-11-22T16:18:44", fecha="2026-11-22", precios=40000):
    return {"resultado": "ok", "inicio": "2026-11-22T22:20:00+00:00", "fin": "2026-11-22T22:30:00+00:00", "etapas": {
        "consulta": {"ok": True, "archivos": 7, "publicado": publicado}, "descarga": {"ok": True},
        "procesamiento": {"ok": True, "precios": precios, "productos": 9000, "cadenas": ["coto", "dia"]},
        "importacion": {"ok": True, "fecha": fecha, "precios": precios}}}


def sepa_err(tipo="bloqueado", http=403, detalle="HTTP 403 Forbidden (firewall BunkerWeb del portal)"):
    return {"resultado": "error_consulta", "fin": "2026-11-22T22:20:35+00:00",
            "etapas": {"consulta": {"ok": False, "tipo": tipo, "http": http, "detalle": detalle, "intentos": 2}}}


def corrida(sepa, base="2026-11-22", proceso="precios", **pasos):
    return {"proceso": proceso, "sepa": sepa, "pasos": pasos or {"online": "success", "armar": "success", "guardar": "success"},
            "fecha_base": base, "enlace": "https://github.com/x/actions/runs/1"}


def asuntos(correos):
    return " | ".join(c["asunto"] for c in correos)


# 1. SEPA disponible y actualizado, todo se guarda: ningún correo (prueba principal de aceptación)
def test_1_todo_bien_sin_correo():
    est, correos, reg = M.evaluar({}, corrida(sepa_ok()), T("2026-11-22T22:31:00"))
    assert correos == [], asuntos(correos)
    for c in ("FUENTE_DISPONIBLE", "FUENTE_ACTUALIZADA", "CONSULTA_EXITOSA", "PROCESAMIENTO_EXITOSO", "IMPORTACION_EXITOSA", "BASE_ACTUALIZADA"):
        assert c in reg["estados"], (c, reg["estados"])
    assert not est["incidentes"]


# 2. SEPA disponible, pero sin registros nuevos (mismo archivo que ayer): no es una caída
def test_2_sin_datos_nuevos():
    est, _, _ = M.evaluar({}, corrida(sepa_ok()), T("2026-11-22T22:31:00"))
    est, correos, reg = M.evaluar(est, corrida(sepa_ok()), T("2026-11-23T01:00:00"))   # segunda corrida, mismo archivo
    assert "SIN_DATOS_NUEVOS" in reg["estados"] and correos == []
    # si la fuente deja de publicar varios días, se avisa como "SEPA no publicó", nunca como caída
    est, correos, _ = M.evaluar(est, corrida(sepa_ok(publicado="2026-11-18T16:00:00", fecha="2026-11-18"), base="2026-11-18"), T("2026-11-23T22:00:00"))
    est, correos, _ = M.evaluar(est, corrida(sepa_ok(publicado="2026-11-18T16:00:00", fecha="2026-11-18"), base="2026-11-18"), T("2026-11-24T22:00:00"))
    assert len(correos) == 1 and "no publicó" in correos[0]["asunto"] and "caíd" not in correos[0]["asunto"].lower(), asuntos(correos)


# 3. SEPA disponible, pero falla el procesamiento: correo inmediato que culpa al procesamiento, no a SEPA
def test_3_falla_procesamiento():
    s = sepa_ok(); s["etapas"]["procesamiento"] = {"ok": False, "detalle": "KeyError: 'precio_lista'"}; del s["etapas"]["importacion"]
    _, correos, reg = M.evaluar({}, corrida(s), T("2026-11-22T22:31:00"))
    assert len(correos) == 1 and "procesamiento" in correos[0]["asunto"] and "Crítico" in correos[0]["asunto"], asuntos(correos)
    assert "disponible y actualizada" in correos[0]["html"] and "precio_lista" in correos[0]["html"]
    assert "ERROR_DE_PROCESAMIENTO" in reg["estados"] and "FUENTE_DISPONIBLE" in reg["estados"]


# 4. SEPA devuelve un error temporal: se registra, NO se avisa; al día siguiente anda y se descarta
def test_4_error_temporal():
    est, correos, reg = M.evaluar({}, corrida(sepa_err("error_servidor", 503, "HTTP 503")), T("2026-11-22T22:31:00"))
    assert correos == [] and any("descartada" in n for n in reg["notas"])
    est, correos, reg = M.evaluar(est, corrida(sepa_ok(publicado="2026-11-23T16:00:00", fecha="2026-11-23"), base="2026-11-23"), T("2026-11-23T22:31:00"))
    assert correos == [] and not est["incidentes"] and any("se resolvió solo" in n for n in reg["notas"])


# 5. La consulta funciona, pero falla el guardado (Firebase/rama de datos/armado): culpa a SuperBarato
def test_5_falla_guardado():
    _, correos, reg = M.evaluar({}, corrida(sepa_ok(), online="success", armar="success", guardar="failure"), T("2026-11-22T22:31:00"))
    assert len(correos) == 1 and "guardar" in correos[0]["asunto"].lower() and "ERROR_DE_IMPORTACION" in reg["estados"]
    assert "SEPA" not in correos[0]["asunto"]


# 6. Fechas: datos del 22/11 leídos a las 22:30 de Argentina (= 01:30 UTC del 23/11) siguen siendo "de hoy"
def test_6_fechas_en_hora_argentina():
    _, correos, reg = M.evaluar({}, corrida(sepa_ok()), T("2026-11-23T01:30:00"))
    assert correos == [] and "BASE_ACTUALIZADA" in reg["estados"] and "FUENTE_ACTUALIZADA" in reg["estados"]
    assert M.edad_dias("2026-11-22", T("2026-11-23T01:30:00")) == 0
    assert M.edad_dias("2026-11-22", T("2026-11-23T03:30:00")) == 1   # 00:30 del 23 en Argentina


# 7. Datos al día y guardados: jamás un correo de "caída" (el caso del bug original)
def test_7_actualizado_no_informa_caida():
    est = {}
    for d in range(16, 23):
        est, correos, _ = M.evaluar(est, corrida(sepa_ok(publicado=f"2026-11-{d}T16:00:00", fecha=f"2026-11-{d}"), base=f"2026-11-{d}"),
                                    T(f"2026-11-{d}T22:00:00"))
        assert correos == [], asuntos(correos)


# 8. La fuente deja de responder de verdad: se confirma (2 corridas, ≥20 h) y avisa UNA vez, con la causa correcta
def test_8_caida_real_confirmada():
    caida = sepa_err("sin_respuesta", None, "timed out")
    est, c1, _ = M.evaluar({}, corrida(caida, base="2026-11-21"), T("2026-11-22T22:00:00"))
    est, c2, _ = M.evaluar(est, corrida(caida, base="2026-11-21"), T("2026-11-23T22:00:00"))
    est, c3, _ = M.evaluar(est, corrida(caida, base="2026-11-21"), T("2026-11-24T22:00:00"))
    assert c1 == [] and len(c2) == 1 and c3 == [], (asuntos(c1), asuntos(c2), asuntos(c3))
    assert "no responde" in c2[0]["asunto"]
    # el bloqueo por firewall NO se presenta como caída
    est, _, _ = M.evaluar({}, corrida(sepa_err(), base="2026-11-15"), T("2026-11-21T22:00:00"))
    est, cb, _ = M.evaluar(est, corrida(sepa_err(), base="2026-11-15"), T("2026-11-22T22:00:00"))
    assert len(cb) == 1 and "rechaza" in cb[0]["asunto"] and "Crítico" in cb[0]["asunto"]
    assert "en línea, pero rechaza" in cb[0]["html"] and "no responder" not in cb[0]["html"]
    # recordatorio a la semana, no todos los días
    for d in range(23, 29):
        est, cx, _ = M.evaluar(est, corrida(sepa_err(), base="2026-11-15"), T(f"2026-11-{d}T22:00:00"))
        assert cx == [], d
    est, cx, _ = M.evaluar(est, corrida(sepa_err(), base="2026-11-15"), T("2026-11-29T22:00:00"))
    assert len(cx) == 1 and "sigue" in cx[0]["asunto"]


# 9. Se recupera después de una interrupción: correo de recuperación con registros procesados
def test_9_recuperacion():
    est, _, _ = M.evaluar({}, corrida(sepa_err(), base="2026-11-15"), T("2026-11-21T22:00:00"))
    est, c, _ = M.evaluar(est, corrida(sepa_err(), base="2026-11-15"), T("2026-11-22T22:00:00"))
    assert len(c) == 1
    est, c, reg = M.evaluar(est, corrida(sepa_ok(publicado="2026-11-23T16:00:00", fecha="2026-11-23"), base="2026-11-23"), T("2026-11-23T22:00:00"))
    assert len(c) == 1 and "recuperada" in c[0]["asunto"] and "40000" in c[0]["html"] and "RECUPERADO" in reg["estados"]
    assert not est["incidentes"]
    # la corrida de provincias con el mismo bloqueo no abre un incidente aparte (comparte la causa)
    est2, _, _ = M.evaluar({}, corrida(sepa_err(), base="2026-11-15"), T("2026-11-21T22:00:00"))
    est2, c1, _ = M.evaluar(est2, corrida(sepa_err(), base="2026-11-15"), T("2026-11-22T22:00:00"))
    est2, c2, _ = M.evaluar(est2, {"proceso": "provincias", "sepa": sepa_err(), "pasos": {}}, T("2026-11-22T23:40:00"))
    assert len(c1) == 1 and c2 == []


# 10. La tarea corre dos veces el mismo día: no se duplican correos
def test_10_doble_ejecucion():
    est, _, _ = M.evaluar({}, corrida(sepa_err(), base="2026-11-15"), T("2026-11-21T22:00:00"))
    est, c1, _ = M.evaluar(est, corrida(sepa_err(), base="2026-11-15"), T("2026-11-22T22:00:00"))
    est, c2, _ = M.evaluar(est, corrida(sepa_err(), base="2026-11-15"), T("2026-11-22T22:05:00"))
    s = sepa_ok(); s["etapas"]["procesamiento"] = {"ok": False, "detalle": "x"}; del s["etapas"]["importacion"]
    est, c3, _ = M.evaluar(est, corrida(s), T("2026-11-23T10:00:00"))
    est, c4, _ = M.evaluar(est, corrida(s), T("2026-11-23T10:05:00"))
    assert len(c1) == 1 and c2 == [] and len([x for x in c3 if "procesamiento" in x["asunto"]]) == 1 and c4 == []


# 11. La tarea programada no llega a ejecutarse: la vigilancia lo detecta una vez
def test_11_tarea_no_ejecutada():
    est, _, _ = M.evaluar({}, corrida(sepa_ok()), T("2026-11-22T22:00:00"))
    _, c, nota = M.vigilar(est, T("2026-11-23T19:41:00"))
    assert c == [] and "22 h" in nota
    est2, c, _ = M.vigilar(est, T("2026-11-24T19:41:00"))
    assert len(c) == 1 and "no se ejecutó" in c[0]["asunto"]
    _, c, _ = M.vigilar(est2, T("2026-11-25T19:41:00"))
    assert c == []
    # y cuando vuelve a correr, llega la recuperación
    _, c, _ = M.evaluar(est2, corrida(sepa_ok(publicado="2026-11-25T16:00:00", fecha="2026-11-25"), base="2026-11-25"), T("2026-11-25T22:00:00"))
    assert len(c) == 1 and "recuperada" in c[0]["asunto"]


# La consulta clasifica el error real (servidor local que imita al portal)
class _H(http.server.BaseHTTPRequestHandler):
    def do_GET(self):
        n = self.server.n = getattr(self.server, "n", 0) + 1
        if self.path.startswith("/403"):
            self.send_response(403); self.end_headers(); self.wfile.write(b"<html>protected with BunkerWeb</html>")
        elif self.path.startswith("/503"):
            code = 503 if n < 2 else 200
            self.send_response(code); self.end_headers(); self.wfile.write(b'{"ok":1}')
        else:
            self.send_response(404); self.end_headers()

    def log_message(self, *a):
        pass


def test_consulta_clasifica_errores():
    srv = http.server.HTTPServer(("127.0.0.1", 0), _H)
    threading.Thread(target=srv.serve_forever, daemon=True).start()
    base, S.ESPERAS = f"http://127.0.0.1:{srv.server_port}", (0, 0)
    try:
        try:
            S.pedir(base + "/403"); assert False
        except S.ErrorConsulta as e:
            assert e.tipo == "bloqueado" and e.http == 403 and "BunkerWeb" in e.detalle and e.intentos == 2
        srv.n = 0
        assert S.pedir(base + "/503") == b'{"ok":1}'   # error pasajero: el reintento lo resuelve
        try:
            S.pedir(base + "/x"); assert False
        except S.ErrorConsulta as e:
            assert e.tipo == "no_encontrado" and e.intentos == 1
        try:
            S.pedir("http://127.0.0.1:9/"); assert False
        except S.ErrorConsulta as e:
            assert e.tipo == "sin_respuesta" and e.intentos == 3
    finally:
        srv.shutdown(); S.ESPERAS = (20, 60)


if __name__ == "__main__":
    fallas = 0
    for nombre, fn in list(globals().items()):
        if nombre.startswith("test_"):
            try:
                fn(); print("ok  ", nombre)
            except Exception as e:
                fallas += 1; print("FALLA", nombre, repr(e))
    sys.exit(1 if fallas else 0)
