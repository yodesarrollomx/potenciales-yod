'use strict';
/* Dobles de prueba de los recursos de las pestañas del visor —ppp2-historial, ppp2-chat, ppp2-archivos y
   ppp2-archivo—, con la forma exacta del contrato (docs/ppp2.md, «Visor 2.0: las pestañas»). Los usa
   tests/visor-pestanas-browser.cjs mientras el servidor de verdad no esté publicado.
   Datos INVENTADOS: ni planes, ni personas, ni cifras, ni identificadores reales. Las fechas se cuentan desde
   hoy, para que la línea de tiempo siempre termine en estos días. */
const zlib = require('node:zlib');

const DIA = 86400000;
function iso(t) { const f = new Date(t); return f.getFullYear() + '-' + String(f.getMonth() + 1).padStart(2, '0') + '-' + String(f.getDate()).padStart(2, '0'); }
function haceDias(n, hoy) { return iso((hoy || Date.now()) - n * DIA); }

/* Un PDF de verdad, chico, con n páginas de texto (para que pdf.js tenga qué dibujar). */
function pdfDePrueba(n) {
  const cuerpo = [], kids = [];
  let id = 4;
  const pags = [];
  for (let i = 0; i < n; i++) { pags.push({ pag: id, cont: id + 1 }); kids.push(id + ' 0 R'); id += 2; }
  cuerpo[1] = '<< /Type /Catalog /Pages 2 0 R >>';
  cuerpo[2] = '<< /Type /Pages /Kids [' + kids.join(' ') + '] /Count ' + n + ' >>';
  cuerpo[3] = '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>';
  pags.forEach((p, i) => {
    const txt = 'BT /F1 40 Tf 72 690 Td (Pagina de prueba ' + (i + 1) + ') Tj 0 -60 Td /F1 18 Tf (Documento inventado para las pruebas del visor.) Tj ET';
    cuerpo[p.pag] = '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 3 0 R >> >> /Contents ' + p.cont + ' 0 R >>';
    cuerpo[p.cont] = '<< /Length ' + txt.length + ' >>\nstream\n' + txt + '\nendstream';
  });
  let out = '%PDF-1.4\n';
  const offs = [];
  for (let k = 1; k < cuerpo.length; k++) { offs[k] = out.length; out += k + ' 0 obj\n' + cuerpo[k] + '\nendobj\n'; }
  const xref = out.length;
  out += 'xref\n0 ' + cuerpo.length + '\n0000000000 65535 f \n' + offs.slice(1).map((o) => String(o).padStart(10, '0') + ' 00000 n \n').join('');
  out += 'trailer\n<< /Size ' + cuerpo.length + ' /Root 1 0 R >>\nstartxref\n' + xref + '\n%%EOF\n';
  return Buffer.from(out, 'latin1');
}
/* Una imagen PNG de verdad (franjas con los colores del visor). */
function pngDePrueba(w, h) {
  const crc = (b) => { let c, t = []; for (let n = 0; n < 256; n++) { c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } let r = 0xffffffff; for (const x of b) r = t[(r ^ x) & 0xff] ^ (r >>> 8); return (r ^ 0xffffffff) >>> 0; };
  const pedazo = (tipo, datos) => { const l = Buffer.alloc(4); l.writeUInt32BE(datos.length); const td = Buffer.concat([Buffer.from(tipo, 'latin1'), datos]); const c = Buffer.alloc(4); c.writeUInt32BE(crc(td)); return Buffer.concat([l, td, c]); };
  const colores = [[125, 95, 30], [62, 100, 132], [57, 116, 75], [246, 243, 237]];
  const filas = [];
  for (let y = 0; y < h; y++) { const f = Buffer.alloc(1 + w * 3); for (let x = 0; x < w; x++) { const c = colores[Math.floor(x / (w / 4)) % 4]; f[1 + x * 3] = c[0]; f[2 + x * 3] = c[1]; f[3 + x * 3] = c[2]; } filas.push(f); }
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 2;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), pedazo('IHDR', ihdr), pedazo('IDAT', zlib.deflateSync(Buffer.concat(filas))), pedazo('IEND', Buffer.alloc(0))]);
}

const ARCH = {
  transcripcion: 'archivoPrueba00000000transcripcion', presentacion: 'archivoPrueba000000000presentacion', recorrido: 'archivoPrueba0000000000000recorrido',
  propuesta: 'archivoPrueba000000000000propuesta', foto: 'archivoPrueba0000000000000000foto', poligono: 'archivoPrueba00000000000poligono',
  corrida: 'archivoPrueba0000000000000corrida', minuta: 'archivoPrueba00000000000000minuta', video: 'archivoPrueba0000000000000000video',
  grande: 'archivoPrueba0000000000000grande', ajeno: 'archivoPrueba00000000000000ajeno'
};
const QUIEN = ['Coordinación', 'Arquitectura', 'Comercial', 'Finanzas'];

/* ppp2-historial: { ok, igual?, llave, audiencia, proyectos, dias (más reciente primero), pendientes, versiones } */
function historial(op) {
  op = op || {};
  const equipo = op.audiencia !== 'externo', hoy = op.hoy || Date.now();
  const d = (n) => haceDias(n, hoy);
  const dias = [
    { fecha: d(1), chat: 14, items: [
      { tipo: 'reunion', hora: '10:30', titulo: 'Reunión con el dueño del terreno', resumen: 'Se revisó cómo se reparte la utilidad y en qué mes cobra cada quien. El dueño pidió ver el plan con la preventa más lenta.\n\nDecisiones: seguir con la versión con banco y preparar la versión con preventa lenta.', fuente: 'Videollamada', archivos: [{ id: ARCH.transcripcion, nombre: 'Transcripción de la reunión.pdf', tipo: 'application/pdf' }] },
      { tipo: 'version', hora: '', titulo: 'V2 · Con banco', resumen: 'Aprobada por Dirección; es la que rige.', fuente: 'Libro del plan', archivos: [] }
    ] },
    { fecha: d(4), chat: 3, items: [
      { tipo: 'presentacion', hora: '17:00', titulo: 'Presentación a inversionistas', resumen: 'Se presentó el plan con sus siete cuadros y el comparativo de terrenos.', fuente: 'Expediente', url: 'https://ejemplo.test/minuta-publica', archivos: [{ id: ARCH.presentacion, nombre: 'Presentación del proyecto.pdf', tipo: 'application/pdf' }] }
    ] },
    { fecha: d(8), chat: 0, items: [
      { tipo: 'decision', hora: '13:15', titulo: 'Se fija el arranque de obra', resumen: 'La obra arranca cuando la preventa llegue al mínimo que pide el banco.', fuente: 'Minuta', archivos: [] },
      { tipo: 'pendiente', hora: '13:20', titulo: 'Levantamiento topográfico', resumen: 'Pedir el levantamiento al despacho.', fuente: 'Minuta', archivos: [] }
    ] },
    { fecha: d(12), chat: 6, items: [] },
    { fecha: d(15), chat: 0, items: [{ tipo: 'minuta', hora: '09:00', titulo: 'Minuta del recorrido', resumen: 'Recorrido por el predio con el equipo de arquitectura.', fuente: 'Expediente', archivos: [{ id: ARCH.minuta, nombre: 'Minuta del recorrido.docx', tipo: 'application/vnd.google-apps.document' }] }] },
    { fecha: d(19), chat: 2, items: [{ tipo: 'llamada', hora: '18:40', titulo: 'Llamada con el notario', resumen: '', fuente: 'Agenda', archivos: [] }] },
    { fecha: d(23), chat: 0, items: [{ tipo: 'cita', hora: '11:00', titulo: 'Cita en la oficina de desarrollo urbano', resumen: 'Revisar el uso de suelo.', fuente: 'Agenda', archivos: [] }] },
    { fecha: d(30), chat: 9, items: [{ tipo: 'documento', hora: '16:10', titulo: 'Se subió la propuesta al expediente', resumen: '', fuente: 'Expediente', archivos: [{ id: ARCH.propuesta, nombre: 'Propuesta de reparto.pdf', tipo: 'application/pdf' }] }] },
    { fecha: d(41), chat: 0, items: [{ tipo: 'version', hora: '', titulo: 'V1 · Base', resumen: 'Aprobada por Dirección; hoy está descartada.', fuente: 'Libro del plan', archivos: [] }] },
    { fecha: d(44), chat: 4, items: [{ tipo: 'reunion', hora: '12:00', titulo: 'Arranque del proyecto', resumen: 'Primera reunión de la alianza sobre este terreno.', fuente: 'Reunión presencial', archivos: [] }] }
  ];
  for (let k = 0; k < 14; k++) dias.push({ fecha: d(50 + k * 3), chat: k % 3 ? 2 : 0, items: k % 2 ? [{ tipo: 'documento', hora: '10:00', titulo: 'Archivo del expediente ' + (k + 1), resumen: '', fuente: 'Expediente', archivos: [] }] : [] });
  const r = {
    ok: true, llave: 'vh_prueba_' + (op.llave || '1'), audiencia: equipo ? 'equipo' : 'externo', proyectos: [{ id: 'proyecto-a', nombre: 'Proyecto Ejemplo' }],
    /* de fuera, como el servidor: sin eventos de chat ni de pendiente, sin fuente, sin liga y sin «Decisiones: …» (las versiones sí llevan su fuente) */
    dias: dias.map((x) => equipo ? x : { fecha: x.fecha, items: x.items.filter((it) => it.tipo !== 'pendiente' && it.tipo !== 'whatsapp').map((it) => {
      const c = Object.assign({}, it, { fuente: it.tipo === 'version' ? it.fuente : '', resumen: String(it.resumen || '').split('\n\nDecisiones: ')[0] }); delete c.url; return c;
    }), chat: 0 }).filter((x) => x.items.length || x.chat),
    pendientes: equipo ? [
      { tarea: 'Enviar el levantamiento topográfico al banco', responsable: 'Arquitectura', compromiso: d(5), estado: 'abierto' },
      { tarea: 'Confirmar el precio de salida con el área comercial', responsable: 'Comercial', compromiso: d(-6), estado: 'en curso' },
      { tarea: 'Revisar la carta de intención con el dueño del terreno', responsable: '', compromiso: '', estado: '' }
    ] : [],
    versiones: [{ v: 1, nombre: 'Base', fecha: d(41), estado: 'descartada' }, { v: 2, nombre: 'Con banco', fecha: d(1), estado: 'vigente' }, { v: 3, nombre: 'Temprana', fecha: '', estado: 'alterna' }]
  };
  /* «la pantalla no debe asumir lo contrario»: un servidor que por error mandara la conversación o los pendientes a
     una liga de fuera no debe hacerlos aparecer */
  if (op.malEducado) {
    r.dias.forEach((x) => {
      x.chat = 7;
      x.items.forEach((it) => { it.fuente = 'Fuente interna'; it.url = 'https://ejemplo.test/interna'; });
      x.items.push({ tipo: 'whatsapp', hora: '23:00', titulo: 'No debe verse: un evento del chat', resumen: '', fuente: 'Grupo', archivos: [] },
        { tipo: 'pendiente', hora: '23:10', titulo: 'No debe verse: un pendiente', resumen: '', fuente: 'Minuta', archivos: [] });
    });
    r.pendientes = [{ tarea: 'No debe verse', responsable: 'Nadie', compromiso: '', estado: 'abierto' }];
  }
  if (op.vacio) { r.dias = []; r.pendientes = []; r.versiones = []; }
  return r;
}

/* ppp2-chat: { ok, dia, mensajes:[{hora, quien, texto, adjuntos:[{nombre, id?}]}] }. Sólo audiencia equipo. */
function chat(dia, op) {
  op = op || {};
  if (op.audiencia === 'externo') return { ok: false, error: 'plan' };
  const textos = [
    'Buenos días. Ya quedó la versión con banco en el libro.', 'Perfecto, la reviso hoy.', 'El dueño pidió ver el plan con la preventa más lenta; ¿la armamos para el jueves?',
    'Sí, la preparo.', 'Les comparto la presentación que vimos ayer.', 'Gracias. En la reunión quedó claro el orden de cobro: banco, capital y luego la utilidad.',
    'Sube por favor la transcripción al expediente.', 'Listo, ya está.', 'Mañana a las 10 vemos el levantamiento con el despacho.', 'Ahí estaré.',
    'Recuerden que el banco pide la preventa mínima antes del primer desembolso.', 'Anotado.', 'Todo en orden por aquí. Buen fin de semana.', '👍'
  ];
  const mensajes = textos.map((t, i) => ({ hora: String(8 + Math.floor(i * 37 / 60)).padStart(2, '0') + ':' + String((i * 37) % 60).padStart(2, '0'), quien: QUIEN[i % 4 === 3 ? 0 : i % 3], texto: t, adjuntos: [] }));
  mensajes[4].adjuntos = [{ nombre: 'Presentación del proyecto.pdf', id: ARCH.presentacion }];
  mensajes[7].adjuntos = [{ nombre: 'Transcripción de la reunión.pdf', id: ARCH.transcripcion }, { nombre: 'Nota de voz.opus' }];
  return { ok: true, dia, mensajes: op.vacio ? [] : mensajes };
}

/* ppp2-archivos: { ok, grupos:[{ nombre, archivos:[{id, nombre, fecha, tipo, tamano, vista}] }], incompleta? }.
   Llegan a propósito fuera del orden del contrato: la pantalla los acomoda. */
function archivos(op) {
  op = op || {};
  const hoy = op.hoy || Date.now(), f = (n, h) => haceDias(n, hoy) + ' ' + (h || '10:00');
  if (op.vacio) return { ok: true, grupos: [] };
  const r = { ok: true, grupos: [
    { nombre: 'Terreno y polígonos', archivos: [
      { id: ARCH.foto, nombre: 'Foto aérea del predio.png', fecha: f(3, '12:10'), tipo: 'image/png', tamano: 1820, vista: 'imagen' },
      { id: ARCH.poligono, nombre: 'Polígono del terreno.kmz', fecha: f(20), tipo: 'application/vnd.google-earth.kmz', tamano: 52340, vista: 'descarga' }
    ] },
    { nombre: 'Presentaciones', archivos: [
      { id: ARCH.presentacion, nombre: 'Presentación del proyecto.pdf', fecha: f(4, '17:05'), tipo: 'application/pdf', tamano: 2412000, vista: 'pdf' },
      { id: ARCH.recorrido, nombre: 'Recorrido virtual', fecha: f(9), tipo: 'application/vnd.google-apps.presentation', tamano: null, vista: 'pdf' }
    ] },
    { nombre: 'Modelos financieros', archivos: [{ id: ARCH.corrida, nombre: 'Corrida del plan.xlsx', fecha: f(6), tipo: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', tamano: 88000, vista: 'descarga' }] },
    { nombre: 'Reuniones y minutas', archivos: [
      { id: ARCH.transcripcion, nombre: 'Transcripción de la reunión.pdf', fecha: f(1, '13:00'), tipo: 'application/pdf', tamano: 640000, vista: 'pdf' },
      { id: ARCH.minuta, nombre: 'Minuta del recorrido', fecha: f(15), tipo: 'application/vnd.google-apps.document', tamano: null, vista: 'pdf' }
    ] },
    { nombre: 'Propuestas', archivos: [{ id: ARCH.propuesta, nombre: 'Propuesta de reparto.pdf', fecha: f(30), tipo: 'application/pdf', tamano: 310000, vista: 'pdf' }] },
    { nombre: 'Otros', archivos: [
      { id: ARCH.video, nombre: 'Video del recorrido.mp4', fecha: f(15), tipo: 'video/mp4', tamano: 62000000, vista: 'no' },
      /* como en el servidor: un archivo de más de 40 MB sale con `vista` = no; `grande` le pasa a uno de Google
         que no se pudo exportar a PDF (en la lista dice `pdf`: se sabe hasta pedirlo) */
      { id: ARCH.grande, nombre: 'Planos completos', fecha: f(25), tipo: 'application/vnd.google-apps.presentation', tamano: null, vista: 'pdf' },
      { id: ARCH.ajeno, nombre: 'Archivo que ya no está.pdf', fecha: f(26), tipo: 'application/pdf', tamano: 1000, vista: 'pdf' }
    ] }
  ] };
  if (op.incompleta) r.incompleta = true;
  return r;
}

/* ppp2-archivo: { ok, nombre, tipo, partes, parte, datos } con `datos` en base64; las partes se cuentan desde 0.
   Aquí cada archivo llega en tres partes (u op.tamParte bytes por parte) para probar la barra de avance. */
function archivo(q, op) {
  op = op || {};
  const id = String(q.id || ''), parte = Number(q.parte || 0);
  let bytes, nombre, tipo;
  if (id === ARCH.grande) return { ok: false, error: 'grande' };
  if (id === ARCH.transcripcion || id === ARCH.presentacion || id === ARCH.propuesta) { bytes = pdfDePrueba(id === ARCH.presentacion ? 4 : 2); nombre = id === ARCH.presentacion ? 'Presentación del proyecto.pdf' : (id === ARCH.propuesta ? 'Propuesta de reparto.pdf' : 'Transcripción de la reunión.pdf'); tipo = 'application/pdf'; }
  else if (id === ARCH.recorrido || id === ARCH.minuta) { bytes = pdfDePrueba(1); nombre = (id === ARCH.recorrido ? 'Recorrido virtual' : 'Minuta del recorrido') + '.pdf'; tipo = 'application/pdf'; }
  else if (id === ARCH.foto) { bytes = pngDePrueba(160, 90); nombre = 'Foto aérea del predio.png'; tipo = 'image/png'; }
  else if (id === ARCH.poligono) { bytes = Buffer.from('<kml>polígono inventado</kml>'.repeat(60)); nombre = 'Polígono del terreno.kmz'; tipo = 'application/vnd.google-earth.kmz'; }
  else if (id === ARCH.corrida) { bytes = Buffer.from('corrida inventada;'.repeat(40)); nombre = 'Corrida del plan.xlsx'; tipo = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'; }
  else return { ok: false, error: 'plan' };
  const tam = op.tamParte || Math.max(16, Math.ceil(bytes.length / 3));     // por omisión, tres partes: así cada vista previa pasa por la barra de avance
  const partes = Math.max(1, Math.ceil(bytes.length / tam));
  if (!(parte >= 0 && parte < partes)) return { ok: false, error: 'plan' };
  return { ok: true, nombre, tipo, partes, parte, datos: bytes.subarray(parte * tam, (parte + 1) * tam).toString('base64') };
}

const RECURSOS = ['ppp2-historial', 'ppp2-chat', 'ppp2-archivos', 'ppp2-archivo'];
/* Contesta un GET de los recursos nuevos como lo haría el servidor publicado; null = no es de estos. */
function contesta(p, op) {
  op = op || {};
  if (RECURSOS.indexOf(p.recurso) < 0) return null;
  if (op.error && op.error[p.recurso]) return { ok: false, error: op.error[p.recurso] };
  if (p.recurso === 'ppp2-historial') { const h = historial(op); return p.si && p.si === h.llave ? { ok: true, igual: true, llave: h.llave } : h; }
  if (p.recurso === 'ppp2-chat') return chat(p.dia, op);
  if (p.recurso === 'ppp2-archivos') return archivos(op);
  return archivo(p, op);
}

module.exports = { historial, chat, archivos, archivo, contesta, pdfDePrueba, pngDePrueba, ARCH, RECURSOS, QUIEN, haceDias };
