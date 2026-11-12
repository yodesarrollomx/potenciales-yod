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
  return h.getRange(fila0, 1, n, ncols).getValues().map(function (r) { return r.map(limpio_); })
    .filter(function (r) { return r.some(function (v) { return v !== '' && v !== null; }); });
}
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
  return {
    plan_id: p.plan_id, nombre: r['plan.nombre'] || p.nombre, ubicacion: r['plan.ubicacion'] || '',
    edad: r['plan.edad'] || '', para_crecer: r['plan.para_crecer'] || '',
    version: v, version_nombre: r[pre + 'nombre'] || '', version_estado: r[pre + 'estado'] || '',
    dueno_aporta: r[pre + 'dueno_aporta'], dueno_recibe: r[pre + 'dueno_recibe'], dueno_veces: r[pre + 'dueno_veces'],
    dueno_meses: r[pre + 'dueno_meses'], ganancia: r[pre + 'ganancia'], revision: r[pre + 'rv_resultado'] || '',
    candados_abiertos: r['plan.candados_abiertos'], preguntas_abiertas: r['plan.preguntas_abiertas'],
    siguiente_pregunta: r['plan.siguiente_pregunta'] || '', creado: p.creado || ''
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
  var consejo = tabla_(libro, 'Consejo', 5, 7).map(function (f) {
    return { fecha: f[0], sesion: f[1], version: f[2], juez: f[3], voto: f[4], razon: f[5], condicion: f[6] };
  });
  var pruebas = tabla_(libro, 'Pruebas', 14, 10).map(function (f) {
    return { escenario: f[0], cambia: f[1], banco_max: f[2], respaldo: f[3], costo_dinero: f[4], ganancia: f[5], mes_reparto: f[6], version: f[7], fecha: f[8], quien: f[9] };
  });
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
    candados: candados, preguntas: preguntas, hallazgos: hallazgos, consejo: consejo, pruebas: pruebas, bitacora: bit, series: series,
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
    if (low_(config_().pausa) === 'sí' || low_(config_().pausa) === 'si') return out_({ ok: false, error: 'pausa' });
    var lock = LockService.getScriptLock();
    if (!lock.tryLock(25000)) return out_({ ok: false, error: 'ocupado' });
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
  var hechos;
  switch (tipo) {
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
  bitacora_(libro, s, 'Pidió al autón que investigue', 'Preguntas', id || tema, '', 'investigando', detalle, rev, rid);
  return { ok: true, hecho: 'pedido', nota: 'El autón lo toma en su siguiente ronda y deja lo que encuentre en Hallazgos.' };
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
  var lista = b.escenario ? ESCENARIOS.filter(function (x) { return x.id === b.escenario; }) : ESCENARIOS;
  if (!lista.length) return { ok: false, error: 'escenario' };
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
  var filasLog = resultados.map(function (r) { return r.concat(['V' + k, fecha, quien]); });
  var desde = Math.max(14, pru.getLastRow() + 1);
  pru.getRange(desde, 1, filasLog.length, 10).setValues(filasLog.map(fila_));
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
    if (it.roto) { copiarPruebaSana_(mod, it.f, filas); return; }
    var r = mod.getRange(it.f, 8);
    if (it.frm) r.setFormula(it.frm); else r.setValue(it.val);
  });
}
function copiarPruebaSana_(mod, f, filas) {
  var n = mod.getLastRow(), rango = mod.getRange(1, 8, n, 1), frms = rango.getFormulas(), vis = rango.getDisplayValues(), tocadas = {};
  Object.keys(filas).forEach(function (c) { if (filas[c]) tocadas[filas[c].f] = true; });
  for (var i = 0; i < n; i++) {
    if (i + 1 === f || tocadas[i + 1]) continue;
    if (/^=INDEX\(\$E\d+:\$G\d+/i.test(frms[i][0]) && String(vis[i][0]).charAt(0) !== '#') {
      mod.getRange(i + 1, 8).copyTo(mod.getRange(f, 8), SpreadsheetApp.CopyPasteType.PASTE_FORMULA, false);
      return true;
    }
  }
  return false;
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
