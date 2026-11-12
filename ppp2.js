/* PPP 2 · el plan que se cultiva solo.
 *
 * Esta página sólo muestra y pide: cada cifra la calcula el libro del plan en
 * Google Sheets y llega por el servidor de PPP 2 (server/ppp2/PPP2.gs). Aquí no
 * hay motor financiero ni datos de ningún plan: todo llega con la sesión de
 * quien abre, validada por el Portero.
 *
 * Nunca borra la credencial del Portero (pyod_clave_v1): si la sesión no sirve,
 * avisa y ofrece entrar de nuevo.
 */
(function () {
  'use strict';

  var ENDPOINT = window.PPP2_ENDPOINT || 'https://script.google.com/macros/s/AKfycbywqwBh7uiD6DLmpTD6OUhzBX-AhkNxePhYgjn5Up3vAYdBzbV-2JyE7a5kKF_2QnO4/exec';
  var LLAVE = 'pyod_clave_v1';
  var RECHAZOS = ['liga', 'clave', 'expirado', 'revocado', 'sin_sesion', 'unauthorized', 'forbidden'];
  var EDADES = {
    semilla: { icono: 'ti-seedling', texto: 'Semilla', que: 'La idea con sus primeros datos.' },
    'plántula': { icono: 'ti-plant-2', texto: 'Plántula', que: 'Ya calcula una versión.' },
    'árbol': { icono: 'ti-tree', texto: 'Árbol', que: 'Versión vigente de Dirección, aprobada por el consejo de planes.' },
    flor: { icono: 'ti-flower', texto: 'Flor', que: 'Candados cerrados: listo para presentar.' },
    fruto: { icono: 'ti-apple', texto: 'Fruto', que: 'Acuerdo firmado con el dueño.' }
  };
  var ERRORES = {
    permiso: 'Tu acceso no permite este cambio.', vigente: 'La versión vigente sólo la cambia Dirección.',
    revision: 'Alguien más cambió el plan mientras lo veías; ya cargué lo más reciente.', valor: 'Ese valor no es válido para este dato.',
    respuesta: 'Escribe la respuesta antes de guardarla.', evidencia: 'Para cerrar un candado escribe la evidencia.',
    pausa: 'El servidor está en mantenimiento: sólo se puede leer.', ocupado: 'El libro está ocupado; intenta en unos segundos.',
    board: 'Tu acceso no incluye Potenciales.', portero: 'No pude validar tu sesión con el Portero; intenta de nuevo.',
    plan: 'Ese plan no existe o está archivado.', calculado: 'Ese renglón lo calcula el libro; no se captura.',
    prueba: 'Las pruebas no se anotaron: la columna Prueba del libro no volvió a su estado. Quedó en la bitácora.'
  };

  var estado = { vivero: null, plan: null, planId: '', pestana: 'versiones', version: 0, ocupado: false };
  var raiz = document.getElementById('ppp2');

  /* ───────── utilidades ───────── */
  function esc(v) {
    return String(v == null ? '' : v).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; });
  }
  function num(v) { return typeof v === 'number' && isFinite(v) ? v : null; }
  function fmt(n, dec) { return n.toLocaleString('es-MX', { minimumFractionDigits: dec, maximumFractionDigits: dec }); }
  function mdp(v) { var n = num(v); return n === null ? '—' : fmt(n, 1) + ' MDP'; }
  function mdpCorto(v) { var n = num(v); return n === null ? '—' : fmt(n, 1); }
  function pct(v) { var n = num(v); return n === null ? (v ? esc(v) : '—') : fmt(n * 100, 1) + '%'; }
  function veces(v) { var n = num(v); return n === null ? '—' : fmt(n, 2) + ' veces'; }
  function meses(v) {
    var n = num(v);
    if (n === null || n <= 0) return '—';
    return n + ' meses <span class="p2-tenue">(' + fmt(n / 12, 1) + ' años)</span>';
  }
  function valorDato(d) {
    var n = num(d.valor);
    if (d.unidad === 'MDP') return mdp(d.valor);
    if (d.unidad === '%') return pct(d.valor);
    if (d.unidad === 'm²') return n === null ? esc(d.valor || '—') : fmt(n, 2) + ' m²';
    if (d.unidad === 'mes' || d.unidad === 'meses') return n === null ? esc(d.valor || '—') : (d.unidad === 'mes' ? 'mes ' + n : n + ' meses');
    return esc(d.valor || '—');
  }
  function claseEstado(e) {
    return { confirmado: 'verde', respondida: 'verde', cerrado: 'verde', vigente: 'verde', aceptado: 'verde', aprueba: 'verde',
      'en conflicto': 'rojo', falta: 'rojo', abierto: 'rojo', descartada: 'gris', descartado: 'gris', veto: 'rojo', regresa: 'rojo',
      propuesta: 'azul', investigando: 'azul', 'en revisión': 'azul', 'no aplica': 'gris', base: 'gris', alterna: 'gris' }[e] || '';
  }
  function chip(texto, clase) { return texto ? '<span class="p2-chip ' + (clase || claseEstado(texto)) + '">' + esc(texto) + '</span>' : ''; }
  function edad(e) {
    var x = EDADES[e] || EDADES.semilla;
    return '<span class="p2-edad" title="' + esc(x.que) + '"><i class="ti ' + x.icono + '" aria-hidden="true"></i>' + x.texto + '</span>';
  }
  function token() { try { return localStorage.getItem(LLAVE) || ''; } catch (e) { return ''; } }
  function rid() { return 'p2-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 8); }
  var toastT = 0;
  function toast(t, fijo) {
    var el = document.getElementById('p2Toast');
    if (!el) return;
    el.textContent = t; el.hidden = false;
    clearTimeout(toastT);
    if (!fijo) toastT = setTimeout(function () { el.hidden = true; }, 4200);
  }
  function configurado() { return !/\/PENDIENTE\//.test(ENDPOINT); }

  /* ───────── red ───────── */
  function conTiempo(promesa, ms) {
    return new Promise(function (ok, mal) {
      var t = setTimeout(function () { mal(new Error('tiempo')); }, ms);
      promesa.then(function (r) { clearTimeout(t); ok(r); }, function (e) { clearTimeout(t); mal(e); });
    });
  }
  function leer(recurso, extra) {
    var q = '?recurso=' + encodeURIComponent(recurso) + '&k=' + encodeURIComponent(token());
    Object.keys(extra || {}).forEach(function (k) { q += '&' + k + '=' + encodeURIComponent(extra[k]); });
    return conTiempo(fetch(ENDPOINT + q, { credentials: 'omit', redirect: 'follow' }), 45000).then(function (r) { return r.json(); });
  }
  function escribir(cuerpo, ms) {
    cuerpo.k = token();
    cuerpo.request_id = cuerpo.request_id || rid();
    return conTiempo(fetch(ENDPOINT, { method: 'POST', credentials: 'omit', redirect: 'follow', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify(cuerpo) }), ms || 60000)
      .then(function (r) { return r.json(); });
  }

  /* ───────── arranque y rutas ───────── */
  function ruta() {
    var h = (location.hash || '').replace(/^#\/?/, '').split('/');
    if (h[0] === 'plan' && /^p2[a-z0-9]{6,20}$/.test(h[1] || '')) {
      var cambio = estado.planId !== h[1];
      estado.planId = h[1];
      estado.pestana = ['versiones', 'preguntas', 'auton', 'bitacora'].indexOf(h[2]) >= 0 ? h[2] : 'versiones';
      if (cambio || !estado.plan) { estado.plan = null; estado.version = 0; cargarPlan(); } else pintarPlan();
    } else {
      estado.planId = ''; estado.plan = null;
      if (estado.vivero) pintarVivero(); else cargarVivero();
    }
  }
  function cargando(texto) {
    raiz.innerHTML = '<div class="p2-cargando"><span class="p2-semilla" aria-hidden="true"><i class="ti ti-seedling"></i></span><p>' + esc(texto) + '</p></div>';
  }
  function fallo(r) {
    var e = (r && r.error) || 'red';
    if (RECHAZOS.indexOf(e) >= 0) {
      raiz.innerHTML = '<div class="p2-error"><h2>Tu sesión ya no sirve aquí</h2><p>Entra de nuevo con tu correo de YOD y vuelve a abrir PPP 2.</p>' +
        '<button class="p2-btn oro" data-accion="entrar">Entrar con mi correo</button></div>';
      return;
    }
    raiz.innerHTML = '<div class="p2-error"><h2>No pude abrir PPP 2</h2><p>' + esc(ERRORES[e] || 'El servidor no respondió. Revisa tu conexión e intenta de nuevo.') + '</p>' +
      '<button class="p2-btn" data-accion="reintentar">Intentar de nuevo</button></div>';
  }
  function sinSesion() {
    raiz.innerHTML = '<div class="p2-error"><h2>Entra para ver el vivero</h2><p>PPP 2 usa tu sesión de YOD. Entra con tu correo y la página se abre sola.</p>' +
      '<button class="p2-btn oro" data-accion="entrar">Entrar con mi correo</button></div>';
  }
  function cargarVivero() {
    if (!configurado()) { raiz.innerHTML = '<div class="p2-error"><h2>El servidor de PPP 2 aún no está instalado</h2><p>La página está lista; falta publicar su servidor.</p></div>'; return; }
    if (!token()) { sinSesion(); return; }
    cargando('Abriendo el vivero…');
    leer('ppp2-vivero').then(function (r) {
      if (!r || !r.ok) return fallo(r);
      estado.vivero = r; pintarVivero();
    }, function () { fallo({ error: 'red' }); });
  }
  function cargarPlan(silencioso) {
    if (!configurado()) { cargarVivero(); return; }
    if (!token()) { sinSesion(); return; }
    if (!silencioso) cargando('Abriendo el plan…');
    return leer('ppp2-plan', { plan: estado.planId }).then(function (r) {
      if (!r || !r.ok) return fallo(r);
      estado.plan = r;
      if (!estado.version) estado.version = Number(r.resumen['plan.version_mostrada']) || 1;
      pintarPlan();
    }, function () { fallo({ error: 'red' }); });
  }

  /* ───────── vivero ───────── */
  function frase(p) {
    if (num(p.dueno_recibe) === null) return '<span class="p2-tenue">Todavía no calcula: faltan datos.</span>';
    return 'El dueño aporta ' + mdp(p.dueno_aporta) + ' de tierra y recibe <b>' + mdpCorto(p.dueno_recibe) + ' MDP</b> · ' + veces(p.dueno_veces) +
      ' su tierra · en ' + meses(p.dueno_meses);
  }
  function pintarVivero() {
    var v = estado.vivero, puede = v.puede || {};
    var tarjetas = (v.planes || []).map(function (p) {
      if (p.error) return '<div class="p2-tarjeta"><h2>' + esc(p.nombre) + '</h2><p class="p2-tenue">No pude leer su libro.</p></div>';
      return '<a class="p2-tarjeta" href="#/plan/' + esc(p.plan_id) + '">' +
        '<div style="display:flex;justify-content:space-between;gap:10px;align-items:center">' + edad(p.edad) + chip('V' + p.version + ' · ' + (p.version_estado || ''), claseEstado(p.version_estado)) + '</div>' +
        '<h2>' + esc(p.nombre) + '</h2><div class="p2-tenue p2-chico">' + esc(p.ubicacion) + '</div>' +
        '<div class="p2-radiografia"><div class="p2-sobre">Lo que recibe el dueño</div>' +
        (num(p.dueno_recibe) === null ? '<span class="p2-tenue">Todavía no calcula.</span>' :
          '<b>' + mdpCorto(p.dueno_recibe) + ' MDP</b> <span class="p2-tenue">en ' + (num(p.dueno_meses) || '—') + ' meses · ' + veces(p.dueno_veces) + ' su tierra</span>') + '</div>' +
        '<div class="p2-chico"><b>Para crecer:</b> ' + esc(p.para_crecer || '—') + '</div>' +
        (p.siguiente_pregunta ? '<div class="p2-chico"><b>Siguiente pregunta:</b> ' + esc(p.siguiente_pregunta) + '</div>' : '') +
        '<div class="p2-pie">' + chip(p.revision || 'sin revisión', /^Pasa/.test(p.revision || '') ? 'verde' : (/^No/.test(p.revision || '') ? 'rojo' : 'gris')) +
        chip((p.candados_abiertos || 0) + ' candados abiertos', p.candados_abiertos ? 'rojo' : 'verde') + chip((p.preguntas_abiertas || 0) + ' preguntas abiertas', 'gris') + '</div></a>';
    }).join('');
    raiz.innerHTML =
      '<div class="p2-cabeza"><div><div class="p2-sobre">Plan de Potencial 2</div><h1>El vivero</h1>' +
      '<p class="p2-intro">Cada plan nace como semilla y crece con cada dato que se confirma. El plan mismo investiga, pregunta lo que más mueve el resultado y propone versiones; Dirección decide cuál queda vigente.</p></div>' +
      (puede.editar ? '<button class="p2-btn oro" data-accion="sembrar"><i class="ti ti-seedling"></i> Sembrar un plan</button>' : '') + '</div>' +
      (tarjetas ? '<div class="p2-rejilla">' + tarjetas + '</div>' : '<div class="p2-vacio">Todavía no hay planes en el vivero.</div>') +
      '<p class="p2-tenue p2-chico" style="margin-top:24px">El PPP actual sigue igual en Potenciales; PPP 2 vive aparte y no lo toca.</p>';
  }
  function dialogoSembrar() {
    abrirDialogo('<h2>Sembrar un plan</h2><p class="p2-tenue">Con estos datos nace la semilla. Lo demás lo va preguntando el plan.</p>' +
      '<form class="p2-form" data-form="sembrar">' +
      '<label>Nombre del plan<input name="nombre" required minlength="3" maxlength="80" autocomplete="off"></label>' +
      '<label>Ubicación<input name="ubicacion" maxlength="300"></label>' +
      '<label>Tipo de proyecto<input name="tipo" maxlength="200" placeholder="Vertical, lotes, casas, mixto…"></label>' +
      '<label>Qué se quiere conseguir<textarea name="objetivo" maxlength="500" rows="3"></textarea></label>' +
      '<label>Superficie del terreno (m²)<input name="terreno_m2" inputmode="decimal"></label>' +
      '<div class="p2-acciones"><button class="p2-btn oro" type="submit">Sembrar</button><button class="p2-btn suave" type="button" data-accion="cerrar">Cancelar</button></div></form>');
  }

  /* ───────── plan ───────── */
  function ver(k) { return (estado.plan.versiones || [])[(k || estado.version) - 1] || {}; }
  function pintarPlan() {
    var p = estado.plan, r = p.resumen || {}, v = ver(), puede = p.puede || {};
    var vers = (p.versiones || []).map(function (x) {
      return '<button class="p2-vbtn" data-accion="version" data-v="' + x.numero + '" aria-pressed="' + (x.numero === estado.version) + '">' +
        '<b>V' + x.numero + ' · ' + esc(x.nombre || '') + '</b><span>' + esc(x.estado || '') + (num(x.dueno_recibe) !== null ? ' · dueño ' + mdpCorto(x.dueno_recibe) + ' MDP' : '') + '</span></button>';
    }).join('');
    var aviso = '';
    if (v.estado === 'propuesta') aviso = '<div class="p2-aviso">' + chip('Propuesta', 'azul') + '<span>Falta que Dirección la apruebe para que quede vigente.</span>' +
      (puede.aprobar ? '<button class="p2-btn verde" data-accion="aprobar" data-v="' + estado.version + '"><i class="ti ti-check"></i> Aprobar esta versión</button>' : '') + '</div>';
    else if (v.estado === 'vigente') aviso = '<div class="p2-aviso">' + chip('Vigente', 'verde') + '<span>Aprobada por ' + esc(v.aprobada_por || '—') + (v.fecha_aprobacion ? ' el ' + esc(v.fecha_aprobacion) : '') + '.</span></div>';
    else if (puede.aprobar && v.estado !== 'descartada') aviso = '<div class="p2-aviso">' + chip(v.estado || '', claseEstado(v.estado)) +
      '<button class="p2-btn" data-accion="aprobar" data-v="' + estado.version + '"><i class="ti ti-check"></i> Volver vigente esta versión</button></div>';
    var rv = v.rv_resultado || '';
    raiz.innerHTML =
      '<div class="p2-migas"><a href="#/">Vivero</a><i class="ti ti-chevron-right"></i><span>' + esc(r['plan.nombre'] || '') + '</span></div>' +
      '<div class="p2-cabeza"><div><h1>' + esc(r['plan.nombre'] || 'Plan') + '</h1><div class="p2-lugar">' + esc(r['plan.ubicacion'] || '') + '</div>' +
      '<div class="p2-crecer">' + edad(r['plan.edad']) + '<span class="p2-tenue"><b>Para crecer falta:</b> ' + esc(r['plan.para_crecer'] || '—') + '</span></div></div>' +
      (p.libro_url ? '<a class="p2-btn suave" href="' + esc(p.libro_url) + '" target="_blank" rel="noopener"><i class="ti ti-table"></i> Abrir el libro</a>' : '') + '</div>' +
      '<div class="p2-versiones" role="group" aria-label="Versiones">' + vers + '</div>' +
      '<section class="p2-heroe" aria-label="Lo que recibe el dueño">' +
      '<div class="p2-recibe"><div class="p2-sobre">Lo que recibe el dueño · V' + estado.version + '</div>' +
      (num(v.dueno_recibe) === null ? '<p class="p2-cifra">—</p><p class="p2-frase">Esta versión todavía no calcula: faltan datos.</p>' :
        '<p class="p2-cifra">' + mdpCorto(v.dueno_recibe) + '<small>MDP</small></p>' +
        '<p class="p2-frase">Aporta su tierra (' + mdp(v.dueno_aporta) + ') y recibe <b>' + veces(v.dueno_veces) + '</b> su valor, en <b>' + meses(v.dueno_meses) + '</b>, con el esquema ' + esc(r['plan.esquema'] || '') + '.</p>') +
      aviso + '</div>' +
      '<div class="p2-claves">' +
      clave('Ganancia real', mdp(v.ganancia), 'ya pagada la tierra, antes de impuestos') +
      clave('Dinero ajeno máximo', mdp(v.max_ajeno), 'capital ' + mdpCorto(v.capital) + ' · banco ' + mdpCorto(v.banco_max)) +
      clave('Ventas', mdp(v.ventas), 'costo sin tierra ' + mdpCorto(v.costo_sin_tierra)) +
      clave('Revisión para fondos', esc(rv || '—'), 'lo que revisa un comité de crédito', /^Pasa/.test(rv) ? 'ok' : (/^No/.test(rv) ? 'mal' : '')) +
      '</div></section>' +
      grafica() +
      '<nav class="p2-pestanas" aria-label="Secciones del plan">' +
      pest('versiones', 'Versiones y reparto') + pest('preguntas', 'Preguntas y evidencia') + pest('auton', 'El autón') + pest('bitacora', 'Bitácora') + '</nav>' +
      '<div id="p2Pestana">' + ({ versiones: pVersiones, preguntas: pPreguntas, auton: pAuton, bitacora: pBitacora }[estado.pestana] || pVersiones)() + '</div>';
  }
  function clave(t, cifra, sub, clase) {
    return '<div class="p2-clave ' + (clase || '') + '"><div class="p2-sobre">' + esc(t) + '</div><span class="p2-cifra">' + cifra + '</span><span class="p2-tenue p2-chico">' + esc(sub || '') + '</span></div>';
  }
  function pest(id, texto) {
    return '<a href="#/plan/' + esc(estado.planId) + '/' + id + '"' + (estado.pestana === id ? ' aria-current="page"' : '') + '>' + esc(texto) + '</a>';
  }

  /* gráfica: dinero ajeno en uso y caja del proyecto, mes a mes */
  function grafica() {
    var s = ((estado.plan.series || {})[estado.version]) || null, v = ver();
    if (!s || !s.ajeno) return '';
    var ult = 1;
    for (var i = 0; i < s.mes.length; i++) if (Math.abs(s.ajeno[i]) > 0.01 || Math.abs(s.cobranza[i]) > 0.01 || Math.abs(s.egresos[i]) > 0.01) ult = i + 1;
    ult = Math.min(s.mes.length, ult + 2);
    var ancho = (raiz && raiz.clientWidth) || 760;
    var A = Math.max(340, Math.min(760, ancho - 40)), H = A < 520 ? 210 : 230, iz = 40, de = 10, ar = 16, ab = 30;
    var max = 1;
    for (var j = 0; j < ult; j++) max = Math.max(max, s.ajeno[j], s.caja[j]);
    max = Math.ceil(max / 50) * 50;
    var x = function (m) { return iz + (A - iz - de) * (m - 0.5) / ult; };
    var y = function (val) { return ar + (H - ar - ab) * (1 - val / max); };
    var area = 'M' + x(1) + ',' + y(0);
    var linea = '';
    for (var m = 1; m <= ult; m++) {
      area += ' L' + x(m).toFixed(1) + ',' + y(Math.max(0, s.ajeno[m - 1])).toFixed(1);
      linea += (m === 1 ? 'M' : ' L') + x(m).toFixed(1) + ',' + y(Math.max(0, s.caja[m - 1])).toFixed(1);
    }
    area += ' L' + x(ult) + ',' + y(0) + ' Z';
    var rejilla = '';
    for (var k = 0; k <= 4; k++) {
      var val = max * k / 4;
      rejilla += '<line x1="' + iz + '" x2="' + (A - de) + '" y1="' + y(val) + '" y2="' + y(val) + '" stroke="#e1dacb" stroke-width="1"/>' +
        '<text x="' + (iz - 6) + '" y="' + (y(val) + 4) + '" text-anchor="end" font-size="11" fill="#766f62">' + Math.round(val) + '</text>';
    }
    var marcas = '', fila = 0;
    [[num(v.obra_inicio), 'obra'], [num(v.fin_obra), 'fin de obra'], [num(v.mes_reparto), 'reparto']].forEach(function (mk) {
      if (mk[0] === null || mk[0] < 1 || mk[0] > ult) return;
      var tx = x(mk[0]) + 4, derecha = tx > A - 110;
      marcas += '<line x1="' + x(mk[0]) + '" x2="' + x(mk[0]) + '" y1="' + ar + '" y2="' + (H - ab) + '" stroke="#9a7b3f" stroke-dasharray="3 4" stroke-width="1"/>' +
        '<text x="' + (derecha ? x(mk[0]) - 4 : tx) + '" y="' + (ar + 10 + 13 * (fila++ % 3)) + '" font-size="11" fill="#9a7b3f"' + (derecha ? ' text-anchor="end"' : '') + '>' + mk[1] + ' · mes ' + mk[0] + '</text>';
    });
    var ejes = '';
    for (var t = A < 520 ? 12 : 6; t <= ult; t += A < 520 ? 12 : 6) ejes += '<text x="' + x(t) + '" y="' + (H - 10) + '" text-anchor="middle" font-size="11" fill="#766f62">' + t + '</text>';
    return '<section class="p2-grafica" aria-label="Cómo se mueve el dinero"><div class="p2-sobre">Cómo se mueve el dinero · V' + estado.version + ' (MDP por mes)</div>' +
      '<svg viewBox="0 0 ' + A + ' ' + H + '" role="img" aria-label="Dinero ajeno en uso y caja del proyecto por mes">' + rejilla +
      '<path d="' + area + '" fill="#9a7b3f" fill-opacity=".22" stroke="#9a7b3f" stroke-width="1.5"/>' +
      '<path d="' + linea + '" fill="none" stroke="#39744b" stroke-width="2.2"/>' + marcas + ejes + '</svg>' +
      '<div class="p2-leyenda"><span><i style="background:#9a7b3f55;border:1px solid #9a7b3f"></i>Dinero ajeno en uso (banco, capital y respaldo)</span><span><i style="background:#39744b"></i>Caja del proyecto</span><span>Meses desde el arranque</span></div></section>';
  }

  /* pestaña: versiones y reparto */
  function pVersiones() {
    var p = estado.plan, puede = p.puede || {}, V = p.versiones || [];
    var filas = [
      ['Estado', function (x) { return chip(x.estado); }], ['Qué cambia', function (x) { return '<span class="p2-chico">' + esc(x.que_cambia || '') + '</span>'; }],
      ['El dueño recibe', function (x) { return '<b>' + mdp(x.dueno_recibe) + '</b>'; }, 'n'], ['Veces su tierra', function (x) { return veces(x.dueno_veces); }, 'n'],
      ['En cuántos meses', function (x) { return num(x.dueno_meses) || '—'; }, 'n'], ['Ganancia real', function (x) { return mdp(x.ganancia); }, 'n'],
      ['Dinero ajeno máximo', function (x) { return mdp(x.max_ajeno); }, 'n'], ['Capital', function (x) { return mdp(x.capital); }, 'n'],
      ['Banco, saldo máximo', function (x) { return mdp(x.banco_max); }, 'n'], ['Respaldo que faltaría', function (x) { return mdp(x.respaldo); }, 'n'],
      ['Costo del dinero', function (x) { return mdp(x.costo_dinero); }, 'n'], ['Obra', function (x) { return 'mes ' + (x.obra_inicio || '—') + ' a ' + (x.fin_obra || '—'); }, 'n'],
      ['Saldos desde el mes', function (x) { return x.mes_saldos || '—'; }, 'n'], ['Revisión para fondos', function (x) { return esc(x.rv_resultado || '—'); }]
    ];
    var cab = '<tr><th></th>' + V.map(function (x) { return '<th class="n">V' + x.numero + ' · ' + esc(x.nombre || '') + '</th>'; }).join('') + '</tr>';
    var cuerpo = filas.map(function (f) {
      return '<tr' + (f[0] === 'El dueño recibe' ? ' class="fuerte"' : '') + '><td>' + esc(f[0]) + '</td>' + V.map(function (x) { return '<td class="' + (f[2] || '') + '" data-et="V' + x.numero + '">' + f[1](x) + '</td>'; }).join('') + '</tr>';
    }).join('');
    var acciones = '<tr><td></td>' + V.map(function (x) {
      var b = '';
      if (puede.aprobar && x.estado !== 'vigente') b += '<button class="p2-btn verde" data-accion="aprobar" data-v="' + x.numero + '">Aprobar</button> ';
      if (puede.editar && x.estado !== 'vigente' && x.estado !== 'propuesta' && x.estado !== 'base') b += '<button class="p2-btn" data-accion="estado-version" data-v="' + x.numero + '" data-estado="propuesta">Proponer</button> ';
      if (puede.editar && x.estado !== 'vigente' && x.estado !== 'descartada' && x.estado !== 'base') b += '<button class="p2-btn suave" data-accion="estado-version" data-v="' + x.numero + '" data-estado="descartada">Descartar</button>';
      return '<td class="n">' + b + '</td>';
    }).join('') + '</tr>';
    return '<section class="p2-seccion"><h2>Las versiones, lado a lado</h2><p class="p2-tenue">Mismo proyecto, distintas maneras de hacerlo. Cada una se calcula sola en el libro.</p>' +
      '<div class="p2-panel p2-envoltura"><table class="p2-tabla">' + cab + cuerpo + (puede.editar || puede.aprobar ? acciones : '') + '</table></div></section>' +
      reparto() + palancas();
  }
  function reparto() {
    var p = estado.plan, rp = p.reparto || {}, P = rp.parametros || [], R = rp.resultados || [], puede = p.puede || {};
    if (!P.length) return '';
    var nombres = (P[0] || []).slice(1, 6), elegido = Number(rp.esquema) || 2, verRep = Number(rp.version) || estado.version;
    var fila = function (i, f) { return (R[i] || []).slice(1, 6).map(f); };
    var dueno = fila(6, mdp), vec = fila(7, veces), ali = fila(8, mdp), cap = fila(10, mdp);
    var cuerpo = nombres.map(function (n, j) {
      return '<tr' + (j + 1 === elegido ? ' class="fuerte"' : '') + '><td data-et="Esquema">' + esc(n) + (j + 1 === elegido ? ' ' + chip('elegido', 'verde') : '') + '</td>' +
        '<td class="n" data-et="Dueño">' + dueno[j] + '</td><td class="n" data-et="Veces">' + vec[j] + '</td><td class="n" data-et="Alianza">' + ali[j] + '</td><td class="n" data-et="Capital">' + cap[j] + '</td>' +
        '<td class="n" data-et="">' + (puede.editar && j + 1 !== elegido ? '<button class="p2-btn" data-accion="esquema" data-e="' + (j + 1) + '">Elegir</button>' : '') + '</td></tr>';
    }).join('');
    return '<section class="p2-seccion"><h2>Cómo se reparte</h2><p class="p2-tenue">Con el resultado real del flujo de la V' + verRep + ': ventas menos costos, banco y respaldo. El costo del capital sale del flujo y se ajusta a la tasa de cada esquema.</p>' +
      '<div class="p2-panel p2-envoltura"><table class="p2-tabla tarjetas"><thead><tr><th>Esquema</th><th class="n">Dueño recibe</th><th class="n">Veces su tierra</th><th class="n">Alianza</th><th class="n">Capital</th><th></th></tr></thead><tbody>' + cuerpo + '</tbody></table></div></section>';
  }
  function palancas() {
    var p = estado.plan, puede = p.puede || {}, prods = p.productos || [];
    var L = (p.palancas || []).filter(function (x) {
      if (x.calculado) return false;
      var m = /^durante_obra_(\d)$/.exec(x.clave);
      return !m || !!(prods[Number(m[1]) - 1] || {}).nombre;
    }).map(function (x) {
      var m = /^durante_obra_(\d)$/.exec(x.clave);
      if (!m) return x;
      var y = Object.assign({}, x);
      y.concepto = '% pagado durante la obra · ' + prods[Number(m[1]) - 1].nombre;
      return y;
    });
    var formatea = function (x, val) { return x.unidad === '%' ? pct(val) : (x.unidad === 'MDP' ? mdpCorto(val) : (num(val) === null ? esc(val) : fmt(val, x.unidad === '1/0' || x.unidad === 'mes' || x.unidad === 'meses' ? 0 : 2))); };
    var cuerpo = L.map(function (x) {
      return '<tr><td>' + esc(x.concepto) + ' <span class="p2-tenue p2-chico">' + esc(x.unidad) + '</span></td><td class="n" data-et="Base">' + formatea(x, x.base) + '</td>' +
        [0, 1, 2].map(function (k) {
          var vigente = ver(k + 1).estado === 'vigente', edita = puede.editar && (!vigente || puede.aprobar);
          var valor = x.v[k];
          var mostrado = x.unidad === '%' && num(valor) !== null ? Math.round(valor * 10000) / 100 : valor;
          return '<td class="n' + (x.cambia[k] ? ' cambia' : '') + '" data-et="V' + (k + 1) + '">' +
            (edita ? '<input aria-label="' + esc(x.concepto) + ' en V' + (k + 1) + '" data-palanca="' + esc(x.clave) + '" data-v="' + (k + 1) + '" data-unidad="' + esc(x.unidad) + '" value="' + esc(num(mostrado) === null ? '' : mostrado) + '">' +
              (x.cambia[k] ? ' <button class="p2-btn suave p2-chico" title="Volver a la base" data-accion="palanca-base" data-palanca="' + esc(x.clave) + '" data-v="' + (k + 1) + '">↺</button>' : '')
              : formatea(x, valor)) + '</td>';
        }).join('') + '</tr>';
    }).join('');
    return '<section class="p2-seccion"><h2>Las palancas de cada versión</h2><p class="p2-tenue">La base sale de los datos. En azul, lo que cambia cada versión. ' + (puede.editar ? 'Escribe un valor y sal del campo para guardarlo; el libro recalcula.' : '') + ' Los porcentajes se escriben como 20 para 20%.</p>' +
      '<div class="p2-panel p2-envoltura"><table class="p2-tabla tarjetas"><thead><tr><th>Palanca</th><th class="n">Base</th><th class="n">V1</th><th class="n">V2</th><th class="n">V3</th></tr></thead><tbody>' + cuerpo + '</tbody></table></div></section>';
  }

  /* pestaña: preguntas y evidencia */
  function pPreguntas() {
    var p = estado.plan, puede = p.puede || {};
    var sig = (p.preguntas || []).filter(function (q) { return q.siguiente; })[0];
    var tarjeta = sig ? '<section class="p2-pregunta"><div class="p2-sobre">La pregunta que más mueve el plan ahora · ' + esc(sig.id) + ' · ' + esc(sig.modulo) + '</div>' +
      '<p class="p2-texto">' + esc(sig.texto) + '</p>' + (sig.respuesta ? '<p class="p2-tenue p2-chico">Lo que se sabe: ' + esc(sig.respuesta) + '</p>' : '') +
      (puede.editar ? '<textarea data-respuesta="' + esc(sig.id) + '" placeholder="Escribe la respuesta y de dónde sale"></textarea>' +
        '<input class="p2-chico" style="width:100%;border:1px solid #e1dacb;border-radius:10px;padding:8px 10px" data-fuente="' + esc(sig.id) + '" placeholder="Fuente: documento, persona o fecha">' +
        '<div class="p2-acciones"><button class="p2-btn oro" data-accion="responder" data-q="' + esc(sig.id) + '">Guardar respuesta</button>' +
        '<button class="p2-btn" data-accion="nose" data-q="' + esc(sig.id) + '">No se sabe</button>' +
        '<button class="p2-btn" data-accion="investigar" data-q="' + esc(sig.id) + '"><i class="ti ti-search"></i> Investígalo tú</button></div>' : '') +
      '</section>' : '<div class="p2-vacio">No hay preguntas pendientes que muevan el plan.</div>';
    return tarjeta + datos() + candados() + listaPreguntas();
  }
  function datos() {
    var p = estado.plan, puede = p.puede || {};
    var filas = (p.datos || []).map(function (d) {
      return '<tr><td data-et="Dato">' + esc(d.concepto) + '</td><td class="n" data-et="Valor">' + valorDato(d) + '</td><td data-et="Estado">' + chip(d.estado) + '</td>' +
        '<td data-et="Fuente"><span class="p2-chico">' + esc(d.fuente || '') + '</span>' + (d.fecha ? ' <span class="p2-tenue p2-chico">· ' + esc(d.fecha) + '</span>' : '') + '</td>' +
        '<td class="n" data-et="">' + (puede.editar ? '<button class="p2-btn suave" data-accion="editar-dato" data-clave="' + esc(d.clave) + '">Cambiar</button>' : '') + '</td></tr>';
    }).join('');
    return '<section class="p2-seccion"><h2>Los datos y de dónde salen</h2><p class="p2-tenue">Un dato sin fuente es un supuesto. Lo rojo detiene al plan; lo dorado está por confirmar.</p>' +
      '<div class="p2-panel p2-envoltura"><table class="p2-tabla tarjetas"><thead><tr><th>Dato</th><th class="n">Valor</th><th>Estado</th><th>Fuente</th><th></th></tr></thead><tbody>' + filas + '</tbody></table></div></section>';
  }
  function candados() {
    var p = estado.plan, puede = p.puede || {};
    var items = (p.candados || []).map(function (c) {
      return '<li><div><b>' + esc(c.candado) + '</b> ' + chip(c.estado) + '<div class="p2-chico p2-tenue">Lo cierra: ' + esc(c.cierra) + '</div>' +
        (c.evidencia ? '<div class="p2-chico">Evidencia: ' + esc(c.evidencia) + '</div>' : '') + (c.nota ? '<div class="p2-chico p2-tenue">' + esc(c.nota) + '</div>' : '') + '</div>' +
        (puede.editar && c.estado !== 'cerrado' ? '<button class="p2-btn" data-accion="candado" data-id="' + esc(c.id) + '">Actualizar</button>' : '') + '</li>';
    }).join('');
    return '<section class="p2-seccion"><h2>Candados</h2><p class="p2-tenue">Lo que debe estar resuelto antes de presentar el plan a socios.</p><div class="p2-panel"><ul class="p2-lista">' + (items || '<li>Sin candados.</li>') + '</ul></div></section>';
  }
  function listaPreguntas() {
    var p = estado.plan, Q = p.preguntas || [], porModulo = {};
    Q.forEach(function (q) { if (q.estado === 'no aplica') return; (porModulo[q.modulo] = porModulo[q.modulo] || []).push(q); });
    var html = Object.keys(porModulo).map(function (m) {
      var qs = porModulo[m], abiertas = qs.filter(function (q) { return q.prioridad > 0; }).length;
      return '<details class="p2-modulo"><summary><span>' + esc(m) + '</span><span class="p2-tenue p2-chico">' + abiertas + ' de ' + qs.length + ' por resolver</span></summary><ul class="p2-lista">' +
        qs.map(function (q) {
          return '<li><div><span class="p2-tenue p2-chico">' + esc(q.id) + '</span> ' + esc(q.texto) + (q.respuesta ? '<div class="p2-chico p2-tenue">' + esc(q.respuesta) + '</div>' : '') + '</div>' + chip(q.estado) + '</li>';
        }).join('') + '</ul></details>';
    }).join('');
    return '<section class="p2-seccion"><h2>Todas las preguntas del oficio</h2><p class="p2-tenue">Se ordenan por la edad del plan y por cuánto mueven el resultado.</p><div class="p2-panel">' + html + '</div></section>';
  }

  /* pestaña: el autón */
  function pAuton() {
    var p = estado.plan, puede = p.puede || {};
    var hall = (p.hallazgos || []).slice().reverse().map(function (h) {
      return '<li><div><b>' + esc(h.tema) + '</b> ' + chip(h.estado) + ' ' + chip('confianza ' + (h.confianza || '—'), 'gris') + '<div>' + esc(h.hallazgo) + '</div>' +
        '<div class="p2-quien">' + esc(h.fecha) + ' · ' + esc(h.quien) + (h.fuente ? ' · Fuente: ' + (/^https?:\/\//.test(h.fuente) ? '<a href="' + esc(h.fuente) + '" target="_blank" rel="noopener">' + esc(h.fuente) + '</a>' : esc(h.fuente)) : '') + '</div></div>' +
        (puede.editar && h.estado === 'propuesto' ? '<div class="p2-acciones"><button class="p2-btn verde" data-accion="hallazgo" data-fila="' + h.fila + '" data-estado="aceptado">Aceptar</button><button class="p2-btn suave" data-accion="hallazgo" data-fila="' + h.fila + '" data-estado="descartado">Descartar</button></div>' : '') + '</li>';
    }).join('');
    var investigando = (p.preguntas || []).filter(function (q) { return q.estado === 'investigando'; }).map(function (q) { return '<li><div>' + esc(q.texto) + '</div>' + chip('investigando') + '</li>'; }).join('');
    var pr = p.pruebas || [], ultima = pr.length ? pr[pr.length - 1].fecha : '';
    var tabla = pr.filter(function (x) { return x.fecha === ultima; }).map(function (x) {
      return '<tr><td data-et="Escenario">' + esc(x.escenario) + '</td><td class="n" data-et="Banco">' + mdpCorto(x.banco_max) + '</td><td class="n" data-et="Faltaría">' + mdpCorto(x.respaldo) + '</td><td class="n" data-et="Costo del dinero">' + mdpCorto(x.costo_dinero) + '</td><td class="n" data-et="Ganancia">' + mdpCorto(x.ganancia) + '</td><td class="n" data-et="Reparto">' + esc(x.mes_reparto) + '</td></tr>';
    }).join('');
    var sesiones = {};
    (p.consejo || []).forEach(function (c) { var k = (c.fecha || '') + ' · ' + (c.sesion || '') + ' · V' + String(c.version || '').replace(/^V/, ''); (sesiones[k] = sesiones[k] || []).push(c); });
    var consejo = Object.keys(sesiones).reverse().map(function (k) {
      var votos = sesiones[k], si = votos.filter(function (x) { return x.voto === 'aprueba'; }).length, veto = votos.some(function (x) { return x.voto === 'veto'; });
      return '<div class="p2-panel"><h3>Sesión ' + esc(k) + ' · ' + si + ' de ' + votos.length + ' aprueban' + (veto ? ' · con veto' : '') + '</h3><ul class="p2-lista">' +
        votos.map(function (x) { return '<li><div><b>' + esc(x.juez) + '</b> ' + chip(x.voto) + '<div class="p2-chico">' + esc(x.razon) + '</div>' + (x.condicion ? '<div class="p2-chico p2-tenue">Para aprobar: ' + esc(x.condicion) + '</div>' : '') + '</div></li>'; }).join('') + '</ul></div>';
    }).join('');
    return '<section class="p2-seccion"><h2>El autón: el plan que investiga</h2><p class="p2-tenue">El plan trabaja solo: busca lo que falta, prueba qué pasa si algo sale peor y propone versiones. Nada de lo que encuentra cambia un dato hasta que alguien lo acepta.</p>' +
      '<div class="p2-panel"><h3>Hallazgos</h3><ul class="p2-lista">' + (hall || '<li>Todavía no hay hallazgos.</li>') + '</ul></div>' +
      (investigando ? '<div class="p2-panel"><h3>Lo que está investigando</h3><ul class="p2-lista">' + investigando + '</ul></div>' : '') + '</section>' +
      '<section class="p2-seccion"><h2>Pruebas de estrés</h2><p class="p2-tenue">El libro recalcula cada escenario en su columna de prueba y vuelve a dejarla como estaba.' + (ultima ? ' Última corrida: ' + esc(ultima) + '.' : '') + '</p>' +
      (puede.editar ? '<p><button class="p2-btn oro" data-accion="estres"><i class="ti ti-bolt"></i> Correr pruebas sobre la V' + estado.version + '</button></p>' : '') +
      (tabla ? '<div class="p2-panel p2-envoltura"><table class="p2-tabla tarjetas"><thead><tr><th>Escenario</th><th class="n">Banco máx.</th><th class="n">Faltaría</th><th class="n">Costo del dinero</th><th class="n">Ganancia real</th><th class="n">Mes de reparto</th></tr></thead><tbody>' + tabla + '</tbody></table></div>' : '<div class="p2-vacio">Todavía no se corren pruebas.</div>') + '</section>' +
      '<section class="p2-seccion"><h2>El consejo de planes</h2><p class="p2-tenue">Jueces del oficio revisan cada versión antes de que Dirección decida: aprueba con 5 de 7 y un candado abierto puede vetar.</p>' + (consejo || '<div class="p2-vacio">El consejo todavía no se reúne para este plan.</div>') + '</section>';
  }

  function pBitacora() {
    var b = estado.plan.bitacora || [];
    return '<section class="p2-seccion"><h2>Quién cambió qué</h2><div class="p2-panel"><ul class="p2-lista">' +
      (b.map(function (x) {
        return '<li><div><b>' + esc(x.accion) + '</b>' + (x.clave ? ' <span class="p2-tenue p2-chico">' + esc(x.clave) + '</span>' : '') +
          (x.antes || x.despues ? '<div class="p2-chico">' + esc(x.antes || '—') + ' → ' + esc(x.despues || '—') + '</div>' : '') +
          '<div class="p2-quien">' + esc(x.fecha) + ' · ' + esc(x.actor) + (x.fuente ? ' · ' + esc(x.fuente) : '') + '</div></div></li>';
      }).join('') || '<li>Sin movimientos.</li>') + '</ul></div></section>';
  }

  /* ───────── acciones ───────── */
  function abrirDialogo(html) {
    cerrarDialogo();
    var d = document.createElement('div');
    d.className = 'p2-dialogo'; d.id = 'p2Dialogo';
    d.innerHTML = '<div class="p2-caja" role="dialog" aria-modal="true">' + html + '</div>';
    (raiz || document.body).appendChild(d);
    var primero = d.querySelector('input,textarea,select,button');
    if (primero) primero.focus();
  }
  function cerrarDialogo() { var d = document.getElementById('p2Dialogo'); if (d) d.remove(); }

  function enviar(cuerpo, mensaje, ms) {
    if (estado.ocupado) return Promise.resolve();
    estado.ocupado = true;
    if (estado.plan) { cuerpo.plan = estado.planId; cuerpo.rev = estado.plan.rev; }
    // lo que tarda (las pruebas de estrés: el libro recalcula cada escenario) deja el aviso puesto hasta terminar
    if (ms > 60000) toast('Corriendo en el libro… tarda cerca de un minuto; no cierres la página.', true);
    else toast('Guardando en el libro…');
    return escribir(cuerpo, ms).then(function (r) {
      estado.ocupado = false;
      if (!r || !r.ok) {
        var e = (r && r.error) || 'red';
        if (RECHAZOS.indexOf(e) >= 0) { fallo(r); return r; }
        toast(ERRORES[e] || 'No se pudo guardar.');
        if (e === 'revision' && estado.planId) cargarPlan(true);
        return r;
      }
      toast(mensaje || 'Guardado: el libro recalculó.');
      cerrarDialogo();
      if (cuerpo.tipo === 'ppp2-sembrar') { estado.vivero = null; location.hash = '#/plan/' + r.plan_id; return r; }
      if (estado.planId) return cargarPlan(true).then(function () { return r; });
      return r;
    }, function () { estado.ocupado = false; toast('Sin respuesta del servidor; tu cambio puede no haberse guardado. Recarga para revisar.'); });
  }

  function editarDato(claveDato) {
    var d = (estado.plan.datos || []).filter(function (x) { return x.clave === claveDato; })[0];
    if (!d) return;
    var esNumero = ['MDP', '%', 'm²', 'meses', 'mes'].indexOf(d.unidad) >= 0;
    var mostrado = d.unidad === '%' && num(d.valor) !== null ? Math.round(d.valor * 10000) / 100 : d.valor;
    abrirDialogo('<h2>' + esc(d.concepto) + '</h2><form class="p2-form" data-form="dato" data-clave="' + esc(d.clave) + '" data-unidad="' + esc(d.unidad) + '">' +
      '<label>Valor ' + (d.unidad && d.unidad !== 'texto' ? '(' + esc(d.unidad === '%' ? '% · escribe 30 para 30%' : d.unidad) + ')' : '') +
      (esNumero ? '<input name="valor" inputmode="decimal" value="' + esc(mostrado == null ? '' : mostrado) + '">' : '<textarea name="valor" rows="2">' + esc(d.valor || '') + '</textarea>') + '</label>' +
      '<label>Estado<select name="estado">' + ['confirmado', 'supuesto', 'por confirmar', 'en conflicto', 'derivado', 'falta'].map(function (e) { return '<option' + (e === d.estado ? ' selected' : '') + '>' + e + '</option>'; }).join('') + '</select></label>' +
      '<label>Fuente<textarea name="fuente" rows="2">' + esc(d.fuente || '') + '</textarea></label>' +
      '<div class="p2-acciones"><button class="p2-btn oro" type="submit">Guardar</button><button class="p2-btn suave" type="button" data-accion="cerrar">Cancelar</button></div></form>');
  }
  function dialogoCandado(id) {
    var c = (estado.plan.candados || []).filter(function (x) { return x.id === id; })[0];
    if (!c) return;
    abrirDialogo('<h2>' + esc(c.candado) + '</h2><p class="p2-tenue">Lo cierra: ' + esc(c.cierra) + '</p><form class="p2-form" data-form="candado" data-id="' + esc(c.id) + '">' +
      '<label>Estado<select name="estado">' + ['abierto', 'en revisión', 'cerrado', 'no aplica'].map(function (e) { return '<option' + (e === c.estado ? ' selected' : '') + '>' + e + '</option>'; }).join('') + '</select></label>' +
      '<label>Evidencia<textarea name="evidencia" rows="3">' + esc(c.evidencia || '') + '</textarea></label>' +
      '<div class="p2-acciones"><button class="p2-btn oro" type="submit">Guardar</button><button class="p2-btn suave" type="button" data-accion="cerrar">Cancelar</button></div></form>');
  }
  function aNumero(texto, unidad) {
    var t = String(texto == null ? '' : texto).trim().replace(/\s/g, '').replace(/%$/, '');
    if (t === '') return null;
    if (/^-?\d{1,3}(,\d{3})+(\.\d+)?$/.test(t)) t = t.replace(/,/g, '');
    else t = t.replace(',', '.');
    var n = Number(t);
    if (!isFinite(n)) return NaN;
    return unidad === '%' ? n / 100 : n;
  }

  document.addEventListener('click', function (ev) {
    var b = ev.target.closest('[data-accion]');
    if (!b || !raiz.contains(b) && !b.closest('.p2-dialogo')) return;
    var a = b.getAttribute('data-accion');
    if (a === 'entrar') { if (window.YODPortero && window.YODPortero.entrar) window.YODPortero.entrar(); else location.reload(); return; }
    if (a === 'reintentar') { estado.vivero = null; ruta(); return; }
    if (a === 'cerrar') { cerrarDialogo(); return; }
    if (a === 'sembrar') { dialogoSembrar(); return; }
    if (a === 'version') { estado.version = Number(b.getAttribute('data-v')); pintarPlan(); return; }
    var v = Number(b.getAttribute('data-v'));
    if (a === 'aprobar') {
      var x = ver(v);
      abrirDialogo('<h2>¿Volver vigente la V' + v + '?</h2><p><b>' + esc(x.nombre || '') + '</b>: el dueño recibe ' + mdp(x.dueno_recibe) + ' en ' + meses(x.dueno_meses) + '; ganancia real ' + mdp(x.ganancia) + '. ' + esc(x.rv_resultado || '') + '.</p>' +
        '<p class="p2-tenue">Queda tu nombre y la fecha en el libro. Si había otra versión vigente, pasa a alterna.</p>' +
        '<form class="p2-form" data-form="aprobar" data-v="' + v + '"><label>Por qué (opcional)<textarea name="razon" rows="2"></textarea></label>' +
        '<div class="p2-acciones"><button class="p2-btn verde" type="submit">Sí, aprobar</button><button class="p2-btn suave" type="button" data-accion="cerrar">Cancelar</button></div></form>');
      return;
    }
    if (a === 'estado-version') { enviar({ tipo: 'ppp2-version', version: v, campos: { estado: b.getAttribute('data-estado') } }); return; }
    if (a === 'esquema') { enviar({ tipo: 'ppp2-reparto', esquema: Number(b.getAttribute('data-e')) }, 'Esquema elegido: el libro recalculó lo que recibe cada parte.'); return; }
    if (a === 'palanca-base') { enviar({ tipo: 'ppp2-palanca', version: v, clave: b.getAttribute('data-palanca'), valor: null }); return; }
    if (a === 'editar-dato') { editarDato(b.getAttribute('data-clave')); return; }
    if (a === 'candado') { dialogoCandado(b.getAttribute('data-id')); return; }
    if (a === 'hallazgo') { enviar({ tipo: 'ppp2-hallazgo', fila: Number(b.getAttribute('data-fila')), estado: b.getAttribute('data-estado') }); return; }
    if (a === 'estres') {
      if (estado.ocupado) return;
      b.disabled = true;
      b.innerHTML = '<i class="ti ti-loader-2" aria-hidden="true"></i> Corriendo las pruebas… cerca de un minuto';
      enviar({ tipo: 'ppp2-estres', version: estado.version }, 'Pruebas listas: el libro recalculó cada escenario.', 300000)
        .then(function () { if (b.isConnected) { b.disabled = false; b.innerHTML = '<i class="ti ti-bolt"></i> Correr pruebas sobre la V' + estado.version; } });
      return;
    }
    var q = b.getAttribute('data-q');
    if (a === 'responder') {
      var t = document.querySelector('[data-respuesta="' + q + '"]'), f = document.querySelector('[data-fuente="' + q + '"]');
      enviar({ tipo: 'ppp2-responder', pregunta: q, estado: 'respondida', respuesta: t ? t.value : '', fuente: f ? f.value : '' }, 'Respuesta guardada.');
      return;
    }
    if (a === 'nose') { enviar({ tipo: 'ppp2-responder', pregunta: q, estado: 'no se sabe' }, 'Anotado: no se sabe todavía.'); return; }
    if (a === 'investigar') {
      var preg = (estado.plan.preguntas || []).filter(function (x) { return x.id === q; })[0] || {};
      enviar({ tipo: 'ppp2-investigar', pregunta: q, tema: preg.texto || q, detalle: (document.querySelector('[data-respuesta="' + q + '"]') || {}).value || '' }, 'El autón lo investiga y deja lo que encuentre en Hallazgos.');
    }
  });

  document.addEventListener('change', function (ev) {
    var i = ev.target.closest('input[data-palanca]');
    if (!i) return;
    var unidad = i.getAttribute('data-unidad'), n = aNumero(i.value, unidad);
    if (n === null || isNaN(n)) { toast('Escribe un número.'); return; }
    enviar({ tipo: 'ppp2-palanca', version: Number(i.getAttribute('data-v')), clave: i.getAttribute('data-palanca'), valor: n });
  });

  document.addEventListener('submit', function (ev) {
    var f = ev.target.closest('form[data-form]');
    if (!f) return;
    ev.preventDefault();
    var tipo = f.getAttribute('data-form'), d = new FormData(f);
    if (tipo === 'sembrar') {
      var m2 = aNumero(d.get('terreno_m2'), 'm²');
      enviar({ tipo: 'ppp2-sembrar', nombre: d.get('nombre'), ubicacion: d.get('ubicacion'), tipo_proyecto: d.get('tipo'), objetivo: d.get('objetivo'), terreno_m2: isNaN(m2) ? '' : m2 }, 'Plan sembrado.');
      return;
    }
    if (tipo === 'dato') {
      var unidad = f.getAttribute('data-unidad'), crudo = d.get('valor'), valor = crudo;
      if (['MDP', '%', 'm²', 'meses', 'mes'].indexOf(unidad) >= 0) { valor = aNumero(crudo, unidad); if (valor === null) valor = ''; if (isNaN(valor)) { toast('Escribe un número.'); return; } }
      enviar({ tipo: 'ppp2-dato', clave: f.getAttribute('data-clave'), valor: valor, estado: d.get('estado'), fuente: d.get('fuente') });
      return;
    }
    if (tipo === 'candado') { enviar({ tipo: 'ppp2-candado', id: f.getAttribute('data-id'), estado: d.get('estado'), evidencia: d.get('evidencia') }); return; }
    if (tipo === 'aprobar') { enviar({ tipo: 'ppp2-version', version: Number(f.getAttribute('data-v')), campos: { estado: 'vigente' }, razon: d.get('razon') }, 'Versión vigente aprobada.'); }
  });

  document.addEventListener('keydown', function (ev) { if (ev.key === 'Escape') cerrarDialogo(); });
  window.addEventListener('hashchange', ruta);
  window.PPP2 = { estado: estado, recargar: function () { estado.vivero = null; estado.plan = null; ruta(); } };
  ruta();
})();
