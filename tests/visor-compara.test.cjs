'use strict';
/* El comparativo de opciones (visor-compara.js) con datos INVENTADOS: el orden y las marcas (la mejor,
   el rojo sólo con diferencia grande, empates, ausentes), lo que dice el encabezado, una liga con una
   sola opción, la impresión y que sólo pregunte por GET. Las opciones de verdad salen del servidor real
   (server/ppp2/Visor.gs) corriendo en tests/ppp2-mundo.cjs. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const C = require('../visor-compara.js');
const { mundo, PLAN } = require('./ppp2-mundo.cjs');

const RAIZ = path.join(__dirname, '..');
const LIGA = 'liga0000000000000000000000000001';
const OTRO = 'p2otroplan01';
const texto = (html) => html.replace(/<[^>]+>/g, ' ').replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/\s+/g, ' ');
const factor = (k) => C.FACTORES.find((f) => f.k === k);

/* Una opción inventada: sólo las claves que la prueba necesita. */
function opcion(nombre, v, extra) {
  const e = extra || {};
  return { nombre, plan: 'p', v: 1, d: { version: 1, v: v || {}, datos: e.datos || {}, flujo: { total: e.total || {} }, plan: e.plan || {}, leido: e.leido || '', cambio: e.cambio || '' } };
}
function fila(ops, k) { return C.compara(ops).find((r) => r.f.k === k); }

test('el pago en viviendas conserva el programa completo, sin contar sólo firmas con efectivo', () => {
  const d = { v: { pago_especie: true }, flujo: { total: { firmas: 7.5 } }, productos: [{ unidades: 7.5 }, { unidades: 2.5 }] };
  assert.equal(C.valor(factor('unidades'), d).x, 10);
  const o = { nombre: 'Acuerdo', plan: 'p', v: 1, d };
  assert.match(C.pinta([o, { ...o, nombre: 'Otro acuerdo', plan: 'q' }], {}).html, /unidades totales, incluidas las adjudicadas sin cobro/);
  d.productos[1].unidades = null;
  assert.equal(C.valor(factor('unidades'), d).hay, false);
  delete d.v.pago_especie;
  assert.equal(C.valor(factor('unidades'), d).x, 8, 'el contrato previo conserva sus firmas');
});

test('la tabla de factores: siete cuadros, sentido y umbral declarados, y la misma tabla escrita en docs/ppp2.md', () => {
  assert.deepEqual(C.GRUPOS.map((g) => g.titulo), ['Terreno', 'Producto', 'Tiempo', 'Costo y ganancia', 'Dinero', 'Reparto', 'Riesgo']);
  const docs = fs.readFileSync(path.join(RAIZ, 'docs/ppp2.md'), 'utf8');
  const sentido = { mas: 'más es mejor', menos: 'menos es mejor', dato: 'dato', orden: 'pasar es mejor' };
  for (const f of C.FACTORES) {
    assert.ok(C.GRUPOS.some((g) => g.id === f.g), f.k + ': grupo');
    assert.ok(sentido[f.sentido], f.k + ': sentido');
    assert.ok(['v', 'datos', 'flujo', 'plan'].includes(f.de[0]), f.k + ': de dónde sale');
    if (f.sentido === 'dato') assert.equal(f.rojo, null, f.k + ': un dato no pinta rojo');
    if (f.rojo) assert.equal(Object.keys(f.rojo).length, 1, f.k + ': un solo umbral');
    const renglon = docs.split('\n').find((l) => l.startsWith('| ' + f.nombre + ' |'));
    assert.ok(renglon, f.k + ': falta su renglón en docs/ppp2.md');
    assert.ok(renglon.includes(sentido[f.sentido]), f.k + ': el sentido de docs/ppp2.md no es el del código');
    const umbral = !f.rojo ? '—' : f.rojo.orden ? 'no pasa y otra sí' : f.rojo.rel ? Math.round(f.rojo.rel * 100) + ' %' : f.u === 'pct' ? Math.round(f.rojo.abs * 100) + ' puntos' : 'le falta más';
    assert.ok(renglon.includes(umbral), f.k + ': el umbral de docs/ppp2.md no es el del código (' + umbral + ')');
  }
  const n = C.FACTORES.filter(f => !f.especie).length;
  assert.ok(n >= 18 && n <= 28, 'ni pocos ni todos: ' + n);
});

test('la mejor lleva flecha verde; el rojo sólo cuando la diferencia pasa el umbral del factor', () => {
  const ops = [opcion('A', { ganancia: 100, margen: 0.2, mes_reparto: 40, max_ajeno: 200 }), opcion('B', { ganancia: 90, margen: 0.15, mes_reparto: 48, max_ajeno: 250 }), opcion('C', { ganancia: 74.9, margen: 0.149, mes_reparto: 51, max_ajeno: 251 })];
  const g = fila(ops, 'ganancia');
  assert.deepEqual([g.mejor, g.rojo], [[0], [2]], 'ganancia: C queda 25.1 % abajo; B, 10 %');
  const m = fila(ops, 'margen');
  assert.deepEqual([m.mejor, m.rojo], [[0], [2]], 'margen: 5 puntos justos no es rojo; 5.1 sí');
  const p = fila(ops, 'mes_reparto');
  assert.deepEqual([p.mejor, p.rojo], [[0], [2]], 'plazo: menos es mejor; 48 es 20 % más, 51 es 27.5 %');
  const a = fila(ops, 'max_ajeno');
  assert.deepEqual([a.mejor, a.rojo], [[0], [2]], 'dinero ajeno: 250 es 25 % justo (no), 251 sí');
  const justo = fila([opcion('A', { ganancia: 100 }), opcion('B', { ganancia: 75 })], 'ganancia');
  assert.deepEqual(justo.rojo, [], 'exactamente en el umbral no es rojo');
  const sinUmbral = fila([opcion('A', { costo_dinero: 10 }), opcion('B', { costo_dinero: 90 })], 'costo_dinero');
  assert.deepEqual([sinUmbral.mejor, sinUmbral.rojo], [[0], []], 'un factor sin umbral nunca pinta rojo, por grande que sea la diferencia');
  const pierde = fila([opcion('A', { ganancia: 50 }), opcion('B', { ganancia: -10 })], 'ganancia');
  assert.deepEqual([pierde.mejor, pierde.rojo], [[0], [1]], 'perder dinero cuando otra gana es rojo');
  const todasPierden = fila([opcion('A', { ganancia: -10 }), opcion('B', { ganancia: -11 }), opcion('C', { ganancia: -20 })], 'ganancia');
  assert.deepEqual([todasPierden.mejor, todasPierden.rojo], [[0], [2]], 'con pérdidas, la mejor es la que menos pierde');
  const desdeCero = fila([opcion('A', { capital: 0 }), opcion('B', { capital: 60 })], 'capital');
  assert.deepEqual(desdeCero.mejor, [0]);
  assert.equal(C.muyAbajo(factor('mes_reparto'), 5, 0), false, 'con la mejor en cero no hay porcentaje: no hay rojo relativo');
  const falta = fila([opcion('A', { respaldo: 0 }), opcion('B', { respaldo: 3.2 }), opcion('C', { respaldo: 0.04 })], 'respaldo');
  assert.deepEqual([falta.mejor, falta.rojo], [[0, 2], [1]], 'faltar $0.04 se enseña $0.0: empata con la mejor; faltar $3.2 es rojo');
});

test('empates: todas las que empatan arriba llevan flecha; si todas son iguales, ninguna; se compara lo que se ve', () => {
  const dos = fila([opcion('A', { ganancia: 58.94 }), opcion('B', { ganancia: 58.91 }), opcion('C', { ganancia: 40 })], 'ganancia');
  assert.deepEqual(dos.mejor, [0, 1], '$58.9 y $58.9 empatan');
  assert.deepEqual(dos.rojo, [2]);
  assert.equal(dos.vals[0].texto, '$58.9');
  const iguales = fila([opcion('A', { ganancia: 10 }), opcion('B', { ganancia: 10 })], 'ganancia');
  assert.deepEqual([iguales.mejor, iguales.rojo, iguales.compara], [[], [], true], 'nada que marcar, pero sí es comparable');
  const r = C.resumen([opcion('A', {}), opcion('B', {})], C.compara([opcion('A', { ganancia: 10 }), opcion('B', { ganancia: 10 })]));
  assert.deepEqual(r.cuenta.map((x) => x.gana.length), [0, 0]);
});

test('lo que no llega es «no aplica»: sin marca, sin barra y sin contar como la peor', () => {
  const ops = [opcion('A', { ganancia: 20, rv_cobertura: 'sin banco', margen: null }), opcion('B', { ganancia: '', rv_cobertura: 2.1 }), opcion('C', { ganancia: 10, rv_cobertura: 1.4 })];
  const g = fila(ops, 'ganancia');
  assert.equal(g.vals[1].texto, 'no aplica');
  assert.deepEqual([g.mejor, g.rojo], [[0], [2]], 'el ausente ni gana ni pierde');
  const c = fila(ops, 'rv_cobertura');
  assert.equal(c.vals[0].texto, 'no aplica', 'un texto donde va número no es número');
  assert.deepEqual(c.mejor, [1]);
  const m = fila(ops, 'margen');
  assert.deepEqual([m.mejor, m.compara], [[], false], 'sin dos cifras no se compara');
  const h = C.pinta(ops, {}).html;
  assert.match(texto(h), /no aplica/);
  const celdas = [...h.matchAll(/<td class="vc-c vc-na"[^>]*>([\s\S]*?)<\/td>/g)].map((x) => x[1]);
  assert.ok(celdas.length >= 3);
  for (const x of celdas) { assert.doesNotMatch(x, /vc-fl|vc-barra/, 'una celda «no aplica» no lleva flecha ni barra'); }
});

test('los datos del proyecto (terreno, ventas, costo) se enseñan con su barra pero sin mejor ni peor', () => {
  const ops = [opcion('Grande', { ventas: 800, tierra: 40 }, { datos: { 'terreno.m2': { valor: 6400 } } }), opcion('Chico', { ventas: 200, tierra: 10 }, { datos: { 'terreno.m2': { valor: 1900 } } })];
  for (const k of ['terreno', 'ventas', 'tierra']) {
    const r = fila(ops, k);
    assert.deepEqual([r.mejor, r.rojo, r.compara], [[], [], false], k);
  }
  const h = C.pinta(ops, {}).html;
  assert.match(h, /6,400 m²/);
  assert.match(h, /vc-b-dato/);
});

test('revisión para fondos: pasar es mejor; no pasar cuando otra pasa es rojo; todas igual, sin marca', () => {
  const r = fila([opcion('A', { rv_resultado: 'Pasa (aportación justa)' }), opcion('B', { rv_resultado: 'No pasa: 2 de 9 pruebas' }), opcion('C', { rv_resultado: 'Pasa' })], 'rv_resultado');
  assert.deepEqual([r.mejor, r.rojo], [[0, 2], [1]]);
  assert.deepEqual(r.vals.map((v) => v.texto), ['Pasa · aportación justa', 'No pasa · 2 de 9', 'Pasa']);
  const nadie = fila([opcion('A', { rv_resultado: 'No pasa: 1 de 9 pruebas' }), opcion('B', { rv_resultado: 'No pasa: 3 de 9 pruebas' })], 'rv_resultado');
  assert.deepEqual([nadie.mejor, nadie.rojo], [[], []], 'contar pruebas sería otra cuenta: si ninguna pasa, no se marca');
  const raro = fila([opcion('A', { rv_resultado: 'sin calcular' }), opcion('B', { rv_resultado: 'Pasa' })], 'rv_resultado');
  assert.deepEqual([raro.vals[0].texto, raro.mejor], ['sin calcular', []], 'un texto sin orden se enseña tal cual y no se marca');
});

test('el encabezado dice cuál es la mejor en más factores y en cuáles, sin adjetivos', () => {
  const ops = [
    opcion('Terreno grande', { ganancia: 100, margen: 0.2, dueno_recibe: 60, mes_reparto: 48 }),
    opcion('Terreno mediano', { ganancia: 95, margen: 0.19, dueno_recibe: 55, mes_reparto: 40 }),
    opcion('Terreno chico', { ganancia: 50, margen: 0.12, dueno_recibe: 30, mes_reparto: 44 })
  ];
  const p = C.pinta(ops, { liga: LIGA }), t = texto(p.html);
  assert.equal(p.resumen.comparables, 4);
  assert.match(t, /«Terreno grande» es la mejor en 3 de 4 factores comparables : ganancia, ganancia sobre ventas y lo que recibe el dueño\./);
  assert.match(t, /«Terreno mediano», en 1: plazo\./);
  assert.match(t, /«Terreno chico» no es la mejor en ningún factor\./);
  assert.match(t, /Muy por debajo de la mejor: «Terreno chico» en ganancia, ganancia sobre ventas y lo que recibe el dueño\./);
  assert.doesNotMatch(t, /excelente|incre[ií]ble|ideal|recomendad|atractiv|gran oportunidad|la mejor opción para/i);
  const empate = C.pinta([opcion('A', { ganancia: 10, mes_reparto: 40 }), opcion('B', { ganancia: 9, mes_reparto: 30 })], {}).html;
  assert.match(texto(empate), /Empatan «A» y «B» : cada una es la mejor en 1 de 2 factores comparables\./);
  const sinRojo = C.pinta([opcion('A', { ganancia: 10 }), opcion('B', { ganancia: 9 })], {}).html;
  assert.match(texto(sinRojo), /Ninguna opción queda muy por debajo/);
  assert.match(p.html, /class="vc-op-g"><svg[^>]*aria-label="mejor"[\s\S]*?mejor en 3/, 'cada columna dice en cuántos es la mejor');
});

test('las flechas llevan texto alternativo y la página no deja pasar marcado del libro', () => {
  const ops = [opcion('<img src=x onerror=alert(1)>', { ganancia: 10, rv_resultado: '<i>raro</i>' }, { plan: { nombre: '<script>x</script>' } }), opcion('"><b>B', { ganancia: 5 })];
  const h = C.pinta(ops, { liga: LIGA, marcas: [{ nombre: '<u>m</u>', img: 'javascript:alert(1)' }, { nombre: 'Marca', img: 'data:image/png;base64,AAAA' }] }).html;
  assert.doesNotMatch(h, /<img src=x|<script>|<i>raro|<u>m<\/u>|javascript:alert|"><b>/);
  assert.match(h, /<img src="data:image\/png;base64,AAAA" alt="Marca">/);
  assert.match(h, /role="img" aria-label="mejor"><title>mejor<\/title>/);
  assert.match(h, /role="img" aria-label="muy por debajo"><title>muy por debajo<\/title>/);
  assert.match(h, /<th scope="row" class="vc-fac"/);
  assert.match(h, /<th scope="col" class="vc-op"/);
  assert.doesNotMatch(h, /NaN|undefined|Infinity|\[object/);
});

test('una liga con una sola opción: la página lo dice y no compara', () => {
  const p = C.pinta([opcion('V2 · Con banco', { ganancia: 10 })], { liga: LIGA });
  assert.match(texto(p.html), /Esta liga trae una sola opción \(«V2 · Con banco»\) : no hay otra con qué compararla\./);
  assert.doesNotMatch(p.html, /vc-tabla|vcPdf/);
  assert.match(p.html, new RegExp('href="visor\\.html#l=' + LIGA + '"'), 'lleva de vuelta al visor');
  assert.equal(p.filas.length, 0);
});

/* ── con el servidor real ── */
const renglon = (cambios) => Object.values(Object.assign({ liga: LIGA, plan_id: PLAN, para: 'Grupo de prueba', estado: 'activa', vence: '', versiones: '', etiquetas: '', creada: '2026-01-01', nota: '' }, cambios || {}));
function conLiga(cambios) {
  const w = mundo({ ligas: [renglon(cambios)], aperturas: true, config: [['visor_marcas', 'Marca Uno|Marca Dos']] });
  w.vivero.getSheetByName('Planes').appendRow([OTRO, 'Otro Ejemplo', 'libro-plantilla', 'activo', '2026-01-15', 'Pruebas', '', 'ppp2-libro-v1', '']);
  w.cache.delete('planes');
  return w;
}
/* Como el fetch de la página: arma la misma consulta GET (`pideCon`) y la contesta el doGet real. */
function pideDe(w, pedidos) {
  return (q) => {
    const p = { recurso: 'ppp2-visor', liga: LIGA };
    if (q.plan) p.plan = q.plan;
    if (q.v) p.v = String(q.v);
    if (q.abre) { p.abre = '1'; p.eq = 'otro · comparar'; }
    pedidos.push(p);
    return Promise.resolve(w.get(p));
  };
}

test('junta todas las opciones de la liga: cada plan y, si la liga lo deja, cada versión; una sola apertura', async () => {
  const w = conLiga({ plan_id: PLAN + ',' + OTRO, etiquetas: 'Terreno grande|Terreno chico', versiones: 'todas' }), pedidos = [], avance = [];
  const r = await C.reune(pideDe(w, pedidos), (n, de) => avance.push(n + '/' + de));
  assert.equal(r.ok, true);
  assert.equal(r.fallas, 0);
  assert.deepEqual(r.opciones.map((o) => o.nombre), ['Terreno grande · V1', 'Terreno grande · V2', 'Terreno grande · V3', 'Terreno chico · V1', 'Terreno chico · V2', 'Terreno chico · V3']);
  assert.deepEqual(r.opciones.map((o) => [o.plan, o.v]), [[PLAN, 1], [PLAN, 2], [PLAN, 3], [OTRO, 1], [OTRO, 2], [OTRO, 3]]);
  assert.equal(pedidos.length, 6, 'una pregunta por opción');
  assert.equal(pedidos.filter((p) => p.abre).length, 1, 'sólo la primera abre (marcas y una apertura)');
  assert.deepEqual(r.marcas.map((m) => m.nombre), ['Marca Uno', 'Marca Dos']);
  assert.equal(w.vivero.getSheetByName('Aperturas').getLastRow(), 2, 'un renglón en Aperturas');
  assert.match(String(w.vivero.getSheetByName('Aperturas').v[1][4]), /comparar/);
  assert.equal(avance[avance.length - 1], '6/6');
  const p = C.pinta(r.opciones, { liga: LIGA, marcas: r.marcas });
  assert.doesNotMatch(p.html, /NaN|undefined|Infinity|\[object/);
  assert.equal((p.html.match(/<th scope="col" class="vc-op"/g) || []).length, 6);
  const g = p.filas.find((x) => x.f.k === 'ganancia');
  for (let i = 0; i < 6; i++) assert.equal(g.vals[i].x, Math.round(r.opciones[i].d.v.ganancia * 10) / 10, 'cada cifra es la del libro, redondeada como se enseña');
});

test('sin «todas» en la liga, una opción por plan (la versión que cada libro muestra); con un solo plan y una versión, una opción', async () => {
  const w = conLiga({ plan_id: PLAN + ',' + OTRO, etiquetas: 'Terreno grande|Terreno chico' }), pedidos = [];
  const r = await C.reune(pideDe(w, pedidos));
  assert.deepEqual(r.opciones.map((o) => o.nombre), ['Terreno grande', 'Terreno chico']);
  assert.equal(pedidos.length, 2);
  assert.ok(r.opciones.every((o) => !o.mostrada), '«la que se muestra» no dice nada si de cada plan hay una sola');
  const una = await C.reune(pideDe(conLiga(), []));
  assert.equal(una.opciones.length, 1);
  assert.match(texto(C.pinta(una.opciones, { liga: LIGA }).html), /una sola opción/);
  const versiones = await C.reune(pideDe(conLiga({ versiones: '1,2' }), []));
  assert.deepEqual(versiones.opciones.map((o) => o.nombre), ['V1 · Base', 'V2 · Con banco']);
});

test('liga apagada o sin servidor: no inventa nada; si falla una opción, enseña las demás y lo dice', async () => {
  const apagada = await C.reune(pideDe(conLiga({ estado: 'apagada' }), []));
  assert.deepEqual(apagada, { ok: false, error: 'liga' });
  const w = conLiga({ versiones: 'todas' }), base = pideDe(w, []);
  const r = await C.reune((q) => (q.v === 3 ? Promise.reject(new Error('sin red')) : base(q)));
  assert.equal(r.ok, true);
  assert.equal(r.fallas, 1);
  assert.deepEqual(r.opciones.map((o) => o.v), [1, 2]);
  assert.match(texto(C.pinta(r.opciones, { fallas: r.fallas }).html), /No pude leer 1 opción de la liga/);
});

test('sólo GET, sin Portero ni marco, mismo servidor que PPP 2, y una hoja de impresión carta horizontal', () => {
  const js = fs.readFileSync(path.join(RAIZ, 'visor-compara.js'), 'utf8');
  assert.doesNotMatch(js, /POST|sendBeacon|XMLHttpRequest|localStorage|sessionStorage|pyod_clave/, 'el comparativo nunca escribe ni guarda nada');
  assert.match(js, /method: 'GET'/);
  const ep = /var ENDPOINT = window\.PPP2_ENDPOINT \|\| '([^']+)'/.exec(fs.readFileSync(path.join(RAIZ, 'ppp2.js'), 'utf8'))[1];
  assert.equal(C.ENDPOINT, ep);
  const html = fs.readFileSync(path.join(RAIZ, 'visor-comparar.html'), 'utf8');
  assert.match(html, /<meta name="robots" content="noindex,nofollow,noarchive">/);
  assert.match(html, /<meta name="referrer" content="no-referrer">/);
  assert.doesNotMatch(html, /portero\.js|yod-acceso|shell\.js|visor\.js/, 'no pasa por el Portero, no carga el marco y no depende de visor.js');
  const css = fs.readFileSync(path.join(RAIZ, 'visor-comparar.css'), 'utf8');
  assert.match(css, /@page\s*\{[^}]*size:\s*letter landscape/);
  const impresion = css.slice(css.indexOf('@media print'));
  assert.match(impresion, /\.vc-acciones \{ display: none; \}/, 'los botones no se imprimen');
  assert.match(impresion, /\.vc-impreso \{ display: flex;/, 'el aviso y las marcas salen arriba al imprimir');
  assert.match(impresion, /\.vc-tabla thead \{ display: table-header-group; \}/, 'la fila de opciones se repite en cada hoja');
  for (const f of ['visor-comparar.html', 'visor-compara.js', 'visor-comparar.css', 'tests/visor-compara.test.cjs', 'tests/visor-compara-browser.cjs']) {
    const t = fs.readFileSync(path.join(RAIZ, f), 'utf8').replace(/assert\.doesNotMatch\([^\n]*\n/g, '');
    assert.doesNotMatch(t, /Mor[eé]o|Avermont|Morelos|Puebla Arquitectos|@aurumarquitectos/i, f);
  }
});


test('pago en especie: filas adicionales sólo con datos nativos y pérdidas visibles', () => {
  const normal = [opcion('A', { ganancia: 2 }), opcion('B', { ganancia: 3 })];
  assert.equal(C.compara(normal).filter(r => r.f.especie).length, 0);
  const pagos = [opcion('A', { pago_especie: true, pago_resultado: -0.4, pago_anticipo: 1.4, pago_vivienda: 4.8, pago_cobros: 12 }), opcion('B', { pago_especie: true, pago_resultado: 0.7, pago_anticipo: 1.4, pago_vivienda: 3.7, pago_cobros: 13.1 })];
  assert.equal(C.compara(pagos).filter(r => r.f.especie).length, 4);
  assert.deepEqual(fila(pagos, 'pago_resultado').rojo, [0]);
  assert.deepEqual(fila(pagos, 'pago_resultado').mejor, [1]);
  assert.equal(fila(pagos, 'pago_anticipo').compara, false);
});
