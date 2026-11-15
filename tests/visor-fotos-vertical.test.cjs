'use strict';
/* Módulo VERTICAL de la foto del visor (scripts/visor-fotos/vertical.cjs).
   Sólo datos inventados: un caso de prueba sin nombres ni cifras reales, y un «libro» sintético armado con lo
   que da el propio computar() de mixto.html (así se comprueba que copiar del libro y correr el motor dan la
   misma foto). Corre con: node --test tests/visor-fotos-vertical.test.cjs */
const test = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const N = require('../scripts/visor-fotos/nucleo.cjs');
const V = require('../scripts/visor-fotos/vertical.cjs');

const motor = N.motor('VERTICAL');

const ENTRADAS = {
  inTerreno: 3000, inCOS: 60, inCUS: 4, inCom: 500, inEfiViv: 85, inM2Depto: 80, inMixLoft: 30, inM2Loft: 55,
  inMix2Rec: 50, inM22Rec: 80, inMix3Rec: 20, inM23Rec: 110, inDeptosPiso: 10, inLocalesPB: 6, inPreViv: 40000,
  inDescPrev: 5, inPreCom: 45000, inEng: 30, inObra: 40, inPreventa: 70, inMesesPreventa: 18, inMesesEntrega: 10,
  inPrecioCajon: 250000, inCostRas: 18000, inCostSot: 15000, inInicioObra: 8, inMesesObra: 24, inPIK: 12,
  inTierraUSD: 300, inTC: 18, inVel: 60, inAporteTierra: 100, inEquity: 20000000, inMaxDeuda: 300000000, inLTC: 60
};
function renglon(extra) {
  const r = { caso_id: 'caso-de-prueba', nombre_caso: 'Caso de prueba', version: 3, ventas: '', costo_proyecto: '', utilidad: '' };
  Object.keys(ENTRADAS).forEach(k => { r[k] = String(ENTRADAS[k]); });
  return Object.assign(r, extra || {});
}
const ESCENARIOS = [
  { id: 'base', nombre: 'Base', esBase: true, activo: false, inputs: Object.assign({}, ENTRADAS) },
  { id: 'otra', nombre: 'Otra', esBase: false, activo: true, inputs: Object.assign({}, ENTRADAS, { inPreViv: 42000, inEng: 80, inObra: 50, inInventarioExplicito: 1, inUnidadesA: 40, inUnidadesB: 60, inUnidadesC: 10 }) }
];

/* resumenActual() real del HTML, sobre el resultado de computar (es lo que guarda el tablero en el renglón). */
function resumenActual(r) {
  const ctx = vm.createContext({ state: r, calculate: () => r });
  vm.runInContext(N.cortaFuncion(motor.html, 'resumenActual') + ';globalThis.__o=resumenActual();', ctx);
  return ctx.__o;
}
const ctxDe = (caso, version) => ({ nucleo: N, motor, calculado: '2026-01-01 00:00', version });

/* Un libro sintético con la forma de las hojas de versión: F/G con las etiquetas de computar() y J:AI. */
function libroDe(r, conEncabezado, comoTexto) {
  const fmt = x => {
    if (!comoTexto || typeof x !== 'number') return x;
    if (x === 0) return '–';
    const [e, d] = Math.abs(x).toFixed(6).split('.');
    const t = e.replace(/\B(?=(\d{3})+(?!\d))/g, '.') + ',' + d;
    return x < 0 ? '(' + t + ')' : t;
  };
  const resultados = [];
  Object.keys(r.p).forEach(k => resultados.push(['p.' + k, fmt(r.p[k])]));
  Object.keys(r).forEach(k => { if (typeof r[k] === 'number' || typeof r[k] === 'boolean') resultados.push([k, fmt(r[k])]); });
  const col = { Mes: 'm', Cobros: 'rev', Costo: 'cost', Interés: 'pik', Equity: 'equity', 'Comisión deuda': 'fee', 'Brecha nueva': 'gap', 'Deuda final': 'debt', 'Caja final': 'caja' };
  const filas = r.flows.map(f => V.FLUJO_LIBRO.map(h => (col[h] ? fmt(f[col[h]]) : null)));
  return {
    modelo: 'modelo-sintetico',
    versiones: [
      { escenario_id: 'base', nombre: 'Base', es_base: 'TRUE', activo: 'FALSE', hoja: 'Version_Base', estado: 'VIGENTE' },
      { escenario_id: 'otra', nombre: 'Otra', es_base: 'FALSE', activo: 'FALSE', hoja: 'V02_otra', estado: 'VIGENTE' },
      { escenario_id: 'nueva', nombre: 'Nueva del libro', es_base: 'FALSE', activo: 'TRUE', hoja: 'V_Integral', estado: 'VIGENTE' }
    ],
    hojas: {
      Version_Base: { resultados, flujo: { encabezado: null, filas } },
      V02_otra: { resultados, flujo: { encabezado: conEncabezado ? V.FLUJO_LIBRO : null, filas } },
      V_Integral: { resultados: Object.fromEntries(resultados), flujo: { encabezado: V.FLUJO_LIBRO, filas } }
    }
  };
}

test('vía lote: las cifras son las de resumenActual() del tablero', () => {
  const caso = { tipo: 'VERTICAL', renglon: renglon() };
  const ver = N.versionesDeRenglon(caso.renglon)[0];
  const f = V.foto(caso, ctxDe(caso, ver));
  const r = motor.computar(f.entradas.vals);
  const res = resumenActual(r);
  assert.equal(f.origen, 'lote');
  assert.equal(Math.round(f.cifras.ventas), res.ventas);
  assert.equal(Math.round(f.cifras.costo_proyecto), res.costo_proyecto);
  assert.equal(Math.round(f.cifras.utilidad), res.utilidad);
  assert.deepEqual(N.valida(N.completa(f.visor)), []);
});

test('vía lote con escenarios: reinicios de escAplicar y clampRelations antes de computar', () => {
  const caso = { tipo: 'VERTICAL', renglon: renglon({ escenarios_json: JSON.stringify(ESCENARIOS) }) };
  const vers = N.versionesDeRenglon(caso.renglon);
  assert.equal(vers.length, 2);
  const otra = V.foto(caso, ctxDe(caso, vers[1]));
  assert.equal(otra.entradas.vals.inEng, 80);
  assert.equal(otra.entradas.vals.inObra, 20, 'clampRelations: enganche + obra no pasan de 100');
  assert.equal(otra.entradas.vals.inInventarioExplicito, 1);
  const base = V.foto(caso, ctxDe(caso, vers[0]));
  assert.equal(base.entradas.vals.inInventarioExplicito, 0, 'escAplicar pone en 0 el inventario explícito');
  const res = resumenActual(motor.computar(otra.entradas.vals));
  assert.equal(Math.round(otra.cifras.utilidad), res.utilidad);
  /* Con el resumen guardado de la activa, el núcleo la concilia y queda lista. */
  const conResumen = Object.assign({}, caso, { renglon: Object.assign({}, caso.renglon, { ventas: String(res.ventas), costo_proyecto: String(res.costo_proyecto), utilidad: String(res.utilidad) }) });
  const { fotos, errores } = N.tomaFotos(V, conResumen, { motor, calculado: '2026-01-01 00:00' });
  assert.deepEqual(errores, []);
  const activa = fotos.find(x => x.escenario_id === 'otra');
  assert.equal(JSON.parse(activa.conciliacion).ok, true);
  assert.equal(activa.estado, 'lista');
});

test('vía libro: copia F/G y J:AI y da la misma foto que correr el motor', () => {
  const caso0 = { tipo: 'VERTICAL', renglon: renglon() };
  const lote = V.foto(caso0, ctxDe(caso0, N.versionesDeRenglon(caso0.renglon)[0]));
  const r = motor.computar(lote.entradas.vals);
  for (const [conEnc, comoTexto] of [[false, false], [true, false], [true, true]]) {
    const caso = { tipo: 'VERTICAL', renglon: renglon(), libro: libroDe(r, conEnc, comoTexto) };
    const vers = V.versiones(caso, { nucleo: N, motor });
    const f = V.foto(caso, ctxDe(caso, vers[1]));
    assert.equal(f.origen, 'libro');
    assert.match(f.motor_commit, /^libro:modelo-sintetico/);
    assert.ok(Math.abs(f.cifras.utilidad - lote.cifras.utilidad) < 1e-3, 'utilidad copiada');
    assert.ok(Math.abs(f.cifras.ventas - lote.cifras.ventas) < 1e-3, 'ventas copiadas');
    assert.deepEqual(N.valida(N.completa(f.visor)), []);
    for (const k of ['ventas', 'ganancia', 'tierra', 'banco_max', 'capital', 'caja_cierre', 'obra_inicio', 'fin_obra', 'mes_reparto', 'dueno_recibe', 'alianza_recibe']) {
      assert.ok(Math.abs((f.visor.v[k] ?? NaN) - lote.visor.v[k]) < 1e-5, 'v.' + k + ' igual por libro y por lote');
    }
    assert.deepEqual(f.visor.flujo.filas.cobranza, lote.visor.flujo.filas.cobranza);
    assert.ok(!('disposicion' in f.visor.flujo.filas), 'una columna del libro sin números no se vuelve una serie de ceros');
  }
});

test('versiones del libro: orden de la pestaña Versiones; activa = la del renglón; la del libro aparte', () => {
  const caso0 = { tipo: 'VERTICAL', renglon: renglon() };
  const r = motor.computar(V.foto(caso0, ctxDe(caso0, N.versionesDeRenglon(caso0.renglon)[0])).entradas.vals);
  const caso = { tipo: 'VERTICAL', renglon: renglon({ escenarios_json: JSON.stringify(ESCENARIOS) }), libro: libroDe(r, false, false) };
  const vers = V.versiones(caso, { nucleo: N, motor });
  assert.deepEqual(vers.map(v => [v.orden, v.id, v.activa, v.libroActiva]), [[1, 'base', false, false], [2, 'otra', true, false], [3, 'nueva', false, true]]);
  const { fotos, errores } = N.tomaFotos(V, caso, { motor, calculado: '2026-01-01 00:00' });
  assert.deepEqual(errores, []);
  assert.equal(fotos.length, 3);
  assert.equal(fotos.find(f => f.elegida === 'sí').escenario_id, 'nueva', 'por omisión rige la última');
  fotos.forEach(f => assert.equal(f.origen, 'libro'));
});

test('lo que el motor no produce va en null, nunca en 0', () => {
  const caso = { tipo: 'VERTICAL', renglon: renglon({ inPrecioCajon: '0', inLocalesPB: '0', inCom: '0' }) };
  const f = V.foto(caso, ctxDe(caso, N.versionesDeRenglon(caso.renglon)[0]));
  const v = N.completa(f.visor);
  for (const k of ['max_ajeno', 'inversion_recibe', 'rend_capital', 'capital_mes', 'respaldo_mes', 'pagos_obra', 'estado', 'fecha_aprobacion']) assert.equal(v.v[k], null, 'v.' + k);
  Object.keys(v.v).filter(k => /^(rv_|ck_)/.test(k)).forEach(k => assert.equal(v.v[k], null, 'v.' + k));
  for (const k of ['din.tiie', 'din.sobretasa', 'din.caja_pct']) assert.equal(v.datos[k].valor, null, k);
  v.productos.forEach(p => { if (/^Deptos/.test(p.nombre)) assert.equal(p.ventas, null, 'sin ventas por tipología'); });
  assert.ok(!v.productos.some(p => p.nombre === 'Cajones vendibles'), 'sin precio de cajón no hay producto de cajones');
  assert.ok(!v.productos.some(p => p.nombre === 'Locales'), 'sin comercial no hay producto de locales');
  assert.ok(!('firmas' in v.flujo.filas), 'el PPP 1 no tiene firmas por mes');
  assert.deepEqual(v.candados, []);
  assert.deepEqual(v.pruebas, []);
});

test('números del libro con formato es-MX', () => {
  assert.equal(V.numeroLibro('1.234,5'), 1234.5);
  assert.equal(V.numeroLibro('(12.345.678)'), -12345678);
  assert.equal(V.numeroLibro('–'), 0);
  assert.equal(V.numeroLibro('0,62'), 0.62);
  assert.equal(V.numeroLibro('4.512'), 4512);
  assert.equal(V.numeroLibro(''), null);
  assert.equal(V.numeroLibro('TRUE'), 1);
  assert.equal(V.numeroLibro(12.5), 12.5);
});

test('un libro que no cuadra consigo mismo no se fotografía', () => {
  const caso0 = { tipo: 'VERTICAL', renglon: renglon() };
  const r = motor.computar(V.foto(caso0, ctxDe(caso0, N.versionesDeRenglon(caso0.renglon)[0])).entradas.vals);
  const libro = libroDe(r, false, false);
  libro.hojas.Version_Base.flujo.filas[0][2] = 999999999;      // Cobros del mes 1
  const caso = { tipo: 'VERTICAL', renglon: renglon(), libro };
  const vers = V.versiones(caso, { nucleo: N, motor });
  assert.throws(() => V.foto(caso, ctxDe(caso, vers[0])), /no cuadra/);
});
