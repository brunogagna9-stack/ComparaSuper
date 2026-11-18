# QA y pruebas (18/11/2026)

Todas las pruebas de esta tabla se ejecutaron. Se repiten con:
- `npm test` para Playwright (con la web servida en el puerto 8765);
- `node tests/relevancia/evaluar.js <catálogo>` para la relevancia;
- `node tests/auditoria/funcional.js [URL]` para el recorrido funcional;
- `npx firebase-tools@14 emulators:exec --only firestore --project demo-superbarato "node tests/reglas/probar_reglas.mjs"` para las reglas.

| Batería | Dónde | Antes | Después |
|---|---|---|---|
| Playwright (PC y celular): búsqueda, «MANI», sin resultados, ticket editable, comparar por kilo, asistente, encabezado, accesibilidad con axe y más | Local y en cada publicación | 44 aprobadas, 4 omitidas a propósito (capturas fuera del modo visual y relevancia solo en PC) | 44 aprobadas, 4 omitidas (con nuevas comprobaciones en la prueba del asistente) |
| Capturas visuales | En la publicación | Aprobadas | Aprobadas |
| Recorrido funcional, 21 herramientas × 2 pantallas (`funcional.js`) | Web publicada | **34/41** | **41/41** |
| Reglas de Firestore en el emulador (25 casos) | Local y en `reglas.yml` | **24/25** | **25/25** (también en GitHub Actions antes de publicar) |
| Relevancia: 25 casos críticos + 450 búsquedas reales | Catálogo fijo del 15/11 | 25/25 | 25/25 |
| `npm audit` | Local | 2 moderadas | 0 |
| OSV-Scanner | GitHub Actions | No existía | Aprobado |
| Lint (Biome 2) | Local y en la publicación | 0 errores | 0 errores |
| Peso (size-limit, en la publicación) | — | 155,0 / 160 KB | 155,3 / 160 KB |
| Lighthouse (3 corridas, mediana) | Web publicada | Ver `AUDITORIA_POSTERIOR.md` | Ver `AUDITORIA_POSTERIOR.md` |
| Vigilancia diaria (corrida manual) | GitHub Actions | No existía | Aprobada |

**Casos negativos cubiertos:**
- búsqueda sin resultados («aceite de maní», «zzzzz»);
- ticket con un renglón mal leído (se quita);
- precios desactualizados (fuera de «más barato»);
- tamaños dudosos (no se comparan por kilo);
- foto inexistente (dibujito en su lugar);
- reglas: accesos ajenos, sin sesión, campos del servidor, tipos y clave de baja equivocada;
- salir del mapa antes de que termine de cargar;
- navegar con la ficha abierta.

**Pruebas manuales:**
- Revisé capturas de las pantallas cambiadas: encabezado, ticket, comparar y barras.
- Verifiqué en la web publicada: «MANI», sugerencias, el asistente, «¿Dónde conviene?», el ranking, el lector de tickets y el logo de Banco Hipotecario.

**No probado:** celulares reales (iPhone y Android), Firefox, Safari y Edge. Las pruebas automáticas usan Chromium en PC y un Pixel 7 simulado.
