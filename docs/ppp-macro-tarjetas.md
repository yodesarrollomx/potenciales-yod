# Macrolotes · recorrido por clics

Pedido de Dirección (19-oct-2026) sobre los PPP de Master Brokers con Eduardo Lara, que usan este motor. La página estaba "muy suelta": muchas barras, cifras repetidas y las decisiones al fondo. Lo que se pidió es llegar a cada decisión por clics y en forma visual, con los mismos switches y los mismos cálculos. La especificación la hizo un editor de diseño a partir de capturas reales y se implementó como capa de presentación.

## Página

1. **Barra superior de una línea:** utilidad y margen, deuda pico y estado del agua. Al tocarla se despliegan todas las métricas originales.
2. **Caso:** Guardar queda a la vista. Mis casos, Nuevo, Seguimiento, Reuniones y WhatsApp pasan a "Más". Las versiones siguen igual.
3. **Veredicto (hero):** la cifra principal, y debajo las otras dos lado a lado en el teléfono. La lectura y la nota de referencia van dentro de "Leer el resumen del caso". La alerta del agua lleva directo a su candado.
4. **Espacio de trabajo:**
   - *Decisiones:* lista agrupada de las 6 tarjetas.
   - *Ver el proyecto:* pestañas Plano, Embudo, Dinero y Corrida, con un gráfico a la vez.
   - En escritorio van en dos columnas, con el gráfico fijo a la derecha mientras se ajusta a la izquierda.

## Niveles de cada decisión

| Nivel | Qué se ve | Al tocar |
| --- | --- | --- |
| N1 · Tarjeta | Icono, nombre y resumen (ej. "50 ha · 61% vendible"). Punto rojo si el agua está en veda. | Abre la tarjeta (una a la vez). |
| N2 · Secciones | Franja de 3 cifras y su gráfica. Cada `.subheading` original es una fila con su resumen (ej. "500 × 1,000 m · vialidad 20 m"; "suma 103%" en rojo si el reparto no da 100). | Abre la sección (pueden ser varias). |
| N3 · Filas | Cada control como fila: etiqueta, unidad y valor actual. Un punto dorado si cambió contra la referencia. | Abre su control (uno a la vez). El valor se sigue pudiendo escribir a mano. |
| N4 · Control | El slider original, con mínimo y máximo. Los controles de 0/1 se ven como switch. | — |

## Cómo está hecho

`ppp-macro-cards.js` y `ppp-macro-cards.css`, más tres líneas en `macrolotes.html`: la hoja de estilos, el script y `queueMicrotask(()=>PPPMacroCards.update(r))` al inicio de `render()`.

Los nodos originales se **mueven**, no se clonan. Se conservan los IDs, listeners, guardado, versiones, comparador, chinches y el salto desde fórmulas: cada encabezado de tema queda inmediatamente antes de su cuerpo, y un clic en `[data-jump]` abre primero su fila. Lo cerrado queda con `visibility:hidden`, así que no se puede enfocar con el teclado.

## Verificación

`node tests/ppp-macro-cards-browser.cjs` (Chromium y WebKit), además de las regresiones `ppp-cierre-browser` y `ppp-version-bridge-browser`.

## Reversión

Revertir el PR. No se tocan casos, libros, versiones ni sesiones.
