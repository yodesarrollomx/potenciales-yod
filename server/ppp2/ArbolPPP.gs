/* ArbolPPP.gs — rutas del Árbol PPP dentro del servidor del PPP 2 (tercer archivo del mismo proyecto de Apps Script).
 * Propuesta ARBOLPPP (CHG-ARBOL-PPP-20261123). Reusa las ayudas de PPP2.gs: config_, puede_, pausa_, arbolEncendido_, txt_, low_, actor_, hash_, hoyISO_.
 *
 * INTERRUPTOR: todo responde 'apagado' mientras la hoja Config del vivero no tenga el renglón  arbol = sí.
 * Se configura en Config (nunca en el código): maestro_id (id del libro «PPP Maestro») y maestro_plantilla (letra de la columna plantilla; por omisión J).
 *
 *   GET  recurso = arbol-definicion          →  { ok, huella_hoja, tablas: { ARBOL_NODOS: [[encabezado], [fila]…], … }, puede: { guardar } }   (las 9 pestañas ARBOL_*; solo lectura)
 *   GET  recurso = arbol-columnas            →  { ok, columnas: [{ columna, nombre, version, escenario, estado, fecha, quien }] }   (solo las columnas que el árbol creó)
 *   GET  recurso = arbol-columna & columna=O →  { ok, columna, estado, rev, valores: [{ id, valor }] }                     (solo una columna que el árbol creó)
 *   POST tipo = arbol-guarda { k, request_id, nombre, version, escenario, columna: [{ id, valor }], columna_existente?, rev? }
 *
 * Reglas (cada una con prueba en arbol-ppp/conexion/pruebas-gs.cjs, contra un doble de Sheets):
 *   - Permisos como PPP2.gs: leer pide sesión válida; guardar exige puede_(s,'editar'). El árbol guarda SIEMPRE en «Borrador»: pedir otro estado se rechaza.
 *     Publicar cambios a las reglas (las pestañas ARBOL_*) no está aquí.
 *   - Pausa: con Config!pausa = sí no se guarda.
 *   - Candado: LockService durante toda la escritura (si está ocupado responde 'ocupado').
 *   - Idempotencia: el mismo request_id de la misma persona no escribe dos veces; el de otra persona no recibe la respuesta guardada.
 *   - Sin fórmulas nuevas: la columna nueva se copia de la plantilla del propio libro. Solo se escriben valores en renglones sin fórmula; un renglón que tiene
 *     fórmula en la plantilla no se toca aunque la petición traiga un valor (se avisa en `ignorados`).
 *   - Un texto que empieza con = + - @ ' (aunque traiga un espacio delante) se escribe como texto literal. Un número que no es finito se rechaza.
 *   - Nunca borra: no quita columnas, filas ni pestañas; sin columna libre responde 'sin_columnas'. Solo actualiza una columna que el propio árbol creó
 *     (marca «Árbol PPP» en I-06 y estado Borrador) y solo si `rev` es la de esa columna al leerla: si alguien la cambió, responde 'revision'.
 *   - Bitácora: una fila en CAMBIOS por cada guardado, también cuando la escritura queda incompleta.
 *   - Lee de vuelta lo escrito y lo compara; si algo no coincide responde 'verificacion' y dice en qué columna.
 */

var ARBOL = {
  HOJA: 'MAESTRO', CAMBIOS: 'CAMBIOS',
  PESTANAS: ['ARBOL_TIPOS', 'ARBOL_NODOS', 'ARBOL_OPCIONES', 'ARBOL_REGLAS', 'ARBOL_FACTORES', 'ARBOL_COMPONENTES', 'ARBOL_FLUJOS', 'ARBOL_LISTAS', 'ARBOL_VERSIONES'],
  PRIMER_RENGLON_IDENT: 3,   // I-01 está en el renglón 3; el encabezado (1) y el título de sección (2) no se escriben
  MAX_ITEMS: 400, MAX_TEXTO: 800, MAX_CELDA_AREAS: 1000, MAX_NUMERO: 1e15, CACHE_DEF_S: 120, CACHE_TROZO: 30000, CACHE_TROZOS_MAX: 12, IDEM_S: 600, BLOQUEO_MS: 25000,
  MARCA: 'Árbol PPP', ESTADO: 'Borrador'
};

/* ───────────── entradas (se llaman desde doGet y doPost de PPP2.gs, después de canje_) ───────────── */
function arbol_get_(s, p) {
  if (!arbolEncendido_(config_())) return { ok: false, error: 'apagado' };
  if (!puede_(s, 'leer')) return { ok: false, error: 'permiso' };
  var r = String(p.recurso || '');
  if (r === 'arbol-definicion') {
    var d = arbol_definicion_();
    if (d && d.ok) d.puede = { guardar: puede_(s, 'editar') && !pausa_(config_()) };   // depende de quién pregunta: no va en la caché
    return d;
  }
  if (r === 'arbol-columnas') return arbol_columnas_();
  if (r === 'arbol-columna') return arbol_columna_(p.columna);
  return { ok: false, error: 'recurso' };
}
function arbol_post_(s, b, rid) {
  var cfg = config_();
  if (!arbolEncendido_(cfg)) return { ok: false, error: 'apagado' };
  if (String(b.tipo) !== 'arbol-guarda') return { ok: false, error: 'tipo' };
  if (!puede_(s, 'editar')) return { ok: false, error: 'permiso' };
  if (pausa_(cfg)) return { ok: false, error: 'pausa' };
  // el recuerdo del request_id es de quien lo mandó: otra persona con el mismo id no recibe esta respuesta
  var cache = CacheService.getScriptCache(), ck = 'arbol_r_' + hash_(String(rid || '') + '|' + String(s.correo || s.nombre || ''));
  if (rid) { var prev = cache.get(ck); if (prev) return JSON.parse(prev); }
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(ARBOL.BLOQUEO_MS)) return { ok: false, error: 'ocupado' };
  var res;
  try { res = arbol_guarda_(s, b, rid); } finally { lock.releaseLock(); }
  if (rid && res && res.ok) { try { cache.put(ck, JSON.stringify(res), ARBOL.IDEM_S); } catch (e) { } }
  return res;
}

/* ───────────── 1 · leer la definición ───────────── */
function arbol_libro_() {
  var cfg = config_(), id = String(cfg.maestro_id || '').trim();
  if (!/^[A-Za-z0-9_-]{20,80}$/.test(id)) return null;
  return SpreadsheetApp.openById(id);
}
function arbol_definicion_() {
  var hit = arbol_cache_lee_('arbol_def');
  if (hit) return hit;
  var libro = arbol_libro_(); if (!libro) return { ok: false, error: 'sin_libro' };
  var tablas = {}, falta = [];
  ARBOL.PESTANAS.forEach(function (n) {
    var h = libro.getSheetByName(n); if (!h) { falta.push(n); return; }
    var v = h.getDataRange().getValues();
    tablas[n] = v.map(function (fila) { return fila.map(function (c) { return c === null || c === undefined ? '' : String(c); }); });   // texto plano, como se guardó
  });
  if (falta.length) return { ok: false, error: 'pestanas', faltan: falta };
  var out = { ok: true, tablas: tablas, huella_hoja: arbol_huella_(tablas) };
  arbol_cache_pon_('arbol_def', out);
  return out;
}
/* CacheService guarda hasta 100 KB por valor y la definición pesa más: se guarda en trozos. Si algo falla, se lee de la hoja cada vez. */
function arbol_cache_pon_(clave, obj) {
  try {
    var t = JSON.stringify(obj), n = Math.ceil(t.length / ARBOL.CACHE_TROZO), m = {};
    if (n > ARBOL.CACHE_TROZOS_MAX) return;
    for (var i = 0; i < n; i++) m[clave + '_' + i] = t.substr(i * ARBOL.CACHE_TROZO, ARBOL.CACHE_TROZO);
    m[clave + '_n'] = String(n) + '|' + t.length;
    CacheService.getScriptCache().putAll(m, ARBOL.CACHE_DEF_S);
  } catch (e) { }
}
function arbol_cache_lee_(clave) {
  try {
    var cache = CacheService.getScriptCache(), cab = cache.get(clave + '_n');
    if (!cab) return null;
    var n = Number(cab.split('|')[0]), largo = Number(cab.split('|')[1]), claves = [];
    for (var i = 0; i < n; i++) claves.push(clave + '_' + i);
    var m = cache.getAll(claves), t = '';
    for (var j = 0; j < n; j++) { if (typeof m[claves[j]] !== 'string') return null; t += m[claves[j]]; }
    if (t.length !== largo) return null;                     // un trozo caducó o es de otra versión: se vuelve a leer la hoja
    return JSON.parse(t);
  } catch (e) { return null; }
}
function arbol_huella_(tablas) {   // huella corta del contenido (no criptográfica): sirve para saber si la definición cambió
  var t = JSON.stringify(tablas), h = 5381;
  for (var i = 0; i < t.length; i++) h = ((h * 33) ^ t.charCodeAt(i)) >>> 0;
  return 'h-' + h.toString(16);
}

/* ───────────── 2 · leer las columnas que el árbol creó ───────────── */
/* Mapa id → renglón de la hoja MAESTRO (el primer renglón de cada id gana). */
function arbol_mapa_(h) {
  var ult = h.getLastRow(), ids = h.getRange(1, 1, ult, 1).getValues().map(function (r) { return String(r[0] || '').trim(); });
  var fila = {}; for (var i = ARBOL.PRIMER_RENGLON_IDENT - 1; i < ids.length; i++) if (ids[i] && !(ids[i] in fila)) fila[ids[i]] = i + 1;
  return { ult: ult, ids: ids, fila: fila };
}
function arbol_texto_(v) {
  if (v instanceof Date) return Utilities.formatDate(v, PPP2.TZ, 'yyyy-MM-dd');
  if (typeof v === 'number') return isFinite(v) ? v : '';
  return v === null || v === undefined ? '' : v;
}
/* Una columna es del árbol si su renglón I-06 lleva la marca. Las hechas a mano no se listan, no se leen por esta ruta y no se pisan. */
function arbol_esPropia_(h, m, col) {
  return ('I-06' in m.fila) && String(h.getRange(m.fila['I-06'], col).getValue()).indexOf(ARBOL.MARCA) >= 0;
}
function arbol_columnas_() {
  var libro = arbol_libro_(); if (!libro) return { ok: false, error: 'sin_libro' };
  var h = libro.getSheetByName(ARBOL.HOJA); if (!h) return { ok: false, error: 'sin_hoja' };
  var m = arbol_mapa_(h); if (!('I-06' in m.fila)) return { ok: false, error: 'sin_identidad' };
  var plantilla = arbol_letraACol_(String(config_().maestro_plantilla || 'J')), ancho = h.getLastColumn(), out = [];
  if (ancho <= plantilla) return { ok: true, columnas: out };
  var n = ancho - plantilla, lee = function (id) { return id in m.fila ? h.getRange(m.fila[id], plantilla + 1, 1, n).getValues()[0] : []; };
  var marca = lee('I-06'), nom = lee('I-01'), ver = lee('I-02'), esc = lee('I-03'), est = lee('I-04'), fec = lee('I-05');
  for (var c = 0; c < n; c++) {
    if (String(marca[c] || '').indexOf(ARBOL.MARCA) < 0) continue;
    out.push({ columna: arbol_colALetra_(plantilla + 1 + c), nombre: txt_(arbol_texto_(nom[c]), 200), version: txt_(arbol_texto_(ver[c]), 60), escenario: txt_(arbol_texto_(esc[c]), 60),
      estado: txt_(arbol_texto_(est[c]), 40), fecha: txt_(arbol_texto_(fec[c]), 20), quien: txt_(String(marca[c]).replace(ARBOL.MARCA, '').replace(/^[\s·]+/, ''), 120) });
  }
  return { ok: true, columnas: out };
}
function arbol_columna_(letra) {
  letra = String(letra || '').trim().toUpperCase();
  if (!/^[A-Z]{1,3}$/.test(letra)) return { ok: false, error: 'columna_invalida' };
  var libro = arbol_libro_(); if (!libro) return { ok: false, error: 'sin_libro' };
  var h = libro.getSheetByName(ARBOL.HOJA); if (!h) return { ok: false, error: 'sin_hoja' };
  var m = arbol_mapa_(h), col = arbol_letraACol_(letra), plantilla = arbol_letraACol_(String(config_().maestro_plantilla || 'J'));
  if (!(col > plantilla) || col > h.getLastColumn()) return { ok: false, error: 'columna_invalida' };
  if (!arbol_esPropia_(h, m, col)) return { ok: false, error: 'columna_ajena' };
  var vals = h.getRange(1, col, m.ult, 1).getValues(), forms = h.getRange(1, col, m.ult, 1).getFormulas(), valores = [];
  Object.keys(m.fila).forEach(function (id) {
    var v = arbol_texto_(vals[m.fila[id] - 1][0]);
    if (typeof v === 'string' && /^#(N\/A|REF!|VALUE!|DIV\/0!|NUM!|NAME\?|NULL!|ERROR!)/.test(v)) v = '';
    if (v !== '') valores.push({ id: id, valor: v });
  });
  return { ok: true, columna: letra, estado: txt_(arbol_texto_('I-04' in m.fila ? vals[m.fila['I-04'] - 1][0] : ''), 40), rev: arbol_rev_(vals, forms), valores: valores };
}
/* Revisión de una columna: cambia si cambia cualquier valor capturado (los renglones sin fórmula) o cualquier fórmula. No es criptográfica. */
function arbol_rev_(vals, forms) {
  var t = [], h = 5381;
  for (var i = 0; i < vals.length; i++) t.push(forms[i][0] ? 'f:' + forms[i][0] : 'v:' + String(arbol_texto_(vals[i][0])));
  var x = t.join('\n');
  for (var k = 0; k < x.length; k++) h = ((h * 33) ^ x.charCodeAt(k)) >>> 0;
  return 'r-' + h.toString(16);
}

/* ───────────── 3 · guardar un plan como columna de MAESTRO ───────────── */
function arbol_guarda_(s, b, rid) {
  if (!puede_(s, 'editar')) return { ok: false, error: 'permiso' };
  if (b.estado != null && String(b.estado).trim() !== '' && low_(b.estado) !== low_(ARBOL.ESTADO)) return { ok: false, error: 'estado' };   // el árbol solo guarda borradores
  var items = b.columna;
  if (!Array.isArray(items) || !items.length) return { ok: false, error: 'columna' };
  if (items.length > ARBOL.MAX_ITEMS) return { ok: false, error: 'demasiados' };
  var libro = arbol_libro_(); if (!libro) return { ok: false, error: 'sin_libro' };
  var h = libro.getSheetByName(ARBOL.HOJA); if (!h) return { ok: false, error: 'sin_hoja' };
  var m = arbol_mapa_(h), ult = m.ult, ids = m.ids, fila = m.fila;

  /* validar TODO antes de escribir nada */
  var vistos = {}, valores = {};
  for (var k = 0; k < items.length; k++) {
    var it = items[k] || {}, id = String(it.id || '').trim();
    if (!(id in fila)) return { ok: false, error: 'id_desconocido', id: txt_(id, 40) };
    if (vistos[id]) return { ok: false, error: 'id_repetido', id: id };
    vistos[id] = true;
    var v = it.valor;
    if (v === null || v === undefined || v === '') { valores[id] = ''; continue; }
    if (typeof v === 'number') { if (!isFinite(v) || Math.abs(v) > ARBOL.MAX_NUMERO) return { ok: false, error: 'valor', id: id }; valores[id] = v; }
    else if (typeof v === 'boolean') valores[id] = v ? 'sí' : 'no';
    else if (typeof v === 'string') {
      var tx = txt_(v, id === 'E-19' ? ARBOL.MAX_CELDA_AREAS : ARBOL.MAX_TEXTO);    // E-19 es la celda con código de las áreas propias: admite más texto
      valores[id] = /^\s*s[ií]\s*$/i.test(tx) ? 'sí' : arbol_literal_(tx);          // el libro compara con «sí» con tilde
    } else return { ok: false, error: 'valor', id: id };
  }

  /* la columna: una propia del árbol que se actualiza, o la primera libre a la derecha de la plantilla */
  var plantilla = arbol_letraACol_(String(config_().maestro_plantilla || 'J'));
  var col, nueva = false;
  if (b.columna_existente) {
    var letraPedida = String(b.columna_existente).trim().toUpperCase();
    col = /^[A-Z]{1,3}$/.test(letraPedida) ? arbol_letraACol_(letraPedida) : Number(b.columna_existente);
    if (!(col > plantilla) || col > h.getMaxColumns()) return { ok: false, error: 'columna_invalida' };
    if (!('I-04' in fila) || !('I-06' in fila)) return { ok: false, error: 'sin_identidad' };
    var est = low_(h.getRange(fila['I-04'], col).getValue());
    if (!arbol_esPropia_(h, m, col) || est !== low_(ARBOL.ESTADO)) return { ok: false, error: 'columna_ajena' };   // no se sobrescribe lo hecho a mano ni lo vigente
    var revHoy = arbol_rev_(h.getRange(1, col, ult, 1).getValues(), h.getRange(1, col, ult, 1).getFormulas());
    if (String(b.rev || '') !== revHoy) return { ok: false, error: 'revision', rev: revHoy };                      // alguien la cambió desde que se leyó: no se pisa
  } else {
    var ancho = h.getLastColumn(), libre = ancho + 1;
    for (var c = plantilla + 1; c <= ancho; c++) if (String(h.getRange(ARBOL.PRIMER_RENGLON_IDENT, c).getValue()).trim() === '' && String(h.getRange(1, c).getDisplayValue()).trim() === '') { libre = c; break; }
    if (libre > h.getMaxColumns()) return { ok: false, error: 'sin_columnas' };   // nunca se inserta ni se borra: se avisa
    col = libre; nueva = true;
  }

  var letra = arbol_colALetra_(col), cam = libro.getSheetByName(ARBOL.CAMBIOS);
  var anota = function (que, pendiente) { if (cam) cam.appendRow([hoyISO_(), actor_(s), txt_(que, 300), letra, 'Árbol PPP', txt_(pendiente || '', 300)].map(arbol_literal_)); };
  var ignorados = [], escritos = 0, formulas, leido, mal = [];
  try {
    /* copiar la plantilla (fórmulas y formato) y escribir solo valores donde no hay fórmula */
    if (nueva) h.getRange(1, plantilla, ult, 1).copyTo(h.getRange(1, col, ult, 1));
    formulas = h.getRange(1, col, ult, 1).getFormulas().map(function (r) { return r[0]; });
    var actual = h.getRange(1, col, ult, 1).getValues().map(function (r) { return r[0]; });
    var ident = { 'I-01': b.nombre || 'Árbol · plan', 'I-02': b.version || 'V1', 'I-03': b.escenario || 'ARBOL', 'I-04': ARBOL.ESTADO, 'I-06': ARBOL.MARCA + ' · ' + actor_(s), 'I-05': hoyISO_() };
    Object.keys(ident).forEach(function (id) { if (id in fila && !formulas[fila[id] - 1]) valores[id] = arbol_literal_(txt_(ident[id], 200)); });
    var bloque = [];
    for (var r = 1; r <= ult; r++) {
      var id2 = ids[r - 1], f = formulas[r - 1];
      if (f) bloque.push([f]);                                                          // fórmula: se conserva tal cual
      else if (r >= ARBOL.PRIMER_RENGLON_IDENT && id2 && id2 in valores && fila[id2] === r) { bloque.push([valores[id2]]); escritos++; }
      else bloque.push([nueva ? '' : arbol_literal_(actual[r - 1])]);                  // lo demás: como estaba (o vacío en una columna nueva); un texto «=…» ya protegido se vuelve a proteger
    }
    Object.keys(valores).forEach(function (id3) { if (formulas[fila[id3] - 1]) ignorados.push(id3); });
    h.getRange(1, col, ult, 1).setValues(bloque);

    /* leer de vuelta y comparar (valores escritos, no los de fórmulas) */
    leido = h.getRange(1, col, ult, 1).getValues().map(function (r3) { return r3[0]; });
    Object.keys(valores).forEach(function (id4) {
      if (formulas[fila[id4] - 1]) return;
      var esp = valores[id4], got = arbol_texto_(leido[fila[id4] - 1]);
      if (typeof esp === 'string' && esp.charAt(0) === "'") esp = esp.slice(1);
      if (esp === '' ? String(got) !== '' : (typeof esp === 'number' ? Math.abs(Number(got) - esp) > 1e-9 * Math.max(1, Math.abs(esp)) : String(got) !== String(esp))) mal.push(id4);
    });
  } catch (err) {
    /* la escritura se cortó: se deja dicho en la bitácora en qué columna, para que una persona la revise */
    try { anota('Escritura INCOMPLETA del Árbol PPP en la columna ' + letra + (nueva ? ' (columna nueva)' : '') + '.', 'Revisar la columna ' + letra + ': puede haber quedado a medias.'); } catch (e2) { }
    return { ok: false, error: 'incompleto', columna: letra };
  }
  anota((nueva ? 'Columna nueva' : 'Columna actualizada') + ' del Árbol PPP: ' + escritos + ' valores; fórmulas de la plantilla sin tocar.', mal.length ? 'Revisar: ' + mal.slice(0, 10).join(', ') : '');
  if (mal.length) return { ok: false, error: 'verificacion', columna: letra, no_coinciden: mal.slice(0, 20) };
  var rev = arbol_rev_(h.getRange(1, col, ult, 1).getValues(), h.getRange(1, col, ult, 1).getFormulas());
  return { ok: true, hecho: 'arbol-guarda', columna: letra, nueva: nueva, escritos: escritos, ignorados: ignorados.slice(0, 50), estado: ARBOL.ESTADO, rev: rev };
}

/* ───────────── utilidades ───────────── */
/* Un texto que empieza con = + - @ ' (aunque traiga un espacio o tabulador delante) se escribe como texto literal: el apóstrofo inicial lo hace texto y no se guarda. */
function arbol_literal_(v) { return typeof v === 'string' && /^\s*[=+\-@']/.test(v) ? "'" + v : v; }
function arbol_letraACol_(l) { var n = 0; String(l).toUpperCase().split('').forEach(function (ch) { n = n * 26 + (ch.charCodeAt(0) - 64); }); return n; }
function arbol_colALetra_(n) { var s = ''; while (n > 0) { var m = (n - 1) % 26; s = String.fromCharCode(65 + m) + s; n = Math.floor((n - 1) / 26); } return s; }
