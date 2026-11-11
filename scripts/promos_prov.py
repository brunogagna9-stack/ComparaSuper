"""Arma site/data/p/<x>/promos.json para cada provincia (versión de prueba del mapa por provincias).

Junta tres fuentes:
  - data/promos_pago.json        promos relevadas en AMBA (la mayoría son de bancos y billeteras nacionales);
  - data/promos_regionales.json  promos del interior cargadas a mano;
  - data/promos_modo.json        promos leídas de MODO por modo_fetch.py (se actualizan solas).

Dónde vale cada promo:
  - si trae "provincias", solo ahí;
  - si no, en las provincias donde está alguna de sus cadenas (según los precios de esa provincia).
  Cuenta DNI solo en Buenos Aires y Ciudadanía Porteña solo en CABA.
Si una promo de MODO repite una cargada a mano (misma cadena, mismo día y mismo porcentaje), queda la de MODO,
que es la que se actualiza sola.

Uso: python scripts/promos_prov.py
"""
import json, sys, datetime as dt
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from provincias import PROVS, AMBA, carpeta

ROOT = Path(__file__).resolve().parent.parent
DATA, SITE = ROOT / "data", ROOT / "site" / "data"
SOLO = {"cuentadni": ["AR-B"], "ciudadania": ["AR-C"]}


def load(p, default=None):
    return json.loads(p.read_text(encoding="utf-8")) if p.exists() else default


def cadenas_de(code):
    meta = load(SITE / "meta.json") if code in AMBA else load(SITE / "p" / carpeta(code) / "meta.json")
    return {s["id"] for s in (meta or {}).get("stores", [])}


def clave(pr):
    return (tuple(sorted(pr["stores"])), pr["pct"], pr.get("cuotas") or 0)


def main():
    hoy = dt.date.today().isoformat()
    amba = load(DATA / "promos_pago.json")
    reg = load(DATA / "promos_regionales.json", {"medios": [], "comercios": {}, "promos": []})
    modo = load(DATA / "promos_modo.json", {"promos": []})
    medios = {m["id"]: m for m in amba["medios"] + reg["medios"]}
    comercios = dict(reg.get("comercios") or {})
    for pr in modo["promos"]:
        if pr.get("comercio"):
            c = pr["comercio"]
            comercios.setdefault(c["id"], {"name": c["name"]})
            if c.get("lista"):
                comercios[c["id"]].setdefault("lista", {}).update(c["lista"])
    manual = []
    for pr in amba["promos"]:
        pr = dict(pr)
        pr.setdefault("provincias", SOLO.get(pr["medio"]))
        manual.append(pr)
    manual += reg["promos"]
    # MODO manda: se descartan las manuales que repite (misma cadena, %, cuotas y algún día en común)
    vistos = {}
    for pr in modo["promos"]:
        vistos.setdefault(clave(pr), []).append(set(pr["dias"]))
    todas = [pr for pr in manual if not any(set(pr["dias"]) & d for d in vistos.get(clave(pr), []))] + modo["promos"]
    todas = [pr for pr in todas if (pr.get("hasta") or "9999") >= hoy]
    resumen = []
    for code, nombre in PROVS:
        hay = cadenas_de(code)
        out_p, usados_c = [], set()
        for pr in todas:
            provs = pr.get("provincias")
            if provs is not None:
                if code not in provs:
                    continue
            elif not any(s in hay for s in pr["stores"]):
                continue
            q = {k: v for k, v in pr.items() if k not in ("provincias", "comercio")}
            q["stores"] = [s for s in pr["stores"] if s in hay or s in comercios]
            if not q["stores"]:
                continue
            for s in q["stores"]:
                if s in comercios:
                    usados_c.add(s)
            out_p.append(q)
        com = {}
        for cid in usados_c:
            c = comercios[cid]
            com[cid] = {"name": c["name"]}
            lista = (c.get("lista") or {}).get(code)
            if lista:
                com[cid]["lista"] = lista
        usados_m = {pr["medio"] for pr in out_p} | {b for pr in out_p for b in pr.get("bancos", [])} | {r for pr in out_p for r in pr.get("requiere", [])}
        doc = {"tipos": amba["tipos"], "formas_pago": amba["formas_pago"], "medios": [m for i, m in medios.items() if i in usados_m],
               "relevado": max(amba.get("relevado", ""), reg.get("relevado", "")), "modo_leido": modo.get("leido"),
               "comercios": com, "promos": out_p}
        d = SITE / "p" / carpeta(code)
        d.mkdir(parents=True, exist_ok=True)
        (d / "promos.json").write_text(json.dumps(doc, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
        resumen.append(f"{nombre}: {len(out_p)}")
    print("Promos por provincia: " + ", ".join(resumen))


if __name__ == "__main__":
    main()
