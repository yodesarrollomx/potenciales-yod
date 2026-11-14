'use strict';
/* Pruebas del visor en vivo de PPP 2 (server/ppp2/Visor.gs): la liga de sólo lectura.
   Mismo mundo de dobles que el servidor (tests/ppp2-mundo.cjs); el plan es INVENTADO. */
const test = require('node:test');
const assert = require('node:assert/strict');
const { mundo, PLAN, filaDe, EDITOR, LECTOR } = require('./ppp2-mundo.cjs');

const LIGA = 'liga0000000000000000000000000001';
const renglon = (cambios) => Object.values(Object.assign({ liga: LIGA, plan_id: PLAN, para: 'Grupo de prueba', estado: 'activa', vence: '', versiones: '', etiquetas: '', creada: '2026-01-01', nota: '' }, cambios || {}));
const conLiga = (cambios, op) => mundo(Object.assign({ ligas: [renglon(cambios)], aperturas: true }, op || {}));
const pide = (w, extra) => w.get(Object.assign({ recurso: 'ppp2-visor', liga: LIGA }, extra || {}));

test('sin liga, con una liga que no existe, apagada o vencida no se entra, y nunca se llama al Portero', () => {
  const w = conLiga();
  assert.equal(w.get({ recurso: 'ppp2-visor' }).error, 'liga');
  assert.equal(w.get({ recurso: 'ppp2-visor', liga: 'corta' }).error, 'liga');
  assert.equal(w.get({ recurso: 'ppp2-visor', liga: 'liga0000000000000000000000000002' }).error, 'liga');
  assert.equal(pide(conLiga({ estado: 'apagada' })).error, 'liga');
  assert.equal(pide(conLiga({ vence: '2026-01-31' })).error, 'liga');
  assert.equal(pide(conLiga({ vence: '2027-01-31' })).ok, true);
  assert.equal(pide(mundo()).error, 'liga', 'sin hoja Ligas no hay ligas');
  assert.equal(w.llamadas.length, 0);
});

test('una liga viva entrega lo que pintan los siete cuadros, de la versión que el libro muestra', () => {
  const w = conLiga();
  const r = pide(w);
  assert.equal(r.ok, true);
  assert.equal(r.esquema, 'ppp2-visor-v1');
  assert.equal(r.plan.nombre, 'Proyecto Ejemplo');
  assert.equal(r.version, 2);
  assert.deepEqual(r.versiones.map((x) => x.n), [2], 'sin regla en la liga sólo se ve la versión mostrada');
  assert.equal(r.v.ventas, 500);
  assert.equal(typeof r.v.dueno_recibe, 'number');
  assert.equal(typeof r.v.rv_resultado, 'string');
  assert.equal(r.productos.length, 3);
  assert.equal(r.productos[0].nombre, 'Producto A');
  assert.ok(r.flujo.meses >= r.v.mes_reparto && r.flujo.meses <= 60);
  for (const c of ['firmas', 'cobranza', 'egresos', 'interes', 'cap_aporta', 'disposicion', 'pago_banco', 'pago_capital', 'flujo_acum', 'cap_acum', 'saldo_banco', 'caja']) {
    assert.equal(r.flujo.filas[c].length, r.flujo.meses, c);
    assert.equal(typeof r.flujo.total[c], 'number', c);
  }
  assert.equal(r.flujo.total.cobranza, 500);
  // el flujo acumulado del libro termina en el resultado a repartir de esa versión
  assert.ok(Math.abs(r.flujo.filas.flujo_acum[r.flujo.meses - 1] - r.v.resultado_repartir) < 0.01);
  assert.equal(r.reparto.esquema, 'B · 50/50 con tierra pagada');
  assert.equal(r.reparto.parte_dueno, 0.5);
  assert.equal(r.datos['terreno.m2'].valor, 3000);
  assert.ok(r.candados.length >= 2);
  assert.equal(r.menu.planes.length, 1);
  assert.equal(w.llamadas.length, 0, 'la liga no pasa por el Portero');
});

test('no salen nombres de personas, preguntas, hallazgos, consejo ni la bitácora', () => {
  const r = pide(conLiga());
  const texto = JSON.stringify(r);
  for (const c of ['propuesta_por', 'aprobada_por', 'preguntas', 'hallazgos', 'consejo', 'bitacora', 'libro_url', 'libro_id', 'rondas', 'palancas'])
    assert.ok(!(c in r) && !(c in r.v), c);
  assert.doesNotMatch(texto, /libro-ejemplo/);
  assert.deepEqual(Object.keys(r.ultimo).sort(), ['accion', 'fecha']);
});

test('preguntar «¿cambió?» con la llave no vuelve a abrir el libro; si el libro cambia, la llave cambia', () => {
  const w = conLiga();
  const r1 = pide(w);
  const abiertas = w.aperturas['libro-ejemplo'];
  const r2 = pide(w, { si: r1.llave });
  assert.deepEqual(r2, { ok: true, igual: true, llave: r1.llave });
  assert.equal(w.aperturas['libro-ejemplo'], abiertas, 'sin cambios no se abre el libro');
  const r3 = pide(w);
  assert.equal(r3.v.ventas, 500);
  assert.equal(w.aperturas['libro-ejemplo'], abiertas, 'lo leído sale de la caché');
  const res = w.libro.getSheetByName('Resumen');
  res.v[filaDe(res, 'v2.ventas') - 1][1] = 512.5;              // alguien cambió el libro
  assert.deepEqual(pide(w, { si: r1.llave }), { ok: true, igual: true, llave: r1.llave }, 'la llave se comparte un par de segundos entre quienes miran');
  w.cache.delete('vk_' + PLAN);                                // …y pasan esos segundos
  const r4 = pide(w, { si: r1.llave });
  assert.equal(r4.igual, undefined);
  assert.notEqual(r4.llave, r1.llave);
  assert.equal(r4.v.ventas, 512.5);
});

test('la liga decide qué versiones se pueden ver; pedir otra cae en la que el libro muestra', () => {
  assert.equal(pide(conLiga(), { v: '1' }).version, 2, 'la liga sin regla no deja escoger');
  const todas = pide(conLiga({ versiones: 'todas' }));
  assert.ok(todas.versiones.length >= 2);
  assert.equal(todas.version, 2);
  const uno = pide(conLiga({ versiones: 'todas' }), { v: '1' });
  assert.equal(uno.version, 1);
  assert.equal(uno.v.nombre, 'Base');
  assert.notEqual(uno.llave, todas.llave);
  const lista = pide(conLiga({ versiones: '1,2' }), { v: '3' });
  assert.deepEqual(lista.versiones.map((x) => x.n), [1, 2]);
  assert.equal(lista.version, 2);
});

test('una liga con varios planes (varios terrenos) deja escoger entre ellos y sólo entre ellos', () => {
  const w = mundo({ ligas: [renglon({ plan_id: PLAN + ',p2otroplan01', etiquetas: 'Terreno chico|Terreno grande' })] });
  w.vivero.getSheetByName('Planes').appendRow(['p2otroplan01', 'Otro Ejemplo', 'libro-plantilla', 'activo', '2026-01-15', 'Pruebas', '', 'ppp2-libro-v1', '']);
  w.vivero.getSheetByName('Planes').appendRow(['p2ajeno00001', 'Ajeno', 'libro-plantilla', 'activo', '2026-01-15', 'Pruebas', '', 'ppp2-libro-v1', '']);
  w.cache.delete('planes');
  const a = pide(w);
  assert.deepEqual(a.menu.planes, [{ id: PLAN, etiqueta: 'Terreno chico' }, { id: 'p2otroplan01', etiqueta: 'Terreno grande' }]);
  assert.equal(a.menu.plan, PLAN);
  assert.equal(pide(w, { plan: 'p2otroplan01' }).menu.plan, 'p2otroplan01');
  assert.equal(pide(w, { plan: 'p2ajeno00001' }).menu.plan, PLAN, 'un plan que la liga no trae no se abre');
});

test('abrir la página deja renglón en Aperturas y trae las marcas del pie; preguntar si cambió, no', () => {
  const w = conLiga({}, { config: [['visor_marcas', 'Marca Uno|Marca Dos']] });
  const r = pide(w, { abre: '1', eq: 'iPhone' });
  assert.deepEqual(r.marcas, [{ nombre: 'Marca Uno', img: '' }, { nombre: 'Marca Dos', img: '' }]);
  const h = w.vivero.getSheetByName('Aperturas');
  assert.equal(h.getLastRow(), 2);
  assert.deepEqual(h.v[1].slice(2), ['Grupo de prueba', PLAN, 'iPhone']);
  assert.doesNotMatch(String(h.v[1][1]), new RegExp(LIGA), 'la liga completa no se copia a la hoja');
  const otra = pide(w, { si: r.llave });
  assert.equal(otra.marcas, undefined);
  assert.equal(h.getLastRow(), 2);
});

test('el visor sólo lee: no deja renglones en la bitácora del libro ni cambia sus hojas', () => {
  const w = conLiga();
  const antes = JSON.stringify(Object.values(w.libro.hojas).map((h) => h.v));
  pide(w, { abre: '1' });
  pide(w, { v: '3' });
  assert.equal(JSON.stringify(Object.values(w.libro.hojas).map((h) => h.v)), antes);
});

test('si algo truena adentro, a la liga sólo se le dice que falló', () => {
  const w = conLiga();
  w.vivero.getSheetByName('Planes').getDataRange = () => { throw new Error('detalle interno con libro-ejemplo'); };
  w.cache.delete('planes');
  const r = pide(w);
  assert.deepEqual(r, { ok: false, error: 'interno' });
});

test('con sesión del Portero, la ficha del plan ve los mismos cuadros de cualquier versión viva; sin sesión válida, no', () => {
  const w = mundo();
  const r = w.get({ recurso: 'ppp2-visor', k: LECTOR, plan: PLAN });
  assert.equal(r.ok, true);
  assert.equal(r.version, 2, 'abre en la versión que el libro muestra');
  assert.ok(r.versiones.length >= 2, 'con sesión se escoge entre las versiones vivas');
  assert.equal(r.v.ventas, 500);
  assert.deepEqual(r.puede, { compartir: false });
  assert.equal(r.ligas, undefined);
  assert.equal(w.get({ recurso: 'ppp2-visor', k: LECTOR, plan: PLAN, v: '1' }).version, 1);
  assert.deepEqual(w.get({ recurso: 'ppp2-visor', k: LECTOR, plan: PLAN, si: r.llave }), { ok: true, igual: true, llave: r.llave });
  assert.equal(w.get({ recurso: 'ppp2-visor', k: 'llave-que-no-existe-0000', plan: PLAN }).ok, false);
  assert.equal(w.get({ recurso: 'ppp2-visor', k: LECTOR, plan: 'p2noexiste01' }).error, 'plan');
  const e = w.get({ recurso: 'ppp2-visor', k: EDITOR, plan: PLAN, ligas: '1' });
  assert.deepEqual(e.puede, { compartir: true });
  assert.deepEqual(e.ligas, [], 'quien puede editar ve las ligas del plan');
  for (const c of ['propuesta_por', 'aprobada_por', 'libro_url', 'libro_id']) assert.ok(!(c in r) && !(c in r.v), c);
});

test('quien puede editar da una liga desde el plan: abre el visor, cuenta sus aperturas y apagarla lo cierra', () => {
  const w = mundo();
  const antes = JSON.stringify(Object.values(w.libro.hojas).map((h) => h.v));
  assert.equal(w.post({ tipo: 'ppp2-liga', k: LECTOR, plan: PLAN, op: 'crear' }).error, 'permiso');
  assert.equal(w.post({ tipo: 'ppp2-liga', k: EDITOR, plan: PLAN, op: 'crear', versiones: 'todas las que quiera' }).error, 'versiones');
  assert.equal(w.post({ tipo: 'ppp2-liga', k: EDITOR, plan: PLAN, op: 'apagar', liga: 'ninguna' }).error, 'liga');
  assert.ok(!w.vivero.getSheetByName('Ligas'), 'un intento rechazado no crea nada');
  const r = w.post({ tipo: 'ppp2-liga', k: EDITOR, plan: PLAN, op: 'crear', para: 'Grupo de la alianza', versiones: 'todas', request_id: 'liga-1' });
  assert.equal(r.ok, true);
  assert.match(r.liga, /^[a-f0-9]{40}$/);
  assert.equal(r.plan, undefined, 'dar una liga no vuelve a leer el plan');
  const h = w.vivero.getSheetByName('Ligas');
  assert.deepEqual(h.v[0], ['liga', 'plan_id', 'para', 'estado', 'vence', 'versiones', 'etiquetas', 'creada', 'nota']);
  assert.deepEqual(h.v[1].slice(0, 6), [r.liga, PLAN, 'Grupo de la alianza', 'activa', '', 'todas']);
  assert.deepEqual(w.vivero.getSheetByName('Aperturas').v[0], ['fecha', 'liga', 'para', 'plan_id', 'equipo']);
  assert.deepEqual(r.ligas.map((x) => [x.liga, x.para, x.estado, x.versiones, x.aperturas]), [[r.liga, 'Grupo de la alianza', 'activa', 'todas', 0]]);
  const v = w.get({ recurso: 'ppp2-visor', liga: r.liga, abre: '1', eq: 'iPhone' });
  assert.equal(v.ok, true);
  assert.ok(v.versiones.length >= 2);
  assert.equal(v.puede, undefined, 'la liga no trae permisos ni ligas');
  assert.equal(w.get({ recurso: 'ppp2-visor', k: EDITOR, plan: PLAN, ligas: '1' }).ligas[0].aperturas, 1);
  const bit = w.vivero.getSheetByName('Bitácora').v;
  assert.equal(bit[bit.length - 1][2], 'liga-crear');
  assert.doesNotMatch(JSON.stringify(bit), new RegExp(r.liga), 'la liga completa no se copia a la bitácora');
  assert.equal(w.post({ tipo: 'ppp2-liga', k: EDITOR, plan: PLAN, op: 'apagar', liga: 'otra' }).error, 'liga');
  const off = w.post({ tipo: 'ppp2-liga', k: EDITOR, plan: PLAN, op: 'apagar', liga: r.liga });
  assert.equal(off.ligas[0].estado, 'apagada');
  assert.equal(w.get({ recurso: 'ppp2-visor', liga: r.liga }).error, 'liga', 'apagada, deja de abrir');
  assert.equal(w.post({ tipo: 'ppp2-liga', k: EDITOR, plan: PLAN, op: 'activar', liga: r.liga }).ligas[0].estado, 'activa');
  assert.equal(w.get({ recurso: 'ppp2-visor', liga: r.liga }).ok, true);
  assert.equal(JSON.stringify(Object.values(w.libro.hojas).map((x) => x.v)), antes, 'las ligas no tocan el libro');
});

test('una liga puede llevar varios planes con su etiqueta, y el vivero dice a qué caso del PPP corresponde cada plan', () => {
  const w = mundo();
  const planes = w.vivero.getSheetByName('Planes');
  planes.v[1][planes.v[0].indexOf('caso_ppp')] = 'casodeprueba01';
  planes.appendRow(['p2otroplan01', 'Otro Ejemplo', 'libro-plantilla', 'activo', '2026-01-15', 'Pruebas', '', 'ppp2-libro-v1', '']);
  w.cache.delete('planes');
  const r = w.post({ tipo: 'ppp2-liga', k: EDITOR, plan: PLAN, op: 'crear', etiqueta: 'Terreno chico', planes: [{ plan: 'p2otroplan01', etiqueta: 'Terreno grande' }] });
  assert.equal(r.ok, true);
  assert.equal(r.ligas[0].planes, 2);
  assert.deepEqual(w.get({ recurso: 'ppp2-visor', liga: r.liga }).menu.planes, [{ id: PLAN, etiqueta: 'Terreno chico' }, { id: 'p2otroplan01', etiqueta: 'Terreno grande' }]);
  assert.equal(w.post({ tipo: 'ppp2-liga', k: EDITOR, plan: PLAN, op: 'crear', planes: [{ plan: 'p2noexiste01' }] }).error, 'plan');
  const viv = w.get({ recurso: 'ppp2-vivero', k: LECTOR });
  assert.equal(viv.planes.find((x) => x.plan_id === PLAN).caso, 'casodeprueba01');
  assert.equal(viv.planes.find((x) => x.plan_id === 'p2otroplan01').caso, '');
});
