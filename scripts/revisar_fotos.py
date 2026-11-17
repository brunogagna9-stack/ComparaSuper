"""Revisa que las fotos de productos sigan existiendo en las tiendas (a veces las borran y quedan rotas).
Cada día revisa un tramo (las que hace más tiempo que no se revisan), sin cargar a las tiendas: pocas a la vez.
Si una foto ya no existe (404/410), se saca de data/imagenes.json: al día siguiente online_fetch.py busca otra
para ese producto, y mientras tanto la web muestra el dibujito del tipo de producto (nunca una imagen rota).
Uso: python scripts/revisar_fotos.py [cantidad_por_día]
"""
import concurrent.futures as cf
import datetime as dt
import json
import sys
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
IMG, REV, ROT = ROOT / "data" / "imagenes.json", ROOT / "data" / "fotos_revisadas.json", ROOT / "data" / "fotos_rotas.json"
POR_DIA = int(sys.argv[1]) if len(sys.argv) > 1 else 2500


def estado(url):
    for metodo in ("HEAD", "GET"):   # algunas tiendas no responden HEAD
        try:
            req = urllib.request.Request(url, method=metodo, headers={"User-Agent": "SuperBarato/1.0 (+https://superbarato.com.ar)", "Range": "bytes=0-0"})
            with urllib.request.urlopen(req, timeout=15) as r:
                return r.status
        except urllib.error.HTTPError as e:
            if e.code in (404, 410):
                return e.code
            if metodo == "GET":
                return e.code
        except Exception:
            if metodo == "GET":
                return 0   # sin respuesta: no se decide nada
    return 0


def main():
    if not IMG.exists():
        print("No hay data/imagenes.json"); return
    imgs = json.loads(IMG.read_text(encoding="utf-8"))
    rev = json.loads(REV.read_text(encoding="utf-8")) if REV.exists() else {}
    rev = {e: d for e, d in rev.items() if e in imgs}
    hoy = dt.date.today().isoformat()
    # fotos que ya se sabe que no existen (la tienda a veces las sigue listando): se sacan sin volver a pedirlas
    muertas = json.loads(ROT.read_text(encoding="utf-8")) if ROT.exists() else {}
    muertas = {u: d for u, d in muertas.items() if d >= (dt.date.today() - dt.timedelta(days=90)).isoformat()}
    for e in [e for e, u in imgs.items() if u in muertas]:
        imgs.pop(e); rev.pop(e, None)
    tanda = sorted(imgs, key=lambda e: rev.get(e, ""))[:POR_DIA]
    rotas = []
    with cf.ThreadPoolExecutor(max_workers=6) as ex:
        for e, st in zip(tanda, ex.map(lambda e: estado(imgs[e]), tanda)):
            if st in (404, 410):
                rotas.append(e)
            elif st:
                rev[e] = hoy
    for e in rotas:
        muertas[imgs[e]] = hoy
        imgs.pop(e, None); rev.pop(e, None)
    ROT.write_text(json.dumps(muertas, separators=(",", ":")), encoding="utf-8")
    IMG.write_text(json.dumps(imgs, separators=(",", ":")), encoding="utf-8")
    REV.write_text(json.dumps(rev, separators=(",", ":")), encoding="utf-8")
    print(f"Fotos revisadas hoy: {len(tanda)}; ya no existían: {len(rotas)} (se buscará otra). Total con foto: {len(imgs)}")


if __name__ == "__main__":
    main()
