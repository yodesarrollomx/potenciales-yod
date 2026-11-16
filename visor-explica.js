/*
 * Visor en vivo · qué es cada cifra y de qué depende (los TEXTOS).
 *
 * Una entrada por cifra que se puede tocar. Aquí sólo hay palabras: el visor (visor.js) las pinta, pone las
 * cifras que el servidor ya trae y saca «De qué depende» del grafo de fórmulas del libro
 * (visor-explica-grafo.js, generado por ppp2/libro/explica.py). Se corrigen aquí sin tocar la lógica.
 *
 *   corto      una línea para la leyenda (lo esencial).
 *   que        qué es, en una o dos frases llanas; el término financiero, si existe, una vez.
 *   como       cómo se calcula, en palabras.
 *   cifras     los operandos de ESTE plan que el servidor ya trae: [texto, ruta, formato]. El visor sólo los enseña
 *              (rutas: v.<clave>, datos.<clave>, flujo.total.<serie>, plan.<clave>; formatos: mdp, pct, mes, meses,
 *              u, veces, m2). Ninguna cuenta: si un operando no viene, se dice sin cifra en `sin_cifra`.
 *   mejora / empeora   qué la mueve, revisado contra las fórmulas de ppp2/libro/generar.py (ante la duda, no se dice).
 *   cambia     en lugar de mejora/empeora, para lo que no es «más es mejor».
 *   importa    por qué importa, en una línea; el límite es la regla de la revisión para fondos del PPP.
 *   opera      lo que lee la fórmula que describe `como`, con los nombres del grafo: tests/visor-explica.test.cjs
 *              lo compara con visor-explica-grafo.js; si la plantilla cambia, la prueba falla y hay que releer el texto.
 *   figura     la cifra del grafo cuando no se llama igual que la entrada.
 *   banco      la prueba no aplica si la versión no usa banco.
 *   dep        frase que abre «De qué depende» cuando hace falta decir algo antes de la lista.
 *   segundo    false: sólo las entradas directas (cuando el segundo nivel no agrega nada).
 *   de         para lo que acomoda el visor (un cociente o una suma de cifras del libro): las cifras del grafo de las que
 *              sale; «De qué depende» dice de qué sale cada una (y `opera` va vacío: no es una fórmula del libro).
 *   fuente     de dónde sale, cuando no es una clave del Resumen ({v} = la versión que se ve).
 *
 * Tono: español de México, de tú, frases cortas, cifras con su unidad, sin adjetivos de venta. Este archivo no lleva
 * nombres de planes ni de personas, ni cifras de un plan, ni identificadores.
 */
(function (root) {
  'use strict';
  var T = {
    /* ───────── Riesgo y estado · las nueve pruebas de la revisión para fondos ───────── */
    'v.rv_linea_ventas': {
      corto: 'Cuánto presta el banco por cada $100 de ventas.',
      que: 'Qué parte de lo que se va a vender cubre el crédito del banco: de cada $100 de ventas, cuántos presta. En banca se le llama LTV sobre el valor de venta (LTGDV).',
      como: 'Línea del banco ÷ ventas. La línea es el crédito que el banco autoriza: el menor de sus tres topes (sobre la obra directa, sobre el costo con terreno y sobre las ventas).',
      cifras: [['ventas', 'v.ventas', 'mdp']],
      sin_cifra: 'La línea del banco no viene en esta pantalla.',
      mejora: 'Baja con topes del banco más bajos o con precios más altos.',
      empeora: 'Sube con topes más altos o si la obra cuesta más. Nunca pasa del tope sobre ventas que el libro le da al banco.',
      importa: 'Si las ventas salen más bajas de lo calculado, una línea grande deja poco margen para pagarle al banco. La revisión para fondos del PPP pide 65% o menos.',
      opera: ['palanca:usa_banco', 'modelo:tope_banco', 'modelo:ventas'],
      banco: true
    },
    'v.rv_linea_costo': {
      corto: 'Cuánto presta el banco por cada $100 de costo, terreno incluido.',
      que: 'Qué parte del costo total del proyecto, terreno incluido, financia el banco: de cada $100 que cuesta, cuántos presta. En banca se le llama LTC (loan to cost).',
      como: 'Línea del banco ÷ costo con terreno. El costo con terreno es el costo sin terreno más el valor de la tierra.',
      cifras: [['costo sin terreno', 'v.costo_sin_tierra', 'mdp'], ['valor de la tierra', 'v.tierra', 'mdp']],
      sin_cifra: 'La línea del banco no viene en esta pantalla.',
      mejora: 'Baja con topes del banco más bajos; pero si el banco presta menos, revisa que no aparezca dinero faltante.',
      empeora: 'Sube con topes más altos. Nunca pasa del tope sobre costo con terreno que el libro le da al banco.',
      importa: 'Entre más del costo ponga el banco, menos pone el proyecto y menos colchón queda si algo sale más caro. La revisión para fondos del PPP pide 50% o menos.',
      opera: ['palanca:usa_banco', 'modelo:tope_banco', 'modelo:costo_con_tierra'],
      banco: true
    },
    'v.rv_meses_credito': {
      corto: 'Cuántos meses dura el crédito, del arranque de obra al último pago.',
      que: 'Cuánto tiempo se le debe al banco, contado desde que arranca la obra hasta que se le termina de pagar. Es el plazo del crédito puente.',
      como: 'Mes en que se liquida el banco − mes de arranque de obra.',
      cifras: [['el banco se liquida en el', 'v.banco_mes', 'mes'], ['la obra arranca en el', 'v.obra_inicio', 'mes']],
      mejora: 'Baja si los saldos se cobran antes, porque al banco se le paga con lo que entra: menos meses para cobrar saldos o individualizar antes de terminar la obra.',
      empeora: 'Sube con una obra más larga o si los saldos tardan más en cobrarse.',
      importa: 'Entre más dura el crédito, más intereses se pagan y más tiempo queda el plan expuesto a cambios de tasa o de mercado. La revisión para fondos del PPP pide 36 meses o menos.',
      opera: ['palanca:usa_banco', 'v:banco_mes', 'palanca:obra_inicio'],
      banco: true
    },
    'v.rv_aportacion': {
      corto: 'Lo que ponen la tierra y el capital por cada $100 de costo.',
      que: 'Cuánto del costo total ponen los socios con su tierra y su capital, antes de pedir prestado. Es la aportación de capital (equity).',
      como: '(Valor de la tierra + capital comprometido) ÷ costo con terreno. Cuenta el capital de la versión (la palanca Capital), aunque no se use todo.',
      cifras: [['valor de la tierra', 'v.tierra', 'mdp'], ['costo sin terreno', 'v.costo_sin_tierra', 'mdp']],
      sin_cifra: 'El capital comprometido no viene en esta pantalla: el capital aportado del cuadro Dinero es el que de verdad se usa.',
      mejora: 'Sube con más capital comprometido o con un costo menor.',
      empeora: 'Baja con menos capital o si el costo sube.',
      importa: 'Es lo primero que pierden los socios si algo sale mal, antes que el banco. La revisión para fondos del PPP pide 20% como mínimo y considera sano 25%.',
      opera: ['palanca:tierra', 'palanca:capital', 'modelo:costo_con_tierra']
    },
    'v.rv_margen': {
      corto: 'Lo que se gana por cada $100 de costo, antes de intereses.',
      que: 'Cuánto ganaría el proyecto por cada $100 que cuesta, antes de pagar intereses al banco y rendimientos al capital. Es el margen antes de financiamiento sobre costo.',
      como: '(Ventas − costo con terreno) ÷ costo con terreno.',
      cifras: [['ventas', 'v.ventas', 'mdp'], ['costo sin terreno', 'v.costo_sin_tierra', 'mdp'], ['valor de la tierra', 'v.tierra', 'mdp']],
      mejora: 'Sube con precios más altos o con costos más bajos: obra, indirectos, comisiones o tierra.',
      empeora: 'Baja si los precios bajan o los costos suben. El banco y el capital no la mueven: es antes de financiamiento.',
      importa: 'Es el colchón para pagar el dinero ajeno y aguantar sorpresas. La revisión para fondos del PPP pide 20% o más.',
      opera: ['modelo:ventas', 'modelo:costo_con_tierra']
    },
    'v.rv_falta': {
      corto: 'Dinero que no alcanzarían a cubrir ni el capital ni el banco.',
      que: 'Lo que faltaría en algún mes porque ni el capital ni el crédito del banco alcanzan a cubrir lo que sale. Es un hueco de financiamiento: dinero que nadie tiene previsto poner.',
      como: 'Se suma mes por mes: lo que falta antes de dinero nuevo, menos lo que aporta el capital y lo que dispone el banco, más la comisión de apertura. Debe dar $0.',
      cifras: [],
      mejora: 'Baja hasta $0 con más capital comprometido, una línea del banco más grande o clientes que pagan antes: más enganche, pagos durante la obra o ventas más rápidas.',
      empeora: 'Sube si se exige más caja mínima o si las ventas se alargan.',
      importa: 'Si falta dinero un solo mes, alguien tendría que poner lo que el plan no tiene previsto. La revisión para fondos del PPP pide que sea $0.',
      opera: ['flujo:30', 'flujo:31', 'flujo:34', 'flujo:35']
    },
    'v.rv_preventa': {
      corto: 'Qué parte de las unidades ya está vendida cuando arranca la obra.',
      que: 'Cuántas de las unidades ya tienen contrato firmado cuando empieza la obra. Es la preventa: muestra que hay compradores antes de construir.',
      como: 'Unidades firmadas antes del mes de arranque de obra ÷ unidades totales del plan.',
      cifras: [['la obra arranca en el', 'v.obra_inicio', 'mes']],
      mejora: 'Sube si la obra arranca después, si las ventas empiezan antes o si se vende más rápido.',
      empeora: 'Baja si la obra se adelanta o si las ventas se alargan.',
      importa: 'Vender antes de construir baja el riesgo de quedarse con unidades sin comprador. La revisión para fondos del PPP pide 35% o más.',
      opera: ['palanca:obra_inicio', 'flujo:11', 'dato:productos']
    },
    'v.rv_preventa_banco': {
      corto: 'Qué parte está vendida cuando el banco pone su primer peso.',
      que: 'Cuántas de las unidades ya están firmadas cuando el banco hace el primer desembolso de su crédito.',
      como: 'Unidades firmadas antes del primer desembolso ÷ unidades totales del plan. El primer desembolso es el primer mes en que el banco pone dinero.',
      cifras: [],
      sin_cifra: 'El mes del primer desembolso no viene como cifra; en el cuadro Dinero se ve cuándo empieza a entrar el banco.',
      mejora: 'Sube si el banco entra más tarde porque antes se usa otro dinero (más capital, más enganche o menos caja mínima), si se vende más rápido o si la obra arranca después.',
      empeora: 'Baja con menos capital, ventas más lentas o una obra que arranca antes.',
      importa: 'Con más contratos firmados, el crédito arranca respaldado por ventas y no sólo por el proyecto. La revisión para fondos del PPP pide 40% o más.',
      opera: ['palanca:usa_banco', 'flujo:61', 'flujo:11', 'dato:productos'],
      banco: true
    },
    'v.rv_cobertura': {
      corto: 'Cuántas veces lo vendido por cobrar cubre la deuda con el banco.',
      que: 'Cuántas veces cubre lo que ya está vendido y falta por cobrar a lo que se le debe al banco, en el mes más apretado. Es la cobertura del crédito con cartera firmada.',
      como: 'En cada mes con deuda: lo firmado que falta por cobrar ÷ saldo del banco. Se toma el mes más bajo.',
      cifras: [],
      sin_cifra: 'Lo que falta por cobrar de cada mes no viene en esta pantalla.',
      mejora: 'Sube si se vende más y más pronto, si hay más capital o si el banco presta menos.',
      empeora: 'Baja si las ventas se alargan o si la deuda con el banco crece.',
      importa: 'Dice si, en el peor mes, lo ya vendido alcanza para pagarle al banco aunque no se venda nada más. La revisión para fondos del PPP pide 1.3 veces o más.',
      opera: ['palanca:usa_banco', 'flujo:41', 'flujo:51'],
      banco: true
    },

    /* ───────── Riesgo y estado · aguante, etapa, candados y siguiente paso ───────── */
    'estres': {
      figura: 'v.huella',
      corto: 'Cuántos golpes aguanta la versión sin que falte dinero ni se pierda.',
      que: 'Qué tan bien resiste esta versión si algo sale peor de lo calculado. Cada prueba de estrés cambia una sola cosa (precios, costo de obra, ritmo de ventas…) y vuelve a calcular el plan.',
      como: 'Cuenta las pruebas corridas con esta misma versión en las que no faltaría dinero y la ganancia sigue arriba de cero.',
      dep: 'Una prueba sólo cuenta si se corrió con estas mismas cifras. Si cambia cualquiera de éstas, la versión tiene otra huella y hay que repetirlas:',
      segundo: false,
      fuente: 'Libro del plan · Pruebas, las corridas con la huella de esta versión ({v}.huella)',
      mejora: 'Aguanta más con más colchón: más margen, para que la ganancia no baje de cero, y más dinero disponible (capital o línea del banco), para que no falte.',
      importa: 'Un plan que sólo funciona si todo sale como se calculó es frágil: las pruebas dicen cuánto margen de error tiene.',
      opera: ['v:ganancia', 'v:ventas', 'v:costo_sin_tierra', 'v:tierra', 'v:capital', 'v:banco_max', 'v:max_ajeno', 'v:costo_dinero',
        'v:dueno_recibe', 'v:mes_reparto', 'v:obra_inicio', 'v:rv_aportacion', 'v:rv_preventa', 'v:norma_alertas']
    },
    'plan.edad': {
      corto: 'En qué etapa va el plan, de semilla a fruto.',
      que: 'En qué punto de su vida va el plan. Son cinco etapas: semilla, plántula, árbol, flor y fruto.',
      como: 'Semilla: todavía no calcula. Plántula: la versión que se muestra ya calcula con todos sus datos y productos. Árbol: el consejo de planes aprobó la versión vigente (5 de 7 votos, sin veto). Flor: además, todos sus candados están cerrados. Fruto: ya hay acuerdo firmado con el dueño.',
      cambia: 'Avanza al cumplir lo que pide la etapa siguiente (lo dice el siguiente paso). Retrocede si falta un dato que se necesita para calcular, o si cambian las cifras de la vigente: la aprobación del consejo vale sólo para esas cifras.',
      importa: 'Dice qué tan listo está el plan para presentarse a socios: cada etapa pide más evidencia que la anterior.',
      opera: ['dato:acuerdo.firmado', 'plan:43', 'tabla:Candados:A', 'tabla:Candados:D', 'v:ganancia', 'plan:6', 'tabla:Datos:K', 'tabla:Datos:C', 'dato:productos']
    },
    'plan.candados_abiertos': {
      corto: 'Lo que falta resolver fuera de los números.',
      que: 'Lo que todavía falta resolver fuera del cálculo antes de presentar el plan a socios: por ejemplo, la tenencia de la tierra, el uso de suelo, el agua, la vialidad, el interés del banco y el acuerdo con los dueños.',
      como: 'Cuenta los candados de la pestaña Candados que están abiertos o en revisión.',
      cambia: 'Baja cada vez que se cierra un candado con su evidencia o se marca que no aplica.',
      importa: 'Con candados abiertos el plan no llega a flor, aunque sus números pasen.',
      opera: ['tabla:Candados:D']
    },
    'plan.paso_texto': {
      corto: 'Lo que el plan necesita ahora para avanzar.',
      que: 'Lo que el plan necesita ahora para avanzar. Lo decide el libro con reglas fijas.',
      como: 'Sigue un orden: si faltan datos, capturarlos; si la versión no pasa la revisión para fondos, mover capital y arranque de obra (o armar otra propuesta si eso ya no alcanza); si pasa, probarla contra golpes, presentarla al consejo y que Dirección la vuelva vigente; después, cerrar candados y firmar el acuerdo.',
      cambia: 'Cambia en cuanto se cumple el paso de hoy.',
      importa: 'Evita adivinar qué sigue: el plan sólo avanza cuando cumple su paso.',
      opera: ['plan:38', 'plan:28']
    },

    /* ───────── Terreno ───────── */
    'datos.terreno.m2': {
      corto: 'La superficie del terreno, en metros cuadrados.',
      que: 'Cuántos metros cuadrados mide el terreno. Viene de la escritura o del levantamiento.',
      como: 'No se calcula: se captura en los datos del plan, con su estado (confirmado, por confirmar…) y su fuente.',
      cambia: 'Sólo cambia si se corrige el dato.',
      importa: 'Con él se revisa si el programa cabe en la norma: cuánto del terreno se ocupa y cuántas veces se construye sobre él.',
      opera: []
    },
    'datos.lamina.m2_construidos': {
      corto: 'Los metros que se construyen sobre el terreno, sin sótano.',
      que: 'Cuántos metros cuadrados se construyen sobre el terreno, sin contar el sótano. Es lo que la norma mide con la intensidad de construcción (CUS).',
      como: 'Se captura; si nadie lo escribe, el libro lo saca del programa: la huella en planta baja por los niveles (en planta baja, sólo lo cerrado).',
      cambia: 'Crece con más niveles o más huella.',
      importa: 'Es la base del costo de obra: el libro multiplica estos metros por el costo por metro construido.',
      opera: ['dato:prog.desplante', 'dato:prog.niveles', 'dato:prog.planta_baja']
    },
    'datos.lamina.m2_vendibles': {
      corto: 'Los metros que se pueden vender: la suma de los productos.',
      que: 'Cuántos metros cuadrados se venden: la suma de los metros de todos los productos. Es el área vendible.',
      como: 'Sale de la suma de los metros de los productos; si se escribe, manda lo escrito.',
      cambia: 'Cambia si cambian los metros de algún producto.',
      importa: 'Frente a lo construido dice qué parte de la obra se puede vender: lo demás son circulaciones, muros y áreas comunes.',
      opera: ['dato:productos']
    },
    'v.tierra': {
      corto: 'Lo que vale la tierra que aporta el dueño.',
      que: 'Lo que vale el terreno en esta versión. Es lo que aporta el dueño y lo que el reparto le reconoce.',
      como: 'Es la palanca Valor de la tierra de la versión; si la versión no trae la suya, toma el dato del plan. En Costo y ganancia se le suma el cierre de la compra.',
      cambia: 'Un valor más alto sube el costo con terreno y baja la ganancia real, pero sube lo que recibe el dueño cuando el esquema le paga la tierra.',
      importa: 'Pesa en todo: entra al costo con terreno, a la revisión para fondos y a lo que recibe el dueño.',
      opera: ['palanca:tierra']
    },

    /* ───────── Producto ───────── */
    'productos': {
      corto: 'Lo que se vende: unidades, metros y precio de cada producto.',
      que: 'Cada tipo de unidad que se vende, con cuántas son, cuántos metros tiene y su precio por metro. Es la mezcla de producto.',
      como: 'Se captura en la pestaña Productos. Las ventas de cada producto son sus metros por su precio por metro; el precio por unidad, esas ventas entre sus unidades.',
      cambia: 'Cambiar unidades, metros o precio mueve las ventas y, con ellas, casi todo el plan.',
      importa: 'Es el ingreso del proyecto: de aquí salen las ventas, la cobranza y la preventa.',
      opera: []
    },
    'v.ventas': {
      corto: 'Todo lo que se vende, con el ajuste de precio de la versión.',
      que: 'Cuánto dinero entra por vender todas las unidades. Son los ingresos del proyecto.',
      como: 'Ventas de los productos × (1 + ajuste de precio de la versión).',
      mejora: 'Suben con precios más altos o más metros vendibles.',
      empeora: 'Bajan si se ajusta el precio a la baja.',
      importa: 'De ellas salen la cobranza, las comisiones, la ganancia y el tope del banco sobre ventas.',
      opera: ['dato:productos', 'palanca:ajuste_precio']
    },

    /* ───────── Tiempo ───────── */
    'flujo.firmas': {
      corto: 'Cuántas unidades se firman y en qué meses.',
      que: 'El calendario de ventas: cuántas unidades se firman cada mes, desde que empieza la venta hasta que se vende todo.',
      como: 'Las unidades de cada producto se reparten por igual entre los meses de comercialización, a partir del mes de inicio de ventas.',
      cifras: [['unidades firmadas en total', 'flujo.total.firmas', 'u']],
      cambia: 'Se adelanta si las ventas empiezan antes; se aprieta si duran menos meses (más unidades por mes).',
      importa: 'Marca cuándo entra el dinero de los clientes: de este calendario salen la preventa, los enganches y los saldos.',
      opera: ['dato:productos', 'palanca:ventas_inicio', 'palanca:ventas_meses']
    },
    'v.fin_obra': {
      corto: 'Cuándo se construye: del arranque al fin de obra.',
      que: 'Los meses en que se construye: del arranque al fin de obra, contados desde el inicio del plan.',
      como: 'Fin de obra = mes de inicio de obra + duración de la obra − 1.',
      cifras: [['la obra arranca en el', 'v.obra_inicio', 'mes'], ['y termina en el', 'v.fin_obra', 'mes']],
      cambia: 'Se mueve con el arranque o con la duración de la obra. Arrancar después da más tiempo para vender antes de construir (más preventa), pero alarga el plazo.',
      importa: 'Con la obra terminada se escrituran las unidades y se cobran los saldos: de ahí sale el dinero para pagar al banco.',
      opera: ['palanca:obra_inicio', 'palanca:obra_duracion']
    },
    'flujo.saldos': {
      corto: 'Lo que pagan los clientes al escriturar, y cuándo.',
      que: 'El resto del precio que pagan los clientes al recibir y escriturar su unidad, después del enganche y de los pagos durante la obra.',
      como: 'Lo firmado antes de individualizar se cobra repartido en los meses para cobrar saldos; lo firmado después paga su saldo unos meses después de firmar.',
      cifras: [['saldos en total', 'flujo.total.saldos', 'mdp']],
      cambia: 'Se adelanta si se individualiza antes de terminar la obra o si los saldos se cobran en menos meses.',
      importa: 'Con ellos se le paga al banco y se reparte: si tardan, todo lo demás se recorre.',
      opera: ['modelo:mes_saldos', 'palanca:meses_saldos', 'modelo:saldos_individualizar', 'palanca:saldo_posterior', 'palanca:enganche', 'modelo:precio_u', 'flujo:firmas_producto']
    },
    'v.mes_reparto': {
      corto: 'En qué mes termina todo y se reparte.',
      que: 'El mes en que el proyecto termina de cobrar y de pagar al banco, al capital y al respaldo, y se puede repartir lo que queda.',
      como: 'El más tardío de cuatro meses: cuando se liquidan el banco, el capital y el respaldo, y el último mes con cobranza.',
      cifras: [['banco liquidado en el', 'v.banco_mes', 'mes'], ['capital liquidado en el', 'v.capital_mes', 'mes'], ['última cobranza en el', 'v.ultimo_cobro', 'mes']],
      mejora: 'Llega antes si los saldos se cobran antes o la obra dura menos.',
      empeora: 'Se aleja si las ventas o la obra se alargan.',
      importa: 'Es el plazo del negocio: entre más tarde, más tiempo esperan el dueño y los socios su dinero.',
      opera: ['v:banco_mes', 'v:capital_mes', 'v:respaldo_mes', 'v:ultimo_cobro']
    },
    'v.banco_mes': {
      corto: 'En qué mes se le termina de pagar al banco.',
      que: 'El mes en que el crédito del banco queda en cero.',
      como: 'El último mes con saldo del banco, más uno. El saldo sube con cada disposición y baja con cada pago.',
      mejora: 'Llega antes si los saldos se cobran antes.',
      empeora: 'Se aleja con una obra más larga o si los saldos tardan más.',
      importa: 'Al banco se le paga primero: mientras haya deuda corren intereses y el capital y el reparto esperan.',
      opera: ['flujo:35', 'flujo:38']
    },
    'v.capital_mes': {
      corto: 'En qué mes se le termina de devolver al capital.',
      que: 'El mes en que el capital recibe todo lo que puso más su rendimiento.',
      como: 'El último mes con saldo del capital, más uno. Al capital se le paga después del banco y, si así se decidió, hasta que termina la obra.',
      cambia: 'No puede llegar antes que el banco: se adelanta si el banco se liquida antes.',
      importa: 'Mientras no se le devuelve, su rendimiento sigue corriendo.',
      opera: ['flujo:31', 'flujo:40', 'palanca:tasa_capital']
    },

    /* ───────── Costo y ganancia ───────── */
    'flujo.obra': {
      corto: 'Lo que cuesta construir: la obra directa.',
      que: 'Lo que cuesta construir el proyecto: materiales, mano de obra y equipo. Es la obra directa (costo duro).',
      como: 'La obra directa de la versión, repartida mes a mes con la curva de obra entre el arranque y el fin de obra.',
      mejora: 'Baja con menos metros, un costo por metro menor o un ajuste de obra a la baja.',
      empeora: 'Sube con más construcción, más cajones en sótano o un costo por metro mayor.',
      importa: 'Es el costo más grande y de él cuelgan los indirectos, los imprevistos y el tope del banco sobre obra.',
      opera: ['modelo:obra', 'flujo:18']
    },
    'flujo.indirectos': {
      corto: 'Proyecto, permisos, supervisión y administración.',
      que: 'Lo que cuesta lo que no es construir pero hace falta para hacerlo: proyecto, permisos, supervisión y administración. Son los costos indirectos (costo blando).',
      como: 'Un porcentaje de la obra directa. Una parte se gasta en el predesarrollo y el resto al ritmo de la obra.',
      mejora: 'Bajan con un porcentaje menor o con menos obra directa.',
      empeora: 'Suben si sube la obra directa o el porcentaje.',
      importa: 'Una parte sale en el predesarrollo, cuando todavía no hay cobranza: ese dinero lo pone el capital.',
      opera: ['palanca:predesarrollo', 'palanca:ind_predesarrollo', 'modelo:indirectos_monto', 'flujo:19', 'modelo:obra']
    },
    'flujo.imprevistos': {
      corto: 'La reserva para lo que salga más caro de lo calculado.',
      que: 'Una reserva para lo que salga mal o más caro en la obra. Son las contingencias.',
      como: 'Un porcentaje de la obra directa, que se gasta al ritmo de la obra.',
      mejora: 'Bajan con un porcentaje menor.',
      empeora: 'Suben con más obra directa o un porcentaje mayor.',
      importa: 'Es el colchón de la obra: sin él, cualquier sorpresa sale directo de la ganancia.',
      opera: ['modelo:imprevistos_monto', 'flujo:19', 'modelo:obra']
    },
    'flujo.comisiones': {
      corto: 'Lo que se paga a quien vende, conforme se cobra.',
      que: 'Lo que se les paga a los vendedores o brokers por las ventas.',
      como: 'Comisión sobre ventas × lo que se cobra cada mes.',
      mejora: 'Bajan con una comisión menor.',
      empeora: 'Suben con una comisión mayor.',
      importa: 'Se pagan conforme entra el dinero: crecen con las ventas.',
      opera: ['palanca:comision', 'flujo:16']
    },
    'v.costo_sin_tierra': {
      corto: 'Todo lo que cuesta el proyecto, menos el terreno.',
      que: 'Lo que cuesta hacer el proyecto sin contar el terreno: obra, indirectos, imprevistos, comisiones y el cierre de la compra de la tierra.',
      como: 'Obra directa + indirectos + imprevistos + comisiones + cierre de tierra.',
      mejora: 'Baja con menos obra, porcentajes menores o una comisión menor.',
      empeora: 'Sube si sube la obra directa o cualquiera de sus porcentajes.',
      importa: 'Con el valor de la tierra forma el costo con terreno, contra el que se miden el margen y la línea del banco.',
      opera: ['modelo:obra', 'modelo:indirectos_monto', 'modelo:imprevistos_monto', 'modelo:comisiones', 'modelo:cierre_monto']
    },
    'v.costo_dinero': {
      corto: 'Intereses, comisión de apertura y rendimientos del capital.',
      que: 'Lo que cuesta usar dinero de otros: los intereses y la comisión de apertura del banco, el rendimiento del capital y lo que costaría el respaldo.',
      como: 'Intereses + comisión de apertura + (lo pagado al capital − lo que aportó) + (lo pagado al respaldo − lo que faltó).',
      mejora: 'Baja si el dinero ajeno se usa menos tiempo (saldos que se cobran antes, más enganche o pagos durante la obra) o con tasas menores.',
      empeora: 'Sube con ventas más lentas, más caja mínima o más capital, si su rendimiento es mayor que la tasa del banco.',
      importa: 'Sale directo de la ganancia: lo que queda antes de intereses, menos el costo del dinero, es la ganancia real.',
      opera: ['flujo:29', 'flujo:34', 'flujo:40', 'flujo:31', 'flujo:39', 'flujo:37']
    },
    'v.rend_capital': {
      corto: 'Lo que gana el capital por poner su dinero.',
      que: 'Lo que se le paga al capital encima de lo que aportó: su rendimiento.',
      como: 'Todo lo que se le paga al capital − lo que aportó. Su saldo crece cada mes con la tasa anual del capital hasta que se le devuelve.',
      mejora: 'Baja si se le devuelve antes (saldos que se cobran antes) o con una tasa menor.',
      empeora: 'Sube con más capital, una tasa mayor o si tarda más en salir.',
      importa: 'Es parte del costo del dinero y se paga antes de repartir.',
      opera: ['flujo:40', 'flujo:31']
    },
    'v.ganancia': {
      corto: 'Lo que queda al final, ya pagada la tierra, antes de impuestos.',
      que: 'Lo que queda después de pagar todos los costos, el banco, el capital con su rendimiento y la tierra a su valor. Es la utilidad antes de impuestos (ISR).',
      como: 'Caja al cierre, ya pagados banco y capital − valor de la tierra.',
      cifras: [['caja al cierre', 'v.caja_cierre', 'mdp'], ['valor de la tierra', 'v.tierra', 'mdp']],
      mejora: 'Sube con mejores precios, menos costo o dinero ajeno más barato y por menos tiempo.',
      empeora: 'Baja si los precios bajan, la obra cuesta más o las ventas se alargan.',
      importa: 'De ella sale lo que se reparte entre el dueño, la alianza y el capital, según el esquema elegido.',
      opera: ['v:caja_cierre', 'palanca:tierra']
    },
    'v.margen': {
      corto: 'La ganancia real por cada $100 de ventas.',
      que: 'Cuánto queda de ganancia real por cada $100 que se vende. Es el margen neto antes de impuestos.',
      como: 'Ganancia real ÷ ventas.',
      cifras: [['ganancia real', 'v.ganancia', 'mdp'], ['ventas', 'v.ventas', 'mdp']],
      mejora: 'Sube con mejores precios, menos costo o dinero ajeno más barato.',
      empeora: 'Baja si los precios bajan, la obra cuesta más o las ventas se alargan.',
      importa: 'Permite comparar proyectos de distinto tamaño.',
      opera: ['v:ganancia', 'v:ventas']
    },

    /* ───────── Dinero ───────── */
    'flujo.cobranza': {
      corto: 'Todo lo que pagan los clientes, mes a mes.',
      que: 'El dinero que entra de los clientes: enganches al firmar, pagos durante la obra y saldos al escriturar.',
      como: 'Enganches + pagos durante la obra + saldos al escriturar, de cada mes.',
      cifras: [['enganches', 'flujo.total.enganches', 'mdp'], ['pagos durante la obra', 'flujo.total.pagos_obra', 'mdp'], ['saldos', 'flujo.total.saldos', 'mdp']],
      cambia: 'Se adelanta con más enganche, pagos durante la obra o ventas más rápidas; en total, suma lo vendido.',
      importa: 'Es el dinero propio del proyecto: lo que no cubre a tiempo lo tienen que poner el capital o el banco.',
      opera: ['flujo:13', 'flujo:14', 'flujo:15']
    },
    'flujo.egresos': {
      corto: 'Todo lo que sale a costos, mes a mes.',
      que: 'El dinero que sale para pagar los costos del proyecto, sin contar al banco ni al capital.',
      como: 'Obra directa + indirectos + imprevistos + comisiones + cierre de tierra, de cada mes.',
      cifras: [['obra directa', 'flujo.total.obra', 'mdp'], ['indirectos', 'flujo.total.indirectos', 'mdp'], ['imprevistos', 'flujo.total.imprevistos', 'mdp'], ['comisiones', 'flujo.total.comisiones', 'mdp'], ['cierre de tierra', 'flujo.total.cierre', 'mdp']],
      cambia: 'Sube o baja con la obra y sus porcentajes; su ritmo lo marca la curva de obra.',
      importa: 'Comparado con la cobranza de cada mes, dice cuánto dinero ajeno hace falta y cuándo.',
      opera: ['flujo:19', 'flujo:21', 'flujo:22', 'flujo:23', 'flujo:24']
    },
    'flujo.disposicion': {
      corto: 'Lo que el banco presta, mes a mes.',
      que: 'El dinero que entrega el banco de su crédito, a medida que avanza la obra.',
      como: 'Cada mes, lo que falta después del capital (más la comisión de apertura del primer desembolso), sin pasar de lo que el banco libera según el avance de obra.',
      cambia: 'Baja si hay más capital o si los clientes pagan antes; lo que puede liberar crece con el avance de la obra.',
      importa: 'Es deuda: genera intereses desde que se dispone hasta que se paga.',
      opera: ['flujo:30', 'flujo:31', 'flujo:34', 'flujo:33', 'flujo:36']
    },
    'flujo.cap_aporta': {
      corto: 'Lo que pone el capital, mes a mes.',
      que: 'El dinero que pone el capital cada mes, cuando lo que entra no alcanza.',
      como: 'Cada mes, lo que falta antes de dinero nuevo, hasta agotar el capital comprometido. El capital entra antes que el banco.',
      cambia: 'Entra más si falta más dinero, hasta llegar al capital comprometido.',
      importa: 'Es el primer dinero ajeno que entra y sale después del banco.',
      opera: ['flujo:30', 'palanca:capital', 'flujo:32']
    },
    'flujo.respaldo': {
      corto: 'Lo que faltaría y nadie tiene previsto poner.',
      que: 'Lo que faltaría cada mes porque ni el capital ni el banco alcanzan. Lo tendría que poner un respaldo que el plan no tiene previsto.',
      como: 'Cada mes: lo que falta antes de dinero nuevo, menos lo que aporta el capital y lo que dispone el banco, más la comisión de apertura.',
      mejora: 'Baja hasta $0 con más capital comprometido, una línea del banco más grande o clientes que pagan antes.',
      empeora: 'Sube si se exige más caja mínima o si las ventas se alargan.',
      importa: 'Debe ser $0 todos los meses: es la prueba de dinero que faltaría de la revisión para fondos.',
      opera: ['flujo:30', 'flujo:31', 'flujo:34', 'flujo:35']
    },
    'flujo.pago_banco': {
      corto: 'Lo que se le devuelve al banco, mes a mes.',
      que: 'Lo que se le devuelve al banco de su crédito, con el dinero que va sobrando.',
      como: 'Cada mes que sobra dinero, se le paga al banco hasta lo que se le debe. Los intereses se pagan aparte, cada mes.',
      cambia: 'Se adelanta si los clientes pagan antes; no empieza hasta que sobra dinero.',
      importa: 'Al banco se le paga antes que al capital y antes de repartir.',
      opera: ['flujo:30', 'flujo:41']
    },
    'flujo.pago_capital': {
      corto: 'Lo que se le devuelve al capital, con su rendimiento.',
      que: 'Lo que se le devuelve al capital, con su rendimiento, una vez pagado el banco.',
      como: 'Ya pagado el banco (y, si así se decidió, terminada la obra), lo que sobra cada mes va al capital hasta cubrir lo que puso más su rendimiento.',
      cambia: 'Se adelanta si el banco se liquida antes; si el capital espera a que termine la obra, no sale antes del fin de obra.',
      importa: 'Mientras no sale, su rendimiento sigue corriendo y el reparto espera.',
      opera: ['flujo:41', 'flujo:38', 'palanca:devolver_con_obra', 'modelo:fin_obra', 'flujo:30', 'flujo:39', 'flujo:42', 'palanca:tasa_capital']
    },
    'flujo.pago_respaldo': {
      corto: 'Lo que se le devolvería al respaldo, si se usó.',
      que: 'Si en algún mes faltó dinero y lo puso un respaldo, lo que se le devuelve después, con rendimiento.',
      como: 'Ya pagado el banco, lo que sobra va primero al respaldo y después al capital, con la tasa anual del capital.',
      cambia: 'Sólo existe si hubo dinero faltante.',
      importa: 'Si hay pago al respaldo, el plan necesitó dinero que no tenía previsto.',
      opera: ['flujo:41', 'flujo:38', 'palanca:devolver_con_obra', 'modelo:fin_obra', 'flujo:30', 'flujo:43', 'palanca:tasa_capital']
    },
    'flujo.flujo_acum': {
      corto: 'El saldo acumulado: lo que va sobrando o faltando.',
      que: 'Cuánto dinero va sobrando o faltando desde el inicio, antes de capital y banco. Su punto más bajo es lo más hondo del hoyo que hay que financiar.',
      como: 'Se suma mes por mes: cobranza − egresos − intereses y comisión de apertura del banco.',
      cambia: 'El hoyo es menos hondo con más preventa, más enganche o una obra más barata; al final, el saldo es lo que queda para repartir.',
      importa: 'Su punto más bajo marca el peor momento del proyecto: ahí se necesita más dinero ajeno.',
      opera: ['flujo:16', 'flujo:25', 'flujo:29', 'flujo:34']
    },
    'v.resultado_repartir': {
      corto: 'Lo que queda para repartir, antes de pagar el capital y la tierra.',
      que: 'Lo que queda al final para el dueño, la alianza y el capital, antes de pagarle al capital su rendimiento y a la tierra su valor.',
      como: 'Caja al cierre, ya pagados banco y capital + rendimiento pagado al capital.',
      cifras: [['caja al cierre', 'v.caja_cierre', 'mdp'], ['rendimiento del capital', 'v.rend_capital', 'mdp']],
      mejora: 'Sube con mejores precios, menos costo o menos intereses del banco.',
      empeora: 'Baja si los precios bajan, la obra cuesta más o las ventas se alargan.',
      importa: 'Es la bolsa que reparte el esquema elegido: primero el rendimiento del capital y la tierra, si se pagan, y luego la utilidad.',
      opera: ['v:caja_cierre', 'v:rend_capital']
    },
    'v.max_ajeno': {
      corto: 'Lo más que se llega a deber: banco, capital y respaldo juntos.',
      que: 'El momento en que el proyecto usa más dinero que no es suyo: lo que se debe al banco más el capital aportado y el respaldo, en el peor mes.',
      como: 'El mes más alto de: saldo del banco + capital aportado acumulado + saldo del respaldo.',
      mejora: 'Baja con más enganche, pagos durante la obra, ventas más rápidas, menos caja mínima o una obra más barata.',
      empeora: 'Sube si las ventas se alargan o los clientes pagan después.',
      importa: 'Es el tamaño del financiamiento que necesita el plan: entre más alto, más intereses y más riesgo.',
      opera: ['flujo:41', 'flujo:32', 'flujo:43']
    },
    'v.banco_max': {
      corto: 'Lo más que se le llega a deber al banco.',
      que: 'El saldo más alto del crédito del banco en todo el plan.',
      como: 'El mes más alto del saldo del banco, que sube con cada disposición y baja con cada pago.',
      mejora: 'Baja con más capital, más enganche o pagos durante la obra, o con topes del banco más bajos.',
      empeora: 'Sube con menos capital, ventas más lentas o una obra más cara.',
      importa: 'Es la deuda máxima: nunca pasa de la línea del banco y de ella salen los intereses.',
      opera: ['flujo:35', 'flujo:38']
    },
    'v.capital': {
      corto: 'Lo que de verdad aporta el capital.',
      que: 'Cuánto dinero pone el capital en total. Puede ser menos que el capital comprometido si no hace falta todo.',
      como: 'Se suma lo que aporta cada mes, cuando lo que entra no alcanza, hasta el capital comprometido de la versión.',
      cambia: 'Nunca pasa del capital comprometido: si falta más, entra el banco. Más capital baja lo que se le pide al banco, pero cuesta más si su rendimiento es mayor que la tasa del banco.',
      importa: 'Es el dinero en riesgo de los socios, antes que el del banco.',
      opera: ['flujo:30', 'palanca:capital']
    },
    'flujo.caja_minima': {
      corto: 'El colchón de caja que se exige desde que arranca la obra.',
      que: 'Un colchón de dinero que el proyecto debe tener en caja desde que arranca la obra.',
      como: 'Caja mínima (% del costo sin terreno) × costo sin terreno, exigida cada mes desde el arranque de obra.',
      cambia: 'Más caja mínima pide más dinero ajeno y sube el costo del dinero; menos, lo baja, con menos colchón.',
      importa: 'Es la regla de Dirección para no quedarse sin caja; el dinero que se guarda también hay que financiarlo.',
      opera: ['palanca:obra_inicio', 'modelo:caja_minima']
    },
    'v.caja_cierre': {
      corto: 'Lo que queda en caja al final, ya pagados banco y capital.',
      que: 'El dinero que queda en caja al terminar, después de pagar al banco y al capital y antes de pagar la tierra.',
      como: 'Caja del último mes − lo que todavía se le deba al banco, al capital y al respaldo.',
      mejora: 'Sube con mejores precios, menos costo o dinero ajeno más barato.',
      empeora: 'Baja si los precios bajan, la obra cuesta más o las ventas se alargan.',
      importa: 'Menos el valor de la tierra, es la ganancia real.',
      opera: ['flujo:45', 'flujo:41', 'flujo:42', 'flujo:43']
    },

    /* ───────── Reparto ───────── */
    'v.dueno_aporta': {
      corto: 'Lo que aporta el dueño: su tierra, a su valor.',
      que: 'Lo que pone el dueño en el proyecto: su terreno, valuado en lo que vale la tierra en esta versión.',
      como: 'Es el valor de la tierra de la versión.',
      cambia: 'Cambia si cambia el valor de la tierra.',
      importa: 'Contra esta cifra se mide cuántas veces recupera el dueño lo que puso.',
      opera: ['palanca:tierra']
    },
    'v.dueno_recibe': {
      corto: 'Todo lo que recibe el dueño al final.',
      que: 'Todo lo que recibe el dueño por aportar su tierra, según el esquema de reparto elegido.',
      como: 'El pago de su tierra, si el esquema lo hace antes de repartir, más su parte de la utilidad real: lo que queda para repartir menos los honorarios de la alianza, el costo del capital y la tierra que se paga.',
      cifras: [['tierra', 'v.tierra', 'mdp'], ['resultado a repartir', 'v.resultado_repartir', 'mdp']],
      mejora: 'Sube con más utilidad (mejores precios, menos costo, menos costo del dinero) o con un esquema que le dé más parte.',
      empeora: 'Baja si la utilidad baja o el esquema le da menos.',
      importa: 'Es lo que el dueño compara contra vender su terreno hoy.',
      opera: ['v:tierra', 'reparto:10', 'reparto:esquema', 'reparto:11', 'v:resultado_repartir', 'reparto:14', 'v:ventas', 'v:rend_capital', 'reparto:9', 'palanca:tasa_capital']
    },
    'v.dueno_veces': {
      corto: 'Cuántas veces recupera el dueño el valor de su tierra.',
      que: 'Cuántas veces el valor de su tierra recibe el dueño al final. Es el múltiplo sobre lo aportado.',
      como: 'Lo que recibe el dueño ÷ valor de la tierra.',
      cifras: [['el dueño recibe', 'v.dueno_recibe', 'mdp'], ['valor de la tierra', 'v.tierra', 'mdp']],
      mejora: 'Sube con más utilidad o un esquema que le dé más parte.',
      empeora: 'Baja si la utilidad baja; un valor de tierra más alto también lo baja, aunque el dueño reciba más.',
      importa: 'Es un criterio de Dirección: el dueño debe recibir por lo menos el valor de su tierra (1 vez).',
      opera: ['v:dueno_recibe', 'v:tierra']
    },
    'reparto.esquema': {
      corto: 'Cómo se reparte el resultado entre el dueño, la alianza y el capital.',
      que: 'Las reglas con que se reparte lo que deja el proyecto: si la tierra se paga antes, qué tasa cobra el capital y qué parte de la utilidad le toca a cada quien.',
      como: 'Se escoge uno de los cinco esquemas de la pestaña Reparto; cada uno trae sus partes, la tasa del capital, si paga la tierra y los honorarios de la alianza.',
      cambia: 'Cambiar de esquema mueve lo que recibe cada parte, no lo que deja el proyecto.',
      importa: 'Es el trato con el dueño de la tierra: define quién cobra primero y cuánto.',
      opera: []
    },
    'v.alianza_recibe': {
      corto: 'Lo que recibe la alianza por su trabajo y gestión.',
      que: 'Lo que recibe la alianza desarrolladora: su parte de la utilidad real más sus honorarios, si el esquema los tiene.',
      como: 'Parte de la alianza × utilidad real + honorarios de la alianza (un porcentaje de las ventas).',
      cifras: [['resultado a repartir', 'v.resultado_repartir', 'mdp']],
      mejora: 'Sube con más utilidad o un esquema que le dé más parte.',
      empeora: 'Baja si la utilidad baja.',
      importa: 'La alianza no pone dinero propio: cobra si el proyecto deja utilidad.',
      opera: ['reparto:12', 'reparto:esquema', 'v:resultado_repartir', 'reparto:14', 'v:ventas', 'v:rend_capital', 'reparto:9', 'palanca:tasa_capital', 'v:tierra', 'reparto:10']
    },

    /* ───────── lo que acomoda el visor con cifras del libro (`de`: las cifras del grafo de las que sale) ───────── */
    'visor.tierra_ventas': {
      corto: 'Qué parte de las ventas vale la tierra.',
      que: 'Qué parte de lo que se vende vale el terreno: de cada $100 de ventas, cuántos son tierra.',
      como: 'Valor de la tierra ÷ ventas. Este cociente lo saca el visor de dos cifras del libro.',
      cifras: [['valor de la tierra', 'v.tierra', 'mdp'], ['ventas', 'v.ventas', 'mdp']],
      cambia: 'Sube si la tierra vale más o si se vende menos.',
      importa: 'Ayuda a ver si el terreno pesa demasiado para lo que se puede vender en él.',
      de: ['v.tierra', 'v.ventas'],
      opera: []
    },
    'visor.vendible_construccion': {
      corto: 'Qué parte de lo construido se puede vender.',
      que: 'Qué parte de los metros construidos se vende; el resto son circulaciones, muros y áreas comunes. En el oficio se le llama eficiencia del proyecto.',
      como: 'Área vendible ÷ construcción sobre el terreno. Este cociente lo saca el visor de dos cifras del libro.',
      cifras: [['área vendible', 'datos.lamina.m2_vendibles', 'm2'], ['construcción', 'datos.lamina.m2_construidos', 'm2']],
      cambia: 'Sube con un diseño que deje más metros vendibles por cada metro construido.',
      importa: 'Cada metro construido cuesta; sólo el vendible se cobra.',
      de: ['datos.lamina.m2_vendibles', 'datos.lamina.m2_construidos'],
      opera: []
    },
    'visor.ritmo': {
      corto: 'Cuántas unidades se firman, en promedio, cada mes.',
      que: 'El ritmo de venta: cuántas unidades se firman, en promedio, en cada mes de comercialización.',
      como: 'Unidades firmadas ÷ meses con firmas. Este promedio lo saca el visor del calendario de ventas del libro.',
      cifras: [['unidades firmadas', 'flujo.total.firmas', 'u']],
      cambia: 'Sube si se vende lo mismo en menos meses.',
      importa: 'Hay que compararlo con lo que de verdad vende el mercado de la zona: un ritmo optimista adelanta todo el plan.',
      de: ['flujo.firmas'],
      opera: []
    },
    'visor.costo_total': {
      corto: 'Todo lo que cuesta el proyecto, con el terreno.',
      que: 'Lo que cuesta el proyecto completo, terreno incluido. Es el costo con terreno.',
      como: 'Costo sin terreno + valor de la tierra. Esta suma la hace el visor con dos cifras del libro; es la misma que el libro usa en la revisión para fondos.',
      cifras: [['costo sin terreno', 'v.costo_sin_tierra', 'mdp'], ['valor de la tierra', 'v.tierra', 'mdp']],
      cambia: 'Sube con más costo de obra o con una tierra más cara.',
      importa: 'Contra él se miden el margen antes de financiamiento, la aportación y la línea del banco sobre costo.',
      de: ['v.costo_sin_tierra', 'v.tierra'],
      opera: []
    },
    'visor.antes_intereses': {
      corto: 'Lo que dejan las ventas después de todos los costos, antes de intereses.',
      que: 'Lo que dejaría el proyecto antes de pagar el dinero ajeno: ventas menos el costo total con terreno. Es la utilidad antes de financiamiento.',
      como: 'Ventas − (costo sin terreno + valor de la tierra). Esta resta la hace el visor con cifras del libro; entre el costo con terreno, es el margen sobre costo.',
      cifras: [['ventas', 'v.ventas', 'mdp'], ['costo sin terreno', 'v.costo_sin_tierra', 'mdp'], ['valor de la tierra', 'v.tierra', 'mdp']],
      mejora: 'Sube con precios más altos o costos más bajos.',
      empeora: 'Baja si los precios bajan o los costos suben.',
      importa: 'Menos el costo del dinero, da la ganancia real.',
      de: ['v.ventas', 'v.costo_sin_tierra', 'v.tierra'],
      opera: []
    }
  };
  root.VisorExplica = T;
  if (typeof module !== 'undefined' && module.exports) module.exports = T;
})(typeof window !== 'undefined' ? window : globalThis);
