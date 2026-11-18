# Registro de cambios

## 18/11/2026: auditoría 3 (commit `04ede53`, rama `mejoras-4` → `main`)

**Respaldo previo:** `respaldo-2026-11-18-auditoria3` (apunta a `31482de`).

| Archivo | Cambio |
|---|---|
| `site/js/app.js` | Con la ficha abierta, ir a otra sección ahora dibuja esa sección (F1). |
| `site/js/app.js` | El mapa no da error si salís antes de que termine de cargar (F2). |
| `site/js/app.js` | `sinAviso()` descarta en silencio las transiciones cortadas (F3). |
| `site/js/app.js` | `conTam()` agrega la presentación al nombre en tarjetas, listas y sugerencias. |
| `site/js/mapa.js` | Las fotos de provincias se adelantan solo con pantalla de mouse y buena conexión. |
| `site/js/motor.js` | Abreviaturas con punto desde 4 letras al sonar («Shamp.»). Diminutivos desde 6 letras. |
| `site/js/asistente.js` | `botAgregar` (opciones con botón «Agregar al carrito»; nada se agrega sin tocarlo). |
| `site/js/asistente.js` | `botParecidos` (alternativas más baratas por kilo o litro). |
| `site/css/app.css` | Estilo `.pres` (presentación junto al nombre). |
| `firestore.rules` | `acepto` y `actualizado` deben ser fechas. |
| `tests/reglas/probar_reglas.mjs` | 25 pruebas de reglas en el emulador. |
| `.github/workflows/reglas.yml` | Prueba las reglas antes de publicarlas. |
| `.github/workflows/seguridad.yml` | OSV-Scanner semanal y en cada cambio de dependencias. |
| `.github/workflows/vigilancia.yml` | Vigilancia diaria con aviso por correo. |
| `scripts/vigilancia.mjs` | El script que usa la vigilancia diaria. |
| `.github/workflows/lighthouse.yml` | Permisos mínimos. |
| `package.json` | Agrega `@firebase/rules-unit-testing`, `firebase` (para pruebas) y `overrides` de `fflate` y `@grpc/grpc-js`. |
| `tests/auditoria/funcional.js` | Recorrido de 21 herramientas en PC y celular. |
| `tests/auditoria/datos.js` | Calidad de los datos publicados. |
| `tests/relevancia/evaluar.js` | Juez más estricto (sin cortar letras de más), falsos negativos y precisión de sugerencias. |
| `tests/web.spec.js` | El asistente: agregar y parecidos. |
| `biome.json` | Variables compartidas del asistente. |

**Rama temporal `probe-off`:** sonda de solo lectura para Open Food Facts. No cambia la web y se puede borrar.

## Etapas anteriores (resumen)

| Respaldo | Antes de |
|---|---|
| `respaldo-2026-11-16-f3` | Fase 3: datos honestos y buscador |
| `respaldo-2026-11-16-f4` | Fase 4: encabezado móvil y accesos |
| `respaldo-2026-11-18-a` | Buscador por palabra entera («MANI») |
| `respaldo-2026-11-18-c` | Tickets editables, comparar por kilo, asistente |
| `respaldo-2026-11-18-d` | Barras, ranking con cobertura, fotos |
| `respaldo-2026-11-18-e` | Reglas más estrictas y logo de Banco Hipotecario |
