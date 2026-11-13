'use strict';
/*
 * T-204 · O7 · Cierre de la sesión compartida cuando el cargador está activo (Fase 1). Sin navegador, sin red, con dobles sintéticos.
 *
 * Acredita: los seis sitios que cierran `pyod_clave_v1` ante un rechazo de credencial (reabrirGate de macrolotes, mixto, residencial y unifamiliar; el
 * arranque de index y mapa) usan `YodCargador.sesion.cerrar({token, motivo})` con el token que el servidor rechazó, en lugar de borrar la llave por su
 * cuenta, SOLO si el cargador está activo (v, sin legacy y con sesion.cerrar). Sin cargador, con ?cargador=legacy o con un cargador sin cerrar(), se
 * conserva el borrado de siempre. Ante cualquier fallo que no sea de credencial no se cierra nada.
 * La guardia de carrera vive en el cargador (cerrar solo suelta la llave si sigue siendo el token rechazado; devuelve false si otra pestaña ya puso otra):
 * aquí se verifica que se le pasa el token rechazado y, con un doble que implementa esa guardia, que la sesión nueva sobrevive.
 *
 * Método: el mismo de ppp-session-guard.test.cjs (que sigue verde sin cambios): del HTML real se extraen el helper, `reabrirGate`, `cargar` y el
 * bloque de arranque, y se ejecutan en `vm` con localStorage y DOM falsos. Las comprobaciones que leen el texto del HTML son estáticas y se rotulan así.
 *
 * NO acredita: el cargador real (eso es tests/yod-cargador.test.cjs de yod-portal y los recorridos de navegador), ni cómo se ve el gate.
 *
 * Para verla en rojo contra otra copia del repo (p. ej. un worktree sin los cambios de T-204):
 *   PPP_SESSION_GUARD_ROOT=/ruta/al/arbol node --test tests/ppp-cierre-cargador.test.cjs
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const ROOT = path.resolve(process.env.PPP_SESSION_GUARD_ROOT || path.join(__dirname, '..'));
const KEY = 'pyod_clave_v1', SESSION = 'sy-sintetica-rechazada-0000', OTRA = 'sy-sintetica-otra-pestana-111';

const MOTORES = ['macrolotes', 'mixto', 'residencial', 'unifamiliar'];   // reabrirGate(motivo)
const PORTALES = ['index', 'mapa'];                                       // .then(ok, rechazo) del arranque de cargar()
const SEIS = [...MOTORES, ...PORTALES];
const REFERENCIA = 'patrimonial';                                         // su gate no borra la llave por diseño: no se toca

// Mismos grupos de motivos que ppp-session-guard.test.cjs.
const CREDENCIAL = ['clave', 'liga', 'expirado', 'revocado', 'sin_sesion', 'unauthorized', 'forbidden', 'http 401', 'http 403'];
const NO_CREDENCIAL = ['servidor', 'timeout', 'tiempo_agotado', 'lock_busy', 'unavailable', 'no_disponible', 'http_error', 'HTTP 500', 'no_existe',
  'palabra_ocupada', 'board', 'sin_acceso', 'denegado', ''];

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

/* Arranque con sesión guardada. En los portales empieza en la captura `const claveDeArranque=clave;` (el token que viajó) y en los motores en el primer `if` del arranque. */
function startup(name) {
  return memo('startup:' + name, () => {
    const src = inline(name);
    const marker = PORTALES.includes(name) ? 'const claveDeArranque=clave;'
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
    style: { display: hidden ? 'none' : '', removeProperty(p) { delete this[p]; } },
    classList: { add: c => classes.add(c), remove: c => classes.delete(c), contains: c => classes.has(c) },
    setAttribute: (a, v) => { attrs[a] = String(v); }, removeAttribute: a => { delete attrs[a]; },
    get visible() { return !classes.has('off') && this.style.display !== 'none' && attrs['aria-hidden'] === undefined; },
  };
}

/* El cargador: `sesion.cerrar` con la MISMA semántica del real (yod-portal/os/yod-cargador.js):
 *   igual = !!o.token && localStorage[llave] === o.token; si igual, suelta la llave; purga caches; devuelve igual.
 * `inerte` no toca el almacenamiento: así se ve que, si la llave desaparece, no fue el motor quien la borró. */
const MODOS = {
  activo: (store, llamadas) => ({ v: '1', legacy: false, sesion: { cerrar: guardia(store, llamadas) } }),
  'legacy': (store, llamadas) => ({ v: '1', legacy: true, sesion: { cerrar: guardia(store, llamadas) } }),
  'sin-cerrar': () => ({ v: '1', legacy: false, sesion: {} }),
  'sin-sesion': () => ({ v: '1', legacy: false }),
  'sin-version': (store, llamadas) => ({ legacy: false, sesion: { cerrar: guardia(store, llamadas) } }),
  'cerrar-no-funcion': () => ({ v: '1', legacy: false, sesion: { cerrar: 'no soy una función' } }),
  ninguno: null,
};
function guardia(store, llamadas) {
  return o => {
    llamadas.push(JSON.parse(JSON.stringify(o)));
    const igual = !!(o && o.token) && store.get(KEY) === o.token;
    if (igual) store.delete(KEY);
    return igual;
  };
}

function harness(name, { respuesta, rechaza = false, modo = 'activo', alResponder = () => {} } = {}) {
  const store = new Map([[KEY, SESSION]]), els = new Map(), llamadasCerrar = [];
  const log = { removeItem: 0, retired: 0, sinConexion: 0, cerrar: llamadasCerrar };
  const $ = id => { if (!els.has(id)) els.set(id, fakeElement(id, ['gate', 'mapGate'].includes(id))); return els.get(id); };
  const red = () => Promise.reject(new TypeError('Failed to fetch'));
  const ctx = {
    console, URLSearchParams, $,
    localStorage: { getItem: k => store.has(k) ? store.get(k) : null, setItem: (k, v) => { store.set(k, String(v)); }, removeItem: k => { log.removeItem++; store.delete(k); }, clear: () => { log.removeItem++; store.clear(); } },
    LS: { clave: KEY, cola: 'pyod_postq_v1' }, LSK: KEY, clave: SESSION, modoLocal: false, casosCache: [], cfgBoard: {}, location: { search: '' },
    apiGet: () => { alResponder(store, ctx); return rechaza ? red() : Promise.resolve(respuesta); },
    apiPost: () => Promise.resolve(respuesta),
    encolar: () => {}, drenando: false, caso: {}, pintaCaso: () => {},
    toast: () => {}, modoSinConexion: () => { log.sinConexion++; },
    drenarCola: () => {}, procesarOpen: () => {}, abrirPorId: () => {}, casePresentation: () => {},
    retireVolumeIdentity: () => { log.retired++; },
    PPPCaseOpening: require(path.join(ROOT, 'ppp-case-opening.js')),
    // index.html y mapa.html
    ENDPOINT: 'https://script.invalid/exec', addEventListener: () => {}, map: null, pines: [],
    initMap: () => {}, pinta: () => {}, ajusta: () => {},
    fetch: () => { alResponder(store, ctx); return rechaza ? red() : Promise.resolve({ json: async () => respuesta }); },
  };
  ctx.window = MODOS[modo] ? { YodCargador: MODOS[modo](store, llamadasCerrar) } : {};
  vm.createContext(ctx);
  for (const fn of ['esRechazoDeCredencial', 'reabrirGate', 'cargar']) {
    const b = fnBlock(name, fn);
    if (b) vm.runInContext(b.text, ctx, { filename: name + '.html#' + fn });
  }
  const asentar = async () => { await new Promise(r => setImmediate(r)); await new Promise(r => setImmediate(r)); };
  return {
    ctx, store, log, $, errEl: $(name === 'index' ? 'mgErr' : 'gateErr'),
    async arranca() { vm.runInContext(startup(name).text, ctx, { filename: name + '.html#arranque' }); await asentar(); },
  };
}

/* ---------- 1. estáticas ---------- */
const BORRADO = /(?:removeItem\s*\(\s*(?:LS\.clave|LSK|LSC|['"]pyod_clave_v1['"])\s*\)|localStorage\s*\.\s*clear\s*\()/g;
// La condición con la que los seis deciden si el cargador está activo: la misma, palabra por palabra (la fija el contrato T-204 / O7).
const ACTIVO = "typeof window!=='undefined'&&window.YodCargador&&window.YodCargador.v&&!window.YodCargador.legacy&&window.YodCargador.sesion&&typeof window.YodCargador.sesion.cerrar==='function'";

test('ESTÁTICO · los seis llaman a sesion.cerrar({token,motivo}) una sola vez, con la misma condición de «cargador activo», y conservan UN borrado literal', () => {
  for (const name of SEIS) {
    const src = inline(name);
    assert.equal(src.split(ACTIVO).length - 1, 1, name + '.html: la condición de cargador activo debe aparecer una vez y ser la pactada');
    const cierres = [...src.matchAll(/window\.YodCargador\.sesion\.cerrar\(\s*\{([^}]*)\}\s*\)/g)];
    assert.equal(cierres.length, 1, name + '.html: una sola llamada a sesion.cerrar');
    assert.match(cierres[0][1], /^token:[A-Za-z]+,motivo:String\(.+\)$/, name + '.html: cerrar recibe {token, motivo}');
    assert.equal((src.match(BORRADO) || []).length, 1, name + '.html: el borrado literal de siempre (camino sin cargador) sigue siendo uno solo');
    assert.equal((src.match(/sesion\.cerrar\(/g) || []).length, 1, name + '.html: no hay otra llamada a cerrar fuera de la pactada');
  }
});

test('ESTÁTICO · motores: el token es la clave del módulo en ese momento; portales: la que viajó en el arranque', () => {
  for (const name of MOTORES) assert.match(inline(name), /sesion\.cerrar\(\{token:clave,motivo:/, name + '.html');
  for (const name of PORTALES) {
    assert.match(inline(name), /sesion\.cerrar\(\{token:claveDeArranque,motivo:/, name + '.html');
    assert.equal((inline(name).match(/const claveDeArranque=clave;/g) || []).length, 1, name + '.html: la captura va una sola vez, justo antes de cargar(clave)');
    assert.match(inline(name), /const claveDeArranque=clave;\s*if\(clave\)\{cargar\(clave\)/, name + '.html: se captura antes de pedir nada');
  }
});

test('ESTÁTICO · el camino sin cargador es el de siempre: motores bajo else if(credencial), portales en el .catch final', () => {
  for (const name of MOTORES) {
    const g = fnBlock(name, 'reabrirGate');
    assert.ok(g, name + '.html: falta reabrirGate');
    assert.match(g.text, /else if\(credencial\)\{(?:retireVolumeIdentity\(\);)?localStorage\.removeItem\(LS\.clave\);clave=''\}/, name + '.html');
    assert.match(g.text, new RegExp('^function reabrirGate\\(motivo\\)\\{\\s*const credencial=esRechazoDeCredencial\\(motivo\\);'), name + '.html: la decisión sigue siendo esRechazoDeCredencial(motivo)');
  }
  for (const name of PORTALES) {
    assert.match(startup(name).text, /\.catch\(e=>\{if\(esRechazoDeCredencial\(e\)\)\{localStorage\.removeItem\(LSK\);/, name + '.html');
    assert.match(startup(name).text, /;return\}throw e\}\)\.catch\(/, name + '.html: lo que el cargador no atiende se relanza al .catch de siempre');
  }
});

test('ESTÁTICO · patrimonial (referencia) no borra la llave ni la cierra con el cargador', () => {
  assert.equal((inline(REFERENCIA).match(BORRADO) || []).length, 0);
  assert.doesNotMatch(inline(REFERENCIA), /sesion\.cerrar\(/);
});

/* ---------- 2. motores: reabrirGate(motivo) ---------- */
for (const name of MOTORES) {
  test('COMPORTAMIENTO · ' + name + ': con el cargador activo, reabrirGate(credencial) llama a cerrar con el token rechazado y NO borra la llave por su cuenta', () => {
    for (const motivo of CREDENCIAL) {
      const h = harness(name);
      h.ctx.reabrirGate(motivo);
      assert.deepEqual(h.log.cerrar, [{ token: SESSION, motivo }], name + ': reabrirGate(' + motivo + ') cierra una vez con el token y el motivo');
      assert.equal(h.log.removeItem, 0, name + ': el motor no llama a removeItem (la llave la suelta el cargador, con su guardia)');
      assert.equal(h.store.has(KEY), false, 'el cargador (doble con la semántica real) soltó la llave porque seguía siendo el token rechazado');
      assert.equal(h.ctx.clave, '');
      assert.equal(h.log.retired, name === 'mixto' ? 1 : 0, 'mixto retira su identidad de volúmenes igual que sin cargador');
      assert.equal(h.$('gate').visible, true);
      assert.equal(h.errEl.textContent, 'La clave cambió o es incorrecta');
    }
    // el motivo puede llegar como Error (así lo manda el catch de red de los motores)
    const e = harness(name);
    e.ctx.reabrirGate(new Error('forbidden'));
    assert.deepEqual(e.log.cerrar, [{ token: SESSION, motivo: 'forbidden' }]);
  });

  test('COMPORTAMIENTO · ' + name + ': GUARDIA DE CARRERA — si otra pestaña ya puso otra sesión, cerrar devuelve false y la nueva sobrevive', () => {
    const h = harness(name, { modo: 'activo' });
    h.store.set(KEY, OTRA);   // otra pestaña entró entre el rechazo y este cierre
    h.ctx.reabrirGate('clave');
    assert.deepEqual(h.log.cerrar, [{ token: SESSION, motivo: 'clave' }], 'se le pasa el token que se rechazó, no el que hay guardado');
    assert.equal(h.store.get(KEY), OTRA, 'la sesión nueva no se toca');
    assert.equal(h.log.removeItem, 0);
    assert.equal(h.ctx.clave, '', 'esta pestaña sí muestra el gate: su clave fue la rechazada');
    assert.equal(h.$('gate').visible, true);
  });

  test('COMPORTAMIENTO · ' + name + ': sin credencial no se cierra nada, con cargador o sin él', () => {
    for (const modo of ['activo', 'ninguno']) for (const motivo of [...NO_CREDENCIAL, undefined, null]) {
      const h = harness(name, { modo });
      h.ctx.reabrirGate(motivo);
      assert.deepEqual(h.log.cerrar, [], name + '/' + modo + ': reabrirGate(' + String(motivo).slice(0, 20) + ') no cierra');
      assert.equal(h.log.removeItem, 0);
      assert.equal(h.store.get(KEY), SESSION);
      assert.equal(h.ctx.clave, SESSION);
      assert.equal(h.$('gate').visible, true, 'el gate se muestra igual, con el motivo');
    }
  });

  test('COMPORTAMIENTO · ' + name + ': sin cargador, con ?cargador=legacy o con un cargador que no puede cerrar, el borrado es el de siempre', () => {
    for (const modo of ['ninguno', 'legacy', 'sin-cerrar', 'sin-sesion', 'sin-version', 'cerrar-no-funcion']) {
      for (const motivo of CREDENCIAL) {
        const h = harness(name, { modo });
        h.ctx.reabrirGate(motivo);
        assert.deepEqual(h.log.cerrar, [], name + '/' + modo + ': no se llama a cerrar');
        assert.equal(h.log.removeItem, 1, name + '/' + modo + ': removeItem una vez, como hoy');
        assert.equal(h.store.has(KEY), false);
        assert.equal(h.ctx.clave, '');
        assert.equal(h.log.retired, name === 'mixto' ? 1 : 0);
        assert.equal(h.errEl.textContent, 'La clave cambió o es incorrecta');
      }
    }
  });

  test('COMPORTAMIENTO · ' + name + ': el arranque con ok:false cierra con el cargador solo ante credencial; un fallo de otro tipo o la red conservan la sesión', async () => {
    for (const error of CREDENCIAL) {
      const h = harness(name, { respuesta: { ok: false, error } });
      await h.arranca();
      assert.deepEqual(h.log.cerrar, [{ token: SESSION, motivo: error }], name + ': ok:false/' + error);
      assert.equal(h.log.removeItem, 0);
      assert.equal(h.store.has(KEY), false);
      assert.equal(h.$('gate').visible, true);
    }
    for (const error of [...NO_CREDENCIAL, undefined]) {
      const h = harness(name, { respuesta: { ok: false, error } });
      await h.arranca();
      assert.deepEqual(h.log.cerrar, [], name + ': ok:false/' + error + ' no cierra');
      assert.equal(h.store.get(KEY), SESSION);
      assert.equal(h.log.removeItem, 0);
    }
    const red = harness(name, { rechaza: true });
    await red.arranca();
    assert.deepEqual(red.log.cerrar, []);
    assert.equal(red.store.get(KEY), SESSION);
    assert.equal(red.log.sinConexion, 1, 'la red caída sigue entrando en modo sin conexión');
    const legacy = harness(name, { respuesta: { ok: false, error: 'clave' }, modo: 'legacy' });
    await legacy.arranca();
    assert.deepEqual(legacy.log.cerrar, []);
    assert.equal(legacy.log.removeItem, 1);
    assert.equal(legacy.store.has(KEY), false);
  });
}

/* ---------- 3. portales: el arranque de cargar() ---------- */
for (const name of PORTALES) {
  const mensaje = 'La clave cambió';
  test('COMPORTAMIENTO · ' + name + ': con el cargador activo, el rechazo del arranque llama a cerrar con el token que viajó y NO borra la llave por su cuenta', async () => {
    for (const error of CREDENCIAL) {
      const h = harness(name, { respuesta: { ok: false, error } });
      await h.arranca();
      assert.deepEqual(h.log.cerrar, [{ token: SESSION, motivo: error }], name + ': ok:false/' + error);
      assert.equal(h.log.removeItem, 0, name + ': el portal no llama a removeItem');
      assert.equal(h.store.has(KEY), false, 'el cargador soltó la llave porque seguía siendo el token rechazado');
      assert.equal(h.errEl.textContent, mensaje);
    }
  });

  test('COMPORTAMIENTO · ' + name + ': GUARDIA DE CARRERA — otra pestaña pone otra sesión mientras llega el rechazo: se le pasa el token que viajó y la nueva sobrevive', async () => {
    // la respuesta llega cuando ya hay otra sesión guardada y el módulo ya cambió de clave (p. ej. entrar() desde el gate)
    const h = harness(name, { respuesta: { ok: false, error: 'clave' }, alResponder: (store, ctx) => { store.set(KEY, OTRA); ctx.clave = OTRA; } });
    await h.arranca();
    assert.deepEqual(h.log.cerrar, [{ token: SESSION, motivo: 'clave' }], name + ': el token es el que se mandó, no el actual del módulo');
    assert.equal(h.store.get(KEY), OTRA, 'la sesión nueva no se toca');
    assert.equal(h.log.removeItem, 0);
    assert.equal(h.errEl.textContent, mensaje);
  });

  test('COMPORTAMIENTO · ' + name + ': sin credencial no se cierra nada; la red caída y los demás fallos van por el .catch de siempre', async () => {
    for (const error of [...NO_CREDENCIAL, undefined]) {
      const h = harness(name, { respuesta: { ok: false, error } });
      await h.arranca();
      assert.deepEqual(h.log.cerrar, [], name + ': ok:false/' + error + ' no cierra');
      assert.equal(h.store.get(KEY), SESSION);
      assert.equal(h.log.removeItem, 0);
    }
    const red = harness(name, { rechaza: true });
    await red.arranca();
    assert.deepEqual(red.log.cerrar, []);
    assert.equal(red.store.get(KEY), SESSION);
    if (name === 'mapa') assert.equal(red.errEl.textContent, 'Sin conexión con el Sheet', 'mapa avisa cuando no hay red, como hoy');
    const bien = harness(name, { respuesta: { ok: true, pines: [] } });
    await bien.arranca();
    assert.deepEqual(bien.log.cerrar, []);
    assert.equal(bien.store.get(KEY), SESSION);
  });

  test('COMPORTAMIENTO · ' + name + ': sin cargador, con ?cargador=legacy o con un cargador que no puede cerrar, el .catch borra como siempre', async () => {
    for (const modo of ['ninguno', 'legacy', 'sin-cerrar', 'sin-sesion', 'sin-version', 'cerrar-no-funcion']) {
      for (const error of CREDENCIAL) {
        const h = harness(name, { respuesta: { ok: false, error }, modo });
        await h.arranca();
        assert.deepEqual(h.log.cerrar, [], name + '/' + modo + ': no se llama a cerrar');
        assert.equal(h.log.removeItem, 1, name + '/' + modo + ': removeItem una vez, como hoy');
        assert.equal(h.store.has(KEY), false);
        assert.equal(h.errEl.textContent, mensaje);
      }
    }
  });
}
