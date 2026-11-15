'use strict';
/**
 * Motor UNIFAMILIAR (unifamiliar.html) → foto del visor.
 *
 * Corre el `computar(vals)` real del tablero (lo corta el núcleo) con las entradas que vería el navegador al
 * abrir el caso, y sólo RENOMBRA y ACOMODA lo que regresa. No hay fórmulas financieras aquí.
 *
 * Qué tiene este motor: una casa (programa → m²), inversión desglosada (terreno, obra, proyecto, trámites,
 * imprevistos), venta, comisiones y operación, costo financiero del inversionista, utilidad, margen y un flujo
 * mensual [mes, rev, cost, equity, ret, saldo, caja] donde `ret` es el rendimiento mensual del inversionista y
 * `saldo` lo que se le debe (capital + rendimiento acumulado).
 *
 * Qué NO tiene (va en null o no se entrega, nunca en 0): banco de obra, dueño del terreno, alianza, reparto,
 * fundingGap/respaldo, preventa, revisión para fondos, candados, flujo acumulado del proyecto y el desglose
 * mensual por partida (el motor sólo da el costo mensual total).
 *
 * Correspondencias (decisiones de este módulo, para revisión):
 *   rev → cobranza · cost → egresos · equity → cap_aporta (equity de YOD, como en el contrato)
 *   ret → interes (rendimiento del inversionista, análogo al pik_fee de FLUJO)
 *   saldo → ajeno (dinero del inversionista en uso; FLUJO lo guarda en su columna `deuda`)
 *   caja → caja
 *   v.costo_dinero = costoFin (el «costo financiero» del motor)
 *   v.costo_sin_tierra = costoTotal − costoTerreno   ← la única resta, permitida por el contrato
 *   v.max_ajeno = el máximo de la serie `ajeno` (regla MAX del libro, la misma que saca armaFlujo)
 *   v.ultimo_cobro = último mes con `rev` distinto de cero en el flujo del motor
 *   producto = una casa: m² construidos × precio de zona, que es exactamente como el motor saca `venta`.
 *   flujo.total (sin serie mensual, el motor sólo da totales): obra = obra · indirectos = proyecto + trámites ·
 *     imprevistos = imprev · comisiones = comisiones + operación (la misma suma que `comisiones_total`).
 *     Así el cuadro 4 suma tierra + obra + indirectos + imprevistos + comisiones + costo financiero + utilidad = ventas.
 */

const TIPO = 'UNIFAMILIAR';

/* Clave sin deslizante que el motor guarda como variable de estado (`setControl('inEstrategia', v)`). */
const EXTRAS = { inEstrategia: (v, vals) => { vals.inEstrategia = Number(v) ? 1 : 0; } };

/* Las entradas exactas con que corre el motor, en el orden del navegador:
   valores por defecto (deslizantes + PRELLENADO), luego las in* del renglón (aplicarCasoRemoto, salta vacías),
   luego, si hay versión de escenarios_json, sus inputs como escAplicar (setControl directo; '' vale 0). */
function entradas(caso, ctx) {
  const N = ctx.nucleo, m = ctx.motor, ctrls = m.controles;
  let vals = Object.assign({}, m.defaults.vals);
  Object.keys(m.defaults.extras || {}).forEach(k => { if (EXTRAS[k]) EXTRAS[k](m.defaults.extras[k], vals); });
  vals = N.aplica(vals, N.entradasDeRenglon(caso.renglon || {}), ctrls, { modo: 'renglon', extras: EXTRAS });
  const esc = ctx.version && ctx.version.escenario;
  if (esc && esc.inputs) vals = N.aplica(vals, esc.inputs, ctrls, { modo: 'escenario', extras: EXTRAS });
  return vals;
}

function p0(r) { return (r && r.p) || {}; }

function foto(caso, ctx) {
  const N = ctx.nucleo, m = ctx.motor;
  if (!m) throw new Error('Falta el motor UNIFAMILIAR en ctx.motor.');
  const renglon = caso.renglon || {};
  const vals = entradas(caso, ctx);
  const r = m.computar(vals);
  if (!r || typeof r !== 'object') throw new Error('computar() no regresó resultado.');
  ['venta', 'costoTotal', 'utilidad'].forEach(k => { if (N.num(r[k]) === null) throw new Error('computar() no dio ' + k + '.'); });

  const flows = Array.isArray(r.flows) ? r.flows : [];
  /* El flujo como lo manda `guardar` del tablero (columnas 5 y 6 = ret y saldo). */
  const flujo = flows.map(f => [f.m, Math.round(f.rev), Math.round(f.cost), Math.round(f.equity), Math.round(f.ret), Math.round(f.saldo), Math.round(f.caja)]);
  const serie = k => flows.map(f => f[k]);
  const fl = flows.length ? N.armaFlujo({
    cobranza: serie('rev'), egresos: serie('cost'), cap_aporta: serie('equity'), interes: serie('ret'), ajeno: serie('saldo'), caja: serie('caja')
  }) : { meses: null, filas: {}, total: {} };
  /* El motor da el desglose de la inversión sólo en totales (no por mes). Van como TOTAL sin serie mensual,
     para que el cuadro 4 sume lo mismo que las ventas; nunca se inventa la serie. */
  if (flows.length) {
    const tot = pesos => N.r3(N.mdp(pesos));
    fl.total.obra = tot(r.obra);
    fl.total.indirectos = tot(N.num(r.proyecto) + N.num(p0(r).tramites));      // proyecto + trámites (acomodo)
    fl.total.imprevistos = tot(r.imprev);
    fl.total.comisiones = tot(N.num(r.comisiones) + N.num(r.operCost));       // = comisiones_total de resumenActual()
  }

  let ultimoCobro = null;
  flows.forEach(f => { if (N.num(f.rev) && Math.abs(f.rev) > 0) ultimoCobro = f.m; });
  const maxAjeno = flows.length ? Math.max(...flows.map(f => N.num(f.saldo) || 0)) : null;

  const p = r.p || {};
  const dato = valor => ({ valor: valor === null || valor === undefined ? null : valor, estado: null });
  const nombre = renglon.nombre_caso ? String(renglon.nombre_caso) : null;
  const ubic = renglon.ubicacion ? String(renglon.ubicacion) : null;

  const v = {
    ventas: N.mdp(r.venta),
    tierra: N.mdp(r.costoTerreno),
    costo_sin_tierra: N.mdp(N.num(r.costoTotal) - N.num(r.costoTerreno)),
    costo_dinero: N.mdp(r.costoFin),
    ganancia: N.mdp(r.utilidad),
    margen: N.r6(r.margen),
    capital: N.mdp(r.equityUsed),
    max_ajeno: N.mdp(maxAjeno),
    caja_cierre: N.mdp(r.cash),
    ultimo_cobro: ultimoCobro
  };

  const visor = {
    plan: { nombre, ubicacion: ubic, tipo: 'Unifamiliar' },
    v,
    datos: {
      'terreno.m2': dato(N.r3(p.sup)),
      'tierra.valor': dato(N.mdp(r.costoTerreno)),
      'lamina.m2_construidos': dato(N.r3(r.m2Const)),
      'lamina.m2_vendibles': dato(N.r3(r.m2Const))
    },
    productos: N.productos([{ nombre: 'Casa', unidades: 1, m2: r.m2Const, precio_m2: p.precioZona, ventas: r.venta, precio_unidad: r.venta }]),
    flujo: fl,
    reparto: null,
    candados: [],
    pruebas: []
  };

  return {
    entradas: { vals },
    cifras: { ventas: r.venta, costo_proyecto: r.costoTotal, utilidad: r.utilidad },
    flujo,
    visor,
    origen: 'lote'
  };
}

module.exports = { TIPO, foto, entradas };
