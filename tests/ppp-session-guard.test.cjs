'use strict';
/*
 * T-001 · Guarda de sesión de los PPP. Sin navegador, sin red, con dobles sintéticos.
 *
 * Acredita: ningún tablero PPP borra `pyod_clave_v1` (la sesión compartida de todo YOD OS) salvo que el
 * servidor haya rechazado la credencial (clave, liga, expirado, revocado, sin_sesion, unauthorized, forbidden,
 * http 401/403). Un fallo de lectura de otro tipo (servidor, hoja, tiempo, permisos de un tablero) la conserva.
 *
 * Método: del HTML real se extraen el helper, `reabrirGate`, `cargar` y el bloque de arranque; se ejecutan en
 * `vm` con localStorage y DOM falsos y una respuesta sintética de `?recurso=lista` / `?recurso=mapa`.
 * Las comprobaciones que leen el texto del HTML son estáticas y se rotulan como tales.
 *
 * NO acredita: cómo se ve el gate en un navegador, el Portero en vivo ni el backend real (eso es QA aparte).
 *
 * Para verla en rojo contra otra copia del repo (p. ej. un worktree de origin/main):
 *   PPP_SESSION_GUARD_ROOT=/ruta/al/arbol node --test tests/ppp-session-guard.test.cjs
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const ROOT = path.resolve(process.env.PPP_SESSION_GUARD_ROOT || path.join(__dirname, '..'));
const KEY = 'pyod_clave_v1', SESSION = 'sy-synthetic-session-0000000000', COLA = 'pyod_postq_v1';

const BORRAN = ['macrolotes', 'mixto', 'residencial', 'unifamiliar']; // gate propio: borran solo ante rechazo de credencial
const REFERENCIA = 'patrimonial';                                     // referencia de comportamiento: su gate nunca borra
const PORTAL = ['index', 'mapa'];                                      // variante: .catch del arranque de cargar()
const SIETE = [...BORRAN, REFERENCIA, ...PORTAL];

// Lista pactada: los 7 de portero.js:309 (= PPPCaseOpening.authErrors) + «http 401/403» de yod-portal/os/app.js:134.
const CREDENCIAL = ['clave', 'liga', 'expirado', 'revocado', 'sin_sesion', 'unauthorized', 'forbidden', 'http 401', 'http 403'];
// Fallos que NO invalidan la sesión: servidor/hoja/tiempo/red, permisos de un tablero y códigos de negocio.
const LARGO = 'Exception: Service Spreadsheets timed out while accessing document with id 1AbCdEfGhIjKlMnOpQrStUvWxYz0123456789';
const NO_CREDENCIAL = ['servidor', 'timeout', 'tiempo_agotado', 'lock_busy', 'unavailable', 'no_disponible', 'http_error',
  'HTTP 500', 'HTTP 502', 'no_existe', 'palabra_ocupada', 'board', 'sesion_cambio', 'respuesta_incompleta', 'error',
  'sin_acceso', 'sin acceso', 'denegado', 'no autorizado', LARGO, ''];
const SIN_MOTIVO = [undefined, null];

/* ---------- extracción del HTML real ---------- */
const cache = new Map();
const memo = (k, f) => { if (!cache.has(k)) cache.set(k, f()); return cache.get(k); };
const read = file => memo('read:' + file, () => fs.readFileSync(path.join(ROOT, file), 'utf8'));
const SCRIPT = /<script(?![^>]*\bsrc\s*=)[^>]*>([\s\S]*?)<\/script>/gi;
const inline = name => memo('inline:' + name, () => [...read(name + '.html').matchAll(SCRIPT)].map(m => m[1]).join('\n'));

/* `function nombre(...){...}`: el cierre lo decide el propio parser de V8 (primer `}` cuyo prefijo compila). */
function fnBlock(name, fn) {
  return memo('fn:' + name + ':' + fn, () => {
    const src = inline(name), m = new RegExp('(?:async\\s+)?function\\s+' + fn + '\\s*\\(').exec(src);
    if (!m) return null;
    for (let end = src.indexOf('}', m.index); end !== -1; end = src.indexOf('}', end + 1)) {
      const text = src.slice(m.index, end + 1);
      try { new vm.Script(text); return { text, start: m.index, end: end + 1 }; } catch { /* aún no es el cierre */ }
    }
    return null;
  });
}

/* Del primer `if` del arranque hasta el cierre del IIFE: es lo que corre al cargar la página con sesión guardada. */
function startup(name) {
  return memo('startup:' + name, () => {
    const src = inline(name);
    const marker = PORTAL.includes(name) ? 'if(clave){cargar(clave)'
      : "if(modoLocal){$('gate').classList.add('off');$('modoLocalBanner').classList.add('on')";
    const start = src.indexOf(marker);
    assert.ok(start >= 0 && src.indexOf(marker, start + 1) === -1, name + '.html: el bloque de arranque debe aparecer una sola vez');
    const end = src.indexOf('})();', start);
    assert.ok(end > start, name + '.html: no se halló el cierre del IIFE tras el arranque');
    return { text: src.slice(start, end), start, end };
  });
}

/* ---------- dobles ---------- */
function fakeElement(id, hidden) {
  const classes = new Set(hidden ? ['off'] : []), attrs = hidden ? { 'aria-hidden': 'true' } : {};
  return {
    id, textContent: '', classes, attrs,
    // El Portero oculta el gate con `display:none !important`, `aria-hidden` y la clase `off` (quitarSubGates).
    style: { display: hidden ? 'none' : '', removeProperty(p) { delete this[p]; } },
    classList: { add: c => classes.add(c), remove: c => classes.delete(c), contains: c => classes.has(c) },
    setAttribute: (a, v) => { attrs[a] = String(v); }, removeAttribute: a => { delete attrs[a]; },
    get visible() { return !classes.has('off') && this.style.display !== 'none' && attrs['aria-hidden'] === undefined; },
  };
}

function harness(name, { respuesta, rechaza = false, gateOculto = true, alResponder = () => {}, cola = false } = {}) {
  const store = new Map([[KEY, SESSION]]), els = new Map();
  if (cola) store.set(COLA, JSON.stringify([{ tipo: 'estado', caso_id: 'caso-sintetico', request_id: 'req-1' }]));
  const log = { toast: [], apiGet: 0, apiPost: 0, fetch: 0, sinConexion: 0, retired: 0, encolados: [] };
  const $ = id => { if (!els.has(id)) els.set(id, fakeElement(id, gateOculto && ['gate', 'mapGate'].includes(id))); return els.get(id); };
  const red = () => Promise.reject(new TypeError('Failed to fetch'));
  const ctx = {
    console, URLSearchParams, $,
    localStorage: { getItem: k => store.has(k) ? store.get(k) : null, setItem: (k, v) => { store.set(k, String(v)); }, removeItem: k => { store.delete(k); }, clear: () => store.clear() },
    LS: { clave: KEY, cola: COLA }, LSK: KEY, clave: SESSION, modoLocal: false, casosCache: [], cfgBoard: {}, location: { search: '' },
    apiGet: () => { log.apiGet++; return rechaza ? red() : Promise.resolve(respuesta); },
    apiPost: () => { log.apiPost++; return rechaza ? red() : Promise.resolve(respuesta); },
    encolar: p => { log.encolados.push(p); }, drenando: false, caso: {}, pintaCaso: () => {},
    toast: m => { log.toast.push(String(m)); }, modoSinConexion: () => { log.sinConexion++; },
    drenarCola: () => {}, procesarOpen: () => {}, abrirPorId: () => {}, casePresentation: () => {},
    retireVolumeIdentity: () => { log.retired++; },
    PPPCaseOpening: require(path.join(ROOT, 'ppp-case-opening.js')),
    // index.html y mapa.html
    ENDPOINT: 'https://script.invalid/exec', window: {}, addEventListener: () => {}, map: null, pines: [],
    initMap: () => {}, pinta: () => {}, ajusta: () => {},
    fetch: () => { log.fetch++; if (rechaza) return red(); alResponder(store); return Promise.resolve({ json: async () => respuesta }); },
  };
  vm.createContext(ctx);
  for (const fn of ['esRechazoDeCredencial', 'reabrirGate', 'cargar', 'postSeguimiento', 'drenarCola']) {
    const b = fnBlock(name, fn);
    if (b) vm.runInContext(b.text, ctx, { filename: name + '.html#' + fn });
  }
  const asentar = async () => { await new Promise(r => setImmediate(r)); await new Promise(r => setImmediate(r)); };
  return {
    ctx, store, log, $, errEl: $(name === 'index' ? 'mgErr' : 'gateErr'),
    async arranca() { vm.runInContext(startup(name).text, ctx, { filename: name + '.html#arranque' }); await asentar(); },
  };
}

/* ---------- 1. helper idéntico y lista pactada ---------- */
function helperBlock(name) {
  const lines = read(name + '.html').split('\n');
  const i = lines.findIndex(l => /^ {2}function esRechazoDeCredencial\(err\)\{/.test(l));
  assert.ok(i >= 2, name + '.html: falta esRechazoDeCredencial');
  assert.match(lines[i - 2], /^ {2}\/\//, name + '.html: falta la línea 1 del comentario de procedencia');
  assert.match(lines[i - 1], /^ {2}\/\//, name + '.html: falta la línea 2 del comentario de procedencia');
  return lines.slice(i - 2, i + 1).join('\n');
}

test('ESTÁTICO · esRechazoDeCredencial es textualmente idéntico (comentario de 2 líneas + función) en los siete HTML', () => {
  const [primero, ...resto] = SIETE.map(helperBlock);
  resto.forEach((b, i) => assert.equal(b, primero, SIETE[i + 1] + '.html difiere del helper de ' + SIETE[0] + '.html'));
  for (const n of SIETE) assert.equal((read(n + '.html').match(/function esRechazoDeCredencial\(/g) || []).length, 1, n + '.html: una sola definición');
});

test('ESTÁTICO · la lista del helper es exactamente la pactada y cada código sale de una fuente existente', () => {
  const lista = [...helperBlock(SIETE[0]).match(/\[((?:'[^']*',?)+)\]\.includes/)[1].matchAll(/'([^']*)'/g)].map(m => m[1]);
  assert.deepEqual([...lista].sort(), [...CREDENCIAL].sort());
  const portero = /\[((?:\s*'[a-z_ ]+'\s*,?)+)\]\s*\.includes\(\s*String\(\s*r\.error/.exec(read('portero.js'));
  assert.ok(portero, 'portero.js cambió la forma de su lista de rechazos (línea ~309): revisa esta prueba y el helper');
  const delPortero = [...portero[1].matchAll(/'([^']+)'/g)].map(m => m[1]);
  const PPPCaseOpening = require(path.join(ROOT, 'ppp-case-opening.js'));
  for (const c of delPortero) {
    assert.ok(lista.includes(c), 'el Portero rechaza «' + c + '» y el helper no');
    assert.equal(PPPCaseOpening.isAuthenticationError(c), true, 'PPPCaseOpening debe coincidir con el Portero en «' + c + '»');
  }
  for (const c of lista) assert.ok(delPortero.includes(c) || /^http 40[13]$/.test(c), '«' + c + '» no sale del Portero ni de os/app.js');
});

test('COMPORTAMIENTO · esRechazoDeCredencial: true solo para credenciales (texto, Error, mayúsculas, espacios)', () => {
  for (const name of SIETE) {
    const f = harness(name).ctx.esRechazoDeCredencial;
    assert.equal(typeof f, 'function', name + '.html: no se pudo extraer el helper');
    for (const c of CREDENCIAL) {
      assert.equal(f(c), true, name + ': ' + c);
      assert.equal(f('  ' + c.toUpperCase() + ' '), true, name + ': ' + c + ' (mayúsculas y espacios)');
      assert.equal(f(new Error(c)), true, name + ': Error(' + c + ')');
    }
    for (const c of NO_CREDENCIAL) assert.equal(f(c), false, name + ': ' + JSON.stringify(c.slice(0, 40)));
    for (const x of [...SIN_MOTIVO, 0, false, {}, [], { error: 'clave' }, new TypeError('Failed to fetch'), new SyntaxError("Unexpected token '<'")])
      assert.equal(f(x), false, name + ': ' + Object.prototype.toString.call(x));
  }
});

/* ---------- 2. reabrirGate(motivo) ---------- */
for (const name of BORRAN) {
  test('COMPORTAMIENTO · ' + name + ': reabrirGate(motivo) borra la sesión solo ante rechazo de credencial y siempre muestra el gate', () => {
    for (const motivo of [...NO_CREDENCIAL, ...SIN_MOTIVO]) {
      const h = harness(name);
      h.ctx.reabrirGate(motivo);
      assert.equal(h.store.get(KEY), SESSION, name + ': reabrirGate(' + JSON.stringify(String(motivo).slice(0, 30)) + ') NO debe borrar la llave');
      assert.equal(h.ctx.clave, SESSION);
      assert.equal(h.log.retired, 0, 'sin credencial retirada no se retira la identidad de volúmenes');
      assert.equal(h.$('gate').visible, true, 'el gate debe quedar visible aunque el Portero lo haya ocultado');
      assert.match(h.errEl.textContent, /^El tablero no pudo leer la lista \(.+\)\. Tu sesión sigue abierta; vuelve a intentar/);
      if (motivo) assert.ok(h.errEl.textContent.includes('(' + String(motivo).slice(0, 80) + ')'), 'el motivo debe verse (acotado a 80 caracteres)');
    }
    assert.ok(!harness(name).errEl.textContent.includes(LARGO), 'el motivo largo se recorta');
    for (const motivo of CREDENCIAL) {
      const h = harness(name);
      h.ctx.reabrirGate(motivo);
      assert.equal(h.store.has(KEY), false, name + ': reabrirGate(' + motivo + ') SÍ debe borrar la llave');
      assert.equal(h.ctx.clave, '');
      assert.equal(h.log.retired, name === 'mixto' ? 1 : 0, 'mixto retira su identidad de volúmenes al perder la credencial');
      assert.equal(h.$('gate').visible, true);
      assert.equal(h.errEl.textContent, 'La clave cambió o es incorrecta');
    }
  });
}

test('COMPORTAMIENTO · patrimonial (referencia): su gate se muestra pero jamás borra la sesión', () => {
  for (const motivo of [...CREDENCIAL, ...NO_CREDENCIAL, ...SIN_MOTIVO]) {
    const h = harness(REFERENCIA);
    h.ctx.reabrirGate(motivo);
    assert.equal(h.store.get(KEY), SESSION);
    assert.equal(h.ctx.clave, SESSION);
    assert.equal(h.$('gate').visible, true);
  }
});

/* ---------- 3. arranque real de cada tablero ---------- */
for (const name of BORRAN) {
  test('COMPORTAMIENTO · ' + name + ': el arranque con ok:false conserva la sesión salvo rechazo de credencial', async () => {
    for (const error of [...NO_CREDENCIAL, undefined]) {
      const h = harness(name, { respuesta: { ok: false, error } });
      await h.arranca();
      assert.equal(h.log.apiGet, 1);
      assert.equal(h.store.get(KEY), SESSION, name + ': ok:false/' + JSON.stringify(error && error.slice(0, 30)) + ' NO debe borrar la sesión');
      assert.equal(h.ctx.clave, SESSION);
      assert.equal(h.$('gate').visible, true, 'el gate se muestra con el motivo');
      assert.equal(h.log.sinConexion, 0, 'no es un fallo de red (y descarta una excepción tragada por el catch)');
    }
    for (const error of CREDENCIAL) {
      const h = harness(name, { respuesta: { ok: false, error } });
      await h.arranca();
      assert.equal(h.store.has(KEY), false, name + ': ok:false/' + error + ' SÍ debe borrar la sesión');
      assert.equal(h.ctx.clave, '');
      assert.equal(h.$('gate').visible, true);
      assert.equal(h.log.sinConexion, 0);
    }
    const ok = harness(name, { respuesta: { ok: true, casos: [], config: {} }, gateOculto: false });
    await ok.arranca();
    assert.equal(ok.store.get(KEY), SESSION);
    assert.equal(ok.$('gate').visible, false, 'con la lista leída el gate se retira');
    const red = harness(name, { rechaza: true });
    await red.arranca();
    assert.equal(red.store.get(KEY), SESSION, 'el catch de red conserva la sesión');
    assert.equal(red.log.sinConexion, 1, 'el catch de red sigue entrando en modo sin conexión');
  });
}

/* Los sitios que ya estaban protegidos por `=== 'clave'` solo cambiaron de argumento; aquí se comprueba que siguen
 * borrando ante 'clave' y que un fallo de otro tipo no toca la sesión ni pierde la cola pendiente (corre cada 25 s). */
for (const name of BORRAN) {
  test('COMPORTAMIENTO · ' + name + ': postSeguimiento y la cola pendiente solo borran la sesión ante «clave»', async () => {
    for (const error of [...NO_CREDENCIAL, undefined]) {
      const a = harness(name, { respuesta: { ok: false, error } });
      await a.ctx.postSeguimiento({ tipo: 'estado' }, 'listo');
      assert.equal(a.store.get(KEY), SESSION, name + ': postSeguimiento con ok:false/' + JSON.stringify(error && error.slice(0, 30)) + ' NO debe borrar la sesión');
      assert.equal(a.$('gate').visible, false, 'sin rechazo de credencial no se abre el gate');
      const b = harness(name, { respuesta: { ok: false, error }, cola: true });
      await b.ctx.drenarCola();
      assert.equal(b.log.apiPost, 1);
      assert.equal(b.store.get(KEY), SESSION, name + ': drenarCola con ok:false/' + JSON.stringify(error && error.slice(0, 30)) + ' NO debe borrar la sesión');
      // drenarCola descarta a propósito el envío ante no_existe / palabra_ocupada (el caso ya no existe o hay conflicto).
      const descartado = ['no_existe', 'palabra_ocupada'].includes(error);
      assert.equal(JSON.parse(b.store.get(COLA)).length, descartado ? 0 : 1, 'el envío pendiente se conserva para reintentar');
    }
    const a = harness(name, { respuesta: { ok: false, error: 'clave' } });
    await a.ctx.postSeguimiento({ tipo: 'estado' }, 'listo');
    assert.equal(a.store.has(KEY), false, name + ': postSeguimiento ante «clave» SÍ debe borrar la sesión');
    assert.equal(a.ctx.clave, '');
    assert.equal(a.$('gate').visible, true);
    const b = harness(name, { respuesta: { ok: false, error: 'clave' }, cola: true });
    await b.ctx.drenarCola();
    assert.equal(b.store.has(KEY), false, name + ': drenarCola ante «clave» SÍ debe borrar la sesión');
    assert.equal(b.$('gate').visible, true);
    assert.equal(JSON.parse(b.store.get(COLA)).length, 1, 'el envío pendiente no se pierde al reabrir el gate');
    const red = harness(name, { rechaza: true, cola: true });
    await red.ctx.drenarCola();
    assert.equal(red.store.get(KEY), SESSION, 'sin red la sesión y la cola se conservan');
    assert.equal(JSON.parse(red.store.get(COLA)).length, 1);
  });
}

test('COMPORTAMIENTO · patrimonial (referencia): el arranque conserva siempre la sesión; auth abre el gate y el resto avisa', async () => {
  const { isAuthenticationError } = require(path.join(ROOT, 'ppp-case-opening.js'));
  for (const error of [...CREDENCIAL, ...NO_CREDENCIAL, undefined]) {
    const h = harness(REFERENCIA, { respuesta: { ok: false, error } });
    await h.arranca();
    assert.equal(h.store.get(KEY), SESSION, 'patrimonial: ok:false/' + error);
    assert.equal(h.ctx.clave, SESSION);
    if (isAuthenticationError(error)) assert.equal(h.$('gate').visible, true);
    else { assert.equal(h.$('gate').visible, false); assert.equal(h.log.toast.length, 1); assert.match(h.log.toast[0], /Tu sesión se conserva/); }
  }
});

for (const name of PORTAL) {
  test('COMPORTAMIENTO · ' + name + ': el arranque de cargar() borra la sesión solo ante rechazo de credencial', async () => {
    for (const error of [...NO_CREDENCIAL, undefined]) {
      const h = harness(name, { respuesta: { ok: false, error } });
      await h.arranca();
      assert.equal(h.store.get(KEY), SESSION, name + ': ok:false/' + JSON.stringify(error && error.slice(0, 30)) + ' NO debe borrar la sesión');
    }
    for (const error of CREDENCIAL) {
      const h = harness(name, { respuesta: { ok: false, error } });
      await h.arranca();
      assert.equal(h.store.has(KEY), false, name + ': ok:false/' + error + ' SÍ debe borrar la sesión');
      assert.equal(h.errEl.textContent, 'La clave cambió');
    }
    const red = harness(name, { rechaza: true });
    await red.arranca();
    assert.equal(red.store.get(KEY), SESSION, 'el catch de red conserva la sesión');
    const otra = harness(name, { respuesta: { ok: true, pines: [] }, alResponder: s => s.set(KEY, 'sy-otra-pestana-1111111111') });
    await otra.arranca();
    assert.equal(otra.store.get(KEY), 'sy-otra-pestana-1111111111', 'una sesión nueva puesta desde otra pestaña no se toca');
    const bien = harness(name, { respuesta: { ok: true, pines: [] }, gateOculto: false });
    await bien.arranca();
    assert.equal(bien.store.get(KEY), SESSION);
    assert.equal(bien.$(name === 'index' ? 'mapGate' : 'gate').visible, false, 'con los pines leídos el gate se retira');
  });
}

/* ---------- 4. comprobaciones estáticas del texto ---------- */
const BORRADO = /(?:removeItem\s*\(\s*(?:LS\.clave|LSK|LSC|['"]pyod_clave_v1['"])\s*\)|localStorage\s*\.\s*clear\s*\()/g;

test('ESTÁTICO · la llave solo se borra dentro de reabrirGate (motores) o del .catch de arranque (index y mapa)', () => {
  for (const name of SIETE) {
    const src = inline(name), hits = [...src.matchAll(BORRADO)].map(m => m.index);
    if (name === REFERENCIA) { assert.deepEqual(hits, [], name + '.html: no debe borrar la llave en ningún sitio'); continue; }
    assert.equal(hits.length, 1, name + '.html: debe haber exactamente un borrado de la llave');
    if (PORTAL.includes(name)) {
      const s = startup(name);
      assert.ok(hits[0] >= s.start && hits[0] < s.end, name + '.html: el borrado debe estar en el .catch del arranque');
      assert.match(s.text, /\.catch\(e=>\{if\(esRechazoDeCredencial\(e\)\)\{localStorage\.removeItem\(LSK\);/, name + '.html: el borrado debe depender de esRechazoDeCredencial(e)');
    } else {
      const g = fnBlock(name, 'reabrirGate');
      assert.ok(g, name + '.html: falta reabrirGate');
      assert.ok(hits[0] >= g.start && hits[0] < g.end, name + '.html: el borrado debe estar dentro de reabrirGate');
      assert.match(g.text, /const credencial=esRechazoDeCredencial\(motivo\);/);
      assert.match(g.text, /if\(credencial\)\{(?:retireVolumeIdentity\(\);)?localStorage\.removeItem\(LS\.clave\);clave=''\}/, name + '.html: el borrado debe ir bajo if(credencial)');
    }
  }
});

test('ESTÁTICO · ninguna llamada a reabrirGate() de los motores omite el motivo', () => {
  for (const name of BORRAN) assert.doesNotMatch(inline(name), /reabrirGate\(\s*\)/, name + '.html: hay reabrirGate() sin motivo');
});

test('ESTÁTICO · ningún módulo ppp-*.js borra la sesión compartida', () => {
  const modulos = fs.readdirSync(ROOT).filter(f => /^ppp-[\w-]+\.js$/.test(f));
  assert.ok(modulos.length > 10, 'se esperaban los módulos ppp-*.js del repo');
  for (const f of modulos) assert.equal((read(f).match(BORRADO) || []).length, 0, f + ' no debe borrar pyod_clave_v1');
});
