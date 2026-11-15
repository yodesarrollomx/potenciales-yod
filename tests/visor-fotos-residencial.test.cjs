'use strict';
// Módulo RESIDENCIAL de la foto del visor. Datos inventados (caso-de-prueba); sin red ni hojas.
const test = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const N = require('../scripts/visor-fotos/nucleo.cjs');
const R = require('../scripts/visor-fotos/residencial.cjs');

const motor = N.motor('RESIDENCIAL');

/* Un renglón inventado: columnas in* (versión activa), una columna vieja sin deslizante y dos versiones;
   la segunda con vivienda y en modo histórico de reparto. */
const entradasBase = {
  inSuperficie: 20000, inFrente: 100, inFondo: 250, inM2Lote: 160, inPrecioM2Preventa: 2000, inPrecioM2Venta: 2600,
  inPctLotesPreventa: 30, inComercialM2: 900, inPrecioM2Comercial: 3500, inUrbM2: 1200, inValorTierraM2: 500,
  inAporteTierra: 100, inPctDueno: 35, inEquity: 3000000, inMaxDeuda: 20000000, inPIK: 15, inLotesMes: 4
};
const vivienda = {
  activo: true,
  tipologias: [{ id: 'tA', nombre: 'Tipo A', niveles: 1, m2Constr: 50, mezclaPct: 60, costoM2: 7000, precioModo: 'total', precioVal: 800000, mesesConstr: 4 },
    { id: 'tB', nombre: 'Tipo B', niveles: 2, m2Constr: 70, mezclaPct: 40, costoM2: 7500, precioModo: 'm2', precioVal: 14000, mesesConstr: 5 }]
};
const renglon = Object.assign({
  caso_id: 'caso-de-prueba', nombre_caso: 'Caso de prueba', version: '2', inLotes: 77, inInteresesDev: 1,
  escenarios_json: JSON.stringify([
    { id: 'base', nombre: 'Base', esBase: true, activo: false, inputs: Object.assign({}, entradasBase) },
    { id: 'conviv', nombre: 'Con vivienda', esBase: false, activo: true, inputs: Object.assign({}, entradasBase, { inPctViv: 50, inInteresesDev: 1, inPctCredito: 10 }), vivienda }
  ])
}, entradasBase);

/* resumenActual() del HTML, cortada tal cual, sobre un `state` ya calculado. */
function resumenDe(r) {
  const ctx = vm.createContext({ state: r, calculate: () => r });
  vm.runInContext(N.cortaFuncion(motor.html, 'resumenActual') + '\n;globalThis.__s=JSON.stringify(resumenActual());', ctx);
  return JSON.parse(ctx.__s);
}
function fotoDe(ren, version) {
  const caso = { tipo: 'RESIDENCIAL', renglon: ren };
  return R.foto(caso, { nucleo: N, motor, version, calculado: '2026-01-01 00:00' });
}

test('las cifras son las de resumenActual() del motor, en cada versión', () => {
  const versiones = N.versionesDeRenglon(renglon);
  assert.equal(versiones.length, 2);
  versiones.forEach(v => {
    const f = fotoDe(renglon, v), s = resumenDe(f.resultado);
    assert.equal(Math.round(f.cifras.ventas), s.ventas);
    assert.equal(Math.round(f.cifras.costo_proyecto), s.costo_proyecto);
    assert.equal(Math.round(f.cifras.utilidad), s.utilidad);
    assert.ok(f.cifras.ventas > 0);
  });
});

test('la forma del visor pasa N.valida y el núcleo arma el renglón de PPP_VISOR', () => {
  const r = N.tomaFotos(R, { tipo: 'RESIDENCIAL', renglon }, { motor, calculado: '2026-01-01 00:00' });
  assert.deepEqual(r.errores, []);
  assert.equal(r.fotos.length, 2);
  r.fotos.forEach(f => assert.deepEqual(N.valida(JSON.parse(f.visor_json)), []));
  N.versionesDeRenglon(renglon).forEach(v => assert.deepEqual(N.valida(N.completa(fotoDe(renglon, v).visor)), []));
});

test('nada que el motor no produce va en cero', () => {
  const v = N.versionesDeRenglon(renglon)[1];
  const f = fotoDe(renglon, v), vis = N.completa(f.visor);
  Object.keys(vis.v).filter(k => /^(rv_|ck_)/.test(k)).forEach(k => assert.equal(vis.v[k], null, k));
  ['max_ajeno', 'dueno_veces', 'dueno_meses', 'inversion_recibe', 'rend_capital', 'mes_saldos', 'capital_mes', 'respaldo_mes'].forEach(k => assert.equal(vis.v[k], null, k));
  assert.equal(vis.reparto.parte_alianza, null);
  assert.equal(vis.datos['lamina.m2_construidos'].valor, null);
  const conViv = vis.productos.find(p => p.nombre === 'Lotes con vivienda');
  assert.ok(conViv && conViv.unidades > 0 && conViv.ventas > 0);
  assert.equal(conViv.m2, null);
  vis.productos.forEach(p => Object.keys(p).forEach(k => assert.notEqual(p[k], 0, p.nombre + '.' + k)));
  assert.equal(vis.flujo.filas.respaldo, undefined);          // el motor no da el faltante por mes
  assert.equal(vis.flujo.filas.firmas, undefined);
  assert.equal(vis.plan.edad, null);
  assert.deepEqual(vis.candados, []);
});

test('cifras y unidades: MDP, fracciones y meses como pide el visor', () => {
  const f = fotoDe(renglon, N.versionesDeRenglon(renglon)[0]), r = f.resultado, v = f.visor.v;
  assert.equal(v.ventas, N.mdp(r.ingresos));
  assert.equal(v.ganancia, N.mdp(r.utilidadFinal));
  assert.equal(v.costo_sin_tierra, N.mdp(r.costoProyecto - r.tierraPago));
  assert.equal(v.costo_dinero, N.mdp(r.interest + r.feeDebt));
  assert.equal(v.margen, N.r6(r.margenFinal));
  assert.equal(v.fin_obra, r.mesesUrb);
  assert.equal(v.dueno_recibe, N.mdp(r.ownerTotal));
  assert.equal(v.alianza_recibe, N.mdp(r.devDist));
  assert.equal(f.visor.flujo.meses, r.totalMonths);
  // el total es la suma de los meses ya pasados a MDP (regla del libro): difiere de la suma cruda en el redondeo
  assert.ok(Math.abs(f.visor.flujo.total.cobranza - r.flows.reduce((s, x) => s + x.rev, 0) / 1e6) <= 0.0005 * r.totalMonths);
  assert.deepEqual(f.flujo[0], [1, Math.round(r.flows[0].rev), Math.round(r.flows[0].cost), Math.round(r.flows[0].equity), Math.round(r.flows[0].pik + r.flows[0].fee), Math.round(r.flows[0].debt), Math.round(r.flows[0].caja)]);
});

test('modo de reparto: se respeta el de cada versión; sin él, resetNuevos lo deja en el modo nuevo', () => {
  const [base, conviv] = N.versionesDeRenglon(renglon);
  const fb = fotoDe(renglon, base), fv = fotoDe(renglon, conviv);
  assert.equal(fb.entradas.vals.inInteresesDev, 0);            // el renglón trae 1, pero la versión no: lo reinicia
  assert.equal(fv.entradas.vals.inInteresesDev, 1);
  assert.match(fv.visor.reparto.esquema, /Histórico/);
  assert.match(fb.visor.reparto.esquema, /23-sep/);
  assert.equal(fb.entradas.viv.activo, false);
  assert.equal(fv.entradas.viv.activo, true);
  // sin escenarios, la única versión corre con las columnas in* (aquí el modo histórico del renglón) y sin vivienda
  const solo = Object.assign({}, renglon, { escenarios_json: '' });
  const fs = fotoDe(solo, N.versionesDeRenglon(solo)[0]);
  assert.equal(fs.entradas.vals.inInteresesDev, 1);
  assert.deepEqual(fs.entradas.viv, JSON.parse(JSON.stringify(motor.contexto.viviendaDefault())));
});

test('la versión activa se concilia contra el resumen del renglón; las otras quedan sin referencia', () => {
  const v = N.versionesDeRenglon(renglon)[1];
  const s = resumenDe(fotoDe(renglon, v).resultado);
  const ren = Object.assign({}, renglon, { ventas: String(s.ventas), costo_proyecto: String(s.costo_proyecto), utilidad: String(s.utilidad) });
  let r = N.tomaFotos(R, { tipo: 'RESIDENCIAL', renglon: ren }, { motor, calculado: '2026-01-01 00:00' });
  assert.deepEqual(r.fotos.map(f => f.estado), ['lista', 'lista']);
  assert.equal(JSON.parse(r.fotos[0].conciliacion).nota, N.SIN_REFERENCIA);
  assert.equal(JSON.parse(r.fotos[1].conciliacion).ok, true);
  const mal = Object.assign({}, ren, { utilidad: String(Math.round(s.utilidad * 1.02)) });
  r = N.tomaFotos(R, { tipo: 'RESIDENCIAL', renglon: mal }, { motor, calculado: '2026-01-01 00:00' });
  assert.equal(r.fotos[1].estado, 'propuesta');
});
