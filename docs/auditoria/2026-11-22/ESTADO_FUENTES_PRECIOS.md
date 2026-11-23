# Estado de las fuentes de precios — 22/11/2026

| Fuente | Disponible | Actualizada | Consulta desde SuperBarato | Procesamiento | Importación | Comentario |
|---|---|---|---|---|---|---|
| SEPA minoristas (`sepa-precios`, datos.produccion.gob.ar) | sí (para el público) | sí: un archivo por día, el último 22/11 16:18 | **bloqueada** (HTTP 403, firewall BunkerWeb) desde 16/11 17:55 UTC | no corre | no corre: se republica la del 15/11 | requiere gestión con el portal (PENDIENTES) |
| SEPA mayoristas (`precios-claros-sepa-mayoristas`) | sí | sí | bloqueada (mismo dominio) | — | — | opcional: si falla, se sigue sin ella |
| Precios online (tiendas VTEX y Coto Digital) | sí | diaria | correcta | correcta | correcta, con su fecha real (`online_updated` = 22/11) | si una tienda no responde, se sigue con las demás |
| Promos MODO | sí | diaria | correcta | correcta | correcta | corre dentro de "Precios por provincia", solo cuando hay datos SEPA nuevos |
| Promos bancarias (`data/promos_pago.json`, relevadas) | — | revisión programada | — | — | vigencia filtrada por **hoy** (antes, por la fecha de la base) | 90 activas |

## Cómo se mide ahora (cada corrida)
`scripts/sepa_fetch.py` deja `data/estado_sepa.json` con:

- **consulta**: si anduvo, cuántos archivos hay y cuándo se publicó el último. Si falló, el tipo de error (`bloqueado`, `sin_respuesta`, `error_servidor`, `dns`, `no_encontrado`, `respuesta_invalida`, `sin_archivos`), el código HTTP, el detalle y la cantidad de intentos.
- **descarga** y **procesamiento**: precios, productos y cadenas leídas.
- **importacion**: fecha de los datos y archivo guardado.

`scripts/monitor.py` combina ese estado con el resultado de los demás pasos y con la fecha de la base publicada, y lo guarda en la rama `monitor` (`estado.json`, con historial de las últimas 150 corridas y registro de los correos).

## Reintentos
Antes de dar por fallida una consulta, se reintenta en forma progresiva:
- Errores pasajeros (429, 5xx, tiempo agotado, conexión cortada): 3 intentos (0 s, 20 s y 60 s).
- 403: un solo reintento, por si es un límite momentáneo.
- 404 y otros errores permanentes: no se reintentan.
