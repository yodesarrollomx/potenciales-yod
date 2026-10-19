# Macrolotes · tarjetas resumen y mini-tarjetas

Pedido de Dirección (19-oct-2026, sobre los PPP de Master Brokers con Eduardo Lara, que usan este motor): que cada tarjeta, antes de abrirse, dé el resumen con pocos datos y gráficas, y que al abrirla no se despliegue todo hacia abajo sino por subgrupos.

## Qué cambia (solo presentación)

- **Tarjeta cerrada:** se ven 4 datos, cada uno con su icono. Si una tarjeta tiene más, los demás aparecen al abrirla. Urbanización, Costos, Capital y Servicios suman una gráfica chica; Terreno y Mezcla conservan las barras que ya tenían.
- **Tarjeta abierta:** arriba aparecen "puntos", uno por subgrupo (los mismos `.subheading` de siempre). Cada punto abre o cierra su mini-tarjeta con sus switches. Puede haber varias abiertas a la vez, en rejilla del mismo ancho (una columna en teléfono). "Abrir todo / Cerrar todo" opera sobre los mismos temas.

## Fuente de las gráficas

| Tarjeta | Gráfica | Escala |
| --- | --- | --- |
| Urbanización | Por cantidad (`urbVariable`) vs obra fija (`obraFija`); urbanización / costo del proyecto | 0–100% |
| Costos | De cada peso vendido: urbanización, construcción, blandos, financieros, terreno y otros (residuo), utilidad | 0–100% de ventas |
| Capital | Calendario: urbanización (`etapas × mesesUrbEtapa`), inicio de ventas y mes del pico; deuda pico / límite modelado | meses del caso |
| Servicios | Agua contra la dotación NMX-R-046 de 1 l/s/ha del propio terreno; demanda eléctrica | 0–10 MVA |

Todo sale del mismo `state` que pinta `render()`. Nada se recalcula aparte. Un dato ausente se muestra como `—`, y lo que rebasa la escala lo avisa.

## Cómo está hecho

`ppp-macro-cards.js` y `ppp-macro-cards.css`, más tres líneas en `macrolotes.html`: la hoja de estilos, el script y `queueMicrotask(()=>PPPMacroCards.update(r))` al inicio de `render()`. Los controles se **mueven**, no se clonan: IDs, listeners, guardado, versiones, chinches y el salto desde fórmulas (`revelar()`) siguen igual, porque cada encabezado de tema queda inmediatamente antes de su cuerpo.

## Verificación

`node tests/ppp-macro-cards-browser.cjs` (Chromium y WebKit), además de las regresiones `ppp-cierre-browser` y `ppp-version-bridge-browser`.

## Reversión

Revertir el PR. No se tocan casos, libros, versiones ni sesiones.
