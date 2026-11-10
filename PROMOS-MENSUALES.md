# Actualización mensual de los descuentos con medios de pago

Los descuentos de bancos, billeteras, tarjetas y clubes se cargan a mano una vez por mes,
porque no hay una fuente oficial única. Vencen el último día del mes: si no se cargan los del
mes siguiente, la web muestra el aviso «Estamos actualizando los descuentos de este mes».

## Cuándo

Entre el 25 y el último día de cada mes, para el mes siguiente. Si un banco todavía no publicó,
se carga lo que haya y se completa en la primera semana del mes.

## Cómo

1. Copiar `scripts/promos_noviembre_2026.py` (o el del último mes) a `scripts/promos_<mes>_<año>.py`.
2. En el archivo nuevo:
   - Cambiar las fechas por defecto de `add(... desde=..., hasta=...)` al primer y último día del mes nuevo.
   - Actualizar el diccionario `F` de fuentes con la fecha de verificación del día.
   - Revisar comercio por comercio las promos y corregir, agregar o borrar líneas `add(...)`.
3. Fuentes a revisar (preferir siempre la oficial):
   - Agregadores por comercio: convi.ar/promos-bancarias/<comercio> (carrefour, coto, dia, jumbo, disco, vea, masonline, makro, maxiconsumo, nini, diarco).
   - Páginas oficiales de cada súper: secciones «beneficios», «promociones bancarias», «medios de pago».
   - Páginas oficiales de bancos y billeteras: Banco Nación (semananacion), Provincia/Cuenta DNI, Ciudad, Galicia, Santander, BBVA, Macro, ICBC, Credicoop, Supervielle, Comafi, Patagonia, Hipotecario, Columbia, Mercado Pago, MODO, Naranja X, Personal Pay, CencoPay.
   - Notas periodísticas recientes (Clarín, La Nación, Infobae, Ámbito, iProfesional, Los Andes) solo si no hay oficial; marcar `fuente_tipo` = prensa.
   - Las promos de MODO valen para los bancos de `MODO_BANCOS`; revisar si cambió la lista.
4. Correr:
   ```
   python scripts/promos_<mes>_<año>.py
   python scripts/build_data.py
   python scripts/check_data.py
   python tests/run_tests.py
   ```
5. Subir los cambios (`data/promos_pago.json` y el script nuevo) a `main`. La web se publica sola.

## Reglas

- No inventar promos. Si no se encuentra una fuente del mes, no se carga.
- Cada promo lleva su fuente (URL) y la fecha en que se verificó.
- Indicar siempre cómo hay que pagar (`pago=`): tarjeta física, QR con MODO, QR de billetera, NFC, online, etc.
- Si la fuente no lo aclara, usar `VC` (medio de pago a confirmar).
