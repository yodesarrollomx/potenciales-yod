# Pago del terreno en viviendas

El editor agrega acuerdos por versión a un programa vertical nativo. Las cantidades físicas no cambian. Las viviendas reservadas se retiran proporcionalmente de preventa y entrega a terceros; su valor no entra a caja. El precio de adjudicación es el precio base residencial. La selección de unidades concretas y diferencias por tipología queda pendiente del proyecto.

## Cálculo y acuerdos

- Utilidad: saldo del terreno más participación en utilidad positiva, después de costo total, intereses y comisión de deuda. No conserva el preferente del reparto anterior.
- Interés simple: principal no pagado por tasa anual y meses transcurridos, con reducción del principal en entregas iguales. El interés no se capitaliza. Mes 1 es el origen del plazo.
- Ventas: porcentaje del valor de ventas a terceros más adjudicaciones, menos el anticipo. Incluye tierra y rendimiento; puede resultar inferior al valor reconocido del terreno.

El anticipo sustituye al antiguo porcentaje de tierra pagada. La caja final queda para el desarrollador una vez cancelada la deuda; se muestra la recuperación de su capital y la ganancia por separado. Los resultados son antes de impuestos. Los locales retenidos y sus rentas conservan su tratamiento nativo, sin agregarse a las ventas.

`PPPLandInKind.gs` genera exclusivamente texto de fórmulas. Se instalan en una copia nativa; B250:B258 contiene los factores del acuerdo y F250:G270 sus resultados. El flujo de crédito conserva las fórmulas existentes. El balanceador sólo escribe un área de prueba y lee la diferencia calculada por Sheets. No reproduce finanzas en JavaScript.

Los semáforos exigen conciliación de caja y economía, inventario disponible, calendario posterior a obra, acuerdo equilibrado y deuda cancelada durante las entregas. Una modificación del precio o costo requiere recalcular el acuerdo; no se da por equilibrado automáticamente.

## Integración en Portero

Agregar los dos archivos GAS al proyecto existente. Después de la autenticación y de asignar `PPP_VOLUME_REQUEST_K_`:

```js
// doGet
if(p.recurso==='sheet-land')return respuesta_(pppLandRead_(p));
// doPost, antes del caché general y su lock
if(d.tipo==='sheet-land')return respuesta_(pppLandRequest_(d));
```

Se conserva la implementación, URL y permisos actuales. Antes de publicar se compara el editor contra la versión desplegada; los cambios ajenos no se activan. El contexto verifica administrador y acceso al caso. Las entradas no aceptan rangos ni nombres de hojas. Las escrituras usan revisión, identificador de operación y auditoría. Una repetición confirmada devuelve la lectura; una operación pendiente exige revisión, nunca duplica silenciosamente. Una falla posterior a aplicar factores intenta restaurarlos y deja el estado de la operación.

La instalación conserva un respaldo privado de la hoja financiera y renueva sus sellos de fórmulas y etapas. El libro y las versiones previas permanecen disponibles. Los controles legados de porcentaje de aportación, preferente y residual se deshabilitan en una versión con este acuerdo.

## Validación

`node --test tests/ppp-land-in-kind.test.cjs` verifica contratos y balanceador. `node tests/ppp-land-native.cjs`, con `@oai/artifact-tool` disponible, evalúa las fórmulas nativas con datos sintéticos: tres métodos, caja, costo, inventario, anticipo y flujo de interés decreciente. `node tests/ppp-land-browser.cjs` comprueba la interfaz en Chromium y WebKit sin servicios externos. La publicación se confirma adicionalmente leyendo el caso real desde su interfaz.
