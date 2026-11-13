"""Lee las promociones de supermercados publicadas en MODO (modo.com.ar/promos) y las pasa al formato de la web.

MODO publica cada promo con su detalle completo: días, porcentaje, tope, compra mínima, fechas, bancos que
participan y la lista de sucursales adheridas con su provincia. Eso permite que las promos regionales
(«Supermercados de Córdoba», «Supermercados Federal», Átomo, La Reina, Hipertehuelche, etc.) se actualicen solas.

Qué hace:
  1. Junta las promos de la sección Supermercados de MODO y las de supermercados de los bancos de provincia.
  2. Se queda con las que están vigentes en algún día de los próximos 45 días.
  3. Por cada una lee el detalle y las sucursales adheridas (para saber en qué provincias vale).
  4. Escribe data/promos_modo.json. Si MODO no responde, se conserva el archivo anterior y la web sigue igual.

Uso: python scripts/modo_fetch.py
"""
import json, re, sys, time, unicodedata, datetime as dt
import urllib.request, urllib.error
from collections import Counter, defaultdict
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from provincias import codigo, NOMBRE
from acumulable import frase_acum

ROOT = Path(__file__).resolve().parent.parent
import os
OUT = Path(os.environ.get("MODO_OUT") or ROOT / "data" / "promos_modo.json")
UA = {"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130 Safari/537.36",
      "Accept": "application/json", "Origin": "https://www.modo.com.ar", "Referer": "https://www.modo.com.ar/promos"}
MODO = "https://www.modo.com.ar/promos/api/rewards"
HUB = MODO + "/v2/slots?ids=web-modo-hub-supermercados&limit=50&page={}&source=web_modo&origin=WEB_MODO&slot_info=true"
BANCO = "https://rewards-handler.playdigital.com.ar/slots/?slots=web-banco-hub-promos_corriendo&source=web_bank&banks={}&origin=web_bank&slot_info=false&limit=50&page={}&fcalcstatus=running"
DETALLE = MODO + "/v2/benefit/{}"
TIENDAS = ("https://promoshub.modo.com.ar/promos/api/map/stores/applications/onsite?application_id={}&source=web_modo&limit=100"
           "&slots=false&text_search=&page={}&applications=promotions&type=onsite&hasGeolocation=false")
DIAS = {"sunday": 0, "monday": 1, "tuesday": 2, "wednesday": 3, "thursday": 4, "friday": 5, "saturday": 6}
LETRAS = {"D": 0, "L": 1, "M": 2, "X": 3, "J": 4, "V": 5, "S": 6}
SUPER = re.compile(r"super|mercad|almac|autoserv|mayorist|hiper|despensa|chango|coto|\bvea\b|carrefour|\bdia\b|makro|comod|an[oó]nima|"
                   r"[aá]tomo|gallega|cordiez|coope|diarco|josimar|libertad|jumbo|disco|blow ?max|toledo|nini|vital|yaguar", re.I)

# bancos de MODO -> medio de pago de la web (los que no están acá entran como "modo" con la lista de bancos)
BANCOS = {
    "Banco Nación": "bna", "Galicia": "galicia", "BBVA": "bbva", "Santander": "santander", "Macro": "macro", "ICBC": "icbc",
    "Credicoop": "credicoop", "Ciudad": "ciudad", "Supervielle": "supervielle", "Patagonia": "patagonia", "Hipotecario": "hipotecario",
    "Comafi": "comafi", "Banco Columbia": "columbia", "Banco Provincia": "provincia", "NaranjaX": "naranjax",
    "Banco Santa Fe": "bsantafe", "BANCOR": "bancor", "Banco Entre Rios": "bentrerios", "Banco Corrientes": "bcorrientes",
    "Banco Santa Cruz": "bsantacruz", "Banco San Juan": "bsanjuan", "BPN": "bpn", "Banco del Chubut": "bchubut",
    "Banco Santiago": "bsantiago", "Banco de La Pampa": "blapampa", "Nuevo Banco del Chaco": "nbch",
    "Banco de Tierra del Fuego": "btf", "Banco Rioja": "brioja", "Banco Formosa": "bformosa", "Banco Coinag": "coinag",
    "Banco Municipal": "bmunicipal", "Buepp": "buepp", "YOY": "yoy", "Banco Dino": "bdino",
}
# bancos de provincia: si una promo es SOLO de bancos de provincia y no trae sucursales, vale en esas provincias
BANCO_PROV = {"bsantafe": "AR-S", "bancor": "AR-X", "bentrerios": "AR-E", "bcorrientes": "AR-W", "bsantacruz": "AR-Z",
              "bsanjuan": "AR-J", "bpn": "AR-Q", "bchubut": "AR-U", "bsantiago": "AR-G", "blapampa": "AR-L", "nbch": "AR-H",
              "btf": "AR-V", "brioja": "AR-F", "bformosa": "AR-P", "bmunicipal": "AR-S", "coinag": "AR-S", "bdino": "AR-X"}
# bancos que se recorren uno por uno, además de la sección Supermercados de MODO
RECORRER = ["Macro", "Banco Santa Fe", "BANCOR", "Patagonia", "Banco Entre Rios", "Banco Corrientes", "Banco Santa Cruz",
            "Banco San Juan", "BPN", "Banco del Chubut", "Banco Santiago", "Banco de La Pampa", "Nuevo Banco del Chaco",
            "Banco de Tierra del Fuego", "Banco Rioja", "Banco Formosa", "Banco Coinag", "Banco Municipal", "Hipotecario",
            "Supervielle", "Comafi", "ICBC", "Credicoop", "Banco Columbia"]

# nombre del comercio en MODO -> id de la web (cadenas con precios)
CADENAS = [("coto", r"\bcoto\b"), ("changomas", r"chango ?m[aá]s|\bmas ?go\b"), ("carrefourmaxi", r"carrefour maxi"),
           ("carrefour", r"carrefour"), ("dia", r"^(super(mercados)? )?d[ií]a\b|\bdia\b"), ("vea", r"\bvea\b"), ("jumbo", r"\bjumbo\b"),
           ("disco", r"\bdisco\b"), ("makro", r"makro"), ("laanonima", r"an[oó]nima"), ("coope", r"cooperativa obrera|la coope\b"),
           ("diarcobarrio", r"diarco (barrio|pueblo)"), ("diarco", r"diarco"), ("josimar", r"josimar"), ("nini", r"\bnini\b"),
           ("vital", r"\bvital\b"), ("maxiconsumo", r"maxiconsumo"), ("yaguar", r"yaguar"), ("toledo", r"toledo"),
           ("comodin", r"comod[ií]n"), ("marianomax", r"mariano max"), ("california", r"california"), ("unicoop", r"unicoop"),
           ("dar", r"(cadena|supermercados) dar\b")]


# cadenas regionales sin precios en la web: dónde están, para las promos que MODO publica sin lista de sucursales
CADENA_PROV = [(r"alvear", ["AR-S", "AR-E"]), (r"petrelli", ["AR-S"]), (r"\buaa\b", ["AR-S"]), (r"arco ?iris", ["AR-S"]),
               (r"el tunel", ["AR-S"]), (r"cordiez", ["AR-X"]), (r"don emilio", ["AR-X"]), (r"[aá]tomo", ["AR-M", "AR-J", "AR-D", "AR-X"]),
               (r"gallega", ["AR-S"]), (r"la reina", ["AR-S"]), (r"delca", ["AR-S"]), (r"cristian", ["AR-S"]), (r"kilbel", ["AR-S"]),
               (r"\bisis\b", ["AR-X"]), (r"almacor", ["AR-X"]), (r"blow ?max", ["AR-M"]), (r"super a\b", ["AR-M"]),
               (r"hipertehuelche", ["AR-Z", "AR-U", "AR-V", "AR-R", "AR-Q"]), (r"supermercados todo|^todo$", ["AR-R", "AR-Q", "AR-U"])]
# cadenas regionales sin precios: mismo id que en promos_regionales.json, para que no aparezcan repetidas
REGIONALES = [("alvear", "Alvear", r"\balvear\b"), ("petrelli", "Petrelli", r"petrelli"), ("uaa", "UAA", r"\buaa\b"),
              ("arcoiris", "Arco Iris", r"arco ?iris"), ("eltunel", "El Túnel", r"el tunel"), ("cordiez", "Cordiez", r"cordiez"),
              ("atomo", "Átomo", r"[aá]tomo"), ("lagallega", "La Gallega", r"gallega"), ("lareina", "La Reina", r"la reina"),
              ("delca", "Delca", r"delca"), ("supercristian", "Super Cristian", r"cristian"), ("kilbel", "Kilbel", r"kilbel"),
              ("isis", "ISIS", r"\bisis\b"), ("almacor", "Almacor", r"almacor"), ("blowmax", "Blow Max", r"blow ?max"),
              ("supera", "Super A", r"super a\b"), ("hipertehuelche", "Hipertehuelche", r"hipertehuelche"),
              ("todo", "Supermercados TODO", r"supermercados todo|^todo$"), ("supercoop", "Supercoop", r"supercoop"),
              ("basualdo", "Basualdo", r"basualdo"), ("laamistad", "La Amistad", r"la amistad"), ("elnene", "El Nene", r"el nene"),
              ("donluis", "Don Luis", r"don luis"), ("grupogiro", "Grupo Giro", r"\bgiro\b"), ("mami", "Mami", r"\bmami\b"),
              ("supermax", "Supermax", r"supermax")]
# rubros que no son supermercados (MODO a veces los pone en la misma categoría)
NO_SUPER = re.compile(r"l[aá]cteos?|lactea|helad|farmac|carnicer|pescader|poller|pollo|librer|deco|corral[oó]n|hogar|peluquer|motos|joyas|ortoped|"
                      r"construcci|pintur|bistecca|carnes", re.I)


def norm(s):
    s = unicodedata.normalize("NFD", (s or "").lower())
    return re.sub(r"\s+", " ", "".join(c for c in s if unicodedata.category(c) != "Mn")).strip()


def get(url, tries=3):
    for k in range(tries):
        try:
            with urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=40) as r:
                return json.load(r)
        except (urllib.error.URLError, TimeoutError, json.JSONDecodeError) as e:
            if k == tries - 1:
                raise
            time.sleep(2 + 3 * k)


def cadena(nombre):
    n = norm(nombre)
    for sid, rx in CADENAS:
        if re.search(rx, n):
            return sid
    return None


def slug(s):
    return re.sub(r"[^a-z0-9]+", "", norm(s))[:24] or "comercio"


def limpiar_nombre(n):
    """'ARCO IRIS SUPER SUC FUNES' -> 'Arco Iris'; 'SUPERMERCADOS PETRELLI SA' -> 'Petrelli'."""
    t = norm(n).upper()
    t = re.sub(r"\b(S\.?\s?A\.?|S\.?R\.?L\.?|SAS|S\.?A\.?S\.?|LTDA\.?|COOP\.?\s|SUC(URSAL)?\.?\s.*|\d+)\b", " ", t)
    t = re.sub(r"\b(SUPERMERCADOS?|SUPERM|SUPER|SUP|AUTOSERV(ICIO)?|HIPERM(ERCADO)?|MAYORISTA)\b\.?", " ", t)
    t = re.sub(r"[^A-ZÑ ]+", " ", t)
    t = re.sub(r"\s+", " ", t).strip()
    return t.title() if len(t) >= 3 else None


def unicos(nombres):
    """Saca repetidos de la lista de comercios ('La Vencedora', 'Coop A La Vencedora', 'Cooperativa Agricola La Vencedora')."""
    out, vistos = [], []
    for n in nombres:
        k = re.sub(r"\b(coop(erativa)?|agric(ola)?|a|de|la|el|los|las|ltda|limitada|grupo|gpo|cal|agrop|loc(al)?)\b", " ", norm(n))
        k = re.sub(r"\s+", " ", k).strip()
        if len(k) < 3 or any(k in v or v in k for v in vistos):
            continue
        vistos.append(k)
        out.append(n)
    return out


def tarjetas_hub():
    out, p = [], 1
    while p < 40:
        j = get(HUB.format(p))
        c = (j.get("slots") or [{}])[0].get("cards") or []
        for x in c:
            b = x.get("benefit") or {}
            pub = b.get("publication") or {}
            if pub.get("slug"):
                out.append(pub["slug"])
        if len(c) < 50:
            break
        p += 1
    return out


def tarjetas_banco(bid):
    out, p = [], 1
    while p < 80:
        j = get(BANCO.format(bid, p))
        c = (j.get("data") or {}).get("cards") or []
        for x in c:
            sc = json.dumps(x.get("categories_whitelist") or "")
            if re.search(r"\b43\b", sc) or SUPER.search(x.get("title") or ""):
                if x.get("slug"):
                    out.append(x["slug"])
        if len(c) < 50:
            break
        p += 1
    return out


def sucursales(app_id):
    out, p = [], 1
    while p <= 30:
        j = get(TIENDAS.format(app_id, p))
        out += j.get("results") or []
        pg = j.get("pagination") or {}
        if p >= (pg.get("total_pages") or 1):
            break
        p += 1
    return out


def convertir(b, tiendas, bank_names, hoy):
    s = (b.get("conditions") or {}).get("schedule") or {}
    if not s.get("stop_date") or s["stop_date"] < hoy.isoformat() or s.get("start_date", "") > (hoy + dt.timedelta(days=45)).isoformat():
        return None
    offers = b.get("offers") or []
    if not offers:
        return None
    o = offers[0]
    out = o.get("outcomes") or {}
    pct = ((out.get("cashback") or {}).get("amount") or 0) if (out.get("cashback") or {}).get("amount_type", "percent") == "percent" else 0
    inst = [i.get("installments") or i.get("quantity") for i in ((out.get("financing") or {}).get("installments") or []) if isinstance(i, dict)]
    cuotas = max([int(x) for x in inst if str(x).isdigit()] or [0]) or None
    if not pct and not cuotas:
        return None
    lim = (o.get("limits") or {}).get("period_cap") or {}
    per = {"month": "mes", "week": "semana", "day": "dia"}.get(lim.get("reset_by"))
    tope = lim.get("amount_by_period") or None
    banks = [bank_names.get(x, "") for x in ((o.get("requirements") or {}).get("banks") or {}).get("list") or []]
    medios = [BANCOS[n] for n in banks if n in BANCOS]
    if len(medios) == 1 and len(banks) == 1:
        medio, bancos = medios[0], []
    else:
        medio, bancos = "modo", sorted(set(medios))
    flows = set(((b.get("conditions") or {}).get("payment_flow") or {}).get("flows") or [])
    canal = "ambos" if "online" in flows and flows - {"online"} else ("online" if flows == {"online"} else "tienda")
    pago = []
    if flows & {"instore"}:
        pago.append("qr_modo")
    if "instore_nfc" in flows:
        pago.append("nfc")
    if "physical-card" in flows:
        pago.append("credito_fisica")
    if "online" in flows:
        pago.append("online_tarjeta")
    card = b.get("card") or {}
    lugar = (card.get("validity_place") or b.get("name") or "").strip()
    if NO_SUPER.search(lugar):
        return None
    nota = []
    if tope and lim.get("aggregate_by") == "bank":
        nota.append("Tope por banco: si tenés tarjetas de varios bancos, cada uno tiene su tope.")
    # dónde vale: por las sucursales adheridas, o por la cadena, o por el banco de provincia
    provs, nombres, sid = Counter(), Counter(), cadena(lugar)
    por_prov = defaultdict(Counter)        # provincia -> comercios adheridos en esa provincia
    for t in tiendas:
        c = codigo(t.get("province") or "")
        if c:
            provs[c] += 1
        nm = limpiar_nombre(t.get("name") or "")
        if nm:
            nombres[nm] += 1
            if c:
                por_prov[c][nm] += 1
    stores, comercio = [], None
    if sid:
        stores = [sid]
    else:
        varios = re.search(r"supermercados (de|del|adheridos|federal)\b|^supers\b|^supermercados$|^supermecados$", norm(lugar))
        nombre = re.sub(r"\s+", " ", lugar).strip(" .")
        if norm(nombre) in ("", "supermercados", "supermecados", "supers"):
            nombre = "Supermercados adheridos"
        reg = None if varios else next(((i, nm) for i, nm, rx in REGIONALES if re.search(rx, norm(lugar))), None)
        comercio = ({"id": reg[0], "name": reg[1]} if reg else
                    {"id": "m-" + slug(nombre if varios else (nombres.most_common(1)[0][0] if nombres else nombre)), "name": nombre})
        if varios and por_prov:
            comercio["lista"] = {c: unicos([n for n, _ in cnt.most_common(60)])[:30] for c, cnt in por_prov.items()}
        stores = [comercio["id"]]
    provincias = sorted(provs) if provs else None
    if not provincias and not sid:
        provincias = next((pv for rx, pv in CADENA_PROV if re.search(rx, norm(lugar))), None)
    if not provincias and not sid:
        bp = sorted({BANCO_PROV[m] for m in ([medio] + bancos) if m in BANCO_PROV})
        if bp and all(m in BANCO_PROV for m in ([medio] if medio != "modo" else bancos)):
            provincias = bp
        else:
            return None   # comercio desconocido y sin sucursales: no se sabe dónde queda
    acum, acum_texto = frase_acum(b.get("terms_and_conditions"))      # ¿se suma a otras promociones? lo dicen los términos
    return {
        "id": "modo-" + b.get("slug", ""), "medio": medio, "stores": stores,
        "dias": sorted({DIAS[d] for d in s.get("days_of_week") or [] if d in DIAS}) or list(range(7)),
        "pct": pct, "tope": tope, "periodo_tope": per, "minimo": (o.get("requirements") or {}).get("amount_range", {}).get("min") or 0,
        "canal": canal, "pago": pago or ["qr_modo"], "reintegro": "en tu cuenta", "nota": " ".join(nota) or None,
        "cuotas": cuotas, "requiere": [], "desde": s.get("start_date"), "hasta": s.get("stop_date"),
        "fuente": "https://www.modo.com.ar/promos/" + b.get("slug", ""), "fuente_tipo": "oficial",
        "verificado": hoy.isoformat(), "ejemplo": False, "bancos": bancos, "provincias": provincias,
        **({"acumulable": acum, "acum_texto": acum_texto} if acum is not None else {}),
        **({"comercio": comercio} if comercio else {}),
    }


def main():
    hoy = dt.date.today()
    try:
        banks = get(MODO + "/banks?source=app_modo")
    except Exception as e:
        print(f"AVISO: MODO no responde ({e}); se conserva {OUT.name} anterior")
        return
    bank_names = {b["id"]: b["name"] for b in banks}
    ids = {b["name"]: b["id"] for b in banks}
    slugs = []
    try:
        slugs += tarjetas_hub()
    except Exception as e:
        print(f"AVISO: no se pudo leer la sección Supermercados ({e})")
    for n in RECORRER:
        if n in ids:
            try:
                slugs += tarjetas_banco(ids[n])
            except Exception as e:
                print(f"AVISO: no se pudieron leer las promos de {n} ({e})")
    slugs = list(dict.fromkeys(slugs))
    print(f"{len(slugs)} promos de supermercados en MODO", flush=True)
    promos, err = [], 0
    for k, sl in enumerate(slugs):
        try:
            b = get(DETALLE.format(sl))
            s = (b.get("conditions") or {}).get("schedule") or {}
            if not s.get("stop_date") or s["stop_date"] < hoy.isoformat():
                continue
            tiendas = sucursales(b["id"]) if b.get("id") else []
            p = convertir(b, tiendas, bank_names, hoy)
            if p:
                promos.append(p)
        except Exception as e:
            err += 1
            print(f"AVISO: {sl}: {e}")
        time.sleep(0.15)
    if len(promos) < 20 or err > len(slugs) / 3:
        print(f"AVISO: solo {len(promos)} promos ({err} errores); se conserva {OUT.name} anterior")
        return
    OUT.write_text(json.dumps({"leido": hoy.isoformat(), "promos": promos}, ensure_ascii=False, indent=1), encoding="utf-8")
    por_prov = Counter(p2 for p in promos for p2 in (p["provincias"] or ["(donde esté la cadena)"]))
    print(f"OK: {len(promos)} promos de MODO. Por provincia: {dict(por_prov)}")


if __name__ == "__main__":
    main()
