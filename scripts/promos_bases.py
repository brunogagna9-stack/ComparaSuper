"""Lee las páginas de origen de los descuentos y junta las frases que dicen si se acumulan con otras promociones.

Usa Scrapling (https://github.com/D4Vinci/Scrapling) para entrar a cada página como un navegador común (varias
tiendas rechazan los pedidos «de programa» con error 403). Solo lee páginas públicas, una vez por semana,
con una pausa entre pedidos, y no intenta saltear ninguna protección: si una página no responde, se anota y sigue.

Qué hace:
  1. Junta las direcciones «fuente» de los descuentos cargados (data/promos_pago.json, data/promos_regionales.json)
     y las de data/sitios_promos.json (páginas de bases y condiciones de las cadenas).
  2. De cada una guarda las frases que hablan de acumulación («no acumulable con otras promociones», «se suma a…»).
  3. Escribe data/promos_bases.json. Esas frases son la evidencia: para marcar un descuento como acumulable
     o no se usa el campo "acumulable" de cada descuento (true / false). Nunca se decide solo con una página que
     habla de muchos descuentos a la vez; en ese caso queda como evidencia para revisar.

Uso: python scripts/promos_bases.py
"""
import datetime as dt
import json
import re
import time
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DATA = ROOT / "data"
OUT = DATA / "promos_bases.json"
PAUSA = 1.0                      # segundos entre páginas
MAX_FRASES = 8
CLAVE = re.compile(r"acumul|combin(a|able)|no se suma|se suma(n)? (a|con)|otras? (promo|oferta|descuento|beneficio)|otros (descuentos|beneficios|reintegros)", re.I)
NO_ACUM = re.compile(r"no (es |son |se )?(acumulable|acumula|acumulan|combina|combinan|suma|aplica con)|sin acumular|ni acumul|no acumulando|excluyendo y no acumul|no podr[aá](n)? (acumular|combinar)", re.I)
SI_ACUM = re.compile(r"(es |son |se )?(acumulable|acumulables|acumula|acumulan|combinable|puede acumular|podr[aá](n)? acumular|se suma(n)? (a|con))", re.I)


def fuentes():
    urls = {}
    for f in ("promos_pago.json", "promos_regionales.json"):
        p = DATA / f
        if not p.exists():
            continue
        for pr in json.loads(p.read_text(encoding="utf-8")).get("promos", []):
            u = pr.get("fuente") or ""
            if u.startswith("http") and "modo.com.ar" not in u:      # MODO se lee aparte (modo_fetch.py)
                urls.setdefault(u, set()).add(pr.get("id"))
    extra = DATA / "sitios_promos.json"
    if extra.exists():
        for s in json.loads(extra.read_text(encoding="utf-8")).get("paginas", []):
            urls.setdefault(s["url"], set()).add(s.get("comercio") or "sitio")
    return urls


def clasificar(frase):
    """'no' si la frase dice que no se acumula, 'si' si dice que sí, '?' si no queda claro."""
    if NO_ACUM.search(frase):
        return "no"
    if SI_ACUM.search(frase):
        return "si"
    return "?"


def frases_de(texto):
    """Las frases del texto que hablan de acumulación, sin repetir y cortas."""
    cortas, vistas = [], set()
    for m in re.finditer(r"[^.;•\n]{0,160}(?:%s)[^.;•\n]{0,160}" % CLAVE.pattern, texto, re.I):
        f = re.sub(r"\s+", " ", m.group(0)).strip(" *-–·")
        k = f.lower()[:80]
        if len(f) < 25 or k in vistas:
            continue
        vistas.add(k)
        cortas.append({"t": f[:260], "v": clasificar(f)})
    return cortas[:MAX_FRASES]


def leer(url, fetcher):
    try:
        p = fetcher.get(url, stealthy_headers=True, timeout=30, follow_redirects=True)
    except Exception as e:                                       # la página no responde: se anota y se sigue
        return {"estado": "error", "error": str(e)[:100]}
    if p.status != 200:
        return {"estado": p.status}
    texto = " ".join(p.get_all_text().split())
    return {"estado": 200, "frases": frases_de(texto)}


def main():
    try:
        from scrapling.fetchers import Fetcher
    except ImportError:
        raise SystemExit("Falta Scrapling: pip install 'scrapling[fetchers]'")
    previo = json.loads(OUT.read_text(encoding="utf-8")) if OUT.exists() else {}
    paginas = {}
    urls = fuentes()
    for i, (u, ids) in enumerate(sorted(urls.items())):
        r = leer(u, Fetcher)
        if r["estado"] != 200 and u in previo.get("paginas", {}):
            r = previo["paginas"][u] | {"estado_hoy": r["estado"]}        # se conserva lo último que se pudo leer
        r["usada_por"] = sorted(x for x in ids if x)
        paginas[u] = r
        print(f"[{i + 1}/{len(urls)}] {r['estado']} {len(r.get('frases', []))} frases  {u[:90]}")
        time.sleep(PAUSA)
    OUT.write_text(json.dumps({"revisado": dt.date.today().isoformat(), "paginas": paginas}, ensure_ascii=False, indent=1), encoding="utf-8")
    ok = sum(1 for r in paginas.values() if r.get("estado") == 200)
    print(f"Listo: {ok}/{len(paginas)} páginas leídas -> {OUT.name}")
    informe(previo.get("paginas", {}), paginas)


def informe(antes, ahora):
    """Escribe revision_bases.md: frases nuevas o que cambiaron, páginas caídas y descuentos con evidencia sin cargar."""
    cargados = set(json.loads((DATA / "promos_acumulable.json").read_text(encoding="utf-8")).get("promos", {})) if (DATA / "promos_acumulable.json").exists() else set()
    nuevas, caidas, sin_cargar = [], [], []
    for u, r in ahora.items():
        if r.get("estado") != 200 or r.get("estado_hoy"):
            caidas.append(u)
        previas = {f["t"] for f in antes.get(u, {}).get("frases", [])}
        cambios = [f for f in r.get("frases", []) if f["t"] not in previas]
        if u in antes and cambios:
            nuevas.append((u, cambios))
        falta = [i for i in r.get("usada_por", []) if i not in cargados and re.match(r"[nr]\d+$", i)]
        if falta and r.get("frases"):
            sin_cargar.append((u, falta))
    md = [f"Lectura de las bases y condiciones del {dt.date.today().strftime('%d/%m/%Y')}.", ""]
    if nuevas:
        md.append(f"### 🔄 {len(nuevas)} páginas cambiaron lo que dicen sobre acumulación")
        for u, fs in nuevas[:20]:
            md.append(f"- {u}")
            md += [f"  - ({f['v']}) {f['t'][:200]}" for f in fs[:4]]
        md.append("")
    if sin_cargar:
        md.append(f"### 📝 {len(sin_cargar)} páginas con frases sobre acumulación y descuentos sin aclarar")
        md += [f"- {u} → {', '.join(i)}" for u, i in sin_cargar[:30]]
        md.append("")
    if caidas:
        md.append(f"### ⚠️ {len(caidas)} páginas no respondieron")
        md += [f"- {u}" for u in caidas[:30]]
        md.append("")
    hay = bool(nuevas or caidas)
    md.append("**Qué hacer:** pedile a Claude que revise estas frases y actualice `data/promos_acumulable.json`." if hay else "Todo en orden: no hace falta hacer nada.")
    (ROOT / "revision_bases.md").write_text("\n".join(md) + "\n", encoding="utf-8")
    with open(Path(__import__("os").environ.get("GITHUB_OUTPUT", "/dev/null")), "a") as f:
        f.write(f"avisar={'si' if hay else 'no'}\n")


if __name__ == "__main__":
    main()
