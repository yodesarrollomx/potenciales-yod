/* Pruebas de server/ppp2/ArbolPPP.gs en Node, contra un DOBLE de Google Sheets (en memoria, datos inventados). No llama a Google ni a ningún servidor.
   Las ayudas del servidor del PPP 2 (low_, txt_, lista_, puede_, actor_, pausa_, arbolEncendido_) se toman del código real de server/ppp2/PPP2.gs.
   Uso: node arbol-ppp/conexion/pruebas-gs.cjs  ·  sale con 1 si algo falla. Un doble no demuestra el comportamiento de Google Sheets ni de producción. */
'use strict';
const fs = require('fs'), vm = require('vm'), path = require('path'), assert = require('assert');
const SERVIDOR = path.join(__dirname, '..', '..', 'server', 'ppp2');
const PPP2 = path.join(SERVIDOR, 'PPP2.gs'), ARBOL_GS = path.join(SERVIDOR, 'ArbolPPP.gs');
const R = { n: 0, ok: 0, fallos: [] };
function prueba(nombre, f) { R.n++; try { f(); R.ok++; console.log('  ok   ' + nombre); } catch (e) { R.fallos.push(nombre + ' → ' + String(e.message).split('\n')[0]); console.log('  FALLA ' + nombre + ' → ' + String(e.message).split('\n')[0]); if (process.env.DEPURA) console.log(e.stack); } }

/* ── ayudas reales de PPP2.gs ── */
const src = fs.readFileSync(PPP2, 'utf8');
function funcion(nombre) {
  const i = src.indexOf('function ' + nombre + '('); if (i < 0) throw new Error('no encontré ' + nombre + ' en PPP2.gs');
  let k = src.indexOf('{', i), n = 0, j = k; for (; j < src.length; j++) { if (src[j] === '{') n++; else if (src[j] === '}') { n--; if (!n) break; } }
  return src.slice(i, j + 1);
}
const AYUDAS = ['low_', 'txt_', 'lista_', 'puede_', 'actor_', 'pausa_', 'arbolEncendido_'].map(funcion).join('\n') + '\nvar PPP2 = { TEXTO_MAX: 2000, TZ: "America/Hermosillo" };\n';

/* ── doble de Sheets ── */
const { Hoja, Rango, letra } = require('./doble-sheets.cjs');
function libroSintetico(opc) {
  opc = opc || {};
  const filas = [['ID', 'Factor']], pl = {};   // pl: plantilla (columna J = 10)
  const ids = [['', '0 · IDENTIDAD'], ['I-01', 'Proyecto'], ['I-02', 'Versión'], ['I-03', 'Escenario'], ['I-04', 'Estado'], ['I-05', 'Fecha'], ['I-06', 'Quién'], ['I-07', 'Qué cambia'], ['T-01', 'Superficie'], ['T-04', 'Tierra'], ['T-05', 'Tierra por m²'], ['PT-07', 'Ventas'], ['E-15', 'Eficiencia (nuevo)'], ['R-19', 'Ganancia real (nuevo)'], ['E-19', 'Áreas propias (celda con código)']];
  ids.forEach((r) => filas.push(r));
  const h = new Hoja('MAESTRO', filas, opc.cols || 14);
  h.put(1, 10, '=IF({c}3="","",{c}3)'); h.put(3, 10, 'PLANTILLA');
  h.put(12, 10, '={c}10/{c}9'); h.put(13, 10, '={c}11*2');   // T-05 y PT-07 con fórmula propia de la plantilla (renglones 11 y 12... ver abajo)
  return h;
}
/* mapa real de renglones del libro sintético: fila 1 encabezado, 2 sección, 3..8 I-01..I-06, 9 I-07, 10 T-01, 11 T-04, 12 T-05 (ƒ), 13 PT-07 (ƒ), 14 E-15, 15 R-19 */
function armaEntorno(opc) {
  opc = opc || {};
  const maestro = libroSintetico(opc);
  maestro.put(12, 10, '={c}11/{c}10'); maestro.put(13, 10, '={c}11*2');
  maestro.put(1, 10, '=IF({c}3="","",{c}3)');
  const cambios = new Hoja('CAMBIOS', [['Fecha', 'Quién', 'Qué se hizo', 'Columna o factor', 'Fuente', 'Pendiente']], 6);
  const defs = {}; ['ARBOL_TIPOS', 'ARBOL_NODOS', 'ARBOL_OPCIONES', 'ARBOL_REGLAS', 'ARBOL_FACTORES', 'ARBOL_COMPONENTES', 'ARBOL_FLUJOS', 'ARBOL_LISTAS', 'ARBOL_VERSIONES'].forEach((n) => { if (!opc.sinPestana || opc.sinPestana !== n) defs[n] = new Hoja(n, [['id', 'x'], ['1', '2']], 8); });
  if (opc.manual) { // una columna hecha a mano (K) que el árbol no debe pisar
    maestro.put(3, 11, 'Plan hecho a mano'); maestro.put(5, 11, 'BASE'); maestro.put(7, 11, 'Estado'); maestro.put(8, 11, 'Persona'); maestro.put(1, 11, '=IF(K3="","",K3)'); maestro.put(10, 11, 123);
  }
  const hojas = { MAESTRO: maestro, CAMBIOS: cambios }; Object.assign(hojas, defs);
  const cache = {}, tablaCfg = { maestro_id: 'M'.repeat(30), maestro_plantilla: 'J', arbol: 'sí' };
  const pon = (k, v) => { if (String(v).length > 100000) throw new Error('el valor no cabe en la caché'); cache[k] = v; };
  const bloqueo = { ocupado: !!opc.ocupado };
  const ctx = vm.createContext({
    console, JSON, Math, Number, String, Array, Object, Date, isFinite,
    SpreadsheetApp: { openById: (id) => { assert.strictEqual(id, 'M'.repeat(30)); return { getSheetByName: (n) => hojas[n] || null, getId: () => id }; } },
    CacheService: { getScriptCache: () => ({ get: (k) => (k in cache ? cache[k] : null), put: pon, putAll: (m) => { Object.keys(m).forEach((k) => pon(k, m[k])); }, getAll: (ks) => { const o = {}; ks.forEach((k) => { if (k in cache) o[k] = cache[k]; }); return o; }, remove: (k) => { delete cache[k]; } }) },
    Utilities: { formatDate: (d) => d.toISOString().slice(0, 10) },
    LockService: { getScriptLock: () => ({ tryLock: () => !bloqueo.ocupado, releaseLock: () => { bloqueo.liberado = true; } }) },
    config_: () => Object.assign({}, tablaCfg, opc.config || {}), hash_: (k) => 'h' + String(k).length + String(k).slice(0, 12), hoyISO_: () => '2026-11-22'
  });
  vm.runInContext(AYUDAS, ctx); vm.runInContext(fs.readFileSync(ARBOL_GS, 'utf8'), ctx);
  return { ctx, hojas, maestro, cambios, bloqueo, cache, tablaCfg };
}
const SES = { editor: { ok: true, nombre: 'Persona Editora', correo: 'editora@ejemplo.invalid', rol: 'editor' }, editor2: { ok: true, nombre: 'Otra Persona', correo: 'otra@ejemplo.invalid', rol: 'editor' }, admin: { ok: true, nombre: 'Persona Admin', correo: 'admin@ejemplo.invalid', rol: 'admin' }, lector: { ok: true, nombre: 'Persona Lectora', correo: 'lectora@ejemplo.invalid', rol: 'lector' } };
const col = (items) => items.map(([id, valor]) => ({ id, valor }));
const post = (E, s, b, rid) => E.ctx.arbol_post_(s, Object.assign({ tipo: 'arbol-guarda' }, b), rid);
const BASE = col([['T-01', 2000], ['T-04', 14000000], ['E-15', 0.7], ['R-19', 26460000], ['T-05', 999], ['PT-07', 1]]);

console.log('\nA · leer la definición');
prueba('devuelve las 9 pestañas ARBOL_* como matrices de texto, con huella; cualquiera con sesión puede leer', () => {
  const E = armaEntorno(); const r = E.ctx.arbol_get_(SES.lector, { recurso: 'arbol-definicion' });
  assert.strictEqual(r.ok, true); assert.strictEqual(Object.keys(r.tablas).length, 9); assert.deepStrictEqual(r.tablas.ARBOL_NODOS, [['id', 'x'], ['1', '2']]); assert(/^h-[0-9a-f]+$/.test(r.huella_hoja));
  assert.strictEqual(E.ctx.arbol_get_({ ok: false }, { recurso: 'arbol-definicion' }).error, 'permiso');
  assert.strictEqual(E.ctx.arbol_get_(SES.lector, { recurso: 'otro' }).error, 'recurso');
});
prueba('falta una pestaña → error claro (no devuelve una definición a medias); sin libro configurado → sin_libro; la lectura se guarda en caché', () => {
  assert.deepStrictEqual(JSON.parse(JSON.stringify(armaEntorno({ sinPestana: 'ARBOL_FLUJOS' }).ctx.arbol_get_(SES.lector, { recurso: 'arbol-definicion' }))), { ok: false, error: 'pestanas', faltan: ['ARBOL_FLUJOS'] });
  assert.strictEqual(armaEntorno({ config: { maestro_id: 'corto' } }).ctx.arbol_get_(SES.lector, { recurso: 'arbol-definicion' }).error, 'sin_libro');
  const E = armaEntorno(); E.ctx.arbol_get_(SES.lector, { recurso: 'arbol-definicion' }); assert(E.cache.arbol_def_n && E.cache.arbol_def_0, 'se guarda en trozos');
});
prueba('la lectura no escribe nada en el libro', () => { const E = armaEntorno(); const antes = JSON.stringify(E.maestro.g); E.ctx.arbol_get_(SES.editor, { recurso: 'arbol-definicion' }); assert.strictEqual(JSON.stringify(E.maestro.g), antes); });

console.log('\nB · guardar un plan como columna');
prueba('un editor guarda: columna nueva (la primera libre), valores en los renglones de captura, fórmulas de la plantilla intactas y propias de la columna', () => {
  const E = armaEntorno(); const r = post(E, SES.editor, { nombre: 'Plan de prueba', columna: BASE }, 'r1');
  assert.strictEqual(r.ok, true, JSON.stringify(r)); assert.strictEqual(r.columna, 'K'); assert.strictEqual(r.nueva, true); assert.strictEqual(r.estado, 'Borrador');
  const h = E.maestro; assert.strictEqual(h.celda(10, 11).v, 2000); assert.strictEqual(h.celda(11, 11).v, 14000000); assert.strictEqual(h.celda(14, 11).v, 0.7); assert.strictEqual(h.celda(15, 11).v, 26460000);
  assert.strictEqual(h.celda(12, 11).f, '=K11/K10', 'la fórmula es la de la plantilla, leyendo su propia columna'); assert.strictEqual(h.celda(13, 11).f, '=K11*2');
  assert.strictEqual(JSON.stringify(Array.from(r.ignorados).sort()), '["PT-07","T-05"]', 'valores que traía la petición para renglones con fórmula: se ignoran y se avisa');
  assert.strictEqual(h.celda(3, 11).v, 'Plan de prueba'); assert.strictEqual(h.celda(6, 11).v, 'Borrador'); assert(/Árbol PPP/.test(h.celda(8, 11).v)); assert.strictEqual(h.celda(1, 11).f, '=IF(K3="","",K3)');
  assert.strictEqual(h.celda(10, 10) && h.celda(10, 10).v, undefined, 'la plantilla no se toca');
});
prueba('no escribe ninguna otra columna: solo se agrega la nueva, lo demás queda idéntico', () => {
  const E = armaEntorno({ manual: true }); const antes = JSON.parse(JSON.stringify(E.maestro.g)); const r = post(E, SES.editor, { columna: BASE }, 'r2');
  assert.strictEqual(r.ok, true); assert.strictEqual(r.columna, 'L', 'K ya era de una persona');
  Object.keys(antes).forEach((k) => assert.deepStrictEqual(E.maestro.g[k], antes[k], 'cambió la celda ' + k));
  Object.keys(E.maestro.g).filter((k) => !(k in antes)).forEach((k) => assert.strictEqual(+k.split(',')[1], 12, 'celda nueva fuera de la columna L: ' + k));
});
prueba('bitácora en CAMBIOS (quién, qué, columna) y la respuesta dice cuántos valores escribió', () => {
  const E = armaEntorno(); const r = post(E, SES.editor, { columna: BASE }, 'r3'); const f = E.cambios.getRange(2, 1, 1, 6).getValues()[0];
  assert.strictEqual(f[0], '2026-11-22'); assert.strictEqual(f[1], 'Persona Editora'); assert(/Columna nueva del Árbol PPP/.test(f[2])); assert.strictEqual(f[3], 'K'); assert.strictEqual(r.escritos, 10);
});
prueba('permisos como PPP2.gs: un lector no guarda; el árbol solo guarda en Borrador: pedir «Vigente» se rechaza, también al admin', () => {
  const E = armaEntorno(); const n0 = JSON.stringify(E.maestro.g);
  assert.strictEqual(post(E, SES.lector, { columna: BASE }, 'p1').error, 'permiso'); assert.strictEqual(post(E, { ok: false }, { columna: BASE }, 'p1b').error, 'permiso');
  assert.strictEqual(post(E, SES.editor, { columna: BASE, estado: 'vigente' }, 'p2').error, 'estado'); assert.strictEqual(post(E, SES.admin, { columna: BASE, estado: 'Vigente' }, 'p3').error, 'estado');
  assert.strictEqual(JSON.stringify(E.maestro.g), n0, 'rechazado = no escribe nada'); assert.strictEqual(E.cambios.getLastRow(), 1);
  const a = post(E, SES.admin, { columna: BASE, estado: 'borrador' }, 'p4'); assert.strictEqual(a.ok, true); assert.strictEqual(a.estado, 'Borrador');
});
prueba('texto que empieza con = + - @ \' se escribe como texto literal, no como fórmula', () => {
  const E = armaEntorno(); const r = post(E, SES.editor, { nombre: '=HYPERLINK("x")', columna: col([['T-01', '=2+2'], ['T-04', "'si'"], ['E-15', '+1'], ['R-19', '-0.5']]) }, 'x1');
  assert.strictEqual(r.ok, true); const h = E.maestro;
  assert.strictEqual(h.celda(3, 11).v, '=HYPERLINK("x")'); assert(!h.celda(3, 11).f); assert.strictEqual(h.celda(10, 11).v, '=2+2'); assert(!h.celda(10, 11).f); assert.strictEqual(h.celda(11, 11).v, "'si'"); assert.strictEqual(h.celda(14, 11).v, '+1'); assert.strictEqual(h.celda(15, 11).v, '-0.5');
});
prueba('rechaza antes de escribir: id que no existe, id repetido, número infinito o NaN, tipo raro, lista vacía, demasiados renglones', () => {
  const E = armaEntorno(); const n0 = JSON.stringify(E.maestro.g);
  assert.deepStrictEqual(JSON.parse(JSON.stringify(post(E, SES.editor, { columna: col([['T-01', 1], ['ZZ-99', 2]]) }, 'v1'))), { ok: false, error: 'id_desconocido', id: 'ZZ-99' });
  assert.strictEqual(post(E, SES.editor, { columna: col([['T-01', 1], ['T-01', 2]]) }, 'v2').error, 'id_repetido');
  assert.strictEqual(post(E, SES.editor, { columna: col([['T-01', Infinity]]) }, 'v3').error, 'valor'); assert.strictEqual(post(E, SES.editor, { columna: col([['T-01', NaN]]) }, 'v4').error, 'valor'); assert.strictEqual(post(E, SES.editor, { columna: col([['T-01', { a: 1 }]]) }, 'v5').error, 'valor'); assert.strictEqual(post(E, SES.editor, { columna: col([['T-01', 1e20]]) }, 'v5b').error, 'valor');
  assert.strictEqual(post(E, SES.editor, { columna: [] }, 'v6').error, 'columna'); assert.strictEqual(post(E, SES.editor, {}, 'v7').error, 'columna');
  assert.strictEqual(post(E, SES.editor, { columna: Array.from({ length: 401 }, () => ({ id: 'T-01', valor: 1 })) }, 'v8').error, 'demasiados');
  assert.strictEqual(JSON.stringify(E.maestro.g), n0, 'ningún rechazo escribió nada'); assert.strictEqual(E.cambios.getLastRow(), 1, 'ni dejó bitácora');
});
prueba('bloqueo: si el candado está ocupado responde «ocupado» y no escribe; el candado se libera siempre', () => {
  const E = armaEntorno({ ocupado: true }); const n0 = JSON.stringify(E.maestro.g); assert.strictEqual(post(E, SES.editor, { columna: BASE }, 'b1').error, 'ocupado'); assert.strictEqual(JSON.stringify(E.maestro.g), n0);
  const F = armaEntorno(); post(F, SES.editor, { columna: BASE }, 'b2'); assert.strictEqual(F.bloqueo.liberado, true);
  const G = armaEntorno(); G.hojas.MAESTRO.getRange = () => { throw new Error('falla de Sheets'); }; try { post(G, SES.editor, { columna: BASE }, 'b3'); } catch (e) { } assert.strictEqual(G.bloqueo.liberado, true, 'se libera aun si algo truena');
});
prueba('idempotencia: el mismo request_id no escribe dos columnas', () => {
  const E = armaEntorno(); const a = post(E, SES.editor, { columna: BASE }, 'mismo'), b = post(E, SES.editor, { columna: BASE }, 'mismo'); assert.strictEqual(JSON.stringify(a), JSON.stringify(b)); assert.strictEqual(E.maestro.getLastColumn(), 11); assert.strictEqual(E.cambios.getLastRow(), 2);
  const c = post(E, SES.editor, { columna: BASE }, 'otro'); assert.strictEqual(c.columna, 'L');
});
prueba('nunca borra ni inserta: sin columna libre responde «sin_columnas» y deja el libro igual', () => {
  const E = armaEntorno({ cols: 11, manual: true }); const n0 = JSON.stringify(E.maestro.g); assert.strictEqual(post(E, SES.editor, { columna: BASE }, 's1').error, 'sin_columnas'); assert.strictEqual(JSON.stringify(E.maestro.g), n0); assert.strictEqual(E.maestro.getMaxColumns(), 11);
});
prueba('actualiza solo una columna propia del árbol en Borrador; una hecha a mano o vigente no se sobrescribe', () => {
  const E = armaEntorno({ manual: true }); const r = post(E, SES.editor, { columna: BASE }, 'u1'); assert.strictEqual(r.columna, 'L');
  const u = post(E, SES.editor, { columna: col([['T-01', 3000]]), columna_existente: 12, rev: r.rev }, 'u2'); assert.strictEqual(u.ok, true, JSON.stringify(u)); assert.strictEqual(u.nueva, false); assert.strictEqual(E.maestro.celda(10, 12).v, 3000); assert.strictEqual(E.maestro.celda(11, 12).v, 14000000, 'lo que no se manda se conserva');
  assert.strictEqual(post(E, SES.editor, { columna: col([['T-01', 1]]), columna_existente: 11 }, 'u3').error, 'columna_ajena'); assert.strictEqual(E.maestro.celda(10, 11).v, 123);
  assert.strictEqual(post(E, SES.editor, { columna: col([['T-01', 1]]), columna_existente: 10 }, 'u4').error, 'columna_invalida', 'la plantilla jamás'); assert.strictEqual(post(E, SES.editor, { columna: col([['T-01', 1]]), columna_existente: 99 }, 'u5').error, 'columna_invalida');
  assert.strictEqual(post(E, SES.editor, { columna: col([['T-01', 3001]]), columna_existente: 'L', rev: u.rev }, 'u5b').ok, true, 'la columna también se puede pedir por su letra');
  E.maestro.put(6, 12, 'Vigente'); assert.strictEqual(post(E, SES.editor, { columna: col([['T-01', 1]]), columna_existente: 12 }, 'u6').error, 'columna_ajena', 'una columna vigente no se toca');
});
prueba('un texto «=…» protegido en el primer guardado sigue siendo texto en el segundo (columna_existente), con lo demás intacto', () => {
  const E = armaEntorno(); const r = post(E, SES.editor, { columna: col([['T-01', '=2+2'], ['T-04', 14], ['E-15', '+1'], ['R-19', '@x']]) }, 'a11a'); assert.strictEqual(r.ok, true, JSON.stringify(r)); const h = E.maestro;
  [[10, '=2+2'], [14, '+1'], [15, '@x']].forEach(([f, v]) => { assert.strictEqual(h.celda(f, 11).v, v); assert(!h.celda(f, 11).f, 'primer guardado: texto, no fórmula (renglón ' + f + ')'); });
  const u = post(E, SES.editor, { columna: col([['T-04', 15]]), columna_existente: 11, rev: r.rev }, 'a11b'); assert.strictEqual(u.ok, true, JSON.stringify(u)); assert.strictEqual(u.nueva, false);
  [[10, '=2+2'], [14, '+1'], [15, '@x']].forEach(([f, v]) => { assert.strictEqual(h.celda(f, 11).v, v, 'el texto sigue igual (renglón ' + f + ')'); assert(!h.celda(f, 11).f, 'segundo guardado: sigue siendo texto y no fórmula (renglón ' + f + ')'); });
  assert.strictEqual(h.celda(11, 11).v, 15, 'lo que sí se mandó, cambia');
  const w = post(E, SES.editor, { columna: col([['T-04', 16]]), columna_existente: 11, rev: u.rev }, 'a11c'); assert.strictEqual(w.ok, true); assert(!h.celda(10, 11).f && h.celda(10, 11).v === '=2+2', 'y en un tercer guardado también');
});
prueba('un valor vacío deja el renglón vacío (nunca 0) y los booleanos van como sí/no', () => {
  const E = armaEntorno(); const r = post(E, SES.editor, { columna: col([['T-01', null], ['T-04', ''], ['E-15', true], ['R-19', false]]) }, 'e1'); assert.strictEqual(r.ok, true);
  assert(!E.maestro.celda(10, 11)); assert(!E.maestro.celda(11, 11)); assert.strictEqual(E.maestro.celda(14, 11).v, 'sí'); assert.strictEqual(E.maestro.celda(15, 11).v, 'no');
});
prueba('«si», «Si», «SÍ» y «sí» se guardan como «sí» (el libro compara con tilde); un texto largo que contiene «si» no se toca', () => {
  const E = armaEntorno(); const r = post(E, SES.editor, { columna: col([['T-01', 'si'], ['T-04', 'SÍ'], ['E-15', ' Sí '], ['R-19', 'sí, con calma']]) }, 'd5'); assert.strictEqual(r.ok, true);
  assert.strictEqual(E.maestro.celda(10, 11).v, 'sí'); assert.strictEqual(E.maestro.celda(11, 11).v, 'sí'); assert.strictEqual(E.maestro.celda(14, 11).v, 'sí'); assert.strictEqual(E.maestro.celda(15, 11).v, 'sí, con calma');
});
prueba('un texto con espacio delante de = + - @ \' se guarda como texto (sin el espacio, que el servidor ya recorta) y no como fórmula; la celda con código de áreas (E-19) admite 1,000 caracteres y se guarda intacta', () => {
  const E = armaEntorno(); const largo = Array.from({ length: 7 }, (_, i) => 'ap_0' + (i + 1) + ' = Área propia ' + (i + 1) + ' ; 25 m2 ; no se vende ; confirmado ; Plano de prueba ' + 'x'.repeat(50)).join(' | ');
  assert(largo.length > 800 && largo.length <= 1000, 'celda de prueba de ' + largo.length + ' caracteres');
  const r = post(E, SES.editor, { columna: col([['T-01', 2000], ['T-04', ' =SUMA(A1)'], ['E-15', '  +1'], ['R-19', '\t-5'], ['E-19', largo]]) }, 'o6'); assert.strictEqual(r.ok, true, JSON.stringify(r));
  assert.strictEqual(E.maestro.celda(11, 11).v, '=SUMA(A1)'); assert.strictEqual(E.maestro.celda(14, 11).v, '+1'); assert.strictEqual(E.maestro.celda(15, 11).v, '-5'); assert.strictEqual(E.maestro.celda(16, 11).v, largo);
  const f = E.maestro.celda(11, 11); assert(!f.f, 'no quedó como fórmula');
});
prueba('lee de vuelta lo escrito: si algo no coincide responde «verificacion» y dice en qué columna quedó', () => {
  const E = armaEntorno(); const h = E.maestro, orig = Rango.prototype.setValues;
  Rango.prototype.setValues = function (m) { const r = orig.call(this, m); if (this.c === 11 && this.r <= 10 && this.r + m.length > 10) this.h.g['10,11'] = { v: 5 }; return r; };
  let r; try { r = post(E, SES.editor, { columna: BASE }, 'ver1'); } finally { Rango.prototype.setValues = orig; }
  assert.strictEqual(r.ok, false); assert.strictEqual(r.error, 'verificacion'); assert.strictEqual(r.columna, 'K'); assert.strictEqual(JSON.stringify(r.no_coinciden), '["T-01"]'); assert(/Revisar: T-01/.test(E.cambios.getRange(2, 6).getValue()));
});
prueba('el código no trae ningún id de libro, liga ni llave', () => {
  const t = fs.readFileSync(ARBOL_GS, 'utf8'); assert(!/script\.google\.com|docs\.google\.com|spreadsheets\/d\//.test(t)); assert(!/[A-Za-z0-9_-]{33,}/.test(t));
});

console.log('\nC · interruptor, pausa, revisión y lectura de columnas');
prueba('apagado por omisión: sin  arbol = sí  en Config, leer y guardar responden «apagado» y nada se escribe', () => {
  [undefined, '', 'no', 'No'].forEach((v) => {
    const E = armaEntorno({ config: { arbol: v } }); const n0 = JSON.stringify(E.maestro.g);
    ['arbol-definicion', 'arbol-columnas', 'arbol-columna'].forEach((r) => assert.strictEqual(E.ctx.arbol_get_(SES.admin, { recurso: r, columna: 'K' }).error, 'apagado'));
    assert.strictEqual(post(E, SES.admin, { columna: BASE }, 'ap').error, 'apagado'); assert.strictEqual(JSON.stringify(E.maestro.g), n0); assert.strictEqual(E.cambios.getLastRow(), 1);
  });
  ['sí', 'si', 'SÍ'].forEach((v) => assert.strictEqual(armaEntorno({ config: { arbol: v } }).ctx.arbol_get_(SES.lector, { recurso: 'arbol-definicion' }).ok, true));
});
prueba('con Config!pausa = sí no se guarda (leer sí se puede)', () => {
  const E = armaEntorno({ config: { pausa: 'sí' } }); const n0 = JSON.stringify(E.maestro.g);
  assert.strictEqual(post(E, SES.editor, { columna: BASE }, 'pa').error, 'pausa'); assert.strictEqual(JSON.stringify(E.maestro.g), n0);
  assert.strictEqual(E.ctx.arbol_get_(SES.lector, { recurso: 'arbol-definicion' }).ok, true);
});
prueba('el recuerdo del request_id es de quien lo mandó: otra persona con el mismo id no recibe esa respuesta y escribe su propia columna', () => {
  const E = armaEntorno(); const a = post(E, SES.editor, { nombre: 'Plan A', columna: BASE }, 'igual'), b = post(E, SES.editor2, { nombre: 'Plan B', columna: BASE }, 'igual');
  assert.strictEqual(a.columna, 'K'); assert.strictEqual(b.columna, 'L'); assert.strictEqual(E.maestro.celda(3, 12).v, 'Plan B');
  assert.strictEqual(JSON.stringify(post(E, SES.editor, { nombre: 'Plan A', columna: BASE }, 'igual')), JSON.stringify(a), 'la misma persona sí recibe lo guardado');
  assert.strictEqual(E.maestro.getLastColumn(), 12);
});
prueba('actualizar pide la revisión de la columna: sin ella, o si alguien la cambió después de leerla, responde «revision» y no pisa nada', () => {
  const E = armaEntorno(); const r = post(E, SES.editor, { columna: BASE }, 'rv1'); assert(/^r-[0-9a-f]+$/.test(r.rev));
  const n0 = JSON.stringify(E.maestro.g);
  const sin = post(E, SES.editor, { columna: col([['T-01', 1]]), columna_existente: 'K' }, 'rv2'); assert.strictEqual(sin.error, 'revision'); assert.strictEqual(sin.rev, r.rev);
  assert.strictEqual(post(E, SES.editor, { columna: col([['T-01', 1]]), columna_existente: 'K', rev: 'r-0' }, 'rv3').error, 'revision'); assert.strictEqual(JSON.stringify(E.maestro.g), n0);
  E.maestro.put(11, 11, 15000000);   // otra persona cambia la tierra a mano
  const tarde = post(E, SES.editor, { columna: col([['T-01', 2500]]), columna_existente: 'K', rev: r.rev }, 'rv4'); assert.strictEqual(tarde.error, 'revision'); assert.notStrictEqual(tarde.rev, r.rev);
  assert.strictEqual(E.maestro.celda(10, 11).v, 2000, 'no se pisó'); assert.strictEqual(E.maestro.celda(11, 11).v, 15000000, 'el cambio de la otra persona sigue ahí');
  const ok = post(E, SES.editor, { columna: col([['T-01', 2500]]), columna_existente: 'K', rev: tarde.rev }, 'rv5'); assert.strictEqual(ok.ok, true); assert.strictEqual(E.maestro.celda(10, 11).v, 2500); assert.strictEqual(E.maestro.celda(11, 11).v, 15000000);
});
prueba('arbol-columnas lista solo las columnas que el árbol creó (no las hechas a mano), con nombre, versión, estado y quién', () => {
  const E = armaEntorno({ manual: true }); assert.deepStrictEqual(JSON.parse(JSON.stringify(E.ctx.arbol_get_(SES.lector, { recurso: 'arbol-columnas' }))), { ok: true, columnas: [] });
  post(E, SES.editor, { nombre: 'Plan uno', version: 'V2', columna: BASE }, 'c1'); post(E, SES.editor2, { nombre: 'Plan dos', columna: BASE }, 'c2');
  const l = JSON.parse(JSON.stringify(E.ctx.arbol_get_(SES.lector, { recurso: 'arbol-columnas' })));
  assert.deepStrictEqual(l.columnas.map((c) => [c.columna, c.nombre, c.version, c.estado, c.quien]), [['L', 'Plan uno', 'V2', 'Borrador', 'Persona Editora'], ['M', 'Plan dos', 'V1', 'Borrador', 'Otra Persona']]);
});
prueba('arbol-columna lee una columna del árbol (valores por id y su revisión); una hecha a mano, la plantilla o una letra rara se rechazan; leer no escribe', () => {
  const E = armaEntorno({ manual: true }); const g = post(E, SES.editor, { nombre: 'Plan uno', columna: BASE }, 'l1'); const n0 = JSON.stringify(E.maestro.g);
  const r = JSON.parse(JSON.stringify(E.ctx.arbol_get_(SES.lector, { recurso: 'arbol-columna', columna: 'l' })));
  assert.strictEqual(r.ok, true); assert.strictEqual(r.columna, 'L'); assert.strictEqual(r.estado, 'Borrador'); assert.strictEqual(r.rev, g.rev, 'la misma revisión que devolvió el guardado');
  const m = {}; r.valores.forEach((x) => { m[x.id] = x.valor; }); assert.strictEqual(m['T-01'], 2000); assert.strictEqual(m['T-04'], 14000000); assert.strictEqual(m['E-15'], 0.7); assert.strictEqual(m['I-01'], 'Plan uno');
  assert.strictEqual(E.ctx.arbol_get_(SES.lector, { recurso: 'arbol-columna', columna: 'K' }).error, 'columna_ajena', 'la columna hecha a mano no se lee por esta ruta');
  ['J', 'A', 'ZZ', '', '12', 'K;L', '=K'].forEach((c) => assert.strictEqual(E.ctx.arbol_get_(SES.lector, { recurso: 'arbol-columna', columna: c }).error, 'columna_invalida', 'columna «' + c + '»'));
  assert.strictEqual(E.ctx.arbol_get_({ ok: false }, { recurso: 'arbol-columna', columna: 'L' }).error, 'permiso'); assert.strictEqual(JSON.stringify(E.maestro.g), n0);
});
prueba('si la escritura se corta a medias responde «incompleto», dice la columna y deja renglón en CAMBIOS', () => {
  const E = armaEntorno(), orig = Rango.prototype.setValues;
  Rango.prototype.setValues = function (m) { if (this.c === 11) throw new Error('falla de Sheets'); return orig.call(this, m); };
  let r; try { r = post(E, SES.editor, { columna: BASE }, 'inc'); } finally { Rango.prototype.setValues = orig; }
  assert.deepStrictEqual(JSON.parse(JSON.stringify(r)), { ok: false, error: 'incompleto', columna: 'K' }); assert.strictEqual(E.cambios.getLastRow(), 2);
  const f = E.cambios.getRange(2, 1, 1, 6).getValues()[0]; assert(/INCOMPLETA/.test(f[2])); assert.strictEqual(f[3], 'K'); assert(/Revisar la columna K/.test(f[5])); assert.strictEqual(E.bloqueo.liberado, true);
});
prueba('una definición de más de 100 KB se guarda en trozos que sí caben y se lee igual; si falta un trozo se vuelve a leer la hoja', () => {
  const E = armaEntorno(); const fila = ['x'.repeat(400), 'ñ'.repeat(400)]; E.hojas.ARBOL_NODOS = new Hoja('ARBOL_NODOS', [['id', 'x']].concat(Array.from({ length: 300 }, () => fila)), 8);
  const a = JSON.parse(JSON.stringify(E.ctx.arbol_get_(SES.lector, { recurso: 'arbol-definicion' }))); assert(JSON.stringify(a).length > 200000);
  const n = Number(E.cache.arbol_def_n.split('|')[0]); assert(n >= 3 && n <= 12); for (let i = 0; i < n; i++) assert(E.cache['arbol_def_' + i].length <= 30000);
  E.hojas.ARBOL_NODOS = new Hoja('ARBOL_NODOS', [['id', 'x'], ['otra', 'cosa']], 8);
  assert.deepStrictEqual(JSON.parse(JSON.stringify(E.ctx.arbol_get_(SES.lector, { recurso: 'arbol-definicion' }))), a, 'sale de la caché');
  delete E.cache.arbol_def_1; assert.deepStrictEqual(E.ctx.arbol_get_(SES.lector, { recurso: 'arbol-definicion' }).tablas.ARBOL_NODOS, [['id', 'x'], ['otra', 'cosa']], 'sin un trozo, lee la hoja');
});
prueba('una columna que alguien empezó a mano SIN ponerle nombre no es libre: el árbol no la pisa y usa la siguiente completamente vacía', () => {
  const E = armaEntorno(); const h = E.maestro;
  h.put(1, 11, '=IF(K3="","",K3)'); h.put(10, 11, 777); h.put(14, 11, 'nota a mano');   // K: copia de la plantilla con números, todavía sin nombre (su fila 1 se ve vacía)
  h.put(13, 12, '=L11*2');                                                              // L: solo una fórmula
  const antes = JSON.parse(JSON.stringify(h.g)); const r = post(E, SES.editor, { columna: BASE }, 'lib1');
  assert.strictEqual(r.ok, true, JSON.stringify(r)); assert.strictEqual(r.columna, 'M', 'K y L tienen algo: no son libres');
  Object.keys(antes).forEach((k) => assert.deepStrictEqual(h.g[k], antes[k], 'cambió la celda ' + k)); assert.strictEqual(h.celda(10, 11).v, 777); assert.strictEqual(h.celda(14, 11).v, 'nota a mano');
  const F = armaEntorno({ cols: 12 }); F.maestro.put(10, 11, 777); F.maestro.put(13, 12, '=L11*2'); const n0 = JSON.stringify(F.maestro.g);
  assert.strictEqual(post(F, SES.editor, { columna: BASE }, 'lib2').error, 'sin_columnas', 'sin columna vacía no escribe'); assert.strictEqual(JSON.stringify(F.maestro.g), n0);
});
prueba('al actualizar solo se escriben las celdas que trae la petición (y la identidad): las fórmulas no se reescriben y lo demás no se toca', () => {
  const E = armaEntorno(); const r = post(E, SES.editor, { columna: BASE }, 'solo1'); const h = E.maestro, orig = Rango.prototype.setValues, tocadas = [];
  h.put(15, 11, '00123');                                                             // alguien deja un texto a mano en R-19; la revisión cambia
  const rev = E.ctx.arbol_get_(SES.lector, { recurso: 'arbol-columna', columna: 'K' }).rev; assert.notStrictEqual(rev, r.rev);
  Rango.prototype.setValues = function (m) { m.forEach((_, i) => tocadas.push(this.r + i + ',' + this.c)); return orig.call(this, m); };
  let u; try { u = post(E, SES.editor, { columna: col([['T-01', 2500]]), columna_existente: 'K', rev }, 'solo2'); } finally { Rango.prototype.setValues = orig; }
  assert.strictEqual(u.ok, true, JSON.stringify(u)); assert.strictEqual(h.celda(10, 11).v, 2500);
  assert.deepStrictEqual(tocadas.sort(), ['10,11', '3,11', '4,11', '5,11', '6,11', '7,11', '8,11'].sort(), 'solo T-01 y los seis renglones de identidad');
  assert.strictEqual(h.celda(15, 11).v, '00123', 'el texto a mano sigue igual'); assert.strictEqual(h.celda(12, 11).f, '=K11/K10'); assert.strictEqual(h.celda(11, 11).v, 14000000);
});
prueba('un libro sin los renglones de identidad (I-01, I-04, I-06), o con la plantilla que los trae con fórmula, no recibe columnas sin marca: «sin_identidad» y nada escrito', () => {
  [[3, 'I-01'], [6, 'I-04'], [8, 'I-06']].forEach(([renglon, id]) => {
    const E = armaEntorno(); delete E.maestro.g[renglon + ',1']; const n0 = JSON.stringify(E.maestro.g);
    assert.strictEqual(post(E, SES.editor, { columna: BASE }, 'si-' + id).error, 'sin_identidad', 'sin ' + id); assert.strictEqual(JSON.stringify(E.maestro.g), n0); assert.strictEqual(E.cambios.getLastRow(), 1);
  });
  const F = armaEntorno(); F.maestro.put(8, 10, '="x"'); const n1 = JSON.stringify(F.maestro.g);
  assert.strictEqual(post(F, SES.editor, { columna: BASE }, 'si-f').error, 'sin_identidad'); assert.strictEqual(JSON.stringify(F.maestro.g), n1);
});
prueba('la columna a actualizar se pide por letra o por número entero: 10.5, «10», «AAAA», -1, NaN, objetos y listas se rechazan sin escribir', () => {
  const E = armaEntorno(); const r = post(E, SES.editor, { columna: BASE }, 'num1'); const n0 = JSON.stringify(E.maestro.g);
  [10.5, 11.5, '10', '11', 'AAAA', -1, NaN, Infinity, {}, [11], true, 'K;L', '=K', 'J', 10, 99, 'ZZ'].forEach((c, i) => assert.strictEqual(post(E, SES.editor, { columna: col([['T-01', 1]]), columna_existente: c, rev: r.rev }, 'num-' + i).error, 'columna_invalida', 'columna ' + JSON.stringify(c)));
  assert.strictEqual(JSON.stringify(E.maestro.g), n0);
});
prueba('la bitácora nunca recibe una fórmula: un nombre de persona que empieza con = queda como texto', () => {
  const E = armaEntorno(); const r = post(E, { ok: true, nombre: '=HYPERLINK("x")', correo: 'rara@ejemplo.invalid', rol: 'editor' }, { columna: BASE }, 'bit1'); assert.strictEqual(r.ok, true, JSON.stringify(r));
  const c = E.cambios.celda(2, 2); assert.strictEqual(c.v, '=HYPERLINK("x")'); assert(!c.f, 'en CAMBIOS es texto, no fórmula'); assert(!E.maestro.celda(8, 11).f, 'y en I-06 también');
});
prueba('si algo truena por dentro, quien pregunta recibe solo «interno», sin el mensaje del error, y el candado se libera', () => {
  const E = armaEntorno(); E.ctx.SpreadsheetApp.openById = () => { throw new Error('no existe el libro con id secreto'); };
  assert.deepStrictEqual(JSON.parse(JSON.stringify(E.ctx.arbol_get_(SES.lector, { recurso: 'arbol-columnas' }))), { ok: false, error: 'interno' });
  assert.deepStrictEqual(JSON.parse(JSON.stringify(post(E, SES.editor, { columna: BASE }, 'int1'))), { ok: false, error: 'interno' }); assert.strictEqual(E.bloqueo.liberado, true);
});
prueba('PPP2.gs llama a las rutas del árbol solo después de validar la sesión, y el vivero dice si el árbol está encendido', () => {
  const g = funcion('doGet'), p = funcion('doPost'), v = funcion('vivero_get_');
  assert(g.indexOf('canje_(p.k)') > 0 && g.indexOf('arbol_get_(s, p)') > g.indexOf("if (!s.ok) return out_({ ok: false, error: s.error });"), 'doGet: el árbol va después del canje');
  assert(p.indexOf('canje_(b.k)') > 0 && p.indexOf('arbol_post_(s, b, rid)') > p.indexOf("if (!s.ok) return out_({ ok: false, error: s.error });"), 'doPost: el árbol va después del canje');
  assert(/arbol: arbolEncendido_\(config_\(\)\)/.test(v));
  ['arbol-definicion', 'arbol-columnas', 'arbol-columna'].forEach((r) => assert(g.indexOf("'" + r + "'") > 0)); assert(p.indexOf("'arbol-guarda'") > 0);
});

console.log('\n══════════════════════════════════════════\npruebas de ArbolPPP.gs: ' + R.ok + ' de ' + R.n + ' pasan' + (R.fallos.length ? ' · ' + R.fallos.length + ' FALLAN' : ' · TODO BIEN'));
R.fallos.forEach((f) => console.log(' - ' + f)); process.exit(R.fallos.length ? 1 : 0);
