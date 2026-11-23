"""Monitoreo de la actualización de precios: decide SI hay que avisar y QUÉ decir.

Antes, cualquier error al consultar el portal oficial terminaba en un correo "SEPA lleva N días sin responder".
Pero el 16/11/2026 el portal empezó a RECHAZAR (HTTP 403, firewall) a los servidores de GitHub, mientras seguía
publicando todos los días para el público: el aviso culpaba a la fuente de algo que no era una caída.
Ahora cada etapa tiene su propio estado y el correo dice cuál falló:

  fuente/consulta  → FUENTE_DISPONIBLE, FUENTE_ACTUALIZADA, CONSULTA_EXITOSA, ERROR_DE_CONSULTA (con el tipo:
                     bloqueado, sin_respuesta, error_servidor, dns…)
  procesamiento    → PROCESAMIENTO_EXITOSO, ERROR_DE_PROCESAMIENTO
  guardado         → IMPORTACION_EXITOSA, ERROR_DE_IMPORTACION, SIN_DATOS_NUEVOS
  base publicada   → BASE_ACTUALIZADA, DATOS_DESACTUALIZADOS
  incidentes       → RECUPERADO cuando un problema avisado se resuelve

Reglas de aviso (para no mandar falsas alarmas ni repetir correos):
  - Errores internos (procesamiento, guardado): incidente crítico apenas pasan (son errores nuestros).
  - Errores de consulta: se confirman. Hace falta que fallen 2 corridas seguidas separadas por 20 h o más
    (cada consulta ya reintenta sola 3 veces). Un fallo suelto se registra como "alerta descartada".
  - Un mismo incidente avisa una sola vez y después recuerda una vez por semana; si se agrava, avisa el cambio.
  - Cuando se resuelve, llega "Actualización de precios recuperada" (solo si antes se había avisado).
  - Si la actualización no corre en 30 h, la vigilancia diaria abre el incidente TAREA_NO_EJECUTADA.
  - Las fechas se cuentan en hora de Argentina (America/Argentina/Buenos_Aires).

El estado y un historial de cada corrida se guardan en la rama "monitor" (estado.json), aparte de los datos.

Uso (en los workflows):
  python3 scripts/monitor.py corrida <dir_monitor> <proceso> [--sepa estado_sepa.json] [--meta site/data/meta.json]
                                     [--paso nombre=success|failure|skipped ...] [--enlace URL]
  python3 scripts/monitor.py vigilar <dir_monitor> [--enlace URL]
"""
import datetime as dt
import html as H
import json
import sys
from pathlib import Path
from zoneinfo import ZoneInfo

sys.path.insert(0, str(Path(__file__).resolve().parent))
import alerta  # noqa: E402

ART = ZoneInfo("America/Argentina/Buenos_Aires")
DIAS_VIGENTE = 2          # datos de sucursal de hasta 2 días: al día (SEPA publica cada día con el día anterior)
DIAS_DESACTUALIZADO = 3   # más de 3 días: la web ya muestra el cartel amarillo
DIAS_CRITICO = 7          # más de una semana sin precios de sucursal nuevos: crítico
CONFIRMAR_CORRIDAS, CONFIRMAR_HORAS = 2, 20
RECORDAR_DIAS = 7
HORAS_SIN_CORRER = 30
HISTORIAL_MAX = 150
INTERNOS = {"actualizar", "pruebas", "armar", "control", "guardar", "armar_prov", "guardar_prov"}

TIPOS_CONSULTA = {
    "bloqueado": ("El portal oficial rechaza la conexión de nuestro servidor",
                  "El portal SEPA está en línea, pero su firewall bloquea los pedidos que vienen de servidores (HTTP 403). "
                  "No es una caída de la fuente ni un error de SuperBarato.",
                  "Pedir al portal que habilite el acceso automático de SuperBarato (ver docs/PENDIENTES.md). "
                  "Mientras tanto, la web sigue con los precios online al día y avisa de qué fecha son los de sucursal."),
    "sin_respuesta": ("El portal oficial no responde",
                      "Los pedidos al portal SEPA se quedaron sin respuesta (tiempo agotado o conexión cortada), aun con reintentos.",
                      "Nada que hacer de nuestro lado si es una caída del portal; si sigue varios días, revisar desde otra conexión."),
    "dns": ("No se encuentra la dirección del portal oficial",
            "La dirección datos.produccion.gob.ar no se pudo resolver (DNS).",
            "Comprobar si el portal cambió de dirección."),
    "error_servidor": ("El portal oficial devuelve errores",
                       "El portal SEPA respondió con un error del servidor (5xx), aun con reintentos.",
                       "Suele ser pasajero; si sigue varios días, revisar el portal."),
    "no_encontrado": ("El portal oficial cambió la dirección de los datos",
                      "La lista de archivos de SEPA ya no está en la dirección que usa SuperBarato (HTTP 404).",
                      "Revisar el identificador del conjunto de datos en scripts/sepa_fetch.py."),
    "respuesta_invalida": ("El portal oficial respondió en otro formato",
                           "La respuesta del portal no tiene la forma esperada (lista de archivos).",
                           "Revisar si el portal cambió su API."),
    "sin_archivos": ("El portal oficial no lista archivos de precios",
                     "La consulta funcionó, pero el portal no devolvió archivos .zip de SEPA.",
                     "Revisar el conjunto de datos en el portal."),
}


def hoy(ahora):
    return ahora.astimezone(ART).date()


def edad_dias(fecha, ahora):
    """Días desde una fecha AAAA-MM-DD (o fecha y hora) hasta hoy, contados en hora de Argentina."""
    if not fecha:
        return None
    try:
        d = dt.date.fromisoformat(str(fecha)[:10])
    except ValueError:
        return None
    return (hoy(ahora) - d).days


def fmt(ts):
    if not ts:
        return "—"
    t = dt.datetime.fromisoformat(ts) if isinstance(ts, str) else ts
    if t.tzinfo is None:
        t = t.replace(tzinfo=dt.timezone.utc)
    return t.astimezone(ART).strftime("%d/%m/%Y %H:%M")


def fecha_ar(f):
    return "-".join(reversed(str(f)[:10].split("-"))).replace("-", "/") if f else "—"


# ------------------------------------------------------------------ evaluación de una corrida
def estados_de(corrida, prev, ahora):
    """Lista de estados (códigos) y problemas detectados en esta corrida. No decide avisos."""
    codigos, problemas = [], []
    sepa = corrida.get("sepa") or {}
    et = sepa.get("etapas", {})
    pasos = corrida.get("pasos", {})
    proc = corrida["proceso"]
    cons = et.get("consulta")
    if cons and cons.get("ok"):
        codigos += ["FUENTE_DISPONIBLE", "CONSULTA_EXITOSA"]
        e = edad_dias(cons.get("publicado"), ahora)
        if e is not None and e <= DIAS_VIGENTE:
            codigos.append("FUENTE_ACTUALIZADA")
        elif e is not None:
            problemas.append({"causa": "FUENTE_SIN_PUBLICAR", "grave": e >= DIAS_CRITICO, "confirmar": True,
                              "detalle": f"El último archivo publicado por SEPA es del {fecha_ar(cons.get('publicado'))} (hace {e} días)."})
    desc = et.get("descarga")
    fallo_consulta = cons if cons and not cons.get("ok") else desc if desc and not desc.get("ok") else None
    if fallo_consulta:
        codigos.append("ERROR_DE_CONSULTA")
        problemas.append({"causa": f"CONSULTA_{fallo_consulta.get('tipo', 'desconocido')}", "confirmar": True,
                          "detalle": f"{fallo_consulta.get('detalle')} (tras {fallo_consulta.get('intentos', 1)} intento(s); etapa: "
                                     f"{'lista de archivos' if fallo_consulta is cons else 'descarga del archivo'})."})
    pr = et.get("procesamiento")
    if pr:
        if pr.get("ok"):
            codigos.append("PROCESAMIENTO_EXITOSO")
        else:
            codigos.append("ERROR_DE_PROCESAMIENTO")
            problemas.append({"causa": f"PROCESAMIENTO_{proc}", "grave": True,
                              "detalle": f"Los datos de SEPA se descargaron, pero no se pudieron interpretar: {pr.get('detalle')}"})
    im = et.get("importacion")
    if im and not im.get("ok"):
        codigos.append("ERROR_DE_IMPORTACION")
        problemas.append({"causa": f"IMPORTACION_{proc}", "grave": True, "detalle": f"No se pudieron guardar los precios de SEPA: {im.get('detalle')}"})
    elif im:
        codigos.append("IMPORTACION_EXITOSA")
        if im.get("fecha") and im.get("fecha") == (prev.get("ultima_importacion") or {}).get(proc, {}).get("fecha"):
            codigos.append("SIN_DATOS_NUEVOS")
    # pasos internos (armar, controlar, guardar): error nuestro, crítico. Complementarios (precios online, fotos,
    # promos): cada uno ya tolera tiendas caídas; si el paso entero falla 2 días seguidos, advertencia.
    internos = [k for k, v in pasos.items() if v == "failure" and k in INTERNOS]
    extra = [k for k, v in pasos.items() if v == "failure" and k not in INTERNOS]
    if internos:
        codigos.append("ERROR_DE_IMPORTACION")
        problemas.append({"causa": f"PASOS_{proc}", "grave": True,
                          "detalle": "Fallaron pasos internos de SuperBarato: " + ", ".join(internos) + "."})
    for k in extra:
        problemas.append({"causa": f"COMPLEMENTO_{k}_{proc}", "confirmar": True, "detalle": f"Falló el paso \"{k}\" (complementario)."})
    base = corrida.get("fecha_base")
    if base:
        e = edad_dias(base, ahora)
        if e <= DIAS_VIGENTE:
            codigos.append("BASE_ACTUALIZADA")
        elif e > DIAS_DESACTUALIZADO:
            codigos.append("DATOS_DESACTUALIZADOS")
    return codigos, problemas


def titulo_y_textos(causa):
    if causa.startswith("CONSULTA_"):
        t = TIPOS_CONSULTA.get(causa[9:], ("Error al consultar el portal oficial", "La consulta al portal SEPA falló.", "Revisar el detalle."))
        return t
    if causa.startswith("PROCESAMIENTO_"):
        return ("Error en el procesamiento de precios", "SEPA entregó los datos, pero SuperBarato no los pudo interpretar "
                "(posible cambio de formato del archivo o error en el código).", "Revisar scripts/sepa_fetch.py con el detalle de la corrida.")
    if causa.startswith("IMPORTACION_") or causa.startswith("PASOS_"):
        return ("Error al guardar o publicar los precios", "Los datos se obtuvieron, pero falló un paso interno de SuperBarato.",
                "Revisar el paso que falló en el enlace de la corrida.")
    if causa.startswith("COMPLEMENTO_"):
        return ("Falló un paso complementario de la actualización", "Los precios de sucursal no se ven afectados.",
                "Revisar el paso en el enlace de la corrida; la web sigue publicándose.")
    if causa == "FUENTE_SIN_PUBLICAR":
        return ("SEPA no publicó archivos nuevos", "La consulta funciona, pero el portal no subió archivos nuevos.",
                "Nada que hacer de nuestro lado: la web avisa de qué fecha son los precios de sucursal.")
    if causa == "TAREA_NO_EJECUTADA":
        return ("La actualización de precios no se ejecutó", "GitHub no corrió la tarea programada en el tiempo esperado.",
                "Revisar la pestaña Actions; se puede correr a mano con \"Run workflow\".")
    return (causa, "", "")


def evaluar(prev, corrida, ahora):
    """Devuelve (estado_nuevo, correos, registro). No manda nada: es una función pura para poder probarla."""
    est = json.loads(json.dumps(prev or {}))
    est.setdefault("incidentes", {})
    est.setdefault("historial", [])
    est.setdefault("ultima_corrida", {})
    est.setdefault("ultima_importacion", {})
    proc = corrida["proceso"]
    codigos, problemas = estados_de(corrida, est, ahora)
    iso = ahora.astimezone(dt.timezone.utc).isoformat(timespec="seconds")
    correos, notas = [], []
    edad_base = edad_dias(corrida.get("fecha_base"), ahora)
    activos = set()
    for p in problemas:
        c = p["causa"]
        activos.add(c)
        inc = est["incidentes"].get(c)
        if not inc:
            inc = est["incidentes"][c] = {"id": f"{c}-{hoy(ahora).isoformat()}", "desde": iso, "corridas": 0, "avisado": None,
                                          "nivel": None}
        inc["corridas"] += 1
        inc["ultima"] = iso
        inc["detalle"] = p["detalle"]
        inc["proceso"] = proc
        horas = (ahora - dt.datetime.fromisoformat(inc["desde"])).total_seconds() / 3600
        confirmado = not p.get("confirmar") or (inc["corridas"] >= CONFIRMAR_CORRIDAS and horas >= CONFIRMAR_HORAS)
        grave = p.get("grave") or (edad_base is not None and edad_base >= DIAS_CRITICO)
        nivel = "crítico" if grave else "advertencia"
        if not confirmado:
            notas.append(f"alerta descartada: {c} sin confirmar ({inc['corridas']} corrida(s), {horas:.0f} h)")
            continue
        motivo = None
        if not inc["avisado"]:
            motivo = "nuevo"
        elif nivel == "crítico" and inc["nivel"] != "crítico":
            motivo = "agravado"
        elif (ahora - dt.datetime.fromisoformat(inc["avisado"])).days >= RECORDAR_DIAS:
            motivo = "recordatorio"
        if motivo:
            correos.append(correo_incidente(c, inc, nivel, motivo, corrida, codigos, ahora))
            inc["avisado"], inc["nivel"] = iso, nivel
        else:
            notas.append(f"sin correo: {c} ya avisado el {fmt(inc['avisado'])}")
    # incidentes que ya no aparecen: se resuelven (solo los de causas que esta corrida pudo comprobar)
    comprobables = {"CONSULTA_", "FUENTE_SIN_PUBLICAR"} if corrida.get("sepa") else set()
    for c in list(est["incidentes"]):
        inc = est["incidentes"][c]
        if c in activos:
            continue
        propio = c.endswith("_" + proc) or any(c.startswith(x) for x in comprobables)
        if c == "TAREA_NO_EJECUTADA" and proc == "precios":
            propio = True
        if not propio:
            continue
        if inc.get("avisado"):
            correos.append(correo_recuperado(c, inc, corrida, codigos, ahora))
            codigos.append("RECUPERADO")
        else:
            notas.append(f"alerta descartada: {c} se resolvió solo antes de confirmarse")
        del est["incidentes"][c]
    sepa = corrida.get("sepa") or {}
    im = sepa.get("etapas", {}).get("importacion")
    if im and im.get("ok"):
        est["ultima_importacion"][proc] = {"fecha": im.get("fecha"), "cuando": iso, "precios": im.get("precios")}
    est["ultima_corrida"][proc] = iso
    registro = {"cuando": iso, "proceso": proc, "estados": codigos, "resultado": sepa.get("resultado"),
                "consulta": (sepa.get("etapas", {}).get("consulta") or {}).get("detalle") or (sepa.get("etapas", {}).get("consulta") or {}).get("publicado"),
                "precios": (sepa.get("etapas", {}).get("procesamiento") or {}).get("precios"), "fecha_base": corrida.get("fecha_base"),
                "pasos": corrida.get("pasos", {}), "correos": [c["asunto"] for c in correos], "notas": notas}
    est["historial"] = (est["historial"] + [registro])[-HISTORIAL_MAX:]
    return est, correos, registro


def vigilar(prev, ahora):
    """Para la vigilancia diaria: ¿la actualización dejó de correr? (tarea programada que no se ejecutó)."""
    est = json.loads(json.dumps(prev or {}))
    est.setdefault("incidentes", {})
    ult = (est.get("ultima_corrida") or {}).get("precios")
    correos = []
    if not ult:
        return est, correos, "sin historial todavía"
    horas = (ahora - dt.datetime.fromisoformat(ult)).total_seconds() / 3600
    if horas <= HORAS_SIN_CORRER:
        return est, correos, f"última actualización hace {horas:.0f} h"
    c = "TAREA_NO_EJECUTADA"
    inc = est["incidentes"].setdefault(c, {"id": f"{c}-{hoy(ahora).isoformat()}", "desde": ahora.isoformat(timespec="seconds"),
                                           "corridas": 0, "avisado": None, "nivel": None, "proceso": "precios"})
    inc["corridas"] += 1
    inc["detalle"] = f"La última actualización corrió el {fmt(ult)} (hace {horas:.0f} h; se espera una por día)."
    if not inc["avisado"] or (ahora - dt.datetime.fromisoformat(inc["avisado"])).days >= RECORDAR_DIAS:
        t, causa, accion = titulo_y_textos(c)
        correos.append({"asunto": f"SuperBarato — [Crítico] {t}", "html": html_base(t, [("Última actualización", fmt(ult)),
                        ("Horas sin correr", f"{horas:.0f} h (límite {HORAS_SIN_CORRER} h)")], inc["detalle"] + " " + causa, accion, inc, None)})
        inc["avisado"], inc["nivel"] = ahora.isoformat(timespec="seconds"), "crítico"
    return est, correos, inc["detalle"]


# ------------------------------------------------------------------ correos
def filas_estado(corrida, codigos, ahora):
    sepa = corrida.get("sepa") or {}
    et = sepa.get("etapas", {})
    cons, desc, pr, im = (et.get(k) for k in ("consulta", "descarga", "procesamiento", "importacion"))
    if cons and cons.get("ok"):
        fuente = "disponible" + (" y actualizada" if "FUENTE_ACTUALIZADA" in codigos else "")
    elif cons and cons.get("tipo") == "bloqueado":
        fuente = "en línea, pero rechaza la conexión del servidor (HTTP 403)"
    elif cons:
        fuente = f"no se pudo comprobar ({cons.get('tipo')})"
    else:
        fuente = "no consultada en esta corrida"
    def est(x, ok="correcto"):
        return "no se llegó a esta etapa" if x is None else ok if x.get("ok") else "ERROR"
    filas = [("Fuente SEPA", fuente),
             ("Última consulta", fmt(sepa.get("fin") or sepa.get("inicio"))),
             ("Últimos datos publicados por SEPA", fecha_ar(cons.get("publicado")) if cons and cons.get("ok") else "no visible desde el servidor"),
             ("Recuperación de la información", "exitosa" if cons and cons.get("ok") and (not desc or desc.get("ok")) else est(desc or cons, "exitosa")),
             ("Procesamiento", est(pr) + (f" ({pr.get('precios')} precios)" if pr and pr.get("ok") else "")),
             ("Actualización de la base", "pendiente" if not im else est(im, "correcta") + (f" (datos del {fecha_ar(im.get('fecha'))})" if im.get("ok") else ""))]
    if corrida.get("fecha_base"):
        e = edad_dias(corrida["fecha_base"], ahora)
        filas.append(("Precios de sucursal en la web", f"del {fecha_ar(corrida['fecha_base'])} (hace {e} días)"))
    if corrida.get("pasos"):
        filas.append(("Otros pasos", ", ".join(f"{k}: {'bien' if v == 'success' else 'falló' if v == 'failure' else 'no corrió'}"
                                               for k, v in corrida["pasos"].items())))
    return filas


def html_base(titulo, filas, causa, accion, inc, enlace):
    tabla = "".join(f"<tr><td style='padding:4px 12px 4px 0;color:#4b5a53'>{H.escape(a)}</td><td style='padding:4px 0'><b>{H.escape(str(b))}</b></td></tr>"
                    for a, b in filas)
    return (f"<p>Hola Bruno:</p><h3 style='margin:8px 0'>{H.escape(titulo)}</h3><table style='font-size:14px;border-collapse:collapse'>{tabla}</table>"
            f"<p><b>Causa:</b> {H.escape(causa)}</p><p><b>Acción:</b> {H.escape(accion)}</p>"
            f"<p style='color:#4b5a53;font-size:12px'>Incidente {H.escape(inc['id'])} · desde {fmt(inc['desde'])}"
            + (f" · <a href='{enlace}'>detalle de la corrida</a>" if enlace else "") + "<br>Aviso automático de SuperBarato. "
            "Un mismo problema avisa una vez y recuerda una vez por semana; cuando se resuelva vas a recibir otro correo.</p>")


def correo_incidente(c, inc, nivel, motivo, corrida, codigos, ahora):
    t, causa, accion = titulo_y_textos(c)
    pref = {"nuevo": "", "agravado": "se agravó: ", "recordatorio": "sigue: "}[motivo]
    asunto = f"SuperBarato — [{'Crítico' if nivel == 'crítico' else 'Aviso'}] {pref}{t}"
    return {"asunto": asunto, "html": html_base(t, filas_estado(corrida, codigos, ahora), f"{inc['detalle']} {causa}".strip(), accion, inc,
                                               corrida.get("enlace"))}


def correo_recuperado(c, inc, corrida, codigos, ahora):
    t, _, _ = titulo_y_textos(c)
    sepa = corrida.get("sepa") or {}
    et = sepa.get("etapas", {})
    filas = [("Recuperado", fmt(ahora.isoformat())), ("Problema", t), ("Duró desde", fmt(inc["desde"]))] + filas_estado(corrida, codigos, ahora)
    pr, im = et.get("procesamiento") or {}, et.get("importacion") or {}
    if pr.get("precios"):
        filas.append(("Registros procesados", pr["precios"]))
    if im.get("precios"):
        filas.append(("Registros actualizados", im["precios"]))
    return {"asunto": f"SuperBarato — Actualización de precios recuperada ({t.lower()})",
            "html": html_base("Actualización de precios recuperada", filas, "El problema ya no aparece en la última corrida.",
                              "Ninguna.", inc, corrida.get("enlace"))}


# ------------------------------------------------------------------ línea de comandos
def leer(ruta):
    try:
        return json.loads(Path(ruta).read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return None


def main(argv):
    modo, carpeta = argv[0], Path(argv[1])
    carpeta.mkdir(parents=True, exist_ok=True)
    ruta = carpeta / "estado.json"
    prev = leer(ruta) or {}
    opts, pasos, i = {}, {}, 2
    proceso = None
    while i < len(argv):
        a = argv[i]
        if a == "--paso":
            k, v = argv[i + 1].split("=", 1); pasos[k] = v; i += 2
        elif a.startswith("--"):
            opts[a[2:]] = argv[i + 1]; i += 2
        else:
            proceso = a; i += 1
    ahora = dt.datetime.now(dt.timezone.utc)
    if modo == "vigilar":
        est, correos, nota = vigilar(prev, ahora)
        print("Vigilancia de tareas programadas:", nota)
    else:
        meta = leer(opts["meta"]) if opts.get("meta") else None
        corrida = {"proceso": proceso, "sepa": leer(opts["sepa"]) if opts.get("sepa") else None, "pasos": pasos,
                   "fecha_base": (meta or {}).get("updated"), "enlace": opts.get("enlace")}
        est, correos, reg = evaluar(prev, corrida, ahora)
        print("Estados:", ", ".join(reg["estados"]) or "—")
        for n in reg["notas"]:
            print(" ·", n)
    enviados = []
    for c in correos:
        ok = alerta.enviar(c["asunto"], c["html"], "monitor")
        enviados.append({"cuando": ahora.isoformat(timespec="seconds"), "asunto": c["asunto"], "enviado": ok})
    est["correos"] = (est.get("correos", []) + enviados)[-100:]
    ruta.write_text(json.dumps(est, ensure_ascii=False, indent=1), encoding="utf-8")
    if not correos:
        print("Sin correos: nada nuevo que avisar.")


if __name__ == "__main__":
    main(sys.argv[1:])
