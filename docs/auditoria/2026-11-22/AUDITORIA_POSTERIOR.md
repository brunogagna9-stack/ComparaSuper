# Auditoría posterior — 22/11/2026

Mismas herramientas y condiciones que AUDITORIA_PREVIA.md: web publicada, celular simulado (Pixel 7) con CPU 4×, Lighthouse 12 ×3 en modo celular, mismos scripts.

## Antes / después
| Indicador | Antes | Después |
|---|---|---|
| Causa en los correos de SEPA | "lleva 7 días sin responder" (falso) | "El portal oficial rechaza la conexión de nuestro servidor (HTTP 403, firewall)" |
| Correos por día con el bloqueo actual | 1 diario (provincias) + SEPA los días 3/7/14/21 | 1 por incidente + 1 recordatorio semanal + aviso de recuperación |
| "Precios por provincia" | rojo todos los días | verde |
| Estados del monitoreo | 1 (falló / no falló) | 12 estados + 7 tipos de error de consulta |
| Escenarios de prueba del monitoreo | 0 | 12 |
| Cartel de la web | "la base oficial no publicó" (falso) | "no podemos actualizarlos desde la base oficial… Los precios online sí están al día" |
| Promos filtradas por | la fecha de la base (15/11) | hoy en Argentina |
| Historial de precios online | fechado 15/11 | fechado el día real (22/11) |
| Imágenes al entrar con provincia | 254 KB | **97 KB** (−62 %) |
| Descarga con provincia (15 s) | 441 KB | 284 KB (−36 %) |
| Código de entrada | 129,8 KB | 129,9 KB (+0,09 KB por el cartel nuevo) |
| Lighthouse celular | 99–100/100/100/100 · TBT 22–132 ms | 100/100/100/100 ×3 · TBT 0 ms |
| LCP / CLS | 1,08 s / 0 | 1,08 s / 0 |
| Buscador listo | 3,3 s | 3,1 s |
| Sección más lenta | 910 ms | 669 ms |
| ≈INP (laboratorio) | 104 ms | 136 ms (variación normal entre corridas; ambos por debajo de 200 ms) |
| Tareas largas | 47 · 8,4 s · peor 719 ms | 43 · 8,3 s · peor 583 ms |
| Memoria tras la sesión | 51,7 MB | 52,6 MB |
| Funcionales | 41/41 | 41/41 |
| Buscador P@10 / recall / FP | 99,8 / 99,9 / 1 % | 99,8 / 99,9 / 1 % |
| Pruebas de datos | 8 | 21 |
| Vulnerabilidades npm | 0 | 0 |

## Qué sigue igual (y por qué)
- **Los precios de sucursal siguen siendo del 15/11**: el bloqueo del portal es externo. El monitoreo ahora lo informa bien; resolverlo requiere tu gestión (PENDIENTES.md).
- Los cálculos (¿Dónde conviene?, topes compartidos, promos no acumulables) se revisaron y son correctos; no se tocaron.
