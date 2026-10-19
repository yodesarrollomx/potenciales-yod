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

## Fichas (tercera ronda, 19-oct)

Dirección pidió fichas en vez de renglones: cuadritos bien organizados, siempre con icono, con color por significado, número y, si aplica, nivel. Algo muy visual, como el panel de un juego de estrategia, pero profesional y con el estilo de Aurum.

**Regla única:** una ficha se abre y se vuelve panel en su mismo lugar. Lo demás se acomoda alrededor sin dejar huecos.

| Nivel | Ficha | Al tocar |
| --- | --- | --- |
| 1 · Decisión | Icono de color, nombre, número grande (ej. "50 ha"), detalle ("61% vendible") y barrita de nivel. Borde rojo si hay alerta (agua en veda, pérdida). | Se vuelve panel: franja de 3 cifras, gráfica y fichas de sección. Una decisión abierta a la vez. |
| 2 · Sección | Icono por significado, título, número clave (ej. "500 × 1,000 m"; "100%" del reparto, en rojo si no suma), detalle, cuántos ajustes trae y punto dorado si alguno cambió. | Se vuelve panel con sus fichas de ajuste. Una sección abierta a la vez por decisión. |
| 3 · Ajuste | Icono propio (frente, fondo, precio, %, meses, agua, energía…), nombre, unidad, valor grande y barrita que muestra dónde está dentro de su rango. Los 0/1 son interruptores que dicen qué significa el lado activo (ej. "Vender en breña a Infonavit"). | Se vuelve panel con su control original. Uno abierto a la vez. |

**Color = significado:**

| Color | Significado |
| --- | --- |
| Morado | Terreno |
| Verde | Ingresos |
| Rojo | Costos |
| Azul | Crédito |
| Naranja | Tiempo |
| Turquesa | Agua |
| Dorado | Energía, gente y valores ajustados |

El color va solo en el icono y la barrita, nunca de fondo.


## Sistema unificado (cuarta ronda, 19-oct · aprobada para publicar)

Dirección pidió que todo se viera como una misma cosa: un diseño empresarial con jerarquía y lógica en cada elemento ("como lo haría Apple"), y un infográfico propio en cada tarjeta.

- **Un solo componente, la ficha.** La anatomía es la misma en los tres niveles y solo cambia la escala:

  | Nivel | Visual | Valor | Radio |
  | --- | --- | --- | --- |
  | Decisión | Infográfico de 56 px | 22 px | 20 |
  | Sección | Icono de 36 px | 18 px | 16 |
  | Ajuste | Icono de 28 px | 17 px | 13 |

  Arriba a la izquierda va el visual y arriba a la derecha el estado; debajo, título, valor, detalle y nivel.
- **Infográficos vivos** que se dibujan con los datos del caso:

  | Decisión | Infográfico |
  | --- | --- |
  | Terreno | Polígono a escala, con la parte vendible lotificada y el frente a carretera |
  | Producto | Dona con la mezcla de ventas |
  | Urbanización | Traza de calles con su peso en el costo |
  | Costos | Anillo de costo contra utilidad |
  | Capital | Curva real de la deuda mes a mes, con el pico |
  | Servicios | Gota que se llena con la demanda de agua contra la dotación NMX; roja en veda |

- **Mismo encabezado de panel** al abrir cualquier ficha: visual, título y detalle, valor y cerrar.
- **Una sola gráfica de barra** para las seis decisiones. Las barras viejas, de otro estilo, se ocultan dentro de la tarjeta; el plano y el embudo siguen en "Ver el proyecto".
- **Lo que cabe:**
  - Alturas iguales por nivel.
  - Títulos de máximo 2 líneas, en el mismo tono gris.
  - El número nunca se corta: la unidad va más chica junto a él.
  - La "?" de ayuda solo aparece en el ajuste abierto.
- **Parte superior homologada:** sin mayúsculas forzadas; el caso, las versiones y el veredicto usan los mismos radios, sombras y tipografía.

## Cómo está hecho

`ppp-macro-cards.js` y `ppp-macro-cards.css`, más tres líneas en `macrolotes.html`: la hoja de estilos, el script y `queueMicrotask(()=>PPPMacroCards.update(r))` al inicio de `render()`.

Los nodos originales se **mueven**, no se clonan. Se conservan los IDs, listeners, guardado, versiones, comparador, chinches y el salto desde fórmulas: cada encabezado de tema queda inmediatamente antes de su cuerpo, y un clic en `[data-jump]` abre primero su fila. Lo cerrado queda con `visibility:hidden`, así que no se puede enfocar con el teclado.

## Verificación

`node tests/ppp-macro-cards-browser.cjs` (Chromium y WebKit), además de las regresiones `ppp-cierre-browser` y `ppp-version-bridge-browser`.

## Reversión

Revertir el PR. No se tocan casos, libros, versiones ni sesiones.
