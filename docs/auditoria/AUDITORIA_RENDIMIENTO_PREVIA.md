# Auditoría de rendimiento PREVIA — 19/11/2026

Estado medido: la web publicada (https://superbarato.com.ar) **antes** de la fase de optimización avanzada.
Respaldo de este estado: rama `respaldo-2026-11-19-rendimiento`.

## Cómo se midió

| Herramienta | Qué mide | Condiciones |
|---|---|---|
| `tests/auditoria/rendimiento.js` | descargas, código usado, tiempos por sección, toques (≈INP), tareas largas, cuadros, memoria | Chromium real, celular simulado (Pixel 7), CPU 4× más lenta, red real (sin limitar) |
| Lighthouse 12 (×3, celular) | LCP, TBT, CLS, FCP, peso total, puntajes | emulación móvil de Lighthouse (4G lenta simulada + CPU 4×) |
| `size-limit` (como en CI) | código de entrada comprimido (gzip) | mismos archivos minificados que publica el CI |

Todo es **laboratorio** (no datos de usuarios reales). INP se aproxima con Event Timing en una sesión guiada; no es el INP de campo.

## Resultados

### Peso
| Indicador | Valor |
|---|---|
| Código de entrada (límite 160 KB) | **155,3 KB** (margen 3%) |
| Primera visita, sin provincia (al cargar / a los 15 s) | 159,3 KB · 9 pedidos / 166 KB |
| Visita con provincia, a los 15 s | 342,5 KB · 25 pedidos (scripts 108 KB, imágenes 129 KB, datos 49 KB, fuente 27 KB) |
| Vuelta (con caché) | 0–0,5 KB |
| JS / CSS usado al entrar | JS 16 % de 279 KB · CSS 16 % de 90 KB |
| Fuente | 27,4 KB (latín) + 21,7 KB (latín ext.) |

### Lighthouse celular (3 corridas, iguales)
Rendimiento 100 · Accesibilidad 100 · Buenas prácticas 100 · SEO 100 · LCP 1,23 s · FCP 1,08 s · TBT 0 ms · CLS 0 · 163 KB.

### Sesión en celular lento (CPU 4×)
| Indicador | Valor |
|---|---|
| Buscador listo | 3,1–4,4 s |
| Sección más lenta | **#ofertas 8,5–10,1 s** (una sola tarea de 8,4–9,8 s) · #buscar 1,7–1,9 s |
| Otras secciones | 80–615 ms |
| Toques (≈INP) | 128 ms |
| Tareas largas | 34–51, en total 23,8–28,6 s |
| Abrir ficha de producto | 0 cuadros perdidos |
| Memoria tras la sesión | heap 20 → 50 MB · nodos 2.254 → 9.792 · escuchas 119 → 859 |

## Problemas encontrados (causa medida)
1. **Ofertas destacadas**: quitar repetidos con `findIndex` dentro de `filter` (O(n²)) sobre todas las ofertas → tarea de 8–10 s en celular.
2. **Ofertas**: se recalculaba y reordenaba la lista completa en cada filtro.
3. **Búsqueda**: los ordenamientos recalculaban precio, precio por unidad y variación en cada comparación.
4. **auto-animate**: dejaba observadores globales y un `setInterval` cada 2 s por elemento animado que nunca se limpiaban (fuga de memoria/CPU).
5. **floating-ui** (12 KB) cargado al entrar sólo para ubicar tooltips.
6. **mapa.js** (selector de provincias) cargado siempre, aunque sólo se usa en la primera visita o al cambiar de provincia.
7. **cuenta.js** se publicaba sin minificar.
8. La fuente incluía pesos 200–300 que nunca se usan.
9. Algunas transiciones animaban `width` o `all` (fuerzan recalcular el diseño).
10. **¿Dónde conviene? en celular**: con 12 productos la página medía 22.811 px y el resultado quedaba debajo de la lista editable.
