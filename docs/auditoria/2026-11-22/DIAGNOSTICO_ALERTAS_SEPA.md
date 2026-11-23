# Diagnóstico de las alertas de SEPA — 22/11/2026

## Conclusión
**SEPA no estaba caído.** El portal `datos.produccion.gob.ar` publicó un archivo nuevo todos los días (16/11 a 22/11).
Lo que pasa es que, desde el **16/11/2026 17:55 UTC**, su firewall (**BunkerWeb**) responde **HTTP 403 Forbidden**
a los pedidos que vienen de servidores (centros de datos): bloquea a GitHub Actions, donde corre la actualización.
El sistema de monitoreo trataba cualquier error como "el portal no responde", y por eso los correos culpaban a la fuente.

También me equivoqué yo: en la etapa anterior (19/11) diagnostiqué "SEPA caído desde el 16/11" sin comprobarlo desde otra conexión.

## Evidencia
| Prueba | Resultado |
|---|---|
| Registro de las corridas de "Actualizar precios" | 15/11: descargas correctas. 16/11 17:55 UTC en adelante (9 corridas): `urllib.error.HTTPError: HTTP Error 403: Forbidden` en `resources()` (lista de archivos) |
| Mismo pedido desde un servidor de GitHub (IP 4.150.101.19), identificándose como SuperBarato y como navegador | 403 + página "This website is protected with BunkerWeb" en la API, en la página del conjunto de datos **y en la página de inicio** |
| Mismo pedido desde el servidor de esta auditoría (otro proveedor) | 403 BunkerWeb |
| La misma URL de la API desde la computadora del dueño (conexión domiciliaria, navegador integrado) | **200 OK**, estructura sin cambios. Archivos: lunes 16/11 16:20 … sábado 21/11 16:18, **domingo 22/11 16:18**; `metadata_modified` 22/11 16:18. Base de mayoristas: 200 OK |
| Formato de la respuesta | mismos campos (`name, url, last_modified, created, size`…); archivos de ~320–336 MB en el mismo dominio |

No hubo errores de procesamiento, de fechas, de caché ni de guardado: la cadena se cortaba en el **paso 1 (consulta)**.
No se intentó saltear el bloqueo (sin proxies ni direcciones prestadas).

## Recorrido revisado (10 pasos)
| Paso | Estado antes | Problema |
|---|---|---|
| 1. Consulta a SEPA | falla (403) | el error no se clasificaba: un bloqueo se contaba igual que una caída |
| 2. Recepción | no ocurre | — |
| 3–4. Procesamiento y validación | no ocurre (bien: no se publica nada roto) | — |
| 5. Guardado | se republican los precios del 15/11 + precios online del día | los precios online se guardaban en el historial con la fecha 15/11 |
| 6. Fecha de actualización | `dias` = fecha del último archivo vs. `date -u` | fecha UTC del servidor; sin error práctico, pero sin hora argentina |
| 7. Confirmación | paso "continue-on-error" | sin registro de qué etapa falló |
| 8–9. Monitoreo y evaluación | `if: dias == 3, 7, 14 o 21` | coincidencia exacta de días (si un día no corre, se saltea el aviso); sin incidentes ni recuperación |
| 10. Correo | texto fijo "SEPA lleva N días sin responder" | causa incorrecta; provincias mandaba además un "Falló" genérico **todos los días** |

## Otras fallas encontradas por la misma causa (usar la fecha de la base como "hoy")
1. Las **promociones bancarias** se filtraban por vigencia al 15/11 y no a hoy. Hoy coinciden (90/90), pero el 1/12 se habrían ocultado las promos de diciembre.
2. El **cartel** de la web decía "la base oficial no publicó datos nuevos": falso.
3. El **historial** guardaba los precios online del día con la fecha de la base. Los de los productos que solo se venden online quedaron en la columna 15/11 con el valor del 21/11. No se puede reconstruir el valor real y no se inventó uno (ver PENDIENTES).
4. La **auditoría de datos** calculaba la antigüedad contra la fecha de los datos, así que nunca detectaba atrasos.

## Pruebas de la corrección
Ver QA_AUDITORIA.md: 12 escenarios automáticos sin correos reales, una simulación con la consulta real (403) y dos verificaciones en producción.
