# PPP · diagrama en cadena

Propuesta `CHG-PPP-CADENA-20261111` en el atlas central. Pedido por Dirección el 11-nov-2026: el diagrama va **hasta arriba de cada Plan de Potencial**, explica lo que pasa abajo y se alimenta de los cálculos y datos del propio plan. Empieza por el tablero vertical (`mixto.html`) y queda como una sola pieza para los cinco tipos de plan.

## Qué es

Cuatro eslabones que se leen en orden:

| # | Eslabón | Qué enseña | Sale de la tarjeta |
| --- | --- | --- | --- |
| 1 | Se vende | Unidades que se venden cada mes: preventa y entrega | Ventas e ingresos |
| 2 | Entra y sale | Lo que pagan los clientes y lo que cuesta el proyecto, mes a mes | Costos · Ventas e ingresos |
| 3 | En el banco y prestado | Caja, capital puesto, crédito, tope y faltante por mes | Macro y crédito |
| 4 | Lo que queda | Ventas − proyecto − dinero prestado = utilidad; reparto entre socios | Macro y crédito |

Cada gráfica lleva notas a mano con flecha (apuntan a un mes y a un monto del estado), leyenda, la franja de obra y la raya de entrega. Al tocar o pasar el cursor se lee el mes. «Ver la tabla mes a mes» abre el flujo que ya existía en Herramientas.

## Reglas

- **Sólo presentación.** `ppp-cadena.js` no calcula resultados financieros, no usa la red y no guarda nada. `tests/ppp-cadena.test.cjs` falla si aparece `fetch`, almacenamiento del navegador o una llamada a `computar`.
- **Una sola fuente.** Recibe el mismo estado que `render()` entrega a `PPPView.update`: el de `computar()` o, con libro nativo, el de `sheetModel.estados`. Si al estado le falta lo esencial, el diagrama no aparece: nada se rellena con ceros.
- **Lo único que se acomoda** es el calendario de venta que declara el motor (preventa pareja en sus meses; el resto, parejo en la ventana de entrega), el capital acumulado mes a mes y el faltante acumulado. `cuadre()` comprueba que lo dibujado suma lo que reporta el plan (unidades, cobros, costos, capital, pico de crédito y utilidad); si no, el pie lo avisa en rojo.
- **Sin ruta nueva de escritura.** Los botones del diagrama son las versiones que ya existen en el caso y llaman a `escCambiar`. Las ligas abren la tarjeta (`PPPView.toggle`) o muestran el control que mueve el dato (`PPPView.reveal`, que no lo enfoca: enfocar o desenfocar un control nativo puede guardar).
- **Sin datos de casos en el repositorio.** Pruebas y capturas usan el andamio sintético.

## Contrato para instalarlo en otro tipo de plan

1. Cargar `ppp-cadena.css` y `ppp-cadena.js` con la etiqueta `propia` de `versiones.json`.
2. Al final de `render()`, con el estado ya confirmado: `window.PPPCadena?.update(tipo, estado, contexto)`.
3. Registrar en `adaptadores[tipo]` una función que traduzca el estado a este modelo (o `null` si falta lo esencial):

```
{ tipo, meses,
  hitos:  { preventaHasta, obraDesde, obraHasta, entregaDesde },           // meses, base 1
  vende:  { unidad: ['lote','lotes'], series: [{ id, nombre, porMes: [] }, …], total, enPreventa, ritmo,
            mesesPreventa, resto, mesesEntrega, avanceAlArrancar, ventas, productos: [{ nombre, monto }] },
  flujo:  { entra: [], sale: [], interes: [], totalEntra, totalSale, alFirmar, enObra },
  banco:  { caja: [], capital: [], credito: [], falta: [], tope, pico, mesPico, capitalUsado,
            faltante, faltaMax, mesFalta, deudaFinal, cajaFinal },
  queda:  { ventas, costo, financiamiento, utilidad, margen, tir, socios: [{ id, nombre, recibe, gana }] },
  fuentes:{ A: { tarjeta, nombre, ajustes: [[corto, idDelControl, largo]] }, B: …, C: …, D: … } }
```

`contexto`: `{ ancla, nativo, revision, caso, version, versiones: [{ id, nombre, base, activa, estado }], activar(id), abrir(tarjeta), ajustar(control), verVersiones(), verTabla() }`. Todas las funciones son del tablero anfitrión; el diagrama sólo las invoca.

### Vertical (instalado)

| Modelo | Campo de `computar()` |
| --- | --- |
| `vende.series` | `presaleUnitsPerMonth` en los meses 1…`p.preMonths`; `(units − presaleUnits) / p.delivery` en los últimos `p.delivery` |
| `flujo.entra / sale / interes` | `flows[i].rev` · `flows[i].cost` · `flows[i].cashPik` |
| `banco.caja / credito` | `flows[i].caja` · `flows[i].debt` |
| `banco.capital / falta` | acumulado de `flows[i].equity` · acumulado de `flows[i].gap − flows[i].gapCure` |
| `banco.tope / pico / mesPico` | `debtCap` · `peak` · `peakMonth` |
| `queda` | `sales` · `projectCost` · `interest + feeDebt` · `profit` · `margin` · `devIrr` · `ownerTotalProceeds` · `devDist` |
| `hitos` | `p.preMonths` · `buildStart + 1` · `buildFinish` · `totalMonths − p.delivery + 1` |

### Macrolotes, Residencial, Unifamiliar y Patrimonial (pendientes)

Sus motores ya entregan un flujo mensual (`flows` con `rev`, `cost`, `equity` y saldo de deuda o de socio), así que los eslabones 2, 3 y 4 se llenan igual. Lo que cambia es el eslabón 1: lotes por etapa, casas por mes o, en Patrimonial, superficie rentada («Se renta»). Cada uno necesita su adaptador, el punto de montaje de su página (sólo el vertical usa `ppp-ui.js`) y su prueba de cuadre contra su propio `computar()`. No se instaló ninguno en este cambio; el nombre de cada campo se confirma al leer cada motor.

## Interacción

- **Teléfono:** acordeón. Los cuatro renglones cerrados ya resumen la cadena; se abre uno a la vez («Se vende» de inicio).
- **Pantalla ancha (≥ 760 px):** cuadrícula 2×2 que se lee 1 → 2 → 3 → 4, con la entrada escrita a mano de cada eslabón («por eso…»).
- **Cambio de versión:** corre la cadena, un eslabón tras otro, con la línea punteada de «antes», la frase de qué cambió y los deltas en «Lo que queda». Si la orden salió del propio diagrama, la vista acompaña al eslabón que se cuenta. «Repetir despacio» la vuelve a correr; tocar el diagrama la detiene en la lectura final.
- **Edición de un dato abajo:** el diagrama se repinta al momento y conserva el «antes» de toda la ráfaga. Si no estaba a la vista, cuenta el cambio en cadena cuando vuelve a verse.
- **Movimiento reducido:** sin animación; el «antes» se dibuja fijo.
- **Captura de un plan nuevo o lectura de otro caso:** el diagrama se vacía y se oculta en los mismos modos que el encabezado de resultados.

## Color y tipografía

Los seis tonos conservan el significado que ya tienen en el tablero y usan el paso que pasa separación para daltonismo (ΔE ≥ 10 entre vecinos de cada gráfica) y contraste ≥ 3:1 sobre las superficies clara y oscura:

| Significado | Claro | Oscuro |
| --- | --- | --- |
| Ventas, lo que entra, caja | `#42975e` | `#52a76d` |
| Costos, lo que sale | `#8c352d` | `#b54b41` |
| Crédito, costo del dinero | `#6b61c4` | `#7f76dc` |
| Capital, desarrollador | `#884d01` | `#a05b11` |
| Utilidad | `#a58938` | `#ae9242` |
| Dueño del terreno | `#3275b4` | `#4e90d2` |

«En la entrega» y «Falta» se distinguen por trama, no por otro tono. Las cifras van en tinta del tablero; el color sólo marca. Las notas usan Caveat 700 (SIL OFL 1.1, `fonts/`), servida desde este repo.

## Criterio móvil

Antes: las cinco tarjetas cerradas cabían en ≤ 1.2 pantallas de teléfono (430 × 932). Con el diagrama arriba, por instrucción de Dirección, el criterio queda así en `tests/ppp-browser.cjs` y `tests/ppp-terrain-browser.cjs`: las cinco tarjetas conservan su bloque (< 728 px, el mismo espacio que tenían), el diagrama ocupa menos de 0.9 pantallas y el conjunto cabe en ≤ 2 pantallas.

## Verificación reproducible

- `node --check ppp-cadena.js` y `node --test tests/ppp-cadena.test.cjs`: cuadre contra el motor en 11 variantes y 400 combinaciones al azar de los 81 controles; sin estado no hay diagrama; ninguna red, almacenamiento ni motor en el módulo.
- `YOD_ATLAS_DIR=/ruta/yod-portal node tests/ppp-cadena-browser.cjs`: HTML completo con marco real y transporte sintético, Chromium y WebKit. Montaje arriba de las cinco tarjetas, 81 controles y 40 KPI intactos, misma utilidad que el encabezado, acordeón y cuadrícula, versiones como botones, cadena con «antes», repetir e interrumpir, edición viva, ligas a tarjeta y control sin foco, modelo nativo, 320/390/430/1280 px, tema oscuro, cero escrituras y cero peticiones propias.
- `node --test tests/ppp-ui.test.cjs`: el motor sigue idéntico byte a byte al de referencia.

Las pruebas interceptan toda petición de negocio. No acreditan un teléfono físico, una sesión real ni un caso guardado en producción.

## Reversión

Revertir el PR quita `ppp-cadena.js`, `ppp-cadena.css`, `fonts/`, los ganchos de `mixto.html`, `PPPView.reveal`, la línea de `ppp-intake.js` y devuelve el criterio móvil original de las pruebas. No hay casos, libros, borradores ni sesiones que restaurar.
