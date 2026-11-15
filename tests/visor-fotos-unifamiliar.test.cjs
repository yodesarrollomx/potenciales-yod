'use strict';
// Módulo UNIFAMILIAR de la foto del visor. Datos inventados; ninguna prueba abre la red ni escribe en hojas.
const test = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const N = require('../scripts/visor-fotos/nucleo.cjs');
const U = require('../scripts/visor-fotos/unifamiliar.cjs');

const M = N.motor('UNIFAMILIAR');

/* Un caso inventado: números redondos, sin relación con ningún caso real. */
const RENGLON = {
  caso_id: 'caso-de-prueba', nombre_caso: 'Casa de prueba', version: '3', ventas: '', costo_proyecto: '', utilidad: '',
  inSuperficie: '300', inPrecioM2Terreno: '4000', inNiveles: '2', inM2Social: '80', inM2RecPpal: '30', inNRecSec: '2', inM2RecSec: '15',
  inNBanos: '3', inM2Bano: '5', inM2Servicio: '10', inM2Terraza: '15', inPctCirc: '7', inM2Cochera: '30',
  inCostoM2Obra: '15000', inProyectoM2: '900', inTramitesFijo: '80000', inImprevistosPct: '3', inPrecioM2Zona: '26000',
  inComLeadsPct: '1', inComCierrePct: '4', inOperacionPct: '2', inMesesObra: '14', inMesesVenta: '4',
  inInversionAbierta: '900000', inRetornoInvPct: '18', inEstrategia: '1', inHorizonte: '', escenarios_json: ''
};
const caso = r => ({ tipo: 'UNIFAMILIAR', renglon: Object.assign({}, RENGLON, r || {}) });
const ctx = (c, version) => ({ nucleo: N, motor: M, calculado: '2026-01-01 10:00', version: version || N.versionesDeRenglon(c.renglon)[0] });

/* resumenActual() real del tablero, con `state` = lo que calculó el motor. */
function resumenReal(state) {
  const fuente = N.cortaFuncion(M.html, 'resumenActual');
  const c = vm.createContext({ state, calculate: () => state });
  vm.runInContext(fuente + ';globalThis.__r=resumenActual();', c);
  return c.__r;
}

test('las cifras son las de resumenActual() del tablero', () => {
  const c = caso(), x = ctx(c), f = U.foto(c, x);
  const r = resumenReal(M.computar(f.entradas.vals));
  assert.equal(Math.round(f.cifras.ventas), r.ventas);
  assert.equal(Math.round(f.cifras.costo_proyecto), r.costo_proyecto);
  assert.equal(Math.round(f.cifras.utilidad), r.utilidad);
  assert.equal(f.visor.v.ventas, N.mdp(f.cifras.ventas));
  assert.equal(f.visor.v.ganancia, N.mdp(f.cifras.utilidad));
});

test('entradas: in* del renglón encima de los valores por defecto; vacías se saltan; inEstrategia como estado', () => {
  const c = caso(), f = U.foto(c, ctx(c));
  assert.equal(f.entradas.vals.inSuperficie, 300);
  assert.equal(f.entradas.vals.inEstrategia, 1);
  assert.equal(f.entradas.vals.inHorizonte, M.defaults.vals.inHorizonte);    // vacía: se queda la de fábrica
});

test('una versión de escenarios_json aplica sus inputs como escAplicar', () => {
  const esc = [{ id: 'a1', nombre: 'Base', esBase: true, inputs: { inPrecioM2Zona: 26000 } }, { id: 'b2', nombre: 'Precio bajo', activo: true, inputs: { inPrecioM2Zona: 22000 } }];
  const c = caso({ escenarios_json: JSON.stringify(esc) });
  const vs = N.versionesDeRenglon(c.renglon);
  const a = U.foto(c, ctx(c, vs[0])), b = U.foto(c, ctx(c, vs[1]));
  assert.equal(a.entradas.vals.inPrecioM2Zona, 26000);
  assert.equal(b.entradas.vals.inPrecioM2Zona, 22000);
  assert.ok(b.cifras.ventas < a.cifras.ventas);
});

test('la forma pasa N.valida y el renglón de PPP_VISOR se arma', () => {
  const c = caso(), f = U.foto(c, ctx(c));
  assert.deepEqual(N.valida(N.completa(f.visor)), []);
  const { fotos, errores } = N.tomaFotos(U, c, { motor: M, calculado: '2026-01-01 10:00' });
  assert.deepEqual(errores, []);
  assert.equal(fotos.length, 1);
  assert.equal(fotos[0].estado, 'lista');                 // sin resumen guardado: «sin referencia»
  assert.equal(fotos[0].elegida, 'sí');
  assert.equal(JSON.parse(fotos[0].conciliacion).ok, null);
});

test('lo que el motor no produce va en null o vacío, nunca en 0', () => {
  const c = caso(), v = N.completa(U.foto(c, ctx(c)).visor);
  ['dueno_aporta', 'dueno_recibe', 'dueno_veces', 'dueno_meses', 'alianza_recibe', 'inversion_recibe', 'banco_max', 'respaldo',
    'rend_capital', 'resultado_repartir', 'obra_inicio', 'fin_obra', 'mes_saldos', 'mes_reparto', 'pagos_obra'].forEach(k => assert.equal(v.v[k], null, k));
  Object.keys(v.v).filter(k => /^(rv_|ck_)/.test(k)).forEach(k => assert.equal(v.v[k], null, k));
  assert.equal(v.reparto, null);
  assert.deepEqual(v.candados, []);
  assert.deepEqual(v.pruebas, []);
  ['saldo_banco', 'disposicion', 'pago_banco', 'respaldo', 'firmas', 'flujo_acum', 'obra', 'comisiones'].forEach(k => assert.ok(!(k in v.flujo.filas), k));
  ['cob.enganche', 'din.tasa_capital', 'din.tiie', 'costo.comision'].forEach(k => assert.equal(v.datos[k].valor, null, k));
});

test('conciliación contra el resumen y FLUJO del propio motor: lista; con utilidad alterada: propuesta', () => {
  const c0 = caso(), f = U.foto(c0, ctx(c0));
  const resumen = { ventas: Math.round(f.cifras.ventas), costo_proyecto: Math.round(f.cifras.costo_proyecto), utilidad: Math.round(f.cifras.utilidad) };
  const c = Object.assign(caso(resumen), { flujo: f.flujo, flujo_version: 3 });
  const bien = N.tomaFotos(U, c, { motor: M, calculado: '2026-01-01 10:00' }).fotos[0];
  assert.equal(bien.estado, 'lista');
  assert.equal(JSON.parse(bien.conciliacion).flujo.ok, true);
  const mal = N.tomaFotos(U, Object.assign({}, c, { renglon: Object.assign({}, c.renglon, { utilidad: String(resumen.utilidad + 1e6) }) }), { motor: M, calculado: '2026-01-01 10:00' }).fotos[0];
  assert.equal(mal.estado, 'propuesta');
  assert.equal(mal.elegida, '');
});

test('el desglose de costos va como total sin serie y suma las ventas con tierra, costo financiero y utilidad', () => {
  const c = caso(), f = U.foto(c, ctx(c)), v = f.visor.v, t = f.visor.flujo.total;
  ['obra', 'indirectos', 'imprevistos', 'comisiones'].forEach(k => { assert.equal(typeof t[k], 'number', k); assert.ok(!(k in f.visor.flujo.filas), k); });
  const suma = v.tierra + t.obra + t.indirectos + t.imprevistos + t.comisiones + v.costo_dinero + v.ganancia;
  assert.ok(Math.abs(suma - v.ventas) < 0.005, suma + ' vs ' + v.ventas);
  assert.ok(Math.abs(v.tierra + v.costo_sin_tierra - N.mdp(f.cifras.costo_proyecto)) < 1e-5);
});

test('el flujo del visor viene del flujo del motor (pesos → MDP) y aguanta pérdida', () => {
  const c = caso({ inPrecioM2Zona: '12000' }), f = U.foto(c, ctx(c));
  assert.ok(f.cifras.utilidad < 0);
  assert.ok(f.visor.v.margen < 0);
  assert.equal(f.visor.flujo.meses, f.flujo.length);
  assert.equal(f.visor.flujo.filas.cobranza[f.flujo.length - 1], N.r3(f.flujo[f.flujo.length - 1][1] / 1e6));
  assert.deepEqual(N.valida(N.completa(f.visor)), []);
});
