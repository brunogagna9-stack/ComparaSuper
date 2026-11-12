"""Revisión de los descuentos con medios de pago cargados a mano (los de MODO se actualizan solos).

Avisa:
  - cuántos descuentos vencen pronto o ya vencieron (la web los oculta solos al vencer, pero hay que cargar los nuevos);
  - qué páginas de origen ya no responden o cambiaron desde la última revisión (puede haber promos nuevas).

Escribe el resumen en revision_promos.md (lo usa el aviso de GitHub) y el estado de cada página en
data/fuentes_estado.json, para comparar la próxima vez.

Uso: python scripts/revisar_promos.py [días de anticipación, por defecto 10]
"""
import datetime as dt, hashlib, json, re, sys, urllib.request
from collections import defaultdict
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DATA = ROOT / "data"
UA = {"User-Agent": "Mozilla/5.0 (compatible; ComparaSuper/0.3; revisión de promociones)"}
DIAS = int(sys.argv[1]) if len(sys.argv) > 1 else 10


def cargar(nombre):
    p = DATA / nombre
    return json.loads(p.read_text(encoding="utf-8")) if p.exists() else {"promos": []}


def huella(url):
    """Código de la página, sin lo que cambia en cada visita (scripts, horas, números de sesión)."""
    try:
        with urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=30) as r:
            html = r.read().decode("utf-8", "ignore")
    except Exception as e:
        return None, str(e)[:80]
    txt = re.sub(r"<script.*?</script>|<style.*?</style>", " ", html, flags=re.S | re.I)
    txt = re.sub(r"<[^>]+>", " ", txt)
    txt = re.sub(r"\d{1,2}:\d{2}(:\d{2})?|[0-9a-f]{16,}", " ", txt)          # horas y códigos aleatorios
    txt = " ".join(t for t in re.split(r"\s+", txt.lower()) if t)
    pct = sorted(set(re.findall(r"\d{1,2}\s?%", txt)))                      # los porcentajes que aparecen
    return hashlib.sha1(txt.encode()).hexdigest()[:16], " ".join(pct)[:200]


def main():
    hoy = dt.date.today()
    lim = (hoy + dt.timedelta(days=DIAS)).isoformat()
    fuentes = {"promos_pago.json": "AMBA (cargadas a mano)", "promos_regionales.json": "Interior (cargadas a mano)"}
    vencen, vencidas, urls = defaultdict(list), defaultdict(list), defaultdict(set)
    total = 0
    for f, nombre in fuentes.items():
        d = cargar(f)
        for p in d.get("promos", []):
            total += 1
            h = p.get("hasta")
            if h and h < hoy.isoformat():
                vencidas[nombre].append(p)
            elif h and h <= lim:
                vencen[nombre].append(p)
            if p.get("fuente", "").startswith("http"):
                urls[p["fuente"]].add(p.get("id"))

    estado_p = DATA / "fuentes_estado.json"
    antes = json.loads(estado_p.read_text(encoding="utf-8")) if estado_p.exists() else {}
    ahora, caidas, cambiaron = {}, [], []
    for u in sorted(urls):
        h, info = huella(u)
        if h is None:
            caidas.append((u, info))
            if u in antes:
                ahora[u] = antes[u]
            continue
        ahora[u] = {"huella": h, "porcentajes": info, "revisado": hoy.isoformat()}
        if u in antes and antes[u].get("huella") != h:
            cambiaron.append((u, antes[u].get("porcentajes", ""), info))
    estado_p.write_text(json.dumps(ahora, ensure_ascii=False, indent=1), encoding="utf-8")

    n_v, n_x = sum(map(len, vencen.values())), sum(map(len, vencidas.values()))
    md = [f"Revisión del {hoy.strftime('%d/%m/%Y')} de los {total} descuentos cargados a mano "
          "(los de MODO se actualizan solos todos los días).", ""]
    if n_v:
        md.append(f"### ⏰ {n_v} vencen en los próximos {DIAS} días")
        for nombre, ps in vencen.items():
            por = defaultdict(int)
            for p in ps:
                por[p["hasta"]] += 1
            md.append(f"- **{nombre}**: " + ", ".join(f"{c} el {dt.date.fromisoformat(h).strftime('%d/%m')}" for h, c in sorted(por.items())))
        md.append("")
    if n_x:
        md.append(f"### ❌ {n_x} ya vencieron (la web ya no los muestra)")
        for nombre, ps in vencidas.items():
            md.append(f"- **{nombre}**: {len(ps)}")
        md.append("")
    if cambiaron:
        md.append(f"### 🔄 {len(cambiaron)} páginas de origen cambiaron desde la última revisión")
        md += [f"- {u}  \n  porcentajes antes: {a or '—'} · ahora: {b or '—'}" for u, a, b in cambiaron[:40]]
        md.append("")
    if caidas:
        md.append(f"### ⚠️ {len(caidas)} páginas de origen no respondieron")
        md += [f"- {u} ({e})" for u, e in caidas[:40]]
        md.append("")
    hay = bool(n_v or n_x or cambiaron)
    md.append("**Qué hacer:** pedile a Claude que actualice los descuentos del mes (relevando las páginas oficiales) y cerrá este aviso."
              if hay else "Todo en orden: no hace falta hacer nada.")
    (ROOT / "revision_promos.md").write_text("\n".join(md) + "\n", encoding="utf-8")
    print("\n".join(md))
    # para el aviso de GitHub: hay algo que hacer
    with open(Path(__import__("os").environ.get("GITHUB_OUTPUT", "/dev/null")), "a") as f:
        f.write(f"avisar={'si' if hay else 'no'}\n")


if __name__ == "__main__":
    main()
