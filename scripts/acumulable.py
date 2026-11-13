"""Si un descuento se acumula o no con otras promociones: cómo se averigua y cómo se aplica a los descuentos.

Orden de confianza (el primero que sepa, gana):
  1. data/promos_acumulable.json  - lo cargado a mano a partir de las bases y condiciones oficiales (ver promos_bases.py).
  2. Los términos y condiciones de la propia promo en MODO (modo_fetch.py los lee de cada publicación).
  3. El mismo descuento publicado en MODO (mismo comercio, porcentaje, días y bancos): se copia su respuesta.
Si nada lo dice, el descuento queda sin dato y la web lo muestra como «no informado»; nunca se inventa.

Cada descuento resuelto lleva:
  acumulable   true / false, o {"comercio": true/false} si cambia según el comercio
  acum_texto   la frase de las bases que lo dice (se muestra en la web)
  acum_fuente  de dónde salió (dirección web)
"""
import html
import json
import re
from pathlib import Path

DATA = Path(__file__).resolve().parent.parent / "data"

NO = re.compile(r"\bno\s+(?:\w+\s+){0,2}?(?:acumul\w*|combin\w*|suma\w*)|\bsin acumular|\bni (?:se )?acumul|\bno acumulando", re.I)
SI = re.compile(r"\b(?:podr[aá]n? acumular|puede acumular|acumulab?le|acumulables|acumula|acumulan|combinable|se suma(?:n)? (?:a|con))\b", re.I)
OTRAS = re.compile(r"promo|descuento|oferta|beneficio|reintegro", re.I)     # la frase habla de otras promos, no de «acumular puntos»
SOLO_BANCO = re.compile(r"bancari|modo|billetera|banco", re.I)             # «acumulable con otros descuentos bancarios»: no habla de las ofertas del súper
DEL_SUPER = re.compile(r"ofertas|promociones vigentes|todas las promo|del (?:comercio|super)|folleto", re.I)


def limpiar(t):
    t = re.sub(r"<[^>]+>", " ", t or "")
    return re.sub(r"\s+", " ", html.unescape(t)).strip()


def frase_acum(texto):
    """(valor, frase) de los términos y condiciones.
    valor: False = no se acumula con otras promociones; True = sí; "banco" = solo dice que se suma a otros descuentos
    bancarios o de MODO (no aclara nada sobre las ofertas del súper); None = no dice."""
    t = limpiar(texto)
    si = banco = None
    for m in re.finditer(r"[^.;]{0,200}(?:acumul|combin|\bsuma)[^.;]{0,200}", t, re.I):
        f = m.group(0).strip(" *-–·")
        if not OTRAS.search(f):
            continue
        if NO.search(f):
            return False, f[:300]
        if SI.search(f):
            if SOLO_BANCO.search(f) and not DEL_SUPER.search(f):
                banco = banco or f[:300]
            else:
                si = si or f[:300]
    if si:
        return True, si
    return ("banco", banco) if banco else (None, None)


def _load(nombre, vacio):
    p = DATA / nombre
    return json.loads(p.read_text(encoding="utf-8")) if p.exists() else vacio


def _clave(p):
    return (frozenset(p.get("stores") or []), p.get("pct") or 0, tuple(sorted(p.get("dias") or [])), p.get("minimo") or 0)


def aplicar(promos, modo=None):
    """Completa acumulable / acum_texto / acum_fuente en cada descuento de la lista (sin pisar lo que ya traiga)."""
    manual = _load("promos_acumulable.json", {}).get("promos", {})
    por_clave = {}
    for m in (modo or []):
        if m.get("acumulable") is not None:
            por_clave.setdefault(_clave(m), []).append(m)
    n = 0
    for p in promos:
        if p.get("acumulable") is not None:
            continue
        x = manual.get(p.get("id"))
        if x:
            p["acumulable"] = x["acumulable"]
            p["acum_texto"], p["acum_fuente"] = x.get("texto"), x.get("fuente")
        else:
            cand = [m for m in por_clave.get(_clave(p), [])
                    if not p.get("medio") or p["medio"] == "modo" or p["medio"] == m.get("medio") or p["medio"] in (m.get("bancos") or [])]
            vals = {m["acumulable"] for m in cand}
            if len(vals) == 1:            # todas las publicaciones de MODO coinciden
                m = cand[0]
                p["acumulable"], p["acum_texto"], p["acum_fuente"] = m["acumulable"], m.get("acum_texto"), m.get("fuente")
        n += "acumulable" in p
    return n
