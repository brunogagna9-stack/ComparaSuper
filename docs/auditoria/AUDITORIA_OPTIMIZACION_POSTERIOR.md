# Auditoría de optimización POSTERIOR — 19/11/2026

Estado medido: la web publicada después de la fase de optimización (commit `a23ead2`, service worker `cs-v12`),
con **las mismas herramientas y condiciones** que la [auditoría previa](AUDITORIA_RENDIMIENTO_PREVIA.md):
Chromium real con un celular simulado (Pixel 7) y la CPU 4× más lenta, Lighthouse 12 corrido 3 veces en modo celular y `size-limit` igual que en el CI.
Todo es de laboratorio: no son datos de visitantes reales.

## Antes / después

| Indicador | Antes | Después | Cambio |
|---|---|---|---|
| Código de entrada (gzip, límite 160 KB sin cambiar) | 155,3 KB | **129,8 KB** | −16 % (margen 3 % → 19 %) |
| Descarga inicial en el celular (Lighthouse) | 163 KB | **144 KB** | −12 % |
| Primera visita sin provincia, a los 15 s | 166 KB · 10 pedidos | 147 KB · 9 pedidos | −11 % |
| Visita con provincia, a los 15 s | 342,5 KB · 25 pedidos | 316,3 KB · 23 pedidos | −8 % |
| JS cargado al entrar (sin comprimir) / usado | 279 KB / 16 % | 227 KB / 14 % | −52 KB cargados (ver nota) |
| CSS al entrar / usado | 90 KB / 16 % | 91,5 KB / 16 % | +1,5 KB (sistema de tiempos y animaciones) |
| Imágenes (visita con provincia) | 129,4 KB | 129,5 KB | sin cambio (ya eran WebP con tamaño reservado y carga diferida) |
| Fuente | 27,4 KB | 20,8 KB | −24 % |
| LCP (celular, Lighthouse) | 1,23 s | **1,06 s** | −14 % |
| TBT (celular, Lighthouse) | 0 ms | 0–43 ms | igual (muy por debajo de 200 ms) |
| CLS | 0 | 0–0,007 | igual (meta ≤ 0,1) |
| Toques (≈INP, celular CPU 4×) | 128 ms | **112 ms** | −13 % |
| Sección más lenta | Ofertas: 8,5–10,1 s | Buscar: 0,69 s | **−93 %** |
| Ofertas | 8.487–10.085 ms | 592 ms | −94 % |
| Buscar | 1.736–1.859 ms | 688 ms | −62 % |
| Tareas largas en la sesión | 34–51, total 23,8–28,6 s | 44, total 7,5 s | −70 % de tiempo bloqueado |
| Peor tarea larga | 8,4–9,8 s | 0,67 s | −93 % |
| Tiempo de script en la sesión | 23,3 s | 2,6 s | −89 % |
| Buscador listo | 3,1–4,4 s | 3,2 s | igual (lo limita la descarga de datos) |
| Memoria tras la sesión (heap) | 50,3 MB | 51 MB | igual |
| Nodos / escuchas tras la sesión | 9.792 / 859 | 7.959 / 683 | −19 % / −20 % (sin fuga de auto-animate) |
| Abrir ficha: cuadros perdidos | 0 de 42 | 0 de 43 | igual |
| ¿Dónde conviene? en el celular (12 productos) | página de 22.811 px | 7.235 px | el resultado queda a ~1 pantalla |
| Lighthouse celular | 100/100/100/100 | 100/100/100/100 | igual |
| Lighthouse escritorio | no medido antes | 100/98→100*/100/100 | *se corrigió un salto de títulos del selector de provincia |
| Pruebas | 44 Playwright + 41/41 funcionales | 44 Playwright + 41/41 funcionales | todas aprobadas |

Nota sobre el "% usado": baja de 16 % a 14 % porque el porcentaje se mide sobre el código minificado en vivo, y lo que se quitó (floating-ui y auto-animate) se usaba casi entero al cargar. Lo que importa es que hay 52 KB menos para descargar, analizar y ejecutar.

## Qué se cambió (y por qué mejoró)
1. **Ofertas destacadas**: los repetidos se quitan ahora con un `Set` (lineal) en vez de `findIndex` (cuadrático), y el resultado queda guardado mientras no cambien los datos.
2. **Ofertas**: la lista completa y los tipos se calculan una vez por cada carga de datos, y los filtros sólo filtran.
3. **Búsqueda**: el precio, el precio por unidad y la variación se calculan una sola vez por producto dentro de cada ordenamiento.
4. **auto-animate eliminado**: la entrada de elementos ahora es una animación CSS de 160 ms, sin observadores ni temporizadores.
5. **floating-ui eliminado**: los tooltips usan una función propia (`flotar`) que se limpia al cerrar.
6. **El selector de provincias (mapa.js) se descarga sólo cuando hace falta**: en la primera visita o al cambiar de provincia. Los nombres de las provincias están en `provincias.js` (pesa poco).
7. **Se minifican en la publicación** `cuenta.js`, `legal.js` y `provincias.js`.
8. **La fuente se recortó** a los pesos que realmente se usan (400–800).
9. **Sistema de tiempos**: toque 120 ms, menú 180 ms y panel 220 ms. Sólo se animan `transform` y `opacity`, y la barra de progreso usa `scaleX` en vez de `width`. Los botones tienen respuesta al tocarlos, las hojas y menús suben al abrirse, y el contador del carrito late al sumar. Todo se desactiva con "reducir movimiento" (verificado: animación `none`, transición `0s`).
10. **¿Dónde conviene? en el celular**: si hay más de 4 productos, la lista se pliega ("Ver y cambiar los N productos"), y se recuerda si la dejaste abierta. Los cálculos no cambiaron.

## Sin cambios a propósito
- **Algoritmo de búsqueda**: las mediciones no mostraron un problema de relevancia (P@10 99,8 %).
- **Imágenes**: ya estaban optimizadas.
- **Gráficos**: ya se cargaban sólo al abrir la ficha.
- **Memoria (heap)**: la ocupan sobre todo los datos de precios, que hacen falta para buscar sin conexión.
- **View Transitions**: no se agregaron. El cambio de sección ya es inmediato (menos de 200 ms en la mayoría), y una transición entre vistas agregaría espera en celulares lentos.

## Qué se simuló y qué no
Se simuló un celular Pixel 7 con la CPU 4× más lenta. Lighthouse además simula una red 4G lenta.
No se probó en un teléfono físico ni con datos de campo (CrUX). Esos se verán en Search Console en unas semanas.
