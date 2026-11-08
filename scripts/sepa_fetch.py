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
DATASETS = [("sepa-precios", True), ("precios-claros-sepa-mayoristas", False)]   # (id, obligatoria)
PROVINCIAS = ["AR-C", "AR-B"]   # CABA y provincia de Buenos Aires (códigos ISO 3166-2)
REGION = "CABA y provincia de Buenos Aires"
UA = {"User-Agent": "ComparaSuper/0.1 (comparador independiente de precios)"}
MIN_SUCURSALES = 2              # un precio informado por una sola sucursal no se publica


def norm(s):
    s = unicodedata.normalize("NFD", (s or "").upper())
    return "".join(c for c in s if unicodedata.category(c) != "Mn").strip()


def latest_resource(dataset):
    with urllib.request.urlopen(urllib.request.Request(CKAN.format(dataset), headers=UA), timeout=60) as r:
        pkg = json.load(r)["result"]
    res = [x for x in pkg["resources"] if x.get("url", "").lower().endswith(".zip")]
    res.sort(key=lambda x: x.get("last_modified") or x.get("created") or "", reverse=True)
    if not res:
        raise SystemExit("El portal no devolvió archivos .zip de SEPA")
    return res[0]


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


def num(v):
    try:
        x = float(str(v).replace(",", "."))
        return x if x > 0 else None
    except ValueError:
        return None


ROTOS = []   # zips internos que no se pudieron abrir (se informan al final)


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


def summarize(zip_path, stores, provincias=PROVINCIAS, seen=None):
    # nombre de bandera normalizado -> id de nuestra tienda
    # una bandera puede ir a varias tiendas (Diarco Mayorista / Diarco Barrio): se decide por el nombre de la sucursal
    alias = defaultdict(list)
    for s in stores:
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
                if key not in bandera or r.get("sucursales_provincia", "").upper() not in provincias:
                    continue
                nombre = norm(r.get("sucursales_nombre", "") + " " + r.get("sucursales_tipo", ""))
                cands = bandera[key]
                sid = next((c for c, kw in cands if kw and any(k in nombre for k in kw)), None) \
                    or next((c for c, kw in cands if not kw), None)
                if sid:
                    sucs[key + (r["id_sucursal"],)] = sid
            for r in read_csv(prod_b):
                sid = sucs.get((r.get("id_comercio"), r.get("id_bandera"), r.get("id_sucursal")))
                ean = r.get("productos_ean") or r.get("id_producto")
                price = num(r.get("productos_precio_lista"))
                if not sid or not ean or not price:
                    continue
                if ean.strip("0") == "" or len(ean) < 8:   # códigos internos o vacíos: no comparables entre cadenas
                    continue
                a = acc[(sid, ean)]
                a["prices"].append(price)
                a["names"][r.get("productos_descripcion", "")] += 1
                if a["meta"] is None:
                    a["meta"] = (r.get("productos_marca", ""), r.get("productos_cantidad_presentacion", ""),
                                 r.get("productos_unidad_medida_presentacion", ""))
                leg, pu = r.get("productos_leyenda_promo1", ""), num(r.get("productos_precio_unitario_promo1"))
                if leg and pu and pu < price:
                    a["promos"][leg] += 1
                    a["promo_pu"][leg].append(pu)
    items = []
    for (sid, ean), a in acc.items():
        n = len(a["prices"])
        if n < MIN_SUCURSALES:
            continue
        brand, qty, unit = a["meta"]
        qty_n = num(qty) or 1
        med = round(statistics.median(a["prices"]))
        it = {"store": sid, "ean": ean, "name": a["names"].most_common(1)[0][0].strip(), "brand": brand.title(),
              "qty": qty_n, "unit": unit.lower(), "price": med, "price_min": round(min(a["prices"])),
              "price_max": round(max(a["prices"])), "branches": n}
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
        for dataset, required in DATASETS:
            tmp = Path(tempfile.mkdtemp())
            try:
                res = latest_resource(dataset)
                if required:
                    date = (res.get("last_modified") or res.get("created") or date)[:10]
                print("Descargando", res["url"]); download(res["url"], tmp / "sepa.zip")
                got = summarize(tmp / "sepa.zip", stores, seen=seen)
                print(f"  {dataset}: {len(got)} precios")
                items += got
            except Exception as e:
                if required:
                    raise
                print(f"AVISO: no se pudo leer {dataset} ({e}); se sigue sin esos datos")
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
    out = {"date": date, "source": "sepa", "region": REGION, "items": items}
    (raw / f"sepa-{date}.json").write_text(json.dumps(out, ensure_ascii=False), encoding="utf-8")
    print(f"OK: {len(items)} precios de {len({i['ean'] for i in items})} productos ({date})")


if __name__ == "__main__":
    main()
