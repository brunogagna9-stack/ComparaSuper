"""Descarga la base oficial SEPA (Precios Claros, Secretaría de Comercio) y la resume.

Los supermercados grandes están obligados a informar sus precios todos los días,
sucursal por sucursal, con el código de barras (EAN) de cada producto. Eso permite
comparar EL MISMO producto entre cadenas sin adivinar por el nombre.

Qué hace:
  1. Pide al portal de datos (API CKAN) la lista de archivos y elige el más nuevo.
  2. Lo descarga (es grande: cientos de MB) y lo recorre sin cargarlo entero en memoria.
  3. Se queda con las cadenas de data/stores.json y las sucursales de las provincias elegidas.
  4. Por cadena y producto calcula el precio MEDIANO entre sucursales (más confiable que el
     mínimo, que puede ser un error de una sola sucursal), el rango y la promo más común.
  5. Escribe data/raw/sepa-AAAA-MM-DD.json, que después usa build_data.py.

Uso:  python scripts/sepa_fetch.py               (descarga el último archivo)
      python scripts/sepa_fetch.py archivo.zip   (usa un zip ya descargado)

Formato esperado (Res. 678/2020): un zip con un zip (o carpeta) por comercio, cada uno con
comercio.csv, sucursales.csv y productos.csv separados por "|". Las columnas se leen por
NOMBRE, así que si cambian de orden sigue funcionando.
"""
import csv, io, json, sys, zipfile, statistics, tempfile, shutil, unicodedata, datetime as dt
import urllib.request
from collections import defaultdict, Counter
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
CKAN = "https://datos.produccion.gob.ar/api/3/action/package_show?id={}"
# Base de supermercados (minoristas) y base de mayoristas con salón de ventas.
# La de mayoristas sigue otra resolución (448/2016): si su formato no coincide, se avisa y se sigue sin ella.
DATASETS = [("sepa-precios", True, "minoristas"), ("precios-claros-sepa-mayoristas", False, "mayoristas")]   # (id, obligatoria, base)
PROVINCIAS = ["AR-C", "AR-B"]   # CABA y provincia de Buenos Aires (códigos ISO 3166-2)
REGION = "CABA y provincia de Buenos Aires"
UA = {"User-Agent": "ComparaSuper/0.1 (comparador independiente de precios)"}
MIN_SUCURSALES = 2
EXTRA_DIAS = 2       # cuántos días anteriores se revisan para completar cadenas que faltan en el archivo de hoy
MAYORISTAS = set()   # se completa con data/stores.json (tipo "mayorista")              # un precio informado por una sola sucursal no se publica


def norm(s):
    s = unicodedata.normalize("NFD", (s or "").upper())
    return "".join(c for c in s if unicodedata.category(c) != "Mn").strip()


def resources(dataset):
    """Archivos del dataset (uno por día de la semana), del más nuevo al más viejo."""
    with urllib.request.urlopen(urllib.request.Request(CKAN.format(dataset), headers=UA), timeout=60) as r:
        pkg = json.load(r)["result"]
    res = [x for x in pkg["resources"] if x.get("url", "").lower().endswith(".zip")]
    res.sort(key=lambda x: x.get("last_modified") or x.get("created") or "", reverse=True)
    if not res:
        raise SystemExit("El portal no devolvió archivos .zip de SEPA")
    return res


def download(url, dest):
    with urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=600) as r, open(dest, "wb") as f:
        shutil.copyfileobj(r, f, 1 << 20)


def read_csv(data):
    """Lee un CSV de SEPA (separado por |). Ignora la línea final 'Última actualización'."""
    text = data.decode("utf-8-sig", errors="replace")
    rows = csv.DictReader(io.StringIO(text), delimiter="|")
    for row in rows:
        if not row or not row.get(rows.fieldnames[0]) or norm(row[rows.fieldnames[0]]).startswith("ULTIMA"):
            continue
        yield {k.strip().lower(): (v or "").strip() for k, v in row.items() if k}


def barcode(r):
    """El código de barras está en id_producto; productos_ean dice si ese código es un EAN (1) o un código interno (0)."""
    pid = (r.get("id_producto") or "").strip()
    flag = (r.get("productos_ean") or "").strip()
    if flag not in ("0", "1") and len(flag) >= 8:   # por si algún archivo trae el EAN en esa columna
        pid, flag = flag, "1"
    if flag != "1" or not pid.isdigit() or len(pid.lstrip("0")) < 8:
        return None
    return pid.lstrip("0").zfill(13) if len(pid.lstrip("0")) <= 13 else pid.lstrip("0")


def qty_from_name(name):
    """Los mayoristas no informan la presentación aparte: se lee del nombre (ej. '473 cc', 'X150GR', '1,5 LT')."""
    import re
    m = re.findall(r"(\d+(?:[.,]\d+)?)\s*(KG|KGS|GRS?|G|ML|CC|CM3|LTS?|L)\b", (name or "").upper())
    if not m:
        return "1", "un"
    q, u = m[-1]
    return q.replace(",", "."), u


def num(v):
    try:
        x = float(str(v).replace(",", "."))
        return x if x > 0 else None
    except ValueError:
        return None


ROTOS = []   # zips internos que no se pudieron abrir (se informan al final)
SUCURSALES = {}   # (tienda, comercio, bandera, sucursal) -> ubicación, para "comercios cerca de mí"
ACTIVAS = Counter()   # precios informados hoy por cada sucursal: las que no informan nada suelen estar cerradas
MIN_PRECIOS_SUC = 20


def provincia_sucursal(texto, lat, lon):
    from provincias import provincia_sucursal as ps   # import tardío: provincias.py no depende de este archivo
    return ps(texto, lat, lon)


def sucursal_info(r):
    try:
        lat, lon = float(r.get("sucursales_latitud") or 0), float(r.get("sucursales_longitud") or 0)
    except ValueError:
        return None
    if not (-41.2 < lat < -33.2 and -63.5 < lon < -56.5):   # fuera de CABA y provincia de Buenos Aires (o coordenadas mal cargadas)
        return None
    calle = " ".join(x for x in (r.get("sucursales_calle", "").strip().title(), r.get("sucursales_numero", "").strip()) if x)
    zona = (r.get("sucursales_barrio") or r.get("sucursales_localidad") or "").strip().title()
    prov = (r.get("sucursales_provincia") or "").strip().upper()
    return [round(lat, 5), round(lon, 5), calle, zona] + ([prov] if prov in ("AR-C", "AR-B") else [])


def iter_comercios(zf):
    """Devuelve (comercio, sucursales, productos) como bytes, sea que vengan en zips internos o en carpetas."""
    # se ignoran los archivos ocultos que agrega macOS (__MACOSX/, ._archivo): tienen nombre de zip pero no lo son
    names = [n for n in zf.namelist() if not n.startswith("__MACOSX/") and not n.rsplit("/", 1)[-1].startswith("._")]
    for n in names:
        if n.lower().endswith(".zip"):
            try:
                inner = zipfile.ZipFile(io.BytesIO(zf.read(n)))
            except (zipfile.BadZipFile, OSError) as e:
                ROTOS.append(n)
                print(f"AVISO: no se pudo abrir {n} ({e}); se sigue con el resto")
                continue
            with inner:
                yield from iter_comercios(inner)
    folders = defaultdict(dict)
    for n in names:
        base = n.rsplit("/", 1)[-1].lower()
        if base in ("comercio.csv", "sucursales.csv", "productos.csv"):
            folders[n.rsplit("/", 1)[0] if "/" in n else ""][base] = n
    for f in folders.values():
        if len(f) == 3:
            yield zf.read(f["comercio.csv"]), zf.read(f["sucursales.csv"]), zf.read(f["productos.csv"])


def summarize(zip_path, stores, provincias=PROVINCIAS, seen=None, only=None):
    # nombre de bandera normalizado -> id de nuestra tienda
    # una bandera puede ir a varias tiendas (Diarco Mayorista / Diarco Barrio): se decide por el nombre de la sucursal
    MAYORISTAS.update(s["id"] for s in stores if s.get("tipo") == "mayorista" or s["id"] == "makro")
    alias = defaultdict(list)
    for s in stores:
        if only is not None and s["id"] not in only:
            continue
        for b in s["sepa_banderas"]:
            alias[norm(b)].append((s["id"], [norm(k) for k in s.get("sepa_sucursal_contiene", [])]))
    seen = seen if seen is not None else set()
    acc = defaultdict(lambda: {"prices": [], "promos": Counter(), "promo_pu": defaultdict(list), "names": Counter(), "meta": None})
    with zipfile.ZipFile(zip_path) as zf:
        for com_b, suc_b, prod_b in iter_comercios(zf):
            bandera = {}
            for r in read_csv(com_b):
                cands = alias.get(norm(r.get("comercio_bandera_nombre")))
                seen.add(norm(r.get("comercio_bandera_nombre")))
                if cands:
                    bandera[(r.get("id_comercio"), r.get("id_bandera"))] = cands
            if not bandera:
                continue
            sucs = {}   # (comercio, bandera, sucursal) -> id de nuestra tienda
            for r in read_csv(suc_b):
                key = (r["id_comercio"], r["id_bandera"])
                if key not in bandera:
                    continue
                # provincia corregida por coordenadas si la cadena cargó mal el código (ver provincias.py)
                prov_ok = provincia_sucursal(r.get("sucursales_provincia"), r.get("sucursales_latitud"), r.get("sucursales_longitud"))
                if prov_ok not in provincias:
                    continue
                r["sucursales_provincia"] = prov_ok
                nombre = norm(r.get("sucursales_nombre", "") + " " + r.get("sucursales_tipo", ""))
                cands = bandera[key]
                sid = next((c for c, kw in cands if kw and any(k in nombre for k in kw)), None) \
                    or next((c for c, kw in cands if not kw), None)
                if sid:
                    sucs[key + (r["id_sucursal"],)] = sid
                    info = sucursal_info(r)
                    if info:
                        SUCURSALES[(sid,) + key + (r["id_sucursal"],)] = info
            for r in read_csv(prod_b):
                k3 = (r.get("id_comercio"), r.get("id_bandera"), r.get("id_sucursal"))
                sid = sucs.get(k3)
                if not sid:
                    continue
                ACTIVAS[(sid,) + k3] += 1
                ean = barcode(r)
                if not ean:   # código interno de la cadena: no se puede comparar con otras
                    continue
                if "precio_unitario_bulto_por_unidad_venta_con_iva" in r:   # formato de la base de mayoristas
                    price = num(r.get("precio_unitario_bulto_por_unidad_venta_con_iva"))
                    leg, pu = r.get("productos_leyenda_promo1", ""), num(r.get("productos_precio_unitario_con_iva_promo1"))
                    qty, unit = qty_from_name(r.get("productos_descripcion", ""))
                    bulto = int(num(r.get("unidad_venta")) or 1)
                else:
                    price = num(r.get("productos_precio_lista"))
                    leg, pu = r.get("productos_leyenda_promo1", ""), num(r.get("productos_precio_unitario_promo1"))
                    qty, unit = r.get("productos_cantidad_presentacion", ""), r.get("productos_unidad_medida_presentacion", "")
                    bulto = 1
                if not price:
                    continue
                a = acc[(sid, ean)]
                a["prices"].append(price)
                a["names"][r.get("productos_descripcion", "").strip()] += 1
                a["bulto"] = max(a.get("bulto", 1), bulto)
                if a["meta"] is None:
                    a["meta"] = (r.get("productos_marca", ""), qty, unit)
                if leg and pu and pu < price:
                    a["promos"][leg] += 1
                    a["promo_pu"][leg].append(pu)
    items = []
    for (sid, ean), a in acc.items():
        n = len(a["prices"])
        if n < (1 if sid in MAYORISTAS else MIN_SUCURSALES):   # un mayorista suele tener el mismo precio en todos sus locales
            continue
        brand, qty, unit = a["meta"]
        qty_n = num(qty) or 1
        med = round(statistics.median(a["prices"]))
        it = {"store": sid, "ean": ean, "name": a["names"].most_common(1)[0][0].strip(), "brand": brand.title(),
              "qty": qty_n, "unit": unit.lower(), "price": med, "price_min": round(min(a["prices"])),
              "price_max": round(max(a["prices"])), "branches": n}
        if a.get("bulto", 1) > 1:
            it["bulto"] = a["bulto"]   # mayorista: ese precio por unidad es llevando el bulto completo
        if a["promos"]:
            leg, cnt = a["promos"].most_common(1)[0]
            if cnt / n >= 0.3:   # la promo tiene que estar en al menos 30% de las sucursales
                it["promo"] = {"txt": leg, "pu": round(statistics.median(a["promo_pu"][leg]))}
        items.append(it)
    return items


def main():
    stores = json.loads((ROOT / "data" / "stores.json").read_text(encoding="utf-8"))["stores"]
    items, seen, date = [], set(), dt.date.today().isoformat()
    if len(sys.argv) > 1:
        items = summarize(Path(sys.argv[1]), stores, seen=seen)
    else:
        for dataset, required, base in DATASETS:
            wanted = {st["id"] for st in stores if st["sepa_banderas"] and st.get("sepa_base", "minoristas") == base}
            try:
                files = resources(dataset)
            except Exception as e:
                if required:
                    raise
                print(f"AVISO: no se pudo consultar {dataset} ({e})"); continue
            # el archivo más nuevo; si una cadena no vino (archivo vacío o dañado), se busca en los días anteriores
            for k, res in enumerate(files[:EXTRA_DIAS + 1]):
                have = {i["store"] for i in items}
                missing = None if k == 0 else (wanted - have)
                if missing is not None and not missing:
                    break
                if k == 0 and required:
                    date = (res.get("last_modified") or res.get("created") or date)[:10]
                tmp = Path(tempfile.mkdtemp())
                try:
                    print("Descargando", res["url"], "" if k == 0 else f"(para completar: {sorted(missing)})")
                    download(res["url"], tmp / "sepa.zip")
                    got = summarize(tmp / "sepa.zip", stores, seen=seen, only=missing)
                    print(f"  {dataset}: {len(got)} precios de {sorted({i['store'] for i in got})}")
                    items += got
                except Exception as e:
                    if required and k == 0:
                        raise
                    print(f"AVISO: no se pudo leer {res['url']} ({e}); se sigue")
                finally:
                    shutil.rmtree(tmp, ignore_errors=True)
    # cadenas configuradas que no aparecieron en el archivo: hay que revisar su nombre en stores.json
    for s in stores:
        if s["sepa_banderas"] and not any(norm(b) in seen for b in s["sepa_banderas"]):
            print(f"AVISO: no encontré la cadena {s['name']} en SEPA. Banderas vistas parecidas:",
                  [b for b in seen if norm(s['name'])[:4] in b][:5])
    if ROTOS:
        print(f"AVISO: {len(ROTOS)} archivos internos dañados u ocultos se saltearon: {ROTOS[:10]}")
    if len(items) < 100:
        raise SystemExit(f"Solo {len(items)} precios: el archivo parece incompleto, no se publica")
    # se conservan los precios online leídos hoy por online_fetch.py, si ya corrió
    raw = ROOT / "data" / "raw"; raw.mkdir(parents=True, exist_ok=True)
    demos = list(raw.glob("demo-*.json"))
    for old in demos:                             # al pasar a datos reales se borran los de ejemplo
        old.unlink()
    if demos and (ROOT / "data" / "history.json").exists():
        (ROOT / "data" / "history.json").unlink()   # y su historial inventado
    for old in sorted(raw.glob("*.json"))[:-3]:   # se guardan solo las últimas lecturas; el historial va aparte
        old.unlink()
    # sucursales con su ubicación (se mezclan con las ya guardadas, por si un día falta una cadena)
    suc_path = ROOT / "data" / "sucursales.json"
    prev = json.loads(suc_path.read_text(encoding="utf-8")) if suc_path.exists() else {}
    nuevas = defaultdict(list)
    cerradas = Counter()
    for k, info in SUCURSALES.items():
        if ACTIVAS[k] < MIN_PRECIOS_SUC:   # registrada en la base pero sin precios hoy: no se muestra en el mapa
            cerradas[k[0]] += 1
            continue
        nuevas[k[0]].append(info)
    if cerradas:
        print("Sucursales sin precios hoy (posiblemente cerradas, no se muestran):", dict(cerradas))
    prev.update({k: sorted(v) for k, v in nuevas.items()})
    suc_path.write_text(json.dumps(prev, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    print(f"Sucursales con ubicación: {sum(len(v) for v in prev.values())} de {len(prev)} cadenas")
    out = {"date": date, "source": "sepa", "region": REGION, "items": items}
    (raw / f"sepa-{date}.json").write_text(json.dumps(out, ensure_ascii=False), encoding="utf-8")
    print(f"OK: {len(items)} precios de {len({i['ean'] for i in items})} productos ({date})")


if __name__ == "__main__":
    main()
