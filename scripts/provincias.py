"""Las 24 provincias: código ISO (el mismo que usa SEPA), nombre y carpeta de datos de la web.

También ubica un punto (latitud, longitud) en su provincia, para las sucursales que
SEPA informa sin provincia o con la provincia mal cargada.
"""
import json, unicodedata
from functools import lru_cache
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent

# código ISO 3166-2, nombre (igual que en el mapa de la web)
PROVS = [
    ("AR-C", "Ciudad de Buenos Aires"), ("AR-B", "Buenos Aires"), ("AR-K", "Catamarca"), ("AR-H", "Chaco"),
    ("AR-U", "Chubut"), ("AR-X", "Córdoba"), ("AR-W", "Corrientes"), ("AR-E", "Entre Ríos"), ("AR-P", "Formosa"),
    ("AR-Y", "Jujuy"), ("AR-L", "La Pampa"), ("AR-F", "La Rioja"), ("AR-M", "Mendoza"), ("AR-N", "Misiones"),
    ("AR-Q", "Neuquén"), ("AR-R", "Río Negro"), ("AR-A", "Salta"), ("AR-J", "San Juan"), ("AR-D", "San Luis"),
    ("AR-Z", "Santa Cruz"), ("AR-S", "Santa Fe"), ("AR-G", "Santiago del Estero"), ("AR-T", "Tucumán"),
    ("AR-V", "Tierra del Fuego"),
]
NOMBRE = dict(PROVS)
AMBA = {"AR-C", "AR-B"}   # usan los datos de la web actual (con precios online)


def carpeta(code):
    """Carpeta de datos de la provincia dentro de site/data/p/ (ej. AR-X -> x)."""
    return code.split("-")[1].lower()


def _norm(s):
    s = unicodedata.normalize("NFD", (s or "").upper())
    return "".join(c for c in s if unicodedata.category(c) != "Mn").strip()


_POR_NOMBRE = {_norm(n): c for c, n in PROVS}
_POR_NOMBRE.update({"CABA": "AR-C", "CAPITAL FEDERAL": "AR-C", "CIUDAD AUTONOMA DE BUENOS AIRES": "AR-C",
                    "PROVINCIA DE BUENOS AIRES": "AR-B", "BS. AS.": "AR-B", "BS AS": "AR-B", "TIERRA DEL FUEGO, ANTARTIDA E ISLAS DEL ATLANTICO SUR": "AR-V"})


def codigo(texto):
    """'AR-X', 'Córdoba', 'CORDOBA' -> 'AR-X'. Devuelve None si no se reconoce."""
    t = _norm(texto)
    if t in NOMBRE:
        return t
    return _POR_NOMBRE.get(t)


@lru_cache(maxsize=1)
def _poligonos():
    g = json.loads((ROOT / "data" / "geo" / "provincias.geojson").read_text(encoding="utf-8"))
    out = []
    for f in g["features"]:
        c = codigo(f["properties"]["name"])
        geom = f["geometry"]
        polys = geom["coordinates"] if geom["type"] == "MultiPolygon" else [geom["coordinates"]]
        for poly in polys:
            ring = poly[0]
            xs, ys = [p[0] for p in ring], [p[1] for p in ring]
            out.append((c, (min(xs), min(ys), max(xs), max(ys)), ring))
    return out


def _dentro(x, y, ring):
    ins = False
    j = len(ring) - 1
    for i in range(len(ring)):
        xi, yi = ring[i]; xj, yj = ring[j]
        if (yi > y) != (yj > y) and x < (xj - xi) * (y - yi) / (yj - yi) + xi:
            ins = not ins
        j = i
    return ins


def por_coordenadas(lat, lon):
    """Provincia que contiene el punto, o la más cercana si cae justo afuera (costa, límites simplificados)."""
    try:
        lat, lon = float(lat), float(lon)
    except (TypeError, ValueError):
        return None
    if not (-56 < lat < -21 and -74 < lon < -53):
        return None
    cerca = []
    for c, (x0, y0, x1, y1), ring in _poligonos():
        if x0 <= lon <= x1 and y0 <= lat <= y1 and _dentro(lon, lat, ring):
            if c == "AR-C":
                return c            # CABA está dentro del contorno de Buenos Aires: gana la Ciudad
            cerca.append(c)
    if cerca:
        return cerca[0]
    # fuera de todos (orilla, río): el vértice más cercano
    best = None
    for c, _, ring in _poligonos():
        for px, py in ring[::4]:
            d = (px - lon) ** 2 + (py - lat) ** 2
            if best is None or d < best[0]:
                best = (d, c)
    return best[1] if best and best[0] < 0.25 else None


def provincia_sucursal(texto, lat=None, lon=None):
    """Provincia de una sucursal: la que informa SEPA si se reconoce; si viene vacía o rara, por coordenadas.
    (Los contornos del mapa están simplificados: cerca de un límite no son exactos, por eso no pisan lo informado.)"""
    return codigo(texto) or por_coordenadas(lat, lon)
