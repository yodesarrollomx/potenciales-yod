'use strict';
/* La caché del plan (server/ppp2/PPP2.gs, «caché del plan»): abrir un plan que nadie tocó no vuelve a leer su
   libro, y en cuanto el libro cambia —por el servidor, por el latido o por una persona en la hoja— se vuelve a
   leer. Lo que depende de quién abre o del momento nunca sale de la caché. Mundo de prueba: tests/ppp2-mundo.cjs. */
const test = require('node:test');
const assert = require('node:assert/strict');
const { mundo, PLAN, ADMIN, EDITOR, LECTOR, filaDe } = require('./ppp2-mundo.cjs');

const LIBRO = 'libro-ejemplo';
const abre = (w) => w.aperturas[LIBRO] || 0;
const plan = (w, k) => w.get({ recurso: 'ppp2-plan', plan: PLAN, k: k || LECTOR });
const sinVista = (r) => { const o = JSON.parse(JSON.stringify(r)); delete o.libro_url; delete o.puede; delete o.yo; return o; };

test('abrir dos veces un plan que nadie tocó no vuelve a leer su libro, y da lo mismo', () => {
  const w = mundo();
  const a = plan(w), n = abre(w);
  assert.equal(a.ok, true);
  assert.equal(n, 1, 'la primera vez sí se lee');
  const b = plan(w);
  assert.equal(abre(w), n, 'la segunda no abre el libro');
  assert.deepEqual(b, a);
});

test('si una persona cambia la hoja, el plan se vuelve a leer enseguida', () => {
  const w = mundo();
  plan(w);
  const datos = w.libro.getSheetByName('Datos'), f = filaDe(datos, 'din.capital');
  datos.v[f - 1][2] = 123.4;                        // como si alguien lo escribiera directo en el libro
  const r = plan(w);
  assert.equal(abre(w), 2);
  assert.equal(r.datos.find((d) => d.clave === 'din.capital').valor, 123.4);
});

test('una escritura del servidor deja de servir lo guardado aunque Drive tarde en enterarse', () => {
  const w = mundo({ driveTarda: true });
  plan(w, EDITOR);
  assert.equal(w.post({ k: EDITOR, tipo: 'ppp2-dato', plan: PLAN, clave: 'din.capital', valor: 97, rev: 1 }).ok, true);
  const r = plan(w, EDITOR);
  assert.equal(r.datos.find((d) => d.clave === 'din.capital').valor, 97, 'la bitácora mueve el sello del libro');
  assert.equal(r.rev, 2);
});

test('si la respuesta no alcanza a traer el plan, la escritura igual deja de servir lo guardado (Drive tarda)', () => {
  const w = mundo({ driveTarda: true });
  w.ctx.PPP2.CON_PLAN_MS = -1;                        // la escritura tardó: su respuesta no trae el plan
  plan(w, EDITOR);
  const r = w.post({ k: EDITOR, tipo: 'ppp2-dato', plan: PLAN, clave: 'din.capital', valor: 98, rev: 1 });
  assert.equal(r.ok, true);
  assert.equal(r.plan, undefined);
  assert.equal(plan(w, EDITOR).datos.find((d) => d.clave === 'din.capital').valor, 98, 'el sello de la bitácora cambió la llave');
});

test('lo que depende de quién abre no se guarda con el plan', () => {
  const w = mundo();
  const admin = plan(w, ADMIN);
  assert.match(admin.libro_url, /^https:\/\/docs\.google\.com\/spreadsheets\/d\/libro-ejemplo\/edit$/);
  assert.equal(admin.puede.aprobar, true);
  const lector = plan(w, LECTOR);
  assert.equal(abre(w), 1, 'el lector recibe lo ya leído');
  assert.equal(lector.libro_url, '', 'pero sin la liga al libro');
  assert.deepEqual(lector.puede, { editar: false, aprobar: false });
  assert.deepEqual(lector.yo, { nombre: 'Lector Prueba', rol: '' });
  assert.deepEqual(sinVista(lector), sinVista(admin));
  for (const [k, v] of w.cache) if (/^pl_/.test(k) && !/\./.test(k)) assert.match(v, /^\d+$/, 'el índice sólo dice cuántos trozos hay');
});

test('la ronda en curso, el latido y la clave de la API se ven aunque el plan venga de la caché', () => {
  const w = mundo();
  const a = plan(w);
  assert.equal(a.ciclo.en_ronda, false);
  assert.equal(a.ciclo.ia, 'sin_clave');
  w.propiedades.set('j_' + PLAN, JSON.stringify({ ks: 3, t: Date.now() }));
  w.propiedades.set('ANTHROPIC_API_KEY', 'sk-ant-prueba');
  w.propiedades.set('latido_t', String(Date.now()));
  const b = plan(w);
  assert.equal(abre(w), 1, 'nada de eso está en el libro');
  assert.equal(b.ciclo.en_ronda, true);
  assert.equal(b.ciclo.trabajo, 3);
  assert.equal(b.ciclo.ia, 'listo');
  assert.equal(b.ciclo.ia_busca, true);
  assert.equal(b.ciclo.latido, 'activo');
  assert.doesNotMatch(JSON.stringify(b), /sk-ant-prueba/, 'la clave nunca sale');
});

test('la respuesta de una escritura trae el plan ya leído, y abrirlo después ya no espera al libro', () => {
  const w = mundo();
  const r = w.post({ k: EDITOR, tipo: 'ppp2-dato', plan: PLAN, clave: 'din.capital', valor: 96, rev: 1, request_id: 'rq-plan' });
  assert.equal(r.ok, true, JSON.stringify(r));
  assert.equal(r.plan.ok, true);
  assert.equal(r.plan.plan_id, PLAN);
  assert.equal(r.plan.rev, r.rev);
  assert.equal(r.plan.datos.find((d) => d.clave === 'din.capital').valor, 96);
  assert.deepEqual(r.plan.puede, { editar: true, aprobar: false });
  const n = abre(w);
  assert.deepEqual(sinVista(plan(w, LECTOR)), sinVista(r.plan));
  assert.equal(abre(w), n, 'quedó en la caché');
  const recordado = JSON.parse(w.cache.get('r_' + w.ctx.hash_('rq-plan')));
  assert.equal(recordado.plan, undefined, 'lo que se recuerda del request_id va sin el plan');
  assert.equal(recordado.rev, r.rev);
});

test('un plan grande va en trozos y vuelve igual; si falta un trozo, se lee el libro', () => {
  const w = mundo();
  w.ctx.PPP2.TROZO = 3000;
  const a = plan(w);
  const trozos = [...w.cache.keys()].filter((k) => /^pl_.*\.\d+$/.test(k));
  assert.ok(trozos.length > 1, 'se guardó en varios trozos');
  const b = plan(w);
  assert.equal(abre(w), 1);
  assert.deepEqual(b, a);
  w.cache.delete(trozos[1]);
  const c = plan(w);
  assert.equal(abre(w), 2, 'sin un trozo, como si no hubiera nada');
  assert.deepEqual(c, a);
});

test('si lo leído no cabe, no se guarda y el plan se sirve igual', () => {
  const w = mundo();
  w.ctx.PPP2.TROZO = 500; w.ctx.PPP2.TROZOS_MAX = 2;
  assert.equal(plan(w).ok, true);
  assert.equal(plan(w).ok, true);
  assert.equal(abre(w), 2);
  assert.equal([...w.cache.keys()].filter((k) => /^pl_/.test(k)).length, 0);
});

test('si la caché o Drive fallan, el plan se lee como siempre', () => {
  for (const op of [{ cacheLlena: true }, { driveCaido: true }]) {
    const w = mundo(op);
    const a = plan(w), b = plan(w);
    assert.equal(a.ok, true, JSON.stringify(op));
    assert.deepEqual(b, a);
    assert.equal(abre(w), 2, 'sin caché, cada vez se abre el libro (' + Object.keys(op)[0] + ')');
  }
  // y una escritura no truena porque su respuesta no quepa en la caché del request_id
  const w = mundo({ cacheLlena: true });
  const r = w.post({ k: EDITOR, tipo: 'ppp2-dato', plan: PLAN, clave: 'din.capital', valor: 93, rev: 1, request_id: 'rq-llena' });
  assert.equal(r.ok, true, JSON.stringify(r));
});

test('el vivero usa lo que ya se leyó del libro', () => {
  const w = mundo();
  const p = plan(w);
  const v = w.get({ recurso: 'ppp2-vivero', k: LECTOR });
  assert.equal(abre(w), 1, 'la tarjeta sale de lo ya leído');
  assert.equal(v.planes[0].dueno_recibe, p.versiones[1].dueno_recibe);
});

test('el latido deja leído el plan, también cuando no le toca hacer nada', () => {
  const w = mundo();
  w.propiedades.set('e_' + PLAN, JSON.stringify({ hasta: Date.now() + 3600000, n: 0, de: '' }));   // este plan espera: el latido no trabaja en él
  assert.equal(w.ctx.latido(), 'nada');
  const n = abre(w);
  assert.equal(n, 1, 'lo leyó una vez');
  assert.equal(plan(w).ok, true);
  assert.equal(abre(w), n, 'abrirlo ya no lee el libro');
  w.ctx.latido();
  assert.equal(abre(w), n, 'si el libro no cambió, el latido tampoco lo vuelve a leer');
});

test('archivar a mano se nota al escribir enseguida y al leer en cuanto vence el registro guardado', () => {
  const w = mundo();
  assert.equal(plan(w).ok, true);
  const planes = w.vivero.getSheetByName('Planes');
  planes.v[1][3] = 'archivado';
  assert.equal(w.post({ k: EDITOR, tipo: 'ppp2-dato', plan: PLAN, clave: 'din.capital', valor: 90 }).error, 'plan', 'escribir lee el registro de la hoja');
  w.cache.delete('planes');                           // venció (PLANES_S)
  assert.equal(plan(w).error, 'plan');
});

test('un plan recién sembrado se abre enseguida', () => {
  const w = mundo();
  w.get({ recurso: 'ppp2-vivero', k: EDITOR });       // deja el registro en la caché
  const r = w.post({ k: EDITOR, tipo: 'ppp2-sembrar', nombre: 'Lote nuevo', ubicacion: 'Calle Falsa 123' });
  assert.equal(r.ok, true, JSON.stringify(r));
  assert.equal(r.plan, undefined);
  const p = w.get({ recurso: 'ppp2-plan', plan: r.plan_id, k: EDITOR });
  assert.equal(p.ok, true, JSON.stringify(p).slice(0, 200));
});
