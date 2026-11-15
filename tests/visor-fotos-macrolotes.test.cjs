'use strict';
// Módulo MACROLOTES de la foto del visor. Datos inventados; ninguna prueba abre la red ni escribe en hojas.
const test = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const N = require('../scripts/visor-fotos/nucleo.cjs');
const M = require('../scripts/visor-fotos/macrolotes.cjs');

const motor = N.motor('MACROLOTES');

/* Un caso inventado: 20 ha, mezcla naves/macro/comercial, con deuda y tres versiones. */
const base = { inFrente: 400, inFondo: 500, inMixNaves: 40, inMixMacro: 40, inMixCom: 20, inMixViv: 0, inPreNave: 12000, inPreMacro: 2000, inEquity: 10000000, inPctDueno: 20, inAporteTierra: 100 };
const versiones = [
  { id: 'vbase', nombre: 'Base de prueba', esBase: true, activo: false, inputs: Object.assign({}, base, { inGateAgua: 0, inModoReparto: 0, inEstrNaves: 0, inEstrCom: 0 }) },
  { id: 'vrenta', nombre: 'Renta de prueba', esBase: false, activo: true, inputs: Object.assign({}, base, { inPreMacro: 2400, inGateAgua: 1, inModoReparto: 0, inEstrNaves: 1, inEstrCom: 1 }) },
  { id: 'vcorta', nombre: 'Versión vieja con menos claves', esBase: false, activo: false, inputs: { inPreMacro: 1800 } }
];
const renglon = Object.assign({ caso_id: 'caso-de-prueba', nombre_caso: 'Caso de prueba', version: 3, escenarios_json: JSON.stringify(versiones) }, versiones[1].inputs);

const ctx = version => ({ nucleo: N, motor, version, calculado: '2026-01-01 00:00' });
const todas = N.versionesDeRenglon(renglon);

/* resumenActual() del HTML, cortada tal cual y corrida con `state` = computar(vals). */
function resumenActual(vals) {
  const fuente = N.cortaFuncion(motor.html, 'resumenActual');
  const c = vm.createContext({ state: motor.computarCrudo(vals), calculate: () => null, isFinite });
  vm.runInContext(fuente + ';globalThis.__r=resumenActual();', c);
  return c.__r;
}

test('las cifras de cada versión son las de resumenActual() del tablero', () => {
  todas.forEach(v => {
    const f = M.foto({ tipo: 'MACROLOTES', renglon }, ctx(v));
    const res = resumenActual(f.entradas.vals);
    assert.equal(Math.round(f.cifras.ventas), res.ventas, v.nombre + ': ventas');
    assert.equal(Math.round(f.cifras.costo_proyecto), res.costo_proyecto, v.nombre + ': costo');
    assert.equal(Math.round(f.cifras.utilidad), res.utilidad, v.nombre + ': utilidad');
  });
});

test('la forma del visor pasa N.valida y cada foto es un renglón válido', () => {
  todas.forEach(v => {
    const f = M.foto({ tipo: 'MACROLOTES', renglon }, ctx(v));
    assert.deepEqual(N.valida(N.completa(f.visor)), [], v.nombre);
  });
  const r = N.tomaFotos(M, { tipo: 'MACROLOTES', renglon }, { motor, calculado: '2026-01-01 00:00' });
  assert.equal(r.errores.length, 0, JSON.stringify(r.errores));
  assert.equal(r.fotos.length, 3);
  assert.equal(r.fotos.filter(f => f.elegida === 'sí').length, 1);
});

test('lo que el motor no produce va vacío, nunca en cero', () => {
  const v = todas.find(x => x.activa);
  const vis = N.completa(M.foto({ tipo: 'MACROLOTES', renglon }, ctx(v)).visor);
  ['capital', 'inversion_recibe', 'dueno_aporta', 'dueno_veces', 'dueno_meses', 'max_ajeno', 'banco_mes', 'mes_saldos', 'rend_capital']
    .concat(N.CLAVES_V.filter(k => /^(rv_|ck_)/.test(k))).forEach(k => assert.equal(vis.v[k], null, 'v.' + k));
  ['din.tasa_capital', 'din.tiie', 'din.sobretasa', 'din.apertura', 'din.caja_pct', 'din.preventa_minima', 'cob.enganche'].forEach(k => assert.equal(vis.datos[k].valor, null, k));
  ['respaldo', 'disposicion', 'firmas', 'pago_capital', 'apertura'].forEach(k => assert.equal(vis.flujo.filas[k], undefined, 'flujo.' + k));
  assert.equal(vis.reparto.parte_alianza, null);
  assert.equal(vis.reparto.parte_capital, null);
  assert.deepEqual(vis.candados, []);
  assert.deepEqual(vis.pruebas, []);
});

test('modo renta: las naves y el comercial rentados no llevan precio por m²; flujo con su total', () => {
  const v = todas.find(x => x.activa);
  const f = M.foto({ tipo: 'MACROLOTES', renglon }, ctx(v));
  const r = motor.computar(f.entradas.vals);
  assert.equal(r.rentaN, true);
  const naves = f.visor.productos.find(p => /^Naves/.test(p.nombre));
  assert.equal(naves.precio_m2, null);
  assert.equal(naves.ventas, N.r3(N.mdp(r.ingNaves)));
  assert.equal(f.visor.flujo.total.saldo_banco, N.r3(r.peak / 1e6));
  assert.equal(f.visor.v.mes_reparto, r.totalMonths);
  assert.equal(f.visor.v.costo_sin_tierra, N.mdp(r.costoProyecto - r.tierraPago));
});

test('variables de estado como setControl y versión no activa encima de la activa', () => {
  const activa = todas.find(x => x.activa), corta = todas.find(x => x.id === 'vcorta');
  const ea = M.entradas({ renglon }, ctx(activa)), ec = M.entradas({ renglon }, ctx(corta));
  assert.deepEqual([ea.inGateAgua, ea.inModoReparto, ea.inEstrNaves, ea.inEstrCom], [1, 0, 1, 1]);
  // La versión vieja sólo trae inPreMacro: lo demás lo hereda de la activa, como en el navegador.
  assert.equal(ec.inPreMacro, 1800);
  assert.equal(ec.inEstrNaves, 1);
  assert.equal(ec.inMixMacro, 40);
  // Claves que no son deslizantes ni variables de estado no llegan a computar (inputValues()).
  assert.equal('inPuPtar' in ea, false);
  const vals = {}; M.EXTRAS.inGateAgua('7', vals); M.EXTRAS.inEstrCom('', vals); M.EXTRAS.__inEstrNavesViejo(3, vals);
  assert.deepEqual(vals, { inGateAgua: 2, inEstrCom: 0, inEstrNaves: 1 });
});

test('una versión cuyo cuadro no cierra no se fotografía: va a errores sin tumbar a las demás', () => {
  const malas = versiones.concat([{ id: 'vmala', nombre: 'Mezcla rota', inputs: { inMixNaves: 90, inMixMacro: 40 } }]);
  const r = N.tomaFotos(M, { tipo: 'MACROLOTES', renglon: Object.assign({}, renglon, { escenarios_json: JSON.stringify(malas) }) }, { motor, calculado: '2026-01-01 00:00' });
  assert.equal(r.fotos.length, 3);
  assert.equal(r.errores.length, 1);
  assert.match(r.errores[0].error, /cuadro no cierra/);
});
