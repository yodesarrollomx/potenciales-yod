'use strict';
/* Vigilante del grafo (scripts/grafo-estado.cjs) con una API de GitHub de mentira: sin red y sin escrituras. */
const test = require('node:test'), assert = require('node:assert/strict');
const { crear } = require('../scripts/grafo-estado.cjs');

const mapa = { armado: '2026-11-11T22:00:00-07:00', repos: {
  'yodesarrollomx/potenciales-yod': { nodos: ['repo:yodesarrollomx/potenciales-yod', 'SYS-POTENCIALES'], commit: 'aaaa111122', flujos: { '.github/workflows/verificar-ppp.yml': 'flujo-ppp' } },
  'yodesarrollomx/yod-portal': { nodos: ['repo:yodesarrollomx/yod-portal'], commit: 'bbbb222233', flujos: {} } } };

function api(rutas, pedidos = []) {
  return async (url, opc = {}) => {
    pedidos.push({ url, metodo: opc.method || 'GET', cuerpo: opc.body });
    if (!url.startsWith('https://api.github.com')) return { ok: true, status: rutas.pagina || 200, json: async () => ({}) };
    const ruta = url.slice('https://api.github.com'.length);
    for (const [patron, valor] of Object.entries(rutas)) if (ruta.startsWith(patron)) { if (valor === 404) return { ok: false, status: 404, json: async () => ({}) }; return { ok: true, status: 200, json: async () => valor }; }
    return { ok: true, status: 200, json: async () => (ruta.includes('/issues') || ruta.includes('/commits') ? [] : {}) };
  };
}

const R = '/repos/yodesarrollomx/potenciales-yod', FALLAS = R + '/actions/runs?branch=main&status=failure';
const corrida = (id, conclusion, extra = {}) => ({ id, workflow_id: 77, status: 'completed', conclusion, path: '.github/workflows/verificar-ppp.yml', name: 'Verificar interfaz PPP', run_started_at: '2026-11-12T10:00:00Z', html_url: 'https://github.com/x/y/actions/runs/' + id, ...extra });

test('un flujo que falló sale con su trabajo y su paso, ligado a su pieza', async () => {
  const pedidos = [], E = crear({ mapa, fetchImpl: api({
    [FALLAS]: { workflow_runs: [corrida(9, 'failure')] },
    [R + '/actions/workflows/77/runs']: { workflow_runs: [corrida(9, 'failure')] },
    [R + '/actions/runs/9/jobs']: { jobs: [{ name: 'PPP · interfaz', conclusion: 'failure', steps: [{ number: 4, name: 'Controles', conclusion: 'failure' }] }] } }, pedidos) });
  const e = (await E.leer()).filter(x => x.tipo === 'flujo');
  assert.equal(e.length, 1); assert.match(e[0].msg, /Verificar interfaz PPP.*PPP · interfaz.*paso 4 «Controles»/); assert.equal(e[0].nodos[0], 'flujo-ppp'); assert.equal(e[0].clave, 'flujo:yodesarrollomx/potenciales-yod:.github/workflows/verificar-ppp.yml');
  assert.ok(pedidos.some(p => p.url.includes(R + '/actions/workflows/77/runs?branch=main&status=completed&per_page=1')), 'confirma con la última corrida de ese flujo en la principal');
});

test('sólo cuenta el último intento de cada flujo', async () => {
  const E = crear({ mapa, fetchImpl: api({
    [FALLAS]: { workflow_runs: [corrida(1, 'failure')] },
    [R + '/actions/workflows/77/runs']: { workflow_runs: [corrida(2, 'success')] } }) });
  assert.equal((await E.leer()).filter(x => x.tipo === 'flujo').length, 0, 'falló antes, pero su última corrida ya pasó');
});

test('una falla no se pierde por vieja ni porque otros flujos corran muchas veces después', async () => {
  // Antes se miraban «las últimas 40 corridas» del repositorio: con el vigilante corriendo decenas de veces al día, una falla
  // de anteayer salía de esa ventana y se daba por resuelta sola. Ahora se pregunta por las fallas y por la última de su flujo.
  const pedidos = [], vieja = corrida(5, 'failure', { run_started_at: '2026-10-20T08:00:00Z' });
  const E = crear({ mapa, ahora: () => '2026-11-12T12:00:00.000Z', fetchImpl: api({ [FALLAS]: { workflow_runs: [vieja, corrida(4, 'failure', { run_started_at: '2026-10-19T08:00:00Z' })] }, [R + '/actions/workflows/77/runs']: { workflow_runs: [vieja] } }, pedidos) });
  const e = (await E.leer()).filter(x => x.tipo === 'flujo');
  assert.equal(e.length, 1, 'una por flujo, la última'); assert.equal(e[0].desde, '2026-10-20T08:00:00Z');
  const lista = pedidos.map(p => p.url).filter(u => u.includes(R + '/actions/runs?'));
  assert.ok(lista.length >= 1 && lista.every(u => /[?&]status=(failure|timed_out)(&|$)/.test(u) && /[?&]branch=main(&|$)/.test(u)), 'no hay ventana de corridas recientes: se pide por fallas');
  assert.ok(lista.every(u => u.includes('created=%3E%3D2026-09-28')), 'con tope de 45 días: un flujo que ya no existe no se queda en rojo para siempre');
});

test('lo que no se pudo leer no se da por resuelto', async () => {
  const yo = 'yodesarrollomx/potenciales-yod', otro = 'yodesarrollomx/yod-portal';
  const antes = [
    { clave: `flujo:${yo}:.github/workflows/verificar-ppp.yml`, tipo: 'flujo', msg: 'Falló el flujo', desde: '2026-11-10' },
    { clave: `chinche:${yo}#5`, tipo: 'chinche', msg: 'Chinche #5', desde: '2026-11-09' },
    { clave: `pagina:${yo}`, tipo: 'pagina', msg: 'La página respondió 503', desde: '2026-11-11' },
    { clave: `chinche:${otro}#8`, tipo: 'chinche', msg: 'Chinche #8', desde: '2026-11-08' }];
  // GitHub no contesta las corridas ni las chinches de potenciales-yod, y su página no responde; yod-portal sí se lee y ya no tiene chinches.
  const base = api({ [R + '/actions/runs?']: 404, [R + '/issues']: 404 });
  const E = crear({ mapa, ahora: () => '2026-11-12T12:00:00.000Z', fetchImpl: async (url, opc) => { if (url === 'https://yodesarrollomx.github.io/potenciales-yod/') throw new Error('sin red'); return base(url, opc); } });
  const { errores, sinDato } = await E.leerTodo();
  assert.deepEqual(errores, []); assert.deepEqual([...sinDato].sort(), [`chinche:${yo}`, `flujo:${yo}`, `pagina:${yo}`]);
  const r = E.conciliar(antes, errores, sinDato);
  assert.deepEqual(r.resueltos.map(x => x.clave), [`chinche:${otro}#8`], 'sólo se resuelve lo que sí se leyó');
  assert.deepEqual(r.estado.errores.map(x => x.clave).sort(), [`chinche:${yo}#5`, `flujo:${yo}:.github/workflows/verificar-ppp.yml`, `pagina:${yo}`]);
  assert.equal(r.estado.errores.find(x => x.tipo === 'pagina').desde, '2026-11-11', 'conserva desde cuándo');
  assert.deepEqual(r.estado.sin_dato, [`chinche:${yo}`, `flujo:${yo}`, `pagina:${yo}`]); assert.deepEqual(r.nuevos, []);
  assert.equal('sin_dato' in E.conciliar(antes, antes.map(x => ({ ...x }))).estado, false, 'si todo se leyó, no se anota nada de más');
});

test('si no se puede saber si un repositorio cambió, ni se avisa ni se da por resuelto', async () => {
  const cabeza = { [R + '/commits']: [{ sha: 'cccc333344ffffffffffffffffffffffffffffff', commit: { committer: { date: '2026-11-12T00:00:00Z' } }, html_url: 'c' }] };
  const base = api(cabeza), sinComparar = crear({ mapa, fetchImpl: async (url, opc) => url.includes('/compare/') ? { ok: false, status: 503, json: async () => ({}) } : base(url, opc) });
  const r = await sinComparar.leerTodo();
  assert.equal(r.errores.filter(x => x.tipo === 'cambio').length, 0); assert.ok(r.sinDato.includes('cambio:yodesarrollomx/potenciales-yod'));
});

test('una chinche se pinta en el repositorio que nombra su título, no sólo en el que está abierta', async () => {
  const E = crear({ mapa, fetchImpl: api({ '/repos/yodesarrollomx/potenciales-yod/issues': [
    { number: 11, title: '📌 yod-portal/os · el menú no abre', labels: [], created_at: '2026-11-10T00:00:00Z', html_url: 'u11' },
    { number: 12, title: '📌 YOD-PORTAL/tablero.html · se encima', labels: [], created_at: '2026-11-10T00:00:00Z', html_url: 'u12' },
    { number: 13, title: '📌 amalaya · board · no me gustó', labels: [], created_at: '2026-11-10T00:00:00Z', html_url: 'u13' },
    { number: 14, title: '📌 potenciales-yod/mixto.html · falta un dato', labels: [], created_at: '2026-11-10T00:00:00Z', html_url: 'u14' },
    { number: 15, title: '📌 El plan no guarda', labels: [], created_at: '2026-11-10T00:00:00Z', html_url: 'u15' }] }) });
  const e = Object.fromEntries((await E.leer()).filter(x => x.tipo === 'chinche').map(x => [x.clave.split('#')[1], x]));
  const portal = mapa.repos['yodesarrollomx/yod-portal'].nodos, ppp = mapa.repos['yodesarrollomx/potenciales-yod'].nodos;
  assert.deepEqual(e[11].nodos, portal); assert.match(e[11].msg, /^Chinche #11 en potenciales-yod \(sobre yod-portal\): /);
  assert.deepEqual(e[12].nodos, portal, 'sin importar mayúsculas');
  assert.deepEqual(e[13].nodos, ppp, 'un nombre que no es repositorio del grafo se queda donde está abierta'); assert.match(e[13].msg, /^Chinche #13 en potenciales-yod: /);
  assert.deepEqual(e[14].nodos, ppp); assert.doesNotMatch(e[14].msg, /sobre/);
  assert.deepEqual(e[15].nodos, ppp, 'sin la forma repositorio/vista se queda donde está abierta');
  assert.equal(e[11].clave, 'chinche:yodesarrollomx/potenciales-yod#11', 'la clave sigue siendo la del repositorio donde está abierta');
});

test('las chinches abiertas cuentan; las que abrió el propio grafo y los PR no', async () => {
  const E = crear({ mapa, fetchImpl: api({ '/repos/yodesarrollomx/yod-portal/issues': [
    { number: 5, title: '📌 El menú se encima', labels: [], created_at: '2026-11-10T00:00:00Z', html_url: 'u5' },
    { number: 6, title: 'Otra cosa', labels: [{ name: 'chinche' }], created_at: '2026-11-10T00:00:00Z', html_url: 'u6' },
    { number: 7, title: '📌 Grafo: Falló el flujo', labels: [{ name: 'chinche' }], html_url: 'u7' },
    { number: 8, title: '📌 con PR', labels: [], pull_request: {}, html_url: 'u8' }, { number: 9, title: 'Sin marca', labels: [], html_url: 'u9' }] }) });
  assert.deepEqual((await E.leer()).filter(x => x.tipo === 'chinche').map(x => x.clave), ['chinche:yodesarrollomx/yod-portal#5', 'chinche:yodesarrollomx/yod-portal#6']);
});

test('«cambió» sólo si cambió algo que el grafo no escribe él mismo', async () => {
  const cabeza = { '/repos/yodesarrollomx/potenciales-yod/commits': [{ sha: 'cccc333344ffffffffffffffffffffffffffffff', commit: { committer: { date: '2026-11-12T00:00:00Z' } }, html_url: 'c' }] };
  const propio = crear({ mapa, fetchImpl: api({ ...cabeza, '/repos/yodesarrollomx/potenciales-yod/compare/aaaa111122...cccc': { files: [{ filename: 'grafo/mapa.html' }, { filename: 'grafo-motor/datos/base.json' }] } }) });
  assert.equal((await propio.leer()).filter(x => x.tipo === 'cambio').length, 0);
  const ajeno = crear({ mapa, fetchImpl: api({ ...cabeza, '/repos/yodesarrollomx/potenciales-yod/compare/aaaa111122...cccc': { files: [{ filename: 'grafo/mapa.html' }, { filename: 'mixto.html' }] } }) });
  const e = (await ajeno.leer()).filter(x => x.tipo === 'cambio'); assert.equal(e.length, 1); assert.match(e[0].msg, /potenciales-yod cambió después de armar el grafo \(2026-11-11\)/);
  const desconocido = crear({ mapa, fetchImpl: api({ ...cabeza, '/repos/yodesarrollomx/potenciales-yod/compare/': 404 }) });
  assert.equal((await desconocido.leer()).filter(x => x.tipo === 'cambio').length, 1, 'si no se puede comparar, mejor avisar');
  const igual = crear({ mapa, fetchImpl: api({ '/repos/yodesarrollomx/potenciales-yod/commits': [{ sha: 'aaaa111122eeeeeeeeeeeeeeeeeeeeeeeeeeeeee', commit: { committer: { date: 'x' } } }] }) });
  assert.equal((await igual.leer()).filter(x => x.tipo === 'cambio').length, 0);
});

test('una página que responde con error sale; el 404 no (repositorio sin página)', async () => {
  assert.equal((await crear({ mapa, fetchImpl: api({ pagina: 503 }) }).leer()).filter(x => x.tipo === 'pagina').length, 2);
  assert.equal((await crear({ mapa, fetchImpl: api({ pagina: 404 }) }).leer()).filter(x => x.tipo === 'pagina').length, 0);
});

test('conciliar anota lo que aparece y lo que se resuelve, y conserva desde cuándo', () => {
  const E = crear({ mapa, fetchImpl: api({}), ahora: () => '2026-11-12T12:00:00.000Z' });
  const antes = [{ clave: 'a', tipo: 'flujo', msg: 'A', desde: '2026-11-01' }, { clave: 'b', tipo: 'chinche', msg: 'B', desde: '2026-11-02' }];
  const r = E.conciliar(antes, [{ clave: 'a', tipo: 'flujo', msg: 'A', desde: 'hoy' }, { clave: 'c', tipo: 'pagina', msg: 'C', desde: 'hoy' }]);
  assert.deepEqual(r.nuevos.map(x => x.clave), ['c']); assert.deepEqual(r.resueltos.map(x => x.clave), ['b']); assert.equal(r.igual, false);
  assert.equal(r.estado.errores.find(x => x.clave === 'a').desde, '2026-11-01'); assert.deepEqual(r.lineas.map(l => l.que), ['aparece', 'se resuelve']);
  assert.equal(E.conciliar(antes, antes.map(x => ({ ...x }))).igual, true);
});

test('abre chinche sólo por flujos y páginas, en este repositorio y sin tocar nada más', async () => {
  const pedidos = [], E = crear({ mapa, fetchImpl: api({}, pedidos) });
  await E.chinches([{ tipo: 'flujo', msg: 'Falló X', desde: 'd', url: 'u', nodos: ['n'] }, { tipo: 'chinche', msg: 'no' }, { tipo: 'cambio', msg: 'no' }, { tipo: 'pagina', msg: 'Página 503', desde: 'd', url: 'u', nodos: [] }]);
  const post = pedidos.filter(p => p.metodo === 'POST'); assert.equal(post.length, 2);
  for (const p of post) { assert.match(p.url, /\/repos\/yodesarrollomx\/potenciales-yod\/issues$/); const b = JSON.parse(p.cuerpo); assert.match(b.title, /^📌 Grafo: /); assert.deepEqual(b.labels, ['chinche']); }
  assert.ok(pedidos.every(p => !/script\.google\.com/.test(p.url)), 'nunca toca un /exec');
});

test('no abre otra chinche si la del mismo error sigue abierta', async () => {
  const pedidos = [], E = crear({ mapa, fetchImpl: api({ '/repos/yodesarrollomx/potenciales-yod/issues?state=open&labels=chinche': [{ number: 70, title: '📌 Grafo: Falló X' }] }, pedidos) });
  await E.chinches([{ tipo: 'flujo', msg: 'Falló X', desde: 'd', url: 'u', nodos: ['n'] }, { tipo: 'flujo', msg: 'Falló Y', desde: 'd', url: 'u', nodos: ['n'] }, { tipo: 'flujo', msg: 'Falló Y', desde: 'd', url: 'u', nodos: ['n'] }]);
  const post = pedidos.filter(p => p.metodo === 'POST');
  assert.deepEqual(post.map(p => JSON.parse(p.cuerpo).title), ['📌 Grafo: Falló Y'], 'la de X ya existe y la de Y se abre una sola vez');
  const nada = []; await crear({ mapa, fetchImpl: api({}, nada) }).chinches([{ tipo: 'chinche', msg: 'no' }, { tipo: 'cambio', msg: 'no' }]);
  assert.deepEqual(nada, [], 'sin errores de flujo o de página no se pregunta nada');
});

/* ── el aviso de borrador se pone al día con lo que de verdad hay en GitHub ── */
const { reconciliarBorrador, ligaAbrir } = require('../scripts/grafo-estado.cjs');
const REPO = 'yodesarrollomx/potenciales-yod', T = '2026-11-12T10:00:00.000Z', APROBADO = 'G-20261111-2217', NUEVO = 'G-20261112-0915';
const punt = (extra = {}) => ({ id: NUEVO, fecha: '12-nov 09:15', creado: 'x', pr: 70, liga: `https://github.com/${REPO}/pull/70`, rama: 'grafo-borrador', antes: APROBADO, piezas: 3190, ligas: 10650, titulo: 'T', resumen: 'R', recomendacion: 'aprobar', ia: null, audiencias: [], sin_campo: [], ...extra });
const deRama = { aprobado: NUEVO, versiones: [{ id: APROBADO }, { id: NUEVO, fecha: '12-nov 09:15', piezas: 3190, ligas: 10650, ia: { titulo: 'Entró un tablero', resumen: 'Se sumó un tablero.', recomendacion: 'aprobar' }, ia_informe: { gano: 'claude:x' }, cambios: { sin_campo: ['ventas/vertical: ventas'] } }] };
const rec = o => reconciliarBorrador({ aprobado: APROBADO, repo: REPO, ahora: T, ...o });

test('borrador: sin dato de GitHub no se toca nada', () => {
  for (const rama of [null, undefined]) { const r = rec({ puntero: punt(), rama }); assert.equal(r.cambio, false); assert.deepEqual(r.puntero, punt()); assert.equal(r.linea, null); }
  assert.deepEqual(rec({ puntero: {}, rama: null }), { puntero: {}, linea: null, cambio: false });
});

test('borrador: si la rama ya no existe, se quita el aviso y se anota si se aprobó o se descartó', () => {
  const aprobado = reconciliarBorrador({ puntero: punt(), aprobado: NUEVO, rama: false, repo: REPO, ahora: T });
  assert.deepEqual(aprobado.puntero, {}); assert.equal(aprobado.cambio, true); assert.deepEqual(aprobado.linea, { cuando: T, que: 'grafo aprobado', id: NUEVO, pr: 70, por: 'revisión de cada hora' });
  const descartado = rec({ puntero: punt(), rama: false });
  assert.deepEqual(descartado.puntero, {}); assert.equal(descartado.linea.que, 'borrador descartado');
  assert.deepEqual(rec({ puntero: {}, rama: false }), { puntero: {}, linea: null, cambio: false }, 'sin aviso y sin rama: nada que hacer');
});

test('borrador: si su grafo ya es el aprobado aunque la rama siga ahí, se da por aprobado', () => {
  const r = reconciliarBorrador({ puntero: punt(), aprobado: NUEVO, rama: true, pr: null, deRama, repo: REPO, ahora: T });
  assert.deepEqual(r.puntero, {}); assert.equal(r.linea.que, 'grafo aprobado');
});

test('borrador: si falta el aviso pero la rama existe, se rehace con lo que dice la rama y la liga para abrir el PR', () => {
  const r = rec({ puntero: {}, rama: true, pr: null, deRama });
  assert.equal(r.cambio, true); assert.equal(r.linea, null);
  assert.equal(r.puntero.id, NUEVO); assert.equal(r.puntero.pr, 0); assert.equal(r.puntero.liga, ligaAbrir(REPO, NUEVO)); assert.match(r.puntero.liga, /^https:\/\/github\.com\/yodesarrollomx\/potenciales-yod\/compare\/main\.\.\.grafo-borrador\?expand=1&title=/);
  assert.equal(r.puntero.antes, APROBADO); assert.equal(r.puntero.titulo, 'Entró un tablero'); assert.equal(r.puntero.ia, 'claude:x'); assert.deepEqual(r.puntero.sin_campo, ['ventas/vertical: ventas']); assert.equal(r.puntero.piezas, 3190);
  assert.equal(rec({ puntero: {}, rama: true, pr: null, deRama: null }).cambio, false, 'sin poder leer la rama no se inventa un aviso');
  const viejo = rec({ puntero: punt({ id: 'G-20261101-0800' }), rama: true, pr: null, deRama });
  assert.equal(viejo.puntero.id, NUEVO, 'un aviso de un borrador anterior se sustituye');
});

test('borrador: cuando alguien abre el PR a mano, el aviso pasa a ligarlo; si se cierra sin borrar la rama, vuelve la liga para abrirlo', () => {
  const sinPR = punt({ pr: 0, liga: ligaAbrir(REPO, NUEVO) });
  const abierto = rec({ puntero: sinPR, rama: true, pr: { number: 71, html_url: `https://github.com/${REPO}/pull/71`, mergeable_state: 'clean' }, deRama });
  assert.equal(abierto.cambio, true); assert.equal(abierto.puntero.pr, 71); assert.equal(abierto.puntero.liga, `https://github.com/${REPO}/pull/71`); assert.equal('atrasado' in abierto.puntero, false);
  const cerrado = rec({ puntero: abierto.puntero, rama: true, pr: null, deRama });
  assert.equal(cerrado.puntero.pr, 0); assert.equal(cerrado.puntero.liga, ligaAbrir(REPO, NUEVO));
  const sinSaber = rec({ puntero: abierto.puntero, rama: true, pr: undefined, deRama });
  assert.equal(sinSaber.cambio, false, 'si no se supo del PR, no se toca');
});

test('borrador: si quedó atrás de otros cambios lo dice, y deja de decirlo cuando se pone al día', () => {
  for (const estado of ['dirty', 'behind']) assert.equal(rec({ puntero: punt(), rama: true, pr: { number: 70, html_url: punt().liga, mergeable_state: estado }, deRama }).puntero.atrasado, true);
  const r = rec({ puntero: punt({ atrasado: true }), rama: true, pr: { number: 70, html_url: punt().liga, mergeable_state: 'clean' }, deRama });
  assert.equal(r.cambio, true); assert.equal('atrasado' in r.puntero, false);
});

test('borrador: un aviso que ya está al día no se reescribe', () => {
  const r = rec({ puntero: punt(), rama: true, pr: { number: 70, html_url: punt().liga, mergeable_state: 'blocked' }, deRama });
  assert.equal(r.cambio, false); assert.equal(r.linea, null); assert.deepEqual(r.puntero, punt());
  assert.deepEqual(rec({ puntero: { basura: 1 }, rama: false }), { puntero: {}, linea: null, cambio: true }, 'un aviso sin identificador válido se limpia');
});

test('borrador: lo que hay en GitHub se lee de la rama, de su PR y de su registro de versiones', async () => {
  const contenido = { content: Buffer.from(JSON.stringify(deRama)).toString('base64'), encoding: 'base64' };
  const hay = await crear({ mapa, fetchImpl: api({ [`/repos/${REPO}/branches/grafo-borrador`]: { name: 'grafo-borrador' }, [`/repos/${REPO}/pulls?state=open&head=yodesarrollomx:grafo-borrador`]: [{ number: 70 }],
    [`/repos/${REPO}/pulls/70`]: { number: 70, html_url: 'u70', mergeable_state: 'dirty' }, [`/repos/${REPO}/contents/grafo/versiones.json?ref=grafo-borrador`]: contenido }) }).borradorEnGitHub();
  assert.equal(hay.rama, true); assert.equal(hay.pr.mergeable_state, 'dirty'); assert.deepEqual(hay.deRama, deRama);
  const noHay = await crear({ mapa, fetchImpl: api({ [`/repos/${REPO}/branches/grafo-borrador`]: 404 }) }).borradorEnGitHub();
  assert.deepEqual(noHay, { rama: false, pr: undefined, deRama: null });
  const sinPR = await crear({ mapa, fetchImpl: api({ [`/repos/${REPO}/branches/grafo-borrador`]: {}, [`/repos/${REPO}/pulls?state=open`]: [], [`/repos/${REPO}/contents/`]: contenido }) }).borradorEnGitHub();
  assert.equal(sinPR.pr, null); assert.equal(sinPR.deRama.aprobado, NUEVO);
});
