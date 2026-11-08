# ComparáSúper (prototipo)

Comparador gratuito de precios de supermercados de Argentina, hecho con la misma base que ComparáTech:
web estática en GitHub Pages + un proceso automático (GitHub Actions) que actualiza los datos todos los días.

## Qué hace la web

Compara **20 comercios de CABA y GBA**, ordenados alfabéticamente: comercios (Carrefour, Carrefour Maxi, ChangoMás, Coto, Día,
Diarco Barrio, Disco, Josimar, Jumbo, Makro, Supermercados Dar, Vea), mayoristas (Diarco Mayorista, Maxiconsumo, Nini,
Punto Mayorista, Vital, Yaguar) y apps de delivery (PedidosYa Market, Rappi Turbo). Las cadenas de otras provincias
se agregan sumándolas a `data/stores.json`.

- **Buscador y categorías**: el mismo producto en Carrefour, Coto, Día, Jumbo, Disco, Vea y ChangoMás, con precio por kilo o litro.
- **Ofertas vigentes**: 2x1, 3x2, 2da al 70%, etc., con el precio real por unidad y un aviso si sin oferta está más barato en otro lado.
- **Precio en el local y online**: a veces la tienda web (por ejemplo Coto Digital) es más barata; se suma el costo de envío.
- **Descuentos por día**: bancos, billeteras virtuales, tarjetas y clubes, con tope, mínimo, vigencia, fuente y
  **cómo hay que pagar** para que aplique (tarjeta física, QR con MODO, QR de la billetera, celular NFC, online, dentro de la app…).
- **Mis medios de pago**: cada persona marca qué tarjetas y billeteras tiene y los precios finales se calculan solo con esos.
- **¿Dónde conviene mi compra?**: arma tu lista y te dice en qué súper, qué día y con qué medio de pago sale menos, o si conviene repartirla en dos.
- **Compartir la lista** por WhatsApp, correo, texto o enlace (quien la recibe la abre con un toque).
- **Registro para recibir novedades** por correo (ver abajo).
- **Modo claro / modo oscuro** con un botón al lado del buscador.
- **Historial de precios**, **Bajaron / Subieron de precio**, **Avisarme si baja** (🔔) y aviso de **precio inusual** (posible error de carga).

## De dónde salen los datos

- **Precios y ofertas**: base oficial **SEPA / Precios Claros** (Secretaría de Comercio). Las cadenas grandes están obligadas
  a informar cada día el precio de cada producto en cada sucursal, con su código de barras. Se descarga gratis de
  `datos.produccion.gob.ar/dataset/sepa-precios`. Por eso comparamos el **mismo** producto (mismo código de barras) y no por el nombre.
- **Descuentos bancarios**: se cargan a mano en `data/promos_pago.json`, cada uno con el enlace a la página oficial y la fecha.
  Hoy son **de ejemplo** (marcados con `"ejemplo": true`).

## Qué se lee automáticamente y qué falta

| Fuente | Qué trae | Estado |
|---|---|---|
| SEPA minoristas (oficial) | precio en sucursal de los supermercados | listo (`sepa_fetch.py`) |
| SEPA mayoristas (oficial) | precio en sucursal de los mayoristas | listo; formato a confirmar con el primer archivo |
| Tiendas web VTEX | precio online de Carrefour, ChangoMás (Más Online), Día, Disco, Jumbo y Vea | listo (`online_fetch.py`) |
| Coto Digital | precio online de Coto | pendiente (usa otra plataforma) |
| PedidosYa Market, Rappi Turbo | precio en la app | pendiente: el precio cambia según la dirección y sus condiciones de uso pueden prohibir la lectura automática; conviene pedirles acceso como socio/afiliado |
| Descuentos con medios de pago | bancos, billeteras, tarjetas | se cargan a mano en `data/promos_pago.json` |

El costo de envío y el mínimo para envío gratis de cada tienda online están en `data/stores.json` y hoy son de ejemplo.

## Registro de novedades (gratis, con Formularios de Google)

1. Crear un formulario en forms.google.com con tres preguntas: *Correo* (respuesta corta), *Temas* (casillas) y *Zona* (respuesta corta).
2. En el formulario: ⋮ → «Obtener enlace prellenado», completar cualquier cosa y copiar el enlace. Ahí aparecen los nombres `entry.123456…` de cada pregunta.
3. En `site/config.json` poner:
   - `form_action`: la dirección del formulario cambiando `/viewform` por `/formResponse`
   - `campo_email`, `campo_temas`, `campo_zona`: los `entry.…` de cada pregunta
   - `sitio_url`: la dirección pública de la web (para los enlaces de las listas compartidas)
4. Las respuestas quedan en una planilla de Google. Para mandar los correos se puede usar Gmail o un servicio gratuito de newsletters.

Mientras `form_action` esté vacío, el formulario avisa que todavía no está conectado y no guarda nada.

## Estructura

```
site/                  la web (esto es lo que publica GitHub Pages)
  index.html, css/, js/app.js
  config.json          formulario de novedades y dirección del sitio (se edita a mano)
  data/                los datos que lee la web (los genera build_data.py)
scripts/
  sepa_fetch.py        descarga SEPA (minoristas y mayoristas) y lo resume por cadena y producto
  online_fetch.py      suma el precio online de las tiendas web VTEX
  build_data.py        arma site/data/*.json (historial, cambios de precio, categorías)
  check_data.py        controla los datos antes de publicar
  make_demo.py         genera datos de ejemplo para probar sin conexión
data/
  stores.json          cadenas que se comparan
  promos_pago.json     descuentos por medio de pago (se editan a mano)
.github/workflows/actualizar.yml   corre todo una vez por día
tests/run_tests.py     pruebas
```

## Subirlo a GitHub

Ver **GUIA-GITHUB.md** (paso a paso).

## Probarlo en tu computadora

```
python scripts/make_demo.py
python scripts/build_data.py
cd site && python -m http.server
```
y abrir http://localhost:8000

## Pasar a datos reales

Desde la pestaña **Actions** de GitHub, correr **Actualizar precios**. El primer día ya reemplaza los precios de ejemplo
por los reales; el historial se va llenando día a día.
