"""Información nutricional e ingredientes de los productos (para la ficha de cada producto en la web).

Fuentes (cada una se guarda y se muestra por separado, con su nombre):
  - Ficha de Jumbo (tienda online de Cencosud): tabla nutricional, ingredientes, advertencias y aptitudes.
    Se consulta en tandas de 50 códigos de barras por pedido.
  - Open Food Facts (base abierta, licencia ODbL): solo para los productos que Jumbo no tiene.
    Atribución obligatoria: "(c) Open Food Facts contributors". No se mezcla con los datos de Jumbo.

Cada producto se consulta una vez y se revisa una vez por mes (MESES_VIGENCIA), así la tarea diaria hace pocos
pedidos. Lo obtenido queda en data/nutricion/ (rama "datos") y la web recibe archivos chicos en
site/data/nutri/{j,o}/NN.json (NN = dos últimos dígitos del código de barras), que se bajan solo al abrir la ficha.

Uso: python3 scripts/nutricion.py [--max-jumbo N] [--max-off N]
"""
import ast
import datetime as dt
import json
import re
import sys
import time
import urllib.parse
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
CACHE = ROOT / "data" / "nutricion"
OUT = ROOT / "site" / "data" / "nutri"
JUMBO = "https://www.jumbo.com.ar/api/catalog_system/pub/products/search?"
OFF = "https://world.openfoodfacts.org/api/v2/product/{}.json?fields=ingredients_text_es,ingredients_text,nutriments,serving_size,nutrition_data_per"
UA = {"User-Agent": "SuperBarato/0.1 (comparador de precios; contacto@superbarato.com.ar)"}
DIAS_VIGENCIA = 30
TANDA = 50

# Jumbo abrevia los aditivos en la lista de ingredientes ("col 150 d", "aci 338", "edu sucralosa").
ABREV = {
    "jmaf": "jarabe de maíz de alta fructosa", "col": "colorante", "aci": "acidulante", "aro": "aromatizante",
    "edu": "edulcorante", "est": "estabilizante", "esp": "espesante", "emu": "emulsionante", "con": "conservante",
    "ant": "antioxidante", "res": "resaltador del sabor", "reg": "regulador de acidez", "hum": "humectante",
    "gel": "gelificante", "lev": "leudante", "ant ag": "antiaglutinante", "sec": "secuestrante",
    "agl": "antiaglutinante", "pot": "potenciador del sabor", "glas": "glaseante", "esp gel": "espesante gelificante",
    "acid": "acidulante", "mej": "mejorador de harina", "esp/est": "espesante/estabilizante", "aro nat": "aromatizante natural",
    "aro art": "aromatizante artificial", "aro id nat": "aromatizante idéntico al natural", "vit": "vitamina",
    "cons": "conservante", "rai": "leudante químico", "anah": "antiaglutinante", "ac reg": "regulador de acidez",
    "gla": "glaseante", "exa": "resaltador del sabor", "flo": "mejorador de harina",
}
TABLA = [  # (clave en Jumbo, nombre, unidad por defecto)
    ("energy", "Valor energético", "kcal"), ("carb", "Carbohidratos", "g"), ("sugars", "Azúcares", "g"),
    ("added_sugars", "Azúcares añadidos", "g"), ("protein", "Proteínas", "g"), ("total_fat", "Grasas totales", "g"),
    ("saturated_fat", "Grasas saturadas", "g"), ("trans_fat", "Grasas trans", "g"), ("fiber", "Fibra alimentaria", "g"),
    ("sodium", "Sodio", "mg"),
]
TABLA_OFF = [("energy-kcal", "Valor energético", "kcal", 1), ("carbohydrates", "Carbohidratos", "g", 1), ("sugars", "Azúcares", "g", 1),
             ("proteins", "Proteínas", "g", 1), ("fat", "Grasas totales", "g", 1), ("saturated-fat", "Grasas saturadas", "g", 1),
             ("trans-fat", "Grasas trans", "g", 1), ("fiber", "Fibra alimentaria", "g", 1), ("sodium", "Sodio", "mg", 1000)]


def hoy():
    from zoneinfo import ZoneInfo
    return dt.datetime.now(ZoneInfo("America/Argentina/Buenos_Aires")).date()


def pedir(url, intentos=4):
    for i in range(intentos):
        try:
            with urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=60) as r:
                return json.load(r)
        except urllib.error.HTTPError as e:
            if e.code == 404:
                return None
            time.sleep(4 * (i + 1))
        except Exception:
            time.sleep(4 * (i + 1))
    raise RuntimeError(f"sin respuesta: {url[:120]}")


def lista(v):
    """Los campos de Jumbo vienen como texto con forma de lista de Python: "'agua', 'azúcar'"."""
    if not v:
        return []
    s = str(v[0] if isinstance(v, list) else v).strip()
    try:
        x = ast.literal_eval(s if s.startswith("[") else f"[{s}]")
        return [str(i).strip() for i in x if str(i).strip()]
    except Exception:
        return [t.strip(" '\"") for t in s.split(",") if t.strip(" '\"")]


def expandir(ing):
    """'col 150 d' -> 'colorante (150 d)'; 'cons ins 202' -> 'conservante (INS 202)'; 'jmaf' -> 'jarabe de maíz de alta fructosa'."""
    ing = re.sub(r"\bins\b", "INS", ing.strip())
    partes = ing.split()
    for n in (3, 2, 1):   # prueba primero las abreviaturas de varias palabras
        if len(partes) < n:
            continue
        clave = " ".join(partes[:n]).lower().rstrip(":")
        if clave in ABREV:
            resto = " ".join(partes[n:]).strip()
            if resto.startswith("(") and resto.endswith(")"):
                resto = resto[1:-1]
            return ABREV[clave] + (f" ({resto})" if resto else "")
    return ing


def parse_jumbo(p):
    """Producto de la API de Jumbo -> registro compacto para la web (o None si no tiene nada útil)."""
    r = {}
    ing = lista(p.get("Ingredientes"))
    if ing:
        r["ingl"] = ing   # tal como viene (abreviado); se traduce al escribir los archivos de la web
    tab = None
    try:
        tab = ast.literal_eval(str(p["Tabla Nutricional"][0])) if p.get("Tabla Nutricional") else None
    except Exception:
        tab = None
    if isinstance(tab, dict) and tab.get("energy_value") is not None:
        filas = []
        for k, nom, u in TABLA:
            v, vp = tab.get(f"{k}_value"), tab.get(f"{k}_value_per_portion")
            if v is None and vp is None:
                continue
            filas.append([nom, v, vp, (tab.get(f"{k}_unit_name") or u).replace("kCal", "kcal")])
        r["tab"] = {"base": tab.get("basic_unit_name") or "g", "porcion": tab.get("portion_value"),
                    "porcion_u": tab.get("portion_unit_name") or tab.get("basic_unit_name") or "g",
                    "porcion_txt": tab.get("portion_text") or "", "filas": filas}
    cond = [c for c in lista(p.get("Condiciones Alimentarias")) if c]
    if cond:
        r["cond"] = cond
    aptos = []
    try:
        for s in ast.literal_eval(str(p["Sellos"][0])) if p.get("Sellos") else []:
            if s.get("certification_type_name"):
                aptos.append(s["certification_type_name"])
    except Exception:
        pass
    if aptos:
        r["apto"] = aptos
    return r if ("ingl" in r or "tab" in r) else None


def para_web(d):
    """Registro guardado -> lo que recibe la web (ingredientes ya traducidos)."""
    if not d:
        return None
    d = dict(d)
    if "ingl" in d:
        d["ing"] = ", ".join(expandir(i) for i in d.pop("ingl"))
    return d


def parse_off(p):
    r = {}
    ing = (p.get("ingredients_text_es") or p.get("ingredients_text") or "").strip()
    if ing:
        r["ing"] = re.sub(r"\s+", " ", ing)
    n = p.get("nutriments") or {}
    filas = []
    for k, nom, u, mult in TABLA_OFF:
        v = n.get(f"{k}_100g")
        if v is None or v == "":
            continue
        try:
            filas.append([nom, round(float(v) * mult, 1), None, u])
        except (TypeError, ValueError):
            pass
    if len(filas) >= 4:
        r["tab"] = {"base": "ml" if p.get("nutrition_data_per") == "100ml" else "g", "porcion": None, "porcion_u": "",
                    "porcion_txt": p.get("serving_size") or "", "filas": filas}
    return r if r else None


def leer(path, defecto):
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return defecto


def eans_catalogo():
    P = json.loads((ROOT / "site" / "data" / "products.json").read_text(encoding="utf-8"))["P"]
    return [e.lstrip("0") for e in P["id"] if e.isdigit() and len(e) >= 8]


def vencido(reg, h):
    return not reg or (h - dt.date.fromisoformat(reg["t"])).days >= DIAS_VIGENCIA


def actualizar_jumbo(eans, cache, h, maximo):
    pend = [e for e in eans if vencido(cache.get(e), h)][:maximo]
    print(f"Jumbo: {len(pend)} productos para consultar ({len(eans) - len(pend)} al día)")
    ok = 0
    for i in range(0, len(pend), TANDA):
        tanda = pend[i:i + TANDA]
        q = "&".join("fq=" + urllib.parse.quote(f"alternateIds_Ean:{e}") for e in tanda)
        try:
            res = pedir(f"{JUMBO}{q}&_from=0&_to={TANDA - 1}") or []
        except RuntimeError as e:
            print("  aviso:", e); continue
        vistos = set()
        for p in res:
            reg = parse_jumbo(p)
            for it in p.get("items", []):
                e = (it.get("ean") or "").lstrip("0")
                if e in tanda:
                    vistos.add(e)
                    cache[e] = {"t": h.isoformat(), "d": reg}
                    ok += reg is not None
        for e in tanda:
            if e not in vistos:
                cache[e] = {"t": h.isoformat(), "d": None}   # Jumbo no lo vende: se vuelve a mirar en un mes
        time.sleep(0.4)
    print(f"Jumbo: {ok} con información")


def actualizar_off(eans, jumbo, cache, h, maximo):
    pend = [e for e in eans if not (jumbo.get(e) or {}).get("d") and vencido(cache.get(e), h)][:maximo]
    print(f"Open Food Facts: {len(pend)} productos para consultar")
    ok = 0
    for e in pend:
        try:
            d = pedir(OFF.format(e))
        except RuntimeError as err:
            print("  aviso:", err); break
        reg = parse_off(d["product"]) if d and d.get("status") == 1 else None
        cache[e] = {"t": h.isoformat(), "d": reg}
        ok += reg is not None
        time.sleep(0.7)   # su límite es 100 pedidos por minuto
    print(f"Open Food Facts: {ok} con información")


def escribir(cache, carpeta, catalogo):
    """Archivos para la web: un archivo por terminación del código de barras (00..99)."""
    carpeta.mkdir(parents=True, exist_ok=True)
    grupos = {f"{i:02d}": {} for i in range(100)}
    for e, reg in cache.items():
        if reg.get("d") and e in catalogo:
            grupos[e[-2:].rjust(2, "0")][e] = para_web(reg["d"])
    for k, g in grupos.items():
        (carpeta / f"{k}.json").write_text(json.dumps(g, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    return sum(len(g) for g in grupos.values())


def main(argv):
    max_j = int(argv[argv.index("--max-jumbo") + 1]) if "--max-jumbo" in argv else 4000
    max_o = int(argv[argv.index("--max-off") + 1]) if "--max-off" in argv else 300
    h = hoy()
    CACHE.mkdir(parents=True, exist_ok=True)
    eans = eans_catalogo()
    cat = set(eans)
    cj, co = leer(CACHE / "jumbo.json", {}), leer(CACHE / "off.json", {})
    try:
        actualizar_jumbo(eans, cj, h, max_j)
    finally:
        (CACHE / "jumbo.json").write_text(json.dumps(cj, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    try:
        actualizar_off(eans, cj, co, h, max_o)
    finally:
        (CACHE / "off.json").write_text(json.dumps(co, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    nj, no = escribir(cj, OUT / "j", cat), escribir(co, OUT / "o", cat)
    print(f"Listo: {nj} productos con datos de Jumbo y {no} de Open Food Facts en site/data/nutri/")


if __name__ == "__main__":
    main(sys.argv[1:])
