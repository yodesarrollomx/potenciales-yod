'use strict';
/* La ronda del plan: el servidor real (server/ppp2/PPP2.gs) mueve capital y arranque de obra en una versión
   de trabajo, «el libro» recalcula y el plan propone sólo lo que pasa la revisión para fondos.

   Dos mundos (tests/ppp2-mundo.cjs):
     · libroReal: el servidor escoge sobre CIFRAS REALES del libro (tests/fixtures/ppp2-rejilla.json: la
       plantilla real con el plan inventado, recalculada por LibreOffice para cada combinación). Aquí se
       prueba el criterio.
     · juguete: reglas inventadas y sencillas, para probar la mecánica (dónde escribe, qué no toca, cómo se
       recupera, el latido). */
const test = require('node:test');
const assert = require('node:assert/strict');
const { mundo, PLAN, ADMIN, EDITOR, LECTOR, filaDe, juguete, jugueteConCiclo, libroReal } = require('./ppp2-mundo.cjs');

const CAMPOS = ['nombre', 'estado', 'que_cambia', 'propuesta_por', 'aprobada_por', 'fecha_aprobacion'];

function vestir(w) {
  const res = w.libro.getSheetByName('Resumen');
  w.resumen = (clave, v) => { const f = filaDe(res, clave); assert.ok(f, 'falta la clave ' + clave); if (v !== undefined) res.v[f - 1][1] = v; return res.v[f - 1][1]; };
  w.mod = w.libro.getSheetByName('Modelo');
  w.ver = w.libro.getSheetByName('Versiones');
  w.palanca = (clave, k, v) => { const f = filaDe(w.mod, clave); if (v !== undefined) { w.mod.v[f - 1][3 + k] = v; delete w.mod.f[f + ',' + (4 + k)]; } return w.mod.v[f - 1][3 + k]; };
  w.campo = (clave, k, v) => { const f = filaDe(w.ver, clave); if (v !== undefined) { w.ver.v[f - 1][1 + k] = v; w.resumen('v' + k + '.' + clave, v); } return w.ver.v[f - 1][1 + k]; };
  w.columna = (k) => w.mod.v.map((fila, i) => [w.mod.f[(i + 1) + ',' + (4 + k)] || '', fila[3 + k]]);
  w.fichas = (k) => CAMPOS.map((c) => w.campo(c, k));
  w.rondas = () => ((w.libro.getSheetByName('Rondas') || { v: [] }).v.slice(4).filter((f) => f[0] !== '' && f[0] !== null && f[0] !== undefined));
  w.detalle = (i) => JSON.parse(w.rondas()[i === undefined ? w.rondas().length - 1 : i][11]);
  w.bitacora = () => { const b = w.libro.getSheetByName('Bitácora'); return b.v.slice(4).filter((f) => f.some((x) => x !== '')).map((f) => String(f[2])); };
  w.vivero_bitacora = () => w.vivero.getSheetByName('Bitácora').v.slice(1);
  w.leer = (k) => w.get({ k: k || EDITOR, recurso: 'ppp2-plan', plan: PLAN });
  return w;
}
/* Mundo de juguete. La V3 del ejemplo («Temprana», alterna, hecha por una persona) queda como descartada:
   así el plan tiene un lugar libre donde escribir. Las pruebas del lugar la regresan a como estaba. */
function preparar(opciones) {
  const op = Object.assign({ alFlush: (i, libro) => juguete(libro) }, opciones || {});
  const w = vestir(mundo(op));
  if (!op.conservarV3) w.campo('estado', 3, 'descartada');
  w.resumen('plan.paso', 'explorar');
  juguete(w.libro);
  return w;
}
/* Mundo con cifras reales del libro para una situación de partida. */
function real(nombre, opciones) {
  const R = libroReal(nombre);
  const w = vestir(mundo(Object.assign({ alFlush: (i, libro) => R.aplica(libro) }, opciones || {})));
  R.partida(w.libro);
  w.resumen('plan.paso', 'explorar');
  w.R = R;
  return w;
}
const ronda = (w, k, extra) => w.post(Object.assign({ k: k || EDITOR, tipo: 'ppp2-ronda', plan: PLAN }, extra || {}));
/* Deja la versión k como una propuesta que el plan hizo en una ronda y nadie tocó: su firma («El plan · ronda n»),
   el renglón de esa ronda en Rondas y el sello de sus palancas tal como están ahora. Devuelve n. */
function firmar(w, k, estado) {
  const hr = w.ctx.rondasHoja_(w.libro), n = Math.max(0, hr.getLastRow() - 4) + 1;
  const sello = w.ctx.selloPalancas_(w.mod, w.ctx.palancasFilas_(w.mod), 4 + k);
  hr.appendRow([n, '2026-11-12 09:00', 'El plan (servidor)', 2, 'hantes', 'Motivo de prueba', 'propuesta', k, w.resumen('v' + k + '.huella'), 'Ronda de prueba', 15, JSON.stringify({ sello, candidatos: [] }), 'r-firma-' + n]);
  w.campo('propuesta_por', k, 'El plan · ronda ' + n);
  w.campo('aprobada_por', k, '');
  if (estado) w.campo('estado', k, estado);
  return n;
}
const elegida = (w) => w.detalle().candidatos.find((c) => c.elegido);

/* ───────────── el criterio, sobre cifras reales del libro ───────────── */

test('cifras reales · la propuesta regresada (pasa justa y no aguanta las ventas lentas): el plan propone la que pasa limpia y aguanta', () => {
  const w = real('regresada');
  assert.equal(w.resumen('plan.defiende'), 2);
  assert.match(String(w.resumen('v2.rv_resultado')), /^Pasa \(aportación justa\)/);
  const antesV1 = w.columna(1), antesV2 = w.columna(2), fichasV1 = w.fichas(1), fichasV2 = w.fichas(2);
  // la V3 del ejemplo es una alterna hecha por una persona: el plan no escribe ahí si nadie se la presta
  let r = ronda(w);
  assert.deepEqual([r.ok, r.error, r.presta], [false, 'sin_lugar', [2, 3]], 'le pueden prestar la alterna (V3) o dejarle afinar la propuesta de la persona (V2)');
  assert.equal(w.propiedades.size, 0, 'no dejó diario ni avance');
  r = ronda(w, EDITOR, { usar: 3 });
  assert.equal(r.ok, true, JSON.stringify(r));
  assert.deepEqual([r.resultado, r.version, r.parte_de, r.lugar], ['propuesta', 3, 2, 'prestada']);
  assert.deepEqual(w.R.faltan, [], 'todas las combinaciones probadas están en la tabla del libro');
  // capital 80 y obra en el mes 12: la primera que pasa limpia y aguanta los tres golpes sin alargar el plazo
  assert.deepEqual([w.palanca('capital', 3), w.palanca('obra_inicio', 3)], [80, 12]);
  assert.deepEqual(w.columna(1), antesV1, 'la base no se toca');
  assert.deepEqual(w.columna(2), antesV2, 'la versión de partida no se toca');
  assert.deepEqual(w.fichas(1), fichasV1);
  // la propuesta anterior (V2) sigue a la vista con sus números intactos; sólo deja de ser «la propuesta»
  assert.equal(w.campo('estado', 2), 'alterna');
  assert.deepEqual(w.fichas(2).filter((x, i) => i !== 1), fichasV2.filter((x, i) => i !== 1));
  // la versión de trabajo es copia de la de partida salvo las palancas elegidas
  const ahoraV3 = w.columna(3), palancas = w.ctx.palancasFilas_(w.mod);
  assert.ok(palancas.length > 30);
  palancas.forEach((x) => {
    if (x.clave === 'capital' || x.clave === 'obra_inicio') return;
    assert.deepEqual(ahoraV3[x.fila - 1], antesV2[x.fila - 1], x.clave + ' igual que en la de partida (fórmula y valor)');
  });
  assert.deepEqual([w.campo('estado', 3), w.campo('propuesta_por', 3)], ['propuesta', 'El plan · ronda 1']);
  assert.match(String(w.campo('nombre', 3)), /^Ronda 1 · /);
  const q = String(w.campo('que_cambia', 3));
  assert.match(q, /Parte de la V2 y cambia: [^.]* 60 → 80\./);
  assert.match(q, /Pasa las 9 pruebas \(la V2 pasa las 9 pruebas con la aportación justa\)\./);
  assert.match(q, /Con cada golpe leve por separado no le falta dinero \(a la V2 le faltarían 18\.9 con Ventas 25% más lentas\)\./);
  assert.match(q, /Al dueño: 59\.0 MDP en 37 meses \(con la V2: 59\.5 en 37\)\./);
  assert.match(q, /Escribí en la V3; lo que tenía \(«Temprana», alterna\) quedó anotado en esta ronda\./);
  const fila = w.rondas()[0], det = w.detalle();
  assert.deepEqual([fila[0], fila[3], fila[6], fila[7]], [1, 2, 'propuesta', 3]);
  assert.equal(fila[4], w.R.caso.tabla['60|12|'].huella, 'huella de partida');
  assert.equal(fila[8], w.R.caso.tabla['80|12|'].huella, 'huella de la propuesta');
  assert.equal(det.candidatos.length, 15, 'cinco capitales por tres arranques');
  assert.equal(det.paso_capital, 10, 'el paso de capital lo da el libro');
  assert.deepEqual(elegida(w).p, { capital: 80, obra_inicio: 12 });
  assert.deepEqual([elegida(w).gs, elegida(w).peor], [0, '']);
  const base = det.candidatos.find((c) => c.base);
  assert.deepEqual([base.gs, base.peor], [18.936, 'lentas'], 'cuenta el peor golpe, no la suma de los tres');
  assert.deepEqual(base.golpes['precio-5'].r + base.golpes['obra+5'].r, 0);
  // cómo estaba la versión prestada queda anotado: nombre, estado, quién la hizo y todas sus palancas
  assert.deepEqual([det.antes.version, det.antes.nombre, det.antes.estado, det.antes.propuesta_por], [3, 'Temprana', 'alterna', 'Pruebas']);
  assert.deepEqual(det.antes.celdas.find((c) => c[0] === 'obra_inicio').slice(1), ['', 9]);
  assert.ok(det.antes.celdas.length > 30);
  assert.equal(w.propiedades.size, 0, 'el diario y el avance se borran al terminar');
  assert.ok(w.bitacora().some((t) => /^Ronda 1: el plan propuso la V3/.test(t)));
});

test('cifras reales · la base no pasa y ninguna vecina pasa: no propone nada (antes proponía una que tampoco pasaba)', () => {
  const w = real('base_no_pasa');
  assert.equal(w.resumen('plan.defiende'), 1);
  assert.match(String(w.resumen('v1.rv_resultado')), /^No pasa: 2 de 9/);
  const antes = [w.columna(1), w.columna(2), w.columna(3)], fichas = [w.fichas(1), w.fichas(2), w.fichas(3)];
  const r = ronda(w);
  assert.equal(r.ok, true, JSON.stringify(r));
  assert.deepEqual([r.resultado, r.version, r.lugar], ['sin mejora', 1, 'libre']);
  assert.deepEqual([w.columna(1), w.columna(2), w.columna(3)], antes, 'ninguna versión cambió, fórmulas incluidas');
  assert.deepEqual([w.fichas(1), w.fichas(2), w.fichas(3)], fichas);
  // el capital disponible que dicen los datos (120) es el tope: no prueba 130 ni 140
  const det = w.detalle();
  assert.deepEqual(det.candidatos.map((c) => c.p.capital).filter((x, i, a) => a.indexOf(x) === i).sort((a, b) => a - b), [100, 110, 120]);
  assert.equal(det.candidatos.length, 9);
  assert.ok(det.candidatos.every((c) => c.f === 2 && c.golpes === null), 'ninguna pasa: a ninguna se le prueban golpes');
  assert.equal(det.candidatos.filter((c) => c.elegido).length, 1);
  assert.ok(elegida(w).base);
  assert.match(String(w.rondas()[0][9]), /Probé 9 combinaciones de capital y arranque de obra alrededor de la V1 \(hasta dos pasos de capital de 10 MDP y un mes de arranque\) y ninguna pasa la revisión para fondos\. Hace falta mover algo más/);
  assert.doesNotMatch(String(w.rondas()[0][9]), /más cerca/, 'ninguna falla menos pruebas que la base');
  assert.deepEqual(w.R.faltan, []);
  assert.equal(w.propiedades.size, 0);
});

test('cifras reales · la que defiende no pasa pero una vecina sí: propone la que pasa', () => {
  const w = real('no_pasa_y_hay_salida');
  assert.match(String(w.resumen('v2.rv_resultado')), /^No pasa: 3 de 9/);
  const r = ronda(w, EDITOR, { usar: 3 });
  assert.equal(r.ok, true, JSON.stringify(r));
  assert.equal(r.resultado, 'propuesta');
  assert.deepEqual([w.palanca('capital', 3), w.palanca('obra_inicio', 3)], [60, 12], 'la única de la rejilla que pasa');
  const q = String(w.campo('que_cambia', 3));
  assert.match(q, /Pasa las 9 pruebas con la aportación justa \(la V2 no pasa 3 de 9 pruebas\)\./);
  assert.match(q, /Con el peor golpe leve \(Ventas 25% más lentas\) le faltarían 18\.9 MDP\./);
  assert.equal(w.detalle().candidatos.filter((c) => c.golpes).length, 1, 'sólo se prueban golpes a las que pasan');
  assert.match(String(w.rondas()[0][5]), /^La V2 no pasa la revisión para fondos$/);
  assert.deepEqual(w.R.faltan, []);
});

test('cifras reales · no pasa y sus vecinas tampoco, aunque alguna falle menos pruebas: no propone, y dice cuál quedó más cerca', () => {
  const w = real('no_pasa_y_mejora_a_medias');
  const antesV3 = w.columna(3), fichasV3 = w.fichas(3);
  const r = ronda(w, EDITOR, { usar: 3 });
  assert.equal(r.ok, true, JSON.stringify(r));
  assert.equal(r.resultado, 'sin mejora');
  assert.deepEqual(w.columna(3), antesV3, 'la versión prestada quedó como estaba');
  assert.deepEqual(w.fichas(3), fichasV3);
  assert.equal(w.campo('estado', 2), 'propuesta', 'la de partida sigue siendo la propuesta');
  const det = w.detalle(), cerca = det.candidatos.find((c) => c.cerca);
  assert.deepEqual([cerca.p, cerca.f], [{ capital: 50, obra_inicio: 12 }, 1]);
  assert.ok(elegida(w).base);
  assert.match(String(w.rondas()[0][9]), /ninguna pasa la revisión para fondos\. La que quedó más cerca: [^(]*30 → 50; [^(]*11 → 12 \(no pasa 1 de 9 pruebas; la V2 no pasa 3 de 9 pruebas\)\./);
  assert.deepEqual(w.R.faltan, []);
});

test('cifras reales · su propia propuesta ya pasa limpia y aguanta: al afinarla en su lugar no hay mejora y queda intacta', () => {
  const w = real('afinar_en_su_lugar');
  w.campo('nombre', 3, 'Ronda 1 · Capital 60 → 80');
  assert.equal(firmar(w, 3), 1);
  assert.equal(w.resumen('plan.defiende'), 3);
  const antes = [w.columna(1), w.columna(2), w.columna(3)], fichas = [w.fichas(1), w.fichas(2), w.fichas(3)];
  const r = w.ctx.ronda_(w.ctx.SISTEMA, { plan_id: PLAN }, w.libro, {}, 0, 'latido-prueba');     // como la corre el latido
  assert.equal(r.ok, true, JSON.stringify(r));
  assert.deepEqual([r.resultado, r.lugar, r.version], ['sin mejora', 'en su lugar', 3]);
  assert.deepEqual([w.columna(1), w.columna(2), w.columna(3)], antes);
  assert.deepEqual([w.fichas(1), w.fichas(2), w.fichas(3)], fichas);
  assert.match(String(w.rondas()[1][9]), /^Ronda 2 del plan\. .* y ninguna es mejor que la que ya defiendo\./);
  const det = w.detalle();
  assert.deepEqual([elegida(w).p, elegida(w).gs], [{ capital: 80, obra_inicio: 12 }, 0]);
  assert.ok(det.candidatos.filter((c) => c.f === 0).length >= 6, 'había otras que pasan; ninguna mejor');
  assert.deepEqual(w.R.faltan, []);
});

/* ───────────── el criterio, casos límite con el juguete ───────────── */

test('una mejora de centavos en el faltante con golpes no vale un peso menos para el dueño: se mide en pasos de capital', () => {
  // el capital disponible es 70: ninguna aguanta todos los golpes. Con las reglas de juguete, a 60 le faltan 10 y a 70 le faltan 5:
  // los dos caben en el mismo paso (10), así que gana la que le deja más al dueño, que es la de partida.
  const w = preparar();
  w.mod.v[filaDe(w.mod, 'capital') - 1][3] = 70;
  let r = ronda(w);
  assert.equal(r.ok, true, JSON.stringify(r));
  assert.equal(r.resultado, 'sin mejora');
  assert.deepEqual(w.detalle().candidatos.filter((c) => c.f === 0).map((c) => [c.p.capital, c.p.obra_inicio, c.gs]).sort(), [[60, 12, 10], [60, 13, 10], [70, 12, 5], [70, 13, 5]]);
  // con un paso de capital de 5 la diferencia sí es de un paso entero: ahora gana la que aguanta más
  const w2 = preparar();
  w2.mod.v[filaDe(w2.mod, 'capital') - 1][3] = 70;
  w2.resumen('plan.paso_capital', 5);
  r = ronda(w2);
  assert.equal(r.resultado, 'propuesta', JSON.stringify(r));
  assert.deepEqual([w2.palanca('capital', 3), w2.palanca('obra_inicio', 3)], [70, 12]);
  assert.match(String(w2.campo('que_cambia', 3)), /Con el peor golpe leve \(Ventas 25% más lentas\) le faltarían 5\.0 MDP \(a la V2 le faltarían 10\.0 con Ventas 25% más lentas\)\./);
});

test('prefiere pasar limpio aunque le cueste un poco al dueño, no alarga el plazo si no hace falta y entre iguales usa menos capital', () => {
  const w = preparar();
  w.palanca('capital', 2, 90);           // rejilla 70…110: 100 y 110 pasan limpio; 100 le deja más al dueño y usa menos capital
  juguete(w.libro);
  const r = ronda(w);
  assert.equal(r.resultado, 'propuesta');
  assert.equal(w.palanca('capital', 3), 100);
  assert.equal(w.palanca('obra_inicio', 3), 12, 'arrancar un mes después le daría más al dueño, pero alarga su plazo: no lo escoge');
  // entre dos que pasan limpio, aguantan igual y le dejan lo mismo al dueño (a décimas), se queda con la que usa menos capital
  const w3 = preparar();
  w3.palanca('capital', 2, 99);
  w3.resumen('plan.paso_capital', 1);
  juguete(w3.libro);
  assert.equal(ronda(w3).resultado, 'propuesta');
  const limpias = w3.detalle().candidatos.filter((c) => c.rv === 'Pasa' && c.p.obra_inicio === 12).map((c) => [c.p.capital, Math.round(c.d * 10) / 10]);
  assert.deepEqual(limpias, [[100, 58], [101, 58]], '100 y 101 pasan limpio y le dejan 58.0 al dueño');
  assert.equal(w3.palanca('capital', 3), 100);
  // si la de partida ya es la mejor, no propone nada y deja la versión de trabajo exactamente como estaba
  const w2 = preparar();
  w2.palanca('capital', 2, 100);
  juguete(w2.libro);
  const antesV3 = w2.columna(3), fichasV3 = w2.fichas(3);
  const r2 = ronda(w2);
  assert.equal(r2.resultado, 'sin mejora');
  assert.deepEqual(w2.columna(3), antesV3, 'la versión de trabajo quedó igual, fórmulas incluidas');
  assert.deepEqual(w2.fichas(3), fichasV3);
  assert.deepEqual([w2.rondas()[0][3], w2.rondas()[0][6], w2.rondas()[0][7], w2.rondas()[0][8]], [2, 'sin mejora', '', '']);
  assert.ok(w2.bitacora().some((t) => /no encontró mejora/.test(t)));
});

test('si la versión de partida usa más capital que el disponible, igual prueba sus vecinas (no afirma «sin mejora» con una sola)', () => {
  const w = preparar();
  w.mod.v[filaDe(w.mod, 'capital') - 1][3] = 50;        // los datos dicen 50 y la V2 usa 60
  const r = ronda(w);
  assert.equal(r.ok, true, JSON.stringify(r));
  const caps = w.detalle().candidatos.map((c) => c.p.capital);
  assert.ok(caps.length >= 9 && Math.max(...caps) === 60 && Math.min(...caps) === 40, 'prueba 40, 50 y 60 en los tres arranques: ' + caps.join(','));
  // y sin vecinas no hay ronda: no se afirma nada
  const w2 = preparar();
  w2.ctx.RONDA.CAPITAL_PASOS = [0]; w2.ctx.RONDA.OBRA_PASOS = [0];
  assert.deepEqual(ronda(w2), { ok: false, error: 'rejilla' });
  assert.equal(w2.rondas().length, 0);
  assert.equal(w2.propiedades.size, 0);
});

test('los números de la ronda no traen ruido decimal y el paso de capital sale del libro', () => {
  const w = preparar();
  w.palanca('capital', 2, 62.2);
  w.resumen('plan.paso_capital', 4.1);
  juguete(w.libro);
  const r = ronda(w);
  assert.equal(r.ok, true, JSON.stringify(r));
  const caps = w.detalle().candidatos.map((c) => c.p.capital);
  assert.deepEqual([...new Set(caps)].sort((a, b) => a - b), [54, 58.1, 62.2, 66.3, 70.4]);
  assert.doesNotMatch(JSON.stringify(w.rondas()[0]) + String(w.campo('nombre', 3)) + String(w.campo('que_cambia', 3)), /\d\.\d{4,}/);
  // un libro anterior al ciclo no trae el paso de capital: la ronda no corre y no toca nada
  const w2 = preparar();
  w2.resumen('plan.paso_capital', '');
  const antes = w2.columna(3);
  assert.deepEqual(ronda(w2), { ok: false, error: 'modelo' });
  assert.deepEqual(w2.columna(3), antes);
  assert.equal(w2.propiedades.size, 0);
});

/* ───────────── dónde escribe ───────────── */

test('dónde escribe el plan: nunca en la base ni en la vigente, ni encima del trabajo de una persona si nadie se lo presta', () => {
  const w = preparar(), L = (est, del, kb, usar, persona) => { const r = w.ctx.lugarRonda_(est, del, kb, usar, persona); return [r.ks, r.modo, Array.from(r.presta)]; };
  const P = false, X = true;        // P: de una persona (o tocada por una persona); X: una propuesta del plan que nadie tocó
  // libre: vacía, descartada o una alterna que el propio plan propuso antes
  assert.deepEqual(L(['base', 'propuesta', ''], [P, P, P], 2, 0, false), [3, 'libre', [2]]);
  assert.deepEqual(L(['base', 'vigente', 'descartada'], [P, P, P], 2, 0, false), [3, 'libre', []]);
  assert.deepEqual(L(['base', 'vigente', 'alterna'], [P, P, X], 2, 0, false), [3, 'libre', []]);
  assert.deepEqual(L(['base', 'alterna', 'propuesta'], [P, X, X], 3, 0, false), [2, 'libre', []]);
  // la alterna de una persona no es libre: sin préstamo no hay lugar; con préstamo de una persona, sí
  assert.deepEqual(L(['base', 'vigente', 'alterna'], [P, P, P], 2, 0, false), [0, '', [3]]);
  assert.deepEqual(L(['base', 'vigente', 'alterna'], [P, P, P], 2, 3, false), [0, '', [3]], 'el latido no se presta nada a sí mismo');
  assert.deepEqual(L(['base', 'vigente', 'alterna'], [P, P, P], 2, 3, true), [3, 'prestada', [3]]);
  assert.deepEqual(L(['base', 'vigente', 'alterna'], [P, P, P], 2, 2, true), [0, '', [3]], 'la vigente no se presta');
  assert.deepEqual(L(['base', 'vigente', 'alterna'], [P, P, P], 2, 1, true), [0, '', [3]], 'la base no se presta');
  // su propia propuesta, sin otra libre: la afina en su lugar
  assert.deepEqual(L(['base', 'vigente', 'propuesta'], [P, P, X], 3, 0, false), [3, 'en su lugar', []]);
  // la propuesta de una persona, sin otra libre: sólo si alguien se la presta
  assert.deepEqual(L(['base', 'vigente', 'propuesta'], [P, P, P], 3, 0, false), [0, '', [3]]);
  assert.deepEqual(L(['base', 'vigente', 'propuesta'], [P, P, P], 3, 3, true), [3, 'prestada', [3]]);
  // otra propuesta pendiente de una persona nunca se pisa, ni prestada
  assert.deepEqual(L(['base', 'propuesta', 'propuesta'], [P, X, P], 2, 3, true), [2, 'en su lugar', []]);
  assert.deepEqual(L(['base', 'propuesta', 'propuesta'], [P, P, P], 2, 3, true), [0, '', [2]]);
  // sólo la base: con las otras dos ocupadas por personas no hay lugar
  assert.deepEqual(L(['base', 'alterna', 'alterna'], [P, P, P], 1, 0, false), [0, '', [2, 3]]);
  assert.deepEqual(L(['base', 'vigente', 'base'], [P, P, P], 2, 3, true), [0, '', []]);
});

test('con una versión vigente trabaja en la libre; después afina su propia propuesta en su lugar, sin tocar la vigente', () => {
  const w = preparar();
  w.campo('estado', 2, 'vigente');
  const antesV1 = w.columna(1), antesV2 = w.columna(2), fichasV2 = w.fichas(2);
  let r = ronda(w);
  assert.deepEqual([r.version, r.lugar], [3, 'libre']);
  assert.deepEqual(w.columna(2), antesV2, 'la vigente no se toca');
  assert.deepEqual(w.fichas(2), fichasV2, 'ni su ficha: sigue vigente');
  assert.equal(w.campo('estado', 3), 'propuesta');
  // ahora defiende la V3 (su propuesta) y no hay otra libre: la siguiente ronda la afina ahí mismo
  w.resumen('plan.defiende', 3);
  w.resumen('plan.paso', 'explorar');
  juguete(w.libro);
  r = ronda(w);
  assert.equal(r.ok, true, JSON.stringify(r));
  assert.deepEqual([r.parte_de, r.resultado, r.version, r.lugar], [3, 'propuesta', 3, 'en su lugar'], 'de 80 sube a 100: pasa limpio');
  assert.equal(w.palanca('capital', 3), 100);
  assert.deepEqual([w.columna(1), w.columna(2)], [antesV1, antesV2]);
  assert.deepEqual(w.fichas(2), fichasV2);
  assert.equal(w.campo('estado', 3), 'propuesta', 'al afinar en su lugar sigue siendo la propuesta');
  assert.match(String(w.campo('que_cambia', 3)), /Afiné mi propuesta en su lugar; lo que tenía quedó anotado en esta ronda\./);
  assert.equal(w.detalle().antes.celdas.find((c) => c[0] === 'capital')[2], 80, 'lo que tenía antes de afinar queda anotado');
  assert.deepEqual(w.rondas().map((f) => f[0]), [1, 2]);
});

test('lo que el plan ya propuso desde una versión y una persona retiró, no lo vuelve a proponer', () => {
  const w = preparar();
  w.campo('estado', 2, 'vigente');
  let r = ronda(w);
  assert.deepEqual([r.resultado, w.palanca('capital', 3), w.palanca('obra_inicio', 3)], ['propuesta', 80, 12]);
  // Dirección descarta la propuesta: el plan vuelve a defender la vigente y le toca explorar otra vez desde ella
  const descartar = () => { assert.equal(w.post({ k: EDITOR, tipo: 'ppp2-version', plan: PLAN, version: 3, campos: { estado: 'descartada' } }).ok, true); w.resumen('plan.defiende', 2); w.resumen('plan.paso', 'explorar'); juguete(w.libro); };
  descartar();
  r = ronda(w);
  assert.equal(r.ok, true, JSON.stringify(r));
  assert.deepEqual([r.resultado, w.palanca('capital', 3), w.palanca('obra_inicio', 3)], ['propuesta', 80, 13], 'propone otra cosa: la siguiente que aguanta los golpes');
  assert.equal(w.detalle().candidatos.find((c) => c.p.capital === 80 && c.p.obra_inicio === 12).retirada, 1, 'la de la ronda 1 queda marcada como retirada');
  // si también ésa se descarta, ya no queda nada mejor que la de partida: lo dice, sin insistir con las retiradas
  descartar();
  r = ronda(w);
  assert.equal(r.resultado, 'sin mejora', JSON.stringify(r));
  assert.match(String(w.rondas()[2][9]), /ninguna es mejor que la que ya defiendo \(sin contar lo que ya propuse desde aquí y se retiró\)\./);
  assert.deepEqual(w.detalle().candidatos.filter((c) => c.retirada).map((c) => [c.p.capital, c.p.obra_inicio, c.retirada]).sort(), [[80, 12, 1], [80, 13, 2]]);
  // si cambian los números de la versión de partida (otra huella), lo anterior ya no cuenta: vuelve a considerar todo
  w.palanca('capital', 2, 70);
  w.resumen('plan.paso', 'explorar');
  juguete(w.libro);
  r = ronda(w);
  assert.deepEqual([r.resultado, w.palanca('capital', 3), w.palanca('obra_inicio', 3)], ['propuesta', 80, 12]);
  assert.equal(w.detalle().candidatos.filter((c) => c.retirada).length, 0);
});

test('sin lugar no hay ronda y nada cambia; el plan dice qué versión le pueden prestar', () => {
  const w = preparar({ conservarV3: true });        // V2 propuesta de una persona, V3 alterna de una persona
  const antes = [w.columna(1), w.columna(2), w.columna(3)], fichas = [w.fichas(1), w.fichas(2), w.fichas(3)];
  const r = ronda(w);
  assert.deepEqual(r, { ok: false, error: 'sin_lugar', presta: [2, 3] });
  assert.deepEqual([w.columna(1), w.columna(2), w.columna(3)], antes);
  assert.deepEqual([w.fichas(1), w.fichas(2), w.fichas(3)], fichas);
  assert.equal(w.propiedades.size, 0);
  const c = w.leer().ciclo;
  assert.deepEqual(c.lugar, { version: 0, modo: '', presta: [{ version: 2, nombre: 'Con banco', estado: 'propuesta' }, { version: 3, nombre: 'Temprana', estado: 'alterna' }] });
  // un lector no presta nada
  assert.equal(ronda(w, LECTOR, { usar: 3 }).error, 'permiso');
  // prestada la V3: ahí escribe, y lo que tenía queda anotado
  const ok = ronda(w, EDITOR, { usar: 3 });
  assert.deepEqual([ok.ok, ok.version, ok.lugar], [true, 3, 'prestada']);
  assert.equal(w.detalle().antes.nombre, 'Temprana');
  assert.equal(w.campo('estado', 2), 'alterna', 'la propuesta de la persona queda a la vista, como alterna');
  // ahora el plan defiende su propia propuesta (V3): la siguiente ronda la afina en su lugar, sin pedir nada
  w.resumen('plan.defiende', 3);
  assert.deepEqual(w.leer().ciclo.lugar, { version: 3, modo: 'en su lugar', presta: [{ version: 2, nombre: 'Con banco', estado: 'alterna' }] });
});

/* ───────────── permisos ───────────── */

test('la ronda sólo corre cuando el libro dice que toca explorar; sólo Dirección puede forzarla', () => {
  const w = preparar();
  w.resumen('plan.paso', 'consejo');
  assert.deepEqual(ronda(w), { ok: false, error: 'paso', paso: 'consejo' });
  assert.equal(ronda(w, EDITOR, { forzar: true }).error, 'paso', 'un editor no puede forzarla');
  assert.equal(ronda(w, ADMIN, { forzar: 'true' }).error, 'paso', 'forzar tiene que ser verdadero, no un texto');
  const r = ronda(w, ADMIN, { forzar: true });
  assert.equal(r.ok, true, JSON.stringify(r));
  assert.match(String(w.rondas()[0][5]), /^A pedido de /);
  assert.equal(ronda(preparar(), LECTOR).error, 'permiso');
});

test('nadie se hace pasar por el sistema desde fuera', () => {
  const w = preparar();
  assert.equal(w.post({ k: LECTOR, tipo: 'ppp2-ronda', plan: PLAN, sistema: true, rol: 'sistema', forzar: true }).error, 'permiso');
  assert.equal(w.post({ tipo: 'ppp2-ronda', plan: PLAN, sistema: true }).error, 'sin_sesion');
  assert.equal(w.ctx.puede_(w.ctx.SISTEMA, 'aprobar'), false);
  assert.equal(w.ctx.version_(w.ctx.SISTEMA, w.libro, { version: 3, campos: { estado: 'vigente' } }, 0, '').error, 'permiso');
});

/* ───────────── si algo falla a medias ───────────── */

test('si la ronda truena mientras prueba combinaciones, la versión de trabajo vuelve a quedar como estaba', () => {
  let n = 0;
  const w = preparar({ alFlush: (i, libro) => { n++; if (n === 9) throw new Error('se cayó Sheets'); juguete(libro); } });
  const antesV3 = w.columna(3), fichasV3 = w.fichas(3);
  n = 0;
  const r = ronda(w);
  assert.deepEqual([r.ok, r.error], [false, 'interno']);
  assert.deepEqual(w.columna(3), antesV3);
  assert.deepEqual(w.fichas(3), fichasV3);
  assert.equal(w.propiedades.has('j_' + PLAN), false, 'sin diario pendiente');
  assert.equal(w.rondas().length, 0, 'no anota una ronda que no terminó');
  assert.equal(w.cache.has('trabajando'), false);
});

test('si truena ya con la propuesta escrita pero antes de anotarla en Rondas, se deshace todo: palancas, ficha y el estado de la de partida', () => {
  const w = preparar();
  const antes = [w.columna(1), w.columna(2), w.columna(3)], fichas = [w.fichas(1), w.fichas(2), w.fichas(3)];
  w.ctx.rondasHoja_(w.libro).appendRow = () => { throw new Error('no se pudo anotar'); };
  const r = ronda(w);
  assert.deepEqual([r.ok, r.error], [false, 'interno']);
  assert.deepEqual([w.columna(1), w.columna(2), w.columna(3)], antes, 'las palancas volvieron');
  assert.deepEqual([w.fichas(1), w.fichas(2), w.fichas(3)], fichas, 'la ficha volvió y la V2 sigue siendo la propuesta');
  assert.equal(w.propiedades.has('j_' + PLAN), false);
  assert.equal(w.rondas().length, 0);
});

test('si el servidor muere justo después de anotar la ronda, la propuesta se queda: el renglón de Rondas es lo que la da por hecha', () => {
  const w = preparar();
  let diario = null;
  const props = w.ctx.PropertiesService.getScriptProperties(), borrar = props.deleteProperty;
  // se simula la muerte: al terminar, el diario no alcanzó a borrarse
  w.ctx.PropertiesService.getScriptProperties = () => Object.assign({}, props, { deleteProperty: (k) => { if (k === 'j_' + PLAN && !diario) { diario = props.getProperty(k); throw new Error('murió'); } return borrar(k); } });
  const r = ronda(w);
  assert.equal(r.error, 'interno');
  w.ctx.PropertiesService.getScriptProperties = () => props;
  w.propiedades.set('j_' + PLAN, diario);
  assert.equal(w.rondas().length, 1, 'la ronda sí quedó anotada');
  assert.equal(w.palanca('capital', 3), 80);
  // la siguiente escritura no deshace nada: sólo retira el diario y sigue
  const c = w.post({ k: EDITOR, tipo: 'ppp2-candado', plan: PLAN, id: 'agua', estado: 'en revisión' });
  assert.equal(c.ok, true, JSON.stringify(c));
  assert.equal(w.palanca('capital', 3), 80, 'la propuesta sigue ahí');
  assert.equal(w.campo('estado', 3), 'propuesta');
  assert.equal(w.propiedades.has('j_' + PLAN), false);
  assert.ok(!w.bitacora().some((t) => /se interrumpió/.test(t)));
});

test('si el servidor muere a media ronda, la siguiente escritura deja la versión como estaba y NO sigue: la página recarga y decide con las cifras de verdad', () => {
  const w = preparar();
  const antesV3 = w.columna(3), fichasV3 = w.fichas(3);
  // se simula la muerte: el diario quedó guardado y la versión de trabajo a medio cambiar
  w.ctx.diarioGuardar_({ plan_id: PLAN }, w.libro, 3, w.ctx.palancasFilas_(w.mod), 2, 'r-muerta');
  w.palanca('capital', 3, 999);
  w.campo('nombre', 3, 'a medias');
  w.campo('estado', 2, 'alterna');
  let c = w.leer().ciclo;
  assert.deepEqual([c.en_ronda, c.interrumpida, c.trabajo], [true, false, 3], 'un diario reciente es una ronda corriendo: la página marca la V3 como «en trabajo»');
  const j = JSON.parse(w.propiedades.get('j_' + PLAN)); j.t = Date.now() - 3600000; w.propiedades.set('j_' + PLAN, JSON.stringify(j));
  c = w.leer().ciclo;
  assert.deepEqual([c.en_ronda, c.interrumpida, c.trabajo], [false, true, 3], 'uno viejo es una ronda que murió: la lectura lo avisa');
  // Dirección, que veía cifras a medias, quiere aprobar la V3: no se aprueba; se restaura y se le pide recargar
  const r = w.post({ k: ADMIN, tipo: 'ppp2-version', plan: PLAN, version: 3, campos: { estado: 'vigente' } });
  assert.deepEqual([r.ok, r.error, r.recuperado], [false, 'revision', true]);
  assert.deepEqual(w.columna(3), antesV3);
  assert.deepEqual(w.fichas(3), fichasV3);
  assert.equal(w.campo('estado', 2), 'propuesta', 'la de partida recupera su estado');
  assert.equal(w.propiedades.has('j_' + PLAN), false);
  assert.ok(w.bitacora().some((t) => /como estaba antes de una ronda que se interrumpió/.test(t)));
  // con las cifras de verdad a la vista, el segundo intento sí pasa
  assert.equal(w.post({ k: EDITOR, tipo: 'ppp2-candado', plan: PLAN, id: 'agua', estado: 'en revisión' }).ok, true);
});

test('libro lento: si no alcanza el tiempo no afirma nada, guarda lo ya leído y el siguiente intento continúa hasta terminar', () => {
  const w = preparar();
  const completo = (() => { const x = preparar(); ronda(x); return x.detalle(); })();
  const antesV3 = w.columna(3), fichasV3 = w.fichas(3);
  w.ctx.RONDA.MAX_MS = -1;                       // cada intento alcanza para una sola lectura nueva
  let r = ronda(w);
  assert.deepEqual([r.ok, r.error, r.nuevas], [false, 'tiempo', 1]);
  assert.deepEqual(w.columna(3), antesV3, 'la versión de trabajo quedó como estaba');
  assert.deepEqual(w.fichas(3), fichasV3);
  assert.equal(w.rondas().length, 0, 'sin renglón: no afirma «sin mejora» ni propone a medias');
  assert.equal(w.propiedades.has('j_' + PLAN), false);
  const avance = JSON.parse(w.propiedades.get('g_' + PLAN));
  assert.deepEqual(Object.keys(avance.lect), ['60|12'], 'guardó la combinación que sí leyó');
  // los siguientes intentos avanzan de una en una; nunca repiten lo ya leído
  let intentos = 1;
  while (intentos < 60) { r = ronda(w); intentos++; if (r.ok) break; assert.equal(r.error, 'tiempo'); assert.ok(r.nuevas >= 1 && r.nuevas <= 2, 'cada intento avanza: ' + r.nuevas); }
  assert.equal(r.ok, true, JSON.stringify(r));
  assert.ok(intentos > 15, 'hicieron falta varios intentos: ' + intentos);
  assert.deepEqual(w.detalle().candidatos, completo.candidatos, 'el resultado es el mismo que de corrido');
  assert.equal(w.palanca('capital', 3), 80);
  assert.equal(w.propiedades.size, 0, 'al terminar no queda avance ni diario');
  // si la versión de partida cambia, lo guardado ya no vale
  const w2 = preparar();
  w2.ctx.RONDA.MAX_MS = -1;
  ronda(w2);
  w2.palanca('capital', 2, 70);
  juguete(w2.libro);
  ronda(w2);
  assert.deepEqual(Object.keys(JSON.parse(w2.propiedades.get('g_' + PLAN)).lect), ['70|12']);
});

test('el detalle de la ronda nunca pierde cómo estaba la versión donde escribió, aunque haya que recortar lo demás', () => {
  const w = preparar({ conservarV3: true });
  w.campo('estado', 2, 'vigente');
  w.ctx.RONDA.DETALLE_MAX = 2600;
  const r = ronda(w, EDITOR, { usar: 3 });
  assert.equal(r.ok, true, JSON.stringify(r));
  const det = w.detalle();
  assert.equal(det.antes.nombre, 'Temprana');
  assert.ok(det.antes.celdas.length > 30, 'todas sus palancas siguen anotadas');
  assert.ok(det.candidatos.length < 15 && det.candidatos.some((c) => c.elegido) && det.candidatos.some((c) => c.base), 'se recortan las combinaciones, no el respaldo');
});

/* ───────────── las pruebas de estrés ───────────── */

test('las pruebas de estrés guardan la huella de la versión que probaron', () => {
  const w = preparar();
  const r = w.post({ k: EDITOR, tipo: 'ppp2-estres', plan: PLAN, version: 2 });
  assert.equal(r.ok, true, JSON.stringify(r));
  const pru = w.libro.getSheetByName('Pruebas');
  assert.deepEqual([pru.v[13][7], pru.v[13][10]], ['V2', 'h60_12_0_0_24']);
  const leido = w.leer(LECTOR);
  assert.equal(leido.pruebas[0].huella, 'h60_12_0_0_24');
  assert.deepEqual([leido.ciclo.paso, leido.ciclo.defiende], ['explorar', 2]);
  assert.deepEqual(leido.ciclo.golpes.map((g) => g.id), ['precio-5', 'obra+5', 'lentas']);
  assert.equal(w.cache.has('trabajando'), false);
});

test('una corrida de pruebas que murió a medias no envenena la siguiente: la columna Prueba se sana sola, en cualquier idioma', () => {
  const w = preparar({ idioma: 'puntoycoma' });
  const f = filaDe(w.mod, 'ajuste_precio'), g = filaDe(w.mod, 'ventas_meses'), h = filaDe(w.mod, 'sobretasa');
  w.mod.getRange(f, 8).setValue(-0.05);                 // quedó un número fijo donde iba la fórmula
  w.mod.getRange(g, 8).setFormula('=INDEX($E' + g + ':$G' + g + ',1,Pruebas!$B$4)');   // y una fórmula rota (con comas)
  w.mod.getRange(h, 8).setFormula('=INDICE($E' + h + ':$G' + h + ';1;Pruebas!$B$4)'); // el mismo cálculo con el nombre de la función en español: está sana
  const r = w.post({ k: EDITOR, tipo: 'ppp2-estres', plan: PLAN, version: 2 });
  assert.equal(r.ok, true, JSON.stringify(r));
  assert.equal(w.mod.getRange(f, 8).getFormula(), '=INDEX($E' + f + ':$G' + f + ';1;Pruebas!$B$4)');
  assert.equal(w.mod.getRange(g, 8).getFormula(), '=INDEX($E' + g + ':$G' + g + ';1;Pruebas!$B$4)');
  assert.equal(w.mod.getRange(h, 8).getFormula(), '=INDICE($E' + h + ':$G' + h + ';1;Pruebas!$B$4)', 'no se toca lo que está sano');
  assert.deepEqual(Object.keys(w.mod.roto), []);
  assert.equal(w.ctx.pruebaSana_('=INDEX($E8:$G9;1;Pruebas!$B$4)', 8), false, 'una fórmula que mira otra fila no es sana');
});

/* ───────────── el latido ───────────── */

test('el latido hace solo la ronda o las pruebas cuando toca, y nada cuando le toca a alguien más', () => {
  const w = preparar({ alFlush: (i, libro) => jugueteConCiclo(libro) });
  jugueteConCiclo(w.libro);
  assert.equal(w.resumen('plan.paso'), 'probar', 'la propuesta del ejemplo pasa y no se ha probado');
  assert.match(w.ctx.latido(), /^probar:p2ejemplo001:ok$/);
  const pru = w.libro.getSheetByName('Pruebas');
  assert.deepEqual([pru.v[13][7], pru.v[13][9], pru.v[13][10]], ['V2', 'El plan (servidor)', 'h60_12_0_0_24']);
  assert.equal(w.resumen('plan.paso'), 'consejo');
  assert.equal(w.ctx.latido(), 'nada', 'al consejo no va solo');
  // el consejo la regresa (siete votos con su huella): toca explorar, y el latido corre la ronda
  const con = w.libro.getSheetByName('Consejo');
  for (let i = 0; i < 7; i++) con.appendRow(['2026-11-12', 'CP-1', 'V2', 'Juez ' + (i + 1), 'regresa', 'razón', '', 'h60_12_0_0_24', w.resumen('plan.evidencia')]);
  jugueteConCiclo(w.libro);
  assert.equal(w.resumen('plan.paso'), 'explorar');
  assert.match(w.ctx.latido(), /^explorar:p2ejemplo001:propuesta$/);
  assert.equal(w.rondas()[0][2], 'El plan (servidor)');
  assert.match(String(w.rondas()[0][5]), /^El consejo \(CP-1\) regresó la V2: aprueban 0 de 7$/);
  assert.deepEqual([w.campo('estado', 3), w.resumen('plan.defiende'), w.resumen('plan.paso')], ['propuesta', 3, 'probar']);
  assert.match(w.ctx.latido(), /^probar:p2ejemplo001:ok$/);
  assert.equal(w.resumen('plan.paso'), 'consejo');
  // cuando toca al consejo, a Dirección, a las personas o al mundo real, el latido no hace nada
  for (const paso of ['consejo', 'direccion', 'mundo', 'candados', 'acuerdo', 'datos', 'proponer', 'cumplido', '']) {
    const x = preparar();
    x.resumen('plan.paso', paso);
    assert.equal(x.ctx.latido(), 'nada', paso);
    assert.equal(x.rondas().length, 0);
  }
  assert.deepEqual(w.vivero_bitacora().map((f) => [f[2], f[6]]), [['latido · probar', 'ok'], ['latido · explorar', 'ok'], ['latido · probar', 'ok']]);
});

test('el latido respeta la pausa, su propio interruptor y no estorba cuando alguien está escribiendo', () => {
  assert.equal(preparar({ pausa: 'sí' }).ctx.latido(), 'pausa');
  const apagado = preparar({ config: [['latido', 'no']] });
  assert.equal(apagado.ctx.latido(), 'pausa');
  assert.equal(apagado.rondas().length, 0);
  assert.equal(apagado.leer().ciclo.latido, 'apagado', 'la página sabe que el plan no está latiendo');
  assert.equal(preparar({ config: [['latido', 'sí']] }).ctx.latido(), 'explorar:p2ejemplo001:propuesta');
  const w = preparar({ ocupado: true });
  assert.equal(w.ctx.latido(), 'ocupado');
  assert.equal(w.rondas().length, 0);
  // quien escribe mientras el plan corre una ronda recibe «trabajando», no «intenta en unos segundos»
  assert.equal(w.post({ k: EDITOR, tipo: 'ppp2-candado', plan: PLAN, id: 'agua', estado: 'en revisión' }).error, 'ocupado');
  w.cache.set('trabajando', PLAN);
  assert.equal(w.post({ k: EDITOR, tipo: 'ppp2-candado', plan: PLAN, id: 'agua', estado: 'en revisión' }).error, 'trabajando');
});

test('antes de dar un paso, el latido deja como estaba una versión que una ronda interrumpida dejó a medias', () => {
  const w = preparar({ alFlush: (i, libro) => jugueteConCiclo(libro) });
  const antesV3 = w.columna(3);
  w.ctx.diarioGuardar_({ plan_id: PLAN }, w.libro, 3, w.ctx.palancasFilas_(w.mod), 2, 'r-muerta');
  w.palanca('capital', 3, 999);
  w.resumen('plan.paso', 'consejo');
  w.ctx.latido();
  assert.deepEqual(w.columna(3), antesV3);
  assert.equal(w.propiedades.has('j_' + PLAN), false);
  assert.ok(w.bitacora().some((t) => /como estaba antes de una ronda que se interrumpió/.test(t)));
});

test('si un paso del latido falla, no insiste cada media hora; en cuanto una persona cambia algo, vuelve a mirar', () => {
  const w = preparar({ conservarV3: true });      // no hay lugar libre: la ronda no puede correr sola
  assert.equal(w.ctx.latido(), 'explorar:p2ejemplo001:sin_lugar');
  assert.equal(w.ctx.latido(), 'nada', 'en el siguiente latido no lo vuelve a intentar');
  assert.equal(w.ctx.latido(), 'nada');
  assert.equal(w.vivero_bitacora().length, 1);
  assert.deepEqual([w.vivero_bitacora()[0][2], w.vivero_bitacora()[0][4], w.vivero_bitacora()[0][6]], ['latido · explorar', 'no se pudo: sin_lugar', 'error']);
  // una persona descarta la V3: su escritura quita la espera y el siguiente latido ya tiene dónde escribir
  const r = w.post({ k: EDITOR, tipo: 'ppp2-version', plan: PLAN, version: 3, campos: { estado: 'descartada' } });
  assert.equal(r.ok, true, JSON.stringify(r));
  assert.equal(w.propiedades.has('e_' + PLAN), false);
  juguete(w.libro);
  assert.match(w.ctx.latido(), /^explorar:p2ejemplo001:propuesta$/);
});

test('si el paso no avanza después de hacerlo, el latido no lo repite cada media hora', () => {
  // con el juguete simple el libro sigue diciendo «explorar» sobre los mismos números después de una ronda sin mejora
  const w = preparar();
  w.palanca('capital', 2, 100);
  juguete(w.libro);
  assert.equal(w.ctx.latido(), 'explorar:p2ejemplo001:sin mejora');
  assert.equal(w.ctx.latido(), 'nada');
  assert.equal(w.rondas().length, 1, 'no repitió la ronda');
  const fila = w.vivero_bitacora()[0];
  assert.equal(fila[6], 'error');
  assert.match(String(fila[4]), /^el paso no avanzó \(sigue en «explorar»\)/);
});

test('con un libro lento el latido sigue en el siguiente latido donde se quedó, sin esperar un día', () => {
  const w = preparar();
  w.ctx.RONDA.MAX_MS = -1;
  assert.equal(w.ctx.latido(), 'explorar:p2ejemplo001:tiempo');
  assert.equal(w.propiedades.has('e_' + PLAN), false, 'hubo avance: no espera');
  assert.equal(w.ctx.latido(), 'explorar:p2ejemplo001:tiempo');
  assert.equal(Object.keys(JSON.parse(w.propiedades.get('g_' + PLAN)).lect).length, 2);
});

/* ───────────── segunda auditoría (12-nov-2026): lo que faltaba ───────────── */

/* Un «libro de guion» para probar el criterio con cifras exactas: después del juguete, lo que el Resumen dice de
   cada versión se pisa con lo que diga la tabla para su combinación (capital|arranque) y el golpe que tenga puesto. */
function guion(tabla) {
  return (i, libro) => {
    juguete(libro);
    const mod = libro.getSheetByName('Modelo'), res = libro.getSheetByName('Resumen');
    const pon = (clave, v) => { const f = filaDe(res, clave); if (f) res.v[f - 1][1] = v; };
    for (const k of [1, 2, 3]) {
      const val = (c) => Number(mod.v[filaDe(mod, c) - 1][3 + k]) || 0;
      const t = tabla[val('capital') + '|' + val('obra_inicio')];
      if (!t) continue;
      const golpe = val('ajuste_precio') < 0 ? 'precio-5' : (val('ajuste_obra') > 0 ? 'obra+5' : (val('ventas_meses') > Number(mod.v[filaDe(mod, 'ventas_meses') - 1][3]) ? 'lentas' : ''));
      if (t.rv !== undefined) pon('v' + k + '.rv_resultado', t.rv);
      if (t.d !== undefined) pon('v' + k + '.dueno_recibe', t.d);
      if (t.m !== undefined) pon('v' + k + '.dueno_meses', t.m);
      pon('v' + k + '.respaldo', golpe ? ((t.golpes || {})[golpe] !== undefined ? t.golpes[golpe] : 0) : (t.r !== undefined ? t.r : 0));
    }
  };
}
function conGuion(tabla, opciones) {
  const g = guion(tabla), w = preparar(Object.assign({ alFlush: g }, opciones || {}));
  g(0, w.libro);
  return w;
}
const NO = { rv: 'No pasa: 1 de 9 pruebas' };
const JUSTA = 'Pasa (aportación justa)';

test('aguante · centavos de faltante no deciden: una vecina sólo gana si le quita a la de partida un paso ENTERO de capital', () => {
  // El caso de la auditoría: a la de partida le faltan 10.01 y deja 58 al dueño; a la vecina le faltan 9.99 y deja 55.
  // Antes ganaba la vecina (caían en «cubos» distintos por dos centavos). Ahora empatan en aguante y decide lo del dueño.
  const solas = { '60|13': NO, '70|13': NO, '80|12': NO, '80|13': NO };
  let w = conGuion(Object.assign({ '60|12': { rv: JUSTA, d: 58, golpes: { lentas: 10.01 } }, '70|12': { rv: JUSTA, d: 55, golpes: { lentas: 9.99 } } }, solas));
  let r = ronda(w);
  assert.equal(r.resultado, 'sin mejora', JSON.stringify(r));
  assert.deepEqual(w.detalle().candidatos.filter((c) => c.f === 0).map((c) => [c.p.capital, c.gs, c.pasos]), [[60, 10.01, 0], [70, 9.99, 0]]);
  // si le quita un paso entero (10 de 10), sí gana por aguante aunque le deje menos al dueño…
  w = conGuion(Object.assign({ '60|12': { rv: JUSTA, d: 58, golpes: { lentas: 20 } }, '70|12': { rv: JUSTA, d: 55, golpes: { lentas: 10 } } }, solas));
  r = ronda(w);
  assert.deepEqual([r.resultado, w.palanca('capital', 3)], ['propuesta', 70]);
  assert.match(String(w.campo('que_cambia', 3)), /Con el peor golpe leve \(Ventas 25% más lentas\) le faltarían 10\.0 MDP \(a la V2 le faltarían 20\.0 con Ventas 25% más lentas\)\./);
  assert.equal(elegida(w).pasos, 1);
  // …y por un centavo menos que el paso entero (9.99 de 10), no
  w = conGuion(Object.assign({ '60|12': { rv: JUSTA, d: 58, golpes: { lentas: 20 } }, '70|12': { rv: JUSTA, d: 55, golpes: { lentas: 10.01 } } }, solas));
  assert.equal(ronda(w).resultado, 'sin mejora');
});

test('aguante · una vecina a la que le falta MÁS que a la de partida nunca le gana, aunque le deje más al dueño', () => {
  const solas = { '60|13': NO, '70|13': NO, '80|12': NO, '80|13': NO };
  let w = conGuion(Object.assign({ '60|12': { rv: JUSTA, d: 55, golpes: { lentas: 5 } }, '70|12': { rv: JUSTA, d: 70, golpes: { lentas: 5.5 } } }, solas));
  assert.equal(ronda(w).resultado, 'sin mejora', 'le faltan 0.5 MDP más: no se propone, ni por 15 MDP más para el dueño');
  assert.equal(w.detalle().candidatos.find((c) => c.p.capital === 70 && c.p.obra_inicio === 12).pasos, -1);
  // dentro del margen con que el libro da por cero un faltante (0.01 MDP) cuenta como igual, y entonces sí decide lo del dueño
  w = conGuion(Object.assign({ '60|12': { rv: JUSTA, d: 55, golpes: { lentas: 5 } }, '70|12': { rv: JUSTA, d: 70, golpes: { lentas: 5.005 } } }, solas));
  const r = ronda(w);
  assert.deepEqual([r.resultado, w.palanca('capital', 3)], ['propuesta', 70]);
});

test('aguante · «aguanta» es que con ningún golpe leve le falte dinero, con el margen del libro (0.01 MDP); la que aguanta va primero', () => {
  const solas = { '60|13': NO, '70|13': NO, '80|12': NO, '80|13': NO };
  // a la vecina le faltan 0.005 con un golpe: el libro lo da por cero, así que aguanta y gana aunque le deje menos al dueño
  let w = conGuion(Object.assign({ '60|12': { rv: JUSTA, d: 58, golpes: { 'obra+5': 3 } }, '70|12': { rv: JUSTA, d: 55, golpes: { 'obra+5': 0.005, lentas: 0.009 } } }, solas));
  let r = ronda(w);
  assert.deepEqual([r.resultado, w.palanca('capital', 3)], ['propuesta', 70]);
  assert.match(String(w.campo('que_cambia', 3)), /Con cada golpe leve por separado no le falta dinero \(a la V2 le faltarían 3\.0 con Obra 5% arriba\)\./);
  // con 0.02 ya no aguanta: le quita menos de un paso a la de partida y decide lo del dueño
  w = conGuion(Object.assign({ '60|12': { rv: JUSTA, d: 58, golpes: { 'obra+5': 3 } }, '70|12': { rv: JUSTA, d: 55, golpes: { 'obra+5': 0.02 } } }, solas));
  assert.equal(ronda(w).resultado, 'sin mejora');
  // cuenta el PEOR golpe, no el primero ni la suma: 4 + 4 + 4 no es peor que un solo 9
  w = conGuion(Object.assign({ '60|12': { rv: JUSTA, d: 58, golpes: { 'precio-5': 4, 'obra+5': 4, lentas: 4 } }, '70|12': { rv: JUSTA, d: 70, golpes: { lentas: 9 } } }, solas));
  assert.equal(ronda(w).resultado, 'sin mejora', 'a la vecina le falta más con su peor golpe (9 contra 4)');
  assert.deepEqual(w.detalle().candidatos.filter((c) => c.f === 0).map((c) => [c.gs, c.peor]), [[4, 'precio-5'], [9, 'lentas']]);
});

test('el orden de las reglas 2 a 5: limpia antes que plazo, plazo antes que dinero, dinero (a décimas) antes que capital', () => {
  const PASA = 'Pasa', resto = { '60|13': NO, '70|13': NO, '80|12': NO, '80|13': NO };
  const corre = (base, vecina) => { const w = conGuion(Object.assign({ '60|12': base, '70|12': vecina }, resto)); const r = ronda(w); return r.resultado === 'propuesta' ? w.palanca('capital', 3) : 'sin mejora'; };
  // 2 antes que 3: pasar limpio vale más que no alargar el plazo
  assert.equal(corre({ rv: JUSTA, d: 58, m: 37 }, { rv: PASA, d: 50, m: 40 }), 70);
  // 3 antes que 4: no alargar el plazo vale más que dejarle más al dueño
  assert.equal(corre({ rv: JUSTA, d: 58, m: 37 }, { rv: JUSTA, d: 80, m: 38 }), 'sin mejora');
  assert.equal(corre({ rv: JUSTA, d: 58, m: 37 }, { rv: JUSTA, d: 80, m: 37 }), 70, 'con el mismo plazo, sí');
  assert.equal(corre({ rv: JUSTA, d: 58, m: 37 }, { rv: JUSTA, d: 80, m: 30 }), 70, 'acortar el plazo no estorba');
  // 4 a décimas: 4 centésimas más para el dueño no cuentan (gana la que usa menos capital); una décima sí
  assert.equal(corre({ rv: JUSTA, d: 58, m: 37 }, { rv: JUSTA, d: 58.04, m: 37 }), 'sin mejora');
  assert.equal(corre({ rv: JUSTA, d: 58, m: 37 }, { rv: JUSTA, d: 58.06, m: 37 }), 70);
  // 4 antes que 5: una décima menos para el dueño no se cambia por usar menos capital
  const w = conGuion(Object.assign({ '60|12': { rv: JUSTA, d: 58, m: 37 }, '50|12': { rv: JUSTA, d: 57.9, m: 37 } }, resto, { '70|12': NO }));
  assert.equal(ronda(w).resultado, 'sin mejora');
});

test('la rejilla nunca prueba capital negativo, ni más capital que el disponible', () => {
  const w = preparar();
  w.palanca('capital', 2, 15);                   // con paso 10: 15 − 20 sería −5
  juguete(w.libro);
  const r = ronda(w);
  assert.equal(r.ok, true, JSON.stringify(r));
  const caps = Array.from(new Set(w.detalle().candidatos.map((c) => c.p.capital))).sort((a, b) => a - b);
  assert.deepEqual(caps, [5, 15, 25, 35]);
  const w2 = preparar();
  w2.palanca('capital', 2, 110);                 // disponible 120: 130 no se prueba
  juguete(w2.libro);
  ronda(w2);
  assert.deepEqual(Array.from(new Set(w2.detalle().candidatos.map((c) => c.p.capital))).sort((a, b) => a - b), [90, 100, 110, 120]);
});

test('una versión que Dirección aprobó alguna vez queda limpia al volverse propuesta del plan: sin «aprobada por» ni fecha', () => {
  const w = preparar();
  w.campo('aprobada_por', 3, 'Dirección');
  w.campo('fecha_aprobacion', 3, '2026-01-01');
  const r = ronda(w);
  assert.equal(r.resultado, 'propuesta');
  assert.deepEqual([w.campo('aprobada_por', 3), w.campo('fecha_aprobacion', 3)], ['', '']);
  assert.equal(w.detalle().antes.estado, 'descartada');
});

/* lo guardado de un intento anterior (libro lento) */

test('lo leído en un intento anterior no se usa si cambió algo que entra a las cuentas, aunque la huella de partida sea la misma', () => {
  const w = preparar();
  w.ctx.RONDA.MAX_MS = -1;
  assert.equal(ronda(w).error, 'tiempo');
  assert.equal(ronda(w).error, 'tiempo');
  assert.equal(Object.keys(JSON.parse(w.propiedades.get('g_' + PLAN)).lect).length, 2, 'dos intentos, dos combinaciones leídas');
  // alguien cambia en el libro un dato que no mueve la huella de la versión de partida (aquí, un texto de Datos)
  const datos = w.libro.getSheetByName('Datos'), huella = w.resumen('plan.huella');
  datos.v[filaDe(datos, 'plan.ubicacion') - 1][2] = 'Otra ubicación';
  juguete(w.libro);
  assert.equal(w.resumen('plan.huella'), huella, 'la huella de partida no cambió');
  assert.equal(ronda(w).error, 'tiempo');
  assert.deepEqual(Object.keys(JSON.parse(w.propiedades.get('g_' + PLAN)).lect), ['60|12'], 'empezó de cero: lo guardado ya no valía');
  // lo mismo si lo que cambia es una palanca de la versión de partida, un producto o el esquema de reparto
  for (const cambia of [(x) => { x.palanca('ventas_inicio', 2, 9); }, (x) => { x.libro.getSheetByName('Productos').v[4][1] = 99; }, (x) => { x.libro.getSheetByName('Reparto').v[4][1] = 3; }]) {
    const x = preparar();
    x.ctx.RONDA.MAX_MS = -1;
    ronda(x); ronda(x);
    cambia(x);
    ronda(x);
    assert.deepEqual(Object.keys(JSON.parse(x.propiedades.get('g_' + PLAN)).lect), ['60|12']);
  }
});

test('lo leído en un intento anterior caduca, se borra cuando una persona guarda algo, y no vale si la de partida ya no dice lo mismo', () => {
  const w = preparar();
  w.ctx.RONDA.MAX_MS = -1;
  ronda(w); ronda(w);
  // caduca a las seis horas
  const a = JSON.parse(w.propiedades.get('g_' + PLAN));
  a.t = Date.now() - 7 * 3600000;
  w.propiedades.set('g_' + PLAN, JSON.stringify(a));
  ronda(w);
  assert.deepEqual(Object.keys(JSON.parse(w.propiedades.get('g_' + PLAN)).lect), ['60|12']);
  // una persona guarda cualquier cambio en el plan: lo guardado se tira
  ronda(w);
  assert.equal(Object.keys(JSON.parse(w.propiedades.get('g_' + PLAN)).lect).length, 2);
  assert.equal(w.post({ k: EDITOR, tipo: 'ppp2-candado', plan: PLAN, id: 'agua', estado: 'en revisión' }).ok, true);
  assert.equal(w.propiedades.has('g_' + PLAN), false);
  // si lo guardado de la de partida no es lo que el libro dice hoy de ella, tampoco vale (aunque el sello coincida)
  w.resumen('plan.paso', 'explorar');
  ronda(w); ronda(w);
  const b = JSON.parse(w.propiedades.get('g_' + PLAN));
  b.lect['60|12'][4] = 999;                       // lo que «recibía el dueño» en la de partida
  w.propiedades.set('g_' + PLAN, JSON.stringify(b));
  ronda(w);
  const c = JSON.parse(w.propiedades.get('g_' + PLAN));
  assert.deepEqual(Object.keys(c.lect), ['60|12']);
  assert.notEqual(c.lect['60|12'][4], 999);
});

test('antes de anotar una propuesta se vuelve a leer en el libro: si lo guardado ya no es cierto, no afirma nada', () => {
  // un intento anterior dejó guardado que capital 80 pasaba limpio y aguantaba; el libro de hoy dice otra cosa
  const completo = preparar();
  ronda(completo);
  const w = preparar(), filas = w.ctx.palancasFilas_(w.mod);
  const antes = [w.columna(1), w.columna(2), w.columna(3)], fichas = [w.fichas(1), w.fichas(2), w.fichas(3)];
  const sello = w.ctx.selloEntradas_(w.libro, w.mod, filas, 2);
  const lect = {}, golpes = {};
  completo.detalle().candidatos.forEach((c) => {
    const id = c.p.capital + '|' + c.p.obra_inicio;
    lect[id] = [c.rv, c.f, c.j, c.r, c.d, c.m, c.g, c.a, c.pv];
    if (c.golpes) golpes[id] = Object.fromEntries(Object.entries(c.golpes).map(([k, v]) => [k, [v.r, v.f, v.g]]));
  });
  const guarda = (l, g) => w.propiedades.set('g_' + PLAN, JSON.stringify({ h: w.resumen('plan.huella'), ks: 3, paso: 10, s: sello, t: Date.now(), lect: l, golpes: g }));
  // (a) la lectura guardada de la que se escogería ya no es la del libro
  const falsa = JSON.parse(JSON.stringify(lect));
  falsa['80|12'][4] = 70;                         // «el dueño recibe 70»: mentira vieja
  guarda(falsa, golpes);
  let r = ronda(w);
  assert.deepEqual([r.ok, r.error], [false, 'cambio']);
  assert.deepEqual([w.columna(1), w.columna(2), w.columna(3)], antes, 'nada quedó escrito');
  assert.deepEqual([w.fichas(1), w.fichas(2), w.fichas(3)], fichas);
  assert.equal(w.rondas().length, 0, 'no hay renglón de ronda: no propuso');
  assert.equal(w.propiedades.has('g_' + PLAN), false, 'lo guardado se tiró');
  assert.equal(w.propiedades.has('j_' + PLAN), false);
  // (b) la lectura coincide pero lo guardado de sus golpes no: decía que aguantaba y hoy le falta dinero
  const mentira = JSON.parse(JSON.stringify(golpes));
  mentira['70|12'] = { 'precio-5': [0, 0, 50], 'obra+5': [0, 0, 50], lentas: [0, 0, 50] };   // «capital 70 aguanta todo»
  guarda(lect, mentira);
  r = ronda(w);
  assert.deepEqual([r.ok, r.error], [false, 'cambio'], JSON.stringify(r));
  assert.equal(w.rondas().length, 0);
  assert.deepEqual([w.columna(1), w.columna(2), w.columna(3)], antes);
  // (c) con lo guardado cierto, la ronda termina igual que de corrido
  guarda(lect, golpes);
  r = ronda(w);
  assert.equal(r.resultado, 'propuesta', JSON.stringify(r));
  assert.equal(w.palanca('capital', 3), 80);
  // el latido reintenta pronto después de un «cambio» (dos horas), no cada media hora
  const x = preparar();
  guardarFalso(x, falsa, golpes);
  assert.equal(x.ctx.latido(), 'explorar:p2ejemplo001:cambio');
  assert.equal(x.ctx.latido(), 'nada');
  const espera = JSON.parse(x.propiedades.get('e_' + PLAN));
  assert.ok(espera.hasta - Date.now() > 3600000 && espera.hasta - Date.now() <= 2 * 3600000 + 1000);
});
function guardarFalso(x, lect, golpes) {
  const sello = x.ctx.selloEntradas_(x.libro, x.mod, x.ctx.palancasFilas_(x.mod), 2);
  x.propiedades.set('g_' + PLAN, JSON.stringify({ h: x.resumen('plan.huella'), ks: 3, paso: 10, s: sello, t: Date.now(), lect, golpes }));
}

test('si el libro no se puede leer bajo un golpe, no se toma por «no le falta nada»: la ronda no afirma nada', () => {
  const roto = (i, libro) => {
    juguete(libro);
    const mod = libro.getSheetByName('Modelo'), res = libro.getSheetByName('Resumen');
    const lentas = Number(mod.v[filaDe(mod, 'ventas_meses') - 1][6]) > Number(mod.v[filaDe(mod, 'ventas_meses') - 1][3]);
    if (lentas) res.v[filaDe(res, 'v3.respaldo') - 1][1] = '#REF!';      // con las ventas lentas el libro da un error
  };
  const w = preparar({ alFlush: roto });
  const antes = [w.columna(1), w.columna(2), w.columna(3)], fichas = w.fichas(3);
  const r = ronda(w);
  assert.deepEqual([r.ok, r.error], [false, 'lectura']);
  assert.deepEqual([w.columna(1), w.columna(2), w.columna(3)], antes);
  assert.deepEqual(w.fichas(3), fichas);
  assert.equal(w.rondas().length, 0);
  assert.equal(w.propiedades.size, 0, 'ni diario ni lecturas guardadas');
  // una celda vacía sí es «cero»: el libro deja vacío el faltante cuando no hay
  const vacio = (i, libro) => { juguete(libro); const res = libro.getSheetByName('Resumen'); for (const k of [1, 2, 3]) { const f = filaDe(res, 'v' + k + '.respaldo'); if (res.v[f - 1][1] === 0) res.v[f - 1][1] = ''; } };
  const w2 = preparar({ alFlush: vacio });
  assert.equal(ronda(w2).resultado, 'propuesta');
});

/* de quién es una versión */

test('una propuesta del plan a la que una persona le movió una palanca ya es trabajo de esa persona: el plan no la pisa sin préstamo', () => {
  const w = preparar();
  w.campo('estado', 2, 'vigente');
  let r = ronda(w);                                // el plan propone en la V3
  assert.deepEqual([r.resultado, r.version, w.campo('propuesta_por', 3)], ['propuesta', 3, 'El plan · ronda 1']);
  const del = () => Array.from(w.ctx.delPlan_(w.libro, w.ctx.fichas_(w.ctx.resumen_(w.libro)), w.mod, w.ctx.palancasFilas_(w.mod)));
  assert.deepEqual(del(), [false, false, true]);
  // Dirección retira la propuesta (queda como alterna) y una persona le mueve una palanca a mano
  assert.equal(w.post({ k: ADMIN, tipo: 'ppp2-version', plan: PLAN, version: 3, campos: { estado: 'alterna' } }).ok, true);
  assert.deepEqual(del(), [false, false, true], 'retirada pero intacta: sigue siendo del plan (lugar libre)');
  assert.equal(w.post({ k: EDITOR, tipo: 'ppp2-palanca', plan: PLAN, version: 3, clave: 'ventas_inicio', valor: 5 }).ok, true);
  assert.deepEqual(del(), [false, false, false], 'con una palanca movida a mano ya no es del plan, aunque conserve su firma');
  // el latido no la pisa
  w.resumen('plan.defiende', 2); w.resumen('plan.paso', 'explorar'); juguete(w.libro);
  const antes = w.columna(3);
  assert.equal(w.ctx.latido(), 'explorar:p2ejemplo001:sin_lugar');
  assert.deepEqual(w.columna(3), antes);
  assert.deepEqual(w.leer().ciclo.lugar.presta.map((x) => x.version), [3], 'la página ofrece prestársela');
  // si la persona la regresa a como la dejó el plan, vuelve a ser del plan
  assert.equal(w.post({ k: EDITOR, tipo: 'ppp2-palanca', plan: PLAN, version: 3, clave: 'ventas_inicio', valor: 'base' }).ok, true);
  assert.deepEqual(del(), [false, false, true]);
  // un cambio en los datos mueve los números de la propuesta pero no sus palancas: sigue siendo del plan
  w.libro.getSheetByName('Datos').v[filaDe(w.libro.getSheetByName('Datos'), 'plan.ubicacion') - 1][2] = 'Otra';
  assert.deepEqual(del(), [false, false, true]);
});

test('sólo cuenta como del plan la firma exacta de una ronda que sí propuso en esa versión y que Dirección nunca aprobó', () => {
  const w = preparar({ conservarV3: true });       // V2 propuesta y V3 alterna, las dos de personas
  const del = () => Array.from(w.ctx.delPlan_(w.libro, w.ctx.fichas_(w.ctx.resumen_(w.libro)), w.mod, w.ctx.palancasFilas_(w.mod)));
  assert.deepEqual(del(), [false, false, false]);
  // «El plan B del arquitecto» no es el plan; tampoco una firma parecida sin renglón de ronda
  for (const firma of ['El plan B del arquitecto', 'el plan · ronda 1', 'El plan · ronda 1', 'El plan', 'El plan · ronda 1 (corregida)']) {
    w.campo('propuesta_por', 3, firma);
    assert.deepEqual(del(), [false, false, false], firma);
    assert.equal(ronda(w).error, 'sin_lugar', firma);
  }
  // con su renglón de ronda y sus palancas como las dejó, sí
  const n = firmar(w, 3);
  assert.deepEqual(del(), [false, false, true]);
  // …salvo que esa ronda haya propuesto en otra versión,
  const hr = w.libro.getSheetByName('Rondas');
  hr.v[4 + n - 1][7] = 2;
  assert.deepEqual(del(), [false, false, false]);
  hr.v[4 + n - 1][7] = 3;
  // que haya sido «sin mejora»,
  hr.v[4 + n - 1][6] = 'sin mejora';
  assert.deepEqual(del(), [false, false, false]);
  hr.v[4 + n - 1][6] = 'propuesta';
  // o que Dirección la haya aprobado alguna vez (aunque después dejara de ser la vigente)
  w.campo('aprobada_por', 3, 'Alejandro');
  assert.deepEqual(del(), [false, false, false]);
  w.campo('aprobada_por', 3, '');
  assert.deepEqual(del(), [false, false, true]);
});

test('una vigente nunca se afina en su lugar, aunque la haya propuesto el plan', () => {
  const w = preparar({ conservarV3: true });
  firmar(w, 2, 'vigente');                         // la vigente la propuso el plan y Dirección la aprobó: su firma sigue ahí
  w.campo('aprobada_por', 2, '');                  // ni siquiera si el «aprobada por» se hubiera borrado a mano
  w.resumen('plan.defiende', 2); juguete(w.libro);
  const antes = [w.columna(1), w.columna(2), w.columna(3)];
  assert.deepEqual(Array.from(w.ctx.lugarRonda_(['base', 'vigente', 'alterna'], [false, true, false], 2, 2, true).presta), [3], 'ni prestada');
  assert.equal(w.ctx.lugarRonda_(['base', 'vigente', 'alterna'], [false, true, false], 2, 2, true).ks, 0);
  assert.equal(ronda(w).error, 'sin_lugar');
  assert.equal(ronda(w, ADMIN, { usar: 2 }).error, 'sin_lugar', 'ni Dirección puede prestarle la vigente');
  assert.deepEqual([w.columna(1), w.columna(2), w.columna(3)], antes);
});

/* lo que ve quien no está en el plan */

test('la tarjeta del vivero no enseña como «lo que recibe el dueño» las cifras de una versión que una ronda dejó a medias', () => {
  const w = preparar();
  const tarjeta = () => { w.cache.delete('vivero'); return w.get({ k: LECTOR, recurso: 'ppp2-vivero' }).planes[0]; };
  assert.deepEqual([tarjeta().a_medias, typeof tarjeta().dueno_recibe], [false, 'number']);
  // una ronda escribiendo (o muerta) en la versión que se muestra: la V2
  w.ctx.diarioGuardar_({ plan_id: PLAN }, w.libro, 2, w.ctx.palancasFilas_(w.mod), 2, 'r-en-su-lugar', 1);
  const t = tarjeta();
  assert.deepEqual([t.version, t.a_medias, t.dueno_recibe, t.dueno_meses, t.ganancia, t.revision], [2, true, null, null, null, '']);
  // si la ronda trabaja en OTRA versión, la que se muestra dice la verdad
  w.propiedades.delete('j_' + PLAN);
  w.ctx.diarioGuardar_({ plan_id: PLAN }, w.libro, 3, w.ctx.palancasFilas_(w.mod), 2, 'r-en-la-v3', 1);
  assert.deepEqual([tarjeta().a_medias, typeof tarjeta().dueno_recibe], [false, 'number']);
});

test('la página sólo promete «lo hago solo» si el latido de verdad corre: activo, apagado o sin latido', () => {
  const w = preparar();
  assert.equal(w.leer().ciclo.latido, 'sin latido', 'nadie instaló el activador: nada corre solo');
  w.resumen('plan.paso', 'consejo');
  assert.equal(w.ctx.latido(), 'nada');
  assert.equal(w.leer().ciclo.latido, 'activo');
  w.propiedades.set('latido_t', String(Date.now() - 3 * 3600000));
  assert.equal(w.leer().ciclo.latido, 'sin latido', 'lleva horas sin correr');
  const pausado = preparar({ pausa: 'sí' });
  assert.equal(pausado.ctx.latido(), 'pausa');
  assert.deepEqual([pausado.leer().ciclo.latido, pausado.leer().ciclo.pausa], ['apagado', true]);
  assert.equal(w.leer().ciclo.pausa, false);
  // pedir que investigue no promete una revisión que no existe
  const sin = preparar();
  assert.match(sin.post({ k: EDITOR, tipo: 'ppp2-investigar', plan: PLAN, tema: 'Uso de suelo' }).nota, /Todavía no tengo una revisión programada/);
  const con = preparar({ config: [['revision', 'lunes a viernes, tres veces al día']] });
  assert.match(con.post({ k: EDITOR, tipo: 'ppp2-investigar', plan: PLAN, tema: 'Uso de suelo' }).nota, /en mi siguiente revisión \(lunes a viernes, tres veces al día\)/);
});

/* el latido no insiste ni se queda con un solo plan */

test('si un paso no avanza, el latido lo reintenta al día siguiente y a la tercera deja de insistir hasta que alguien cambie algo', () => {
  const w = preparar();
  w.palanca('capital', 2, 100);
  juguete(w.libro);                                // con el juguete simple el libro sigue en «explorar» después de una ronda sin mejora
  const vencer = () => { const e = JSON.parse(w.propiedades.get('e_' + PLAN)); e.hasta = Date.now() - 1; w.propiedades.set('e_' + PLAN, JSON.stringify(e)); };
  assert.equal(w.ctx.latido(), 'explorar:p2ejemplo001:sin mejora');
  assert.equal(JSON.parse(w.propiedades.get('e_' + PLAN)).n, 1);
  vencer();
  assert.equal(w.ctx.latido(), 'explorar:p2ejemplo001:sin mejora');
  vencer();
  assert.equal(w.ctx.latido(), 'explorar:p2ejemplo001:sin mejora');
  const e = JSON.parse(w.propiedades.get('e_' + PLAN));
  assert.equal(e.n, 3);
  assert.ok(e.hasta - Date.now() > 300 * 24 * 3600000, 'ya no insiste');
  assert.equal(w.rondas().length, 3, 'tres rondas iguales, no una por día para siempre');
  assert.match(String(w.vivero_bitacora()[2][4]), /ya no insisto hasta que alguien cambie algo en el plan/);
  assert.equal(w.ctx.latido(), 'nada');
  // una persona cambia algo: vuelve a mirar, y la cuenta empieza de nuevo
  assert.equal(w.post({ k: EDITOR, tipo: 'ppp2-candado', plan: PLAN, id: 'agua', estado: 'en revisión' }).ok, true);
  w.resumen('plan.paso', 'explorar');
  assert.equal(w.ctx.latido(), 'explorar:p2ejemplo001:sin mejora');
  assert.equal(JSON.parse(w.propiedades.get('e_' + PLAN)).n, 1);
});

test('un plan con el libro lento no acapara el latido: el siguiente latido empieza por el plan que sigue', () => {
  const OTRO = 'p2ejemplo002';
  const w = preparar({ alFlush: () => { juguete(w.libros['libro-ejemplo']); juguete(w.libros['libro-plantilla']); } });
  w.vivero.getSheetByName('Planes').appendRow([OTRO, 'Otro Ejemplo', 'libro-plantilla', 'activo', '2026-01-16', 'Pruebas', '', 'ppp2-libro-v1', '']);
  const otro = w.libros['libro-plantilla'], ver = otro.getSheetByName('Versiones'), res = otro.getSheetByName('Resumen');
  ver.v[filaDe(ver, 'estado') - 1][4] = 'descartada';
  res.v[filaDe(res, 'plan.paso') - 1][1] = 'explorar';
  juguete(otro);
  w.ctx.RONDA.MAX_MS = -1;                         // los dos libros van lentos: cada latido alcanza para una lectura
  const quien = () => w.ctx.latido().split(':')[1];
  assert.deepEqual([quien(), quien(), quien(), quien()], [PLAN, OTRO, PLAN, OTRO]);
  assert.equal(Object.keys(JSON.parse(w.propiedades.get('g_' + PLAN)).lect).length, 2);
  assert.equal(Object.keys(JSON.parse(w.propiedades.get('g_' + OTRO)).lect).length, 2);
});

/* endurecimientos del diario */

test('un request_id repetido no hace pasar por anotada a una ronda que murió: el diario lleva el número de su ronda', () => {
  const w = preparar();
  w.campo('estado', 2, 'vigente');
  const r = w.post({ k: EDITOR, tipo: 'ppp2-ronda', plan: PLAN, request_id: 'repetido-1' });
  assert.deepEqual([r.ok, r.ronda], [true, 1]);
  // mucho después, otra ronda con el MISMO request_id muere a medias sobre la V3
  const antesV3 = w.columna(3);
  w.ctx.diarioGuardar_({ plan_id: PLAN }, w.libro, 3, w.ctx.palancasFilas_(w.mod), 2, 'repetido-1', 2);
  w.palanca('capital', 3, 999);
  assert.equal(w.ctx.rondaAnotada_(w.libro, 'repetido-1', 1), true);
  assert.equal(w.ctx.rondaAnotada_(w.libro, 'repetido-1', 2), false, 'la ronda 2 no está anotada aunque el request_id sí aparezca');
  assert.equal(w.ctx.recuperar_({ plan_id: PLAN }, w.libro), true);
  assert.deepEqual(w.columna(3), antesV3, 'se restauró');
});

test('la reparación de una ronda interrumpida la anota el sistema, no quien la disparó (que pudo ser alguien que sólo lee)', () => {
  const w = preparar();
  const antesV3 = w.columna(3);
  w.ctx.diarioGuardar_({ plan_id: PLAN }, w.libro, 3, w.ctx.palancasFilas_(w.mod), 2, 'r-muerta', 1);
  w.palanca('capital', 3, 999);
  const r = w.post({ k: LECTOR, tipo: 'ppp2-candado', plan: PLAN, id: 'agua', estado: 'en revisión' });
  assert.deepEqual([r.ok, r.error, r.recuperado], [false, 'revision', true]);
  assert.deepEqual(w.columna(3), antesV3);
  const bit = w.libro.getSheetByName('Bitácora'), ultima = bit.v[bit.getLastRow() - 1];
  assert.match(String(ultima[2]), /como estaba antes de una ronda que se interrumpió/);
  assert.equal(ultima[1], 'El plan (servidor)');
});

test('el motivo de la ronda dice que el consejo «regresó» la versión sólo si la sesión completa no la aprobó', () => {
  const corre = (ses, aprueban, votaron, aprobada, estadoBase) => {
    const w = preparar();
    if (estadoBase) { w.campo('estado', 2, 'alterna'); w.campo('estado', 1, 'base'); w.resumen('plan.defiende', 1); w.palanca('capital', 1, 60); w.palanca('obra_inicio', 1, 12); juguete(w.libro); }
    w.resumen('plan.consejo_sesion', ses); w.resumen('plan.consejo_aprueban', aprueban); w.resumen('plan.consejo_votaron', votaron); w.resumen('plan.consejo_aprobada', aprobada);
    const r = ronda(w);
    assert.equal(r.ok, true, JSON.stringify(r));
    return String(w.rondas()[0][5]);
  };
  assert.equal(corre('CP-1', 2, 7, false), 'El consejo (CP-1) regresó la V2: aprueban 2 de 7');
  assert.equal(corre('', 0, 0, false), 'Siguiente paso del plan');
  assert.equal(corre('CP-1', 7, 7, true, true), 'Primera exploración desde la base', 'una base que el consejo aprobó sin haber explorado: no «la regresó»');
  assert.equal(corre('CP-1', 3, 4, false), 'Siguiente paso del plan', 'una sesión incompleta no regresa nada');
});

test('el renglón de la ronda se manda escribir al libro antes de retirar el diario', () => {
  let flushes = 0, alAnotar = -1, alRetirar = -1;
  const w = preparar({ alFlush: (i, libro) => { flushes = i; juguete(libro); } });
  const hr = w.ctx.rondasHoja_(w.libro), anotar = hr.appendRow.bind(hr);
  hr.appendRow = (f) => { alAnotar = flushes; return anotar(f); };
  const props = w.ctx.PropertiesService.getScriptProperties(), borrar = props.deleteProperty;
  w.ctx.PropertiesService.getScriptProperties = () => Object.assign({}, props, { deleteProperty: (k) => { if (k === 'j_' + PLAN && alAnotar >= 0 && alRetirar < 0) alRetirar = flushes; return borrar(k); } });
  const r = ronda(w);
  assert.equal(r.resultado, 'propuesta', JSON.stringify(r));
  assert.ok(alAnotar >= 0 && alRetirar > alAnotar, 'entre anotar la ronda y retirar el diario el libro se guardó (anotar ' + alAnotar + ', retirar ' + alRetirar + ')');
});
