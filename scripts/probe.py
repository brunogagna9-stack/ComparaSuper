import re, json
from playwright.sync_api import sync_playwright
URLS = ["https://www.mercadopago.com.ar/promociones",
        "https://www.mercadopago.com.ar/descuentos",
        "https://www.mercadopago.com.ar/beneficios",
        "https://www.mercadopago.com.ar/ayuda/terminos-y-condiciones-promociones_3830"]
with sync_playwright() as p:
    b = p.chromium.launch()
    pg = b.new_page(locale="es-AR", user_agent="Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0 Safari/537.36")
    apis = []
    pg.on("response", lambda r: apis.append(f"{r.status} {r.url}") if ("json" in (r.headers.get("content-type") or "")) else None)
    for u in URLS:
        try:
            r = pg.goto(u, wait_until="networkidle", timeout=60000); pg.wait_for_timeout(3000)
            t = re.sub(r"\s+", " ", pg.inner_text("body"))
            print("##", u, "->", pg.url, r.status if r else None, len(t)); print("   ", t[:600])
            for m in list(re.finditer(r"(?i)acumul", t))[:8]: print("   ACUM ..", t[max(0, m.start()-200):m.end()+120])
            ls = pg.eval_on_selector_all("a", "as=>as.map(a=>(a.innerText||'').trim().slice(0,60)+' -> '+a.href)")
            for l in ls:
                if re.search(r"(?i)super|coto|carrefour|chango|d[ií]a\b|vea|makro|bases|legal|t[ée]rminos|condiciones", l): print("   link", l)
        except Exception as e: print("ERR", u, str(e)[:200])
    print("--- JSON APIs"); print("\n".join(x for x in apis if "mercado" in x)[:4000])
    b.close()
