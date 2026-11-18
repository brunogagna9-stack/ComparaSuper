"""Sonda de una sola vez: ¿cuántos productos de SuperBarato están en Open Food Facts (y con foto)?
Solo lee la API pública, respetando su límite (menos de 1 pedido por segundo)."""
import json, time, urllib.request
e = json.load(open("sonda/eans.json"))
UA = {"User-Agent": "SuperBarato/1.0 (contacto@superbarato.com.ar)"}
def ver(ean):
    try:
        url = f"https://world.openfoodfacts.org/api/v2/product/{ean}.json?fields=code,product_name,brands,image_front_url,quantity,countries_tags"
        with urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=20) as r:
            d = json.load(r)
        p = d.get("product") or {}
        return {"ean": ean, "esta": d.get("status") == 1, "foto": bool(p.get("image_front_url")), "nombre": p.get("product_name"), "cant": p.get("quantity")}
    except urllib.error.HTTPError as ex:
        return {"ean": ean, "esta": False, "http": ex.code}
    except Exception as ex:
        return {"ean": ean, "error": str(ex)[:80]}
res = {}
for grupo, eans in e.items():
    rs = []
    for x in eans:
        rs.append(ver(x)); time.sleep(0.8)
    res[grupo] = {"consultados": len(rs), "en_off": sum(1 for r in rs if r.get("esta")), "con_foto": sum(1 for r in rs if r.get("foto")),
                  "errores": sum(1 for r in rs if "error" in r), "ejemplos": [r for r in rs if r.get("foto")][:6]}
print(json.dumps(res, ensure_ascii=False, indent=1))
