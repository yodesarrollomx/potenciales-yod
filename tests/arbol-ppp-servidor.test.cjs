'use strict';
/* Árbol PPP de punta a punta, sin red: el puente de la página (arbol-ppp/servidor.js) habla con el servidor REAL del PPP 2
   (doGet y doPost de server/ppp2/PPP2.gs, con ArbolPPP.gs cargado en el mismo contexto) sobre el mundo de dobles de tests/ppp2-mundo.cjs.
   El «libro Maestro» es un doble en memoria con los factores de la definición; el plan es el caso de muestra inventado.
   Nada aquí habla con Google ni con el Portero real, y un doble no demuestra el comportamiento de Google Sheets. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { ADMIN, EDITOR, LECTOR } = require('./ppp2-mundo.cjs');
const { entorno, RAIZ, C, Conexion, Servidor, Motor, SIN } = require('./arbol-ppp-servidor-mundo.cjs');
const EP = 'https://script.google.com/macros/s/PRUEBA/exec';
const cifras = (def, plan) => { const r = Motor.evalua(def, plan, null, SIN), o = {}; r.nodos.forEach((n) => { o[n.id] = n.valor; }); return { o, res: r }; };

test('apagado por omisión: sin  arbol = sí  en Config el servidor contesta «apagado», la página trabaja con su definición y el vivero dice arbol: false', async () => {
  const e = entorno({ arbol: undefined }), c = e.cliente(EDITOR);
  const d = await c.N.definicion();
  assert.equal(d.modo, 'local'); assert.equal(d.codigo, 'apagado'); assert.match(d.aviso, /no se guarda en el libro/);
  assert.equal(e.w.get({ recurso: 'ppp2-vivero', k: EDITOR }).arbol, false);
  assert.equal(e.w.post({ k: EDITOR, tipo: 'arbol-guarda', columna: [{ id: 'T-01', valor: 1 }] }).error, 'apagado');
  assert.equal(e.m.h.getLastColumn(), 11, 'nada se escribió'); assert.equal(e.m.hojas.CAMBIOS.getLastRow(), 1);
});

test('con un servidor que todavía no trae las rutas del árbol (responde «recurso»), la página lo dice en palabras y sigue con su definición', async () => {
  const mem = { pyod_clave_v1: EDITOR }, almacen = { getItem: (x) => (x in mem ? mem[x] : null), setItem: (x, v) => { mem[x] = String(v); }, removeItem: (x) => { delete mem[x]; } };
  const traer = async () => ({ json: async () => ({ ok: false, error: 'recurso' }) });
  const d = await Servidor.nucleo({ endpoint: EP, fetch: traer, almacen, motor: Motor, conexion: Conexion }).definicion();
  assert.equal(d.modo, 'local'); assert.equal(d.codigo, 'recurso'); assert.match(d.aviso, /todavía no está conectado al libro/); assert.ok(!/«recurso»/.test(d.aviso));
  const roto = async () => ({ json: async () => { throw new Error('no es JSON'); } });
  const d2 = await Servidor.nucleo({ endpoint: EP, fetch: roto, almacen, motor: Motor, conexion: Conexion }).definicion();
  assert.equal(d2.modo, 'local'); assert.equal(d2.codigo, 'red'); assert.match(d2.aviso, /puede estar desactualizada/);
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

test('versiones de un proyecto: lista completa, derivación aislada, origen y reapertura', async () => {
  const e = entorno({}, 30), a = e.cliente(EDITOR), d = await a.N.definicion(), def = d.definicion;
  assert.equal(d.puede.versiones, true);
  const plan = C.planMuestra(def), nombre = 'Proyecto de prueba';
  const iniciales = [];
  for (const version of ['V1', 'V1', 'V3', 'V4', 'V5', 'V6', 'V7', 'V8', 'V9']) {
    const g = await a.N.guarda(def, plan, { nombre, version });
    assert.equal(g.ok, true, JSON.stringify(g));
    iniciales.push(g);
  }
  assert.equal((await a.N.guarda(def, plan, { nombre: 'Otro proyecto', version: 'V1' })).ok, true);
  e.m.h.put(e.m.renglon('I-03'), 12, 'BASE');
  e.m.h.put(e.m.renglon('I-03'), 13, 'COMBI');
  e.m.h.put(e.m.renglon('I-07'), 14, 'Ficha de prueba · comparativo B3:B51');
  e.m.h.put(e.m.renglon('X-01'), 14, 'Captura del libro que el árbol no interpreta');
  const lee = (columna) => e.w.get({ recurso: 'arbol-columna', k: EDITOR, columna });
  const base = lee(iniciales[2].columna), copias = iniciales.map((c) => lee(c.columna));
  assert.equal((await a.N.abre(def, base.columna)).ok, true);
  const anterior = await a.N.lista();
  const delProyecto = a.N.versiones(a.N.origen(), anterior.columnas);
  assert.equal(delProyecto.length, iniciales.length);
  assert.deepEqual(delProyecto.filter((c) => c.version === 'V1').map((c) => c.escenario), ['BASE', 'COMBI']);
  assert.equal((await a.N.guarda(def, null, { version: ' V4 ', derivada: true })).error, 'version_repetida');
  const g = await a.N.guarda(def, null, { nombre: 'Este nombre no se usa', version: 'Borrador de prueba', derivada: true });
  assert.equal(g.ok, true, JSON.stringify(g));
  assert.equal(g.nueva, true);
  assert.equal(g.nombre, nombre);
  assert.match(g.cambio, new RegExp('V3 · columna ' + base.columna + ' · revisión ' + base.rev));
  /* la derivación deja su renglón en CAMBIOS; enseguida el árbol guarda el paquete del visor sobre esa misma columna (otro renglón) */
  const ultimas = e.m.hojas.CAMBIOS.getRange(e.m.hojas.CAMBIOS.getLastRow() - 1, 1, 2, 6).getValues();
  const fila = ultimas.find((r) => String(r[2]).includes(g.cambio));
  assert.ok(fila, 'el renglón de la derivación está en CAMBIOS');
  assert.equal(fila[1], 'Editora Prueba');
  assert.equal(fila[3], g.columna);
  assert.equal(ultimas[1][3], g.columna, 'el guardado del visor es sobre la columna nueva');
  assert.ok(g.visor, 'la derivación trae el resultado del paquete del visor');
  const datos = (col) => Object.fromEntries(lee(col).valores.map((v) => [v.id, v.valor]));
  const clonada = datos(g.columna);
  assert.equal(clonada['C-01'], datos(base.columna)['C-01']);
  assert.match(clonada['I-07'], /comparativo B3:B51/);
  assert.equal(clonada['X-01'], datos(base.columna)['X-01']);
  assert.equal((await a.N.abre(def, g.columna)).ok, true);
  const enPantalla = JSON.parse(a.mem[Servidor.CLAVES.plan]).plan;
  const editado = Motor.evalua(def, enPantalla, { 'C-01': { valor: 23100, estado: 'decidido' } }, SIN).plan;
  assert.equal((await a.N.guarda(def, editado, { nombre, version: g.version, sobre: true })).ok, true);
  assert.equal(datos(g.columna)['I-07'], clonada['I-07']);
  assert.equal(datos(g.columna)['X-01'], clonada['X-01']);
  for (const original of copias) assert.equal(lee(original.columna).rev, original.rev);
  const b = e.cliente(LECTOR);
  assert.equal((await b.N.abre(def, g.columna)).ok, true);
  const vuelta = JSON.parse(b.mem[Servidor.CLAVES.plan]).plan;
  assert.equal(vuelta.valores['C-01'].valor, 23100);
  const abierto = b.N.origen(), guardadas = b.N.versiones(abierto, (await b.N.lista()).columnas);
  assert.deepEqual(guardadas.map((c) => c.columna), [...iniciales.map((o) => o.columna), g.columna]);
  assert.equal(guardadas.at(-1).cambio, clonada['I-07']);
  a.N.fijaOrigen({ columna: base.columna, rev: 'r-vieja' });
  assert.equal((await a.N.guarda(def, editado, { version: 'Versión tardía', derivada: true })).error, 'revision_base');
  assert.equal((await b.N.lista()).columnas.length, guardadas.length + 1);
  for (let c = e.m.h.getLastColumn() + 1; c <= e.m.h.getMaxColumns(); c++) e.m.h.put(3, c, 'Ocupada');
  assert.equal((await a.N.abre(def, base.columna)).ok, true);
  assert.equal((await a.N.guarda(def, null, { version: 'Otra variante', derivada: true })).error, 'sin_columnas');
  assert.equal((await b.N.lista()).columnas.length, guardadas.length + 1);
});
