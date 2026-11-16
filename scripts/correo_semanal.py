"""Arma el correo semanal de novedades de SuperBarato (HTML listo para pegar en Brevo).

Lee los datos publicados en la web (productos y descuentos) y elige:
  1. productos que bajaron de precio en la última lectura,
  2. ofertas por cantidad (2x1, 3x2, 2.º al 70 %, etc.) con más ahorro,
  3. los mejores descuentos con bancos y billeteras para cada día de la semana.

Uso:  python3 scripts/correo_semanal.py            → escribe correo/semana-AAAA-MM-DD.html
      python3 scripts/correo_semanal.py --local     → usa site/data en vez de la web publicada
El pie usa {{ unsubscribe }}, la etiqueta de Brevo para el enlace de baja.
"""
import datetime as dt
import html
import json
import pathlib
import sys
import urllib.request

RAIZ = pathlib.Path(__file__).resolve().parent.parent
WEB = "https://superbarato.com.ar/"
K = ["p", "po", "pon", "pmax", "bulto", "promo", "chg", "anom", "low"]
DIAS = ["Domingo", "Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado"]
VERDE, AMARILLO = "#0e7a55", "#ffc72c"


ZONAS = {"amba": "CABA y GBA", "b": "la provincia de Buenos Aires", "k": "Catamarca", "h": "Chaco", "u": "Chubut", "x": "Córdoba", "w": "Corrientes",
         "e": "Entre Ríos", "p": "Formosa", "y": "Jujuy", "l": "La Pampa", "f": "La Rioja", "m": "Mendoza", "n": "Misiones", "q": "Neuquén",
         "r": "Río Negro", "a": "Salta", "j": "San Juan", "d": "San Luis", "z": "Santa Cruz", "s": "Santa Fe", "g": "Santiago del Estero",
         "v": "Tierra del Fuego", "t": "Tucumán", "c": "CABA"}


def leer(nombre, zona="amba"):
    carpeta = "data/" if zona == "amba" else f"data/p/{zona}/"
    if "--local" in sys.argv:
        return json.loads((RAIZ / "site" / carpeta / nombre).read_text(encoding="utf-8"))
    req = urllib.request.Request(WEB + carpeta + nombre, headers={"User-Agent": "SuperBarato/0.1 (correo semanal)"})
    return json.loads(urllib.request.urlopen(req, timeout=60).read())


def productos(d):
    tiendas = {s["id"]: s["name"] for s in d["stores"]}
    P = d["P"]
    for i, offs in enumerate(d["O"]):
        ofertas = []
        for a in offs:
            o = {"s": d["sids"][a[0]]}
            for j in range(1, len(a)):
                if a[j] is not None:
                    o[K[j - 1]] = a[j]
            o["tienda"] = tiendas.get(o["s"], o["s"])
            ofertas.append(o)
        img = P["img"][i]
        if img and not img.startswith("http"):
            h, idi, f = img.split("/")
            img = f"https://{d['imghosts'][int(h)]}/arquivos/ids/{idi}-300-300/{f}"
        yield {"id": P["id"][i], "name": P["name"][i], "img": img, "offers": ofertas}


def plata(v):
    return "$" + f"{round(v):,}".replace(",", ".")


def bajas(ps, n=6):
    """Productos que bajaron de precio en la última lectura (precio de sucursal), con varios comercios."""
    out = []
    for p in ps:
        if len(p["offers"]) < 4:
            continue
        for o in p["offers"]:
            ch = o.get("chg")
            if not ch or o.get("anom") or o.get("bulto", 1) > 1 or not o.get("p"):
                continue
            prev, pct = ch
            if -45 <= pct <= -8 and prev > o["p"]:
                out.append((pct, p, o, prev))
    out.sort(key=lambda x: x[0])
    vistos, res, por_tienda = set(), [], {}
    for pct, p, o, prev in out:
        if p["id"] in vistos or por_tienda.get(o["s"], 0) >= 2:   # variedad: hasta 2 por comercio
            continue
        por_tienda[o["s"]] = por_tienda.get(o["s"], 0) + 1
        vistos.add(p["id"])
        res.append({"p": p, "tienda": o["tienda"], "ahora": o["p"], "antes": prev, "pct": -pct})
        if len(res) == n:
            break
    return res


def por_cantidad(ps, n=6):
    """Ofertas tipo 2x1 / 3x2 / 2.º al 70 % con mayor ahorro por unidad."""
    out = []
    for p in ps:
        if len(p["offers"]) < 3:
            continue
        for o in p["offers"]:
            pr = o.get("promo")
            if not pr or not o.get("p") or o.get("anom"):
                continue
            txt, pu, cant = pr
            ahorro = 1 - pu / o["p"]
            if cant >= 2 and 0.15 <= ahorro <= 0.6:
                out.append((ahorro, p, o, txt, pu, cant))
    out.sort(key=lambda x: -x[0])
    vistos, res, por_tienda = set(), [], {}
    for ahorro, p, o, txt, pu, cant in out:
        if p["id"] in vistos or por_tienda.get(o["s"], 0) >= 2:   # variedad: hasta 2 por comercio
            continue
        por_tienda[o["s"]] = por_tienda.get(o["s"], 0) + 1
        vistos.add(p["id"])
        res.append({"p": p, "tienda": o["tienda"], "txt": txt, "pu": pu, "cant": cant, "ahorro": round(ahorro * 100)})
        if len(res) == n:
            break
    return res


def descuentos(pr, tiendas, desde):
    medios = {m["id"]: m["name"] for m in pr["medios"]}
    res = []
    for k in range(7):
        dia = desde + dt.timedelta(days=k)
        wd = (dia.weekday() + 1) % 7   # 0 = domingo, como en los datos
        hoy = dia.isoformat()
        xs = [x for x in pr["promos"] if wd in x["dias"] and x["desde"] <= hoy <= x["hasta"] and not x.get("ejemplo") and x["medio"] != "todos" and any(t in tiendas for t in x["stores"])]
        xs.sort(key=lambda x: (-x["pct"], x.get("tope") is not None))
        elegidos, usados = [], set()
        for x in xs:
            clave = (x["medio"], tuple(x["stores"]))
            if clave in usados:
                continue
            usados.add(clave)
            ts = [tiendas[t] for t in x["stores"] if t in tiendas]
            donde = ", ".join(ts[:3]) + ("…" if len(ts) > 3 else "")
            tope = f" · tope {plata(x['tope'])}" if x.get("tope") else " · sin tope"
            elegidos.append(f"<b>{x['pct']}%</b> en {html.escape(donde)} con {html.escape(medios.get(x['medio'], x['medio']))}{tope}")
            if len(elegidos) == 2:
                break
        res.append((f"{DIAS[wd]} {dia.day}/{dia.month}", elegidos))
    return res


def tarjeta(p, arriba, precio, abajo):
    link = f"{WEB}p/{p['id']}.html"
    img = f'<img src="{html.escape(p["img"])}" width="120" height="120" alt="" style="display:block;margin:0 auto;width:120px;height:120px;object-fit:contain">' if p["img"] else '<div style="font-size:48px;line-height:120px">🛒</div>'
    return f"""<td width="33%" valign="top" style="padding:6px">
<a href="{link}" style="text-decoration:none;color:#14231c"><table width="100%" cellpadding="0" cellspacing="0" style="background:#fff;border:1px solid #dfe8e3;border-radius:12px"><tr><td align="center" style="padding:12px 10px">
{img}
<div style="font-size:11px;font-weight:700;color:{VERDE};margin-top:8px">{arriba}</div>
<div style="font-size:13px;line-height:1.3;margin:4px 0;height:34px;overflow:hidden">{html.escape(p['name'][:60])}</div>
<div style="font-size:20px;font-weight:800;color:#14231c">{precio}</div>
<div style="font-size:12px;color:#4b5a53">{abajo}</div>
</td></tr></table></a></td>"""


def grilla(celdas):
    filas = [celdas[i:i + 3] for i in range(0, len(celdas), 3)]
    return "".join(f'<tr>{"".join(f)}{"<td></td>" * (3 - len(f))}</tr>' for f in filas)


def main(zona=None):
    zona = zona or next((a.split("=", 1)[1] for a in sys.argv if a.startswith("--zona=")), "amba")
    d, pr = leer("products.json", zona), leer("promos.json", zona)
    region = ZONAS.get(zona, "tu zona")
    ps = list(productos(d))
    tiendas = {s["id"]: s["name"] for s in d["stores"]}
    hoy = dt.date.today()
    lunes = hoy + dt.timedelta(days=(7 - hoy.weekday()) % 7 or 0)
    b, c, dsc = bajas(ps), por_cantidad(ps), descuentos(pr, tiendas, lunes)

    sec_bajas = grilla([tarjeta(x["p"], f"BAJÓ {x['pct']:.0f}%", plata(x["ahora"]), f"antes {plata(x['antes'])} · {html.escape(x['tienda'])}") for x in b])
    sec_cant = grilla([tarjeta(x["p"], html.escape(x["txt"].split(" - ")[0].upper()[:28]), plata(x["pu"]) + " c/u", f"llevando {x['cant']} · {html.escape(x['tienda'])}") for x in c])
    sec_dias = "".join(f'<tr><td style="padding:8px 0;border-top:1px solid #e5ece8;font-size:14px"><b style="color:{VERDE}">{dia}</b><br>{"<br>".join(e) or "Sin descuentos destacados"}</td></tr>' for dia, e in dsc)
    fecha = f"{lunes.day}/{lunes.month}"

    cuerpo = f"""<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Ofertas de la semana · SuperBarato</title></head>
<body style="margin:0;background:#f4f7f5;font-family:Arial,Helvetica,sans-serif;color:#14231c">
<div style="display:none;max-height:0;overflow:hidden">Lo que bajó de precio, las mejores promos y qué banco conviene cada día.</div>
<table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f7f5"><tr><td align="center" style="padding:16px 8px">
<table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%">
<tr><td style="background:{VERDE};border-radius:14px 14px 0 0;padding:22px 24px;color:#fff">
<a href="{WEB}" style="color:#fff;text-decoration:none;font-size:26px;font-weight:800">🛒 Super<span style="color:{AMARILLO}">Barato</span></a>
<div style="font-size:20px;font-weight:700;margin-top:10px">Las ofertas de la semana del {fecha}</div>
<div style="font-size:14px;opacity:.9;margin-top:4px">Precios de supermercados y mayoristas de {region}, comparados en un solo lugar.</div></td></tr>
<tr><td style="background:#fff;padding:20px 18px">
<h2 style="font-size:18px;margin:0 0 8px">📉 Bajaron de precio</h2>
<table width="100%" cellpadding="0" cellspacing="0">{sec_bajas}</table>
<h2 style="font-size:18px;margin:22px 0 8px">🏷️ Ofertas llevando más de uno</h2>
<table width="100%" cellpadding="0" cellspacing="0">{sec_cant}</table>
<h2 style="font-size:18px;margin:22px 0 4px">💳 Qué conviene pagar cada día</h2>
<table width="100%" cellpadding="0" cellspacing="0">{sec_dias}</table>
<p style="font-size:12px;color:#4b5a53;margin:10px 0 0">Revisá topes, días y condiciones en cada banco o billetera. Algunos descuentos se reintegran después.</p>
<table cellpadding="0" cellspacing="0" style="margin:24px auto 4px"><tr><td style="background:{AMARILLO};border-radius:999px"><a href="{WEB}#donde" style="display:inline-block;padding:14px 26px;font-weight:800;color:#14231c;text-decoration:none">Armá tu lista y mirá dónde te conviene »</a></td></tr></table>
</td></tr>
<tr><td style="padding:16px 18px;font-size:12px;color:#4b5a53;text-align:center;line-height:1.5">
Precios de sucursales: base oficial SEPA (Precios Claros), del {d['updated'].split('-')[2]}/{d['updated'].split('-')[1]}; pueden cambiar. Confirmá siempre en el comercio.<br>
Recibís este correo porque te anotaste en <a href="{WEB}" style="color:{VERDE}">superbarato.com.ar</a>.<br>
SuperBarato · Ciudad de Buenos Aires · <a href="mailto:contacto@superbarato.com.ar" style="color:{VERDE}">contacto@superbarato.com.ar</a><br>
<a href="{{{{ unsubscribe }}}}" style="color:{VERDE}">Darme de baja</a> · <a href="{WEB}#cuenta" style="color:{VERDE}">Elegir qué correos recibo</a></td></tr>
</table></td></tr></table></body></html>"""
    sal = RAIZ / "correo" / (f"semana-{lunes.isoformat()}.html" if zona == "amba" else f"semana-{lunes.isoformat()}-{zona}.html")
    sal.parent.mkdir(exist_ok=True)
    sal.write_text(cuerpo, encoding="utf-8")
    print(f"Correo armado para {region}: {sal} ({len(b)} bajas, {len(c)} ofertas por cantidad)")
    return sal, len(b) + len(c)


if __name__ == "__main__":
    main()
