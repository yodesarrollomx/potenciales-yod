'use strict';
/* Árbol PPP de punta a punta, sin red: el puente de la página (arbol-ppp/servidor.js) habla con el servidor REAL del PPP 2
   (doGet y doPost de server/ppp2/PPP2.gs, con ArbolPPP.gs cargado en el mismo contexto) sobre el mundo de dobles de tests/ppp2-mundo.cjs.
   El «libro Maestro» es un doble en memoria con los factores de la definición; el plan es el caso de muestra inventado.
   Nada aquí habla con Google ni con el Portero real, y un doble no demuestra el comportamiento de Google Sheets. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { mundo, ADMIN, EDITOR, LECTOR } = require('./ppp2-mundo.cjs');
const RAIZ = path.join(__dirname, '..');
const { Hoja } = require(path.join(RAIZ, 'arbol-ppp/conexion/doble-sheets.cjs'));
const C = require(path.join(RAIZ, 'arbol-ppp/conexion/caso-muestra.cjs'));
const Conexion = require(path.join(RAIZ, 'arbol-ppp/conexion/conexion.js'));
const Servidor = require(path.join(RAIZ, 'arbol-ppp/servidor.js'));
const Motor = C.Motor;
const ARBOL_GS = fs.readFileSync(path.join(RAIZ, 'server/ppp2/ArbolPPP.gs'), 'utf8');
const MAESTRO = 'maestro0000000000000000000001';
const EP = 'https://script.google.com/macros/s/PRUEBA/exec';
const SIN = { sugerencias: 'no', rutas: 'no' };

/* El libro Maestro de prueba: identidad, todos los factores de la definición, la plantilla en J (con dos fórmulas) y una columna hecha a mano en K. */
function libroMaestro() {
  const ident = ['I-01', 'I-02', 'I-03', 'I-04', 'I-05', 'I-06', 'I-07', 'I-08'];
  const ids = ident.concat(C.MAESTRO.ARBOL_FACTORES.slice(1).map((f) => f[0]).filter((id) => ident.indexOf(id) < 0));
  const filas = [['ID', 'Factor'], ['', 'IDENTIDAD']].concat(ids.map((id) => [id, 'Factor ' + id]));
  const h = new Hoja('MAESTRO', filas, 14);
  const renglon = (id) => 3 + ids.indexOf(id);
  h.put(1, 10, '=IF({c}3="","",{c}3)'); h.put(3, 10, 'PLANTILLA');
  h.put(renglon('T-05'), 10, '={c}' + renglon('T-04') + '/{c}' + renglon('T-01'));   // dos factores con fórmula en la plantilla: el árbol no los escribe
  h.put(renglon('PT-07'), 10, '={c}' + renglon('T-01') + '*2');
  h.put(3, 11, 'Plan hecho a mano'); h.put(renglon('I-04'), 11, 'Borrador'); h.put(renglon('I-06'), 11, 'Persona'); h.put(renglon('T-01'), 11, 123);
  const hojas = { MAESTRO: h, CAMBIOS: new Hoja('CAMBIOS', [['Fecha', 'Quién', 'Qué se hizo', 'Columna o factor', 'Fuente', 'Pendiente']], 6) };
  Object.keys(C.MAESTRO).forEach((n) => { hojas[n] = new Hoja(n, C.MAESTRO[n], 60); });
  return { hojas, h, renglon, ids };
}
function entorno(config) {
  const w = mundo(), m = libroMaestro();
  vm.runInContext(ARBOL_GS, w.ctx, { filename: 'ArbolPPP.gs' });
  w.libros[MAESTRO] = { getSheetByName: (n) => m.hojas[n] || null };
  const cfg = w.vivero.getSheetByName('Config');
  Object.entries(Object.assign({ maestro_id: MAESTRO, maestro_plantilla: 'J', arbol: 'sí' }, config || {})).forEach(([k, v]) => { if (v !== undefined) cfg.v.push([k, v]); });
  const pedidos = [];
  const traer = async (url, o) => {
    pedidos.push({ url, metodo: (o && o.method) || 'GET' });
    if (!url.startsWith(EP)) throw new Error('fuera del servidor de prueba: ' + url);
    const r = o && o.method === 'POST' ? w.post(JSON.parse(o.body)) : w.get(Object.fromEntries(new URL(url).searchParams));
    return { json: async () => JSON.parse(JSON.stringify(r)) };
  };
  const cliente = (k) => {
    const mem = {}; if (k) mem.pyod_clave_v1 = k;
    const almacen = { getItem: (x) => (x in mem ? mem[x] : null), setItem: (x, v) => { mem[x] = String(v); }, removeItem: (x) => { delete mem[x]; } };
    return { N: Servidor.nucleo({ endpoint: EP, fetch: traer, almacen, motor: Motor, conexion: Conexion }), mem };
  };
  return { w, m, pedidos, cliente };
}
const cifras = (def, plan) => { const r = Motor.evalua(def, plan, null, SIN), o = {}; r.nodos.forEach((n) => { o[n.id] = n.valor; }); return { o, res: r }; };

test('apagado por omisión: sin  arbol = sí  en Config el servidor contesta «apagado», la página trabaja con su definición y el vivero dice arbol: false', async () => {
  const e = entorno({ arbol: undefined }), c = e.cliente(EDITOR);
  const d = await c.N.definicion();
  assert.equal(d.modo, 'local'); assert.equal(d.codigo, 'apagado'); assert.match(d.aviso, /no se guarda en el libro/);
  assert.equal(e.w.get({ recurso: 'ppp2-vivero', k: EDITOR }).arbol, false);
  assert.equal(e.w.post({ k: EDITOR, tipo: 'arbol-guarda', columna: [{ id: 'T-01', valor: 1 }] }).error, 'apagado');
  assert.equal(e.m.h.getLastColumn(), 11, 'nada se escribió'); assert.equal(e.m.hojas.CAMBIOS.getLastRow(), 1);
});

test('sin sesión no se pregunta al servidor; con una sesión que no sirve, el servidor no entrega nada del árbol', async () => {
  const e = entorno();
  const d = await e.cliente('').N.definicion();
  assert.equal(d.modo, 'local'); assert.equal(d.codigo, 'sin_sesion'); assert.equal(e.pedidos.length, 0);
  for (const r of ['arbol-definicion', 'arbol-columnas', 'arbol-columna']) {
    assert.equal(e.w.get({ recurso: r, columna: 'L' }).error, 'sin_sesion');
    assert.equal(e.w.get({ recurso: r, columna: 'L', k: 'syzzzzzzzzzzzzzzzzzzzzzz' }).error, 'liga');
    assert.equal(e.w.get({ recurso: r, columna: 'L', k: 'syotroboard0000000000000' }).error, 'board', 'sin el tablero PT no entra');
  }
  assert.equal(e.w.post({ tipo: 'arbol-guarda', columna: [{ id: 'T-01', valor: 1 }] }).error, 'sin_sesion');
  assert.equal(e.w.post({ k: 'syotroboard0000000000000', tipo: 'arbol-guarda', columna: [{ id: 'T-01', valor: 1 }] }).error, 'board');
  assert.equal(e.m.h.getLastColumn(), 11);
});

test('con sesión y el árbol encendido la página recibe la definición del libro, que carga sin errores; el vivero dice arbol: true', async () => {
  const e = entorno(), d = await e.cliente(LECTOR).N.definicion();
  assert.equal(d.modo, 'libro'); assert.equal(d.puede.guardar, false, 'quien solo lee no guarda');
  assert.equal((await e.cliente(EDITOR).N.definicion()).puede.guardar, true);
  assert.equal(Motor.carga(d.tablas).errores.length, 0);
  assert.equal(e.w.get({ recurso: 'ppp2-vivero', k: LECTOR }).arbol, true);
});

test('guardar y abrir: el caso de muestra se guarda como columna en Borrador y, abierto en otro navegador, da las mismas cifras', async () => {
  const e = entorno(), a = e.cliente(EDITOR), d = await a.N.definicion(), def = d.definicion;
  const plan = C.planMuestra(def), antes = cifras(def, plan);
  assert.equal(antes.res.pruebas.resultado.slice(0, 4), 'Pasa');
  const g = await a.N.guarda(def, plan, { nombre: 'Predio de muestra', version: 'V1' });
  assert.equal(g.ok, true, JSON.stringify(g)); assert.equal(g.columna, 'L', 'K es de una persona: no se toca'); assert.equal(g.estado, 'Borrador');
  assert.deepEqual(Array.from(g.ignorados).sort(), ['PT-07', 'T-05'], 'los factores con fórmula en la plantilla no se escriben');
  assert.equal(e.m.h.celda(e.m.renglon('T-01'), 12).v, 2000); assert.equal(e.m.h.celda(e.m.renglon('T-04'), 12).v, 14000000);
  assert.equal(e.m.h.celda(e.m.renglon('T-05'), 12).f, '=L' + e.m.renglon('T-04') + '/L' + e.m.renglon('T-01'), 'la fórmula es la de la plantilla, en su columna');
  assert.equal(e.m.h.celda(e.m.renglon('T-01'), 11).v, 123, 'la columna hecha a mano sigue igual');
  assert.match(String(e.m.hojas.CAMBIOS.getRange(2, 3).getValue()), /Columna nueva del Árbol PPP/);
  assert.deepEqual(a.N.origen(), { columna: 'L', rev: g.rev, nombre: 'Predio de muestra', version: 'V1' });

  const b = e.cliente(LECTOR), l = await b.N.lista();
  assert.deepEqual(l.columnas.map((c) => [c.columna, c.nombre, c.estado, c.quien]), [['L', 'Predio de muestra', 'Borrador', 'Editora Prueba']]);
  const o = await b.N.abre(def, 'L');
  assert.equal(o.ok, true, JSON.stringify(o)); assert.equal(o.avisos, 0);
  const vuelto = JSON.parse(b.mem[Servidor.CLAVES.plan]).plan, despues = cifras(def, vuelto);
  const dif = Object.keys(antes.o).filter((id) => { const x = antes.o[id], y = despues.o[id]; return typeof x === 'number' && typeof y === 'number' ? Math.abs(x - y) > 1e-6 * Math.max(1, Math.abs(x)) : String(x) !== String(y); });
  assert.deepEqual(dif, [], 'cifras que cambiaron al guardar y abrir');
  assert.equal(despues.res.pruebas.resultado, antes.res.pruebas.resultado);
  assert.equal((await b.N.abre(def, 'K')).error, 'columna_ajena', 'una columna hecha a mano no se abre por esta ruta');
});

test('quien solo lee no guarda, y con el servidor en pausa nadie guarda', async () => {
  const e = entorno(), l = e.cliente(LECTOR), def = (await l.N.definicion()).definicion, plan = C.planMuestra(def);
  assert.equal((await l.N.guarda(def, plan, { nombre: 'x' })).error, 'permiso');
  const p = entorno({ pausa: 'sí' }), ed = p.cliente(EDITOR), d2 = await ed.N.definicion();
  assert.equal(d2.puede.guardar, false);
  assert.equal((await ed.N.guarda(d2.definicion, C.planMuestra(d2.definicion), { nombre: 'x' })).error, 'pausa');
  assert.equal(e.m.h.getLastColumn(), 11); assert.equal(p.m.h.getLastColumn(), 11);
});

test('dos personas con el mismo plan abierto: la segunda no pisa a la primera; recibe «revision» y su columna de origen no cambia', async () => {
  const e = entorno(), a = e.cliente(EDITOR), def = (await a.N.definicion()).definicion, plan = C.planMuestra(def);
  await a.N.guarda(def, plan, { nombre: 'Compartido' });
  const b = e.cliente(ADMIN); assert.equal((await b.N.abre(def, 'L')).ok, true);
  const planA = Motor.evalua(def, plan, { 'T-04': { valor: 15, estado: 'decidido' } }, SIN).plan;
  const ga = await a.N.guarda(def, planA, { nombre: 'Compartido', sobre: true });
  assert.equal(ga.ok, true, JSON.stringify(ga)); assert.equal(ga.columna, 'L'); assert.equal(ga.nueva, false);
  const planB = Motor.evalua(def, JSON.parse(b.mem[Servidor.CLAVES.plan]).plan, { 'T-04': { valor: 16, estado: 'decidido' } }, SIN).plan;
  const gb = await b.N.guarda(def, planB, { nombre: 'Compartido', sobre: true });
  assert.equal(gb.error, 'revision'); assert.match(Servidor.texto(gb.error), /No lo pisé/);
  assert.equal(e.m.h.celda(e.m.renglon('T-04'), 12).v, 15000000, 'queda lo de la primera persona');
  const nuevo = await b.N.guarda(def, planB, { nombre: 'Compartido (otra)' });
  assert.equal(nuevo.ok, true); assert.equal(nuevo.columna, 'M'); assert.equal(e.m.h.celda(e.m.renglon('T-04'), 13).v, 16000000);
});

test('el puente usa la misma dirección del servidor que ppp2.js, no borra la credencial del Portero y no trae otras ligas ni llaves', () => {
  const fuente = fs.readFileSync(path.join(RAIZ, 'arbol-ppp/servidor.js'), 'utf8'), ppp2 = fs.readFileSync(path.join(RAIZ, 'ppp2.js'), 'utf8');
  const ep = /var ENDPOINT = window\.PPP2_ENDPOINT \|\| '([^']+)'/.exec(ppp2)[1];
  assert.equal(Servidor.ENDPOINT, ep);
  assert.equal((fuente.match(/https:\/\/[^'"\s)]+/g) || []).filter((u) => u !== ep).length, 0, 'ninguna otra dirección');
  assert.ok(!/removeItem\(LLAVE\)|quita\(LLAVE\)|localStorage\.clear/.test(fuente));
  assert.ok(!/\beval\(|new Function\(|innerHTML\s*=\s*[^h'"]/.test(fuente.replace(/barra\.innerHTML = h;/, '')));
});
