/**
 * PPP 2 · visor en vivo (archivo del mismo proyecto «PPP 2 · servidor»).
 *
 * Una liga de sólo lectura para quien NO tiene sesión del Portero (el grupo de la alianza, el dueño
 * del terreno): `?recurso=ppp2-visor&liga=…`. La liga vive en la hoja `Ligas` del vivero; se apaga
 * cambiando su estado y deja de abrir en un minuto.
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
  DATOS: ['terreno.m2', 'tierra.valor', 'lamina.m2_construidos', 'lamina.m2_vendibles', 'cob.enganche', 'din.tasa_capital', 'din.tiie',
    'din.sobretasa', 'din.apertura', 'din.caja_pct', 'din.preventa_minima', 'costo.comision']
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

/* ───────────────────────── entrada ───────────────────────── */
function visor_get_(q) {
  var l = ligaViva_(q.liga);
  if (!l) return { ok: false, error: 'liga' };
  var etiquetas = String(l.etiquetas || '').split('|').map(function (s) { return txt_(s, 40); });
  var planes = [];
  String(l.plan_id || '').split(/[,;| ]+/).forEach(function (id, i) {
    var p = id ? planPorId_(id, true) : null;
    if (p) planes.push({ p: p, etiqueta: etiquetas[i] || '' });
  });
  if (!planes.length) return { ok: false, error: 'plan' };
  var sel = planes.filter(function (x) { return x.p.plan_id === String(q.plan || ''); })[0] || planes[0];
  var p = sel.p, pedida = Number(q.v) || 0, regla = String(l.versiones == null ? '' : l.versiones);
  var llave = llaveVisor_(p);
  var firma = llave ? 'vz_' + hash_([VISOR.CACHE, llave, p.plan_id, pedida, regla, String(l.plan_id), String(l.etiquetas || '')].join('|')) : '';
  if (firma && String(q.si || '') === firma) return { ok: true, igual: true, llave: firma };
  var base = null;
  if (firma) { var hit = cacheLee_(firma); if (hit) { try { base = JSON.parse(hit); } catch (e) { base = null; } } }
  if (!base) {
    base = leeVisor_(p, libro_(p), pedida, regla);
    if (firma) cacheGuarda_(firma, JSON.stringify(base), PPP2.PLAN_S);
  }
  var d = diario_(p.plan_id);
  var out = {
    ok: true, esquema: VISOR.ESQUEMA, llave: firma, leido: ahora_(),
    menu: { plan: p.plan_id, planes: planes.map(function (x) { return { id: x.p.plan_id, etiqueta: x.etiqueta || txt_(x.p.nombre, 40) }; }) },
    a_medias: !!d.estado && d.trabajo === base.version
  };
  Object.keys(base).forEach(function (c) { out[c] = base[c]; });
  if (String(q.abre || '') === '1') { out.marcas = marcas_(config_()); apertura_(l, p, q.eq); }
  return out;
}
