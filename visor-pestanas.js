/*
 * Visor en vivo · las pestañas: Plan · Historial · Archivos · Opciones (Visor 2.0, 15-nov-2026).
 *
 * Una barra fija abajo, como en el teléfono. «Plan» son los siete cuadros de siempre (visor.js); este archivo
 * pone las otras tres pestañas y las hojas que suben desde abajo (la conversación de un día y la vista previa
 * de un archivo). Contrato con el servidor: docs/ppp2.md, «Visor 2.0: las pestañas».
 *
 *  · Historial — `?recurso=ppp2-historial&liga=…&plan=…[&si=llave]`: una línea de tiempo por días, a todo lo
 *    ancho y deslizable; abajo, lo que pasó el día escogido. La conversación del día (`ppp2-chat`) se lee en
 *    burbujas, como capturas que se recorren. Pendientes abiertos al final.
 *  · Archivos — `?recurso=ppp2-archivos&liga=…&plan=…`: por grupos; tocar uno lo baja por partes
 *    (`ppp2-archivo&id=…&parte=n`, desde 0) con barra de avance y lo enseña dentro de la página (PDF e imagen) o
 *    lo deja listo para guardar.
 *  · Opciones — las opciones de la liga (planes y versiones) con tres cifras que el servidor ya da, «Comparar
 *    todas» (visor-comparar.html) y, si el servidor lo manda (`elige`), el selector de Dirección.
 *
 * Reglas: sólo lee y sólo por GET (la única escritura del visor sigue siendo `ppp2-elige`, en visor.js). No
 * calcula cifras: acomoda, redondea como enseña y compara lo que llega. Lo que el servidor no manda no se
 * enseña: si la liga es para gente de fuera (`audiencia` ≠ `equipo`) no hay conversación ni pendientes aunque
 * llegaran. Contra un servidor que todavía no tiene estos recursos, cada pestaña dice algo claro y el plan
 * sigue igual. Este archivo no lleva nombres de planes, personas, cifras ni identificadores.
 */
(function (root) {
  'use strict';

  /* ───────────────────────── constantes ───────────────────────── */
  var PESTANAS = [['plan', 'Plan'], ['historial', 'Historial'], ['archivos', 'Archivos'], ['opciones', 'Opciones']];
  var GRUPOS = ['Presentaciones', 'Propuestas', 'Modelos financieros', 'Terreno y polígonos', 'Reuniones y minutas', 'Estudios y oficios', 'Otros'];
  var MES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
  var MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
  var DIAS = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];
  var DIA3 = ['dom', 'lun', 'mar', 'mié', 'jue', 'vie', 'sáb'];
  /* Cada tipo de evento: su nombre, su ícono, su color y su peso (lo más importante para Dirección primero:
     reuniones, versiones y pendientes). El chat lleva un ícono genérico de burbuja dibujado aquí. */
  var TIPOS = {
    reunion: { n: 'Reunión', ic: 'reunion', c: '#7d5f1e', p: 9 },
    version: { n: 'Versión del plan', ic: 'version', c: '#231d14', p: 8 },
    pendiente: { n: 'Pendiente', ic: 'pendiente', c: '#7f2f26', p: 7 },
    decision: { n: 'Decisión', ic: 'decision', c: '#2b5b39', p: 6 },
    minuta: { n: 'Minuta', ic: 'minuta', c: '#7d5f1e', p: 5 },
    presentacion: { n: 'Presentación', ic: 'presentacion', c: '#3e6484', p: 5 },
    documento: { n: 'Archivo', ic: 'documento', c: '#3e6484', p: 4 },
    cita: { n: 'Cita', ic: 'cita', c: '#5f4f6e', p: 3 },
    llamada: { n: 'Llamada', ic: 'llamada', c: '#5f4f6e', p: 3 },
    whatsapp: { n: 'Chat del equipo', ic: 'chat', c: '#2c5f5d', p: 2 }
  };
  var NOMBRES = ['#7d5f1e', '#2c4a63', '#2c5f5d', '#2b5b39', '#7a4a3c', '#5f4f6e'];   // color del nombre en cada burbuja (AA sobre papel)
  /* pdf.js (Mozilla, Apache-2.0) se carga sólo al abrir un PDF, con su huella SRI: así se ve dentro de la página
     también en el iPhone, donde un PDF incrustado enseña sólo su primera página. Si no carga, «Abrir aparte». */
  var PDFJS = {
    js: 'https://cdn.jsdelivr.net/npm/pdfjs-dist@3.11.174/legacy/build/pdf.min.js',
    sri: 'sha384-OemFRmhjDZwhIKuUld0HJozkF2YErsgDaCL41trxGQZt4/WgnopJQqQl2DvDZ07Z',
    worker: 'https://cdn.jsdelivr.net/npm/pdfjs-dist@3.11.174/legacy/build/pdf.worker.min.js',
    sriWorker: 'sha384-sS8B4COeBqzQV9DaPpp5cbpF+xz2jPcFbN3L8FL3/dx0RMC6WLUwTUOFm0iFb1lw'
  };
  var PARTES_MAX = 20;          // 40 MB en partes de hasta 3 MB
  /* Los tipos que un navegador no ejecuta (los mismos de PESTANAS.PASIVO en server/ppp2/Visor.gs). La página no se
     fía del tipo que llega: lo que no está aquí se arma como application/octet-stream, no se abre aparte y sólo se
     guarda; así un HTML o un SVG del expediente nunca corre en este origen, donde vive la sesión del Portero. */
  var PASIVO = /^(application\/pdf|image\/(png|jpeg|gif|webp|bmp|tiff|heic|heif)|video\/[a-z0-9.+-]+|audio\/[a-z0-9.+-]+|application\/(zip|x-zip-compressed|rtf|msword|vnd\.ms-[a-z0-9.+-]+|vnd\.openxmlformats-officedocument\.[a-z0-9.+-]+|vnd\.oasis\.opendocument\.[a-z0-9.+-]+|vnd\.google-earth\.kmz))$/;
  var VE_IMAGEN = /^image\/(png|jpeg|gif|webp)$/;   // lo que se enseña dentro de la página como imagen (como `vista` = imagen)
  var FRESCO_MS = 60000;        // lo leído de una pestaña se vuelve a preguntar al regresar a ella después de esto

  /* ───────────────────────── íconos (un solo sprite por página) ───────────────────────── */
  var IC = {
    plan: '<rect x="3.5" y="3.5" width="7.5" height="7.5" rx="2"/><rect x="13" y="3.5" width="7.5" height="7.5" rx="2"/><rect x="3.5" y="13" width="17" height="7.5" rx="2"/>',
    historial: '<path d="M4.3 13.2A7.9 7.9 0 1 0 6.6 6.4"/><path d="M3.8 4.3v4.2H8"/><path d="M12 8.2v4.4l3 1.8"/>',
    archivos: '<path d="M3.5 7.2a2 2 0 0 1 2-2h3.9l2.1 2.3h7a2 2 0 0 1 2 2v8.3a2 2 0 0 1-2 2h-13a2 2 0 0 1-2-2z"/><path d="M3.5 10.3h17"/>',
    opciones: '<rect x="7.5" y="3.5" width="13" height="11" rx="2"/><path d="M4 7.6v10.2a2 2 0 0 0 2 2h10.4"/>',
    chat: '<path d="M5.2 4.8h13.6a2.2 2.2 0 0 1 2.2 2.2v7.6a2.2 2.2 0 0 1-2.2 2.2h-7.2l-4.4 3.6v-3.6h-2a2.2 2.2 0 0 1-2.2-2.2V7a2.2 2.2 0 0 1 2.2-2.2z"/><path d="M8.2 10.9h.01M12 10.9h.01M15.8 10.9h.01" stroke-width="2.6"/>',
    reunion: '<circle cx="8.6" cy="8.2" r="2.8"/><circle cx="16.2" cy="9" r="2.3"/><path d="M3.6 19.2c.4-3.2 2.4-5 5-5s4.6 1.8 5 5M13.8 14.8c.7-.4 1.5-.6 2.4-.6 2.2 0 3.9 1.5 4.3 4.3"/>',
    minuta: '<path d="M7 3.5h7.5l4 4V19a1.5 1.5 0 0 1-1.5 1.5H7A1.5 1.5 0 0 1 5.5 19V5A1.5 1.5 0 0 1 7 3.5z"/><path d="M14.5 3.5v4h4M8.5 11.5h7M8.5 14.5h7M8.5 17.5h4.5"/>',
    presentacion: '<rect x="3.5" y="4" width="17" height="11.5" rx="1.6"/><path d="M12 15.5v4.2M8.6 20h6.8M7.5 12.2l3-3 2.4 2 3.6-3.6"/>',
    documento: '<path d="M7 3.5h7.5l4 4V19a1.5 1.5 0 0 1-1.5 1.5H7A1.5 1.5 0 0 1 5.5 19V5A1.5 1.5 0 0 1 7 3.5z"/><path d="M14.5 3.5v4h4"/>',
    decision: '<path d="M12 3.3l2 1.5 2.5-.2.9 2.4 2.1 1.4-.7 2.4.7 2.4-2.1 1.4-.9 2.4-2.5-.2-2 1.5-2-1.5-2.5.2-.9-2.4-2.1-1.4.7-2.4-.7-2.4 2.1-1.4.9-2.4 2.5.2z"/><path d="M9 11.6l2.1 2.1 4-4.1"/>',
    pendiente: '<rect x="4" y="4" width="16" height="16" rx="4"/><path d="M12 8.2v4.1l2.7 1.7"/>',
    cita: '<rect x="3.5" y="5" width="17" height="15.5" rx="2.2"/><path d="M3.5 9.6h17M8 3v4M16 3v4M7.8 13.6h3.2"/>',
    llamada: '<path d="M6.6 3.8l2.6-.3 1.4 3.9-1.8 1.4a12 12 0 0 0 6.4 6.4l1.4-1.8 3.9 1.4-.3 2.6a2 2 0 0 1-2.2 1.8C10 18.5 5.5 14 4.8 6a2 2 0 0 1 1.8-2.2z"/>',
    version: '<path d="M12 3.6l8 4.2-8 4.2-8-4.2z"/><path d="M4 12l8 4.2 8-4.2M4 16.1l8 4.2 8-4.2"/>',
    clip: '<path d="M8.2 12.4l5.5-5.5a3 3 0 0 1 4.2 4.2l-7.2 7.2a4.8 4.8 0 0 1-6.8-6.8l6.6-6.6"/>',
    cerrar: '<path d="M6.5 6.5l11 11M17.5 6.5l-11 11"/>',
    guardar: '<path d="M12 4v10.5M7.6 10.3l4.4 4.4 4.4-4.4M5 19.5h14"/>',
    abrir: '<path d="M13.5 4.5h6V10.5M19.5 4.5l-8.4 8.4M17.5 13.6v4.9a1.5 1.5 0 0 1-1.5 1.5H6a1.5 1.5 0 0 1-1.5-1.5V8.5A1.5 1.5 0 0 1 6 7h4.9"/>',
    comparar: '<rect x="3.5" y="4.5" width="7" height="15" rx="1.8"/><rect x="13.5" y="4.5" width="7" height="15" rx="1.8"/><path d="M6 9h2M6 12h2M16 9h2M16 12h2"/>',
    flecha: '<path d="M9 5.5l6.5 6.5L9 18.5"/>',
    izq: '<path d="M15 5.5L8.5 12l6.5 6.5"/>',
    alerta: '<circle cx="12" cy="12" r="8.6"/><path d="M12 7.8v5M12 16.2h.01" stroke-width="2.2"/>',
    llave: '<rect x="5" y="11" width="14" height="9.5" rx="2"/><path d="M8 11V7.6a4 4 0 0 1 8 0V11"/>',
    nube: '<path d="M7.2 18.5a4.2 4.2 0 0 1-.6-8.4 5.6 5.6 0 0 1 10.8 1.4 3.5 3.5 0 0 1-.4 7z"/>',
    paloma: '<path d="M5.5 12.5l4.2 4.2 8.8-9"/>'
  };
  function sprite() {
    return '<svg id="vzpSprite" width="0" height="0" style="position:absolute;width:0;height:0;overflow:hidden" aria-hidden="true" focusable="false"><defs>' +
      Object.keys(IC).map(function (k) { return '<symbol id="vzpI-' + k + '" viewBox="0 0 24 24">' + IC[k] + '</symbol>'; }).join('') + '</defs></svg>';
  }
  function ico(k, clase) { return '<svg class="vzp-ic' + (clase ? ' ' + clase : '') + '" aria-hidden="true" focusable="false"><use href="#vzpI-' + k + '"></use></svg>'; }

  /* ───────────────────────── utilidades ───────────────────────── */
  function esc(s) { return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }
  function num(x) { return typeof x === 'number' && isFinite(x) ? x : null; }
  function miles(s) { var p = String(s).split('.'); p[0] = p[0].replace(/\B(?=(\d{3})+(?!\d))/g, ','); return p.join('.'); }
  function mdp(x) { return num(x) === null ? '' : (x < 0 ? '−' : '') + '$' + miles(Math.abs(x).toFixed(1)); }
  function ent(x) { return num(x) === null ? '' : miles(Math.round(x)); }
  function mayus1(t) { t = String(t || ''); return t.charAt(0).toUpperCase() + t.slice(1); }
  function pad2(n) { return (n < 10 ? '0' : '') + n; }
  function hoyISO(f) { f = f || new Date(); return f.getFullYear() + '-' + pad2(f.getMonth() + 1) + '-' + pad2(f.getDate()); }
  /* Sólo una fecha AAAA-MM-DD completa y real: lo que no lo es no entra a la línea de tiempo ni a un atributo. */
  function partesFecha(iso) {
    var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(iso || ''));
    if (!m) return null;
    var y = +m[1], mo = +m[2], d = +m[3], t = new Date(Date.UTC(y, mo - 1, d));
    return t.getUTCMonth() === mo - 1 && t.getUTCDate() === d ? { y: y, m: mo, d: d, s: t.getUTCDay() } : null;
  }
  /* «viernes 14 de noviembre» (con el año si no es el de hoy) */
  function fechaLarga(iso, hoy) {
    var p = partesFecha(iso), h = partesFecha(hoy || hoyISO());
    if (!p) return '';
    return DIAS[p.s] + ' ' + p.d + ' de ' + MESES[p.m - 1] + (h && h.y === p.y ? '' : ' de ' + p.y);
  }
  /* «14 nov» (con el año si no es el de hoy) */
  function fechaCorta(iso, hoy) {
    var p = partesFecha(iso), h = partesFecha(hoy || hoyISO());
    if (!p) return '';
    return p.d + ' ' + MES[p.m - 1] + (h && h.y === p.y ? '' : ' ' + p.y);
  }
  function tamano(b) {
    if (num(b) === null || b < 0) return '';
    if (b < 1024) return Math.round(b) + ' B';
    if (b < 1048576) return Math.max(1, Math.round(b / 1024)) + ' KB';
    return (b / 1048576).toFixed(b < 10485760 ? 1 : 0) + ' MB';
  }
  function plural(n, uno, varios) { return n + ' ' + (n === 1 ? uno : varios); }
  function tipoSeguro(t) { t = String(t || '').toLowerCase().split(';')[0].trim(); return PASIVO.test(t) ? t : 'application/octet-stream'; }
  /* El nombre con que se guarda un archivo, sin acentos ni signos raros: hay sistemas (Chromium en Linux, por ejemplo)
     que descartan el nombre entero si no lo pueden escribir, y el archivo queda como «download», sin extensión. */
  function nombreGuardar(n) {
    var t = String(n || '').normalize ? String(n || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '') : String(n || '');
    t = t.replace(/[^\x20-\x7e]/g, '_').replace(/[\\/:*?"<>|]/g, '_').replace(/\s+/g, ' ').trim();
    return t || 'archivo';
  }
  function colorNombre(nombre) {
    var h = 0, s = String(nombre || '');
    for (var i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
    return NOMBRES[h % NOMBRES.length];
  }
  /* Qué clase de archivo es, por su tipo y su nombre: la etiqueta corta del ícono y cómo se dice. */
  function tipoArchivo(mime, nombre) {
    var t = String(mime || '').toLowerCase(), m = /\.([a-z0-9]{1,5})$/i.exec(String(nombre || '')), ext = m ? m[1].toLowerCase() : '';
    if (/google-apps\.document/.test(t) || /word|opendocument\.text/.test(t) || /^(doc|docx|odt|rtf|txt|md)$/.test(ext)) return { e: 'DOC', c: '#2c4a63', n: 'Documento' };
    if (/google-apps\.spreadsheet/.test(t) || /sheet|excel|csv/.test(t) || /^(xls|xlsx|xlsm|ods|csv|numbers)$/.test(ext)) return { e: 'XLS', c: '#2b5b39', n: 'Hoja de cálculo' };
    if (/google-apps\.presentation/.test(t) || /presentation|powerpoint|keynote/.test(t) || /^(ppt|pptx|key|odp)$/.test(ext)) return { e: 'PPT', c: '#8a5a12', n: 'Presentación' };
    if (/google-apps\.drawing/.test(t)) return { e: 'DIB', c: '#5f4f6e', n: 'Dibujo' };
    if (/pdf/.test(t) || ext === 'pdf') return { e: 'PDF', c: '#7f2f26', n: 'PDF' };
    if (/^image\//.test(t) || /^(jpg|jpeg|png|gif|webp|heic|tif|tiff)$/.test(ext)) return { e: ext ? (ext === 'jpeg' ? 'JPG' : ext.toUpperCase().slice(0, 4)) : 'IMG', c: '#2c5f5d', n: 'Imagen' };
    if (/^(kmz|kml|dwg|dxf|shp|skp|rvt)$/.test(ext)) return { e: ext.toUpperCase(), c: '#5f4f6e', n: 'Plano' };
    if (/^video\//.test(t) || /^(mp4|mov|m4v|avi)$/.test(ext)) return { e: 'VID', c: '#5f4f6e', n: 'Video' };
    if (/^audio\//.test(t) || /^(mp3|m4a|wav|ogg|opus)$/.test(ext)) return { e: 'AUD', c: '#5f4f6e', n: 'Audio' };
    if (/zip|compressed|rar|7z/.test(t) || /^(zip|rar|7z)$/.test(ext)) return { e: 'ZIP', c: '#5c564a', n: 'Comprimido' };
    return { e: ext ? ext.toUpperCase().slice(0, 4) : 'ARCH', c: '#5c564a', n: 'Archivo' };
  }
  function iconoArchivo(mime, nombre) {
    var k = tipoArchivo(mime, nombre);
    return '<svg class="vzp-tipo" viewBox="0 0 32 40" aria-hidden="true" focusable="false"><path d="M5 1.5h16.5L30 10v26.5a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-33a2 2 0 0 1 2-2z" fill="#fffdf9" stroke="#cfc6b3" stroke-width="1.2"></path>' +
      '<path d="M21.5 1.5V10H30" fill="none" stroke="#cfc6b3" stroke-width="1.2"></path><rect x="0.5" y="21" width="26" height="11.5" rx="2.4" fill="' + k.c + '"></rect>' +
      '<text x="13.5" y="29.6" text-anchor="middle" font-size="' + (k.e.length > 3 ? 6.4 : 7.6) + '" font-weight="700" fill="#fffdf9" font-family="system-ui, -apple-system, sans-serif" letter-spacing="0.3">' + esc(k.e) + '</text></svg>';
  }

  /* ───────────────────────── la dirección: #l=<liga>[&t=<pestaña>] ───────────────────────── */
  function pestanaDe(hash) { var m = /[#&]t=(plan|historial|archivos|opciones)(?:&|$)/.exec(String(hash || '')); return m ? m[1] : 'plan'; }
  function hashCon(hash, t) {
    var h = String(hash || '').replace(/^#/, ''), partes = h ? h.split('&').filter(function (p) { return p && !/^t=/.test(p); }) : [];
    if (t && t !== 'plan') partes.push('t=' + t);
    return partes.length ? '#' + partes.join('&') : '';
  }

  /* ───────────────────────── respuestas: qué pasó ───────────────────────── */
  /* ok · liga (apagada: el sondeo del plan lo confirma) · plan (no está en esta liga) · interno · grande (archivo
     de más de 40 MB) · red (sin respuesta) · tarda (no contestó a tiempo: la conexión puede estar bien) · sin (el
     servidor todavía no tiene este recurso: hoy contesta `sin_sesion`, `recurso` o `clave`). */
  function clase(j) {
    if (!j || typeof j !== 'object') return 'red';
    if (j.ok) return 'ok';
    var e = String(j.error || '');
    if (e === 'liga' || e === 'plan' || e === 'interno' || e === 'grande') return e;
    if (e === 'portero') return 'interno';
    return 'sin';
  }
  var MENSAJES = {
    historial: {
      sin: ['historial', 'Aún no hay historial en esta liga', 'Aquí verás, día por día, las reuniones, las versiones del plan, los archivos que se compartieron y los pendientes.'],
      plan: ['historial', 'Este plan todavía no tiene historial', 'Cuando el equipo registre reuniones, versiones o archivos de este plan, aparecerán aquí, día por día.'],
      interno: ['alerta', 'No pude abrir el historial', 'Vuelve a intentar en un momento.', 1],
      tarda: ['historial', 'Está tardando más de lo normal', 'La primera lectura del expediente puede tardar. Vuelve a intentar en un momento: ya habrá avanzado.', 1],
      red: ['nube', 'Sin conexión', 'Revisa tu conexión y vuelve a intentar.', 1],
      liga: ['llave', 'Esta liga ya no está activa', 'Pide una nueva a quien te la compartió.']
    },
    archivos: {
      sin: ['archivos', 'Aún no hay archivos en esta liga', 'Aquí estarán las presentaciones, las propuestas, los estudios y los planos del proyecto, ordenados por tipo.'],
      plan: ['archivos', 'Todavía no hay archivos para esta liga', 'Cuando el equipo comparta documentos de este proyecto, aparecerán aquí.'],
      interno: ['alerta', 'No pude abrir los archivos', 'Vuelve a intentar en un momento.', 1],
      tarda: ['archivos', 'Está tardando más de lo normal', 'La primera lectura de las carpetas puede tardar. Vuelve a intentar en un momento: ya habrá avanzado.', 1],
      red: ['nube', 'Sin conexión', 'Revisa tu conexión y vuelve a intentar.', 1],
      liga: ['llave', 'Esta liga ya no está activa', 'Pide una nueva a quien te la compartió.']
    },
    chat: {
      sin: ['chat', 'La conversación todavía no está disponible', 'Pronto podrás leer aquí lo que dijo el equipo ese día.'],
      plan: ['chat', 'La conversación no está disponible en esta liga', 'Sólo el equipo de la alianza puede leerla.'],
      interno: ['alerta', 'No pude abrir la conversación', 'Vuelve a intentar en un momento.', 1],
      tarda: ['chat', 'Está tardando más de lo normal', 'Vuelve a intentar en un momento.', 1],
      red: ['nube', 'Sin conexión', 'Revisa tu conexión y vuelve a intentar.', 1],
      liga: ['llave', 'Esta liga ya no está activa', 'Pide una nueva a quien te la compartió.']
    },
    archivo: {
      sin: ['documento', 'La vista previa todavía no está disponible', 'Pronto podrás abrir aquí los archivos del proyecto.'],
      plan: ['documento', 'Este archivo no está disponible en esta liga', 'Puede que se haya movido o que no sea para compartir.'],
      grande: ['documento', 'Este archivo no se puede abrir aquí', 'Es muy grande (más de 40 MB) o no se pudo convertir a PDF. Pídelo al equipo.'],
      interno: ['alerta', 'No pude abrir el archivo', 'Vuelve a intentar en un momento.', 1],
      tarda: ['documento', 'Está tardando más de lo normal', 'El archivo es grande o el servidor está ocupado. Vuelve a intentar en un momento.', 1],
      red: ['nube', 'Sin conexión', 'Revisa tu conexión y vuelve a intentar.', 1],
      liga: ['llave', 'Esta liga ya no está activa', 'Pide una nueva a quien te la compartió.']
    }
  };
  function estadoHtml(recurso, c, que) {
    var m = (MENSAJES[recurso] || MENSAJES.historial)[c] || MENSAJES[recurso].interno;
    return '<div class="vzp-estado' + (m[3] ? ' vzp-estado-falla' : '') + '"><span class="vzp-estado-ic">' + ico(m[0]) + '</span><h3>' + esc(m[1]) + '</h3><p>' + esc(m[2]) + '</p>' +
      (m[3] ? '<button type="button" class="vzp-boton" data-reintenta="' + esc(que || recurso) + '">Volver a intentar</button>' : '') + '</div>';
  }

  /* ───────────────────────── barra y paneles ───────────────────────── */
  function barraHtml(activa, marcas) {
    marcas = marcas || {};
    return '<div class="vzp-barra-in" role="tablist" aria-label="Secciones del plan">' + PESTANAS.map(function (p) {
      var si = p[0] === activa;
      return '<button type="button" role="tab" class="vzp-tab" id="vzpTab-' + p[0] + '" aria-controls="vzpPanel-' + p[0] + '" aria-selected="' + si + '" tabindex="' + (si ? 0 : -1) + '" data-pestana="' + p[0] + '">' +
        '<span class="vzp-tab-ic">' + ico(p[0]) + (marcas[p[0]] ? '<i class="vzp-tab-punto" aria-hidden="true"></i>' : '') + '</span><span class="vzp-tab-n">' + p[1] + '</span>' +
        (marcas[p[0]] ? '<span class="vz-sr">' + esc(marcas[p[0]]) + '</span>' : '') + '</button>';
    }).join('') + '</div>';
  }
  function cabeza(titulo, d) {
    var plan = (d && d.plan && d.plan.nombre) || 'Plan de Potencial', v = d && d.version ? 'V' + d.version + (d.v && d.v.estado ? ' ' + d.v.estado : '') : '';
    return '<header class="vzp-cab"><span class="vzp-marca">YoDesarrollo · Plan de Potencial</span><h2 class="vzp-tit" tabindex="-1">' + esc(titulo) + '</h2>' +
      '<p class="vzp-subt"><span>' + esc(plan) + '</span>' + (v ? '<span class="vzp-subt-v">' + esc(v) + '</span>' : '') + '</p></header>';
  }
  /* La primera lectura del expediente puede tardar (el servidor recorre hojas y carpetas; luego queda en caché):
     el esqueleto lo dice con calma, y si pasa de unos segundos explica por qué. Nunca es un error por tiempo. */
  var ESPERA = 'Reuniendo el expediente…', ESPERA_LARGA = 'La primera vez tarda unos segundos; después abre al instante.';
  function espera(que) { return '<p class="vzp-espera" role="status"><span class="vzp-puntos" aria-hidden="true"><i></i><i></i><i></i></span><span class="vzp-espera-t">' + (que === 'opciones' ? 'Leyendo las opciones…' : ESPERA) + '</span></p>'; }
  function esqueleto(que) {
    var r = function (w, h, extra) { return '<i class="vzp-esq-b" style="width:' + w + ';height:' + h + 'px' + (extra || '') + '"></i>'; };
    if (que === 'historial') return espera(que) + '<div class="vzp-esq" aria-hidden="true"><div class="vzp-esq-fila">' + r('31%', 44) + r('31%', 44) + r('31%', 44) + '</div>' +
      '<div class="vzp-esq-linea">' + new Array(9).join('<span><i></i></span>') + '</div>' + r('58%', 22, ';margin:18px 0 12px') + r('100%', 112) + r('100%', 84, ';margin-top:10px') + '</div>';
    if (que === 'archivos') return espera(que) + '<div class="vzp-esq" aria-hidden="true">' + r('46%', 18, ';margin:6px 0 10px') + [1, 2, 3].map(function () { return r('100%', 62, ';margin-bottom:8px'); }).join('') +
      r('38%', 18, ';margin:18px 0 10px') + r('100%', 62, ';margin-bottom:8px') + r('100%', 62) + '</div>';
    return '<div class="vzp-esq" aria-hidden="true">' + r('100%', 150, ';margin-bottom:12px') + r('100%', 150) + '</div>';
  }

  /* ───────────────────────── Historial ───────────────────────── */
  function tiposDelDia(dia, equipo) {
    var vistos = {}, out = [];
    (dia.items || []).forEach(function (it) { var t = TIPOS[it.tipo] ? it.tipo : 'documento'; if (!vistos[t]) { vistos[t] = 1; out.push(t); } });
    if (equipo && dia.chat > 0 && !vistos.whatsapp) out.push('whatsapp');
    return out.sort(function (a, b) { return TIPOS[b].p - TIPOS[a].p; });
  }
  /* Lo que una liga que no es de equipo nunca ve, aunque el servidor lo mandara por error: eventos de chat o de
     pendiente, ni la fuente o la liga de un evento (el servidor ya no se los manda; esto es la red de abajo). */
  function itemsVisibles(items, equipo) {
    return (Array.isArray(items) ? items : []).filter(function (it) { return it && (equipo || (it.tipo !== 'whatsapp' && it.tipo !== 'pendiente')); })
      .map(function (it) {
        if (equipo) return it;
        var c = {};
        for (var k in it) if (Object.prototype.hasOwnProperty.call(it, k) && k !== 'fuente' && k !== 'url') c[k] = it[k];
        return c;
      });
  }
  /* Los días de la línea de tiempo, del más viejo (izquierda) al más reciente (derecha). De fuera: sin
     conversación, y un día que se queda sin nada que enseñar no sale. */
  function diasOrdenados(h) {
    var equipo = !!h && h.audiencia === 'equipo';
    return (h && Array.isArray(h.dias) ? h.dias : []).filter(function (x) { return x && partesFecha(x.fecha); })
      .map(function (x) { return { fecha: x.fecha, items: itemsVisibles(x.items, equipo), chat: equipo && x.chat > 0 ? x.chat : 0 }; })
      .filter(function (x) { return x.items.length || x.chat; })
      .sort(function (a, b) { return a.fecha < b.fecha ? -1 : a.fecha > b.fecha ? 1 : 0; });
  }
  function cuentaTipo(dias, tipo) { var n = 0; dias.forEach(function (d) { (d.items || []).forEach(function (it) { if (it.tipo === tipo) n++; }); }); return n; }
  function etiquetaDia(dia, equipo) {
    var cuenta = {}, partes = [];
    (dia.items || []).forEach(function (it) { var t = TIPOS[it.tipo] ? it.tipo : 'documento'; cuenta[t] = (cuenta[t] || 0) + 1; });
    Object.keys(cuenta).sort(function (a, b) { return TIPOS[b].p - TIPOS[a].p; }).forEach(function (t) { partes.push(cuenta[t] + ' ' + TIPOS[t].n.toLowerCase()); });
    if (equipo && dia.chat > 0) partes.push('chat del equipo, ' + plural(dia.chat, 'mensaje', 'mensajes'));
    return partes.join(', ');
  }
  function lineaHtml(dias, sel, equipo, hoy) {
    var mesAnt = '';
    return '<div class="vzp-linea"><div class="vzp-linea-pista" role="group" aria-label="Días del historial, del más antiguo al más reciente"><ol class="vzp-dias">' + dias.map(function (d) {
      var p = partesFecha(d.fecha), mes = p.y + '-' + p.m, tipos = tiposDelDia(d, equipo), si = d.fecha === sel;
      var rotMes = mes !== mesAnt ? '<span class="vzp-dia-mes">' + MES[p.m - 1] + (partesFecha(hoy || hoyISO()).y === p.y ? '' : ' ' + String(p.y).slice(2)) + '</span>' : '<span class="vzp-dia-mes" aria-hidden="true"></span>';
      mesAnt = mes;
      var fuerte = tipos.some(function (t) { return t === 'reunion' || t === 'version' || t === 'decision'; });
      return '<li><button type="button" class="vzp-dia' + (si ? ' vzp-dia-on' : '') + (fuerte ? ' vzp-dia-fuerte' : '') + '" data-dia="' + esc(d.fecha) + '"' + (si ? ' aria-current="date"' : '') +
        ' aria-label="' + esc(mayus1(fechaLarga(d.fecha, hoy)) + ': ' + etiquetaDia(d, equipo)) + '">' + rotMes +
        '<span class="vzp-dia-sem">' + DIA3[p.s] + '</span><span class="vzp-dia-num">' + p.d + '</span><span class="vzp-dia-punto" aria-hidden="true"></span>' +
        '<span class="vzp-dia-ics" aria-hidden="true">' + tipos.slice(0, 3).map(function (t) { return '<span style="color:' + TIPOS[t].c + '">' + ico(TIPOS[t].ic) + '</span>'; }).join('') +
        (tipos.length > 3 ? '<b>+' + (tipos.length - 3) + '</b>' : '') + '</span></button></li>';
    }).join('') + '</ol></div></div>';
  }
  function adjuntoHtml(a, etiqueta) {
    var nombre = String(a.nombre || 'Archivo');
    if (!a.id) return '<span class="vzp-adj vzp-adj-no">' + iconoArchivo(a.tipo, nombre) + '<span><b>' + esc(nombre) + '</b><small>aún no está en el expediente</small></span></span>';
    return '<button type="button" class="vzp-adj" data-archivo="' + esc(a.id) + '" data-nombre="' + esc(nombre) + '" data-tipo="' + esc(a.tipo || '') + '">' + iconoArchivo(a.tipo, nombre) +
      '<span><b>' + esc(etiqueta || nombre) + '</b>' + (etiqueta ? '<small>' + esc(nombre) + '</small>' : '') + '</span>' + ico('flecha', 'vzp-ic-chico') + '</button>';
  }
  function eventoHtml(it, dia, equipo) {
    var k = TIPOS[it.tipo] ? it.tipo : 'documento', t = TIPOS[k], res = String(it.resumen || ''), largo = res.length > 240 || (res.match(/\n/g) || []).length > 3;
    var arch = (it.archivos || []).filter(function (a) { return a && a.id; }), reunion = k === 'reunion' || k === 'minuta';
    var url = /^https:\/\//.test(String(it.url || '')) ? String(it.url) : '';
    return '<li class="vzp-ev vzp-ev-' + k + '"><span class="vzp-ev-ic" style="color:' + t.c + '">' + ico(t.ic) + '</span><div class="vzp-ev-c">' +
      '<p class="vzp-ev-cab"><span class="vzp-ev-tipo" style="color:' + t.c + '">' + esc(t.n) + '</span>' + (it.hora ? '<span class="vzp-ev-hora">' + esc(it.hora) + '</span>' : '') + '</p>' +
      '<h4>' + esc(it.titulo || t.n) + '</h4>' +
      (res ? '<p class="vzp-ev-res' + (largo ? ' vzp-corto' : '') + '">' + esc(res) + '</p>' + (largo ? '<button type="button" class="vzp-mas" aria-expanded="false">Ver más</button>' : '') : '') +
      (arch.length ? '<div class="vzp-ev-arch">' + arch.map(function (a) {
        var nom = String(a.nombre || ''), et = reunion && (/transcrip/i.test(nom) || arch.length === 1) ? (/transcrip/i.test(nom) ? 'Abrir la transcripción' : 'Abrir el documento') : '';
        return adjuntoHtml(a, et);
      }).join('') + '</div>' : '') +
      (k === 'whatsapp' && equipo && dia.chat > 0 ? '<button type="button" class="vzp-boton vzp-boton-suave" data-chat="' + esc(dia.fecha) + '">' + ico('chat') + 'Leer la conversación del día</button>' : '') +
      ((it.fuente || url) ? '<p class="vzp-ev-fuente">' + (it.fuente ? esc(it.fuente) : '') + (url ? (it.fuente ? ' · ' : '') + '<a href="' + esc(url) + '" target="_blank" rel="noopener noreferrer">Ver la fuente</a>' : '') + '</p>' : '') +
      '</div></li>';
  }
  function chatTarjetaHtml(dia) {
    var t = TIPOS.whatsapp;
    return '<li class="vzp-ev vzp-ev-chat"><span class="vzp-ev-ic" style="color:' + t.c + '">' + ico('chat') + '</span><div class="vzp-ev-c">' +
      '<p class="vzp-ev-cab"><span class="vzp-ev-tipo" style="color:' + t.c + '">Chat del equipo</span><span class="vzp-ev-hora">' + plural(dia.chat, 'mensaje', 'mensajes') + '</span></p>' +
      '<h4>Lo que se habló en el grupo de WhatsApp</h4><p class="vzp-ev-res">La conversación del día, como capturas que se recorren.</p>' +
      '<button type="button" class="vzp-boton vzp-boton-suave" data-chat="' + esc(dia.fecha) + '">' + ico('chat') + 'Leer la conversación</button></div></li>';
  }
  function diaHtml(dia, equipo, hoy) {
    if (!dia) return '';
    var items = dia.items || [], tieneChatItem = items.some(function (it) { return it.tipo === 'whatsapp'; });
    return '<section class="vzp-dia-det" aria-labelledby="vzpDiaTit"><h3 class="vzp-dia-tit" id="vzpDiaTit" tabindex="-1">' + esc(mayus1(fechaLarga(dia.fecha, hoy))) + '</h3>' +
      '<ul class="vzp-eventos">' + items.map(function (it) { return eventoHtml(it, dia, equipo); }).join('') +
      (equipo && dia.chat > 0 && !tieneChatItem ? chatTarjetaHtml(dia) : '') + '</ul></section>';
  }
  function pendientesHtml(lista, hoy) {
    if (!lista || !lista.length) return '';
    hoy = hoy || hoyISO();
    return '<section class="vzp-seccion" id="vzpPendientes" aria-labelledby="vzpPendTit"><h3 class="vzp-sec-tit" id="vzpPendTit">Pendientes abiertos <span>' + lista.length + '</span></h3><ul class="vzp-pend">' + lista.map(function (p) {
      var vence = partesFecha(p.compromiso) ? p.compromiso : '', tarde = vence && vence < hoy;
      var meta = [p.responsable ? esc(p.responsable) : '', vence ? (tarde ? '<b class="vzp-tarde">venció el ' + esc(fechaCorta(vence, hoy)) + '</b>' : 'para el ' + esc(fechaCorta(vence, hoy))) : ''].filter(function (x) { return x; }).join(' · ');
      return '<li><span class="vzp-pend-caja" aria-hidden="true"></span><div><p>' + esc(p.tarea) + '</p>' + (meta ? '<small>' + meta + '</small>' : '') + '</div>' + (p.estado ? '<span class="vzp-chip">' + esc(p.estado) + '</span>' : '') + '</li>';
    }).join('') + '</ul></section>';
  }
  function versionesHtml(lista, hoy) {
    if (!lista || !lista.length) return '';
    return '<section class="vzp-seccion" id="vzpVersiones" aria-labelledby="vzpVerTit"><h3 class="vzp-sec-tit" id="vzpVerTit">Versiones del plan <span>' + lista.length + '</span></h3><ul class="vzp-vers">' + lista.map(function (x) {
      var f = partesFecha(x.fecha) ? x.fecha : '', nom = 'V' + esc(x.v) + (x.nombre ? ' · ' + esc(x.nombre) : '');
      var dentro = '<span class="vzp-vers-ic">' + ico('version') + '</span><span class="vzp-vers-n"><b>' + nom + '</b><small>' + (f ? esc(fechaCorta(f, hoy)) : 'sin fecha') + '</small></span>' +
        (x.estado === 'vigente' ? '<span class="vzp-chip vzp-chip-ok">' + ico('paloma', 'vzp-ic-chico') + 'vigente</span>' : (x.estado ? '<span class="vzp-chip">' + esc(x.estado) + '</span>' : ''));
      return '<li>' + (f ? '<button type="button" class="vzp-vers-b" data-dia="' + esc(f) + '">' + dentro + '</button>' : '<div class="vzp-vers-b">' + dentro + '</div>') + '</li>';
    }).join('') + '</ul></section>';
  }
  /* El historial completo: «lo más importante» (reuniones, versiones, pendientes), la línea de tiempo, el día
     escogido y, al final, los pendientes abiertos y las versiones. */
  function historialHtml(h, op) {
    op = op || {};
    var equipo = h && h.audiencia === 'equipo', hoy = op.hoy || hoyISO(), dias = diasOrdenados(h);
    var pend = (equipo && Array.isArray(h.pendientes) ? h.pendientes : []).filter(function (p) { return p && p.tarea; });
    var vers = (Array.isArray(h && h.versiones) ? h.versiones : []).filter(function (x) { return x && x.v !== undefined && x.v !== null && x.v !== ''; });
    if (!dias.length && !pend.length && !vers.length) return estadoHtml('historial', 'plan');
    var sel = op.sel && dias.some(function (d) { return d.fecha === op.sel; }) ? op.sel : (dias.length ? dias[dias.length - 1].fecha : '');
    var reun = cuentaTipo(dias, 'reunion'), nv = vers.length || cuentaTipo(dias, 'version');
    var chips = [['reunion', reun, 'reunión', 'reuniones', 'reunion'], ['version', nv, 'versión', 'versiones', 'version']];
    if (equipo) chips.push(['pendientes', pend.length, 'pendiente', 'pendientes', 'pendiente']);
    var resumen = '<div class="vzp-resumen" role="group" aria-label="Lo más importante">' + chips.map(function (c) {
      return '<button type="button" class="vzp-res" data-salta="' + c[0] + '"' + (c[1] ? '' : ' disabled') + '><span class="vzp-res-ic" style="color:' + TIPOS[c[4]].c + '">' + ico(TIPOS[c[4]].ic) + '</span>' +
        '<b>' + c[1] + '</b><span>' + (c[1] === 1 ? c[2] : c[3]) + '</span></button>';
    }).join('') + '</div>';
    var hoyDia = dias.filter(function (d) { return d.fecha === sel; })[0];
    return resumen + (dias.length ? lineaHtml(dias, sel, equipo, hoy) + '<div class="vzp-dia-caja">' + diaHtml(hoyDia, equipo, hoy) + '</div>' : '<p class="vzp-nota">Todavía no hay días con eventos.</p>') +
      pendientesHtml(pend, hoy) + versionesHtml(vers, hoy);
  }

  /* ───────────────────────── la conversación de un día: burbujas, como capturas ───────────────────────── */
  /* Las capturas: cada una con lo que cabe en una pantalla (hasta ocho mensajes, unos 650 caracteres); un mensaje
     nunca se parte. */
  function capturas(ms, max, maxCar) {
    max = max || 8; maxCar = maxCar || 650;
    var out = [], cur = [], car = 0;
    (ms || []).forEach(function (m) {
      var c = String((m && m.texto) || '').length + 60 * ((m && m.adjuntos) || []).length + 40;
      if (cur.length && (cur.length >= max || car + c > maxCar)) { out.push(cur); cur = []; car = 0; }
      cur.push(m); car += c;
    });
    if (cur.length) out.push(cur);
    return out;
  }
  /* Con las alturas reales de cada burbuja (medidas en la pantalla), cada captura lleva lo que cabe a la vista.
     `alturas`: con el nombre arriba (la primera de cada captura o tras otra persona); `sinNombre` y `quienes`, si
     llegan: la altura sin el nombre, para la que sigue a otra de la misma persona dentro de la misma captura. */
  function agrupa(alturas, capacidad, max, sinNombre, quienes) {
    var out = [], cur = [], suma = 0;
    (alturas || []).forEach(function (a, i) {
      var h = cur.length && sinNombre && quienes && quienes[i] === quienes[i - 1] ? sinNombre[i] : a;
      if (cur.length && (cur.length >= (max || 10) || suma + h > capacidad)) { out.push(cur); cur = []; suma = 0; h = a; }
      cur.push(i); suma += h;
    });
    if (cur.length) out.push(cur);
    return out;
  }
  function burbujasHtml(grupo, todos) {
    var ant = '';
    return grupo.map(function (m) {
      var quien = String(m.quien || ''), nuevo = todos || quien !== ant;
      ant = quien;
      return '<div class="vzp-msj' + (nuevo ? ' vzp-msj-nuevo' : '') + '">' + (nuevo && quien ? '<b style="color:' + colorNombre(quien) + '">' + esc(quien) + '</b>' : '') +
        (m.texto ? '<p>' + esc(m.texto) + '</p>' : '') +
        ((m.adjuntos || []).length ? '<div class="vzp-msj-adj">' + m.adjuntos.map(function (a) { return adjuntoHtml(a); }).join('') + '</div>' : '') +
        (m.hora ? '<time>' + esc(m.hora) + '</time>' : '') + '</div>';
    }).join('');
  }
  function mensajesDe(r) { return (r && Array.isArray(r.mensajes) ? r.mensajes : []).filter(function (m) { return m && (m.texto || (m.adjuntos || []).length); }); }
  /* op.grupos: capturas ya partidas por altura (índices de los mensajes) · op.todos: una sola, con todos los nombres (para medir) */
  function chatHtml(r, hoy, op) {
    op = op || {};
    var ms = mensajesDe(r);
    if (!ms.length) return '<div class="vzp-estado"><span class="vzp-estado-ic">' + ico('chat') + '</span><h3>Ese día no hay mensajes para leer</h3><p>Puede que se hayan ocultado o que la conversación fuera de otro proyecto.</p></div>';
    var cs = op.todos ? [ms] : (op.grupos ? op.grupos.map(function (g) { return g.map(function (i) { return ms[i]; }).filter(function (m) { return m; }); }).filter(function (g) { return g.length; }) : capturas(ms));
    var n = cs.length, dia = fechaCorta(r.dia, hoy), sem = partesFecha(r.dia) ? DIA3[partesFecha(r.dia).s] + ' ' : '';
    return '<div class="vzp-capturas" tabindex="0" role="region" aria-roledescription="carrusel" aria-label="La conversación del día en ' + plural(n, 'captura', 'capturas') + '">' + cs.map(function (g, i) {
      return '<section class="vzp-captura" role="group" aria-roledescription="captura" aria-label="Captura ' + (i + 1) + ' de ' + n + '">' +
        '<header class="vzp-cap-cab">' + ico('chat') + '<span><b>Chat del equipo</b><small>' + esc(sem + dia) + ' · ' + plural(ms.length, 'mensaje', 'mensajes') + '</small></span><i>' + (i + 1) + '/' + n + '</i></header>' +
        '<div class="vzp-cap-msjs">' + burbujasHtml(g, op.todos) + '</div></section>';
    }).join('') + '</div>' +
      (n > 1 ? '<div class="vzp-cap-nav"><button type="button" class="vzp-cap-b" data-cap="-1" aria-label="Captura anterior" disabled>' + ico('izq') + '</button><span class="vzp-cap-pos" aria-live="polite">1 de ' + n + '</span>' +
        '<button type="button" class="vzp-cap-b" data-cap="1" aria-label="Captura siguiente">' + ico('flecha') + '</button></div>' : '') +
      '<p class="vzp-nota vzp-nota-c">Lo escribió el equipo en su grupo. Sólo lo ve quien tiene una liga de equipo.</p>';
  }

  /* ───────────────────────── Archivos ───────────────────────── */
  function grupoOrdenado(r) {
    var gs = (r && Array.isArray(r.grupos) ? r.grupos : []).map(function (g) { return g && Array.isArray(g.archivos) ? { nombre: String(g.nombre || 'Otros'), archivos: g.archivos.filter(function (a) { return a && a.id; }) } : null; })
      .filter(function (g) { return g && g.archivos.length; });
    return gs.slice().sort(function (a, b) {
      var ia = GRUPOS.indexOf(a.nombre), ib = GRUPOS.indexOf(b.nombre);
      return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib);
    });
  }
  function archivoHtml(a, hoy) {
    var k = tipoArchivo(a.tipo, a.nombre), f = fechaCorta(String(a.fecha || '').slice(0, 10), hoy), z = tamano(a.tamano), vista = String(a.vista || 'descarga');
    var google = num(a.tamano) === null && /google-apps/.test(String(a.tipo || ''));
    var meta = [f, z || (google ? k.n + ' de Google' : '')].filter(function (x) { return x; }).join(' · ');
    var accion = vista === 'no' ? 'Sólo en el expediente' : (vista === 'pdf' || vista === 'imagen' ? 'Ver' : 'Bajar');
    var dentro = iconoArchivo(a.tipo, a.nombre) + '<span class="vzp-arch-n"><b>' + esc(a.nombre || 'Archivo') + '</b><small>' + esc(meta || k.n) + '</small></span><span class="vzp-arch-acc">' + accion + (vista === 'no' ? '' : ico('flecha', 'vzp-ic-chico')) + '</span>';
    if (vista === 'no') return '<li><div class="vzp-arch vzp-arch-no" title="Se puede ver sólo en el expediente del proyecto">' + dentro + '</div></li>';
    return '<li><button type="button" class="vzp-arch" data-archivo="' + esc(a.id) + '" data-nombre="' + esc(a.nombre || '') + '" data-tipo="' + esc(a.tipo || '') + '" data-vista="' + esc(vista) + '"' + (num(a.tamano) !== null ? ' data-tamano="' + a.tamano + '"' : '') +
      ' aria-label="' + esc((a.nombre || 'Archivo') + ', ' + k.n + (meta ? ', ' + meta : '') + '. ' + (accion === 'Ver' ? 'Ver aquí' : 'Bajar')) + '">' + dentro + '</button></li>';
  }
  function archivosHtml(r, op) {
    op = op || {};
    var gs = grupoOrdenado(r);
    if (!gs.length) return estadoHtml('archivos', 'plan');
    var total = 0; gs.forEach(function (g) { total += g.archivos.length; });
    return '<p class="vzp-nota">' + plural(total, 'archivo', 'archivos') + ' del proyecto, por tipo. Toca uno para verlo aquí.</p>' +
      (r.incompleta ? '<p class="vzp-aviso">El expediente es muy grande: puede que falten algunos archivos en esta lista.</p>' : '') +
      gs.map(function (g, i) {
        return '<section class="vzp-seccion vzp-grupo" aria-labelledby="vzpG' + i + '"><h3 class="vzp-sec-tit" id="vzpG' + i + '">' + esc(g.nombre) + ' <span>' + g.archivos.length + '</span></h3>' +
          '<ul class="vzp-archs">' + g.archivos.map(function (a) { return archivoHtml(a, op.hoy); }).join('') + '</ul></section>';
      }).join('');
  }

  /* ───────────────────────── Opciones ───────────────────────── */
  /* Una comparación explícita del mismo caso no es el selector de su historial. */
  function opcionesFijas(d) {
    var ps = d && d.menu && d.menu.planes, caso = '', vistos = {};
    return Array.isArray(ps) && ps.length > 1 && ps.every(function (p) {
      var m = /^ppp:([A-Za-z0-9_-]+):([A-Za-z0-9_-]+)$/.exec(String(p && p.id || ''));
      if (!m || vistos[p.id] || caso && caso !== m[1]) return false;
      caso = m[1]; vistos[p.id] = true; return true;
    });
  }
  /* Una opción de la liga, de lo que el servidor ya dio para ella (sin calcular nada). */
  function resumenOpcion(j, etiqueta) {
    var v = (j && j.v) || {}, datos = (j && j.datos) || {}, vs = (j && j.versiones) || [];
    var meta = vs.filter(function (x) { return x && x.n === j.version; })[0] || {};
    var t = datos['terreno.m2'];
    return {
      plan: (j.menu && j.menu.plan) || '', version: j.version || 0, etiqueta: String(etiqueta || ''), nombrePlan: (j.plan && j.plan.nombre) || '',
      nombreV: meta.nombre || v.nombre || '', estado: String(v.estado || meta.estado || ''), terreno: t && num(t.valor) !== null ? t.valor : null,
      ventas: num(v.ventas), ganancia: num(v.ganancia), recibe: num(v.dueno_recibe), veces: num(v.dueno_veces), llave: j.llave || '',
      pago: v.pago_especie === true ? { anticipo: num(v.pago_anticipo), vivienda: num(v.pago_vivienda), m2: num(v.pago_m2), unidades: num(v.pago_unidades), mes: num(v.dueno_meses), desarrollador: num(v.pago_resultado) } : null
    };
  }
  function cifraHtml(nombre, x, extra, malo) {
    return '<span class="vzp-cifra"><small>' + esc(nombre) + '</small><b' + (malo ? ' class="vzp-malo"' : '') + '>' + (x === null || x === undefined || x === '' ? '<span class="vzp-sin">sin dato</span>' : esc(x)) + '</b>' + (extra ? '<i>' + esc(extra) + '</i>' : '') + '</span>';
  }
  /* modo 'plan' (cada terreno, una versión): el terreno es el título · 'version' (varias versiones): la versión es el
     título · 'grupo' (varias de cada terreno, bajo el nombre del terreno): sólo la versión */
  function opcionHtml(o, actual, varias, modo) {
    var v = o.version ? 'V' + o.version + (o.nombreV ? ' · ' + o.nombreV : '') : '', m2 = o.terreno !== null && o.terreno !== undefined ? ent(o.terreno) + ' m²' : '';
    var titulo = modo === 'version' || modo === 'grupo' ? (v || o.etiqueta || 'Versión') : (o.etiqueta || o.nombrePlan || 'Plan');
    var sub = (modo === 'version' || modo === 'fijas' ? [m2] : modo === 'grupo' ? [] : [v, m2]).filter(function (x) { return x; }).join(' · ');
    var cargando = o.cargando && !o.listo;
    var cifras = cargando ? '<span class="vzp-op-cifras vzp-op-cargando" aria-hidden="true"><i></i><i></i><i></i></span>' :
      (o.error ? '<span class="vzp-op-err">No pude leer esta opción.</span>' :
        '<span class="vzp-op-cifras">' + cifraHtml(o.pago ? 'Valor de viviendas' : 'Ventas', mdp(o.ventas)) + cifraHtml(o.pago ? 'Utilidad proyecto' : 'Ganancia', mdp(o.ganancia), '', o.ganancia !== null && o.ganancia < 0) +
        cifraHtml('El dueño recibe', mdp(o.recibe), o.veces !== null ? '×' + o.veces.toFixed(2) + ' su tierra' : '') + '</span>');
    var pago = o.pago, detalle = pago && !cargando && !o.error ? '<span class="vzp-op-pago">' +
      '<span>Anticipo ' + esc(mdp(pago.anticipo) || 'sin dato') + ' + viviendas ' + esc(mdp(pago.vivienda) || 'sin dato') + '</span>' +
      '<span>' + esc(pago.m2 === null ? 'Área por definir' : pago.m2.toFixed(2) + ' m²') + ' · ' + esc(pago.unidades === null ? 'unidades por definir' : pago.unidades.toFixed(2) + ' viviendas equivalentes') + (pago.mes === null ? '' : ' · mes ' + esc(pago.mes)) + '</span>' +
      '<strong' + (pago.desarrollador !== null && pago.desarrollador < 0 ? ' class="vzp-malo"' : '') + '>Desarrollador: ' + esc(mdp(pago.desarrollador) || 'sin dato') + (pago.desarrollador !== null && pago.desarrollador < 0 ? ' · pérdida' : '') + '</strong></span>' : '';
    var marcas = (o.estado === 'vigente' ? '<span class="vzp-chip vzp-chip-ok">' + ico('paloma', 'vzp-ic-chico') + 'vigente</span>' : '') + (actual ? '<span class="vzp-chip vzp-chip-tinta">viendo ahora</span>' : '');
    var aria = titulo + ', ' + sub + (o.estado === 'vigente' ? ', vigente' : '') + (actual ? ', es la que estás viendo' : '') + (cargando ? '' : '. Ventas ' + (mdp(o.ventas) || 'sin dato') + ', ganancia ' + (mdp(o.ganancia) || 'sin dato') + ', el dueño recibe ' + (mdp(o.recibe) || 'sin dato')) + (varias ? '. Ver esta opción en el plan' : '');
    return '<li><button type="button" class="vzp-op' + (actual ? ' vzp-op-actual' : '') + '" data-plan="' + esc(o.plan) + '" data-v="' + esc(o.porOmision ? 0 : o.version) + '" data-version="' + esc(o.version) + '" aria-label="' + esc(aria) + '"' + (actual ? ' aria-current="true"' : '') + '>' +
      '<span class="vzp-op-cab"><span class="vzp-op-tit"><b>' + esc(titulo) + '</b>' + (sub ? '<small>' + esc(sub) + '</small>' : '') + '</span><span class="vzp-op-marcas">' + marcas + '</span></span>' + cifras + detalle +
      (varias && !actual ? '<span class="vzp-op-ir">Ver en el plan' + ico('flecha', 'vzp-ic-chico') + '</span>' : '') + '</button></li>';
  }
  function opcionesHtml(ops, op) {
    op = op || {};
    var lista = ops || [], varias = lista.length > 1, planes = [];
    lista.forEach(function (o) { if (planes.indexOf(o.plan) < 0) planes.push(o.plan); });
    var deUno = function (p) { return lista.filter(function (o) { return o.plan === p; }); };
    var variasV = planes.some(function (p) { return deUno(p).length > 1; });
    var tarjeta = function (o, modo) { return opcionHtml(o, o.plan === op.plan && o.version === op.version, varias, op.fijas ? 'fijas' : modo); };
    var cuerpo = planes.length > 1 && variasV ? planes.map(function (p, i) {
      var os = deUno(p), conM2 = os.filter(function (o) { return o.terreno !== null && o.terreno !== undefined; })[0], et = os[0].etiqueta || os[0].nombrePlan || 'Plan';
      return '<section class="vzp-op-grupo" aria-labelledby="vzpOG' + i + '"><h3 class="vzp-sec-tit" id="vzpOG' + i + '">' + esc(et) + (conM2 ? ' <em>' + esc(ent(conM2.terreno)) + ' m²</em>' : '') + '</h3>' +
        '<ul class="vzp-ops">' + os.map(function (o) { return tarjeta(o, 'grupo'); }).join('') + '</ul></section>';
    }).join('') : '<ul class="vzp-ops">' + lista.map(function (o) { return tarjeta(o, planes.length > 1 || !varias ? 'plan' : 'version'); }).join('') + '</ul>';
    return '<p class="vzp-nota vzp-unidades">' + (op.fijas ? 'Opciones del mismo proyecto. ' : '') + 'Cifras en millones de pesos, como en el plan.</p>' + cuerpo +
      (varias ? '<a class="vzp-comparar" href="visor-comparar.html#l=' + encodeURIComponent(op.liga || '') + '">' + ico('comparar') + '<span><b>Comparar las ' + lista.length + ' opciones lado a lado</b><small>Factor por factor; se puede guardar en PDF</small></span>' + ico('flecha', 'vzp-ic-chico') + '</a>'
        : '<p class="vzp-nota vzp-una">Esta liga trae una sola opción del plan. Si se agregan otros terrenos o versiones, aquí podrás cambiar entre ellas y compararlas lado a lado.</p>');
  }

  /* ───────────────────────── la página ───────────────────────── */
  function monta(pagina) {
    var doc = root.document, win = root, actual = pestanaDe(win.location.hash), posiciones = {}, ultimoPlan = '', montado = false, apagado = false;
    var cache = { historial: null, archivos: null }, selDia = '', ops = { mapa: {}, base: '', corriendo: false, t: 0 };
    var barra, paneles = {};
    var hoy = function () { return hoyISO(); };

    /* ── el armazón ── */
    function arma() {
      if (montado) return;
      montado = true;
      doc.body.insertAdjacentHTML('afterbegin', sprite());
      var plan = doc.querySelector('.vz-marco');
      if (plan) { plan.id = 'vzpPanel-plan'; plan.setAttribute('role', 'tabpanel'); plan.setAttribute('aria-labelledby', 'vzpTab-plan'); paneles.plan = plan; }
      ['historial', 'archivos', 'opciones'].forEach(function (k) {
        var s = doc.createElement('section');
        s.className = 'vzp-panel'; s.id = 'vzpPanel-' + k; s.setAttribute('role', 'tabpanel'); s.setAttribute('aria-labelledby', 'vzpTab-' + k); s.hidden = true;
        s.innerHTML = cabeza(PESTANAS.filter(function (p) { return p[0] === k; })[0][1], pagina.datos()) + '<div class="vzp-cuerpo"></div>';
        var aviso = doc.getElementById('vzAviso');
        doc.body.insertBefore(s, aviso || null);
        paneles[k] = s;
      });
      paneles.opciones.querySelector('.vzp-cuerpo').innerHTML = '<div id="vzpElige"></div><div id="vzpOps">' + esqueleto('opciones') + '</div>';
      barra = doc.createElement('nav');
      barra.id = 'vzBarra'; barra.className = 'vzp-barra'; barra.setAttribute('aria-label', 'Secciones del plan');
      barra.innerHTML = barraHtml(actual);
      doc.body.appendChild(barra);
      doc.documentElement.classList.add('vzp-con-barra');
      try { if ('scrollRestoration' in win.history) win.history.scrollRestoration = 'manual'; } catch (e) { }
      eventos();
      muestraPanel(actual, true);
    }
    function marcasBarra() { var d = pagina.datos(); return d && !opcionesFijas(d) && d.elige && d.elige.versiones && d.elige.versiones.length ? { opciones: 'Sólo tú: aquí escoges la versión que ven todos' } : {}; }
    /* Se vuelve a dibujar la barra; si el foco estaba en ella (teclado, lector de pantalla), regresa a la pestaña
       elegida en lugar de perderse en el cuerpo de la página. */
    function pintaBarra() {
      if (!barra) return;
      var enBarra = barra.contains(doc.activeElement);
      barra.innerHTML = barraHtml(actual, marcasBarra());
      if (enBarra) { var b = doc.getElementById('vzpTab-' + actual); if (b) { try { b.focus({ preventScroll: true }); } catch (e) { b.focus(); } } }
    }
    function cuerpo(k) { return paneles[k] && paneles[k].querySelector('.vzp-cuerpo'); }
    function cabezas() {
      var d = pagina.datos();
      ['historial', 'archivos', 'opciones'].forEach(function (k) {
        var c = paneles[k] && paneles[k].querySelector('.vzp-cab');
        if (c) c.outerHTML = cabeza(PESTANAS.filter(function (p) { return p[0] === k; })[0][1], d);
      });
    }

    /* ── cambiar de pestaña: la dirección lo recuerda (#l=…&t=…) sin llenar el «atrás» ── */
    function ir(k, foco) {
      if (!paneles[k] || apagado) return;
      if (k === actual) { try { win.scrollTo(0, 0); } catch (e) { } return; }
      posiciones[actual] = win.pageYOffset || 0;
      actual = k;
      try { win.history.replaceState(win.history.state, '', win.location.pathname + win.location.search + hashCon(win.location.hash, k)); } catch (e) { }
      pintaBarra();
      muestraPanel(k);
      if (foco) { var b = doc.getElementById('vzpTab-' + k); if (b) b.focus(); }
    }
    function muestraPanel(k, primera) {
      Object.keys(paneles).forEach(function (x) { paneles[x].hidden = x !== k; });
      var esq = doc.getElementById('vzEsq');
      if (esq) esq.hidden = k !== 'plan';
      if (k === 'plan') pagina.ajusta();
      else if (k === 'opciones') { pintaOpciones(); cargaOpciones(); }
      else if (!pagina.plan()) { var c = cuerpo(k); if (c && !c.firstChild) c.innerHTML = esqueleto(k); }   // el plan todavía no llega: su esqueleto
      else asegura(k);
      try { win.scrollTo(0, primera ? 0 : posiciones[k] || 0); } catch (e) { }
      if (!primera) pagina.aviso(PESTANAS.filter(function (p) { return p[0] === k; })[0][1]);
    }

    /* ── la red: GET, con la liga del visor y el plan que se ve; sin `k` (la liga basta) ── */
    /* Si no contesta a tiempo, falla con { c: 'tarda' } (no es «sin conexión»: el servidor puede seguir leyendo y
       dejarlo en su caché para el siguiente intento). */
    function pide(recurso, extra, ms, ctl) {
      var q = '?recurso=' + recurso + '&liga=' + encodeURIComponent(pagina.liga()) + (pagina.plan() ? '&plan=' + encodeURIComponent(pagina.plan()) : '') + (extra || '');
      var vencio = false, ab = win.AbortController ? new win.AbortController() : null, t = setTimeout(function () { vencio = true; if (ab) ab.abort(); }, ms || 45000);
      if (ctl) ctl.abortar = function () { if (ab) ab.abort(); };
      return win.fetch(pagina.ENDPOINT + q, { credentials: 'omit', redirect: 'follow', referrerPolicy: 'no-referrer', signal: ab ? ab.signal : undefined })
        .then(function (r) { return r.json(); }).then(function (j) { clearTimeout(t); return j; }, function (e) { clearTimeout(t); throw vencio ? { c: 'tarda' } : e; });
    }
    /* Historial y Archivos: se piden al abrir la pestaña (y en fondo, poco después de abrir el plan). Si ya hay algo,
       se enseña mientras llega lo nuevo; si lo nuevo falla, se queda lo que había. */
    /* Devuelve la promesa de la lectura (o null si no hizo falta pedir): así la lectura en fondo de Archivos espera a
       la de Historial y la primera vez no recorren las mismas carpetas de Drive dos veces a la vez. */
    function asegura(k, fuerza) {
      var plan = pagina.plan(), e = cache[k];
      if (!plan || apagado) return null;
      if (!fuerza && e && e.plan === plan && (e.estado === 'cargando' || Date.now() - e.t < FRESCO_MS)) { pinta(k); return e.p || null; }
      var previo = e && e.plan === plan && e.r ? e.r : null;
      e = cache[k] = { plan: plan, estado: 'cargando', r: previo, t: Date.now() };
      pinta(k);
      setTimeout(function () {
        var t = cache[k] === e && e.estado === 'cargando' && cuerpo(k) && cuerpo(k).querySelector('.vzp-espera-t');
        if (t) t.textContent = ESPERA_LARGA;
      }, 5000);
      e.p = pide('ppp2-' + k, k === 'historial' && previo && previo.llave ? '&si=' + encodeURIComponent(previo.llave) : '').then(function (j) {
        if (cache[k] !== e) return;
        var c = clase(j);
        if (c === 'ok') { if (!(j.igual && e.r)) e.r = j; e.estado = 'ok'; }
        else if (c === 'interno' && e.r) e.estado = 'ok';                     // se queda lo que ya se veía
        else { e.estado = c; if (c === 'liga') pagina.confirma(); }
        e.t = Date.now(); pinta(k);
      }, function (falla) {
        if (cache[k] !== e) return;
        e.estado = e.r ? 'ok' : (falla && falla.c === 'tarda' ? 'tarda' : 'red'); e.t = e.r ? Date.now() : 0; pinta(k);
      });
      return e.p;
    }
    function pinta(k) {
      var c = cuerpo(k), e = cache[k];
      if (!c || !e) return;
      if (e.estado === 'cargando' && !e.r) { c.innerHTML = esqueleto(k); c.setAttribute('aria-busy', 'true'); return; }
      c.removeAttribute('aria-busy');
      if (e.estado !== 'ok' && e.estado !== 'cargando') { c.innerHTML = estadoHtml(k, e.estado, k); return; }
      if (k === 'historial') {
        var pista = c.querySelector('.vzp-linea-pista'), desp = pista ? pista.scrollLeft : null, alFinal = pista ? pista.scrollLeft + pista.clientWidth >= pista.scrollWidth - 4 : true;
        c.innerHTML = historialHtml(e.r, { sel: selDia, hoy: hoy() });
        var p2 = c.querySelector('.vzp-linea-pista');
        if (p2) { p2.scrollLeft = desp === null || alFinal ? p2.scrollWidth : desp; bordes(p2); }
        var on = c.querySelector('.vzp-dia-on');
        if (on) selDia = on.getAttribute('data-dia');
      } else c.innerHTML = archivosHtml(e.r, { hoy: hoy() });
    }
    function bordes(p) {
      var caja = p.parentNode;
      caja.classList.toggle('vzp-mas-izq', p.scrollLeft > 4);
      caja.classList.toggle('vzp-mas-der', p.scrollLeft + p.clientWidth < p.scrollWidth - 4);
    }
    function escogeDia(f, enfoca) {
      var c = cuerpo('historial'), e = cache.historial;
      if (!c || !e || !e.r) return;
      selDia = f;
      Array.prototype.forEach.call(c.querySelectorAll('.vzp-dia'), function (b) {
        var si = b.getAttribute('data-dia') === f;
        b.classList.toggle('vzp-dia-on', si);
        if (si) b.setAttribute('aria-current', 'date'); else b.removeAttribute('aria-current');
      });
      var dia = diasOrdenados(e.r).filter(function (d) { return d.fecha === f; })[0], caja = c.querySelector('.vzp-dia-caja');
      if (caja) caja.innerHTML = diaHtml(dia, e.r.audiencia === 'equipo', hoy());
      var b = c.querySelector('.vzp-dia[data-dia="' + f + '"]'), pista = c.querySelector('.vzp-linea-pista');
      if (b && pista) {
        var izq = b.offsetLeft - pista.clientWidth / 2 + b.offsetWidth / 2;
        try { pista.scrollTo({ left: izq, behavior: reducido() ? 'auto' : 'smooth' }); } catch (x) { pista.scrollLeft = izq; }
      }
      if (enfoca) { var t = c.querySelector('#vzpDiaTit'); if (t) { try { t.focus({ preventScroll: true }); } catch (x) { } baja(t); } }
    }
    function baja(el) {
      var top = el.getBoundingClientRect().top + (win.pageYOffset || 0) - 16;
      try { win.scrollTo({ top: top, behavior: reducido() ? 'auto' : 'smooth' }); } catch (x) { win.scrollTo(0, top); }
    }
    function reducido() { try { return win.matchMedia('(prefers-reduced-motion: reduce)').matches; } catch (e) { return false; } }

    /* ── Opciones: cada terreno y cada versión que la liga deja ver, con sus tres cifras ── */
    function claveOp(plan, v) { return plan + '|' + (v || 0); }
    function semillaOpciones(d) {
      if (!d || !d.menu) return;
      var plan = d.menu.plan, planes = d.menu.planes && d.menu.planes.length ? d.menu.planes : [{ id: plan, etiqueta: '' }];
      var base = planes.map(function (p) { return p.id + '=' + (p.etiqueta || ''); }).join(',');
      if (base !== ops.base) { ops = { mapa: {}, base: base, corriendo: false, t: 0 }; }
      ops.planes = planes;
      var et = function (id) { var p = planes.filter(function (x) { return x.id === id; })[0]; return p && planes.length > 1 ? p.etiqueta : ''; };
      var mostrada = d.plan && d.plan.mostrada ? d.plan.mostrada : d.version;
      (d.versiones && d.versiones.length ? d.versiones : [{ n: d.version }]).forEach(function (x) {
        var k = claveOp(plan, x.n);
        if (!ops.mapa[k]) ops.mapa[k] = { plan: plan, version: x.n, etiqueta: et(plan), nombreV: x.nombre || '', estado: x.estado || '', terreno: null, ventas: null, ganancia: null, recibe: null, veces: null, cargando: true };
        if (x.n === mostrada || (d.versiones || []).length <= 1) ops.mapa[k].porOmision = true;
      });
      var yo = resumenOpcion(d, et(plan));
      yo.cargando = false; yo.listo = true; yo.porOmision = ops.mapa[claveOp(plan, d.version)] ? !!ops.mapa[claveOp(plan, d.version)].porOmision : true;
      ops.mapa[claveOp(plan, d.version)] = yo;
      planes.forEach(function (p) { if (p.id !== plan && !Object.keys(ops.mapa).some(function (k) { return ops.mapa[k].plan === p.id; })) ops.mapa[claveOp(p.id, 0)] = { plan: p.id, version: 0, etiqueta: et(p.id), cargando: true, porOmision: true, terreno: null, ventas: null, ganancia: null, recibe: null, veces: null }; });
    }
    function listaOpciones() {
      var orden = (ops.planes || []).map(function (p) { return p.id; });
      return Object.keys(ops.mapa).map(function (k) { return ops.mapa[k]; }).sort(function (a, b) {
        var ia = orden.indexOf(a.plan), ib = orden.indexOf(b.plan);
        return ia !== ib ? ia - ib : (a.version || 99) - (b.version || 99);
      });
    }
    function pintaOpciones() {
      var d = pagina.datos(), cont = doc.getElementById('vzpOps');
      if (!cont || !d) return;
      cont.innerHTML = opcionesHtml(listaOpciones(), { plan: d.menu && d.menu.plan, version: d.version, liga: pagina.liga(), fijas: opcionesFijas(d) });
    }
    function pintaElige() {
      var d = pagina.datos(), cont = doc.getElementById('vzpElige'), V = root.VisorPPP;
      if (!cont) return;
      cont.innerHTML = d && !opcionesFijas(d) && d.elige && V && V.eligeHtml ? V.eligeHtml(d) : '';
    }
    function cargaOpciones() {
      var d = pagina.datos();
      if (!d || ops.corriendo || apagado || Date.now() - ops.t < FRESCO_MS) return;
      var pendientes = listaOpciones().filter(function (o) { return !o.listo || o.error; });   // una que falló se vuelve a pedir al regresar a la pestaña
      if (!pendientes.length) { ops.t = Date.now(); return; }
      ops.corriendo = true;
      var base = ops.base, enCurso = 0, i = 0;
      var trae = function (o) {
        var extra = '&plan=' + encodeURIComponent(o.plan) + (o.version && !o.porOmision ? '&v=' + o.version : '');
        var q = '?recurso=ppp2-visor&liga=' + encodeURIComponent(pagina.liga()) + extra;
        var ab = win.AbortController ? new win.AbortController() : null, t = setTimeout(function () { if (ab) ab.abort(); }, 45000);
        return win.fetch(pagina.ENDPOINT + q, { credentials: 'omit', redirect: 'follow', referrerPolicy: 'no-referrer', signal: ab ? ab.signal : undefined })
          .then(function (r) { return r.json(); }).then(function (j) { clearTimeout(t); return j; }, function (e) { clearTimeout(t); throw e; });
      };
      var sigue = function () {
        if (ops.base !== base) return;
        while (enCurso < 3 && i < pendientes.length) (function (o) {
          enCurso++; i++;
          if (o.error) { o.error = false; o.listo = false; o.cargando = true; }
          trae(o).then(function (j) {
            if (ops.base !== base) return;
            if (j && j.ok && j.menu) {
              var k = claveOp(o.plan, o.version), r = resumenOpcion(j, o.etiqueta);
              r.listo = true; r.porOmision = !!o.porOmision;
              if (o.version === 0) {                                   // un terreno que todavía no se conocía: ya se sabe su versión y sus otras versiones
                delete ops.mapa[k];
                ops.mapa[claveOp(o.plan, r.version)] = r;
                (j.versiones || []).forEach(function (x) {
                  var kk = claveOp(o.plan, x.n);
                  if (!ops.mapa[kk]) { var nueva = { plan: o.plan, version: x.n, etiqueta: o.etiqueta, nombreV: x.nombre || '', estado: x.estado || '', cargando: true, terreno: null, ventas: null, ganancia: null, recibe: null, veces: null }; ops.mapa[kk] = nueva; pendientes.push(nueva); }
                });
              } else ops.mapa[k] = r;
            } else { o.error = true; o.listo = true; if (j && j.error === 'liga') pagina.confirma(); }
          }, function () { o.error = true; o.listo = true; }).then(function () {
            enCurso--;
            if (ops.base !== base) return;
            if (actual === 'opciones') pintaOpciones();
            if (i < pendientes.length) sigue();
            else if (!enCurso) { ops.corriendo = false; ops.t = Date.now(); }
          });
        })(pendientes[i]);
      };
      sigue();
    }

    /* ── las hojas que suben desde abajo (una sobre otra): la conversación de un día, la vista previa ── */
    var pila = [], gesto = null, atrasPendientes = 0;
    function abreHoja(o) {
      var id = 'vzpH' + (pila.length + 1) + '-' + Date.now().toString(36);
      var capa = doc.createElement('div');
      capa.className = 'vzp-hoja' + (o.clase ? ' ' + o.clase : '');
      capa.innerHTML = '<div class="vzp-hoja-caja" role="dialog" aria-modal="true" aria-labelledby="' + id + '" tabindex="-1"><div class="vzp-hoja-cab"><span class="vzp-asa" aria-hidden="true"></span>' +
        '<div class="vzp-hoja-tits"><h2 id="' + id + '">' + esc(o.titulo) + '</h2>' + (o.sub ? '<p>' + esc(o.sub) + '</p>' : '') + '</div><div class="vzp-hoja-acc"></div>' +
        '<button type="button" class="vzp-x" aria-label="Cerrar">' + ico('cerrar') + '</button></div><div class="vzp-hoja-cuerpo"></div></div>';
      doc.body.appendChild(capa);
      /* como en la hoja de los cuadros: que el gesto de bajarla desde el encabezado no deje un «fling» que se coma
         el siguiente toque (los botones y ligas del encabezado siguen tocándose) */
      capa.querySelector('.vzp-hoja-cab').addEventListener('touchstart', function (e) {
        if (!(e.target.closest && e.target.closest('button, a'))) e.preventDefault();
      }, { passive: false });
      var h = { capa: capa, caja: capa.firstChild, cuerpo: capa.querySelector('.vzp-hoja-cuerpo'), acciones: capa.querySelector('.vzp-hoja-acc'), previo: doc.activeElement, alCerrar: null, nivel: pila.length + 1 };
      h.cierra = function (desdeHistoria, animada) { cierraHoja(h, desdeHistoria, animada); };
      pila.push(h);
      doc.documentElement.classList.add('vz-con-modal');
      try { capa.querySelector('.vzp-x').focus({ preventScroll: true }); } catch (e) { }
      try { win.history.pushState({ vzp: h.nivel }, ''); } catch (e) { }
      return h;
    }
    function cierraHoja(h, desdeHistoria, animada) {
      var i = pila.indexOf(h);
      if (i < 0) return;
      pila.splice(i, 1);
      if (h.alCerrar) { try { h.alCerrar(); } catch (e) { } }
      /* la capa deja de atrapar toques en cuanto se suelta: el siguiente toque llega a la página aunque la hoja todavía vaya bajando */
      h.capa.classList.add('vzp-baja');
      var quita = function () { if (h.capa.parentNode) h.capa.parentNode.removeChild(h.capa); };
      if (animada && !reducido()) { h.caja.style.transform = 'translateY(110%)'; setTimeout(quita, 200); } else quita();
      if (!pila.length && !(doc.getElementById('vzModal') && !doc.getElementById('vzModal').hidden)) doc.documentElement.classList.remove('vz-con-modal');
      if (h.previo && h.previo.focus && doc.contains(h.previo)) { try { h.previo.focus({ preventScroll: true }); } catch (e) { } }
      /* el «atrás» de este cierre llega después: se cuenta para que no cierre una hoja que se abra mientras tanto */
      if (!desdeHistoria) { try { if (win.history.state && win.history.state.vzp === h.nivel) { atrasPendientes++; win.history.back(); } } catch (e) { } }
    }
    function hojaArriba() { return pila[pila.length - 1] || null; }

    /* ── la conversación de un día ── */
    function abreChat(fecha) {
      var h = abreHoja({ titulo: 'Chat del equipo', sub: mayus1(fechaLarga(fecha, hoy())), clase: 'vzp-hoja-chat' }), ctl = {};
      h.alCerrar = function () { if (ctl.abortar) ctl.abortar(); };
      var carga = function () {
        h.cuerpo.innerHTML = '<div class="vzp-esq vzp-esq-chat" aria-hidden="true"><i class="vzp-esq-b" style="width:70%;height:54px"></i><i class="vzp-esq-b" style="width:56%;height:40px"></i><i class="vzp-esq-b" style="width:78%;height:68px"></i></div>';
        h.cuerpo.setAttribute('aria-busy', 'true');
        pide('ppp2-chat', '&dia=' + encodeURIComponent(fecha), 45000, ctl).then(function (j) {
          if (pila.indexOf(h) < 0) return;
          h.cuerpo.removeAttribute('aria-busy');
          var c = clase(j);
          if (c !== 'ok') { h.cuerpo.innerHTML = estadoHtml('chat', c, 'chat'); if (c === 'liga') pagina.confirma(); return; }
          h.cuerpo.innerHTML = chatHtml(j, hoy());
          /* medir cada burbuja con su nombre arriba y sin él, y partir por lo que cabe a la vista: lo que deja la
             captura (su alto máximo en esta pantalla) menos su encabezado y sus márgenes */
          var ms = mensajesDe(j);
          if (ms.length > 1) {
            var real = h.cuerpo.querySelector('.vzp-captura'), cab = real && real.querySelector('.vzp-cap-cab'), maxH = NaN;
            try { maxH = real ? parseFloat(win.getComputedStyle(real).maxHeight) : NaN; } catch (x) { maxH = NaN; }
            h.cuerpo.insertAdjacentHTML('beforeend', '<div class="vzp-midiendo" aria-hidden="true">' + chatHtml(j, hoy(), { todos: true }) + '</div>');
            var bs = h.cuerpo.querySelectorAll('.vzp-midiendo .vzp-msj'), con = [], sin = [];
            for (var i = 0; i < bs.length; i++) {
              var alto = bs[i].offsetHeight, nb = bs[i].firstElementChild && bs[i].firstElementChild.tagName === 'B' ? bs[i].firstElementChild : null;
              con.push(alto + 11);                                         // + su margen de arriba (7) y el hueco entre burbujas (4)
              sin.push(alto - (nb ? nb.offsetHeight + 1 : 0) + 4);
            }
            var capacidad = maxH > 0 && cab && cab.offsetHeight > 0 ? Math.round(maxH - cab.offsetHeight - 32) : Math.round(win.innerHeight * 0.92 - 330);
            capacidad = Math.max(160, Math.min(900, capacidad));
            if (con.length === ms.length && con.every(function (x) { return x > 11; })) h.cuerpo.innerHTML = chatHtml(j, hoy(), { grupos: agrupa(con, capacidad, 10, sin, ms.map(function (m) { return String(m.quien || ''); })) });
            else { var m0 = h.cuerpo.querySelector('.vzp-midiendo'); if (m0) m0.parentNode.removeChild(m0); }
          }
          var car = h.cuerpo.querySelector('.vzp-capturas');
          if (car) car.addEventListener('scroll', function () { posCaptura(h); }, { passive: true });
        }, function (falla) { if (pila.indexOf(h) >= 0) { h.cuerpo.removeAttribute('aria-busy'); h.cuerpo.innerHTML = estadoHtml('chat', falla && falla.c === 'tarda' ? 'tarda' : 'red', 'chat'); } });
      };
      h.reintenta = carga;
      carga();
    }
    function posCaptura(h) {
      var car = h.cuerpo.querySelector('.vzp-capturas'), caps = car ? car.querySelectorAll('.vzp-captura') : [];
      if (!caps.length) return 0;
      var paso = caps.length > 1 ? caps[1].offsetLeft - caps[0].offsetLeft : car.clientWidth, n = Math.round(car.scrollLeft / Math.max(1, paso));
      n = Math.max(0, Math.min(caps.length - 1, n));
      var pos = h.cuerpo.querySelector('.vzp-cap-pos'), bs = h.cuerpo.querySelectorAll('.vzp-cap-b');
      if (pos) pos.textContent = (n + 1) + ' de ' + caps.length;
      if (bs.length === 2) { bs[0].disabled = n === 0; bs[1].disabled = n === caps.length - 1; }
      return n;
    }
    function irCaptura(h, paso) {
      var car = h.cuerpo.querySelector('.vzp-capturas'), caps = car ? car.querySelectorAll('.vzp-captura') : [];
      if (!caps.length) return;
      var n = Math.max(0, Math.min(caps.length - 1, posCaptura(h) + paso)), izq = caps[n].offsetLeft - (car.clientWidth - caps[n].offsetWidth) / 2;
      try { car.scrollTo({ left: izq, behavior: reducido() ? 'auto' : 'smooth' }); } catch (e) { car.scrollLeft = izq; }
    }

    /* ── un archivo: se baja por partes (desde 0) y se enseña dentro de la página ── */
    function deBase64(s) {
      var b = win.atob(String(s || '')), u = new Uint8Array(b.length);
      for (var i = 0; i < b.length; i++) u[i] = b.charCodeAt(i);
      return u;
    }
    /* Una parte tras otra, nunca en paralelo (el servidor reexporta un Doc de Google en cada parte). Si a media
       bajada cambia el número de partes o llega otra parte, el archivo cambió entre una y otra: no se pegan
       pedazos de dos versiones; se dice que falló y se puede volver a intentar. */
    function bajaArchivo(id, alAvanzar, ctl) {
      var trozos = [], meta = null, recibido = 0;
      var parte = function (n) {
        return pide('ppp2-archivo', '&id=' + encodeURIComponent(id) + '&parte=' + n, 90000, ctl).then(function (j) {
          if (ctl.cancelado) throw { c: 'cancelado' };
          var c = clase(j);
          if (c !== 'ok') throw { c: c };
          var total = Math.max(1, Math.floor(Number(j.partes) || 1));
          if (total > PARTES_MAX) throw { c: 'grande' };
          if (!meta) meta = { nombre: String(j.nombre || ''), tipo: String(j.tipo || ''), partes: total };
          if (total !== meta.partes || (j.parte !== undefined && Number(j.parte) !== n) || typeof j.datos !== 'string') throw { c: 'interno' };
          var u;
          try { u = deBase64(j.datos); } catch (x) { throw { c: 'interno' }; }
          trozos.push(u); recibido += u.length;
          alAvanzar(n + 1, total, recibido);
          return n + 1 < total ? parte(n + 1) : { trozos: trozos, nombre: meta.nombre, tipo: meta.tipo };
        }, function (e) { throw e && e.c ? e : { c: ctl.cancelado ? 'cancelado' : 'red' }; });
      };
      return parte(0);
    }
    function esIOS() { var n = win.navigator || {}; return /iP(hone|od|ad)/.test(n.platform || '') || (n.platform === 'MacIntel' && n.maxTouchPoints > 1) || /iPhone|iPad|iPod/.test(n.userAgent || ''); }
    function abreArchivo(a) {
      var k = tipoArchivo(a.tipo, a.nombre), sub = [k.n, tamano(a.tamano)].filter(function (x) { return x; }).join(' · ');
      var h = abreHoja({ titulo: a.nombre || 'Archivo', sub: sub, clase: 'vzp-hoja-archivo' }), ctl = { cancelado: false }, urls = [];
      h.alCerrar = function () {
        ctl.cancelado = true; if (ctl.abortar) ctl.abortar();
        if (ctl.pdf) { try { ctl.pdf.destroy(); } catch (e) { } }
        urls.forEach(function (u) { try { win.URL.revokeObjectURL(u); } catch (e) { } });
      };
      var carga = function () {
        ctl.cancelado = false;
        h.acciones.innerHTML = '';
        h.cuerpo.innerHTML = '<div class="vzp-prog" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="0" aria-label="Bajando el archivo"><div class="vzp-prog-tit">' + iconoArchivo(a.tipo, a.nombre) +
          '<span><b>Bajando el archivo…</b><small class="vzp-prog-txt">Preparando</small></span></div><div class="vzp-prog-barra"><i style="width:4%"></i></div></div>';
        var prog = h.cuerpo.querySelector('.vzp-prog'), barraP = h.cuerpo.querySelector('.vzp-prog-barra i'), txt = h.cuerpo.querySelector('.vzp-prog-txt');
        bajaArchivo(a.id, function (n, total, recibido) {
          var p = Math.round(n / total * 100), mb = tamano(recibido) + (num(a.tamano) !== null && a.tamano >= recibido ? ' de ' + tamano(a.tamano) : '');
          if (barraP) barraP.style.width = Math.max(4, p) + '%';
          if (prog) { prog.setAttribute('aria-valuenow', String(p)); prog.setAttribute('aria-valuetext', p + ' %'); }
          if (txt) txt.textContent = (total > 1 ? 'Parte ' + n + ' de ' + total + ' · ' : '') + mb;
        }, ctl).then(function (r) {
          if (pila.indexOf(h) < 0) return;
          /* el tipo con que se arma el archivo es el de los bytes (ppp2-archivo), revisado aquí: nunca el de la lista */
          var tipo = tipoSeguro(r.tipo), nombre = r.nombre || a.nombre || 'archivo', pasivo = tipo !== 'application/octet-stream';
          var blob = new win.Blob(r.trozos, { type: tipo }), url = win.URL.createObjectURL(blob);
          urls.push(url);
          h.acciones.innerHTML = (pasivo ? '<a class="vzp-acc" href="' + url + '" target="_blank" rel="noopener" aria-label="Abrir aparte">' + ico('abrir') + '<span>Abrir aparte</span></a>' : '') +
            '<a class="vzp-acc" href="' + url + '" download="' + esc(nombreGuardar(nombre)) + '" aria-label="Guardar el archivo">' + ico('guardar') + '<span>Guardar</span></a>';
          var esPdf = tipo === 'application/pdf', esImg = VE_IMAGEN.test(tipo);
          if (esImg) { h.cuerpo.innerHTML = '<figure class="vzp-prev-img"><img src="' + url + '" alt="' + esc(nombre) + '"></figure>'; return; }
          if (esPdf) { pintaPdf(h, r.trozos, url, nombre, ctl, urls); return; }
          h.cuerpo.innerHTML = '<div class="vzp-prev-otro">' + iconoArchivo(tipo, nombre) + '<p><b>' + esc(nombre) + '</b><small>' + esc(k.n + (blob.size ? ' · ' + tamano(blob.size) : '')) + '</small></p>' +
            '<p class="vzp-nota vzp-nota-c">Este tipo de archivo no se puede ver aquí: guárdalo para abrirlo en tu equipo.</p>' +
            '<a class="vzp-boton" href="' + url + '" download="' + esc(nombreGuardar(nombre)) + '">' + ico('guardar') + 'Guardar el archivo</a></div>';
        }, function (e) {
          if (pila.indexOf(h) < 0 || (e && e.c === 'cancelado')) return;
          var c = (e && e.c) || 'red';
          h.cuerpo.innerHTML = estadoHtml('archivo', c, 'archivo');
          if (c === 'liga') pagina.confirma();
        });
      };
      h.reintenta = carga;
      carga();
    }
    /* pdf.js: página por página, conforme se acercan a la vista; cada página se pinta en un lienzo y se vuelve
       imagen (así el iPhone no junta lienzos en memoria). Si pdf.js no carga, el PDF se abre aparte. */
    var pdfjsP = null;
    function cargaPdfjs() {
      if (pdfjsP) return pdfjsP;
      pdfjsP = new Promise(function (ok, mal) {
        if (root.pdfjsLib && root.pdfjsLib.getDocument) { ok(root.pdfjsLib); return; }
        var s = doc.createElement('script'), t = setTimeout(function () { mal(new Error('tiempo')); }, 30000);
        s.src = PDFJS.js; s.integrity = PDFJS.sri; s.crossOrigin = 'anonymous'; s.referrerPolicy = 'no-referrer'; s.async = true;
        s.onload = function () { clearTimeout(t); if (root.pdfjsLib && root.pdfjsLib.getDocument) ok(root.pdfjsLib); else mal(new Error('pdfjs')); };
        s.onerror = function () { clearTimeout(t); mal(new Error('pdfjs')); };
        doc.head.appendChild(s);
      }).then(function (lib) {
        if (lib.GlobalWorkerOptions.workerPort) return lib;
        return win.fetch(PDFJS.worker, { integrity: PDFJS.sriWorker, credentials: 'omit', referrerPolicy: 'no-referrer', mode: 'cors' })
          .then(function (r) { if (!r.ok) throw new Error('worker'); return r.text(); })
          .then(function (txt) {
            var u = win.URL.createObjectURL(new win.Blob([txt], { type: 'text/javascript' }));
            lib.GlobalWorkerOptions.workerPort = new win.Worker(u);
            return lib;
          });
      });
      pdfjsP.catch(function () { pdfjsP = null; });
      return pdfjsP;
    }
    function pdfAparte(h, url, nombre, nota) {
      var marco = !esIOS() && win.navigator && win.navigator.pdfViewerEnabled === true;
      h.cuerpo.innerHTML = marco ? '<iframe class="vzp-pdf-marco" src="' + url + '" title="' + esc(nombre) + '"></iframe>' :
        '<div class="vzp-prev-otro">' + iconoArchivo('application/pdf', nombre) + '<p><b>' + esc(nombre) + '</b><small>PDF</small></p>' +
        '<p class="vzp-nota vzp-nota-c">' + esc(nota || 'Este teléfono abre los PDF aparte, con todas sus páginas.') + '</p>' +
        '<a class="vzp-boton" href="' + url + '" target="_blank" rel="noopener">' + ico('abrir') + 'Abrir el PDF</a></div>';
    }
    function pintaPdf(h, trozos, url, nombre, ctl, urls) {
      h.cuerpo.innerHTML = '<div class="vzp-pdf" aria-busy="true"><p class="vzp-nota vzp-nota-c">Preparando las páginas…</p></div>';
      var largo = 0; trozos.forEach(function (t) { largo += t.length; });
      var datos = new Uint8Array(largo), o = 0;
      trozos.forEach(function (t) { datos.set(t, o); o += t.length; });
      cargaPdfjs().then(function (lib) {
        if (ctl.cancelado) return null;
        var tarea = lib.getDocument({ data: datos, isEvalSupported: false, disableAutoFetch: true, disableStream: true });
        /* si pdf.js no termina de abrirlo (un worker que no contesta, un PDF que no sabe leer), no se queda en
           «Preparando…»: a los 45 s se suelta y el PDF se abre aparte */
        return new Promise(function (ok, mal) {
          var t = setTimeout(function () { try { tarea.destroy(); } catch (e) { } mal(new Error('tiempo')); }, 45000);
          tarea.promise.then(function (pdf) { clearTimeout(t); ok(pdf); }, function (e) { clearTimeout(t); mal(e); });
        });
      }).then(function (pdf) {
        if (!pdf) return;
        if (ctl.cancelado || pila.indexOf(h) < 0) { pdf.destroy(); return; }
        ctl.pdf = pdf;
        return pdf.getPage(1).then(function (p1) {
          var vp = p1.getViewport({ scale: 1 }), n = pdf.numPages, proporcion = vp.height / vp.width;
          var caja = h.cuerpo.querySelector('.vzp-pdf');
          caja.removeAttribute('aria-busy');
          caja.setAttribute('aria-label', nombre + ', ' + plural(n, 'página', 'páginas'));   // setAttribute no interpreta marcado: va tal cual
          var html = '';
          for (var i = 1; i <= n; i++) html += '<figure class="vzp-pag" data-n="' + i + '" style="aspect-ratio:' + (1 / proporcion).toFixed(4) + '"><figcaption>' + i + ' / ' + n + '</figcaption></figure>';
          caja.innerHTML = html;
          var cola = [], ocupado = false, lienzo = doc.createElement('canvas'), dpr = Math.min(2, win.devicePixelRatio || 1) * (n > 30 ? 0.75 : 1);
          var pinta1 = function () {
            if (ocupado || !cola.length || ctl.cancelado) return;
            ocupado = true;
            var fig = cola.shift(), num1 = +fig.getAttribute('data-n');
            pdf.getPage(num1).then(function (pg) {
              var base = pg.getViewport({ scale: 1 }), ancho = Math.max(200, fig.clientWidth || caja.clientWidth || 360), esc1 = ancho * dpr / base.width;
              if (base.width * esc1 * base.height * esc1 > 12e6) esc1 = Math.sqrt(12e6 / (base.width * base.height));
              var v = pg.getViewport({ scale: esc1 });
              lienzo.width = Math.floor(v.width); lienzo.height = Math.floor(v.height);
              return pg.render({ canvasContext: lienzo.getContext('2d'), viewport: v }).promise.then(function () {
                return new Promise(function (ok) { lienzo.toBlob(function (b) { ok(b); }, 'image/jpeg', 0.9); });
              });
            }).then(function (b) {
              if (b && !ctl.cancelado) {
                var u = win.URL.createObjectURL(b); urls.push(u);
                fig.insertAdjacentHTML('afterbegin', '<img src="' + u + '" alt="Página ' + num1 + ' de ' + n + '">');
                fig.classList.add('vzp-pag-lista');
              }
            }, function () { fig.classList.add('vzp-pag-falla'); }).then(function () { ocupado = false; pinta1(); });
          };
          var figs = caja.querySelectorAll('.vzp-pag');
          if (win.IntersectionObserver) {
            var obs = new win.IntersectionObserver(function (es) {
              es.forEach(function (e) { if (e.isIntersecting) { obs.unobserve(e.target); cola.push(e.target); } });
              cola.sort(function (a, b) { return +a.getAttribute('data-n') - +b.getAttribute('data-n'); });
              pinta1();
            }, { root: h.caja, rootMargin: '600px 0px' });
            Array.prototype.forEach.call(figs, function (f) { obs.observe(f); });
            var viejo = h.alCerrar; h.alCerrar = function () { try { obs.disconnect(); } catch (e) { } viejo(); };
          } else { Array.prototype.forEach.call(figs, function (f) { cola.push(f); }); pinta1(); }
        });
      }).catch(function () {
        if (ctl.cancelado || pila.indexOf(h) < 0) return;
        pdfAparte(h, url, nombre);
      });
    }

    /* ── eventos ── */
    function eventos() {
      barra.addEventListener('click', function (e) { var b = e.target.closest && e.target.closest('.vzp-tab'); if (b) ir(b.getAttribute('data-pestana')); });
      barra.addEventListener('keydown', function (e) {
        var b = e.target.closest && e.target.closest('.vzp-tab'); if (!b) return;
        var ids = PESTANAS.map(function (p) { return p[0]; }), i = ids.indexOf(b.getAttribute('data-pestana')), j = -1;
        if (e.key === 'ArrowRight') j = (i + 1) % ids.length; else if (e.key === 'ArrowLeft') j = (i + ids.length - 1) % ids.length; else if (e.key === 'Home') j = 0; else if (e.key === 'End') j = ids.length - 1;
        if (j >= 0) { e.preventDefault(); ir(ids[j], true); }
      });
      ['historial', 'archivos', 'opciones'].forEach(function (k) {
        paneles[k].addEventListener('click', function (e) {
          var t = e.target, cerca = function (s) { return t.closest ? t.closest(s) : null; }, x;
          if ((x = cerca('[data-reintenta]'))) { asegura(k, true); return; }
          if ((x = cerca('.vzp-dia'))) { escogeDia(x.getAttribute('data-dia')); return; }
          if ((x = cerca('.vzp-vers-b[data-dia]'))) { escogeDia(x.getAttribute('data-dia'), true); return; }
          if ((x = cerca('.vzp-res'))) {
            var s = x.getAttribute('data-salta');
            if (s === 'pendientes') { var pe = doc.getElementById('vzpPendientes'); if (pe) baja(pe); return; }
            var e2 = cache.historial, ds = e2 && e2.r ? diasOrdenados(e2.r).filter(function (d) { return (d.items || []).some(function (it) { return it.tipo === s; }); }) : [];
            if (ds.length) escogeDia(ds[ds.length - 1].fecha, true);
            else if (s === 'version') { var ve = doc.getElementById('vzpVersiones'); if (ve) baja(ve); }   // versiones sin fecha: a su lista
            return;
          }
          if ((x = cerca('.vzp-mas'))) { var p = x.previousElementSibling, ab = x.getAttribute('aria-expanded') === 'true'; if (p) p.classList.toggle('vzp-corto', ab); x.setAttribute('aria-expanded', ab ? 'false' : 'true'); x.textContent = ab ? 'Ver más' : 'Ver menos'; return; }
          if ((x = cerca('[data-chat]'))) { abreChat(x.getAttribute('data-chat')); return; }
          if ((x = cerca('[data-archivo]'))) { abreArchivo({ id: x.getAttribute('data-archivo'), nombre: x.getAttribute('data-nombre'), tipo: x.getAttribute('data-tipo'), vista: x.getAttribute('data-vista') || '', tamano: x.hasAttribute('data-tamano') ? Number(x.getAttribute('data-tamano')) : null }); return; }
          if ((x = cerca('.vz-elige-op'))) { if (!/vz-buena/.test(x.className)) pagina.elige({ v: x.getAttribute('data-elige') || '', nombre: x.getAttribute('data-nombre') || '' }); return; }
          if ((x = cerca('.vzp-op'))) {
            var plan = x.getAttribute('data-plan'), v = Number(x.getAttribute('data-v')) || 0, vv = Number(x.getAttribute('data-version')) || 0, d = pagina.datos();
            if (!(d && d.menu && d.menu.plan === plan && vv === d.version)) pagina.escoge({ plan: plan, v: v });
            ir('plan');
          }
        });
      });
      paneles.historial.addEventListener('scroll', function (e) { if (e.target.classList && e.target.classList.contains('vzp-linea-pista')) bordes(e.target); }, true);
      /* en la línea de tiempo, las flechas recorren los días */
      paneles.historial.addEventListener('keydown', function (e) {
        var b = e.target.closest && e.target.closest('.vzp-dia'); if (!b || (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft')) return;
        var li = b.parentNode[e.key === 'ArrowRight' ? 'nextElementSibling' : 'previousElementSibling'], sig = li && li.querySelector('.vzp-dia');
        if (sig) { e.preventDefault(); sig.focus(); escogeDia(sig.getAttribute('data-dia')); }
      });
      /* las hojas: la ×, tocar fuera, bajarla con el dedo desde su encabezado, Esc y «atrás» */
      doc.addEventListener('click', function (e) {
        var h = hojaArriba(); if (!h) return;
        var t = e.target, cerca = function (s) { return t.closest ? t.closest(s) : null; }, x;
        if (t === h.capa || cerca('.vzp-x')) { h.cierra(); return; }
        if (!h.capa.contains(t)) return;
        if ((x = cerca('[data-reintenta]'))) { if (h.reintenta) h.reintenta(); return; }
        if ((x = cerca('.vzp-cap-b'))) { irCaptura(h, Number(x.getAttribute('data-cap')) || 0); return; }
        if ((x = cerca('[data-archivo]'))) { abreArchivo({ id: x.getAttribute('data-archivo'), nombre: x.getAttribute('data-nombre'), tipo: x.getAttribute('data-tipo'), vista: x.getAttribute('data-vista') || '', tamano: null }); }
      });
      /* (el touchstart que evita el «fling» al bajar una hoja va en el encabezado de cada hoja, en abreHoja: así la
         página no carga un escucha que frena el desplazamiento en cada toque) */
      doc.addEventListener('pointerdown', function (e) {
        var h = hojaArriba(); if (!h || !e.isPrimary || !e.target.closest) return;
        if (!e.target.closest('.vzp-hoja-cab') || e.target.closest('button, a') || !h.capa.contains(e.target)) return;
        gesto = { h: h, y0: e.clientY, t0: e.timeStamp, dy: 0 };
      });
      doc.addEventListener('pointermove', function (e) {
        if (!gesto || !e.isPrimary) return;
        gesto.dy = Math.max(0, e.clientY - gesto.y0);
        gesto.h.caja.style.transform = gesto.dy ? 'translateY(' + gesto.dy + 'px)' : '';
      });
      var suelta = function (e) {
        if (!gesto) return;
        var g = gesto; gesto = null;
        var vel = (e.clientY - g.y0) / Math.max(1, e.timeStamp - g.t0);
        if (g.dy > 90 || (g.dy > 24 && vel > 0.55)) g.h.cierra(false, true);
        else { g.h.caja.style.transition = 'transform .18s ease-out'; g.h.caja.style.transform = ''; setTimeout(function () { g.h.caja.style.transition = ''; }, 200); }
      };
      doc.addEventListener('pointerup', suelta);
      doc.addEventListener('pointercancel', function () { if (gesto) { gesto.h.caja.style.transform = ''; gesto = null; } });
      doc.addEventListener('keydown', function (e) {
        var h = hojaArriba(); if (!h) return;
        if (e.key === 'Escape') { e.stopPropagation(); h.cierra(); return; }
        if (e.key === 'Tab') {
          var f = Array.prototype.filter.call(h.caja.querySelectorAll('button, [href], [tabindex]:not([tabindex="-1"]), iframe'), function (x) { return !x.disabled && x.offsetParent !== null; });
          if (!f.length) { e.preventDefault(); h.caja.focus(); return; }
          var i = f.indexOf(doc.activeElement);
          if (e.shiftKey && i <= 0) { e.preventDefault(); f[f.length - 1].focus(); } else if (!e.shiftKey && (i < 0 || i === f.length - 1)) { e.preventDefault(); f[0].focus(); }
        }
      }, true);
      win.addEventListener('popstate', function () {
        if (atrasPendientes > 0) { atrasPendientes--; return; }
        var n = (win.history.state && win.history.state.vzp) || 0;
        while (pila.length > n) hojaArriba().cierra(true);
      });
      win.addEventListener('hashchange', function () {
        var t = pestanaDe(win.location.hash);
        if (t !== actual) ir(t);
      });
    }

    arma();
    /* ── lo que la página le avisa ── */
    return {
      pinta: function (d, primera) {
        if (apagado) return;
        arma();
        var plan = d && d.menu ? d.menu.plan : '';
        cabezas();
        pintaBarra();
        pintaElige();
        semillaOpciones(d);
        if (actual === 'opciones') { pintaOpciones(); cargaOpciones(); }
        if (plan !== ultimoPlan) {                 // otro terreno: su historial y sus archivos son otros
          if (ultimoPlan) { cache = { historial: null, archivos: null }; selDia = ''; }
          ultimoPlan = plan;
          if (actual === 'historial' || actual === 'archivos') asegura(actual, true);
        }
        if (primera) {
          /* en fondo, poco después de abrir el plan: así Historial y Archivos abren al instante. Uno tras otro: el
             historial ya deja en la caché del servidor la lista de carpetas que Archivos vuelve a necesitar. */
          setTimeout(function () {
            if (doc.hidden || apagado) return;
            var p = asegura('historial'), sigue = function () { setTimeout(function () { if (!doc.hidden && !apagado) asegura('archivos'); }, 400); };
            if (p && p.then) p.then(sigue, sigue); else sigue();
          }, 1200);
        }
      },
      apaga: function () {
        apagado = true;
        while (pila.length) hojaArriba().cierra(true);
        if (barra) barra.hidden = true;
        doc.documentElement.classList.remove('vzp-con-barra');
        ['historial', 'archivos', 'opciones'].forEach(function (k) { if (paneles[k]) paneles[k].hidden = true; });
        if (paneles.plan) paneles.plan.hidden = false;
      },
      ir: ir,
      actual: function () { return actual; }
    };
  }

  var api = {
    monta: monta, PESTANAS: PESTANAS, GRUPOS: GRUPOS, TIPOS: TIPOS, PDFJS: PDFJS,
    pestanaDe: pestanaDe, hashCon: hashCon, clase: clase, estadoHtml: estadoHtml, barraHtml: barraHtml,
    historialHtml: historialHtml, diaHtml: diaHtml, lineaHtml: lineaHtml, pendientesHtml: pendientesHtml, capturas: capturas, agrupa: agrupa, chatHtml: chatHtml,
    diasOrdenados: diasOrdenados, tipoSeguro: tipoSeguro,
    archivosHtml: archivosHtml, tipoArchivo: tipoArchivo, tamano: tamano, fechaLarga: fechaLarga, fechaCorta: fechaCorta,
    resumenOpcion: resumenOpcion, opcionesHtml: opcionesHtml, opcionesFijas: opcionesFijas, colorNombre: colorNombre, nombreGuardar: nombreGuardar
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.VisorPestanas = api;
})(typeof window !== 'undefined' ? window : globalThis);
