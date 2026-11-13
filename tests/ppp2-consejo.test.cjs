'use strict';
/* El consejo de planes y la investigación por API (server/ppp2/PPP2.gs, «el consejo y la investigación, por API»).
   La API de IA es de juguete (tests/ppp2-mundo.cjs, jueces): nada sale a la red y el plan es INVENTADO. */
const test = require('node:test');
const assert = require('node:assert/strict');
const { mundo, enConsejo, jueces, JUECES, PLAN, ADMIN, EDITOR, LECTOR, filaDe, RAZON_PRUEBA } = require('./ppp2-mundo.cjs');

const CLAVE = 'sk-ant-prueba-0000000000';
const aprueba = { voto: 'aprueba', razon: 'Pasa la revisión para fondos y con cada golpe leve no le falta dinero según el libro.', condicion: '' };
const consejo = (w) => w.libro.getSheetByName('Consejo').v.slice(4).filter((f) => f.some((x) => x !== '' && x !== null && x !== undefined));
const bitacora = (w) => w.libro.getSheetByName('Bitácora').v.slice(4).filter((f) => f[0]);
const plan = (w, k) => w.get({ recurso: 'ppp2-plan', plan: PLAN, k: k || EDITOR });
const convoca = (w, k) => w.post({ tipo: 'ppp2-consejo', plan: PLAN, k: k || EDITOR, request_id: 'cons-' + Math.random() });

test('sin clave de la API el consejo no se convoca, la página lo sabe y no se llama a nadie', () => {
  const w = enConsejo({ ia: jueces() });
  assert.equal(plan(w).ciclo.ia, 'sin_clave');
  assert.equal(plan(w).ciclo.ia_busca, false);
  assert.deepEqual(convoca(w), { ok: false, error: 'sin_clave' });
  assert.equal(w.iaPedidos.length, 0);
  assert.equal(consejo(w).length, 0);
});

test('con la clave, los siete jueces votan por separado y la sesión queda completa con la huella y la evidencia', () => {
  const votos = {};
  JUECES.slice(0, 5).forEach((j) => { votos[j] = aprueba; });
  const w = enConsejo({ ia: jueces(votos) });
  w.propiedades.set('ANTHROPIC_API_KEY', CLAVE);
  const antes = plan(w);
  assert.equal(antes.ciclo.ia, 'listo');
  const huella = w.lee('plan.huella'), evid = w.lee('plan.evidencia');
  const r = convoca(w);
  assert.equal(r.ok, true, JSON.stringify(r));
  assert.deepEqual([r.sesion, r.version, r.aprueban, r.vetos, r.resultado], ['CP-1', 2, 5, 0, 'aprobada']);
  assert.match(r.nota, /El consejo votó mi V2 \(sesión CP-1\): aprueban 5 de 7\. Me aprueba: ahora Dirección decide si quedo vigente\./);
  // siete pedidos, uno por juez, cada uno con su oficio; la clave sólo en la cabecera, nunca en lo que se manda
  assert.equal(w.iaPedidos.length, 7);
  const nombres = w.iaPedidos.map((p) => /Eres «([^»]+)»/.exec(p.cuerpo.system)[1]);
  assert.deepEqual(nombres.slice().sort(), JUECES.slice().sort());
  for (const p of w.iaPedidos) {
    assert.equal(p.url, 'https://api.anthropic.com/v1/messages');
    assert.equal(p.headers['x-api-key'], CLAVE);
    assert.ok(!p.crudo.includes(CLAVE), 'la clave no viaja en el cuerpo');
    assert.equal(p.cuerpo.model, 'claude-sonnet-5-5');
    assert.deepEqual(p.cuerpo.tool_choice, { type: 'tool', name: 'votar' });
    const enumVoto = p.cuerpo.tools[0].input_schema.properties.voto.enum;
    assert.deepEqual(enumVoto, /Alejandro virtual/.test(p.cuerpo.system) ? ['aprueba', 'regresa', 'veto'] : ['aprueba', 'regresa'], 'sólo Alejandro virtual puede vetar');
    const texto = p.cuerpo.messages[0].content[0].text;
    assert.match(texto, /Vota sobre la V2\.$/);
    const exp = JSON.parse(texto.slice(texto.indexOf('{'), texto.lastIndexOf('}') + 1));
    assert.equal(exp.plan.defiende, 'V2');
    assert.ok(exp.version.length > 10, 'lleva lo que el libro calculó para la versión');
    assert.equal(exp.pruebas_de_estres.length, 1, 'sólo las pruebas de estos mismos números');
    assert.ok(Array.isArray(exp.candados) && Array.isArray(exp.datos));
  }
  // la sesión en el libro: siete renglones, la huella y la evidencia del Resumen, y la bitácora
  const filas = consejo(w);
  assert.equal(filas.length, 7);
  assert.ok(filas.every((f) => f[1] === 'CP-1' && f[2] === 'V2' && f[7] === huella && f[8] === evid && f[0] === '2026-11-12'));
  assert.deepEqual(filas.map((f) => f[3]), JUECES);
  assert.equal(filas.filter((f) => f[4] === 'aprueba').length, 5);
  const b = bitacora(w).pop();
  assert.equal(b[1], 'Editora Prueba');
  assert.match(b[2], /Convocó al consejo · sesión CP-1 sobre la V2: aprueban 5 de 7; la aprueba/);
  assert.match(b[7], /Siete jueces por API \(anthropic · claude-sonnet-5-5\)/);
  assert.ok(!JSON.stringify(w.libro.getSheetByName('Bitácora').v).includes(CLAVE), 'la clave nunca va a la bitácora');
  // el libro ya dice el paso siguiente: Dirección decide
  assert.equal(w.lee('plan.paso'), 'direccion');
  assert.equal(plan(w).ciclo.aprueban, 5);
});

test('si la regresan, el plan vuelve a explorar; la siguiente sesión se llama CP-2', () => {
  const w = enConsejo({ ia: jueces({ 'Desarrollador-financiero': aprueba }) });
  w.propiedades.set('ANTHROPIC_API_KEY', CLAVE);
  const r = convoca(w);
  assert.deepEqual([r.ok, r.aprueban, r.resultado], [true, 1, 'regresada']);
  assert.match(r.nota, /Me la regresa: sus razones y lo que pide quedaron en «Mis rondas»\./);
  assert.equal(w.lee('plan.paso'), 'explorar');
  // cambia la evidencia (una pregunta respondida): toca otra sesión, con nombre nuevo
  const res = w.libro.getSheetByName('Resumen');
  res.v[filaDe(res, 'plan.evidencia') - 1][1] = 'c0_d2_h0_p2';
  w.libro.getSheetByName('Rondas').appendRow([1, '2026-11-12 10:00', 'El plan (servidor)', 2, w.lee('plan.huella'), 'regresada', 'sin mejora', '', '', 'nada mejor', 15, '{}', '']);
  w.ctx.SpreadsheetApp.flush();
  assert.equal(w.lee('plan.paso'), 'consejo');
  const r2 = convoca(w);
  assert.equal(r2.sesion, 'CP-2');
  assert.equal(consejo(w).filter((f) => f[1] === 'CP-2' && f[8] === 'c0_d2_h0_p2').length, 7);
});

test('a quien no contesta bien se le pregunta una vez más; si sigue sin contestar no se escribe nada', () => {
  let veces = 0;
  const w = enConsejo({ ia: jueces({ Hormozi: () => (++veces === 1 ? { codigo: 529, cuerpo: 'saturado' } : aprueba) }) });
  w.propiedades.set('ANTHROPIC_API_KEY', CLAVE);
  const r = convoca(w);
  assert.equal(r.ok, true);
  assert.equal(veces, 2);
  assert.equal(w.iaPedidos.length, 8, 'siete pedidos y uno más para el que falló');

  const w2 = enConsejo({ ia: jueces({ Hormozi: { voto: 'regresa', razon: 'corta', condicion: '' } }) });
  w2.propiedades.set('ANTHROPIC_API_KEY', CLAVE);
  assert.deepEqual(convoca(w2), { ok: false, error: 'consejo_incompleto' });
  assert.equal(consejo(w2).length, 0, '«no contestó» nunca es «aprobado»: una sesión sólo vale completa');
  assert.ok(!bitacora(w2).some((f) => /Convocó al consejo/.test(f[2])));
  assert.equal(w2.lee('plan.paso'), 'consejo');
});

test('sólo Alejandro virtual veta: el veto de otro juez no cuenta como voto', () => {
  const w = enConsejo({ ia: jueces({ 'Broker de campo': { voto: 'veto', razon: 'Los precios no tienen comparables cerrados en la zona.', condicion: 'Comparables.' } }) });
  w.propiedades.set('ANTHROPIC_API_KEY', CLAVE);
  assert.deepEqual(convoca(w), { ok: false, error: 'consejo_incompleto' });
  const w2 = enConsejo({ ia: jueces({ 'Alejandro virtual': { voto: 'veto', razon: 'El candado de tenencia está reprobado: el predio tiene un litigio.', condicion: 'Resolver el litigio.' } }) });
  w2.propiedades.set('ANTHROPIC_API_KEY', CLAVE);
  const r = convoca(w2);
  assert.deepEqual([r.ok, r.vetos, r.resultado], [true, 1, 'veto']);
});

test('una clave rechazada (401) no escribe nada y lo dice', () => {
  const w = enConsejo({ ia: () => ({ codigo: 401, cuerpo: { error: { message: 'invalid x-api-key', cuenta: 'datos de la cuenta' } } }) });
  w.propiedades.set('ANTHROPIC_API_KEY', CLAVE);
  assert.deepEqual(convoca(w), { ok: false, error: 'ia_clave' });
  assert.equal(consejo(w).length, 0);
  assert.ok(!JSON.stringify(w.libro.getSheetByName('Bitácora').v).includes('datos de la cuenta'), 'el texto de error del proveedor no se guarda');
  const w2 = enConsejo({ ia: () => ({ codigo: 503, cuerpo: 'caído' }) });
  w2.propiedades.set('ANTHROPIC_API_KEY', CLAVE);
  assert.deepEqual(convoca(w2), { ok: false, error: 'ia' });
});

test('si el libro cambia mientras votan, los votos ya no son de estos números y no se escriben', () => {
  const w = enConsejo({
    ia: jueces({}, { alContestar: ({ n }) => { if (n === 7) { const res = w.libro.getSheetByName('Resumen'); res.v[filaDe(res, 'plan.evidencia') - 1][1] = 'c1_d2_h0_p1'; } } })
  });
  w.propiedades.set('ANTHROPIC_API_KEY', CLAVE);
  assert.deepEqual(convoca(w), { ok: false, error: 'cambio' });
  assert.equal(consejo(w).length, 0);
});

test('el consejo sólo se convoca cuando el libro dice que toca, y sólo quien edita lo convoca', () => {
  const w = enConsejo({ ia: jueces() });
  w.propiedades.set('ANTHROPIC_API_KEY', CLAVE);
  assert.deepEqual(convoca(w, LECTOR), { ok: false, error: 'permiso' });
  assert.equal(convoca(w, ADMIN).ok, true);
  assert.deepEqual(convoca(w), { ok: false, error: 'paso' }, 'ya votaron sobre estos números: no toca otra sesión');
  assert.equal(w.iaPedidos.length, 7);
});

test('sin pruebas de estos mismos números no hay consejo', () => {
  const w = enConsejo({ ia: jueces() });
  w.propiedades.set('ANTHROPIC_API_KEY', CLAVE);
  const res = w.libro.getSheetByName('Resumen');
  // el libro dice «consejo» pero las pruebas son de otra huella: el servidor no lo convoca
  w.libro.getSheetByName('Pruebas').v[13][10] = 'h-otra';
  res.v[filaDe(res, 'plan.paso') - 1][1] = 'consejo';
  w.ctx.SpreadsheetApp.flush = () => {};
  assert.deepEqual(convoca(w), { ok: false, error: 'sin_pruebas' });
});

test('un texto del juez que empieza con «=» se guarda como texto, no como fórmula', () => {
  const w = enConsejo({ ia: jueces({ Hormozi: { voto: 'regresa', razon: '=IMPORTXML("http://x") no hay oferta para el comprador de locales ni de suites.', condicion: '@todos' } }) });
  w.propiedades.set('ANTHROPIC_API_KEY', CLAVE);
  assert.equal(convoca(w).ok, true);
  const f = consejo(w).find((x) => x[3] === 'Hormozi');
  assert.ok(f[5].startsWith("'="));
  assert.ok(f[6].startsWith("'@"));
});

test('con la clave de OpenAI (o si Config lo pide) el consejo va por OpenAI con salida estructurada', () => {
  const w = enConsejo({ ia: jueces({ Hormozi: aprueba }), config: [['consejo_motor', 'openai'], ['consejo_modelo', 'gpt-de-prueba']] });
  w.propiedades.set('OPENAI_API_KEY', 'sk-openai-prueba');
  const r = convoca(w);
  assert.equal(r.ok, true, JSON.stringify(r));
  assert.equal(r.motor, 'openai · gpt-de-prueba');
  const p = w.iaPedidos[0];
  assert.equal(p.url, 'https://api.openai.com/v1/responses');
  assert.equal(p.headers.Authorization, 'Bearer sk-openai-prueba');
  assert.equal(p.cuerpo.text.format.type, 'json_schema');
  assert.equal(p.cuerpo.text.format.strict, true);
  assert.equal(p.cuerpo.store, false);
  assert.equal(consejo(w).filter((f) => f[4] === 'aprueba').length, 1);
  // Config pide OpenAI pero sólo hay clave de Anthropic: va por Anthropic con su modelo de siempre (no el de OpenAI)
  const w2 = enConsejo({ ia: jueces(), config: [['consejo_motor', 'openai'], ['consejo_modelo', 'gpt-de-prueba']] });
  w2.propiedades.set('ANTHROPIC_API_KEY', CLAVE);
  assert.equal(convoca(w2).motor, 'anthropic · claude-sonnet-5-5');
});

test('si el servicio de Google truena al pedir todos a la vez, los pide uno por uno', () => {
  const w = enConsejo({ ia: jueces(), fetchAllTruena: true });
  w.propiedades.set('ANTHROPIC_API_KEY', CLAVE);
  assert.equal(convoca(w).ok, true);
  assert.equal(w.iaPedidos.length, 7);
});

test('Config!consejo = no apaga el consejo y la investigación por API', () => {
  const w = enConsejo({ ia: jueces(), config: [['consejo', 'no']] });
  w.propiedades.set('ANTHROPIC_API_KEY', CLAVE);
  assert.equal(plan(w).ciclo.ia, 'apagado');
  assert.equal(plan(w).ciclo.ia_busca, false);
  assert.deepEqual(convoca(w), { ok: false, error: 'apagado' });
  assert.equal(w.iaPedidos.length, 0);
});

test('el latido convoca solo al consejo cuando toca; con consejo_latido = no, no', () => {
  const w = enConsejo({ ia: jueces() });
  w.propiedades.set('ANTHROPIC_API_KEY', CLAVE);
  w.propiedades.set('latido_t', String(Date.now()));
  assert.equal(plan(w).ciclo.consejo_solo, true);
  const hecho = w.ctx.latido();
  assert.equal(hecho, 'consejo:' + PLAN + ':regresada');
  assert.equal(consejo(w).length, 7);
  const viv = w.vivero.getSheetByName('Bitácora').v.slice(1).filter((f) => f[0]).pop();
  assert.deepEqual([viv[2], viv[6]], ['latido · consejo', 'ok']);
  assert.match(viv[4], /aprueban 0 de 7/);
  assert.equal(bitacora(w).pop()[1], 'El plan (servidor)', 'en el libro queda que lo convocó el plan');

  const w2 = enConsejo({ ia: jueces(), config: [['consejo_latido', 'no']] });
  w2.propiedades.set('ANTHROPIC_API_KEY', CLAVE);
  w2.propiedades.set('latido_t', String(Date.now()));
  assert.equal(plan(w2).ciclo.consejo_solo, false);
  assert.equal(w2.ctx.latido(), 'nada');
  assert.equal(w2.iaPedidos.length, 0);
});

test('si la API no contesta, el latido no insiste en cada vuelta: espera dos horas', () => {
  const w = enConsejo({ ia: () => ({ codigo: 503, cuerpo: 'caído' }) });
  w.propiedades.set('ANTHROPIC_API_KEY', CLAVE);
  assert.equal(w.ctx.latido(), 'consejo:' + PLAN + ':ia');
  const e = JSON.parse(w.propiedades.get('e_' + PLAN));
  assert.ok(e.hasta - Date.now() > 1.9 * 3600000 && e.hasta - Date.now() < 2.1 * 3600000);
  const pedidos = w.iaPedidos.length;
  assert.equal(w.ctx.latido(), 'nada');
  assert.equal(w.iaPedidos.length, pedidos);
});

/* ── la investigación ── */
const URL_A = 'https://boletinoficial.sonora.gob.mx/ejemplo/programa.pdf';
const URL_B = 'https://www.banxico.org.mx/ejemplo/tiie';
const HALLAZGOS = [
  { tema: 'Uso de suelo', hallazgo: 'El programa municipal fija la zonificación del predio; hay que pedir la constancia para comparar la altura.', fuente: URL_A, confianza: 'media', mueve: 'candado uso_suelo' },
  { tema: 'Tasa', hallazgo: 'La TIIE publicada es distinta de la que usa el libro; conviene revisar el dato de la tasa del banco.', fuente: 'https://inventada.example/tiie', confianza: 'alta', mueve: 'din.tiie' },
  { tema: 'Corto', hallazgo: 'muy corto', fuente: URL_B, confianza: 'baja', mueve: '' }
];
/* La API de juguete de la búsqueda: busca (server_tool_use + web_search_tool_result) y al final contesta un JSON en texto. */
function buscador(opciones) {
  const op = opciones || {};
  return ({ n }) => {
    const resultados = { type: 'web_search_tool_result', tool_use_id: 'b' + n, content: [{ type: 'web_search_result', url: URL_A, title: 'Programa', encrypted_content: 'x' }, { type: 'web_search_result', url: URL_B + '/', title: 'TIIE', encrypted_content: 'y' }] };
    const busca = op.sinBuscar ? [] : [{ type: 'server_tool_use', id: 'b' + n, name: 'web_search', input: { query: 'zonificación Hermosillo' } }, resultados];
    if (op.pausa && n === 1) return { codigo: 200, cuerpo: { stop_reason: 'pause_turn', content: busca } };
    const json = JSON.stringify({ hallazgos: op.hallazgos || HALLAZGOS });
    return { codigo: 200, cuerpo: { stop_reason: 'end_turn', content: (op.pausa ? [] : busca).concat([
      { type: 'text', text: 'Revisé el programa municipal.', citations: op.sinBuscar ? null : [{ type: 'web_search_result_location', url: URL_A, title: 'Programa', cited_text: 'zonificación', encrypted_index: 'z' }] },
      { type: 'text', text: '```json\n' + json + '\n```' }]) } };
  };
}
const hallazgosDe = (w) => w.libro.getSheetByName('Hallazgos').v.slice(4).filter((f) => f[1]);
const investiga = (w, extra) => w.post(Object.assign({ tipo: 'ppp2-investigar', plan: PLAN, k: EDITOR, request_id: 'inv-' + Math.random() }, extra));

test('con la clave de Anthropic, «Investigar» busca en la web ahí mismo y anota sólo hallazgos con una fuente que de verdad trajo la búsqueda', () => {
  const w = enConsejo({ ia: buscador() });
  w.propiedades.set('ANTHROPIC_API_KEY', CLAVE);
  assert.equal(plan(w).ciclo.ia_busca, true);
  const antes = hallazgosDe(w).length;
  const r = investiga(w, { pregunta: 'M04.Q02', tema: '¿Qué usos están permitidos y con qué condiciones?', detalle: '' });
  assert.equal(r.ok, true, JSON.stringify(r));
  assert.deepEqual([r.hallazgos, r.busquedas, r.paginas, r.propuestos], [1, 1, 2, 3], 'la fuente inventada y el texto corto no cuentan');
  assert.match(r.nota, /^Investigué \(1 búsqueda, 2 páginas\) y dejé 1 hallazgo en «Lo que encontré», con su fuente\. Ninguno cambia un dato hasta que alguien lo acepte\.$/);
  const nuevos = hallazgosDe(w).slice(antes);
  assert.equal(nuevos.length, 1);
  assert.deepEqual([nuevos[0][1], nuevos[0][3], nuevos[0][4], nuevos[0][6], nuevos[0][7], nuevos[0][8]], ['Uso de suelo', URL_A, 'media', 'propuesto', 'El plan (investigó por API)', 'Pregunta M04.Q02']);
  const p = w.iaPedidos[0];
  assert.equal(p.headers['x-api-key'], CLAVE);
  assert.ok(!p.crudo.includes(CLAVE));
  assert.equal(p.cuerpo.tools.length, 1, 'sólo la búsqueda: el resultado llega en texto');
  const web = p.cuerpo.tools[0];
  assert.deepEqual([web.type, web.name, web.max_uses, web.user_location.city, web.user_location.country], ['web_search_20250305', 'web_search', 5, 'Hermosillo', 'MX']);
  assert.match(p.cuerpo.system, /haz al menos dos búsquedas/);
  assert.match(p.cuerpo.messages[0].content[0].text, /¿Qué usos están permitidos y con qué condiciones\?/);
  const b = bitacora(w).pop();
  assert.match(b[2], /Investigó por API: 1 hallazgo propuesto/);
  assert.equal(b[6], '1 renglón · 1 búsqueda, 2 páginas · propuso 3');
  assert.equal(w.vivero.getSheetByName('Pedidos'), null, 'ya no queda pedido: se investigó');
});

test('la fuente se compara por sitio y ruta (sin www, sin #, sin consulta, http o https) y se anota como la trajo la búsqueda', () => {
  const w = enConsejo({ ia: buscador({ hallazgos: [{ tema: 'Tasa', hallazgo: 'La TIIE publicada por Banco de México difiere de la del libro; conviene revisar el dato.', fuente: 'Banxico (http://banxico.org.mx/ejemplo/tiie?x=1#tabla).', confianza: 'alta', mueve: 'din.tiie' }] }) });
  w.propiedades.set('ANTHROPIC_API_KEY', CLAVE);
  const antes = hallazgosDe(w).length;
  assert.equal(investiga(w, { tema: 'tasa del banco' }).hallazgos, 1);
  assert.equal(hallazgosDe(w).slice(antes)[0][3], URL_B + '/', 'la dirección tal como la trajo la búsqueda');
});

test('una investigación larga (pause_turn) sigue con la respuesta tal cual vino', () => {
  const w = enConsejo({ ia: buscador({ pausa: true }) });
  w.propiedades.set('ANTHROPIC_API_KEY', CLAVE);
  const r = investiga(w, { tema: 'zonificación del predio' });
  assert.equal(r.ok, true);
  assert.deepEqual([r.hallazgos, r.busquedas], [1, 1]);
  assert.equal(w.iaPedidos.length, 2);
  const segundo = w.iaPedidos[1].cuerpo.messages;
  assert.equal(segundo[1].role, 'assistant');
  assert.equal(segundo[1].content[1].type, 'web_search_tool_result', 'se devuelve sin cambios lo que mandó la API');
});

test('«nada» dice por qué: sin búsquedas, sin fuentes comprobadas o sin nada nuevo; y nunca anota', () => {
  const casos = [
    [{ sinBuscar: true }, /^No alcancé a buscar en la web: la API no hizo ninguna búsqueda\./, 'Investigó por API: no alcanzó a buscar'],
    [{ hallazgos: [HALLAZGOS[1]] }, /^Investigué \(1 búsqueda, 2 páginas\) y propuse 1, pero ninguno con una fuente de las páginas que consulté: no los anoté\.$/, 'Investigó por API: ninguna fuente comprobada'],
    [{ hallazgos: [] }, /^Investigué \(1 búsqueda, 2 páginas\) y no encontré nada nuevo y confiable\. No anoté nada\.$/, 'Investigó por API: nada nuevo y confiable']
  ];
  for (const [op, nota, bita] of casos) {
    const w = enConsejo({ ia: buscador(op) });
    w.propiedades.set('ANTHROPIC_API_KEY', CLAVE);
    const antes = hallazgosDe(w).length;
    const r = investiga(w, { tema: 'agua' });
    assert.equal(r.hallazgos, 0);
    assert.match(r.nota, nota);
    assert.equal(bitacora(w).pop()[2], bita);
    assert.equal(hallazgosDe(w).length, antes);
  }
});

test('sin clave de Anthropic queda pedido como antes, y «lo que falta» no se puede investigar', () => {
  const w2 = enConsejo({ ia: buscador() });
  w2.propiedades.set('OPENAI_API_KEY', 'sk-openai');          // la búsqueda en la web va por Anthropic
  const r2 = investiga(w2, { pregunta: 'M04.Q02', tema: 'usos' });
  assert.equal(r2.hecho, 'pedido');
  assert.match(r2.nota, /clave de la API de Anthropic/);
  assert.equal(w2.vivero.getSheetByName('Pedidos').v.length, 2);
  assert.equal(w2.iaPedidos.length, 0);
  assert.deepEqual(investiga(w2, { mundo: true }), { ok: false, error: 'busqueda' });
});

test('«Investigar lo que falta» lleva los candados abiertos y lo que pidió el consejo', () => {
  const w = enConsejo({ ia: (q) => (q.url.includes('anthropic') && q.cuerpo.tools && q.cuerpo.tools.some((x) => x.name === 'web_search') ? buscador()(q) : jueces()(q)) });
  w.propiedades.set('ANTHROPIC_API_KEY', CLAVE);
  assert.equal(convoca(w).ok, true);                 // la sesión deja condiciones
  const r = investiga(w, { mundo: true });
  assert.equal(r.ok, true, JSON.stringify(r));
  const texto = w.iaPedidos[w.iaPedidos.length - 1].cuerpo.messages[0].content[0].text;
  assert.match(texto, /Pendientes que te tocan:/);
  assert.match(texto, /Candado «/);
  assert.match(texto, /Piden Alejandro virtual, Dueño de la tierra virtual, .*Hormozi: Escritura y constancia de zonificación\./);
  assert.equal(texto.split('Pide').length - 1, 1, 'una condición repetida por varios jueces va una sola vez, con sus nombres');
});

test('la razón de prueba del mundo es larga para contar como razón', () => {
  assert.ok(RAZON_PRUEBA.length >= 20);
  assert.ok(mundo);
});

test('con mucha historia en el libro, el consejo lee las pruebas y la sesión más recientes (están al final)', () => {
  const w = enConsejo({ ia: jueces() });
  w.propiedades.set('ANTHROPIC_API_KEY', CLAVE);
  const pru = w.libro.getSheetByName('Pruebas'), viejas = [];
  const actual = pru.v[13].slice();
  for (let i = 0; i < 1500; i++) viejas.push(['Corrida vieja ' + i, '(sin cambios)', 1, 0, 1, 1, 37, 'V2', '2026-01-01 10:00', 'Pruebas', 'h-vieja']);
  pru.getRange(14, 1, viejas.length, 11).setValues(viejas);
  pru.getRange(14 + viejas.length, 1, 1, 11).setValues([actual]);
  const con = w.libro.getSheetByName('Consejo');
  for (let i = 0; i < 800; i++) con.appendRow(['2026-01-01', 'CP-' + (1 + Math.floor(i / 7)), 'V1', 'Juez ' + (i % 7), 'regresa', 'Razón vieja de prueba suficientemente larga.', 'Vieja', 'h-vieja', 'e-vieja']);
  w.ctx.SpreadsheetApp.flush();
  assert.equal(w.lee('plan.paso'), 'consejo');
  const r = convoca(w);
  assert.equal(r.ok, true, JSON.stringify(r));
  assert.equal(r.sesion, 'CP-' + (Math.floor(799 / 7) + 2), 'nombre nuevo, uno más que la mayor que existe');
  const texto = w.iaPedidos[0].cuerpo.messages[0].content[0].text;
  const exp = JSON.parse(texto.slice(texto.indexOf('{'), texto.lastIndexOf('}') + 1));
  assert.equal(exp.pruebas_de_estres.length, 1, 'encuentra las pruebas de estos números al final de la pestaña');
  assert.equal(exp.sesion_anterior_del_consejo[0].sesion, 'CP-' + (Math.floor(799 / 7) + 1), 'la sesión anterior es la del último renglón');
});
