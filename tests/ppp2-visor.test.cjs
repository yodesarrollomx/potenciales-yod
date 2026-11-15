'use strict';
/* Pruebas del visor en vivo de PPP 2 (server/ppp2/Visor.gs): la liga de sólo lectura.
   Mismo mundo de dobles que el servidor (tests/ppp2-mundo.cjs); el plan es INVENTADO. */
const test = require('node:test');
const assert = require('node:assert/strict');
const { mundo, PLAN, filaDe, ADMIN, EDITOR, LECTOR, POTENCIALES, FOTO_CAB } = require('./ppp2-mundo.cjs');

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

/* ── fotos de casos del PPP de siempre (PPP 1): pestaña PPP_VISOR de otro libro, servidas tal cual ──
   Un renglón por (caso, versión). Casos, cifras y nombres INVENTADOS. */
const CASO = 'casoprueba01';
const vista = (nombre, ventas, extra) => JSON.stringify(Object.assign({
  esquema: 'ppp2-visor-v1', plan: { nombre, edad: '', mostrada: 1 }, version: 1, versiones: [{ n: 1, nombre: 'Base', estado: 'vigente' }],
  v: { ventas, aprobada_por: 'Persona Prueba' }, datos: {}, productos: [], flujo: { meses: 0, filas: {}, total: {} }, reparto: null,
  candados: [], pruebas: [], pruebas_viejas: 0, ultimo: null, cambio: '', origen: 'PPP · vertical · versión «Base» · foto del 1-feb-2026'
}, extra || {}));
const foto = (c) => FOTO_CAB.map((k) => (k in c ? c[k] : ({ caso_id: CASO, tipo: 'vertical', escenario_id: 'e1', escenario_nombre: 'Base', estado: 'lista',
  elegida: '', elegida_por: '', elegida_fecha: '', orden: 1, motor_commit: 'abc1234', huella_entradas: 'h1', calculado: '2026-02-01 10:00',
  origen: 'lote', conciliacion: 'ok', visor_json: vista('Caso Ejemplo', 100) })[k]));
const conFotos = (fotos, ligaCambios, op) => mundo(Object.assign({ fotos, ligas: [renglon(Object.assign({ plan_id: 'ppp:' + CASO }, ligaCambios || {}))],
  config: [['potenciales_id', POTENCIALES]] }, op || {}));
const tres = () => [
  foto({ escenario_id: 'e1', escenario_nombre: 'Base', orden: 1, visor_json: vista('Uno', 1) }),
  foto({ escenario_id: 'e2', escenario_nombre: 'Rápida', orden: 2, huella_entradas: 'h2', visor_json: vista('Dos', 2) }),
  foto({ escenario_id: 'e3', escenario_nombre: 'Lenta', orden: 3, huella_entradas: 'h3', visor_json: vista('Tres', 3) }),
  foto({ escenario_id: 'e4', escenario_nombre: 'Borrador', orden: 4, estado: 'propuesta', huella_entradas: 'h4', visor_json: vista('Cuatro', 4) })
];
const col = (c) => FOTO_CAB.indexOf(c);
const hojaFotos = (w) => w.libros[POTENCIALES].getSheetByName('PPP_VISOR');

test('una liga con la foto de un caso del PPP 1 entrega su visor_json tal cual, sin abrir libros ni calcular', () => {
  const w = conFotos([foto({})]);
  const r = pide(w);
  assert.equal(r.ok, true);
  assert.equal(r.esquema, 'ppp2-visor-v1');
  assert.equal(r.plan.nombre, 'Caso Ejemplo');
  assert.equal(r.version, 1);
  assert.equal(r.v.ventas, 100);
  assert.equal(r.origen, 'PPP · vertical · versión vigente «Base» · foto del 1-feb-2026', 'la elegida se rotula vigente al servirla');
  assert.equal(r.v.estado, 'vigente');
  assert.deepEqual(r.versiones, [{ n: 1, nombre: 'Base', estado: 'vigente' }]);
  assert.deepEqual(r.menu, { plan: 'ppp:' + CASO, planes: [{ id: 'ppp:' + CASO, etiqueta: 'Base' }] });
  assert.equal(r.a_medias, false);
  assert.equal(r.elige, undefined, 'sin sesión de Dirección no hay selector');
  assert.equal(r.v.aprobada_por, undefined, 'los nombres de personas no salen');
  assert.doesNotMatch(JSON.stringify(r), /Persona Prueba|abc1234/);
  assert.equal(w.aperturas['libro-ejemplo'], undefined, 'no abre libros de planes');
  assert.equal(w.llamadas.length, 0);
  assert.equal(pide(conFotos([foto({})], { plan_id: 'ppp:' + CASO + ':e1' })).v.ventas, 100);
  // la ficha con sesión pide lo mismo con el mismo permiso de siempre
  const f = w.get({ recurso: 'ppp2-visor', k: LECTOR, plan: 'ppp:' + CASO });
  assert.equal(f.v.ventas, 100);
  assert.deepEqual(f.puede, { compartir: false });
  assert.equal(f.elige, undefined);
  assert.equal(w.get({ recurso: 'ppp2-visor', k: 'llave-que-no-existe-0000', plan: 'ppp:' + CASO }).ok, false);
});

test('sin escenario sirve la elegida y, si no hay, la de mayor orden; una versión fija se sirve tal cual; una propuesta nunca', () => {
  assert.equal(pide(conFotos(tres())).plan.nombre, 'Tres', 'sin elegida, la de mayor orden entre las listas');
  const conElegida = tres(); conElegida[0][col('elegida')] = 'sí';
  assert.equal(pide(conFotos(conElegida)).plan.nombre, 'Uno');
  assert.equal(pide(conFotos(conElegida, { plan_id: 'ppp:' + CASO + ':e2' })).plan.nombre, 'Dos', 'la versión fija no sigue a la elegida');
  assert.equal(pide(conFotos(tres(), { plan_id: 'ppp:' + CASO + ':e4' })).error, 'plan', 'una propuesta no se sirve');
  const propuestaElegida = tres(); propuestaElegida[3][col('elegida')] = 'sí';
  assert.equal(pide(conFotos(propuestaElegida)).error, 'plan', 'marcar una propuesta no la sirve, y tampoco sirve otra en su lugar');
  assert.equal(pide(conFotos(propuestaElegida, { plan_id: 'ppp:' + CASO + ':e2' })).plan.nombre, 'Dos', 'las versiones fijas siguen sirviéndose');
  assert.equal(pide(conFotos(tres().slice(3))).error, 'plan');
  assert.equal(conFotos(tres().slice(3)).get({ recurso: 'ppp2-visor', k: LECTOR, plan: 'ppp:' + CASO }).error, 'plan');
});

test('sin foto, sin pestaña, sin renglón en Config o con un JSON roto: «sin plan», sin romperse', () => {
  assert.equal(pide(conFotos([foto({ caso_id: 'otrocaso01' })])).error, 'plan');
  assert.equal(pide(conFotos([foto({})], {}, { sinPestanaFotos: true })).error, 'plan');
  assert.equal(pide(conFotos([foto({})], {}, { config: [] })).error, 'plan', 'sin potenciales_id');
  assert.equal(pide(conFotos([foto({})], {}, { config: [['potenciales_id', 'corto']] })).error, 'plan');
  assert.equal(pide(conFotos([foto({})], {}, { config: [['potenciales_id', 'noexiste0000000000000000000']] })).error, 'plan');
  assert.equal(pide(conFotos([foto({ visor_json: '{roto' })])).error, 'plan');
  assert.equal(pide(conFotos([foto({ visor_json: '[1,2]' })])).error, 'plan', 'sólo un objeto');
  assert.equal(pide(conFotos([foto({ visor_json: '"texto"' })])).error, 'plan');
  assert.equal(pide(conFotos([foto({ visor_json: vista('Grande', 1, { relleno: 'x'.repeat(50001) }) })])).error, 'plan', 'tope de tamaño');
  const r = pide(conFotos([foto({ visor_json: vista('Pisa', 1, { ok: false, llave: 'mia', menu: { plan: 'x' }, puede: { compartir: true }, marcas: [1] }) })]));
  assert.equal(r.ok, true, 'la foto no puede pisar lo que arma el servidor');
  assert.notEqual(r.llave, 'mia');
  assert.equal(r.menu.plan, 'ppp:' + CASO);
  assert.equal(r.puede, undefined);
  assert.equal(r.marcas, undefined);
});

test('las marcas «deducido de …» de una foto completada salen limpias: rutas bien formadas y texto corto', () => {
  const marcas = { 'v.rv_margen': 'de ventas y costo', 'flujo.total.obra': 'del motor', 'productos.0.ventas': 'x'.repeat(500),
    'Mal.ruta': 'no', 'v': 'sin punto', 'v.a.b.c.d.e': 'muy honda', 'v.vacia': '', 'v.numero': 3 };
  const r = pide(conFotos([foto({ visor_json: vista('Con marcas', 100, { deducido: marcas }) })]));
  assert.equal(r.ok, true);
  assert.deepEqual(Object.keys(r.deducido).sort(), ['flujo.total.obra', 'productos.0.ventas', 'v.rv_margen']);
  assert.equal(r.deducido['productos.0.ventas'].length, 240);
  assert.equal(pide(conFotos([foto({})])).deducido, null, 'sin marcas, null');
  assert.equal(pide(conFotos([foto({ visor_json: vista('Lista', 1, { deducido: ['v.x'] }) })])).deducido, null);
});

test('un id de foto mal formado no se busca', () => {
  const w = conFotos([foto({})]);
  for (const id of ['ppp:', 'ppp:ab', 'ppp:' + CASO + ':', 'ppp:' + CASO + ':e1:x', 'ppp:caso prueba', 'ppp:caso/../x', 'PPP:' + CASO, 'ppp:' + 'a'.repeat(65)]) {
    assert.equal(pide(conFotos([foto({})], { plan_id: id })).error, 'plan', id);
    assert.equal(w.get({ recurso: 'ppp2-visor', k: LECTOR, plan: id }).error, 'plan', id);
  }
});

test('una liga mixta lleva planes con libro y fotos, y deja escoger entre ellos', () => {
  const w = conFotos([foto({})], { plan_id: PLAN + ',ppp:' + CASO + ',ppp:faltante01', etiquetas: 'Con libro|Caso uno|Falta' });
  const a = pide(w);
  assert.deepEqual(a.menu.planes, [{ id: PLAN, etiqueta: 'Con libro' }, { id: 'ppp:' + CASO, etiqueta: 'Caso uno' }]);
  assert.equal(a.plan.nombre, 'Proyecto Ejemplo');
  assert.equal(a.v.ventas, 500);
  const b = pide(w, { plan: 'ppp:' + CASO });
  assert.equal(b.menu.plan, 'ppp:' + CASO);
  assert.equal(b.plan.nombre, 'Caso Ejemplo');
  assert.notEqual(a.llave, b.llave);
  assert.equal(pide(w, { k: ADMIN }).elige, undefined, 'un plan con libro no trae selector de foto');
  const h = conFotos([foto({})], { plan_id: 'ppp:' + CASO, versiones: 'todas' });
  assert.equal(pide(h, { v: '3' }).version, 1, 'versiones de la liga no aplican a una foto');
});

test('preguntar «¿cambió?» de una foto no la vuelve a leer; si cambia su huella o su cálculo, la llave cambia', () => {
  const w = conFotos([foto({})]);
  const r1 = pide(w);
  const abiertas = w.aperturas[POTENCIALES];
  assert.deepEqual(pide(w, { si: r1.llave }), { ok: true, igual: true, llave: r1.llave });
  assert.equal(w.aperturas[POTENCIALES], abiertas, 'dentro de unos segundos ni se abre la pestaña');
  w.cache.delete('vf');
  assert.deepEqual(pide(w, { si: r1.llave }), { ok: true, igual: true, llave: r1.llave }, 'sin cambios, igual');
  const hoja = hojaFotos(w);
  hoja.v[1][col('calculado')] = '2026-02-02 09:00';
  hoja.v[1][col('visor_json')] = vista('Caso Ejemplo', 120);
  assert.deepEqual(pide(w, { si: r1.llave }), { ok: true, igual: true, llave: r1.llave }, 'el índice se comparte unos segundos');
  w.cache.delete('vf');
  const r2 = pide(w, { si: r1.llave });
  assert.equal(r2.igual, undefined);
  assert.notEqual(r2.llave, r1.llave);
  assert.equal(r2.v.ventas, 120);
  hoja.v[1][col('huella_entradas')] = 'h2';
  hoja.v[1][col('visor_json')] = vista('Caso Ejemplo', 130);
  w.cache.delete('vf');
  const r3 = pide(w, { si: r2.llave });
  assert.notEqual(r3.llave, r2.llave);
  assert.equal(r3.v.ventas, 130);
  // la llave de un plan con libro sigue siendo la de siempre: no abre ni la mueve la pestaña de fotos
  const l = mundo({ ligas: [renglon()], fotos: [foto({})], config: [['potenciales_id', POTENCIALES]] });
  const p1 = pide(l);
  assert.equal(l.aperturas[POTENCIALES], undefined);
  assert.deepEqual(pide(l, { si: p1.llave }), { ok: true, igual: true, llave: p1.llave });
});

test('Dirección ve las versiones servibles para escoger la buena, por liga o con sesión; otros roles no', () => {
  const w = conFotos(tres());
  const r = pide(w, { k: ADMIN });
  assert.deepEqual(r.elige, { versiones: [{ v: 'e1', nombre: 'Base', buena: false }, { v: 'e2', nombre: 'Rápida', buena: false }, { v: 'e3', nombre: 'Lenta', buena: true }] });
  assert.equal(w.llamadas.length, 1, 'con k, la liga canjea la sesión');
  assert.equal(r.puede, undefined, 'por liga nada más cambia');
  assert.equal(pide(w, { k: EDITOR }).elige, undefined);
  assert.equal(pide(w, { k: LECTOR }).elige, undefined);
  const malo = pide(w, { k: 'llave-que-no-existe-0000' });
  assert.equal(malo.ok, true, 'una sesión que no vale no estorba a la liga');
  assert.equal(malo.elige, undefined);
  const f = w.get({ recurso: 'ppp2-visor', k: ADMIN, plan: 'ppp:' + CASO + ':e1' });
  assert.equal(f.plan.nombre, 'Uno');
  assert.deepEqual(f.elige.versiones.map((x) => x.buena), [false, false, true], 'buena = la que sirve el caso, aunque se mire una fija');
  assert.equal(w.get({ recurso: 'ppp2-visor', k: EDITOR, plan: 'ppp:' + CASO }).elige, undefined);
  assert.equal(w.get({ recurso: 'ppp2-visor', k: ADMIN, plan: PLAN }).elige, undefined, 'los planes con libro no se eligen aquí');
});

test('ppp2-elige: sólo quien aprueba mueve la elegida; los visores la siguen; idempotente; con pausa no escribe', () => {
  const w = conFotos(tres());
  const antes = pide(w);
  const fija = w.get({ recurso: 'ppp2-visor', k: LECTOR, plan: 'ppp:' + CASO + ':e1' });
  assert.equal(fija.plan.nombre, 'Uno');
  const ficha = w.get({ recurso: 'ppp2-visor', k: LECTOR, plan: 'ppp:' + CASO });
  assert.equal(antes.plan.nombre, 'Tres');
  const hoja = hojaFotos(w), sinCambio = JSON.stringify(hoja.v);
  assert.equal(w.post({ tipo: 'ppp2-elige', k: EDITOR, plan: 'ppp:' + CASO, v: 'e1' }).error, 'permiso');
  assert.equal(w.post({ tipo: 'ppp2-elige', k: LECTOR, plan: 'ppp:' + CASO, v: 'e1' }).error, 'permiso');
  assert.equal(w.post({ tipo: 'ppp2-elige', k: ADMIN, plan: 'ppp:' + CASO, v: 'e9' }).error, 'version', 'versión inexistente');
  assert.equal(w.post({ tipo: 'ppp2-elige', k: ADMIN, plan: 'ppp:' + CASO, v: 'e4' }).error, 'propuesta', 'una propuesta no se elige');
  assert.equal(w.post({ tipo: 'ppp2-elige', k: ADMIN, plan: 'ppp:' + CASO, v: 'e 1' }).error, 'version');
  assert.equal(w.post({ tipo: 'ppp2-elige', k: ADMIN, plan: 'ppp:otrocaso01', v: 'e1' }).error, 'plan');
  assert.equal(w.post({ tipo: 'ppp2-elige', k: ADMIN, plan: PLAN, v: '1' }).error, 'plan', 'un plan con libro no se elige aquí');
  assert.equal(JSON.stringify(hoja.v), sinCambio, 'un intento rechazado no escribe');
  const r = w.post({ tipo: 'ppp2-elige', k: ADMIN, plan: 'ppp:' + CASO, v: 'e1', request_id: 'elige-1' });
  assert.equal(r.ok, true);
  assert.match(r.llave, /^vz_/);
  assert.equal(r.plan, undefined);
  assert.deepEqual(hoja.v.slice(1).map((f) => f[col('elegida')]), ['sí', '', '', '']);
  assert.equal(hoja.v[1][col('elegida_por')], 'Admin Prueba');
  assert.match(String(hoja.v[1][col('elegida_fecha')]), /^\d{4}-\d{2}-\d{2}/);
  const bit = w.vivero.getSheetByName('Bitácora').v;
  assert.deepEqual(bit[bit.length - 1].slice(2, 4), ['visor-elige', 'ppp:' + CASO]);
  // los visores la siguen sin esperar la caché: la llave cambió para todos
  const despues = pide(w, { si: antes.llave });
  assert.notEqual(despues.llave, antes.llave);
  assert.equal(despues.plan.nombre, 'Uno');
  const fija2 = w.get({ recurso: 'ppp2-visor', k: LECTOR, plan: 'ppp:' + CASO + ':e1', si: fija.llave });
  assert.notEqual(fija2.igual, true, 'también cambia la llave de quien mira una fija (su «buena» cambió)');
  assert.equal(fija2.plan.nombre, 'Uno');
  const ficha2 = w.get({ recurso: 'ppp2-visor', k: ADMIN, plan: 'ppp:' + CASO });
  assert.equal(ficha2.llave, r.llave, 'la llave que responde es la de la ficha con sesión');
  assert.notEqual(ficha2.llave, ficha.llave);
  assert.deepEqual(ficha2.elige.versiones.map((x) => x.buena), [true, false, false]);
  // idempotente: el mismo request_id no vuelve a escribir
  const filas = bit.length;
  assert.deepEqual(w.post({ tipo: 'ppp2-elige', k: ADMIN, plan: 'ppp:' + CASO, v: 'e1', request_id: 'elige-1' }), r);
  assert.equal(w.vivero.getSheetByName('Bitácora').v.length, filas);
  // cambiarla otra vez: sólo una queda marcada
  assert.equal(w.post({ tipo: 'ppp2-elige', k: ADMIN, plan: 'ppp:' + CASO, v: 'e2', request_id: 'elige-2' }).ok, true);
  assert.deepEqual(hoja.v.slice(1).map((f) => f[col('elegida')]), ['', 'sí', '', '']);
  assert.equal(pide(w).plan.nombre, 'Dos');
  // desde una liga de versión fija también se elige la del caso
  assert.equal(w.post({ tipo: 'ppp2-elige', k: ADMIN, plan: 'ppp:' + CASO + ':e1', v: 'e3' }).ok, true);
  assert.equal(pide(w).plan.nombre, 'Tres');
  // con pausa no escribe
  const p = conFotos(tres(), {}, { pausa: 'sí' });
  assert.equal(p.post({ tipo: 'ppp2-elige', k: ADMIN, plan: 'ppp:' + CASO, v: 'e1' }).error, 'pausa');
  assert.deepEqual(hojaFotos(p).v.slice(1).map((f) => f[col('elegida')]), ['', '', '', '']);
  // sin las columnas de elección, no escribe nada
  const vieja = conFotos(tres());
  const hv = hojaFotos(vieja);
  hv.v = hv.v.map((f) => f.filter((x, i) => i !== col('elegida')));
  vieja.cache.delete('vf');
  assert.equal(vieja.post({ tipo: 'ppp2-elige', k: ADMIN, plan: 'ppp:' + CASO, v: 'e1' }).error, 'hoja');
});

test('un caso sin escenarios (escenario_id vacío) se sirve por su liga, y elegirlo no rompe nada', () => {
  const w = conFotos([foto({ escenario_id: '', escenario_nombre: 'Base', elegida: 'sí' })]);
  const r = pide(w);
  assert.equal(r.ok, true, 'la foto única de un caso sin escenarios se sirve');
  assert.equal(r.v.ventas, 100);
  assert.equal(r.v.estado, 'vigente');
  assert.deepEqual(pide(w, { k: ADMIN }).elige, { versiones: [{ v: '', nombre: 'Base', buena: true }] });
  const hoja = hojaFotos(w), antes = JSON.stringify(hoja.v), filas = w.vivero.getSheetByName('Bitácora').v.length;
  assert.equal(w.post({ tipo: 'ppp2-elige', k: ADMIN, plan: 'ppp:' + CASO, v: '' }).ok, true);
  assert.equal(JSON.stringify(hoja.v), antes, 'elegir la que ya es la buena no escribe');
  assert.equal(w.vivero.getSheetByName('Bitácora').v.length, filas);
  assert.equal(pide(conFotos([foto({ escenario_id: '' })])).v.ventas, 100, 'sin elegida también');
});

test('manda la foto más reciente de cada versión: una vieja marcada no se sirve, y si la nueva quedó propuesta la versión no se sirve', () => {
  const vieja = foto({ escenario_id: 'e1', orden: 1, elegida: 'sí', elegida_por: 'Admin Prueba', visor_json: vista('Vieja', 1) });
  const nueva = foto({ escenario_id: 'e1', orden: 1, huella_entradas: 'h9', calculado: '2026-03-01 10:00', visor_json: vista('Nueva', 9) });
  const otra = foto({ escenario_id: 'e2', orden: 2, huella_entradas: 'h2', visor_json: vista('Otra', 2) });
  assert.equal(pide(conFotos([vieja, otra, nueva])).plan.nombre, 'Nueva', 'la elegida se sirve con su foto más reciente');
  assert.equal(pide(conFotos([vieja, otra, nueva], { plan_id: 'ppp:' + CASO + ':e1' })).plan.nombre, 'Nueva');
  const rota = foto({ escenario_id: 'e1', orden: 1, estado: 'propuesta', huella_entradas: 'h8', calculado: '2026-03-02 10:00', visor_json: vista('Rota', 8) });
  const w = conFotos([vieja, otra, rota]);
  assert.equal(pide(w).error, 'plan', 'la elegida ya no concilia: no se sirve una foto vieja ni otra versión');
  assert.equal(pide(conFotos([vieja, otra, rota], { plan_id: 'ppp:' + CASO + ':e1' })).error, 'plan');
  assert.deepEqual(w.get({ recurso: 'ppp2-visor', k: ADMIN, plan: 'ppp:' + CASO + ':e2' }).elige.versiones.map((x) => x.v), ['e2']);
  assert.equal(w.post({ tipo: 'ppp2-elige', k: ADMIN, plan: 'ppp:' + CASO, v: 'e1' }).error, 'propuesta', 'no se elige una versión cuya foto más reciente es propuesta');
  assert.equal(w.post({ tipo: 'ppp2-elige', k: ADMIN, plan: 'ppp:' + CASO, v: 'e2' }).ok, true);
  const hoja = hojaFotos(w);
  assert.deepEqual(hoja.v.slice(1).map((f) => [f[col('elegida')], f[col('elegida_por')]]), [['', ''], ['sí', 'Admin Prueba'], ['', '']], 'una sola marcada, sin quién en las demás');
  assert.equal(pide(w).plan.nombre, 'Otra');
  // sin ninguna marcada, la de mayor orden entre las que se pueden servir
  assert.equal(pide(conFotos([foto({ escenario_id: 'e1', orden: 1, visor_json: vista('Uno', 1) }), foto({ escenario_id: 'e2', orden: 2, huella_entradas: 'h2', visor_json: vista('Dos', 2) }),
    foto({ escenario_id: 'e2', orden: 2, estado: 'propuesta', huella_entradas: 'h3', visor_json: vista('Dos rota', 3) })])).plan.nombre, 'Uno');
});

test('la foto sólo entrega su forma, con sus tipos: no pisa campos del servidor ni mete marcado donde va un número', () => {
  const malo = vista('<b>Caso</b>', '<img src=x onerror=alert(1)>', {
    version: '<script>x</script>', versiones: [{ n: '<i>1</i>', nombre: 'a', estado: 'vigente' }, { n: 2, nombre: 'Otra versión', estado: null }],
    elige: { versiones: [{ v: 'e1', nombre: 'x', buena: true }] }, puede: { compartir: true }, ligas: [1], a_medias: true, relleno: 'x',
    plan: { nombre: '<b>Caso</b>', vigente: 7, mostrada: '<u>9</u>', edad: { a: 1 } },
    datos: { 'terreno.m2': { valor: 3000, estado: 'ok' }, 'otra.cosa': { valor: 1 } },
    productos: [{ nombre: 'Tipo A', unidades: '<i>10</i>', m2: 600, ventas: 18 }, { unidades: 3 }, 'texto'],
    flujo: { meses: '<b>2</b>', filas: { cobranza: [1, '<b>', null, 2], inventada: [1] }, total: { cobranza: '3', caja: 4 } },
    reparto: { esquema: 'B', parte_dueno: '0.5', paga_tierra: 'sí', otra: 1 }, candados: [{ candado: 'C1', estado: 'Abierto' }, 'x'],
    pruebas_viejas: '<b>', ultimo: { fecha: '2026-01-01', accion: 'algo', quien: 'Persona Prueba' }, origen: { v: 'objeto' }
  });
  const w = conFotos([foto({ visor_json: malo })]);
  const r = pide(w);
  assert.equal(r.ok, true);
  for (const k of ['puede', 'ligas', 'elige', 'relleno']) assert.equal(r[k], undefined, k);
  assert.equal(r.a_medias, false);
  assert.equal(r.version, 1, 'la versión la pone el servidor (= orden)');
  assert.deepEqual(r.versiones, [{ n: 1, nombre: 'Base', estado: 'vigente' }], 'sólo la versión servida');
  assert.equal(r.plan.nombre, '<b>Caso</b>', 'el texto viaja como texto (la página lo escapa)');
  assert.equal(r.plan.mostrada, 1);
  assert.equal(r.plan.vigente, 1);
  assert.equal(r.plan.edad, null);
  assert.equal(r.v.ventas, '<img src=x onerror=alert(1)>', 'en v un texto sigue siendo texto, como en el libro');
  assert.equal(r.v.aprobada_por, undefined);
  assert.deepEqual(Object.keys(r.datos), ['terreno.m2']);
  assert.deepEqual(r.productos, [{ nombre: 'Tipo A', unidades: null, m2: 600, precio_m2: null, ventas: 18, precio_unidad: null }]);
  assert.equal(r.flujo.meses, null);
  assert.deepEqual(r.flujo.filas, { cobranza: [1, 0, 0, 2] });
  assert.deepEqual(r.flujo.total, { cobranza: null, caja: 4 });
  assert.deepEqual(r.reparto, { numero: null, esquema: 'B', tasa_capital: null, paga_tierra: null, parte_dueno: null, parte_alianza: null, parte_capital: null, honorarios_pct: null });
  assert.deepEqual(r.candados, [{ candado: 'C1', estado: 'abierto' }]);
  assert.equal(r.pruebas_viejas, null);
  assert.deepEqual(r.ultimo, { fecha: '2026-01-01', accion: 'algo' });
  assert.equal(r.origen, null);
  assert.doesNotMatch(JSON.stringify(r), /Persona Prueba|Otra versión/);
  // con la sesión de Dirección, `elige` lo arma el servidor, no la foto
  assert.deepEqual(pide(w, { k: ADMIN }).elige, { versiones: [{ v: 'e1', nombre: 'Base', buena: true }] });
});

test('una versión fija que no es la elegida no se rotula vigente', () => {
  const conElegida = tres(); conElegida[0][col('elegida')] = 'sí';
  const r = pide(conFotos(conElegida, { plan_id: 'ppp:' + CASO + ':e2' }));
  assert.equal(r.plan.nombre, 'Dos');
  assert.equal(r.v.estado, null);
  assert.equal(r.plan.vigente, null);
  assert.deepEqual(r.versiones, [{ n: 2, nombre: 'Rápida', estado: null }]);
  assert.equal(r.origen, 'PPP · vertical · versión «Base» · foto del 1-feb-2026');
});
