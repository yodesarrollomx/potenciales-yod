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
 *  - Las pestañas del visor (Historial y Archivos) tienen sus propios recursos de sólo lectura, con la misma
 *    puerta: ppp2-historial, ppp2-chat, ppp2-archivos y ppp2-archivo (ver «pestañas del visor», al final).
 */
var VISOR = {
  ESQUEMA: 'ppp2-visor-v1',
  CACHE: 'visor-2',          // forma de lo guardado: si cambia lo que se lee, se sube (visor-2: marcas `deducido` de las fotos)
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
  FOTO_DEDUCIDO: 400,        // tope de marcas «deducido de …» que se sirven de una foto
  /* Una «Propuesta de reestructura» (scripts/visor-fotos/completa.cjs) se puede ver y elegir, pero nunca es la de
     por omisión aunque tenga el mayor `orden`: su escenario_id es `reestructura` y su nombre empieza así. */
  FOTO_REESTRUCTURA: /^propuesta de reestructura/i,
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
    // Por encabezado: una columna agregada a mano (p. ej. `audiencia`, en cualquier lugar) queda en blanco y no
    // recorre las demás. Si a la hoja le falta alguna de las de siempre, se escribe en el orden de siempre.
    var valores = { liga: liga, plan_id: ids.join(','), para: txt_(b.para, 80), estado: 'activa', vence: vence, versiones: regla,
      etiquetas: ids.length > 1 ? etiquetas.join('|') : '', creada: hoyISO_(), nota: txt_(b.nota, 200) };
    var cabL = h.getRange(1, 1, 1, Math.max(1, h.getLastColumn())).getValues()[0].map(low_);
    if (VISOR.LIGAS_CAB.some(function (c) { return cabL.indexOf(c) < 0; })) cabL = VISOR.LIGAS_CAB;
    h.appendRow(fila_(cabL.map(function (c) { return Object.prototype.hasOwnProperty.call(valores, c) ? valores[c] : ''; })));
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
   elegida, la de mayor `orden` que no sea una propuesta de reestructura (ésa sólo se sirve si Dirección la elige o
   si la liga la pide fija). `ppp:<caso_id>:<escenario_id>` sirve esa versión fija. Un caso sin escenarios
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
  else lista.forEach(function (f) { if (!esReestructura_(f) && (!buena || f.orden >= buena.orden)) buena = f; });
  return { lista: lista, buena: buena };
}
function esReestructura_(f) { return low_(f.esc) === 'reestructura' || VISOR.FOTO_REESTRUCTURA.test(String(f.nombre || '')); }
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
    origen: origen,
    deducido: deducidoLimpio_(o.deducido)
  };
}
/* Las marcas de lo que el paso «completa» dedujo o corrigió (scripts/visor-fotos/completa.cjs): ruta del cuadro
   (`v.rv_margen`, `flujo.total.obra`, `productos.0.ventas`…) → «de qué sale y cómo». Sólo texto corto, sin < ni >,
   con rutas bien formadas; sin marcas, null. Sirven para que la leyenda diga «deducido de …». */
function deducidoLimpio_(x) {
  if (!x || typeof x !== 'object' || Array.isArray(x)) return null;
  var out = {}, n = 0;
  Object.keys(x).forEach(function (k) {
    var t = typeof x[k] === 'string' ? txt_(x[k].replace(/[<>]/g, ''), 240) : '';
    if (n < VISOR.FOTO_DEDUCIDO && /^[a-z][a-z0-9_]*(\.[a-z0-9_]+){1,3}$/.test(k) && k.length <= 60 && t) { out[k] = t; n++; }
  });
  return n ? out : null;
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

/* ───────────────────────── pestañas del visor: historial y archivos ─────────────────────────
   Cuatro recursos de sólo lectura, con la misma puerta que ppp2-visor (liga viva y plan dentro de la liga, o la
   sesión del Portero con `plan`, como la ficha):
     ppp2-historial  línea de tiempo por días (eventos, conversación del grupo, versiones) y pendientes abiertos
     ppp2-chat       la conversación de un día (sólo audiencia `equipo`)
     ppp2-archivos   los archivos de las carpetas de los proyectos del plan, por grupos
     ppp2-archivo    un archivo, en partes de hasta 3 MB en base64 (Docs, Hojas, Presentaciones y Dibujos de
                     Google, exportados a PDF)
   De dónde sale: la hoja de historial (su id llega por el renglón `historial_id` de Config; nunca va en el repo):
   pestañas Proyectos (proyecto_id, nombre, planes, carpeta), Eventos, Pendientes y Chat; y las carpetas de Drive de
   cada proyecto del plan (`carpeta`).
   Quién ve qué: la columna `audiencia` de la liga. `equipo` ve todo el historial (también la conversación del grupo
   y los pendientes) y todos los archivos del expediente. En blanco —o cualquier otra cosa— es `externo`: sólo los
   eventos marcados `para_externos`, nunca la conversación, eventos de WhatsApp ni pendientes, ni la fuente interna
   de un evento; y en Archivos sólo lo que cuelga de una subcarpeta «Para compartir» de la carpeta del proyecto. Lo
   marcado `solo_direccion` no sale nunca, para nadie. Con sesión del Portero (la ficha del plan) se ve como `equipo`.
   Drive: sólo con los permisos del dueño del script. Aquí no se cambia ningún permiso ni se hace nada público. Un
   archivo se entrega sólo si su cadena de carpetas sube hasta una carpeta permitida para esa liga y ese plan, y eso
   se revisa en vivo en cada pedido. Los atajos no se siguen ni se entregan. El libro de un plan, el vivero y las
   demás hojas del sistema nunca salen por aquí aunque estén en una carpeta de proyecto. La lista y el historial se
   guardan unos minutos; los bytes de los archivos, nunca. Nada de esto calcula cifras. */
var PESTANAS = {
  CACHE: 'pestanas-1',               // forma de lo guardado: si cambia lo que se lee, se sube
  ID_DRIVE: /^[A-Za-z0-9_-]{20,80}$/,
  PLAN: /^(p2[a-z0-9]{6,20}|ppp:[A-Za-z0-9_-]{3,64}(:[A-Za-z0-9_-]{1,40})?)$/,   // las mismas formas que planPorId_ y VISOR.FOTO_RE
  DIA: /^(\d{4})-(\d{2})-(\d{2})$/,
  PARTE: /^(0|[1-9][0-9]?)$/,        // las partes se cuentan desde 0
  PROYECTO: /^[a-z0-9_-]{1,64}$/,
  HIST_S: 300,                       // historial y conversación de un día: cinco minutos
  LISTA_S: 300,                      // lo que hay en las carpetas: cinco minutos
  SELLO_S: 5,                        // la última modificación de la hoja de historial se comparte unos segundos
  DIAS_MAX: 365,
  FUTURO_DIAS: 400,                  // una fecha más lejana que esto es un error de captura
  ITEMS_DIA: 60,
  ARCHIVOS_ITEM: 20,
  MENSAJES_DIA: 1000,
  PENDIENTES_MAX: 150,
  PARTE_B: 3145728,                  // 3 MB por parte
  ARCHIVO_MAX: 41943040,             // 40 MB por archivo
  LISTA_MAX: 600,                    // archivos por lista
  CARPETAS_MAX: 200,                 // carpetas que se recorren por lista
  PROFUNDIDAD: 8,                    // niveles de subcarpetas bajo la del proyecto
  SUBIR_MAX: 20,                     // niveles que se suben para saber de qué carpeta cuelga un archivo
  LISTA_MS: 20000,                   // tiempo para recorrer las carpetas; si no alcanza, la lista sale incompleta
  COMPARTIR: /^([0-9]+ )?para compartir$/,   // «Para compartir», también con número al frente («00 Para compartir»)
  /* La válvula de Dirección: una subcarpeta del expediente cuyo nombre (sin mayúsculas ni acentos) contenga
     «restringido/a» o «solo dirección», o que se llame o termine en «privado/a» («Privado», «07 Información
     privada»), no sale en el visor para nadie —tampoco para el equipo ni con la sesión de la ficha—, ni lo que
     tenga dentro, a cualquier profundidad. «Privada» al principio no cuenta: nombra desarrollos («Privada
     Residencial…»). */
  PRIVADA: /restringid[oa]s?|solo ?direccion|(?:^|\s)privad[oa]s?$/,
  CARPETA: 'application/vnd.google-apps.folder',
  ATAJO: 'application/vnd.google-apps.shortcut',
  GOOGLE: 'application/vnd.google-apps.',
  A_PDF: ['application/vnd.google-apps.document', 'application/vnd.google-apps.spreadsheet', 'application/vnd.google-apps.presentation', 'application/vnd.google-apps.drawing'],
  IMAGEN: /^image\/(png|jpeg|gif|webp)$/,
  /* Lo que ppp2-archivo entrega con su tipo: lo que un navegador no ejecuta (PDF, imagen, audio, video, Office,
     OpenDocument, zip). Lo demás —HTML, SVG, XML, scripts o un tipo desconocido— sale como
     application/octet-stream: así la página nunca lo abre como página dentro de su propio origen, donde vive la
     sesión del Portero. Los bytes son los mismos; en la lista, `tipo` sigue siendo el original. */
  PASIVO: /^(application\/pdf|image\/(png|jpeg|gif|webp|bmp|tiff|heic|heif)|video\/[a-z0-9.+-]+|audio\/[a-z0-9.+-]+|application\/(zip|x-zip-compressed|rtf|msword|vnd\.ms-[a-z0-9.+-]+|vnd\.openxmlformats-officedocument\.[a-z0-9.+-]+|vnd\.oasis\.opendocument\.[a-z0-9.+-]+|vnd\.google-earth\.kmz))$/,
  GRUPOS: ['Presentaciones', 'Propuestas', 'Modelos financieros', 'Terreno y polígonos', 'Reuniones y minutas', 'Estudios y oficios', 'Otros'],
  /* Cómo se acomoda un archivo: por la primera de sus carpetas (de arriba abajo) cuyo nombre lleva una de estas
     raíces y, si ninguna, por su propio nombre; lo demás va a Otros. Sin mayúsculas ni acentos y sin importar el
     número del frente («03 Modelo financiero»). Se prueban en este orden (el de la pantalla). Son las de las
     subcarpetas de los expedientes: «01 Terreno y legales», «02 Mercado y referencias», «03 Modelo financiero»,
     «04 Presentaciones», «05 Minutas y acuerdos», «06 Propuestas» (y «Para compartir», que no es grupo). */
  CLASES: [
    ['Presentaciones', /\bpresent/],
    ['Propuestas', /\b(propuest|cotiz)/],
    ['Modelos financieros', /\b(modelo|financ|flujo|corrida|ppp)/],
    ['Terreno y polígonos', /\b(terreno|poligon|legal|escritur|predio|kmz|plano)/],
    ['Reuniones y minutas', /\b(minuta|reuni|acuerdo|transcrip)/],
    ['Estudios y oficios', /\b(estudio|mercado|referenc|oficio|dictamen|factib)/]
  ],
  /* El `tipo` de un evento (pestaña Tipos de la hoja de historial) en los del visor. Uno que no está aquí sale
     como documento. */
  TIPOS: {
    whatsapp: 'whatsapp', comentario_whatsapp: 'whatsapp', chat: 'whatsapp', mensaje: 'whatsapp',
    reunion: 'reunion', junta: 'reunion', sesion: 'reunion', videollamada: 'reunion', meet: 'reunion',
    minuta: 'minuta', acta: 'minuta', presentacion: 'presentacion', ppp: 'presentacion',
    documento: 'documento', archivo: 'documento', decision: 'decision', acuerdo: 'decision',
    pendiente: 'pendiente', tarea: 'pendiente', chinche: 'pendiente',
    cita: 'cita', reunion_agendada: 'cita', agenda: 'cita', llamada: 'llamada', telefono: 'llamada', version: 'version'
  },
  /* Ligas de evento que no se entregan: espacios privados (documentos, carpetas y reuniones de Google —un documento
     de Drive se abre por Archivos, si está en la carpeta—, chats con asistentes, invitaciones de WhatsApp) y
     cualquier dirección que lleve una liga, una sesión o una clave. */
  SIN_URL: /(^|\.)((docs|drive|script|sheets|slides|forms|meet|mail|calendar|sites|photos|keep|chat)\.google\.com|googleusercontent\.com|claude\.ai|anthropic\.com|chatgpt\.com|openai\.com|whatsapp\.com|whatsapp\.net|wa\.me)$/,
  CON_LLAVE: /[#?&;](l|liga|sesion|k|t|token|key|clave|open)=/i
};

/* ── utilidades ── */
function hay_(o, k) { return !!o && Object.prototype.hasOwnProperty.call(o, k); }
function normaliza_(v) {
  return String(v == null ? '' : v).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, ' ').trim();
}
function clave_(v) { return normaliza_(v).replace(/ /g, '_'); }
function partes_(s) { return String(s == null ? '' : s).split(/[,;|\s]+/).filter(function (x) { return x; }); }
function siPestana_(v) { return ['si', 'x', '1', 'true', 'yes', 'verdadero'].indexOf(normaliza_(v)) >= 0; }
function noVisible_(v) { return ['no', 'n', 'false', 'falso', '0', 'oculto'].indexOf(normaliza_(v)) >= 0; }
function soloDireccion_(v) { return clave_(v) === 'solo_direccion'; }
function esFecha_(x) { return Object.prototype.toString.call(x) === '[object Date]' && !isNaN(x.getTime()); }
function diaValido_(s) {
  var m = PESTANAS.DIA.exec(String(s == null ? '' : s));
  if (!m) return false;
  var y = Number(m[1]), mo = Number(m[2]), d = Number(m[3]), t = new Date(Date.UTC(y, mo - 1, d));
  return y >= 2000 && y <= 2100 && t.getUTCFullYear() === y && t.getUTCMonth() === mo - 1 && t.getUTCDate() === d;
}
/* Una fecha de la hoja como AAAA-MM-DD (texto AAAA-MM-DD o D/M/AAAA, fecha de Sheets o número de serie); '' si no. */
function fechaISO_(x) {
  if (esFecha_(x)) x = limpio_(x);
  if (typeof x === 'number') {
    if (!(x > 20000 && x < 80000)) return '';
    var t = new Date(Math.round((x - 25569) * 86400000)).toISOString().slice(0, 10);
    return diaValido_(t) ? t : '';
  }
  var s = String(x == null ? '' : x).trim(), f = '', m = /^(\d{4})-(\d{1,2})-(\d{1,2})(?![0-9])/.exec(s);
  if (m) f = m[1] + '-' + ('0' + m[2]).slice(-2) + '-' + ('0' + m[3]).slice(-2);
  else if ((m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})(?![0-9])/.exec(s))) f = m[3] + '-' + ('0' + m[2]).slice(-2) + '-' + ('0' + m[1]).slice(-2);
  return diaValido_(f) ? f : '';
}
function horaHM_(x) {
  if (esFecha_(x)) return Utilities.formatDate(x, PPP2.TZ, 'HH:mm');
  var s = String(x == null ? '' : x).trim(), m = /^(\d{1,2}):(\d{2})(?![0-9])/.exec(s);
  if (!m) return '';
  var h = Number(m[1]), resto = s.slice(m[0].length).replace(/^:\d{2}/, '');
  if (/^\s*p\.?\s*m/i.test(resto) && h < 12) h += 12;
  else if (/^\s*a\.?\s*m/i.test(resto) && h === 12) h = 0;
  return h < 24 && Number(m[2]) < 60 ? ('0' + h).slice(-2) + ':' + m[2] : '';
}
function topeFuturo_() {
  var m = PESTANAS.DIA.exec(hoyISO_());
  var t = m ? Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])) : Date.now();
  return new Date(t + PESTANAS.FUTURO_DIAS * 86400000).toISOString().slice(0, 10);
}
/* El id de Drive de un texto: un id tal cual, o la dirección de un archivo o carpeta de Drive o Docs. */
function idDrive_(x) {
  x = String(x == null ? '' : x).trim();
  if (PESTANAS.ID_DRIVE.test(x)) return x;
  if (!/^https:\/\/(docs|drive)\.google\.com\//.test(x)) return '';
  var m = /\/(?:d|folders)\/([A-Za-z0-9_-]{20,80})(?![A-Za-z0-9_-])/.exec(x) || /[?&]id=([A-Za-z0-9_-]{20,80})(?![A-Za-z0-9_-])/.exec(x);
  return m ? m[1] : '';
}
function urlSegura_(u) {
  u = String(u == null ? '' : u).trim();
  var m = /^https:\/\/([A-Za-z0-9.-]+)(?::\d{2,5})?(?:[\/?#][^\s<>"'`\\]*)?$/.exec(u);
  if (!m || u.length > 500 || PESTANAS.CON_LLAVE.test(u)) return '';
  return PESTANAS.SIN_URL.test(m[1].toLowerCase()) ? '' : u;
}

/* ── la puerta: la misma de ppp2-visor ── */
function puertaPestana_(q) {
  var p = null, aud = 'equipo', regla = 'todas', pedido = String(q.plan == null ? '' : q.plan);
  if (String(q.liga || '') || !String(q.k || '')) {
    var l = ligaViva_(q.liga);
    if (!l) return { ok: false, error: 'liga' };
    var ids = String(l.plan_id || '').split(/[,;| ]+/).filter(function (x) { return x; });
    if (pedido && (!PESTANAS.PLAN.test(pedido) || ids.indexOf(pedido) < 0)) return { ok: false, error: 'plan' };     // sólo un plan que la liga trae
    var cand = pedido ? [pedido] : ids;
    for (var i = 0; i < cand.length && !p; i++) p = planVisor_(cand[i]);
    aud = low_(l.audiencia) === 'equipo' ? 'equipo' : 'externo';                       // en blanco (o cualquier otra cosa): externo
    regla = String(l.versiones == null ? '' : l.versiones);
  } else {                                   // la ficha del plan: con la sesión del Portero
    var s = canje_(q.k);
    if (!s.ok) return { ok: false, error: s.error };
    p = PESTANAS.PLAN.test(pedido) ? planVisor_(pedido) : null;
  }
  if (!p) return { ok: false, error: 'plan' };
  return { ok: true, p: p, foto: !!p.foto, aud: aud, regla: p.foto ? '' : regla, cfg: config_() };
}

/* ── la hoja de historial ── */
function historial_(cfg) {
  var id = String(cfg.historial_id || '').trim(), h = { id: PESTANAS.ID_DRIVE.test(id) ? id : '', sello: '', libro: undefined };
  if (h.id) h.sello = selloHistorial_(h.id);
  return h;
}
/* Su última modificación en Drive, compartida unos segundos entre quienes preguntan. */
function selloHistorial_(id) {
  var cache = CacheService.getScriptCache(), ck = 'hs_' + id, hit = null;
  try { hit = cache.get(ck); } catch (e) { }
  if (hit) return hit;
  var m = '';
  try { m = String(DriveApp.getFileById(id).getLastUpdated().getTime()); } catch (e) { return ''; }
  try { cache.put(ck, m, PESTANAS.SELLO_S); } catch (e) { }
  return m;
}
function libroHist_(h) {
  if (h.libro === undefined) {
    h.libro = null;
    if (h.id) { try { h.libro = SpreadsheetApp.openById(h.id); } catch (e) { h.libro = null; } }
  }
  return h.libro;
}
/* Una pestaña leída como se ve (texto), por encabezado: el orden de las columnas no importa. Una fecha o una hora
   se toma del texto («AAAA-MM-DD», «D/M/AAAA», «HH:MM»); si la celda guarda una fecha de Sheets con otro formato,
   del valor, en la zona horaria de la propia hoja. */
function tablaHist_(libro, nombre) {
  var hoja = null, tz = PPP2.TZ;
  try { hoja = libro ? libro.getSheetByName(nombre) : null; } catch (e) { hoja = null; }
  if (!hoja || hoja.getLastRow() < 2) return null;
  try { tz = libro.getSpreadsheetTimeZone() || PPP2.TZ; } catch (e) { tz = PPP2.TZ; }
  var rango = hoja.getDataRange(), vals = rango.getDisplayValues(), crudos = rango.getValues(), cab = vals[0].map(clave_);
  var col = function (f, n) { var i = cab.indexOf(n); return i < 0 ? '' : String(f.v[i] == null ? '' : f.v[i]).trim(); };
  var crudo = function (f, n) { var i = cab.indexOf(n); return i < 0 || !f.c ? '' : f.c[i]; };
  return {
    filas: vals.slice(1).map(function (v, k) { return { v: v, c: crudos[k + 1] }; }),
    col: col,
    fecha: function (f, n) {
      var s = fechaISO_(col(f, n)), x;
      if (s) return s;
      x = crudo(f, n);
      if (esFecha_(x)) { try { s = Utilities.formatDate(x, tz, 'yyyy-MM-dd'); } catch (e) { s = ''; } return diaValido_(s) ? s : ''; }
      return typeof x === 'number' ? fechaISO_(x) : '';
    },
    hora: function (f, n) {
      var s = horaHM_(col(f, n)), x;
      if (s) return s;
      x = crudo(f, n);
      if (esFecha_(x)) { try { return horaHM_(Utilities.formatDate(x, tz, 'HH:mm')); } catch (e) { return ''; } }
      if (typeof x === 'number' && x >= 0 && x < 1) { var m = Math.round(x * 1440) % 1440; return ('0' + Math.floor(m / 60)).slice(-2) + ':' + ('0' + (m % 60)).slice(-2); }
      return '';
    }
  };
}
function proyectosHist_(libro) {
  var t = tablaHist_(libro, 'Proyectos'), out = [];
  if (t) t.filas.forEach(function (f) {
    var id = low_(t.col(f, 'proyecto_id'));
    if (!PESTANAS.PROYECTO.test(id)) return;
    out.push({ id: id, nombre: txt_(t.col(f, 'nombre'), 120) || id, planes: partes_(t.col(f, 'planes')), carpeta: idDrive_(partes_(t.col(f, 'carpeta'))[0]) });
  });
  return out;
}
/* Un plan es de un proyecto si su `planes` lo nombra; una foto del PPP de siempre, si nombra el mismo caso. */
function mismoPlan_(a, b) {
  if (a === b) return true;
  var ma = VISOR.FOTO_RE.exec(a), mb = VISOR.FOTO_RE.exec(b);
  return !!(ma && mb && ma[1] === mb[1]);
}
function proyectosPlan_(h, planId) {
  var todos = null, cache = CacheService.getScriptCache(), ck = h.id && h.sello ? 'hp_' + hash_([PESTANAS.CACHE, h.id, h.sello].join('|')) : '';
  if (ck) { var hit = null; try { hit = cache.get(ck); } catch (e) { } if (hit) { try { todos = JSON.parse(hit); } catch (e) { todos = null; } } }
  if (!todos) {
    todos = proyectosHist_(libroHist_(h));
    if (ck) { try { cache.put(ck, JSON.stringify(todos), PESTANAS.HIST_S); } catch (e) { } }
  }
  return todos.filter(function (x) { return x.planes.some(function (t) { return mismoPlan_(t, planId); }); });
}
function raices_(proys) {
  var r = [];
  proys.forEach(function (x) { if (x.carpeta && r.indexOf(x.carpeta) < 0) r.push(x.carpeta); });
  return r;
}
/* Lo que nunca sale por aquí aunque esté en una carpeta de proyecto: los libros de los planes, el vivero y las
   hojas del sistema (historial, fotos, plantilla). */
function excluidos_(cfg) {
  var x = {};
  [cfg.historial_id, cfg.potenciales_id, cfg.plantilla_id].forEach(function (id) { id = String(id || '').trim(); if (id) x[id] = 1; });
  try { x[String(vivero_().getId())] = 1; } catch (e) { }
  try { planes_(true).forEach(function (p) { if (p.libro_id) x[String(p.libro_id)] = 1; }); } catch (e) { }
  return x;
}

/* ── las carpetas ── */
function fechaArchivo_(f) { try { return Utilities.formatDate(f.getLastUpdated(), PPP2.TZ, 'yyyy-MM-dd HH:mm'); } catch (e) { return ''; } }
/* Lo que hay en las carpetas permitidas para una audiencia: { a: {id: {n, t, f, z, r}}, o: [ids], inc }. `r` son
   las carpetas de abajo de la del proyecto (sin «Para compartir»), para acomodarlo. Se guarda unos minutos. */
function indice_(raices, aud, fuera) {
  if (!raices.length) return { a: {}, o: [], inc: false };
  var ck = 'pi_' + hash_([PESTANAS.CACHE, aud, raices.join(',')].join('|')), hit = cacheLee_(ck);
  if (hit) { try { var x = JSON.parse(hit); if (x && x.a && x.o) return x; } catch (e) { } }
  var idx = recorre_(raices, aud, fuera);
  cacheGuarda_(ck, JSON.stringify(idx), PESTANAS.LISTA_S);
  return idx;
}
function recorre_(raices, aud, fuera) {
  var t0 = Date.now(), a = {}, o = [], vistas = {}, inc = false, cola = [], carpetas = 0;
  raices.forEach(function (id) {
    try {
      var r = DriveApp.getFolderById(id);
      if (r.isTrashed()) return;
      if (aud === 'equipo') { cola.push({ c: r, ruta: [], d: 0 }); return; }
      var it = r.getFolders();                     // externo: sólo las subcarpetas «Para compartir» de la del proyecto
      while (it.hasNext()) { var c = it.next(); if (!c.isTrashed() && PESTANAS.COMPARTIR.test(normaliza_(c.getName()))) cola.push({ c: c, ruta: [], d: 1 }); }
    } catch (e) { }                                  // una carpeta que no existe o no se puede abrir: no aporta nada
  });
  while (cola.length) {
    if (o.length >= PESTANAS.LISTA_MAX || carpetas >= PESTANAS.CARPETAS_MAX || Date.now() - t0 > PESTANAS.LISTA_MS) { inc = true; break; }
    var x = cola.shift(), cid = '';
    try { cid = x.c.getId(); } catch (e) { continue; }
    if (vistas[cid]) continue;
    vistas[cid] = 1;
    carpetas++;
    try {
      var fs = x.c.getFiles();
      while (fs.hasNext()) {
        // el tiempo se cuida también dentro de una carpeta: una sola con cientos de archivos no se come el pedido
        if (o.length >= PESTANAS.LISTA_MAX || Date.now() - t0 > PESTANAS.LISTA_MS) { inc = true; break; }
        var f = fs.next(), id = String(f.getId()), tipo = String(f.getMimeType() || '');
        if (hay_(a, id) || hay_(fuera, id) || tipo === PESTANAS.ATAJO || tipo === PESTANAS.CARPETA || f.isTrashed()) continue;
        a[id] = { n: txt_(f.getName(), 200), t: tipo, f: fechaArchivo_(f), z: tipo.indexOf(PESTANAS.GOOGLE) === 0 ? null : (Number(f.getSize()) || 0), r: x.ruta };
        o.push(id);
      }
      if (x.d < PESTANAS.PROFUNDIDAD) {
        var ds = x.c.getFolders();
        while (ds.hasNext()) {
          var c = ds.next();
          if (c.isTrashed()) continue;
          var nc = String(c.getName() || '');
          if (privada_(nc)) continue;                      // una carpeta privada no se recorre: ni ella ni lo de adentro se listan
          cola.push({ c: c, ruta: x.ruta.concat([txt_(nc, 120)]), d: x.d + 1 });
        }
      }
    } catch (e) { inc = true; }
  }
  return { a: a, o: o, inc: inc };
}
/* Cómo se puede ver: 'pdf' (también lo que se exporta a PDF), 'imagen', 'descarga' o 'no' (pasa de 40 MB, o es de
   Google y no se puede exportar). */
function vistaArchivo_(tipo, z) {
  if (PESTANAS.A_PDF.indexOf(tipo) >= 0) return 'pdf';
  if (tipo.indexOf(PESTANAS.GOOGLE) === 0 || z > PESTANAS.ARCHIVO_MAX) return 'no';
  if (tipo === 'application/pdf') return 'pdf';
  return PESTANAS.IMAGEN.test(tipo) ? 'imagen' : 'descarga';
}
function claseDe_(texto) {
  var s = normaliza_(texto);
  for (var i = 0; i < PESTANAS.CLASES.length; i++) if (PESTANAS.CLASES[i][1].test(s)) return PESTANAS.CLASES[i][0];
  return '';
}
function grupoArchivo_(x) {
  for (var i = 0; i < x.r.length; i++) { var g = claseDe_(x.r[i]); if (g) return g; }
  return claseDe_(x.n) || 'Otros';                                          // el nombre lleva su extensión (.kmz)
}
function privada_(nombre) { return PESTANAS.PRIVADA.test(normaliza_(nombre)); }
/* Si un archivo cuelga, por su cadena de carpetas, de una carpeta permitida. Se sube en vivo, de padre en padre
   (los atajos no tienen padres que cuenten: el que se revisa es el archivo pedido). Externo: la carpeta de justo
   abajo de la del proyecto debe ser «Para compartir». Una cadena que pasa por una carpeta privada (PESTANAS.PRIVADA)
   entre el archivo y la del proyecto no cuenta; una privada de más arriba que la del proyecto, sí cuenta (no es del
   expediente). Cada carpeta se visita a lo más dos veces (con y sin privada abajo): así no hay ciclos. */
function cuelga_(f, raices, aud) {
  var vistos = {}, pila = [];
  try { var it = f.getParents(); while (it.hasNext()) pila.push({ c: it.next(), d: 1, hijo: null, priv: false }); } catch (e) { return false; }
  while (pila.length) {
    var x = pila.pop(), id = '';
    try { id = String(x.c.getId()); if (x.c.isTrashed()) continue; } catch (e) { continue; }
    if (raices.indexOf(id) >= 0 && !x.priv) {
      if (aud === 'equipo') return true;
      try { if (x.hijo && PESTANAS.COMPARTIR.test(normaliza_(x.hijo.getName()))) return true; } catch (e) { }
    }
    var priv = x.priv;
    if (!priv) { try { priv = privada_(x.c.getName()); } catch (e) { priv = true; } }   // un nombre que no se puede leer cuenta como privado
    var k = priv ? id + '|p' : id;
    if (vistos[k] || x.d >= PESTANAS.SUBIR_MAX) continue;
    vistos[k] = 1;
    try { var ps = x.c.getParents(); while (ps.hasNext()) pila.push({ c: ps.next(), d: x.d + 1, hijo: x.c, priv: priv }); } catch (e) { }
  }
  return false;
}
/* Un pedazo de un archivo (bytes [desde, hasta)) con la API de Drive y la credencial del dueño del script: sólo
   lee (GET) y trae sólo ese pedazo, sin cargar el archivo entero. */
function trozoDrive_(id, desde, hasta) {
  try {
    var r = UrlFetchApp.fetch('https://www.googleapis.com/drive/v3/files/' + encodeURIComponent(id) + '?alt=media&supportsAllDrives=true', {
      method: 'get', headers: { Authorization: 'Bearer ' + ScriptApp.getOAuthToken(), Range: 'bytes=' + desde + '-' + (hasta - 1) },
      muteHttpExceptions: true, followRedirects: true
    });
    var c = r.getResponseCode(), b = r.getContent();
    if (c === 200 && b.length > hasta - desde) b = b.slice(desde, hasta);   // Drive no hizo caso del rango
    else if (c !== 206 && c !== 200) return null;
    return b.length === hasta - desde ? b : null;
  } catch (e) { return null; }
}

/* ── historial ── */
function resumenPlan_(p) {
  try {
    var clave = llavePlan_(p), hit = clave ? cacheLee_(clave) : null;     // lo que ya se leyó de su libro, si no cambió
    if (hit) { var b = JSON.parse(hit); if (b && b.plan_id === p.plan_id && b.resumen) return b.resumen; }
  } catch (e) { }
  return resumen_(libro_(p));
}
/* Las versiones que la liga deja ver, con su fecha: la aprobación en el libro o, de una foto, cuándo se calculó.
   De una foto, sólo la versión servida (la lista completa sólo la ve quien aprueba, en `elige`). */
function versionesHist_(g) {
  var lista = [], items = [];
  if (g.foto) {
    var f = g.p.foto, n = f.orden >= 1 ? Math.floor(f.orden) : 1, fecha = fechaISO_(f.calc), buena = !!g.p.esBuena;
    lista.push({ v: n, nombre: f.nombre || '', fecha: fecha, estado: buena ? 'vigente' : '' });
    if (fecha) items.push({ fecha: fecha, item: { tipo: 'version', hora: horaHM_(String(f.calc || '').slice(11)), titulo: 'Versión «' + (f.nombre || n) + '»',
      resumen: 'Foto del PPP de siempre, calculada con su motor' + (buena ? '; es la que rige.' : '.'), fuente: 'PPP de siempre', archivos: [] } });
    return { lista: lista, items: items };
  }
  var r = null;
  try { r = resumenPlan_(g.p); } catch (e) { r = null; }
  if (!r) return { lista: lista, items: items };
  versionesVisor_(r, g.regla).lista.forEach(function (k) {
    var nombre = txt_(r['v' + k + '.nombre'], 80), estado = low_(r['v' + k + '.estado']), fecha = fechaISO_(r['v' + k + '.fecha_aprobacion']);
    lista.push({ v: k, nombre: nombre, fecha: fecha, estado: estado });
    if (fecha) items.push({ fecha: fecha, item: { tipo: 'version', hora: '', titulo: 'V' + k + (nombre ? ' · ' + nombre : ''),
      resumen: 'Aprobada por Dirección' + (estado === 'vigente' ? '; es la que rige.' : estado ? '; hoy está ' + estado + '.' : '.'), fuente: 'Libro del plan', archivos: [] } });
  });
  return { lista: lista, items: items };
}
function archivosDe_(ids, idx, fuera) {
  var out = [], vistos = {};
  ids.forEach(function (id) {
    if (!id || hay_(vistos, id) || hay_(fuera, id) || !hay_(idx.a, id) || out.length >= PESTANAS.ARCHIVOS_ITEM) return;
    vistos[id] = 1;
    out.push({ id: id, nombre: idx.a[id].n, tipo: idx.a[id].t });
  });
  return out;
}
/* Los adjuntos de un mensaje: nombres (separados por coma) y, en el mismo orden, sus ids de Drive cuando ya están
   subidos. El id sólo sale si el archivo está en una carpeta permitida (así se puede abrir por Archivos). */
function adjuntos_(nombres, ids, idx, fuera) {
  var ns = String(nombres == null ? '' : nombres).split(',').map(function (s) { return txt_(s, 200); }), is = partes_(ids).map(idDrive_), out = [];
  for (var i = 0; i < Math.max(ns.length, is.length) && out.length < PESTANAS.ARCHIVOS_ITEM; i++) {
    var id = is[i] && !hay_(fuera, is[i]) && hay_(idx.a, is[i]) ? is[i] : '', nombre = ns[i] || (id ? idx.a[id].n : '');
    if (!nombre) continue;
    var a = { nombre: nombre };
    if (id) a.id = id;
    out.push(a);
  }
  return out;
}
function mensaje_(ch, f, idx, fuera) {
  var texto = txt_(ch.col(f, 'texto'), 4000), adj = adjuntos_(ch.col(f, 'adjuntos'), ch.col(f, 'adjuntos_ids'), idx, fuera);
  return texto || adj.length ? { hora: ch.hora(f, 'hora'), quien: txt_(ch.col(f, 'quien'), 80), texto: texto, adjuntos: adj } : null;
}
/* Los mensajes que tocan al plan: los de sus proyectos y los generales de la alianza (`proyectos` vacío). */
function delGrupo_(texto, ids) {
  var ps = partes_(low_(texto));
  return ps.length ? (ps.some(function (x) { return ids.indexOf(x) >= 0; }) ? 'plan' : '') : 'general';
}
function enOrden_(lista, hora) {
  return lista.map(function (x, i) { return { x: x, i: i, h: hora(x) || '99:99' }; })
    .sort(function (a, b) { return a.h < b.h ? -1 : a.h > b.h ? 1 : a.i - b.i; }).map(function (o) { return o.x; });
}
/* Un día entra en la línea de tiempo si ese día hubo algo del plan: un evento que esta audiencia puede ver, un
   mensaje de uno de sus proyectos o una versión. Su `chat` cuenta además los mensajes generales de ese día. */
function leeHistorial_(g, h) {
  var equipo = g.aud === 'equipo', proys = proyectosPlan_(h, g.p.plan_id), ids = proys.map(function (x) { return x.id; });
  var fuera = excluidos_(g.cfg), idx = indice_(raices_(proys), g.aud, fuera), tope = topeFuturo_(), dias = {}, generales = {}, pendientes = [];
  var dia = function (f) { return dias[f] || (dias[f] = { fecha: f, items: [], chat: 0 }); };
  var libro = ids.length ? libroHist_(h) : null, privados = {};
  var ev = tablaHist_(libro, 'Eventos');
  if (ev) ev.filas.forEach(function (f) {
    // un evento solo_direccion no sale, y tampoco los pendientes que nacieron de él (por su evento_id)
    if (soloDireccion_(ev.col(f, 'visibilidad'))) { partes_(ev.col(f, 'evento_id')).forEach(function (x) { privados[x] = 1; }); return; }
    var fecha = ev.fecha(f, 'fecha');
    if (!fecha || fecha > tope || delGrupo_(ev.col(f, 'proyectos'), ids) !== 'plan') return;
    var tipo = tipoEvento_(ev.col(f, 'tipo'));
    if (!equipo && (!siPestana_(ev.col(f, 'para_externos')) || tipo === 'whatsapp' || tipo === 'pendiente')) return;
    var resumen = ev.col(f, 'resumen'), dec = equipo ? ev.col(f, 'decisiones') : '', url = equipo ? urlSegura_(ev.col(f, 'fuente_url')) : '';
    if (dec) resumen = (resumen ? resumen + '\n\n' : '') + 'Decisiones: ' + dec;
    var item = { tipo: tipo, hora: ev.hora(f, 'hora'), titulo: txt_(ev.col(f, 'titulo'), 200), resumen: txt_(resumen, 2000), fuente: equipo ? txt_(ev.col(f, 'fuente'), 120) : '' };
    if (url) item.url = url;
    item.archivos = archivosDe_(partes_(ev.col(f, 'archivos')).map(idDrive_).concat([idDrive_(ev.col(f, 'fuente_url'))]), idx, fuera);
    dia(fecha).items.push(item);
  });
  var ch = equipo ? tablaHist_(libro, 'Chat') : null;
  if (ch) ch.filas.forEach(function (f) {
    var fecha = ch.fecha(f, 'fecha'), de = fecha && fecha <= tope && !noVisible_(ch.col(f, 'visible')) ? delGrupo_(ch.col(f, 'proyectos'), ids) : '';
    if (!de || !mensaje_(ch, f, idx, fuera)) return;
    if (de === 'plan') dia(fecha).chat++;
    else generales[fecha] = (generales[fecha] || 0) + 1;
  });
  var pe = equipo ? tablaHist_(libro, 'Pendientes') : null;
  if (pe) pe.filas.forEach(function (f) {
    var est = normaliza_(pe.col(f, 'estado')), tarea = txt_(pe.col(f, 'tarea') || pe.col(f, 'pendiente'), 500);
    if (!tarea || est === 'hecho' || est === 'hecha' || soloDireccion_(pe.col(f, 'visibilidad')) || delGrupo_(pe.col(f, 'proyectos'), ids) !== 'plan') return;
    if (partes_(pe.col(f, 'evento_id')).some(function (x) { return hay_(privados, x); })) return;
    pendientes.push({ tarea: tarea, responsable: txt_(pe.col(f, 'responsable'), 80), compromiso: pe.fecha(f, 'fecha_compromiso') || pe.fecha(f, 'compromiso'), estado: txt_(pe.col(f, 'estado'), 40) });
  });
  var vs = versionesHist_(g);
  vs.items.forEach(function (x) { if (x.fecha <= tope) dia(x.fecha).items.push(x.item); });
  var lista = Object.keys(dias).sort().reverse().slice(0, PESTANAS.DIAS_MAX).map(function (k) {
    var d = dias[k];
    return { fecha: k, items: enOrden_(d.items, function (x) { return x.hora; }).slice(0, PESTANAS.ITEMS_DIA), chat: equipo ? d.chat + (generales[k] || 0) : 0 };
  });
  pendientes = enOrden_(pendientes, function (x) { return x.compromiso ? x.compromiso : '9999-99-99'; }).slice(0, PESTANAS.PENDIENTES_MAX);
  return { proyectos: proys.map(function (x) { return { id: x.id, nombre: x.nombre }; }), dias: lista, pendientes: pendientes, versiones: vs.lista };
}
function tipoEvento_(v) {
  var k = clave_(v);
  if (hay_(PESTANAS.TIPOS, k)) return PESTANAS.TIPOS[k];
  if (/whats/.test(k)) return 'whatsapp';            // «WhatsApp grupo», «aviso_whatsapp»…: escrito como sea, un externo nunca lo ve
  return /^reunion/.test(k) ? 'reunion' : 'documento';
}

/* ── entradas ── */
function historial_get_(q) {
  var g = puertaPestana_(q);
  if (!g.ok) return g;
  var h = historial_(g.cfg), sv = g.foto ? llaveFoto_(g.p) : llaveVisor_(g.p);
  var ck = 'ph_' + hash_([PESTANAS.CACHE, g.p.plan_id, g.aud, g.regla, h.id, h.sello, sv].join('|')), base = null, hit = cacheLee_(ck);
  if (hit) { try { base = JSON.parse(hit); } catch (e) { base = null; } }
  if (!base || !base.llave) {
    base = leeHistorial_(g, h);
    base.llave = 'vh_' + hash_(JSON.stringify(base));           // la llave es lo leído: si nada cambió, sale la misma
    cacheGuarda_(ck, JSON.stringify(base), PESTANAS.HIST_S);
  }
  if (String(q.si || '') === base.llave) return { ok: true, igual: true, llave: base.llave };
  return { ok: true, llave: base.llave, audiencia: g.aud, proyectos: base.proyectos, dias: base.dias, pendientes: base.pendientes, versiones: base.versiones };
}
function chat_get_(q) {
  var g = puertaPestana_(q);
  if (!g.ok) return g;
  if (g.aud !== 'equipo') return { ok: false, error: 'plan' };          // la conversación sólo la ve el equipo
  var d = String(q.dia || '');
  if (!diaValido_(d)) return { ok: false, error: 'plan' };
  var h = historial_(g.cfg), ck = 'pc_' + hash_([PESTANAS.CACHE, g.p.plan_id, d, h.id, h.sello].join('|')), hit = cacheLee_(ck);
  if (hit) { try { var o = JSON.parse(hit); if (o && o.ok) return o; } catch (e) { } }
  var proys = proyectosPlan_(h, g.p.plan_id), ids = proys.map(function (x) { return x.id; }), fuera = excluidos_(g.cfg), mensajes = [];
  var ch = ids.length ? tablaHist_(libroHist_(h), 'Chat') : null;
  if (ch) {
    var idx = indice_(raices_(proys), 'equipo', fuera);
    ch.filas.forEach(function (f) {
      if (noVisible_(ch.col(f, 'visible')) || ch.fecha(f, 'fecha') !== d || !delGrupo_(ch.col(f, 'proyectos'), ids)) return;
      var m = mensaje_(ch, f, idx, fuera);
      if (m) mensajes.push(m);
    });
  }
  var out = { ok: true, dia: d, mensajes: enOrden_(mensajes, function (m) { return m.hora; }).slice(0, PESTANAS.MENSAJES_DIA) };
  cacheGuarda_(ck, JSON.stringify(out), PESTANAS.HIST_S);
  return out;
}
function archivos_get_(q) {
  var g = puertaPestana_(q);
  if (!g.ok) return g;
  var fuera = excluidos_(g.cfg), idx = indice_(raices_(proyectosPlan_(historial_(g.cfg), g.p.plan_id)), g.aud, fuera), grupos = {}, out = [];
  idx.o.forEach(function (id) {
    if (hay_(fuera, id)) return;                     // la lista guardada pudo armarse antes de que ese libro se registrara
    var x = idx.a[id], n = grupoArchivo_(x);
    (grupos[n] = grupos[n] || []).push({ id: id, nombre: x.n, fecha: x.f, tipo: x.t, tamano: x.z, vista: vistaArchivo_(x.t, x.z) });
  });
  PESTANAS.GRUPOS.forEach(function (n) {
    if (!grupos[n]) return;
    out.push({ nombre: n, archivos: grupos[n].sort(function (a, b) { return a.fecha < b.fecha ? 1 : a.fecha > b.fecha ? -1 : a.nombre.localeCompare(b.nombre, 'es'); }) });
  });
  var r = { ok: true, grupos: out };
  if (idx.inc) r.incompleta = true;                                         // no se alcanzó a recorrer todo
  return r;
}
function archivo_get_(q) {
  var g = puertaPestana_(q);
  if (!g.ok) return g;
  var id = String(q.id == null ? '' : q.id), pt = String(q.parte == null || q.parte === '' ? '0' : q.parte);
  if (!PESTANAS.ID_DRIVE.test(id) || !PESTANAS.PARTE.test(pt)) return { ok: false, error: 'plan' };
  var parte = Number(pt), raices = raices_(proyectosPlan_(historial_(g.cfg), g.p.plan_id));
  if (!raices.length || hay_(excluidos_(g.cfg), id)) return { ok: false, error: 'plan' };
  var f = null, tipo = '';
  try { f = DriveApp.getFileById(id); tipo = String(f.getMimeType() || ''); if (f.isTrashed()) f = null; } catch (e) { f = null; }
  // un id ajeno, una carpeta, un atajo o algo de otra carpeta se contestan igual: como si no existiera
  if (!f || tipo === PESTANAS.CARPETA || tipo === PESTANAS.ATAJO || !cuelga_(f, raices, g.aud)) return { ok: false, error: 'plan' };
  var nombre = txt_(f.getName(), 200), bytes = null, partes = 1;
  if (PESTANAS.A_PDF.indexOf(tipo) >= 0) {                                 // de Google: se exporta a PDF en cada pedido
    try { bytes = f.getAs('application/pdf').getBytes(); } catch (e) { return { ok: false, error: 'grande' }; }
    if (bytes.length > PESTANAS.ARCHIVO_MAX) return { ok: false, error: 'grande' };
    partes = Math.max(1, Math.ceil(bytes.length / PESTANAS.PARTE_B));
    if (parte >= partes) return { ok: false, error: 'plan' };
    return { ok: true, nombre: /\.pdf$/i.test(nombre) ? nombre : nombre + '.pdf', tipo: 'application/pdf', partes: partes, parte: parte,
      datos: Utilities.base64Encode(bytes.slice(parte * PESTANAS.PARTE_B, (parte + 1) * PESTANAS.PARTE_B)) };
  }
  if (tipo.indexOf(PESTANAS.GOOGLE) === 0) return { ok: false, error: 'plan' };   // formularios, sitios…: no se pueden entregar
  var z = Number(f.getSize()) || 0;
  if (z > PESTANAS.ARCHIVO_MAX) return { ok: false, error: 'grande' };
  partes = Math.max(1, Math.ceil(z / PESTANAS.PARTE_B));
  if (parte >= partes) return { ok: false, error: 'plan' };
  bytes = partes === 1 ? f.getBlob().getBytes() : trozoDrive_(id, parte * PESTANAS.PARTE_B, Math.min(z, (parte + 1) * PESTANAS.PARTE_B));
  if (!bytes) return { ok: false, error: 'interno' };
  return { ok: true, nombre: nombre, tipo: PESTANAS.PASIVO.test(tipo) ? tipo : 'application/octet-stream', partes: partes, parte: parte, datos: Utilities.base64Encode(bytes) };
}
function pestana_get_(r, q) {
  if (r === 'ppp2-historial') return historial_get_(q);
  if (r === 'ppp2-chat') return chat_get_(q);
  if (r === 'ppp2-archivos') return archivos_get_(q);
  return archivo_get_(q);
}
