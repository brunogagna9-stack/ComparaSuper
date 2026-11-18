# Plan de implementación (18/11/2026)

Se trabajó en la rama `mejoras-4`. Se probó todo en local (servidor estático + Playwright) y después se pasó a `main`, que publica sola si pasan las pruebas, el lint y el peso. Respaldo previo: `respaldo-2026-11-18-auditoria3`.

| Fase | Trabajo | Prioridad | Estado |
|---|---|---|---|
| A | Auditoría previa con mediciones reales | — | Hecho (`AUDITORIA_PREVIA.md`) |
| B–C | Investigación y selección de tecnologías | — | Hecho (`INVENTARIO_TECNOLOGICO.md`, `EVALUACION_INTEGRACIONES.md`) |
| D | F1: navegación con la ficha abierta | Alta | Hecho |
| D | Fotos de provincias en la primera visita (898 KB) | Alta | Hecho |
| E | Reglas: tipos de fecha (S1) y pruebas en el emulador antes de publicar (S2) | Media | Hecho |
| E | OSV-Scanner y `npm audit` en 0 (S4); permisos de Lighthouse (S6) | Baja | Hecho |
| E | Vigilancia diaria con aviso por correo | Media | Hecho |
| F | Buscador: abreviaturas y diminutivos | Media | Hecho |
| F | Nombre con presentación cuando el nombre no la dice | Media | Hecho |
| F | Asistente: «agregá X al carrito», con confirmación, y «¿algo parecido más barato?» | Media | Hecho |
| G | F2 (error del mapa) y F3 (transiciones) | Baja | Hecho |
| H | App Check obligatorio | Media | **Pendiente de autorización y datos** (ver `PENDIENTES_Y_LIMITACIONES.md`) |
| H | Alertas y arreglos automáticos de Dependabot | Baja | **Lo activa el dueño** |
| I | Auditoría posterior con los mismos métodos | — | Hecho (`AUDITORIA_POSTERIOR.md`) |

**Criterios:**
- No cambiar el presupuesto de peso.
- No sacar funciones.
- No sumar servicios pagos.
- Cada cambio, con su prueba.
