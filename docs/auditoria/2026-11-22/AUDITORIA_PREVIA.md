# Auditoría previa — 22/11/2026

Estado real de SuperBarato **antes** de esta etapa, medido sobre la web publicada (commit `86da01b`).
Respaldo: rama `respaldo-2026-11-22-monitoreo` (y los respaldos anteriores, intactos).

## Automatizaciones (últimas 30 corridas en GitHub Actions)
| Proceso | Estado |
|---|---|
| Actualizar precios (diario) | termina en verde, pero el paso SEPA falla todos los días desde el **16/11 17:55 UTC** con `HTTP 403 Forbidden` |
| Precios por provincia (diario) | **falla en rojo todos los días** (mismo 403) → correo "⚠️ Falló: la actualización de precios de las provincias" diario |
| Aviso de SEPA | correo "SEPA lleva N días sin responder" los días 3, 7, 14 y 21 (el 22/11 salió el de 7 días) |
| Publicar la web, Vigilancia, Correos a usuarios, Revisar descuentos | en verde |
| Horario real | las tareas programadas para las 17:00 UTC corren entre 17:50 y 22:58 UTC (demoras de GitHub) |

## Datos publicados
| Indicador | Valor |
|---|---|
| Productos / comercios / precios | 29.462 / 16 / 141.604 |
| Precios de sucursal (SEPA) | del **15/11** (7 días) |
| Productos con foto / con tamaño | 94,4 % / 100 % |
| Precios marcados como anómalos | 97 |
| Nombres repetidos (nombre+marca) | 2.132 (son presentaciones distintas con el mismo nombre comercial) |
| Cadenas atrasadas (auditoría) | "ninguna" — **dato incorrecto**: la auditoría medía contra la fecha de los datos, no contra hoy |

## Lo que ve el usuario
- Cartel: "Los precios de sucursales son del 15/11: **la base oficial no publicó datos nuevos** en 7 días" → **falso** (SEPA publicó todos los días).
- Asistente: da precios sin aclarar que los de sucursal tienen una semana.
- Ficha: "Precios del 15/11 … Online: sin envío" (los online son de hoy, pero se fechaban como del 15/11).

## Rendimiento (laboratorio, celular simulado Pixel 7, CPU 4×)
| Indicador | Valor |
|---|---|
| Código de entrada (límite 160 KB) | 129,8 KB |
| Lighthouse celular (3 corridas) | 99–100 / 100 / 100 / 100 · LCP 1,08 s · TBT 22–132 ms · CLS 0 · 144,4 KB |
| Visita con provincia (15 s) | 441 KB, 32 pedidos — **imágenes 254 KB** (logos PNG) |
| Buscador listo · sección más lenta · ≈INP | 3,3 s · 910 ms (#ofertas) · 104 ms |
| Tareas largas | 47, total 8,4 s, peor 719 ms |
| Memoria tras la sesión | 51,7 MB · 7.956 nodos · 685 escuchas |

## Funcionalidad, buscador, seguridad
- Pruebas funcionales: **41/41** (pc y celular). Playwright: 44 aprobadas. Pruebas de datos: 8/8.
- Buscador (450 consultas reales): precisión@10 99,8 %, recall 99,9 %, falsos positivos 1 %. MANI / Maní / MANI tostado / yerba 1 kg: correctos.
- Seguridad: `npm audit` 0 vulnerabilidades; reglas de Firestore probadas (25/25, último control 18/11 en verde). Alertas de Dependabot y App Check: no accesibles desde el servidor (requieren la cuenta del dueño).
