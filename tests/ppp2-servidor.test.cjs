'use strict';
/* Pruebas del servidor de PPP 2 (server/ppp2/PPP2.gs) con dobles de Apps Script.
   El mundo de prueba vive en tests/ppp2-mundo.cjs. Nada aquí habla con Google ni con el Portero real. */
const test = require('node:test');
const assert = require('node:assert/strict');
const { mundo, PLAN, ADMIN, EDITOR, LECTOR, filaDe, CODIGO } = require('./ppp2-mundo.cjs');

/* ── pruebas ── */
test('ppp2-meta responde sin sesión y no llama al Portero', () => {
  const w = mundo();
  const r = w.get({ recurso: 'ppp2-meta' });
  assert.equal(r.ok, true);
  assert.equal(r.servicio, 'ppp2');
  assert.equal(w.llamadas.length, 0);
});

test('sin sesión, con liga inválida o sin el tablero PT no se entra', () => {
  const w = mundo();
  assert.equal(w.get({ recurso: 'ppp2-vivero' }).error, 'sin_sesion');
  assert.equal(w.get({ recurso: 'ppp2-vivero', k: 'syzzzzzzzzzzzzzzzzzzzzzz' }).error, 'liga');
  assert.equal(w.get({ recurso: 'ppp2-vivero', k: 'syotroboard0000000000000' }).error, 'board');
});

test('el canje pide board=PT al Portero original y queda en caché', () => {
  const w = mundo();
  w.get({ recurso: 'ppp2-vivero', k: LECTOR });
  w.get({ recurso: 'ppp2-vivero', k: LECTOR });
  assert.equal(w.llamadas.length, 1);
  assert.match(w.llamadas[0], /ORIGINAL123\/exec\?recurso=canje&t=sylector/);
  assert.match(w.llamadas[0], /&board=PT$/);
});

test('si el original falla en esa llamada se usa el respaldo, y no se guarda como destino', () => {
  const w = mundo({ originalCaido: true });
  const r = w.get({ recurso: 'ppp2-vivero', k: EDITOR });
  assert.equal(r.ok, true);
  assert.deepEqual(w.llamadas.map((u) => (u.includes('ORIGINAL') ? 'o' : 'r')), ['o', 'r']);
  const cfg = w.vivero.getSheetByName('Config').v.find((f) => f[0] === 'portero_original');
  assert.match(cfg[1], /ORIGINAL123/);
});

test('el vivero lista el plan con lo que recibe el dueño', () => {
  const w = mundo();
  const r = w.get({ recurso: 'ppp2-vivero', k: LECTOR });
  assert.equal(r.ok, true);
  assert.equal(r.planes.length, 1);
  const p = r.planes[0];
  assert.equal(p.nombre, 'Proyecto Ejemplo');
  assert.equal(p.version, 2);
  assert.equal(typeof p.dueno_recibe, 'number');
  assert.ok(p.dueno_recibe > 0);
  assert.equal(r.puede.editar, false);
});

test('el plan trae datos, versiones, palancas, preguntas y la serie del flujo', () => {
  const w = mundo();
  const r = w.get({ recurso: 'ppp2-plan', plan: PLAN, k: LECTOR });
  assert.equal(r.ok, true);
  assert.ok(r.datos.find((d) => d.clave === 'tierra.valor' && d.estado === 'en conflicto'));
  assert.equal(r.versiones.length, 3);
  assert.equal(r.versiones[1].estado, 'propuesta');
  assert.ok(r.palancas.find((p) => p.clave === 'obra_inicio' && p.v[1] === 12));
  assert.ok(r.palancas.find((p) => p.clave === 'ventas' && p.calculado));
  assert.equal(r.preguntas.length, 96);
  assert.equal(r.series[2].mes.length, 60);
  assert.equal(r.series[1].ajeno.length, 60);
  assert.equal(r.libro_url, '', 'sólo Dirección ve la liga al libro');
  assert.ok(r.escenarios.length >= 10);
});

test('un plan inexistente o con id malformado se rechaza', () => {
  const w = mundo();
  assert.equal(w.get({ recurso: 'ppp2-plan', plan: 'p2noexiste0', k: LECTOR }).error, 'plan');
  assert.equal(w.get({ recurso: 'ppp2-plan', plan: '../../x', k: LECTOR }).error, 'plan');
});

test('quien sólo lee no puede escribir', () => {
  const w = mundo();
  const r = w.post({ k: LECTOR, tipo: 'ppp2-dato', plan: PLAN, clave: 'din.capital', valor: 90 });
  assert.equal(r.error, 'permiso');
});

test('cambiar un dato lo escribe con fuente, quién y fecha, y deja renglón en la bitácora', () => {
  const w = mundo();
  const datos = w.libro.getSheetByName('Datos'), bit = w.libro.getSheetByName('Bitácora');
  const antes = bit.getLastRow();
  const r = w.post({ k: EDITOR, tipo: 'ppp2-dato', plan: PLAN, clave: 'din.capital', valor: 95, estado: 'confirmado', fuente: 'Carta del inversionista', request_id: 'rq-1', rev: 1 });
  assert.equal(r.ok, true, JSON.stringify(r));
  const f = filaDe(datos, 'din.capital');
  assert.equal(datos.v[f - 1][2], 95);
  assert.equal(datos.v[f - 1][4], 'confirmado');
  assert.equal(datos.v[f - 1][5], 'Carta del inversionista');
  assert.equal(datos.v[f - 1][7], 'Editora Prueba');
  assert.equal(bit.getLastRow(), antes + 1);
  assert.equal(bit.v[bit.getLastRow() - 1][9], 'rq-1');
  assert.equal(r.rev, 2);
});

test('valores fuera de rango, claves inventadas y estados raros se rechazan', () => {
  const w = mundo();
  assert.equal(w.post({ k: EDITOR, tipo: 'ppp2-dato', plan: PLAN, clave: 'cob.enganche', valor: 30 }).error, 'valor');
  assert.equal(w.post({ k: EDITOR, tipo: 'ppp2-dato', plan: PLAN, clave: 'cal.obra_inicio', valor: 7.5 }).error, 'valor');
  assert.equal(w.post({ k: EDITOR, tipo: 'ppp2-dato', plan: PLAN, clave: 'hack.formula', valor: 1 }).error, 'clave');
  assert.equal(w.post({ k: EDITOR, tipo: 'ppp2-dato', plan: PLAN, clave: 'din.capital', valor: 1, estado: 'inventado' }).error, 'estado');
  assert.equal(w.post({ k: EDITOR, tipo: 'ppp2-borrar', plan: PLAN }).error, 'tipo');
});

test('una revisión vieja no sobrescribe trabajo de otro', () => {
  const w = mundo();
  assert.equal(w.post({ k: EDITOR, tipo: 'ppp2-dato', plan: PLAN, clave: 'din.capital', valor: 90, rev: 1 }).ok, true);
  const r = w.post({ k: EDITOR, tipo: 'ppp2-dato', plan: PLAN, clave: 'din.capital', valor: 80, rev: 1 });
  assert.equal(r.error, 'revision');
  assert.equal(r.rev, 2);
});

test('el mismo request_id no escribe dos veces', () => {
  const w = mundo();
  const bit = w.libro.getSheetByName('Bitácora');
  const b = { k: EDITOR, tipo: 'ppp2-dato', plan: PLAN, clave: 'din.capital', valor: 91, request_id: 'rq-dup' };
  const a = w.post(b), c = w.post(b);
  assert.deepEqual(a, c);
  assert.equal(bit.getLastRow(), 6);
});

test('una palanca de versión se escribe, vuelve a la base y no toca renglones calculados', () => {
  const w = mundo();
  const mod = w.libro.getSheetByName('Modelo');
  const f = filaDe(mod, 'obra_inicio');
  assert.equal(w.post({ k: EDITOR, tipo: 'ppp2-palanca', plan: PLAN, version: 3, clave: 'obra_inicio', valor: 10 }).ok, true);
  assert.equal(mod.v[f - 1][6], 10);
  assert.equal(w.post({ k: EDITOR, tipo: 'ppp2-palanca', plan: PLAN, version: 3, clave: 'obra_inicio', valor: null }).ok, true);
  assert.equal(mod.getRange(f, 7).getFormula(), '=$D' + f);
  assert.equal(w.post({ k: EDITOR, tipo: 'ppp2-palanca', plan: PLAN, version: 2, clave: 'ventas', valor: 1 }).error, 'calculado');
  assert.equal(w.post({ k: EDITOR, tipo: 'ppp2-palanca', plan: PLAN, version: 2, clave: 'usa_banco', valor: 2 }).error, 'valor');
});

test('sólo Dirección vuelve vigente una versión; la vigente anterior pasa a alterna', () => {
  const w = mundo();
  const ver = w.libro.getSheetByName('Versiones');
  const fe = filaDe(ver, 'estado');
  assert.equal(w.post({ k: EDITOR, tipo: 'ppp2-version', plan: PLAN, version: 2, campos: { estado: 'vigente' } }).error, 'permiso');
  assert.equal(w.post({ k: ADMIN, tipo: 'ppp2-version', plan: PLAN, version: 2, campos: { estado: 'vigente' }, razon: 'Pasa la revisión' }).ok, true);
  assert.equal(ver.v[fe - 1][3], 'vigente');
  assert.equal(ver.v[filaDe(ver, 'aprobada_por') - 1][3], 'Admin Prueba');
  assert.equal(w.post({ k: ADMIN, tipo: 'ppp2-version', plan: PLAN, version: 3, campos: { estado: 'vigente' } }).ok, true);
  assert.equal(ver.v[fe - 1][3], 'alterna');
  assert.equal(ver.v[fe - 1][4], 'vigente');
  assert.equal(w.post({ k: EDITOR, tipo: 'ppp2-palanca', plan: PLAN, version: 3, clave: 'capital', valor: 70 }).error, 'vigente');
  assert.equal(w.post({ k: EDITOR, tipo: 'ppp2-version', plan: PLAN, version: 3, campos: { estado: 'descartada' } }).error, 'permiso');
});

test('responder exige respuesta; «no se sabe» y «investígalo tú» quedan registrados', () => {
  const w = mundo();
  const pq = w.libro.getSheetByName('Preguntas');
  assert.equal(w.post({ k: EDITOR, tipo: 'ppp2-responder', plan: PLAN, pregunta: 'M03.Q01', estado: 'respondida', respuesta: '' }).error, 'respuesta');
  assert.equal(w.post({ k: EDITOR, tipo: 'ppp2-responder', plan: PLAN, pregunta: 'M03.Q01', estado: 'no se sabe' }).ok, true);
  assert.equal(pq.v[filaDe(pq, 'M03.Q01') - 1][6], 'no se sabe');
  const r = w.post({ k: EDITOR, tipo: 'ppp2-investigar', plan: PLAN, pregunta: 'M05.Q02', tema: 'Factibilidad de agua', detalle: 'Buscar el trámite' });
  assert.equal(r.ok, true);
  assert.equal(pq.v[filaDe(pq, 'M05.Q02') - 1][6], 'investigando');
  const ped = w.vivero.getSheetByName('Pedidos');
  assert.equal(ped.v[1][1], PLAN);
  assert.equal(ped.v[1][7], 'pendiente');
});

test('un candado sólo se cierra con evidencia', () => {
  const w = mundo();
  assert.equal(w.post({ k: EDITOR, tipo: 'ppp2-candado', plan: PLAN, id: 'agua', estado: 'cerrado' }).error, 'evidencia');
  assert.equal(w.post({ k: EDITOR, tipo: 'ppp2-candado', plan: PLAN, id: 'agua', estado: 'cerrado', evidencia: 'Factibilidad folio X' }).ok, true);
});

test('las pruebas de estrés sólo tocan la columna Prueba y la dejan como estaba', () => {
  const w = mundo();
  const mod = w.libro.getSheetByName('Modelo'), pru = w.libro.getSheetByName('Pruebas');
  const formulasAntes = Object.entries(mod.f).filter(([k]) => k.endsWith(',8'));
  const b4 = pru.getRange('B4').getFormula();
  const r = w.post({ k: EDITOR, tipo: 'ppp2-estres', plan: PLAN, version: 2 });
  assert.equal(r.ok, true, JSON.stringify(r));
  assert.ok(r.resultados.length >= 11);
  for (const [k, f] of formulasAntes) assert.equal(mod.f[k], f, 'la columna Prueba se restablece en ' + k);
  assert.equal(pru.getRange('B4').getFormula(), b4);
  assert.equal(pru.v[13][0], 'Base de la versión 2');
  for (const col of [4, 5, 6]) {
    const vers = mod.v.map((fila) => fila[col]);
    assert.ok(vers.length > 0);
  }
});

test('sembrar copia la plantilla, escribe la identidad y lo anota en el vivero', () => {
  const w = mundo();
  const r = w.post({ k: EDITOR, tipo: 'ppp2-sembrar', nombre: 'Lote de prueba', ubicacion: 'Calle Falsa 123', objetivo: 'Probar', terreno_m2: 1200 });
  assert.equal(r.ok, true, JSON.stringify(r));
  assert.match(r.plan_id, /^p2[a-z0-9]{10}$/);
  const planes = w.vivero.getSheetByName('Planes').v;
  assert.equal(planes[2][0], r.plan_id);
  const libro = w.libros[planes[2][2]];
  const datos = libro.getSheetByName('Datos');
  assert.equal(datos.v[filaDe(datos, 'plan.nombre') - 1][2], 'Lote de prueba');
  assert.equal(datos.v[filaDe(datos, 'terreno.m2') - 1][2], 1200);
  assert.equal(w.post({ k: LECTOR, tipo: 'ppp2-sembrar', nombre: 'No' }).error, 'permiso');
});

test('con la pausa puesta el servidor sólo lee', () => {
  const w = mundo({ pausa: 'sí' });
  assert.equal(w.get({ recurso: 'ppp2-vivero', k: EDITOR }).ok, true);
  assert.equal(w.post({ k: EDITOR, tipo: 'ppp2-dato', plan: PLAN, clave: 'din.capital', valor: 1 }).error, 'pausa');
});

test('el código del servidor no calcula finanzas ni trae datos de tratos', () => {
  assert.doesNotMatch(CODIGO, /AKfycb/, 'sin /exec escritos en el código: viven en la hoja Config');
  assert.doesNotMatch(CODIGO, /Mor[eé]o|Avermont|Morelos/i);
  assert.doesNotMatch(CODIGO, /\bNPV\b|\bIRR\b|TIR\s*\(/);
});
