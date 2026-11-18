# SUPERBARATO — AUDITORÍA PREVIA (Estado A)

- **Fecha:** 18/11/2026, 01:30–02:30 (hora de Argentina).
- **Respaldo previo:** rama `respaldo-2026-11-18-auditoria3` (commit `31482de`).
- **Entorno:** web publicada en https://superbarato.com.ar, medida desde la nube con Chromium 1254 (Playwright y Lighthouse 12).
- **Catálogo de prueba fijo:** el publicado el 15/11 (29.401 productos). Es el mismo antes y después.

## 1. Estado técnico

| Parte | Cómo está hecho |
|---|---|
| Web | Estática, sin framework, servida por GitHub Pages con dominio propio en Cloudflare. El código: `site/js/app.js` (~3.100 líneas), `motor.js` (relevancia del buscador), `buscador.js` (proceso de fondo), `datos.js`, `mapa.js`, y `asistente.js`, `ticket.js`, `cuenta.js` y `legal.js`, que se bajan recién cuando se usan. |
| Librerías propias del sitio (en `site/js/vendor`) | MiniSearch 7.2, Leaflet 1.9.4 + MapLibre 6.18, zxing-wasm 3.1.6, uPlot 1.6.32, Workbox 7.4.1, idb-keyval 6.3, driver.js 1.12.1, Floating UI 1.8, Embla 8.6, PhotoSwipe 5.4.4, fuzzball 2.2.6 y auto-animate 0.10.2. Tesseract.js 7.0.0 se baja de jsDelivr al leer un ticket. Las revisa cada mes `revisar_librerias.yml`. |
| Datos | Python en GitHub Actions: SEPA (Precios Claros), tiendas online (VTEX), promociones bancarias y de billeteras. Se publican en la rama `datos`. |
| Cuentas | Firebase Authentication (Google y correo) y Firestore por REST con App Check (reCAPTCHA Enterprise, todavía sin aplicar). |
| Correos | Brevo (avisos y correo semanal) y Cloudflare Email Routing. |
| Publicación | `publicar.yml`: lint (Biome), pruebas (Playwright), peso (size-limit), capturas visuales y Lighthouse. Las reglas de Firestore se publican con `reglas.yml`. |

## 2. Estado funcional

Recorrido automático `tests/auditoria/funcional.js`: 21 casos en PC y 20 en celular.

**Resultado: 34 de 41 aprobados.** Los 7 que fallaron salen de 3 errores reales:

| # | Gravedad | Hallazgo | Evidencia | Dónde | Impacto | Solución |
|---|---|---|---|---|---|---|
| F1 | **Alta** | Con la ficha de un producto abierta, cambiar de sección dejaba la página anterior en pantalla con la dirección nueva. Pasa al seguir un enlace del asistente o al ir atrás/adelante. | Con la ficha abierta, ir a `#conviene` mostraba el inicio. Fallaron 4 casos en PC y celular. | `app.js`, manejo del historial (`popstate` → `OV.quieto`) | La persona no llega a la herramienta que eligió. | Dibujar la sección salvo cuando se vuelve a la página que estaba debajo de la ficha. |
| F2 | Media | Error en consola al salir del mapa antes de que termine de cargar. | `Cannot set properties of null (setting 'hidden')` en `#mzona`. Fallaron 2 casos. | `app.js`, vista del mapa | Sin efecto visible, pero ensucia el registro de errores. | Comprobar que el elemento exista. |
| F3 | Baja | Si se navega rápido, una transición cortada deja un rechazo sin manejar. | «Transition was aborted/skipped». Falló 1 caso de forma intermitente. | `startViewTransition` | Solo consola. | Descartar en silencio las transiciones cortadas. |

Lo demás funcionó en PC y celular:
- buscador con «leche» y «MANI», autocompletado, resultados con filtros;
- ficha de producto, descuentos por día, comparar por kilo, ranking y mapa;
- modo súper, ticket con edición y confirmación, asistente;
- modo oscuro, tamaño de letra, términos, conocenos y cuenta.

El buscador estuvo listo en 4,4 s en PC y 3,8 s en celular, con la red real.

## 3. Estado de UX/UI (por perfil)

| Perfil | Hallazgo | Gravedad |
|---|---|---|
| Primera vez (celular) | El elegidor de provincia bajaba las 24 fotos de provincias, 898 KB de 1.060 KB, aunque no se miren. | **Alta** (datos móviles) |
| Busca un producto | 738 grupos de productos tienen el mismo nombre y tamaño, y 904 grupos el mismo nombre (por ejemplo «Aceite NATURA de girasol» en 0,12, 1,5 y 3 l). En la lista no se distinguían. | Media |
| Busca un producto | «shampoo» no encontraba los nombres abreviados «Shamp.», y «gomitas» o «barrita» no encontraban «gomas» ni «barra». | Media |
| Compara supermercados | Funciona: barras, cobertura y precios desactualizados fuera del cálculo. | — |
| Quiere descuentos | Funciona. Sin medios de pago elegidos, no resta descuentos. | — |
| Lista larga | Funciona: pegar lista, ticket editable, mezclar comercios. | — |
| Poca experiencia | El asistente no podía hacer tareas (agregar al carrito) ni sugerir alternativas más baratas. | Media |

## 4. Estado de seguridad

| # | Gravedad | Hallazgo | Evidencia | Solución |
|---|---|---|---|---|
| S1 | Media | Las reglas no validaban el tipo de `acepto` y `actualizado`: se podía guardar texto. | Prueba en el emulador: 24 de 25 aprobadas, falla «NO guardar fechas falsas». | Exigir `timestamp`. |
| S2 | Media | Las reglas no tenían pruebas automáticas: un cambio podía publicarse roto. | No había pruebas. | Probar las reglas en el emulador oficial antes de publicar. |
| S3 | Media | App Check sin aplicar: 70% de pedidos verificados, sobre solo 27 en 2 días. | Captura de la consola de Firebase. | Esperar más datos. Ver PENDIENTES. |
| S4 | Baja | `npm audit`: 2 moderadas en `fflate` (que usa `satori`, solo en la publicación). | `npm audit` | Forzar `fflate` 0.8.3. |
| S5 | Baja | Las alertas de Dependabot y sus arreglos automáticos de seguridad están apagados en GitHub. | API del repositorio | Lo activa el dueño (no se puede desde acá). |
| S6 | Baja | `lighthouse.yml` sin permisos mínimos. | Archivo | `permissions: contents: read`. |
| S7 | Info | La clave web de Firebase es pública por diseño. Conviene limitarla a superbarato.com.ar en Google Cloud. | `config.json` | La configura el dueño. |
| S8 | Info | Sin vigilancia diaria de la web publicada, ni control de dependencias con un escáner dedicado. | — | Agregar vigilancia diaria y OSV-Scanner. |

Lo que ya estaba bien:
- Las reglas campo por campo: cada persona solo accede a lo suyo, y el servidor maneja sus propios campos.
- La baja con un clic desde el correo exige la clave secreta y solo permite apagar.
- No hay secretos en el repositorio: solo la clave web pública de Firebase.
- Están activos el escaneo de secretos y la protección al subir código de GitHub.
- Los workflows usan solo acciones oficiales.

## 5. Estado de los datos

Medido con `tests/auditoria/datos.js` sobre lo publicado:

| Medida | Valor |
|---|---|
| Productos / comercios | 29.401 / 16 |
| Con foto | 94,4% (1.653 sin foto) |
| Con tamaño | 100%, con 98 tamaños dudosos que no se usan para comparar por kilo |
| Precios marcados como anómalos | 82 de 140.881 |
| Precios de sucursal | Del 15/11: el portal SEPA está caído desde el 16/11 y la web lo avisa |
| Fotos rotas en una muestra de 400 | 2,5% (la web muestra un dibujito en su lugar) |

## 6. Estado de las integraciones

| Integración | Estado |
|---|---|
| SEPA (Precios Claros) | Caído desde el 16/11, por el lado del Gobierno. La actualización diaria sigue publicando los precios online. |
| Tiendas VTEX (precios online, fotos) | Andan. |
| Promos de bancos y billeteras | Andan (scripts propios). |
| Firebase Auth y Firestore | Andan. |
| App Check | En modo control, sin aplicar. |
| Brevo y Cloudflare Email Routing | Andan. |
| GoatCounter (visitas) | Anda. |

## 7. Estado del rendimiento

**Peso inicial del código.** size-limit mide JS + CSS achicados y comprimidos con gzip, con un máximo de 160 KB. El resultado fue **155,0 KB**. No incluye imágenes, fuentes, datos (`products.json`) ni lo que se baja después.

**Página completa, primera visita.** Lighthouse 12, celular simulado, mediana de 3 corridas:

| Medida | Resultado |
|---|---|
| Rendimiento / Accesibilidad / Buenas prácticas / SEO | 100 / 100 / 100 / 100 |
| LCP | 1,23 s |
| FCP | 1,08 s |
| TBT | 24 ms |
| CLS | 0 |
| Peso total | **1.060 KB en 37 pedidos (898 KB son fotos de provincias)** |

INP no se puede medir en laboratorio. TBT es su indicador cercano.

## 8 a 11. Problemas, funciones incompletas, oportunidades y riesgos

- **Críticos:** ninguno. No hay datos falsos, accesos indebidos ni cálculos que engañen.
- **Altos:**
  - F1 (navegación con la ficha abierta).
  - Las 900 KB de fotos en la primera visita.
- **Medios:**
  - F2.
  - S1, S2 y S3.
  - Nombres repetidos sin tamaño.
  - Abreviaturas y diminutivos en el buscador.
  - El asistente sin acciones.
- **Bajos:** F3, S4, S5 y S6.
- **Funciones incompletas o bloqueadas:**
  - App Check sin aplicar.
  - Datos de sucursal parados porque SEPA está caído.
- **Riesgos:**
  - Depender de una sola fuente oficial (SEPA).
  - Que cambie la estructura de las tiendas online.
  - Aplicar App Check sin datos y bloquear a usuarios reales.

## 12. Priorización

1. F1.
2. Fotos de la primera visita.
3. Reglas S1 y S2.
4. Buscador.
5. Nombres con tamaño.
6. Asistente con acciones.
7. Vigilancia diaria y OSV-Scanner.
8. F2 y F3.
9. S4 y S6.

App Check y Dependabot quedan para el dueño. El plan detallado está en `PLAN_DE_IMPLEMENTACION.md`.
