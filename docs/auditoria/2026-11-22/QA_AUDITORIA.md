# QA y pruebas — 22/11/2026

## Escenarios del monitoreo (`tests/test_monitor.py`, automáticos, sin correos reales)
| # | Escenario | Resultado esperado | Resultado |
|---|---|---|---|
| 1 | SEPA disponible y actualizado, todo guardado | ningún correo; estados FUENTE_DISPONIBLE/ACTUALIZADA, CONSULTA/PROCESAMIENTO/IMPORTACION_EXITOSA, BASE_ACTUALIZADA | ✅ |
| 2 | Disponible, sin registros nuevos | SIN_DATOS_NUEVOS sin correo; si dura días, "SEPA no publicó" (nunca "caída") | ✅ |
| 3 | Disponible, falla el procesamiento | correo inmediato "[Crítico] Error en el procesamiento", que dice "Fuente: disponible y actualizada" | ✅ |
| 4 | Error temporal (503) | se registra como alerta descartada; si al día siguiente anda, no hay correo | ✅ |
| 5 | Consulta bien, falla el guardado | correo "Error al guardar…", sin culpar a SEPA | ✅ |
| 6 | Fechas: datos del 22/11 leídos a las 22:30 de Argentina (01:30 UTC del 23/11) | siguen siendo "de hoy" | ✅ |
| 7 | 7 días seguidos con todo actualizado | ningún correo de caída | ✅ |
| 8 | La fuente deja de responder de verdad | avisa al confirmarse (2.ª corrida, ≥20 h), una sola vez, y recuerda a la semana. Un bloqueo 403 sale como "rechaza la conexión", no como caída | ✅ |
| 9 | Recuperación | correo "Actualización de precios recuperada" con los registros procesados; provincias comparte el incidente | ✅ |
| 10 | La tarea corre dos veces | sin correos duplicados | ✅ |
| 11 | La tarea no llega a correr | la vigilancia avisa una vez a las 30 h; al volver a correr llega la recuperación | ✅ |
| 12 | Clasificación real de errores (servidor local) | 403 con BunkerWeb → bloqueado (2 intentos); 503 → reintento exitoso; 404 → sin reintento; sin conexión → sin_respuesta (3 intentos) | ✅ |

## Pruebas con la fuente real y en producción
| Prueba | Resultado |
|---|---|
| `sepa_fetch.py` real desde el servidor de auditoría | código 2; `consulta: bloqueado, HTTP 403 Forbidden (firewall BunkerWeb del portal), 2 intentos` |
| `monitor.py` con ese estado (modo prueba) | correo "[Crítico] El portal oficial rechaza la conexión de nuestro servidor"; segunda corrida: "ya avisado", sin correo |
| Producción: "Actualizar precios" (manual, 22/11 21:33) | en verde; **1 correo** con la causa real |
| Producción: "Actualizar precios" de nuevo + "Precios por provincia" | ambos en verde; **0 correos** ("ya avisado") — antes provincias terminaba en rojo |
| Producción: datos publicados | `online_updated` 22/11; historial …15/11, **22/11**; logos .webp |

## Regresión (después de cada conjunto)
| Control | Conjunto 1 | Conjunto 2 |
|---|---|---|
| Biome | 0 errores | 0 errores |
| Pruebas de datos (`run_tests.py`) | 20/20 | 21/21 |
| Playwright (pc + celular, incl. capturas visuales) | 44 aprobadas, 4 omitidas | 44 aprobadas, 4 omitidas |
| Funcionales en la web publicada | — | **41/41** |
| Funcionales locales | — | 39/41 (las 2 de "Ranking" necesitan `ranking.json`, que no existe en la copia local; en la web publicada pasan) |
| Código de entrada | sin cambios en la web | 129,89 KB (límite 160) |
| Buscador (450 consultas) | — | P@10 99,8 %, recall 99,9 %, falsos positivos 1 % (sin cambios) |

Regresiones detectadas: ninguna. Las primeras corridas de Lighthouse posteriores salieron con TBT alto porque se midió en paralelo con otra prueba. Se repitieron solas y dieron 100 en las 3 corridas.
