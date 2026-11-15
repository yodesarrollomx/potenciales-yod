'use strict';
/* Pruebas de las pestañas del visor (server/ppp2/Visor.gs): ppp2-historial, ppp2-chat, ppp2-archivos y
   ppp2-archivo. Mismo mundo de dobles que el servidor (tests/ppp2-mundo.cjs), con una hoja de historial y un Drive
   de mentira. Proyectos, personas, archivos y textos son INVENTADOS. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { mundo, PLAN, POTENCIALES, FOTO_CAB, HISTORIAL, TOKEN_DRIVE, EDITOR, LECTOR, filaDe } = require('./ppp2-mundo.cjs');

const LIGA_EQ = 'ligaequipo000000000000000000001';
const LIGA_EX = 'ligaexterna00000000000000000001';
const LIGA_CAB = ['liga', 'plan_id', 'para', 'estado', 'vence', 'versiones', 'etiquetas', 'creada', 'nota', 'audiencia'];
const liga = (c) => LIGA_CAB.map((k) => (k in c ? c[k] : { plan_id: PLAN, para: 'Prueba', estado: 'activa', vence: '', versiones: '', etiquetas: '', creada: '2026-01-01', nota: '', audiencia: '' }[k]));
const MB = 1024 * 1024;

/* ── Drive de mentira: la carpeta del proyecto con su «Para compartir», otra carpeta ajena y archivos de cada tipo ── */
const D = {
  raiz: 'carpeta-raiz-de-la-unidad-0001', proyecto: 'carpeta-del-proyecto-ejemplo-01', compartir: 'carpeta-para-compartir-0000001',
  compPres: 'carpeta-compartir-presenta-001', presentaciones: 'carpeta-presentaciones-000001', terreno: 'carpeta-terreno-y-planos-00001',
  sub: 'carpeta-subcarpeta-normal-0001', subComp: 'carpeta-sub-para-compartir-001', ajena: 'carpeta-ajena-a-los-proyectos1', foto: 'carpeta-del-caso-foto-0000001',
  pdfComp: 'archivo-pdf-compartido-0000001', docInt: 'archivo-doc-interno-000000001', hoja: 'archivo-modelo-financiero-0001',
  plano: 'archivo-plano-del-terreno-0001', imagen: 'archivo-foto-del-predio-000001', minuta: 'archivo-minuta-junta-00000001',
  propuesta: 'archivo-propuesta-al-dueno-001', estudio: 'archivo-estudio-de-suelos-0001', mediano: 'archivo-mediano-siete-mb-00001',
  grande: 'archivo-grande-cincuenta-mb-01', forma: 'archivo-formulario-google-0001', papelera: 'archivo-en-la-papelera-000001',
  atajo: 'archivo-atajo-a-lo-ajeno-00001', ajeno: 'archivo-ajeno-a-la-carpeta-001', enSub: 'archivo-en-sub-para-compartir1',
  libroPlan: 'libro-del-plan-en-carpeta-0001', docGrande: 'archivo-doc-exporta-grande-001', docFalla: 'archivo-doc-exporta-falla-0001',
  delCaso: 'archivo-del-caso-foto-00000001', documentos: 'carpeta-02-mercado-y-referencia', pptx: 'archivo-presentacion-pptx-0001',
  vial: 'archivo-estudio-impacto-vial01', contrato: 'archivo-contrato-de-promesa01'
};
const DOC = 'application/vnd.google-apps.document';
const PPTX = 'application/vnd.openxmlformats-officedocument.presentationml.presentation';
const DOCX = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
const drive = () => ({
  carpetas: {
    [D.raiz]: { nombre: 'Mi unidad', padres: [] },
    [D.proyecto]: { nombre: 'Expediente de prueba', padres: [D.raiz] },
    [D.compartir]: { nombre: 'Para Compartir', padres: [D.proyecto] },
    [D.compPres]: { nombre: 'Presentaciones', padres: [D.compartir] },
    [D.presentaciones]: { nombre: '04 Presentaciones', padres: [D.proyecto] },
    [D.terreno]: { nombre: '01_TERRENO y Legales', padres: [D.proyecto] },
    [D.documentos]: { nombre: '02 Mercado y referencias', padres: [D.proyecto] },
    [D.sub]: { nombre: 'Varios', padres: [D.proyecto] },
    [D.subComp]: { nombre: 'Para compartir', padres: [D.sub] },
    [D.ajena]: { nombre: 'Otra carpeta', padres: [D.raiz] },
    [D.foto]: { nombre: 'Expediente del caso', padres: [D.raiz] }
  },
  archivos: {
    [D.pdfComp]: { nombre: 'Presentación a socios.pdf', tipo: 'application/pdf', padres: [D.compPres], contenido: '%PDF-1.4 presentacion compartida', fecha: '2026-11-08T18:00:00Z' },
    [D.docInt]: { nombre: 'Notas de la reunión', tipo: DOC, padres: [D.presentaciones], fecha: '2026-11-10T17:00:00Z' },
    [D.hoja]: { nombre: 'Modelo financiero v3.xlsx', tipo: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', padres: [D.proyecto], tamano: 20000, fecha: '2026-11-02T10:00:00Z' },
    [D.plano]: { nombre: 'Plano.kmz', tipo: 'application/vnd.google-earth.kmz', padres: [D.terreno], tamano: 5000, fecha: '2026-10-01T10:00:00Z' },
    [D.imagen]: { nombre: 'IMG_0001.jpg', tipo: 'image/jpeg', padres: [D.proyecto], tamano: 3000, fecha: '2026-09-01T10:00:00Z' },
    [D.minuta]: { nombre: 'Minuta 10-nov.docx', tipo: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', padres: [D.proyecto], tamano: 4000, fecha: '2026-11-10T20:00:00Z' },
    [D.propuesta]: { nombre: 'Propuesta al dueño.pdf', tipo: 'application/pdf', padres: [D.proyecto], tamano: 4000, fecha: '2026-11-05T10:00:00Z' },
    [D.estudio]: { nombre: 'Estudio de mecánica de suelos.pdf', tipo: 'application/pdf', padres: [D.proyecto], tamano: 4000, fecha: '2026-08-01T10:00:00Z' },
    [D.mediano]: { nombre: 'Recorrido.mp4', tipo: 'video/mp4', padres: [D.compartir], tamano: 7 * MB, fecha: '2026-11-09T10:00:00Z' },
    [D.grande]: { nombre: 'Video largo.mov', tipo: 'video/quicktime', padres: [D.proyecto], tamano: 50 * MB, fecha: '2026-07-01T10:00:00Z' },
    [D.forma]: { nombre: 'Encuesta', tipo: 'application/vnd.google-apps.form', padres: [D.proyecto], fecha: '2026-06-01T10:00:00Z' },
    [D.papelera]: { nombre: 'Borrado.pdf', tipo: 'application/pdf', padres: [D.proyecto], tamano: 10, papelera: true },
    [D.atajo]: { nombre: 'Atajo a lo ajeno', tipo: 'application/vnd.google-apps.shortcut', padres: [D.compartir] },
    [D.ajeno]: { nombre: 'Secreto.pdf', tipo: 'application/pdf', padres: [D.ajena], contenido: '%PDF-1.4 secreto' },
    [D.enSub]: { nombre: 'Croquis.pdf', tipo: 'application/pdf', padres: [D.subComp], tamano: 100, fecha: '2026-10-15T10:00:00Z' },
    [D.libroPlan]: { nombre: 'Libro del plan', tipo: 'application/vnd.google-apps.spreadsheet', padres: [D.proyecto] },
    [D.docGrande]: { nombre: 'Documento enorme', tipo: DOC, padres: [D.proyecto], exporta: 41 * MB },
    [D.docFalla]: { nombre: 'Documento que no exporta', tipo: DOC, padres: [D.proyecto], exporta: 'falla' },
    [D.delCaso]: { nombre: 'Ficha del caso.pdf', tipo: 'application/pdf', padres: [D.foto], tamano: 100 },
    [D.pptx]: { nombre: 'Presentación socios.pptx', tipo: PPTX, padres: [D.presentaciones], contenido: 'PK presentacion de office', fecha: '2026-11-09T12:00:00Z' },
    [D.vial]: { nombre: 'Estudio de impacto vial.pdf', tipo: 'application/pdf', padres: [D.documentos], tamano: 100, fecha: '2026-10-20T10:00:00Z' },
    [D.contrato]: { nombre: 'Contrato de promesa.docx', tipo: DOCX, padres: [D.terreno], contenido: 'PK contrato de office', fecha: '2026-10-25T10:00:00Z' }
  }
});

/* ── la hoja de historial ── */
const PROY_CAB = ['proyecto_id', 'nombre', 'broker', 'estado', 'color', 'orden', 'descripción', 'ppp_ref', 'revisar', 'folio', 'visor', 'planes', 'carpeta'];
const proy = (id, nombre, planes, carpeta) => [id, nombre, 'b', 'activo', '', '1', '', '', '', '', '', planes, carpeta];
const EV_CAB = ['evento_id', 'fecha', 'hora', 'broker', 'tipo', 'proyectos', 'titulo', 'resumen', 'decisiones', 'visibilidad', 'fuente', 'fuente_url', 'origen', 'archivos', 'para_externos'];
const ev = (c) => EV_CAB.map((k) => (k in c ? c[k] : { broker: 'b', proyectos: 'proyecto-ejemplo', resumen: '', decisiones: '', visibilidad: 'compartido', fuente: '', fuente_url: '', origen: 'Claude', archivos: '', para_externos: '', hora: '' }[k]));
const CHAT_CAB = ['id', 'fecha', 'hora', 'quien', 'texto', 'adjuntos', 'adjuntos_ids', 'proyectos', 'visible', 'origen'];
const msj = (c) => CHAT_CAB.map((k) => (k in c ? c[k] : { adjuntos: '', adjuntos_ids: '', proyectos: 'proyecto-ejemplo', visible: 'sí', origen: 'exportacion' }[k]));
const PEND_CAB = ['pendiente_id', 'evento_id', 'fecha_origen', 'responsable', 'tarea', 'fecha_compromiso', 'estado', 'proyectos', 'visibilidad'];
const historial = () => ({
  Proyectos: [PROY_CAB,
    proy('proyecto-ejemplo', 'Proyecto Ejemplo', PLAN, 'https://drive.google.com/drive/folders/' + D.proyecto),
    proy('proyecto-sin-carpeta', 'Sin carpeta', 'p2otroplan01', ''),
    proy('proyecto-foto', 'Caso foto', 'ppp:casoprueba01', D.foto),
    proy('proyecto-ajeno', 'Ajeno', 'p2ajeno00001', D.ajena)],
  Eventos: [EV_CAB,
    ev({ evento_id: 'EV-1', fecha: '2026-11-10', hora: '10:00', tipo: 'reunion', titulo: 'Reunión de avance', resumen: 'Se revisó el avance.', decisiones: 'Bajar el tamaño de los departamentos.',
      fuente: 'Reunión presencial', fuente_url: 'https://docs.google.com/document/d/' + D.docInt + '/edit', archivos: D.pdfComp, para_externos: 'sí' }),
    ev({ evento_id: 'EV-2', fecha: '2026-11-10', hora: '12:30', tipo: 'whatsapp', titulo: 'Comentario en el grupo', fuente: 'WhatsApp · grupo', para_externos: 'sí' }),
    ev({ evento_id: 'EV-3', fecha: '2026-11-10', hora: '08:00', tipo: 'decision', titulo: 'Decisión interna', visibilidad: 'solo_direccion', para_externos: 'sí' }),
    ev({ evento_id: 'EV-4', fecha: '2026-11-08', tipo: 'presentacion', proyectos: 'otro-proyecto,proyecto-ejemplo', titulo: 'Presentación a socios', fuente_url: 'https://ejemplo.mx/presentacion',
      archivos: [D.pdfComp, D.ajeno, D.atajo, D.libroPlan, 'no-es-un-id'].join(', ') }),
    ev({ evento_id: 'EV-5', fecha: '2026-11-07', hora: '9:15 p. m.', tipo: 'reunion_agendada', titulo: 'Cita con el dueño', fuente: 'Agenda', fuente_url: 'https://ejemplo.mx/agenda', para_externos: 'Sí' }),
    ev({ evento_id: 'EV-6', fecha: '2026-11-06', hora: '11:00', tipo: 'pendiente', titulo: 'Conseguir la escritura', para_externos: 'sí' }),
    ev({ evento_id: 'EV-7', fecha: '2026-11-05', hora: '11:00', tipo: 'decision', proyectos: 'otro-proyecto', titulo: 'De otro proyecto', para_externos: 'sí' }),
    ev({ evento_id: 'EV-8', fecha: '2026-13-40', tipo: 'decision', titulo: 'Fecha rota', para_externos: 'sí' }),
    ev({ evento_id: 'EV-9', fecha: '2099-01-01', tipo: 'decision', titulo: 'Fecha lejana', para_externos: 'sí' }),
    ev({ evento_id: 'EV-10', fecha: '2026-11-03', tipo: 'Junta', proyectos: 'Proyecto-Ejemplo', titulo: 'Junta sin hora' }),
    ev({ evento_id: 'EV-11', fecha: '2026-11-03', hora: '07:00', tipo: 'algo raro', titulo: 'Tipo desconocido' }),
    ev({ evento_id: 'EV-12', fecha: '2026-11-02', hora: '10:00', tipo: 'documento', titulo: 'Con chat de asistente', fuente_url: 'https://claude.ai/chat/abc' }),
    ev({ evento_id: 'EV-13', fecha: '2026-11-02', hora: '10:30', tipo: 'documento', titulo: 'Con otra liga', fuente_url: 'https://yodesarrollomx.github.io/potenciales-yod/visor.html#l=ligaotra0000000000000000000001' }),
    ev({ evento_id: 'EV-14', fecha: '2026-11-02', hora: '11:00', tipo: 'documento', titulo: 'Con mapa', fuente_url: 'https://www.google.com/maps/place/ejemplo' }),
    ev({ evento_id: 'EV-15', fecha: '2026-11-01', hora: '09:00', tipo: 'decision', proyectos: 'proyecto-sin-carpeta', titulo: 'Del plan sin carpeta', archivos: D.pdfComp, para_externos: 'sí' })],
  Chat: [CHAT_CAB,
    msj({ id: 'M1', fecha: '2026-11-10', hora: '09:00', quien: 'Persona Uno', texto: 'Buenos días a todos', proyectos: '' }),
    msj({ id: 'M2', fecha: '2026-11-10', hora: '09:05', quien: 'Persona Dos', texto: 'Ya está la presentación', adjuntos: 'Presentación a socios.pdf', adjuntos_ids: D.pdfComp }),
    msj({ id: 'M3', fecha: '2026-11-10', hora: '09:06', quien: 'Persona Dos', texto: 'Mensaje oculto', visible: 'no' }),
    msj({ id: 'M4', fecha: '2026-11-10', hora: '09:07', quien: 'Persona Tres', texto: 'De otro proyecto', proyectos: 'otro-proyecto' }),
    msj({ id: 'M5', fecha: '2026-11-05', hora: '10:00', quien: 'Persona Uno', texto: 'Sólo un saludo general', proyectos: '' }),
    msj({ id: 'M6', fecha: '2026-11-04', hora: '18:00', quien: 'Persona Tres', texto: 'Revisen el plano', adjuntos: 'Plano.kmz, Secreto.pdf', adjuntos_ids: D.plano + ',' + D.ajeno }),
    msj({ id: 'M7', fecha: '2026-11-04', hora: '08:00', quien: 'Persona Uno', texto: 'Primero del día', visible: '' }),
    msj({ id: 'M8', fecha: '2026-11-04', hora: '', quien: 'Persona Uno', texto: '' })],
  Pendientes: [PEND_CAB,
    ['PD-1', 'EV-1', '2026-11-10', 'Persona Uno', 'Conseguir la escritura', '2026-11-20', 'abierto', 'proyecto-ejemplo', 'compartido'],
    ['PD-2', '', '2026-11-01', 'Persona Dos', 'Ya se hizo', '', 'hecho', 'proyecto-ejemplo', 'compartido'],
    ['PD-3', '', '2026-11-01', 'Persona Uno', 'Pendiente interno', '', 'abierto', 'proyecto-ejemplo', 'solo_direccion'],
    ['PD-4', '', '2026-11-01', 'Persona Tres', 'De otro proyecto', '', 'abierto', 'otro-proyecto', 'compartido'],
    ['PD-5', '', '2026-11-02', 'Persona Dos', 'Confirmar el uso de suelo', '', 'por confirmar', 'proyecto-ejemplo', 'compartido'],
    ['PD-6', '', '2026-11-02', 'Persona Uno', 'Revisar el banco', '2026-11-15', 'en curso', 'proyecto-ejemplo', 'compartido']]
});

/* El mundo de estas pruebas: ligas de equipo y externa, la hoja de historial, el Drive y un plan cuyo libro vive
   en la carpeta del proyecto (no debe salir nunca). */
function conPestanas(op) {
  const o = op || {};
  const w = mundo(Object.assign({
    fechasReales: true, ligasCab: LIGA_CAB,
    ligas: [liga({ liga: LIGA_EQ, audiencia: 'equipo' }), liga({ liga: LIGA_EX, audiencia: '' })].concat(o.masLigas || []),
    historial: historial(), drive: drive(), config: [['historial_id', HISTORIAL]].concat(o.config || [])
  }, o.mundo || {}));
  const planes = w.vivero.getSheetByName('Planes');
  planes.appendRow(['p2otroplan01', 'Otro Ejemplo', 'libro-plantilla', 'activo', '2026-01-15', 'Pruebas', '', 'ppp2-libro-v1', '']);
  planes.appendRow(['p2conlibro01', 'Con libro en carpeta', D.libroPlan, 'activo', '2026-01-15', 'Pruebas', '', 'ppp2-libro-v1', '']);
  w.cache.delete('planes');
  return w;
}
const pide = (w, recurso, l, extra) => w.get(Object.assign({ recurso, liga: l }, extra || {}));
const titulos = (r) => r.dias.map((d) => [d.fecha, d.items.map((i) => i.titulo), d.chat]);
const fotoDe = (w, l, id, parte) => pide(w, 'ppp2-archivo', l, Object.assign({ id }, parte === undefined ? {} : { parte: String(parte) }));
const bytesDe = (w, id) => { const a = w.drive.archivos[id]; return a._buf || (a.contenido !== undefined ? Buffer.from(a.contenido) : null); };

test('historial del equipo: eventos de sus proyectos, la conversación del día, versiones y pendientes abiertos; nunca solo_direccion', () => {
  const w = conPestanas();
  const r = pide(w, 'ppp2-historial', LIGA_EQ);
  assert.equal(r.ok, true);
  assert.equal(r.audiencia, 'equipo');
  assert.match(r.llave, /^vh_/);
  assert.deepEqual(r.proyectos, [{ id: 'proyecto-ejemplo', nombre: 'Proyecto Ejemplo' }]);
  assert.deepEqual(titulos(r), [
    ['2026-11-10', ['Reunión de avance', 'Comentario en el grupo'], 2],          // un mensaje del plan y uno general; el oculto y el de otro proyecto no
    ['2026-11-08', ['Presentación a socios'], 0],
    ['2026-11-07', ['Cita con el dueño'], 0],
    ['2026-11-06', ['Conseguir la escritura'], 0],
    ['2026-11-04', [], 2],                                                        // sólo conversación del plan (el mensaje vacío no cuenta)
    ['2026-11-03', ['Tipo desconocido', 'Junta sin hora'], 0],                    // por hora; sin hora al final
    ['2026-11-02', ['Con chat de asistente', 'Con otra liga', 'Con mapa'], 0]
  ]);
  const [reunion, whatsapp] = r.dias[0].items;
  assert.deepEqual(Object.keys(reunion), ['tipo', 'hora', 'titulo', 'resumen', 'fuente', 'archivos']);
  assert.equal(reunion.tipo, 'reunion');
  assert.equal(reunion.hora, '10:00');
  assert.equal(reunion.resumen, 'Se revisó el avance.\n\nDecisiones: Bajar el tamaño de los departamentos.');
  assert.equal(reunion.fuente, 'Reunión presencial');
  assert.equal(reunion.url, undefined, 'un documento de Drive no viaja como liga: se abre por Archivos');
  assert.deepEqual(reunion.archivos, [{ id: D.pdfComp, nombre: 'Presentación a socios.pdf', tipo: 'application/pdf' }, { id: D.docInt, nombre: 'Notas de la reunión', tipo: DOC }]);
  assert.equal(whatsapp.tipo, 'whatsapp');
  const pres = r.dias[1].items[0];
  assert.equal(pres.tipo, 'presentacion');
  assert.equal(pres.url, 'https://ejemplo.mx/presentacion');
  assert.deepEqual(pres.archivos.map((a) => a.id), [D.pdfComp], 'ni lo de otra carpeta, ni un atajo, ni el libro de un plan');
  assert.equal(r.dias[2].items[0].tipo, 'cita');
  assert.equal(r.dias[2].items[0].hora, '21:15');
  assert.equal(r.dias[3].items[0].tipo, 'pendiente');
  assert.deepEqual(r.dias[5].items.map((i) => i.tipo), ['documento', 'reunion']);
  assert.deepEqual(r.dias[6].items.map((i) => i.url), [undefined, undefined, 'https://www.google.com/maps/place/ejemplo'], 'sin ligas a chats privados ni a otra liga del visor');
  assert.deepEqual(r.pendientes, [
    { tarea: 'Revisar el banco', responsable: 'Persona Uno', compromiso: '2026-11-15', estado: 'en curso' },
    { tarea: 'Conseguir la escritura', responsable: 'Persona Uno', compromiso: '2026-11-20', estado: 'abierto' },
    { tarea: 'Confirmar el uso de suelo', responsable: 'Persona Dos', compromiso: '', estado: 'por confirmar' }
  ]);
  assert.deepEqual(r.versiones, [{ v: 2, nombre: 'Con banco', fecha: '', estado: 'propuesta' }], 'sin regla en la liga, sólo la versión que el libro muestra');
  const texto = JSON.stringify(r);
  for (const no of ['Decisión interna', 'Pendiente interno', 'Ya se hizo', 'De otro proyecto', 'Fecha rota', 'Fecha lejana', 'Mensaje oculto', D.ajeno, D.atajo, D.libroPlan, 'libro-ejemplo'])
    assert.ok(!texto.includes(no), no);
  assert.equal(w.llamadas.length, 0, 'la liga no pasa por el Portero');
});

test('historial externo: sólo lo marcado para externos, sin WhatsApp, pendientes, fuente interna ni conversación', () => {
  const w = conPestanas();
  const r = pide(w, 'ppp2-historial', LIGA_EX);
  assert.equal(r.ok, true);
  assert.equal(r.audiencia, 'externo');
  assert.deepEqual(titulos(r), [['2026-11-10', ['Reunión de avance'], 0], ['2026-11-07', ['Cita con el dueño'], 0]]);
  const reunion = r.dias[0].items[0];
  assert.equal(reunion.resumen, 'Se revisó el avance.', 'las decisiones son del equipo');
  assert.equal(reunion.fuente, '');
  assert.deepEqual(reunion.archivos.map((a) => a.id), [D.pdfComp], 'sólo lo que está en «Para compartir»');
  assert.equal(r.dias[1].items[0].url, undefined);
  assert.deepEqual(r.pendientes, []);
  assert.ok(r.dias.every((d) => d.chat === 0));
  assert.doesNotMatch(JSON.stringify(r), /Persona|WhatsApp|Conseguir|Decisión interna|Bajar el tamaño/);
  assert.notEqual(r.llave, pide(w, 'ppp2-historial', LIGA_EQ).llave);
});

test('la conversación de un día: sólo para el equipo, sin mensajes ocultos, con los generales y adjuntos que se pueden abrir', () => {
  const w = conPestanas();
  const r = pide(w, 'ppp2-chat', LIGA_EQ, { dia: '2026-11-10' });
  assert.deepEqual(r, { ok: true, dia: '2026-11-10', mensajes: [
    { hora: '09:00', quien: 'Persona Uno', texto: 'Buenos días a todos', adjuntos: [] },
    { hora: '09:05', quien: 'Persona Dos', texto: 'Ya está la presentación', adjuntos: [{ nombre: 'Presentación a socios.pdf', id: D.pdfComp }] }
  ] });
  const otro = pide(w, 'ppp2-chat', LIGA_EQ, { dia: '2026-11-04' });
  assert.deepEqual(otro.mensajes.map((m) => [m.hora, m.texto]), [['08:00', 'Primero del día'], ['18:00', 'Revisen el plano']]);
  assert.deepEqual(otro.mensajes[1].adjuntos, [{ nombre: 'Plano.kmz', id: D.plano }, { nombre: 'Secreto.pdf' }], 'un adjunto fuera de la carpeta sale sin id');
  assert.deepEqual(pide(w, 'ppp2-chat', LIGA_EQ, { dia: '2026-11-05' }).mensajes.map((m) => m.texto), ['Sólo un saludo general']);
  assert.deepEqual(pide(w, 'ppp2-chat', LIGA_EQ, { dia: '2026-01-01' }).mensajes, []);
  assert.deepEqual(pide(w, 'ppp2-chat', LIGA_EX, { dia: '2026-11-10' }), { ok: false, error: 'plan' }, 'un externo no ve la conversación');
  for (const dia of ['', 'hoy', '2026-11-1', '2026-13-01', '2026-02-30', '2026/11/10', '1999-12-31', '2026-11-10 ', '2026-11-10T00:00'])
    assert.deepEqual(pide(w, 'ppp2-chat', LIGA_EQ, { dia }), { ok: false, error: 'plan' }, JSON.stringify(dia));
});

test('archivos del equipo: todo el expediente acomodado por grupos, sin atajos, papelera, ni libros de planes', () => {
  const w = conPestanas();
  const r = pide(w, 'ppp2-archivos', LIGA_EQ);
  assert.equal(r.ok, true);
  assert.equal(r.incompleta, undefined);
  assert.deepEqual(r.grupos.map((g) => [g.nombre, g.archivos.map((a) => a.nombre)]), [
    ['Presentaciones', ['Notas de la reunión', 'Presentación socios.pptx', 'Presentación a socios.pdf']],   // por carpeta («04 Presentaciones»), aunque el nombre diga otra cosa; lo más reciente primero
    ['Propuestas', ['Propuesta al dueño.pdf']],
    ['Modelos financieros', ['Modelo financiero v3.xlsx']],
    ['Terreno y polígonos', ['Contrato de promesa.docx', 'Plano.kmz']],                                 // «01_TERRENO y Legales»
    ['Reuniones y minutas', ['Minuta 10-nov.docx']],
    ['Estudios y oficios', ['Estudio de impacto vial.pdf', 'Estudio de mecánica de suelos.pdf']],      // «02 Mercado y referencias», o suelto por su nombre
    ['Otros', ['Recorrido.mp4', 'Documento enorme', 'Documento que no exporta', 'Croquis.pdf', 'IMG_0001.jpg', 'Video largo.mov', 'Encuesta']]
  ]);
  const todos = Object.fromEntries(r.grupos.flatMap((g) => g.archivos).map((a) => [a.id, a]));
  assert.deepEqual(Object.keys(todos[D.pdfComp]), ['id', 'nombre', 'fecha', 'tipo', 'tamano', 'vista']);
  assert.deepEqual(todos[D.pdfComp], { id: D.pdfComp, nombre: 'Presentación a socios.pdf', fecha: '2026-11-08 18:00', tipo: 'application/pdf', tamano: 32, vista: 'pdf' });
  assert.deepEqual([todos[D.docInt].tamano, todos[D.docInt].vista], [null, 'pdf'], 'un Doc de Google se ve como PDF');
  assert.equal(todos[D.imagen].vista, 'imagen');
  assert.equal(todos[D.hoja].vista, 'descarga');
  assert.equal(todos[D.mediano].vista, 'descarga');
  assert.deepEqual([todos[D.grande].tamano, todos[D.grande].vista], [50 * MB, 'no'], 'pasa de 40 MB');
  assert.equal(todos[D.forma].vista, 'no', 'un formulario de Google no se exporta');
  for (const id of [D.atajo, D.papelera, D.libroPlan, D.ajeno, D.delCaso]) assert.equal(todos[id], undefined, id);
});

test('el acomodo por grupos sigue las raíces de palabra de los expedientes, sin mayúsculas, acentos ni número', () => {
  const { ctx } = mundo();
  const casos = {
    '01 Terreno y legales': 'Terreno y polígonos', '02 Mercado y referencias': 'Estudios y oficios', '03 Modelo financiero': 'Modelos financieros',
    '04 Presentaciones': 'Presentaciones', '05 Minutas y acuerdos': 'Reuniones y minutas', '06 Propuestas': 'Propuestas', 'Para compartir': '',
    'PRESENTACIÓN socios.pdf': 'Presentaciones', 'Cotización de obra.pdf': 'Propuestas', 'PPP v3.pdf': 'Modelos financieros', 'Corrida_flujo.xlsx': 'Modelos financieros',
    'Escrituras.pdf': 'Terreno y polígonos', 'Polígono.kmz': 'Terreno y polígonos', 'Planos de conjunto.pdf': 'Terreno y polígonos', 'Transcripción de la junta.docx': 'Reuniones y minutas',
    'Acuerdos.pdf': 'Reuniones y minutas', 'Dictamen de factibilidad.pdf': 'Estudios y oficios', 'Oficio municipal.pdf': 'Estudios y oficios',
    'Presentación del modelo.pdf': 'Presentaciones', 'IMG_0001.jpg': '', 'Representante.pdf': ''
  };
  for (const [nombre, grupo] of Object.entries(casos)) assert.equal(ctx.claseDe_(nombre), grupo, nombre);
});

test('archivos de un externo: sólo lo que cuelga de «Para compartir» de la carpeta del proyecto', () => {
  const w = conPestanas();
  const r = pide(w, 'ppp2-archivos', LIGA_EX);
  assert.deepEqual(r.grupos.map((g) => [g.nombre, g.archivos.map((a) => a.id)]), [['Presentaciones', [D.pdfComp]], ['Otros', [D.mediano]]]);
  assert.ok(!JSON.stringify(r).includes(D.enSub), '«Para compartir» dentro de otra subcarpeta no cuenta');
  // con número al frente («00 Para compartir») también cuenta; otro nombre parecido, no
  const w2 = conPestanas();
  w2.drive.carpetas[D.compartir].nombre = '00_Para compartir';
  assert.deepEqual(pide(w2, 'ppp2-archivos', LIGA_EX).grupos.flatMap((g) => g.archivos.map((x) => x.id)), [D.pdfComp, D.mediano]);
  assert.equal(fotoDe(w2, LIGA_EX, D.pdfComp).ok, true);
  const w3 = conPestanas();
  w3.drive.carpetas[D.compartir].nombre = 'Para compartir después';
  assert.deepEqual(pide(w3, 'ppp2-archivos', LIGA_EX).grupos, []);
  assert.deepEqual(fotoDe(w3, LIGA_EX, D.pdfComp), { ok: false, error: 'plan' });
});

test('un archivo se entrega sólo si cuelga de una carpeta permitida para esa liga y ese plan', () => {
  const w = conPestanas();
  const pdf = fotoDe(w, LIGA_EX, D.pdfComp);
  assert.deepEqual(Object.keys(pdf), ['ok', 'nombre', 'tipo', 'partes', 'parte', 'datos']);
  assert.deepEqual([pdf.ok, pdf.nombre, pdf.tipo, pdf.partes, pdf.parte], [true, 'Presentación a socios.pdf', 'application/pdf', 1, 0]);
  assert.equal(Buffer.from(pdf.datos, 'base64').toString('utf8'), '%PDF-1.4 presentacion compartida');
  assert.deepEqual(fotoDe(w, LIGA_EX, D.docInt), { ok: false, error: 'plan' }, 'fuera de «Para compartir», un externo no lo abre');
  assert.deepEqual(fotoDe(w, LIGA_EX, D.enSub), { ok: false, error: 'plan' });
  assert.equal(fotoDe(w, LIGA_EQ, D.enSub).ok, true, 'el equipo sí');
  for (const id of [D.ajeno, D.atajo, D.papelera, D.libroPlan, D.proyecto, D.compartir, D.delCaso, 'archivo-que-no-existe-000001'])
    for (const l of [LIGA_EQ, LIGA_EX]) assert.deepEqual(fotoDe(w, l, id), { ok: false, error: 'plan' }, id + ' ' + l);
  // el mismo archivo, pedido por la liga de otro plan del mismo vivero, no se entrega
  const otra = conPestanas({ masLigas: [liga({ liga: 'ligaotroplan000000000000000001', plan_id: 'p2otroplan01', audiencia: 'equipo' })] });
  assert.deepEqual(fotoDe(otra, 'ligaotroplan000000000000000001', D.pdfComp), { ok: false, error: 'plan' });
  assert.deepEqual(w.drivePedidos, [], 'un archivo chico se lee con DriveApp; nada sale a la API');
});

test('partes y límites: 3 MB por parte, 40 MB por archivo, los de Google exportados a PDF', () => {
  const w = conPestanas();
  const partes = [0, 1, 2].map((n) => fotoDe(w, LIGA_EX, D.mediano, n));
  assert.deepEqual(partes.map((p) => [p.ok, p.partes, p.parte, p.tipo, Buffer.from(p.datos, 'base64').length]), [
    [true, 3, 0, 'video/mp4', 3 * MB], [true, 3, 1, 'video/mp4', 3 * MB], [true, 3, 2, 'video/mp4', MB]]);
  assert.ok(Buffer.concat(partes.map((p) => Buffer.from(p.datos, 'base64'))).equals(bytesDe(w, D.mediano)), 'las partes juntas son el archivo');
  assert.deepEqual(w.drivePedidos.map((p) => [p.metodo, p.headers.Range, p.headers.Authorization, p.payload]), [
    ['get', 'bytes=0-3145727', 'Bearer ' + TOKEN_DRIVE, undefined], ['get', 'bytes=3145728-6291455', 'Bearer ' + TOKEN_DRIVE, undefined], ['get', 'bytes=6291456-7340031', 'Bearer ' + TOKEN_DRIVE, undefined]]);
  assert.equal(fotoDe(w, LIGA_EX, D.mediano).parte, 0, 'sin parte, la primera');
  assert.deepEqual(fotoDe(w, LIGA_EX, D.mediano, 3), { ok: false, error: 'plan' }, 'no hay cuarta parte');
  for (const parte of ['-1', '1.5', 'x', '100', '01', ' 1', '1e1']) assert.deepEqual(fotoDe(w, LIGA_EX, D.mediano, parte), { ok: false, error: 'plan' }, parte);
  assert.deepEqual(fotoDe(w, LIGA_EQ, D.grande), { ok: false, error: 'grande' });
  const doc = fotoDe(w, LIGA_EQ, D.docInt);
  assert.deepEqual([doc.ok, doc.nombre, doc.tipo, doc.partes], [true, 'Notas de la reunión.pdf', 'application/pdf', 1]);
  assert.match(Buffer.from(doc.datos, 'base64').toString('utf8'), /^%PDF-1\.4 exportado de Notas de la reunión/);
  assert.deepEqual(fotoDe(w, LIGA_EQ, D.docGrande), { ok: false, error: 'grande' });
  assert.deepEqual(fotoDe(w, LIGA_EQ, D.docFalla), { ok: false, error: 'grande' });
  assert.deepEqual(fotoDe(w, LIGA_EQ, D.forma), { ok: false, error: 'plan' });
  // lo que no es de Google (Office) se entrega tal cual, sin convertir
  for (const [id, tipo, texto] of [[D.pptx, PPTX, 'PK presentacion de office'], [D.contrato, DOCX, 'PK contrato de office']]) {
    const r = fotoDe(w, LIGA_EQ, id);
    assert.deepEqual([r.ok, r.tipo, r.partes, Buffer.from(r.datos, 'base64').toString('utf8')], [true, tipo, 1, texto]);
    assert.ok(!/\.pdf$/.test(r.nombre));
  }
  // si Drive no hace caso del rango, se corta aquí mismo
  const sinRango = conPestanas({ mundo: { driveSinRango: true } });
  const p1 = fotoDe(sinRango, LIGA_EX, D.mediano, 1);
  assert.ok(Buffer.from(p1.datos, 'base64').equals(bytesDe(sinRango, D.mediano).subarray(3 * MB, 6 * MB)));
});

test('los bytes de un archivo nunca se guardan; la lista sí, unos minutos', () => {
  const w = conPestanas();
  const pdf = fotoDe(w, LIGA_EX, D.pdfComp), video = fotoDe(w, LIGA_EX, D.mediano, 1), doc = fotoDe(w, LIGA_EQ, D.docInt);
  const guardado = Array.from(w.cache.values()).join('\n');
  for (const r of [pdf, video, doc]) assert.ok(!guardado.includes(r.datos.slice(0, 60)), 'datos en la caché');
  const blobs = w.driveBlobs.length;
  fotoDe(w, LIGA_EX, D.pdfComp);
  assert.equal(w.driveBlobs.length, blobs + 1, 'cada pedido vuelve a leer el archivo');
  const a = conPestanas();
  pide(a, 'ppp2-archivos', LIGA_EQ);
  const vistas = a.driveVistas.length;
  assert.ok(vistas > 0);
  pide(a, 'ppp2-archivos', LIGA_EQ);
  pide(a, 'ppp2-historial', LIGA_EQ);
  assert.equal(a.driveVistas.length, vistas, 'la lista se recorre una vez y la usa también el historial');
  a.drive.archivos[D.pdfComp].padres = [D.ajena];                         // alguien lo saca de la carpeta…
  assert.deepEqual(fotoDe(a, LIGA_EQ, D.pdfComp), { ok: false, error: 'plan' }, '…y deja de entregarse en ese momento, aunque la lista guardada todavía lo traiga');
});

test('preguntar «¿cambió?» al historial no lo vuelve a leer; si la hoja cambia, la llave cambia', () => {
  const w = conPestanas();
  const r1 = pide(w, 'ppp2-historial', LIGA_EQ);
  const abiertas = w.aperturas[HISTORIAL];
  assert.deepEqual(pide(w, 'ppp2-historial', LIGA_EQ, { si: r1.llave }), { ok: true, igual: true, llave: r1.llave });
  assert.deepEqual(pide(w, 'ppp2-historial', LIGA_EQ), r1);
  assert.equal(w.aperturas[HISTORIAL], abiertas, 'lo leído sale de la caché');
  const eventos = w.libros[HISTORIAL].getSheetByName('Eventos');
  eventos.v[1][EV_CAB.indexOf('titulo')] = 'Reunión de avance (corregida)';      // alguien corrige la hoja
  assert.equal(pide(w, 'ppp2-historial', LIGA_EQ, { si: r1.llave }).igual, true, 'la última modificación se comparte unos segundos');
  w.cache.delete('hs_' + HISTORIAL);                                          // …y pasan esos segundos
  const r2 = pide(w, 'ppp2-historial', LIGA_EQ, { si: r1.llave });
  assert.equal(r2.igual, undefined);
  assert.notEqual(r2.llave, r1.llave);
  assert.equal(r2.dias[0].items[0].titulo, 'Reunión de avance (corregida)');
});

test('versiones: las aprobaciones del libro que la liga deja ver, y la foto servida de un caso del PPP de siempre', () => {
  const w = conPestanas({ masLigas: [liga({ liga: 'ligatodaslasversiones00000001', versiones: 'todas', audiencia: '' })] });
  const res = w.libro.getSheetByName('Resumen');
  res.v[filaDe(res, 'v1.fecha_aprobacion') - 1][1] = 46000;                  // como número de serie de Sheets
  res.v[filaDe(res, 'v2.fecha_aprobacion') - 1][1] = '2026-11-09';
  const serie = new Date(Math.round((46000 - 25569) * 86400000)).toISOString().slice(0, 10);
  const r = pide(w, 'ppp2-historial', 'ligatodaslasversiones00000001');
  assert.deepEqual(r.versiones, [{ v: 1, nombre: 'Base', fecha: serie, estado: 'base' }, { v: 2, nombre: 'Con banco', fecha: '2026-11-09', estado: 'propuesta' }, { v: 3, nombre: 'Temprana', fecha: '', estado: 'alterna' }]);
  const dia = r.dias.find((d) => d.fecha === '2026-11-09');
  assert.deepEqual(dia.items, [{ tipo: 'version', hora: '', titulo: 'V2 · Con banco', resumen: 'Aprobada por Dirección; hoy está propuesta.', fuente: 'Libro del plan', archivos: [] }]);
  assert.ok(r.dias.some((d) => d.fecha === serie));
  assert.deepEqual(pide(w, 'ppp2-historial', LIGA_EX).versiones.map((v) => v.v), [2], 'una liga sin regla sólo deja ver la versión mostrada');
  // un caso del PPP de siempre: sólo la versión servida, con la fecha en que se calculó su foto
  const vista = JSON.stringify({ esquema: 'ppp2-visor-v1', plan: { nombre: 'Caso foto' }, v: {}, flujo: { meses: 0, filas: {}, total: {} } });
  const foto = FOTO_CAB.map((k) => ({ caso_id: 'casoprueba01', tipo: 'vertical', escenario_id: 'e1', escenario_nombre: 'Base', estado: 'lista', elegida: 'sí', orden: 1, huella_entradas: 'h1', calculado: '2026-02-01 10:00', visor_json: vista })[k] || '');
  const f = conPestanas({ config: [['potenciales_id', POTENCIALES]], mundo: { fotos: [foto] },
    masLigas: [liga({ liga: 'ligadelcasofoto00000000000001', plan_id: 'ppp:casoprueba01', audiencia: 'equipo' }), liga({ liga: 'ligadelcasofotofija0000000001', plan_id: 'ppp:casoprueba01:e1', audiencia: 'equipo' })] });
  const h = pide(f, 'ppp2-historial', 'ligadelcasofoto00000000000001');
  assert.deepEqual(h.proyectos, [{ id: 'proyecto-foto', nombre: 'Caso foto' }]);
  assert.deepEqual(h.versiones, [{ v: 1, nombre: 'Base', fecha: '2026-02-01', estado: 'vigente' }]);
  assert.deepEqual(h.dias, [{ fecha: '2026-02-01', items: [{ tipo: 'version', hora: '10:00', titulo: 'Versión «Base»', resumen: 'Foto del PPP de siempre, calculada con su motor; es la que rige.', fuente: 'PPP de siempre', archivos: [] }], chat: 0 }]);
  assert.deepEqual(pide(f, 'ppp2-historial', 'ligadelcasofotofija0000000001').proyectos.map((p) => p.id), ['proyecto-foto'], 'una versión fija es del mismo caso');
  assert.deepEqual(pide(f, 'ppp2-archivos', 'ligadelcasofoto00000000000001').grupos.map((g) => g.archivos.map((a) => a.id)), [[D.delCaso]]);
});

test('sin historial_id, con un id roto, plan sin proyecto o proyecto sin carpeta: responde vacío, sin romperse', () => {
  for (const config of [[['historial_id', '']], [['historial_id', 'corto']], [['historial_id', 'historialquenoexiste000000001']]]) {
    const w = mundo({ fechasReales: true, ligasCab: LIGA_CAB, ligas: [liga({ liga: LIGA_EQ, audiencia: 'equipo' })], drive: drive(), config });
    const h = pide(w, 'ppp2-historial', LIGA_EQ);
    assert.deepEqual([h.ok, h.proyectos, h.dias, h.pendientes], [true, [], [], []], JSON.stringify(config));
    assert.deepEqual(h.versiones, [{ v: 2, nombre: 'Con banco', fecha: '', estado: 'propuesta' }], 'las versiones salen del libro aunque no haya historial');
    assert.deepEqual(pide(w, 'ppp2-archivos', LIGA_EQ), { ok: true, grupos: [] });
    assert.deepEqual(pide(w, 'ppp2-chat', LIGA_EQ, { dia: '2026-11-10' }), { ok: true, dia: '2026-11-10', mensajes: [] });
    assert.deepEqual(fotoDe(w, LIGA_EQ, D.pdfComp), { ok: false, error: 'plan' });
  }
  const w = conPestanas({ masLigas: [liga({ liga: 'ligaplansincarpeta00000000001', plan_id: 'p2otroplan01', audiencia: 'equipo' })] });
  const h = pide(w, 'ppp2-historial', 'ligaplansincarpeta00000000001');
  assert.deepEqual(h.proyectos, [{ id: 'proyecto-sin-carpeta', nombre: 'Sin carpeta' }]);
  assert.deepEqual(titulos(h), [['2026-11-01', ['Del plan sin carpeta'], 0]]);
  assert.deepEqual(h.dias[0].items[0].archivos, [], 'sin carpeta no hay archivos que abrir');
  assert.deepEqual(pide(w, 'ppp2-archivos', 'ligaplansincarpeta00000000001'), { ok: true, grupos: [] });
  assert.deepEqual(fotoDe(w, 'ligaplansincarpeta00000000001', D.pdfComp), { ok: false, error: 'plan' });
  // pestañas que todavía no existen en la hoja (Chat nace después)
  const sinChat = conPestanas({ mundo: { historial: Object.assign(historial(), { Chat: undefined }) } });
  delete sinChat.libros[HISTORIAL].hojas.Chat;
  assert.equal(pide(sinChat, 'ppp2-historial', LIGA_EQ).dias[0].chat, 0);
});

test('la puerta es la del visor: liga apagada, vencida o que no existe; plan fuera de la liga; sesión de la ficha', () => {
  const w = conPestanas({ masLigas: [liga({ liga: 'ligaapagada0000000000000000001', estado: 'apagada', audiencia: 'equipo' }), liga({ liga: 'ligavencida0000000000000000001', vence: '2026-01-31', audiencia: 'equipo' }),
    liga({ liga: 'ligadosplanes000000000000000001', plan_id: PLAN + ',p2otroplan01', etiquetas: 'Uno|Dos', audiencia: 'equipo' })] });
  for (const recurso of ['ppp2-historial', 'ppp2-chat', 'ppp2-archivos', 'ppp2-archivo']) {
    const extra = { dia: '2026-11-10', id: D.pdfComp };
    for (const l of ['ligaapagada0000000000000000001', 'ligavencida0000000000000000001', 'ligaquenoexiste000000000000001', 'corta', '', undefined])
      assert.deepEqual(w.get(Object.assign({ recurso, liga: l }, extra)), { ok: false, error: 'liga' }, recurso + ' ' + l);
    assert.deepEqual(pide(w, recurso, LIGA_EQ, Object.assign({ plan: 'p2ajeno00001' }, extra)), { ok: false, error: 'plan' }, 'un plan que la liga no trae');
    for (const plan of ['p2', 'ppp:', '../p2ejemplo001', PLAN + ' ']) assert.deepEqual(pide(w, recurso, LIGA_EQ, Object.assign({ plan }, extra)), { ok: false, error: 'plan' }, plan);
  }
  assert.equal(w.llamadas.length, 0);
  // una liga con dos planes: cada uno con lo suyo; sin plan, el primero
  assert.deepEqual(pide(w, 'ppp2-historial', 'ligadosplanes000000000000000001').proyectos.map((p) => p.id), ['proyecto-ejemplo']);
  assert.deepEqual(pide(w, 'ppp2-historial', 'ligadosplanes000000000000000001', { plan: 'p2otroplan01' }).proyectos.map((p) => p.id), ['proyecto-sin-carpeta']);
  // con la sesión del Portero (la ficha del plan) se ve como equipo; una sesión que no vale, no entra
  const f = w.get({ recurso: 'ppp2-historial', k: LECTOR, plan: PLAN });
  assert.equal(f.audiencia, 'equipo');
  assert.ok(f.pendientes.length && f.dias.some((d) => d.chat > 0));
  assert.equal(f.versiones.length, 3, 'en la ficha se ven todas las versiones vivas');
  assert.equal(w.get({ recurso: 'ppp2-chat', k: EDITOR, plan: PLAN, dia: '2026-11-10' }).mensajes.length, 2);
  assert.equal(w.get({ recurso: 'ppp2-archivo', k: LECTOR, plan: PLAN, id: D.docInt }).ok, true);
  assert.equal(w.get({ recurso: 'ppp2-historial', k: 'llave-que-no-existe-0000', plan: PLAN }).ok, false);
  assert.deepEqual(w.get({ recurso: 'ppp2-archivos', k: LECTOR, plan: 'p2noexiste01' }), { ok: false, error: 'plan' });
  assert.deepEqual(w.get({ recurso: 'ppp2-archivos', k: LECTOR }), { ok: false, error: 'plan' });
});

test('fechas y horas que la hoja guarda como fecha de Sheets o como número también se leen', () => {
  const h = historial();
  h.Eventos = [EV_CAB, ev({ evento_id: 'EV-D', fecha: new Date(Date.UTC(2026, 10, 12)), hora: new Date(Date.UTC(1899, 11, 30, 16, 45)), tipo: 'reunion', titulo: 'Con fecha de Sheets' }),
    ev({ evento_id: 'EV-N', fecha: 46000, hora: 0.5, tipo: 'decision', titulo: 'Con número de serie' })];
  h.Chat = [CHAT_CAB, msj({ id: 'M-D', fecha: new Date(Date.UTC(2026, 10, 12)), hora: new Date(Date.UTC(1899, 11, 30, 9, 30)), quien: 'Persona Uno', texto: 'Con fecha de Sheets' })];
  const w = conPestanas({ mundo: { historial: h } });
  const serie = new Date(Math.round((46000 - 25569) * 86400000)).toISOString().slice(0, 10);
  assert.deepEqual(pide(w, 'ppp2-historial', LIGA_EQ).dias.map((d) => [d.fecha, d.items.map((i) => [i.hora, i.titulo]), d.chat]),
    [['2026-11-12', [['16:45', 'Con fecha de Sheets']], 1], [serie, [['12:00', 'Con número de serie']], 0]]);
  assert.deepEqual(pide(w, 'ppp2-chat', LIGA_EQ, { dia: '2026-11-12' }).mensajes.map((m) => [m.hora, m.texto]), [['09:30', 'Con fecha de Sheets']]);
});

test('ids de archivo mal formados no se buscan en Drive', () => {
  const w = conPestanas();
  for (const id of ['', 'corto', '../../etc/passwd', 'a'.repeat(81), 'archivo pdf compartido 0000001', D.pdfComp + '/x', D.pdfComp + '?', D.pdfComp + '\n', 'https://drive.google.com/file/d/' + D.pdfComp])
    assert.deepEqual(fotoDe(w, LIGA_EQ, id), { ok: false, error: 'plan' }, JSON.stringify(id));
});

test('hasta 365 días, el más reciente primero', () => {
  const eventos = [EV_CAB];
  for (let i = 0; i < 400; i++) eventos.push(ev({ evento_id: 'EV-' + i, fecha: new Date(Date.UTC(2025, 0, 1) + i * 86400000).toISOString().slice(0, 10), tipo: 'decision', titulo: 'Día ' + i }));
  const w = conPestanas({ mundo: { historial: Object.assign(historial(), { Eventos: eventos, Chat: [CHAT_CAB] }) } });
  const r = pide(w, 'ppp2-historial', LIGA_EQ);
  assert.equal(r.dias.length, 365);
  assert.equal(r.dias[0].items[0].titulo, 'Día 399');
  assert.ok(r.dias.every((d, i) => i === 0 || r.dias[i - 1].fecha > d.fecha));
});

test('sólo lee: ninguna hoja cambia, nada se anota en Aperturas y a Drive sólo se le pide leer', () => {
  const w = conPestanas({ mundo: { aperturas: true } });
  const foto = () => JSON.stringify([w.vivero, w.libros[HISTORIAL], w.libro].map((l) => Object.values(l.hojas).map((h) => h.v)));
  const antes = foto();
  pide(w, 'ppp2-historial', LIGA_EQ); pide(w, 'ppp2-historial', LIGA_EX); pide(w, 'ppp2-chat', LIGA_EQ, { dia: '2026-11-10' });
  pide(w, 'ppp2-archivos', LIGA_EQ); pide(w, 'ppp2-archivos', LIGA_EX); fotoDe(w, LIGA_EX, D.mediano, 2); fotoDe(w, LIGA_EQ, D.docInt);
  assert.equal(foto(), antes);
  assert.equal(w.vivero.getSheetByName('Aperturas').getLastRow(), 1);
  assert.ok(w.drivePedidos.length > 0 && w.drivePedidos.every((p) => p.metodo === 'get' && p.payload === undefined));
  // el código de las pestañas no tiene con qué cambiar permisos de Drive ni mover o crear archivos
  const visor = fs.readFileSync(path.join(__dirname, '..', 'server/ppp2/Visor.gs'), 'utf8');
  const pestanas = visor.slice(visor.indexOf('pestañas del visor: historial y archivos'));
  for (const no of ['setSharing', 'addViewer', 'addEditor', 'addCommenter', 'setOwner', 'removeViewer', 'removeEditor', 'removeCommenter', 'Permissions', 'setTrashed', 'moveTo', 'createFile', 'createFolder', 'createShortcut',
    'makeCopy', 'setContent', 'setName', 'setDescription', 'setStarred', 'setShareableByEditors', 'addFile', 'addFolder', 'removeFile', 'removeFolder', 'appendRow', 'setValue', 'setFormula', 'insertSheet', 'deleteRow',
    'payload', "method: 'post'", 'ANYONE'])
    assert.ok(!pestanas.includes(no), no);
  assert.doesNotMatch(pestanas, /\bDrive\.(Files|Permissions|Drives)\b/, 'ni el servicio avanzado de Drive');
  assert.deepEqual(pestanas.match(/method:\s*'[a-z]+'/gi), ["method: 'get'"], 'a la API de Drive sólo se le pide leer');
});

test('si algo truena adentro, a la liga sólo se le dice que falló', () => {
  const w = conPestanas();
  w.vivero.getSheetByName('Planes').getDataRange = () => { throw new Error('detalle interno con ' + D.proyecto); };
  w.cache.delete('planes');
  for (const recurso of ['ppp2-historial', 'ppp2-chat', 'ppp2-archivos', 'ppp2-archivo'])
    assert.deepEqual(pide(w, recurso, LIGA_EQ, { dia: '2026-11-10', id: D.pdfComp }), { ok: false, error: 'interno' }, recurso);
});

test('lo que ya existía responde igual: ppp2-visor no cambia con la hoja de historial, Drive ni la columna audiencia', () => {
  const sin = (r) => { const o = JSON.parse(JSON.stringify(r)); delete o.leido; return o; };
  const plano = mundo({ fechasReales: true, ligas: [liga({ liga: LIGA_EQ }).slice(0, 9)] });
  const con = conPestanas();
  assert.deepEqual(sin(pide(con, 'ppp2-visor', LIGA_EQ, { abre: '1' })), sin(pide(plano, 'ppp2-visor', LIGA_EQ, { abre: '1' })));
  assert.deepEqual(sin(con.get({ recurso: 'ppp2-visor', k: LECTOR, plan: PLAN })), sin(plano.get({ recurso: 'ppp2-visor', k: LECTOR, plan: PLAN })));
  // dar una liga desde la ficha con `audiencia` agregada a mano en medio de la hoja: cada dato en su columna
  const w = mundo({ ligasCab: ['liga', 'plan_id', 'audiencia', 'para', 'estado', 'vence', 'versiones', 'etiquetas', 'creada', 'nota'], ligas: [] });
  const r = w.post({ tipo: 'ppp2-liga', k: EDITOR, plan: PLAN, op: 'crear', para: 'Grupo de prueba', versiones: 'todas' });
  assert.equal(r.ok, true);
  assert.deepEqual(w.vivero.getSheetByName('Ligas').v[1].slice(0, 7), [r.liga, PLAN, '', 'Grupo de prueba', 'activa', '', 'todas']);
  assert.equal(w.get({ recurso: 'ppp2-visor', liga: r.liga }).ok, true);
  assert.equal(conPestanas().get({ recurso: 'ppp2-historial', liga: LIGA_EQ.replace('1', '2') }).error, 'liga');
});

/* ── revisión independiente: huecos encontrados y los intentos de romper la cadena de carpetas ── */
const idsDe = (r) => r.grupos.flatMap((g) => g.archivos.map((a) => a.id));

test('un libro de plan que se registra después de armada la lista deja de salir en ella en ese momento', () => {
  const w = conPestanas();
  const nuevo = 'libro-de-un-plan-nuevo-0000001';
  w.drive.archivos[nuevo] = { nombre: 'Libro recién registrado', tipo: 'application/vnd.google-apps.spreadsheet', padres: [D.proyecto] };
  assert.ok(idsDe(pide(w, 'ppp2-archivos', LIGA_EQ)).includes(nuevo), 'antes de registrarse es un archivo más del expediente');
  w.vivero.getSheetByName('Planes').appendRow(['p2nuevo00001', 'Nuevo', nuevo, 'activo', '2026-01-15', 'Pruebas', '', 'ppp2-libro-v1', '']);
  w.cache.delete('planes');
  const vistas = w.driveVistas.length;
  const r = pide(w, 'ppp2-archivos', LIGA_EQ);
  assert.equal(w.driveVistas.length, vistas, 'la lista sale de la caché…');
  assert.ok(!JSON.stringify(r).includes(nuevo) && !JSON.stringify(r).includes('Libro recién registrado'), '…pero ya sin su id ni su nombre');
  assert.deepEqual(fotoDe(w, LIGA_EQ, nuevo), { ok: false, error: 'plan' });
});

test('el tiempo de la lista se cuida también dentro de una carpeta con cientos de archivos', () => {
  const w = conPestanas();
  w.ctx.PESTANAS.LISTA_MS = 40;                                          // 40 ms en vez de 20 s, para no esperar
  for (let i = 0; i < 300; i++) {
    const a = { tipo: 'application/pdf', padres: [D.proyecto], tamano: 10 };
    Object.defineProperty(a, 'nombre', { get: () => { const t = Date.now(); while (Date.now() - t < 2) { /* Drive lento */ } return 'Relleno ' + i + '.pdf'; } });
    w.drive.archivos['archivo-de-relleno-' + String(i).padStart(12, '0')] = a;
  }
  const r = pide(w, 'ppp2-archivos', LIGA_EQ);
  assert.equal(r.incompleta, true);
  assert.ok(idsDe(r).filter((id) => id.startsWith('archivo-de-relleno-')).length < 100, 'se cortó a media carpeta, no al terminarla');
});

test('un pendiente que nació de un evento solo_direccion no sale, aunque el pendiente diga compartido o nada', () => {
  const h = historial();
  h.Pendientes = h.Pendientes.concat([
    ['PD-7', 'EV-3', '2026-11-10', 'Persona Uno', 'Tarea de la junta reservada', '', 'abierto', 'proyecto-ejemplo', 'compartido'],
    ['PD-8', 'EV-3', '2026-11-10', 'Persona Uno', 'Otra tarea reservada', '', 'abierto', 'proyecto-ejemplo', '']]);
  const w = conPestanas({ mundo: { historial: h } });
  const r = pide(w, 'ppp2-historial', LIGA_EQ);
  assert.doesNotMatch(JSON.stringify(r), /reservada/);
  assert.deepEqual(r.pendientes.map((p) => p.tarea), ['Revisar el banco', 'Conseguir la escritura', 'Confirmar el uso de suelo'], 'los de eventos compartidos siguen saliendo');
});

test('un evento de WhatsApp con el tipo escrito de otro modo tampoco lo ve un externo', () => {
  const h = historial();
  h.Eventos = h.Eventos.concat([
    ev({ evento_id: 'EV-W1', fecha: '2026-11-09', hora: '10:00', tipo: 'WhatsApp grupo', titulo: 'Aviso del grupo', para_externos: 'sí' }),
    ev({ evento_id: 'EV-W2', fecha: '2026-11-09', hora: '11:00', tipo: 'aviso_whatsapp', titulo: 'Otro aviso', para_externos: 'sí' })]);
  const w = conPestanas({ mundo: { historial: h } });
  const dia = pide(w, 'ppp2-historial', LIGA_EQ).dias.find((d) => d.fecha === '2026-11-09');
  assert.deepEqual(dia.items.map((i) => [i.titulo, i.tipo]), [['Aviso del grupo', 'whatsapp'], ['Otro aviso', 'whatsapp']]);
  assert.ok(!pide(w, 'ppp2-historial', LIGA_EX).dias.some((d) => d.fecha === '2026-11-09'));
});

test('lo que un navegador ejecuta (HTML, SVG, XML, scripts) sale como application/octet-stream; PDF, imagen, video y Office, con su tipo', () => {
  const w = conPestanas();
  const activos = {
    'archivo-pagina-html-0000000001': ['pagina.html', 'text/html', '<script>alert(1)</script>'],
    'archivo-dibujo-svg-00000000001': ['dibujo.svg', 'image/svg+xml', '<svg onload="alert(1)"/>'],
    'archivo-datos-xml-000000000001': ['datos.xml', 'application/xml', '<?xml version="1.0"?><x/>'],
    'archivo-codigo-js-00000000001': ['codigo.js', 'text/javascript', 'alert(1)'],
    'archivo-tipo-desconocido-00001': ['raro.bin', 'application/x-raro', 'x']
  };
  for (const [id, [nombre, tipo, contenido]] of Object.entries(activos)) w.drive.archivos[id] = { nombre, tipo, padres: [D.proyecto], contenido };
  for (const [id, [nombre, tipo, contenido]] of Object.entries(activos)) {
    const r = fotoDe(w, LIGA_EQ, id);
    assert.deepEqual([r.ok, r.nombre, r.tipo, Buffer.from(r.datos, 'base64').toString('utf8')], [true, nombre, 'application/octet-stream', contenido], tipo);
  }
  const html = pide(w, 'ppp2-archivos', LIGA_EQ).grupos.flatMap((g) => g.archivos).find((a) => a.id === 'archivo-pagina-html-0000000001');
  assert.deepEqual([html.tipo, html.vista], ['text/html', 'descarga'], 'en la lista, el tipo original (para el ícono) y nunca vista dentro de la página');
  for (const [id, tipo] of [[D.pdfComp, 'application/pdf'], [D.imagen, 'image/jpeg'], [D.hoja, 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'], [D.pptx, PPTX], [D.plano, 'application/vnd.google-earth.kmz']])
    assert.equal(fotoDe(w, LIGA_EQ, id).tipo, tipo, tipo);
  assert.equal(fotoDe(w, LIGA_EX, D.mediano).tipo, 'video/mp4');
});

test('intentos de romper la cadena: ciclos, «Para compartir» en la papelera, acentos, varios padres y una carpeta que no es carpeta', () => {
  const CICLO_A = 'carpeta-ciclo-a-00000000000001', CICLO_B = 'carpeta-ciclo-b-00000000000001';
  // un ciclo de carpetas fuera del expediente: el recorrido termina y no entrega
  const w = conPestanas();
  w.drive.carpetas[CICLO_A] = { nombre: 'A', padres: [CICLO_B] };
  w.drive.carpetas[CICLO_B] = { nombre: 'B', padres: [CICLO_A] };
  w.drive.archivos['archivo-en-el-ciclo-0000000001'] = { nombre: 'Ciclo.pdf', tipo: 'application/pdf', padres: [CICLO_A], contenido: 'x' };
  for (const l of [LIGA_EQ, LIGA_EX]) assert.deepEqual(fotoDe(w, l, 'archivo-en-el-ciclo-0000000001'), { ok: false, error: 'plan' });
  // un ciclo que pasa por la carpeta del proyecto: el equipo lo abre, el externo no (no pasa por «Para compartir»)
  const c = conPestanas();
  c.drive.carpetas[D.proyecto].padres = [D.raiz, D.sub];
  assert.equal(fotoDe(c, LIGA_EQ, D.hoja).ok, true);
  assert.deepEqual(fotoDe(c, LIGA_EX, D.hoja), { ok: false, error: 'plan' });
  assert.equal(pide(c, 'ppp2-archivos', LIGA_EQ).ok, true);
  // «Para compartir» en la papelera: ni se lista ni se entrega
  const p = conPestanas();
  p.drive.carpetas[D.compartir].papelera = true;
  assert.deepEqual(pide(p, 'ppp2-archivos', LIGA_EX).grupos, []);
  assert.deepEqual(fotoDe(p, LIGA_EX, D.pdfComp), { ok: false, error: 'plan' });
  // mayúsculas y acentos dan igual
  const a = conPestanas();
  a.drive.carpetas[D.compartir].nombre = 'PÁRA  COMPARTÍR';
  assert.equal(fotoDe(a, LIGA_EX, D.pdfComp).ok, true);
  // varios padres (los de antes de 2020): basta una cadena real que pase por «Para compartir»; si ninguna pasa, no
  const m = conPestanas();
  m.drive.archivos[D.ajeno].padres = [D.ajena, D.compartir];
  m.drive.archivos[D.docInt].padres = [D.presentaciones, D.ajena];
  assert.equal(fotoDe(m, LIGA_EX, D.ajeno).ok, true);
  assert.deepEqual(fotoDe(m, LIGA_EX, D.docInt), { ok: false, error: 'plan' });
  assert.equal(fotoDe(m, LIGA_EQ, D.docInt).ok, true);
  // la `carpeta` de un proyecto que en realidad es un archivo: no hay nada que listar ni entregar
  const h = historial();
  h.Proyectos = [PROY_CAB, proy('proyecto-ejemplo', 'Proyecto Ejemplo', PLAN, D.pdfComp)];
  const f = conPestanas({ mundo: { historial: h } });
  assert.deepEqual(pide(f, 'ppp2-archivos', LIGA_EQ), { ok: true, grupos: [] });
  for (const id of [D.pdfComp, D.hoja]) assert.deepEqual(fotoDe(f, LIGA_EQ, id), { ok: false, error: 'plan' });
});

test('con liga y sesión a la vez manda la audiencia de la liga; `audiencia` se lee sin mayúsculas ni espacios y lo dudoso es externo', () => {
  const w = conPestanas({ masLigas: [liga({ liga: 'ligaequipoconespacios000000001', audiencia: ' Equipo ' }), liga({ liga: 'ligaaudienciadudosa0000000001', audiencia: 'equipo, externo' })] });
  assert.deepEqual(w.get({ recurso: 'ppp2-chat', liga: LIGA_EX, k: LECTOR, plan: PLAN, dia: '2026-11-10' }), { ok: false, error: 'plan' });
  assert.equal(w.get({ recurso: 'ppp2-historial', liga: LIGA_EX, k: LECTOR }).audiencia, 'externo');
  assert.deepEqual(fotoDe(w, LIGA_EX, D.docInt), { ok: false, error: 'plan' }, 'una sesión junto a una liga externa no abre lo interno');
  assert.equal(pide(w, 'ppp2-historial', 'ligaequipoconespacios000000001').audiencia, 'equipo');
  assert.equal(pide(w, 'ppp2-historial', 'ligaaudienciadudosa0000000001').audiencia, 'externo');
});
