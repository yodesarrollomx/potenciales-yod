/**
 * PPP 2 · visor en vivo (archivo del mismo proyecto «PPP 2 · servidor»).
 *
 * Una liga de sólo lectura para quien NO tiene sesión del Portero (el grupo de la alianza, el dueño
 * del terreno): `?recurso=ppp2-visor&liga=…`. La liga vive en la hoja `Ligas` del vivero; se apaga
 * cambiando su estado y deja de abrir en un minuto.
 *
 * Los mismos siete cuadros son la portada de la ficha del plan para quien SÍ tiene sesión
 * (`?recurso=ppp2-visor&k=…&plan=…`): ahí se ve cualquier versión viva y, quien puede editar, da y
 * apaga las ligas del plan (`ppp2-liga`, por POST).
 *
 * Reglas:
 *  - Sólo lee. Nada de lo que hay aquí escribe en un libro; lo único que escribe es un renglón en la
 *    hoja `Aperturas` del vivero cada vez que alguien abre la página (si la hoja existe).
 *  - No calcula nada financiero: entrega lo que el libro ya calculó (Resumen, Productos, Datos, el
 *    flujo de la versión, Reparto, Candados, Pruebas). Lo que la página dibuje con eso es presentación.
 *  - Enseña la versión que el libro dice que se muestra (`plan.version_mostrada`: la vigente; si no
 *    hay, la propuesta). Sólo si la liga lo pide (`versiones`) deja escoger otras.
 *  - No entrega nombres de personas, preguntas, hallazgos, consejo ni la bitácora: sólo la fecha y el
 *    texto del último cambio.
 *  - Lo leído se guarda con la misma llave que el plan (cambia en cuanto el libro cambia), así que
 *    preguntar «¿cambió?» cada pocos segundos no vuelve a leer el libro.
 *  - Una liga (o la ficha) también puede pedir la FOTO de un caso del PPP de siempre: `ppp:<caso_id>` o
 *    `ppp:<caso_id>:<escenario_id>` (pestaña PPP_VISOR, ver «fotos del PPP 1»). Se sirve su visor_json tal
 *    cual; la llave es su huella_entradas + calculado. Dirección escoge cuál versión es «la buena» (ppp2-elige).
 */
var VISOR = {
  ESQUEMA: 'ppp2-visor-v1',
  CACHE: 'visor-1',          // forma de lo guardado: si cambia lo que se lee, se sube
  LIGAS_S: 60,               // apagar una liga tarda a lo más esto en notarse
  LLAVE_S: 2,                // la pregunta «¿cambió?» de todos los que miran un plan comparte una consulta a Drive
  MARCAS_S: 21600,
  MARCA_MAX: 60000,          // bytes por logo (cabe en un valor de CacheService ya en base64)
  /* Renglones de «Flujo Vn»: [renglón esperado, cómo empieza su etiqueta]. Si la plantilla mueve un
     renglón, se busca por la etiqueta; si no aparece, esa serie no se entrega. */
  FILAS: {
    firmas: [11, /^total de unidades/], enganches: [13, /^enganches/], saldos: [14, /^saldos al escriturar/], pagos_obra: [15, /^pagos durante la obra/],
    cobranza: [16, /^cobranza total/], obra: [19, /^obra directa/], indirectos: [21, /^indirectos/], imprevistos: [22, /^imprevistos/],
    comisiones: [23, /^comisiones/], cierre: [24, /^cierre de tierra/], egresos: [25, /^egresos totales/], caja_minima: [28, /^caja m[ií]nima/],
    interes: [29, /^banco: inter[eé]s/], cap_aporta: [31, /^capital: aportaci[oó]n/], cap_acum: [32, /^capital aportado acumulado/],
    apertura: [34, /^banco: comisi[oó]n de apertura/], disposicion: [35, /^banco: disposici[oó]n/], respaldo: [37, /^respaldo: lo que faltar[ií]a/],
    pago_banco: [38, /^banco: pago/], pago_respaldo: [39, /^respaldo: pago/], pago_capital: [40, /^capital: pago/],
    saldo_banco: [41, /^saldo del banco/], saldo_capital: [42, /^saldo del capital/], saldo_respaldo: [43, /^saldo del respaldo/],
    caja: [45, /^caja del proyecto/], flujo_acum: [49, /^flujo acumulado/], ajeno: [57, /^dinero ajeno en uso/]
  },
  /* Las series que dicen hasta qué mes hay movimiento (las de saldo siguen llenas hasta el mes 60). */
  MOVIMIENTO: ['firmas', 'cobranza', 'egresos', 'interes', 'cap_aporta', 'disposicion', 'respaldo', 'pago_banco', 'pago_respaldo', 'pago_capital'],
  LIGAS_CAB: ['liga', 'plan_id', 'para', 'estado', 'vence', 'versiones', 'etiquetas', 'creada', 'nota'],
  APERTURAS_CAB: ['fecha', 'liga', 'para', 'plan_id', 'equipo'],
  DATOS: ['terreno.m2', 'tierra.valor', 'lamina.m2_construidos', 'lamina.m2_vendibles', 'cob.enganche', 'din.tasa_capital', 'din.tiie',
    'din.sobretasa', 'din.apertura', 'din.caja_pct', 'din.preventa_minima', 'costo.comision'],
  /* Fotos de casos del PPP de siempre (PPP 1): pestaña PPP_VISOR de otro libro, cuyo id llega por el renglón
     `potenciales_id` de Config. Se sirven tal cual; aquí no se calcula nada ni se abren libros del PPP 1. */
  FOTO_RE: /^ppp:([A-Za-z0-9_-]{3,64})(?::([A-Za-z0-9_-]{1,40}))?$/,
  FOTO_ESC: /^[A-Za-z0-9_-]{0,40}$/,   // escenario_id de un renglón: vacío = el caso no tiene escenarios (sus in*)
  FOTO_HOJA: 'PPP_VISOR',
  FOTO_MAX: 50000,           // caracteres de visor_json (lo más que cabe en una celda de Sheets)
  FOTO_SIRVE: 'lista',       // estado de un renglón que se sirve; `propuesta` no
  FOTO_MESES: 600,           // tope de meses por serie del flujo de una foto
  FOTO_V: /^[a-z][a-z0-9_]{0,39}$/   // claves de `v` que se aceptan de una foto
};

/* ───────────────────────── ligas ───────────────────────── */
function ligas_() {
  var cache = CacheService.getScriptCache(), hit = cache.get('ligas');
  if (hit) { try { return JSON.parse(hit); } catch (e) { } }
  var h = vivero_().getSheetByName('Ligas'), out = [];
  if (h) {
    var vals = h.getDataRange().getValues(), cab = vals[0].map(low_);
    for (var i = 1; i < vals.length; i++) {
      var o = {};
      for (var j = 0; j < cab.length; j++) if (cab[j]) o[cab[j]] = limpio_(vals[i][j]);
      if (o.liga) out.push(o);
    }
  }
  try { cache.put('ligas', JSON.stringify(out), VISOR.LIGAS_S); } catch (e) { }
  return out;
}
function ligaViva_(t) {
  t = String(t || '').trim();
  if (!/^[A-Za-z0-9_-]{24,80}$/.test(t)) return null;
  var l = ligas_().filter(function (x) { return String(x.liga) === t; })[0];
  if (!l || low_(l.estado) !== 'activa') return null;
  if (l.vence && String(l.vence).slice(0, 10) < hoyISO_()) return null;
  return l;
}
/* Qué versiones deja ver la liga: en blanco, sólo la que el libro muestra; «todas», las que calculan y no
   están descartadas; o una lista («1,2»). */
function versionesVisor_(r, regla) {
  var mostrada = Number(r['plan.version_mostrada']) || 1;
  var vivas = [1, 2, 3].filter(function (k) { return low_(r['v' + k + '.estado']) !== 'descartada' && typeof r['v' + k + '.ganancia'] === 'number'; });
  var lista;
  regla = low_(regla);
  if (!regla) lista = [mostrada];
  else if (regla === 'todas') lista = vivas;
  else lista = regla.split(/[,;| ]+/).map(Number).filter(function (k, i, a) { return vivas.indexOf(k) >= 0 && a.indexOf(k) === i; });
  if (!lista.length) lista = [mostrada];
  return { mostrada: mostrada, lista: lista };
}

/* Las ligas de un plan, para quien las administra desde la ficha: leídas de la hoja (no de la caché), con
   cuántas veces se abrió cada una. La liga completa sólo viaja a quien puede editar. */
function ligasDe_(planId) {
  var h = vivero_().getSheetByName('Ligas'), out = [];
  if (!h || h.getLastRow() < 2) return out;
  var vals = h.getDataRange().getValues(), cab = vals[0].map(low_), col = function (n) { return cab.indexOf(n); };
  var veces = {}, ultima = {}, ha = vivero_().getSheetByName('Aperturas');
  if (ha && ha.getLastRow() > 1) {
    var n = ha.getLastRow() - 1, desde = Math.max(2, n + 2 - 3000);
    ha.getRange(desde, 1, n + 2 - desde, 2).getValues().forEach(function (f) {
      var k = String(f[1]); veces[k] = (veces[k] || 0) + 1; ultima[k] = limpio_(f[0]);
    });
  }
  for (var i = 1; i < vals.length; i++) {
    var f = vals[i].map(limpio_), t = String(f[col('liga')] || ''), ids = String(f[col('plan_id')] || '').split(/[,;| ]+/);
    if (!t || ids.indexOf(planId) < 0) continue;
    var corta = t.slice(0, 6) + '…';
    out.push({ liga: t, para: txt_(f[col('para')], 80), estado: low_(f[col('estado')]), vence: f[col('vence')] || '', versiones: String(f[col('versiones')] == null ? '' : f[col('versiones')]),
      planes: ids.filter(function (x) { return x; }).length, creada: f[col('creada')] || '', aperturas: veces[corta] || 0, ultima: ultima[corta] || '' });
  }
  return out;
}
function hojaVisor_(nombre, cabecera) {
  var ss = vivero_(), h = ss.getSheetByName(nombre);
  if (!h) { h = ss.insertSheet(nombre); h.appendRow(cabecera); }
  else if (h.getLastRow() < 1) h.appendRow(cabecera);
  return h;
}
/* Dar o apagar una liga desde la ficha del plan (quien puede editar). No toca ningún libro: sólo la hoja
   `Ligas` del vivero. Varios planes en la misma liga = varios terrenos que se escogen en la pantalla. */
function liga_(s, b, rid) {
  if (!puede_(s, 'editar')) return { ok: false, error: 'permiso' };
  var p = planPorId_(b.plan);
  if (!p) return { ok: false, error: 'plan' };
  var op = String(b.op || ''), h, cache = CacheService.getScriptCache();
  if (op === 'crear') {
    var regla = low_(b.versiones).replace(/\s+/g, '');
    if (regla && regla !== 'todas' && !/^[123](,[123]){0,2}$/.test(regla)) return { ok: false, error: 'versiones' };
    var ids = [p.plan_id], etiquetas = [txt_(b.etiqueta, 40)];
    var otros = Array.isArray(b.planes) ? b.planes.slice(0, 5) : [];
    for (var i = 0; i < otros.length; i++) {
      var o = planPorId_(otros[i] && otros[i].plan);
      if (!o) return { ok: false, error: 'plan' };
      if (ids.indexOf(o.plan_id) < 0) { ids.push(o.plan_id); etiquetas.push(txt_(otros[i].etiqueta, 40)); }
    }
    var vence = /^\d{4}-\d{2}-\d{2}$/.test(String(b.vence || '')) ? String(b.vence) : '';
    var liga = (Utilities.getUuid() + Utilities.getUuid()).replace(/-/g, '').slice(0, 40);
    h = hojaVisor_('Ligas', VISOR.LIGAS_CAB);            // las hojas nacen con la primera liga
    hojaVisor_('Aperturas', VISOR.APERTURAS_CAB);
    h.appendRow(fila_([liga, ids.join(','), txt_(b.para, 80), 'activa', vence, regla, ids.length > 1 ? etiquetas.join('|') : '', hoyISO_(), txt_(b.nota, 200)]));
    cache.remove('ligas');
    bitacoraVivero_(s, 'liga-crear', p.plan_id, 'para ' + (txt_(b.para, 80) || '—') + ' · ' + liga.slice(0, 6) + '…' + (ids.length > 1 ? ' · ' + ids.length + ' planes' : ''), rid);
    return { ok: true, liga: liga, ligas: ligasDe_(p.plan_id) };
  }
  if (op === 'apagar' || op === 'activar') {
    h = vivero_().getSheetByName('Ligas');
    if (!h || h.getLastRow() < 2) return { ok: false, error: 'liga' };
    var vals = h.getDataRange().getValues(), cab = vals[0].map(low_), cl = cab.indexOf('liga'), cp = cab.indexOf('plan_id'), ce = cab.indexOf('estado');
    for (var j = 1; j < vals.length; j++) {
      if (String(vals[j][cl]) !== String(b.liga || '') || String(vals[j][cp]).split(/[,;| ]+/).indexOf(p.plan_id) < 0) continue;
      h.getRange(j + 1, ce + 1).setValue(op === 'apagar' ? 'apagada' : 'activa');
      cache.remove('ligas');
      bitacoraVivero_(s, 'liga-' + op, p.plan_id, String(b.liga).slice(0, 6) + '…', rid);
      return { ok: true, ligas: ligasDe_(p.plan_id) };
    }
    return { ok: false, error: 'liga' };
  }
  return { ok: false, error: 'op' };
}

/* ───────────────────────── lectura ───────────────────────── */
function r3v_(x) { return typeof x === 'number' && isFinite(x) ? Math.round(x * 1000) / 1000 : null; }
function r6v_(x) { return typeof x === 'number' && isFinite(x) ? Math.round(x * 1e6) / 1e6 : null; }   // razones y cifras del Resumen: sin perder el borde de una prueba
function leeVisor_(p, libro, pedida, regla) {
  var r = resumen_(libro), vs = versionesVisor_(r, regla);
  var k = vs.lista.indexOf(pedida) >= 0 ? pedida : (vs.lista.indexOf(vs.mostrada) >= 0 ? vs.mostrada : vs.lista[0]);
  var pre = 'v' + k + '.', v = {};
  Object.keys(r).forEach(function (key) {
    if (key.indexOf(pre) !== 0) return;
    var c = key.slice(pre.length);
    if (c === 'propuesta_por' || c === 'aprobada_por') return;       // nombres de personas: no salen del vivero
    v[c] = typeof r[key] === 'number' ? r6v_(r[key]) : r[key];
  });
  var datos = {};
  tabla_(libro, 'Datos', 5, 5).forEach(function (f) {
    if (VISOR.DATOS.indexOf(String(f[0])) >= 0) datos[f[0]] = { valor: typeof f[2] === 'number' ? r6v_(f[2]) : f[2], estado: f[4] };
  });
  var productos = libro.getSheetByName('Productos').getRange(5, 1, 6, 6).getValues().map(function (f) {
    f = f.map(limpio_);
    return { nombre: txt_(f[0], 60), unidades: r3v_(f[1]), m2: r3v_(f[2]), precio_m2: r3v_(f[3]), ventas: r3v_(f[4]), precio_unidad: r3v_(f[5]) };
  }).filter(function (x) { return x.nombre && (x.m2 > 0 || x.unidades > 0); });

  var flujo = { meses: 0, filas: {}, total: {} }, fl = libro.getSheetByName('Flujo V' + k);
  if (fl) {
    var bloque = fl.getRange(3, 1, 55, PPP2.MESES + 2).getValues(), n = 0;
    var etiqueta = function (i) { return low_(bloque[i] && bloque[i][0]); };
    Object.keys(VISOR.FILAS).forEach(function (c) {
      var esperado = VISOR.FILAS[c][0] - 3, re = VISOR.FILAS[c][1], i = -1;
      if (re.test(etiqueta(esperado))) i = esperado;
      else for (var j = 0; j < bloque.length && i < 0; j++) if (re.test(etiqueta(j))) i = j;
      if (i < 0) return;
      var fila = bloque[i].map(limpio_);
      flujo.total[c] = r3v_(fila[1]);
      flujo.filas[c] = fila.slice(2).map(function (x) { return r3v_(x) || 0; });
    });
    VISOR.MOVIMIENTO.forEach(function (c) {
      var s = flujo.filas[c] || [];
      for (var i = s.length - 1; i >= n; i--) if (Math.abs(s[i]) > 0.0005) { n = i + 1; break; }
    });
    n = Math.max(n, Math.min(PPP2.MESES, Number(v.mes_reparto) || 0));
    flujo.meses = n;
    Object.keys(flujo.filas).forEach(function (c) { flujo.filas[c] = flujo.filas[c].slice(0, n); });
  }

  var reparto = null, rep = libro.getSheetByName('Reparto');
  if (rep) {
    var rb = rep.getRange(4, 1, 11, 6).getValues().map(function (f) { return f.map(limpio_); }), e = Number(rb[1][1]) || 0;
    if (e >= 1 && e <= 5) reparto = {
      numero: e, esquema: txt_(rb[4][e], 80), tasa_capital: r3v_(rb[5][e]), paga_tierra: Number(rb[6][e]) === 1,
      parte_dueno: r3v_(rb[7][e]), parte_alianza: r3v_(rb[8][e]), parte_capital: r3v_(rb[9][e]), honorarios_pct: r3v_(rb[10][e])
    };
  }
  var candados = tabla_(libro, 'Candados', 5, 4).map(function (f) { return { candado: txt_(f[1], 120), estado: low_(f[3]) }; }).filter(function (c) { return c.candado; });
  var huella = String(v.huella || ''), todas = tabla_(libro, 'Pruebas', 14, 11);
  var pruebas = todas.filter(function (f) { return huella && String(f[10]) === huella && Number(f[7]) === k; }).map(function (f) {
    return { escenario: txt_(f[0], 80), cambia: txt_(f[1], 160), banco_max: r3v_(f[2]), respaldo: r3v_(f[3]), costo_dinero: r3v_(f[4]), ganancia: r3v_(f[5]), mes_reparto: r3v_(f[6]), fecha: f[8] };
  });
  var hb = libro.getSheetByName('Bitácora'), ub = hb ? hb.getLastRow() : 0, ultimo = null;
  if (ub >= 5) { var fb = hb.getRange(ub, 1, 1, 3).getValues()[0].map(limpio_); ultimo = { fecha: fb[0], accion: txt_(fb[2], 160) }; }
  var cambio = '';
  try { cambio = Utilities.formatDate(DriveApp.getFileById(p.libro_id).getLastUpdated(), PPP2.TZ, 'yyyy-MM-dd HH:mm'); } catch (x) { cambio = ''; }
  return {
    plan: {
      nombre: txt_(r['plan.nombre'] || p.nombre, 120), ubicacion: txt_(r['plan.ubicacion'], 200), tipo: txt_(r['plan.tipo'], 200),
      edad: r['plan.edad'] || '', candados_abiertos: r3v_(r['plan.candados_abiertos']), paso_texto: txt_(r['plan.paso_texto'], 200),
      esquema: txt_(r['plan.esquema'], 80), vigente: Number(r['plan.vigente']) || 0, mostrada: vs.mostrada
    },
    version: k,
    versiones: vs.lista.map(function (n) { return { n: n, nombre: txt_(r['v' + n + '.nombre'], 80), estado: low_(r['v' + n + '.estado']) }; }),
    v: v, datos: datos, productos: productos, flujo: flujo, reparto: reparto, candados: candados,
    pruebas: pruebas, pruebas_viejas: todas.length - pruebas.length, ultimo: ultimo, cambio: cambio
  };
}

/* ───────────────────────── logos del pie ─────────────────────────
   Config del vivero: `visor_marcas` (nombres separados por |) y, si se quiere el logo, `visor_logos`
   (el id en Drive de cada imagen, en el mismo orden). Sin esos renglones la página no pinta pie de marcas. */
function logo_(id) {
  var cache = CacheService.getScriptCache(), ck = 'lg_' + id, hit = null;
  try { hit = cache.get(ck); } catch (e) { }
  if (hit) return hit;
  try {
    var b = DriveApp.getFileById(id).getBlob(), tipo = String(b.getContentType() || '');
    if (!/^image\/(png|jpeg|webp|svg\+xml)$/.test(tipo)) return '';
    var bytes = b.getBytes();
    if (bytes.length > VISOR.MARCA_MAX) return '';
    var uri = 'data:' + tipo + ';base64,' + Utilities.base64Encode(bytes);
    try { cache.put(ck, uri, VISOR.MARCAS_S); } catch (e) { }
    return uri;
  } catch (e) { return ''; }
}
function marcas_(cfg) {
  var nombres = String(cfg.visor_marcas || '').split('|').map(function (s) { return txt_(s, 40); }).filter(function (s) { return s; }).slice(0, 4);
  var ids = String(cfg.visor_logos || '').split('|').map(function (s) { return s.trim(); });
  return nombres.map(function (n, i) { return { nombre: n, img: /^[A-Za-z0-9_-]{20,60}$/.test(ids[i] || '') ? logo_(ids[i]) : '' }; });
}
function apertura_(l, p, eq) {
  try {
    var h = vivero_().getSheetByName('Aperturas');
    if (h) h.appendRow(fila_([ahora_(), String(l.liga).slice(0, 6) + '…', txt_(l.para, 80), p.plan_id, txt_(eq, 40)]));
  } catch (e) { }
}

/* La llave del plan (cambia en cuanto su libro cambia), compartida un par de segundos entre todos los que
   miran: veinte teléfonos preguntando cada cinco segundos no son veinte consultas a Drive. */
function llaveVisor_(p) {
  var cache = CacheService.getScriptCache(), ck = 'vk_' + p.plan_id, hit = null;
  try { hit = cache.get(ck); } catch (e) { }
  if (hit) return hit;
  var llave = llavePlan_(p);
  if (llave) { try { cache.put(ck, llave, VISOR.LLAVE_S); } catch (e) { } }
  return llave;
}

/* ───────────────────────── fotos del PPP 1 ─────────────────────────
   Un renglón de PPP_VISOR por (caso, versión); una foto nueva de la misma versión va abajo y manda la más
   reciente: si la más reciente quedó `propuesta`, esa versión no se sirve (aunque haya una `lista` anterior,
   sus cifras ya no son las de hoy). `ppp:<caso_id>` sirve la versión `elegida` del caso (la escoge Dirección,
   ppp2-elige) con su foto más reciente; si la elegida no se puede servir, el caso no se sirve; si ninguna está
   elegida, la de mayor `orden`. `ppp:<caso_id>:<escenario_id>` sirve esa versión fija. Un caso sin escenarios
   tiene un solo renglón con `escenario_id` vacío: se sirve por `ppp:<caso_id>`. Sin el renglón `potenciales_id`,
   sin la pestaña o sin acceso, no hay fotos: el visor responde como «sin plan». */
function esFoto_(id) { return String(id || '').indexOf('ppp:') === 0; }
function hojaFotos_() {
  var id = String(config_().potenciales_id || '').trim();
  if (!/^[A-Za-z0-9_-]{20,80}$/.test(id)) return null;
  try { return SpreadsheetApp.openById(id).getSheetByName(VISOR.FOTO_HOJA); } catch (e) { return null; }
}
function siNo_(v) { return ['sí', 'si', 'x', '1', 'true', 'yes'].indexOf(low_(v)) >= 0; }
function fotoDe_(cab, f) {
  var c = function (n) { var i = cab.indexOf(n), x = i < 0 ? '' : limpio_(f[i]); return String(x == null ? '' : x).trim(); };
  return { caso: c('caso_id'), esc: c('escenario_id'), nombre: txt_(c('escenario_nombre'), 80), estado: low_(c('estado')),
    huella: c('huella_entradas'), calc: c('calculado'), orden: Number(c('orden')) || 0, elegida: siNo_(c('elegida')) };
}
function mismaFoto_(a, b) { return ['caso', 'esc', 'estado', 'huella', 'calc', 'orden'].every(function (k) { return a[k] === b[k]; }); }
/* Lee la pestaña sin visor_json cuando va al final (así nace): [cabecera, renglones]. */
function filasFotos_(h) {
  var ancho = h.getLastColumn(), cab = h.getRange(1, 1, 1, ancho).getValues()[0].map(low_), cj = cab.indexOf('visor_json'), hasta = ancho;
  if (cj >= 0 && cab.slice(cj + 1).every(function (x) { return !x; })) hasta = cj;
  return { cab: cab, filas: hasta > 0 && h.getLastRow() > 1 ? h.getRange(2, 1, h.getLastRow() - 1, hasta).getValues() : [] };
}
/* El índice de todas las fotos, en el orden de la hoja (sin visor_json ni nombres de personas), compartido unos
   segundos como la llave del plan. ppp2-elige lo borra al escribir. */
function fotos_() {
  var cache = CacheService.getScriptCache(), hit = null;
  try { hit = cache.get('vf'); } catch (e) { }
  if (hit) { try { return JSON.parse(hit); } catch (e) { } }
  var out = [], h = hojaFotos_();
  if (h && h.getLastRow() > 1) {
    var t = filasFotos_(h);
    t.filas.forEach(function (f) { var m = fotoDe_(t.cab, f); if (m.caso && VISOR.FOTO_ESC.test(m.esc) && m.estado) out.push(m); });
  }
  try { cache.put('vf', JSON.stringify(out), VISOR.LLAVE_S); } catch (e) { }
  return out;
}
/* Las versiones servibles de un caso (la foto más reciente de cada una, si está lista), por `orden`, y cuál es
   «la buena» (la que sirve `ppp:<caso>`). */
function versionesFoto_(caso) {
  var ultima = {}, claves = [], marcada = null;
  fotos_().forEach(function (f) {
    if (f.caso !== caso) return;
    if (!(('e' + f.esc) in ultima)) claves.push('e' + f.esc);
    ultima['e' + f.esc] = f;                                                  // la de más abajo manda
    if (f.elegida) marcada = f.esc;                                           // si hubiera dos marcadas, la de más abajo
  });
  var lista = claves.map(function (k) { return ultima[k]; }).filter(function (f) { return f.estado === VISOR.FOTO_SIRVE; });
  lista.sort(function (a, b) { return a.orden - b.orden; });
  var buena = null;
  if (marcada !== null) buena = lista.filter(function (f) { return f.esc === marcada; })[0] || null;
  else lista.forEach(function (f) { if (!buena || f.orden >= buena.orden) buena = f; });
  return { lista: lista, buena: buena };
}
function fotoPlan_(id) {
  id = String(id || '').trim();
  var m = VISOR.FOTO_RE.exec(id);
  if (!m) return null;
  var vs = versionesFoto_(m[1]), f = m[2] ? vs.lista.filter(function (x) { return x.esc === m[2]; })[0] : vs.buena;
  return f ? { plan_id: id, caso: m[1], nombre: f.nombre || m[1], foto: f, esBuena: f === vs.buena, buena: vs.buena ? '=' + vs.buena.esc : '' } : null;
}
/* La llave de una foto: su huella_entradas + calculado, qué versión es y cuál es la buena del caso (así cambia
   cuando Dirección cambia la elegida, también para quien mira una versión fija). */
function llaveFoto_(p) { var f = p.foto; return f.huella || f.calc ? 'pf_' + hash_([f.caso, f.esc, f.estado, f.orden, f.huella, f.calc, p.buena].join('|')) : ''; }
/* El visor_json de la foto, limpio (forma ppp2-visor-v1 más `origen`). null = como si no hubiera. */
function leeFoto_(p) {
  var h = hojaFotos_(), f = p.foto;
  if (!h || h.getLastRow() < 2) return null;
  var vals = h.getDataRange().getValues(), cab = vals[0].map(low_), cj = cab.indexOf('visor_json'), crudo = null;
  if (cj < 0) return null;
  for (var i = vals.length - 1; i >= 1 && crudo === null; i--) if (mismaFoto_(fotoDe_(cab, vals[i]), f)) crudo = vals[i][cj];
  if (typeof crudo !== 'string' || !crudo || crudo.length > VISOR.FOTO_MAX) return null;
  var o;
  try { o = JSON.parse(crudo); } catch (e) { return null; }
  if (!o || typeof o !== 'object' || Array.isArray(o)) return null;
  return fotoLimpia_(o, p);
}
/* Lo que sale de una foto: sólo las claves de la forma, cada una con su tipo (número finito, texto corto, sí/no o
   nada). Así una foto no pisa lo que arma el servidor (llave, menu, puede, elige…) ni mete marcado donde la página
   espera un número. `version`, `versiones` y «vigente» los pone el servidor: la versión servida y, si es la
   elegida, rotulada vigente (la lista completa de versiones sólo la ve quien aprueba, en `elige`). Nombres de
   personas (propuesta_por, aprobada_por) nunca salen. */
function fotoLimpia_(o, p) {
  var f = p.foto, buena = !!p.esBuena, n = f.orden >= 1 ? Math.floor(f.orden) : 1;
  var obj = function (x) { return x && typeof x === 'object' && !Array.isArray(x) ? x : {}; };
  var lista = function (x, max) { return Array.isArray(x) ? x.slice(0, max) : []; };
  var numero = function (x) { return typeof x === 'number' ? r6v_(x) : null; };
  var texto = function (x, max) { return typeof x === 'string' ? txt_(x, max) : null; };
  var valor = function (x, max) { return typeof x === 'number' ? r6v_(x) : typeof x === 'boolean' ? x : texto(x, max || 200); };
  var pl = obj(o.plan), ov = obj(o.v), v = {};
  Object.keys(ov).forEach(function (k) { if (VISOR.FOTO_V.test(k) && k !== 'propuesta_por' && k !== 'aprobada_por') v[k] = valor(ov[k]); });
  v.estado = buena ? 'vigente' : null;
  var datos = {}, od = obj(o.datos);
  VISOR.DATOS.forEach(function (k) { if (k in od) { var d = obj(od[k]); datos[k] = { valor: valor(d.valor, 80), estado: texto(d.estado, 40) }; } });
  var productos = lista(o.productos, 6).map(function (x) {
    x = obj(x);
    return { nombre: txt_(texto(x.nombre, 60), 60), unidades: numero(x.unidades), m2: numero(x.m2), precio_m2: numero(x.precio_m2), ventas: numero(x.ventas), precio_unidad: numero(x.precio_unidad) };
  }).filter(function (x) { return x.nombre; });
  var fl = obj(o.flujo), ff = obj(fl.filas), ft = obj(fl.total), filas = {}, total = {};
  Object.keys(VISOR.FILAS).forEach(function (k) {
    if (Array.isArray(ff[k])) filas[k] = ff[k].slice(0, VISOR.FOTO_MESES).map(function (x) { return numero(x) || 0; });
    if (k in ft) total[k] = numero(ft[k]);
  });
  var meses = typeof fl.meses === 'number' && isFinite(fl.meses) && fl.meses >= 0 ? Math.min(Math.floor(fl.meses), VISOR.FOTO_MESES) : null;
  var rp = o.reparto && typeof o.reparto === 'object' && !Array.isArray(o.reparto) ? o.reparto : null;
  var reparto = rp ? {
    numero: numero(rp.numero), esquema: texto(rp.esquema, 80), tasa_capital: numero(rp.tasa_capital), paga_tierra: typeof rp.paga_tierra === 'boolean' ? rp.paga_tierra : null,
    parte_dueno: numero(rp.parte_dueno), parte_alianza: numero(rp.parte_alianza), parte_capital: numero(rp.parte_capital), honorarios_pct: numero(rp.honorarios_pct)
  } : null;
  var ou = o.ultimo && typeof o.ultimo === 'object' && !Array.isArray(o.ultimo) ? o.ultimo : null;
  var origen = texto(o.origen, 300);
  if (origen && buena) origen = origen.replace(' · versión', ' · versión vigente');
  return {
    plan: {
      nombre: txt_(texto(pl.nombre, 120), 120), ubicacion: texto(pl.ubicacion, 200), tipo: texto(pl.tipo, 200), edad: texto(pl.edad, 40),
      candados_abiertos: numero(pl.candados_abiertos), paso_texto: texto(pl.paso_texto, 200), esquema: texto(pl.esquema, 80), vigente: buena ? n : null, mostrada: n
    },
    version: n,
    versiones: [{ n: n, nombre: f.nombre || txt_(texto(ov.nombre, 80), 80), estado: buena ? 'vigente' : null }],
    v: v, datos: datos, productos: productos, flujo: { meses: meses, filas: filas, total: total }, reparto: reparto,
    candados: lista(o.candados, 30).map(function (c) { c = obj(c); return { candado: txt_(texto(c.candado, 120), 120), estado: low_(texto(c.estado, 40)) }; }).filter(function (c) { return c.candado; }),
    pruebas: lista(o.pruebas, 30).map(function (x) {
      x = obj(x);
      return { escenario: txt_(texto(x.escenario, 80), 80), cambia: txt_(texto(x.cambia, 160), 160), banco_max: numero(x.banco_max), respaldo: numero(x.respaldo),
        costo_dinero: numero(x.costo_dinero), ganancia: numero(x.ganancia), mes_reparto: numero(x.mes_reparto), fecha: texto(x.fecha, 40) };
    }),
    pruebas_viejas: numero(o.pruebas_viejas),
    ultimo: ou ? { fecha: texto(ou.fecha, 40), accion: texto(ou.accion, 160) } : null,
    cambio: texto(o.cambio, 40) || f.calc || '',
    origen: origen
  };
}
/* Dirección escoge «la buena» de un caso del PPP 1 (POST tipo=ppp2-elige; doPost ya pone candado, pausa e
   idempotencia por request_id). Sólo mueve `elegida` en PPP_VISOR y anota quién y cuándo; no toca ningún libro.
   Se marca la foto más reciente de esa versión, y sólo si está lista. Elegir la que ya es la buena no escribe.
   Los planes con libro no se eligen aquí: su versión mostrada es la vigente, y cambiarla es aprobar. */
function elige_(s, b, rid) {
  if (!puede_(s, 'aprobar')) return { ok: false, error: 'permiso' };
  var m = VISOR.FOTO_RE.exec(String(b.plan || '').trim());
  if (!m) return { ok: false, error: 'plan' };
  var v = String(b.v == null ? '' : b.v).trim();
  if (!VISOR.FOTO_ESC.test(v)) return { ok: false, error: 'version' };
  var h = hojaFotos_();
  if (!h || h.getLastRow() < 2) return { ok: false, error: 'plan' };
  var t = filasFotos_(h), ce = t.cab.indexOf('elegida'), cp = t.cab.indexOf('elegida_por'), cf = t.cab.indexOf('elegida_fecha');
  if (ce < 0 || cp < 0 || cf < 0) return { ok: false, error: 'hoja' };
  var delCaso = [], destino = -1;
  t.filas.forEach(function (f, i) {
    var x = fotoDe_(t.cab, f);
    if (x.caso !== m[1] || !x.estado) return;
    delCaso.push(i);
    if (x.esc === v) destino = i;                                            // la foto más reciente de esa versión
  });
  if (!delCaso.length) return { ok: false, error: 'plan' };
  if (destino < 0) return { ok: false, error: 'version' };
  if (fotoDe_(t.cab, t.filas[destino]).estado !== VISOR.FOTO_SIRVE) return { ok: false, error: 'propuesta' };
  var otras = delCaso.filter(function (i) { return i !== destino && siNo_(t.filas[i][ce]); });
  if (otras.length || !siNo_(t.filas[destino][ce])) {
    var antes = otras.length ? String(fotoDe_(t.cab, t.filas[otras[otras.length - 1]]).esc) : '';
    otras.forEach(function (i) { h.getRange(i + 2, ce + 1).setValue(''); h.getRange(i + 2, cp + 1).setValue(''); h.getRange(i + 2, cf + 1).setValue(''); });
    h.getRange(destino + 2, ce + 1).setValue('sí');
    h.getRange(destino + 2, cp + 1).setValue(seguro_(actor_(s)));
    h.getRange(destino + 2, cf + 1).setValue(ahora_());
    SpreadsheetApp.flush();
    try { CacheService.getScriptCache().remove('vf'); } catch (e) { }
    bitacoraVivero_(s, 'visor-elige', 'ppp:' + m[1], 'versión ' + (v || '(única)') + (otras.length ? ' (antes ' + (antes || '(única)') + ')' : ''), rid);
  }
  var p = fotoPlan_('ppp:' + m[1]), llave = p ? llaveFoto_(p) : '';
  return { ok: true, llave: llave ? firmaVisor_(llave, p.plan_id, 0, '', { plan_id: p.plan_id, etiquetas: '', sesion: true }) : '' };
}
/* Para quien aprueba: todas las versiones servibles del caso y cuál es la buena (sólo planes-foto). */
function eligeDe_(p) {
  var vs = versionesFoto_(p.caso);
  return { versiones: vs.lista.map(function (f) { return { v: f.esc, nombre: f.nombre || f.esc || 'Base', buena: f === vs.buena }; }) };
}
/* La llave que ve la página: la del plan o la foto, más lo que la liga deja ver. */
function firmaVisor_(llave, planId, pedida, regla, l) {
  return 'vz_' + hash_([VISOR.CACHE, llave, planId, pedida, regla, String(l.plan_id), String(l.etiquetas || ''), l.sesion ? 's' : 'l'].join('|'));
}
function planVisor_(id) { return esFoto_(id) ? fotoPlan_(id) : planPorId_(id, true); }

/* ───────────────────────── entrada ───────────────────────── */
function visor_get_(q) {
  var l = null, s = null, planes = [];
  if (String(q.liga || '') || !String(q.k || '')) {
    l = ligaViva_(q.liga);
    if (!l) return { ok: false, error: 'liga' };
    var etiquetas = String(l.etiquetas || '').split('|').map(function (x) { return txt_(x, 40); });
    String(l.plan_id || '').split(/[,;| ]+/).forEach(function (id, i) {
      var pl = id ? planVisor_(id) : null;
      if (pl) planes.push({ p: pl, etiqueta: etiquetas[i] || '' });
    });
  } else {                                   // la ficha del plan: con la sesión del Portero, sin liga
    s = canje_(q.k);
    if (!s.ok) return { ok: false, error: s.error };
    var uno = planVisor_(q.plan);
    if (uno) planes.push({ p: uno, etiqueta: '' });
    l = { plan_id: uno ? uno.plan_id : '', etiquetas: '', versiones: 'todas', sesion: true };
  }
  if (!planes.length) return { ok: false, error: 'plan' };
  var sel = planes.filter(function (x) { return x.p.plan_id === String(q.plan || ''); })[0] || planes[0];
  var p = sel.p, foto = p.foto || null, pedida = foto ? 0 : (Number(q.v) || 0), regla = foto ? '' : String(l.versiones == null ? '' : l.versiones);
  var llave = foto ? llaveFoto_(p) : llaveVisor_(p);     // de una foto: su huella_entradas + calculado
  var firma = llave ? firmaVisor_(llave, p.plan_id, pedida, regla, l) : '';
  if (firma && String(q.si || '') === firma) return { ok: true, igual: true, llave: firma };
  var base = null;
  if (firma) { var hit = cacheLee_(firma); if (hit) { try { base = JSON.parse(hit); } catch (e) { base = null; } } }
  if (!base) {
    base = foto ? leeFoto_(p) : leeVisor_(p, libro_(p), pedida, regla);
    if (!base) return { ok: false, error: 'plan' };
    if (firma) cacheGuarda_(firma, JSON.stringify(base), PPP2.PLAN_S);
  }
  var d = foto ? { estado: '' } : diario_(p.plan_id);
  var out = {
    ok: true, esquema: VISOR.ESQUEMA, llave: firma, leido: ahora_(),
    menu: { plan: p.plan_id, planes: planes.map(function (x) { return { id: x.p.plan_id, etiqueta: x.etiqueta || txt_(x.p.nombre, 40) }; }) },
    a_medias: !!d.estado && d.trabajo === base.version
  };
  Object.keys(base).forEach(function (c) { out[c] = base[c]; });
  if (s) {
    out.puede = { compartir: !foto && puede_(s, 'editar') };   // las ligas de una foto se dan en la hoja Ligas
    if (out.puede.compartir && String(q.ligas || '') === '1') out.ligas = ligasDe_(p.plan_id);
    if (String(q.abre || '') === '1') out.marcas = marcas_(config_());
  } else if (String(q.abre || '') === '1') { out.marcas = marcas_(config_()); apertura_(l, p, q.eq); }
  // Dirección (quien puede aprobar) ve además las versiones del caso para escoger la buena; por liga, sólo si
  // trae su sesión en `k`. Una sesión que no vale aquí no estorba: el campo no sale y lo demás queda igual.
  if (foto && String(q.k || '')) {
    var sd = s || canje_(q.k);
    if (sd && sd.ok && puede_(sd, 'aprobar')) out.elige = eligeDe_(p);
  }
  return out;
}
