# El visor en vivo con los casos del PPP de siempre (PPP 1)

Decisiones de Dirección del 15-nov-2026. Estado: contrato, núcleo, módulos por motor (vertical, macrolotes, residencial, unifamiliar) y servidor listos en el repo. Faltan publicar el servidor, cargar `PPP_VISOR` y dar las ligas.

El visor (`visor.html`) nació para los planes con libro del PPP 2. Ahora también enseña los casos del PPP 1. Lo hace con **fotos**: un registro fechado de lo que el motor real de cada tablero calcula para cada versión de un caso. El servidor sirve esas fotos tal cual y no calcula nada.

## Decisiones (no se reabren)

1. **Una foto por versión y Dirección escoge la buena.** Se fotografían **todas** las versiones de cada caso: los escenarios de `escenarios_json`, o las pestañas de versión de un libro nativo. Cada foto es un renglón de `PPP_VISOR`. Una sola versión por caso lleva `elegida` = `sí`, y es la que el visor rotula como **vigente**. Por omisión es la **última** (la de mayor `orden`): «la última es la que rige». Dirección cambia la elegida desde el propio visor cuantas veces quiera. El servidor sólo mueve ese puntero (`elegida`, `elegida_por`, `elegida_fecha`) y todos los visores lo siguen en unos 3 segundos, porque las fotos ya están calculadas. Ninguna foto se rotula «vigente» por sí misma: lo decide `elegida` al servir.
2. **La foto es una excepción explícita al contrato del 30-sep.** Desde el 15-nov-2026 la excepción incluye el paso «completa» (abajo): fórmulas deducidas de las cifras del motor, fuera de Sheets, sólo para el visor. El contrato (ARQUITECTURA-SHEETS.md) prohíbe pegar resultados calculados como constantes. Sólo para el visor se acepta este registro fechado de lo que calcula el motor, con su procedencia: `motor_commit`, `huella_entradas`, `calculado`, `origen` (`lote` | `libro` | `guardar`) y `conciliacion`. Los motores siguen calculando como siempre y nadie lee una foto como dato de entrada.
3. **Conciliación con tolerancia de 0.5 %.** Sólo la versión **activa** del renglón tiene contra qué compararse: las columnas `ventas`, `costo_proyecto` y `utilidad` del renglón, y la pestaña `FLUJO` cuando `flujo_version` = `version` del caso. Si algo se sale, la foto queda `propuesta` y el servidor no la sirve. Las demás versiones quedan `lista`, con la conciliación anotada como «sin referencia», si el motor las calcula sin error.
4. **Hoja de fotos:** pestaña nueva `PPP_VISOR` en el Sheet «YOD - POTENCIALES». El servidor recibe el id de ese Sheet en el renglón `potenciales_id` de `Config` del vivero, nunca desde el repo.
5. **Ligas:** `plan_id` = `ppp:<caso_id>[:<escenario_id>]` en la hoja `Ligas` del vivero.
6. **Para después:** el patrimonial (renta anual, necesita la variante «renta» del visor) y la foto al guardar (`origen` = `guardar`, toca los motores y `Code.gs`).
7. **La salida tiene exactamente la forma de `leeVisor_`** (esquema `ppp2-visor-v1`) más el campo opcional `origen`, que es el texto de las leyendas. Lo que el motor no produce va vacío (`null` o lista vacía), **nunca en cero**.

## La hoja `PPP_VISOR`

Un renglón por (caso, versión). Columnas, en este orden (`COLUMNAS` del núcleo):

| Columna | Qué lleva |
|---|---|
| `caso_id` | El del renglón del caso. Debe cumplir `[A-Za-z0-9_-]{3,64}`. |
| `tipo` | VERTICAL, MACROLOTES, RESIDENCIAL o UNIFAMILIAR. Después, PATRIMONIAL. |
| `escenario_id` | El id de la versión. Si la versión no tiene id, `v<orden>`. Vacío sólo cuando el caso no tiene escenarios (sus columnas `in*`). |
| `escenario_nombre` | El nombre de la versión (máx. 40 caracteres). |
| `orden` | La posición de la versión en el caso, empezando en 1. La última es la de mayor orden. |
| `estado` | `lista` (se puede servir) o `propuesta` (no se sirve: la versión activa no concilió). |
| `elegida` | `sí` en un solo renglón por caso. Lo demás, vacío. |
| `elegida_por`, `elegida_fecha` | Quién y cuándo, sólo si la eligió una persona. La elección por omisión las deja vacías. |
| `motor_commit` | Commit del HTML del motor (12 caracteres), más `+local` si había cambios sin commit. |
| `huella_entradas` | `e1-` y 32 hexadecimales: la huella de las entradas con que se corrió el motor. |
| `calculado` | `AAAA-MM-DD HH:mm`, hora de Hermosillo (la misma forma que `ahora_()` del servidor). |
| `origen` | `lote` (el motor corrido en lote), `libro` (copia de un libro nativo) o `guardar` (después). |
| `conciliacion` | JSON: `{ok, nota?, tolerancia, resumen:{campos…}, flujo:{campos…}}`. `ok` es true, false o null; con null, `nota` = «sin referencia». |
| `visor_json` | La forma `ppp2-visor-v1` más `origen`. Máximo 50 000 caracteres. |

**Lo escribe un solo agente (P5) y sólo con el visto bueno de Dirección.** Nunca se borra un renglón: una foto nueva de la misma versión va abajo y el servidor toma la más reciente. Si la más reciente quedó `propuesta`, esa versión deja de servirse (aunque haya una `lista` anterior); si era la elegida, el caso no se sirve por `ppp:<caso_id>` hasta que Dirección elija otra. `calculado` se escribe como texto. Si Sheets lo convierte en fecha, el servidor lo devuelve a la misma forma.

**Al volver a fotografiar un caso,** quien escribe conserva la elección de Dirección: si una versión del caso trae `elegida_por`, la foto nueva de esa versión lleva `elegida` = `sí` y las demás van sin marcar. Si no, la marca por omisión del lote nuevo (la última) queda más abajo y es la que manda.

## Cómo se toma una foto

1. **Corte del motor.** El núcleo corta del HTML el bloque que contiene `computar()` (de `desde` a `hasta`, tabla `MOTORES`) y lo corre en `node:vm`, sin DOM ni red. El precedente es `tests/ppp-fixture.js`. Cuidado con las firmas: el residencial es `computar(vals, viv)` y el patrimonial `computar(vals, esc)`.
2. **Entradas como las vería el navegador.**
   - Se parte de los deslizantes del HTML con `PRELLENADO` encima, evaluando el `DEFAULTS` real del motor.
   - Encima van las columnas `in*` del renglón, como las aplica `aplicarCasoRemoto`: se saltan las vacías.
   - Después, las entradas de la versión, como `escAplicar`. Aquí `Number('')` sí vale 0, y cada motor tiene sus reinicios previos.
   - Cada valor se **sanea como en un deslizante**: dentro de min y max, y redondeado al paso más cercano (con empate, hacia arriba). Así lo hace Chromium; se comprobó con 198 casos.
   - En el vertical se corre su `clampRelations` tal cual, con deslizantes simulados.
3. **Traducción** a la forma del visor. Las cifras de dinero pasan de pesos a **MDP**; los porcentajes, a fracción. Se cambian nombres y no se calcula.
4. **Conciliación** de la versión activa, cálculo de la huella y armado del renglón. Al final, la última versión `lista` de cada caso queda elegida.

Los valores de un borrador en `localStorage` de quien abrió el caso no entran: la foto parte siempre de los valores por defecto del HTML.

## Qué cuadro alimenta cada campo de `visor_json`

| Campo | Cuadro del visor | Unidad |
|---|---|---|
| `plan.nombre`, `plan.ubicacion`, `plan.tipo` | encabezado | texto |
| `plan.edad`, `plan.candados_abiertos`, `plan.paso_texto`, `plan.esquema` | 7 · riesgo y estado | en el PPP 1, `null`: no existen |
| `plan.vigente` | encabezado | siempre `null` en la foto: lo decide `elegida` |
| `plan.mostrada`, `version` | encabezado | = `orden` |
| `versiones` | botones de versión | todas las del caso: `{n: orden, nombre, estado: null}`. Al servir, el servidor deja sólo la versión servida; la lista completa la ve quien aprueba en `elige.versiones` |
| `v.*` (claves de `Versiones` del libro, `CLAVES_V`) | 1 terreno, 3 tiempo, 4 costo y ganancia, 6 reparto, 7 | dinero en MDP, razones como fracción, meses enteros (`UNIDAD_V`) |
| `v.estado` | encabezado | `null` en la foto; al servir la elegida, el servidor pone `vigente` (y `plan.vigente` = su número; en `origen`, «versión vigente») |
| `v.rv_*`, `v.ck_*` | 7 · revisión para fondos | `null`: el PPP 1 no tiene revisión para fondos |
| `datos` (12 claves de `Datos`) | 1 terreno, 4, 5 | m², MDP o fracción (`DATOS`) |
| `productos` (hasta 6) | 2 · producto | unidades, m², $/m²; ventas y precio por unidad en MDP |
| `flujo.meses`, `flujo.filas`, `flujo.total` | 3 tiempo, 5 dinero | MDP por mes, salvo `firmas` en unidades. Totales con la regla del libro: SUM, MAX o ULT (`FILAS_FLUJO`). Sin flujo: `meses` = `null`. |
| `reparto` | 6 · reparto | `null` si el motor no tiene el equivalente |
| `candados`, `pruebas` | 7 | listas vacías |
| `pruebas_viejas`, `ultimo` | 7 | `null` |
| `cambio` | pie | = `calculado` |
| `origen` | leyendas «de dónde sale» | `PPP · <tipo> · versión «<nombre>» · foto del <d-mmm-aaaa>`. Lleva además «· copia del libro» si `origen` = `libro` y «· sin conciliar» si la foto quedó `propuesta`. Nunca dice «vigente». |

`propuesta_por` y `aprobada_por` nunca entran (son nombres de personas).

## Ensayo sin red

```
node scripts/visor-fotos/nucleo.cjs ensayo <renglones.json> <fotos.json> [--fecha "AAAA-MM-DD HH:mm"]
```

La entrada es `{casos:[{tipo, renglon, flujo?, flujo_version?, libro?}]}`. La salida trae las fotos, los errores (por caso y por versión) y un resumen. El ensayo se niega a escribir dentro del repositorio: los datos reales no van a Git.

Pruebas: `node --test tests/visor-fotos-nucleo.test.cjs`. Usan sólo datos inventados y los cinco HTML públicos, y comprueban que la forma coincide con `server/ppp2/Visor.gs` y con `ppp2/libro/generar.py`.

El servidor no confía en la forma: toma del `visor_json` sólo las claves de `ppp2-visor-v1` (más `origen`), cada una con su tipo (`fotoLimpia_` de `Visor.gs`). Lo que la foto traiga de más no sale.

## El paso «completa»: que nada quede vacío (15-nov-2026)

Dirección: «nunca dejemos vacío nada» y que cada plan «cuadre y sea negocio justo para todos». `scripts/visor-fotos/completa.cjs` se aplica **después** del módulo de cada motor y del núcleo, sobre el renglón ya armado, y llena lo que quedó en `null` en dos niveles:

1. **Mapea** lo que sí existe y no se había llevado: salidas de `computar()` (o del libro nativo) y del renglón (`huella_entradas` → `v.huella`, `cashReconciliation` → `v.ck_flujo`, la comisión de disposición → `apertura`…).
2. **Deduce** lo que el PPP de siempre no calcula pero sale de cifras que ya da el motor, con la misma definición del libro del PPP 2 (`ppp2/libro/generar.py`). Cada valor deducido lleva su marca en `visor_json.deducido` (`ruta → «de qué sale y cómo»`), para que la leyenda del visor diga «deducido de …».

Corre sin red y no escribe dentro del repo:

```
node scripts/visor-fotos/completa.cjs ensayo <entrada.json> <salida.json> [--fecha "AAAA-MM-DD HH:mm"]
```

La entrada es la del núcleo más, por caso, opciones que pone quien la arma (datos privados, fuera del repo): `fuera` (no se procesa), `no_servir: [orden…]` (esas fotos quedan `propuesta`), `renombra: {orden: nombre}` (un nombre de versión que nombra a una persona pasa a uno neutro, sin perder qué la distingue), `nombre_neutro` (lo mismo para el nombre del caso, sólo en el visor) y `reestructura` (abajo). Cada renglón de salida trae aparte `aseo` (no es columna): huecos antes y después, lo que no aplica, lo mapeado, lo corregido, lo que no se pudo llenar y los criterios de Dirección. **`elegida` no se decide aquí:** se deja la del núcleo y quien escribe la hoja conserva la que ya tenga; una propuesta de reestructura nunca queda elegida.

### Lo que se deduce

En pesos del motor; el visor recibe MDP, fracciones y meses (base 1), como siempre. «Costo con tierra» = costo del proyecto sin financiamiento + tierra que aporta el dueño a su valor. «Línea» = tope de deuda del motor (`debtCap`); si es 0, la prueba dice «sin banco».

| Ruta | Fórmula |
|---|---|
| `v.rv_linea_ventas`, `v.rv_linea_costo` | línea ÷ ventas; línea ÷ costo con tierra |
| `v.rv_aportacion` | (tierra que aporta el dueño + capital usado) ÷ costo con tierra |
| `v.rv_margen` | (ventas − costo con tierra) ÷ costo con tierra |
| `v.rv_preventa` | vertical: `preventaAtBuild` del motor; los demás: unidades firmadas antes del mes de arranque de obra ÷ unidades |
| `v.rv_preventa_banco` | unidades firmadas antes del primer desembolso ÷ unidades; «sin disposición» si hay línea y no se usa |
| `v.rv_cobertura` | mínimo, en los meses con saldo del banco, de (valor firmado − cobrado) ÷ saldo; «sin saldo del banco» si nunca lo hay |
| `v.rv_meses_credito` | mes en que se liquida el banco − mes de arranque de obra |
| `v.rv_falta` | **suma** de lo que faltó cada mes y nadie cubrió (como «Respaldo: lo que faltaría» del libro), aunque después se pague |
| `v.rv_resultado` | las nueve pruebas con los límites de `revision_formula` (mismos que `PRUEBAS` de `visor.js`; lo vigila la prueba). Un texto en una prueba con ISNUMBER no falla; un `null` cuenta como «sin dato» |
| `v.ck_cobranza`, `v.ck_unidades` | cobranza total − ventas; unidades firmadas − unidades de los productos |
| `v.capital_sobre_tope` | capital − 1/3 de las ventas, si se pasa (regla de Dirección; sólo avisa) |
| `v.resultado_repartir` | caja al cierre − capital aportado − deuda − respaldo pendiente (= último `flujo_acum`) |
| `v.max_ajeno` | máximo mensual de saldo del banco + capital aportado + respaldo pendiente |
| `v.banco_mes`, `v.respaldo_mes` | último mes con saldo, más uno (regla LIQ del libro); en blanco si nunca hubo saldo |
| `v.capital_mes`, `v.dueno_meses`, `v.dueno_anos` | el capital y el dueño que aporta cobran al cierre (mes de reparto); la tierra pagada en efectivo, en el mes 1; años = mes de reparto ÷ 12 |
| `v.dueno_aporta`, `v.dueno_recibe`, `v.dueno_veces` | tierra que aporta a su valor; lo que recibe; recibe ÷ valor de la tierra |
| `v.alianza_recibe` | lo que recibe la alianza **encima** de su capital |
| `v.inversion_recibe`, `v.rend_capital`, `reparto.tasa_capital` | 0 cuando el motor no paga rendimiento al capital antes de repartir (el capital es de la alianza; en el vertical su preferente va dentro de la cascada); en la casa, el rendimiento pagado al inversionista |
| `v.pagos_obra` | vertical: preventa × % que se paga durante la obra |
| `v.mes_saldos` | primer mes en que entra un pago que no es enganche |
| `datos.tierra.valor`, `datos.lamina.m2_construidos`, `datos.din.*`, `datos.cob.enganche`, `datos.costo.comision` | del motor cuando hay un solo valor que corresponda |
| `reparto.*` | esquema, si se paga la tierra, parte del dueño, la de la alianza (lo que queda), capital 0, honorarios; `numero` sólo si coincide con uno de los cinco esquemas del libro |
| `flujo.firmas` | calendario de ventas del motor (vertical: preventa pareja en sus meses y lo demás al entregar; macrolotes y residencial: `abs` unidades al mes desde el inicio de ventas; casa: una unidad en el mes de la venta). Se comprueba contra los cobros del motor; si no cuadra (un libro que escalona por edificio), no se entrega |
| `flujo.enganches`, `flujo.saldos`, `flujo.pagos_obra` | vertical: los tres términos con que el motor arma sus cobros (se comprueba que sumen la cobranza mes a mes) |
| `flujo.disposicion`, `flujo.pago_banco` | Δdeuda = interés capitalizado + desembolso + comisión − pago (identidad del motor). La disposición es lo que crece la deuda en el mes; así lo que entra y sale del banco cuadra con la caja |
| `flujo.respaldo`, `flujo.pago_respaldo`, `flujo.saldo_respaldo` | Δcaja − Δdeuda − (cobranza − costo − interés − comisión + capital): cuando falta es respaldo, cuando sobra se cura |
| `flujo.cap_acum`, `flujo.saldo_capital`, `flujo.flujo_acum`, `flujo.ajeno`, `flujo.apertura` | acumulados y la comisión del motor mes a mes |
| `flujo.total.obra … cierre` | el desglose de costos del motor en totales (sin serie mensual), para que el cuadro 4 sume las ventas |
| `productos.*.ventas`, `precio_unidad`, `precio_m2` | vertical: ventas de vivienda × m² de la tipología ÷ m² de vivienda (el motor cobra el mismo $/m² a todas); promedio = ventas ÷ unidades o ÷ m² |
| `v.que_cambia` | las entradas que cambian contra la versión anterior, con el nombre de su deslizante |

Antes de entregar, cada serie deducida se compara con los totales del propio motor (desembolsos = `debtDraws`, respaldo pendiente = `fundingGap`); si no cuadran, no se entregan.

### Lo que se corrige para que cuadre

Pocas cosas, anotadas en `deducido` como «corregido: …» y listadas en `aseo.corregidos`: `v.resultado_repartir` (no lleva el capital adentro ni resta ya la tierra), `v.banco_mes` (es el mes en que se liquida, no el del saldo máximo), `v.alianza_recibe` en macrolotes y residencial (sin su capital, que el visor ya pinta aparte), `v.respaldo` (el máximo pendiente, no sólo el del cierre), `v.rv_falta` (la suma) y `flujo.disposicion` del libro vertical (con la comisión y el interés capitalizado). Lo demás que ya traía la foto queda igual.

### Lo que no se llena sin un supuesto

Queda en `aseo.sin_llenar`, con el supuesto que haría falta: `v.fecha_aprobacion` (el PPP de siempre no aprueba versiones), `datos.din.tiie` y `din.sobretasa` (el motor sólo trae una tasa total), `datos.din.caja_pct` (el motor barre la caja a cero cada mes), `datos.din.preventa_minima` (fuera del vertical), un enganche único cuando cada producto cobra distinto, la comisión pura cuando el motor la junta con administración, `plan.edad`, `plan.candados_abiertos` y `plan.paso_texto` (sólo existen en el libro del PPP 2), `plan.ubicacion` si el renglón no la trae, y el calendario de firmas de un libro que escalona por edificio. Lo que el libro también deja en blanco (sin banco, sin respaldo) va en `aseo.no_aplica` y no cuenta como hueco.

**Caja mínima:** los cinco motores del PPP de siempre usan cada peso en cuanto entra; por eso la regla de Dirección «la caja nunca baja de 5 % del costo de obra» no se puede cumplir moviendo entradas: hace falta una entrada nueva de caja mínima en el motor.

### Criterios y propuesta de reestructura

`aseo.criterios` revisa cada versión con lo que fijó Dirección: utilidad real (lo que se reparte menos la tierra a su valor) positiva, el dueño recibe al menos el valor de su tierra (veces ≥ 1), el reparto suma, la caja no se hunde (nada faltó ningún mes), capital ≤ 1/3 de las ventas (sólo aviso) y margen.

Si una versión no cumple, `caso.reestructura = {base, cambios, porque, nombre?}` arma una **versión nueva** del caso con las entradas de su base más `cambios` (sólo ritmo de ventas, arranque, capital, mezcla, precio dentro de lo que el caso ya usa, y el reparto de Dirección: «50/50 con tierra pagada») y la corre con el **mismo motor**. Su `escenario_id` es `reestructura`, su nombre empieza con «Propuesta de reestructura», queda `lista` (Dirección la puede ver y elegir) y **nunca queda elegida por omisión**; `v.que_cambia` es la línea de `porque`. Con `cambios` vacíos da exactamente lo mismo que su base (lo vigila la prueba). Una versión de libro nativo no se reestructura aquí: el libro es su modelo.

**Ojo para quien escriba la hoja:** si un caso no tuviera ninguna versión elegida, el servidor sirve la de mayor `orden`, y ésa sería la reestructura. Siempre se escribe la elegida.

### La marca `deducido` en el servidor

`fotoLimpia_` (`server/ppp2/Visor.gs`) deja pasar `deducido` sólo con rutas bien formadas (`v.x`, `flujo.total.x`, `productos.0.x`…) y texto de hasta 240 caracteres (`deducidoLimpio_`); sin marcas, `null`. Va con la misma «Nueva versión» del servidor. Que la leyenda de cada cifra diga «deducido de …» es trabajo de `visor.js` (P4a).

Pruebas: `node --test tests/visor-fotos-completa.test.cjs` (datos inventados) y la de `deducido` en `tests/ppp2-visor.test.cjs`.

## Dudas que quedan escritas (para Dirección o el integrador)

- **Versión activa sin resumen guardado** (columnas vacías): no hay con qué conciliarla. Por la regla de «sin referencia» queda `lista`, igual que las otras versiones, así que se serviría sin comparar. ¿Se acepta, o la activa sin resumen debe quedar `propuesta`?
- **Si la última versión queda `propuesta`,** el núcleo elige la última `lista`. ¿O el caso debe quedarse sin elegida hasta que Dirección decida?
- **Huella y FLUJO:** la conciliación contra FLUJO usa un piso de un peso por mes, porque cada mes se guardó redondeado.
- **Libro nativo y renglón con versiones distintas** (inventario, hallazgo 4): el módulo vertical decide qué lista de versiones manda (`versiones(caso)`). Con esto Dirección puede elegir cualquiera, pero sólo la activa del renglón se concilia.
- **Meses:** el visor del PPP 2 corta en 60. El núcleo no recorta el horizonte del PPP 1. Si un caso pasa de 60 meses, que lo revise quien rediseña `visor.js`.
- **Macrolotes:** `aplicarCatalogo` puede cambiar `PRELLENADO` y los umbrales con el catálogo remoto. La foto usa el respaldo del HTML. El módulo de macrolotes debe confirmar que da lo mismo.
