# Árbol PPP · datos de presentación y estrellas

Ajuste del 24-nov-2026 dentro de la propuesta `CHG-ARBOL-PPP-20261123`. Estado: **copia de prueba**. El Árbol real (`arbol-ppp/arbol.html`) no carga nada de esto, el libro Maestro no cambió y el servidor no se tocó.

## Para qué

Dirección pidió ver, sobre el mismo Árbol, **cuáles datos alimentan la presentación** del plan: «marcarlos con una estrella para entender que sin esos la presentación está incompleta». Se hizo en el orden que pidió:

1. **Los datos que faltaban** en el Árbol entran con un **supuesto estándar** ya puesto y modificable.
2. **Al revés**: qué calcula ya el Árbol que la presentación todavía no usa.
3. **Las estrellas**, ya sobre el Árbol completo.

Las láminas esquemáticas de la presentación (una por tema, sin caso) no viven en este repositorio.

## Cómo se ve

- Cada dato del Árbol que alimenta la presentación lleva una **estrella** junto a su bolita:
  - **★ llena** — el dato está firme (decidido o confirmado, y todo de lo que depende también).
  - **★ a medias** — hay dato, pero descansa en una referencia o en un supuesto estándar: sirve para armar la lámina y sigue «por confirmar».
  - **☆ vacía** — no hay dato: la lámina que lo usa queda incompleta.
- En la barra del Árbol aparece el botón **Presentación** con el avance (`★ completos/total`). Abre un panel con las láminas en orden; cada lámina lista sus datos y cada renglón lleva al dato en el Árbol. Se puede filtrar por ficha: inversionista o dueño.
- Al abrir un dato con estrella, su tarjeta dice a qué lámina alimenta y si es dato **clave** o de **apoyo**.
- La leyenda explica las tres estrellas.
- **Sin el mapa nada de esto existe**: ni botón, ni estrellas, ni leyenda nueva. El Árbol de siempre se ve y calcula igual (lo comprueban las pruebas de Node y la de navegador).

## Archivos

| Ruta | Qué es |
| --- | --- |
| `arbol-ppp/motor.js` | Motor `motor-real-1.5.0`: función `potencia(base, exponente)`, tabla opcional `ARBOL_PRESENTACION`, estrellas y resumen de la presentación (`resultado.presentacion`, `Motor.presentacion(definicion, plan)`). Sin la tabla, el resultado y la huella de la definición son idénticos a los de antes. |
| `arbol-ppp/pantalla.js`, `pantalla.css` | Estrella en el lienzo, botón y panel «Presentación», nota en la tarjeta del dato y leyenda. Todo condicionado a que el resultado traiga `presentacion`. |
| `arbol-ppp/definicion/presentacion_nodos.csv` | Los 57 datos nuevos (módulo `comun/presentacion`). |
| `arbol-ppp/definicion/presentacion_factores.csv` | Su renglón de factor: todos `sin_equivalente`, con la nota de no darlos de alta en el Maestro sin visto bueno de Dirección. |
| `arbol-ppp/definicion/presentacion_reglas.csv` | Cuatro avisos (ninguno bloquea ni sugiere cambios). |
| `arbol-ppp/definicion/presentacion_mapa.csv` | El mapa: qué dato del Árbol alimenta qué dato de la presentación, en qué lámina y con qué papel. |
| `arbol-ppp/construir-presentacion.cjs` | Arma `definicion-presentacion.js` (`window.ARBOL_PRESENTACION_EXT`) a partir de los cuatro CSV. El archivo generado no se edita a mano. |
| `arbol-ppp/presentacion-prueba.html`, `.css`, `.js` | Página de prueba **sin red** (política `default-src 'none'`). Sólo se monta en el equipo local (`file://` o `localhost`). Trae el botón «Llenar con el supuesto estándar». |
| `tests/arbol-presentacion-browser.cjs` | Recorridos en navegador a 320, 430 y 1280 px. |

## La tabla `ARBOL_PRESENTACION`

Columnas: `dato`, `ficha`, `tema`, `lamina`, `nodo`, `papel`, `nota`. Obligatorias: todas menos `lamina` y `nota`.

- `dato` — clave del dato de presentación: `I1`…`I10` (ficha del inversionista) y `P1`…`P9` (ficha del dueño).
- `ficha` — `inversionista` o `dueno`.
- `tema` — el tema de la lámina, en palabras.
- `lamina` — número de lámina (entero, 1 o más).
- `nodo` — un dato del Árbol (debe existir y ser nodo, no sólo factor).
- `papel` — `clave` (sin él el dato de presentación no se puede decir) o `apoyo` (lo enriquece, no lo frena).
- `nota` — qué aporta ese dato a la lámina.

El motor rechaza la definición si: la clave del dato no tiene forma de dato, la ficha o el papel no existen, la lámina no es un entero, el nodo no existe, un nodo se repite dentro del mismo dato, un mismo dato aparece con ficha, tema o lámina distintos, o un dato no tiene ningún nodo clave.

## Reglas de la estrella

- **Vacía** si el nodo no está a la vista o no tiene valor.
- **Llena** sólo si el dato es firme *y todo de lo que depende también*. Un número escrito pero sin confirmar **no** es firme, y un resultado calculado sobre un supuesto hereda el supuesto. Es más estricta que el «por confirmar» del plan, a propósito: una lámina no debe presumir como firme lo que cuelga de una referencia.
- **A medias** en cualquier otro caso con valor.
- **Dato de presentación completo** = todos sus nodos `clave` tienen valor. Un `apoyo` sin valor no lo frena. `con_supuesto` avisa cuando algún nodo clave está a medias.
- Los datos internos (ocultos en el lienzo) también cuentan; en el panel salen sin botón, porque no hay bolita a la cual ir.

## Paso 1 · Los datos nuevos y su supuesto estándar

57 datos. Los que son resultado se calculan solos; los que son supuesto traen la referencia de la tabla y se cambian como cualquier otro dato del Árbol (quedan «por confirmar» hasta que alguien los decide).

| Serie | Tarjeta | Qué agrega | Supuesto estándar y de dónde sale |
| --- | --- | --- | --- |
| `MU` · mezcla de usos | Producto | Parte y precio por uso (vivienda, comercio, oficinas, otro), ventas por uso y precio promedio por m² vendido. | Todo lo que se vende es del uso del producto del plan; el precio de cada uso arranca en el precio promedio del plan. Dos avisos: la mezcla debe sumar 100 % y las ventas por uso deben cuadrar con las ventas del plan. |
| `ES` · estacionamiento | Terreno | Sótano en m², cajones del predio, cajones afuera y cajones totales. | Cero cajones fuera del predio. Si los hay, se anota cuántos; su costo se suma en urbanización y obras exteriores. |
| `MT` · meta de margen | Costo y ganancia | Margen del negocio antes de pagarle al capital, sobre ventas, y su holgura contra la meta. | Meta de Dirección: 15 % de las ventas. Un aviso cuando el margen queda debajo de la meta. |
| `RI` · rentabilidad | Dinero | Múltiplo del capital, rendimiento anual efectivo, mes de recuperación y valor presente del proyecto sin deuda. | Tasa de descuento = la tasa que el plan ya le reconoce al capital. |
| `CR` · fechas del banco | Tiempo | Mes del primer giro y mes en que el banco queda liquidado (sólo con crédito). | Sin supuestos: salen del flujo. |
| `VD` · aportar o vender | Reparto | Lo que vale hoy vender el terreno directo, lo que vale hoy aportarlo, la razón entre los dos y lo que le rinde al dueño por año. | Valor de venta directa = valor de la tierra del plan; gastos de vender = comisión de venta del plan; mes en que cobra = último cobro del plan (hito teórico, no fecha de pago); **meses para vender: 12, PROVISIONAL** (supuesto del analista; lo confirma un corredor de la zona). Un aviso cuando, a valor de hoy, vender deja más que aportar. |
| `FI` · impuestos | Costo y ganancia | ISR estimado, ganancia después de ISR, IVA de las ventas y ventas con IVA. | El vehículo paga ISR a 30 % (Ley del ISR, art. 9, personas morales); IVA de 16 % (Ley del IVA, art. 1); la vivienda y el suelo no causan IVA (Ley del IVA, art. 9), los demás usos sí; parte gravada = todo el precio menos el peso de la tierra en las ventas. Es una estimación gruesa: el cálculo fino es del fiscalista. |
| `DG` · derechos y garantías | Riesgo y estado | Si va en fideicomiso, si la tierra queda en garantía del banco, si hay reversión, y la pérdida máxima del dueño y del inversionista. | Fideicomiso: sí (estándar de la alianza); garantía: sí cuando hay crédito del banco; **reversión: no** mientras no haya contrato que la pacte. |

Notas de cálculo:

- El margen del negocio usa el flujo con banco y capital del propio Árbol. El Árbol financia más sencillo que la hoja del supuesto rentable, así que el margen puede salir distinto: para decidir manda la hoja.
- `potencia(base, exponente)` existe porque la gramática sólo aceptaba `^` con exponente entero escrito; traer a valor de hoy necesita exponentes fraccionarios. Devuelve vacío si la cuenta no da un número.
- Nada de lo anterior entra a las siete tarjetas, a las nueve pruebas de riesgo ni al reparto: son datos nuevos que cuelgan del Árbol, no cambian los que ya había.

## El mapa: de los datos a las láminas

17 datos de presentación, 100 renglones (39 clave y 61 de apoyo) y 90 datos del Árbol con estrella. La lámina 1 es la portada y la 13 el cierre; no llevan datos.

| Lámina | Tema | Datos | Ficha |
| --- | --- | --- | --- |
| 2 | El terreno y lo que permite | P1 | dueño |
| 3 | El programa: qué se construye | I1 | inversionista |
| 4 | Qué se vende y a cuánto | I2 | inversionista |
| 5 | Cuándo: el calendario | I6 | inversionista |
| 6 | Cuánto cuesta | I4 | inversionista |
| 7 | De dónde sale el dinero · lo que condiciona el cobro | I5, P6 | las dos |
| 8 | Cuánto deja | I8 | inversionista |
| 9 | Cómo se reparte · qué recibe el dueño | I7, P3 | las dos |
| 10 | El dueño: lo que vale su tierra, cuándo cobra, aportar o vender | P2, P4, P5 | dueño |
| 11 | Qué puede salir mal · alternativas | I9, P9 | las dos |
| 12 | Derechos y garantías | I10, P8 | las dos |

`I3` y `P7` (renta) no aplican a un plan de venta y no están en el mapa.

## Paso 2 · Lo que el Árbol ya calcula y la presentación no usa

De los 187 datos del Árbol con esta extensión (sin el módulo de repartos), 90 están en el mapa y 97 no. De esos 97, doce candidatos claros ya se subieron como apoyo en este mismo ajuste (tipo de edificio, cajones que pide la norma, el producto y su ticket por unidad, duración de obra, peso de la tierra en las ventas, costo del dinero, utilidad antes de financiar, holgura contra la meta, parte de la alianza, tasa del capital y tierra más capital entre costo). Lo que sigue fuera, agrupado por lo que podría contar:

| Lo que ya existe en el Árbol | Dónde serviría | Por qué no se subió solo |
| --- | --- | --- |
| Las cinco pruebas del banco una por una (línea entre ventas, línea entre costo con terreno, meses de crédito, preventa antes del primer giro, cobertura) y sus umbrales | Lámina 11: hoy sólo dice cuántas pruebas pasan y el resultado | Decisión de Dirección: cuánta cocina del banco enseñar a un inversionista. |
| El reparto «antes del dinero»: lo que recibe el dueño, veces su tierra, lo que reciben la alianza y el capital y la utilidad a repartir; además, la parte del capital y los honorarios de la alianza | Lámina 9 | La lámina usa las cifras «después del dinero» (ya pagados banco y capital). Enseñar las dos juntas confunde; si se quiere el antes y después, es una decisión de Dirección. |
| Condiciones del banco: TIIE, sobretasa, tasa, comisión de apertura y los tres topes | Lámina 7 | Son supuestos de captura; sirven como letra chica. |
| Supuestos de costo: obra por m², urbanización, indirectos, imprevistos, comisión de venta y gastos de cierre | Lámina 6, como respaldo | Lo mismo: letra chica. |
| Calendario fino: meses de predesarrollo, arranque, preventa mínima para arrancar, cobrado durante la obra | Lámina 5 | Candidatos buenos para una línea de tiempo; falta decidir el dibujo. |
| Estacionamiento fino: cajones por vivienda y de visita, desplante, planta baja cerrada | Lámina 3 | Detalle de arquitectura. |
| ISR estimado e IVA de las ventas | Lámina 8 | Ya entran por «ganancia tras ISR» y «ventas con IVA»; el desglose es opcional. |

Además, el motor calcula cosas que **no tienen dato en el Árbol** y por eso no pueden llevar estrella todavía:

- **Las series mes a mes** del flujo con banco y capital (27 series: ventas, obra, giros, pagos, saldos…). Es la gráfica natural de las láminas 5 y 7.
- **El saldo máximo del respaldo** y **los pagos durante la obra**.
- **El comparador** de dos opciones del propio Árbol: es la materia de «alternativas y sensibilidad» (P9), que hoy sólo se apoya en el resultado de las pruebas.

Ya se expusieron como datos, en este ajuste, las medidas que el motor calculaba sin enseñarlas: valor presente, mes de recuperación, primer giro, banco liquidado, sótano, múltiplo y rendimiento efectivo.

## Efecto conocido

Con la extensión cargada, **«por confirmar» sube**: los supuestos estándar nuevos cuentan como referencias sin confirmar (18 en el caso de muestra, que es inventado). Por eso cambian tres cosas del paquete del visor —los candados abiertos, el origen y la huella— y sólo esas; una prueba lo afirma exactamente. Sin la extensión, nada cambia.

## Verificación

```
node arbol-ppp/construir-presentacion.cjs
node --check arbol-ppp/definicion-presentacion.js
node --check arbol-ppp/presentacion-prueba.js
node arbol-ppp/pruebas/motor-real.cjs
BROWSER_EXECUTABLE=/ruta/a/chrome node tests/arbol-presentacion-browser.cjs
```

- `motor-real.cjs`: 569 pruebas. El grupo 31 (16 pruebas) cubre: `potencia`; sin mapa nada cambia; los CSV y el archivo generado dicen lo mismo; carga con y sin repartos; cada rechazo del validador del mapa; JSON y edición de la definición; cada dato nuevo contra una cuenta hecha a mano; el valor presente a tasa cero y a la tasa interna; mezcla de usos y sus avisos; un plan de comercio; una pérdida (ISR en cero); la meta de margen; aportar contra vender; estrellas y firmeza; completo contra apoyo; la página sin red y sólo local; el supuesto estándar; y la pantalla condicionada.
- Navegador: 16 recorridos a 320, 430 y 1280 px, más la página de repartos sin el mapa (ni botón ni estrellas).
- **Contraprueba por mutación:** 30 cambios deliberados que deshacen una pieza cada uno. 29 ponen la suite en rojo. El que sobrevive («no mira si el dato está a la vista») es equivalente: un dato que no está a la vista nunca tiene valor, así que la condición es redundante por construcción y se conserva como defensa.
- No demostrado: iPhone físico, lector de pantalla, otros navegadores, ni un plan real cargado desde el libro.

## Para encenderlo en el Árbol real

Nada de esto está hecho. En orden:

1. **Visto bueno de Dirección** a los supuestos estándar (sobre todo la meta de margen, los 12 meses para vender, fideicomiso y reversión) y a qué datos son clave.
2. **Dar de alta los factores nuevos en el libro Maestro** y cambiar su correspondencia (hoy `sin_equivalente`): sin eso un plan guardado en el libro pierde esos datos al abrirlo.
3. **Agregar la pestaña del mapa a la definición publicada** que sirve el servidor del PPP 2 (va como versión nueva de la misma implementación).
4. **Cargar la extensión en `arbol.html`** y revisar el acomodo con `mejoras.js` (la capa visual del Árbol real no se probó con el botón nuevo).
5. Probar en un teléfono real.

## Lo que falta

- Preferente simple y clases de capital, renta (`I3`, `P7`) y más de un caso.
- Las series mes a mes como dato con estrella (hoy no tienen nodo).
- Que el visor y las presentaciones lean el resumen de la presentación del plan.
- Registrar el ajuste en el atlas con revisión propia (hoy va dentro de `CHG-ARBOL-PPP-20261123`).

## Reversión

Revertir el commit. Sin la tabla `ARBOL_PRESENTACION` el motor y la pantalla se comportan como antes; no hay libro, hoja ni servidor que restaurar.
