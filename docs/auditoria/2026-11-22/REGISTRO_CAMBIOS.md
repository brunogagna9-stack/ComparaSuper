# Registro de cambios — 22/11/2026

Respaldo de todo lo anterior: rama `respaldo-2026-11-22-monitoreo`. Ramas de trabajo: `monitoreo-sepa` y `vigencia-datos`.

## Conjunto 1 — Monitoreo (commit `44654b2`)
| Archivo | Antes | Después |
|---|---|---|
| `scripts/sepa_fetch.py` | `urlopen` sin manejo; cualquier error cortaba el proceso | `pedir()` con reintentos y tipos de error; `etapa()`/`correr()` dejan `data/estado_sepa.json` |
| `scripts/sepa_fetch_prov.py` | ídem | registra sus etapas en `data/estado_sepa_prov.json` |
| `scripts/monitor.py` (nuevo) | — | estados, incidentes, confirmación, correos con causa, recuperación, vigilancia de tareas |
| `scripts/monitor.sh` (nuevo) | — | lee y guarda el estado en la rama `monitor` |
| `scripts/alerta.py` | solo línea de comandos | función `enviar()`; modo prueba sin clave; detalle opcional |
| `.github/workflows/actualizar.yml` | job `alerta` por días exactos | job `monitor` (concurrencia `monitor`) |
| `.github/workflows/beta.yml` | SEPA obligatorio → rojo diario | SEPA tolerado; job `monitor` |
| `.github/workflows/vigilancia.yml` | correo genérico | detecta tareas que no corrieron; el correo trae el detalle |
| `scripts/vigilancia.mjs` | "SEPA: HTTP 403" | distingue un bloqueo del firewall de una caída |
| `tests/test_monitor.py` (nuevo), `tests/run_tests.py` | 8 pruebas | 20 pruebas |
| rama `monitor` (nueva) | — | estado inicial: el incidente del 16/11, sin avisar todavía con el formato nuevo |

Antes → después: ver QA_AUDITORIA.md. Producción: 1 correo correcto; 2 corridas más, sin repetir.

## Conjunto 2 — Vigencia de datos y peso (commit de la rama `vigencia-datos`)
| Archivo | Cambio |
|---|---|
| `scripts/build_data.py` | `update_history` separa la fecha de la sucursal de la del online; promos por hoy (Argentina); `meta.online_updated` |
| `scripts/online_fetch.py` | anota `online_fecha` |
| `site/js/app.js` | cartel veraz; la ficha dice de cuándo son los precios online |
| `site/js/asistente.js` | nota de vigencia en respuestas con precios |
| `site/img/logos/*.webp` (37 nuevos), `site/config.json` | logos en WebP (los PNG se conservan) |
| `tests/auditoria/datos.js` | antigüedad contra hoy |
| `tests/run_tests.py` | prueba del historial con base vieja (21 pruebas) |

## Conjunto 3 — Documentación
Estos 8 documentos y las referencias desde `monitor.py` y `vigilancia.mjs`.
