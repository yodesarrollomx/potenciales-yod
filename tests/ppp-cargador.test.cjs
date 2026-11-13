'use strict';
/*
 * T-103 · Los 8 HTML de potenciales-yod, portero.js y ppp-catalog.js adoptan YodCargador (yod-portal/os/yod-cargador.js)
 * como TRANSPORTE, con el camino de siempre intacto detrás de `?cargador=legacy` (o si el cargador no cargó).
 * Sin red y sin navegador: el cargador se sustituye por un doble (`fakeCargador`) que sigue el contrato
 * (CONTRATO-yod-cargador.md, v1): `window.YodCargador = { v, legacy, ppp.get(endpoint, params, opts) → Response-like,
 * sesion.canjear(), sesion.alCambiar(), purgar(), telemetria.codigos() }`.
 *
 * Acredita: (a) la etiqueta del cargador va justo después de yod-acceso.js, con su misma etiqueta ?v=, en los 8 HTML;
 * (b) cada motor conserva su `fetch` de hoy bajo la rama del cargador; (c) apiGet de los 5 motores: con cargador activo SÓLO la
 * primera lista de la página (con la sesión guardada y con conexión) llama a ppp.get con recurso, k y tipo; todo lo demás (caso,
 * catálogo, modelo, recibos…), y todo sin cargador o con legacy, hace el fetch de siempre con la URL de siempre; (d) ppp-catalog.js read() usa ppp.get con timeoutMs 60000,
 * repinta con el refresco de fondo y pide a red al actualizar/reintentar; (e) portero.js canjea por sesion.canjear, decide
 * el rechazo con SU lista, cierra si el refresco de fondo rechaza, y manda los códigos de telemetría en la bitácora.
 *
 * NO acredita: el comportamiento del cargador real (eso es tests/yod-cargador.test.cjs de yod-portal), ni cómo se ve nada en
 * un navegador (eso son los recorridos tests/*-browser.cjs).
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const ROOT = path.resolve(__dirname, '..');
const read = file => fs.readFileSync(path.join(ROOT, file), 'utf8');
const plain = value => JSON.parse(JSON.stringify(value));   // saca los objetos del reino de `vm` antes de comparar
const settle = () => new Promise(resolve => setImmediate(resolve));

const OCHO = ['index', 'mapa', 'macrolotes', 'mixto', 'unifamiliar', 'residencial', 'patrimonial', 'accesos'];
const MOTORES = ['macrolotes', 'mixto', 'unifamiliar', 'residencial', 'patrimonial'];
const MARCO = 'https://yodesarrollomx.github.io/yod-portal/';
const ENDPOINT = 'https://script.invalid/exec', GUARDADA = 'sy-sintetica-guardada-0000';

/* ---------- doble del cargador ---------- */
const respuesta = (data, extra = {}) => ({ ok: true, status: 200, json: async () => data, text: async () => JSON.stringify(data), yod: { origen: 'red', ms: 1 }, ...extra });
function fakeCargador({ legacy = false, get, canjear, codigos, purgar } = {}) {
  const calls = { get: [], canjear: 0, purgar: 0, codigos: 0, alCambiar: [] };
  const api = {
    v: '1', legacy,
    ppp: { get(endpoint, params, opts) { calls.get.push({ endpoint, params: plain(params), opts: plain(opts) }); return get ? get(endpoint, params, opts) : Promise.resolve(respuesta({ ok: true, via: 'cargador' })); } },
    sesion: { canjear(args) { calls.canjear++; calls.canjearArgs = args; return canjear ? canjear() : Promise.resolve({ ok: true, rol: 'vista', origen: 'cache', token: GUARDADA }); },
      alCambiar(fn) { calls.alCambiar.push(fn); return () => {}; } },
    purgar() { calls.purgar++; if (purgar) return purgar(); },
    telemetria: { codigos() { calls.codigos++; return codigos ? codigos() : []; } },
  };
  return { api, calls };
}

/* ============================================================================================ */
/* (a) ESTÁTICO · la etiqueta del cargador                                                      */
/* ============================================================================================ */
const marcoVigente = JSON.parse(read('versiones.json')).marco;

for (const name of OCHO) {
  test('ESTÁTICO · ' + name + '.html: yod-cargador.js va justo después de yod-acceso.js, en el <head>, con la misma etiqueta ?v=', () => {
    const html = read(name + '.html');
    const par = /yod-acceso\.js\?v=([^"]+)"><\/script>\s*<script src="https:\/\/yodesarrollomx\.github\.io\/yod-portal\/os\/yod-cargador\.js\?v=([^"]+)"><\/script>/.exec(html);
    assert.ok(par, name + '.html: el tag del cargador debe seguir inmediatamente al de yod-acceso.js');
    assert.equal(par[2], par[1], name + '.html: el cargador y yod-acceso.js deben llevar la misma etiqueta ?v=');
    assert.equal(par[2], marcoVigente, name + '.html: la etiqueta es la del marco en versiones.json');
    assert.equal((html.match(/yod-cargador\.js/g) || []).length, 1, name + '.html: una sola carga del cargador');
    const cargador = html.indexOf(MARCO + 'os/yod-cargador.js');
    assert.ok(cargador < html.indexOf('</head>'), name + '.html: el cargador va en el <head>');
    assert.ok(cargador < html.indexOf('portero.js?v='), name + '.html: el cargador va antes que portero.js');
    assert.ok(html.slice(0, cargador).split('\n').length <= 6, name + '.html: el cargador queda en la línea 6 o antes (justo tras yod-acceso.js, línea 5)');
  });
}

/* ============================================================================================ */
/* (b) ESTÁTICO · apiGet de los motores                                                         */
/* ============================================================================================ */
function apiGetText(name) {
  const src = read(name + '.html'), inicio = src.indexOf(name === 'patrimonial' ? 'async function apiGet(params)' : '  function apiGet(params){');
  const fin = src.indexOf('\n  function apiPost(', inicio);
  assert.ok(inicio >= 0 && fin > inicio, name + '.html: no se halló apiGet…apiPost');
  return src.slice(inicio, fin);
}
const FETCH_DE_SIEMPRE = "return fetch(NUBE.ENDPOINT+'?'+q.toString()).then(r=>r.json())}";
const PATRIMONIAL_DE_SIEMPRE = [
  "const q=new URLSearchParams(Object.assign({k:clave,tipo:NUBE.TIPO},params)),controller=new AbortController(),timer=setTimeout(()=>controller.abort(),25000);",
  "try{const response=await fetch(NUBE.ENDPOINT+'?'+q.toString(),{signal:controller.signal,credentials:'omit',cache:'no-store'});if(!response.ok){const error=Error('http_error');error.httpStatus=response.status;throw error;}try{return await response.json();}catch{throw Error('invalid_response');}}",
  "catch(error){if(controller.signal.aborted)throw Error('timeout');throw error;}finally{clearTimeout(timer);}}",
];

for (const name of MOTORES) {
  test('ESTÁTICO · ' + name + '.html: apiGet delega en window.YodCargador.ppp.get sólo la primera lista y conserva su fetch de siempre, literal', () => {
    const texto = apiGetText(name);
    assert.match(texto, /window\.YodCargador/, 'rama del cargador');
    assert.match(texto, /\.ppp\.get\(NUBE\.ENDPOINT,/, 'transporte por ppp.get(ENDPOINT, …)');
    assert.match(texto, /params\.recurso==='lista'/, 'sólo la lista puede salir por el cargador');
    assert.match(texto, /recurso:'lista'/, 'el recurso viaja en opts');
    assert.doesNotMatch(texto, /recurso:params\.recurso/, 'ningún otro recurso (caso, catálogo, modelo, recibos) viaja por el cargador');
    assert.match(texto, /!C\.legacy/, 'con ?cargador=legacy corre el camino viejo');
    assert.match(texto, /fetch\(/, 'sigue existiendo el fetch');
    if (name === 'patrimonial') {
      for (const linea of PATRIMONIAL_DE_SIEMPRE) assert.ok(texto.includes(linea), 'patrimonial: el camino viejo debe seguir literal: ' + linea.slice(0, 70));
      assert.match(texto, /typeof window==='undefined'/, 'patrimonial: sin window (sandbox de PPPCaseOpening) no debe lanzar');
      assert.match(texto, /timeoutMs:25000/, 'patrimonial: el tope sigue siendo de 25 s');
    } else {
      assert.ok(texto.includes(FETCH_DE_SIEMPRE), name + ': el fetch de siempre debe seguir literal');
      assert.match(texto, /timeoutMs:360000/);
    }
    assert.equal((read(name + '.html').match(/function apiGet\(/g) || []).length, 1, 'una sola definición de apiGet');
  });
}

/* ============================================================================================ */
/* (c) COMPORTAMIENTO · apiGet de cada motor, evaluado en vm                                    */
/* ============================================================================================ */
function motor(name, { cargador = null, window: conWindow = true, clave = GUARDADA, guardada = GUARDADA, online = true, fetchImpl } = {}) {
  const calls = { fetch: [] };
  const store = new Map(guardada === null ? [] : [['pyod_clave_v1', guardada]]);
  const ctx = {
    URLSearchParams, AbortController, setTimeout, clearTimeout, Error, TypeError, Object, Promise,
    NUBE: { ENDPOINT, TIPO: 'vertical' }, LS: { clave: 'pyod_clave_v1' }, clave,
    localStorage: { getItem: k => (store.has(k) ? store.get(k) : null) }, navigator: { onLine: online },
    fetch: (url, opts) => { calls.fetch.push({ url, opts }); return fetchImpl ? fetchImpl(url, opts) : Promise.resolve({ ok: true, status: 200, json: async () => ({ ok: true, via: 'fetch' }) }); },
  };
  if (conWindow) ctx.window = cargador ? { YodCargador: cargador.api } : {};
  const apiGet = vm.runInNewContext(apiGetText(name) + ';apiGet', ctx);
  return { apiGet, ctx, calls, store };
}
const URL_DE_HOY = (clave, tipo, extra) => ENDPOINT + '?' + new URLSearchParams({ k: clave, tipo, ...extra }).toString();

for (const name of MOTORES) {
  const tope = name === 'patrimonial' ? 25000 : 360000;

  test('COMPORTAMIENTO · ' + name + ': sin YodCargador' + (name === 'patrimonial' ? ' (ni window)' : '') + ' apiGet hace el fetch de siempre, con la URL de siempre', async () => {
    for (const conWindow of name === 'patrimonial' ? [true, false] : [true]) {   // sólo el sandbox de PPPCaseOpening evalúa apiGet sin window
      const m = motor(name, { window: conWindow });
      assert.deepEqual(plain(await m.apiGet({ recurso: 'caso', id: 'caso sintético/1' })), { ok: true, via: 'fetch' });
      assert.equal(m.calls.fetch.length, 1);
      assert.equal(m.calls.fetch[0].url, URL_DE_HOY(GUARDADA, 'vertical', { recurso: 'caso', id: 'caso sintético/1' }));
    }
    const m = motor(name, { cargador: { api: {} } });   // un objeto sin .v tampoco cuenta como cargador
    await m.apiGet({ recurso: 'lista' });
    assert.equal(m.calls.fetch.length, 1);
  });

  test('COMPORTAMIENTO · ' + name + ': con ?cargador=legacy apiGet hace el fetch de siempre y no toca al cargador', async () => {
    const c = fakeCargador({ legacy: true });
    const m = motor(name, { cargador: c });
    await m.apiGet({ recurso: 'lista' }); await m.apiGet({ recurso: 'caso', id: 'x' }); await m.apiGet({ recurso: 'catalogo' });
    assert.equal(c.calls.get.length, 0);
    assert.equal(m.calls.fetch.length, 3);
    assert.equal(m.calls.fetch[0].url, URL_DE_HOY(GUARDADA, 'vertical', { recurso: 'lista' }));
  });

  test('COMPORTAMIENTO · ' + name + ': con cargador activo la primera lista llama a ppp.get con endpoint, k, tipo, recurso y tope; devuelve el json', async () => {
    const c = fakeCargador({ get: async () => respuesta({ ok: true, casos: [{ caso_id: 'caso-1' }] }) });
    const m = motor(name, { cargador: c });
    assert.deepEqual(plain(await m.apiGet({ recurso: 'lista' })), { ok: true, casos: [{ caso_id: 'caso-1' }] });
    assert.equal(m.calls.fetch.length, 0, 'no hay fetch propio');
    assert.equal(c.calls.get.length, 1);
    const [llamada] = c.calls.get;
    assert.equal(llamada.endpoint, ENDPOINT);
    assert.deepEqual(llamada.params, { k: GUARDADA, tipo: 'vertical', recurso: 'lista' });
    assert.deepEqual(llamada.opts, { recurso: 'lista', timeoutMs: tope });
    // params del llamador mandan sobre los de la casa, igual que Object.assign de siempre
    const otro = fakeCargador(), n = motor(name, { cargador: otro });
    await n.apiGet({ recurso: 'lista', tipo: 'macrolotes' });
    assert.deepEqual(otro.calls.get[0].params, { k: GUARDADA, tipo: 'macrolotes', recurso: 'lista' });
  });

  test('COMPORTAMIENTO · ' + name + ': con cargador activo todo lo que no es la primera lista (caso, catálogo, modelo, recibos…) corre el fetch de siempre', async () => {
    const c = fakeCargador({ get: async () => { throw Error('el cargador no debe tocarse'); } });
    const m = motor(name, { cargador: c });
    const pedidos = [{ recurso: 'caso', id: 'caso-1' }, { recurso: 'caso', palabra: 'ensayo' }, { recurso: 'catalogo' }, { recurso: 'sheet-model', id: 'caso-1' },
      { recurso: 'sheet-volumes-receipt', caso_id: 'c', escenario_id: 'e', request_id: 'r' }, { recurso: 'sheet-intake', tipo: 'macrolotes', id: 'c2' }, { recurso: 'mapa' }, { recurso: 'flujo' }];
    for (const pedido of pedidos) assert.deepEqual(plain(await m.apiGet(pedido)), { ok: true, via: 'fetch' }, JSON.stringify(pedido));
    assert.equal(c.calls.get.length, 0, 'un caso o un umbral de cálculo no sale de la caché del cargador');
    assert.equal(m.calls.fetch.length, pedidos.length);
    assert.equal(m.calls.fetch[0].url, URL_DE_HOY(GUARDADA, 'vertical', { recurso: 'caso', id: 'caso-1' }));
    assert.equal(m.calls.fetch[5].url, URL_DE_HOY(GUARDADA, 'macrolotes', { recurso: 'sheet-intake', id: 'c2' }));
  });

  test('COMPORTAMIENTO · ' + name + ': `clave` se lee al llamar, no al definir', async () => {
    const c = fakeCargador();
    const m = motor(name, { cargador: c, clave: '' });   // el motor arrancó sin clave; la guardada llega después
    m.ctx.clave = GUARDADA; await m.apiGet({ recurso: 'lista' });
    assert.deepEqual(c.calls.get.map(x => x.params.k), [GUARDADA]);
    const legacy = motor(name, { cargador: fakeCargador({ legacy: true }) });
    legacy.ctx.clave = 'sy-otra-sesion-2222'; await legacy.apiGet({ recurso: 'caso', id: 'a' });
    assert.match(legacy.calls.fetch[0].url, /k=sy-otra-sesion-2222/);
  });

  test('COMPORTAMIENTO · ' + name + ': la lista sólo sale del cargador (caché-primero) en la PRIMERA lectura, con la sesión guardada y con conexión', async () => {
    const c = fakeCargador();
    const m = motor(name, { cargador: c });
    await m.apiGet({ recurso: 'lista' });
    assert.equal(c.calls.get.length, 1, 'la primera lista va por el cargador');
    await m.apiGet({ recurso: 'lista' }); await m.apiGet({ recurso: 'lista' });
    assert.equal(c.calls.get.length, 1, 'las siguientes (tras guardar) no pueden devolver una lista vieja');
    assert.equal(m.calls.fetch.length, 2);
    assert.equal(m.calls.fetch[0].url, URL_DE_HOY(GUARDADA, 'vertical', { recurso: 'lista' }));
    assert.deepEqual(c.calls.get.map(x => x.opts.recurso), ['lista'], 'sólo la primera lista pasó por el cargador');

    // clave tecleada en el gate (distinta de la guardada): se valida contra el servidor, nunca con la caché
    const ct = fakeCargador(), tecleada = motor(name, { cargador: ct, clave: 'sy-tecleada-9999' });
    await tecleada.apiGet({ recurso: 'lista' });
    assert.equal(tecleada.calls.fetch.length, 1, 'clave tecleada -> red directa'); assert.equal(ct.calls.get.length, 0);
    tecleada.ctx.clave = GUARDADA; await tecleada.apiGet({ recurso: 'lista' });
    assert.equal(tecleada.calls.fetch.length, 1, 'la bandera de «primera lista» no se gasta con la clave tecleada: ahora, con la guardada, sí va al cargador'); assert.equal(ct.calls.get.length, 1);

    // sin red del navegador: se conserva el camino viejo (fallará y el motor entrará en modo local, como siempre)
    const cr = fakeCargador(), sinRed = motor(name, { cargador: cr, online: false });
    await sinRed.apiGet({ recurso: 'lista' });
    assert.equal(sinRed.calls.fetch.length, 1); assert.equal(cr.calls.get.length, 0);
    // sin sesión guardada tampoco hay caché de lista
    const cs = fakeCargador(), sinSesion = motor(name, { cargador: cs, guardada: null });
    await sinSesion.apiGet({ recurso: 'lista' });
    assert.equal(sinSesion.calls.fetch.length, 1); assert.equal(cs.calls.get.length, 0);
  });
}

test('COMPORTAMIENTO · patrimonial: el camino nuevo conserva los errores del viejo (timeout, http_error + httpStatus, invalid_response, TypeError)', async () => {
  const falla = async (get, esperado) => {
    const m = motor('patrimonial', { cargador: fakeCargador({ get }) });
    await assert.rejects(() => m.apiGet({ recurso: 'lista' }), esperado);
  };
  await falla(async () => { throw Error('timeout'); }, error => error.message === 'timeout');
  await falla(async () => { throw Object.assign(Error('operation aborted'), { name: 'AbortError' }); }, error => error.message === 'timeout');
  await falla(async () => { throw new TypeError('Failed to fetch'); }, error => error instanceof TypeError && error.message === 'Failed to fetch');
  await falla(async () => { throw Error('red'); }, error => error instanceof TypeError && error.message === 'network' && error.cause.message === 'red');
  await falla(async () => respuesta({}, { ok: false, status: 503 }), error => error.message === 'http_error' && error.httpStatus === 503);
  await falla(async () => respuesta({}, { json: async () => { throw Error('PRIVADO'); } }), error => error.message === 'invalid_response');
  // PPPCaseOpening lee el caso SIEMPRE por el camino de siempre, con el cargador activo o no: no puede abrir una copia vieja ni la de otro caso
  const { create, isAuthenticationError } = require('../ppp-case-opening.js'), { create: loaderFactory } = require('../ppp-case-loader.js');
  assert.equal(isAuthenticationError('timeout'), false);
  const estados = [], c = fakeCargador({ get: async () => { throw Error('el cargador no debe tocarse para un caso'); } });
  const m = motor('patrimonial', { cargador: c, fetchImpl: async () => ({ ok: false, status: 503, json: async () => ({}) }) });
  const abrir = create({ loaderFactory, timeoutMs: 50, getCredential: () => GUARDADA, onState: s => estados.push(s), apply: () => true, read: p => m.apiGet(p), schedule: () => 1, cancel: () => {} });
  await abrir.openId('caso-1');
  assert.equal(estados.at(-1).phase, 'retrying'); assert.equal(estados.at(-1).kind, 'server'); assert.equal(estados.at(-1).http_status, 503);
  assert.equal(c.calls.get.length, 0, 'el caso no pasó por el cargador'); assert.equal(m.calls.fetch.length, 1);
  abrir.dispose();
});

/* ============================================================================================ */
/* (d) COMPORTAMIENTO · ppp-catalog.js                                                          */
/* ============================================================================================ */
const catalogSource = read('ppp-catalog.js');
const TIPOS = ['macrolotes', 'vertical', 'unifamiliar', 'residencial', 'patrimonial'];
function catalogo({ rows = {}, cargador = null, home = true, sesion = 'test-session', fetchImpl } = {}) {
  const elements = {};
  const el = id => elements[id] || (elements[id] = { id, hidden: false, scrollTop: 0, value: '', attrs: {}, setAttribute(k, v) { this.attrs[k] = v; }, addEventListener(k, fn) { this[k] = fn; }, querySelector() { return null; }, querySelectorAll() { return []; }, closest() { return null; }, innerHTML: '' });
  let actual = sesion; const listeners = {}, timers = [], fetchCalls = [];
  const scope = {
    document: { getElementById: el, querySelector: s => (s === '.projects-panel' && home ? {} : null) },
    localStorage: { getItem: () => actual },
    location: { href: 'https://yodesarrollomx.github.io/potenciales-yod/', origin: 'https://yodesarrollomx.github.io' },
    URL, URLSearchParams, AbortController, Event, Set, Map, console, Promise,
    setTimeout: (f, ms) => { timers.push({ f, ms }); return timers.length; }, clearTimeout() {},
    addEventListener: (k, f) => { (listeners[k] || (listeners[k] = [])).push(f); }, dispatchEvent() {},
    fetch: async url => { const u = new URL(url), tipo = u.searchParams.get('tipo'); fetchCalls.push({ tipo, url }); return fetchImpl ? fetchImpl(tipo, u) : { ok: true, json: async () => ({ ok: true, casos: rows[tipo] || [] }) }; },
  };
  scope.window = scope; scope.YOD_PORTERO = { original: 'https://example.test/api' };
  if (cargador) scope.YodCargador = cargador.api;
  vm.runInNewContext(catalogSource, scope);
  return { elements, scope, listeners, timers, fetchCalls, setSesion: v => { actual = v; }, settle,
    emite: (nombre, detail) => (listeners[nombre] || []).forEach(f => f({ detail })) };
}
const fila = (id, nombre) => ({ caso_id: id, nombre_caso: nombre, estado: 'EXPLORACIÓN' });
const desdeCache = (data, origen = 'cache') => respuesta(data, { yod: { origen, ms: 1 } });

test('ESTÁTICO · ppp-catalog.js conserva el literal 60000 (una sola vez) y lo usa en ambos caminos', () => {
  assert.equal((catalogSource.match(/\b60000\b/g) || []).length, 1, 'un solo literal 60000');
  assert.match(catalogSource, /const TIMEOUT = 60000;/);
  assert.match(catalogSource, /setTimeout\(\(\) => controller\.abort\(\), TIMEOUT\)/);
  assert.match(catalogSource, /timeoutMs: TIMEOUT/);
  assert.match(catalogSource, /window\.PPPCatalog=\{load,projectLink,mapData\(/, 'la API pública no cambia');
  assert.match(catalogSource, /dispatchEvent\(new Event\('ppp:catalog-ready'\)\)/);
  assert.match(catalogSource, /dispatchEvent\(new Event\('ppp:catalog-render'\)\)/);
});

test('COMPORTAMIENTO · ppp-catalog con cargador activo: 5 listas por ppp.get con {k, recurso:lista, tipo} y timeoutMs 60000; sin fetch propio', async () => {
  const c = fakeCargador({ get: async (_, params) => respuesta({ ok: true, casos: [fila('id-' + params.tipo, 'Proyecto ' + params.tipo)] }) });
  const s = catalogo({ cargador: c }); await s.settle();
  assert.equal(s.fetchCalls.length, 0);
  assert.equal(c.calls.get.length, 5);
  assert.deepEqual(c.calls.get.map(x => x.params.tipo).sort(), [...TIPOS].sort());
  for (const x of c.calls.get) {
    assert.equal(x.endpoint, 'https://example.test/api');
    assert.deepEqual(x.params, { k: 'test-session', recurso: 'lista', tipo: x.params.tipo });
    assert.deepEqual(x.opts, { recurso: 'lista', timeoutMs: 60000 });
  }
  assert.equal(s.elements.cntTodos.textContent, '5');
  assert.ok(s.timers.some(t => t.ms === 60000), 'el tope de pantalla (60000) también corre en este camino: las pruebas de navegador lo acortan');
});

test('COMPORTAMIENTO · ppp-catalog con ?cargador=legacy, o sin cargador, hace el fetch de siempre', async () => {
  for (const cargador of [fakeCargador({ legacy: true }), null]) {
    const s = catalogo({ cargador, rows: { macrolotes: [fila('m1', 'Proyecto uno')] } }); await s.settle();
    assert.equal(s.fetchCalls.length, 5);
    if (cargador) assert.equal(cargador.calls.get.length, 0);
    assert.equal(s.elements.cntTodos.textContent, '1');
    assert.equal(s.listeners['yodcargador:dato'], undefined, 'sin cargador activo no se escucha nada');
  }
});

test('COMPORTAMIENTO · ppp-catalog: la lista pintada desde caché se actualiza con el refresco de fondo; un rechazo la retira; otro fallo no', async () => {
  const c = fakeCargador({ get: async (_, params) => desdeCache({ ok: true, casos: params.tipo === 'vertical' ? [fila('v1', 'Proyecto viejo')] : [] }) });
  const s = catalogo({ cargador: c }); await s.settle();
  assert.match(s.elements.listaTodos.innerHTML, /Proyecto viejo/);
  const clave = tipo => 'lista|' + tipo + '|h1234';
  // eventos que no son de lista, ni de red, ni de una sesión vigente, o con datos que la pantalla no aceptaría: se ignoran
  s.emite('yodcargador:dato', { clave: 'catalogo|vertical|h1234', origen: 'red', data: { ok: true, casos: [fila('x', 'Ajeno')] } });
  s.emite('yodcargador:dato', { clave: clave('vertical'), origen: 'cache', data: { ok: true, casos: [fila('x', 'Ajeno')] } });
  s.emite('yodcargador:dato', { clave: clave('vertical'), origen: 'red', data: { ok: true } });
  s.emite('yodcargador:dato', { clave: clave('vertical'), origen: 'red', data: { ok: false, error: 'lock_busy' } });
  s.emite('yodcargador:dato', { clave: clave('vertical'), origen: 'red', data: null });
  assert.match(s.elements.listaTodos.innerHTML, /Proyecto viejo/); assert.doesNotMatch(s.elements.listaTodos.innerHTML, /Ajeno/);
  // el refresco legítimo reemplaza las filas y deja de ser «de caché»
  s.emite('yodcargador:dato', { clave: clave('vertical'), origen: 'red', data: { ok: true, casos: [fila('v2', 'Proyecto nuevo')] } });
  assert.match(s.elements.listaTodos.innerHTML, /Proyecto nuevo/); assert.doesNotMatch(s.elements.listaTodos.innerHTML, /Proyecto viejo/);
  s.emite('yodcargador:dato', { clave: clave('vertical'), origen: 'red', data: { ok: true, casos: [fila('v3', 'Otro más')] } });
  assert.doesNotMatch(s.elements.listaTodos.innerHTML, /Otro más/, 'una vez refrescada, la lista ya no es «de caché» y no se pisa con eventos sueltos');
  // un rechazo de acceso retira lo que quedaba pintado de otra copia
  const c2 = fakeCargador({ get: async () => desdeCache({ ok: true, casos: [fila('p1', 'Privado de caché')] }) });
  const t = catalogo({ cargador: c2 }); await t.settle();
  assert.match(t.elements.listaTodos.innerHTML, /Privado de caché/);
  t.emite('yodcargador:dato', { clave: clave('patrimonial'), origen: 'red', data: { ok: false, error: 'board' } });
  assert.equal((t.elements.listaTodos.innerHTML.match(/Privado de caché/g) || []).length, 4, 'sólo se retira el tipo rechazado (los otros 4 siguen)');
  assert.match(t.elements.listaTodos.innerHTML, /Consulta no disponible con esta sesión/);
  // otra sesión: el evento tardío de la anterior no pinta nada
  t.setSesion('otra-sesion'); t.scope.PPPCatalog.load('otra-sesion');
  t.emite('yodcargador:dato', { clave: clave('vertical'), origen: 'red', data: { ok: true, casos: [fila('z', 'De la sesión anterior')] } });
  assert.doesNotMatch(t.elements.listaTodos.innerHTML, /De la sesión anterior/);
});

test('COMPORTAMIENTO · ppp-catalog: una copia de caché que la pantalla no aceptaría ({ok:true} sin casos) se vuelve a pedir a red', async () => {
  const c = fakeCargador({ get: async (_, params) => desdeCache(params.tipo === 'patrimonial' ? { ok: true } : { ok: true, casos: [] }) });
  const s = catalogo({ cargador: c, rows: { patrimonial: [fila('p1', 'Proyecto de red')] } }); await s.settle();
  assert.deepEqual(s.fetchCalls.map(x => x.tipo), ['patrimonial']);
  assert.match(s.elements.listaTodos.innerHTML, /Proyecto de red/);
});

test('COMPORTAMIENTO · ppp-catalog: actualizar y reintentar piden SIEMPRE a red; leer de nuevo con el mismo cargador no', async () => {
  const c = fakeCargador({ get: async () => desdeCache({ ok: true, casos: [fila('a', 'De caché')] }) });
  const s = catalogo({ cargador: c, rows: { macrolotes: [fila('m', 'Fresco de red')] } }); await s.settle();
  assert.equal(c.calls.get.length, 5); assert.equal(s.fetchCalls.length, 0);
  s.elements.btnTodos.onclick();   // portada: «Actualizar proyectos guardados»
  await s.settle();
  assert.equal(c.calls.get.length, 5, 'el botón de actualizar no vuelve a pasar por la caché');
  assert.equal(s.fetchCalls.length, 5);
  assert.match(s.elements.listaTodos.innerHTML, /Fresco de red/);
  // reintento de los que fallaron
  const falla = fakeCargador({ get: async (_, p) => { if (p.tipo === 'vertical') throw new TypeError('Failed to fetch'); return respuesta({ ok: true, casos: [] }); } });
  const t = catalogo({ cargador: falla, rows: { vertical: [fila('v', 'Recuperado')] } }); await t.settle();
  assert.match(t.elements.listaTodos.innerHTML, /No se pudieron consultar 1 de 5/);
  t.scope.PPPCatalog.load('test-session');          // misma sesión, sin reintento -> no repite nada
  await t.settle(); assert.equal(t.fetchCalls.length, 0); assert.equal(falla.calls.get.length, 5);
  t.scope.PPPCatalog.load('test-session', true);    // lo que hace el botón «Reintentar»: sólo lo que falló, y a red
  await t.settle();
  assert.deepEqual(t.fetchCalls.map(x => x.tipo), ['vertical']); assert.equal(falla.calls.get.length, 5);
  assert.match(t.elements.listaTodos.innerHTML, /Recuperado/); assert.doesNotMatch(t.elements.listaTodos.innerHTML, /No se pudieron consultar/);
});

test('COMPORTAMIENTO · ppp-catalog: un fallo del cargador es un error de lista (sin romper), y un rechazo de acceso sigue marcando state.denied', async () => {
  const c = fakeCargador({ get: async (_, p) => { if (p.tipo === 'vertical') throw Error('red'); if (p.tipo === 'patrimonial') return respuesta({ ok: false, error: 'board' }); return respuesta({ ok: true, casos: [] }); } });
  const s = catalogo({ cargador: c }); await s.settle();
  const html = s.elements.listaTodos.innerHTML;
  assert.match(html, /No se pudieron consultar 2 de 5 listas/);
  assert.match(html, /Consulta no disponible con esta sesión/, 'patrimonial: denied');
  assert.match(html, /data-retry="vertical"/); assert.doesNotMatch(html, /data-retry="patrimonial"/, 'lo rechazado no se ofrece para reintento');
});

test('COMPORTAMIENTO · ppp-catalog: el tope de pantalla corta también al cargador (incluidos sus reintentos)', async () => {
  const c = fakeCargador({ get: () => new Promise(() => {}) });   // el cargador nunca contesta
  const s = catalogo({ cargador: c }); await s.settle();
  assert.match(s.elements.listaTodos.innerHTML, /Cargando 5 de 5 listas/);
  for (const t of s.timers.filter(x => x.ms === 60000)) t.f();     // vence el tope
  await s.settle();
  assert.match(s.elements.listaTodos.innerHTML, /No se pudieron consultar 5 de 5 listas/);
});

/* ============================================================================================ */
/* (e) COMPORTAMIENTO · portero.js                                                              */
/* ============================================================================================ */
const porteroSource = read('portero.js');
const MARCA = '  // La sesión se valida en esta carga.';
const corte = porteroSource.slice(porteroSource.indexOf(MARCA), porteroSource.indexOf('\n})();', porteroSource.indexOf(MARCA)));
const KEY = 'pyod_clave_v1', A = 'sy-sintetica-A-000000000', B = 'sy-sintetica-B-000000000';

function portero({ key = A, cargador = null, pyodPide, page = 'mixto' } = {}) {
  const store = new Map(key ? [[KEY, key]] : []), cache = new Map(), nodes = new Map(), events = {}, listens = {}, timers = [];
  const log = { pide: 0, overlay: 0, resizes: 0, reloads: 0 };
  function node(id) {
    const classes = new Set();
    const n = { id, children: [], attributes: {}, classList: { add: x => classes.add(x), remove: x => classes.delete(x), contains: x => classes.has(x) },
      style: { setProperty: (k, v) => { n.style[k] = v; } }, setAttribute: (k, v) => { n.attributes[k] = v; }, remove: () => nodes.delete(n.id),
      querySelector: s => (s === '.gate-box, .mg-box' ? n.box : null), appendChild: c => { n.children.push(c); if (c.id) nodes.set(c.id, c); } };
    if (id) nodes.set(id, n); return n;
  }
  ['gate', 'mapGate'].forEach(id => { node(id).box = node(''); }); node('porteroGate');
  const ctx = { console, LSC: KEY, pagina: page, SIN_GATE: false, MODO_SUAVE: false,
    localStorage: { getItem: k => (store.has(k) ? store.get(k) : null), setItem: (k, v) => store.set(k, v), removeItem: k => store.delete(k) },
    sessionStorage: { getItem: k => (cache.has(k) ? cache.get(k) : null), setItem: (k, v) => cache.set(k, v), removeItem: k => cache.delete(k) },
    document: { readyState: 'loading', getElementById: id => nodes.get(id) || null, createElement: () => node(''), body: node(''), addEventListener: () => {} },
    window: { dispatchEvent: () => { log.resizes++; }, ...(cargador ? { YodCargador: cargador.api } : {}) }, Event: function (type) { this.type = type; },
    addEventListener: (name, fn) => { events[name] = fn; listens[name] = (listens[name] || 0) + 1; }, setTimeout: (f, ms) => { timers.push({ f, ms }); return timers.length; },
    location: { reload: () => { log.reloads++; } }, overlayCorreo: () => { log.overlay++; node('porteroGate'); },
    pyodPide: async qs => { log.pide++; log.qs = qs; return pyodPide ? pyodPide() : { ok: true, rol: 'vista' }; } };
  vm.createContext(ctx); vm.runInContext(corte, ctx);
  return { ctx, store, cache, nodes, events, listens, timers, log };
}
const abierto = h => h.nodes.get('gate').classList.contains('off');

test('ESTÁTICO · portero.js: el canje por el cargador vive dentro del bloque que corta tests/access-gates.cjs, y el camino viejo conserva sus nombres', () => {
  assert.ok(porteroSource.includes(MARCA), 'access-gates.cjs corta desde esta línea');
  for (const nombre of ['function cargadorActivo(', 'function canjeDeSesion(', 'function purgarCargador(', 'function sesionRechazadaEnFondo(', 'async function engraneAdmin(', 'function sesionYaValidada(']) {
    assert.ok(corte.includes(nombre), nombre + ' debe quedar dentro del corte, o el camino viejo de access-gates.cjs no lo vería');
  }
  assert.ok(corte.includes("pyodPide('?recurso=canje&t=' + encodeURIComponent(k))"), 'el GET de siempre sigue literal');
  assert.ok(corte.includes('Math.min(300000,15000*Math.pow(2,Math.min(5,reintentosCanje-1)))'), 'backoff 15 s … 300 s sin cambios');
  assert.ok(porteroSource.includes('encodeURIComponent(lg)') && porteroSource.includes("localStorage.setItem(LSC, st)"), '?sesion= y ?liga= siguen en portero.js');
});

test('COMPORTAMIENTO · portero SIN cargador (o legacy): engraneAdmin usa pyodPide con el GET de siempre, nada más', async () => {
  for (const cargador of [null, fakeCargador({ legacy: true })]) {
    const h = portero({ cargador, pyodPide: () => ({ ok: true, rol: 'admin' }) });
    await h.ctx.engraneAdmin();
    assert.equal(h.log.pide, 1); assert.equal(h.log.qs, '?recurso=canje&t=' + encodeURIComponent(A));
    assert.ok(abierto(h)); assert.ok(h.nodes.has('engraneBtn'));
    if (cargador) { assert.equal(cargador.calls.canjear, 0); assert.equal(cargador.calls.purgar, 0); }
    assert.equal(h.events['yodcargador:sesion-rechazada'], undefined, 'sin cargador activo no se escucha su evento');
  }
});

test('COMPORTAMIENTO · portero con cargador activo: el canje sale de sesion.canjear (no de pyodPide) y se trata como siempre', async () => {
  // ok -> sesión validada, candados fuera, engrane de admin
  const c = fakeCargador({ canjear: async () => ({ ok: true, rol: 'admin', boards: 'PT', nombre: 'Prueba', correo: 'prueba@example.invalid', origen: 'cache', edadMs: 5, token: A }) });
  const h = portero({ cargador: c });
  await h.ctx.engraneAdmin();
  assert.equal(c.calls.canjear, 1); assert.equal(h.log.pide, 0, 'sin GET propio');
  assert.ok(abierto(h)); assert.ok(h.nodes.has('engraneBtn')); assert.equal(h.ctx.sesionYaValidada(), true);
  assert.equal(h.store.get(KEY), A); assert.equal(h.log.resizes, 1);
  assert.equal(JSON.parse(h.cache.get('pyod_rol')).rol, 'admin');
  assert.equal(typeof h.events['yodcargador:sesion-rechazada'], 'function', 'se escucha el rechazo de fondo');

  // rechazo REAL (lista del Portero) -> candado y copias privadas fuera
  for (const error of ['liga', 'clave', 'expirado', 'revocado', 'sin_sesion', 'unauthorized', 'forbidden']) {
    const r = fakeCargador({ canjear: async () => ({ ok: false, error, rechazo: true, origen: 'red', token: A }) });
    const x = portero({ cargador: r }); await x.ctx.engraneAdmin();
    assert.equal(abierto(x), false, error); assert.equal(x.log.overlay, 1, error); assert.equal(r.calls.purgar, 1, error); assert.equal(x.timers.length, 0, error + ': sin reintento');
    assert.equal(x.store.get(KEY), A, error + ': el Portero nunca borra la llave por un rechazo');
  }
  // lo que el CARGADOR llama rechazo pero el Portero no (sin_acceso, denegado…) sigue siendo «otro fallo»: reintento, sin login nuevo
  const raro = fakeCargador({ canjear: async () => ({ ok: false, error: 'sin_acceso', rechazo: true, origen: 'red', token: A }) });
  const y = portero({ cargador: raro }); await y.ctx.engraneAdmin();
  assert.equal(y.log.overlay, 0); assert.equal(raro.calls.purgar, 0); assert.ok(y.nodes.has('pyodReintentar')); assert.equal(y.timers[0].ms, 15000);

  // red / tiempo -> candado cerrado, botón de reintento, primer reintento a 15 s; sin login nuevo ni purga
  for (const error of ['red', 'timeout', 'servidor']) {
    const r = fakeCargador({ canjear: async () => ({ ok: false, error, rechazo: false, origen: 'sin_red', token: A }) });
    const x = portero({ cargador: r }); await x.ctx.engraneAdmin();
    assert.equal(abierto(x), false); assert.ok(x.nodes.has('pyodReintentar')); assert.equal(x.log.overlay, 0); assert.equal(x.timers.length, 1); assert.equal(x.timers[0].ms, 15000); assert.equal(r.calls.purgar, 0);
  }
  // canjear que lanza -> igual que un GET que lanza
  const lanza = fakeCargador({ canjear: async () => { throw Error('inesperado'); } });
  const z = portero({ cargador: lanza }); await z.ctx.engraneAdmin();
  assert.equal(abierto(z), false); assert.ok(z.nodes.has('pyodReintentar')); assert.equal(z.timers[0].ms, 15000);
});

test('COMPORTAMIENTO · portero con cargador: la guardia de carrera de siempre vale también para el canje del cargador', async () => {
  let termina; const c = fakeCargador({ canjear: () => new Promise(r => { termina = r; }) });
  const h = portero({ cargador: c });
  const p = h.ctx.engraneAdmin(); h.store.set(KEY, B); termina({ ok: true, rol: 'admin', token: A }); await p;
  assert.equal(abierto(h), false); assert.equal(h.nodes.has('engraneBtn'), false); assert.equal(h.store.get(KEY), B);
  let rechaza; const d = fakeCargador({ canjear: () => new Promise(r => { rechaza = r; }) });
  const g = portero({ cargador: d });
  const q = g.ctx.engraneAdmin(); g.store.set(KEY, B); rechaza({ ok: false, error: 'liga', rechazo: true, token: A }); await q;
  assert.equal(g.store.get(KEY), B); assert.equal(g.log.overlay, 0); assert.equal(d.calls.purgar, 0);
});

test('COMPORTAMIENTO · portero: si el refresco de fondo del cargador rechaza la sesión que su caché dio por buena, cierra igual que un rechazo', async () => {
  const c = fakeCargador({ canjear: async () => ({ ok: true, rol: 'admin', origen: 'cache', edadMs: 3600000, token: A }) });
  const h = portero({ cargador: c });
  await h.ctx.engraneAdmin();
  assert.ok(abierto(h) && h.ctx.sesionYaValidada() && h.nodes.has('engraneBtn'));
  const avisa = h.events['yodcargador:sesion-rechazada'];
  avisa({ detail: { error: 'revocado', token: B } });   // un rechazo de OTRA sesión no nos toca
  assert.equal(h.log.overlay, 0); assert.equal(h.ctx.sesionYaValidada(), true);
  avisa({ detail: { error: 'revocado', token: A } });
  assert.equal(h.log.overlay, 1, 'vuelve el candado de acceso'); assert.equal(h.ctx.sesionYaValidada(), false);
  assert.equal(h.nodes.has('engraneBtn'), false); assert.equal(c.calls.purgar, 1); assert.equal(h.cache.has('pyod_rol'), false);
  assert.equal(h.store.get(KEY), A, 'el Portero no borra la llave (eso lo decide quien llame a sesion.cerrar)');
  // sin llave en el navegador ya no hay a quién cerrar
  const x = portero({ cargador: fakeCargador(), key: '' }); x.events['yodcargador:sesion-rechazada']({ detail: { token: A } });
  assert.equal(x.log.overlay, 0);
  // páginas con gate propio o públicas no reciben el modal del Portero
  const suave = portero({ cargador: fakeCargador() }); suave.ctx.MODO_SUAVE = true; suave.events['yodcargador:sesion-rechazada']({ detail: { token: A } });
  assert.equal(suave.log.overlay, 0);
});

test('COMPORTAMIENTO · portero: si el cargador llega DESPUÉS de portero.js, el primer canje por él registra el oyente del rechazo, una sola vez', async () => {
  const h = portero({ pyodPide: () => ({ ok: true, rol: 'vista' }) });            // sin cargador al cargar la página
  assert.equal(h.events['yodcargador:sesion-rechazada'], undefined);
  await h.ctx.engraneAdmin();                                                      // camino viejo: sigue sin oyente
  assert.equal(h.log.pide, 1); assert.equal(h.events['yodcargador:sesion-rechazada'], undefined);
  const c = fakeCargador({ canjear: async () => ({ ok: true, rol: 'admin', origen: 'cache', edadMs: 3600000, token: A }) });
  h.ctx.window.YodCargador = c.api;                                                // el cargador aparece tarde
  await h.ctx.engraneAdmin(); await h.ctx.engraneAdmin();
  assert.equal(c.calls.canjear, 2); assert.equal(h.log.pide, 1, 'ya no hay GET propio');
  assert.equal(typeof h.events['yodcargador:sesion-rechazada'], 'function');
  assert.equal(h.listens['yodcargador:sesion-rechazada'], 1, 'un solo oyente aunque haya varios canjes');
  // y lo que su caché dio por bueno se cierra igual que ante un rechazo del canje
  h.events['yodcargador:sesion-rechazada']({ detail: { error: 'revocado', token: A } });
  assert.equal(h.log.overlay, 1); assert.equal(h.nodes.has('engraneBtn'), false); assert.equal(c.calls.purgar, 1);
  // con el cargador desde el inicio sigue siendo un solo oyente
  const t = portero({ cargador: fakeCargador() }); await t.ctx.engraneAdmin(); await t.ctx.engraneAdmin();
  assert.equal(t.listens['yodcargador:sesion-rechazada'], 1);
  // legacy: ni oyente ni cargador
  const l = portero({ cargador: fakeCargador({ legacy: true }), pyodPide: () => ({ ok: true, rol: 'vista' }) }); await l.ctx.engraneAdmin();
  assert.equal(l.listens['yodcargador:sesion-rechazada'], undefined);
});

test('ESTÁTICO · portero.js: la nota de cerrar sesión describe lo que hay (con cargador, YodCargador.sesion.cerrar y su guardia; sin cargador, reabrirGate sin guardia) y no toca los motores', () => {
  assert.ok(porteroSource.includes('reabrirGate de cada motor sigue SIN guardia de carrera'), 'la nota dice que el camino legacy de reabrirGate sigue sin guardia');
  assert.ok(porteroSource.includes('YodCargador.sesion.cerrar({token, motivo})'), 'la nota nombra el reemplazo');
  assert.ok(!/localStorage\.removeItem\(\s*LSC\s*\)/.test(porteroSource), 'el Portero sigue sin borrar pyod_clave_v1 por un rechazo');
});

/* ---- bitácora ---- */
function bitacora({ cargador = null, codigos, sendBeacon = false } = {}) {
  const inicio = porteroSource.indexOf('  /* Fase 1 «Un cargador»: el cargador mide el primer dato'), fin = porteroSource.indexOf('\n  setTimeout(() => flush(false), 5000);');
  assert.ok(inicio > 0 && fin > inicio, 'no se halló el bloque de la bitácora');
  const envios = [], store = new Map([[KEY, A]]);
  const ctx = { console, LSC: KEY, buf: ['30oct·21:30·MX●'], t0: Date.now(), nueva: 1, nEv: 1, cerrado: false, ENDPOINT: '', P_: () => ({ original: ENDPOINT }), Blob, Math, Date, JSON, String, crypto: { randomUUID: () => 'req-sintetico' },
    localStorage: { getItem: k => (store.has(k) ? store.get(k) : null) },
    navigator: sendBeacon ? { sendBeacon: (url, blob) => { envios.push({ via: 'beacon', url, blob }); return true; } } : {},
    fetch: (url, opts) => { envios.push({ via: 'fetch', url, body: JSON.parse(opts.body) }); return Promise.resolve({}); },
    window: cargador ? { YodCargador: cargador.api } : {} };
  vm.createContext(ctx); vm.runInContext(porteroSource.slice(inicio, fin), ctx);
  return { ctx, envios };
}

test('COMPORTAMIENTO · bitácora: con cargador, los códigos de telemetría viajan en `eventos`, ≤ 40 caracteres y sin espacios', () => {
  const c = fakeCargador({ codigos: () => ['pd:MX:850:c', 'cj:MX:120:r', 'cat:340:c', 'cod igo con espacios y mucho texto sobrante que pasa de cuarenta caracteres'] });
  const b = bitacora({ cargador: c });
  b.ctx.flush(false);
  assert.equal(b.envios.length, 1); assert.equal(c.calls.codigos, 1);
  const { eventos, k, tipo, nueva } = b.envios[0].body;
  assert.equal(tipo, 'bitacora'); assert.equal(k, A); assert.equal(nueva, 1);
  const trozos = eventos.split(' ');
  assert.deepEqual(trozos.slice(0, 4), ['30oct·21:30·MX●', 'pd:MX:850:c', 'cj:MX:120:r', 'cat:340:c']);
  assert.equal(trozos.length, 5); assert.ok(trozos.every(t => t.length <= 40 && !/\s/.test(t)));
  assert.equal(b.ctx.nueva, 0);
});

test('COMPORTAMIENTO · bitácora: sin cargador queda como siempre; y la telemetría no puede romperla', () => {
  const sin = bitacora(); sin.ctx.flush(false);
  assert.equal(sin.envios[0].body.eventos, '30oct·21:30·MX●');
  for (const codigos of [() => { throw Error('telemetría rota'); }, () => null, () => undefined, () => []]) {
    const b = bitacora({ cargador: fakeCargador({ codigos }) }); b.ctx.flush(false);
    assert.equal(b.envios.length, 1, 'la bitácora sale igual'); assert.equal(b.envios[0].body.eventos, '30oct·21:30·MX●');
  }
  const otro = bitacora({ cargador: { api: { v: '1', telemetria: {} } } }); otro.ctx.flush(false);   // cargador sin telemetria.codigos
  assert.equal(otro.envios[0].body.eventos, '30oct·21:30·MX●');
  // sin eventos en el búfer: si el cargador tiene códigos pendientes se mandan solos (O8 de Astra: un primer dato
  // posterior al envío de los 5 s, en una visita sin clics, ya no se pierde); sin códigos no se manda nada
  const vacio = fakeCargador({ codigos: () => ['pd:MX:1:c'] }), v = bitacora({ cargador: vacio }); v.ctx.buf.length = 0; v.ctx.flush(false);
  assert.equal(v.envios.length, 1); assert.equal(v.envios[0].body.eventos, 'pd:MX:1:c'); assert.equal(vacio.calls.codigos, 1);
  const nada = fakeCargador({ codigos: () => [] }), n = bitacora({ cargador: nada }); n.ctx.buf.length = 0; n.ctx.flush(false);
  assert.equal(n.envios.length, 0);
});

test('COMPORTAMIENTO · bitácora: al cerrar la página (sendBeacon) también incluye los códigos antes del resumen (Nm ×E)', async () => {
  const c = fakeCargador({ codigos: () => ['pd:MX:900:r'] });
  const b = bitacora({ cargador: c, sendBeacon: true });
  b.ctx.flush(true);
  assert.equal(b.envios.length, 1); assert.equal(b.envios[0].via, 'beacon');
  const cuerpo = JSON.parse(await b.envios[0].blob.text());
  assert.match(cuerpo.eventos, /^30oct·21:30·MX● pd:MX:900:r \(1m ×1\)$/);
  assert.equal(b.ctx.cerrado, true);
});
