"""Control antes de publicar: si algo está mal, el proceso se corta y la web sigue con los datos anteriores."""
import json, sys, datetime as dt
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
errors = []
try:
    d = json.loads((ROOT / "site/data/products.json").read_text(encoding="utf-8"))
except Exception as e:
    sys.exit(f"products.json no se puede leer: {e}")
ids = {s["id"] for s in d["stores"]}
all_ids = {s["id"] for s in json.loads((ROOT / "data/stores.json").read_text(encoding="utf-8"))["stores"]}
if len(d["products"]) < 20:
    errors.append(f"muy pocos productos ({len(d['products'])})")
for p in d["products"]:
    for o in p["offers"]:
        if o["s"] not in ids:
            errors.append(f"{p['name']}: tienda desconocida {o['s']}")
        if not any(isinstance(o.get(k), (int, float)) and o[k] > 0 for k in ("p", "po")):
            errors.append(f"{p['name']}: sin precio válido en {o['s']}")
        if o.get("promo") and o.get("p") and o["promo"]["pu"] >= o["p"]:
            errors.append(f"{p['name']} ({o['s']}): la promo no es más barata que el precio")
promos = json.loads((ROOT / "data/promos_pago.json").read_text(encoding="utf-8"))
medios = {m["id"] for m in promos["medios"]}
for pr in promos["promos"]:
    if pr["medio"] not in medios: errors.append(f"promo {pr['id']}: medio desconocido")
    if not set(pr["stores"]) <= all_ids: errors.append(f"promo {pr['id']}: tienda desconocida")
    if not (0 <= pr["pct"] <= 100): errors.append(f"promo {pr['id']}: porcentaje inválido")
    if not pr.get("ejemplo") and not (pr.get("fuente") and pr.get("verificado")):
        errors.append(f"promo {pr['id']}: falta la fuente oficial o la fecha de verificación")
    if not all(0 <= x <= 6 for x in pr["dias"]): errors.append(f"promo {pr['id']}: día inválido")
    if not pr.get("pago") or not set(pr["pago"]) <= set(promos["formas_pago"]):
        errors.append(f"promo {pr['id']}: falta aclarar cómo se paga (o la forma de pago no existe)")
    if not set(pr.get("requiere") or []) <= medios: errors.append(f"promo {pr['id']}: 'requiere' con un medio desconocido")
    if not pr.get("ejemplo") and pr.get("fuente_tipo") not in ("oficial", "relevamiento", "prensa"):
        errors.append(f"promo {pr['id']}: fuente_tipo debe ser oficial, relevamiento o prensa")
    if pr["canal"] not in ("tienda", "online", "ambos"): errors.append(f"promo {pr['id']}: canal inválido")
if errors:
    print("ERRORES:\n- " + "\n- ".join(errors[:50])); sys.exit(1)
ej = sum(1 for p in promos["promos"] if p.get("ejemplo"))
print(f"OK: {len(d['products'])} productos; {len(promos['promos'])} promos de pago" + (f" ({ej} de EJEMPLO)" if ej else ""))
