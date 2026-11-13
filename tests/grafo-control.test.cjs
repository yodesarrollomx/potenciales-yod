'use strict';
/* Controles del grafo en Accesos (grafo-control.js): qué dice con cada combinación de aprobado, borrador y errores. */
const test = require('node:test'), assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path');
const G = require('../grafo-control.js');
const REPO = 'https://github.com/yodesarrollomx/potenciales-yod', A = 'G-20261111-2217', B = 'G-20261112-0915';
const versiones = { aprobado: A, versiones: [{ id: 'G-20261101-0800', estado: 'anterior' }, { id: A, estado: 'aprobado', fecha: '11-nov 22:17', piezas: 3183 }] };
const borrador = (extra = {}) => ({ id: B, pr: 70, liga: REPO + '/pull/70', titulo: 'Entró un tablero', resumen: 'Se sumó un tablero y cambió el menú.', audiencias: ['Cliente'], sin_campo: [], ...extra });

test('sin borrador: sólo el aprobado y las tres audiencias', () => {
  const r = G.resumir({ versiones, borrador: {}, estado: { generado: '2026-11-12T10:17:00Z', errores: [{ tipo: 'flujo' }, { tipo: 'cambio' }, { tipo: 'cambio' }] } });
  assert.equal(r.aprobada.id, A); assert.equal(r.borrador, null); assert.equal(r.conError, 1); assert.equal(r.conCambio, 2); assert.equal(r.audiencias.length, 3);
});
test('borrador con PR abierto: se anuncia y liga a su PR', () => {
  const r = G.resumir({ versiones, borrador: borrador(), estado: null });
  assert.equal(r.borrador.id, B); assert.equal(r.borrador.conPR, true); assert.equal(r.borrador.liga, REPO + '/pull/70'); assert.equal(r.borrador.atrasado, false); assert.deepEqual(r.audiencias, ['Cliente']); assert.equal(r.conError, 0);
});
test('borrador sin PR (el repositorio no deja que un flujo lo abra): también se anuncia, con la liga para abrirlo', () => {
  const liga = REPO + '/compare/main...grafo-borrador?expand=1&title=x';
  const r = G.resumir({ versiones, borrador: borrador({ pr: 0, liga }), estado: null });
  assert.equal(r.borrador.id, B); assert.equal(r.borrador.conPR, false); assert.equal(r.borrador.liga, liga);
});
test('la liga del borrador sólo puede ser de este repositorio', () => {
  for (const mala of ['javascript:alert(1)', 'https://evil.example/pull/1', 'https://github.com/otro/repo/pull/1', '', null, 'https://github.com/yodesarrollomx/potenciales-yod-falso/pull/1'])
    assert.equal(G.resumir({ versiones, borrador: borrador({ liga: mala }), estado: null }).borrador.liga, REPO + '/pulls', String(mala));
});
test('un aviso que ya es el aprobado, o sin identificador válido, no cuenta', () => {
  assert.equal(G.resumir({ versiones, borrador: borrador({ id: A }), estado: null }).borrador, null, 'ya se fusionó');
  for (const id of ['', 'G-3', 'x', null]) assert.equal(G.resumir({ versiones, borrador: borrador({ id }), estado: null }).borrador, null, String(id));
});
test('sin datos no truena', () => {
  const r = G.resumir({ versiones: null, borrador: null, estado: null });
  assert.equal(r.aprobada, null); assert.equal(r.borrador, null);
});
test('el pedido va a este repositorio, con el título que espera el flujo y sin claves', () => {
  const u = new URL(G.ligaPedido('cambió el menú'));
  assert.equal(u.origin + u.pathname, REPO + '/issues/new');
  assert.ok(u.searchParams.get('title').startsWith('🕸️ Rehacer grafo')); assert.match(u.searchParams.get('body'), /^Motivo: cambió el menú$/m);
  assert.doesNotMatch(u.href, /key|token|secret|clave=/i);
  assert.doesNotMatch(new URL(G.ligaPedido('')).searchParams.get('body'), /Motivo:/);
});

test('el título del pedido trae la marca que dispara el flujo «Grafo · rehacer»', () => {
  const flujo = fs.readFileSync(path.join(__dirname, '..', '.github', 'workflows', 'grafo-rehacer.yml'), 'utf8');
  const marca = flujo.match(/contains\(github\.event\.issue\.title, '([^']+)'\)/)[1];
  assert.ok(new URL(G.ligaPedido('')).searchParams.get('title').includes(marca), marca);
  assert.match(flujo, /collaborators\/\$POR\/permission/, 'el flujo comprueba el permiso de quien pide');
});

/* ── la caja pintada: una página de mentira, sin navegador ── */
function pagina({ versiones: V = versiones, borrador: Bo = {}, estado = { generado: '2026-11-12T10:17:00Z', errores: [] }, registro = '' } = {}) {
  const oyentes = {}, abiertas = [], marco = { src: 'grafo/index.html', getAttribute: () => marco.src, setAttribute: (k, v) => { marco.src = v; } };
  const caja = { innerHTML: '', textContent: '', addEventListener: (t, f) => { oyentes[t] = f; }, removeEventListener: () => {},
    querySelector: s => s === '[data-gc="confirma"]' ? caja.confirma : s === '[data-gc="motivo"]' ? { value: ' porque cambió el menú ' } : null, confirma: { hidden: true, querySelector: () => null } };
  const etiqueta = { textContent: '' };
  const fetchImpl = async u => ({ ok: true, json: async () => String(u).includes('versiones.json') ? V : String(u).includes('borrador.json') ? Bo : estado, text: async () => registro });
  const ctl = G.montar({ caja, marco, etiqueta, fetchImpl, abrir: u => abiertas.push(u) });
  const clic = que => oyentes.click({ target: { closest: () => ({ getAttribute: () => que }) } });
  return { ctl, caja, marco, etiqueta, clic, abiertas };
}

test('con un borrador, pregunta si se aprueba ya o se deja en borrador, y dice qué pasa en cada caso', async () => {
  const p = pagina({ borrador: borrador() }); await p.ctl.leer(); const h = p.caja.innerHTML;
  assert.match(h, /¿Lo apruebas ya o lo dejas en borrador\?/); assert.match(h, /Aprobar ya ↗/); assert.match(h, /Dejar en borrador<\/button>/); assert.match(h, /Ver el borrador/);
  assert.match(h, /las presentaciones se arman solas con el grafo nuevo/); assert.match(h, new RegExp('siguen leyendo el aprobado ' + A + ' y sus ligas no cambian'));
  assert.match(h, new RegExp('href="' + REPO.replace(/\//g, '\\/') + '\\/pull\\/70"')); assert.match(h, /«Merge pull request»/); assert.doesNotMatch(h, /Create pull request/);
  // el PR abierto por el flujo con su credencial llega con sus pruebas en espera de aprobación: el aviso dice ese paso
  // antes de «Merge»; con la App del grafo no sale, y el aviso también lo dice (DEC-21)
  assert.match(h, /si GitHub muestra «Approve workflows to run», tócalo primero[^<]*con la App del grafo no sale[^<]*cuando queden en verde, toca «Merge pull request»/);
  assert.match(h, /Rehacer otra vez/); assert.match(h, /Entró un tablero/);
  p.ctl.detener();
});

test('«Dejar en borrador» guarda el aviso sin perder el recordatorio; tocarlo lo vuelve a abrir', async () => {
  const p = pagina({ borrador: borrador() }); await p.ctl.leer();
  p.clic('plegar'); assert.doesNotMatch(p.caja.innerHTML, /¿Lo apruebas ya/); assert.match(p.caja.innerHTML, new RegExp('Borrador <b>' + B + '</b> en revisión'));
  assert.equal(p.marco.src, 'grafo/index.html', 'en pantalla sigue el aprobado');
  p.clic('desplegar'); assert.match(p.caja.innerHTML, /¿Lo apruebas ya/);
  p.clic('ver'); assert.equal(p.marco.src, 'grafo/index.html?rama=grafo-borrador'); assert.match(p.caja.innerHTML, /Ver el aprobado/);
  p.clic('plegar'); assert.equal(p.marco.src, 'grafo/index.html', 'al dejarlo en borrador se vuelve a ver el aprobado');
  p.ctl.detener();
});

test('sin PR abierto explica los dos toques; si quedó atrás, pide rehacerlo antes de aprobar', async () => {
  const sinPR = pagina({ borrador: borrador({ pr: 0, liga: REPO + '/compare/main...grafo-borrador?expand=1' }) }); await sinPR.ctl.leer();
  assert.match(sinPR.caja.innerHTML, /toca «Create pull request» y luego «Merge pull request»/); sinPR.ctl.detener();
  const atras = pagina({ borrador: borrador({ atrasado: true }) }); await atras.ctl.leer();
  assert.match(atras.caja.innerHTML, /quedó atrás de otros cambios/); assert.match(atras.caja.innerHTML, /«Rehacer otra vez»/); atras.ctl.detener();
});

test('sin borrador ofrece rehacer, avisa que el motivo queda público y abre el pedido sólo al confirmar', async () => {
  const p = pagina({ estado: { generado: '2026-11-12T10:17:00Z', errores: [{ tipo: 'cambio' }, { tipo: 'flujo' }] } }); await p.ctl.leer(); const h = p.caja.innerHTML;
  assert.match(h, />Rehacer grafo<\/button>/); assert.doesNotMatch(h, /¿Lo apruebas ya/); assert.match(h, /queda público en GitHub/); assert.match(h, /gasta una consulta/);
  assert.match(h, /1 repositorio cambió desde que se armó/); assert.match(p.etiqueta.textContent, /1 con error · 1 con cambios sin reflejar/);
  assert.equal(p.abiertas.length, 0); p.clic('rehacer'); assert.equal(p.caja.confirma.hidden, false); assert.equal(p.abiertas.length, 0, 'pedir exige confirmar');
  p.clic('si'); assert.equal(p.abiertas.length, 1); assert.match(new URL(p.abiertas[0]).searchParams.get('body'), /^Motivo: porque cambió el menú$/m);
  assert.match(p.caja.innerHTML, /Pedido enviado\./); assert.match(p.caja.innerHTML, /issues\?q=Rehacer%20grafo%20in%3Atitle/, 'queda a la mano dónde ver la respuesta');
  p.ctl.detener();
});

test('mientras no haya una primera revisión no dice «sin errores»', async () => {
  const p = pagina({ estado: null }); await p.ctl.leer();
  assert.equal(p.etiqueta.textContent, '· aún sin revisar'); assert.match(p.caja.innerHTML, /Aún no hay movimientos/); assert.match(p.caja.innerHTML, />Rehacer grafo<\/button>/);
  p.ctl.detener();
  const limpio = pagina({ estado: { generado: '2026-11-12T10:17:00Z', errores: [] } }); await limpio.ctl.leer();
  assert.match(limpio.etiqueta.textContent, /^· sin errores · revisado /); limpio.ctl.detener();
});

test('lo que llega de la rama de datos se escribe escapado', async () => {
  const p = pagina({ borrador: borrador({ titulo: '<img src=x onerror=alert(1)>', resumen: '"><script>x</script>' }), registro: JSON.stringify({ cuando: '2026-11-12T10:00:00Z', que: '<b>x</b>', id: '<i>', por: '<u>' }) + '\n' });
  await p.ctl.leer(); const h = p.caja.innerHTML;
  assert.doesNotMatch(h, /<img|<script|<i>|<u>|<b>x<\/b>/); assert.match(h, /&lt;img src=x onerror=alert\(1\)&gt;/);
  p.ctl.detener();
});

test('el control no trae claves, no escribe y sólo habla con GitHub y con esta página', () => {
  const fuente = fs.readFileSync(path.join(__dirname, '..', 'grafo-control.js'), 'utf8');
  for (const prohibido of ['localStorage', 'sessionStorage', 'setItem', "method:", 'POST', 'Authorization', 'api.openai.com', 'api.anthropic.com', 'script.google.com']) assert.ok(!fuente.includes(prohibido), prohibido);
  assert.doesNotMatch(fuente, /sk-[A-Za-z0-9]{12,}|AKfycb[A-Za-z0-9_-]{20,}/);
  const dominios = [...fuente.matchAll(/https:\/\/([a-z0-9.-]+)\//g)].map(m => m[1]);
  assert.deepEqual([...new Set(dominios)].sort(), ['github.com', 'raw.githubusercontent.com', 'yodesarrollomx.github.io']);
});
