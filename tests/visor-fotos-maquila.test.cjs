'use strict';
/* Las fotos del PPP de siempre después de la maquila del visor (15-nov-2026): lo que el paso «completa» corrige o deja
   dicho para que el visor no enseñe cifras sin sentido. Cada prueba falla con el completa de antes. Sólo casos
   INVENTADOS (sin nombres ni cifras reales); nada abre la red ni escribe en hojas.
   Corre con: node --test tests/visor-fotos-maquila.test.cjs */
const test = require('node:test');
const assert = require('node:assert/strict');
const N = require('../scripts/visor-fotos/nucleo.cjs');
const C = require('../scripts/visor-fotos/completa.cjs');

const FECHA = '2026-01-01 00:00';
const motores = {};
const motor = (t) => (motores[t] = motores[t] || N.motor(t));
const completa = (caso) => C.completaCaso(caso, { motor: motor(caso.tipo), calculado: FECHA });
const vis = (f) => JSON.parse(f.visor_json);
const resultado = (caso, mod) => C.resultado(caso.tipo, require('../scripts/visor-fotos/' + mod + '.cjs'), caso, N.versionesDeRenglon(caso.renglon)[0], motor(caso.tipo)).r;

/* ── casos inventados (los mismos de tests/visor-fotos-completa.test.cjs) ── */
const MACRO_BASE = { inFrente: 400, inFondo: 500, inMixNaves: 40, inMixMacro: 40, inMixCom: 20, inMixViv: 0, inPreNave: 12000, inPreMacro: 2000, inEquity: 10000000, inPctDueno: 20, inAporteTierra: 100 };
const macro = (extra) => ({ tipo: 'MACROLOTES', renglon: Object.assign({ caso_id: 'caso-de-prueba', nombre_caso: 'Caso de prueba', version: 1 }, MACRO_BASE, extra || {}) });
const RES = {
  tipo: 'RESIDENCIAL',
  renglon: { caso_id: 'caso-de-prueba', nombre_caso: 'Caso de prueba', version: '1', inSuperficie: 20000, inFrente: 100, inFondo: 250, inM2Lote: 160, inPrecioM2Preventa: 2000, inPrecioM2Venta: 2600,
    inPctLotesPreventa: 30, inComercialM2: 900, inPrecioM2Comercial: 3500, inUrbM2: 1200, inValorTierraM2: 500, inAporteTierra: 100, inPctDueno: 35, inEquity: 3000000, inMaxDeuda: 20000000, inPIK: 15, inLotesMes: 4 }
};
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

test('casa: el dinero ajeno máximo cuenta el capital aportado (no sólo lo del inversionista) y cuadra con su serie', () => {
  const b = vis(completa(CASA).fotos[0]), fl = b.flujo;
  const capital = b.v.capital;
  assert.ok(capital > 0, 'el caso inventado pone capital');
  assert.ok(b.v.max_ajeno >= capital - 0.001, 'dinero ajeno máximo ' + b.v.max_ajeno + ' < capital ' + capital);
  const ajeno = fl.filas.ajeno, cap = fl.filas.cap_acum;
  ajeno.forEach((x, i) => assert.ok(x >= cap[i] - 0.001, 'mes ' + (i + 1) + ': el dinero ajeno no incluye el capital aportado'));
  assert.ok(Math.abs(Math.max(...ajeno) - b.v.max_ajeno) <= 0.001, 'el máximo es el de su serie');
  assert.match(b.deducido['v.max_ajeno'], /^corregido: .*capital aportado/);
  assert.match(b.deducido['flujo.ajeno'], /^corregido: capital aportado/);
  /* la casa se cobra completa al escriturar: enganche y pagos en obra son 0 (lo dice el motor), y no tiene cierre */
  assert.equal(fl.total.enganches, 0); assert.equal(fl.total.pagos_obra, 0); assert.equal(fl.total.cierre, 0);
  assert.match(b.deducido['flujo.enganches'], /se cobra completa al escriturar/);
  assert.match(b.deducido['flujo.total.cierre'], /no tiene gastos de cierre/);
});

test('el capital cobra antes que la utilidad: si la alianza no recupera su capital, su utilidad es 0 y el capital recupera lo que hay', () => {
  /* con los precios muy abajo el caso pierde: lo que recibe la alianza no alcanza a devolverle su capital */
  const caso = macro({ inPreNave: 3000, inPreMacro: 500, inEquity: 60000000 }), r = resultado(caso, 'macrolotes');
  assert.ok(r.devDist < r.equityUsed - 1000, 'el caso inventado pierde capital');
  const b = vis(completa(caso).fotos[0]);
  assert.equal(b.v.alianza_recibe, 0, 'nadie «recibe» en negativo');
  assert.equal(b.flujo.total.pago_capital, N.r3(N.mdp(r.devDist)), 'el capital recupera lo que la alianza recibe');
  assert.match(b.deducido['v.alianza_recibe'], /^corregido: la alianza no recupera todo su capital/);
  assert.match(b.deducido['flujo.total.pago_capital'], /cobra antes que la utilidad/);
  /* un caso que gana: el capital recupera todo lo que puso */
  const g = vis(completa(macro()).fotos[0]);
  assert.equal(g.flujo.total.pago_capital, N.r3(g.v.capital));
  assert.ok(g.v.alianza_recibe >= 0);
});

test('las marcas dicen de qué salen en palabras: sin nombres de variables del motor ni símbolos de código', () => {
  const internos = /\b(hard|cont|commission|closing|indirect|legal del motor|preventaAtBuild|tierraAportada|ownerTotal|retAcum|equityUsed|devDist|revision_formula|cashReconciliation|debtCap|fundingGap)\b|Δ/;
  for (const caso of [vert(), macro(), RES, CASA]) {
    for (const f of completa(caso).fotos) {
      for (const [k, t] of Object.entries(vis(f).deducido || {})) assert.doesNotMatch(t, internos, caso.tipo + ' · ' + k + ': «' + t + '»');
    }
  }
});

test('lo que va vacío dice por qué («no aplica: …» o «sin dato: …») y sólo donde de verdad no hay cifra', () => {
  for (const caso of [vert(), macro(), RES, CASA]) {
    const b = vis(completa(caso).fotos[0]), dd = b.deducido;
    assert.match(dd['flujo.total.caja_minima'] || '', /^no aplica: el motor de su tablero no guarda caja mínima/, caso.tipo + ': caja mínima');
    for (const [k, t] of Object.entries(dd)) {
      if (!/^(no aplica|sin dato):/.test(t)) continue;
      const p = k.split('.');
      const valor = p[0] === 'v' ? b.v[p.slice(1).join('.')] : p[0] === 'datos' ? (b.datos[p.slice(1).join('.')] || {}).valor
        : p[0] === 'reparto' ? (b.reparto || {})[p[1]] : p[0] === 'productos' ? (b.productos[Number(p[1])] || {})[p[2]]
          : p[0] === 'flujo' && p[1] === 'total' ? (b.flujo.filas[p[2]] ? 'serie' : b.flujo.total[p[2]]) : 'otra';
      assert.ok(valor === null || valor === undefined, caso.tipo + ' · ' + k + ' dice «' + t + '» pero trae ' + valor);
      assert.doesNotMatch(t, /Supuesto:|No se calcula aquí/, 'la razón va corta: ' + t);
    }
  }
});

test('residencial: lo que el motor suma a sus ventas sin ser un producto (retorno por financiar) viene aparte y cuadra', () => {
  const r = resultado(RES, 'residencial');
  assert.ok(r.retFinTodo > 1000, 'el caso inventado financia a sus compradores');
  const b = vis(completa(RES).fotos[0]);
  assert.equal(b.v.otros_ingresos, N.mdp(r.retFinTodo));
  assert.match(b.deducido['v.otros_ingresos'], /retorno por financiar/);
  const sumaP = b.productos.reduce((s, p) => s + (p.ventas || 0), 0);
  assert.ok(Math.abs(sumaP + b.v.otros_ingresos - b.v.ventas) <= 0.01, 'productos + lo que no es de un producto = ventas');
});

test('vertical: el precio por m² de las tipologías es el promedio que da sus ventas (con el descuento de preventa), no el de lista', () => {
  const b = vis(completa(vert()).fotos[0]);
  const deptos = b.productos.filter((p) => /^Deptos/.test(p.nombre));
  assert.ok(deptos.length >= 2);
  for (const [i, p] of b.productos.entries()) {
    if (!/^Deptos/.test(p.nombre)) continue;
    assert.ok(Math.abs(p.m2 * p.precio_m2 / 1e6 - p.ventas) <= 0.005 * p.ventas + 0.002, p.nombre + ': m² × precio ≠ ventas');
    assert.match(b.deducido['productos.' + i + '.precio_m2'], /^corregido: precio promedio = ventas del producto ÷ m² \(el de lista, \$40,000 por m²/);
  }
});

test('un producto sin ventas en la versión no tiene precio promedio inventado (0 ÷ unidades): queda vacío con su razón', () => {
  /* como los locales de un libro que no los cobra: metros, unidades y precio de lista, con ventas en 0 */
  const visor = { productos: [{ nombre: 'Locales', unidades: 12, m2: 1400, precio_m2: 52000, ventas: 0, precio_unidad: null }, { nombre: 'Lotes', unidades: 10, m2: 2000, precio_m2: null, ventas: 4, precio_unidad: null }], flujo: {} };
  const marca = {}, noAp = {};
  C.productosCompletos(visor, { tipo: 'MACROLOTES' }, {}, marca, noAp);
  assert.equal(visor.productos[0].precio_unidad, null, 'sin ventas no hay precio por unidad');
  assert.equal(visor.productos[1].precio_unidad, 0.4, 'con ventas sí: ventas ÷ unidades');
  C.razonesVacias(visor, marca, { vacios: {}, sinLlenar: {} }, noAp);
  assert.match(marca['productos.0.precio_unidad'], /^no aplica: el producto no tiene ventas en esta versión/);
  assert.ok(!marca['productos.1.precio_unidad'] || !/^no aplica/.test(marca['productos.1.precio_unidad']));
});

test('macrolotes: cuando el calendario cuadra con la cobranza, el enganche y el saldo de cada venta van por mes', () => {
  const b = vis(completa(macro()).fotos[0]), fl = b.flujo;
  assert.ok(fl.filas.enganches && fl.filas.saldos, 'enganches y saldos por mes');
  fl.filas.cobranza.forEach((x, i) => assert.ok(Math.abs(fl.filas.enganches[i] + fl.filas.saldos[i] - x) <= 0.002, 'mes ' + (i + 1) + ': enganche + saldo ≠ cobranza'));
  assert.match(b.deducido['flujo.saldos'], /saldo al entregar la nave o las mensualidades del lote/);
  assert.ok(!b.deducido['flujo.total.saldos'], 'ya no dice «sin dato»');
});

test('«qué cambia» nombra los interruptores por su rótulo (no el del deslizante de arriba)', () => {
  const nombres = C.etiquetas(motor('RESIDENCIAL').html);
  assert.equal(nombres.inInteresesDev, 'Intereses y comisiones del crédito puente');
});

test('los textos caben en los topes del servidor y se cortan en palabra con «…»', () => {
  for (const caso of [vert(), CASA]) {
    const b = vis(completa(caso).fotos[0]);
    assert.ok(b.reparto.esquema.length <= 80, caso.tipo + ': esquema de ' + b.reparto.esquema.length);
    assert.ok(!b.plan.esquema || b.plan.esquema.length <= 80);
    Object.entries(b.v).forEach(([k, x]) => { if (typeof x === 'string') assert.ok(x.length <= 200, 'v.' + k); });
  }
  /* caben sin perder sentido: el preferente del vertical es anual (el motor lo cobra por meses ÷ 12) y se dice a quién
     va el residual; la casa no pierde el rendimiento del inversionista. Ninguno llega cortado. */
  for (const extra of [{}, { inPref: 15.5, inResidualDueno: 14.25 }]) {
    const e = vis(completa(vert(extra)).fotos[0]).reparto.esquema;
    assert.match(e, /^Regresan tierra y capital; preferente [\d.]+ % anual; residual [\d.]+ % al dueño$/, e);
    assert.ok(e.length <= 80 && !e.includes('…'), e);
  }
  const casa = vis(completa(CASA).fotos[0]);
  assert.match(casa.reparto.esquema, /inversionista cobra su rendimiento/);
  assert.ok(!casa.reparto.esquema.includes('…') && casa.reparto.esquema === casa.plan.esquema);
  assert.equal(C.cortaPalabra('uno dos tres cuatro cinco seis siete', 20), 'uno dos tres cuatro…');
  assert.equal(C.cortaPalabra('corto', 20), 'corto');
});
