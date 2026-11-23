# Pendientes — 22/11/2026

## Requiere tu autorización o gestión
1. **Recuperar el acceso a SEPA (lo más importante).** El portal bloquea a los servidores desde el 16/11. Opciones, de la más recomendable a la menos:
   - **Pedir al portal que habilite el acceso automático** (por el formulario de contacto de datos.produccion.gob.ar o la Secretaría de Comercio). Hay que explicar que SuperBarato descarga una vez por día el conjunto público `sepa-precios` desde GitHub Actions y que desde el 16/11 recibe un 403 de BunkerWeb. Es gratis y legítimo; puede tardar. Te puedo redactar el mensaje.
   - **Carga manual**: vos descargás el archivo del día desde tu navegador y lo subís; `sepa_fetch.py archivo.zip` ya lo procesa. Falta un flujo para subirlo (los archivos pesan unos 330 MB). Se puede implementar si te sirve.
   - **Descarga desde una computadora tuya** (un "runner" propio de GitHub). Funciona, pero conviene **preguntar antes al portal** si la descarga automatizada está permitida, para no saltear su bloqueo. No lo hice.
2. **App Check**: volver a mirar las métricas alrededor del 24/11 para decidir si se activa la verificación obligatoria.
3. **Alertas de Dependabot**: solo se ven desde tu cuenta (Settings → Security). `npm audit` da 0.
4. **Ramas que podés borrar** (no las pude borrar desde acá): `diag-sepa` (diagnóstico temporal), `probe-off`, `probe-fuentes`. **No borres** las `respaldo-*`.

## Limitaciones conocidas
- Historial: para los productos que **solo se venden online**, la columna del 15/11 quedó con el precio leído hasta el 21/11 (la falla ya está corregida). No se puede recuperar el valor real del 15/11 y no se inventó uno. Se va a ir "corriendo" fuera de la ventana del historial.
- "Últimos datos publicados por SEPA" en los correos dice "no visible desde el servidor" mientras dure el bloqueo: es la verdad desde ahí.
- Las demoras de GitHub en las tareas programadas (hasta 5 h) no se pueden controlar. La vigilancia avisa solo si pasan más de 30 h sin correr.
- Las mediciones son de laboratorio. No se probó en un teléfono físico.
