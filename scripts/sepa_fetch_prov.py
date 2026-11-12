"""Precios SEPA de TODO el país, separados por provincia (versión de prueba del mapa por provincias).

Hace lo mismo que sepa_fetch.py, pero:
  - no se queda solo con CABA y Buenos Aires: guarda todas las provincias;
  - el precio de cada producto se calcula POR PROVINCIA (mediana de las sucursales de esa provincia),
    así un precio de Ushuaia no se mezcla con uno de Córdoba;
  - si una sucursal viene sin provincia (o con un texto raro), se ubica por sus coordenadas.

Salida (no se sube al repositorio, la usa build_data_prov.py):
  data/raw-prov/sepa-AAAA-MM-DD.json   {"date", "items": {provincia: [items...]}, "sucursales": {provincia: {tienda: [...]}}}

Uso:  python scripts/sepa_fetch_prov.py               (descarga el último archivo del portal)
      python scripts/sepa_fetch_prov.py archivo.zip   (usa un zip ya descargado)
"""
import json, sys, statistics, tempfile, shutil, datetime as dt
from array import array
from collections import defaultdict, Counter
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import sepa_fetch as S                      # se reusan la descarga y la lectura de los CSV
from provincias import provincia_sucursal, AMBA

ROOT = S.ROOT
OUT = ROOT / "data" / "raw-prov"
MIN_SUCURSALES = 2      # como en la web actual; si la cadena tiene UNA sola sucursal en la provincia, alcanza con esa


def suc_info(r):
    try:
        lat, lon = float(r.get("sucursales_latitud") or 0), float(r.get("sucursales_longitud") or 0)
    except ValueError:
        return None
    if not (-56 < lat < -21 and -74 < lon < -53):
        return None
    calle = " ".join(x for x in (r.get("sucursales_calle", "").strip().title(), r.get("sucursales_numero", "").strip()) if x)
    zona = (r.get("sucursales_barrio") or r.get("sucursales_localidad") or "").strip().title()
    return [round(lat, 5), round(lon, 5), calle, zona]


LATPROV = {}            # tienda -> [[latitud, provincia], ...] (ver "sepa_lat_provincia" en stores.json)
sin_prov = Counter()    # sucursales que no se pudieron ubicar, por tienda
activas = Counter()     # precios informados hoy por cada sucursal: las que no informan nada suelen estar cerradas


def por_latitud(tabla, lat):
    """Algunas cadenas informan solo la latitud (sin longitud ni provincia). Con la tabla de la cadena
    (de norte a sur: [latitud límite, provincia]) se decide la provincia: la primera cuyo límite está al sur del punto."""
    try:
        lat = float(lat)
    except (TypeError, ValueError):
        return None
    for limite, prov in tabla or []:
        if lat > limite:
            return prov
    return None


def summarize(zip_path, stores, acc, nsuc, sucursales, seen, only=None):
    """Recorre un zip de SEPA y suma los precios en acc[(provincia, tienda, ean)]."""
    LATPROV.update({s["id"]: s["sepa_lat_provincia"] for s in stores if s.get("sepa_lat_provincia")})
    S.MAYORISTAS.update(s["id"] for s in stores if s.get("tipo") == "mayorista" or s["id"] == "makro")
    alias = defaultdict(list)
    for s in stores:
        if only is not None and s["id"] not in only:
            continue
        for b in s["sepa_banderas"]:
            alias[S.norm(b)].append((s["id"], [S.norm(k) for k in s.get("sepa_sucursal_contiene", [])]))
    import zipfile
    with zipfile.ZipFile(zip_path) as zf:
        for com_b, suc_b, prod_b in S.iter_comercios(zf):
            bandera = {}
            for r in S.read_csv(com_b):
                seen.add(S.norm(r.get("comercio_bandera_nombre")))
                cands = alias.get(S.norm(r.get("comercio_bandera_nombre")))
                if cands:
                    bandera[(r.get("id_comercio"), r.get("id_bandera"))] = cands
            if not bandera:
                continue
            sucs = {}   # (comercio, bandera, sucursal) -> (provincia, tienda)
            for r in S.read_csv(suc_b):
                key = (r["id_comercio"], r["id_bandera"])
                if key not in bandera:
                    continue
                nombre = S.norm(r.get("sucursales_nombre", "") + " " + r.get("sucursales_tipo", ""))
                cands = bandera[key]
                sid = next((c for c, kw in cands if kw and any(k in nombre for k in kw)), None) \
                    or next((c for c, kw in cands if not kw), None)
                if not sid:
                    continue
                prov = provincia_sucursal(r.get("sucursales_provincia"), r.get("sucursales_latitud"), r.get("sucursales_longitud")) \
                    or por_latitud(LATPROV.get(sid), r.get("sucursales_latitud"))
                if not prov:
                    sin_prov[sid] += 1
                    continue
                k3 = key + (r["id_sucursal"],)
                if k3 not in sucs:
                    nsuc[(prov, sid)] += 1
                sucs[k3] = (prov, sid)
                info = suc_info(r)
                if info:
                    sucursales[prov][sid][k3] = info
            for r in S.read_csv(prod_b):
                k3 = (r.get("id_comercio"), r.get("id_bandera"), r.get("id_sucursal"))
                ps = sucs.get(k3)
                if not ps:
                    continue
                activas[k3] += 1
                ean = S.barcode(r)
                if not ean:
                    continue
                if "precio_unitario_bulto_por_unidad_venta_con_iva" in r:   # base de mayoristas
                    price = S.num(r.get("precio_unitario_bulto_por_unidad_venta_con_iva"))
                    leg, pu = r.get("productos_leyenda_promo1", ""), S.num(r.get("productos_precio_unitario_con_iva_promo1"))
                    qty, unit = S.qty_from_name(r.get("productos_descripcion", ""))
                    bulto = int(S.num(r.get("unidad_venta")) or 1)
                else:
                    price = S.num(r.get("productos_precio_lista"))
                    leg, pu = r.get("productos_leyenda_promo1", ""), S.num(r.get("productos_precio_unitario_promo1"))
                    qty, unit = r.get("productos_cantidad_presentacion", ""), r.get("productos_unidad_medida_presentacion", "")
                    bulto = 1
                if not price:
                    continue
                a = acc.get(ps + (ean,))
                if a is None:
                    a = acc[ps + (ean,)] = {"p": array("f"), "names": Counter(), "meta": (r.get("productos_marca", ""), qty, unit),
                                            "bulto": 1, "promos": None}
                a["p"].append(price)
                if len(a["names"]) < 4:
                    a["names"][r.get("productos_descripcion", "").strip()] += 1
                if bulto > a["bulto"]:
                    a["bulto"] = bulto
                if leg and pu and pu < price:
                    if a["promos"] is None:
                        a["promos"] = defaultdict(list)
                    a["promos"][leg].append(pu)


def items_por_provincia(acc, nsuc):
    out = defaultdict(list)
    for (prov, sid, ean), a in acc.items():
        n = len(a["p"])
        minimo = 1 if sid in S.MAYORISTAS else min(MIN_SUCURSALES, nsuc[(prov, sid)])
        if n < minimo:
            continue
        brand, qty, unit = a["meta"]
        prices = list(a["p"])
        med = round(statistics.median(prices))
        it = {"store": sid, "ean": ean, "name": a["names"].most_common(1)[0][0].strip(), "brand": (brand or "").title(),
              "qty": S.num(qty) or 1, "unit": (unit or "").lower(), "price": med, "price_min": round(min(prices)),
              "price_max": round(max(prices)), "branches": n}
        if a["bulto"] > 1:
            it["bulto"] = a["bulto"]
        if a["promos"]:
            leg, pus = max(a["promos"].items(), key=lambda kv: len(kv[1]))
            if len(pus) / n >= 0.3:
                it["promo"] = {"txt": leg, "pu": round(statistics.median(pus))}
        out[prov].append(it)
    return out


def main():
    stores = json.loads((ROOT / "data" / "stores.json").read_text(encoding="utf-8"))["stores"]
    acc, nsuc, seen = {}, Counter(), set()
    sucursales = defaultdict(lambda: defaultdict(dict))
    date = dt.date.today().isoformat()
    if len(sys.argv) > 1:
        summarize(Path(sys.argv[1]), stores, acc, nsuc, sucursales, seen)
    else:
        for dataset, required, base in S.DATASETS:
            wanted = {st["id"] for st in stores if st["sepa_banderas"] and st.get("sepa_base", "minoristas") == base}
            try:
                files = S.resources(dataset)
            except Exception as e:
                if required:
                    raise
                print(f"AVISO: no se pudo consultar {dataset} ({e})"); continue
            have = set()
            for k, res in enumerate(files[:S.EXTRA_DIAS + 1]):
                missing = None if k == 0 else (wanted - have)
                if missing is not None and not missing:
                    break
                if k == 0 and required:
                    date = (res.get("last_modified") or res.get("created") or date)[:10]
                tmp = Path(tempfile.mkdtemp())
                try:
                    print("Descargando", res["url"], "" if k == 0 else f"(para completar: {sorted(missing)})", flush=True)
                    S.download(res["url"], tmp / "sepa.zip")
                    antes = len(acc)
                    summarize(tmp / "sepa.zip", stores, acc, nsuc, sucursales, seen, only=missing)
                    have |= {sid for (_, sid, _) in acc}
                    print(f"  {dataset}: {len(acc) - antes} precios nuevos", flush=True)
                except Exception as e:
                    if required and k == 0:
                        raise
                    print(f"AVISO: no se pudo leer {res['url']} ({e}); se sigue")
                finally:
                    shutil.rmtree(tmp, ignore_errors=True)
    for s in stores:
        if s["sepa_banderas"] and not any(S.norm(b) in seen for b in s["sepa_banderas"]):
            print(f"AVISO: no encontré la cadena {s['name']} en SEPA")
    if sin_prov:
        print("AVISO: sucursales sin provincia (no se usan):", dict(sin_prov))
    items = items_por_provincia(acc, nsuc)
    total = sum(len(v) for v in items.values())
    if total < 1000:
        raise SystemExit(f"Solo {total} precios: el archivo parece incompleto, no se publica")
    OUT.mkdir(parents=True, exist_ok=True)
    for old in sorted(OUT.glob("*.json"))[:-2]:
        old.unlink()
    cerradas = Counter((p, sid) for p, d in sucursales.items() for sid, v in d.items() for k3 in v if activas[k3] < S.MIN_PRECIOS_SUC)
    if cerradas:
        print(f"Sucursales sin precios hoy (posiblemente cerradas, no se muestran): {sum(cerradas.values())}")
    suc = {p: {sid: sorted(i for k3, i in v.items() if activas[k3] >= S.MIN_PRECIOS_SUC) for sid, v in d.items()} for p, d in sucursales.items()}
    suc = {p: {sid: l for sid, l in d.items() if l} for p, d in suc.items()}
    (OUT / f"sepa-{date}.json").write_text(json.dumps({"date": date, "source": "sepa", "items": items, "sucursales": suc},
                                                      ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    for p in sorted(items):
        print(f"  {p}: {len(items[p])} precios, {len({i['ean'] for i in items[p]})} productos, "
              f"cadenas {sorted({i['store'] for i in items[p]})}")
    print(f"OK: {total} precios en {len(items)} provincias ({date})")


if __name__ == "__main__":
    main()
