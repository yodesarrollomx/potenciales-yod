'use strict';
/* Las fotos del PPP de siempre, segunda vuelta de la maquila (15-nov-2026): lo que encontraron las pasadas de
   residencial y casa (T5) y del vertical (T6). Cada prueba falla con el completa de antes. Sólo casos INVENTADOS (sin
   nombres ni cifras reales); nada abre la red ni escribe en hojas.
   Corre con: node --test tests/visor-fotos-maquila-2.test.cjs */
const test = require('node:test');
const assert = require('node:assert/strict');
const N = require('../scripts/visor-fotos/nucleo.cjs');
const C = require('../scripts/visor-fotos/completa.cjs');

const FECHA = '2026-01-01 00:00';
const motores = {};
const motor = (t) => (motores[t] = motores[t] || N.motor(t));
const completa = (caso) => C.completaCaso(caso, { motor: motor(caso.tipo), calculado: FECHA });
const foto = (caso) => { const r = completa(caso); assert.ok(r.fotos.length, JSON.stringify(r.errores)); return r.fotos[0]; };
const vis = (f) => JSON.parse(f.visor_json);
const resultado = (caso, mod) => C.resultado(caso.tipo, require('../scripts/visor-fotos/' + mod + '.cjs'), caso, N.versionesDeRenglon(caso.renglon)[0], motor(caso.tipo)).r;

/* ── casos inventados (los mismos de tests/visor-fotos-completa.test.cjs) ── */
const MACRO_BASE = { inFrente: 400, inFondo: 500, inMixNaves: 40, inMixMacro: 40, inMixCom: 20, inMixViv: 0, inPreNave: 12000, inPreMacro: 2000, inEquity: 10000000, inPctDueno: 20, inAporteTierra: 100 };
const macro = (extra) => ({ tipo: 'MACROLOTES', renglon: Object.assign({ caso_id: 'caso-de-prueba', nombre_caso: 'Caso de prueba', version: 1 }, MACRO_BASE, extra || {}) });
const RES_BASE = { caso_id: 'caso-de-prueba', nombre_caso: 'Caso de prueba', version: '1', inSuperficie: 20000, inFrente: 100, inFondo: 250, inM2Lote: 160, inPrecioM2Preventa: 2000, inPrecioM2Venta: 2600,
  inPctLotesPreventa: 30, inComercialM2: 900, inPrecioM2Comercial: 3500, inUrbM2: 1200, inValorTierraM2: 500, inAporteTierra: 100, inPctDueno: 35, inEquity: 3000000, inMaxDeuda: 20000000, inPIK: 15, inLotesMes: 4 };
const res = (extra) => ({ tipo: 'RESIDENCIAL', renglon: Object.assign({}, RES_BASE, extra || {}) });
const CASA = {
  tipo: 'UNIFAMILIAR',
  renglon: {
    caso_id: 'casa-de-prueba', nombre_caso: 'Casa de prueba', version: '1', inSuperficie: '300', inPrecioM2Terreno: '4000', inNiveles: '2', inM2Social: '80',
    inM2RecPpal: '30', inNRecSec: '2', inM2RecSec: '15', inNBanos: '3', inM2Bano: '5', inM2Servicio: '10', inM2Terraza: '15', inPctCirc: '7', inM2Cochera: '30',
    inCostoM2Obra: '15000', inProyectoM2: '900', inTramitesFijo: '80000', inImprevistosPct: '3', inPrecioM2Zona: '26000', inComLeadsPct: '1', inComCierrePct: '4',
    inOperacionPct: '2', inMesesObra: '14', inMesesVenta: '4', inInversionAbierta: '900000', inRetornoInvPct: '18', inEstrategia: '1', escenarios_json: ''
  }
};
const VERT_BASE = {
  inTerreno: 3000, inCOS: 60, inCUS: 4, inCom: 500, inEfiViv: 85, inM2Depto: 80, inMixLoft: 30, inM2Loft: 55, inMix2Rec: 50, inM22Rec: 80, inMix3Rec: 20,
  inM23Rec: 110, inDeptosPiso: 10, inLocalesPB: 6, inPreViv: 40000, inDescPrev: 5, inPreCom: 45000, inEng: 30, inObra: 40, inPreventa: 70,
  inMesesPreventa: 18, inMesesEntrega: 10, inPrecioCajon: 250000, inCostRas: 18000, inCostSot: 15000, inInicioObra: 8, inMesesObra: 24, inPIK: 12,
  inTierraUSD: 300, inTC: 18, inVel: 60, inAporteTierra: 100, inEquity: 20000000, inMaxDeuda: 300000000, inLTC: 60
};
const vert = (extra) => ({ tipo: 'VERTICAL', renglon: Object.assign({ caso_id: 'torre-de-prueba', nombre_caso: 'Torre de prueba', version: 1 }, VERT_BASE, extra || {}) });

const ganDeR = (b) => b.v.resultado_repartir - b.v.dueno_aporta;

test('la ganancia después de la tierra no desaparece cuando el plan pierde, lleva honorario o el dueño cobra regalía: resultado a repartir − tierra que aporta', () => {
  /* cuando el motor sí da la ganancia (repaga completa la tierra, sin honorario), es esa misma cuenta: por eso vale deducirla */
  const r0 = resultado(res(), 'residencial'), b0 = vis(foto(res()));
  assert.ok(r0.repagoTierra >= r0.repagoObjetivo - 1 && r0.honorarioDev === 0, 'el caso inventado repaga completa su tierra');
  assert.ok(Math.abs(N.mdp(r0.utilidadRepartible) - ganDeR(b0)) < 2e-6, 'utilidad repartible del motor = resultado a repartir − tierra aportada');
  const casos = [
    ['residencial que no alcanza a repagar su tierra (pierde)', res({ inValorTierraM2: 4000 }), (g) => g < 0],
    ['residencial con honorario de desarrollo', res({ inHonorarioPct: 3 }), () => true],
    ['macrolotes con la tierra aportada (el dueño cobra un % de la utilidad)', macro(), () => true],
    ['macrolotes con regalía por venta', macro({ inModoReparto: 1, inPctDuenoVenta: 8 }), () => true]
  ];
  for (const [nombre, caso, signo] of casos) {
    const b = vis(foto(caso));
    assert.ok(typeof b.v.ganancia === 'number', nombre + ': la ganancia viene');
    assert.ok(Math.abs(b.v.ganancia - ganDeR(b)) < 2e-6, nombre + ': ganancia = resultado a repartir − tierra que aporta el dueño');
    assert.ok(signo(b.v.ganancia), nombre + ': signo');
    assert.equal(b.v.margen, N.r6(b.v.ganancia / b.v.ventas), nombre + ': margen = ganancia ÷ ventas');
    assert.match(b.deducido['v.ganancia'], /resultado a repartir \(caja al cierre, ya devueltos capital, banco y respaldo\) menos la tierra que aporta el dueño a su valor/, nombre);
    assert.doesNotMatch(b.deducido['v.ganancia'], /^(no aplica|sin dato):/, nombre + ': no es una razón de vacío');
  }
});

test('quien no aporta su terreno lo vende: «veces» no aplica (no ×1.00 con aportación 0)', () => {
  for (const [nombre, caso] of [['casa (el terreno se compra)', CASA], ['residencial con la tierra pagada en efectivo', res({ inAporteTierra: 0 })]]) {
    const b = vis(foto(caso));
    assert.equal(b.v.dueno_aporta, 0, nombre);
    assert.ok(b.v.dueno_recibe > 0, nombre + ': recibe el precio de su terreno');
    assert.equal(b.v.dueno_veces, null, nombre);
    assert.match(b.deducido['v.dueno_veces'], /^no aplica: el dueño no aporta su tierra: la vende a su valor/, nombre);
  }
  /* quien sí la aporta conserva sus veces */
  assert.ok(typeof vis(foto(res())).v.dueno_veces === 'number');
});

test('el banco que nunca tiene saldo no se liquida en el «mes 0»: va en blanco con su razón, como el libro', () => {
  for (const extra of [{ inLTC: 0 }, { inMaxDeuda: 0 }]) {
    const b = vis(foto(vert(extra)));
    assert.equal(b.v.rv_linea_ventas, 'sin banco');
    assert.equal(b.v.banco_mes, null, JSON.stringify(extra));
    assert.match(b.deducido['v.banco_mes'], /^no aplica: el banco nunca tiene saldo/);
  }
  assert.ok(vis(foto(vert())).v.banco_mes > 0, 'con banco sí hay mes');
});
