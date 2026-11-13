'use strict';
// ppp-folio.js · el terreno y su etapa se leen del folio (Portero ?recurso=cartera). Red y DOM sintéticos.
const test = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const path = require('node:path');
const src = fs.readFileSync(path.join(__dirname, '../ppp-folio.js'), 'utf8');
const CARTERA = { ok: true, etapas: [], recorte: '*', proyectos: [
  { folio: 'PRJ-QUINTAS', nombre: 'Las Quintas', etapa_n: 2, etapa: 'Evaluado', admision: 'alta', plan: 'mixto:ptmquintas01' },
  { folio: 'PRJ-ALYSA', nombre: 'Casa Alysa', etapa_n: 5, etapa: 'En obra', admision: 'standby', plan: 'ppp2:p2alysa001' },
  { folio: 'PRJ-X<b>', nombre: 'Raro', etapa_n: 0, etapa: '', admision: '', plan: 'residencial:pt-raro-0001' }
] };
function mundo({ token = 'sy-sintetica-0000000000000', respuesta = CARTERA, falla = false } = {}) {
  const pedidos = [];
  const store = new Map(token ? [['pyod_clave_v1', token]] : []);
  const head = { hijos: [], appendChild(n) { this.hijos.push(n); } };
  const ctx = {
    console, setTimeout, clearTimeout, AbortController, Promise, Date, Math, String, Array, encodeURIComponent,
    localStorage: { getItem: k => store.get(k) || null },
    document: { head, createElement: () => ({ textContent: '' }) },
    fetch: (url, opciones) => { pedidos.push({ url, opciones }); return falla ? Promise.reject(new Error('sin red')) : Promise.resolve({ json: async () => respuesta }); }
  };
  ctx.window = ctx; ctx.window.YOD_PORTERO = { original: 'https://portero.invalid/exec' };
  vm.createContext(ctx); vm.runInContext(src, ctx);
  return { F: ctx.YodPPPFolio, pedidos, head, store };
}
function nodo() {
  const n = { attrs: {}, html: '', setAttribute(k, v) { this.attrs[k] = v; }, getAttribute(k) { return this.attrs[k]; },
    querySelector: () => null, insertAdjacentHTML(_, h) { this.html += h; } };
  return n;
}
test('pinta el folio y la etapa del terreno ligado a este plan', async () => {
  const { F, pedidos } = mundo(), n = nodo();
  const p = await F.caso('mixto', 'ptmquintas01', n);
  assert.equal(p.folio, 'PRJ-QUINTAS');
  assert.match(n.html, /PRJ-QUINTAS · 2 · Evaluado/);
  assert.equal(pedidos.length, 1);
  assert.match(pedidos[0].url, /recurso=cartera&k=sy-sintetica/);
  assert.equal(pedidos[0].opciones.credentials, 'omit');
});
test('una sola lectura por página, también con varios planes', async () => {
  const { F, pedidos } = mundo();
  await F.caso('mixto', 'ptmquintas01', nodo()); await F.caso('ppp2', 'p2alysa001', nodo()); await F.buscar('mixto', 'ptmquintas01');
  assert.equal(pedidos.length, 1);
});
test('PPP 2 y la pausa', async () => {
  const { F } = mundo(), n = nodo();
  await F.caso('ppp2', 'p2alysa001', n);
  assert.match(n.html, /PRJ-ALYSA · 5 · En obra · en pausa/);
});
test('sin terreno ligado, sin sesión o con otro motor no pinta nada', async () => {
  let w = mundo(), n = nodo();
  assert.equal(await w.F.caso('mixto', 'ptmotrocaso99', n), null); assert.equal(n.html, '');
  assert.equal(await w.F.caso('unifamiliar', 'ptmquintas01', n), null, 'el motor también cuenta');
  w = mundo({ token: '' }); n = nodo();
  assert.equal(await w.F.caso('mixto', 'ptmquintas01', n), null); assert.equal(w.pedidos.length, 0, 'sin sesión no pregunta');
});
test('claves inválidas no preguntan', async () => {
  const { F, pedidos } = mundo();
  assert.equal(await F.buscar('excel', 'ptmquintas01'), null);
  assert.equal(await F.buscar('mixto', 'a b'), null);
  assert.equal(await F.buscar('mixto', ''), null);
  assert.equal(pedidos.length, 0);
});
test('escapa lo que viene del Control Maestro', async () => {
  const { F } = mundo(), n = nodo();
  await F.caso('residencial', 'pt-raro-0001', n);
  assert.ok(!n.html.includes('<b>'));
  assert.match(n.html, /PRJ-X&lt;b&gt; · sin etapa/);
});
test('si el Portero falla no pinta y no insiste durante un minuto', async () => {
  const w = mundo({ falla: true }), n = nodo();
  assert.equal(await w.F.caso('mixto', 'ptmquintas01', n), null);
  assert.equal(await w.F.caso('mixto', 'ptmquintas01', n), null);
  assert.equal(w.pedidos.length, 1);
  assert.equal(n.html, '');
});
test('una respuesta rechazada (sesión vencida) no pinta', async () => {
  const w = mundo({ respuesta: { ok: false, error: 'clave' } }), n = nodo();
  assert.equal(await w.F.caso('mixto', 'ptmquintas01', n), null);
  assert.equal(n.html, '');
});
test('si mientras llega la respuesta la página ya pinta otro plan, no escribe', async () => {
  const { F } = mundo(), n = nodo();
  const viejo = F.caso('mixto', 'ptmquintas01', n);
  n.setAttribute('data-yod-folio', 'otra-pintura');
  assert.equal(await viejo, null);
  assert.equal(n.html, '');
});
