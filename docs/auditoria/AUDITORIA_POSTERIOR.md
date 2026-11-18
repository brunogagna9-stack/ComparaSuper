# SUPERBARATO — AUDITORÍA POSTERIOR (Estado B) y comparación con el Estado A

- **Fecha:** 18/11/2026.
- **Entorno:** el mismo que en la auditoría previa (web publicada, Chromium 1254, Lighthouse 12 en celular simulado, mediana de 3 corridas).
- **Catálogo de prueba:** el mismo (15/11, 29.401 productos).
- **Cambios medidos:** commit `04ede53`.

## Resumen

| Indicador | Estado A (antes) | Estado B (después) | Cómo se midió |
|---|---|---|---|
| Herramientas que pasan el recorrido funcional | 34 de 41 casos | **41 de 41** | `tests/auditoria/funcional.js`, PC y celular |
| Errores reales detectados | 3 (1 alto, 1 medio, 1 bajo) | **0** | Mismo recorrido + consola |
| Pruebas automáticas de la web | 44 aprobadas | 44 aprobadas (más comprobaciones) | Playwright |
| Reglas de seguridad probadas | 24 de 25 (1 hueco) | **25 de 25**, probadas antes de cada publicación | Emulador oficial de Firebase |
| Vulnerabilidades en dependencias | 2 moderadas | **0** | `npm audit` + OSV-Scanner |
| Buscador: precisión en los 10 primeros | 99,8% | 99,8% | 450 búsquedas reales, juez automático |
| Buscador: recall | 99,3% | **99,9%** | Ídem |
| Buscador: productos relevantes que no aparecen | 277 (0,7%) | **37 (0,1%)** | Ídem |
| Buscador: resultados que no van | 374 (0,9%) | 419 (1,0%) | Ídem |
| Buscador: precisión de las sugerencias (6) | 99,8% | 99,8% | Ídem |
| Buscador: casos críticos («MANI», etc.) | 25 de 25 | 25 de 25 | `tests/relevancia/casos.js` |
| Buscador: tiempo por búsqueda | 0,98 ms | 0,96 ms | Node, mismo equipo |
| Peso de la primera visita (todo lo que baja) | **1.060 KB, 37 pedidos** | **163 KB, 13 pedidos** | Lighthouse, celular |
| Peso del código inicial (JS + CSS gzip) | 155,0 KB | 155,3 KB (máximo 160) | size-limit |
| Lighthouse: rendimiento / accesibilidad / buenas prácticas / SEO | 100 / 100 / 100 / 100 | 100 / 100 / 100 / 100 | Lighthouse |
| LCP / FCP | 1,23 s / 1,08 s | 1,23 s / 1,08 s | Ídem |
| TBT (indicador de INP en laboratorio) | 24 ms | 15 ms | Ídem |
| CLS | 0 | 0 | Ídem |
| Buscador listo (red real) | 4,4 s PC / 3,8 s celular | 4,3 s / 3,9 s | Recorrido funcional |
| Vigilancia de la web publicada | No había | Diaria, con aviso por correo | `vigilancia.yml` |
| Integraciones operativas | 7 de 8 (SEPA caído, externo) | 7 de 8 (SEPA sigue caído, la web lo avisa) | Vigilancia |
| App Check | En modo control | En modo control (pendiente de datos y autorización) | Consola de Firebase (captura del dueño) |

## Por área

**Funcionalidad.** Se corrigieron los 3 errores encontrados:
- F1: la navegación con la ficha de un producto abierta.
- F2: el error del mapa.
- F3: las transiciones cortadas.

Se agregaron dos acciones al asistente: agregar al carrito con confirmación y sugerir parecidos más baratos. Los nombres repetidos ahora muestran su tamaño, lo que afecta a 738 grupos con el mismo nombre y tamaño y a 904 con el mismo nombre.

**Buscador.**
- El problema de «MANI» sigue resuelto: 309 resultados, todos de maní.
- El recall subió por las abreviaturas («Shamp.») y los diminutivos («gomitas», «barrita»).
- El aumento de 0,1 punto en resultados que no van viene de diminutivos ambiguos (por ejemplo, «palitos» y «palo»). Se aceptó porque la ganancia en recall es mucho mayor.
- Para comparar sin sesgo, el juez es independiente del motor y más estricto que antes. Con el juez anterior, más permisivo, el estado A se veía distinto; los dos estados de esta tabla usan el juez nuevo.

**Rendimiento.**
- La primera visita en el celular baja un 85% menos (de 1.060 KB a 163 KB), porque ya no adelanta las 24 fotos de provincias.
- En una compu con buena conexión sí se adelantan, cuando el navegador está libre.
- El código inicial subió 0,3 KB y sigue dentro del máximo.

**Seguridad.**
- Las reglas ahora exigen que las fechas sean fechas.
- Las reglas se prueban automáticamente: 25 casos de aislamiento, campos del servidor, baja con clave y tipos.
- Las dependencias quedaron sin avisos y con escaneo semanal.
- Quedan para el dueño: App Check obligatorio, alertas de Dependabot y limitar la clave web de Firebase.

**Datos.** Sin cambios en las fuentes: SEPA está caído desde el 16/11, por el lado del Gobierno. La vigilancia ahora informa todos los días:
- la antigüedad de los datos;
- el estado del portal SEPA;
- el porcentaje de fotos rotas (0 de 80 en la corrida de prueba; 2,5% en la muestra de 400 de la auditoría previa);
- la cobertura de fotos (94%).
