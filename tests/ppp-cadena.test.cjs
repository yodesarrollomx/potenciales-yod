'use strict';
// Diagrama en cadena: la lectura es pura y sale del mismo estado que entrega el motor.
// Datos sintéticos; ninguna petición ni caso real.
const test = require('node:test'), assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path');
const C = require('../ppp-cadena.js'), { html, compute, inputs } = require('./ppp-fixture.js');
const fuente = fs.readFileSync(path.join(__dirname, '..', 'ppp-cadena.js'), 'utf8');
const variantes = [{}, { inPreViv: 56000 }, { inCOS: 55, inCUS: 8, inTerreno: 3200 }, { inMaxDeuda: 0, inEquity: 0 }, { inInventarioExplicito: 1, inUnidadesA: 13, inUnidadesB: 20, inUnidadesC: 7 }, { inAporteTierra: 0 }, { inPIK: 22, inCostRas: 25000 }, { inVel: 100, inPreventa: 100 }, { inVel: 0 }, { inMesesPreventa: 60, inInicioObra: 48, inMesesObra: 72, inMesesEntrega: 24 }, { inMesesPreventa: 1, inInicioObra: 1, inMesesObra: 6, inMesesEntrega: 1 }];
const suma = a => a.reduce((s, x) => s + x, 0), cerca = (a, b, tol = 1) => assert.ok(Math.abs(a - b) <= tol, a + ' ≠ ' + b);

test('Los cuatro eslabones suman lo mismo que reporta el motor', () => {
  for (const patch of variantes) {
    const r = compute({ ...inputs, ...patch }), antes = JSON.stringify(r), m = C.modelo('vertical', r);
    assert.ok(m, 'hay lectura para ' + JSON.stringify(patch));
    assert.deepEqual(C.cuadre(m), [], 'cuadra ' + JSON.stringify(patch));
    assert.equal(m.meses, r.totalMonths); assert.equal(m.meses, r.flows.length);
    cerca(suma(C.vendidas(m)), r.units, 1e-6);
    cerca(suma(m.flujo.entra), r.revTotal); cerca(suma(m.flujo.sale), r.costTotal);
    cerca(m.banco.capital[m.meses - 1], r.equityUsed); cerca(Math.max(0, ...m.banco.credito), r.peak);
    assert.equal(m.queda.utilidad, r.profit); assert.equal(m.queda.ventas, r.sales); assert.equal(m.queda.costo, r.projectCost);
    assert.equal(m.queda.financiamiento, r.interest + r.feeDebt); assert.equal(m.queda.tir, r.devIrr);
    assert.equal(m.queda.socios[0].recibe, r.ownerTotalProceeds); assert.equal(m.queda.socios[1].recibe, r.devDist);
    assert.equal(m.banco.tope, r.debtCap); assert.equal(m.banco.faltante, r.fundingGap);
    assert.deepEqual(m.flujo.entra, r.flows.map(x => x.rev)); assert.deepEqual(m.banco.credito, r.flows.map(x => x.debt)); assert.deepEqual(m.banco.caja, r.flows.map(x => x.caja));
    assert.equal(JSON.stringify(r), antes, 'la lectura no altera el estado');
    for (const serie of [C.vendidas(m), m.flujo.entra, m.flujo.sale, m.banco.caja, m.banco.capital, m.banco.credito, m.banco.falta]) { assert.equal(serie.length, m.meses); assert.ok(serie.every(Number.isFinite)); }
    assert.ok(m.hitos.obraDesde >= 1 && m.hitos.obraHasta <= m.meses && m.hitos.entregaDesde >= 1 && m.hitos.entregaDesde <= m.meses);
  }
});

test('Calendario de venta: preventa pareja en sus meses y el resto en la entrega', () => {
  const r = compute(inputs), m = C.modelo('vertical', r), [pre, ent] = m.vende.series;
  assert.equal(pre.porMes.filter(x => x > 0).length, r.p.preMonths); assert.ok(pre.porMes.slice(0, r.p.preMonths).every(x => x === r.presaleUnitsPerMonth));
  assert.equal(ent.porMes.filter(x => x > 0).length, r.p.delivery); assert.ok(ent.porMes.slice(0, m.meses - r.p.delivery).every(x => x === 0));
  cerca(suma(pre.porMes), r.presaleUnits, 1e-6); cerca(suma(ent.porMes), r.units - r.presaleUnits, 1e-6);
  assert.deepEqual(m.hitos, { preventaHasta: r.p.preMonths, obraDesde: r.buildStart + 1, obraHasta: r.buildFinish, entregaDesde: r.totalMonths - r.p.delivery + 1 });
  cerca(suma(m.vende.productos.map(p => p.monto)), r.sales);
});

test('Sin estado suficiente no hay diagrama: nada se rellena con ceros', () => {
  assert.equal(C.modelo('vertical', { p: {} }), null); assert.equal(C.modelo('vertical', null), null); assert.equal(C.modelo('vertical', 'x'), null);
  assert.equal(C.modelo('otro', compute(inputs)), null);
  const r = compute(inputs); assert.equal(C.modelo('vertical', { ...r, sales: NaN }), null); assert.equal(C.modelo('vertical', { ...r, flows: [] }), null); assert.equal(C.modelo('vertical', { ...r, profit: undefined }), null);
  assert.equal(C.dinero(undefined), '—'); assert.equal(C.dinero(23501841), '$23.5 M'); assert.equal(C.dinero(-5.04e6), '−$5.0 M'); assert.equal(C.corto(132042057), '$132 M');
});

test('La lectura y las notas señalan meses y montos del propio estado', () => {
  const r = compute(inputs), m = C.modelo('vertical', r), l = C.lectura(m);
  assert.match(l.A.cifra, new RegExp('^' + r.units + ' depas$')); assert.ok(l.D.cifra === C.dinero(r.profit)); assert.match(l.C.frase, /capital/); assert.match(l.D.frase, /De cada \$100/);
  const pesado = r.flows.reduce((b, x, i) => (i > 0 && x.cost > r.flows[b].cost ? i : b), 1);
  const b4 = C.notas.B(m, false).find(n => n.id === 'b4'); assert.equal(b4.mes, pesado); assert.equal(b4.v, r.flows[pesado].cost + r.flows[pesado].cashPik); assert.ok(b4.t.includes('mes ' + (pesado + 1)));
  const a1 = C.notas.A(m, false).find(n => n.id === 'a1'); assert.equal(a1.borde, r.buildStart); assert.ok(a1.t.includes(Math.round(r.preventaAtBuild * 100) + '%'));
  const c2 = C.notas.C(m, false).find(n => n.id === 'c2'); assert.ok(c2.t.includes(C.corto(r.peak))); assert.ok(r.flows[c2.mes].debt > r.peak * .5);
  const todas = ['A', 'B', 'C'].flatMap(k => [...C.notas[k](m, false), ...C.notas[k](m, true)]);
  assert.ok(todas.length >= 9); assert.ok(todas.every(n => typeof n.t === 'string' && n.t && !/NaN|undefined|Infinity/.test(n.t)));
  assert.ok(todas.every(n => n.borde !== undefined || (Number.isInteger(n.mes) && n.mes >= 0 && n.mes < m.meses && Number.isFinite(n.v))));
  // Con faltante, la nota de alerta va primero y la cifra del renglón lo dice.
  const sin = C.modelo('vertical', compute({ ...inputs, inMaxDeuda: 0, inEquity: 0 }));
  assert.ok(sin.banco.faltaMax > 1); assert.equal(sin.banco.faltaMax, Math.max(...sin.banco.falta)); assert.match(C.lectura(sin).C.cifra, /^faltan hasta /); assert.equal(C.notas.C(sin, false)[0].alerta, true); assert.equal(C.notas.C(sin, false)[0].mes, sin.banco.mesFalta - 1);
});

test('El cambio entre dos lecturas dice qué se movió; dos iguales no mueven nada', () => {
  const a = C.modelo('vertical', compute(inputs)), b = C.modelo('vertical', compute({ ...inputs, inVel: 40, inMesesPreventa: 20 })), c = C.cambio(a, b);
  assert.ok(c.A.si && c.B.si && c.C.si && c.D.si); assert.match(c.A.t, /por mes \(antes/); assert.match(c.D.t, /quedan .* \(antes/);
  const igual = C.cambio(a, C.modelo('vertical', compute({ ...inputs })));
  assert.ok(['A', 'B', 'C', 'D'].every(k => !igual[k].si));
  assert.equal(C.firma(a), C.firma(C.modelo('vertical', compute({ ...inputs })))); assert.notEqual(C.firma(a), C.firma(b));
  // Un dato que no toca el dinero ni el calendario no cambia la huella del dibujo.
  assert.equal(C.firma(a), C.firma(C.modelo('vertical', compute({ ...inputs, inDiasReserva: inputs.inDiasReserva + 1 }))));
  const precio = C.cambio(a, C.modelo('vertical', compute({ ...inputs, inPreViv: inputs.inPreViv * 1.1 })));
  assert.equal(precio.A.si, false, 'subir el precio no cambia cuántas unidades se venden'); assert.ok(precio.B.si && precio.D.si);
});

test('Sólo presentación: sin red, sin almacenamiento y sin motor financiero propio', () => {
  for (const prohibido of ['fetch(', 'XMLHttpRequest', 'localStorage', 'sessionStorage', 'indexedDB', 'navigator.sendBeacon', 'computar(', 'apiGet', 'apiPost', 'document.cookie', 'eval(', 'new Function'])
    assert.ok(!fuente.includes(prohibido), 'no usa ' + prohibido);
  assert.ok(!/innerHTML\s*=\s*[^;]*\b(nombre|estado|contexto|ctx)\b/.test(fuente.replace(/series\[\d\]\.nombre/g, '')), 'ningún texto del caso entra como HTML');
  assert.deepEqual(Object.keys(C.adaptadores), ['vertical']); assert.deepEqual(Object.keys(C.TITULOS), ['A', 'B', 'C', 'D']);
});

test('Cualquier combinación de los controles produce una lectura consistente', () => {
  const rangos = [...html.matchAll(/<input\b[^>]*type="range"[^>]*>/g)].map(([tag]) => { const g = k => Number(tag.match(new RegExp(k + '="([^"]+)"'))?.[1]); return { id: tag.match(/id="([^"]+)"/)[1], min: g('min'), max: g('max'), step: g('step') || 1 }; });
  let semilla = 20261111; const azar = () => { semilla |= 0; semilla = semilla + 0x6D2B79F5 | 0; let t = Math.imul(semilla ^ semilla >>> 15, 1 | semilla); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
  let conLectura = 0, conFaltante = 0, sinCredito = 0;
  for (let n = 0; n < 400; n++) {
    const v = {}; for (const c of rangos) { const pasos = Math.round((c.max - c.min) / c.step); v[c.id] = c.min + Math.round(azar() * pasos) * c.step; }
    if (v.inEng + v.inObra > 100) v.inObra = 100 - v.inEng;                         // mismas reglas que aplica el tablero antes de calcular
    v.inCom = Math.min(v.inCom, v.inTerreno * v.inCOS / 100);
    const r = compute(v), m = C.modelo('vertical', r); if (!m) continue; conLectura++;
    assert.deepEqual(C.cuadre(m), [], 'cuadra el caso ' + n);
    for (const serie of [C.vendidas(m), m.flujo.entra, m.flujo.sale, m.flujo.interes, m.banco.caja, m.banco.capital, m.banco.credito, m.banco.falta]) assert.ok(serie.length === m.meses && serie.every(Number.isFinite), 'series completas en el caso ' + n);
    assert.ok(C.vendidas(m).every(x => x >= 0) && m.banco.capital.every((x, i, a) => i === 0 || x >= a[i - 1] - 1e-6) && m.banco.falta.every(x => x >= 0));
    const l = C.lectura(m); for (const k of ['A', 'B', 'C', 'D']) assert.ok(!/NaN|undefined|Infinity/.test(l[k].cifra + l[k].frase), 'lectura limpia en el caso ' + n);
    for (const k of ['A', 'B', 'C']) for (const mv of [false, true]) for (const nota of C.notas[k](m, mv)) assert.ok(!/NaN|undefined|Infinity/.test(nota.t) && (nota.borde !== undefined || (nota.mes >= 0 && nota.mes < m.meses && Number.isFinite(nota.v))), 'nota válida en el caso ' + n + ': ' + nota.id);
    assert.equal(typeof C.firma(m), 'string'); C.cambio(m, m);
    if (m.banco.faltaMax > 1) conFaltante++; if (!(m.banco.pico > 1)) sinCredito++;
  }
  assert.ok(conLectura > 300, 'la mayoría de las combinaciones tiene lectura: ' + conLectura); assert.ok(conFaltante > 0 && sinCredito >= 0);
});
