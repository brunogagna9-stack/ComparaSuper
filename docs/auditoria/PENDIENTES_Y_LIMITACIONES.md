# Pendientes y limitaciones (18/11/2026)

## Requieren al dueño (decisión o acceso que no se tiene desde acá)

### 1. App Check obligatorio en Firestore

- **Estado al 18/11:** 70% de pedidos verificados, sobre solo 27 en 2 días. El 30% restante es de origen desconocido e incluye una prueba propia de escritura sin permiso.
- **Riesgo de activarlo hoy:** bloquear a usuarios reales cuya verificación falle (antivirus, bloqueadores).
- **Plan:**
  1. Esperar al menos 7 días y 100 pedidos.
  2. Si «verificadas» llega al 95% o más, activarlo en App Check > APIs > Cloud Firestore > «Aplicar».
  3. Probar guardando una preferencia con una cuenta real.
- **Cómo revertirlo:** «No aplicar», con efecto en minutos.
- Hay un recordatorio sugerido para el 24/11.

### 2. Alertas de Dependabot y arreglos automáticos de seguridad

Se activan en GitHub > Settings > Code security. La API no lo permite desde esta sesión.

### 3. Limitar la clave web de Firebase

En Google Cloud > APIs y servicios > Credenciales, limitarla a las direcciones de superbarato.com.ar y a las APIs de Firebase.

### 4. Borrar ramas temporales

- `probe-off`: la sonda de Open Food Facts.
- `probe-fuentes`: una sonda de una etapa anterior.

Son de solo lectura y no afectan la web.

## Bloqueado por fuentes externas

- **Portal SEPA (Precios Claros)** caído desde el 16/11 (responde HTTP 403 a todos).
  - Los precios de sucursal quedan del 15/11 y la web lo avisa.
  - Los precios online se siguen actualizando.
  - Las cadenas que pasan los 3 días salen de «más barato».
- **Fotos:** 1.653 productos sin foto (5,6%). Open Food Facts cubriría solo un 4% de ellos.

## Limitaciones conocidas

- **No probado en dispositivos reales** (iPhone y Android) ni en Firefox, Safari o Edge. Las pruebas usan Chromium.
- **INP solo indirecto:** se mide con TBT en laboratorio. Para medir a usuarios reales haría falta guardar mediciones (web-vitals + un servicio), algo opcional.
- **El juez del buscador es automático:** tiene sus propios sesgos; por ejemplo, considera «palo» relevante para «palitos». Los 25 casos críticos están escritos a mano.
- **Lectura de tickets:** depende de Tesseract (texto), con margen de error en tickets borrosos. Todo se corrige a mano antes de confirmar. Probar PaddleOCR queda como mejora futura opcional.
- **Asistente:** funciona con reglas y datos reales, sin IA generativa. No entiende frases muy alejadas de los ejemplos; en ese caso dice qué puede hacer.
