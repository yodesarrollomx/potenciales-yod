'use strict';
/* Paso «completa» de la foto del visor (scripts/visor-fotos/completa.cjs). Sólo datos inventados: casos de prueba
   sin nombres ni cifras reales. Ninguna prueba abre la red ni escribe en hojas.
   Corre con: node --test tests/visor-fotos-completa.test.cjs */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const N = require('../scripts/visor-fotos/nucleo.cjs');
const C = require('../scripts/visor-fotos/completa.cjs');

const RAIZ = path.resolve(__dirname, '..');
const leer = f => fs.readFileSync(path.join(RAIZ, f), 'utf8');
const FECHA = '2026-01-01 00:00';
const motores = {};
const motor = t => (motores[t] = motores[t] || N.motor(t));
const completa = (caso, extra) => C.completaCaso(Object.assign({}, caso, extra || {}), { motor: motor(caso.tipo), calculado: FECHA });
const vis = f => JSON.parse(f.visor_json);

/* ── casos inventados ── */
const MACRO_BASE = { inFrente: 400, inFondo: 500, inMixNaves: 40, inMixMacro: 40, inMixCom: 20, inMixViv: 0, inPreNave: 12000, inPreMacro: 2000, inEquity: 10000000, inPctDueno: 20, inAporteTierra: 100 };
const MACRO = {
  tipo: 'MACROLOTES',
  renglon: Object.assign({
    caso_id: 'caso-de-prueba', nombre_caso: 'Caso de prueba', version: 2,
    escenarios_json: JSON.stringify([
      { id: 'vbase', nombre: 'Base de prueba', esBase: true, activo: true, inputs: Object.assign({}, MACRO_BASE, { inGateAgua: 0, inModoReparto: 0, inEstrNaves: 0, inEstrCom: 0 }) },
      { id: 'vrenta', nombre: 'Renta de prueba', esBase: false, activo: false, inputs: Object.assign({}, MACRO_BASE, { inPreMacro: 2400, inEstrNaves: 1, inEstrCom: 1 }) }
    ])
  }, MACRO_BASE)
};
const RES_BASE = {
  inSuperficie: 20000, inFrente: 100, inFondo: 250, inM2Lote: 160, inPrecioM2Preventa: 2000, inPrecioM2Venta: 2600, inPctLotesPreventa: 30,
  inComercialM2: 900, inPrecioM2Comercial: 3500, inUrbM2: 1200, inValorTierraM2: 500, inAporteTierra: 100, inPctDueno: 35, inEquity: 3000000,
  inMaxDeuda: 20000000, inPIK: 15, inLotesMes: 4
};
const RES = { tipo: 'RESIDENCIAL', renglon: Object.assign({ caso_id: 'caso-de-prueba', nombre_caso: 'Caso de prueba', version: '1' }, RES_BASE) };
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
const VERT = { tipo: 'VERTICAL', renglon: Object.assign({ caso_id: 'torre-de-prueba', nombre_caso: 'Torre de prueba', version: 1 }, VERT_BASE) };

/* ── las pruebas de la revisión son las del libro y las del visor ── */
test('las nueve pruebas tienen las mismas claves, sentido y límites que revision_formula y que visor.js', () => {
  const py = /def revision_formula\(col\):([\s\S]*?)\n    \]/.exec(leer('ppp2/libro/generar.py'))[1];
  const libro = [...py.matchAll(/g\('(rv_[a-z_]+)'\)\}(<=|>=|<)([0-9.]+)/g)].map(m => [m[1], m[2], Number(m[3])]);
  const guardas = [...py.matchAll(/ISNUMBER\(\{g\('(rv_[a-z_]+)'\)\}\)/g)].map(m => m[1]);
  assert.equal(libro.length, 9);
  libro.forEach(([k, op, lim], i) => {
    const p = C.PRUEBAS[i];
    assert.equal(p.k, k);
    assert.equal(p.lim, lim, k);
    assert.equal(p.modo, op === '<=' ? 'max' : op === '>=' ? 'min' : 'cero', k);
    assert.equal(p.guarda, guardas.includes(k), k + ': guarda');
  });
  const vz = leer('visor.js');
  /* en el visor la prueba «cero» dibuja el límite en 0 y aprueba con menos de 0.01, como el libro */
  C.PRUEBAS.forEach(p => assert.match(vz, new RegExp("k: '" + p.k + "'[^}]*modo: '" + p.modo + "'" + (p.modo === 'cero' ? '' : ', lim: ' + String(p.lim).replace('.', '\\.') + '\\b')), p.k));
  assert.match(vz, /p\.modo === 'cero'\) return x < 0\.01/);
});

test('revision(): los textos con ISNUMBER no fallan, lo vacío se cuenta como «sin dato» y «Pasa (aportación justa)»', () => {
  const ok = { ganancia: 1, rv_linea_ventas: 'sin banco', rv_linea_costo: 'sin banco', rv_aportacion: 0.22, rv_preventa: 0.5, rv_preventa_banco: 'sin banco', rv_cobertura: 'sin banco', rv_margen: 0.3, rv_meses_credito: 'sin banco', rv_falta: 0 };
  assert.equal(C.revision(ok), 'Pasa (aportación justa)');
  assert.equal(C.revision(Object.assign({}, ok, { rv_aportacion: 0.3 })), 'Pasa');
  assert.equal(C.revision(Object.assign({}, ok, { rv_margen: 0.1, rv_falta: 2 })), 'No pasa: 2 de 9 pruebas');
  assert.equal(C.revision(Object.assign({}, ok, { rv_preventa: null })), 'Sin dato en 1 de 9 pruebas');
  assert.equal(C.revision(Object.assign({}, ok, { rv_preventa: null, rv_margen: 0 })), 'No pasa: 1 de 9 pruebas (1 sin dato)');
  assert.equal(C.revision(Object.assign({}, ok, { rv_aportacion: 'sin banco' })), 'Sin dato en 1 de 9 pruebas', 'sin ISNUMBER un texto no aprueba');
  assert.equal(C.revision(Object.assign({}, ok, { ganancia: null })), 'Falta calcular');
  assert.equal(C.revision(Object.assign({}, ok, { ganancia: null, resultado_repartir: 5 })), 'Pasa (aportación justa)', 'una ganancia vacía a propósito no es «falta calcular»');
});

/* ── cada motor: llena, marca, no cambia lo que ya había y no inventa ceros ── */
function revisaCaso(caso) {
  const sinCompletar = N.tomaFotos(N.MOTORES[caso.tipo] && require('../scripts/visor-fotos/' + N.MOTORES[caso.tipo].modulo + '.cjs'), caso, { motor: motor(caso.tipo), calculado: FECHA });
  const r = completa(caso);
  assert.deepEqual(r.errores, []);
  assert.equal(r.fotos.length, sinCompletar.fotos.length);
  r.fotos.forEach((f, i) => {
    const a = vis(sinCompletar.fotos[i]), b = vis(f), marcas = b.deducido || {};
    const mapeados = new Set((f.aseo.mapeados || []).map(x => x.split(' ← ')[0]));
    assert.deepEqual(C.validaCompleta(b), [], f.escenario_nombre);
    assert.ok(f.aseo.vacios_despues.length < f.aseo.vacios_antes.length, 'llena huecos');
    assert.doesNotMatch(f.visor_json, /NaN|Infinity/);
    /* lo que el módulo ya había puesto no cambia, salvo lo corregido (anotado) o lo que se deja vacío con su razón */
    Object.keys(a.v).forEach(k => {
      if (a.v[k] === null || k === 'nombre' || a.v[k] === b.v[k]) return;
      if (b.v[k] === null) assert.ok(f.aseo.sin_llenar['v.' + k] && JSON.parse(f.conciliacion).vacios['v.' + k], 'v.' + k + ' quedó vacía sin razón');
      else assert.ok(marcas['v.' + k], 'v.' + k + ' cambió sin marca');
    });
    Object.keys(a.flujo.filas).forEach(k => assert.ok(b.flujo.filas[k], 'se perdió la serie ' + k));
    /* todo lo que se llenó trae su marca o viene del motor; en especial los ceros */
    f.aseo.vacios_antes.forEach(ruta => {
      const [x, ...resto] = ruta.split('.'), k = resto.join('.');
      const val = x === 'v' ? b.v[k] : x === 'datos' ? b.datos[k].valor : x === 'reparto' ? (b.reparto || {})[k] : x === 'plan' ? b.plan[k] : undefined;
      if (val !== null && val !== undefined && x !== 'productos') assert.ok(marcas[ruta] || mapeados.has(ruta), ruta + ' = ' + val + ' sin marca');
    });
    Object.keys(b.flujo.filas).forEach(k => { if (!a.flujo.filas[k]) assert.ok(marcas['flujo.' + k], 'serie nueva sin marca: ' + k); });
    /* el flujo cuadra: lo que entra menos lo que sale es la caja final; el acumulado termina en lo que se reparte */
    const t = b.flujo.total, s = k => t[k] || 0;
    const entra = s('cobranza') + s('disposicion') + s('cap_aporta') + s('respaldo'), sale = s('egresos') + s('pago_banco') + s('interes') + s('apertura') + s('pago_respaldo');
    assert.ok(Math.abs(entra - sale - s('caja')) < 0.002 * b.flujo.meses + 0.01, 'entra − sale = caja (' + (entra - sale - s('caja')) + ')');
    assert.ok(Math.abs(t.flujo_acum - b.v.resultado_repartir) < 0.0011, 'flujo acumulado = resultado a repartir');
    assert.equal(typeof b.v.rv_resultado, 'string');
  });
  return r;
}

test('macrolotes: llena, marca y deja que el reparto sume (la alianza sin contar dos veces su capital)', () => {
  const r = revisaCaso(MACRO);
  r.fotos.forEach(f => {
    const b = vis(f), c = f.aseo.criterios, res = C.resultado('MACROLOTES', require('../scripts/visor-fotos/macrolotes.cjs'), MACRO, N.versionesDeRenglon(MACRO.renglon)[f.orden - 1], motor('MACROLOTES')).r;
    assert.equal(b.v.capital, N.mdp(res.equityUsed));
    /* con aportación: la tierra es su valor (superficie × valor del m²) y la ganancia del motor no tiene el sentido del visor */
    assert.equal(res.tierraPago, 0);
    assert.equal(b.v.tierra, N.mdp(res.superficie * res.p.valorTierraM2));
    assert.equal(b.datos['tierra.valor'].valor, b.v.tierra);
    assert.match(b.deducido['v.tierra'], /valor de la tierra del caso.*aporta/);
    assert.equal(b.v.ganancia, null);
    assert.equal(b.v.margen, null);
    assert.match(JSON.parse(f.conciliacion).vacios['v.ganancia'], /antes de la tierra que aporta el dueño/);
    assert.equal(b.flujo.total.cierre, 0, 'el motor no tiene cierre de tierra');
    assert.doesNotMatch(b.v.rv_resultado, /Falta calcular/, 'una ganancia vacía a propósito no es «falta calcular»');
    assert.ok(b.deducido['v.alianza_recibe'] || b.v.alianza_recibe !== null);
    assert.equal(c.reparto_suma, true);
    assert.ok(Array.isArray(b.flujo.filas.firmas) && Math.abs(b.v.ck_unidades) < 0.001, 'se firman todas las unidades');
  });
  const renta = r.fotos.find(f => f.escenario_id === 'vrenta');
  assert.ok(renta.aseo.no_aplica['v.mes_saldos'] === undefined || /renta/.test(renta.aseo.no_aplica['v.mes_saldos']));
});

test('residencial: resultado a repartir, banco y reparto con las definiciones del libro', () => {
  const r = revisaCaso(RES), f = r.fotos[0], b = vis(f);
  const res = C.resultado('RESIDENCIAL', require('../scripts/visor-fotos/residencial.cjs'), RES, N.versionesDeRenglon(RES.renglon)[0], motor('RESIDENCIAL')).r;
  /* tierra = la que aporta el dueño, a su valor; ganancia = la utilidad repartible del motor (ya repagó la tierra completa) */
  assert.equal(b.v.tierra, N.mdp(res.tierraAportada));
  assert.ok(res.repagoTierra >= res.repagoObjetivo - 1 && res.honorarioDev === 0, 'el caso inventado repaga completa su tierra');
  assert.equal(b.v.ganancia, N.mdp(res.utilidadRepartible));
  assert.match(b.deducido['v.ganancia'], /utilidad repartible del motor/);
  /* el margen del visor es esa ganancia entre ventas (el del motor es el de su utilidad antes de la tierra aportada) */
  assert.equal(b.v.margen, N.r6(b.v.ganancia / b.v.ventas));
  assert.match(b.deducido['v.margen'], /^corregido: ganancia real ÷ ventas/);
  assert.ok(!(JSON.parse(f.conciliacion || '{}').vacios || {})['v.margen'], 'el margen ya no queda vacío');
  /* si la utilidad no alcanza a repagar la tierra, la ganancia queda vacía con su razón */
  const CORTO = Object.assign({}, RES, { renglon: Object.assign({}, RES.renglon, { inValorTierraM2: 4000 }) });
  const corto = completa(CORTO).fotos[0], rc = C.resultado('RESIDENCIAL', require('../scripts/visor-fotos/residencial.cjs'), CORTO, N.versionesDeRenglon(CORTO.renglon)[0], motor('RESIDENCIAL')).r;
  assert.ok(rc.repagoTierra < rc.repagoObjetivo - 1, 'el caso inventado no alcanza a repagar su tierra');
  assert.equal(vis(corto).v.ganancia, null);
  assert.match(JSON.parse(corto.conciliacion).vacios['v.ganancia'], /no alcanza/);
  assert.equal(vis(corto).v.tierra, N.mdp(rc.tierraAportada));
  assert.equal(b.v.dueno_veces, N.r6(f.aseo.criterios.dueno_veces));
  assert.equal(b.reparto.parte_alianza, N.r6(1 - b.reparto.parte_dueno));
  assert.equal(b.v.rend_capital, 0);
  assert.match(b.deducido['v.rend_capital'], /rendimiento/);
  assert.equal(f.aseo.criterios.reparto_suma, true);
  assert.equal(b.v.ck_unidades, 0);
});

test('casa: sin banco ni socio de tierra; la venta se firma y escritura en un mes', () => {
  const r = revisaCaso(CASA), b = vis(r.fotos[0]), res = C.resultado('UNIFAMILIAR', require('../scripts/visor-fotos/unifamiliar.cjs'), CASA, N.versionesDeRenglon(CASA.renglon)[0], motor('UNIFAMILIAR')).r;
  assert.equal(b.v.rv_linea_ventas, 'sin banco');
  assert.equal(b.v.banco_max, 0);
  assert.equal(b.v.dueno_aporta, 0);
  assert.equal(b.v.dueno_recibe, N.mdp(res.costoTerreno));
  assert.equal(b.v.dueno_veces, 1);
  assert.equal(b.v.inversion_recibe, N.mdp(res.retAcum));
  assert.equal(b.v.obra_inicio, 2);
  assert.equal(b.v.mes_reparto, res.totalMonths);
  assert.equal(b.flujo.total.firmas, 1);
  assert.equal(b.flujo.filas.firmas[res.totalMonths - 1], 1);
  assert.ok(r.fotos[0].aseo.no_aplica['datos.din.apertura']);
});

test('vertical: el calendario de firmas reproduce los cobros del motor y la preventa es la del motor', () => {
  const r = revisaCaso(VERT), f = r.fotos[0], b = vis(f);
  const res = C.resultado('VERTICAL', require('../scripts/visor-fotos/vertical.cjs'), VERT, N.versionesDeRenglon(VERT.renglon)[0], motor('VERTICAL')).r;
  assert.equal(b.v.rv_preventa, N.r6(res.preventaAtBuild));
  const fl = b.flujo.filas;
  fl.cobranza.forEach((x, i) => assert.ok(Math.abs(x - (fl.enganches[i] + fl.pagos_obra[i] + fl.saldos[i])) < 0.0021, 'mes ' + (i + 1)));
  assert.equal(b.v.ck_unidades, 0);
  assert.equal(b.v.pagos_obra, N.mdp(res.presaleRev * res.p.obra));
  /* las ventas por tipología suman las de vivienda */
  const deptos = b.productos.filter(p => /^Deptos/.test(p.nombre));
  assert.ok(Math.abs(deptos.reduce((s, p) => s + p.ventas, 0) - N.mdp(res.presaleRev + res.postRev)) < 0.003 * deptos.length);
  assert.match(b.deducido['productos.0.ventas'], /m²/);
});

test('el dueño: con la tierra en efectivo cobra en el mes 1 (y «en años» dice lo mismo); si además cobra utilidad, lo último en el reparto', () => {
  const casa = vis(completa(CASA).fotos[0]);
  assert.equal(casa.v.dueno_meses, 1);
  assert.equal(casa.v.dueno_anos, N.r3(1 / 12), 'años = dueno_meses ÷ 12, no el mes de reparto');
  const vende = { tipo: 'MACROLOTES', renglon: Object.assign({ caso_id: 'caso-de-prueba', nombre_caso: 'Caso de prueba', version: 1, escenarios_json: '' }, MACRO_BASE, { inAporteTierra: 0, inPctDueno: 20 }) };
  const fv = completa(vende).fotos[0], b = vis(fv);
  const res = C.resultado('MACROLOTES', require('../scripts/visor-fotos/macrolotes.cjs'), vende, N.versionesDeRenglon(vende.renglon)[0], motor('MACROLOTES')).r;
  assert.equal(b.v.dueno_aporta, 0);
  assert.ok(b.v.dueno_recibe > b.v.tierra + 0.001, 'cobra la tierra y una parte de la utilidad');
  assert.equal(b.v.dueno_meses, b.v.mes_reparto);
  assert.equal(b.v.dueno_anos, N.r3(b.v.mes_reparto / 12));
  /* la tierra se compra en efectivo: ya es su valor y la utilidad del motor ya es después de la tierra; no cambian */
  assert.equal(b.v.tierra, N.mdp(res.tierraPago));
  assert.equal(b.v.ganancia, N.mdp(res.utilidadFinal));
  assert.equal(b.v.margen, N.r6(res.margenFinal));
  assert.equal(b.deducido['v.tierra'], undefined);
  assert.equal(JSON.parse(fv.conciliacion).vacios, undefined);
});

/* ── la propuesta de reestructura ── */
test('una reestructura sin cambios da lo mismo que su base; con cambios es una versión nueva que nunca queda elegida', () => {
  const igual = completa(RES, { reestructura: { base: 1, cambios: {}, porque: 'prueba' } });
  const base = igual.fotos.find(f => f.orden === 1), re = igual.fotos.find(f => f.escenario_id === C.ID_REESTRUCTURA);
  assert.equal(vis(re).v.ventas, vis(base).v.ventas);
  assert.equal(vis(re).v.ganancia, vis(base).v.ganancia);
  const r = completa(RES, { reestructura: { base: 1, nombre: 'prueba', cambios: { inPctDueno: 50, inPrecioM2Venta: 2800 }, porque: 'Una línea que explica qué se movió.' } });
  const nueva = r.fotos.find(f => f.escenario_id === C.ID_REESTRUCTURA);
  assert.equal(nueva.orden, 2);
  assert.ok(nueva.escenario_nombre.startsWith(C.PREFIJO_REESTRUCTURA));
  assert.ok(nueva.escenario_nombre.length <= 40);
  assert.equal(nueva.estado, 'lista');
  assert.equal(nueva.elegida, '');
  assert.equal(r.fotos.find(f => f.orden === 1).elegida, 'sí', 'la elegida sigue siendo la de antes');
  assert.equal(vis(nueva).v.que_cambia, 'Una línea que explica qué se movió.');
  assert.equal(vis(nueva).reparto.parte_dueno, 0.5);
  assert.ok(vis(nueva).v.ventas > vis(r.fotos[0]).v.ventas);
  assert.ok(vis(r.fotos[0]).versiones.some(x => x.n === 2), 'aparece en la lista de versiones del caso');
  assert.match(vis(r.fotos[0]).plan.paso_texto, /reestructura/);
  assert.throws(() => C.versionReestructura('VERTICAL', VERT, [{ orden: 1, hoja: 'V01' }], { base: 1 }), /libro/);
});

test('decisiones del caso: versiones que no se sirven, nombres neutros y la elegida no se decide aquí', () => {
  const r = completa(MACRO, { no_servir: [1], no_servir_porque: 'prueba', renombra: { 2: 'Opción renta' }, nombre_neutro: 'Caso neutro' });
  const v1 = r.fotos.find(f => f.orden === 1), v2 = r.fotos.find(f => f.orden === 2);
  assert.equal(v1.estado, 'propuesta');
  assert.equal(v1.elegida, '');
  assert.equal(v2.escenario_nombre, 'Opción renta');
  assert.equal(vis(v2).v.nombre, 'Opción renta');
  assert.match(vis(v2).origen, /«Opción renta»/);
  assert.equal(vis(v2).plan.nombre, 'Caso neutro');
  assert.equal(v2.elegida, 'sí', 'la elegida del núcleo (la última) se conserva');
});

test('el ensayo no escribe dentro del repositorio y escribe fuera con su resumen', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'completa-'));
  const entrada = path.join(dir, 'entrada.json');
  fs.writeFileSync(entrada, JSON.stringify({ casos: [CASA, Object.assign({ fuera: true }, RES)] }));
  assert.throws(() => C.ensayo(entrada, path.join(RAIZ, 'fotos.json')), /repositorio/);
  const out = C.ensayo(entrada, path.join(dir, 'fotos.json'), { calculado: FECHA });
  assert.equal(out.resumen.casos, 1, 'el caso marcado fuera no se procesa');
  assert.equal(out.resumen.errores, 0);
  assert.ok(out.resumen.vacios_despues < out.resumen.vacios_antes);
  assert.ok(fs.existsSync(path.join(dir, 'fotos.json')));
});
