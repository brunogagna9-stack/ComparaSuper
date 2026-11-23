# Plan de mejoras — 22/11/2026

| # | Problema encontrado | Prioridad | Solución | Estado |
|---|---|---|---|---|
| 1 | Los correos culpaban a SEPA de un bloqueo de acceso | Crítica | errores clasificados + estados por etapa + `monitor.py` | implementado, probado y publicado |
| 2 | "Precios por provincia" fallaba en rojo y mandaba un correo genérico todos los días | Crítica | SEPA tolerado; el monitoreo comparte el incidente con la actualización principal | publicado y verificado (corrida en verde, sin correo repetido) |
| 3 | Aviso por días exactos (3/7/14/21), sin incidentes ni aviso de recuperación | Alta | incidentes con identificador, confirmación, recordatorio semanal, aviso de recuperación, historial | publicado |
| 4 | La tarea podía no correr sin que nadie se enterara | Media | la vigilancia diaria abre `TAREA_NO_EJECUTADA` si pasan 30 h | publicado (se verá en su próxima corrida diaria) |
| 5 | Promos filtradas por la fecha de la base | Alta (latente) | filtrar por hoy (Argentina) | publicado |
| 6 | Precios online guardados con la fecha vieja de la base | Media | la sucursal va en la fecha de la base y el online en la de hoy | publicado y verificado (historial: …15/11, 22/11) |
| 7 | El cartel decía que la base "no publicó" | Alta (comunicación) | texto veraz + "los precios online sí están al día" si corresponde | publicado |
| 8 | El asistente daba precios sin fecha con datos de 7 días | Media | nota de vigencia cuando los precios de sucursal tienen 2 días o más | publicado |
| 9 | Logos PNG: 242 KB por visita | Media | WebP calidad 90 (comparados a simple vista: iguales) | publicado: 254 → 97 KB de imágenes |
| 10 | La auditoría de datos nunca detectaba cadenas atrasadas | Baja | medir contra hoy | implementado |
| 11 | **No se pueden obtener datos SEPA nuevos** | Crítica | requiere gestión externa (habilitación del portal) o una decisión tuya | **pendiente — requiere autorización** |

Descartado a propósito:
- Cambiar el algoritmo del buscador: las mediciones no muestran problemas.
- Corregir precios "anómalos" automáticamente: solo se marcan, como pide la consigna.
- Saltear el firewall con otras direcciones: no está autorizado.
