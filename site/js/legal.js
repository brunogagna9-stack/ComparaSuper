/* SuperBarato — Términos de uso y política de privacidad. Se baja recién cuando alguien abre esa página (así la web carga más rápido). */
function vLegalPagina() {
  setTab("legal");
  const R = CFG.responsable || {};   // identidad y contacto del responsable (Ley 25.326, art. 6): se cargan en site/config.json
  const resp = R.nombre ? `<li><b>Responsable de los datos:</b> ${esc(R.nombre)}${R.domicilio ? `, ${esc(R.domicilio)}` : ""}${R.email ? ` · <a href="mailto:${esc(R.email)}">${esc(R.email)}</a>` : ""}.</li>` : "";
  const contacto = R.email ? `escribiendo a <a href="mailto:${esc(R.email)}">${esc(R.email)}</a> o desde <a href="#sugerencias">Contacto y sugerencias</a> (aclarando que es un pedido sobre tus datos: no se publica)` : `desde <a href="#sugerencias">Contacto y sugerencias</a>, aclarando que es un pedido sobre tus datos (esos mensajes no se publican)`;
  $("#view").innerHTML = `<div class="wrap legal"><section class="blk first">
    <h1>📄 Términos de uso y privacidad</h1><p class="sub">Última actualización: 16 de noviembre de 2026.</p>
    <h2>Qué es SuperBarato</h2>
    <p>SuperBarato es un comparador independiente y gratuito de precios de supermercados, mayoristas y tiendas online de ${enAMBA() ? "CABA y GBA" : esc(provNombre(PROV))}. <b>No vende productos</b>, no cobra comisiones y no tiene relación comercial con los comercios, bancos ni billeteras que aparecen. Usar la página implica aceptar estos términos.</p>
    <h2>Precios, descuentos y comparaciones</h2>
    <ul>
      <li>Los precios de las sucursales salen de la base oficial <b>SEPA (Precios Claros)</b>, que las cadenas informan al Estado nacional. Mostramos el precio más común entre las sucursales de la zona; en tu sucursal puede ser distinto. Esos datos los publica la Subsecretaría de Defensa del Consumidor y Lealtad Comercial con licencia <a href="https://creativecommons.org/licenses/by/4.0/deed.es" target="_blank" rel="noopener">CC BY 4.0</a>; SuperBarato los procesa, así que lo que mostramos no es la información oficial tal cual.</li>
      <li>Los precios online salen de las tiendas web de cada cadena y no incluyen el envío; cuando armás tu compra, lo sumamos aparte si la tienda lo informa.</li>
      <li>Los descuentos con bancos, billeteras y tarjetas los relevamos de las páginas oficiales y de notas periodísticas; cada uno indica su fuente y la fecha en que se verificó. Tienen topes, días y condiciones que pueden cambiar sin aviso.</li>
      <li>Las comparaciones (cuál es más barato, ¿Dónde conviene?, Tu inflación) se calculan con esos datos y con el método que explicamos en cada sección. Son información, no una recomendación de compra.</li>
      <li>Hacemos lo posible para que todo esté correcto, pero <b>la información es orientativa</b>: confirmá siempre el precio y el descuento en el comercio antes de pagar. No nos hacemos responsables por diferencias, errores de las fuentes, cambios de último momento ni por interrupciones de la página.</li>
      <li>Las marcas, logos y fotos de productos pertenecen a sus dueños y se usan solo para identificar los productos y comercios comparados. Si sos titular de una marca y querés que la quitemos, escribinos.</li>
    </ul>
    <h2 id="s-privacidad">Privacidad: qué datos usamos</h2>
    <ul>
      ${resp}
      <li><b>Sin cuenta</b> podés usar toda la página. Tu carrito, tus medios de pago, tus listas, la vista elegida y el tema se guardan <b>solo en tu navegador</b> (almacenamiento local) y no se mandan a ningún lado. Si borrás los datos del navegador, se borran.</li>
      <li><b>Cuenta (opcional):</b> solo hace falta para marcar productos con la 🔔 y para recibir correos. Si creás una, guardamos tu correo, la zona, qué correos elegiste recibir (ofertas de la semana y/o avisos de baja) y los productos que marcaste. Si entrás con Google, Google nos comparte solo tu correo y tu nombre; nunca vemos tu contraseña. Para frenar robots, al ingresar o crear la cuenta usamos <b>reCAPTCHA de Google</b>, que analiza de forma invisible cómo se usa la página (se aplican la <a href="https://policies.google.com/privacy" target="_blank" rel="noopener">política de privacidad</a> y las <a href="https://policies.google.com/terms" target="_blank" rel="noopener">condiciones</a> de Google). Las cuentas y esos datos los guarda <b>Firebase, de Google</b> (en servidores de Brasil y de otros países), y los correos se envían con <b>Brevo</b> (Francia, Unión Europea). Usamos tus datos solo para mandarte lo que elegiste: no los vendemos ni los compartimos. Cada correo trae cómo dejar de recibirlo, y desde <a href="#cuenta">Mi cuenta</a> podés cambiar qué recibís o <b>borrar tu cuenta</b> con todos sus datos cuando quieras.</li>
      <li><b>Ubicación:</b> si la marcás, se usa en tu navegador para calcular los comercios cercanos y no se guarda en ningún servidor. Solo si tocás «Cómo llegar» se abre Google Maps con tu ubicación y el destino.</li>
      <li><b>Cámara:</b> al escanear un código de barras o leer un ticket, la imagen se procesa en tu celular y no se sube a ningún lado.</li>
      <li><b>Sugerencias y votos:</b> si dejás una sugerencia (con tu nombre, si querés), se guarda en una planilla privada de Google del responsable del sitio, en servidores de Google que pueden estar fuera de la Argentina; al enviarlos, aceptás que se guarden ahí. Dar estos datos es voluntario: si no los das, podés usar toda la página igual. Las sugerencias solo se publican después de ser revisadas. Los votos son anónimos.</li>
      <li><b>Servicios externos:</b> como cualquier página web, al cargarse pide archivos a otros servicios, que reciben tu dirección IP y el tipo de navegador: GitHub Pages (aloja la página), wsrv.nl (achica las fotos), los sitios de los comercios (fotos de productos), OpenStreetMap y OpenFreeMap (mapas), jsDelivr (lector de tickets), GoatCounter (estadísticas) y Google (formularios). No les mandamos tus datos personales.</li>
      <li><b>Estadísticas de visitas:</b> contamos visitas de forma anónima con GoatCounter (qué secciones se usan, desde qué tipo de dispositivo y cuántas veces se toca un enlace hacia cada tienda), sin cookies y sin datos personales.</li>
      <li><b>Publicidad:</b> si hay anuncios, siempre están marcados como «Publicidad» y nunca cambian los precios, el orden ni qué comercio aparece como más barato.</li>
      <li><b>Enlaces a otras páginas:</b> al tocar «Ver en la tienda» o «Armar el carrito» pasás al sitio del comercio, que tiene sus propias condiciones y políticas de privacidad.</li>
      <li>El <b>asistente virtual</b> funciona dentro de tu navegador: lo que le escribís no se envía a ningún lado.</li>
    </ul>
    <h2>Tus derechos</h2>
    <p>Podés pedir acceder a tus datos, corregirlos, actualizarlos o borrarlos (tu cuenta, tu correo o una sugerencia tuya; la cuenta también la podés borrar vos desde <a href="#cuenta">Mi cuenta</a>) ${contacto}. Respondemos en los plazos de la Ley 25.326 de Protección de Datos Personales: hasta 10 días corridos para el acceso y 5 días hábiles para corregir o borrar.</p>
    <p class="sub">El titular de los datos personales tiene la facultad de ejercer el derecho de acceso a los mismos en forma gratuita a intervalos no inferiores a seis meses, salvo que se acredite un interés legítimo al efecto conforme lo establecido en el artículo 14, inciso 3 de la Ley N° 25.326. La Agencia de Acceso a la Información Pública, en su carácter de Órgano de Control de la Ley N° 25.326, tiene la atribución de atender las denuncias y reclamos que interpongan quienes resulten afectados en sus derechos por incumplimiento de las normas vigentes en materia de protección de datos personales.</p>
    <h2>Otras condiciones</h2>
    <ul>
      <li>El código y el diseño de SuperBarato son del proyecto. Los datos de precios de SEPA se pueden reutilizar según su licencia CC BY 4.0, citando la fuente.</li>
      <li>Podemos actualizar estos términos; la fecha de arriba indica la última versión.</li>
      <li>Estos términos se rigen por las leyes de la República Argentina.</li>
    </ul>
  </section></div>`;
}
