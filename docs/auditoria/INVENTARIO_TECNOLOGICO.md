# Inventario tecnológico (investigado el 18/11/2026)

Grupos:
- **A.** Herramientas para el desarrollo (no las usa la web).
- **B.** Tecnología que se incorpora al código de la web.
- **C.** Integraciones de producción (servicios y datos externos).

Valoración: IMPRESCINDIBLE / RECOMENDADA / OPCIONAL / NO RECOMENDADA. El detalle y los motivos de cada decisión están en `EVALUACION_INTEGRACIONES.md`.

## Ya en uso (verificado en el código)

| Tecnología | Grupo | Licencia | Versión | Uso |
|---|---|---|---|---|
| MiniSearch | B | MIT | 7.2.0 | Solo para leer tickets, desde esta etapa |
| Motor propio (`motor.js`) | B | del proyecto | — | Relevancia del buscador |
| zxing-wasm | B | Apache-2.0 | 3.1.6 | Leer códigos de barras con la cámara |
| Tesseract.js | B | Apache-2.0 | 7.0.0 (desde jsDelivr) | Leer el texto de los tickets, en el celular |
| Leaflet + MapLibre GL + OpenFreeMap | B / C | BSD-2 / BSD-3 / datos de OSM (ODbL) | 1.9.4 / 6.18.0 | Mapa de sucursales |
| uPlot | B | MIT | 1.6.32 | Gráfico de precios |
| Workbox | B | MIT | 7.4.1 | Funcionar sin conexión |
| idb-keyval | B | Apache-2.0 | 6.3.0 | Guardar el catálogo en el celular |
| driver.js | B | MIT | 1.12.1 | Recorrido guiado |
| Floating UI | B | MIT | 1.8.0 | Menús flotantes |
| Embla Carousel | B | MIT | 8.6.0 | Carruseles |
| PhotoSwipe | B | MIT | 5.4.4 | Ver fotos en grande |
| fuzzball | B | MIT | 2.2.6 | Emparejar productos en scripts |
| auto-animate | B | MIT | 0.10.2 | Animaciones discretas |
| Firebase Auth / Firestore / App Check | C | servicio de Google | — | Cuentas y avisos |
| Brevo | C | servicio | — | Correos |
| GoatCounter | C | EUPL (servicio) | — | Visitas, sin cookies |
| Playwright + axe-core | A | Apache-2.0 / MPL-2.0 | 1.5x / 4.10 | Pruebas y accesibilidad |
| Biome | A | MIT | 2.x | Lint |
| size-limit | A | MIT | 14.x | Presupuesto de peso |
| Lighthouse CI | A | Apache-2.0 | 0.14 | Calidad en cada cambio |

## Investigado en esta etapa

| Candidato | Grupo | Licencia / costo | Estado (2026) | Valoración |
|---|---|---|---|---|
| **Pruebas de reglas de Firebase** (`@firebase/rules-unit-testing` 6.0.0 + emulador) | A | Apache-2.0, gratis | Oficial, actualizado el 16/11/2026 | **IMPRESCINDIBLE** (implementado) |
| **OSV-Scanner** (acción de Google, v2.7.1) | A | Apache-2.0, gratis | Mantenido por Google | **RECOMENDADA** (implementado) |
| **Vigilancia diaria propia en GitHub Actions** | A | gratis | — | **RECOMENDADA** (implementada) |
| Upptime (monitor y página de estado sobre GitHub) | A | MIT, gratis | Activo | OPCIONAL: necesita otro repo y un token personal; la vigilancia propia cubre lo mismo |
| Alertas y arreglos automáticos de Dependabot | A | gratis | Función de GitHub | **RECOMENDADA**, la activa el dueño (no se pudo desde acá) |
| CodeQL (análisis de código de GitHub) | A | gratis en repos públicos | Activo | OPCIONAL: Biome, las pruebas y OSV ya cubren lo principal |
| Gitleaks / TruffleHog | A | MIT / AGPL | Activos | NO RECOMENDADA: GitHub ya escanea secretos y bloquea su subida |
| FlexSearch / Orama / Fuse.js / Pagefind | B | Apache / Apache / Apache / MIT | Activos | NO RECOMENDADA: el motor propio mide 99,8% de precisión y 99,9% de recall; cambiarlo agrega peso (FlexSearch pesa unos 17,5 KB comprimido) sin mejora medible |
| Meilisearch / Typesense / Algolia | C | MIT / GPL-3 / pago | Activos | NO RECOMENDADA: necesitan un servidor o tienen costo; hoy se busca dentro del navegador, sin conexión y sin costo |
| Búsqueda por significado (embeddings, Orama vectorial) | B | — | — | NO RECOMENDADA por ahora: modelo pesado en el celular, y la búsqueda por palabras ya alcanza en un catálogo de supermercado |
| Prompt API de Chrome (Gemini Nano en el navegador) | B | gratis, solo Chrome | Disponible en Chrome 148 según las fuentes, con la API web todavía en evaluación por otros navegadores; descarga de varios GB por el usuario | OPCIONAL: para interpretar lo que se pide al asistente en Chrome de escritorio, siempre respondiendo con datos reales. No se implementa ahora |
| IA en la nube (Claude, Gemini, OpenAI) para el asistente | C | pago por uso | — | NO se implementa: requiere autorización de costos y cambia la privacidad (las preguntas salen del navegador) |
| PaddleOCR (ppu-paddle-ocr, ONNX) | B | Apache-2.0 | Activo; mejor precisión en tickets que Tesseract | OPCIONAL: modelos de varios MB en el celular; antes conviene medirlo con tickets reales argentinos |
| Scribe.js | B | AGPL-3.0 | Mantenimiento medio | NO RECOMENDADA: su licencia obligaría a liberar todo el código de la web |
| BarcodeDetector nativo | B | del navegador | No existe en Safari ni en Firefox | Ya cubierto: zxing-wasm anda en todos |
| Open Food Facts (fotos y datos de productos) | C | ODbL (datos) / CC BY-SA (fotos), gratis | API pública activa | OPCIONAL: sonda real con 200 productos: solo 6 de los 141 sin foto respondidos (4,3%) tienen foto allí. Poco beneficio, y exige atribución en cada foto |
| GS1 Argentina (catálogo por código de barras) | C | pago, con convenio | — | NO RECOMENDADA sin presupuesto |
| OSRM / OpenRouteService (rutas y distancias) | C | BSD / GPL; servidores públicos con límites | Activos | OPCIONAL: el servidor de prueba de OSRM no es para producción y ORS pide clave. Hoy la web abre la navegación del celular (gratis) y calcula la distancia en línea recta |
| web-vitals (mediciones de usuarios reales) | B | Apache-2.0 | Activo | OPCIONAL: necesita dónde guardar los datos; Lighthouse en cada cambio cubre lo principal |
| Sentry / GlitchTip (errores en vivo) | C | servicio / MIT autoalojado | Activos | OPCIONAL: requiere cuenta y servidor; el recorrido funcional y la vigilancia detectan errores en la consola |
| Servidores MCP o conectores (Chrome, GitHub y otros) | A | — | Disponibles para Claude | Sirven para desarrollar y auditar, no son integraciones de la web. Se usaron Playwright y la API de GitHub |
