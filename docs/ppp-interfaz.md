# PPP vertical: resumen, detalle y ajustes

La interfaz de `mixto.html` conserva los 81 controles y los 40 cuadros KPI originales. No modifica `computar`, las fórmulas del libro, los endpoints, los permisos ni los contratos de versiones y guardado. `ppp-ui.js` mueve los elementos originales, sin duplicar sus IDs, y representa el mismo estado que recibe `render()`.

## Uso

1. Al entrar, se recupera el borrador local. Si no hay borrador y existen casos guardados, se ofrece elegir uno. Los valores iniciales se identifican como supuestos de referencia sin guardar.
2. El resumen muestra cinco tarjetas cerradas. Tocar una despliega su lectura hacia abajo y atenúa las restantes.
3. **Ajustar** abre dentro de esa tarjeta sus controles originales. **Ver detalle** vuelve a los resultados. **Volver al resumen** cierra y recupera la posición inicial. Escape recorre los mismos niveles.
4. Documentos, etapas, mercado, referencias, versiones/comparador, reuniones, seguimiento, WhatsApp, fórmulas, proforma, flujo mensual y JSON conservan sus accesos. Las chinches siguen usando elementos y secciones con identificadores estables.

## Fuente de los gráficos

| Tarjeta | Resumen | Gráfico |
| --- | --- | --- |
| Arquitectura | Unidades, pisos, altura y área vendible | Volumen conceptual: terreno y placa mediante raíz de superficie con la misma referencia fija 0–10,000 m²; altura 0–120 m y líneas por nivel. No es plano ni permiso. |
| Ventas e ingresos | Venta modelada, precio y preventa efectiva | Participación de vivienda, locales y cajones sobre ventas, escala 0–100 %. |
| Costos | Costo económico con intereses y comisión de deuda | Obra, otros costos y financiación sobre el costo total, escala 0–100 %. |
| Macro y crédito | Pico de deuda, límite y holgura | Deuda/límite y aportaciones de dueño/desarrollador respecto al capital total; no implica crédito autorizado. |
| Dotaciones | Agua, demanda eléctrica, habitantes y reserva | Agua 0–500 m³/día, demanda 0–2,000 kVA y permeabilidad 0–100 %. No representa sensores. |

Las escalas son fijas para comparar casos. Si un valor rebasa la escala, el número permanece íntegro y se avisa en el detalle. Un dato ausente se muestra como `—`; no se transforma en cero. Las composiciones usan sumas y razones del estado confirmado, sin crear otro motor financiero. La diferencia entre área vendible y mezcla se informa explícitamente. El cobro de cada socio se distingue de capital y ganancia.

Con modelo nativo, cifras y gráficos permanecen en la última revisión confirmada mientras se envían cantidades. Un conflicto conserva ese resultado y las cantidades pendientes. Al recuperar una copia sin pendientes se relee Sheets; una copia con pendientes no se envía automáticamente. El botón original **Actualizar desde Sheets** conserva la confirmación de descarte correspondiente.

## Interacción y presentación

Cabecera local con el logotipo YoDesarrollo sin MX y sufijo OS; iconos SVG locales para menú, regreso y búsqueda. El selector superior de tipo de potencial se retira únicamente de `mixto.html`. Colores y tipografía del PPP, controles táctiles de al menos 44 px en los nuevos niveles, foco de teclado visible, `aria-expanded`, región cerrada `inert`, estado anunciado y respeto a `prefers-reduced-motion`. Volúmenes SVG/CSS actualizables, sin imágenes que simulen resultados.

## Verificación reproducible

- `node --test tests/access-gates.cjs tests/sheets-offline.cjs tests/ppp-ui.test.cjs`: 23 pruebas; incluye comparación textual del motor con `12213ec05769808f9aa895c47b6258d28bcb2493` y siete variantes sintéticas.
- `node tests/access-browser.cjs`: 20 recorridos, siete plantillas, Chromium y WebKit.
- `YOD_ATLAS_DIR=/ruta/yod-portal node tests/ppp-browser.cjs`: HTML completo con marco real y transporte sintético. 81 controles, 40 cuadros KPI, tres niveles, fórmulas, guardado sin correo, versiones, copia nativa, conflicto y recarga; 320/390/430/1280 px, animación y movimiento reducido.
- `node --check ppp-ui.js` y `git diff --check`.

Las pruebas interceptan todas las peticiones de negocio. No envían correos ni escriben en un libro real. WebKit emulado no acredita un iPhone físico ni un recorrido OAuth real. Los conectores conservan la implementación existente; esta entrega no despliega otro Apps Script ni migra nuevos casos al libro nativo.

## Reversión

Revertir mediante PR los archivos de presentación, los hooks mínimos de `mixto.html` y la referencia de atlas. No borrar borradores, colas, casos, libros ni sesiones. Propuesta `CHG-PPP-UI-001` en el atlas central.

## Cierre de chinches · 1 octubre

Las cinco tarjetas muestran dos barras cuya longitud representa las razones etiquetadas del mismo estado confirmado. Un 85% ocupa 85% de su barra; los ausentes aparecen como — y patrón discontinuo, y los excedentes conservan su cifra. Son referencias de comparación, no niveles de avance ni sensores. Macrolotes usa un índice numerado con nombre completo, Base y Activa explícitas, acciones de edición independientes y explicación de que todas las versiones corresponden al mismo proyecto. Se conservan IDs, entradas, comparador y guardado.

`tests/ppp-cierre-browser.cjs` verifica proporciones, cambios, datos ausentes, ocho alternativas con nombres completos y conservación de IDs en Chromium/WebKit. Todo transporte de negocio se intercepta. No acredita una sesión real ni edición en un libro de producción.
