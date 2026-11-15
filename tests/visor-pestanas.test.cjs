'use strict';
/* Las pestañas del visor (visor-pestanas.js) y lo que cambió en los cuadros (visor.js: «deducido de …» y el
   cuadro Dinero sin saldo acumulado), contra los dobles del contrato (tests/visor-pestanas-dobles.cjs) y el
   servidor de hoy (tests/ppp2-mundo.cjs). Datos INVENTADOS. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const P = require('../visor-pestanas.js');
const V = require('../visor.js');
const D = require('./visor-pestanas-dobles.cjs');
const M = require('./visor-pestanas-mundo.cjs');
const { mundo, PLAN } = require('./ppp2-mundo.cjs');

const RAIZ = path.join(__dirname, '..');
const LIGA = 'liga0000000000000000000000000001';
const texto = (html) => html.replace(/<[^>]+>/g, ' ').replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/\s+/g, ' ');
const copia = (x) => JSON.parse(JSON.stringify(x));
const HOY = '2026-11-15', T_HOY = new Date(2026, 10, 15, 12).getTime();
const visorDe = (cambios) => mundo({ ligas: [[LIGA, PLAN, 'Grupo', 'activa', '', '', '', '2026-01-01', '']].map((r) => Object.assign(r, cambios || {})) }).get({ recurso: 'ppp2-visor', liga: LIGA });

test('la dirección recuerda la pestaña sin romper las ligas ya repartidas', () => {
  assert.equal(P.pestanaDe('#l=' + LIGA), 'plan');
  assert.equal(P.pestanaDe('#l=' + LIGA + '&t=historial'), 'historial');
  assert.equal(P.pestanaDe('#t=opciones&l=' + LIGA), 'opciones');
  assert.equal(P.pestanaDe('#l=' + LIGA + '&t=otra'), 'plan', 'una pestaña que no existe abre el plan');
  assert.equal(P.hashCon('#l=' + LIGA, 'archivos'), '#l=' + LIGA + '&t=archivos');
  assert.equal(P.hashCon('#l=' + LIGA + '&t=archivos', 'historial'), '#l=' + LIGA + '&t=historial');
  assert.equal(P.hashCon('#l=' + LIGA + '&t=archivos', 'plan'), '#l=' + LIGA, 'el plan vuelve a la liga de siempre');
  assert.equal(P.hashCon('', 'opciones'), '#t=opciones', 'con la liga en ?l=, la pestaña va sola en el hash');
  // la liga se sigue leyendo igual en visor.js (y en el comparativo) con la pestaña en el hash
  const src = fs.readFileSync(path.join(RAIZ, 'visor.js'), 'utf8');
  const re = new RegExp(/var m = \/\[#&\?\]l=\(\[A-Za-z0-9_-\]\{24,80\}\)\(\?:&\|\$\)\//.source);
  assert.match(src, re, 'visor.js lee la liga con la misma expresión de siempre');
  const lee = (h) => (/[#&?]l=([A-Za-z0-9_-]{24,80})(?:&|$)/.exec(h) || [])[1];
  for (const t of ['historial', 'archivos', 'opciones']) assert.equal(lee(P.hashCon('#l=' + LIGA, t)), LIGA);
});

test('qué pasó con un recurso: el servidor de hoy no los tiene y eso no es una liga apagada', () => {
  assert.equal(P.clase({ ok: true }), 'ok');
  for (const e of ['sin_sesion', 'recurso', 'clave', 'board', 'rarísimo', undefined]) assert.equal(P.clase({ ok: false, error: e }), 'sin', String(e));
  assert.equal(P.clase({ ok: false, error: 'liga' }), 'liga');
  assert.equal(P.clase({ ok: false, error: 'plan' }), 'plan');
  assert.equal(P.clase({ ok: false, error: 'interno' }), 'interno');
  assert.equal(P.clase({ ok: false, error: 'portero' }), 'interno');
  assert.equal(P.clase({ ok: false, error: 'grande' }), 'grande');
  assert.equal(P.clase(null), 'red');
  /* El servidor publicado hoy no conoce estos recursos: doGet los manda al canje del Portero sin `k` y contesta
     `sin_sesion`. (El mundo de pruebas ya corre el servidor de main, que sí los tiene: ver la prueba siguiente.) */
  for (const r of D.RECURSOS) assert.equal(P.clase({ ok: false, error: 'sin_sesion' }), 'sin', r + ': el servidor de hoy contesta «todavía no»');
  const sinHistorial = mundo({ ligas: [[LIGA, PLAN, 'Grupo', 'activa', '', '', '', '2026-01-01', '']] });
  assert.equal(P.clase(sinHistorial.get({ recurso: 'ppp2-archivos', liga: LIGA, plan: PLAN })), 'ok', 'el servidor de main sin hoja de historial: una lista vacía, no un error');
  assert.match(texto(P.archivosHtml(sinHistorial.get({ recurso: 'ppp2-archivos', liga: LIGA, plan: PLAN }))), /Todavía no hay archivos para esta liga/);
  const sin = texto(P.estadoHtml('historial', 'sin'));
  assert.match(sin, /Aún no hay historial en esta liga/);
  assert.match(texto(P.estadoHtml('archivos', 'sin')), /Aún no hay archivos en esta liga/);
  assert.doesNotMatch(P.estadoHtml('historial', 'sin'), /data-reintenta/, 'lo que todavía no existe no se reintenta');
  assert.match(P.estadoHtml('historial', 'interno'), /data-reintenta="historial"/, 'una falla se puede reintentar');
  assert.match(P.estadoHtml('archivos', 'red'), /Sin conexión[\s\S]*data-reintenta/);
  for (const r of ['historial', 'archivos', 'chat', 'archivo']) assert.match(texto(P.estadoHtml(r, 'tarda', r)), /Está tardando más de lo normal[\s\S]*Volver a intentar/, r + ': no contestar a tiempo no es «sin conexión»');
  const grande = P.estadoHtml('archivo', 'grande');
  assert.match(texto(grande), /no se puede abrir aquí[\s\S]*40 MB/);
  assert.doesNotMatch(grande, /data-reintenta/, '«grande» no se reintenta');
  assert.match(texto(P.estadoHtml('chat', 'plan')), /Sólo el equipo de la alianza puede leerla/);
});

test('Historial del equipo: lo más importante, la línea de tiempo del más viejo al más reciente, el día, pendientes y versiones', () => {
  const h = D.historial({ hoy: T_HOY }), html = P.historialHtml(h, { hoy: HOY }), t = texto(html);
  assert.doesNotMatch(html, /NaN|undefined|null|\[object/);
  const dias = [...html.matchAll(/class="vzp-dia[^"]*" data-dia="(\d{4}-\d{2}-\d{2})"/g)].map((m) => m[1]);
  assert.equal(dias.length, h.dias.length, 'un nodo por día');
  assert.deepEqual(dias, dias.slice().sort(), 'del más viejo (izquierda) al más reciente (derecha)');
  assert.match(html, new RegExp('vzp-dia vzp-dia-on[^"]*" data-dia="' + h.dias[0].fecha + '" aria-current="date"'), 'abre en el día más reciente');
  assert.match(t, /2 reuniones/); assert.match(t, /3 versiones/); assert.match(t, /3 pendientes/);
  assert.match(t, /Sábado 14 de noviembre/);
  assert.match(t, /Reunión con el dueño del terreno[\s\S]*Decisiones: seguir/);
  assert.match(html, /data-archivo="archivoPrueba00000000transcripcion"[\s\S]*Abrir la transcripción/, 'la reunión abre su transcripción por Archivos');
  assert.match(html, /data-chat="2026-11-14"/, 'la conversación del día se puede leer');
  assert.match(t, /Lo que se habló en el grupo de WhatsApp/);
  assert.match(t, /Pendientes abiertos 3/);
  assert.match(t, /venció el 10 nov/, 'un compromiso vencido se marca');
  assert.match(t, /para el 21 nov/);
  assert.match(t, /V2 · Con banco 14 nov vigente/);
  assert.match(t, /V3 · Temprana sin fecha alterna/);
  // otro día escogido
  const otro = P.historialHtml(h, { hoy: HOY, sel: h.dias[2].fecha });
  assert.match(otro, new RegExp('vzp-dia-on[^"]*" data-dia="' + h.dias[2].fecha + '"'));
  assert.match(texto(otro), /Se fija el arranque de obra/);
  // la etiqueta de cada día la leen los lectores de pantalla
  assert.match(html, /aria-label="Sábado 14 de noviembre: 1 reunión, 1 versión del plan, chat del equipo, 14 mensajes"/);
});

test('Historial de fuera: nunca conversación ni pendientes, aunque llegaran; un servidor sin días dice algo claro', () => {
  const h = D.historial({ hoy: T_HOY, audiencia: 'externo', malEducado: true }), html = P.historialHtml(h, { hoy: HOY }), t = texto(html);
  assert.ok(h.pendientes.length && h.dias.some((d) => d.chat > 0), 'el doble sí los manda');
  assert.doesNotMatch(html, /data-chat|vzpPendientes|No debe verse|vzpI-chat/, 'la pantalla no asume que la gente de fuera puede ver la conversación ni los pendientes');
  assert.doesNotMatch(t, /pendientes|Chat del equipo|WhatsApp/);
  assert.match(t, /2 reuniones/);
  const vacio = texto(P.historialHtml(D.historial({ vacio: true }), { hoy: HOY }));
  assert.match(vacio, /Este plan todavía no tiene historial/);
});

test('contra el servidor de main (Visor.gs de verdad): cada recurso trae la forma que la pantalla espera y se pinta sin huecos', () => {
  const sinHuecos = (html, que) => assert.doesNotMatch(texto(html), /\bundefined\b|\bNaN\b|\bnull\b|\[object/, que);
  // equipo
  const eq = M.mundoReal({ hoy: T_HOY, audiencia: 'equipo' }), pide = (w, recurso, extra) => w.get(Object.assign({ recurso, liga: M.LIGA, plan: M.PLAN }, extra || {}));
  const h = pide(eq, 'ppp2-historial');
  assert.equal(P.clase(h), 'ok'); assert.equal(h.audiencia, 'equipo');
  const html = P.historialHtml(h, { hoy: HOY }), t = texto(html);
  sinHuecos(html, 'historial de equipo');
  assert.match(t, /Reunión con el dueño del terreno[\s\S]*Decisiones: Preparar la versión con preventa lenta/);
  assert.match(html, /data-archivo="archivoMinutaDeLaReunion0001"[\s\S]*Abrir el documento/, 'la minuta de la reunión se abre por Archivos');
  assert.match(html, /data-chat="2026-11-14"/);
  assert.match(t, /Pendientes abiertos 2[\s\S]*venció el 9 nov/);
  assert.doesNotMatch(t, /Decisión sólo de Dirección|Pendiente de una decisión de Dirección|Ya se hizo/, 'solo_direccion y lo hecho no salen');
  const dias = [...html.matchAll(/class="vzp-dia[^"]*" data-dia="([^"]+)"/g)].map((m) => m[1]);
  assert.deepEqual(dias, h.dias.map((d) => d.fecha).reverse(), 'el servidor manda lo más reciente primero; la línea va del más viejo al más reciente');
  const c = pide(eq, 'ppp2-chat', { dia: h.dias[0].fecha }), ch = P.chatHtml(c, HOY);
  sinHuecos(ch, 'conversación');
  assert.equal((ch.match(/class="vzp-msj[ "]/g) || []).length, 14, 'los catorce mensajes visibles, sin el oculto');
  assert.doesNotMatch(ch, /Mensaje oculto/);
  assert.match(ch, /data-archivo="archivoPresentacionSocios001"/);
  assert.match(texto(ch), /Nota de voz\.opus aún no está en el expediente/);
  const a = pide(eq, 'ppp2-archivos'), ah = P.archivosHtml(a, { hoy: HOY });
  sinHuecos(ah, 'archivos de equipo');
  assert.deepEqual([...ah.matchAll(/id="vzpG\d+">([^<]+) </g)].map((m) => m[1]), ['Presentaciones', 'Modelos financieros', 'Terreno y polígonos', 'Reuniones y minutas', 'Otros']);
  assert.doesNotMatch(ah, /Secreto de Dirección/, 'lo de la carpeta privada no sale');
  assert.match(ah, /<div class="vzp-arch vzp-arch-no"[^>]*>[\s\S]*?Video del recorrido\.mov/, 'pasa de 40 MB: sin botón');
  assert.match(ah, /data-archivo="archivoPaginaHtmlDelExpedi01"[^>]*data-vista="descarga"/);
  // un archivo: partes desde 0, una a una, con el tipo de los bytes
  const p0 = pide(eq, 'ppp2-archivo', { id: M.A.larga, parte: '0' });
  assert.equal(p0.partes, 3); assert.equal(p0.parte, 0); assert.equal(P.tipoSeguro(p0.tipo), 'application/pdf');
  assert.equal(P.clase(pide(eq, 'ppp2-archivo', { id: M.A.larga, parte: '3' })), 'plan', 'no hay parte 3 de 3');
  assert.equal(P.tipoSeguro(pide(eq, 'ppp2-archivo', { id: M.A.pagina, parte: '0' }).tipo), 'application/octet-stream', 'un HTML llega como bytes sin tipo');
  assert.equal(P.clase(pide(eq, 'ppp2-archivo', { id: M.A.enorme, parte: '0' })), 'grande', 'un Doc de Google que no se puede exportar');
  assert.equal(P.clase(pide(eq, 'ppp2-archivo', { id: M.A.secreto, parte: '0' })), 'plan');
  // de fuera: sin conversación, pendientes, fuente ni liga de un evento; sólo «Para compartir»
  const ex = M.mundoReal({ hoy: T_HOY, audiencia: '' }), hx = pide(ex, 'ppp2-historial'), xhtml = P.historialHtml(hx, { hoy: HOY });
  assert.equal(hx.audiencia, 'externo');
  sinHuecos(xhtml, 'historial de fuera');
  assert.doesNotMatch(xhtml, /data-chat|vzpPendientes|Aviso en el grupo|Levantamiento topográfico|Videollamada|Ver la fuente/);
  assert.equal(P.clase(pide(ex, 'ppp2-chat', { dia: hx.dias[0].fecha })), 'plan');
  assert.deepEqual(pide(ex, 'ppp2-archivos').grupos.map((g) => g.archivos.map((x) => x.nombre)), [['Presentación para el dueño.pdf']]);
});

test('lo que llega no se vuelve marcado ni se abre como página: fechas completas y tipos que un navegador no ejecuta', () => {
  // una fecha que no es AAAA-MM-DD exacta no entra a la línea de tiempo (ni a un atributo)
  const h = { ok: true, audiencia: 'equipo', dias: [{ fecha: '2026-11-14" onmouseover="alert(1)', items: [{ tipo: 'reunion', titulo: 'x' }], chat: 0 }, { fecha: '2026-11-13', items: [{ tipo: 'reunion', titulo: 'buena' }], chat: 0 }], pendientes: [], versiones: [{ v: 1, nombre: 'a', fecha: '2026-11-12"><b>', estado: '' }] };
  const html = P.historialHtml(h, { hoy: HOY });
  assert.doesNotMatch(html, /onmouseover|2026-11-14|2026-11-12/);
  assert.deepEqual(P.diasOrdenados(h).map((d) => d.fecha), ['2026-11-13']);
  assert.match(html, /V1 · a[\s\S]*sin fecha/, 'una versión con fecha rota se enseña sin fecha');
  // los tipos: sólo lo pasivo conserva el suyo
  for (const [t, esperado] of [['application/pdf', 'application/pdf'], ['IMAGE/PNG; charset=binary', 'image/png'], ['image/jpeg', 'image/jpeg'], ['video/mp4', 'video/mp4'],
    ['application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'], ['application/vnd.google-earth.kmz', 'application/vnd.google-earth.kmz'],
    ['text/html', 'application/octet-stream'], ['image/svg+xml', 'application/octet-stream'], ['application/xhtml+xml', 'application/octet-stream'], ['text/xml', 'application/octet-stream'],
    ['application/javascript', 'application/octet-stream'], ['text/plain', 'application/octet-stream'], ['', 'application/octet-stream'], [undefined, 'application/octet-stream']]) assert.equal(P.tipoSeguro(t), esperado, String(t));
  // el mismo juego de tipos que el servidor (PESTANAS.PASIVO de Visor.gs)
  const src = fs.readFileSync(path.join(RAIZ, 'visor-pestanas.js'), 'utf8'), gs = fs.readFileSync(path.join(RAIZ, 'server/ppp2/Visor.gs'), 'utf8');
  assert.equal(/var PASIVO = (\/\^.*\$\/);/.exec(src)[1], /PASIVO: (\/\^.*\$\/),/.exec(gs)[1], 'la pantalla y el servidor dejan pasar los mismos tipos');
  // de fuera: aunque llegara, un evento de chat o de pendiente no sale, ni la fuente o la liga de un evento
  const fuera = { ok: true, audiencia: 'externo', dias: [{ fecha: '2026-11-13', chat: 9, items: [{ tipo: 'whatsapp', titulo: 'chat que no' }, { tipo: 'pendiente', titulo: 'pendiente que no' }, { tipo: 'reunion', titulo: 'sí', fuente: 'interna', url: 'https://ejemplo.test/x' }] }, { fecha: '2026-11-12', chat: 3, items: [{ tipo: 'whatsapp', titulo: 'otro chat que no' }] }], pendientes: [], versiones: [] };
  const fx = P.historialHtml(fuera, { hoy: HOY });
  assert.doesNotMatch(fx, /chat que no|pendiente que no|interna|ejemplo\.test|data-chat/);
  assert.deepEqual(P.diasOrdenados(fuera).map((d) => [d.fecha, d.items.length, d.chat]), [['2026-11-13', 1, 0]], 'un día que se queda sin nada que enseñar no sale');
  // renglones rotos o vacíos no tumban la pestaña ni dejan «undefined»
  const roto = P.historialHtml({ ok: true, audiencia: 'equipo', dias: [null, { fecha: '2026-11-13', items: [null, { tipo: 'reunion', titulo: 'x' }], chat: 0 }], pendientes: [null, { tarea: 'una tarea' }, {}], versiones: [null, { v: 1 }, {}] }, { hoy: HOY });
  assert.doesNotMatch(texto(roto), /undefined|null|NaN/);
  assert.match(texto(roto), /Pendientes abiertos 1[\s\S]*una tarea[\s\S]*Versiones del plan 1/);
  const archRotos = P.archivosHtml({ ok: true, grupos: [null, { nombre: 'Otros', archivos: [null, {}, { id: 'archivoPrueba000000000000uno01', nombre: 'uno.pdf', tipo: 'application/pdf', vista: 'pdf' }] }] }, { hoy: HOY });
  assert.match(texto(archRotos), /1 archivo del proyecto[\s\S]*uno\.pdf/);
  assert.doesNotMatch(texto(archRotos), /undefined|NaN/);
});

test('las capturas de la conversación: con el nombre sólo donde se ve, caben más mensajes sin partir ninguno', () => {
  // A, A, B, B: con nombre, 100; sin nombre, 80. Capacidad 290: A+A(sin)+B = 280 → caben tres.
  assert.deepEqual(P.agrupa([100, 100, 100, 100], 290, 10, [80, 80, 80, 80], ['A', 'A', 'B', 'B']), [[0, 1, 2], [3]]);
  // sin los datos del nombre, como antes: todas con nombre
  assert.deepEqual(P.agrupa([100, 100, 100, 100], 290, 10), [[0, 1], [2, 3]]);
  // la primera de una captura siempre lleva su nombre, aunque sea de la misma persona que la anterior
  assert.deepEqual(P.agrupa([100, 100, 100], 190, 10, [80, 80, 80], ['A', 'A', 'A']), [[0, 1], [2]]);
});

test('el día: eventos con su tipo, hora, resumen largo que se abre, adjuntos y fuente; lo escrito no se vuelve marcado', () => {
  const dia = { fecha: '2026-11-03', chat: 0, items: [
    { tipo: 'minuta', hora: '09:00', titulo: '<img src=x onerror=alert(1)>', resumen: 'línea\n'.repeat(8) + 'fin', fuente: '<b>raro</b>', url: 'javascript:alert(1)', archivos: [{ id: 'archivoPrueba000000000000minuta', nombre: 'Minuta "uno".docx', tipo: 'application/vnd.google-apps.document' }] },
    { tipo: 'tipo-desconocido', hora: '', titulo: '', resumen: '', fuente: '', url: 'https://ejemplo.test/fuente', archivos: [{ nombre: 'sin id.pdf' }] }
  ] };
  const html = P.diaHtml(dia, true, HOY), t = texto(html);
  assert.doesNotMatch(html, /<img src=x|<b>raro|javascript:/);
  assert.match(html, /vzp-ev-res vzp-corto/, 'un resumen largo va recortado…');
  assert.match(html, /class="vzp-mas" aria-expanded="false">Ver más/, '…y se abre');
  assert.match(t, /MINUTA|Minuta/);
  assert.match(t, /Archivo/, 'un tipo desconocido se enseña como archivo');
  assert.match(html, /href="https:\/\/ejemplo\.test\/fuente" target="_blank" rel="noopener noreferrer"/);
  assert.doesNotMatch(html, /sin id\.pdf/, 'un adjunto de evento sin id no se pinta como botón');
  assert.match(html, /Abrir el documento/, 'el único documento de una minuta se abre por Archivos');
});

test('la conversación: burbujas con nombre y hora, adjuntos tocables, capturas que nunca parten un mensaje', () => {
  const r = D.chat('2026-11-14'), html = P.chatHtml(r, HOY), t = texto(html);
  assert.doesNotMatch(html, /NaN|undefined/);
  const n = (html.match(/class="vzp-captura"/g) || []).length;
  assert.ok(n >= 2, 'catorce mensajes caben en varias capturas: ' + n);
  assert.match(t, new RegExp('1 de ' + n));
  assert.equal((html.match(/class="vzp-msj[ "]/g) || []).length, r.mensajes.length, 'cada mensaje una vez');
  assert.match(html, /data-archivo="archivoPrueba000000000presentacion"/, 'un adjunto ya subido se abre');
  assert.match(t, /Nota de voz\.opus aún no está en el expediente/, 'uno que no se subió lo dice');
  assert.match(html, /<time>08:00<\/time>/);
  // mismo autor seguido: el nombre una sola vez
  const seguidos = P.chatHtml({ dia: HOY, mensajes: [{ hora: '1:00', quien: 'A', texto: 'uno' }, { hora: '1:01', quien: 'A', texto: 'dos' }, { hora: '1:02', quien: 'B', texto: 'tres' }] }, HOY);
  assert.equal((seguidos.match(/<b style="color:/g) || []).length, 2);
  // capturas: tope de mensajes, tope de largo y nunca un mensaje partido
  const largos = Array.from({ length: 11 }, (_, i) => ({ quien: 'A', texto: 'x'.repeat(i === 3 ? 900 : 40) }));
  const cs = P.capturas(largos);
  assert.equal(cs.flat().length, 11);
  assert.ok(cs.every((g) => g.length <= 8));
  assert.ok(cs.some((g) => g.length === 1 && g[0].texto.length === 900), 'un mensaje muy largo va solo, entero');
  assert.deepEqual(P.agrupa([100, 100, 100, 250, 50], 260, 10), [[0, 1], [2], [3], [4]].map((g) => g), 'por altura: lo que cabe a la vista');
  assert.deepEqual(P.agrupa([10, 10, 10], 1000, 2), [[0, 1], [2]]);
  const esc = P.chatHtml({ dia: HOY, mensajes: [{ hora: '<i>', quien: '<script>', texto: '<img src=x>' }] }, HOY);
  assert.doesNotMatch(esc, /<script>|<img src=x>|<time><i>/);
  assert.match(esc, /&lt;script&gt;[\s\S]*&lt;img src=x&gt;[\s\S]*<time>&lt;i&gt;<\/time>/, 'todo llega escapado');
  assert.match(texto(P.chatHtml({ dia: HOY, mensajes: [] }, HOY)), /Ese día no hay mensajes para leer/);
});

test('Archivos: siete grupos en el orden del contrato, con su número, ícono, fecha y tamaño; lo que no se puede abrir no es botón', () => {
  const r = D.archivos({ hoy: T_HOY, incompleta: true }), html = P.archivosHtml(r, { hoy: HOY }), t = texto(html);
  assert.doesNotMatch(html, /NaN|undefined|null/);
  const grupos = [...html.matchAll(/<h3 class="vzp-sec-tit" id="vzpG\d+">([^<]+) <span>(\d+)<\/span>/g)].map((m) => [m[1], +m[2]]);
  const esperado = P.GRUPOS.filter((g) => r.grupos.some((x) => x.nombre === g)).map((g) => [g, r.grupos.find((x) => x.nombre === g).archivos.length]);
  assert.deepEqual(grupos, esperado, 'llegan revueltos y salen en el orden del contrato');
  assert.match(t, /11 archivos del proyecto/);
  assert.match(t, /puede que falten algunos archivos/, '`incompleta` se dice con calma');
  assert.match(t, /Presentación del proyecto\.pdf \d+ nov · 2\.3 MB Ver/);
  assert.match(t, /Recorrido virtual \d+ nov · Presentación de Google Ver/, 'los de Google no tienen tamaño: se dice qué son');
  assert.match(t, /Corrida del plan\.xlsx \d+ nov · 86 KB Bajar/);
  assert.match(html, /<div class="vzp-arch vzp-arch-no"[^>]*>[\s\S]*Video del recorrido\.mp4[\s\S]*Sólo en el expediente/, '`vista` = no: sin botón');
  assert.doesNotMatch(html, /data-archivo="archivoPrueba0000000000000000video"/);
  for (const [nombre, etiqueta] of [['Presentación del proyecto.pdf', 'PDF'], ['Corrida del plan.xlsx', 'XLS'], ['Polígono del terreno.kmz', 'KMZ'], ['Foto aérea del predio.png', 'PNG'], ['Recorrido virtual', 'PPT'], ['Minuta del recorrido', 'DOC']]) {
    assert.match(html, new RegExp('data-nombre="' + nombre.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '"[^>]*>[\\s\\S]{0,900}?>' + etiqueta + '</text>'), nombre + ' → ' + etiqueta);
  }
  assert.match(texto(P.archivosHtml({ ok: true, grupos: [] })), /Todavía no hay archivos para esta liga/);
  assert.equal(P.tamano(null), ''); assert.equal(P.tamano(900), '900 B'); assert.equal(P.tamano(52340), '51 KB'); assert.equal(P.tamano(2412000), '2.3 MB'); assert.equal(P.tamano(39000000), '37 MB');
  assert.equal(P.tipoArchivo('application/vnd.google-apps.drawing', 'Croquis').e, 'DIB', 'los Dibujos de Google se reconocen (llegan como PDF)');
  assert.equal(P.nombreGuardar('Polígono del terreno (año 2).kmz'), 'Poligono del terreno (ano 2).kmz', 'el nombre para guardar conserva su extensión en cualquier sistema');
  assert.equal(P.nombreGuardar('a/b:c*?.pdf'), 'a_b_c__.pdf');
  assert.equal(P.nombreGuardar(''), 'archivo');
  assert.doesNotMatch(P.archivosHtml({ ok: true, grupos: [{ nombre: 'Otros', archivos: [{ id: 'x', nombre: '<img src=x onerror=1>', tipo: '"><script>', fecha: '2026-11-01 10:00', tamano: 1, vista: 'descarga' }] }] }), /<img src=x|<script>/);
});

test('Opciones: cada opción con tres cifras que el servidor ya dio, la vigente marcada, «Comparar todas» y, con una sola, una frase clara', () => {
  const d = visorDe();
  const una = P.resumenOpcion(d, '');
  assert.equal(una.ventas, d.v.ventas); assert.equal(una.ganancia, d.v.ganancia); assert.equal(una.recibe, d.v.dueno_recibe); assert.equal(una.veces, d.v.dueno_veces);
  assert.equal(una.terreno, d.datos['terreno.m2'].valor);
  const sola = P.opcionesHtml([Object.assign(una, { listo: true })], { plan: d.menu.plan, version: d.version, liga: LIGA }), ts = texto(sola);
  assert.match(ts, /Esta liga trae una sola opción del plan/);
  assert.match(ts, /Cifras en millones de pesos/, 'quien entra directo a Opciones sabe en qué unidad van las cifras');
  assert.doesNotMatch(sola, /visor-comparar/, 'con una sola opción no hay nada que comparar');
  assert.match(sola, /viendo ahora/);
  const mdp = (x) => (x < 0 ? '−' : '') + '$' + Math.abs(x).toFixed(1).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  for (const x of [d.v.ventas, d.v.ganancia, d.v.dueno_recibe]) assert.ok(ts.includes(mdp(x)), 'la cifra del libro, redondeada como se enseña: ' + mdp(x));
  assert.match(ts, new RegExp('×' + d.v.dueno_veces.toFixed(2) + ' su tierra'));
  // varias versiones de un terreno
  const vs = [1, 2, 3].map((n) => Object.assign(P.resumenOpcion(d, ''), { version: n, nombreV: 'V' + n + ' nombre', estado: n === 2 ? 'vigente' : '', listo: true }));
  const varias = P.opcionesHtml(vs, { plan: d.menu.plan, version: 2, liga: LIGA });
  assert.match(varias, new RegExp('<a class="vzp-comparar" href="visor-comparar\\.html#l=' + LIGA + '"'));
  assert.match(texto(varias), /Comparar las 3 opciones lado a lado/);
  assert.equal((varias.match(/vzp-chip-ok/g) || []).length, 1, 'una sola vigente');
  assert.equal((varias.match(/aria-current="true"/g) || []).length, 1, 'una sola que se está viendo');
  assert.match(varias, /data-version="1"/);
  // varios terrenos con varias versiones: agrupadas por terreno
  const grupos = P.opcionesHtml(vs.concat(vs.map((o) => Object.assign({}, o, { plan: 'p2otroplan01', etiqueta: 'Terreno chico', terreno: 2164 }))).map((o, i) => Object.assign(o, { etiqueta: i < 3 ? 'Terreno grande' : 'Terreno chico' })), { plan: d.menu.plan, version: 2, liga: LIGA });
  assert.match(texto(grupos), /Terreno grande 3,000 m²[\s\S]*Terreno chico 2,164 m²/);
  // lo que no llegó: «sin dato», nunca un cero
  const hueco = P.opcionesHtml([{ plan: 'x', version: 1, etiqueta: 'A', listo: true, ventas: null, ganancia: null, recibe: null, veces: null, terreno: null }, { plan: 'y', version: 1, etiqueta: 'B', listo: true, ventas: 1, ganancia: -2, recibe: 3, veces: null, terreno: null }], { liga: LIGA });
  assert.equal((texto(hueco).match(/sin dato/g) || []).length, 3);
  assert.match(hueco, /class="vzp-malo">−\$2\.0/, 'una pérdida se ve en rojo');
  assert.doesNotMatch(hueco, /\$0\.0/);
});

test('«deducido de …»: la leyenda y la hoja lo dicen donde el servidor lo marcó, y sólo ahí', () => {
  const d = copia(visorDe());
  const sin = V.pinta(d, null);
  assert.doesNotMatch(sin.html + sin.cuadros.map(V.detalleHtml).join(''), /vz-ded|deducido/, 'sin marcas, nada cambia');
  d.origen = 'PPP · motor vertical · caso de prueba';
  d.deducido = { 'v.rv_margen': '(ventas − costo con tierra) ÷ costo con tierra', 'productos.0.ventas': 'ventas de vivienda × m² de la tipología', 'flujo.total.obra': 'corregido: el desglose de costos del motor', 'datos.terreno.m2': 'deducido de la escritura', 'flujo.total.cierre': 'el cierre que cobra el motor' };
  const p = V.pinta(d, null), todo = p.html + p.cuadros.map(V.detalleHtml).join('');
  assert.match(texto(p.html), /Algunas cifras se deducen de las del motor/);
  const ls = [...todo.matchAll(/data-t="([^"]+)"/g)].map((m) => JSON.parse(m[1].replace(/&quot;/g, '"').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&')));
  const de = (o) => V.partesOrigen(o);
  const margen = ls.find((l) => /Margen antes de financiamiento/.test(l.t));
  assert.equal(de(margen.o).base, d.origen);
  assert.equal(de(margen.o).ded, 'deducido de (ventas − costo con tierra) ÷ costo con tierra');
  const prod = ls.find((l) => l.t === d.productos[0].nombre && l.f.some((f) => f[0] === 'Ventas'));
  assert.match(de(prod.o).ded, /deducido de ventas de vivienda/, 'el producto 0 lleva la suya');
  const otro = ls.find((l) => l.t === d.productos[1].nombre && l.f.some((f) => f[0] === 'Ventas'));
  assert.equal(de(otro.o).ded, '', 'el producto 1, no');
  const obra = ls.find((l) => l.t === 'Costos directos');
  assert.equal(de(obra.o).ded, 'corregido: el desglose de costos del motor', '«corregido» se dice tal cual');
  const tierra = ls.find((l) => l.t === 'Terreno' && l.f.some((f) => f[0] === 'Cierre de tierra'));
  assert.equal(de(tierra.o).ded, 'deducido del cierre que cobra el motor', 'una cifra compuesta (tierra y su cierre) lleva la nota de su parte deducida');
  assert.ok(ls.filter((l) => de(l.o).ded).length < ls.length / 3, 'sólo las cifras marcadas');
  const riesgo = V.detalleHtml(p.cuadros.find((c) => c.id === 'riesgo'));
  assert.match(riesgo, /<button type="button" class="vz-ded" aria-expanded="false">[\s\S]*?deducido<\/button><\/small><small class="vz-ded-txt" hidden>Deducido de \(ventas − costo con tierra\)/);
  assert.equal(V.fraseDeducido('corregido: x'), 'corregido: x');
  assert.equal(V.fraseDeducido('Deducido de y'), 'deducido de y');
  assert.equal(V.fraseDeducido('z ÷ w'), 'deducido de z ÷ w');
  assert.equal(V.fraseDeducido('El tipo del motor'), 'deducido del tipo del motor');
  assert.equal(V.fraseDeducido('Lo que recibe el dueño'), 'deducido de lo que recibe el dueño');
  assert.deepEqual(V.rutasDe('Versiones', 'tierra y ventas'), ['v.tierra', 'v.ventas']);
  assert.deepEqual(V.rutasDe('Datos', 'terreno.m2'), ['datos.terreno.m2']);
  assert.deepEqual(V.rutasDe('Flujo', 'obra directa'), ['flujo.obra', 'flujo.total.obra']);
  const esc = copia(d); esc.deducido = { 'v.rv_margen': '<img src=x onerror=1>' };
  const pe = V.pinta(esc, null);
  assert.doesNotMatch(pe.html + pe.cuadros.map(V.detalleHtml).join(''), /<img src=x/);
});

test('Dinero sin saldo acumulado o sólo con totales: un estado digno, nunca un hueco ni un cero inventado', () => {
  const visible = (c) => texto('<svg>' + c.svg + '</svg>'), base = copia(visorDe());
  // sin saldo acumulado pero con lo que entra y sale por mes (las fotos del PPP de siempre, antes del paso «completa»)
  const sinAcum = copia(base); sinAcum.flujo.filas.flujo_acum = null; delete sinAcum.flujo.filas.disposicion; delete sinAcum.flujo.total.disposicion;
  const c2 = V.pinta(sinAcum, null).cuadros.find((c) => c.id === 'dinero');
  assert.equal(c2.sub, 'entra y sale');
  assert.match(visible(c2), /clientes[\s\S]*costos/);
  assert.match(visible(c2), /saldo del banco/);
  assert.doesNotMatch(visible(c2) + c2.svgG, /a repartir|Lo más hondo|NaN|undefined/);
  assert.equal((c2.svg.match(/data-t="\{&quot;t&quot;:&quot;Mes \d+&quot;/g) || []).length, sinAcum.flujo.meses, 'cada mes se puede tocar');
  // sólo los totales
  const totales = copia(base); totales.flujo = { meses: 6, filas: {}, total: base.flujo.total };
  const c3 = V.pinta(totales, null).cuadros.find((c) => c.id === 'dinero');
  assert.match(visible(c3), /ENTRA[\s\S]*SALE/);
  assert.match(visible(c3), /no trae su flujo mes a mes/);
  assert.doesNotMatch(visible(c3), /NaN|undefined|\$0\.0\b/);
  // nada
  const nada = copia(base); nada.flujo = { meses: 0, filas: {}, total: {} }; delete nada.v.max_ajeno;
  const c4 = V.pinta(nada, null).cuadros.find((c) => c.id === 'dinero');
  assert.match(visible(c4), /Aún no hay flujo calculado[\s\S]*todavía no trae su flujo mes a mes/);
  for (const c of [c2, c3, c4]) assert.doesNotMatch(V.detalleHtml(c), /NaN|undefined|Infinity/);
  assert.match(texto(V.detalleHtml(c2)), /Saldo acumulado sin dato/);
});

test('la barra: cuatro pestañas en orden, la elegida marcada, accesible; el punto de Dirección', () => {
  const b = P.barraHtml('archivos', { opciones: 'Sólo tú: aquí escoges la versión que ven todos' });
  assert.deepEqual([...b.matchAll(/data-pestana="(\w+)"/g)].map((m) => m[1]), ['plan', 'historial', 'archivos', 'opciones']);
  assert.match(b, /role="tablist"/);
  assert.equal((b.match(/aria-selected="true"/g) || []).length, 1);
  assert.match(b, /id="vzpTab-archivos" aria-controls="vzpPanel-archivos" aria-selected="true" tabindex="0"/);
  assert.match(b, /vzp-tab-punto[\s\S]*Sólo tú: aquí escoges/);
});

test('el archivo de las pestañas sólo lee, no calcula, carga pdf.js fijo y verificado, y no lleva datos ni marcas de terceros', () => {
  const src = fs.readFileSync(path.join(RAIZ, 'visor-pestanas.js'), 'utf8'), css = fs.readFileSync(path.join(RAIZ, 'visor-pestanas.css'), 'utf8');
  assert.doesNotMatch(src, /method\s*:\s*['"]POST|body\s*:/, 'sólo GET: la única escritura del visor sigue siendo ppp2-elige, en visor.js');
  assert.doesNotMatch(src, /\b(ventas|ganancia|recibe|veces|dueno_recibe|capital|costo\w*)\s*[-+*/]\s*[\w(]/, 'ninguna cuenta con cifras del plan');
  assert.doesNotMatch(src, /(setItem|removeItem)\(\s*'pyod_clave_v1'|localStorage/, 'no toca la sesión del Portero ni guarda nada');
  assert.doesNotMatch(src, /[?&]k=/, 'a los recursos de las pestañas no se les manda la sesión: la liga basta');
  assert.match(src, /pdfjs-dist@3\.11\.174\/legacy\/build\/pdf\.min\.js/);
  assert.match(src, /sri: 'sha384-[A-Za-z0-9+/=]{64}'/);
  assert.match(src, /sriWorker: 'sha384-[A-Za-z0-9+/=]{64}'/);
  assert.match(src, /isEvalSupported: false/, 'pdf.js sin eval (CVE-2024-4367)');
  assert.doesNotMatch(src + css, /#25d366|#128c7e|#075e54|#34b7f1|#dcf8c6/i, 'sin los colores de la marca de WhatsApp: la burbuja es un ícono genérico propio');
  for (const f of ['visor-pestanas.js', 'visor-pestanas.css', 'tests/visor-pestanas-dobles.cjs', 'tests/visor-pestanas-mundo.cjs', 'tests/visor-pestanas.test.cjs', 'tests/visor-pestanas-browser.cjs']) {
    const t = fs.readFileSync(path.join(RAIZ, f), 'utf8').replace(/assert\.doesNotMatch\([^\n]*\n/g, '');
    assert.doesNotMatch(t, /Mor[eé]o|Avermont|Morelos|Puebla Arquitectos|@aurumarquitectos|docs\.google\.com\/|drive\.google\.com\//i, f);
  }
  const html = fs.readFileSync(path.join(RAIZ, 'visor.html'), 'utf8');
  assert.ok(html.indexOf('visor.js?v=') < html.indexOf('visor-pestanas.js?v='), 'las pestañas cargan después de los cuadros');
  assert.match(html, /<link rel="stylesheet" href="visor-pestanas\.css\?v=[^"]+">/);
  assert.doesNotMatch(fs.readFileSync(path.join(RAIZ, 'ppp2.html'), 'utf8'), /visor-pestanas\.(js|css)/, 'la ficha del plan no carga las pestañas');
});
