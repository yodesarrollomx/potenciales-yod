'use strict';
/**
 * Módulo del motor MACROLOTES (macrolotes.html) para «la foto» del visor. Contrato: docs/visor-ppp1.md.
 *
 * Corre el `computar(vals)` real del tablero (lo corta el núcleo) con las entradas que vería el navegador y
 * sólo renombra y acomoda lo que el motor ya da. No hay fórmulas financieras aquí. Las únicas operaciones
 * son cambios de unidad del núcleo (pesos → MDP, % → fracción), el paso de índice a mes (`buildStart` es el
 * índice 0 → mes 1) y una resta permitida por el contrato: `costo_sin_tierra` = costoProyecto − tierraPago.
 *
 * Particularidades del motor:
 *  - Cuatro variables de estado que no son deslizantes: `inGateAgua`, `inModoReparto`, `inEstrNaves`, `inEstrCom`
 *    (y el alias viejo `__inEstrNavesViejo`). Se fijan como lo hace `setControl` del HTML.
 *  - `computar` recibe sólo lo que arma `inputValues()`: los deslizantes más esas cuatro. Las claves de
 *    PRELLENADO que no son deslizantes (`inPuPtar`, `inVarPrecios`…) no llegan al motor en el navegador y
 *    tampoco aquí.
 *  - El catálogo remoto (`aplicarCatalogo`) sólo reescribe PRELLENADO, umbrales, ayudas y giros DESPUÉS de que
 *    los deslizantes ya tomaron sus valores; `computar` no lee nada de eso. La foto usa el respaldo del HTML.
 *  - Versiones: en el navegador, al cambiar de versión `escAplicar` pone las entradas de la nueva ENCIMA de las
 *    de la activa (las versiones viejas guardaron menos claves). Por eso una versión que no es la activa se
 *    corre sobre: renglón (in*) → versión activa → esa versión.
 *  - No hay capital aparte del dueño: la aportación (`equity`) es de la alianza desarrolladora y regresa
 *    dentro de `devDist`. Por eso `v.capital` y `v.inversion_recibe` van vacíos (el visor pintaría un
 *    «capital que recibe» inventado); la aportación mensual sí va en el flujo (`cap_aporta`).
 */

const TIPO = 'MACROLOTES';

/* setControl del HTML para las variables que no son deslizantes. */
const ENTERO_0_2 = v => Math.max(0, Math.min(2, Math.round(Number(v) || 0)));
const BANDERA = v => (Number(v) ? 1 : 0);
const EXTRAS = {
  inGateAgua: (v, vals) => { vals.inGateAgua = ENTERO_0_2(v); },
  inModoReparto: (v, vals) => { vals.inModoReparto = BANDERA(v); },
  inEstrNaves: (v, vals) => { vals.inEstrNaves = ENTERO_0_2(v); },
  __inEstrNavesViejo: (v, vals) => { vals.inEstrNaves = BANDERA(v); },
  inEstrCom: (v, vals) => { vals.inEstrCom = BANDERA(v); }
};
const ESTADO = ['inGateAgua', 'inModoReparto', 'inEstrNaves', 'inEstrCom'];

/* Las entradas exactas con que el navegador llamaría a computar(inputValues()) para esta versión. */
function entradas(caso, ctx) {
  const N = ctx.nucleo, motor = ctx.motor, renglon = (caso && caso.renglon) || {}, ctrls = motor.controles;
  let vals = Object.assign({}, motor.defaults.vals);
  ESTADO.forEach(k => { EXTRAS[k](motor.defaults.extras[k], vals); });          // let gateAgua=PRELLENADO.inGateAgua…
  vals = N.aplica(vals, N.entradasDeRenglon(renglon), ctrls, { modo: 'renglon', extras: EXTRAS });
  const ver = ctx.version || {};
  if (ver.escenario) {
    if (!ver.activa) {
      const act = N.leeEscenarios(renglon.escenarios_json).activo;
      if (act && act.inputs) vals = N.aplica(vals, act.inputs, ctrls, { modo: 'escenario', extras: EXTRAS });
    }
    vals = N.aplica(vals, ver.escenario.inputs || {}, ctrls, { modo: 'escenario', extras: EXTRAS });
  }
  /* inputValues(): sólo deslizantes + las cuatro variables de estado. */
  const out = {};
  Object.keys(ctrls).forEach(id => { out[id] = vals[id]; });
  ESTADO.forEach(k => { out[k] = vals[k]; });
  return out;
}

function nulo(x) { return x === undefined || x === null || (typeof x === 'number' && !Number.isFinite(x)) ? null : x; }

/* Cuadro 2: un producto por segmento, con su modo (venta, renta y salida, sólo lote, breña). Precio por m²
   sólo cuando es venta por m²; en renta el motor cobra $/m²/mes y no hay precio de venta por m². */
function productosDe(r) {
  const p = r.p || {}, lista = [];
  if (r.rentaN) lista.push({ nombre: 'Naves · renta y venta del activo', unidades: r.nNaves, m2: r.m2NavesConst, precio_m2: null, ventas: r.ingNaves });
  else if (r.loteNaves) lista.push({ nombre: 'Naves · sólo lote urbanizado', unidades: r.nNavesLote, m2: r.m2NavesLoteVend, precio_m2: p.preNaveLote, ventas: r.ingNaves });
  else lista.push({ nombre: 'Naves', unidades: r.nNaves, m2: r.m2NavesConst, precio_m2: p.preNave, ventas: r.ingNaves });
  lista.push({ nombre: 'Macrolotes', unidades: r.nMacro, m2: r.m2MacroVend, precio_m2: p.preMacro, ventas: r.ingMacro });
  if (r.rentaC) lista.push({ nombre: 'Comercial · renta y venta del activo', unidades: r.nCom, m2: r.m2ComVend, precio_m2: null, ventas: r.ingCom });
  else lista.push({ nombre: 'Lotes comerciales', unidades: r.nCom, m2: r.m2ComVend, precio_m2: p.preCom, ventas: r.ingCom });
  if (r.brena) lista.push({ nombre: 'Vivienda · macroparcela en breña', unidades: r.uViv, m2: r.terrViv, precio_m2: p.preVivBrena, ventas: r.ingViv });
  else lista.push({ nombre: 'Lotes de vivienda', unidades: r.nViv, m2: r.m2VivVend, precio_m2: p.preVivLote, ventas: r.ingViv });
  return lista;
}

/* Cuadro 6: el esquema que el motor aplica (V17). En modo 1 el % del dueño es sobre cada venta cobrada, no
   sobre la utilidad: no se pone en `parte_dueno` para que el visor no lo lea como parte de la utilidad. */
function repartoDe(r, N) {
  const p = r.p || {};
  const modo1 = Number(p.modoReparto) === 1;
  return {
    numero: null,
    esquema: modo1
      ? 'Dueño: ' + N.r3((p.pctDuenoVenta || 0) * 100) + ' % de cada venta cobrada'
      : 'Dueño: ' + N.r3((p.pctDueno || 0) * 100) + ' % de la utilidad al cierre',
    tasa_capital: null,
    paga_tierra: (Number(r.tierraPago) || 0) > 0,
    parte_dueno: modo1 ? null : N.r6(p.pctDueno),
    parte_alianza: null,
    parte_capital: null,
    honorarios_pct: null
  };
}

function foto(caso, ctx) {
  const N = ctx.nucleo, motor = ctx.motor;
  if (!motor) throw new Error('Falta el motor de MACROLOTES en ctx.motor.');
  const renglon = (caso && caso.renglon) || {};
  const vals = entradas(caso, ctx);
  const r = motor.computar(vals);
  if (!r || typeof r !== 'object' || !Array.isArray(r.flows)) throw new Error('computar() no devolvió resultados.');
  if (!r.valido) throw new Error('El cuadro no cierra (cesiones ≤ 100 % y mezcla = 100 %): el tablero no deja guardar esta versión.');

  const M = N.mdp, flows = r.flows;
  const serie = k => flows.map(f => f[k]);
  const flujo = N.armaFlujo({
    cobranza: serie('rev'), egresos: serie('cost'), cap_aporta: serie('equity'),
    interes: serie('pik'), saldo_banco: serie('debt'), caja: serie('caja')
  }, { mesReparto: r.totalMonths });

  const costoSinTierra = nulo(r.costoProyecto) === null || nulo(r.tierraPago) === null ? null : r.costoProyecto - r.tierraPago;   // resta permitida por el contrato
  const dato = valor => ({ valor: nulo(valor), estado: null });
  const lote = !!r.loteNaves;
  const visor = {
    plan: { nombre: renglon.nombre_caso ? String(renglon.nombre_caso) : null, ubicacion: renglon.ubicacion ? String(renglon.ubicacion) : null },
    v: {
      tierra: M(r.tierraPago),
      ventas: M(r.ingresos), costo_sin_tierra: M(costoSinTierra), costo_dinero: nulo(r.interest) === null || nulo(r.feeDebt) === null ? null : M(r.interest + r.feeDebt),
      ganancia: M(r.utilidadFinal), margen: N.r6(r.margenFinal),
      obra_inicio: nulo(r.buildStart) === null ? null : r.buildStart + 1,          // índice 0 → mes 1
      fin_obra: nulo(r.buildFinish),                                               // fin de la urbanización (mesesUrb)
      ultimo_cobro: nulo(r.colaMes) || null,                                       // cola de cobranza del motor
      mes_reparto: nulo(r.totalMonths),                                            // el motor reparte en el último mes
      banco_max: M(r.peak), respaldo: M(r.fundingGap), caja_cierre: M(r.cash),
      dueno_recibe: M(r.ownerTotal), alianza_recibe: M(r.devDist)
    },
    datos: {
      'terreno.m2': dato(N.r3(r.superficie)),
      'tierra.valor': dato(M(r.tierraPago)),
      'lamina.m2_construidos': dato(lote ? null : N.r3(r.m2NavesConst)),          // lo que construye el desarrollador: naves
      'lamina.m2_vendibles': dato(N.r3(r.vendible)),
      'costo.comision': dato(N.r6(r.p && r.p.comisionPct))
    },
    productos: N.productos(productosDe(r)),
    flujo,
    reparto: repartoDe(r, N),
    candados: [], pruebas: []
  };

  return {
    entradas: { vals },
    cifras: { ventas: r.ingresos, costo_proyecto: r.costoProyecto, utilidad: r.utilidadFinal },
    flujo: flows.map(f => [f.m, Math.round(f.rev), Math.round(f.cost), Math.round(f.equity), Math.round(f.pik + f.fee), Math.round(f.debt), Math.round(f.caja)]),
    visor,
    origen: 'lote'
  };
}

module.exports = { TIPO, foto, entradas, EXTRAS };
