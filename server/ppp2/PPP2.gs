/**
 * PPP 2 · servidor.
 *
 * Apps Script APARTE, ligado a la hoja «PPP 2 · Vivero (registro)». No es el
 * Apps Script del Portero ni el de Potenciales: aquí sólo se leen y escriben
 * los libros de PPP 2. Se instala con server/ppp2/INSTALAR.md.
 *
 * Reglas (contrato del 30-sep-2026, ARQUITECTURA-SHEETS.md):
 *  - Los datos y las fórmulas viven en cada libro. Este servidor NO calcula
 *    nada financiero: escribe datos permitidos y lee lo que el libro calculó.
 *  - Cada llamada (salvo ppp2-meta) valida la sesión con el Portero (canje).
 *    El Portero original va primero; el respaldo sólo si aquel falla en esa
 *    misma llamada, y nunca se guarda como destino.
 *  - Toda escritura deja renglón en la Bitácora del libro: quién, qué, antes,
 *    después, fuente, revisión base y request_id.
 *  - Sólo Dirección (roles_aprobar) vuelve vigente una versión.
 *  - El plan es el autón: no hay un agente aparte. El plan (su libro, su página y estas
 *    herramientas) corre sus RONDAS: mueve capital y arranque de obra en una versión de
 *    trabajo (nunca la base ni la vigente, ni el trabajo de una persona si nadie se lo
 *    presta), el libro recalcula cada combinación y el plan propone sólo lo que pasa la
 *    revisión para fondos, según un criterio fijo y escrito. El siguiente paso lo calcula
 *    el libro (Resumen: plan.paso). `latido` (activador por tiempo) hace sola la ronda y
 *    las pruebas cuando toca; nunca aprueba ni vuelve vigente nada.
 */
var PPP2 = {
  SCHEMA: 'ppp2-servidor-v1',
  LIBRO: 'ppp2-libro-v1',
  TZ: 'America/Hermosillo',
  CANJE_S: 600,          // caché del canje: 10 minutos, igual que el Portero
  IDEM_S: 21600,         // idempotencia de request_id: 6 horas
  VIVERO_S: 60,          // caché del vivero
  TEXTO_MAX: 2000,
  MESES: 60
};

var ESTADOS = {
  dato: ['confirmado', 'supuesto', 'por confirmar', 'en conflicto', 'derivado', 'falta'],
  version: ['base', 'propuesta', 'vigente', 'alterna', 'descartada'],
  pregunta: ['abierta', 'respondida', 'no se sabe', 'investigando', 'en conflicto', 'no aplica'],
  candado: ['abierto', 'en revisión', 'cerrado', 'no aplica'],
  hallazgo: ['propuesto', 'aceptado', 'descartado']
};

/* Pruebas de estrés estándar: cambian una palanca de la columna Prueba,
   el libro recalcula y se lee el resultado. Nada se calcula aquí. */
var ESCENARIOS = [
  { id: 'precio-5', nombre: 'Precios 5% abajo', ops: [{ c: 'ajuste_precio', suma: -0.05 }] },
  { id: 'precio-10', nombre: 'Precios 10% abajo', ops: [{ c: 'ajuste_precio', suma: -0.10 }] },
  { id: 'obra+5', nombre: 'Obra 5% arriba', ops: [{ c: 'ajuste_obra', suma: 0.05 }] },
  { id: 'obra+10', nombre: 'Obra 10% arriba', ops: [{ c: 'ajuste_obra', suma: 0.10 }] },
  { id: 'lentas', nombre: 'Ventas 25% más lentas', ops: [{ c: 'ventas_meses', por: 1.25, redondea: true }] },
  { id: 'arranque7', nombre: 'Las ventas arrancan hasta el mes 7', ops: [{ c: 'ventas_inicio', fija: 7 }] },
  { id: 'tasa+3', nombre: 'Tasa del banco 3 puntos arriba', ops: [{ c: 'sobretasa', suma: 0.03 }] },
  { id: 'capital20', nombre: 'Capital al 20% en vez de su tasa', ops: [{ c: 'tasa_capital', fija: 0.20 }] },
  { id: 'escriturar+3', nombre: 'Tres meses más para escriturar', ops: [{ c: 'meses_saldos', suma: 3 }, { c: 'saldo_posterior', suma: 3 }] },
  { id: 'sin-pagos-obra', nombre: 'Sin pagos durante la obra', ops: [{ c: 'durante_obra_1', fija: 0 }, { c: 'durante_obra_2', fija: 0 }, { c: 'durante_obra_3', fija: 0 }, { c: 'durante_obra_4', fija: 0 }, { c: 'durante_obra_5', fija: 0 }, { c: 'durante_obra_6', fija: 0 }] },
  { id: 'combinado', nombre: 'Precios 5% abajo, obra 5% arriba y ventas 25% más lentas', ops: [{ c: 'ajuste_precio', suma: -0.05 }, { c: 'ajuste_obra', suma: 0.05 }, { c: 'ventas_meses', por: 1.25, redondea: true }] },
  { id: 'severo', nombre: 'Precios 10% abajo, obra 10% arriba y ventas 25% más lentas', ops: [{ c: 'ajuste_precio', suma: -0.10 }, { c: 'ajuste_obra', suma: 0.10 }, { c: 'ventas_meses', por: 1.25, redondea: true }] }
];

/* La ronda del plan: qué palancas mueve solo y cómo escoge. Todo lo calcula el libro. */
var RONDA = {
  CAPITAL_PASOS: [-2, -1, 0, 1, 2],          // pasos de capital alrededor de la versión de partida
  OBRA_PASOS: [-1, 0, 1],                    // meses de arranque de obra alrededor de la de partida
  GOLPES: ['precio-5', 'obra+5', 'lentas'],  // golpes leves, cada uno por separado: cuenta el que deja el mayor faltante
  MAX_MS: 200000,                            // presupuesto de tiempo por intento (Apps Script corta a los 6 minutos)
  COLS: 13,
  CAMPOS: ['nombre', 'estado', 'que_cambia', 'propuesta_por', 'aprobada_por', 'fecha_aprobacion'],
  FIRMA: /^El plan · ronda (\d+)$/,          // así firma el plan sus propuestas, exactamente
  AVANCE_MS: 6 * 3600000,                    // lo leído por un intento que no alcanzó a terminar vale, a lo más, seis horas
  LATIDO_MS: 2 * 3600000,                    // si el latido no ha corrido en dos horas, la página no promete nada «solo»
  INSISTE: 3,                                // veces que el latido repite un paso que no avanza antes de dejar de insistir
  TOLERANCIA: 0.01,                          // MDP: el mismo margen con que la revisión para fondos da por cero un faltante
  DETALLE_MAX: 45000                         // una celda de Sheets guarda hasta 50 000 caracteres
};
var PRUEBA_SANA = /^=[^(]+\(\$E(\d+):\$G(\d+)\b/;   // una celda sana de la columna Prueba, en cualquier idioma
var SISTEMA = { ok: true, sistema: true, nombre: 'El plan (servidor)', correo: '', rol: 'sistema', boards: '' };

/* ───────────────────────── utilidades ───────────────────────── */
function out_(o) {
  return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON);
}
function ahora_() { return Utilities.formatDate(new Date(), PPP2.TZ, 'yyyy-MM-dd HH:mm'); }
function hoyISO_() { return Utilities.formatDate(new Date(), PPP2.TZ, 'yyyy-MM-dd'); }
function low_(v) { return String(v == null ? '' : v).trim().toLowerCase(); }
function txt_(v, max) {
  var s = String(v == null ? '' : v).replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '').trim();
  return s.length > (max || PPP2.TEXTO_MAX) ? s.slice(0, max || PPP2.TEXTO_MAX) : s;
}
/* Un texto que empieza con = + - @ se guardaría como fórmula: se escribe como texto literal. */
function seguro_(v) {
  return typeof v === 'string' && /^[=+\-@]/.test(v) ? "'" + v : v;
}
function fila_(arr) { return arr.map(seguro_); }
function limpio_(v) {
  // Una fecha con hora conserva la hora: así se distinguen dos corridas de pruebas del mismo día.
  if (v instanceof Date) {
    var hm = Utilities.formatDate(v, PPP2.TZ, 'HH:mm');
    return Utilities.formatDate(v, PPP2.TZ, 'yyyy-MM-dd') + (hm !== '00:00' ? ' ' + hm : '');
  }
  if (typeof v === 'string' && /^#(N\/A|REF!|VALUE!|DIV\/0!|NUM!|NAME\?|NULL!|ERROR!)/.test(v)) return null;
  if (typeof v === 'number' && !isFinite(v)) return null;
  return v;
}
function vivero_() { return SpreadsheetApp.getActiveSpreadsheet(); }
function config_() {
  var cache = CacheService.getScriptCache(), hit = cache.get('cfg');
  if (hit) return JSON.parse(hit);
  var vals = vivero_().getSheetByName('Config').getDataRange().getValues(), c = {};
  for (var i = 1; i < vals.length; i++) if (vals[i][0]) c[String(vals[i][0]).trim()] = String(vals[i][1] == null ? '' : vals[i][1]).trim();
  cache.put('cfg', JSON.stringify(c), 120);
  return c;
}
function lista_(s) { return String(s || '').toLowerCase().split(/[,;| ]+/).filter(function (x) { return x; }); }
function hash_(k) {
  return Utilities.base64EncodeWebSafe(Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, k)).slice(0, 24);
}

/* ───────────────────────── sesión (Portero) ───────────────────────── */
function canje_(k) {
  k = String(k || '').trim();
  if (k.length < 8 || k.length > 200) return { ok: false, error: 'sin_sesion' };
  var cache = CacheService.getScriptCache(), ck = 'c_' + hash_(k), hit = cache.get(ck);
  if (hit) return JSON.parse(hit);
  var cfg = config_(), board = cfg.board || 'PT', j = null;
  var urls = [cfg.portero_original, cfg.portero_respaldo].filter(function (u) { return /^https:\/\/script\.google\.com\/macros\/s\/[A-Za-z0-9_-]+\/exec$/.test(u || ''); });
  for (var i = 0; i < urls.length && !j; i++) {
    try {
      var r = UrlFetchApp.fetch(urls[i] + '?recurso=canje&t=' + encodeURIComponent(k) + '&board=' + encodeURIComponent(board), { muteHttpExceptions: true, followRedirects: true });
      if (r.getResponseCode() >= 500) continue;            // el original falló: probar el respaldo en esta misma llamada
      j = JSON.parse(r.getContentText());
    } catch (e) { j = null; }
  }
  var s;
  if (!j) s = { ok: false, error: 'portero' };
  else if (!j.ok) s = { ok: false, error: String(j.error || 'liga') };
  else {
    var boards = Array.isArray(j.boards) ? j.boards.join(',') : String(j.boards || '');
    var lb = boards.toUpperCase().split(/[,;| ]+/);
    var rol = low_(j.rol);
    if (rol !== 'admin' && lb.indexOf('*') < 0 && lb.indexOf(board.toUpperCase()) < 0) s = { ok: false, error: 'board' };
    else s = { ok: true, correo: low_(j.correo), nombre: txt_(j.nombre || j.correo, 120), rol: rol, boards: boards };
  }
  if (s.ok) cache.put(ck, JSON.stringify(s), PPP2.CANJE_S);
  else if (s.error !== 'portero') cache.put(ck, JSON.stringify(s), 60);
  return s;
}
function puede_(s, que) {
  if (s && s.sistema === true) return que === 'leer' || que === 'editar';   // el latido nunca aprueba
  var cfg = config_();
  if (que === 'leer') return !!(s && s.ok);
  if (que === 'aprobar') return lista_(cfg.roles_aprobar || 'admin').indexOf(s.rol) >= 0;
  if (que === 'editar') return lista_(cfg.roles_editar || 'admin,editor').indexOf(s.rol) >= 0;
  return false;
}
function actor_(s) { return s.nombre || s.correo || 'usuario'; }

/* ───────────────────────── registro y libros ───────────────────────── */
function planes_() {
  var vals = vivero_().getSheetByName('Planes').getDataRange().getValues(), cab = vals[0], out = [];
  for (var i = 1; i < vals.length; i++) {
    var o = { _fila: i + 1 };
    for (var j = 0; j < cab.length; j++) o[String(cab[j]).trim()] = limpio_(vals[i][j]);
    if (o.plan_id) out.push(o);
  }
  return out;
}
function planPorId_(id) {
  id = String(id || '').trim();
  if (!/^p2[a-z0-9]{6,20}$/.test(id)) return null;
  var p = planes_().filter(function (x) { return x.plan_id === id; })[0];
  return p && low_(p.estado) !== 'archivado' ? p : null;
}
function libro_(plan) { return SpreadsheetApp.openById(plan.libro_id); }
function filaPorClave_(hoja, clave, col) {
  var col0 = col || 1, ultima = hoja.getLastRow();
  if (ultima < 1) return 0;
  var vals = hoja.getRange(1, col0, ultima, 1).getValues();
  for (var i = 0; i < vals.length; i++) if (String(vals[i][0]).trim() === clave) return i + 1;
  return 0;
}
function resumen_(libro) {
  var h = libro.getSheetByName('Resumen'), n = h.getLastRow(), o = {};
  if (n < 4) return o;
  var vals = h.getRange(4, 1, n - 3, 2).getValues();
  vals.forEach(function (r) { if (r[0]) o[String(r[0]).trim()] = limpio_(r[1]); });
  return o;
}
function tabla_(libro, nombre, fila0, ncols) {
  var h = libro.getSheetByName(nombre);
  if (!h) return [];
  var n = h.getLastRow() - fila0 + 1;
  if (n < 1) return [];
  var hay = Math.min(ncols, h.getMaxColumns());
  return h.getRange(fila0, 1, n, hay).getValues().map(function (r) { r = r.map(limpio_); while (r.length < ncols) r.push(''); return r; })
    .filter(function (r) { return r.some(function (v) { return v !== '' && v !== null; }); });
}
function columnas_(h, n) { if (h.getMaxColumns() < n) h.insertColumnsAfter(h.getMaxColumns(), n - h.getMaxColumns()); }
/* getRange no agranda la hoja: escribir debajo del último renglón de la cuadrícula truena. appendRow sí la agranda. */
function renglones_(h, n) { if (h.getMaxRows() < n) h.insertRowsAfter(h.getMaxRows(), n - h.getMaxRows()); }
function revision_(libro) {
  var h = libro.getSheetByName('Bitácora');
  return Math.max(0, h.getLastRow() - 4);
}
function bitacora_(libro, s, accion, pestana, clave, antes, despues, fuente, revBase, requestId) {
  libro.getSheetByName('Bitácora').appendRow(fila_([ahora_(), actor_(s), txt_(accion, 300), pestana, txt_(clave, 120),
    txt_(antes, 300), txt_(despues, 300), txt_(fuente, 500), revBase == null ? '' : revBase, txt_(requestId, 80)]));
}
function bitacoraVivero_(s, accion, planId, detalle, requestId, resultado) {
  vivero_().getSheetByName('Bitácora').appendRow(fila_([ahora_(), s ? actor_(s) : 'sistema', accion, planId || '', txt_(detalle, 500), txt_(requestId, 80), resultado || 'ok', '']));
}

/* ───────────────────────── lectura ───────────────────────── */
function tarjeta_(p) {
  var r = {};
  try { r = resumen_(libro_(p)); } catch (e) { return { plan_id: p.plan_id, nombre: p.nombre, error: 'libro' }; }
  var v = Number(r['plan.version_mostrada']) || 1, pre = 'v' + v + '.';
  // Si una ronda está escribiendo (o se quedó a medias) en la versión que se muestra, sus cifras son de una
  // combinación de prueba: no se enseñan como «lo que recibe el dueño».
  var medias = false;
  try { var dj = JSON.parse(PropertiesService.getScriptProperties().getProperty(diarioClave_(p.plan_id)) || 'null'); medias = !!dj && Number(dj.ks) === v; } catch (e) { medias = false; }
  var cifra = function (clave) { return medias ? null : r[pre + clave]; };
  return {
    plan_id: p.plan_id, nombre: r['plan.nombre'] || p.nombre, ubicacion: r['plan.ubicacion'] || '',
    edad: r['plan.edad'] || '', para_crecer: r['plan.para_crecer'] || '', a_medias: medias,
    version: v, version_nombre: r[pre + 'nombre'] || '', version_estado: r[pre + 'estado'] || '',
    dueno_aporta: r[pre + 'dueno_aporta'], dueno_recibe: cifra('dueno_recibe'), dueno_veces: cifra('dueno_veces'),
    dueno_meses: cifra('dueno_meses'), ganancia: cifra('ganancia'), revision: medias ? '' : (r[pre + 'rv_resultado'] || ''),
    candados_abiertos: r['plan.candados_abiertos'], preguntas_abiertas: r['plan.preguntas_abiertas'],
    siguiente_pregunta: r['plan.siguiente_pregunta'] || '', creado: p.creado || '',
    paso: r['plan.paso'] || '', paso_texto: r['plan.paso_texto'] || ''
  };
}
function vivero_get_(s) {
  var cache = CacheService.getScriptCache(), hit = cache.get('vivero');
  var tarjetas = hit ? JSON.parse(hit) : null;
  if (!tarjetas) {
    tarjetas = planes_().filter(function (p) { return low_(p.estado) !== 'archivado'; }).map(tarjeta_);
    cache.put('vivero', JSON.stringify(tarjetas), PPP2.VIVERO_S);
  }
  return { ok: true, planes: tarjetas, puede: { editar: puede_(s, 'editar'), aprobar: puede_(s, 'aprobar') }, yo: { nombre: s.nombre, rol: s.rol } };
}
function plan_get_(s, id) {
  var p = planPorId_(id);
  if (!p) return { ok: false, error: 'plan' };
  var libro = libro_(p), r = resumen_(libro);
  var datos = tabla_(libro, 'Datos', 5, 11).filter(function (f) { return /^[a-z]+\.[a-z0-9_]+$/.test(String(f[0])); }).map(function (f) {
    return { clave: f[0], concepto: f[1], valor: f[2], unidad: f[3], estado: f[4], fuente: f[5], fecha: f[6], quien: f[7], pregunta: f[8], nota: f[9], requerido: f[10] === 'sí' };
  });
  var productos = libro.getSheetByName('Productos').getRange(5, 1, 6, 9).getValues().map(function (f, i) {
    f = f.map(limpio_);
    return { fila: i + 1, nombre: f[0], unidades: f[1], m2: f[2], precio_m2: f[3], ventas: f[4], precio_unidad: f[5], durante_obra: f[6], estado: f[7], fuente: f[8] };
  });
  var palancas = tabla_(libro, 'Modelo', 7, 12).filter(function (f) { return /^[a-z][a-z0-9_]*$/.test(String(f[0])); }).map(function (f) {
    return { clave: f[0], concepto: f[1], unidad: f[2], base: f[3], v: [f[4], f[5], f[6]], cambia: [f[9] === 'cambia', f[10] === 'cambia', f[11] === 'cambia'], calculado: f[3] === '' || f[3] === null };
  });
  var versiones = [1, 2, 3].map(function (k) {
    var o = { numero: k }, pre = 'v' + k + '.';
    Object.keys(r).forEach(function (key) { if (key.indexOf(pre) === 0) o[key.slice(pre.length)] = r[key]; });
    return o;
  });
  var rep = libro.getSheetByName('Reparto');
  var repParams = rep.getRange(8, 1, 8, 6).getValues().map(function (f) { return f.map(limpio_); });
  var repRes = rep.getRange(18, 1, 13, 6).getValues().map(function (f) { return f.map(limpio_); });
  var candados = tabla_(libro, 'Candados', 5, 9).map(function (f) {
    return { id: f[0], candado: f[1], cierra: f[2], estado: f[3], evidencia: f[4], responsable: f[5], fecha: f[6], detiene: f[7], nota: f[8] };
  });
  var preguntas = tabla_(libro, 'Preguntas', 5, 14).map(function (f) {
    return { id: f[0], modulo: f[1], texto: f[2], nivel: f[3], edad: f[4], mueve: f[5], estado: f[6], respuesta: f[7], fuente: f[8], responsable: f[9], fecha: f[10], impacto: f[11], prioridad: f[12], siguiente: f[13] === 'siguiente' };
  });
  var hallazgos = tabla_(libro, 'Hallazgos', 5, 9).map(function (f, i) {
    return { fila: i + 1, fecha: f[0], tema: f[1], hallazgo: f[2], fuente: f[3], confianza: f[4], mueve: f[5], estado: f[6], quien: f[7], nota: f[8] };
  });
  var consejo = tabla_(libro, 'Consejo', 5, 9).map(function (f) {
    return { fecha: f[0], sesion: f[1], version: f[2], juez: f[3], voto: f[4], razon: f[5], condicion: f[6], huella: f[7], evidencia: f[8] };
  });
  var pruebas = tabla_(libro, 'Pruebas', 14, 11).map(function (f) {
    return { escenario: f[0], cambia: f[1], banco_max: f[2], respaldo: f[3], costo_dinero: f[4], ganancia: f[5], mes_reparto: f[6], version: f[7], fecha: f[8], quien: f[9], huella: f[10] };
  });
  var rondasCrudas = tabla_(libro, 'Rondas', 5, RONDA.COLS);
  var rondas = rondasCrudas.map(function (f) {
    var det = null;
    try { det = f[11] ? JSON.parse(f[11]) : null; } catch (e) { det = null; }
    return { n: f[0], fecha: f[1], quien: f[2], parte_de: f[3], huella_partida: f[4], motivo: f[5], resultado: f[6], version: f[7], huella: f[8], que_cambia: f[9], probadas: f[10], detalle: det };
  });
  // un diario reciente es una ronda corriendo ahora mismo; uno viejo, una ronda que murió a medias.
  // En los dos casos las cifras de la versión de trabajo están a medias: la página lo avisa y no deja aprobarla.
  var crudo = PropertiesService.getScriptProperties().getProperty(diarioClave_(p.plan_id)), diario = '', trabajo = 0;
  if (crudo) {
    try { var dj = JSON.parse(crudo); diario = Date.now() - (dj.t || 0) < 420000 ? 'en curso' : 'interrumpida'; trabajo = Number(dj.ks) || 0; }
    catch (e) { diario = 'interrumpida'; }
  }
  var fi = fichas_(r), defiende = Number(r['plan.defiende']) || 0;
  var mod = libro.getSheetByName('Modelo');
  var lugar = defiende ? lugarRonda_(fi.estados, delPlan_(libro, fi, mod, palancasFilas_(mod), rondasCrudas), defiende, 0, false) : { ks: 0, modo: '', presta: [] };
  var cfg = config_();
  var ciclo = {
    paso: r['plan.paso'] || '', paso_texto: r['plan.paso_texto'] || '', defiende: defiende, huella: r['plan.huella'] || '',
    vigente: Number(r['plan.vigente']) || 0, probada: r['plan.probada'] === true,
    sesion: r['plan.consejo_sesion'] || '', aprueban: Number(r['plan.consejo_aprueban']) || 0,
    vetos: Number(r['plan.consejo_vetos']) || 0, votaron: Number(r['plan.consejo_votaron']) || 0, aprobada: r['plan.consejo_aprobada'] === true,
    sin_leer: Number(r['plan.consejo_sin_leer']) || 0, sin_mejora: r['plan.sin_mejora'] === true,
    evidencia: r['plan.evidencia'] || '', evidencia_sesion: r['plan.evidencia_sesion'] || '', paso_capital: num_(r['plan.paso_capital']),
    en_ronda: diario === 'en curso', interrumpida: diario === 'interrumpida', trabajo: trabajo,
    lugar: { version: lugar.ks, modo: lugar.modo, presta: lugar.presta.map(function (k) { return { version: k, nombre: fi.nombres[k - 1], estado: fi.estados[k - 1] }; }) },
    latido: latidoEstado_(cfg),                    // 'activo' (corrió hace poco), 'apagado' (pausa o latido = no) o 'sin latido' (nadie lo instaló)
    pausa: pausa_(cfg),
    revision: txt_(cfg.revision, 200),             // cuándo se reúne el consejo (lo dice Config; vacío si nadie lo programó)
    golpes: ESCENARIOS.filter(function (e) { return RONDA.GOLPES.indexOf(e.id) >= 0; }).map(function (e) { return { id: e.id, nombre: e.nombre }; })
  };
  var hb = libro.getSheetByName('Bitácora'), ub = hb.getLastRow(), desde = Math.max(5, ub - 39);
  var bit = (ub >= 5 ? hb.getRange(desde, 1, ub - desde + 1, 10).getValues() : []).map(function (f) { return f.map(limpio_); }).reverse().map(function (f) {
    return { fecha: f[0], actor: f[1], accion: f[2], pestana: f[3], clave: f[4], antes: f[5], despues: f[6], fuente: f[7] };
  });
  var series = {};
  [1, 2, 3].forEach(function (vn) {
    var fl = libro.getSheetByName('Flujo V' + vn), serie = {};
    if (!fl) return;
    var filas = { mes: 3, cobranza: 16, egresos: 25, banco: 41, capital: 42, respaldo: 43, caja: 45, ajeno: 57 };
    var bloque = fl.getRange(3, 3, 55, PPP2.MESES).getValues();
    Object.keys(filas).forEach(function (k) { serie[k] = bloque[filas[k] - 3].map(function (v) { v = limpio_(v); return typeof v === 'number' ? Math.round(v * 1000) / 1000 : 0; }); });
    series[vn] = serie;
  });
  return {
    ok: true, plan_id: p.plan_id, rev: revision_(libro), resumen: r, datos: datos, productos: productos, palancas: palancas,
    versiones: versiones, reparto: { parametros: repParams, resultados: repRes, version: limpio_(rep.getRange('B4').getValue()), esquema: limpio_(rep.getRange('B5').getValue()) },
    candados: candados, preguntas: preguntas, hallazgos: hallazgos, consejo: consejo, pruebas: pruebas, rondas: rondas, ciclo: ciclo, bitacora: bit, series: series,
    libro_url: puede_(s, 'aprobar') ? 'https://docs.google.com/spreadsheets/d/' + p.libro_id + '/edit' : '',
    puede: { editar: puede_(s, 'editar'), aprobar: puede_(s, 'aprobar') }, yo: { nombre: s.nombre, rol: s.rol },
    escenarios: ESCENARIOS.map(function (e) { return { id: e.id, nombre: e.nombre }; })
  };
}

/* ───────────────────────── entradas ───────────────────────── */
function doGet(e) {
  var p = (e && e.parameter) || {};
  try {
    var r = String(p.recurso || '');
    if (r === 'ppp2-meta') return out_({ ok: true, pong: true, servicio: 'ppp2', schema: PPP2.SCHEMA });
    var s = canje_(p.k);
    if (!s.ok) return out_({ ok: false, error: s.error });
    if (r === 'ppp2-vivero') return out_(vivero_get_(s));
    if (r === 'ppp2-plan') return out_(plan_get_(s, p.plan));
    return out_({ ok: false, error: 'recurso' });
  } catch (err) {
    return out_({ ok: false, error: 'interno', detalle: String(err && err.message || err).slice(0, 200) });
  }
}

function doPost(e) {
  var b;
  try { b = JSON.parse((e && e.postData && e.postData.contents) || '{}'); } catch (x) { return out_({ ok: false, error: 'json' }); }
  try {
    var s = canje_(b.k);
    if (!s.ok) return out_({ ok: false, error: s.error });
    var rid = txt_(b.request_id, 80), cache = CacheService.getScriptCache();
    if (rid) { var prev = cache.get('r_' + hash_(rid)); if (prev) return out_(JSON.parse(prev)); }
    if (pausa_(config_())) return out_({ ok: false, error: 'pausa' });
    var lock = LockService.getScriptLock();
    // una ronda o unas pruebas tardan minutos: si el plan está en eso, se dice, en vez de «intenta en unos segundos»
    if (!lock.tryLock(25000)) return out_({ ok: false, error: cache.get('trabajando') ? 'trabajando' : 'ocupado' });
    var res;
    try { res = accion_(s, b, rid); } finally { lock.releaseLock(); }
    if (rid && res && res.ok) cache.put('r_' + hash_(rid), JSON.stringify(res), PPP2.IDEM_S);
    if (res && res.ok) cache.remove('vivero');
    return out_(res);
  } catch (err) {
    return out_({ ok: false, error: 'interno', detalle: String(err && err.message || err).slice(0, 200) });
  }
}

function accion_(s, b, rid) {
  var tipo = String(b.tipo || '');
  if (tipo === 'ppp2-sembrar') return sembrar_(s, b, rid);
  var p = planPorId_(b.plan);
  if (!p) return { ok: false, error: 'plan' };
  var libro = libro_(p), rev = revision_(libro);
  if (b.rev != null && Number(b.rev) !== rev) return { ok: false, error: 'revision', rev: rev };
  // Si una ronda quedó a medias, primero se deja la versión como estaba… y no se sigue: quien llamó estaba
  // viendo cifras a medias, así que la página recarga y decide con las de verdad.
  if (recuperar_(p, libro)) return { ok: false, error: 'revision', recuperado: true, rev: revision_(libro) };
  var hechos;
  switch (tipo) {
    case 'ppp2-ronda': hechos = ronda_(s, p, libro, b, rev, rid); break;
    case 'ppp2-dato': hechos = dato_(s, libro, b, rev, rid); break;
    case 'ppp2-producto': hechos = producto_(s, libro, b, rev, rid); break;
    case 'ppp2-palanca': hechos = palanca_(s, libro, b, rev, rid); break;
    case 'ppp2-version': hechos = version_(s, libro, b, rev, rid); break;
    case 'ppp2-responder': hechos = responder_(s, libro, b, rev, rid); break;
    case 'ppp2-investigar': hechos = investigar_(s, p, libro, b, rev, rid); break;
    case 'ppp2-hallazgo': hechos = hallazgo_(s, libro, b, rev, rid); break;
    case 'ppp2-candado': hechos = candado_(s, libro, b, rev, rid); break;
    case 'ppp2-reparto': hechos = reparto_(s, libro, b, rev, rid); break;
    case 'ppp2-estres': hechos = estres_(s, libro, b, rev, rid); break;
    default: return { ok: false, error: 'tipo' };
  }
  if (!hechos.ok) return hechos;
  SpreadsheetApp.flush();
  // algo cambió: el latido vuelve a mirar este plan, y lo que una ronda a medias llevaba leído ya no sirve
  var props = PropertiesService.getScriptProperties();
  props.deleteProperty(esperaClave_(p.plan_id));
  props.deleteProperty(avanceClave_(p.plan_id));
  hechos.rev = revision_(libro);
  hechos.resumen = resumen_(libro);
  return hechos;
}

/* ───────────────────────── escrituras ───────────────────────── */
var UNIDADES_NUM = { 'MDP': 1, '%': 1, 'm²': 1, 'meses': 1, 'mes': 1, '1/0': 1, 'unidades': 1 };

function numero_(v, unidad) {
  if (v === '' || v === null || v === undefined) return '';
  var n = typeof v === 'number' ? v : Number(String(v).replace(/[^0-9.\-]/g, ''));
  if (!isFinite(n)) return null;
  if (unidad === '%' && (n < -1 || n > 5)) return null;
  if (unidad === '1/0' && n !== 0 && n !== 1) return null;
  if ((unidad === 'mes' || unidad === 'meses') && (n < 0 || n > PPP2.MESES || Math.round(n) !== n)) return null;
  if (unidad === 'MDP' && Math.abs(n) > 1e6) return null;
  return n;
}

function dato_(s, libro, b, rev, rid) {
  if (!puede_(s, 'editar')) return { ok: false, error: 'permiso' };
  var h = libro.getSheetByName('Datos'), clave = txt_(b.clave, 60), fila = filaPorClave_(h, clave);
  if (!fila || !/^[a-z]+\.[a-z0-9_]+$/.test(clave)) return { ok: false, error: 'clave' };
  var unidad = String(h.getRange(fila, 4).getValue());
  var antes = h.getRange(fila, 3, 1, 6).getValues()[0];
  var valor = UNIDADES_NUM[unidad] ? numero_(b.valor, unidad) : txt_(b.valor, 500);
  if (valor === null) return { ok: false, error: 'valor' };
  var estado = b.estado != null ? low_(b.estado) : String(antes[2] || '');
  if (estado && ESTADOS.dato.indexOf(estado) < 0) return { ok: false, error: 'estado' };
  var fuente = b.fuente != null ? txt_(b.fuente, 500) : String(antes[3] || '');
  if (b.valor !== undefined) h.getRange(fila, 3).setValue(seguro_(valor));
  h.getRange(fila, 5, 1, 4).setValues([fila_([estado, fuente, hoyISO_(), actor_(s)])]);
  bitacora_(libro, s, 'Cambió un dato', 'Datos', clave, antes[0] + ' · ' + antes[2], (b.valor !== undefined ? valor : antes[0]) + ' · ' + estado, fuente, rev, rid);
  return { ok: true, hecho: 'dato', clave: clave };
}

function producto_(s, libro, b, rev, rid) {
  if (!puede_(s, 'editar')) return { ok: false, error: 'permiso' };
  var i = Number(b.fila);
  if (!(i >= 1 && i <= 6 && Math.round(i) === i)) return { ok: false, error: 'fila' };
  var h = libro.getSheetByName('Productos'), r = 4 + i, c = b.campos || {};
  var antes = h.getRange(r, 1, 1, 9).getValues()[0];
  var mapa = { nombre: [1, 'txt'], unidades: [2, 'unidades'], m2: [3, 'm²'], precio_m2: [4, 'num'], durante_obra: [7, '%'], estado: [8, 'estado'], fuente: [9, 'txt'] };
  var cambios = [];
  for (var k in c) {
    if (!mapa[k]) return { ok: false, error: 'campo' };
    var col = mapa[k][0], tipo = mapa[k][1], v;
    if (tipo === 'txt') v = txt_(c[k], k === 'nombre' ? 80 : 500);
    else if (tipo === 'estado') { v = low_(c[k]); if (v && ESTADOS.dato.indexOf(v) < 0) return { ok: false, error: 'estado' }; }
    else { v = numero_(c[k], tipo === 'num' ? 'MDP-libre' : tipo); if (v === null || (typeof v === 'number' && v < 0)) return { ok: false, error: 'valor' }; }
    cambios.push([col, v]);
  }
  cambios.forEach(function (x) { h.getRange(r, x[0]).setValue(seguro_(x[1])); });
  bitacora_(libro, s, 'Cambió el producto ' + i, 'Productos', Object.keys(c).join(','), antes.slice(0, 4).join(' · '), JSON.stringify(c).slice(0, 280), '', rev, rid);
  return { ok: true, hecho: 'producto', fila: i };
}

function versionEstado_(libro, k) {
  var h = libro.getSheetByName('Versiones'), f = filaPorClave_(h, 'estado');
  return low_(h.getRange(f, 2 + k).getValue());
}

function palanca_(s, libro, b, rev, rid) {
  if (!puede_(s, 'editar')) return { ok: false, error: 'permiso' };
  var k = Number(b.version);
  if (!(k >= 1 && k <= 3)) return { ok: false, error: 'version' };
  if (versionEstado_(libro, k) === 'vigente' && !puede_(s, 'aprobar')) return { ok: false, error: 'vigente' };
  var h = libro.getSheetByName('Modelo'), clave = txt_(b.clave, 40), fila = filaPorClave_(h, clave);
  if (!fila || !/^[a-z][a-z0-9_]*$/.test(clave)) return { ok: false, error: 'clave' };
  var base = h.getRange(fila, 4).getFormula() || h.getRange(fila, 4).getValue();
  if (base === '' || base === null) return { ok: false, error: 'calculado' };   // los renglones calculados no se tocan
  var col = 4 + k, celda = h.getRange(fila, col), unidad = String(h.getRange(fila, 3).getValue());
  var antes = celda.getFormula() || celda.getValue();
  if (b.valor === null || b.valor === 'base') celda.setFormula('=$D' + fila);
  else {
    var v = numero_(b.valor, unidad);
    if (v === null || v === '') return { ok: false, error: 'valor' };
    celda.setValue(v);
  }
  bitacora_(libro, s, 'Cambió una palanca de V' + k, 'Modelo', clave, antes, b.valor === null || b.valor === 'base' ? '(base)' : b.valor, txt_(b.razon, 300), rev, rid);
  return { ok: true, hecho: 'palanca', clave: clave, version: k };
}

function version_(s, libro, b, rev, rid) {
  var k = Number(b.version);
  if (!(k >= 1 && k <= 3)) return { ok: false, error: 'version' };
  if (!puede_(s, 'editar') && !puede_(s, 'aprobar')) return { ok: false, error: 'permiso' };
  var h = libro.getSheetByName('Versiones'), c = b.campos || {}, col = 2 + k, notas = [];
  if (c.estado != null) {
    var est = low_(c.estado);
    if (ESTADOS.version.indexOf(est) < 0) return { ok: false, error: 'estado' };
    if (est === 'vigente' && !puede_(s, 'aprobar')) return { ok: false, error: 'permiso' };
    var fEst = filaPorClave_(h, 'estado'), antesEst = low_(h.getRange(fEst, col).getValue());
    if (antesEst === 'vigente' && est !== 'vigente' && !puede_(s, 'aprobar')) return { ok: false, error: 'permiso' };
    if (est === 'vigente') {
      for (var j = 1; j <= 3; j++) if (j !== k && low_(h.getRange(fEst, 2 + j).getValue()) === 'vigente') { h.getRange(fEst, 2 + j).setValue('alterna'); notas.push('V' + j + ' pasa a alterna'); }
      h.getRange(filaPorClave_(h, 'aprobada_por'), col).setValue(seguro_(actor_(s)));
      h.getRange(filaPorClave_(h, 'fecha_aprobacion'), col).setValue(hoyISO_());
    }
    h.getRange(fEst, col).setValue(est);
    bitacora_(libro, s, est === 'vigente' ? 'Aprobó V' + k + ' como vigente' : 'Cambió el estado de V' + k, 'Versiones', 'estado', antesEst, est + (notas.length ? ' (' + notas.join(', ') + ')' : ''), txt_(b.razon, 300), rev, rid);
  }
  ['nombre', 'que_cambia', 'propuesta_por'].forEach(function (campo) {
    if (c[campo] == null) return;
    var f = filaPorClave_(h, campo), antes = h.getRange(f, col).getValue();
    h.getRange(f, col).setValue(seguro_(txt_(c[campo], campo === 'nombre' ? 80 : 800)));
    bitacora_(libro, s, 'Cambió ' + campo + ' de V' + k, 'Versiones', campo, antes, c[campo], '', rev, rid);
  });
  return { ok: true, hecho: 'version', version: k };
}

function responder_(s, libro, b, rev, rid) {
  if (!puede_(s, 'editar')) return { ok: false, error: 'permiso' };
  var h = libro.getSheetByName('Preguntas'), id = txt_(b.pregunta, 20), fila = filaPorClave_(h, id);
  if (!fila || !/^M\d{2}\.Q\d{2}$/.test(id)) return { ok: false, error: 'pregunta' };
  var est = low_(b.estado || 'respondida');
  if (ESTADOS.pregunta.indexOf(est) < 0) return { ok: false, error: 'estado' };
  var antes = h.getRange(fila, 7, 1, 2).getValues()[0];
  var resp = b.respuesta != null ? txt_(b.respuesta, 1500) : String(antes[1] || '');
  if (est === 'respondida' && !resp) return { ok: false, error: 'respuesta' };
  h.getRange(fila, 7, 1, 5).setValues([fila_([est, resp, b.fuente != null ? txt_(b.fuente, 500) : h.getRange(fila, 9).getValue(), actor_(s), hoyISO_()])]);
  bitacora_(libro, s, est === 'no se sabe' ? 'Marcó «no se sabe»' : 'Respondió una pregunta', 'Preguntas', id, antes[0], est + (resp ? ': ' + resp : ''), b.fuente || '', rev, rid);
  return { ok: true, hecho: 'pregunta', pregunta: id };
}

function investigar_(s, p, libro, b, rev, rid) {
  if (!puede_(s, 'editar')) return { ok: false, error: 'permiso' };
  var tema = txt_(b.tema || b.pregunta || '', 200), detalle = txt_(b.detalle, 1000);
  if (!tema) return { ok: false, error: 'tema' };
  var id = txt_(b.pregunta, 20);
  if (/^M\d{2}\.Q\d{2}$/.test(id)) {
    var h = libro.getSheetByName('Preguntas'), fila = filaPorClave_(h, id);
    if (fila) h.getRange(fila, 7).setValue('investigando');
  }
  var ped = vivero_().getSheetByName('Pedidos');
  if (!ped) { ped = vivero_().insertSheet('Pedidos'); ped.appendRow(['fecha', 'plan_id', 'plan', 'pregunta', 'tema', 'detalle', 'pedido_por', 'estado', 'resultado', 'request_id']); }
  ped.appendRow(fila_([ahora_(), p.plan_id, p.nombre, id, tema, detalle, actor_(s), 'pendiente', '', rid]));
  bitacora_(libro, s, 'Pidió al plan que investigue', 'Preguntas', id || tema, '', 'investigando', detalle, rev, rid);
  var cuando = txt_(config_().revision, 200);
  return { ok: true, hecho: 'pedido', nota: cuando ? 'Quedó pedido. Lo investigo en mi siguiente revisión (' + cuando + ') y dejo lo que encuentre en «Lo que encontré».'
    : 'Quedó pedido. Todavía no tengo una revisión programada: lo investigo cuando alguien hable conmigo en un chat con Claude.' };
}

function hallazgo_(s, libro, b, rev, rid) {
  if (!puede_(s, 'editar')) return { ok: false, error: 'permiso' };
  var i = Number(b.fila), est = low_(b.estado);
  if (!(i >= 1 && Math.round(i) === i) || ESTADOS.hallazgo.indexOf(est) < 0) return { ok: false, error: 'valor' };
  var h = libro.getSheetByName('Hallazgos'), r = 4 + i;
  if (r > h.getLastRow()) return { ok: false, error: 'fila' };
  var antes = h.getRange(r, 7).getValue();
  h.getRange(r, 7).setValue(est);
  bitacora_(libro, s, 'Marcó un hallazgo como ' + est, 'Hallazgos', 'fila ' + i, antes, est, txt_(b.razon, 300), rev, rid);
  return { ok: true, hecho: 'hallazgo', fila: i };
}

function candado_(s, libro, b, rev, rid) {
  if (!puede_(s, 'editar')) return { ok: false, error: 'permiso' };
  var h = libro.getSheetByName('Candados'), id = txt_(b.id, 30), fila = filaPorClave_(h, id);
  if (!fila || fila < 5) return { ok: false, error: 'candado' };
  var est = low_(b.estado);
  if (ESTADOS.candado.indexOf(est) < 0) return { ok: false, error: 'estado' };
  var evidencia = b.evidencia != null ? txt_(b.evidencia, 800) : String(h.getRange(fila, 5).getValue() || '');
  if (est === 'cerrado' && !evidencia) return { ok: false, error: 'evidencia' };
  var antes = h.getRange(fila, 4).getValue();
  h.getRange(fila, 4, 1, 4).setValues([fila_([est, evidencia, actor_(s), hoyISO_()])]);
  bitacora_(libro, s, 'Cambió un candado', 'Candados', id, antes, est, evidencia, rev, rid);
  return { ok: true, hecho: 'candado', id: id };
}

function reparto_(s, libro, b, rev, rid) {
  if (!puede_(s, 'editar')) return { ok: false, error: 'permiso' };
  var e = Number(b.esquema);
  if (!(e >= 1 && e <= 5 && Math.round(e) === e)) return { ok: false, error: 'esquema' };
  var h = libro.getSheetByName('Reparto'), antes = h.getRange('B5').getValue();
  h.getRange('B5').setValue(e);
  bitacora_(libro, s, 'Eligió el esquema de reparto', 'Reparto', 'esquema', antes, e, txt_(b.razon, 300), rev, rid);
  return { ok: true, hecho: 'reparto', esquema: e };
}

/* Pruebas de estrés: el libro calcula; aquí sólo se cambia la columna Prueba,
   se lee el resultado y se restablece. */
function estres_(s, libro, b, rev, rid) {
  if (!puede_(s, 'editar')) return { ok: false, error: 'permiso' };
  var mod = libro.getSheetByName('Modelo'), pru = libro.getSheetByName('Pruebas');
  var k = Number(b.version) || Number(pru.getRange('B4').getValue()) || 1;
  if (!(k >= 1 && k <= 3)) return { ok: false, error: 'version' };
  var lista = b.escenario ? ESCENARIOS.filter(function (x) { return x.id === b.escenario; }) : ESCENARIOS;
  if (!lista.length) return { ok: false, error: 'escenario' };
  CacheService.getScriptCache().put('trabajando', 'pruebas', 420);
  sanarPrueba_(mod);           // si una corrida anterior murió a medias, la columna vuelve a ser fórmula
  var huella = resumen_(libro)['v' + k + '.huella'] || '';
  var antesB4 = pru.getRange('B4').getFormula() || pru.getRange('B4').getValue();
  pru.getRange('B4').setValue(k);
  var filas = {}, resultados = [];
  try {
    SpreadsheetApp.flush();
    var base = leerPrueba_(pru);
    resultados.push(['Base de la versión ' + k, '(sin cambios)'].concat(base));
    lista.forEach(function (esc) {
      var cambios = [];
      esc.ops.forEach(function (op) {
        if (!(op.c in filas)) filas[op.c] = guardarPrueba_(mod, op.c);
        var it = filas[op.c];
        if (!it) return;
        var f = it.f;
        var actual = Number(mod.getRange(f, 4 + k).getValue()) || 0, nuevo;
        if (op.fija != null) nuevo = op.fija;
        else if (op.suma != null) nuevo = actual + op.suma;
        else nuevo = actual * op.por;
        if (op.redondea) nuevo = Math.round(nuevo);
        mod.getRange(f, 8).setValue(nuevo);
        cambios.push(op.c + ': ' + (Math.round(actual * 10000) / 10000) + ' → ' + (Math.round(nuevo * 10000) / 10000));
      });
      SpreadsheetApp.flush();
      resultados.push([esc.nombre, cambios.join('; ')].concat(leerPrueba_(pru)));
      restablecer_(mod, filas);
    });
  } finally {
    restablecer_(mod, filas);
    if (String(antesB4).charAt(0) === '=') pru.getRange('B4').setFormula(antesB4); else pru.getRange('B4').setValue(antesB4);
    CacheService.getScriptCache().remove('trabajando');
  }
  // La columna Prueba debe quedar como estaba: si no, las cifras de la corrida no sirven y no se anotan.
  SpreadsheetApp.flush();
  pru.getRange('B4').setValue(k);
  var despues = leerPrueba_(pru);
  if (String(antesB4).charAt(0) === '=') pru.getRange('B4').setFormula(antesB4); else pru.getRange('B4').setValue(antesB4);
  if (JSON.stringify(despues) !== JSON.stringify(base)) {
    bitacora_(libro, s, 'Pruebas de estrés sobre V' + k + ' NO anotadas: la columna Prueba no volvió a su estado', 'Pruebas',
      b.escenario || 'estándar', JSON.stringify(base), JSON.stringify(despues), '', rev, rid);
    return { ok: false, error: 'prueba' };
  }
  var fecha = ahora_(), quien = actor_(s);
  var filasLog = resultados.map(function (r) { return r.concat(['V' + k, fecha, quien, huella]); });
  var desde = Math.max(14, pru.getLastRow() + 1);
  columnas_(pru, 11);
  renglones_(pru, desde + filasLog.length - 1);
  pru.getRange(desde, 1, filasLog.length, 11).setValues(filasLog.map(fila_));
  bitacora_(libro, s, 'Corrió ' + (resultados.length - 1) + ' pruebas de estrés sobre V' + k, 'Pruebas', b.escenario || 'estándar', '', resultados.length + ' renglones', '', rev, rid);
  return { ok: true, hecho: 'estres', version: k, resultados: filasLog };
}
function leerPrueba_(pru) {
  return pru.getRange(6, 2, 5, 1).getValues().map(function (r) { var v = limpio_(r[0]); return typeof v === 'number' ? Math.round(v * 10) / 10 : v; });
}
/* La columna Prueba se restablece con LO MISMO que tenía (getFormula → setFormula, o su valor). Así no
   depende del idioma del libro: con coma decimal Sheets separa con «;», y una fórmula escrita aquí con
   comas queda en #ERROR! (pasó el 12-nov-2026 con el primer libro real). Si la celda ya estaba rota, se
   copia la fórmula de una fila sana del bloque: copyTo ajusta la fila y tampoco depende del idioma. */
function guardarPrueba_(mod, clave) {
  var f = filaPorClave_(mod, clave);
  if (!f) return null;
  var r = mod.getRange(f, 8);
  return { f: f, frm: r.getFormula(), val: r.getValue(), roto: String(r.getDisplayValue()).charAt(0) === '#' };
}
function restablecer_(mod, filas) {
  Object.keys(filas).forEach(function (c) {
    var it = filas[c];
    if (!it) return;
    if (it.roto) { var fuera = {}; Object.keys(filas).forEach(function (x) { if (filas[x]) fuera[filas[x].f] = true; }); copiarPruebaSana_(mod, it.f, fuera); return; }
    var r = mod.getRange(it.f, 8);
    if (it.frm) r.setFormula(it.frm); else r.setValue(it.val);
  });
}
function copiarPruebaSana_(mod, f, tocadas) {
  var n = mod.getLastRow(), rango = mod.getRange(1, 8, n, 1), frms = rango.getFormulas(), vis = rango.getDisplayValues();
  tocadas = tocadas || {};
  for (var i = 0; i < n; i++) {
    if (i + 1 === f || tocadas[i + 1]) continue;
    if (pruebaSana_(frms[i][0], i + 1) && String(vis[i][0]).charAt(0) !== '#') {
      mod.getRange(i + 1, 8).copyTo(mod.getRange(f, 8), SpreadsheetApp.CopyPasteType.PASTE_FORMULA, false);
      return true;
    }
  }
  return false;
}
/* Las palancas del Modelo: renglones con clave y con valor en la columna Datos (los calculados no la tienen). */
function palancasFilas_(mod) {
  var n = mod.getLastRow(), claves = mod.getRange(1, 1, n, 1).getValues(), rb = mod.getRange(1, 4, n, 1), bases = rb.getValues(), basesF = rb.getFormulas(), out = [];
  for (var i = 6; i < n; i++) {
    var c = String(claves[i][0]).trim();
    if (/^[a-z][a-z0-9_]*$/.test(c) && (basesF[i][0] !== '' || (bases[i][0] !== '' && bases[i][0] !== null))) out.push({ clave: c, fila: i + 1 });
  }
  return out;
}
/* Si una corrida murió a medias, la columna Prueba puede haber quedado con números fijos o en error:
   se repara copiando la fórmula de una fila sana. Una fila sana es una FÓRMULA que toma su versión de las
   columnas E:G de su misma fila (no importa cómo se llame la función en el idioma del libro). */
function pruebaSana_(formula, fila) {
  var m = PRUEBA_SANA.exec(String(formula || ''));
  return !!m && Number(m[1]) === fila && Number(m[2]) === fila;
}
function sanarPrueba_(mod) {
  var filas = palancasFilas_(mod), n = mod.getLastRow(), rango = mod.getRange(1, 8, n, 1), frms = rango.getFormulas(), vis = rango.getDisplayValues(), rotas = {}, hay = 0;
  filas.forEach(function (x) {
    if (!pruebaSana_(frms[x.fila - 1][0], x.fila) || String(vis[x.fila - 1][0]).charAt(0) === '#') { rotas[x.fila] = true; hay++; }
  });
  if (!hay) return 0;
  Object.keys(rotas).forEach(function (f) { copiarPruebaSana_(mod, Number(f), rotas); });
  SpreadsheetApp.flush();
  return hay;
}

/* ───────────────────────── la ronda: el plan mueve sus palancas ─────────────────────────
   El plan parte de la versión que defiende (plan.defiende), prueba combinaciones de capital y de arranque
   de obra alrededor de ella (hasta dos pasos de capital y un mes) en una versión de trabajo, y el libro
   recalcula cada una. Nunca escribe en la base ni en la vigente, ni encima del trabajo de una persona si
   nadie se lo presta (lugarRonda_).

   SÓLO PROPONE LO QUE PASA la revisión para fondos. Entre las que pasan se queda con la primera en este orden:
     1) aguanta los golpes leves (RONDA.GOLPES, cada uno por separado): con ninguno le falta dinero, con el
        mismo margen con que la revisión para fondos da por cero un faltante. Si ninguna aguanta, cuenta el
        golpe que deja el mayor faltante y se mide contra la de partida en pasos de capital ENTEROS: una
        vecina gana sólo si le quita al menos un paso entero de faltante; quitarle menos no cuenta, y una a
        la que le falta más que a la de partida nunca le gana;
     2) pasa sin «aportación justa»;      3) no alarga el plazo del dueño frente a la de partida;
     4) le deja más al dueño (a décimas de MDP);      5) usa menos capital.
   Si la mejor es la de partida, o ninguna pasa, no propone («sin mejora») y todo queda como estaba.
   (Si la de partida no pasa la revisión, el punto 1 se mide contra la primera que sí pasa en el orden 2 a 5.)

   Aquí no se calcula ningún resultado financiero: el servidor escoge qué valores probar (la rejilla: el capital
   de partida más o menos pasos, y un mes de arranque) y compara cifras que calculó el libro. Hasta el tamaño
   del paso de capital lo da el libro (plan.paso_capital). */
function diarioClave_(planId) { return 'j_' + planId; }
function avanceClave_(planId) { return 'g_' + planId; }
function esperaClave_(planId) { return 'e_' + planId; }
function pausa_(cfg) { var x = low_(cfg.pausa); return x === 'sí' || x === 'si'; }
function diarioGuardar_(p, libro, ks, filas, kb, rid, n) {
  var mod = libro.getSheetByName('Modelo'), ver = libro.getSheetByName('Versiones'), col = 4 + ks, celdas = [], campos = {};
  filas.forEach(function (x) { var c = mod.getRange(x.fila, col), f = c.getFormula(); celdas.push([x.fila, f, f ? '' : limpio_(c.getValue()), x.clave]); });
  RONDA.CAMPOS.forEach(function (c) { var f = filaPorClave_(ver, c); if (f) campos[c] = limpio_(ver.getRange(f, 2 + ks).getValue()); });
  var fe = filaPorClave_(ver, 'estado');
  var j = { ks: ks, kb: kb, kbEstado: fe ? low_(ver.getRange(fe, 2 + kb).getValue()) : '', rid: rid, n: n, cuando: ahora_(), t: Date.now(), celdas: celdas, campos: campos };
  var texto = JSON.stringify(j);
  if (texto.length > 8800) return null;             // no cabe en una propiedad: sin diario no se toca nada
  PropertiesService.getScriptProperties().setProperty(diarioClave_(p.plan_id), texto);
  return j;
}
/* ¿La ronda de ese diario alcanzó a anotarse? Su renglón en Rondas es lo que la da por hecha: el mismo
   request_id Y el mismo número de ronda (un request_id repetido no hace pasar por anotada a una ronda muerta). */
function rondaAnotada_(libro, rid, n) {
  var h = libro.getSheetByName('Rondas');
  if (!h || !rid) return false;
  var cuantas = h.getLastRow() - 4;
  if (cuantas < 1 || h.getMaxColumns() < RONDA.COLS) return false;
  return h.getRange(5, 1, cuantas, RONDA.COLS).getValues().some(function (f) {
    return String(f[RONDA.COLS - 1]) === String(rid) && (!n || Number(f[0]) === Number(n));
  });
}
/* Deja la versión de trabajo (palancas y ficha) y el estado de la de partida como estaban antes de la ronda.
   Si la ronda sí terminó (su renglón está en Rondas) no deshace nada: sólo retira el diario. */
function diarioRestaurar_(p, libro) {
  var props = PropertiesService.getScriptProperties(), crudo = props.getProperty(diarioClave_(p.plan_id));
  if (!crudo) return null;
  var j;
  try { j = JSON.parse(crudo); } catch (e) { props.deleteProperty(diarioClave_(p.plan_id)); return null; }
  if (rondaAnotada_(libro, j.rid, j.n)) { props.deleteProperty(diarioClave_(p.plan_id)); return null; }
  var mod = libro.getSheetByName('Modelo'), ver = libro.getSheetByName('Versiones'), col = 4 + j.ks;
  j.celdas.forEach(function (c) { var r = mod.getRange(c[0], col); if (c[1]) r.setFormula(c[1]); else r.setValue(seguro_(c[2] == null ? '' : c[2])); });
  Object.keys(j.campos).forEach(function (c) { var f = filaPorClave_(ver, c); if (f) ver.getRange(f, 2 + j.ks).setValue(seguro_(j.campos[c] == null ? '' : j.campos[c])); });
  var fe = filaPorClave_(ver, 'estado');
  if (fe && j.kb && j.kb !== j.ks && j.kbEstado) ver.getRange(fe, 2 + j.kb).setValue(j.kbEstado);
  props.deleteProperty(diarioClave_(p.plan_id));
  SpreadsheetApp.flush();
  return j;
}
/* La reparación la anota el sistema: no es un cambio de quien llamó (que pudo ser alguien que sólo lee). */
function recuperar_(p, libro) {
  var j = diarioRestaurar_(p, libro);
  if (j) bitacora_(libro, SISTEMA, 'Dejó la V' + j.ks + ' como estaba antes de una ronda que se interrumpió (' + j.cuando + ')', 'Modelo', 'V' + j.ks, '', '', '', null, '');
  return !!j;
}
/* Lo que alguien escribió en la columna de una versión del Modelo (su fórmula o, si no hay, su valor). Con esto
   se reconoce si una persona le movió una palanca a una propuesta del plan; no cambia cuando cambian los datos. */
function selloPalancas_(mod, filas, col) {
  var n = mod.getLastRow(), rango = mod.getRange(1, col, n, 1), fs = rango.getFormulas(), vs = rango.getValues();
  return hash_(JSON.stringify(filas.map(function (x) { return [x.clave, fs[x.fila - 1][0] || limpio_(vs[x.fila - 1][0])]; })));
}
/* Todo lo que entra a las cuentas de una ronda: los datos, los productos, el reparto y las palancas de la base
   y de la versión de partida. Lo ya leído en un intento anterior sólo vale si nada de esto cambió. */
function selloEntradas_(libro, mod, filas, kb) {
  var n = mod.getLastRow(), bloque = mod.getRange(1, 4, n, 1 + kb), fs = bloque.getFormulas(), vs = bloque.getValues();
  var pal = filas.map(function (x) { var i = x.fila - 1; return [x.clave, fs[i][0] || limpio_(vs[i][0]), fs[i][kb] || limpio_(vs[i][kb])]; });
  var limpia = function (f) { return f.map(limpio_); };
  return hash_(JSON.stringify([tabla_(libro, 'Datos', 5, 3), libro.getSheetByName('Productos').getRange(5, 1, 6, 9).getValues().map(limpia),
    libro.getSheetByName('Reparto').getRange(4, 1, 12, 6).getValues().map(limpia), pal]));
}
/* El avance de una ronda que no alcanzó a terminar (libro lento). Lo ya leído sólo vale para la misma versión
   de partida y de trabajo, si nada de lo que entra a las cuentas cambió (sello) y si no es viejo. */
function avanceVacio_(huella, ks, paso, sello) { return { h: huella, ks: ks, paso: paso, s: sello, t: Date.now(), lect: {}, golpes: {} }; }
function avanceLeer_(p, huella, ks, paso, sello) {
  try {
    var a = JSON.parse(PropertiesService.getScriptProperties().getProperty(avanceClave_(p.plan_id)) || 'null');
    if (a && a.h === huella && a.ks === ks && a.paso === paso && a.s === sello && Date.now() - Number(a.t) < RONDA.AVANCE_MS && a.lect && a.golpes) return a;
  } catch (e) { /* un avance ilegible no sirve */ }
  return avanceVacio_(huella, ks, paso, sello);
}
function avanceGuardar_(p, a) {
  var texto = JSON.stringify(a);
  if (texto.length <= 8800) PropertiesService.getScriptProperties().setProperty(avanceClave_(p.plan_id), texto);
}
function num_(v) { return typeof v === 'number' && isFinite(v) ? v : null; }
function r3_(v) { var n = num_(v); return n === null ? null : Math.round(n * 1000) / 1000; }
function f1_(v) { var n = num_(v); return n === null ? '—' : (Math.round(n * 10) / 10).toFixed(1); }
function n_(v) { var n = r3_(v); return n === null ? '—' : String(n); }
function fallas_(rv) {
  rv = String(rv || '');
  if (/^Pasa/.test(rv)) return 0;
  var m = /No pasa: (\d+) de/.exec(rv);
  return m ? Number(m[1]) : 9;
}
/* Lo que el libro dice de una versión. `r` es el dinero que le faltaría: 0 si la celda está vacía y null si no
   se puede leer (un error del libro): lo ilegible nunca se toma por «no le falta nada». */
function lecturaVersion_(libro, k) {
  var r = resumen_(libro), pre = 'v' + k + '.';
  var rv = String(r[pre + 'rv_resultado'] || ''), falta = r[pre + 'respaldo'];
  return { rv: rv, f: fallas_(rv), j: /justa/i.test(rv) ? 1 : 0, r: falta === '' || falta === undefined ? 0 : r3_(falta), d: r3_(r[pre + 'dueno_recibe']), m: num_(r[pre + 'dueno_meses']),
    g: r3_(r[pre + 'ganancia']), a: r3_(r[pre + 'rv_aportacion']), pv: r3_(r[pre + 'rv_preventa']), huella: r[pre + 'huella'] || '' };
}
/* Orden de preferencia entre dos combinaciones ya leídas (menor es mejor). */
function compara_(a, b, claves) {
  for (var i = 0; i < claves.length; i++) { if (a[claves[i]] !== b[claves[i]]) return a[claves[i]] < b[claves[i]] ? -1 : 1; }
  return 0;
}
/* Dónde puede escribir el plan su propuesta. Nunca en la base ni en la vigente, ni encima del trabajo de
   una persona sin que alguien se lo preste:
     · libre: una versión vacía, descartada, o una alterna que el propio plan propuso y nadie tocó;
     · en su lugar: si la versión de partida es una propuesta del propio plan que nadie tocó, y no hay otra libre;
     · prestada: la que una persona con permiso de editar señala (usar): una alterna hecha (o tocada) por una
       persona, o la propia versión de partida cuando es la propuesta de una persona.
   `delPlan` dice, por versión, si es una propuesta del plan que nadie tocó (delPlan_).
   `presta` son las versiones que una persona podría prestarle. */
function lugarRonda_(estados, delPlan, kb, usar, esPersona) {
  var libres = [2, 3].filter(function (k) {
    var e = estados[k - 1];
    return k !== kb && (e === '' || e === 'descartada' || (e === 'alterna' && delPlan[k - 1]));
  });
  var presta = [2, 3].filter(function (k) {
    var e = estados[k - 1];
    return k === kb ? (e === 'propuesta' && !delPlan[k - 1]) : (e === 'alterna' && !delPlan[k - 1]);
  });
  if (libres.length) return { ks: libres[0], modo: 'libre', presta: presta };
  if (kb !== 1 && estados[kb - 1] === 'propuesta' && delPlan[kb - 1]) return { ks: kb, modo: 'en su lugar', presta: presta };
  if (esPersona && presta.indexOf(Number(usar)) >= 0) return { ks: Number(usar), modo: 'prestada', presta: presta };
  return { ks: 0, modo: '', presta: presta };
}
function fichas_(r) {
  return {
    estados: [1, 2, 3].map(function (k) { return low_(r['v' + k + '.estado']); }),
    quienes: [1, 2, 3].map(function (k) { return String(r['v' + k + '.propuesta_por'] || ''); }),
    nombres: [1, 2, 3].map(function (k) { return String(r['v' + k + '.nombre'] || ''); }),
    aprobadas: [1, 2, 3].map(function (k) { return String(r['v' + k + '.aprobada_por'] || '').trim() !== ''; })
  };
}
/* ¿Esa versión es una propuesta del plan que nadie tocó? Sólo si: su firma es exactamente la de una ronda
   («El plan · ronda n»), esa ronda propuso en esa versión, Dirección nunca la aprobó y sus palancas siguen como
   la ronda las dejó. Si una persona le movió una palanca, ya es trabajo de esa persona y el plan no la pisa. */
function delPlan_(libro, fi, mod, filas, rondas) {
  return [1, 2, 3].map(function (k) {
    var m = RONDA.FIRMA.exec(fi.quienes[k - 1]);
    if (!m || fi.aprobadas[k - 1]) return false;
    if (!rondas) rondas = tabla_(libro, 'Rondas', 5, RONDA.COLS);
    var f = rondas.filter(function (x) { return Number(x[0]) === Number(m[1]); })[0];
    if (!f || f[6] !== 'propuesta' || Number(f[7]) !== k) return false;
    try { var sello = JSON.parse(f[11]).sello; return !!sello && sello === selloPalancas_(mod, filas, 4 + k); } catch (e) { return false; }
  });
}
function rondasHoja_(libro) {
  var h = libro.getSheetByName('Rondas');
  if (h) return h;
  h = libro.insertSheet('Rondas');
  h.getRange(1, 1).setValue('Rondas');
  h.getRange(2, 1).setValue('Cada ronda del plan: de qué versión parte, qué probó, qué propone y por qué. La escribe el plan; nadie la edita a mano.');
  h.getRange(4, 1, 1, RONDA.COLS).setValues([['Ronda', 'Fecha', 'Quién', 'Parte de (versión)', 'Huella de partida', 'Motivo', 'Resultado', 'Propuesta en (versión)',
    'Huella de la propuesta', 'Qué cambia', 'Combinaciones probadas', 'Detalle', 'request_id']]);
  return h;
}
function ronda_(s, p, libro, b, rev, rid) {
  if (!puede_(s, 'editar')) return { ok: false, error: 'permiso' };
  var t0 = Date.now(), hayTiempo = function () { return Date.now() - t0 < RONDA.MAX_MS; };
  var r0 = resumen_(libro), paso = String(r0['plan.paso'] || '');
  if (paso !== 'explorar' && !(b.forzar === true && puede_(s, 'aprobar'))) return { ok: false, error: 'paso', paso: paso };
  var kb = Number(r0['plan.defiende']) || 0;
  if (!(kb >= 1 && kb <= 3) || num_(r0['v' + kb + '.ganancia']) === null) return { ok: false, error: 'calcula' };
  var mod = libro.getSheetByName('Modelo'), ver = libro.getSheetByName('Versiones'), filas = palancasFilas_(mod), filaDe = {};
  filas.forEach(function (x) { filaDe[x.clave] = x.fila; });
  var fi = fichas_(r0), estados = fi.estados;
  var lugar = lugarRonda_(estados, delPlan_(libro, fi, mod, filas), kb, b.usar, s.sistema !== true);
  var ks = lugar.ks;
  if (!ks) return { ok: false, error: 'sin_lugar', presta: lugar.presta };
  var pasoCap = num_(r0['plan.paso_capital']);             // el tamaño del paso lo da el libro
  if (!filaDe.capital || !filaDe.obra_inicio || !(pasoCap > 0)) return { ok: false, error: 'modelo' };
  var colB = 4 + kb, col = 4 + ks, huellaPartida = String(r0['plan.huella'] || r0['v' + kb + '.huella'] || '');
  var capBase = r3_(mod.getRange(filaDe.capital, colB).getValue()), obraBase = num_(mod.getRange(filaDe.obra_inicio, colB).getValue());
  var capDatos = r3_(mod.getRange(filaDe.capital, 4).getValue());       // el capital disponible que dicen los datos
  if (capBase === null || obraBase === null || !huellaPartida) return { ok: false, error: 'modelo' };
  var tope = Math.max(capDatos === null ? capBase : capDatos, capBase); // nunca más capital que el disponible… ni que el que ya usa
  var etiquetas = {};
  ['capital', 'obra_inicio'].forEach(function (c) { etiquetas[c] = String(mod.getRange(filaDe[c], 2).getValue() || c); });

  // combinaciones: la de partida primero
  var vistos = {}, cands = [];
  var agrega = function (cap, obra, esBase) {
    cap = r3_(cap);
    var id = cap + '|' + obra;
    if (vistos[id] || cap < 0 || cap > tope + 1e-9 || obra < 1 || obra > PPP2.MESES) return;
    vistos[id] = true; cands.push({ id: id, p: { capital: cap, obra_inicio: obra }, base: !!esBase, golpes: null });
  };
  agrega(capBase, obraBase, true);
  RONDA.OBRA_PASOS.forEach(function (dO) { RONDA.CAPITAL_PASOS.forEach(function (dC) { agrega(capBase + dC * pasoCap, obraBase + dO, false); }); });
  if (cands.length < 2) return { ok: false, error: 'rejilla' };          // sin vecinas no hay nada que comparar
  var hr = rondasHoja_(libro), n = Math.max(0, hr.getLastRow() - 4) + 1;
  // Lo que el plan ya propuso desde ESTA misma versión (misma huella) y hoy no es su propuesta, alguien lo retiró
  // (lo descartó o lo cambió): no se vuelve a proponer lo mismo.
  var retiradas = {};
  tabla_(libro, 'Rondas', 5, RONDA.COLS).forEach(function (f) {
    if (Number(f[3]) !== kb || String(f[4]) !== huellaPartida || f[6] !== 'propuesta') return;
    try {
      (JSON.parse(f[11]).candidatos || []).forEach(function (x) { if (x.elegido && x.p) retiradas[r3_(x.p.capital) + '|' + x.p.obra_inicio] = Number(f[0]) || true; });
    } catch (e) { /* un detalle ilegible no detiene la ronda */ }
  });
  cands.forEach(function (x) { if (!x.base && retiradas[x.id]) x.retirada = retiradas[x.id]; });

  rid = rid || ('r-' + Date.now());
  var props = PropertiesService.getScriptProperties(), cache = CacheService.getScriptCache();
  var sello = selloEntradas_(libro, mod, filas, kb);
  var diario = diarioGuardar_(p, libro, ks, filas, kb, rid, n);
  if (!diario) return { ok: false, error: 'modelo' };
  var golpes = ESCENARIOS.filter(function (e) { return RONDA.GOLPES.indexOf(e.id) >= 0; });
  var LECT = ['rv', 'f', 'j', 'r', 'd', 'm', 'g', 'a', 'pv'];
  var lista = function (L0) { return LECT.map(function (k) { return L0[k]; }); };
  var igual = function (a, b2) { return JSON.stringify(a) === JSON.stringify(b2); };
  var avance = avanceLeer_(p, huellaPartida, ks, pasoCap, sello), nuevas = 0;
  var base = cands[0], elegido = null, cerca = null, incompleta = false, ilegible = false;
  // Lo guardado de la de partida debe ser lo que el libro dice HOY de esa versión: si no, lo guardado ya no sirve.
  if (avance.lect[base.id] && !igual(avance.lect[base.id], lista(lecturaVersion_(libro, kb)))) avance = avanceVacio_(huellaPartida, ks, pasoCap, sello);
  cache.put('trabajando', p.plan_id, 420);
  try {
    // 1) la versión de trabajo empieza como copia exacta de la de partida
    if (ks !== kb) filas.forEach(function (x) {
      var o = mod.getRange(x.fila, colB), d = mod.getRange(x.fila, col), f = o.getFormula();
      if (f) d.setFormula(f); else d.setValue(o.getValue());
    });
    var pon = function (c) { Object.keys(c.p).forEach(function (k) { mod.getRange(filaDe[k], col).setValue(c.p[k]); }); };
    var lee = function () { SpreadsheetApp.flush(); return lecturaVersion_(libro, ks); };
    // 2) cada combinación en sus propios números (lo ya leído en un intento anterior no se repite)
    for (var i = 0; i < cands.length; i++) {
      var c = cands[i], ya = avance.lect[c.id];
      if (!ya) {
        if (nuevas > 0 && !hayTiempo()) { incompleta = true; break; }
        pon(c);
        ya = lista(lee());
        avance.lect[c.id] = ya; nuevas++;
      }
      LECT.forEach(function (k, z) { c[k] = ya[z]; });
      c.leida = true;
    }
    var leidos = cands.filter(function (x) { return x.leida; });
    leidos.forEach(function (x) {
      x.mas = (x.m !== null && base.m !== null && x.m > base.m) ? 1 : 0;      // ¿alarga el plazo del dueño?
      x.nd = x.d === null ? 0 : -Math.round(x.d * 10) / 10;                   // lo del dueño, a décimas
      x.cap = x.p.capital;
    });
    // 3) golpes leves, cada uno por separado: cuenta el peor
    var mide = function (x) {
      pon(x);
      var g = {};
      golpes.forEach(function (esc) {
        var antes = [];
        esc.ops.forEach(function (op) {
          var f = filaDe[op.c]; if (!f) return;
          var celda = mod.getRange(f, col), actual = Number(celda.getValue()) || 0, nuevo;
          antes.push([celda, celda.getFormula(), celda.getValue()]);
          if (op.fija != null) nuevo = op.fija; else if (op.suma != null) nuevo = actual + op.suma; else nuevo = actual * op.por;
          if (op.redondea) nuevo = Math.round(nuevo);
          celda.setValue(nuevo);
        });
        var Lg = lee();
        g[esc.id] = [Lg.r === null ? null : (Lg.r > 0 ? Lg.r : 0), Lg.f, Lg.g];
        antes.reverse().forEach(function (a) { if (a[1]) a[0].setFormula(a[1]); else a[0].setValue(a[2]); });
      });
      return g;
    };
    var golpea = function (x) {
      var g = avance.golpes[x.id];
      if (!g) { g = mide(x); avance.golpes[x.id] = g; nuevas++; x.frescos = true; }
      x.golpes = {}; x.gs = 0; x.peor = '';
      golpes.forEach(function (esc) {
        var v = g[esc.id];
        if (!v || v[0] === null || v[0] === undefined) { ilegible = true; return; }   // el libro no se pudo leer bajo ese golpe
        x.golpes[esc.id] = { r: v[0], f: v[1], g: v[2] };
        if (v[0] > x.gs) { x.gs = v[0]; x.peor = esc.id; }                            // el peor golpe: el que deja el mayor faltante
      });
    };
    var alcanza = function (x) { return !!avance.golpes[x.id] || nuevas === 0 || hayTiempo(); };
    // «aguanta»: con ningún golpe leve le falta dinero (el mismo margen con que la revisión da por cero un faltante)
    var aguanta = function (x) { return x.gs < RONDA.TOLERANCIA; };
    // pasos de capital ENTEROS de faltante que x le quita a la referencia; negativo si le falta más que a ella
    var pasosMejor = function (x, ref) {
      var d = ref.gs - x.gs;
      if (d < -RONDA.TOLERANCIA) return -Math.ceil(-d / pasoCap - 1e-9);
      return Math.floor(Math.max(d, 0) / pasoCap + 1e-9);
    };
    var mideAguante = function (x, ref) { x.cae = aguanta(x) ? 0 : 1; x.ka = aguanta(x) ? 0 : 0 - pasosMejor(x, ref); };
    var aptas = leidos.filter(function (x) { return x.f === 0 && !x.retirada; }).sort(function (a, b2) { return compara_(a, b2, ['j', 'mas', 'nd', 'cap']); });
    if (!incompleta && aptas.length) {
      var ref = base.f === 0 ? base : aptas[0];                 // contra quién se mide el aguante
      if (!alcanza(ref)) incompleta = true; else golpea(ref);
      if (!incompleta && !ilegible) {
        for (var q = 0; q < aptas.length; q++) {
          var x = aptas[q];
          if (x.golpes === null) {
            if (!alcanza(x)) { incompleta = true; break; }
            golpea(x);
            if (ilegible) break;
          }
          mideAguante(x, ref);
          if (x.cae === 0) { elegido = x; break; }              // la primera que aguanta todo es la mejor: las que siguen son menos deseables
        }
        if (!elegido && !incompleta && !ilegible) elegido = aptas.slice().sort(function (a, b2) { return compara_(a, b2, ['cae', 'ka', 'j', 'mas', 'nd', 'cap']); })[0];
      }
    }
    if (ilegible) {
      // el libro dio un error bajo un golpe: no se afirma nada y no se guarda esa lectura
      diarioRestaurar_(p, libro);
      props.deleteProperty(avanceClave_(p.plan_id));
      return { ok: false, error: 'lectura' };
    }
    if (incompleta) {
      // no alcanzó el tiempo: no se afirma nada. Lo leído queda guardado y el siguiente intento continúa.
      diarioRestaurar_(p, libro);
      avanceGuardar_(p, avance);
      return { ok: false, error: 'tiempo', nuevas: nuevas };
    }
    if (!elegido) {
      // ninguna pasa la revisión: no hay propuesta. Se anota la que quedó más cerca, sólo para informar.
      elegido = base;
      cerca = leidos.filter(function (x) { return !x.base && !x.retirada && x.f < base.f; }).sort(function (a, b2) { return compara_(a, b2, ['f', 'mas', 'nd', 'cap']); })[0] || null;
    }

    var limpia = function (x) {
      var o = { p: x.p, rv: x.rv, f: x.f, j: x.j, r: x.r, d: x.d, m: x.m, g: x.g, a: x.a, pv: x.pv, golpes: x.golpes };
      if (x.golpes) { o.gs = x.gs; o.peor = x.peor; }
      if (x.ka !== undefined && x.cae) o.pasos = 0 - x.ka;      // no aguanta: pasos enteros de faltante que le quita a la de partida
      if (x.base) o.base = true;
      if (x === elegido) o.elegido = true;
      if (x === cerca) o.cerca = true;
      if (x.retirada) o.retirada = x.retirada;
      return o;
    };
    var nombreGolpe = function (id) { var e = golpes.filter(function (x) { return x.id === id; })[0]; return e ? e.nombre : id; };
    var ses = r0['plan.consejo_sesion'] || '', regresada = !!ses && Number(r0['plan.consejo_votaron']) === 7 && r0['plan.consejo_aprobada'] !== true;
    var motivo = base.f > 0 ? 'La V' + kb + ' no pasa la revisión para fondos'
      : (regresada ? 'El consejo (' + ses + ') regresó la V' + kb + ': aprueban ' + (Number(r0['plan.consejo_aprueban']) || 0) + ' de 7' + (Number(r0['plan.consejo_vetos']) > 0 ? ', con veto' : '')
        : (estados[kb - 1] === 'base' ? 'Primera exploración desde la base' : 'Siguiente paso del plan'));
    if (b.forzar === true && paso !== 'explorar') motivo = 'A pedido de ' + actor_(s);
    var cambiosDe = function (x) { return Object.keys(x.p).filter(function (k) { return x.p[k] !== base.p[k]; }).map(function (k) { return etiquetas[k] + ' ' + n_(base.p[k]) + ' → ' + n_(x.p[k]); }); };
    var cambios = cambiosDe(elegido);
    var veredicto = function (x) { return x.f === 0 ? (x.j ? 'pasa las 9 pruebas con la aportación justa' : 'pasa las 9 pruebas') : 'no pasa ' + x.f + ' de 9 pruebas'; };
    var alcance = 'hasta dos pasos de capital de ' + n_(pasoCap) + ' MDP y un mes de arranque';
    var detalle = { paso_capital: pasoCap, golpes: RONDA.GOLPES, lugar: lugar.modo, candidatos: leidos.map(limpia) };
    var resultado = elegido.base ? 'sin mejora' : 'propuesta', queCambia = '', huellaProp = '';
    if (resultado === 'propuesta') {
      pon(elegido); SpreadsheetApp.flush();
      // Lo que se va a afirmar se vuelve a leer del libro, ya escrito. Si no es lo que se usó para escoger (venía
      // de un intento anterior y el libro cambió), no se afirma nada: se tira lo guardado y todo queda como estaba.
      var viva = lecturaVersion_(libro, ks);
      var cambio = !igual(lista(viva), lista(elegido));
      if (!cambio && !elegido.frescos && elegido.golpes) cambio = !igual(mide(elegido), avance.golpes[elegido.id]);
      if (cambio) {
        diarioRestaurar_(p, libro);
        props.deleteProperty(avanceClave_(p.plan_id));
        return { ok: false, error: 'cambio' };
      }
      var antesNombre = String(diario.campos.nombre || ''), antesEstado = String(diario.campos.estado || '');
      // cómo estaba la versión donde se escribió: nunca se descarta de la anotación
      detalle.antes = { version: ks, nombre: antesNombre, estado: antesEstado, propuesta_por: String(diario.campos.propuesta_por || ''),
        celdas: diario.celdas.map(function (x) { return [x[3], x[1], x[2]]; }) };
      detalle.sello = selloPalancas_(mod, filas, col);          // así quedaron sus palancas: si alguien las mueve, deja de ser «del plan»
      huellaProp = viva.huella;
      var aguante = '';
      if (elegido.golpes) {
        aguante = aguanta(elegido) ? ' Con cada golpe leve por separado no le falta dinero'
          : ' Con el peor golpe leve (' + nombreGolpe(elegido.peor) + ') le faltarían ' + f1_(elegido.gs) + ' MDP';
        if (base.golpes) aguante += aguanta(base) ? ' (a la V' + kb + ' tampoco)' : ' (a la V' + kb + ' le faltarían ' + f1_(base.gs) + ' con ' + nombreGolpe(base.peor) + ')';
        aguante += '.';
      }
      var donde = lugar.modo === 'en su lugar' ? ' Afiné mi propuesta en su lugar; lo que tenía quedó anotado en esta ronda.'
        : (antesNombre || antesEstado ? ' Escribí en la V' + ks + '; lo que tenía («' + (antesNombre || 'sin nombre') + '», ' + (antesEstado || 'sin estado') + ') quedó anotado en esta ronda.' : '');
      queCambia = 'Ronda ' + n + ' del plan. Parte de la V' + kb + ' y cambia: ' + cambios.join('; ') + '. ' +
        veredicto(elegido).charAt(0).toUpperCase() + veredicto(elegido).slice(1) + (veredicto(elegido) !== veredicto(base) ? ' (la V' + kb + ' ' + veredicto(base) + ')' : '') + '.' + aguante +
        ' Al dueño: ' + f1_(elegido.d) + ' MDP en ' + (elegido.m === null ? '—' : elegido.m) + ' meses (con la V' + kb + ': ' + f1_(base.d) + ' en ' + (base.m === null ? '—' : base.m) + ').' + donde;
      var pone = function (campo, valor) { var f = filaPorClave_(ver, campo); if (f) ver.getRange(f, 2 + ks).setValue(seguro_(valor)); };
      pone('nombre', txt_('Ronda ' + n + ' · ' + cambios.join('; '), 80));
      pone('estado', 'propuesta');
      pone('que_cambia', txt_(queCambia, 800));
      pone('propuesta_por', 'El plan · ronda ' + n);
      pone('aprobada_por', ''); pone('fecha_aprobacion', '');
      var nota = '';
      if (ks !== kb && estados[kb - 1] === 'propuesta') {                  // la propuesta anterior queda a la vista, como alterna
        var fe = filaPorClave_(ver, 'estado');
        if (fe) ver.getRange(fe, 2 + kb).setValue('alterna');
        nota = '; la V' + kb + ' pasa a alterna';
      }
      bitacora_(libro, s, 'Ronda ' + n + ': el plan propuso la V' + ks + ' (' + cambios.join('; ') + ')', 'Rondas', 'ronda ' + n,
        antesNombre || antesEstado ? 'V' + ks + ': ' + (antesNombre || 'sin nombre') + ' (' + (antesEstado || 'sin estado') + ')' : '', 'V' + ks + ': propuesta' + nota, motivo, rev, rid);
    } else {
      diarioRestaurar_(p, libro);                                        // la versión de trabajo vuelve a quedar exactamente como estaba
      var hayRetiradas = leidos.some(function (x) { return x.retirada && x.f === 0; });
      var cuantas = leidos.length + ' combinaciones de capital y arranque de obra alrededor de la V' + kb + ' (' + alcance + ')';
      queCambia = 'Ronda ' + n + ' del plan. Probé ' + cuantas + (base.f === 0
        ? ' y ninguna es mejor que la que ya defiendo' + (hayRetiradas ? ' (sin contar lo que ya propuse desde aquí y se retiró)' : '') + '.'
        : ' y ninguna pasa la revisión para fondos.' + (cerca ? ' La que quedó más cerca: ' + cambiosDe(cerca).join('; ') + ' (' + veredicto(cerca) + '; la V' + kb + ' ' + veredicto(base) + ').' : '') +
          ' Hace falta mover algo más que capital y arranque de obra, o moverlos más lejos.');
      bitacora_(libro, s, 'Ronda ' + n + ': el plan movió capital y arranque de obra desde la V' + kb + ' y no encontró mejora', 'Rondas', 'ronda ' + n, '', 'sin mejora', motivo, rev, rid);
    }
    // el detalle guarda todo lo que probó; si no cabe en una celda se recorta, pero nunca lo que tenía la versión ni su sello
    var texto = JSON.stringify(detalle);
    if (texto.length > RONDA.DETALLE_MAX) { detalle.candidatos.forEach(function (x) { delete x.golpes; }); texto = JSON.stringify(detalle); }
    if (texto.length > RONDA.DETALLE_MAX) { detalle.candidatos = detalle.candidatos.filter(function (x) { return x.base || x.elegido || x.cerca; }); texto = JSON.stringify(detalle); }
    // el renglón de Rondas es lo que da la ronda por hecha: sólo cuando ya está escrito en el libro se retira el diario
    hr.appendRow(fila_([n, ahora_(), actor_(s), kb, huellaPartida, motivo, resultado, resultado === 'propuesta' ? ks : '', huellaProp, queCambia, leidos.length, texto, txt_(rid, 80)]));
    SpreadsheetApp.flush();
    props.deleteProperty(diarioClave_(p.plan_id));
    props.deleteProperty(avanceClave_(p.plan_id));
    return { ok: true, hecho: 'ronda', ronda: n, resultado: resultado, version: resultado === 'propuesta' ? ks : kb, parte_de: kb, que_cambia: queCambia, lugar: lugar.modo };
  } catch (err) {
    try { diarioRestaurar_(p, libro); } catch (e2) { /* el diario sigue guardado: la siguiente llamada lo restaura */ }
    throw err;
  } finally {
    cache.remove('trabajando');
  }
}

/* El latido: lo llama un activador por tiempo. Por cada plan activo hace, si toca, UN paso de los que
   el plan puede dar solo: la ronda de capital y arranque de obra («explorar») o las pruebas de la versión
   que defiende («probar»). Nunca aprueba, nunca vuelve vigente, nunca toca la base ni la vigente, nunca
   escribe encima del trabajo de una persona. Se apaga con Config!pausa = sí o Config!latido = no. */
function latidoEstado_(cfg) {
  if (pausa_(cfg) || low_(cfg.latido) === 'no') return 'apagado';
  var t = Number(PropertiesService.getScriptProperties().getProperty('latido_t')) || 0;
  return Date.now() - t < RONDA.LATIDO_MS ? 'activo' : 'sin latido';   // sin activador instalado (o lleva horas sin correr) nada corre solo
}
function latido() {
  var props = PropertiesService.getScriptProperties();
  props.setProperty('latido_t', String(Date.now()));   // la página sólo promete «lo hago solo» si el latido de verdad corre
  var cfg = config_();
  if (pausa_(cfg) || low_(cfg.latido) === 'no') return 'pausa';
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(1000)) return 'ocupado';
  var hecho = 'nada';
  try {
    var planes = planes_().filter(function (p) { return low_(p.estado) === 'activo'; });
    // se empieza por el plan que sigue al último atendido: uno con el libro lento no acapara el latido
    var ultimo = props.getProperty('latido_p'), desde = 0;
    planes.forEach(function (p, z) { if (p.plan_id === ultimo) desde = z + 1; });
    planes = planes.slice(desde).concat(planes.slice(0, desde));
    var esperaDe = function (p) {
      try { var e = JSON.parse(props.getProperty(esperaClave_(p.plan_id)) || 'null'); return typeof e === 'number' ? { hasta: e, n: 0, de: '' } : e; } catch (x) { return null; }
    };
    var espera = function (p, horas, de, veces) { props.setProperty(esperaClave_(p.plan_id), JSON.stringify({ hasta: Date.now() + horas * 3600000, n: veces || 0, de: de || '' })); };
    for (var i = 0; i < planes.length && hecho === 'nada'; i++) {
      var p = planes[i];
      try {
        // si el último intento con este plan no sirvió, no se insiste en cada latido: se espera un rato
        var e = esperaDe(p);
        if (e && Number(e.hasta) > Date.now()) continue;
        var libro = libro_(p);
        recuperar_(p, libro);
        var r = resumen_(libro), paso = String(r['plan.paso'] || ''), rid = 'latido-' + p.plan_id + '-' + Date.now(), res = null;
        if (paso === 'explorar') res = ronda_(SISTEMA, p, libro, {}, revision_(libro), rid);
        else if (paso === 'probar') res = estres_(SISTEMA, libro, { version: Number(r['plan.defiende']) || 0 }, revision_(libro), rid);
        if (!res) continue;
        props.setProperty('latido_p', p.plan_id);
        hecho = paso + ':' + p.plan_id + ':' + (res.ok ? (res.resultado || 'ok') : res.error);
        var nota = res.ok ? (res.que_cambia || 'pruebas corridas') : 'no se pudo: ' + res.error, estado = res.ok ? 'ok' : 'error';
        if (res.ok) {
          // ¿el plan avanzó? Si el libro sigue pidiendo lo mismo sobre los mismos números, repetirlo no sirve:
          // se reintenta al día siguiente y, a la tercera, ya no se insiste hasta que una persona cambie algo.
          SpreadsheetApp.flush();
          var r2 = resumen_(libro);
          if (String(r2['plan.paso'] || '') === paso && String(r2['plan.huella'] || '') === String(r['plan.huella'] || '') && Number(r2['plan.defiende']) === Number(r['plan.defiende'])) {
            var de = paso + '|' + String(r['plan.huella'] || ''), veces = (e && e.de === de ? Number(e.n) || 0 : 0) + 1, basta = veces >= RONDA.INSISTE;
            espera(p, basta ? 24 * 365 : 24, de, veces); estado = 'error';
            nota = 'el paso no avanzó (sigue en «' + paso + '»' + (basta ? '; ya no insisto hasta que alguien cambie algo en el plan' : '') + '): ' + nota;
          } else props.deleteProperty(esperaClave_(p.plan_id));
        } else if (res.error === 'tiempo') {
          if (!(res.nuevas > 0)) espera(p, 24);        // ni una combinación nueva: el libro es demasiado lento para insistir
        } else espera(p, res.error === 'prueba' || res.error === 'cambio' ? 2 : 24);
        bitacoraVivero_(SISTEMA, 'latido · ' + paso, p.plan_id, nota, rid, estado);
      } catch (err) {
        espera(p, 2);
        bitacoraVivero_(SISTEMA, 'latido', p.plan_id, String(err && err.message || err), '', 'error');
      }
    }
  } finally {
    lock.releaseLock();
    CacheService.getScriptCache().remove('vivero');
  }
  return hecho;
}

/* Sembrar: copia la plantilla, escribe la identidad y lo anota en el vivero. */
function sembrar_(s, b, rid) {
  if (!puede_(s, 'editar')) return { ok: false, error: 'permiso' };
  var nombre = txt_(b.nombre, 80);
  if (nombre.length < 3) return { ok: false, error: 'nombre' };
  var cfg = config_();
  var id = 'p2' + Utilities.getUuid().replace(/-/g, '').toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 10);
  var copia = DriveApp.getFileById(cfg.plantilla_id).makeCopy('PPP 2 · ' + nombre, DriveApp.getFolderById(cfg.carpeta_id));
  var libro = SpreadsheetApp.openById(copia.getId()), h = libro.getSheetByName('Datos');
  var poner = { 'plan.nombre': nombre, 'plan.ubicacion': txt_(b.ubicacion, 300), 'plan.tipo': txt_(b.tipo_proyecto, 200), 'plan.objetivo': txt_(b.objetivo, 500) };
  var m2 = numero_(b.terreno_m2, 'm²');
  Object.keys(poner).forEach(function (clave) {
    if (!poner[clave]) return;
    var f = filaPorClave_(h, clave);
    if (f) h.getRange(f, 3, 1, 6).setValues([fila_([poner[clave], 'confirmado', b.fuente ? txt_(b.fuente, 300) : 'Sembrado en PPP 2', hoyISO_(), actor_(s), ''])]);
  });
  if (typeof m2 === 'number' && m2 > 0) {
    var fm = filaPorClave_(h, 'terreno.m2');
    if (fm) h.getRange(fm, 3, 1, 6).setValues([fila_([m2, 'por confirmar', b.fuente ? txt_(b.fuente, 300) : 'Dicho al sembrar', hoyISO_(), actor_(s), 'M02.Q01'])]);
  }
  var pq = libro.getSheetByName('Preguntas');
  ['M01.Q01', 'M01.Q02'].forEach(function (q) {
    var f = filaPorClave_(pq, q);
    if (f) pq.getRange(f, 7, 1, 5).setValues([fila_(['respondida', q === 'M01.Q01' ? nombre : txt_(b.objetivo, 500), 'Al sembrar', actor_(s), hoyISO_()])]);
  });
  bitacora_(libro, s, 'Sembró el plan desde la plantilla', 'todas', id, '', nombre, 'PPP 2', 0, rid);
  vivero_().getSheetByName('Planes').appendRow(fila_([id, nombre, copia.getId(), 'activo', hoyISO_(), actor_(s), txt_(b.caso_ppp, 40), cfg.esquema_libro || PPP2.LIBRO, '']));
  bitacoraVivero_(s, 'sembrar', id, nombre, rid, 'ok');
  CacheService.getScriptCache().remove('vivero');
  return { ok: true, hecho: 'sembrar', plan_id: id };
}

/* Para probar desde el editor: Ejecutar → prueba. No escribe nada. */
function prueba() {
  var p = planes_()[0];
  Logger.log(JSON.stringify(tarjeta_(p)));
}
