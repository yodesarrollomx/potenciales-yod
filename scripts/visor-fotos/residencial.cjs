'use strict';
/**
 * Módulo de la foto del visor para el motor RESIDENCIAL (residencial.html · lotes residenciales).
 *
 * Corre `computar(vals, viv)` del HTML (cortado por el núcleo) con las mismas entradas que vería el navegador
 * al abrir el caso y sólo RENOMBRA y ACOMODA lo que el motor ya da. Ninguna fórmula financiera nueva.
 *
 * Secuencia de entradas (la de `aplicarCasoRemoto` → `escDesdeJson` → `escAplicar` del HTML):
 *   1. deslizantes por defecto del HTML (PRELLENADO saneado por el núcleo);
 *   2. `resetNuevos()` (NUEVOS_23SEP a DEFAULTS) y columnas `in*` no vacías del renglón;
 *   3. si hay escenarios: `resetNuevos()` otra vez, `setControl` de cada `inputs` (aquí '' vale 0) y
 *      `viv = viviendaSanear(e.vivienda)`; si no hay escenarios: `escInicial` → `viv = viviendaDefault()`.
 *
 * Modo de reparto (cambio del 23-sep): `inInteresesDev` = 1 es el modo histórico (el % del dueño corre antes
 * de los costos financieros y el crédito lo absorbe sólo el desarrollador). Se respeta tal como lo trae cada
 * versión guardada: si el renglón o el escenario no lo traen, el navegador lo deja en su DEFAULT (0, modo
 * nuevo) y la foto también. Ventas, costo del proyecto y utilidad (lo que se concilia) no dependen del modo;
 * sólo el reparto (dueño / desarrollador).
 *
 * Restas y selecciones que hace este módulo (las únicas, anotadas como pide el contrato):
 *   · v.costo_sin_tierra = costoProyecto − tierraPago (la tierra que el proyecto paga en efectivo es la única
 *     tierra dentro de costoProyecto; la aportada no es costo).
 *   · datos['tierra.valor']: el motor no da el valor total de la tierra como una sola cifra. Se pone
 *     tierraAportada si no hay tierra pagada, tierraPago si no hay aportada, y null si hay de las dos.
 */

const TIPO = 'RESIDENCIAL';
const NUEVOS_23SEP = ['inDonacionPagada', 'inPctCredito', 'inHonorarioPct', 'inInteresesDev'];   // igual que el HTML
const TIPO_PLAN = 'Lotes residenciales';      // identidad del motor (claseTipo del visor → dibujo de lotes)

function valsIniciales(motor) {
  return Object.assign({}, motor.defaults.vals);
}
/* `resetNuevos()` del HTML: setControl(id, DEFAULTS[id]) para los cuatro controles del 23-sep. */
function resetNuevos(N, vals, motor) {
  NUEVOS_23SEP.forEach(id => { if (motor.defaults.crudos[id] !== undefined) N.fija(vals, motor.controles, id, motor.defaults.crudos[id]); });
  return vals;
}

/* Las entradas exactas de una versión, como las aplica el navegador. */
function entradas(caso, ctx) {
  const N = ctx.nucleo, motor = ctx.motor, ctrls = motor.controles, renglon = (caso && caso.renglon) || {};
  let vals = resetNuevos(N, valsIniciales(motor), motor);
  vals = N.aplica(vals, N.entradasDeRenglon(renglon), ctrls, { modo: 'renglon' });
  let viv;
  const esc = ctx.version && ctx.version.escenario;
  if (esc) {
    vals = resetNuevos(N, vals, motor);
    vals = N.aplica(vals, esc.inputs || {}, ctrls, { modo: 'escenario' });
    viv = motor.contexto.viviendaSanear(esc.vivienda);
  } else {
    viv = motor.contexto.viviendaDefault();
  }
  return { vals, viv: JSON.parse(JSON.stringify(viv)) };
}

/* El renglón de flujo como lo manda `guardar` del motor. */
function flujoGuardar(r) {
  return (r.flows || []).map(f => [f.m, Math.round(f.rev), Math.round(f.cost), Math.round(f.equity), Math.round(f.pik + f.fee), Math.round(f.debt), Math.round(f.caja)]);
}

function productosDe(N, r) {
  const lista = [];
  const p = r.p || {};
  if (r.nLotesPel > 0) {
    /* Un solo precio sólo si todos los lotes van a un mismo nivel (todo preventa o todo precio final). */
    const unPrecio = r.nPrev === 0 ? 'final' : (r.nFinal === 0 ? 'preventa' : null);
    lista.push({
      nombre: 'Lotes', unidades: r.nLotesPel,
      m2: r.vivActiva ? null : r.m2Lotes,               // sin vivienda, todos los lotes son pelones
      precio_m2: unPrecio === 'final' ? p.preVenta : unPrecio === 'preventa' ? p.prePreventa : null,
      precio_unidad: unPrecio === 'final' ? r.precioFinal : unPrecio === 'preventa' ? r.precioPrev : null,
      ventas: r.ingLotesBase
    });
  }
  if (r.vivActiva && r.nLotesViv > 0) {
    lista.push({ nombre: 'Lotes con vivienda', unidades: r.nLotesViv, m2: null, precio_m2: null, precio_unidad: r.precioPromedioViv, ventas: r.ingViv });
  }
  if (r.comercial > 0) {
    lista.push({ nombre: 'Comercial', unidades: null, m2: r.comercial, precio_m2: p.preCom, precio_unidad: null, ventas: r.ingCom });
  }
  return N.productos(lista);
}

function datoDe(valor) { return { valor: valor === undefined ? null : valor, estado: null }; }

/* Traduce el resultado de computar() a la forma del visor. */
function traduce(N, r, renglon) {
  const p = r.p || {}, mdp = N.mdp;
  const tierraValor = !(r.tierraPago > 0) ? r.tierraAportada : (!(r.tierraAportada > 0) ? r.tierraPago : null);
  const v = {
    /* 1 · terreno */
    tierra: mdp(r.tierraPago),
    /* 3 · tiempo (meses, base 1). La urbanización arranca en el mes 1 del calendario del motor. */
    obra_inicio: 1,
    fin_obra: N.num(r.mesesUrb),
    ultimo_cobro: N.num(r.colaCobranza),
    mes_reparto: N.num(r.totalMonths),
    banco_mes: r.peak > 0 ? N.num(r.peakMonth) : null,
    /* 4 · costo y ganancia */
    ventas: mdp(r.ingresos),
    costo_sin_tierra: mdp(N.num(r.costoProyecto) === null ? null : r.costoProyecto - r.tierraPago),
    costo_dinero: mdp(N.num(r.interest) === null ? null : r.interest + r.feeDebt),
    ganancia: mdp(r.utilidadFinal),
    margen: N.r6(r.margenFinal),
    /* 5 · dinero */
    banco_max: mdp(r.peak),
    capital: mdp(r.equityUsed),
    respaldo: mdp(r.fundingGap),
    caja_cierre: mdp(r.cash),
    /* 6 · reparto */
    dueno_aporta: mdp(r.tierraAportada),
    dueno_recibe: mdp(r.ownerTotal),
    alianza_recibe: mdp(r.devDist),
    resultado_repartir: mdp(r.utilidadRepartible)
  };
  const datos = {
    'terreno.m2': datoDe(N.num(p.sup)),
    'tierra.valor': datoDe(mdp(tierraValor)),
    'lamina.m2_vendibles': datoDe(N.num(r.vendibleBruto)),
    'cob.enganche': datoDe(N.r6(p.eng)),
    'din.apertura': datoDe(N.r6(p.feeDeuda))
  };
  const fl = r.flows || [];
  const flujo = N.armaFlujo({
    cobranza: fl.map(f => f.rev),
    egresos: fl.map(f => f.cost),
    cap_aporta: fl.map(f => f.equity),
    interes: fl.map(f => f.pik),
    apertura: fl.map(f => f.fee),
    saldo_banco: fl.map(f => f.debt),
    caja: fl.map(f => f.caja)
  }, { mesReparto: r.totalMonths });
  const reparto = {
    numero: null,
    esquema: p.interesesSoloDev ? 'Histórico: el crédito lo absorbe el desarrollador' : 'Intereses antes del reparto (23-sep)',
    tasa_capital: null,
    paga_tierra: r.tierraAportada > 0 && p.repagoPct > 0,
    parte_dueno: N.r6(p.pctDueno),
    parte_alianza: null,            // el motor no la calcula: el desarrollador se lleva el remanente de la caja
    parte_capital: null,
    honorarios_pct: N.r6(p.honorario)
  };
  return {
    plan: { nombre: renglon.nombre_caso ? String(renglon.nombre_caso) : null, ubicacion: renglon.ubicacion ? String(renglon.ubicacion) : null, tipo: TIPO_PLAN },
    v, datos, productos: productosDe(N, r), flujo, reparto, candados: [], pruebas: []
  };
}

function foto(caso, ctx) {
  const N = ctx.nucleo, motor = ctx.motor;
  if (!motor) throw new Error('Falta el motor RESIDENCIAL en ctx.motor.');
  const e = entradas(caso, ctx);
  const r = motor.computar(e.vals, e.viv);
  if (!r || N.num(r.ingresos) === null) throw new Error('El motor no devolvió resultados para esta versión.');
  return {
    entradas: e,
    cifras: { ventas: r.ingresos, costo_proyecto: r.costoProyecto, utilidad: r.utilidadFinal },
    flujo: flujoGuardar(r),
    visor: traduce(N, r, (caso && caso.renglon) || {}),
    origen: 'lote',
    resultado: r                    // para el reporte de conciliación; el núcleo lo ignora
  };
}

module.exports = { TIPO, NUEVOS_23SEP, entradas, flujoGuardar, traduce, foto };
