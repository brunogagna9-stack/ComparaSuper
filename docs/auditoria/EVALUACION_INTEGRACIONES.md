# Evaluación de integraciones (18/11/2026)

Para cada candidato se revisó:
- problema que resuelve y beneficio;
- licencia, mantenimiento, dependencias y peso;
- costo, cuentas que pide, privacidad y complejidad.

Solo se incorporó lo que mejora algo medible sin agregar costos ni riesgos.

## Seleccionadas e implementadas

### 1. Pruebas de reglas de Firestore (`@firebase/rules-unit-testing` 6 + emulador oficial)
- **Problema:** un cambio en las reglas podía publicarse con un agujero, porque nada lo probaba.
- **Beneficio:** 25 pruebas (aislamiento entre usuarios, campos del servidor, baja con clave, tipos). Corren en el emulador local antes de cada publicación de las reglas; si alguna falla, no se publica.
- **Licencia y mantenimiento:** Apache-2.0, de Google, actualizado el 16/11/2026.
- **Dependencias:** `firebase` 13 (solo para desarrollo). Trajo `@grpc/grpc-js`, que tenía avisos de seguridad; se fijó en 1.14.7. `npm audit` quedó en 0.
- **Costo:** ninguno. El emulador no toca la base real.

### 2. OSV-Scanner (Google, v2.7.1) en `seguridad.yml`
- **Problema:** las dependencias de prueba y publicación no tenían un escáner dedicado.
- **Beneficio:** revisión semanal y en cada cambio de dependencias, con resultados en GitHub > Security.
- **Licencia y costo:** Apache-2.0, gratis.
- **Riesgo:** solo lee; no toca la web.

### 3. Vigilancia diaria propia (`scripts/vigilancia.mjs` + `vigilancia.yml`)
- **Problema:** nadie avisaba si la web publicada empeoraba, por ejemplo si se rompía el buscador, quedaban datos viejos o fotos rotas.
- **Beneficio:** todos los días revisa la web y avisa por correo, con el sistema de alertas que ya existe.
  - Que la página responda.
  - Hace cuánto se publicaron los datos.
  - El buscador: 25 casos y 450 búsquedas reales.
  - Una muestra de fotos.
  - El estado del portal SEPA.
- **Por qué no Upptime:** pide otro repositorio y un token personal, y solo mira si la web responde, no la calidad.
- **Costo:** ninguno (minutos de GitHub Actions gratis en repos públicos).

### 4. Ajustes del motor de búsqueda propio (en lugar de cambiar de librería)
- **Alternativas evaluadas:** FlexSearch, Orama, Fuse.js y Pagefind (en el navegador); Meilisearch, Typesense y Algolia (con servidor).
- **Decisión:** se queda el motor propio y se ajustan dos reglas: abreviaturas como «Shamp.» y diminutivos de 6 letras.
- **Motivo:** con el mismo catálogo y las mismas 450 búsquedas, el motor ya daba 99,8% de precisión y 99,3% de recall, en menos de 1 ms. Ninguna librería resolvía mejor los problemas propios de los datos argentinos (abreviaturas de los tickets, «maní/mani», tamaños), y todas sumaban peso.
- **Resultado:** el recall pasó de 99,3% a 99,9% y los productos relevantes que no aparecían bajaron de 277 a 37. Los resultados que no van subieron de 0,9% a 1,0%.

## Descartadas o postergadas (con motivo)

| Candidato | Motivo |
|---|---|
| Open Food Facts | Se probó de verdad, con una sonda de solo lectura en GitHub Actions: 150 productos sin foto y 50 con foto. Solo 6 de los 141 sin foto que respondieron (4,3%) tenían foto en Open Food Facts: serían unas 70 fotos sobre 1.653 faltantes. Además, las fotos piden atribución CC BY-SA en cada una. No compensa. |
| IA en la nube para el asistente | Costo por uso que necesita autorización, y las preguntas saldrían del navegador. El asistente se mejoró con reglas que responden solo con datos reales. |
| Prompt API de Chrome (Gemini Nano) | Solo Chrome, descarga de varios GB por el usuario y API web en evolución. Queda como mejora opcional futura, nunca para inventar precios. |
| PaddleOCR en el navegador | Más preciso en tickets según sus autores, pero los modelos pesan varios MB. Conviene medirlo antes con tickets reales argentinos. Hoy el ticket se puede corregir a mano antes de confirmar. |
| Scribe.js | Licencia AGPL-3.0, incompatible con el modo de trabajo del proyecto. |
| Meilisearch, Typesense, Algolia | Necesitan un servidor o tienen costo, y no mejoran lo medido. |
| Sentry y GlitchTip | Cuenta o servidor extra. La vigilancia y el recorrido funcional ya detectan errores. |
| OSRM y OpenRouteService | Sin servidor propio no se pueden usar en producción. |
| Gitleaks y TruffleHog | GitHub ya escanea secretos y bloquea su subida (activado). |
| CodeQL | Opcional. Biome y las pruebas cubren lo principal; se puede activar desde GitHub cuando el dueño quiera. |
