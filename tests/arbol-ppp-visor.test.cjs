'use strict';
/* El visor enseña las versiones del Árbol PPP, de punta a punta y sin red: el puente de la página (arbol-ppp/servidor.js) guarda una
   versión en el Maestro de prueba con el servidor REAL (PPP2.gs, Visor.gs y ArbolPPP.gs en el mismo contexto) y una liga del visor la
   pide por la ruta de las fotos (`ppp:arbol-<proyecto>`). El plan es el caso de muestra inventado. Un doble no demuestra el
   comportamiento de Google Sheets. */
const test = require('node:test');
const assert = require('node:assert/strict');
const { ADMIN, EDITOR, FOTO_CAB, POTENCIALES } = require('./ppp2-mundo.cjs');
const { entorno, C, Motor, Hoja } = require('./arbol-ppp-servidor-mundo.cjs');

const LIGA = 'liga0000000000000000000000000001';
const NOMBRE = 'Predio de Muestra · Ñandú 12';
const CASO = 'arbol-predio-de-muestra-nandu-12';
const renglon = (plan) => [LIGA, plan, 'Grupo de prueba', 'activa', '', '', '', '2026-01-01', ''];
const con = (plan, sinHoja, config) => {
  const e = entorno(config, 30, { ligas: [renglon(plan || 'ppp:' + CASO)] });
  if (!sinHoja) e.m.hojas.ARBOL_VISOR = new Hoja('ARBOL_VISOR', [FOTO_CAB], FOTO_CAB.length);
  return e;
};
const pide = (e, extra) => e.w.get(Object.assign({ recurso: 'ppp2-visor', liga: LIGA }, extra || {}));
const casi = (a, b, msg) => assert.ok(typeof a === 'number' && Math.abs(a - b) <= 1e-5 * Math.max(1, Math.abs(b)), (msg || 'valor') + ': ' + a + ' vs ' + b);
const renglones = (e) => e.m.hojas.ARBOL_VISOR.getLastRow() - 1;
const celda = (e, fila, col) => e.m.hojas.ARBOL_VISOR.getRange(fila, FOTO_CAB.indexOf(col) + 1).getValue();

test('guardar en el libro deja la versión en el visor: la liga la enseña con la identidad del libro y las cifras del motor', async () => {
  const e = con(), a = e.cliente(EDITOR), def = (await a.N.definicion()).definicion, plan = C.planMuestra(def);
  assert.equal(pide(e).ok, false, 'antes de guardar no hay nada que enseñar');
  const g = await a.N.guarda(def, plan, { nombre: NOMBRE, version: 'V1' });
  assert.equal(g.ok, true, JSON.stringify(g)); assert.equal(g.visor, 'guardado');
  assert.equal(renglones(e), 1);
  assert.equal(celda(e, 2, 'caso_id'), CASO); assert.equal(celda(e, 2, 'escenario_id'), 'c' + g.columna); assert.equal(celda(e, 2, 'estado'), 'lista');
  assert.equal(celda(e, 2, 'huella_entradas'), g.rev, 'la huella es la revisión de la columna');
  const esperado = Motor.paqueteVisor(def, plan), r = pide(e);
  assert.equal(r.ok, true, JSON.stringify(r).slice(0, 300)); assert.equal(r.esquema, 'ppp2-visor-v1');
  assert.equal(r.plan.nombre, NOMBRE, 'el nombre es el del libro, no «Plan del Árbol PPP»');
  assert.equal(r.versiones[0].nombre, 'V1');
  casi(r.v.ventas, esperado.v.ventas, 'ventas'); casi(r.v.ganancia, esperado.v.ganancia, 'ganancia');
  assert.equal(r.flujo.meses, esperado.flujo.meses); assert.ok(r.flujo.meses > 0, 'trae el flujo mes a mes');
  assert.equal(r.productos.length, esperado.productos.length);
  assert.match(r.origen, /^Árbol PPP · versión vigente «V1» · guardada en el libro el /);
  assert.doesNotMatch(r.origen, /no sincronizado/);
});

test('volver a guardar la misma versión cambia lo que enseña el visor y su llave, sin duplicar el renglón', async () => {
  const e = con(), a = e.cliente(EDITOR), def = (await a.N.definicion()).definicion;
  const uno = C.planMuestra(def), dos = C.planProblemas(def);
  const g1 = await a.N.guarda(def, uno, { nombre: NOMBRE, version: 'V1' }); assert.equal(g1.visor, 'guardado');
  const r1 = pide(e);
  const g2 = await a.N.guarda(def, dos, { nombre: NOMBRE, version: 'V1', sobre: true });
  assert.equal(g2.ok, true, JSON.stringify(g2)); assert.equal(g2.columna, g1.columna); assert.equal(g2.visor, 'guardado');
  assert.equal(renglones(e), 1, 'una columna, un renglón'); assert.equal(celda(e, 2, 'orden'), 1, 'y conserva su número');
  const r2 = pide(e), esperado = Motor.paqueteVisor(def, dos);
  assert.notEqual(r2.llave, r1.llave, 'quien tiene el visor abierto se entera en su siguiente sondeo');
  casi(r2.v.ventas, esperado.v.ventas, 'ventas de la versión vuelta a guardar');
});

test('dos columnas del mismo proyecto son dos versiones: rige la de más a la derecha hasta que Dirección elige otra', async () => {
  const e = con(), a = e.cliente(ADMIN), def = (await a.N.definicion()).definicion;
  const g1 = await a.N.guarda(def, C.planMuestra(def), { nombre: NOMBRE, version: 'V1' });
  const g2 = await a.N.guarda(def, C.planProblemas(def), { nombre: '  predio de muestra · ñandú 12 ', version: 'V2' });
  assert.equal(g2.visor, 'guardado'); assert.notEqual(g2.columna, g1.columna); assert.equal(renglones(e), 2);
  assert.equal(celda(e, 3, 'caso_id'), CASO, 'mayúsculas, acentos y espacios no hacen otro proyecto');
  assert.equal(celda(e, 2, 'orden'), 1); assert.equal(celda(e, 3, 'orden'), 2, 'las versiones se numeran 1, 2, 3… dentro de su proyecto');
  assert.equal(pide(e).versiones[0].nombre, 'V2', 'por omisión, la última');
  const el = e.w.post({ tipo: 'ppp2-elige', k: ADMIN, plan: 'ppp:' + CASO, v: 'c' + g1.columna, request_id: 'r-elige-1' });
  assert.equal(el.ok, true, JSON.stringify(el));
  const r = pide(e);
  assert.equal(r.versiones[0].nombre, 'V1', 'la elegida manda'); assert.equal(r.versiones[0].estado, 'vigente');
  assert.equal(celda(e, 2, 'elegida'), 'sí');
  const g3 = await a.N.guarda(def, C.planMuestra(def), { nombre: NOMBRE, version: 'V3' });
  assert.equal(g3.visor, 'guardado');
  assert.equal(pide(e).versiones[0].nombre, 'V1', 'una versión nueva no quita la que Dirección eligió');
});

test('sin la pestaña ARBOL_VISOR el plan se guarda igual y el visor no enseña nada; con el árbol apagado tampoco', async () => {
  const e = con(null, true), a = e.cliente(EDITOR), def = (await a.N.definicion()).definicion;
  const g = await a.N.guarda(def, C.planMuestra(def), { nombre: NOMBRE, version: 'V1' });
  assert.equal(g.ok, true); assert.equal(g.visor, 'sin_hoja');
  assert.equal(pide(e).ok, false);
  const e2 = con(), a2 = e2.cliente(EDITOR), def2 = (await a2.N.definicion()).definicion;
  assert.equal((await a2.N.guarda(def2, C.planMuestra(def2), { nombre: NOMBRE, version: 'V1' })).visor, 'guardado');
  assert.equal(pide(e2).ok, true);
  /* la misma hoja, con el árbol apagado en Config: sus versiones no se sirven */
  const e3 = con(null, false, { arbol: 'no' });
  e3.m.hojas.ARBOL_VISOR = e2.m.hojas.ARBOL_VISOR;
  assert.equal(pide(e3).ok, false, 'apagar el árbol apaga sus versiones en el visor');
});

test('lo que el servidor guarda y sirve es sólo datos: paquete ajeno, demasiado grande o con marcado', async () => {
  const e = con(), def = (await e.cliente(EDITOR).N.definicion()).definicion, plan = C.planMuestra(def);
  const base = { tipo: 'arbol-guarda', k: EDITOR, nombre: NOMBRE, version: 'V1', escenario: 'ARBOL', columna: [{ id: 'T-01', valor: 2000 }] };
  assert.equal(e.w.post(Object.assign({}, base, { request_id: 'a1' })).visor, 'sin_paquete');
  assert.equal(e.w.post(Object.assign({}, base, { request_id: 'a2', visor: '{no es json' })).visor, 'invalido');
  assert.equal(e.w.post(Object.assign({}, base, { request_id: 'a3', visor: JSON.stringify({ esquema: 'otro' }) })).visor, 'invalido');
  assert.equal(e.w.post(Object.assign({}, base, { request_id: 'a4', visor: 'x'.repeat(50001) })).visor, 'grande');
  assert.equal(renglones(e), 0, 'nada de eso llegó a la hoja');
  const paq = Motor.paqueteVisor(def, plan);
  paq.cascada = { estado: 'teórico <b>x</b>', totales: { simulado: 10.5, autorizado: 0 }, 'R-13': { valor: 1 }, 'clave rara!': 1, lista: [1, '<i>dos</i>', { a: Infinity }] };
  paq.extra_que_no_es_de_la_forma = '<script>1</script>';
  const g = e.w.post(Object.assign({}, base, { request_id: 'a5', visor: JSON.stringify(paq) }));
  assert.equal(g.visor, 'guardado', JSON.stringify(g));
  const r = pide(e);
  assert.equal(r.ok, true); assert.equal('extra_que_no_es_de_la_forma' in r, false);
  assert.deepEqual(JSON.parse(JSON.stringify(r.cascada)), { estado: 'teórico bx/b', totales: { simulado: 10.5, autorizado: 0 }, 'R-13': { valor: 1 }, lista: [1, 'idos/i', { a: null }] });
});

test('el prefijo decide la hoja: un caso arbol- en PPP_VISOR no se sirve y una foto del PPP 1 no trae cascada', () => {
  const vista = JSON.stringify({ esquema: 'ppp2-visor-v1', plan: { nombre: 'Caso' }, v: { ventas: 100 }, cascada: { estado: 'x' }, origen: 'PPP · vertical · versión «Base»' });
  const foto = (caso) => FOTO_CAB.map((k) => ({ caso_id: caso, tipo: 'vertical', escenario_id: 'e1', escenario_nombre: 'Base', estado: 'lista', orden: 1, huella_entradas: 'h1', calculado: '2026-02-01 10:00', visor_json: vista })[k] || '');
  const e = entorno(undefined, undefined, { ligas: [renglon('ppp:' + CASO)], fotos: [foto(CASO)], config: [['potenciales_id', POTENCIALES]] });
  assert.equal(pide(e).ok, false, 'arbol- sólo se lee del Maestro');
  const e2 = entorno(undefined, undefined, { ligas: [renglon('ppp:caso-del-ppp1')], fotos: [foto('caso-del-ppp1')], config: [['potenciales_id', POTENCIALES]] });
  const r = pide(e2);
  assert.equal(r.ok, true, JSON.stringify(r).slice(0, 200)); assert.equal('cascada' in r, false);
});

test('«Agregar versión» deja la versión nueva en el visor desde el principio, con las cifras de la columna copiada', async () => {
  const e = con(), a = e.cliente(EDITOR), def = (await a.N.definicion()).definicion, plan = C.planMuestra(def);
  const g1 = await a.N.guarda(def, plan, { nombre: NOMBRE, version: 'V1' }); assert.equal(g1.visor, 'guardado');
  assert.equal((await a.N.abre(def, g1.columna)).ok, true);
  const d = await a.N.guarda(def, null, { version: 'V2 · copia', derivada: true });
  assert.equal(d.ok, true, JSON.stringify(d)); assert.notEqual(d.columna, g1.columna);
  assert.equal(d.visor, 'guardado', 'la copia trae su paquete del visor: ' + JSON.stringify(d.visor));
  assert.equal(renglones(e), 2, 'dos columnas, dos versiones en el visor');
  const esc = 'c' + d.columna, r = pide(e, { plan: 'ppp:' + CASO + ':' + esc });
  assert.equal(r.ok, true, JSON.stringify(r).slice(0, 300));
  assert.equal(r.v.nombre, 'V2 · copia');
  casi(r.v.ventas, Motor.paqueteVisor(def, plan).v.ventas, 'la copia enseña las mismas ventas que su base');
});
