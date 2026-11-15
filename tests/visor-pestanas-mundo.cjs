'use strict';
/* El servidor de verdad de las pestañas (server/ppp2/Visor.gs, corrido en tests/ppp2-mundo.cjs) con una hoja de
   historial y un Drive de mentira: así la pantalla se prueba contra lo que el servidor responde de veras, y no
   sólo contra dobles escritos a mano (tests/visor-pestanas-dobles.cjs). Lo usan tests/visor-pestanas.test.cjs y
   tests/visor-pestanas-browser.cjs. Datos INVENTADOS: ni planes, ni personas, ni cifras, ni identificadores
   reales. Las fechas se cuentan desde hoy, para que la línea de tiempo termine en estos días. */
const { mundo, PLAN, HISTORIAL } = require('./ppp2-mundo.cjs');
const D = require('./visor-pestanas-dobles.cjs');

const LIGA = 'liga0000000000000000000000000001';
const LIGA_CAB = ['liga', 'plan_id', 'para', 'estado', 'vence', 'versiones', 'etiquetas', 'creada', 'nota', 'audiencia'];
const MB = 1024 * 1024;

/* Un PDF de verdad con `n` páginas y, si se pide, un objeto de relleno sin usar para que pase de 3 MB (así se baja
   en varias partes y pdf.js tiene que leer las partes ya pegadas). */
function pdfGrande(n, relleno) {
  const base = D.pdfDePrueba(n).toString('latin1');
  if (!relleno) return Buffer.from(base, 'latin1');
  const xref = base.lastIndexOf('xref\n'), cuerpo = base.slice(0, xref), size = Number(/\/Size (\d+)/.exec(base)[1]);
  const offs = (base.slice(xref).match(/\d{10} 00000 n /g) || []).map((x) => x.slice(0, 10));
  const obj = size + ' 0 obj\n<< /Length ' + relleno + ' >>\nstream\n' + ' '.repeat(relleno) + '\nendstream\nendobj\n';
  const nuevoXref = cuerpo.length + obj.length;
  const out = cuerpo + obj + 'xref\n0 ' + (size + 1) + '\n0000000000 65535 f \n' + offs.concat([String(cuerpo.length).padStart(10, '0')]).map((o) => o + ' 00000 n \n').join('') +
    'trailer\n<< /Size ' + (size + 1) + ' /Root 1 0 R >>\nstartxref\n' + nuevoXref + '\n%%EOF\n';
  return Buffer.from(out, 'latin1');
}

/* ── Drive de mentira: la carpeta del expediente con sus subcarpetas, «Para compartir» y una privada ── */
const C = {
  raiz: 'carpetaRaizDeLaUnidad0000001', proyecto: 'carpetaExpedientePrueba00001', compartir: 'carpetaParaCompartir00000001',
  terreno: 'carpetaTerrenoYLegales000001', presentaciones: 'carpetaPresentaciones0000001', minutas: 'carpetaMinutasYAcuerdos00001',
  varios: 'carpetaVariosDelExpediente01', privada: 'carpetaPrivadaDeDireccion001'
};
const A = {
  socios: 'archivoPresentacionSocios001', larga: 'archivoPresentacionLarga0001', dueno: 'archivoPresentacionDueno0001',
  foto: 'archivoFotoAereaDelPredio001', poligono: 'archivoPoligonoDelTerreno001', minuta: 'archivoMinutaDeLaReunion0001',
  modelo: 'archivoModeloFinanciero00001', pagina: 'archivoPaginaHtmlDelExpedi01', croquis: 'archivoCroquisEnSvgDePrueb01',
  video: 'archivoVideoLargoDelRecorri01', encuesta: 'archivoEncuestaDeGoogle00001', secreto: 'archivoSecretoDeDireccion001',
  enorme: 'archivoDocumentoQueNoExpor01'
};
const PNG = D.pngDePrueba(160, 90);
function drive(hoy) {
  const f = (n, h) => D.haceDias(n, hoy) + 'T' + (h || '17:00') + ':00Z';
  return {
    carpetas: {
      [C.raiz]: { nombre: 'Mi unidad', padres: [] },
      [C.proyecto]: { nombre: 'Expediente de prueba', padres: [C.raiz] },
      [C.compartir]: { nombre: '00 Para compartir', padres: [C.proyecto] },
      [C.terreno]: { nombre: '01 Terreno y legales', padres: [C.proyecto] },
      [C.presentaciones]: { nombre: '04 Presentaciones', padres: [C.proyecto] },
      [C.minutas]: { nombre: '05 Minutas y acuerdos', padres: [C.proyecto] },
      [C.varios]: { nombre: 'Varios', padres: [C.proyecto] },
      [C.privada]: { nombre: '07 Información privada', padres: [C.proyecto] }
    },
    archivos: {
      [A.socios]: { nombre: 'Presentación a socios.pdf', tipo: 'application/pdf', padres: [C.presentaciones], contenido: D.pdfDePrueba(3), fecha: f(4) },
      [A.larga]: { nombre: 'Presentación completa.pdf', tipo: 'application/pdf', padres: [C.presentaciones], contenido: pdfGrande(2, 7 * MB), fecha: f(9) },
      [A.dueno]: { nombre: 'Presentación para el dueño.pdf', tipo: 'application/pdf', padres: [C.compartir], contenido: D.pdfDePrueba(2), fecha: f(4, '18:00') },
      [A.foto]: { nombre: 'Foto aérea del predio.png', tipo: 'image/png', padres: [C.terreno], contenido: PNG, fecha: f(3) },
      [A.poligono]: { nombre: 'Polígono del terreno.kmz', tipo: 'application/vnd.google-earth.kmz', padres: [C.terreno], contenido: 'PK polígono inventado', fecha: f(20) },
      [A.minuta]: { nombre: 'Minuta de la reunión', tipo: 'application/vnd.google-apps.document', padres: [C.minutas], fecha: f(1) },
      [A.modelo]: { nombre: 'Modelo financiero.xlsx', tipo: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', padres: [C.proyecto], contenido: 'PK corrida inventada', fecha: f(6) },
      [A.pagina]: { nombre: 'Página del desarrollo.html', tipo: 'text/html', padres: [C.varios], contenido: '<!doctype html><script>parent.HTML_EJECUTADO = 1</script><p>página inventada</p>', fecha: f(7) },
      [A.croquis]: { nombre: 'Croquis.svg', tipo: 'image/svg+xml', padres: [C.varios], contenido: '<svg xmlns="http://www.w3.org/2000/svg" onload="parent.SVG_EJECUTADO = 1"><rect width="9" height="9"/></svg>', fecha: f(8) },
      [A.video]: { nombre: 'Video del recorrido.mov', tipo: 'video/quicktime', padres: [C.varios], tamano: 50 * MB, fecha: f(15) },
      [A.encuesta]: { nombre: 'Encuesta a vecinos', tipo: 'application/vnd.google-apps.form', padres: [C.varios], fecha: f(16) },
      [A.enorme]: { nombre: 'Planos completos', tipo: 'application/vnd.google-apps.presentation', padres: [C.presentaciones], exporta: 'falla', fecha: f(25) },
      [A.secreto]: { nombre: 'Secreto de Dirección.pdf', tipo: 'application/pdf', padres: [C.privada], contenido: D.pdfDePrueba(1), fecha: f(2) }
    }
  };
}

/* ── la hoja de historial ── */
const PROY_CAB = ['proyecto_id', 'nombre', 'broker', 'estado', 'planes', 'carpeta'];
const EV_CAB = ['evento_id', 'fecha', 'hora', 'broker', 'tipo', 'proyectos', 'titulo', 'resumen', 'decisiones', 'visibilidad', 'fuente', 'fuente_url', 'origen', 'archivos', 'para_externos'];
const CHAT_CAB = ['id', 'fecha', 'hora', 'quien', 'texto', 'adjuntos', 'adjuntos_ids', 'proyectos', 'visible', 'origen'];
const PEND_CAB = ['pendiente_id', 'evento_id', 'fecha_origen', 'responsable', 'tarea', 'fecha_compromiso', 'estado', 'proyectos', 'visibilidad'];
function historial(hoy) {
  const d = (n) => D.haceDias(n, hoy);
  const ev = (c) => EV_CAB.map((k) => (k in c ? c[k] : { broker: 'b', proyectos: 'proyecto-prueba', hora: '', resumen: '', decisiones: '', visibilidad: 'compartido', fuente: '', fuente_url: '', origen: 'prueba', archivos: '', para_externos: '' }[k]));
  const msj = (c) => CHAT_CAB.map((k) => (k in c ? c[k] : { adjuntos: '', adjuntos_ids: '', proyectos: 'proyecto-prueba', visible: 'sí', origen: 'exportacion' }[k]));
  const textos = D.chat(d(1)).mensajes;
  return {
    Proyectos: [PROY_CAB, ['proyecto-prueba', 'Proyecto Ejemplo', 'b', 'activo', PLAN, C.proyecto]],
    Eventos: [EV_CAB,
      ev({ evento_id: 'EV-1', fecha: d(1), hora: '10:30', tipo: 'reunion', titulo: 'Reunión con el dueño del terreno', resumen: 'Se revisó en qué mes cobra cada quien.',
        decisiones: 'Preparar la versión con preventa lenta.', fuente: 'Videollamada', fuente_url: A.minuta, archivos: A.minuta, para_externos: 'sí' }),
      ev({ evento_id: 'EV-2', fecha: d(1), hora: '12:00', tipo: 'WhatsApp grupo', titulo: 'Aviso en el grupo', resumen: 'Se compartió la minuta.', para_externos: 'sí' }),
      ev({ evento_id: 'EV-3', fecha: d(1), hora: '08:00', tipo: 'decision', titulo: 'Decisión sólo de Dirección', visibilidad: 'solo_direccion', para_externos: 'sí' }),
      ev({ evento_id: 'EV-4', fecha: d(4), hora: '17:00', tipo: 'presentacion', titulo: 'Presentación a inversionistas', resumen: 'Los siete cuadros y el comparativo.', fuente: 'Expediente',
        fuente_url: 'https://ejemplo.test/minuta-publica', archivos: [A.socios, A.dueno, A.secreto].join(', '), para_externos: 'sí' }),
      ev({ evento_id: 'EV-5', fecha: d(8), hora: '13:20', tipo: 'pendiente', titulo: 'Levantamiento topográfico', para_externos: 'sí' }),
      ev({ evento_id: 'EV-6', fecha: d(12), hora: '09:00', tipo: 'minuta', titulo: 'Minuta del recorrido', resumen: 'Recorrido por el predio.\n'.repeat(6), archivos: A.minuta }),
      ev({ evento_id: 'EV-7', fecha: d(19), hora: '18:40', tipo: 'llamada', titulo: 'Llamada con la notaría' }),
      ev({ evento_id: 'EV-8', fecha: d(30), hora: '16:10', tipo: 'documento', titulo: 'Se subió la foto del predio', archivos: A.foto, para_externos: 'sí' }),
      ev({ evento_id: 'EV-9', fecha: d(44), hora: '12:00', tipo: 'Junta', titulo: 'Arranque del proyecto', resumen: 'Primera reunión de la alianza sobre este terreno.' })],
    Chat: [CHAT_CAB].concat(textos.map((m, i) => msj({ id: 'M' + i, fecha: d(1), hora: m.hora, quien: m.quien, texto: m.texto,
      adjuntos: i === 4 ? 'Presentación a socios.pdf' : i === 7 ? 'Minuta de la reunión, Nota de voz.opus' : '',
      adjuntos_ids: i === 4 ? A.socios : i === 7 ? A.minuta : '', proyectos: i === 0 ? '' : 'proyecto-prueba' })),
    [msj({ id: 'M-oculto', fecha: d(1), hora: '23:00', quien: 'Coordinación', texto: 'Mensaje oculto', visible: 'no' }),
      msj({ id: 'M-viejo', fecha: d(30), hora: '09:00', quien: 'Comercial', texto: 'Ya está la foto del predio en la carpeta.', adjuntos: 'Foto aérea del predio.png', adjuntos_ids: A.foto })]),
    Pendientes: [PEND_CAB,
      ['PD-1', 'EV-1', d(1), 'Arquitectura', 'Enviar el levantamiento topográfico al banco', d(-5), 'abierto', 'proyecto-prueba', 'compartido'],
      ['PD-2', '', d(9), 'Comercial', 'Confirmar el precio de salida', d(6), 'en curso', 'proyecto-prueba', 'compartido'],
      ['PD-3', '', d(9), 'Finanzas', 'Ya se hizo', '', 'hecho', 'proyecto-prueba', 'compartido'],
      ['PD-4', 'EV-3', d(1), 'Coordinación', 'Pendiente de una decisión de Dirección', '', 'abierto', 'proyecto-prueba', 'compartido']]
  };
}

/* El mundo: la liga (de equipo o, con `audiencia` en blanco, de fuera), la hoja de historial y el Drive. */
function mundoReal(op) {
  op = op || {};
  const hoy = op.hoy || Date.now();
  return mundo({
    fechasReales: true, aperturas: true, ligasCab: LIGA_CAB,
    ligas: [[op.liga || LIGA, PLAN, 'Grupo de prueba', 'activa', '', op.versiones === undefined ? 'todas' : op.versiones, '', '2026-01-01', '', op.audiencia === undefined ? 'equipo' : op.audiencia]],
    historial: historial(hoy), drive: drive(hoy), config: [['historial_id', HISTORIAL]]
  });
}

module.exports = { mundoReal, LIGA, PLAN, A, C, pdfGrande, MB };
