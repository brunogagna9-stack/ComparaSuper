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

## Sugerencias con aprobación y votos (gratis, con Formularios y Planillas de Google)

Las sugerencias se guardan en una planilla tuya. Solo se ven en la web las que marcás como aprobadas.

**1. Formulario de sugerencias**
- En forms.google.com crear un formulario con dos preguntas: *Sugerencia* (párrafo) y *Nombre* (respuesta corta, no obligatoria).
- Pestaña «Respuestas» → ícono de planilla → «Crear una hoja de cálculo nueva». Se crea la pestaña `Respuestas de formulario 1` con las columnas: A marca temporal, B sugerencia, C nombre.
- En esa pestaña escribir `Aprobada` en la celda D1. Seleccionar la columna D desde la fila 2 → Insertar → Casilla de verificación.

**2. Formulario de votos**
- Crear otro formulario con dos preguntas de respuesta corta: *id* y *voto*.
- En «Respuestas» → «Vincular a Hojas» → elegir **la misma planilla**. Se crea la pestaña `Respuestas de formulario 2` (A marca temporal, B id, C voto).

**3. Pestaña pública**
- Crear una pestaña nueva llamada `Publico`. En la fila 1 escribir: `id`, `fecha`, `nombre`, `texto`, `positivos`, `negativos`.
- En la fila 2 pegar estas fórmulas (están con `;` y `VERDADERO`, como las usa una planilla en español; si tu planilla está en inglés, cambiá `;` por `,` y `VERDADERO` por `TRUE`):

| Celda | Fórmula |
|---|---|
| A2 | `=IFERROR(FILTER(ROW('Respuestas de formulario 1'!A2:A);'Respuestas de formulario 1'!D2:D=VERDADERO))` |
| B2 | `=IFERROR(ARRAYFORMULA(TEXT(FILTER('Respuestas de formulario 1'!A2:A;'Respuestas de formulario 1'!D2:D=VERDADERO);"dd/mm/yyyy")))` |
| C2 | `=IFERROR(FILTER('Respuestas de formulario 1'!C2:C;'Respuestas de formulario 1'!D2:D=VERDADERO))` |
| D2 | `=IFERROR(FILTER('Respuestas de formulario 1'!B2:B;'Respuestas de formulario 1'!D2:D=VERDADERO))` |
| E2 | `=ARRAYFORMULA(IF(A2:A="";"";COUNTIFS('Respuestas de formulario 2'!B:B;A2:A;'Respuestas de formulario 2'!C:C;"positivo")))` |
| F2 | `=ARRAYFORMULA(IF(A2:A="";"";COUNTIFS('Respuestas de formulario 2'!B:B;A2:A;'Respuestas de formulario 2'!C:C;"negativo")))` |

- Archivo → Compartir → Publicar en la web → elegir solo la pestaña `Publico` y el formato «Valores separados por comas (.csv)» → Publicar. Copiar el enlace.

**4. Conectar con la web** (`site/config.json`, bloque `sugerencias`)
- En cada formulario: ⋮ → «Obtener enlace prellenado», completar algo y copiar el enlace para ver los `entry.…` de cada pregunta.
- `form_action`: dirección del formulario de sugerencias, cambiando `/viewform` por `/formResponse`.
- `campo_texto` y `campo_nombre`: los `entry.…` de *Sugerencia* y *Nombre*.
- `votos_form_action`: lo mismo para el formulario de votos.
- `campo_voto_id` y `campo_voto`: los `entry.…` de *id* y *voto*.
- `csv_publico`: el enlace del paso 3.

**Para aprobar:** tildar la casilla en la columna D. La web se actualiza sola en unos 5 minutos, que es lo que tarda Google en refrescar el CSV publicado. Para sacar una sugerencia, destildá la casilla.

Mientras `csv_publico` esté vacío, la página muestra tres sugerencias de ejemplo y no envía nada. Cada navegador puede votar una vez por sugerencia. Es un control simple: alguien insistente podría votar más de una vez.

## Fotos, links a productos y carrito online

- **Fotos de productos:** las saca `online_fetch.py` de las tiendas online que usan la plataforma VTEX (Carrefour, ChangoMás, Día, Disco, Jumbo y Vea) y las guarda en `data/imagenes.json`. Los productos que no se venden en ninguna de esas tiendas muestran un ícono de su categoría.
- **«Ver producto ↗»:** lleva a la página exacta del producto en esas tiendas. En las demás aparece «Buscar en la tienda ↗», que abre el buscador de la tienda con el nombre del producto, o nada si la cadena no tiene tienda online.
- **«Armar el carrito en…»:** en «¿Dónde conviene mi compra?», si una tienda VTEX tiene todos los productos, el botón abre esa tienda con el carrito ya cargado. El envío o retiro y el pago se eligen en la tienda.

## Comercios cerca de mí

`sepa_fetch.py` guarda en `data/sucursales.json` la ubicación de cada sucursal de CABA y GBA, tomada de la base oficial. La página la usa cuando la persona marca su ubicación con el GPS o escribe su barrio o localidad. Con eso muestra los comercios dentro del radio que elija y filtra las promos del día y los productos. La ubicación se guarda solo en ese navegador.

## Promos de MODO y bancos adheridos

Las promos de MODO llevan la lista de bancos que participan en el campo `bancos` (`MODO_BANCOS` en `scripts/promos_noviembre_2026.py`), y las de Cuenta DNI llevan Banco Provincia. Si alguien elige solo "BBVA" en Mis medios, igual ve las promos de MODO, porque las puede usar cargando su tarjeta de BBVA en MODO.

## Medición y publicidad

**Contador de visitas (GoatCounter, gratis).** Hay que crear una cuenta en goatcounter.com y poner el código elegido en `site/config.json`, en el campo `"goatcounter"`. Desde ese momento cuenta:
- las visitas a cada sección;
- los clics hacia cada tienda: `salida-producto-<comercio>` («Ver en la tienda»), `salida-buscar-<comercio>` («Buscar en la tienda») y `salida-carrito-<comercio>` («Armar el carrito»). Es el número para mostrarle a un supermercado cuánto tráfico le mandamos;
- las veces que se vio un anuncio (`publicidad-vista-<id>`) y los clics que recibió (`publicidad-clic-<id>`).

**Espacios de publicidad.** Están en el inicio, en ofertas, en descuentos por día y en la ficha de cada producto, y solo aparecen si hay un anuncio cargado. Para cargar uno, se copia `_publicidad_ejemplo` de `site/config.json` dentro de la lista `"publicidad"` y se completa así:
- `id`: un nombre corto para el anuncio;
- `lugares`: uno o varios de `inicio`, `ofertas`, `descuentos` y `ficha`;
- `titulo` y `texto`, o `imagen` (el archivo se sube a `site/img/publicidad/`);
- `link`: la página del anunciante;
- `desde` y `hasta`: las fechas en que se muestra.

Si un lugar tiene varios anuncios, se elige uno al azar. Todos llevan la etiqueta «Publicidad», que no se puede sacar.

## Logos de comercios y bancos

La web no incluye logos de marcas. Para usarlos:

1. Conseguir el archivo oficial, por ejemplo del kit de prensa de cada empresa, y verificar que se pueda usar.
2. Subirlo a `site/img/logos/`, por ejemplo `site/img/logos/coto.png`. Conviene que sea cuadrado o apaisado y con fondo transparente.
3. En `site/config.json` agregarlo así: `"logos": {"coto": "img/logos/coto.png"}`. La clave es el `id` del comercio que figura en `data/stores.json`. Para bancos y billeteras se usa `"logos_medios"`, con el `id` del medio que figura en `data/promos_pago.json`.

Mientras no haya logo, se muestra un cuadradito con las iniciales del comercio.

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
